// Iconostat FX -- coordination hub (frozen interface; see
// docs/superpowers/specs/2026-08-11-iconostat-fx-design.md).
//
// This module -- and every module it imports -- MUST NOT import site code
// (assets/js/*) or the bundled iconostat library (assets/iconostat/index.js
// and friends). It receives everything it needs (the desktop instance) via
// FxController.init(desktop); tier1.js/genie.js/wobble.js get the desktop
// (when needed) via FxController.getDesktop(), the passed window element,
// and `document`-level events. This keeps fx/ independent of the site's
// Hugo-built bundle, which is what makes runtime `import()` of these files
// possible in the first place (see the served-path note below).
//
// Served-path note: this file (and every sibling fx/*.js/*.css) is built by
// its OWN `js.Build` call in layouts/home.html, each pinned to a fixed,
// non-fingerprinted `targetPath` that mirrors this file's location under
// assets/ (assets/iconostat/fx/x.js -> /iconostat/fx/x.js). That means:
//   - `import('/iconostat/fx/controller.js')` (from main.js) resolves to a
//     real, stable, cacheable URL -- not something esbuild inlined into the
//     site bundle.
//   - This file's own relative imports (`./tier1.js`, `./compositor.js`,
//     ...) and the relative fx.css URL below resolve against controller.js's
//     OWN served location, so they land at sibling paths under
//     /iconostat/fx/ without any additional wiring.
//   - `./tier1.js`, `./compositor.js`, `./genie.js`, `./wobble.js` are
//     marked `externals` in this file's js.Build call, so esbuild leaves the
//     `import()` calls below untouched (does not try to resolve/bundle
//     them at Hugo build time). That's required for genie.js/wobble.js/
//     compositor.js in particular: they don't exist yet (Agents B/C/D land
//     them later) and esbuild would otherwise fail the Hugo build trying to
//     resolve a nonexistent file. tier1.js exists today but is kept external
//     too, on its own separate js.Build call, so it stays a real lazy fetch
//     instead of being inlined into this (deliberately small) controller.

const STORAGE_KEY = 'iconostat-fx-tier';

