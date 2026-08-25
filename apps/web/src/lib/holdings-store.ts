import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { HoldingSchema } from '@stackr/models';
import type {
  Holding,
  CashHolding,
  StockHolding,
  CryptoHolding,
  GoldHolding,
  GoldUnit,
  AssetHolding,
  AssetCategory,
  Currency,
  Chain,
} from '@stackr/models';

interface HoldingsState {
  holdings: Holding[];
  addCashHolding: (input: {
    label: string;
    amount: number;
    currency: Currency;
    interestRate: number;
  }) => void;
  addStockHolding: (input: {
    symbol: string;
    name: string;
    shares: number;
    avgCostBasis?: number;
  }) => void;
  addCryptoHolding: (input: { chain: Chain; quantity: number; label?: string }) => void;
  addGoldHolding: (input: { quantity: number; unit: GoldUnit; label?: string }) => void;
  addAssetHolding: (input: {
    name: string;
    category: AssetCategory;
    value: number;
    currency: Currency;
    notes?: string;
  }) => void;
  removeHolding: (id: string) => void;
  updateHolding: (id: string, updates: Partial<Omit<Holding, 'id' | 'type' | 'createdAt'>>) => void;
}

// Bumped to 1 when the crypto variant landed and to 2 for the gold and asset
// variants. Every earlier record remains valid under the widened union, so the
// migration just guarantees a holdings array is present and re-validated.
const PERSIST_VERSION = 2;

export const useHoldingsStore = create<HoldingsState>()(
  persist(
    set => ({
      holdings: [],
      addCashHolding: input =>
        set(state => ({
          holdings: [
            ...state.holdings,
            {
              ...input,
              id: crypto.randomUUID(),
              type: 'cash' as const,
              createdAt: new Date().toISOString(),
            } satisfies CashHolding,
          ],
        })),
      addStockHolding: input =>
        set(state => ({
          holdings: [
            ...state.holdings,
            {
              ...input,
              id: crypto.randomUUID(),
              type: 'stock' as const,
              createdAt: new Date().toISOString(),
            } satisfies StockHolding,
          ],
        })),
      addCryptoHolding: input => {
        // A manual position is an off-chain balance, so a non-positive size is
        // meaningless — drop it rather than persist an invalid holding.
        if (!(input.quantity > 0)) return;
        set(state => ({
          holdings: [
            ...state.holdings,
            {
              chain: input.chain,
              quantity: input.quantity,
              ...(input.label ? { label: input.label } : {}),
              id: crypto.randomUUID(),
              type: 'crypto' as const,
              createdAt: new Date().toISOString(),
            } satisfies CryptoHolding,
          ],
        }));
      },
      addGoldHolding: input => {
        // Physical metal is a strictly positive weight — drop a non-positive
        // quantity rather than persist an invalid holding.
        if (!(input.quantity > 0)) return;
        set(state => ({
          holdings: [
            ...state.holdings,
            {
              quantity: input.quantity,
              unit: input.unit,
              ...(input.label ? { label: input.label } : {}),
              id: crypto.randomUUID(),
              type: 'gold' as const,
              createdAt: new Date().toISOString(),
            } satisfies GoldHolding,
          ],
        }));
      },
      addAssetHolding: input => {
        // A self-valued asset with no positive value is meaningless — drop it.
        if (!(input.value > 0)) return;
        set(state => ({
          holdings: [
            ...state.holdings,
            {
              name: input.name,
              category: input.category,
              value: input.value,
              currency: input.currency,
              ...(input.notes ? { notes: input.notes } : {}),
              id: crypto.randomUUID(),
              type: 'asset' as const,
              createdAt: new Date().toISOString(),
            } satisfies AssetHolding,
          ],
        }));
      },
      removeHolding: id =>
        set(state => ({
          holdings: state.holdings.filter(h => h.id !== id),
        })),
      updateHolding: (id, updates) =>
        set(state => ({
          holdings: state.holdings.map(h => (h.id === id ? { ...h, ...updates } : h)),
        })),
    }),
    {
      name: 'stackr-holdings',
      version: PERSIST_VERSION,
      partialize: state => ({ holdings: state.holdings }),
      migrate: persisted => {
        const raw =
          persisted && typeof persisted === 'object' && 'holdings' in persisted
            ? persisted.holdings
            : [];
        const items = Array.isArray(raw) ? raw : [];
        // Re-validate each entry so a malformed or stale record can't crash
        // rehydration; survivors are returned under the widened union.
        const holdings = items.flatMap((item: unknown) => {
          const parsed = HoldingSchema.safeParse(item);
          return parsed.success ? [parsed.data] : [];
        });
        return { holdings };
      },
    },
  ),
);
