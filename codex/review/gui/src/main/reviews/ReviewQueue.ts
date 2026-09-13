export class ReviewQueue {
  private active = 0;
  private readonly waiting: Array<(release: () => void) => void> = [];
  private limit: number;
  constructor(concurrency = 1) { this.limit = Math.max(1, Math.min(4, concurrency)); }
  get concurrency() { return this.limit; }
  setConcurrency(value: number) { this.limit = Math.max(1, Math.min(4, Math.trunc(value))); this.drain(); }
  get activeCount() { return this.active; }
  get queuedCount() { return this.waiting.length; }
  async acquire(): Promise<() => void> {
    if (this.active < this.limit) { this.active += 1; return this.createRelease(); }
    return new Promise<() => void>((resolve) => this.waiting.push(resolve));
  }
  private createRelease() { let released = false; return () => { if (released) return; released = true; this.active -= 1; this.drain(); }; }
  private drain() { while (this.active < this.limit && this.waiting.length) { const next = this.waiting.shift()!; this.active += 1; next(this.createRelease()); } }
}
