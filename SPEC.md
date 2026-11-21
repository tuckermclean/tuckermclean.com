# tuckermclean.com: specification

## 1. What this is

A personal portfolio and blog presented as a desktop in the browser: each page opens as a window that can be
dragged, resized, minimized, maximized and shaded, with a taskbar, a start menu and a context menu. It is a Hugo
site (uglyURLs, built into `dist/`) whose page content is loaded into windows as HTML fragments.

It also holds Iconostat, a window manager built from Web Components, written so that it can be extracted from the
site: `assets/iconostat/` knows nothing about the site.

It is not a framework app (no React or similar, no bundler beyond Hugo's `js.Build`), not a CMS, and it ships no
third-party runtime code. Re-implementing the window manager in a framework is not planned: Iconostat replaced
that idea.

## 2. Principles

1. Vanilla ES modules, built by Hugo's `js.Build` (esbuild) only. No framework and no runtime dependency, so the
   SBOM of the built site stays near-empty.
2. The build toolchain is pinned and checksum-verified. The SBOM and the provenance steps never block a deploy.
3. Iconostat knows nothing about the site. The site talks to it only through its documented API and events
   (`assets/iconostat/README.md`).
4. Effects never block: reduced motion means Tier 0 (no effect), and a failed effect degrades; it never leaves a
   window stranded in a wrong state.
5. End-to-end tests assert what is observable in the DOM and the URL, not internals.
6. Page and post text is the owner's. A node may change markup and front matter, never the owner's words.

## 3. State

Done (on the default branch, tested):

- The test baseline: vitest unit tests (`tests/unit/`) and Playwright end-to-end tests on a desktop project
  (`tests/e2e/`) and a mobile project (`tests/mobile/`), run in CI by `.github/workflows/test.yml`.
- Iconostat: the desktop, window, taskbar and menu elements, the window chrome, the loading affordance and the
  user-experience smoothing work.
- Iconostat FX: Tier 1 (Web Animations) and Tier 2 (WebGL2 genie minimize and wobble drag) window effects, with
  Tier 0 as the passthrough under reduced motion.
- The chat window is built but does not work: its backend ran on AWS accounts that are now closed.

`docs/superpowers/` records the design and plan documents of that work. They are history, not plans to build.

Planned, in this order:

1. Move hosting from AWS S3 to Cloudflare Workers (issue #2), including switching the deploy workflow's trigger
   from `master` to `main`.
2. Nothing else is queued. The owner opens issues for further work.

Known stale details, each left for a later hygiene node:

- `.gitmodules` names a submodule (`writings/themes/terminal`) that the tree does not contain.
- `README.md` says deploys run on pushes to `master` and to AWS S3.
- `vitest.config.js` stubs `./genie.js` and `./wobble.js` with a comment saying those modules are not built yet;
  they exist in `assets/iconostat/fx/`.
- `static/src/env.js` is a copy of `assets/js/env.js`; the chat sign-in pages (`static/login.html`,
  `static/callback.html`) load it.

Known flaky end-to-end tests, each left for a later node (see D6):

- The whole suite passed once on this machine (unit 83, end-to-end 138), but CI's end-to-end step is flaky. On the
  adoption PR's head commit 00893ec, the `tests` run for the pull request (run 44940550691) failed and the run for
  the push (run 44940521710) passed. In the failed run,
  `[desktop] › tests/e2e/fx-tier2-genie.spec.js:235:7 › Tier 2 genie (forced, no-preference) › context-loss
  mid-genie-minimize leaves the window visible (finally-invariant holds even with GL gone)` failed both attempts.
  It is listed in `gate.known_red`.
- In the same run, `tests/e2e/boot.spec.js:51:5`, `tests/e2e/boot.spec.js:73:5` (the back/forward history tests)
  and `tests/e2e/fx-tier1.spec.js:202:7` (a cascade during a Tier-1 minimize) failed once and passed on retry. A
  flaky test does not fail the gate (D3), so none of them is listed.
- On the default branch, the `tests` workflow also failed four times on 2026-08-12 (runs 31556771215,
  31562234332, 31564211355 and 31565200813). The owner's review of the adoption PR reports that the end-to-end step
  failed in each.

## 4. Architecture

- **Content and layouts.** `content/` holds the pages (`_index.md`, `intro.md`, `resume.md`, `welcome.md`,
  `writings.md`) and the blog posts (`content/posts/`). `layouts/` renders them; `layouts/home.html` is the
  desktop page and builds the JavaScript and CSS with Hugo pipes. `hugo.toml` holds the site parameters.
- **Site glue** (`assets/js/`): `main.js` boots the desktop and the FX controller; `window.js` opens pages as
  windows and keeps the URL hash in step; `env.js` derives the domain and the owner's details from the hostname;
  `chat.js` is the websocket chat client. `assets/css/style.css` is the site's stylesheet.
- **Iconostat** (`assets/iconostat/`): `desktop.js`, `window.js`, `taskbar.js`, `menu.js`, `geometry.js`,
  `index.js` (`getDesktop()`), `iconostat.css`, and `README.md`, the public API.
- **Iconostat FX** (`assets/iconostat/fx/`): `controller.js` picks the tier and listens to Iconostat's seam
  events; `tier1.js`; `compositor.js`, `snapshot.js`, `genie.js` and `wobble.js` for Tier 2; `fx.css`. Hugo builds
  each as its own ES module, and the controller loads the heavier ones on first use.
- **Iconostat fixture page**: `assets/iconostat-fixture/entry.js`, `content/iconostat-fixture.md` and
  `layouts/_default/iconostat-fixture.html` build a standalone Iconostat page at `/iconostat-fixture/` (left out of
  the sitemap) that `tests/e2e/iconostat-fixture.spec.js` drives. It ships with the site.
- **Static files** (`static/`): the chat pages (`login.html`, `callback.html`, `chat.html`, `error.html`),
  `static/src/env.js`, fonts and images.
- **Tests and tooling**: `package.json` scripts, `vitest.config.js` (jsdom, `tests/unit/**/*.test.js`),
  `playwright.config.js` (runs `hugo server` from `hugo-bin` as its web server), `coverage.config.js` and the e2e
  coverage setup and teardown.
- **CI and deploy** (`.github/workflows/`): `test.yml` runs the tests on every push and pull request, as two
  steps of one job: `npm run test:unit:cov`, then `npm run test:e2e`. The end-to-end step has no `if: always()`,
  so CI skips it when the unit step fails (D7);
  `deploy-to-s3.yml` builds with a pinned, checksum-verified Hugo, generates the SBOM, deploys and attests the
  build's provenance.

## 5. Node spec template

Every node spec `nodes/<ID>-<name>.md` has the title `# <ID> — <name>`, the header row
`| Track | Deps | Unlocks | Size |`, a line `**Owns:**` (the paths the node creates or changes, in backticks), a
line `**Resolves:** #<n>` when the node is drafted from an issue, and these headings:

- `## Purpose`: why the node exists and what it builds on.
- `## Tests`: the test files the node adds or relies on, and the red target (a command that exits non-zero before
  the node's change and 0 after).
- `## Changes`: numbered, each naming the criterion it produces (`*<ID>-AC-n.*`).
- `## Gate`: the criteria, one line each, `- **<ID>-AC-<n>** — <statement> *Verify:* <command or test>`,
  numbered from 1.
- `## Risks`.

A node's `deps` lists only what its Gate needs; a Verify that uses another node's change names that node in
`deps`.

## 6. Open decisions (defaults apply until the owner changes them)

- **D1. Chat.** Default: the Chat menu item stays, known broken, until an issue removes it or gives it a new
  backend.
- **D2. Custom domain.** Default: pointing tuckermclean.com at the Cloudflare Worker after issue #2's deploy
  checks out is the owner's manual step, not a node.
- **D3. The gate's Playwright failure line.** With CI's one retry, Playwright prints a numbered error block for a
  test that failed and passed on retry (flaky, exit 0) in the same form as for a test that failed twice. Default:
  `fail_pattern` reads the list reporter's line for the failed retry, the `✘` line that ends in `(retry #1)`,
  which only a test that failed every attempt prints; the gate therefore runs with `CI=true`, as CI does.
  Alternative: read the numbered block's line, which also matches flaky tests.
- **D4. Hugo versions.** The end-to-end tests run on `hugo-bin`'s Hugo (non-extended, older); the deploy builds
  with the pinned Hugo extended. CI runs Node 22. Default: recorded, not changed.
- **D5. The fixture page in production.** Default: `/iconostat-fixture/` keeps shipping with the site, out of the
  sitemap.
- **D6. The flaky genie test.** The Tier 2 context-loss test (§3) can fail both attempts in CI. Default: it is
  listed in `gate.known_red`. A listed test that passes does not fail the gate, so a node PR whose CI hits the
  flake is not blocked by it. It stays listed until a node fixes the flake, and that node removes the entry. The
  three tests that only passed on retry are not listed. Alternative: keep `known_red` empty and rerun CI when the
  flake hits.
- **D7. CI skips the end-to-end step after a failing unit step.** `gate.command` runs both halves and fails if
  either fails. `test.yml` runs them as two steps, and the end-to-end step does not run when the unit step fails.
  Then CI's run shows no end-to-end result, for instance once a unit test is in `known_red`. Default: until a node
  in the tooling area makes the end-to-end step always run (for example `if: always()` on that step), a node PR
  whose CI skipped the end-to-end step records that. It then runs `CI=true npm run test:e2e` locally as the
  evidence for that half.
- Any further default a later step needs is added here for the owner to change.

## 7. Conventions

- Branches: `node/<ID>-<name>` for a node, `spec/<topic>` for a spec change.
- Sizes: S under a day, M two or three days, L more.
- A node is done when its Gate's criteria pass and the spec checkers print `PROBLEMS 0`. The gate
  (`docs/graph.yaml`) must also pass apart from the failures listed in `known_red`. Its evidence is CI's `tests`
  run on the node's PR: the unit step and the end-to-end step. If CI skipped the end-to-end step, D7 applies.
