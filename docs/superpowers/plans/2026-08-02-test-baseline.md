# Test Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a provable, framework-agnostic test baseline (Playwright E2E + one Vitest unit) that pins the current observable behavior of the window manager and SPA routing before they are ported to a modern framework.

**Architecture:** Black-box end-to-end tests drive a real Chromium browser against the site served by `hugo server` (via `hugo-bin`, started by Playwright's `webServer`). Tests assert only on rendered DOM and URL state — never on `window.js` internals — so they remain valid across the framework port. One Vitest + jsdom unit test covers `env.js`'s pure hostname→config logic.

**Tech Stack:** `@playwright/test`, `vitest` + `jsdom`, `hugo-bin` (standard Hugo — extended not needed, no SCSS), Node 22.

## Global Constraints

- **Node** ≥ 22 (environment is v22.23.1).
- **Hugo via `hugo-bin`** (npm dev-dependency). Standard, not extended — the site has no SCSS. This supersedes the design doc's earlier `hugo-extended` mention. `npx hugo …` resolves to `node_modules/.bin/hugo`.
- **Playwright** `@playwright/test` pinned to the same minor as the existing `playwright` dependency (`^1.58.2`) so the already-cached Chromium build is reused. Do not upgrade past what the cached browser supports.
- **Fixed viewport 1280×900** for all E2E tests (desktop branch, >768px). Do not test the mobile branch here.
- **Never modify `assets/js/*.js` or any site source.** This is a characterization baseline. If a test disagrees with the source, the *test* is wrong — fix the assertion to match real behavior, and log genuinely surprising/buggy behavior in the design doc's "Suspected bugs" section (`docs/superpowers/specs/2026-08-02-test-baseline-design.md`).
- **Serve via `hugo server`** at `http://localhost:1313`; `env.js` sees hostname `localhost` and defaults to the Tucker McLean identity.

## Characterization TDD note (READ FIRST)

The implementation under test **already exists**. The normal red→green TDD loop is **inverted**:

1. Write the test encoding the behavior you expect from reading the source.
2. Run it. **Expected result: PASS** (green against current behavior).
3. If it **FAILS**, the source's real behavior differs from your reading. Investigate the actual behavior (add a `console.log`, use `--headed`/`--debug`, or read the source again). **Update the assertion to match reality.** Do **not** change the source.
4. If the real behavior is surprising or clearly buggy, add an entry to the "Suspected bugs" section of the design doc in the same commit.

Where a step below says "Expected: PASS", that is the characterization check. Where it says "Expected: FAIL", it is a genuine red-first step for harness scaffolding.

## File structure

```
playwright.config.js          # E2E runner config + hugo webServer
vitest.config.js              # jsdom unit config
package.json                  # + devDeps and test scripts (modify)
tests/
  e2e/
    helpers.js                # shared: openApp, openViaMenu, win()
    boot.spec.js              # boot, deep-link, history back/forward
    windows.spec.js           # open, dedupe, close, minimize, maximize, shade
    zorder.spec.js            # focus & z-order
    dragresize.spec.js        # drag + resize, full coverage
    desktop.spec.js           # menu, cascade/tile/minimize-all, dark mode, chat opens
  unit/
    env.test.js               # env.js hostname→config
.github/workflows/test.yml    # CI (create)
```

---

### Task 1: Test harness scaffolding

Stand up both runners with trivial smoke tests so later tasks only add real coverage. Deliverable: `npm run test:unit` and `npm run test:e2e` both pass, proving Vitest works and Playwright can boot the Hugo-served site.

**Files:**
- Modify: `package.json` (devDeps + scripts)
- Create: `playwright.config.js`
- Create: `vitest.config.js`
- Create: `tests/e2e/helpers.js`
- Create: `tests/e2e/smoke.spec.js` (temporary; removed in Task 3)
- Create: `tests/unit/smoke.test.js` (temporary; removed in Task 2)

**Interfaces:**
- Produces (`tests/e2e/helpers.js`):
  - `openApp(page, hash = '')` → `Promise<void>` — navigates to `/` (or `/#/<hash>`) and waits for the first `.window` to be visible.
  - `openViaMenu(page, label)` → `Promise<void>` — opens the Start menu and clicks the `.menu-item` whose text contains `label`.
  - `win(page, name)` → `Locator` — the window element `#window-<name>`.

- [ ] **Step 1: Add dev dependencies**

Run:
```bash
npm install -D @playwright/test@^1.58.2 vitest@^2.1.0 jsdom@^25.0.0 hugo-bin@^0.145.0
```
Then verify the Hugo binary is available and can build the site:
```bash
npx hugo version
npx hugo --gc --destination /tmp/hugo-baseline-check
```
Expected: `hugo version` prints a version string; the build completes without error (warnings are fine). If `npx hugo` is missing, confirm `hugo-bin` installed a binary under `node_modules/.bin/`.

- [ ] **Step 2: Confirm the cached Chromium is usable**

Run:
```bash
npx playwright install chromium
```
Expected: reports Chromium already installed (uses the cached `chromium-1223`) or installs quickly. If it tries to download and the network is unavailable, pin `@playwright/test` down until it matches the cached build, then re-run.

- [ ] **Step 3: Create `vitest.config.js`**

```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.js'],
  },
});
```

- [ ] **Step 4: Create `playwright.config.js`**

```js
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: 'http://localhost:1313',
    viewport: { width: 1280, height: 900 },
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } },
    },
  ],
  webServer: {
    command: 'npx hugo server --port 1313 --disableFastRender --renderToMemory',
    url: 'http://localhost:1313/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
```

- [ ] **Step 5: Create `tests/e2e/helpers.js`**

```js
import { expect } from '@playwright/test';

/** Navigate to the app (optionally deep-linking to #/<hash>) and wait for boot. */
export async function openApp(page, hash = '') {
  await page.goto(hash ? `/#/${hash}` : '/');
  await expect(page.locator('.window').first()).toBeVisible();
}

