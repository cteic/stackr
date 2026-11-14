import { atom } from 'jotai';
import { WalletSchema } from '@stackr/models';
import type { Wallet, CreateWallet, Chain } from '@stackr/models';
import { persistedAtom } from './persisted-atom';

// Bumped to 1 when persisted-state validation landed. Earlier stores held an
// unvalidated wallet array; the migration re-validates each record so a
// malformed or tampered entry can't crash rehydration.
const PERSIST_VERSION = 1;

/**
 * The persisted blob keeps its `{ wallets: [...] }` shape rather than collapsing
 * to a bare array. Read and write have to agree on one shape, and this is the
 * one already sitting in every existing user's localStorage.
 */
interface PersistedWallets {
  wallets: Wallet[];
}

function migrateWallets(persisted: unknown): PersistedWallets {
  const raw =
    persisted && typeof persisted === 'object' && 'wallets' in persisted ? persisted.wallets : [];
  const items = Array.isArray(raw) ? raw : [];
  // Re-validate each persisted wallet against the domain schema; drop any
  // record that no longer satisfies it rather than rehydrate bad state.
  const wallets = items.flatMap((item: unknown) => {
    const parsed = WalletSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
  return { wallets };
}

const { valueAtom: persistedWalletsAtom, rehydrate: rehydrateWallets } =
  persistedAtom<PersistedWallets>(
    'stackr-wallets',
    PERSIST_VERSION,
    { wallets: [] },
    migrateWallets,
  );

export { rehydrateWallets };

/**
 * The watch-only wallet list. Persisted, because the user typed these addresses
 * in and expects them to still be there tomorrow.
 */
export const walletsAtom = atom(
  get => get(persistedWalletsAtom).wallets,
  (_get, set, wallets: Wallet[]) => {
    set(persistedWalletsAtom, { wallets });
  },
);

/**
 * Addresses discovered by connecting a browser wallet, keyed by chain.
 *
 * Deliberately not persisted: wagmi and the Solana wallet adapters own
 * reconnection, and a stale address written here would outlive the connection
 * it came from.
 */
export const connectedAddressesAtom = atom<Partial<Record<Chain, string[]>>>({});

export const addWalletAtom = atom(null, (get, set, input: CreateWallet) => {
  set(walletsAtom, [
    ...get(walletsAtom),
    {
      ...input,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    },
  ]);
});

export const removeWalletAtom = atom(null, (get, set, id: string) => {
  set(
    walletsAtom,
    get(walletsAtom).filter(w => w.id !== id),
  );
});

export const updateLabelAtom = atom(null, (get, set, id: string, label: string) => {
  set(
    walletsAtom,
    get(walletsAtom).map(w => (w.id === id ? { ...w, label } : w)),
  );
});

export const setConnectedAddressesAtom = atom(
  null,
  (get, set, chain: Chain, addresses: string[]) => {
    set(connectedAddressesAtom, { ...get(connectedAddressesAtom), [chain]: addresses });
  },
);

export const clearConnectedAddressesAtom = atom(null, (get, set, chain: Chain) => {
  const next = { ...get(connectedAddressesAtom) };
  delete next[chain];
  set(connectedAddressesAtom, next);
});
