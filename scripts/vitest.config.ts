import { defineConfig } from 'vitest/config';

// Repo-level build/CI scripts (e.g. the bundle-size budget). Kept out of the
// coverage `include` set in the root config — these are tooling, exercised by
// CI itself — but their pure helpers are unit-tested here.
export default defineConfig({
  test: {
    include: ['**/*.test.ts'],
  },
});
