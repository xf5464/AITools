import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { dirname, join, resolve } from "node:path";
import process from "node:process";

const root = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/(.:)/, "$1")), "..");
const reportPath = join(root, "docs", "phase-0a-report.json");
const requirementPath = join(root, "tests", "fixtures", "probe-review-requirements.md");
const testDirectory = resolve(process.argv[2] ?? join(root, "tests", "fixtures", "probe-repo"));
const FIRST = `RM_REQUIREMENTS_${Date.now()}_A`;
const SECOND = `RM_REQUIREMENTS_${Date.now()}_B`;

function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", shell: false });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

class Peer {
  constructor() {
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Set();
  }

  async start() {
    this.child = spawn("codex", ["app-server"], { cwd: testDirectory, stdio: ["pipe", "pipe", "pipe"], shell: false });
    this.stderr = "";
    this.child.stderr.on("data", (chunk) => { this.stderr += String(chunk).replace(/(token|authorization|cookie)[^\s]*/gi, "$1=[REDACTED]"); });
    createInterface({ input: this.child.stdout }).on("line", (line) => this.#receive(line));
    this.child.once("exit", (code) => {
      for (const { reject, timer } of this.pending.values()) { clearTimeout(timer); reject(new Error(`app-server exited (${code})`)); }
      this.pending.clear();
    });
    await new Promise((resolveReady, reject) => {
      this.child.once("spawn", resolveReady);
      this.child.once("error", reject);
    });
  }

  #receive(line) {
    let message;
    try { message = JSON.parse(line); } catch { return; }
    if (message.id !== undefined && ("result" in message || "error" in message)) {
      const item = this.pending.get(message.id);
      if (!item) return;
      clearTimeout(item.timer);
      this.pending.delete(message.id);
      message.error ? item.reject(new Error(JSON.stringify(message.error))) : item.resolve(message.result);
      return;
    }
    if (message.id !== undefined && message.method) {
      this.send({ id: message.id, result: { decision: "decline" } });
      return;
    }
    for (const listener of this.listeners) listener(message);
  }

  send(value) { this.child.stdin.write(`${JSON.stringify(value)}\n`); }

  request(method, params, timeoutMs = 120_000) {
    const id = this.nextId++;
    return new Promise((resolveRequest, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`${method} timed out`)); }, timeoutMs);
      this.pending.set(id, { resolve: resolveRequest, reject, timer });
      this.send({ method, id, params });
    });
  }

  notify(method, params) { this.send(params === undefined ? { method } : { method, params }); }
  subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  async stop() { if (!this.child?.killed) this.child.kill(); await new Promise((r) => setTimeout(r, 300)); }
}

async function initialize(peer) {
  const result = await peer.request("initialize", {
    clientInfo: { name: "codex-review-manager-probe", title: "Codex Review Manager Probe", version: "0.1.0" },
    capabilities: { experimentalApi: true, requestAttestation: false },
  }, 30_000);
  peer.notify("initialized");
  return result;
}

async function waitForTurn(peer, turnId, marker) {
  let text = "";
  let evidence = "";
  let reviewText = "";
  let started = false;
  let tokenEvent = false;
  return await new Promise((resolveWait, reject) => {
    const timer = setTimeout(() => { off(); reject(new Error(`turn ${turnId} timed out; text=${text}`)); }, 180_000);
    const off = peer.subscribe((message) => {
      if (message?.params?.turnId === turnId || message?.params?.turn?.id === turnId) evidence += JSON.stringify(message);
      if (message?.method === "turn/started" && message.params?.turn?.id === turnId) started = true;
      if (message?.method === "item/agentMessage/delta" && message.params?.turnId === turnId) text += message.params.delta ?? "";
      if (message?.method === "item/completed" && message.params?.turnId === turnId && message.params?.item?.type === "exitedReviewMode") reviewText = message.params.item.review ?? "";
      if (message?.method === "thread/tokenUsage/updated" && message.params?.turnId === turnId) tokenEvent = true;
      if (message?.method === "turn/completed" && message.params?.turn?.id === turnId) {
        clearTimeout(timer); off();
        resolveWait({ started, completed: true, tokenEvent, text, reviewText, evidence, markerSeen: `${text}${reviewText}`.includes(marker), status: message.params.turn.status });
      }
    });
  });
}

async function startAndWait(peer, method, params, marker) {
  let buffered = [];
  const off = peer.subscribe((message) => buffered.push(message));
  const response = await peer.request(method, params);
  const turnId = response.turn.id;
  const early = buffered.find((m) => m?.method === "turn/completed" && m.params?.turn?.id === turnId);
  off();
  if (early) return { started: true, completed: true, tokenEvent: buffered.some((m) => m?.method === "thread/tokenUsage/updated" && m.params?.turnId === turnId), text: buffered.filter((m) => m?.method === "item/agentMessage/delta" && m.params?.turnId === turnId).map((m) => m.params.delta ?? "").join(""), markerSeen: buffered.some((m) => JSON.stringify(m).includes(marker)), status: early.params.turn.status, turnId };
  return { ...(await waitForTurn(peer, turnId, marker)), turnId };
}

