import { describe, expect, it } from 'vitest';
import { mapWithConcurrency } from './concurrency.js';

describe('mapWithConcurrency', () => {
  it('preserves input order in the results', async () => {
    const out = await mapWithConcurrency([1, 2, 3, 4], 2, async n => n * 10);
    expect(out).toEqual([10, 20, 30, 40]);
  });

  it('never runs more than `limit` tasks at once', async () => {
    let inFlight = 0;
    let peak = 0;
    await mapWithConcurrency(
      Array.from({ length: 10 }, (_, i) => i),
      3,
      async () => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise(resolve => setTimeout(resolve, 1));
        inFlight--;
      },
    );
    expect(peak).toBeLessThanOrEqual(3);
  });

  it('handles an empty list', async () => {
    expect(await mapWithConcurrency([], 4, async n => n)).toEqual([]);
  });

  it('treats a limit below 1 as serial (one at a time)', async () => {
    let inFlight = 0;
    let peak = 0;
    await mapWithConcurrency([1, 2, 3], 0, async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise(resolve => setTimeout(resolve, 1));
      inFlight--;
    });
    expect(peak).toBe(1);
  });
});
