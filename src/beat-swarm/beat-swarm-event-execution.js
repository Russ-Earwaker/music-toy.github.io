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
  const getInstrumentPlaybackMetadata = typeof helpers.getInstrumentPlaybackMetadata === 'function'
    ? helpers.getInstrumentPlaybackMetadata
    : (() => null);
  const payloadGroupId = Math.max(0, Math.trunc(Number(ev?.payload?.groupId) || 0));
  const logMusicLabExecution = (context = null) => {
    const base = context && typeof context === 'object' ? context : {};
    const payload = ev?.payload && typeof ev.payload === 'object' ? ev.payload : {};
    try {
      state.swarmMusicLab?.logExecutedEvent?.(ev, helpers.getMusicLabContext?.({
        beatIndex,
        stepIndex,
        barIndex,
        groupId: payloadGroupId,
        callResponseLane: String(base?.callResponseLane || payload?.callResponseLane || '').trim().toLowerCase(),
        callResponseQualified: base?.callResponseQualified === true
          ? true
          : (base?.callResponseQualified === false
            ? false
            : (payload?.callResponseQualified === true
              ? true
              : (payload?.callResponseQualified === false ? false : null))),
        callResponsePhraseProgress: Math.max(
          0,
          Math.trunc(Number(
            base?.callResponsePhraseProgress != null
              ? base.callResponsePhraseProgress
              : payload?.callResponsePhraseProgress
          ) || 0)
        ),
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
  const buildPlaybackLoggingContext = (instrumentIdLike, triggerVolumeLike) => {
    const meta = getInstrumentPlaybackMetadata(instrumentIdLike) || null;
    const triggerVolume = Math.max(0, Number(triggerVolumeLike) || 0);
    const sampleVolumeMultiplier = Math.max(0.0001, Number(meta?.sampleVolumeMultiplier) || 1);
    return {
      resolvedPlaybackInstrumentId: String(meta?.instrumentId || instrumentIdLike || '').trim(),
      playbackKind: String(meta?.playbackKind || '').trim().toLowerCase(),
      sampleVolumeHint: String(meta?.sampleVolumeHint || '').trim(),
      sampleVolumeMultiplier,
      triggerVolume,
      approxPlaybackVolume: triggerVolume * sampleVolumeMultiplier,
    };
  };
  const hasExplicitOctave = (noteLike) => /^([A-Ga-g])([#b]?)(-?\d+)$/.test(String(noteLike || '').trim());
  const enemyForAction = helpers.getSwarmEnemyById?.(ev.actorId) || null;
  const composerEnemyGroups = Array.isArray(state?.composerEnemyGroups) ? state.composerEnemyGroups : [];
  const noteSlotSpawnerExecutionReason = (enemyLike, payload = null) => {
    const enemy = enemyLike && typeof enemyLike === 'object' ? enemyLike : null;
    const musicVoiceKey = String(enemy?.musicVoiceKey || ev?.payload?.musicVoiceKey || '').trim().toLowerCase();
    if (!musicVoiceKey) return;
    try {
      helpers.noteMusicSystemEvent?.('music_slot_spawner_execution_reason', {
        actorId: Math.max(0, Math.trunc(Number(enemy?.id || ev?.actorId) || 0)),
        groupId: Math.max(0, Math.trunc(Number(ev?.payload?.groupId) || 0)),
        musicVoiceKey,
        musicLayer: String(ev?.payload?.musicLayer || '').trim().toLowerCase(),
        continuityId: String(enemy?.musicContinuityId || enemy?.continuityId || '').trim(),
        reason: String(payload?.reason || '').trim().toLowerCase(),
        failureReason: String(payload?.failureReason || '').trim().toLowerCase(),
        instrumentId: String(payload?.instrumentId || '').trim(),
        phase: String(payload?.phase || '').trim().toLowerCase(),
      }, { beatIndex, stepIndex, barIndex });
    } catch {}
  };
  if (actionType === 'projectile' && enemyForAction) {
    const enemyType = String(enemyForAction?.enemyType || '').trim().toLowerCase();
    if (enemyType === 'spawner') actionType = 'spawner-spawn';
    else if (enemyType === 'drawsnake') actionType = 'drawsnake-projectile';
    else if (enemyType === 'composer-group-member') actionType = 'composer-group-projectile';
  }

  if (actionType === 'spawner-spawn') {
    return withPerfSample('pickupsCombat.weaponRuntime.stepChange.processEvents.execute.spawner', () => {
    const enemy = helpers.getSwarmEnemyById?.(ev.actorId);
    if (!enemy || String(enemy?.enemyType || '') !== 'spawner') {
      noteSlotSpawnerExecutionReason(enemy, { reason: 'missing_enemy', failureReason: 'missing_enemy' });
      return false;
    }
    const liveGroup = withPerfSample('pickupsCombat.weaponRuntime.stepChange.processEvents.execute.spawner.group', () => (
      helpers.getEnemyMusicGroup?.(enemy, 'spawner-spawn', { sync: false })
    ));
    const slotOwnedSpawner = !!String(enemy?.musicVoiceKey || '').trim();
    if (slotOwnedSpawner) {
      try {
        helpers.noteMusicSystemEvent?.('music_slot_spawner_stage', {
          stage: 'executed',
          actorId: Math.max(0, Math.trunc(Number(enemy?.id) || 0)),
          groupId: Math.max(0, Math.trunc(Number(ev?.payload?.groupId) || 0)),
          musicVoiceKey: String(enemy?.musicVoiceKey || '').trim().toLowerCase(),
          musicLayer: String(ev?.payload?.musicLayer || '').trim().toLowerCase(),
          continuityId: String(enemy?.musicContinuityId || enemy?.continuityId || '').trim(),
          actionType: 'spawner-spawn',
        }, { beatIndex, stepIndex, barIndex });
      } catch {}
    }
    const group = slotOwnedSpawner
      ? {
        id: 0,
        role: String(ev.role || enemy?.musicalRole || constants?.roles?.bass || 'bass').trim().toLowerCase(),
        actionType: 'spawner-spawn',
        note: String(enemy?.spawnerNoteName || '').trim(),
        instrumentId: String(enemy?.spawnerInstrument || enemy?.musicInstrumentId || enemy?.instrumentId || '').trim(),
        steps: Array.isArray(enemy?.spawnerSteps) ? enemy.spawnerSteps.slice(0, 8) : [],
        noteIndices: Array.isArray(enemy?.spawnerNoteIndices) ? enemy.spawnerNoteIndices.slice(0, 8) : [],
        notePalette: Array.isArray(enemy?.spawnerNotePalette) ? enemy.spawnerNotePalette.slice() : [],
        continuityId: String(enemy?.musicContinuityId || enemy?.continuityId || '').trim(),
        lifecycleState: String(enemy?.lifecycleState || 'active').trim(),
      }
      : (liveGroup || null);
    if (!group) {
      noteSlotSpawnerExecutionReason(enemy, { reason: 'missing_group', failureReason: 'missing_group' });
      return false;
    }
    noteSlotSpawnerExecutionReason(enemy, { reason: 'entered', instrumentId: String(group?.instrumentId || enemy?.spawnerInstrument || '').trim() });
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
      if (!slotOwnedSpawner) {
        enemy.spawnerInstrument = instrumentId;
        enemy.spawnerNoteName = noteName;
      }
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
    if (audioMutedExplicitly) {
      noteSlotSpawnerExecutionReason(enemy, {
        reason: 'audio_muted',
        failureReason: 'audio_muted',
        instrumentId,
      });
    } else if (!shouldTriggerGroupAudio) {
      noteSlotSpawnerExecutionReason(enemy, {
        reason: 'audio_deduped',
        failureReason: 'audio_deduped',
        instrumentId,
      });
    }
    if (shouldTriggerGroupAudio) {
      withPerfSample('pickupsCombat.weaponRuntime.stepChange.processEvents.execute.spawner.audioTrigger', () => {
        try {
          helpers.triggerInstrument?.(instrumentId, noteName, undefined, 'master', {}, triggerVolume);
          audioTriggered = true;
          group.lastAudioDedupKey = audioDedupKey;
          if (
            slotOwnedSpawner
            && String(enemy?.musicVoiceKey || '').trim().toLowerCase() === 'percussion_pulse'
            && !enemy.__bsLoggedFirstIntroPulseNote
            && barIndex < 24
          ) {
            enemy.__bsLoggedFirstIntroPulseNote = true;
            try {
              helpers.noteMusicSystemEvent?.('music_intro_drum_first_note', {
                actorId: Math.max(0, Math.trunc(Number(enemy?.id) || 0)),
                musicVoiceKey: String(enemy?.musicVoiceKey || '').trim().toLowerCase(),
                requestedNote: String(requestedNote || '').trim(),
                resolvedNote: String(noteName || '').trim(),
                instrumentId: String(instrumentId || '').trim(),
                nodeStepIndex,
                introPrimaryLoopBlendWindow: barIndex >= 20 && barIndex < 24,
              }, { beatIndex, stepIndex, barIndex });
            } catch {}
          }
          noteSlotSpawnerExecutionReason(enemy, {
            reason: 'audio_triggered',
            instrumentId,
          });
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
      if (!spawned) {
        noteSlotSpawnerExecutionReason(enemy, {
          reason: 'spawn_link_failed',
          failureReason: 'spawn_link_failed',
          instrumentId,
        });
        return false;
      }
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
          ...buildPlaybackLoggingContext(instrumentId, triggerVolume),
        });
      });
      noteSlotSpawnerExecutionReason(enemy, {
        reason: 'completed_spawned_link',
        instrumentId,
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
        ...buildPlaybackLoggingContext(instrumentId, triggerVolume),
      });
    });
    noteSlotSpawnerExecutionReason(enemy, {
      reason: 'completed_existing_link',
      instrumentId,
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
        ...buildPlaybackLoggingContext(instrumentId, triggerVolume),
      });
    });
    return true;
  });
  }

  if (actionType === 'composer-group-projectile' || actionType === 'composer-group-explosion') {
    return withPerfSample('pickupsCombat.weaponRuntime.stepChange.processEvents.execute.composer', () => {
    let enemy = helpers.getSwarmEnemyById?.(ev.actorId);
    const payload = ev?.payload && typeof ev.payload === 'object' ? ev.payload : {};
    const ghostPlayback = payload?.ghostPlayback === true;
    const payloadGroupId = Math.max(0, Math.trunc(Number(payload?.groupId) || 0));
    const noteComposerExecutionStage = (stage, extra = null) => {
      try {
        helpers.noteMusicSystemEvent?.('music_composer_execution_stage', {
          stage: String(stage || '').trim().toLowerCase(),
          actorId: Math.max(0, Math.trunc(Number(ev?.actorId) || 0)),
          groupId: payloadGroupId,
          actionType,
          ghostPlayback,
          enemyType: String(enemy?.enemyType || '').trim().toLowerCase(),
          hasEnemy: !!enemy,
          hasEnemyEl: !!(enemy?.el instanceof HTMLElement),
          hasGroup: false,
          instrumentId: String(ev?.instrumentId || '').trim(),
          note: String(ev?.note || payload?.requestedNoteRaw || '').trim(),
          musicLayer: String(payload?.musicLayer || '').trim().toLowerCase(),
          callResponseLane: String(payload?.callResponseLane || '').trim().toLowerCase(),
          ...(extra && typeof extra === 'object' ? extra : {}),
        }, { beatIndex, stepIndex, barIndex });
      } catch {}
    };
    const noteIntroSlotExecution = (phase, extra = null) => {
      const payload = ev?.payload && typeof ev.payload === 'object' ? ev.payload : {};
      if (!(barIndex <= 20) || !(payloadGroupId > 0)) return;
      try {
        helpers.noteMusicSystemEvent?.('music_composer_group_state', {
          phase: String(phase || 'execute').trim().toLowerCase(),
          groupId: payloadGroupId,
          actorId: Math.max(0, Math.trunc(Number(ev?.actorId) || 0)),
          role: String(ev?.role || payload?.musicRole || '').trim().toLowerCase(),
          musicLaneId: String(payload?.musicLaneId || payload?.foundationLaneId || '').trim().toLowerCase(),
          instrumentId: String(ev?.instrumentId || '').trim(),
          note: String(ev?.note || payload?.requestedNoteRaw || '').trim(),
          reason: String(payload?.soloCarrierType || '').trim().toLowerCase(),
          stage: String(phase || 'execute').trim().toLowerCase(),
          ...(extra && typeof extra === 'object' ? extra : {}),
        }, { beatIndex, stepIndex, barIndex });
      } catch {}
    };
    const payloadSoloCarrierType = String(ev?.payload?.soloCarrierType || '').trim().toLowerCase();
    const isSquareCandidate = payloadSoloCarrierType === 'rhythm'
      || (
        String(ev?.actionType || '').trim().toLowerCase() === 'composer-group-explosion'
        && String(ev?.instrumentId || '').trim().toUpperCase() === 'BASS TONE 3'
        && String(ev?.note || '').trim().toUpperCase() === 'C3'
      );
    try {
      if (false && isSquareCandidate && typeof globalThis !== 'undefined' && typeof globalThis.console?.log === 'function') {
        globalThis.console.log('[BS-INTRO-DEBUG]', JSON.stringify({
          eventType: 'square_exec_lookup',
          actorId: Math.max(0, Math.trunc(Number(ev?.actorId) || 0)),
          foundEnemy: !!enemy,
          enemyType: String(enemy?.enemyType || '').trim().toLowerCase(),
          enemySoloCarrierType: String(enemy?.soloCarrierType || '').trim().toLowerCase(),
          actionType,
          instrumentId: String(ev?.instrumentId || '').trim(),
          noteName: String(ev?.note || '').trim(),
          payloadSoloCarrierType,
        }));
      }
    } catch {}
    if ((!enemy || String(enemy?.enemyType || '') !== 'composer-group-member') && !ghostPlayback) {
      noteComposerExecutionStage('missing_enemy', {
        failureReason: !enemy ? 'missing_enemy' : 'wrong_enemy_type',
      });
      noteIntroSlotExecution('execute_missing_enemy', {
        admissionReason: !enemy ? 'missing_enemy' : 'wrong_enemy_type',
      });
      return false;
    }
    const group = ghostPlayback
      ? (composerEnemyGroups.find((g) => Math.max(0, Math.trunc(Number(g?.id) || 0)) === payloadGroupId) || null)
      : helpers.getEnemyMusicGroup?.(enemy, actionType);
    try {
      if (false && isSquareCandidate && typeof globalThis !== 'undefined' && typeof globalThis.console?.log === 'function') {
        globalThis.console.log('[BS-INTRO-DEBUG]', JSON.stringify({
          eventType: 'square_exec_group',
          actorId: Math.max(0, Math.trunc(Number(ev?.actorId) || 0)),
          foundGroup: !!group,
          groupId: Math.max(0, Math.trunc(Number(group?.id) || 0)),
          groupSoloCarrierType: String(group?.soloCarrierType || '').trim().toLowerCase(),
          payloadSoloCarrierType: String(ev?.payload?.soloCarrierType || '').trim().toLowerCase(),
        }));
      }
    } catch {}
    if (!group) {
      noteComposerExecutionStage('missing_group', {
        failureReason: 'missing_group',
      });
      noteIntroSlotExecution('execute_missing_group', {
        admissionReason: 'missing_group',
      });
      return false;
    }
    noteComposerExecutionStage('entered', {
      hasGroup: true,
      instrumentId: String(group?.instrumentId || ev?.instrumentId || '').trim(),
    });
    noteIntroSlotExecution('execute_entered', {
      admissionReason: '',
    });
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
    let instrumentId = resolveContinuitySafeExecutionInstrument(
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
    const execSoloType = String(
      enemy?.soloCarrierType
        || ev?.payload?.soloCarrierType
        || group?.soloCarrierType
        || ''
    ).trim().toLowerCase();
    if (enemy && execSoloType && !String(enemy?.soloCarrierType || '').trim()) {
      enemy.soloCarrierType = execSoloType;
    }
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
    const triggerVolume = (execSoloType === 'rhythm'
      ? (Number(constants.spawnerTriggerSoundVolume) || 0.24)
      : 0.62)
      * (duckForPlayer ? (Number(constants.playerMaskDuckEnemyVolumeMult) || 1) : 1)
      * (Number(audioGain) || 0)
      * prominenceGain
      * (0.72 + ((Number(aggressionScale) || 0) * 0.28));
    if (enemy) helpers.syncSingletonEnemyStateFromMusicGroup?.(enemy, group);
    noteExecutedInstrumentChange(instrumentId, enemy || null, group);
    if (enemy) helpers.pulseEnemyMusicalRoleVisual?.(enemy, enemyAudible ? 'strong' : 'soft');
    if (enemyAudible) {
      try {
        if (false && isSquareCandidate && typeof globalThis !== 'undefined' && typeof globalThis.console?.log === 'function') {
          globalThis.console.log('[BS-INTRO-DEBUG]', JSON.stringify({
            eventType: 'square_exec_trigger',
            actorId: Math.max(0, Math.trunc(Number(ev?.actorId) || 0)),
            instrumentId: String(instrumentId || '').trim(),
            noteName: String(noteName || '').trim(),
            triggerVolume: Number(triggerVolume) || 0,
            execSoloType,
          }));
        }
      } catch {}
      try { helpers.triggerInstrument?.(instrumentId, noteName, undefined, 'master', {}, triggerVolume); } catch {}
      noteComposerExecutionStage('audio_triggered', {
        hasGroup: true,
        instrumentId: String(instrumentId || '').trim(),
        note: String(noteName || '').trim(),
        triggerVolume: Number(triggerVolume) || 0,
      });
    } else {
      noteComposerExecutionStage('audio_suppressed', {
        hasGroup: true,
        instrumentId: String(instrumentId || '').trim(),
        note: String(noteName || '').trim(),
        musicProminence: String(musicProminence || '').trim().toLowerCase(),
        triggerVolume: Number(triggerVolume) || 0,
      });
    }
    if (ghostPlayback) {
      logMusicLabExecution({
        sourceSystem: 'group',
        requestedNote,
        resolvedNote: noteName,
        noteWasClamped: requestedNote ? requestedNote !== noteName : false,
        enemyAudible,
        musicProminence,
        enemyType: 'composer-group-member',
        ghostPlayback: true,
        ...buildPlaybackLoggingContext(instrumentId, triggerVolume),
      });
      noteComposerExecutionStage('completed_ghost', {
        hasGroup: true,
        instrumentId: String(instrumentId || '').trim(),
        note: String(noteName || '').trim(),
      });
      noteIntroSlotExecution('execute_completed', {
        admissionReason: 'ghost_playback',
      });
      return true;
    }
    helpers.pulseHitFlash?.(enemy.el);
    helpers.pulseSoloCarrierActivationVisual?.(enemy);
    noteComposerExecutionStage('visual_triggered', {
      hasGroup: true,
      hasEnemyEl: !!(enemy?.el instanceof HTMLElement),
      instrumentId: String(instrumentId || '').trim(),
      note: String(noteName || '').trim(),
    });
    if (execSoloType === 'rhythm') {
      const directPulseDur = Math.max(
        0.22,
        (Number(enemy?.composerActionPulseDur) || Number(constants.composerGroupActionPulseSeconds) || 0.24) * 1.15
      );
      enemy.soloCarrierActivationPulseDur = directPulseDur;
      enemy.soloCarrierActivationPulseT = directPulseDur;
      enemy.soloCarrierActivationPulseScale = Math.max(0.14, Number(enemy?.soloCarrierActivationPulseScale) || 0);
      if (enemy?.el instanceof HTMLElement) {
        enemy.el.classList.add('is-solo-note-active');
        try { enemy.el.style.setProperty('--bs-solo-pulse-level', '1'); } catch {}
      }
      try {
        if (false && typeof globalThis !== 'undefined' && typeof globalThis.console?.log === 'function') {
          globalThis.console.log('[BS-INTRO-DEBUG]', JSON.stringify({
            eventType: 'square_exec_direct_pulse',
            enemyId: Math.trunc(Number(enemy?.id) || 0),
            groupId: Math.trunc(Number(group?.id) || 0),
            soloCarrierType: execSoloType,
            pulseDur: directPulseDur,
            className: enemy?.el instanceof HTMLElement ? String(enemy.el.className || '') : '',
            hasEl: enemy?.el instanceof HTMLElement,
          }));
        }
      } catch {}
    }
    enemy.composerActionPulseDur = Math.max(0.01, Number(enemy?.composerActionPulseDur) || Number(constants.composerGroupActionPulseSeconds) || 0);
    enemy.composerActionPulseT = Math.max(0.01, Number(enemy?.composerActionPulseDur) || Number(constants.composerGroupActionPulseSeconds) || 0);
    const origin = { x: Number(enemy.wx) || 0, y: Number(enemy.wy) || 0 };
    if (actionType === 'composer-group-explosion') {
      helpers.addHostileRedExplosionEffect?.(origin);
      noteComposerExecutionStage('explosion_triggered', {
        hasGroup: true,
        instrumentId: String(instrumentId || '').trim(),
        note: String(noteName || '').trim(),
      });
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
      noteComposerExecutionStage('projectile_triggered', {
        hasGroup: true,
        instrumentId: String(instrumentId || '').trim(),
        note: String(noteName || '').trim(),
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
    noteComposerExecutionStage('completed', {
      hasGroup: true,
      instrumentId: String(instrumentId || '').trim(),
      note: String(noteName || '').trim(),
    });
    noteIntroSlotExecution('execute_completed', {
      admissionReason: '',
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
      ...buildPlaybackLoggingContext(instrumentId, triggerVolume),
    });
    return true;
  });
  }

  return false;
}
