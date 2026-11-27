import { test, expect } from './fixtures.js';
import { openApp, openViaMenu, win } from './helpers.js';

test('opening a page shows correct title + icon and sets the hash', async ({ page }) => {
  await openApp(page);
  await openViaMenu(page, 'Resume');
  await expect(win(page, 'resume')).toBeVisible();
  await expect(win(page, 'resume').locator('.window-title')).toHaveText('Resume');
  await expect(win(page, 'resume').locator('.window-icon')).toHaveText('📜');
  await expect(page).toHaveURL(/#\/resume$/);
});

test('opening an already-open page does not duplicate it', async ({ page }) => {
  await openApp(page);
  await openViaMenu(page, 'Resume');
  await expect(win(page, 'resume')).toHaveCount(1);
  await openViaMenu(page, 'Resume');
  await expect(win(page, 'resume')).toHaveCount(1);
  await expect(win(page, 'resume')).toHaveClass(/front/);
});

test('closing a window promotes the remaining top window and updates the hash', async ({ page }) => {
  await openApp(page); // welcome
  await openViaMenu(page, 'Resume'); // resume front, #/resume
  await win(page, 'resume').locator('.button.close').click();
  await expect(win(page, 'resume')).toHaveCount(0);
  await expect(win(page, 'welcome')).toHaveClass(/front/);
  await expect(page).toHaveURL(/#\/welcome$/);
});

test('closing the last window clears the URL back to /', async ({ page }) => {
  await openApp(page, 'resume'); // only resume open
  await win(page, 'resume').locator('.button.close').click();
  await expect(win(page, 'resume')).toHaveCount(0);
  await expect(page).toHaveURL('http://localhost:1313/');
});

test('minimize moves the window into #tasks; clicking it restores and refocuses', async ({ page }) => {
  await openApp(page, 'resume');
  await win(page, 'resume').locator('.button.minimize').click();
  await expect(page.locator('#tasks #window-resume')).toBeVisible();
  await expect(win(page, 'resume')).toHaveClass(/minimized/);

  await page.locator('#tasks #window-resume').click();
  await expect(win(page, 'resume')).not.toHaveClass(/minimized/);
  await expect(page.locator('body > #window-resume')).toBeVisible();
  await expect(win(page, 'resume')).toHaveClass(/front/);
});

test('maximize toggles the maximized class', async ({ page }) => {
  await openApp(page, 'resume');
  await win(page, 'resume').locator('.button.maximize').click();
  await expect(win(page, 'resume')).toHaveClass(/maximized/);
  await win(page, 'resume').locator('.button.maximize').click();
  await expect(win(page, 'resume')).not.toHaveClass(/maximized/);
});

test('double-clicking the header toggles the shaded class', async ({ page }) => {
  await openApp(page, 'resume');
  await win(page, 'resume').locator('.window-header').dblclick();
  await expect(win(page, 'resume')).toHaveClass(/shaded/);
  await win(page, 'resume').locator('.window-header').dblclick();
  await expect(win(page, 'resume')).not.toHaveClass(/shaded/);
});

test('double-clicking a header button does not shade the window', async ({ page }) => {
  await openApp(page, 'resume');
  const w = win(page, 'resume');
  await w.locator('.window-header .button.maximize').dblclick();
  await expect(w).not.toHaveClass(/shaded/);
});

// T06-AC-4 / T06-AC-2: a page load that completes after Minimize All must not
// un-minimize its window. The fragment request is held so the race happens on
// every run: Intro's window exists (its load pending), Minimize All runs, then
// the load completes.
async function T06_holdIntro(page) {
  let release;
  const gate = new Promise((r) => { release = r; });
  await page.route('**/intro.html', async (route) => { await gate; await route.continue(); });
  return release;
}

for (const [label, rm] of [['Tier 0', 'reduce'], ['FX tier', 'no-preference']]) {
  test.describe(`T06 late page load vs Minimize All (${label})`, () => {
    test.use({ reducedMotion: rm });

    test(`T06-AC-4 T06-AC-2: a load completing after Minimize All leaves its window minimized (${label}, forced)`, async ({ page }) => {
      await openApp(page, 'resume');
      const release = await T06_holdIntro(page);
      await openViaMenu(page, 'Intro');
      await expect(win(page, 'intro')).toHaveCount(1);
      await openViaMenu(page, 'Minimize All');
      await expect(page.locator('#tasks #window-intro')).toHaveCount(1);
      await expect(win(page, 'intro')).toHaveClass(/minimized/);

      release();
      await expect(page.locator('#intro-container > *').first()).toBeAttached();

      await expect(win(page, 'intro')).toHaveCount(1);
      await expect(win(page, 'intro')).toHaveClass(/minimized/);
      await expect(page.locator('#tasks #window-intro')).toHaveCount(1);
      await expect(page.locator('#tasks #window-resume')).toHaveCount(1);
    });

    test(`T06-AC-4: a load completing after focusing another window still brings its window to the front (${label}, kept behaviour)`, async ({ page }) => {
      await openApp(page, 'resume');
      const release = await T06_holdIntro(page);
      await openViaMenu(page, 'Intro');
      await expect(win(page, 'intro')).toHaveCount(1);
      await win(page, 'resume').locator('.window-header').click();
      await expect(win(page, 'resume')).toHaveClass(/front/);

      release();
      await expect(page.locator('#intro-container > *').first()).toBeAttached();

      await expect(win(page, 'intro')).toHaveClass(/front/);
      await expect(win(page, 'intro')).not.toHaveClass(/minimized/);
    });
  });
}

// FX tier needs the media emulation (the auto fixture forces 'reduce') and Tier 1 forced.
async function T06_forceTier(page, rm) {
  await page.emulateMedia({ reducedMotion: rm });
  if (rm === 'no-preference') {
    await page.addInitScript(() => window.localStorage.setItem('iconostat-fx-tier', '1'));
  }
}

// T06-AC-4: after the late load of a minimized window, restoring it from its chip
// brings it to the front and puts its page in the URL (Tier 0 and FX tier).
async function T06_lateIntroUnderMinimizeAll(page) {
  await openApp(page, 'resume');
  const release = await T06_holdIntro(page);
  await openViaMenu(page, 'Intro');
  await expect(win(page, 'intro')).toHaveCount(1);
  await openViaMenu(page, 'Minimize All');
  await expect(page.locator('#tasks #window-intro')).toHaveCount(1);
  release();
  await expect(page.locator('#intro-container > *').first()).toBeAttached();
}

for (const [label, rm] of [['Tier 0', 'reduce'], ['FX tier', 'no-preference']]) {
  test.describe(`T06 restoring a window whose load completed while minimized (${label})`, () => {
    test.use({ reducedMotion: rm });
    test.beforeEach(async ({ page }) => { await T06_forceTier(page, rm); });

    test(`T06-AC-4: the late load does not change the URL (${label}, forced)`, async ({ page }) => {
      await T06_lateIntroUnderMinimizeAll(page);
      await expect(win(page, 'intro')).toHaveClass(/minimized/);
      await expect(page).toHaveURL(/#\/resume$/);
    });

    test(`T06-AC-4: restoring Resume then Intro after the late load puts Intro in front at #/intro (${label}, forced)`, async ({ page }) => {
      await T06_lateIntroUnderMinimizeAll(page);
      await page.locator('#tasks #window-resume').click();
      await expect(win(page, 'resume')).not.toHaveClass(/minimized/);
      await page.locator('#tasks #window-intro').click();
      await expect(win(page, 'intro')).not.toHaveClass(/minimized/);
      await expect(win(page, 'intro')).toHaveClass(/front/);
      await expect(win(page, 'resume')).not.toHaveClass(/front/);
      await expect(page).toHaveURL(/#\/intro$/);
    });

    test(`T06-AC-4: restoring only Intro after the late load puts Intro in front at #/intro (${label}, forced)`, async ({ page }) => {
      await T06_lateIntroUnderMinimizeAll(page);
      await page.locator('#tasks #window-intro').click();
      await expect(win(page, 'intro')).not.toHaveClass(/minimized/);
      await expect(win(page, 'intro')).toHaveClass(/front/);
      await expect(page).toHaveURL(/#\/intro$/);
    });
  });

  test.describe(`T06 post load completing after Minimize All (${label})`, () => {
    test.use({ reducedMotion: rm });
    test.beforeEach(async ({ page }) => { await T06_forceTier(page, rm); });

    test(`T06-AC-4 T06-AC-2: a renamed window whose load completes after Minimize All stays minimized (${label}, forced)`, async ({ page }) => {
      await openApp(page, 'writings');
      const slug = 'posts/my-cloud-journey';
      let release;
      const gate = new Promise((r) => { release = r; });
      await page.route('**/posts/my-cloud-journey.html', async (route) => { await gate; await route.continue(); });
      await win(page, 'writings').locator('.writings-list a[href="#/posts/my-cloud-journey"]').click();
      await expect(win(page, slug)).toHaveCount(1);
      await openViaMenu(page, 'Minimize All');
      await expect(page.locator('#tasks').locator(`[id="window-${slug}"]`)).toHaveCount(1);

      release();
      await expect(page.locator(`[id="${slug}-container"] > *`).first()).toBeAttached();

      await expect(win(page, slug)).toHaveClass(/minimized/);
      await expect(page.locator('#tasks').locator(`[id="window-${slug}"]`)).toHaveCount(1);
      await expect(page).not.toHaveURL(/#\/posts\//);
    });
  });
}
