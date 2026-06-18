import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchBalance } from './index';

// Valid per-chain addresses — `fetchBalance` now validates at the boundary, so
// fixtures must pass `validateAddress` before any normalization is exercised.
const BTC_ADDR = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';
const ETH_ADDR = '0x742d35Cc6634C0532925a3b844Bc454e4438f44e';
const SOL_ADDR = 'So11111111111111111111111111111111111111112';
const STX_ADDR = 'SP2J6ZY48GV1EZ5V2V5RB9MP66SW86BZWVF6JM75H';
const SUI_ADDR = `0x${'b'.repeat(64)}`;

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

describe('balance adapters — normalization', () => {
  it('normalizes a Blockstream BTC payload (confirmed + mempool, 8 decimals)', async () => {
    mockFetchOnce({
      chain_stats: { funded_txo_sum: 150_000_000, spent_txo_sum: 50_000_000 },
      mempool_stats: { funded_txo_sum: 0, spent_txo_sum: 0 },
    });

    const balance = await fetchBalance('btc', BTC_ADDR);

    expect(balance).toMatchObject({
      chain: 'btc',
      address: BTC_ADDR,
      rawBalance: '100000000',
      balance: '1.00000000',
    });
    // updatedAt must be a valid ISO timestamp (egress schema enforces this).
    expect(() => new Date(balance.updatedAt).toISOString()).not.toThrow();
  });

  it('normalizes an Etherscan ETH payload (18 decimals)', async () => {
    mockFetchOnce({ status: '1', message: 'OK', result: '1000000000000000000' });

    const balance = await fetchBalance('eth', ETH_ADDR);

    expect(balance).toMatchObject({
      chain: 'eth',
      rawBalance: '1000000000000000000',
      balance: '1.000000000000000000',
    });
  });

  it('normalizes a Solana getBalance payload (9 decimals)', async () => {
    mockFetchOnce({ result: { context: { slot: 1 }, value: 2_000_000_000 } });

    const balance = await fetchBalance('sol', SOL_ADDR);

    expect(balance).toMatchObject({
      chain: 'sol',
      rawBalance: '2000000000',
      balance: '2.000000000',
    });
  });

  it('normalizes a Sui getBalance payload (9 decimals, MIST string)', async () => {
    mockFetchOnce({ result: { coinType: '0x2::sui::SUI', totalBalance: '4000000000' } });

    const balance = await fetchBalance('sui', SUI_ADDR);

    expect(balance).toMatchObject({
      chain: 'sui',
      rawBalance: '4000000000',
      balance: '4.000000000',
    });
  });

  it('normalizes a Hiro STX payload (6 decimals)', async () => {
    mockFetchOnce({ balance: '5000000' });

    const balance = await fetchBalance('stx', STX_ADDR);

    expect(balance).toMatchObject({ chain: 'stx', rawBalance: '5000000', balance: '5.000000' });
  });
});

describe('balance adapters — precision (P3.15)', () => {
  it('preserves a Solana lamport balance above 2^53 exactly (string ingress)', async () => {
    // u64 max lamports — well above Number.MAX_SAFE_INTEGER (2^53 ≈ 9.007e15).
    // A string ingress value never touches IEEE-754, so it must format exactly.
    mockFetchOnce({ result: { value: '18446744073709551615' } });

    const balance = await fetchBalance('sol', SOL_ADDR);

    expect(balance.rawBalance).toBe('18446744073709551615');
    expect(balance.balance).toBe('18446744073.709551615');
  });

  it('preserves a Blockstream sat sum above 2^53 exactly (string ingress)', async () => {
    // Defensive: sat sums are modeled as strings end-to-end, so even a value
    // beyond the BTC supply formats without float corruption.
    mockFetchOnce({
      chain_stats: { funded_txo_sum: '90071992547409930', spent_txo_sum: '0' },
      mempool_stats: { funded_txo_sum: '0', spent_txo_sum: '0' },
    });

    const balance = await fetchBalance('btc', BTC_ADDR);

    expect(balance.rawBalance).toBe('90071992547409930');
    expect(balance.balance).toBe('900719925.47409930');
  });
});

describe('balance adapters — boundary enforcement', () => {
  it('throws a context-tagged error when the vendor shape is wrong (ingress)', async () => {
    mockFetchOnce({ unexpected: true });

    await expect(fetchBalance('btc', BTC_ADDR)).rejects.toThrow(/btc\.fetchBalance\(ingress\)/);
  });

  it('surfaces Etherscan in-band errors (status !== "1")', async () => {
    mockFetchOnce({ status: '0', message: 'NOTOK', result: 'rate limited' });

    await expect(fetchBalance('eth', ETH_ADDR)).rejects.toThrow(/Etherscan API error: NOTOK/);
  });

  it('never carries an api key in the ETH request — the proxy applies it server-side', async () => {
    const fn = mockFetchOnce({ status: '1', message: 'OK', result: '0' });

    await fetchBalance('eth', ETH_ADDR);

    // Non-browser context (no window) → public base, and crucially no `apikey`
    // is ever interpolated client-side. In the browser it targets the proxy.
    const calledUrl = String(fn.mock.calls[0]?.[0]);
    expect(calledUrl).not.toContain('apikey=');
  });
});
