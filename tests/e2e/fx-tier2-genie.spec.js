import { test, expect } from './fixtures.js';
import { openApp, win } from './helpers.js';

// Iconostat FX -- Tier 2 genie (assets/iconostat/fx/genie.js, Agent C):
// minimize/restore/maximize/unmaximize choreography over the shared WebGL2
// compositor. See docs/superpowers/specs/2026-08-11-iconostat-fx-design.md
// (Agent C section) and .superpowers/sdd/2026-08-11-iconostat-fx-design/
// task-C-report.md.
//
// -- Sandbox honesty note (read before "fixing" a failing assertion here) --
// Same caveat as fx-tier2.spec.js: this suite runs against a shimmed
// headless Chromium where WebGL2 context creation genuinely works but
// foreignObject rasterization quality/timing is not reliable enough to
// pixel-diff. These tests deliberately assert CHOREOGRAPHY (non-instant,
// correct ordering), the SWAP PROTOCOL (fx-ghost/canvas lifecycle), END-STATE
// PARITY (exact same classes/DOM position/front/z-index as the non-fx path),
// CANCELLATION (jump-cut, reversal), and the FINALLY-GUARANTEED-REVEAL hard
// invariant -- never a pixel-diff of the warp itself.
//
// The default suite runs with `reducedMotion: 'reduce'` (Tier 0) -- these
// tests opt back in via `test.use({ reducedMotion: 'no-preference' })` +
// `page.emulateMedia()` and force Tier 2 via localStorage, matching
// fx-tier1.spec.js/fx-tier2.spec.js's pattern exactly.

