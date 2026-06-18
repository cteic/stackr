import { z } from 'zod';
import type { Balance } from '@stackr/models';
import { BalanceSchema, chainMeta } from '@stackr/models';
import type { BalanceAdapter } from './ports.js';
import { parseOrThrow } from './validate.js';
import { formatBaseUnits } from './base-units.js';
import { safeFetch } from './fetch-wrapper.js';

const BLOCKSTREAM_API = 'https://blockstream.info/api';

/**
 * A satoshi sum field. Modeled as a string end-to-end (like STX micro-units and
 * SUI MIST): a JSON number above 2^53 has already lost precision by the time
 * Zod sees it, so we accept either representation and coerce to a string
 * immediately, keeping the raw value exact through to the BigInt math below.
 */
const SatSumSchema = z.union([z.string(), z.number()]).transform(v => String(v));

/**
 * Ingress schema for Blockstream's address endpoint. Kept private to this
 * module — this vendor shape must never escape the adapter. We model only the
 * fields we consume; Blockstream returns more.
 */
const BlockstreamAddressSchema = z.object({
  chain_stats: z.object({
    funded_txo_sum: SatSumSchema,
    spent_txo_sum: SatSumSchema,
  }),
  mempool_stats: z.object({
    funded_txo_sum: SatSumSchema,
    spent_txo_sum: SatSumSchema,
  }),
});

export async function fetchBtcBalance(address: string): Promise<Balance> {
  const res = await safeFetch(`${BLOCKSTREAM_API}/address/${encodeURIComponent(address)}`);

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
