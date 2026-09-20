import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isBeatSwarmLeadHarmonyDisabled,
} from '../src/beat-swarm/beat-swarm-readability-debug.js';

test('readability A/B switches default to normal playback', () => {
  assert.equal(isBeatSwarmLeadHarmonyDisabled({}), false);
  assert.equal(isBeatSwarmLeadHarmonyDisabled({ __beatSwarmDebug: {} }), false);
});

test('readability A/B switches require an explicit true value', () => {
  const fakeGlobal = {
    __beatSwarmDebug: {
      disableLeadHarmony: true,
    },
  };
  assert.equal(isBeatSwarmLeadHarmonyDisabled(fakeGlobal), true);
});
