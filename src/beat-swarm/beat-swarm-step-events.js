export function processBeatSwarmStepEventsRuntime(options = null) {
  const constants = options?.constants && typeof options.constants === 'object' ? options.constants : {};
  const helpers = options?.helpers && typeof options.helpers === 'object' ? options.helpers : {};
  const state = options?.state && typeof options.state === 'object' ? options.state : {};

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
  const shouldEmitPlayerStep = playerStepDirective.emit === true || playerTuneAuthoredStep;
  const playerLikelyAudible = shouldEmitPlayerStep
    && helpers.isPlayerWeaponStepLikelyAudible?.(stepIndex) === true;
  const spawnerStep = helpers.collectSpawnerStepBeatEvents?.(stepIndex, beatIndex);
  if (spawnerStep?.stats && typeof spawnerStep.stats === 'object') {
    spawnerStepStats = spawnerStep.stats;
  }

  const rawEnemyEvents = [
    ...(Array.isArray(spawnerStep?.events) ? spawnerStep.events : []),
    ...(helpers.collectDrawSnakeStepBeatEvents?.(stepIndex, beatIndex) || []),
    ...(helpers.collectComposerGroupStepBeatEvents?.(stepIndex, beatIndex) || []),
  ];

  let enemyKeepCount = 0;
  const filteredEnemyEvents = playerLikelyAudible
    ? rawEnemyEvents.filter((ev) => {
      const keep = helpers.shouldKeepEnemyEventDuringPlayerStep?.(ev, enemyKeepCount) === true;
      if (keep) enemyKeepCount += 1;
      return keep;
    })
    : rawEnemyEvents;

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
        musicRole: String(identity?.role || ev?.role || payload?.musicRole || '').trim().toLowerCase(),
        musicRegister: String(identity?.register || payload?.musicRegister || '').trim().toLowerCase(),
        musicInstrumentFamily: String(identity?.instrumentFamily || payload?.musicInstrumentFamily || '').trim().toLowerCase(),
        onboardingPriority: Math.max(0, Math.min(1, Number(identity?.onboardingPriority) || Number(payload?.onboardingPriority) || 0)),
        onboardingPhase: String(onboardingDirective?.id || payload?.onboardingPhase || '').trim().toLowerCase(),
      },
    };
  };

  let effectiveEnemyEvents = Array.isArray(filteredEnemyEvents) ? filteredEnemyEvents.slice() : [];
  const hasBassEnemyEvent = effectiveEnemyEvents.some((ev) => String(ev?.role || '').trim().toLowerCase() === 'bass');
  if (hasBassEnemyEvent && typeof helpers.noteNaturalBassStep === 'function') {
    try { helpers.noteNaturalBassStep(stepIndex); } catch {}
  }
  if (!hasBassEnemyEvent && typeof helpers.createBassFoundationKeepaliveEvent === 'function') {
    const keepalive = helpers.createBassFoundationKeepaliveEvent({
      beatIndex,
      stepIndex,
      barIndex,
      centerWorld,
      playerLikelyAudible,
    });
    if (keepalive && typeof keepalive === 'object') {
      effectiveEnemyEvents.push(keepalive);
    }
  }

  const prominenceState = { foregroundAssigned: 0, sparkleAssigned: 0, foundationAssigned: false };
  const profiledEnemyEvents = effectiveEnemyEvents.map((ev, idx) => {
    const profiled = withEnemyProminence(withPlayerDuck(ev), idx, filteredEnemyEvents.length, prominenceState);
    const payload = profiled?.payload && typeof profiled.payload === 'object' ? profiled.payload : {};
    const layer = String(payload.musicLayer || 'sparkle').trim().toLowerCase();
    const prominence = String(payload.musicProminence || 'full').trim().toLowerCase();
    const safeLayer = (layer === 'foundation' || layer === 'loops' || layer === 'sparkle') ? layer : 'sparkle';
    const safeProminence = (
      prominence === 'suppressed' || prominence === 'trace' || prominence === 'quiet' || prominence === 'full'
    ) ? prominence : 'full';
    const foundationAssignedBefore = prominenceState.foundationAssigned === true;
    const deconflictedProminence = (() => {
      if (!playerLikelyAudible) return safeProminence;
      if (safeProminence !== 'full' && safeProminence !== 'quiet') return safeProminence;
      // Preserve foundation full hits; loop events are kept present but ducked under player.
      if (safeLayer === 'foundation' && safeProminence === 'full') return 'full';
      if (safeLayer === 'sparkle') return 'trace';
      return 'quiet';
    })();
    const register = String(payload.musicRegister || '').trim().toLowerCase();
    if (layerStepStats[safeLayer]) layerStepStats[safeLayer][deconflictedProminence] += 1;
    readabilityStepStats.enemyEvents += 1;
    if (deconflictedProminence === 'full') readabilityStepStats.enemyForegroundEvents += 1;
    if (playerLikelyAudible && (deconflictedProminence === 'full' || deconflictedProminence === 'quiet')) {
      readabilityStepStats.enemyCompetingDuringPlayer += 1;
      if (register === 'mid' || register === 'mid_high') {
        readabilityStepStats.sameRegisterOverlapDuringPlayer += 1;
      }
    }
    if (deconflictedProminence === 'full') prominenceState.foregroundAssigned += 1;
    if (safeLayer === 'sparkle' && deconflictedProminence !== 'suppressed') prominenceState.sparkleAssigned += 1;
    if (safeLayer === 'foundation' && deconflictedProminence !== 'suppressed') prominenceState.foundationAssigned = true;
    if (safeLayer === 'foundation') {
      try {
        helpers.noteMusicSystemEvent?.('music_foundation_prominence_decision', {
          actorId: Math.max(0, Math.trunc(Number(profiled?.actorId) || 0)),
          actionType: String(profiled?.actionType || '').trim().toLowerCase(),
          role: String(profiled?.role || payload?.musicRole || '').trim().toLowerCase(),
          requestedProminence: safeProminence,
          finalProminence: deconflictedProminence,
          changedByDeconflict: deconflictedProminence !== safeProminence,
          playerLikelyAudible,
          foundationAssignedBefore,
          foundationAssignedAfter: prominenceState.foundationAssigned === true,
          enemyIndex: Math.max(0, Math.trunc(Number(idx) || 0)),
          totalEnemyEvents: Math.max(0, Math.trunc(Number(effectiveEnemyEvents.length) || 0)),
        }, { beatIndex, stepIndex, barIndex });
      } catch {}
    }
    if (deconflictedProminence !== 'suppressed') {
      try {
        helpers.noteEnemyMusicIdentityExposure?.({
          enemyType: String(profiled?.enemyType || profiled?.payload?.enemyType || '').trim().toLowerCase(),
          musicRole: String(payload.musicRole || '').trim().toLowerCase(),
          musicLayer: safeLayer,
        }, barIndex);
      } catch {}
    }
    if (deconflictedProminence === safeProminence) return profiled;
    return {
      ...profiled,
      payload: {
        ...payload,
        musicProminence: deconflictedProminence,
      },
    };
  });

  const stepEvents = [
    ...profiledEnemyEvents,
    shouldEmitPlayerStep
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

  const drained = helpers.director?.drainBeatEventsForStep?.(beatIndex, stepIndex) || [];
  for (const ev of drained) {
    if (helpers.executePerformedBeatEvent?.(ev)) drainedStepEvents += 1;
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
