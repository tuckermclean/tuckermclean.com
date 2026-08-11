// Iconostat FX -- Tier-2 WebGL2 compositor core: shared canvas lifecycle,
// textured mesh renderer, warmup probe, and the beginEffect/endEffect swap
// protocol. Built against the frozen contracts in
// docs/superpowers/specs/2026-08-11-iconostat-fx-design.md (Agent B).
//
// Imports ONLY `./snapshot.js` (a sibling fx module -- allowed) and
// `./controller.js` (for the singleton, per the spec's suggestion: "import
// the controller -- that's a sibling fx module, allowed"). No site code, no
// library code, no new dependencies.
//
// =====================================================================
// THE CONTRACT FOR AGENTS C/D (genie.js / wobble.js) -- READ THIS FIRST
// =====================================================================
//
// -- beginEffect / endEffect (the swap protocol) ------------------------
//
//   const { texture, width, height } = await compositor.beginEffect(el);
//     - Snapshots `el` (foreignObject raster + live <video>/<canvas>
//       composite), uploads it as a WebGL2 texture, adds `fx-ghost` to `el`
//       (hides the real DOM node), and shows the shared canvas.
//     - `texture`: a WebGLTexture, ready to pass straight into `drawMesh()`.
//     - `width`/`height`: the snapshot's CSS-px size (== `el`'s
//       getBoundingClientRect() at snapshot time) -- use this to build your
//       UV-space-matching rest-pose grid.
//     - THROWS (rejects) `SnapshotError` if `el` can't be safely snapshotted
//       (cross-origin iframe, tainted canvas, foreignObject failure, etc).
//       On that path `el` is GUARANTEED untouched -- no `fx-ghost`, no canvas
//       shown -- so you do not need any cleanup of your own for a
//       `beginEffect` that never resolved. Your `run()`/`dragStart()` should
//       let it propagate (or catch, call `controller.demote(el, 1)`, and
//       rethrow -- either way, controller.js's `_runEffect`/`_onDrag` catch
//       already does the demote, see below) so the caller falls through to
//       the Tier-1 effect for this gesture.
//
//   compositor.endEffect(el)
//     - Removes `fx-ghost`, releases the texture, hides the shared canvas IF
//       no other effect is still using it. Idempotent -- safe to call more
//       than once for the same `el` (a no-op the second time).
//     - MUST be called from a `finally` block that wraps your ENTIRE
//       choreography (mirrors tier1.js's pattern exactly) -- natural
//       completion, cancellation, an unexpected throw, all of them. This is
//       what upholds the finally-guaranteed-reveal hard invariant on the
//       Tier-2 path: `beginEffect` only ever hides `el` AFTER a successful
//       snapshot, and `endEffect` is the only thing that un-hides it, so
//       "always call endEffect in finally" is equivalent to "el is never
//       stranded hidden".
//
// -- drawMesh (the renderer) --------------------------------------------
//
//   compositor.drawMesh({ texture, positions, cols, rows, opacity })
//     - `texture`: from `beginEffect()` (or your own `uploadTexture()` call,
//       e.g. wobble's throttled video re-snapshot).
//     - `positions`: Float32Array (or plain Array) of length `cols * rows *
//       2` -- row-major [x0,y0, x1,y1, ...] (row 0 = cols left-to-right, then
//       row 1, ...), in VIEWPORT CSS-PX coordinates (the same space as
//       `getBoundingClientRect()` / `iconostat-drag-move`'s `x`/`y`). This is
//       "per-vertex positions supplied by the effect each frame" -- you own
//       ALL the choreography math; this function only rasterizes whatever
//       grid you hand it.
//     - `cols`/`rows`: your mesh resolution (>=2 each). UV coordinates are
//       fixed at each vertex's REST fraction (`col/(cols-1)`,
//       `row/(rows-1)`) -- i.e. you warp POSITION, never UV; the texture
//       always maps onto the grid's rest topology.
//     - `opacity`: 0..1, default 1 -- a flat multiplier over the whole mesh
//       (fade in/out).
//     - Call this once per your own `requestAnimationFrame` tick, for as
//       long as your effect is running, between `beginEffect` and
//       `endEffect`. No explicit "begin frame" call needed -- see the
//       shared-canvas clearing note below.
//     - No-ops silently if the GL context is currently lost (between
//       `webglcontextlost` and a successful restore) -- your own
//       `cancelAll`-driven cancellation (see below) is what unwinds the
//       animation in that case, not a thrown error from `drawMesh`.
//
//   compositor.uploadTexture(source) -> WebGLTexture / compositor.releaseTexture(texture)
//     - For effects that need MORE than the one texture `beginEffect` hands
//       you (wobble's 250ms video-re-snapshot throttle is the motivating
//       case): snapshot `el` again yourself (`import('./snapshot.js')`),
//       upload the new frame, `releaseTexture()` the old one once you've
//       swapped `drawMesh`'s `texture` argument over.
//
// -- Shared-canvas clearing (why you don't need to clear it yourself) ----
// One canvas is reused by every concurrently-running Tier-2 effect (the
// spec's "one shared canvas, not per-window" decision) -- `drawMesh` tracks
// whether the canvas has already been cleared THIS ANIMATION FRAME (a flag
// reset by the compositor's own `requestAnimationFrame` loop, which runs
// only while >=1 effect is between `beginEffect`/`endEffect`) and clears
// automatically on the first `drawMesh` call of each frame, leaving
// subsequent calls (a second window animating concurrently) to draw on top
// instead of wiping the first. You never need to call a "clear" API
// yourself; just call `drawMesh` from your own rAF loop as usual.
//
// -- Cancellation / registerEffect ----------------------------------------
// This module does NOT itself call `controller.registerEffect` -- that's
// still YOUR job (exactly like tier1.js), because only you know how to
// jump-cut YOUR animation to its correct end state. What this module DOES
// own: a `webglcontextlost` listener that calls `FxController.cancelAll(true)`
// -- so your `registerEffect(el, name, cancelFn)`'s `cancelFn` WILL be
// invoked on context loss, and (per the hard invariant) that `cancelFn` must
// itself call `endEffect(el)` (directly or via the same `finally` your normal
// completion path uses) so `el` ends up visible again even though the GL
// context that was mid-render is now gone.
//
// -- The exact invocation signature controller.js calls you with ----------
// `genie.js` (minimize/maximize) exports:
//   export async function run(controller, compositor, el, kind, entering)
//     kind: 'minimize' | 'maximize'; entering: bool (true = minimizing/
//     maximizing, false = restoring/unmaximizing). Mirrors tier1.js's
//     `run(controller, el, kind, entering)` with `compositor` inserted as the
//     2nd argument.
//
//     YOUR RESPONSIBILITY, NOT THIS MODULE'S: after swap-back (inside the
//     same `finally` that calls `endEffect(el)`), dispatch the frozen
//     `iconostat-fx-done` event yourselves --
//     `document.dispatchEvent(new CustomEvent('iconostat-fx-done', { detail:
//     { name: el.name, effect: <'minimize'|'restore'|'maximize'|'unmaximize'> } }))`
//     -- exactly like tier1.js already does at tier1.js:~165/237/295. Nothing
//     in compositor.js or controller.js fires this for you; skipping it means
//     any listener wired against the frozen contract (spec's event table)
//     silently never hears about a Tier-2 gesture completing.
// `wobble.js` (drag) exports:
//   export function dragStart(controller, compositor, detail)
//   export function dragMove(controller, compositor, detail)
//   export function dragEnd(controller, compositor, detail)
//     `detail` is the raw `iconostat-drag-*` event detail (`{ name, el, x,
//     y }` / `{ ..., left, top }`), exactly like tier1.js's `dragStart`/
//     `dragMove`/`dragEnd`, again with `compositor` inserted as the 2nd arg.
//   NOTE: controller.js resolves the Tier-2 module PER DRAG EVENT (dragStart/
//   dragMove/dragEnd each independently await the (cached) compositor+wobble
//   promise chain) -- because `_onDrag` is called synchronously in event
//   dispatch order and every call chains off the SAME cached promises,
//   microtask FIFO ordering guarantees your `dragStart` handler's promise
//   resolves before `dragMove`'s, even though both are "awaiting" the same
//   already-settled promise by the time a fast drag is underway. Still,
//   `dragMove`/`dragEnd` MUST tolerate being called before `dragStart` has
//   finished its own `beginEffect()` (which is async and can take a frame or
//   more) -- exactly like tier1.js's wobble already does (`if (!state)
//   return;`), because `beginEffect`'s snapshot can be slow. If `el` gets
//   demoted mid-drag (a `SnapshotError` from a late `beginEffect` inside your
//   own `dragStart`), controller.js falls through to Tier 1 for THAT event
//   only -- your `dragMove`/`dragEnd` may then never be called again for this
//   gesture; make sure any state you stashed doesn't leak (tier1.js's
//   `dragState` WeakMap keyed by `el`, guarded by identity, is the reference
//   pattern -- see its comments).
//
// See controller.js's `_runEffect`/`_onDrag` for the exact call sites.

