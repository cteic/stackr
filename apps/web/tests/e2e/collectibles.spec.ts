import { test, expect } from '@playwright/test';

test('collectibles page is reachable from the nav', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Collectibles' }).click();
  await expect(page).toHaveURL(/\/collectibles/);
  await expect(page.getByRole('heading', { name: 'Collectibles' })).toBeVisible();
});

test('shows an empty state with no wallet to read collectibles for', async ({ page }) => {
  // Fresh context has no persisted wallets, so no NFT adapter has an address to
  // read — the page should guide the user to add one rather than render a grid.
  await page.goto('/collectibles');

  await expect(page.getByText('No collectibles to show')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Add a wallet' })).toBeVisible();
});
