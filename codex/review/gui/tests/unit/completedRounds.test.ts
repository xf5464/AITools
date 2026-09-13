import { describe, expect, it } from "vitest";
import { countsAsCompletedReviewRound } from "../../src/main/reviews/completedRounds";

describe("completed review rounds", () => {
  it("counts only turns that returned a complete result", () => {
    expect(countsAsCompletedReviewRound("completed")).toBe(true);
    expect(countsAsCompletedReviewRound("stale")).toBe(true);
    expect(countsAsCompletedReviewRound("failed")).toBe(false);
    expect(countsAsCompletedReviewRound("interrupted")).toBe(false);
    expect(countsAsCompletedReviewRound("reviewing")).toBe(false);
    expect(countsAsCompletedReviewRound("queued")).toBe(false);
  });
});
