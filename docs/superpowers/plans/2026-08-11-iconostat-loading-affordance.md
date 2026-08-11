# Iconostat Loading Affordance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A bouncing loading spinner (KDE-Plasma style) that follows the cursor on desktop / centers on touch, shown while a window's content is fetching — driven by `iconostat-content-loading`/`-loaded` events (no timers), with the spinner *image* supplied by the site via `--iconostat-spinner-image` (the library carries no image).

**Architecture:** `<iconostat-desktop>` (library) owns a single floating spinner element, an in-flight load count, `document` listeners for the two events, and the bounce/placement CSS. The site's `loadHTML` fires the two events (balanced across all terminal paths) and sets `--iconostat-spinner-image: url('/start-button.webp')` (the eye) in site CSS.

**Tech Stack:** Web Component (`assets/iconostat/desktop.js`), CSS (`assets/iconostat/iconostat.css`, `assets/css/style.css`), site glue (`assets/js/window.js`), Playwright.

## Global Constraints

- **No timers** — spinner show/hide is driven by the events, not a delay.
- **No branded/site image in `assets/iconostat/`** — the spinner image comes only from `var(--iconostat-spinner-image, none)`; if unset, the spinner renders nothing. Zero site imports / Hugo refs / hardcoded image URLs in the library.
- Reuse the already-cached eye asset (`/start-button.webp`) — no new download, no new dep.
- Every `iconostat-content-loading` is balanced by exactly one `iconostat-content-loaded` (incl. failure/retry-exhausted paths) so the count can't leak.
- Suite stays deterministically green.

## Environment Prerequisites

- Worktree `/home/node/.agent-os/worktrees/tuckermclean.com-nice-phoenix`, branch `feature/nice-phoenix`. Shell cwd RESETS to a master checkout between commands — begin EVERY Bash command with `cd /home/node/.agent-os/worktrees/tuckermclean.com-nice-phoenix &&`; verify branch before committing; NEVER commit on master.
- E2E needs the shim in the same command: `export LD_LIBRARY_PATH=/home/node/.cache/chrome-deps/usr/lib/x86_64-linux-gnu:/home/node/.cache/chrome-deps/lib/x86_64-linux-gnu:/home/node/.cache/chrome-deps/usr/lib:/home/node/.cache/chrome-deps/lib`. Playwright auto-starts Hugo, serial.
- Helpers: `tests/e2e/helpers.js` → `openApp`, `openViaMenu`, `win`; `tests/e2e/fixtures.js` → `{ test, expect }`.

## File Structure

- Modify: `assets/iconostat/desktop.js` — spinner element + in-flight count + event listeners (Task 1).
- Modify: `assets/iconostat/iconostat.css` — spinner/bounce/placement CSS + `--iconostat-spinner-image` hook (Task 1).
- Modify: `assets/js/window.js` — `loadHTML` fires the balanced events (Task 2).
- Modify: `assets/css/style.css` — set `--iconostat-spinner-image: url('/start-button.webp')` (Task 2).
- Modify: `assets/iconostat/README.md` — document the events + the `--iconostat-spinner-image` hook (Task 2).
- Test: `tests/e2e/boot.spec.js` — spinner-mechanism test (Task 1); real-load event + no-stuck + image-source tests (Task 2).

---

### Task 1: Library — the spinner mechanism on `<iconostat-desktop>`

Build the floating spinner, the in-flight count, and the event listeners. It stays dormant until the site fires events (Task 2), so this task is behavior-neutral in the running site.

**Files:**
- Modify: `assets/iconostat/desktop.js`
- Modify: `assets/iconostat/iconostat.css`
- Test: `tests/e2e/boot.spec.js`

**Interfaces:**
- Consumes: nothing (dormant until events arrive).
- Produces: a `.iconostat-spinner` element (child of `document.body`) with an inner `.iconostat-spinner-eye`; `document` listeners for `iconostat-content-loading` (count++, show) and `iconostat-content-loaded` (count--, hide at 0); `--iconostat-spinner-image` custom-property hook.

- [ ] **Step 1: Write the failing test**

