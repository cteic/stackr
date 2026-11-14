import { describe, expect, it } from 'vitest';
import { GET } from './route';

describe('GET /robots.txt', () => {
  it('serves plain text with the production body on the production domain', async () => {
    const response = GET(new Request('https://stackr.ie/robots.txt'));

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/plain; charset=utf-8');
    expect(response.headers.get('X-Robots-Tag')).toBeNull();
    await expect(response.text()).resolves.toContain(
      'Content-Signal: search=yes, ai-input=yes, ai-train=no',
    );
  });

  it('serves the noindex body and header on a preview Worker', async () => {
    const response = GET(new Request('https://stackr-preview.workers.dev/robots.txt'));

    expect(response.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
    await expect(response.text()).resolves.toContain('Disallow: /');
  });
});
