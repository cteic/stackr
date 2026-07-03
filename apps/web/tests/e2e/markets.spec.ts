import { test, expect } from '@playwright/test';

const now = Date.now();
// 24 hourly points, gently rising — enough for the chart to render (needs >= 2).
const mockPrices = Array.from({ length: 24 }, (_, i) => [
  now - (23 - i) * 3_600_000,
  50_000 + i * 100,
]);

async function mockCoinGecko(page: import('@playwright/test').Page) {
  await page.route('**/api.coingecko.com/**', route =>
    route.fulfill({ json: { prices: mockPrices } }),
  );
}

test('markets page is reachable from the nav', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Markets' }).click();
  await expect(page).toHaveURL(/\/market/);
  await expect(page.getByRole('heading', { name: 'Markets' })).toBeVisible();
});

test('renders a price chart for the default asset with range controls', async ({ page }) => {
  await mockCoinGecko(page);
  await page.goto('/market');

  await expect(page.getByRole('button', { name: '24H' })).toBeVisible();
  await expect(page.getByRole('button', { name: '7D' })).toBeVisible();
  await expect(page.getByRole('button', { name: '1Y' })).toBeVisible();

  await expect(page.getByTestId('price-chart').locator('svg')).toBeVisible();
});

test('switching the time range keeps the chart visible', async ({ page }) => {
  await mockCoinGecko(page);
  await page.goto('/market');

  await page.getByRole('button', { name: '30D' }).click();
  await expect(page.getByTestId('price-chart').locator('svg')).toBeVisible();
});

test('shows the order book and depth chart alongside the price chart', async ({ page }) => {
  await mockCoinGecko(page);
  await page.goto('/market');

  // Live is the default; switch to mock so the book renders without any
  // network, for the default BTC pair.
  await page.getByRole('button', { name: 'Live' }).click();
  await expect(page.getByText('Order Book — BTC/USD')).toBeVisible();
  await expect(page.getByText('Depth Chart —')).toBeVisible();
});

test('legacy /charts route redirects to the combined markets page', async ({ page }) => {
  await mockCoinGecko(page);
  await page.goto('/charts');

  await expect(page).toHaveURL(/\/market/);
  await expect(page.getByRole('heading', { name: 'Markets' })).toBeVisible();
});
