# Test Baseline Design — tuckermclean.com

**Date:** 2026-08-02
**Status:** Approved design, pending implementation plan
**Author:** Tucker McLean (with Claude)

## Purpose

The window manager and SPA routing (currently vanilla JS ES modules in
`assets/js/window.js`) are slated to be re-implemented in a modern web GUI
framework (React or similar — undecided). Before that port begins we need a
**provable baseline**: a test suite that pins down the *observable behavior* of
the current site so the port can be verified as behavior-preserving.

These are **characterization tests**. They assert only on rendered DOM and URL
state — never on `window.js` internals, function names, or module structure — so
they remain valid against both the current vanilla implementation and the future
framework implementation.

## Strategy

- **Black-box E2E via Playwright** for all window-manager and routing behavior.
  Framework-agnostic; survives the port unchanged. Playwright is already a
  project dependency and Chromium is already cached in the environment.
- **One Vitest unit test** for `env.js`, the single piece of genuinely pure,
  portable logic (hostname → config derivation).
- **Chat client is out of scope** — it requires a live WebSocket/auth backend
  and is not being refactored. We assert only that the chat *window opens*.

### Capturing current behavior as-is

The baseline documents behavior **exactly as it is today**, including any latent
bugs. If a test reveals clearly-buggy behavior, we **lock the current behavior
in the assertion** (so the suite stays green as a true "before" snapshot) and
**record the suspected bug** in the "Suspected bugs" section below for a separate
decision. We do not fix bugs as part of the baseline — that would make the
baseline diverge from the code being ported and would grow scope.

## Tooling & environment

| Concern | Choice | Rationale |
|---|---|---|
| E2E runner | `@playwright/test` | Auto-waiting web-first assertions, retries, HTML report, fixtures. Chromium cached. |
| Site build/serve | `hugo-extended` (pinned npm dev-dep) | No system Hugo present. Self-contained + version-pinned; works locally and in CI. |
| Serving during tests | `hugo server` on port 1313 via Playwright `webServer` | Single process, auto-serves, no separate static server. Playwright waits for the URL before running. |
| Unit runner | `vitest` + jsdom environment | `env.js` reads `window.location.hostname`; jsdom lets us stub it. |
| Viewport | Fixed **1280×900** (desktop, >768px) | Determinism. Avoids the mobile (`<=768`) code branch and stabilizes window offset math. |

Mobile (`<768`) behavior is **deferred** to a follow-up Playwright project.

### DOM contract (from `layouts/home.html`)

- Windows: `.window`, id `window-<name>`, `.window-title`, `.window-icon`,
  `.window-body`, `.window-status-bar`, `.grippy`; buttons `.button.close`,
  `.button.minimize`, `.button.maximize`; header `.window-header`.
- Front window: `.window.front`. Minimized windows live inside `#tasks`.
- Chrome: `#start-button`, `#menu` (with `.menu-item` entries), `#tasks`.
- Start menu wires directly to the functions under test:
  `openPage('welcome'|'intro'|'resume'|'writings'|'chat', <title>, <icon>)`,
  `toggleMode()`, `cascadeWindows()`, `tileWindows()`, `minimizeWindows()`.
- Pages available as fragments (uglyURLs): `welcome.html`, `intro.html`,
  `resume.html`, `writings.html`, `chat.html`.

## Directory layout

```
playwright.config.js
vitest.config.js
tests/
  e2e/
    boot.spec.js         # boot + deep-linking + history
    windows.spec.js      # open / close / minimize / maximize / shade
    zorder.spec.js       # focus & z-order
    dragresize.spec.js   # drag + resize, full coverage
    desktop.spec.js      # menu, cascade / tile / minimize-all, dark mode
  unit/
    env.test.js
```

`package.json` scripts:

- `test` → runs unit then e2e
- `test:unit` → `vitest run`
- `test:e2e` → `playwright test`
- `test:e2e:ui` → `playwright test --ui`

## E2E test list

Each test starts from a fresh browser context (Playwright default), so
`localStorage` and history are clean per test. Web-first assertions
(`expect(locator).toBeVisible()`, `expect(page).toHaveURL(...)`) provide
auto-waiting for the async `loadHTML` fetches.

### boot.spec.js — boot, deep-linking, history

1. Loading `/` boots to the **Welcome** window (visible, titled "Welcome!") and
   the URL normalizes to `/` (no hash).
2. Deep-link `/#/resume` opens the **Resume** window with loaded content.
3. Deep-link to an arbitrary slug opens a window titled from the slug
   (title-cased, dashes → spaces).
4. History: open A then B; browser **Back** returns to A, **Forward** returns to
   B (driven by `popstate` → `openPageFromUrl`).

