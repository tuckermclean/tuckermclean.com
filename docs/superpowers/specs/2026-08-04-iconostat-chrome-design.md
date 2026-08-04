# Iconostat Chrome (SP-B) — Design

**Date:** 2026-08-04
**Branch:** `feature/nice-phoenix`
**Status:** Approved for planning
**Predecessor:** SP-A (Iconostat core — `<iconostat-desktop>` + `<iconostat-window>`), merged + deployed.

## Context

SP-A converted the window-manager core into `<iconostat-desktop>` +
`<iconostat-window>` and left the surrounding "chrome" (taskbar, menu, start
button) as site markup in `layouts/home.html`, driven by site glue in
`assets/js/window.js`. SP-B converts that chrome into custom elements inside the
extractable `assets/iconostat/` library, following the same rules SP-A
established: light DOM, `iconostat-*` events, zero site coupling in the library,
characterization-guarded (behavior/pixel-identical), green at every commit.

## Scope reshaping vs. the original refactor brief (important)

The refactor brief listed five chrome elements: `<iconostat-taskbar>`,
`<iconostat-taskbtn>`, `<iconostat-startmenu>`, `<iconostat-ctxmenu>`,
`<iconostat-statusbar>`. That list was written before the actual DOM was known.
Mapped onto this codebase — under the hard "no new features, pixel-identical"
constraint — it collapses to **two** real elements:

- **No `<iconostat-taskbtn>`.** There are no per-window taskbar buttons. A
  minimized window's whole `<iconostat-window>` element is relocated into the
  taskbar (`#tasks`) and shrunk via CSS (`.window.minimized` rules). Introducing
  a separate button model would be a *new UI* — a behavior change the brief
  forbids. So the "task button" is the minimized window itself; nothing to build.
- **`<iconostat-startmenu>` + `<iconostat-ctxmenu>` are one element.** The app
  uses a single `#menu` for both the start menu (opened from the start button)
  and the right-click context menu (opened via the `contextmenu` event). They
  become one `<iconostat-menu>` that supports both trigger paths.
- **No `<iconostat-statusbar>`.** There is no desktop-level status bar. Each
  window owns a `.window-status-bar`, already built into `<iconostat-window>` in
  SP-A. The idle "easter-egg" messages and link-hover status are *site behavior*
  operating on the front window's bar via the public DOM — they stay site-side.

Net SP-B deliverables: **`<iconostat-taskbar>`** and **`<iconostat-menu>`**, plus
CSS closure and a `minimize()` decoupling (below). No Lit (nothing has a
state-driven render loop). This is the behavior-preserving decomposition; a
different one would require a forbidden behavior change.

## Hard constraints (inherited)

- No frameworks, no bundler, no new runtime deps. Native ES modules; Hugo esbuild.
- Pixel-identical, no new features.
- Green at every commit (full Playwright + Vitest suites are the safety net).
- Zero site imports / Hugo refs inside `assets/iconostat/`.
- Custom-element + event prefix `iconostat-`.
- Locked bugs stay locked; the logged `_installReflow` un-minimize race stays
  logged (out of scope).

## Architecture

### `<iconostat-taskbar>` — the desktop taskbar

Replaces `<div class="tasks" id="tasks">`. Light DOM. Responsibilities:

- **Hosts the start button** (currently `<div class="start-button">` inside
  `#tasks`). The start button is part of the taskbar's own DOM (built in
  `connectedCallback`), retaining `id`/classes so existing CSS and selectors
  match. Clicking it dispatches `iconostat-menu-open` (see menu) with the start
  anchor position.
- **Hosts minimized windows.** This is the container `<iconostat-window>.minimize()`
  relocates a window into. Today `minimize()`/`reset()` hardcode
  `document.getElementById('tasks')`; SP-B repoints them at the taskbar element
  (via a stable hook — see "minimize decoupling"), preserving the exact
  relocation behavior.
- Keeps `id="tasks"` on the element (or an inner container) so `.tasks` CSS,
  the rubber-band exclusion (`closest('.tasks')`), and any selectors still match.

### `<iconostat-menu>` — the shared start/context menu

Replaces `<div class="menu" id="menu">`. Light DOM. Provides the *mechanism*;
the site provides the *items*.

- **Items are site content, slotted/projected in.** The concrete menu items
  (`Welcome`/`Intro`/`Resume`/`Writings`/`Chat`, `Toggle Mode`,
  `Cascade`/`Tile`/`Minimize All`) call site globals (`openPage`, `toggleMode`,
  `cascadeWindows`, …) and are site-specific. They remain authored in
  `home.html` as the menu's light-DOM children; the element does not own them.
