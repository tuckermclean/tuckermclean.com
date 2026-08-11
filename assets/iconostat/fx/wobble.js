// Iconostat FX -- Tier-2 "wobble": Compiz-style spring-mass jelly windows for
// drag (and, opportunistically, a maximize-completion impact jiggle) over the
// shared WebGL2 compositor (compositor.js, Agent B). See the C/D contract in
// compositor.js's file banner (mandatory reading before this file) and the
// Agent D section of docs/superpowers/specs/2026-08-11-iconostat-fx-design.md.
//
// Imports ONLY `./controller.js` (for the `FxController` singleton -- used by
// the module-level `iconostat-fx-done` listener that drives the maximize
// impact wobble, see below) and, statically, `./snapshot.js` (for the
// video-in-window re-snapshot throttle -- same sanctioned use as genie.js's
// restore pre-flight check; see compositor.js's banner: "snapshot `el` again
// yourself (`import('./snapshot.js')`)"). `compositor` itself is NEVER
// statically imported -- controller.js hands it to `dragStart`/`dragMove`/
// `dragEnd` as an argument each call, per the exact C/D contract signature;
// see "-- Impact wobble: compositor caching --" below for how the
// maximize-impact listener (which has no such call-site argument) gets a
// reference. Zero site code, zero library code, no new deps.
//
// -- The physics model ----------------------------------------------------
// A `cols x rows` grid of point masses (6x6 desktop, 4x4 mobile -- see
// `gridDims()`), one mass per mesh vertex, simulated with:
//   - An ANCHOR spring per point, pulling it toward its REST position (the
//     fractional (col/(cols-1), row/(rows-1)) point of the window's CURRENT
//     `left/top/width/height` rect -- `width/height` are fixed for an
//     effect's lifetime (the snapshot's dimensions; the library never
//     resizes a window mid-drag), `left/top` are refreshed every
//     `iconostat-drag-move` so "the grid's rest pose tracks left/top" per
//     the spec). This is what keeps the mesh from drifting away from the
//     window's real on-screen position and pulls it back to a perfect flat
//     grid once settled.
//   - STRUCTURAL springs between each point and its 4 orthogonal neighbors
//     (left/right/up/down) and SHEAR springs between each point and its 4
//     diagonal neighbors -- both are "grid lattice" springs (Hookean in the
//     REST OFFSET VECTOR between two points, not just distance -- see
//     `buildSprings()`/`stepPhysics()`), which is what produces the jelly
//     deformation as one point (the grabbed one) is dragged away from its
//     neighbors.
//   - The GRABBED point (nearest grid vertex to the pointer at drag-start,
//     `nearestIndex()`) is PINNED directly to the pointer offset while
//     `phase === 'dragging'`: its simulated position is force-set every
//     fixed step (bypassing spring/integration math for that one point),
//     dragging the rest of the mesh along via the springs above -- "grabbed
//     control point pinned to the pointer offset" per the spec.
//   - Integration is semi-implicit (symplectic) Euler at a FIXED 120Hz
//     timestep (`FIXED_DT`): `v = (v + a*dt) * DAMPING; x = x + v*dt` (mass
//     is uniform/1, so `a === F`). `DAMPING` is applied as a flat per-step
//     multiplier (not a continuous viscous force term) -- see the "Tunable
//     constants" section below for why its shipped value (and the anchor/
//     structural/shear balance) differs from the spec's illustrative
//     "damping ~0.93/step" figure.
//   - The render loop runs on `requestAnimationFrame` (variable-rate,
//     display-synced) and DECOUPLES from the fixed-rate sim via a time
//     accumulator: each rAF tick adds the real elapsed ms to `accumulatorMs`
//     and drains it in whole `FIXED_DT` steps (capped at
//     `MAX_STEPS_PER_FRAME` per tick so a backgrounded-tab wakeup can't spin
//     forever trying to "catch up"), then RENDER-INTERPOLATES between the
//     positions before and after that drain (`alpha = accumulatorMs /
//     FIXED_DT`) for the frame actually handed to `drawMesh()` -- this is
//     what "fixed 120Hz step with an accumulator + render interpolation"
//     means: the physics always advances in identical, reproducible steps
//     regardless of the display's actual refresh rate, and the leftover
//     fractional step is smoothed away visually rather than causing judder.
//
// -- Settle + the max-duration cap (hard invariant) ------------------------
// On drag-end, `phase` flips to `'settling'`: the pin releases (the grabbed
// point becomes a normal spring-connected point again, its rest position
// following the window's FINAL `left/top`) and every subsequent tick checks
// TWO independent conditions, either of which ends the effect:
//   1. Kinetic energy (`kineticEnergy(vel)`, sum of squared velocities over
//      every point) drops below `SETTLE_EPSILON` -- the mesh has visually
//      stopped moving.
//   2. Wall-clock time since settling began exceeds `SETTLE_MAX_DURATION_MS`
//      (~2s) -- a HARD cap, independent of the physics ever actually
//      converging. This is what upholds "a wobble that never numerically
//      settles must still terminate" -- a window can never be stranded
//      hidden by a non-converging sim, no matter how the spring constants
//      or a pathological drag trajectory interact. `__testTuning()` (bottom
//      of this file, mirrors compositor.js's `warmup({forceVerdict})`
//      test-only seam) lets a test force `epsilon` to an unreachable value
//      (e.g. `-1`, since kinetic energy is never negative) to deterministically
//      exercise this cap without depending on a genuinely-non-convergent set
//      of physics constants.
// Either path converges on the SAME `finishSettle()`: `endEffect(el)` +
// `iconostat-fx-done` `{name, effect:'wobble'}`, called from a path that
// always runs (natural settle, cap, or the registered `cancelFn` -- see
// below) -- the finally-guaranteed-reveal invariant.
//
// -- Inherit-on-re-drag vs. genie-refusal -----------------------------------
// `dragStart` checks `controller._inFlight.get(el)` BEFORE touching
// anything:
//   - Absent, or present with `name === 'wobble'` (OUR OWN still-settling
//     effect from a moments-ago drag-end): proceed. If it's our own, REUSE
//     the existing `dragState` entry (same simPos/vel/texture -- no
//     `beginEffect`, no fresh `registerEffect` call) and just flip `phase`
//     back to `'dragging'` with a freshly computed pin -- "starting a drag
//     during a settling wobble inherits current mesh state (no pop)".
//   - Present with any OTHER name (in practice: `'genie'`, a minimize/
//     maximize choreography currently animating this same `el`) -- REFUSE:
//     return without `beginEffect`/`registerEffect`. The library still moves
//     the real element (its own `_startDrag`/`onMove` keep writing
//     `left/top` regardless of what fx does), so the drag itself still
//     "works", it's simply unanimated -- exactly "drag during an in-flight
//     genie is refused (genie wins, drag proceeds unanimated)". Since no
//     `dragState` entry gets set in this case, the matching `dragMove`/
//     `dragEnd` calls for this gesture harmlessly no-op via their own
//     `if (!state) return` tolerance (tier1.js's pattern).
//
// -- No state leak (WeakMap identity guard, tier1.js's pattern) ------------
// `dragState` is a `WeakMap<el, state>`. Every closure that can fire
// asynchronously/later (the registered `cancelFn`, the rAF `tick`, the
// video-re-snapshot promise continuation) re-checks `dragState.get(el) ===
// state` (the exact object it captured, not just "some state exists")
// before mutating/deleting -- so a stale closure from a superseded drag (a
// fresh `dragStart` published a NEW state object for the same `el` while the
// old one's async work was still in flight) can never corrupt or unregister
// state it no longer owns. Exactly tier1.js's documented re-drag-bug fix,
// applied here.
//
// -- Impact wobble: compositor caching -------------------------------------
// `dragStart`/`dragMove`/`dragEnd` each receive a live `compositor` module
// reference as their 2nd argument (per the frozen C/D contract) -- this file
// caches the FIRST one it ever sees (`cachedCompositor`, below) purely so
// the maximize-impact listener (a plain `document.addEventListener
// ('iconostat-fx-done', ...)`, wired once at module-eval time -- there is no
// call site that "passes in" a compositor for an event listener) has one
// available. Since wobble.js itself is only ever dynamically imported by
// controller.js's `_onDrag` (never by `_runEffect`, the minimize/maximize
// path -- that only loads `./genie.js`), `cachedCompositor` is `null` until
// the FIRST Tier-2 drag of the session, and the impact-wobble listener is a
// silent no-op before that point. This is a deliberate, documented tradeoff
// (not a bug): a session that maximizes a window before ever dragging one
// simply doesn't get the residual-jiggle flourish for that first maximize;
// every functional/hard-invariant guarantee (the maximize itself, via
// genie.js/tier1.js, completes correctly either way) is entirely unaffected
// -- impact wobble is decorative only. Flagged in the task report per the
// brief's "report impact-wobble as deferred [if entangled]" guidance --
// this isn't full entanglement (it doesn't destabilize the core drag path
// at all), just a narrower activation window than a hypothetical
// controller.js change (out of scope -- Do Not Edit) could give it.

