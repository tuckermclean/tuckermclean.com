# Iconostat Core (SP-A) — Design

**Date:** 2026-08-04
**Branch:** `feature/nice-phoenix`
**Status:** Approved for planning

## Context

`tuckermclean.com` is a Hugo site whose front page is a desktop-OS-style window
manager written in vanilla JS. The window manager is being refactored into native
Web Components under the name **Iconostat**, structured as an extractable
standalone library from day one — the site becomes Iconostat's first consumer.
This is an incremental refactor, not a rewrite: the site must look and behave
identically to the user when each step is done.

The full mission (see the Iconostat Refactor Brief) is large. It decomposes into
four independent sub-projects, each of which gets its own spec → plan → build
cycle:

- **SP-A — Iconostat core: `<iconostat-desktop>` + `<iconostat-window>`.** The
  flagship. This document.
- **SP-B — Chrome:** `<iconostat-taskbar>` / `<iconostat-taskbtn>`,
  `<iconostat-startmenu>`, `<iconostat-ctxmenu>`, `<iconostat-statusbar>`.
- **SP-C — Site glue + chat:** content loading, env substitution, easter eggs,
  and the chat window re-expressed as site code consuming Iconostat.
- **SP-D — Supply-chain attestation CI:** Hugo pin+checksum, syft SBOM, SLSA
  provenance, `/.well-known/sbom.spdx.json`. Independent of the component work.

### Why desktop + window are one sub-project

The brief lists `<iconostat-window>` (step 2) and `<iconostat-desktop>` (step 3)
as separate, sequential conversions. The current code makes that split
uneconomical: `window.js` (783 lines) is a single procedural module with
**module-level shared state** — a `windows` array and a `zIndexCounter`. Every
window operation (`bringToFront`, `cascadeWindows`, `toggleMinimize`, rubber-band
selection, `openPageFromUrl`) reads and mutates that shared registry.

Converting the window element alone would require throwaway adapter code precisely
at the z-order/focus seam — the most timing-sensitive, hardest-to-test logic in
the system, and exactly where the characterization suite already caught two bugs.
The seam is structural, so we cross it once, as one foundational sub-project,
guarded by the existing tests. PR size is a preference; the seam is not.

## Hard constraints (inherited from the brief)

