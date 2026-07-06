import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchGoldPrice, normalizeGoldPrice } from './gold.js';

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

describe('normalizeGoldPrice', () => {
  it('reads the display-currency price and 24h change', () => {
    const price = normalizeGoldPrice(
      { 'pax-gold': { eur: 2100.5, usd: 2300.25, usd_24h_change: 1.2 } },
      'eur',
    );

    expect(price).toEqual({ fiatPerOunce: 2100.5, change24h: 1.2, currency: 'eur' });
  });

  it('falls back to the usd price when the display currency is missing', () => {
    const price = normalizeGoldPrice({ 'pax-gold': { usd: 2300.25 } }, 'eur');

    expect(price.fiatPerOunce).toBe(2300.25);
    expect(price.currency).toBe('eur');
  });

  it('degrades to zeros when CoinGecko omits the id (no throw mid-render)', () => {
    const price = normalizeGoldPrice({}, 'usd');

    expect(price).toEqual({ fiatPerOunce: 0, change24h: 0, currency: 'usd' });
  });
});

describe('fetchGoldPrice', () => {
  it('fetches, validates, and normalizes the PAXG spot price', async () => {
    const fn = mockFetchOnce({ 'pax-gold': { usd: 2300, usd_24h_change: -0.4 } });

    const price = await fetchGoldPrice('usd');

    expect(fn).toHaveBeenCalledWith(
      'https://api.coingecko.com/api/v3/simple/price?ids=pax-gold&vs_currencies=usd,usd&include_24hr_change=true',
    );
    expect(price.fiatPerOunce).toBe(2300);
    expect(price.change24h).toBe(-0.4);
  });

  it('throws on a non-ok response', async () => {
    mockFetchOnce({}, false);

    await expect(fetchGoldPrice('usd')).rejects.toThrow('CoinGecko API error: 500');
  });

  it('rejects a malformed payload at the ingress boundary', async () => {
    mockFetchOnce({ 'pax-gold': { usd: 'not-a-number' } });

    await expect(fetchGoldPrice('usd')).rejects.toThrow('gold.fetchGoldPrice(ingress)');
  });
});
