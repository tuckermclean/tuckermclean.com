// tests/unit/fx-controller-tier2.test.js
//
// Direct unit coverage of controller.js's Tier-2 routing logic in
// `_runEffect`/`_onDrag` -- the exact regression-trap fix and the
// SnapshotError -> per-window-demote wiring described in the task-B brief.
// genie.js/wobble.js don't exist yet (Agents C/D land them later), so
// there's no real end-to-end way to drive this through a live gesture with a
// real effect module; instead, this monkeypatches `FxController`'s own
// loader methods (`_loadTier2`/`_loadGenie`/`_loadWobble`/`_loadTier1`) with
// fakes, which is safe and direct because `FxController` is a plain exported
// object (not a class with private closures) -- exactly the same technique
// `tierOverride` uses for `computeTier()`. This is a *narrower*, faster,
// more deterministic complement to the e2e proof in fx-tier2.spec.js (which
// drives a REAL gesture against the REAL, unmocked `_loadGenie()`/
// `_loadWobble()` 404-and-fall-through path).
import { describe, it, expect, beforeEach, vi } from 'vitest';
// See vitest.config.js's `resolve.alias` for why this import works at all:
// controller.js's `import('./genie.js')`/`import('./wobble.js')` reference
// files that don't exist yet (Agents C/D land them later) -- aliased to an
// inert stub purely so Vite's parser can load this file under vitest. Every
// test below monkeypatches `_loadGenie`/`_loadWobble` directly, so that stub
// is never actually exercised.
import { FxController } from '../../assets/iconostat/fx/controller.js';

function makeEl() {
  // Fake enough of an <iconostat-window> for the routing logic under test --
  // it never actually reaches tier1.js/genie.js's real DOM manipulation in
  // these tests (both are replaced by fakes), so a plain object is enough.
  return {};
}

function resetController() {
  FxController._initialized = false;
  FxController.tier = 2;
  FxController._demotions = new WeakMap();
  FxController._tier1Promise = null;
  FxController._tier2Promise = null;
  FxController._geniePromise = null;
  FxController._wobblePromise = null;
}

