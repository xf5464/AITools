import type { ReviewStatus } from "../../shared/contracts";

export function countsAsCompletedReviewRound(status: ReviewStatus): boolean {
  return status === "completed" || status === "stale";
}
