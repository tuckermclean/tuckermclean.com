# T07 — pin-actions

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| now | T01, T02, T03, T05 | none | S |

**Owns:** `tests/unit/workflow-pins.test.js`

**Resolves:** #18

## Purpose

Every `uses:` in the two workflows names a tag: `actions/checkout@v4`, `actions/setup-node@v4`,
`actions/upload-artifact@v4` and `@v7.0.1`, `anchore/sbom-action@v0.24.0`, `actions/attest-build-provenance@v4.1.1`
and `cloudflare/wrangler-action@v3`. Whoever controls an action's repository can move its tag to other code. This
matters most in the deploy job: `cloudflare/wrangler-action` receives `CLOUDFLARE_API_TOKEN` (Workers edit rights on
the account), and the job holds `id-token: write` and `attestations: write`, so a moved tag could take the token or
attest a build it changed. The same reasoning is behind the pinned, checksum-verified Hugo (`SPEC.md` principle 2).

The node pins each action to the full commit SHA its tag points to, with the version as a trailing comment
(`uses: cloudflare/wrangler-action@<40-hex SHA> # v3.<minor>.<patch>`), and adds a unit test that fails when any
`uses:` in `.github/workflows/` is not pinned that way. It also sets `persist-credentials: false` on every
`actions/checkout` step: no later step in either workflow pushes, so the job token has no reason to stay in
`.git/config`.

It changes T02's `.github/workflows/test.yml`, T03's `.github/workflows/deploy-to-s3.yml` and T05's
`tests/unit/deploy-config.test.js`. Some of T05's tests find the deploy step by `cloudflare/wrangler-action@v3` and
the Node step by `actions/setup-node@v<n>`, so they fail on the pinned form. Those lines are frozen since T05 was
merged: the node lists them in its PR and changes them only once the owner approves there. T05-AC-2's
`cloudflare/wrangler-action@v3` gives way to T07-AC-1's pinned form of the same action. Everything else in T05-AC-2
stays as it is.

## Tests

- `tests/unit/workflow-pins.test.js` (new, vitest, `// @vitest-environment node`): reads every `.yml` and `.yaml`
  file in `.github/workflows/` as text. It checks each `uses:` line (T07-AC-1, T07-AC-3) and each
  `actions/checkout` step (T07-AC-5). Its own cases run the checker on sample lines (T07-AC-3).
