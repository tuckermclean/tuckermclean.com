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
