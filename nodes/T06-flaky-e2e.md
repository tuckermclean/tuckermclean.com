# T06 — flaky-e2e

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| now | T01, I02, F01, F02, F03, F04, F05, F06, S02 | none | L |

**Owns:** no path of its own. It changes files its deps own: the end-to-end test files below (S02, F01, F04, F05,
F06), T01's `tests/e2e/fixtures.js`, `tests/e2e/helpers.js`, `playwright.config.js` and `package.json` within
T06-AC-3's limits, and the site code where a race lies (I02's `assets/iconostat/`, F01's
`assets/iconostat/fx/controller.js` and `tier1.js`, F02's `snapshot.js`, F03's `compositor.js`, F04's `genie.js`,
F05's `wobble.js`, S02's `assets/js/window.js`), and it removes the genie test's entry from `gate.known_red` in
`docs/graph.yaml`.

**Resolves:** #15

## Purpose

CI's end-to-end step has flaky tests on almost every run, and the owner wants none: the tests are fixed, not
re-run or listed as known red. `SPEC.md` §3 and D6 left them for a later node; this is that node. It changes no
criterion of the imported nodes whose tests these are: each test keeps checking what it checks now.

The failures are not intermittent: CI reproduces them on nearly every run. The owner read the job logs of every
`tests` run that still had one, 30 runs from 2026-11-21 to the runs on this node's spec PR (PR #16) at a3e7ba8.
Not one had zero flaky tests. On the first attempt:

- `[desktop] › tests/e2e/boot.spec.js:51:5` (back/forward without dropping a window, S02-AC-22) failed in 30 of
  30 runs, and `[desktop] › tests/e2e/fx-tier2-genie.spec.js:235:7 › Tier 2 genie (forced, no-preference) ›
  context-loss mid-genie-minimize leaves the window visible (finally-invariant holds even with GL gone)` (the test
  of F04-AC-11, which it does not pin) also failed in 30 of 30. The genie test's retry failed too in 6 of the 30,
  and it is listed in `gate.known_red` (`SPEC.md` D6).
- `tests/e2e/fx-cancellation-matrix.spec.js:542:7` (Tier-1 minimize x `tile()`, F06-AC-8) failed in 28 of 30, and
  `tests/e2e/fx-tier1.spec.js:202:7` (a `cascade()` during a Tier-1 minimize, F01-AC-21) in 27 of 30.
- `tests/e2e/boot.spec.js:73:5` (a resize->cascade does not corrupt history, I02-AC-32) failed in 27 of 30.
- `tests/e2e/fx-context-loss-integration.spec.js:34:3` (a context loss during a genie minimize and a wobble drag,
  F06-AC-10) failed in 4, among them push run 45308393178 on PR #13's head and push run 45477622169 on PR #16's
  a707b83.
- `tests/e2e/fx-tier1.spec.js:258:7` (a viewport resize during a Tier-1 minimize jump-cuts by completing it,
  F01-AC-22) failed in 1 of 30, push run 45485108434 on PR #16's a3e7ba8: `expect(w).toHaveClass(/minimized/)`
  (line 270) received `window front` for its 2 s after `setViewportSize()`.
