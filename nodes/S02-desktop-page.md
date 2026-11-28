# S02 — desktop-page

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| done | T01, I02, F01, F02, F03, F04, F05, S01 | S03, S04, S05, T05, T06 | L |

**Owns:** `hugo.toml`, `assets/jsconfig.json`, `content/_index.md`, `layouts/home.html`, `assets/js/main.js`,
`assets/js/window.js`, `assets/css/style.css`, `static/error.html`, `tests/e2e/boot.spec.js`,
`tests/e2e/chrome.spec.js`, `tests/e2e/desktop.spec.js`, `tests/e2e/windows.spec.js`,
`tests/e2e/imagezoom.spec.js`, `tests/e2e/dragresize.spec.js`, `tests/e2e/reflow.spec.js`,
`tests/e2e/selection.spec.js`, `tests/e2e/state.spec.js`, `tests/e2e/zorder.spec.js`, `tests/mobile/`

## Purpose

The site's desktop: the one full HTML page, and the glue between it, the pages and Iconostat (I02).

- `hugo.toml` configures the build (`uglyURLs`, so each page builds to `<name>.html`; `publishDir = 'dist'`;
  posts at `/posts/<name>`; raw HTML allowed in Markdown; security headers for `hugo server`) and holds the
  owner's details as site parameters, which the page layouts (S04) and this page's head use.
- `layouts/home.html` renders `/`: the head (description, Open Graph, Twitter and schema.org `Person` metadata,
  an inline favicon, font and background preloads, a `not-loaded` style that blacks the page out until the script
  runs, Iconostat's and the site's stylesheets), then `<iconostat-desktop>`, `<iconostat-taskbar id="tasks">` with
  the start button, and `<iconostat-menu id="menu">` with the site's menu: Welcome, Intro, Resume, Writings,
  Chat with Me, Toggle Mode, Cascade Windows, Tile Windows, Minimize All and Effects: Full, Lite and Off. It builds
  `assets/js/main.js` into a fingerprinted `js/bundle.js`, `assets/js/chat.js` into `js/chat.js` (S03), and each
  Iconostat FX module (F01 to F05) into a fixed, unfingerprinted `/iconostat/fx/<file>.js`, with their imports of
  each other kept external, so the controller can load them on first use.
- `assets/js/main.js` puts the owner's name for the hostname (S01) into the document title, removes `not-loaded`,
  exposes the functions the menu's `onclick`s call (`openPage`, `goTo`, `toggleMode`, `cascadeWindows`,
  `tileWindows`, `minimizeWindows`, `createWindow`, `setFxTier`) on `window`, loads the FX controller and calls
  `FxController.init()` on the desktop, and shows an idle joke in the front window's status bar.
- `assets/js/window.js` opens pages as windows and keeps the URL in step: `openPage()` creates a window and loads
  `<name>.html` into it; `goTo()` loads a page into the top window; the URL hash `#/<name>` (or the path's last
  segment) decides what opens at boot and on Back and Forward; the library's `iconostat-focused`,
  `iconostat-promoted` and `iconostat-close` events become `pushState`/`replaceState` calls and the window's
  removal. Its loader `loadHTML()` signals `iconostat-content-loading`/`-loaded` for the spinner, copies the
  fragment's `.page-icon` and `.page-title` into the header, runs the fragment's scripts, writes S01's identity
  into `.name`, `.initials`, `a.email` and `a.domain`, opens external links in a new tab, shows a hovered link in
  the status bar, and opens a clicked image in a zoomable image window. `toggleMode()` switches the light theme and
  keeps it in `localStorage`.
- `assets/css/style.css` is the site's theme: the fonts, the dark and light colour variables (`body.toggled`
  and `prefers-color-scheme`), the `--iconostat-*` properties that theme the library, including the spinner's and
  the start button's image, and the styles of the pages, the résumé (with print rules), the writings and the chat.
- `static/error.html` is the error page the old S3 hosting served for a missing path; it redirects to the desktop
  with the path as the hash.
- `assets/jsconfig.json` maps import paths for an editor; `content/_index.md` is the home page's front matter.

## Tests

- `tests/e2e/boot.spec.js`, `windows.spec.js`, `desktop.spec.js`, `chrome.spec.js`, `imagezoom.spec.js`
  (Playwright, `desktop`): boot, deep links and history, opening and closing windows, the menu, the theme toggle,
  the status bar, the link hardening and the image zoom, through this page.
