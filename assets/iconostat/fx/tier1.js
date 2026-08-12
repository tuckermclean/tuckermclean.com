// Iconostat FX -- Tier 1: WAAPI affine fallbacks (no WebGL, no snapshot).
//
// Imports ZERO site code and ZERO library code -- everything this module
// needs (the desktop, the window element, event details) is handed to it by
// controller.js, which dynamically imports this file lazily (only once a
// Tier-1 effect is actually needed). See controller.js's file banner for the
// served-path mechanics.
//
// Every exported effect function is wrapped in try/finally: whatever
// happens (natural completion, cancellation, an unexpected throw), the
// window is left with no stray inline transform/opacity and the pending DOM
// mutation (the real minimize()/maximize() call) either completed or was
// never started -- never half-applied. That's the finally-guaranteed-reveal
// hard invariant.

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

// Watches `el`'s class/style attributes for mutations NOT caused by this
// effect's own code -- e.g. desktop.cascade()/tile() calling reset() (or
// writing style directly) on a window that has no `iconostat-before-*` event
// to hook at all, because it isn't minimized/maximized yet (there's nothing
// for cascade()/tile() to un-minimize) so they touch it via `reset()`/direct
// style writes instead. That's the general-purpose net for "someone else
// already decided this element's end state while we were mid-effect".
//
// `pause()`/`resume()` bracket the effect's OWN synchronous mutations (the
// probe-measure trick below, the real minimize()/maximize() commit);
// `MutationObserver.takeRecords()` discards whatever the browser queued for
// those self-inflicted mutations so the async callback never fires for our
// own work. `checkInterference()` is the synchronous counterpart, used by a
// controller-driven cancellation (registerEffect's cancelFn, invoked
// directly from `_onBeforeMinMax`/`cancelAll` -- which can itself run
// *inside* the very same synchronous cascade()/tile() call stack that just
// mutated `el`, before the async callback above has had a chance to fire):
// it answers "did something mutate me that I haven't been told about yet",
// synchronously, so a jump-cut can tell "finish the operation now" (nothing
// touched el yet) apart from "abandon -- el was already reset() and forcing
// a completion on top of that would be a second, conflicting write".
function watchForInterference(el, onInterference) {
    let paused = true; // starts paused; effects call resume() once wired up
    const observer = new MutationObserver(() => {
        if (paused) return;
        onInterference();
    });
    observer.observe(el, { attributes: true, attributeFilter: ['class', 'style'] });
    return {
        pause() { paused = true; },
        resume() {
            observer.takeRecords(); // discard records from the just-paused window
            paused = false;
        },
        checkInterference() {
            return observer.takeRecords().length > 0;
        },
        disconnect() { observer.disconnect(); },
    };
}

// -- Minimize / restore ------------------------------------------------

