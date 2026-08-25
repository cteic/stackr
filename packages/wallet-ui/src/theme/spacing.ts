/**
 * Layout tokens on a 4px grid. Radius is deliberately zero across the scale:
 * the brand look (terminal aesthetic, ADR 0008) is sharp edges, matching the
 * web themes' `--radius-*: 0`.
 */
export const space = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
  true: 16,
};

export const size = {
  ...space,
  7: 28,
  9: 36,
  11: 44,
  14: 56,
  20: 80,
};

export const radius = {
  0: 0,
  1: 0,
  2: 0,
  3: 0,
  4: 0,
  true: 0,
};

export const zIndex = {
  0: 0,
  1: 100,
  2: 200,
  3: 300,
  4: 400,
  5: 500,
};
