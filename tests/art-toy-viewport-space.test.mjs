import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ART_TOY_AUTHORED_SPACES,
  createArtToyViewportController,
  createArtToyViewportSpace,
  getArtToyAuthoredSpace,
} from '../src/art/art-toy-viewport-space.js';

const factorySource = readFileSync(new URL('../src/art/art-toy-factory.js', import.meta.url), 'utf8');

function assertPoint(actual, expected, epsilon = 1e-9) {
  assert.ok(Math.abs(actual.x - expected.x) <= epsilon, `${actual.x} != ${expected.x}`);
  assert.ok(Math.abs(actual.y - expected.y) <= epsilon, `${actual.y} != ${expected.y}`);
}

test('authored Art Toy spaces preserve base panels and explicit extended workspaces', () => {
  assert.deepEqual(ART_TOY_AUTHORED_SPACES.fireworks, {
    logicalWidth: 220,
    logicalHeight: 220,
    workspaceBounds: { left: -142, top: 74, width: 1600, height: 1600 },
  });
  for (const type of ['laserTrails', 'sticker']) {
    assert.deepEqual(getArtToyAuthoredSpace(type), {
      logicalWidth: 220,
      logicalHeight: 220,
      workspaceBounds: { left: -94, top: 74, width: 1600, height: 1600 },
    });
  }
});

test('base logical coordinates round trip through transformed client rectangles', () => {
  for (const displayRect of [
    { left: 0, top: 0, width: 220, height: 220 },
    { left: 40, top: 70, width: 110, height: 110 },
    { left: 120, top: 35, width: 330, height: 330 },
  ]) {
    const viewport = createArtToyViewportSpace({
      ...ART_TOY_AUTHORED_SPACES.sticker,
      displayRect,
    });
    const logical = { x: 47.5, y: 184.25 };
    const display = viewport.logicalToDisplay(logical);
    assertPoint(viewport.clientToLogical(display), logical);
  }
});

test('extended workspace coordinates use the same uniform projection', () => {
  const viewport = createArtToyViewportSpace({
    ...ART_TOY_AUTHORED_SPACES.fireworks,
    displayRect: { left: 100, top: 50, width: 440, height: 440 },
  });
  const logical = { x: 1200, y: 1400 };
  const display = viewport.logicalToDisplay(logical);
  assertPoint(viewport.clientToLogical(display), logical);
  assert.deepEqual(viewport.classifyLogicalPoint(logical), {
    insideBaseContent: false,
    insideExtendedWorkspace: true,
  });
});

test('non-square presentations contain the base without X/Y distortion', () => {
  for (const displayRect of [
    { left: 0, top: 0, width: 440, height: 220 },
    { left: 0, top: 0, width: 220, height: 440 },
  ]) {
    const viewport = createArtToyViewportSpace({
      ...ART_TOY_AUTHORED_SPACES.laserTrails,
      displayRect,
    });
    const origin = viewport.logicalToDisplay({ x: 0, y: 0 });
    const xUnit = viewport.logicalToDisplay({ x: 100, y: 0 });
    const yUnit = viewport.logicalToDisplay({ x: 0, y: 100 });
    assert.equal(xUnit.x - origin.x, yUnit.y - origin.y);
    assert.equal(viewport.contentRect.width, viewport.contentRect.height);
  }
});

test('client classification distinguishes display, base content, and extended workspace', () => {
  const viewport = createArtToyViewportSpace({
    ...ART_TOY_AUTHORED_SPACES.sticker,
    displayRect: { left: 0, top: 0, width: 440, height: 220 },
  });
  const letterbox = viewport.classifyClientPoint({ x: 20, y: 110 });
  assert.equal(letterbox.insideDisplayRect, true);
  assert.equal(letterbox.insideBaseContent, false);

  const base = viewport.classifyClientPoint(viewport.logicalToDisplay({ x: 110, y: 110 }));
  assert.equal(base.insideBaseContent, true);
  assert.equal(base.insideExtendedWorkspace, true);

  const extended = viewport.classifyClientPoint(viewport.logicalToDisplay({ x: 800, y: 800 }));
  assert.equal(extended.insideDisplayRect, false);
  assert.equal(extended.insideBaseContent, false);
  assert.equal(extended.insideExtendedWorkspace, true);
});

