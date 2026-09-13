import { basename } from "node:path";
import { writeFile } from "node:fs/promises";
import { BrowserWindow, dialog, ipcMain } from "electron";
import type { DashboardDto, GoneBranchDeleteDto, GoneBranchItemDto, GoneBranchScanDto, ReasoningEffort, RepositoryRowDto, ReviewModelOption, ReviewTarget } from "../../shared/contracts";
import type { AppServerClient } from "../appServer/AppServerClient";
import type { GitService } from "../git/GitService";
import type { Database } from "../persistence/Database";
import type { ReviewRequirementsService } from "../requirements/ReviewRequirementsService";
import type { ReviewService } from "../reviews/ReviewService";
import type { TokenService } from "../tokens/TokenService";
import { accountUsageFromNotification, accountUsageFromResponse } from "../tokens/accountUsage";
import { buildBranchTokenUsage, buildTokenTrend } from "../tokens/tokenTrend";
import { branchSchema, concurrencySchema, displayNameSchema, goneBranchDeleteSchema, idSchema, reviewModelConfigSchema, targetSchema, tokenGranularitySchema } from "./schemas";

export class ApplicationController {
  private version = 0;
  private initialized = false;
  private readonly snapshots = new Map<string, Awaited<ReturnType<GitService["inspect"]>>>();
  private readonly branches = new Map<string, Awaited<ReturnType<GitService["listBranches"]>>>();
  private readonly errors = new Map<string, string>();
  private readonly comparisonErrors = new Map<string, string>();
  private readonly comparisonBranches = new Map<string, string>();
  private models: ReviewModelOption[] = [{ id: "gpt-5.6-sol", displayName: "GPT-5.6 Sol", supportedReasoningEfforts: ["low", "medium", "high", "xhigh", "max", "ultra"] }];
  accountUsage: DashboardDto["accountUsage"] = { supported: false, message: "正在读取账户用量" };
  private accountRead?: Promise<void>;
  private accountRefreshTimer?: NodeJS.Timeout;
  constructor(readonly db: Database, readonly git: GitService, readonly requirements: ReviewRequirementsService, readonly reviews: ReviewService, readonly tokens: TokenService, readonly appServer: AppServerClient) {
    this.appServer.on("event", (event) => {
      const usage = accountUsageFromNotification(event);
      if (!usage) return;
      this.accountUsage = usage;
      void this.broadcast();
    });
  }
  async initialize() { await this.reviews.recover(); await this.refresh(); this.initialized = true; await this.broadcast(); this.startAccountUsageRefresh(); void this.refreshAccountUsage(); void this.loadModels(); }
  async loadModels() { try { const result = await this.appServer.request<any>("model/list", { includeHidden: false, limit: 100 }, undefined, 30_000); const models = (result?.data ?? []).map((model: any) => ({ id: String(model.model ?? model.id), displayName: String(model.displayName ?? model.model ?? model.id), supportedReasoningEfforts: (model.supportedReasoningEfforts ?? []).map((option: any) => String(option.reasoningEffort)) as ReasoningEffort[], defaultReasoningEffort: model.defaultReasoningEffort ? String(model.defaultReasoningEffort) as ReasoningEffort : undefined })).filter((model: ReviewModelOption) => model.id); if (models.length) this.models = models; } catch { /* Keep the safe default when the local catalog is unavailable. */ } await this.broadcast(); }
  async refresh(repositoryId?: string, refreshRemotes = true) {
    const repositories = repositoryId ? [this.db.getRepository(repositoryId)].filter(Boolean) : this.db.listRepositories();
    await Promise.all(repositories.map(async (repository) => {
      if (!repository) return;
      try {
        const snapshot = await this.git.inspect(repository.canonical_path);
        const detected = await this.git.detectComparisonBranch(repository.canonical_path, snapshot.branch, refreshRemotes);
        this.snapshots.set(repository.id, snapshot); this.branches.set(repository.id, detected.branches); this.errors.delete(repository.id); this.comparisonErrors.delete(repository.id); this.comparisonBranches.delete(repository.id);
        if (detected.branch) this.comparisonBranches.set(repository.id, detected.branch); else this.comparisonErrors.set(repository.id, detected.error ?? "未识别到主干分支");
      } catch (error) { this.errors.set(repository.id, error instanceof Error ? error.message : String(error)); }
    }));
    this.version += 1; return this.dashboard();
  }
  async dashboard(): Promise<DashboardDto> {
    const requirementStatus = await this.requirements.getStatus();
    const repositories: RepositoryRowDto[] = this.db.listRepositories().map((repository) => { const localRuns = this.db.listReviewRuns(repository.id), active = localRuns.find((run) => ["starting","reviewing","recovering"].includes(run.status)), queued = this.reviews.isRepositoryQueued(repository.id), snapshot = this.snapshots.get(repository.id), branches = this.branches.get(repository.id) ?? [], branch = snapshot?.branch ?? null, identityRuns = snapshot?.repositoryKey && branch ? this.db.listReviewRunsByIdentity(snapshot.repositoryKey, branch) : [], latest = identityRuns[0], baseBranch = this.comparisonBranches.get(repository.id); const reviewStatus = queued ? "queued" : active?.status ?? (requirementStatus.state === "not_configured" ? "not_configured" : requirementStatus.state !== "valid" && requirementStatus.state !== "changed" ? "blocked_requirements" : latest?.status ?? "ready"); return { version: this.version, id: repository.id, displayName: repository.display_name, path: repository.canonical_path, baseBranch, enabled: Boolean(repository.enabled), snapshot, branches, reviewStatus, activeRun: active, latestRun: latest, repositoryTokens: this.tokens.getRepositoryBranchUsage(snapshot?.repositoryKey, branch), reviewModel: this.db.getBranchReviewConfig(repository.id, branch), completedReviewRounds: this.db.completedReviewRounds(snapshot?.repositoryKey, branch), comparisonError: this.comparisonErrors.get(repository.id), error: this.errors.get(repository.id) }; });
    return { version: this.version, initialized: this.initialized, connection: this.appServer.process.state, connectionError: this.appServer.process.error, requirements: requirementStatus, repositories, managerTokens: this.tokens.getManagerUsage(), todayTokens: this.tokens.getTodayUsage(), activeReviews: this.reviews.queue.activeCount, queuedReviews: this.reviews.queue.queuedCount, concurrency: this.reviews.queue.concurrency, models: this.models, accountUsage: this.accountUsage };
  }
  async addRepository(path: string) { const snapshot = await this.git.inspect(path); const existing = this.db.listRepositories().find((r) => r.canonical_path.toLowerCase() === snapshot.canonicalPath.toLowerCase()); if (existing) return this.row(existing.id); const repository = this.db.addRepository(snapshot.canonicalPath, basename(snapshot.canonicalPath), snapshot.gitCommonDir); await this.refresh(repository.id); return this.row(repository.id); }
  async refreshBranches(id: string) { const repository = this.db.getRepository(id); if (!repository) throw new Error("目录不存在"); const result = await this.git.refreshRemoteBranches(repository.canonical_path); await this.refresh(id, false); return { repository: await this.row(id), newBranches: result.newBranches }; }
  async row(id: string) { return (await this.dashboard()).repositories.find((row) => row.id === id)!; }
  reviewLogs(id: string) {
    const snapshot = this.snapshots.get(id);
    if (!snapshot?.branch) return [];
    return this.db.listReviewRunsByIdentity(snapshot.repositoryKey, snapshot.branch)
      .filter((run) => ["completed", "stale"].includes(run.status) && Boolean(run.resultText));
  }
  async scanGoneBranches(): Promise<GoneBranchScanDto> {
    const candidates: GoneBranchItemDto[] = [], skipped: GoneBranchItemDto[] = [], errors: GoneBranchScanDto["errors"] = [];
    const seenGitDirectories = new Set<string>();
    for (const repository of this.db.listRepositories()) {
      try {
        const snapshot = this.snapshots.get(repository.id) ?? await this.git.inspect(repository.canonical_path);
        const gitDirectoryKey = snapshot.gitCommonDir.replace(/\\/g, "/").toLowerCase();
        if (seenGitDirectories.has(gitDirectoryKey)) continue;
        seenGitDirectories.add(gitDirectoryKey);
        const items = await this.git.listGoneBranches(repository.canonical_path, true);
        for (const item of items) {
          const dto = { repositoryId: repository.id, repositoryName: repository.display_name, repositoryPath: repository.canonical_path, ...item };
          (item.reason ? skipped : candidates).push(dto);
        }
      } catch (error) { errors.push({ repositoryName: repository.display_name, message: error instanceof Error ? error.message : String(error) }); }
    }
    return { candidates, skipped, errors };
  }
  async deleteGoneBranches(items: Array<{ repositoryId: string; branch: string }>): Promise<GoneBranchDeleteDto> {
    const deleted: GoneBranchItemDto[] = [], failed: GoneBranchItemDto[] = [];
    for (const item of items) {
      const repository = this.db.getRepository(item.repositoryId);
      const base = { repositoryId: item.repositoryId, repositoryName: repository?.display_name ?? "未知目录", repositoryPath: repository?.canonical_path ?? "", branch: item.branch, upstream: "未知" };
      if (!repository) { failed.push({ ...base, reason: "目录记录不存在" }); continue; }
      try {
        const gone = (await this.git.listGoneBranches(repository.canonical_path, false)).find((candidate) => candidate.branch === item.branch);
        const detail = { ...base, upstream: gone?.upstream ?? "未知" };
        await this.git.deleteGoneBranch(repository.canonical_path, item.branch);
        deleted.push(detail);
      } catch (error) { failed.push({ ...base, reason: error instanceof Error ? error.message : String(error) }); }
    }
    await this.refresh(undefined, false);
    return { deleted, failed };
  }
  async broadcast() { const dto = await this.dashboard(); BrowserWindow.getAllWindows().forEach((window) => window.webContents.send("manager:changed", dto)); }
  refreshAccountUsage() {
    if (this.accountRead) return this.accountRead;
    this.accountRead = this.readAccountWithRetry().finally(() => { this.accountRead = undefined; });
    return this.accountRead;
  }
  private startAccountUsageRefresh() {
    if (this.accountRefreshTimer) return;
    this.accountRefreshTimer = setInterval(() => { if (this.appServer.process.state === "ready") void this.refreshAccountUsage(); }, 30_000);
    this.accountRefreshTimer.unref();
  }
  private async readAccountWithRetry() {
    let lastError = "账户未返回用量窗口";
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const result = await this.appServer.request<any>("account/rateLimits/read", undefined, undefined, 30_000);
        const usage = accountUsageFromResponse(result);
        if (usage) { this.accountUsage = usage; await this.broadcast(); return; }
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
    this.accountUsage = { supported: false, message: `读取失败：${lastError}` };
    await this.broadcast();
  }
}


