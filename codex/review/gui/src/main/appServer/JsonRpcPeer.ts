import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { AppError } from "../../shared/errors";

type Message = { id?: number | string; method?: string; params?: any; result?: any; error?: any };
type Listener = (message: Message) => void;

export class JsonRpcPeer {
  private nextId = 1;
  private readonly pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void; timer: NodeJS.Timeout; abort?: () => void }>();
  private readonly listeners = new Set<Listener>();
  private writeQueue = Promise.resolve();
  constructor(private readonly process: ChildProcessWithoutNullStreams, private readonly timeoutMs = 30_000, private readonly maxFrameBytes = 8 * 1024 * 1024) {
    createInterface({ input: process.stdout }).on("line", (line) => this.receive(line));
    process.once("exit", (code) => this.rejectAll(new AppError("app_server_exited", `Codex App Server 已退出 (${code ?? "unknown"})`)));
  }
  request<T>(method: string, params?: unknown, signal?: AbortSignal, timeoutMs = this.timeoutMs): Promise<T> {
    if (signal?.aborted) return Promise.reject(signal.reason);
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new AppError("rpc_timeout", `${method} 请求超时`)); }, timeoutMs);
      const abort = signal ? () => { clearTimeout(timer); this.pending.delete(id); reject(signal.reason ?? new Error("aborted")); } : undefined;
      signal?.addEventListener("abort", abort!, { once: true });
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject, timer, abort });
      this.send({ method, id, params }).catch(reject);
    });
  }
  notify(method: string, params?: unknown) { return this.send(params === undefined ? { method } : { method, params }); }
  subscribe(listener: Listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  private async send(message: Message) { const frame = `${JSON.stringify(message)}\n`; if (Buffer.byteLength(frame) > this.maxFrameBytes) throw new AppError("rpc_frame_too_large", "JSON-RPC 帧过大"); this.writeQueue = this.writeQueue.then(() => new Promise<void>((resolve, reject) => this.process.stdin.write(frame, (error) => error ? reject(error) : resolve()))); return this.writeQueue; }
  private receive(line: string) {
    if (Buffer.byteLength(line) > this.maxFrameBytes) { this.listeners.forEach((l) => l({ method: "client/error", params: { code: "frame_too_large" } })); return; }
    let message: Message;
    try { message = JSON.parse(line); } catch { this.listeners.forEach((l) => l({ method: "client/error", params: { code: "invalid_json" } })); return; }
    if (message.id !== undefined && ("result" in message || "error" in message)) { const id = Number(message.id); const pending = this.pending.get(id); if (!pending) return; clearTimeout(pending.timer); this.pending.delete(id); message.error ? pending.reject(new AppError("rpc_error", message.error.message ?? JSON.stringify(message.error), message.error)) : pending.resolve(message.result); return; }
    if (message.id !== undefined && message.method) { this.send({ id: message.id, result: { decision: "decline" } }).catch(() => {}); }
    this.listeners.forEach((listener) => listener(message));
  }
  private rejectAll(error: Error) { for (const value of this.pending.values()) { clearTimeout(value.timer); value.reject(error); } this.pending.clear(); }
}
