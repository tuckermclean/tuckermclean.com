# Iconostat FX — Orchestration Brief / Spec (user-authored)

**Date:** 2026-08-11
**Branch:** `feature/nice-phoenix`
**Status:** Approved (user-authored design; "decisions already made — don't relitigate").
**Execution:** subagent-driven, dependency order A → (B,E) → (C,D) → F, one agent at a time with adversarial review + acceptance-gated. Whole feature merges+deploys ONCE after Agent F QA + final review + deterministic green.

---

Add OS X–style genie minimize/restore/maximize and Compiz-style wobbly windows to the
Iconostat window manager (`assets/iconostat/`), with graceful degradation:
Tier 2 (WebGL mesh) → Tier 1 (affine CSS/WAAPI "jelly-adjacent") → Tier 0 (unadorned).
Targets desktop and mobile.

## Ground rules (from the existing codebase — do not violate)
- **Framework-free, no bundler.** Everything is plain ES modules loaded directly.
  New code lives in `assets/iconostat/fx/` and is loaded via dynamic `import()` on
  first use so pages that never animate pay zero cost. Any snapshot dependency must
  be vendored as a single ESM file or hand-rolled (~200 lines: SVG foreignObject
  serializer).
- **Coordination is CustomEvents at `document` level only.** Windows are children of
  `document.body`, not of `<iconostat-desktop>` (it renders `display:contents`).
  The fx layer must never import site code and never wrap/reparent windows —
  existing e2e assertions use the `body > #window-X` child combinator.
- **`minimize()` reparents the element** (`document.body` → taskbar and back). The
  minimized chip in the taskbar IS the window element (~5rem icon chip, see
  `.window.minimized` in iconostat.css). Consequences: snapshot before minimize;
  the genie target rect = the element's own rect after reparent; iframes already
  reload on reparent today (pre-existing behavior, not a regression to fix).
- **Bulk ops un-minimize programmatically.** `bringToFront()` calls
  `minimize(false)`; `cascade()`/`tile()` loop it; window resize fires
  `cascade({keepMinimized:true})` on a 300ms debounce. `desktop._suppressHistory`
  is `true` during cascade/tile. Effects must run only for direct user gestures and
  must hard-cancel (jump-cut to end state) when a bulk op or viewport resize begins.
- **Reuse the double-buffer pattern.** `createWindow` uses a `building` class
  (`visibility:hidden`) to position-then-reveal. Effects use the same idea via a
  new `fx-ghost` class.
- **State classes use `!important` geometry** (`.maximized`, `.minimized`). All rect
  measurement must be `getBoundingClientRect()` after class application, never
  computed from style properties.
- **Mobile:** touch handled via duplicated `touchstart`/`touchmove` paths using
  `e.touches[0]`; breakpoint is `window.innerWidth <= 768`. Do not migrate to
  Pointer Events in this project — consume the new drag events instead.

## Frozen contracts (write these first; all agents build against them)
### New library events (added by Agent A)
| Event | Cancelable | Detail | Fired |
|---|---|---|---|
| `iconostat-before-minimize` | yes | `{ name, el, entering: bool, userGesture: bool }` | before any DOM mutation in `minimize()` |
| `iconostat-before-maximize` | yes | `{ name, el, entering: bool, userGesture: bool }` | before class toggle in `maximize()` |
| `iconostat-drag-start` | no | `{ name, el, x, y }` | in `_startDrag` before listeners attach |
| `iconostat-drag-move` | no | `{ name, el, x, y, left, top }` | each move, after style write |
| `iconostat-drag-end` | no | `{ name, el }` | on stopDrag |
| `iconostat-fx-done` | no | `{ name, effect }` | by fx layer after swap-back |

`userGesture` is `false` whenever `getDesktop()._suppressHistory` is true or the
call originated from `bringToFront`/`cascade`/`tile`/`reset` (thread a flag through
those internal `minimize(false)` calls). If `preventDefault()` is called on a
before-event, the library method returns without mutating; the canceler is
responsible for later invoking the real operation via `el.minimize(force, { silent: true })`
(a new options bag that skips re-dispatching the before-event).

### Effect controller interface (`fx/controller.js`)
```js
FxController.init(desktop, { tierOverride? })   // capability probe, wires listeners
FxController.tier                                // 0 | 1 | 2 (session tier)
FxController.tierFor(win)                        // per-window demotion (iframes, taint)
FxController.cancelAll(jumpToEnd = true)         // called on cascade/tile/resize/close
```
Every animation path MUST restore `visibility` and remove `fx-ghost` in a
`finally` — a window may never be left stranded hidden.

### CSS / DOM contract
- `iconostat-window.fx-ghost { visibility: hidden !important; }` (in a new
  `fx/fx.css`, linked by the site, or injected by controller.js).