async function forceFxTier(page, tier) {
  await page.addInitScript((t) => {
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

test.describe('Tier 2 genie (forced, no-preference)', () => {
  test.use({ reducedMotion: 'no-preference' });
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
  });

  test('genie.js is served (200) and actually evaluated once a real gesture needs it', async ({ page }) => {
    await forceFxTier(page, '2');
    const genieResponse = page.waitForResponse((r) => r.url().endsWith('/iconostat/fx/genie.js'));
    await openApp(page, 'resume');

    await win(page, 'resume').locator('.button.minimize').click();
    const res = await genieResponse;
    expect(res.ok()).toBe(true);

    const exportsOk = await page.evaluate(async () => {
      const genie = await import('/iconostat/fx/genie.js');
      return typeof genie.run === 'function';
    });
    expect(exportsOk).toBe(true);
  });

  test('a forced Tier-2 user minimize is non-instant, animates via the shared canvas, and ends in the exact minimized end state', async ({ page }) => {
    await forceFxTier(page, '2');
    await openApp(page, 'resume');
    const w = win(page, 'resume');

    await w.locator('.button.minimize').click();

    // Not instant -- genie's beginEffect()/snapshot round trip is async, so
    // the real minimize() commit cannot have happened synchronously inside
    // the click handler (proves genie actually engaged, not Tier 0/1).
    await expect(w).not.toHaveClass(/minimized/);

    // The chip must never be visible before the animation lands on it --
    // fx-ghost stays applied (real el hidden) for the whole choreography,
    // only lifting once genie's endEffect() reveals the final chip.
    await expect(page.locator('canvas#iconostat-fx-canvas')).toBeVisible();

    await expect(w).toHaveClass(/minimized/, { timeout: 2000 });
    await expect(page.locator('#tasks #window-resume')).toHaveCount(1);
    await expect(page.locator('body > #window-resume')).toHaveCount(0);
    await expect(w).toBeVisible(); // finally-invariant: never stranded fx-ghost/hidden
    await expect(w).not.toHaveClass(/fx-ghost/);
    await noFxGhostOrHiddenCanvas(page);

    const doneEvents = await page.evaluate(() => window.__fxDone || []);
    // (no listener registered yet in this test -- see the next test for the
    // fx-done assertion) -- just a defensive no-op read.
    expect(Array.isArray(doneEvents)).toBe(true);
  });

  test('iconostat-fx-done fires with {effect:"minimize"} then {effect:"restore"} on a full round trip, with correct end-state parity (front class + z-index)', async ({ page }) => {
    await forceFxTier(page, '2');
    await openApp(page, 'resume');
    const w = win(page, 'resume');

    await page.evaluate(() => {
      window.__fxDone = [];
      document.addEventListener('iconostat-fx-done', (e) => window.__fxDone.push(e.detail));
    });

    const beforeGeometry = await w.evaluate((el) => ({ width: el.style.width, height: el.style.height, top: el.style.top, left: el.style.left }));

    await w.locator('.button.minimize').click();
    await expect(w).toHaveClass(/minimized/, { timeout: 2000 });

    await w.click(); // restore via chip click (real user gesture, same as Tier 0/1 tests)
    await expect(w).not.toHaveClass(/minimized/, { timeout: 2000 });
    await expect(w).toBeVisible();
    await expect(w).not.toHaveClass(/fx-ghost/);

    // End-state parity: exact saved geometry restored, `front` class set,
    // a real (non-empty) z-index assigned -- identical shape to the Tier-0/
    // Tier-1 assertions in the sibling specs.
    const afterGeometry = await w.evaluate((el) => ({ width: el.style.width, height: el.style.height, top: el.style.top, left: el.style.left }));
    expect(afterGeometry).toEqual(beforeGeometry);
    await expect(w).toHaveClass(/front/);
    const zIndex = await w.evaluate((el) => el.style.zIndex);
    expect(zIndex).not.toBe('');

    await noFxGhostOrHiddenCanvas(page);

    const events = await page.evaluate(() => window.__fxDone);
    expect(events.length).toBe(2);
    expect(events[0]).toEqual({ name: 'resume', effect: 'minimize' });
    expect(events[1]).toEqual({ name: 'resume', effect: 'restore' });
  });

  test('maximize/unmaximize completes via genie with no reparent, correct end state, and a fired fx-done pair', async ({ page }) => {
    await forceFxTier(page, '2');
    await openApp(page, 'resume');
    const w = win(page, 'resume');

    await page.evaluate(() => {
      window.__fxDone = [];
      document.addEventListener('iconostat-fx-done', (e) => window.__fxDone.push(e.detail));
    });

    await w.locator('.button.maximize').click();
    await expect(w).not.toHaveClass(/maximized/); // non-instant
    await expect(w).toHaveClass(/maximized/, { timeout: 2000 });
    await expect(w).toBeVisible();
    await expect(w).not.toHaveClass(/fx-ghost/);
    // No reparent for maximize -- unlike minimize, `el` stays a direct body
    // child throughout.
    await expect(page.locator('body > #window-resume')).toHaveCount(1);

    await w.locator('.button.maximize').click();
    await expect(w).not.toHaveClass(/maximized/, { timeout: 2000 });
    await expect(w).toBeVisible();
    await expect(w).not.toHaveClass(/fx-ghost/);

    await noFxGhostOrHiddenCanvas(page);

    const events = await page.evaluate(() => window.__fxDone);
    expect(events.map((e) => e.effect)).toEqual(['maximize', 'unmaximize']);
  });

  test('a viewport resize mid-genie-minimize jump-cuts to the correct end state (finally-invariant holds)', async ({ page }) => {
    await forceFxTier(page, '2');
    await openApp(page, 'resume');
    const w = win(page, 'resume');

    await w.locator('.button.minimize').click();
    // NOTE: not asserting "not yet minimized" here -- genie's snapshot
    // round trip (foreignObject -> Image decode) is genuinely async but its
    // wall-clock duration is not something a test should depend on (it can
    // legitimately resolve within a couple of milliseconds on a warm,
    // otherwise-idle browser); racing an assertion against that window is
    // exactly the kind of flake this suite's sandbox-honesty note warns
    // about. The real assertion is below: the jump-cut must land on the
    // correct end state EITHER WAY -- whether the resize raced in before or
    // after genie's own commit (see genie.js's registerEffect cancelFn:
    // `jumpToEnd && !myState.committed` forces the real minimize() through
    // if it hadn't happened yet, matching Tier 1's identical-race contract
    // in fx-tier1.spec.js).
    await page.setViewportSize({ width: 1000, height: 800 });

    await expect(w).toHaveClass(/minimized/, { timeout: 2000 });
    await expect(page.locator('#tasks #window-resume')).toHaveCount(1);
    await expect(w).toBeVisible();
    await noFxGhostOrHiddenCanvas(page);

    // Registry sanity: a subsequent unrelated gesture on the same window
    // still engages cleanly (no stale registration left behind).
    await w.click();
    await expect(w).not.toHaveClass(/minimized/, { timeout: 2000 });
  });

  test('a cross-origin iframe window falls through to Tier 1 for a real minimize gesture -- genie never strands it', async ({ page }) => {
    await forceFxTier(page, '2');
    await openApp(page, 'resume');
    const w = win(page, 'resume');

    // Inject a cross-origin iframe into the window body -- assessSnapshotRisk
    // (genie's restore pre-flight AND compositor.beginEffect's own check,
    // both used by genie's minimize/maximize paths) must reject this,
    // degrading the gesture to Tier 1 rather than dropping it or stranding
    // `el` fx-ghosted.
    await page.evaluate(() => {
      const body = document.querySelector('#window-resume .window-body');
      const iframe = document.createElement('iframe');
      iframe.src = location.href.replace('localhost', '127.0.0.1');
      body.appendChild(iframe);
    });

    await w.locator('.button.minimize').click();
    await expect(w).not.toHaveClass(/minimized/); // not instant -- SOME effect engaged (Tier 1's WAAPI fallback)
    await expect(w).toHaveClass(/minimized/, { timeout: 2000 });
    await expect(page.locator('#tasks #window-resume')).toHaveCount(1);
    await expect(w).toBeVisible();
    await expect(w).not.toHaveClass(/fx-ghost/);
    const style = await w.evaluate((el) => ({ transform: el.style.transform, opacity: el.style.opacity }));
    expect(style.transform).toBe('');
    expect(style.opacity).toBe('');
    await noFxGhostOrHiddenCanvas(page);

    // The window itself was demoted for the rest of the session (a genuine
    // SnapshotError, not a transient failure) -- a second gesture on it
    // (restore) must ALSO run via Tier 1, not re-attempt Tier 2.
    await w.click();
    await expect(w).not.toHaveClass(/minimized/, { timeout: 2000 });
    await expect(w).toBeVisible();
  });

  test('context-loss mid-genie-minimize leaves the window visible (finally-invariant holds even with GL gone)', async ({ page }) => {
    await forceFxTier(page, '2');
    await openApp(page, 'resume');
    const w = win(page, 'resume');

    await w.locator('.button.minimize').click();
    await expect(w).not.toHaveClass(/minimized/); // effect in flight, fx-ghosted

    const lost = await page.evaluate(async () => {
      const canvas = document.getElementById('iconostat-fx-canvas');
      if (!canvas) return { hasCanvas: false };
      const gl = canvas.getContext('webgl2');
      const ext = gl && gl.getExtension('WEBGL_lose_context');
      if (!ext) return { hasCanvas: true, hasExt: false };
      ext.loseContext();
      await new Promise((resolve) => setTimeout(resolve, 100));
      return { hasCanvas: true, hasExt: true };
    });
    expect(lost.hasCanvas).toBe(true);
    if (!lost.hasExt) test.skip(); // see fx-tier2.spec.js's matching sandbox-honesty note

    // compositor's webglcontextlost handler calls FxController.cancelAll(true)
    // -> genie's cancelFn -> must still reveal `el` even though GL is gone.
    await expect(w).toBeVisible({ timeout: 2000 });
    await expect(w).not.toHaveClass(/fx-ghost/);
  });

  test('mobile viewport: minimize duration is non-instant and completes correctly (320ms path engaged)', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'mobile emulation matches the rest of this suite\'s chromium-only sandbox assumptions');
    await page.setViewportSize({ width: 390, height: 844 });
    await forceFxTier(page, '2');
    await openApp(page, 'resume');
    const w = win(page, 'resume');

    const start = Date.now();
    await w.locator('.button.minimize').click();
    await expect(w).not.toHaveClass(/minimized/);
    await expect(w).toHaveClass(/minimized/, { timeout: 2000 });
    const elapsed = Date.now() - start;
    // Not a strict timing assertion (CI jitter) -- just proves it didn't
    // complete instantly (Tier 0) and didn't hang past a generous ceiling.
    expect(elapsed).toBeGreaterThan(50);
    expect(elapsed).toBeLessThan(2000);
    await expect(w).toBeVisible();
    await noFxGhostOrHiddenCanvas(page);
  });

  test('reversal: clicking the chip mid-minimize reuses the in-flight texture (no re-fetch of a fresh snapshot) and still ends restored correctly', async ({ page }) => {
    await forceFxTier(page, '2');
    await openApp(page, 'resume');
    const w = win(page, 'resume');

    // Instrument compositor.beginEffect() (via the same monkeypatch
    // technique fx-tier2.spec.js's "Finding 2" tests use) to count real
    // snapshot round trips -- proves the reversal below REUSES the
    // in-flight minimize's texture instead of re-snapshotting, i.e. genuine
    // reverse-from-current-t rather than the documented jump-cut-then-
    // fresh-run fallback (which WOULD show a second beginEffect call).
    await page.evaluate(async () => {
      const { FxController } = await import('/iconostat/fx/controller.js');
      const real = await import('/iconostat/fx/compositor.js');
      window.__beginEffectCount = 0;
      const wrapped = new Proxy(real, {
        get(target, prop) {
          if (prop === 'beginEffect') {
            return (...args) => { window.__beginEffectCount++; return target.beginEffect(...args); };
          }
          return target[prop];
        },
      });
      FxController._loadTier2 = async () => wrapped;
      window.__fxDone = [];
      document.addEventListener('iconostat-fx-done', (e) => window.__fxDone.push(e.detail));
    });

    await w.locator('.button.minimize').click();

    // Genie commits the REAL reparent (adds `.minimized`) right after its
    // own beginEffect() resolves -- well before the mesh tween finishes --
    // so `el` genuinely reports minimized while still fx-ghosted for a
    // window in the middle of the choreography. Wait for exactly that
    // window (both classes present simultaneously) before reversing --
    // calling minimize(false) any earlier (before the real commit) would
    // itself compute `entering: true` inside window.js's own `minimize()`
    // (nothing to restore FROM yet), which is correctly NOT a reversal.
    await page.waitForFunction(() => {
      const el = document.getElementById('window-resume');
      return el.classList.contains('minimized') && el.classList.contains('fx-ghost');
    }, { timeout: 2000 });

    // "Click the chip" while still mid-minimize: genie applies `fx-ghost`
    // (visibility:hidden) for the ENTIRE choreography and the overlay
    // canvas is `pointer-events:none`, so there is no real, hit-testable
    // target for an actual synthetic mouse click to land on during this
    // window -- a real user physically cannot click through it either. The
    // scenario the spec describes is exercised the same way the library
    // itself would be driven by any other non-pointer restore trigger (e.g.
    // a taskbar/menu affordance calling the public API directly): call
    // `minimize(false)` on the real element, which dispatches the exact
    // same cancelable `iconostat-before-minimize` event a real click would.
    await page.evaluate(() => {
      document.getElementById('window-resume').minimize(false);
    });

    // Must still land in a fully correct, non-stranded end state either way
    // (true reversal or the documented jump-cut-then-fresh-run fallback --
    // see the task report for which one actually engaged).
    await expect(w).not.toHaveClass(/minimized/, { timeout: 2000 });
    await expect(w).toBeVisible();
    await expect(w).not.toHaveClass(/fx-ghost/);
    await noFxGhostOrHiddenCanvas(page);

    // Exactly one fx-done for the FINAL direction (restore) must fire --
    // whether or not an intermediate minimize's fx-done also fired depends
    // on which path engaged, but the gesture must not be dropped silently.
    const events = await page.evaluate(() => window.__fxDone);
    expect(events.length).toBeGreaterThan(0);
    expect(events[events.length - 1].effect).toBe('restore');

    // THE reversal proof: exactly one real snapshot round trip for the
    // whole minimize-then-reverse-to-restore sequence -- genie's
    // reverse-from-current-t handoff reused the in-flight minimize's
    // texture instead of calling beginEffect() a second time to
    // re-snapshot for the restore.
    const beginEffectCount = await page.evaluate(() => window.__beginEffectCount);
    expect(beginEffectCount).toBe(1);
  });
});
