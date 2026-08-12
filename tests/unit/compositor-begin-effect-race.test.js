// tests/unit/compositor-begin-effect-race.test.js
//
// task-B2fix -- deterministic regression test for the beginEffect() swap-
// protocol race a cross-cutting review found: two beginEffect(el) calls for
// the SAME el, with the async snapshot() resolving in REVERSE start order
// (the LATER-started call's snapshot resolves FIRST). Before the fix, the
// late-resolving (OLDER) call ran its bookkeeping unconditionally --
// GL-deleting the newer call's LIVE texture, overwriting `elTexture` with
// its own now-orphaned one, and double-incrementing `activeEffectCount` so
// the shared `#iconostat-fx-canvas` could never return to `display:none`
// for the rest of the session (see compositor.js's file banner and
// task-B2fix-brief.md for the full reachable single-pointer sequence: abort
// a wobble drag mid-snapshot, then maximize the same window before the
// aborted drag's beginEffect() resolves).
//
// This test proves the fix (`beginGen`, a per-el generation guard in
// beginEffect -- see compositor.js): the OLDER call must reject with the new
// `EffectSupersededError`, having touched NONE of `elTexture` /
// `activeEffectCount` / `fx-ghost` / canvas visibility, while the NEWER call
// keeps sole, uncorrupted ownership of its own texture/canvas -- and the
// canvas returns to `display:none` only once, when the WINNER's own
// `endEffect()` runs.
//
// Proven load-bearing (not a tautology): reverting compositor.js's
// `beginGen` check (i.e. running this test against the pre-fix
// `beginEffect`) makes it fail on the `deleteTextureCalls.length` assertion
// -- the older call's late-resolving bookkeeping GL-deletes the winner's
// texture. See the task report for the exact trace.
//
// jsdom has no real WebGL2 (`canvas.getContext('webgl2')` is always null),
// so -- mirroring tests/unit/compositor-warmup-failure.test.js's established
// pattern -- this installs a minimal fake WebGL2 context on
// `HTMLCanvasElement.prototype.getContext` that's just enough surface for
// `initGL()`/`uploadTexture()`/`releaseTexture()` to run their REAL,
// unmocked logic all the way through SUCCESSFULLY (unlike the warmup-failure
// test, which deliberately forces a shader-compile failure). `snapshot()`
// itself is the one piece of genuine async timing this race depends on, so
// it's mocked (`vi.mock`) to put its resolution order fully under this
// test's control.
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('../../assets/iconostat/fx/snapshot.js', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, snapshot: vi.fn() };
});

import { snapshot } from '../../assets/iconostat/fx/snapshot.js';
import { beginEffect, endEffect, EffectSupersededError, CANVAS_ID } from '../../assets/iconostat/fx/compositor.js';

function deferred() {
    let resolve, reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}

let deleteTextureCalls;

// Minimal fake WebGL2 context: every method genuinely SUCCEEDS (unlike
// compositor-warmup-failure.test.js's intentionally-failing one), so
// ensureCanvas()/initGL()/uploadTexture()/releaseTexture() all run their
// real compositor.js code paths to completion instead of degrading.
function fakeWorkingGL2() {
    deleteTextureCalls = [];
    let nextTextureId = 1;
    return {
        VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, COMPILE_STATUS: 3, LINK_STATUS: 4,
        BLEND: 5, DEPTH_TEST: 6, ONE: 7, ONE_MINUS_SRC_ALPHA: 8, COLOR_BUFFER_BIT: 9,
        TEXTURE_2D: 10, TEXTURE_MIN_FILTER: 11, TEXTURE_MAG_FILTER: 12, LINEAR: 13,
        TEXTURE_WRAP_S: 14, TEXTURE_WRAP_T: 15, CLAMP_TO_EDGE: 16,
        UNPACK_FLIP_Y_WEBGL: 17, UNPACK_PREMULTIPLY_ALPHA_WEBGL: 18,
        RGBA: 19, UNSIGNED_BYTE: 20,
        createShader: () => ({}),
        shaderSource: () => {},
        compileShader: () => {},
        getShaderParameter: () => true,
        getShaderInfoLog: () => '',
        deleteShader: () => {},
        createProgram: () => ({}),
        attachShader: () => {},
        bindAttribLocation: () => {},
        linkProgram: () => {},
        getProgramParameter: () => true,
        getProgramInfoLog: () => '',
        deleteProgram: () => {},
        getUniformLocation: () => ({}),
        clearColor: () => {},
        enable: () => {},
        blendFunc: () => {},
        disable: () => {},
        clear: () => {},
        viewport: () => {},
        createTexture: () => ({ __fakeTextureId: nextTextureId++ }),
        bindTexture: () => {},
        pixelStorei: () => {},
        texImage2D: () => {},
        texParameteri: () => {},
        deleteTexture: (t) => { deleteTextureCalls.push(t); },
    };
}

