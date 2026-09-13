import { describe, expect, it } from "vitest";
import { giteaReviewQueryUrlSchema } from "../../src/main/ipc/schemas";

describe("Gitea review query URL setting", () => {
  it("accepts full query URLs and supports clearing the setting", () => {
    const query = "https://gitea.company.com/api/v1/repos/issues/search?state=open&type=pulls&review_requested=true";
    expect(giteaReviewQueryUrlSchema.parse(query)).toBe(query);
    expect(giteaReviewQueryUrlSchema.parse("  ")).toBe("");
  });

  it("rejects non-web schemes, incomplete addresses and embedded credentials", () => {
    expect(giteaReviewQueryUrlSchema.safeParse("ssh://git@gitea.company.com/team/project").success).toBe(false);
    expect(giteaReviewQueryUrlSchema.safeParse("gitea.company.com/api/v1/repos/issues/search").success).toBe(false);
    expect(giteaReviewQueryUrlSchema.safeParse("https://user:password@gitea.company.com/api/v1/repos/issues/search").success).toBe(false);
    expect(giteaReviewQueryUrlSchema.safeParse("https://gitea.company.com/api/v1/repos/issues/search?token=secret").success).toBe(false);
  });
});
