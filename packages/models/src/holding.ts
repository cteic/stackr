import { z } from 'zod';
import { ChainSchema } from './chain.js';
import { CurrencySchema } from './currency.js';

export const CashHoldingSchema = z.object({
  id: z.string().uuid(),
  type: z.literal('cash'),
  label: z.string(),
  amount: z.number(),
  currency: CurrencySchema,
  interestRate: z.number().min(0).max(100),
  createdAt: z.string().datetime(),
});

export type CashHolding = z.infer<typeof CashHoldingSchema>;

export const StockHoldingSchema = z.object({
  id: z.string().uuid(),
  type: z.literal('stock'),
  symbol: z.string(),
  name: z.string(),
  shares: z.number(),
  avgCostBasis: z.number().optional(),
  createdAt: z.string().datetime(),
});

export type StockHolding = z.infer<typeof StockHoldingSchema>;

export const CryptoHoldingSchema = z.object({
  id: z.string().uuid(),
  type: z.literal('crypto'),
  chain: ChainSchema,
  // Manual positions are off-chain balances (exchange, paper, a partner's stack),
  // so a holding only makes sense with a strictly positive size.
  quantity: z.number().positive(),
  label: z.string().optional(),
  createdAt: z.string().datetime(),
});

export type CryptoHolding = z.infer<typeof CryptoHoldingSchema>;

export const GoldUnitSchema = z.enum(['g', 'oz']);

export type GoldUnit = z.infer<typeof GoldUnitSchema>;

export const goldUnitMeta: Record<GoldUnit, { name: string; abbrev: string }> = {
  g: { name: 'Grams', abbrev: 'g' },
  oz: { name: 'Troy ounces', abbrev: 'oz t' },
};

export const GoldHoldingSchema = z.object({
  id: z.string().uuid(),
  type: z.literal('gold'),
  // Physical metal is a strictly positive weight; the unit records whether the
  // user thinks in grams or troy ounces, so we can echo their framing back.
  quantity: z.number().positive(),
  unit: GoldUnitSchema,
  label: z.string().optional(),
  createdAt: z.string().datetime(),
});

export type GoldHolding = z.infer<typeof GoldHoldingSchema>;

export const AssetCategorySchema = z.enum(['property', 'vehicle', 'other']);

export type AssetCategory = z.infer<typeof AssetCategorySchema>;

export const assetCategoryMeta: Record<AssetCategory, { name: string }> = {
  property: { name: 'Property' },
  vehicle: { name: 'Vehicle' },
  other: { name: 'Other' },
};

export const AssetHoldingSchema = z.object({
  id: z.string().uuid(),
  type: z.literal('asset'),
  name: z.string(),
  category: AssetCategorySchema,
  // Self-valued: there is no pricing feed for a house or a car, so the value
  // is whatever the user last entered, in the currency they entered it in.
  value: z.number().positive(),
  currency: CurrencySchema,
  notes: z.string().optional(),
  createdAt: z.string().datetime(),
});

export type AssetHolding = z.infer<typeof AssetHoldingSchema>;

export const HoldingSchema = z.discriminatedUnion('type', [
  CashHoldingSchema,
  StockHoldingSchema,
  CryptoHoldingSchema,
  GoldHoldingSchema,
  AssetHoldingSchema,
]);

export type Holding = z.infer<typeof HoldingSchema>;
