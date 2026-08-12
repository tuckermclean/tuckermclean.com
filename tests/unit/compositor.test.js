// tests/unit/compositor.test.js
//
// jsdom has no real WebGL2 implementation (canvas.getContext('webgl2')
// always returns null here), so the mesh-render/texture-upload/context-loss
// pieces of compositor.js can only be genuinely exercised in a real (if
// headless) browser -- see tests/e2e/fx-tier2.spec.js. What IS honestly
// testable without a GL context: the warmup verdict's graceful "no WebGL2 ->
// demote" degradation path (a real, unmocked exercise of `ensureCanvas()`
// finding `gl` null), and the `forceVerdict` test-only override that lets
// controller.js's warmup-verdict branch be exercised deterministically
// without depending on real GPU timing.
import { describe, it, expect, beforeEach } from 'vitest';
import { warmup, CANVAS_ID } from '../../assets/iconostat/fx/compositor.js';

describe('compositor.warmup (jsdom -- no real WebGL2)', () => {
  beforeEach(() => {
    document.querySelectorAll(`#${CANVAS_ID}`).forEach((c) => c.remove());
  });

  it('degrades to "demote" when no WebGL2 context is available (real, unmocked ensureCanvas() path)', async () => {
    const verdict = await warmup();
    expect(verdict).toBe('demote');
    // ensureCanvas() DID create the canvas element (it always does, before
    // discovering gl is null) -- but it must stay hidden/never shown, since
    // the warmup probe itself never calls showCanvas().
    const canvas = document.getElementById(CANVAS_ID);
    expect(canvas).not.toBeNull();
    expect(canvas.style.display).toBe('none');
  });

  it('a second call reuses the cached promise (probe runs once per session)', async () => {
    const first = warmup();
    const second = warmup();
    expect(second).toBe(first);
    await first;
  });

  it('forceVerdict short-circuits before any canvas/GL work', async () => {
    const verdict = await warmup({ forceVerdict: 'ok' });
    expect(verdict).toBe('ok');
    expect(document.getElementById(CANVAS_ID)).toBeNull();
  });

  it('forceVerdict("demote") also short-circuits with no canvas created', async () => {
    const verdict = await warmup({ forceVerdict: 'demote' });
    expect(verdict).toBe('demote');
    expect(document.getElementById(CANVAS_ID)).toBeNull();
  });
});
