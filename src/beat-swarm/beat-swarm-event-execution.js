export function executePerformedBeatEventRuntime(options = null) {
  const ev = options?.event && typeof options.event === 'object' ? options.event : null;
  if (!ev) return false;
  let actionType = String(ev.actionType || '').trim().toLowerCase();
  if (!actionType) return false;

  const constants = options?.constants && typeof options.constants === 'object' ? options.constants : {};
  const helpers = options?.helpers && typeof options.helpers === 'object' ? options.helpers : {};
  const state = options?.state && typeof options.state === 'object' ? options.state : {};
  const getPerfNow = (() => {
    try {
      if (typeof performance !== 'undefined' && typeof performance.now === 'function') return () => performance.now();
    } catch {}
    return () => Date.now();
  })();
  const recordPerfSample = typeof helpers.recordStepEventsPerfSample === 'function'
    ? helpers.recordStepEventsPerfSample
    : null;
  const withPerfSample = (name, fn) => {
    if (typeof fn !== 'function') return undefined;
    if (typeof recordPerfSample !== 'function') return fn();
    const startedAt = getPerfNow();
    try {
      return fn();
    } finally {
      recordPerfSample(name, Math.max(0, getPerfNow() - startedAt));
    }
  };

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
  const executionInstrumentRuntime = state.executionInstrumentRuntime && typeof state.executionInstrumentRuntime === 'object'
    ? state.executionInstrumentRuntime
    : (state.executionInstrumentRuntime = { bySourceKey: new Map() });
  if (!(executionInstrumentRuntime.bySourceKey instanceof Map)) executionInstrumentRuntime.bySourceKey = new Map();
  const noteExecutedInstrumentChange = (instrumentIdLike, enemyLike = null, groupLike = null) => {
    const instrumentId = String(instrumentIdLike || '').trim();
    if (!instrumentId) return;
    const enemy = enemyLike && typeof enemyLike === 'object' ? enemyLike : null;
    const group = groupLike && typeof groupLike === 'object' ? groupLike : null;
    const payload = ev?.payload && typeof ev.payload === 'object' ? ev.payload : {};
    const continuityId = String(
      payload?.continuityId
        || group?.musicLaneContinuityId
        || group?.continuityId
        || enemy?.musicLaneContinuityId
        || enemy?.musicContinuityId
        || enemy?.continuityId
        || ''
    ).trim();
    const laneId = String(payload?.musicLaneId || payload?.foundationLaneId || '').trim().toLowerCase();
    const groupId = Math.max(0, Math.trunc(Number(group?.id) || Number(payload?.groupId) || 0));
    const actorId = Math.max(0, Math.trunc(Number(enemy?.id) || Number(ev?.actorId) || 0));
    const sourceKey = String(
      (laneId === 'foundation_lane' || laneId === 'primary_loop_lane')
        ? `lane:${laneId}`
        : (continuityId
          ? `continuity:${continuityId}`
          : (groupId > 0 ? `group:${groupId}` : (actorId > 0 ? `actor:${actorId}` : '')))
    ).trim().toLowerCase();
    if (!sourceKey) return;
    const laneScope = (() => {
      if (laneId === 'foundation_lane' || laneId === 'primary_loop_lane') return 'protected_lane';
      const bufferSection = String(group?.sectionId || group?.sectionKey || '').trim().toLowerCase();
      if (bufferSection === 'foundation-buffer') return 'buffer_takeover';
      const musicLayer = String(payload?.musicLayer || '').trim().toLowerCase();
      if (musicLayer === 'loops') return 'support_lane';
      return 'unscoped';
    })();
    const identityChangeReason = String(
      payload?.identityChangeReason
        || group?.musicLaneIdentityChangeReason
        || enemy?.musicLaneIdentityChangeReason
        || ''
    ).trim().toLowerCase();
    const sectionId = String(
      payload?.sectionId
        || group?.sectionId
        || group?.sectionKey
        || enemy?.sectionId
        || ''
    ).trim().toLowerCase();
    const motifScopeKey = String(
      payload?.motifScopeKey
        || group?.motifScopeKey
        || enemy?.motifScopeKey
        || ''
    ).trim().toLowerCase();
    const lifecycleState = String(
      payload?.lifecycleState
        || group?.lifecycleState
        || enemy?.lifecycleState
        || ''
    ).trim().toLowerCase();
    const previous = executionInstrumentRuntime.bySourceKey.get(sourceKey) || null;
    const continuityClass = previous
      ? (
        previous.continuityId && continuityId
          ? (previous.continuityId === continuityId ? 'same_continuity' : 'new_continuity')
          : 'unknown'
      )
      : 'first_seen';
    if (previous && previous.instrumentId && previous.instrumentId !== instrumentId) {
      const cause = (() => {
        if (identityChangeReason === 'reorchestrate_lane') return 'explicit_reorchestration';
        if (identityChangeReason === 'continuity_reset') return 'continuity_reset';
        if (previous.actorId > 0 && actorId > 0 && previous.actorId !== actorId) return 'performer_change';
        if (previous.groupId > 0 && groupId > 0 && previous.groupId !== groupId) return 'group_change';
        if (previous.sectionId && sectionId && previous.sectionId !== sectionId) return 'section_change';
        if (previous.motifScopeKey && motifScopeKey && previous.motifScopeKey !== motifScopeKey) return 'motif_scope_change';
        if (previous.lifecycleState === 'retiring' || lifecycleState === 'retiring') return 'retiring_owner';
        if (identityChangeReason === 'section_restatement') return 'section_restatement';
        if (identityChangeReason === 'phrase_boundary_mutation') return 'phrase_boundary_mutation';
        return 'unknown';
      })();
      try {
        helpers.noteMusicSystemEvent?.('music_execution_instrument_change', {
          actorId,
          enemyId: actorId,
          enemyType: String(enemy?.enemyType || ev?.enemyType || '').trim().toLowerCase(),
          groupId,
          continuityId,
          previousContinuityId: String(previous.continuityId || '').trim(),
          instrumentId,
          previousInstrumentId: String(previous.instrumentId || '').trim(),
          laneId,
          role: String(ev?.role || group?.role || '').trim().toLowerCase(),
          actionType,
          reason: 'execution_playback_change',
          continuityClass,
          laneScope,
          sourceKey,
          identityChangeReason,
          sectionId,
          motifScopeKey,
          lifecycleState,
          previousActorId: Math.max(0, Math.trunc(Number(previous.actorId) || 0)),
          previousGroupId: Math.max(0, Math.trunc(Number(previous.groupId) || 0)),
          previousSectionId: String(previous.sectionId || '').trim().toLowerCase(),
          previousMotifScopeKey: String(previous.motifScopeKey || '').trim().toLowerCase(),
          previousLifecycleState: String(previous.lifecycleState || '').trim().toLowerCase(),
          cause,
        }, {
          beatIndex,
          stepIndex,
          barIndex,
          continuityId,
        });
      } catch {}
    }
    executionInstrumentRuntime.bySourceKey.set(sourceKey, {
      continuityId,
      instrumentId,
      lastBeatIndex: beatIndex,
      lastStepIndex: stepIndex,
      laneScope,
      actorId,
      groupId,
      sectionId,
      motifScopeKey,
      lifecycleState,
    });
  };
  const resolveContinuitySafeExecutionInstrument = (
    requestedInstrumentLike,
    enemyLike = null,
    groupLike = null,
    fallbackInstrumentLike = ''
  ) => {
    const enemy = enemyLike && typeof enemyLike === 'object' ? enemyLike : null;
    const group = groupLike && typeof groupLike === 'object' ? groupLike : null;
    const requestedInstrumentId = String(requestedInstrumentLike || '').trim();
    const fallbackInstrumentId = String(fallbackInstrumentLike || '').trim();
    const payload = ev?.payload && typeof ev.payload === 'object' ? ev.payload : {};
    const identityChangeReason = String(
      payload?.identityChangeReason
        || group?.musicLaneIdentityChangeReason
        || enemy?.musicLaneIdentityChangeReason
        || ''
    ).trim().toLowerCase();
    const allowRequestedRewrite = (
      identityChangeReason === 'reorchestrate_lane'
      || identityChangeReason === 'continuity_reset'
    );
    const eventContinuityId = String(
      payload?.continuityId
        || ev?.continuityId
        || ''
    ).trim();
    const liveContinuityId = String(
      group?.musicLaneContinuityId
        || group?.continuityId
        || enemy?.musicLaneContinuityId
        || enemy?.musicContinuityId
        || enemy?.continuityId
        || ''
    ).trim();
    const sameContinuity = !!eventContinuityId && !!liveContinuityId && eventContinuityId === liveContinuityId;
    const lockedLiveInstrumentId = String(
      group?.musicLaneInstrumentId
        || enemy?.musicLaneInstrumentId
        || group?.instrumentId
        || enemy?.musicInstrumentId
        || enemy?.instrumentId
        || ''
    ).trim();
    if (!allowRequestedRewrite && sameContinuity && lockedLiveInstrumentId) {
      return lockedLiveInstrumentId;
    }
    return requestedInstrumentId || lockedLiveInstrumentId || fallbackInstrumentId;
  };
  const shouldPersistExecutionInstrumentRewrite = (enemyLike = null, groupLike = null) => {
    const enemy = enemyLike && typeof enemyLike === 'object' ? enemyLike : null;
    const group = groupLike && typeof groupLike === 'object' ? groupLike : null;
    const payload = ev?.payload && typeof ev.payload === 'object' ? ev.payload : {};
    const identityChangeReason = String(
      payload?.identityChangeReason
        || group?.musicLaneIdentityChangeReason
        || enemy?.musicLaneIdentityChangeReason
        || ''
    ).trim().toLowerCase();
    if (identityChangeReason === 'reorchestrate_lane' || identityChangeReason === 'continuity_reset') {
      return true;
    }
    const eventContinuityId = String(payload?.continuityId || ev?.continuityId || '').trim();
    const liveContinuityId = String(
      group?.musicLaneContinuityId
        || group?.continuityId
        || enemy?.musicLaneContinuityId
        || enemy?.musicContinuityId
        || enemy?.continuityId
        || ''
    ).trim();
    return !(eventContinuityId && liveContinuityId && eventContinuityId === liveContinuityId);
  };
  const resolveMusicProminenceGain = (raw) => {
    const key = String(raw || '').trim().toLowerCase();
    const entryAudibilityGrace = ev?.payload?.entryAudibilityGrace === true;
    const traceGainBase = Math.max(0, Math.min(1, Number(constants.supportTraceGain) || 0.24));
    const quietGainBase = Math.max(traceGainBase, Math.min(1, Number(constants.supportQuietGain) || 0.52));
    const traceGain = entryAudibilityGrace
      ? Math.max(traceGainBase, Math.min(1, traceGainBase * Math.max(1, Number(constants.entryAudibilityTraceGainMult) || 1.35)))
      : traceGainBase;
    const quietGain = entryAudibilityGrace
      ? Math.max(quietGainBase, Math.min(1, quietGainBase * Math.max(1, Number(constants.entryAudibilityQuietGainMult) || 1.18)))
      : quietGainBase;
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
    const entryAudibilityGrace = ev?.payload?.entryAudibilityGrace === true;
    if (!playerStepLikelyAudible) return key;
    if (actionType === 'player-weapon-step') return key;
    const eventLayer = String(ev?.payload?.musicLayer || '').trim().toLowerCase();
    if (eventLayer === 'foundation') return key;
    if (entryAudibilityGrace && (key === 'trace' || key === 'quiet')) return 'quiet';
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
    return withPerfSample('pickupsCombat.weaponRuntime.stepChange.processEvents.execute.spawner', () => {
    const enemy = helpers.getSwarmEnemyById?.(ev.actorId);
    if (!enemy || String(enemy?.enemyType || '') !== 'spawner') return false;
    const group = withPerfSample('pickupsCombat.weaponRuntime.stepChange.processEvents.execute.spawner.group', () => (
      helpers.getEnemyMusicGroup?.(enemy, 'spawner-spawn', { sync: false })
    ));
    if (!group) return false;
    const sourceEnemyId = Math.max(0, Math.trunc(Number(enemy?.id) || 0));
    const sourceGroupId = Math.max(0, Math.trunc(Number(group?.id) || 0));
    const emitSpawnerSystemEvent = (eventType, payload = null) => {
      if (eventType !== 'music_spawner_gameplay_event' && eventType !== 'music_spawner_pipeline_mismatch') {
        return;
      }
      try {
        helpers.noteMusicSystemEvent?.(eventType, payload && typeof payload === 'object' ? payload : {}, {
          beatIndex,
          stepIndex,
          barIndex,
        });
      } catch {}
    };
    const aggressionScale = helpers.getEnemyAggressionScale?.(enemy, group?.lifecycleState || 'active');
    let normalizedGroupRole = '';
    let instrumentId = '';
    let musicProminence = 'full';
    let prominenceGain = 1;
    let enemyAudible = true;
    let audioMutedExplicitly = false;
    let shouldTriggerAudio = true;
    let triggerVolume = 0;
    let requestedNote = '';
    let noteName = '';
    let audioDedupKey = '';
    withPerfSample('pickupsCombat.weaponRuntime.stepChange.processEvents.execute.spawner.prep', () => {
      const lockedInstrumentId = String(
        ev?.instrumentId
          || group?.instrumentId
          || enemy?.spawnerInstrument
          || enemy?.instrumentId
          || enemy?.musicInstrumentId
          || ''
      ).trim();
      const lockedLane = inferInstrumentLaneFromCatalogId(lockedInstrumentId, constants.roles?.bass || 'bass');
      normalizedGroupRole = lockedLane === String(constants?.roles?.bass || 'bass')
        ? String(constants?.roles?.bass || 'bass')
        : helpers.normalizeSwarmRole?.(ev.role || group.role, constants.roles?.bass);
      instrumentId = resolveContinuitySafeExecutionInstrument(
        lockedInstrumentId,
        enemy,
        group,
        helpers.resolveSwarmRoleInstrumentId?.(
          normalizedGroupRole,
          helpers.resolveSwarmSoundInstrumentId?.('projectile') || 'tone'
        )
      ) || helpers.resolveSwarmRoleInstrumentId?.(
        normalizedGroupRole,
        helpers.resolveSwarmSoundInstrumentId?.('projectile') || 'tone'
      );
      group.instrumentId = instrumentId;
      group.role = normalizedGroupRole;
      const duckForPlayer = false;
      const audioGain = helpers.clamp01?.(Number(ev?.payload?.audioGain == null ? 1 : ev.payload.audioGain));
      musicProminence = normalizeEnemyProminenceForPlayerStep(
        String(ev?.payload?.musicProminence || 'full').trim().toLowerCase() || 'full'
      );
      prominenceGain = resolveMusicProminenceGain(musicProminence);
      enemyAudible = isMaskingAudibleProminence(musicProminence);
      audioMutedExplicitly = ev?.payload?.muteAudio === true || ev?.payload?.audioMuted === true;
      shouldTriggerAudio = !audioMutedExplicitly;
      triggerVolume = (Number(constants.spawnerTriggerSoundVolume) || 0)
        * (duckForPlayer ? (Number(constants.playerMaskDuckEnemyVolumeMult) || 1) : 1)
        * (Number(audioGain) || 0)
        * Math.max(0.18, prominenceGain)
        * (0.7 + ((Number(aggressionScale) || 0) * 0.3));
      requestedNote = String(ev?.payload?.requestedNoteRaw || ev.note || '').trim();
      noteName = helpers.clampNoteToDirectorPool?.(requestedNote || ev.note, beatIndex + ev.stepIndex + ev.actorId);
      if (String(normalizedGroupRole || '') === String(constants?.roles?.bass || 'bass')) {
        noteName = hasExplicitOctave(requestedNote)
          ? String(requestedNote).trim()
          : normalizeBassRegister(noteName, normalizeBassRegister(requestedNote || 'C3', 'C3'));
      }
      group.note = noteName;
      audioDedupKey = [
        sourceGroupId,
        String(group?.continuityId || enemy?.musicContinuityId || ''),
        beatIndex,
        stepIndex,
        String(instrumentId || ''),
        String(noteName || ''),
        String(musicProminence || ''),
      ].join('|');
    });
    withPerfSample('pickupsCombat.weaponRuntime.stepChange.processEvents.execute.spawner.audioVisual', () => {
      enemy.musicalRole = normalizedGroupRole;
      enemy.composerRole = normalizedGroupRole;
      enemy.musicInstrumentId = instrumentId;
      enemy.instrumentId = instrumentId;
      enemy.spawnerInstrument = instrumentId;
      enemy.spawnerNoteName = noteName;
      if (group?.continuityId) {
        enemy.musicContinuityId = String(group.continuityId);
        enemy.continuityId = String(group.continuityId);
      }
      noteExecutedInstrumentChange(instrumentId, enemy, group);
      helpers.pulseEnemyMusicalRoleVisual?.(enemy, enemyAudible ? 'strong' : 'soft');
    });
    let visualTriggered = false;
    let audioTriggered = false;
    const nodeStepIndex = ((Math.trunc(Number(ev?.payload?.nodeStepIndex) || ev.stepIndex || 0) % 8) + 8) % 8;
    const shouldFlashSpawnerCell = prominenceGain > 0;
    const spawnerFlashMode = musicProminence === 'full' ? 'strong' : 'soft';
    if (shouldFlashSpawnerCell) {
      withPerfSample('pickupsCombat.weaponRuntime.stepChange.processEvents.execute.spawner.flash', () => {
        helpers.flashSpawnerEnemyCell?.(enemy, nodeStepIndex, spawnerFlashMode);
        const peerSignature = String(enemy?.__bsSpawnerSyncSignature || '').trim();
        if (!peerSignature || !Array.isArray(state?.enemies)) return;
        for (const peer of state.enemies) {
          if (!peer || peer === enemy) continue;
          if (String(peer?.enemyType || '').trim().toLowerCase() !== 'spawner') continue;
          if (String(peer?.__bsSpawnerSyncSignature || '').trim() !== peerSignature) continue;
          const peerSteps = Array.isArray(peer?.spawnerSteps) ? peer.spawnerSteps : [];
          if (!peerSteps[nodeStepIndex]) continue;
          helpers.flashSpawnerEnemyCell?.(peer, nodeStepIndex, 'soft');
        }
      });
      visualTriggered = true;
    }
    const shouldTriggerGroupAudio = shouldTriggerAudio
      && String(group?.lastAudioDedupKey || '') !== audioDedupKey;
    if (shouldTriggerGroupAudio) {
      withPerfSample('pickupsCombat.weaponRuntime.stepChange.processEvents.execute.spawner.audioTrigger', () => {
        try {
          helpers.triggerInstrument?.(instrumentId, noteName, undefined, 'master', {}, triggerVolume);
          audioTriggered = true;
          group.lastAudioDedupKey = audioDedupKey;
        } catch {}
      });
    }
    if (!Array.isArray(enemy.spawnerNodeEnemyIds)) enemy.spawnerNodeEnemyIds = Array.from({ length: 8 }, () => 0);
    let linkedEnemy = withPerfSample('pickupsCombat.weaponRuntime.stepChange.processEvents.execute.spawner.linkedLookup', () => {
      const linkedEnemyId = Math.trunc(Number(enemy.spawnerNodeEnemyIds[nodeStepIndex]) || 0);
      const resolved = linkedEnemyId > 0 ? helpers.getSwarmEnemyById?.(linkedEnemyId) : null;
      if (!resolved || String(resolved?.enemyType || '') !== 'dumb') {
        enemy.spawnerNodeEnemyIds[nodeStepIndex] = 0;
        return null;
      }
      return resolved;
    });
    if (!linkedEnemy) {
      const spawned = withPerfSample('pickupsCombat.weaponRuntime.stepChange.processEvents.execute.spawner.spawnLinked', () => {
        const spawnWorld = helpers.getSpawnerNodeCellWorld?.(enemy, nodeStepIndex) || { x: Number(enemy.wx) || 0, y: Number(enemy.wy) || 0 };
        const spawnScreen = helpers.worldToScreen?.(spawnWorld);
        if (!spawnScreen || !Number.isFinite(spawnScreen.x) || !Number.isFinite(spawnScreen.y)) {
          emitSpawnerSystemEvent('music_spawner_pipeline_mismatch', {
            sourceEnemyId,
            sourceGroupId,
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
          role: normalizedGroupRole,
          layer: 'foundation',
          note: noteName,
          instrumentId,
          continuityId: String(group?.musicLaneContinuityId || group?.continuityId || enemy?.musicContinuityId || '').trim(),
          skipMusicGroupInit: true,
        });
        if ((Array.isArray(state.enemies) ? state.enemies.length : 0) > beforeCount) {
          const created = state.enemies[state.enemies.length - 1];
          if (created && Number.isFinite(created.id)) {
            enemy.spawnerNodeEnemyIds[nodeStepIndex] = Math.trunc(created.id);
          }
        }
        return true;
      });
      if (!spawned) return false;
      if ((shouldFlashSpawnerCell && !visualTriggered) || (!audioTriggered && !audioMutedExplicitly)) {
        emitSpawnerSystemEvent('music_spawner_pipeline_mismatch', {
          sourceEnemyId,
          sourceGroupId,
          failureReason: (!visualTriggered && shouldFlashSpawnerCell) ? 'visual_missing' : 'audio_missing',
        });
      }
      withPerfSample('pickupsCombat.weaponRuntime.stepChange.processEvents.execute.spawner.logging', () => {
        logMusicLabExecution({
          sourceSystem: 'spawner',
          requestedNote,
          resolvedNote: noteName,
          noteWasClamped: requestedNote ? requestedNote !== noteName : false,
          enemyAudible,
          musicProminence,
        });
      });
      return true;
    }
    const origin = { x: Number(linkedEnemy.wx) || 0, y: Number(linkedEnemy.wy) || 0 };
    const toPlayer = helpers.getViewportCenterWorld?.();
    withPerfSample('pickupsCombat.weaponRuntime.stepChange.processEvents.execute.spawner.launchLinked', () => {
      const dir = Math.atan2((Number(toPlayer?.y) || 0) - origin.y, (Number(toPlayer?.x) || 0) - origin.x);
      helpers.spawnHostileRedProjectileAt?.(origin, {
        angle: dir + helpers.randRange?.(-0.24, 0.24),
        speed: (Number(constants.spawnerLinkedAttackSpeed) || 0) * Math.max(0.4, Math.min(1, aggressionScale)),
        noteName,
        instrument: instrumentId,
        damage: Math.max(0.2, aggressionScale),
      });
    });
    if ((shouldFlashSpawnerCell && !visualTriggered) || (!audioTriggered && !audioMutedExplicitly)) {
      emitSpawnerSystemEvent('music_spawner_pipeline_mismatch', {
        sourceEnemyId,
        sourceGroupId,
        targetEnemyId: Math.max(0, Math.trunc(Number(linkedEnemy?.id) || 0)),
        failureReason: (!visualTriggered && shouldFlashSpawnerCell) ? 'visual_missing' : 'audio_missing',
      });
    }
    withPerfSample('pickupsCombat.weaponRuntime.stepChange.processEvents.execute.spawner.linkedVisual', () => {
      helpers.pulseHitFlash?.(linkedEnemy.el);
    });
    withPerfSample('pickupsCombat.weaponRuntime.stepChange.processEvents.execute.spawner.logging', () => {
      logMusicLabExecution({
        sourceSystem: 'spawner',
        requestedNote,
        resolvedNote: noteName,
        noteWasClamped: requestedNote ? requestedNote !== noteName : false,
        enemyAudible,
        musicProminence,
      });
    });
    return true;
  });
  }

  if (actionType === 'drawsnake-projectile') {
    return withPerfSample('pickupsCombat.weaponRuntime.stepChange.processEvents.execute.drawsnake', () => {
    const enemy = helpers.getSwarmEnemyById?.(ev.actorId);
    if (!enemy || String(enemy?.enemyType || '') !== 'drawsnake') return false;
    const group = withPerfSample('pickupsCombat.weaponRuntime.stepChange.processEvents.execute.drawsnake.group', () => (
      helpers.getEnemyMusicGroup?.(enemy, 'drawsnake-projectile', { sync: false })
    ));
    if (!group) return false;
    const aggressionScale = helpers.getEnemyAggressionScale?.(enemy, group?.lifecycleState || 'active');
    const requestedInstrumentId = String(
      ev?.instrumentId
        || group?.instrumentId
        || enemy?.drawsnakeInstrument
        || enemy?.musicInstrumentId
        || enemy?.instrumentId
        || helpers.resolveSwarmRoleInstrumentId?.(
          ev.role || group.role || helpers.getSwarmRoleForEnemy?.(enemy, constants.roles?.lead),
          helpers.resolveSwarmSoundInstrumentId?.('projectile') || 'tone'
        )
        || 'tone'
    ).trim() || 'tone';
    const instrumentId = resolveContinuitySafeExecutionInstrument(
      requestedInstrumentId,
      enemy,
      group,
      'tone'
    ) || 'tone';
    const persistExecutionInstrumentRewrite = shouldPersistExecutionInstrumentRewrite(enemy, group);
    if (persistExecutionInstrumentRewrite) {
      group.instrumentId = instrumentId;
      group.instrument = instrumentId;
    }
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
    withPerfSample('pickupsCombat.weaponRuntime.stepChange.processEvents.execute.drawsnake.audioVisual', () => {
      enemy.musicalRole = group.role;
      enemy.composerRole = group.role;
      if (persistExecutionInstrumentRewrite) {
        enemy.drawsnakeInstrument = instrumentId;
        enemy.musicInstrumentId = instrumentId;
        enemy.instrumentId = instrumentId;
      }
      if (group?.continuityId) {
        enemy.musicContinuityId = String(group.continuityId);
        enemy.continuityId = String(group.continuityId);
      }
      noteExecutedInstrumentChange(instrumentId, enemy, group);
      helpers.pulseEnemyMusicalRoleVisual?.(enemy, enemyAudible ? 'strong' : 'soft');
    });
    if (enemyAudible) {
      withPerfSample('pickupsCombat.weaponRuntime.stepChange.processEvents.execute.drawsnake.audioTrigger', () => {
        try { helpers.triggerInstrument?.(instrumentId, noteName, undefined, 'master', {}, triggerVolume); } catch {}
      });
    }
    let nodeIndex = 0;
    withPerfSample('pickupsCombat.weaponRuntime.stepChange.processEvents.execute.drawsnake.projectilePrep', () => {
      nodeIndex = Math.trunc(Number(ev?.payload?.nodeIndex) || 0);
    });
    withPerfSample('pickupsCombat.weaponRuntime.stepChange.processEvents.execute.drawsnake.projectileFire', () => {
      helpers.fireDrawSnakeProjectile?.(enemy, nodeIndex, noteName, aggressionScale, instrumentId);
    });
    withPerfSample('pickupsCombat.weaponRuntime.stepChange.processEvents.execute.drawsnake.logging', () => {
      logMusicLabExecution({
        sourceSystem: 'drawsnake',
        requestedNote,
        resolvedNote: noteName,
        noteWasClamped: requestedNote ? requestedNote !== noteName : false,
        enemyAudible,
        musicProminence,
      });
    });
    return true;
  });
  }

  if (actionType === 'composer-group-projectile' || actionType === 'composer-group-explosion') {
    return withPerfSample('pickupsCombat.weaponRuntime.stepChange.processEvents.execute.composer', () => {
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
    const instrumentId = resolveContinuitySafeExecutionInstrument(
      lockedInstrumentId,
      enemy,
      group,
      helpers.resolveSwarmRoleInstrumentId?.(
        normalizedGroupRole,
        helpers.resolveSwarmSoundInstrumentId?.('projectile') || 'tone'
      )
    ) || helpers.resolveSwarmRoleInstrumentId?.(
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
    const triggerVolume = 0.62
      * (duckForPlayer ? (Number(constants.playerMaskDuckEnemyVolumeMult) || 1) : 1)
      * (Number(audioGain) || 0)
      * prominenceGain
      * (0.72 + ((Number(aggressionScale) || 0) * 0.28));
    helpers.syncSingletonEnemyStateFromMusicGroup?.(enemy, group);
    noteExecutedInstrumentChange(instrumentId, enemy, group);
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
  });
  }

  if (actionType === 'enemy-death-accent') {
    return withPerfSample('pickupsCombat.weaponRuntime.stepChange.processEvents.execute.deathAccent', () => {
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
        noteName,
        {
          authoringClass: String(ev?.payload?.authoringClass || 'gameplayauthored').trim().toLowerCase(),
          sourceSystem: String(ev?.sourceSystem || 'death').trim().toLowerCase(),
          actionType,
          countInTimingAuthority: false,
        }
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
  });
  }

  if (actionType === 'player-weapon-step') {
    return withPerfSample('pickupsCombat.weaponRuntime.stepChange.processEvents.execute.player', () => {
    let centerWorld = null;
    let playerStepIndex = 0;
    let playerFireOptions = null;
    withPerfSample('pickupsCombat.weaponRuntime.stepChange.processEvents.execute.player.prep', () => {
      const origin = ev?.payload?.centerWorld;
      centerWorld = origin && Number.isFinite(origin.x) && Number.isFinite(origin.y)
        ? { x: Number(origin.x) || 0, y: Number(origin.y) || 0 }
        : helpers.getViewportCenterWorld?.();
      playerStepIndex = Math.trunc(Number(ev.stepIndex) || 0);
      playerFireOptions = {
        playerSoundVolumeMult: Math.max(0.1, Math.min(1, Number(ev?.payload?.playerSoundVolumeMult) || 1)),
        foundationPresent: ev?.payload?.foundationPresent === true,
      };
    });
    const fireResult = withPerfSample('pickupsCombat.weaponRuntime.stepChange.processEvents.execute.player.fire', () => (
      helpers.fireConfiguredWeaponsOnBeat?.(
        centerWorld,
        playerStepIndex,
        beatIndex,
        playerFireOptions
      )
    ));
    logMusicLabExecution({
      sourceSystem: 'player',
      playerAudible: fireResult?.playerAudible === true,
    });
    return true;
  });
  }

  // Compatibility path for legacy/generic projectile events that do not map to a gameplay actor handler.
  if (actionType === 'projectile') {
    return withPerfSample('pickupsCombat.weaponRuntime.stepChange.processEvents.execute.genericProjectile', () => {
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
    noteExecutedInstrumentChange(instrumentId, enemy, group);
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
  });
  }

  return false;
}
