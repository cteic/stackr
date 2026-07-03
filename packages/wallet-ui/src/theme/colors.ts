import type { Chain } from '@stackr/models';

/**
 * Semantic color sets for the native wallet, mirrored from the web design
 * system (`apps/web/src/app/globals.css`). The web themes are authored as CSS
 * custom properties — `.theme-terminal` (the brand-primary dark look) and the
 * root `@theme` block (light) — which React Native cannot consume, and the
 * light set is authored in `oklch()`, which React Native cannot parse. The
 * values here are the same palette expressed as hex/rgba: terminal copied
 * verbatim, light converted oklch → sRGB. If the web tokens change, this file
 * is the single place the native mapping is updated.
 */
export interface SemanticColors {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  popover: string;
  popoverForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  destructive: string;
  destructiveForeground: string;
  success: string;
  successForeground: string;
  warning: string;
  warningForeground: string;
  border: string;
  input: string;
  ring: string;
}

/** Terminal — pure-black, green/red signal, sharp edges. The wallet's default. */
export const terminalDark: SemanticColors = {
  background: '#000000',
  foreground: '#e8e8e8',
  card: '#060606',
  cardForeground: '#e8e8e8',
  popover: '#0a0a0a',
  popoverForeground: '#e8e8e8',
  primary: '#00d68f',
  primaryForeground: '#000000',
  secondary: '#121212',
  secondaryForeground: '#e8e8e8',
  muted: '#0e0e0e',
  mutedForeground: 'rgba(255, 255, 255, 0.46)',
  accent: '#151515',
  accentForeground: '#e8e8e8',
  destructive: '#ff5247',
  destructiveForeground: '#ffffff',
  success: '#00d68f',
  successForeground: '#000000',
  warning: '#f5a623',
  warningForeground: '#000000',
  border: 'rgba(255, 255, 255, 0.11)',
  input: 'rgba(255, 255, 255, 0.16)',
  ring: '#00d68f',
};

/** Light — the web root theme, converted from oklch to sRGB hex. */
export const light: SemanticColors = {
  background: '#ffffff',
  foreground: '#090910',
  card: '#ffffff',
  cardForeground: '#090910',
  popover: '#ffffff',
  popoverForeground: '#090910',
  primary: '#161524',
  primaryForeground: '#fafafa',
  secondary: '#f3f3f7',
  secondaryForeground: '#161524',
  muted: '#f3f3f7',
  mutedForeground: '#72727c',
  accent: '#f3f3f7',
  accentForeground: '#161524',
  destructive: '#e7000b',
  destructiveForeground: '#fafafa',
  success: '#009b28',
  successForeground: '#fafafa',
  warning: '#e1a200',
  warningForeground: '#161524',
  border: '#e5e5e8',
  input: '#e5e5e8',
  ring: '#4fa3ff',
};

/**
 * Chain brand colors, dark-canvas variants (matching the web dark themes).
 * SUI has no web token yet — the value is the Sui brand blue; when the web
 * adds `--color-chain-sui`, keep the two in sync.
 */
export const chainColors: Record<Chain, string> = {
  btc: '#f7931a',
  eth: '#849eff',
  stx: '#7f80ff',
  sol: '#b97cff',
  sui: '#4da2ff',
};
