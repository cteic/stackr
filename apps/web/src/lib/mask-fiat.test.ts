import { describe as feature, it as scenario, expect, beforeEach } from 'vitest';
import { bdd } from '../lib/bdd';
const { given, when, then } = bdd;
import { maskFiat } from '../lib/mask-fiat';
import { getDefaultStore } from 'jotai';
import { hideBalanceAtom, toggleHideBalanceAtom } from '../lib/settings-store';

const store = getDefaultStore();

beforeEach(() => {
  store.set(hideBalanceAtom, false);
});

feature('maskFiat helper', () => {
  scenario('passes the value through when not hidden', () => {
    then('the formatted string is returned unchanged', () => {
      expect(maskFiat('$1,234.56', false)).toBe('$1,234.56');
    });
  });

  scenario('masks the value when hidden', () => {
    then('the mask string is returned', () => {
      expect(maskFiat('$1,234.56', true)).toBe('••••');
    });
  });

  scenario('masks zero values', () => {
    then('zero is also masked', () => {
      expect(maskFiat('$0.00', true)).toBe('••••');
    });
  });
});

feature('settings — hide-balance toggle', () => {
  scenario('starts visible', () => {
    then('hideBalance is false by default', () => {
      expect(store.get(hideBalanceAtom)).toBe(false);
    });
  });

  scenario('toggling once hides balances', () => {
    when('the toggle is activated', () => store.set(toggleHideBalanceAtom));
    then('hideBalance is true', () => {
      expect(store.get(hideBalanceAtom)).toBe(true);
    });
  });

  scenario('toggling twice restores visibility', () => {
    given('balances are hidden', () => store.set(toggleHideBalanceAtom));
    when('the toggle is activated again', () => store.set(toggleHideBalanceAtom));
    then('hideBalance is false', () => {
      expect(store.get(hideBalanceAtom)).toBe(false);
    });
  });
});
