/**
 * One source of truth for the site's identity.
 *
 * The canonical origin used to live as three hardcoded copies in
 * `layout.tsx` plus a fourth in `sitemap.ts`. Everything that needs to emit an
 * absolute URL — `metadataBase`, the sitemap, the robots.txt route, the
 * JSON-LD graph — now reads it from here.
 *
 * The deployment-environment question is answered here too. Stackr deploys to
 * Cloudflare *Workers*, not Pages: Pages sends `X-Robots-Tag: noindex` on every
 * branch preview automatically, Workers sends nothing, so a preview Worker is
 * fully indexable unless the app says otherwise. `isProductionSiteUrl` is that
 * switch — when the resolved origin is not the production custom domain, the
 * robots route serves `Disallow: /` and the root metadata carries
 * `robots: { index: false, follow: false }`.
 */

/** The production custom domain, matching the `routes` entry in wrangler.jsonc. */
export const PRODUCTION_HOST = 'stackr.ie';

export const PRODUCTION_SITE_URL = `https://${PRODUCTION_HOST}`;

export const SITE_NAME = 'Stackr';

export const SITE_TAGLINE = 'Multi-Chain Portfolio Tracker';

export const SITE_DESCRIPTION =
  'Cross-chain Web3 portfolio for self-custody. Track BTC, ETH, STX, SOL and SUI wallet balances in one place.';

/** Public profile links, used as `sameAs` on the Organization JSON-LD node. */
export const SITE_SAME_AS: readonly string[] = ['https://github.com/pete-watters/stackr'];

/**
 * Reduce an arbitrary origin string to a bare `protocol//host`, falling back to
 * the production origin for anything missing or unparseable. Keeping this pure
 * (rather than reading `process.env` inline) is what makes both branches of the
 * preview/production split unit-testable.
 */
export function normalizeSiteUrl(value: string | undefined | null): string {
  if (typeof value !== 'string' || value.trim().length === 0) return PRODUCTION_SITE_URL;
  try {
    const parsed = new URL(value.trim());
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return PRODUCTION_SITE_URL;
  }
}

/**
 * The origin this build represents. `NEXT_PUBLIC_SITE_URL` is a public,
 * build-time value (no secret in it) so it inlines safely into both the server
 * and client halves of the bundle; leaving it unset means "production".
 */
export function resolveSiteUrl(): string {
  return normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL);
}

/**
 * Host-only comparison, for the runtime question "did this request arrive on the
 * production domain?". Deliberately not an origin comparison: behind Cloudflare
 * the scheme visible to the Worker is not reliably the scheme the client used,
 * and getting that wrong would noindex production.
 */
export function isProductionHost(host: string | undefined | null): boolean {
  if (typeof host !== 'string') return false;
  const [hostname] = host.trim().toLowerCase().split(':');
  return hostname === PRODUCTION_HOST;
}

/** True only for the production custom domain — every other origin is a preview. */
export function isProductionSiteUrl(value: string | undefined | null): boolean {
  return normalizeSiteUrl(value) === PRODUCTION_SITE_URL;
}

/** Absolute URL for a site-relative path, e.g. `/holdings` → `https://stackr.ie/holdings`. */
export function absoluteUrl(path: string, siteUrl: string = resolveSiteUrl()): string {
  return new URL(path, `${siteUrl}/`).toString();
}
