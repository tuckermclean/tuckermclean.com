// tests/unit/snapshot.test.js
//
// Unit coverage for the parts of assets/iconostat/fx/snapshot.js that don't
// need a real browser's foreignObject/WebGL2 pipeline: the DPR-cap policy
// and the up-front taint/cross-origin risk assessment. The latter is pure
// URL-string logic (deliberately -- see snapshot.js's comments on why it
// never touches `iframe.contentDocument`), so it's fully exercisable in
// jsdom without any network access or real cross-origin server. The
// foreignObject rasterization pipeline itself (Image decode, canvas draw) is
// covered by tests/e2e/fx-tier2.spec.js instead, in a real (if headless)
// browser -- see that file's header for the sandbox caveats.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SnapshotError, computeDprCap, assessSnapshotRisk } from '../../assets/iconostat/fx/snapshot.js';

describe('SnapshotError', () => {
  it('is a named, typed Error subclass', () => {
    const err = new SnapshotError('boom');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(SnapshotError);
    expect(err.name).toBe('SnapshotError');
    expect(err.message).toBe('boom');
  });

  it('carries an optional cause', () => {
    const cause = new Error('inner');
    const err = new SnapshotError('outer', { cause });
    expect(err.cause).toBe(cause);
  });
});

describe('computeDprCap', () => {
  const originalInnerWidth = window.innerWidth;
  const originalDpr = window.devicePixelRatio;

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: originalInnerWidth, configurable: true });
    Object.defineProperty(window, 'devicePixelRatio', { value: originalDpr, configurable: true });
  });

  it('caps at 2 on desktop (innerWidth > 768)', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1280, configurable: true });
    Object.defineProperty(window, 'devicePixelRatio', { value: 3, configurable: true });
    expect(computeDprCap()).toBe(2);
  });

  it('caps at 1.5 on mobile (innerWidth <= 768)', () => {
    Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true });
    Object.defineProperty(window, 'devicePixelRatio', { value: 3, configurable: true });
    expect(computeDprCap()).toBe(1.5);
  });

  it('does not cap a low devicePixelRatio', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1280, configurable: true });
    Object.defineProperty(window, 'devicePixelRatio', { value: 1, configurable: true });
    expect(computeDprCap()).toBe(1);
  });

  it('an explicit positive override always wins', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1280, configurable: true });
    Object.defineProperty(window, 'devicePixelRatio', { value: 1, configurable: true });
    expect(computeDprCap(3.5)).toBe(3.5);
  });

  it('ignores a non-positive/invalid override and falls back to policy', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1280, configurable: true });
    Object.defineProperty(window, 'devicePixelRatio', { value: 1, configurable: true });
    expect(computeDprCap(0)).toBe(1);
    expect(computeDprCap(-1)).toBe(1);
    expect(computeDprCap(NaN)).toBe(1);
  });
});

describe('assessSnapshotRisk', () => {
  let container;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('does not throw for a window with only same-origin, static content', () => {
    container.innerHTML = '<div class="window-header">Title</div><div class="window-body">hi</div>';
    expect(() => assessSnapshotRisk(container)).not.toThrow();
  });

  it('does not throw for an iframe with no src / about:blank', () => {
    const iframe = document.createElement('iframe');
    container.appendChild(iframe);
    expect(() => assessSnapshotRisk(container)).not.toThrow();

    iframe.src = 'about:blank';
    expect(() => assessSnapshotRisk(container)).not.toThrow();
  });

  it('does not throw for a same-origin iframe', () => {
    const iframe = document.createElement('iframe');
    iframe.src = `${window.location.origin}/some/page`;
    container.appendChild(iframe);
    expect(() => assessSnapshotRisk(container)).not.toThrow();
  });

  it('throws SnapshotError for a cross-origin iframe, without side effects', () => {
    const iframe = document.createElement('iframe');
    iframe.src = 'https://cross-origin.example.test/embed';
    container.appendChild(iframe);

    expect(() => assessSnapshotRisk(container)).toThrow(SnapshotError);
    // No side effect: the risk check is pure inspection, nothing about the
    // DOM changes as a result of throwing.
    expect(container.classList.contains('fx-ghost')).toBe(false);
    expect(document.querySelectorAll('canvas#iconostat-fx-canvas').length).toBe(0);
  });

  it('throws SnapshotError for an iframe pointed at an opaque-origin data: URL', () => {
    const iframe = document.createElement('iframe');
    iframe.src = 'data:text/html,<h1>hi</h1>';
    container.appendChild(iframe);
    expect(() => assessSnapshotRisk(container)).toThrow(SnapshotError);
  });

  it('throws SnapshotError for a nested cross-origin iframe (deep descendant)', () => {
    const wrapper = document.createElement('div');
    const iframe = document.createElement('iframe');
    iframe.src = 'https://cross-origin.example.test/embed';
    wrapper.appendChild(iframe);
    container.appendChild(wrapper);
    expect(() => assessSnapshotRisk(container)).toThrow(SnapshotError);
  });

  it('does not throw for a cross-origin image WITH crossorigin set', () => {
    const img = document.createElement('img');
    img.crossOrigin = 'anonymous';
    img.src = 'https://cross-origin.example.test/pic.png';
    container.appendChild(img);
    expect(() => assessSnapshotRisk(container)).not.toThrow();
  });

  it('throws SnapshotError for a cross-origin image WITHOUT crossorigin', () => {
    const img = document.createElement('img');
    img.src = 'https://cross-origin.example.test/pic.png';
    container.appendChild(img);
    expect(() => assessSnapshotRisk(container)).toThrow(SnapshotError);
  });

  it('does not throw for a same-origin image', () => {
    const img = document.createElement('img');
    img.src = `${window.location.origin}/pic.png`;
    container.appendChild(img);
    expect(() => assessSnapshotRisk(container)).not.toThrow();
  });

  it('does not throw for a data: URL image (does not taint canvas readback)', () => {
    const img = document.createElement('img');
    img.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    container.appendChild(img);
    expect(() => assessSnapshotRisk(container)).not.toThrow();
  });

  it('checks video/audio/source elements the same way as img', () => {
    const video = document.createElement('video');
    video.src = 'https://cross-origin.example.test/movie.mp4';
    container.appendChild(video);
    expect(() => assessSnapshotRisk(container)).toThrow(SnapshotError);
  });
});
