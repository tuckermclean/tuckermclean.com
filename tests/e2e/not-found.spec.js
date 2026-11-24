import { test, expect } from './fixtures.js';
import { win } from './helpers.js';

// static/404.html is what Cloudflare (and hugo server) serve for a missing path.
// It must send the browser to the desktop's hash route on the same origin.

test('T05-AC-4: a missing page path /resume ends at <origin>/#/resume with the resume window open', async ({ page, baseURL }) => {
  await page.goto('/resume');
  const origin = new URL(baseURL).origin;
  await expect(page).toHaveURL(`${origin}/#/resume`);
  await expect(win(page, 'resume')).toBeVisible();
});

test('T05-AC-5: a missing post path /posts/my-cloud-journey ends at <origin>/#/posts/my-cloud-journey', async ({ page, baseURL }) => {
  await page.goto('/posts/my-cloud-journey');
  const origin = new URL(baseURL).origin;
  await expect(page).toHaveURL(`${origin}/#/posts/my-cloud-journey`);
});
