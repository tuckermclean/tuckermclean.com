// Iconostat FX -- Tier-2 snapshot pipeline: foreignObject serializer + typed
// taint/cross-origin detection + <video>/<canvas> live-pixel compositing.
//
// Imports ZERO site code and ZERO library code -- everything this module
// needs is either a DOM node handed to it by compositor.js/controller.js, or
// a native browser API. Hand-rolled per the spec's "no external dependency"
// ground rule (no snapshot library vendored) -- this is the whole ~200-line
// serializer.
//
// -- Split of responsibility with compositor.js -----------------------------
// `snapshot(el)` returns a RASTERIZED `HTMLCanvasElement` (`{ canvas, width,
// height }`) -- it does the foreignObject->raster work and the live-media
// composite, but does NOT touch WebGL at all (no GL context exists in this
// file). `compositor.js`'s `beginEffect(el)` is what calls `snapshot()` and
// then uploads the returned canvas as a WebGL2 texture, returning
// `{ texture, width, height }` to its caller -- that outer shape is what
// matches the frozen-for-C/D `beginEffect` contract documented in
// compositor.js's file banner. Effect modules (genie.js/wobble.js) should
// never import this file directly; they go through
// `compositor.beginEffect()`/`endEffect()` only. `SnapshotError` is
// re-exported by compositor.js too, purely for convenience.

