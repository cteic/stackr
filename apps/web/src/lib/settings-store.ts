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

// v1 added persisted-state validation. v2 dropped the BYO Etherscan / Alpha
// Vantage API-key fields: those keys are now app-owned and applied server-side
// by the `/api/etherscan` and `/api/stocks` proxies, so the migration strips
// them from any older persisted blob. The migration still re-checks each
// surviving field against its domain rules so tampered or stale localStorage
// can't rehydrate an invalid currency or a half-formed custom theme.
const PERSIST_VERSION = 2;

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
  currency: Currency;
  setCurrency: (currency: Currency) => void;
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
      currency: 'usd',
      setCurrency: currency => set({ currency }),
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
        currency: state.currency,
        customTheme: state.customTheme,
      }),
      // v2 also drops the removed `etherscanApiKey` / `alphaVantageApiKey`
      // fields: they are simply not read back out, so any value an older blob
      // carried is discarded rather than rehydrated.
      migrate: persisted => {
        if (!isRecord(persisted)) {
          return {
            currency: 'usd',
            customTheme: defaultCustomTheme(),
          };
        }
        const currency = CurrencySchema.safeParse(persisted.currency);
        return {
          currency: currency.success ? currency.data : 'usd',
          customTheme: sanitizeCustomTheme(persisted.customTheme),
        };
      },
    },
  ),
);
