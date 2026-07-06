import { describe as feature, it as scenario, expect } from 'vitest';
import type { Price } from '@stackr/models';
import { bdd } from './bdd';
const { given, when, then, and } = bdd;
import {
  aggregateCryptoPositions,
  sumAssetValue,
  sumGoldValue,
  type CryptoPosition,
} from './portfolio-aggregation';

function price(chain: Price['chain'], fiatPrice: number, change24h = 0): Price {
  return {
    chain,
    usdPrice: fiatPrice,
    fiatPrice,
    currency: 'usd',
    change24h,
    updatedAt: new Date().toISOString(),
  };
}

feature('crypto portfolio aggregation', () => {
  scenario('a wallet balance and a manual position of the same chain combine', () => {
    let result: ReturnType<typeof aggregateCryptoPositions>;
    const positions: CryptoPosition[] = [
      { chain: 'btc', quantity: 1 }, // e.g. a watched wallet
      { chain: 'btc', quantity: 0.5 }, // e.g. a manual exchange balance
    ];
    given('a BTC price of 100', () => {
      result = aggregateCryptoPositions(positions, [price('btc', 100)]);
    });
    then('the total reflects both positions', () => {
      expect(result.cryptoTotal).toBe(150);
    });
    and('they fold into a single chain entry', () => {
      expect(result.perChain).toEqual([{ chain: 'btc', fiatValue: 150 }]);
    });
  });

  scenario('manual positions add to the total across chains', () => {
    let result: ReturnType<typeof aggregateCryptoPositions>;
    when('BTC and ETH positions are aggregated', () => {
      result = aggregateCryptoPositions(
        [
          { chain: 'btc', quantity: 2 },
          { chain: 'eth', quantity: 3 },
        ],
        [price('btc', 100), price('eth', 50)],
      );
    });
    then('the total sums every priced position', () => {
      expect(result.cryptoTotal).toBe(350);
    });
    and('chains are ordered by descending value', () => {
      expect(result.perChain).toEqual([
        { chain: 'btc', fiatValue: 200 },
        { chain: 'eth', fiatValue: 150 },
      ]);
    });
  });

  scenario('positions without a price are ignored', () => {
    let result: ReturnType<typeof aggregateCryptoPositions>;
    when('a SOL position has no matching price', () => {
      result = aggregateCryptoPositions(
        [
          { chain: 'btc', quantity: 1 },
          { chain: 'sol', quantity: 5 },
        ],
        [price('btc', 100)],
      );
    });
    then('only the priced position counts', () => {
      expect(result.cryptoTotal).toBe(100);
      expect(result.perChain).toEqual([{ chain: 'btc', fiatValue: 100 }]);
    });
  });

  scenario('the 24h change is value-weighted', () => {
    let result: ReturnType<typeof aggregateCryptoPositions>;
    when('two chains move by different amounts', () => {
      // 300 BTC at +10%, 100 ETH at -10% -> (10*300 - 10*100) / 400 = +5%
      result = aggregateCryptoPositions(
        [
          { chain: 'btc', quantity: 3 },
          { chain: 'eth', quantity: 1 },
        ],
        [price('btc', 100, 10), price('eth', 100, -10)],
      );
    });
    then('the weighted change is returned', () => {
      expect(result.weightedChange).toBeCloseTo(5);
    });
  });

  scenario('an empty portfolio has no total or change', () => {
    let result: ReturnType<typeof aggregateCryptoPositions>;
    when('there are no positions', () => {
      result = aggregateCryptoPositions([], [price('btc', 100)]);
    });
    then('the total is zero', () => {
      expect(result.cryptoTotal).toBe(0);
    });
    and('the weighted change is undefined', () => {
      expect(result.weightedChange).toBeUndefined();
    });
  });
});

feature('sumGoldValue', () => {
  scenario('prices grams and ounces against the per-ounce spot', () => {
    const total = sumGoldValue(
      [
        { quantity: 2, unit: 'oz' },
        { quantity: 31.1034768, unit: 'g' }, // exactly one troy ounce
      ],
      2000,
    );

    expect(total).toBeCloseTo(6000, 6);
  });

  scenario('is zero while the spot price has not loaded', () => {
    expect(sumGoldValue([{ quantity: 5, unit: 'oz' }], undefined)).toBe(0);
    expect(sumGoldValue([{ quantity: 5, unit: 'oz' }], 0)).toBe(0);
  });
});

feature('sumAssetValue', () => {
  scenario('sums self-valued assets as entered', () => {
    expect(sumAssetValue([{ value: 250_000 }, { value: 12_500 }])).toBe(262_500);
  });

  scenario('is zero with no assets', () => {
    expect(sumAssetValue([])).toBe(0);
  });
});
