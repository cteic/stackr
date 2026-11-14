import { z } from 'zod';
import { assertValidAddress } from './address-guard.js';
import type { Chain, Transaction } from '@stackr/models';
import { chainMeta, TransactionSchema } from '@stackr/models';
import type { TransactionAdapter } from './ports.js';
import { parseOrThrow } from './validate.js';
import { formatBaseUnits } from './base-units.js';
import { resolveEtherscanBase } from './etherscan-config.js';
import { resolveHiroBase } from './hiro-config.js';
import { resolveSolanaRpcUrl } from './sol-rpc.js';
import { safeFetch } from './fetch-wrapper.js';
import { isRateLimited } from './service-error.js';

const TransactionListSchema = z.array(TransactionSchema);

export async function fetchTransactions(chain: Chain, address: string): Promise<Transaction[]> {
  assertValidAddress(chain, address);
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

/**
 * A confirmed transaction as returned by `getTransaction` under `jsonParsed`.
 * Only the fields the lamport-delta maths needs are modelled; everything else
 * in a Solana transaction is deliberately left outside the ingress schema.
 */
const SolanaTransactionDetailSchema = z.object({
  transaction: z.object({
    signatures: z.array(z.string()),
    message: z.object({
      accountKeys: z.array(z.object({ pubkey: z.string() })),
    }),
  }),
  meta: z
    .object({
      fee: z.number(),
      preBalances: z.array(z.number()),
      postBalances: z.array(z.number()),
      err: z.unknown(),
    })
    .nullable(),
  blockTime: z.number().nullable().optional(),
});

const SolanaTransactionBatchSchema = z.array(
  z.object({
    id: z.number(),
    result: SolanaTransactionDetailSchema.nullable().optional(),
  }),
);

type SolanaTransactionDetail = z.infer<typeof SolanaTransactionDetailSchema>;

/**
 * Turn one confirmed transaction into a domain `Transaction` from the owner's
 * point of view.
 *
 * Solana has no "value" field — a transfer is a set of lamport balance deltas —
 * so direction and amount are read from `preBalances`/`postBalances` at the
 * owner's index in `accountKeys`. When the owner paid the fee (they are the fee
 * payer, index 0) the fee is added back, so a send reports what was transferred
 * rather than transfer-plus-gas. That matches what the EVM side renders, where
 * Etherscan's `value` also excludes gas.
 *
 * The counterparty is the account whose delta most closely mirrors the owner's.
 * It stays `unknown` when nothing opposes the owner's delta — a multi-party
 * swap has no single counterparty, and guessing one would be a lie.
 *
 * Pure: takes a parsed detail, returns a `Transaction`. No network.
 */
export function normalizeSolTransactionDetail(
  owner: string,
  detail: SolanaTransactionDetail,
): Transaction | null {
  const { meta } = detail;
  const keys = detail.transaction.message.accountKeys.map(key => key.pubkey);
  const hash = detail.transaction.signatures[0];
  if (hash === undefined) return null;

  const timestamp = detail.blockTime
    ? new Date(detail.blockTime * 1000).toISOString()
    : new Date().toISOString();

  const ownerIndex = keys.indexOf(owner);
  if (meta === null || ownerIndex === -1) {
    // No balance metadata, or the address is not an account key: the signature
    // is real and belongs in the feed, but its amount is genuinely unknown.
    return {
      hash,
      chain: 'sol',
      type: 'receive',
      amount: '0',
      counterparty: 'unknown',
      timestamp,
      confirmed: meta !== null && meta.err === null,
    };
  }

  const deltas = keys.map(
    (_, index) => BigInt(meta.postBalances[index] ?? 0) - BigInt(meta.preBalances[index] ?? 0),
  );

  // Add the fee back for the fee payer, so the amount is the transfer itself.
  const feePaidByOwner = ownerIndex === 0 ? BigInt(meta.fee) : 0n;
  const ownerDelta = (deltas[ownerIndex] ?? 0n) + feePaidByOwner;

  const received = ownerDelta >= 0n;
  const magnitude = received ? ownerDelta : -ownerDelta;

  // The counterparty is whichever other account moved the most in the opposite
  // direction — the other side of the transfer in the common two-party case.
  let counterparty = 'unknown';
  let best = 0n;
  for (const [index, delta] of deltas.entries()) {
    if (index === ownerIndex) continue;
    const opposing = received ? -delta : delta;
    if (opposing > best) {
      best = opposing;
      counterparty = keys[index] ?? 'unknown';
    }
  }

  return {
    hash,
    chain: 'sol',
    type: received ? 'receive' : 'send',
    amount: formatBaseUnits(magnitude, chainMeta.sol.decimals),
    counterparty,
    timestamp,
    confirmed: meta.err === null,
  };
}

/**
 * How many `getTransaction` calls go in one JSON-RPC batch. The same-origin
 * proxy caps a batch at 10 (see `apps/web/src/app/api/rpc/solana/route.ts`), so
 * 20 signatures cost two round trips rather than twenty.
 */
const SOL_DETAIL_BATCH_SIZE = 10;

async function fetchSolTransactionDetails(
  signatures: string[],
): Promise<Map<string, SolanaTransactionDetail>> {
  const details = new Map<string, SolanaTransactionDetail>();

  for (let start = 0; start < signatures.length; start += SOL_DETAIL_BATCH_SIZE) {
    const batch = signatures.slice(start, start + SOL_DETAIL_BATCH_SIZE);
    const res = await safeFetch(resolveSolanaRpcUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        batch.map((signature, index) => ({
          jsonrpc: '2.0',
          id: index,
          method: 'getTransaction',
          params: [signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }],
        })),
      ),
    });

    const parsed = parseOrThrow(
      SolanaTransactionBatchSchema,
      await res.json(),
      'sol.fetchTransactions(ingress)',
    );

    for (const entry of parsed) {
      const signature = batch[entry.id];
      if (signature !== undefined && entry.result) {
        details.set(signature, entry.result);
      }
    }
  }

  return details;
}

async function fetchSolTransactions(address: string): Promise<Transaction[]> {
  const sigRes = await safeFetch(resolveSolanaRpcUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getSignaturesForAddress',
      params: [address, { limit: 20 }],
    }),
  });

  const data = parseOrThrow(
    SolanaSignaturesSchema,
    await sigRes.json(),
    'sol.fetchTransactions(ingress)',
  );
  const signatures = data.result ?? [];
  if (signatures.length === 0) return [];

  // Signatures alone carry no amount or direction, so each one is enriched with
  // its lamport deltas. If that second read fails the feed still renders from
  // the signature list — a degraded row beats an empty panel.
  let details: Map<string, SolanaTransactionDetail>;
  try {
    details = await fetchSolTransactionDetails(signatures.map(sig => sig.signature));
  } catch (error) {
    // A rate limit is the one failure that must not degrade quietly. Returning
    // signature-only rows here would resolve the query successfully, so the UI
    // would cache amountless rows and never show the "come back shortly" state.
    if (isRateLimited(error)) throw error;
    return normalizeSolTransactions(signatures);
  }

  const normalized = signatures.flatMap(sig => {
    const detail = details.get(sig.signature);
    if (!detail) {
      return normalizeSolTransactions([sig]);
    }
    const transaction = normalizeSolTransactionDetail(address, detail);
    return transaction ? [transaction] : [];
  });

  return parseOrThrow(TransactionListSchema, normalized, 'sol.fetchTransactions(egress)');
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
