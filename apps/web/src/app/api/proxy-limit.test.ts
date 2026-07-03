import { afterEach, describe, expect, it, vi } from 'vitest';

// The fleet limiter resolves through getCloudflareContext; tests swap the
// implementation per case (throwing = outside the Workers runtime).
const getCloudflareContext = vi.fn<() => Promise<{ env: unknown }>>();
vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: () => getCloudflareContext(),
}));

const { checkProxyRateLimit } = await import('./proxy-limit');

function limitRequest(headers: Record<string, string>): Request {
  return new Request('https://stackr.ie/api/anything', { headers });
}

// Each case uses its own client IP: the in-isolate window is module state, so
// distinct keys keep cases independent without reaching into internals.
let lastOctet = 0;
function nextIp(): string {
  lastOctet += 1;
  return `203.0.113.${lastOctet}`;
}

function outsideWorkersRuntime(): void {
  getCloudflareContext.mockRejectedValue(new Error('not in workers runtime'));
}

afterEach(() => {
  vi.useRealTimers();
  getCloudflareContext.mockReset();
});

describe('checkProxyRateLimit', () => {
  it('fails closed when no client key can be resolved', async () => {
    outsideWorkersRuntime();

    expect(await checkProxyRateLimit(limitRequest({}), 'eth')).toBe('unidentified');
  });

  it('keys off cf-connecting-ip, falling back to the forwarded-for chain', async () => {
    outsideWorkersRuntime();

    const viaConnectingIp = limitRequest({ 'cf-connecting-ip': nextIp() });
    const viaForwardedFor = limitRequest({ 'x-forwarded-for': `${nextIp()}, 70.41.3.18` });

    expect(await checkProxyRateLimit(viaConnectingIp, 'eth')).toBe('allowed');
    expect(await checkProxyRateLimit(viaForwardedFor, 'eth')).toBe('allowed');
  });

  it('limits the 121st request in a minute from one client on one route', async () => {
    outsideWorkersRuntime();
    const request = limitRequest({ 'cf-connecting-ip': nextIp() });

    for (let i = 0; i < 120; i += 1) {
      expect(await checkProxyRateLimit(request, 'eth')).toBe('allowed');
    }
    expect(await checkProxyRateLimit(request, 'eth')).toBe('limited');
  });

  it('scopes the allowance per route, so one proxy cannot exhaust another', async () => {
    outsideWorkersRuntime();
    const request = limitRequest({ 'cf-connecting-ip': nextIp() });

    for (let i = 0; i < 121; i += 1) {
      await checkProxyRateLimit(request, 'eth');
    }
    expect(await checkProxyRateLimit(request, 'eth')).toBe('limited');
    expect(await checkProxyRateLimit(request, 'stocks')).toBe('allowed');
  });

  it('resets the in-isolate window after a minute', async () => {
    outsideWorkersRuntime();
    vi.useFakeTimers();
    const request = limitRequest({ 'cf-connecting-ip': nextIp() });

    for (let i = 0; i < 121; i += 1) {
      await checkProxyRateLimit(request, 'eth');
    }
    expect(await checkProxyRateLimit(request, 'eth')).toBe('limited');

    vi.advanceTimersByTime(61_000);
    expect(await checkProxyRateLimit(request, 'eth')).toBe('allowed');
  });

  it('consults the fleet limiter binding and honours its denial', async () => {
    const limit = vi.fn(async () => ({ success: false }));
    getCloudflareContext.mockResolvedValue({ env: { PROXY_RATE_LIMITER: { limit } } });
    const request = limitRequest({ 'cf-connecting-ip': nextIp() });

    expect(await checkProxyRateLimit(request, 'etherscan')).toBe('limited');
    expect(limit).toHaveBeenCalledWith({ key: expect.stringContaining('etherscan:ip:') });
  });

  it('allows when the fleet limiter approves', async () => {
    const limit = vi.fn(async () => ({ success: true }));
    getCloudflareContext.mockResolvedValue({ env: { PROXY_RATE_LIMITER: { limit } } });
    const request = limitRequest({ 'cf-connecting-ip': nextIp() });

    expect(await checkProxyRateLimit(request, 'eth')).toBe('allowed');
    expect(limit).toHaveBeenCalledOnce();
  });

  it('degrades to the in-isolate window when the binding is absent', async () => {
    getCloudflareContext.mockResolvedValue({ env: {} });
    const request = limitRequest({ 'cf-connecting-ip': nextIp() });

    expect(await checkProxyRateLimit(request, 'eth')).toBe('allowed');
  });

  it('does not take the proxy down when the binding call throws', async () => {
    const limit = vi.fn(async () => {
      throw new Error('ratelimit binding unavailable');
    });
    getCloudflareContext.mockResolvedValue({ env: { PROXY_RATE_LIMITER: { limit } } });
    const request = limitRequest({ 'cf-connecting-ip': nextIp() });

    expect(await checkProxyRateLimit(request, 'eth')).toBe('allowed');
  });
});
