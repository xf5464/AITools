import { describe, expect, it } from "vitest";
import { branchModel, configuredModel, DEFAULT_MCP_MODEL, DEFAULT_REVIEW_MODEL } from "../../src/main/persistence/modelSettings";

describe("model settings", () => {
  it("uses the requested defaults", () => {
    expect(configuredModel(undefined, DEFAULT_REVIEW_MODEL)).toEqual({ model: "gpt-5.6-sol", reasoningEffort: "medium" });
    expect(configuredModel(undefined, DEFAULT_MCP_MODEL)).toEqual({ model: "gpt-5.6-luna", reasoningEffort: "max" });
  });

  it("uses the review default for branches without an override", () => {
    const defaultModel = { model: "gpt-6-astra", reasoningEffort: "xhigh" as const };
    expect(branchModel(undefined, defaultModel)).toEqual(defaultModel);
    expect(branchModel({ model: "gpt-5.6-sol", reasoningEffort: "high" }, defaultModel)).toEqual({ model: "gpt-5.6-sol", reasoningEffort: "high" });
  });
});