/** Open the Start menu and click the menu item whose text contains `label`. */
export async function openViaMenu(page, label) {
  await page.locator('#start-button').click();
  await expect(page.locator('#menu')).toHaveClass(/active/);
  await page.locator('#menu .menu-item', { hasText: label }).click();
}

/** The window element for a given page name. */
export const win = (page, name) => page.locator(`#window-${name}`);
```

- [ ] **Step 6: Create smoke tests**

`tests/unit/smoke.test.js`:
```js
import { describe, it, expect } from 'vitest';

describe('unit harness', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```

`tests/e2e/smoke.spec.js`:
```js
import { test, expect } from '@playwright/test';

test('app boots and renders at least one window', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.window').first()).toBeVisible();
});
```

- [ ] **Step 7: Add test scripts to `package.json`**

Add to the `scripts` block:
```json
"test": "npm run test:unit && npm run test:e2e",
"test:unit": "vitest run",
"test:e2e": "playwright test",
"test:e2e:ui": "playwright test --ui"
```

- [ ] **Step 8: Run both suites**

Run:
```bash
npm run test:unit
npm run test:e2e
```
Expected: unit passes (1 test); e2e passes (1 test) after Playwright starts `hugo server` and Chromium loads the page. This proves the whole harness end to end.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json playwright.config.js vitest.config.js tests/
git commit -m "test: scaffold Playwright + Vitest harness with smoke tests"
```

---

### Task 2: env.js unit test

Replace the unit smoke test with real coverage of `env.js`'s hostname→config derivation and clientConfig merge.

**Files:**
- Create: `tests/unit/env.test.js`
- Delete: `tests/unit/smoke.test.js`
- Test target: `assets/js/env.js` (exports `envVars(clientConfig = true)`)

**Interfaces:**
- Consumes: `envVars` from `../../assets/js/env.js`. `envVars(false)` resolves with `{ DOMAIN_NAME, BASE_URL, API_BASE_URL, API_WS_BASE_URL, NAME, INITIALS, EMAIL }` derived from `window.location.hostname`. `envVars(true)` additionally `fetch`es `${API_BASE_URL}clientConfig`, parses JSON, and merges it over the derived object.

- [ ] **Step 1: Write the env.js tests**

