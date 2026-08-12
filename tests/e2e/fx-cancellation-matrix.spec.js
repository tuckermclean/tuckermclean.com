import { test, expect } from './fixtures.js';
import { openApp, openViaMenu, win } from './helpers.js';

// Iconostat FX -- the cancellation matrix (task-F-brief.md Part 2 #1): for
// each effect (genie minimize/restore/maximize, Tier-2 wobble drag, and the
// Tier-1 WAAPI equivalents) x each cancel trigger (resize, cascade(),
// tile(), close(), a second/opposite gesture on the same window, and
// context-loss), assert the post-condition is the EXACT non-fx end state:
// no stranded `fx-ghost`/`visibility:hidden`, the shared canvas ends
// `display:none`, and the effect registry (`FxController._inFlight`) is
// left empty (a fresh, unrelated gesture right afterward still engages
// cleanly).
//
// -- Two DIFFERENT cancellation regimes (read before extending this file) --
// This suite deliberately does NOT assert "instant jump-cut" uniformly --
// that would be WRONG for several cells, empirically verified below. There
// are two genuinely different mechanisms in play:
//
//   1. INSTANT jump-cut: `resize`/`orientationchange` (an unconditional
//      `window.addEventListener` in controller.js -- cancels EVERY in-flight
//      effect immediately, regardless of kind) and a second/opposite gesture
//      on the same window (`registerEffect`'s synchronous cancel-on-register
//      -- tier/kind-independent). Also: Tier-2 genie-MINIMIZE (only) x
//      cascade()/tile(), because minimize is the one gesture whose
//      `minimized` class is set for the effect's ENTIRE duration (committed
//      right after `beginEffect` resolves, per genie.js) -- cascade()/tile()
//      both check `classList.contains('minimized')` per window and, if true,
//      call `windowElement.minimize(false, {userGesture:false})`, which
//      dispatches `iconostat-before-minimize` with `userGesture:false` --
//      controller.js's `_onBeforeMinMax` treats ANY programmatic before-event
//      as "a bulk op just started" and calls `cancelAll(true)` for
//      everything in flight, not just that one window. Also: Tier-1
//      minimize/restore/maximize (NOT wobble, see below) x cascade()/tile(),
//      because tier1.js's `watchForInterference` `MutationObserver`
//      (watching `el`'s own class/style attributes) catches cascade()'s/
//      tile()'s direct `reset()`/style writes and abandons in favor of
//      whatever state they already set -- see tier1.js's file-banner
//      comment. Tier-1 WOBBLE specifically has NO `watchForInterference`
//      watcher at all (only the minimize/restore/maximize transitions use
//      it, per tier1.js -- wobble's `dragStart`/`dragMove`/`dragEnd` don't)
//      -- cascade()/tile() mid-drag falls into regime 2 below instead,
//      bounded by wobble's own ~220ms settle-back-to-identity animation on
//      `dragEnd` (fired by releasing the mouse button) rather than being
//      instantly abandoned.
//
//   2. BOUNDED SELF-HEAL (not instant, no explicit cancellation hook, but
//      NEVER strands): Tier-2 genie-RESTORE/genie-MAXIMIZE/wobble-DRAG x
//      cascade()/tile(), and Tier-1 WOBBLE-DRAG x cascade()/tile() (see
//      above). Genie's restore commits `minimize(false)` (i.e.
//      `minimized` is already FALSE) before its own animation even starts,
//      and maximize's `maximized` class isn't checked by cascade()/tile() at
//      all (they only special-case `minimized`) -- so neither gesture has
//      any `iconostat-before-*` event to hook for cascade()/tile(), and
//      Tier 2 (genie.js/wobble.js) has NO MutationObserver-based interference
//      watcher (that mechanism exists ONLY in tier1.js, per its own explicit
//      comment: "each Tier-1 effect... this is strictly more correct" --
//      never extended to Tier 2). cascade()/tile() DO still directly reset
//      the real element's class/style underneath the (still fx-ghosted,
//      hence invisible) window -- but the in-flight rAF tween/sim, unaware,
//      keeps rendering the shared canvas for the REST of its own BOUNDED
//      duration (genie: <=150ms maximize; wobble: bounded by its own
//      SETTLE_MAX_DURATION_MS/kinetic settle) before naturally completing,
//      calling `endEffect`, and revealing `el` in whatever state
//      cascade()/tile() already put it in. Verified empirically in this
//      file's development (a lone, non-minimized window mid-genie-maximize,
//      hit by `cascade()`: `fx-ghost` and the canvas stay present for a
//      window strictly bounded by genie's own remaining tween duration --
//      never longer, never stranded, registry always ends empty). This is a
//      real, minor gap against the spec's "bulk ops never animate" ground
//      rule (the canvas visibly keeps compositing for up to that bounded
//      window after a bulk op begins) -- but it is NOT a hard-invariant
//      violation (finally-guaranteed-reveal and canvas-idle-hidden both
//      still hold, deterministically, within a bounded time) and does NOT
//      corrupt the registry or strand anything permanently. Flagged as a
//      residual, non-blocking known-limitation in task-F-report.md rather
//      than silently patched here (extending genie.js/wobble.js with their
//      own MutationObserver watcher is a real fix, but a materially bigger
//      change than this task's "small, targeted open-item fixes" scope --
//      see task-F-brief.md's file-boundary rule).
//
//   3. `close()` (closing the SAME window that's mid-effect) is ALWAYS
//      bounded self-heal, at BOTH tiers, for EVERY effect kind: `close()`
//      only ever dispatches `iconostat-close` (no before-event at all) and
//      the site-level listener (assets/js/window.js) removes `el` from the
//      DOM outright -- neither controller.js's before-event listeners nor
//      tier1.js's attribute-mutation `MutationObserver` can observe a
//      childList removal on `el`'s PARENT as a mutation ON `el` itself. Both
//      tiers' effects hold no live DOM-dependent state that removal would
//      corrupt (genie/wobble only read `el` for classList/style writes at
//      completion, all harmless no-ops on a detached node; tier1 the same),
//      so this always resolves safely, just not instantly.
//
// Every cell below is written against ONE of these two regimes, chosen by
// what's architecturally true, not by wishful thinking -- earlier drafts of
// this file asserted instant jump-cut for cells that are actually
// self-healing, and failed; keep that discipline when extending it.

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

