import { describe, expect, it, vi } from 'vitest';
import { createExpoSecureStorage, type SecureStoreModule } from './secure-storage';

function fakeStore(): SecureStoreModule & { backing: Map<string, string> } {
  const backing = new Map<string, string>();
  return {
    backing,
    getItemAsync: vi.fn(async (key: string) => backing.get(key) ?? null),
    setItemAsync: vi.fn(async (key: string, value: string) => {
      backing.set(key, value);
    }),
    deleteItemAsync: vi.fn(async (key: string) => {
      backing.delete(key);
    }),
  };
}

describe('createExpoSecureStorage', () => {
  it('round-trips a value through the injected store', async () => {
    const store = fakeStore();
    const storage = createExpoSecureStorage(store);

    await storage.set('k', 'v');
    expect(await storage.get('k')).toBe('v');

    await storage.delete('k');
    expect(await storage.get('k')).toBeNull();
  });

  it('returns null (not undefined) for a missing key', async () => {
    const storage = createExpoSecureStorage(fakeStore());
    expect(await storage.get('missing')).toBeNull();
  });

  it('passes the authentication requirement through to the native module', async () => {
    const store = fakeStore();
    const storage = createExpoSecureStorage(store, { requireAuthentication: true });

    await storage.set('k', 'v');
    await storage.get('k');

    expect(store.setItemAsync).toHaveBeenCalledWith('k', 'v', { requireAuthentication: true });
    expect(store.getItemAsync).toHaveBeenCalledWith('k', { requireAuthentication: true });
  });
});
