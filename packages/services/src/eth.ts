import { z } from 'zod';
import { assertValidAddress } from './address-guard.js';
import type { Balance } from '@stackr/models';
import { BalanceSchema, chainMeta } from '@stackr/models';
import type { BalanceAdapter } from './ports.js';
import { parseOrThrow } from './validate.js';
import { formatBaseUnits } from './base-units.js';
import { resolveEtherscanBase } from './etherscan-config.js';

/**
 * Ingress schema for Etherscan's `account.balance` response. Etherscan wraps
 * every result in a `status`/`message`/`result` envelope and signals failure
 * via `status === '0'` (HTTP is still 200), so the envelope itself is the only
 * reliable success signal.
 */
const EtherscanBalanceSchema = z.object({
  status: z.string(),
  message: z.string(),
  result: z.string(),
});

export async function fetchEthBalance(address: string): Promise<Balance> {
  assertValidAddress('eth', address);
  const params = new URLSearchParams({
    module: 'account',
    action: 'balance',
    address,
    tag: 'latest',
  });

  // In the browser this resolves to the same-origin proxy, which appends the
  // server-only `ETHERSCAN_API_KEY`; the client never carries a key. Outside
  // the browser it hits the public base keyless (rate-limited, but functional).
  const res = await fetch(`${resolveEtherscanBase()}?${params}`);

  if (!res.ok) {
    throw new Error(`Failed to fetch ETH balance: ${res.status} ${res.statusText}`);
  }

  // Ingress boundary: validate the envelope, then check the in-band status.
  const data = parseOrThrow(EtherscanBalanceSchema, await res.json(), 'eth.fetchBalance(ingress)');

  if (data.status !== '1') {
    throw new Error(`Etherscan API error: ${data.message}`);
  }

  const { decimals } = chainMeta.eth;
  const rawBalance = data.result;
  const balance = formatBaseUnits(rawBalance, decimals);

  // Egress boundary: guarantee a valid domain `Balance` leaves the adapter.
  return parseOrThrow(
    BalanceSchema,
    {
      chain: 'eth',
      address,
      rawBalance,
      balance,
      updatedAt: new Date().toISOString(),
    },
    'eth.fetchBalance(egress)',
  );
}

/**
 * Etherscan-backed implementation of the ETH balance port. The Etherscan key is
 * now app-owned and applied server-side by the `/api/etherscan` proxy, so the
 * adapter no longer threads a caller-supplied key.
 */
export const ethBalanceAdapter: BalanceAdapter = {
  chain: 'eth',
  fetchBalance: address => fetchEthBalance(address),
};
