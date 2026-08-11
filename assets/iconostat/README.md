# Iconostat

Native Web Components window manager. Extractable, framework-free, no bundler.

## Elements
- `<iconostat-desktop>` — root; owns window registry, z-order, focus, rubber-band selection, resize reflow.
- `<iconostat-window>` — draggable/resizable/minimizable/maximizable/shadeable window.
- `<iconostat-taskbar>` — host for minimized windows; registers itself with the desktop as the `minimize()`/`reset()` relocation target.
- `<iconostat-menu>` — start/context menu mechanism. Menu *items* are site-authored children — see [Site responsibilities](#site-responsibilities).

## Public API

### Elements

- `<iconostat-desktop>` (`assets/iconostat/desktop.js`, class `IconostatDesktop`) — the root element. Owns the window registry, z-order/focus, rubber-band selection, and resize/orientation reflow. Windows are **not** DOM descendants of `<iconostat-desktop>` (it renders `display:contents` and windows are appended to `document.body`); coordination happens exclusively via bubbling `iconostat-*` `CustomEvent`s observed at the `document` level, not via listeners on the element itself.
- `<iconostat-window>` (`assets/iconostat/window.js`, class `IconostatWindow`) — a draggable/resizable/minimizable/maximizable/shadeable window. Builds its own light-DOM markup on `connectedCallback`.
- `<iconostat-taskbar>` (`assets/iconostat/taskbar.js`, class `IconostatTaskbar`) — the host for minimized `<iconostat-window>` elements. On `connectedCallback` it adds the `.tasks` class and calls `getDesktop().registerTaskbar(this)`, so `<iconostat-window>.minimize()`/`.reset()` can relocate windows into it. If it contains a child matching `.start-button`, it wires that child's `click` to dispatch `iconostat-menu-open` on `document` (computing `x`/`y` from the button's bounding rect, `offset: true`). The `.start-button` child itself — its markup/icon — is site-authored; the taskbar only looks for the class.
- `<iconostat-menu>` (`assets/iconostat/menu.js`, class `IconostatMenu`) — the start/context menu mechanism. On `connectedCallback` it adds the `.menu` class and wires: (1) a `document`-level `iconostat-menu-open` listener that opens the menu at the event's `{x, y, offset}`; (2) a `document`-level `contextmenu` listener that opens the menu at the cursor (suppressed when the right-click target is inside `.window-body`, so the browser's native context menu still works there); (3) a `document`-level `click` listener that closes the menu unless the click target is inside `.menu` or `.start-button`; (4) a `click` listener on each of its own `.menu-item` children (present at connect time) that closes the menu. It has no public methods — its entire consumer-facing surface is the `iconostat-menu-open` event. The menu *items* themselves (`.menu-item` children and their `onclick` behavior) are site-authored — see [Site responsibilities](#site-responsibilities).

### Window identity

Windows are identified by `id="window-<name>"`, not by an HTML attribute. `name`, `windowTitle`, and `icon` are **JS properties on the element instance**, not reflected attributes — there is no `name=`/`window-title=`/`icon=` attribute in the DOM to select on.

- `el.name = 'foo'` — setter also sets `el.id = 'window-foo'`.
- `el.windowTitle = 'Foo'` — setter also sets `aria-label="Foo"` on the element and updates the `.window-title` text.
- `el.icon = '🧪'` — setter updates the `.window-icon` text.

Consumers should locate a window with `document.querySelector('#window-' + name)` (or `getDesktop().windows.find(w => w.id === 'window-' + name)`), **not** `[name=...]`.

### `<iconostat-window>` methods

All defined in `assets/iconostat/window.js`:

| Method | Effect |
|---|---|
| `setContent(html)` | Sets the `.window-body` innerHTML. |
| `bringToFront()` | Dispatches `iconostat-focus` (bubbles) for the desktop to handle. |
| `minimize(force?, opts?)` | Toggles (or forces) minimized state; moves the element between `document.body` and `getDesktop().taskbar`. Dispatches a cancelable `iconostat-before-minimize` on `document` first (unless `opts.silent`) — if `preventDefault()`ed, returns without mutating. Otherwise proceeds and dispatches `iconostat-minimize`. See [fx seam events](#fx-seam-events). |
| `maximize(force?, opts?)` | Toggles (or forces) maximized state. Dispatches a cancelable `iconostat-before-maximize` on `document` first (unless `opts.silent`) — if `preventDefault()`ed, returns without mutating. Otherwise proceeds and dispatches `iconostat-maximize`. See [fx seam events](#fx-seam-events). |
| `shade(force?)` | Toggles (or forces) shaded (rolled-up) state. Dispatches `iconostat-shade`. |
| `close()` | Dispatches `iconostat-close`; the element does not remove itself — the desktop unregisters it and site glue is responsible for actually removing it from the DOM (see `assets/js/window.js`'s `iconostat-close` listener). |

### `<iconostat-desktop>` methods

**Getting the desktop:** `getDesktop()` (exported from `assets/iconostat/index.js`) is the entry point — call it to get the singleton `<iconostat-desktop>` element, then call any method below on the returned instance:

```js
import { getDesktop } from 'iconostat/index.js';

const desktop = getDesktop();
desktop.createWindow({ name: 'foo', title: 'Foo', icon: '🧪' });
```

`getDesktop()` is equivalent to `document.querySelector('iconostat-desktop')` (that's its entire implementation) — a page needs exactly one `<iconostat-desktop>` element present in the document (e.g. `<iconostat-desktop></iconostat-desktop>` in the body) for it to resolve.

All methods below are defined in `assets/iconostat/desktop.js`:

| Method | Effect |
|---|---|
| `createWindow({ name, title, icon, classes })` | Creates an `<iconostat-window>`, sets `name`/`windowTitle`/`icon`, appends any `classes`, appends it to `document.body`, registers it with the desktop, and returns the element. Callers set content separately via `setContent()`. |
| `cascade()` | Un-minimizes and resets/cascades all registered windows, bringing each to front in order. |
| `tile()` | Arranges all registered windows in a grid sized to the viewport. |
| `minimizeAll()` | Minimizes every registered window that isn't already minimized. |
| `getTop()` | Returns the topmost (highest z-index) registered window, or `undefined` if none. |
| `register(el)` | Adds a window element to the registry. |
| `unregister(el)` | Removes a window element from the registry and calls `promoteTop()`. |
| `bringToFront(el, changeHash = true)` | Raises `el` above all other registered windows. If `changeHash` is `true`, dispatches `iconostat-focused` (for the site-side router to translate into a history transition); pass `false` to suppress that announcement (e.g. image-zoom windows, initial load). |
| `promoteTop()` | Re-focuses the current top window (if not minimized) and dispatches `iconostat-promoted` unconditionally, announcing the resulting state. |
| `windows` (getter) | Returns the live array of registered window elements. |
| `zIndex` (getter) | Returns the desktop's current top-of-stack z-index counter (the same value `bringToFront()` assigns then increments). Public accessor for `<iconostat-menu>` to raise itself above all windows when opening (`getDesktop().zIndex + 1`) — replaces reaching into the private `_z` field. |
| `fxSuppressed` (getter) | Returns `true` whenever history/focus announcements are currently suppressed (during `cascade()`, `tile()`, and the debounced resize/orientation reflow). Public accessor so the fx layer can detect bulk-layout operations (which must never animate) without reaching into the private `_suppressHistory` field. |
| `registerTaskbar(el)` | Registers `el` as the taskbar host; called by `<iconostat-taskbar>` on its own `connectedCallback`. Not normally called by consumers directly. |
| `taskbar` (getter) | Returns the registered taskbar element (via `registerTaskbar()`), falling back to `document.getElementById('tasks')` if none was registered. `<iconostat-window>.minimize()`/`.reset()` use this to resolve where to relocate a minimized window — see [Taskbar host requirement](#taskbar-host-requirement). |

### Events

All `iconostat-*` events are `CustomEvent`s carrying `detail: { name }` (the window's `name`), except `iconostat-promoted`, whose detail is `{ empty, minimized }`. The library never touches browser history or does site routing — these events are the entire library→site contract for that.

Windows are children of `document.body`, not of `<iconostat-desktop>`; the desktop's own listeners (and any consumer's listeners) must be attached to `document`, not to the `<iconostat-desktop>` element, or they will never fire.

| Event | Dispatched by | Bubbles | `detail` | Meaning |
|---|---|---|---|---|
| `iconostat-focus` | `<iconostat-window>` (`bringToFront()`, and internally on mousedown/touchstart) | yes | `{ name }` | A window requests focus. The desktop's `document`-level listener calls its own `bringToFront(el)` in response. |
| `iconostat-focused` | `<iconostat-desktop>` (`bringToFront()`, only when `changeHash` is true) | dispatched directly on `document` | `{ name }` | Focus has changed — for the site-side router to translate into a history transition. |
| `iconostat-minimize` | `<iconostat-window>` (`minimize()`) | yes | `{ name }` | The window's minimized state changed. Desktop responds with `promoteTop()`. |
| `iconostat-maximize` | `<iconostat-window>` (`maximize()`) | yes | `{ name }` | The window's maximized state changed. Desktop responds with `promoteTop()`. |
| `iconostat-shade` | `<iconostat-window>` (`shade()` / `_toggleShade()`) | yes | `{ name }` | The window's shaded state changed. The desktop takes no action on this event (matches legacy behavior — shading never used to promote the top window). |
| `iconostat-close` | `<iconostat-window>` (`close()`) | yes | `{ name }` | The window requests closing. The desktop unregisters it; actually removing the element from the DOM (and running any consumer cleanup) is a site-glue responsibility (see `assets/js/window.js`). |
| `iconostat-promoted` | `<iconostat-desktop>` (`promoteTop()`) | dispatched directly on `document` | `{ empty, minimized }` | Announces the outcome of the last top-window promotion: `empty` is true if no windows remain registered; `minimized` is true if the (new) top window is minimized. Used by the site-side router to decide between `history.replaceState`/`pushState`. |
| `iconostat-menu-open` | `<iconostat-taskbar>` (start-button `click` handler) | dispatched directly on `document` | `{ x, y, offset }` | Requests that `<iconostat-menu>` open at `(x, y)`; `offset` (boolean) tells the menu to shift left by its own width first (used when opening from a button, so the menu doesn't overhang the viewport edge under the button). Consumed by `<iconostat-menu>`'s `document`-level listener. A right-click anywhere outside `.window-body` opens the menu the same way but *without* this event — `<iconostat-menu>` handles `contextmenu` directly and calls its own positioning logic with `offset: false`. |
| `iconostat-content-loading` | **The host's content loader** (not the library — e.g. `assets/js/window.js`'s `loadHTML()`) | dispatched directly on `document` | none | Announces that a content fetch has started. `<iconostat-desktop>` listens for this on `document` and increments an in-flight load counter, showing its loading spinner while the count is ≥1. |
| `iconostat-content-loaded` | **The host's content loader** (not the library) | dispatched directly on `document` | none | Announces that a content fetch has reached a terminal outcome (success, retries-exhausted, or fetch failure). `<iconostat-desktop>` decrements the in-flight load counter and hides the spinner once it reaches 0. The host must dispatch exactly one `iconostat-content-loaded` per `iconostat-content-loading` (i.e. balance them across every terminal branch of the load, not just the success path) or the spinner sticks. |

### fx seam events

These events exist so an optional effects layer (loaded separately, e.g.
`assets/iconostat/fx/`) can intercept and animate minimize/maximize/drag/resize
without the library depending on it. **With nothing listening, dispatching
these changes nothing** — they're pure seams. All are dispatched on
`document` (not on the window element), like the rest of the table above.

| Event | Cancelable | `detail` | Fired |
|---|---|---|---|
| `iconostat-before-minimize` | yes | `{ name, el, entering, userGesture }` | In `minimize()`, before any DOM mutation (unless called with `{ silent: true }`). `entering` is `true` when the window is about to become minimized, `false` when it's about to be restored. If a listener calls `preventDefault()`, `minimize()` returns immediately without mutating state or dispatching `iconostat-minimize`. |
| `iconostat-before-maximize` | yes | `{ name, el, entering, userGesture }` | Same contract as `iconostat-before-minimize`, in `maximize()`, before the `maximized` class is toggled. |
| `iconostat-drag-start` | no | `{ name, el, x, y }` | In `_startDrag`, before the `move`/`end` listeners attach. `x`/`y` are the pointer's starting client coordinates (mouse and touch paths both fire this). |
| `iconostat-drag-move` | no | `{ name, el, x, y, left, top }` | On every drag move, after the element's `left`/`top` style has been written for that move. `x`/`y` are the pointer's client coordinates; `left`/`top` are the window's resulting `offsetLeft`/`offsetTop`. |
| `iconostat-drag-end` | no | `{ name, el }` | When the drag ends (`mouseup`/`touchend`). |
| `iconostat-resize-start` | no | `{ name, el, x, y }` | In `_startResize`, before the `move`/`end` listeners attach. Mirrors `iconostat-drag-start`. |
| `iconostat-resize-move` | no | `{ name, el, x, y, width, height }` | On every resize move, after the element's `width`/`height` style has been written. `width`/`height` are the window's resulting `offsetWidth`/`offsetHeight`. |
| `iconostat-resize-end` | no | `{ name, el }` | When the resize ends. |
| `iconostat-fx-done` | no | `{ name, effect }` | **Not dispatched by the library.** Reserved for the fx layer itself to announce that an effect (`effect`, e.g. `'genie-minimize'`) has finished and swapped back to the real element. Documented here so both sides agree on the name. |

`userGesture` is `false` whenever the call is programmatic: whenever
`getDesktop().fxSuppressed` is `true` (i.e. during `cascade()`/`tile()`/the
resize reflow), or when the call originates from `bringToFront()`,
`cascade()`, or `tile()` un-minimizing a window on a user's behalf (those
internal calls pass an explicit `{ userGesture: false }`). A direct call —
e.g. the minimize/maximize header-button click handlers, which call
`minimize()`/`maximize()` with no options — computes `userGesture` from
`!getDesktop().fxSuppressed` at call time, which is `true` outside of a bulk
layout operation.

`minimize(force, opts)` and `maximize(force, opts)` accept an options bag:
`opts.silent` skips dispatching the before-event entirely (used by an fx
listener that has already `preventDefault()`ed once and now needs to
re-invoke the real operation — e.g. `el.minimize(true, { silent: true })` —
without re-triggering itself and looping forever); `opts.userGesture`
overrides the default `userGesture` computation described above.

### Site responsibilities

The library owns the menu *mechanism* (open/close/position/z-raise, wired by `<iconostat-menu>`) and the taskbar *host* (relocation target, wired by `<iconostat-taskbar>`) — it does not own their content:

- **Menu items** are plain site-authored child elements of `<iconostat-menu>` (e.g. `<div class="menu-item" onclick="...">`, `<div class="menu-separator">`). `<iconostat-menu>` only wires a close-on-click listener onto whatever `.menu-item` children exist at connect time and applies the `.menu`/`.active` classes it needs for CSS — it has no concept of what a menu item does or navigates to. See `layouts/home.html` for the site's actual item list (page links, `toggleMode()`, `cascadeWindows()`, etc.).
- **The start button** is a site-authored child of `<iconostat-taskbar>` carrying the `.start-button` class; `<iconostat-taskbar>` only looks for that class to wire the click-to-open-menu behavior. Its icon/markup is site content (see `layouts/home.html`).
- **Idle status-bar messages** (the periodic "Status: ..." placeholder text shown after inactivity) and **link-hover status-bar text** (showing the href of a hovered link) are both site-side behaviors — implemented in `assets/js/main.js` (idle messages) and `assets/js/window.js`'s `loadHTML()` (link hover/tooltip wiring), not in the library. The library's `<iconostat-window>` only renders the static `.window-status-bar` element and its default text; it does not update it in response to idle time or link hover.

### Taskbar host requirement

`<iconostat-window>.minimize()` and `.reset()` resolve the relocation target via `getDesktop().taskbar`, which returns the registered `<iconostat-taskbar>` (via `registerTaskbar()`, called automatically by `<iconostat-taskbar>` on connect) or, if none was registered, falls back to `document.getElementById('tasks')`. If a page uses `<iconostat-taskbar>`, this resolves automatically — no site glue required. If a page provides neither an `<iconostat-taskbar>` nor an element with `id="tasks"`, calling `minimize()` still throws (`Cannot read properties of null (reading 'appendChild')`), same failure mode as the prior SP-A boundary, just now avoidable by adding `<iconostat-taskbar>` to the page. The rubber-band selection code in `<iconostat-desktop>` also excludes `.window, .tasks, .menu, .start-button` from selection-drag by class selector; `.tasks`/`.menu` are self-applied by `<iconostat-taskbar>`/`<iconostat-menu>` on connect, and `.start-button` remains a class the host page's start-button markup must carry (see [Site responsibilities](#site-responsibilities)).

The standalone/extractability claim elsewhere in this README holds fully for create / drag / focus / close / maximize / shade / minimize, provided the page includes `<iconostat-taskbar>` (see `layouts/_default/iconostat-fixture.html` + `assets/iconostat-fixture/entry.js` for a working standalone example with no site coupling).

## Theming

`iconostat.css` consumes every color/shadow value through a `--iconostat-*`
custom property with a fallback to the library's built-in default, e.g.:

```css
background-color: var(--iconostat-titlebar-bg, var(--header-bg));
```

A host page can re-theme the library by setting any subset of these
properties (on `:root` or any ancestor of `<iconostat-desktop>`); anything
left unset keeps its literal default. Values must resolve to a CSS
`<color>` (or gradient/shadow-list, where noted).

### Theme-tracking properties

These re-theme live as the host page's light/dark state changes. If your
site toggles a class on `<body>` (rather than only using
`prefers-color-scheme`), **set these on the toggled selector too** — a
custom property declared only once at a distant ancestor does not
re-resolve its `var()` reference per descendant; it inherits the value
computed at the element where it was declared. See `assets/css/style.css`
for the working example (mapped in `:root`, `.toggled`, and inside the
`@media (prefers-color-scheme: light)` block for both).

| Property | Default (falls back to) |
|---|---|
| `--iconostat-titlebar-bg` | `--header-bg` |
| `--iconostat-titlebar-bg-gradient` | `--header-bg-gradient` |
| `--iconostat-titlebar-text` | `--header-text` |
| `--iconostat-border` | `--border` |
| `--iconostat-window-bg` | `--bg` |
| `--iconostat-window-text` | `--text` |
| `--iconostat-tooltip-bg` | `--tooltip-bg` |
| `--iconostat-tooltip-text` | `--tooltip-text` |

### Fixed-variant properties

Used by window-icon/button glow effects that intentionally pin a specific
dark or light value rather than following the active theme. These don't
need `.toggled` duplication since their site-side sources are themselves
declared only once.

| Property | Default (falls back to) |
|---|---|
| `--iconostat-header-bg-dark` | `--header-bg-dark` |
| `--iconostat-header-bg-light` | `--header-bg-light` |
| `--iconostat-bg-dark` | `--bg-dark` |
| `--iconostat-bg-light` | `--bg-light` |
| `--iconostat-tooltip-bg-light` | `--tooltip-bg-light` |

### Theme-independent constants

Traffic-light window-control colors and the symlink accent color. These
never vary with theme, so they're only ever declared once.

| Property | Default (falls back to) |
|---|---|
| `--iconostat-close-bg` | `--close-bg` |
| `--iconostat-close-bg-gradient` | `--close-bg-gradient` |
| `--iconostat-minimize-bg` | `--minimize-bg` |
| `--iconostat-minimize-bg-gradient` | `--minimize-bg-gradient` |
| `--iconostat-maximize-bg` | `--maximize-bg` |
| `--iconostat-maximize-bg-gradient` | `--maximize-bg-gradient` |
| `--iconostat-symlink-color` | `--symlink-color` |

### Spinner and start-button properties

Unlike the properties above, these have no built-in fallback — the library
ships no spinner image and no start-button image of its own. The spinner
element (shown/hidden by the `iconostat-content-loading`/`iconostat-content-loaded`
events, see [Events](#events)) always exists in the DOM, but renders no image
until the host sets `--iconostat-spinner-image`. Likewise, `.start-button`
renders no background image until the host sets `--iconostat-start-button-image`.
This keeps the *mechanism* (spinner count tracking/show/hide/bounce/
follow-cursor behavior; start-button click-to-open-menu wiring) in the
library while the *branding* (which image to show) stays a host concern —
same split as the start-button icon and menu items (see
[Site responsibilities](#site-responsibilities)).

| Property | Default | Meaning |
|---|---|---|
| `--iconostat-spinner-image` | `none` (unset → no spinner rendered) | Host-supplied image (e.g. `url('/start-button.webp')`) shown inside the spinner while a content load is in flight. |
| `--iconostat-spinner-size` | `2.5rem` | Controls the rendered width/height of the spinner (and its image). |
| `--iconostat-start-button-image` | `none` (unset → no start-button image rendered) | Host-supplied image (e.g. `url('/start-button.webp')`) shown as `.start-button`'s background. Mirrors `--iconostat-spinner-image`. |

See `assets/css/style.css`'s `:root` block for the site's setting (it
reuses the already-cached start-button/eye image, so wiring this up costs
no new network request).

## Build / packaging

Point your bundler (or Hugo's `js.Build`) at a **leaf entry module that imports from `iconostat/index.js`** — e.g. the site's `assets/js/main.js` (via `assets/js/window.js`) or the standalone fixture's `assets/iconostat-fixture/entry.js` — never at `assets/iconostat/index.js` itself.

Why: Hugo's `js.Build`, when piped a `resources.Get` resource, feeds that resource's content to esbuild as a **stdin** virtual module, which gets a distinct module identity from the same file reached via a real on-disk relative import. `assets/iconostat/window.js` legitimately imports back from `./index.js` (for `getDesktop()`). If `index.js` is itself the `js.Build` entry, esbuild ends up bundling it twice — once as the stdin entry, once as the disk-resolved import reached through `window.js` — and the two copies' `customElements.define()` calls race the still-uninitialized class binding from the other copy, throwing `Failed to execute 'define' on 'CustomElementRegistry': parameter 2 is not of type 'Function'` (a temporal-dead-zone crash). This is specific to Hugo's stdin-piping of `js.Build` entries, not a library defect — bundling `index.js` directly from disk with plain `esbuild --bundle` works fine, as does loading it natively via `<script type="module" src=".../index.js">` (ES module loading is single-instance per URL). See `assets/iconostat-fixture/entry.js` and `.superpowers/sdd/2026-08-04-iconostat-core/task-6-report.md` for the verified repro/fix.
