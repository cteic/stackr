import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useLiveOrderbookFallback } from './use-live-orderbook-fallback';

describe('useLiveOrderbookFallback', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('falls back once the live feed stays empty past the delay', () => {
    const onFallback = vi.fn();
    renderHook(() => useLiveOrderbookFallback(true, false, onFallback, 8_000));

    vi.advanceTimersByTime(7_999);
    expect(onFallback).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onFallback).toHaveBeenCalledTimes(1);
  });

  it('cancels the timer when a snapshot arrives', () => {
    const onFallback = vi.fn();
    const { rerender } = renderHook(
      ({ hasOrderbook }) => useLiveOrderbookFallback(true, hasOrderbook, onFallback, 8_000),
      { initialProps: { hasOrderbook: false } },
    );

    vi.advanceTimersByTime(4_000);
    rerender({ hasOrderbook: true });
    vi.advanceTimersByTime(60_000);

    expect(onFallback).not.toHaveBeenCalled();
  });

  it('does nothing while the page is already on mock', () => {
    const onFallback = vi.fn();
    renderHook(() => useLiveOrderbookFallback(false, false, onFallback, 8_000));

    vi.advanceTimersByTime(60_000);

    expect(onFallback).not.toHaveBeenCalled();
  });
});
