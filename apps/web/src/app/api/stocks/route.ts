import { getCloudflareContext } from '@opennextjs/cloudflare';
import { checkProxyRateLimit } from '../proxy-limit';

/**
 * Same-origin REST proxy for Alpha Vantage.
 *
 * Goal: keep the Alpha Vantage API key off the client. Previously the stock
 * search / quote / history services baked a user-supplied key into the
 * browser-side request URL. This route reads an *app-owned, server-only*
 * `ALPHAVANTAGE_API_KEY` (no `NEXT_PUBLIC_` prefix, so it is never bundled),
 * forwards an allow-listed GET upstream, and returns the response same-origin.
 *
 * Fallback: when no key is configured the route forwards keyless. Alpha Vantage
 * then answers with a rate-limit note rather than data, but the endpoint stays
 * functional so local dev / unconfigured deploys don't error.
 *
 * Abuse surface: a same-origin proxy in front of a metered upstream is an open
 * relay unless constrained, so requests are gated before anything is forwarded:
 * a `function` allow-list, a strict query-param whitelist, origin check, and a
 * best-effort per-IP rate limit. Upstream failures are mapped to a fixed error
 * contract instead of leaking upstream error bodies (which can echo the
 * key-bearing URL). Mirrors `apps/web/src/app/api/rpc/{solana,eth}/route.ts`.
 */

const ALPHAVANTAGE_API = 'https://www.alphavantage.co/query';

// The only Alpha Vantage `function` values stackr actually issues:
//   SYMBOL_SEARCH      — stock symbol search (services/stocks)
//   GLOBAL_QUOTE       — latest quote (services/stocks)
//   TIME_SERIES_DAILY  — daily close history (services/stocks)
// Everything else is refused so the proxy can't relay arbitrary AV endpoints.
const ALLOWED_FUNCTIONS = new Set(['SYMBOL_SEARCH', 'GLOBAL_QUOTE', 'TIME_SERIES_DAILY']);

// Query params the proxy will forward. Anything outside this set is dropped
// rather than relayed; the `apikey` is never accepted from the client.
const ALLOWED_PARAMS = new Set(['function', 'keywords', 'symbol', 'outputsize']);

// Shared edge-cache TTLs per Alpha Vantage function. Stock data is not
// wallet data — the same symbol's quote/search/history is identical for every
// user — so it is safe (and necessary) to cache cross-user: the free tier is
// ~25 requests/day against a single app key, which cannot back the feature
// without a shared cache in front of it.
const CACHE_TTL_SECONDS: Record<string, number> = {
  SYMBOL_SEARCH: 3600,
  GLOBAL_QUOTE: 300,
  TIME_SERIES_DAILY: 3600,
};

interface EdgeCache {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<unknown>;
}

function isEdgeCache(value: unknown): value is EdgeCache {
  return (
    typeof value === 'object' &&
    value !== null &&
    'match' in value &&
    typeof value.match === 'function' &&
    'put' in value &&
    typeof value.put === 'function'
  );
}

/**
 * Resolve Cloudflare's default zone cache (`caches.default`). Only the
 * Workers runtime provides it — the standard `CacheStorage` has no `default`
 * member, and Node/tests have no `caches` at all — so absence simply disables
 * edge caching rather than failing the route.
 */
function resolveEdgeCache(): EdgeCache | undefined {
  if (!('caches' in globalThis)) return undefined;
  const storage: unknown = globalThis.caches;
  if (typeof storage !== 'object' || storage === null || !('default' in storage)) {
    return undefined;
  }
  const candidate: unknown = storage.default;
  return isEdgeCache(candidate) ? candidate : undefined;
}

/**
 * Canonical cache key for one upstream query: the whitelisted params, sorted,
 * against the route's own origin. Never includes the API key, so the key can't
 * leak through cache internals, and two clients asking for the same symbol in
 * a different param order share one entry.
 */
function cacheKeyRequest(url: URL, forwarded: URLSearchParams): Request {
  const sorted = new URLSearchParams([...forwarded.entries()].sort(([a], [b]) => (a < b ? -1 : 1)));
  return new Request(`${url.origin}${url.pathname}?${sorted}`);
}

/**
 * Alpha Vantage signals throttling/misuse inside a 200 body (`Note`,
 * `Information`, or `Error Message` keys) instead of an HTTP error. Those
 * bodies must never be cached — they'd pin the throttle message for the TTL.
 */