describe('compositor.beginEffect race guard (task-B2fix)', () => {
    const originalGetContext = HTMLCanvasElement.prototype.getContext;

    afterEach(() => {
        HTMLCanvasElement.prototype.getContext = originalGetContext;
        document.querySelectorAll(`#${CANVAS_ID}`).forEach((c) => c.remove());
        snapshot.mockReset();
    });

    it('the OLDER of two beginEffect(el) calls throws EffectSupersededError (and touches nothing) when its snapshot resolves AFTER the NEWER call already won', async () => {
        HTMLCanvasElement.prototype.getContext = function (type, opts) {
            if (type === 'webgl2') return fakeWorkingGL2();
            return originalGetContext.call(this, type, opts);
        };

        const el = document.createElement('div');
        const rasterizedOlder = document.createElement('canvas');
        const rasterizedNewer = document.createElement('canvas');

        const older = deferred();
        const newer = deferred();
        // Both beginEffect() calls are started synchronously below (mirrors
        // the real sequence: a new effect's registerEffect() jump-cuts the
        // old effect, THEN calls beginEffect() -- both calls' snapshot()
        // promises are already in flight together in the real race). This
        // mock controls which one's snapshot() PROMISE resolves first.
        snapshot.mockImplementationOnce(() => older.promise)
            .mockImplementationOnce(() => newer.promise);

        const olderPromise = beginEffect(el); // gen 1 -- started first
        const newerPromise = beginEffect(el); // gen 2 -- supersedes gen 1

        // THE RACE under test: the NEWER call's snapshot resolves FIRST.
        newer.resolve({ canvas: rasterizedNewer, width: 120, height: 80 });
        const winner = await newerPromise;
        expect(winner.texture).toBeTruthy();

        const canvasEl = document.getElementById(CANVAS_ID);
        expect(canvasEl.style.display).toBe('block'); // the winner showed the canvas
        expect(el.classList.contains('fx-ghost')).toBe(true); // and ghosted el

        // The OLDER call's snapshot resolves LATE, well after the winner
        // already owns el's texture/canvas/fx-ghost.
        older.resolve({ canvas: rasterizedOlder, width: 120, height: 80 });
        await expect(olderPromise).rejects.toBeInstanceOf(EffectSupersededError);

        // The winner's ownership must be completely intact: nothing was
        // GL-deleted, the canvas is still shown, el is still ghosted -- the
        // exact state the pre-fix bug corrupted (see file banner above).
        expect(deleteTextureCalls.length).toBe(0);
        expect(canvasEl.style.display).toBe('block');
        expect(el.classList.contains('fx-ghost')).toBe(true);

        // The winner's own endEffect() is the only thing allowed to release
        // a texture / hide the canvas -- and it releases exactly ITS OWN
        // texture (not some orphaned texture the older call clobbered
        // elTexture with), and activeEffectCount genuinely returns to 0
        // (observable here as the canvas going back to display:none).
        endEffect(el);
        expect(canvasEl.style.display).toBe('none');
        expect(deleteTextureCalls).toEqual([winner.texture]);
        expect(el.classList.contains('fx-ghost')).toBe(false);

        // endEffect() is documented idempotent -- a stray second call (e.g.
        // if a caller's own cleanup path mistakenly called it) must stay a
        // safe no-op, not re-decrement/re-hide/re-delete.
        endEffect(el);
        expect(deleteTextureCalls.length).toBe(1);
    });
});