### windows.spec.js — lifecycle

1. Clicking a start-menu item opens the window with the **correct title and
   icon**, and the URL hash becomes `#/<name>`.
2. Opening an already-open page does **not** duplicate it — count stays 1 and it
   is brought to front.
3. **Close** removes the window; URL updates to the promoted top window, or to
   `/` when the last window is closed.
4. **Minimize** moves the window into `#tasks`; clicking it **restores** and
   brings it to front.
5. **Maximize** toggles `.maximized`; restoring removes the class.
6. **Double-click header** toggles `.shaded`; double-clicking again unshades.

### zorder.spec.js — focus & z-order

1. With two windows open, clicking the rear window gives it `.front` and the
   highest `z-index` of all windows, and updates the URL hash to its name.

### dragresize.spec.js — drag + resize (full coverage)

Driven with Playwright's mouse API (`mouse.move/down/up`) at the fixed 1280×900
viewport.

1. Dragging the header by (dx, dy) moves the window by approximately (dx, dy)
   (within a small tolerance for rounding).
2. Drag constraint: while `clientY <= headerHeight/2`, the window's `top` does
   **not** update (matches the current `startDrag` guard); `left` still tracks.
3. Resizing via `.grippy` by (dx, dy) increases width/height by approximately
   (dx, dy) from the starting size.
4. Resize from a known starting size produces the expected final size (delta
   assertion with tolerance).

> Note: drag/resize are the most implementation-coupled behaviors and the most
> likely to need re-authoring for the framework port. Included here at full
> fidelity per explicit decision, to fully document current behavior.

### desktop.spec.js — menu & desktop actions

1. Start button opens `#menu`; right-click on the desktop opens `#menu`;
   clicking a `.menu-item` closes it.
2. **Cascade** and **Tile** un-minimize all windows and reposition them (all
   `.window` visible, none `.minimized`).
3. **Minimize All** moves every window into `#tasks`.
4. **Toggle Mode** flips `body.toggled` and persists `localStorage.mode`
   (`light`/`dark`) across a page reload.
5. Chat window **opens** (window appears with its form); no messaging asserted.

## Unit test list — env.test.js (Vitest + jsdom)

Stub `window.location.hostname` per case; call `envVars(false)` (skips the
network fetch) unless noted.

1. `tuckermclean.com` → `NAME='Tucker McLean'`, `INITIALS='TM'`,
   `EMAIL='me@tuckermclean.com'`.
2. `www.tuckermclean.com` → domain collapses to last two labels
   (`tuckermclean.com`); same identity as (1).
3. `alijamaluddin.com` → `Ali Jamaluddin` / `AJ` / `me@alijamaluddin.com`.
4. `technomantics.com` → `Developer McDev` / `DM` / `fakedev@technomantics.com`.
5. Unknown host (e.g. `example.org`) → defaults to the Tucker identity.
6. URL derivation for a given domain: `BASE_URL=https://<d>/`,
   `API_BASE_URL=https://api.<d>/`, `API_WS_BASE_URL=wss://api-ws.<d>/`.
7. `envVars(true)` with a mocked `fetch` returning `{ clientConfig }` → returned
   object merges/overrides base `ENV_VARS` with the fetched data.

## CI

New workflow `.github/workflows/test.yml`, independent from the existing
`deploy-to-s3.yml`:

- Trigger: `push` and `pull_request`.
- Steps: `npm ci` → `npx playwright install --with-deps chromium` →
  `npm run test:unit` → `npm run test:e2e`.
- On failure, upload the Playwright HTML report as a build artifact.

Deploy remains gated on its own workflow; wiring tests as a deploy prerequisite
is a later decision.

## Out of scope

- Chat messaging / WebSocket / auth flows (no live backend).
- The nested `writings` Hugo submodule build.
- Mobile (`<768`) viewport behavior.
- Visual/screenshot regression — the existing ad-hoc `qa-resume-compare.js`
  stays as-is and is not part of this suite.

## Suspected bugs

_(Populated during implementation as characterization reveals questionable
behavior. Each entry: observed behavior, why it looks wrong, and the test that
currently locks it in.)_

- None yet.

## Deliverables

1. Dev dependencies added: `@playwright/test`, `vitest`, `hugo-extended`
   (pinned).
2. `playwright.config.js` (webServer = `hugo server`, 1280×900, Chromium) and
   `vitest.config.js` (jsdom).
3. `package.json` test scripts.
4. E2E specs and the `env.js` unit test per the lists above.
5. `.github/workflows/test.yml`.
6. This design doc, kept updated with any suspected bugs found.
