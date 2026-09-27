import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveBeatSwarmPauseState } from '../src/beat-swarm/beat-swarm-pause-state.js';
import { onKeyDownRuntimeWrapper } from '../src/beat-swarm/beat-swarm-input-events-wrapper.js';

test('normal and silent pause share one authoritative paused state', () => {
  const running = resolveBeatSwarmPauseState(null, { paused: false });
  const normal = resolveBeatSwarmPauseState(running, { paused: true, pauseUiVisible: true, pauseSource: 'transport' });
  const silent = resolveBeatSwarmPauseState(running, { paused: true, pauseUiVisible: false, pauseSource: 'silent-debug' });

  assert.deepEqual(normal, { paused: true, pauseUiVisible: true, pauseSource: 'transport' });
  assert.deepEqual(silent, { paused: true, pauseUiVisible: false, pauseSource: 'silent-debug' });
});

test('silent resume clears pause state and source', () => {
  const silent = resolveBeatSwarmPauseState(null, { paused: true, pauseUiVisible: false, pauseSource: 'silent-debug' });
  const resumed = resolveBeatSwarmPauseState(silent, { paused: false, pauseUiVisible: false });
  assert.deepEqual(resumed, { paused: false, pauseUiVisible: false, pauseSource: 'none' });
});

test('making a silent pause visible does not resume gameplay', () => {
  const silent = resolveBeatSwarmPauseState(null, { paused: true, pauseUiVisible: false, pauseSource: 'silent-debug' });
  const visible = resolveBeatSwarmPauseState(silent, { paused: true, pauseUiVisible: true, pauseSource: 'transport' });
  assert.deepEqual(visible, { paused: true, pauseUiVisible: true, pauseSource: 'transport' });
});

test('P toggles silent pause while active, including while paused', () => {
  let toggles = 0;
  let prevented = 0;
  const handled = onKeyDownRuntimeWrapper({
    ev: { code: 'KeyP', target: {}, preventDefault() { prevented += 1; }, stopPropagation() {} },
    state: { active: true, gameplayPaused: true },
    helpers: { toggleSilentPause() { toggles += 1; return true; } },
  });
  assert.equal(handled, true);
  assert.equal(toggles, 1);
  assert.equal(prevented, 1);
});

test('P is not intercepted for editable controls', () => {
  for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT']) {
    let toggles = 0;
    const handled = onKeyDownRuntimeWrapper({
      ev: { code: 'KeyP', target: { tagName } },
      state: { active: true, gameplayPaused: false },
      helpers: { toggleSilentPause() { toggles += 1; return true; } },
    });
    assert.equal(handled, false);
    assert.equal(toggles, 0);
  }
  let toggles = 0;
  const handled = onKeyDownRuntimeWrapper({
    ev: { code: 'KeyP', target: { isContentEditable: true } },
    state: { active: true, gameplayPaused: false },
    helpers: { toggleSilentPause() { toggles += 1; return true; } },
  });
  assert.equal(handled, false);
  assert.equal(toggles, 0);
});

test('viewport resize data cannot mutate an immutable silent pause snapshot', () => {
  const silent = resolveBeatSwarmPauseState(null, { paused: true, pauseUiVisible: false, pauseSource: 'silent-debug' });
  const before = { ...silent };
  const resizedViewport = { logicalWidth: 1600, logicalHeight: 900, displayWidth: 1024, displayHeight: 768 };
  void resizedViewport;
  assert.deepEqual(silent, before);
  assert.equal(Object.isFrozen(silent), true);
});
