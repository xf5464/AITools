import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { realpath, stat } from "node:fs/promises";
import { resolve } from "node:path";
import type { BranchInfo, RepositorySnapshot, WorktreeInfo } from "../../shared/contracts";
import { GitOperationError } from "../../shared/errors";
import { parsePorcelainV2 } from "./statusParser";
import { parseWorktreePorcelain } from "./worktreeParser";

const execFileAsync = promisify(execFile);
const gitEnvironment = { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0", GIT_EDITOR: "true" };

export class GitService {
  private async git(cwd: string, args: string[], timeout = 10_000): Promise<string> {
    try { const { stdout } = await execFileAsync("git", args, { cwd, timeout, windowsHide: true, env: gitEnvironment, maxBuffer: 8 * 1024 * 1024 }); return stdout.trimEnd(); }
    catch (error) { const e = error as Error & { stderr?: string }; throw new GitOperationError("git_failed", (e.stderr || e.message).replace(/(https?:\/\/)[^@\s]+@/g, "$1[REDACTED]@")); }
  }
  async canonicalRoot(input: string): Promise<string> { const info = await stat(input).catch(() => null); if (!info?.isDirectory()) throw new GitOperationError("path_invalid", "目录不存在或不可读"); const root = await this.git(input, ["rev-parse", "--show-toplevel"]); const canonical = await realpath(root); return process.platform === "win32" ? canonical[0]?.toUpperCase() + canonical.slice(1) : canonical; }
  async inspect(input: string): Promise<RepositorySnapshot> {
    const canonicalPath = await this.canonicalRoot(input);
    const [status, common, operationDirectoryRaw, remoteUrl] = await Promise.all([this.git(canonicalPath, ["status", "--porcelain=v2", "--branch"]), this.git(canonicalPath, ["rev-parse", "--git-common-dir"]), this.git(canonicalPath, ["rev-parse", "--git-dir"]), this.git(canonicalPath, ["remote", "get-url", "origin"]).catch(() => undefined)]);
    const parsed = parsePorcelainV2(status);
    if (!parsed.head || parsed.head === "(initial)") throw new GitOperationError("git_unborn", "仓库尚无提交，无法审核");
    const gitCommonDir = resolve(canonicalPath, common);
    const operationDirectory = resolve(canonicalPath, operationDirectoryRaw);
    let operation: RepositorySnapshot["operation"] = "none";
    const candidates: Array<[RepositorySnapshot["operation"], string[]]> = [["merge", ["MERGE_HEAD"]], ["rebase", ["rebase-merge", "rebase-apply"]], ["cherry-pick", ["CHERRY_PICK_HEAD"]], ["bisect", ["BISECT_LOG"]]];
    for (const [name, files] of candidates) if (await Promise.any(files.map((file) => stat(resolve(operationDirectory, file)))).then(() => true).catch(() => false)) { operation = name; break; }
    return { canonicalPath, ...parsed, shortHead: parsed.head.slice(0, 7), operation, gitCommonDir, remoteUrl, repositoryKey: normalizeRepositoryAddress(remoteUrl, canonicalPath) };
  }
  async listWorktrees(input: string): Promise<WorktreeInfo[]> { const root = await this.canonicalRoot(input); return parseWorktreePorcelain(await this.git(root, ["worktree", "list", "--porcelain"])); }
  async listBranches(input: string): Promise<BranchInfo[]> {
    const root = await this.canonicalRoot(input);
    const [refs, worktrees, snapshot] = await Promise.all([
      this.git(root, ["for-each-ref", "--format=%(refname)%00%(refname:short)", "refs/heads", "refs/remotes"]), this.listWorktrees(root), this.inspect(root),
    ]);
    const currentPathKey = comparisonPath(root);
    const occupied = new Map(worktrees.filter((w) => w.branch && comparisonPath(w.path) !== currentPathKey).map((w) => [w.branch!, w.path]));
    return refs.split(/\r?\n/).filter(Boolean).map((line) => { const [fullName = "", name = ""] = line.split("\0"); const localName = fullName.replace(/^refs\/heads\//, ""); return { name, fullName, remote: fullName.startsWith("refs/remotes/"), current: snapshot.branch === localName, occupiedBy: occupied.get(localName) }; }).filter((b) => !b.name.endsWith("/HEAD"));
  }
  async fetchComparisonBranch(input: string, branch: string): Promise<void> {
    const target = splitRemoteBranch(branch); if (!target) return;
    const root = await this.canonicalRoot(input);
    const remotes = (await this.git(root, ["remote"])).split(/\r?\n/).filter(Boolean);
    if (!remotes.includes(target.remote)) throw new GitOperationError("remote_missing", `远程仓库不存在：${target.remote}`);
    await this.git(root, ["fetch", "--no-tags", target.remote, `refs/heads/${target.branch}:refs/remotes/${target.remote}/${target.branch}`], 120_000);
  }
  async refreshRemoteBranches(input: string): Promise<{ branches: BranchInfo[]; newBranches: string[] }> {
    const root = await this.canonicalRoot(input), before = await this.listBranches(root);
    const remotes = (await this.git(root, ["remote"])).split(/\r?\n/).filter(Boolean);
    if (!remotes.length) throw new GitOperationError("remote_missing", "仓库没有配置远程地址");
    const errors: string[] = [];
    for (const remote of remotes) {
      try { await this.git(root, ["config", "--replace-all", `remote.${remote}.fetch`, `+refs/heads/*:refs/remotes/${remote}/*`]); await this.git(root, ["fetch", "--no-tags", "--prune", remote], 120_000); }
      catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
    }
    if (errors.length === remotes.length) throw new GitOperationError("remote_fetch_failed", errors[0] ?? "远程分支刷新失败");
    const branches = await this.listBranches(root), known = new Set(before.filter((branch) => branch.remote).map((branch) => branch.fullName));
    return { branches, newBranches: branches.filter((branch) => branch.remote && !known.has(branch.fullName)).map((branch) => branch.name) };
  }
  async detectComparisonBranch(input: string, currentBranch: string | null, refreshRemotes = true): Promise<{ branch?: string; branches: BranchInfo[]; error?: string }> {
    const root = await this.canonicalRoot(input);
    let branches = await this.listBranches(root), lastError: string | undefined;
    if (refreshRemotes) { try { branches = (await this.refreshRemoteBranches(root)).branches; } catch (error) { lastError = error instanceof Error ? error.message : String(error); } }
    const remotes = (await this.git(root, ["remote"])).split(/\r?\n/).filter(Boolean).sort((a, b) => Number(b === "origin") - Number(a === "origin"));
    for (const remote of remotes) {
      let candidate: string | undefined;
      try { candidate = (await this.git(root, ["symbolic-ref", "--short", `refs/remotes/${remote}/HEAD`])).replace(/^remotes\//, ""); } catch { /* A single-branch clone often has no local remote HEAD. */ }
      if (!candidate) {
        try { const output = await this.git(root, ["ls-remote", "--symref", remote, "HEAD"], 30_000); const match = /^ref:\s+refs\/heads\/(.+)\s+HEAD$/m.exec(output); if (match?.[1]) candidate = `${remote}/${match[1]}`; }
        catch (error) { lastError = error instanceof Error ? error.message : String(error); }
      }
      if (!candidate) continue;
      try { await this.fetchComparisonBranch(root, candidate); branches = await this.listBranches(root); try { const target = splitRemoteBranch(candidate)!; await this.git(root, ["symbolic-ref", `refs/remotes/${target.remote}/HEAD`, `refs/remotes/${candidate}`]); } catch { /* The fetched ref remains usable without the convenience symbolic ref. */ } }
      catch (error) { lastError = error instanceof Error ? error.message : String(error); }
      if (candidate !== currentBranch && branches.some((branch) => branch.name === candidate)) return { branch: candidate, branches };
    }
    const fallback = ["origin/main", "origin/master", "main", "master"].find((candidate) => candidate !== currentBranch && branches.some((branch) => branch.name === candidate));
    if (fallback) return { branch: fallback, branches };
    return { branches, error: lastError ? `无法识别或获取远程主干：${lastError}` : "未找到远程默认分支或 main/master 主干" };
  }
  async switchBranch(input: string, branch: string, reviewActive = false): Promise<RepositorySnapshot> {
    const before = await this.inspect(input);
    if (reviewActive) throw new GitOperationError("review_active", "审核进行中，不能切换分支");
    if (before.operation !== "none") throw new GitOperationError("git_operation_active", `当前正在进行 ${before.operation}`);
    const branches = await this.listBranches(input);
    let target = branches.find((b) => b.name === branch || b.fullName === branch || (!b.remote && b.fullName === `refs/heads/${branch}`));
    if (!target) throw new GitOperationError("branch_missing", "目标分支不存在");
    if (target.remote) {
      const remote = splitRemoteBranch(target.name); if (!remote) throw new GitOperationError("branch_invalid", "远程分支名无效");
      const local = branches.find((candidate) => !candidate.remote && candidate.name === remote.branch);
      if (local) target = local;
      else { await this.git(before.canonicalPath, ["switch", "--track", "-c", remote.branch, target.name], 30_000); return this.inspect(before.canonicalPath); }
    }
    if (target.occupiedBy) throw new GitOperationError("branch_occupied", `该分支已被工作树占用：${target.occupiedBy}`);
    await this.git(before.canonicalPath, ["switch", branch], 30_000);
    return this.inspect(before.canonicalPath);
  }
  async listGoneBranches(input: string, refreshRemotes = true): Promise<Array<{ branch: string; upstream: string; reason?: string }>> {
    const root = await this.canonicalRoot(input);
    if (refreshRemotes) await this.refreshRemoteBranches(root);
    const [localRefs, remoteRefsOutput, branches] = await Promise.all([
      this.git(root, ["for-each-ref", "--format=%(refname:short)%00%(upstream)", "refs/heads"]),
      this.git(root, ["for-each-ref", "--format=%(refname)", "refs/remotes"]),
      this.listBranches(root),
    ]);
    const remoteRefs = new Set(remoteRefsOutput.split(/\r?\n/).filter(Boolean));
    const branchState = new Map(branches.filter((branch) => !branch.remote).map((branch) => [branch.name, branch]));
    return localRefs.split(/\r?\n/).filter(Boolean).flatMap((line) => {
      const [branch = "", upstream = ""] = line.split("\0");
      if (!branch || !upstream || remoteRefs.has(upstream)) return [];
      const state = branchState.get(branch);
      const reason = state?.current ? "当前分支" : state?.occupiedBy ? `被工作树占用：${state.occupiedBy}` : undefined;
      return [{ branch, upstream: upstream.replace(/^refs\/remotes\//, ""), reason }];
    });
  }
  async deleteGoneBranch(input: string, branch: string): Promise<void> {
    const gone = (await this.listGoneBranches(input, false)).find((item) => item.branch === branch);
    if (!gone) throw new GitOperationError("branch_not_gone", `分支不是远程已删除的本地分支：${branch}`);
    if (gone.reason) throw new GitOperationError("branch_in_use", `${branch} 无法删除：${gone.reason}`);
    await this.git(await this.canonicalRoot(input), ["branch", "--delete", "--", branch], 30_000);
  }
}

function comparisonPath(path: string) { const normalized = resolve(path).replace(/[\\/]+$/, ""); return process.platform === "win32" ? normalized.replace(/\\/g, "/").toLowerCase() : normalized; }

export function normalizeRepositoryAddress(remoteUrl: string | undefined, canonicalPath: string) {
  let value = remoteUrl?.trim();
  if (!value) return `local:${comparisonPath(canonicalPath)}`;
  const scp = value.includes("://") ? null : /^(?:[^@/\s]+@)?([^:/\s]+):(.+)$/.exec(value);
  if (scp && !/^[A-Za-z]:[\\/]/.test(value)) value = `${scp[1]}/${scp[2]}`;
  else {
    try { const url = new URL(value); value = url.protocol === "file:" ? url.pathname : `${url.hostname}${url.pathname}`; }
    catch { /* Local-path and non-URL remotes remain valid repository identities. */ }
  }
  return value.replace(/\\/g, "/").replace(/\/+$/, "").replace(/\.git$/i, "").toLowerCase();
}

export function splitRemoteBranch(value: string): { remote: string; branch: string } | undefined {
  const separator = value.indexOf("/"); if (separator <= 0) return undefined;
  const remote = value.slice(0, separator), branch = value.slice(separator + 1);
  if (!/^[A-Za-z0-9._-]+$/.test(remote) || remote.startsWith("-") || !branch || branch.startsWith("-") || branch.includes("..") || branch.includes("\\")) return undefined;
  return { remote, branch };
}