- **Owns open/close/position.** Absorbs today's `toggleMenu(x, y, offset)`
  positioning, the two trigger paths (start-button click → open at the start
  anchor with offset; document `contextmenu` → open at the cursor, suppressed
  inside `.window-body`), close-on-outside-click, and close-on-item-click.
- Keeps `id="menu"`/`.menu`/`.active` so existing CSS and the `.menu` selectors
  (rubber-band exclusion, etc.) match unchanged.
- The z-index-on-open (`getDesktop()._z + 1`) becomes a public desktop accessor
  (resolves the SP-A deferred minor about reaching into `_z`).

### minimize() decoupling

`<iconostat-window>.minimize()`/`reset()` currently call
`document.getElementById('tasks')`. SP-B repoints them at the taskbar element
without the library importing site code: the taskbar registers itself on the
desktop (e.g. `getDesktop().taskbar` set in the taskbar's `connectedCallback`),
and `minimize()` targets that, falling back to `document.getElementById('tasks')`
if absent (so `<iconostat-window>` still works in a fixture without a taskbar,
per the SP-A extractability note). This closes the SP-A "`#tasks` host
requirement" caveat.

### CSS closure (finishes Task 1's split)

SP-A Task 1 relocated window/desktop CSS but left `.menu`, `.tasks`,
`.start-button` in `style.css`, with three shared rules **duplicated** and marked
`/* DUP:SP-B <id> */` in both files. SP-B:

- Moves `.menu*`, `.tasks`, `.start-button` rules from `style.css` into
  `iconostat.css`.
- **Collapses each `DUP:SP-B` pair back into a single rule** in `iconostat.css`
  (now that both the `.window`-side and the `.menu`/`.start-button`-side live in
  the library), removing the paired markers. This is the self-liquidating
  cleanup those markers were placed for.
- Pixel-identical; verified by the suite (and the same targeted before/after
  theme-toggle screenshot check if any theme-varying values are involved).

## Public API additions (v2 of the contract)

- Elements: `<iconostat-taskbar>`, `<iconostat-menu>`.
- Events (bubbling, `iconostat-` prefix): `iconostat-menu-open`
  (`detail: { x, y, offset }`), `iconostat-menu-close`. The taskbar/start-button
  and the document `contextmenu` handler dispatch open; the menu listens.
- Desktop: `taskbar` getter/registration; a public `zIndex` (or
  `nextZIndex()`) accessor replacing direct `_z` reads.
- README updated: element catalog, events, and the fact that menu *items* and
  the idle/link status behaviors are site-provided.

## Site/library boundary (unchanged philosophy)

Stays site-side, consuming the library: the menu items and their `onclick`
globals; `openPage`/`goTo`/`toggleMode`/etc.; `loadHTML`; image-zoom; the SPA
router; and the **idle easter-egg + link-hover status** behavior in `main.js`
/ `window.js` (operating on the front window's `.window-status-bar` via the DOM).

## Migration sequence (every commit ships green)

1. `<iconostat-taskbar>` — element hosts the start button; `home.html` uses it;
   `minimize()`/`reset()` repointed at the taskbar (with fixture fallback).
2. `<iconostat-menu>` — element owns open/close/position + both triggers; items
   stay slotted site content in `home.html`; retire the `toggleMenu` glue and
   the IIFE menu wiring from `window.js`.
3. Public `zIndex` accessor on the desktop; menu uses it (drop `_z` reach-in).
4. CSS closure: relocate `.menu`/`.tasks`/`.start-button` into `iconostat.css`;
   collapse the three `DUP:SP-B` pairs; verify pixel-identical.
5. README v2 + extractability grep + dead-glue removal from `window.js`.

## Testing

- Existing Playwright (`chrome.spec.js` exercises start menu, context menu,
  menu items; `desktop.spec.js`, `selection.spec.js`, `windows.spec.js` touch
  taskbar/minimize) + Vitest must stay green at every commit.
- Extend the standalone fixture to mount a `<iconostat-taskbar>` and assert
  minimize relocates into it with no site glue (proves the decoupling).
- No new permanent visual-regression suite; targeted theme screenshot check only
  if CSS commit 4 touches theme-varying values.

## Out of scope for SP-B

- Chat window and remaining site-glue cleanup (SP-C).
- Attestation CI (SP-D).
- Fixing the locked bugs or the `_installReflow` un-minimize race.
- Any behavior/UI change (no real task-button model, etc.).
