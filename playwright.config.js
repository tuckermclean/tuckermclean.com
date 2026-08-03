import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['html', { open: 'never' }], ['list']],
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
