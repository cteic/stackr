import { describe, expect, it } from 'vitest';
import { queryKeys } from './keys.js';

/**
 * The factory's contract is prefix invalidation: a broader key must be a
 * literal prefix of every narrower one beneath it, or passing it to
 * `invalidateQueries` silently matches nothing.
 */
function isPrefixOf(prefix: readonly unknown[], key: readonly unknown[]): boolean {
  return prefix.every((segment, index) => key[index] === segment);
}

const ADDRESS = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';

describe('queryKeys', () => {
  it('namespaces every key under one root', () => {
    expect(queryKeys.balance('sol', ADDRESS)[0]).toBe('stackr');
    expect(queryKeys.tokenPositions('sol', ADDRESS)[0]).toBe('stackr');
    expect(queryKeys.transactions('sol', ADDRESS)[0]).toBe('stackr');
  });

  it('builds a balance key from broadest to narrowest', () => {
    expect(queryKeys.balance('sol', ADDRESS)).toEqual(['stackr', 'balance', 'sol', ADDRESS]);
  });

  it('makes the balances prefix invalidate every chain', () => {
    expect(isPrefixOf(queryKeys.balances(), queryKeys.balance('sol', ADDRESS))).toBe(true);
    expect(isPrefixOf(queryKeys.balances(), queryKeys.balance('eth', ADDRESS))).toBe(true);
  });

  it('makes the token-positions prefix invalidate every address', () => {
    expect(
      isPrefixOf(queryKeys.tokenPositionsAll(), queryKeys.tokenPositions('sol', ADDRESS)),
    ).toBe(true);
  });

  it('makes the transactions prefix invalidate every address', () => {
    expect(isPrefixOf(queryKeys.transactionsAll(), queryKeys.transactions('sol', ADDRESS))).toBe(
      true,
    );
  });

  it('keeps balances and token positions in separate namespaces', () => {
    expect(isPrefixOf(queryKeys.balances(), queryKeys.tokenPositions('sol', ADDRESS))).toBe(false);
  });

  it('separates two addresses on the same chain', () => {
    expect(queryKeys.balance('sol', ADDRESS)).not.toEqual(queryKeys.balance('sol', 'other'));
  });

  it('puts the currency in the price key, so switching currency is a new entry', () => {
    expect(queryKeys.pricesByChains(['sol'], 'usd')).not.toEqual(
      queryKeys.pricesByChains(['sol'], 'eur'),
    );
    expect(isPrefixOf(queryKeys.prices(), queryKeys.pricesByChains(['sol'], 'usd'))).toBe(true);
  });
});