test('DPR metadata cannot affect Art Toy coordinate conversion', () => {
  const logical = { x: -40, y: 600 };
  const results = [1, 1.5, 2, 3].map((backingScale) => {
    const viewport = createArtToyViewportSpace({
      ...ART_TOY_AUTHORED_SPACES.sticker,
      displayRect: { left: 25, top: 30, width: 330, height: 330 },
      backingScale,
    });
    return viewport.clientToLogical(viewport.logicalToDisplay(logical));
  });
  results.forEach((result) => assertPoint(result, logical));
});

test('controllers are instance-owned and support different workspace configurations', () => {
  const rectA = { left: 0, top: 0, width: 220, height: 220 };
  const rectB = { left: 500, top: 100, width: 300, height: 150 };
  const a = createArtToyViewportController({
    element: { getBoundingClientRect: () => rectA },
    authoredSpace: ART_TOY_AUTHORED_SPACES.fireworks,
  });
  const b = createArtToyViewportController({
    element: { getBoundingClientRect: () => rectB },
    authoredSpace: ART_TOY_AUTHORED_SPACES.sticker,
  });

  assert.equal(a.authoredSpace.workspaceBounds.left, -142);
  assert.equal(b.authoredSpace.workspaceBounds.left, -94);
  assert.notDeepEqual(a.snapshot().displayRect, b.snapshot().displayRect);
  assert.ok(Object.isFrozen(a));
  assert.ok(Object.isFrozen(a.snapshot()));
});

test('factory installs instance viewport before toy setup', () => {
  assert.match(factorySource, /installArtToyViewportDebug\(panel, type\)/);
  assert.match(factorySource, /__artToyViewportSpace/);
  assert.match(factorySource, /getArtToyViewportDebugSnapshot/);
  assert.ok(
    factorySource.lastIndexOf('installArtToyViewportDebug(panel, type)')
      < factorySource.lastIndexOf('setupVisualForType(panel, type)'),
  );
});

test('Fireworks uses shared logical input without its former independent X/Y path', () => {
  const fireworksSource = factorySource.slice(
    factorySource.indexOf('function setupFireworks(panel)'),
    factorySource.indexOf('function setupLaserTrails(panel)'),
  );
  assert.match(fireworksSource, /clientToLogical: clientToFireworksLogical/);
  assert.match(fireworksSource, /classifyFireworksClientPoint/);
  assert.match(fireworksSource, /insideExtendedWorkspace/);
  assert.doesNotMatch(fireworksSource, /scaleX = rect\.width \/ PANEL_PX/);

});

test('Fireworks anchor dragging is invariant across display size, zoom, and toy scale', () => {
  const anchor = { x: 240, y: 310 };
  const logicalDelta = { x: 84, y: -36 };
  for (const displayRect of [
    { left: 20, top: 40, width: 110, height: 110 },
    { left: 20, top: 40, width: 176, height: 176 },
    { left: 20, top: 40, width: 220, height: 220 },
    { left: 20, top: 40, width: 330, height: 330 },
  ]) {
    const viewport = createArtToyViewportSpace({
      ...ART_TOY_AUTHORED_SPACES.fireworks,
      displayRect,
    });
    const startClient = viewport.logicalToDisplay(anchor);
    const endClient = viewport.logicalToDisplay({
      x: anchor.x + logicalDelta.x,
      y: anchor.y + logicalDelta.y,
    });
    const startLogical = viewport.clientToLogical(startClient);
    const endLogical = viewport.clientToLogical(endClient);
    assertPoint({
      x: anchor.x + endLogical.x - startLogical.x,
      y: anchor.y + endLogical.y - startLogical.y,
    }, { x: 324, y: 274 });
  }
});

test('Fireworks non-square projection keeps positions and effect lengths uniformly scaled', () => {
  const viewport = createArtToyViewportSpace({
    ...ART_TOY_AUTHORED_SPACES.fireworks,
    displayRect: { left: 10, top: 20, width: 440, height: 220 },
  });
  const anchor = { x: -100, y: 500 };
  assertPoint(viewport.clientToLogical(viewport.logicalToDisplay(anchor)), anchor);
  assert.equal(viewport.logicalLengthToDisplay(62), 62);
  assert.equal(viewport.contentRect.left, 120);
  assert.equal(viewport.contentRect.top, 20);
});

test('Fireworks authored anchor persistence is a raw logical round trip', () => {
  const anchors = [
    { x: -142, y: 74 },
    { x: 110, y: 110 },
    { x: 1458, y: 1674 },
  ];
  const restored = JSON.parse(JSON.stringify({ anchors })).anchors;
  assert.deepEqual(restored, anchors);
  restored.forEach((anchor) => {
    assert.equal(
      createArtToyViewportSpace({
        ...ART_TOY_AUTHORED_SPACES.fireworks,
        displayRect: { left: 0, top: 0, width: 220, height: 220 },
      }).classifyLogicalPoint(anchor).insideExtendedWorkspace,
      true,
    );
  });
});

