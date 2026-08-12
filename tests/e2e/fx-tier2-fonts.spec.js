import { test, expect } from './fixtures.js';
import { openApp } from './helpers.js';

// Iconostat FX -- Tier-2 snapshot WEB-FONT EMBEDDING.
//
// A foreignObject SVG rasterized via new Image() can't fetch the page's
// @font-face font files, so without embedding, a snapshotted window renders
// in system fonts -- it visibly changes typeface the instant an effect starts
// (user-reported). snapshot.js embeds each @font-face as a data: URI inside
// the foreignObject. The raster itself is unverifiable headless (foreignObject
// renders blank here), but the fetch+embed pipeline -- reading the live CSSOM,
// fetching the real font files, base64-inlining them -- IS deterministically
// verifiable in the real browser the e2e runs, which is what this asserts.

test.describe('Tier 2 snapshot -- page web fonts are embedded (no system-font fallback)', () => {
  test.use({ reducedMotion: 'no-preference' });

  test('getEmbeddedFontCss() fetches the @font-face fonts and inlines them as data: URIs', async ({ page }) => {
    await openApp(page, 'resume');

    const css = await page.evaluate(async () => {
      const snap = await import('/iconostat/fx/snapshot.js');
      return await snap.getEmbeddedFontCss();
    });

    expect(css).toContain('@font-face');
    // Each face's src was rewritten to an inline base64 woff2 data: URI.
    expect(css).toMatch(/src:url\(data:font\/woff2;base64,[A-Za-z0-9+/]+=*\)/);
    // The site's actual families made it through (family descriptor preserved
    // so the browser matches the cloned text to the embedded face). The CSSOM
    // lowercases the descriptor ("fira sans"); CSS family matching is
    // case-insensitive, so this still matches the clone's "Fira Sans".
    expect(css).toMatch(/font-family:\s*["']?fira sans/i);
    expect(css).toMatch(/font-family:\s*["']?fira code/i);
    // No un-embedded external url() left behind (would fall back to a system
    // font in the isolated raster context).
    expect(css).not.toMatch(/src:[^;]*url\((['"]?)(?!data:)/);
  });
});
