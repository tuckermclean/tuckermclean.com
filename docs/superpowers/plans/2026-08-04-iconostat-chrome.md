# Iconostat Chrome (SP-B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the window-manager chrome (taskbar + shared start/context menu) into `<iconostat-taskbar>` and `<iconostat-menu>` custom elements in the extractable `assets/iconostat/` library, decouple `minimize()` from the hardcoded `#tasks`, and finish relocating the chrome CSS (collapsing the `DUP:SP-B` duplications).

**Architecture:** Light-DOM custom elements consuming SP-A's desktop/window. `<iconostat-menu>` owns open/close/position and both trigger paths (start button, right-click); its menu *items* stay site-authored light-DOM children. `<iconostat-taskbar>` hosts the start button and is the container minimized windows relocate into. Behavior/pixel-identical; the Playwright + Vitest suites are the safety net; green at every commit.

**Tech Stack:** Native ES modules, Web Components, Hugo `js.Build` (esbuild), Playwright, Vitest. No frameworks, no bundler, no new deps, no Lit.

## Global Constraints

- No frameworks, no bundler, no new runtime deps, no Lit.
- Pixel-identical, no new features/UI.
- Green at every commit: full `npm run test:unit` (12) and `npm run test:e2e` (45) must pass at each task's final commit.
- Zero site imports / Hugo refs inside `assets/iconostat/`.
- Custom-element + event prefix `iconostat-`.
- Locked bugs stay locked; do NOT fix them or the logged `_installReflow` un-minimize race. Preserve every odd-but-existing detail verbatim (e.g. the `document.getElementById(\`window-${this.id}\`)` line in `reset()`).

## Environment Prerequisites

- Worktree: `/home/node/.agent-os/worktrees/tuckermclean.com-nice-phoenix`, branch `feature/nice-phoenix`. The shell cwd RESETS to a master checkout between commands — begin EVERY Bash command with `cd /home/node/.agent-os/worktrees/tuckermclean.com-nice-phoenix &&`, and verify `git rev-parse --abbrev-ref HEAD` = `feature/nice-phoenix` before committing. NEVER commit on master.
- Unit tests need no browser. E2E needs the Chromium shim exported in the same command:
  ```
  export LD_LIBRARY_PATH=/home/node/.cache/chrome-deps/usr/lib/x86_64-linux-gnu:/home/node/.cache/chrome-deps/lib/x86_64-linux-gnu:/home/node/.cache/chrome-deps/usr/lib:/home/node/.cache/chrome-deps/lib
  ```
  Playwright auto-starts Hugo and runs serially. Do not change worker count.

## File Structure

- Create: `assets/iconostat/menu.js` — `IconostatMenu` element (open/close/position, triggers).
- Create: `assets/iconostat/taskbar.js` — `IconostatTaskbar` element (start-button host + wiring; minimize host; desktop registration).
- Modify: `assets/iconostat/index.js` — register both elements.
- Modify: `assets/iconostat/desktop.js` — add public `zIndex` accessor and a `taskbar` registration slot.
- Modify: `assets/iconostat/window.js` — repoint `minimize()`/`reset()` at the taskbar.
- Modify: `assets/js/window.js` — remove `toggleMenu` and the IIFE menu/start/context wiring (moved into elements); keep mode-init, popstate, initial load.
- Modify: `layouts/home.html` — `<div class="tasks" id="tasks">` → `<iconostat-taskbar id="tasks">`; `<div class="menu" id="menu">` → `<iconostat-menu id="menu">` (children unchanged).
- Modify: `assets/iconostat/iconostat.css`, `assets/css/style.css` — relocate `.menu`/`.tasks`/`.start-button`; collapse the 3 `DUP:SP-B` pairs.
- Modify: `layouts/_default/iconostat-fixture.html`, `tests/e2e/iconostat-fixture.spec.js` — taskbar/minimize standalone proof.
- Modify: `assets/iconostat/README.md` — element catalog v2.

**Safety net specs:** `tests/e2e/chrome.spec.js` (start menu open, menu items, context menu), `tests/e2e/{windows,desktop,selection,state,reflow}.spec.js`, `tests/e2e/iconostat-fixture.spec.js`, unit suite.

