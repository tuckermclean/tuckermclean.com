// tests/unit/geometry.test.js
import { describe, it, expect } from 'vitest';
import { pickTopIndex, cascadeOffset } from '../../assets/iconostat/geometry.js';

describe('pickTopIndex', () => {
  it('returns the index of the highest z-index', () => {
    expect(pickTopIndex([100, 305, 102])).toBe(1);
  });
  it('returns -1 for an empty list', () => {
    expect(pickTopIndex([])).toBe(-1);
  });
  it('resolves ties to the first maximum', () => {
    expect(pickTopIndex([200, 200, 100])).toBe(0);
  });
});

describe('cascadeOffset', () => {
  it('offsets by header height times index plus one on desktop', () => {
    expect(cascadeOffset(2, 30, false)).toBe(61);
  });
  it('halves the offset on mobile', () => {
    expect(cascadeOffset(2, 30, true)).toBe(30.5);
  });
});
