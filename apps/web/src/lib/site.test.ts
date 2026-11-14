import { describe, expect, it } from 'vitest';
import { absoluteUrl, isProductionSiteUrl, normalizeSiteUrl, PRODUCTION_SITE_URL } from './site';

describe('normalizeSiteUrl', () => {
  it('reduces an origin to protocol//host', () => {
    expect(normalizeSiteUrl('https://stackr.ie/some/path?x=1')).toBe('https://stackr.ie');
    expect(normalizeSiteUrl('https://stackr-preview.workers.dev')).toBe(
      'https://stackr-preview.workers.dev',
    );
  });

  it('falls back to production for missing or unparseable values', () => {
    expect(normalizeSiteUrl(undefined)).toBe(PRODUCTION_SITE_URL);
    expect(normalizeSiteUrl(null)).toBe(PRODUCTION_SITE_URL);
    expect(normalizeSiteUrl('   ')).toBe(PRODUCTION_SITE_URL);
    expect(normalizeSiteUrl('not a url')).toBe(PRODUCTION_SITE_URL);
  });
});

describe('isProductionSiteUrl', () => {
  it('accepts only the production custom domain', () => {
    expect(isProductionSiteUrl('https://stackr.ie')).toBe(true);
    expect(isProductionSiteUrl('https://stackr.ie/robots.txt')).toBe(true);
  });

  it('treats preview and local origins as non-production', () => {
    expect(isProductionSiteUrl('https://stackr-preview.workers.dev')).toBe(false);
    expect(isProductionSiteUrl('http://localhost:3000')).toBe(false);
    expect(isProductionSiteUrl('https://www.stackr.ie')).toBe(false);
  });
});

describe('absoluteUrl', () => {
  it('joins a site-relative path onto the given origin', () => {
    expect(absoluteUrl('/holdings', PRODUCTION_SITE_URL)).toBe('https://stackr.ie/holdings');
    expect(absoluteUrl('/', PRODUCTION_SITE_URL)).toBe('https://stackr.ie/');
  });
});
