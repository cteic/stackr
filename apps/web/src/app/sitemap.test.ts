import { describe, expect, it } from 'vitest';
import robots from './robots';
import sitemap from './sitemap';

/**
 * The SEO metadata routes are static data, so the tests pin the contract that
 * matters: every sitemap entry is a canonical stackr.ie URL, the machine-facing
 * and unbounded routes stay out, and robots points crawlers at the sitemap
 * while keeping them off /api/.
 */
describe('sitemap', () => {
  const entries = sitemap();
  const urls = entries.map(entry => entry.url);

  it('lists the public static routes on the canonical origin', () => {
    expect(urls).toContain('https://stackr.ie/');
    expect(urls).toContain('https://stackr.ie/market');
    expect(urls).toContain('https://stackr.ie/holdings');
    expect(urls).toContain('https://stackr.ie/collectibles');
    expect(urls).toContain('https://stackr.ie/wallet/add');
    urls.forEach(url => expect(url).toMatch(/^https:\/\/stackr\.ie\//));
  });

  it('excludes api, labs, the /charts redirect, and address-keyed wallet routes', () => {
    urls.forEach(url => {
      expect(url).not.toContain('/api');
      expect(url).not.toContain('/labs');
      expect(url).not.toContain('/charts');
      expect(url).not.toContain('/wallet/view');
    });
    expect(urls.filter(url => url.includes('/wallet'))).toEqual(['https://stackr.ie/wallet/add']);
  });

  it('ranks the dashboard above the inner pages', () => {
    const [home] = entries.filter(entry => entry.url === 'https://stackr.ie/');
    expect(home?.priority).toBe(1);
  });
});

describe('robots', () => {
  it('allows crawling, blocks /api/, and advertises the sitemap', () => {
    expect(robots()).toEqual({
      rules: { userAgent: '*', allow: '/', disallow: '/api/' },
      sitemap: 'https://stackr.ie/sitemap.xml',
    });
  });
});