import { snapshot, SnapshotError, computeDprCap } from './snapshot.js';
import { FxController } from './controller.js';

export { SnapshotError };

export const CANVAS_ID = 'iconostat-fx-canvas';

const VERTEX_SRC = `#version 300 es
in vec2 aPosition;
in vec2 aUV;
uniform vec2 uViewport;
out vec2 vUV;
void main() {
    vec2 zeroToOne = aPosition / uViewport;
    vec2 clip = zeroToOne * 2.0 - 1.0;
    gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
    vUV = aUV;
}`;

const FRAGMENT_SRC = `#version 300 es
precision mediump float;
in vec2 vUV;
uniform sampler2D uTexture;
uniform float uOpacity;
out vec4 outColor;
void main() {
    vec4 texColor = texture(uTexture, vUV);
    outColor = texColor * uOpacity;
}`;

// -- Module-private GL state -----------------------------------------------

let canvas = null;
let gl = null;
let program = null;
let attribLocations = null;
let uniformLocations = null;
const meshCache = new Map(); // "colsxrows" -> { positionBuffer, uvBuffer, indexBuffer, indexCount, indexType } -- invalidated wholesale on context loss (GL objects don't survive it)

let activeEffectCount = 0; // number of beginEffect() calls not yet matched by endEffect()
const elTexture = new WeakMap(); // el -> WebGLTexture, so endEffect() knows what to release

