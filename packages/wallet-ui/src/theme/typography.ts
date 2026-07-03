import { createFont } from 'tamagui';

/**
 * Mono-first type, mirroring the web's IBM Plex Mono everywhere stance.
 * The consuming app is responsible for loading the font files (expo-font);
 * the family name here must match the loaded font's postscript/family name.
 */
export const monoFont = createFont({
  family: 'IBM Plex Mono',
  size: {
    1: 11,
    2: 12,
    3: 13,
    4: 15,
    5: 17,
    6: 20,
    7: 24,
    8: 30,
    9: 38,
    true: 15,
  },
  lineHeight: {
    1: 16,
    2: 18,
    3: 20,
    4: 22,
    5: 25,
    6: 28,
    7: 32,
    8: 38,
    9: 46,
    true: 22,
  },
  weight: {
    1: '400',
    4: '400',
    6: '500',
    8: '600',
    true: '400',
  },
  letterSpacing: {
    1: 0,
    4: 0,
    8: -0.5,
    true: 0,
  },
});
