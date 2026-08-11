import { test, expect } from './fixtures.js';
import { openApp, openViaMenu, win } from './helpers.js';

// Locks the library-seam contract added for the Iconostat FX feature (see
// docs/superpowers/specs/2026-08-11-iconostat-fx-design.md). No fx module is
// loaded anywhere in this suite, so these events are dispatched but
// unconsumed everywhere except the listeners these tests themselves attach --
// that's the whole point: the seams must be inert by default.

test('iconostat-before-minimize fires with entering:true, userGesture:true on a user minimize-button click', async ({ page }) => {
  await openApp(page, 'resume');

  const detailPromise = page.evaluate(() => new Promise((resolve) => {
    document.addEventListener('iconostat-before-minimize', (e) => resolve({
      name: e.detail.name,
      entering: e.detail.entering,
      userGesture: e.detail.userGesture,
      cancelable: e.cancelable,
      hasEl: e.detail.el === document.getElementById('window-resume'),
    }), { once: true });
  }));

  await win(page, 'resume').locator('.button.minimize').click();

  const detail = await detailPromise;
  expect(detail.name).toBe('resume');
  expect(detail.entering).toBe(true);
  expect(detail.userGesture).toBe(true);
  expect(detail.cancelable).toBe(true);
  expect(detail.hasEl).toBe(true);

  // And the minimize itself actually completed (seam didn't block it).
  await expect(win(page, 'resume')).toHaveClass(/minimized/);
});

test('preventDefault() on iconostat-before-minimize leaves the window un-minimized', async ({ page }) => {
  await openApp(page, 'resume');

  await page.evaluate(() => {
    document.addEventListener('iconostat-before-minimize', (e) => e.preventDefault(), { once: true });
  });

  await win(page, 'resume').locator('.button.minimize').click();

  // Canceled: no `minimized` class, still a direct child of <body>, and the
  // taskbar never received it.
  await expect(win(page, 'resume')).not.toHaveClass(/minimized/);
  await expect(page.locator('body > #window-resume')).toBeVisible();
  await expect(page.locator('#tasks #window-resume')).toHaveCount(0);
});

test('a programmatic un-minimize via bringToFront fires iconostat-before-minimize with userGesture:false', async ({ page }) => {
  await openApp(page, 'resume');
  await win(page, 'resume').locator('.button.minimize').click();
  await expect(win(page, 'resume')).toHaveClass(/minimized/);

  const detail = await page.evaluate(() => new Promise((resolve) => {
    document.addEventListener('iconostat-before-minimize', (e) => resolve({
      entering: e.detail.entering,
      userGesture: e.detail.userGesture,
    }), { once: true });
    const desktop = document.querySelector('iconostat-desktop');
    const el = document.getElementById('window-resume');
    desktop.bringToFront(el);
  }));

  expect(detail.entering).toBe(false);
  expect(detail.userGesture).toBe(false);
  await expect(win(page, 'resume')).not.toHaveClass(/minimized/);
});

test('iconostat-drag-start/-move/-end fire during a header drag', async ({ page }) => {
  await openApp(page, 'resume');
  const w = win(page, 'resume');
  const box = await w.locator('.window-header').boundingBox();
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

  const resultPromise = page.evaluate(() => new Promise((resolve) => {
    const result = { startCount: 0, moveCount: 0, endCount: 0, sawMoveLeftTop: false };
    document.addEventListener('iconostat-drag-start', () => { result.startCount++; });
    document.addEventListener('iconostat-drag-move', (e) => {
      result.moveCount++;
      if (typeof e.detail.left === 'number' && typeof e.detail.top === 'number') {
        result.sawMoveLeftTop = true;
      }
    });
    document.addEventListener('iconostat-drag-end', () => {
      result.endCount++;
      resolve(result);
    }, { once: true });
  }));

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 60, start.y + 40, { steps: 5 });
  await page.mouse.up();

  const result = await resultPromise;
  expect(result.startCount).toBe(1);
  expect(result.moveCount).toBeGreaterThan(0);
  expect(result.sawMoveLeftTop).toBe(true);
  expect(result.endCount).toBe(1);
});

test('desktop.fxSuppressed is true during a cascade() call', async ({ page }) => {
  await openApp(page); // welcome
  await openViaMenu(page, 'Resume'); // + resume
  await openViaMenu(page, 'Minimize All'); // both minimized, so cascade() un-minimizes them

  const result = await page.evaluate(() => {
    const desktop = document.querySelector('iconostat-desktop');
    let capturedDuring;
    const onBeforeMinimize = () => { capturedDuring = desktop.fxSuppressed; };
    document.addEventListener('iconostat-before-minimize', onBeforeMinimize, { once: true });

    const before = desktop.fxSuppressed;
    desktop.cascade();
    const after = desktop.fxSuppressed;

    document.removeEventListener('iconostat-before-minimize', onBeforeMinimize);
    return { before, capturedDuring, after };
  });

  expect(result.before).toBe(false);
  expect(result.capturedDuring).toBe(true);
  expect(result.after).toBe(false);
});
