import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { WalletSchema } from '@stackr/models';
import type { Wallet, CreateWallet, Chain } from '@stackr/models';

// Bumped to 1 when persisted-state validation landed. Earlier stores held an
// unvalidated wallet array; the migration re-validates each record so a
// malformed or tampered entry can't crash rehydration.
const PERSIST_VERSION = 1;

interface WalletState {
  wallets: Wallet[];
  connectedAddresses: Partial<Record<Chain, string[]>>;
  addWallet: (wallet: CreateWallet) => void;
  removeWallet: (id: string) => void;
  updateLabel: (id: string, label: string) => void;
  setConnectedAddresses: (chain: Chain, addresses: string[]) => void;
  clearConnectedAddresses: (chain: Chain) => void;
}

export const useWalletStore = create<WalletState>()(
  persist(
    set => ({
      wallets: [],
      connectedAddresses: {},
      addWallet: input =>
        set(state => ({
          wallets: [
            ...state.wallets,
            {
              ...input,
              id: crypto.randomUUID(),
              createdAt: new Date().toISOString(),
            },
          ],
        })),
      removeWallet: id =>
        set(state => ({
          wallets: state.wallets.filter(w => w.id !== id),
        })),
      updateLabel: (id, label) =>
        set(state => ({
          wallets: state.wallets.map(w => (w.id === id ? { ...w, label } : w)),
        })),
      setConnectedAddresses: (chain, addresses) =>
        set(state => ({
          connectedAddresses: { ...state.connectedAddresses, [chain]: addresses },
        })),
      clearConnectedAddresses: chain =>
        set(state => {
          const next = { ...state.connectedAddresses };
          delete next[chain];
          return { connectedAddresses: next };
        }),
    }),
    {
      name: 'stackr-wallets',
      version: PERSIST_VERSION,
      // connectedAddresses is intentionally excluded — wagmi handles reconnect
      partialize: state => ({ wallets: state.wallets }),
      migrate: persisted => {
        const raw =
          persisted && typeof persisted === 'object' && 'wallets' in persisted
            ? persisted.wallets
            : [];
        const items = Array.isArray(raw) ? raw : [];
        // Re-validate each persisted wallet against the domain schema; drop any
        // record that no longer satisfies it rather than rehydrate bad state.
        const wallets = items.flatMap((item: unknown) => {
          const parsed = WalletSchema.safeParse(item);
          return parsed.success ? [parsed.data] : [];
        });
        return { wallets };
      },
    },
  ),
);