describe('FxController tier-2 routing (_runEffect)', () => {
  beforeEach(() => {
    resetController();
  });

  it('THE REGRESSION TRAP: compositor present, genie ABSENT -> falls through to tier1.run, does not swallow the gesture', async () => {
    const fakeCompositor = {};
    const tier1Run = vi.fn();
    FxController._loadTier2 = async () => fakeCompositor;
    FxController._loadGenie = async () => null; // the exact post-B/pre-C-D 404 state
    FxController._loadTier1 = async () => ({ run: tier1Run });

    const el = makeEl();
    await FxController._runEffect(el, 'minimize', true);

    expect(tier1Run).toHaveBeenCalledTimes(1);
    expect(tier1Run).toHaveBeenCalledWith(FxController, el, 'minimize', true);
  });

  it('compositor + genie both present -> invokes genie.run with the documented signature, tier1 NOT invoked', async () => {
    const fakeCompositor = { drawMesh: vi.fn() };
    const genieRun = vi.fn().mockResolvedValue(undefined);
    const tier1Run = vi.fn();
    FxController._loadTier2 = async () => fakeCompositor;
    FxController._loadGenie = async () => ({ run: genieRun });
    FxController._loadTier1 = async () => ({ run: tier1Run });

    const el = makeEl();
    await FxController._runEffect(el, 'maximize', false);

    expect(genieRun).toHaveBeenCalledTimes(1);
    expect(genieRun).toHaveBeenCalledWith(FxController, fakeCompositor, el, 'maximize', false);
    expect(tier1Run).not.toHaveBeenCalled();
  });

  it('genie.run() throws SnapshotError -> demotes el to Tier 1 and falls through to tier1.run', async () => {
    const fakeCompositor = {};
    const err = new Error('cross-origin');
    err.name = 'SnapshotError';
    const genieRun = vi.fn().mockRejectedValue(err);
    const tier1Run = vi.fn();
    FxController._loadTier2 = async () => fakeCompositor;
    FxController._loadGenie = async () => ({ run: genieRun });
    FxController._loadTier1 = async () => ({ run: tier1Run });
    const demoteSpy = vi.spyOn(FxController, 'demote');

    const el = makeEl();
    await FxController._runEffect(el, 'minimize', true);

    expect(demoteSpy).toHaveBeenCalledWith(el, 1);
    expect(tier1Run).toHaveBeenCalledTimes(1);
    demoteSpy.mockRestore();
  });

  // task-Bfix Finding 2: a plain (non-SnapshotError) throw from the Tier-2
  // effect module used to propagate uncaught out of `_runEffect`, past the
  // Tier-1 fallback below it -- since `_onBeforeMinMax` calls `_runEffect`
  // without awaiting, that dropped the gesture silently (no animation, no
  // end state, no error surfaced anywhere). Per the graceful-degradation
  // invariant, ANY thrown error must degrade THIS gesture to Tier 1 instead
  // -- only a SnapshotError additionally demotes the window session-wide
  // (that's a distinct, stronger signal: "this window can't be safely
  // snapshotted", not "something threw once").
  it('genie.run() throws a NON-SnapshotError -> still falls through to tier1.run (gesture degrades, is not dropped); window is NOT demoted', async () => {
    const fakeCompositor = {};
    const boom = new Error('an unrelated genie.js bug');
    const genieRun = vi.fn().mockRejectedValue(boom);
    const tier1Run = vi.fn();
    FxController._loadTier2 = async () => fakeCompositor;
    FxController._loadGenie = async () => ({ run: genieRun });
    FxController._loadTier1 = async () => ({ run: tier1Run });
    const demoteSpy = vi.spyOn(FxController, 'demote');

    const el = makeEl();
    await FxController._runEffect(el, 'minimize', true);

    expect(tier1Run).toHaveBeenCalledTimes(1);
    expect(tier1Run).toHaveBeenCalledWith(FxController, el, 'minimize', true);
    expect(demoteSpy).not.toHaveBeenCalled(); // non-SnapshotError -> this gesture degrades, but the window itself isn't permanently demoted
    demoteSpy.mockRestore();
  });

  it('_loadTier2 demoting the session to Tier 1 (warmup verdict) -> falls through to tier1.run', async () => {
    // Simulates _loadTier2()'s real behavior when compositor.warmup() says
    // "demote": it returns null AND sets this.tier = 1 session-wide.
    const tier1Run = vi.fn();
    FxController._loadTier2 = async () => {
      FxController.tier = 1;
      return null;
    };
    FxController._loadGenie = async () => { throw new Error('must not be reached -- tierFor() should already read 1'); };
    FxController._loadTier1 = async () => ({ run: tier1Run });

    const el = makeEl();
    await FxController._runEffect(el, 'minimize', true);

    expect(tier1Run).toHaveBeenCalledTimes(1);
  });

  it('el already demoted to Tier 1 (prior SnapshotError this session) -> never even attempts Tier 2', async () => {
    const loadTier2 = vi.fn();
    const tier1Run = vi.fn();
    FxController._loadTier2 = loadTier2;
    FxController._loadTier1 = async () => ({ run: tier1Run });

    const el = makeEl();
    FxController.demote(el, 1);
    await FxController._runEffect(el, 'minimize', true);

    expect(loadTier2).not.toHaveBeenCalled();
    expect(tier1Run).toHaveBeenCalledTimes(1);
  });
});

