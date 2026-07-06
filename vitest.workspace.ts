import { defineWorkspace } from 'vitest/config';

// Glob discovery: a new app or package brings its own vitest.config.ts and is
// picked up automatically — no more one-line edits to a shared file from every
// parallel branch (the #1 source of the conflict treadmill).
export default defineWorkspace([
  'apps/*/vitest.config.ts',
  'packages/*/vitest.config.ts',
  'scripts/vitest.config.ts',
]);