- One shared `<canvas id="iconostat-fx-canvas">` appended to `document.body`
  (sibling of windows), `position:fixed; inset:0; pointer-events:none;`
  `z-index` set to `getDesktop().zIndex + 10` at each effect start (menu uses
  `zIndex + 1`; fx sits above menu only while animating, canvas is
  display:none when idle).
- User setting: `localStorage['iconostat-fx-tier']` = `'auto' | '2' | '1' | '0'`.
  `prefers-reduced-motion: reduce` forces Tier 0 unconditionally, overriding
  the stored setting.

### File layout
```
assets/iconostat/fx/
  controller.js    // tier selection, event wiring, cancellation, public API
  snapshot.js      // foreignObject serializer + <video>/<canvas> compositing + taint detection
  compositor.js    // shared WebGL2 canvas, textured mesh renderer, swap protocol
  genie.js         // Bézier funnel + row-pour choreography (min/restore/max)
  wobble.js        // spring-mass grid sim + drag feed + settle detection
  tier1.js         // WAAPI affine fallbacks (scale-to-chip, velocity skew jelly)
  fx.css
```

---

## Subagents

### Agent A — Library seams (upstream changes; CRITICAL PATH, runs first, alone)
**Files:** `window.js`, `desktop.js`, `README.md`.
**Tasks:**
1. Add the six events per the contract table, including the `userGesture` threading
   through `bringToFront`/`cascade`/`tile`/`reset` and the `{ silent }` options bag
   on `minimize`/`maximize`.
2. Dispatch `iconostat-drag-*` from `_startDrag` (both mouse and touch paths) and,
   analogously, `iconostat-resize-*` from `_startResize` (wobble on resize is a
   stretch goal but the events are cheap now).
3. Expose `desktop.fxSuppressed` getter (true during cascade/tile/reflow) so the fx
   layer doesn't poke `_suppressHistory`.
4. Update README event table.
**Acceptance:** with no fx module loaded, behavior is byte-identical to today
(events dispatched but unconsumed); all existing e2e assertions pass; a
`preventDefault()`ed before-minimize leaves the DOM untouched; `cascade()` during a
canceled minimize does not deadlock.

### Agent B — Compositor core (`snapshot.js`, `compositor.js`)
Starts after Agent A's contract lands (can begin against the frozen spec in parallel
with A's implementation).
**Tasks:**
1. `snapshot(el, {dprCap}) → {texture, width, height} | throws SnapshotError`.
   foreignObject serialization; inline computed styles for the window chrome;
   composite `<video>`/`<canvas>` descendants via `drawImage` at their rects;
   detect cross-origin iframes and canvas taint up front and throw a typed error
   (controller demotes that window to Tier 1). DPR cap: `min(devicePixelRatio, 2)`
   desktop, `1.5` mobile.
2. Shared WebGL2 canvas lifecycle: lazy create, `display:none` when idle,
   `webglcontextlost` handler that calls `FxController.cancelAll(true)`.
3. Mesh renderer: N×M grid, texture-mapped, per-vertex positions supplied by the
   effect each frame; premultiplied alpha; correct compositing over the page.
4. Warmup probe: render an offscreen 8×40 mesh ~10 frames at init; median frame
   time > 8ms → report "demote to Tier 1".
5. Swap protocol helpers: `beginEffect(el)` (snapshot → add `fx-ghost` → show
   canvas), `endEffect(el)` (`finally`: remove `fx-ghost`, hide canvas, drop
   texture).
**Acceptance:** snapshot of a window with an `<img>` (same-origin), a `<video>`,
and text renders visually indistinguishable at rest; cross-origin iframe window
throws typed error without side effects; simulated context loss mid-frame leaves
all windows visible in end state.

### Agent C — Genie (`genie.js`) — parallel with D after B's mesh API exists
**Tasks:**
1. Choreography for minimize: on user-gesture `iconostat-before-minimize`
   (entering), `preventDefault()`; `beginEffect`; call `minimize(true, {silent:true})`
   while `fx-ghost` (element reparents to taskbar hidden); measure chip rect;
   animate; `endEffect`; dispatch `iconostat-fx-done`. Restore is the mirror
   (measure chip rect first, restore hidden, measure final rect, animate reversed).
   Maximize/unmaximize: same pattern, no reparent, rect→rect.
2. Mesh warp: 8 cols × 40 rows. Phase 1 (t 0→0.4): left/right silhouette edges
   interpolate toward cubic Béziers converging on the chip rect. Phase 2
   (t 0.3→1.0, overlapping): per-row travel with bottom-rows-first delay
   (the "pour"). Ease-in on minimize, ease-out on restore; 400ms desktop,
   320ms mobile. Maximize uses the same field with 150ms and softer curvature.
3. Cancellation: click on the chip mid-minimize reverses the animation from
   current t (do not restart); `cancelAll` jump-cuts.