let needsClear = true;
let clearLoopRunning = false;

let warmupPromise = null;

// -- Canvas / context lifecycle ---------------------------------------------

function compileShader(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const info = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(`compositor: shader compile failed: ${info}`);
    }
    return shader;
}

function initGL() {
    const vs = compileShader(gl.VERTEX_SHADER, VERTEX_SRC);
    const fs = compileShader(gl.FRAGMENT_SHADER, FRAGMENT_SRC);
    program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.bindAttribLocation(program, 0, 'aPosition');
    gl.bindAttribLocation(program, 1, 'aUV');
    gl.linkProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const info = gl.getProgramInfoLog(program);
        program = null;
        throw new Error(`compositor: program link failed: ${info}`);
    }
    attribLocations = { position: 0, uv: 1 };
    uniformLocations = {
        texture: gl.getUniformLocation(program, 'uTexture'),
        opacity: gl.getUniformLocation(program, 'uOpacity'),
        viewport: gl.getUniformLocation(program, 'uViewport'),
    };
    // Transparent clear + premultiplied-alpha-over blending, so the warped
    // window composites correctly over whatever live DOM is beneath the
    // (position:fixed, full-viewport) canvas -- "correct compositing over
    // the page" per the spec. `UNPACK_PREMULTIPLY_ALPHA_WEBGL` (set at
    // texture-upload time in uploadTexture()) converts the source canvas'
    // straight alpha into premultiplied on the way into the texture, so the
    // fragment shader can sample+scale directly and this blend func is the
    // textbook premultiplied-over formula.
    gl.clearColor(0, 0, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.DEPTH_TEST);
    meshCache.clear(); // any buffers from a PRIOR context (restore path) are gone with it
}

function onContextLost(e) {
    // preventDefault() is required for the browser to even attempt
    // restoration later (per spec) -- the hard invariant itself ("a lost
    // context leaves every window visible in its correct end state") is
    // upheld by cancelAll(true) below, not by whether restoration succeeds.
    e.preventDefault();
    gl = null;
    program = null;
    attribLocations = null;
    uniformLocations = null;
    meshCache.clear();
    needsClear = true;
    clearLoopRunning = false; // the rAF loop referencing the dead gl stops naturally next tick anyway; this just short-circuits it
    FxController.cancelAll(true);
    if (canvas) canvas.style.display = 'none';
}

function onContextRestored() {
    ensureCanvas(); // recreates gl + program lazily; safe even if a gesture never resumes
}

