import { z } from 'zod';

/**
 * Ingress schemas for `signTransaction` payloads, one per chain. These are
 * the trust boundary between a connected dapp / the app UI and the signing
 * core: everything is validated before a key is ever derived.
 */

const decimalString = z.string().regex(/^\d+$/, 'expected a base-10 integer string');
const hexData = z.string().regex(/^0x(?:[0-9a-fA-F]{2})*$/, 'expected 0x-prefixed hex');
const ethAddress = z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'expected a 20-byte 0x address');
const base64String = z
  .string()
  .min(1)
  .regex(/^[A-Za-z0-9+/]+={0,2}$/, 'expected base64');
const hexString = z
  .string()
  .min(2)
  .regex(/^(?:0x)?(?:[0-9a-fA-F]{2})+$/, 'expected hex bytes');

/** EIP-1559 transaction request. Amounts travel as decimal strings (wei). */
export const EthTransactionPayloadSchema = z
  .object({
    chainId: z.number().int().positive(),
    nonce: z.number().int().nonnegative(),
    to: ethAddress.optional(),
    valueWei: decimalString.default('0'),
    data: hexData.optional(),
    gas: decimalString,
    maxFeePerGasWei: decimalString,
    maxPriorityFeePerGasWei: decimalString,
  })
  .strict();

/** A PSBT with the inputs this wallet should sign (taproot key-path). */
export const BtcTransactionPayloadSchema = z.object({ psbtBase64: base64String }).strict();

/** The serialized Solana transaction *message* bytes to sign. */
export const SolTransactionPayloadSchema = z.object({ messageBase64: base64String }).strict();

/** A serialized unsigned Stacks transaction (wire format hex). */
export const StxTransactionPayloadSchema = z.object({ transactionHex: hexString }).strict();

/** Serialized Sui `TransactionData` BCS bytes (the SDK's `tx.build()` output). */
export const SuiTransactionPayloadSchema = z.object({ txBytesBase64: base64String }).strict();

export type EthTransactionPayload = z.infer<typeof EthTransactionPayloadSchema>;
export type BtcTransactionPayload = z.infer<typeof BtcTransactionPayloadSchema>;
export type SolTransactionPayload = z.infer<typeof SolTransactionPayloadSchema>;
export type StxTransactionPayload = z.infer<typeof StxTransactionPayloadSchema>;
export type SuiTransactionPayload = z.infer<typeof SuiTransactionPayloadSchema>;

/** What signing produced: a full broadcastable transaction, or a detached signature. */
export type SignTransactionResult =
  | { kind: 'transaction'; encoding: 'hex' | 'psbt-base64'; signedTransaction: string }
  | { kind: 'signature'; encoding: 'base58' | 'sui-base64'; signature: string; publicKey: string };

export interface SignMessageResult {
  /** Chain-idiomatic encoding: eth 0x-hex (EIP-191), btc hex (BIP-340), sol base58, stx RSV hex, sui base64 wallet signature. */
  signature: string;
  /** Same encoding as `DerivedAccount.publicKey` (lowercase hex). */
  publicKey: string;
}
