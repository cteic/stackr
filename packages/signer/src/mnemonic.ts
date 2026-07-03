import {
  generateMnemonic as bip39GenerateMnemonic,
  mnemonicToSeedSync,
  validateMnemonic as bip39ValidateMnemonic,
} from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { SignerError, signerErrorCodes } from './errors.js';

export type MnemonicStrength = 12 | 24;

/**
 * Generate a BIP-39 mnemonic (English wordlist). 12 words (128-bit entropy)
 * by default — the wallet-industry norm — with 24 words available for users
 * who want the full 256 bits.
 */
export function generateMnemonic(words: MnemonicStrength = 12): string {
  return bip39GenerateMnemonic(wordlist, words === 24 ? 256 : 128);
}

export function validateMnemonic(phrase: string): boolean {
  return bip39ValidateMnemonic(phrase, wordlist);
}

/**
 * BIP-39 seed for a validated mnemonic. Callers own the returned buffer and
 * MUST wipe it (`wipe`/`withWiped`) once derivation is done.
 */
export function mnemonicToSeed(phrase: string): Uint8Array {
  if (!validateMnemonic(phrase)) {
    throw new SignerError(signerErrorCodes.invalidMnemonic, 'Mnemonic failed BIP-39 validation');
  }
  return mnemonicToSeedSync(phrase);
}
