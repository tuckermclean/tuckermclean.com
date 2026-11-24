# T05 — cloudflare-workers

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| now | T01, T03, S02 | none | M |

**Owns:** `wrangler.jsonc`, `static/404.html`, `tests/unit/deploy-config.test.js`, `tests/e2e/not-found.spec.js`

**Resolves:** #2

## Purpose

The site went down when the AWS accounts it ran on were closed. The domain's DNS already runs through Cloudflare,
so the built site moves to Cloudflare Workers' static asset hosting, first at a `workers.dev` address. Content
stays as it is.

It changes T03's deploy workflow, `.github/workflows/deploy-to-s3.yml`: the AWS credential and `aws s3 sync`
steps give way to `cloudflare/wrangler-action@v3` running `wrangler deploy`, and the push trigger moves from
`master` to `main`, the default branch since 2026-11-21. The pinned, checksum-verified Hugo install, the build,
the SBOM steps and the attestation steps stay as they are (`SPEC.md` principle 2). The file keeps its name, to
keep the diff small.

It adds `wrangler.jsonc`, which serves the built `dist/` folder as static assets, and `static/404.html`, which
Cloudflare serves for a missing path. That page takes over the job of the S3 error page (S02's
`static/error.html`): it sends a deep link such as `/resume` to the desktop at `/#/resume`, where S02's
`assets/js/window.js` opens the page from the hash.

The repository secrets (`CLOUDFLARE_API_TOKEN` with Workers edit rights and `CLOUDFLARE_ACCOUNT_ID`), removing the
old AWS secrets, and pointing tuckermclean.com at the Worker (`SPEC.md` D2) are the owner's steps, not this
node's.

## Tests

- `tests/unit/deploy-config.test.js` (new, vitest): reads `wrangler.jsonc` and
  `.github/workflows/deploy-to-s3.yml` as text and checks the configuration of T05-AC-1 to T05-AC-3.
- `tests/e2e/not-found.spec.js` (new, Playwright `desktop`): loads missing paths on `hugo server` and checks
  where the 404 page sends the browser (T05-AC-4, T05-AC-5). It uses T01's `tests/e2e/helpers.js`.
- Red target: `CI=true npx vitest run tests/unit/deploy-config.test.js; u=$?; CI=true npx playwright test
  tests/e2e/not-found.spec.js; e=$?; exit $((u|e))`, non-zero before the change (neither the files nor the
  configuration exist) and 0 after.

## Changes

1. Add `wrangler.jsonc`, serving `./dist` as the Worker's static assets with the 404 page for missing paths and
   no custom domain. *T05-AC-1.*
2. In `.github/workflows/deploy-to-s3.yml`, replace the AWS credential and `aws s3 sync` steps with
   `cloudflare/wrangler-action@v3` running `wrangler deploy`, keep the other steps, and move the push trigger to
   `main`. *T05-AC-2, T05-AC-3.*
3. Add `static/404.html`, which sends a missing path to the desktop's hash route on the same origin.
   *T05-AC-4, T05-AC-5.*
4. Check the Worker's asset rules locally on the built site with Wrangler's local server and record the result.
   *T05-AC-6.*

## Gate

- **T05-AC-1** — `wrangler.jsonc` at the repository root names a Worker, sets a `compatibility_date`, serves `./dist` as static assets (`assets.directory`) with `assets.not_found_handling` set to `404-page`, and declares no `routes` or custom domain, so `wrangler deploy` publishes to the Worker's `workers.dev` address. *Verify:* `CI=true npx vitest run tests/unit/deploy-config.test.js`.
- **T05-AC-2** — The deploy workflow runs on pushes to `main` (no longer `master`) and by hand (`workflow_dispatch`), and deploys with a step that uses `cloudflare/wrangler-action@v3` with `command: deploy`, the API token from the secret `CLOUDFLARE_API_TOKEN` and the account from the secret `CLOUDFLARE_ACCOUNT_ID`; it has no `aws-actions/configure-aws-credentials` step, no `aws s3 sync` and no `AWS_*` or `S3_BUCKET_NAME` secret. *Verify:* `CI=true npx vitest run tests/unit/deploy-config.test.js`.
- **T05-AC-3** — The workflow keeps T03's other steps, in T03's order: the pinned Hugo extended install with its SHA-256 check, `hugo --minify`, the build listing, the three SBOM steps with `continue-on-error`, then the deploy, then packing `dist.tgz`, the provenance attestation and the `site-dist` upload, all after the deploy; its permissions stay `contents: read`, `id-token: write` and `attestations: write`. *Verify:* `CI=true npx vitest run tests/unit/deploy-config.test.js`.
- **T05-AC-4** — Opening a missing path `/<name>` for a page of the desktop (for example `/resume`) ends on the same origin at `/#/<name>`, with the desktop showing that page's window. *Verify:* `CI=true npx playwright test tests/e2e/not-found.spec.js`.
- **T05-AC-5** — Opening a missing post path `/posts/<name>` ends on the same origin at `/#/posts/<name>`. *Verify:* `CI=true npx playwright test tests/e2e/not-found.spec.js`.
- **T05-AC-6** — Served by Wrangler's local server from the built site (`npx hugo --minify`, then `npx --yes wrangler dev`), `/` answers with the desktop page, `/resume.html` with the fragment the loader fetches, and `/resume` and an unknown path such as `/no-such-page` with the 404 page's redirect, not with the bare `resume.html` fragment. *Verify:* the commands and their `curl` output (status and the start of each body), recorded in the node's PR.

## Risks

- Workers' default `html_handling` (`auto-trailing-slash`) answers `/resume` with `resume.html`, the bare page
  fragment, so a deep link would show the fragment instead of reaching the 404 page. The setting that keeps the
  redirect, and still answers `/` with `index.html`, is to be chosen against Cloudflare's documentation;
  T05-AC-6 catches the wrong choice.
- `hugo server` (the end-to-end tests' server) serves the site's `404.html` for a missing path, as Cloudflare
  will. If the Hugo of `hugo-bin` does not, the test can load the 404 page under a missing path some other way,
  as long as it checks the redirect the browser ends at.
- S02's `static/error.html` builds its target without a scheme (`window.location.host + '/#' + path`), so the
  browser resolves it under the current path. `static/404.html` must not copy that: T05-AC-4 checks the origin.
  `static/error.html` stays as it is; it is unused on Workers and is left for a later hygiene node.
- The deploy itself runs only on the forge, after the merge to `main` and once the owner has added the Cloudflare
  secrets: the node's gate checks the configuration and the local serving, not a live deploy.
- `wrangler.jsonc` is JSON with comments; the unit test must read it without a JSONC parser dependency (for
  example a file with no comments, or comments stripped before `JSON.parse`).
- `npx --yes wrangler dev` downloads Wrangler for the check and writes a `.wrangler/` folder; neither is added to
  `package.json` or committed (no runtime dependency, `SPEC.md` principle 1).
- On the `workers.dev` address the hostname-derived identity (S01) gives the domain `workers.dev` (S02's Risks)
  until the custom domain points at the Worker.
- The Chat menu item stays and does not work, since its backend was on AWS (`SPEC.md` D1).
- Issue #2 names Cloudflare's Git integration (Workers Builds) as an alternative that would drop the workflow
  change and the secrets; this node follows the issue's planned change, the workflow.
- `README.md` (T04) still says deploys run on pushes to `master` and to AWS S3; that stays for a later hygiene
  node (`SPEC.md` §3).
