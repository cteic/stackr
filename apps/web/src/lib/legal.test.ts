import { describe as feature, it as scenario, expect } from 'vitest';
import { LEGAL_LAST_UPDATED, LEGAL_LINKS, SUPPORT_EMAIL, SUPPORT_FAQ } from './legal';
import sitemap from '../app/sitemap';

/**
 * The legal facts are static data, so the tests pin the contract the rest of
 * the app relies on: the footer routes are real public pages, the support
 * address is on the site's own domain, and the FAQ is complete enough to ship.
 */
feature('legal facts', () => {
  scenario('every footer link is a site-relative route listed in the sitemap', () => {
    const sitemapUrls = sitemap().map(entry => entry.url);
    LEGAL_LINKS.forEach(link => {
      expect(link.href).toMatch(/^\/[a-z-]+$/);
      expect(sitemapUrls).toContain(`https://stackr.ie${link.href}`);
    });
    expect(new Set(LEGAL_LINKS.map(link => link.href)).size).toBe(LEGAL_LINKS.length);
  });

  scenario('the support address lives on the production domain', () => {
    expect(SUPPORT_EMAIL).toBe('support@stackr.ie');
  });

  scenario('the last-updated stamp is a full written date', () => {
    expect(LEGAL_LAST_UPDATED).toMatch(/^\d{1,2} [A-Z][a-z]+ \d{4}$/);
  });

  scenario('the FAQ answers the questions a store reviewer or new user asks first', () => {
    const questions = SUPPORT_FAQ.map(entry => entry.question);
    expect(questions).toHaveLength(5);
    expect(questions).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/connect a wallet/i),
        expect.stringMatching(/alerts/i),
        expect.stringMatching(/non-custodial/i),
        expect.stringMatching(/delete my account/i),
        expect.stringMatching(/recovery phrase/i),
      ]),
    );
    SUPPORT_FAQ.forEach(entry => {
      expect(entry.question.endsWith('?')).toBe(true);
      expect(entry.answer.length).toBeGreaterThan(40);
    });
  });
});
