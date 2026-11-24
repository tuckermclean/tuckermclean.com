# T05 — cloudflare-workers

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| now | T01, T03, S02 | none | M |

**Owns:** `wrangler.jsonc`, `static/_redirects`, `static/404.html`, `tests/unit/deploy-config.test.js`, `tests/e2e/not-found.spec.js`

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

It adds `wrangler.jsonc`, which serves the built `dist/` folder as static assets, `static/_redirects` and
`static/404.html`, which Cloudflare serves for a missing path. The site uses `uglyURLs = true`, and S02's
`assets/js/window.js` fetches each window's fragment by its file name, `<name>.html` (`/resume.html`,
`/posts/<name>.html`). So the Worker serves files by their exact path (`html_handling: "none"`): no `.html`
redirect, and `/resume` is not answered with the bare `resume.html` fragment. Under that setting `/` no longer
serves `index.html` by itself, so `static/_redirects` (copied into `dist/`) holds one proxy rule, `/ /index.html
200`, which serves the desktop at the root. Every other path that matches no file, a deep link such as `/resume`
or `/posts/<name>` included, gets `404.html`. That page takes over the job of the S3 error page (S02's
`static/error.html`): it sends the deep link to the desktop at `/#/resume`, where `window.js` opens the page from
the hash. Deep links go through `404.html` rather than one `_redirects` rule per page and post, so a new post
needs no rule.

The repository secrets (`CLOUDFLARE_API_TOKEN` with Workers edit rights and `CLOUDFLARE_ACCOUNT_ID`), removing the
old AWS secrets, and pointing tuckermclean.com at the Worker (`SPEC.md` D2) are the owner's steps, not this
node's.

## Tests

- `tests/unit/deploy-config.test.js` (new, vitest): reads `wrangler.jsonc`,
  `static/_redirects` and `.github/workflows/deploy-to-s3.yml` as text and checks the configuration of T05-AC-1 to T05-AC-3.
- `tests/e2e/not-found.spec.js` (new, Playwright `desktop`): loads missing paths on `hugo server` and checks
  where the 404 page sends the browser (T05-AC-4, T05-AC-5). It uses T01's `tests/e2e/helpers.js`.
- `hugo server`, which the end-to-end tests run on, applies neither `_redirects` nor `html_handling`: T05-AC-4
  and T05-AC-5 cover only `static/404.html`'s redirect. How the Worker answers each path is T05-AC-6's, on
  Wrangler's local server.
- Red target: `CI=true npx vitest run tests/unit/deploy-config.test.js; u=$?; CI=true npx playwright test
  tests/e2e/not-found.spec.js; e=$?; exit $((u|e))`, non-zero before the change (neither the files nor the
  configuration exist) and 0 after.

## Changes

1. Add `wrangler.jsonc`, serving `./dist` as the Worker's static assets with `html_handling: "none"`, the 404
   page for missing paths and no custom domain, and `static/_redirects` with the single rule
   `/ /index.html 200`. Deep links are left to `static/404.html`, not to `_redirects`. *T05-AC-1.*
2. In `.github/workflows/deploy-to-s3.yml`, replace the AWS credential and `aws s3 sync` steps with
   `cloudflare/wrangler-action@v3` running `wrangler deploy`, keep the other steps, and move the push trigger to
   `main`. *T05-AC-2, T05-AC-3.*
3. Add `static/404.html`, which sends a missing path to the desktop's hash route on the same origin.
   *T05-AC-4, T05-AC-5.*
4. Check how the Worker answers each path locally, on the built site with Wrangler's local server, and record the
   result. *T05-AC-6.*

## Gate

