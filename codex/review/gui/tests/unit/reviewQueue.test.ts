import { describe, expect, it } from "vitest";
import { ReviewQueue } from "../../src/main/reviews/ReviewQueue";

describe("ReviewQueue concurrency limit", () => {
  it("releases queued work immediately when the limit increases", async () => {
    const queue = new ReviewQueue(1);
    const releaseFirst = await queue.acquire();
    let secondStarted = false;
    const second = queue.acquire().then((release) => { secondStarted = true; return release; });
    await Promise.resolve();
    expect(queue.queuedCount).toBe(1);
    queue.setConcurrency(2);
    const releaseSecond = await second;
    expect(secondStarted).toBe(true);
    expect(queue.activeCount).toBe(2);
    releaseSecond(); releaseFirst();
    expect(queue.activeCount).toBe(0);
  });
  it("clamps the limit to 1 through 4", () => { const queue = new ReviewQueue(99); expect(queue.concurrency).toBe(4); queue.setConcurrency(0); expect(queue.concurrency).toBe(1); });
});
