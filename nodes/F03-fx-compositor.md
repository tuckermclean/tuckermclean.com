# F03 — fx-compositor

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| done | T01, F01, F02 | F04, F05, F06, S02 | L |

**Owns:** `assets/iconostat/fx/compositor.js`, `tests/unit/compositor.test.js`,
`tests/unit/compositor-warmup-failure.test.js`, `tests/unit/compositor-begin-effect-race.test.js`,
`tests/e2e/fx-tier2.spec.js`, `tests/e2e/fx-tier2-orientation.spec.js`, `tests/e2e/fx-perf-budget.spec.js`

## Purpose

The Tier 2 WebGL2 compositor of Iconostat FX, which the controller (F01) loads on the first Tier 2 gesture and
hands to genie (F04) and wobble (F05). It owns one shared, fixed, full-viewport `<canvas id="iconostat-fx-canvas">`
(`pointer-events: none`, hidden while no effect runs) and its WebGL2 context:

- `warmup({ forceVerdict })`: a probe, once per page, that draws an 8×40 mesh ten times and resolves to `'demote'`
  when the median frame takes more than 8 ms (or when anything fails) and to `'ok'` otherwise; the controller
  drops the session to Tier 1 on `'demote'`. `forceVerdict` is a test seam that sets the cached verdict without
  touching GL.
- `beginEffect(el)`: snapshots the window (F02), uploads the raster as a texture, adds `fx-ghost` to the window
  (F01's `fx.css` hides it) and shows the canvas above every window (`z-index` of the desktop's counter plus 10).
  It rejects with `SnapshotError` before touching the window when the snapshot or the GL set-up fails, and with
  `EffectSupersededError` when a newer `beginEffect()` for the same window started meanwhile.
- `endEffect(el)`: removes `fx-ghost`, releases the texture and hides the canvas once no effect holds it; a second
  call is a no-op.
- `drawMesh({ texture, positions, cols, rows, opacity })`: draws the texture on a grid of vertex positions in
  viewport CSS pixels, with the UVs fixed at each vertex's rest fraction, clearing the canvas once per animation
  frame so several effects can share it; `uploadTexture()` and `releaseTexture()` for extra textures.
- A `webglcontextlost` listener that hides the canvas and calls `FxController.cancelAll(true)`, so every effect
  reveals its window, and a `webglcontextrestored` listener that rebuilds the context and swallows a failure.

