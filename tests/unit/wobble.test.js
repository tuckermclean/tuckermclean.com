// tests/unit/wobble.test.js
//
// Direct unit coverage of wobble.js's pure spring-mass physics (grid/spring
// topology, the fixed-step integrator, settle convergence, and the
// max-duration-cap's underlying "never converges" scenario). Imported via
// its REAL relative path (not the bare `./wobble.js` specifier
// controller.js uses -- vitest.config.js's alias only rewrites that literal
// specifier, not this one, so this exercises the actual shipped module).
// The DOM/rAF/event-loop integration (dragStart/dragMove/dragEnd, the
// swap-protocol calls, the settle+cap termination as actually observed
// end-to-end, inherit-on-re-drag, genie-refusal) is exercised by the
// real-browser e2e suite (tests/e2e/fx-tier2-wobble.spec.js) -- jsdom has no
// WebGL2, no real rAF timing, and no real layout, so there is nothing
// honest to assert about that integration here. See genie.test.js for the
// identical split-of-responsibility rationale.
import { describe, it, expect, afterEach } from 'vitest';
import {
    mobileViewport, gridDims, restGrid, nearestIndex, buildSprings,
    kineticEnergy, stepPhysics, __testTuning,
} from '../../assets/iconostat/fx/wobble.js';

afterEach(() => {
    __testTuning(); // reset any test-only overrides between tests
    const original = 1280;
    Object.defineProperty(window, 'innerWidth', { value: original, configurable: true });
});

describe('wobble.gridDims / mobileViewport', () => {
    it('is 6x6 desktop, 4x4 mobile (window.innerWidth <= 768)', () => {
        Object.defineProperty(window, 'innerWidth', { value: 1280, configurable: true });
        expect(mobileViewport()).toBe(false);
        expect(gridDims()).toEqual({ cols: 6, rows: 6 });

        Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true });
        expect(mobileViewport()).toBe(true);
        expect(gridDims()).toEqual({ cols: 4, rows: 4 });

        Object.defineProperty(window, 'innerWidth', { value: 768, configurable: true });
        expect(mobileViewport()).toBe(true); // boundary: <=768 is mobile
        expect(gridDims()).toEqual({ cols: 4, rows: 4 });
    });
});

describe('wobble.restGrid', () => {
    it('produces a row-major, cols*rows*2-length grid spanning exactly the given rect', () => {
        const cols = 6, rows = 6;
        const grid = restGrid(cols, rows, 100, 50, 300, 200);
        expect(grid.length).toBe(cols * rows * 2);
        expect(grid instanceof Float32Array).toBe(true);
        // Top-left vertex == rect origin.
        expect(grid[0]).toBeCloseTo(100, 4);
        expect(grid[1]).toBeCloseTo(50, 4);
        // Bottom-right vertex == rect's opposite corner.
        const lastIdx = (rows * cols - 1) * 2;
        expect(grid[lastIdx]).toBeCloseTo(400, 4);
        expect(grid[lastIdx + 1]).toBeCloseTo(250, 4);
    });

    it('degenerate 1x1 grid does not divide by zero', () => {
        expect(() => restGrid(1, 1, 10, 20, 50, 60)).not.toThrow();
        const grid = restGrid(1, 1, 10, 20, 50, 60);
        expect(grid.length).toBe(2);
        expect(grid[0]).toBeCloseTo(10, 4);
        expect(grid[1]).toBeCloseTo(20, 4);
    });
});

describe('wobble.nearestIndex', () => {
    it('picks the top-left vertex for a pointer at the rect origin', () => {
        expect(nearestIndex(100, 50, 100, 50, 300, 200, 6, 6)).toBe(0);
    });

    it('picks the bottom-right vertex for a pointer at the rect\'s opposite corner', () => {
        const cols = 6, rows = 6;
        expect(nearestIndex(400, 250, 100, 50, 300, 200, cols, rows)).toBe(rows * cols - 1);
    });

    it('picks the center-ish vertex for a pointer at the rect center', () => {
        const cols = 6, rows = 6; // even dims -- center falls between vertices, either adjacent one is "nearest" (rounds to col/row index 2 or 3)
        const idx = nearestIndex(250, 150, 100, 50, 300, 200, cols, rows);
        const c = idx % cols;
        const r = Math.floor(idx / cols);
        expect(c).toBeGreaterThanOrEqual(2);
        expect(c).toBeLessThanOrEqual(3);
        expect(r).toBeGreaterThanOrEqual(2);
        expect(r).toBeLessThanOrEqual(3);
    });

    it('clamps a pointer outside the rect to an edge vertex rather than an out-of-range index', () => {
        const idx = nearestIndex(-9999, -9999, 100, 50, 300, 200, 6, 6);
        expect(idx).toBe(0);
        const idx2 = nearestIndex(9999, 9999, 100, 50, 300, 200, 6, 6);
        expect(idx2).toBe(35);
    });
});

