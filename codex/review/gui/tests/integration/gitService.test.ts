import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { GitService, normalizeRepositoryAddress, splitRemoteBranch } from "../../src/main/git/GitService";

const cleanup: string[] = [];
afterEach(async () => { await Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });
describe("GitService integration", () => {
  it("parses safe remote comparison branches", () => { expect(splitRemoteBranch("origin/main")).toEqual({ remote: "origin", branch: "main" }); expect(splitRemoteBranch("main")).toBeUndefined(); expect(splitRemoteBranch("origin/-bad")).toBeUndefined(); });
  it("normalizes equivalent repository addresses", () => { expect(normalizeRepositoryAddress("https://GitHub.com/OpenAI/example.git", "C:\\unused")).toBe("github.com/openai/example"); expect(normalizeRepositoryAddress("git@github.com:OpenAI/example.git", "C:\\unused")).toBe("github.com/openai/example"); });
  it("inspects a repository and lets Git carry compatible dirty changes", async () => {
    const root = await mkdtemp(join(tmpdir(), "review-manager-git-")); cleanup.push(root);
    const git = (args: string[]) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
    git(["init", "-b", "main"]); git(["config", "user.name", "Test"]); git(["config", "user.email", "test@example.invalid"]);
    await writeFile(join(root, "file.txt"), "one\n"); git(["add", "file.txt"]); git(["commit", "-m", "initial"]); git(["branch", "feature"]);
    const service = new GitService(); expect(await service.inspect(root)).toMatchObject({ branch: "main", dirty: false, operation: "none" });
    await writeFile(join(root, "file.txt"), "changed\n"); expect(await service.switchBranch(root, "feature")).toMatchObject({ branch: "feature", dirty: true });
    expect((await service.listBranches(root)).map((branch) => branch.name)).toEqual(expect.arrayContaining(["main", "feature"]));
  });

  it("does not report a branch as occupied by its own worktree", async () => {
    const root = await mkdtemp(join(tmpdir(), "review-manager-git-")); cleanup.push(root);
    const worktreeParent = await mkdtemp(join(tmpdir(), "review-manager-worktrees-")); cleanup.push(worktreeParent);
    const git = (args: string[]) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
    git(["init", "-b", "main"]); git(["config", "user.name", "Test"]); git(["config", "user.email", "test@example.invalid"]);
    await writeFile(join(root, "file.txt"), "one\n"); git(["add", "file.txt"]); git(["commit", "-m", "initial"]); git(["branch", "feature"]);
    const featureWorktree = join(worktreeParent, "feature"); git(["worktree", "add", featureWorktree, "feature"]);

    const service = new GitService();
    const mainBranches = await service.listBranches(root);
    expect(mainBranches.find((branch) => branch.name === "main")?.occupiedBy).toBeUndefined();
    expect(mainBranches.find((branch) => branch.name === "feature")?.occupiedBy).toBeTruthy();

    const featureBranches = await service.listBranches(featureWorktree);
    expect(featureBranches.find((branch) => branch.name === "feature")?.occupiedBy).toBeUndefined();
    expect(featureBranches.find((branch) => branch.name === "main")?.occupiedBy).toBeTruthy();
  });

  it("detects and fetches the remote default branch for a single-branch checkout", async () => {
    const source = await mkdtemp(join(tmpdir(), "review-manager-source-")); cleanup.push(source);
    const remote = await mkdtemp(join(tmpdir(), "review-manager-remote-")); cleanup.push(remote);
    const checkout = await mkdtemp(join(tmpdir(), "review-manager-checkout-")); cleanup.push(checkout);
    const git = (cwd: string, args: string[]) => execFileSync("git", args, { cwd, stdio: "pipe" });
    git(source, ["init", "-b", "main"]); git(source, ["config", "user.name", "Test"]); git(source, ["config", "user.email", "test@example.invalid"]);
    await writeFile(join(source, "file.txt"), "one\n"); git(source, ["add", "file.txt"]); git(source, ["commit", "-m", "initial"]); git(source, ["branch", "feature"]);
    git(source, ["clone", "--bare", ".", remote]);
    git(checkout, ["clone", "--single-branch", "--branch", "feature", remote, "."]);

    const service = new GitService();
    expect((await service.inspect(checkout)).repositoryKey).toContain("review-manager-remote-");
    expect((await service.listBranches(checkout)).some((branch) => branch.name === "origin/main")).toBe(false);
    const refreshed = await service.refreshRemoteBranches(checkout);
    expect(refreshed.newBranches).toContain("origin/main");
    const detected = await service.detectComparisonBranch(checkout, "feature", false);
    expect(detected.branch).toBe("origin/main");
    expect(detected.branches.some((branch) => branch.name === "origin/main")).toBe(true);
    expect(await service.switchBranch(checkout, "origin/main")).toMatchObject({ branch: "main" });
  }, 15_000);

  it("finds and safely deletes a local branch whose remote upstream was removed", async () => {
    const source = await mkdtemp(join(tmpdir(), "review-manager-source-")); cleanup.push(source);
    const remote = await mkdtemp(join(tmpdir(), "review-manager-remote-")); cleanup.push(remote);
    const checkout = await mkdtemp(join(tmpdir(), "review-manager-checkout-")); cleanup.push(checkout);
    const git = (cwd: string, args: string[]) => execFileSync("git", args, { cwd, stdio: "pipe" });
    git(source, ["init", "-b", "main"]); git(source, ["config", "user.name", "Test"]); git(source, ["config", "user.email", "test@example.invalid"]);
    await writeFile(join(source, "file.txt"), "one\n"); git(source, ["add", "file.txt"]); git(source, ["commit", "-m", "initial"]); git(source, ["branch", "obsolete"]);
    git(source, ["clone", "--bare", ".", remote]); git(checkout, ["clone", remote, "."]);
    git(checkout, ["switch", "--track", "-c", "obsolete", "origin/obsolete"]); git(checkout, ["switch", "main"]);
    git(remote, ["update-ref", "-d", "refs/heads/obsolete"]);

    const service = new GitService();
    expect(await service.listGoneBranches(checkout)).toContainEqual({ branch: "obsolete", upstream: "origin/obsolete", reason: undefined });
    await service.deleteGoneBranch(checkout, "obsolete");
    expect((await service.listBranches(checkout)).some((branch) => branch.name === "obsolete")).toBe(false);
  }, 15_000);
});
