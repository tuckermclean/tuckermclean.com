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

  it('genie.run() throws a NON-SnapshotError -> propagates, does not silently fall back to tier1', async () => {
    const fakeCompositor = {};
    const boom = new Error('an unrelated genie.js bug');
    const genieRun = vi.fn().mockRejectedValue(boom);
    const tier1Run = vi.fn();
    FxController._loadTier2 = async () => fakeCompositor;
    FxController._loadGenie = async () => ({ run: genieRun });
    FxController._loadTier1 = async () => ({ run: tier1Run });

    const el = makeEl();
    await expect(FxController._runEffect(el, 'minimize', true)).rejects.toBe(boom);
    expect(tier1Run).not.toHaveBeenCalled();
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
