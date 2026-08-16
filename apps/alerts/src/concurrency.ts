/**
 * Map over items with a bounded number of in-flight promises, preserving input
 * order in the result. The sweep uses this to parallelise the slow per-position
 * chain reads without ever exceeding a fixed number of simultaneous
 * subrequests — a single Cloudflare Worker invocation caps total subrequests
 * (50 free / 1000 paid), so unbounded `Promise.all` over hundreds of reads
 * would blow the limit and fail the run.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const bound = Math.max(1, Math.floor(limit));
  const results = new Array<R>(items.length);
  let next = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
    }
  }

  const runners = Array.from({ length: Math.min(bound, items.length) }, () => worker());
  await Promise.all(runners);
  return results;
}
