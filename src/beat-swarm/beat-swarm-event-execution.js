export function executePerformedBeatEventRuntime(options = null) {
  const ev = options?.event && typeof options.event === 'object' ? options.event : null;
  if (!ev) return false;
  const actionType = String(ev.actionType || '').trim().toLowerCase();
  if (!actionType) return false;

  const constants = options?.constants && typeof options.constants === 'object' ? options.constants : {};
  const helpers = options?.helpers && typeof options.helpers === 'object' ? options.helpers : {};
  const state = options?.state && typeof options.state === 'object' ? options.state : {};

  const beatIndex = Math.max(0, Math.trunc(Number(ev.beatIndex) || 0));
  const stepIndex = Math.max(0, Math.trunc(Number(ev.stepIndex) || 0));
  const barIndex = Math.floor(beatIndex / Math.max(1, Math.trunc(Number(constants.composerBeatsPerBar) || 4)));
  const payloadGroupId = Math.max(0, Math.trunc(Number(ev?.payload?.groupId) || 0));
  const logMusicLabExecution = (context = null) => {
    const base = context && typeof context === 'object' ? context : {};
    try {
      state.swarmMusicLab?.logExecutedEvent?.(ev, helpers.getMusicLabContext?.({
        beatIndex,
        stepIndex,
        barIndex,
        groupId: payloadGroupId,
        ...base,
      }));
    } catch {}
  };

  if (actionType === 'spawner-spawn') {
    const enemy = helpers.getSwarmEnemyById?.(ev.actorId);
    if (!enemy || String(enemy?.enemyType || '') !== 'spawner') return false;
    const group = helpers.getEnemyMusicGroup?.(enemy, 'spawner-spawn');
    if (!group) return false;
    const aggressionScale = helpers.getEnemyAggressionScale?.(enemy, group?.lifecycleState || 'active');
    const instrumentId = helpers.resolveSwarmRoleInstrumentId?.(
      ev.role || group.role || helpers.getSwarmRoleForEnemy?.(enemy, constants.roles?.bass),
      helpers.resolveSwarmSoundInstrumentId?.('projectile') || 'tone'
    );
    group.instrumentId = instrumentId;
    group.role = helpers.normalizeSwarmRole?.(ev.role || group.role, constants.roles?.bass);
    const duckForPlayer = ev?.payload?.duckForPlayer === true;
    const audioGain = helpers.clamp01?.(Number(ev?.payload?.audioGain == null ? 1 : ev.payload.audioGain));
    const enemyAudible = duckForPlayer ? helpers.shouldKeepEnemyAudibleDuringPlayerDuck?.(ev, 'spawner') : true;
    const triggerVolume = (Number(constants.spawnerTriggerSoundVolume) || 0)
      * (duckForPlayer ? (Number(constants.playerMaskDuckEnemyVolumeMult) || 1) : 1)
      * (Number(audioGain) || 0)
      * (0.7 + ((Number(aggressionScale) || 0) * 0.3));
    const requestedNote = String(ev?.payload?.requestedNoteRaw || ev.note || '').trim();
    const noteName = helpers.clampNoteToDirectorPool?.(requestedNote || ev.note, beatIndex + ev.stepIndex + ev.actorId);
    group.note = noteName;
    helpers.syncSingletonEnemyStateFromMusicGroup?.(enemy, group);
    if (enemyAudible) {
      try { helpers.triggerInstrument?.(instrumentId, noteName, undefined, 'master', {}, triggerVolume); } catch {}
    }
    const nodeStepIndex = ((Math.trunc(Number(ev?.payload?.nodeStepIndex) || ev.stepIndex || 0) % 8) + 8) % 8;
    helpers.flashSpawnerEnemyCell?.(enemy, nodeStepIndex, 'strong');
    if (!Array.isArray(enemy.spawnerNodeEnemyIds)) enemy.spawnerNodeEnemyIds = Array.from({ length: 8 }, () => 0);
    const linkedEnemyId = Math.trunc(Number(enemy.spawnerNodeEnemyIds[nodeStepIndex]) || 0);
    let linkedEnemy = linkedEnemyId > 0 ? helpers.getSwarmEnemyById?.(linkedEnemyId) : null;
    if (!linkedEnemy || String(linkedEnemy?.enemyType || '') !== 'dumb') {
      linkedEnemy = null;
      enemy.spawnerNodeEnemyIds[nodeStepIndex] = 0;
    }
    if (!linkedEnemy) {
      const spawnWorld = helpers.getSpawnerNodeCellWorld?.(enemy, nodeStepIndex) || { x: Number(enemy.wx) || 0, y: Number(enemy.wy) || 0 };
      const spawnScreen = helpers.worldToScreen?.(spawnWorld);
      if (!spawnScreen || !Number.isFinite(spawnScreen.x) || !Number.isFinite(spawnScreen.y)) return false;
      const hp = Math.max(1, Number(state.currentEnemySpawnMaxHp) || 1);
      const beforeCount = Array.isArray(state.enemies) ? state.enemies.length : 0;
      helpers.spawnEnemyAt?.(spawnScreen.x, spawnScreen.y, {
        linkedSpawnerId: Math.trunc(Number(enemy.id) || 0),
        linkedSpawnerStepIndex: nodeStepIndex,
        hp,
      });
      if ((Array.isArray(state.enemies) ? state.enemies.length : 0) > beforeCount) {
        const created = state.enemies[state.enemies.length - 1];
        if (created && Number.isFinite(created.id)) {
          enemy.spawnerNodeEnemyIds[nodeStepIndex] = Math.trunc(created.id);
          helpers.updateSpawnerLinkedEnemyLine?.(created);
        }
      }
      logMusicLabExecution({
        sourceSystem: 'spawner',
        requestedNote,
        resolvedNote: noteName,
        noteWasClamped: requestedNote ? requestedNote !== noteName : false,
        enemyAudible,
      });
      return true;
    }
    const origin = { x: Number(linkedEnemy.wx) || 0, y: Number(linkedEnemy.wy) || 0 };
    const toPlayer = helpers.getViewportCenterWorld?.();
    const dir = Math.atan2((Number(toPlayer?.y) || 0) - origin.y, (Number(toPlayer?.x) || 0) - origin.x);
    const fullThreat = helpers.tryConsumeSwarmThreatIntent?.('full', 1, beatIndex, 'spawner-linked-attack');
    if (!fullThreat?.withinBudget || aggressionScale <= 0.5) {
      helpers.flashSpawnerEnemyCell?.(enemy, nodeStepIndex, 'alternate');
      if (aggressionScale <= 0.5) {
        helpers.triggerCosmeticSyncAt?.(origin, beatIndex, 'spawner-retiring-cosmetic', linkedEnemy.el);
      } else {
        helpers.triggerLowThreatBurstAt?.(origin, beatIndex, 'spawner-linked-fallback');
      }
      helpers.pulseHitFlash?.(linkedEnemy.el);
      logMusicLabExecution({
        sourceSystem: 'spawner',
        requestedNote,
        resolvedNote: noteName,
        noteWasClamped: requestedNote ? requestedNote !== noteName : false,
        enemyAudible,
      });
      return true;
    }
    helpers.spawnHostileRedProjectileAt?.(origin, {
      angle: dir + helpers.randRange?.(-0.24, 0.24),
      speed: (Number(constants.spawnerLinkedAttackSpeed) || 0) * Math.max(0.4, Math.min(1, aggressionScale)),
      noteName,
      instrument: instrumentId,
      damage: Math.max(0.2, aggressionScale),
    });
    helpers.pulseHitFlash?.(linkedEnemy.el);
    logMusicLabExecution({
      sourceSystem: 'spawner',
      requestedNote,
      resolvedNote: noteName,
      noteWasClamped: requestedNote ? requestedNote !== noteName : false,
      enemyAudible,
    });
    return true;
  }

  if (actionType === 'drawsnake-projectile') {
    const enemy = helpers.getSwarmEnemyById?.(ev.actorId);
    if (!enemy || String(enemy?.enemyType || '') !== 'drawsnake') return false;
    const group = helpers.getEnemyMusicGroup?.(enemy, 'drawsnake-projectile');
    if (!group) return false;
    const aggressionScale = helpers.getEnemyAggressionScale?.(enemy, group?.lifecycleState || 'active');
    const instrumentId = helpers.resolveSwarmRoleInstrumentId?.(
      ev.role || group.role || helpers.getSwarmRoleForEnemy?.(enemy, constants.roles?.lead),
      helpers.resolveSwarmSoundInstrumentId?.('projectile') || 'tone'
    );
    group.instrumentId = instrumentId;
    group.instrument = instrumentId;
    group.role = helpers.normalizeSwarmRole?.(ev.role || group.role, constants.roles?.lead);
    const duckForPlayer = ev?.payload?.duckForPlayer === true;
    const audioGain = helpers.clamp01?.(Number(ev?.payload?.audioGain == null ? 1 : ev.payload.audioGain));
    const enemyAudible = duckForPlayer ? false : true;
    const triggerVolume = (Number(constants.drawSnakeTriggerSoundVolume) || 0)
      * (duckForPlayer ? (Number(constants.playerMaskDuckEnemyVolumeMult) || 1) : 1)
      * (Number(audioGain) || 0)
      * (0.72 + ((Number(aggressionScale) || 0) * 0.28));
    const requestedNote = String(ev?.payload?.requestedNoteRaw || ev.note || '').trim();
    const noteName = helpers.clampNoteToDirectorPool?.(requestedNote || ev.note, beatIndex + ev.stepIndex + ev.actorId);
    group.note = noteName;
    helpers.syncSingletonEnemyStateFromMusicGroup?.(enemy, group);
    if (enemyAudible) {
      try { helpers.triggerInstrument?.(instrumentId, noteName, undefined, 'master', {}, triggerVolume); } catch {}
    }
    const nodeIndex = Math.trunc(Number(ev?.payload?.nodeIndex) || 0);
    const fullThreat = helpers.tryConsumeSwarmThreatIntent?.('full', 1, beatIndex, 'drawsnake-projectile');
    if (!fullThreat?.withinBudget || aggressionScale <= 0.5) {
      const nodes = Array.isArray(enemy?.drawsnakeNodeWorld) ? enemy.drawsnakeNodeWorld : [];
      const idx = Math.max(0, Math.min(nodes.length - 1, nodeIndex));
      const origin = nodes[idx] || { x: Number(enemy?.wx) || 0, y: Number(enemy?.wy) || 0 };
      helpers.flashDrawSnakeNode?.(enemy, idx);
      if (aggressionScale <= 0.5) {
        helpers.triggerCosmeticSyncAt?.(origin, beatIndex, 'drawsnake-retiring-cosmetic', enemy.el);
      } else {
        helpers.triggerLowThreatBurstAt?.(origin, beatIndex, 'drawsnake-fallback-burst');
      }
      helpers.pulseHitFlash?.(enemy.el);
      logMusicLabExecution({
        sourceSystem: 'drawsnake',
        requestedNote,
        resolvedNote: noteName,
        noteWasClamped: requestedNote ? requestedNote !== noteName : false,
        enemyAudible,
      });
      return true;
    }
    helpers.fireDrawSnakeProjectile?.(enemy, nodeIndex, noteName, aggressionScale);
    logMusicLabExecution({
      sourceSystem: 'drawsnake',
      requestedNote,
      resolvedNote: noteName,
      noteWasClamped: requestedNote ? requestedNote !== noteName : false,
      enemyAudible,
    });
    return true;
  }

  if (actionType === 'composer-group-projectile' || actionType === 'composer-group-explosion') {
    const enemy = helpers.getSwarmEnemyById?.(ev.actorId);
    if (!enemy || String(enemy?.enemyType || '') !== 'composer-group-member') return false;
    const group = helpers.getEnemyMusicGroup?.(enemy, actionType);
    if (!group) return false;
    const aggressionScale = helpers.getEnemyAggressionScale?.(enemy, group?.lifecycleState || 'active');
    const requestedNote = String(ev?.payload?.requestedNoteRaw || ev.note || '').trim();
    const noteName = helpers.clampNoteToDirectorPool?.(requestedNote || ev.note, beatIndex + ev.stepIndex + ev.actorId);
    const instrumentId = helpers.resolveSwarmRoleInstrumentId?.(
      ev.role || group.role || helpers.getSwarmRoleForEnemy?.(enemy, constants.roles?.lead),
      helpers.resolveSwarmSoundInstrumentId?.('projectile') || 'tone'
    );
    group.instrumentId = instrumentId;
    group.role = helpers.normalizeSwarmRole?.(ev.role || group.role, constants.roles?.lead);
    const duckForPlayer = ev?.payload?.duckForPlayer === true;
    const audioGain = helpers.clamp01?.(Number(ev?.payload?.audioGain == null ? 1 : ev.payload.audioGain));
    const enemyAudible = duckForPlayer ? false : true;
    const triggerVolume = 0.42
      * (duckForPlayer ? (Number(constants.playerMaskDuckEnemyVolumeMult) || 1) : 1)
      * (Number(audioGain) || 0)
      * (0.72 + ((Number(aggressionScale) || 0) * 0.28));
    if (enemyAudible) {
      try { helpers.triggerInstrument?.(instrumentId, noteName, undefined, 'master', {}, triggerVolume); } catch {}
    }
    helpers.pulseHitFlash?.(enemy.el);
    enemy.composerActionPulseDur = Number(constants.composerGroupActionPulseSeconds) || 0;
    enemy.composerActionPulseT = Number(constants.composerGroupActionPulseSeconds) || 0;
    const origin = { x: Number(enemy.wx) || 0, y: Number(enemy.wy) || 0 };
    const requestedThreatClass = String(ev?.threatClass || constants.threat?.full || 'full').trim().toLowerCase();
    if (requestedThreatClass === constants.threat?.cosmetic) {
      helpers.triggerCosmeticSyncAt?.(origin, beatIndex, 'composer-cosmetic', enemy.el);
      logMusicLabExecution({
        sourceSystem: 'group',
        requestedNote,
        resolvedNote: noteName,
        noteWasClamped: requestedNote ? requestedNote !== noteName : false,
        enemyAudible,
      });
      return true;
    }
    if (requestedThreatClass === constants.threat?.light) {
      helpers.triggerLowThreatBurstAt?.(origin, beatIndex, 'composer-light-burst');
      logMusicLabExecution({
        sourceSystem: 'group',
        requestedNote,
        resolvedNote: noteName,
        noteWasClamped: requestedNote ? requestedNote !== noteName : false,
        enemyAudible,
      });
      return true;
    }
    const fullThreat = helpers.tryConsumeSwarmThreatIntent?.(
      'full',
      1,
      beatIndex,
      actionType === 'composer-group-explosion' ? 'composer-group-explosion' : 'composer-group-projectile'
    );
    if (!fullThreat?.withinBudget || aggressionScale <= 0.5) {
      if (aggressionScale <= 0.5) {
        helpers.triggerCosmeticSyncAt?.(origin, beatIndex, 'composer-retiring-cosmetic', enemy.el);
      } else {
        helpers.triggerLowThreatBurstAt?.(origin, beatIndex, 'composer-fallback-burst');
      }
      helpers.pulseHitFlash?.(enemy.el);
      logMusicLabExecution({
        sourceSystem: 'group',
        requestedNote,
        resolvedNote: noteName,
        noteWasClamped: requestedNote ? requestedNote !== noteName : false,
        enemyAudible,
      });
      return true;
    }
    if (actionType === 'composer-group-explosion') {
      helpers.addHostileRedExplosionEffect?.(origin);
    } else {
      const toPlayer = helpers.getViewportCenterWorld?.();
      const dir = Math.atan2((Number(toPlayer?.y) || 0) - origin.y, (Number(toPlayer?.x) || 0) - origin.x);
      helpers.spawnHostileRedProjectileAt?.(origin, {
        angle: dir + helpers.randRange?.(-0.28, 0.28),
        speed: (Number(constants.composerGroupProjectileSpeed) || 0) * Math.max(0.45, Math.min(1, aggressionScale)),
        noteName,
        instrument: instrumentId,
        damage: Math.max(0.2, aggressionScale),
      });
    }
    logMusicLabExecution({
      sourceSystem: 'group',
      requestedNote,
      resolvedNote: noteName,
      noteWasClamped: requestedNote ? requestedNote !== noteName : false,
      enemyAudible,
    });
    return true;
  }

  if (actionType === 'enemy-death-accent') {
    const accentThreat = helpers.tryConsumeSwarmThreatIntent?.('accent', 1, beatIndex, 'enemy-death-pop');
    if (!accentThreat?.withinBudget) {
      logMusicLabExecution({ sourceSystem: 'death' });
      return true;
    }
    const requestedNote = String(ev?.payload?.requestedNoteRaw || ev.note || '').trim();
    const noteName = helpers.clampNoteToDirectorPool?.(requestedNote || ev.note, beatIndex + ev.actorId);
    const eventKeyRaw = String(ev?.payload?.soundEventKey || '').trim();
    const eventKey = constants.swarmSoundEvents?.[eventKeyRaw]
      ? eventKeyRaw
      : helpers.resolveEnemyDeathEventKey?.(ev?.payload?.soundFamily, 'enemyDeathMedium');
    helpers.noteSwarmSoundEvent?.(
      eventKey,
      Math.max(0.001, Math.min(1, Number(ev?.payload?.volume) || 0)),
      beatIndex,
      noteName
    );
    logMusicLabExecution({
      sourceSystem: 'death',
      requestedNote,
      resolvedNote: noteName,
      noteWasClamped: requestedNote ? requestedNote !== noteName : false,
    });
    return true;
  }

  if (actionType === 'player-weapon-step') {
    const origin = ev?.payload?.centerWorld;
    const centerWorld = origin && Number.isFinite(origin.x) && Number.isFinite(origin.y)
      ? { x: Number(origin.x) || 0, y: Number(origin.y) || 0 }
      : helpers.getViewportCenterWorld?.();
    const fireResult = helpers.fireConfiguredWeaponsOnBeat?.(centerWorld, Math.trunc(Number(ev.stepIndex) || 0), beatIndex);
    logMusicLabExecution({
      sourceSystem: 'player',
      playerAudible: fireResult?.playerAudible === true,
    });
    return true;
  }

  return false;
}
