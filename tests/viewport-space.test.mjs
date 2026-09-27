import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createViewportSpace,
  resizeViewportSpace,
  screenToLogical,
  logicalToScreen,
  logicalLengthToScreen,
  screenLengthToLogical,
  containsLogicalPoint,
  containsScreenPoint,
  containsContentPoint,
} from '../src/coordinates/viewport-space.js';
import { createDomViewportSpace } from '../src/coordinates/dom-viewport-space.js';

const cases = [
  { name: '16:9 1920x1080', width: 1920, height: 1080, scale: 1.2, left: 0, top: 0 },
  { name: '16:9 1280x720', width: 1280, height: 720, scale: 0.8, left: 0, top: 0 },
  { name: '16:10 1440x900', width: 1440, height: 900, scale: 0.9, left: 0, top: 45 },
  { name: '4:3 1024x768', width: 1024, height: 768, scale: 0.64, left: 0, top: 96 },
  { name: 'ultrawide 2560x1080', width: 2560, height: 1080, scale: 1.2, left: 320, top: 0 },
];

for (const item of cases) {
  test(`${item.name} uses a centred uniform contain fit`, () => {
    const viewport = createViewportSpace({
      logicalWidth: 1600,
      logicalHeight: 900,
      displayRect: { left: 0, top: 0, width: item.width, height: item.height },
    });
    assert.equal(viewport.presentationScale, item.scale);
    assert.equal(viewport.contentRect.left, item.left);
    assert.equal(viewport.contentRect.top, item.top);
    assert.equal(viewport.contentRect.width, 1600 * item.scale);
    assert.equal(viewport.contentRect.height, 900 * item.scale);
  });
}

test('screen and logical points round trip with a non-zero display origin', () => {
  const viewport = createViewportSpace({
    logicalWidth: 1600,
    logicalHeight: 900,
    displayRect: { left: 50, top: 30, width: 1440, height: 900 },
  });
  const logical = { x: 713.25, y: 411.5 };
  const screen = logicalToScreen(viewport, logical);
  const logicalRoundTrip = screenToLogical(viewport, screen);
  assert.ok(Math.abs(logicalRoundTrip.x - logical.x) < 1e-9);
  assert.ok(Math.abs(logicalRoundTrip.y - logical.y) < 1e-9);
  const screenRoundTrip = logicalToScreen(viewport, screenToLogical(viewport, { x: 611, y: 274 }));
  assert.ok(Math.abs(screenRoundTrip.x - 611) < 1e-9);
  assert.ok(Math.abs(screenRoundTrip.y - 274) < 1e-9);
});

test('containment distinguishes display, content, and logical bounds', () => {
  const viewport = createViewportSpace({
    logicalWidth: 1600,
    logicalHeight: 900,
    displayRect: { left: 0, top: 0, width: 1440, height: 900 },
  });
  assert.equal(containsScreenPoint(viewport, { x: 20, y: 20 }), true);
  assert.equal(containsContentPoint(viewport, { x: 20, y: 20 }), false);
  assert.equal(containsContentPoint(viewport, { x: 20, y: 45 }), true);
  assert.equal(containsLogicalPoint(viewport, { x: 1600, y: 900 }), true);
  assert.equal(containsLogicalPoint(viewport, { x: 1600.01, y: 900 }), false);
});

test('lengths use presentation scale only', () => {
  const viewport = createViewportSpace({
    logicalWidth: 1600,
    logicalHeight: 900,
    displayRect: { width: 1280, height: 720 },
    backingScale: 3,
  });
  assert.equal(logicalLengthToScreen(viewport, 100), 80);
  assert.equal(screenLengthToLogical(viewport, 80), 100);
});

test('resize returns a new immutable snapshot and preserves logical size by default', () => {
  const first = createViewportSpace({
    logicalWidth: 1600,
    logicalHeight: 900,
    displayRect: { width: 1920, height: 1080 },
  });
  const second = resizeViewportSpace(first, { displayRect: { width: 1024, height: 768 } });
  assert.notEqual(second, first);
  assert.equal(first.contentRect.width, 1920);
  assert.equal(second.logicalWidth, 1600);
  assert.equal(second.logicalHeight, 900);
  assert.equal(Object.isFrozen(second), true);
  assert.equal(Object.isFrozen(second.contentRect), true);
});

test('backing scale is metadata and cannot affect coordinate conversion', () => {
  const base = {
    logicalWidth: 1600,
    logicalHeight: 900,
    displayRect: { left: 12, top: 18, width: 1280, height: 720 },
  };
  const one = createViewportSpace({ ...base, backingScale: 1 });
  const three = createViewportSpace({ ...base, backingScale: 3 });
  const point = { x: 320, y: 180 };
  assert.deepEqual(logicalToScreen(one, point), logicalToScreen(three, point));
  assert.deepEqual(screenToLogical(one, { x: 400, y: 300 }), screenToLogical(three, { x: 400, y: 300 }));
});

test('parity mode has scale one and preserves numeric coordinates', () => {
  const viewport = createViewportSpace({
    logicalWidth: 1365,
    logicalHeight: 767,
    displayRect: { left: 0, top: 0, width: 1365, height: 767 },
    safeInsets: { top: 1, right: 2, bottom: 3, left: 4 },
  });
  assert.equal(viewport.presentationScale, 1);
  assert.deepEqual(viewport.contentRect, viewport.displayRect);
  assert.deepEqual(screenToLogical(viewport, { x: 321, y: 456 }), { x: 321, y: 456 });
  assert.deepEqual(viewport.safeInsets, { top: 1, right: 2, bottom: 3, left: 4 });
});

test('DOM adapter parity updates create new snapshots without retaining old display state', () => {
  let rect = { left: 0, top: 0, width: 1280, height: 720 };
  const element = { getBoundingClientRect: () => ({ ...rect }) };
  const windowObj = {
    devicePixelRatio: 2,
    addEventListener() {},
    removeEventListener() {},
  };
  const adapter = createDomViewportSpace({
    element,
    logicalSize: 'display',
    windowObj,
    documentObj: null,
    ResizeObserverClass: null,
    getBackingScale: () => windowObj.devicePixelRatio,
  });
  const first = adapter.start();
  rect = { left: 0, top: 0, width: 1440, height: 900 };
  const second = adapter.update();
  adapter.stop();

  assert.notEqual(second, first);
  assert.deepEqual(
    { width: first.logicalWidth, height: first.logicalHeight, scale: first.presentationScale },
    { width: 1280, height: 720, scale: 1 },
  );
  assert.deepEqual(
    { width: second.logicalWidth, height: second.logicalHeight, scale: second.presentationScale },
    { width: 1440, height: 900, scale: 1 },
  );
  assert.equal(second.backingScale, 2);
});