`tests/unit/env.test.js`:
```js
import { describe, it, expect, afterEach, vi } from 'vitest';
import { envVars } from '../../assets/js/env.js';

// env.js only reads window.location.hostname, so a minimal stub is enough.
function setHostname(hostname) {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { hostname },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('envVars — identity by hostname', () => {
  it('tuckermclean.com → Tucker McLean / TM', async () => {
    setHostname('tuckermclean.com');
    const env = await envVars(false);
    expect(env.NAME).toBe('Tucker McLean');
    expect(env.INITIALS).toBe('TM');
    expect(env.EMAIL).toBe('me@tuckermclean.com');
  });

  it('www.tuckermclean.com collapses to the last two labels', async () => {
    setHostname('www.tuckermclean.com');
    const env = await envVars(false);
    expect(env.DOMAIN_NAME).toBe('tuckermclean.com');
    expect(env.NAME).toBe('Tucker McLean');
  });

  it('alijamaluddin.com → Ali Jamaluddin / AJ', async () => {
    setHostname('alijamaluddin.com');
    const env = await envVars(false);
    expect(env.NAME).toBe('Ali Jamaluddin');
    expect(env.INITIALS).toBe('AJ');
    expect(env.EMAIL).toBe('me@alijamaluddin.com');
  });

  it('technomantics.com → Developer McDev / DM', async () => {
    setHostname('technomantics.com');
    const env = await envVars(false);
    expect(env.NAME).toBe('Developer McDev');
    expect(env.INITIALS).toBe('DM');
    expect(env.EMAIL).toBe('fakedev@technomantics.com');
  });

  it('unknown host defaults to the Tucker McLean identity', async () => {
    setHostname('example.org');
    const env = await envVars(false);
    expect(env.NAME).toBe('Tucker McLean');
    expect(env.INITIALS).toBe('TM');
  });
});

describe('envVars — URL derivation', () => {
  it('derives BASE / API / WS urls from the domain', async () => {
    setHostname('tuckermclean.com');
    const env = await envVars(false);
    expect(env.BASE_URL).toBe('https://tuckermclean.com/');
    expect(env.API_BASE_URL).toBe('https://api.tuckermclean.com/');
    expect(env.API_WS_BASE_URL).toBe('wss://api-ws.tuckermclean.com/');
  });
});

describe('envVars — clientConfig merge', () => {
  it('merges fetched clientConfig over the base vars', async () => {
    setHostname('tuckermclean.com');
    const fetchMock = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ NAME: 'Overridden', COGNITO_CLIENT_ID: 'abc123' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const env = await envVars(true);

    expect(fetchMock).toHaveBeenCalledWith('https://api.tuckermclean.com/clientConfig');
    expect(env.NAME).toBe('Overridden');
    expect(env.COGNITO_CLIENT_ID).toBe('abc123');
  });
});
```

- [ ] **Step 2: Delete the unit smoke test**

```bash
rm tests/unit/smoke.test.js
```

- [ ] **Step 3: Run the unit suite**

Run: `npm run test:unit`
Expected: PASS — all env.js cases green. If any fails, the derivation differs from the reading above; correct the assertion to the real value (do not touch `env.js`) and log anything surprising in the design doc.

- [ ] **Step 4: Commit**

```bash
git add tests/unit
git commit -m "test: characterize env.js hostname→config derivation"
```

---

### Task 3: Boot, deep-linking, and history E2E

Characterize the SPA entry points: cold boot, hash deep-links, and browser back/forward.

**Files:**
- Create: `tests/e2e/boot.spec.js`
- Delete: `tests/e2e/smoke.spec.js` (superseded)
- Uses: `tests/e2e/helpers.js`

**Interfaces:**
- Consumes: `openApp`, `openViaMenu`, `win` from `./helpers.js`.

- [ ] **Step 1: Write the boot/deep-link/history tests**

`tests/e2e/boot.spec.js`:
```js
import { test, expect } from '@playwright/test';
import { openApp, openViaMenu, win } from './helpers.js';

test('cold boot opens the Welcome window and normalizes the URL to /', async ({ page }) => {
  await openApp(page);
  await expect(win(page, 'welcome')).toBeVisible();
  // loadHTML overwrites the title from the page fragment's .page-title span.
  await expect(win(page, 'welcome').locator('.window-title')).toHaveText('Welcome');
  await expect(page).toHaveURL('http://localhost:1313/');
});

test('deep-link #/resume opens the Resume window with loaded content', async ({ page }) => {
  await openApp(page, 'resume');
  await expect(win(page, 'resume')).toBeVisible();
  await expect(win(page, 'resume').locator('.window-title')).toHaveText('Resume');
  await expect(win(page, 'resume').locator('.window-icon')).toHaveText('📜');
  // Content fragment loaded (resume body has a Summary heading).
  await expect(win(page, 'resume').locator('.window-body')).toContainText('Summary');
});

test('deep-link to an arbitrary slug opens a title-cased window', async ({ page }) => {
  // The fragment fetch 404s (no such page); loadHTML logs the error and the
  // window keeps its slug-derived title. This locks the current title-casing.
  await openApp(page, 'made-up-page');
  await expect(win(page, 'made-up-page')).toBeVisible();
  await expect(win(page, 'made-up-page').locator('.window-title')).toHaveText('Made up page');
});

test('browser Back/Forward navigate between opened windows', async ({ page }) => {
  await openApp(page); // welcome, URL /
  await openViaMenu(page, 'Resume'); // resume, URL #/resume
  await expect(page).toHaveURL(/#\/resume$/);
  await openViaMenu(page, 'Intro'); // intro, URL #/intro
  await expect(page).toHaveURL(/#\/intro$/);

  await page.goBack();
  await expect(page).toHaveURL(/#\/resume$/);
  await expect(win(page, 'resume')).toHaveClass(/front/);

  await page.goForward();
  await expect(page).toHaveURL(/#\/intro$/);
  await expect(win(page, 'intro')).toHaveClass(/front/);
});
```