---

### Task 1: `<iconostat-menu>` — the shared start/context menu element

Move the menu mechanism (open/close/position + right-click trigger + close-on-outside + close-on-item) out of `assets/js/window.js` into a custom element. The menu *items* stay authored in `home.html` as the element's children. The start button keeps opening the menu via a temporary event dispatch from the (still-site) IIFE, which Task 2 absorbs.

**Files:**
- Create: `assets/iconostat/menu.js`
- Modify: `assets/iconostat/index.js`, `assets/iconostat/desktop.js`
- Modify: `assets/js/window.js` (remove `toggleMenu` + menu wiring; start-button dispatches the open event)
- Modify: `layouts/home.html` (`#menu` → `<iconostat-menu>`)

**Interfaces:**
- Consumes: `getDesktop()` from `index.js`.
- Produces:
  - `<iconostat-menu>` element; on connect it adds `class="menu"`, installs a document `contextmenu` handler and a document `click` outside-close handler, wires its `.menu-item` children to close on click, and listens for `iconostat-menu-open`.
  - Event `iconostat-menu-open` (`detail: { x, y, offset }`, bubbles) — anyone dispatches it to open the menu at (x,y); `offset:true` right-aligns (subtract menu width).
  - `IconostatDesktop.zIndex` getter returning the current z counter (`this._z`).

- [ ] **Step 1: Add the `zIndex` accessor to the desktop**

In `assets/iconostat/desktop.js`, add a getter (near `get windows()`):
```javascript
get zIndex() { return this._z; }
```

- [ ] **Step 2: Create the menu element**

Create `assets/iconostat/menu.js`. Move the exact positioning logic from the old `toggleMenu(x, y, offset)` (`assets/js/window.js:302-313`) and the trigger/close logic from the IIFE (`assets/js/window.js:360-386`) into the element, preserving behavior verbatim (including the toggle semantics and the `.window-body` context-menu suppression):
```javascript
import { getDesktop } from './index.js';

export class IconostatMenu extends HTMLElement {
  connectedCallback() {
    if (this._wired) return;
    this._wired = true;
    this.classList.add('menu');

    // Open on request (start button dispatches this; see taskbar/Task 2).
    document.addEventListener('iconostat-menu-open', e => {
      const { x, y, offset } = e.detail;
      if (this.classList.contains('active')) this.classList.remove('active');
      this._openAt(x, y, offset);
    });

    // Right-click context menu (suppressed inside a window body).
    document.addEventListener('contextmenu', e => {
      if (e.target.closest('.window-body')) return;
      e.preventDefault();
      if (this.classList.contains('active')) this.classList.remove('active');
      this._openAt(e.clientX, e.clientY, false);
    });

    // Close when clicking outside the menu / start button.
    document.addEventListener('click', e => {
      if (e.target.closest('.menu')) return;
      if (e.target.closest('.start-button')) return;
      this.classList.remove('active');
    });

    // Close when clicking a menu item.
    this.querySelectorAll('.menu-item').forEach(item => {
      item.addEventListener('click', () => this.classList.remove('active'));
    });
  }

  // Mirrors the old toggleMenu(): toggle active, position, raise z-index.
  _openAt(x, y, offset = false) {
    this.classList.toggle('active');
    this.style.top = `${y}px`;
    if (offset) {
      this.style.left = `${x - this.offsetWidth}px`;
    } else {
      this.style.left = `${x}px`;
    }
    this.style.zIndex = getDesktop().zIndex + 1;
  }
}
```

- [ ] **Step 3: Register the element**

In `assets/iconostat/index.js`, add:
```javascript
import { IconostatMenu } from './menu.js';
if (!customElements.get('iconostat-menu')) customElements.define('iconostat-menu', IconostatMenu);
export { IconostatMenu };
```

- [ ] **Step 4: Convert the markup and rewire the start button**

In `layouts/home.html`, change `<div class="menu" id="menu">` to `<iconostat-menu id="menu">` and its closing `</div>` to `</iconostat-menu>` (leave all `.menu-item`/`.menu-separator` children unchanged).

