import { describe as feature, it as scenario, expect, beforeEach } from 'vitest';
import { bdd } from './bdd';
const { given, when, then } = bdd;
import { getDefaultStore } from 'jotai';
import {
  currencyAtom,
  customThemeAtom,
  hideBalanceAtom,
  rehydrateSettings,
  resetCustomThemeAtom,
  setCustomThemeBaseAtom,
  setCustomThemeTokenAtom,
} from './settings-store';

import { defaultCustomTheme, THEME_SEEDS } from './custom-theme';

const store = getDefaultStore();

beforeEach(() => {
  store.set(currencyAtom, 'usd');
  store.set(customThemeAtom, defaultCustomTheme());
});

feature('settings — custom theme', () => {
  scenario('starts seeded from the default base theme', () => {
    then('the base and its seed palette are present', () => {
      const customTheme = store.get(customThemeAtom);
      expect(customTheme.base).toBe('terminal');
      expect(customTheme.tokens).toEqual(THEME_SEEDS.terminal);
    });
  });

  scenario('an edited token is saved and persisted', () => {
    when('the background colour is changed', () =>
      store.set(setCustomThemeTokenAtom, 'background', '#123456'),
    );
    then('the new value is held in state', () => {
      expect(store.get(customThemeAtom).tokens.background).toBe('#123456');
    });
    then('the value round-trips through persisted storage', () => {
      const raw = localStorage.getItem('stackr-settings');
      expect(raw).not.toBeNull();
      const persisted: { state: { customTheme: { tokens: { background: string } } } } = JSON.parse(
        raw ?? '{}',
      );
      expect(persisted.state.customTheme.tokens.background).toBe('#123456');
    });
  });

  scenario('choosing a base theme reseeds the whole palette', () => {
    given('an edited terminal palette', () =>
      store.set(setCustomThemeTokenAtom, 'primary', '#ff00ff'),
    );
    when('the base switches to kraken', () => store.set(setCustomThemeBaseAtom, 'kraken'));
    then('the base and palette match the kraken seed', () => {
      const customTheme = store.get(customThemeAtom);
      expect(customTheme.base).toBe('kraken');
      expect(customTheme.tokens).toEqual(THEME_SEEDS.kraken);
    });
  });

  scenario('reset restores the base seed palette', () => {
    given('a base of leather', () => store.set(setCustomThemeBaseAtom, 'leather'));
    given('an edited foreground', () =>
      store.set(setCustomThemeTokenAtom, 'foreground', '#000000'),
    );
    when('the palette is reset', () => store.set(resetCustomThemeAtom));
    then('every token returns to the leather seed', () => {
      expect(store.get(customThemeAtom).tokens).toEqual(THEME_SEEDS.leather);
    });
  });
});

feature('persisted settings migration', () => {
  scenario('invalid persisted settings fall back to safe defaults', async () => {
    given('a v1 store with a BYO key, an unknown currency and an unrecognised theme base', () =>
      localStorage.setItem(
        'stackr-settings',
        JSON.stringify({
          state: {
            etherscanApiKey: 'leftover-key',
            currency: 'doge',
            alphaVantageApiKey: 'another-leftover',
            customTheme: { base: 'not-a-theme', tokens: { background: '#abcdef' } },
          },
          version: 1,
        }),
      ),
    );
    when('the store rehydrates under the current version', async () => {
      await rehydrateSettings(store);
    });
    then('the removed BYO API-key fields are not written back to persisted storage', () => {
      const raw = localStorage.getItem('stackr-settings') ?? '{}';
      expect(raw).not.toContain('etherscanApiKey');
      expect(raw).not.toContain('alphaVantageApiKey');
    });
    then('the unknown currency falls back to usd', () => {
      expect(store.get(currencyAtom)).toBe('usd');
    });
    then('the unrecognised theme base resets to the default palette', () => {
      expect(store.get(customThemeAtom)).toEqual(defaultCustomTheme());
    });
  });

  scenario('a non-object persisted blob resets every field', async () => {
    given('a store whose state is not an object', () =>
      localStorage.setItem('stackr-settings', JSON.stringify({ state: null, version: 0 })),
    );
    when('the store rehydrates', async () => {
      await rehydrateSettings(store);
    });
    then('all settings return to their defaults', () => {
      expect(store.get(currencyAtom)).toBe('usd');
      expect(store.get(customThemeAtom)).toEqual(defaultCustomTheme());
    });
  });

  scenario('a non-string theme base resets to the default palette', async () => {
    given('a custom theme whose base is not a string', () =>
      localStorage.setItem(
        'stackr-settings',
        JSON.stringify({ state: { customTheme: { base: 7, tokens: {} } }, version: 0 }),
      ),
    );
    when('the store rehydrates', async () => {
      await rehydrateSettings(store);
    });
    then('the theme falls back to the default', () => {
      expect(store.get(customThemeAtom)).toEqual(defaultCustomTheme());
    });
  });

  scenario('a known base with a malformed token map keeps the base seed', async () => {
    given('a valid base whose tokens are not an object', () =>
      localStorage.setItem(
        'stackr-settings',
        JSON.stringify({ state: { customTheme: { base: 'kraken', tokens: 'oops' } }, version: 0 }),
      ),
    );
    when('the store rehydrates', async () => {
      await rehydrateSettings(store);
    });
    then('the base survives and the palette falls back to its seed', () => {
      const customTheme = store.get(customThemeAtom);
      expect(customTheme.base).toBe('kraken');
      expect(customTheme.tokens).toEqual(THEME_SEEDS.kraken);
    });
  });
});

feature('settings — derived atom subscriptions', () => {
  scenario('editing a theme token does not notify a currency subscriber', () => {
    let currencyNotifications = 0;
    const unsubscribe = store.sub(currencyAtom, () => {
      currencyNotifications += 1;
    });

    when('a theme token changes', () =>
      store.set(setCustomThemeTokenAtom, 'background', '#101010'),
    );

    then('the currency subscriber is left alone', () => expect(currencyNotifications).toBe(0));
    unsubscribe();
  });

  scenario('changing the currency does notify a currency subscriber', () => {
    let currencyNotifications = 0;
    const unsubscribe = store.sub(currencyAtom, () => {
      currencyNotifications += 1;
    });

    when('the currency changes', () => store.set(currencyAtom, 'eur'));

    then('the subscriber is notified once', () => expect(currencyNotifications).toBe(1));
    unsubscribe();
  });

  scenario('hiding balances is session-only and never persisted', () => {
    given('a clean storage key', () => localStorage.removeItem('stackr-settings'));
    when('balances are hidden', () => store.set(hideBalanceAtom, true));

    then('the flag is set for this session', () => expect(store.get(hideBalanceAtom)).toBe(true));
    then('nothing about it reaches persisted storage', () =>
      expect(localStorage.getItem('stackr-settings') ?? '').not.toContain('hideBalance'),
    );
  });
});
