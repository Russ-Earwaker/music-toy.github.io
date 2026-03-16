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
  const shouldEmitPlayerStep = (() => {
    if (!(playerStepDirective.emit === true || playerTuneAuthoredStep)) return false;
    const mode = String(playerStepDirective.mode || '').trim().toLowerCase();
    if (!playerTuneAuthoredStep && mode === 'guided_fire') return (stepIndex % 2) === 0;
    return true;
  })();
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
    const continuityId = String(payload.continuityId || '').trim().toLowerCase();
    const noteResolved = String(ev?.noteResolved || ev?.note || payload?.noteResolved || payload?.requestedNoteRaw || '').trim().toLowerCase();
    const identityKey = [
      continuityId,
      enemyType || 'unknown',
      role || 'accent',
      safeLayer,
    ].filter(Boolean).join('|');
    const isCurrentForegroundLoop = safeLayer === 'loops'
      && currentForegroundIdentityLayer === 'loops'
      && !!currentForegroundIdentityKey
      && identityKey === currentForegroundIdentityKey;
    let score = 0;
    if (safeLayer === 'foundation') score += 1000;
    else if (safeLayer === 'loops') score += 700;
    else score += 300;
    score += (prominenceRank[safeProminence] || 0) * 40;
    if (safeLayer === 'foundation' && playerLikelyAudible) score += 180;
    if (isCurrentForegroundLoop) score += 140;
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
          if (foundationSelected && playerLikelyAudible) return item.isCurrentForegroundLoop ? 'quiet' : 'trace';
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

  const stepEvents = [
    ...emittedEnemyEvents,
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
          foundationPresent: foundationSelected,
          playerSoundVolumeMult: foundationSelected ? 0.72 : 1,
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
