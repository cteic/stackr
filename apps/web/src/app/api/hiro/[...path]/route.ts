import { getCloudflareContext } from '@opennextjs/cloudflare';
import { checkProxyRateLimit } from '../../proxy-limit';

/**
 * Same-origin REST proxy for the Hiro (Stacks) API.
 *
 * Goal: put the app-owned, server-only `HIRO_API_KEY` in front of every Hiro
 * read. Previously the services called `api.hiro.so` straight from the
 * browser, where no server key can exist, so the moat chain always ran at the
 * keyless 50 rpm — the key the health adapters tried to read via
 * `process.env` was dead code in that context. Through this route every user
 * shares the keyed 500 rpm allowance instead.
 *
 * Fallback: when no key is configured the route forwards keyless; behaviour
 * matches what the browser did before, so local dev and unconfigured deploys
 * keep working.
 *
 * Abuse surface: a same-origin proxy in front of a metered upstream is an
 * open relay unless constrained, so requests are gated before anything is
 * forwarded: a per-method path allow-list (only the endpoints the services
 * actually issue), a query-param whitelist, a body shape check + size cap on
 * the one POST endpoint, origin check, and the shared per-IP rate limit.
 * Upstream failures are mapped to a fixed error contract instead of leaking
 * upstream error bodies. Mirrors `apps/web/src/app/api/etherscan/route.ts`.
 */

const HIRO_API = 'https://api.hiro.so';

// The only Hiro paths stackr actually issues (see packages/services):
//   stx balance        — extended/v1/address/{addr}/stx
//   stx transactions   — extended/v1/address/{addr}/transactions
//   BNS reverse lookup — v1/addresses/stacks/{addr}
//   NFT holdings       — extended/v1/tokens/nft/holdings
//   NFT metadata       — metadata/v1/nft/{contractId}/{tokenId}
//   health call-read   — v2/contracts/call-read/{addr}/{contract}/{fn} (POST)
// Patterns match the re-encoded path, so a smuggled `/` inside a segment
// cannot rewrite the upstream path.
const ALLOWED_GET_PATHS = [
  /^extended\/v1\/address\/[^/]+\/stx$/,
  /^extended\/v1\/address\/[^/]+\/transactions$/,
  /^v1\/addresses\/stacks\/[^/]+$/,
  /^extended\/v1\/tokens\/nft\/holdings$/,
  /^metadata\/v1\/nft\/[^/]+\/[^/]+$/,
];

const ALLOWED_POST_PATHS = [/^v2\/contracts\/call-read\/[^/]+\/[^/]+\/[^/]+$/];

// Query params the proxy will forward. Anything outside this set is dropped
// rather than relayed; an api key is never accepted from the client.
const ALLOWED_PARAMS = new Set(['principal', 'limit', 'offset']);

const MAX_BODY_BYTES = 64 * 1024;

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
 * Resolve the server-only Hiro key.
 *
 * Production (Cloudflare Workers): the secret is bound on the worker `env`, read
 * via `getCloudflareContext`. Outside that runtime (plain `next dev`, Node,
 * tests) `getCloudflareContext` throws, so we fall back to `process.env`, which
 * picks up `.dev.vars` / `.env.local` locally.
 */
async function resolveHiroApiKey(): Promise<string | undefined> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    if (env?.HIRO_API_KEY) return env.HIRO_API_KEY;
  } catch {
    // Not running inside the Workers/OpenNext runtime — fall through.
  }
  return process.env.HIRO_API_KEY;
}

/** The one POST body shape stackr sends: Hiro's call-read arguments. */
function isCallReadBody(parsed: unknown): boolean {
  if (typeof parsed !== 'object' || parsed === null) return false;
  if (!('sender' in parsed) || typeof parsed.sender !== 'string') return false;
  if (!('arguments' in parsed) || !Array.isArray(parsed.arguments)) return false;
  return parsed.arguments.every(argument => typeof argument === 'string');
}

interface RouteContext {
  params: Promise<{ path: string[] }>;
}

async function handle(
  request: Request,
  context: RouteContext,
  allowedPaths: RegExp[],
): Promise<{ upstreamPath: string } | Response> {
  // Same-origin restriction. Mirrors the other proxies: a cross-origin Origin
  // is rejected and Sec-Fetch-Site must positively assert same-origin.
  const url = new URL(request.url);
  const origin = request.headers.get('origin');
  if (origin !== null && origin !== url.origin) {
    return proxyError(403, 'cross-origin requests are not allowed');
  }
  if (request.headers.get('sec-fetch-site') !== 'same-origin') {
    return proxyError(403, 'cross-origin requests are not allowed');
  }

  // Per-client rate limit: in-isolate window + fleet limiter (proxy-limit.ts).
  if ((await checkProxyRateLimit(request, 'hiro')) !== 'allowed') {
    return proxyError(429, 'rate limit exceeded');
  }

  // Next hands the segments URL-decoded; re-encode each one so a decoded `/`
  // (or any other reserved char) can't alter the upstream path, then match the
  // allow-list against exactly what will be forwarded.
  const { path } = await context.params;
  const upstreamPath = path.map(segment => encodeURIComponent(segment)).join('/');
  if (!allowedPaths.some(pattern => pattern.test(upstreamPath))) {
    return proxyError(403, 'request not allowed by proxy');
  }

  return { upstreamPath };
}

function forwardedQuery(url: URL): string {
  // Rebuild the forwarded query from the whitelist only — never relay
  // arbitrary client params.
  const forwarded = new URLSearchParams();
  for (const [key, value] of url.searchParams) {
    if (ALLOWED_PARAMS.has(key)) {
      forwarded.set(key, value);
    }
  }
  const query = forwarded.toString();
  return query === '' ? '' : `?${query}`;
}

async function forward(upstreamUrl: string, init: RequestInit): Promise<Response> {
  const apiKey = await resolveHiroApiKey();
  const headers = new Headers(init.headers);
  if (apiKey) {
    headers.set('x-api-key', apiKey);
  }

  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(upstreamUrl, { ...init, headers });
  } catch {
    // Fixed contract: transport failures never leak upstream details.
    return proxyError(502, 'upstream unavailable');
  }

  if (!upstreamRes.ok) {
    // Upstream HTTP errors are not forwarded verbatim; the fixed contract
    // keeps the response shape stable and free of upstream internals.
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
      'x-stackr-hiro-upstream': apiKey ? 'keyed' : 'public',
    },
  });
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const gated = await handle(request, context, ALLOWED_GET_PATHS);
  if (gated instanceof Response) return gated;

  const url = new URL(request.url);
  return forward(`${HIRO_API}/${gated.upstreamPath}${forwardedQuery(url)}`, { method: 'GET' });
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const gated = await handle(request, context, ALLOWED_POST_PATHS);
  if (gated instanceof Response) return gated;

  const body = await request.text();
  if (body.length > MAX_BODY_BYTES) {
    return proxyError(413, 'request body too large');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return proxyError(400, 'invalid JSON');
  }
  if (!isCallReadBody(parsed)) {
    return proxyError(400, 'invalid call-read body');
  }

  return forward(`${HIRO_API}/${gated.upstreamPath}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
}
