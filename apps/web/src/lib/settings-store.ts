import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { CurrencySchema } from '@stackr/models';
import type { Currency } from '@stackr/models';
import {
  CUSTOM_THEME_TOKENS,
  defaultCustomTheme,
  isBaseThemeId,
  THEME_SEEDS,
  type BaseThemeId,
  type CustomTheme,
  type CustomThemeTokenKey,
} from './custom-theme';

// Bumped to 1 when persisted-state validation landed. The migration re-checks
// each persisted field against its domain rules so tampered or stale localStorage
// can't rehydrate an invalid currency or a half-formed custom theme.
const PERSIST_VERSION = 1;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

// Rebuild a custom theme from persisted state, falling back to known-good
// values: an unrecognised base resets to the default theme, and any missing or
// non-string token falls back to its base seed rather than leaving the palette
// partially undefined.
function sanitizeCustomTheme(value: unknown): CustomTheme {
  if (!isRecord(value) || typeof value.base !== 'string' || !isBaseThemeId(value.base)) {
    return defaultCustomTheme();
  }
  const base = value.base;
  const tokens = { ...THEME_SEEDS[base] };
  if (isRecord(value.tokens)) {
    for (const { key } of CUSTOM_THEME_TOKENS) {
      const token = value.tokens[key];
      if (typeof token === 'string') tokens[key] = token;
    }
  }
  return { base, tokens };
}

interface SettingsState {
  etherscanApiKey: string;
  setEtherscanApiKey: (key: string) => void;
  currency: Currency;
  setCurrency: (currency: Currency) => void;
  alphaVantageApiKey: string;
  setAlphaVantageApiKey: (key: string) => void;
  hideBalance: boolean;
  toggleHideBalance: () => void;
  customTheme: CustomTheme;
  setCustomThemeBase: (base: BaseThemeId) => void;
  setCustomThemeToken: (key: CustomThemeTokenKey, value: string) => void;
  resetCustomTheme: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    set => ({
      etherscanApiKey: '',
      setEtherscanApiKey: key => set({ etherscanApiKey: key }),
      currency: 'usd',
      setCurrency: currency => set({ currency }),
      alphaVantageApiKey: '',
      setAlphaVantageApiKey: key => set({ alphaVantageApiKey: key }),
      hideBalance: false,
      toggleHideBalance: () => set(s => ({ hideBalance: !s.hideBalance })),
      customTheme: defaultCustomTheme(),
      // Picking a base reseeds the palette — the base theme is the starting point.
      setCustomThemeBase: base => set({ customTheme: { base, tokens: { ...THEME_SEEDS[base] } } }),
      setCustomThemeToken: (key, value) =>
        set(s => ({
          customTheme: { ...s.customTheme, tokens: { ...s.customTheme.tokens, [key]: value } },
        })),
      resetCustomTheme: () =>
        set(s => ({
          customTheme: { ...s.customTheme, tokens: { ...THEME_SEEDS[s.customTheme.base] } },
        })),
    }),
    {
      name: 'stackr-settings',
      version: PERSIST_VERSION,
      partialize: state => ({
        etherscanApiKey: state.etherscanApiKey,
        currency: state.currency,
        alphaVantageApiKey: state.alphaVantageApiKey,
        customTheme: state.customTheme,
      }),
      migrate: persisted => {
        if (!isRecord(persisted)) {
          return {
            etherscanApiKey: '',
            currency: 'usd',
            alphaVantageApiKey: '',
            customTheme: defaultCustomTheme(),
          };
        }
        const currency = CurrencySchema.safeParse(persisted.currency);
        return {
          etherscanApiKey:
            typeof persisted.etherscanApiKey === 'string' ? persisted.etherscanApiKey : '',
          currency: currency.success ? currency.data : 'usd',
          alphaVantageApiKey:
            typeof persisted.alphaVantageApiKey === 'string' ? persisted.alphaVantageApiKey : '',
          customTheme: sanitizeCustomTheme(persisted.customTheme),
        };
      },
    },
  ),
);
