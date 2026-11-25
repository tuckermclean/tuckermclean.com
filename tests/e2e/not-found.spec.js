import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

test('T05-AC-4: 404.html served at / does not reload-loop', async ({ page, baseURL }) => {
  const origin = new URL(baseURL).origin;
  const body = readFileSync(join(process.cwd(), 'static', '404.html'), 'utf8');
  let rootRequests = 0;
  await page.route(
    (url) => url.origin === origin && url.pathname === '/',
    async (route) => {
      if (route.request().resourceType() !== 'document') return route.continue();
      rootRequests += 1;
      // past a few requests it is a loop: stop feeding it so the test ends with a plain failure
      const html = rootRequests > 5 ? '<!DOCTYPE html><title>loop stopped</title>' : body;
      await route.fulfill({ status: 404, contentType: 'text/html', body: html });
    },
  );
  await page.goto('/', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await new Promise((resolve) => setTimeout(resolve, 2000));
  expect(rootRequests, 'document requests to / (a loop reloads it again and again)').toBe(1);
  expect(page.url()).toBe(`${origin}/`);
  await expect(page.locator('#go')).toHaveAttribute('href', `${origin}/`);
});
