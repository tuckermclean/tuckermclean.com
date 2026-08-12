// tests/unit/compositor-warmup-failure.test.js
//
// task-Bfix Finding 1 ("belt"): direct, unmocked-at-the-compositor-level
// proof that a GL-init throw (shader compile/link failure -- realistic in a
// shimmed headless sandbox, or a driver quirk / context-loss race between
// `getContext()` and shader compile) during the warmup probe degrades to
// 'demote' instead of rejecting `warmup()`'s cached promise. Before the fix,
// `runWarmupProbe()` called `ensureCanvas()` (which can throw via
// `initGL()`) BEFORE its own try block, so this exact scenario rejected
// `warmup()` and that rejection was cached in module-level `warmupPromise`
// FOREVER (no retry) -- see compositor.js's `runWarmupProbe` for the fixed
// version and controller.js's `_loadTier2` for the matching controller-side
// belt-and-suspenders fix (proven separately in
// tests/unit/fx-controller-loadtier2.test.js).
//
// jsdom has no real WebGL2 implementation (`canvas.getContext('webgl2')` is
// always null -- see tests/unit/compositor.test.js), so this file installs a
// minimal fake WebGL2 context on `HTMLCanvasElement.prototype.getContext`
// that provides just enough surface for `initGL()`'s FIRST `compileShader()`
// call to run its real, unmocked logic and hit the real `throw new Error(...)`
// at compositor.js's shader-compile-failure branch -- i.e. this exercises
// compositor.js's actual `initGL()`/`compileShader()` code, not a stand-in.
//
// Isolated in its own file (rather than added to compositor.test.js) because
// `warmupPromise` is a module-level singleton cached for the lifetime of the
// module instance -- vitest gives each test FILE a fresh module registry, so
// this avoids any cache interaction with compositor.test.js's own
// (real, no-GL2) warmup() exercises.
import { describe, it, expect, afterEach } from 'vitest';
import { warmup, CANVAS_ID } from '../../assets/iconostat/fx/compositor.js';

function fakeGlThatFailsShaderCompile() {
  return {
    VERTEX_SHADER: 1,
    FRAGMENT_SHADER: 2,
    COMPILE_STATUS: 3,
    LINK_STATUS: 4,
    BLEND: 5,
    DEPTH_TEST: 6,
    ONE: 7,
    ONE_MINUS_SRC_ALPHA: 8,
    COLOR_BUFFER_BIT: 9,
    // compileShader()'s exact call sequence (compositor.js) -- forced to
    // fail via getShaderParameter always returning false, so the real
    // `if (!gl.getShaderParameter(...)) { ...; throw new Error(...); }`
    // branch fires for real.
    createShader: () => ({}),
    shaderSource: () => {},
    compileShader: () => {},
    getShaderParameter: () => false,
    getShaderInfoLog: () => 'forced failure (test seam)',
    deleteShader: () => {},
    // Never actually reached (compileShader throws on the FIRST -- vertex
    // -- shader), but present so a future initGL() reordering doesn't crash
    // on a missing method instead of hitting the intended throw.
    createProgram: () => ({}),
    attachShader: () => {},
    bindAttribLocation: () => {},
    linkProgram: () => {},
    getProgramParameter: () => false,
    getProgramInfoLog: () => 'unreachable',
    deleteProgram: () => {},
    clearColor: () => {},
    enable: () => {},
    blendFunc: () => {},
    disable: () => {},
    clear: () => {},
  };
}

describe('compositor.warmup -- ensureCanvas()/initGL() throws during the probe (Finding 1)', () => {
  const originalGetContext = HTMLCanvasElement.prototype.getContext;

  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = originalGetContext;
    document.querySelectorAll(`#${CANVAS_ID}`).forEach((c) => c.remove());
  });

  it('degrades to "demote" (does NOT reject) when initGL() throws mid-ensureCanvas()', async () => {
    HTMLCanvasElement.prototype.getContext = function (type, opts) {
      if (type === 'webgl2') return fakeGlThatFailsShaderCompile();
      return originalGetContext.call(this, type, opts);
    };

    // The core assertion: this must RESOLVE, never reject, even though the
    // underlying initGL() call genuinely throws.
    await expect(warmup()).resolves.toBe('demote');

    // And it must not leave the canvas shown -- the probe canvas stays
    // display:none the whole time regardless of outcome.
    const canvas = document.getElementById(CANVAS_ID);
    expect(canvas).not.toBeNull();
    expect(canvas.style.display).toBe('none');
  });
});