// Entering (minimize): the real reparent is deferred to the END of the
// animation (per the design doc) -- reparenting into the taskbar's flex row
// immediately would reflow sibling chips and clip window chrome under
// `.window.minimized`'s !important geometry for the whole ~250ms animation,
// which is wrong for a "shrinking window" effect that should show the real
// window content shrinking, not a chip growing. Instead: probe-measure the
// true chip rect (real reparent + class, synchronously undone before any
// paint), then animate the REAL element (still floating, still a body
// child) toward that measured delta, and only commit the real reparent once
// the animation finishes.
async function minimizeEnter(controller, el) {
    let settled = false;
    let anim = null;

    const cleanup = () => {
        el.style.transform = '';
        el.style.opacity = '';
    };

    const watcher = watchForInterference(el, () => {
        if (settled) return;
        settled = true;
        watcher.disconnect();
        if (anim) anim.cancel();
        controller.unregisterEffect(el);
        // The interference (e.g. cascade()'s reset()) already made itself
        // authoritative -- just strip our own decoration, don't force state.
        cleanup();
    });

    controller.registerEffect(el, 'minimize', (jumpToEnd) => {
        if (settled) return;
        // Synchronous check (see watchForInterference's docstring): if el
        // was already mutated by something else in this same call stack
        // (e.g. cascade()'s reset(), moments ago, in the same forEach that's
        // now triggering this cancellation for an unrelated reason), that
        // mutation is authoritative -- don't force our own completion on
        // top of it, regardless of jumpToEnd.
        const interfered = watcher.checkInterference();
        settled = true;
        watcher.disconnect();
        if (anim) anim.cancel();
        cleanup();
        if (jumpToEnd && !interfered) {
            // Controller-driven cancellation (resize/second-gesture/etc):
            // the user's original intent is still valid -- finish the
            // operation NOW instead of abandoning it.
            el.minimize(true, { silent: true });
        }
    });

    try {
        const startRect = el.getBoundingClientRect();

        // NOTE (iframe cost, minor, no behavior change here): this probe
        // reparents `el` into the taskbar and back, synchronously, purely to
        // measure the chip rect -- on top of the real reparent at the end of
        // the animation (line ~143 below), that's TWO reparents per Tier-1
        // minimize instead of legacy's one, and an iframe descendant already
        // reloads on every reparent (pre-existing library behavior, see
        // README/spec ground rules) -- so a Tier-1 minimize of an
        // iframe-bearing window reloads that iframe ~twice as often as
        // legacy. No iframe windows exist on the site today, so this is
        // latent. Flagged for Agent F's planned cross-origin iframe fixture,
        // which is expected to demote iframe windows to Tier 1 via
        // SnapshotError -- that's exactly when this doubles from
        // theoretical to real.
        const taskbar = controller.getDesktop().taskbar;
        taskbar.appendChild(el);
        el.classList.add('minimized');
        const chipRect = el.getBoundingClientRect();
        el.classList.remove('minimized');
        document.body.appendChild(el);
        watcher.resume();

        if (settled) return; // cancelled during the synchronous probe itself

        const dx = (chipRect.left + chipRect.width / 2) - (startRect.left + startRect.width / 2);
        const dy = (chipRect.top + chipRect.height / 2) - (startRect.top + startRect.height / 2);
        const sx = Math.max(chipRect.width / startRect.width, 0.001);
        const sy = Math.max(chipRect.height / startRect.height, 0.001);

        anim = el.animate([
            { transform: 'translate(0px, 0px) scale(1, 1) skewY(0deg)', opacity: 1 },
            { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy}) skewY(4deg)`, opacity: 0 },
        ], { duration: 250, easing: 'ease-in', fill: 'forwards' });

        await anim.finished;
        if (settled) return;
        settled = true;
        watcher.pause();
        watcher.disconnect();
        cleanup();
        el.minimize(true, { silent: true });
    } catch (e) {
        // anim.cancel() rejects `finished` with AbortError -- expected on
        // cancellation; fall through to the guaranteed cleanup below.
    } finally {
        settled = true;
        watcher.disconnect();
        cleanup(); // finally-guaranteed: no stray transform/opacity survives
        controller.unregisterEffect(el);
        document.dispatchEvent(new CustomEvent('iconostat-fx-done', { detail: { name: el.name, effect: 'minimize' } }));
    }
}

// Restoring: the mirror direction. Unlike entering, the target (floating)
// rect is already known -- `el.lastWidth/lastHeight/lastTop/lastLeft` were
// captured by `saveWindowState()` when the window was minimized, and are
// exactly what `restoreWindowState()` (inside the real minimize()) will
// apply. So there's no measurement race to avoid: commit the real mutation
// immediately (FLIP-style, like genie's "no reparent" maximize case), then
// animate FROM the inverse delta back to identity. If anything interferes
// mid-animation, the DOM is already in its correct final state -- cleanup
// just strips the decorative transform.
async function minimizeRestore(controller, el) {
    let settled = false;
    let anim = null;

    const cleanup = () => {
        el.style.transform = '';
        el.style.opacity = '';
    };

    const watcher = watchForInterference(el, () => {
        if (settled) return;
        settled = true;
        watcher.disconnect();
        if (anim) anim.cancel();
        controller.unregisterEffect(el);
        cleanup();
    });

    controller.registerEffect(el, 'restore', (jumpToEnd) => {
        if (settled) return;
        settled = true;
        watcher.disconnect();
        if (anim) anim.cancel();
        cleanup();
        // The real mutation already happened (see below) regardless of
        // jumpToEnd -- there's nothing left to force-complete.
    });

    try {
        const startRect = el.getBoundingClientRect(); // current chip rect
        const targetRect = {
            left: parseFloat(el.lastLeft) || 0,
            top: parseFloat(el.lastTop) || 0,
            width: parseFloat(el.lastWidth) || startRect.width,
            height: parseFloat(el.lastHeight) || startRect.height,
        };

        const dx = (targetRect.left + targetRect.width / 2) - (startRect.left + startRect.width / 2);
        const dy = (targetRect.top + targetRect.height / 2) - (startRect.top + startRect.height / 2);
        const sx = Math.max(targetRect.width / startRect.width, 0.001);
        const sy = Math.max(targetRect.height / startRect.height, 0.001);

        el.minimize(false, { silent: true });
        watcher.resume();
        if (settled) return; // watcher fired synchronously off the line above (shouldn't happen; defensive)

        anim = el.animate([
            { transform: `translate(${-dx}px, ${-dy}px) scale(${1 / sx}, ${1 / sy}) skewY(-4deg)`, opacity: 0 },
            { transform: 'translate(0px, 0px) scale(1, 1) skewY(0deg)', opacity: 1 },
        ], { duration: 250, easing: 'ease-out', fill: 'forwards' });

        await anim.finished;
    } catch (e) {
        // cancelled -- see above
    } finally {
        settled = true;
        watcher.disconnect();
        cleanup();
        controller.unregisterEffect(el);
        document.dispatchEvent(new CustomEvent('iconostat-fx-done', { detail: { name: el.name, effect: 'restore' } }));
    }
}

// -- Maximize / unmaximize ----------------------------------------------

// No reparent either direction, so both are simple FLIP: commit the real
// class mutation immediately, then animate the inverse delta back to
// identity over the shorter ~150ms maximize duration.
async function maximizeTransition(controller, el, entering) {
    let settled = false;
    let anim = null;
    const name = entering ? 'maximize' : 'unmaximize';

    const cleanup = () => { el.style.transform = ''; };

    const watcher = watchForInterference(el, () => {
        if (settled) return;
        settled = true;
        watcher.disconnect();
        if (anim) anim.cancel();
        controller.unregisterEffect(el);
        cleanup();
    });

    controller.registerEffect(el, name, (jumpToEnd) => {
        if (settled) return;
        settled = true;
        watcher.disconnect();
        if (anim) anim.cancel();
        cleanup();
    });

    try {
        const startRect = el.getBoundingClientRect();
        el.maximize(entering, { silent: true });
        watcher.resume();
        if (settled) return;
        const endRect = el.getBoundingClientRect();

        const dx = (startRect.left + startRect.width / 2) - (endRect.left + endRect.width / 2);
        const dy = (startRect.top + startRect.height / 2) - (endRect.top + endRect.height / 2);
        const sx = Math.max(startRect.width / endRect.width, 0.001);
        const sy = Math.max(startRect.height / endRect.height, 0.001);

        anim = el.animate([
            { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` },
            { transform: 'translate(0px, 0px) scale(1, 1)' },
        ], { duration: 150, easing: 'ease-out', fill: 'forwards' });

        await anim.finished;
    } catch (e) {
        // cancelled
    } finally {
        settled = true;
        watcher.disconnect();
        cleanup();
        controller.unregisterEffect(el);
        document.dispatchEvent(new CustomEvent('iconostat-fx-done', { detail: { name: el.name, effect: name } }));
    }
}

