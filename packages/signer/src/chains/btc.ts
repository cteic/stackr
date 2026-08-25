import { schnorr } from '@noble/curves/secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';
import { base64, hex } from '@scure/base';
import * as btc from '@scure/btc-signer';
import { SignerError, signerErrorCodes } from '../errors.js';
import type {
  BtcTransactionPayload,
  SignMessageResult,
  SignTransactionResult,
} from '../payloads.js';

/**
 * Bitcoin taproot (BIP-86 / P2TR key-path). Addresses and PSBT signing via
 * @scure/btc-signer, which applies the BIP-341 output-key tweak internally.
 *
 * Message signing is a raw BIP-340 Schnorr signature over sha256(message)
 * with the untweaked internal key — verifiable against the account public
 * key, but NOT BIP-322; full BIP-322 support is tracked as a follow-up.
 */

export function btcXOnlyPublicKey(privateKey: Uint8Array): Uint8Array {
  return schnorr.getPublicKey(privateKey);
}

export function btcPublicParts(privateKey: Uint8Array): { address: string; publicKey: string } {
  const internalKey = btcXOnlyPublicKey(privateKey);
  const payment = btc.p2tr(internalKey);
  if (payment.address === undefined) {
    throw new SignerError(signerErrorCodes.derivationFailed, 'P2TR address derivation failed');
  }
  return { address: payment.address, publicKey: bytesToHex(internalKey) };
}

export function signBtcMessage(privateKey: Uint8Array, message: string): SignMessageResult {
  const digest = sha256(utf8ToBytes(message));
  const signature = schnorr.sign(digest, privateKey);
  return {
    signature: bytesToHex(signature),
    publicKey: bytesToHex(btcXOnlyPublicKey(privateKey)),
  };
}

export function signBtcTransaction(
  privateKey: Uint8Array,
  payload: BtcTransactionPayload,
): SignTransactionResult {
  const transaction = btc.Transaction.fromPSBT(base64.decode(payload.psbtBase64));
  try {
    transaction.sign(privateKey);
  } catch {
    throw new SignerError(
      signerErrorCodes.signingFailed,
      'No PSBT input is signable with this account',
    );
  }
  try {
    transaction.finalize();
    return {
      kind: 'transaction',
      encoding: 'hex',
      signedTransaction: hex.encode(transaction.extract()),
    };
  } catch {
    // Other signers still need to act on this PSBT — hand back the updated PSBT.
    return {
      kind: 'transaction',
      encoding: 'psbt-base64',
      signedTransaction: base64.encode(transaction.toPSBT()),
    };
  }
}