describe('wobble.buildSprings', () => {
    it('a 6x6 grid has the expected structural/shear edge counts', () => {
        const { structural, shear } = buildSprings(6, 6);
        // Structural: (cols-1)*rows horizontal + cols*(rows-1) vertical = 5*6 + 6*5 = 60
        expect(structural.length).toBe(60);
        // Shear: 2 diagonals per interior cell = 2*(cols-1)*(rows-1) = 2*5*5 = 50
        expect(shear.length).toBe(50);
    });

    it('every edge index pair is in range and distinct endpoints', () => {
        const { structural, shear } = buildSprings(4, 4);
        for (const [i, j] of [...structural, ...shear]) {
            expect(i).toBeGreaterThanOrEqual(0);
            expect(j).toBeGreaterThanOrEqual(0);
            expect(i).toBeLessThan(16);
            expect(j).toBeLessThan(16);
            expect(i).not.toBe(j);
        }
    });
});

describe('wobble.kineticEnergy', () => {
    it('is zero for an all-zero velocity array', () => {
        expect(kineticEnergy(new Float32Array(8))).toBe(0);
    });

    it('sums squared components', () => {
        const vel = new Float32Array([3, 4, 0, 0]); // 3-4-5 triangle -> 9+16=25
        expect(kineticEnergy(vel)).toBeCloseTo(25, 4);
    });
});