export function run(controller, el, kind, entering) {
    if (kind === 'minimize') {
        return entering ? minimizeEnter(controller, el) : minimizeRestore(controller, el);
    }
    return maximizeTransition(controller, el, entering);
}

// -- Wobble (Tier-1 jelly) -----------------------------------------------
//
// Velocity-tracked skew/scale layered on top of the real element during a
// drag (the library keeps writing left/top itself -- see window.js
// `_startDrag`'s `onMove`), critically-damped spring back to identity on
// drag-end. No reparent, no measurement race -- always safe to cancel
// mid-gesture (worst case: the transform snaps back to '').

const dragState = new WeakMap(); // el -> { lastX, lastY, lastT, anim }

const WOBBLE_K_SKEW = 1.4;
const WOBBLE_K_SCALE = 0.02;
const WOBBLE_MAX_SKEW = 12;
const WOBBLE_MAX_SCALE = 0.18;

export function dragStart(controller, detail) {
    const { el, x, y } = detail;
    const state = { lastX: x, lastY: y, lastT: performance.now(), anim: null };
    dragState.set(el, state);
    controller.registerEffect(el, 'wobble', () => {
        // `registerEffect` invokes a PRIOR in-flight effect's cancel
        // closure synchronously, from *this* call -- including a still-
        // settling wobble from a rapid re-grab of the same window (dragEnd's
        // settle-back animation keeps the effect registered until it
        // finishes, ~220ms). `dragState` is keyed only by `el`, so if the
        // just-published `state` above has already been superseded (i.e.
        // this closure is stale), skip the delete -- otherwise a stale
        // cancel would wipe out the NEW drag's live state out from under it.
        // Still always cancel/clean up OUR OWN animation and decoration
        // below regardless, since those belong to this closure alone.
        if (state.anim) state.anim.cancel();
        el.style.transform = '';
        if (dragState.get(el) === state) dragState.delete(el);
        // No further unregisterEffect() call needed -- cancelAll()/
        // _cancelFor() already removed us from the registry before invoking
        // this callback.
    });
}

