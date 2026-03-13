export function handleTransportStoppedBeatUpdateRuntime(options = null) {
  const state = options?.state && typeof options.state === 'object' ? options.state : {};
  const constants = options?.constants && typeof options.constants === 'object' ? options.constants : {};
  const helpers = options?.helpers && typeof options.helpers === 'object' ? options.helpers : {};
  const director = options?.director || null;
  if (helpers.isRunning?.()) return false;

  state.lastBeatIndex = null;
  state.lastWeaponTuneStepIndex = null;
  state.lastSpawnerEnemyStepIndex = null;
  if (state.musicLayerRuntime) {
    state.musicLayerRuntime.foundationAnchorBar = -1;
    state.musicLayerRuntime.foundationAnchorSectionId = '';
    state.musicLayerRuntime.lastFoundationBar = -1;
    state.musicLayerRuntime.foundationAnchorStep = -1;
    state.musicLayerRuntime.foundationIdentityKey = '';
    state.musicLayerRuntime.foundationIdentityStartStep = -1;
    state.musicLayerRuntime.lastFoundationStep = -1;
    state.musicLayerRuntime.foundationLastFullBar = -1;
    state.musicLayerRuntime.foundationLastFullStep = -1;
    state.musicLayerRuntime.foundationConsecutiveQuietEvents = 0;
    state.musicLayerRuntime.sparkleBarIndex = -1;
    state.musicLayerRuntime.sparkleEventsInBar = 0;
  }
  if (state.loopAdmissionRuntime) {
    state.loopAdmissionRuntime.identityFirstForegroundStep?.clear?.();
    state.loopAdmissionRuntime.currentForegroundIdentityKey = '';
    state.loopAdmissionRuntime.currentForegroundIdentityStartStep = -1;
    state.loopAdmissionRuntime.currentForegroundIdentityLayer = '';
    state.loopAdmissionRuntime.lastMajorIdentityIntroStep = -1;
  }
  if (state.musicIdentityVisualRuntime) {
    state.musicIdentityVisualRuntime.colorByContinuityId?.clear?.();
    state.musicIdentityVisualRuntime.colorByInstrumentId?.clear?.();
  }
  if (state.onboardingRuntime) {
    state.onboardingRuntime.identityFirstHeardBar?.clear?.();
    state.onboardingRuntime.lastPhaseId = '';
  }
  if (state.sectionPresentationRuntime) {
    state.sectionPresentationRuntime.visibleUntilMs = 0;
    state.sectionPresentationRuntime.lastShownMs = 0;
    state.sectionPresentationRuntime.lastSectionKey = '';
  }
  helpers.hideSectionHeading?.();
  helpers.resetReadabilityMetricsRuntime?.(-1);
  const beatsPerBar = Math.max(1, Math.trunc(Number(constants.composerBeatsPerBar) || 1));
  const baseBeat = Math.max(0, Math.trunc(Number(state.currentBeatIndex) || 0));
  const barIndex = Math.floor(baseBeat / beatsPerBar);
  state.swarmPacingRuntime?.reset?.(barIndex);
  helpers.resetEnergyStateRuntime?.(barIndex);
  helpers.resetEnergyGravityRuntime?.();
  director?.reset?.();
  director?.syncToBeat?.(baseBeat);
  const snap = director?.getSnapshot?.() || null;
  helpers.updateSwarmDirectorDebugHud?.({
    reason: 'transport-stopped',
    stepChanged: false,
    beatChanged: false,
    beatIndex: state.currentBeatIndex,
    stepIndex: Math.max(0, Math.trunc(Number(snap?.stepIndex) || 0)),
    spawnerActiveCount: 0,
    spawnerTriggeredCount: 0,
    spawnerSpawnCount: 0,
    directorState: snap,
  });
  return true;
}

