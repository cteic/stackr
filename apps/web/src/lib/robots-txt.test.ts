import { describe, expect, it } from 'vitest';
import {
  ALLOWED_CITATION_CRAWLERS,
  BLOCKED_TRAINING_CRAWLERS,
  buildRobotsTxt,
  isIndexableDeployment,
} from './robots-txt';

/**
 * The emitted body is the contract — a crawler reads bytes, not a
 * `MetadataRoute.Robots` object — so these assertions are on the text itself.
 */
describe('buildRobotsTxt (production)', () => {
  const body = buildRobotsTxt('https://stackr.ie', true);
  const lines = body.split('\n');

  it('ships the Content Signals policy: indexable and answerable, not trainable', () => {
    expect(lines).toContain('User-agent: *');
    expect(lines).toContain('Content-Signal: search=yes, ai-input=yes, ai-train=no');
  });

  it('sets each signal individually — search yes, ai-input yes, ai-train no', () => {
    const [signalLine] = lines.filter(line => line.startsWith('Content-Signal:'));
    const signals = (signalLine ?? '')
      .replace('Content-Signal:', '')
      .split(',')
      .map(entry => entry.trim());

    expect(signals).toContain('search=yes');
    // Cloudflare's own managed line omits ai-input entirely, which reads as
    // "no opinion" on exactly the RAG/answer-engine use this site wants.
    expect(signals).toContain('ai-input=yes');
    expect(signals).toContain('ai-train=no');
  });

  it('carries the express reservation of rights the signals depend on', () => {
    expect(lines).toContain(
      '# ANY RESTRICTIONS EXPRESSED VIA CONTENT SIGNALS ARE EXPRESS RESERVATIONS OF',
    );
    expect(lines).toContain(
      '# RIGHTS UNDER ARTICLE 4 OF THE EUROPEAN UNION DIRECTIVE 2019/790 ON COPYRIGHT',
    );
    expect(lines).toContain('# AND RELATED RIGHTS IN THE DIGITAL SINGLE MARKET.');
  });

  it('keeps machine-facing and private routes out', () => {
    ['/api/', '/settings', '/account', '/login', '/auth/', '/labs', '/wallet/'].forEach(path => {
      expect(lines).toContain(`Disallow: ${path}`);
    });
  });

  it('re-allows the public /wallet/add page inside the disallowed /wallet/ prefix', () => {
    expect(lines).toContain('Allow: /');
    expect(lines).toContain('Allow: /wallet/add');
    expect(lines.indexOf('Allow: /wallet/add')).toBeLessThan(lines.indexOf('Disallow: /wallet/'));
  });

  it('advertises the sitemap on the canonical origin', () => {
    expect(lines).toContain('Sitemap: https://stackr.ie/sitemap.xml');
  });

  it('never blanket-disallows the default group on production', () => {
    // `Disallow: /` appears only inside the per-bot groups below; the wildcard
    // group must never carry it. Slice at the first named group to check.
    const firstNamedGroup = lines.findIndex(
      line => line.startsWith('User-agent: ') && line !== 'User-agent: *',
    );
    expect(firstNamedGroup).toBeGreaterThan(0);
    expect(lines.slice(0, firstNamedGroup)).not.toContain('Disallow: /');
  });

  /**
   * Cloudflare's Managed robots.txt used to prepend these groups. It is now
   * disabled (ADR 0021), so if the app stops emitting them, training crawlers
   * silently become allowed — a regression with no visible symptom. Hence a
   * test per crawler rather than a single "some groups exist" assertion.
   */
  it.each(BLOCKED_TRAINING_CRAWLERS)('refuses the training-only crawler %s', crawler => {
    const group = lines.indexOf(`User-agent: ${crawler}`);

    expect(group).toBeGreaterThan(-1);
    expect(lines[group + 1]).toBe('Disallow: /');
  });

  it('blocks exactly the training-only crawlers and no others', () => {
    const namedGroups = lines
      .filter(line => line.startsWith('User-agent: ') && line !== 'User-agent: *')
      .map(line => line.replace('User-agent: ', ''));

    expect(namedGroups.sort()).toEqual([...BLOCKED_TRAINING_CRAWLERS].sort());
  });

  it.each(ALLOWED_CITATION_CRAWLERS)('never adds a Disallow group for %s', crawler => {
    expect(lines).not.toContain(`User-agent: ${crawler}`);
  });

  it('names the citation crawlers in the output so nobody re-blocks them later', () => {
    ALLOWED_CITATION_CRAWLERS.forEach(crawler => {
      expect(body).toContain(crawler);
    });
    expect(body).toContain('Allowed on purpose');
  });

  it('keeps ClaudeBot and Google-Extended out of the blocked set specifically', () => {
    expect(BLOCKED_TRAINING_CRAWLERS).not.toContain('ClaudeBot');
    expect(BLOCKED_TRAINING_CRAWLERS).not.toContain('Google-Extended');
    expect(ALLOWED_CITATION_CRAWLERS).toContain('ClaudeBot');
    expect(ALLOWED_CITATION_CRAWLERS).toContain('Google-Extended');
  });

  it('keeps the Sitemap line last, below every per-bot group', () => {
    const sitemap = lines.findIndex(line => line.startsWith('Sitemap:'));
    const lastGroup = lines.map(line => line.startsWith('User-agent: ')).lastIndexOf(true);

    expect(sitemap).toBeGreaterThan(lastGroup);
  });
});

describe('buildRobotsTxt (preview)', () => {
  const body = buildRobotsTxt('https://stackr-preview.workers.dev', false);
  const lines = body.split('\n');

  it('blanket-disallows and withdraws every content signal', () => {
    expect(lines).toContain('User-agent: *');
    expect(lines).toContain('Disallow: /');
    expect(lines).toContain('Content-Signal: search=no, ai-input=no, ai-train=no');
  });

  it('does not advertise a sitemap', () => {
    expect(body).not.toContain('Sitemap:');
  });
});

describe('isIndexableDeployment', () => {
  function request(url: string, headers: Record<string, string> = {}): Request {
    return new Request(url, { headers });
  }

  it('is true for a request that arrived on the production domain', () => {
    expect(isIndexableDeployment(request('https://stackr.ie/robots.txt'))).toBe(true);
  });

  it('reads the host, not the scheme — a proxied request keeps its identity', () => {
    expect(
      isIndexableDeployment(request('http://127.0.0.1/robots.txt', { host: 'stackr.ie' })),
    ).toBe(true);
    expect(
      isIndexableDeployment(
        request('http://127.0.0.1/robots.txt', { 'x-forwarded-host': 'stackr.ie' }),
      ),
    ).toBe(true);
  });

  it('is false for preview Workers and local dev', () => {
    expect(isIndexableDeployment(request('https://stackr-preview.workers.dev/robots.txt'))).toBe(
      false,
    );
    expect(isIndexableDeployment(request('http://localhost:3000/robots.txt'))).toBe(false);
    expect(
      isIndexableDeployment(
        request('http://127.0.0.1/robots.txt', { 'x-forwarded-host': 'preview.workers.dev' }),
      ),
    ).toBe(false);
  });
});
