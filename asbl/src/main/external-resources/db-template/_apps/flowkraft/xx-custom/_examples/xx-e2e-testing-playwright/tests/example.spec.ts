import { test, expect } from '@playwright/test';

// The canonical Playwright starter spec — runs against https://playwright.dev
// (baseURL is set in playwright.config.ts). Replace these with your own tests.

test('has title', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Playwright/);
});

test('get started link', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Get started' }).click();
  await expect(page.getByRole('heading', { name: 'Installation' })).toBeVisible();
});
