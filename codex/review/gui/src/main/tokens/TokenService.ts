import { EventEmitter } from "node:events";
import type { AppServerClient } from "../appServer/AppServerClient";
import type { Database } from "../persistence/Database";
import { tokenTotal, turnTokenUsage, type TurnTokenUsage } from "../appServer/eventNormalizer";
import { readRolloutTokenUsage } from "./RolloutTokenReader";

export class TokenService extends EventEmitter {
  private readonly totals = new Map<string, { epoch: number; total: number }>();
  private readonly lastTurnUsage = new Map<string, TurnTokenUsage>();
  private readonly rawTurnUsage = new Map<string, TurnTokenUsage>();
  private readonly responseIds = new Set<string>();
  constructor(private readonly database: Database, client: AppServerClient) { super(); client.on("event", (event) => this.ingest(event)); }
  ingest(event: any) {
    const direct = turnTokenUsage(event);
    if (direct && event?.method === "thread/tokenUsage/updated") this.lastTurnUsage.set(direct.turnId, direct);
    if (direct && event?.method === "rawResponse/completed") {
      const responseId = String(event.params?.responseId ?? ""); if (responseId && this.responseIds.has(responseId)) return; if (responseId) this.responseIds.add(responseId);
      const previous = this.rawTurnUsage.get(direct.turnId); this.rawTurnUsage.set(direct.turnId, previous ? { turnId: direct.turnId, totalTokens: previous.totalTokens + direct.totalTokens, inputTokens: add(previous.inputTokens, direct.inputTokens), outputTokens: add(previous.outputTokens, direct.outputTokens), cachedInputTokens: add(previous.cachedInputTokens, direct.cachedInputTokens) } : direct);
    }
    if (direct) this.emit("turnUsage", direct.turnId, this.usageForTurn(direct.turnId));
    if (event?.method !== "thread/tokenUsage/updated") return;
    const threadId = event.params?.threadId; const total = tokenTotal(event); if (!threadId || total === undefined) return; const previous = this.totals.get(threadId); if (previous?.total === total) return; const next = !previous ? { epoch: 0, total } : total < previous.total ? { epoch: previous.epoch + 1, total } : { ...previous, total }; this.totals.set(threadId, next); const usage = event.params?.tokenUsage?.total ?? event.params?.tokenUsage; this.database.addTokenSnapshot(threadId, event.params?.turnId ?? null, next.epoch, total, usage?.inputTokens, usage?.outputTokens, usage?.cachedInputTokens);
  }
  current(threadId: string) { return this.totals.get(threadId)?.total; }
  usageForTurn(turnId: string) { return this.lastTurnUsage.get(turnId) ?? this.rawTurnUsage.get(turnId); }
  async resolveTurnUsage(turnId: string, createdAt: string) { const direct = this.usageForTurn(turnId); if (direct) return direct; const recovered = await readRolloutTokenUsage(turnId, createdAt); if (recovered) this.rawTurnUsage.set(turnId, recovered); return recovered; }
  async runDelta(threadId: string, before: number | undefined, turnId: string, createdAt: string) { const direct = await this.resolveTurnUsage(turnId, createdAt); const after = this.current(threadId); if (direct) return { before, after, used: direct.totalTokens, complete: true }; return { before, after, used: before === undefined || after === undefined ? undefined : Math.max(0, after - before), complete: before !== undefined && after !== undefined }; }
  getManagerUsage() { return this.database.listReviewRuns().reduce((sum, run) => sum + (run.tokensUsed ?? 0), 0); }
  getTodayUsage() { const day = new Date().toISOString().slice(0, 10); return this.database.listReviewRuns().filter((run) => run.createdAt.startsWith(day)).reduce((sum, run) => sum + (run.tokensUsed ?? 0), 0); }
  getRepositoryBranchUsage(repositoryKey: string | undefined, branch: string | null) { if (!repositoryKey || !branch) return 0; return this.database.listReviewRunsByIdentity(repositoryKey, branch).reduce((sum, run) => sum + (run.tokensUsed ?? 0), 0); }
}

function add(left?: number, right?: number) { return left === undefined && right === undefined ? undefined : (left ?? 0) + (right ?? 0); }
