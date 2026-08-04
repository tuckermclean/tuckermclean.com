# Iconostat Core (SP-A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the vanilla-JS window manager's shared-state core into two native custom elements — `<iconostat-desktop>` (registry, z-order, focus, rubber-band, reflow) and `<iconostat-window>` (drag, resize, min/max/shade, geometry state) — living in an extractable `assets/iconostat/` library, with the site consuming them through a public API.

**Architecture:** Light-DOM custom elements. `<iconostat-window>` dispatches `iconostat-*` CustomEvents upward; `<iconostat-desktop>` coordinates z-order and focus in response. All site concerns (content loading, env substitution, image-zoom, easter eggs, SPA routing) stay outside the library and consume it via the public API. The existing Playwright + Vitest characterization suites are the safety net; every commit ships green.

**Tech Stack:** Native ES modules, Web Components (customElements), Hugo `js.Build` (esbuild) bundling, Playwright, Vitest. No frameworks, no bundler, no new runtime dependencies.

## Global Constraints

- **No frameworks, no bundler.** Native ES modules only; Hugo's esbuild (`js.Build`) is the sole transform. No Lit in SP-A.
- **No new runtime npm dependencies.**
- **Pixel-identical.** No visual redesign; the site must look the same to the user.
- **No performance regression** in drag/resize smoothness.
- **Green at every commit.** The full `npm run test:unit` and `npm run test:e2e` suites must pass at every task's final commit. No long-lived broken state.
- **Locked bugs stay locked.** Preserve the `toggleShade` dead `typeof(e) === 'Event'` guard and the `navigateToPage` back/forward window-drop exactly as-is. Do not fix them in SP-A.
- **Zero site imports inside `assets/iconostat/`.** No Hugo template variables, site config, content paths, or env interpolation in library code.
- **Custom-element prefix `iconostat-`; event prefix `iconostat-`.**

## Environment Prerequisites

- **Unit tests** (`npm run test:unit`) run with no browser — Node + jsdom only.
- **E2E tests** (`npm run test:e2e`) need a working Chromium. This sandbox's Chromium requires a shared-library shim that is **not currently present** (`/tmp/chrome-deps` was reset). Before running e2e for the first time in a session, re-provision it and export:
  ```bash
  export LD_LIBRARY_PATH=/tmp/chrome-deps/usr/lib/x86_64-linux-gnu:/tmp/chrome-deps/lib/x86_64-linux-gnu
  ```
  If the shim dir is absent, re-extract the Chromium dependency `.deb`s into `/tmp/chrome-deps` (as was done when the baseline was first built) before e2e verification. CI (GitHub Actions) installs browsers via `playwright install --with-deps` and needs none of this.
- Playwright runs serially (`workers: 1`) by design — do not change this.

## File Structure

**Library (new, extractable — zero site imports):**
- `assets/iconostat/index.js` — barrel: registers both custom elements, re-exports classes and the public factory. The only entry point site code imports.
- `assets/iconostat/desktop.js` — `IconostatDesktop` class: window registry, z-order counter, focus/`.front`, rubber-band selection, resize→cascade reflow, `cascade`/`tile`/`minimizeAll`/`getTop`/`createWindow`.
- `assets/iconostat/window.js` — `IconostatWindow` class: builds own light DOM, drag, resize, minimize/maximize/shade, geometry save/restore, dispatches `iconostat-*` events.
- `assets/iconostat/geometry.js` — pure, DOM-free helpers (top-window selection, cascade offset). Unit-tested.
- `assets/iconostat/iconostat.css` — relocated window/desktop styles.
- `assets/iconostat/README.md` — public API documentation.

**Site glue (existing `assets/js/window.js`, progressively slimmed to site-only concerns):**
- `assets/js/window.js` — becomes the **site glue**: the globals shim (`openPage`, `goTo`, `toggleMode`, `createWindow`, `cascadeWindows`, `tileWindows`, `minimizeWindows`), `loadHTML` content loading, image-zoom, and (from Task 5) the SPA router. Imports the library from `../iconostat/index.js`. Keeps `main.js`'s existing import line working.
- `assets/js/main.js` — unchanged wiring + idle easter eggs (site concern).
- `assets/js/env.js` — unchanged (site concern).

**Templates / markup:**
- `layouts/home.html` — add `<iconostat-desktop>` wrapper; remove `#window-template` once the element owns its DOM (Task 4); wire `iconostat.css`.