import { snapshot } from './snapshot.js';
import { FxController } from './controller.js';

// -- Tunable constants ------------------------------------------------------

const COLS_DESKTOP = 6;
const ROWS_DESKTOP = 6;
const COLS_MOBILE = 4;
const ROWS_MOBILE = 4;
const MOBILE_BREAKPOINT = 768;

const FIXED_DT = 1 / 120; // seconds -- "fixed 120Hz step"
const MAX_STEPS_PER_FRAME = 8; // spiral-of-death guard (backgrounded-tab wakeup, slow device)

// Tuned empirically (see the task report) against the settle+max-duration-cap
// hard invariant, not lifted directly from the spec's illustrative "damping
// ~0.93/step": a 6x6 lattice's BULK/low-frequency modes (many points
// displaced together, e.g. the whole mesh trailing a fast drag) decay far
// slower in absolute wall-clock time under a fixed per-step velocity
// multiplier than a single isolated point would -- damping only bites
// during a mode's "moving" (kinetic) phase, and a slow bulk mode simply
// completes far fewer such phases per second than a fast one. At
// DAMPING=0.93 even a drastically stiffened anchor spring still took ~1.6s+
// (measured) to cross a sane settle threshold for a typical 150px drag --
// uncomfortably close to (and, for larger/faster drags, past) the 2s cap,
// meaning most ordinary drags would end up terminating via the hard cap
// rather than a natural settle. Making the per-point ANCHOR spring
// dominant over the inter-point STRUCTURAL/SHEAR lattice springs (instead
// of raising DAMPING further, which barely helped -- see the report) gives
// each point a high individual natural frequency (so damping "bites" it
// often) while the comparatively weak lattice springs still produce a
// clearly visible jelly lag between neighbors during a drag. This
// combination settles a full-size (150px) drag in ~500ms (~60 fixed
// steps) -- a comfortable ~4x margin under `SETTLE_MAX_DURATION_MS`,
// verified in tests/unit/wobble.test.js and tests/e2e/fx-tier2-wobble.spec.js.
const K_STRUCT = 20; // structural (orthogonal-neighbor) lattice spring constant -- local jelly coupling
const K_SHEAR = 8; // shear (diagonal-neighbor) lattice spring constant -- local jelly coupling
const K_ANCHOR = 300; // per-point spring back to the window-rect rest position -- dominant, keeps settle fast
const DAMPING = 0.8; // flat per-fixed-step velocity multiplier

