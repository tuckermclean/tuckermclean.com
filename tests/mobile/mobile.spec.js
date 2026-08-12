import { test, expect } from '../e2e/fixtures.js';
import { openApp, openViaMenu, win } from '../e2e/helpers.js';

test('an opened window fits within the mobile viewport', async ({ page }) => {
  await openApp(page, 'resume');
  const box = await win(page, 'resume').boundingBox();
  expect(box.width).toBeLessThanOrEqual(390);
});

test('tapping a rear window brings it to front', async ({ page }) => {
  await openApp(page);                 // welcome
  await openViaMenu(page, 'Resume');   // resume front
  await expect(win(page, 'resume')).toHaveClass(/front/);
  // Welcome's top-left header corner is exposed (smaller cascade offset).
  await win(page, 'welcome').locator('.window-header').tap({ position: { x: 5, y: 5 } });
  await expect(win(page, 'welcome')).toHaveClass(/front/);
});

test('tapping a minimized window restores it', async ({ page }) => {
  await openApp(page, 'resume');
  await win(page, 'resume').locator('.button.minimize').tap();
  await expect(win(page, 'resume')).toHaveClass(/minimized/);

  // A touch tap dispatches touchstart (twice-listened: bringToFront(true),
  // then the guarded preventDefault) followed by (if not suppressed) a
  // synthetic click -- exactly the double-fire risk defect 1's fix targets.
  // Count every restore before-event the tap actually produces.
  await page.evaluate(() => {
    window.__restoreEvents = [];
    document.addEventListener('iconostat-before-minimize', (e) => {
      if (e.detail.entering === false) {
        window.__restoreEvents.push({ userGesture: e.detail.userGesture });
      }
    });
  });

  await page.locator('#tasks #window-resume').tap();
  await expect(win(page, 'resume')).not.toHaveClass(/minimized/);
  await expect(win(page, 'resume')).toHaveClass(/front/);

  const restoreEvents = await page.evaluate(() => window.__restoreEvents);
  expect(restoreEvents.length).toBe(1);
  expect(restoreEvents[0].userGesture).toBe(true);
});

test.describe('Tier 1 (forced, no-preference) touch chip-tap restore', () => {
  test.use({ reducedMotion: 'no-preference' });
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.addInitScript(() => window.localStorage.setItem('iconostat-fx-tier', '1'));
  });

  test('a touch tap restores via exactly one userGesture:true before-minimize and completes cleanly', async ({ page }) => {
    await openApp(page, 'resume');
    await win(page, 'resume').locator('.button.minimize').tap();
    await expect(win(page, 'resume')).toHaveClass(/minimized/, { timeout: 2000 });

    await page.evaluate(() => {
      window.__restoreEvents = [];
      document.addEventListener('iconostat-before-minimize', (e) => {
        if (e.detail.entering === false) {
          window.__restoreEvents.push({ userGesture: e.detail.userGesture });
        }
      });
    });

    await page.locator('#tasks #window-resume').tap();
    await expect(win(page, 'resume')).not.toHaveClass(/minimized/, { timeout: 2000 });
    await expect(win(page, 'resume')).toBeVisible();
    const style = await win(page, 'resume').evaluate((el) => ({ transform: el.style.transform, opacity: el.style.opacity }));
    expect(style.transform).toBe('');
    expect(style.opacity).toBe('');

    const restoreEvents = await page.evaluate(() => window.__restoreEvents);
    expect(restoreEvents.length).toBe(1);
    expect(restoreEvents[0].userGesture).toBe(true);
  });
});

test('the start menu opens and closes via tap', async ({ page }) => {
  await openApp(page);
  await page.locator('#start-button').tap();
  await expect(page.locator('#menu')).toHaveClass(/active/);
  await page.locator('#menu .menu-item', { hasText: 'Toggle Mode' }).tap();
  await expect(page.locator('#menu')).not.toHaveClass(/active/);
});