function ensureCanvas() {
    if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.id = CANVAS_ID;
        canvas.style.position = 'fixed';
        canvas.style.inset = '0';
        canvas.style.pointerEvents = 'none';
        canvas.style.display = 'none';
        document.body.appendChild(canvas);
        canvas.addEventListener('webglcontextlost', onContextLost, false);
        canvas.addEventListener('webglcontextrestored', onContextRestored, false);
    }
    if (!gl) {
        const ctx = canvas.getContext('webgl2', { premultipliedAlpha: true, alpha: true, antialias: true });
        if (ctx) {
            gl = ctx;
            try {
                initGL();
            } catch (e) {
                // Shader compile/link failure (headless sandbox quirk /
                // driver bug / a context-loss race between getContext() and
                // shader compile -- see task-Bfix-brief.md Finding 1). Reset
                // to a clean "no functional GL" state -- gl left non-null
                // with a null program would make every OTHER caller's
                // `if (!gl)` check lie about GL being usable -- then rethrow
                // so callers (runWarmupProbe, beginEffect) can degrade.
                gl = null;
                program = null;
                attribLocations = null;
                uniformLocations = null;
                throw e;
            }
        }
    }
    return canvas;
}

function resizeCanvasToViewport() {
    if (!canvas || !gl) return;
    const dpr = computeDprCap();
    const w = Math.max(1, Math.round(window.innerWidth * dpr));
    const h = Math.max(1, Math.round(window.innerHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
    }
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
}

function showCanvas() {
    ensureCanvas();
    resizeCanvasToViewport();
    // "z-index set to getDesktop().zIndex + 10 at each effect start" -- read
    // fresh every time (not cached) since the desktop's zIndex counter keeps
    // climbing as windows are focused.
    const desktop = FxController.getDesktop();
    if (canvas) canvas.style.zIndex = String((desktop ? desktop.zIndex : 0) + 10);
    if (canvas) canvas.style.display = 'block';
}

function hideCanvas() {
    if (!canvas) return;
    canvas.style.display = 'none';
    if (gl) gl.clear(gl.COLOR_BUFFER_BIT);
}

function startClearLoop() {
    if (clearLoopRunning) return;
    clearLoopRunning = true;
    const tick = () => {
        needsClear = true;
        if (activeEffectCount > 0) {
            requestAnimationFrame(tick);
        } else {
            clearLoopRunning = false;
        }
    };
    requestAnimationFrame(tick);
}

// -- Mesh renderer -----------------------------------------------------

function getOrCreateMesh(cols, rows) {
    const key = `${cols}x${rows}`;
    let mesh = meshCache.get(key);
    if (mesh) return mesh;

    const uv = new Float32Array(cols * rows * 2);
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const i = (r * cols + c) * 2;
            uv[i] = c / (cols - 1);
            uv[i + 1] = r / (rows - 1);
        }
    }

    const indices = [];
    for (let r = 0; r < rows - 1; r++) {
        for (let c = 0; c < cols - 1; c++) {
            const a = r * cols + c;
            const b = a + 1;
            const d = a + cols;
            const e = d + 1;
            indices.push(a, d, b, b, d, e);
        }
    }
    const useInt = cols * rows > 65535;
    const indexArray = useInt ? new Uint32Array(indices) : new Uint16Array(indices);

    const uvBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, uv, gl.STATIC_DRAW);

    const indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indexArray, gl.STATIC_DRAW);

    const positionBuffer = gl.createBuffer(); // re-uploaded (bufferData/DYNAMIC_DRAW) on every drawMesh() call -- this is the "per-vertex positions supplied by the effect each frame" buffer

    mesh = {
        uvBuffer, indexBuffer, positionBuffer,
        indexCount: indices.length,
        indexType: useInt ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT,
    };
    meshCache.set(key, mesh);
    return mesh;
}

