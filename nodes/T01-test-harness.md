# T01 — test-harness

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| done | none | I01, I02, I03, T02 | S |

**Owns:** `package.json`, `package-lock.json`, `vitest.config.js`, `playwright.config.js`, `coverage.config.js`,
`tests/e2e/fixtures.js`, `tests/e2e/helpers.js`, `tests/e2e/coverage-setup.js`, `tests/e2e/coverage-teardown.js`

## Purpose

The npm packages and the test runners' configuration that every test, and the gate command, runs through.
`package.json` names the scripts (`dev`, `build`, `preview`, `test`, `test:unit`, `test:unit:cov`, `test:e2e`,
`test:e2e:ui`, `test:cov`) and the packages: `playwright` under `dependencies`, and `@playwright/test`,
`@vitest/coverage-v8`, `hugo-bin`, `jsdom`, `monocart-coverage-reports` and `vitest` under `devDependencies`;
`package-lock.json` pins them. None of them ships with the site, which Hugo builds.

`vitest.config.js` runs the unit tests in jsdom and aliases `./genie.js` and `./wobble.js` to
`tests/unit/stubs/empty-fx-module.js`. `playwright.config.js` defines the `desktop` and `mobile` projects, starts
`hugo server` from `hugo-bin`, runs one worker, retries once and rejects `test.only` under `CI`, prints the
`html` and `list` reports, and forces reduced motion. `tests/e2e/fixtures.js` extends Playwright's `test` with two
automatic fixtures (Chromium JS coverage and reduced motion); `tests/e2e/helpers.js` gives `openApp`,
`openViaMenu` and `win`; `coverage.config.js`, `tests/e2e/coverage-setup.js` and `tests/e2e/coverage-teardown.js`
collect the end-to-end coverage with monocart.

## Tests

No test targets these files directly; every unit and end-to-end test runs through them. The criteria below name
the tests that fail when the stated behaviour breaks: `tests/unit/env.test.js`, `tests/e2e/fx-tier1.spec.js`,
`tests/e2e/imagezoom.spec.js`, `tests/e2e/boot.spec.js` and `tests/mobile/mobile.spec.js`.

## Changes

none: imported

## Gate

- **T01-AC-1** — Vitest runs the files matching `tests/unit/**/*.test.js` in a jsdom environment. *Verify:* `CI=true npx vitest run tests/unit/env.test.js`.
- **T01-AC-2** — `vitest.config.js` aliases the `./genie.js` and `./wobble.js` import specifiers to `tests/unit/stubs/empty-fx-module.js`. *Verify:* unpinned: with both aliases removed the whole unit suite still passes (11 files, 83 tests), since both modules now exist.
- **T01-AC-3** — `npm run test:unit:cov` collects v8 coverage of `assets/js/env.js` only and writes a text and an HTML report to `coverage/unit/`. *Verify:* unpinned: no test reads the coverage report.
- **T01-AC-4** — Under `CI=true`, Playwright starts its own `hugo server` on port 1313 (`npx hugo`, the `hugo-bin` package's Hugo, rendering to memory) and the tests load pages from `http://localhost:1313`. *Verify:* `CI=true npx playwright test tests/e2e/fx-tier1.spec.js -g "Tier 0 proof"`.
- **T01-AC-5** — The `mobile` project runs the specs in `tests/mobile/` with touch and a viewport 390 wide. *Verify:* `CI=true npx playwright test tests/mobile/mobile.spec.js` (its window-fits test fails at a wider viewport, its tap tests without touch).
- **T01-AC-6** — The `desktop` project runs `tests/e2e/` as Desktop Chrome at 1280×900, and the `mobile` project emulates a Pixel 7 (mobile, 844 high). *Verify:* unpinned: not checked against a test.
- **T01-AC-7** — The default suite runs with reduced motion, so Iconostat FX stays at Tier 0: the config's `reducedMotion: 'reduce'` and the automatic fixture's `page.emulateMedia({ reducedMotion: 'reduce' })` on every page before navigation; with both gone a minimize leaves an FX trace. *Verify:* `CI=true npx playwright test tests/e2e/fx-tier1.spec.js -g "Tier 0 proof"`.
- **T01-AC-8** — Each of the two reduced-motion settings of T01-AC-7 alone keeps the suite at Tier 0. *Verify:* unpinned: only the two removed together were checked.
- **T01-AC-9** — `openApp(page, hash)` opens `/#/<hash>` (or `/` with no hash), and `win(page, name)` finds the window `#window-<name>`, escaping `/` so a nested page name such as `posts/my-cloud-journey` is a valid selector. *Verify:* `CI=true npx playwright test tests/e2e/imagezoom.spec.js`.
- **T01-AC-10** — `openViaMenu(page, label)` clicks `#start-button`, waits for `#menu` to be active and clicks the menu item whose text contains `label`. *Verify:* `CI=true npx playwright test tests/e2e/boot.spec.js:35` (browser Back/Forward navigate between opened windows).
- **T01-AC-11** — `openApp` waits for the first `.window` to be visible and, at a viewport width of 768 or less, for the emulated width to apply and then 600 ms for the debounced reflow to settle. *Verify:* unpinned: removing the first wait still passes `tests/e2e/fx-tier1.spec.js`'s Tier 0 test; the mobile wait guards a race no test forces.
- **T01-AC-12** — The automatic coverage fixture collects Chromium JS coverage around every test and adds it to monocart; `coverage-setup.js` clears the coverage cache once before the run and `coverage-teardown.js` writes the report (`v8` and a console summary) to `coverage/e2e/`, limited to the `/js/bundle` entries and their `assets/js/` sources, with esbuild's `<stdin>` source renamed to `assets/js/main.js`. *Verify:* unpinned: no test reads the coverage report.
- **T01-AC-13** — Under `CI`, Playwright retries a failing test once, rejects `test.only` and never reuses a running server; it always runs one worker, gives web-first assertions 10 s, keeps a trace on the first retry and prints the `list` report, whose `✘ … (retry #1)` line `gate.fail_pattern` reads. *Verify:* unpinned: no test asserts the runner's configuration.
- **T01-AC-14** — The `package.json` scripts: `test:unit` is `vitest run`, `test:unit:cov` is `vitest run --coverage`, `test:e2e` is `playwright test`, `dev` is `hugo server --buildDrafts --disableFastRender`, `build` is `hugo --minify`. *Verify:* unpinned: the gate runs the test scripts, but no test asserts them.

## Risks

- The comments in `vitest.config.js` and `tests/unit/stubs/empty-fx-module.js` say `genie.js` and `wobble.js` are
  not built yet; they exist in `assets/iconostat/fx/`, and the aliases are no longer needed to load
  `controller.js` (T01-AC-2). The stub file belongs to the `iconostat-fx` area.
- `playwright` is listed under `dependencies`, not `devDependencies`. Nothing ships it (Hugo builds the site), but
  the split reads as if the site had a runtime dependency.
- `hugo-bin` 0.145.2 runs Hugo 0.148.2 (non-extended) for the tests, while the deploy builds with Hugo extended
  0.164.0 (`SPEC.md` D4).
- The reduced-motion setting is applied twice: the fixture's comment says the config option alone did not reach
  `matchMedia` in the environment the tests were written in.
- The comment in `playwright.config.js` gives the suite as 42 tests in about 41 s; it has since grown (138
  end-to-end tests on the adoption's baseline).
- The unit coverage report covers `assets/js/env.js` only, and the end-to-end report only the site bundle's
  `assets/js/` sources: neither covers `assets/iconostat/`.
