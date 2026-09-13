import { EventEmitter } from "node:events";
import type { RepositorySnapshot, ReviewEvent, ReviewRunDto, ReviewTarget } from "../../shared/contracts";
import { AppError } from "../../shared/errors";
import type { AppServerClient } from "../appServer/AppServerClient";
import { completedReviewText } from "../appServer/eventNormalizer";
import type { ProtocolAdapter } from "../appServer/ProtocolAdapter";
import type { GitService } from "../git/GitService";
import type { Database } from "../persistence/Database";
import type { ReviewRequirementsService } from "../requirements/ReviewRequirementsService";
import type { SessionRegistry } from "../sessions/SessionRegistry";
import type { TokenService } from "../tokens/TokenService";
import { ReviewQueue } from "./ReviewQueue";

export class ReviewService extends EventEmitter {
  readonly queue: ReviewQueue;
  private readonly active = new Map<string, { runId: string; repositoryId: string; threadId: string; turnId: string; snapshot: RepositorySnapshot; tokensBefore?: number; release(): void; text: string; result?: string }>();
  private readonly repositoryLocks = new Set<string>();
  private readonly queuedRepositories = new Set<string>();
  constructor(private readonly db: Database, private readonly git: GitService, private readonly requirements: ReviewRequirementsService, private readonly sessions: SessionRegistry, private readonly client: AppServerClient, private readonly protocol: ProtocolAdapter, private readonly tokens: TokenService, concurrency = 1) {
    super(); this.queue = new ReviewQueue(concurrency); client.on("event", (event) => this.onServerEvent(event)); tokens.on("turnUsage", (turnId: string) => this.backfillTurnUsage(turnId));
  }
  isRepositoryActive(repositoryId: string) { return this.repositoryLocks.has(repositoryId); }
  isRepositoryQueued(repositoryId: string) { return this.queuedRepositories.has(repositoryId); }
  setConcurrency(value: number) { this.queue.setConcurrency(value); this.emit("changed"); }
  async enqueue(repositoryId: string, target: ReviewTarget): Promise<ReviewRunDto> {
    if (this.repositoryLocks.has(repositoryId)) throw new AppError("review_already_active", "该目录已有审核正在进行或排队");
    this.repositoryLocks.add(repositoryId);
    this.queuedRepositories.add(repositoryId); this.emit("changed");
    const release = await this.queue.acquire(); this.queuedRepositories.delete(repositoryId); this.emit("changed");
    try { return await this.start(repositoryId, target, release); } catch (error) { release(); this.repositoryLocks.delete(repositoryId); throw error; }
  }
  private async start(repositoryId: string, target: ReviewTarget, release: () => void): Promise<ReviewRunDto> {
    const repository = this.db.getRepository(repositoryId); if (!repository) throw new AppError("repository_missing", "目录记录不存在");
    const snapshot = await this.git.inspect(repository.canonical_path);
    if (snapshot.operation !== "none") throw new AppError("git_operation_active", `当前正在进行 ${snapshot.operation}`);
    if (target.type === "baseBranch" && !target.branch) throw new AppError("base_branch_missing", "请选择基础分支");
    if (target.type === "baseBranch" && target.branch === snapshot.branch) throw new AppError("base_branch_is_current", "基础分支不能与当前分支相同");
    const requirements = await this.requirements.loadRequiredSnapshot();
    const reviewModel = this.db.getBranchReviewConfig(repositoryId, snapshot.branch);
    const session = await this.sessions.resolve(repository, reviewModel);
    const before = this.tokens.current(session.thread_id);
    let run = this.db.createReviewRun({ repositoryId, repositoryKey: snapshot.repositoryKey, target, branch: snapshot.branch, baseBranch: target.type === "baseBranch" ? target.branch : repository.base_branch, headSha: snapshot.head, dirty: snapshot.dirty, requirements, model: reviewModel, tokensBefore: before });
    this.emitChanged(repositoryId, run.id, "starting", "已读取并保存审核要求快照");
    const response = await this.client.request<any>("review/start", { threadId: session.thread_id, delivery: "inline", target: this.protocol.createReviewTarget(target, snapshot, requirements) }, undefined, 120_000);
    const turnId = response.turn.id;
    this.db.updateReviewRun(run.id, { thread_id: session.thread_id, turn_id: turnId, status: "reviewing", started_at: new Date().toISOString() });
    this.active.set(turnId, { runId: run.id, repositoryId, threadId: session.thread_id, turnId, snapshot, tokensBefore: before, release, text: "" });
    this.emitChanged(repositoryId, run.id, "reviewing", "审核已开始");
    run = this.db.getReviewRun(run.id)!;
    return run;
  }
  async interrupt(runId: string) { const active = [...this.active.values()].find((entry) => entry.runId === runId); if (!active) throw new AppError("review_not_active", "审核当前未运行"); await this.client.request("turn/interrupt", { threadId: active.threadId, turnId: active.turnId }); }
  async retry(runId: string) { const prior = this.db.getReviewRun(runId); if (!prior) throw new AppError("review_missing", "审核记录不存在"); const target = prior.targetType === "baseBranch" ? { type: "baseBranch" as const, branch: prior.baseBranch! } : prior.targetType === "commit" ? { type: "commit" as const, sha: prior.headSha } : { type: prior.targetType as "uncommittedChanges" }; return this.enqueue(prior.repositoryId, target); }
  async recover() {
    for (const run of this.db.listReviewRuns().filter((r) => ["starting","reviewing","waiting_for_approval","recovering"].includes(r.status))) this.db.updateReviewRun(run.id, { status: "interrupted", error_code: "app_restarted", error_text: "应用重启时审核尚未结束，已按中断处理并保留部分输出", completed_at: new Date().toISOString() });
    for (const run of this.db.listReviewRuns().filter((r) => r.turnId && !r.tokenComplete)) { const usage = await this.tokens.resolveTurnUsage(run.turnId!, run.createdAt); if (usage) this.db.updateReviewRun(run.id, { tokens_used: usage.totalTokens, token_complete: 1 }); }
  }
  private onServerEvent(event: any) {
    const turnId = event?.params?.turnId ?? event?.params?.turn?.id;
    const active = turnId ? this.active.get(turnId) : undefined; if (!active) return;
    if (event.method === "item/agentMessage/delta") { active.text += event.params.delta ?? ""; this.db.updateReviewRun(active.runId, { partial_text: active.text }); this.emitChanged(active.repositoryId, active.runId, "delta", event.params.delta); }
    const review = completedReviewText(event); if (review !== undefined) { active.result = review; this.db.updateReviewRun(active.runId, { result_text: review, partial_text: active.text }); this.emitChanged(active.repositoryId, active.runId, "result", review); }
    if (event.method === "turn/completed") void this.finish(active, event.params.turn.status, event.params.turn.error);
  }
  private async finish(active: { runId: string; repositoryId: string; threadId: string; turnId: string; snapshot: RepositorySnapshot; tokensBefore?: number; release(): void; text: string; result?: string }, turnStatus: string, error?: any) {
    const run = this.db.getReviewRun(active.runId)!;
    const delta = await this.tokens.runDelta(active.threadId, active.tokensBefore, active.turnId, run.createdAt);
    let status: "completed" | "interrupted" | "failed" | "stale" = turnStatus === "completed" ? "completed" : turnStatus === "interrupted" ? "interrupted" : "failed";
    try { const current = await this.git.inspect(active.snapshot.canonicalPath); if (status === "completed" && (current.head !== active.snapshot.head || current.branch !== active.snapshot.branch || current.dirty !== active.snapshot.dirty)) status = "stale"; } catch {}
    const resultText = active.result ?? active.text;
    const resultClass = status === "completed" || status === "stale" ? (resultText ? "inconclusive" : "unknown") : "inconclusive";
    this.db.updateReviewRun(active.runId, { status, result_class: resultClass, result_text: resultText || null, partial_text: active.text || null, error_code: error ? "turn_failed" : null, error_text: error ? JSON.stringify(error) : null, tokens_after: delta.after ?? null, tokens_used: delta.used ?? null, token_complete: delta.complete ? 1 : 0, completed_at: new Date().toISOString() });
    this.active.delete(active.turnId); this.repositoryLocks.delete(active.repositoryId); active.release(); this.emitChanged(active.repositoryId, active.runId, status, resultText);
  }
  private backfillTurnUsage(turnId: string) { const usage = this.tokens.usageForTurn(turnId), run = this.db.getReviewRunByTurnId(turnId); if (!usage || !run || !["completed","stale"].includes(run.status)) return; this.db.updateReviewRun(run.id, { tokens_used: usage.totalTokens, token_complete: 1 }); this.emitChanged(run.repositoryId, run.id, "tokens", `${usage.totalTokens}`); }
  private emitChanged(repositoryId: string, runId: string, type: string, text?: string) { const event: ReviewEvent = { repositoryId, runId, type, at: new Date().toISOString(), text }; this.emit("event", event); this.emit("changed"); }
}
