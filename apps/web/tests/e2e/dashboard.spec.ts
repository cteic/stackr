import { test, expect } from '@playwright/test';

test('dashboard page loads', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Portfolio' })).toBeVisible();
});

test('shows the first-run hero when nothing is tracked', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'Get started' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Load demo portfolio' })).toBeVisible();
});

test('navigates to add wallet page', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Add a wallet' }).click();
  await expect(page).toHaveURL(/\/wallet\/add/);
  await expect(page.getByRole('heading', { name: 'Add Wallet' })).toBeVisible();
});
