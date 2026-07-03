import { describe, expect, it } from 'vitest';
import { ChainSchema } from '@stackr/models';
import { chainColors, light, terminalDark, type SemanticColors } from './colors.js';

const RN_PARSEABLE = /^(#[0-9a-f]{6}|#[0-9a-f]{8}|rgba?\([\d\s.,%]+\))$/i;

function entries(colors: SemanticColors): [string, string][] {
  return Object.entries(colors);
}

describe('wallet-ui themes', () => {
  it.each([
    ['terminalDark', terminalDark],
    ['light', light],
  ])('%s uses only React-Native-parseable color syntax (no oklch)', (_name, theme) => {
    for (const [token, value] of entries(theme)) {
      expect(value, `${token} must be hex or rgb(a)`).toMatch(RN_PARSEABLE);
    }
  });

  it('themes define the identical token set (no theme-switch crashes)', () => {
    expect(Object.keys(light).sort()).toEqual(Object.keys(terminalDark).sort());
  });

  it.each([
    ['terminalDark', terminalDark],
    ['light', light],
  ])('%s pairs every surface with a distinct foreground', (_name, theme) => {
    const pairs: [string, string][] = [
      [theme.background, theme.foreground],
      [theme.primary, theme.primaryForeground],
      [theme.destructive, theme.destructiveForeground],
      [theme.success, theme.successForeground],
      [theme.warning, theme.warningForeground],
    ];
    for (const [surface, foreground] of pairs) {
      expect(surface).not.toBe(foreground);
    }
  });

  it('covers every chain in the domain model with a brand color', () => {
    for (const chain of ChainSchema.options) {
      expect(chainColors[chain]).toMatch(RN_PARSEABLE);
    }
  });
});