test('resizing changes only Fireworks projection, not logical anchors', () => {
  const anchor = Object.freeze({ x: 640, y: 720 });
  const small = createArtToyViewportSpace({
    ...ART_TOY_AUTHORED_SPACES.fireworks,
    displayRect: { left: 0, top: 0, width: 110, height: 110 },
  });
  const large = createArtToyViewportSpace({
    ...ART_TOY_AUTHORED_SPACES.fireworks,
    displayRect: { left: 0, top: 0, width: 330, height: 330 },
  });
  assert.notDeepEqual(small.logicalToDisplay(anchor), large.logicalToDisplay(anchor));
  assertPoint(small.clientToLogical(small.logicalToDisplay(anchor)), anchor);
  assertPoint(large.clientToLogical(large.logicalToDisplay(anchor)), anchor);
  assert.deepEqual(anchor, { x: 640, y: 720 });
});

test('Light Paths uses the shared logical mapper and uniformly projected SVG root', () => {
  const laserSource = factorySource.slice(
    factorySource.indexOf('function setupLaserTrails(panel)'),
    factorySource.indexOf('function setupSticker(panel)'),
  );
  assert.match(laserSource, /clientToLogical: clientToLaserLogical/);
  assert.match(laserSource, /classifyLaserClientPoint/);
  assert.match(laserSource, /insideExtendedWorkspace/);
  assert.match(laserSource, /preserveAspectRatio', 'xMidYMid meet'/);
  assert.match(laserSource, /viewportRoot\.appendChild\(layer\)/);
  assert.doesNotMatch(laserSource, /PANEL_PX/);
  assert.doesNotMatch(laserSource, /rect\.width \/ PANEL_PX/);
});

test('Light Paths emitter, target, and path placement are display-size invariant', () => {
  const source = { x: -40, y: 120 };
  const target = { x: 410, y: 680 };
  const pathPoint = { x: 1250, y: 1480 };
  for (const displayRect of [
    { left: 12, top: 18, width: 110, height: 110 },
    { left: 12, top: 18, width: 176, height: 176 },
    { left: 12, top: 18, width: 220, height: 220 },
    { left: 12, top: 18, width: 330, height: 330 },
    { left: 12, top: 18, width: 440, height: 220 },
  ]) {
    const viewport = createArtToyViewportSpace({
      ...ART_TOY_AUTHORED_SPACES.laserTrails,
      displayRect,
    });
    for (const point of [source, target, pathPoint]) {
      assertPoint(viewport.clientToLogical(viewport.logicalToDisplay(point)), point);
    }
  }
});

test('Light Paths rotation vectors are invariant across zoom and non-square containment', () => {
  const source = { x: 80, y: 140 };
  const pointer = { x: 260, y: 410 };
  const expectedAngle = Math.atan2(pointer.y - source.y, pointer.x - source.x);
  for (const displayRect of [
    { left: 0, top: 0, width: 110, height: 110 },
    { left: 50, top: 20, width: 330, height: 330 },
    { left: 50, top: 20, width: 440, height: 220 },
    { left: 50, top: 20, width: 220, height: 440 },
  ]) {
    const viewport = createArtToyViewportSpace({
      ...ART_TOY_AUTHORED_SPACES.laserTrails,
      displayRect,
    });
    const mappedSource = viewport.clientToLogical(viewport.logicalToDisplay(source));
    const mappedPointer = viewport.clientToLogical(viewport.logicalToDisplay(pointer));
    assert.ok(Math.abs(
      Math.atan2(mappedPointer.y - mappedSource.y, mappedPointer.x - mappedSource.x)
        - expectedAngle,
    ) <= 1e-9);
  }
});

test('Light Paths extended workspace and persistence preserve authored coordinates', () => {
  const state = {
    emitters: [{ x: -94, y: 74 }],
    targets: [{ x: 1506, y: 1674 }],
    paths: [[{ x: -94, y: 74 }, { x: 700, y: 900 }, { x: 1506, y: 1674 }]],
  };
  const restored = JSON.parse(JSON.stringify(state));
  assert.deepEqual(restored, state);
  const viewport = createArtToyViewportSpace({
    ...ART_TOY_AUTHORED_SPACES.laserTrails,
    displayRect: { left: 30, top: 40, width: 300, height: 150 },
  });
  for (const point of [...restored.emitters, ...restored.targets, ...restored.paths.flat()]) {
    assert.equal(viewport.classifyLogicalPoint(point).insideExtendedWorkspace, true);
    assertPoint(viewport.clientToLogical(viewport.logicalToDisplay(point)), point);
  }
  assert.equal(viewport.classifyLogicalPoint({ x: 1506.01, y: 1674 }).insideExtendedWorkspace, false);
});

test('resizing changes only Light Paths display projection', () => {
  const logicalState = Object.freeze({
    emitter: Object.freeze({ x: 40, y: 100 }),
    target: Object.freeze({ x: 900, y: 1200 }),
  });
  const displays = [
    { left: 0, top: 0, width: 110, height: 110 },
    { left: 0, top: 0, width: 330, height: 330 },
  ].map((displayRect) => createArtToyViewportSpace({
    ...ART_TOY_AUTHORED_SPACES.laserTrails,
    displayRect,
  }));
  assert.notDeepEqual(
    displays[0].logicalToDisplay(logicalState.target),
    displays[1].logicalToDisplay(logicalState.target),
  );
  displays.forEach((viewport) => {
    assertPoint(viewport.clientToLogical(viewport.logicalToDisplay(logicalState.emitter)), logicalState.emitter);
    assertPoint(viewport.clientToLogical(viewport.logicalToDisplay(logicalState.target)), logicalState.target);
  });
  assert.deepEqual(logicalState, { emitter: { x: 40, y: 100 }, target: { x: 900, y: 1200 } });
});

test('Sticker uses shared logical input and uniformly projected SVG and DOM layers', () => {
  const stickerSource = factorySource.slice(
    factorySource.indexOf('function setupSticker(panel)'),
    factorySource.indexOf('function setupVisualForType(panel, type)'),
  );
  assert.match(stickerSource, /clientToStickerLogical/);
  assert.match(stickerSource, /classifyStickerClientPoint/);
  assert.match(stickerSource, /viewportRoot\.appendChild\(layer\)/);
  assert.match(stickerSource, /viewportRoot\.appendChild\(hitLayer\)/);
  assert.match(stickerSource, /viewportRoot\.appendChild\(burstLayer\)/);
  assert.match(stickerSource, /preserveAspectRatio', 'xMidYMid meet'/);
  assert.doesNotMatch(stickerSource, /PANEL_PX/);
  assert.doesNotMatch(stickerSource, /getDrawAreaRect/);
});

test('Sticker drawing points and authored spacing are invariant across displays and DPR', () => {
  const logicalStroke = [
    { x: -40, y: 100 },
    { x: 12, y: 145 },
    { x: 300, y: 460 },
    { x: 1400, y: 1600 },
  ];
  const logicalDistances = logicalStroke.slice(1).map((point, index) => Math.hypot(
    point.x - logicalStroke[index].x,
    point.y - logicalStroke[index].y,
  ));
  for (const displayRect of [
    { left: 10, top: 20, width: 110, height: 110 },
    { left: 10, top: 20, width: 176, height: 176 },
    { left: 10, top: 20, width: 330, height: 330 },
    { left: 10, top: 20, width: 440, height: 220 },
    { left: 10, top: 20, width: 220, height: 440 },
  ]) {
    for (const backingScale of [1, 2, 3]) {
      const viewport = createArtToyViewportSpace({
        ...ART_TOY_AUTHORED_SPACES.sticker,
        displayRect,
        backingScale,
      });
      const restored = logicalStroke.map((point) => (
        viewport.clientToLogical(viewport.logicalToDisplay(point))
      ));
      restored.forEach((point, index) => assertPoint(point, logicalStroke[index]));
      const distances = restored.slice(1).map((point, index) => Math.hypot(
        point.x - restored[index].x,
        point.y - restored[index].y,
      ));
      distances.forEach((distance, index) => assert.ok(Math.abs(distance - logicalDistances[index]) <= 1e-9));
    }
  }
});

test('Sticker shape drag and rotation vectors are independent of zoom and aspect ratio', () => {
  const shape = { x: 240, y: 330, rot: 0.72 };
  const dragTo = { x: 720, y: 810 };
  const rotatePointer = { x: 800, y: 910 };
  const expectedAngle = Math.atan2(rotatePointer.y - dragTo.y, rotatePointer.x - dragTo.x);
  for (const displayRect of [
    { left: 0, top: 0, width: 110, height: 110 },
    { left: 80, top: 35, width: 330, height: 330 },
    { left: 80, top: 35, width: 440, height: 220 },
  ]) {
    const viewport = createArtToyViewportSpace({
      ...ART_TOY_AUTHORED_SPACES.sticker,
      displayRect,
    });
    const mappedDrag = viewport.clientToLogical(viewport.logicalToDisplay(dragTo));
    const mappedRotate = viewport.clientToLogical(viewport.logicalToDisplay(rotatePointer));
    assertPoint(mappedDrag, dragTo);
    assert.ok(Math.abs(Math.atan2(
      mappedRotate.y - mappedDrag.y,
      mappedRotate.x - mappedDrag.x,
    ) - expectedAngle) <= 1e-9);
    assert.equal(shape.rot, 0.72);
  }
});

test('Sticker workspace and drop admission use shared logical coordinates', () => {
  const viewport = createArtToyViewportSpace({
    ...ART_TOY_AUTHORED_SPACES.sticker,
    displayRect: { left: 50, top: 70, width: 440, height: 220 },
  });
  const inside = { x: 900, y: 1200 };
  const outside = { x: 1506.01, y: 1200 };
  const mappedInside = viewport.classifyClientPoint(viewport.logicalToDisplay(inside));
  const mappedOutside = viewport.classifyClientPoint(viewport.logicalToDisplay(outside));
  assert.equal(mappedInside.insideExtendedWorkspace, true);
  assert.equal(mappedOutside.insideExtendedWorkspace, false);
  assertPoint(mappedInside.logicalPoint, inside);
});

test('Sticker persistence round trips one authoritative logical state', () => {
  const state = {
    version: 1,
    strokesBySlot: [[[{ x: -94, y: 74 }, { x: 800, y: 900 }]]],
    shapesBySlot: [[{ kind: 'star', x: 500, y: 600, size: 52, rot: 1.25 }]],
    burstsBySlot: [[{ type: 'classic', x: 1000, y: 1200, size: 32 }]],
    specialsBySlot: [[{
      kind: 'stickman',
      neck: { x: 300, y: 400 },
      pelvis: { x: 320, y: 500 },
      headCenter: { x: 290, y: 350 },
    }]],
  };
  const restored = JSON.parse(JSON.stringify(state));
  assert.deepEqual(restored, state);
  const viewport = createArtToyViewportSpace({
    ...ART_TOY_AUTHORED_SPACES.sticker,
    displayRect: { left: 0, top: 0, width: 110, height: 110 },
  });
  const points = [
    ...restored.strokesBySlot.flat(2),
    ...restored.shapesBySlot.flat().map(({ x, y }) => ({ x, y })),
    ...restored.burstsBySlot.flat().map(({ x, y }) => ({ x, y })),
    restored.specialsBySlot[0][0].neck,
    restored.specialsBySlot[0][0].pelvis,
    restored.specialsBySlot[0][0].headCenter,
  ];
  points.forEach((point) => assertPoint(
    viewport.clientToLogical(viewport.logicalToDisplay(point)),
    point,
  ));
});

test('resizing changes Sticker projection without mutating logical state', () => {
  const state = Object.freeze({
    strokePoint: Object.freeze({ x: 180, y: 260 }),
    shape: Object.freeze({ x: 600, y: 720, rot: 0.4 }),
    burst: Object.freeze({ x: 900, y: 1000 }),
  });
  const small = createArtToyViewportSpace({
    ...ART_TOY_AUTHORED_SPACES.sticker,
    displayRect: { left: 0, top: 0, width: 110, height: 110 },
  });
  const large = createArtToyViewportSpace({
    ...ART_TOY_AUTHORED_SPACES.sticker,
    displayRect: { left: 0, top: 0, width: 330, height: 330 },
  });
  assert.notDeepEqual(small.logicalToDisplay(state.shape), large.logicalToDisplay(state.shape));
  for (const viewport of [small, large]) {
    assertPoint(viewport.clientToLogical(viewport.logicalToDisplay(state.strokePoint)), state.strokePoint);
    assertPoint(viewport.clientToLogical(viewport.logicalToDisplay(state.shape)), state.shape);
    assertPoint(viewport.clientToLogical(viewport.logicalToDisplay(state.burst)), state.burst);
  }
  assert.deepEqual(state, {
    strokePoint: { x: 180, y: 260 },
    shape: { x: 600, y: 720, rot: 0.4 },
    burst: { x: 900, y: 1000 },
  });
});
