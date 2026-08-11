// Iconostat FX -- Tier-2 "genie" choreography: minimize/restore/maximize/
// unmaximize via the shared WebGL2 compositor (compositor.js, Agent B). See
// the C/D contract in compositor.js's file banner (mandatory reading before
// this file) and the Agent C section of
// docs/superpowers/specs/2026-08-11-iconostat-fx-design.md.
//
// Imports ONLY `./snapshot.js` -- a sibling fx module, explicitly sanctioned
// by compositor.js's own banner ("snapshot el again yourself
// (import('./snapshot.js'))" for effects that need more than beginEffect's
// one texture -- restore's flash-avoidance pre-flight check below is
// exactly that kind of case: a synchronous, side-effect-free risk check
// run before any DOM mutation). `controller`/`compositor` are handed to
// `run()` by controller.js at the call site; this file never imports
// controller.js itself. Zero site code, zero library code, no new deps.
//
// -- The three choreographies -------------------------------------------
// Minimize (kind='minimize', entering=true): beginEffect(el) snapshots the
//   OPEN window and hides it; then el.minimize(true,{silent:true}) commits
//   the real reparent into the taskbar while still hidden; measure the chip
//   rect; animate the mesh openRect -> chipRect (ease-in); endEffect reveals
//   the now-real chip.
// Restore (kind='minimize', entering=false): the mirror, with the hard part
//   the brief calls out -- see `runMinimizeOrRestore`'s restore branch for
//   the full no-flash writeup (short version: commit the real restore FIRST,
//   synchronously; start the compositor's snapshot of that now-open state;
//   apply `fx-ghost` OURSELVES in the same synchronous turn, before any
//   paint can happen and before beginEffect's own -- later, post-await --
//   `fx-ghost` add would otherwise leave a window of visible open content).
// Maximize/unmaximize (kind='maximize'): same swap pattern, no reparent --
//   beginEffect always runs BEFORE the real op here (no flash risk, since
//   maximize doesn't change window *content*, only geometry).
//
// -- Cancellation / reverse-from-current-t --------------------------------
// `stateMap` (el -> in-flight choreography state) is read by a new,
// opposite-direction `run()` call BEFORE it calls
// `controller.registerEffect()` (which jump-cuts whatever's already
// registered on `el`, synchronously, as part of that very call). If the
// prior effect is the same kind, the opposite direction, still in flight,
// AND already holds a ready texture (i.e. past its own beginEffect), the new
// call reuses that texture and continues from the current interpolation
// parameter (`1 - prior.u`) instead of re-snapshotting or restarting -- true
// reverse-from-current-t, achieved via a WeakMap handoff, not by changing
// registerEffect's jump-cut semantics (controller.js is untouched).
//
// A SAME-direction re-entrant call (e.g. a fast double-click on the
// minimize button landing while the first click's `beginEffect()` is still
// mid-await -- `el` is still fully visible and un-ghosted until that
// resolves, so a second `iconostat-before-minimize` for the same direction
// can genuinely land) is coalesced instead: see the `prior.entering ===
// entering` check at the top of `runMinimizeOrRestore` below. Since that
// check runs BEFORE `controller.registerEffect()`, the second call never
// jump-cuts the first, never re-commits the real op, and never re-runs
// `window.js`'s `saveWindowState()` on an already-target-state `el` (which
// used to persist empty geometry once `reset()` had already cleared it --
// see the task-Cfix report). The coalesced call touches nothing (no
// beginEffect, no registration) and just resolves once the owning instance
// settles.
//
// Every OTHER case (kind mismatch, opposite direction, prior still
// mid-snapshot, prior already settled) falls back to the plain
// jump-cut-then-fresh-run path, which is glitch-free by construction: the
// jump-cut always leaves `el` fully revealed in a consistent state before
// the new run begins, so there is nothing to visually reconcile. See the
// task report for the full writeup of which case is which.