// See the file-banner contract above for the full argument documentation.
export function drawMesh({ texture, positions, cols, rows, opacity = 1 }) {
    if (!gl || !program) return; // context lost mid-animation -- the effect's own cancelAll-driven teardown handles reveal; silently skipping the draw here is strictly cosmetic
    if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 2 || rows < 2) {
        throw new Error('compositor.drawMesh: cols/rows must be integers >= 2');
    }
    const expectedLen = cols * rows * 2;
    if (!positions || positions.length !== expectedLen) {
        throw new Error(`compositor.drawMesh: positions must have length cols*rows*2 (${expectedLen}), got ${positions && positions.length}`);
    }

    resizeCanvasToViewport();
    if (needsClear) {
        gl.clear(gl.COLOR_BUFFER_BIT);
        needsClear = false;
    }

    const mesh = getOrCreateMesh(cols, rows);
    const posArray = positions instanceof Float32Array ? positions : new Float32Array(positions);

    gl.useProgram(program);

    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, posArray, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(attribLocations.position);
    gl.vertexAttribPointer(attribLocations.position, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.uvBuffer);
    gl.enableVertexAttribArray(attribLocations.uv);
    gl.vertexAttribPointer(attribLocations.uv, 2, gl.FLOAT, false, 0, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(uniformLocations.texture, 0);
    gl.uniform1f(uniformLocations.opacity, opacity);
    // CSS-px viewport, NOT the (DPR-scaled) canvas backing-store size --
    // `positions` are in CSS px (see contract above), and clip-space math is
    // resolution-independent, so the backing-store DPR never enters here.
    gl.uniform2f(uniformLocations.viewport, window.innerWidth, window.innerHeight);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.indexBuffer);
    gl.drawElements(gl.TRIANGLES, mesh.indexCount, mesh.indexType, 0);
}

// -- Texture upload -----------------------------------------------------

export function uploadTexture(source) {
    if (!gl) throw new Error('compositor.uploadTexture: no live WebGL2 context');
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    // FLIP_Y: canvas 2D source has row 0 at the top; WebGL texture space has
    // row 0 at the bottom. PREMULTIPLY_ALPHA: converts the source's straight
    // alpha to premultiplied on upload, matching the blend func in initGL().
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
    // Restore pixelStorei defaults -- other texImage2D callers (the warmup
    // probe's throwaway texture) shouldn't silently inherit these.
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    return texture;
}

export function releaseTexture(texture) {
    if (!gl || !texture) return;
    try {
        gl.deleteTexture(texture);
    } catch (e) {
        // Context already gone -- nothing to release, nothing to do.
    }
}

// -- Warmup probe -----------------------------------------------------

function restGridPositions(cols, rows, x, y, w, h) {
    const arr = new Float32Array(cols * rows * 2);
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const i = (r * cols + c) * 2;
            arr[i] = x + (w * c) / (cols - 1);
            arr[i + 1] = y + (h * r) / (rows - 1);
        }
    }
    return arr;
}

function createProbeTexture() {
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 4;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 4, 4);
    return uploadTexture(c);
}

async function runWarmupProbe() {
    // Belt (Finding 1, task-Bfix-brief.md): `ensureCanvas()` used to run
    // BEFORE this try block -- an `initGL()` throw (shader compile/link
    // failure, realistic in a shimmed headless sandbox or on a driver quirk)
    // rejected `runWarmupProbe()`, which `warmup()` cached FOREVER as a
    // rejected `warmupPromise`, permanently killing Tier 2 session-wide with
    // no retry. `ensureCanvas()` now runs INSIDE this try -- any throw from
    // it (or from anything else below) is caught the same way a slow-probe
    // "demote" verdict is: `warmup()`/`runWarmupProbe()` must NEVER reject.
    let texture;
    try {
        ensureCanvas();
        if (!gl) return 'demote'; // no WebGL2 at all -- shouldn't happen (controller only loads this module after its own probeWebGL2() succeeded), but must still degrade rather than throw
        const cols = 8;
        const rows = 40;
        texture = createProbeTexture();
        const positions = restGridPositions(cols, rows, 0, 0, 64, 320);
        const samples = [];
        for (let i = 0; i < 10; i++) {
            const t0 = performance.now();
            drawMesh({ texture, positions, cols, rows, opacity: 1 });
            if (typeof gl.finish === 'function') gl.finish(); // force GPU completion so the timing reflects real render cost, not just CPU-side command submission
            samples.push(performance.now() - t0);
        }
        samples.sort((a, b) => a - b);
        const median = samples[Math.floor(samples.length / 2)];
        return median > 8 ? 'demote' : 'ok';
    } catch (e) {
        return 'demote'; // a probe failure (including a GL-init throw) is itself evidence Tier 2 isn't safe here -- never let it become a rejection
    } finally {
        // Suspenders on the suspenders: cleanup itself must not throw and
        // override the try/catch's return value with a rejection.
        try {
            if (texture) releaseTexture(texture);
        } catch (e) {
            // releaseTexture already swallows its own errors; this is
            // defense in depth only.
        }
        try {
            if (gl) gl.clear(gl.COLOR_BUFFER_BIT); // defense in depth -- the probe canvas stays display:none the whole time regardless, so this is never actually visible
        } catch (e) {
            // Context could have been lost between the try block above and
            // here -- irrelevant to the verdict already decided.
        }
    }
}

