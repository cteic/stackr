import { defineConfig, devices } from '@playwright/test';

// Overridable so parallel checkouts (worktrees, second dev servers) don't
// collide on — or silently reuse — a single port's server.
const port = Number(process.env.PLAYWRIGHT_PORT ?? 3000);

// Pass the parent environment through and add the e2e wallet mock flag, so
// the connect flow is testable without a browser extension (see
// wagmi-config.ts). Playwright's types want string values only.
const webServerEnv: Record<string, string> = {};
for (const [key, value] of Object.entries(process.env)) {
  if (value !== undefined) webServerEnv[key] = value;
}
webServerEnv.NEXT_PUBLIC_E2E_MOCK_WALLET = 'true';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'blob' : 'html',
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: `pnpm dev --port ${port}`,
    url: `http://localhost:${port}`,
    env: webServerEnv,
    reuseExistingServer: !process.env.CI,
    // Cold-start compile of the grown workspace can exceed the 60s default
    // on a busy CI shard.
    timeout: 180_000,
  },
});