describe('FxController tier-2 routing (_onDrag)', () => {
  beforeEach(() => {
    resetController();
  });

  it('compositor present, wobble ABSENT -> falls through to tier1[fn]', async () => {
    const fakeCompositor = {};
    const tier1DragStart = vi.fn();
    FxController._loadTier2 = async () => fakeCompositor;
    FxController._loadWobble = async () => null;
    FxController._loadTier1 = async () => ({ dragStart: tier1DragStart });

    const el = makeEl();
    const detail = { el, x: 1, y: 2 };
    await FxController._onDrag('dragStart', detail);

    expect(tier1DragStart).toHaveBeenCalledWith(FxController, detail);
  });

  it('compositor + wobble present -> invokes wobble[fn] with the documented signature', async () => {
    const fakeCompositor = {};
    const wobbleDragMove = vi.fn();
    const tier1DragMove = vi.fn();
    FxController._loadTier2 = async () => fakeCompositor;
    FxController._loadWobble = async () => ({ dragMove: wobbleDragMove });
    FxController._loadTier1 = async () => ({ dragMove: tier1DragMove });

    const el = makeEl();
    const detail = { el, x: 5, y: 6, left: 7, top: 8 };
    await FxController._onDrag('dragMove', detail);

    expect(wobbleDragMove).toHaveBeenCalledWith(FxController, fakeCompositor, detail);
    expect(tier1DragMove).not.toHaveBeenCalled();
  });

  it('wobble[fn] throws SnapshotError -> demotes el to Tier 1 and falls through to tier1[fn] for that event', async () => {
    const fakeCompositor = {};
    const err = new Error('taint');
    err.name = 'SnapshotError';
    const wobbleDragStart = vi.fn().mockRejectedValue(err);
    const tier1DragStart = vi.fn();
    FxController._loadTier2 = async () => fakeCompositor;
    FxController._loadWobble = async () => ({ dragStart: wobbleDragStart });
    FxController._loadTier1 = async () => ({ dragStart: tier1DragStart });
    const demoteSpy = vi.spyOn(FxController, 'demote');

    const el = makeEl();
    const detail = { el, x: 1, y: 2 };
    await FxController._onDrag('dragStart', detail);

    expect(demoteSpy).toHaveBeenCalledWith(el, 1);
    expect(tier1DragStart).toHaveBeenCalledWith(FxController, detail);
    demoteSpy.mockRestore();
  });

  // task-Bfix Finding 2, drag/wobble side of the same fix.
  it('wobble[fn] throws a NON-SnapshotError -> still falls through to tier1[fn] for that event; not demoted', async () => {
    const fakeCompositor = {};
    const boom = new Error('an unrelated wobble.js bug');
    const wobbleDragMove = vi.fn().mockRejectedValue(boom);
    const tier1DragMove = vi.fn();
    FxController._loadTier2 = async () => fakeCompositor;
    FxController._loadWobble = async () => ({ dragMove: wobbleDragMove });
    FxController._loadTier1 = async () => ({ dragMove: tier1DragMove });
    const demoteSpy = vi.spyOn(FxController, 'demote');

    const el = makeEl();
    const detail = { el, x: 3, y: 4, left: 5, top: 6 };
    await FxController._onDrag('dragMove', detail);

    expect(tier1DragMove).toHaveBeenCalledWith(FxController, detail);
    expect(demoteSpy).not.toHaveBeenCalled();
    demoteSpy.mockRestore();
  });

  it('Tier 0 never loads anything', async () => {
    FxController.tier = 0;
    const loadTier1 = vi.fn();
    const loadTier2 = vi.fn();
    FxController._loadTier1 = loadTier1;
    FxController._loadTier2 = loadTier2;

    await FxController._onDrag('dragStart', { el: makeEl(), x: 0, y: 0 });

    expect(loadTier1).not.toHaveBeenCalled();
    expect(loadTier2).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// T06 pins: behaviour of controller.js/tier1.js/fx.css at the node's head that
// the node keeps (F01-AC-9, -11, -12, -16, -18, -28). Each pass today.
// ---------------------------------------------------------------------------
import { readFileSync } from 'node:fs';
import { resolve as t06Resolve, dirname as t06Dirname } from 'node:path';

function t06Reset() {
  resetController();
  FxController._inFlight.clear();
  FxController._pending.clear();
}

function t06Wire() {
  if (!FxController._listenersWired) FxController._wireEvents();
}

describe('T06 pin: F01-AC-9 programmatic before-event cancels every running effect', () => {
  beforeEach(() => {
    t06Reset();
    t06Wire();
  });

  it('F01-AC-9: a programmatic before-minimize while effects run cancels every running effect with jumpToEnd=true', () => {
    const cancelA = vi.fn();
    const cancelB = vi.fn();
    const a = makeEl();
    const b = makeEl();
    FxController.registerEffect(a, 'genie', cancelA);
    FxController.registerEffect(b, 'genie', cancelB);

    const ev = new CustomEvent('iconostat-before-minimize', {
      detail: { el: makeEl(), entering: true, userGesture: false },
      cancelable: true,
    });
    document.dispatchEvent(ev);

    expect(cancelA).toHaveBeenCalledTimes(1);
    expect(cancelA).toHaveBeenCalledWith(true);
    expect(cancelB).toHaveBeenCalledTimes(1);
    expect(cancelB).toHaveBeenCalledWith(true);
    expect(FxController._inFlight.size).toBe(0);
    expect(ev.defaultPrevented).toBe(false);
  });
});

describe('T06 pin: F01-AC-11 orientationchange, resize-start and a throwing cancel', () => {
  beforeEach(() => {
    t06Reset();
    t06Wire();
  });

  it('F01-AC-11 (orientationchange): cancels every running effect with jumpToEnd=true', () => {
    const cancelA = vi.fn();
    const cancelB = vi.fn();
    FxController.registerEffect(makeEl(), 'genie', cancelA);
    FxController.registerEffect(makeEl(), 'wobble', cancelB);

    window.dispatchEvent(new Event('orientationchange'));

    expect(cancelA).toHaveBeenCalledWith(true);
    expect(cancelB).toHaveBeenCalledWith(true);
    expect(FxController._inFlight.size).toBe(0);
  });

  it('F01-AC-11 (resize-start): cancels the effect on that window only, with jumpToEnd=true', () => {
    const cancelA = vi.fn();
    const cancelB = vi.fn();
    const a = makeEl();
    const b = makeEl();
    FxController.registerEffect(a, 'genie', cancelA);
    FxController.registerEffect(b, 'genie', cancelB);

    document.dispatchEvent(new CustomEvent('iconostat-resize-start', { detail: { el: a } }));

    expect(cancelA).toHaveBeenCalledTimes(1);
    expect(cancelA).toHaveBeenCalledWith(true);
    expect(cancelB).not.toHaveBeenCalled();
    expect(FxController._inFlight.has(a)).toBe(false);
    expect(FxController._inFlight.has(b)).toBe(true);
  });

  it('F01-AC-11 (throwing cancel): cancelAll() still cancels the rest when one cancel function throws', () => {
    const cancelFirst = vi.fn(() => {
      throw new Error('cancel blew up');
    });
    const cancelRest = vi.fn();
    const cancelLast = vi.fn();
    FxController.registerEffect(makeEl(), 'genie', cancelFirst);
    FxController.registerEffect(makeEl(), 'genie', cancelRest);
    FxController.registerEffect(makeEl(), 'wobble', cancelLast);

    expect(() => FxController.cancelAll(true)).not.toThrow();

    expect(cancelFirst).toHaveBeenCalledTimes(1);
    expect(cancelRest).toHaveBeenCalledWith(true);
    expect(cancelLast).toHaveBeenCalledWith(true);
    expect(FxController._inFlight.size).toBe(0);
  });
});

describe('T06 pin: F01-AC-12 registerEffect cancels an effect already on the window', () => {
  beforeEach(() => {
    t06Reset();
  });

  it('F01-AC-12: registering a second effect on el first cancels the earlier one with jumpToEnd=true, so effects never stack', () => {
    const el = makeEl();
    const other = makeEl();
    const cancelOld = vi.fn();
    const cancelOther = vi.fn();
    const cancelNew = vi.fn();
    FxController.registerEffect(el, 'genie', cancelOld);
    FxController.registerEffect(other, 'genie', cancelOther);

    const handle = FxController.registerEffect(el, 'wobble', cancelNew);

    expect(cancelOld).toHaveBeenCalledTimes(1);
    expect(cancelOld).toHaveBeenCalledWith(true);
    expect(cancelOther).not.toHaveBeenCalled();
    expect(cancelNew).not.toHaveBeenCalled();
    expect(FxController._inFlight.get(el)).toBe(handle);
    expect(handle.name).toBe('wobble');
  });
});

describe('T06 pin: F01-AC-16 tierFor(el) is read again after the compositor loads', () => {
  beforeEach(() => {
    t06Reset();
  });

  it('F01-AC-16 (_runEffect): a demotion landing while the compositor loads sends the gesture to Tier 1, genie not loaded', async () => {
    const el = makeEl();
    const tier1Run = vi.fn();
    const loadGenie = vi.fn(async () => ({ run: vi.fn() }));
    FxController._loadTier2 = async () => {
      FxController.demote(el, 1); // lands while the compositor is loading
      return {};
    };
    FxController._loadGenie = loadGenie;
    FxController._loadTier1 = async () => ({ run: tier1Run });

    await FxController._runEffect(el, 'minimize', true);

    expect(loadGenie).not.toHaveBeenCalled();
    expect(tier1Run).toHaveBeenCalledTimes(1);
    expect(tier1Run).toHaveBeenCalledWith(FxController, el, 'minimize', true);
  });

  it('F01-AC-16 (_onDrag): a demotion landing while the compositor loads sends the drag event to Tier 1, wobble not loaded', async () => {
    const el = makeEl();
    const tier1DragMove = vi.fn();
    const loadWobble = vi.fn(async () => ({ dragMove: vi.fn() }));
    FxController._loadTier2 = async () => {
      FxController.demote(el, 1);
      return {};
    };
    FxController._loadWobble = loadWobble;
    FxController._loadTier1 = async () => ({ dragMove: tier1DragMove });

    const detail = { el, x: 1, y: 2, left: 3, top: 4 };
    await FxController._onDrag('dragMove', detail);

    expect(loadWobble).not.toHaveBeenCalled();
    expect(tier1DragMove).toHaveBeenCalledWith(FxController, detail);
  });
});

describe('T06 pin: F01-AC-18 a Tier 2 maximize warms wobble.js and primes its compositor', () => {
  beforeEach(() => {
    t06Reset();
  });

  it('F01-AC-18 (warm load, no wait): a Tier 2 maximize starts _loadWobble() and runs genie without waiting for it', async () => {
    const compositor = { id: 'c' };
    let resolveWobble;
    const wobblePromise = new Promise((r) => { resolveWobble = r; });
    const loadWobble = vi.fn(() => wobblePromise);
    const genieRun = vi.fn().mockResolvedValue(undefined);
    FxController._loadTier2 = async () => compositor;
    FxController._loadGenie = async () => ({ run: genieRun });
    FxController._loadWobble = loadWobble;
    FxController._loadTier1 = async () => ({ run: vi.fn() });

    const el = makeEl();
    await FxController._runEffect(el, 'maximize', true); // resolves although wobble never has

    expect(loadWobble).toHaveBeenCalledTimes(1);
    expect(genieRun).toHaveBeenCalledWith(FxController, compositor, el, 'maximize', true);
    resolveWobble(null);
  });

  it('F01-AC-18 (primeCompositor): wobble.primeCompositor() is handed the compositor once wobble loads', async () => {
    const compositor = { id: 'c' };
    const primeCompositor = vi.fn();
    FxController._loadTier2 = async () => compositor;
    FxController._loadGenie = async () => ({ run: vi.fn().mockResolvedValue(undefined) });
    FxController._loadWobble = async () => ({ primeCompositor });
    FxController._loadTier1 = async () => ({ run: vi.fn() });

    await FxController._runEffect(makeEl(), 'maximize', true);
    await new Promise((r) => setTimeout(r, 0));

    expect(primeCompositor).toHaveBeenCalledTimes(1);
    expect(primeCompositor).toHaveBeenCalledWith(compositor);
  });

  it('F01-AC-18 (wobble missing): a null wobble module is tolerated, the maximize still runs genie', async () => {
    const genieRun = vi.fn().mockResolvedValue(undefined);
    FxController._loadTier2 = async () => ({});
    FxController._loadGenie = async () => ({ run: genieRun });
    FxController._loadWobble = async () => null;
    FxController._loadTier1 = async () => ({ run: vi.fn() });

    await FxController._runEffect(makeEl(), 'maximize', true);
    await new Promise((r) => setTimeout(r, 0));

    expect(genieRun).toHaveBeenCalledTimes(1);
  });

  it('F01-AC-18 (minimize): a Tier 2 minimize does not load wobble', async () => {
    const loadWobble = vi.fn(async () => ({ primeCompositor: vi.fn() }));
    FxController._loadTier2 = async () => ({});
    FxController._loadGenie = async () => ({ run: vi.fn().mockResolvedValue(undefined) });
    FxController._loadWobble = loadWobble;
    FxController._loadTier1 = async () => ({ run: vi.fn() });

    await FxController._runEffect(makeEl(), 'minimize', true);

    expect(loadWobble).not.toHaveBeenCalled();
  });
});

describe('T06 pin: F01-AC-28 fx/controller.js, tier1.js and fx.css import nothing from the site or the library', () => {
  const fxDir = t06Resolve(__dirname, '../../assets/iconostat/fx');

  function stripJsComments(src) {
    return src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .filter((l) => !/^\s*\/\//.test(l))
      .map((l) => l.replace(/\s\/\/.*$/, ''))
      .join('\n');
  }

  function specifiers(src) {
    const code = stripJsComments(src);
    const found = [];
    const patterns = [
      /\bimport\s*\(\s*['"`]([^'"`]+)['"`]/g, // dynamic
      /\bfrom\s*['"`]([^'"`]+)['"`]/g, // static import ... from / export ... from
      /(?:^|[;\s])import\s*['"`]([^'"`]+)['"`]/g, // bare import 'x'
    ];
    for (const re of patterns) {
      let m;
      while ((m = re.exec(code))) found.push(m[1]);
    }
    return found;
  }

  for (const name of ['controller.js', 'tier1.js']) {
    it(`F01-AC-28: ${name} imports only relative modules that resolve inside assets/iconostat/fx/`, () => {
      const src = readFileSync(t06Resolve(fxDir, name), 'utf8');
      const specs = specifiers(src);
      for (const s of specs) {
        expect(s.startsWith('./') || s.startsWith('../'), `${name}: ${s} is not relative`).toBe(true);
        const target = t06Resolve(fxDir, s);
        expect(t06Dirname(target), `${name}: ${s} leaves fx/`).toBe(fxDir);
      }
      if (name === 'controller.js') {
        expect(specs.sort()).toEqual(['./compositor.js', './genie.js', './tier1.js', './wobble.js']);
      }
    });
  }

  it('F01-AC-28: fx.css has no @import and no url() reaching outside fx/', () => {
    const css = readFileSync(t06Resolve(fxDir, 'fx.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(css).not.toMatch(/@import/);
    expect(css).not.toMatch(/url\(\s*['"]?(\.\.\/|\/)/);
  });
});
