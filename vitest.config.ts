import { defineConfig } from 'vitest/config';

// Root config holds global options (coverage) that apply across the workspace
// projects listed in vitest.workspace.ts. Run `pnpm test:coverage`.
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage',
      // Unit coverage targets the logic layer. Presentational components
      // (packages/ui), React components, and Next.js pages are covered by
      // Playwright E2E instead, so they are not counted here.
      include: [
        'packages/analytics/src/**',
        'packages/models/src/**',
        'packages/services/src/**',
        'packages/charts/src/**',
        'apps/web/src/lib/**',
      ],
      exclude: [
        '**/*.test.{ts,tsx}',
        '**/*.config.{ts,js,mjs,cjs}',
        '**/test-setup.ts',
        '**/test-support/**',
        '**/bdd.ts',
        '**/index.ts',
        '**/*.d.ts',
      ],
      // Thresholds act as a no-regression floor, set just below current
      // actuals (measured 2026-06: statements 54.5 / branches 81.8 /
      // functions 66.1 / lines 54.5) and enforced in CI via the "Coverage"
      // step (`pnpm test:coverage`). Ratchet upward as the suite grows;
      // never let coverage drop.
      thresholds: {
        statements: 50,
        branches: 80,
        functions: 65,
        lines: 50,
      },
    },
  },
});
