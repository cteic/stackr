import { describe, expect, it, vi } from 'vitest';
import { createSigner, generateMnemonic, type SecureStorage } from './contracts/signer';
import { ensureLocalSeed } from './local-seed';

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

describe('ensureLocalSeed', () => {
  it('generates and stores a seed on first login', async () => {
    const signer = createSigner(memoryStorage());
    const generate = vi.fn(generateMnemonic);

    expect(await ensureLocalSeed(signer, generate)).toBe('created');

    expect(generate).toHaveBeenCalledTimes(1);
    expect(await signer.isInitialized()).toBe(true);
    // The freshly generated phrase is what got stored.
    expect(await signer.revealMnemonic()).toBe(generate.mock.results[0]?.value);
  });

  it('never regenerates when a seed already exists', async () => {
    const signer = createSigner(memoryStorage());
    const first = generateMnemonic();
    await signer.initialize(first);
    const generate = vi.fn(generateMnemonic);

    expect(await ensureLocalSeed(signer, generate)).toBe('existing');

    expect(generate).not.toHaveBeenCalled();
    expect(await signer.revealMnemonic()).toBe(first);
  });

  it('treats a lost initialize race as existing, not an error', async () => {
    const storage = memoryStorage();
    const signer = createSigner(storage);
    const rival = createSigner(storage);
    const rivalPhrase = generateMnemonic();

    // Rival session wins the race between our isInitialized() check and write:
    // wrap get() so the rival initializes after our first check reads null.
    let checked = false;
    const racedStorage: SecureStorage = {
      ...storage,
      get: async key => {
        const value = await storage.get(key);
        if (!checked) {
          checked = true;
          await rival.initialize(rivalPhrase);
        }
        return value;
      },
    };

    const raced = createSigner(racedStorage);
    expect(await ensureLocalSeed(raced, generateMnemonic)).toBe('existing');
    expect(await signer.revealMnemonic()).toBe(rivalPhrase);
  });
});