import { assessSnapshotRisk } from './snapshot.js';

const COLS = 8;
const ROWS = 40;
const MINIMIZE_DURATION_DESKTOP = 400;
const MINIMIZE_DURATION_MOBILE = 320;
const MAXIMIZE_DURATION = 150;
const MINIMIZE_CURVATURE = 1;
const MAXIMIZE_CURVATURE = 0.4; // "softer curvature" per the spec's Agent-C task
const POUR_DELAY_SPAN = 0.55; // fraction of phase-2 the TOP row lags the BOTTOM row by (the "pour")

// el -> in-flight choreography state. Only present while a genie effect
// currently owns `el` (set at the top of run*, deleted at every settle
// path) -- see the cancellation writeup above.
const stateMap = new WeakMap();

// -- Small math helpers ------------------------------------------------

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function rectOf(domRect) {
    return { left: domRect.left, top: domRect.top, width: domRect.width, height: domRect.height };
}

function lerpRect(a, b, u) {
    return {
        left: a.left + (b.left - a.left) * u,
        top: a.top + (b.top - a.top) * u,
        width: a.width + (b.width - a.width) * u,
        height: a.height + (b.height - a.height) * u,
    };
}

export function easeInCubic(t) { return t * t * t; }
export function easeOutCubic(t) { const p = 1 - t; return 1 - p * p * p; }

// Single-axis cubic Bezier evaluation (direct polynomial form of
// De Casteljau) -- used to shape the per-row "neck pinch" amount as a
// function of row fraction (0 = top row, 1 = bottom row). Control points
// stay near 0 through the upper rows then rise sharply near the bottom,
// producing the classic funnel-neck silhouette (most of the window stays
// its full width until near the target end) instead of a linear taper.
function cubicBezier1D(p0, p1, p2, p3, t) {
    const mt = 1 - t;
    return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3;
}
const NECK_BEZIER = [0, 0.05, 0.4, 1];

function mobileViewport() {
    return typeof window !== 'undefined' && window.innerWidth <= 768;
}

export function minimizeDuration() {
    return mobileViewport() ? MINIMIZE_DURATION_MOBILE : MINIMIZE_DURATION_DESKTOP;
}

// Builds the cols*rows*2 position grid (row-major, viewport CSS-px, exactly
// `drawMesh`'s contract) for interpolation parameter `u` in [0,1]: u=0
// reproduces rectA's plain rest-pose grid exactly, u=1 reproduces rectB's,
// per the spec's Agent-C mesh-warp task:
//   Phase 1 (u 0->0.4): the left/right silhouette edges (and, by the same
//     per-row pinch amount, every column in between) bend toward a cubic
//     Bezier "neck" converging on rectB's horizontal extent, strongest near
//     the bottom row and weakest near the top -- the funnel.
//   Phase 2 (u 0.3->1.0, overlapping Phase 1): each row's Y position travels
//     toward its rectB-mapped position, with a per-row delay so bottom rows
//     move first and top rows lag -- the "pour".
// Boundary conditions (verified by construction, see the report): at u=0
// both phase weights are 0 so every vertex is exactly rectA's plain
// mapping; at u=1 both phase weights saturate to 1 AND the pinch target
// converges onto the exact same point the plain rectB mapping would give
// (rectU==rectB at u=1, so xPinched==x0 algebraically) -- so this never
// visibly "pops" relative to the plain rect it's replacing at either end.
export function buildMeshPositions(u, rectA, rectB, cols, rows, curvature) {
    const w1 = clamp(u / 0.4, 0, 1);
    const w2 = clamp((u - 0.3) / 0.7, 0, 1);
    const rectU = lerpRect(rectA, rectB, u);
    const bCenterX = rectB.left + rectB.width / 2;
    const positions = new Float32Array(cols * rows * 2);
    for (let r = 0; r < rows; r++) {
        const rf = rows > 1 ? r / (rows - 1) : 0;
        const delay = (1 - rf) * POUR_DELAY_SPAN;
        const denom = Math.max(1 - delay, 1e-6);
        const pour = clamp((w2 - delay) / denom, 0, 1);
        const pinchBase = cubicBezier1D(NECK_BEZIER[0], NECK_BEZIER[1], NECK_BEZIER[2], NECK_BEZIER[3], rf);
        const pinch = clamp(pinchBase * w1 * curvature, 0, 1);
        const y0 = rectU.top + rf * rectU.height;
        const yTarget = rectB.top + rf * rectB.height;
        const y = y0 + (yTarget - y0) * pour;
        for (let c = 0; c < cols; c++) {
            const cf = cols > 1 ? c / (cols - 1) : 0;
            const x0 = rectU.left + cf * rectU.width;
            const xPinched = bCenterX + (cf - 0.5) * rectB.width;
            const x = x0 + (xPinched - x0) * pinch;
            const i = (r * cols + c) * 2;
            positions[i] = x;
            positions[i + 1] = y;
        }
    }
    return positions;
}

