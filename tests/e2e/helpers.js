import { expect } from '@playwright/test';

/** Navigate to the app (optionally deep-linking to #/<hash>) and wait for boot. */
export async function openApp(page, hash = '') {
  await page.goto(hash ? `/#/${hash}` : '/');
  await expect(page.locator('.window').first()).toBeVisible();
  // Playwright mobile emulation loads at the default 980px layout viewport,
  // then a REAL resize to the emulated device width (e.g. 390px) fires as the
  // emulation applies. That resize triggers the window manager's
  // 300ms-debounced reflow cascade (which un-minimizes any minimized window).
  // Tests that minimize a window shortly after openApp can race this
  // load-settle cascade. Real mobile devices load directly at the device
  // width -- there is no such resize -- so this is purely a Playwright
  // emulation artifact. Wait for the emulated width to be in effect and for
  // the debounced cascade to have fired and settled before returning, so
  // every mobile test starts from a settled layout. This is a no-op on
  // desktop, which never sees the 980->device resize.
  const vp = page.viewportSize();
  if (vp && vp.width <= 768) {
    await page.waitForFunction((w) => window.innerWidth <= w, vp.width);
    await page.waitForTimeout(600); // debounce is 300ms; wait 600ms for margin
  }
}

/** Open the Start menu and click the menu item whose text contains `label`. */
export async function openViaMenu(page, label) {
  await page.locator('#start-button').click();
  await expect(page.locator('#menu')).toHaveClass(/active/);
  await page.locator('#menu .menu-item', { hasText: label }).click();
}

/** The window element for a given page name. Escapes '/' since nested-path
 *  page names (e.g. 'posts/my-cloud-journey') produce a DOM id containing a
 *  literal slash, which is invalid in an unescaped CSS id selector. */
export const win = (page, name) => page.locator(`#window-${name.replace(/\//g, '\\/')}`);
