/**
 * Where Ethereum JSON-RPC goes. Shared by every viem/wagmi `http()` transport
 * in the app (the wagmi mainnet config, the ENS public client, and the Aave
 * health read) so the choice of endpoint — same-origin proxy vs public RPC —
 * lives in exactly one place.
 */

/** Same-origin route that proxies Ethereum JSON-RPC with a server-only key. */
export const ETH_PROXY_PATH = '/api/rpc/eth';

/**
 * Public mainnet RPC — viem's `mainnet` default (`http()` with no URL resolves
 * here). Preserved as the fallback for non-browser contexts (no origin to
 * resolve the proxy path against) and mirrored server-side by the proxy route
 * when no Alchemy key is configured, so the no-key behaviour matches what the
 * consumers did client-side before.
 */
export const ethPublicRpcUrl = 'https://eth.merkle.io';

/**
 * Resolve the URL a viem/wagmi `http()` transport should target.
 *
 * Browser: the same-origin proxy path, so the Alchemy key stays server-side.
 * viem hands the relative path straight to `fetch`, which resolves it against
 * the document origin; the proxy forwards to Alchemy when a key is set and to
 * the public RPC otherwise, so local dev without a secret keeps working through
 * the same URL.
 *
 * Non-browser (SSR/prerender, the Aave adapter running server-side, tests):
 * there is no origin to resolve a relative path against — `fetch`/`new Request`
 * would reject it — so fall back to the public RPC absolute URL. Reads still
 * work; they just go straight to the public endpoint without the key.
 *
 * `inBrowser` is a parameter (not read inline) so the resolution is pure and
 * unit-testable for both cases.
 */
export function resolveEthRpcUrl(inBrowser: boolean = typeof window !== 'undefined'): string {
  return inBrowser ? ETH_PROXY_PATH : ethPublicRpcUrl;
}
