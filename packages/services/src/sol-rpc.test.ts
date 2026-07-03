import { describe, expect, it } from 'vitest';
import { SOLANA_PROXY_PATH, solanaPublicRpcUrl, resolveSolanaRpcUrl } from './sol-rpc.js';

describe('resolveSolanaRpcUrl', () => {
  it('targets the same-origin proxy path in the browser', () => {
    // `fetch` resolves this relative path against the document origin, so the
    // request lands on the key-bearing proxy route.
    expect(resolveSolanaRpcUrl(true)).toBe(SOLANA_PROXY_PATH);
  });

  it('falls back to the public RPC outside the browser (SSR/tests/server)', () => {
    // No origin to resolve a relative path against, so the request needs an
    // absolute URL it can fetch directly.
    expect(resolveSolanaRpcUrl(false)).toBe(solanaPublicRpcUrl);
  });

  it('keeps the public fallback an absolute URL fetch can consume', () => {
    expect(() => new URL(solanaPublicRpcUrl)).not.toThrow();
  });
});
