import { secp256k1 } from '@noble/curves/secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, concatBytes, utf8ToBytes } from '@noble/hashes/utils';
import {
  deserializeTransaction,
  getAddressFromPrivateKey,
  serializeTransaction,
  signMessageHashRsv,
  TransactionSigner,
} from '@stacks/transactions';
import { SignerError, signerErrorCodes } from '../errors.js';
import type {
  SignMessageResult,
  SignTransactionResult,
  StxTransactionPayload,
} from '../payloads.js';

/**
 * Stacks. Addresses use the compressed key (Leather convention — the 64-hex
 * private key gets the `01` compression suffix @stacks/transactions expects).
 *
 * Message signing follows the SIP-018 personal-message convention: the
 * `\x17Stacks Signed Message:\n` domain prefix, a Bitcoin CompactSize length,
 * the message bytes, sha256, then a recoverable RSV signature.
 */

function compressedPrivateKeyHex(privateKey: Uint8Array): string {
  return `${bytesToHex(privateKey)}01`;
}

export function stxPublicParts(privateKey: Uint8Array): { address: string; publicKey: string } {
  return {
    address: getAddressFromPrivateKey(compressedPrivateKeyHex(privateKey), 'mainnet'),
    publicKey: bytesToHex(secp256k1.getPublicKey(privateKey, true)),
  };
}

function compactSize(length: number): Uint8Array {
  if (length < 0xfd) {
    return new Uint8Array([length]);
  }
  if (length <= 0xffff) {
    const bytes = new Uint8Array(3);
    bytes[0] = 0xfd;
    new DataView(bytes.buffer).setUint16(1, length, true);
    return bytes;
  }
  const bytes = new Uint8Array(5);
  bytes[0] = 0xfe;
  new DataView(bytes.buffer).setUint32(1, length, true);
  return bytes;
}

const STACKS_MESSAGE_PREFIX = concatBytes(
  new Uint8Array([0x17]),
  utf8ToBytes('Stacks Signed Message:\n'),
);

export function stxMessageHash(message: string): Uint8Array {
  const messageBytes = utf8ToBytes(message);
  return sha256(concatBytes(STACKS_MESSAGE_PREFIX, compactSize(messageBytes.length), messageBytes));
}

export function signStxMessage(privateKey: Uint8Array, message: string): SignMessageResult {
  const signature = signMessageHashRsv({
    messageHash: bytesToHex(stxMessageHash(message)),
    privateKey: compressedPrivateKeyHex(privateKey),
  });
  return { signature, publicKey: bytesToHex(secp256k1.getPublicKey(privateKey, true)) };
}

export function signStxTransaction(
  privateKey: Uint8Array,
  payload: StxTransactionPayload,
): SignTransactionResult {
  const transaction = deserializeTransaction(payload.transactionHex);
  const signer = new TransactionSigner(transaction);
  try {
    signer.signOrigin(compressedPrivateKeyHex(privateKey));
  } catch {
    throw new SignerError(
      signerErrorCodes.signingFailed,
      'Stacks origin signature failed for this account',
    );
  }
  return {
    kind: 'transaction',
    encoding: 'hex',
    signedTransaction: serializeTransaction(transaction),
  };
}