test('touch-dragging the header moves the window (best-effort)', async ({ page }) => {
  await openApp(page, 'resume');
  const w = win(page, 'resume');
  const before = await w.evaluate(el => ({ left: el.offsetLeft, top: el.offsetTop }));
  const box = await w.locator('.window-header').boundingBox();
  // Synthetic touch drag: startDrag reads e.touches[0]. Dispatch a coherent
  // touchstart -> touchmove -> touchend sequence on the header element.
  await w.locator('.window-header').evaluate((header, box) => {
    const mk = (type, x, y) => {
      const t = new Touch({ identifier: 1, target: header, clientX: x, clientY: y });
      return new TouchEvent(type, { touches: type === 'touchend' ? [] : [t], targetTouches: type === 'touchend' ? [] : [t], changedTouches: [t], bubbles: true, cancelable: true });
    };
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    header.dispatchEvent(mk('touchstart', cx, cy));
    document.dispatchEvent(mk('touchmove', cx + 80, cy + 70));
    document.dispatchEvent(mk('touchend', cx + 80, cy + 70));
  }, box);
  const after = await w.evaluate(el => ({ left: el.offsetLeft, top: el.offsetTop }));
  expect(after.left).not.toBe(before.left);
});

// Iconostat FX -- Tier-2 (genie + wobble) exercised on the REAL mobile
// project (Pixel 7 emulation, 390x844, hasTouch/isMobile -- see
// playwright.config.js), not just a desktop-Chrome viewport resize (which
// is what fx-tier2-genie.spec.js's "mobile viewport" test already covers).
// task-F-brief.md Part 2 #4: confirm genie's 320ms mobile duration, wobble's
// 4x4 grid + 1.5 DPR cap, and that impact wobble stays skipped on mobile.
test.describe('Tier 2 (forced, no-preference) -- mobile', () => {
  test.use({ reducedMotion: 'no-preference' });
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.addInitScript(() => window.localStorage.setItem('iconostat-fx-tier', '2'));
  });

  test('genie minimize on a real mobile (touch) viewport engages the 320ms path and ends correct', async ({ page }) => {
    // openApp() already waits out the 980->device-width emulation load-
    // resize's debounced reflow cascade (see helpers.js) before returning --
    // this test starting its gesture immediately after is itself the
    // "the reflow doesn't interact badly with fx" confirmation: if the
    // cascade were still pending, it would jump-cut this genie minimize
    // (bulk ops never animate) and `not toHaveClass(/minimized/)` right
    // after tap would never observably flip, or the end state below would
    // be wrong.
    await openApp(page, 'resume');
    const w = win(page, 'resume');

    await w.locator('.button.minimize').tap();
    await expect(w).not.toHaveClass(/minimized/); // non-instant -- Tier 2 engaged, not a Tier-0 synchronous jump
    await expect(w).toHaveClass(/minimized/, { timeout: 2000 });
    await expect(page.locator('#tasks #window-resume')).toHaveCount(1);
    await expect(w).toBeVisible();
    await expect(w).not.toHaveClass(/fx-ghost/);
    const canvasCount = await page.locator('canvas#iconostat-fx-canvas').count();
    if (canvasCount > 0) await expect(page.locator('canvas#iconostat-fx-canvas')).toBeHidden();
  });

  test('wobble drag on a real mobile (touch) viewport uses the 4x4 grid + <=1.5 DPR cap, settles cleanly', async ({ page }) => {
    await openApp(page, 'resume');
    const w = win(page, 'resume');

    // Structural proof of the spec's mobile tuning (gridDims()/computeDprCap()
    // are pure functions of window.innerWidth/devicePixelRatio -- see
    // wobble.js/snapshot.js), independent of the drag/GL round trip below.
    const gridInfo = await page.evaluate(async () => {
      const wobble = await import('/iconostat/fx/wobble.js');
      const { computeDprCap } = await import('/iconostat/fx/snapshot.js');
      return { grid: wobble.gridDims(), dprCap: computeDprCap(), mobile: wobble.mobileViewport() };
    });
    expect(gridInfo.mobile).toBe(true);
    expect(gridInfo.grid).toEqual({ cols: 4, rows: 4 });
    expect(gridInfo.dprCap).toBeLessThanOrEqual(1.5);

    // Dispatch touchstart, then WAIT for wobble's own `dragStart` to
    // actually take ownership (`fx-ghost` appears -- its `beginEffect()`
    // snapshot is a real async round trip) before touchmove/touchend --
    // mirrors the desktop suite's `dragBy` helper, which gets this same
    // ordering for free from real, separately-dispatched
    // `page.mouse.move()`/`down()` calls. Firing all three touch events
    // synchronously back-to-back (no yield in between) races `dragMove`/
    // `dragEnd` ahead of `dragStart`'s still-pending `beginEffect` -- both
    // tolerate that individually (`if (!state) return`, per the C/D
    // contract), but if ALL of touchmove AND touchend land before `dragStart`
    // ever creates its state, the state `dragStart` creates once its own
    // snapshot finally resolves is never told the gesture already ended:
    // `dragEnd`'s `phase = 'settling'` transition never happens, so the mesh
    // stays parked in `'dragging'` (pinned) forever -- fx-ghost never
    // clears. A real user's touch drag has the same underlying
    // possibility for a very fast flick, but Playwright's synthetic
    // same-tick dispatch makes it far more likely; wait it out explicitly
    // here so this test exercises wobble's SETTLE path, not this separate,
    // narrower timing edge (noted as a residual finding in task-F-report.md).
    const box = await w.locator('.window-header').boundingBox();
    await page.evaluate((box) => {
      const header = document.querySelector('#window-resume .window-header');
      const t = new Touch({ identifier: 1, target: header, clientX: box.x + box.width / 2, clientY: box.y + box.height / 2 });
      header.dispatchEvent(new TouchEvent('touchstart', { touches: [t], targetTouches: [t], changedTouches: [t], bubbles: true, cancelable: true }));
    }, box);
    await expect(w).toHaveClass(/fx-ghost/, { timeout: 2000 });
    await page.evaluate((box) => {
      const mk = (type, x, y) => {
        const t = new Touch({ identifier: 1, target: document.body, clientX: x, clientY: y });
        return new TouchEvent(type, { touches: type === 'touchend' ? [] : [t], targetTouches: type === 'touchend' ? [] : [t], changedTouches: [t], bubbles: true, cancelable: true });
      };
      const cx = box.x + box.width / 2 + 60, cy = box.y + box.height / 2 + 40;
      document.dispatchEvent(mk('touchmove', cx, cy));
      document.dispatchEvent(mk('touchend', cx, cy));
    }, box);

    // The Tier-2 swap protocol actually engaged (proves this exercised the
    // real WebGL mesh path, not a Tier-1/Tier-0 fallback) and settles clean.
    await expect(w).not.toHaveClass(/fx-ghost/, { timeout: 3000 });
    await expect(w).toBeVisible();
    const canvasCount = await page.locator('canvas#iconostat-fx-canvas').count();
    if (canvasCount > 0) await expect(page.locator('canvas#iconostat-fx-canvas')).toBeHidden();
  });

  test('impact wobble stays skipped on mobile after a maximize (even with the warm-load fix priming the compositor)', async ({ page }) => {
    await openApp(page, 'resume');
    const w = win(page, 'resume');

    await page.evaluate(() => {
      window.__fxEffects = [];
      document.addEventListener('iconostat-fx-done', (e) => window.__fxEffects.push(e.detail.effect));
    });

    await w.locator('.button.maximize').tap();
    await expect(w).toHaveClass(/maximized/, { timeout: 2000 });

    // Generous margin past both genie's own completion and wobble.js's
    // warm-load import + `primeCompositor()` call (task-F open item #1) --
    // `runImpactWobble`'s own `if (mobileViewport()) return;` guard (wobble.js)
    // must keep this a no-op on mobile regardless of the compositor now
    // being primed without a prior drag.
    await page.waitForTimeout(600);

    const effects = await page.evaluate(() => window.__fxEffects);
    expect(effects).not.toContain('wobble');
    await expect(w).toBeVisible();
    await expect(w).not.toHaveClass(/fx-ghost/);
  });
});

