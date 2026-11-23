# I03 — standalone-fixture

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| done | T01, I02 | none | S |

**Owns:** `assets/iconostat-fixture/`, `content/iconostat-fixture.md`, `layouts/_default/iconostat-fixture.html`,
`tests/e2e/iconostat-fixture.spec.js`

## Purpose

A standalone Iconostat page at `/iconostat-fixture/` that loads the library (I02) and nothing of the site, so the
end-to-end tests can show that Iconostat works without the site's glue. `content/iconostat-fixture.md` gives the
page its URL and layout; `layouts/_default/iconostat-fixture.html` renders, under `hugo server` only, a bare HTML
page with the library's stylesheet, an `<iconostat-taskbar id="tasks">`, an `<iconostat-desktop id="desktop">` and
the module that Hugo's `js.Build` makes from `assets/iconostat-fixture/entry.js`. That entry module opens one window
through the library's public API.

`entry.js` is a leaf module rather than `assets/iconostat/index.js` itself: its comment, and the Build section of
`assets/iconostat/README.md`, say that Hugo hands a `js.Build` entry to esbuild as stdin, so making `index.js` the
entry would bundle it twice and crash on `customElements.define`.

## Tests

`tests/e2e/iconostat-fixture.spec.js` (Playwright, `desktop` project, through T01's configuration): three tests,
each loading `/iconostat-fixture/` (the boot, a header drag, and a minimize into the taskbar).

## Changes

none: imported

## Gate

- **I03-AC-1** — `content/iconostat-fixture.md` serves the page at `/iconostat-fixture/` with the layout `iconostat-fixture`. *Verify:* `CI=true npx playwright test tests/e2e/iconostat-fixture.spec.js:10`.
- **I03-AC-2** — The page loads the module built from `assets/iconostat-fixture/entry.js` (`js.Build`, ESM, `js/iconostat-fixture.js`), which opens a window named `fixture`, so `iconostat-window#window-fixture` is visible and has the `front` class. *Verify:* `CI=true npx playwright test tests/e2e/iconostat-fixture.spec.js:10`.
- **I03-AC-3** — The fixture window's content is `<p id="fixture-body">standalone</p>`. *Verify:* `CI=true npx playwright test tests/e2e/iconostat-fixture.spec.js:10`.
- **I03-AC-4** — The window has the title `Fixture` and the icon `🧪`, and `entry.js` brings it to the front itself. *Verify:* unpinned: the test checks neither the title nor the icon, and the window has the `front` class without `entry.js`'s own `bringToFront()` call, since `createWindow()` already brings the only window to the front.
- **I03-AC-5** — The page defines no site global: `window.openPage` is `undefined` after the boot and after a minimize. *Verify:* `CI=true npx playwright test tests/e2e/iconostat-fixture.spec.js:10 tests/e2e/iconostat-fixture.spec.js:40`.
- **I03-AC-6** — The page links the library's stylesheet (`iconostat/iconostat.css`, minified), so dragging the window's header moves it to the right. *Verify:* `CI=true npx playwright test tests/e2e/iconostat-fixture.spec.js:20`.
- **I03-AC-7** — The page holds an `<iconostat-taskbar id="tasks">`, so the window's `minimize()` moves it into the taskbar. *Verify:* `CI=true npx playwright test tests/e2e/iconostat-fixture.spec.js:40`.
- **I03-AC-8** — The page is left out of the sitemap (`sitemap: {disable: true}`). *Verify:* unpinned: no test reads the sitemap.
- **I03-AC-9** — Outside `hugo server` the layout renders nothing: `npm run build` writes `iconostat-fixture/index.html` as an empty file and builds no fixture module. *Verify:* unpinned: no test runs a production build (seen once in a build with `hugo-bin`'s Hugo while this node was mapped).

## Risks

- `SPEC.md` (§4 and D5) says the fixture page ships with the site. The layout's `{{ if hugo.IsServer }}` guard
  means the deployed `/iconostat-fixture/` is an empty page (I03-AC-9); the page only works under `hugo server`,
  which is what the end-to-end tests use.
- The tests drive the fixture through the library only; a change to the site glue (`assets/js/`) cannot break
  them, and a library change that the site relies on but the fixture does not use is not caught here.
- `layouts/_default/iconostat-fixture.html` has no `<title>` and no viewport meta, so the page is not meant for
  phones.