// Render an offscreen 8x40 mesh ~10 frames; median frame time > 8ms ->
// "demote to Tier 1". Cached (one probe per session) via `warmupPromise`.
// `forceVerdict` ('ok'|'demote') is a TEST-ONLY seam: it short-circuits
// before ANY canvas/GL work (so it's usable even where WebGL2 genuinely
// isn't available, e.g. this repo's jsdom-based unit tests), letting a test
// exercise both sides of controller.js's warmup-verdict branch
// deterministically without depending on real GPU timing.
export function warmup({ forceVerdict } = {}) {
    if (forceVerdict) {
        warmupPromise = Promise.resolve(forceVerdict);
        return warmupPromise;
    }
    if (!warmupPromise) {
        warmupPromise = runWarmupProbe();
    }
    return warmupPromise;
}

// -- Swap protocol: beginEffect / endEffect ---------------------------------
// See the file-banner contract above for the full documentation aimed at
// Agents C/D -- this is just the implementation.

export async function beginEffect(el) {
    // snapshot() throws SnapshotError before touching `el`'s DOM at all (see
    // snapshot.js) -- if it rejects, this function has done nothing yet
    // either (no fx-ghost, no canvas shown), so the caller's fall-through-to-
    // Tier-1 path is safe.
    const { canvas: rasterized, width, height } = await snapshot(el, { dprCap: computeDprCap() });

    try {
        ensureCanvas();
    } catch (e) {
        // Finding 2 (task-Bfix-brief.md): ensureCanvas()/initGL() can throw a
        // plain Error here too (recreating `gl` after a context-loss window
        // hits the same shader compile/link failure warmup can). Surface it
        // as the SAME typed SnapshotError the swap-protocol contract already
        // documents for "el can't be safely snapshotted" -- callers that key
        // demotion off `e.name === 'SnapshotError'` keep working unchanged.
        // (controller.js additionally treats ANY thrown error, typed or not,
        // as a this-gesture Tier-1 fallthrough -- belt and suspenders.)
        throw new SnapshotError('compositor: WebGL2 init failed at beginEffect', { cause: e });
    }
    if (!gl) {
        // Context lost in the (rare) window between an earlier warmup and
        // this call -- fail exactly like a snapshot failure would, so the
        // caller demotes/falls through instead of animating into a dead GL
        // context.
        throw new SnapshotError('compositor: WebGL2 context unavailable at beginEffect');
    }

    const texture = uploadTexture(rasterized);
    const prior = elTexture.get(el);
    if (prior) releaseTexture(prior); // shouldn't happen (registerEffect only allows one in-flight effect per el -- see controller.js), but never leak a texture if it does
    elTexture.set(el, texture);

    el.classList.add('fx-ghost');
    showCanvas();
    activeEffectCount++;
    startClearLoop();

    return { texture, width, height };
}

export function endEffect(el) {
    // Reveal FIRST, unconditionally, before any GL cleanup that could
    // theoretically throw -- this is what makes the finally-guaranteed-
    // reveal invariant hold even if something below misbehaves.
    try {
        el.classList.remove('fx-ghost');
    } finally {
        // Finding 3 (task-Bfix-brief.md): `elTexture` (set only by
        // `beginEffect`, cleared only here) IS "does `el` currently hold the
        // shared canvas" -- gating the counter/release/hide on its presence
        // is what makes this genuinely idempotent, matching the banner's
        // claim. Previously the decrement ran unconditionally, so a SECOND
        // `endEffect(el)` call for the same `el` (or any double-call, e.g. a
        // caller's own cancel-path racing its normal completion path) would
        // over-decrement `activeEffectCount` and could call `hideCanvas()`
        // while ANOTHER window's effect is still genuinely in flight --
        // hiding that other window's live warp until its own `endEffect`
        // eventually runs.
        if (elTexture.has(el)) {
            const texture = elTexture.get(el);
            releaseTexture(texture);
            elTexture.delete(el);
            activeEffectCount = Math.max(0, activeEffectCount - 1);
            if (activeEffectCount === 0) {
                hideCanvas();
            }
        }
        // else: `el` doesn't currently hold the canvas (never began, or an
        // earlier `endEffect(el)` already ran) -- a harmless no-op, per the
        // banner's "safe to call more than once for the same el" contract.
    }
}
