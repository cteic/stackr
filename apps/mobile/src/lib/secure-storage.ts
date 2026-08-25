import type { SecureStorage } from './contracts/signer';

/**
 * Module surface of `expo-secure-store` the adapter consumes. The module is
 * always injected by the caller (`import * as SecureStore from
 * 'expo-secure-store'` at the composition root) — importing it here would drag
 * the native module into node-run unit tests, which cannot parse it.
 */
export interface SecureStoreModule {
  getItemAsync(key: string, options?: { requireAuthentication?: boolean }): Promise<string | null>;
  setItemAsync(
    key: string,
    value: string,
    options?: { requireAuthentication?: boolean },
  ): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

/**
 * Hardware-backed `SecureStorage` for the signer: iOS Keychain / Android
 * Keystore via expo-secure-store. Key material never touches AsyncStorage,
 * never syncs, and is excluded from Android auto-backup (app.json plugin
 * config). `requireAuthentication` gates reads behind device biometrics.
 */
export function createExpoSecureStorage(
  store: SecureStoreModule,
  options: { requireAuthentication: boolean } = { requireAuthentication: false },
): SecureStorage {
  return {
    async get(key: string): Promise<string | null> {
      return store.getItemAsync(key, options);
    },
    async set(key: string, value: string): Promise<void> {
      await store.setItemAsync(key, value, options);
    },
    async delete(key: string): Promise<void> {
      await store.deleteItemAsync(key);
    },
  };
}
