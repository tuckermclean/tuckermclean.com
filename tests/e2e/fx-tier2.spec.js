import { test, expect } from './fixtures.js';
import { openApp, win } from './helpers.js';

// Iconostat FX -- Tier 2 (WebGL2 compositor core: snapshot.js + compositor.js
// + the controller's tier-2 wiring). See
// docs/superpowers/specs/2026-08-11-iconostat-fx-design.md and
// .superpowers/sdd/2026-08-11-iconostat-fx-design/task-B-brief.md.
//
// -- Sandbox honesty note (read before "fixing" a failing assertion here) --
// This suite runs against a shimmed headless Chromium. WebGL2 context
// creation genuinely works here (confirmed empirically below, and by Agent
// E's report). SVG-foreignObject-to-canvas rasterization quality is a
// SEPARATE, much less reliable thing in headless Chromium -- it can render
// blank/restricted rather than failing outright, which this suite has no way
// to distinguish from "the window legitimately has no visible content" via a
// pixel-diff. Per the brief, these tests deliberately avoid pixel-diffing a
// foreignObject raster and instead assert the SWAP PROTOCOL, DEGRADATION
// PATHS, and HARD INVARIANTS -- which are all independently verifiable
// without caring what the rasterized pixels look like. The one thing this
// suite genuinely could NOT verify (see the bottom of this file) is that a
// foreignObject snapshot of real window chrome visually matches the source
// at rest -- that requires a real (non-headless, or a headless build with
// full foreignObject support) browser to eyeball.
//
// The default suite runs with `reducedMotion: 'reduce'` (Tier 0) -- these
// tests opt back in via `test.use({ reducedMotion: 'no-preference' })` +
// `page.emulateMedia()`, matching fx-tier1.spec.js's pattern exactly.

async function forceFxTier(page, tier) {
  await page.addInitScript((t) => {
    window.localStorage.setItem('iconostat-fx-tier', t);
  }, tier);
}

test.describe('Tier 0 (reduced motion) -- compositor.js must still never load', () => {
  test('minimizing a window at Tier 0 creates no canvas, even though compositor.js now exists on disk', async ({ page }) => {
    await openApp(page, 'resume');
    const w = win(page, 'resume');

    await w.locator('.button.minimize').click();
    await expect(w).toHaveClass(/minimized/);

    expect(await page.locator('canvas#iconostat-fx-canvas').count()).toBe(0);
    expect(await page.locator('.fx-ghost').count()).toBe(0);
    // fx.css is only injected once tier > 0 -- Tier 0 never touches the DOM
    // at all, per init()'s early return.
    expect(await page.locator('link[href*="/iconostat/fx/fx.css"]').count()).toBe(0);
  });
});

