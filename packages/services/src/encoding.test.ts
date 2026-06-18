import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchBtcBalance } from './btc';
import { fetchStxBalance } from './stx';
import { fetchKaminoPosition } from './health/kamino';

// A value carrying URL-significant characters. The adapters never accept this
// past the boundary guard, but they still percent-encode every interpolated
// segment so a bypassed/extra caller can't break out of the path.
const RAW = 'a/b?c#d';
const ENCODED = encodeURIComponent(RAW); // a%2Fb%3Fc%23d

function stubFetch(body: unknown) {
  const fn = vi.fn(async (_url?: unknown, _init?: unknown) => ({
    ok: true,
    status: 200,
    json: async () => body,
  }));
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('adapters percent-encode interpolated address segments', () => {
  it('encodes the address in the Blockstream path (BTC)', async () => {
    const fn = stubFetch({
      chain_stats: { funded_txo_sum: 0, spent_txo_sum: 0 },
      mempool_stats: { funded_txo_sum: 0, spent_txo_sum: 0 },
    });

    await fetchBtcBalance(RAW);

    const url = String(fn.mock.calls[0]?.[0]);
    expect(url).toContain(`/address/${ENCODED}`);
    expect(url).not.toContain(`/address/${RAW}`);
  });

  it('encodes the address in the Hiro path (STX)', async () => {
    const fn = stubFetch({ balance: '0' });

    await fetchStxBalance(RAW);

    const url = String(fn.mock.calls[0]?.[0]);
    expect(url).toContain(`/address/${ENCODED}/stx`);
    expect(url).not.toContain(RAW);
  });

  it('encodes the address in the Kamino obligations path (SOL)', async () => {
    const fn = stubFetch([]);

    await fetchKaminoPosition(RAW);

    const url = String(fn.mock.calls[0]?.[0]);
    expect(url).toContain(`/users/${ENCODED}/obligations`);
    expect(url).not.toContain(`/users/${RAW}/`);
  });
});
