export function getBeatSwarmStabilitySmokeChecksRuntime(deps = {}) {
  const checks = [];
  const addCheck = (id, pass, detail = '') => {
    checks.push({
      id: String(id || '').trim() || 'unknown',
      pass: !!pass,
      detail: String(detail || ''),
    });
  };
  const helpers = deps.helpers && typeof deps.helpers === 'object' ? deps.helpers : {};
  const getPlayerWeaponSoundEventKeyForStage = typeof helpers.getPlayerWeaponSoundEventKeyForStage === 'function'
    ? helpers.getPlayerWeaponSoundEventKeyForStage
    : () => '';
  const resolveEnemyDeathEventKey = typeof helpers.resolveEnemyDeathEventKey === 'function'
    ? helpers.resolveEnemyDeathEventKey
    : () => '';
  const ensureSwarmDirector = typeof helpers.ensureSwarmDirector === 'function' ? helpers.ensureSwarmDirector : () => null;
  const getPacingSnapshot = typeof helpers.getPacingSnapshot === 'function' ? helpers.getPacingSnapshot : () => null;

  addCheck(
    'player-projectile-family',
    getPlayerWeaponSoundEventKeyForStage('projectile', 'standard') === 'playerProjectile',
    'projectile:standard should route to playerProjectile family'
  );
  addCheck(
    'player-boomerang-family',
    getPlayerWeaponSoundEventKeyForStage('projectile', 'boomerang') === 'boomerang',
    'projectile:boomerang should route to boomerang family'
  );
  addCheck(
    'player-hitscan-family',
    getPlayerWeaponSoundEventKeyForStage('laser', 'hitscan') === 'hitscan',
    'laser:hitscan should route to hitscan family'
  );
  addCheck(
    'player-beam-family',
    getPlayerWeaponSoundEventKeyForStage('laser', 'beam') === 'beam',
    'laser:beam should route to beam family'
  );
  addCheck(
    'player-explosion-family',
    getPlayerWeaponSoundEventKeyForStage('aoe', 'explosion') === 'explosion',
    'aoe:explosion should remain stable explosion family'
  );
  addCheck(
    'enemy-death-families',
    resolveEnemyDeathEventKey('small', '') === 'enemyDeathSmall'
      && resolveEnemyDeathEventKey('medium', '') === 'enemyDeathMedium'
      && resolveEnemyDeathEventKey('large', '') === 'enemyDeathLarge',
    'enemy deaths should resolve to small/medium/large families'
  );
  let directorReady = false;
  try {
    const director = ensureSwarmDirector();
    directorReady = !!director && typeof director.getSnapshot === 'function';
  } catch {}
  addCheck('director-runtime-ready', directorReady, 'director snapshot API should be available');
  let pacingReady = false;
  try {
    const snapshot = getPacingSnapshot();
    pacingReady = !!snapshot && typeof snapshot.stateId === 'string' && snapshot.stateId.length > 0;
  } catch {}
  addCheck('pacing-runtime-ready', pacingReady, 'pacing snapshot should include stateId');
  return {
    pass: checks.every((c) => c.pass),
    checks,
    failed: checks.filter((c) => !c.pass).map((c) => c.id),
  };
}

