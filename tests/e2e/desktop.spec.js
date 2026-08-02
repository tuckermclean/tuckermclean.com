import { test, expect } from '@playwright/test';
import { openApp, openViaMenu, win } from './helpers.js';

test('start button opens the menu; clicking an item closes it', async ({ page }) => {
  await openApp(page);
  await page.locator('#start-button').click();
  await expect(page.locator('#menu')).toHaveClass(/active/);
  await page.locator('#menu .menu-item', { hasText: 'Toggle Mode' }).click();
  await expect(page.locator('#menu')).not.toHaveClass(/active/);
});

test('right-clicking the desktop opens the context menu', async ({ page }) => {
  await openApp(page);
  // Right-click an empty desktop area away from the boot window.
  await page.mouse.click(1250, 150, { button: 'right' });
  await expect(page.locator('#menu')).toHaveClass(/active/);
});

test('Minimize All moves every window into #tasks', async ({ page }) => {
  await openApp(page); // welcome
  await openViaMenu(page, 'Resume'); // + resume
  await openViaMenu(page, 'Minimize All');
  await expect(page.locator('#tasks #window-welcome')).toBeVisible();
  await expect(page.locator('#tasks #window-resume')).toBeVisible();
  await expect(win(page, 'welcome')).toHaveClass(/minimized/);
  await expect(win(page, 'resume')).toHaveClass(/minimized/);
});

test('Tile un-minimizes all windows and lays them out', async ({ page }) => {
  await openApp(page);
  await openViaMenu(page, 'Resume');
  await openViaMenu(page, 'Minimize All');
  await openViaMenu(page, 'Tile Windows');
  for (const name of ['welcome', 'resume']) {
    await expect(page.locator(`body > #window-${name}`)).toBeVisible();
    await expect(win(page, name)).not.toHaveClass(/minimized/);
  }
});

test('Cascade un-minimizes all windows', async ({ page }) => {
  await openApp(page);
  await openViaMenu(page, 'Resume');
  await openViaMenu(page, 'Minimize All');
  await openViaMenu(page, 'Cascade Windows');
  for (const name of ['welcome', 'resume']) {
    await expect(page.locator(`body > #window-${name}`)).toBeVisible();
    await expect(win(page, name)).not.toHaveClass(/minimized/);
  }
});

test('Toggle Mode flips body.toggled and persists across reload', async ({ page }) => {
  await openApp(page);
  await expect(page.locator('body')).not.toHaveClass(/toggled/); // default dark
  await openViaMenu(page, 'Toggle Mode');
  await expect(page.locator('body')).toHaveClass(/toggled/);
  expect(await page.evaluate(() => localStorage.getItem('mode'))).toBe('light');

  await page.reload();
  await expect(page.locator('body')).toHaveClass(/toggled/); // persisted
});

test('chat window opens with its form (no backend messaging asserted)', async ({ page }) => {
  await openApp(page);
  await openViaMenu(page, 'Chat with Me');
  await expect(win(page, 'chat')).toBeVisible();
  await expect(win(page, 'chat').locator('#message')).toBeVisible();
});
