/**
 * Where Solana JSON-RPC portfolio reads go. Shared by the SOL balance adapter
 * and the SOL transaction normalizer so the choice of endpoint — same-origin
 * proxy vs public RPC — lives in exactly one place, mirroring `eth-rpc.ts`.
 * (The wallet-adapter `ConnectionProvider` resolves the same proxy through
 * `apps/web/src/lib/solana-config.ts`; the app layer cannot be imported from
 * this package, hence the twin.)
 */

/** Same-origin route that proxies Solana JSON-RPC with a server-only key. */
export const SOLANA_PROXY_PATH = '/api/rpc/solana';

/**
 * Public mainnet RPC. Preserved as the fallback for non-browser contexts
 * (SSR/prerender/tests — no origin to resolve the proxy path against) and
 * mirrored server-side by the proxy route when no Helius key is configured.
 * The public endpoint rate-limits aggressively, which is exactly why browser
 * traffic goes through the keyed proxy instead.
 */
export const solanaPublicRpcUrl = 'https://api.mainnet-beta.solana.com';

/**
 * Resolve the URL a Solana JSON-RPC read should target.
 *
 * Browser: the same-origin proxy path, so the reads share the server-only
 * Helius key's allowance instead of the public endpoint's aggressive
 * unauthenticated limits. `fetch` resolves the relative path against the
 * document origin.
 *
 * Non-browser (SSR/prerender, tests): there is no origin to resolve a relative
 * path against, so fall back to the public RPC absolute URL.
 *
 * `inBrowser` is a parameter (not read inline) so the resolution is pure and
 * unit-testable for both cases.
 */
export function resolveSolanaRpcUrl(inBrowser: boolean = typeof window !== 'undefined'): string {
  return inBrowser ? SOLANA_PROXY_PATH : solanaPublicRpcUrl;
}
