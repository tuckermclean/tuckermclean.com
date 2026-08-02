import { expect } from '@playwright/test';

/** Navigate to the app (optionally deep-linking to #/<hash>) and wait for boot. */
export async function openApp(page, hash = '') {
  await page.goto(hash ? `/#/${hash}` : '/');
  await expect(page.locator('.window').first()).toBeVisible();
}

/** Open the Start menu and click the menu item whose text contains `label`. */
export async function openViaMenu(page, label) {
  await page.locator('#start-button').click();
  await expect(page.locator('#menu')).toHaveClass(/active/);
  await page.locator('#menu .menu-item', { hasText: label }).click();
}

/** The window element for a given page name. */
export const win = (page, name) => page.locator(`#window-${name}`);