- **No frameworks, no bundler.** Native ES modules; Hugo's esbuild minification is
  the only transform. (Lit is a later-sub-project question, not SP-A's.)
- **No performance regression.** Drag/resize must stay as smooth as today.
- **Pixel-identical.** No visual redesign.
- **Green at every intermediate commit.** SP-A is larger than a single-component
  conversion, so every checkpoint commit must keep the existing Playwright +
  Vitest suites passing. No long-lived broken state; convert behind the suite and
  commit at working checkpoints.
- **Locked bugs stay locked.** The two known characterized bugs (`toggleShade`
  dead `typeof(e) === 'Event'` guard; `navigateToPage` dropping a window on
  back/forward) are preserved as-is in SP-A. They are fixed deliberately later.

## Architecture

### `<iconostat-desktop>` — the root

Placed once by the site. Owns everything that today lives as module-level state in
`window.js`:

- the window registry (the `windows` array),
- the z-index counter and focus / `.front` tracking,
- rubber-band selection,
- the debounced resize→cascade reflow and orientationchange handling.

It **coordinates**; it does not know drag math. Public methods:

- `createWindow(opts)` → returns the `<iconostat-window>` element
- `cascade()`, `tile()`, `minimizeAll()`
- `getTop()` and a `windows` getter

It listens for child window events and assigns z-order in response.

### `<iconostat-window>` — self-contained window

Builds its own **light DOM** (header / body / status-bar / grippy) in
`connectedCallback`, replacing the `#window-template`. Owns:

- drag, resize,
- minimize / maximize / shade toggles,
- its own geometry save/restore state.

Critically, it does **not** assign its own z-index. It *requests* focus by
dispatching `iconostat-focus` upward; the desktop increments the counter and
toggles `.front`. This is the brief's "dispatch up, parent coordinates" rule
applied to the single most-tested seam in the system.

Light DOM (not shadow DOM) because the entire existing `style.css` targets
`.window`, `.window-header`, `.grippy`, etc. globally, and theming is a global
`body.toggled` class toggle. Shadow DOM would break both. Shadow DOM is only
considered later where it demonstrably pays and does not fight theming.

## Public API (the extraction contract, v1)

Documented in the library's own `README.md` and grown as later sub-projects add
elements.

- **Attributes:** `name`, `window-title`, `icon`. Reflected state classes stay
  as-is: `front`, `minimized`, `maximized`, `shaded`.
- **Window methods:** `bringToFront()`, `minimize()`, `maximize()`, `shade()`,
  `close()`, `setContent(html)`.
- **Desktop methods:** `createWindow(opts)`, `cascade()`, `tile()`,
  `minimizeAll()`, `getTop()`, `windows`.
- **Events (bubbling, `iconostat-` prefix):** `iconostat-focus`,
  `iconostat-minimize`, `iconostat-maximize`, `iconostat-shade`,
  `iconostat-close` — each carrying `{ name }` in `detail`.
- **CSS custom properties:** `--iconostat-*`, introduced in CSS commit 2, with
  library-shipped defaults equal to today's literal values.

**API feel:** imperative-primary. The site calls the desktop factory method
(`desktop.createWindow(...)`) rather than hand-constructing elements — this
mirrors the existing `createWindow(...)` idiom and minimizes site-glue churn.
Declarative construction (site builds `<iconostat-window>` directly) remains
supported for standalone / fixture use.

## Site / library boundary

Iconostat contains **zero** site concerns. Everything below stays site-side and
consumes only the public API:

- **The globals shim.** `window.openPage`, `goTo`, `toggleMode`,
  `cascadeWindows`, `tileWindows`, `minimizeWindows`, `createWindow` keep their
  exact current signatures, now implemented on top of desktop/window methods, so
  `home.html`'s inline `onclick=""` handlers and the `openpage` shortcode work
  **unchanged**.
- **Content loading** (`loadHTML`), **env-var substitution** (`env.js`),
  **image-zoom windows**, and **idle status-bar easter eggs** stay site code.
  Image-zoom calls `desktop.createWindow`.
- **Theming / dark-light** (`toggleMode`) stays site code; the site sets
  `--iconostat-*` properties.

### SPA routing / history — extracted in SP-A (not deferred)

Routing is a site concern, and we extract it **now** rather than in SP-C, because
it rides for free on the event system SP-A already builds:

- The desktop emits `iconostat-focus` / `iconostat-close` carrying `{ name }`.
- A site-side router translates those into the **exact** `history.pushState` /
  `history.replaceState` calls the current code makes (including the `#/name`
  hash convention and the `promoteTopWindow` / `openPageFromUrl` behavior).

No throwaway code — the events exist regardless of routing — so the library stays
clean without an interim adapter. Because routing is intricate and its
characterization specs are sensitive (they caught the `navigateToPage` bug), the
extraction gets its **own green checkpoint commit**, guarded by the routing specs.

## Migration sequence (every commit ships green)

1. **Scaffold** `assets/iconostat/` — barrel `index.js`, `README.md` stub
   (public-API doc), internal module structure, and a standalone fixture HTML
   page for library-only tests. No behavior change yet.
2. **CSS commit 1 — pure relocation.** Cut the window / desktop rules out of
   `style.css` into a library-owned `iconostat.css` with **zero edits**. Preserve
   selector order (cascade order matters for equal-specificity rules) and load
   order (`iconostat.css` before site CSS, mirroring where the rules sat). This
   commit must be provably boring — verify pixel-identical.
3. **`<iconostat-window>` element.** Drag / resize / min / max / shade + geometry
   state. Old procedural functions delegate to it. Site stays driven through the
   globals shim.
4. **`<iconostat-desktop>` element.** Registry, z-order, focus, rubber-band,
   resize reflow. Retire the module-level `windows` / `zIndexCounter`.
5. **Routing extraction.** Move history/`#/name` logic to the site-side router,
   driven by desktop events. Own checkpoint, guarded by routing specs.
6. **CSS commit 2 — variable-ization.** Introduce `--iconostat-*` properties with
   fallback defaults equal to the current literal values; move the theme-varying
   values (those the dark/light class toggle currently overrides) into site CSS
   that sets the variables. This is the commit with real visual risk — isolated,
   small, revertable on its own.
7. **Delete dead code** from `window.js` once each replacement is proven.

## Testing & verification

- **Existing suites are the safety net.** The full Playwright (desktop + mobile)
  and Vitest suites must stay green at every checkpoint above. Convert behind the
  suite; no long-lived broken state.
- **Standalone library tests.** Iconostat gets fixture HTML pages exercised by
  Playwright, proving the components run with **no site code** — this is the
  extractability proof.
- **Unit tests (Vitest)** for the pure logic: z-order selection (`getTopWindow`
  equivalent) and geometry math.
- **Theme-toggle screenshot gate (after CSS commit 2).** Targeted before/after
  screenshot comparison of the theme toggle specifically — both themes, window
  focused and unfocused — because variable indirection bites the cascade exactly
  there. This is a one-off verification gate for that commit, **not** a new
  permanent visual-regression suite (the baseline deliberately skipped visual
  regression). Capture before/after PNGs and diff.

## Extractability definition of done (for SP-A's scope)

- All Iconostat code lives under one self-contained directory (`assets/iconostat/`)
  with its own internal module structure and `README.md`.
- **Zero imports from site code into the library.** No Hugo template variables,
  site config, content paths, or env interpolation inside Iconostat.
- Site-specific code (content loading, env, routing, easter eggs, image-zoom)
  lives outside the directory and consumes Iconostat only through the public API.
- The library's fixture tests pass standalone.
- Theming is via `--iconostat-*` custom properties with sane defaults; no site CSS
  selector reaches into Iconostat internals beyond setting those properties.

## Out of scope for SP-A

- Taskbar, start menu, context menu, status-bar elements (SP-B). SP-A keeps the
  existing `#tasks` / `#menu` DOM and existing minimize-into-`#tasks` behavior.
- Chat window (SP-C).
- Attestation pipeline (SP-D).
- Fixing the two locked bugs.
