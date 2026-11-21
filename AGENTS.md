# AGENTS.md

## Building a node

- **Building.** Build a node with `/noodlebot:node <ID>`.
- **Authority order.** `SPEC.md`, then `docs/graph.yaml`, then the node spec `nodes/<ID>-<name>.md`, then this
  file. When two disagree, the earlier one wins and the later one is fixed by a spec PR.
- **Roles.** The plugin's tester writes the failing tests, the implementer makes them pass, the reviewer judges
  the result. This repository has no role agents of its own.
- **Role guard.** `.noodlebot/roles.yaml` lists the test paths: the guard's defaults (they cover `tests/`) plus
  the Iconostat fixture page (`assets/iconostat-fixture/`, `content/iconostat-fixture.md`,
  `layouts/_default/iconostat-fixture.html`), which only the end-to-end tests use. The test configs
  (`vitest.config.js`, `playwright.config.js`, `coverage.config.js`) are implementation files.
- **Spec checkers.** `python3 -I <plugin dir>/skills/node/check-regime.py` and
  `python3 -I <plugin dir>/skills/node/check-coverage.py`, run from the repository root, must both print
  `PROBLEMS 0` before a spec PR is opened.
- **Setup.** `npm ci`, then `npx playwright install chromium` (CI adds `--with-deps` for the system packages).
  Hugo for the tests comes from the `hugo-bin` package; no other install is needed.
- **The gate command** (`gate.command` in `docs/graph.yaml`), the whole suite, as CI runs it on the PR:
  `npm run test:unit:cov; u=$?; npm run test:e2e; e=$?; exit $((u|e))`. Both steps always run. Run it with
  `CI=true` (CI sets it): Playwright then retries a failing test once, starts its own `hugo server` and rejects
  `test.only`. The gate's evidence is CI's run of `.github/workflows/test.yml` on the PR; a local run of the
  whole suite is not required.
- **The quick gate**, which a session runs locally instead: the red targets and the test files of what the
  change touches, through the gate's own runners, with `CI=true`:
  `CI=true npx vitest run <unit test files>; u=$?; CI=true npx playwright test <e2e or mobile spec files>; e=$?;
  exit $((u|e))`. Leave out the runner that has no file to run (with no file, either runner runs its whole
  suite). Both print the same lines as the gate command, so `fail_pattern` reads them.
- **Reading failures.** `fail_pattern` matches vitest's `FAIL  tests/<file> > <suite> > <test>` lines (and a
  `FAIL  tests/<file>` line for a file that fails to load) and Playwright's list line for a test that failed its
  retry, `✘  <n> [desktop|mobile] › tests/<file>:<line>:<col> › <title> (retry #1)`. A test that fails once and
  passes on retry is flaky: Playwright exits 0 and the line is not matched. Vitest colours its output even with
  `CI=true`, and a fetched CI job log starts every line with a timestamp (`^\S+Z `): `fail_pattern` matches once
  the colour codes (`\x1b\[[0-9;]*m`) and the timestamp prefix are stripped.
- **known_red.** Each entry is a failing test's name as its failure line prints it: for vitest
  `tests/<file> > <suite> > <test>`, for Playwright `[<project>] › tests/<file>:<line>:<col> › <title>`. A listed
  failure stays until a node fixes it; that node removes the entry in the same PR. A node that moves a listed
  Playwright test updates its `<line>:<col>`. A failure not listed fails the gate.
- **Ownership.** A node changes only the files it owns (`owns` in `docs/graph.yaml`) and the files of its direct
  `deps`.
- **Red target.** A command that exits non-zero before the node's change and 0 after, normally
  `CI=true npx vitest run tests/unit/<file>.test.js` or `CI=true npx playwright test tests/e2e/<file>.spec.js`
  for the node's own test file (the node spec's Tests section names it).
- **Tests and fixtures.** Unit tests: `tests/unit/**/*.test.js` (vitest, jsdom); `tests/unit/stubs/` holds test
  stubs. End-to-end tests: `tests/e2e/*.spec.js` (Playwright project `desktop`) and `tests/mobile/*.spec.js`
  (project `mobile`), with shared code in `tests/e2e/fixtures.js` and `tests/e2e/helpers.js` and the coverage
  hooks `tests/e2e/coverage-setup.js` and `tests/e2e/coverage-teardown.js`. Playwright forces reduced motion
  (FX Tier 0) by default; a test that needs effects opts in with `test.use({ reducedMotion: 'no-preference' })`.
  End-to-end tests assert what is observable in the DOM and the URL.
- **Other commands.** `npm run build` (`hugo --minify`, needs a Hugo on the path; CI's deploy uses the pinned
  Hugo extended), `npm run dev` (`hugo server --buildDrafts --disableFastRender`). There is no linter.
- **Spec files:** `SPEC.md`, `docs/graph.yaml`, `nodes/` (a trailing slash marks a folder); spec PRs change only these.
- **Porting rules.** None.
- **Constraints.** No framework and no runtime dependency; `assets/iconostat/` never imports from the site; effects
  degrade and never strand a window; nodes never change the owner's words in pages and posts (see `SPEC.md`).
- **CI evidence.** In the node's PR, record the `tests` workflow run on the PR's head commit (its unit and
  end-to-end steps and their counts), each failing line with the `known_red` entry it matched, and the red
  target's output before and after.
