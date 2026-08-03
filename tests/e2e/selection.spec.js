import { test, expect } from './fixtures.js';
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
