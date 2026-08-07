# Iconostat UX Smoothing — Design

**Date:** 2026-08-07
**Branch:** `feature/nice-phoenix`
**Status:** Approved for planning

## Context

Two visual "taste odors" in the live window manager, both pure de-jank (no new
effects — window transitions/effects are a deliberate follow-up):

1. **Background flash on mode toggle.** Toggling dark/light briefly shows the bare
   `<body>` before the new background image appears.
2. **Windows visibly jump into place as they're built.** A new window paints at a
   default position, then jerks into its cascade-stacked position.

## Constraints

- **No new animations/effects.** Fixes are instant/flash-free only. Effects
  (fade/slide/crossfade) are a separate later effort.
- Pixel/behavior identical except for the removed artifacts.
- No new runtime deps. Keep the library (`assets/iconostat/`) site-coupling-free.
- Suite stays green (deterministically).

## Fix 1 — Preload both background images

**Cause:** `body { background-image: var(--bg-image); }` (`assets/css/style.css`)
swaps between `/I-Know-Better-2.jpg` (dark default) and `/I-Know-Better-1.jpg`
(light, via `body.toggled` / `@media (prefers-color-scheme)`). The non-active
image is not fetched until the toggle applies it, so the swap shows the bare body
until the download completes. (`transition: … background-image 0.3s` is a no-op —
`background-image` is not interpolated — so this is purely load-timing, not a
transition artifact.)

**Fix:** preload BOTH images in `layouts/home.html`'s `<head>`, next to the
existing font preloads:
```html
<link rel="preload" href="/I-Know-Better-1.jpg" as="image">
<link rel="preload" href="/I-Know-Better-2.jpg" as="image">
```
Both are small (24KB + 15KB ≈ 40KB total), so preloading both on every load is
negligible. With both cached, the toggle swaps instantly, no flash. No CSS/JS
change; the existing transition line is left as-is (harmless).

## Fix 2 — Build windows hidden, reveal when positioned (double-buffer)

**Cause:** `IconostatDesktop.createWindow()` (`assets/iconostat/desktop.js`)
`document.body.appendChild(el)` (element paints at default position) THEN
`el.reset(true, false)` → `bake()` applies the cascade offset. The intermediate
default-position paint is the visible jump.

**Fix:** hide the element for the entire synchronous build+bake, reveal at the end
— all within the one `createWindow` task, so the browser only paints the finished,
positioned window.

- CSS (`assets/iconostat/iconostat.css`): `iconostat-window.building { visibility: hidden; }`
  (tag selector so it matches regardless of when the `window` class is added;
  `visibility:hidden` preserves layout so `bake()` can still measure via
  `getBoundingClientRect`/`offsetHeight`).
- `IconostatDesktop.createWindow()`: add class `building` to the element
  immediately after `document.createElement(...)` (before `appendChild`); after
  `el.reset(true, false)` returns (geometry finalized), remove `building`.
- Default state is VISIBLE (only the transient `building` class hides), so there
  is no risk of a permanently-hidden window if some path skips reveal.
- Reveal is instant (no fade). Async content (`setContent`/`loadHTML`) still
  streams into the already-positioned body afterward — that is not a position
  jump, so it's out of scope here.

This mirrors classic double-buffering: assemble off-screen (here, invisible but
in-DOM for measurement), then present.

## Testing

The artifacts (flash, jump) are timing/visual and not cleanly e2e-assertable, so
lock the MECHANISMS and guard the obvious regressions:

- **Fix 1:** an e2e/build assertion that both `<link rel="preload" as="image">`
  tags for the two background images are present in the served `/` HTML.
- **Fix 2:** an e2e assertion that a freshly-created window ends up **visible**,
  **positioned** (non-empty bounding box at its cascade offset), and carries **no
  `building` class** — guarding against a "permanently hidden / never revealed"
  regression. Also confirm the existing `toBeVisible()`-based window specs stay
  green (the hide is synchronous within `createWindow`, so by assertion time the
  window is revealed).
- Full suite stays deterministically green. Actual smoothness is confirmed
  visually by the user (not machine-assertable).

## Out of scope

- Window open/close/minimize effects and transitions (the agreed follow-up).
- Any background crossfade on toggle (would be an effect; deferred).
- Any change to window content-loading or the theme variables themselves.
