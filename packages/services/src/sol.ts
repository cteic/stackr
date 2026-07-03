import { z } from 'zod';
import type { Balance } from '@stackr/models';
import { BalanceSchema, chainMeta } from '@stackr/models';
import type { BalanceAdapter } from './ports.js';
import { parseOrThrow } from './validate.js';
import { formatBaseUnits } from './base-units.js';
import { resolveSolanaRpcUrl } from './sol-rpc.js';

/**
 * Ingress schema for a Solana `getBalance` JSON-RPC response. The lamport
 * balance lives at `result.value`.
 *
 * Solana's total supply is ~5e8 SOL = 5e17 lamports, well above
 * `Number.MAX_SAFE_INTEGER` (2^53 ≈ 9e15). JSON serialises the value as a
 * number, so we accept both string and number at the boundary and coerce to
 * string immediately — this keeps the raw value exact through to `rawBalance`.
 */
const SolanaBalanceSchema = z.object({
  result: z.object({
    value: z.union([z.string(), z.number()]).transform(v => String(v)),
  }),
});

export async function fetchSolBalance(address: string): Promise<Balance> {
  const res = await fetch(resolveSolanaRpcUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getBalance',
      params: [address],
    }),
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch SOL balance: ${res.status} ${res.statusText}`);
  }

  // Ingress boundary: validate the JSON-RPC result before reading lamports.
  const data = parseOrThrow(SolanaBalanceSchema, await res.json(), 'sol.fetchBalance(ingress)');

  const lamports = data.result.value;
  const { decimals } = chainMeta.sol;
  const balance = formatBaseUnits(lamports, decimals);

  // Egress boundary: guarantee a valid domain `Balance` leaves the adapter.
  return parseOrThrow(
    BalanceSchema,
    {
      chain: 'sol',
      address,
      rawBalance: lamports,
      balance,
      updatedAt: new Date().toISOString(),
    },
    'sol.fetchBalance(egress)',
  );
}

/** Solana-RPC-backed implementation of the SOL balance port. */
export const solBalanceAdapter: BalanceAdapter = {
  chain: 'sol',
  fetchBalance: address => fetchSolBalance(address),
};
