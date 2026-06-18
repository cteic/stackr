import { z } from 'zod';
import type { Balance } from '@stackr/models';
import { BalanceSchema, chainMeta } from '@stackr/models';
import type { BalanceAdapter } from './ports.js';
import { parseOrThrow } from './validate.js';
import { formatBaseUnits } from './base-units.js';
import { safeFetch } from './fetch-wrapper.js';

const HIRO_API = 'https://api.hiro.so';

/**
 * Ingress schema for Hiro's STX balance endpoint. The micro-STX balance is a
 * decimal string; we only depend on `balance` here.
 */
const HiroStxBalanceSchema = z.object({
  balance: z.string(),
});

export async function fetchStxBalance(address: string): Promise<Balance> {
  const res = await safeFetch(`${HIRO_API}/extended/v1/address/${encodeURIComponent(address)}/stx`);

  // Ingress boundary: validate Hiro's payload before reading the balance.
  const data = parseOrThrow(HiroStxBalanceSchema, await res.json(), 'stx.fetchBalance(ingress)');

  const { decimals } = chainMeta.stx;
  const rawBalance = data.balance;
  const balance = formatBaseUnits(rawBalance, decimals);

  // Egress boundary: guarantee a valid domain `Balance` leaves the adapter.
  return parseOrThrow(
    BalanceSchema,
    {
      chain: 'stx',
      address,
      rawBalance,
      balance,
      updatedAt: new Date().toISOString(),
    },
    'stx.fetchBalance(egress)',
  );
}

/** Hiro-backed implementation of the STX balance port. */
export const stxBalanceAdapter: BalanceAdapter = {
  chain: 'stx',
  fetchBalance: address => fetchStxBalance(address),
};

/**
 * Ingress schema for Hiro's BNS-names-by-address endpoint. `names` may be
 * absent or empty for an address that owns no BNS names.
 */
const HiroBnsNamesSchema = z.object({
  names: z.array(z.string()).optional(),
});

/**
 * Reverse-resolve a Stacks address to its primary BNS name (e.g. `pete.btc`).
 * Returns the first name owned by the address, or null if the address holds
 * no BNS names or the Hiro endpoint errors out.
 */
export async function lookupStacksBnsName(address: string): Promise<string | null> {
  const res = await fetch(`${HIRO_API}/v1/addresses/stacks/${encodeURIComponent(address)}`);
  if (!res.ok) return null;
  // This lookup is best-effort UI sugar, so a malformed payload degrades to
  // `null` rather than throwing and breaking the surrounding render.
  const parsed = HiroBnsNamesSchema.safeParse(await res.json());
  if (!parsed.success) return null;
  return parsed.data.names?.[0] ?? null;
}