function isAlphaVantageErrorPayload(payload: string): boolean {
  try {
    const parsed: unknown = JSON.parse(payload);
    if (typeof parsed !== 'object' || parsed === null) return true;
    return 'Note' in parsed || 'Information' in parsed || 'Error Message' in parsed;
  } catch {
    return true;
  }
}

function proxyError(status: number, message: string): Response {
  return Response.json(
    { error: message },
    {
      status,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    },
  );
}

/**
 * Resolve the server-only Alpha Vantage key.
 *
 * Production (Cloudflare Workers): the secret is bound on the worker `env`, read
 * via `getCloudflareContext`. Outside that runtime (plain `next dev`, Node,
 * tests) `getCloudflareContext` throws, so we fall back to `process.env`, which
 * picks up `.dev.vars` / `.env.local` locally.
 */
async function resolveAlphaVantageApiKey(): Promise<string | undefined> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    if (env?.ALPHAVANTAGE_API_KEY) return env.ALPHAVANTAGE_API_KEY;
  } catch {
    // Not running inside the Workers/OpenNext runtime — fall through.
  }
  return process.env.ALPHAVANTAGE_API_KEY;
}

export async function GET(request: Request): Promise<Response> {
  // Same-origin restriction. Mirrors the JSON-RPC proxies: a cross-origin
  // Origin is rejected and Sec-Fetch-Site must positively assert same-origin.
  const url = new URL(request.url);
  const origin = request.headers.get('origin');
  if (origin !== null && origin !== url.origin) {
    return proxyError(403, 'cross-origin requests are not allowed');
  }
  if (request.headers.get('sec-fetch-site') !== 'same-origin') {
    return proxyError(403, 'cross-origin requests are not allowed');
  }

  // Per-client rate limit: in-isolate window + fleet limiter (proxy-limit.ts).
  if ((await checkProxyRateLimit(request, 'stocks')) !== 'allowed') {
    return proxyError(429, 'rate limit exceeded');
  }

  const fn = url.searchParams.get('function');
  if (fn === null || !ALLOWED_FUNCTIONS.has(fn)) {
    return proxyError(403, 'request not allowed by proxy');
  }

  // Rebuild the forwarded query from the whitelist only — never relay arbitrary
  // client params, and never accept a client-supplied apikey.
  const forwarded = new URLSearchParams();
  for (const [key, value] of url.searchParams) {
    if (ALLOWED_PARAMS.has(key)) {
      forwarded.set(key, value);
    }
  }

  // Shared cache first: a hit costs zero upstream quota. The lookup sits
  // behind the same-origin and rate-limit gates above, so the cache can't be
  // farmed cross-origin any more than the upstream can.
  const ttl = CACHE_TTL_SECONDS[fn] ?? 0;
  const edgeCache = resolveEdgeCache();
  const cacheKey = cacheKeyRequest(url, forwarded);
  if (edgeCache && ttl > 0) {
    const hit = await edgeCache.match(cacheKey);
    if (hit) return hit;
  }

  const apiKey = await resolveAlphaVantageApiKey();
  if (apiKey) {
    forwarded.set('apikey', apiKey);
  }

  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(`${ALPHAVANTAGE_API}?${forwarded}`);
  } catch {
    // Fixed contract: transport failures never leak upstream details.
    return proxyError(502, 'upstream unavailable');
  }

  if (!upstreamRes.ok) {
    // Upstream HTTP errors are not forwarded verbatim — their bodies can echo
    // the request URL, which carries the key.
    return proxyError(502, 'upstream error');
  }

  const payload = await upstreamRes.text();
  const cacheable = ttl > 0 && !isAlphaVantageErrorPayload(payload);

  const response = new Response(payload, {
    status: upstreamRes.status,
    headers: {
      'Content-Type': 'application/json',
      // Real data is shareable market data: cache it (edge + browser) for the
      // function's TTL. Throttle notes and malformed bodies stay no-store.
      'Cache-Control': cacheable ? `public, max-age=${ttl}` : 'no-store',
      'X-Content-Type-Options': 'nosniff',
      // Signal whether the proxy is key-backed, WITHOUT leaking the key.
      'x-stackr-stocks-upstream': apiKey ? 'keyed' : 'public',
    },
  });

  if (edgeCache && cacheable) {
    await edgeCache.put(cacheKey, response.clone());
  }

  return response;
}
