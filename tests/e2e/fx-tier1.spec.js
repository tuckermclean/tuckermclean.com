import { test, expect } from './fixtures.js';
import { openApp, win } from './helpers.js';

// Iconostat FX -- Tier 1 (WAAPI, no WebGL) + tier selection + cancellation.
// See docs/superpowers/specs/2026-08-11-iconostat-fx-design.md and
// .superpowers/sdd/2026-08-11-iconostat-fx-design/task-E-report.md.
//
// The default suite runs with `reducedMotion: 'reduce'` (playwright.config.js
// top-level `use`), which forces Tier 0 -- fx never engages there. These
// tests opt back into effects via `test.use({ reducedMotion: 'no-preference' })`
// and force a specific tier via localStorage (set BEFORE navigation, so it's
// present when the controller's bootstrap `init()` runs at load).

async function forceFxTier(page, tier) {
  await page.addInitScript((t) => {
    window.localStorage.setItem('iconostat-fx-tier', t);
  }, tier);
}

const noFxGhostOrCanvas = async (page) => {
  expect(await page.locator('.fx-ghost').count()).toBe(0);
  expect(await page.locator('canvas#iconostat-fx-canvas').count()).toBe(0);
};

test.describe('Tier 0 (reduced motion, the default suite config)', () => {
  test('minimizing a window is instant and leaves no fx-ghost/canvas (Tier 0 proof)', async ({ page }) => {
    await openApp(page, 'resume');
    const w = win(page, 'resume');

    await w.locator('.button.minimize').click();

    // No animation to await: Tier 0 never preventDefault()s, so the real
    // minimize() has already run synchronously inside the click handler.
    await expect(w).toHaveClass(/minimized/);
    await expect(page.locator('#tasks #window-resume')).toHaveCount(1);
    await expect(page.locator('body > #window-resume')).toHaveCount(0);
    await noFxGhostOrCanvas(page);

    // fx.css is only injected by FxController.init() when tier > 0 -- at
    // Tier 0, init() returns before ever touching the DOM.
    expect(await page.locator('link[href*="/iconostat/fx/fx.css"]').count()).toBe(0);
  });
});

