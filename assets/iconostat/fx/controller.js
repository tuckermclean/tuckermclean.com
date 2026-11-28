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
    // el -> pending gesture { cancelled, cancel(jumpToEnd), release() }. A
    // gesture accepted by `_onBeforeMinMax` (default prevented) but whose
    // effect has not yet registered in `_inFlight` because `_runEffect` is
    // still awaiting a lazy module load. Kept apart from `_inFlight` so
    // genie/wobble, which read `_inFlight.get(el).name`, never see it.
    _pending: new Map(),
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
        const pending = Array.from(this._pending.values());
        this._pending.clear();
        pending.forEach((p) => p.cancel(jumpToEnd));
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

        // A bulk layout (cascade()/tile()) decides every open window's
        // geometry. A gesture still pending on an open window is abandoned,
        // as a running Tier 1 effect abandons on that layout's writes --
        // even when the layout rewrites the very same geometry, which no
        // MutationObserver sees. A pending chip restore (window still
        // minimized) is left to the layout's own un-minimize, see
        // `_onBeforeMinMax`.
        document.addEventListener('iconostat-before-layout', () => {
            Array.from(this._pending.entries()).forEach(([el, p]) => {
                if (el.classList.contains('minimized')) return;
                this._pending.delete(el);
                p.cancel(false);
            });
        });

        window.addEventListener('resize', () => this.cancelAll(true));
        window.addEventListener('orientationchange', () => this.cancelAll(true));
    },

    // Make a just-accepted gesture cancellable during the module-load gap.
    // Same semantics as a Tier-1 effect's own cancel: a controller cancel
    // with jumpToEnd, when nothing else touched `el`, commits the real
    // operation at once; any other layout change of `el` (tile(),
    // cascade() on an open window; not focus bookkeeping) means someone else decided the end state,
    // so abandon.
    _beginPending(el, kind, entering) {
        const prior = this._pending.get(el);
        if (prior) {
            // A second gesture on the same window while the first is still
            // loading: the newer gesture replaces the earlier placeholder,
            // which is dropped WITHOUT committing -- the newer gesture carries
            // the intent and itself commits or animates (for the same kind
            // the effect module's own stateMap may later coalesce/reverse).
            this._pending.delete(el);
            prior.cancel(false);
        }
        // Only a LAYOUT change counts as interference (tile()/cascade() writing
        // geometry, removing maximized/shaded). Focus bookkeeping -- the
        // `front` class token and z-index -- never decides the end state, so
        // it is ignored; so is anything while a drag on `el` is refused (see
        // `_onDrag`), which moves left/top but must not drop the gesture.
        const interference = (records) => {
            if (pending.dragging || records.length === 0) return false;
            const norm = {
                class: (v) =>
                    (v || '')
                        .split(/\s+/)
                        .filter((t) => t === 'minimized' || t === 'maximized' || t === 'shaded')
                        .sort()
                        .join(' '),
                style: (v) =>
                    (v || '')
                        .split(';')
                        .map((d) => d.trim())
                        .filter((d) => /^(width|height|top|left|position)\s*:/i.test(d))
                        .sort()
                        .join(';'),
            };
            for (const name of ['class', 'style']) {
                const rs = records.filter((r) => r.attributeName === name);
                if (!rs.length) continue;
                const seq = rs.map((r) => r.oldValue).concat([el.getAttribute(name)]);
                for (let i = 0; i + 1 < seq.length; i++) {
                    if (norm[name](seq[i]) !== norm[name](seq[i + 1])) return true;
                }
            }
            return false;
        };
        const observer = new MutationObserver((records) => {
            if (pending.cancelled || !armed) return;
            if (!interference(records)) return;
            pending.cancelled = true;
            observer.disconnect();
            if (this._pending.get(el) === pending) this._pending.delete(el);
        });
        observer.observe(el, { attributes: true, attributeOldValue: true, attributeFilter: ['class', 'style'] });
        // The gesture's own synchronous aftermath (focus/bringToFront class
        // changes in the same call stack as the before-event) is not
        // interference: discard those records once the stack unwinds. Queued
        // before any such mutation, so it runs before the observer callback.
        let armed = false;
        queueMicrotask(() => {
            observer.takeRecords();
            armed = true;
        });
        const pending = {
            kind,
            cancelled: false,
            dragging: false,
            dragged: false,
            cancel: (jumpToEnd) => {
                if (pending.cancelled) return;
                pending.cancelled = true;
                const interfered = armed && interference(observer.takeRecords());
                observer.disconnect();
                if (this._pending.get(el) === pending) this._pending.delete(el);
                if (jumpToEnd && !interfered) {
                    try {
                        el[kind](entering, { silent: true });
                    } catch (e) {
                        // never strand: nothing more to do
                    }
                }
            },
            // Hand over to the real effect (about to registerEffect itself).
            release: () => {
                observer.disconnect();
                if (this._pending.get(el) === pending) this._pending.delete(el);
            },
        };
        this._pending.set(el, pending);
        return pending;
    },

    _cancelFor(el) {
        const pending = this._pending.get(el);
        if (pending) {
            this._pending.delete(el);
            pending.cancel(true);
        }
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
            //
            // A gesture of the same kind still pending on `el` itself (e.g. a
            // chip restore waiting for its module when tile()/cascade()
            // restores that window): the programmatic operation now decides
            // `el`'s state and the library has already computed `entering`
            // from it, so the pending gesture is dropped, not committed --
            // committing it here would change `el` under the library's feet
            // (a restored window restored again throws). As an effect already
            // running would have, that window ends as the bulk op leaves it.
            const own = this._pending.get(el);
            if (own && own.kind === kind) {
                this._pending.delete(el);
                own.cancel(false);
            }
            if (this._inFlight.size > 0 || this._pending.size > 0) this.cancelAll(true);
            return;
        }
        if (this.tierFor(el) === 0) return; // shouldn't happen (init() never
        // wires listeners at tier 0), but keep this path inert regardless.
        e.preventDefault();
        this._runEffect(el, kind, entering, this._beginPending(el, kind, entering));
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
    async _runEffect(el, kind, entering, pending) {
        if (this.tierFor(el) === 2) {
            const compositor = await this._loadTier2();
            if (pending && pending.cancelled) return;
            // Re-check tierFor() AFTER the await, not just before it:
            // `_loadTier2()`'s warmup probe (first call only) or a
            // SnapshotError-driven per-window demote that raced in while we
            // were awaiting can both have dropped this window (or the whole
            // session) to Tier 1 in the meantime -- trusting a pre-await
            // snapshot of `tierFor(el)` here would let a just-demoted window
            // slip through to the tier-2 branch below anyway.
            if (compositor && this.tierFor(el) === 2) {
                const effectMod = await this._loadGenie();
                if (pending && pending.cancelled) return;
                if (effectMod) {
                    if (kind === 'maximize') {
                        // Open item (impact-wobble warm-load, see progress.md
                        // task-D report / task-F-brief.md #1): wobble.js's
                        // maximize-completion impact-jiggle listener is wired
                        // via a plain `document.addEventListener
                        // ('iconostat-fx-done', ...)` at MODULE-EVAL time
                        // (see wobble.js's file banner + its bottom-of-file
                        // `if (typeof document !== 'undefined')` block) -- it
                        // only exists once wobble.js has actually been
                        // imported at least once THIS session. Before this
                        // fix, the only call site that ever imported
                        // wobble.js was `_onDrag` (a real drag gesture), so a
                        // session that maximizes a window before ever
                        // dragging one got no impact jiggle for that first
                        // maximize (and every maximize before the first
                        // drag). Fire-and-forget `_loadWobble()` here --
                        // deliberately NOT awaited -- warms it in parallel
                        // with `effectMod.run()` below: genie's own
                        // choreography (150ms) gives the dynamic import
                        // plenty of time to resolve and register the
                        // listener well before `run()` reaches its own
                        // `iconostat-fx-done` dispatch at the end. Covers
                        // BOTH maximize and unmaximize (kind==='maximize'
                        // covers both; `entering` distinguishes them) per
                        // the open item's wording, even though
                        // wobble.js's `onFxDone` only actually reacts to
                        // `effect==='maximize'` (entering:true) --
                        // importing on unmaximize too is harmless (no
                        // canvas/GL is created by the import itself, only by
                        // an actual drag or impact invocation) and keeps
                        // this call site simple. Already Tier-2-only (this
                        // whole branch is gated on `tierFor(el) === 2`
                        // above) -- never runs at Tier 0/1, so it can't
                        // violate "reduced-motion/Tier 0 = zero canvas/GL".
                        // `_loadWobble()` already resolves to `null` (never
                        // rejects, see its own `.catch(() => null)`) on a
                        // 404/import failure, so this can't introduce a new
                        // unhandled-rejection path either.
                        //
                        // Loading the module alone only wires the LISTENER,
                        // though -- `runImpactWobble()` also needs a live
                        // `compositor` reference (normally supplied by
                        // `dragStart`, see wobble.js's "Impact wobble:
                        // compositor caching" file-banner section), which a
                        // session with no prior drag would never otherwise
                        // have. Supply it here too, once the import
                        // resolves, via the same `compositor` this function
                        // already has in hand from its own `_loadTier2()`
                        // above -- `primeCompositor()` is idempotent
                        // (first-write-wins) so this composes safely
                        // whichever order a real drag vs. this warm-load
                        // happens to resolve in.
                        // Guard on the function's presence, not just
                        // `wobble` truthiness: a resolved module namespace
                        // object without `primeCompositor` (e.g. a test
                        // double/stub -- see tests/unit/fx-controller-tier2
                        // .test.js's aliased empty-fx-module.js stub, which
                        // `_loadWobble()`'s REAL import() resolves to for any
                        // test that doesn't monkeypatch `_loadWobble` itself)
                        // must degrade to a no-op here, exactly like every
                        // other optional-capability check in this file,
                        // rather than throwing an unhandled rejection out of
                        // this un-awaited `.then()`.
                        this._loadWobble().then((wobble) => {
                            if (wobble && typeof wobble.primeCompositor === 'function') wobble.primeCompositor(compositor);
                        });
                    }
                    if (pending) pending.release();
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
        let tier1;
        try {
            tier1 = await this._loadTier1();
        } catch (e) {
            // tier1.js failed to load: never strand -- commit the real
            // operation at once, as Tier 0 would, and clear the placeholder.
            if (pending) pending.cancel(true);
            else {
                try {
                    el[kind](entering, { silent: true });
                } catch (err) {
                    // nothing more to do
                }
            }
            return;
        }
        if (pending) {
            if (pending.cancelled) return;
            // A drag ran during the gap (the library moved left/top, which the
            // effect's interference watcher would read as someone else's
            // decision): commit at once, as the base's jump-cut did.
            if (pending.dragged) {
                pending.cancel(true);
                return;
            }
            pending.release();
        }
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
        // A minimize/maximize still loading its effect module owns `el`: a
        // drag on it is refused like genie refuses one (F05-AC-8) -- the drag
        // itself proceeds unanimated and must neither ghost the window nor
        // drop the pending gesture.
        const held = this._pending.get(el);
        if (held) {
            if (fn === 'dragStart') held.dragging = held.dragged = true;
            else if (fn === 'dragEnd') held.dragging = false;
            return;
        }
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
