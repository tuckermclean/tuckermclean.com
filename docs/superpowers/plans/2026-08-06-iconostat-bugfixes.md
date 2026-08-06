# Iconostat Bug Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Fix the four known, previously-locked Iconostat bugs the user approved fixing — updating the characterization tests that lock the old (buggy) behavior to assert the new (correct) behavior.

**Architecture:** Each fix is small and localized; #1/#2 change observable behavior (and redeploy), #3 is a one-line guard fix, #4 is a dormant-crash cleanup. These are deliberate behavior changes, so tests that currently lock the bug get UPDATED, and new tests lock the fixes.

**Tech Stack:** Vanilla JS Web Components (`assets/iconostat/`), site glue (`assets/js/`), Playwright + Vitest.

## Global Constraints

- Full `npm run test:unit` (12) and `npm run test:e2e` (46, may change as tests are added/updated) must pass — DETERMINISTICALLY — at each task's final commit (given this repo's flake history, high-repeat-verify behavior changes).
- Each fix is minimal and localized; do not refactor unrelated code.
- These are the ONLY behavior changes; do not touch the other logged items (README reset() doc gap is separate).
- No new deps.

## Environment Prerequisites

- Worktree `/home/node/.agent-os/worktrees/tuckermclean.com-nice-phoenix`, branch `feature/nice-phoenix`. Shell cwd RESETS to a master checkout between commands — begin EVERY Bash command with `cd /home/node/.agent-os/worktrees/tuckermclean.com-nice-phoenix &&`; verify branch before committing; NEVER commit on master.
- E2E needs the shim in the same command: `export LD_LIBRARY_PATH=/home/node/.cache/chrome-deps/usr/lib/x86_64-linux-gnu:/home/node/.cache/chrome-deps/lib/x86_64-linux-gnu:/home/node/.cache/chrome-deps/usr/lib:/home/node/.cache/chrome-deps/lib`. Playwright auto-starts Hugo, serial.

---

### Task 1: Fix #4 — reset() double-prefixed element id (dormant landmine)

**Files:** Modify `assets/iconostat/window.js`

- [ ] **Step 1: Fix the id**

In `reset()` (the `if (this.classList.contains('minimized'))` branch, ~line 127), change:
```javascript
getDesktop().taskbar.removeChild(document.getElementById(`window-${this.id}`));
```
to:
```javascript
getDesktop().taskbar.removeChild(document.getElementById(this.id));
```
(`this.id` is already `window-<name>`; the old form built `window-window-<name>` → `null` → `removeChild(null)` throws. This matches the correct form already used in `minimize()`.) Remove any "locked bug" comment on this specific line if present.

- [ ] **Step 2: Verify no behavior change / suite green**

This branch is currently unreachable (cascade un-minimizes before calling reset), so no test exercises it and no behavior changes today.
```bash
cd /home/node/.agent-os/worktrees/tuckermclean.com-nice-phoenix && export LD_LIBRARY_PATH=/home/node/.cache/chrome-deps/usr/lib/x86_64-linux-gnu:/home/node/.cache/chrome-deps/lib/x86_64-linux-gnu:/home/node/.cache/chrome-deps/usr/lib:/home/node/.cache/chrome-deps/lib && npx vitest run && npm run test:e2e
```
Expected: unit 12/12, e2e 46/46 unchanged.

- [ ] **Step 3: Commit**
```bash
git add assets/iconostat/window.js
git commit -m "fix(iconostat): correct reset() element-id lookup (window-<name>, not window-window-<name>)"
```

---

### Task 2: Fix #3 — toggleShade unreachable guard

**Files:** Modify `assets/iconostat/window.js`; Modify a spec (add a lock test)

- [ ] **Step 1: Fix the guard**

In `_toggleShade(e, force)` (~line 222), change `if (typeof(e) === 'Event')` to `if (e instanceof Event)`. Update the preceding "Locked bug, preserved verbatim…" comment to explain the guard is now live (skips shading when double-clicking a header button, and `preventDefault`s the dblclick). The guard body (button check, minimized check, `e.preventDefault()`) is unchanged.

- [ ] **Step 2: Add a test locking the corrected behavior**

