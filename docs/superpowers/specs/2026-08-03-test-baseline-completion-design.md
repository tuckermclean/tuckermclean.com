# Test Baseline Completion Design — tuckermclean.com

**Date:** 2026-08-03
**Status:** Approved design, pending implementation plan
**Author:** Tucker McLean (with Claude)
**Builds on:** `2026-08-02-test-baseline-design.md` (the initial baseline, now merged/in PR #1)

## Purpose

The initial baseline pinned the core window-manager state machine and SPA
routing. This follow-up closes the remaining gaps so the suite is a
**trustworthy safety net for a full rewrite** of the window manager and routing
("clean-lab" grade): every observable behavior a port must preserve is
characterized, mobile-only code paths are covered, and we have a real (if
informational) coverage number for `window.js`.

Same discipline as before: **characterization tests** that assert only on
observable DOM/URL/geometry, never on `window.js` internals — so they survive
the framework port unchanged. Current behavior is captured as-is; latent bugs
are locked and logged, never fixed here.

## Decisions (settled)

- **Mobile:** add a second Playwright project at a phone viewport.
- **Visual regression:** none — no pixel/screenshot diffs (cross-environment
  flakiness outweighs value; DOM + geometry assertions cover structure).
- **Coverage:** informational only — collect and report, never gate CI.
- **Chat:** stays behavioral-only ("window opens"). It is a dead subsystem
  slated for removal/replacement; no investment in mocking its WebSocket/auth.
- **One source-tree edit is authorized:** a dev-only, `hugo.IsServer`-gated
  source-map line in `layouts/home.html` (see Coverage). Production output is
  unchanged. This is the only edit to site source in the effort.

## New behavior coverage (desktop, `tests/e2e/`)

All specs are characterization tests using the shared helpers
(`openApp`, `openViaMenu`, `win`) and web-first assertions. Fixed desktop
viewport 1280×900.

### state.spec.js — geometry round-trip restore

Pins `saveWindowState`/`restoreWindowState` (only class transitions were checked
before). Helper reads `{top,left,width,height}` from `el.offsetTop/Left/Width/Height`.

1. **Maximize round-trip:** record box → maximize → assert `.maximized` → restore
   → assert box returns to the original within ±2px.
2. **Minimize round-trip:** record box → minimize → restore → assert box returns
   to the original within ±2px.
3. **Shade round-trip:** record `top`+`height` → double-click header to shade →
   double-click to unshade → assert `top` and `height` restored within ±2px.

### imagezoom.spec.js — click-to-zoom image window

Pins the `loadHTML` image handler (`assets/js/window.js`).

1. Deep-link `#/posts/my-cloud-journey` (its fragment renders
   `<img class="feature-image" src="/aws_graph.png">`). Wait for the post window,
   click the `<img>`, assert a new window `#window-img-aws-graph` (slug derived
   from filename) opens containing an `<img>`.
2. **Wheel zoom:** dispatch a `wheel` with negative `deltaY` on the image window
   body; assert the image's inline `width` increases (the `applyZoom` path,
   `scale *= 1.15`).
3. **No duplicate:** click the same source image again; assert the zoom window
   count stays 1 and it is brought to front.

> Verify at implementation time that `/posts/my-cloud-journey.html` is served by
> `hugo server` (uglyURLs + `[permalinks] posts='/posts/:contentbasename'`) and
> that `aws_graph.png` loads. Fallback image source: `#/posts/the-reminder`
> (`images/the-reminder.jpg`).

### selection.spec.js — rubber-band desktop selection

Pins the selection-box IIFE at the bottom of `window.js`.

1. Open a window, then mouse-drag a rectangle over empty desktop that overlaps
   it: `mousedown` on empty desktop → `mousemove` across the window → assert
   `#desktop-select` is visible and sized to the drag, and the overlapped window
   gains `.desktop-selected`.
