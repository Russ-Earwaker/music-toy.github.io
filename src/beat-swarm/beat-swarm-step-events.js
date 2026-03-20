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
  const centerWorld = state.centerWorld && typeof state.centerWorld === 'object'
    ? state.centerWorld
    : { x: 0, y: 0 };

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
    enemyCompetingDuringPlayer: 0,
    sameRegisterOverlapDuringPlayer: 0,
    playerStepEmitted: false,
    playerLikelyAudible: false,
  };
  let queuedStepEvents = 0;
  let drainedStepEvents = 0;
  const playerStepDirective = helpers.getPlayerInstrumentStepDirective?.(stepIndex, beatIndex) || { emit: true, mode: 'free_fire', reason: 'default' };

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
  {
    const finishCollectPerf = createDirectPerfMark('pickupsCombat.weaponRuntime.stepChange.processEvents.collect');
    let spawnerEvents = [];
    let drawSnakeEvents = [];
    let composerEvents = [];
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

    rawEnemyEvents = [
      ...spawnerEvents,
      ...drawSnakeEvents,
      ...composerEvents,
    ];

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
    finishCollectPerf();
  }

  const withPlayerDuck = (ev) => {
    if (!playerLikelyAudible || !ev || typeof ev !== 'object') return ev;
    const action = String(ev.actionType || '').trim().toLowerCase();
    if (
      !action
      || action === 'player-weapon-step'
      || action === 'spawner-spawn'
      || action === 'drawsnake-projectile'
      || action === 'composer-group-projectile'
      || action === 'composer-group-explosion'
    ) return ev;
    const payload = ev?.payload && typeof ev.payload === 'object' ? ev.payload : {};
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
  const primaryLoopLaneActive = primaryLoopLaneRuntime
    && typeof primaryLoopLaneRuntime === 'object'
    && Math.max(0, Math.trunc(Number(primaryLoopLaneRuntime.performerEnemyId) || 0)) > 0
    && String(primaryLoopLaneRuntime.continuityId || '').trim();
  const isPrimaryLoopLaneCandidate = (ev) => {
    if (!primaryLoopLaneActive || !ev || typeof ev !== 'object') return false;
    const payload = ev?.payload && typeof ev.payload === 'object' ? ev.payload : {};
    const action = String(ev?.actionType || '').trim().toLowerCase();
    const role = String(ev?.role || payload?.musicRole || '').trim().toLowerCase();
    const continuityId = String(payload?.continuityId || '').trim().toLowerCase();
    const groupId = Math.max(0, Math.trunc(Number(payload?.groupId) || 0));
    const actorId = Math.max(0, Math.trunc(Number(ev?.actorId) || 0));
    const laneContinuityId = String(primaryLoopLaneRuntime?.continuityId || '').trim().toLowerCase();
    const laneGroupId = Math.max(0, Math.trunc(Number(primaryLoopLaneRuntime?.performerGroupId) || 0));
    const laneActorId = Math.max(0, Math.trunc(Number(primaryLoopLaneRuntime?.performerEnemyId) || 0));
    const actionIsLoopLike = action === 'drawsnake-projectile'
      || action === 'composer-group-projectile'
      || action === 'composer-group-explosion';
    const roleIsPrimaryLoopLike = role === 'lead'
      || String(payload?.musicLaneId || '').trim().toLowerCase() === 'primary_loop_lane';
    if (!actionIsLoopLike || !roleIsPrimaryLoopLike) return false;
    if (laneContinuityId && continuityId && continuityId === laneContinuityId) return true;
    if (laneGroupId > 0 && groupId > 0 && groupId === laneGroupId) return true;
    if (laneActorId > 0 && actorId > 0 && actorId === laneActorId) return true;
    return false;
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
  {
  const finishShapePerf = createDirectPerfMark('pickupsCombat.weaponRuntime.stepChange.processEvents.shape');
  {
    const finishShapeCollapsePerf = createDirectPerfMark('pickupsCombat.weaponRuntime.stepChange.processEvents.shape.collapse');
    const primaryLoopLaneCandidates = primaryLoopLaneActive
      ? effectiveEnemyEvents.filter((ev) => isPrimaryLoopLaneCandidate(ev))
      : [];
    if (primaryLoopLaneCandidates.length > 1) {
      const ranked = primaryLoopLaneCandidates
        .map((ev, idx) => ({ ev, idx, score: scorePrimaryLoopLaneCandidate(ev, idx) }))
        .sort((a, b) => (b.score - a.score) || (a.idx - b.idx));
      const chosenPrimaryLoop = ranked[0]?.ev || null;
      if (chosenPrimaryLoop) {
        const chosenPayload = chosenPrimaryLoop?.payload && typeof chosenPrimaryLoop.payload === 'object'
          ? chosenPrimaryLoop.payload
          : {};
        effectiveEnemyEvents = effectiveEnemyEvents.filter((ev) => !isPrimaryLoopLaneCandidate(ev));
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
            candidateCount: primaryLoopLaneCandidates.length,
            keptActorId: Math.max(0, Math.trunc(Number(chosenPrimaryLoop?.actorId) || 0)),
            keptActionType: String(chosenPrimaryLoop?.actionType || '').trim().toLowerCase(),
            continuityId: String(chosenPayload?.continuityId || primaryLoopLaneRuntime?.continuityId || '').trim(),
          }, { beatIndex, stepIndex, barIndex });
        } catch {}
      }
    } else if (primaryLoopLaneCandidates.length === 1) {
      const chosenPrimaryLoop = primaryLoopLaneCandidates[0];
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
    const foundationCandidates = effectiveEnemyEvents.filter((ev) => {
      const payload = ev?.payload && typeof ev.payload === 'object' ? ev.payload : {};
      const role = String(ev?.role || payload?.musicRole || '').trim().toLowerCase();
      const action = String(ev?.actionType || '').trim().toLowerCase();
      return role === 'bass'
        || String(payload?.musicLayer || '').trim().toLowerCase() === 'foundation'
        || action === 'spawner-spawn'
        || action === 'composer-group-projectile';
    });
    if (foundationCandidates.length > 1) {
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
      const ranked = foundationCandidates
        .map((ev, idx) => ({ ev, idx, score: scoreFoundationCandidate(ev, idx) }))
        .sort((a, b) => (b.score - a.score) || (a.idx - b.idx));
      const chosenFoundation = ranked[0]?.ev || null;
      effectiveEnemyEvents = effectiveEnemyEvents.filter((ev) => {
        const payload = ev?.payload && typeof ev.payload === 'object' ? ev.payload : {};
        const role = String(ev?.role || payload?.musicRole || '').trim().toLowerCase();
        const action = String(ev?.actionType || '').trim().toLowerCase();
        const isFoundation = role === 'bass'
          || String(payload?.musicLayer || '').trim().toLowerCase() === 'foundation'
          || action === 'spawner-spawn'
          || action === 'composer-group-projectile';
        return !isFoundation || ev === chosenFoundation;
      });
      try {
        helpers.noteMusicSystemEvent?.('music_foundation_candidate_collapse', {
          candidateCount: foundationCandidates.length,
          keptActorId: Math.max(0, Math.trunc(Number(chosenFoundation?.actorId) || 0)),
          keptActionType: String(chosenFoundation?.actionType || '').trim().toLowerCase(),
        }, { beatIndex, stepIndex, barIndex });
      } catch {}
    }
    finishShapeCollapsePerf();
  }
  const hasBassEnemyEvent = effectiveEnemyEvents.some((ev) => String(ev?.role || '').trim().toLowerCase() === 'bass');
  if (hasBassEnemyEvent && typeof helpers.noteNaturalBassStep === 'function') {
    try { helpers.noteNaturalBassStep(stepIndex); } catch {}
  }
  {
    const finishShapeEmittersPerf = createDirectPerfMark('pickupsCombat.weaponRuntime.stepChange.processEvents.shape.emitters');
    if (foundationLaneActive && typeof helpers.createBassFoundationKeepaliveEvent === 'function') {
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
          return String(ev?.role || payload?.musicRole || '').trim().toLowerCase() !== 'bass';
        });
        effectiveEnemyEvents.push(keepalive);
        try { helpers.noteNaturalBassStep?.(stepIndex); } catch {}
        finishShapeEmittersBassReplacePerf();
      }
      finishShapeEmittersBassPerf();
    } else if (!hasBassEnemyEvent && typeof helpers.createBassFoundationKeepaliveEvent === 'function') {
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
    if (typeof helpers.createPrimaryLoopLaneEvent === 'function') {
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
    finishShapeEmittersPerf();
  }
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
    const safeProminence = (
      prominence === 'suppressed' || prominence === 'trace' || prominence === 'quiet' || prominence === 'full'
    ) ? prominence : 'full';
    const foundationAssignedBefore = prominenceState.foundationAssigned === true;
    const deconflictedProminence = (() => {
      if (!playerLikelyAudible) return safeProminence;
      if (safeProminence !== 'full' && safeProminence !== 'quiet') return safeProminence;
      // Preserve the tune skeleton under player fire: foundation stays anchored,
      // one loop voice can remain quiet, sparkle stays background-only.
      if (safeLayer === 'foundation' && safeProminence === 'full') return 'full';
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
  const loopEstablishingWindowSteps = 16;
  const prominenceRank = { suppressed: 0, trace: 1, quiet: 2, full: 3 };
  const layerBudgets = { foundation: 1, loops: 1, sparkle: 1 };
  const profiledAnnotated = profiledEnemyEvents.map((ev, idx) => {
    const payload = ev?.payload && typeof ev.payload === 'object' ? ev.payload : {};
    const layer = String(payload.musicLayer || 'sparkle').trim().toLowerCase();
    const safeLayer = (layer === 'foundation' || layer === 'loops' || layer === 'sparkle') ? layer : 'sparkle';
    const prominence = String(payload.musicProminence || 'full').trim().toLowerCase();
    const safeProminence = (
      prominence === 'suppressed' || prominence === 'trace' || prominence === 'quiet' || prominence === 'full'
    ) ? prominence : 'full';
    const role = String(payload.musicRole || ev?.role || '').trim().toLowerCase();
    const register = String(payload.musicRegister || '').trim().toLowerCase();
    const enemyType = String(ev?.enemyType || payload?.enemyType || '').trim().toLowerCase();
    const musicLaneId = String(payload.musicLaneId || '').trim().toLowerCase();
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
    const isEstablishingForegroundLoop = isCurrentForegroundLoop
      && currentForegroundIdentityStartStep >= 0
      && (stepIndex - currentForegroundIdentityStartStep) < loopEstablishingWindowSteps;
    let score = 0;
    if (safeLayer === 'foundation') score += 1000;
    else if (safeLayer === 'loops') score += 700;
    else score += 300;
    if (isPrimaryLoopLaneEvent) score += 220;
    score += (prominenceRank[safeProminence] || 0) * 40;
    if (safeLayer === 'foundation' && playerLikelyAudible) score += 180;
    if (isCurrentForegroundLoop) score += 140;
    if (isEstablishingForegroundLoop) score += 120;
    if (safeLayer === 'loops' && safeProminence === 'full') score += 60;
    if (safeLayer === 'sparkle' && String(ev?.actionType || '').trim().toLowerCase() === 'enemy-death-accent') score += 40;
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
      isEstablishingForegroundLoop,
      isPrimaryLoopLaneEvent,
      score,
      duplicateKey: [
        safeLayer,
        role || 'role',
        register || 'register',
        noteResolved || 'note',
      ].join('|'),
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
  const sortedForSelection = profiledAnnotated
    .slice()
    .sort((a, b) => (b.score - a.score) || (a.idx - b.idx));
  for (const item of sortedForSelection) {
    const duplicateWinner = duplicateWinnerByKey.get(item.duplicateKey);
    if (duplicateWinner && duplicateWinner !== item) continue;
    const bucket = keptByLayer[item.layer] || [];
    const budget = Math.max(0, Math.trunc(Number(layerBudgets[item.layer]) || 0));
    if (bucket.length >= budget) continue;
    bucket.push(item);
    selectedIds.add(item.idx);
    if (keptByLayer[item.layer] !== bucket) keptByLayer[item.layer] = bucket;
  }
  const foundationSelected = keptByLayer.foundation.length > 0;

  const arbitratedEnemyEvents = profiledAnnotated.map((item) => {
    const finalProminence = (() => {
      if (selectedIds.has(item.idx)) {
        if (item.layer === 'foundation') return 'full';
        if (item.layer === 'loops') {
          if (item.isPrimaryLoopLaneEvent) {
            if (foundationSelected) {
              if (item.isEstablishingForegroundLoop && !playerLikelyAudible) return 'full';
              return 'quiet';
            }
            if (playerLikelyAudible) return item.isEstablishingForegroundLoop ? 'full' : 'quiet';
            return 'full';
          }
          if (foundationSelected && playerLikelyAudible) {
            if (item.isEstablishingForegroundLoop) return 'quiet';
            return item.isCurrentForegroundLoop ? 'quiet' : 'trace';
          }
          if (item.isEstablishingForegroundLoop) return 'full';
          return item.isCurrentForegroundLoop ? 'full' : (item.prominence === 'trace' ? 'quiet' : item.prominence);
        }
        if (foundationSelected && playerLikelyAudible) return 'suppressed';
        return item.prominence === 'full' ? 'quiet' : item.prominence;
      }
      if (item.layer === 'foundation') return 'suppressed';
      return 'suppressed';
    })();
    if (finalProminence === item.prominence) return item.ev;
    return {
      ...item.ev,
      payload: {
        ...item.payload,
        musicProminence: finalProminence,
      },
    };
  });

  for (let idx = 0; idx < arbitratedEnemyEvents.length; idx += 1) {
    const profiled = arbitratedEnemyEvents[idx];
    const payload = profiled?.payload && typeof profiled.payload === 'object' ? profiled.payload : {};
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
          playerLikelyAudible,
        }, { beatIndex, stepIndex, barIndex });
      } catch {}
    }
    if (safeProminence === 'suppressed') continue;
    if (layerStepStats[safeLayer]) layerStepStats[safeLayer][safeProminence] += 1;
    readabilityStepStats.enemyEvents += 1;
    if (safeProminence === 'full') readabilityStepStats.enemyForegroundEvents += 1;
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

  const emittedEnemyEvents = arbitratedEnemyEvents.filter((ev) => {
    const payload = ev?.payload && typeof ev.payload === 'object' ? ev.payload : {};
    return String(payload.musicProminence || 'full').trim().toLowerCase() !== 'suppressed';
  });
  const hasEmittedFoundationEvent = emittedEnemyEvents.some((ev) => {
    const payload = ev?.payload && typeof ev.payload === 'object' ? ev.payload : {};
    return String(payload.musicLayer || '').trim().toLowerCase() === 'foundation'
      || String(ev?.role || payload?.musicRole || '').trim().toLowerCase() === 'bass';
  });
  if (
    foundationLaneActive
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
    if (playerTuneAuthoredStep) {
      return (stepIndex % 2) === 0;
    }
    return false;
  })();
  const basePlayerSoundVolumeMult = foundationSelected
    ? (primaryLoopForegroundPresent ? 0.58 : 0.72)
    : 1;
  const stagedSoundCount = emittedEnemyEvents.reduce((sum, ev) => {
    const payload = ev?.payload && typeof ev.payload === 'object' ? ev.payload : {};
    const prominence = String(payload.musicProminence || 'full').trim().toLowerCase();
    return sum + ((prominence === 'full' || prominence === 'quiet') ? 1 : 0);
  }, shouldEmitPlayerStepFinal ? 1 : 0);
  const globalStepGainScale = stagedSoundCount <= 1
    ? 1
    : (stagedSoundCount === 2 ? 0.9 : (stagedSoundCount === 3 ? 0.8 : 0.72));
  const stagedEnemyEvents = emittedEnemyEvents.map((ev) => {
    const payload = ev?.payload && typeof ev.payload === 'object' ? ev.payload : {};
    const baseAudioGain = Number(payload.audioGain == null ? 1 : payload.audioGain);
    const nextAudioGain = Math.max(0, Math.min(1, (Number.isFinite(baseAudioGain) ? baseAudioGain : 1) * globalStepGainScale));
    if (nextAudioGain === baseAudioGain) return ev;
    return {
      ...ev,
      payload: {
        ...payload,
        audioGain: nextAudioGain,
        globalStepGainScale,
        stagedSoundCount,
      },
    };
  });
  const playerSoundVolumeMult = basePlayerSoundVolumeMult * globalStepGainScale;

  stepEvents = [
    ...stagedEnemyEvents,
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
  readabilityStepStats.playerStepEmitted = shouldEmitPlayerStep;
  readabilityStepStats.playerLikelyAudible = playerLikelyAudible;
  finishArbitratePerf();
  }

  {
  const finishQueuePerf = createDirectPerfMark('pickupsCombat.weaponRuntime.stepChange.processEvents.queue');
  for (const ev of stepEvents) {
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
    const drained = helpers.director?.drainBeatEventsForStep?.(beatIndex, stepIndex) || [];
    for (const ev of drained) {
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