// -- rAF-driven tween runner ------------------------------------------------
// Drives `onFrame(u)` from `startU` to 1 over `duration` ms, eased by
// `easingFn`. Returns `{ promise, stop }`: `stop()` cancels the pending
// frame and resolves `promise` immediately (synchronous, safe to call from
// inside a `registerEffect` cancelFn) -- callers never need `promise` to
// reject; cancellation is not an error in this module, only an early stop.
function runTween({ startU, duration, easingFn, onFrame }) {
    let rafId = null;
    let stopped = false;
    let resolveFn = null;
    const promise = new Promise((resolve) => {
        resolveFn = resolve;
        const startTime = performance.now();
        const tick = (now) => {
            if (stopped) return;
            const rawT = clamp((now - startTime) / duration, 0, 1);
            const u = startU + (1 - startU) * easingFn(rawT);
            onFrame(u);
            if (rawT >= 1) { stopped = true; resolve(); return; }
            rafId = requestAnimationFrame(tick);
        };
        rafId = requestAnimationFrame(tick);
    });
    return {
        promise,
        stop() {
            if (stopped) return;
            stopped = true;
            if (rafId !== null) cancelAnimationFrame(rafId);
            resolveFn();
        },
    };
}

function dispatchDone(el, effect) {
    document.dispatchEvent(new CustomEvent('iconostat-fx-done', { detail: { name: el.name, effect } }));
}

// -- Minimize / restore ---------------------------------------------------