export function setPerfWeaponStageCountRuntime(deps = {}) {
  const nextCount = deps.nextCount;
  const helpers = deps.helpers && typeof deps.helpers === 'object' ? deps.helpers : {};
  const seedDefaultWeaponLoadout = typeof helpers.seedDefaultWeaponLoadout === 'function' ? helpers.seedDefaultWeaponLoadout : () => {};
  const getWeaponLoadout = typeof helpers.getWeaponLoadout === 'function' ? helpers.getWeaponLoadout : () => [];
  const setActiveWeaponSlot = typeof helpers.setActiveWeaponSlot === 'function' ? helpers.setActiveWeaponSlot : () => {};
  const clearRuntimeForWeaponSlot = typeof helpers.clearRuntimeForWeaponSlot === 'function' ? helpers.clearRuntimeForWeaponSlot : () => {};
  const clearHomingMissiles = typeof helpers.clearHomingMissiles === 'function' ? helpers.clearHomingMissiles : () => {};
  const clearPendingWeaponChainEvents = typeof helpers.clearPendingWeaponChainEvents === 'function' ? helpers.clearPendingWeaponChainEvents : () => {};
  const clearLingeringAoeZones = typeof helpers.clearLingeringAoeZones === 'function' ? helpers.clearLingeringAoeZones : () => {};
  const clearHelpers = typeof helpers.clearHelpers === 'function' ? helpers.clearHelpers : () => {};
  const clearProjectiles = typeof helpers.clearProjectiles === 'function' ? helpers.clearProjectiles : () => {};
  const clearEffects = typeof helpers.clearEffects === 'function' ? helpers.clearEffects : () => {};
  const renderPauseWeaponUi = typeof helpers.renderPauseWeaponUi === 'function' ? helpers.renderPauseWeaponUi : () => {};
  const persistBeatSwarmState = typeof helpers.persistBeatSwarmState === 'function' ? helpers.persistBeatSwarmState : () => {};
  const stageTemplates = [
    { archetype: 'projectile', variant: 'standard' },
    { archetype: 'aoe', variant: 'explosion' },
    { archetype: 'laser', variant: 'hitscan' },
    { archetype: 'projectile', variant: 'split-shot' },
    { archetype: 'projectile', variant: 'homing-missile' },
  ];
  const count = Math.max(1, Math.min(stageTemplates.length, Math.trunc(Number(nextCount) || 1)));
  seedDefaultWeaponLoadout();
  const weaponLoadout = getWeaponLoadout();
  if (weaponLoadout?.[0]) {
    weaponLoadout[0].stages = stageTemplates.slice(0, count).map((s) => ({ ...s }));
  }
  setActiveWeaponSlot(0);
  clearRuntimeForWeaponSlot(0);
  clearHomingMissiles();
  clearPendingWeaponChainEvents();
  clearLingeringAoeZones();
  clearHelpers();
  clearProjectiles();
  clearEffects();
  renderPauseWeaponUi();
  persistBeatSwarmState();
  return count;
}

export function spawnPerfEnemyDistributionRuntime(deps = {}) {
  const nextCount = deps.nextCount;
  const constants = deps.constants && typeof deps.constants === 'object' ? deps.constants : {};
  const state = deps.state && typeof deps.state === 'object' ? deps.state : {};
  const helpers = deps.helpers && typeof deps.helpers === 'object' ? deps.helpers : {};
  if (!state.active) return 0;
  const enemyTargetActiveCount = Math.max(1, Math.trunc(Number(constants.enemyTargetActiveCount) || 1));
  const target = Math.max(1, Math.min(enemyTargetActiveCount, Math.trunc(Number(nextCount) || 1)));
  const clearPendingEnemyDeaths = typeof helpers.clearPendingEnemyDeaths === 'function' ? helpers.clearPendingEnemyDeaths : () => {};
  const clearEnemies = typeof helpers.clearEnemies === 'function' ? helpers.clearEnemies : () => {};
  const getViewportSize = typeof helpers.getViewportSize === 'function'
    ? helpers.getViewportSize
    : () => ({ width: 800, height: 600 });
  const spawnEnemyAt = typeof helpers.spawnEnemyAt === 'function' ? helpers.spawnEnemyAt : () => {};
  const getEnemyCount = typeof helpers.getEnemyCount === 'function' ? helpers.getEnemyCount : () => 0;
  clearPendingEnemyDeaths();
  clearEnemies();
  const viewport = getViewportSize();
  const w = Math.max(240, Number(viewport?.width) || 0);
  const h = Math.max(180, Number(viewport?.height) || 0);
  const padX = Math.max(64, Math.round(w * 0.08));
  const padY = Math.max(56, Math.round(h * 0.1));
  const cols = Math.max(1, Math.ceil(Math.sqrt(target * 1.35)));
  const rows = Math.max(1, Math.ceil(target / cols));
  const usableW = Math.max(40, w - (padX * 2));
  const usableH = Math.max(40, h - (padY * 2));
  for (let i = 0; i < target; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const jitterX = (Math.random() * 2 - 1) * Math.min(18, usableW / Math.max(6, cols * 3));
    const jitterY = (Math.random() * 2 - 1) * Math.min(16, usableH / Math.max(6, rows * 3));
    const x = padX + ((col + 0.5) / cols) * usableW + jitterX;
    const y = padY + ((row + 0.5) / rows) * usableH + jitterY;
    spawnEnemyAt(Math.max(8, Math.min(w - 8, x)), Math.max(8, Math.min(h - 8, y)));
  }
  return getEnemyCount();
}