- [ ] **Step 2: Delete the e2e smoke test**

```bash
rm tests/e2e/smoke.spec.js
```

- [ ] **Step 3: Run the boot spec**

Run: `npm run test:e2e -- boot.spec.js`
Expected: PASS. Common corrections if a case is red: the exact normalized URL (trailing `/` vs `#/welcome`), or the title-casing of the arbitrary slug — adjust assertions to observed values and log surprises.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/boot.spec.js
git commit -m "test: characterize boot, deep-linking, and history navigation"
```

---

### Task 4: Window lifecycle E2E

Characterize open/dedupe/close plus the minimize, maximize, and shade state toggles.

**Files:**
- Create: `tests/e2e/windows.spec.js`
- Uses: `tests/e2e/helpers.js`

**Interfaces:**
- Consumes: `openApp`, `openViaMenu`, `win` from `./helpers.js`.

- [ ] **Step 1: Write the lifecycle tests**

`tests/e2e/windows.spec.js`:
```js
import { test, expect } from '@playwright/test';
import { openApp, openViaMenu, win } from './helpers.js';

test('opening a page shows correct title + icon and sets the hash', async ({ page }) => {
  await openApp(page);
  await openViaMenu(page, 'Resume');
  await expect(win(page, 'resume')).toBeVisible();
  await expect(win(page, 'resume').locator('.window-title')).toHaveText('Resume');
  await expect(win(page, 'resume').locator('.window-icon')).toHaveText('📜');
  await expect(page).toHaveURL(/#\/resume$/);
});

test('opening an already-open page does not duplicate it', async ({ page }) => {
  await openApp(page);
  await openViaMenu(page, 'Resume');
  await expect(win(page, 'resume')).toHaveCount(1);
  await openViaMenu(page, 'Resume');
  await expect(win(page, 'resume')).toHaveCount(1);
  await expect(win(page, 'resume')).toHaveClass(/front/);
});

test('closing a window promotes the remaining top window and updates the hash', async ({ page }) => {
  await openApp(page); // welcome
  await openViaMenu(page, 'Resume'); // resume front, #/resume
  await win(page, 'resume').locator('.button.close').click();
  await expect(win(page, 'resume')).toHaveCount(0);
  await expect(win(page, 'welcome')).toHaveClass(/front/);
  await expect(page).toHaveURL(/#\/welcome$/);
});

test('closing the last window clears the URL back to /', async ({ page }) => {
  await openApp(page, 'resume'); // only resume open
  await win(page, 'resume').locator('.button.close').click();
  await expect(win(page, 'resume')).toHaveCount(0);
  await expect(page).toHaveURL('http://localhost:1313/');
});

test('minimize moves the window into #tasks; clicking it restores and refocuses', async ({ page }) => {
  await openApp(page, 'resume');
  await win(page, 'resume').locator('.button.minimize').click();
  await expect(page.locator('#tasks #window-resume')).toBeVisible();
  await expect(win(page, 'resume')).toHaveClass(/minimized/);

  await page.locator('#tasks #window-resume').click();
  await expect(win(page, 'resume')).not.toHaveClass(/minimized/);
  await expect(page.locator('body > #window-resume')).toBeVisible();
  await expect(win(page, 'resume')).toHaveClass(/front/);
});

test('maximize toggles the maximized class', async ({ page }) => {
  await openApp(page, 'resume');
  await win(page, 'resume').locator('.button.maximize').click();
  await expect(win(page, 'resume')).toHaveClass(/maximized/);
  await win(page, 'resume').locator('.button.maximize').click();
  await expect(win(page, 'resume')).not.toHaveClass(/maximized/);
});

test('double-clicking the header toggles the shaded class', async ({ page }) => {
  await openApp(page, 'resume');
  await win(page, 'resume').locator('.window-header').dblclick();
  await expect(win(page, 'resume')).toHaveClass(/shaded/);
  await win(page, 'resume').locator('.window-header').dblclick();
  await expect(win(page, 'resume')).not.toHaveClass(/shaded/);
});
```

- [ ] **Step 2: Run the windows spec**

Run: `npm run test:e2e -- windows.spec.js`
Expected: PASS. If the close→promote hash differs (e.g. `/` instead of `#/welcome`), correct the assertion to the observed value and log the discrepancy. If the double-click lands on a header *button* and still shades, that confirms the logged `toggleShade` dead-guard bug — keep the assertion matching reality.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/windows.spec.js
git commit -m "test: characterize window lifecycle (open/close/minimize/maximize/shade)"
```

---

### Task 5: Z-order & focus E2E

Characterize that clicking a rear window brings it to front (class + highest z-index) and updates the hash.

**Files:**
- Create: `tests/e2e/zorder.spec.js`
- Uses: `tests/e2e/helpers.js`

**Interfaces:**
- Consumes: `openApp`, `openViaMenu`, `win` from `./helpers.js`.

- [ ] **Step 1: Write the z-order test**

`tests/e2e/zorder.spec.js`:
```js
import { test, expect } from '@playwright/test';
import { openApp, openViaMenu, win } from './helpers.js';

const zIndexOf = (locator) => locator.evaluate((el) => parseInt(el.style.zIndex || '0', 10));

test('clicking a rear window brings it to front with the highest z-index', async ({ page }) => {
  await openApp(page); // welcome (index 0, offset up-left)
  await openViaMenu(page, 'Resume'); // resume front, offset down-right of welcome
  await expect(win(page, 'resume')).toHaveClass(/front/);

  // Welcome's top-left header corner is exposed because it is offset less.
  await win(page, 'welcome').locator('.window-header').click({ position: { x: 5, y: 5 } });

  await expect(win(page, 'welcome')).toHaveClass(/front/);
  await expect(win(page, 'resume')).not.toHaveClass(/front/);
  await expect(page).toHaveURL(/#\/welcome$/);

  const zWelcome = await zIndexOf(win(page, 'welcome'));
  const zResume = await zIndexOf(win(page, 'resume'));
  expect(zWelcome).toBeGreaterThan(zResume);
});
```

- [ ] **Step 2: Run the z-order spec**

Run: `npm run test:e2e -- zorder.spec.js`
Expected: PASS. If the click misses welcome's exposed header (windows overlap differently than assumed), adjust the click `position` to a visibly exposed part of welcome's header, or reduce to two non-overlapping windows via `tileWindows` first. Do not change source.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/zorder.spec.js
git commit -m "test: characterize z-order and focus on click"
```

---

### Task 6: Drag & resize E2E (full coverage)

Characterize header drag (including the `clientY <= headerHeight/2` guard) and grippy resize with precise deltas.

**Files:**
- Create: `tests/e2e/dragresize.spec.js`
- Uses: `tests/e2e/helpers.js`

**Interfaces:**
- Consumes: `openApp`, `win` from `./helpers.js`.

- [ ] **Step 1: Write the drag/resize tests**

`tests/e2e/dragresize.spec.js`:
```js
import { test, expect } from '@playwright/test';
import { openApp, win } from './helpers.js';

const TOL = 3; // px tolerance for rounding

const rectOf = (locator) =>
  locator.evaluate((el) => ({
    left: el.offsetLeft,
    top: el.offsetTop,
    width: el.offsetWidth,
    height: el.offsetHeight,
  }));

async function drag(page, handle, from, dx, dy) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 10 });
  await page.mouse.up();
}

test('dragging the header moves the window by the drag delta', async ({ page }) => {
  await openApp(page, 'resume');
  const w = win(page, 'resume');
  const before = await rectOf(w);
  const box = await w.locator('.window-header').boundingBox();

  // Grab mid-header, well below headerHeight/2 so the top-guard does not trip.
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await drag(page, w.locator('.window-header'), start, 120, 90);

  const after = await rectOf(w);
  expect(Math.abs(after.left - (before.left + 120))).toBeLessThanOrEqual(TOL);
  expect(Math.abs(after.top - (before.top + 90))).toBeLessThanOrEqual(TOL);
});

test('drag top-guard: pointer above headerHeight/2 moves left but not top', async ({ page }) => {
  await openApp(page, 'resume');
  const w = win(page, 'resume');
  const before = await rectOf(w);
  const box = await w.locator('.window-header').boundingBox();

  // Press on the header, then move the pointer to the very top of the viewport
  // (clientY = 1). Since 1 <= headerHeight/2, startDrag's onMove skips `top`
  // but still updates `left`.
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 60, 1, { steps: 10 });
  await page.mouse.up();

  const after = await rectOf(w);
  expect(after.top).toBe(before.top); // top unchanged (guard held)
  expect(after.left).not.toBe(before.left); // left tracked the pointer
});

test('resizing via the grippy grows the window by the drag delta', async ({ page }) => {
  await openApp(page, 'resume');
  const w = win(page, 'resume');
  const before = await rectOf(w);
  const grip = await w.locator('.grippy').boundingBox();

  const start = { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 };
  await drag(page, w.locator('.grippy'), start, 100, 80);

  const after = await rectOf(w);
  expect(Math.abs(after.width - (before.width + 100))).toBeLessThanOrEqual(TOL);
  expect(Math.abs(after.height - (before.height + 80))).toBeLessThanOrEqual(TOL);
});

test('resizing with a negative delta shrinks to start + delta', async ({ page }) => {
  await openApp(page, 'resume');
  const w = win(page, 'resume');
  const before = await rectOf(w);
  const grip = await w.locator('.grippy').boundingBox();

  const start = { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 };
  await drag(page, w.locator('.grippy'), start, -80, -60);

  const after = await rectOf(w);
  expect(Math.abs(after.width - (before.width - 80))).toBeLessThanOrEqual(TOL);
  expect(Math.abs(after.height - (before.height - 60))).toBeLessThanOrEqual(TOL);
});
```

- [ ] **Step 2: Run the drag/resize spec**

Run: `npm run test:e2e -- dragresize.spec.js`
Expected: PASS. Drag/resize are timing- and geometry-sensitive; if a delta test is flaky, increase `steps` or `TOL` slightly (keep TOL ≤ 5). If the resume window hits a `max-width`/`max-height` and can't grow, switch the resize tests to shrink-only or pick a smaller starting window. Do not change source.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/dragresize.spec.js
git commit -m "test: characterize header drag (incl. top-guard) and grippy resize"
```

---

### Task 7: Desktop actions, menu & dark mode E2E

Characterize the Start/context menu, cascade/tile/minimize-all, dark-mode persistence, and that the chat window opens.

**Files:**
- Create: `tests/e2e/desktop.spec.js`
- Uses: `tests/e2e/helpers.js`

**Interfaces:**
- Consumes: `openApp`, `openViaMenu`, `win` from `./helpers.js`.

- [ ] **Step 1: Write the desktop/menu tests**

`tests/e2e/desktop.spec.js`:
```js
import { test, expect } from '@playwright/test';
import { openApp, openViaMenu, win } from './helpers.js';

test('start button opens the menu; clicking an item closes it', async ({ page }) => {
  await openApp(page);
  await page.locator('#start-button').click();
  await expect(page.locator('#menu')).toHaveClass(/active/);
  await page.locator('#menu .menu-item', { hasText: 'Toggle Mode' }).click();
  await expect(page.locator('#menu')).not.toHaveClass(/active/);
});

test('right-clicking the desktop opens the context menu', async ({ page }) => {
  await openApp(page);
  // Right-click an empty desktop area away from the boot window.
  await page.mouse.click(1250, 150, { button: 'right' });
  await expect(page.locator('#menu')).toHaveClass(/active/);
});

test('Minimize All moves every window into #tasks', async ({ page }) => {
  await openApp(page); // welcome
  await openViaMenu(page, 'Resume'); // + resume
  await openViaMenu(page, 'Minimize All');
  await expect(page.locator('#tasks #window-welcome')).toBeVisible();
  await expect(page.locator('#tasks #window-resume')).toBeVisible();
  await expect(win(page, 'welcome')).toHaveClass(/minimized/);
  await expect(win(page, 'resume')).toHaveClass(/minimized/);
});

test('Tile un-minimizes all windows and lays them out', async ({ page }) => {
  await openApp(page);
  await openViaMenu(page, 'Resume');
  await openViaMenu(page, 'Minimize All');
  await openViaMenu(page, 'Tile Windows');
  for (const name of ['welcome', 'resume']) {
    await expect(page.locator(`body > #window-${name}`)).toBeVisible();
    await expect(win(page, name)).not.toHaveClass(/minimized/);
  }
});

test('Cascade un-minimizes all windows', async ({ page }) => {
  await openApp(page);
  await openViaMenu(page, 'Resume');
  await openViaMenu(page, 'Minimize All');
  await openViaMenu(page, 'Cascade Windows');
  for (const name of ['welcome', 'resume']) {
    await expect(page.locator(`body > #window-${name}`)).toBeVisible();
    await expect(win(page, name)).not.toHaveClass(/minimized/);
  }
});

test('Toggle Mode flips body.toggled and persists across reload', async ({ page }) => {
  await openApp(page);
  await expect(page.locator('body')).not.toHaveClass(/toggled/); // default dark
  await openViaMenu(page, 'Toggle Mode');
  await expect(page.locator('body')).toHaveClass(/toggled/);
  expect(await page.evaluate(() => localStorage.getItem('mode'))).toBe('light');

  await page.reload();
  await expect(page.locator('body')).toHaveClass(/toggled/); // persisted
});

test('chat window opens with its form (no backend messaging asserted)', async ({ page }) => {
  await openApp(page);
  await openViaMenu(page, 'Chat with Me');
  await expect(win(page, 'chat')).toBeVisible();
  await expect(win(page, 'chat').locator('#message')).toBeVisible();
});
```

- [ ] **Step 2: Run the desktop spec**

Run: `npm run test:e2e -- desktop.spec.js`
Expected: PASS. If the right-click coordinate lands on a window body (handler returns early), move it to a clearly empty spot. If the default mode assertion is wrong (site defaults to light), flip it and log the finding. If the chat window's field id differs, inspect `static/chat.html` and match the real selector.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/desktop.spec.js
git commit -m "test: characterize menu, cascade/tile/minimize-all, dark mode, chat open"
```

---

### Task 8: CI workflow

Run both suites on every push and PR, independent of the deploy workflow.

**Files:**
- Create: `.github/workflows/test.yml`

**Interfaces:**
- Consumes: the `test:unit` and `test:e2e` npm scripts from Task 1.

- [ ] **Step 1: Write the workflow**

`.github/workflows/test.yml`:
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
        with:
          submodules: recursive

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright browser
        run: npx playwright install --with-deps chromium

      - name: Unit tests
        run: npm run test:unit

      - name: E2E tests
        run: npm run test:e2e

      - name: Upload Playwright report
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 7
```

- [ ] **Step 2: Validate the workflow locally**

Run:
```bash
npm ci
npm run test:unit && npm run test:e2e
```
Expected: both suites pass exactly as CI will run them. (`hugo-bin`'s postinstall downloads the Hugo binary during `npm ci`, so CI needs no system Hugo.)

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/test.yml
git commit -m "ci: run unit and e2e tests on push and PR"
```

---

## Self-review

**Spec coverage** — every design section maps to a task:
- E2E boot/deep-link/history → Task 3.
- E2E lifecycle (open/dedupe/close/minimize/maximize/shade) → Task 4.
- E2E z-order → Task 5.
- E2E drag/resize (full coverage) → Task 6.
- E2E desktop/menu/cascade/tile/minimize-all/dark-mode/chat-open → Task 7.
- env.js unit (7 cases incl. merge) → Task 2.
- Tooling/config/scripts (`hugo-bin`, Playwright, Vitest, viewport) → Task 1.
- CI → Task 8.
- "Lock-and-log" bug policy → Global Constraints + Characterization TDD note; the `toggleShade` bug is pre-logged in the design doc.

**Placeholders** — none; every step contains runnable code or an exact command.

**Type/name consistency** — helper signatures (`openApp`, `openViaMenu`, `win`) defined in Task 1 are used verbatim in Tasks 3–7; npm scripts defined in Task 1 are used in Tasks 2–8; `envVars` usage matches `assets/js/env.js`.

**Out of scope (unchanged from spec)** — chat messaging/backend, nested `writings` submodule build, mobile viewport, visual regression.
