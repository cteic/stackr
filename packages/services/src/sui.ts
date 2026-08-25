import { z } from 'zod';
import { assertValidAddress } from './address-guard.js';
import type { Balance } from '@stackr/models';
import { BalanceSchema, chainMeta } from '@stackr/models';
import type { BalanceAdapter } from './ports.js';
import { parseOrThrow } from './validate.js';
import { formatBaseUnits } from './base-units.js';

const SUI_RPC = 'https://fullnode.mainnet.sui.io';

/** The native SUI coin type; passing it explicitly keeps us to native balances. */
const SUI_COIN_TYPE = '0x2::sui::SUI';

/**
 * Ingress schema for a Sui `suix_getBalance` JSON-RPC response. `totalBalance`
 * is the address's aggregate balance for the queried coin type, returned as a
 * decimal **string** because it can exceed 2^53 MIST — so it must stay a string
 * all the way into the BigInt-based formatter, never `Number(...)`.
 */
const SuiBalanceSchema = z.object({
  result: z.object({
    coinType: z.string(),
    totalBalance: z.string(),
  }),
});

export async function fetchSuiBalance(address: string): Promise<Balance> {
  assertValidAddress('sui', address);
  const res = await fetch(SUI_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'suix_getBalance',
      params: [address, SUI_COIN_TYPE],
    }),
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch SUI balance: ${res.status} ${res.statusText}`);
  }

  // Ingress boundary: validate the JSON-RPC result before reading MIST.
  const data = parseOrThrow(SuiBalanceSchema, await res.json(), 'sui.fetchBalance(ingress)');

  // `totalBalance` stays a string into `formatBaseUnits`, whose BigInt math is
  // exact at MIST scale — no float ever touches it.
  const mist = data.result.totalBalance;
  const { decimals } = chainMeta.sui;
  const balance = formatBaseUnits(mist, decimals);

  // Egress boundary: guarantee a valid domain `Balance` leaves the adapter.
  return parseOrThrow(
    BalanceSchema,
    {
      chain: 'sui',
      address,
      rawBalance: mist,
      balance,
      updatedAt: new Date().toISOString(),
    },
    'sui.fetchBalance(egress)',
  );
}

/** Public-fullnode-backed implementation of the SUI balance port. */
export const suiBalanceAdapter: BalanceAdapter = {
  chain: 'sui',
  fetchBalance: address => fetchSuiBalance(address),
};
