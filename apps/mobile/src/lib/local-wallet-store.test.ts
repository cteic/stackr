import { describe, expect, it, vi } from 'vitest';
import { createSigner, generateMnemonic, type SecureStorage } from './contracts/signer';
import { createLocalWalletStore } from './local-wallet-store';

function memoryStorage(): SecureStorage {
  const store = new Map<string, string>();
  return {
    get: key => Promise.resolve(store.get(key) ?? null),
    set: (key, value) => {
      store.set(key, value);
      return Promise.resolve();
    },
    delete: key => {
      store.delete(key);
      return Promise.resolve();
    },
  };
}

describe('createLocalWalletStore', () => {
  it('bootstraps: silent seed + one address per local chain, no user interaction', async () => {
    const generate = vi.fn(generateMnemonic);
    const store = createLocalWalletStore({ signer: createSigner(memoryStorage()), generate });

    expect(store.getState().status).toBe('idle');
    await store.bootstrap();

    const state = store.getState();
    expect(state.status).toBe('ready');
    expect(state.seedResult).toBe('created');
    expect(generate).toHaveBeenCalledTimes(1);
    expect(state.addresses.btc).toMatch(/^bc1p/); // taproot
    expect(state.addresses.stx).toMatch(/^SP/);
    expect(state.addresses.sui).toMatch(/^0x/);
  });

  it('reports existing (not created) for a returning device', async () => {
    const storage = memoryStorage();
    const signer = createSigner(storage);
    await signer.initialize(generateMnemonic());

    const store = createLocalWalletStore({ signer, generate: generateMnemonic });
    await store.bootstrap();
    expect(store.getState().seedResult).toBe('existing');
  });

  it('shares one in-flight run across concurrent bootstraps and never re-runs when ready', async () => {
    const generate = vi.fn(generateMnemonic);
    const store = createLocalWalletStore({ signer: createSigner(memoryStorage()), generate });

    await Promise.all([store.bootstrap(), store.bootstrap(), store.bootstrap()]);
    await store.bootstrap(); // post-ready call

    expect(generate).toHaveBeenCalledTimes(1);
    expect(store.getState().status).toBe('ready');
  });

  it('surfaces failure as error state and allows a retry', async () => {
    const generate = vi.fn(generateMnemonic);
    let fail = true;
    const storage = memoryStorage();
    const failingStorage: SecureStorage = {
      ...storage,
      set: (key, value) => {
        if (fail) return Promise.reject(new Error('keystore busy'));
        return storage.set(key, value);
      },
    };
    const store = createLocalWalletStore({ signer: createSigner(failingStorage), generate });

    await expect(store.bootstrap()).rejects.toThrow('keystore busy');
    expect(store.getState().status).toBe('error');

    fail = false;
    await store.bootstrap();
    expect(store.getState().status).toBe('ready');
  });

  it('notifies subscribers on every transition', async () => {
    const store = createLocalWalletStore({
      signer: createSigner(memoryStorage()),
      generate: generateMnemonic,
    });
    const seen: string[] = [];
    store.subscribe(() => seen.push(store.getState().status));
    await store.bootstrap();
    expect(seen).toEqual(['preparing', 'ready']);
  });
});
