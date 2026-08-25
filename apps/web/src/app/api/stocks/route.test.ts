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
  return new Request(`https://stackr.ie/api/stocks?${query}`, {
    method: 'GET',
    headers: {
      'sec-fetch-site': 'same-origin',
      'cf-connecting-ip': '203.0.113.10',
      ...headers,
    },
  });
}

const searchQuery = 'function=SYMBOL_SEARCH&keywords=apple';
const quoteQuery = 'function=GLOBAL_QUOTE&symbol=AAPL';
const historyQuery = 'function=TIME_SERIES_DAILY&symbol=AAPL&outputsize=compact';

describe('GET /api/stocks', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ bestMatches: [] })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('forwards each allow-listed function upstream', async () => {
    for (const query of [searchQuery, quoteQuery, historyQuery]) {
      vi.mocked(fetch).mockClear();
      const res = await GET(proxyRequest(query));
      expect(res.status).toBe(200);
      expect(fetch).toHaveBeenCalledOnce();
    }
  });

  it('appends the server key without echoing it in the response', async () => {
    vi.stubEnv('ALPHAVANTAGE_API_KEY', 'secret-key-123');

    const res = await GET(proxyRequest(quoteQuery));
    const text = await res.text();

    expect(res.headers.get('x-stackr-stocks-upstream')).toBe('keyed');
    expect(text).not.toContain('secret-key-123');
    const upstreamUrl = String(vi.mocked(fetch).mock.calls[0]?.[0]);
    expect(upstreamUrl).toContain('apikey=secret-key-123');
  });

  it('never lets the client supply its own apikey through the proxy', async () => {
    vi.stubEnv('ALPHAVANTAGE_API_KEY', 'server-key');

    await GET(proxyRequest(`${quoteQuery}&apikey=client-injected`));

    const upstreamUrl = String(vi.mocked(fetch).mock.calls[0]?.[0]);
    expect(upstreamUrl).not.toContain('client-injected');
    expect(upstreamUrl).toContain('apikey=server-key');
  });

  it('drops query params outside the whitelist', async () => {
    await GET(proxyRequest(`${quoteQuery}&datatype=csv&callback=evil`));

    const upstreamUrl = String(vi.mocked(fetch).mock.calls[0]?.[0]);
    expect(upstreamUrl).not.toContain('datatype');
    expect(upstreamUrl).not.toContain('callback');
  });

  it('refuses a disallowed function', async () => {
    const res = await GET(proxyRequest('function=LISTING_STATUS'));

    expect(res.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('refuses a request missing the function param', async () => {
    const res = await GET(proxyRequest('symbol=AAPL'));

    expect(res.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('refuses cross-origin requests', async () => {
    const res = await GET(proxyRequest(quoteQuery, { origin: 'https://evil.example' }));

    expect(res.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('refuses cross-site requests flagged by Sec-Fetch-Site', async () => {
    const res = await GET(proxyRequest(quoteQuery, { 'sec-fetch-site': 'cross-site' }));

    expect(res.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects requests that omit Sec-Fetch-Site', async () => {
    const res = await GET(
      new Request(`https://stackr.ie/api/stocks?${quoteQuery}`, {
        headers: { 'cf-connecting-ip': '203.0.113.10' },
      }),
    );

    expect(res.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('fails closed when no client IP can be resolved', async () => {
    const res = await GET(
      new Request(`https://stackr.ie/api/stocks?${quoteQuery}`, {
        headers: { 'sec-fetch-site': 'same-origin' },
      }),
    );

    expect(res.status).toBe(429);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('marks cacheable market data public with the per-function TTL', async () => {
    const quoteRes = await GET(proxyRequest(quoteQuery));
    expect(quoteRes.headers.get('cache-control')).toBe('public, max-age=300');
    expect(quoteRes.headers.get('x-content-type-options')).toBe('nosniff');

    const searchRes = await GET(proxyRequest(searchQuery));
    expect(searchRes.headers.get('cache-control')).toBe('public, max-age=3600');

    const historyRes = await GET(proxyRequest(historyQuery));
    expect(historyRes.headers.get('cache-control')).toBe('public, max-age=3600');
  });

  it('never caches an Alpha Vantage throttle note (200 with a Note body)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ Note: 'Thank you for using Alpha Vantage! 25 requests/day' }),
      ),
    );

    const res = await GET(proxyRequest(quoteQuery));

    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('sets Cache-Control: no-store on error responses', async () => {
    const res = await GET(proxyRequest(quoteQuery, { origin: 'https://evil.example' }));

    expect(res.status).toBe(403);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  describe('edge cache (caches.default, Workers runtime only)', () => {
    // Minimal stand-in for Cloudflare's default zone cache. Node has no
    // `caches` global, so stubbing one exercises the Workers-only path.
    function stubEdgeCache(entries: Map<string, Response> = new Map()) {
      const cache = {
        match: vi.fn(async (request: Request) => entries.get(request.url)),
        put: vi.fn(async (request: Request, response: Response) => {
          entries.set(request.url, response);
        }),
      };
      vi.stubGlobal('caches', { default: cache });
      return cache;
    }

    it('serves a cache hit without touching the upstream', async () => {
      const entries = new Map<string, Response>();
      const cache = stubEdgeCache(entries);

      const first = await GET(proxyRequest(quoteQuery));
      expect(first.status).toBe(200);
      expect(fetch).toHaveBeenCalledOnce();
      expect(cache.put).toHaveBeenCalledOnce();

      const second = await GET(proxyRequest(quoteQuery));
      expect(second.status).toBe(200);
      expect(fetch).toHaveBeenCalledOnce();
      expect(await second.json()).toEqual({ bestMatches: [] });
    });

    it('keys the cache on sorted whitelisted params, never the API key', async () => {
      vi.stubEnv('ALPHAVANTAGE_API_KEY', 'secret-key-123');
      const cache = stubEdgeCache();

      await GET(proxyRequest('symbol=AAPL&function=GLOBAL_QUOTE'));

      const keyUrl = cache.put.mock.calls[0]?.[0].url;
      expect(keyUrl).toBe('https://stackr.ie/api/stocks?function=GLOBAL_QUOTE&symbol=AAPL');
      expect(keyUrl).not.toContain('secret-key-123');
    });

    it('does not cache throttle notes', async () => {
      const cache = stubEdgeCache();
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => Response.json({ Information: 'rate limit reached' })),
      );

      await GET(proxyRequest(quoteQuery));

      expect(cache.put).not.toHaveBeenCalled();
    });
  });

  it('maps upstream transport failure to the fixed 502 contract', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('connect ECONNREFUSED upstream-with-key');
      }),
    );

    const res = await GET(proxyRequest(quoteQuery));
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(body.error).toBe('upstream unavailable');
  });

  it('does not forward upstream HTTP error bodies verbatim', async () => {
    vi.stubEnv('ALPHAVANTAGE_API_KEY', 'secret-key-123');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('error for url ?apikey=secret-key-123', { status: 500 })),
    );

    const res = await GET(proxyRequest(quoteQuery));
    const text = await res.text();

    expect(res.status).toBe(502);
    expect(text).not.toContain('secret-key-123');
  });
});
