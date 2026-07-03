import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Outside the Workers runtime getCloudflareContext throws; the route then
// falls back to process.env — that's the path these tests exercise.
vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: vi.fn(() => {
    throw new Error('not in workers runtime');
  }),
}));

const { GET, POST } = await import('./route');

const STX_ADDRESS = 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N';

// A legitimate first-party browser fetch carries `sec-fetch-site: same-origin`
// and, behind Cloudflare, a resolved `cf-connecting-ip`. Default both so the
// happy-path cases model a real request; individual tests override as needed.
function proxyRequest(
  path: string[],
  init: { method?: string; body?: string; headers?: Record<string, string>; query?: string } = {},
): [Request, { params: Promise<{ path: string[] }> }] {
  const request = new Request(`https://stackr.ie/api/hiro/${path.join('/')}${init.query ?? ''}`, {
    method: init.method ?? 'GET',
    body: init.body,
    headers: {
      'sec-fetch-site': 'same-origin',
      'cf-connecting-ip': '203.0.113.10',
      ...init.headers,
    },
  });
  return [request, { params: Promise.resolve({ path }) }];
}

const balancePath = ['extended', 'v1', 'address', STX_ADDRESS, 'stx'];
const callReadPath = ['v2', 'contracts', 'call-read', STX_ADDRESS, 'pool-v2-0', 'get-position'];
const callReadBody = JSON.stringify({ sender: STX_ADDRESS, arguments: ['0x0516'] });

describe('/api/hiro/[...path]', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ balance: '1000000' })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('forwards each allow-listed GET path upstream', async () => {
    const paths = [
      balancePath,
      ['extended', 'v1', 'address', STX_ADDRESS, 'transactions'],
      ['v1', 'addresses', 'stacks', STX_ADDRESS],
      ['extended', 'v1', 'tokens', 'nft', 'holdings'],
      ['metadata', 'v1', 'nft', `${STX_ADDRESS}.some-contract`, '42'],
    ];
    for (const path of paths) {
      vi.mocked(fetch).mockClear();
      const res = await GET(...proxyRequest(path));
      expect(res.status).toBe(200);
      expect(fetch).toHaveBeenCalledOnce();
    }
  });

  it('refuses a path outside the allow-list', async () => {
    const res = await GET(...proxyRequest(['extended', 'v1', 'status']));

    expect(res.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('refuses the call-read path over GET', async () => {
    const res = await GET(...proxyRequest(callReadPath));

    expect(res.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('re-encodes path segments so a smuggled slash cannot rewrite the path', async () => {
    // Next decodes `%2F` inside a segment to a literal `/`; re-encoding keeps
    // it one segment upstream instead of letting it splice new path levels.
    await GET(...proxyRequest(['extended', 'v1', 'address', `${STX_ADDRESS}/../..`, 'stx']));

    const upstreamUrl = String(vi.mocked(fetch).mock.calls[0]?.[0]);
    expect(upstreamUrl).toContain(`${STX_ADDRESS}%2F..%2F..`);
    expect(upstreamUrl).not.toContain(`${STX_ADDRESS}/../..`);
  });

  it('forwards only whitelisted query params', async () => {
    await GET(
      ...proxyRequest(['extended', 'v1', 'tokens', 'nft', 'holdings'], {
        query: `?principal=${STX_ADDRESS}&limit=200&apikey=client-injected&unanchored=true`,
      }),
    );

    const upstreamUrl = String(vi.mocked(fetch).mock.calls[0]?.[0]);
    expect(upstreamUrl).toContain(`principal=${STX_ADDRESS}`);
    expect(upstreamUrl).toContain('limit=200');
    expect(upstreamUrl).not.toContain('apikey');
    expect(upstreamUrl).not.toContain('unanchored');
  });

  it('attaches the server key as x-api-key without echoing it in the response', async () => {
    vi.stubEnv('HIRO_API_KEY', 'secret-key-123');

    const res = await GET(...proxyRequest(balancePath));
    const text = await res.text();

    expect(res.headers.get('x-stackr-hiro-upstream')).toBe('keyed');
    expect(text).not.toContain('secret-key-123');
    const init = vi.mocked(fetch).mock.calls[0]?.[1];
    const headers = new Headers(init?.headers);
    expect(headers.get('x-api-key')).toBe('secret-key-123');
  });

  it('forwards keyless when no server key is configured', async () => {
    const res = await GET(...proxyRequest(balancePath));

    expect(res.headers.get('x-stackr-hiro-upstream')).toBe('public');
    const init = vi.mocked(fetch).mock.calls[0]?.[1];
    const headers = new Headers(init?.headers);
    expect(headers.get('x-api-key')).toBeNull();
  });

  it('proxies a valid call-read POST with its body intact', async () => {
    const res = await POST(...proxyRequest(callReadPath, { method: 'POST', body: callReadBody }));

    expect(res.status).toBe(200);
    const init = vi.mocked(fetch).mock.calls[0]?.[1];
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe(callReadBody);
  });

  it('refuses a POST body that is not the call-read shape', async () => {
    const res = await POST(
      ...proxyRequest(callReadPath, {
        method: 'POST',
        body: JSON.stringify({ sender: STX_ADDRESS, arguments: [42] }),
      }),
    );

    expect(res.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('refuses a POST to a non-call-read path', async () => {
    const res = await POST(...proxyRequest(balancePath, { method: 'POST', body: callReadBody }));

    expect(res.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('refuses cross-origin requests', async () => {
    const res = await GET(
      ...proxyRequest(balancePath, { headers: { origin: 'https://evil.example' } }),
    );

    expect(res.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('refuses cross-site requests flagged by Sec-Fetch-Site', async () => {
    const res = await GET(
      ...proxyRequest(balancePath, { headers: { 'sec-fetch-site': 'cross-site' } }),
    );

    expect(res.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('sets no-store + nosniff on success responses (wallet data)', async () => {
    const res = await GET(...proxyRequest(balancePath));

    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('maps upstream transport failure to the fixed 502 contract', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('connect ECONNREFUSED upstream-with-key');
      }),
    );

    const res = await GET(...proxyRequest(balancePath));
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(body.error).toBe('upstream unavailable');
  });

  it('does not forward upstream HTTP error bodies verbatim', async () => {
    vi.stubEnv('HIRO_API_KEY', 'secret-key-123');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('key secret-key-123 rejected', { status: 500 })),
    );

    const res = await GET(...proxyRequest(balancePath));
    const text = await res.text();

    expect(res.status).toBe(502);
    expect(text).not.toContain('secret-key-123');
  });
});
