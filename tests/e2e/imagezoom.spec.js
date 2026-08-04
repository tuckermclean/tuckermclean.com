import { test, expect } from './fixtures.js';
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
  const postWin = win(page, 'posts/my-cloud-journey');
  const img = postWin.locator('img.feature-image');
  await img.click();
  await expect(win(page, ZOOM)).toHaveCount(1);
  // The zoom window now sits on top and visually overlaps the feature image,
  // so bring the post window back to front (clicking its header, which is
  // not covered) before clicking the image again, as a real user would.
  await postWin.locator('.window-header').click();
  await img.click();
  await expect(win(page, ZOOM)).toHaveCount(1);
  await expect(win(page, ZOOM)).toHaveClass(/front/);
});
