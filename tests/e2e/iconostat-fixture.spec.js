import { test, expect } from './fixtures.js';

// IconostatWindow's `name` property setter (assets/iconostat/window.js) only
// derives `id="window-<name>"` -- it does not reflect `name` as an HTML
// attribute -- so windows must be located by that id, not by a `[name=...]`
// attribute selector (and not by DOM parent: createWindow() appends windows
// to document.body, not into <iconostat-desktop>, by design).
const FIXTURE_WINDOW = 'iconostat-window#window-fixture';

test('library boots and opens a window with no site glue', async ({ page }) => {
  await page.goto('/iconostat-fixture/');
  const win = page.locator(FIXTURE_WINDOW);
  await expect(win).toBeVisible();
  await expect(win).toHaveClass(/front/);
  await expect(page.locator('#fixture-body')).toHaveText('standalone');
  // prove no site globals leaked into this page
  expect(await page.evaluate(() => typeof window.openPage)).toBe('undefined');
});

test('window drags in the standalone fixture', async ({ page }) => {
  await page.goto('/iconostat-fixture/');
  const win = page.locator(FIXTURE_WINDOW);
  const header = win.locator('.window-header');
  const before = await win.boundingBox();
  const headerBox = await header.boundingBox();
  // Grab mid-header (as tests/e2e/dragresize.spec.js does) and move relative
  // to that point -- the header spans most of the window's width, so it sits
  // well to the right of the window's own top-left corner (`before.x`), and
  // computing the move target from `before.x` (instead of the point the
  // mouse actually grabbed) would fling the window in the wrong direction.
  const start = { x: headerBox.x + headerBox.width / 2, y: headerBox.y + headerBox.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 120, start.y + 80, { steps: 10 });
  await page.mouse.up();
  const after = await win.boundingBox();
  expect(after.x).toBeGreaterThan(before.x);
});

test('minimize relocates the window into the taskbar with no site glue', async ({ page }) => {
  await page.goto('/iconostat-fixture/');
  const win = page.locator(FIXTURE_WINDOW);
  await expect(win).toBeVisible();
  await page.evaluate(() => document.querySelector('iconostat-window').minimize());
  await expect(page.locator('iconostat-taskbar #window-fixture')).toHaveCount(1);
  expect(await page.evaluate(() => typeof window.openPage)).toBe('undefined');
});
