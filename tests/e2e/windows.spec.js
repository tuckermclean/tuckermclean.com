import { test, expect } from './fixtures.js';
import { openApp, openViaMenu, win } from './helpers.js';

test('opening a page shows correct title + icon and sets the hash', async ({ page }) => {
  await openApp(page);
  await openViaMenu(page, 'Resume');
  await expect(win(page, 'resume')).toBeVisible();
  await expect(win(page, 'resume').locator('.window-title')).toHaveText('Resume');
  await expect(win(page, 'resume').locator('.window-icon')).toHaveText('📜');
  await expect(page).toHaveURL(/#\/resume$/);
});

test('opening an already-open page does not duplicate it', async ({ page }) => {
  await openApp(page);
  await openViaMenu(page, 'Resume');
  await expect(win(page, 'resume')).toHaveCount(1);
  await openViaMenu(page, 'Resume');
  await expect(win(page, 'resume')).toHaveCount(1);
  await expect(win(page, 'resume')).toHaveClass(/front/);
});

test('closing a window promotes the remaining top window and updates the hash', async ({ page }) => {
  await openApp(page); // welcome
  await openViaMenu(page, 'Resume'); // resume front, #/resume
  await win(page, 'resume').locator('.button.close').click();
  await expect(win(page, 'resume')).toHaveCount(0);
  await expect(win(page, 'welcome')).toHaveClass(/front/);
  await expect(page).toHaveURL(/#\/welcome$/);
});

test('closing the last window clears the URL back to /', async ({ page }) => {
  await openApp(page, 'resume'); // only resume open
  await win(page, 'resume').locator('.button.close').click();
  await expect(win(page, 'resume')).toHaveCount(0);
  await expect(page).toHaveURL('http://localhost:1313/');
});

test('minimize moves the window into #tasks; clicking it restores and refocuses', async ({ page }) => {
  await openApp(page, 'resume');
  await win(page, 'resume').locator('.button.minimize').click();
  await expect(page.locator('#tasks #window-resume')).toBeVisible();
  await expect(win(page, 'resume')).toHaveClass(/minimized/);

  await page.locator('#tasks #window-resume').click();
  await expect(win(page, 'resume')).not.toHaveClass(/minimized/);
  await expect(page.locator('body > #window-resume')).toBeVisible();
  await expect(win(page, 'resume')).toHaveClass(/front/);
});

test('maximize toggles the maximized class', async ({ page }) => {
  await openApp(page, 'resume');
  await win(page, 'resume').locator('.button.maximize').click();
  await expect(win(page, 'resume')).toHaveClass(/maximized/);
  await win(page, 'resume').locator('.button.maximize').click();
  await expect(win(page, 'resume')).not.toHaveClass(/maximized/);
});

test('double-clicking the header toggles the shaded class', async ({ page }) => {
  await openApp(page, 'resume');
  await win(page, 'resume').locator('.window-header').dblclick();
  await expect(win(page, 'resume')).toHaveClass(/shaded/);
  await win(page, 'resume').locator('.window-header').dblclick();
  await expect(win(page, 'resume')).not.toHaveClass(/shaded/);
});

test('double-clicking a header button does not shade the window', async ({ page }) => {
  await openApp(page, 'resume');
  const w = win(page, 'resume');
  await w.locator('.window-header .button.maximize').dblclick();
  await expect(w).not.toHaveClass(/shaded/);
});
