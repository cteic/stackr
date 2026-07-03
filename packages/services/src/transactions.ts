import { z } from 'zod';
import type { Chain, Transaction } from '@stackr/models';
import { TransactionSchema } from '@stackr/models';
import type { TransactionAdapter } from './ports.js';
import { parseOrThrow } from './validate.js';
import { formatBaseUnits } from './base-units.js';
import { resolveEtherscanBase } from './etherscan-config.js';
import { resolveHiroBase } from './hiro-config.js';
import { resolveSolanaRpcUrl } from './sol-rpc.js';

const TransactionListSchema = z.array(TransactionSchema);

export async function fetchTransactions(chain: Chain, address: string): Promise<Transaction[]> {
  switch (chain) {
    case 'btc':
      return fetchBtcTransactions(address);
    case 'eth':
      return fetchEthTransactions(address);
    case 'stx':
      return fetchStxTransactions(address);
    case 'sol':
      return fetchSolTransactions(address);
    case 'sui':
      return fetchSuiTransactions(address);
  }
}

// ---------------------------------------------------------------------------
// BTC — Blockstream address/txs
// ---------------------------------------------------------------------------

const BlockstreamTxSchema = z.object({
  txid: z.string(),
  vout: z.array(
    z.object({
      scriptpubkey_address: z.string().optional(),
      value: z.number().optional(),
    }),
  ),
  vin: z.array(
    z.object({
      prevout: z.object({ scriptpubkey_address: z.string().optional() }).nullable().optional(),
    }),
  ),
  status: z
    .object({
      confirmed: z.boolean().optional(),
      block_time: z.number().optional(),
    })
    .optional(),
});

const BlockstreamTxListSchema = z.array(BlockstreamTxSchema);

type BlockstreamTx = z.infer<typeof BlockstreamTxSchema>;

/**
 * Normalize Blockstream txs into domain `Transaction`s. Bitcoin has no
 * "from/to" — direction is inferred from whether any output pays the watched
 * address, and the amount is the sum of the relevant outputs. Pure (no
 * network) so the UTXO direction logic is unit-testable.
 */
export function normalizeBtcTransactions(txs: BlockstreamTx[], address: string): Transaction[] {
  const normalized = txs.slice(0, 20).map(tx => {
    const isReceive = tx.vout.some(o => o.scriptpubkey_address === address);

    const amount = tx.vout
      .filter(o =>
        isReceive ? o.scriptpubkey_address === address : o.scriptpubkey_address !== address,
      )
      .reduce((sum, o) => sum + (o.value ?? 0), 0);

    const counterparty = isReceive
      ? (tx.vin[0]?.prevout?.scriptpubkey_address ?? 'unknown')
      : (tx.vout.find(o => o.scriptpubkey_address !== address)?.scriptpubkey_address ?? 'unknown');

    return {
      hash: tx.txid,
      chain: 'btc' as const,
      type: isReceive ? ('receive' as const) : ('send' as const),
      amount: formatBaseUnits(amount, 8),
      counterparty,
      timestamp: tx.status?.block_time
        ? new Date(tx.status.block_time * 1000).toISOString()
        : new Date().toISOString(),
      confirmed: tx.status?.confirmed ?? false,
    };
  });

  return parseOrThrow(TransactionListSchema, normalized, 'btc.fetchTransactions(egress)');
}

async function fetchBtcTransactions(address: string): Promise<Transaction[]> {
  const res = await fetch(
    `https://blockstream.info/api/address/${encodeURIComponent(address)}/txs`,
  );
  if (!res.ok) throw new Error(`Blockstream API error: ${res.status}`);

  const data = parseOrThrow(
    BlockstreamTxListSchema,
    await res.json(),
    'btc.fetchTransactions(ingress)',
  );
  return normalizeBtcTransactions(data, address);
}

// ---------------------------------------------------------------------------
// ETH — Etherscan txlist
// ---------------------------------------------------------------------------

