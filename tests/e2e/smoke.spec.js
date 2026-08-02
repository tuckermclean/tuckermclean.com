import { test, expect } from '@playwright/test';

test('app boots and renders at least one window', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.window').first()).toBeVisible();
});
