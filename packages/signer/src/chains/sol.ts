import { ed25519 } from '@noble/curves/ed25519';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';
import { base58, base64 } from '@scure/base';
import type {
  SignMessageResult,
  SignTransactionResult,
  SolTransactionPayload,
} from '../payloads.js';

/**
 * Solana. The address IS the base58 ed25519 public key. Transactions are
 * signed as raw serialized *message* bytes (what `Transaction.serializeMessage`
 * / a v0 message's `serialize()` produces) — the wallet returns a detached
 * signature the caller attaches, mirroring how the wallet-standard
 * `signTransaction` contract works.
 */

export function solPublicParts(privateKey: Uint8Array): { address: string; publicKey: string } {
  const publicKey = ed25519.getPublicKey(privateKey);
  return { address: base58.encode(publicKey), publicKey: bytesToHex(publicKey) };
}

export function signSolMessage(privateKey: Uint8Array, message: string): SignMessageResult {
  const signature = ed25519.sign(utf8ToBytes(message), privateKey);
  return {
    signature: base58.encode(signature),
    publicKey: bytesToHex(ed25519.getPublicKey(privateKey)),
  };
}

export function signSolTransaction(
  privateKey: Uint8Array,
  payload: SolTransactionPayload,
): SignTransactionResult {
  const messageBytes = base64.decode(payload.messageBase64);
  const signature = ed25519.sign(messageBytes, privateKey);
  return {
    kind: 'signature',
    encoding: 'base58',
    signature: base58.encode(signature),
    publicKey: bytesToHex(ed25519.getPublicKey(privateKey)),
  };
}