const SETTLE_EPSILON = 30; // kinetic energy (sum of v^2, px/s units) below which the mesh is "at rest"
const SETTLE_MAX_DURATION_MS = 2000; // hard cap -- see file banner
const IMPACT_MAX_DURATION_MS = 900; // impact wobble's own (shorter) hard cap -- ~250ms is the natural-settle target

const VIDEO_THROTTLE_MS = 250;

// -- Pure math (exported for direct unit testing; see tests/unit/wobble.test.js) --

export function mobileViewport() {
    return typeof window !== 'undefined' && window.innerWidth <= MOBILE_BREAKPOINT;
}

// Grid resolution per the spec: 6x6 desktop, 4x4 mobile.
export function gridDims() {
    return mobileViewport() ? { cols: COLS_MOBILE, rows: ROWS_MOBILE } : { cols: COLS_DESKTOP, rows: ROWS_DESKTOP };
}

// Row-major fractional grid, matching compositor.js's own UV convention
// (c/(cols-1), r/(rows-1)) exactly -- so the mesh's rest pose lines up with
// the texture's rest UVs with no separate "pinch" bookkeeping needed.
function fracOf(cols, rows) {
    const fx = new Float32Array(cols);
    const fy = new Float32Array(rows);
    for (let c = 0; c < cols; c++) fx[c] = cols > 1 ? c / (cols - 1) : 0;
    for (let r = 0; r < rows; r++) fy[r] = rows > 1 ? r / (rows - 1) : 0;
    return { fx, fy };
}

// Interleaved [x0,y0, x1,y1, ...] rest-pose grid for a given window rect --
// exactly `drawMesh`'s expected positions shape. `left`/`top` are the only
// values that change frame-to-frame during a drag (`width`/`height` are
// fixed at the snapshot's dimensions for the effect's whole lifetime).
export function restGrid(cols, rows, left, top, width, height) {
    const { fx, fy } = fracOf(cols, rows);
    const out = new Float32Array(cols * rows * 2);
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const i = (r * cols + c) * 2;
            out[i] = left + fx[c] * width;
            out[i + 1] = top + fy[r] * height;
        }
    }
    return out;
}