- **T05-AC-1** — `wrangler.jsonc` at the repository root names a Worker, sets a `compatibility_date`, serves `./dist` as static assets (`assets.directory`) with `assets.html_handling` set to `none` and `assets.not_found_handling` set to `404-page`, and declares no `routes` or custom domain, so `wrangler deploy` publishes to the Worker's `workers.dev` address. `static/_redirects` holds the rule `/ /index.html 200` and no rule with a placeholder (`:name`) or a splat (`*`), which would also catch the `.html` fragments the loader fetches. *Verify:* `CI=true npx vitest run tests/unit/deploy-config.test.js`.
- **T05-AC-2** — The deploy workflow runs on pushes to `main` (no longer `master`) and by hand (`workflow_dispatch`), and deploys with a step that uses `cloudflare/wrangler-action@v3` with `command: deploy`, the API token from the secret `CLOUDFLARE_API_TOKEN` and the account from the secret `CLOUDFLARE_ACCOUNT_ID`; it has no `aws-actions/configure-aws-credentials` step, no `aws s3 sync` and no `AWS_*` or `S3_BUCKET_NAME` secret. *Verify:* `CI=true npx vitest run tests/unit/deploy-config.test.js`.
- **T05-AC-3** — The workflow keeps T03's other steps, in T03's order: the pinned Hugo extended install with its SHA-256 check, `hugo --minify`, the build listing, the three SBOM steps with `continue-on-error`, then the deploy, then packing `dist.tgz`, the provenance attestation and the `site-dist` upload, all after the deploy; its permissions stay `contents: read`, `id-token: write` and `attestations: write`. *Verify:* `CI=true npx vitest run tests/unit/deploy-config.test.js`.
- **T05-AC-4** — On `hugo server`, opening a missing path `/<name>` for a page of the desktop (for example `/resume`) ends on the same origin at `/#/<name>`, with the desktop showing that page's window. *Verify:* `CI=true npx playwright test tests/e2e/not-found.spec.js`.
- **T05-AC-5** — On `hugo server`, opening a missing post path `/posts/<name>` ends on the same origin at `/#/posts/<name>`. *Verify:* `CI=true npx playwright test tests/e2e/not-found.spec.js`.
- **T05-AC-6** — Served by Wrangler's local server from the built site (`npx hugo --minify`, then `npx --yes wrangler dev`): `/` answers 200 with the desktop page; `/resume.html` and a post's `/posts/<name>.html` answer 200 with the fragment the loader fetches, with no redirect; `/resume`, `/posts/<name>` and `/no-such-page` end, in a browser, on the same origin at the desktop's hash route (`/#/resume`, `/#/posts/<name>`, `/#/no-such-page`), never showing the bare fragment. *Verify:* the commands, the `curl -i` output for each path (status, any `Location`, the start of the body) and, for the three deep links, the URL a headless Chromium ends at, recorded in the node's PR.

## Risks

- Workers' default `html_handling` (`auto-trailing-slash`) would answer `/resume` with `resume.html`, the bare
  fragment, and `/resume.html` with a 307 to `/resume`, which breaks the loader's fetch; `force-` and
  `drop-trailing-slash` redirect `.html` the same way. Only `none` serves the fragments as the loader fetches
  them, and it needs the `/` rule in `_redirects`: without it `/` gets the 404 page, whose redirect to `/#/`
  loops back to `/`.
- `_redirects` applies to a path whether or not a file matches it. A placeholder or splat rule such as
  `/posts/:name` would also catch `/posts/<name>.html`, so T05-AC-1 allows none.
- A deep link is answered with status 404 (the 404 page) before its script redirects. Exact `_redirects` rules
  (`/resume /#/resume 302`, generated by Hugo so a new post gets its own) would answer with a redirect instead;
  this node does not add them.
- `hugo server` applies neither `_redirects` nor `html_handling`; only T05-AC-6 checks the Worker's answers.
- Cloudflare's documentation does not show `none` together with the `/ /index.html 200` proxy or with
  `404-page`; both work by exact file path, which `none` serves. T05-AC-6's `/` and deep-link rows are where a
  difference would show; if one fails, the node stops and asks the owner rather than changing the setting.
- `hugo server` (the end-to-end tests' server) serves the site's `404.html` for a missing path, as Cloudflare
  will. If the Hugo of `hugo-bin` does not, the test can load the 404 page under a missing path some other way,
  as long as it checks the redirect the browser ends at.
- S02's `static/error.html` builds its target without a scheme (`window.location.host + '/#' + path`), so the
  browser resolves it under the current path. `static/404.html` must not copy that: T05-AC-4 checks the origin.
  `static/error.html` stays as it is; it is unused on Workers and is left for a later hygiene node.
- The deploy itself runs only on the forge, after the merge to `main` and once the owner has added the Cloudflare
  secrets: the node's gate checks the configuration and the local serving, not a live deploy.
- Once the node's PR merges, every push to `main` runs the deploy, and it fails until `CLOUDFLARE_API_TOKEN` and
  `CLOUDFLARE_ACCOUNT_ID` are set: the owner adds the secrets before the node's PR merges.
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