**Tests (new):**
- `tests/unit/geometry.test.js` — Vitest unit tests for `geometry.js`.
- `tests/e2e/iconostat-fixture.spec.js` — standalone library test (no site glue).
- `layouts/_default/iconostat-fixture.html` + `content/iconostat-fixture.md` — dev-only fixture page (gated to `hugo.IsServer`).

**Existing specs (the safety net — must stay green):** `tests/e2e/{boot,windows,zorder,dragresize,desktop,state,imagezoom,selection,chrome,reflow}.spec.js`, `tests/mobile/mobile.spec.js`, `tests/unit/env.test.js`.

---

### Task 1: Scaffold library + relocate CSS (CSS commit 1 — pure relocation)

Establishes `assets/iconostat/`, moves the window/desktop CSS into a library stylesheet with **no visual change**, and wires it into the page. No JS behavior changes yet.

**Files:**
- Create: `assets/iconostat/iconostat.css`
- Create: `assets/iconostat/README.md`
- Modify: `assets/css/style.css` (remove relocated rules)
- Modify: `layouts/home.html` (link `iconostat.css` before site CSS)

**Interfaces:**
- Consumes: nothing.
- Produces: `assets/iconostat/iconostat.css` loaded before `style.css`; `README.md` stub.

- [ ] **Step 1: Inventory the window/desktop CSS rules to relocate**

Run this to list every candidate rule with its line number:
```bash
grep -nE '^\s*(#desktop-select|\.window|\.grippy|\.front|\.close|\.minimize|\.maximize)' assets/css/style.css
```
Classify each into three buckets:
- **MOVE to `iconostat.css`** (window/desktop chrome): `.window` (and `.window-header`, `.window-body`, `.window-status-bar`, `.window-icon`, `.window-title`, `.buttons`, `.button`, `.close`, `.minimize`, `.maximize`), `.grippy`, `.window.shaded/.maximized/.minimized/.image/.desktop-selected`, `.front` (window stacking), `#desktop-select`, and the window branches of the mobile/print `@media` blocks.
- **STAY (site chrome, SP-B):** `.menu`, `.menu-item`, `.menu-separator`, `.tasks`, `.start-button`.
- **STAY (site content typography):** `.window-body code`, `.window-body pre`, `.window-body hr`, `#resume-container`.

- [ ] **Step 2: Handle shared selectors by duplication**

Rules whose selector lists mix a MOVE class with a STAY class (e.g. `.window, .menu { … }` at line 259; `.window, .window-header, .window-status-bar, .menu, .start-button, .grippy { … }` in the media block) **cannot** be cut byte-identical. For each, **duplicate the declaration block**: put an Iconostat-only copy (`.window, .window-header, .window-status-bar, .grippy { … }`) in `iconostat.css`, and leave a site-only copy (`.menu, .start-button { … }`) in `style.css`, both with the identical declarations. This is behavior-identical (same declarations, same specificity, same source order relative to neighbors).

- [ ] **Step 3: Create `iconostat.css` preserving order**

Move the MOVE-bucket rules into `assets/iconostat/iconostat.css` in the **same relative order they appeared** in `style.css` (cascade order matters for equal-specificity rules). Add one new rule at the top for the desktop root (layout-neutral):
```css
iconostat-desktop { display: contents; }
```
Do not otherwise edit any declaration in this commit — values stay literal (variable-ization is Task 7).

- [ ] **Step 4: Create the README stub**

```markdown
# Iconostat

Native Web Components window manager. Extractable, framework-free, no bundler.

## Elements
- `<iconostat-desktop>` — root; owns window registry, z-order, focus, rubber-band selection, resize reflow.
- `<iconostat-window>` — draggable/resizable/minimizable/maximizable/shadeable window.

## Public API
_Documented as the library grows (see SP-A plan). Elements, methods, events, and `--iconostat-*` theming properties land in Tasks 3–8._
```

- [ ] **Step 5: Wire the stylesheet into the page**

In `layouts/home.html`, add the Iconostat stylesheet immediately **before** the existing site `style.css` link (mirroring where the rules used to sit in the cascade):
```html
{{ $ico := resources.Get "iconostat/iconostat.css" | resources.Minify | resources.Fingerprint }}
<link rel="stylesheet" href="{{ $ico.RelPermalink }}">
{{ $css := resources.Get "css/style.css" | resources.Minify | resources.Fingerprint }}
<link rel="stylesheet" href="{{ $css.RelPermalink }}">
```

