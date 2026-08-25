import { secp256k1 } from '@noble/curves/secp256k1';
import { bytesToHex } from '@noble/hashes/utils';
import { privateKeyToAccount } from 'viem/accounts';
import { SignerError, signerErrorCodes } from '../errors.js';
import type {
  EthTransactionPayload,
  SignMessageResult,
  SignTransactionResult,
} from '../payloads.js';

/**
 * Ethereum: address + EIP-191 message signing + EIP-1559 transaction signing
 * via viem's account primitives (which are themselves @noble-backed). The
 * private key enters viem as hex; the buffer the caller owns is wiped by the
 * caller — nothing here retains it.
 */

type Hex = `0x${string}`;

function isHex(value: string): value is Hex {
  return value.startsWith('0x');
}

function toHex(value: string): Hex {
  if (!isHex(value)) {
    throw new SignerError(signerErrorCodes.invalidPayload, 'Expected 0x-prefixed hex');
  }
  return value;
}

function accountFor(privateKey: Uint8Array) {
  return privateKeyToAccount(toHex(`0x${bytesToHex(privateKey)}`));
}

export function ethPublicParts(privateKey: Uint8Array): { address: string; publicKey: string } {
  return {
    address: accountFor(privateKey).address,
    publicKey: bytesToHex(secp256k1.getPublicKey(privateKey, true)),
  };
}

export async function signEthMessage(
  privateKey: Uint8Array,
  message: string,
): Promise<SignMessageResult> {
  const account = accountFor(privateKey);
  const signature = await account.signMessage({ message });
  return { signature, publicKey: bytesToHex(secp256k1.getPublicKey(privateKey, true)) };
}

export async function signEthTransaction(
  privateKey: Uint8Array,
  payload: EthTransactionPayload,
): Promise<SignTransactionResult> {
  const account = accountFor(privateKey);
  const signedTransaction = await account.signTransaction({
    type: 'eip1559',
    chainId: payload.chainId,
    nonce: payload.nonce,
    to: payload.to === undefined ? undefined : toHex(payload.to),
    value: BigInt(payload.valueWei),
    data: payload.data === undefined ? undefined : toHex(payload.data),
    gas: BigInt(payload.gas),
    maxFeePerGas: BigInt(payload.maxFeePerGasWei),
    maxPriorityFeePerGas: BigInt(payload.maxPriorityFeePerGasWei),
  });
  return { kind: 'transaction', encoding: 'hex', signedTransaction };
}
