import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.js'],
    coverage: {
      provider: 'v8',
      include: ['assets/js/env.js'],
      reporter: ['text', 'html'],
      reportsDirectory: './coverage/unit',
    },
  },
});
