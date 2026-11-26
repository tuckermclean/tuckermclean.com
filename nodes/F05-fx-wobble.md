# F05 — fx-wobble

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| done | T01, I02, F01, F02, F03, F04 | F06, S02, T06 | L |

**Owns:** `assets/iconostat/fx/wobble.js`, `tests/unit/wobble.test.js`, `tests/e2e/fx-tier2-wobble.spec.js`

## Purpose

The Tier 2 "wobble" effect of Iconostat FX: a dragged window drawn as a jelly mesh on the compositor's shared
canvas (F03) while the real window, hidden, keeps moving under the library's own drag (I02). The controller (F01)
calls `dragStart`, `dragMove` and `dragEnd(controller, compositor, detail)` for each drag event of a Tier 2
window.

The mesh is a grid of point masses (6×6, or 4×4 at a viewport 768 wide or less), each held to its rest position
in the window's current box by an anchor spring and coupled to its neighbours by structural and shear springs. A
fixed 120 Hz step with an accumulator drives it from `requestAnimationFrame`, with the rendered frame interpolated
between steps. While dragging, the top row (the title bar) is held rigid to the window's box and the rest trails
it; on release the mesh settles until its kinetic energy falls below a threshold or a 2 s cap passes, and then
`endEffect()` reveals the window and `iconostat-fx-done` `{ name, effect: 'wobble' }` fires. A cancel stops it and
reveals the window without the event.

- A drag that starts while this window's previous wobble is still settling continues that mesh, with no new
  snapshot.
- A drag on a window with another effect running (a genie minimize or maximize, F04) is refused: the window moves
  without the effect.
- A window holding a live `<video>` is re-snapshotted at most every 250 ms during the effect.
- When a maximize ends (`iconostat-fx-done` with `maximize`), a short "impact" jiggle runs on that window on a
  viewport wider than 768; the controller primes the compositor for it on the first maximize
  (`primeCompositor()`).

The pure parts are exported for unit tests: `mobileViewport`, `gridDims`, `restGrid`, `nearestIndex`,
`buildSprings`, `kineticEnergy` and `stepPhysics`. Two test seams: `__testTuning()` overrides the settle
threshold and the caps, and `__testHasCachedCompositor()` reports the priming. `wobble.js` imports `snapshot.js`
(F02) and `controller.js` (F01). Hugo builds it as `/iconostat/fx/wobble.js`.

## Tests

- `tests/unit/wobble.test.js` (vitest): the grid, the springs, the kinetic energy and `stepPhysics`.
- `tests/e2e/fx-tier2-wobble.spec.js` (Playwright, `desktop`): thirteen tests with Tier 2 stored and no reduced
  motion; some dispatch the drag events themselves.
- F04's `tests/unit/fx-supersede-handling.test.js` also runs `dragStart()` against a rejecting compositor.

## Changes

none: imported

## Gate