// Index of the grid vertex nearest a viewport-px point (px, py) within the
// rect (left, top, width, height) -- used to pick the "grabbed" point at
// drag-start (and on every inherited re-drag).
export function nearestIndex(px, py, left, top, width, height, cols, rows) {
    const cf = width > 0 ? clamp01((px - left) / width) : 0;
    const rf = height > 0 ? clamp01((py - top) / height) : 0;
    const c = Math.round(cf * (cols - 1));
    const r = Math.round(rf * (rows - 1));
    return r * cols + c;
}

function clamp01(v) { return Math.max(0, Math.min(1, v)); }

// Every unique lattice edge, once each, as [i, j] index pairs -- structural
// = orthogonal neighbors (right, down -- left/up are the SAME edges visited
// from the other endpoint, so only two directions are needed to cover every
// edge exactly once), shear = diagonal neighbors (down-right, down-left).
export function buildSprings(cols, rows) {
    const structural = [];
    const shear = [];
    const idx = (c, r) => r * cols + c;
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const i = idx(c, r);
            if (c + 1 < cols) structural.push([i, idx(c + 1, r)]);
            if (r + 1 < rows) structural.push([i, idx(c, r + 1)]);
            if (c + 1 < cols && r + 1 < rows) shear.push([i, idx(c + 1, r + 1)]);
            if (c - 1 >= 0 && r + 1 < rows) shear.push([i, idx(c - 1, r + 1)]);
        }
    }
    return { structural, shear };
}

export function kineticEnergy(vel) {
    let ke = 0;
    for (let i = 0; i < vel.length; i++) ke += vel[i] * vel[i];
    return ke;
}

// Mutates `simPos`/`vel` in place, one fixed step. `springs` is
// `buildSprings()`'s output; `restPos` is the CURRENT rest grid
// (`restGrid()`'s output, refreshed by the caller whenever `left/top`
// change); `pinnedIndex` (or -1 for none) forces that one vertex's position
// directly to `(pinnedX, pinnedY)` with zero velocity, bypassing the
// spring/integration math for it (see file banner). Pure function of its
// arguments otherwise -- no DOM, no globals -- so it's directly unit
// testable without jsdom.
export function stepPhysics({ simPos, vel, restPos, springs, pinnedIndex = -1, pinnedX = 0, pinnedY = 0 }) {
    const n = simPos.length / 2;
    const fx = new Float64Array(n);
    const fy = new Float64Array(n);

    for (let i = 0; i < n; i++) {
        if (i === pinnedIndex) continue;
        fx[i] += K_ANCHOR * (restPos[i * 2] - simPos[i * 2]);
        fy[i] += K_ANCHOR * (restPos[i * 2 + 1] - simPos[i * 2 + 1]);
    }

    applySpringForces(springs.structural, K_STRUCT, simPos, restPos, fx, fy);
    applySpringForces(springs.shear, K_SHEAR, simPos, restPos, fx, fy);

    for (let i = 0; i < n; i++) {
        if (i === pinnedIndex) continue;
        const vx = (vel[i * 2] + fx[i] * FIXED_DT) * DAMPING;
        const vy = (vel[i * 2 + 1] + fy[i] * FIXED_DT) * DAMPING;
        vel[i * 2] = vx;
        vel[i * 2 + 1] = vy;
        simPos[i * 2] += vx * FIXED_DT;
        simPos[i * 2 + 1] += vy * FIXED_DT;
    }

    if (pinnedIndex >= 0) {
        simPos[pinnedIndex * 2] = pinnedX;
        simPos[pinnedIndex * 2 + 1] = pinnedY;
        vel[pinnedIndex * 2] = 0;
        vel[pinnedIndex * 2 + 1] = 0;
    }
}

