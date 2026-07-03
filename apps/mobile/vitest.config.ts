import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Logic-layer tests only: the tested modules are pure TS (state machine,
// stores, adapters behind injected ports) with no react-native imports, so
// they run under node without a native renderer.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
