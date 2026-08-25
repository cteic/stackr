import { describe as feature, it as scenario, expect, beforeEach } from 'vitest';
import { bdd } from './bdd';
const { given, when, then } = bdd;
import { useSettingsStore } from './settings-store';
import { defaultCustomTheme, THEME_SEEDS } from './custom-theme';

beforeEach(() => {
  useSettingsStore.setState({ currency: 'usd', customTheme: defaultCustomTheme() });
});

feature('settings — custom theme', () => {
  scenario('starts seeded from the default base theme', () => {
    then('the base and its seed palette are present', () => {
      const { customTheme } = useSettingsStore.getState();
      expect(customTheme.base).toBe('terminal');
      expect(customTheme.tokens).toEqual(THEME_SEEDS.terminal);
    });
  });

  scenario('an edited token is saved and persisted', () => {
    when('the background colour is changed', () =>
      useSettingsStore.getState().setCustomThemeToken('background', '#123456'),
    );
    then('the new value is held in state', () => {
      expect(useSettingsStore.getState().customTheme.tokens.background).toBe('#123456');
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
      useSettingsStore.getState().setCustomThemeToken('primary', '#ff00ff'),
    );
    when('the base switches to kraken', () =>
      useSettingsStore.getState().setCustomThemeBase('kraken'),
    );
    then('the base and palette match the kraken seed', () => {
      const { customTheme } = useSettingsStore.getState();
      expect(customTheme.base).toBe('kraken');
      expect(customTheme.tokens).toEqual(THEME_SEEDS.kraken);
    });
  });

  scenario('reset restores the base seed palette', () => {
    given('a base of leather', () => useSettingsStore.getState().setCustomThemeBase('leather'));
    given('an edited foreground', () =>
      useSettingsStore.getState().setCustomThemeToken('foreground', '#000000'),
    );
    when('the palette is reset', () => useSettingsStore.getState().resetCustomTheme());
    then('every token returns to the leather seed', () => {
      expect(useSettingsStore.getState().customTheme.tokens).toEqual(THEME_SEEDS.leather);
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
      await useSettingsStore.persist.rehydrate();
    });
    then('the removed BYO API-key fields are not written back to persisted storage', () => {
      const raw = localStorage.getItem('stackr-settings') ?? '{}';
      expect(raw).not.toContain('etherscanApiKey');
      expect(raw).not.toContain('alphaVantageApiKey');
    });
    then('the unknown currency falls back to usd', () => {
      expect(useSettingsStore.getState().currency).toBe('usd');
    });
    then('the unrecognised theme base resets to the default palette', () => {
      expect(useSettingsStore.getState().customTheme).toEqual(defaultCustomTheme());
    });
  });

  scenario('a non-object persisted blob resets every field', async () => {
    given('a store whose state is not an object', () =>
      localStorage.setItem('stackr-settings', JSON.stringify({ state: null, version: 0 })),
    );
    when('the store rehydrates', async () => {
      await useSettingsStore.persist.rehydrate();
    });
    then('all settings return to their defaults', () => {
      const state = useSettingsStore.getState();
      expect(state.currency).toBe('usd');
      expect(state.customTheme).toEqual(defaultCustomTheme());
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
      await useSettingsStore.persist.rehydrate();
    });
    then('the theme falls back to the default', () => {
      expect(useSettingsStore.getState().customTheme).toEqual(defaultCustomTheme());
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
      await useSettingsStore.persist.rehydrate();
    });
    then('the base survives and the palette falls back to its seed', () => {
      const { customTheme } = useSettingsStore.getState();
      expect(customTheme.base).toBe('kraken');
      expect(customTheme.tokens).toEqual(THEME_SEEDS.kraken);
    });
  });
});