// Applies equal-and-opposite "grid lattice" spring forces (Hookean in the
// REST OFFSET VECTOR between the two endpoints, not raw distance -- see file
// banner) for every [i, j] pair in `pairs`, accumulating into `fx`/`fy`.
// Forces are still applied to a PINNED endpoint here (it gets overwritten by
// the direct pin-assignment afterward regardless) -- this keeps the loop
// branch-free and matches how `stepPhysics` already skips integrating a
// pinned point's own force sum uselessly (the accumulation itself is cheap
// and harmless either way).
function applySpringForces(pairs, k, simPos, restPos, fx, fy) {
    for (let p = 0; p < pairs.length; p++) {
        const [i, j] = pairs[p];
        const restDx = restPos[j * 2] - restPos[i * 2];
        const restDy = restPos[j * 2 + 1] - restPos[i * 2 + 1];
        const curDx = simPos[j * 2] - simPos[i * 2];
        const curDy = simPos[j * 2 + 1] - simPos[i * 2 + 1];
        const errX = k * (curDx - restDx);
        const errY = k * (curDy - restDy);
        fx[i] += errX; fy[i] += errY;
        fx[j] -= errX; fy[j] -= errY;
    }
}

function lerpPositions(prev, cur, alpha, out) {
    for (let i = 0; i < cur.length; i++) out[i] = prev[i] + (cur[i] - prev[i]) * alpha;
    return out;
}

// -- Test-only tuning seam (mirrors compositor.js's `warmup({forceVerdict})`) --
// Lets a test force the settle epsilon unreachable (e.g. `-1`, since kinetic
// energy is never negative) to deterministically exercise the max-duration
// cap without depending on a genuinely-non-convergent set of physics
// constants, or shrink the max-duration cap(s) so a cap-path test doesn't
// need to wait out the real ~2s/900ms ceiling. Never used by production code
// -- only by tests/e2e/fx-tier2-wobble.spec.js.
let settleEpsilonOverride = null;
let settleMaxDurationOverride = null;
let impactMaxDurationOverride = null;
export function __testTuning({ epsilon, settleMaxDurationMs, impactMaxDurationMs } = {}) {
    settleEpsilonOverride = typeof epsilon === 'number' ? epsilon : null;
    settleMaxDurationOverride = typeof settleMaxDurationMs === 'number' ? settleMaxDurationMs : null;
    impactMaxDurationOverride = typeof impactMaxDurationMs === 'number' ? impactMaxDurationMs : null;
}
function currentEpsilon() { return settleEpsilonOverride === null ? SETTLE_EPSILON : settleEpsilonOverride; }
function currentSettleMax() { return settleMaxDurationOverride === null ? SETTLE_MAX_DURATION_MS : settleMaxDurationOverride; }
function currentImpactMax() { return impactMaxDurationOverride === null ? IMPACT_MAX_DURATION_MS : impactMaxDurationOverride; }

// -- DOM / effect-lifecycle integration -------------------------------------

// el -> state. See file banner for the identity-guard discipline every
// closure below follows.
const dragState = new WeakMap();

let cachedCompositor = null; // see file banner's "Impact wobble: compositor caching" section

function rectOf(el) {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
}

function createState({ el, compositor, texture, width, height, rect, pointerX, pointerY }) {
    const { cols, rows } = gridDims();
    const springs = buildSprings(cols, rows);
    const restPos = restGrid(cols, rows, rect.left, rect.top, width, height);
    const simPos = Float32Array.from(restPos);
    const vel = new Float32Array(cols * rows * 2);
    const pinnedIndex = nearestIndex(pointerX, pointerY, rect.left, rect.top, width, height, cols, rows);
    return {
        el, compositor,
        cols, rows, springs,
        width, height, // fixed for the effect's lifetime (snapshot dims)
        restLeft: rect.left, restTop: rect.top,
        restPos, simPos, vel,
        prevPos: Float32Array.from(simPos),
        renderScratch: new Float32Array(simPos.length),
        pinnedIndex, pointerX, pointerY,
        phase: 'dragging', // 'dragging' | 'settling'
        accumulatorMs: 0,
        lastTickMs: null,
        settleDeadlineMs: null,
        rafId: null,
        originalTexture: texture,
        texture,
        videoEl: el.querySelector('video') || null,
        lastVideoSnapshotMs: 0,
        videoSnapshotInFlight: false,
        kind: 'drag', // 'drag' | 'impact' -- impact skips the pin/dragging phase entirely
    };
}

function refreshRestPos(state) {
    state.restPos = restGrid(state.cols, state.rows, state.restLeft, state.restTop, state.width, state.height);
}

function releaseSwappedTexture(state) {
    if (state.texture !== state.originalTexture) {
        state.compositor.releaseTexture(state.texture);
        state.texture = state.originalTexture;
    }
}

