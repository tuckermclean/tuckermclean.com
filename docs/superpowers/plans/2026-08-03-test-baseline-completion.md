# Test Baseline Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining coverage gaps in the characterization test suite (geometry restore, image-zoom, rubber-band selection, link status-bar, idle Easter eggs, resize→cascade, history recycling), add a mobile Playwright project, and add an informational coverage number — so the suite is a clean-lab safety net for a full window-manager rewrite.

**Architecture:** Extends the existing Playwright (E2E) + Vitest (unit) baseline. New characterization specs assert observable DOM/URL/geometry only. A second Playwright project runs mobile-viewport specs. Coverage is collected (Vitest v8 for `env.js`; Chromium V8 + `monocart-coverage-reports` for `window.js`/`main.js`, using a dev-only inline source map) and reported informationally — never gating CI.

**Tech Stack:** `@playwright/test`, `vitest` + `@vitest/coverage-v8`, `monocart-coverage-reports`, `hugo-bin`, Node 22.

## Global Constraints

- **Never modify site source** except the single authorized edit in `layouts/home.html` (dev-only inline source map, gated on `hugo.IsServer`). No changes to `assets/`, `content/`, `static/`, `hugo.toml`, or any other layout.
- **Characterization discipline:** every test must PASS against current behavior. If a test fails, the assertion is wrong — investigate real behavior and fix the assertion, never the source. Log surprising/buggy behavior in `docs/superpowers/specs/2026-08-03-test-baseline-completion-design.md` "Suspected bugs".
- **Determinism:** idle timer via Playwright `page.clock` (no real waits); debounced reflow via `expect.poll`; geometry assertions use **±2px** tolerance. Every new spec must pass **twice consecutively** before its task is done. A spec that can't be made stable is scoped down (never loosened to a vacuous assertion), and the reduction is logged in the task report.
- **Running E2E in this container:** Chromium system libraries are missing; before any Playwright command, export:
  `export LD_LIBRARY_PATH=/tmp/chrome-deps/usr/lib/x86_64-linux-gnu:/tmp/chrome-deps/lib/x86_64-linux-gnu`
  If `/tmp/chrome-deps` is gone, STOP and report BLOCKED (do not reinstall system libs).
- **Desktop viewport** fixed 1280×900; **mobile viewport** 390×844 (`hasTouch`, `isMobile`).
- **Shared helpers:** reuse `tests/e2e/helpers.js` (`openApp(page, hash='')`, `openViaMenu(page, label)`, `win(page, name)`); do not reimplement.
- **Commit trailers:** end every commit body with exactly:
  ```
  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01JzSVLX6pgikaWkSCgQFN33
  ```
- **Coverage is informational** — never add a threshold that fails CI.

## Characterization TDD note

The implementation already exists. Inverted loop: write the spec, run it, **expect PASS**. On failure, correct the assertion to match real behavior (never the source) and log surprises. "Expected: PASS" below is the characterization check.

## File structure

```
playwright.config.js                 # MODIFY: desktop+mobile projects; coverage globalTeardown
tests/mobile/mobile.spec.js          # CREATE: mobile-only behavior
tests/e2e/state.spec.js              # CREATE: geometry round-trip restore
tests/e2e/imagezoom.spec.js          # CREATE: click-to-zoom image window
tests/e2e/selection.spec.js          # CREATE: rubber-band selection
tests/e2e/chrome.spec.js             # CREATE: link status-bar + idle Easter eggs
tests/e2e/reflow.spec.js             # CREATE: viewport resize -> cascade
tests/e2e/boot.spec.js               # MODIFY: add history-recycling assertion
tests/e2e/fixtures.js                # CREATE: V8 coverage-collecting test fixture
coverage.config.js                   # CREATE: shared monocart options
tests/e2e/*.spec.js, tests/mobile/*  # MODIFY (Task 7): import test/expect from fixtures
layouts/home.html                    # MODIFY (Task 7): dev-only inline source map
package.json                         # MODIFY (Task 7): coverage dev-deps + scripts
vitest.config.js                     # MODIFY (Task 7): coverage config
.gitignore                           # MODIFY (Task 7): coverage/
.github/workflows/test.yml           # MODIFY (Task 8): coverage artifacts
```

---