Find the existing shade coverage (grep `shade` in `tests/e2e/`). Add a test (in the same spec file, e.g. `tests/e2e/dragresize.spec.js` or wherever shade is tested) asserting that double-clicking a header BUTTON does NOT shade the window:
```javascript
test('double-clicking a header button does not shade the window', async ({ page }) => {
  await openApp(page, 'resume');
  const w = win(page, 'resume');
  await w.locator('.window-header .button.minimize').dblclick();
  await expect(w).not.toHaveClass(/shaded/);
});
```
(Adjust `openApp`/`win` import + the window name to match the spec's conventions.)

- [ ] **Step 3: Run it — fails before... it's post-fix; just verify it passes + suite green**

```bash
cd /home/node/.agent-os/worktrees/tuckermclean.com-nice-phoenix && export LD_LIBRARY_PATH=/home/node/.cache/chrome-deps/usr/lib/x86_64-linux-gnu:/home/node/.cache/chrome-deps/lib/x86_64-linux-gnu:/home/node/.cache/chrome-deps/usr/lib:/home/node/.cache/chrome-deps/lib && npm run test:e2e && npx vitest run
```
Expected: the new test passes; full suite green. If any EXISTING test asserted the old behavior (a header-button dblclick shading), update it to the corrected behavior and note it.

- [ ] **Step 4: Commit**
```bash
git add assets/iconostat/window.js tests/
git commit -m "fix(iconostat): make toggleShade guard live (e instanceof Event) so header-button dblclick no longer shades"
```

---

### Task 3: Fix #2 — reflow cascade no longer un-minimizes / disrupts minimized windows

**Files:** Modify `assets/iconostat/desktop.js`; add a lock test

- [ ] **Step 1: Add a keepMinimized option to cascade(); reflow uses it**

In `assets/iconostat/desktop.js`, change `cascade()` to `cascade({ keepMinimized = false } = {})`. Inside the per-window loop, when `keepMinimized` is true AND the window is minimized, SKIP it entirely (do not `minimize(false)` it, do not `reset()`/`bringToFront()` it — leave it minimized in the taskbar). Non-minimized windows are handled exactly as today. Then in `_installReflow()`, change BOTH the resize and orientationchange handlers to call `this.cascade({ keepMinimized: true })`. The menu "Cascade Windows" command (`window.cascadeWindows` → `getDesktop().cascade()`) stays a no-arg call, so it still un-minimizes (its intended behavior). Preserve the existing history-suppression (`_suppressHistory`) wrapping.

- [ ] **Step 2: Add a test locking the fix**

Add to `tests/e2e/reflow.spec.js` (match its style/imports) a test asserting a viewport resize does NOT un-minimize a minimized window:
```javascript
test('a viewport resize does not un-minimize a minimized window', async ({ page }) => {
  await openApp(page, 'resume');
  await win(page, 'resume').locator('.button.minimize').click();
  await expect(win(page, 'resume')).toHaveClass(/minimized/);
  await page.setViewportSize({ width: 1000, height: 800 });   // fires the reflow cascade
  await page.waitForTimeout(400);                              // past the 300ms debounce
  await expect(win(page, 'resume')).toHaveClass(/minimized/);  // still minimized after reflow
});
```

- [ ] **Step 3: Update any existing reflow test that assumed un-minimize; verify DETERMINISTIC green**

Read `tests/e2e/reflow.spec.js` and update any assertion that relied on reflow un-minimizing. Keep the SP-B `openApp` mobile settle as-is (general timing hygiene). Then verify determinism (behavior change + flake history):
```bash
cd /home/node/.agent-os/worktrees/tuckermclean.com-nice-phoenix && export LD_LIBRARY_PATH=/home/node/.cache/chrome-deps/usr/lib/x86_64-linux-gnu:/home/node/.cache/chrome-deps/lib/x86_64-linux-gnu:/home/node/.cache/chrome-deps/usr/lib:/home/node/.cache/chrome-deps/lib && npx vitest run && for i in 1 2 3 4; do npm run test:e2e 2>&1 | grep -iE "^\s*[0-9]+ (passed|failed)|flaky" | tail -2; done
```
Expected: unit 12/12; e2e all-pass on all 4 runs, 0 flaky.

- [ ] **Step 4: Commit**
```bash
git add assets/iconostat/desktop.js tests/e2e/reflow.spec.js
git commit -m "fix(iconostat): reflow cascade preserves minimized windows (resize no longer un-minimizes)"
```

---

### Task 4: Fix #1 — navigateToPage no longer drops an already-open window on Back/Forward

**Files:** Modify `assets/js/window.js`; update `tests/e2e/boot.spec.js`

- [ ] **Step 1: Fix the recycling**

In `navigateToPage(targetWindowId, name, niceName, icon)` in `assets/js/window.js`: currently, when a window for `name` already exists (`oldWindow`), it calls `oldWindow.close()` then renames `windowElement` into `name` — destroying `oldWindow`. Change it so that when `oldWindow` already exists, we simply bring it to front and return WITHOUT closing anything or renaming the top window:
```javascript
function navigateToPage(targetWindowId, name, niceName, icon = '⚙️') {
    if (targetWindowId === `window-${name}`) return;
    const windowElement = getDesktop().windows.find(w => w.id === targetWindowId);
    const oldWindow = getDesktop().windows.find(w => w.id === `window-${name}`);
    if (typeof(oldWindow) !== 'undefined') {
        // The target page already has its own window — navigate to it instead of
        // destroying it and renaming the current top window (which lost a window).
        getDesktop().bringToFront(oldWindow);
        return;
    }
    if (typeof(windowElement) !== 'undefined') {
        // (unchanged) recycle the top window into a not-yet-open page
        windowElement.id = "window-" + name;
        // ...rest unchanged...
    } else {
        openPage(name, niceName, icon, undefined, false, false);
    }
}
```
Leave the not-yet-open recycle path (the `windowElement` branch) and the `openPage` fallback UNCHANGED.

- [ ] **Step 2: Update boot.spec.js recycling test to the corrected behavior**

`tests/e2e/boot.spec.js` has a test ("back/forward recycles windows rather than duplicating them", ~line 45) that LOCKS the old buggy 3→2→2 window-drop. Update it to assert the corrected behavior: Back/Forward navigates between the three open windows WITHOUT dropping any (count stays 3), bringing the correct one to front. Rewrite its body:
```javascript
test('back/forward navigates between open windows without dropping any', async ({ page }) => {
  await openApp(page);                 // welcome
  await openViaMenu(page, 'Resume');   // resume
  await openViaMenu(page, 'Intro');    // intro
  await expect(page.locator('.window')).toHaveCount(3);

  await page.goBack();                                     // -> resume
  await expect(win(page, 'resume')).toHaveClass(/front/);
  await expect(page.locator('.window')).toHaveCount(3);    // no window dropped (was 2 — the bug)

  await page.goForward();                                  // -> intro
  await expect(win(page, 'intro')).toHaveClass(/front/);
  await expect(page.locator('.window')).toHaveCount(3);
});
```
Update the test name + comments to describe the corrected behavior. Check whether any OTHER test (e.g. `state.spec.js`) also asserts the old drop behavior and update it too.

- [ ] **Step 3: Verify DETERMINISTIC green (this is the historically-flaky recycling path)**

```bash
cd /home/node/.agent-os/worktrees/tuckermclean.com-nice-phoenix && export LD_LIBRARY_PATH=/home/node/.cache/chrome-deps/usr/lib/x86_64-linux-gnu:/home/node/.cache/chrome-deps/lib/x86_64-linux-gnu:/home/node/.cache/chrome-deps/usr/lib:/home/node/.cache/chrome-deps/lib && npx playwright test tests/e2e/boot.spec.js tests/e2e/state.spec.js --project=desktop --repeat-each=5 && npx vitest run && for i in 1 2 3 4; do npm run test:e2e 2>&1 | grep -iE "^\s*[0-9]+ (passed|failed)|flaky" | tail -2; done
```
Expected: the recycling test 5/5; unit 12/12; full e2e all-pass across 4 runs, 0 flaky.

- [ ] **Step 4: Commit**
```bash
git add assets/js/window.js tests/e2e/boot.spec.js
git commit -m "fix(iconostat): Back/Forward navigates to an existing window instead of dropping it"
```

---

## Self-Review

**Coverage:** #4 → Task 1; #3 → Task 2; #2 → Task 3; #1 → Task 4. Each includes the code fix, the test update/addition locking the corrected behavior, and (for behavior-changers #2/#1) deterministic high-repeat verification given the flake history. ✓

**Placeholder scan:** concrete diffs + test code shown; exact files/functions named. ✓

**Consistency:** `cascade({keepMinimized})` (Task 3) is the only signature change; the menu command's no-arg `cascade()` call is explicitly preserved. `navigateToPage`'s changed branch (Task 4) leaves the recycle/openPage paths intact. ✓

**Note:** these are deliberate behavior changes — the whole point is to alter what the locked characterization tests asserted. Reviewers should verify the NEW behavior is correct and the updated tests assert it (not that the old behavior is preserved).
