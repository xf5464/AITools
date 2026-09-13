import { homedir } from "node:os";
import { join } from "node:path";
import { readFile, readdir } from "node:fs/promises";
import type { TurnTokenUsage } from "../appServer/eventNormalizer";

export async function readRolloutTokenUsage(rootTurnId: string, createdAt: string): Promise<TurnTokenUsage | undefined> {
  const sessionsRoot = join(process.env.CODEX_HOME ?? join(homedir(), ".codex"), "sessions");
  const files = await candidateFiles(sessionsRoot, createdAt);
  let combined: TurnTokenUsage | undefined;
  const responseIds = new Set<string>();
  for (const file of files) {
    const content = await readFile(file, "utf8").catch(() => "");
    if (!content.includes(rootTurnId)) continue;
    const usage = parseRolloutTokenUsage(content, rootTurnId, responseIds);
    if (usage) combined = merge(combined, usage, rootTurnId);
  }
  return combined;
}

export function parseRolloutTokenUsage(content: string, rootTurnId: string, responseIds = new Set<string>()): TurnTokenUsage | undefined {
  let combined: TurnTokenUsage | undefined;
  for (const line of content.split(/\r?\n/)) {
    if (!line.includes('"token_usage_record"') || !line.includes(rootTurnId)) continue;
    try {
      const record = JSON.parse(line);
      const payload = record?.type === "token_usage_record" ? record.payload : undefined;
      if (!payload || (payload.root_turn_id ?? payload.turn_id) !== rootTurnId) continue;
      const responseId = String(payload.response_id ?? "");
      if (responseId && responseIds.has(responseId)) continue;
      if (responseId) responseIds.add(responseId);
      const usage = payload.usage;
      const totalTokens = finite(usage?.total_tokens);
      if (totalTokens === undefined) continue;
      combined = merge(combined, { turnId: rootTurnId, totalTokens, inputTokens: finite(usage?.input_tokens), outputTokens: finite(usage?.output_tokens), cachedInputTokens: finite(usage?.cached_input_tokens) }, rootTurnId);
    } catch { /* Ignore partially-written and unrelated JSONL records. */ }
  }
  return combined;
}

async function candidateFiles(sessionsRoot: string, createdAt: string) {
  const start = new Date(createdAt).getTime(), end = Math.min(Date.now(), start + 2 * 86_400_000);
  const directories = new Set<string>();
  for (let time = start - 86_400_000; time <= end + 86_400_000; time += 86_400_000) {
    const date = new Date(time);
    directories.add(join(sessionsRoot, String(date.getFullYear()), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")));
    directories.add(join(sessionsRoot, String(date.getUTCFullYear()), String(date.getUTCMonth() + 1).padStart(2, "0"), String(date.getUTCDate()).padStart(2, "0")));
  }
  const results: string[] = [];
  for (const directory of directories) {
    const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
    results.push(...entries.filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl")).map((entry) => join(directory, entry.name)));
  }
  return results;
}

function finite(value: unknown) { const number = Number(value); return value == null || !Number.isFinite(number) ? undefined : number; }
function sum(left?: number, right?: number) { return left === undefined && right === undefined ? undefined : (left ?? 0) + (right ?? 0); }
function merge(left: TurnTokenUsage | undefined, right: TurnTokenUsage, turnId: string): TurnTokenUsage { if (!left) return right; return { turnId, totalTokens: left.totalTokens + right.totalTokens, inputTokens: sum(left.inputTokens, right.inputTokens), outputTokens: sum(left.outputTokens, right.outputTokens), cachedInputTokens: sum(left.cachedInputTokens, right.cachedInputTokens) }; }
