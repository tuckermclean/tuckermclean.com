import { test, expect } from './fixtures.js';
import { openApp, openViaMenu, win } from './helpers.js';

// Iconostat FX -- context-loss integration (task-F-brief.md Part 2 #3).
// Individual per-effect context-loss coverage already exists (a single
// window mid-genie-minimize in fx-tier2-genie.spec.js, a single window
// mid-wobble-drag in fx-tier2-wobble.spec.js). This file's job is the
// INTEGRATION scenario the brief specifically calls out: MULTIPLE windows
// (genie AND wobble) in flight at once, a simulated `webglcontextlost`,
// asserting ALL of them end up visible/correct (not just the one under
// test) and that a SUBSEQUENT gesture afterward still works (the session
// isn't poisoned by the context loss).

function forceFxTier(page, tier) {
  return page.addInitScript((t) => {
    window.localStorage.setItem('iconostat-fx-tier', t);
  }, tier);
}

const noFxGhostOrHiddenCanvas = async (page) => {
  expect(await page.locator('.fx-ghost').count()).toBe(0);
  const canvasCount = await page.locator('canvas#iconostat-fx-canvas').count();
  if (canvasCount > 0) {
    await expect(page.locator('canvas#iconostat-fx-canvas')).toBeHidden();
  }
};

test.describe('Context-loss integration (forced Tier 2, no-preference)', () => {
  test.use({ reducedMotion: 'no-preference' });
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
  });

  test('webglcontextlost mid-genie-minimize AND mid-wobble-drag (two windows at once): both end visible/correct, canvas hidden, and a subsequent gesture on each still works', async ({ page }) => {
    await forceFxTier(page, '2');
    await openApp(page, 'resume');
    await openViaMenu(page, 'Intro'); // a second window, dragged/wobbled below
    const minimizing = win(page, 'resume');
    const dragging = win(page, 'intro');

    // Window A: start a genie minimize (async beginEffect snapshot, then a
    // 400ms desktop tween) -- leave it in flight.
    await minimizing.locator('.button.minimize').click();
    await expect(minimizing).not.toHaveClass(/minimized/); // in flight, fx-ghosted

    // Window B: start a wobble drag (mouse held down) at the same time --
    // two DIFFERENT effect kinds genuinely concurrent, both feeding the ONE
    // shared canvas (per the spec's "one shared canvas, not per-window"
    // decision) -- this is the integration case a single-window test can't
    // exercise.
    const box = await dragging.locator('.window-header').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 90, box.y + box.height / 2 + 60, { steps: 8 });
    await expect(dragging).toHaveClass(/fx-ghost/, { timeout: 2000 });

    // Simulate context loss (WEBGL_lose_context) -- compositor.js's own
    // `webglcontextlost` listener calls `FxController.cancelAll(true)`,
    // which must reach EVERY currently-registered effect, not just one.
    // Loses AND restores the context (a realistic pairing -- a real context
    // loss, e.g. a GPU driver reset or a mobile tab backgrounding/
    // foregrounding, is normally followed by a genuine restore event) so
    // this test ALSO exercises the open-item #2 fix (compositor.js's
    // `onContextRestored()` guard: `ensureCanvas()` wrapped in try/catch so
    // a failed re-init can't surface as an uncaught error on the browser's
    // own restore callback) on top of the context-LOSS path the sibling
    // single-window tests already cover.
    const lost = await page.evaluate(async () => {
      const canvas = document.getElementById('iconostat-fx-canvas');
      if (!canvas) return { hasCanvas: false };
      const gl = canvas.getContext('webgl2');
      const ext = gl && gl.getExtension('WEBGL_lose_context');
      if (!ext) return { hasCanvas: true, hasExt: false };
      const restoredPromise = new Promise((resolve) => {
        canvas.addEventListener('webglcontextrestored', () => resolve(true), { once: true });
      });
      ext.loseContext();
      await new Promise((resolve) => setTimeout(resolve, 100));
      ext.restoreContext();
      const restored = await Promise.race([restoredPromise, new Promise((resolve) => setTimeout(() => resolve(false), 2000))]);
      return { hasCanvas: true, hasExt: true, restored };
    });
    expect(lost.hasCanvas).toBe(true);
    // Sandbox-honesty note (matches fx-tier2.spec.js's established caveat):
    // WEBGL_lose_context isn't guaranteed to be implemented/exposed by
    // every WebGL2 driver stack -- if this specific sandbox's GL doesn't
    // expose it, skip rather than fake a pass; the single-window versions
    // of this test (fx-tier2-genie.spec.js/fx-tier2-wobble.spec.js) already
    // establish whether it's available here at all.
    if (!lost.hasExt) test.skip();

    await page.mouse.up(); // release the now-irrelevant held-down button

    // Hard invariant: ALL windows visible in correct end state, none
    // stranded fx-ghosted, regardless of which effect kind they were
    // running.
    await expect(minimizing).toBeVisible({ timeout: 2000 });
    await expect(minimizing).not.toHaveClass(/fx-ghost/);
    await expect(dragging).toBeVisible({ timeout: 2000 });
    await expect(dragging).not.toHaveClass(/fx-ghost/);
    await noFxGhostOrHiddenCanvas(page);

    // Not poisoned: a subsequent gesture on EACH window still works
    // end-to-end (proves the session's tier/registry/compositor state is
    // still usable after a context-loss event, not just that the loss
    // itself didn't crash anything).
    //
    // Which end state the cancelled minimize landed in depends on exactly
    // when context-loss raced in relative to genie's own commit (see
    // genie.js's `committed`-gated cancelFn: "finish the op now" only if it
    // hadn't already committed) -- either is a valid, correct outcome for a
    // mid-flight cancellation, so branch on whichever it actually is rather
    // than assuming one.
    const wasMinimized = await minimizing.evaluate((el) => el.classList.contains('minimized'));
    if (wasMinimized) {
      await minimizing.click(); // real chip click -- restore
      await expect(minimizing).not.toHaveClass(/minimized/, { timeout: 2000 });
    } else {
      await minimizing.locator('.button.minimize').click();
      await expect(minimizing).toHaveClass(/minimized/, { timeout: 2000 });
    }
    await expect(minimizing).toBeVisible();
    await expect(minimizing).not.toHaveClass(/fx-ghost/);

    await dragging.locator('.button.maximize').click();
    await expect(dragging).toHaveClass(/maximized/, { timeout: 2000 });
    await expect(dragging).toBeVisible();
    await expect(dragging).not.toHaveClass(/fx-ghost/);

    await noFxGhostOrHiddenCanvas(page);
  });
});
