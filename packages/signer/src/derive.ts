import { HDKey } from '@scure/bip32';
import { wipe } from './bytes.js';
import {
  chainCurve,
  derivationPath,
  isSignerChain,
  type DerivedAccount,
  type SignerChain,
} from './chains.js';
import { btcPublicParts } from './chains/btc.js';
import { ethPublicParts } from './chains/eth.js';
import { solPublicParts } from './chains/sol.js';
import { stxPublicParts } from './chains/stx.js';
import { suiPublicParts } from './chains/sui.js';
import { SignerError, signerErrorCodes } from './errors.js';
import { mnemonicToSeed } from './mnemonic.js';
import { slip10DerivePath } from './slip10.js';

export function assertAccountIndex(index: number): void {
  if (!Number.isInteger(index) || index < 0 || index >= 0x80000000) {
    throw new SignerError(signerErrorCodes.invalidAccountIndex, 'Account index out of range');
  }
}

export function assertSignerChain(chain: string): asserts chain is SignerChain {
  if (!isSignerChain(chain)) {
    throw new SignerError(signerErrorCodes.unsupportedChain, `Unsupported chain: ${chain}`);
  }
}

/**
 * The chain's private key at `index`, from a BIP-39 seed. secp256k1 chains
 * derive via BIP-32 (@scure/bip32); ed25519 chains via SLIP-0010. The caller
 * owns the returned buffer and MUST wipe it.
 */
export function derivePrivateKeyFromSeed(
  seed: Uint8Array,
  chain: SignerChain,
  index: number,
): Uint8Array {
  const path = derivationPath(chain, index);
  if (chainCurve[chain] === 'secp256k1') {
    const node = HDKey.fromMasterSeed(seed).derive(path);
    if (node.privateKey === null) {
      throw new SignerError(signerErrorCodes.derivationFailed, 'BIP-32 derivation yielded no key');
    }
    const privateKey = node.privateKey.slice();
    node.wipePrivateData();
    return privateKey;
  }
  const node = slip10DerivePath(seed, path);
  wipe(node.chainCode);
  return node.privateKey;
}

function publicParts(
  chain: SignerChain,
  privateKey: Uint8Array,
): { address: string; publicKey: string } {
  switch (chain) {
    case 'eth':
      return ethPublicParts(privateKey);
    case 'btc':
      return btcPublicParts(privateKey);
    case 'sol':
      return solPublicParts(privateKey);
    case 'stx':
      return stxPublicParts(privateKey);
    case 'sui':
      return suiPublicParts(privateKey);
  }
}

/**
 * Pure mnemonic → account derivation (no storage involved). Key material is
 * held only for the duration of the call and wiped on every exit path.
 */
export function deriveAccount(mnemonic: string, chain: SignerChain, index: number): DerivedAccount {
  assertSignerChain(chain);
  assertAccountIndex(index);
  const seed = mnemonicToSeed(mnemonic);
  try {
    const privateKey = derivePrivateKeyFromSeed(seed, chain, index);
    try {
      const { address, publicKey } = publicParts(chain, privateKey);
      return { chain, index, path: derivationPath(chain, index), address, publicKey };
    } finally {
      wipe(privateKey);
    }
  } finally {
    wipe(seed);
  }
}
