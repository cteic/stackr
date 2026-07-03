/**
 * Contract for the `@stackr/signer` package being built on a parallel branch.
 *
 * TEMPORARY HOME: the types below are the agreed interface; the stub
 * implementation at the bottom exists only so the app compiles and the
 * onboarding/sign flows are exercisable before the real package merges. When
 * `@stackr/signer` lands, delete the stub, keep the imports, and swap the
 * module specifier — nothing else in the app should need to change.
 */

/** Chains the signer derives accounts for locally (see ADR 0020 for the split). */
export type SignerChain = 'btc' | 'eth' | 'sol' | 'stx' | 'sui';

export interface SignerAccount {
  chain: SignerChain;
  index: number;
  /** Full derivation path, e.g. `m/44'/5757'/0'/0/0`. */
  path: string;
  address: string;
  publicKey: string;
}

/**
 * Where the mnemonic lives. The mobile app provides the hardware-backed
 * implementation (`createExpoSecureStorage`); tests inject an in-memory fake.
 */
export interface SecureStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface Signer {
  /** Persist the mnemonic into secure storage and prepare derivation. */
  initialize(mnemonic: string): Promise<void>;
  isInitialized(): Promise<boolean>;
  getAccount(chain: SignerChain, index: number): Promise<SignerAccount>;
  signMessage(chain: SignerChain, index: number, message: string): Promise<string>;
  signTransaction(chain: SignerChain, index: number, payload: unknown): Promise<string>;
  /** Remove all key material from storage. */
  wipe(): Promise<void>;
}

/** True while the app runs against the stub rather than `@stackr/signer`. */
export const SIGNER_IS_STUB = true;

const MNEMONIC_KEY = 'stackr.signer.mnemonic';

const stubPaths: Record<SignerChain, string> = {
  btc: "m/86'/0'/0'/0/0",
  eth: "m/44'/60'/0'/0/0",
  sol: "m/44'/501'/0'/0'",
  stx: "m/44'/5757'/0'/0/0",
  sui: "m/44'/784'/0'/0'/0'",
};

export function generateMnemonic(): string {
  throw new Error('@stackr/signer not integrated yet: mnemonic generation is unavailable');
}

export function validateMnemonic(mnemonic: string): boolean {
  // Shape-only check until the real wordlist validation arrives with the package.
  const words = mnemonic.trim().split(/\s+/);
  return words.length === 12 || words.length === 24;
}

/**
 * Stub signer: remembers whether it was initialized (via the injected storage)
 * but cannot derive addresses or produce signatures. Callers must treat every
 * account it would manage as "pending signer integration" — the accounts
 * builder does exactly that (see `accounts.ts`).
 */
export function createSigner(storage: SecureStorage): Signer {
  return {
    async initialize(mnemonic: string): Promise<void> {
      if (!validateMnemonic(mnemonic)) {
        throw new Error('invalid mnemonic');
      }
      await storage.set(MNEMONIC_KEY, mnemonic);
    },
    async isInitialized(): Promise<boolean> {
      return (await storage.get(MNEMONIC_KEY)) !== null;
    },
    async getAccount(chain: SignerChain, index: number): Promise<SignerAccount> {
      throw new Error(
        `@stackr/signer not integrated yet: cannot derive ${chain} account #${index} (path ${stubPaths[chain]})`,
      );
    },
    async signMessage(): Promise<string> {
      throw new Error('@stackr/signer not integrated yet: signing is unavailable');
    },
    async signTransaction(): Promise<string> {
      throw new Error('@stackr/signer not integrated yet: signing is unavailable');
    },
    async wipe(): Promise<void> {
      await storage.delete(MNEMONIC_KEY);
    },
  };
}