describe('wobble.stepPhysics (the settle behavior the max-duration cap exists to backstop)', () => {
    function setup(cols = 6, rows = 6, left = 100, top = 50, width = 300, height = 200) {
        const springs = buildSprings(cols, rows);
        const restPos = restGrid(cols, rows, left, top, width, height);
        const simPos = Float32Array.from(restPos);
        const vel = new Float32Array(cols * rows * 2);
        return { cols, rows, springs, restPos, simPos, vel };
    }

    it('a mesh already at rest with zero velocity stays at rest (no spurious drift/energy injection)', () => {
        const s = setup();
        for (let i = 0; i < 20; i++) {
            stepPhysics({ simPos: s.simPos, vel: s.vel, restPos: s.restPos, springs: s.springs });
        }
        expect(kineticEnergy(s.vel)).toBeCloseTo(0, 6);
        for (let i = 0; i < s.simPos.length; i++) {
            expect(s.simPos[i]).toBeCloseTo(s.restPos[i], 3);
        }
    });

    it('pinning one vertex away from rest deforms neighbors (jelly coupling) without NaN/blowup', () => {
        const s = setup();
        const pinnedIndex = 0; // top-left
        const pinnedX = s.restPos[0] - 120;
        const pinnedY = s.restPos[1] - 80;
        for (let i = 0; i < 60; i++) { // 500ms of dragging at 120Hz
            stepPhysics({
                simPos: s.simPos, vel: s.vel, restPos: s.restPos, springs: s.springs,
                pinnedIndex, pinnedX, pinnedY,
            });
        }
        // The pinned vertex is exactly where we pinned it.
        expect(s.simPos[0]).toBeCloseTo(pinnedX, 3);
        expect(s.simPos[1]).toBeCloseTo(pinnedY, 3);
        // Its immediate neighbor (index 1, one column over) got dragged
        // toward it too (jelly coupling) -- no longer exactly at its rest
        // position, and no NaN anywhere in the whole mesh.
        expect(s.simPos[2]).not.toBeCloseTo(s.restPos[2], 3);
        for (let i = 0; i < s.simPos.length; i++) {
            expect(Number.isFinite(s.simPos[i])).toBe(true);
            expect(Number.isFinite(s.vel[i])).toBe(true);
        }
    });

    it('the pinned title-bar row stays rigid at the window rect while the body trails (rigid-bar drag feel)', () => {
        const s = setup(); // 6x6
        const topRow = new Set([0, 1, 2, 3, 4, 5]); // row 0 of a 6-wide grid == the title bar
        // Simulate the window having moved right 100px: rest shifts, sim starts at the OLD rest.
        const restMoved = Float32Array.from(s.restPos);
        for (let i = 0; i < restMoved.length; i += 2) restMoved[i] += 100;

        // One step: the whole title-bar row snaps rigidly to the new rect (no flex, zero velocity)...
        stepPhysics({ simPos: s.simPos, vel: s.vel, restPos: restMoved, springs: s.springs, pinnedRest: topRow });
        for (const idx of topRow) {
            expect(s.simPos[idx * 2]).toBeCloseTo(restMoved[idx * 2], 3);       // rigid X
            expect(s.simPos[idx * 2 + 1]).toBeCloseTo(restMoved[idx * 2 + 1], 3); // rigid Y
            expect(s.vel[idx * 2]).toBe(0);
            expect(s.vel[idx * 2 + 1]).toBe(0);
        }
        // ...while a bottom-row vertex is still trailing behind the new rect (the wobble lives here, not at the grab).
        const bottomLeft = (s.rows - 1) * s.cols; // index 30
        expect(s.simPos[bottomLeft * 2]).toBeGreaterThan(s.restPos[bottomLeft * 2]); // it started moving toward the new rect...
        expect(s.simPos[bottomLeft * 2]).toBeLessThan(restMoved[bottomLeft * 2]);     // ...but hasn't caught up (lag == wobble)

        // Given enough steps the body catches up to the (rigid) new rect and settles; no blowup.
        for (let i = 0; i < 300; i++) {
            stepPhysics({ simPos: s.simPos, vel: s.vel, restPos: restMoved, springs: s.springs, pinnedRest: topRow });
        }
        expect(s.simPos[bottomLeft * 2]).toBeCloseTo(restMoved[bottomLeft * 2], 0); // within ~0.5px of rest
        for (let i = 0; i < s.simPos.length; i++) expect(Number.isFinite(s.simPos[i])).toBe(true);
    });

    it('releasing the pin lets kinetic energy decay toward zero within the ~2s cap window (settle convergence)', () => {
        const s = setup();
        // Drag one corner far away for a bit (builds up real velocity/energy).
        for (let i = 0; i < 30; i++) {
            stepPhysics({
                simPos: s.simPos, vel: s.vel, restPos: s.restPos, springs: s.springs,
                pinnedIndex: 0, pinnedX: s.restPos[0] - 150, pinnedY: s.restPos[1] - 100,
            });
        }
        const keAfterDrag = kineticEnergy(s.vel);
        expect(keAfterDrag).toBeGreaterThan(0);

        // Release (no pin) and let it settle -- 240 steps == 2s at 120Hz,
        // exactly the production max-duration cap window.
        let settledAt = -1;
        for (let i = 0; i < 240; i++) {
            stepPhysics({ simPos: s.simPos, vel: s.vel, restPos: s.restPos, springs: s.springs });
            if (settledAt === -1 && kineticEnergy(s.vel) < 30) settledAt = i; // SETTLE_EPSILON's production value
        }
        expect(settledAt).toBeGreaterThan(-1); // converged NATURALLY (not via the cap)...
        expect(settledAt).toBeLessThan(220); // ...comfortably before the 240-step (2s) cap. The
        // wobble is intentionally under-damped (a "jello" jiggle, per user
        // feedback) so this settles ~1.3s rather than the old over-damped
        // ~0.5s -- still a natural settle with margin, so no cap-forced pop.
        // And it stays converged (doesn't re-diverge) -- final energy is tiny.
        expect(kineticEnergy(s.vel)).toBeLessThan(30);
        // Every vertex is back at (or very near) its rest position -- "real
        // window position parity" for the physics layer.
        for (let i = 0; i < s.simPos.length; i++) {
            expect(s.simPos[i]).toBeCloseTo(s.restPos[i], 1);
        }
    });

    it('a continuously-re-pinned (never-released) mesh does NOT converge on its own -- proves the max-duration cap is load-bearing, not decorative', () => {
        const s = setup();
        // Simulate a pathological "never settles" trajectory: the pin keeps
        // moving in a small circle forever (as if a caller never transitioned
        // out of the dragging phase). This is exactly the scenario the
        // production max-duration cap exists to backstop -- kinetic energy
        // never dips below SETTLE_EPSILON because energy keeps getting
        // re-injected every step.
        const keSamples = [];
        for (let i = 0; i < 240; i++) { // the full 2s cap window
            const angle = i * 0.3;
            stepPhysics({
                simPos: s.simPos, vel: s.vel, restPos: s.restPos, springs: s.springs,
                pinnedIndex: 0,
                pinnedX: s.restPos[0] + Math.cos(angle) * 100,
                pinnedY: s.restPos[1] + Math.sin(angle) * 100,
            });
            keSamples.push(kineticEnergy(s.vel));
        }
        // Ignore the initial warm-up transient (the first ~60 steps ramping
        // up from a standing start legitimately pass through near-zero
        // energy before the continuous drive has built up any real
        // velocity) -- the STEADY-STATE tail is what proves "never
        // converges": average kinetic energy over the last 100 steps stays
        // well above the production epsilon, i.e. a naive "wait for KE <
        // epsilon" loop with no cap would spin for the ENTIRE 240-step (2s)
        // window and beyond, not just transiently dip near it. The DOM-
        // integration layer's `settleDeadlineMs` wall-clock check (tick(),
        // wobble.js) is what terminates this scenario in production,
        // independent of this physics ever converging -- see
        // tests/e2e/fx-tier2-wobble.spec.js's "__testTuning" cap-path test
        // for the end-to-end proof.
        const tail = keSamples.slice(-100);
        const avgTailKe = tail.reduce((a, b) => a + b, 0) / tail.length;
        expect(avgTailKe).toBeGreaterThan(100); // well above SETTLE_EPSILON (30)
    });
});
