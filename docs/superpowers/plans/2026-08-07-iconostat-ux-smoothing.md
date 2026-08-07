# Iconostat UX Smoothing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Remove two visual artifacts — the background-image flash on mode toggle, and the position "jump" as a new window is built — with instant/flash-free behavior only (no new animations).

**Architecture:** Fix 1 preloads both background images in the page head so the toggle swap is cache-hit-instant. Fix 2 double-buffers window creation: the `<iconostat-window>` is created hidden (transient `building` class) and revealed only after its geometry is baked, all within the one synchronous `createWindow` task.

**Tech Stack:** Hugo template (`layouts/home.html`), CSS (`assets/iconostat/iconostat.css`), Web Component (`assets/iconostat/desktop.js`), Playwright.

## Global Constraints

- No new animations/effects — instant/flash-free only (window effects/transitions are a separate later effort).
- No new runtime deps; `assets/iconostat/` stays site-coupling-free.
- Behavior/pixel-identical except the removed artifacts; suite stays deterministically green.
- Default window state is VISIBLE — only a transient `building` class hides, so a skipped reveal can never leave a permanently-hidden window.

## Environment Prerequisites

- Worktree `/home/node/.agent-os/worktrees/tuckermclean.com-nice-phoenix`, branch `feature/nice-phoenix`. Shell cwd RESETS to a master checkout between commands — begin EVERY Bash command with `cd /home/node/.agent-os/worktrees/tuckermclean.com-nice-phoenix &&`; verify branch before committing; NEVER commit on master.
- E2E needs the shim in the same command: `export LD_LIBRARY_PATH=/home/node/.cache/chrome-deps/usr/lib/x86_64-linux-gnu:/home/node/.cache/chrome-deps/lib/x86_64-linux-gnu:/home/node/.cache/chrome-deps/usr/lib:/home/node/.cache/chrome-deps/lib`. Playwright auto-starts Hugo, serial.
- Test helpers: `tests/e2e/helpers.js` exports `openApp(page, hash='')`, `openViaMenu(page, label)`, `win(page, name)`; `tests/e2e/fixtures.js` exports `{ test, expect }` (coverage-wrapped).

## File Structure

- Modify: `layouts/home.html` — add two image preloads (Task 1).
- Modify: `assets/iconostat/desktop.js` — `building` class add/remove in `createWindow` (Task 2).
- Modify: `assets/iconostat/iconostat.css` — `iconostat-window.building { visibility: hidden }` (Task 2).
- Test: `tests/e2e/boot.spec.js` — preload-links assertion (Task 1); window-revealed assertion (Task 2). (Or a small new spec; boot.spec is fine.)

---

### Task 1: Preload both background images (kill the mode-toggle flash)

**Files:**
- Modify: `layouts/home.html`
- Test: `tests/e2e/boot.spec.js`

**Interfaces:** none consumed/produced (self-contained head change).

- [ ] **Step 1: Write the failing test**

Add to `tests/e2e/boot.spec.js` (it already imports `test`, `expect`, and `openApp` — reuse them; if not, add `import { test, expect } from './fixtures.js';` and `import { openApp } from './helpers.js';`):
```javascript
test('both background images are preloaded to avoid a mode-toggle flash', async ({ page }) => {
  await openApp(page);
  await expect(page.locator('link[rel="preload"][as="image"][href*="I-Know-Better-1"]')).toHaveCount(1);
  await expect(page.locator('link[rel="preload"][as="image"][href*="I-Know-Better-2"]')).toHaveCount(1);
});
```

- [ ] **Step 2: Run it — verify it FAILS**

```bash
cd /home/node/.agent-os/worktrees/tuckermclean.com-nice-phoenix && export LD_LIBRARY_PATH=/home/node/.cache/chrome-deps/usr/lib/x86_64-linux-gnu:/home/node/.cache/chrome-deps/lib/x86_64-linux-gnu:/home/node/.cache/chrome-deps/usr/lib:/home/node/.cache/chrome-deps/lib && npx playwright test tests/e2e/boot.spec.js -g "background images are preloaded" --project=desktop
```
Expected: FAIL (0 preload links today).

- [ ] **Step 3: Add the preloads**

In `layouts/home.html`, immediately after the existing font preload lines (the three `<link rel="preload" ... as="font" ...>` around lines 39-41), add:
```html
    <link rel="preload" href="/I-Know-Better-1.jpg" as="image">
    <link rel="preload" href="/I-Know-Better-2.jpg" as="image">
```
(Both files exist at `static/I-Know-Better-1.jpg` and `static/I-Know-Better-2.jpg`, served at `/I-Know-Better-*.jpg`.)

- [ ] **Step 4: Run it — verify it PASSES + full suite**

```bash
cd /home/node/.agent-os/worktrees/tuckermclean.com-nice-phoenix && export LD_LIBRARY_PATH=/home/node/.cache/chrome-deps/usr/lib/x86_64-linux-gnu:/home/node/.cache/chrome-deps/lib/x86_64-linux-gnu:/home/node/.cache/chrome-deps/usr/lib:/home/node/.cache/chrome-deps/lib && npx playwright test tests/e2e/boot.spec.js -g "background images are preloaded" --project=desktop && npm run test:e2e && npx vitest run
```
Expected: new test passes; full suite green (49 e2e now), unit 12/12.

- [ ] **Step 5: Commit**

```bash
cd /home/node/.agent-os/worktrees/tuckermclean.com-nice-phoenix && git add layouts/home.html tests/e2e/boot.spec.js && git commit -m "fix(iconostat): preload both background images to remove the mode-toggle flash"
```