- [ ] **Step 6: Verify the build and pixel-identity**

Run: `npx hugo --gc` (build must succeed; no missing-resource errors).
Then run the full e2e suite (which asserts visible layout/behavior):
```bash
npm run test:e2e
```
Expected: all specs pass unchanged. Spot-check by eye at `npx hugo server`: welcome window, dark/light toggle, minimized window in taskbar — visually identical.

- [ ] **Step 7: Commit**

```bash
git add assets/iconostat/iconostat.css assets/iconostat/README.md assets/css/style.css layouts/home.html
git commit -m "refactor(iconostat): relocate window/desktop CSS into library (pure move)"
```

---

### Task 2: Pure geometry helpers + unit tests

Extract the DOM-free logic (top-window selection, cascade offset) into a testable module. This de-risks the desktop conversion and gives Task 3 a tested dependency.

**Files:**
- Create: `assets/iconostat/geometry.js`
- Create: `tests/unit/geometry.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `pickTopIndex(zIndexes: number[]): number` — index of the max z-index; `-1` for empty. Ties resolve to the **first** max (matches current `sort((a,b)=>b-a)[0]` stability for equal values).
  - `cascadeOffset(index: number, headerHeight: number, isMobile: boolean): number` — pixel offset for the Nth cascaded window: `headerHeight * index + 1`, halved when `isMobile`.

- [ ] **Step 1: Write the failing tests**

```javascript
// tests/unit/geometry.test.js
import { describe, it, expect } from 'vitest';
import { pickTopIndex, cascadeOffset } from '../../assets/iconostat/geometry.js';

describe('pickTopIndex', () => {
  it('returns the index of the highest z-index', () => {
    expect(pickTopIndex([100, 305, 102])).toBe(1);
  });
  it('returns -1 for an empty list', () => {
    expect(pickTopIndex([])).toBe(-1);
  });
  it('resolves ties to the first maximum', () => {
    expect(pickTopIndex([200, 200, 100])).toBe(0);
  });
});

