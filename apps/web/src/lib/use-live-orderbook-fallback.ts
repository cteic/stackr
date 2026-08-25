'use client';

import { useEffect } from 'react';

/**
 * How long a live order-book subscription may stay empty before the page
 * gives up on it. The Kraken socket retries with backoff for ~30s worst-case,
 * but a browser that can't reach the exchange at all (offline, blocked WS)
 * fails within a couple of seconds — 8s covers a slow handshake without
 * leaving the book as a skeleton for the whole retry window.
 */
const FALLBACK_DELAY_MS = 8_000;

/**
 * Live is the markets default, but a dead feed must not strand the user on an
 * empty book: when the live subscription is active and has produced nothing
 * after `delayMs`, `onFallback` fires (the page switches itself to mock).
 * Any delivered snapshot cancels the timer.
 */
export function useLiveOrderbookFallback(
  liveEnabled: boolean,
  hasOrderbook: boolean,
  onFallback: () => void,
  delayMs: number = FALLBACK_DELAY_MS,
): void {
  useEffect(() => {
    if (!liveEnabled || hasOrderbook) {
      return;
    }
    const timer = setTimeout(onFallback, delayMs);
    return () => clearTimeout(timer);
  }, [liveEnabled, hasOrderbook, onFallback, delayMs]);
}
