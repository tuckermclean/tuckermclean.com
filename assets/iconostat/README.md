# Iconostat

Native Web Components window manager. Extractable, framework-free, no bundler.

## Elements
- `<iconostat-desktop>` — root; owns window registry, z-order, focus, rubber-band selection, resize reflow.
- `<iconostat-window>` — draggable/resizable/minimizable/maximizable/shadeable window.

## Public API
_Documented as the library grows (see SP-A plan). Elements, methods, events, and `--iconostat-*` theming properties land in Tasks 3–8._

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
