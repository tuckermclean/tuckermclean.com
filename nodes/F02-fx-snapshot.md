# F02 — fx-snapshot

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| done | T01 | F03, F04, F05 | M |

**Owns:** `assets/iconostat/fx/snapshot.js`, `tests/unit/snapshot.test.js`, `tests/e2e/fx-tier2-fonts.spec.js`

## Purpose

The Tier 2 snapshot pipeline of Iconostat FX. `snapshot.js` turns a window element into a raster that the
compositor (F03) uploads as a WebGL2 texture, written by hand with no snapshot library (`SPEC.md` principle 1):

- `SnapshotError`, the typed error every snapshot failure is reported as;
- `computeDprCap(explicit)`, the device-pixel-ratio cap for the raster;
- `assessSnapshotRisk(el)`, a synchronous check, run before anything else, that throws `SnapshotError` for content
  a foreignObject raster cannot capture or that would taint the readback (a cross-origin or opaque-origin iframe,
  cross-origin media without `crossorigin`, an already tainted canvas);
- `snapshot(el, { dprCap })`, which clones the element with its computed styles inlined into an SVG
  `<foreignObject>`, embeds the page's web fonts, decodes it through an `Image` into a canvas at the capped ratio,
  draws the current frame of each `<video>` and `<canvas>` descendant on top, and resolves to
  `{ canvas, width, height }`;
- `getEmbeddedFontCss()`, which reads the page's `@font-face` rules, fetches each font file and returns the rules
  with their `src` rewritten to base64 `data:` URIs, once per page.

The module imports nothing. Hugo builds it as its own module at `/iconostat/fx/snapshot.js` (the site's
`layouts/home.html`); the compositor (F03), genie (F04) and wobble (F05) import it.

## Tests

- `tests/unit/snapshot.test.js` (vitest, jsdom): `SnapshotError`, `computeDprCap` and `assessSnapshotRisk`. jsdom
  has no foreignObject raster, so `snapshot()` itself is not unit-tested.
- `tests/e2e/fx-tier2-fonts.spec.js` (Playwright, `desktop`): one test that calls `getEmbeddedFontCss()` on the
  site's page and reads the returned CSS.

F03's `tests/e2e/fx-tier2.spec.js:192` also calls `snapshot()` on a window holding a cross-origin iframe.

## Changes

none: imported

## Gate

- **F02-AC-1** — `SnapshotError` is an `Error` subclass whose `name` is `SnapshotError`, and it keeps the `cause` it is given. *Verify:* `CI=true npx vitest run tests/unit/snapshot.test.js`.
- **F02-AC-2** — `computeDprCap()` returns `devicePixelRatio` capped at 2 on a viewport wider than 768 and at 1.5 on a viewport 390 wide, and does not raise a lower ratio; an explicit positive number wins, and 0, a negative number or `NaN` falls back to that policy. *Verify:* `CI=true npx vitest run tests/unit/snapshot.test.js`.
- **F02-AC-3** — The mobile cap of `computeDprCap()` applies up to and including a viewport 768 wide. *Verify:* unpinned: the tests use widths of 390 and 1280 only.
- **F02-AC-4** — `assessSnapshotRisk(el)` throws `SnapshotError` for an `<iframe>` descendant at any depth whose `src` has another origin or the `data:` scheme, and does not throw for an iframe with no `src`, `about:blank` or a same-origin `src`; the throw adds no `fx-ghost` class and no canvas. *Verify:* `CI=true npx vitest run tests/unit/snapshot.test.js`.
- **F02-AC-5** — `assessSnapshotRisk(el)` throws `SnapshotError` for an `<img>`, `<video>`, `<audio>` or `<source>` whose source has another origin and no `crossorigin` (for a `<source>`, read from its parent media element; a `<source>` with no parent counts as without), and does not throw for a same-origin or `data:` source or one with `crossorigin` set. *Verify:* `CI=true npx vitest run tests/unit/snapshot.test.js`.
- **F02-AC-6** — `assessSnapshotRisk(el)` treats a `blob:` iframe as risky, and throws `SnapshotError` for a descendant `<canvas>` whose `toDataURL()` throws (already tainted). *Verify:* unpinned: no test builds a `blob:` iframe or a tainted canvas.
- **F02-AC-7** — `getEmbeddedFontCss()` returns `@font-face` rules whose `src` is a single `url(data:font/woff2;base64,…)` and no other URL, for the page's Fira Sans and Fira Code faces, keeping their `font-family`. *Verify:* `CI=true npx playwright test tests/e2e/fx-tier2-fonts.spec.js`.
- **F02-AC-8** — `getEmbeddedFontCss()` runs once per page (later calls return the same promise), skips a stylesheet whose rules it cannot read and a face whose file it cannot fetch, and resolves to an empty string rather than rejecting. *Verify:* unpinned: the test makes one call on a page whose fonts all load.
- **F02-AC-9** — `snapshot(el)` runs `assessSnapshotRisk(el)` before it does anything else, inlines every element's computed style into a clone, puts the embedded font CSS in a `<style>` inside the `<foreignObject>`, rasterizes at `computeDprCap(dprCap)`, draws each visible `<video>` and `<canvas>` descendant onto the raster, resolves to `{ canvas, width, height }` with the element's CSS size (at least 1), and turns every failure into a `SnapshotError` without changing the element. *Verify:* unpinned: jsdom cannot rasterize a foreignObject, and the end-to-end tests cannot read the raster (it renders blank in headless Chromium); F03's `tests/e2e/fx-tier2.spec.js:192` shows only the risk-check rejection.
- **F02-AC-10** — `snapshot.js` imports nothing. *Verify:* unpinned: no test checks the imports.

## Risks

- The raster itself is not tested: the end-to-end specs note that a foreignObject renders blank in headless
  Chromium, so a snapshot that looks wrong (a missing style, a wrong font) passes every test.
- The risk check is a pure URL comparison: a same-origin iframe that navigates to another origin, or media that
  redirects across origins, is not caught before the raster, only by the readback failing later.
- `getEmbeddedFontCss()` caches its result for the page's lifetime, so a font added after the first snapshot is not
  embedded.
- `computeDprCap()` repeats the 768 breakpoint that `<iconostat-window>` (I02), genie (F04) and wobble (F05) also
  hard-code.
