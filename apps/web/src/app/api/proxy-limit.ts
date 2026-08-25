import { getCloudflareContext } from '@opennextjs/cloudflare';

/**
 * Shared per-client rate limiting for the same-origin `/api/*` proxies.
 *
 * Two layers, both best-effort, both required to pass:
 *
 * 1. In-isolate sliding window — the original per-route limiter, kept as the
 *    always-available floor. Worker isolates each hold their own map, so alone
 *    it is a per-isolate ceiling rather than a fleet guarantee.
 * 2. Fleet limiter — the Workers Rate Limiting binding (`PROXY_RATE_LIMITER`
 *    in `wrangler.jsonc`), enforced atomically per colo. This is what actually
 *    bounds spend on the metered upstream keys when traffic fans out across
 *    many isolates. A KV counter was considered and rejected: KV tops out at
 *    one write per second per key and its read-modify-write is racy, which
 *    fails under exactly the burst load a limiter exists for.
 *
 * When the binding is absent (plain `next dev`, Node, tests) or its call
 * fails, the fleet layer is skipped and the in-isolate window still applies —
 * the proxies never hard-depend on the binding.
 */

const RATE_LIMIT_PER_MINUTE = 120;
const rateWindow = new Map<string, { count: number; resetAt: number }>();

function isIsolateLimited(key: string, now: number): boolean {
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

/**
 * Resolve the per-client rate-limit key.
 *
 * Cloudflare sets `cf-connecting-ip` on every edge request, so first-party
 * browser traffic always keys off the real client IP. When that is absent we
 * fall back to a hash of the `x-forwarded-for` chain so header-less traffic
 * doesn't collapse into a single shared bucket. With neither header there is
 * nothing to identify the caller, so we fail closed rather than hand out a
 * shared allowance.
 */
function resolveRateLimitKey(request: Request): string | null {
  const connectingIp = request.headers.get('cf-connecting-ip');
  if (connectingIp) return `ip:${connectingIp}`;
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) return `xff:${hashKey(forwardedFor)}`;
  return null;
}

interface RateLimiterBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

function isRateLimiterBinding(value: unknown): value is RateLimiterBinding {
  return (
    typeof value === 'object' &&
    value !== null &&
    'limit' in value &&
    typeof value.limit === 'function'
  );
}

/**
 * Resolve the fleet rate limiter binding.
 *
 * Production (Cloudflare Workers): bound on the worker `env` via the `unsafe`
 * ratelimit binding in `wrangler.jsonc`. Outside that runtime
 * `getCloudflareContext` throws, and on a worker deployed without the binding
 * the env slot is simply absent — both resolve to `undefined` so callers fall
 * back to the in-isolate window alone.
 */
async function resolveFleetLimiter(): Promise<RateLimiterBinding | undefined> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    const binding: unknown = env?.PROXY_RATE_LIMITER;
    if (isRateLimiterBinding(binding)) return binding;
  } catch {
    // Not running inside the Workers/OpenNext runtime — fall through.
  }
  return undefined;
}

export type RateLimitVerdict = 'allowed' | 'limited' | 'unidentified';

/**
 * Gate one proxy request. `route` namespaces the counters so each proxy keeps
 * its own per-client allowance (matching the previous per-route maps).
 *
 * `unidentified` means no client key could be resolved; routes treat it the
 * same as `limited` (fail closed) but the distinction keeps the contract
 * explicit at the call site.
 */
export async function checkProxyRateLimit(
  request: Request,
  route: string,
): Promise<RateLimitVerdict> {
  const clientKey = resolveRateLimitKey(request);
  if (clientKey === null) return 'unidentified';

  const key = `${route}:${clientKey}`;
  if (isIsolateLimited(key, Date.now())) return 'limited';

  const fleetLimiter = await resolveFleetLimiter();
  if (fleetLimiter) {
    try {
      const { success } = await fleetLimiter.limit({ key });
      if (!success) return 'limited';
    } catch {
      // A failing binding must not take the proxy down; the in-isolate window
      // above has already been applied.
    }
  }

  return 'allowed';
}
