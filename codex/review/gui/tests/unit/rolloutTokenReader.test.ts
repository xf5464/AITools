import { describe, expect, it } from "vitest";
import { parseRolloutTokenUsage } from "../../src/main/tokens/RolloutTokenReader";

describe("rollout token usage", () => {
  it("sums child review responses by root turn and deduplicates response ids", () => {
    const first = JSON.stringify({ type: "token_usage_record", payload: { root_turn_id: "root", response_id: "one", usage: { input_tokens: 100, output_tokens: 10, cached_input_tokens: 20, total_tokens: 110 } } });
    const duplicate = first;
    const second = JSON.stringify({ type: "token_usage_record", payload: { root_turn_id: "root", response_id: "two", usage: { input_tokens: 50, output_tokens: 5, cached_input_tokens: 30, total_tokens: 55 } } });
    const unrelated = JSON.stringify({ type: "token_usage_record", payload: { root_turn_id: "other", response_id: "three", usage: { total_tokens: 999 } } });
    expect(parseRolloutTokenUsage([first, duplicate, second, unrelated].join("\n"), "root")).toEqual({ turnId: "root", totalTokens: 165, inputTokens: 150, outputTokens: 15, cachedInputTokens: 50 });
  });
});