Add to `tests/e2e/boot.spec.js` (ensure `openApp` is imported from `./helpers.js`):
```javascript
test('the loading spinner shows on content-loading events and hides when balanced', async ({ page }) => {
  await openApp(page);
  const spinner = page.locator('.iconostat-spinner');
  await expect(spinner).toHaveCount(1);
  await expect(spinner).not.toHaveClass(/active/);
  // two concurrent loads share one indicator
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('iconostat-content-loading')));
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('iconostat-content-loading')));
  await expect(spinner).toHaveClass(/active/);
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('iconostat-content-loaded')));
  await expect(spinner).toHaveClass(/active/);   // still one load in flight
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('iconostat-content-loaded')));
  await expect(spinner).not.toHaveClass(/active/); // count back to 0
});
```

- [ ] **Step 2: Run it — verify it FAILS**

```bash
cd /home/node/.agent-os/worktrees/tuckermclean.com-nice-phoenix && export LD_LIBRARY_PATH=/home/node/.cache/chrome-deps/usr/lib/x86_64-linux-gnu:/home/node/.cache/chrome-deps/lib/x86_64-linux-gnu:/home/node/.cache/chrome-deps/usr/lib:/home/node/.cache/chrome-deps/lib && npx playwright test tests/e2e/boot.spec.js -g "loading spinner shows" --project=desktop
```
Expected: FAIL (no `.iconostat-spinner` yet).

- [ ] **Step 3: Add the spinner + count + listeners to the desktop**

In `assets/iconostat/desktop.js` `connectedCallback()`, after `this._installReflow();`, add:
```javascript
        this._loadingCount = this._loadingCount || 0;
        this._installSpinner();
        document.addEventListener('iconostat-content-loading', () => this._loadingStart());
        document.addEventListener('iconostat-content-loaded',  () => this._loadingEnd());
```
Add these methods to the class (near `_installReflow`):
```javascript
    // Floating loading spinner. The IMAGE is site-supplied via
    // --iconostat-spinner-image (the library ships no image); if unset the
    // spinner renders nothing. Follows the cursor on fine-pointer devices,
    // centers on touch. Shown while >=1 content load is in flight.
    _installSpinner() {
        const spinner = document.createElement('div');
        spinner.className = 'iconostat-spinner';
        const eye = document.createElement('div');
        eye.className = 'iconostat-spinner-eye';
        spinner.appendChild(eye);
        document.body.appendChild(spinner);
        this._spinner = spinner;
        if (window.matchMedia && window.matchMedia('(pointer: fine)').matches) {
            document.addEventListener('mousemove', e => {
                spinner.style.left = `${e.clientX}px`;
                spinner.style.top = `${e.clientY}px`;
            });
        } else {
            spinner.classList.add('centered');
        }
    }

    _loadingStart() {
        this._loadingCount++;
        this._spinner.classList.add('active');
        document.body.classList.add('iconostat-loading');
    }

    _loadingEnd() {
        this._loadingCount = Math.max(0, this._loadingCount - 1);
        if (this._loadingCount === 0) {
            this._spinner.classList.remove('active');
            document.body.classList.remove('iconostat-loading');
        }
    }
```

- [ ] **Step 4: Add the spinner CSS (bounce, placement, image hook)**

In `assets/iconostat/iconostat.css`, add (near the top window section):
```css
/* Loading spinner (site supplies the image via --iconostat-spinner-image;
   the library ships no image). Follows the cursor (positioned by JS on
   fine-pointer devices) or centers on touch (`.centered`). Hidden unless
   `.active`. The eye bounces (KDE-Plasma launch feel); the fade-in softens
   a very fast load into a gentle blip. */
.iconostat-spinner {
    position: fixed;
    z-index: 100000;
    pointer-events: none;
    width: var(--iconostat-spinner-size, 2.5rem);
    height: var(--iconostat-spinner-size, 2.5rem);
    transform: translate(0.8rem, 0.8rem); /* below-right of the cursor */
    opacity: 0;
    transition: opacity 150ms ease;
}
.iconostat-spinner.active { opacity: 1; }
.iconostat-spinner.centered {
    left: 50%; top: 50%;
    transform: translate(-50%, -50%);
}
.iconostat-spinner-eye {
    width: 100%; height: 100%;
    background-image: var(--iconostat-spinner-image, none);
    background-size: contain;
    background-repeat: no-repeat;
    background-position: center;
    animation: iconostat-bounce 0.6s ease-in-out infinite;
}
@keyframes iconostat-bounce {
    0%, 100% { transform: translateY(0); }
    50%      { transform: translateY(-0.5rem); }
}
body.iconostat-loading { cursor: progress; }
```

