/**
 * Where Hiro (Stacks) API calls go. Shared by the STX balance/BNS adapter,
 * the STX transaction normalizer, the Stacks NFT adapter, and the health
 * call-read client so the choice of endpoint — same-origin proxy vs public
 * upstream — lives in exactly one place, mirroring `etherscan-config.ts`.
 */

/** Same-origin route that proxies the Hiro API with a server-only key. */
export const HIRO_PROXY_PATH = '/api/hiro';

/**
 * Public Hiro API base. Preserved as the fallback for non-browser contexts
 * (SSR/prerender/tests — no origin to resolve the proxy path against) and
 * mirrored server-side by the proxy route, which attaches the server-only
 * `HIRO_API_KEY` (500 rpm instead of the keyless 50 rpm) before forwarding.
 */
export const hiroPublicBase = 'https://api.hiro.so';

/**
 * Resolve the base URL Hiro API requests should target.
 *
 * Browser: the same-origin proxy path, so every user shares the app key's
 * 500 rpm allowance instead of the keyless 50 rpm. `fetch` resolves the
 * relative path against the document origin.
 *
 * Non-browser (SSR/prerender, tests): there is no origin to resolve a relative
 * path against, so fall back to the public absolute URL. Reads still work;
 * they just go straight to the public endpoint without a key.
 *
 * `inBrowser` is a parameter (not read inline) so the resolution is pure and
 * unit-testable for both cases.
 */
export function resolveHiroBase(inBrowser: boolean = typeof window !== 'undefined'): string {
  return inBrowser ? HIRO_PROXY_PATH : hiroPublicBase;
}
