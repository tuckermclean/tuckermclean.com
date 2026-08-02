import { test, expect } from '@playwright/test';
import { openApp, openViaMenu, win } from './helpers.js';

const zIndexOf = (locator) => locator.evaluate((el) => parseInt(el.style.zIndex || '0', 10));

test('clicking a rear window brings it to front with the highest z-index', async ({ page }) => {
  await openApp(page); // welcome (index 0, offset up-left)
  await openViaMenu(page, 'Resume'); // resume front, offset down-right of welcome
  await expect(win(page, 'resume')).toHaveClass(/front/);

  // Welcome's top-left header corner is exposed because it is offset less.
  await win(page, 'welcome').locator('.window-header').click({ position: { x: 5, y: 5 } });

  await expect(win(page, 'welcome')).toHaveClass(/front/);
  await expect(win(page, 'resume')).not.toHaveClass(/front/);
  await expect(page).toHaveURL(/#\/welcome$/);

  const zWelcome = await zIndexOf(win(page, 'welcome'));
  const zResume = await zIndexOf(win(page, 'resume'));
  expect(zWelcome).toBeGreaterThan(zResume);
});
