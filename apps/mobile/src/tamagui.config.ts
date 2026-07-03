import { createAnimations } from '@tamagui/animations-react-native';
import { createFont, createTamagui, createTokens } from 'tamagui';

/**
 * Stackr Wallet Tamagui configuration — the dark trading-terminal aesthetic
 * from the web app (ADR 0008), expressed as native tokens.
 *
 * TEMPORARY HOME: this config (and the components in `src/components/`) is the
 * app-local stand-in for the shared `@stackr/wallet-ui` package being built on
 * a parallel branch. When that package lands, this file is deleted and the app
 * imports `@stackr/wallet-ui/tamagui.config` instead — the token names below
 * follow that package's contract so the swap is mechanical.
 */

const animations = createAnimations({
  fast: { type: 'timing', duration: 120 },
  medium: { type: 'timing', duration: 250 },
  slow: { type: 'timing', duration: 350 },
});

const body = createFont({
  family: '-apple-system, BlinkMacSystemFont, Inter, sans-serif',
  size: { 1: 11, 2: 12, 3: 13, 4: 15, 5: 17, 6: 20, 7: 24, 8: 32, 9: 40 },
  lineHeight: { 1: 14, 2: 16, 3: 18, 4: 20, 5: 24, 6: 28, 7: 32, 8: 40, 9: 48 },
  weight: { 1: '400', 4: '500', 6: '600', 8: '700' },
  letterSpacing: { 1: 0, 4: 0, 8: -0.5 },
});

// Numerals and addresses render in mono — the terminal signature.
const mono = createFont({
  family: 'Menlo, monospace',
  size: { 1: 11, 2: 12, 3: 13, 4: 15, 5: 17, 6: 20, 7: 24, 8: 30, 9: 38 },
  lineHeight: { 1: 14, 2: 16, 3: 18, 4: 20, 5: 24, 6: 28, 7: 32, 8: 38, 9: 46 },
  weight: { 1: '400', 6: '600', 8: '700' },
  letterSpacing: { 1: 0, 8: -0.5 },
});

const tokens = createTokens({
  color: {
    background: '#0b0d10',
    surface: '#12151a',
    surfaceHover: '#181c23',
    border: '#232830',
    text: '#e7eaf0',
    textMuted: '#8b93a1',
    textFaint: '#5c6470',
    positive: '#30d158',
    negative: '#ff453a',
    warning: '#ffd60a',
    accent: '#ff9f0a',
    accentText: '#0b0d10',
  },
  size: { 0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 7: 32, 8: 40, 9: 48, 10: 64, true: 16 },
  space: {
    0: 0,
    1: 4,
    2: 8,
    3: 12,
    4: 16,
    5: 20,
    6: 24,
    7: 32,
    8: 40,
    9: 48,
    true: 16,
  },
  radius: { 0: 0, 1: 4, 2: 6, 3: 8, 4: 12, 5: 16, true: 8 },
  zIndex: { 0: 0, 1: 100, 2: 200, 3: 300, true: 100 },
});

export const config = createTamagui({
  animations,
  fonts: {
    body,
    heading: body,
    mono,
  },
  tokens,
  themes: {
    dark: {
      background: tokens.color.background,
      color: tokens.color.text,
    },
  },
  defaultTheme: 'dark',
});

export type StackrTamaguiConfig = typeof config;

declare module 'tamagui' {
  // Tamagui's documented augmentation point: merging the app config into the
  // library's interface is what types every `$token` prop in the app.
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface TamaguiCustomConfig extends StackrTamaguiConfig {}
}
