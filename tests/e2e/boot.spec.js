import { test, expect } from './fixtures.js';
import { openApp, openViaMenu, win } from './helpers.js';

test('cold boot opens the Welcome window and normalizes the URL to /', async ({ page }) => {
  await openApp(page);
  await expect(win(page, 'welcome')).toBeVisible();
  // loadHTML overwrites the title from the page fragment's .page-title span.
  await expect(win(page, 'welcome').locator('.window-title')).toHaveText('Welcome');
  await expect(page).toHaveURL('http://localhost:1313/');
});

test('both background images are preloaded to avoid a mode-toggle flash', async ({ page }) => {
  await openApp(page);
  await expect(page.locator('link[rel="preload"][as="image"][href*="I-Know-Better-1"]')).toHaveCount(1);
  await expect(page.locator('link[rel="preload"][as="image"][href*="I-Know-Better-2"]')).toHaveCount(1);
});

test('deep-link #/resume opens the Resume window with loaded content', async ({ page }) => {
  await openApp(page, 'resume');
  await expect(win(page, 'resume')).toBeVisible();
  await expect(win(page, 'resume').locator('.window-title')).toHaveText('Resume');
  await expect(win(page, 'resume').locator('.window-icon')).toHaveText('📜');
  // Content fragment loaded (resume body has a Summary heading).
  await expect(win(page, 'resume').locator('.window-body')).toContainText('Summary');
});

test('deep-link to an arbitrary slug opens a title-cased window', async ({ page }) => {
  // The fragment fetch 404s (no such page); loadHTML logs the error and the
  // window keeps its slug-derived title. This locks the current title-casing.
  await openApp(page, 'made-up-page');
  await expect(win(page, 'made-up-page')).toBeVisible();
  await expect(win(page, 'made-up-page').locator('.window-title')).toHaveText('Made up page');
});

test('browser Back/Forward navigate between opened windows', async ({ page }) => {
  await openApp(page); // welcome, URL /
  await openViaMenu(page, 'Resume'); // resume, URL #/resume
  await expect(page).toHaveURL(/#\/resume$/);
  await openViaMenu(page, 'Intro'); // intro, URL #/intro
  await expect(page).toHaveURL(/#\/intro$/);

  await page.goBack();
  await expect(page).toHaveURL(/#\/resume$/);
  await expect(win(page, 'resume')).toHaveClass(/front/);

  await page.goForward();
  await expect(page).toHaveURL(/#\/intro$/);
  await expect(win(page, 'intro')).toHaveClass(/front/);
});

test('back/forward navigates between open windows without dropping any', async ({ page }) => {
  await openApp(page);                 // welcome
  await openViaMenu(page, 'Resume');   // resume
  await openViaMenu(page, 'Intro');    // intro
  await expect(page.locator('.window')).toHaveCount(3);

  // popstate's navigateToPage() now brings an already-open target window to
  // the front instead of closing it and renaming the current top window into
  // its place. Here goBack's target ("resume") already has its own window,
  // so that window is simply brought to front — the window count stays at 3,
  // it does not drop to 2.
  await page.goBack();
  await expect(win(page, 'resume')).toHaveClass(/front/);
  await expect(page.locator('.window')).toHaveCount(3);    // no window dropped (was 2 — the bug)

  // goForward's target ("intro") still has its own window too, so this leg
  // is also a pure bring-to-front — count stays at 3.
  await page.goForward();
  await expect(win(page, 'intro')).toHaveClass(/front/);
  await expect(page.locator('.window')).toHaveCount(3);
});

test('a resize->cascade does not corrupt back/forward history', async ({ page }) => {
  await openApp(page);                 // welcome, url '/'
  await openViaMenu(page, 'Resume');   // #/resume
  await openViaMenu(page, 'Intro');    // #/intro  (3 windows)
  await expect(page.locator('.window')).toHaveCount(3);

  await page.goBack();
  await expect(win(page, 'resume')).toHaveClass(/front/);

  // Fire a resize, then navigate forward just before the 300ms debounce
  // fires. This interleaves the debounced cascade() with the still-settling
  // goForward navigation: cascade()'s per-window bringToFront() pushes
  // extra 'iconostat-focused' history entries (see desktop.js) on top of
  // the real navigation, so goForward's popstate handler resolves against
  // a polluted history stack. A cascade/tile bulk-layout op must never
  // touch browser history -- this reliably reproduces the corruption
  // against the un-fixed library (front lands on 'resume' instead of
  // 'intro') and must be stable once cascade/tile are history-suppressed.
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await page.waitForTimeout(295);
  await page.goForward();
  await page.waitForTimeout(200); // let the debounced cascade fully settle

  await expect(win(page, 'intro')).toHaveClass(/front/);
});

test('a freshly opened window is revealed (visible, positioned, no leftover building class)', async ({ page }) => {
  await openApp(page);
  await openViaMenu(page, 'Resume');
  const w = win(page, 'resume');
  await expect(w).toBeVisible();
  await expect(w).not.toHaveClass(/building/);
  const box = await w.boundingBox();
  expect(box.width).toBeGreaterThan(0);
  expect(box.height).toBeGreaterThan(0);
});

test('the loading spinner shows on content-loading events and hides when balanced', async ({ page }) => {
  await openApp(page);
  const spinner = page.locator('.iconostat-spinner');
  await expect(spinner).toHaveCount(1);
  await expect(spinner).not.toHaveClass(/active/);
  // two concurrent loads share one indicator
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('iconostat-content-loading')));
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('iconostat-content-loading')));
  await expect(spinner).toHaveClass(/active/);
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('iconostat-content-loaded')));
  await expect(spinner).toHaveClass(/active/);   // still one load in flight
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('iconostat-content-loaded')));
  await expect(spinner).not.toHaveClass(/active/); // count back to 0
});
