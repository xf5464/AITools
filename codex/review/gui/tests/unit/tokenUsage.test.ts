import { describe, expect, it } from "vitest";
import { tokenTotal, turnTokenUsage } from "../../src/main/appServer/eventNormalizer";
import { EventEmitter } from "node:events";
import { TokenService } from "../../src/main/tokens/TokenService";

describe("token usage normalization", () => {
  it("reads cumulative and current-turn usage notifications", () => {
    const event = { method: "thread/tokenUsage/updated", params: { threadId: "thread", turnId: "turn", tokenUsage: { total: { totalTokens: 120 }, last: { totalTokens: 45, inputTokens: 30, outputTokens: 15, cachedInputTokens: 4 } } } };
    expect(tokenTotal(event)).toBe(120);
    expect(turnTokenUsage(event)).toEqual({ turnId: "turn", totalTokens: 45, inputTokens: 30, outputTokens: 15, cachedInputTokens: 4 });
  });

  it("reads exact raw response usage", () => {
    expect(turnTokenUsage({ method: "rawResponse/completed", params: { turnId: "turn", responseId: "response", usage: { totalTokens: 81, inputTokens: 60, outputTokens: 21, cachedInputTokens: 10 } } })).toEqual({ turnId: "turn", totalTokens: 81, inputTokens: 60, outputTokens: 21, cachedInputTokens: 10 });
  });

  it("accumulates and deduplicates raw response usage by turn", async () => {
    const client = new EventEmitter(), database = { addTokenSnapshot() {} };
    const service = new TokenService(database as never, client as never);
    const emit = (responseId: string, totalTokens: number) => client.emit("event", { method: "rawResponse/completed", params: { threadId: "thread", turnId: "turn", responseId, usage: { totalTokens } } });
    emit("one", 40); emit("one", 40); emit("two", 15);
    expect(await service.runDelta("thread", undefined, "turn", new Date().toISOString())).toMatchObject({ used: 55, complete: true });
  });
});
