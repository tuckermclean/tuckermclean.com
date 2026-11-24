# F06 — fx-cancellation

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| done | T01, I02, F01, F03, F04, F05 | none | M |

**Owns:** `tests/e2e/fx-cancellation-matrix.spec.js`, `tests/e2e/fx-context-loss-integration.spec.js`

## Purpose

The end-to-end tests of how the Iconostat FX effects end when something cuts them short, across the controller
and Tier 1 (F01), the compositor (F03), genie (F04) and wobble (F05). This node owns tests only; the behaviour they
pin is the code of those nodes, held to `SPEC.md` principle 4: whatever cancels an effect, the window ends
visible, without `fx-ghost`, in the state the cancelling operation left it in, with the canvas hidden and the
controller's registry of running effects empty.

`fx-cancellation-matrix.spec.js` runs each effect (genie minimize, restore and maximize, the Tier 2 drag, and the
Tier 1 minimize, maximize and drag) against each trigger (a viewport resize, `cascade()`, `tile()`, `close()` of
the same window, an opposite gesture), plus the per-window demotion of a window holding a cross-origin iframe. Its
banner sorts the cells into two regimes: an instant cut (a resize, an opposite gesture, a bulk layout that sends
a programmatic before-event, Tier 1's interference observer) and a bounded self-heal, where nothing tells the
effect and it runs out its own duration before revealing the window (a bulk layout during a Tier 2 restore,
maximize or drag, a Tier 1 drag, and every `close()`). `fx-context-loss-integration.spec.js` loses the WebGL2
context while a genie minimize and a Tier 2 drag run on two windows, then restores it.

## Tests

- `tests/e2e/fx-cancellation-matrix.spec.js` (Playwright, `desktop`): sixteen Tier 2 and five Tier 1 tests, with
  the tier stored and no reduced motion. They read `FxController._inFlight`, the controller's private registry.
- `tests/e2e/fx-context-loss-integration.spec.js` (Playwright, `desktop`): one Tier 2 test, skipped when the
  browser has no `WEBGL_lose_context`.

## Changes

none: imported

## Gate

- **F06-AC-1** — A `cascade()` during a Tier 2 genie minimize ends with the window un-minimized, revealed, the canvas hidden and the registry empty. *Verify:* `CI=true npx playwright test tests/e2e/fx-cancellation-matrix.spec.js:151`.
- **F06-AC-2** — A `close()` of a window during its Tier 2 genie minimize, restore or maximize, or during a Tier 2 drag, removes the window, raises no page error, and within 3 s leaves no `fx-ghost`, the canvas hidden and the registry empty. *Verify:* `CI=true npx playwright test tests/e2e/fx-cancellation-matrix.spec.js:190 tests/e2e/fx-cancellation-matrix.spec.js:207 tests/e2e/fx-cancellation-matrix.spec.js:224 tests/e2e/fx-cancellation-matrix.spec.js:305`.
- **F06-AC-3** — A viewport resize during a Tier 2 genie restore ends, within 2 s, with the window revealed and un-minimized, the canvas hidden and the registry empty. *Verify:* `CI=true npx playwright test tests/e2e/fx-cancellation-matrix.spec.js:263`.
- **F06-AC-4** — A `cascade()` or `tile()` during a Tier 2 genie restore or maximize, or during a Tier 2 drag, ends within 2 to 3 s with the window revealed in the state the layout set (un-minimized, un-maximized), the canvas hidden and the registry empty. *Verify:* `CI=true npx playwright test tests/e2e/fx-cancellation-matrix.spec.js:283 tests/e2e/fx-cancellation-matrix.spec.js:343 tests/e2e/fx-cancellation-matrix.spec.js:373 tests/e2e/fx-cancellation-matrix.spec.js:412 tests/e2e/fx-cancellation-matrix.spec.js:431`.
- **F06-AC-5** — A second click on the maximize button during a Tier 2 maximize ends with the window un-maximized, revealed, the canvas hidden and the registry empty. *Verify:* unpinned: `tests/e2e/fx-cancellation-matrix.spec.js:390` still passes with the reversal's commit removed and with the cancel's forced commit removed, so it does not show which path ends the effect.
- **F06-AC-6** — A viewport resize right after a Tier 2 drag starts, before its snapshot may have resolved, ends with the window revealed and the registry empty. *Verify:* unpinned: `tests/e2e/fx-cancellation-matrix.spec.js:448` still passes with wobble's placeholder cancel made a no-op; whether its resize lands during the snapshot depends on timing.
- **F06-AC-7** — A window holding a cross-origin iframe is demoted alone: after its minimize runs through Tier 1, `tierFor()` of that window is 1 while the session tier stays 2, and another window's minimize still runs through Tier 2 (it gets `fx-ghost`). *Verify:* `CI=true npx playwright test tests/e2e/fx-cancellation-matrix.spec.js:484`.
- **F06-AC-8** — A `tile()` during a Tier 1 minimize leaves the window open with no inline `transform` or `opacity` and the registry empty as soon as the call returns. *Verify:* `CI=true npx playwright test tests/e2e/fx-cancellation-matrix.spec.js:542`.
- **F06-AC-9** — A `close()` during a Tier 1 minimize or drag, and a `cascade()` during a Tier 1 drag, raise no page error and leave the registry empty within the effect's own duration. *Verify:* `CI=true npx playwright test tests/e2e/fx-cancellation-matrix.spec.js:599 tests/e2e/fx-cancellation-matrix.spec.js:627 tests/e2e/fx-cancellation-matrix.spec.js:652`.
- **F06-AC-10** — A context loss while a genie minimize and a Tier 2 drag run on two windows ends with both windows visible without `fx-ghost` and the canvas hidden; after the context is restored, a further gesture on each window (a minimize or restore, a maximize) completes. *Verify:* `CI=true npx playwright test tests/e2e/fx-context-loss-integration.spec.js`.
- **F06-AC-11** — The restore of the lost context raises no uncaught error. *Verify:* unpinned: `tests/e2e/fx-context-loss-integration.spec.js` does not listen for page errors.
- **F06-AC-12** — A `tile()` during a Tier 2 genie minimize ends like a `cascade()` (F06-AC-1), and both cuts happen as soon as the call returns. *Verify:* unpinned: with the controller's cancel on a programmatic before-event removed, `tests/e2e/fx-cancellation-matrix.spec.js:151` and `:171` still pass (genie's own end clears the registry before their assertions time out), and `:171` also passes with genie's reveal removed from its cancel path.
- **F06-AC-13** — A viewport resize during a Tier 2 genie maximize ends, within 2 s, with the window revealed, the canvas hidden and the registry empty. *Verify:* unpinned: `tests/e2e/fx-cancellation-matrix.spec.js:327` still passes with genie's reveal removed from the maximize's cancel path, since the resize can land after the 150 ms maximize or during its snapshot.
- **F06-AC-14** — A `cascade()` during a Tier 1 maximize ends with the window un-maximized, no inline `transform` or `opacity` and the registry empty within 2 s. *Verify:* unpinned: `tests/e2e/fx-cancellation-matrix.spec.js:564` still passes with Tier 1's interference observer disabled.

## Risks

- The bounded self-heal is a known gap, recorded in the matrix's banner: a bulk layout during a Tier 2 restore,
  maximize or drag does not stop the effect, so the canvas keeps drawing for up to the effect's remaining duration
  after a layout that should not animate.
- A Tier 1 minimize closed before it registers can bring the closed window back (F01's Risks);
  `tests/e2e/fx-cancellation-matrix.spec.js:599` waits past that moment.
- These tests read `FxController._inFlight`, a private field of F01, and several aim at a moment that depends on
  the snapshot's timing (`:448` most of all), so a timing change can make them miss the case they target.
- The context-loss test skips itself where `WEBGL_lose_context` is missing, which would leave F06-AC-10 without
  evidence.
