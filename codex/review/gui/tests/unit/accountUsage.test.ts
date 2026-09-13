import { describe, expect, it } from "vitest";
import { accountUsageFromNotification, accountUsageFromResponse } from "../../src/main/tokens/accountUsage";

describe("account usage normalization", () => {
  it("reads the backward-compatible rate limit bucket", () => {
    expect(accountUsageFromResponse({ rateLimits: { primary: { usedPercent: 8, resetsAt: 123 } } })).toEqual({ supported: true, usedPercent: 8, resetsAt: 123 });
  });

  it("falls back to the codex bucket in the multi-bucket response", () => {
    expect(accountUsageFromResponse({ rateLimits: null, rateLimitsByLimitId: { codex: { primary: { usedPercent: 9, resetsAt: null } } } })).toEqual({ supported: true, usedPercent: 9 });
  });

  it("reads rolling account updates", () => {
    expect(accountUsageFromNotification({ method: "account/rateLimits/updated", params: { rateLimits: { primary: { usedPercent: 10, resetsAt: 456 } } } })).toEqual({ supported: true, usedPercent: 10, resetsAt: 456 });
  });
});