test('iconostat-drag-start/-move/-end fire on the touch drag path too', async ({ page }) => {
  await openApp(page, 'resume');
  const w = win(page, 'resume');
  const box = await w.locator('.window-header').boundingBox();

  const result = await w.locator('.window-header').evaluate((header, box) => new Promise((resolve) => {
    const counts = { start: 0, move: 0, end: 0 };
    document.addEventListener('iconostat-drag-start', () => { counts.start++; });
    document.addEventListener('iconostat-drag-move', () => { counts.move++; });
    document.addEventListener('iconostat-drag-end', () => { counts.end++; resolve(counts); }, { once: true });

    const mk = (type, x, y) => {
      const t = new Touch({ identifier: 1, target: header, clientX: x, clientY: y });
      return new TouchEvent(type, { touches: type === 'touchend' ? [] : [t], targetTouches: type === 'touchend' ? [] : [t], changedTouches: [t], bubbles: true, cancelable: true });
    };
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    header.dispatchEvent(mk('touchstart', cx, cy));
    document.dispatchEvent(mk('touchmove', cx + 50, cy + 30));
    document.dispatchEvent(mk('touchend', cx + 50, cy + 30));
  }), box);

  expect(result.start).toBe(1);
  expect(result.move).toBeGreaterThan(0);
  expect(result.end).toBe(1);
});