async function runMinimizeOrRestore(controller, compositor, el, entering) {
    const effectName = entering ? 'minimize' : 'restore';

    // Reverse-from-current-t detection (see the file banner). Must run
    // BEFORE controller.registerEffect() below, which jump-cuts (and, per
    // the `reversing` flag we set on it here, "soft-stops" instead) whatever
    // is currently registered on `el`.
    const prior = stateMap.get(el);

    // Same-direction re-entrancy (task-Cfix): a second run() for `el`,
    // SAME direction, arrives while `prior` is still in flight and hasn't
    // settled or already been claimed by a reversal. This call hasn't
    // touched anything yet -- no beginEffect, no controller registration --
    // so there's nothing to unwind; just coalesce onto the owning instance
    // by resolving once it settles, instead of competing for a second real
    // commit. See the file banner above and the task-Cfix report for why.
    if (prior && prior.kind === 'minimize' && prior.entering === entering && !prior.settled && !prior.reversing) {
        return prior.donePromise;
    }

    const canReverse = !!(prior && prior.kind === 'minimize' && prior.entering !== entering && !prior.settled && prior.texture);
    const handoff = canReverse
        ? { texture: prior.texture, openRect: prior.openRect, chipRect: prior.chipRect, startU: 1 - prior.u }
        : null;
    if (canReverse) prior.reversing = true;

    let resolveDone;
    const donePromise = new Promise((resolve) => { resolveDone = resolve; });

    const myState = {
        kind: 'minimize', entering, settled: false, reversing: false, committed: false,
        u: handoff ? handoff.startU : 0, texture: null, openRect: null, chipRect: null,
        donePromise,
    };
    stateMap.set(el, myState);

    let tween = null;

    const settleAndReveal = () => {
        myState.settled = true;
        if (tween) tween.stop();
        if (stateMap.get(el) === myState) stateMap.delete(el);
        controller.unregisterEffect(el);
        compositor.endEffect(el);
        resolveDone();
    };

    controller.registerEffect(el, effectName, (jumpToEnd) => {
        if (myState.settled) return;
        if (myState.reversing) {
            // Handoff in progress: a new opposite-direction run() already
            // read our texture/rects and is about to take over ownership of
            // fx-ghost/the canvas -- just stop OUR loop; the new effect's
            // own completion is what reveals `el` and dispatches fx-done.
            myState.settled = true;
            if (tween) tween.stop();
            resolveDone(); // any same-direction call coalesced onto us must not hang forever
            return;
        }
        // Genuine external cancellation (resize/cancelAll/an unrelated
        // second gesture on the same el). Minimize/maximize normally commit
        // the real DOM op EARLY (right after beginEffect resolves, well
        // before the tween finishes) -- but a cancellation CAN still race in
        // during the snapshot itself, before that commit ever happens. Per
        // the same "jumpToEnd -- the user's original intent is still valid,
        // finish the operation now" contract tier1.js's minimizeEnter uses
        // for the identical race, force the real op through here rather
        // than silently abandoning it (leaving `el` untouched would NOT
        // match Tier 1's/Tier 0's behavior for the same resize-during-
        // minimize gesture -- see fx-tier1.spec.js's matching test).
        if (jumpToEnd && !myState.committed) {
            // Hardening (task-Cfix): only perform the real op if `el` isn't
            // ALREADY in the target state -- guards against ever
            // re-committing (and thus re-running window.js's
            // saveWindowState()) on an el some other path already settled
            // into `entering`'s target state.
            if (el.classList.contains('minimized') !== entering) {
                el.minimize(entering, { silent: true });
            }
            myState.committed = true;
        }
        settleAndReveal();
        dispatchDone(el, effectName);
    });

    try {
        let texture, openRect, chipRect;

        if (handoff) {
            texture = handoff.texture;
            openRect = handoff.openRect;
            chipRect = handoff.chipRect;
            el.minimize(entering, { silent: true }); // commit while still fx-ghosted from the handed-off effect
            myState.committed = true;
        } else if (entering) {
            openRect = rectOf(el.getBoundingClientRect());
            const res = await compositor.beginEffect(el);
            if (myState.settled) { compositor.endEffect(el); return; } // cancelled while snapshotting (cancelFn already force-committed + revealed if jumpToEnd)
            texture = res.texture;
            el.minimize(true, { silent: true });
            myState.committed = true;
            chipRect = rectOf(el.getBoundingClientRect());
        } else {
            // Restore -- the hard part. `el` is currently the taskbar chip.
            // We need a texture of the OPEN window's content (not the
            // chip's), but must never let the real, opened-up `el` be
            // visible on screen even for a frame -- and `beginEffect`
            // itself only hides `el` AFTER its snapshot resolves (an
            // unavoidably async round trip: image decode), which would
            // otherwise leave `el` open+unhidden in the live DOM for
            // however long that takes.
            //
            // The fix: commit the real restore FIRST (synchronous, no
            // await), then start `compositor.beginEffect(el)` -- whose
            // synchronous prefix (risk check, rect capture, clone +
            // `XMLSerializer` stringify -- see snapshot.js) runs to
            // completion as part of just CALLING it, before it hits its own
            // first `await` and returns a pending promise -- and add
            // `fx-ghost` ourselves IMMEDIATELY after, in that same
            // synchronous turn. Since nothing here awaits between the
            // commit and the manual `fx-ghost` add, the browser cannot
            // paint the intermediate "open, unhidden" state (JS execution
            // never yields to a paint mid-script) -- by the time control
            // returns to the event loop, `el` is already hidden, and the
            // clone `beginEffect` is rasterizing was captured from the
            // correct (open, unhidden) state a moment earlier. When
            // `beginEffect`'s own promise later resolves, it adds
            // `fx-ghost` again (idempotent) and proceeds normally.
            chipRect = rectOf(el.getBoundingClientRect());
            // Pre-flight, synchronous, zero-mutation risk check (exported by
            // snapshot.js specifically for this) -- lets the common failure
            // case (cross-origin content) reject BEFORE we commit anything,
            // so `el` stays genuinely untouched and the invariant holds with
            // no revert needed. `assessSnapshotRisk` only inspects `el`'s
            // DESCENDANTS' src/taint state, which doesn't change between
            // chip and open geometry, so checking now (while still a chip)
            // is equivalent to checking after the commit below.
            assessSnapshotRisk(el);
            let committed = false;
            try {
                el.minimize(false, { silent: true });
                committed = true;
                myState.committed = true;
                openRect = rectOf(el.getBoundingClientRect());
                const beginPromise = compositor.beginEffect(el);
                el.classList.add('fx-ghost'); // see the writeup above -- must happen synchronously, right here
                const res = await beginPromise;
                if (myState.settled) { compositor.endEffect(el); return; } // cancelled while snapshotting
                texture = res.texture;
            } catch (e) {
                if (myState.settled) {
                    // A cancellation (resize/cancelAll/second gesture) raced
                    // in during this very snapshot and already ran
                    // settleAndReveal() -- which reveals `el` exactly as it
                    // is right now (open, committed above) and already
                    // dispatched fx-done for that. Reverting to chip here
                    // would silently contradict the event we already sent,
                    // and there is no live registration left to fall through
                    // to Tier 1 against -- just leave `el` in the
                    // already-settled, already-correct open state.
                    return;
                }
                // A rarer failure past the pre-flight check (GL init, image
                // decode) -- `el` was already committed to the open state
                // above. Revert it back to minimized/chip via the library's
                // own real minimize(true) (the same code path a genuine
                // minimize takes -- not a hack) so Tier 1's own fallback
                // restore (which controller.js runs next) sees `el` still
                // reporting `minimized`, exactly as if genie had never
                // touched it.
                if (committed) el.minimize(true, { silent: true });
                throw e;
            }
        }

        myState.texture = texture;
        myState.openRect = openRect;
        myState.chipRect = chipRect;
        if (myState.settled) { compositor.endEffect(el); return; }

        const rectA = entering ? openRect : chipRect;
        const rectB = entering ? chipRect : openRect;
        const easingFn = entering ? easeInCubic : easeOutCubic;
        const duration = minimizeDuration();
        const startU = handoff ? handoff.startU : 0;

        tween = runTween({
            startU,
            duration,
            easingFn,
            onFrame: (u) => {
                myState.u = u;
                compositor.drawMesh({
                    texture,
                    positions: buildMeshPositions(u, rectA, rectB, COLS, ROWS, MINIMIZE_CURVATURE),
                    cols: COLS, rows: ROWS, opacity: 1,
                });
            },
        });
        await tween.promise;

        if (myState.settled) return; // cancelFn already handled reveal/handoff
        settleAndReveal();
        dispatchDone(el, effectName);
    } catch (e) {
        // SnapshotError (or any other throw) -- must fall through to Tier 1
        // for this gesture. Never dispatch fx-done here: the gesture isn't
        // actually complete, Tier 1 will dispatch its own when it finishes.
        if (!myState.settled) settleAndReveal();
        throw e;
    }
}

