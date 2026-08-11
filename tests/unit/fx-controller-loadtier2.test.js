// tests/unit/fx-controller-loadtier2.test.js
//
// task-Bfix Finding 1 ("suspenders"): direct, UNMOCKED-AT-THE-CONTROLLER-
// LEVEL proof that `FxController._loadTier2()`'s real implementation can
// never propagate a rejection, and therefore can never cache a rejected
// `_tier2Promise` -- the exact "poisoned session" failure mode described in
// task-Bfix-brief.md Finding 1 (an unguarded GL throw during warmup used to
// make `runWarmupProbe()` reject, `warmup()` cached that rejection forever,
// `_loadTier2()` re-threw it uncaught past `_runEffect`/`_onDrag`'s
// Tier-1 fallback, and every future Tier-2-candidate gesture in the session
// died silently as an unhandled rejection).
//
// Unlike tests/unit/fx-controller-tier2.test.js (which monkeypatches
// `_loadTier2` itself to test `_runEffect`/`_onDrag`'s routing AROUND it),
// this file exercises the REAL `_loadTier2()` body. Only `compositor.js`'s
// `warmup()` export is mocked (via `vi.mock`), standing in for "the belt fix
// (compositor.js's own runWarmupProbe()) somehow gets bypassed or reopened
// by a future change" -- proving the controller-side catch-all holds even
// then. compositor.js's OWN never-rejects guarantee is separately proven,
// unmocked, in tests/unit/compositor-warmup-failure.test.js and
// tests/e2e/fx-tier2.spec.js.
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../assets/iconostat/fx/compositor.js', () => ({
  warmup: () => Promise.reject(new Error('simulated: warmup rejected despite the belt fix')),
}));

import { FxController } from '../../assets/iconostat/fx/controller.js';

function resetController() {
  FxController.tier = 2;
  FxController._tier2Promise = null;
}

describe('FxController._loadTier2 (real implementation; compositor.warmup() mocked to reject)', () => {
  beforeEach(() => {
    resetController();
  });

  it('never rejects even when compositor.warmup() itself rejects -- demotes to Tier 1 and resolves null', async () => {
    await expect(FxController._loadTier2()).resolves.toBeNull();
    expect(FxController.tier).toBe(1);
  });

  it('the poisoned-cached-promise scenario cannot happen: the SAME cached promise resolves again on a second await (a second gesture)', async () => {
    const first = FxController._loadTier2();
    await expect(first).resolves.toBeNull();
    expect(FxController.tier).toBe(1);

    // _tier2Promise is cached (one load attempt per session, by design) --
    // the fix under test is that the cached value is a RESOLVED promise
    // (null), never a REJECTED one, so a second gesture awaiting the same
    // cache doesn't throw and doesn't need its own try/catch to survive.
    const second = FxController._loadTier2();
    expect(second).toBe(first);
    await expect(second).resolves.toBeNull();
    expect(FxController.tier).toBe(1);
  });
});