### Task 1: Mobile Playwright project + mobile.spec.js

**Files:**
- Modify: `playwright.config.js` (projects)
- Create: `tests/mobile/mobile.spec.js`

**Interfaces:**
- Consumes: `openApp`, `openViaMenu`, `win` from `../e2e/helpers.js`.
- Produces: a `mobile` Playwright project (`testDir: tests/mobile`) and a `desktop` project (`testDir: tests/e2e`), both on Chromium, sharing the existing `webServer`.

- [ ] **Step 1: Restructure projects in `playwright.config.js`**

Replace the single `projects: [...]` array with two projects (keep everything else — `use`, `webServer`, reporters — unchanged):
```js
projects: [
  {
    name: 'desktop',
    testDir: './tests/e2e',
    use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } },
  },
  {
    name: 'mobile',
    testDir: './tests/mobile',
    use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true },
  },
],
```
Leave the top-level `testDir: './tests/e2e'` in place (project-level `testDir` overrides it per project).

- [ ] **Step 2: Write the mobile spec**

`tests/mobile/mobile.spec.js`:
```js
import { test, expect } from '@playwright/test';
import { openApp, openViaMenu, win } from '../e2e/helpers.js';

test('an opened window fits within the mobile viewport', async ({ page }) => {
  await openApp(page, 'resume');
  const box = await win(page, 'resume').boundingBox();
  expect(box.width).toBeLessThanOrEqual(390);
});

test('tapping a rear window brings it to front', async ({ page }) => {
  await openApp(page);                 // welcome
  await openViaMenu(page, 'Resume');   // resume front
  await expect(win(page, 'resume')).toHaveClass(/front/);
  // Welcome's top-left header corner is exposed (smaller cascade offset).
  await win(page, 'welcome').locator('.window-header').tap({ position: { x: 5, y: 5 } });
  await expect(win(page, 'welcome')).toHaveClass(/front/);
});

test('tapping a minimized window restores it', async ({ page }) => {
  await openApp(page, 'resume');
  await win(page, 'resume').locator('.button.minimize').tap();
  await expect(win(page, 'resume')).toHaveClass(/minimized/);
  await page.locator('#tasks #window-resume').tap();
  await expect(win(page, 'resume')).not.toHaveClass(/minimized/);
  await expect(win(page, 'resume')).toHaveClass(/front/);
});

test('the start menu opens and closes via tap', async ({ page }) => {
  await openApp(page);
  await page.locator('#start-button').tap();
  await expect(page.locator('#menu')).toHaveClass(/active/);
  await page.locator('#menu .menu-item', { hasText: 'Toggle Mode' }).tap();
  await expect(page.locator('#menu')).not.toHaveClass(/active/);
});

test('touch-dragging the header moves the window (best-effort)', async ({ page }) => {
  await openApp(page, 'resume');
  const w = win(page, 'resume');
  const before = await w.evaluate(el => ({ left: el.offsetLeft, top: el.offsetTop }));
  const box = await w.locator('.window-header').boundingBox();
  // Synthetic touch drag: startDrag reads e.touches[0]. Dispatch a coherent
  // touchstart -> touchmove -> touchend sequence on the header element.
  await w.locator('.window-header').evaluate((header, box) => {
    const mk = (type, x, y) => {
      const t = new Touch({ identifier: 1, target: header, clientX: x, clientY: y });
      return new TouchEvent(type, { touches: type === 'touchend' ? [] : [t], targetTouches: type === 'touchend' ? [] : [t], changedTouches: [t], bubbles: true, cancelable: true });
    };
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    header.dispatchEvent(mk('touchstart', cx, cy));
    document.dispatchEvent(mk('touchmove', cx + 80, cy + 70));
    document.dispatchEvent(mk('touchend', cx + 80, cy + 70));
  }, box);
  const after = await w.evaluate(el => ({ left: el.offsetLeft, top: el.offsetTop }));
  expect(after.left).not.toBe(before.left);
});
```

- [ ] **Step 3: Run the mobile project twice**

