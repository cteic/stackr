import { z } from 'zod';
import type { Balance, Transaction } from '@stackr/models';
import { BalanceSchema, chainMeta } from '@stackr/models';
import {
  etherscanPublicBase,
  ethPublicRpcUrl,
  formatBaseUnits,
  normalizeEthTransactions,
  parseOrThrow,
} from '@stackr/services';

/**
 * React Native detects as a browser (`typeof window !== 'undefined'`), so the
 * `@stackr/services` ETH adapters resolve to the web app's same-origin proxy
 * paths — relative URLs that RN's fetch cannot resolve, against proxies that
 * only accept same-origin callers anyway. Until the services package grows an
 * explicit base-URL configuration (follow-up recorded on the PR), the mobile
 * app reads ETH from the public endpoints the package itself exports as its
 * non-browser fallbacks. Every other chain's adapter already targets absolute
 * public URLs and is consumed from the package directly.
 */

const RpcBalanceSchema = z.object({
  result: z.string().regex(/^0x[0-9a-fA-F]+$/),
});

export async function fetchEthBalancePublic(
  address: string,
  rpcUrl: string = ethPublicRpcUrl,
): Promise<Balance> {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_getBalance',
      params: [address, 'latest'],
    }),
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch ETH balance: ${res.status} ${res.statusText}`);
  }

  const data = parseOrThrow(RpcBalanceSchema, await res.json(), 'mobile.ethBalance(ingress)');

  const rawBalance = BigInt(data.result).toString();
  const balance = formatBaseUnits(rawBalance, chainMeta.eth.decimals);

  return parseOrThrow(
    BalanceSchema,
    {
      chain: 'eth',
      address,
      rawBalance,
      balance,
      updatedAt: new Date().toISOString(),
    },
    'mobile.ethBalance(egress)',
  );
}

const EtherscanTxSchema = z.object({
  hash: z.string(),
  from: z.string().optional(),
  to: z.string().optional(),
  value: z.string().optional(),
  timeStamp: z.string().optional(),
  txreceipt_status: z.string().optional(),
});

const EtherscanTxListSchema = z.object({
  status: z.string(),
  result: z.union([z.array(EtherscanTxSchema), z.string()]),
});

export async function fetchEthActivityPublic(
  address: string,
  base: string = etherscanPublicBase,
): Promise<Transaction[]> {
  const params = new URLSearchParams({
    module: 'account',
    action: 'txlist',
    address,
    sort: 'desc',
    page: '1',
    offset: '25',
  });

  const res = await fetch(`${base}?${params}`);

  if (!res.ok) {
    throw new Error(`Failed to fetch ETH transactions: ${res.status} ${res.statusText}`);
  }

  const data = parseOrThrow(EtherscanTxListSchema, await res.json(), 'mobile.ethActivity(ingress)');

  // Etherscan signals "no transactions" (and rate limiting) via a string
  // result — treat both as empty rather than erroring the activity feed.
  if (typeof data.result === 'string') return [];

  return normalizeEthTransactions(data.result, address);
}
