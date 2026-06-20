export function processBeatSwarmStepEventsRuntime(options = null) {
  const constants = options?.constants && typeof options.constants === 'object' ? options.constants : {};
  const helpers = options?.helpers && typeof options.helpers === 'object' ? options.helpers : {};
  const state = options?.state && typeof options.state === 'object' ? options.state : {};
  const getPerfNow = typeof helpers.getPerfNow === 'function'
    ? helpers.getPerfNow
    : (() => (globalThis.performance?.now?.() ?? Date.now()));
  const recordPerfSample = typeof helpers.recordStepEventsPerfSample === 'function'
    ? helpers.recordStepEventsPerfSample
    : (typeof helpers.recordPerfSample === 'function'
      ? helpers.recordPerfSample
      : null)
  const withPerfSample = (name, fn) => {
    if (typeof fn !== 'function') return undefined;
    const startedAt = getPerfNow();
    try {
      return fn();
    } finally {
      const durationMs = Math.max(0, getPerfNow() - startedAt);
      recordPerfSample?.(name, durationMs);
    }
  };
  const createDirectPerfMark = (name) => {
    if (!name || typeof recordPerfSample !== 'function') return () => {};
    const startedAt = getPerfNow();
    return () => {
      const durationMs = Math.max(0, getPerfNow() - startedAt);
      recordPerfSample(name, durationMs);
    };
  };

  const beatIndex = Math.max(0, Math.trunc(Number(state.beatIndex) || 0));
  const stepIndex = Math.max(0, Math.trunc(Number(state.stepIndex) || 0));
  const barIndex = Math.max(0, Math.trunc(Number(state.barIndex) || 0));
  const directorLanePlan = helpers?.director?.getLanePlan?.() || null;
  const entryAudibilityRuntime = state.entryAudibilityRuntime && typeof state.entryAudibilityRuntime === 'object'
    ? state.entryAudibilityRuntime
    : (state.entryAudibilityRuntime = { byKey: new Map(), lastStepIndex: -1 });
  const gainSmoothingRuntime = state.gainSmoothingRuntime && typeof state.gainSmoothingRuntime === 'object'
    ? state.gainSmoothingRuntime
    : (state.gainSmoothingRuntime = { byLineKey: new Map(), lastStepIndex: -1 });
  const centerWorld = state.centerWorld && typeof state.centerWorld === 'object'
    ? state.centerWorld
    : { x: 0, y: 0 };
  const musicModeRuntime = state.musicModeRuntime && typeof state.musicModeRuntime === 'object'
    ? state.musicModeRuntime
    : null;
  const suppressDirectorMusic = state.suppressDirectorMusic === true;
  const suppressedMusicLaneIds = state.suppressedMusicLaneIds instanceof Set
    ? state.suppressedMusicLaneIds
    : new Set(Array.isArray(state.suppressedMusicLaneIds) ? state.suppressedMusicLaneIds : []);
  const isMusicLaneSuppressed = (ev = null) => {
    if (!ev || !suppressedMusicLaneIds.size) return false;
    const payload = ev?.payload && typeof ev.payload === 'object' ? ev.payload : {};
    const explicitLaneId = String(payload.musicLaneId || payload.foundationLaneId || '').trim().toLowerCase();
    const musicLayer = String(payload.musicLayer || '').trim().toLowerCase();
    const role = String(ev?.role || payload.musicRole || '').trim().toLowerCase();
    const inferredLaneId = musicLayer === 'foundation' || role === 'bass'
      ? 'foundation_lane'
      : (musicLayer === 'lead' || role === 'lead'
        ? 'primary_loop_lane'
        : (musicLayer === 'loops' || musicLayer === 'accent' || role === 'accent'
          ? 'secondary_loop_lane'
          : ''));
    const laneId = explicitLaneId || inferredLaneId;
    return !!laneId && suppressedMusicLaneIds.has(laneId);
  };
  const isLaneSuppressed = (laneIdLike = '') => {
    const laneId = String(laneIdLike || '').trim().toLowerCase();
    return !!laneId && suppressedMusicLaneIds.has(laneId);
  };
  const activeMusicMode = String(musicModeRuntime?.activeMusicMode || '').trim().toLowerCase();
  const primaryLoopForegroundProtected = activeMusicMode === 'lead_entry_merge' || activeMusicMode === 'full_texture';
  const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));
  if (!(entryAudibilityRuntime.byKey instanceof Map)) entryAudibilityRuntime.byKey = new Map();
  if (entryAudibilityRuntime.lastStepIndex !== stepIndex) {
    entryAudibilityRuntime.lastStepIndex = stepIndex;
    for (const [entryKey, entry] of entryAudibilityRuntime.byKey.entries()) {
      const lastAudibleStep = Math.max(-1000000, Math.trunc(Number(entry?.lastAudibleStep) || -1000000));
      if ((stepIndex - lastAudibleStep) > 32) entryAudibilityRuntime.byKey.delete(entryKey);
    }
  }
  if (!(gainSmoothingRuntime.byLineKey instanceof Map)) gainSmoothingRuntime.byLineKey = new Map();
  if (gainSmoothingRuntime.lastStepIndex !== stepIndex) {
    gainSmoothingRuntime.lastStepIndex = stepIndex;
    for (const [lineKey, entry] of gainSmoothingRuntime.byLineKey.entries()) {
      const lastSeenStep = Math.max(-1000000, Math.trunc(Number(entry?.lastSeenStep) || -1000000));
      if ((stepIndex - lastSeenStep) > 16) gainSmoothingRuntime.byLineKey.delete(lineKey);
    }
  }

  let spawnerStepStats = { activeSpawners: 0, triggeredSpawners: 0, spawnedEnemies: 0 };
  const onboardingDirective = helpers.getOnboardingReadabilityDirective?.(barIndex) || null;
  const layerStepStats = {
    foundation: { full: 0, quiet: 0, trace: 0, suppressed: 0 },
    loops: { full: 0, quiet: 0, trace: 0, suppressed: 0 },
    sparkle: { full: 0, quiet: 0, trace: 0, suppressed: 0 },
  };
  const readabilityStepStats = {
    enemyEvents: 0,
    enemyForegroundEvents: 0,
    enemyNonFoundationForegroundEvents: 0,
    enemyCompetingDuringPlayer: 0,
    sameRegisterOverlapDuringPlayer: 0,
    playerStepEmitted: false,
    playerLikelyAudible: false,
  };
  let queuedStepEvents = 0;
  let drainedStepEvents = 0;
  const playerStepDirective = helpers.getPlayerInstrumentStepDirective?.(stepIndex, beatIndex) || {
    emit: true,
    mode: 'free_fire',
    reason: 'default',
    musicRole: 'support',
    musicLayer: 'loops',
    presentation: 'supportive',
    registerTarget: 'mid_high',
    volumeMult: 0.82,
    structureIntent: 'intro',
    effectiveIntent: 'intro',
  };

  const playerTuneAuthoredStep = helpers.isPlayerWeaponTuneStepAuthoredActive?.(stepIndex) === true;
  const shouldEmitPlayerStep = (() => {
    if (!(playerStepDirective.emit === true || playerTuneAuthoredStep)) return false;
    const mode = String(playerStepDirective.mode || '').trim().toLowerCase();
    if (!playerTuneAuthoredStep && mode === 'guided_fire') return (stepIndex % 2) === 0;
    return true;
  })();
  const playerLikelyAudible = shouldEmitPlayerStep
    && helpers.isPlayerWeaponStepLikelyAudible?.(stepIndex) === true;
  let spawnerStep = null;
  let rawEnemyEvents = [];
  let filteredEnemyEvents = [];
  const normalizeGateStage = (stageLike = '') => {
    const raw = String(stageLike || '').trim().toLowerCase();
    if (raw === 'intro' || raw === 'silent' || raw === 'low' || raw === 'medium' || raw === 'build' || raw === 'peak' || raw === 'release' || raw === 'settle') return raw;
    return '';
  };
  const getEnemyMusicActionGateState = () => {
    const arrangementState = directorLanePlan?.__arrangementState && typeof directorLanePlan.__arrangementState === 'object'
      ? directorLanePlan.__arrangementState
      : (musicModeRuntime?.level1ArrangementState && typeof musicModeRuntime.level1ArrangementState === 'object'
        ? musicModeRuntime.level1ArrangementState
        : null);
    const level1Contract = directorLanePlan?.__level1Contract && typeof directorLanePlan.__level1Contract === 'object'
      ? directorLanePlan.__level1Contract
      : null;
    const auditionStage = normalizeGateStage(arrangementState?.intensityAuditionSection);
    const phraseIntent = String(arrangementState?.phraseIntent || state?.structureIntentRuntime?.intent || '').trim().toLowerCase();
    const sectionIntent = String(arrangementState?.sectionIntent || activeMusicMode || '').trim().toLowerCase();
    const tensionProfile = String(arrangementState?.tensionProfile || '').trim().toLowerCase();
    const energy = Math.max(0, Math.min(1, Number(arrangementState?.energy) || 0));
    const stage = auditionStage || (() => {
      if (phraseIntent === 'intro' || sectionIntent === 'intro_teach' || sectionIntent === 'groove_establish') return 'intro';
      if (phraseIntent === 'recovery' || tensionProfile === 'release' || sectionIntent === 'break') return 'release';
      if (phraseIntent === 'cadence' || sectionIntent === 'peak' || energy >= 0.86) return 'peak';
      if (phraseIntent === 'build' || tensionProfile === 'tense' || energy >= 0.64) return 'build';
      if (energy >= 0.38) return 'medium';
      return 'low';
    })();
    const rhythmFamily = (() => {
      if (stage === 'intro') return 'set_piece';
      if (stage === 'low' || stage === 'release') return 'anchor';
      if (stage === 'medium' || stage === 'settle') return 'pulse';
      if (stage === 'build') return 'syncopated';
      if (stage === 'peak') return 'dense';
      return 'pulse';
    })();
    return {
      stage,
      rhythmFamily,
      phraseIntent,
      sectionIntent,
      energy,
      sectionBar: Math.max(0, Math.trunc(Number(arrangementState?.intensityAuditionSectionBar) || 0)),
      contractAllowsSparkle: !level1Contract || level1Contract.allowSparkle === true,
      contractAllowsAnswer: !level1Contract || level1Contract.contractAnswerActive === true,
      stepInBar: ((stepIndex % 8) + 8) % 8,
    };
  };
  const getEnemyMusicActionGateLane = (ev) => {
    const payload = ev?.payload && typeof ev.payload === 'object' ? ev.payload : {};
    const layer = String(payload?.musicLayer || '').trim().toLowerCase();
    const laneId = String(payload?.musicLaneId || payload?.foundationLaneId || '').trim().toLowerCase();
    const voiceKey = String(payload?.musicVoiceKey || '').trim().toLowerCase();
    const callResponseLane = String(payload?.callResponseLane || '').trim().toLowerCase();
    if (laneId === 'foundation_lane' || layer === 'foundation') return 'foundation';
    if (voiceKey === 'percussion_backbeat' || voiceKey === 'counter_rhythm' || laneId === 'secondary_loop_lane') return 'secondary';
    if (voiceKey === 'answer_ornament' || callResponseLane === 'response' || laneId === 'sparkle_lane' || layer === 'sparkle') return 'ornament';
    if (laneId === 'primary_loop_lane' || callResponseLane === 'call') return 'lead';
    if (layer === 'loops') return 'support';
    return 'other';
  };
  const isContractBlockedOrnamentEvent = (ev) => {
    if (!ev || typeof ev !== 'object') return false;
    const payload = ev?.payload && typeof ev.payload === 'object' ? ev.payload : {};
    const lane = getEnemyMusicActionGateLane(ev);
    if (lane !== 'ornament') return false;
    if (payload?.directorAuthorizedAnswerOrnament === true) return false;
    const sourceSystem = String(ev?.sourceSystem || payload?.sourceSystem || '').trim().toLowerCase();
    const action = String(ev?.actionType || '').trim().toLowerCase();
    if (sourceSystem === 'player' || sourceSystem === 'death' || action === 'enemy-death-accent') return false;
    const gateState = getEnemyMusicActionGateState();
    return gateState.stage !== 'peak'
      || gateState.contractAllowsSparkle !== true
      || gateState.contractAllowsAnswer !== true;
  };
  const noteContractBlockedOrnamentEvent = (phase, ev) => {
    try {
      const payload = ev?.payload && typeof ev.payload === 'object' ? ev.payload : {};
      const gateState = getEnemyMusicActionGateState();
      helpers.noteMusicSystemEvent?.('music_contract_ornament_blocked', {
        phase: String(phase || '').trim().toLowerCase(),
        stepIndex,
        beatIndex,
        barIndex,
        stage: gateState.stage,
        contractAllowsSparkle: gateState.contractAllowsSparkle === true,
        contractAllowsAnswer: gateState.contractAllowsAnswer === true,
        musicLaneId: String(payload?.musicLaneId || '').trim().toLowerCase(),
        musicLayer: String(payload?.musicLayer || '').trim().toLowerCase(),
        musicVoiceKey: String(payload?.musicVoiceKey || '').trim().toLowerCase(),
        callResponseLane: String(payload?.callResponseLane || '').trim().toLowerCase(),
        actionType: String(ev?.actionType || '').trim().toLowerCase(),
        sourceSystem: String(ev?.sourceSystem || payload?.sourceSystem || '').trim().toLowerCase(),
      }, { beatIndex, stepIndex, barIndex });
    } catch {}
  };
  const getEnemyMusicActionGateAllowedSteps = (stage, lane, gateState = null) => {
    const barInPhrase = ((Math.max(0, Math.trunc(Number(barIndex) || 0)) % 4) + 4) % 4;
    if (stage === 'intro') return null;
    if (stage === 'silent') return [];
    if (stage === 'release') {
      const sectionBar = Math.max(0, Math.trunc(Number(gateState?.sectionBar) || 0));
      if (sectionBar === 0) {
        if (lane === 'lead') return [0, 2, 4, 6];
        if (lane === 'secondary') return [2, 6];
        if (lane === 'ornament') return [7];
        if (lane === 'foundation') return [0, 4];
        return [];
      }
      if (sectionBar < 5) {
        if (lane === 'lead') return sectionBar < 3 ? [0, 4] : [4];
        if (lane === 'secondary') return sectionBar < 3 ? [4] : [];
        if (lane === 'foundation') return sectionBar < 3 ? [0, 4] : [0];
        return [];
      }
      if (lane === 'lead') return barInPhrase === 3 ? [4] : [];
      if (lane === 'foundation') return [0];
      return [];
    }
    if (lane === 'foundation') return null;
    if (stage === 'low') {
      if (lane === 'secondary') return [0, 4];
      return [];
    }
    if (stage === 'settle') {
      if (lane === 'lead') return [0, 2, 4, 6];
      if (lane === 'ornament') return barInPhrase === 3 ? [2, 6] : [];
      return [0, 2, 4, 6];
    }
    if (stage === 'medium') {
      if (lane === 'lead') {
        if (barInPhrase === 3) return [0, 4, 6];
        if (barInPhrase === 1) return [0, 4];
        return [0, 2, 4, 6];
      }
      if (lane === 'ornament') return [2, 6];
      return [0, 2, 4, 6];
    }
    if (stage === 'build') {
      if (lane === 'ornament') {
        const sectionBar = Math.max(0, Math.trunc(Number(gateState?.sectionBar) || 0));
        if (sectionBar >= 10) return [3, 7];
        if (sectionBar >= 8) return [7];
        return [];
      }
      if (lane === 'secondary') {
        if (barInPhrase === 0) return [4];
        if (barInPhrase === 1) return [4];
        if (barInPhrase === 2) return [2, 6];
        return [1, 5];
      }
      if (lane === 'lead') {
        if (barInPhrase === 0) return [0, 2, 4, 6];
        if (barInPhrase === 1) return [0, 2, 4, 6];
        if (barInPhrase === 2) return [0, 2, 4, 6];
        return [0, 2, 4, 6, 7];
      }
      if (barInPhrase === 0) return [0, 4, 6];
      if (barInPhrase === 1) return [0, 2, 4, 5, 6];
      if (barInPhrase === 2) return [0, 2, 3, 4, 5, 6];
      return [0, 1, 2, 3, 4, 5, 6, 7];
    }
    if (stage === 'peak') {
      if (lane === 'ornament') return [7];
      if (lane === 'secondary') return [6];
      if (lane === 'lead') return [0, 1, 2, 4, 6, 7];
      return [0, 4];
    }
    return [0, 2, 4, 6];
  };
  const applyEnemyMusicActionGate = (eventsLike = []) => {
    const events = Array.isArray(eventsLike) ? eventsLike : [];
    if (!events.length) return events;
    const gateState = getEnemyMusicActionGateState();
    const kept = [];
    let allowedCount = 0;
    let blockedCount = 0;
    for (const ev of events) {
      const payload = ev?.payload && typeof ev.payload === 'object' ? ev.payload : {};
      const action = String(ev?.actionType || '').trim().toLowerCase();
      const sourceSystem = String(ev?.sourceSystem || payload?.sourceSystem || '').trim().toLowerCase();
      const authoringClass = String(ev?.authoringClass || payload?.authoringClass || '').trim().toLowerCase();
      const combatAuthored = sourceSystem === 'player'
        || sourceSystem === 'death'
        || authoringClass === 'gameplayauthored'
        || action === 'player-weapon-step'
        || action === 'spawner-spawn'
        || action === 'enemy-death-accent'
        || action.includes('chain')
        || action.includes('impact')
        || action.includes('collision');
      const gameplayProtected = sourceSystem === 'player'
        || sourceSystem === 'death'
        || authoringClass === 'gameplayauthored'
        || action === 'player-weapon-step'
        || action === 'enemy-death-accent'
        || action.includes('chain')
        || action.includes('impact')
        || action.includes('collision');
      const gateProtected = (gateState.stage === 'silent' ? gameplayProtected : combatAuthored)
        || gateState.stage === 'intro'
        || (gateState.stage === 'intro' && (
          payload?.introDrumProtected === true
          || payload?.introPrimaryLoopBlendWindow === true
        ));
      const lane = getEnemyMusicActionGateLane(ev);
      const directorLaneBlocked = (() => {
        if (gateProtected) return false;
        if (lane !== 'ornament') return false;
        const sparkleActive = sparkleLanePlan?.active === true;
        const answerActive = answerLanePlan?.active === true;
        const stageAllowsOrnament = gateState.stage === 'peak';
        return !stageAllowsOrnament
          || !(sparkleActive && answerActive)
          || gateState.contractAllowsSparkle !== true
          || gateState.contractAllowsAnswer !== true;
      })();
      const allowedSteps = gateProtected ? null : getEnemyMusicActionGateAllowedSteps(gateState.stage, lane, gateState);
      const allowed = !directorLaneBlocked && (!Array.isArray(allowedSteps) || allowedSteps.includes(gateState.stepInBar));
      if (allowed) {
        allowedCount += 1;
        kept.push({
          ...ev,
          payload: {
            ...payload,
            enemyMusicActionGateStage: gateState.stage,
            enemyMusicActionGateRhythmFamily: gateState.rhythmFamily,
            enemyMusicActionGateLane: lane,
          },
        });
      } else {
        blockedCount += 1;
      }
      try {
        helpers.noteMusicSystemEvent?.('music_enemy_action_gate_decision', {
          allowed,
          stage: gateState.stage,
          rhythmFamily: gateState.rhythmFamily,
          lane,
          actionType: action,
          actorId: Math.max(0, Math.trunc(Number(ev?.actorId) || 0)),
          groupId: Math.max(0, Math.trunc(Number(payload?.groupId) || 0)),
          musicLayer: String(payload?.musicLayer || '').trim().toLowerCase(),
          musicLaneId: String(payload?.musicLaneId || payload?.foundationLaneId || '').trim().toLowerCase(),
          stepInBar: gateState.stepInBar,
          barInPhrase: ((Math.max(0, Math.trunc(Number(barIndex) || 0)) % 4) + 4) % 4,
          allowedSteps: Array.isArray(allowedSteps) ? allowedSteps.join(',') : 'protected',
          reason: gateProtected ? 'protected_or_intro' : (directorLaneBlocked ? 'director_lane_inactive' : (allowed ? 'grid_match' : 'grid_miss')),
        }, { beatIndex, stepIndex, barIndex });
      } catch {}
    }
    if (allowedCount > 0 || blockedCount > 0) {
      try {
        helpers.noteMusicSystemEvent?.('music_enemy_action_gate_step', {
          stage: gateState.stage,
          rhythmFamily: gateState.rhythmFamily,
          stepInBar: gateState.stepInBar,
          barInPhrase: ((Math.max(0, Math.trunc(Number(barIndex) || 0)) % 4) + 4) % 4,
          allowedCount,
          blockedCount,
          inputCount: events.length,
          outputCount: kept.length,
        }, { beatIndex, stepIndex, barIndex });
      } catch {}
    }
    return kept;
  };
  const noteSlotSpawnerStage = (stage, eventsLike = null) => {
    const events = Array.isArray(eventsLike) ? eventsLike : [];
    for (const ev of events) {
      const payload = ev?.payload && typeof ev.payload === 'object' ? ev.payload : {};
      const musicVoiceKey = String(payload?.musicVoiceKey || '').trim().toLowerCase();
      if (!musicVoiceKey) continue;
      try {
        helpers.noteMusicSystemEvent?.('music_slot_spawner_stage', {
          stage: String(stage || '').trim().toLowerCase(),
          actorId: Math.max(0, Math.trunc(Number(ev?.actorId) || 0)),
          groupId: Math.max(0, Math.trunc(Number(payload?.groupId) || 0)),
          musicVoiceKey,
          musicLayer: String(payload?.musicLayer || '').trim().toLowerCase(),
          continuityId: String(payload?.continuityId || '').trim(),
          actionType: String(ev?.actionType || '').trim().toLowerCase(),
        }, { beatIndex, stepIndex, barIndex });
      } catch {}
    }
  };
  {
    const finishCollectPerf = createDirectPerfMark('pickupsCombat.weaponRuntime.stepChange.processEvents.collect');
    let spawnerEvents = [];
    let drawSnakeEvents = [];
    let composerEvents = [];
    if (!suppressDirectorMusic) {
      const finishCollectSpawnerPerf = createDirectPerfMark('pickupsCombat.weaponRuntime.stepChange.processEvents.collect.spawner');
      spawnerStep = helpers.collectSpawnerStepBeatEvents?.(stepIndex, beatIndex);
      finishCollectSpawnerPerf();
      if (spawnerStep?.stats && typeof spawnerStep.stats === 'object') {
        spawnerStepStats = spawnerStep.stats;
      }
      spawnerEvents = Array.isArray(spawnerStep?.events) ? spawnerStep.events : [];

      const finishCollectDrawSnakePerf = createDirectPerfMark('pickupsCombat.weaponRuntime.stepChange.processEvents.collect.drawsnake');
      drawSnakeEvents = helpers.collectDrawSnakeStepBeatEvents?.(stepIndex, beatIndex) || [];
      finishCollectDrawSnakePerf();

      const finishCollectComposerPerf = createDirectPerfMark('pickupsCombat.weaponRuntime.stepChange.processEvents.collect.composer');
      composerEvents = helpers.collectComposerGroupStepBeatEvents?.(stepIndex, beatIndex) || [];
      finishCollectComposerPerf();
    }

    rawEnemyEvents = [
      ...spawnerEvents,
      ...drawSnakeEvents,
      ...composerEvents,
    ].filter((ev) => !isMusicLaneSuppressed(ev));
    noteSlotSpawnerStage('raw', rawEnemyEvents);

    let enemyKeepCount = 0;
    if (playerLikelyAudible) {
      const finishCollectFilterPerf = createDirectPerfMark('pickupsCombat.weaponRuntime.stepChange.processEvents.collect.playerFilter');
      filteredEnemyEvents = rawEnemyEvents.filter((ev) => {
        const keep = helpers.shouldKeepEnemyEventDuringPlayerStep?.(ev, enemyKeepCount) === true;
        if (keep) enemyKeepCount += 1;
        return keep;
      });
      finishCollectFilterPerf();
    } else {
      filteredEnemyEvents = rawEnemyEvents;
    }
    noteSlotSpawnerStage('filtered', filteredEnemyEvents);
    finishCollectPerf();
  }

  const withPlayerDuck = (ev) => {
    if (!playerLikelyAudible || !ev || typeof ev !== 'object') return ev;
    const action = String(ev.actionType || '').trim().toLowerCase();
    const payload = ev?.payload && typeof ev.payload === 'object' ? ev.payload : {};
    const authoringClass = String(ev?.authoringClass || payload?.authoringClass || '').trim().toLowerCase();
    const sourceSystem = String(ev?.sourceSystem || payload?.sourceSystem || '').trim().toLowerCase();
    if (
      !action
      || action === 'player-weapon-step'
      || action === 'spawner-spawn'
      || action === 'drawsnake-projectile'
      || action === 'composer-group-projectile'
      || action === 'composer-group-explosion'
      || ((sourceSystem === 'player' || sourceSystem === 'death' || authoringClass === 'gameplayauthored') && (
        action.includes('projectile')
        || action.includes('explosion')
        || action.includes('chain')
        || action.includes('impact')
        || action.includes('collision')
        || action.includes('hitscan')
        || action.includes('beam')
        || action.includes('boomerang')
      ))
    ) return ev;
    return {
      ...ev,
      payload: {
        ...payload,
        duckForPlayer: true,
      },
    };
  };

  const withEnemyProminence = (ev, enemyIndex = 0, totalEnemyEvents = 1, prominenceState = null) => {
    if (!ev || typeof ev !== 'object') return ev;
    const action = String(ev.actionType || '').trim().toLowerCase();
    if (!action || action === 'player-weapon-step') return ev;
    const payload = ev?.payload && typeof ev.payload === 'object' ? ev.payload : {};
    const layerRaw = String(helpers.getEnemyEventMusicLayer?.(ev) || payload.musicLayer || 'sparkle').trim().toLowerCase();
    const musicLayer = (layerRaw === 'foundation' || layerRaw === 'loops' || layerRaw === 'sparkle') ? layerRaw : 'sparkle';
    const identity = helpers.getEnemyMusicIdentityProfile?.({
      enemyType: String(ev?.enemyType || payload?.enemyType || '').trim().toLowerCase(),
      role: String(ev?.role || '').trim().toLowerCase(),
    }) || null;
    const prominenceRaw = String(helpers.getEnemyEventMusicProminence?.(ev, {
      playerLikelyAudible,
      enemyIndex,
      totalEnemyEvents,
      barIndex,
      musicLayer,
      foregroundAssigned: Math.max(0, Math.trunc(Number(prominenceState?.foregroundAssigned) || 0)),
      sparkleAssigned: Math.max(0, Math.trunc(Number(prominenceState?.sparkleAssigned) || 0)),
      foregroundIdentityCount: Math.max(0, Math.trunc(Number(prominenceState?.foregroundIdentityKeys?.size) || 0)),
      loopForegroundIdentityCount: Math.max(0, Math.trunc(Number(prominenceState?.loopForegroundIdentityKeys?.size) || 0)),
      foundationAssigned: prominenceState?.foundationAssigned === true,
    }) || payload.musicProminence || 'full').trim().toLowerCase();
    const musicProminence = (
      prominenceRaw === 'suppressed'
      || prominenceRaw === 'trace'
      || prominenceRaw === 'quiet'
      || prominenceRaw === 'full'
    ) ? prominenceRaw : 'full';
    return {
      ...ev,
      payload: {
        ...payload,
        musicLayer,
        musicProminence,
        ...(musicLayer === 'foundation'
          ? (() => {
            const lane = helpers.getFoundationLaneSnapshot?.(stepIndex, barIndex) || null;
            return lane
              ? {
                foundationLaneId: String(lane.laneId || 'foundation_lane'),
                foundationPhraseId: String(lane.phraseId || 'foundation_fallback'),
                foundationPatternKey: String(lane.patternKey || ''),
                foundationPlayerThemeSource: String(lane.playerThemeSource || ''),
                foundationRawPatternKey: String(lane.rawPatternKey || ''),
                foundationShapedPatternKey: String(lane.shapedPatternKey || lane.patternKey || ''),
                foundationInterpretationMode: String(lane.interpretationMode || ''),
                foundationPhrasePartIndex: Math.max(0, Math.trunc(Number(lane.phrasePartIndex) || 0)),
                foundationStepIndex: Math.max(0, Math.trunc(Number(lane.stepIndex) || 0)),
              }
              : {};
          })()
          : {}),
        musicRole: String(identity?.role || ev?.role || payload?.musicRole || '').trim().toLowerCase(),
        musicRegister: String(identity?.register || payload?.musicRegister || '').trim().toLowerCase(),
        musicInstrumentFamily: String(identity?.instrumentFamily || payload?.musicInstrumentFamily || '').trim().toLowerCase(),
        onboardingPriority: Math.max(0, Math.min(1, Number(identity?.onboardingPriority) || Number(payload?.onboardingPriority) || 0)),
        onboardingPhase: String(onboardingDirective?.id || payload?.onboardingPhase || '').trim().toLowerCase(),
      },
    };
  };

  let effectiveEnemyEvents = Array.isArray(filteredEnemyEvents) ? filteredEnemyEvents.slice() : [];
  const foundationLaneSnapshot = helpers.getFoundationLaneSnapshot?.(stepIndex, barIndex) || null;
  const foundationLaneActive = foundationLaneSnapshot?.isActiveStep === true;
  const primaryLoopLaneRuntime = state?.musicLaneRuntime && typeof state.musicLaneRuntime === 'object'
    ? state.musicLaneRuntime.primaryLoopLane
    : null;
  const secondaryLoopLaneRuntime = state?.musicLaneRuntime && typeof state.musicLaneRuntime === 'object'
    ? state.musicLaneRuntime.secondaryLoopLane
    : null;
  const foundationLaneRuntime = state?.musicLaneRuntime && typeof state.musicLaneRuntime === 'object'
    ? state.musicLaneRuntime.foundationLane
    : null;
  const getDirectorLanePlanForMusicLane = (laneId = '') => {
    const key = String(laneId || '').trim().toLowerCase();
    if (!directorLanePlan || typeof directorLanePlan !== 'object') return null;
    if (key === 'foundation_lane') return directorLanePlan.foundation || null;
    if (key === 'primary_loop_lane') return directorLanePlan.primary_loop || null;
    if (key === 'secondary_loop_lane') return directorLanePlan.secondary_loop || null;
    if (key === 'sparkle_lane') return directorLanePlan.sparkle || null;
    return null;
  };
  const sparkleLanePlan = getDirectorLanePlanForMusicLane('sparkle_lane');
  const answerLanePlan = directorLanePlan && typeof directorLanePlan === 'object'
    ? (directorLanePlan.answer || null)
    : null;
  const currentEnemyMusicActionGateState = getEnemyMusicActionGateState();
  const getDirectorMotifBedStageState = () => {
    const arrangementState = directorLanePlan?.__arrangementState && typeof directorLanePlan.__arrangementState === 'object'
      ? directorLanePlan.__arrangementState
      : (musicModeRuntime?.level1ArrangementState && typeof musicModeRuntime.level1ArrangementState === 'object'
        ? musicModeRuntime.level1ArrangementState
        : null);
    const stage = normalizeGateStage(
      arrangementState?.intensityAuditionSection
      || currentEnemyMusicActionGateState?.stage
    );
    const hasExplicitAuditionSection = !!String(arrangementState?.intensityAuditionSection || '').trim();
    const rawSectionBar = Math.trunc(Number(arrangementState?.intensityAuditionSectionBar) || 0);
    const sectionBar = stage && !hasExplicitAuditionSection && rawSectionBar <= 0 && barIndex > 0
      ? barIndex
      : Math.max(0, rawSectionBar);
    return {
      arrangementState,
      stage,
      sectionBar,
    };
  };
  const notePlayerAccentMotifTrack = (status = '', fields = null) => {
    const payload = fields && typeof fields === 'object' ? fields : {};
    try {
      helpers.noteMusicSystemEvent?.('music_player_accent_motif_track', {
        status: String(status || '').trim().toLowerCase(),
        themeId: 'accentRhythm',
        stage: String(payload.stage || '').trim().toLowerCase(),
        sectionBar: Math.max(0, Math.trunc(Number(payload.sectionBar) || 0)),
        barIndex,
        localStep: Math.max(0, Math.trunc(Number(payload.localStep) || 0)),
        phrasePartIndex: Math.max(0, Math.trunc(Number(payload.phrasePartIndex) || 0)),
        patternKey: String(payload.patternKey || '').trim(),
        rawPatternKey: String(payload.rawPatternKey || '').trim(),
        shapedPatternKey: String(payload.shapedPatternKey || '').trim(),
        interpretationMode: String(payload.interpretationMode || '').trim().toLowerCase(),
        expectedHit: payload.expectedHit === true,
        emittedHit: payload.emittedHit === true,
        riffHit: payload.riffHit === true,
        instrumentId: String(payload.instrumentId || '').trim(),
        noteName: String(payload.noteName || '').trim(),
        reason: String(payload.reason || '').trim().toLowerCase(),
      }, {
        beatIndex,
        stepIndex,
        barIndex,
      });
    } catch {}
  };
  const notePlayerBassMotifTrack = (status = '', fields = null) => {
    const payload = fields && typeof fields === 'object' ? fields : {};
    try {
      helpers.noteMusicSystemEvent?.('music_player_bass_motif_track', {
        status: String(status || '').trim().toLowerCase(),
        themeId: 'bassDrive',
        stage: String(payload.stage || '').trim().toLowerCase(),
        sectionBar: Math.max(0, Math.trunc(Number(payload.sectionBar) || 0)),
        barIndex,
        localStep: Math.max(0, Math.trunc(Number(payload.localStep) || 0)),
        phrasePartIndex: Math.max(0, Math.trunc(Number(payload.phrasePartIndex) || 0)),
        patternKey: String(payload.patternKey || '').trim(),
        rawPatternKey: String(payload.rawPatternKey || '').trim(),
        shapedPatternKey: String(payload.shapedPatternKey || '').trim(),
        interpretationMode: String(payload.interpretationMode || '').trim().toLowerCase(),
        expectedHit: payload.expectedHit === true,
        emittedHit: payload.emittedHit === true,
        instrumentId: String(payload.instrumentId || '').trim(),
        noteName: String(payload.noteName || '').trim(),
        actorId: Math.max(0, Math.trunc(Number(payload.actorId) || 0)),
        groupId: Math.max(0, Math.trunc(Number(payload.groupId) || 0)),
        reason: String(payload.reason || '').trim().toLowerCase(),
      }, {
        beatIndex,
        stepIndex,
        barIndex,
      });
    } catch {}
  };
  const answerOrnamentAllowed = sparkleLanePlan?.active === true
    && answerLanePlan?.active === true
    && currentEnemyMusicActionGateState.stage === 'peak'
    && currentEnemyMusicActionGateState.contractAllowsSparkle === true
    && currentEnemyMusicActionGateState.contractAllowsAnswer === true;
  const primaryLoopLaneActive = primaryLoopLaneRuntime
    && typeof primaryLoopLaneRuntime === 'object'
    && (
      Math.max(0, Math.trunc(Number(primaryLoopLaneRuntime.performerEnemyId) || 0)) > 0
      || Math.max(0, Math.trunc(Number(primaryLoopLaneRuntime.performerGroupId) || 0)) > 0
    )
    && String(primaryLoopLaneRuntime.continuityId || '').trim();
  const secondaryLoopLaneActive = secondaryLoopLaneRuntime
    && typeof secondaryLoopLaneRuntime === 'object'
    && (
      Math.max(0, Math.trunc(Number(secondaryLoopLaneRuntime.performerEnemyId) || 0)) > 0
      || Math.max(0, Math.trunc(Number(secondaryLoopLaneRuntime.performerGroupId) || 0)) > 0
    )
    && String(secondaryLoopLaneRuntime.continuityId || '').trim();
  const resolveProtectedLaneClaim = (ev, laneRuntime = null, laneId = '') => {
    if (!ev || typeof ev !== 'object' || !laneRuntime || typeof laneRuntime !== 'object') return false;
    const payload = ev?.payload && typeof ev.payload === 'object' ? ev.payload : {};
    const explicitLaneId = String(payload?.musicLaneId || payload?.foundationLaneId || '').trim().toLowerCase();
    if (laneId && explicitLaneId === laneId) return true;
    const continuityId = String(payload?.continuityId || '').trim().toLowerCase();
    const groupId = Math.max(0, Math.trunc(Number(payload?.groupId) || 0));
    const actorId = Math.max(0, Math.trunc(Number(ev?.actorId) || 0));
    const laneContinuityId = String(laneRuntime?.continuityId || '').trim().toLowerCase();
    const laneGroupId = Math.max(0, Math.trunc(Number(laneRuntime?.performerGroupId) || 0));
    const laneActorId = Math.max(0, Math.trunc(Number(laneRuntime?.performerEnemyId) || 0));
    if (laneContinuityId && continuityId && continuityId === laneContinuityId) return true;
    if (laneGroupId > 0 && groupId > 0 && groupId === laneGroupId) return true;
    if (laneActorId > 0 && actorId > 0 && actorId === laneActorId) return true;
    return false;
  };
  const isPrimaryLoopLaneCandidate = (ev) => {
    if (!primaryLoopLaneActive || !ev || typeof ev !== 'object') return false;
    const payload = ev?.payload && typeof ev.payload === 'object' ? ev.payload : {};
    const action = String(ev?.actionType || '').trim().toLowerCase();
    const actionIsLoopLike = action === 'drawsnake-projectile'
      || action === 'composer-group-projectile'
      || action === 'composer-group-explosion';
    if (!actionIsLoopLike) return false;
    return resolveProtectedLaneClaim(ev, primaryLoopLaneRuntime, 'primary_loop_lane');
  };
  const isGroupedComposerLaneEvent = (ev) => {
    if (!ev || typeof ev !== 'object') return false;
    const action = String(ev?.actionType || '').trim().toLowerCase();
    if (action !== 'composer-group-projectile' && action !== 'composer-group-explosion') return false;
    const payload = ev?.payload && typeof ev.payload === 'object' ? ev.payload : {};
    return Math.max(0, Math.trunc(Number(payload?.groupId) || 0)) > 0;
  };
  const isSecondaryLoopLaneCandidate = (ev) => {
    if (!secondaryLoopLaneActive || !ev || typeof ev !== 'object') return false;
    const payload = ev?.payload && typeof ev.payload === 'object' ? ev.payload : {};
    const action = String(ev?.actionType || '').trim().toLowerCase();
    const actionIsLoopLike = action === 'spawner-spawn'
      || action === 'drawsnake-projectile'
      || action === 'composer-group-projectile'
      || action === 'composer-group-explosion';
    if (!actionIsLoopLike) return false;
    return resolveProtectedLaneClaim(ev, secondaryLoopLaneRuntime, 'secondary_loop_lane');
  };
  const resolveEntryAudibilityKey = (ev) => {
    if (!ev || typeof ev !== 'object') return '';
    const payload = ev?.payload && typeof ev.payload === 'object' ? ev.payload : {};
    const action = String(ev?.actionType || '').trim().toLowerCase();
    if (
      action !== 'spawner-spawn'
      && action !== 'drawsnake-projectile'
      && action !== 'composer-group-projectile'
      && action !== 'composer-group-explosion'
    ) return '';
    const continuityId = String(payload?.continuityId || '').trim().toLowerCase();
    const laneId = String(payload?.musicLaneId || payload?.foundationLaneId || '').trim().toLowerCase();
    const actorId = Math.max(0, Math.trunc(Number(ev?.actorId) || 0));
    return String(laneId || continuityId || `${action}:${actorId}`).trim().toLowerCase();
  };
  const isContinuityPreservingRestatement = (ev) => {
    if (!ev || typeof ev !== 'object') return false;
    const payload = ev?.payload && typeof ev.payload === 'object' ? ev.payload : {};
    const continuityId = String(payload?.continuityId || '').trim();
    if (!continuityId) return false;
    const identityChangeReason = String(payload?.identityChangeReason || '').trim().toLowerCase();
    return identityChangeReason === 'phrase_boundary_mutation'
      || identityChangeReason === 'section_restatement';
  };
  const isFreshEntryAudibility = (ev) => {
    if (isContinuityPreservingRestatement(ev)) return false;
    const entryKey = resolveEntryAudibilityKey(ev);
    if (!entryKey) return false;
    const entry = entryAudibilityRuntime.byKey.get(entryKey);
    const entryWindowSteps = Math.max(1, Math.trunc(Number(constants.entryAudibilityWindowSteps) || 8));
    const minAudibleEvents = Math.max(1, Math.trunc(Number(constants.entryAudibilityMinAudibleEvents) || 3));
    if (!entry) return true;
    const firstSeenStep = Math.max(-1000000, Math.trunc(Number(entry?.firstSeenStep) || -1000000));
    const audibleCount = Math.max(0, Math.trunc(Number(entry?.audibleCount) || 0));
    return (stepIndex - firstSeenStep) <= entryWindowSteps || audibleCount < minAudibleEvents;
  };
  const isEntryPhraseAudibility = (ev) => {
    if (!ev || typeof ev !== 'object') return false;
    if (isContinuityPreservingRestatement(ev)) return false;
    const action = String(ev?.actionType || '').trim().toLowerCase();
    if (
      action !== 'spawner-spawn'
      && action !== 'drawsnake-projectile'
      && action !== 'composer-group-projectile'
      && action !== 'composer-group-explosion'
    ) return false;
    const entryKey = resolveEntryAudibilityKey(ev);
    if (!entryKey) return false;
    const entry = entryAudibilityRuntime.byKey.get(entryKey);
    const phraseWindowSteps = Math.max(1, Math.trunc(Number(constants.entryAudibilityPhraseWindowSteps) || 16));
    const minPhraseAudibleEvents = Math.max(1, Math.trunc(Number(constants.entryAudibilityPhraseMinAudibleEvents) || 6));
    if (!entry) return true;
    const firstSeenStep = Math.max(-1000000, Math.trunc(Number(entry?.firstSeenStep) || -1000000));
    const audibleCount = Math.max(0, Math.trunc(Number(entry?.audibleCount) || 0));
    return (stepIndex - firstSeenStep) <= phraseWindowSteps || audibleCount < minPhraseAudibleEvents;
  };
  const isVisibleGameplayLinkedCue = (ev) => {
    if (!ev || typeof ev !== 'object') return false;
    const payload = ev?.payload && typeof ev.payload === 'object' ? ev.payload : {};
    const action = String(ev?.actionType || '').trim().toLowerCase();
    const actorId = Math.max(0, Math.trunc(Number(ev?.actorId) || 0));
    if (!(actorId > 0)) return false;
    if (
      action === 'spawner-spawn'
      || action === 'drawsnake-projectile'
      || action === 'composer-group-projectile'
      || action === 'composer-group-explosion'
    ) return true;
    return payload?.musicLaneDriven === true;
  };
  const scorePrimaryLoopLaneCandidate = (ev, idx = 0) => {
    const payload = ev?.payload && typeof ev.payload === 'object' ? ev.payload : {};
    const action = String(ev?.actionType || '').trim().toLowerCase();
    const continuityId = String(payload?.continuityId || '').trim().toLowerCase();
    const groupId = Math.max(0, Math.trunc(Number(payload?.groupId) || 0));
    const actorId = Math.max(0, Math.trunc(Number(ev?.actorId) || 0));
    const laneContinuityId = String(primaryLoopLaneRuntime?.continuityId || '').trim().toLowerCase();
    const laneGroupId = Math.max(0, Math.trunc(Number(primaryLoopLaneRuntime?.performerGroupId) || 0));
    const laneActorId = Math.max(0, Math.trunc(Number(primaryLoopLaneRuntime?.performerEnemyId) || 0));
    let score = 0;
    if (laneContinuityId && continuityId === laneContinuityId) score += 500;
    if (laneGroupId > 0 && groupId === laneGroupId) score += 220;
    if (laneActorId > 0 && actorId === laneActorId) score += 180;
    if (action === 'drawsnake-projectile') score += 80;
    if (action === 'composer-group-projectile') score += 60;
    if (action === 'composer-group-explosion') score += 20;
    const audioGain = Number(payload?.audioGain);
    if (Number.isFinite(audioGain)) score += Math.max(0, Math.min(1, audioGain)) * 10;
    score -= idx * 0.01;
    return score;
  };
  const scoreStructuralContinuityCandidate = (ev, idx = 0) => {
    const payload = ev?.payload && typeof ev.payload === 'object' ? ev.payload : {};
    const layer = String(payload?.musicLayer || '').trim().toLowerCase();
    const laneId = String(payload?.musicLaneId || payload?.foundationLaneId || '').trim().toLowerCase();
    const continuityId = String(payload?.continuityId || '').trim().toLowerCase();
    const action = String(ev?.actionType || '').trim().toLowerCase();
    let score = 0;
    if (laneId === 'primary_loop_lane') score += 600;
    if (laneId === 'foundation_lane') score += 560;
    if (laneId === 'secondary_loop_lane') score += 520;
    if (continuityId) score += 80;
    if (layer === 'foundation') score += 220;
    else if (layer === 'loops') score += 180;
    if (payload?.bassKeepaliveInjected === true) score -= 240;
    if (action === 'composer-group-projectile') score += 40;
    if (action === 'drawsnake-projectile') score += 30;
    if (action === 'spawner-spawn') score += 20;
    const audioGain = Number(payload?.audioGain);
    if (Number.isFinite(audioGain)) score += Math.max(0, Math.min(1, audioGain)) * 12;
    score -= idx * 0.01;
    return score;
  };
  const structuralContinuityCollapseKey = (ev) => {
    if (!ev || typeof ev !== 'object') return '';
    const payload = ev?.payload && typeof ev.payload === 'object' ? ev.payload : {};
    const action = String(ev?.actionType || '').trim().toLowerCase();
    if (isGroupedComposerLaneEvent(ev)) return '';
    if (payload?.introDrumProtected === true) return '';
    const layer = String(payload?.musicLayer || '').trim().toLowerCase();
    if (layer !== 'foundation' && layer !== 'loops') return '';
    const callResponseLane = String(payload?.callResponseLane || '').trim().toLowerCase();
    if (callResponseLane === 'call' || callResponseLane === 'response') return '';
    const laneId = String(payload?.musicLaneId || payload?.foundationLaneId || '').trim().toLowerCase();
    const continuityId = String(payload?.continuityId || '').trim().toLowerCase();
    const role = String(payload?.musicRole || ev?.role || '').trim().toLowerCase();
    if (
      laneId === 'primary_loop_lane'
      || laneId === 'foundation_lane'
      || laneId === 'secondary_loop_lane'
    ) {
      return `${laneId}|${continuityId || 'continuity'}|${action || 'action'}`;
    }
    if (!continuityId) return '';
    return `${layer}|${continuityId}|${role || 'role'}|${action || 'action'}`;
  };
  {
  const finishShapePerf = createDirectPerfMark('pickupsCombat.weaponRuntime.stepChange.processEvents.shape');
  {
    const finishShapeCollapsePerf = createDirectPerfMark('pickupsCombat.weaponRuntime.stepChange.processEvents.shape.collapse');
    const primaryLoopLaneCandidates = primaryLoopLaneActive
      ? effectiveEnemyEvents.filter((ev) => isPrimaryLoopLaneCandidate(ev))
      : [];
    const groupedPrimaryLoopCandidates = primaryLoopLaneCandidates.filter((ev) => isGroupedComposerLaneEvent(ev));
    const collapsiblePrimaryLoopCandidates = primaryLoopLaneCandidates.filter((ev) => !isGroupedComposerLaneEvent(ev));
    if (collapsiblePrimaryLoopCandidates.length > 1) {
      const ranked = collapsiblePrimaryLoopCandidates
        .map((ev, idx) => ({ ev, idx, score: scorePrimaryLoopLaneCandidate(ev, idx) }))
        .sort((a, b) => (b.score - a.score) || (a.idx - b.idx));
      const chosenPrimaryLoop = ranked[0]?.ev || null;
      if (chosenPrimaryLoop) {
        const chosenPayload = chosenPrimaryLoop?.payload && typeof chosenPrimaryLoop.payload === 'object'
          ? chosenPrimaryLoop.payload
          : {};
        effectiveEnemyEvents = effectiveEnemyEvents.filter((ev) => !collapsiblePrimaryLoopCandidates.includes(ev));
        effectiveEnemyEvents.push({
          ...chosenPrimaryLoop,
          payload: {
            ...chosenPayload,
            continuityId: String(chosenPayload.continuityId || primaryLoopLaneRuntime?.continuityId || '').trim(),
            musicLayer: 'loops',
            musicLaneId: 'primary_loop_lane',
            musicLaneDriven: true,
          },
        });
        try {
          helpers.noteMusicSystemEvent?.('music_primary_loop_lane_collapse', {
            candidateCount: collapsiblePrimaryLoopCandidates.length,
            keptActorId: Math.max(0, Math.trunc(Number(chosenPrimaryLoop?.actorId) || 0)),
            keptActionType: String(chosenPrimaryLoop?.actionType || '').trim().toLowerCase(),
            continuityId: String(chosenPayload?.continuityId || primaryLoopLaneRuntime?.continuityId || '').trim(),
          }, { beatIndex, stepIndex, barIndex });
        } catch {}
      }
    } else if (collapsiblePrimaryLoopCandidates.length === 1) {
      const chosenPrimaryLoop = collapsiblePrimaryLoopCandidates[0];
      const chosenPayload = chosenPrimaryLoop?.payload && typeof chosenPrimaryLoop.payload === 'object'
        ? chosenPrimaryLoop.payload
        : {};
      effectiveEnemyEvents = effectiveEnemyEvents.map((ev) => (
        ev === chosenPrimaryLoop
          ? {
            ...ev,
            payload: {
              ...chosenPayload,
              continuityId: String(chosenPayload.continuityId || primaryLoopLaneRuntime?.continuityId || '').trim(),
              musicLayer: 'loops',
              musicLaneId: 'primary_loop_lane',
              musicLaneDriven: true,
            },
          }
          : ev
      ));
    }
    const secondaryLoopLaneCandidates = secondaryLoopLaneActive
      ? effectiveEnemyEvents.filter((ev) => isSecondaryLoopLaneCandidate(ev))
      : [];
    const groupedSecondaryLoopCandidates = secondaryLoopLaneCandidates.filter((ev) => isGroupedComposerLaneEvent(ev));
    const collapsibleSecondaryLoopCandidates = secondaryLoopLaneCandidates.filter((ev) => !isGroupedComposerLaneEvent(ev));
    if (collapsibleSecondaryLoopCandidates.length > 1) {
      const ranked = collapsibleSecondaryLoopCandidates
        .map((ev, idx) => ({ ev, idx, score: scoreStructuralContinuityCandidate(ev, idx) }))
        .sort((a, b) => (b.score - a.score) || (a.idx - b.idx));
      const chosenSecondaryLoop = ranked[0]?.ev || null;
      if (chosenSecondaryLoop) {
        const chosenPayload = chosenSecondaryLoop?.payload && typeof chosenSecondaryLoop.payload === 'object'
          ? chosenSecondaryLoop.payload
          : {};
        effectiveEnemyEvents = effectiveEnemyEvents.filter((ev) => !collapsibleSecondaryLoopCandidates.includes(ev));
        effectiveEnemyEvents.push({
          ...chosenSecondaryLoop,
          payload: {
            ...chosenPayload,
            continuityId: String(chosenPayload.continuityId || secondaryLoopLaneRuntime?.continuityId || '').trim(),
            musicLayer: 'loops',
            musicLaneId: 'secondary_loop_lane',
            musicLaneDriven: true,
          },
        });
      }
    } else if (collapsibleSecondaryLoopCandidates.length === 1) {
      const chosenSecondaryLoop = collapsibleSecondaryLoopCandidates[0];
      const chosenPayload = chosenSecondaryLoop?.payload && typeof chosenSecondaryLoop.payload === 'object'
        ? chosenSecondaryLoop.payload
        : {};
      effectiveEnemyEvents = effectiveEnemyEvents.map((ev) => (
        ev === chosenSecondaryLoop
          ? {
            ...ev,
            payload: {
              ...chosenPayload,
              continuityId: String(chosenPayload.continuityId || secondaryLoopLaneRuntime?.continuityId || '').trim(),
              musicLayer: 'loops',
              musicLaneId: 'secondary_loop_lane',
              musicLaneDriven: true,
            },
          }
          : ev
      ));
    }
    const foundationCandidates = effectiveEnemyEvents.filter((ev) => {
      const payload = ev?.payload && typeof ev.payload === 'object' ? ev.payload : {};
      const action = String(ev?.actionType || '').trim().toLowerCase();
      const explicitLayer = String(payload?.musicLayer || '').trim().toLowerCase();
      const actionIsFoundationLike = action === 'composer-group-projectile'
        || (action === 'spawner-spawn' && (!explicitLayer || explicitLayer === 'foundation'));
      if (!actionIsFoundationLike && String(payload?.musicLayer || '').trim().toLowerCase() !== 'foundation') return false;
      return resolveProtectedLaneClaim(ev, foundationLaneRuntime, 'foundation_lane');
    });
    const groupedFoundationCandidates = foundationCandidates.filter((ev) => isGroupedComposerLaneEvent(ev));
    const collapsibleFoundationCandidates = foundationCandidates.filter((ev) => !isGroupedComposerLaneEvent(ev));
    if (collapsibleFoundationCandidates.length > 1) {
      const scoreFoundationCandidate = (ev, idx = 0) => {
        const payload = ev?.payload && typeof ev.payload === 'object' ? ev.payload : {};
        const action = String(ev?.actionType || '').trim().toLowerCase();
        let score = 0;
        if (payload?.bassKeepaliveInjected === true) score -= 500;
        if (action === 'composer-group-projectile') score += 180;
        else if (action === 'spawner-spawn') score += 120;
        else if (action === 'drawsnake-projectile') score += 80;
        const continuityId = String(payload?.continuityId || '').trim();
        if (continuityId) score += 20;
        const audioGain = Number(payload?.audioGain);
        if (Number.isFinite(audioGain)) score += Math.max(0, Math.min(1, audioGain)) * 10;
        score -= idx * 0.01;
        return score;
      };
      const ranked = collapsibleFoundationCandidates
        .map((ev, idx) => ({ ev, idx, score: scoreFoundationCandidate(ev, idx) }))
        .sort((a, b) => (b.score - a.score) || (a.idx - b.idx));
      const chosenFoundation = ranked[0]?.ev || null;
      effectiveEnemyEvents = effectiveEnemyEvents.filter((ev) => {
        if (isGroupedComposerLaneEvent(ev)) return true;
        const payload = ev?.payload && typeof ev.payload === 'object' ? ev.payload : {};
        const action = String(ev?.actionType || '').trim().toLowerCase();
        const explicitLayer = String(payload?.musicLayer || '').trim().toLowerCase();
        const isFoundation = (
          String(payload?.musicLayer || '').trim().toLowerCase() === 'foundation'
          || (action === 'spawner-spawn' && (!explicitLayer || explicitLayer === 'foundation'))
          || action === 'composer-group-projectile'
        ) && resolveProtectedLaneClaim(ev, foundationLaneRuntime, 'foundation_lane');
        return !isFoundation || ev === chosenFoundation;
      });
      try {
        helpers.noteMusicSystemEvent?.('music_foundation_candidate_collapse', {
          candidateCount: collapsibleFoundationCandidates.length,
          groupedCandidateCount: groupedFoundationCandidates.length,
          keptActorId: Math.max(0, Math.trunc(Number(chosenFoundation?.actorId) || 0)),
          keptActionType: String(chosenFoundation?.actionType || '').trim().toLowerCase(),
        }, { beatIndex, stepIndex, barIndex });
      } catch {}
    }
    finishShapeCollapsePerf();
  }
  const hasBassEnemyEvent = effectiveEnemyEvents.some((ev) => String(ev?.role || '').trim().toLowerCase() === 'bass');
  const hasProtectedFoundationEvent = effectiveEnemyEvents.some((ev) => {
    const payload = ev?.payload && typeof ev.payload === 'object' ? ev.payload : {};
    const action = String(ev?.actionType || '').trim().toLowerCase();
    const explicitLayer = String(payload?.musicLayer || '').trim().toLowerCase();
    const actionIsFoundationLike = action === 'composer-group-projectile'
      || (action === 'spawner-spawn' && (!explicitLayer || explicitLayer === 'foundation'));
    if (!actionIsFoundationLike && String(payload?.musicLayer || '').trim().toLowerCase() !== 'foundation') return false;
    return resolveProtectedLaneClaim(ev, foundationLaneRuntime, 'foundation_lane');
  });
  if (hasBassEnemyEvent && typeof helpers.noteNaturalBassStep === 'function') {
    try { helpers.noteNaturalBassStep(stepIndex); } catch {}
  }
  {
  const finishShapeEmittersPerf = createDirectPerfMark('pickupsCombat.weaponRuntime.stepChange.processEvents.shape.emitters');
    if (!suppressDirectorMusic && !isLaneSuppressed('foundation_lane') && foundationLaneActive && !hasProtectedFoundationEvent && typeof helpers.createBassFoundationKeepaliveEvent === 'function') {
      const finishShapeEmittersBassPerf = createDirectPerfMark('pickupsCombat.weaponRuntime.stepChange.processEvents.shape.emitters.bass');
      const keepalive = helpers.createBassFoundationKeepaliveEvent({
        beatIndex,
        stepIndex,
        barIndex,
        centerWorld,
        playerLikelyAudible,
        forceImmediate: true,
      });
      if (keepalive && typeof keepalive === 'object') {
        const finishShapeEmittersBassReplacePerf = createDirectPerfMark('pickupsCombat.weaponRuntime.stepChange.processEvents.shape.emitters.bassReplace');
        effectiveEnemyEvents = effectiveEnemyEvents.filter((ev) => {
          const payload = ev?.payload && typeof ev.payload === 'object' ? ev.payload : {};
          const role = String(ev?.role || payload?.musicRole || '').trim().toLowerCase();
          const explicitLayer = String(payload?.musicLayer || '').trim().toLowerCase();
          if (role !== 'bass') return true;
          // Preserve explicit loop-layer drum companions; foundation recovery should only replace
          // missing foundation material, not wipe the backbeat slot.
          return explicitLayer === 'loops' || explicitLayer === 'sparkle';
        });
        effectiveEnemyEvents.push(keepalive);
        try { helpers.noteNaturalBassStep?.(stepIndex); } catch {}
        finishShapeEmittersBassReplacePerf();
      }
      finishShapeEmittersBassPerf();
    } else if (!suppressDirectorMusic && !isLaneSuppressed('foundation_lane') && !hasBassEnemyEvent && typeof helpers.createBassFoundationKeepaliveEvent === 'function') {
      const finishShapeEmittersBassPerf = createDirectPerfMark('pickupsCombat.weaponRuntime.stepChange.processEvents.shape.emitters.bass');
      const keepalive = helpers.createBassFoundationKeepaliveEvent({
        beatIndex,
        stepIndex,
        barIndex,
        centerWorld,
        playerLikelyAudible,
        forceImmediate: false,
      });
      if (keepalive && typeof keepalive === 'object') {
        effectiveEnemyEvents.push(keepalive);
      }
      finishShapeEmittersBassPerf();
    }
    if (!suppressDirectorMusic && typeof helpers.createPrimaryLoopLaneEvent === 'function') {
      const finishShapeEmittersLoopPerf = createDirectPerfMark('pickupsCombat.weaponRuntime.stepChange.processEvents.shape.emitters.loop');
      const primaryLoopEvent = helpers.createPrimaryLoopLaneEvent({
        beatIndex,
        stepIndex,
        barIndex,
        centerWorld,
        playerLikelyAudible,
      });
      if (primaryLoopEvent && typeof primaryLoopEvent === 'object') {
        const finishShapeEmittersLoopReplacePerf = createDirectPerfMark('pickupsCombat.weaponRuntime.stepChange.processEvents.shape.emitters.loopReplace');
        effectiveEnemyEvents = effectiveEnemyEvents.filter((ev) => !isPrimaryLoopLaneCandidate(ev));
        effectiveEnemyEvents.push(primaryLoopEvent);
        finishShapeEmittersLoopReplacePerf();
      }
      finishShapeEmittersLoopPerf();
    }
    const finishShapeStructuralCollapsePerf = createDirectPerfMark('pickupsCombat.weaponRuntime.stepChange.processEvents.shape.structuralCollapse');
    const bestStructuralByKey = new Map();
    for (let idx = 0; idx < effectiveEnemyEvents.length; idx += 1) {
      const ev = effectiveEnemyEvents[idx];
      const collapseKey = structuralContinuityCollapseKey(ev);
      if (!collapseKey) continue;
      const scored = {
        ev,
        idx,
        score: scoreStructuralContinuityCandidate(ev, idx),
      };
      const prev = bestStructuralByKey.get(collapseKey);
      if (!prev || scored.score > prev.score) bestStructuralByKey.set(collapseKey, scored);
    }
    if (bestStructuralByKey.size > 0) {
      const beforeCount = effectiveEnemyEvents.length;
      effectiveEnemyEvents = effectiveEnemyEvents.filter((ev) => {
        const collapseKey = structuralContinuityCollapseKey(ev);
        if (!collapseKey) return true;
        return bestStructuralByKey.get(collapseKey)?.ev === ev;
      });
      const removedCount = Math.max(0, beforeCount - effectiveEnemyEvents.length);
      if (removedCount > 0) {
        try {
          helpers.noteMusicSystemEvent?.('music_structural_continuity_collapse', {
            removedCount,
            survivingCount: effectiveEnemyEvents.length,
            collapsedKeys: bestStructuralByKey.size,
          }, { beatIndex, stepIndex, barIndex });
        } catch {}
      }
    }
    finishShapeStructuralCollapsePerf();
    finishShapeEmittersPerf();
    }
    noteSlotSpawnerStage('shaped', effectiveEnemyEvents);
    effectiveEnemyEvents = applyEnemyMusicActionGate(effectiveEnemyEvents);
    if (typeof helpers.getPlayerLeadThemePrimaryStep === 'function') {
      const leadThemeStep = helpers.getPlayerLeadThemePrimaryStep(barIndex, stepIndex, currentEnemyMusicActionGateState.stage);
      if (leadThemeStep && typeof leadThemeStep === 'object') {
        const leadThemeStepActive = leadThemeStep.active === true;
        const leadThemeLiteralRest = String(leadThemeStep.interpretationMode || '').trim().toLowerCase() === 'literal_statement'
          && !leadThemeStepActive;
        const isLeadThemePrimaryTarget = (ev) => {
          if (!ev || typeof ev !== 'object') return false;
          const payload = ev?.payload && typeof ev.payload === 'object' ? ev.payload : {};
          const musicLaneId = String(payload.musicLaneId || payload.foundationLaneId || '').trim().toLowerCase();
          if (musicLaneId === 'primary_loop_lane') return true;
          if (isPrimaryLoopLaneCandidate(ev)) return true;
          const action = String(ev?.actionType || '').trim().toLowerCase();
          const role = String(ev?.role || payload.musicRole || '').trim().toLowerCase();
          const layer = String(payload.musicLayer || '').trim().toLowerCase();
          const loopLikeAction = action === 'composer-group-projectile'
            || action === 'composer-group-explosion'
            || action === 'drawsnake-projectile';
          return loopLikeAction && role === 'lead' && (layer === 'loops' || !layer);
        };
        effectiveEnemyEvents = effectiveEnemyEvents
          .filter((ev) => {
            return !(leadThemeLiteralRest && isLeadThemePrimaryTarget(ev));
          })
          .map((ev) => {
            const payload = ev?.payload && typeof ev.payload === 'object' ? ev.payload : {};
            if (!isLeadThemePrimaryTarget(ev)) return ev;
            const nextPayload = {
              ...payload,
              musicLayer: String(payload.musicLayer || 'loops').trim().toLowerCase() || 'loops',
              musicLaneId: 'primary_loop_lane',
              musicLaneDriven: true,
              leadPlayerThemeSource: 'leadTheme',
              leadThemeInterpretationMode: String(leadThemeStep.interpretationMode || '').trim().toLowerCase(),
              leadThemePartIndex: Math.max(0, Math.trunc(Number(leadThemeStep.phrasePartIndex) || 0)),
              leadThemeStepIndex: Math.max(0, Math.trunc(Number(leadThemeStep.step) || 0)),
              leadThemePatternKey: String(leadThemeStep.patternKey || '').trim().toLowerCase(),
              leadThemeContourKey: String(leadThemeStep.contourKey || '').trim().toLowerCase(),
              leadThemeRawStepActive: leadThemeStepActive,
              leadThemeRawNote: String(leadThemeStep.rawNote || '').trim(),
            };
            if (leadThemeStepActive && String(leadThemeStep.note || '').trim()) {
              nextPayload.requestedNoteRaw = String(leadThemeStep.note || '').trim();
              return {
                ...ev,
                note: String(leadThemeStep.note || '').trim(),
                payload: nextPayload,
              };
            }
            return {
              ...ev,
              payload: nextPayload,
            };
          });
      }
    }
    noteSlotSpawnerStage('gated', effectiveEnemyEvents);
    finishShapePerf();
  }

  let stepEvents = [];
  {
  const finishArbitratePerf = createDirectPerfMark('pickupsCombat.weaponRuntime.stepChange.processEvents.arbitrate');
  const prominenceState = {
    foregroundAssigned: 0,
    sparkleAssigned: 0,
    foundationAssigned: false,
    foregroundIdentityKeys: new Set(),
    loopForegroundIdentityKeys: new Set(),
  };
  const profiledEnemyEvents = effectiveEnemyEvents.map((ev, idx) => {
    const profiled = withEnemyProminence(withPlayerDuck(ev), idx, filteredEnemyEvents.length, prominenceState);
    const payload = profiled?.payload && typeof profiled.payload === 'object' ? profiled.payload : {};
    const layer = String(payload.musicLayer || 'sparkle').trim().toLowerCase();
    const musicLaneId = String(payload.musicLaneId || '').trim().toLowerCase();
    const laneDrivenPrimaryLoop = musicLaneId === 'primary_loop_lane';
    const prominence = String(payload.musicProminence || 'full').trim().toLowerCase();
    const safeLayer = (layer === 'foundation' || layer === 'loops' || layer === 'sparkle') ? layer : 'sparkle';
    const foundationInterpretationMode = String(
      payload.foundationInterpretationMode
      || (safeLayer === 'foundation' ? foundationLaneSnapshot?.interpretationMode : '')
      || ''
    ).trim().toLowerCase();
    const foundationPhraseId = String(
      payload.foundationPhraseId
      || (safeLayer === 'foundation' ? foundationLaneSnapshot?.phraseId : '')
      || ''
    ).trim().toLowerCase();
    const safeProminence = (
      prominence === 'suppressed' || prominence === 'trace' || prominence === 'quiet' || prominence === 'full'
    ) ? prominence : 'full';
    const isPlayerBassFoundation = safeLayer === 'foundation'
      && foundationPhraseId.startsWith('player_bass_drive_');
    const isPlayerBassLiteralStatement = isPlayerBassFoundation
      && (
        foundationInterpretationMode === 'literal_statement'
        || (!foundationInterpretationMode && barIndex >= 12 && barIndex < 20)
      );
    const foundationAssignedBefore = prominenceState.foundationAssigned === true;
    const deconflictedProminence = (() => {
      if (currentEnemyMusicActionGateState.stage === 'peak' && safeLayer === 'loops' && laneDrivenPrimaryLoop) return 'full';
      if (!playerLikelyAudible) return safeProminence;
      if (safeProminence !== 'full' && safeProminence !== 'quiet') return safeProminence;
      if (isPlayerBassFoundation) return 'full';
      // Preserve the tune skeleton under player fire: foundation stays anchored,
      // one loop voice can remain quiet, sparkle stays background-only.
      if (safeLayer === 'foundation' && safeProminence === 'full') return 'full';
      if (safeLayer === 'loops' && laneDrivenPrimaryLoop && primaryLoopForegroundProtected) return 'full';
      if (safeLayer === 'loops' && laneDrivenPrimaryLoop) return 'quiet';
      if (safeLayer === 'loops') return 'quiet';
      if (safeLayer === 'sparkle') return 'trace';
      return 'quiet';
    })();
    if (deconflictedProminence === 'full') prominenceState.foregroundAssigned += 1;
    if (deconflictedProminence === 'full') {
      const identityEnemyType = String(profiled?.enemyType || payload?.enemyType || 'unknown').trim().toLowerCase() || 'unknown';
      const identityRole = String(payload?.musicRole || profiled?.role || 'accent').trim().toLowerCase() || 'accent';
      const identityKey = `${identityEnemyType}|${identityRole}|${safeLayer}`;
      if (identityKey) {
        prominenceState.foregroundIdentityKeys.add(identityKey);
        if (safeLayer === 'loops') prominenceState.loopForegroundIdentityKeys.add(identityKey);
      }
    }
    if (safeLayer === 'sparkle' && deconflictedProminence !== 'suppressed') prominenceState.sparkleAssigned += 1;
    if (safeLayer === 'foundation' && deconflictedProminence !== 'suppressed') prominenceState.foundationAssigned = true;
    if (deconflictedProminence === safeProminence) return profiled;
    return {
      ...profiled,
      payload: {
        ...payload,
        musicProminence: deconflictedProminence,
      },
    };
  });

  const currentForegroundIdentityKey = String(state?.loopAdmissionRuntime?.currentForegroundIdentityKey || '').trim().toLowerCase();
  const currentForegroundIdentityLayer = String(state?.loopAdmissionRuntime?.currentForegroundIdentityLayer || '').trim().toLowerCase();
  const currentForegroundIdentityStartStep = Math.max(
    -1,
    Math.trunc(Number(state?.loopAdmissionRuntime?.currentForegroundIdentityStartStep) || -1)
  );
  const structureIntent = state?.structureIntentRuntime && typeof state.structureIntentRuntime === 'object'
    ? state.structureIntentRuntime
    : null;
  const structureIntentName = String(structureIntent?.intent || '').trim().toLowerCase();
  const preDropActive = structureIntent?.preDropActive === true;
  const peakActive = structureIntentName === 'peak';
  const normalizeRegisterClass = (registerLike = '') => {
    const raw = String(registerLike || '').trim().toLowerCase();
    if (raw === 'sub') return 'low';
    if (raw === 'mid_high' || raw === 'mid-high' || raw === 'midhigh') return 'high';
    if (raw === 'low' || raw === 'mid' || raw === 'high') return raw;
    return '';
  };
  const getRoleRegisterPenalty = ({
    layer = '',
    role = '',
    register = '',
    isPrimaryLoopLaneEvent = false,
    callResponseLane = '',
  }) => {
    const registerClass = normalizeRegisterClass(register);
    if (!registerClass) return 0;
    if (layer === 'foundation') {
      if (registerClass === 'low') return 0;
      if (registerClass === 'mid') return 110;
      return 180;
    }
    if (layer === 'loops') {
      if (isPrimaryLoopLaneEvent || role === 'lead' || role === 'foreground') {
        if (registerClass === 'mid') return 0;
        if (registerClass === 'high') return 35;
        return 140;
      }
      if (callResponseLane === 'call' || callResponseLane === 'response' || role === 'support') {
        if (registerClass === 'high') return 0;
        if (registerClass === 'mid') return 55;
        return 150;
      }
      if (registerClass === 'low') return 85;
      return 0;
    }
    if (layer === 'sparkle') {
      if (registerClass === 'high') return 0;
      if (registerClass === 'mid') return 30;
      return 90;
    }
    return 0;
  };
  const loopLengthSteps = Math.max(1, Math.trunc(Number(constants?.loopLengthSteps) || 8));
  const loopEstablishingWindowSteps = 16;
  const prominenceRank = { suppressed: 0, trace: 1, quiet: 2, full: 3 };
  const denseArrangementStage = currentEnemyMusicActionGateState.stage === 'build'
    || currentEnemyMusicActionGateState.stage === 'peak';
  const releaseArrangementStage = currentEnemyMusicActionGateState.stage === 'release';
  const layerBudgets = {
    foundation: 1,
    loops: denseArrangementStage ? 1 : (currentForegroundIdentityLayer === 'loops' ? 1 : 2),
    sparkle: currentEnemyMusicActionGateState.stage === 'peak' ? 1 : 0,
  };
  const sparkleAccentByAction = new Map();
  const foundationStepIndexNow = Math.max(0, Math.trunc(Number(foundationLaneSnapshot?.stepIndex) || 0));
  const profiledAnnotated = profiledEnemyEvents.map((ev, idx) => {
    const payload = ev?.payload && typeof ev.payload === 'object' ? ev.payload : {};
    const musicVoiceKey = String(payload.musicVoiceKey || '').trim().toLowerCase();
    const isProtectedIntroDrum = payload?.introDrumProtected === true;
    const layer = String(payload.musicLayer || 'sparkle').trim().toLowerCase();
    const safeLayer = (layer === 'foundation' || layer === 'loops' || layer === 'sparkle') ? layer : 'sparkle';
    const prominence = String(payload.musicProminence || 'full').trim().toLowerCase();
    const safeProminence = (
      prominence === 'suppressed' || prominence === 'trace' || prominence === 'quiet' || prominence === 'full'
    ) ? prominence : 'full';
    const role = String(payload.musicRole || ev?.role || '').trim().toLowerCase();
    const register = String(payload.musicRegister || '').trim().toLowerCase();
    const callResponseLane = String(payload.callResponseLane || '').trim().toLowerCase();
    const enemyType = String(ev?.enemyType || payload?.enemyType || '').trim().toLowerCase();
    const musicLaneId = String(payload.musicLaneId || '').trim().toLowerCase();
    const foundationInterpretationMode = String(
      payload.foundationInterpretationMode
      || (safeLayer === 'foundation' ? foundationLaneSnapshot?.interpretationMode : '')
      || ''
    ).trim().toLowerCase();
    const foundationPhraseId = String(
      payload.foundationPhraseId
      || (safeLayer === 'foundation' ? foundationLaneSnapshot?.phraseId : '')
      || ''
    ).trim().toLowerCase();
    const directorLane = getDirectorLanePlanForMusicLane(musicLaneId);
    const isPrimaryLoopLaneEvent = musicLaneId === 'primary_loop_lane';
    const continuityId = String(payload.continuityId || '').trim().toLowerCase();
    const noteResolved = String(ev?.noteResolved || ev?.note || payload?.noteResolved || payload?.requestedNoteRaw || '').trim().toLowerCase();
    const identityKey = [
      isPrimaryLoopLaneEvent ? 'primary_loop_lane' : continuityId,
      isPrimaryLoopLaneEvent ? 'primary_loop_lane' : (enemyType || 'unknown'),
      role || 'accent',
      safeLayer,
    ].filter(Boolean).join('|');
    const isCurrentForegroundLoop = safeLayer === 'loops'
      && currentForegroundIdentityLayer === 'loops'
      && !!currentForegroundIdentityKey
      && identityKey === currentForegroundIdentityKey;
    const isCompetingForegroundLoop = safeLayer === 'loops'
      && currentForegroundIdentityLayer === 'loops'
      && !!currentForegroundIdentityKey
      && !!identityKey
      && identityKey !== currentForegroundIdentityKey;
    const isEstablishingForegroundLoop = isCurrentForegroundLoop
      && currentForegroundIdentityStartStep >= 0
      && (stepIndex - currentForegroundIdentityStartStep) < loopEstablishingWindowSteps;
    const currentForegroundHeldLoops = currentForegroundIdentityStartStep >= 0 && stepIndex > currentForegroundIdentityStartStep
      ? Math.max(0, Math.floor((stepIndex - currentForegroundIdentityStartStep) / loopLengthSteps))
      : 0;
    const foregroundLockLoops = Math.max(0, Math.trunc(Number(constants.foregroundLockLoops) || 0));
    const foregroundLockActive = isCompetingForegroundLoop && currentForegroundHeldLoops < foregroundLockLoops;
    const isFoundationStructuralStep = safeLayer === 'foundation'
      && (foundationStepIndexNow === 0 || foundationStepIndexNow === 3 || foundationStepIndexNow === 4);
    const isPlayerBassFoundation = safeLayer === 'foundation'
      && foundationPhraseId.startsWith('player_bass_drive_');
    const isPlayerBassLiteralStatement = isPlayerBassFoundation
      && (
        foundationInterpretationMode === 'literal_statement'
        || (!foundationInterpretationMode && barIndex >= 12 && barIndex < 20)
      );
    let score = 0;
    if (safeLayer === 'foundation') score += 1000;
    else if (safeLayer === 'loops') score += 700;
    else score += 300;
    if (isFreshEntryAudibility(ev)) score += Math.max(0, Number(constants.entryAudibilityScoreBoost) || 110);
    if (isPrimaryLoopLaneEvent) score += 220;
    score += (prominenceRank[safeProminence] || 0) * 40;
    if (safeLayer === 'foundation' && playerLikelyAudible) score += 180;
    if (isCurrentForegroundLoop) score += Math.max(0, Number(constants.currentForegroundScoreBoost) || 120);
    if (isEstablishingForegroundLoop) score += Math.max(0, Number(constants.establishingForegroundScoreBoost) || 90);
    if (foregroundLockActive) score -= Math.max(0, Number(constants.competingForegroundScorePenalty) || 110) * 1.35;
    if (
      safeLayer === 'loops'
      && callResponseLane === 'response'
      && currentForegroundIdentityLayer === 'loops'
      && !!currentForegroundIdentityKey
    ) {
      score -= 95;
    }
    if (
      safeLayer === 'loops'
      && callResponseLane === 'call'
      && !isPrimaryLoopLaneEvent
      && currentForegroundIdentityLayer === 'loops'
      && !!currentForegroundIdentityKey
    ) {
      score -= 45;
    }
    if (isFoundationStructuralStep) score += Math.max(0, Number(constants.foundationStructuralScoreBoost) || 120);
    if (safeLayer === 'loops' && safeProminence === 'full') score += 60;
    if (safeLayer === 'loops' && !isPrimaryLoopLaneEvent && (register === 'mid' || register === 'mid_high')) {
      score -= (callResponseLane === 'call' || callResponseLane === 'response') ? 60 : 50;
    }
    if (safeLayer === 'sparkle' && String(ev?.actionType || '').trim().toLowerCase() === 'enemy-death-accent') score += 40;
    if (safeLayer === 'sparkle' && (register === 'mid' || register === 'mid_high')) score -= 35;
    if (directorLane) {
      const intensity = Math.max(0, Math.min(1, Number(directorLane.intensity) || 0));
      if (directorLane.active === true) {
        score += 40 + (intensity * 140);
      } else {
        score -= 260;
      }
      if (directorLane.protected === true) score += 90;
      const continuityBias = String(directorLane.continuityBias || '').trim().toLowerCase();
      if (continuityBias === 'hold' && continuityId) score += 70;
      else if (continuityBias === 'blend' && continuityId) score += 30;
    }
    if (safeLayer === 'loops' && !isPrimaryLoopLaneEvent) {
      if (preDropActive) {
        score -= callResponseLane === 'response' ? 45 : 65;
      } else if (peakActive) {
        score -= (callResponseLane === 'call' || callResponseLane === 'response') ? 20 : 55;
      }
    }
    score -= getRoleRegisterPenalty({
      layer: safeLayer,
      role,
      register,
      isPrimaryLoopLaneEvent,
      callResponseLane,
    });
    score += Math.max(0, Math.min(1, Number(payload.onboardingPriority) || 0)) * 25;
    score -= idx * 0.01;
    return {
      ev,
      idx,
      payload,
      layer: safeLayer,
      prominence: safeProminence,
      role,
      register,
      enemyType,
      continuityId,
      noteResolved,
      identityKey,
      isCurrentForegroundLoop,
      isCompetingForegroundLoop,
      foregroundLockActive,
      isEstablishingForegroundLoop,
      isFoundationStructuralStep,
      isPlayerBassFoundation,
      isPlayerBassLiteralStatement,
      isPrimaryLoopLaneEvent,
      callResponseLane,
      musicVoiceKey,
      isProtectedIntroDrum,
      isReservedPercussionCompanion: musicVoiceKey === 'percussion_backbeat' && safeLayer === 'loops',
      score,
      duplicateKey: isGroupedComposerLaneEvent(ev) && safeLayer === 'foundation' && !releaseArrangementStage
        ? [
          safeLayer,
          role || 'role',
          register || 'register',
          noteResolved || 'note',
          `actor:${Math.max(0, Math.trunc(Number(ev?.actorId) || 0))}`,
        ].join('|')
        : [
          safeLayer,
          role || 'role',
          register || 'register',
          noteResolved || 'note',
        ].join('|'),
      collisionRegisterKey: [
        safeLayer,
        register || 'register',
      ].join('|'),
      melodicCollisionKey: (
        safeLayer === 'loops'
        && register !== 'low'
        && register !== 'sub'
      ) ? [
        safeLayer,
        register || 'register',
        isPrimaryLoopLaneEvent ? 'primary' : 'secondary',
      ].join('|') : '',
    };
  });

  const duplicateWinnerByKey = new Map();
  for (const item of profiledAnnotated) {
    if (!item.duplicateKey.includes('|note')) {
      const prev = duplicateWinnerByKey.get(item.duplicateKey);
      if (!prev || item.score > prev.score) duplicateWinnerByKey.set(item.duplicateKey, item);
    }
  }

  const keptByLayer = {
    foundation: [],
    loops: [],
    sparkle: [],
  };
  const selectedIds = new Set();
  const selectedRegisterCounts = new Map();
  const selectedMelodicCollisionKeys = new Set();
  let reservedPercussionCompanionSelected = false;
  const sortedForSelection = profiledAnnotated
    .slice()
    .sort((a, b) => (b.score - a.score) || (a.idx - b.idx));
  for (const item of sortedForSelection) {
    const duplicateWinner = duplicateWinnerByKey.get(item.duplicateKey);
    if (duplicateWinner && duplicateWinner !== item) continue;
    const groupedComposerEvent = isGroupedComposerLaneEvent(item?.ev);
    const groupedComposerBudgetExempt = groupedComposerEvent && item.layer === 'foundation' && !releaseArrangementStage;
    if (item.layer === 'sparkle') {
      const actionKey = String(item?.ev?.actionType || '').trim().toLowerCase();
      const priorSparkle = sparkleAccentByAction.get(actionKey) || null;
      if (priorSparkle && priorSparkle !== item) continue;
      if (actionKey) sparkleAccentByAction.set(actionKey, item);
    }
    const bucket = keptByLayer[item.layer] || [];
    const budget = Math.max(0, Math.trunc(Number(layerBudgets[item.layer]) || 0));
    if (item.isProtectedIntroDrum) {
      // During the intro drum-to-lead blend window, keep the pulse/backbeat
      // slots alive as first-class material instead of making them compete
      // with the newly entering lead.
    } else if (item.isReservedPercussionCompanion) {
      if (reservedPercussionCompanionSelected) continue;
    } else if (!groupedComposerBudgetExempt && bucket.length >= budget) continue;
    const registerCount = Math.max(0, Math.trunc(Number(selectedRegisterCounts.get(item.collisionRegisterKey) || 0)));
    if (
      !groupedComposerBudgetExempt
      &&
      !item.isProtectedIntroDrum
      &&
      !item.isReservedPercussionCompanion
      &&
      item.layer === 'loops'
      && item.register
      && item.register !== 'low'
      && item.register !== 'sub'
      && registerCount >= (item.isPrimaryLoopLaneEvent ? 1 : 0)
    ) {
      continue;
    }
    if (!groupedComposerBudgetExempt && !item.isProtectedIntroDrum && !item.isReservedPercussionCompanion && item.melodicCollisionKey && selectedMelodicCollisionKeys.has(item.melodicCollisionKey)) continue;
    bucket.push(item);
    selectedIds.add(item.idx);
    selectedRegisterCounts.set(item.collisionRegisterKey, registerCount + 1);
    if (item.melodicCollisionKey) selectedMelodicCollisionKeys.add(item.melodicCollisionKey);
    if (item.isReservedPercussionCompanion) reservedPercussionCompanionSelected = true;
    if (keptByLayer[item.layer] !== bucket) keptByLayer[item.layer] = bucket;
  }
  const foundationSelected = keptByLayer.foundation.length > 0;
  if (foundationSelected && currentForegroundIdentityLayer === 'loops' && keptByLayer.loops.length > 1) {
    const reservedCompanions = keptByLayer.loops.filter((item) => item.isReservedPercussionCompanion);
    const nonReservedLoops = keptByLayer.loops.filter((item) => !item.isReservedPercussionCompanion);
    const bestNonReserved = nonReservedLoops
      .slice()
      .sort((a, b) => (b.score - a.score) || (a.idx - b.idx))
      .slice(0, 1);
    keptByLayer.loops = [
      ...reservedCompanions.slice(0, 1),
      ...bestNonReserved,
    ];
    selectedIds.clear();
    for (const bucketName of Object.keys(keptByLayer)) {
      for (const item of keptByLayer[bucketName] || []) selectedIds.add(item.idx);
    }
  }

  const arbitrationMetaByEvent = new WeakMap();
  const arbitratedEnemyEvents = profiledAnnotated.map((item) => {
    const freshEntryAudibility = isFreshEntryAudibility(item?.ev);
    const entryPhraseAudibility = isEntryPhraseAudibility(item?.ev);
    const finalProminence = (() => {
      if (selectedIds.has(item.idx)) {
        if (item.layer === 'foundation') {
          if (item.isPlayerBassFoundation) return 'full';
          if (item.isFoundationStructuralStep) return 'full';
          if (!playerLikelyAudible && !primaryLoopForegroundProtected) return 'full';
          return 'quiet';
        }
        if (item.layer === 'loops') {
          if (item.isProtectedIntroDrum) return 'quiet';
          if (item.isPrimaryLoopLaneEvent) {
            if (currentEnemyMusicActionGateState.stage === 'peak') return 'full';
            if (primaryLoopForegroundProtected) {
              return 'full';
            }
            if (foundationSelected) {
              if (item.isEstablishingForegroundLoop && !playerLikelyAudible) return 'full';
              return 'quiet';
            }
            if (playerLikelyAudible) return item.isEstablishingForegroundLoop ? 'full' : 'quiet';
            return 'full';
          }
          if (
            (item.callResponseLane === 'response' || item.callResponseLane === 'call')
            && currentForegroundIdentityLayer === 'loops'
            && !!currentForegroundIdentityKey
          ) {
            if (foundationSelected) return 'suppressed';
            return item.isCurrentForegroundLoop ? 'quiet' : 'trace';
          }
          if (foundationSelected && playerLikelyAudible) {
            if (item.isEstablishingForegroundLoop) return 'quiet';
            if (freshEntryAudibility) return 'quiet';
            return item.isCurrentForegroundLoop ? 'quiet' : 'trace';
          }
          if (!item.isPrimaryLoopLaneEvent && item.register && item.register !== 'low' && item.register !== 'sub') {
            if (freshEntryAudibility) return 'quiet';
            return item.isCurrentForegroundLoop ? 'quiet' : 'trace';
          }
          if (item.isEstablishingForegroundLoop) return 'full';
          if (freshEntryAudibility && item.prominence === 'trace') return 'quiet';
          return item.isCurrentForegroundLoop ? 'full' : (item.prominence === 'trace' ? 'quiet' : item.prominence);
        }
        if (foundationSelected && playerLikelyAudible) return 'suppressed';
        return item.prominence === 'full' ? 'quiet' : item.prominence;
      }
      if (item.layer === 'foundation') return 'suppressed';
      return 'suppressed';
    })();
    const resultEvent = finalProminence === item.prominence ? item.ev : {
      ...item.ev,
      payload: {
        ...item.payload,
        musicProminence: finalProminence,
        entryAudibilityGrace: freshEntryAudibility,
        entryPhraseAudibilityGrace: entryPhraseAudibility,
      },
    };
    arbitrationMetaByEvent.set(resultEvent, {
      isCurrentForegroundLoop: item.isCurrentForegroundLoop === true,
      isCompetingForegroundLoop: item.isCompetingForegroundLoop === true,
      foregroundLockActive: item.foregroundLockActive === true,
      isFoundationStructuralStep: item.isFoundationStructuralStep === true,
      isVisibleGameplayLinkedCue: isVisibleGameplayLinkedCue(item?.ev),
      entryPhraseAudibilityGrace: entryPhraseAudibility,
    });
    return resultEvent;
  });

  for (let idx = 0; idx < arbitratedEnemyEvents.length; idx += 1) {
    const profiled = arbitratedEnemyEvents[idx];
    const payload = profiled?.payload && typeof profiled.payload === 'object' ? profiled.payload : {};
    const musicVoiceKey = String(payload.musicVoiceKey || '').trim().toLowerCase();
    const layer = String(payload.musicLayer || 'sparkle').trim().toLowerCase();
    const safeLayer = (layer === 'foundation' || layer === 'loops' || layer === 'sparkle') ? layer : 'sparkle';
    const prominence = String(payload.musicProminence || 'full').trim().toLowerCase();
    const safeProminence = (
      prominence === 'suppressed' || prominence === 'trace' || prominence === 'quiet' || prominence === 'full'
    ) ? prominence : 'full';
    const register = String(payload.musicRegister || '').trim().toLowerCase();
    const preArbitration = profiledAnnotated[idx];
    if (safeLayer === 'foundation') {
      try {
        helpers.noteMusicSystemEvent?.('music_foundation_prominence_decision', {
          actorId: Math.max(0, Math.trunc(Number(profiled?.actorId) || 0)),
          actionType: String(profiled?.actionType || '').trim().toLowerCase(),
          role: String(profiled?.role || payload?.musicRole || '').trim().toLowerCase(),
          requestedProminence: String(preArbitration?.prominence || 'full'),
          finalProminence: safeProminence,
          changedByDeconflict: safeProminence !== String(preArbitration?.prominence || 'full'),
          changedByArbitration: safeProminence !== String(preArbitration?.prominence || 'full'),
          playerLikelyAudible,
          foundationAssignedBefore: false,
          foundationAssignedAfter: safeProminence !== 'suppressed',
          enemyIndex: Math.max(0, Math.trunc(Number(idx) || 0)),
          totalEnemyEvents: Math.max(0, Math.trunc(Number(arbitratedEnemyEvents.length) || 0)),
        }, { beatIndex, stepIndex, barIndex });
      } catch {}
    }
    if (preArbitration && safeProminence !== preArbitration.prominence) {
      const decisionReason = (() => {
        if (safeProminence === 'suppressed') {
          if (!selectedIds.has(preArbitration.idx)) {
            const duplicateWinner = duplicateWinnerByKey.get(preArbitration.duplicateKey);
            if (duplicateWinner && duplicateWinner !== preArbitration) return 'duplicate_note_role';
            const bucket = keptByLayer[preArbitration.layer] || [];
            const budget = Math.max(0, Math.trunc(Number(layerBudgets[preArbitration.layer]) || 0));
            if (bucket.length >= budget) return 'layer_budget';
            if (preArbitration.melodicCollisionKey && selectedMelodicCollisionKeys.has(preArbitration.melodicCollisionKey)) return 'melodic_register_collision';
            return 'selection_loss';
          }
          return 'suppressed_after_selection';
        }
        if (playerLikelyAudible && preArbitration.layer === 'loops') return 'player_mask_loop_duck';
        if (playerLikelyAudible && preArbitration.layer === 'sparkle') return 'player_mask_sparkle_trace';
        if (preArbitration.layer === 'loops' && preArbitration.isPrimaryLoopLaneEvent && foundationSelected) return 'foundation_preserve_primary_duck';
        if (preArbitration.layer === 'loops') return 'loop_support_duck';
        if (preArbitration.layer === 'sparkle') return 'sparkle_background_trace';
        return 'prominence_adjust';
      })();
      try {
        helpers.noteMusicSystemEvent?.('music_step_arbitration', {
          actorId: Math.max(0, Math.trunc(Number(profiled?.actorId) || 0)),
          actionType: String(profiled?.actionType || '').trim().toLowerCase(),
          layer: safeLayer,
          role: String(payload.musicRole || profiled?.role || '').trim().toLowerCase(),
          noteResolved: String(preArbitration.noteResolved || ''),
          duplicateKey: String(preArbitration.duplicateKey || ''),
          requestedProminence: String(preArbitration.prominence || ''),
          finalProminence: safeProminence,
          suppressedByArbitration: safeProminence === 'suppressed',
          decisionReason,
          playerLikelyAudible,
        }, { beatIndex, stepIndex, barIndex });
      } catch {}
      if (musicVoiceKey) {
        try {
          helpers.noteMusicSystemEvent?.('music_slot_spawner_admission', {
            actorId: Math.max(0, Math.trunc(Number(profiled?.actorId) || 0)),
            groupId: Math.max(0, Math.trunc(Number(payload?.groupId) || 0)),
            actionType: String(profiled?.actionType || '').trim().toLowerCase(),
            musicVoiceKey,
            musicLayer: safeLayer,
            continuityId: String(payload?.continuityId || '').trim(),
            admitted: safeProminence !== 'suppressed',
            requestedProminence: String(preArbitration.prominence || ''),
            finalProminence: safeProminence,
            reason: decisionReason,
          }, { beatIndex, stepIndex, barIndex });
        } catch {}
      }
    }
    if (musicVoiceKey && (!preArbitration || safeProminence === preArbitration.prominence)) {
      try {
        helpers.noteMusicSystemEvent?.('music_slot_spawner_admission', {
          actorId: Math.max(0, Math.trunc(Number(profiled?.actorId) || 0)),
          groupId: Math.max(0, Math.trunc(Number(payload?.groupId) || 0)),
          actionType: String(profiled?.actionType || '').trim().toLowerCase(),
          musicVoiceKey,
          musicLayer: safeLayer,
          continuityId: String(payload?.continuityId || '').trim(),
          admitted: safeProminence !== 'suppressed',
          requestedProminence: String(preArbitration?.prominence || safeProminence),
          finalProminence: safeProminence,
          reason: safeProminence === 'suppressed' ? 'suppressed_unchanged' : 'admitted',
        }, { beatIndex, stepIndex, barIndex });
      } catch {}
    }
    if (safeProminence === 'suppressed') continue;
    if (layerStepStats[safeLayer]) layerStepStats[safeLayer][safeProminence] += 1;
    readabilityStepStats.enemyEvents += 1;
    if (safeProminence === 'full') readabilityStepStats.enemyForegroundEvents += 1;
    if (safeProminence === 'full' && safeLayer !== 'foundation') {
      readabilityStepStats.enemyNonFoundationForegroundEvents += 1;
    }
    if (
      playerLikelyAudible
      && safeLayer !== 'foundation'
      && (safeProminence === 'full' || safeProminence === 'quiet')
    ) {
      readabilityStepStats.enemyCompetingDuringPlayer += 1;
      if (register === 'mid' || register === 'mid_high') {
        readabilityStepStats.sameRegisterOverlapDuringPlayer += 1;
      }
    }
    try {
      helpers.noteEnemyMusicIdentityExposure?.({
        enemyType: String(profiled?.enemyType || profiled?.payload?.enemyType || '').trim().toLowerCase(),
        musicRole: String(payload.musicRole || '').trim().toLowerCase(),
        musicLayer: safeLayer,
      }, barIndex);
    } catch {}
  }

  let emittedEnemyEvents = arbitratedEnemyEvents.filter((ev) => {
    const payload = ev?.payload && typeof ev.payload === 'object' ? ev.payload : {};
    return String(payload.musicProminence || 'full').trim().toLowerCase() !== 'suppressed';
  });
  if (currentEnemyMusicActionGateState.stage === 'release') {
    const localReleaseStep = ((stepIndex % 8) + 8) % 8;
    const releaseSectionBar = Math.max(0, Math.trunc(Number(currentEnemyMusicActionGateState.sectionBar) || 0));
    const releaseFoundationTailStep = releaseSectionBar < 3 && localReleaseStep === 4;
    let keptReleaseFoundation = null;
    emittedEnemyEvents = emittedEnemyEvents.filter((ev) => {
      const payload = ev?.payload && typeof ev.payload === 'object' ? ev.payload : {};
      const layer = String(payload.musicLayer || '').trim().toLowerCase();
      const laneId = String(payload.musicLaneId || payload.foundationLaneId || '').trim().toLowerCase();
      const voiceKey = String(payload.musicVoiceKey || '').trim().toLowerCase();
      const role = String(ev?.role || payload.musicRole || '').trim().toLowerCase();
      const isFoundation = layer === 'foundation' || laneId === 'foundation_lane' || role === 'bass';
      const isPrimaryLoop = laneId === 'primary_loop_lane' || role === 'lead';
      const isSecondaryLoop = laneId === 'secondary_loop_lane'
        || voiceKey === 'percussion_backbeat'
        || voiceKey === 'counter_rhythm'
        || role === 'accent';
      if (!isFoundation) {
        if (isPrimaryLoop) return false;
        if (isSecondaryLoop) {
          if (releaseSectionBar === 0) return localReleaseStep === 2 || localReleaseStep === 6;
          if (releaseSectionBar < 3) return localReleaseStep === 4;
          return false;
        }
        return releaseSectionBar === 0 && localReleaseStep === 7;
      }
      if (localReleaseStep !== 0 && !releaseFoundationTailStep) return false;
      if (!keptReleaseFoundation) {
        keptReleaseFoundation = ev;
        return true;
      }
      return false;
    });
  }
  for (const ev of emittedEnemyEvents) {
    const payload = ev?.payload && typeof ev.payload === 'object' ? ev.payload : {};
    const prominence = String(payload.musicProminence || 'full').trim().toLowerCase();
    if (!(prominence === 'full' || prominence === 'quiet')) continue;
    const entryKey = resolveEntryAudibilityKey(ev);
    if (!entryKey) continue;
    const prev = entryAudibilityRuntime.byKey.get(entryKey) || null;
    entryAudibilityRuntime.byKey.set(entryKey, {
      firstSeenStep: prev ? Math.max(0, Math.trunc(Number(prev.firstSeenStep) || stepIndex)) : stepIndex,
      lastAudibleStep: stepIndex,
      audibleCount: Math.max(0, Math.trunc(Number(prev?.audibleCount) || 0)) + 1,
    });
  }
  const hasEmittedFoundationEvent = emittedEnemyEvents.some((ev) => {
    const payload = ev?.payload && typeof ev.payload === 'object' ? ev.payload : {};
    return String(payload.musicLayer || '').trim().toLowerCase() === 'foundation'
      || String(ev?.role || payload?.musicRole || '').trim().toLowerCase() === 'bass';
  });
  if (
    !suppressDirectorMusic
    && !isLaneSuppressed('foundation_lane')
    && foundationLaneActive
    && !hasEmittedFoundationEvent
    && typeof helpers.createBassFoundationKeepaliveEvent === 'function'
  ) {
    const recoveredFoundation = helpers.createBassFoundationKeepaliveEvent({
      beatIndex,
      stepIndex,
      barIndex,
      centerWorld,
      playerLikelyAudible,
      forceImmediate: true,
    });
    if (recoveredFoundation && typeof recoveredFoundation === 'object') {
      emittedEnemyEvents.unshift(recoveredFoundation);
      try {
        helpers.noteNaturalBassStep?.(stepIndex);
        helpers.noteMusicSystemEvent?.('music_foundation_post_arbitration_recover', {
          actorId: Math.max(0, Math.trunc(Number(recoveredFoundation?.actorId) || 0)),
          actionType: String(recoveredFoundation?.actionType || '').trim().toLowerCase(),
        }, { beatIndex, stepIndex, barIndex });
      } catch {}
    }
  }
  const primaryLoopForegroundPresent = emittedEnemyEvents.some((ev) => {
    const payload = ev?.payload && typeof ev.payload === 'object' ? ev.payload : {};
    return String(payload.musicLaneId || '').trim().toLowerCase() === 'primary_loop_lane'
      && String(payload.musicLayer || '').trim().toLowerCase() === 'loops'
      && String(payload.musicProminence || '').trim().toLowerCase() === 'full';
  });
  const crowdedMusicalStep = foundationSelected && primaryLoopForegroundPresent;
  const shouldEmitPlayerStepFinal = (() => {
    if (!shouldEmitPlayerStep) return false;
    if (!crowdedMusicalStep) return true;
    if (playerStepDirective.manualOverrideActive === true) return true;
    if (String(playerStepDirective.presentation || '').trim().toLowerCase() === 'restrained' && !playerTuneAuthoredStep) {
      return false;
    }
    if (playerTuneAuthoredStep) {
      return (stepIndex % 2) === 0;
    }
    return false;
  })();
  const playerSectionVolumeMult = Math.max(0.45, Math.min(1, Number(playerStepDirective.volumeMult) || 0.82));
  const basePlayerSoundVolumeMult = (foundationSelected
    ? (primaryLoopForegroundPresent ? 0.46 : 0.68)
    : 1) * playerSectionVolumeMult;
  const stagedSoundCount = emittedEnemyEvents.reduce((sum, ev) => {
    const payload = ev?.payload && typeof ev.payload === 'object' ? ev.payload : {};
    const prominence = String(payload.musicProminence || 'full').trim().toLowerCase();
    return sum + ((prominence === 'full' || prominence === 'quiet') ? 1 : 0);
  }, shouldEmitPlayerStepFinal ? 1 : 0);
  const globalStepGainScale = stagedSoundCount <= 1
    ? 1
    : (stagedSoundCount === 2 ? 0.94 : (stagedSoundCount === 3 ? 0.88 : 0.82));
  const densityPressure = stagedSoundCount <= 2
    ? 0
    : (stagedSoundCount === 3 ? 0.45 : 1);
  const densityReliefFoundation = Math.max(0, Math.min(1, Number(constants.densityReliefFoundation) || 0.22));
  const densityReliefPrimaryLoop = Math.max(0, Math.min(1, Number(constants.densityReliefPrimaryLoop) || 0.09));
  const densityPenaltySupport = Math.max(0, Math.min(1, Number(constants.densityPenaltySupport) || 0.08));
  const densityPenaltySparkle = Math.max(0, Math.min(1, Number(constants.densityPenaltySparkle) || 0.18));
  const stagedEnemyEvents = emittedEnemyEvents.map((ev) => {
    const payload = ev?.payload && typeof ev.payload === 'object' ? ev.payload : {};
    const arbitrationMeta = arbitrationMetaByEvent.get(ev) || null;
    const baseAudioGain = Number(payload.audioGain == null ? 1 : payload.audioGain);
    const musicLayer = String(payload.musicLayer || 'sparkle').trim().toLowerCase();
    const musicProminence = String(payload.musicProminence || 'full').trim().toLowerCase();
    const isPrimaryLoopLaneEvent = String(payload.musicLaneId || '').trim().toLowerCase() === 'primary_loop_lane';
    const isFoundationLaneEvent = String(payload.musicLaneId || payload.foundationLaneId || '').trim().toLowerCase() === 'foundation_lane'
      || musicLayer === 'foundation';
    const callResponseLane = String(payload.callResponseLane || '').trim().toLowerCase();
    const isCurrentForegroundLoop = arbitrationMeta?.isCurrentForegroundLoop === true;
    const isCompetingForegroundLoop = arbitrationMeta?.isCompetingForegroundLoop === true;
    const foregroundLockActive = arbitrationMeta?.foregroundLockActive === true;
    const isFoundationStructuralStep = arbitrationMeta?.isFoundationStructuralStep === true;
    const isVisibleGameplayCue = arbitrationMeta?.isVisibleGameplayLinkedCue === true;
    const entryPhraseAudibilityGrace = arbitrationMeta?.entryPhraseAudibilityGrace === true;
    const hierarchyGainScale = (() => {
      if (!(densityPressure > 0)) return 1;
      if (musicLayer === 'foundation') {
        const structuralBoost = isFoundationStructuralStep
          ? Math.max(0, Number(constants.foundationStructuralGainBoost) || 0.12)
          : 0;
        const visibleCueBoost = isVisibleGameplayCue ? 0.05 : 0;
        return 1 + ((densityReliefFoundation + structuralBoost + visibleCueBoost) * densityPressure);
      }
      if (musicLayer === 'loops') {
        if (isPrimaryLoopLaneEvent || musicProminence === 'full') {
          const foregroundBoost = isCurrentForegroundLoop
            ? Math.max(0, Number(constants.currentForegroundGainBoost) || 0.06)
            : 0;
          const visibilityBoost = isVisibleGameplayCue ? 0.04 : 0;
          const phraseGraceBoost = entryPhraseAudibilityGrace ? 0.03 : 0;
          const competingPenalty = (foregroundLockActive && isCompetingForegroundLoop)
            ? Math.max(0, Number(constants.competingForegroundGainPenalty) || 0.12) * 1.35
            : 0;
          const crowdPenalty = (foundationSelected && stagedSoundCount >= 2) ? 0.08 : 0;
          return Math.max(0.52, (1 + ((densityReliefPrimaryLoop + foregroundBoost + visibilityBoost + phraseGraceBoost) * densityPressure)) - competingPenalty - crowdPenalty);
        }
        const crowdedForegroundSupportStep = primaryLoopForegroundPresent && foundationSelected;
        const callResponsePenalty = callResponseLane === 'response'
          ? (crowdedForegroundSupportStep ? 0.18 : 0.12)
          : (callResponseLane === 'call'
            ? (crowdedForegroundSupportStep ? 0.08 : 0.05)
            : 0);
        const supportFloor = callResponseLane === 'response'
          ? (crowdedForegroundSupportStep ? 0.36 : 0.46)
          : (callResponseLane === 'call'
            ? (crowdedForegroundSupportStep ? 0.44 : 0.5)
            : 0.55);
        return Math.max(supportFloor, 1 - ((densityPenaltySupport + callResponsePenalty) * densityPressure));
      }
      return Math.max(0.45, 1 - (densityPenaltySparkle * densityPressure));
    })();
    let nextAudioGain = Math.max(
      0,
      Math.min(1, (Number.isFinite(baseAudioGain) ? baseAudioGain : 1) * globalStepGainScale * hierarchyGainScale)
    );
    if (isPrimaryLoopLaneEvent) {
      const loopFloor = musicProminence === 'full'
        ? Math.max(0, Math.min(1, Number(constants.protectedLoopFullFloor) || 0.53))
        : Math.max(0, Math.min(1, Number(constants.protectedLoopQuietFloor) || 0.44));
      nextAudioGain = Math.max(loopFloor, nextAudioGain);
    } else if (isFoundationLaneEvent) {
      const foundationFloor = musicProminence === 'full'
        ? Math.max(0, Math.min(1, Number(constants.protectedFoundationFullFloor) || 0.6))
        : Math.max(0, Math.min(1, Number(constants.protectedFoundationQuietFloor) || 0.48));
      nextAudioGain = Math.max(foundationFloor, nextAudioGain);
    }
    if (entryPhraseAudibilityGrace && musicLayer === 'loops') {
      const phraseLoopFloor = musicProminence === 'full'
        ? Math.max(0, Math.min(1, Number(constants.entryPhraseLoopFullFloor) || 0.48))
        : Math.max(0, Math.min(1, Number(constants.entryPhraseLoopQuietFloor) || 0.38));
      nextAudioGain = Math.max(phraseLoopFloor, nextAudioGain);
    }
    if (isVisibleGameplayCue) {
      const visibleCueFloor = musicProminence === 'full'
        ? Math.max(0, Math.min(1, Number(constants.visibleCueFullFloor) || 0.42))
        : Math.max(0, Math.min(1, Number(constants.visibleCueQuietFloor) || 0.32));
      nextAudioGain = Math.max(visibleCueFloor, nextAudioGain);
    }
    const continuityId = String(payload.continuityId || '').trim();
    const lineKey = String(
      payload.musicLaneId
        || payload.foundationLaneId
        || (continuityId ? `${musicLayer}:${continuityId}` : '')
        || `${musicLayer}:${String(ev?.actionType || '').trim().toLowerCase()}:${Math.max(0, Math.trunc(Number(ev?.actorId) || 0))}`
    ).trim().toLowerCase();
    const previousLineState = lineKey ? gainSmoothingRuntime.byLineKey.get(lineKey) : null;
    if (lineKey) {
      const previousGain = clamp01(previousLineState?.gain);
      const isProtectedLaneEvent = isPrimaryLoopLaneEvent || isFoundationLaneEvent;
      const isStableAudibilityLine = isProtectedLaneEvent || isVisibleGameplayCue || entryPhraseAudibilityGrace;
      const attack = isStableAudibilityLine ? 0.72 : 0.62;
      const release = isStableAudibilityLine ? 0.14 : 0.3;
      const smoothingAlpha = nextAudioGain >= previousGain ? attack : release;
      const smoothedAudioGain = previousLineState
        ? (previousGain + ((nextAudioGain - previousGain) * smoothingAlpha))
        : nextAudioGain;
      nextAudioGain = clamp01(smoothedAudioGain);
      if (isPrimaryLoopLaneEvent) {
        const loopSmoothedFloor = musicProminence === 'full'
          ? Math.max(0, Math.min(1, Number(constants.protectedLoopFullFloor) || 0.53))
          : Math.max(0, Math.min(1, Number(constants.protectedLoopQuietFloor) || 0.44));
        nextAudioGain = Math.max(loopSmoothedFloor, nextAudioGain);
      } else if (isFoundationLaneEvent) {
        const foundationSmoothedFloor = musicProminence === 'full'
          ? Math.max(0, Math.min(1, Number(constants.protectedFoundationFullFloor) || 0.6))
          : Math.max(0, Math.min(1, Number(constants.protectedFoundationQuietFloor) || 0.48));
        nextAudioGain = Math.max(foundationSmoothedFloor, nextAudioGain);
      }
      if (entryPhraseAudibilityGrace && musicLayer === 'loops') {
        const phraseLoopSmoothedFloor = musicProminence === 'full'
          ? Math.max(0, Math.min(1, Number(constants.entryPhraseLoopFullFloor) || 0.48))
          : Math.max(0, Math.min(1, Number(constants.entryPhraseLoopQuietFloor) || 0.38));
        nextAudioGain = Math.max(phraseLoopSmoothedFloor, nextAudioGain);
      }
      if (isVisibleGameplayCue) {
        const visibleCueSmoothedFloor = musicProminence === 'full'
          ? Math.max(0, Math.min(1, Number(constants.visibleCueFullFloor) || 0.42))
          : Math.max(0, Math.min(1, Number(constants.visibleCueQuietFloor) || 0.32));
        nextAudioGain = Math.max(visibleCueSmoothedFloor, nextAudioGain);
      }
      gainSmoothingRuntime.byLineKey.set(lineKey, {
        gain: nextAudioGain,
        lastSeenStep: stepIndex,
      });
    }
    if (nextAudioGain === baseAudioGain) return ev;
    return {
      ...ev,
      payload: {
        ...payload,
        audioGain: nextAudioGain,
        globalStepGainScale,
        hierarchyGainScale,
        stagedSoundCount,
        gainSmoothingApplied: lineKey ? true : false,
        visibleCueAudibilityFloor: isVisibleGameplayCue,
        entryPhraseAudibilityGrace,
      },
    };
  });
  const playerSoundVolumeMult = basePlayerSoundVolumeMult * globalStepGainScale;
  const sparkleStepMod8 = stepIndex % 8;
  const sparkleBarPattern = ((barIndex % 4) + 4) % 4;
  const peakSparkleCompanionCue = currentEnemyMusicActionGateState.stage === 'peak'
    && currentEnemyMusicActionGateState.contractAllowsAnswer === true
    && sparkleBarPattern === 3
    && sparkleStepMod8 === 7;
  const buildSparklePreviewCue = currentEnemyMusicActionGateState.stage === 'build'
    && currentEnemyMusicActionGateState.sectionBar >= 8
    && currentEnemyMusicActionGateState.contractAllowsSparkle === true
    && currentEnemyMusicActionGateState.contractAllowsAnswer === true
    && (
      sparkleStepMod8 === 7
      || (currentEnemyMusicActionGateState.sectionBar >= 10 && sparkleStepMod8 === 3)
    );
  const defaultSparkleCompanionCue = currentEnemyMusicActionGateState.stage !== 'peak'
    && (
      (sparkleBarPattern === 0 && sparkleStepMod8 === 2)
      || (sparkleBarPattern === 3 && (sparkleStepMod8 === 2 || sparkleStepMod8 === 6))
    );
  const explicitSparkleCompanionWanted = (
    peakSparkleCompanionCue
    || buildSparklePreviewCue
    || (answerOrnamentAllowed && defaultSparkleCompanionCue)
  );
  const explicitSparkleCompanionEvent = (() => {
    if (suppressDirectorMusic) return null;
    if (!explicitSparkleCompanionWanted) return null;
    const sparkleActorId = Math.max(
      0,
      Math.trunc(Number(secondaryLoopLaneRuntime?.performerEnemyId) || 0)
        || Math.trunc(Number(primaryLoopLaneRuntime?.performerEnemyId) || 0)
    );
    const sparkleGroupId = Math.max(
      0,
      Math.trunc(Number(secondaryLoopLaneRuntime?.performerGroupId) || 0)
        || Math.trunc(Number(primaryLoopLaneRuntime?.performerGroupId) || 0)
    );
    const peakDirectAnswer = currentEnemyMusicActionGateState.stage === 'peak';
    const directOrnamentPreview = peakDirectAnswer || buildSparklePreviewCue;
    if (!directOrnamentPreview && !(sparkleActorId > 0 || sparkleGroupId > 0 || primaryLoopLaneActive || secondaryLoopLaneActive)) return null;
    const sparkleNote = sparkleStepMod8 === 6 ? 'A4' : 'D5';
    const sparkleInstrumentId = String(
      helpers.getIdForDisplayName?.('Digital Synth Lead Short')
        || helpers.getIdForDisplayName?.('DIGITAL SYNTH LEAD SHORT')
        || 'DIGITAL SYNTH LEAD SHORT'
        || helpers.getIdForDisplayName?.('Gaming Note')
        || helpers.getIdForDisplayName?.('Retro Triangle')
        || helpers.getIdForDisplayName?.('Bell')
        || secondaryLoopLaneRuntime?.instrumentId
        || primaryLoopLaneRuntime?.instrumentId
        || 'GAMING NOTE'
    ).trim();
    const ev = helpers.createLoggedPerformedBeatEvent?.({
      actorId: sparkleActorId,
      beatIndex,
      stepIndex,
      role: constants.roles?.accent || 'accent',
      note: sparkleNote,
      instrumentId: sparkleInstrumentId,
      actionType: 'composer-group-projectile',
      threatClass: constants.threat?.light || 'light',
      visualSyncType: sparkleActorId > 0 ? 'group-pulse' : 'none',
      payload: {
        groupId: sparkleGroupId,
        groupEventSource: 'answer_ornament_companion_direct',
        continuityId: 'answer-ornament-companion-direct',
        ghostPlayback: sparkleActorId <= 0,
        sourceSystem: 'music',
        directorAuthorizedAnswerOrnament: directOrnamentPreview,
        buildOrnamentPreview: buildSparklePreviewCue,
        musicLayer: 'sparkle',
        musicLaneId: directOrnamentPreview ? 'answer_lane' : 'sparkle_lane',
        musicVoiceKey: 'answer_ornament',
        musicProfileSourceType: 'answer_ornament',
        callResponseLane: 'response',
        callResponseQualified: true,
        callResponsePhraseProgress: sparkleStepMod8 === 2 ? 1 : 2,
        musicRegister: 'mid',
        musicProminence: playerLikelyAudible ? 'trace' : 'quiet',
        audioGain: buildSparklePreviewCue
          ? (currentEnemyMusicActionGateState.sectionBar >= 10 ? 0.24 : 0.18)
          : (playerLikelyAudible ? 0.14 : (sparkleBarPattern === 3 ? 0.34 : 0.24)),
        requestedNoteRaw: sparkleNote,
      },
    }, {
      beatIndex,
      stepIndex,
      sourceSystem: 'music',
      enemyType: 'composer-group-member',
      expectedInstrumentLane: 'lead',
      actualInstrumentLane: 'lead',
      musicLaneId: directOrnamentPreview ? 'answer_lane' : 'sparkle_lane',
      musicLayer: 'sparkle',
      musicVoiceKey: 'answer_ornament',
      musicProfileSourceType: 'answer_ornament',
      callResponseLane: 'response',
      callResponseQualified: true,
      callResponsePhraseProgress: sparkleStepMod8 === 2 ? 1 : 2,
      musicProminence: playerLikelyAudible ? 'trace' : 'quiet',
    }) || null;
    return ev || null;
  })();
  const explicitPlayerBassDriveEvent = (() => {
    if (suppressDirectorMusic) return null;
    if (isLaneSuppressed('foundation_lane')) return null;
    const bedState = getDirectorMotifBedStageState();
    if (bedState.stage !== 'peak') return null;
    const lane = helpers.getFoundationLaneSnapshot?.(stepIndex, barIndex) || null;
    if (!lane || lane.isActiveStep !== true) {
      notePlayerBassMotifTrack('skipped', {
        stage: bedState.stage,
        sectionBar: bedState.sectionBar,
        localStep: lane?.stepIndex ?? (((stepIndex % 8) + 8) % 8),
        expectedHit: false,
        emittedHit: false,
        reason: 'inactive_step',
      });
      return null;
    }
    if (String(lane.playerThemeSource || '').trim() !== 'bassDrive') {
      notePlayerBassMotifTrack('skipped', {
        stage: bedState.stage,
        sectionBar: bedState.sectionBar,
        localStep: lane.stepIndex,
        patternKey: lane.patternKey,
        rawPatternKey: lane.rawPatternKey,
        shapedPatternKey: lane.shapedPatternKey,
        interpretationMode: lane.interpretationMode,
        phrasePartIndex: lane.phrasePartIndex,
        expectedHit: true,
        emittedHit: false,
        reason: 'not_player_bass_drive',
      });
      return null;
    }
    const instrumentId = String(
      helpers.getPlayerSimpleRhythmThemeInstrumentId?.('bassDrive')
        || foundationLaneRuntime?.instrumentId
        || 'BASS TONE 4'
    ).trim();
    const noteName = String(helpers.getPlayerSimpleRhythmThemeNote?.('bassDrive') || 'C3').trim() || 'C3';
    const actorId = Math.max(0, Math.trunc(Number(foundationLaneRuntime?.performerEnemyId) || 0));
    const groupId = Math.max(0, Math.trunc(Number(foundationLaneRuntime?.performerGroupId) || 0));
    notePlayerBassMotifTrack('literal_emitted', {
      stage: bedState.stage,
      sectionBar: bedState.sectionBar,
      localStep: lane.stepIndex,
      patternKey: lane.patternKey,
      rawPatternKey: lane.rawPatternKey,
      shapedPatternKey: lane.shapedPatternKey,
      interpretationMode: lane.interpretationMode,
      phrasePartIndex: lane.phrasePartIndex,
      expectedHit: true,
      emittedHit: true,
      instrumentId,
      noteName,
      actorId,
      groupId,
    });
    return helpers.createLoggedPerformedBeatEvent?.({
      actorId,
      beatIndex,
      stepIndex,
      role: constants.roles?.bass || 'bass',
      note: noteName,
      instrumentId,
      actionType: 'composer-group-projectile',
      threatClass: constants.threat?.light || 'light',
      visualSyncType: actorId > 0 ? 'group-pulse' : 'none',
      payload: {
        groupId,
        groupEventSource: 'director_player_bass_drive_bed',
        continuityId: 'director-player-bass-drive-bed',
        ghostPlayback: actorId <= 0,
        sourceSystem: 'music',
        musicLayer: 'foundation',
        musicLaneId: 'foundation_lane',
        musicVoiceKey: 'player_bass_drive',
        musicLaneDriven: true,
        foundationLaneId: String(lane.laneId || 'foundation_lane'),
        foundationPhraseId: String(lane.phraseId || 'player_bass_drive').trim().toLowerCase(),
        foundationPatternKey: String(lane.patternKey || '').trim(),
        foundationPlayerThemeSource: 'bassDrive',
        foundationRawPatternKey: String(lane.rawPatternKey || '').trim(),
        foundationShapedPatternKey: String(lane.shapedPatternKey || lane.patternKey || '').trim(),
        foundationInterpretationMode: String(lane.interpretationMode || '').trim().toLowerCase(),
        foundationPhrasePartIndex: Math.max(0, Math.trunc(Number(lane.phrasePartIndex) || 0)),
        foundationStepIndex: Math.max(0, Math.trunc(Number(lane.stepIndex) || 0)),
        callResponseLane: 'call',
        callResponseQualified: true,
        callResponsePhraseProgress: Math.max(0, Math.trunc(Number(lane.stepIndex) || 0)),
        musicRegister: 'low',
        musicProminence: 'full',
        audioGain: 0.7,
        requestedNoteRaw: noteName,
        preserveRequestedNote: true,
        intensityAuditionSection: bedState.stage,
      },
    }, {
      beatIndex,
      stepIndex,
      sourceSystem: 'music',
      enemyType: 'composer-group-member',
      expectedInstrumentLane: 'bass',
      actualInstrumentLane: 'bass',
      musicLaneId: 'foundation_lane',
      musicLayer: 'foundation',
      musicVoiceKey: 'player_bass_drive',
      callResponseLane: 'call',
      callResponseQualified: true,
      musicProminence: 'full',
    }) || null;
  })();
  const explicitPlayerLeadThemeEvent = (() => {
    if (suppressDirectorMusic) return null;
    const { stage, sectionBar } = getDirectorMotifBedStageState();
    if (stage !== 'build' && stage !== 'peak' && stage !== 'release' && stage !== 'settle') return null;
    const buildLeadSupplement = stage === 'build' && sectionBar >= 3;
    if (!buildLeadSupplement && stage !== 'release' && stage !== 'settle' && primaryLoopForegroundPresent) return null;
    const stagedPrimaryLoopAlreadyPresent = stagedEnemyEvents.some((ev) => {
      const payload = ev?.payload && typeof ev.payload === 'object' ? ev.payload : {};
      return String(payload.musicLaneId || '').trim().toLowerCase() === 'primary_loop_lane'
        && String(ev?.role || payload.musicRole || '').trim().toLowerCase() === 'lead'
        && String(ev?.instrumentId || '').trim();
    });
    if (buildLeadSupplement && stagedPrimaryLoopAlreadyPresent) return null;
    if (!buildLeadSupplement && stage !== 'release' && stage !== 'settle' && stagedPrimaryLoopAlreadyPresent) return null;
    const localThemeStep = Math.max(0, Math.trunc(Number(stepIndex) || 0)) % 8;
    const leadEchoPolicy = typeof helpers.getPlayerLeadThemeEchoPolicy === 'function'
      ? helpers.getPlayerLeadThemeEchoPolicy(stage, sectionBar, 4, localThemeStep)
      : null;
    const releaseGesturePhase = stage === 'release'
      ? (String(leadEchoPolicy?.phase || '').trim().toLowerCase() || (sectionBar <= 1 ? 'entry' : (sectionBar <= 5 ? 'decay' : 'tail')))
      : '';
    const settleEchoCycle = stage === 'settle'
      ? Math.max(0, Math.trunc(Number(leadEchoPolicy?.cycle) || 0))
      : 0;
    const settleEchoStepAllowed = stage === 'settle' && leadEchoPolicy
      ? leadEchoPolicy.stepAllowed === true
      : (stage === 'settle'
      ? (() => {
        if (sectionBar < 2) return localThemeStep === 0 || localThemeStep === 4;
        if (settleEchoCycle === 1 && sectionBar % 2 === 1) return localThemeStep === 0 || localThemeStep === 4 || localThemeStep === 6;
        if (settleEchoCycle === 2 && sectionBar % 4 === 2) return localThemeStep === 0 || localThemeStep === 2 || localThemeStep === 4;
        return localThemeStep === 0 || localThemeStep === 4;
      })()
      : false);
    const settleDirectVariationStep = stage === 'settle'
      && sectionBar >= 2
      && (
        ((sectionBar % 4) === 1 && localThemeStep === 2)
        || ((sectionBar % 4) === 3 && localThemeStep === 6)
      );
    const memoryEchoStepAllowed = buildLeadSupplement
      ? (sectionBar < 7
        ? (localThemeStep === 2 || localThemeStep === 6 || localThemeStep === 7)
        : (localThemeStep === 1 || localThemeStep === 3 || localThemeStep === 5 || localThemeStep === 7))
      : (stage !== 'release' && stage !== 'settle'
      ? true
      : (stage === 'release'
      ? (releaseGesturePhase === 'entry'
        ? (localThemeStep === 0 || localThemeStep === 2 || localThemeStep === 4 || localThemeStep === 6)
        : (releaseGesturePhase === 'decay'
          ? (localThemeStep === 0 || localThemeStep === 4)
          : localThemeStep === 4))
      : (settleEchoStepAllowed || settleDirectVariationStep)));
    if (!memoryEchoStepAllowed) return null;
    let leadThemeStep = typeof helpers.getPlayerLeadThemePrimaryStep === 'function'
      ? helpers.getPlayerLeadThemePrimaryStep(barIndex, stepIndex, stage)
      : null;
    if ((buildLeadSupplement || stage === 'release' || stage === 'settle') && (!leadThemeStep || typeof leadThemeStep !== 'object' || leadThemeStep.active !== true || !String(leadThemeStep.note || '').trim())) {
      const stepBase = Math.max(0, Math.trunc(Number(stepIndex) || 0)) - localThemeStep;
      const candidateSteps = buildLeadSupplement
        ? [localThemeStep, 0, 2, 4, 6, 1, 3, 5, 7]
        : [localThemeStep, 0, 4, 2, 6, 1, 3, 5, 7];
      const candidateBars = [barIndex, barIndex + 1, barIndex + 2, barIndex + 3, barIndex + 4, barIndex - 1, barIndex - 2, barIndex - 3, barIndex - 4]
        .map((candidate) => Math.max(0, Math.trunc(Number(candidate) || 0)))
        .filter((candidate, idx, arr) => arr.indexOf(candidate) === idx);
      for (const candidateBar of candidateBars) {
        for (const candidate of candidateSteps) {
          const candidateStep = typeof helpers.getPlayerLeadThemePrimaryStep === 'function'
            ? helpers.getPlayerLeadThemePrimaryStep(candidateBar, (candidateBar * 8) + candidate, 'peak')
            : null;
          const candidateNote = String(candidateStep?.note || candidateStep?.rawNote || '').trim();
          if (!candidateStep || typeof candidateStep !== 'object' || !candidateNote) continue;
          leadThemeStep = {
            ...candidateStep,
            active: true,
            note: candidateNote,
            step: localThemeStep,
            interpretationMode: buildLeadSupplement
              ? 'build_assemble'
              : (stage === 'settle' ? 'settle_echo' : 'release_riff'),
            echoPolicy: leadEchoPolicy || candidateStep.echoPolicy || null,
          };
          break;
        }
        if (leadThemeStep && typeof leadThemeStep === 'object' && leadThemeStep.active === true && String(leadThemeStep.note || '').trim()) break;
      }
    }
    if (!leadThemeStep || typeof leadThemeStep !== 'object' || leadThemeStep.active !== true) return null;
    const noteName = String(leadThemeStep.note || '').trim();
    if (!noteName) return null;
    const actorId = Math.max(0, Math.trunc(Number(primaryLoopLaneRuntime?.performerEnemyId) || 0));
    const groupId = Math.max(0, Math.trunc(Number(primaryLoopLaneRuntime?.performerGroupId) || 0));
    const instrumentId = String(
      helpers.getPlayerDrawgridThemeInstrumentId?.('leadTheme')
        || primaryLoopLaneRuntime?.instrumentId
        || 'RETRO SQUARE'
    ).trim();
    return helpers.createLoggedPerformedBeatEvent?.({
      actorId,
      beatIndex,
      stepIndex,
      role: constants.roles?.lead || 'lead',
      note: noteName,
      instrumentId,
      actionType: stage === 'release'
        ? 'player-lead-release-echo'
        : (stage === 'settle' ? 'player-lead-settle-echo' : 'composer-group-projectile'),
      threatClass: constants.threat?.full || 'full',
      visualSyncType: actorId > 0 ? 'group-pulse' : 'none',
      payload: {
        groupId,
        groupEventSource: 'player_lead_theme_direct',
        continuityId: 'player-lead-theme-direct',
        ghostPlayback: actorId <= 0,
        sourceSystem: 'music',
        musicLayer: 'loops',
        musicLaneId: 'primary_loop_lane',
        musicVoiceKey: 'player_lead_theme',
        musicLaneDriven: true,
        leadPlayerThemeSource: 'leadTheme',
        leadThemeInterpretationMode: String(leadThemeStep.interpretationMode || '').trim().toLowerCase(),
        leadThemePartIndex: Math.max(0, Math.trunc(Number(leadThemeStep.phrasePartIndex) || 0)),
        leadThemeStepIndex: Math.max(0, Math.trunc(Number(leadThemeStep.step) || 0)),
        leadThemePatternKey: String(leadThemeStep.patternKey || '').trim().toLowerCase(),
        leadThemeContourKey: String(leadThemeStep.contourKey || '').trim().toLowerCase(),
        leadThemeRawStepActive: leadThemeStep.active === true,
        leadThemeRawNote: String(leadThemeStep.rawNote || '').trim(),
        motifSectionBar: Math.max(0, Math.trunc(Number(sectionBar) || 0)),
        releaseGesturePhase,
        settleEchoCycle: Math.max(0, Math.trunc(Number(leadThemeStep.echoPolicy?.cycle ?? settleEchoCycle) || 0)),
        leadEchoVariationKind: settleDirectVariationStep
          ? (localThemeStep === 6 ? 'upper_echo' : 'pickup_echo')
          : String(leadThemeStep.echoPolicy?.variationKind || leadEchoPolicy?.variationKind || '').trim().toLowerCase(),
        leadEchoAnchorOffset: Math.trunc(Number(leadThemeStep.echoPolicy?.anchorOffset ?? leadEchoPolicy?.anchorOffset) || 0),
        settleDirectVariationStep,
        releaseEntryGesture: releaseGesturePhase === 'entry',
        callResponseLane: 'call',
        callResponseQualified: true,
        callResponsePhraseProgress: Math.max(0, Math.trunc(Number(leadThemeStep.step) || 0)),
        musicRegister: 'high',
        musicProminence: stage === 'release' || stage === 'settle' ? 'quiet' : 'full',
        audioGain: buildLeadSupplement
          ? (sectionBar >= 7 ? 0.7 : 0.62)
          : (stage === 'release' || stage === 'settle' ? 0.72 : 0.72),
        requestedNoteRaw: noteName,
        preserveRequestedNote: true,
        intensityAuditionSection: stage,
        buildLeadSupplement,
      },
    }, {
      beatIndex,
      stepIndex,
      sourceSystem: 'music',
      enemyType: 'composer-group-member',
      expectedInstrumentLane: 'lead',
      actualInstrumentLane: 'lead',
      musicLaneId: 'primary_loop_lane',
      musicLayer: 'loops',
      musicVoiceKey: 'player_lead_theme',
      callResponseLane: 'call',
      callResponseQualified: true,
      musicProminence: stage === 'release' ? 'quiet' : 'full',
    }) || null;
  })();
  const explicitPlayerAccentRhythmEvent = (() => {
    if (suppressDirectorMusic) return null;
    const { stage, sectionBar } = getDirectorMotifBedStageState();
    if (stage !== 'medium' && stage !== 'build' && stage !== 'peak') return null;
    const phrase = helpers.getPlayerAccentRhythmMotionPhrase?.(barIndex, `intensity_${stage}`, {
      sectionRelative: true,
      sectionBar,
      layerKey: 'backbeat',
    }) || null;
    const steps = Array.isArray(phrase?.steps) ? phrase.steps : [];
    const localStep = ((stepIndex % 8) + 8) % 8;
    if (!steps[localStep]) return null;
    if (stage === 'build') {
      const hitSteps = steps
        .map((hit, idx) => hit ? idx : -1)
        .filter((idx) => idx >= 0);
      const buildHitBudget = sectionBar < 3
        ? Math.min(2, hitSteps.length)
        : (sectionBar < 7 ? Math.min(3, hitSteps.length) : hitSteps.length);
      const allowedBuildHits = new Set(hitSteps.slice(0, buildHitBudget));
      if (!allowedBuildHits.has(localStep)) return null;
    }
    const actorId = Math.max(
      0,
      Math.trunc(Number(secondaryLoopLaneRuntime?.performerEnemyId) || 0)
        || Math.trunc(Number(primaryLoopLaneRuntime?.performerEnemyId) || 0)
    );
    const groupId = Math.max(
      0,
      Math.trunc(Number(secondaryLoopLaneRuntime?.performerGroupId) || 0)
        || Math.trunc(Number(primaryLoopLaneRuntime?.performerGroupId) || 0)
    );
    const instrumentId = String(helpers.getPlayerSimpleRhythmThemeInstrumentId?.('accentRhythm') || '').trim();
    if (!instrumentId) {
      notePlayerAccentMotifTrack('missing_instrument', {
        stage,
        sectionBar,
        localStep,
        phrasePartIndex: phrase?.phrasePartIndex,
        patternKey: phrase?.patternKey,
        rawPatternKey: phrase?.rawPatternKey,
        shapedPatternKey: phrase?.shapedPatternKey,
        interpretationMode: phrase?.interpretationMode,
        expectedHit: true,
        emittedHit: false,
        reason: 'missing_instrument',
      });
      return null;
    }
    const noteName = String(helpers.getPlayerSimpleRhythmThemeNote?.('accentRhythm') || 'C4').trim() || 'C4';
    const phraseId = String(phrase?.id || `player_accent_rhythm_${String(phrase?.patternKey || 'default').trim() || 'default'}`).trim();
    notePlayerAccentMotifTrack('literal_emitted', {
      stage,
      sectionBar,
      localStep,
      phrasePartIndex: phrase?.phrasePartIndex,
      patternKey: phrase?.patternKey,
      rawPatternKey: phrase?.rawPatternKey,
      shapedPatternKey: phrase?.shapedPatternKey,
      interpretationMode: phrase?.interpretationMode,
      expectedHit: true,
      emittedHit: true,
      instrumentId,
      noteName,
      reason: actorId > 0 || groupId > 0 ? 'carrier_bound' : 'ghost_fallback',
    });
    const ev = helpers.createLoggedPerformedBeatEvent?.({
      actorId,
      beatIndex,
      stepIndex,
      role: constants.roles?.accent || 'accent',
      note: noteName,
      instrumentId,
      actionType: 'composer-group-projectile',
      threatClass: constants.threat?.light || 'light',
      visualSyncType: actorId > 0 ? 'group-pulse' : 'none',
      payload: {
        groupId,
        groupEventSource: 'player_accent_rhythm_direct',
        continuityId: 'player-accent-rhythm-direct',
        ghostPlayback: actorId <= 0,
        musicLayer: 'loops',
        musicLaneId: 'secondary_loop_lane',
        musicVoiceKey: 'percussion_backbeat',
        musicProfileSourceType: 'spawner_rhythm_backbeat',
        musicLanePlayerThemeSource: 'accentRhythm',
        musicLanePhraseId: phraseId,
        musicLanePatternKey: String(phrase?.patternKey || '').trim(),
        musicLaneRawPatternKey: String(phrase?.rawPatternKey || '').trim(),
        musicLaneShapedPatternKey: String(phrase?.shapedPatternKey || phrase?.patternKey || '').trim(),
        musicLaneInterpretationMode: String(phrase?.interpretationMode || 'secondary_statement').trim().toLowerCase(),
        musicLanePhrasePartIndex: Math.max(0, Math.trunc(Number(phrase?.phrasePartIndex) || 0)),
        callResponseLane: 'call',
        callResponseQualified: true,
        callResponsePhraseProgress: localStep,
        musicRegister: 'high',
        musicProminence: stage === 'medium' ? 'quiet' : 'full',
        audioGain: stage === 'peak' ? 0.62 : (stage === 'build' ? 0.56 : 0.42),
        requestedNoteRaw: noteName,
        preserveRequestedNote: true,
        intensityAuditionSection: stage,
      },
    }, {
      beatIndex,
      stepIndex,
      sourceSystem: 'music',
      enemyType: 'composer-group-member',
    }) || null;
    return ev || null;
  })();
  const explicitPlayerAccentRhythmRiffEvent = (() => {
    if (suppressDirectorMusic) return null;
    const { stage, sectionBar } = getDirectorMotifBedStageState();
    if (stage !== 'peak') return null;
    if (sectionBar < 16) return null;
    const phrase = helpers.getPlayerAccentRhythmMotionPhrase?.(barIndex, 'intensity_peak', {
      sectionRelative: true,
      sectionBar,
      layerKey: 'backbeat',
    }) || null;
    const steps = Array.isArray(phrase?.steps) ? phrase.steps : [];
    if (!steps.length) return null;
    const localStep = ((stepIndex % 8) + 8) % 8;
    if (steps[localStep]) return null;
    const prevStep = (localStep + 7) % 8;
    const nextStep = (localStep + 1) % 8;
    const nearMotifHit = !!steps[prevStep] || !!steps[nextStep];
    const pickupStep = localStep === 1 || localStep === 3 || localStep === 5 || localStep === 7;
    if (!nearMotifHit || !pickupStep) return null;
    if (nearMotifHit && (steps[prevStep] && steps[nextStep])) return null;
    if (((sectionBar + localStep) % 4) === 0) return null;
    if ((sectionBar % 4) !== 3) return null;
    const actorId = Math.max(
      0,
      Math.trunc(Number(secondaryLoopLaneRuntime?.performerEnemyId) || 0)
        || Math.trunc(Number(primaryLoopLaneRuntime?.performerEnemyId) || 0)
    );
    const groupId = Math.max(
      0,
      Math.trunc(Number(secondaryLoopLaneRuntime?.performerGroupId) || 0)
        || Math.trunc(Number(primaryLoopLaneRuntime?.performerGroupId) || 0)
    );
    const instrumentId = String(helpers.getPlayerSimpleRhythmThemeInstrumentId?.('accentRhythm') || '').trim();
    if (!instrumentId) {
      notePlayerAccentMotifTrack('riff_missing_instrument', {
        stage,
        sectionBar,
        localStep,
        phrasePartIndex: phrase?.phrasePartIndex,
        patternKey: phrase?.patternKey,
        rawPatternKey: phrase?.rawPatternKey,
        shapedPatternKey: phrase?.shapedPatternKey,
        interpretationMode: 'peak_riff',
        expectedHit: false,
        emittedHit: false,
        riffHit: true,
        reason: 'missing_instrument',
      });
      return null;
    }
    const noteName = String(helpers.getPlayerSimpleRhythmThemeNote?.('accentRhythm') || 'C4').trim() || 'C4';
    const phraseId = String(phrase?.id || `player_accent_rhythm_${String(phrase?.patternKey || 'default').trim() || 'default'}`).trim();
    notePlayerAccentMotifTrack('riff_emitted', {
      stage,
      sectionBar,
      localStep,
      phrasePartIndex: phrase?.phrasePartIndex,
      patternKey: phrase?.patternKey,
      rawPatternKey: phrase?.rawPatternKey,
      shapedPatternKey: phrase?.shapedPatternKey,
      interpretationMode: 'peak_riff',
      expectedHit: false,
      emittedHit: true,
      riffHit: true,
      instrumentId,
      noteName,
      reason: actorId > 0 || groupId > 0 ? 'carrier_bound' : 'ghost_fallback',
    });
    return helpers.createLoggedPerformedBeatEvent?.({
      actorId,
      beatIndex,
      stepIndex,
      role: constants.roles?.accent || 'accent',
      note: noteName,
      instrumentId,
      actionType: 'composer-group-projectile',
      threatClass: constants.threat?.light || 'light',
      visualSyncType: actorId > 0 ? 'group-pulse' : 'none',
      payload: {
        groupId,
        groupEventSource: 'player_accent_rhythm_peak_riff',
        continuityId: 'player-accent-rhythm-riff',
        ghostPlayback: actorId <= 0,
        musicLayer: 'loops',
        musicLaneId: 'secondary_loop_lane',
        musicVoiceKey: 'percussion_peak_riff',
        musicProfileSourceType: 'spawner_rhythm_backbeat',
        musicLanePlayerThemeSource: 'accentRhythm',
        musicLanePhraseId: phraseId,
        musicLanePatternKey: String(phrase?.patternKey || '').trim(),
        musicLaneRawPatternKey: String(phrase?.rawPatternKey || '').trim(),
        musicLaneShapedPatternKey: String(phrase?.shapedPatternKey || phrase?.patternKey || '').trim(),
        musicLaneInterpretationMode: 'peak_riff',
        musicLanePhrasePartIndex: Math.max(0, Math.trunc(Number(phrase?.phrasePartIndex) || 0)),
        callResponseLane: 'response',
        callResponseQualified: true,
        callResponsePhraseProgress: localStep,
        musicRegister: 'high',
        musicProminence: 'quiet',
        audioGain: 0.44,
        requestedNoteRaw: noteName,
        preserveRequestedNote: true,
        intensityAuditionSection: stage,
      },
    }, {
      beatIndex,
      stepIndex,
      sourceSystem: 'music',
      enemyType: 'composer-group-member',
    }) || null;
  })();

  stepEvents = [
    ...stagedEnemyEvents,
    explicitPlayerBassDriveEvent,
    explicitPlayerLeadThemeEvent,
    explicitPlayerAccentRhythmEvent,
    explicitPlayerAccentRhythmRiffEvent,
    explicitSparkleCompanionEvent,
    shouldEmitPlayerStepFinal
      ? helpers.createLoggedPerformedBeatEvent?.({
        actorId: 0,
        beatIndex,
        stepIndex,
        role: constants.roles?.accent || 'accent',
        note: '',
        instrumentId: '',
        actionType: 'player-weapon-step',
        threatClass: constants.threat?.full || 'full',
        visualSyncType: 'weapon-fire',
        payload: {
          centerWorld: {
            x: Number(centerWorld?.x) || 0,
            y: Number(centerWorld?.y) || 0,
          },
          foundationPresent: foundationSelected,
          primaryLoopForegroundPresent,
          crowdedMusicalStep,
          playerSoundVolumeMult,
          globalStepGainScale,
          stagedSoundCount,
          playerMusicRole: String(playerStepDirective.musicRole || 'support').trim().toLowerCase(),
          playerMusicLayer: String(playerStepDirective.musicLayer || 'loops').trim().toLowerCase(),
          playerPresentation: String(playerStepDirective.presentation || 'supportive').trim().toLowerCase(),
          playerRegisterTarget: String(playerStepDirective.registerTarget || 'mid_high').trim().toLowerCase(),
          playerStructureIntent: String(playerStepDirective.structureIntent || '').trim().toLowerCase(),
          playerEffectiveIntent: String(playerStepDirective.effectiveIntent || '').trim().toLowerCase(),
          playerCadenceMode: String(playerStepDirective.mode || 'free_fire'),
          playerCadenceReason: playerTuneAuthoredStep
            ? 'tune_override'
            : String(playerStepDirective.reason || ''),
          playerManualOverrideActive: playerStepDirective.manualOverrideActive === true,
          playerTuneAuthoredStep,
        },
      }, {
        beatIndex,
        stepIndex,
        sourceSystem: 'player',
        enemyType: 'player',
      })
      : null,
  ].filter(Boolean);
  if (shouldEmitPlayerStepFinal) {
    try {
      helpers.noteMusicSystemEvent?.('music_player_layer_state', {
        foundationPresent: foundationSelected,
        primaryLoopForegroundPresent,
        crowdedMusicalStep,
        playerLikelyAudible,
        playerTuneAuthoredStep,
        playerMusicRole: String(playerStepDirective.musicRole || 'support').trim().toLowerCase(),
        playerMusicLayer: String(playerStepDirective.musicLayer || 'loops').trim().toLowerCase(),
        playerPresentation: String(playerStepDirective.presentation || 'supportive').trim().toLowerCase(),
        playerRegisterTarget: String(playerStepDirective.registerTarget || 'mid_high').trim().toLowerCase(),
        playerStructureIntent: String(playerStepDirective.structureIntent || '').trim().toLowerCase(),
        playerEffectiveIntent: String(playerStepDirective.effectiveIntent || '').trim().toLowerCase(),
        playerCadenceMode: String(playerStepDirective.mode || 'free_fire').trim().toLowerCase(),
        playerCadenceReason: playerTuneAuthoredStep ? 'tune_override' : String(playerStepDirective.reason || '').trim().toLowerCase(),
        playerVolumeMult: playerSoundVolumeMult,
      }, { beatIndex, stepIndex, barIndex });
    } catch {}
  }
  readabilityStepStats.playerStepEmitted = shouldEmitPlayerStep;
  readabilityStepStats.playerLikelyAudible = playerLikelyAudible;
  finishArbitratePerf();
  }

  {
  const finishQueuePerf = createDirectPerfMark('pickupsCombat.weaponRuntime.stepChange.processEvents.queue');
  noteSlotSpawnerStage('queued', stepEvents);
  for (const ev of stepEvents) {
    if (isContractBlockedOrnamentEvent(ev)) {
      noteContractBlockedOrnamentEvent('queue', ev);
      continue;
    }
    try {
      const payload = ev?.payload && typeof ev.payload === 'object' ? ev.payload : {};
      const actionType = String(ev?.actionType || '').trim().toLowerCase();
      const instrumentId = String(ev?.instrumentId || '').trim().toUpperCase();
      const noteName = String(ev?.note || '').trim().toUpperCase();
      const isSquareCandidate = String(payload?.soloCarrierType || '').trim().toLowerCase() === 'rhythm'
        || (actionType === 'composer-group-explosion' && instrumentId === 'BASS TONE 3' && noteName === 'C3');
      if (false && isSquareCandidate && typeof globalThis?.console?.log === 'function') {
        globalThis.console.log('[BS-INTRO-DEBUG]', JSON.stringify({
          eventType: 'square_queue_event',
          beatIndex,
          stepIndex,
          actorId: Math.max(0, Math.trunc(Number(ev?.actorId) || 0)),
          actionType,
          instrumentId: String(ev?.instrumentId || '').trim(),
          noteName: String(ev?.note || '').trim(),
          musicProminence: String(payload?.musicProminence || '').trim().toLowerCase(),
          audioGain: Number(payload?.audioGain) || 0,
          soloCarrierType: String(payload?.soloCarrierType || '').trim().toLowerCase(),
        }));
      }
    } catch {}
    const queued = helpers.director?.enqueueBeatEvent?.(ev);
    if (!queued) continue;
    queuedStepEvents += 1;
    try {
      helpers.swarmMusicLab?.logQueuedEvent?.(queued, helpers.getMusicLabContext?.({
        beatIndex,
        stepIndex,
        barIndex,
      }));
    } catch {}
  }
  finishQueuePerf();
  }

  {
    const finishExecutePerf = createDirectPerfMark('pickupsCombat.weaponRuntime.stepChange.processEvents.execute');
    const drainedRaw = helpers.director?.drainBeatEventsForStep?.(beatIndex, stepIndex) || [];
    const drained = suppressDirectorMusic
      ? drainedRaw.filter((ev) => {
        const payload = ev?.payload && typeof ev.payload === 'object' ? ev.payload : {};
        const actionType = String(ev?.actionType || payload?.actionType || '').trim().toLowerCase();
        const sourceSystem = String(ev?.sourceSystem || payload?.sourceSystem || '').trim().toLowerCase();
        return actionType === 'player-weapon-step' || sourceSystem === 'player';
      })
      : drainedRaw;
    for (const ev of drained) {
      try {
        const payload = ev?.payload && typeof ev.payload === 'object' ? ev.payload : {};
        const actionType = String(ev?.actionType || '').trim().toLowerCase();
        const instrumentId = String(ev?.instrumentId || '').trim().toUpperCase();
        const noteName = String(ev?.note || '').trim().toUpperCase();
        const isSquareCandidate = String(payload?.soloCarrierType || '').trim().toLowerCase() === 'rhythm'
          || (actionType === 'composer-group-explosion' && instrumentId === 'BASS TONE 3' && noteName === 'C3');
        if (false && isSquareCandidate && typeof globalThis?.console?.log === 'function') {
          globalThis.console.log('[BS-INTRO-DEBUG]', JSON.stringify({
            eventType: 'square_drain_event',
            beatIndex,
            stepIndex,
            actorId: Math.max(0, Math.trunc(Number(ev?.actorId) || 0)),
            actionType,
            instrumentId: String(ev?.instrumentId || '').trim(),
            noteName: String(ev?.note || '').trim(),
            musicProminence: String(payload?.musicProminence || '').trim().toLowerCase(),
            audioGain: Number(payload?.audioGain) || 0,
            soloCarrierType: String(payload?.soloCarrierType || '').trim().toLowerCase(),
          }));
        }
      } catch {}
    }
    noteSlotSpawnerStage('drained', drained);
    for (const ev of drained) {
      if (isContractBlockedOrnamentEvent(ev)) {
        noteContractBlockedOrnamentEvent('drain', ev);
        continue;
      }
      if (helpers.executePerformedBeatEvent?.(ev)) drainedStepEvents += 1;
    }
    finishExecutePerf();
  }

  return {
    spawnerStepStats,
    onboardingPhase: String(onboardingDirective?.id || '').trim().toLowerCase(),
    layerStepStats,
    readabilityStepStats,
    queuedStepEvents,
    drainedStepEvents,
  };
}