function finishAndReveal(state, { dispatch = true } = {}) {
    if (dragState.get(state.el) !== state) return; // superseded -- not ours to clean up (see file banner)
    dragState.delete(state.el);
    FxController.unregisterEffect(state.el);
    releaseSwappedTexture(state);
    state.compositor.endEffect(state.el);
    if (dispatch) {
        document.dispatchEvent(new CustomEvent('iconostat-fx-done', { detail: { name: state.el.name, effect: 'wobble' } }));
    }
}

function scheduleTick(state) {
    state.rafId = requestAnimationFrame((now) => tick(state, now));
}

function tick(state, now) {
    if (dragState.get(state.el) !== state) return; // superseded

    if (state.lastTickMs === null) state.lastTickMs = now;
    const frameDt = Math.min(now - state.lastTickMs, 250); // clamp a huge gap (tab backgrounded) rather than trying to "catch up"
    state.lastTickMs = now;
    state.accumulatorMs += frameDt;

    let steps = 0;
    while (state.accumulatorMs >= FIXED_DT * 1000 && steps < MAX_STEPS_PER_FRAME) {
        state.prevPos.set(state.simPos);
        let pinnedIndex = -1, pinnedX = 0, pinnedY = 0;
        if (state.phase === 'dragging' && state.kind === 'drag') {
            pinnedIndex = state.pinnedIndex;
            pinnedX = state.pointerX + state.pinOffsetX;
            pinnedY = state.pointerY + state.pinOffsetY;
        }
        stepPhysics({
            simPos: state.simPos, vel: state.vel, restPos: state.restPos,
            springs: state.springs, pinnedIndex, pinnedX, pinnedY,
        });
        state.accumulatorMs -= FIXED_DT * 1000;
        steps++;
    }

    const alpha = clamp01(state.accumulatorMs / (FIXED_DT * 1000));
    const rendered = lerpPositions(state.prevPos, state.simPos, alpha, state.renderScratch);
    state.compositor.drawMesh({ texture: state.texture, positions: rendered, cols: state.cols, rows: state.rows, opacity: 1 });

    maybeRefreshVideoTexture(state, now);

    if (state.phase === 'settling') {
        // Two independent settle conditions -- either ends the effect (see
        // file banner): kinetic energy below epsilon (the mesh visually
        // stopped), or the hard wall-clock cap (`settleDeadlineMs`, set once
        // when `phase` became `'settling'` -- drag-end / `runImpactWobble` --
        // to `performance.now() + currentSettleMax()/currentImpactMax()`),
        // independent of whether the physics ever actually converges.
        const ke = kineticEnergy(state.vel);
        if (ke < currentEpsilon() || now >= state.settleDeadlineMs) {
            finishAndReveal(state);
            return;
        }
    }

    scheduleTick(state);
}

function maybeRefreshVideoTexture(state, now) {
    if (!state.videoEl || state.videoSnapshotInFlight) return;
    if (now - state.lastVideoSnapshotMs < VIDEO_THROTTLE_MS) return;
    state.lastVideoSnapshotMs = now;
    state.videoSnapshotInFlight = true;
    snapshot(state.el, { dprCap: undefined })
        .then(({ canvas }) => {
            state.videoSnapshotInFlight = false;
            if (dragState.get(state.el) !== state) return; // superseded mid-snapshot
            const fresh = state.compositor.uploadTexture(canvas);
            if (state.texture !== state.originalTexture) state.compositor.releaseTexture(state.texture);
            state.texture = fresh;
        })
        .catch(() => {
            // Best-effort only -- a failed re-snapshot (e.g. the video element
            // was removed mid-drag) just means the mesh keeps showing the last
            // good frame; never lets this decorative throttle break the main
            // wobble's finally-guaranteed reveal.
            state.videoSnapshotInFlight = false;
        });
}

// `jumpToEnd` is accepted (per registerEffect's cancelFn signature) but not
// branched on -- a wobble has no "final committed op" to force through
// (unlike genie/tier1's minimize/maximize): there's nothing to jump TO but
// the current rest rect, which the mesh is already springing toward either
// way. Every cancellation (jump-cut or not) ends the same way: stop the rAF
// loop and reveal.
function makeCancelFn(state) {
    return () => {
        if (dragState.get(state.el) !== state) return; // stale/superseded -- see file banner
        if (state.rafId !== null) cancelAnimationFrame(state.rafId);
        // No `iconostat-fx-done` dispatch on a controller-driven cancellation
        // (resize/cancelAll/a second gesture jump-cutting us) -- exactly like
        // tier1.js's wobble: the gesture was pre-empted, not completed.
        finishAndReveal(state, { dispatch: false });
    };
}

