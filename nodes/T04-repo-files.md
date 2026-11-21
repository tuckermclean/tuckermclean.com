# T04 — repo-files

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| done | none | none | S |

**Owns:** `README.md`, `.gitignore`, `.gitmodules`

## Purpose

The repository's own files that are not code: the README, which presents the site and says how to develop, build
and deploy it, the list of untracked files, and the submodule declaration.

## Tests

None: no test reads these files.

## Changes

none: imported

## Gate

- **T04-AC-1** — `README.md` describes the site (a window manager in the browser, content from Hugo loaded into windows as HTML fragments, no framework and no bundler), its stack, the development and build commands (`hugo server --buildDrafts --disableFastRender` or `npm run dev`; `hugo --minify` or `npm run build`), the deploy, the supply-chain measures (pinned, checksum-verified Hugo `0.164.0`, the SBOM at `/.well-known/sbom.spdx.json`, SLSA build provenance), where posts live (`content/posts/`) and the licences. *Verify:* unpinned: no test reads the README.
- **T04-AC-2** — `.gitignore` keeps `node_modules/`, `dist/`, the test output (`test-results/`, `playwright-report/`, `blob-report/`, `playwright/.cache/`, `coverage/`), logs, editor and OS files, `*.local`, `**/.gitkeep` and `resume-*.html` out of git. *Verify:* unpinned: no test checks the ignore list.
- **T04-AC-3** — `.gitmodules` declares the submodule `writings/themes/terminal` (`panr/hugo-theme-terminal`); the tree has no such path and no gitlink, so nothing checks it out. *Verify:* unpinned: no test reads `.gitmodules`.

## Risks

- `README.md` says deploys run on pushes to `master` and go to AWS S3, and lists the AWS secrets; the default
  branch is now `main`, and issue #2 moves hosting to Cloudflare Workers. It also presents the chat as backed by a
  real auth system, whose backend is gone (`SPEC.md` D1).
- `.gitmodules` and the `writings/` entries of `.gitignore` are left from an earlier layout of the site.
- `.gitignore` does not list `.hugo_build.lock`, which is tracked (out of scope).
