export function executePerformedBeatEventRuntime(options = null) {
  const ev = options?.event && typeof options.event === 'object' ? options.event : null;
  if (!ev) return false;
  let actionType = String(ev.actionType || '').trim().toLowerCase();
  if (!actionType) return false;

  const constants = options?.constants && typeof options.constants === 'object' ? options.constants : {};
  const helpers = options?.helpers && typeof options.helpers === 'object' ? options.helpers : {};
  const state = options?.state && typeof options.state === 'object' ? options.state : {};

  const beatIndex = Math.max(0, Math.trunc(Number(ev.beatIndex) || 0));
  const stepIndex = Math.max(0, Math.trunc(Number(ev.stepIndex) || 0));
  const barIndex = Math.floor(beatIndex / Math.max(1, Math.trunc(Number(constants.composerBeatsPerBar) || 4)));
  const playerStepLikelyAudible = helpers.isPlayerWeaponStepLikelyAudible?.(stepIndex) === true;
  const inferInstrumentLaneFromCatalogId = typeof helpers.inferInstrumentLaneFromCatalogId === 'function'
    ? helpers.inferInstrumentLaneFromCatalogId
    : ((_, fallbackLane = 'lead') => String(fallbackLane || 'lead').trim().toLowerCase() || 'lead');
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
  const resolveMusicProminenceGain = (raw) => {
    const key = String(raw || '').trim().toLowerCase();
    const traceGain = Math.max(0, Math.min(1, Number(constants.supportTraceGain) || 0.24));
    const quietGain = Math.max(traceGain, Math.min(1, Number(constants.supportQuietGain) || 0.52));
    if (key === 'suppressed') return 0;
    if (key === 'trace') return traceGain;
    if (key === 'quiet') return quietGain;
    return 1;
  };
  const isMaskingAudibleProminence = (raw) => {
    const key = String(raw || '').trim().toLowerCase();
    return key === 'full' || key === 'quiet';
  };
  const normalizeEnemyProminenceForPlayerStep = (raw) => {
    const key = String(raw || '').trim().toLowerCase() || 'full';
    if (!playerStepLikelyAudible) return key;
    if (actionType === 'player-weapon-step') return key;
    // During player-audible steps, keep enemy voices present but ducked (quiet) instead of muting to trace.
    if (key === 'full') return 'quiet';
    if (key === 'quiet') return 'quiet';
    return key;
  };
  const normalizeBassRegister = (noteLike, fallback = 'C3') => {
    const src = String(noteLike || '').trim();
    const m = /^([A-Ga-g])([#b]?)(-?\d+)$/.exec(src);
    if (!m) return String(fallback || 'C3').trim() || 'C3';
    const letter = String(m[1] || '').toUpperCase();
    const accidental = String(m[2] || '');
    const octave = Math.trunc(Number(m[3]) || 3);
    const clamped = octave >= 4 ? (octave - 1) : (octave < 2 ? 2 : octave);
    return `${letter}${accidental}${clamped}`;
  };
  const hasExplicitOctave = (noteLike) => /^([A-Ga-g])([#b]?)(-?\d+)$/.test(String(noteLike || '').trim());
  const enemyForAction = helpers.getSwarmEnemyById?.(ev.actorId) || null;
  if (actionType === 'projectile' && enemyForAction) {
    const enemyType = String(enemyForAction?.enemyType || '').trim().toLowerCase();
    if (enemyType === 'spawner') actionType = 'spawner-spawn';
    else if (enemyType === 'drawsnake') actionType = 'drawsnake-projectile';
    else if (enemyType === 'composer-group-member') actionType = 'composer-group-projectile';
  }

  if (actionType === 'spawner-spawn') {
    const enemy = helpers.getSwarmEnemyById?.(ev.actorId);
    if (!enemy || String(enemy?.enemyType || '') !== 'spawner') return false;
    const group = helpers.getEnemyMusicGroup?.(enemy, 'spawner-spawn');
    if (!group) return false;
    const emitSpawnerSystemEvent = (eventType, payload = null) => {
      try {
        helpers.noteMusicSystemEvent?.(eventType, payload && typeof payload === 'object' ? payload : {}, {
          beatIndex,
          stepIndex,
          barIndex,
        });
      } catch {}
    };
    const aggressionScale = helpers.getEnemyAggressionScale?.(enemy, group?.lifecycleState || 'active');
    const lockedInstrumentId = String(
      ev?.instrumentId
        || group?.instrumentId
        || enemy?.spawnerInstrument
        || enemy?.instrumentId
        || enemy?.musicInstrumentId
        || ''
    ).trim();
    const lockedLane = inferInstrumentLaneFromCatalogId(lockedInstrumentId, constants.roles?.bass || 'bass');
    const normalizedGroupRole = lockedLane === String(constants?.roles?.bass || 'bass')
      ? String(constants?.roles?.bass || 'bass')
      : helpers.normalizeSwarmRole?.(ev.role || group.role, constants.roles?.bass);
    const instrumentId = lockedInstrumentId || helpers.resolveSwarmRoleInstrumentId?.(
      normalizedGroupRole,
      helpers.resolveSwarmSoundInstrumentId?.('projectile') || 'tone'
    );
    group.instrumentId = instrumentId;
    group.role = normalizedGroupRole;
    const duckForPlayer = false;
    const audioGain = helpers.clamp01?.(Number(ev?.payload?.audioGain == null ? 1 : ev.payload.audioGain));
    const musicProminence = normalizeEnemyProminenceForPlayerStep(
      String(ev?.payload?.musicProminence || 'full').trim().toLowerCase() || 'full'
    );
    const prominenceGain = resolveMusicProminenceGain(musicProminence);
    const enemyAudible = isMaskingAudibleProminence(musicProminence);
    const audioMutedExplicitly = ev?.payload?.muteAudio === true || ev?.payload?.audioMuted === true;
    const shouldTriggerAudio = !audioMutedExplicitly;
    const triggerVolume = (Number(constants.spawnerTriggerSoundVolume) || 0)
      * (duckForPlayer ? (Number(constants.playerMaskDuckEnemyVolumeMult) || 1) : 1)
      * (Number(audioGain) || 0)
      * Math.max(0.18, prominenceGain)
      * (0.7 + ((Number(aggressionScale) || 0) * 0.3));
    const requestedNote = String(ev?.payload?.requestedNoteRaw || ev.note || '').trim();
    let noteName = helpers.clampNoteToDirectorPool?.(requestedNote || ev.note, beatIndex + ev.stepIndex + ev.actorId);
    if (String(normalizedGroupRole || '') === String(constants?.roles?.bass || 'bass')) {
      noteName = hasExplicitOctave(requestedNote)
        ? String(requestedNote).trim()
        : normalizeBassRegister(noteName, normalizeBassRegister(requestedNote || 'C3', 'C3'));
    }
    group.note = noteName;
    helpers.syncSingletonEnemyStateFromMusicGroup?.(enemy, group);
    helpers.pulseEnemyMusicalRoleVisual?.(enemy, enemyAudible ? 'strong' : 'soft');
    emitSpawnerSystemEvent('music_spawner_loopgrid_event', {
      sourceEnemyId: Math.max(0, Math.trunc(Number(enemy?.id) || 0)),
      sourceGroupId: Math.max(0, Math.trunc(Number(group?.id) || 0)),
      reason: 'performed_spawner_spawn',
    });
    let visualTriggered = false;
    let audioTriggered = false;
    helpers.flashSpawnerEnemyCell?.(enemy, ((Math.trunc(Number(ev?.payload?.nodeStepIndex) || ev.stepIndex || 0) % 8) + 8) % 8, 'strong');
    visualTriggered = true;
    emitSpawnerSystemEvent('music_spawner_visual_event', {
      sourceEnemyId: Math.max(0, Math.trunc(Number(enemy?.id) || 0)),
      sourceGroupId: Math.max(0, Math.trunc(Number(group?.id) || 0)),
      reason: 'proxy_flash',
    });
    if (shouldTriggerAudio) {
      try {
        helpers.triggerInstrument?.(instrumentId, noteName, undefined, 'master', {}, triggerVolume);
        audioTriggered = true;
      } catch {}
    } else {
      emitSpawnerSystemEvent('music_spawner_audio_muted', {
        sourceEnemyId: Math.max(0, Math.trunc(Number(enemy?.id) || 0)),
        sourceGroupId: Math.max(0, Math.trunc(Number(group?.id) || 0)),
        reason: 'explicit_mute',
      });
    }
    if (audioTriggered) {
      emitSpawnerSystemEvent('music_spawner_audio_event', {
        sourceEnemyId: Math.max(0, Math.trunc(Number(enemy?.id) || 0)),
        sourceGroupId: Math.max(0, Math.trunc(Number(group?.id) || 0)),
        reason: 'note_triggered',
      });
    }
    const nodeStepIndex = ((Math.trunc(Number(ev?.payload?.nodeStepIndex) || ev.stepIndex || 0) % 8) + 8) % 8;
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
      if (!spawnScreen || !Number.isFinite(spawnScreen.x) || !Number.isFinite(spawnScreen.y)) {
        emitSpawnerSystemEvent('music_spawner_pipeline_mismatch', {
          sourceEnemyId: Math.max(0, Math.trunc(Number(enemy?.id) || 0)),
          sourceGroupId: Math.max(0, Math.trunc(Number(group?.id) || 0)),
          failureReason: 'spawn_screen_invalid',
        });
        return false;
      }
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
      emitSpawnerSystemEvent('music_spawner_gameplay_event', {
        sourceEnemyId: Math.max(0, Math.trunc(Number(enemy?.id) || 0)),
        sourceGroupId: Math.max(0, Math.trunc(Number(group?.id) || 0)),
        reason: 'spawn_linked_enemy',
      });
      if (!visualTriggered || (!audioTriggered && !audioMutedExplicitly)) {
        emitSpawnerSystemEvent('music_spawner_pipeline_mismatch', {
          sourceEnemyId: Math.max(0, Math.trunc(Number(enemy?.id) || 0)),
          sourceGroupId: Math.max(0, Math.trunc(Number(group?.id) || 0)),
          failureReason: !visualTriggered ? 'visual_missing' : 'audio_missing',
        });
      }
      logMusicLabExecution({
        sourceSystem: 'spawner',
        requestedNote,
        resolvedNote: noteName,
        noteWasClamped: requestedNote ? requestedNote !== noteName : false,
        enemyAudible,
        musicProminence,
      });
      return true;
    }
    const origin = { x: Number(linkedEnemy.wx) || 0, y: Number(linkedEnemy.wy) || 0 };
    const toPlayer = helpers.getViewportCenterWorld?.();
    const dir = Math.atan2((Number(toPlayer?.y) || 0) - origin.y, (Number(toPlayer?.x) || 0) - origin.x);
    helpers.spawnHostileRedProjectileAt?.(origin, {
      angle: dir + helpers.randRange?.(-0.24, 0.24),
      speed: (Number(constants.spawnerLinkedAttackSpeed) || 0) * Math.max(0.4, Math.min(1, aggressionScale)),
      noteName,
      instrument: instrumentId,
      damage: Math.max(0.2, aggressionScale),
    });
    emitSpawnerSystemEvent('music_spawner_gameplay_event', {
      sourceEnemyId: Math.max(0, Math.trunc(Number(enemy?.id) || 0)),
      sourceGroupId: Math.max(0, Math.trunc(Number(group?.id) || 0)),
      targetEnemyId: Math.max(0, Math.trunc(Number(linkedEnemy?.id) || 0)),
      reason: 'launch_linked_projectile',
    });
    if (!visualTriggered || (!audioTriggered && !audioMutedExplicitly)) {
      emitSpawnerSystemEvent('music_spawner_pipeline_mismatch', {
        sourceEnemyId: Math.max(0, Math.trunc(Number(enemy?.id) || 0)),
        sourceGroupId: Math.max(0, Math.trunc(Number(group?.id) || 0)),
        targetEnemyId: Math.max(0, Math.trunc(Number(linkedEnemy?.id) || 0)),
        failureReason: !visualTriggered ? 'visual_missing' : 'audio_missing',
      });
    }
    helpers.pulseHitFlash?.(linkedEnemy.el);
    logMusicLabExecution({
      sourceSystem: 'spawner',
      requestedNote,
      resolvedNote: noteName,
      noteWasClamped: requestedNote ? requestedNote !== noteName : false,
      enemyAudible,
      musicProminence,
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
    const duckForPlayer = false;
    const audioGain = helpers.clamp01?.(Number(ev?.payload?.audioGain == null ? 1 : ev.payload.audioGain));
    const musicProminence = normalizeEnemyProminenceForPlayerStep(
      String(ev?.payload?.musicProminence || 'full').trim().toLowerCase() || 'full'
    );
    const prominenceGain = resolveMusicProminenceGain(musicProminence);
    const enemyAudible = isMaskingAudibleProminence(musicProminence);
    const triggerVolume = (Number(constants.drawSnakeTriggerSoundVolume) || 0)
      * (duckForPlayer ? (Number(constants.playerMaskDuckEnemyVolumeMult) || 1) : 1)
      * (Number(audioGain) || 0)
      * prominenceGain
      * (0.72 + ((Number(aggressionScale) || 0) * 0.28));
    const requestedNote = String(ev?.payload?.requestedNoteRaw || ev.note || '').trim();
    let noteName = helpers.clampNoteToDirectorPool?.(requestedNote || ev.note, beatIndex + ev.stepIndex + ev.actorId);
    group.note = noteName;
    helpers.syncSingletonEnemyStateFromMusicGroup?.(enemy, group);
    helpers.pulseEnemyMusicalRoleVisual?.(enemy, enemyAudible ? 'strong' : 'soft');
    if (enemyAudible) {
      try { helpers.triggerInstrument?.(instrumentId, noteName, undefined, 'master', {}, triggerVolume); } catch {}
    }
    const nodeIndex = Math.trunc(Number(ev?.payload?.nodeIndex) || 0);
    helpers.fireDrawSnakeProjectile?.(enemy, nodeIndex, noteName, aggressionScale);
    logMusicLabExecution({
      sourceSystem: 'drawsnake',
      requestedNote,
      resolvedNote: noteName,
      noteWasClamped: requestedNote ? requestedNote !== noteName : false,
      enemyAudible,
      musicProminence,
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
    let noteName = helpers.clampNoteToDirectorPool?.(requestedNote || ev.note, beatIndex + ev.stepIndex + ev.actorId);
    const lockedInstrumentId = String(
      ev?.instrumentId
        || group?.instrumentId
        || enemy?.instrumentId
        || enemy?.musicInstrumentId
        || enemy?.composerInstrument
        || ''
    ).trim();
    const lockedLane = inferInstrumentLaneFromCatalogId(lockedInstrumentId, '');
    const normalizedGroupRole = lockedLane === String(constants?.roles?.bass || 'bass')
      ? String(constants?.roles?.bass || 'bass')
      : helpers.normalizeSwarmRole?.(ev.role || group.role, constants.roles?.lead);
    const instrumentId = lockedInstrumentId || helpers.resolveSwarmRoleInstrumentId?.(
      normalizedGroupRole,
      helpers.resolveSwarmSoundInstrumentId?.('projectile') || 'tone'
    );
    group.instrumentId = instrumentId;
    group.role = normalizedGroupRole;
    if (String(normalizedGroupRole || '') === String(constants?.roles?.bass || 'bass')) {
      noteName = hasExplicitOctave(requestedNote)
        ? String(requestedNote).trim()
        : normalizeBassRegister(noteName, normalizeBassRegister(requestedNote || 'C3', 'C3'));
    }
    const duckForPlayer = false;
    const audioGain = helpers.clamp01?.(Number(ev?.payload?.audioGain == null ? 1 : ev.payload.audioGain));
    const musicProminence = normalizeEnemyProminenceForPlayerStep(
      String(ev?.payload?.musicProminence || 'full').trim().toLowerCase() || 'full'
    );
    const prominenceGain = resolveMusicProminenceGain(musicProminence);
    const enemyAudible = isMaskingAudibleProminence(musicProminence);
    const triggerVolume = 0.42
      * (duckForPlayer ? (Number(constants.playerMaskDuckEnemyVolumeMult) || 1) : 1)
      * (Number(audioGain) || 0)
      * prominenceGain
      * (0.72 + ((Number(aggressionScale) || 0) * 0.28));
    helpers.syncSingletonEnemyStateFromMusicGroup?.(enemy, group);
    helpers.pulseEnemyMusicalRoleVisual?.(enemy, enemyAudible ? 'strong' : 'soft');
    if (enemyAudible) {
      try { helpers.triggerInstrument?.(instrumentId, noteName, undefined, 'master', {}, triggerVolume); } catch {}
    }
    helpers.pulseHitFlash?.(enemy.el);
    enemy.composerActionPulseDur = Number(constants.composerGroupActionPulseSeconds) || 0;
    enemy.composerActionPulseT = Number(constants.composerGroupActionPulseSeconds) || 0;
    const origin = { x: Number(enemy.wx) || 0, y: Number(enemy.wy) || 0 };
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
      musicProminence,
    });
    return true;
  }

  if (actionType === 'enemy-death-accent') {
    const musicProminence = normalizeEnemyProminenceForPlayerStep(
      String(ev?.payload?.musicProminence || 'quiet').trim().toLowerCase() || 'quiet'
    );
    const prominenceGain = resolveMusicProminenceGain(musicProminence);
    const enemyAudible = isMaskingAudibleProminence(musicProminence);
    const requestedNote = String(ev?.payload?.requestedNoteRaw || ev.note || '').trim();
    const noteName = helpers.clampNoteToDirectorPool?.(requestedNote || ev.note, beatIndex + ev.actorId);
    const eventKeyRaw = String(ev?.payload?.soundEventKey || '').trim();
    const eventKey = constants.swarmSoundEvents?.[eventKeyRaw]
      ? eventKeyRaw
      : helpers.resolveEnemyDeathEventKey?.(ev?.payload?.soundFamily, 'enemyDeathMedium');
    if (prominenceGain > 0) {
      helpers.noteSwarmSoundEvent?.(
        eventKey,
        Math.max(0.001, Math.min(1, (Number(ev?.payload?.volume) || 0) * prominenceGain)),
        beatIndex,
        noteName
      );
    }
    logMusicLabExecution({
      sourceSystem: 'death',
      requestedNote,
      resolvedNote: noteName,
      noteWasClamped: requestedNote ? requestedNote !== noteName : false,
      enemyAudible,
      musicProminence,
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

  // Compatibility path for legacy/generic projectile events that do not map to a gameplay actor handler.
  if (actionType === 'projectile') {
    const enemy = enemyForAction || helpers.getSwarmEnemyById?.(ev.actorId);
    if (!enemy) return false;
    const group = helpers.getEnemyMusicGroup?.(enemy, 'projectile');
    const role = ev.role
      || group?.role
      || helpers.getSwarmRoleForEnemy?.(enemy, constants.roles?.accent);
    const instrumentId = helpers.resolveSwarmRoleInstrumentId?.(
      role,
      helpers.resolveSwarmSoundInstrumentId?.('projectile') || 'tone'
    );
    const requestedNote = String(ev?.payload?.requestedNoteRaw || ev.note || '').trim();
    const noteName = helpers.clampNoteToDirectorPool?.(requestedNote || ev.note, beatIndex + ev.stepIndex + ev.actorId);
    const musicProminence = normalizeEnemyProminenceForPlayerStep(
      String(ev?.payload?.musicProminence || 'quiet').trim().toLowerCase() || 'quiet'
    );
    const prominenceGain = resolveMusicProminenceGain(musicProminence);
    const enemyAudible = isMaskingAudibleProminence(musicProminence);
    const triggerVolume = (Number(constants.drawSnakeTriggerSoundVolume) || 0.32) * prominenceGain;
    if (group) {
      group.instrumentId = instrumentId;
      group.role = helpers.normalizeSwarmRole?.(role, constants.roles?.accent);
      group.note = noteName;
      helpers.syncSingletonEnemyStateFromMusicGroup?.(enemy, group);
    }
    helpers.pulseEnemyMusicalRoleVisual?.(enemy, enemyAudible ? 'strong' : 'soft');
    if (enemyAudible && prominenceGain > 0) {
      try { helpers.triggerInstrument?.(instrumentId, noteName, undefined, 'master', {}, triggerVolume); } catch {}
    }
    logMusicLabExecution({
      sourceSystem: String(ev?.sourceSystem || ev?.payload?.sourceSystem || 'group').trim().toLowerCase() || 'group',
      requestedNote,
      resolvedNote: noteName,
      noteWasClamped: requestedNote ? requestedNote !== noteName : false,
      enemyAudible,
      musicProminence,
    });
    return true;
  }

  return false;
}