- [ ] **Step 5: Run the test + confirm no branded image leaked into the library**

```bash
cd /home/node/.agent-os/worktrees/tuckermclean.com-nice-phoenix && export LD_LIBRARY_PATH=/home/node/.cache/chrome-deps/usr/lib/x86_64-linux-gnu:/home/node/.cache/chrome-deps/lib/x86_64-linux-gnu:/home/node/.cache/chrome-deps/usr/lib:/home/node/.cache/chrome-deps/lib && npx playwright test tests/e2e/boot.spec.js -g "loading spinner shows" --project=desktop && npm run test:e2e && npx vitest run
grep -rnE "start-button|\.webp|\.gif|url\(/" assets/iconostat/ || echo "clean: no hardcoded image url in library"
```
Expected: the new test passes; full suite green; the grep prints `clean` (the only image reference in the library is `var(--iconostat-spinner-image, none)`, which the grep above does NOT match — confirm by reading that the CSS uses the var, no literal url).

- [ ] **Step 6: Commit**

```bash
cd /home/node/.agent-os/worktrees/tuckermclean.com-nice-phoenix && git add assets/iconostat/desktop.js assets/iconostat/iconostat.css tests/e2e/boot.spec.js && git commit -m "feat(iconostat): loading spinner mechanism on the desktop (image via --iconostat-spinner-image)"
```

---

### Task 2: Site — fire the balanced events + supply the eye image + docs

Wire the site's content loader to fire the two events (balanced across every terminal path), point `--iconostat-spinner-image` at the eye, and document the API.

**Files:**
- Modify: `assets/js/window.js`
- Modify: `assets/css/style.css`
- Modify: `assets/iconostat/README.md`
- Test: `tests/e2e/boot.spec.js`

**Interfaces:**
- Consumes: the desktop's `iconostat-content-loading`/`-loaded` listeners (Task 1) and the `--iconostat-spinner-image` hook.
- Produces: balanced events from `loadHTML`; `--iconostat-spinner-image` set to the eye.

- [ ] **Step 1: Write the failing tests**

Add to `tests/e2e/boot.spec.js` (ensure `openViaMenu` imported):
```javascript
test('opening a window fires iconostat-content-loaded and leaves no stuck spinner', async ({ page }) => {
  await openApp(page);
  const loaded = page.evaluate(() => new Promise(res => {
    document.addEventListener('iconostat-content-loaded', () => res(true), { once: true });
  }));
  await openViaMenu(page, 'Resume');
  expect(await loaded).toBe(true);
  await expect(page.locator('.iconostat-spinner')).not.toHaveClass(/active/); // count settled to 0
});

test('the spinner image is the site-supplied eye via --iconostat-spinner-image', async ({ page }) => {
  await openApp(page);
  const bg = await page.evaluate(() =>
    getComputedStyle(document.querySelector('.iconostat-spinner-eye')).backgroundImage);
  expect(bg).toContain('start-button');
});
```

- [ ] **Step 2: Run them — verify they FAIL**

```bash
cd /home/node/.agent-os/worktrees/tuckermclean.com-nice-phoenix && export LD_LIBRARY_PATH=/home/node/.cache/chrome-deps/usr/lib/x86_64-linux-gnu:/home/node/.cache/chrome-deps/lib/x86_64-linux-gnu:/home/node/.cache/chrome-deps/usr/lib:/home/node/.cache/chrome-deps/lib && npx playwright test tests/e2e/boot.spec.js -g "fires iconostat-content-loaded|spinner image is the site-supplied" --project=desktop
```
Expected: FAIL (no events fired; `--iconostat-spinner-image` unset → backgroundImage is `none`).

- [ ] **Step 3: Fire the balanced events in loadHTML**

