# T06 — flaky-e2e

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| now | T01, I02, F01, F03, F04, F06, S02 | none | L |

**Owns:** no path of its own. It changes files its deps own: the four test files below (S02, F01, F06, F04),
T01's `tests/e2e/fixtures.js`, `tests/e2e/helpers.js` and `playwright.config.js` when the waiting belongs there,
and the site code where a race lies (I02's `assets/iconostat/`, F01's `assets/iconostat/fx/controller.js` and
`tier1.js`, F03's `compositor.js`, F04's `genie.js`, S02's `assets/js/window.js`), and it removes the genie test's
entry from `gate.known_red` in `docs/graph.yaml`.

**Resolves:** #15

## Purpose

CI's end-to-end step is flaky, and the owner wants no flaky runs: the tests are fixed, not re-run or listed as
known red. `SPEC.md` §3 and D6 left them for a later node; this is that node. It changes no criterion of the
imported nodes whose tests these are: each test keeps checking what it checks now.

The most recent failure is the `tests` run for PR #13's head 8908342, run 45308400320 (job 138157752694), which
failed while the push run on the same commit, 45308393178, passed. In it:

- `[desktop] › tests/e2e/fx-tier2-genie.spec.js:235:7 › Tier 2 genie (forced, no-preference) › context-loss
  mid-genie-minimize leaves the window visible (finally-invariant holds even with GL gone)` failed both attempts.
  The first found no `#iconostat-fx-canvas` when it went to lose the context (`expect(lost.hasCanvas).toBe(true)`,
  line 253); the retry found the window already `minimized` right after the click, where it expects the effect
  in flight (`not.toHaveClass(/minimized/)`, line 241). It is listed in `gate.known_red` (`SPEC.md` D6). It is
  the test of F04-AC-11, which it does not pin.
- `tests/e2e/boot.spec.js:51:5` (back/forward without dropping a window, S02-AC-22) and `tests/e2e/boot.spec.js:73:5`
  (a resize->cascade does not corrupt history) both timed out at their first `goBack()`: `#window-resume` never
  got `front` (lines 63 and 80). Both passed on retry.
- `tests/e2e/fx-cancellation-matrix.spec.js:542:7` (Tier-1 minimize x `tile()`, F06-AC-8) found `minimize` still
  in the controller's registry right after `tile()` returned (line 557). It passed on retry.
- `tests/e2e/fx-tier1.spec.js:202:7` (a `cascade()` during a Tier-1 minimize, F01-AC-21) ran out its 30 s at its
  second minimize click (line 229): the minimize button was not stable, then not visible. It passed on retry.

The same tests failed on the adoption PR (run 44940550691), and the `tests` workflow failed four times on
2026-08-12 (`SPEC.md` §3). CI runs one worker (T01-AC-13), so the failures come from timing on CI's runner, not
from tests running side by side.

## Tests

- The node adds no test file. It relies on, and may change, the five tests above in
  `tests/e2e/fx-tier2-genie.spec.js` (F04), `tests/e2e/boot.spec.js` (S02), `tests/e2e/fx-cancellation-matrix.spec.js`
  (F06) and `tests/e2e/fx-tier1.spec.js` (F01), and the rest of the end-to-end suite (`tests/e2e/`,
  `tests/mobile/`).
- **A loaded run** is a Playwright run with `CI=true` and `--retries=0` under a CPU load heavier than CI's, chosen
  by the node and recorded with the machine's CPU count and the exact commands: for example `--workers` above the
  machine's CPU count, Chromium's CPU throttling, or a CPU hog running alongside. T06-AC-1, T06-AC-2 and T06-AC-5
  use the same load.
- Red target: `CI=true npx playwright test tests/e2e/boot.spec.js:51 tests/e2e/boot.spec.js:73
  tests/e2e/fx-cancellation-matrix.spec.js:542 tests/e2e/fx-tier1.spec.js:202 tests/e2e/fx-tier2-genie.spec.js:235
  --repeat-each=20 --retries=0`, run under the recorded load (with the lines as they are after the change):
  non-zero before the change, where the load reproduces a failure, and 0 after. When no load reproduces a failure
  before the change, T06-AC-1's not-reproduced record stands in for the red half.

## Changes

1. Diagnose each of the five tests from the CI logs and the `playwright-report` traces of the failed runs that
   still have them, and from loaded local runs, and record the cause in the PR. *T06-AC-1.*
2. Fix each cause where it lies: the test's waiting (what it waits for before it acts or asserts) or the site's
   code, when it is a race there. *T06-AC-2, T06-AC-3, T06-AC-4.*
3. Remove the genie test's entry from `gate.known_red` in `docs/graph.yaml`. *T06-AC-7.*
4. Run the whole end-to-end suite ten times loaded and record it. *T06-AC-5.*
5. Record the CI runs on the PR's final head. *T06-AC-6.*

## Gate

- **T06-AC-1** — For each of the five tests (`tests/e2e/fx-tier2-genie.spec.js:235`, `tests/e2e/boot.spec.js:51`, `tests/e2e/boot.spec.js:73`, `tests/e2e/fx-cancellation-matrix.spec.js:542`, `tests/e2e/fx-tier1.spec.js:202`), the node's PR records the cause of its failure: the failing assertion in CI (run 45308400320 and the earlier runs `SPEC.md` §3 names, as far as their logs and traces are still available), what a trace, the CI log or a loaded run shows happening at that point, and whether the cause is in the test's waiting or a race in the site's code, with the loaded run that reproduced it. Or, for a test whose failure no log, trace or loaded run reproduces, at least 20 loaded runs of that test with no failure, recorded, and that its failure was not reproduced. *Verify:* the record in the node's PR, with the commands and their output.
- **T06-AC-2** — Each of the five tests passes 20 repeats under the recorded load with no retry. *Verify:* `CI=true npx playwright test tests/e2e/boot.spec.js:51 tests/e2e/boot.spec.js:73 tests/e2e/fx-cancellation-matrix.spec.js:542 tests/e2e/fx-tier1.spec.js:202 tests/e2e/fx-tier2-genie.spec.js:235 --repeat-each=20 --retries=0` under the recorded load (each test at its line after the change), exit 0, the command and its summary recorded in the node's PR.
- **T06-AC-3** — Each of the five tests still checks what it checked before the change: no assertion is removed, none of its expected values or patterns is widened, none is made conditional, no fixed wait (`waitForTimeout`) is added as the fix, no assertion's timeout goes above the configured 10 s, and no `test.skip`, `test.fixme`, `test.fail` or per-test retry is added; the genie test still loses the WebGL2 context while the minimize is in flight. Every frozen test line the change modifies or removes is listed in the PR, with the owner's approval on it. *Verify:* `git diff origin/main...HEAD -- tests/e2e/ tests/mobile/ playwright.config.js`, read against this list in the node's final review, with its `Frozen test lines changed:` line and, when that count is not 0, the owner's `Frozen lines approved at <head>` comment.
- **T06-AC-4** — A cause that is a race in the site's code is fixed in the site's code, and the window still ends in the state `SPEC.md` principle 4 and the test's criterion (S02-AC-22, F01-AC-21, F06-AC-8, F04-AC-11) require. *Verify:* the five tests in T06-AC-2's command, and for each site-code change the cause in T06-AC-1's record that it removes; when no cause is in the site's code, the record says so.
- **T06-AC-5** — The whole end-to-end suite, both projects, passes ten consecutive loaded runs with no retry. *Verify:* `CI=true npx playwright test --retries=0` plus the recorded load, run ten times in a row, each exit 0, with each run's summary (passed, skipped, failed, flaky counts) recorded in the node's PR.
- **T06-AC-6** — On the node's PR's final head commit, at least four `tests` runs (the push run, the pull-request run and one re-run of each) pass with the end-to-end step reporting no failed and no flaky test, and `tests/e2e/fx-tier2-genie.spec.js`'s context-loss test reported as passed, not skipped. *Verify:* the run URLs and each end-to-end step's summary counts, recorded in the node's PR.
- **T06-AC-7** — `gate.known_red` in `docs/graph.yaml` no longer lists the genie context-loss test, and lists no other end-to-end test. *Verify:* `docs/graph.yaml` at the node's PR head, and T06-AC-6's runs, which pass without it.

## Risks

- The cause of each failure is not known yet; the Gate fixes the outcome and the diagnosis, not the fix. The
  failures seen so far point both ways: several tests read "the effect is in flight" (`not.toHaveClass(/minimized/)`)
  right after the click, which a fast or a slow turn can miss, while the Tier-1 cascade test found its window's
  minimize button not visible for 30 s after the `cascade()`, which may be a window left hidden, against
  `SPEC.md` principle 4.
- These tests pin criteria of imported nodes (S02-AC-22, F01-AC-21, F06-AC-8) and their lines are frozen. Changing
  them needs the owner's approval on the node's PR, listing the lines (T06-AC-3). If a fix moves a test, the line
  numbers in those criteria's *Verify* go stale; correcting a *Verify* line is a small amendment in the node's PR.
  F04-AC-11 stays unpinned unless the fix makes the genie test pin it.
- A cause can lie in a file no dep of this node owns, for example F02's `assets/iconostat/fx/snapshot.js`, F05's
  `wobble.js` or T02's `.github/workflows/test.yml`. The node then stops and asks the owner, and a spec PR adds the
  dep.
- Loaded runs can make other timing-sensitive tests fail, such as `tests/e2e/fx-perf-budget.spec.js`, whose
  genie minimize must finish in under 3 s. Those are flaky tests too and the same rules apply; a fix that would
  loosen what such a test checks (raising that bound, say) needs the owner's approval, asked in the PR. The load
  is the node's choice, and a load far beyond any CI runner's is not needed.
- The genie test skips itself when the browser has no `WEBGL_lose_context`. A fix that makes it skip in CI would
  hide the failure, so T06-AC-6 requires it reported as passed.
- `SPEC.md` §3 ("Known flaky end-to-end tests") and D6 describe the flakes and the `known_red` entry. After this
  node merges they are stale; correcting them is a spec PR, not this node's.
- The `playwright-report` artifacts of older runs may have expired; T06-AC-1 then rests on the logs and loaded
  runs.