2. `mouseup` clears: `#desktop-select` hidden and `.desktop-selected` removed.
3. **Escape** during a drag also clears the selection.

### chrome.spec.js — link status-bar + idle Easter eggs

1. **Link status bar:** open `#/resume` (has links). Hover a link → the window's
   `.window-status-bar` shows that link's `href`; mouseout → resets to
   `Status: Ready to work!`.
2. **External link hardening:** assert an external link in resume (e.g. github)
   has `target="_blank"` and `rel="noopener noreferrer"` and a `title`.
3. **Idle Easter egg (deterministic via `page.clock`):** install
   `page.clock` before navigation; `openApp`; `page.clock.fastForward('00:45')`;
   assert the front window's status bar text is one of the known idle messages
   (from `main.js`); `page.clock.fastForward('00:08')` and assert it reverts to
   `Status: Ready to work!`.

### reflow.spec.js — viewport resize → auto-cascade

Pins the debounced `resize`→`cascadeWindows` handler.

1. Open two windows and minimize one. Call `page.setViewportSize(...)` to a
   different size. Using `expect.poll` (to ride out the 300ms debounce), assert
   both windows are un-minimized and visible as direct children of `body`
   (cascade resets them).

### boot.spec.js — add history-recycling assertion

Extend the existing back/forward test: after `page.goBack()`/`goForward()`,
assert the total `.window` count is unchanged across the navigation (windows are
recycled by `navigateToPage`, not duplicated).

## Mobile project (`tests/mobile/`)

A second Playwright project isolates mobile-only behavior.

- **Config:** project `mobile` with `viewport: {width:390,height:844}`,
  `hasTouch: true`, `isMobile: true`, `testDir: 'tests/mobile'`. The existing
  desktop project is named `desktop`, `testDir: 'tests/e2e'`. Both share the one
  `hugo server` webServer.
- **mobile.spec.js scope** (the genuinely `<=768px` paths):
  1. **`bakeWindow` mobile branch:** open a window; assert its geometry reflects
     the half-offset + width-shrink formula (window width is reduced relative to
     an un-offset baseline). Assert the observable consequence (width < viewport
     and positioned per the halved offset), not the internal math.
  2. **Tap to focus:** with two windows open, `page.touchscreen.tap` the rear
     window → it gains `.front`.
  3. **Tap minimized to restore:** minimize a window, tap its `#tasks` entry →
     restored, not `.minimized`.
  4. **Menu via tap:** tap `#start-button` → `#menu.active`; tap a `.menu-item`
     → menu closes.
  5. **Touch drag/resize — best-effort:** attempt a touch drag via synthetic
     `touchstart/touchmove/touchend` dispatch and assert position changed. If
     this proves flaky, downgrade it to a single smoke assertion and rely on the
     desktop mouse-path drag/resize specs as the authority for the drag/resize
     logic (the touch branch mirrors the mouse branch). Whatever is shipped must
     be non-flaky across 3 runs; flakiness is resolved by scoping down, never by
     loosening into vacuity. Document the decision in the task report.

## Coverage (informational only)

Two independent collectors; neither gates CI.

- **Unit coverage:** `@vitest/coverage-v8`. `vitest run --coverage` reports
  line+function coverage for `assets/js/env.js`. Config: coverage provider
  `v8`, `include: ['assets/js/env.js']`, text + html reporters.
- **E2E coverage:** collect Chromium V8 JS coverage per test via a Playwright
  fixture (`page.coverage.startJSCoverage`/`stopJSCoverage`), and aggregate +
  remap to source with **`monocart-coverage-reports`**, filtered to
  `assets/js/**`, emitting a text summary + HTML report for `window.js` and
  `main.js`. Remapping requires source maps (below).
- **Source maps (the one authorized source edit):** in `layouts/home.html`, the
  `main.js` build is `js.Build $jsOpts`. Add `"sourceMap" "inline"` to
  `$jsOpts` **only when `hugo.IsServer`** — inline (not external) so it survives
  `resources.Fingerprint` without a `sourceMappingURL`/filename desync, and so
  the production (`hugo --minify`) build is byte-for-byte unchanged. This is the
  sole modification to site source in this effort.
