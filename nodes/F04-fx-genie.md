# F04 — fx-genie

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| done | T01, I02, F01, F02, F03 | F05, F06, S02 | L |

**Owns:** `assets/iconostat/fx/genie.js`, `tests/unit/genie.test.js`, `tests/unit/fx-supersede-handling.test.js`,
`tests/e2e/fx-tier2-genie.spec.js`

## Purpose

The Tier 2 "genie" effect of Iconostat FX: minimize, restore, maximize and unmaximize drawn as a warped mesh on
the compositor's shared canvas (F03) while the real window is hidden. The controller (F01) calls
`run(controller, compositor, el, kind, entering)` for a Tier 2 window.

- **Minimize**: `beginEffect()` snapshots the open window and hides it, then the real
  `minimize(true, { silent: true })` (I02) moves it into the taskbar while hidden, and an 8×40 mesh pours from
  the window's box into the chip's box (400 ms, 320 ms at a viewport 768 wide or less, ease-in) before
  `endEffect()` reveals the chip.
- **Restore**: after a synchronous risk check (F02's `assessSnapshotRisk`), it commits the real restore first,
  starts the snapshot and adds `fx-ghost` in the same turn, so the open window is never painted before the mesh
  takes over, then pours from the chip back to the window (ease-out). A failure after the commit minimizes the
  window again before the error goes to the controller.
- **Maximize and unmaximize**: the snapshot comes first, then the real `maximize()`, then a softer warp over
  150 ms.

`buildMeshPositions(u, rectA, rectB, cols, rows, curvature)` gives the mesh at progress `u`: the rows pinch toward
the target's width along a cubic Bezier neck, strongest at the bottom, and travel toward the target with the
bottom rows leading. Each run registers a cancel function with the controller; a cancel with `jumpToEnd` before
the real op committed commits it, and every end reveals the window and dispatches `iconostat-fx-done`. An
opposite-direction run while one is in flight takes over its texture and continues from `1 - u`; a same-direction
run while one is in flight waits for it instead of committing twice. When `beginEffect()` rejects with
`EffectSupersededError`, a run gives up quietly. Any other error ends the run and goes to the controller, which
runs the gesture through Tier 1.

`genie.js` imports only `assessSnapshotRisk` from `snapshot.js` (F02). Hugo builds it as `/iconostat/fx/genie.js`.

## Tests

- `tests/unit/genie.test.js` (vitest): `buildMeshPositions`, the easing functions and `minimizeDuration`.
- `tests/unit/fx-supersede-handling.test.js` (vitest): `genie.run()` and F05's `wobble.dragStart()` with a fake
  compositor whose `beginEffect()` rejects with `EffectSupersededError`.
- `tests/e2e/fx-tier2-genie.spec.js` (Playwright, `desktop`): ten tests with Tier 2 stored and no reduced motion.
  `:235` is listed in `gate.known_red` (`SPEC.md` D6).

## Changes

none: imported

## Gate

- **F04-AC-1** — `buildMeshPositions()` returns a `Float32Array` of `cols * rows * 2` row-major positions that equal `rectA`'s rest grid at `u = 0` and `rectB`'s at `u = 1`, and does not divide by zero for a 1×1 grid. *Verify:* `CI=true npx vitest run tests/unit/genie.test.js`.
- **F04-AC-2** — Mid-way, the bottom row of the mesh is nearer `rectB`'s width than the top row, and a curvature of 0.4 pinches less than a curvature of 1. *Verify:* `CI=true npx vitest run tests/unit/genie.test.js`.
- **F04-AC-3** — Each row starts toward the target later the higher it is (the top row lags the bottom by 0.55 of the second phase). *Verify:* unpinned: with no lag, `tests/unit/genie.test.js` still passes, because its pour test measures both rows from `rectA`'s top.
- **F04-AC-4** — `easeInCubic` and `easeOutCubic` map 0 to 0 and 1 to 1, the first below and the second above 0.5 at 0.5; `minimizeDuration()` is 400 ms on a viewport wider than 768 and 320 ms at 768 or less. *Verify:* `CI=true npx vitest run tests/unit/genie.test.js`.
- **F04-AC-5** — A Tier 2 user minimize is not instant, shows `#iconostat-fx-canvas` while it runs, and ends with the window minimized in the taskbar, visible, without `fx-ghost`, and the canvas hidden. *Verify:* `CI=true npx playwright test tests/e2e/fx-tier2-genie.spec.js:61`.
- **F04-AC-6** — A Tier 2 minimize and a chip-click restore dispatch exactly two `iconostat-fx-done` events, `{ name, effect: 'minimize' }` then `{ name, effect: 'restore' }`, and the restored window has its old inline `width`, `height`, `top` and `left`, the `front` class and an inline `z-index`. *Verify:* `CI=true npx playwright test tests/e2e/fx-tier2-genie.spec.js:91`.
- **F04-AC-7** — A Tier 2 maximize and unmaximize are not instant, keep the window a child of `body`, end visible without `fx-ghost`, and dispatch `iconostat-fx-done` with `maximize` then `unmaximize`. *Verify:* `CI=true npx playwright test tests/e2e/fx-tier2-genie.spec.js:128`.
- **F04-AC-8** — A viewport resize during a Tier 2 minimize ends with the window minimized in the taskbar, visible, the canvas hidden, and a later restore still runs. *Verify:* `CI=true npx playwright test tests/e2e/fx-tier2-genie.spec.js:168`.
- **F04-AC-9** — A cancel with `jumpToEnd` that lands before the real op committed commits it, unless the window is already in the target state. *Verify:* unpinned: whether the resize of `tests/e2e/fx-tier2-genie.spec.js:168` lands before the commit depends on the snapshot's timing.
- **F04-AC-10** — When `beginEffect()` rejects with a `SnapshotError` (a window holding a cross-origin iframe), the run reveals nothing it did not hide and rethrows, so the minimize and the later restore run through Tier 1 and end correct. *Verify:* `CI=true npx playwright test tests/e2e/fx-tier2-genie.spec.js:199`.
- **F04-AC-11** — A context loss during a Tier 2 minimize leaves the window visible without `fx-ghost`. *Verify:* unpinned: `tests/e2e/fx-tier2-genie.spec.js:235` (listed in `gate.known_red`) still passes with the reveal removed from the run's cancel path, because the loss can land while the snapshot is pending, where the run reveals the window on its own.
- **F04-AC-12** — A restore requested while a Tier 2 minimize is past its commit takes over the minimize's texture: the whole sequence calls `beginEffect()` once and ends restored, visible, with `restore` as the last `iconostat-fx-done`. *Verify:* `CI=true npx playwright test tests/e2e/fx-tier2-genie.spec.js:282`.
- **F04-AC-13** — Two minimize calls in one turn produce one minimize and one `iconostat-fx-done`, and two restore calls one restore, and the window keeps its inline geometry through both. *Verify:* `CI=true npx playwright test tests/e2e/fx-tier2-genie.spec.js:363`.
- **F04-AC-14** — When `beginEffect()` rejects with `EffectSupersededError`, `run()` resolves without calling `endEffect()` or dispatching `iconostat-fx-done`: a maximize does not call `maximize()`, and a restore keeps the restore it already committed. *Verify:* `CI=true npx vitest run tests/unit/fx-supersede-handling.test.js`.
- **F04-AC-15** — A restore never shows the opened window before the mesh: `fx-ghost` is added in the same turn as the commit. *Verify:* unpinned: no test can see a single painted frame.
- **F04-AC-16** — A failure of a restore after its commit (past the risk check) minimizes the window again before the error goes to the controller. *Verify:* unpinned: no test makes the snapshot fail after the risk check.
- **F04-AC-17** — At a viewport 768 wide or less the mesh of a Tier 2 minimize runs for 320 ms. *Verify:* unpinned: `tests/e2e/fx-tier2-genie.spec.js:262` times only until the `minimized` class, which genie commits before the mesh runs, and still passes with a 3 s mobile duration.
- **F04-AC-18** — `genie.js` imports only `assessSnapshotRisk` from `./snapshot.js`. *Verify:* unpinned: no test checks the imports.

## Risks

- `tests/e2e/fx-tier2-genie.spec.js:235` can fail both attempts in CI and is listed in `gate.known_red`
  (`SPEC.md` D6), and it does not pin F04-AC-11.
- Genie has no interference observer like Tier 1's: a `cascade()` or `tile()` during a restore or maximize is not
  noticed, and the mesh runs out its duration over the already reset window (F06 pins that the window still ends
  revealed).
- The reversal test reaches the reversal by calling `minimize(false)` directly: while ghosted, the chip cannot be
  clicked.
- The duration and the 768 breakpoint repeat those of F02 and F05.
