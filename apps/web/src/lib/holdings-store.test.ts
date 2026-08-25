import { describe as feature, it as scenario, expect, beforeEach } from 'vitest';
import { AssetHoldingSchema, CryptoHoldingSchema, GoldHoldingSchema } from '@stackr/models';
import { bdd } from './bdd';
const { given, when, then, and } = bdd;
import { useHoldingsStore } from './holdings-store';

beforeEach(() => {
  useHoldingsStore.setState({ holdings: [] });
  localStorage.clear();
});

feature('manual crypto holdings', () => {
  scenario('a crypto position round-trips through the store', () => {
    when('a Bitcoin position is added with a label', () =>
      useHoldingsStore.getState().addCryptoHolding({
        chain: 'btc',
        quantity: 0.5,
        label: 'Kraken balance',
      }),
    );
    then('it is stored as a valid crypto holding', () => {
      const [holding, ...rest] = useHoldingsStore.getState().holdings;
      expect(rest).toHaveLength(0);
      // Parsing confirms the persisted shape satisfies the schema downstream.
      const parsed = CryptoHoldingSchema.parse(holding);
      expect(parsed.type).toBe('crypto');
      expect(parsed.chain).toBe('btc');
      expect(parsed.quantity).toBe(0.5);
      expect(parsed.label).toBe('Kraken balance');
      expect(parsed.id).toBeDefined();
      expect(parsed.createdAt).toBeDefined();
    });
  });

  scenario('the label is optional', () => {
    when('a position is added without a label', () =>
      useHoldingsStore.getState().addCryptoHolding({ chain: 'eth', quantity: 2 }),
    );
    then('the holding has no label key', () => {
      const [holding] = useHoldingsStore.getState().holdings;
      expect(CryptoHoldingSchema.parse(holding).label).toBeUndefined();
    });
  });

  scenario('a crypto position can be removed by id', () => {
    given('a stored Solana position', () =>
      useHoldingsStore.getState().addCryptoHolding({ chain: 'sol', quantity: 10 }),
    );
    when('it is removed by id', () => {
      const { id } = useHoldingsStore.getState().holdings[0];
      useHoldingsStore.getState().removeHolding(id);
    });
    then('no holdings remain', () => {
      expect(useHoldingsStore.getState().holdings).toHaveLength(0);
    });
  });
});

feature('crypto quantity validation', () => {
  scenario('a zero quantity is rejected', () => {
    when('a position with zero quantity is added', () =>
      useHoldingsStore.getState().addCryptoHolding({ chain: 'btc', quantity: 0 }),
    );
    then('nothing is stored', () => {
      expect(useHoldingsStore.getState().holdings).toHaveLength(0);
    });
    and('the schema also rejects a zero quantity', () => {
      const result = CryptoHoldingSchema.safeParse({
        id: crypto.randomUUID(),
        type: 'crypto',
        chain: 'btc',
        quantity: 0,
        createdAt: new Date().toISOString(),
      });
      expect(result.success).toBe(false);
    });
  });

  scenario('a negative quantity is rejected', () => {
    when('a position with a negative quantity is added', () =>
      useHoldingsStore.getState().addCryptoHolding({ chain: 'eth', quantity: -1 }),
    );
    then('nothing is stored', () => {
      expect(useHoldingsStore.getState().holdings).toHaveLength(0);
    });
    and('the schema also rejects a negative quantity', () => {
      const result = CryptoHoldingSchema.safeParse({
        id: crypto.randomUUID(),
        type: 'crypto',
        chain: 'eth',
        quantity: -1,
        createdAt: new Date().toISOString(),
      });
      expect(result.success).toBe(false);
    });
  });
});

feature('gold holdings', () => {
  scenario('a gold position round-trips through the store', () => {
    when('a troy-ounce position is added with a label', () =>
      useHoldingsStore.getState().addGoldHolding({ quantity: 2.5, unit: 'oz', label: 'Coins' }),
    );
    then('it is stored as a valid gold holding', () => {
      const [holding, ...rest] = useHoldingsStore.getState().holdings;
      expect(rest).toHaveLength(0);
      const parsed = GoldHoldingSchema.parse(holding);
      expect(parsed.type).toBe('gold');
      expect(parsed.quantity).toBe(2.5);
      expect(parsed.unit).toBe('oz');
      expect(parsed.label).toBe('Coins');
    });
  });

  scenario('the label is optional and grams are accepted', () => {
    when('a gram position is added without a label', () =>
      useHoldingsStore.getState().addGoldHolding({ quantity: 100, unit: 'g' }),
    );
    then('the holding has no label key and keeps its unit', () => {
      const [holding] = useHoldingsStore.getState().holdings;
      const parsed = GoldHoldingSchema.parse(holding);
      expect(parsed.label).toBeUndefined();
      expect(parsed.unit).toBe('g');
    });
  });

  scenario('a non-positive weight is rejected', () => {
    when('positions with zero and negative weights are added', () => {
      useHoldingsStore.getState().addGoldHolding({ quantity: 0, unit: 'g' });
      useHoldingsStore.getState().addGoldHolding({ quantity: -1, unit: 'oz' });
    });
    then('nothing is stored', () => {
      expect(useHoldingsStore.getState().holdings).toHaveLength(0);
    });
  });
});

