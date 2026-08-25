/**
 * The five chains the Stackr Wallet signs for, and their derivation-path
 * conventions. Paths follow each ecosystem's dominant wallet standard so the
 * same mnemonic restores the same accounts in Leather / MetaMask / Phantom /
 * Slush-class wallets:
 *
 * - eth: BIP-44 secp256k1, m/44'/60'/0'/0/{i} (MetaMask standard)
 * - btc: BIP-86 taproot, m/86'/0'/0'/0/{i} (P2TR single-sig)
 * - sol: SLIP-0010 ed25519, m/44'/501'/{i}'/0' (Phantom/Solflare standard)
 * - stx: BIP-44 secp256k1, m/44'/5757'/0'/0/{i} (SIP-005 coin type, Leather)
 * - sui: SLIP-0010 ed25519, m/44'/784'/{i}'/0'/0' (Sui wallet spec)
 */

export const SIGNER_CHAINS = ['btc', 'eth', 'sol', 'stx', 'sui'] as const;

export type SignerChain = (typeof SIGNER_CHAINS)[number];

export function isSignerChain(value: unknown): value is SignerChain {
  return typeof value === 'string' && (SIGNER_CHAINS as readonly string[]).includes(value);
}

/** One derived account: the public half plus how it was derived. */
export interface DerivedAccount {
  chain: SignerChain;
  index: number;
  path: string;
  address: string;
  /** Lowercase hex, no 0x prefix. Compressed SEC1 (33 bytes) for secp256k1 chains; raw 32 bytes for ed25519 chains. */
  publicKey: string;
}

/** Curve family per chain — decides which derivation scheme applies. */
export const chainCurve = {
  btc: 'secp256k1',
  eth: 'secp256k1',
  stx: 'secp256k1',
  sol: 'ed25519',
  sui: 'ed25519',
} as const satisfies Record<SignerChain, 'secp256k1' | 'ed25519'>;

export function derivationPath(chain: SignerChain, index: number): string {
  switch (chain) {
    case 'eth':
      return `m/44'/60'/0'/0/${index}`;
    case 'btc':
      return `m/86'/0'/0'/0/${index}`;
    case 'stx':
      return `m/44'/5757'/0'/0/${index}`;
    case 'sol':
      return `m/44'/501'/${index}'/0'`;
    case 'sui':
      return `m/44'/784'/${index}'/0'/0'`;
  }
}
