import { createAnimations } from '@tamagui/animations-react-native';
import { shorthands } from '@tamagui/shorthands';
import { createTamagui, createTokens } from 'tamagui';
import { light, terminalDark, type SemanticColors } from './src/theme/colors.js';
import { radius, size, space, zIndex } from './src/theme/spacing.js';
import { monoFont } from './src/theme/typography.js';

/**
 * Tamagui configuration for the native wallet. Themes carry the full semantic
 * set from `src/theme/colors.ts` so styled components reference `$card`,
 * `$mutedForeground`, etc. exactly like the web's utility classes reference
 * the CSS custom properties. `dark` is the terminal look and the default;
 * `light` exists so the app never renders unthemed.
 */
const animations = createAnimations({
  fast: { type: 'timing', duration: 120 },
  medium: { type: 'timing', duration: 250 },
  slow: { type: 'timing', duration: 350 },
});

function toTheme(colors: SemanticColors) {
  return {
    ...colors,
    // Tamagui's built-in components read these three well-known keys.
    color: colors.foreground,
    borderColor: colors.border,
    placeholderColor: colors.mutedForeground,
  };
}

const tokens = createTokens({
  color: {
    black: '#000000',
    white: '#ffffff',
  },
  space,
  size,
  radius,
  zIndex,
});

export const config = createTamagui({
  animations,
  shorthands,
  tokens,
  fonts: {
    heading: monoFont,
    body: monoFont,
    mono: monoFont,
  },
  themes: {
    dark: toTheme(terminalDark),
    light: toTheme(light),
  },
  defaultTheme: 'dark',
});

export type WalletUiConfig = typeof config;

export default config;
