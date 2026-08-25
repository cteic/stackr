import { describe, expect, it } from 'vitest';
import {
  AssetHoldingSchema,
  GoldHoldingSchema,
  HoldingSchema,
  type AssetHolding,
  type GoldHolding,
} from './holding.js';

const goldHolding: GoldHolding = {
  id: '3f8a1c1e-6f7b-4a1e-9c3d-2b5e8f0a1d2c',
  type: 'gold',
  quantity: 2.5,
  unit: 'oz',
  label: 'Krugerrands',
  createdAt: '2026-07-03T12:00:00.000Z',
};

const assetHolding: AssetHolding = {
  id: '9d2b4e6a-1c3f-4b5d-8e7a-0f1a2b3c4d5e',
  type: 'asset',
  name: 'Apartment',
  category: 'property',
  value: 350_000,
  currency: 'eur',
  notes: 'Last valued at purchase',
  createdAt: '2026-07-03T12:00:00.000Z',
};

describe('GoldHoldingSchema', () => {
  it('round-trips a fully-populated gold holding', () => {
    expect(GoldHoldingSchema.parse(goldHolding)).toEqual(goldHolding);
  });

  it('accepts a gram-denominated holding without a label', () => {
    const { label: _label, ...rest } = goldHolding;
    const parsed = GoldHoldingSchema.parse({ ...rest, quantity: 100, unit: 'g' });
    expect(parsed.unit).toBe('g');
    expect(parsed.label).toBeUndefined();
  });

  it('rejects a zero or negative weight', () => {
    expect(GoldHoldingSchema.safeParse({ ...goldHolding, quantity: 0 }).success).toBe(false);
    expect(GoldHoldingSchema.safeParse({ ...goldHolding, quantity: -1 }).success).toBe(false);
  });

  it('rejects an unknown weight unit', () => {
    expect(GoldHoldingSchema.safeParse({ ...goldHolding, unit: 'kg' }).success).toBe(false);
  });
});

describe('AssetHoldingSchema', () => {
  it('round-trips a fully-populated asset holding', () => {
    expect(AssetHoldingSchema.parse(assetHolding)).toEqual(assetHolding);
  });

  it('accepts an asset without notes', () => {
    const { notes: _notes, ...rest } = assetHolding;
    expect(AssetHoldingSchema.parse(rest).notes).toBeUndefined();
  });

  it('rejects a zero or negative value', () => {
    expect(AssetHoldingSchema.safeParse({ ...assetHolding, value: 0 }).success).toBe(false);
    expect(AssetHoldingSchema.safeParse({ ...assetHolding, value: -50 }).success).toBe(false);
  });

  it('rejects an unknown category', () => {
    expect(AssetHoldingSchema.safeParse({ ...assetHolding, category: 'boat' }).success).toBe(false);
  });

  it('rejects an unknown currency', () => {
    expect(AssetHoldingSchema.safeParse({ ...assetHolding, currency: 'chf' }).success).toBe(false);
  });
});

describe('HoldingSchema (widened union)', () => {
  it('discriminates the gold and asset variants by type', () => {
    const gold = HoldingSchema.parse(goldHolding);
    const asset = HoldingSchema.parse(assetHolding);
    expect(gold.type).toBe('gold');
    expect(asset.type).toBe('asset');
  });

  it('still rejects a record with an unknown type tag', () => {
    expect(HoldingSchema.safeParse({ ...goldHolding, type: 'bond' }).success).toBe(false);
  });
});