function reducedMotionRequested() {
    return typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function probeWebGL2() {
    try {
        const canvas = document.createElement('canvas');
        return !!canvas.getContext('webgl2');
    } catch (e) {
        return false;
    }
}

function readStoredTier() {
    try {
        return typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    } catch (e) {
        return null; // storage disabled/unavailable (private mode, etc.) -- fall back to 'auto'
    }
}

// prefers-reduced-motion overrides everything, unconditionally, per the
// tier-selection contract. Otherwise: explicit '0'/'1'/'2' pin that tier
// (with '2' still falling back to 1 if WebGL2 truly isn't available);
// 'auto' (the default, including no stored value at all) probes for
// WebGL2.
//
// This only picks a Tier-2 CANDIDATE -- it deliberately does NOT run the
// compositor's warmup probe (that needs a live GL context, and creating one
// here, eagerly, on every page load, would violate the "Tier-0/reduced-
// motion machines must still create no canvas ever" hard invariant, since
// computeTier() runs unconditionally from init() even when the answer is
// about to be "0"). Instead, the warmup verdict is applied LAZILY, the FIRST
// time `_loadTier2()` actually runs (i.e. the first time some window's
// `tierFor(el) === 2` and a real gesture needs the compositor) -- see
// `_loadTier2()` below. If the verdict comes back "demote", `_loadTier2()`
// sets `this.tier = 1` session-wide and caches that (both via its own
// `_tier2Promise` cache and the compositor's internal `warmupPromise` cache)
// so the probe never re-runs and every subsequent gesture already sees
// `tier === 1` without re-touching the GL context.
function computeTier(explicitSetting) {
    if (reducedMotionRequested()) return 0;
    const setting = explicitSetting || readStoredTier() || 'auto';
    if (setting === '0') return 0;
    if (setting === '1') return 1;
    if (setting === '2') return probeWebGL2() ? 2 : 1;
    return probeWebGL2() ? 2 : 1; // 'auto'
}

export const FxController = {
    tier: 0,

    _desktop: null,
    _initialized: false,
    _listenersWired: false,
    _cssInjected: false,
    _tier1Promise: null,
    // el -> { name, cancel(jumpToEnd) }. Every currently-running fx effect,
    // regardless of tier, registers itself here so cancelAll() can reach it.
    _inFlight: new Map(),
    // Per-window tier ceiling (SnapshotError demotions -- see `_runEffect`/
    // `_onDrag` below, which call `demote()` after catching a SnapshotError
    // thrown by genie.js/wobble.js's own `compositor.beginEffect()` call).
    _demotions: new WeakMap(),

    // -- Frozen public API --------------------------------------------------

    init(desktop, { tierOverride } = {}) {
        if (this._initialized) return;
        this._initialized = true;
        this._desktop = desktop;
        this.tier = computeTier(tierOverride);

        // Tier 0: true no-op passthrough. No listeners, no injected CSS, no
        // canvas, ever -- "zero fx code paths run" per the hard invariant.
        if (this.tier === 0) return;

        this._injectCss();
        this._wireEvents();
    },

    // Per-window demotion: today just the session tier, clamped by anything
    // fed into `demote()` (SnapshotError from the compositor, later).
    tierFor(win) {
        const ceiling = this._demotions.get(win);
        return ceiling === undefined ? this.tier : Math.min(this.tier, ceiling);
    },

    // Not part of the frozen interface table, but the mechanism the
    // compositor's SnapshotError handler is meant to call into (per the
    // controller's docstring in the spec: "iframe/taint demotions get fed in
    // later by the compositor's SnapshotError").
    demote(win, ceilingTier) {
        this._demotions.set(win, ceilingTier);
    },

    cancelAll(jumpToEnd = true) {
        const handles = Array.from(this._inFlight.values());
        this._inFlight.clear();
        handles.forEach((handle) => {
            try {
                handle.cancel(jumpToEnd);
            } catch (e) {
                // Effect implementations guarantee reveal via their own
                // try/finally regardless of what their cancel() does; a
                // throwing cancel() must not stop the rest from cancelling.
            }
        });
    },

    setTier(value) {
        try {
            localStorage.setItem(STORAGE_KEY, value);
        } catch (e) {
            // Storage unavailable -- the in-memory tier below still takes
            // effect for the rest of this session.
        }
        this.tier = computeTier(value);
        if (this.tier > 0 && this._initialized && !this._listenersWired) {
            this._injectCss();
            this._wireEvents();
        }
        // No reload needed: the NEXT gesture reads `this.tier`/`tierFor()`
        // fresh, per the acceptance criterion.
    },

    // -- Helpers for fx/*.js (not part of the frozen public interface) ------

    // tier1.js/genie.js/wobble.js need the desktop (e.g. its `.taskbar`)
    // without importing the library themselves -- see the file banner above.
    getDesktop() {
        return this._desktop;
    },

    // Register an in-flight effect on `el`. If `el` already has one running
    // (a second gesture on the same window), the previous effect is
    // jump-cut first -- effects never stack.
    registerEffect(el, name, cancelFn) {
        const existing = this._inFlight.get(el);
        if (existing) {
            this._inFlight.delete(el);
            try {
                existing.cancel(true);
            } catch (e) {
                // see cancelAll()
            }
        }
        const handle = { name, cancel: cancelFn };
        this._inFlight.set(el, handle);
        return handle;
    },

    unregisterEffect(el) {
        this._inFlight.delete(el);
    },

    // -- Internal -------------------------------------------------------

    _injectCss() {
        if (this._cssInjected) return;
        this._cssInjected = true;
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = new URL('./fx.css', import.meta.url).href;
        document.head.appendChild(link);
    },

    _loadTier1() {
        if (!this._tier1Promise) {
            this._tier1Promise = import('./tier1.js');
        }
        return this._tier1Promise;
    },

    // genie.js/wobble.js are not built by this agent -- Agents C/D land them
    // later, unchanged against this same call site (see `_runEffect`/
    // `_onDrag` below and compositor.js's file-banner contract for the exact
    // invocation signature they must export).
    //
    // `compositor.js` (this agent's own deliverable) DOES exist from here
    // on, so the import below now genuinely succeeds -- which is exactly the
    // regression trap documented at `_runEffect`: succeeding here must NOT
    // by itself make a gesture "fully Tier 2" (there's no genie/wobble yet
    // to render anything). This function's only job is: (1) load the
    // compositor, demoting to Tier 1 if that somehow fails; (2) the FIRST
    // time it succeeds, run the compositor's warmup probe and demote to
    // Tier 1 session-wide if the verdict says the GPU is too slow. Whether
    // an effect module is actually present is `_runEffect`/`_onDrag`'s
    // concern, not this function's.
    _loadTier2() {
        if (!this._tier2Promise) {
            this._tier2Promise = (async () => {
                // Suspenders (Finding 1, task-Bfix-brief.md): compositor.js's
                // own `warmup()`/`runWarmupProbe()` is guaranteed to never
                // reject (any GL-init throw demotes internally, see its own
                // comments) -- but this single catch-all wrapping BOTH the
                // `import()` and the `warmup()` await means even a future
                // compositor.js change that reopens that hole still can't
                // poison `_tier2Promise` with a rejected promise. A rejected
                // `_tier2Promise` would be cached forever (this whole
                // function only runs once per session) and re-thrown on
                // every future `await this._loadTier2()` in `_runEffect`/
                // `_onDrag`, which don't wrap that await in their own
                // try/catch -- i.e. it would propagate as an unhandled
                // rejection past the Tier-1 fallback and silently kill every
                // future Tier-2-candidate gesture, session-wide. ANY throw
                // here -- import failure or warmup somehow rejecting anyway
                // -- demotes to Tier 1 and resolves (never rejects).
                try {
                    const compositor = await import('./compositor.js');
                    const verdict = await compositor.warmup();
                    if (verdict === 'demote') {
                        this.tier = 1;
                        return null;
                    }
                    return compositor;
                } catch (e) {
                    this.tier = 1;
                    return null;
                }
            })();
        }
        return this._tier2Promise;
    },

    _wireEvents() {
        if (this._listenersWired) return;
        this._listenersWired = true;

        document.addEventListener('iconostat-before-minimize', (e) => this._onBeforeMinMax(e, 'minimize'));
        document.addEventListener('iconostat-before-maximize', (e) => this._onBeforeMinMax(e, 'maximize'));

        document.addEventListener('iconostat-drag-start', (e) => this._onDrag('dragStart', e.detail));
        document.addEventListener('iconostat-drag-move', (e) => this._onDrag('dragMove', e.detail));
        document.addEventListener('iconostat-drag-end', (e) => this._onDrag('dragEnd', e.detail));

        // A window-resize gesture starting on an in-flight window is also a
        // "second gesture on the same window" -- jump-cut it rather than let
        // the resize fight the fx transform.
        document.addEventListener('iconostat-resize-start', (e) => this._cancelFor(e.detail.el));

        // Bulk ops (cascade/tile/reflow) always report userGesture:false on
        // their internal minimize() calls (see _onBeforeMinMax). Receiving
        // one is a reliable signal that a bulk sweep is in progress even for
        // windows it doesn't directly touch -- e.g. a currently-minimized
        // window being restored by cascade() means *some* bulk op just
        // started, so any other in-flight effect is no longer trustworthy.
        // (`_onBeforeMinMax` below calls `cancelAll` directly for this case.)
        //
        // NOTE on the remaining gap: `desktop.cascade()`/`tile()` also sweep
        // every NOT-currently-minimized window through `reset()`/direct
        // style writes, with no `iconostat-before-*` event at all for those
        // (they're already "open", so there's nothing to un-minimize). A
        // window mid-Tier-1-effect can be one of those -- deliberately NOT
        // handled here at the controller level (an early attempt routed it
        // through `iconostat-focus`, which `reset()` also dispatches, but
        // that event fires *synchronously inside* cascade()'s own call
        // stack, racing ahead of -- and contradicting -- the semantics
        // below). Instead, each Tier-1 effect in tier1.js runs its own
        // MutationObserver watching its own element's class/style attributes
        // and treats any mutation it didn't itself cause as authoritative
        // (abandon, don't force-complete) -- see tier1.js's
        // `watchForInterference`. That's a strictly more correct fix: unlike
        // a controller-wide cancelAll(true) (which means "finish the
        // operation now"), an external mutation of THIS element means
        // someone else already decided its end state, and forcing our own
        // completion on top of that would be a second, conflicting write.

        window.addEventListener('resize', () => this.cancelAll(true));
        window.addEventListener('orientationchange', () => this.cancelAll(true));
    },

    _cancelFor(el) {
        const handle = this._inFlight.get(el);
        if (!handle) return;
        this._inFlight.delete(el);
        try {
            handle.cancel(true);
        } catch (e) {
            // see cancelAll()
        }
    },

    _onBeforeMinMax(e, kind) {
        const { el, entering, userGesture } = e.detail;
        if (!userGesture) {
            // Programmatic (bringToFront/cascade/tile/reset). Ground rule:
            // bulk ops never animate -- never preventDefault, let it run
            // instantly. Also treat it as the fxSuppressed-transition signal
            // described above.
            if (this._inFlight.size > 0) this.cancelAll(true);
            return;
        }
        if (this.tierFor(el) === 0) return; // shouldn't happen (init() never
        // wires listeners at tier 0), but keep this path inert regardless.
        e.preventDefault();
        this._runEffect(el, kind, entering);
    },

    // THE REGRESSION TRAP (see docs/superpowers/specs/.../task-B-brief.md):
    // the instant compositor.js exists, `_loadTier2()` starts succeeding.
    // Naively treating "compositor present" as "fully Tier 2" would animate
    // every Tier-2-selected gesture with NOTHING (no genie.js/wobble.js
    // exists yet to actually render anything). The fix: Tier 2 only fully
    // engages once the ACTUAL effect module is present too -- absent (404,
    // the current post-B/pre-C-D state) or a `SnapshotError` from it always
    // falls through to the existing Tier-1 effect, so a real gesture's
    // user-visible result is unchanged from before this file existed.
    async _runEffect(el, kind, entering) {
        if (this.tierFor(el) === 2) {
            const compositor = await this._loadTier2();
            // Re-check tierFor() AFTER the await, not just before it:
            // `_loadTier2()`'s warmup probe (first call only) or a
            // SnapshotError-driven per-window demote that raced in while we
            // were awaiting can both have dropped this window (or the whole
            // session) to Tier 1 in the meantime -- trusting a pre-await
            // snapshot of `tierFor(el)` here would let a just-demoted window
            // slip through to the tier-2 branch below anyway.
            if (compositor && this.tierFor(el) === 2) {
                const effectMod = await this._loadGenie();
                if (effectMod) {
                    try {
                        await effectMod.run(this, compositor, el, kind, entering);
                        return;
                    } catch (e) {
                        // Finding 2 (task-Bfix-brief.md): ANY thrown error --
                        // not just SnapshotError -- degrades THIS gesture to
                        // Tier 1 rather than dropping it (e.g. beginEffect's
                        // ensureCanvas() hitting a GL-init failure throws a
                        // plain-Error-wrapped SnapshotError today, but an
                        // unrelated genie.js bug could throw anything else --
                        // per the graceful-degradation invariant, a window
                        // must never be left blank/stranded/no-op just
                        // because ITS effect module misbehaved this one
                        // time). SnapshotError additionally demotes the
                        // window for the rest of the session -- that's
                        // specifically "this window can't be safely
                        // snapshotted", a stronger signal than "something
                        // threw once".
                        if (e && e.name === 'SnapshotError') this.demote(el, 1);
                        // fall through to Tier 1 below, for this gesture too
                    }
                }
                // effectMod is null: genie.js doesn't exist yet (404) -- the
                // exact post-B/pre-C-D state. Fall through to Tier 1 instead
                // of returning with nothing rendered.
            }
        }
        const tier1 = await this._loadTier1();
        tier1.run(this, el, kind, entering);
    },

    // Analogous Tier-2 branch for drag/wobble. Each of dragStart/dragMove/
    // dragEnd independently awaits the same cached `_loadTier2()`/
    // `_loadWobble()` promises -- since `_onDrag` is invoked synchronously,
    // in event-dispatch order, from `_wireEvents`' listeners, and every call
    // chains off THE SAME already-registered promises, microtask FIFO
    // ordering guarantees dragStart's continuation runs before dragMove's
    // even once those promises are long since settled (see compositor.js's
    // file-banner contract for what this means for wobble.js).
    async _onDrag(fn, detail) {
        const el = detail.el;
        if (this.tierFor(el) === 0) return;
        if (this.tierFor(el) === 2) {
            const compositor = await this._loadTier2();
            if (compositor && this.tierFor(el) === 2) {
                const wobble = await this._loadWobble();
                if (wobble) {
                    try {
                        await wobble[fn](this, compositor, detail);
                        return;
                    } catch (e) {
                        // Finding 2 (task-Bfix-brief.md): see the matching
                        // comment in `_runEffect` -- ANY thrown error falls
                        // through to Tier 1 for this event; only SnapshotError
                        // additionally demotes the window.
                        if (e && e.name === 'SnapshotError') this.demote(el, 1);
                        // fall through to Tier 1 for this event only -- see
                        // compositor.js's contract comment for why
                        // dragMove/dragEnd must tolerate a mid-gesture switch.
                    }
                }
            }
        }
        const tier1 = await this._loadTier1();
        tier1[fn](this, detail);
    },

    // Cached per-module dynamic-import promises for the Tier-2 effect
    // modules -- mirrors `_loadTier1`'s caching pattern. Each `.catch(() =>
    // null)` is the degradation path this whole file's regression-trap fix
    // depends on: genie.js/wobble.js not existing yet (404) resolves to
    // `null` here, which `_runEffect`/`_onDrag` treat as "fall through to
    // Tier 1", not as an error.
    _loadGenie() {
        if (!this._geniePromise) this._geniePromise = import('./genie.js').catch(() => null);
        return this._geniePromise;
    },

    _loadWobble() {
        if (!this._wobblePromise) this._wobblePromise = import('./wobble.js').catch(() => null);
        return this._wobblePromise;
    },
};
