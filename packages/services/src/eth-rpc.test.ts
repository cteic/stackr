import { describe, expect, it } from 'vitest';
import { ETH_PROXY_PATH, ethPublicRpcUrl, resolveEthRpcUrl } from './eth-rpc.js';

describe('resolveEthRpcUrl', () => {
  it('targets the same-origin proxy path in the browser', () => {
    // viem hands this relative path to `fetch`, which resolves it against the
    // document origin — so the request lands on the key-bearing proxy route.
    expect(resolveEthRpcUrl(true)).toBe(ETH_PROXY_PATH);
  });

  it('falls back to the public RPC outside the browser (SSR/tests/server)', () => {
    // No origin to resolve a relative path against, so the transport needs an
    // absolute URL it can fetch directly.
    expect(resolveEthRpcUrl(false)).toBe(ethPublicRpcUrl);
  });

  it('keeps the public fallback an absolute URL a transport can consume', () => {
    expect(() => new URL(ethPublicRpcUrl)).not.toThrow();
  });
});