// -- Public entry points: the exact C/D contract signatures ----------------

export async function dragStart(controller, compositor, detail) {
    cachedCompositor = compositor;
    const { el, x, y } = detail;

    const inFlight = controller._inFlight.get(el);
    if (inFlight && inFlight.name !== 'wobble') {
        // Drag during an in-flight non-wobble effect (in practice: a genie
        // minimize/maximize) is REFUSED -- genie wins, the drag itself still
        // proceeds unanimated (the library keeps writing left/top
        // regardless). See file banner.
        return;
    }

    const existing = dragState.get(el);
    if (existing && inFlight && inFlight.name === 'wobble') {
        // Inherit-on-re-drag: reuse the current mesh state (no beginEffect,
        // no fresh registerEffect) -- "no visible pop". Recompute the pin
        // from the CURRENT (possibly still-deforming) mesh positions, not a
        // fresh rest grid.
        existing.phase = 'dragging';
        existing.settleDeadlineMs = null;
        existing.kind = 'drag';
        existing.pointerX = x;
        existing.pointerY = y;
        existing.pinnedIndex = nearestIndex(x, y, existing.restLeft, existing.restTop, existing.width, existing.height, existing.cols, existing.rows);
        existing.pinOffsetX = existing.simPos[existing.pinnedIndex * 2] - x;
        existing.pinOffsetY = existing.simPos[existing.pinnedIndex * 2 + 1] - y;
        return;
    }

    // Fresh start. Capture the pre-snapshot rect BEFORE the async
    // beginEffect() round trip (mirrors genie.js's openRect capture) --
    // `fx-ghost` (visibility:hidden) doesn't affect layout/getBoundingClientRect,
    // but this keeps the ordering unambiguous regardless.
    const rect = rectOf(el);

    // Register FIRST (before the await), exactly like genie.js -- so a
    // cancellation racing in during the snapshot itself has something to
    // jump-cut, and dragMove/dragEnd arriving before beginEffect resolves
    // can tell "an effect is starting" apart from "nothing is happening"
    // via controller._inFlight, even though `dragState` isn't populated yet.
    let settledEarly = false;
    const placeholderCancel = () => { settledEarly = true; };
    controller.registerEffect(el, 'wobble', placeholderCancel);

    let texture, width, height;
    try {
        const res = await compositor.beginEffect(el);
        texture = res.texture; width = res.width; height = res.height;
    } catch (e) {
        // SnapshotError (or anything else) -- propagate so controller.js
        // falls through to Tier 1 for this event. No dragState was ever
        // set, so dragMove/dragEnd for this gesture harmlessly no-op via
        // their own `if (!state) return`. Unregister so we don't strand a
        // registry entry with nothing behind it.
        controller.unregisterEffect(el);
        throw e;
    }

    if (settledEarly) {
        // Cancelled while snapshotting. Our OWN beginEffect() succeeded
        // after the fact, so *something* now needs to reveal `el` --
        // UNLESS another effect has, in the meantime, registered its own
        // handle on `el` (an extremely narrow race: e.g. a genie minimize/
        // maximize programmatically triggered on the exact same `el` while
        // our placeholder was still the registered handle -- registerEffect's
        // synchronous jump-cut cancelled our placeholder, but genie's OWN
        // beginEffect() call couldn't start until AFTER its registerEffect()
        // call returned, so it may now be racing our already-in-flight one).
        // If someone else now owns `el`, THEY are solely responsible for its
        // fx-ghost/texture lifecycle from here -- calling endEffect()
        // ourselves would strip fx-ghost / release a texture out from under
        // their in-flight swap. Only reveal it ourselves when nothing else
        // has claimed it (the common case: a plain resize/cancelAll-style
        // cancellation with nothing behind it).
        if (!controller._inFlight.get(el)) {
            compositor.endEffect(el);
        }
        return;
    }

    const state = createState({ el, compositor, texture, width, height, rect, pointerX: x, pointerY: y });
    state.pinOffsetX = state.simPos[state.pinnedIndex * 2] - x;
    state.pinOffsetY = state.simPos[state.pinnedIndex * 2 + 1] - y;
    dragState.set(el, state);
    // Re-register with the REAL cancelFn now that state exists (registerEffect
    // jump-cuts whatever was previously registered on `el` -- here that's our
    // OWN placeholder, a harmless self-supersede: `placeholderCancel` merely
    // flips a local flag we've already finished checking).
    controller.registerEffect(el, 'wobble', makeCancelFn(state));

    scheduleTick(state);
}