export function registerHandlers(controller: ApplicationController) {
  ipcMain.handle("dashboard:get", () => controller.dashboard());
  ipcMain.handle("appServer:retry", async () => { await controller.appServer.stop(); await controller.appServer.start(); await Promise.all([controller.loadModels(), controller.refreshAccountUsage()]); const dashboard = await controller.dashboard(); await controller.broadcast(); return dashboard; });
  ipcMain.handle("settings:setConcurrency", async (_event, value) => { const concurrency = concurrencySchema.parse(value); controller.db.setSetting("globalConcurrency", concurrency); controller.reviews.setConcurrency(concurrency); await controller.broadcast(); return controller.dashboard(); });
  ipcMain.handle("settings:setBranchReviewModel", async (_event, repositoryId, branch, value) => { const id = idSchema.parse(repositoryId), parsedBranch = branchSchema.parse(branch), config = reviewModelConfigSchema.parse(value); if (!controller.db.getRepository(id)) throw new Error("目录记录不存在"); controller.db.saveBranchReviewConfig(id, parsedBranch, config); await controller.broadcast(); return controller.dashboard(); });
  ipcMain.handle("repositories:add", async () => { const result = await dialog.showOpenDialog({ properties: ["openDirectory"] }); if (result.canceled || !result.filePaths[0]) return null; const row = await controller.addRepository(result.filePaths[0]); await controller.broadcast(); return row; });
  ipcMain.handle("repositories:remove", async (_event, id) => { controller.db.removeRepository(idSchema.parse(id)); await controller.broadcast(); });
  ipcMain.handle("repositories:rename", async (_event, id, name) => { controller.db.renameRepository(idSchema.parse(id), displayNameSchema.parse(name)); await controller.broadcast(); });
  ipcMain.handle("repositories:refresh", async (_event, id) => { if (id) idSchema.parse(id); const dto = await controller.refresh(id); await controller.broadcast(); return dto; });
  ipcMain.handle("branches:refresh", async (_event, id) => { const result = await controller.refreshBranches(idSchema.parse(id)); await controller.broadcast(); return result; });
  ipcMain.handle("branches:switch", async (_event, id, branch) => { idSchema.parse(id); branchSchema.parse(branch); const repository = controller.db.getRepository(id); if (!repository) throw new Error("目录不存在"); await controller.git.switchBranch(repository.canonical_path, branch, controller.reviews.isRepositoryActive(id)); await controller.refresh(id); await controller.broadcast(); return controller.row(id); });
  ipcMain.handle("requirements:select", async () => { const result = await dialog.showOpenDialog({ properties: ["openFile"], filters: [{ name: "审核要求", extensions: ["md", "txt"] }] }); if (result.canceled || !result.filePaths[0]) return controller.requirements.getStatus(); const configured = await controller.requirements.configure(result.filePaths[0]); await controller.broadcast(); return configured; });
  ipcMain.handle("requirements:reload", async () => { const result = await controller.requirements.reload(); await controller.broadcast(); return result; });
  ipcMain.handle("requirements:preview", () => controller.requirements.previewCurrent());
  ipcMain.handle("reviews:start", async (_event, id, target) => { idSchema.parse(id); const parsed = targetSchema.parse(target) as ReviewTarget; const run = await controller.reviews.enqueue(id, parsed); await controller.broadcast(); return run; });
  ipcMain.handle("reviews:interrupt", async (_event, id) => { idSchema.parse(id); await controller.reviews.interrupt(id); });
  ipcMain.handle("reviews:retry", async (_event, id) => controller.reviews.retry(idSchema.parse(id)));
  ipcMain.handle("reviews:list", (_event, id) => controller.db.listReviewRuns(id ? idSchema.parse(id) : undefined));
  ipcMain.handle("reviews:logs", (_event, id) => controller.reviewLogs(idSchema.parse(id)));
  ipcMain.handle("tokens:trend", (_event, granularity) => buildTokenTrend(controller.db.listReviewRuns(), tokenGranularitySchema.parse(granularity)));
  ipcMain.handle("tokens:branchUsage", () => buildBranchTokenUsage(controller.db.listReviewRuns()));
  ipcMain.handle("branches:gone:scan", () => controller.scanGoneBranches());
  ipcMain.handle("branches:gone:delete", async (_event, items) => { const result = await controller.deleteGoneBranches(goneBranchDeleteSchema.parse(items)); await controller.broadcast(); return result; });
  ipcMain.handle("diagnostics:export", async () => { const result = await dialog.showSaveDialog({ defaultPath: `codex-review-manager-diagnostics-${new Date().toISOString().slice(0,10)}.json`, filters: [{ name: "JSON", extensions: ["json"] }] }); if (result.canceled || !result.filePath) return null; const dashboard = await controller.dashboard(); const safe = { generatedAt: new Date().toISOString(), appVersion: "0.1.0", connection: dashboard.connection, connectionError: dashboard.connectionError, requirements: { state: dashboard.requirements.state, fileName: dashboard.requirements.fileName, sha256: dashboard.requirements.sha256 }, repositories: dashboard.repositories.map((row) => ({ id: row.id, displayName: row.displayName, branch: row.snapshot?.branch, head: row.snapshot?.head, dirty: row.snapshot?.dirty, operation: row.snapshot?.operation, reviewStatus: row.reviewStatus, error: row.error })), runs: controller.db.listReviewRuns().map((run) => ({ ...run, requirementsSnapshot: undefined, requirementsPath: "[REDACTED]", resultText: undefined, partialText: undefined })) }; await writeFile(result.filePath, `${JSON.stringify(safe, null, 2)}\n`, "utf8"); return result.filePath; });
  controller.reviews.on("event", (event) => BrowserWindow.getAllWindows().forEach((window) => window.webContents.send("review:event", event)));
  controller.reviews.on("changed", () => void controller.broadcast());
  controller.appServer.on("state", (state) => state === "ready" ? void controller.refreshAccountUsage() : void controller.broadcast());
}
