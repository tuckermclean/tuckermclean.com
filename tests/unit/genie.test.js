// tests/unit/genie.test.js
//
// Direct unit coverage of genie.js's pure math helpers (mesh-warp geometry,
// easing, duration selection). Imported via its REAL relative path (not the
// bare `./genie.js` specifier controller.js uses) -- vitest.config.js's
// alias only rewrites the literal `./genie.js` specifier (so controller.js
// can be parsed under vitest before Agent C landed this file), it does not
// touch this import, so this exercises the actual shipped module, not a
// stub. `run()` itself (the WebGL2/DOM choreography) is exercised by the
// real-browser e2e suite (tests/e2e/fx-tier2-genie.spec.js) -- jsdom has no
// WebGL2 and no real layout, so there is nothing honest to assert about it
// here.
import { describe, it, expect } from 'vitest';
import {
    buildMeshPositions, easeInCubic, easeOutCubic, minimizeDuration,
} from '../../assets/iconostat/fx/genie.js';

const COLS = 8;
const ROWS = 40;
const rectA = { left: 100, top: 50, width: 400, height: 300 };
const rectB = { left: 20, top: 700, width: 40, height: 24 };

describe('genie.buildMeshPositions', () => {
    it('u=0 reproduces rectA\'s plain rest-pose grid exactly (no visible pop at animation start)', () => {
        const positions = buildMeshPositions(0, rectA, rectB, COLS, ROWS, 1);
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                const i = (r * COLS + c) * 2;
                const expectedX = rectA.left + (rectA.width * c) / (COLS - 1);
                const expectedY = rectA.top + (rectA.height * r) / (ROWS - 1);
                expect(positions[i]).toBeCloseTo(expectedX, 4);
                expect(positions[i + 1]).toBeCloseTo(expectedY, 4);
            }
        }
    });

    it('u=1 reproduces rectB\'s plain rest-pose grid exactly (lands precisely on the chip/target rect)', () => {
        const positions = buildMeshPositions(1, rectA, rectB, COLS, ROWS, 1);
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                const i = (r * COLS + c) * 2;
                const expectedX = rectB.left + (rectB.width * c) / (COLS - 1);
                const expectedY = rectB.top + (rectB.height * r) / (ROWS - 1);
                expect(positions[i]).toBeCloseTo(expectedX, 4);
                expect(positions[i + 1]).toBeCloseTo(expectedY, 4);
            }
        }
    });

    it('has the correct length (cols*rows*2, row-major) for every u', () => {
        for (const u of [0, 0.2, 0.35, 0.5, 0.75, 1]) {
            const positions = buildMeshPositions(u, rectA, rectB, COLS, ROWS, 1);
            expect(positions.length).toBe(COLS * ROWS * 2);
            expect(positions instanceof Float32Array).toBe(true);
        }
    });

    it('mid-animation, bottom rows (the "pour") have traveled further toward rectB than top rows', () => {
        const positions = buildMeshPositions(0.6, rectA, rectB, COLS, ROWS, 1);
        const colIdx = 4; // an interior column, away from any left/right pinch edge case
        const topY = positions[(0 * COLS + colIdx) * 2 + 1];
        const bottomY = positions[((ROWS - 1) * COLS + colIdx) * 2 + 1];
        const topFracToB = (topY - rectA.top) / (rectB.top - rectA.top);
        const bottomFracToB = (bottomY - rectA.top) / (rectB.top - rectA.top);
        expect(bottomFracToB).toBeGreaterThan(topFracToB);
    });

    it('mid-animation, the funnel narrows the top row\'s horizontal span less than a linear interpolation would (bottom rows pinch first)', () => {
        const positions = buildMeshPositions(0.35, rectA, rectB, COLS, ROWS, 1);
        const rowSpan = (r) => {
            const left = positions[(r * COLS + 0) * 2];
            const right = positions[(r * COLS + (COLS - 1)) * 2];
            return right - left;
        };
        const topSpan = rowSpan(0);
        const bottomSpan = rowSpan(ROWS - 1);
        // Bottom rows pinch toward rectB.width first (per the per-row Bezier
        // delay) -- so at this early-ish u, the bottom row's span should
        // already be noticeably closer to rectB.width than the top row's.
        expect(Math.abs(bottomSpan - rectB.width)).toBeLessThan(Math.abs(topSpan - rectB.width));
    });

    it('softer curvature (maximize) produces a less extreme pinch than full curvature (minimize) at the same u', () => {
        const uMid = 0.35;
        const full = buildMeshPositions(uMid, rectA, rectB, COLS, ROWS, 1);
        const soft = buildMeshPositions(uMid, rectA, rectB, COLS, ROWS, 0.4);
        const span = (arr, r) => arr[(r * COLS + (COLS - 1)) * 2] - arr[(r * COLS + 0) * 2];
        const bottomRow = ROWS - 1;
        const fullPinchAmount = Math.abs(span(full, bottomRow) - rectA.width);
        const softPinchAmount = Math.abs(span(soft, bottomRow) - rectA.width);
        expect(softPinchAmount).toBeLessThan(fullPinchAmount);
    });

    it('degenerate 1-row/1-col grids do not divide by zero', () => {
        expect(() => buildMeshPositions(0.5, rectA, rectB, 1, 1, 1)).not.toThrow();
        const positions = buildMeshPositions(0.5, rectA, rectB, 1, 1, 1);
        expect(positions.length).toBe(2);
    });
});

describe('genie easing', () => {
    it('easeInCubic starts slow and ends at 1', () => {
        expect(easeInCubic(0)).toBe(0);
        expect(easeInCubic(1)).toBe(1);
        expect(easeInCubic(0.5)).toBeLessThan(0.5); // ease-in: slower than linear early on
    });

    it('easeOutCubic starts fast and ends at 1', () => {
        expect(easeOutCubic(0)).toBe(0);
        expect(easeOutCubic(1)).toBe(1);
        expect(easeOutCubic(0.5)).toBeGreaterThan(0.5); // ease-out: faster than linear early on
    });
});

describe('genie.minimizeDuration', () => {
    it('is 400ms desktop, 320ms mobile (window.innerWidth <= 768)', () => {
        const original = window.innerWidth;
        try {
            Object.defineProperty(window, 'innerWidth', { value: 1280, configurable: true });
            expect(minimizeDuration()).toBe(400);
            Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true });
            expect(minimizeDuration()).toBe(320);
            Object.defineProperty(window, 'innerWidth', { value: 768, configurable: true });
            expect(minimizeDuration()).toBe(320); // boundary: <=768 is mobile
        } finally {
            Object.defineProperty(window, 'innerWidth', { value: original, configurable: true });
        }
    });
});
