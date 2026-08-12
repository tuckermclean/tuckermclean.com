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

test('a real chip click restores via exactly one userGesture:true before-minimize (no double-fire)', async ({ page }) => {
  await openApp(page, 'resume');
  await win(page, 'resume').locator('.button.minimize').click();
  await expect(win(page, 'resume')).toHaveClass(/minimized/);

  // Registered (and awaited-in) before the click, so it can't miss the
  // restore's before-event; every matching (entering:false) firing gets
  // recorded so a regression that double-fires (or reintroduces the
  // hardcoded userGesture:false on the mousedown->bringToFront path) shows
  // up as count !== 1 or userGesture !== true, not just "it restored".
  await page.evaluate(() => {
    window.__restoreEvents = [];
    document.addEventListener('iconostat-before-minimize', (e) => {
      if (e.detail.entering === false) {
        window.__restoreEvents.push({ userGesture: e.detail.userGesture });
      }
    });
  });

  // A real click = mousedown + mouseup + click, exercising the full
  // bringToFront(true)-owns-restore / _suppressMinimizedChipDefault path.
  await win(page, 'resume').click();
  await expect(win(page, 'resume')).not.toHaveClass(/minimized/);

  const restoreEvents = await page.evaluate(() => window.__restoreEvents);
  expect(restoreEvents.length).toBe(1);
  expect(restoreEvents[0].userGesture).toBe(true);
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

  // Stabilizes a pre-existing intermittent flake (task-F open item #4):
  // `page.evaluate()` and `page.mouse.*()` are independent CDP round trips
  // over the same connection. The old version fired `page.evaluate(...)`
  // WITHOUT awaiting it, then immediately issued `page.mouse.move/down`,
  // relying on the browser having already installed the listeners by the
  // time the mouse input arrived -- true almost always (evaluate is sent
  // first, in Node code order), but not GUARANTEED: `evaluate()` does
  // Node-side work (serializing the function, resolving the execution
  // context) before its command actually reaches the wire, while
  // `page.mouse.move()` has a shorter path -- under load, the mouse command
  // can overtake it, so the listeners aren't registered yet when
  // `iconostat-drag-start` fires, and the test hangs on an
  // `iconostat-drag-end` listener that was never attached either (it times
  // out rather than failing fast, which is exactly the "intermittent, hard
  // to pin down" flake signature). The fix: register the listeners (writing
  // to `window`, not resolving a page-side Promise) in an `evaluate()` call
  // that IS awaited -- guaranteeing registration has completed in the
  // browser -- before any mouse input is dispatched. Reading the result back
  // uses `expect.poll` (a deterministic, auto-retrying condition, not a
  // fixed `waitForTimeout`) instead of a page-side resolving Promise.
  await page.evaluate(() => {
    window.__dragResult = { startCount: 0, moveCount: 0, endCount: 0, sawMoveLeftTop: false };
    document.addEventListener('iconostat-drag-start', () => { window.__dragResult.startCount++; });
    document.addEventListener('iconostat-drag-move', (e) => {
      window.__dragResult.moveCount++;
      if (typeof e.detail.left === 'number' && typeof e.detail.top === 'number') {
        window.__dragResult.sawMoveLeftTop = true;
      }
    });
    document.addEventListener('iconostat-drag-end', () => { window.__dragResult.endCount++; });
  });

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 60, start.y + 40, { steps: 5 });
  await page.mouse.up();

  await expect.poll(() => page.evaluate(() => window.__dragResult.endCount)).toBe(1);
  const result = await page.evaluate(() => window.__dragResult);
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