- `tests/e2e/fx-tier2-wobble.spec.js:117:3` (a quick, small drag, F05's) failed in 1, run 45251484637.

Every other retry passed, so the runs that passed did so only because of CI's one retry: push run 45308393178,
which passed, had 5 flaky tests. What the failures look like, from PR #13's pull-request run
45308400320 (job 138157752694):

- The genie test's first attempt found no `#iconostat-fx-canvas` when it went to lose the context
  (`expect(lost.hasCanvas).toBe(true)`, line 253); its retry found the window already `minimized` right after the
  click, where it expects the effect in flight (`not.toHaveClass(/minimized/)`, line 241).
- `boot.spec.js:51` and `:73` both timed out at their first `goBack()`: `#window-resume` never got `front` (lines
  63 and 80).
- `fx-cancellation-matrix.spec.js:542` found `minimize` still in the controller's registry right after `tile()`
  returned (line 557).
- `fx-tier1.spec.js:202` ran out its 30 s at its second minimize click (line 229): the minimize button was not
  stable, then not visible.

CI runs one worker (T01-AC-13), so the failures come from timing on CI's runner, not from tests running side by
side.

Two leads from the owner, not diagnoses:

- **A gap in the controller.** A user-gesture minimize calls `preventDefault()` and then `_runEffect()`, which
  awaits `this._loadTier1()` (a lazy `import()`) before `tier1.run()` registers the effect. A `cascade()` or
  `tile()` in that gap finds `_inFlight` empty in `_onBeforeMinMax()` and cancels nothing, and the minimize then
  starts after the bulk layout. That fits `minimize` still registered after `tile()` (line 557), the minimize
  button not stable, then not visible after a `cascade()` (line 229), and, on the Tier 2 path, the genie test's
  missing canvas, and a resize in that gap finds nothing to jump-cut, which fits the window not yet `minimized`
  2 s after `setViewportSize()` (`fx-tier1.spec.js:258`, line 270). A user can hit that gap on a first minimize.
- **The two boot tests.** `boot.spec.js:35` waits for `#/intro` in the URL before its `goBack()` and never fails.
  `:51` and `:73` go straight from the window count to `goBack()`, and both fail at that first `goBack()`;
  `openViaMenu()` does not wait for the URL.

## Tests

- The node adds no test file. It relies on, and may change, the seven tests of T06-AC-1 in `boot.spec.js` (S02),
  `fx-tier1.spec.js` (F01), `fx-tier2-genie.spec.js` (F04), `fx-cancellation-matrix.spec.js` and
  `fx-context-loss-integration.spec.js` (F06), all under `tests/e2e/`, and the rest of the end-to-end suite
  (`tests/e2e/`, `tests/mobile/`), `fx-tier2-wobble.spec.js:117` (F05) among them. It may add test cases to those
  files.
- **Where diagnosis starts.** Under CI the first attempt records no trace; only the retry does
  (`trace: 'on-first-retry'`, T01-AC-13), and the trace makes the retry slower. So the `playwright-report`
  artifacts hold traces of retries that passed, not of the failing first attempts. The node starts from what
  differs between the first attempt and the retry. The artifacts of the runs on `main` expire between 2026-11-28
  and 2026-12-01: the node downloads those still there first. A trace of a failing first attempt needs
  `--trace on`, locally or in a temporary commit on the node branch (in T01's `playwright.config.js` or
  `package.json`, reverted before the final head); the record notes that tracing may itself hide the failure. CI
  on the node branch is a ready reproducer: every push runs `tests`, in about 3 minutes.
- **A loaded run** is a Playwright run with `CI=true`, `--retries=0` and `--workers=1` (as in CI) under one of
  these loads, recorded with the machine's CPU count and the exact commands: Chromium's CPU throttling at rate 4
  (CDP `Emulation.setCPUThrottlingRate`) on every page, or a CPU hog on every core (one busy process per core
  `nproc` reports). A fixture that applies the throttling only when an environment variable is set may stay in
  `tests/e2e/fixtures.js`; its lines are listed under T06-AC-3. More workers than CPUs adds contention on the
  one `hugo server` that CI never has (see the comment in `playwright.config.js`), so it may only be added on top of
  one of the two loads. T06-AC-2 and T06-AC-5 use the same load.
- **A forced run** makes a race happen on every run instead of under load: for example a test case that holds
  back `assets/iconostat/fx/tier1.js` with `page.route` and calls `cascade()` while it is held.
- **How a fix gets through the roles.** Only the tester writes under `tests/`, and the implementer never does.
  - A race in the site's code: a new tester adds a case that forces the race (a forced run) as a `test(T06): …`
    RED commit, which fails before the fix on every run; a new implementer fixes the site's code. The races that
    cannot be forced share one `test(T06): …` RED commit that adds the throttling fixture (a loaded run): its
    `TDD-Red-Target:` is the red target's command for those tests with the fixture's environment variable set,
    and the PR says why each race could not be forced. A race of that kind found once the fixture is in gets a
    RED commit that adds a case repeating the test's steps with the throttling switched on in the case.
  - A test's waiting (T06-AC-4 says when that is the cause): a new tester changes the test's waiting as a
    `wait(T06): <what the test now waits for>` commit that touches only test paths. It makes a failing test
    pass, so it is not a RED commit, and its subject is not `test(T06): …`. The orchestrator, not the tester,
    records its red half, a run in which the unchanged test fails at the commit's parent (a forced run, a loaded
    run or a CI run on the node branch), and its green half, the same run at the commit, passing, with the
    command or run URL and output of both kept as `out/node/T06/red-<n>.log`. The commit carries one
    `Red-Run: <test>: <run URL or log path>` trailer per test it changes. No implementer is dispatched for it, and
    the reviewer checks it against T06-AC-3 and T06-AC-4. A change to a frozen line in such a commit is not asked
    about at step 7 of the node skill; the owner approves all of them on the node's PR, as T06-AC-3 says. Lines
    that are only added count as 0 frozen lines and need no approval.
  - When no RED commit adds the throttling fixture, a tester adds it in a `wait(T06): add the throttling
    fixture` commit of its own, which changes no test case and carries no `Red-Run:` trailer.