- `tests/unit/deploy-config.test.js` (T05's): the step-finding patterns of T05-AC-2 and T05-AC-3 take the pinned
  form (T07-AC-4). Its T03 tests already find `anchore/sbom-action@`, `actions/upload-artifact@` and
  `actions/attest-build-provenance@` with any ref, and stay as they are.
- Red target: `CI=true npx vitest run tests/unit/workflow-pins.test.js`. It fails before the change (every `uses:`
  names a tag and no checkout step sets `persist-credentials`) and passes after.

## Changes

1. Look up the commit of each action's tag as named now, dereferencing an annotated tag to its commit, and record
   the lookups. *T07-AC-2.*
2. In `.github/workflows/test.yml` and `.github/workflows/deploy-to-s3.yml`, replace each `uses:` ref with its full
   commit SHA and a trailing `# <version>` comment. *T07-AC-1.*
3. Add `persist-credentials: false` to the `with:` of every `actions/checkout` step in both workflows. *T07-AC-5.*
4. Add `tests/unit/workflow-pins.test.js`. *T07-AC-1, T07-AC-3, T07-AC-5.*
5. In `tests/unit/deploy-config.test.js`, change the patterns that find the deploy step and the Node step to the
   pinned form, once the owner has approved the frozen lines on the PR. *T07-AC-4.*
6. Record the `tests` run on the PR's head commit, which runs `test.yml` with the pinned actions. *T07-AC-6.*

## Gate

- **T07-AC-1** — Every `uses:` in `.github/workflows/test.yml` and `.github/workflows/deploy-to-s3.yml` names `<owner>/<repo>@<sha>`, where `<sha>` is a full 40-character lowercase hexadecimal commit SHA. A trailing comment on the same line names the version (`# v4`, `# v4.2.2`). The workflows use the same actions as before, and each stays on the major version it named before: `actions/checkout` v4, `actions/setup-node` v4, `actions/upload-artifact` v4 in `test.yml` and v7 in the deploy workflow, `anchore/sbom-action` v0, `actions/attest-build-provenance` v4 and `cloudflare/wrangler-action` v3. *Verify:* `CI=true npx vitest run tests/unit/workflow-pins.test.js`.
- **T07-AC-2** — Each pinned SHA is the commit that the action's tag named before the change (`v4`, `v7.0.1`, `v0.24.0`, `v4.1.1`, `v3`) pointed to when the node was built, with an annotated tag dereferenced to its commit, not the tag object's SHA. The comment names that tag or a more exact release tag (`vX.Y.Z`) that points to the same commit. *Verify:* for each action, the output of `git ls-remote https://github.com/<owner>/<repo> 'refs/tags/<tag>' 'refs/tags/<tag>^{}'` for the named tag and, when the comment names another tag, for that tag too, recorded in the node's PR, with the `uses:` line each lookup gives.
- **T07-AC-3** — `tests/unit/workflow-pins.test.js` reads every `.yml` and `.yaml` file in `.github/workflows/` and fails, naming the file and the line, for any `uses:` whose ref is not a full 40-character hexadecimal SHA, or that has no trailing version comment. Its own cases run the same check on sample lines: it rejects a major tag (`actions/checkout@v4`), an exact tag (`anchore/sbom-action@v0.24.0`), a branch (`@main`), a short SHA (7 characters) and a full SHA with no comment, and accepts a full SHA with a `# v<version>` comment. *Verify:* `CI=true npx vitest run tests/unit/workflow-pins.test.js`.
- **T07-AC-4** — In `tests/unit/deploy-config.test.js`, T05's tests find the deploy step as the one that uses `cloudflare/wrangler-action@<40-hex SHA>` with a trailing comment naming a v3 release (`# v3` or `# v3.<minor>.<patch>`), and the Node step as the one that uses `actions/setup-node@<40-hex SHA>`. They pass on the pinned workflow. The frozen lines this changes (the step-finding patterns at lines 153, 177, 208, 218 and 220 of the file at T05's merge, 1719fc7) and nothing else of T05's tests are listed in the node's PR. They are changed only after the owner approves them there. *Verify:* `CI=true npx vitest run tests/unit/deploy-config.test.js`, and the owner's `Frozen lines approved at <head>` comment on the PR.
- **T07-AC-5** — Every `actions/checkout` step in both workflows sets `persist-credentials: false` under its `with:`. No step in either workflow runs `git push` or another git command that needs the checkout's credentials. *Verify:* `CI=true npx vitest run tests/unit/workflow-pins.test.js`.
- **T07-AC-6** — The `tests` workflow run on the node PR's head commit downloads each action of `test.yml` by its pinned SHA (the run log's `Download action repository '<owner>/<repo>@<sha>'` lines) and checks out the code with `persist-credentials: false`. *Verify:* the run's ID and those log lines, recorded in the node's PR.

## Risks

- The deploy workflow runs only on pushes to `main` and by hand, so a wrong SHA in it shows only after the merge.
  T07-AC-2's lookups are the check before that. A SHA that names no commit of the action's repository fails the
  job at "Set up job", before the build, so nothing is deployed.
- A lookup that dereferences no annotated tag (`refs/tags/<tag>` without its `^{}` line) pins the tag object, not
  the commit; GitHub then cannot resolve the action. T07-AC-2 records both lines for this reason.
- Pinned SHAs get no fixes from their tags. Updating them, by hand or with Dependabot's `github-actions` ecosystem
  (not configured here), is not this node's. Neither is moving an action to a newer major version, nor making the
  two workflows use the same `actions/upload-artifact` version.
- The node changes frozen test lines of T05 (T07-AC-4). Without the owner's approval on the PR it cannot pass, and
  it changes no other T05 test line.
- `persist-credentials: false` removes the job token from `.git/config` after the checkout. Reading the local
  history (as Wrangler may for a deployment's commit details) needs no credentials. A future step that pushes would
  have to set the token itself, and T07-AC-5's test would need to allow it.
- A local action (`uses: ./path`) or a `docker://` image has no `<owner>/<repo>@<ref>` form. Neither workflow uses
  one, so T07-AC-3's test treats any `uses:` without a full SHA as a failure, and a later node that adds one changes
  the test.
- T02's Risks still say the actions are pinned to major versions. An imported node's spec is history and stays as
  it is.
