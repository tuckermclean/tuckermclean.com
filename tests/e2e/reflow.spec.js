import { test, expect } from './fixtures.js';
import { openApp, openViaMenu, win } from './helpers.js';

test('resizing the viewport re-cascades non-minimized windows', async ({ page }) => {
  await openApp(page);                 // welcome
  await openViaMenu(page, 'Resume');   // + resume

  await page.setViewportSize({ width: 1024, height: 768 }); // triggers debounced cascade (300ms)

  // Poll past the debounce: both windows are laid out, direct children of body.
  await expect.poll(async () =>
    win(page, 'resume').evaluate(el => !el.classList.contains('minimized') && el.parentElement === document.body)
  , { timeout: 3000 }).toBe(true);
  await expect(page.locator('body > #window-welcome')).toBeVisible();
  await expect(page.locator('body > #window-resume')).toBeVisible();
});

test('a viewport resize does not un-minimize a minimized window', async ({ page }) => {
  await openApp(page, 'resume');
  await win(page, 'resume').locator('.button.minimize').click();
  await expect(win(page, 'resume')).toHaveClass(/minimized/);
  await page.setViewportSize({ width: 1000, height: 800 });   // fires the reflow cascade
  await page.waitForTimeout(400);                              // past the 300ms debounce
  await expect(win(page, 'resume')).toHaveClass(/minimized/);  // still minimized after reflow
});