describe('cascadeOffset', () => {
  it('offsets by header height times index plus one on desktop', () => {
    expect(cascadeOffset(2, 30, false)).toBe(61);
  });
  it('halves the offset on mobile', () => {
    expect(cascadeOffset(2, 30, true)).toBe(30.5);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/geometry.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the module**

```javascript
// assets/iconostat/geometry.js
// Pure, DOM-free geometry helpers for Iconostat. No imports.

export function pickTopIndex(zIndexes) {
  let best = -1, bestZ = -Infinity;
  for (let i = 0; i < zIndexes.length; i++) {
    if (zIndexes[i] > bestZ) { bestZ = zIndexes[i]; best = i; }
  }
  return best;
}

export function cascadeOffset(index, headerHeight, isMobile) {
  const offset = headerHeight * index + 1;
  return isMobile ? offset / 2 : offset;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/unit/geometry.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add assets/iconostat/geometry.js tests/unit/geometry.test.js
git commit -m "feat(iconostat): pure geometry helpers with unit tests"
```

---

### Task 3: `<iconostat-desktop>` — extract the shared registry & z-order

Move the module-level `windows` array, `zIndexCounter`, focus/`.front` handling, rubber-band selection, and resize→cascade reflow out of `assets/js/window.js` into an `IconostatDesktop` custom element. Windows are still template clones created by `window.js`; they now register with the desktop instance, and the procedural functions delegate to it. This writes the z-order algorithm once, in its final home.

**Files:**
- Create: `assets/iconostat/desktop.js`
- Create: `assets/iconostat/index.js`
- Modify: `assets/js/window.js` (delete module-level state; delegate to desktop)
- Modify: `layouts/home.html` (add `<iconostat-desktop id="desktop">`; load the library bundle)

**Interfaces:**
- Consumes: `pickTopIndex` from `geometry.js`.
- Produces (on `IconostatDesktop`):
  - `register(el): void` — add a window element to the registry.
  - `unregister(el): void` — remove it, then promote the new top.
  - `bringToFront(el, changeHash = true): void` — assign next z-index, set `.front`, push history (history stays here temporarily; extracted in Task 5).
  - `getTop(): Element | undefined`
  - `promoteTop(): void`
  - `cascade(): void`, `tile(): void`, `minimizeAll(): void`
  - `windows: Element[]` (getter)
  - the singleton is reachable as `document.querySelector('iconostat-desktop')`; `index.js` exports `getDesktop()` returning it.

- [ ] **Step 1: Create the desktop element**

Move the bodies of `getTopWindow`, `promoteTopWindow`, `bringToFront`, `cascadeWindows`, `tileWindows`, `minimizeWindows`, and the rubber-band + resize/orientation IIFE logic from `assets/js/window.js` into methods of `IconostatDesktop` in `assets/iconostat/desktop.js`. Replace the module-level `windows`/`zIndexCounter` with instance fields `this._windows = []` and `this._z = 100`. Use `pickTopIndex(this._windows.map(w => parseInt(w.style.zIndex || 0, 10)))` for `getTop`. Skeleton:

```javascript
// assets/iconostat/desktop.js
import { pickTopIndex } from './geometry.js';

export class IconostatDesktop extends HTMLElement {
  connectedCallback() {
    this._windows = this._windows || [];
    this._z = this._z || 100;
    this._installSelection();   // rubber-band (moved verbatim, scoped to this)
    this._installReflow();      // resize→cascade + orientationchange (moved verbatim)
  }
  get windows() { return this._windows; }
  register(el) { this._windows.push(el); }
  unregister(el) { this._windows = this._windows.filter(w => w !== el); this.promoteTop(); }
  getTop() {
    const i = pickTopIndex(this._windows.map(w => parseInt(w.style.zIndex || 0, 10)));
    return i === -1 ? undefined : this._windows[i];
  }
  bringToFront(el, changeHash = true) { /* moved verbatim; `zIndexCounter` -> this._z */ }
  promoteTop() { /* moved verbatim from promoteTopWindow */ }
  cascade() { /* from cascadeWindows */ }
  tile() { /* from tileWindows */ }
  minimizeAll() { /* from minimizeWindows */ }
  _installSelection() { /* rubber-band block from the IIFE, `windows` -> this._windows */ }
  _installReflow() { /* resize/orientation listeners -> this.cascade() */ }
}
```
Preserve every behavior verbatim, including the locked bugs and the temporary history pushes in `bringToFront`/`promoteTop`.

- [ ] **Step 2: Create the barrel and register the element**

```javascript
// assets/iconostat/index.js
import { IconostatDesktop } from './desktop.js';

if (!customElements.get('iconostat-desktop')) {
  customElements.define('iconostat-desktop', IconostatDesktop);
}
export function getDesktop() { return document.querySelector('iconostat-desktop'); }
export { IconostatDesktop };
```

- [ ] **Step 3: Rewire `assets/js/window.js` to delegate**

Delete the module-level `windows` and `zIndexCounter` and the moved function bodies. Import the library and delegate. `createWindow` still builds the template clone, but appends it into the desktop and registers it:
```javascript
import { getDesktop } from '../iconostat/index.js';
// inside createWindow, replace `document.body.appendChild(windowElement); windows[id] = windowElement;`
const desktop = getDesktop();
desktop.appendChild(windowElement);
desktop.register(windowElement);
// replace the clone's mousedown/touchstart handler to call desktop.bringToFront(windowElement)
```
Rewrite the exported helpers as thin delegators:
```javascript
export function bringToFront(el, changeHash = true) { getDesktop().bringToFront(el, changeHash); }
export function cascadeWindows() { getDesktop().cascade(); }
export function tileWindows() { getDesktop().tile(); }
export function minimizeWindows() { getDesktop().minimizeAll(); }
```
Update internal callers (`closeWindow`, `toggleMinimize`, `openPage`, etc.) that referenced `windows`/`getTopWindow`/`bringToFront`/`promoteTopWindow` to use `getDesktop()` methods. `closeWindow`'s `windows = windows.filter(...)` + `promoteTopWindow()` becomes `getDesktop().unregister(windowElement)`.

- [ ] **Step 4: Place the desktop element and load the library**

In `layouts/home.html`: wrap the desktop by adding `<iconostat-desktop id="desktop"></iconostat-desktop>` right after `<body>` (windows append into it; `display:contents` keeps layout identical). Ensure the library is bundled and loaded before/with `main.js` — since `main.js` imports `window.js` which imports `../iconostat/index.js`, Hugo's `js.Build` will include it automatically; no separate script tag needed. Verify the import graph resolves.

- [ ] **Step 5: Run the full suite**

```bash
npx vitest run
npm run test:e2e   # ensure browser shim is provisioned first
```
Expected: all pass. The z-order, desktop, reflow, and selection specs specifically exercise the moved logic.

- [ ] **Step 6: Commit**

```bash
git add assets/iconostat/desktop.js assets/iconostat/index.js assets/js/window.js layouts/home.html
git commit -m "refactor(iconostat): extract registry, z-order, rubber-band into <iconostat-desktop>"
```

---

### Task 4: `<iconostat-window>` — convert the window into a custom element

Replace the template-clone with an `IconostatWindow` custom element that builds its own light DOM and owns drag, resize, minimize, maximize, shade, and geometry state. Introduce the `iconostat-*` event contract; the desktop coordinates focus via those events.

**Files:**
- Create: `assets/iconostat/window.js`
- Modify: `assets/iconostat/index.js` (register `iconostat-window`; add `createWindow` factory)
- Modify: `assets/iconostat/desktop.js` (listen for `iconostat-*` events; `createWindow`)
- Modify: `assets/js/window.js` (site `createWindow` delegates to `desktop.createWindow`; delete moved drag/resize/toggle bodies)
- Modify: `layouts/home.html` (remove now-unused `#window-template`)

**Interfaces:**
- Consumes: `IconostatDesktop` coordination from Task 3.
- Produces (on `IconostatWindow`):
  - attributes: `name`, `window-title`, `icon`.
  - methods: `bringToFront()`, `minimize()`, `maximize()`, `shade()`, `close()`, `setContent(html)`.
  - events (bubbling, `detail: { name }`): `iconostat-focus`, `iconostat-minimize`, `iconostat-maximize`, `iconostat-shade`, `iconostat-close`.
  - `IconostatDesktop.createWindow({ name, title, icon, classes }): IconostatWindow`.

- [ ] **Step 1: Build the element's DOM and geometry logic**

Create `assets/iconostat/window.js`. In `connectedCallback`, build the same inner markup the `#window-template` produced (header with buttons + title/icon, `.window-body`, `.window-status-bar`, `.grippy`). Move the bodies of `startDrag`, `startResize`, `toggleShade`, `saveWindowState`, `restoreWindowState`, `clearWindowState`, `windowHasState`, `toggleMinimize`, `toggleMaximize`, `resetWindow`, `bakeWindow`, `restoreWindow` from `assets/js/window.js` into methods. Preserve the locked `toggleShade` guard verbatim. On focus-worthy interaction (the clone's old `mousedown`/`touchstart`), dispatch:
```javascript
this.dispatchEvent(new CustomEvent('iconostat-focus', { bubbles: true, detail: { name: this.name } }));
```
Expose `name`/`window-title`/`icon` as attribute-backed getters/setters that update the header spans. Keep `minimize()`/`maximize()`/`shade()`/`close()` dispatching their events after mutating state.

- [ ] **Step 2: Add the factory and event coordination to the desktop**

In `desktop.js`, add:
```javascript
createWindow({ name, title, icon = '⚙️', classes = [] }) {
  const el = document.createElement('iconostat-window');
  el.name = name; el.windowTitle = title; el.icon = icon;
  classes.forEach(c => el.classList.add(c));
  this.appendChild(el);
  this.register(el);
  el.reset(true, false);   // baseline geometry (was resetWindow)
  return el;
}
```
In `connectedCallback`, listen for the window events and coordinate:
```javascript
this.addEventListener('iconostat-focus', e => this.bringToFront(e.target));
this.addEventListener('iconostat-close', e => this.unregister(e.target));
this.addEventListener('iconostat-minimize', () => this.promoteTop());
```
Register both elements in `index.js`:
```javascript
import { IconostatWindow } from './window.js';
if (!customElements.get('iconostat-window')) customElements.define('iconostat-window', IconostatWindow);
export { IconostatWindow };
```

- [ ] **Step 3: Reduce the site glue to content-only**

In `assets/js/window.js`, delete the moved drag/resize/toggle/state function bodies. Site `createWindow` becomes:
```javascript
export function createWindow(name, title, content, icon = '⚙️', bringToFront_ = true, classes = []) {
  const win = getDesktop().createWindow({ name, title, icon, classes });
  win.setContent(content);
  if (bringToFront_) win.bringToFront();
  return win;
}
```
Keep `loadHTML`, image-zoom, `openPage`, `goTo`, `navigateToPage`, `toggleMode`, `openPageFromUrl` here (still site concerns), now operating on the element API (`win.setContent`, `win.bringToFront()`, `getDesktop().getTop()`). Preserve the `navigateToPage` locked bug.

- [ ] **Step 4: Remove the dead template**

Delete the `<template id="window-template">…</template>` block from `layouts/home.html`.

- [ ] **Step 5: Run the full suite**

```bash
npx vitest run
npm run test:e2e
```
Expected: all pass — `windows`, `dragresize`, `state`, `imagezoom` specs exercise the element directly.

- [ ] **Step 6: Commit**

```bash
git add assets/iconostat/window.js assets/iconostat/index.js assets/iconostat/desktop.js assets/js/window.js layouts/home.html
git commit -m "refactor(iconostat): convert window into <iconostat-window> custom element"
```

---

### Task 5: Extract SPA routing to a site-side router

Remove history/`#/name` manipulation from the library. The desktop already emits `iconostat-focus`/`iconostat-close` with `{ name }`; a site-side router translates those into the exact `history.pushState`/`replaceState` calls the old code made. Iconostat becomes routing-agnostic.

**Files:**
- Modify: `assets/iconostat/desktop.js` (delete history calls from `bringToFront`/`promoteTop`)
- Modify: `assets/js/window.js` (add router: listen to desktop events + `popstate`; keep `openPageFromUrl`, `getCurrentPage`)

**Interfaces:**
- Consumes: `iconostat-focus`/`iconostat-close` events; `getDesktop()`.
- Produces: unchanged URL behavior (`#/<name>` hash, welcome-at-root, back/forward).

- [ ] **Step 1: Strip history from the library**

In `desktop.js`, remove the `history.pushState`/`replaceState`/`window.location.hash` logic from `bringToFront` and `promoteTop`. `bringToFront` keeps only z-index assignment + `.front` toggling. The `changeHash` parameter is dropped from the library method (the router owns hashing).

- [ ] **Step 2: Add the site router**

In `assets/js/window.js`, install a router that reproduces the old behavior against the event stream:
```javascript
const desktop = getDesktop();
desktop.addEventListener('iconostat-focus', e => {
  const name = e.detail.name;
  if (name !== window.location.hash.substring(2)) {
    history.pushState(null, null, '#/' + name);
  } else if (window.location.hash === '') {
    history.replaceState(null, null, '/' + name);
  }
});
desktop.addEventListener('iconostat-close', () => {
  const top = desktop.getTop();
  if (!top) { history.replaceState(null, null, '/'); return; }
  if (top.classList.contains('minimized')) history.pushState(null, null, '');
});
window.addEventListener('popstate', () => openPageFromUrl());
```
Keep `getCurrentPage`/`openPageFromUrl` here. Ensure the initial-load call and welcome-at-root `replaceState` still fire from the site glue, not the library.

- [ ] **Step 3: Run the routing-sensitive specs, then the full suite**

```bash
export LD_LIBRARY_PATH=/tmp/chrome-deps/usr/lib/x86_64-linux-gnu:/tmp/chrome-deps/lib/x86_64-linux-gnu
npx playwright test tests/e2e/boot.spec.js tests/e2e/state.spec.js
npm run test:e2e && npx vitest run
```
Expected: all pass, including the back/forward recycling spec that locks the `navigateToPage` behavior.

- [ ] **Step 4: Commit**

```bash
git add assets/iconostat/desktop.js assets/js/window.js
git commit -m "refactor(iconostat): extract SPA routing to site-side router via events"
```

---

### Task 6: Standalone library fixture + test (extractability proof)

Prove Iconostat runs with **no site glue** — a dev-only page that loads only the library bundle and a tiny inline bootstrap, exercised by Playwright. The library still gets bundled by Hugo's esbuild (the permitted transform); true filesystem extraction is validated structurally by the "zero site imports" grep in Task 8.

**Files:**
- Create: `layouts/_default/iconostat-fixture.html`
- Create: `content/iconostat-fixture.md`
- Create: `tests/e2e/iconostat-fixture.spec.js`

**Interfaces:**
- Consumes: the public element API (`createWindow`, `bringToFront`, events).
- Produces: a dev-only route `/iconostat-fixture/` that uses zero site JS.

- [ ] **Step 1: Create the fixture page (dev-only)**

`content/iconostat-fixture.md`:
```markdown
---
title: Iconostat Fixture
layout: iconostat-fixture
---
```
`layouts/_default/iconostat-fixture.html` — gate the whole page to dev so production never ships it:
```html
{{ if hugo.IsServer }}<!DOCTYPE html>
<html><head><meta charset="UTF-8">
{{ $ico := resources.Get "iconostat/iconostat.css" | resources.Minify }}
<link rel="stylesheet" href="{{ $ico.RelPermalink }}">
{{ $js := resources.Get "iconostat/index.js" | js.Build (dict "targetPath" "js/iconostat-fixture.js") }}
</head><body>
<iconostat-desktop id="desktop"></iconostat-desktop>
<script type="module">
  import { getDesktop } from "{{ $js.RelPermalink }}";
  const d = getDesktop();
  const w = d.createWindow({ name: 'fixture', title: 'Fixture', icon: '🧪' });
  w.setContent('<p id="fixture-body">standalone</p>');
  w.bringToFront();
</script>
</body></html>{{ end }}
```

- [ ] **Step 2: Write the standalone test**

```javascript
// tests/e2e/iconostat-fixture.spec.js
import { test, expect } from './fixtures.js';

test('library boots and opens a window with no site glue', async ({ page }) => {
  await page.goto('/iconostat-fixture/');
  const win = page.locator('iconostat-window[name="fixture"]');
  await expect(win).toBeVisible();
  await expect(win).toHaveClass(/front/);
  await expect(page.locator('#fixture-body')).toHaveText('standalone');
  // prove no site globals leaked into this page
  expect(await page.evaluate(() => typeof window.openPage)).toBe('undefined');
});

test('window drags in the standalone fixture', async ({ page }) => {
  await page.goto('/iconostat-fixture/');
  const header = page.locator('iconostat-window[name="fixture"] .window-header');
  const before = await page.locator('iconostat-window[name="fixture"]').boundingBox();
  await header.hover();
  await page.mouse.down();
  await page.mouse.move(before.x + 120, before.y + 80);
  await page.mouse.up();
  const after = await page.locator('iconostat-window[name="fixture"]').boundingBox();
  expect(after.x).toBeGreaterThan(before.x);
});
```

- [ ] **Step 3: Run the fixture test**

```bash
export LD_LIBRARY_PATH=/tmp/chrome-deps/usr/lib/x86_64-linux-gnu:/tmp/chrome-deps/lib/x86_64-linux-gnu
npx playwright test tests/e2e/iconostat-fixture.spec.js
```
Expected: PASS (2 tests). Then run the full suite to confirm no regression: `npm run test:e2e`.

- [ ] **Step 4: Commit**

```bash
git add layouts/_default/iconostat-fixture.html content/iconostat-fixture.md tests/e2e/iconostat-fixture.spec.js
git commit -m "test(iconostat): standalone library fixture proving no site coupling"
```

---

### Task 7: CSS commit 2 — `--iconostat-*` variable-ization + theme gate

Introduce the `--iconostat-*` theming contract. Library ships defaults equal to today's literal values; the site sets the theme-varying values. This is the commit with real visual risk — isolated and revertable.

**Files:**
- Modify: `assets/iconostat/iconostat.css` (literals → `var(--iconostat-*, <literal>)`)
- Modify: `assets/css/style.css` (site sets `--iconostat-*` for default + `.toggled` themes)
- Create (verification only): before/after theme screenshots under the scratchpad

**Interfaces:**
- Consumes: relocated CSS from Task 1.
- Produces: `--iconostat-*` custom properties (documented in README).

- [ ] **Step 1: Identify theme-varying values**

List the declarations in `iconostat.css` that the dark/light toggle currently changes (they already reference site vars like `--header-bg`, `--border`, `--text`, `--tooltip-bg-light`). For each window/desktop-owned color/shadow, define an `--iconostat-*` alias.

- [ ] **Step 2: Capture the BEFORE screenshots**

At `npx hugo server`, capture the theme toggle in four states (light focused, light unfocused, dark focused, dark unfocused) to the scratchpad:
```bash
npx playwright screenshot --viewport-size=1280,900 "http://localhost:1313/" \
  /tmp/claude-1000/.../scratchpad/theme-before-light.png
```
(Repeat for each state, toggling via the menu; script it if needed.)

- [ ] **Step 3: Variable-ize with literal-equal fallbacks**

In `iconostat.css`, replace each theme-varying declaration with a variable carrying the **current literal as its fallback**, e.g.:
```css
/* before */ background-color: var(--header-bg);
/* after  */ background-color: var(--iconostat-titlebar-bg, var(--header-bg));
```
In `style.css`, set the `--iconostat-*` properties for both the default (`:root`/`body`) and the `.toggled` theme, mapping to the same site vars used today. Net rendering must be unchanged.

- [ ] **Step 4: Capture AFTER screenshots and diff**

Recapture the same four states to `theme-after-*.png` and compare against BEFORE:
```bash
# any pixel-diff tool; expect zero/near-zero difference
```
Expected: visually identical in all four states. If a diff appears, the variable indirection changed the cascade — fix before committing.

- [ ] **Step 5: Run the full suite**

```bash
npm run test:e2e && npx vitest run
```
Expected: all pass.

- [ ] **Step 6: Document and commit**

Add the `--iconostat-*` property list to `assets/iconostat/README.md` (Theming section).
```bash
git add assets/iconostat/iconostat.css assets/css/style.css assets/iconostat/README.md
git commit -m "refactor(iconostat): expose --iconostat-* theming properties (theme-verified)"
```

---

### Task 8: Delete dead code + finalize public API doc + extractability check

Remove any leftover procedural remnants, confirm `assets/js/window.js` is purely site glue, finalize the README, and structurally verify the library has zero site imports.

**Files:**
- Modify: `assets/js/window.js` (remove any dead remnants)
- Modify: `assets/iconostat/README.md` (complete public API)

**Interfaces:**
- Consumes: everything above.
- Produces: final SP-A state.

- [ ] **Step 1: Prune dead code**

Grep `assets/js/window.js` for any now-unused private functions or references to removed module state. Remove them. Confirm the file contains only site concerns: globals shim, `loadHTML`, image-zoom, router, `openPage`/`goTo`/`navigateToPage`/`toggleMode`/`openPageFromUrl`.

- [ ] **Step 2: Structural extractability check**

```bash
grep -rnE "hugo|\.Site|\.\./js/|import .* from '\.\./" assets/iconostat/ || echo "clean: no site imports in library"
```
Expected: `clean` — no Hugo template refs, no imports reaching into `assets/js/`. If anything appears, relocate it to the site glue.

- [ ] **Step 3: Finalize the README**

Fill in the Public API section with the final catalog: elements, attributes (`name`, `window-title`, `icon`), methods (`createWindow`, `bringToFront`, `minimize`, `maximize`, `shade`, `close`, `setContent`, `cascade`, `tile`, `minimizeAll`, `getTop`), events (`iconostat-focus`/`-minimize`/`-maximize`/`-shade`/`-close` with `{ name }`), and the `--iconostat-*` theming properties.

- [ ] **Step 4: Full green + build**

```bash
npx vitest run
npm run test:e2e
npx hugo --gc     # production build succeeds; fixture route excluded
```
Expected: all pass; production build clean.

- [ ] **Step 5: Commit**

```bash
git add assets/js/window.js assets/iconostat/README.md
git commit -m "refactor(iconostat): remove dead code; finalize public API docs"
```

---

## Self-Review

**Spec coverage:**
- Elements `<iconostat-desktop>` + `<iconostat-window>` → Tasks 3, 4. ✓
- Light DOM, dispatch-up/parent-coordinates → Task 4 event contract. ✓
- Public API (attributes/methods/events/`--iconostat-*`) → Tasks 4, 7, 8. ✓
- Site/library boundary + globals shim → Tasks 3, 4. ✓
- Content loading/env/image-zoom/easter eggs stay site-side → preserved in `window.js`/`main.js` throughout. ✓
- SPA routing extracted in SP-A → Task 5. ✓
- CSS two-commit split (relocate, then variable-ize) with order preservation + theme screenshot gate → Tasks 1, 7. ✓
- Green at every commit → each task ends with full-suite run + commit. ✓
- Locked bugs preserved → called out in Tasks 3, 4, 5. ✓
- Standalone fixture / extractability → Tasks 6, 8. ✓
- Zero site imports structural check → Task 8. ✓

**Placeholder scan:** Relocation steps name exact source functions/line-anchors to move (not "implement later"); all new code (geometry, events, router, fixture, tests) is shown in full. ✓

**Type consistency:** `pickTopIndex`/`cascadeOffset` (Task 2) consumed in Task 3. `createWindow({name,title,icon,classes})`, `setContent`, `bringToFront`, and the `iconostat-*` event names are consistent across Tasks 4, 5, 6, 8. `getDesktop()` from `index.js` used uniformly. ✓