const inFlightNames = (page) => page.evaluate(async () => {
  const { FxController } = await import('/iconostat/fx/controller.js');
  return Array.from(FxController._inFlight.values()).map((h) => h.name);
});

/** Click a header button and busy-poll (same JS realm, no CDP round trip --
 * see this file's development notes) until `el` is fx-ghosted, so callers
 * can fire a cancel trigger in the SAME synchronous turn as observing
 * "still in flight" -- eliminates any Node-side round-trip race between
 * "confirm mid-flight" and "trigger the cancellation". */
async function clickAndWaitGhosted(page, name, selector) {
  return page.evaluate(({ name, selector }) => new Promise((resolve) => {
    const el = document.getElementById(`window-${name}`);
    el.querySelector(selector).click();
    (async () => {
      const deadline = performance.now() + 5000;
      while (!el.classList.contains('fx-ghost') && performance.now() < deadline) {
        await new Promise((r) => setTimeout(r, 1));
      }
      resolve(el.classList.contains('fx-ghost'));
    })();
  }), { name, selector });
}

async function dragByAndHold(page, w, dx, dy, steps = 8) {
  const box = await w.locator('.window-header').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps });
}

test.describe('Cancellation matrix -- Tier 2 (forced, no-preference)', () => {
  test.use({ reducedMotion: 'no-preference' });
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
  });

  // -- genie-minimize: cascade()/tile() ARE instant here (regime 1) --------

  test('genie-minimize x cascade(): instant jump-cut to un-minimized/reset', async ({ page }) => {
    await forceFxTier(page, '2');
    await openApp(page, 'resume');
    const w = win(page, 'resume');

    const ghosted = await clickAndWaitGhosted(page, 'resume', '.button.minimize');
    expect(ghosted).toBe(true);

    await page.evaluate(() => document.querySelector('iconostat-desktop').cascade());

    // Instant: no waiting needed -- cascade()'s own synchronous call stack
    // already ran cancelAll(true) by the time evaluate() returns.
    await expect(w).not.toHaveClass(/minimized/);
    await expect(w).not.toHaveClass(/fx-ghost/);
    await expect(w).toBeVisible();
    await expect(page.locator('body > #window-resume')).toHaveCount(1);
    await noFxGhostOrHiddenCanvas(page);
    expect(await inFlightNames(page)).toEqual([]);
  });

  test('genie-minimize x tile(): instant jump-cut to un-minimized/reset', async ({ page }) => {
    await forceFxTier(page, '2');
    await openApp(page, 'resume');
    const w = win(page, 'resume');

    const ghosted = await clickAndWaitGhosted(page, 'resume', '.button.minimize');
    expect(ghosted).toBe(true);

    await page.evaluate(() => document.querySelector('iconostat-desktop').tile());

    await expect(w).not.toHaveClass(/minimized/);
    await expect(w).not.toHaveClass(/fx-ghost/);
    await expect(w).toBeVisible();
    await noFxGhostOrHiddenCanvas(page);
    expect(await inFlightNames(page)).toEqual([]);
  });

  // -- close() on the SAME window: bounded self-heal, both effect kinds ----

  test('genie-minimize x close(): the window is removed, the effect self-heals with no strand or thrown error', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await forceFxTier(page, '2');
    await openApp(page, 'resume');

    const ghosted = await clickAndWaitGhosted(page, 'resume', '.button.minimize');
    expect(ghosted).toBe(true);

    await page.evaluate(() => document.getElementById('window-resume').close());
    await expect(page.locator('#window-resume')).toHaveCount(0); // removed from the DOM outright

    await expect.poll(() => noFxGhostOrHiddenCanvasBool(page), { timeout: 3000 }).toBe(true);
    expect(await inFlightNames(page)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('genie-maximize x close(): the window is removed, the effect self-heals with no strand or thrown error', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await forceFxTier(page, '2');
    await openApp(page, 'resume');

    const ghosted = await clickAndWaitGhosted(page, 'resume', '.button.maximize');
    expect(ghosted).toBe(true);

    await page.evaluate(() => document.getElementById('window-resume').close());
    await expect(page.locator('#window-resume')).toHaveCount(0);

    await expect.poll(() => noFxGhostOrHiddenCanvasBool(page), { timeout: 3000 }).toBe(true);
    expect(await inFlightNames(page)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('wobble-drag x close(): the window is removed mid-drag, the effect self-heals with no strand or thrown error', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await forceFxTier(page, '2');
    await openApp(page, 'resume');
    const w = win(page, 'resume');

    await dragByAndHold(page, w, 80, 50);
    await expect(w).toHaveClass(/fx-ghost/, { timeout: 2000 });

    await page.evaluate(() => document.getElementById('window-resume').close());
    await page.mouse.up(); // release the now-irrelevant held-down button
    await expect(page.locator('#window-resume')).toHaveCount(0);

    await expect.poll(() => noFxGhostOrHiddenCanvasBool(page), { timeout: 3000 }).toBe(true);
    expect(await inFlightNames(page)).toEqual([]);
    expect(errors).toEqual([]);
  });

  // -- genie-restore: resize is instant; cascade()/tile() self-heal --------

  // NOTE on triggering a genuine genie-restore in these tests: restore is
  // wired to a `mousedown` handler (`bringToFront(true)`, see window.js's
  // `_wireEvents`), NOT `click` -- `element.click()` (the raw DOM API) only
  // dispatches a `click` event, never `mousedown`/`mouseup`, so it is a
  // silent no-op here (discovered empirically while writing this file: an
  // earlier draft using `page.evaluate(() => el.click())` never actually
  // started a restore at all, and these tests were unknowingly asserting on
  // a stale, still-in-flight MINIMIZE instead). Use a real Playwright
  // `.click()` (a genuine mousedown+mouseup+click sequence) instead, exactly
  // like the already-covered "a real chip click restores..." test in
  // fx-seams.spec.js and the round-trip test in fx-tier2-genie.spec.js --
  // its built-in actionability wait ALSO naturally waits out the prior
  // minimize's own fx-ghost (the chip is invisible, hence unclickable, until
  // genie's own minimize animation finishes and reveals it), which is
  // exactly the ordering these cells intend to test (a clean, fully-settled
  // restore -- not a same-window reversal, which is already covered
  // elsewhere).

  test('genie-restore x resize: instant jump-cut (unconditional cancelAll, regime 1)', async ({ page }) => {
    await forceFxTier(page, '2');
    await openApp(page, 'resume');
    const w = win(page, 'resume');

    await w.locator('.button.minimize').click();
    await expect(w).toHaveClass(/minimized/, { timeout: 2000 });

    await w.click(); // real chip click -- restore
    await expect(w).toHaveClass(/fx-ghost/, { timeout: 2000 });

    await page.setViewportSize({ width: 1000, height: 800 });

    await expect(w).not.toHaveClass(/fx-ghost/, { timeout: 2000 });
    await expect(w).not.toHaveClass(/minimized/);
    await expect(w).toBeVisible();
    await noFxGhostOrHiddenCanvas(page);
    expect(await inFlightNames(page)).toEqual([]);
  });

  test('genie-restore x cascade(): bounded self-heal (regime 2 -- minimize(false) already committed, no before-event for cascade to hook)', async ({ page }) => {
    await forceFxTier(page, '2');
    await openApp(page, 'resume');
    const w = win(page, 'resume');

    await w.locator('.button.minimize').click();
    await expect(w).toHaveClass(/minimized/, { timeout: 2000 });

    await w.click();
    await expect(w).toHaveClass(/fx-ghost/, { timeout: 2000 });

    await page.evaluate(() => document.querySelector('iconostat-desktop').cascade());

    // Not necessarily instant -- bounded by genie's own restore duration
    // (<=400ms desktop) -- but MUST resolve well within it, every time.
    await expect(w).not.toHaveClass(/fx-ghost/, { timeout: 3000 });
    await expect(w).not.toHaveClass(/minimized/);
    await expect(w).toBeVisible();
    await noFxGhostOrHiddenCanvas(page);
    expect(await inFlightNames(page)).toEqual([]);
  });

  test('genie-restore x close(): bounded self-heal', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await forceFxTier(page, '2');
    await openApp(page, 'resume');
    const w = win(page, 'resume');

    await w.locator('.button.minimize').click();
    await expect(w).toHaveClass(/minimized/, { timeout: 2000 });
    await w.click();
    await expect(w).toHaveClass(/fx-ghost/, { timeout: 2000 });

    await page.evaluate(() => document.getElementById('window-resume').close());
    await expect(page.locator('#window-resume')).toHaveCount(0);

    await expect.poll(() => noFxGhostOrHiddenCanvasBool(page), { timeout: 3000 }).toBe(true);
    expect(await inFlightNames(page)).toEqual([]);
    expect(errors).toEqual([]);
  });

  // -- genie-maximize: resize instant; cascade()/tile() self-heal ----------

  test('genie-maximize x resize: instant jump-cut', async ({ page }) => {
    await forceFxTier(page, '2');
    await openApp(page, 'resume');
    const w = win(page, 'resume');

    const ghosted = await clickAndWaitGhosted(page, 'resume', '.button.maximize');
    expect(ghosted).toBe(true);

    await page.setViewportSize({ width: 1000, height: 800 });

    await expect(w).not.toHaveClass(/fx-ghost/, { timeout: 2000 });
    await expect(w).toBeVisible();
    await noFxGhostOrHiddenCanvas(page);
    expect(await inFlightNames(page)).toEqual([]);
  });

  test('genie-maximize x cascade(): bounded self-heal (regime 2 -- see file banner)', async ({ page }) => {
    await forceFxTier(page, '2');
    await openApp(page, 'resume');
    const w = win(page, 'resume');

    const probe = await page.evaluate(async () => {
      const el = document.getElementById('window-resume');
      el.querySelector('.button.maximize').click();
      const deadline = performance.now() + 5000;
      while (!el.classList.contains('fx-ghost') && performance.now() < deadline) {
        await new Promise((r) => setTimeout(r, 1));
      }
      const before = { maximized: el.classList.contains('maximized'), fxGhost: el.classList.contains('fx-ghost') };
      document.querySelector('iconostat-desktop').cascade();
      return { before };
    });
    // Confirms regime 2 precisely: cascade() already reset `maximized` to
    // false (in the SAME synchronous turn) while the effect was still
    // fx-ghosted -- i.e. genuinely no before-event fired for this cell.
    expect(probe.before).toEqual({ maximized: true, fxGhost: true });

    // Bounded by genie's own MAXIMIZE_DURATION (150ms) -- must resolve well
    // within a generous margin, never longer, never stranded.
    await expect(w).not.toHaveClass(/fx-ghost/, { timeout: 2000 });
    await expect(w).not.toHaveClass(/maximized/); // cascade()'s own reset() already decided this
    await expect(w).toBeVisible();
    await noFxGhostOrHiddenCanvas(page);
    expect(await inFlightNames(page)).toEqual([]);
  });

  test('genie-maximize x tile(): bounded self-heal (same mechanism as cascade(), regime 2)', async ({ page }) => {
    await forceFxTier(page, '2');
    await openApp(page, 'resume');
    const w = win(page, 'resume');

    const ghosted = await clickAndWaitGhosted(page, 'resume', '.button.maximize');
    expect(ghosted).toBe(true);

    await page.evaluate(() => document.querySelector('iconostat-desktop').tile());

    await expect(w).not.toHaveClass(/fx-ghost/, { timeout: 2000 });
    await expect(w).not.toHaveClass(/maximized/);
    await expect(w).toBeVisible();
    await noFxGhostOrHiddenCanvas(page);
    expect(await inFlightNames(page)).toEqual([]);
  });

  test('genie-maximize x second gesture (rapid double-click): instant reversal handoff, ends correctly un-maximized', async ({ page }) => {
    await forceFxTier(page, '2');
    await openApp(page, 'resume');
    const w = win(page, 'resume');

    const ghosted = await clickAndWaitGhosted(page, 'resume', '.button.maximize');
    expect(ghosted).toBe(true);

    // Second (opposite-direction) click while still fx-ghosted -- genie's
    // own reversal/handoff path (mirrors the already-covered minimize-chip
    // reversal test), not previously exercised for maximize.
    await w.locator('.button.maximize').click();

    await expect(w).not.toHaveClass(/fx-ghost/, { timeout: 2000 });
    await expect(w).not.toHaveClass(/maximized/);
    await expect(w).toBeVisible();
    await noFxGhostOrHiddenCanvas(page);
    expect(await inFlightNames(page)).toEqual([]);
  });

  // -- wobble-drag x cascade()/tile(): bounded self-heal (regime 2) --------

  test('wobble-drag x cascade(): bounded self-heal, ends fully revealed with no strand', async ({ page }) => {
    await forceFxTier(page, '2');
    await openApp(page, 'resume');
    const w = win(page, 'resume');

    await dragByAndHold(page, w, 90, 60);
    await expect(w).toHaveClass(/fx-ghost/, { timeout: 2000 });

    await page.evaluate(() => document.querySelector('iconostat-desktop').cascade());
    await page.mouse.up();

    // Bounded by wobble's own settle path (kinetic threshold or the 2s
    // hard cap) -- generous timeout, must never strand.
    await expect(w).not.toHaveClass(/fx-ghost/, { timeout: 3000 });
    await expect(w).toBeVisible();
    await noFxGhostOrHiddenCanvas(page);
    expect(await inFlightNames(page)).toEqual([]);
  });

  test('wobble-drag x tile(): bounded self-heal, ends fully revealed with no strand', async ({ page }) => {
    await forceFxTier(page, '2');
    await openApp(page, 'resume');
    const w = win(page, 'resume');

    await dragByAndHold(page, w, 90, 60);
    await expect(w).toHaveClass(/fx-ghost/, { timeout: 2000 });

    await page.evaluate(() => document.querySelector('iconostat-desktop').tile());
    await page.mouse.up();

    await expect(w).not.toHaveClass(/fx-ghost/, { timeout: 3000 });
    await expect(w).toBeVisible();
    await noFxGhostOrHiddenCanvas(page);
    expect(await inFlightNames(page)).toEqual([]);
  });

  test('wobble-drag x resize fired IMMEDIATELY after mousedown (before beginEffect resolves): still ends fully revealed, no strand (exercises wobble.js\'s settledEarly path)', async ({ page }) => {
    // The other wobble-drag cancellation cells above all wait for
    // `fx-ghost` first -- i.e. AFTER `dragStart`'s own `beginEffect()`
    // snapshot has already resolved and `dragState` already exists. This
    // cell deliberately does NOT wait: firing the cancel trigger right
    // after mousedown, before that snapshot round trip has had a chance to
    // resolve, is the ONLY way to reach wobble.js's `settledEarly` branch
    // (dragStart's placeholder-cancel-while-still-snapshotting path, see
    // its extensive in-file comment -- task-F open item #3's audit
    // concluded this branch is reachable, not dead, precisely via a
    // resize/cancelAll racing in during this narrow window with nothing
    // else claiming `el`). Whether THIS particular run actually lands in
    // that exact window is inherently timing-dependent (real network+decode
    // latency for the snapshot vs. the resize's dispatch) -- the assertion
    // below doesn't depend on which internal branch fired, only on the
    // hard invariant holding either way.
    await forceFxTier(page, '2');
    await openApp(page, 'resume');
    const w = win(page, 'resume');

    const box = await w.locator('.window-header').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 90, box.y + box.height / 2 + 60, { steps: 8 });
    // No wait for fx-ghost here, on purpose -- see above.
    await page.setViewportSize({ width: 1000, height: 800 });
    await page.mouse.up();

    await expect(w).not.toHaveClass(/fx-ghost/, { timeout: 3000 });
    await expect(w).toBeVisible();
    await noFxGhostOrHiddenCanvas(page);
    await expect.poll(() => inFlightNames(page), { timeout: 2000 }).toEqual([]);
  });

  // -- Cross-origin iframe demotion: OTHER windows stay Tier 2 (Part 2 #2) --

  test('a cross-origin iframe window demotes to Tier 1 while a SIBLING window stays Tier 2', async ({ page }) => {
    await forceFxTier(page, '2');
    await openApp(page, 'resume');
    await openViaMenu(page, 'Intro'); // a second, plain window -- see start-menu items
    const tainted = win(page, 'resume');
    const clean = win(page, 'intro');

    await page.evaluate(() => {
      const body = document.querySelector('#window-resume .window-body');
      const iframe = document.createElement('iframe');
      iframe.src = location.href.replace('localhost', '127.0.0.1'); // genuine cross-origin, see fx-tier2-genie.spec.js's identical fixture
      body.appendChild(iframe);
    });

    // Tainted window: first minimize attempt throws SnapshotError internally
    // and demotes -- controller.tierFor(el) === 1 afterward, per the spec's
    // acceptance criterion. Still completes correctly via Tier 1, no strand.
    await tainted.locator('.button.minimize').click();
    await expect(tainted).not.toHaveClass(/minimized/); // not instant -- Tier 1's WAAPI engaged
    await expect(tainted).toHaveClass(/minimized/, { timeout: 2000 });
    await expect(tainted).toBeVisible();
    await expect(tainted).not.toHaveClass(/fx-ghost/);

    const taintedTier = await page.evaluate(async () => {
      const { FxController } = await import('/iconostat/fx/controller.js');
      const el = document.getElementById('window-resume') || document.querySelector('#tasks #window-resume');
      return FxController.tierFor(el);
    });
    expect(taintedTier).toBe(1);

    // Session tier itself, and the OTHER (clean) window, are unaffected:
    // this is a PER-WINDOW demotion (a WeakMap ceiling, see controller.js's
    // `demote()`), not a session-wide one.
    const sessionTier = await page.evaluate(async () => (await import('/iconostat/fx/controller.js')).FxController.tier);
    expect(sessionTier).toBe(2);

    await clean.locator('.button.minimize').click();
    await expect(clean).toHaveClass(/fx-ghost/, { timeout: 2000 }); // Tier 2's own swap protocol engaged -- proves it's still Tier 2
    await expect(clean).toHaveClass(/minimized/, { timeout: 2000 });
    await expect(clean).toBeVisible();
    await expect(clean).not.toHaveClass(/fx-ghost/);
    await noFxGhostOrHiddenCanvas(page);

    const cleanTier = await page.evaluate(async () => {
      const { FxController } = await import('/iconostat/fx/controller.js');
      const el = document.querySelector('#tasks #window-intro') || document.getElementById('window-intro');
      return FxController.tierFor(el);
    });
    expect(cleanTier).toBe(2);
  });
});