```bash
export LD_LIBRARY_PATH=/tmp/chrome-deps/usr/lib/x86_64-linux-gnu:/tmp/chrome-deps/lib/x86_64-linux-gnu
npm run test:e2e -- --project=mobile
npm run test:e2e -- --project=mobile
```
Expected: PASS both runs. If the best-effort touch-drag test is flaky or fails (touch event dispatch differs), scope it down to a smoke assertion that the header is present and tappable (`await expect(w.locator('.window-header')).toBeVisible()`), document the reduction, and keep the other four tests. Adjust the tap `position` for the rear-window test if the corner isn't exposed at this viewport.

- [ ] **Step 4: Confirm the desktop project still runs**

```bash
export LD_LIBRARY_PATH=/tmp/chrome-deps/usr/lib/x86_64-linux-gnu:/tmp/chrome-deps/lib/x86_64-linux-gnu
npm run test:e2e -- --project=desktop
```
Expected: all existing desktop specs still PASS (23 tests).

- [ ] **Step 5: Commit**

```bash
git add playwright.config.js tests/mobile/mobile.spec.js
git commit -m "test: add mobile Playwright project characterizing touch + mobile layout"
```

---

### Task 2: state.spec.js — geometry round-trip restore

**Files:**
- Create: `tests/e2e/state.spec.js`

**Interfaces:**
- Consumes: `openApp`, `win` from `./helpers.js`.

- [ ] **Step 1: Write the spec**

`tests/e2e/state.spec.js`:
```js
import { test, expect } from '@playwright/test';
import { openApp, win } from './helpers.js';

const TOL = 2;
const boxOf = (locator) =>
  locator.evaluate(el => ({ top: el.offsetTop, left: el.offsetLeft, width: el.offsetWidth, height: el.offsetHeight }));
const near = (a, b) => Math.abs(a - b) <= TOL;

test('maximize then restore returns the window to its prior box', async ({ page }) => {
  await openApp(page, 'resume');
  const w = win(page, 'resume');
  const before = await boxOf(w);
  await w.locator('.button.maximize').click();
  await expect(w).toHaveClass(/maximized/);
  await w.locator('.button.maximize').click();
  await expect(w).not.toHaveClass(/maximized/);
  const after = await boxOf(w);
  expect(near(after.top, before.top) && near(after.left, before.left)
      && near(after.width, before.width) && near(after.height, before.height)).toBe(true);
});

test('minimize then restore returns the window to its prior box', async ({ page }) => {
  await openApp(page, 'resume');
  const w = win(page, 'resume');
  const before = await boxOf(w);
  await w.locator('.button.minimize').click();
  await expect(w).toHaveClass(/minimized/);
  await page.locator('#tasks #window-resume').click();
  await expect(w).not.toHaveClass(/minimized/);
  const after = await boxOf(w);
  expect(near(after.top, before.top) && near(after.left, before.left)
      && near(after.width, before.width) && near(after.height, before.height)).toBe(true);
});

test('shade then unshade restores top and height', async ({ page }) => {
  await openApp(page, 'resume');
  const w = win(page, 'resume');
  const before = await boxOf(w);
  await w.locator('.window-header').dblclick();
  await expect(w).toHaveClass(/shaded/);
  await w.locator('.window-header').dblclick();
  await expect(w).not.toHaveClass(/shaded/);
  const after = await boxOf(w);
  expect(near(after.top, before.top) && near(after.height, before.height)).toBe(true);
});
```

- [ ] **Step 2: Run twice**

