import type { MetadataRoute } from 'next';

// The canonical origin, matching `metadataBase` in layout.tsx.
const SITE_URL = 'https://stackr.ie';

// Public static routes only: /api/* is machine-facing, /labs is an unlisted
// sandbox, /charts is a permanent redirect to /market, and the wallet detail
// routes (/wallet/[chain]/[address]) are an unbounded
// address-keyed space that does not belong in a sitemap.
const PUBLIC_ROUTES = [
  '/',
  '/holdings',
  '/holdings/add',
  '/market',
  '/collectibles',
  '/settings',
  '/wallet/add',
];

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_ROUTES.map(route => ({
    url: `${SITE_URL}${route}`,
    changeFrequency: 'weekly',
    priority: route === '/' ? 1 : 0.6,
  }));
}
