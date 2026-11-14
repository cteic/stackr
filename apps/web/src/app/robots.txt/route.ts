import { buildRobotsTxt, isIndexableDeployment } from '@/lib/robots-txt';
import { resolveSiteUrl } from '@/lib/site';

/**
 * A Route Handler, not Next's `app/robots.ts` convention: `MetadataRoute.Robots`
 * models only User-agent / Allow / Disallow / Sitemap / Host / Crawl-delay and
 * has no escape hatch for the `Content-Signal:` directive. The body itself is
 * built in `lib/robots-txt.ts`, since a route file may export nothing but its
 * HTTP handlers.
 */
export function GET(request: Request): Response {
  const indexable = isIndexableDeployment(request);
  const siteUrl = indexable ? resolveSiteUrl() : new URL(request.url).origin;

  return new Response(buildRobotsTxt(siteUrl, indexable), {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      // Belt-and-braces with the body above: a header a crawler reads before it
      // parses anything, on exactly the deployments that must not be indexed.
      ...(indexable ? {} : { 'X-Robots-Tag': 'noindex, nofollow' }),
    },
  });
}
