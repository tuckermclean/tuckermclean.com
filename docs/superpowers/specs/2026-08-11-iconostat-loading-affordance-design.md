# Iconostat Loading Affordance ("the bouncing eye") — Design

**Date:** 2026-08-11
**Branch:** `feature/nice-phoenix`
**Status:** Approved for planning

## Context

A window opens instantly (positioned) but its content is fetched async by the
site's `loadHTML` — so there's a brief empty-body moment before content lands.
This adds a loading affordance to fill that gap: a **bouncing spinner** (KDE
Plasma launch-feedback style) that **follows the cursor** on desktop and sits
**centered** on touch devices, driven by real content-load events (no timers).

**Key architectural decision:** the spinner *image* is **site branding**, NOT a
library asset. The extractable `assets/iconostat/` library owns only the loading
*mechanism*; the image is supplied by the site via a CSS custom property — the
same library/site split used for menu items and `--iconostat-*` theming. For this
site the image is the existing "eye" (`start-button.webp`, already cached); a
bespoke Netscape/IE-style throbber can replace it later by changing one CSS var
and dropping an asset in `static/` — no code change.

## Constraints

- **No timers.** Show/hide is driven by real events, not a hardcoded delay.
- **Library carries no branded/site image.** The spinner image comes from
  `--iconostat-spinner-image`; if unset, the affordance renders nothing (opt-in).
  Zero site coupling / Hugo refs inside `assets/iconostat/`.
- No new runtime deps. Reuse the already-loaded eye asset (no new download).
- Behavior otherwise unchanged; suite stays deterministically green.
- This bounce is a purpose-built loading affordance — **in scope**, distinct from
  the deferred "window open/close transitions" topic.

## Architecture

### Events (public API — the site/library interface)

The site's content loader announces load lifecycle; the library reacts.

- **`iconostat-content-loading`** — dispatched (bubbling, on `document`) when the
  site begins fetching a window's content.
- **`iconostat-content-loaded`** — dispatched (bubbling) when the content has
  landed OR the load terminally failed. A reusable public event.

Every `-loading` is balanced by exactly one `-loaded` (including failure paths),
so the in-flight count can't leak.

### Library: the spinner mechanism (on `<iconostat-desktop>`)

`<iconostat-desktop>` (the global coordinator) owns a single floating spinner
element built in `connectedCallback` (hidden by default):

- **In-flight count.** `document` listeners: `iconostat-content-loading` → count++,
  show; `iconostat-content-loaded` → count-- (floored at 0), hide when count hits
  0. A single indicator shared across concurrent loads (KDE model).
- **Image via custom property.** The spinner shows
  `background-image: var(--iconostat-spinner-image, none)` — no image baked in;
  if the property is unset the spinner is empty/invisible (affordance is opt-in).
- **Bounce.** A CSS `@keyframes` `translateY` bounce (KDE Plasma launch feel) on an
  inner element, plus a soft opacity/scale ease-in so an ultra-fast load is a
  gentle blip rather than a hard flash. (The image itself may already animate —
  the eye spins — which composes fine with the bounce.)
- **Placement (pointer-aware).**
  - Pointer devices (`matchMedia('(pointer: fine)')`): a `document` `mousemove`
    listener positions the spinner just below-right of the cursor (classic wait
    companion) — installed only when a fine pointer exists. `cursor: progress` on
    the desktop while loading is a free desktop bonus.
  - Touch / no fine pointer: the spinner is CSS-centered on screen (a `centered`
    class / media query); no mousemove needed.
- The spinner wrapper carries the follow-cursor transform; the inner element
  carries the bounce animation, so the two transforms don't clash.
- Themeable size/offset via `--iconostat-*` props with sane defaults.

### Site: fire the events + supply the image

- `assets/js/window.js` `loadHTML(...)`: dispatch `iconostat-content-loading` once
  at the start of a fresh load (guard the internal retry recursion so it fires
  once), and `iconostat-content-loaded` on every terminal outcome — success
  (content set), retries-exhausted (`callback(undefined)`), and the fetch `.catch`
  — so the count is always balanced.
- `assets/css/style.css`: set `--iconostat-spinner-image: url('/start-button.webp')`
  (the eye). This lives site-side, not in the library.

## Testing

The bounce / cursor-follow visuals are timing/visual and not machine-assertable —
lock the mechanism and guard the obvious regressions:

- **Events fire + balance:** an e2e test that opening a window emits
  `iconostat-content-loaded` (listen via `page.evaluate`/`addEventListener`), and
  that after load the desktop's in-flight count is 0 and the spinner is hidden
  (no stuck spinner). Cover a normal menu-open.
- **Image is site-supplied, not in the library:** assert `--iconostat-spinner-image`
  resolves to the eye URL in the served page, and grep-confirm no
  `start-button`/image URL or `spinner` *image* is hardcoded in `assets/iconostat/`
  (only the `var(--iconostat-spinner-image, …)` reference).
- **No stuck spinner on failure:** a test (or reasoned coverage) that a failed/
  missing fragment still ends with count 0 / spinner hidden.
- Full suite stays deterministically green; the actual bounce/feel is confirmed
  visually by the user.

## Out of scope

- Window open/close/minimize transitions (the separate deferred topic).
- Creating the bespoke Netscape/IE-style throbber asset (future: swap
  `--iconostat-spinner-image` + drop an asset in `static/`; no code change here).
- A background crossfade on theme toggle.
- Any change to how content is fetched/rendered beyond firing the two events.
