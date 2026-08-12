import { test as base, expect } from '@playwright/test';
import MCR from 'monocart-coverage-reports';
import { coverageOptions } from '../../coverage.config.js';

// Auto fixture: collect Chromium V8 JS coverage around every test and feed it
// to monocart. No-op on non-Chromium (page.coverage is Chromium-only), but both
// projects here are Chromium.
//
// Note: `monocart-coverage-reports` does not export an `addCoverageReport`
// helper (despite some docs suggesting otherwise) -- the documented API for
// multi-process collection is `MCR(coverageOptions)` (a per-outputDir
// singleton backed by an on-disk cache) + `.add(coverageData)` per worker,
// then a single `.generate()` call in global teardown. See "Multiprocessing
// Support" in the monocart-coverage-reports README.
export const test = base.extend({
  autoCoverage: [async ({ page }, use) => {
    const supported = typeof page.coverage?.startJSCoverage === 'function';
    if (supported) await page.coverage.startJSCoverage({ resetOnNavigation: false });
    await use();
    if (supported) {
      const jsCoverage = await page.coverage.stopJSCoverage();
      const mcr = MCR(coverageOptions);
      await mcr.add(jsCoverage);
    }
  }, { auto: true }],

  // Defensive workaround: in this sandbox's Chromium build, the
  // `reducedMotion` CONTEXT option (playwright.config.js's top-level
  // `use: { reducedMotion: 'reduce' }`, which forces Tier 0 for the fx
  // feature -- see assets/iconostat/fx/controller.js) does not reliably
  // propagate to `matchMedia('(prefers-reduced-motion: reduce)')` at page
  // load, even though it's the documented, standard way to do this and the
  // config option is still set correctly for portability. `page.
  // emulateMedia()` DOES work reliably here. Apply it explicitly, every
  // test, before navigation -- this makes the "default suite runs Tier 0"
  // guarantee actually hold in this environment. fx-tier1.spec.js's Tier-1
  // tests override it back to 'no-preference' via their own
  // `page.emulateMedia()` call (see that file), which runs after this
  // auto-fixture and before openApp() navigates.
  autoReducedMotion: [async ({ page }, use) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await use();
  }, { auto: true }],
});

export { expect };
