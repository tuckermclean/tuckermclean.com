import { test, expect } from './fixtures.js';
import { openApp, win } from './helpers.js';

const IDLE_MSGS = [
  'Status: It is now safe to turn off your computer.',
  'Status: General Protection Fault. Just kidding.',
  'Status: Press F1 for help. Press F2 to be confused.',
  'Status: Insert disk 2 of 47 to continue.',
  "Status: Error 418: I'm a teapot.",
  'Status: Have you tried turning it off and on again?',
  'Status: Searching for intelligent life... still searching...',
];
const DEFAULT_STATUS = 'Status: Ready to work!';

test('hovering a link shows its href in the status bar, mouseout resets it', async ({ page }) => {
  await openApp(page, 'resume');
  const w = win(page, 'resume');
  const link = w.locator('.window-body a[href]').first();
  const href = await link.getAttribute('href');
  await link.hover();
  await expect(w.locator('.window-status-bar')).toHaveText(href);
  // Move away from the link.
  await w.locator('.window-title').hover();
  await expect(w.locator('.window-status-bar')).toHaveText(DEFAULT_STATUS);
});

test('external links are hardened with target=_blank and rel', async ({ page }) => {
  await openApp(page, 'resume');
  const gh = win(page, 'resume').locator('.window-body a[href*="github.com"]').first();
  await expect(gh).toHaveAttribute('target', '_blank');
  await expect(gh).toHaveAttribute('rel', 'noopener noreferrer');
});

test('after 45s idle the status bar shows an Easter egg, then reverts after 8s', async ({ page }) => {
  await page.clock.install();
  await openApp(page);                 // welcome front window
  await page.clock.runFor(300);        // flush any init timers
  await page.clock.fastForward(45000); // trigger idle
  const bar = page.locator('.window.front .window-status-bar');
  await expect.poll(async () => (await bar.textContent()).trim()).toEqual(
    expect.stringMatching(new RegExp(IDLE_MSGS.map(m => m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')))
  );
  await page.clock.fastForward(8000);  // revert
  await expect(bar).toHaveText(DEFAULT_STATUS);
});