In `assets/js/window.js`: delete the `toggleMenu` function (lines 302-313) and the IIFE's `contextmenu`, outside-click, and menu-item blocks (lines 360-386). Replace the start-button click handler (lines 352-358) so it dispatches the open event instead of calling `toggleMenu`:
```javascript
startButton.addEventListener('click', e => {
  const r = startButton.getBoundingClientRect();
  document.dispatchEvent(new CustomEvent('iconostat-menu-open', {
    detail: { x: r.left + startButton.offsetWidth / 2, y: r.top, offset: true }
  }));
});
```
Leave the mode-init (localStorage), `popstate`, and initial `openPageFromUrl()` blocks in the IIFE untouched.

- [ ] **Step 5: Run the suite**

```bash
cd /home/node/.agent-os/worktrees/tuckermclean.com-nice-phoenix && export LD_LIBRARY_PATH=/home/node/.cache/chrome-deps/usr/lib/x86_64-linux-gnu:/home/node/.cache/chrome-deps/lib/x86_64-linux-gnu:/home/node/.cache/chrome-deps/usr/lib:/home/node/.cache/chrome-deps/lib && npx playwright test tests/e2e/chrome.spec.js --project=desktop && npx vitest run && npm run test:e2e
```
Expected: `chrome.spec.js` (start menu opens from the button, items open pages, right-click context menu) all pass; full suite 45 + unit 12 green.

- [ ] **Step 6: Commit**

```bash
git add assets/iconostat/menu.js assets/iconostat/index.js assets/iconostat/desktop.js assets/js/window.js layouts/home.html
git commit -m "refactor(iconostat): extract the start/context menu into <iconostat-menu>"
```

---

### Task 2: `<iconostat-taskbar>` — taskbar element + minimize decoupling

Convert `#tasks` into `<iconostat-taskbar>`, absorb the start-button wiring, register the taskbar on the desktop, and repoint `<iconostat-window>.minimize()`/`reset()` at it (with a fixture fallback), closing the SP-A `#tasks` coupling.

**Files:**
- Create: `assets/iconostat/taskbar.js`
- Modify: `assets/iconostat/index.js`, `assets/iconostat/desktop.js`, `assets/iconostat/window.js`
- Modify: `assets/js/window.js` (remove the start-button handler — now in the taskbar)
- Modify: `layouts/home.html` (`#tasks` → `<iconostat-taskbar>`)

**Interfaces:**
- Consumes: `getDesktop()`, the `iconostat-menu-open` event (Task 1).
- Produces:
  - `<iconostat-taskbar>` element; on connect it adds `class="tasks"`, registers itself via `getDesktop().registerTaskbar(this)`, and wires its `.start-button` child's click to dispatch `iconostat-menu-open` at the start anchor.
  - `IconostatDesktop.registerTaskbar(el)` + `get taskbar()`.
  - `<iconostat-window>.minimize()`/`reset()` relocate the window into `getDesktop().taskbar` (falling back to `document.getElementById('tasks')` when absent).

- [ ] **Step 1: Add taskbar registration to the desktop**

