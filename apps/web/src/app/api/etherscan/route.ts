import { getCloudflareContext } from '@opennextjs/cloudflare';

/**
 * Same-origin REST proxy for Etherscan.
 *
 * Goal: keep the Etherscan API key off the client. Previously the ETH balance
 * and transaction services baked a user-supplied key into the browser-side
 * request URL. This route reads an *app-owned, server-only* `ETHERSCAN_API_KEY`
 * (no `NEXT_PUBLIC_` prefix, so it is never bundled), forwards an allow-listed
 * GET upstream, and returns the response same-origin.
 *
 * Fallback: when no key is configured the route forwards keyless instead of
 * failing. Etherscan still serves at a lower rate limit, so local dev (no
 * secret) and unconfigured deploys keep working through the same endpoint.
 *
 * Abuse surface: a same-origin proxy in front of a metered upstream is an open
 * relay unless constrained, so requests are gated before anything is forwarded:
 * a module/action allow-list, a strict query-param whitelist, origin check, and
 * a best-effort per-IP rate limit. Upstream failures are mapped to a fixed
 * error contract instead of leaking upstream error bodies (which can echo the
 * key-bearing URL). Mirrors `apps/web/src/app/api/rpc/{solana,eth}/route.ts`.
 */

const ETHERSCAN_API = 'https://api.etherscan.io/api';

// The only Etherscan `module`/`action` combos stackr actually issues:
//   account/balance — ETH balance (services/eth)
//   account/txlist  — recent transactions (services/transactions)
// stackr is watch-only and reads nothing else, so every other endpoint —
// including the contract/gas/stats modules — is refused.
const ALLOWED_ACTIONS = new Set(['account/balance', 'account/txlist']);

// Query params the proxy will forward, per action. `module`/`action` gate which
// set applies; anything outside the union is dropped rather than relayed, so the
// proxy can't be driven to arbitrary Etherscan endpoints via extra params. The
// `apikey` is never accepted from the client — it is applied server-side only.
const ALLOWED_PARAMS = new Set([
  'module',
  'action',
  'address',
  'tag',
  'startblock',
  'endblock',
  'sort',
  'page',
  'offset',
]);

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
 * Resolve the server-only Etherscan key.
 *
 * Production (Cloudflare Workers): the secret is bound on the worker `env`, read
 * via `getCloudflareContext`. Outside that runtime (plain `next dev`, Node,
 * tests) `getCloudflareContext` throws, so we fall back to `process.env`, which
 * picks up `.dev.vars` / `.env.local` locally.
 */
async function resolveEtherscanApiKey(): Promise<string | undefined> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    if (env?.ETHERSCAN_API_KEY) return env.ETHERSCAN_API_KEY;
  } catch {
    // Not running inside the Workers/OpenNext runtime — fall through.
  }
  return process.env.ETHERSCAN_API_KEY;
}

export async function GET(request: Request): Promise<Response> {
  // Same-origin restriction. A cross-origin Origin header is rejected, and we
  // require Sec-Fetch-Site to positively assert `same-origin`. Legitimate
  // first-party browser fetches always send it; server-side callers target the
  // public base directly and never this proxy (see `resolveEtherscanBase`). A
  // request that doesn't carry that label — including one that omits it — is
  // not first-party and is refused.
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

  // `module` is a reserved name in this runtime, so read it under another name.
  const moduleParam = url.searchParams.get('module');
  const action = url.searchParams.get('action');
  if (moduleParam === null || action === null || !ALLOWED_ACTIONS.has(`${moduleParam}/${action}`)) {
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

  const apiKey = await resolveEtherscanApiKey();
  if (apiKey) {
    forwarded.set('apikey', apiKey);
  }

  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(`${ETHERSCAN_API}?${forwarded}`);
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
      // Responses carry wallet/account data — never let a shared cache hold them.
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      // Signal whether the proxy is key-backed, WITHOUT leaking the key.
      'x-stackr-etherscan-upstream': apiKey ? 'keyed' : 'public',
    },
  });
}
