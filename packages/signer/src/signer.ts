import type { z } from 'zod';
import { wipe } from './bytes.js';
import type { DerivedAccount, SignerChain } from './chains.js';
import { signBtcMessage, signBtcTransaction } from './chains/btc.js';
import { signEthMessage, signEthTransaction } from './chains/eth.js';
import { signSolMessage, signSolTransaction } from './chains/sol.js';
import { signStxMessage, signStxTransaction } from './chains/stx.js';
import { signSuiMessage, signSuiTransaction } from './chains/sui.js';
import {
  assertAccountIndex,
  assertSignerChain,
  deriveAccount,
  derivePrivateKeyFromSeed,
} from './derive.js';
import { SignerError, signerErrorCodes } from './errors.js';
import { mnemonicToSeed, validateMnemonic } from './mnemonic.js';
import {
  BtcTransactionPayloadSchema,
  EthTransactionPayloadSchema,
  SolTransactionPayloadSchema,
  StxTransactionPayloadSchema,
  SuiTransactionPayloadSchema,
  type SignMessageResult,
  type SignTransactionResult,
} from './payloads.js';

/**
 * Platform port for secret persistence. On device this is backed by the
 * hardware keystore (expo-secure-store / Keychain / StrongBox); in tests an
 * in-memory fake. The signer stores exactly one secret under one key.
 */
export interface SecureStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export const MNEMONIC_STORAGE_KEY = 'stackr.signer.mnemonic.v1';

export interface StackrSigner {
  initialize(mnemonic: string): Promise<void>;
  isInitialized(): Promise<boolean>;
  getAccount(chain: SignerChain, index: number): Promise<DerivedAccount>;
  signMessage(chain: SignerChain, index: number, message: string): Promise<SignMessageResult>;
  signTransaction(
    chain: SignerChain,
    index: number,
    payload: unknown,
  ): Promise<SignTransactionResult>;
  wipe(): Promise<void>;
}

function parsePayload<Schema extends z.ZodTypeAny>(
  schema: Schema,
  payload: unknown,
): z.infer<Schema> {
  const result = schema.safeParse(payload);
  if (!result.success) {
    // Zod issue paths/expectations only — payload contents are never echoed.
    const issues = result.error.issues
      .map(issue => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new SignerError(signerErrorCodes.invalidPayload, `Invalid payload — ${issues}`);
  }
  return result.data;
}

/**
 * The signing facade the app talks to. Fails closed: every operation other
 * than `initialize`/`isInitialized` throws `not_initialized` until a mnemonic
 * has been stored. Key material is re-derived per call and wiped in a
 * `finally` — nothing secret survives between calls.
 */
export function createSigner(storage: SecureStorage): StackrSigner {
  async function requireMnemonic(): Promise<string> {
    const mnemonic = await storage.get(MNEMONIC_STORAGE_KEY);
    if (mnemonic === null) {
      throw new SignerError(signerErrorCodes.notInitialized, 'Signer has not been initialized');
    }
    return mnemonic;
  }

  async function withPrivateKey<T>(
    chain: SignerChain,
    index: number,
    run: (privateKey: Uint8Array) => Promise<T> | T,
  ): Promise<T> {
    assertSignerChain(chain);
    assertAccountIndex(index);
    const seed = mnemonicToSeed(await requireMnemonic());
    try {
      const privateKey = derivePrivateKeyFromSeed(seed, chain, index);
      try {
        return await run(privateKey);
      } finally {
        wipe(privateKey);
      }
    } finally {
      wipe(seed);
    }
  }

  return {
    async initialize(mnemonic: string): Promise<void> {
      if (!validateMnemonic(mnemonic)) {
        throw new SignerError(
          signerErrorCodes.invalidMnemonic,
          'Mnemonic failed BIP-39 validation',
        );
      }
      if ((await storage.get(MNEMONIC_STORAGE_KEY)) !== null) {
        throw new SignerError(
          signerErrorCodes.alreadyInitialized,
          'Signer is already initialized — wipe() first to replace the wallet',
        );
      }
      await storage.set(MNEMONIC_STORAGE_KEY, mnemonic.normalize('NFKD').trim());
    },

    async isInitialized(): Promise<boolean> {
      return (await storage.get(MNEMONIC_STORAGE_KEY)) !== null;
    },

    async getAccount(chain: SignerChain, index: number): Promise<DerivedAccount> {
      return deriveAccount(await requireMnemonic(), chain, index);
    },

    async signMessage(
      chain: SignerChain,
      index: number,
      message: string,
    ): Promise<SignMessageResult> {
      if (typeof message !== 'string' || message.length === 0) {
        throw new SignerError(signerErrorCodes.invalidMessage, 'Message must be non-empty');
      }
      return withPrivateKey(chain, index, privateKey => {
        switch (chain) {
          case 'eth':
            return signEthMessage(privateKey, message);
          case 'btc':
            return signBtcMessage(privateKey, message);
          case 'sol':
            return signSolMessage(privateKey, message);
          case 'stx':
            return signStxMessage(privateKey, message);
          case 'sui':
            return signSuiMessage(privateKey, message);
        }
      });
    },

    async signTransaction(
      chain: SignerChain,
      index: number,
      payload: unknown,
    ): Promise<SignTransactionResult> {
      return withPrivateKey(chain, index, privateKey => {
        switch (chain) {
          case 'eth':
            return signEthTransaction(
              privateKey,
              parsePayload(EthTransactionPayloadSchema, payload),
            );
          case 'btc':
            return signBtcTransaction(
              privateKey,
              parsePayload(BtcTransactionPayloadSchema, payload),
            );
          case 'sol':
            return signSolTransaction(
              privateKey,
              parsePayload(SolTransactionPayloadSchema, payload),
            );
          case 'stx':
            return signStxTransaction(
              privateKey,
              parsePayload(StxTransactionPayloadSchema, payload),
            );
          case 'sui':
            return signSuiTransaction(
              privateKey,
              parsePayload(SuiTransactionPayloadSchema, payload),
            );
        }
      });
    },

    async wipe(): Promise<void> {
      await storage.delete(MNEMONIC_STORAGE_KEY);
    },
  };
}
