/**
 * Where Alpha Vantage REST calls go. Shared by the stock search / quote /
 * history adapters so the choice of endpoint — same-origin proxy vs public
 * upstream — lives in exactly one place, mirroring `eth-rpc.ts`.
 */

/** Same-origin route that proxies Alpha Vantage REST with a server-only key. */
export const STOCKS_PROXY_PATH = '/api/stocks';

/**
 * Public Alpha Vantage REST base. Preserved as the fallback for non-browser
 * contexts (SSR/prerender/tests — no origin to resolve the proxy path against)
 * and mirrored server-side by the proxy route, which appends the server-only
 * `ALPHAVANTAGE_API_KEY` before forwarding here.
 */
export const stocksPublicBase = 'https://www.alphavantage.co/query';

/**
 * Resolve the base URL Alpha Vantage REST requests should target.
 *
 * Browser: the same-origin proxy path, so the Alpha Vantage key stays
 * server-side. `fetch` resolves the relative path against the document origin;
 * the proxy appends the key and forwards upstream.
 *
 * Non-browser (SSR/prerender, tests): no origin to resolve a relative path
 * against, so fall back to the public absolute URL.
 *
 * `inBrowser` is a parameter (not read inline) so the resolution is pure and
 * unit-testable for both cases.
 */
export function resolveStocksBase(inBrowser: boolean = typeof window !== 'undefined'): string {
  return inBrowser ? STOCKS_PROXY_PATH : stocksPublicBase;
}
