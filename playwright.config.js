import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Run serially. These real-browser tests drive stateful async UI choreography
  // (fetch-loaded fragments, the debounced resize→cascade, history, CSS
  // transitions) against a single shared hugo server. Two concurrent browsers
  // on constrained hardware intermittently mis-time that choreography, causing
  // low-rate flakiness scattered across unrelated timing-sensitive specs. The
  // suite is small (42 tests, ~41s serial — actually FASTER than parallel here,
  // since the browser handles concurrency poorly), so determinism beats the
  // marginal parallel speedup. Every spec also passes standalone; serial just
  // removes the cross-test contention. Bump workers only if the suite grows
  // large enough that serial wall-time hurts AND the browser environment is
  // well-provisioned.
  workers: 1,
  reporter: [['html', { open: 'never' }], ['list']],
  // Web-first assertions default to a 5s timeout. Under the full parallel run
  // (both projects + coverage overhead) on constrained hardware, an occasional
  // load spike can push an auto-retrying assertion (e.g. toHaveURL after the
  // async loadHTML+bringToFront hash push) past 5s. 10s absorbs the spike
  // without masking real failures — a genuinely wrong value still fails.
  expect: { timeout: 10_000 },
  globalSetup: './tests/e2e/coverage-setup.js',
  globalTeardown: './tests/e2e/coverage-teardown.js',
  use: {
    baseURL: 'http://localhost:1313',
    viewport: { width: 1280, height: 900 },
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'desktop',
      testDir: './tests/e2e',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } },
    },
    {
      name: 'mobile',
      testDir: './tests/mobile',
      use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true },
    },
  ],
  webServer: {
    command: 'npx hugo server --port 1313 --disableFastRender --renderToMemory',
    url: 'http://localhost:1313/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