// `controller`/`compositor` are unused here (the tick loop already holds its
// own `state.compositor` reference from dragStart) but kept as named
// parameters to match the exact C/D contract signature.
export function dragMove(controller, compositor, detail) {
    const { el, x, y, left, top } = detail;
    const state = dragState.get(el);
    if (!state) return; // beginEffect not resolved yet, or refused (genie) -- tolerate, per contract
    state.pointerX = x;
    state.pointerY = y;
    // Track the real window position (still being written by the library's
    // own onMove, even though `el` is fx-ghosted) -- "the grid's rest pose
    // tracks left/top from iconostat-drag-move".
    if (typeof left === 'number' && typeof top === 'number') {
        state.restLeft = left;
        state.restTop = top;
    } else {
        const r = rectOf(el);
        state.restLeft = r.left;
        state.restTop = r.top;
    }
    refreshRestPos(state);
}

export function dragEnd(controller, compositor, detail) {
    const { el } = detail;
    const state = dragState.get(el);
    if (!state) return; // tolerate, per contract

    // Final rest position: prefer the live rect (authoritative -- the
    // library's onMove has already finished writing left/top by the time
    // dragEnd fires) over whatever the last dragMove happened to report.
    const rect = rectOf(el);
    state.restLeft = rect.left;
    state.restTop = rect.top;
    refreshRestPos(state);

    state.phase = 'settling';
    state.settleDeadlineMs = performance.now() + currentSettleMax();
}

// -- Impact wobble (maximize completion) ------------------------------------

function findWindowByName(name) {
    const desktop = FxController.getDesktop();
    if (!desktop || !desktop.windows) return null;
    return desktop.windows.find((w) => w.name === name) || null;
}

async function runImpactWobble(el) {
    const compositor = cachedCompositor;
    if (!compositor) return; // see file banner -- no drag has happened yet this session
    if (mobileViewport()) return; // "skip impact wobble" on mobile, per spec
    if (FxController._inFlight.get(el)) return; // something else already owns el (rare race) -- don't fight it
    if (dragState.get(el)) return; // a wobble is already live on el (shouldn't happen post-maximize, but never stack)

    const rect = rectOf(el);
    if (rect.width <= 0 || rect.height <= 0) return; // el not laid out (closed mid-flight, etc.)

    let texture, width, height;
    try {
        const res = await compositor.beginEffect(el);
        texture = res.texture; width = res.width; height = res.height;
    } catch (e) {
        // Impact wobble is purely decorative -- a SnapshotError here must
        // never surface as a broken maximize (which already completed
        // successfully via genie/tier1 before this listener even ran).
        // Silently skip; `el` is guaranteed untouched by a failed
        // beginEffect (see compositor.js's contract).
        return;
    }

    const state = createState({ el, compositor, texture, width, height, rect, pointerX: rect.left + rect.width / 2, pointerY: rect.top + rect.height / 2 });
    state.kind = 'impact';
    state.phase = 'settling';
    state.pinnedIndex = -1;
    state.settleDeadlineMs = performance.now() + currentImpactMax();

    // Inject a small outward-from-center velocity impulse -- a quick
    // squash/stretch "impact" jiggle that the spring system then damps back
    // to rest, per the spec's "inject a velocity impulse for a ~250ms
    // residual jiggle".
    const IMPACT_STRENGTH = 260; // px/s at the grid's edges
    for (let r = 0; r < state.rows; r++) {
        for (let c = 0; c < state.cols; c++) {
            const i = r * state.cols + c;
            const fx = state.cols > 1 ? c / (state.cols - 1) - 0.5 : 0;
            const fy = state.rows > 1 ? r / (state.rows - 1) - 0.5 : 0;
            state.vel[i * 2] = fx * IMPACT_STRENGTH;
            state.vel[i * 2 + 1] = fy * IMPACT_STRENGTH;
        }
    }

    dragState.set(el, state);
    FxController.registerEffect(el, 'wobble', makeCancelFn(state));
    scheduleTick(state);
}

function onFxDone(e) {
    const { name, effect } = e.detail || {};
    if (effect !== 'maximize') return; // "on maximize completion" only -- not unmaximize/minimize/restore/wobble
    const el = findWindowByName(name);
    if (!el) return;
    runImpactWobble(el).catch(() => {}); // fire-and-forget; failures are already swallowed inside, this is defense in depth only
}

if (typeof document !== 'undefined') {
    document.addEventListener('iconostat-fx-done', onFxDone);
}
