import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  'apps/alerts/vitest.config.ts',
  'apps/web/vitest.config.ts',
  'packages/analytics/vitest.config.ts',
  'packages/models/vitest.config.ts',
  'packages/charts/vitest.config.ts',
  'packages/services/vitest.config.ts',
  'packages/queries/vitest.config.ts',
  'packages/controllers/vitest.config.ts',
  'packages/features/vitest.config.ts',
  'scripts/vitest.config.ts',
]);