test.describe('Cancellation matrix -- Tier 1 (forced, no-preference)', () => {
  test.use({ reducedMotion: 'no-preference' });
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
  });

  test('Tier-1 minimize x tile(): instant abandon via watchForInterference', async ({ page }) => {
    await forceFxTier(page, '1');
    await openApp(page, 'resume');
    const w = win(page, 'resume');

    await w.locator('.button.minimize').click();
    await expect(w).not.toHaveClass(/minimized/); // effect in flight

    await page.evaluate(() => document.querySelector('iconostat-desktop').tile());

    await expect(w).not.toHaveClass(/minimized/);
    await expect(w).toBeVisible();
    const style = await w.evaluate((el) => ({ transform: el.style.transform, opacity: el.style.opacity }));
    expect(style.transform).toBe('');
    expect(style.opacity).toBe('');
    expect(await inFlightNames(page)).toEqual([]);

    // Registry sanity.
    await w.locator('.button.minimize').click();
    await expect(w).toHaveClass(/minimized/, { timeout: 2000 });
  });

  test('Tier-1 maximize x cascade(): instant abandon via watchForInterference', async ({ page }) => {
    await forceFxTier(page, '1');
    await openApp(page, 'resume');
    const w = win(page, 'resume');

    // Tier 1's maximize commits the `maximized` class SYNCHRONOUSLY, at the
    // very start of `maximizeTransition` (before its WAAPI animation even
    // begins) -- there's no "not yet maximized" window to observe via a
    // separate round trip (an earlier draft's `await expect(w).not.
    // toHaveClass(/maximized/)` right after the click passed TRIVIALLY,
    // before the effect had even started, then raced cascade() ahead of
    // the real commit). Capture "genuinely mid-flight" and fire cascade() in
    // the SAME synchronous browser-side turn instead (same technique as the
    // Tier-2 genie-maximize x cascade() cell above).
    const probe = await page.evaluate(async () => {
      const el = document.getElementById('window-resume');
      el.querySelector('.button.maximize').click();
      const deadline = performance.now() + 5000;
      while (!el.classList.contains('maximized') && performance.now() < deadline) {
        await new Promise((r) => setTimeout(r, 1));
      }
      const before = { maximized: el.classList.contains('maximized') };
      document.querySelector('iconostat-desktop').cascade();
      return { before };
    });
    expect(probe.before).toEqual({ maximized: true });

    await expect(w).not.toHaveClass(/maximized/, { timeout: 2000 });
    await expect(w).toBeVisible();
    const style = await w.evaluate((el) => ({ transform: el.style.transform, opacity: el.style.opacity }));
    expect(style.transform).toBe('');
    expect(style.opacity).toBe('');
    await expect.poll(() => inFlightNames(page), { timeout: 2000 }).toEqual([]);
  });

  test('Tier-1 minimize x close(): bounded self-heal (close() has no attribute-mutation hook for the MutationObserver to catch)', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await forceFxTier(page, '1');
    await openApp(page, 'resume');

    await page.evaluate(() => document.getElementById('window-resume').querySelector('.button.minimize').click());
    // Wait for the effect to actually be registered (past controller.js's
    // own `await this._loadTier1()` -- the FIRST Tier-1 gesture of a fresh
    // page pays a real dynamic-import round trip) before closing: closing
    // in that narrow pre-registration window races minimizeEnter's own
    // synchronous chip-rect reparent probe (`taskbar.appendChild(el)` ...
    // `document.body.appendChild(el)`), which -- discovered empirically
    // while writing this file -- can RESURRECT an already-`close()`d
    // (detached) element back into the DOM. That's a narrow, real edge case
    // (out of this task's fix scope -- see task-F-report.md), not what this
    // cell means to exercise; wait past it so this test exercises the
    // intended "close() while genuinely mid-effect" scenario cleanly.
    await expect.poll(() => inFlightNames(page), { timeout: 2000 }).toContain('minimize');

    await page.evaluate(() => document.getElementById('window-resume').close());

    await expect(page.locator('#window-resume')).toHaveCount(0, { timeout: 2000 });
    await page.waitForTimeout(400); // Tier-1 minimize's own bounded 250ms duration + margin
    expect(errors).toEqual([]);
    expect(await inFlightNames(page)).toEqual([]);
  });

  test('Tier-1 wobble-drag x cascade(): instant abandon via watchForInterference', async ({ page }) => {
    await forceFxTier(page, '1');
    await openApp(page, 'resume');
    const w = win(page, 'resume');

    const box = await w.locator('.window-header').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 90, box.y + box.height / 2 + 60, { steps: 8 });

    await page.evaluate(() => document.querySelector('iconostat-desktop').cascade());
    await page.mouse.up();

    // Tier-1 wobble has no `watchForInterference` watcher at all (see this
    // file's banner, regime 3-adjacent note) -- cascade() repositions the
    // real element underneath the decoration, but the drag's own
    // `dragEnd`-triggered ~220ms settle-back-to-identity animation still has
    // to run its course before the registry clears; wait it out rather than
    // asserting instant.
    await expect(async () => {
      expect(await w.evaluate((el) => el.style.transform)).toBe('');
    }).toPass({ timeout: 2000 });
    await expect.poll(() => inFlightNames(page), { timeout: 2000 }).toEqual([]);
  });

  test('Tier-1 wobble-drag x close(): bounded self-heal', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await forceFxTier(page, '1');
    await openApp(page, 'resume');
    const w = win(page, 'resume');

    const box = await w.locator('.window-header').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 90, box.y + box.height / 2 + 60, { steps: 8 });

    await page.evaluate(() => document.getElementById('window-resume').close());
    await page.mouse.up();
    await expect(page.locator('#window-resume')).toHaveCount(0);

    await page.waitForTimeout(400);
    expect(errors).toEqual([]);
    expect(await inFlightNames(page)).toEqual([]);
  });
});

// Exposed for `expect.poll()` callers above (Playwright serializes the poll
// callback separately; this needs to be reachable from `page.evaluate`
// contexts that were already given a plain page reference, not re-imported
// per call) -- a thin, poll-friendly wrapper around
// `noFxGhostOrHiddenCanvas`'s two assertions, returning a boolean instead of
// throwing, so `expect.poll(...).toBe(true)` can retry it.
async function noFxGhostOrHiddenCanvasBool(page) {
  try {
    await noFxGhostOrHiddenCanvas(page);
    return true;
  } catch (e) {
    return false;
  }
}