feature('manual asset holdings', () => {
  scenario('an asset round-trips through the store', () => {
    when('a property is added with notes', () =>
      useHoldingsStore.getState().addAssetHolding({
        name: 'Apartment',
        category: 'property',
        value: 350_000,
        currency: 'eur',
        notes: 'Purchase price',
      }),
    );
    then('it is stored as a valid asset holding', () => {
      const [holding, ...rest] = useHoldingsStore.getState().holdings;
      expect(rest).toHaveLength(0);
      const parsed = AssetHoldingSchema.parse(holding);
      expect(parsed.type).toBe('asset');
      expect(parsed.name).toBe('Apartment');
      expect(parsed.category).toBe('property');
      expect(parsed.value).toBe(350_000);
      expect(parsed.currency).toBe('eur');
      expect(parsed.notes).toBe('Purchase price');
    });
  });

  scenario('notes are optional', () => {
    when('a vehicle is added without notes', () =>
      useHoldingsStore.getState().addAssetHolding({
        name: 'Car',
        category: 'vehicle',
        value: 12_000,
        currency: 'usd',
      }),
    );
    then('the holding has no notes key', () => {
      const [holding] = useHoldingsStore.getState().holdings;
      expect(AssetHoldingSchema.parse(holding).notes).toBeUndefined();
    });
  });

  scenario('a non-positive value is rejected', () => {
    when('assets with zero and negative values are added', () => {
      useHoldingsStore.getState().addAssetHolding({
        name: 'Shed',
        category: 'other',
        value: 0,
        currency: 'usd',
      });
      useHoldingsStore.getState().addAssetHolding({
        name: 'Shed',
        category: 'other',
        value: -5,
        currency: 'usd',
      });
    });
    then('nothing is stored', () => {
      expect(useHoldingsStore.getState().holdings).toHaveLength(0);
    });
  });

  scenario('a self-valued asset can be re-valued in place', () => {
    given('a stored property', () =>
      useHoldingsStore.getState().addAssetHolding({
        name: 'Apartment',
        category: 'property',
        value: 350_000,
        currency: 'eur',
      }),
    );
    when('its value is updated', () => {
      const { id } = useHoldingsStore.getState().holdings[0];
      useHoldingsStore.getState().updateHolding(id, { value: 380_000 });
    });
    then('the holding keeps its identity and carries the new value', () => {
      const [holding] = useHoldingsStore.getState().holdings;
      const parsed = AssetHoldingSchema.parse(holding);
      expect(parsed.value).toBe(380_000);
      expect(parsed.name).toBe('Apartment');
    });
  });
});

feature('persisted store migration', () => {
  scenario('a pre-crypto store rehydrates cleanly', async () => {
    const cash = {
      id: crypto.randomUUID(),
      type: 'cash',
      label: 'Savings',
      amount: 1000,
      currency: 'usd',
      interestRate: 4.5,
      createdAt: new Date().toISOString(),
    };
    given('a version 0 store holding a cash position plus a corrupt record', () =>
      localStorage.setItem(
        'stackr-holdings',
        JSON.stringify({ state: { holdings: [cash, { type: 'bogus' }] }, version: 0 }),
      ),
    );
    when('the store rehydrates under the current version', async () => {
      await useHoldingsStore.persist.rehydrate();
    });
    then('the valid cash holding survives', () => {
      const { holdings } = useHoldingsStore.getState();
      expect(holdings).toHaveLength(1);
      expect(holdings[0]).toMatchObject({ type: 'cash', label: 'Savings' });
    });
    and('a crypto position can still be added afterwards', () => {
      useHoldingsStore.getState().addCryptoHolding({ chain: 'stx', quantity: 100 });
      const types = useHoldingsStore.getState().holdings.map(h => h.type);
      expect(types).toEqual(['cash', 'crypto']);
    });
  });

  scenario('a version 1 store rehydrates under the widened union', async () => {
    const cryptoRecord = {
      id: crypto.randomUUID(),
      type: 'crypto',
      chain: 'btc',
      quantity: 0.25,
      createdAt: new Date().toISOString(),
    };
    given('a version 1 store holding a crypto position', () =>
      localStorage.setItem(
        'stackr-holdings',
        JSON.stringify({ state: { holdings: [cryptoRecord] }, version: 1 }),
      ),
    );
    when('the store rehydrates under version 2', async () => {
      await useHoldingsStore.persist.rehydrate();
    });
    then('the crypto holding survives', () => {
      expect(useHoldingsStore.getState().holdings).toHaveLength(1);
    });
    and('gold and asset holdings can be added alongside it', () => {
      useHoldingsStore.getState().addGoldHolding({ quantity: 1, unit: 'oz' });
      useHoldingsStore.getState().addAssetHolding({
        name: 'Apartment',
        category: 'property',
        value: 350_000,
        currency: 'eur',
      });
      const types = useHoldingsStore.getState().holdings.map(h => h.type);
      expect(types).toEqual(['crypto', 'gold', 'asset']);
    });
  });
});
