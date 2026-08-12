import { test, expect } from './fixtures.js';
import { openApp } from './helpers.js';

// Iconostat FX -- Tier-2 compositor TEXTURE ORIENTATION.
//
// Why this test exists: the genie/wobble effects shipped rendering every
// window UPSIDE DOWN, and the whole Tier-2 e2e suite missed it because a
// foreignObject snapshot rasterizes BLANK in headless Chromium -- a blank
// texture looks identical flipped or not. A plain 2D <canvas> texture, by
// contrast, DOES rasterize reliably here, so we can drive a KNOWN
// red-top / blue-bottom texture through the real uploadTexture -> vertex
// shader -> drawMesh path and read back which colour lands at the top of the
// mesh. Any stray vertical flip in that path (e.g. UNPACK_FLIP_Y_WEBGL that
// isn't cancelled by the shader/UVs) puts blue on top instead of red -- which
// is exactly what an upside-down window is.
//
// This is the one orientation guarantee that IS verifiable headless, so it's
// worth a dedicated deterministic test even though the foreignObject content
// itself can't be pixel-checked here.

test.describe('Tier 2 compositor -- texture orientation is upright (not Y-flipped)', () => {
  test.use({ reducedMotion: 'no-preference' });
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.addInitScript(() => window.localStorage.setItem('iconostat-fx-tier', '2'));
  });

  test('a red-top / blue-bottom texture renders red at the top of the mesh', async ({ page }) => {
    await openApp(page, 'resume');

    const result = await page.evaluate(async () => {
      const compositor = await import('/iconostat/fx/compositor.js');
      // Bring up the shared GL canvas + context (warmup() calls ensureCanvas()).
      await compositor.warmup();

      // Known source: top half solid RED, bottom half solid BLUE.
      const src = document.createElement('canvas');
      src.width = 8; src.height = 8;
      const sctx = src.getContext('2d');
      sctx.fillStyle = 'rgb(255,0,0)'; sctx.fillRect(0, 0, 8, 4); // top half red
      sctx.fillStyle = 'rgb(0,0,255)'; sctx.fillRect(0, 4, 8, 4); // bottom half blue

      const texture = compositor.uploadTexture(src);

      // 2x2 mesh over a known on-screen rect. Row 0 = top edge (y=100),
      // row 1 = bottom edge (y=300); row-major [x,y] pairs in viewport CSS-px
      // -- the same space genie/wobble emit positions in.
      const L = 100, TOP = 100, R = 300, BOT = 300;
      const positions = new Float32Array([
        L, TOP,  R, TOP,   // row 0 (top)
        L, BOT,  R, BOT,    // row 1 (bottom)
      ]);
      compositor.drawMesh({ texture, positions, cols: 2, rows: 2, opacity: 1 });

      // Read back the shared GL canvas through a 2D canvas (top-left origin).
      const glc = document.getElementById('iconostat-fx-canvas');
      const read = document.createElement('canvas');
      read.width = glc.width; read.height = glc.height;
      const rctx = read.getContext('2d');
      rctx.drawImage(glc, 0, 0);
      const top = Array.from(rctx.getImageData(200, 130, 1, 1).data); // near rect top
      const bot = Array.from(rctx.getImageData(200, 270, 1, 1).data); // near rect bottom

      compositor.releaseTexture(texture);
      return { canvasW: glc.width, canvasH: glc.height, top, bot };
    });

    // Sanity: the GL canvas actually has a drawing buffer.
    expect(result.canvasW).toBeGreaterThan(300);
    expect(result.canvasH).toBeGreaterThan(300);

    // Upright: the TOP of the mesh samples the texture's TOP half (red),
    // the BOTTOM samples the blue half. A Y-flip swaps these.
    expect(result.top[0]).toBeGreaterThan(150); // red high at top
    expect(result.top[2]).toBeLessThan(100);    // blue low at top
    expect(result.bot[2]).toBeGreaterThan(150); // blue high at bottom
    expect(result.bot[0]).toBeLessThan(100);    // red low at bottom
  });
});
