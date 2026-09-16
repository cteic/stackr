import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchSolTokenPositions, normalizeSolTokenPositions } from './sol-tokens.js';
import { resolveTokenMeta, truncateMint } from './sol-token-registry.js';
import { isServiceException } from './service-error.js';

const OWNER = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const BONK = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';
const UNKNOWN_MINT = 'AbCdEfGhIjKlMnOpQrStUvWxYz123456789aBcDeFgH';
const NOW = '2026-01-01T00:00:00.000Z';

function account(mint: string, amount: string, decimals: number) {
  return {
    account: { data: { parsed: { info: { mint, tokenAmount: { amount, decimals } } } } },
  };
}

function batchResponse(...groups: ReturnType<typeof account>[][]) {
  return groups.map((value, id) => ({ jsonrpc: '2.0', id, result: { value } }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('resolveTokenMeta', () => {
  it('returns the real symbol for a registered mint', () => {
    expect(resolveTokenMeta(USDC)).toEqual({ symbol: 'USDC', name: 'USD Coin' });
  });

  it('falls back to a truncated mint for an unknown one', () => {
    const meta = resolveTokenMeta(UNKNOWN_MINT);
    expect(meta.symbol).toBe(truncateMint(UNKNOWN_MINT));
    expect(meta.symbol).toBe('AbCd…eFgH');
  });

  it('leaves a short identifier untouched', () => {
    expect(truncateMint('SHORT')).toBe('SHORT');
  });
});

describe('normalizeSolTokenPositions', () => {
  it('scales the raw amount by the mint decimals', () => {
    const [position] = normalizeSolTokenPositions(OWNER, [account(USDC, '1234567', 6)], NOW);

    expect(position).toEqual({
      chain: 'sol',
      owner: OWNER,
      tokenId: USDC,
      symbol: 'USDC',
      name: 'USD Coin',
      decimals: 6,
      rawAmount: '1234567',
      amount: '1.234567',
      updatedAt: NOW,
    });
  });

  it('keeps u64 amounts exact past Number.MAX_SAFE_INTEGER', () => {
    const raw = '18446744073709551615';
    const [position] = normalizeSolTokenPositions(OWNER, [account(USDC, raw, 6)], NOW);

    expect(position.rawAmount).toBe(raw);
    expect(position.amount).toBe('18446744073709.551615');
  });

  it('sums several accounts for the same mint', () => {
    const positions = normalizeSolTokenPositions(
      OWNER,
      [account(USDC, '1000000', 6), account(USDC, '500000', 6)],
      NOW,
    );

    expect(positions).toHaveLength(1);
    expect(positions[0].amount).toBe('1.500000');
  });

  it('drops zero-balance accounts left behind by a closed position', () => {
    const positions = normalizeSolTokenPositions(
      OWNER,
      [account(USDC, '0', 6), account(BONK, '100000', 5)],
      NOW,
    );

    expect(positions.map(p => p.symbol)).toEqual(['BONK']);
  });

  it('orders positions by size across mints with different decimals', () => {
    const positions = normalizeSolTokenPositions(
      OWNER,
      // 1 USDC (6dp) vs 500 BONK (5dp) — the larger scaled amount comes first.
      [account(USDC, '1000000', 6), account(BONK, '50000000', 5)],
      NOW,
    );

    expect(positions.map(p => p.symbol)).toEqual(['BONK', 'USDC']);
  });

  it('returns an empty list for an account holding nothing', () => {
    expect(normalizeSolTokenPositions(OWNER, [], NOW)).toEqual([]);
  });
});

describe('fetchSolTokenPositions', () => {
  it('merges both token programs from one batched request', async () => {
    const sentBodies: string[] = [];
    vi.stubGlobal('fetch', async (_url: string, init?: { body?: string }) => {
      sentBodies.push(init?.body ?? '');
      return Response.json(
        batchResponse([account(USDC, '2000000', 6)], [account(BONK, '300000', 5)]),
      );
    });

    const positions = await fetchSolTokenPositions(OWNER);

    // One round trip for both token programs, sent as a JSON-RPC batch.
    expect(sentBodies).toHaveLength(1);
    const body: unknown = JSON.parse(sentBodies[0]);
    expect(Array.isArray(body)).toBe(true);
    expect(positions.map(p => p.symbol).sort()).toEqual(['BONK', 'USDC']);
  });

  it('resolves to an empty list for an account with no token accounts', async () => {
    vi.stubGlobal('fetch', async () => Response.json(batchResponse([], [])));

    await expect(fetchSolTokenPositions(OWNER)).resolves.toEqual([]);
  });

  it('surfaces a proxy 429 as a rate-limited service error', async () => {
    vi.stubGlobal('fetch', async () => new Response('{}', { status: 429 }));

    const error: unknown = await fetchSolTokenPositions(OWNER).catch((e: unknown) => e);
    expect(isServiceException(error) && error.serviceError.kind).toBe('rate-limited');
  });

  it('surfaces an upstream failure as an upstream service error', async () => {
    vi.stubGlobal('fetch', async () => new Response('{}', { status: 502 }));

    const error: unknown = await fetchSolTokenPositions(OWNER).catch((e: unknown) => e);
    expect(isServiceException(error) && error.serviceError.kind).toBe('upstream');
  });

  it('rejects an address that is not a Solana address before any network call', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', async () => {
      calls += 1;
      return Response.json(batchResponse([], []));
    });

    await expect(fetchSolTokenPositions('0xnot-a-solana-address')).rejects.toThrow();
    expect(calls).toBe(0);
  });
});
