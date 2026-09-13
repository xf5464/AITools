import { EventEmitter } from "node:events";
import { AppError } from "../../shared/errors";
import { AppServerProcess } from "./AppServerProcess";

export class AppServerClient extends EventEmitter {
  readonly process = new AppServerProcess();
  private unsubscribe?: () => void;
  private restartAttempts = 0;
  private recoveryScheduled = false;
  private stopping = false;
  private crashTimes: number[] = [];
  constructor() { super(); this.process.on("state", () => { this.emit("state", this.process.state); if (this.process.state === "recovering") this.scheduleRecovery(); }); }
  async start() { this.stopping = false; await this.process.start(); if (!this.process.peer) throw new AppError("app_server_unavailable", "App Server 不可用"); this.unsubscribe?.(); this.unsubscribe = this.process.peer.subscribe((event) => this.emit("event", event)); if (this.process.state === "ready") this.restartAttempts = 0; }
  async stop() { this.stopping = true; await this.process.stop(); }
  request<T>(method: string, params?: unknown, signal?: AbortSignal, timeoutMs?: number): Promise<T> { if (!this.process.peer || this.process.state !== "ready") return Promise.reject(new AppError("app_server_unavailable", "Codex App Server 未连接")); return this.process.peer.request<T>(method, params, signal, timeoutMs); }
  private scheduleRecovery() {
    if (this.stopping || this.recoveryScheduled) return;
    const now = Date.now(); this.crashTimes = this.crashTimes.filter((time) => now - time < 60_000); this.crashTimes.push(now);
    if (this.crashTimes.length > 3 || this.restartAttempts >= 3) return;
    const delays = [1_000, 2_000, 5_000]; const delay = delays[this.restartAttempts++] ?? 5_000; this.recoveryScheduled = true;
    setTimeout(() => { this.recoveryScheduled = false; this.start().catch(() => this.scheduleRecovery()); }, delay);
  }
}
