# F01 — fx-controller

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| done | T01, I02 | F03, F04, F05, F06 | L |

**Owns:** `assets/iconostat/fx/controller.js`, `assets/iconostat/fx/tier1.js`, `assets/iconostat/fx/fx.css`,
`tests/unit/fx-controller-loadtier2.test.js`, `tests/unit/fx-controller-tier2.test.js`, `tests/unit/stubs/`,
`tests/e2e/fx-tier1.spec.js`, `tests/e2e/fx-seams.spec.js`

## Purpose

The coordination hub of Iconostat FX, the optional window effects layered on the window manager (I02) through its
seam events, and the Tier 1 effects it falls back to. `SPEC.md` principle 4 governs it: reduced motion means
Tier 0, and a failed effect degrades and never strands a window.

`controller.js` exports `FxController`. `init(desktop, { tierOverride })` picks the session tier once: 0 when the
user asks for reduced motion, otherwise the stored `iconostat-fx-tier` setting (`'0'`, `'1'`, `'2'` or `'auto'`),
where `'2'` and `'auto'` mean Tier 2 when a WebGL2 context can be created and Tier 1 otherwise. At Tier 0 it does
nothing else. Above it, it adds a `<link>` to `fx.css` and listens on `document` for the seam events:

- a cancelable `iconostat-before-minimize` or `iconostat-before-maximize` with `userGesture: true` is
  `preventDefault()`ed and handed to an effect, which commits the real `minimize()`/`maximize()` itself with
  `{ silent: true }`; a programmatic one (`userGesture: false`, the bulk layouts) is left alone and cancels every
  running effect;
- the drag events go to the drag effect; `iconostat-resize-start` cancels that window's effect; a viewport
  `resize` or `orientationchange` cancels every effect.

Each running effect registers a cancel function per window (`registerEffect`), so a second effect on the same
window cancels the first and `cancelAll(jumpToEnd)` reaches them all. `tierFor(win)` is the session tier capped
by a per-window ceiling that `demote(win, tier)` sets. For a Tier 2 window the controller loads `compositor.js`
(F03) once, applies its warmup verdict, then `genie.js` (F04) or `wobble.js` (F05); a missing module, a
`SnapshotError` (which also demotes the window to Tier 1) or any other error falls through to Tier 1 for that
gesture. `setTier(value)` stores a new setting and applies it to the next gesture without a reload.

`tier1.js` is Tier 1: Web Animations on the real element, with no canvas and no snapshot. A minimize animates the
window toward the measured taskbar chip and commits at the end; a restore and a maximize commit first and animate
from the old box; a drag skews and stretches the window by the pointer's velocity and springs back on release. A
`MutationObserver` on each animated window abandons the effect when other code changes its class or style
mid-way (a `cascade()` or `tile()`). Every effect ends with no inline `transform` or `opacity` left and dispatches
`iconostat-fx-done` `{ name, effect }`.

`fx.css` holds one rule: `iconostat-window.fx-ghost` is hidden, which the Tier 2 effects use to hide the real
window while the canvas shows it. Hugo builds `controller.js` and `tier1.js` as modules of their own under
`/iconostat/fx/` and the site's `assets/js/main.js` imports the controller (both are site files). The fx modules
import nothing from the site or from the library.

## Tests

- `tests/unit/fx-controller-tier2.test.js` (vitest): the Tier 2 routing of `_runEffect` and `_onDrag`, with the
  module loaders replaced by fakes.
- `tests/unit/fx-controller-loadtier2.test.js` (vitest): the real `_loadTier2()` with `compositor.warmup()`
  mocked to reject.
- `tests/unit/stubs/empty-fx-module.js`: the module that T01's `vitest.config.js` aliases `./genie.js` and
  `./wobble.js` to; no test reads its contents.
- `tests/e2e/fx-tier1.spec.js` (Playwright, `desktop`): one Tier 0 test under the suite's reduced motion and
  eleven Tier 1 tests that opt out of it and store the tier before the page loads.
- `tests/e2e/fx-seams.spec.js` (Playwright, `desktop`): six tests at Tier 0 that pin I02's seam events
  (I02-AC-31, I02-AC-39, I02-AC-43 and I02-AC-45 name them); no criterion of this node uses them.

The Tier 2 behaviour of the controller is also driven by F03's `tests/e2e/fx-tier2.spec.js` and by the specs of
F04, F05 and F06, which depend on this node.

## Changes

none: imported

## Gate

