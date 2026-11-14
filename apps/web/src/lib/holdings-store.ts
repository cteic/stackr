import { atom } from 'jotai';
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
import { persistedAtom } from './persisted-atom';

// Bumped to 1 when the crypto variant landed and to 2 for the gold and asset
// variants. Every earlier record remains valid under the widened union, so the
// migration just guarantees a holdings array is present and re-validated.
const PERSIST_VERSION = 2;

/** Mirrors the `{ holdings: [...] }` blob already in users' localStorage. */
interface PersistedHoldings {
  holdings: Holding[];
}

function migrateHoldings(persisted: unknown): PersistedHoldings {
  const raw =
    persisted && typeof persisted === 'object' && 'holdings' in persisted ? persisted.holdings : [];
  const items = Array.isArray(raw) ? raw : [];
  // Re-validate each entry so a malformed or stale record can't crash
  // rehydration; survivors are returned under the widened union.
  const holdings = items.flatMap((item: unknown) => {
    const parsed = HoldingSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
  return { holdings };
}

const { valueAtom: persistedHoldingsAtom, rehydrate: rehydrateHoldings } =
  persistedAtom<PersistedHoldings>(
    'stackr-holdings',
    PERSIST_VERSION,
    { holdings: [] },
    migrateHoldings,
  );

export { rehydrateHoldings };

/** Every manually-entered position: cash, stock, crypto, gold and self-valued assets. */
export const holdingsAtom = atom(
  get => get(persistedHoldingsAtom).holdings,
  (_get, set, holdings: Holding[]) => {
    set(persistedHoldingsAtom, { holdings });
  },
);

interface CashHoldingInput {
  label: string;
  amount: number;
  currency: Currency;
  interestRate: number;
}

export const addCashHoldingAtom = atom(null, (get, set, input: CashHoldingInput) => {
  set(holdingsAtom, [
    ...get(holdingsAtom),
    {
      ...input,
      id: crypto.randomUUID(),
      type: 'cash' as const,
      createdAt: new Date().toISOString(),
    } satisfies CashHolding,
  ]);
});

interface StockHoldingInput {
  symbol: string;
  name: string;
  shares: number;
  avgCostBasis?: number;
}

export const addStockHoldingAtom = atom(null, (get, set, input: StockHoldingInput) => {
  set(holdingsAtom, [
    ...get(holdingsAtom),
    {
      ...input,
      id: crypto.randomUUID(),
      type: 'stock' as const,
      createdAt: new Date().toISOString(),
    } satisfies StockHolding,
  ]);
});

interface CryptoHoldingInput {
  chain: Chain;
  quantity: number;
  label?: string;
}

export const addCryptoHoldingAtom = atom(null, (get, set, input: CryptoHoldingInput) => {
  // A manual position is an off-chain balance, so a non-positive size is
  // meaningless — drop it rather than persist an invalid holding.
  if (!(input.quantity > 0)) return;
  set(holdingsAtom, [
    ...get(holdingsAtom),
    {
      chain: input.chain,
      quantity: input.quantity,
      ...(input.label ? { label: input.label } : {}),
      id: crypto.randomUUID(),
      type: 'crypto' as const,
      createdAt: new Date().toISOString(),
    } satisfies CryptoHolding,
  ]);
});

interface GoldHoldingInput {
  quantity: number;
  unit: GoldUnit;
  label?: string;
}

export const addGoldHoldingAtom = atom(null, (get, set, input: GoldHoldingInput) => {
  // Physical metal is a strictly positive weight — drop a non-positive
  // quantity rather than persist an invalid holding.
  if (!(input.quantity > 0)) return;
  set(holdingsAtom, [
    ...get(holdingsAtom),
    {
      quantity: input.quantity,
      unit: input.unit,
      ...(input.label ? { label: input.label } : {}),
      id: crypto.randomUUID(),
      type: 'gold' as const,
      createdAt: new Date().toISOString(),
    } satisfies GoldHolding,
  ]);
});

interface AssetHoldingInput {
  name: string;
  category: AssetCategory;
  value: number;
  currency: Currency;
  notes?: string;
}

export const addAssetHoldingAtom = atom(null, (get, set, input: AssetHoldingInput) => {
  // A self-valued asset with no positive value is meaningless — drop it.
  if (!(input.value > 0)) return;
  set(holdingsAtom, [
    ...get(holdingsAtom),
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
  ]);
});

export const removeHoldingAtom = atom(null, (get, set, id: string) => {
  set(
    holdingsAtom,
    get(holdingsAtom).filter(h => h.id !== id),
  );
});

export const updateHoldingAtom = atom(
  null,
  (get, set, id: string, updates: Partial<Omit<Holding, 'id' | 'type' | 'createdAt'>>) => {
    set(
      holdingsAtom,
      get(holdingsAtom).map(h => (h.id === id ? { ...h, ...updates } : h)),
    );
  },
);
