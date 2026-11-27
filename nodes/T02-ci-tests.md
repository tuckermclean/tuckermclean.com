# T02 — ci-tests

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| done | T01 | T07 | S |

**Owns:** `.github/workflows/test.yml`

## Purpose

The `tests` workflow: CI's run of the unit and end-to-end suites on every push and pull request, which is the
gate's evidence for a node PR (`SPEC.md` §7). It runs the `package.json` scripts of T01.

## Tests

No test covers the workflow; it runs only on the forge. Its run on a PR is read with `gate.fail_pattern`.

## Changes

none: imported

## Gate

- **T02-AC-1** — The workflow `tests` runs on every push and every pull request, as one job `test` on `ubuntu-latest` with Node 22 and npm's cache. *Verify:* unpinned: runs only on the forge.
- **T02-AC-2** — The job installs with `npm ci` and `npx playwright install --with-deps chromium`. *Verify:* unpinned: runs only on the forge.
- **T02-AC-3** — The job runs `npm run test:unit:cov`, then `npm run test:e2e`, as two steps; the end-to-end step has no `if: always()`, so it is skipped when the unit step fails. *Verify:* unpinned: runs only on the forge.
- **T02-AC-4** — When a step fails, the job uploads `playwright-report/` as the artifact `playwright-report`; it always uploads `coverage/` as the artifact `coverage`; both are kept 7 days. *Verify:* unpinned: runs only on the forge.

## Risks

- A failing unit step, including one in `gate.known_red`, leaves the run without an end-to-end result (`SPEC.md`
  D7). Adding `if: always()` to the end-to-end step is the change D7 names.
- The `playwright-report` artifact is uploaded only on failure: a run whose tests passed only on retry (flaky)
  keeps no report.
- The workflow's actions are pinned to major versions (`actions/checkout@v4`, `actions/setup-node@v4`,
  `actions/upload-artifact@v4`), not to commits.
