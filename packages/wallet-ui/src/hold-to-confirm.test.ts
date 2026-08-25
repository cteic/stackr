import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHoldToConfirm } from './hold-to-confirm';

describe('createHoldToConfirm', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('confirms exactly once after the full hold duration', () => {
    const onConfirm = vi.fn();
    const onProgress = vi.fn();
    const hold = createHoldToConfirm({ holdMs: 1000, tickMs: 100, onConfirm, onProgress });

    hold.start();
    vi.advanceTimersByTime(900);
    expect(onConfirm).not.toHaveBeenCalled();

    vi.advanceTimersByTime(200);
    expect(onConfirm).toHaveBeenCalledTimes(1);

    // Holding again after confirmation must not double-sign.
    hold.start();
    vi.advanceTimersByTime(2000);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('reports monotonic progress up to 1', () => {
    const onProgress = vi.fn();
    const hold = createHoldToConfirm({
      holdMs: 200,
      tickMs: 50,
      onConfirm: vi.fn(),
      onProgress,
    });

    hold.start();
    vi.advanceTimersByTime(200);

    const fractions = onProgress.mock.calls.map(([f]) => f);
    expect(fractions[0]).toBe(0);
    expect(fractions.at(-1)).toBe(1);
    const sorted = [...fractions].sort((a, b) => a - b);
    expect(fractions).toEqual(sorted);
  });

  it('releasing early cancels and resets progress — a tap can never approve', () => {
    const onConfirm = vi.fn();
    const onProgress = vi.fn();
    const hold = createHoldToConfirm({ holdMs: 1000, tickMs: 100, onConfirm, onProgress });

    hold.start();
    vi.advanceTimersByTime(500);
    hold.cancel();
    vi.advanceTimersByTime(2000);

    expect(onConfirm).not.toHaveBeenCalled();
    expect(onProgress).toHaveBeenLastCalledWith(0);

    // A fresh hold starts from zero, not from the cancelled elapsed time.
    hold.start();
    vi.advanceTimersByTime(900);
    expect(onConfirm).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('dispose stops timers without confirming', () => {
    const onConfirm = vi.fn();
    const hold = createHoldToConfirm({
      holdMs: 300,
      tickMs: 100,
      onConfirm,
      onProgress: vi.fn(),
    });

    hold.start();
    hold.dispose();
    vi.advanceTimersByTime(1000);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