- **F01-AC-1** — Under reduced motion the session tier is 0: `init()` adds no `fx.css` link, and a user minimize leaves no `fx-ghost` class and no `#iconostat-fx-canvas` and ends minimized. *Verify:* `CI=true npx playwright test tests/e2e/fx-tier1.spec.js:26`.
- **F01-AC-2** — With `iconostat-fx-tier` stored as `'1'` and no reduced motion, a user minimize is animated (the window is not minimized at once) and ends minimized in the taskbar, visible, without `fx-ghost` and with no inline `transform` or `opacity`; a click on the chip restores it the same way. *Verify:* `CI=true npx playwright test tests/e2e/fx-tier1.spec.js:70`.
- **F01-AC-3** — Above Tier 0, `init()` adds one `<link rel="stylesheet">` to `/iconostat/fx/fx.css`. *Verify:* `CI=true npx playwright test tests/e2e/fx-tier1.spec.js:55`.
- **F01-AC-4** — `'2'` and `'auto'` select Tier 2 when a WebGL2 context can be created and Tier 1 otherwise; a stored `'0'` selects Tier 0; a `tierOverride` passed to `init()` wins over the stored setting, and unreadable storage counts as `'auto'`. *Verify:* unpinned: the Tier 2 selection is read only by the specs of F03 and F06, no test runs without WebGL2, and none passes `tierOverride` or disables storage.
- **F01-AC-5** — `setTier(value)` stores `value` under `iconostat-fx-tier` and recomputes the tier, and the next gesture follows it without a reload: after `'0'` a minimize leaves no canvas, after `'1'` it is animated again. *Verify:* `CI=true npx playwright test tests/e2e/fx-tier1.spec.js:179`.
- **F01-AC-6** — When `setTier()` raises the tier above 0 on a page that started at Tier 0, it then adds the stylesheet and the listeners. *Verify:* unpinned: the test starts at Tier 2, where they are already wired.
- **F01-AC-7** — A user-gesture `iconostat-before-minimize` above Tier 0 is `preventDefault()`ed and run as an effect. *Verify:* `CI=true npx playwright test tests/e2e/fx-tier1.spec.js:70`.
- **F01-AC-8** — A programmatic `iconostat-before-minimize` (`userGesture: false`) is never `preventDefault()`ed, so Minimize All minimizes every window at once with no effect. *Verify:* `CI=true npx playwright test tests/e2e/fx-tier1.spec.js:280`.
- **F01-AC-9** — A programmatic before-event while any effect runs cancels every running effect with `jumpToEnd`. *Verify:* unpinned: with that cancel removed, F06's `tests/e2e/fx-cancellation-matrix.spec.js:151` and `:171` still pass, because genie's own end clears the registry before their assertions time out.
- **F01-AC-10** — A viewport `resize` cancels every running effect with `jumpToEnd`, so a Tier 1 drag whose spring-back is cut short by a resize dispatches no `iconostat-fx-done`. *Verify:* `CI=true npx playwright test tests/e2e/fx-tier1.spec.js:337`.
- **F01-AC-11** — An `orientationchange` cancels every running effect, `iconostat-resize-start` cancels the effect on that window, and `cancelAll()` cancels the rest when one cancel function throws. *Verify:* unpinned: no test changes the orientation, starts a resize during an effect or registers a throwing cancel function.
- **F01-AC-12** — `registerEffect(el, …)` first cancels, with `jumpToEnd`, an effect already registered on `el`, so effects on one window never stack. *Verify:* unpinned: with the cancel call removed, `tests/e2e/fx-tier1.spec.js:132` and `:308` still pass.
- **F01-AC-13** — For a Tier 2 window, `_runEffect()` loads the compositor and, when it loaded, `genie.js`, and calls `genie.run(controller, compositor, el, kind, entering)`; with no genie module it calls `tier1.run(controller, el, kind, entering)`. *Verify:* `CI=true npx vitest run tests/unit/fx-controller-tier2.test.js`.
- **F01-AC-14** — When `genie.run()` throws a `SnapshotError`, the window is demoted to Tier 1 and the gesture runs through Tier 1; any other error also runs it through Tier 1 without a demotion; a demoted window never loads the compositor again. *Verify:* `CI=true npx vitest run tests/unit/fx-controller-tier2.test.js`.
- **F01-AC-15** — `_onDrag(fn, detail)` routes a Tier 2 drag event to `wobble[fn](controller, compositor, detail)`, falls back to `tier1[fn](controller, detail)` with no wobble module or on an error (demoting on a `SnapshotError`), and loads nothing at Tier 0. *Verify:* `CI=true npx vitest run tests/unit/fx-controller-tier2.test.js`.
- **F01-AC-16** — `_runEffect()` and `_onDrag()` read `tierFor(el)` again after the compositor has loaded, so a demotion that lands meanwhile sends the gesture to Tier 1. *Verify:* unpinned: with the second check removed, `tests/unit/fx-controller-tier2.test.js` still passes.
- **F01-AC-17** — `_loadTier2()` loads the compositor and runs its warmup once per page; when the import or the warmup fails it sets the session tier to 1 and resolves to `null`, never rejecting, and later calls return that same promise. *Verify:* `CI=true npx vitest run tests/unit/fx-controller-loadtier2.test.js`.
- **F01-AC-18** — A Tier 2 maximize also starts loading `wobble.js`, without waiting for it, and hands it the compositor through `primeCompositor()`; a missing genie or wobble module resolves to `null`. *Verify:* unpinned: only F05's `tests/e2e/fx-tier2-wobble.spec.js:528` shows the warm load, and no test runs without the genie or wobble module.
- **F01-AC-19** — A Tier 1 minimize keeps the window a child of `body`, animates it for 250 ms toward the taskbar chip's measured box, and only then commits `minimize(true, { silent: true })`, leaving no inline `transform` or `opacity`. *Verify:* `CI=true npx playwright test tests/e2e/fx-tier1.spec.js:70`.
- **F01-AC-20** — A Tier 1 restore commits `minimize(false, { silent: true })` before it animates, and a Tier 1 maximize or unmaximize commits `maximize(entering, { silent: true })` before its 150 ms animation; both leave no inline `transform`. *Verify:* `CI=true npx playwright test tests/e2e/fx-tier1.spec.js:70 tests/e2e/fx-tier1.spec.js:233`.
- **F01-AC-21** — A `cascade()` during a Tier 1 minimize leaves the window open, as `cascade()` set it, with no inline `transform` or `opacity`, and a later minimize still runs. *Verify:* `CI=true npx playwright test tests/e2e/fx-tier1.spec.js:202`.
- **F01-AC-22** — A cancel with `jumpToEnd` during a Tier 1 minimize, when nothing else changed the window, commits the minimize at once. *Verify:* `CI=true npx playwright test tests/e2e/fx-tier1.spec.js:258`.
- **F01-AC-23** — During a Tier 1 drag the window gets an inline `skew(…) scale(…)` transform from the pointer's velocity, also on a drag that starts while the previous drag's spring-back runs; on release it springs back and ends with no inline `transform`. *Verify:* `CI=true npx playwright test tests/e2e/fx-tier1.spec.js:132 tests/e2e/fx-tier1.spec.js:233`.
- **F01-AC-24** — A Tier 1 drag that springs back fully dispatches exactly one `iconostat-fx-done` `{ name, effect: 'wobble' }`. *Verify:* `CI=true npx playwright test tests/e2e/fx-tier1.spec.js:308`.
- **F01-AC-25** — The Tier 1 drag's skew is capped at 12 degrees and its stretch at 0.18, and its spring-back lasts 220 ms. *Verify:* unpinned: no test reads the transform's values or the timing.
- **F01-AC-26** — The Tier 1 minimize, restore, maximize and unmaximize each dispatch `iconostat-fx-done` with the effect `minimize`, `restore`, `maximize` or `unmaximize` when they end. *Verify:* unpinned: no test listens for the Tier 1 events of these effects.
- **F01-AC-27** — `fx.css` hides an `iconostat-window` with the `fx-ghost` class (`visibility: hidden !important`). *Verify:* unpinned: no test reads the computed visibility of a ghosted window.
- **F01-AC-28** — `controller.js`, `tier1.js` and `fx.css` import nothing from the site or from the library. *Verify:* unpinned: no test checks the imports.

## Risks

- The comments in `controller.js`, `tests/unit/fx-controller-tier2.test.js` and
  `tests/unit/stubs/empty-fx-module.js` still say that `genie.js` and `wobble.js` do not exist yet; both do (F04,
  F05), and T01's Risks say the same of `vitest.config.js`.
- `wobble.js` (F05) reads the controller's private `_inFlight` map, and F06's specs read it too, so the registry's
  shape is a de facto interface.
- A Tier 1 minimize reparents the window into the taskbar and back once, synchronously, to measure the chip, and
  again to commit. A `close()` in the moment before the effect registers can put a closed window back into the
  page (F06's `tests/e2e/fx-cancellation-matrix.spec.js:599` waits past that moment on purpose).
- The Tier 1 drag has no interference observer, so a `cascade()` mid-drag is not abandoned; the spring-back runs
  to its end.
- `fx-tier1.spec.js:179` sets the tier through `window.setFxTier`, which the site's `assets/js/main.js` defines,
  not this node.
- I02-AC-31's `tests/e2e/fx-seams.spec.js:152` is at line 152 of a file this node owns; a change to that file must
  keep I02's line references in step.