- Red target: `CI=true npx playwright test tests/e2e/boot.spec.js:51 tests/e2e/boot.spec.js:73
  tests/e2e/fx-cancellation-matrix.spec.js:542 tests/e2e/fx-tier1.spec.js:202 tests/e2e/fx-tier1.spec.js:258
  tests/e2e/fx-tier2-genie.spec.js:235 tests/e2e/fx-context-loss-integration.spec.js:34 --repeat-each=20 --retries=0 --workers=1` under the recorded
  load (with the lines as they are after the change), plus each forced case: non-zero before the change and 0
  after.

## Changes

1. Download the `playwright-report` artifacts still available, then diagnose each of the seven tests from them, the
   CI logs, first-attempt traces, CI runs on the node branch and loaded or forced local runs, and record the cause
   in the PR. *T06-AC-1.*
2. Fix each cause where it lies: the test's waiting (what it waits for before it acts or asserts) when the state
   the old test reached is one a user ends in correctly, otherwise the site's code, through the roles as the Tests
   section says. *T06-AC-2, T06-AC-3, T06-AC-4.*
3. Remove the genie test's entry from `gate.known_red` in `docs/graph.yaml`. *T06-AC-7.*
4. Run the whole end-to-end suite ten times loaded and record it. *T06-AC-5.*
5. Record every `tests` run on the node branch from the last fix on. *T06-AC-6.*

## Gate