- `tests/e2e/dragresize.spec.js`, `reflow.spec.js`, `selection.spec.js`, `state.spec.js`, `zorder.spec.js`
  (Playwright, `desktop`) and `tests/mobile/mobile.spec.js` (Playwright, `mobile`, which also runs Tier 1 and
  Tier 2 effects on a touch viewport): they drive the window manager and the effects through this page, and pin
  I02's and F01 to F05's criteria rather than this node's.
- All use T01's `tests/e2e/helpers.js` (`openApp`, `openViaMenu`, `win`) and run against `hugo server`.

## Changes

none: imported

## Gate

- **S02-AC-1** — `home.html` puts the start button (`#start-button`) in `<iconostat-taskbar id="tasks">`, and `<iconostat-menu id="menu">` holds the items Resume, Intro, Chat with Me, Toggle Mode, Cascade Windows, Tile Windows and Minimize All, each calling its function. *Verify:* `CI=true npx playwright test tests/e2e/desktop.spec.js tests/e2e/boot.spec.js:35`.
- **S02-AC-2** — The menu also holds Welcome, Writings and Effects: Full, Lite and Off (`setFxTier('auto'|'1'|'0')`). *Verify:* unpinned: no test clicks them.
- **S02-AC-3** — `main.js`'s build to `js/bundle.js` keeps its import of the FX controller external, so the controller loads from `/iconostat/fx/controller.js` and an effect runs. *Verify:* `CI=true npx playwright test tests/e2e/fx-tier1.spec.js:55 tests/e2e/fx-tier1.spec.js:70`.
- **S02-AC-4** — `home.html` builds Tier 1 to `/iconostat/fx/tier1.js` and wobble and snapshot to `/iconostat/fx/wobble.js` and `/iconostat/fx/snapshot.js`, fixed and unfingerprinted, where the controller and the pages load them. *Verify:* `CI=true npx playwright test tests/e2e/fx-tier1.spec.js:70` and `CI=true npx playwright test tests/mobile/mobile.spec.js:144`.
- **S02-AC-5** — `home.html` builds the other FX modules (the controller, compositor, genie) to their own fixed paths under `/iconostat/fx/` too, keeps the controller's, compositor's, genie's and wobble's imports of each other external, publishes `fx.css` unminified next to them, and fetches none of them but the controller (a `modulepreload`). *Verify:* unpinned: not checked against a test module by module.
- **S02-AC-6** — The head preloads both background images, `/I-Know-Better-1.jpg` and `/I-Know-Better-2.jpg`. *Verify:* `CI=true npx playwright test tests/e2e/boot.spec.js:12`.
- **S02-AC-7** — The head carries the description, Open Graph, Twitter and schema.org metadata from `hugo.toml`'s parameters, an inline "TM" favicon, the font preloads, and a style that blacks out the page while `<html>` has `not-loaded`, which `main.js` removes. *Verify:* unpinned: no test reads them.
- **S02-AC-8** — `main.js` exposes on `window` the functions the menu's `onclick`s call (`openPage`, `toggleMode`, `cascadeWindows`, `tileWindows`, `minimizeWindows`). *Verify:* `CI=true npx playwright test tests/e2e/desktop.spec.js`.
- **S02-AC-9** — `main.js` calls `FxController.init()` on the page's desktop once the controller has loaded, so a Tier 1 minimize is animated. *Verify:* `CI=true npx playwright test tests/e2e/fx-tier1.spec.js:70`.
- **S02-AC-10** — `window.setFxTier(value)` passes `value` to `FxController.setTier()`. *Verify:* `CI=true npx playwright test tests/e2e/fx-tier1.spec.js:179`.
- **S02-AC-11** — After 45 s without a mousemove, keydown, click or touchstart, the front window's status bar shows one of seven jokes, and 8 s later "Status: Ready to work!" again if it still shows the joke. *Verify:* `CI=true npx playwright test tests/e2e/chrome.spec.js:34`.
- **S02-AC-12** — `main.js` replaces "Tucker McLean" in the document title with S01's name for the hostname. *Verify:* unpinned: the tests run on `localhost`, whose name is the default.
- **S02-AC-13** — With no hash and no path, boot opens the Welcome window and leaves the URL at `/`. *Verify:* `CI=true npx playwright test tests/e2e/boot.spec.js:4`.
- **S02-AC-14** — A deep link `#/<name>` opens a window for `<name>` and loads `<name>.html` into it; the loader copies the fragment's `.page-icon` and `.page-title` into the window's icon and title. *Verify:* `CI=true npx playwright test tests/e2e/boot.spec.js:4 tests/e2e/boot.spec.js:18`.
- **S02-AC-15** — A deep link to a name with no page opens a window titled by the name, dashes as spaces and the first letter capitalized. *Verify:* `CI=true npx playwright test tests/e2e/boot.spec.js:27`.
- **S02-AC-16** — The window opened for a deep link gets the icon ✍️ for a `posts/` name and ⚙️ otherwise until its fragment sets one; with no hash, the path's last segment is the name, and `#/welcome` or `/welcome` is normalized to `/`. *Verify:* unpinned: no test reads these.
- **S02-AC-17** — `iconostat-focused` `{ name }` pushes `#/<name>` when the hash differs, so opening a page from the menu sets the hash. *Verify:* `CI=true npx playwright test tests/e2e/windows.spec.js:4`.
- **S02-AC-18** — `openPage()` of a page whose window is open brings that window to the front instead of opening another. *Verify:* `CI=true npx playwright test tests/e2e/windows.spec.js:13`.
- **S02-AC-19** — On `iconostat-close` the site runs the window's registered `windowCleanup` callbacks and removes the window from the page. *Verify:* `CI=true npx playwright test tests/e2e/windows.spec.js:22`.
- **S02-AC-20** — `iconostat-promoted` with `empty` replaces the URL with `/`. *Verify:* `CI=true npx playwright test tests/e2e/windows.spec.js:31`.
- **S02-AC-21** — `iconostat-promoted` with `minimized` pushes a history entry. *Verify:* `CI=true npx playwright test tests/e2e/windows.spec.js:282`.
- **S02-AC-22** — Back and Forward reopen the page named by the URL, and when that page's window is open it is brought to the front, so no window is dropped. *Verify:* `CI=true npx playwright test tests/e2e/boot.spec.js:35 tests/e2e/boot.spec.js:51`.
- **S02-AC-23** — `goTo()` of a page with no window of its own loads that page into the top window, renaming it. *Verify:* `CI=true npx playwright test tests/e2e/windows.spec.js:293`.
- **S02-AC-24** — The loader dispatches `iconostat-content-loaded` once a fragment is in its window, so the spinner does not stay shown. *Verify:* `CI=true npx playwright test tests/e2e/boot.spec.js:127`.
- **S02-AC-25** — The loader dispatches `iconostat-content-loading` before its first fetch, and `iconostat-content-loaded` also on a failed fetch and after five retries when the target element is missing. *Verify:* `CI=true npx playwright test tests/e2e/boot.spec.js:169 tests/e2e/boot.spec.js:176 tests/e2e/boot.spec.js:183`.
- **S02-AC-26** — The loader re-creates each of the fragment's scripts so it runs (a `src` gets a `?nocache=` query, a module stays a module) and registers its removal as the window's cleanup. *Verify:* unpinned: no test reads a fragment script's effect.
- **S02-AC-27** — The loader writes S01's identity into the fragment: the name into `.name`, the initials into `.initials`, the email into `a.email` (text and `mailto:`) and the domain into `a.domain` (text and link). *Verify:* unpinned: no test reads them.
- **S02-AC-28** — The loader gives a loaded link to another host `target="_blank"` and `rel="noopener noreferrer"`. *Verify:* `CI=true npx playwright test tests/e2e/chrome.spec.js:27`.
- **S02-AC-29** — The loader gives a link with no `title` its `href` as the title. *Verify:* unpinned: no test reads it.
- **S02-AC-30** — Hovering a loaded link shows its `href` in the window's status bar, and leaving it shows "Status: Ready to work!". *Verify:* `CI=true npx playwright test tests/e2e/chrome.spec.js:15`.
- **S02-AC-31** — Clicking a loaded image opens a window `img-<file name>` (non-alphanumerics as `-`) holding the image, and a second click brings that window to the front instead of opening another. *Verify:* `CI=true npx playwright test tests/e2e/imagezoom.spec.js:7 tests/e2e/imagezoom.spec.js:26`.
- **S02-AC-32** — A wheel over the image window zooms the image: it sets the image's width from its natural width times the zoom, without `max-width`. *Verify:* `CI=true npx playwright test tests/e2e/imagezoom.spec.js:16`.
- **S02-AC-33** — A wheel up zooms by 1.15 and down by 0.87, a two-finger pinch zooms by the change of the fingers' distance, and the zoom stays between 0.25 and 10. *Verify:* unpinned: `tests/e2e/imagezoom.spec.js:16` passes with the wheel's factors swapped, and no test pinches.
- **S02-AC-34** — `toggleMode()` toggles `body.toggled` and stores `mode` as `light` or `dark` in `localStorage`, and a page load with `light` stored starts toggled. *Verify:* `CI=true npx playwright test tests/e2e/desktop.spec.js:51`.
- **S02-AC-35** — `style.css` gives the library the spinner's image through `--iconostat-spinner-image` and the start button's through `--iconostat-start-button-image`, both the site's eye (`/start-button.*`). *Verify:* `CI=true npx playwright test tests/e2e/boot.spec.js:137 tests/e2e/boot.spec.js:144`.
- **S02-AC-36** — The start button's image is the WebP where the browser supports it and the GIF otherwise. *Verify:* unpinned: `tests/e2e/boot.spec.js:144` passes with either declaration removed.
- **S02-AC-37** — `style.css` declares the dark theme by default, the light theme under `body.toggled`, the reverse under `prefers-color-scheme: light`, re-declares the `--iconostat-*` aliases in each, and styles the pages, the résumé's print layout, the writings and the chat. *Verify:* unpinned: no test reads colours, prints or reads those pages' styles.
- **S02-AC-38** — `hugo.toml` sets `uglyURLs`, so each page builds to `<name>.html`, the file the loader fetches. *Verify:* `CI=true npx playwright test tests/e2e/boot.spec.js:18`.
- **S02-AC-39** — `hugo.toml` puts each post at `/posts/<name>`, so `#/posts/<name>` loads `posts/<name>.html`. *Verify:* `CI=true npx playwright test tests/e2e/imagezoom.spec.js:7`.
- **S02-AC-40** — `hugo.toml` builds into `dist/`, allows raw HTML in Markdown, sets `X-Frame-Options`, `X-Content-Type-Options` and `X-XSS-Protection` on `hugo server`, and holds the owner's details as parameters. *Verify:* unpinned: no test reads them.
- **S02-AC-41** — `static/error.html` sends the browser to the desktop with the missing path as the hash. *Verify:* unpinned: no test loads it.
- **S02-AC-42** — `assets/jsconfig.json` maps every import path to itself from `assets/`, for an editor; `content/_index.md` titles the home page. *Verify:* unpinned: neither affects a test.

