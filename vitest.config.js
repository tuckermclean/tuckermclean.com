import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      // Test-only: assets/iconostat/fx/controller.js dynamically imports
      // `./genie.js`/`./wobble.js` (Agents C/D's not-yet-built modules --
      // see docs/superpowers/specs/2026-08-11-iconostat-fx-design.md, Agent
      // B). Vite's import-analysis transform resolves every `import()`
      // specifier eagerly at parse time, regardless of whether the branch
      // containing it ever runs, so merely loading controller.js under
      // vitest fails outright while those files don't exist on disk -- the
      // real production pipeline (Hugo/esbuild + a browser's native
      // `import()`) has no such restriction; an unresolvable dynamic import
      // is simply left alone until runtime, where it 404s gracefully (this
      // is exactly the behavior `_loadGenie()`/`_loadWobble()`'s
      // `.catch(() => null)` exists to handle -- proven for real in
      // tests/e2e/fx-tier2.spec.js). Redirecting both specifiers to a tiny
      // inert stub, ONLY inside this test config, lets vitest parse
      // controller.js without ever creating real genie.js/wobble.js files
      // (out of scope for this agent) or changing what ships to the browser
      // (vitest.config.js is never read by the Hugo/esbuild build).
      { find: './genie.js', replacement: path.resolve(__dirname, 'tests/unit/stubs/empty-fx-module.js') },
      { find: './wobble.js', replacement: path.resolve(__dirname, 'tests/unit/stubs/empty-fx-module.js') },
    ],
  },
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