export function handleBeatPreludeRuntime(options = null) {
  const director = options?.director || null;
  const state = options?.state && typeof options.state === 'object' ? options.state : {};
  const helpers = options?.helpers && typeof options.helpers === 'object' ? options.helpers : {};

  const info = helpers.getLoopInfo?.();
  const tick = director?.updateFromLoopInfo?.(info) || null;
  if (!tick?.valid) return null;

  const beatLen = Math.max(0, Number(info?.beatLen) || 0);
  if (!(beatLen > 0)) return null;

  const beatIndex = Math.max(0, Math.trunc(Number(tick.beatIndex) || 0));
  const stepIndex = Math.max(0, Math.trunc(Number(tick.stepIndex) || 0));
  const barIndex = Math.max(0, Math.trunc(Number(tick.barIndex) || 0));

  state.currentBeatIndex = beatIndex;
  state.swarmPacingRuntime?.updateForBar?.(barIndex);
  state.swarmPaletteRuntime?.updateForBar?.(barIndex);
  helpers.applyEnergyStateForBar?.(barIndex);
  helpers.updateComposerForBeat?.(beatIndex);

  const pacingSnapshot = state.swarmPacingRuntime?.getSnapshot?.() || null;
  const paletteSnapshot = state.swarmPaletteRuntime?.getSnapshot?.() || null;
  return {
    info,
    tick,
    beatLen,
    beatIndex,
    stepIndex,
    barIndex,
    pacingSnapshot,
    paletteSnapshot,
  };
}

export function updateMusicLabSignaturesRuntime(options = null) {
  const beatIndex = Math.max(0, Math.trunc(Number(options?.beatIndex) || 0));
  const barIndex = Math.max(0, Math.trunc(Number(options?.barIndex) || 0));
  const pacingSnapshot = options?.pacingSnapshot || null;
  const paletteSnapshot = options?.paletteSnapshot || null;
  const state = options?.state && typeof options.state === 'object' ? options.state : {};
  const helpers = options?.helpers && typeof options.helpers === 'object' ? options.helpers : {};

  const pacingSignature = [
    String(pacingSnapshot?.state || ''),
    Math.max(0, Math.trunc(Number(pacingSnapshot?.stateStartBar) || 0)),
    String(pacingSnapshot?.responseMode || ''),
    Math.max(0, Math.trunc(Number(pacingSnapshot?.cycle) || 0)),
  ].join('|');
  if (pacingSignature && pacingSignature !== String(state.musicLabLastPacingSignature || '')) {
    state.musicLabLastPacingSignature = pacingSignature;
    try {
      helpers.swarmMusicLab?.notePacingChange?.(pacingSnapshot, helpers.getMusicLabContext?.({ beatIndex, barIndex }));
    } catch {}
  }

  const paletteSignature = [
    String(paletteSnapshot?.id || ''),
    Math.max(0, Math.trunc(Number(paletteSnapshot?.paletteIndex) || 0)),
    String(paletteSnapshot?.theme || ''),
    String(paletteSnapshot?.roles?.bass || ''),
    String(paletteSnapshot?.roles?.lead || ''),
    String(paletteSnapshot?.roles?.accent || ''),
    String(paletteSnapshot?.roles?.motion || ''),
  ].join('|');
  if (paletteSignature && paletteSignature !== String(state.musicLabLastPaletteSignature || '')) {
    state.musicLabLastPaletteSignature = paletteSignature;
    try {
      helpers.swarmMusicLab?.notePaletteChange?.(paletteSnapshot, helpers.getMusicLabContext?.({ beatIndex, barIndex }));
    } catch {}
  }
}