test.describe('Tier 1 (forced, no-preference)', () => {
  test.use({ reducedMotion: 'no-preference' });
  // See fixtures.js's `autoReducedMotion` fixture: the context-level option
  // above doesn't reliably reach `matchMedia` in this sandbox's Chromium, so
  // explicitly re-emulate here too (runs after that auto-fixture, before
  // openApp() navigates below).
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
  });

  test('the dynamic import actually resolves at runtime and the controller listens', async ({ page }) => {
    await forceFxTier(page, '1');

    const controllerResponse = page.waitForResponse((r) => r.url().endsWith('/iconostat/fx/controller.js'));
    await openApp(page, 'resume');
    const res = await controllerResponse;
    expect(res.ok()).toBe(true);

    // Proof it's not just fetched but actually evaluated/running: fx.css
    // (injected only from inside controller.js's init()) is present, and a
    // real user minimize is intercepted (preventDefault'ed, i.e. NOT
    // synchronously instant -- see the next test for the full round trip).
    await expect(page.locator('link[href*="/iconostat/fx/fx.css"]')).toHaveCount(1);
  });

  test('a user minimize ends in the correct minimized state with no stranded fx-ghost/visibility:hidden (finally invariant)', async ({ page }) => {
    await forceFxTier(page, '1');
    await openApp(page, 'resume');
    const w = win(page, 'resume');

    await w.locator('.button.minimize').click();

    // Tier 1 defers the real reparent to the end of the ~250ms animation --
    // assert it is NOT instant (proves the effect actually engaged), then
    // assert the eventual, correct end state.
    await expect(w).not.toHaveClass(/minimized/);

    await expect(w).toHaveClass(/minimized/, { timeout: 2000 });
    await expect(page.locator('#tasks #window-resume')).toHaveCount(1);
    await expect(page.locator('body > #window-resume')).toHaveCount(0);
    await expect(w).toBeVisible(); // never stranded visibility:hidden
    await expect(w).not.toHaveClass(/fx-ghost/);
    const style = await w.evaluate((el) => ({ transform: el.style.transform, opacity: el.style.opacity }));
    expect(style.transform).toBe('');
    expect(style.opacity).toBe('');
    await noFxGhostOrCanvas(page);

    // Round-trip: restore also completes correctly with no residue.
    await w.click();
    await expect(w).not.toHaveClass(/minimized/, { timeout: 2000 });
    await expect(w).toBeVisible();
    const style2 = await w.evaluate((el) => ({ transform: el.style.transform, opacity: el.style.opacity }));
    expect(style2.transform).toBe('');
    expect(style2.opacity).toBe('');
  });

  test('a real chip click restores via exactly one userGesture:true before-minimize and completes cleanly (Tier-1)', async ({ page }) => {
    await forceFxTier(page, '1');
    await openApp(page, 'resume');
    const w = win(page, 'resume');

    await w.locator('.button.minimize').click();
    await expect(w).toHaveClass(/minimized/, { timeout: 2000 });

    await page.evaluate(() => {
      window.__restoreEvents = [];
      document.addEventListener('iconostat-before-minimize', (e) => {
        if (e.detail.entering === false) {
          window.__restoreEvents.push({ userGesture: e.detail.userGesture });
        }
      });
    });

    await w.click();
    await expect(w).not.toHaveClass(/minimized/, { timeout: 2000 });
    await expect(w).toBeVisible();
    await expect(w).not.toHaveClass(/fx-ghost/);
    const style = await w.evaluate((el) => ({ transform: el.style.transform, opacity: el.style.opacity }));
    expect(style.transform).toBe('');
    expect(style.opacity).toBe('');
    await noFxGhostOrCanvas(page);

    const restoreEvents = await page.evaluate(() => window.__restoreEvents);
    expect(restoreEvents.length).toBe(1);
    expect(restoreEvents[0].userGesture).toBe(true);
  });

  test('a rapid re-grab (re-wobble) within the settle window drags cleanly and leaves the registry consistent', async ({ page }) => {
    await forceFxTier(page, '1');
    await openApp(page, 'resume');
    const w = win(page, 'resume');

    const box1 = await w.locator('.window-header').boundingBox();
    await page.mouse.move(box1.x + box1.width / 2, box1.y + box1.height / 2);
    await page.mouse.down();
    await page.mouse.move(box1.x + box1.width / 2 + 100, box1.y + box1.height / 2 + 60, { steps: 8 });
    await page.mouse.up(); // ends drag 1 -- kicks off the ~220ms settle-back animation

    // Immediately (well within the settle window) re-grab the SAME window
    // and drag again -- this is defect 2's repro: a still in-flight prior
    // wobble's cancel closure used to delete the new drag's just-published
    // dragState entry (WeakMap keyed only by the element), so every
    // subsequent dragMove would silently no-op.
    const box2 = await w.locator('.window-header').boundingBox();
    await page.mouse.move(box2.x + box2.width / 2, box2.y + box2.height / 2);
    await page.mouse.down();

    const beforeMove = await w.evaluate((el) => el.style.transform);
    await page.mouse.move(box2.x + box2.width / 2 - 120, box2.y + box2.height / 2 + 90, { steps: 8 });
    const duringMove = await w.evaluate((el) => el.style.transform);
    // The second wobble must actually engage -- the transform must actually
    // change during the move, proving dragMove found a live dragState entry
    // instead of no-op'ing.
    expect(duringMove).not.toBe('');
    expect(duringMove).not.toBe(beforeMove);

    await page.mouse.up();

    // finally-invariant: settles back to identity, no stranded transform.
    await expect(async () => {
      expect(await w.evaluate((el) => el.style.transform)).toBe('');
    }).toPass({ timeout: 2000 });
    await expect(w).toBeVisible();
    await expect(page.locator('body > #window-resume')).toHaveCount(1);
    await noFxGhostOrCanvas(page);

    // Registry sanity: the controller's in-flight registration for this
    // element wasn't left stranded by a stale settle()/cancel closure --
    // an unrelated minimize right after still engages the Tier-1 effect
    // normally.
    await w.locator('.button.minimize').click();
    await expect(w).toHaveClass(/minimized/, { timeout: 2000 });
  });

  test('FxController.setTier persists and a subsequent gesture honors it without reload', async ({ page }) => {
    await openApp(page, 'resume'); // default 'auto' setting

    await page.evaluate(() => window.setFxTier('0'));
    expect(await page.evaluate(() => localStorage.getItem('iconostat-fx-tier'))).toBe('0');

    // Tier 0 (just set, same page, no reload): a gesture is instant.
    await win(page, 'resume').locator('.button.minimize').click();
    await expect(win(page, 'resume')).toHaveClass(/minimized/);
    await win(page, 'resume').click(); // restore, back to a clean baseline
    await expect(win(page, 'resume')).not.toHaveClass(/minimized/);

    await page.evaluate(() => window.setFxTier('1'));
    expect(await page.evaluate(() => localStorage.getItem('iconostat-fx-tier'))).toBe('1');

    // Tier 1 (just set, same page, no reload): the very next gesture is
    // intercepted (not instant) and completes correctly.
    await win(page, 'resume').locator('.button.minimize').click();
    await expect(win(page, 'resume')).not.toHaveClass(/minimized/);
    await expect(win(page, 'resume')).toHaveClass(/minimized/, { timeout: 2000 });
    await noFxGhostOrCanvas(page);
  });

  test('a cascade() during a Tier-1 minimize jump-cuts to the correct end state', async ({ page }) => {
    await forceFxTier(page, '1');
    await openApp(page, 'resume');
    const w = win(page, 'resume');

    await w.locator('.button.minimize').click();
    await expect(w).not.toHaveClass(/minimized/); // effect is in flight

    // Same non-fx sequence characterized in fx-seams.spec.js: cascade()
    // called immediately after a minimize click. Under Tier 0 the click
    // would have already completed synchronously, so cascade() would see the
    // window minimized and un-minimize+reset it -- the window ends up OPEN.
    // Our in-flight Tier-1 effect must jump-cut to that same end state, not
    // fight it or strand the window mid-transform.
    await page.evaluate(() => document.querySelector('iconostat-desktop').cascade());

    await expect(w).not.toHaveClass(/minimized/);
    await expect(w).toBeVisible();
    await expect(page.locator('body > #window-resume')).toHaveCount(1);
    const style = await w.evaluate((el) => ({ transform: el.style.transform, opacity: el.style.opacity }));
    expect(style.transform).toBe('');
    expect(style.opacity).toBe('');
    await noFxGhostOrCanvas(page);

    // The library's own state is consistent too: no leftover in-flight
    // registration (a second, unrelated minimize on the same window works
    // cleanly right after).
    await w.locator('.button.minimize').click();
    await expect(w).toHaveClass(/minimized/, { timeout: 2000 });
  });

  test('maximize/restore and drag-wobble complete cleanly with no leftover transform', async ({ page }) => {
    await forceFxTier(page, '1');
    await openApp(page, 'resume');
    const w = win(page, 'resume');

    await w.locator('.button.maximize').click();
    await expect(w).toHaveClass(/maximized/, { timeout: 2000 });
    expect(await w.evaluate((el) => el.style.transform)).toBe('');

    await w.locator('.button.maximize').click();
    await expect(w).not.toHaveClass(/maximized/, { timeout: 2000 });
    expect(await w.evaluate((el) => el.style.transform)).toBe('');

    // Wobble: dragging the header layers a decorative transform that must
    // settle back to identity (no stray leftover) after drag-end.
    const box = await w.locator('.window-header').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2 + 60, { steps: 8 });
    await page.mouse.up();
    await expect(async () => {
      expect(await w.evaluate((el) => el.style.transform)).toBe('');
    }).toPass({ timeout: 2000 });
  });

  test('a viewport resize during a Tier-1 minimize jump-cuts by completing it instantly', async ({ page }) => {
    await forceFxTier(page, '1');
    await openApp(page, 'resume');
    const w = win(page, 'resume');

    await w.locator('.button.minimize').click();
    await expect(w).not.toHaveClass(/minimized/); // effect is in flight

    // Nothing else has touched `w` yet (unlike the cascade() case above), so
    // a resize/orientationchange jump-cut means "finish the operation now".
    await page.setViewportSize({ width: 1000, height: 800 });

    await expect(w).toHaveClass(/minimized/, { timeout: 2000 });
    await expect(page.locator('#tasks #window-resume')).toHaveCount(1);
    await expect(w).toBeVisible();
    await noFxGhostOrCanvas(page);
  });
});
