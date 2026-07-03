import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchEthBalancePublic, fetchEthActivityPublic } from './eth-public';

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

const ADDRESS = '0x1111111111111111111111111111111111111111';

describe('fetchEthBalancePublic', () => {
  it('normalizes an eth_getBalance hex result to a domain Balance', async () => {
    // 1.5 ETH in wei.
    mockFetchOnce({ jsonrpc: '2.0', id: 1, result: '0x14d1120d7b160000' });

    const balance = await fetchEthBalancePublic(ADDRESS);

    expect(balance).toMatchObject({
      chain: 'eth',
      address: ADDRESS,
      rawBalance: '1500000000000000000',
      balance: '1.500000000000000000',
    });
  });

  it('preserves precision on a wei balance beyond 2^53', async () => {
    // 12345678901234567890 wei > Number.MAX_SAFE_INTEGER.
    mockFetchOnce({ result: '0xab54a98ceb1f0ad2' });

    const balance = await fetchEthBalancePublic(ADDRESS);

    expect(balance.rawBalance).toBe('12345678901234567890');
  });

  it('rejects a malformed RPC result at the ingress boundary', async () => {
    mockFetchOnce({ result: 'not-hex' });

    await expect(fetchEthBalancePublic(ADDRESS)).rejects.toThrow();
  });

  it('targets the public RPC URL, never a relative proxy path', async () => {
    const fn = mockFetchOnce({ result: '0x0' });

    await fetchEthBalancePublic(ADDRESS);

    const url = fn.mock.calls[0]?.[0];
    expect(typeof url).toBe('string');
    expect(String(url).startsWith('https://')).toBe(true);
  });
});

describe('fetchEthActivityPublic', () => {
  it('normalizes a txlist result through the shared normalizer', async () => {
    mockFetchOnce({
      status: '1',
      result: [
        {
          hash: '0xabc',
          from: '0x2222222222222222222222222222222222222222',
          to: ADDRESS,
          value: '1000000000000000000',
          timeStamp: '1751500000',
        },
      ],
    });

    const txs = await fetchEthActivityPublic(ADDRESS);

    expect(txs).toHaveLength(1);
    expect(txs[0]).toMatchObject({ chain: 'eth', type: 'receive', hash: '0xabc' });
  });

  it('maps the string "No transactions found" result to an empty feed', async () => {
    mockFetchOnce({ status: '0', result: 'No transactions found' });

    expect(await fetchEthActivityPublic(ADDRESS)).toEqual([]);
  });
});