// -- Maximize / unmaximize ---------------------------------------------

async function runMaximize(controller, compositor, el, entering) {
    const effectName = entering ? 'maximize' : 'unmaximize';

    const prior = stateMap.get(el);
    const canReverse = !!(prior && prior.kind === 'maximize' && prior.entering !== entering && !prior.settled && prior.texture);
    const handoff = canReverse
        ? { texture: prior.texture, windowedRect: prior.windowedRect, maxRect: prior.maxRect, startU: 1 - prior.u }
        : null;
    if (canReverse) prior.reversing = true;

    const myState = {
        kind: 'maximize', entering, settled: false, reversing: false, committed: false,
        u: handoff ? handoff.startU : 0, texture: null, windowedRect: null, maxRect: null,
    };
    stateMap.set(el, myState);

    let tween = null;

    const settleAndReveal = () => {
        myState.settled = true;
        if (tween) tween.stop();
        if (stateMap.get(el) === myState) stateMap.delete(el);
        controller.unregisterEffect(el);
        compositor.endEffect(el);
    };

    controller.registerEffect(el, effectName, (jumpToEnd) => {
        if (myState.settled) return;
        if (myState.reversing) {
            myState.settled = true;
            if (tween) tween.stop();
            return;
        }
        // See the matching comment in runMinimizeOrRestore -- the real
        // maximize()/unmaximize() commit normally happens right after
        // beginEffect resolves, but a cancellation can race in before that;
        // force it through on jumpToEnd, matching Tier 1's behavior for the
        // same race.
        if (jumpToEnd && !myState.committed) {
            el.maximize(entering, { silent: true });
            myState.committed = true;
        }
        settleAndReveal();
        dispatchDone(el, effectName);
    });

    try {
        let texture, windowedRect, maxRect;

        if (handoff) {
            texture = handoff.texture;
            windowedRect = handoff.windowedRect;
            maxRect = handoff.maxRect;
            el.maximize(entering, { silent: true });
            myState.committed = true;
        } else {
            // No reparent, content unchanged either direction -- beginEffect
            // always runs before the real op; no flash-avoidance dance
            // needed (unlike restore above).
            const beforeRect = rectOf(el.getBoundingClientRect());
            const res = await compositor.beginEffect(el);
            if (myState.settled) { compositor.endEffect(el); return; } // cancelled while snapshotting (cancelFn already force-committed + revealed if jumpToEnd)
            texture = res.texture;
            el.maximize(entering, { silent: true });
            myState.committed = true;
            const afterRect = rectOf(el.getBoundingClientRect());
            windowedRect = entering ? beforeRect : afterRect;
            maxRect = entering ? afterRect : beforeRect;
        }

        myState.texture = texture;
        myState.windowedRect = windowedRect;
        myState.maxRect = maxRect;
        if (myState.settled) { compositor.endEffect(el); return; }

        const rectA = entering ? windowedRect : maxRect;
        const rectB = entering ? maxRect : windowedRect;
        const easingFn = entering ? easeInCubic : easeOutCubic;
        const startU = handoff ? handoff.startU : 0;

        tween = runTween({
            startU,
            duration: MAXIMIZE_DURATION,
            easingFn,
            onFrame: (u) => {
                myState.u = u;
                compositor.drawMesh({
                    texture,
                    positions: buildMeshPositions(u, rectA, rectB, COLS, ROWS, MAXIMIZE_CURVATURE),
                    cols: COLS, rows: ROWS, opacity: 1,
                });
            },
        });
        await tween.promise;

        if (myState.settled) return;
        settleAndReveal();
        dispatchDone(el, effectName);
    } catch (e) {
        if (!myState.settled) settleAndReveal();
        throw e;
    }
}

// -- Public entry point (the exact C/D contract signature) ----------------

export async function run(controller, compositor, el, kind, entering) {
    if (kind === 'maximize') {
        return runMaximize(controller, compositor, el, entering);
    }
    return runMinimizeOrRestore(controller, compositor, el, entering);
}
