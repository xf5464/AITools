export type ConnectionState = "stopped" | "starting" | "ready" | "recovering" | "unauthenticated" | "failed";
export type ReviewStatus = "not_configured" | "blocked_requirements" | "ready" | "blocked_dirty" | "blocked_git_operation" | "queued" | "starting" | "reviewing" | "waiting_for_approval" | "completed" | "interrupted" | "failed" | "stale" | "recovering";
export type ResultClass = "unknown" | "no_findings" | "has_findings" | "inconclusive";
export type ReasoningEffort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max" | "ultra";
export interface ReviewModelConfig { model: string; reasoningEffort: ReasoningEffort }
export interface ReviewModelOption { id: string; displayName: string; supportedReasoningEfforts: ReasoningEffort[]; defaultReasoningEffort?: ReasoningEffort }
export type ReviewTarget = { type: "baseBranch"; branch: string } | { type: "uncommittedChanges" } | { type: "commit"; sha: string } | { type: "custom"; instructions: string };

export interface BranchInfo { name: string; fullName: string; remote: boolean; current: boolean; occupiedBy?: string }
export interface WorktreeInfo { path: string; head?: string; branch?: string; bare: boolean; locked: boolean; prunable: boolean }
export interface RepositorySnapshot {
  canonicalPath: string; branch: string | null; detached: boolean; head: string; shortHead: string;
  dirty: boolean; staged: number; unstaged: number; untracked: number; ahead: number | null; behind: number | null;
  operation: "none" | "merge" | "rebase" | "cherry-pick" | "bisect"; gitCommonDir: string; remoteUrl?: string; repositoryKey: string;
}
export interface RequirementsStatus {
  state: "not_configured" | "valid" | "missing" | "unreadable" | "empty" | "too_large" | "invalid_encoding" | "changed";
  filePath?: string; fileName?: string; sha256?: string; sizeBytes?: number; loadedAt?: string; preview?: string; message?: string;
}
export interface RequirementsSnapshot { path: string; fileName: string; sha256: string; content: string; sizeBytes: number; loadedAt: string }
export interface ReviewRunDto {
  id: string; repositoryId: string; repositoryKey?: string; threadId?: string; turnId?: string; targetType: ReviewTarget["type"];
  branch?: string; baseBranch?: string; headSha: string; dirtyAtStart: boolean; requirementsPath: string;
  requirementsFileName: string; requirementsSha256: string; requirementsSnapshot?: string; status: ReviewStatus;
  resultClass: ResultClass; resultText?: string; partialText?: string; errorText?: string; tokensUsed?: number;
  tokenComplete: boolean; model?: string; reasoningEffort?: ReasoningEffort; startedAt?: string; completedAt?: string; createdAt: string;
}
export interface RepositoryRowDto {
  version: number; id: string; displayName: string; path: string; baseBranch?: string; enabled: boolean;
  snapshot?: RepositorySnapshot; branches: BranchInfo[]; reviewStatus: ReviewStatus; activeRun?: ReviewRunDto;
  latestRun?: ReviewRunDto; repositoryTokens: number; reviewModel: ReviewModelConfig; completedReviewRounds: number; comparisonError?: string; error?: string;
}
export interface DashboardDto {
  version: number; initialized: boolean; connection: ConnectionState; connectionError?: string; requirements: RequirementsStatus;
  repositories: RepositoryRowDto[]; managerTokens: number; todayTokens: number; activeReviews: number; queuedReviews: number;
  concurrency: number; models: ReviewModelOption[]; accountUsage: { supported: boolean; usedPercent?: number; resetsAt?: number; message?: string };
}
export interface ReviewEvent { repositoryId: string; runId: string; type: string; at: string; text?: string; payload?: unknown }
export type TokenGranularity = "day" | "week" | "month";
export interface TokenTrendPoint { period: string; label: string; tokens: number }
export interface TokenTrendDto { granularity: TokenGranularity; points: TokenTrendPoint[]; totalTokens: number }
export interface BranchTokenUsageDto { repositoryKey: string; branch: string; tokens: number }
export interface GoneBranchItemDto { repositoryId: string; repositoryName: string; repositoryPath: string; branch: string; upstream: string; reason?: string }
export interface GoneBranchScanDto { candidates: GoneBranchItemDto[]; skipped: GoneBranchItemDto[]; errors: Array<{ repositoryName: string; message: string }> }
export interface GoneBranchDeleteDto { deleted: GoneBranchItemDto[]; failed: GoneBranchItemDto[] }

export interface CodexReviewManagerApi {
  dashboard(): Promise<DashboardDto>;
  retryConnection(): Promise<DashboardDto>;
  setConcurrency(value: number): Promise<DashboardDto>;
  setBranchReviewModel(repositoryId: string, branch: string, config: ReviewModelConfig): Promise<DashboardDto>;
  addRepository(): Promise<RepositoryRowDto | null>;
  removeRepository(repositoryId: string): Promise<void>;
  renameRepository(repositoryId: string, name: string): Promise<void>;
  refresh(repositoryId?: string): Promise<DashboardDto>;
  refreshBranches(repositoryId: string): Promise<{ repository: RepositoryRowDto; newBranches: string[] }>;
  switchBranch(repositoryId: string, branch: string): Promise<RepositoryRowDto>;
  selectRequirements(): Promise<RequirementsStatus>;
  reloadRequirements(): Promise<RequirementsStatus>;
  requirementsPreview(): Promise<RequirementsStatus>;
  startReview(repositoryId: string, target: ReviewTarget): Promise<ReviewRunDto>;
  interruptReview(runId: string): Promise<void>;
  retryReview(runId: string): Promise<ReviewRunDto>;
  reviewRuns(repositoryId?: string): Promise<ReviewRunDto[]>;
  reviewLogs(repositoryId: string): Promise<ReviewRunDto[]>;
  tokenTrend(granularity: TokenGranularity): Promise<TokenTrendDto>;
  branchTokenUsage(): Promise<BranchTokenUsageDto[]>;
  scanGoneBranches(): Promise<GoneBranchScanDto>;
  deleteGoneBranches(items: Array<{ repositoryId: string; branch: string }>): Promise<GoneBranchDeleteDto>;
  exportDiagnostics(): Promise<string | null>;
  onChanged(listener: (dashboard: DashboardDto) => void): () => void;
  onReviewEvent(listener: (event: ReviewEvent) => void): () => void;
}

declare global { interface Window { reviewManager: CodexReviewManagerApi } }
