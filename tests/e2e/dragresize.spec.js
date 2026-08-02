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
  //
  // Deliberately a single-step move (no `steps`): with interpolated steps,
  // interim mousemove events would carry clientY values still above
  // headerHeight/2, updating `top` on those interim events before the final
  // guarded step -- the guard only freezes `top` at its last-updated value,
  // not at the pre-drag value, which made this assertion flaky/wrong with
  // steps > 1. A single jump straight to clientY=1 ensures the only mousemove
  // event fired is the one that trips the guard, so `top` never updates.
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 60, 1);
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