- **T06-AC-1** — For each of the seven tests (`tests/e2e/fx-tier2-genie.spec.js:235`, `tests/e2e/boot.spec.js:51`, `tests/e2e/boot.spec.js:73`, `tests/e2e/fx-cancellation-matrix.spec.js:542`, `tests/e2e/fx-tier1.spec.js:202`, `tests/e2e/fx-tier1.spec.js:258`, `tests/e2e/fx-context-loss-integration.spec.js:34`), the node's PR records the cause of its first-attempt failure: the failing assertion in CI, what a trace of a failing first attempt, the CI log or a loaded or forced run shows happening at that point, and whether the cause is the test's waiting or a race in the site's code; and a failing run of that test before its fix (a CI run on the node branch, or a loaded or forced local run, with its command or URL and output) as the fix's red half. A test that failed in CI has no "not reproduced" way out. Any other end-to-end test that fails a first attempt in a run the node records (CI, loaded or forced) gets the same record and the same rules (T06-AC-4) before it is fixed. *Verify:* the record in the node's PR, with the commands, the run URLs and their output.
- **T06-AC-2** — Each of the seven tests passes 20 repeats under the recorded load with no retry, and each forced case passes. *Verify:* `CI=true npx playwright test tests/e2e/boot.spec.js:51 tests/e2e/boot.spec.js:73 tests/e2e/fx-cancellation-matrix.spec.js:542 tests/e2e/fx-tier1.spec.js:202 tests/e2e/fx-tier1.spec.js:258 tests/e2e/fx-tier2-genie.spec.js:235 tests/e2e/fx-context-loss-integration.spec.js:34 --repeat-each=20 --retries=0 --workers=1` under the recorded load (each test at its line after the change), plus the forced cases, exit 0, the commands and their summaries recorded in the node's PR.
- **T06-AC-3** — Each end-to-end test still checks what it checked before the change. No assertion is removed, none of its expected values or patterns is widened, and none is made conditional. None of these is added or used as the fix: a fixed wait (`waitForTimeout`, or a sleep such as a `setTimeout` promise inside `page.evaluate`), an assertion timeout above the configured 10 s, `test.slow()`, `test.setTimeout()`, `test.skip`, `test.fixme`, `test.fail` or a per-test retry. `playwright.config.js` keeps its `retries`, `workers`, `trace`, `timeout`, `expect.timeout`, `actionTimeout` and `navigationTimeout` as they are on `main`. The genie test still loses the WebGL2 context while the minimize is in flight. The PR lists every line the change adds to, modifies in or removes from a test, fixture or the Playwright config, each with the cause from T06-AC-1 it removes; every frozen test line it modifies or removes needs the owner's approval. *Verify:* `git diff origin/main...HEAD -- tests/e2e/ tests/mobile/ playwright.config.js package.json`, read against this list in the node's final review, with its `Frozen test lines changed:` line and, when that count is not 0, the owner's `Frozen lines approved at <head>` comment.
- **T06-AC-4** — A cause is the test's waiting only when T06-AC-1's record shows that the state the old test reached when it failed is not a wrong end state a user can reach. Otherwise it is a race in the site's code and is fixed there, and the window still ends in the state `SPEC.md` principle 4 and the test's criterion (S02-AC-22, I02-AC-32, F01-AC-21, F01-AC-22, F06-AC-8, F06-AC-10, F04-AC-11) require. *Verify:* the seven tests in T06-AC-2's command and the forced cases; for each test-side fix, the record of the state the old test reached; for each site-code change, the cause in T06-AC-1's record that it removes; when no cause is in the site's code, the record says so.
- **T06-AC-5** — The whole end-to-end suite, both projects, passes ten consecutive loaded runs with no retry. *Verify:* `CI=true npx playwright test --retries=0 --workers=1` plus the recorded load, run ten times in a row, each exit 0, with each run's summary (passed, skipped, failed, flaky counts) recorded in the node's PR.
- **T06-AC-6** — Every `tests` run on the node branch from the commit that holds the node's last change to a test, the Playwright config or the site's code on (at least four runs, the push and pull-request runs on the PR's final head among them) has an end-to-end step that reports 0 failed and 0 flaky tests, with `tests/e2e/fx-tier2-genie.spec.js`'s context-loss test reported as passed, not skipped. CI keeps its one retry (`fail_pattern` reads the `(retry #1)` line, `SPEC.md` D3): no retry needed means a flaky count of 0. A green run cannot be re-run through the forge, so further runs come from further pushes (an empty commit counts). *Verify:* every such run's URL and its end-to-end step's summary counts, recorded in the node's PR.
- **T06-AC-7** — `gate.known_red` in `docs/graph.yaml` no longer lists the genie context-loss test, and lists no other end-to-end test. *Verify:* `docs/graph.yaml` at the node's PR head, and T06-AC-6's runs, which pass without it.

## Risks

- The cause of each failure is not known yet; the Gate fixes the outcome and the diagnosis, not the fix. A fix
  that only makes a test wait until the effect is registered before calling `tile()` or `cascade()` would make it
  pass and leave the controller's gap (Purpose) for users; T06-AC-4 sends such a cause to the site's code.
- These tests pin criteria of imported nodes (S02-AC-22, F01-AC-21, F01-AC-22, F06-AC-8, F06-AC-10) and their lines are
  frozen. Changing them needs the owner's approval on the node's PR, listing each line with the cause it removes
  (T06-AC-3). If a fix moves a test, the line numbers in those criteria's *Verify* go stale; correcting a *Verify*
  line is a small amendment in the node's PR. F04-AC-11 and I02-AC-32 stay unpinned unless the fix makes a test
  pin them.
- A trace or a debugger slows the page and may hide the failure it is meant to show; the record says which runs
  had tracing on.
- A cause can lie in a file no dep of this node owns, for example T02's `.github/workflows/test.yml`. The node then
  stops and asks the owner, and a spec PR adds the dep. The same holds for T05's `tests/e2e/not-found.spec.js`:
  T05 is built first, and T06 does not depend on it, so if that test turns out flaky the node stops and asks.
- Loaded runs can make other timing-sensitive tests fail, such as `tests/e2e/fx-perf-budget.spec.js`, whose
  genie minimize must finish in under 3 s, or `fx-tier2-wobble.spec.js:117`. Those are flaky tests too and the same
  rules apply (T06-AC-1, T06-AC-4); a fix that would loosen what such a test checks (raising that bound, say) needs the owner's
  approval, asked in the PR.
- The genie test skips itself when the browser has no `WEBGL_lose_context`. A fix that makes it skip in CI would
  hide the failure, so T06-AC-6 requires it reported as passed.
- `SPEC.md` §3 ("Known flaky end-to-end tests") and D6 describe the flakes and the `known_red` entry. After this
  node merges they are stale; correcting them is a spec PR, not this node's.
- The `playwright-report` artifacts of the runs on `main` expire between 2026-11-28 and 2026-12-01, likely before
  the node starts; T06-AC-1 then rests on the logs and new runs, which CI on the node branch gives in minutes.
