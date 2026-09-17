import { atom } from 'jotai';
import { CurrencySchema } from '@stackr/models';
import type { Currency } from '@stackr/models';
import { persistedAtom } from './persisted-atom';
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

/** The fields that survive a reload. `hideBalance` deliberately does not. */
interface PersistedSettings {
  currency: Currency;
  customTheme: CustomTheme;
}

function defaultSettings(): PersistedSettings {
  return { currency: 'usd', customTheme: defaultCustomTheme() };
}

// v2 also drops the removed `etherscanApiKey` / `alphaVantageApiKey` fields:
// they are simply not read back out, so any value an older blob carried is
// discarded rather than rehydrated.
function migrateSettings(persisted: unknown): PersistedSettings {
  if (!isRecord(persisted)) return defaultSettings();
  const currency = CurrencySchema.safeParse(persisted.currency);
  return {
    currency: currency.success ? currency.data : 'usd',
    customTheme: sanitizeCustomTheme(persisted.customTheme),
  };
}

const { valueAtom: settingsAtom, rehydrate: rehydrateSettings } = persistedAtom(
  'stackr-settings',
  PERSIST_VERSION,
  defaultSettings(),
  migrateSettings,
);

export { settingsAtom, rehydrateSettings };

/**
 * One atom per field, derived from the single persisted blob.
 *
 * Splitting them is what keeps a subscription narrow: the header reads
 * `currencyAtom` only, so editing a theme token republishes `settingsAtom` but
 * leaves the header alone. Jotai compares a derived atom's recomputed value
 * with `Object.is` and skips the notification when it is unchanged, so a
 * currency string that did not move re-renders nothing.
 */
export const currencyAtom = atom(
  get => get(settingsAtom).currency,
  (get, set, currency: Currency) => {
    set(settingsAtom, { ...get(settingsAtom), currency });
  },
);

export const customThemeAtom = atom(
  get => get(settingsAtom).customTheme,
  (get, set, customTheme: CustomTheme) => {
    set(settingsAtom, { ...get(settingsAtom), customTheme });
  },
);

/**
 * Whether fiat amounts are masked. Session-only by design: hiding balances is a
 * "someone is looking over my shoulder" gesture, so it resets on reload rather
 * than following the user to their next visit.
 */
export const hideBalanceAtom = atom(false);

export const toggleHideBalanceAtom = atom(null, (get, set) => {
  set(hideBalanceAtom, !get(hideBalanceAtom));
});

/** Picking a base reseeds the palette — the base theme is the starting point. */
export const setCustomThemeBaseAtom = atom(null, (_get, set, base: BaseThemeId) => {
  set(customThemeAtom, { base, tokens: { ...THEME_SEEDS[base] } });
});

export const setCustomThemeTokenAtom = atom(
  null,
  (get, set, key: CustomThemeTokenKey, value: string) => {
    const current = get(customThemeAtom);
    set(customThemeAtom, { ...current, tokens: { ...current.tokens, [key]: value } });
  },
);

export const resetCustomThemeAtom = atom(null, (get, set) => {
  const current = get(customThemeAtom);
  set(customThemeAtom, { ...current, tokens: { ...THEME_SEEDS[current.base] } });
});
