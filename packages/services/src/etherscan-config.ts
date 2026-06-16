/**
 * Where Etherscan REST calls go. Shared by the ETH balance and ETH transaction
 * adapters so the choice of endpoint — same-origin proxy vs public upstream —
 * lives in exactly one place, mirroring `eth-rpc.ts` for the JSON-RPC side.
 */

/** Same-origin route that proxies Etherscan REST with a server-only key. */
export const ETHERSCAN_PROXY_PATH = '/api/etherscan';

/**
 * Public Etherscan REST base. Preserved as the fallback for non-browser
 * contexts (SSR/prerender/tests — no origin to resolve the proxy path against)
 * and mirrored server-side by the proxy route, which appends the server-only
 * `ETHERSCAN_API_KEY` before forwarding here.
 */
export const etherscanPublicBase = 'https://api.etherscan.io/api';

/**
 * Resolve the base URL Etherscan REST requests should target.
 *
 * Browser: the same-origin proxy path, so the Etherscan key stays server-side.
 * `fetch` resolves the relative path against the document origin; the proxy
 * appends the key and forwards upstream, so the client never carries a key.
 *
 * Non-browser (SSR/prerender, tests): there is no origin to resolve a relative
 * path against, so fall back to the public absolute URL. Reads still work; they
 * just go straight to the public endpoint without a key.
 *
 * `inBrowser` is a parameter (not read inline) so the resolution is pure and
 * unit-testable for both cases.
 */
export function resolveEtherscanBase(inBrowser: boolean = typeof window !== 'undefined'): string {
  return inBrowser ? ETHERSCAN_PROXY_PATH : etherscanPublicBase;
}
