import type { GoldUnit } from '@stackr/models';

/** Grams per troy ounce — the bullion standard weight spot gold is quoted in. */
export const GRAMS_PER_TROY_OUNCE = 31.1034768;

/** Convert a gold weight to troy ounces so it can be priced against spot. */
export function toTroyOunces(quantity: number, unit: GoldUnit): number {
  return unit === 'oz' ? quantity : quantity / GRAMS_PER_TROY_OUNCE;
}
