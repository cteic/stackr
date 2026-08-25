import { getCloudflareContext } from '@opennextjs/cloudflare';
import { checkProxyRateLimit } from '../../proxy-limit';

/**
 * Same-origin JSON-RPC proxy for Solana.
 *
 * Goal: keep the Helius API key off the client. Today `solana-config.ts` baked
 * `NEXT_PUBLIC_HELIUS_API_KEY` into the browser bundle, where anyone could read
 * it. This route reads a *server-only* `HELIUS_API_KEY` (no `NEXT_PUBLIC_`
 * prefix, so it is never bundled), forwards the request body upstream, and
 * returns the response same-origin.
 *
 * Fallback: when no key is configured the route forwards to the public
 * mainnet-beta cluster instead of failing. That keeps local dev (no secret) and
 * unconfigured deploys working, and means the client only ever needs one
 * endpoint — the proxy — regardless of whether a key exists.
 *
 * Abuse surface: a same-origin proxy in front of a metered upstream is an open
 * relay unless constrained, so requests are gated before anything is forwarded:
 * read-only JSON-RPC method allow-list, body-size cap, origin check, and a
 * best-effort per-IP rate limit. Upstream failures are mapped to a fixed error
 * contract instead of leaking upstream error bodies.
 */

// `clusterApiUrl('mainnet-beta')` from @solana/web3.js resolves to exactly this
// URL. Hardcoded so the worker route doesn't pull the web3.js bundle in just to
// compute a constant string.
const SOLANA_PUBLIC_RPC = 'https://api.mainnet-beta.solana.com';
const HELIUS_RPC = 'https://mainnet.helius-rpc.com';

const MAX_BODY_BYTES = 64 * 1024;
const MAX_BATCH_SIZE = 10;

// Read-only methods the app (queries + wallet-adapter connection) legitimately
// needs. Everything else — notably sendTransaction, simulateTransaction and
// requestAirdrop — is refused: stackr is watch-only and never submits
// transactions, so the proxy must not be usable as a relay for them.
const ALLOWED_METHODS = new Set([
  'getAccountInfo',
  'getBalance',
  'getBlockHeight',
  'getEpochInfo',
  'getFeeForMessage',
  'getGenesisHash',
  'getHealth',
  'getLatestBlockhash',
  'getMinimumBalanceForRentExemption',
  'getMultipleAccounts',
  'getProgramAccounts',
  'getRecentPerformanceSamples',
  'getSignatureStatuses',
  'getSignaturesForAddress',
  'getSlot',
  'getTokenAccountBalance',
  'getTokenAccountsByOwner',
  'getTokenSupply',
  'getTransaction',
  'getVersion',
  'isBlockhashValid',
]);

function collectMethods(parsed: unknown): string[] | null {
  const calls: unknown[] = Array.isArray(parsed) ? parsed : [parsed];
  if (calls.length === 0 || calls.length > MAX_BATCH_SIZE) {
    return null;
  }
  const methods: string[] = [];
  for (const call of calls) {
    if (typeof call !== 'object' || call === null || !('method' in call)) {
      return null;
    }
    const { method } = call;
    if (typeof method !== 'string') {
      return null;
    }
    methods.push(method);
  }
  return methods;
}

function rpcError(status: number, code: number, message: string): Response {
  return Response.json(
    { jsonrpc: '2.0', id: null, error: { code, message } },
    {
      status,
      // `no-store`: error bodies can reflect request shape; never cache them.
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    },
  );
}

/**
 * Resolve the server-only Helius key.
 *
 * Production (Cloudflare Workers): the secret is bound on the worker `env`, read
 * via `getCloudflareContext`. Outside that runtime (plain `next dev`, Node,
 * tests) `getCloudflareContext` throws, so we fall back to `process.env`, which
 * picks up `.dev.vars` / `.env.local` locally.
 */
async function resolveHeliusApiKey(): Promise<string | undefined> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    if (env?.HELIUS_API_KEY) return env.HELIUS_API_KEY;
  } catch {
    // Not running inside the Workers/OpenNext runtime — fall through.
  }
  return process.env.HELIUS_API_KEY;
}

export async function POST(request: Request): Promise<Response> {
  // Same-origin restriction. A cross-origin Origin header is rejected, and we
  // require Sec-Fetch-Site to positively assert `same-origin`. Legitimate
  // first-party browser fetches always send it, and the app's own consumers
  // only reach this route from the browser — server-side/SSR callers target the
  // public RPC directly and never this proxy (see `resolveSolanaEndpoint`). So a
  // request that doesn't carry that label — including one that omits the header
  // entirely — is not first-party and is refused.
  const origin = request.headers.get('origin');
  if (origin !== null && origin !== new URL(request.url).origin) {
    return rpcError(403, -32000, 'cross-origin requests are not allowed');
  }
  if (request.headers.get('sec-fetch-site') !== 'same-origin') {
    return rpcError(403, -32000, 'cross-origin requests are not allowed');
  }

  // Per-client rate limit: in-isolate window + fleet limiter (proxy-limit.ts).
  if ((await checkProxyRateLimit(request, 'solana')) !== 'allowed') {
    return rpcError(429, -32000, 'rate limit exceeded');
  }

  const body = await request.text();
  if (body.length > MAX_BODY_BYTES) {
    return rpcError(413, -32000, 'request body too large');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return rpcError(400, -32700, 'invalid JSON');
  }

  const methods = collectMethods(parsed);
  if (methods === null) {
    return rpcError(400, -32600, 'invalid JSON-RPC request');
  }
  const refused = methods.find(method => !ALLOWED_METHODS.has(method));
  if (refused !== undefined) {
    return rpcError(403, -32601, `method not allowed by proxy: ${refused}`);
  }

  const apiKey = await resolveHeliusApiKey();
  const upstream = apiKey
    ? `${HELIUS_RPC}/?api-key=${encodeURIComponent(apiKey)}`
    : SOLANA_PUBLIC_RPC;

  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(upstream, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
  } catch {
    // Fixed contract: transport failures never leak upstream details.
    return rpcError(502, -32000, 'upstream unavailable');
  }

  if (!upstreamRes.ok) {
    // Upstream HTTP errors (4xx/5xx) are not forwarded verbatim either — their
    // bodies can echo the request URL, which for Helius carries the key.
    return rpcError(502, -32000, 'upstream error');
  }

  const payload = await upstreamRes.text();

  return new Response(payload, {
    status: upstreamRes.status,
    headers: {
      'Content-Type': 'application/json',
      // Responses carry wallet/account data — never let a shared cache hold them.
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      // Signal which upstream served the request, WITHOUT leaking the key. Lets
      // the client (or a future health check) observe whether the proxy is
      // key-backed; `absent` means we fell back to the public cluster.
      'x-stackr-rpc-upstream': apiKey ? 'helius' : 'public',
    },
  });
}