async function main() {
  await mkdir(dirname(requirementPath), { recursive: true });
  await mkdir(dirname(reportPath), { recursive: true });
  await mkdir(testDirectory, { recursive: true });
  try {
    const top = resolve(run("git", ["rev-parse", "--show-toplevel"], testDirectory));
    if (top.toLowerCase() !== testDirectory.toLowerCase()) throw new Error("nested in another repository");
  } catch {
    run("git", ["init", "-b", "main"], testDirectory);
    run("git", ["config", "user.name", "Codex Review Manager Probe"], testDirectory);
    run("git", ["config", "user.email", "probe@example.invalid"], testDirectory);
    await writeFile(join(testDirectory, "probe.txt"), "probe fixture\n", "utf8");
    run("git", ["add", "probe.txt"], testDirectory);
    run("git", ["commit", "-m", "probe fixture"], testDirectory);
  }
  const codexVersion = run("codex", ["--version"]);
  run("codex", ["app-server", "generate-ts", "--out", join(root, "schemas", "generated")]);
  run("codex", ["app-server", "generate-json-schema", "--out", join(root, "schemas", "json")]);
  const schema = await readFile(join(root, "schemas", "json", "codex_app_server_protocol.v2.schemas.json"));
  const report = {
    phase: "0A", codexVersion, schemaGenerated: true,
    schemaSha256: createHash("sha256").update(schema).digest("hex"), transport: "stdio",
    testDirectory, initialize: "failed", account: "unknown", threadStart: "failed", turnStart: "failed",
    streaming: "failed", reviewRequirementsInjection: "failed", requirementsReloadOnEveryRun: "failed",
    tokenEvents: "not-observed", resumeAfterRestart: "failed", result: "failed", testedAt: new Date().toISOString(),
  };
  let peer = new Peer();
  try {
    await peer.start();
    report.initializeResponse = await initialize(peer);
    report.initialize = "passed";
    const account = await peer.request("account/read", { refreshToken: false }, 30_000);
    report.account = account?.account ? "authenticated" : (account?.requiresOpenaiAuth ? "unauthenticated" : "not-required");
    try { const limits = await peer.request("account/rateLimits/read", undefined, 30_000); const primary = limits?.rateLimits?.primary; report.rateLimits = { supported: Boolean(primary), usedPercentAvailable: Number.isFinite(primary?.usedPercent), resetTimeAvailable: Number.isFinite(primary?.resetsAt) }; } catch (error) { report.rateLimits = { supported: false, reason: String(error) }; }
    try {
      const usage = await peer.request("account/usage/read", {}, 30_000);
      report.accountUsage = { supported: true, summaryAvailable: Boolean(usage?.summary), dailyBucketsAvailable: Array.isArray(usage?.dailyUsageBuckets) };
    } catch (error) { report.accountUsage = { supported: false, reason: String(error) }; }
    const started = await peer.request("thread/start", { cwd: testDirectory, approvalPolicy: "never", sandbox: "read-only", serviceName: "codex-review-manager", ephemeral: false });
    const threadId = started.thread.id;
    report.threadId = threadId;
    report.threadStart = "passed";
    await peer.request("thread/name/set", { threadId, name: `[Review Manager Probe] ${Date.now()}` });
    const marker = `RM_PROBE_OK_${Date.now()}`;
    const turnPromise = peer.request("turn/start", { threadId, cwd: testDirectory, approvalPolicy: "never", sandboxPolicy: { type: "readOnly", networkAccess: false }, input: [{ type: "text", text: `仅回复：${marker}。不要读取或修改文件。`, text_elements: [] }] });
    const turnResponse = await turnPromise;
    const turnResult = await waitForTurn(peer, turnResponse.turn.id, marker);
    report.turnStart = turnResult.completed ? "passed" : "failed";
    report.streaming = turnResult.markerSeen ? "passed" : "failed";
    if (turnResult.tokenEvent) report.tokenEvents = "passed";

    await writeFile(requirementPath, `# Probe requirements\n\nWhen the review finishes, include this exact marker: ${FIRST}\n`, "utf8");
    const reqA = await readFile(requirementPath, "utf8");
    const reviewAResponse = await peer.request("review/start", { threadId, delivery: "inline", target: { type: "custom", instructions: `Review only probe.txt in this tiny repository. Do not inspect parent directories and do not modify files. Include the required marker in the final review.\n\n${reqA}` } });
    const reviewA = await waitForTurn(peer, reviewAResponse.turn.id, FIRST);
    report.reviewRequirementsInjection = reviewA.markerSeen ? "passed" : "failed";
    if (reviewA.tokenEvent) report.tokenEvents = "passed";

    await writeFile(requirementPath, `# Probe requirements updated\n\nWhen the review finishes, include this exact marker: ${SECOND}\n`, "utf8");
    const reqB = await readFile(requirementPath, "utf8");
    const reviewBResponse = await peer.request("review/start", { threadId, delivery: "inline", target: { type: "custom", instructions: `Review only probe.txt in this tiny repository. Do not inspect parent directories and do not modify files. Include the required marker in the final review.\n\n${reqB}` } });
    const reviewB = await waitForTurn(peer, reviewBResponse.turn.id, SECOND);
    report.requirementsReloadOnEveryRun = reviewB.markerSeen && !reviewB.evidence.includes(FIRST) ? "passed" : "failed";
    if (reviewB.tokenEvent) report.tokenEvents = "passed";

    await peer.stop();
    peer = new Peer();
    await peer.start();
    await initialize(peer);
    const resumed = await peer.request("thread/resume", { threadId, cwd: testDirectory, approvalPolicy: "never", sandbox: "read-only", excludeTurns: true });
    report.resumeAfterRestart = resumed?.thread?.id === threadId ? "passed" : "failed";
    report.result = [report.initialize, report.threadStart, report.turnStart, report.streaming, report.reviewRequirementsInjection, report.requirementsReloadOnEveryRun, report.resumeAfterRestart].every((x) => x === "passed") ? "passed" : "failed";
  } catch (error) {
    report.error = String(error?.stack ?? error);
  } finally {
    await peer.stop().catch(() => {});
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }
  console.log(JSON.stringify(report, null, 2));
  if (report.result !== "passed") process.exitCode = 1;
}

await main();
