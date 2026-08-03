import { test, expect } from '@playwright/test';
import { openApp, win } from './helpers.js';

const TOL = 2;
const boxOf = (locator) =>
  locator.evaluate(el => ({ top: el.offsetTop, left: el.offsetLeft, width: el.offsetWidth, height: el.offsetHeight }));
const near = (a, b) => Math.abs(a - b) <= TOL;

test('maximize then restore returns the window to its prior box', async ({ page }) => {
  await openApp(page, 'resume');
  const w = win(page, 'resume');
  const before = await boxOf(w);
  await w.locator('.button.maximize').click();
  await expect(w).toHaveClass(/maximized/);
  await w.locator('.button.maximize').click();
  await expect(w).not.toHaveClass(/maximized/);
  const after = await boxOf(w);
  expect(near(after.top, before.top) && near(after.left, before.left)
      && near(after.width, before.width) && near(after.height, before.height)).toBe(true);
});

test('minimize then restore returns the window to its prior box', async ({ page }) => {
  await openApp(page, 'resume');
  const w = win(page, 'resume');
  const before = await boxOf(w);
  await w.locator('.button.minimize').click();
  await expect(w).toHaveClass(/minimized/);
  await page.locator('#tasks #window-resume').click();
  await expect(w).not.toHaveClass(/minimized/);
  const after = await boxOf(w);
  expect(near(after.top, before.top) && near(after.left, before.left)
      && near(after.width, before.width) && near(after.height, before.height)).toBe(true);
});

test('shade then unshade restores top and height', async ({ page }) => {
  await openApp(page, 'resume');
  const w = win(page, 'resume');
  const before = await boxOf(w);
  await w.locator('.window-header').dblclick();
  await expect(w).toHaveClass(/shaded/);
  await w.locator('.window-header').dblclick();
  await expect(w).not.toHaveClass(/shaded/);
  const after = await boxOf(w);
  expect(near(after.top, before.top) && near(after.height, before.height)).toBe(true);
});
