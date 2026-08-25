import { useSyncExternalStore } from 'react';
import * as SecureStore from 'expo-secure-store';
import {
  createSigner,
  generateMnemonic,
  type SecureStorage,
  type Signer,
} from './contracts/signer';
import { createLocalWalletStore, type LocalWalletState } from './local-wallet-store';
import { createExpoSecureStorage } from './secure-storage';

/**
 * One signer, one hardware-backed storage, one local-wallet store for the
 * app — the composition root where the native module meets the pure logic.
 */
const storage = createExpoSecureStorage(SecureStore);
const signer = createSigner(storage);
const store = createLocalWalletStore({ signer, generate: generateMnemonic });

export function getSigner(): Signer {
  return signer;
}

/** Also holds the device-local backup flags (non-secret, same keystore). */
export function getSignerStorage(): SecureStorage {
  return storage;
}

/** Errors are kept in store state ('error'); a later call retries. */
export function bootstrapLocalWallet(): Promise<void> {
  return store.bootstrap().catch(() => {});
}

export function useLocalWallet(): LocalWalletState {
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}
