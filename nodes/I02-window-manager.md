# I02 — window-manager

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| done | T01, I01 | I03 | L |

**Owns:** `assets/iconostat/index.js`, `assets/iconostat/desktop.js`, `assets/iconostat/window.js`,
`assets/iconostat/menu.js`, `assets/iconostat/taskbar.js`, `assets/iconostat/iconostat.css`,
`assets/iconostat/README.md`

## Purpose

Iconostat, the window manager built from Web Components that the site's desktop runs on, written to be extracted
from the site (`SPEC.md` principle 3). `index.js` defines four custom elements and exports `getDesktop()`:

- `<iconostat-desktop>` (`desktop.js`): the window registry, z-order and focus (`front`), `createWindow()`, the
  bulk layouts `cascade()`, `tile()` and `minimizeAll()`, the rubber-band selection box, the debounced reflow on a
  viewport resize, and the loading spinner;
- `<iconostat-window>` (`window.js`): builds its own light DOM (header with close, minimize and maximize buttons,
  title, icon, body, status bar, resize grip) and owns drag, resize, minimize into the taskbar, maximize, shade and
  the saved geometry it restores;
- `<iconostat-taskbar>` (`taskbar.js`): registers itself as the desktop's taskbar, the host of minimized windows,
  and opens the menu from its `.start-button` child;
- `<iconostat-menu>` (`menu.js`): opens at the start button or on a right-click, raised above the windows, and
  closes on a click outside it or on one of its items.

The elements coordinate through `iconostat-*` `CustomEvent`s on `document`, and the site listens to the same
events (`iconostat-focused`, `iconostat-promoted`, `iconostat-close`) to keep the URL in step. The seam events
(`iconostat-before-minimize`, `iconostat-before-maximize`, the drag and resize events) let the effects layer
(`assets/iconostat/fx/`) animate without the library depending on it. `iconostat.css` styles all of it through
`--iconostat-*` custom properties with the site's variables as fallbacks. `README.md` documents this public API,
the events and the theming properties. It builds on I01's `pickTopIndex()`.

## Tests

No test in this node's files: the library is tested through pages that use it. The criteria name the tests that
fail when the stated behaviour breaks: the site's end-to-end specs (`tests/e2e/boot.spec.js`, `windows.spec.js`,
`state.spec.js`, `zorder.spec.js`, `dragresize.spec.js`, `desktop.spec.js`, `reflow.spec.js`,
`selection.spec.js`, `tests/mobile/mobile.spec.js`) and the specs of the effects area that pin the seam events
(`tests/e2e/fx-seams.spec.js`, `tests/e2e/fx-tier1.spec.js`, `tests/e2e/fx-cancellation-matrix.spec.js`). I03's
`tests/e2e/iconostat-fixture.spec.js` also drives the library, on a page without the site.

## Changes

none: imported

## Gate

