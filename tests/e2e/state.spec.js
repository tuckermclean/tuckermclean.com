import { test, expect } from './fixtures.js';
import { openApp, win } from './helpers.js';

const TOL = 2;
const boxOf = (locator) =>
  locator.evaluate(el => ({ top: el.offsetTop, left: el.offsetLeft, width: el.offsetWidth, height: el.offsetHeight }));
const near = (a, b) => Math.abs(a - b) <= TOL;

async function drag(page, handle, from, dx, dy) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 10 });
  await page.mouse.up();
}

// Move the window off its default cascade position (and optionally resize it)
// before recording `before`, so the round-trip assertions are load-bearing:
// a broken save/restore would leave the window at the untouched default
// spot/size rather than accidentally matching it.
async function moveAndResize(page, w, { resize = false } = {}) {
  const header = await w.locator('.window-header').boundingBox();
  const headerStart = { x: header.x + header.width / 2, y: header.y + header.height / 2 };
  await drag(page, w.locator('.window-header'), headerStart, 120, 90);
  if (resize) {
    const grip = await w.locator('.grippy').boundingBox();
    const gripStart = { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 };
    await drag(page, w.locator('.grippy'), gripStart, 80, 60);
  }
}

test('maximize then restore returns the window to its prior box', async ({ page }) => {
  // NOTE: `.window.maximized` sets width/height/top/left via CSS `!important`
  // (see assets/css/style.css); toggleMaximize() never rewrites the inline
  // style.top/left/width/height while maximized, so restoreWindowState() on
  // exit is a no-op -- class removal alone reveals the untouched inline
  // styles. This test characterizes the observable CSS-class round-trip,
  // not restoreWindowState() correctness.
  await openApp(page, 'resume');
  const w = win(page, 'resume');
  await moveAndResize(page, w, { resize: true });
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
  // toggleMinimize() -> resetWindow() blanks style.top/left/width/height
  // while minimized, so restoreWindowState() on exit must actively reload
  // the saved geometry -- a broken restore would leave the window at the
  // default cascade spot instead of the moved/resized box below. This
  // assertion is load-bearing for restoreWindowState().
  await openApp(page, 'resume');
  const w = win(page, 'resume');
  await moveAndResize(page, w, { resize: true });
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
  // toggleShade() writes style.top directly on entry (topDistance +
  // headerHeight/2) and restoreWindowState() reloads the saved top on exit,
  // so the `top` assertion is load-bearing for restoreWindowState(). Height,
  // however, is driven purely by CSS `.shaded{height:2.5rem!important}` --
  // style.height is never touched by JS -- so the `height` assertion
  // characterizes the CSS-class round-trip, not restore logic.
  await openApp(page, 'resume');
  const w = win(page, 'resume');
  await moveAndResize(page, w);
  const before = await boxOf(w);
  await w.locator('.window-header').dblclick();
  await expect(w).toHaveClass(/shaded/);
  await w.locator('.window-header').dblclick();
  await expect(w).not.toHaveClass(/shaded/);
  const after = await boxOf(w);
  expect(near(after.top, before.top) && near(after.height, before.height)).toBe(true);
});
