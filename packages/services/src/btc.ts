import { z } from 'zod';
import { assertValidAddress } from './address-guard.js';
import type { Balance } from '@stackr/models';
import { BalanceSchema, chainMeta } from '@stackr/models';
import type { BalanceAdapter } from './ports.js';
import { parseOrThrow } from './validate.js';
import { formatBaseUnits } from './base-units.js';

const BLOCKSTREAM_API = 'https://blockstream.info/api';

/**
 * Ingress schema for Blockstream's address endpoint. Kept private to this
 * module — this vendor shape must never escape the adapter. We model only the
 * fields we consume; Blockstream returns more.
 *
 * Sats fields are validated as numbers at the JSON boundary. Bitcoin's total
 * supply is 21M × 1e8 = 2.1e15 satoshis, which is within
 * `Number.MAX_SAFE_INTEGER` (2^53 ≈ 9e15), so JSON number precision is not at
 * risk. The arithmetic below then uses BigInt to keep the intent documented.
 */
const BlockstreamAddressSchema = z.object({
  chain_stats: z.object({
    funded_txo_sum: z.number(),
    spent_txo_sum: z.number(),
  }),
  mempool_stats: z.object({
    funded_txo_sum: z.number(),
    spent_txo_sum: z.number(),
  }),
});

export async function fetchBtcBalance(address: string): Promise<Balance> {
  assertValidAddress('btc', address);
  const res = await fetch(`${BLOCKSTREAM_API}/address/${encodeURIComponent(address)}`);

  if (!res.ok) {
    throw new Error(`Failed to fetch BTC balance: ${res.status} ${res.statusText}`);
  }

  // Ingress boundary: validate Blockstream's payload before we read from it.
  const data = parseOrThrow(
    BlockstreamAddressSchema,
    await res.json(),
    'btc.fetchBalance(ingress)',
  );

  const confirmedBalance =
    BigInt(data.chain_stats.funded_txo_sum) - BigInt(data.chain_stats.spent_txo_sum);
  const mempoolBalance =
    BigInt(data.mempool_stats.funded_txo_sum) - BigInt(data.mempool_stats.spent_txo_sum);
  const totalSatoshis = confirmedBalance + mempoolBalance;

  const { decimals } = chainMeta.btc;
  const rawBalance = totalSatoshis.toString();
  const balance = formatBaseUnits(rawBalance, decimals);

  // Egress boundary: guarantee a valid domain `Balance` leaves the adapter.
  return parseOrThrow(
    BalanceSchema,
    {
      chain: 'btc',
      address,
      rawBalance,
      balance,
      updatedAt: new Date().toISOString(),
    },
    'btc.fetchBalance(egress)',
  );
}

/** Blockstream-backed implementation of the BTC balance port. */
export const btcBalanceAdapter: BalanceAdapter = {
  chain: 'btc',
  fetchBalance: address => fetchBtcBalance(address),
};