export function preparePerfScenarioRuntime(deps = {}) {
  const options = deps.options;
  const state = deps.state && typeof deps.state === 'object' ? deps.state : {};
  const helpers = deps.helpers && typeof deps.helpers === 'object' ? deps.helpers : {};
  if (!state.active) return false;
  const stageCount = Number(options?.stageCount);
  const autoMove = options?.autoMove;
  const autoMoveMagnitude = Number(options?.autoMoveMagnitude);
  state.velocityX = 0;
  state.velocityY = 0;
  state.dragPointerId = null;
  state.barrierPushingOut = false;
  state.barrierPushCharge = 0;
  state.releaseForcePrimed = false;
  state.releaseBeatLevel = 0;
  state.outerForceContinuousSeconds = 0;
  state.postReleaseAssistTimer = 0;
  const setPerfWeaponStageCount = typeof helpers.setPerfWeaponStageCount === 'function'
    ? helpers.setPerfWeaponStageCount
    : () => 1;
  const clearPendingEnemyDeaths = typeof helpers.clearPendingEnemyDeaths === 'function' ? helpers.clearPendingEnemyDeaths : () => {};
  const clearEnemies = typeof helpers.clearEnemies === 'function' ? helpers.clearEnemies : () => {};
  const setPerfAutoMove = typeof helpers.setPerfAutoMove === 'function'
    ? helpers.setPerfAutoMove
    : () => ({ enabled: true, magnitude: 0.82 });
  const getPerfAutoMove = typeof helpers.getPerfAutoMove === 'function'
    ? helpers.getPerfAutoMove
    : () => ({ enabled: true, magnitude: 0.82 });
  setPerfWeaponStageCount(Number.isFinite(stageCount) ? stageCount : 1);
  clearPendingEnemyDeaths();
  clearEnemies();
  setPerfAutoMove(
    autoMove == null ? true : !!autoMove,
    Number.isFinite(autoMoveMagnitude) ? autoMoveMagnitude : 0.82
  );
  return {
    ok: true,
    weaponStages: Number.isFinite(stageCount) ? Math.max(1, Math.trunc(stageCount)) : 1,
    autoMove: getPerfAutoMove(),
  };
}

export function createBeatSwarmPerfDebugToolsRuntime(deps = {}) {
  const constants = deps.constants && typeof deps.constants === 'object' ? deps.constants : {};
  const state = deps.state && typeof deps.state === 'object' ? deps.state : {};
  const helpers = deps.helpers && typeof deps.helpers === 'object' ? deps.helpers : {};
  const enemyTargetActiveCount = Math.max(1, Math.trunc(Number(constants.enemyTargetActiveCount) || 1));
  return {
    setPerfWeaponStageCount(nextCount = 2) {
      return setPerfWeaponStageCountRuntime({
        nextCount,
        helpers,
      });
    },
    spawnPerfEnemyDistribution(nextCount = enemyTargetActiveCount) {
      return spawnPerfEnemyDistributionRuntime({
        nextCount,
        constants: {
          enemyTargetActiveCount,
        },
        state: {
          active: !!state.getActive?.(),
        },
        helpers: {
          clearPendingEnemyDeaths: helpers.clearPendingEnemyDeaths,
          clearEnemies: helpers.clearEnemies,
          getViewportSize() {
            return {
              width: Number(helpers.windowObj?.innerWidth) || 0,
              height: Number(helpers.windowObj?.innerHeight) || 0,
            };
          },
          spawnEnemyAt: helpers.spawnEnemyAt,
          getEnemyCount() { return helpers.getEnemyCount?.() || 0; },
        },
      });
    },
    preparePerfScenario(options = null) {
      const perfState = state.getMotionState?.() || {};
      const result = preparePerfScenarioRuntime({
        options,
        state: perfState,
        helpers: {
          setPerfWeaponStageCount: (nextCount = 2) => this.setPerfWeaponStageCount(nextCount),
          clearPendingEnemyDeaths: helpers.clearPendingEnemyDeaths,
          clearEnemies: helpers.clearEnemies,
          setPerfAutoMove: helpers.setPerfAutoMove,
          getPerfAutoMove: helpers.getPerfAutoMove,
        },
      });
      state.setMotionState?.(perfState);
      return result;
    },
    setBorderForceEnabled(next) {
      const enabled = !!next;
      state.setBorderForceEnabled?.(enabled);
      if (!enabled) {
        state.resetBarrierState?.();
        helpers.setResistanceVisual?.(false);
        helpers.setReactiveArrowVisual?.(false);
      }
      return !!state.getBorderForceEnabled?.();
    },
  };
}

