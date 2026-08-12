// tests/unit/stubs/empty-fx-module.js
//
// Test-only stand-in for assets/iconostat/fx/genie.js/wobble.js, which don't
// exist on disk yet (Agents C/D land them later -- see task-B-brief.md).
// vitest.config.js aliases controller.js's `import('./genie.js')`/
// `import('./wobble.js')` specifiers to this file SOLELY so Vite's
// import-analysis transform can parse controller.js at all -- Vite resolves
// every dynamic-import specifier at parse time regardless of whether the
// branch containing it ever runs, unlike the real production pipeline
// (Hugo/esbuild + a browser's native `import()`), which leaves an
// unresolvable dynamic import alone until runtime, where it 404s gracefully
// (exactly the behavior `_loadGenie()`/`_loadWobble()`'s `.catch(() => null)`
// is built to handle -- see fx-tier2.spec.js's e2e proof of that).
//
// This file is NEVER imported by production code and is NOT part of the fx/
// file layout in the spec -- it only exists so `npx vitest run` can load
// controller.js in the first place. Every test in
// tests/unit/fx-controller-tier2.test.js monkeypatches
// `FxController._loadGenie`/`_loadWobble` directly, so this stub's contents
// are never actually exercised.
export default {};