export function dragMove(controller, detail) {
    const { el, x, y } = detail;
    const state = dragState.get(el);
    if (!state) return;
    const now = performance.now();
    const dt = Math.max(now - state.lastT, 1);
    const vx = (x - state.lastX) / dt;
    const vy = (y - state.lastY) / dt;
    state.lastX = x;
    state.lastY = y;
    state.lastT = now;

    const skew = clamp(vx * WOBBLE_K_SKEW, -WOBBLE_MAX_SKEW, WOBBLE_MAX_SKEW);
    const stretch = clamp(vy * WOBBLE_K_SCALE, -WOBBLE_MAX_SCALE, WOBBLE_MAX_SCALE);
    el.style.transform = `skew(${skew}deg) scale(${1 + stretch}, ${1 - stretch})`;
}

export function dragEnd(controller, detail) {
    const { el } = detail;
    const state = dragState.get(el);
    if (!state) {
        controller.unregisterEffect(el);
        return;
    }

    const fromTransform = el.style.transform;
    el.style.transform = '';

    if (!fromTransform) {
        dragState.delete(el);
        controller.unregisterEffect(el);
        return;
    }

    // Critically-damped-feeling spring back to identity (a single
    // cubic-bezier ease covers this well without a real spring simulation).
    const anim = el.animate([
        { transform: fromTransform },
        { transform: 'none' },
    ], { duration: 220, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
    state.anim = anim;

    const settle = ({ dispatch = true } = {}) => {
        // Guard against a stale settle firing after a rapid re-grab of the
        // same window has already published a newer drag's state for `el`
        // (dragState is keyed only by `el`) -- this can happen either
        // because this settle-back animation finished naturally after the
        // new drag started, or because the new drag's registerEffect() call
        // cancelled it synchronously (which rejects `anim.finished`, routing
        // here via .catch()). Either way, an unguarded delete/unregister
        // would strip the NEW drag's live dragState entry and controller
        // registration out from under it -- see dragStart's matching guard.
        if (dragState.get(el) !== state) return;
        dragState.delete(el);
        controller.unregisterEffect(el);
        if (dispatch) {
            document.dispatchEvent(new CustomEvent('iconostat-fx-done', { detail: { name: el.name, effect: 'wobble' } }));
        }
    };
    // Natural settle (anim.finished resolves) fires iconostat-fx-done, once,
    // after the spring-back completes -- mirroring Tier-2 wobble
    // (fx/wobble.js's finishAndReveal) exactly. A controller-driven
    // cancellation/jump-cut (dragStart's registerEffect cancel closure
    // above calling anim.cancel(), e.g. resize or a second gesture)
    // rejects `anim.finished` instead, routing here via .catch(): that
    // path deliberately does NOT dispatch -- the gesture was pre-empted,
    // not completed, so there's nothing to report as "done".
    anim.finished.then(() => settle()).catch(() => settle({ dispatch: false }));
}
