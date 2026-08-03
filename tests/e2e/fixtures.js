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
});

export { expect };