In `assets/iconostat/desktop.js`, add:
```javascript
registerTaskbar(el) { this._taskbar = el; }
get taskbar() { return this._taskbar || document.getElementById('tasks'); }
```
(The getter's fallback keeps `<iconostat-window>` working in a fixture that uses a plain `#tasks` or none.)

- [ ] **Step 2: Create the taskbar element**

Create `assets/iconostat/taskbar.js`:
```javascript
import { getDesktop } from './index.js';

export class IconostatTaskbar extends HTMLElement {
  connectedCallback() {
    if (this._wired) return;
    this._wired = true;
    this.classList.add('tasks');
    getDesktop().registerTaskbar(this);
    const startButton = this.querySelector('.start-button');
    if (startButton) {
      startButton.addEventListener('click', () => {
        const r = startButton.getBoundingClientRect();
        document.dispatchEvent(new CustomEvent('iconostat-menu-open', {
          detail: { x: r.left + startButton.offsetWidth / 2, y: r.top, offset: true }
        }));
      });
    }
  }
}
```

- [ ] **Step 3: Register the element**

In `assets/iconostat/index.js`:
```javascript
import { IconostatTaskbar } from './taskbar.js';
if (!customElements.get('iconostat-taskbar')) customElements.define('iconostat-taskbar', IconostatTaskbar);
export { IconostatTaskbar };
```

- [ ] **Step 4: Repoint minimize()/reset() at the taskbar**

In `assets/iconostat/window.js`, replace the three `document.getElementById('tasks')` references in `minimize()` and `reset()` with `getDesktop().taskbar`. **Preserve every other detail verbatim**, including the `reset()` line that reads `document.getElementById(\`window-${this.id}\`)` — change only the `getElementById('tasks')` host lookup, e.g.:
```javascript
// minimize(), un-minimize branch — the appendChild/removeChild host:
const tasks = getDesktop().taskbar;
// ...tasks.appendChild(this) / tasks.removeChild(document.getElementById(this.id))...
```
`assets/iconostat/window.js` already imports `getDesktop` — confirm and reuse it.

- [ ] **Step 5: Convert the markup and remove the temporary start-button glue**

In `layouts/home.html`, change `<div class="tasks" id="tasks">` to `<iconostat-taskbar id="tasks">` and its closing `</div>` to `</iconostat-taskbar>` (leave the `.start-button` child unchanged).

In `assets/js/window.js`, delete the start-button click handler added in Task 1 (the taskbar now owns it) and the now-unused `const startButton = document.getElementById('start-button');` line.

- [ ] **Step 6: Run the suite**

```bash
cd /home/node/.agent-os/worktrees/tuckermclean.com-nice-phoenix && export LD_LIBRARY_PATH=/home/node/.cache/chrome-deps/usr/lib/x86_64-linux-gnu:/home/node/.cache/chrome-deps/lib/x86_64-linux-gnu:/home/node/.cache/chrome-deps/usr/lib:/home/node/.cache/chrome-deps/lib && npx vitest run && npm run test:e2e
```
Expected: full suite green — `chrome.spec` (start menu still opens from the taskbar's button), `windows`/`desktop`/`state` (minimize relocates the window into the taskbar and restores) all pass.

- [ ] **Step 7: Commit**

```bash
git add assets/iconostat/taskbar.js assets/iconostat/index.js assets/iconostat/desktop.js assets/iconostat/window.js assets/js/window.js layouts/home.html
git commit -m "refactor(iconostat): extract <iconostat-taskbar>; decouple minimize() from #tasks"
```

---

### Task 3: Standalone fixture proves the taskbar/minimize decoupling

Extend the dev-only fixture to mount a taskbar and assert that `minimize()` relocates a window into it with zero site glue.

**Files:**
- Modify: `layouts/_default/iconostat-fixture.html`
- Modify: `tests/e2e/iconostat-fixture.spec.js`

**Interfaces:**
- Consumes: `<iconostat-taskbar>`, `<iconostat-window>.minimize()`.
- Produces: fixture coverage of minimize-into-taskbar without site code.

- [ ] **Step 1: Add a taskbar to the fixture**

In `layouts/_default/iconostat-fixture.html`, inside the gated body, add an `<iconostat-taskbar id="tasks"></iconostat-taskbar>` before the `<iconostat-desktop>` (mirroring the real page order), so the library registers it. No site glue is added.

- [ ] **Step 2: Write the failing test**

Add to `tests/e2e/iconostat-fixture.spec.js`:
```javascript
test('minimize relocates the window into the taskbar with no site glue', async ({ page }) => {
  await page.goto('/iconostat-fixture/');
  const win = page.locator('iconostat-window#window-fixture');
  await expect(win).toBeVisible();
  await page.evaluate(() => document.querySelector('iconostat-window').minimize());
  await expect(page.locator('iconostat-taskbar #window-fixture')).toHaveCount(1);
  expect(await page.evaluate(() => typeof window.openPage)).toBe('undefined');
});
```

- [ ] **Step 3: Run it**

```bash
cd /home/node/.agent-os/worktrees/tuckermclean.com-nice-phoenix && export LD_LIBRARY_PATH=/home/node/.cache/chrome-deps/usr/lib/x86_64-linux-gnu:/home/node/.cache/chrome-deps/lib/x86_64-linux-gnu:/home/node/.cache/chrome-deps/usr/lib:/home/node/.cache/chrome-deps/lib && npx playwright test tests/e2e/iconostat-fixture.spec.js --project=desktop
```
Expected: the new test passes (window ends up inside the taskbar), plus the existing fixture tests. Then run the full suite: `npm run test:e2e` (now 46 e2e).

- [ ] **Step 4: Commit**

```bash
git add layouts/_default/iconostat-fixture.html tests/e2e/iconostat-fixture.spec.js
git commit -m "test(iconostat): fixture proves minimize-into-taskbar with no site glue"
```

---

### Task 4: CSS closure — relocate chrome styles, collapse DUP:SP-B

Finish the Task-1 (SP-A) split: move `.menu`/`.tasks`/`.start-button` styles into the library and collapse the three `DUP:SP-B` duplicated rules back into single rules. Pixel-identical.

**Files:**
- Modify: `assets/css/style.css` (remove chrome rules + the site-side DUP copies)
- Modify: `assets/iconostat/iconostat.css` (receive chrome rules; merge DUP pairs)

**Interfaces:**
- Consumes: relocated CSS from SP-A.
- Produces: all window/desktop/taskbar/menu CSS owned by the library; no `DUP:SP-B` markers remain.

- [ ] **Step 1: Relocate the chrome rules**

Move these rule blocks from `assets/css/style.css` into `assets/iconostat/iconostat.css` (preserve their declarations byte-for-byte and keep relative order sensible within the chrome group): `.menu` (243), `.menu.active` (249), `.menu-item` (256), `.menu-item:last-child` (261), `.menu-separator` (265), `.menu-item:hover, .menu-separator:hover` (270), `.tasks` (276), `.start-button` (285), `.start-button .start-button-icon` (301), the mobile `@media` `.start-button` (310) and `.menu` (316) blocks. (Line numbers are pre-edit; grep to confirm: `grep -nE '^\s*\.(menu|tasks|start-button)' assets/css/style.css`.)

- [ ] **Step 2: Collapse the 3 `DUP:SP-B` pairs**

For each pair, merge the two now-co-located rules in `iconostat.css` into ONE rule with the combined selector list, and delete the site-side copy in `style.css`, removing all six `/* DUP:SP-B ... */` markers:
- `window-menu-base` (`iconostat.css:11` `.window,.window-header,.window-status-bar,.grippy {…}` + `style.css:315` `.menu,.start-button {…}`) → one rule `.window, .window-header, .window-status-bar, .grippy, .menu, .start-button { …same declarations… }` in `iconostat.css`.
- `print-natural-flow` (`iconostat.css:306` + `style.css:498`) → merge selector lists into the single `iconostat.css` rule.
- `print-hide-window-chrome` (`iconostat.css:321` + `style.css:527`, the `@media` `... .menu, .start-button ...` display:none) → merge into the single `iconostat.css` rule.
Verify no markers remain: `grep -rn "DUP:SP-B" assets/` → empty.

- [ ] **Step 3: Verify pixel-identical**

```bash
cd /home/node/.agent-os/worktrees/tuckermclean.com-nice-phoenix && export LD_LIBRARY_PATH=/home/node/.cache/chrome-deps/usr/lib/x86_64-linux-gnu:/home/node/.cache/chrome-deps/lib/x86_64-linux-gnu:/home/node/.cache/chrome-deps/usr/lib:/home/node/.cache/chrome-deps/lib && npx hugo --gc && npm run test:e2e
```
Expected: build clean; full suite green (the e2e suite asserts chrome visibility/layout). If any of the moved/merged rules involved a theme-varying value, additionally do a targeted before/after theme-toggle screenshot comparison (start menu open, both themes) and confirm no diff; otherwise the suite suffices.

- [ ] **Step 4: Commit**

```bash
git add assets/css/style.css assets/iconostat/iconostat.css
git commit -m "refactor(iconostat): relocate chrome CSS into the library; collapse DUP:SP-B"
```

---

### Task 5: README v2 + dead-glue removal + extractability check

Finalize docs and confirm the library stays site-coupling-free.

**Files:**
- Modify: `assets/iconostat/README.md`
- Modify: `assets/js/window.js` (remove any now-dead glue)

**Interfaces:**
- Consumes: everything above.
- Produces: final SP-B state.

- [ ] **Step 1: Prune dead glue**

In `assets/js/window.js`, confirm `toggleMenu` and all menu/start/context wiring are gone and remove any now-orphaned locals. The IIFE should retain only: mode-init (localStorage light/dark), the `popstate` → `openPageFromUrl` listener, and the initial `if (typeof(getDesktop().getTop()) === 'undefined') openPageFromUrl();`. Grep to confirm nothing references removed symbols: `grep -n "toggleMenu\|start-button\|getElementById('menu')" assets/js/window.js` → empty.

- [ ] **Step 2: Extractability check**

```bash
cd /home/node/.agent-os/worktrees/tuckermclean.com-nice-phoenix && grep -rnE "hugo|\.Site|\.\./js/|window\.(openPage|goTo|windowCleanup)" assets/iconostat/ || echo "clean"
```
Expected: `clean` (only explanatory comments, no site imports). The menu/taskbar elements must not reference site globals — items are site-authored children, reached only via the DOM.

- [ ] **Step 3: Update the README**

In `assets/iconostat/README.md`, add `<iconostat-taskbar>` and `<iconostat-menu>` to the element catalog; document the `iconostat-menu-open` event (`detail:{x,y,offset}`), `IconostatDesktop.zIndex`, `registerTaskbar`/`taskbar`; and note that menu *items* and the idle/link status-bar behaviors are site-provided (the library owns the menu mechanism and the taskbar host, not the content). Update/remove the SP-A "`#tasks` host requirement" limitation note now that `minimize()` resolves the taskbar via `getDesktop().taskbar`.

- [ ] **Step 4: Full green + build**

```bash
cd /home/node/.agent-os/worktrees/tuckermclean.com-nice-phoenix && export LD_LIBRARY_PATH=/home/node/.cache/chrome-deps/usr/lib/x86_64-linux-gnu:/home/node/.cache/chrome-deps/lib/x86_64-linux-gnu:/home/node/.cache/chrome-deps/usr/lib:/home/node/.cache/chrome-deps/lib && npx vitest run && npm run test:e2e && npx hugo --gc
```
Expected: unit 12/12, e2e green, production build clean (fixture route still excluded).

- [ ] **Step 5: Commit**

```bash
git add assets/js/window.js assets/iconostat/README.md
git commit -m "refactor(iconostat): SP-B docs + dead-glue removal; extractability verified"
```

---

## Self-Review

**Spec coverage:**
- `<iconostat-taskbar>` → Task 2. ✓
- `<iconostat-menu>` (start + context) → Task 1. ✓
- No taskbtn / no separate statusbar (scope reshaping) → honored: not built; per-window status bar untouched (SP-A). ✓
- minimize() decoupling from `#tasks` → Task 2 (desktop `taskbar` slot + fallback). ✓
- CSS closure + collapse `DUP:SP-B` → Task 4. ✓
- Public `zIndex` accessor (drop `_z` reach-in) → Task 1. ✓
- Standalone fixture proof → Task 3. ✓
- Idle/link status stay site-side → untouched (Task 5 documents it). ✓
- README v2 + extractability grep → Task 5. ✓
- Green at every commit → each task ends with suite run + commit. ✓
- Locked bugs / reflow race preserved → Global Constraints + Task 2's verbatim note. ✓

**Placeholder scan:** element classes and wiring shown in full; relocation steps name exact functions/line-anchors and the grep to confirm; no "TBD"/"similar to". ✓

**Type consistency:** `iconostat-menu-open` (`detail:{x,y,offset}`) dispatched in Task 1 (start button) and Task 2 (taskbar), handled by the menu (Task 1). `getDesktop().zIndex` (Task 1) used by the menu. `registerTaskbar`/`taskbar` (Task 2) used by `minimize()`/`reset()` (Task 2) and the fixture (Task 3). Consistent. ✓