```bash
export LD_LIBRARY_PATH=/tmp/chrome-deps/usr/lib/x86_64-linux-gnu:/tmp/chrome-deps/lib/x86_64-linux-gnu
npm run test:e2e -- --project=desktop state.spec.js
npm run test:e2e -- --project=desktop state.spec.js
```
Expected: PASS both. If a restore is off by more than 2px in a way that reflects real behavior (e.g. shade adjusts `top` by half a header height and doesn't fully restore), correct the assertion to the observed value and log the finding as a suspected bug.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/state.spec.js
git commit -m "test: characterize window geometry round-trip on maximize/minimize/shade"
```

---

### Task 3: imagezoom.spec.js — click-to-zoom image window

**Files:**
- Create: `tests/e2e/imagezoom.spec.js`

**Interfaces:**
- Consumes: `openApp`, `win` from `./helpers.js`.

- [ ] **Step 1: Confirm the post fragment serves with its image**

```bash
export LD_LIBRARY_PATH=/tmp/chrome-deps/usr/lib/x86_64-linux-gnu:/tmp/chrome-deps/lib/x86_64-linux-gnu
# Start hugo via a throwaway test run, or manually: npx hugo server & then:
curl -s http://localhost:1313/posts/my-cloud-journey.html | grep -o 'feature-image[^>]*' | head
```
Expected: a `<img class="feature-image" src="/aws_graph.png">` line. If `/posts/my-cloud-journey.html` 404s, use `#/posts/the-reminder` (image `images/the-reminder.jpg`, slug `img-the-reminder`) throughout this spec instead.

- [ ] **Step 2: Write the spec**

`tests/e2e/imagezoom.spec.js`:
```js
import { test, expect } from '@playwright/test';
import { openApp, win } from './helpers.js';

// aws_graph.png -> filename 'aws_graph' -> non-alnum ('_') to '-' -> 'aws-graph'
const ZOOM = 'img-aws-graph';

test('clicking a feature image opens a zoomable image window', async ({ page }) => {
  await openApp(page, 'posts/my-cloud-journey');
  const img = win(page, 'posts/my-cloud-journey').locator('img.feature-image');
  await expect(img).toBeVisible();
  await img.click();
  await expect(win(page, ZOOM)).toBeVisible();
  await expect(win(page, ZOOM).locator('.window-body img')).toBeVisible();
});

test('wheel over the image window zooms it (width grows)', async ({ page }) => {
  await openApp(page, 'posts/my-cloud-journey');
  await win(page, 'posts/my-cloud-journey').locator('img.feature-image').click();
  const zoomImg = win(page, ZOOM).locator('.window-body img');
  await expect(zoomImg).toBeVisible();
  const w0 = await zoomImg.evaluate(el => el.getBoundingClientRect().width);
  await win(page, ZOOM).locator('.window-body').dispatchEvent('wheel', { deltaY: -120 });
  await expect.poll(async () => zoomImg.evaluate(el => el.getBoundingClientRect().width)).toBeGreaterThan(w0);
});

test('clicking the same image again does not duplicate the zoom window', async ({ page }) => {
  await openApp(page, 'posts/my-cloud-journey');
  const img = win(page, 'posts/my-cloud-journey').locator('img.feature-image');
  await img.click();
  await expect(win(page, ZOOM)).toHaveCount(1);
  await img.click();
  await expect(win(page, ZOOM)).toHaveCount(1);
  await expect(win(page, ZOOM)).toHaveClass(/front/);
});
```

- [ ] **Step 3: Run twice**

```bash
export LD_LIBRARY_PATH=/tmp/chrome-deps/usr/lib/x86_64-linux-gnu:/tmp/chrome-deps/lib/x86_64-linux-gnu
npm run test:e2e -- --project=desktop imagezoom.spec.js
npm run test:e2e -- --project=desktop imagezoom.spec.js
```
Expected: PASS both. If `dispatchEvent('wheel', ...)` doesn't trigger zoom (handler reads `e.deltaY`), pass the property as shown; if the window name differs, read the actual `#window-img-*` id from the DOM and correct `ZOOM`.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/imagezoom.spec.js
git commit -m "test: characterize click-to-zoom image window (open, wheel zoom, dedupe)"
```

---

### Task 4: selection.spec.js — rubber-band desktop selection

**Files:**
- Create: `tests/e2e/selection.spec.js`

**Interfaces:**
- Consumes: `openApp`, `win` from `./helpers.js`.

- [ ] **Step 1: Write the spec**

Note the mousedown handler ignores targets inside `.window, .tasks, .menu, .start-button`, so the drag must START on empty desktop. Use a corner far from the centered window, then drag across the window.

`tests/e2e/selection.spec.js`:
```js
import { test, expect } from '@playwright/test';
import { openApp, win } from './helpers.js';

async function dragSelect(page, from, to, { release = true } = {}) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  if (release) await page.mouse.up();
}

test('dragging on empty desktop shows the selection box and selects overlapped windows', async ({ page }) => {
  await openApp(page, 'resume');
  const box = await win(page, 'resume').boundingBox();
  // Start at top-left empty corner, drag through the window's center.
  await dragSelect(page, { x: 5, y: 5 }, { x: box.x + box.width / 2, y: box.y + box.height / 2 }, { release: false });
  await expect(page.locator('#desktop-select')).toBeVisible();
  await expect(win(page, 'resume')).toHaveClass(/desktop-selected/);
  await page.mouse.up();
});