- **Reporting:** coverage is printed to the console and written to
  `coverage/` (git-ignored). No threshold, no CI failure on low numbers.
  CI uploads the reports as artifacts.

## Tooling & config changes

- `playwright.config.js`: two projects (`desktop`, `mobile`); a `globalTeardown`
  (or reporter) that writes the merged E2E coverage report; keep `webServer`,
  `baseURL`, `slowMo`-free defaults.
- `tests/e2e/fixtures.js`: a `test` extended with a coverage-collecting fixture;
  specs that opt into coverage import `test` from here. (Specs that don't need
  coverage may keep importing from `@playwright/test`; the fixture must be a
  no-op-safe wrapper so existing specs can migrate without behavior change.)
- `package.json`: add dev-deps `@vitest/coverage-v8`, `monocart-coverage-reports`;
  add scripts `test:unit:cov` (`vitest run --coverage`), `test:e2e` unchanged,
  and `test:cov` to run both with coverage. Keep `test`, `test:unit`, `test:e2e`,
  `test:e2e:ui` as-is.
- `.gitignore`: add `coverage/`.
- `.github/workflows/test.yml`: run the coverage variants and upload
  `coverage/` + the monocart report as artifacts (still non-gating); mobile
  project runs as part of `npm run test:e2e` (both projects).

## Determinism & anti-flake rules

- **Idle timer** is controlled with `page.clock` — no real 45s waits.
- **Debounced reflow** uses `expect.poll`, not fixed sleeps.
- **Geometry** assertions use ±2px tolerance for rounding.
- **Wheel/touch** use event dispatch; any spec that can't be made stable across
  3 consecutive runs is scoped down (never loosened to a vacuous assertion) and
  the reduction is logged.
- Every new spec must pass **twice consecutively** before its task is complete.

## Out of scope

- Chat messaging / WebSocket / auth (dead subsystem).
- Pixel/screenshot visual regression.
- Production source maps (dev/`hugo server` only).
- Any behavior change to `assets/`, `layouts/` (except the gated source-map
  line), `content/`, `static/`, `hugo.toml`.
- CI coverage gating / thresholds.

## Suspected bugs

Carried forward from the initial baseline design doc; append new findings there
or here as characterization reveals them.

- (Existing) `toggleShade` `typeof(e) === 'Event'` guard is unreachable dead
  code — see `2026-08-02-test-baseline-design.md`.
- (New, task 6) `navigateToPage` does not purely "recycle" the current top
  window on `popstate` — when the target page name already has its own
  window open, `navigateToPage` calls `closeWindow(oldWindow)` on that
  existing window and then renames the top window's DOM element into the
  target name. Net effect for `welcome → +resume → +intro → goBack →
  goForward`: window count goes 3 → 2 → 2 (never back to 3). One of the two
  windows that legitimately represent "resume" and "intro" is silently
  destroyed rather than the two windows swapping which name they hold. This
  looks like unintended data loss (an open window's live content/state is
  discarded) rather than deliberate recycling; flagged here rather than
  "fixed" per characterization-testing rules — the `boot.spec.js` recycling
  test now asserts the observed 3 → 2 → 2 sequence with this explanation
  inline.

## Deliverables

1. New desktop specs: `state`, `imagezoom`, `selection`, `chrome`, `reflow`;
   `boot.spec.js` recycling assertion.
2. Mobile project + `tests/mobile/mobile.spec.js`.
3. Coverage: `@vitest/coverage-v8` + `monocart-coverage-reports`, E2E coverage
   fixture, `layouts/home.html` gated source map, coverage npm scripts,
   `coverage/` git-ignored, CI artifacts.
4. This design doc, updated with any new suspected bugs found.
