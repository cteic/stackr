import { describe as feature, it as scenario, expect, beforeEach } from 'vitest';
import { bdd } from './bdd';
const { given, when, then } = bdd;
import { useSettingsStore } from './settings-store';
import { defaultCustomTheme, THEME_SEEDS } from './custom-theme';

beforeEach(() => {
  useSettingsStore.setState({ etherscanApiKey: '', customTheme: defaultCustomTheme() });
});

feature('settings — Etherscan API key', () => {
  scenario('starts empty', () => {
    then('no key is set', () => {
      expect(useSettingsStore.getState().etherscanApiKey).toBe('');
    });
  });

  scenario('a key can be saved', () => {
    when('a key is entered', () => useSettingsStore.getState().setEtherscanApiKey('test-key-123'));
    then('it is persisted in the store', () => {
      expect(useSettingsStore.getState().etherscanApiKey).toBe('test-key-123');
    });
  });

  scenario('saving a new key overwrites the old one', () => {
    given('an existing key', () => useSettingsStore.getState().setEtherscanApiKey('key-1'));
    when('a new key is saved', () => useSettingsStore.getState().setEtherscanApiKey('key-2'));
    then('only the new key remains', () => {
      expect(useSettingsStore.getState().etherscanApiKey).toBe('key-2');
    });
  });

  scenario('a key can be cleared', () => {
    given('a saved key', () => useSettingsStore.getState().setEtherscanApiKey('some-key'));
    when('it is set to empty', () => useSettingsStore.getState().setEtherscanApiKey(''));
    then('no key is set', () => {
      expect(useSettingsStore.getState().etherscanApiKey).toBe('');
    });
  });
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
    given('a store with an unknown currency and an unrecognised theme base', () =>
      localStorage.setItem(
        'stackr-settings',
        JSON.stringify({
          state: {
            etherscanApiKey: 'keep-me',
            currency: 'doge',
            alphaVantageApiKey: 42,
            customTheme: { base: 'not-a-theme', tokens: { background: '#abcdef' } },
          },
          version: 0,
        }),
      ),
    );
    when('the store rehydrates under the current version', async () => {
      await useSettingsStore.persist.rehydrate();
    });
    then('a valid string key is preserved but a non-string key is reset', () => {
      const state = useSettingsStore.getState();
      expect(state.etherscanApiKey).toBe('keep-me');
      expect(state.alphaVantageApiKey).toBe('');
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
      expect(state.etherscanApiKey).toBe('');
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
