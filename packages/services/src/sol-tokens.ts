import { z } from 'zod';
import type { TokenPosition } from '@stackr/models';
import { TokenPositionSchema } from '@stackr/models';
import { assertValidAddress } from './address-guard.js';
import { formatBaseUnits } from './base-units.js';
import { safeFetch } from './fetch-wrapper.js';
import type { TokenPositionAdapter } from './ports.js';
import { resolveSolanaRpcUrl } from './sol-rpc.js';
import { resolveTokenMeta } from './sol-token-registry.js';
import { parseOrThrow } from './validate.js';

/**
 * SPL token positions for a Solana address.
 *
 * Two token programs are in use on Solana — the original SPL Token program and
 * Token-2022 — and an owner can hold accounts under either. They are read in a
 * single JSON-RPC **batch** (the proxy allows batches up to 10) so two programs
 * cost one round trip.
 *
 * `jsonParsed` encoding is what makes this cheap: the RPC does the account
 * decoding, so the response already carries the mint, the raw amount and the
 * mint's decimals, and no `@solana/spl-token` decode is needed on our side.
 */

/** The original SPL Token program. */
const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
/** Token-2022, the extension-capable successor. Holdings can live under either. */
const TOKEN_2022_PROGRAM_ID = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';

const TOKEN_PROGRAM_IDS = [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID];

/**
 * Ingress schema for one `getTokenAccountsByOwner` entry under `jsonParsed`.
 * `amount` is a u64 rendered as a decimal **string** by the RPC, which is why
 * it stays a string all the way to `formatBaseUnits`.
 */
const TokenAccountSchema = z.object({
  account: z.object({
    data: z.object({
      parsed: z.object({
        info: z.object({
          mint: z.string(),
          tokenAmount: z.object({
            amount: z.string(),
            decimals: z.number().int(),
          }),
        }),
      }),
    }),
  }),
});

const TokenAccountsResponseSchema = z.object({
  result: z.object({
    value: z.array(TokenAccountSchema),
  }),
});

/** A JSON-RPC batch response, which may arrive in any order — hence the `id`. */
const TokenAccountsBatchSchema = z.array(
  z.object({
    id: z.number(),
    result: z.object({ value: z.array(TokenAccountSchema) }).optional(),
    error: z.object({ message: z.string() }).optional(),
  }),
);

type TokenAccount = z.infer<typeof TokenAccountSchema>;

/**
 * Collapse raw token accounts into domain positions.
 *
 * An owner can hold several accounts for the same mint (an associated token
 * account plus an auxiliary one), so amounts are summed per mint using BigInt —
 * never a float. Zero-balance accounts are dropped: a closed position leaves
 * its account behind, and rendering a wall of "0 USDC" rows is noise, not data.
 *
 * Pure, so it is unit-tested directly without touching the network.
 */
export function normalizeSolTokenPositions(
  owner: string,
  accounts: TokenAccount[],
  updatedAt: string = new Date().toISOString(),
): TokenPosition[] {
  const byMint = new Map<string, { raw: bigint; decimals: number }>();

  for (const entry of accounts) {
    const { mint, tokenAmount } = entry.account.data.parsed.info;
    const raw = BigInt(tokenAmount.amount);
    const existing = byMint.get(mint);
    if (existing) {
      existing.raw += raw;
    } else {
      byMint.set(mint, { raw, decimals: tokenAmount.decimals });
    }
  }

  const positions = [...byMint.entries()]
    .filter(([, { raw }]) => raw > 0n)
    .map(([mint, { raw, decimals }]) => {
      const meta = resolveTokenMeta(mint);
      return {
        chain: 'sol' as const,
        owner,
        tokenId: mint,
        symbol: meta.symbol,
        name: meta.name,
        decimals,
        rawAmount: raw.toString(),
        amount: formatBaseUnits(raw, decimals),
        updatedAt,
      };
    })
    // Largest position first. Comparing scaled BigInts keeps the ordering exact
    // across mints with different decimals, without ever building a float.
    .sort((a, b) => {
      const scale = (position: TokenPosition) =>
        BigInt(position.rawAmount) * 10n ** BigInt(36 - position.decimals);
      const delta = scale(b) - scale(a);
      if (delta > 0n) return 1;
      if (delta < 0n) return -1;
      return a.tokenId.localeCompare(b.tokenId);
    });

  // Egress boundary: a mapping bug in our own code is caught here too.
  return parseOrThrow(z.array(TokenPositionSchema), positions, 'sol.fetchTokenPositions(egress)');
}

/**
 * Read every SPL token position an address holds.
 *
 * Resolves to `[]` for an address that holds no tokens, so the caller can treat
 * "empty account" and "loaded" as the same success path and render an explicit
 * empty state rather than an error.
 */
export async function fetchSolTokenPositions(address: string): Promise<TokenPosition[]> {
  assertValidAddress('sol', address);

  const response = await safeFetch(resolveSolanaRpcUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(
      TOKEN_PROGRAM_IDS.map((programId, index) => ({
        jsonrpc: '2.0',
        id: index,
        method: 'getTokenAccountsByOwner',
        params: [address, { programId }, { encoding: 'jsonParsed' }],
      })),
    ),
  });

  const payload: unknown = await response.json();

  // A batch request normally returns an array, but a single-entry batch may be
  // answered with a bare object by some RPC providers — accept both.
  const parsed = Array.isArray(payload)
    ? parseOrThrow(TokenAccountsBatchSchema, payload, 'sol.fetchTokenPositions(ingress)')
    : [
        {
          id: 0,
          ...parseOrThrow(TokenAccountsResponseSchema, payload, 'sol.fetchTokenPositions(ingress)'),
        },
      ];

  const accounts = parsed.flatMap(entry => entry.result?.value ?? []);
  return normalizeSolTokenPositions(address, accounts);
}

/** Solana-RPC-backed implementation of the SPL token-position port. */
export const solTokenPositionAdapter: TokenPositionAdapter = {
  chain: 'sol',
  fetchTokenPositions: address => fetchSolTokenPositions(address),
};