## Risks

- Most of this node's test files (`dragresize`, `reflow`, `selection`, `state`, `zorder`, `tests/mobile/`) pin
  I02's and F01 to F05's criteria, not this node's, and several of this node's criteria rest on F01's
  `tests/e2e/fx-tier1.spec.js` and on the pages of S04 and S05 (`tests/e2e/imagezoom.spec.js` needs S05's post
  layout). A change to any of them can drop a criterion's evidence.
- `static/error.html` sets `location.href` to `window.location.host + '/#' + path`, which has no scheme, so the
  browser resolves it as a path under the current one (`/resume` goes to `/<host>/#/resume`, itself missing); its
  fallback link adds `/#/` before a path that starts with `/`. Issue #2 replaces the S3 error page with a
  `static/404.html` for Cloudflare.
- The identity comes from the hostname (S01): on a `workers.dev` address (issue #2's first deploy) the domain is
  `workers.dev`, so the loader writes `workers.dev` into every `a.domain` link.
- `goTo()` on a page with no window renames the top window, so that window's page is replaced, not kept.
- The loader re-runs every script of a fragment on each load, with `?nocache=` on a `src`, so a module such as
  `chat.js` runs again each time its window opens, and listeners a script adds to `document` pile up.
- On a failed fetch the loader dispatches `iconostat-content-loaded` but never calls its callback, so the window
  is not brought to the front and keeps the name-derived title (`tests/e2e/boot.spec.js:27` relies on this).
- The image zoom names its window by the file name alone, so two images of the same name in different folders
  share one window.
- `home.html`'s comments still call the Tier 2 modules "not-yet-built" and name agents of the work that built
  them; `home.html` builds and preloads `js/chat.js` (S03) on every load.
- The owner's details live in three places: `hugo.toml`'s parameters, S01's `env.js` and `home.html`'s favicon
  and schema.org address. The head's description and the menu's titles and icons repeat what the pages' front
  matter (S04) says.
- `style.css` holds the styles of S03's, S04's and S05's pages, so a change of their look changes this node's
  file. The `--iconostat-*` aliases must be re-declared in each theme block (its comment says why).
- `hugo.toml`'s security headers apply to `hugo server` only, not to the deployed site.
- The back/forward tests `tests/e2e/boot.spec.js:51` and `:73` failed once and passed on retry in CI
  (`SPEC.md` §3).
