import { expect } from '@playwright/test';
import { defineStep, type StepContext } from './runner';

const MOCK_ADDRESS = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const TRUNCATED = `${MOCK_ADDRESS.slice(0, 6)}…${MOCK_ADDRESS.slice(-4)}`;

const SYNC_CONFIGURED =
  typeof process.env.NEXT_PUBLIC_SUPABASE_URL === 'string' &&
  process.env.NEXT_PUBLIC_SUPABASE_URL !== '';

function dialog({ page }: StepContext) {
  return page.getByRole('dialog', { name: 'Connect a wallet' });
}

function metamaskRow(ctx: StepContext) {
  return dialog(ctx).locator('li', { hasText: 'MetaMask' });
}

function stackrWalletRow(ctx: StepContext) {
  return dialog(ctx).locator('li', { hasText: 'Stackr Wallet' });
}

// --- Givens ---------------------------------------------------------------

defineStep(/^a fresh visitor$/, async ({ page }) => {
  // Nothing persisted: a brand-new browser context is already fresh, but be
  // explicit so the step stays truthful if fixtures ever reuse contexts.
  await page.context().clearCookies();
});

defineStep(/^no wallet extensions are installed$/, async () => {
  // The default test browser has no extensions; nothing to do. The step
  // exists so the spec reads honestly.
});

defineStep(/^the MetaMask extension is installed$/, async ({ page }) => {
  // Detection marker only (`'ethereum' in window` — see wallet-detect.ts).
  // The actual connect transport is wagmi's mock connector, enabled by the
  // web server's NEXT_PUBLIC_E2E_MOCK_WALLET flag, so no SDK probing happens.
  await page.addInitScript(() => {
    Object.defineProperty(window, 'ethereum', { value: { isMetaMask: true }, configurable: true });
  });
});

defineStep(/^the sync service is not configured$/, async ({ testInfo }) => {
  testInfo.skip(SYNC_CONFIGURED, 'Supabase env is present; the unavailable state cannot render.');
});

defineStep(/^the sync service is configured$/, async ({ testInfo }) => {
  testInfo.skip(!SYNC_CONFIGURED, 'Set NEXT_PUBLIC_SUPABASE_URL/_ANON_KEY to run the QR scenario.');
});

// --- Whens ----------------------------------------------------------------

defineStep(/^they open the dashboard$/, async ({ page }) => {
  await page.goto('/');
});

defineStep(/^they open the connect modal$/, async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Connect a wallet' })).toBeVisible();
});

defineStep(/^they load the demo portfolio$/, async ({ page }) => {
  await page.getByRole('button', { name: 'Load demo portfolio' }).click();
});

defineStep(/^they connect MetaMask$/, async ctx => {
  await metamaskRow(ctx).getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(metamaskRow(ctx).getByRole('button', { name: 'Disconnect' })).toBeVisible({
    timeout: 15_000,
  });
});

defineStep(/^they disconnect MetaMask$/, async ctx => {
  await metamaskRow(ctx).getByRole('button', { name: 'Disconnect' }).click();
});

defineStep(/^they close the connect modal$/, async ctx => {
  await ctx.page.keyboard.press('Escape');
  await expect(dialog(ctx)).not.toBeVisible();
});

defineStep(/^they choose to pair Stackr Wallet$/, async ctx => {
  await stackrWalletRow(ctx).getByRole('button', { name: 'Pair' }).click();
});

// --- Thens ----------------------------------------------------------------

defineStep(/^the get-started hero is visible$/, async ({ page }) => {
  await expect(page.getByRole('region', { name: 'Get started' })).toBeVisible();
});

defineStep(/^the get-started hero is gone$/, async ({ page }) => {
  await expect(page.getByRole('region', { name: 'Get started' })).not.toBeVisible();
});

defineStep(/^the "([^"]+)" action is available$/, async ({ page }, name) => {
  await expect(page.getByRole('button', { name })).toBeVisible();
});

defineStep(/^a demo wallet appears in the portfolio$/, async ({ page }) => {
  await expect(page.getByText('Demo ·').first()).toBeVisible();
});

defineStep(/^the MetaMask entry offers an install link$/, async ctx => {
  const installLink = metamaskRow(ctx).getByRole('link', { name: 'Install' });
  await expect(installLink).toBeVisible();
  await expect(installLink).toHaveAttribute('href', 'https://metamask.io/download');
});

defineStep(/^the MetaMask entry offers disconnect$/, async ctx => {
  await expect(metamaskRow(ctx).getByRole('button', { name: 'Disconnect' })).toBeVisible();
});

defineStep(/^the MetaMask entry offers connect$/, async ctx => {
  await expect(metamaskRow(ctx).getByRole('button', { name: 'Connect', exact: true })).toBeVisible({
    timeout: 15_000,
  });
});

defineStep(/^the header shows the wallets trigger$/, async ({ page }) => {
  await expect(page.getByRole('button', { name: 'Wallets', exact: true })).toBeVisible();
});

defineStep(/^the connected address appears on the dashboard$/, async ({ page }) => {
  await expect(page.getByText(TRUNCATED).first()).toBeVisible({ timeout: 15_000 });
});

defineStep(/^the Stackr Wallet entry is unavailable$/, async ctx => {
  await expect(stackrWalletRow(ctx).getByRole('button', { name: 'Unavailable' })).toBeDisabled();
});

defineStep(/^the sync service explainer is shown$/, async ctx => {
  await expect(
    stackrWalletRow(ctx).getByText('Pairing needs the sync service configured'),
  ).toBeVisible();
});

defineStep(/^a pairing QR code is shown$/, async ({ page }) => {
  await expect(page.getByRole('img', { name: 'Stackr Link pairing QR code' })).toBeVisible({
    timeout: 15_000,
  });
});