export class SnapshotError extends Error {
    constructor(message, options) {
        super(message, options);
        this.name = 'SnapshotError';
    }
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const XHTML_NS = 'http://www.w3.org/1999/xhtml';

// -- DPR policy ---------------------------------------------------------

// min(devicePixelRatio, 2) desktop, 1.5 mobile (window.innerWidth <= 768) --
// matches the ground-rules breakpoint used everywhere else in this codebase
// (window.js's bake(), the fx spec). `explicit` (compositor's `dprCap`
// passthrough / a caller override) always wins when it's a positive number.
export function computeDprCap(explicit) {
    if (typeof explicit === 'number' && isFinite(explicit) && explicit > 0) {
        return explicit;
    }
    const mobile = typeof window !== 'undefined' && window.innerWidth <= 768;
    const cap = mobile ? 1.5 : 2;
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    return Math.min(dpr, cap);
}

// -- Taint / cross-origin risk assessment (runs BEFORE any side effect) -----

// A same-origin, empty, or `about:blank` iframe is fully capturable (well,
// "capturable" in the sense that foreignObject won't refuse it for security
// reasons -- headless-Chromium foreignObject rendering quality is a separate,
// unrelated concern, see the sandbox note in the report). `data:`/`blob:`
// iframes get an opaque origin distinct from the page's, which foreignObject
// cannot reliably rasterize either -- treated as risky for the same reason a
// true cross-origin src is. Deliberately does NOT touch
// `iframe.contentDocument`/`contentWindow` (that would itself throw a
// SecurityError for a genuinely cross-origin frame) -- this is a pure
// URL-string check, so it's synchronous, side-effect-free, and safe to run on
// an iframe that hasn't even finished loading yet.
function iframeIsCrossOrigin(iframe) {
    const src = iframe.getAttribute('src');
    if (!src || src === 'about:blank') return false;
    let url;
    try {
        url = new URL(src, document.baseURI);
    } catch (e) {
        return true; // unparsable -- conservatively treat as risky
    }
    if (url.protocol === 'about:') return false;
    if (url.protocol === 'data:' || url.protocol === 'blob:') return true;
    return url.origin !== window.location.origin;
}

// Cross-origin <img>/<video>/<audio>/<source> WITHOUT a `crossorigin`
// attribute is the classic silent-taint trap: `drawImage()` from it doesn't
// throw -- it just marks whatever canvas it was drawn into "origin-unclean",
// and the failure only surfaces later, on readback (here: WebGL's
// `texImage2D` upload, deep inside compositor.js, well after `fx-ghost` would
// already be applied). Catching it here, before any DOM mutation, is what
// makes the "no side effect" invariant hold for this failure mode too, not
// just the iframe/already-tainted-canvas cases below. `data:`/`blob:` are
// NOT treated as risky here (unlike iframes above) -- per spec, images loaded
// from a `data:` URL or a same-document Blob are origin-clean; only actual
// cross-origin *fetches* taint canvas readback.
function mediaSrcIsCrossOrigin(srcAttr) {
    if (!srcAttr) return false;
    let url;
    try {
        url = new URL(srcAttr, document.baseURI);
    } catch (e) {
        return true;
    }
    if (url.protocol === 'about:' || url.protocol === 'data:' || url.protocol === 'blob:') return false;
    return url.origin !== window.location.origin;
}

// A <source> element carries no `crossorigin` attribute/IDL property of its
// own -- it lives on the parent <video>/<audio> element (a <picture>'s
// <source> defers to the <picture>'s <img>, which is independently checked
// as its own `media` entry by `assessSnapshotRisk` below, so no special-
// casing is needed for that case here). Reading `m.crossOrigin` directly on
// a <source> is always `undefined` -- falsy -- which is why every
// cross-origin <source> used to get flagged even when its parent
// <video>/<audio> correctly set `crossorigin` (over-conservative Tier-1
// demotion; safe direction, but wrong -- see task-Bfix-brief.md Finding 5).
// A detached <source> (no parentElement) or a non-media parent stays
// conservative (flagged), matching the existing "genuine ambiguity ->
// treat as risky" posture used throughout this file.
function crossOriginFor(m) {
    if (m.tagName === 'SOURCE') {
        const parent = m.parentElement;
        return parent ? parent.crossOrigin : null;
    }
    return m.crossOrigin;
}

// A <canvas> that's already tainted (e.g. something upstream in the page
// already drew cross-origin content into it, unrelated to this snapshot)
// throws on `toDataURL()`/`getImageData()` regardless of context type
// (2D/WebGL/WebGL2) -- `toDataURL()` is the one universal, spec-guaranteed
// taint probe that works no matter which context the canvas was created
// with, so it's used here instead of trying to branch on context type.
function canvasIsAlreadyTainted(cv) {
    try {
        cv.toDataURL();
        return false;
    } catch (e) {
        return true;
    }
}

// Exported for direct unit testing (jsdom can build the DOM shapes below
// without a real browser) and used internally by `snapshot()` as the very
// first thing it does -- entirely synchronous, so a throw here happens
// before `snapshot()` has done anything else (no clone, no Image, nothing).
export function assessSnapshotRisk(el) {
    const iframes = el.querySelectorAll('iframe');
    for (const frame of iframes) {
        if (iframeIsCrossOrigin(frame)) {
            throw new SnapshotError('snapshot: cross-origin <iframe> cannot be captured via foreignObject');
        }
    }
    const media = el.querySelectorAll('img, video, audio, source');
    for (const m of media) {
        const src = m.currentSrc || m.getAttribute('src');
        if (mediaSrcIsCrossOrigin(src) && !crossOriginFor(m)) {
            throw new SnapshotError('snapshot: cross-origin media without a `crossorigin` attribute would taint the snapshot');
        }
    }
    const canvases = el.querySelectorAll('canvas');
    for (const cv of canvases) {
        if (canvasIsAlreadyTainted(cv)) {
            throw new SnapshotError('snapshot: descendant <canvas> is already tainted (cannot read back)');
        }
    }
}

// -- foreignObject serialization ------------------------------------------

// Walks `srcRoot` and `dstRoot` (an exact `cloneNode(true)` of `srcRoot`, so
// both trees are structurally identical and `querySelectorAll('*')` visits
// them in the same document order) in lockstep, replacing each destination
// element's `style` attribute with the FULL computed style of the
// corresponding source element. This is what lets the clone render correctly
// once it's detached from the real stylesheet cascade inside the
// foreignObject's isolated document context ("inline computed styles for the
// window chrome so it renders standalone").
function inlineComputedStyles(srcRoot, dstRoot) {
    const srcNodes = [srcRoot, ...srcRoot.querySelectorAll('*')];
    const dstNodes = [dstRoot, ...dstRoot.querySelectorAll('*')];
    for (let i = 0; i < srcNodes.length; i++) {
        const src = srcNodes[i];
        const dst = dstNodes[i];
        if (!(src instanceof Element) || !(dst instanceof Element)) continue;
        const computed = window.getComputedStyle(src);
        let cssText = '';
        for (let j = 0; j < computed.length; j++) {
            const prop = computed[j];
            const val = computed.getPropertyValue(prop);
            if (val) cssText += `${prop}:${val};`;
        }
        dst.setAttribute('style', cssText);
        // <video>/<canvas> can't be usefully rasterized by foreignObject
        // (browsers paint them blank/black) -- hide the CLONE's copy so it
        // doesn't paint a wrong placeholder over/under the real live frame
        // this module draws on top afterward via `compositeLiveMedia()`
        // (same rect, so the two never visibly conflict either way, but
        // hiding the clone avoids relying on paint order). `visibility`
        // rather than `display:none` so layout/rect math inside the
        // foreignObject is unaffected.
        const tag = dst.tagName;
        if (tag === 'VIDEO' || tag === 'CANVAS') {
            dst.style.visibility = 'hidden';
        }
    }
}

function serializeToDataUrl(el, width, height) {
    const clone = el.cloneNode(true);
    inlineComputedStyles(el, clone);
    // Neutralize anything that would fight the foreignObject's own explicit
    // box (the real element may be `position:fixed`/`absolute` with
    // window-manager-owned inset values that make no sense once detached).
    clone.style.position = 'static';
    clone.style.top = '';
    clone.style.left = '';
    clone.style.margin = '0';
    clone.style.transform = 'none';

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('xmlns', SVG_NS);
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

    const foreignObject = document.createElementNS(SVG_NS, 'foreignObject');
    foreignObject.setAttribute('x', '0');
    foreignObject.setAttribute('y', '0');
    foreignObject.setAttribute('width', String(width));
    foreignObject.setAttribute('height', String(height));

    const wrapper = document.createElementNS(XHTML_NS, 'div');
    wrapper.setAttribute('xmlns', XHTML_NS);
    wrapper.style.width = `${width}px`;
    wrapper.style.height = `${height}px`;
    wrapper.style.overflow = 'hidden';
    wrapper.appendChild(clone);
    foreignObject.appendChild(wrapper);
    svg.appendChild(foreignObject);

    const svgString = new XMLSerializer().serializeToString(svg);
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgString)}`;
}

// Loads the foreignObject SVG data URL into an <img>, then draws it into a
// freshly-sized canvas at `dpr` resolution. Rejects with a typed
// `SnapshotError` on decode failure (e.g. a browser that refuses to rasterize
// the foreignObject content at all) -- see the sandbox note in the report:
// some headless environments produce a BLANK (not failing) canvas here
// instead, which this function can't distinguish from a legitimately
// simple/empty window, so it is NOT treated as an error case.
async function rasterizeChrome(el, width, height, dpr) {
    const dataUrl = serializeToDataUrl(el, width, height);
    const img = new Image();
    const decoded = new Promise((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = (e) => reject(new SnapshotError('snapshot: foreignObject image failed to load', { cause: e }));
    });
    img.src = dataUrl;
    await decoded;

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new SnapshotError('snapshot: 2D context unavailable for rasterization');
    ctx.scale(dpr, dpr);
    try {
        ctx.drawImage(img, 0, 0, width, height);
    } catch (e) {
        throw new SnapshotError('snapshot: failed to draw rasterized foreignObject image', { cause: e });
    }
    return canvas;
}

// <video>/<canvas> descendants hold LIVE pixels foreignObject cannot capture
// (browsers paint them blank/black inside a serialized SVG document) -- draw
// their current frame directly onto the rasterized chrome, positioned at
// their bounding rect relative to `el`. Any failure here (e.g. a descendant
// that slipped past `assessSnapshotRisk`'s up-front check because it became
// tainted or entered an unreadable state *after* that check ran, or a
// zero-dimension/not-yet-loaded <video>) is re-thrown as a typed
// `SnapshotError` -- this still runs strictly before `compositor.beginEffect`
// has touched `el`'s DOM (no `fx-ghost`, no canvas shown yet), so the
// no-side-effect invariant holds even for this late-discovered case.
function compositeLiveMedia(el, ctx, containerRect, dpr) {
    const nodes = el.querySelectorAll('video, canvas');
    for (const node of nodes) {
        const r = node.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) continue;
        const x = (r.left - containerRect.left) * dpr;
        const y = (r.top - containerRect.top) * dpr;
        const w = r.width * dpr;
        const h = r.height * dpr;
        try {
            ctx.drawImage(node, x, y, w, h);
        } catch (e) {
            throw new SnapshotError('snapshot: failed to composite live <video>/<canvas> content', { cause: e });
        }
    }
}

// -- Public API -----------------------------------------------------------

// snapshot(el, { dprCap }) -> Promise<{ canvas: HTMLCanvasElement, width,
// height }> (width/height in CSS px) | rejects with SnapshotError.
//
// Order of operations matters for the "no side effect before throw"
// invariant: `assessSnapshotRisk` runs FIRST and SYNCHRONOUSLY (before this
// function has awaited anything, i.e. before the returned promise's
// microtask queue even starts) -- a cross-origin-iframe/tainted-canvas window
// therefore rejects on literally the first turn, having created nothing.
// Every later failure (image decode, live-media composite) is caught and
// re-thrown as `SnapshotError` too, and none of them touch `el` itself --
// only detached clones/canvases/images that get garbage-collected.
export async function snapshot(el, { dprCap } = {}) {
    assessSnapshotRisk(el);

    const rect = el.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    const dpr = computeDprCap(dprCap);

    let canvas;
    try {
        canvas = await rasterizeChrome(el, width, height, dpr);
    } catch (e) {
        if (e instanceof SnapshotError) throw e;
        throw new SnapshotError('snapshot: foreignObject rasterization failed', { cause: e });
    }

    const ctx = canvas.getContext('2d');
    compositeLiveMedia(el, ctx, rect, dpr);

    return { canvas, width, height };
}
