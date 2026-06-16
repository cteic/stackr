import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Outside the Workers runtime getCloudflareContext throws; the route then
// falls back to process.env — that's the path these tests exercise.
vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: vi.fn(() => {
    throw new Error('not in workers runtime');
  }),
}));

const { GET } = await import('./route');

// A legitimate first-party browser fetch carries `sec-fetch-site: same-origin`
// and, behind Cloudflare, a resolved `cf-connecting-ip`. Default both so the
// happy-path cases model a real request; individual tests override as needed.
function proxyRequest(query: string, headers: Record<string, string> = {}): Request {
  return new Request(`https://stackr.ie/api/etherscan?${query}`, {
    method: 'GET',
    headers: {
      'sec-fetch-site': 'same-origin',
      'cf-connecting-ip': '203.0.113.10',
      ...headers,
    },
  });
}

const balanceQuery = 'module=account&action=balance&address=0xabc&tag=latest';
const txlistQuery = 'module=account&action=txlist&address=0xabc&startblock=0&sort=desc';

describe('GET /api/etherscan', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ status: '1', message: 'OK', result: '0' })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('forwards an allow-listed account/balance request upstream', async () => {
    const res = await GET(proxyRequest(balanceQuery));

    expect(res.status).toBe(200);
    expect(res.headers.get('x-stackr-etherscan-upstream')).toBe('public');
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('forwards an allow-listed account/txlist request upstream', async () => {
    const res = await GET(proxyRequest(txlistQuery));

    expect(res.status).toBe(200);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('appends the server key without echoing it in the response', async () => {
    vi.stubEnv('ETHERSCAN_API_KEY', 'secret-key-123');

    const res = await GET(proxyRequest(balanceQuery));
    const text = await res.text();

    expect(res.headers.get('x-stackr-etherscan-upstream')).toBe('keyed');
    expect(text).not.toContain('secret-key-123');
    const upstreamUrl = String(vi.mocked(fetch).mock.calls[0]?.[0]);
    expect(upstreamUrl).toContain('apikey=secret-key-123');
  });

  it('never lets the client supply its own apikey through the proxy', async () => {
    vi.stubEnv('ETHERSCAN_API_KEY', 'server-key');

    await GET(proxyRequest(`${balanceQuery}&apikey=client-injected`));

    const upstreamUrl = String(vi.mocked(fetch).mock.calls[0]?.[0]);
    expect(upstreamUrl).not.toContain('client-injected');
    expect(upstreamUrl).toContain('apikey=server-key');
  });

  it('drops query params outside the whitelist', async () => {
    await GET(proxyRequest(`${balanceQuery}&module2=stats&callback=evil`));

    const upstreamUrl = String(vi.mocked(fetch).mock.calls[0]?.[0]);
    expect(upstreamUrl).not.toContain('module2');
    expect(upstreamUrl).not.toContain('callback');
  });

  it('refuses a disallowed module/action combo', async () => {
    const res = await GET(proxyRequest('module=stats&action=ethsupply'));

    expect(res.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('refuses a request missing module/action', async () => {
    const res = await GET(proxyRequest('address=0xabc'));

    expect(res.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('refuses cross-origin requests', async () => {
    const res = await GET(proxyRequest(balanceQuery, { origin: 'https://evil.example' }));

    expect(res.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('refuses cross-site requests flagged by Sec-Fetch-Site', async () => {
    const res = await GET(proxyRequest(balanceQuery, { 'sec-fetch-site': 'cross-site' }));

    expect(res.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects requests that omit Sec-Fetch-Site', async () => {
    const res = await GET(
      new Request(`https://stackr.ie/api/etherscan?${balanceQuery}`, {
        headers: { 'cf-connecting-ip': '203.0.113.10' },
      }),
    );

    expect(res.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('fails closed when no client IP can be resolved', async () => {
    const res = await GET(
      new Request(`https://stackr.ie/api/etherscan?${balanceQuery}`, {
        headers: { 'sec-fetch-site': 'same-origin' },
      }),
    );

    expect(res.status).toBe(429);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keys the rate limit off the forwarded-for chain when cf-connecting-ip is absent', async () => {
    const res = await GET(
      new Request(`https://stackr.ie/api/etherscan?${balanceQuery}`, {
        headers: {
          'sec-fetch-site': 'same-origin',
          'x-forwarded-for': '198.51.100.7, 70.41.3.18',
        },
      }),
    );

    expect(res.status).toBe(200);
  });

  it('sets no-store + nosniff on success responses', async () => {
    const res = await GET(proxyRequest(balanceQuery));

    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('sets Cache-Control: no-store on error responses', async () => {
    const res = await GET(proxyRequest(balanceQuery, { origin: 'https://evil.example' }));

    expect(res.status).toBe(403);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('maps upstream transport failure to the fixed 502 contract', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('connect ECONNREFUSED upstream-with-key');
      }),
    );

    const res = await GET(proxyRequest(balanceQuery));
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(body.error).toBe('upstream unavailable');
  });

  it('does not forward upstream HTTP error bodies verbatim', async () => {
    vi.stubEnv('ETHERSCAN_API_KEY', 'secret-key-123');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('error for url ?apikey=secret-key-123', { status: 500 })),
    );

    const res = await GET(proxyRequest(balanceQuery));
    const text = await res.text();

    expect(res.status).toBe(502);
    expect(text).not.toContain('secret-key-123');
  });
});
