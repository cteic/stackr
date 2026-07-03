import { ed25519 } from '@noble/curves/ed25519';
import { blake2b } from '@noble/hashes/blake2b';
import { bytesToHex, concatBytes, utf8ToBytes } from '@noble/hashes/utils';
import { base64 } from '@scure/base';
import type {
  SignMessageResult,
  SignTransactionResult,
  SuiTransactionPayload,
} from '../payloads.js';

/**
 * Sui (per the Sui wallet-cryptography spec and intent-signing docs):
 * - address = 0x + blake2b-256(scheme flag 0x00 || ed25519 public key)
 * - signing always goes over blake2b-256(intent || payload), where intent is
 *   3 bytes [scope, version=0, appId=0]; scope 0 = TransactionData,
 *   scope 3 = PersonalMessage (whose payload is BCS `vector<u8>`, i.e.
 *   ULEB128 length prefix + bytes)
 * - the wallet-format serialized signature is base64(flag || sig64 || pub32)
 */

const ED25519_FLAG = 0x00;
const INTENT_TRANSACTION_DATA = new Uint8Array([0, 0, 0]);
const INTENT_PERSONAL_MESSAGE = new Uint8Array([3, 0, 0]);

function uleb128(value: number): Uint8Array {
  const bytes: number[] = [];
  let remaining = value;
  do {
    let byte = remaining & 0x7f;
    remaining >>>= 7;
    if (remaining !== 0) {
      byte |= 0x80;
    }
    bytes.push(byte);
  } while (remaining !== 0);
  return new Uint8Array(bytes);
}

export function suiPublicParts(privateKey: Uint8Array): { address: string; publicKey: string } {
  const publicKey = ed25519.getPublicKey(privateKey);
  const digest = blake2b(concatBytes(new Uint8Array([ED25519_FLAG]), publicKey), { dkLen: 32 });
  return { address: `0x${bytesToHex(digest)}`, publicKey: bytesToHex(publicKey) };
}

function signIntent(privateKey: Uint8Array, intent: Uint8Array, payload: Uint8Array): string {
  const digest = blake2b(concatBytes(intent, payload), { dkLen: 32 });
  const signature = ed25519.sign(digest, privateKey);
  const publicKey = ed25519.getPublicKey(privateKey);
  return base64.encode(concatBytes(new Uint8Array([ED25519_FLAG]), signature, publicKey));
}

export function signSuiMessage(privateKey: Uint8Array, message: string): SignMessageResult {
  const messageBytes = utf8ToBytes(message);
  const bcsBytes = concatBytes(uleb128(messageBytes.length), messageBytes);
  return {
    signature: signIntent(privateKey, INTENT_PERSONAL_MESSAGE, bcsBytes),
    publicKey: bytesToHex(ed25519.getPublicKey(privateKey)),
  };
}

export function signSuiTransaction(
  privateKey: Uint8Array,
  payload: SuiTransactionPayload,
): SignTransactionResult {
  const txBytes = base64.decode(payload.txBytesBase64);
  return {
    kind: 'signature',
    encoding: 'sui-base64',
    signature: signIntent(privateKey, INTENT_TRANSACTION_DATA, txBytes),
    publicKey: bytesToHex(ed25519.getPublicKey(privateKey)),
  };
}
