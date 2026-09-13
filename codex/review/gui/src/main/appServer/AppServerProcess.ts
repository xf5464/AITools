import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import { access, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { JsonRpcPeer } from "./JsonRpcPeer";
import type { ConnectionState } from "../../shared/contracts";

export class AppServerProcess extends EventEmitter {
  child?: ChildProcessWithoutNullStreams;
  peer?: JsonRpcPeer;
  state: ConnectionState = "stopped";
  error?: string;
  executablePath?: string;
  private stopping = false;
  async start() {
    if (this.state === "ready" || this.state === "starting") return;
    this.setState("starting"); this.stopping = false;
    try {
      const executable = await findCodexExecutable();
      this.executablePath = executable;
      const child = spawn(executable, ["app-server", "--stdio"], { shell: false, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
      this.child = child; this.peer = new JsonRpcPeer(child);
      let stderr = ""; child.stderr.on("data", (c) => { stderr = `${stderr}${String(c)}`.slice(-8000).replace(/(authorization|token|cookie)\s*[:=]\s*\S+/gi, "$1=[REDACTED]"); });
      await new Promise<void>((resolve, reject) => { child.once("spawn", resolve); child.once("error", reject); });
      await this.peer.request("initialize", { clientInfo: { name: "codex-review-manager", title: "Codex Review Manager", version: "0.1.0" }, capabilities: { experimentalApi: true, requestAttestation: false } }, undefined, 15_000);
      await this.peer.notify("initialized");
      this.setState("ready");
      try {
        const account = await this.peer.request<any>("account/read", { refreshToken: false }, undefined, 15_000);
        if (!account?.account && account?.requiresOpenaiAuth) this.setState("unauthenticated", "Codex 尚未登录");
      } catch {
        // Initialization already proved the stdio connection. Account metadata
        // can time out independently and must not turn a healthy connection red.
      }
      child.once("exit", () => { if (!this.stopping) this.setState("recovering", stderr || "App Server 已退出"); });
    } catch (error) { this.setState("failed", error instanceof Error ? error.message : String(error)); throw error; }
  }
  async stop() { this.stopping = true; this.child?.kill(); this.child = undefined; this.peer = undefined; this.setState("stopped"); }
  private setState(state: ConnectionState, error?: string) { this.state = state; this.error = error; this.emit("state", state); }
}

async function findCodexExecutable(): Promise<string> {
  const configured = process.env.CODEX_EXECUTABLE;
  if (configured && await exists(configured)) return configured;
  if (process.platform === "win32") {
    const base = process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "OpenAI", "Codex", "bin") : undefined;
    if (base) {
      try {
        const directories = await readdir(base, { withFileTypes: true });
        const candidates = await Promise.all(directories.filter((entry) => entry.isDirectory()).map(async (entry) => { const path = join(base, entry.name, "codex.exe"); return { path, modified: await stat(path).then((value) => value.mtimeMs).catch(() => 0) }; }));
        const newest = candidates.filter((candidate) => candidate.modified > 0).sort((a, b) => b.modified - a.modified)[0];
        if (newest) return newest.path;
      } catch { /* Fall through to PATH resolution. */ }
    }
  }
  return "codex";
}

async function exists(path: string) { return access(path).then(() => true).catch(() => false); }