export function installBeatSwarmModeGlobalRuntime(deps = {}) {
  const windowObj = deps.windowObj;
  const beatSwarmMode = deps.beatSwarmMode || {};
  try {
    windowObj.BeatSwarmMode = Object.assign(windowObj.BeatSwarmMode || {}, beatSwarmMode);
  } catch {}
}

export function installBeatSwarmDebugGlobalRuntime(deps = {}) {
  const windowObj = deps.windowObj;
  const api = deps.api && typeof deps.api === 'object' ? deps.api : {};
  try {
    windowObj.__beatSwarmDebug = Object.assign(windowObj.__beatSwarmDebug || {}, {
      getDirectorState() {
        return api.getDirectorState();
      },
      getPaletteState() {
        return api.getPaletteState();
      },
      getPacingState() {
        return api.getPacingState();
      },
      getComposerMotifState() {
        return api.getComposerMotifState();
      },
      getDirectorDebugSnapshot() {
        return api.getDirectorDebugSnapshot();
      },
      getEnergyGravityState() {
        return api.getEnergyGravityState();
      },
      getDirectorStepEventLog() {
        return api.getDirectorStepEventLog();
      },
      getWeaponDamageScaleState(slotIndex) {
        return api.getWeaponDamageScaleState(slotIndex);
      },
      getPlayerInstrumentState() {
        return api.getPlayerInstrumentState();
      },
      setPlayerInstrumentMode(mode) {
        return api.setPlayerInstrumentMode(mode);
      },
      setPlayerInstrumentGrooveSubdivision(next) {
        return api.setPlayerInstrumentGrooveSubdivision(next);
      },
      setPlayerInstrumentLockedPattern(pattern) {
        return api.setPlayerInstrumentLockedPattern(pattern);
      },
      setPlayerInstrumentCustomPattern(pattern) {
        return api.setPlayerInstrumentCustomPattern(pattern);
      },
      setPlayerInstrumentCustomPatternEnabled(next) {
        return api.setPlayerInstrumentCustomPatternEnabled(next);
      },
      notePlayerInstrumentManualOverride(durationBeats) {
        return api.notePlayerInstrumentManualOverride(durationBeats);
      },
      runStabilitySmokeChecks() {
        return api.runStabilitySmokeChecks();
      },
      setDirectorHudEnabled(next) {
        return api.setDirectorHudEnabled(next);
      },
      setDirectorBeatLogging(next) {
        return api.setDirectorBeatLogging(next);
      },
      enableTuneShotDebug(next) {
        return api.enableTuneShotDebug(next);
      },
      setPerfWeaponStageCount(nextCount) {
        return api.setPerfWeaponStageCount(nextCount);
      },
      setPerfAutoMove(next, magnitude) {
        return api.setPerfAutoMove(next, magnitude);
      },
      getPerfAutoMove() {
        return api.getPerfAutoMove();
      },
      spawnPerfEnemyDistribution(nextCount) {
        return api.spawnPerfEnemyDistribution(nextCount);
      },
      spawnPerfEnemyType(enemyType) {
        return api.spawnPerfEnemyType(enemyType);
      },
      setPerfEnemyRepeatMode(enemyType, enabled, options) {
        return api.setPerfEnemyRepeatMode(enemyType, enabled, options);
      },
      preparePerfScenario(options) {
        return api.preparePerfScenario(options);
      },
      setBorderForceEnabled(next) {
        return api.setBorderForceEnabled(next);
      },
      getBorderForceEnabled() {
        return api.getBorderForceEnabled();
      },
    });
  } catch {}
}

