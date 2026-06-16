import { getCloudflareContext } from '@opennextjs/cloudflare';

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

const RATE_LIMIT_PER_MINUTE = 120;
const rateWindow = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(key: string, now: number): boolean {
  const entry = rateWindow.get(key);
  if (!entry || entry.resetAt <= now) {
    if (rateWindow.size > 10_000) {
      rateWindow.clear();
    }
    rateWindow.set(key, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT_PER_MINUTE;
}

// FNV-1a (32-bit). A tiny synchronous hash so the rate-limit key derived from a
// forwarded-for chain doesn't retain raw client IPs in the isolate's map.
function hashKey(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function resolveRateLimitKey(request: Request): string | null {
  const connectingIp = request.headers.get('cf-connecting-ip');
  if (connectingIp) return `ip:${connectingIp}`;
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) return `xff:${hashKey(forwardedFor)}`;
  return null;
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

  const rateLimitKey = resolveRateLimitKey(request);
  if (rateLimitKey === null || isRateLimited(rateLimitKey, Date.now())) {
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

  return new Response(payload, {
    status: upstreamRes.status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      // Signal whether the proxy is key-backed, WITHOUT leaking the key.
      'x-stackr-stocks-upstream': apiKey ? 'keyed' : 'public',
    },
  });
}
