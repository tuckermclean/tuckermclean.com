// tests/unit/fx-supersede-handling.test.js
//
// task-B2fix -- unit coverage of genie.js's and wobble.js's OWN half of the
// beginEffect() race fix: catching compositor.js's new
// `EffectSupersededError` and abandoning quietly (no `endEffect`, no
// rethrow, no `iconostat-fx-done`). This is deliberately NOT the same kind
// of test genie.test.js/wobble.test.js's own header comments describe as
// "nothing honest to assert" under jsdom (that's about the REAL WebGL2/rAF/
// layout choreography, exercised for real by the e2e suite) -- this test
// never reaches any of that. `beginEffect()` rejects before genie.js/
// wobble.js ever touch drawMesh/rAF/tween, so a plain fake `compositor`/
// `controller` (matching the exact C/D call-site contract documented in
// compositor.js's file banner) is enough to exercise the real catch-and-
// abandon control flow in genie.js/wobble.js themselves, honestly.
//
// Pairs with tests/unit/compositor-begin-effect-race.test.js, which proves
// the OTHER half: that compositor.js's beginEffect() itself throws
// EffectSupersededError instead of corrupting shared state. Together they
// cover the full task-B2fix fix -- compositor.js's guard AND genie.js's/
// wobble.js's "don't end what you didn't begin" + supersede-abandon
// discipline.
import { describe, it, expect, vi } from 'vitest';
import { run } from '../../assets/iconostat/fx/genie.js';
import { dragStart } from '../../assets/iconostat/fx/wobble.js';
import { EffectSupersededError } from '../../assets/iconostat/fx/compositor.js';

function fakeController() {
    return {
        _inFlight: new Map(),
        registerEffect: vi.fn(),
        unregisterEffect: vi.fn(),
    };
}

function listenOnce(eventName) {
    const spy = vi.fn();
    document.addEventListener(eventName, spy);
    return { spy, remove: () => document.removeEventListener(eventName, spy) };
}

describe('genie.run() abandons quietly on EffectSupersededError (task-B2fix)', () => {
    it('maximize: resolves (does not reject), never calls endEffect, never dispatches iconostat-fx-done', async () => {
        const el = {
            name: 'w-maximize',
            classList: { add: vi.fn(), remove: vi.fn(), contains: () => false },
            getBoundingClientRect: () => ({ left: 0, top: 0, width: 200, height: 150 }),
            maximize: vi.fn(),
        };
        const compositor = {
            beginEffect: vi.fn().mockRejectedValue(new EffectSupersededError('test: superseded')),
            endEffect: vi.fn(),
            drawMesh: vi.fn(),
        };
        const controller = fakeController();
        const done = listenOnce('iconostat-fx-done');

        try {
            // Must RESOLVE -- rethrowing would make controller.js's
            // _runEffect fall through to Tier 1 for this gesture, double-
            // animating el on top of whatever superseded us.
            await expect(run(controller, compositor, el, 'maximize', true)).resolves.toBeUndefined();
            // el was never actually maximized by US (the superseding effect
            // owns that responsibility) -- we abandoned before committing.
            expect(el.maximize).not.toHaveBeenCalled();
            expect(compositor.endEffect).not.toHaveBeenCalled();
            expect(done.spy).not.toHaveBeenCalled();
        } finally {
            done.remove();
        }
    });

    it('restore (entering=false): commits the real restore (no-flash dance already ran) but never reverts to chip, never calls endEffect, never rethrows', async () => {
        const el = {
            name: 'w-restore',
            classList: { add: vi.fn(), remove: vi.fn(), contains: () => true },
            getBoundingClientRect: () => ({ left: 0, top: 0, width: 200, height: 150 }),
            minimize: vi.fn(),
            querySelectorAll: () => [],
        };
        const compositor = {
            beginEffect: vi.fn().mockRejectedValue(new EffectSupersededError('test: superseded')),
            endEffect: vi.fn(),
            drawMesh: vi.fn(),
        };
        const controller = fakeController();
        const done = listenOnce('iconostat-fx-done');

        try {
            // kind='minimize', entering=false -> the restore branch.
            await expect(run(controller, compositor, el, 'minimize', false)).resolves.toBeUndefined();
            // The real restore commit happens BEFORE beginEffect (the
            // documented no-flash dance) -- that already ran and must NOT
            // be reverted just because our OWN beginEffect lost the race.
            expect(el.minimize).toHaveBeenCalledTimes(1);
            expect(el.minimize).toHaveBeenCalledWith(false, { silent: true });
            expect(compositor.endEffect).not.toHaveBeenCalled();
            expect(done.spy).not.toHaveBeenCalled();
        } finally {
            done.remove();
        }
    });
});

describe('wobble.dragStart() abandons quietly on EffectSupersededError (task-B2fix)', () => {
    it('resolves (does not reject/throw), never calls endEffect, never unregisters the (now-superseding) registry entry', async () => {
        const el = {
            name: 'w-drag',
            getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 80 }),
            querySelector: () => null,
        };
        const compositor = {
            beginEffect: vi.fn().mockRejectedValue(new EffectSupersededError('test: superseded')),
            endEffect: vi.fn(),
        };
        const controller = fakeController();

        // Must RESOLVE -- rethrowing would make controller.js's _onDrag
        // fall through to Tier 1 for this event, double-animating el.
        await expect(dragStart(controller, compositor, { el, x: 10, y: 10 })).resolves.toBeUndefined();

        expect(compositor.endEffect).not.toHaveBeenCalled();
        // Must NOT call controller.unregisterEffect(el): by the time
        // beginEffect() can possibly reject with EffectSupersededError, a
        // NEWER effect's own registerEffect() call has already jump-cut our
        // placeholder and installed ITS OWN live handle for el -- blindly
        // unregistering here (controller.unregisterEffect is an unconditional
        // `_inFlight.delete(el)`, no identity check) would strand the
        // superseding effect's ability to be cancelled by a later
        // resize/cancelAll.
        expect(controller.unregisterEffect).not.toHaveBeenCalled();
    });
});
