import assert from 'node:assert/strict';
import test from 'node:test';

import {
  queueWeaponChainRuntime,
  spawnProjectileFromDirectionRuntime,
} from '../src/beat-swarm/beat-swarm-weapon-chain-core.js';

function createQueueHarness() {
  const pendingWeaponChainEvents = [];
  const scheduled = [];
  const helpers = {
    getNextWeaponChainEventId: () => 7,
    normalizeSwarmNoteName: (note) => String(note || '').trim() || null,
    sanitizeWeaponStages: (stages) => Array.isArray(stages) ? stages : [],
    schedulePendingWeaponChainSound: (request) => {
      scheduled.push(request);
      return {
        eventKey: 'projectile',
        noteName: request.context.forcedNoteName,
        targetAudioTime: 12.5,
      };
    },
  };
  return { pendingWeaponChainEvents, scheduled, helpers };
}

test('queues direct chain audio ahead of its gameplay action', () => {
  const harness = createQueueHarness();
  queueWeaponChainRuntime({
    beatIndex: 9,
    nextStages: [{ archetype: 'projectile', variant: 'standard' }],
    context: {
      directSound: true,
      stageIndex: 1,
      forcedNoteName: 'G4',
      debugSource: 'player-weapon',
      debugStepIndex: 18,
      debugBeatIndex: 8,
      debugNoteIndex: 2,
    },
    state: { pendingWeaponChainEvents: harness.pendingWeaponChainEvents },
    constants: {},
    helpers: harness.helpers,
  });

  assert.equal(harness.scheduled.length, 1);
  assert.equal(harness.scheduled[0].beatIndex, 9);
  assert.equal(harness.pendingWeaponChainEvents.length, 1);
  assert.deepEqual(harness.pendingWeaponChainEvents[0].context.preScheduledSound, {
    eventKey: 'projectile',
    noteName: 'G4',
    targetAudioTime: 12.5,
  });
  assert.equal(harness.pendingWeaponChainEvents[0].context.debugStepIndex, 18);
  assert.equal(harness.pendingWeaponChainEvents[0].context.debugBeatIndex, 8);
  assert.equal(harness.pendingWeaponChainEvents[0].context.debugNoteIndex, 2);
});

test('does not pre-schedule non-direct chain audio', () => {
  const harness = createQueueHarness();
  queueWeaponChainRuntime({
    beatIndex: 4,
    nextStages: [{ archetype: 'projectile', variant: 'standard' }],
    context: { directSound: false, forcedNoteName: 'C4' },
    state: { pendingWeaponChainEvents: harness.pendingWeaponChainEvents },
    constants: {},
    helpers: harness.helpers,
  });

  assert.equal(harness.scheduled.length, 0);
  assert.equal(harness.pendingWeaponChainEvents.length, 1);
  assert.equal(harness.pendingWeaponChainEvents[0].context.preScheduledSound, null);
});

test('projectile travel preserves direct chain timing context', () => {
  const previousDocument = globalThis.document;
  globalThis.document = {
    createElement: () => ({ className: '' }),
  };
  try {
    const projectiles = [];
    const chainContext = {
      weaponSlotIndex: 0,
      stageIndex: 1,
      damageScale: 1,
      forcedNoteName: 'A#4',
      directSound: true,
      debugStepIndex: 22,
    };
    spawnProjectileFromDirectionRuntime({
      fromW: { x: 10, y: 20 },
      dirX: 1,
      dirY: 0,
      damage: 2,
      nextStages: [{ archetype: 'aoe', variant: 'explosion' }],
      nextBeatIndex: 6,
      chainContext,
      state: {
        enemyLayerEl: { appendChild() {} },
        projectiles,
        currentBeatIndex: 5,
      },
      constants: {},
      helpers: {
        normalizeDir: () => ({ x: 1, y: 0 }),
        sanitizeWeaponStages: (stages) => stages,
      },
    });

    assert.equal(projectiles.length, 1);
    assert.notEqual(projectiles[0].chainContext, chainContext);
    assert.equal(projectiles[0].chainContext.directSound, true);
    assert.equal(projectiles[0].chainContext.forcedNoteName, 'A#4');
    assert.equal(projectiles[0].chainContext.debugStepIndex, 22);
  } finally {
    globalThis.document = previousDocument;
  }
});
