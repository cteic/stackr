import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // View-model transforms are pure functions: no DOM, no platform globals.
    // A node environment enforces that purity at test time.
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
