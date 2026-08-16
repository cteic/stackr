import { test, expect } from '@playwright/test';

// Kept in sync with `E2E_MOCK_ACCOUNT` in `src/lib/wagmi-config.ts` — that's
// the address wagmi's connector-level mock actually connects, driven by the
// `NEXT_PUBLIC_E2E_MOCK_WALLET` flag the webServer sets for this test run.
const MOCK_ADDRESS = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const TRUNCATED = `${MOCK_ADDRESS.slice(0, 6)}…${MOCK_ADDRESS.slice(-4)}`;

/*
 * Only stands in for extension *detection* (`'ethereum' in window`, see
 * `wallet-detect.ts`) so the MetaMask row offers Connect instead of Install.
 * The connection itself never touches this object: wagmi is configured with
 * a connector-level mock in this test run, which is what actually resolves
 * the connect flow — a window-level EIP-1193 stub can't, because the real
 * MetaMask connector's SDK probes transport methods no stub answers.
 */
function installEthereumStub() {
  Object.defineProperty(window, 'ethereum', { value: {}, configurable: true });
}

test('connects MetaMask wallet and surfaces the address across the app', async ({ page }) => {
  await page.addInitScript(installEthereumStub);

  await page.goto('/');

  // Disconnected state: the header trigger reads "Connect".
  const trigger = page.getByRole('button', { name: 'Connect', exact: true });
  await trigger.click();

  const dialog = page.getByRole('dialog', { name: 'Connect a wallet' });
  await expect(dialog).toBeVisible();

  // The MetaMask row detects the injected provider and offers Connect (not Install).
  const metamaskRow = dialog.locator('li', { hasText: 'MetaMask' });
  await metamaskRow.getByRole('button', { name: 'Connect', exact: true }).click();

  // Connected: the row flips to Disconnect once the address lands in the store.
  await expect(metamaskRow.getByRole('button', { name: 'Disconnect' })).toBeVisible({
    timeout: 15_000,
  });

  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();

  // The header trigger now reads "Wallets" and the dashboard shows the
  // connected address as a truncated wallet-card label.
  await expect(page.getByRole('button', { name: 'Wallets', exact: true })).toBeVisible();
  await expect(page.getByText(TRUNCATED).first()).toBeVisible({ timeout: 15_000 });
});

test('shows the install link when no wallet extension is present', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Connect', exact: true }).click();

  const dialog = page.getByRole('dialog', { name: 'Connect a wallet' });
  await expect(dialog).toBeVisible();

  // Without an injected provider the MetaMask row offers Install, not Connect.
  const metamaskRow = dialog.locator('li', { hasText: 'MetaMask' });
  const installLink = metamaskRow.getByRole('link', { name: 'Install' });
  await expect(installLink).toBeVisible();
  await expect(installLink).toHaveAttribute('href', 'https://metamask.io/download');
});
