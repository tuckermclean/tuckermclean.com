import { test, expect } from './fixtures.js';
import { openApp, win } from './helpers.js';

// Iconostat FX -- perf budget record (task-F-brief.md Part 2 #5).
//
// Spec threshold (docs/superpowers/specs/2026-08-11-iconostat-fx-design.md,
// Agent B task 4): compositor.js's warmup probe renders an offscreen 8x40
// mesh ~10 frames at init; median frame time > 8ms -> "demote to Tier 1".
// That threshold and the demote-on-exceed WIRING are exactly what this file
// can honestly verify in this sandbox.
//
// SANDBOX HONESTY (read before treating any number here as a real-hardware
// perf verdict): this suite runs on a shimmed/software-rendered headless
// Chromium (SwiftShader-class software GL -- see this repo's other fx specs'
// matching notes, and the literal "GPU stall due to ReadPixels" driver
// warnings observed in this sandbox during development of this file). A
// software rasterizer's per-frame cost for an 8x40 textured mesh has NO
// fixed relationship to a real GPU's cost for the same work -- it can be
// slower (no hardware acceleration) in ways that make an 8ms/frame budget
// look catastrophically missed even though real target hardware (the
// "reference runner" the spec's CI language refers to) would sail under it
// with margin. This file does NOT assert a pass/fail fps budget -- it
// records the actual numbers this environment produces, proves the
// warmup-verdict WIRING itself (capable vs. demote, and that a real
// 'demote' verdict correctly drops `FxController.tier` session-wide) works
// correctly end-to-end, and documents that a hardware-accurate perf
// assertion needs a real (or real-driver) GPU runner -- which this sandbox
// is not. See task-F-report.md's Perf Budget section for the recorded
// numbers from this sandbox and the exact threshold a real-hardware CI run
// should assert.

test.describe('Perf budget (forced Tier 2, no-preference)', () => {
  test.use({ reducedMotion: 'no-preference' });
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
  });

  test('the REAL (unforced) warmup probe runs end-to-end and its verdict correctly drives the session tier', async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem('iconostat-fx-tier', '2'));
    await openApp(page, 'resume');

    // Time the whole (real, un-mocked) warmup() call -- it internally runs
    // 10 gl.finish()-synchronized frames of an offscreen 8x40 mesh (see
    // compositor.js's runWarmupProbe) before resolving, so
    // wall-clock-total/10 is an honest (if coarser than compositor.js's own
    // internal per-frame median) proxy for "roughly what one frame of this
    // work costs on this box's GL stack" -- reported, not asserted against
    // a pass/fail budget, per the sandbox-honesty note above.
    const result = await page.evaluate(async () => {
      const compositor = await import('/iconostat/fx/compositor.js');
      const t0 = performance.now();
      const verdict = await compositor.warmup();
      const totalMs = performance.now() - t0;
      const { FxController } = await import('/iconostat/fx/controller.js');
      return { verdict, totalMs, approxPerFrameMs: totalMs / 10, tierAfter: FxController.tier };
    });

    console.log(`[fx perf budget] sandbox warmup verdict=${result.verdict} totalMs=${result.totalMs.toFixed(2)} approxPerFrameMs=${result.approxPerFrameMs.toFixed(2)} (spec threshold: median > 8ms/frame -> demote)`);
    test.info().annotations.push({
      type: 'fx-perf-budget',
      description: `verdict=${result.verdict} totalMs=${result.totalMs.toFixed(2)} approxPerFrameMs=${result.approxPerFrameMs.toFixed(2)} threshold=8ms/frame-median`,
    });

    expect(['ok', 'demote']).toContain(result.verdict);

    // Wiring proof, not a hardware claim: whatever this sandbox's GL stack
    // actually measured, controller.js's own demote path must have applied
    // it session-wide correctly (mirrors the forced-verdict test in
    // fx-tier2.spec.js, but against the REAL probe result instead of
    // `{forceVerdict}`).
    if (result.verdict === 'demote') {
      expect(result.tierAfter).toBe(1);
    } else {
      expect(result.tierAfter).toBe(2);
    }
  });

  test('a representative Tier-2 effect (genie minimize) completes and its wall-clock duration is recorded (not asserted against a real-fps budget)', async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem('iconostat-fx-tier', '2'));
    await openApp(page, 'resume');
    const w = win(page, 'resume');

    // Warm the compositor first (excludes the one-time module-fetch +
    // warmup-probe cost from the measured gesture, matching how a real user
    // session amortizes it over the FIRST gesture only).
    await page.evaluate(async () => { await (await import('/iconostat/fx/compositor.js')).warmup(); });

    const t0 = Date.now();
    await w.locator('.button.minimize').click();
    await expect(w).toHaveClass(/minimized/, { timeout: 3000 });
    const elapsedMs = Date.now() - t0;

    console.log(`[fx perf budget] genie minimize (desktop, 400ms target) observed wall-clock=${elapsedMs}ms`);
    test.info().annotations.push({ type: 'fx-perf-budget', description: `genie-minimize wall-clock=${elapsedMs}ms (target 400ms + real-browser/test overhead)` });

    // Sanity bound only (catches a genuine hang/regression, not a real fps
    // assertion): well above the 400ms animation target to absorb
    // click-dispatch + snapshot-round-trip overhead, well below "stuck".
    expect(elapsedMs).toBeLessThan(3000);
    await expect(w).toBeVisible();
    await expect(w).not.toHaveClass(/fx-ghost/);
  });
});