const EtherscanTxSchema = z.object({
  hash: z.string(),
  from: z.string().optional(),
  to: z.string().optional(),
  value: z.string().optional(),
  timeStamp: z.string().optional(),
  txreceipt_status: z.string().optional(),
});

/**
 * Etherscan signals "no transactions" / rate limits via `status: '0'` with a
 * string `result` message, and success via `status: '1'` with an array. The
 * union captures both so ingress validation doesn't reject the empty case.
 */
const EtherscanTxListSchema = z.object({
  status: z.string(),
  result: z.union([z.array(EtherscanTxSchema), z.string()]),
});

type EtherscanTx = z.infer<typeof EtherscanTxSchema>;

/** Normalize Etherscan txs into domain `Transaction`s. */
export function normalizeEthTransactions(txs: EtherscanTx[], address: string): Transaction[] {
  const lower = address.toLowerCase();
  const normalized = txs.map(tx => {
    const isReceive = tx.to?.toLowerCase() === lower;
    return {
      hash: tx.hash,
      chain: 'eth' as const,
      type: isReceive ? ('receive' as const) : ('send' as const),
      amount: formatBaseUnits(tx.value ?? '0', 18, 8),
      counterparty: (isReceive ? tx.from : tx.to) ?? 'unknown',
      timestamp: new Date(parseInt(tx.timeStamp ?? '0') * 1000).toISOString(),
      confirmed: tx.txreceipt_status === '1',
    };
  });

  return parseOrThrow(TransactionListSchema, normalized, 'eth.fetchTransactions(egress)');
}

async function fetchEthTransactions(address: string): Promise<Transaction[]> {
  // Browser → same-origin `/api/etherscan` proxy (appends the server-only key);
  // else → public Etherscan base keyless.
  const res = await fetch(
    `${resolveEtherscanBase()}?module=account&action=txlist&address=${encodeURIComponent(address)}&startblock=0&endblock=99999999&sort=desc&page=1&offset=20`,
  );
  if (!res.ok) throw new Error(`Etherscan API error: ${res.status}`);

  const data = parseOrThrow(
    EtherscanTxListSchema,
    await res.json(),
    'eth.fetchTransactions(ingress)',
  );
  if (data.status !== '1' || !Array.isArray(data.result)) return [];

  return normalizeEthTransactions(data.result, address);
}

// ---------------------------------------------------------------------------
// STX — Hiro address/transactions
// ---------------------------------------------------------------------------

const HiroTxSchema = z.object({
  tx_id: z.string(),
  tx_type: z.string(),
  tx_status: z.string().optional(),
  sender_address: z.string().optional(),
  burn_block_time_iso: z.string().optional(),
  token_transfer: z
    .object({
      recipient_address: z.string().optional(),
      amount: z.string().optional(),
    })
    .optional(),
});

const HiroTxListSchema = z.object({
  results: z.array(HiroTxSchema),
});

type HiroTx = z.infer<typeof HiroTxSchema>;

/**
 * Normalize Hiro txs into domain `Transaction`s, keeping only STX
 * `token_transfer`s (contract calls and coinbases are out of scope for the
 * activity feed).
 */
export function normalizeStxTransactions(txs: HiroTx[], address: string): Transaction[] {
  const normalized = txs
    .filter(tx => tx.tx_type === 'token_transfer')
    .map(tx => {
      const isReceive = tx.token_transfer?.recipient_address === address;
      return {
        hash: tx.tx_id,
        chain: 'stx' as const,
        type: isReceive ? ('receive' as const) : ('send' as const),
        amount: formatBaseUnits(tx.token_transfer?.amount ?? '0', 6),
        counterparty: isReceive
          ? (tx.sender_address ?? 'unknown')
          : (tx.token_transfer?.recipient_address ?? 'unknown'),
        timestamp: tx.burn_block_time_iso ?? new Date().toISOString(),
        confirmed: tx.tx_status === 'success',
      };
    });

  return parseOrThrow(TransactionListSchema, normalized, 'stx.fetchTransactions(egress)');
}