It imports `snapshot.js` (F02) and `controller.js` (F01) only. Hugo builds it as `/iconostat/fx/compositor.js`
(the site's `layouts/home.html`).

## Tests

- `tests/unit/compositor.test.js` (vitest, jsdom, which has no WebGL2): the warmup's verdict without WebGL2, its
  cache and `forceVerdict`.
- `tests/unit/compositor-warmup-failure.test.js`: the warmup with a fake WebGL2 context whose shader compile
  fails.
- `tests/unit/compositor-begin-effect-race.test.js`: two `beginEffect()` calls for one element whose snapshots
  resolve in reverse order, with a fake working WebGL2 context and a mocked `snapshot()`.
- `tests/e2e/fx-tier2.spec.js` (Playwright, `desktop`): one Tier 0 test and eleven Tier 2 tests on the site's page.
  Several drive whole gestures through the controller and genie (F04): `:102`, `:146`, `:380` and `:468`, whose
  comments still describe genie as missing.
- `tests/e2e/fx-tier2-orientation.spec.js`: draws a red-over-blue texture through `drawMesh()` and reads the
  canvas back.
- `tests/e2e/fx-perf-budget.spec.js`: runs the real warmup and times a genie minimize, recording the numbers.

## Changes

none: imported

## Gate

- **F03-AC-1** — Without WebGL2, `warmup()` resolves to `'demote'`, and the canvas it creates (`#iconostat-fx-canvas`) stays `display: none`. *Verify:* `CI=true npx vitest run tests/unit/compositor.test.js`.
- **F03-AC-2** — `warmup()` returns the same promise on a second call, and `warmup({ forceVerdict })` resolves to the given verdict without creating a canvas. *Verify:* `CI=true npx vitest run tests/unit/compositor.test.js`.
- **F03-AC-3** — When the WebGL2 set-up throws (a shader that fails to compile), `warmup()` resolves to `'demote'` and does not reject, and the canvas stays hidden. *Verify:* `CI=true npx vitest run tests/unit/compositor-warmup-failure.test.js`.
- **F03-AC-4** — In the browser, the real `warmup()` resolves to `'ok'` or `'demote'`. *Verify:* `CI=true npx playwright test tests/e2e/fx-perf-budget.spec.js:38`.
- **F03-AC-5** — The probe draws an 8×40 mesh ten times and demotes when the median frame takes more than 8 ms. *Verify:* unpinned: `tests/e2e/fx-perf-budget.spec.js:38` accepts either verdict.
- **F03-AC-6** — A cached `'demote'` verdict makes the controller drop the session to Tier 1 on the first Tier 2 gesture, which still ends minimized and visible. *Verify:* `CI=true npx playwright test tests/e2e/fx-tier2.spec.js:169`.
- **F03-AC-7** — When the WebGL2 set-up fails in the browser, the first Tier 2 gesture ends through Tier 1 with the session at Tier 1, and the next gestures (a restore, a maximize) still complete. *Verify:* `CI=true npx playwright test tests/e2e/fx-tier2.spec.js:307`.
- **F03-AC-8** — Of two `beginEffect(el)` calls for one element, the older rejects with `EffectSupersededError` when its snapshot resolves after the newer call's, and leaves the newer call's texture, the shown canvas and `fx-ghost` untouched; `endEffect(el)` then releases only the winner's texture, removes `fx-ghost` and hides the canvas, and a second `endEffect(el)` releases nothing. *Verify:* `CI=true npx vitest run tests/unit/compositor-begin-effect-race.test.js`.
- **F03-AC-9** — With two windows in effects at once, ending one of them twice leaves the canvas shown and the other window ghosted, and the canvas hides once the other ends. *Verify:* `CI=true npx playwright test tests/e2e/fx-tier2.spec.js:409`.
- **F03-AC-10** — `beginEffect()` of an element holding a cross-origin iframe rejects with `SnapshotError` (as `snapshot()` does) and adds no `fx-ghost` class and no canvas. *Verify:* `CI=true npx playwright test tests/e2e/fx-tier2.spec.js:192`.
- **F03-AC-11** — When the WebGL2 set-up fails at `beginEffect()`, it rejects with `SnapshotError` and adds no `fx-ghost` class. *Verify:* `CI=true npx playwright test tests/e2e/fx-tier2.spec.js:351`.
- **F03-AC-12** — A `webglcontextlost` on the canvas calls `FxController.cancelAll(true)`, so a registered effect's cancel function runs and its window is revealed. *Verify:* `CI=true npx playwright test tests/e2e/fx-tier2.spec.js:243`.
- **F03-AC-13** — A texture drawn with `drawMesh()` is upright: the top row of the source lands at the top of the mesh. *Verify:* `CI=true npx playwright test tests/e2e/fx-tier2-orientation.spec.js`.
- **F03-AC-14** — Hugo serves `/iconostat/fx/compositor.js` and `/iconostat/fx/snapshot.js`, and they export `beginEffect`, `endEffect`, `drawMesh`, `warmup`, `snapshot` and `SnapshotError`. *Verify:* `CI=true npx playwright test tests/e2e/fx-tier2.spec.js:57`.
- **F03-AC-15** — The compositor is fetched only on the first Tier 2 gesture, never at Tier 0. *Verify:* unpinned: `tests/e2e/fx-tier2.spec.js:57` waits for the response from before the page loads, and `:36` checks only that no canvas exists.
- **F03-AC-16** — `beginEffect()` sizes the canvas to the viewport at `computeDprCap()` and puts it at the desktop's `zIndex` plus 10; `drawMesh()` throws for `cols` or `rows` below 2 or a `positions` array of the wrong length, draws nothing while the context is lost, and clears the canvas once per animation frame; a `webglcontextlost` hides the canvas; a `webglcontextrestored` rebuilds the context and swallows a failure. *Verify:* unpinned: no test reads the canvas's size or `z-index`, `tests/e2e/fx-tier2.spec.js:243` passes with the hiding removed (no effect had shown the canvas), no test calls `drawMesh()` with bad arguments or draws two meshes in one frame, and F06's `tests/e2e/fx-context-loss-integration.spec.js:34` restores the context without checking for an error.
- **F03-AC-17** — `compositor.js` imports only `./snapshot.js` and `./controller.js`. *Verify:* unpinned: no test checks the imports.

## Risks

- The probe's 8 ms threshold is not tested, and `tests/e2e/fx-perf-budget.spec.js:38` calls `warmup()` directly,
  so its check that the tier follows the verdict does not go through the controller: a `'demote'` verdict would
  fail that check, not prove the demotion.
- `tests/e2e/fx-tier2.spec.js:102` and `:146` are titled and commented as the "genie absent" fallthrough, but genie
  exists, so they now run genie. `tests/e2e/fx-perf-budget.spec.js:78` also times a genie minimize. A change to
  F04 can fail these tests of this node.
- The canvas and the GL state are module-level singletons: one canvas per page, created on the first warmup and
  never removed.
- jsdom has no WebGL2, so the unit tests use hand-written fake contexts; a change to the GL calls the fakes do not
  provide fails those tests without a real defect.
- The comments of the end-to-end specs say the headless Chromium they run in renders a foreignObject blank, so no
  test checks what a window looks like on the canvas.