test('mouseup clears the selection box and selected state', async ({ page }) => {
  await openApp(page, 'resume');
  const box = await win(page, 'resume').boundingBox();
  await dragSelect(page, { x: 5, y: 5 }, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
  await expect(page.locator('#desktop-select')).toBeHidden();
  await expect(win(page, 'resume')).not.toHaveClass(/desktop-selected/);
});

test('Escape during a drag clears the selection', async ({ page }) => {
  await openApp(page, 'resume');
  const box = await win(page, 'resume').boundingBox();
  await dragSelect(page, { x: 5, y: 5 }, { x: box.x + box.width / 2, y: box.y + box.height / 2 }, { release: false });
  await expect(win(page, 'resume')).toHaveClass(/desktop-selected/);
  await page.keyboard.press('Escape');
  await expect(page.locator('#desktop-select')).toBeHidden();
  await expect(win(page, 'resume')).not.toHaveClass(/desktop-selected/);
  await page.mouse.up();
});
```

- [ ] **Step 2: Run twice**

```bash
export LD_LIBRARY_PATH=/tmp/chrome-deps/usr/lib/x86_64-linux-gnu:/tmp/chrome-deps/lib/x86_64-linux-gnu
npm run test:e2e -- --project=desktop selection.spec.js
npm run test:e2e -- --project=desktop selection.spec.js
```
Expected: PASS both. If the corner (5,5) is covered by a window at this viewport, pick a different empty spot (e.g. bottom-right `{x:1250,y:840}` if that's clear of the taskbar). `#desktop-select` uses `display:none` when cleared — `toBeHidden()` matches.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/selection.spec.js
git commit -m "test: characterize rubber-band desktop selection (draw, clear, Escape)"
```

---

### Task 5: chrome.spec.js — link status-bar + idle Easter eggs

**Files:**
- Create: `tests/e2e/chrome.spec.js`

**Interfaces:**
- Consumes: `openApp`, `win` from `./helpers.js`.

- [ ] **Step 1: Write the spec**

The idle messages set (verbatim from `main.js`) and the revert string are hard-coded below. The idle timer fires at 45s and reverts after 8s; `page.clock` controls both.

`tests/e2e/chrome.spec.js`:
```js
import { test, expect } from '@playwright/test';
import { openApp, win } from './helpers.js';

const IDLE_MSGS = [
  'Status: It is now safe to turn off your computer.',
  'Status: General Protection Fault. Just kidding.',
  'Status: Press F1 for help. Press F2 to be confused.',
  'Status: Insert disk 2 of 47 to continue.',
  "Status: Error 418: I'm a teapot.",
  'Status: Have you tried turning it off and on again?',
  'Status: Searching for intelligent life... still searching...',
];
const DEFAULT_STATUS = 'Status: Ready to work!';

test('hovering a link shows its href in the status bar, mouseout resets it', async ({ page }) => {
  await openApp(page, 'resume');
  const w = win(page, 'resume');
  const link = w.locator('.window-body a[href]').first();
  const href = await link.getAttribute('href');
  await link.hover();
  await expect(w.locator('.window-status-bar')).toHaveText(href);
  // Move away from the link.
  await w.locator('.window-title').hover();
  await expect(w.locator('.window-status-bar')).toHaveText(DEFAULT_STATUS);
});

test('external links are hardened with target=_blank and rel', async ({ page }) => {
  await openApp(page, 'resume');
  const gh = win(page, 'resume').locator('.window-body a[href*="github.com"]').first();
  await expect(gh).toHaveAttribute('target', '_blank');
  await expect(gh).toHaveAttribute('rel', 'noopener noreferrer');
});

test('after 45s idle the status bar shows an Easter egg, then reverts after 8s', async ({ page }) => {
  await page.clock.install();
  await openApp(page);                 // welcome front window
  await page.clock.runFor(300);        // flush any init timers
  await page.clock.fastForward(45000); // trigger idle
  const bar = page.locator('.window.front .window-status-bar');
  await expect.poll(async () => (await bar.textContent()).trim()).toEqual(
    expect.stringMatching(new RegExp(IDLE_MSGS.map(m => m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')))
  );
  await page.clock.fastForward(8000);  // revert
  await expect(bar).toHaveText(DEFAULT_STATUS);
});
```

- [ ] **Step 2: Run twice**

```bash
export LD_LIBRARY_PATH=/tmp/chrome-deps/usr/lib/x86_64-linux-gnu:/tmp/chrome-deps/lib/x86_64-linux-gnu
npm run test:e2e -- --project=desktop chrome.spec.js
npm run test:e2e -- --project=desktop chrome.spec.js
```
Expected: PASS both. If `openApp` stalls under the faked clock (init used a real-timer path), increase the `runFor` flush. If hover status text includes a trailing space, use `toContainText(href)` or compare trimmed. If the first resume link is `tel:`/`mailto:`, that's fine — assert its actual href.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/chrome.spec.js
git commit -m "test: characterize link status-bar hover and idle Easter-egg messages"
```

---

### Task 6: reflow.spec.js + boot.spec.js recycling assertion

**Files:**
- Create: `tests/e2e/reflow.spec.js`
- Modify: `tests/e2e/boot.spec.js` (add one test)

**Interfaces:**
- Consumes: `openApp`, `openViaMenu`, `win` from `./helpers.js`.

- [ ] **Step 1: Write the reflow spec**

`tests/e2e/reflow.spec.js`:
```js
import { test, expect } from '@playwright/test';
import { openApp, openViaMenu, win } from './helpers.js';

test('resizing the viewport re-cascades and un-minimizes all windows', async ({ page }) => {
  await openApp(page);                 // welcome
  await openViaMenu(page, 'Resume');   // + resume
  await win(page, 'resume').locator('.button.minimize').click();
  await expect(win(page, 'resume')).toHaveClass(/minimized/);

  await page.setViewportSize({ width: 1024, height: 768 }); // triggers debounced cascade (300ms)

  // Poll past the debounce: both windows un-minimized, direct children of body.
  await expect.poll(async () =>
    win(page, 'resume').evaluate(el => !el.classList.contains('minimized') && el.parentElement === document.body)
  , { timeout: 3000 }).toBe(true);
  await expect(page.locator('body > #window-welcome')).toBeVisible();
  await expect(page.locator('body > #window-resume')).toBeVisible();
});
```

- [ ] **Step 2: Add the recycling test to `boot.spec.js`**

Append this test to `tests/e2e/boot.spec.js` (it already imports `openApp`, `openViaMenu`, `win`):
```js
test('back/forward recycles windows rather than duplicating them', async ({ page }) => {
  await openApp(page);                 // welcome
  await openViaMenu(page, 'Resume');   // resume
  await openViaMenu(page, 'Intro');    // intro
  const countBefore = await page.locator('.window').count();
  await page.goBack();
  await expect(win(page, 'resume')).toHaveClass(/front/);
  await page.goForward();
  await expect(win(page, 'intro')).toHaveClass(/front/);
  await expect(page.locator('.window')).toHaveCount(countBefore);
});
```

- [ ] **Step 3: Run both twice**

```bash
export LD_LIBRARY_PATH=/tmp/chrome-deps/usr/lib/x86_64-linux-gnu:/tmp/chrome-deps/lib/x86_64-linux-gnu
npm run test:e2e -- --project=desktop reflow.spec.js boot.spec.js
npm run test:e2e -- --project=desktop reflow.spec.js boot.spec.js
```
Expected: PASS both (boot goes from 4 to 5 tests). If the recycling assumption is wrong (count changes across back/forward), correct the assertion to the observed count and log how `navigateToPage`/`openPage` actually behaves on popstate.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/reflow.spec.js tests/e2e/boot.spec.js
git commit -m "test: characterize resize->cascade reflow and back/forward window recycling"
```

---

### Task 7: Coverage instrumentation (informational)

**Files:**
- Create: `tests/e2e/fixtures.js`, `coverage.config.js`
- Modify: `playwright.config.js` (globalTeardown), `vitest.config.js`, `package.json`, `.gitignore`, `layouts/home.html`, and the import line of every spec under `tests/e2e/*.spec.js` and `tests/mobile/*.spec.js`

**Interfaces:**
- Consumes: all existing specs.
- Produces: `npm run test:unit:cov` (Vitest v8 coverage for `env.js`) and E2E V8 coverage remapped to `assets/js/**` via monocart, written to `coverage/`.

- [ ] **Step 1: Add dev dependencies**

```bash
npm install -D @vitest/coverage-v8@^2.1.9 monocart-coverage-reports@^2.12.0
```
(Match the installed `vitest` major; adjust the caret if npm resolves differently.)

- [ ] **Step 2: Enable a dev-only inline source map in `layouts/home.html`**

Find:
```
{{ $jsOpts := dict "minify" true "targetPath" "js/bundle.js" }}
{{ $js := resources.Get "js/main.js" | js.Build $jsOpts | resources.Fingerprint }}
```
Replace the first line's follow-up so the map is emitted ONLY under `hugo server` (inline avoids fingerprint/URL desync; production `hugo --minify` is unchanged):
```
{{ $jsOpts := dict "minify" true "targetPath" "js/bundle.js" }}
{{ if hugo.IsServer }}{{ $jsOpts = merge $jsOpts (dict "sourceMap" "inline") }}{{ end }}
{{ $js := resources.Get "js/main.js" | js.Build $jsOpts | resources.Fingerprint }}
```
Verify prod output is unaffected:
```bash
npx hugo --minify --destination /tmp/hugo-prod-check >/dev/null 2>&1
grep -rl "sourceMappingURL" /tmp/hugo-prod-check/js/ || echo "OK: no source map in production build"
```
Expected: `OK: no source map in production build`.

- [ ] **Step 3: Create shared monocart options `coverage.config.js`**

```js
// Shared monocart-coverage-reports options (used by the E2E fixture + teardown).
export const coverageOptions = {
  name: 'window-manager E2E coverage',
  outputDir: './coverage/e2e',
  reports: [['v8'], ['console-summary']],
  // Keep only our source files (drop node/hugo/bundled runtime).
  sourceFilter: (sourcePath) => sourcePath.includes('assets/js/'),
  cleanCache: true,
};
```

- [ ] **Step 4: Create the coverage fixture `tests/e2e/fixtures.js`**

```js
import { test as base, expect } from '@playwright/test';
import { addCoverageReport } from 'monocart-coverage-reports';
import { coverageOptions } from '../../coverage.config.js';

// Auto fixture: collect Chromium V8 JS coverage around every test and feed it
// to monocart. No-op on non-Chromium (page.coverage is Chromium-only), but both
// projects here are Chromium.
export const test = base.extend({
  autoCoverage: [async ({ page }, use) => {
    const supported = typeof page.coverage?.startJSCoverage === 'function';
    if (supported) await page.coverage.startJSCoverage({ resetOnNavigation: false });
    await use();
    if (supported) {
      const jsCoverage = await page.coverage.stopJSCoverage();
      await addCoverageReport(jsCoverage, { coverageOptions });
    }
  }, { auto: true }],
});

export { expect };
```

- [ ] **Step 5: Wire the teardown in `playwright.config.js`**

Add a `globalTeardown` that generates the final report:
```js
export default defineConfig({
  // ...existing config...
  globalTeardown: './tests/e2e/coverage-teardown.js',
});
```
And create `tests/e2e/coverage-teardown.js`:
```js
import { CoverageReport } from 'monocart-coverage-reports';
import { coverageOptions } from '../../coverage.config.js';

export default async function globalTeardown() {
  const report = new CoverageReport(coverageOptions);
  await report.generate();
}
```

- [ ] **Step 6: Migrate every spec to import from the fixture**

In each of `tests/e2e/boot.spec.js`, `windows.spec.js`, `zorder.spec.js`, `dragresize.spec.js`, `desktop.spec.js`, `state.spec.js`, `imagezoom.spec.js`, `selection.spec.js`, `chrome.spec.js`, `reflow.spec.js`, change:
```js
import { test, expect } from '@playwright/test';
```
to:
```js
import { test, expect } from './fixtures.js';
```
For `tests/mobile/mobile.spec.js`, change it to:
```js
import { test, expect } from '../e2e/fixtures.js';
```
(`env.test.js` is Vitest — leave it.)

- [ ] **Step 7: Add Vitest coverage config in `vitest.config.js`**

Add to the `test` block:
```js
coverage: {
  provider: 'v8',
  include: ['assets/js/env.js'],
  reporter: ['text', 'html'],
  reportsDirectory: './coverage/unit',
},
```

- [ ] **Step 8: Add scripts to `package.json` and ignore `coverage/`**

Add scripts:
```json
"test:unit:cov": "vitest run --coverage",
"test:cov": "npm run test:unit:cov && npm run test:e2e"
```
Add `coverage/` to `.gitignore`.

- [ ] **Step 9: Run everything and confirm reports generate**

```bash
export LD_LIBRARY_PATH=/tmp/chrome-deps/usr/lib/x86_64-linux-gnu:/tmp/chrome-deps/lib/x86_64-linux-gnu
npm run test:unit:cov
npm run test:e2e
```
Expected:
- Unit: 7/7 pass and a coverage table prints for `env.js`.
- E2E: full suite passes on both projects, and the monocart console-summary prints non-zero line/function coverage for `assets/js/window.js` and `assets/js/main.js` (an HTML report lands in `coverage/e2e/`). If monocart shows the bundle instead of source files, the inline source map isn't being consumed — confirm Step 2 emits the map under `hugo server` and that `sourceFilter` matches the source paths in the map (`console.log` the raw entry `url`/`sourcePath` once to see what monocart received, then adjust the filter). This is informational; the acceptance is a source-level report that attributes coverage to `window.js`, not a specific percentage.

- [ ] **Step 10: Commit**

```bash
git add tests/e2e/fixtures.js tests/e2e/coverage-teardown.js coverage.config.js \
        playwright.config.js vitest.config.js package.json package-lock.json .gitignore \
        layouts/home.html tests/e2e/*.spec.js tests/mobile/mobile.spec.js
git commit -m "test: add informational coverage (vitest v8 + monocart) with dev-only source map"
```

---

### Task 8: CI — publish coverage artifacts

**Files:**
- Modify: `.github/workflows/test.yml`

**Interfaces:**
- Consumes: `test:unit:cov` and the `coverage/` output from Task 7.

- [ ] **Step 1: Update the workflow**

Replace the `Unit tests` step with the coverage variant and add a coverage-artifact upload. The E2E step is unchanged (it now runs both projects and writes `coverage/e2e/` via teardown). Final `.github/workflows/test.yml`:
```yaml
name: tests

on:
  push:
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright browser
        run: npx playwright install --with-deps chromium

      - name: Unit tests (with coverage)
        run: npm run test:unit:cov

      - name: E2E tests (desktop + mobile, with coverage)
        run: npm run test:e2e

      - name: Upload Playwright report
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 7

      - name: Upload coverage reports
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: coverage
          path: coverage/
          retention-days: 7
```

- [ ] **Step 2: Validate**

```bash
node -e "require('fs').readFileSync('.github/workflows/test.yml','utf8')"
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/test.yml'))" 2>/dev/null && echo "YAML OK" || echo "check indentation"
```
Do NOT run `npm ci` locally (it disturbs the container's browser-libs workaround). Confirm `test:unit:cov` exists in `package.json`.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/test.yml
git commit -m "ci: run tests with coverage and upload coverage artifacts"
```

---

## Self-review

**Spec coverage** — every spec section maps to a task:
- Geometry round-trip → Task 2. Image-zoom → Task 3. Rubber-band → Task 4. Link status-bar + idle → Task 5. Resize→cascade + history recycling → Task 6. Mobile project → Task 1. Coverage (vitest v8 + monocart + dev-only source map) → Task 7. CI artifacts → Task 8. env.js unit coverage → Task 7 Step 7.

**Placeholders** — none; every step has runnable code or exact commands. The image-source and monocart-filter checks include concrete fallback instructions, not TODOs.

**Type/name consistency** — helpers `openApp`/`openViaMenu`/`win` used verbatim throughout; `coverageOptions` defined in `coverage.config.js` (Task 7 Step 3) and imported in the fixture (Step 4) and teardown (Step 5); `ZOOM = 'img-aws-graph'` matches the slug derivation in `window.js:504`; idle message strings copied verbatim from `main.js`.

**Out of scope (unchanged from spec)** — chat messaging/backend, pixel/screenshot regression, production source maps, CI coverage gating.
