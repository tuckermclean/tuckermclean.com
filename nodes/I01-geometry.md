# I01 — geometry

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| done | T01 | I02 | S |

**Owns:** `assets/iconostat/geometry.js`, `tests/unit/geometry.test.js`

## Purpose

Iconostat's pure geometry helpers: `assets/iconostat/geometry.js` exports `pickTopIndex(zIndexes)`, which
`<iconostat-desktop>.getTop()` (I02) uses to find the topmost window, and `cascadeOffset(index, headerHeight,
isMobile)`. The module has no imports and touches no DOM, so it is tested in isolation.

## Tests

`tests/unit/geometry.test.js` (vitest, through T01's configuration): three cases for `pickTopIndex` and two for
`cascadeOffset`.

## Changes

none: imported

## Gate

- **I01-AC-1** — `pickTopIndex(zIndexes)` returns the index of the highest value, `-1` for an empty list, and the first index when the highest value occurs more than once. *Verify:* `CI=true npx vitest run tests/unit/geometry.test.js`.
- **I01-AC-2** — `cascadeOffset(index, headerHeight, isMobile)` returns `headerHeight * index + 1`, halved when `isMobile` is true. *Verify:* `CI=true npx vitest run tests/unit/geometry.test.js`.
- **I01-AC-3** — `geometry.js` imports nothing and uses no DOM API. *Verify:* unpinned: no test checks the module's imports.

## Risks

- Nothing calls `cascadeOffset`: `<iconostat-window>.bake()` (I02) computes the same cascade offset inline, so a
  change to one does not reach the other.
- `pickTopIndex` compares numbers with `>`; `getTop()` passes `parseInt` of each window's inline `z-index`, so a
  window with no inline `z-index` counts as 0.