- **I02-AC-1** — `index.js` defines the custom elements `iconostat-desktop`, `iconostat-window`, `iconostat-menu` and `iconostat-taskbar`, and `getDesktop()` returns the page's `<iconostat-desktop>` element, so the site boots and opens its first window and its start menu opens. *Verify:* `CI=true npx playwright test tests/e2e/boot.spec.js:4 tests/e2e/desktop.spec.js:4`.
- **I02-AC-2** — `index.js` defines each element only when no element of that name is defined yet. *Verify:* unpinned: no test loads the library twice.
- **I02-AC-3** — Setting a window's `name` sets its `id` to `window-<name>`. *Verify:* `CI=true npx playwright test tests/e2e/windows.spec.js:4`.
- **I02-AC-4** — `name`, `windowTitle` and `icon` are properties, not reflected attributes. *Verify:* unpinned: no test checks for the absence of the attributes.
- **I02-AC-5** — Setting `windowTitle` writes the `.window-title` text, also when it was set before the window was connected, as `createWindow()` does. *Verify:* `CI=true npx playwright test tests/e2e/boot.spec.js:27`.
- **I02-AC-6** — Setting `icon` writes the `.window-icon` text, and setting `windowTitle` sets the `aria-label`. *Verify:* unpinned: the site writes the icon of the pages it opens itself, and no test reads `aria-label`.
- **I02-AC-7** — `createWindow({ name, title, icon, classes })` positions the new window while it carries the `building` class and then removes that class, so a new window is visible with a non-empty box. *Verify:* `CI=true npx playwright test tests/e2e/boot.spec.js:99`.
- **I02-AC-8** — `setContent(html)` sets the `.window-body`'s HTML. *Verify:* `CI=true npx playwright test tests/e2e/boot.spec.js:18`.
- **I02-AC-9** — A mousedown on a window brings it to the front: it gets an inline `z-index` above every other window and the `front` class, which every other window loses. *Verify:* `CI=true npx playwright test tests/e2e/zorder.spec.js:6`.
- **I02-AC-10** — Bringing a window to the front with `changeHash` true, outside a bulk layout, dispatches `iconostat-focused` `{ name }` on `document`, which the site turns into the URL hash. *Verify:* `CI=true npx playwright test tests/e2e/zorder.spec.js:6 tests/e2e/windows.spec.js:4`.
- **I02-AC-11** — The close button dispatches `iconostat-close` `{ name }` (bubbling); the desktop then unregisters the window and brings the remaining window with the highest inline `z-index` (I01's `pickTopIndex`) to the front. *Verify:* `CI=true npx playwright test tests/e2e/windows.spec.js:22`.
- **I02-AC-12** — After a window is closed, the desktop dispatches `iconostat-promoted` `{ empty, minimized }` on `document`; with no window left, `empty` is true and the site clears the URL to `/`. *Verify:* `CI=true npx playwright test tests/e2e/windows.spec.js:31`.
- **I02-AC-13** — The desktop also runs `promoteTop()` (and so `iconostat-promoted`) after `iconostat-minimize` and `iconostat-maximize`. *Verify:* unpinned: the whole desktop suite passes with both listeners removed.
- **I02-AC-14** — The minimize button moves the window from `document.body` into the desktop's taskbar with the `minimized` class; clicking the minimized window restores it into `document.body` and brings it to the front. *Verify:* `CI=true npx playwright test tests/e2e/windows.spec.js:38`.
- **I02-AC-15** — `<iconostat-taskbar>` registers itself as the desktop's taskbar; without a registered taskbar the desktop uses the element `#tasks`. *Verify:* unpinned: the site's and the fixture's taskbars both have the id `tasks`, so `tests/e2e/windows.spec.js:38` passes without the registration.
- **I02-AC-16** — Minimizing saves the window's inline geometry and restoring puts it back, so a moved and resized window returns to the same box. *Verify:* `CI=true npx playwright test tests/e2e/state.spec.js:51`.
- **I02-AC-17** — The maximize button toggles the `maximized` class. *Verify:* `CI=true npx playwright test tests/e2e/windows.spec.js:50`.
- **I02-AC-18** — Restoring a maximized window returns it to its prior box. *Verify:* `CI=true npx playwright test tests/e2e/state.spec.js:31`.
- **I02-AC-19** — A double-click on the header toggles the `shaded` class, and unshading restores the window's `top`. *Verify:* `CI=true npx playwright test tests/e2e/windows.spec.js:58 tests/e2e/state.spec.js:70`.
- **I02-AC-20** — Shading moves the window's `top` down by half the header's height; a double-click on a header button, or on a minimized window, does not shade it. *Verify:* unpinned: `tests/e2e/windows.spec.js:58`, `:66`, `tests/e2e/state.spec.js:70` and the whole desktop suite pass with the move and with each guard removed.
- **I02-AC-21** — Dragging the header moves the window by the pointer's movement; while the pointer is at or above half the header's height from the top of the viewport, only `left` follows it. *Verify:* `CI=true npx playwright test tests/e2e/dragresize.spec.js:21 tests/e2e/dragresize.spec.js:36`.
- **I02-AC-22** — A drag that starts on a header button, or on a minimized window, does not move the window. *Verify:* unpinned: with the button guard removed only the effects test `tests/e2e/fx-tier2-genie.spec.js:282` failed, in two runs out of three.
- **I02-AC-23** — Dragging the resize grip (`.grippy`) sets the window's width and height to their starting values plus the pointer's movement, growing or shrinking. *Verify:* `CI=true npx playwright test tests/e2e/dragresize.spec.js:64 tests/e2e/dragresize.spec.js:78`.
- **I02-AC-24** — The taskbar's `.start-button` dispatches `iconostat-menu-open` on `document`, the menu opens (`active`) with a `z-index` one above the desktop's counter, so above every window, and a click on a `.menu-item` closes it. *Verify:* `CI=true npx playwright test tests/e2e/desktop.spec.js:4`.
- **I02-AC-25** — A right-click outside a `.window-body` opens the menu. *Verify:* `CI=true npx playwright test tests/e2e/desktop.spec.js:12`.
- **I02-AC-26** — The menu opens at the event's `x`/`y` (shifted left by its width for the start button) or at the pointer; a right-click inside a `.window-body` keeps the browser's own context menu; a click outside the menu and the start button closes the menu. *Verify:* unpinned: no test reads the menu's position, and the whole desktop suite passes with the window-body exception or the outside-click close removed.
- **I02-AC-27** — `minimizeAll()` minimizes every window that is not minimized yet, into the taskbar. *Verify:* `CI=true npx playwright test tests/e2e/desktop.spec.js:19`.
- **I02-AC-28** — `tile()` un-minimizes every window. *Verify:* `CI=true npx playwright test tests/e2e/desktop.spec.js:29`.
- **I02-AC-29** — `tile()` lays the windows out in a grid of `ceil(sqrt(n))` columns sized to the viewport, without the `maximized` and `shaded` classes. *Verify:* unpinned: no test reads the layout.
- **I02-AC-30** — `cascade()` un-minimizes every window and resets each to its cascade position. *Verify:* `CI=true npx playwright test tests/e2e/desktop.spec.js:40`.
- **I02-AC-31** — During `cascade()` `fxSuppressed` is true, and false again after it. *Verify:* `CI=true npx playwright test tests/e2e/fx-seams.spec.js:152`.
- **I02-AC-32** — `fxSuppressed` is also true during `tile()`, and during both bulk layouts the desktop dispatches no `iconostat-focused` and no `iconostat-promoted`, so a bulk layout adds no history entry. *Verify:* unpinned: no test reads `fxSuppressed` during `tile()`, and `tests/e2e/boot.spec.js:73` passes with `cascade()`'s suppression removed.
- **I02-AC-33** — The reflow cascade after a viewport resize passes `keepMinimized: true`, which leaves a minimized window minimized. *Verify:* `CI=true npx playwright test tests/e2e/reflow.spec.js:18`.
- **I02-AC-34** — A viewport resize runs that cascade after 300 ms without a further resize, and an orientation change after 100 ms. *Verify:* unpinned: `tests/e2e/reflow.spec.js:4` passes with the resize listener removed, and no test changes the orientation.
- **I02-AC-35** — A left-button drag on the empty desktop shows the `#desktop-select` box and gives every window it overlaps the `desktop-selected` class; mouseup or Escape hides the box and clears the class. *Verify:* `CI=true npx playwright test tests/e2e/selection.spec.js`.
- **I02-AC-36** — A drag that starts on a window, the taskbar, the menu or the start button starts no selection, and a window blur ends one. *Verify:* unpinned: the whole desktop suite passes with the exclusion removed, and no test blurs the window.
- **I02-AC-37** — The desktop adds one `.iconostat-spinner` to the page; each `iconostat-content-loading` adds one to a count and shows it (`active`), each `iconostat-content-loaded` takes one away and it hides at 0. *Verify:* `CI=true npx playwright test tests/e2e/boot.spec.js:110`.
- **I02-AC-38** — The count never goes below 0; while the spinner is shown, `body` has the `iconostat-loading` class; the spinner follows the pointer on a fine pointer and is centred otherwise. *Verify:* unpinned: no test reads them.
- **I02-AC-39** — `minimize()` first dispatches a cancelable `iconostat-before-minimize` `{ name, el, entering, userGesture }` on `document`; when a listener calls `preventDefault()`, nothing changes. *Verify:* `CI=true npx playwright test tests/e2e/fx-seams.spec.js:10 tests/e2e/fx-seams.spec.js:36`.
- **I02-AC-40** — `maximize()` dispatches the cancelable `iconostat-before-maximize` with the same contract, which the effects layer uses to animate a maximize. *Verify:* `CI=true npx playwright test tests/e2e/fx-cancellation-matrix.spec.js:327`.
- **I02-AC-41** — `minimize()` with `{ silent: true }` dispatches no before-event, so the effects layer can commit the minimize it cancelled. *Verify:* `CI=true npx playwright test tests/e2e/fx-tier1.spec.js:70`.
- **I02-AC-42** — `maximize()` with `{ silent: true }` dispatches no before-event either. *Verify:* unpinned: not checked against a test.
- **I02-AC-43** — A click on a minimized window restores it through exactly one `iconostat-before-minimize` with `userGesture: true`; a programmatic `getDesktop().bringToFront(el)` of a minimized window reports `userGesture: false`. *Verify:* `CI=true npx playwright test tests/e2e/fx-seams.spec.js:52 tests/e2e/fx-seams.spec.js:81`.
- **I02-AC-44** — A touchstart on a minimized window is `preventDefault()`ed, so a tap does not restore it a second time through the synthetic click. *Verify:* unpinned: `tests/mobile/mobile.spec.js:19` still sees exactly one restore without it.
- **I02-AC-45** — A header drag dispatches `iconostat-drag-start`, `iconostat-drag-move` and `iconostat-drag-end` on `document`, the move with the window's `left` and `top`, for the mouse and for touch. *Verify:* `CI=true npx playwright test tests/e2e/fx-seams.spec.js:101` and `CI=true npx playwright test tests/mobile/mobile.spec.js:230`.
- **I02-AC-46** — A grip drag dispatches `iconostat-resize-start`, `iconostat-resize-move` and `iconostat-resize-end`. *Verify:* unpinned: the effects specs pass without them.
- **I02-AC-47** — `iconostat.css` takes the spinner's image from `--iconostat-spinner-image` and the start button's from `--iconostat-start-button-image`. *Verify:* `CI=true npx playwright test tests/e2e/boot.spec.js:135 tests/e2e/boot.spec.js:142`.
- **I02-AC-48** — `iconostat.css` shows a `.menu` with the `active` class (fixed, a column of items). *Verify:* `CI=true npx playwright test tests/e2e/desktop.spec.js:4`.
- **I02-AC-49** — `iconostat.css` gives the resize grip a 1.5rem square at the window's bottom-right corner. *Verify:* `CI=true npx playwright test tests/e2e/dragresize.spec.js:64`.
- **I02-AC-50** — `iconostat.css` makes a shaded window 2.5rem high. *Verify:* `CI=true npx playwright test tests/e2e/windows.spec.js:58 tests/e2e/state.spec.js:70`.
- **I02-AC-51** — At a viewport 768 wide or less, `iconostat.css` makes a window `100vw - 1.5rem` wide, so it fits the viewport. *Verify:* `CI=true npx playwright test tests/mobile/mobile.spec.js:4`.
- **I02-AC-52** — `iconostat.css` makes a maximized window fill the viewport, hides a minimized window's body, status bar and buttons and shows it as a 5rem chip in the taskbar, hides a window while it has the `building` class, styles every colour of the window chrome through a `--iconostat-*` property that falls back to the site's variable, and has print rules. *Verify:* unpinned: the whole desktop suite passes with the maximized, minimized-hiding and `building` rules each removed, and no test reads the colours or prints.
- **I02-AC-53** — The library imports nothing outside `assets/iconostat/`. *Verify:* unpinned: no test checks the imports (I03's fixture page shows only that the library runs with none of the site's code on the page).
- **I02-AC-54** — `README.md` documents the elements, the window and desktop methods, the events and seam events, the site's responsibilities, the taskbar requirement, the theming properties and the build entry rule. *Verify:* unpinned: documentation.

## Risks

- No test file of this node's own pins its behaviour: most criteria are verified by the site's end-to-end specs,
  which drive the library through the site's glue (`assets/js/`), and the seam events by the effects specs. A
  change to those tests or to the site's glue can drop a criterion's evidence.
- `iconostat.css`'s print rules name the site's `#resume-container`, an element of the site's résumé page.
- `minimize()` and `maximize()` read the desktop's private `_suppressHistory`, not its public `fxSuppressed`.
- With neither an `<iconostat-taskbar>` nor an element `#tasks` on the page, `minimize()` throws (the README says
  so).
- `tile()` and `cascade()` un-minimize a window twice over (explicitly, then again through `reset()` or
  `bringToFront()`), so the explicit step can be removed without a test failing.
- The drag's top guard freezes `top` at its last value, not at the drag's start (the comment in
  `tests/e2e/dragresize.spec.js` says so).
- `window.js`'s `bake()` repeats I01's `cascadeOffset()` inline instead of calling it.
- `iconostat.css`'s `.menu-separator`, `.menu-item:hover` and `.start-button` use the site's variables
  (`--border`, `--header-bg-gradient`, `--header-bg`) with no `--iconostat-*` property, and `.start-button` names
  the site's Fira Code font; the README's theming tables do not list them.
- The README's Build section points at `.superpowers/sdd/2026-08-04-iconostat-core/task-6-report.md`, which the
  repository does not track.