- **F05-AC-1** — `gridDims()` is 6×6 on a viewport wider than 768 and 4×4 at 768 or less (`mobileViewport()` true). *Verify:* `CI=true npx vitest run tests/unit/wobble.test.js`.
- **F05-AC-2** — `restGrid()` returns a `Float32Array` row-major grid from the box's top-left to its bottom-right corner (a 1×1 grid is the top-left corner); `nearestIndex()` returns the vertex nearest the pointer and clamps a pointer outside the box to an edge vertex. *Verify:* `CI=true npx vitest run tests/unit/wobble.test.js`.
- **F05-AC-3** — `buildSprings(6, 6)` gives 60 structural and 50 shear springs, each joining two distinct vertices of the grid; `kineticEnergy()` is the sum of the squared velocities. *Verify:* `CI=true npx vitest run tests/unit/wobble.test.js`.
- **F05-AC-4** — `stepPhysics()` leaves a mesh at rest at rest; a pinned vertex stays where it is pinned and pulls its neighbour along without a non-finite value; rows held with `pinnedRest` snap to their rest positions with zero velocity while the rows below trail and catch up. *Verify:* `CI=true npx vitest run tests/unit/wobble.test.js`.
- **F05-AC-5** — Released after a drag, the mesh's kinetic energy falls below 30 within 220 steps (under 2 s at 120 Hz) and every vertex returns near its rest position; a pin that keeps moving keeps the energy above 100. *Verify:* `CI=true npx vitest run tests/unit/wobble.test.js`.
- **F05-AC-6** — During a Tier 2 drag the window has `fx-ghost` and the canvas is shown; after release the window is revealed, the canvas hidden, its inline `left` and `top` are those of the mouse-up, and exactly one `iconostat-fx-done` `{ name, effect: 'wobble' }` fired. *Verify:* `CI=true npx playwright test tests/e2e/fx-tier2-wobble.spec.js:76`.
- **F05-AC-7** — A drag started while the window's wobble is still settling continues it: the window stays ghosted, the sequence calls `beginEffect()` once, and it ends revealed. *Verify:* `CI=true npx playwright test tests/e2e/fx-tier2-wobble.spec.js:135`.
- **F05-AC-8** — A drag on a window during its genie minimize is refused: the registered effect stays `minimize`, no further `beginEffect()` runs, and the minimize ends correct. *Verify:* `CI=true npx playwright test tests/e2e/fx-tier2-wobble.spec.js:206`.
- **F05-AC-9** — With the settle threshold out of reach, the settle cap still ends the effect: with `__testTuning({ epsilon: -1, settleMaxDurationMs: 300 })` the window is revealed between 200 ms and 1.8 s after release. *Verify:* `CI=true npx playwright test tests/e2e/fx-tier2-wobble.spec.js:276`.
- **F05-AC-10** — A viewport resize or a context loss during a Tier 2 drag reveals the window while the button is still down, and a later minimize still runs. *Verify:* `CI=true npx playwright test tests/e2e/fx-tier2-wobble.spec.js:308 tests/e2e/fx-tier2-wobble.spec.js:330`.
- **F05-AC-11** — When `beginEffect()` rejects with a `SnapshotError` (a window holding a cross-origin iframe), `dragStart()` rethrows, so the drag gets the Tier 1 transform instead and the window is never ghosted. *Verify:* `CI=true npx playwright test tests/e2e/fx-tier2-wobble.spec.js:357`.
- **F05-AC-12** — When `beginEffect()` rejects with `EffectSupersededError`, `dragStart()` resolves without calling `endEffect()` or unregistering the window's effect. *Verify:* `CI=true npx vitest run tests/unit/fx-supersede-handling.test.js`.
- **F05-AC-13** — A Tier 2 maximize before any drag loads `wobble.js` and primes its compositor (`__testHasCachedCompositor()` is true). *Verify:* `CI=true npx playwright test tests/e2e/fx-tier2-wobble.spec.js:528`.
- **F05-AC-14** — After a maximize ends, the impact jiggle ghosts the window again and settles within its 900 ms cap, and it is skipped on a viewport 768 wide or less. *Verify:* unpinned: `tests/e2e/fx-tier2-wobble.spec.js:497` and `:528` only check that the window ends revealed.
- **F05-AC-15** — During a drag of a window holding a `<video>`, the texture is re-snapshotted at most every 250 ms. *Verify:* unpinned: `tests/e2e/fx-tier2-wobble.spec.js:418` accepts any number of uploads.
- **F05-AC-16** — The mesh's rest box follows the window's live viewport box on each move and at release. *Verify:* unpinned: the end-to-end tests cannot read the drawn mesh.
- **F05-AC-17** — A cancel that lands while `dragStart()` still waits for its snapshot reveals the window once the snapshot resolves, unless another effect has claimed it. *Verify:* unpinned: F06's `tests/e2e/fx-cancellation-matrix.spec.js:448` aims at that moment but cannot tell whether it hit it.
- **F05-AC-18** — `wobble.js` imports only `./snapshot.js` and `./controller.js`. *Verify:* unpinned: no test checks the imports.

## Risks

- `dragStart()` reads the controller's private `_inFlight` map to tell its own settling effect from another one.
- The impact jiggle starts from a document-level listener that `wobble.js` adds when it is first imported.
- The spring constants were tuned by eye for a visible jiggle; `tests/unit/wobble.test.js` pins only that the mesh
  settles before the cap.
- The `__testTuning` and `__testHasCachedCompositor` seams ship with the site.
- `mobileViewport()` repeats the 768 breakpoint of F02 and F04.