export function createBeatSwarmDebugApiRuntime(deps = {}) {
  const constants = deps.constants && typeof deps.constants === 'object' ? deps.constants : {};
  const state = deps.state && typeof deps.state === 'object' ? deps.state : {};
  const helpers = deps.helpers && typeof deps.helpers === 'object' ? deps.helpers : {};
  const maxWeaponSlots = Math.max(1, Math.trunc(Number(constants.maxWeaponSlots) || 1));
  const weaponTuneSteps = Math.max(1, Math.trunc(Number(constants.weaponTuneSteps) || 1));
  const playerInstrumentRuntime = helpers.playerInstrumentRuntime;
  return {
    getDirectorState() {
      try { return helpers.ensureSwarmDirector?.()?.getSnapshot?.() || null; } catch { return null; }
    },
    getPaletteState() {
      try { return helpers.swarmPaletteRuntime?.getSnapshot?.() || null; } catch { return null; }
    },
    getPacingState() {
      try { return helpers.swarmPacingRuntime?.getSnapshot?.() || null; } catch { return null; }
    },
    getComposerMotifState() {
      const runtime = helpers.composerRuntime || {};
      return {
        sectionId: String(runtime.currentSectionId || 'default'),
        cycle: Math.max(0, Math.trunc(Number(runtime.currentCycle) || 0)),
        motifScopeKey: helpers.getComposerMotifScopeKey?.() || '',
        motifEpochIndex: Math.max(0, Math.trunc(Number(runtime.motifEpochIndex) || 0)),
        motifEpochStartBar: Math.max(0, Math.trunc(Number(runtime.motifEpochStartBar) || 0)),
        motifCacheSize: Math.max(0, Math.trunc(Number(runtime.motifCache?.size) || 0)),
      };
    },
    getDirectorDebugSnapshot() {
      return helpers.swarmDirectorDebug?.snapshot ? { ...helpers.swarmDirectorDebug.snapshot } : null;
    },
    getEnergyGravityState() {
      const energyGravityRuntime = helpers.energyGravityRuntime || {};
      return {
        ...(helpers.getEnergyGravityMetrics?.() || {}),
        recentKillCount: Array.isArray(energyGravityRuntime.recentKillTimes) ? energyGravityRuntime.recentKillTimes.length : 0,
      };
    },
    getDirectorStepEventLog() {
      return Array.isArray(helpers.swarmDirectorDebug?.stepEventLog) ? helpers.swarmDirectorDebug.stepEventLog.slice() : [];
    },
    getWeaponDamageScaleState(slotIndex = state.getActiveWeaponSlotIndex?.() ?? 0) {
      const idx = Math.max(0, Math.min(maxWeaponSlots - 1, Math.trunc(Number(slotIndex) || 0)));
      const stats = helpers.getWeaponTuneActivityStats?.(idx);
      return {
        slotIndex: idx,
        activeNotes: Math.max(0, Math.trunc(Number(stats?.activeNotes) || 0)),
        totalNotes: Math.max(1, Math.trunc(Number(stats?.totalNotes) || weaponTuneSteps)),
        damageScale: helpers.getWeaponTuneDamageScale?.(idx) ?? 1,
      };
    },
    getPlayerInstrumentState() {
      return playerInstrumentRuntime?.getSnapshot?.() || null;
    },
    setPlayerInstrumentMode(mode = 'guided_fire') {
      return playerInstrumentRuntime?.setMode?.(mode);
    },
    setPlayerInstrumentGrooveSubdivision(next = 4) {
      return playerInstrumentRuntime?.setGrooveTargetSubdivision?.(next);
    },
    setPlayerInstrumentLockedPattern(pattern = null) {
      return playerInstrumentRuntime?.setLockedPattern?.(pattern);
    },
    setPlayerInstrumentCustomPattern(pattern = null) {
      return playerInstrumentRuntime?.setCustomPattern?.(pattern);
    },
    setPlayerInstrumentCustomPatternEnabled(next = true) {
      return playerInstrumentRuntime?.setCustomPatternEnabled?.(next);
    },
    notePlayerInstrumentManualOverride(durationBeats = 2) {
      return playerInstrumentRuntime?.noteManualOverride?.(Math.max(0, Math.trunc(Number(state.getCurrentBeatIndex?.() || 0))), durationBeats);
    },
    runStabilitySmokeChecks() {
      return helpers.runStabilitySmokeChecks?.();
    },
    setDirectorHudEnabled(next = true) {
      if (helpers.swarmDirectorDebug) helpers.swarmDirectorDebug.hudEnabled = !!next;
      if (helpers.swarmDirectorDebug?.hudEnabled) helpers.ensureSwarmDirectorDebugHud?.();
      else helpers.removeSwarmDirectorDebugHud?.();
      return !!helpers.swarmDirectorDebug?.hudEnabled;
    },
    setDirectorBeatLogging(next = true) {
      if (helpers.swarmDirectorDebug) helpers.swarmDirectorDebug.logBeats = !!next;
      return !!helpers.swarmDirectorDebug?.logBeats;
    },
    enableTuneShotDebug(next = true) {
      const tuneDebug = helpers.weaponTuneFireDebug || {};
      tuneDebug.enabled = !!next;
      tuneDebug.seq = 0;
      return !!tuneDebug.enabled;
    },
    setPerfWeaponStageCount(nextCount = 2) {
      return helpers.setPerfWeaponStageCount?.(nextCount);
    },
    setPerfAutoMove(next = true, magnitude = 0.82) {
      return helpers.setPerfAutoMove?.(next, magnitude);
    },
    getPerfAutoMove() {
      return helpers.getPerfAutoMove?.();
    },
    spawnPerfEnemyDistribution(nextCount = constants.enemyTargetActiveCount) {
      return helpers.spawnPerfEnemyDistribution?.(nextCount);
    },
    spawnPerfEnemyType(enemyType = 'drawsnake') {
      return helpers.spawnPerfEnemyType?.(enemyType) || null;
    },
    setPerfEnemyRepeatMode(enemyType = '', enabled = true, options = null) {
      return helpers.setPerfEnemyRepeatMode?.(enemyType, enabled, options) || { enabled: false, enemyType: '', targetCount: 0, persistent: true };
    },
    preparePerfScenario(options = null) {
      return helpers.preparePerfScenario?.(options);
    },
    setBorderForceEnabled(next) {
      return helpers.setBorderForceEnabled?.(next);
    },
    getBorderForceEnabled() {
      return !!state.getBorderForceEnabled?.();
    },
  };
}

