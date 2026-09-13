import { describe, expect, it } from "vitest";
import type { ReviewRunDto } from "../../src/shared/contracts";
import { buildBranchTokenUsage, buildTokenTrend } from "../../src/main/tokens/tokenTrend";

function run(createdAt: string, tokensUsed: number): ReviewRunDto {
  return { id: createdAt, repositoryId: "repo", targetType: "baseBranch", headSha: "abc", dirtyAtStart: false, requirementsPath: "rules.md", requirementsFileName: "rules.md", requirementsSha256: "hash", status: "completed", resultClass: "no_findings", tokensUsed, tokenComplete: true, createdAt };
}

describe("buildTokenTrend", () => {
  it("fills missing days and sums runs in the same day", () => {
    const trend = buildTokenTrend([run("2026-09-12T01:00:00+08:00", 100), run("2026-09-12T08:00:00+08:00", 50)], "day", new Date("2026-09-13T12:00:00+08:00"));
    expect(trend.points).toHaveLength(30);
    expect(trend.points.at(-2)?.tokens).toBe(150);
    expect(trend.points.at(-1)?.tokens).toBe(0);
    expect(trend.totalTokens).toBe(150);
  });

  it("creates twelve continuous week and month buckets", () => {
    expect(buildTokenTrend([], "week", new Date("2026-09-13T12:00:00+08:00")).points).toHaveLength(12);
    expect(buildTokenTrend([], "month", new Date("2026-09-13T12:00:00+08:00")).points).toHaveLength(12);
  });

  it("groups branch usage by repository address and branch", () => {
    const first = { ...run("2026-09-12T01:00:00+08:00", 100), repositoryKey: "https://example/a.git", branch: "main" };
    const second = { ...run("2026-09-12T02:00:00+08:00", 50), repositoryKey: "https://example/a.git", branch: "main" };
    const other = { ...run("2026-09-12T03:00:00+08:00", 80), repositoryKey: "https://example/b.git", branch: "main" };
    expect(buildBranchTokenUsage([first, second, other])).toEqual([
      { repositoryKey: "https://example/a.git", branch: "main", tokens: 150 },
      { repositoryKey: "https://example/b.git", branch: "main", tokens: 80 },
    ]);
  });
});