export function handleBeatStepChangeRuntime(options = null) {
  const beatIndex = Math.max(0, Math.trunc(Number(options?.beatIndex) || 0));
  const stepIndex = Math.max(0, Math.trunc(Number(options?.stepIndex) || 0));
  const barIndex = Math.max(0, Math.trunc(Number(options?.barIndex) || 0));
  const centerWorld = options?.centerWorld || null;
  const tick = options?.tick || null;
  const state = options?.state && typeof options.state === 'object' ? options.state : {};
  const constants = options?.constants && typeof options.constants === 'object' ? options.constants : {};
  const helpers = options?.helpers && typeof options.helpers === 'object' ? options.helpers : {};
  const director = options?.director || null;

  let spawnerStepStats = { activeSpawners: 0, triggeredSpawners: 0, spawnedEnemies: 0 };
  let onboardingPhase = '';
  let layerStepStats = null;
  let readabilityStepStats = null;
  let queuedStepEvents = 0;
  let drainedStepEvents = 0;

  const stepChanged = !!tick?.stepChanged
    || stepIndex !== Math.trunc(Number(state.lastSpawnerEnemyStepIndex) || 0)
    || stepIndex !== Math.trunc(Number(state.lastWeaponTuneStepIndex) || 0);

  if (stepChanged) {
    const tuneSteps = Math.max(1, Math.trunc(Number(constants.weaponTuneSteps) || 1));
    if ((stepIndex % tuneSteps) === 0) {
      helpers.noteBassFoundationOwnerState?.('bar_boundary', { beatIndex, stepIndex, barIndex });
    }
    const stepResult = helpers.processBeatSwarmStepEventsRuntime?.({
      constants: {
        roles: constants.roles,
        threat: constants.threat,
      },
      helpers: {
        isPlayerWeaponStepLikelyAudible: helpers.isPlayerWeaponStepLikelyAudible,
        isPlayerWeaponTuneStepAuthoredActive: helpers.isPlayerWeaponTuneStepAuthoredActive,
        collectSpawnerStepBeatEvents: helpers.collectSpawnerStepBeatEvents,
        collectDrawSnakeStepBeatEvents: helpers.collectDrawSnakeStepBeatEvents,
        collectComposerGroupStepBeatEvents: helpers.collectComposerGroupStepBeatEvents,
        getPlayerInstrumentStepDirective: helpers.getPlayerInstrumentStepDirective,
        getEnemyMusicIdentityProfile: helpers.getEnemyMusicIdentityProfile,
        getEnemyEventMusicLayer: helpers.getEnemyEventMusicLayer,
        getEnemyEventMusicProminence: helpers.getEnemyEventMusicProminence,
        getOnboardingReadabilityDirective: helpers.getOnboardingReadabilityDirective,
        noteEnemyMusicIdentityExposure: helpers.noteEnemyMusicIdentityExposure,
        noteNaturalBassStep: helpers.noteNaturalBassStepRuntime,
        createBassFoundationKeepaliveEvent: helpers.createBassFoundationKeepaliveEventRuntime,
        noteMusicSystemEvent: helpers.noteMusicSystemEvent,
        shouldKeepEnemyEventDuringPlayerStep: helpers.shouldKeepEnemyEventDuringPlayerStep,
        createLoggedPerformedBeatEvent: helpers.createLoggedPerformedBeatEvent,
        executePerformedBeatEvent: helpers.executePerformedBeatEvent,
        director,
        swarmMusicLab: helpers.swarmMusicLab,
        getMusicLabContext: helpers.getMusicLabContext,
      },
      state: {
        beatIndex,
        stepIndex,
        barIndex,
        centerWorld,
      },
    }) || null;
    helpers.foldStepMetricsIntoReadabilityRuntime?.(stepResult, barIndex, beatIndex);
    spawnerStepStats = stepResult?.spawnerStepStats || spawnerStepStats;
    onboardingPhase = String(stepResult?.onboardingPhase || '').trim().toLowerCase();
    layerStepStats = stepResult?.layerStepStats || layerStepStats;
    readabilityStepStats = stepResult?.readabilityStepStats || readabilityStepStats;
    queuedStepEvents += Math.max(0, Math.trunc(Number(stepResult?.queuedStepEvents) || 0));
    drainedStepEvents += Math.max(0, Math.trunc(Number(stepResult?.drainedStepEvents) || 0));
    state.lastSpawnerEnemyStepIndex = stepIndex;
    state.lastWeaponTuneStepIndex = stepIndex;
    helpers.pushSwarmStepDebugEvent?.({
      beat: beatIndex,
      step: stepIndex,
      activeSpawners: Number(spawnerStepStats?.activeSpawners) || 0,
      triggeredSpawners: Number(spawnerStepStats?.triggeredSpawners) || 0,
      onboardingPhase: onboardingPhase || undefined,
      layerStepStats: layerStepStats || undefined,
      readabilityStepStats: readabilityStepStats || undefined,
      stepChanged: true,
      source: 'updateBeatWeapons',
    });
  }

  return {
    stepChanged,
    spawnerStepStats,
    onboardingPhase,
    layerStepStats,
    readabilityStepStats,
    queuedStepEvents,
    drainedStepEvents,
  };
}

