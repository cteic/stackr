import { describe, expect, it } from 'vitest';
import { GRAMS_PER_TROY_OUNCE, toTroyOunces } from './gold';

describe('toTroyOunces', () => {
  it('passes troy-ounce quantities through unchanged', () => {
    expect(toTroyOunces(2.5, 'oz')).toBe(2.5);
  });

  it('converts grams at the bullion-standard 31.1034768 g per troy ounce', () => {
    expect(toTroyOunces(GRAMS_PER_TROY_OUNCE, 'g')).toBeCloseTo(1, 12);
    expect(toTroyOunces(100, 'g')).toBeCloseTo(3.2150746568628, 10);
  });
});
