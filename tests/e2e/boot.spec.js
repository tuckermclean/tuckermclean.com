import { test, expect } from '@playwright/test';
import { openApp, openViaMenu, win } from './helpers.js';

test('cold boot opens the Welcome window and normalizes the URL to /', async ({ page }) => {
  await openApp(page);
  await expect(win(page, 'welcome')).toBeVisible();
  // loadHTML overwrites the title from the page fragment's .page-title span.
  await expect(win(page, 'welcome').locator('.window-title')).toHaveText('Welcome');
  await expect(page).toHaveURL('http://localhost:1313/');
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

test('back/forward recycles windows rather than duplicating them', async ({ page }) => {
  await openApp(page);                 // welcome
  await openViaMenu(page, 'Resume');   // resume
  await openViaMenu(page, 'Intro');    // intro
  await expect(page.locator('.window')).toHaveCount(3);

  // popstate's navigateToPage() recycles the *current top* window's DOM
  // element into the target name; if a window with that target name is
  // already open, navigateToPage closes it first. Here goBack's target
  // ("resume") already has its own window, so that window is closed and
  // the (until-now front) "intro" window is renamed to "resume" in place
  // — net window count drops from 3 to 2, it does not stay at 3. See
  // "Suspected bugs" in the design doc.
  await page.goBack();
  await expect(win(page, 'resume')).toHaveClass(/front/);
  await expect(page.locator('.window')).toHaveCount(2);

  // goForward's target ("intro") no longer has its own window (its DOM
  // element was just renamed to "resume" above), so this leg is a pure
  // rename with no closeWindow call — count stays at 2, not back to 3.
  await page.goForward();
  await expect(win(page, 'intro')).toHaveClass(/front/);
  await expect(page.locator('.window')).toHaveCount(2);
});
