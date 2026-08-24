import { absoluteUrl, isProductionHost, isProductionSiteUrl, resolveSiteUrl } from '@/lib/site';

/**
 * The robots.txt body, built by hand.
 *
 * `MetadataRoute.Robots` — Next's `app/robots.ts` convention — models exactly
 * `User-agent` / `Allow` / `Disallow` / `Sitemap` / `Host` / `Crawl-delay` and
 * has no escape hatch for an arbitrary directive, so it cannot emit the
 * `Content-Signal:` line at all. Emitting the file ourselves is the only way to
 * ship Content Signals, and it also lets the body branch on whether this
 * deployment is production.
 *
 * Content Signals (Cloudflare's robots.txt extension) express *usage* intent,
 * which `Allow`/`Disallow` cannot: crawl the pages, index them, answer live
 * questions from them — but do not train on them. Like robots.txt itself it is
 * advisory, honoured voluntarily.
 *
 * The app owns this file outright (ADR 0021). Cloudflare's Managed robots.txt
 * is disabled in the dashboard, so the per-bot `Disallow` groups it used to
 * prepend are gone — which means the training-crawler blocks below must be
 * emitted here or they do not exist at all.
 */

/**
 * Machine-facing or private surfaces. Mirrors the per-route
 * `robots: { index: false, follow: false }` metadata so the two never disagree:
 * robots.txt withholds the crawl, the meta tag withdraws the index.
 */
const DISALLOWED_PATHS = [
  '/api/',
  '/settings',
  '/account',
  '/login',
  '/auth/',
  '/labs',
  '/wallet/',
];

/**
 * `/wallet/` blocks the unbounded address-keyed detail routes, but `/wallet/add`
 * is a real public page. Google resolves a conflict by longest match, so the
 * more specific `Allow` wins; it is listed explicitly rather than relied on
 * implicitly.
 */
const ALLOWED_PATHS = ['/', '/wallet/add'];

/**
 * Crawlers refused outright.
 *
 * A per-bot group beats `User-agent: *` regardless of where it sits in the
 * file, so these override the permissive default group above them. The line
 * these five share is *purpose*: they collect corpora for model training and
 * return no citation, no referral and no grounding — the `ai-train=no` signal
 * expressed as an access rule for the agents least likely to honour a signal.
 */
export const BLOCKED_TRAINING_CRAWLERS = [
  'CCBot',
  'Bytespider',
  'Amazonbot',
  'meta-externalagent',
  'Applebot-Extended',
];

/**
 * Named in the emitted file, with no `Disallow`, so their absence from the
 * blocked list above reads as a decision rather than an oversight. These fetch
 * to answer a question *now* and cite the source back — which is the entire
 * point of the work in this file. Blocking them would buy nothing (`ai-train=no`
 * already covers training) and cost every citation.
 */
export const ALLOWED_CITATION_CRAWLERS = [
  'ClaudeBot',
  'Google-Extended',
  'GPTBot',
  'OAI-SearchBot',
  'PerplexityBot',
];

/**
 * Build the robots.txt body.
 *
 * `indexable` false is the preview/staging case. Cloudflare *Pages* stamps
 * `X-Robots-Tag: noindex` onto branch previews automatically; Cloudflare
 * *Workers* — which is what Stackr deploys to — does not, so a preview Worker
 * is fully crawlable unless we say otherwise here.
 */
export function buildRobotsTxt(siteUrl: string, indexable: boolean): string {
  if (!indexable) {
    return [
      '# Non-production deployment. Nothing here should be indexed, cited, or trained on.',
      'User-agent: *',
      'Content-Signal: search=no, ai-input=no, ai-train=no',
      'Disallow: /',
      '',
    ].join('\n');
  }

  return [
    '# Content Signals Policy — https://developers.cloudflare.com/ai-crawl-control/',
    '# search: search engines building an index and showing links/excerpts',
    '# ai-input: real-time use in generative AI answers (e.g. RAG)',
    '# ai-train: use as training/fine-tuning data',
    '#',
    '# ANY RESTRICTIONS EXPRESSED VIA CONTENT SIGNALS ARE EXPRESS RESERVATIONS OF',
    '# RIGHTS UNDER ARTICLE 4 OF THE EUROPEAN UNION DIRECTIVE 2019/790 ON COPYRIGHT',
    '# AND RELATED RIGHTS IN THE DIGITAL SINGLE MARKET.',
    'User-agent: *',
    'Content-Signal: search=yes, ai-input=yes, ai-train=no',
    ...ALLOWED_PATHS.map(path => `Allow: ${path}`),
    ...DISALLOWED_PATHS.map(path => `Disallow: ${path}`),
    '',
    `# Allowed on purpose: ${ALLOWED_CITATION_CRAWLERS.join(', ')}. These answer`,
    '# live questions and cite the source back, which is the whole point of being',
    '# crawlable at all. Do not add Disallow groups for them — ai-train=no above',
    '# already withholds training use. The groups below are training-only',
    '# crawlers, which cite nothing.',
    ...BLOCKED_TRAINING_CRAWLERS.flatMap(userAgent => [
      '',
      `User-agent: ${userAgent}`,
      'Disallow: /',
    ]),
    '',
    `Sitemap: ${absoluteUrl('/sitemap.xml', siteUrl)}`,
    '',
  ].join('\n');
}

/**
 * The host this request arrived on. `x-forwarded-host` wins when a proxy set it,
 * then the `Host` header, then whatever the framework put in `request.url` —
 * which under OpenNext is not guaranteed to carry the original scheme, hence
 * host rather than origin.
 */
export function resolveRequestHost(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-host');
  if (forwarded !== null && forwarded.length > 0) {
    const [first] = forwarded.split(',');
    return (first ?? '').trim();
  }

  const host = request.headers.get('host');
  if (host !== null && host.length > 0) return host;

  return new URL(request.url).host;
}

/**
 * A deployment counts as production only when both halves agree: the host the
 * request arrived on, and the site URL this build was made for.
 *
 * Neither alone is sufficient. The host catches a preview Worker built without
 * `NEXT_PUBLIC_SITE_URL` set — but it is not always the client's host: under
 * OpenNext on Workers, a configured custom-domain route rewrites `Host` and
 * `x-forwarded-host` to that domain (reproducible with `wrangler dev`, where a
 * request to localhost arrives claiming `stackr.ie`). So the build-time site URL
 * is the control that must be set on a preview deployment, and the host check is
 * the safety net that catches a preview the env var missed.
 */
export function isIndexableDeployment(request: Request): boolean {
  return isProductionHost(resolveRequestHost(request)) && isProductionSiteUrl(resolveSiteUrl());
}
