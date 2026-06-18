import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchSuiBalance } from './sui';
import { isServiceException } from './service-error';

/** Build a minimal `Response`-like object backing a single fetch call. */
function mockFetchOnce(body: unknown, ok = true) {
  const fn = vi.fn(async (_url?: unknown, _init?: unknown) => ({
    ok,
    status: ok ? 200 : 500,
    statusText: ok ? 'OK' : 'Error',
    json: async () => body,
  }));
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const ADDRESS = `0x${'a'.repeat(64)}`;

describe('fetchSuiBalance', () => {
  it('normalizes a suix_getBalance payload (9 decimals, MIST)', async () => {
    mockFetchOnce({
      jsonrpc: '2.0',
      id: 1,
      result: { coinType: '0x2::sui::SUI', coinObjectCount: 3, totalBalance: '2500000000' },
    });

    const balance = await fetchSuiBalance(ADDRESS);

    expect(balance).toMatchObject({
      chain: 'sui',
      address: ADDRESS,
      rawBalance: '2500000000',
      balance: '2.500000000',
    });
    // updatedAt must be a valid ISO timestamp (egress schema enforces this).
    expect(() => new Date(balance.updatedAt).toISOString()).not.toThrow();
  });

  it('preserves full precision on a MIST balance beyond 2^53 (no float math)', async () => {
    // 1.23e17 MIST is well past Number.MAX_SAFE_INTEGER (~9.0e15); reading it
    // through Number(...) would silently round. The string must survive exact.
    mockFetchOnce({
      jsonrpc: '2.0',
      id: 1,
      result: { coinType: '0x2::sui::SUI', coinObjectCount: 9, totalBalance: '123456789123456789' },
    });

    const balance = await fetchSuiBalance(ADDRESS);

    expect(balance.rawBalance).toBe('123456789123456789');
    expect(balance.balance).toBe('123456789.123456789');
  });

  it('throws a context-tagged error when the vendor shape is wrong (ingress)', async () => {
    mockFetchOnce({ jsonrpc: '2.0', id: 1, result: { totalBalance: 42 } });

    await expect(fetchSuiBalance(ADDRESS)).rejects.toThrow(/sui\.fetchBalance\(ingress\)/);
  });

  it('maps a non-OK RPC response to a structured upstream error', async () => {
    mockFetchOnce({}, false);

    const error: unknown = await fetchSuiBalance(ADDRESS).catch(e => e);

    if (!isServiceException(error)) throw new Error('expected a ServiceException');
    expect(error.serviceError).toMatchObject({ kind: 'upstream', status: 500 });
  });

  it('queries the native SUI coin type explicitly', async () => {
    const fn = mockFetchOnce({
      jsonrpc: '2.0',
      id: 1,
      result: { coinType: '0x2::sui::SUI', coinObjectCount: 0, totalBalance: '0' },
    });

    await fetchSuiBalance(ADDRESS);

    const body = JSON.parse(
      String(fn.mock.calls[0]?.[1] && (fn.mock.calls[0][1] as RequestInit).body),
    );
    expect(body).toMatchObject({ method: 'suix_getBalance', params: [ADDRESS, '0x2::sui::SUI'] });
  });
});