**Acceptance:** minimize/restore round-trip returns the window to exact saved
geometry and focus (`front` class + z-index) matches non-fx behavior; resize during
genie jump-cuts then cascades normally; taskbar chip is never visible before the
animation lands on it.

### Agent D — Wobble (`wobble.js`) — parallel with C
**Tasks:**
1. Consume `iconostat-drag-start/move/end`. On start (Tier 2): `beginEffect`;
   6×6 control grid, structural + shear springs, semi-implicit Euler, fixed
   120Hz step with accumulator + render interpolation; grabbed point pinned to
   pointer offset; damping ~0.93/step. Element position keeps being written by
   `_startDrag` (it's hidden); the grid's rest pose tracks `left/top` from
   `iconostat-drag-move`.
2. On drag-end: springs settle toward rest rect; when kinetic energy < ε,
   `endEffect`.
3. Impact wobble: on maximize completion and (stretch) shade toggle, inject
   velocity impulse for a ~250ms residual jiggle.
4. Re-snapshot throttle (250ms) only if the window contains `<video>`.
5. Mobile: 4×4 control grid, DPR 1.5 cap, skip impact wobble.
**Acceptance:** 60fps sustained on a mid-tier phone with one wobbling window
(measure via warmup-probe harness); no visible pop at drag-start or settle;
starting a drag during a settling wobble inherits current mesh state; drag during
an in-flight genie is refused (genie wins, drag proceeds unanimated).

### Agent E — Tiers & fallbacks (`controller.js`, `tier1.js`, `fx.css`) — parallel with B
Tier 1 has zero WebGL dependencies, so this agent starts immediately after Agent A.
**Tasks:**
1. Tier selection: `prefers-reduced-motion` → 0; stored setting; else WebGL2 probe
   + Agent B's warmup verdict → 2, fallback 1. Per-window demotion registry fed by
   SnapshotError.
2. Tier 1 minimize/restore: WAAPI `transform: translate(...) scale(...) skewY(4deg)`
   toward/from the chip rect with opacity fade, 250ms — animate the real element
   (no snapshot), sequenced around the reparent the same way as genie (animate a
   `position:fixed` clone? No — clone violates nothing but adds cost; instead
   animate pre-reparent, then reparent at animation end). Tier 1 wobble: velocity-
   tracked `skew(vx·k) scale(1±vy·k)` on the real element during drag, critically
   damped spring back to identity on release.
3. Tier 0: no-op passthrough (never intercept before-events).
4. Public API + docs: `Iconostat.fx.setTier()`, README section, and wiring example
   for the site's menu ("Effects: Full / Lite / Off" menu items are site-authored,
   per the menu architecture).
5. Cancellation wiring: listen for resize/orientationchange and
   `desktop.fxSuppressed` transitions → `cancelAll(true)`.
**Acceptance:** with WebGL blocked (devtools), Tier 1 engages automatically and
every gesture still completes; with `prefers-reduced-motion`, zero fx code paths
run and no canvas is ever created; toggling tier mid-session takes effect on the
next gesture without reload.

### Agent F — Integration & QA (last; owns the merge)
**Tasks:**
1. E2E: extend the existing suite (keep `body > #window-X` assertions green).
   Cancellation matrix: {resize, cascade, tile, close, second gesture on same
   window, chip click mid-minimize} × {genie-min, genie-restore, maximize, wobble,
   tier1 variants}. Assert post-condition = exact non-fx end state, no `fx-ghost`
   residue, canvas hidden.
2. Cross-origin iframe window fixture → asserts silent per-window Tier 1 demotion.
3. Mobile viewport runs (≤768px): touch drag wobble, orientationchange mid-genie.
4. Context-loss injection test.
5. Perf budget check in CI: warmup probe timings recorded; fail if Tier 2 median
   frame > 8ms on the reference runner.
**Acceptance:** full suite green; `git diff` on non-fx files limited to Agent A's
seams; README documents the entire fx surface.

## Dependency graph / schedule
```
A (seams) ──────────────┬────────────► C (genie) ─┐
   │                    B (compositor)─► D (wobble)├─► F (QA/merge)
   └──► E (tiers/tier1) ────────────────────────────┘
```
A alone first (it touches shared files — no parallel edits to window.js/desktop.js).
Then B and E in parallel. C and D in parallel once B's mesh + swap API is stubbed.
F continuously reviews, owns final integration.

## Decisions already made (don't relitigate)
- Snapshot-and-warp architecture; real DOM never mesh-deformed.
- One shared canvas, not per-window.
- Genie target = the window's own minimized chip rect (reparenting makes this free).
- Bulk ops (cascade/tile/reflow/programmatic `minimize(false)`) never animate.
- `finally`-guaranteed reveal is a hard invariant everywhere.
- Shade stays instant in v1 (impact-wobble on shade is a stretch goal only).
