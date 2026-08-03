// Shared monocart-coverage-reports options (used by the E2E fixture + teardown).
//
// NOTE: `cleanCache: true` is intentionally NOT set here. `MCR(coverageOptions)`
// / `new CoverageReport(coverageOptions)` constructs a brand-new instance on
// every call (it is not a process-wide singleton), and the `cleanCache: true`
// *option* triggers an automatic cache wipe in the constructor. Since the
// per-test fixture (tests/e2e/fixtures.js) and the global teardown
// (tests/e2e/coverage-teardown.js) each construct their own instance, baking
// `cleanCache: true` into these shared options would wipe the on-disk
// `.cache` dir after every single test -- including right before the
// teardown's own `generate()` call -- leaving a report with zero coverage.
// Instead, the one-time pre-run cleanup lives in tests/e2e/coverage-setup.js,
// which calls the `cleanCache()` *method* explicitly exactly once, matching
// the "Multiprocessing Support" pattern documented by monocart-coverage-reports.
export const coverageOptions = {
  name: 'window-manager E2E coverage',
  outputDir: './coverage/e2e',
  reports: [['v8'], ['console-summary']],
  // Only collect from the fingerprinted main bundle. Without this, Chromium's
  // per-test JS coverage also includes chat.js (no source map -> counted as
  // one big opaque blob), Hugo's injected livereload.js (one entry per
  // reconnect, i.e. dozens of near-duplicates), and inline <script> tags
  // (attributed to the page URL itself) -- all of which pollute the summary
  // with unrelated bytes/statements and never get a chance to hit
  // `sourceFilter` below (that filter only runs on paths unpacked from an
  // entry's source map; entries with no source map are kept/dropped by
  // `entryFilter` alone, using their raw request URL).
  entryFilter: (entry) => Boolean(entry.url) && entry.url.includes('/js/bundle'),
  // Keep only our source files (drop node/hugo/bundled runtime).
  sourceFilter: (sourcePath) => sourcePath.includes('assets/js/'),
  // esbuild feeds the Hugo `main.js` resource to itself over stdin (it's an
  // in-memory Hugo resource, not read from a real path), so the inline source
  // map names it "<stdin>" instead of a real path. Rewrite it to its real
  // source location so it passes `sourceFilter` and reports as its own file
  // instead of being silently dropped.
  sourcePath: (filePath, info) => {
    if (info && info.url === '<stdin>') {
      return 'assets/js/main.js';
    }
    return filePath;
  },
};