async function fetchStxTransactions(address: string): Promise<Transaction[]> {
  const res = await fetch(
    `${resolveHiroBase()}/extended/v1/address/${encodeURIComponent(address)}/transactions?limit=20`,
  );
  if (!res.ok) throw new Error(`Hiro API error: ${res.status}`);

  const data = parseOrThrow(HiroTxListSchema, await res.json(), 'stx.fetchTransactions(ingress)');
  return normalizeStxTransactions(data.results, address);
}

// ---------------------------------------------------------------------------
// SOL — getSignaturesForAddress
// ---------------------------------------------------------------------------

const SolanaSignatureSchema = z.object({
  signature: z.string(),
  blockTime: z.number().nullable().optional(),
  err: z.unknown(),
});

const SolanaSignaturesSchema = z.object({
  result: z.array(SolanaSignatureSchema).nullable().optional(),
});

type SolanaSignature = z.infer<typeof SolanaSignatureSchema>;

/**
 * Normalize Solana signatures into domain `Transaction`s. Signatures alone
 * don't carry direction or amount (that needs a `getTransaction` per sig), so
 * those are placeholdered — direction defaults to `receive` and amount to `0`.
 */
export function normalizeSolTransactions(signatures: SolanaSignature[]): Transaction[] {
  const normalized = signatures.map(sig => ({
    hash: sig.signature,
    chain: 'sol' as const,
    type: 'receive' as const,
    amount: '0',
    counterparty: 'unknown',
    timestamp: sig.blockTime
      ? new Date(sig.blockTime * 1000).toISOString()
      : new Date().toISOString(),
    confirmed: sig.err === null,
  }));

  return parseOrThrow(TransactionListSchema, normalized, 'sol.fetchTransactions(egress)');
}

async function fetchSolTransactions(address: string): Promise<Transaction[]> {
  const sigRes = await fetch(resolveSolanaRpcUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getSignaturesForAddress',
      params: [address, { limit: 20 }],
    }),
  });

  if (!sigRes.ok) throw new Error(`Solana RPC error: ${sigRes.status}`);

  const data = parseOrThrow(
    SolanaSignaturesSchema,
    await sigRes.json(),
    'sol.fetchTransactions(ingress)',
  );
  return normalizeSolTransactions(data.result ?? []);
}

// ---------------------------------------------------------------------------
// SUI — suix_queryTransactionBlocks
// ---------------------------------------------------------------------------

const SUI_RPC = 'https://fullnode.mainnet.sui.io';

/** The native SUI coin type; activity amounts are read only from its deltas. */
const SUI_COIN_TYPE = '0x2::sui::SUI';

/**
 * A single coin balance delta on a transaction block. `amount` is a **signed
 * decimal string** (negative = leaving the owner) and can exceed 2^53 MIST, so
 * it stays a string into the BigInt formatter — never `Number(...)`. `owner` is
 * an untagged union (`{ AddressOwner }`, `{ ObjectOwner }`, `{ Shared }`,
 * `"Immutable"`), so it is read defensively rather than typed exhaustively.
 */
const SuiBalanceChangeSchema = z.object({
  coinType: z.string(),
  amount: z.string(),
  owner: z.unknown(),
});

const SuiTxBlockSchema = z.object({
  digest: z.string(),
  timestampMs: z.string().nullable().optional(),
  transaction: z
    .object({ data: z.object({ sender: z.string().optional() }).optional() })
    .nullable()
    .optional(),
  balanceChanges: z.array(SuiBalanceChangeSchema).nullable().optional(),
});

const SuiTxBlocksSchema = z.object({
  result: z.object({
    data: z.array(SuiTxBlockSchema),
  }),
});

type SuiTxBlock = z.infer<typeof SuiTxBlockSchema>;

/** Pull the address out of an `{ AddressOwner }` owner; `undefined` otherwise. */
function suiOwnerAddress(owner: unknown): string | undefined {
  if (owner !== null && typeof owner === 'object' && 'AddressOwner' in owner) {
    const addr = (owner as { AddressOwner: unknown }).AddressOwner;
    return typeof addr === 'string' ? addr : undefined;
  }
  return undefined;
}