test.describe('Tier 2 (forced, no-preference)', () => {
  test.use({ reducedMotion: 'no-preference' });
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
  });

  test('compositor.js and snapshot.js are served (200) and actually evaluated', async ({ page }) => {
    await forceFxTier(page, '2');
    const compositorResponse = page.waitForResponse((r) => r.url().endsWith('/iconostat/fx/compositor.js'));
    await openApp(page, 'resume');

    // Nothing has requested compositor.js yet at this point (it's loaded
    // lazily, only on the first Tier-2-selected gesture) -- trigger one.
    await win(page, 'resume').locator('.button.minimize').click();
    const res = await compositorResponse;
    expect(res.ok()).toBe(true);

    // Proof it was actually evaluated, not just fetched: dynamically
    // importing it again from the page (same cached module) exposes real
    // exports.
    const exportsOk = await page.evaluate(async () => {
      const compositor = await import('/iconostat/fx/compositor.js');
      const snapshotMod = await import('/iconostat/fx/snapshot.js');
      return {
        hasBeginEffect: typeof compositor.beginEffect === 'function',
        hasEndEffect: typeof compositor.endEffect === 'function',
        hasDrawMesh: typeof compositor.drawMesh === 'function',
        hasWarmup: typeof compositor.warmup === 'function',
        hasSnapshot: typeof snapshotMod.snapshot === 'function',
        hasSnapshotError: typeof snapshotMod.SnapshotError === 'function',
      };
    });
    expect(exportsOk).toEqual({
      hasBeginEffect: true,
      hasEndEffect: true,
      hasDrawMesh: true,
      hasWarmup: true,
      hasSnapshot: true,
      hasSnapshotError: true,
    });
  });

  // *** THE critical regression-trap test (see task-B-brief.md) ***
  //
  // This is the exact post-Agent-B / pre-Agent-C/D state: compositor.js is
  // real or ever, genie.js does not exist. Before this file's controller.js
  // changes, `_runEffect`'s `if (compositor) { return; }` stub would have
  // fired here (compositor.js now resolves) and the window would have
  // animated with NOTHING. Proving the fix: a real forced-Tier-2 user
  // minimize must still animate via Tier 1 (not be instant, not vanish) and
  // land in the exact correct minimized end state.
  test('Tier-2 selected, genie absent -> falls through to Tier 1 and ends correct (the regression-trap proof)', async ({ page }) => {
    await forceFxTier(page, '2');
    await openApp(page, 'resume');
    const w = win(page, 'resume');

    await w.locator('.button.minimize').click();

    // Not instant -- proves SOME effect actually engaged (Tier 0 would have
    // completed synchronously inside the click handler).
    await expect(w).not.toHaveClass(/minimized/);

    // Tier 1's WAAPI animation lands it in the correct end state.
    await expect(w).toHaveClass(/minimized/, { timeout: 2000 });
    await expect(page.locator('#tasks #window-resume')).toHaveCount(1);
    await expect(page.locator('body > #window-resume')).toHaveCount(0);
    await expect(w).toBeVisible(); // never stranded
    await expect(w).not.toHaveClass(/fx-ghost/);
    const style = await w.evaluate((el) => ({ transform: el.style.transform, opacity: el.style.opacity }));
    expect(style.transform).toBe('');
    expect(style.opacity).toBe('');
    // The shared canvas DOES exist in the DOM by now (compositor.js's
    // warmup probe -- run once, the first time _loadTier2() succeeds --
    // calls ensureCanvas()), but must never have been SHOWN: this gesture
    // never got past `_loadGenie()` returning null, so `beginEffect()` (the
    // only thing that ever flips it to display:block) was never called.
    const canvasCount = await page.locator('canvas#iconostat-fx-canvas').count();
    if (canvasCount > 0) {
      await expect(page.locator('canvas#iconostat-fx-canvas')).toBeHidden();
    }

    // The session tier itself is untouched by a "module absent" fallthrough
    // (as opposed to a warmup-demote or a per-window SnapshotError demote,
    // both of which DO change tier/tierFor -- see the tests below) --
    // genie.js merely doesn't exist yet, that's not evidence Tier 2 itself
    // is unsafe on this machine.
    const tier = await page.evaluate(async () => (await import('/iconostat/fx/controller.js')).FxController.tier);
    expect(tier).toBe(2);

    // Round-trip: restore also falls through to Tier 1 correctly.
    await w.click();
    await expect(w).not.toHaveClass(/minimized/, { timeout: 2000 });
    await expect(w).toBeVisible();
  });

  test('the same fallthrough holds for maximize and for drag/wobble', async ({ page }) => {
    await forceFxTier(page, '2');
    await openApp(page, 'resume');
    const w = win(page, 'resume');

    await w.locator('.button.maximize').click();
    await expect(w).toHaveClass(/maximized/, { timeout: 2000 });
    expect(await w.evaluate((el) => el.style.transform)).toBe('');
    await w.locator('.button.maximize').click();
    await expect(w).not.toHaveClass(/maximized/, { timeout: 2000 });

    const box = await w.locator('.window-header').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 50, { steps: 8 });
    await page.mouse.up();
    await expect(async () => {
      expect(await w.evaluate((el) => el.style.transform)).toBe('');
    }).toPass({ timeout: 2000 });
    await expect(w).toBeVisible();
    await expect(w).not.toHaveClass(/fx-ghost/);
  });

  test('a warmup verdict of "demote" drops the session tier to 1, even though it was forced to 2', async ({ page }) => {
    await forceFxTier(page, '2');
    await openApp(page, 'resume');

    // Pre-seed the compositor's (page-lifetime-cached) warmup verdict via
    // the documented test-only override, BEFORE the real gesture below
    // drives controller.js's _loadTier2() into calling warmup() for real --
    // it will find the cache already populated and reuse it.
    await page.evaluate(async () => {
      const compositor = await import('/iconostat/fx/compositor.js');
      await compositor.warmup({ forceVerdict: 'demote' });
    });

    const w = win(page, 'resume');
    await w.locator('.button.minimize').click();
    await expect(w).toHaveClass(/minimized/, { timeout: 2000 });
    await expect(w).toBeVisible();
    await expect(w).not.toHaveClass(/fx-ghost/);

    const tier = await page.evaluate(async () => (await import('/iconostat/fx/controller.js')).FxController.tier);
    expect(tier).toBe(1);
  });

  test('a cross-origin iframe: snapshot() and compositor.beginEffect() both throw a typed SnapshotError with zero side effects', async ({ page }) => {
    await openApp(page, 'resume');

    const result = await page.evaluate(async () => {
      const { snapshot, SnapshotError } = await import('/iconostat/fx/snapshot.js');
      const compositor = await import('/iconostat/fx/compositor.js');

      const container = document.createElement('div');
      container.style.cssText = 'position:fixed;top:0;left:0;width:200px;height:150px;';
      const iframe = document.createElement('iframe');
      // A different HOSTNAME (127.0.0.1 vs localhost) serving the exact
      // same local Hugo server -- a genuine, network-free way to construct
      // a cross-origin src without any external network dependency. Note:
      // the risk check is a pure URL-string comparison (see snapshot.js) --
      // it never waits for the iframe to actually load, so this works
      // regardless of whether 127.0.0.1 is independently reachable here.
      iframe.src = location.href.replace('localhost', '127.0.0.1');
      container.appendChild(iframe);
      document.body.appendChild(container);

      const outcomes = {};
      try {
        await snapshot(container);
        outcomes.snapshotThrew = false;
      } catch (e) {
        outcomes.snapshotThrew = true;
        outcomes.snapshotIsTyped = e.name === 'SnapshotError';
      }

      try {
        await compositor.beginEffect(container);
        outcomes.beginEffectThrew = false;
      } catch (e) {
        outcomes.beginEffectThrew = true;
        outcomes.beginEffectIsTyped = e.name === 'SnapshotError';
      }

      outcomes.ghostAdded = container.classList.contains('fx-ghost');
      outcomes.canvasCount = document.querySelectorAll('canvas#iconostat-fx-canvas').length;
      container.remove();
      return outcomes;
    });

    expect(result.snapshotThrew).toBe(true);
    expect(result.snapshotIsTyped).toBe(true);
    expect(result.beginEffectThrew).toBe(true);
    expect(result.beginEffectIsTyped).toBe(true);
    expect(result.ghostAdded).toBe(false);
    expect(result.canvasCount).toBe(0); // beginEffect's snapshot() throw happens strictly before ensureCanvas() would ever run
  });

  test('simulated webglcontextlost -> FxController.cancelAll -> every window ends up visible (no stranded fx-ghost)', async ({ page }) => {
    await forceFxTier(page, '2');
    await openApp(page, 'resume');
    const w = win(page, 'resume');

    const result = await page.evaluate(async () => {
      const { FxController } = await import('/iconostat/fx/controller.js');
      const compositor = await import('/iconostat/fx/compositor.js');
      await compositor.warmup(); // real WebGL2 probe -- also ensures the canvas+context exist
      const canvas = document.getElementById('iconostat-fx-canvas');
      if (!canvas) return { hasCanvas: false };

      const el = document.getElementById('window-resume');
      let cancelInvoked = false;
      // Simulates what a real Tier-2 effect (genie.js/wobble.js, once they
      // exist) is contractually required to do: register itself so
      // cancelAll() can reach it, and its cancel closure must reveal `el`
      // (mirrors compositor.js's endEffect()'s job).
      FxController.registerEffect(el, 'fake-tier2-effect-for-context-loss-test', () => {
        cancelInvoked = true;
        el.classList.remove('fx-ghost');
      });
      el.classList.add('fx-ghost'); // simulate an in-flight Tier-2 effect

      const gl = canvas.getContext('webgl2');
      const ext = gl && gl.getExtension('WEBGL_lose_context');
      if (!ext) return { hasCanvas: true, hasExt: false };

      ext.loseContext();
      // webglcontextlost dispatch is asynchronous per spec -- give it a tick.
      await new Promise((resolve) => setTimeout(resolve, 100));

      return {
        hasCanvas: true,
        hasExt: true,
        cancelInvoked,
        ghostRemaining: el.classList.contains('fx-ghost'),
        canvasHiddenAfterLoss: canvas.style.display === 'none',
      };
    });

    expect(result.hasCanvas).toBe(true);
    expect(result.hasExt).toBe(true); // if this ever legitimately fails in some future Chromium build, see the sandbox-honesty note at the top of this file
    expect(result.cancelInvoked).toBe(true);
    expect(result.ghostRemaining).toBe(false);
    expect(result.canvasHiddenAfterLoss).toBe(true);
    await expect(w).toBeVisible();
  });
});

// -- What this suite could NOT verify (sandbox honesty, per the brief) ------
//
// A pixel-level check that a foreignObject snapshot of real window chrome
// (headers, buttons, text, an <img>) visually matches the live element at
// rest. Attempted a lightweight structural probe of this (draw a snapshot,
// read back a few pixels via getImageData, assert non-transparent coverage
// roughly matches the chrome's known background color) and it was NOT
// reliable in this shimmed headless Chromium -- the foreignObject raster
// came back inconsistently blank/partial across runs, which is a documented
// headless-Chromium foreignObject limitation, not evidence of a bug in
// snapshot.js's serializer (the serializer itself -- style inlining, SVG/XML
// construction, Image decode, canvas draw -- is implemented per spec and
// unit-tested wherever it doesn't depend on foreignObject rendering
// quality). This is the one piece that needs eyeballing in a real browser;
// everything else in this file (the swap protocol, taint/cross-origin
// detection, warmup verdict wiring, context-loss recovery, and the
// regression-trap fallthrough) is verified for real, unmocked, in this
// sandbox.