export function handleBeatTailRuntime(options = null) {
  const beatIndex = Math.max(0, Math.trunc(Number(options?.beatIndex) || 0));
  const stepIndex = Math.max(0, Math.trunc(Number(options?.stepIndex) || 0));
  const barIndex = Math.max(0, Math.trunc(Number(options?.barIndex) || 0));
  const beatLen = Math.max(0, Number(options?.beatLen) || 0);
  const tick = options?.tick || null;
  const director = options?.director || null;
  const state = options?.state && typeof options.state === 'object' ? options.state : {};
  const constants = options?.constants && typeof options.constants === 'object' ? options.constants : {};
  const metrics = options?.metrics && typeof options.metrics === 'object' ? options.metrics : {};
  const helpers = options?.helpers && typeof options.helpers === 'object' ? options.helpers : {};

  const stepChanged = !!metrics.stepChanged;
  const spawnerStepStats = metrics.spawnerStepStats || { activeSpawners: 0, triggeredSpawners: 0, spawnedEnemies: 0 };
  const queuedStepEvents = Math.max(0, Math.trunc(Number(metrics.queuedStepEvents) || 0));
  const drainedStepEvents = Math.max(0, Math.trunc(Number(metrics.drainedStepEvents) || 0));

  const beatChanged = !!tick?.beatChanged || beatIndex !== Math.trunc(Number(state.lastBeatIndex) || 0);
  try {
    helpers.swarmMusicLab?.noteThreatBudgetSnapshot?.(director?.getSnapshot?.(), helpers.getMusicLabContext?.({
      beatIndex,
      stepIndex,
      barIndex,
    }));
  } catch {}
  const directorSnapshot = director?.getSnapshot?.() || null;
  helpers.updateSwarmDirectorDebugHud?.({
    reason: stepChanged ? 'step' : (beatChanged ? 'beat-only' : 'frame'),
    stepChanged,
    beatChanged,
    beatIndex,
    stepIndex,
    spawnerActiveCount: Number(spawnerStepStats?.activeSpawners) || 0,
    spawnerTriggeredCount: Number(spawnerStepStats?.triggeredSpawners) || 0,
    spawnerSpawnCount: Number(spawnerStepStats?.spawnedEnemies) || 0,
    queuedStepEvents,
    drainedStepEvents,
    directorState: directorSnapshot,
  });
  if (!beatChanged) return { beatChanged: false };

  if (!!helpers.shouldLogBeatSnapshots?.()) {
    try { console.log('[BeatSwarmDirector][beat]', directorSnapshot); } catch {}
  }
  state.lastBeatIndex = beatIndex;

  const releaseBeatLevelMax = Math.max(0, Math.trunc(Number(constants.swarmReleaseBeatLevelMax) || 0));
  if (state.active && Number(state.outerForceContinuousSeconds) >= beatLen) {
    if (!state.releaseForcePrimed) {
      state.releaseForcePrimed = true;
      state.barrierPushCharge = 1;
      state.releaseBeatLevel = 0;
      helpers.pulseReactiveArrowCharge?.();
    } else {
      const nextLevel = Math.min(releaseBeatLevelMax, Math.max(0, Number(state.releaseBeatLevel) || 0) + 1);
      if (nextLevel > (Number(state.releaseBeatLevel) || 0)) {
        state.releaseBeatLevel = nextLevel;
        helpers.pulseReactiveArrowCharge?.();
      }
    }
  }

  helpers.processPendingWeaponChains?.(beatIndex);
  helpers.applyLingeringAoeBeat?.(beatIndex);
  helpers.fireHelpersOnBeat?.(beatIndex);
  return { beatChanged: true };
}