In `assets/js/window.js` `loadHTML(url, targetElementId, callback = () => {}, retries = 5)`:
- At the very TOP of the function body (before `fetch(url)`), fire loading ONCE per fresh load (guard the retry recursion, which passes `retries < 5`):
```javascript
    if (retries === 5) {
        document.dispatchEvent(new CustomEvent('iconostat-content-loading'));
    }
```
- Fire loaded at EVERY terminal outcome (exactly one fires per load): (a) success — right after the `callback(ancestor)` call (~line 227, inside the `if (targetElement found)` block); (b) retries-exhausted — right after `callback(undefined)` (the `else`→`else` branch, ~line 232); (c) fetch failure — inside `.catch`, after the `console.error` (~line 237). At each of the three points add:
```javascript
    document.dispatchEvent(new CustomEvent('iconostat-content-loaded'));
```
Do NOT add a loaded dispatch on the retry-recursion path (the `if (retries > 0) setTimeout(...)` branch) — that is not terminal. Result: one loading (initial call) balanced by one loaded (whichever terminal path the load reaches).

- [ ] **Step 4: Point the spinner image at the eye (site CSS)**

In `assets/css/style.css`, in the `:root { … }` block (with the other site vars), add:
```css
    --iconostat-spinner-image: url('/start-button.webp');
```
(This lives site-side; the library only reads the var. The eye is already cached from the start button, so no new download.)

- [ ] **Step 5: Run the tests + full suite (deterministic)**

```bash
cd /home/node/.agent-os/worktrees/tuckermclean.com-nice-phoenix && export LD_LIBRARY_PATH=/home/node/.cache/chrome-deps/usr/lib/x86_64-linux-gnu:/home/node/.cache/chrome-deps/lib/x86_64-linux-gnu:/home/node/.cache/chrome-deps/usr/lib:/home/node/.cache/chrome-deps/lib && npx vitest run && for i in 1 2 3; do npm run test:e2e 2>&1 | grep -iE "^\s*[0-9]+ (passed|failed)|flaky" | tail -2; done
```
Expected: unit 12/12; full e2e all-pass across 3 runs, 0 flaky (both new tests pass; no stuck spinner; image resolves to the eye).

- [ ] **Step 6: Document the API in the library README**

In `assets/iconostat/README.md`, add to the events list: `iconostat-content-loading` and `iconostat-content-loaded` (dispatched on `document` by the host's content loader; the desktop shows/hides the loading spinner while ≥1 load is in flight). Add to the theming/props: `--iconostat-spinner-image` (host-supplied spinner image; unset → no spinner), `--iconostat-spinner-size`. Note the spinner image is host branding, not shipped by the library.

- [ ] **Step 7: Commit**

```bash
cd /home/node/.agent-os/worktrees/tuckermclean.com-nice-phoenix && git add assets/js/window.js assets/css/style.css assets/iconostat/README.md tests/e2e/boot.spec.js && git commit -m "feat(iconostat): fire content-load events + wire the eye spinner image (site) + docs"
```

---

## Self-Review

**Spec coverage:**
- Events `iconostat-content-loading`/`-loaded`, balanced across success/retry-exhausted/catch → Task 2 Step 3. ✓
- Library spinner mechanism on `<iconostat-desktop>` (element, in-flight count, listeners) → Task 1. ✓
- Bounce + fade-in + follow-cursor(fine pointer)/centered(touch) + `cursor: progress` → Task 1 Steps 3-4. ✓
- Image via `--iconostat-spinner-image`, no image in the library → Task 1 (var hook + grep) & Task 2 Step 4 (site sets it) & the "image is the eye" test. ✓
- Reuse cached eye, no new download/dep → Task 2 Step 4. ✓
- No timers → events only; confirmed no `setTimeout`-based delay added. ✓
- Testing: mechanism (spinner toggles on events), real-load event + no-stuck-spinner, image-source → Tasks 1 & 2 tests. ✓
- README (events + hook) → Task 2 Step 6. ✓

**Placeholder scan:** full JS/CSS + test code + exact insertion points (loadHTML line anchors, connectedCallback location); no TBD/"similar to". ✓

**Type/consistency:** `.iconostat-spinner` / `.iconostat-spinner-eye` / `.active` / `.centered` classes consistent across the desktop JS (Task 1 Step 3), CSS (Step 4), and tests. `iconostat-content-loading`/`-loaded` event names consistent across desktop listeners (Task 1) and loadHTML dispatch (Task 2). `--iconostat-spinner-image` consistent between the library `var(...)` (Task 1) and the site setter (Task 2). `_loadingCount`/`_loadingStart`/`_loadingEnd`/`_installSpinner` consistent. ✓

**Note:** the bounce/cursor-follow *feel* isn't machine-assertable; tests lock the mechanism (spinner toggles, events balance, image source) and the user confirms the feel visually.
