import type { MetadataRoute } from 'next';
import { absoluteUrl, resolveSiteUrl } from '@/lib/site';

// Public static routes only: /api/* is machine-facing, /labs is an unlisted
// sandbox, /charts is a permanent redirect to /market, and the wallet detail
// routes (/wallet/[chain]/[address]) are an unbounded
// address-keyed space that does not belong in a sitemap.
// /settings, /account and /login are noindexed in their route metadata and
// disallowed in robots.txt, so listing them here would contradict both.
const PUBLIC_ROUTES = [
  '/',
  '/holdings',
  '/holdings/add',
  '/market',
  '/collectibles',
  '/wallet/add',
];

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = resolveSiteUrl();
  // One timestamp for the whole build: these routes are app shells that change
  // when the app is deployed, not on independent editorial schedules, so a
  // shared build time is the honest answer rather than six invented dates.
  const lastModified = new Date();

  return PUBLIC_ROUTES.map(route => ({
    url: absoluteUrl(route, siteUrl),
    lastModified,
    changeFrequency: 'weekly',
    priority: route === '/' ? 1 : 0.6,
  }));
}