---

### Task 2: Build windows hidden, reveal when positioned (kill the build-time jump)

**Files:**
- Modify: `assets/iconostat/desktop.js`
- Modify: `assets/iconostat/iconostat.css`
- Test: `tests/e2e/boot.spec.js`

**Interfaces:**
- Consumes: existing `IconostatDesktop.createWindow` flow.
- Produces: transient `building` class on `<iconostat-window>` during construction (removed before `createWindow` returns).

- [ ] **Step 1: Write the failing test (regression guard: window gets revealed)**

Add to `tests/e2e/boot.spec.js`:
```javascript
test('a freshly opened window is revealed (visible, positioned, no leftover building class)', async ({ page }) => {
  await openApp(page);
  await openViaMenu(page, 'Resume');
  const w = win(page, 'resume');
  await expect(w).toBeVisible();
  await expect(w).not.toHaveClass(/building/);
  const box = await w.boundingBox();
  expect(box.width).toBeGreaterThan(0);
  expect(box.height).toBeGreaterThan(0);
});
```
(Ensure `openViaMenu` and `win` are imported from `./helpers.js` at the top of the spec.)

- [ ] **Step 2: Run it — it PASSES today (windows are already visible); this is a regression guard, so confirm it's green now, then the CSS change in Step 3 must keep it green**

```bash
cd /home/node/.agent-os/worktrees/tuckermclean.com-nice-phoenix && export LD_LIBRARY_PATH=/home/node/.cache/chrome-deps/usr/lib/x86_64-linux-gnu:/home/node/.cache/chrome-deps/lib/x86_64-linux-gnu:/home/node/.cache/chrome-deps/usr/lib:/home/node/.cache/chrome-deps/lib && npx playwright test tests/e2e/boot.spec.js -g "freshly opened window is revealed" --project=desktop
```
Expected: PASS (this guards that the upcoming hide-mechanism still ends visible).

- [ ] **Step 3: Add the hidden-during-build CSS**

In `assets/iconostat/iconostat.css`, add (near the `.window` rules, top of the file's window section):
```css
/* Double-buffer: a window is hidden only while it is being built + baked
   (createWindow adds/removes the `building` class synchronously), so the
   browser paints it once, already positioned — no build-time jump. Tag
   selector matches regardless of when the `window` class is added. Uses
   visibility:hidden (not display:none) so bake() can still measure layout. */
iconostat-window.building { visibility: hidden; }
```

- [ ] **Step 4: Add/remove the `building` class in createWindow**

In `assets/iconostat/desktop.js`, `createWindow({ name, title, icon = '⚙️', classes = [] })`: add `el.classList.add('building')` immediately after `const el = document.createElement('iconostat-window');` (before `document.body.appendChild(el)`), and `el.classList.remove('building')` immediately after the `el.reset(true, false);` line (geometry is finalized there), before `return el;`. Result:
```javascript
createWindow({ name, title, icon = '⚙️', classes = [] }) {
    const el = document.createElement('iconostat-window');
    el.classList.add('building');          // hidden until positioned (double-buffer)
    el.name = name;
    el.windowTitle = title;
    el.icon = icon;
    classes.forEach(c => el.classList.add(c));
    document.body.appendChild(el);
    this.register(el);
    el.reset(true, false);                 // build DOM + bake geometry (still measurable while hidden)
    el.classList.remove('building');       // reveal, now correctly positioned
    return el;
}
```

- [ ] **Step 5: Verify the regression guard still passes + full suite (deterministic)**

```bash
cd /home/node/.agent-os/worktrees/tuckermclean.com-nice-phoenix && export LD_LIBRARY_PATH=/home/node/.cache/chrome-deps/usr/lib/x86_64-linux-gnu:/home/node/.cache/chrome-deps/lib/x86_64-linux-gnu:/home/node/.cache/chrome-deps/usr/lib:/home/node/.cache/chrome-deps/lib && npx vitest run && for i in 1 2 3; do npm run test:e2e 2>&1 | grep -iE "^\s*[0-9]+ (passed|failed)|flaky" | tail -2; done
```
Expected: unit 12/12; full e2e all-pass across 3 runs, 0 flaky (windows still end visible everywhere; the fixture's standalone `createWindow` path also reveals since it uses the same method).

- [ ] **Step 6: Commit**

```bash
cd /home/node/.agent-os/worktrees/tuckermclean.com-nice-phoenix && git add assets/iconostat/desktop.js assets/iconostat/iconostat.css tests/e2e/boot.spec.js && git commit -m "fix(iconostat): build windows hidden and reveal once positioned (no build-time jump)"
```

---

## Self-Review

**Spec coverage:** Fix 1 (preload both bg images) → Task 1 (+ preload-links test). Fix 2 (double-buffer window build) → Task 2 (CSS `building` hide + createWindow add/remove + revealed-window regression test). Both "no new effects / instant" — no animation added. Testing-of-mechanisms per spec (preload links present; window revealed) → covered. ✓

**Placeholder scan:** concrete HTML/CSS/JS + full test code + exact insertion points and file paths; no TBD/"similar to". ✓

**Consistency:** the `building` class name is identical across the CSS selector (Task 2 Step 3), the createWindow add/remove (Step 4), and the regression test's `not.toHaveClass(/building/)` (Step 1). Image filenames `I-Know-Better-1.jpg` / `-2.jpg` consistent between Task 1 preloads and test. ✓

**Note:** the standalone fixture and all site window-creation go through `IconostatDesktop.createWindow`, so the reveal applies uniformly; the hide is synchronous within that method, so existing `toBeVisible()` window specs remain green.
