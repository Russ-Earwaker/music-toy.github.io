export function applyExitBeatSwarmRuntimeWrapper(deps = {}) {
  const state = deps.state && typeof deps.state === 'object' ? deps.state : {};
  const ui = deps.ui && typeof deps.ui === 'object' ? deps.ui : {};
  const helpers = deps.helpers && typeof deps.helpers === 'object' ? deps.helpers : {};

  if (!state.active) return false;

  state.active = false;
  state.dragPointerId = null;
  state.velocityX = 0;
  state.velocityY = 0;
  helpers.setPerfAutoMoveEnabled?.(false);
  helpers.setWindowBeatSwarmActive?.(false);
  helpers.removeBodyBeatSwarmClass?.();

  if (ui.overlayEl) ui.overlayEl.hidden = true;
  if (ui.exitBtn) ui.exitBtn.hidden = true;
  if (ui.starfieldLayerEl) ui.starfieldLayerEl.hidden = true;
  if (ui.spawnerLayerEl) ui.spawnerLayerEl.hidden = true;
  if (ui.enemyLayerEl) ui.enemyLayerEl.hidden = true;

  helpers.setJoystickVisible?.(false);
  helpers.setThrustFxVisual?.(false);
  helpers.stopTick?.();
  helpers.stopComponentLivePreviews?.();
  helpers.unbindInput?.();
  helpers.hideSectionHeading?.();

  const readabilityMetricsRuntime = state.readabilityMetricsRuntime && typeof state.readabilityMetricsRuntime === 'object'
    ? state.readabilityMetricsRuntime
    : {};
  if ((Number(readabilityMetricsRuntime.barIndex) || -1) >= 0 && (Number(readabilityMetricsRuntime.steps) || 0) > 0) {
    helpers.emitReadabilityMetricsSnapshotForBar?.(readabilityMetricsRuntime.barIndex, state.currentBeatIndex);
  }
  helpers.resetReadabilityMetricsRuntime?.(-1);
  helpers.spawnerExit?.();
  helpers.removeSwarmDirectorDebugHud?.();
  helpers.clearEnemies?.();
  helpers.clearPickups?.();
  helpers.clearProjectiles?.();
  helpers.clearEffects?.();
  helpers.clearHelpers?.();
  helpers.clearPendingWeaponChainEvents?.();

  state.weaponChainEventSeq = 1;
  helpers.resetSwarmPacingRuntime?.(0);
  helpers.invalidateSwarmPaletteRuntime?.();
  state.musicLabLastPacingSignature = '';
  state.musicLabLastPaletteSignature = '';

  if (state.swarmSoundEventState && typeof state.swarmSoundEventState === 'object') {
    state.swarmSoundEventState.beatIndex = null;
    state.swarmSoundEventState.played = Object.create(null);
    state.swarmSoundEventState.maxVolume = Object.create(null);
    state.swarmSoundEventState.note = Object.create(null);
    state.swarmSoundEventState.noteList = Object.create(null);
    state.swarmSoundEventState.count = Object.create(null);
  }

  state.lastSpawnerEnemyStepIndex = null;
  helpers.clearLingeringAoeZones?.();
  helpers.clearStarfield?.();
  state.arenaCenterWorld = null;
  state.barrierPushingOut = false;
  state.barrierPushCharge = 0;
  state.releaseBeatLevel = 0;
  state.lastLaunchBeatLevel = 0;
  state.postReleaseAssistTimer = 0;
  state.outerForceContinuousSeconds = 0;
  state.releaseForcePrimed = false;
  helpers.resetEnergyStateRuntime?.(0);
  helpers.resetEnergyGravityRuntime?.();
  helpers.resetSwarmDirector?.();
  helpers.setGameplayPaused?.(false);
  helpers.resetArenaPathState?.();

  if (ui.arenaRingEl) ui.arenaRingEl.style.opacity = '0';
  if (ui.arenaCoreEl) ui.arenaCoreEl.style.opacity = '0';
  if (ui.arenaLimitEl) ui.arenaLimitEl.style.opacity = '0';
  helpers.setResistanceVisual?.(false);
  helpers.setReactiveArrowVisual?.(false);
  helpers.clearEquippedWeapons?.();
  state.activeWeaponSlotIndex = 0;
  state.enemyHealthRampSeconds = 0;
  helpers.updateEnemySpawnHealthScaling?.();
  helpers.updateSpawnHealthDebugUi?.();
  state.lastBeatIndex = null;
  state.lastWeaponTuneStepIndex = null;
  helpers.clearBeatSwarmPersistedState?.();
  return true;
}