export function installBeatSwarmMusicLabGlobalRuntime(deps = {}) {
  const windowObj = deps.windowObj;
  const api = deps.api && typeof deps.api === 'object' ? deps.api : {};
  try {
    windowObj.__beatSwarmMusicLab = Object.assign(windowObj.__beatSwarmMusicLab || {}, {
      reset(reason = 'manual') {
        return api.reset(reason);
      },
      exportSession() {
        return api.exportSession();
      },
      downloadSession(fileName = '') {
        return api.downloadSession(fileName);
      },
      getSessionSnapshot() {
        return api.getSessionSnapshot();
      },
      setEnabled(next = true) {
        return api.setEnabled(next);
      },
      getCleanupAssertions() {
        return api.getCleanupAssertions();
      },
    });
  } catch {}
}

export function createBeatSwarmMusicLabApiRuntime(deps = {}) {
  const helpers = deps.helpers && typeof deps.helpers === 'object' ? deps.helpers : {};
  const state = deps.state && typeof deps.state === 'object' ? deps.state : {};
  return {
    reset(reason = 'manual') {
      helpers.startMusicLabSession?.(reason);
      return helpers.swarmMusicLab?.getSessionSnapshot?.();
    },
    exportSession() {
      return helpers.swarmMusicLab?.exportSession?.();
    },
    downloadSession(fileName = '') {
      return helpers.swarmMusicLab?.downloadSession?.(fileName);
    },
    getSessionSnapshot() {
      return helpers.swarmMusicLab?.getSessionSnapshot?.();
    },
    setEnabled(next = true) {
      return helpers.swarmMusicLab?.setEnabled?.(next);
    },
    getCleanupAssertions() {
      const cleanupAssertionState = state.cleanupAssertionState || {};
      return {
        totalViolations: Math.max(0, Math.trunc(Number(cleanupAssertionState.totalViolations) || 0)),
        directorCleanup: Math.max(0, Math.trunc(Number(cleanupAssertionState.directorCleanup) || 0)),
        sectionChangeCleanup: Math.max(0, Math.trunc(Number(cleanupAssertionState.sectionChangeCleanup) || 0)),
        lastViolation: cleanupAssertionState.lastViolation ? { ...cleanupAssertionState.lastViolation } : null,
      };
    },
  };
}
