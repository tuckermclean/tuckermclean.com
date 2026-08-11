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
// WebGL2 -- combined, when Agent B's compositor lands, with its warmup
// verdict (treated as "capable" until that module exists).
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
    // Per-window tier ceiling (SnapshotError demotions, fed in by the
    // compositor once it exists; a plain WeakMap keeps this a no-op today).
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

    // Tier-2 modules (compositor.js/genie.js/wobble.js) are not built by
    // this agent -- Agents B/C/D land them later, unchanged against this
    // same call site. Until they exist, this import always rejects (404),
    // which is exactly the degradation path this try/catch exists to
    // exercise: demote to Tier 1 for the rest of the session and let the
    // caller fall through to the Tier-1 effect.
    async _loadTier2() {
        try {
            return await import('./compositor.js');
        } catch (e) {
            this.tier = 1;
            return null;
        }
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

    async _runEffect(el, kind, entering) {
        if (this.tierFor(el) === 2) {
            const compositor = await this._loadTier2();
            if (compositor) {
                // Tier-2 choreography (genie.js/wobble.js) is wired here once
                // Agents C/D land it -- same call site, no controller change
                // needed. Until then `_loadTier2()` always demotes to 1
                // above, so this branch is unreachable today.
                return;
            }
            // fallthrough: demoted to Tier 1 by _loadTier2()'s catch.
        }
        const tier1 = await this._loadTier1();
        tier1.run(this, el, kind, entering);
    },

    _onDrag(fn, detail) {
        if (this.tierFor(detail.el) === 0) return;
        this._loadTier1().then((m) => m[fn](this, detail));
    },
};