/**
 * Normalize Sui transaction blocks into domain `Transaction`s. The FromAddress
 * and ToAddress queries overlap, so blocks are deduped on `digest`. Direction
 * and amount come from the watched address's own native-SUI balance delta (its
 * sign gives send vs receive, its magnitude the amount); when a block moves no
 * SUI for the address (e.g. a pure object transfer) the amount is `0` and the
 * direction falls back to whether the address was the sender. Pure (no network)
 * so the delta/dedupe logic is unit-testable.
 */
export function normalizeSuiTransactions(txs: SuiTxBlock[], address: string): Transaction[] {
  const byDigest = new Map<string, SuiTxBlock>();
  for (const tx of txs) {
    if (!byDigest.has(tx.digest)) byDigest.set(tx.digest, tx);
  }

  const normalized = [...byDigest.values()].map(tx => {
    const changes = tx.balanceChanges ?? [];
    const sender = tx.transaction?.data?.sender;

    const mine = changes.find(
      change => change.coinType === SUI_COIN_TYPE && suiOwnerAddress(change.owner) === address,
    );
    const signed = mine?.amount;
    const isReceive = signed !== undefined ? !signed.startsWith('-') : sender !== address;
    const magnitude =
      signed === undefined ? '0' : signed.startsWith('-') ? signed.slice(1) : signed;

    // On a send, the counterparty is whoever the SUI landed on; on a receive,
    // it's the block's sender.
    const recipient = changes.find(
      change =>
        change.coinType === SUI_COIN_TYPE &&
        !change.amount.startsWith('-') &&
        suiOwnerAddress(change.owner) !== address,
    );
    const counterparty = isReceive
      ? (sender ?? 'unknown')
      : (suiOwnerAddress(recipient?.owner) ?? 'unknown');

    return {
      hash: tx.digest,
      chain: 'sui' as const,
      type: isReceive ? ('receive' as const) : ('send' as const),
      amount: formatBaseUnits(magnitude, 9),
      counterparty,
      timestamp: tx.timestampMs
        ? new Date(Number(tx.timestampMs)).toISOString()
        : new Date().toISOString(),
      // queryTransactionBlocks only returns executed (finalized) blocks.
      confirmed: true,
    };
  });

  normalized.sort((a, b) => (a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0));

  return parseOrThrow(
    TransactionListSchema,
    normalized.slice(0, 20),
    'sui.fetchTransactions(egress)',
  );
}

async function fetchSuiTransactions(address: string): Promise<Transaction[]> {
  // No single filter ORs sender and recipient, so the inbound and outbound
  // sides are queried separately and merged/deduped in the normalizer.
  const queryBody = (filterKey: 'FromAddress' | 'ToAddress') =>
    JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'suix_queryTransactionBlocks',
      params: [
        {
          filter: { [filterKey]: address },
          options: { showInput: true, showBalanceChanges: true },
        },
        null,
        20,
        true,
      ],
    });

  const post = (filterKey: 'FromAddress' | 'ToAddress') =>
    fetch(SUI_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: queryBody(filterKey),
    });

  const [fromRes, toRes] = await Promise.all([post('FromAddress'), post('ToAddress')]);
  if (!fromRes.ok) throw new Error(`Sui RPC error: ${fromRes.status}`);
  if (!toRes.ok) throw new Error(`Sui RPC error: ${toRes.status}`);

  const fromData = parseOrThrow(
    SuiTxBlocksSchema,
    await fromRes.json(),
    'sui.fetchTransactions(ingress)',
  );
  const toData = parseOrThrow(
    SuiTxBlocksSchema,
    await toRes.json(),
    'sui.fetchTransactions(ingress)',
  );

  return normalizeSuiTransactions([...fromData.result.data, ...toData.result.data], address);
}

/** Multi-chain implementation of the transaction port. */
export const transactionAdapter: TransactionAdapter = {
  fetchTransactions,
};
