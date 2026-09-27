import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const mode = readFileSync(new URL('../src/beat-swarm/beat-swarm-mode.js', import.meta.url), 'utf8');

test('player screen anchor comes from the fixed logical centre, not ship DOM geometry', () => {
  const getClientAnchor = mode.match(/function getViewportCenterClient\(\)[\s\S]*?\n}/)?.[0] || '';
  assert.match(getClientAnchor, /logicalToScreen\?\.\(BEAT_SWARM_LOGICAL_CENTER\)/);
  assert.doesNotMatch(getClientAnchor, /getBoundingClientRect|shipWrap/);
});

test('resize refreshes viewport measurement before reprojecting the preserved world anchor', () => {
  const resizeHandler = mode.match(/function onBeatSwarmWindowResize\(\)[\s\S]*?\n}/)?.[0] || '';
  assert.match(resizeHandler, /beatSwarmResizeAnchorLocked = true/);
  assert.match(resizeHandler, /beatSwarmViewportSpaceController\?\.update\?\.\(\);[\s\S]*?snapCameraToWorld\(anchor/);
  assert.match(resizeHandler, /beatSwarmPlayerWorldPosition = \{ x: anchor\.x, y: anchor\.y \}/);
  assert.doesNotMatch(resizeHandler, /velocityX\s*=|velocityY\s*=/);
});
