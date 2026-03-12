export function updatePausedTickFrameRuntimeWrapper(deps = {}) {
  const dt = Math.max(0, Number(deps.dt) || 0);
  const state = deps.state && typeof deps.state === 'object' ? deps.state : {};
  const constants = deps.constants && typeof deps.constants === 'object' ? deps.constants : {};
  const helpers = deps.helpers && typeof deps.helpers === 'object' ? deps.helpers : {};
  const updateSectionPresentationRuntime = typeof helpers.updateSectionPresentationRuntime === 'function'
    ? helpers.updateSectionPresentationRuntime
    : () => {};
  const updateSwarmDirectorDebugHud = typeof helpers.updateSwarmDirectorDebugHud === 'function'
    ? helpers.updateSwarmDirectorDebugHud
    : () => {};
  const ensureSwarmDirector = typeof helpers.ensureSwarmDirector === 'function'
    ? helpers.ensureSwarmDirector
    : () => ({ getSnapshot: () => null });
  const updateWeaponSubBoardSession = typeof helpers.updateWeaponSubBoardSession === 'function'
    ? helpers.updateWeaponSubBoardSession
    : () => {};
  const getZoomState = typeof helpers.getZoomState === 'function'
    ? helpers.getZoomState
    : () => ({ currentScale: 1, targetScale: 1 });
  const getViewportCenterWorld = typeof helpers.getViewportCenterWorld === 'function'
    ? helpers.getViewportCenterWorld
    : () => ({ x: 0, y: 0 });
  const updateArenaVisual = typeof helpers.updateArenaVisual === 'function'
    ? helpers.updateArenaVisual
    : () => {};
  const updateStarfieldVisual = typeof helpers.updateStarfieldVisual === 'function'
    ? helpers.updateStarfieldVisual
    : () => {};
  const updateSpawnHealthDebugUi = typeof helpers.updateSpawnHealthDebugUi === 'function'
    ? helpers.updateSpawnHealthDebugUi
    : () => {};
  const updateSpawnerRuntime = typeof helpers.updateSpawnerRuntime === 'function'
    ? helpers.updateSpawnerRuntime
    : () => {};
  const updatePausePreview = typeof helpers.updatePausePreview === 'function'
    ? helpers.updatePausePreview
    : () => {};

  const currentBeatIndex = Math.max(0, Math.trunc(Number(state.currentBeatIndex) || 0));
  const arenaCenterWorld = state.arenaCenterWorld && typeof state.arenaCenterWorld === 'object'
    ? state.arenaCenterWorld
    : null;
  const swarmArenaRadiusWorld = Number.isFinite(constants.swarmArenaRadiusWorld) ? constants.swarmArenaRadiusWorld : 0;

  updateSectionPresentationRuntime(dt);
  const directorSnapshot = ensureSwarmDirector()?.getSnapshot?.() || null;
  updateSwarmDirectorDebugHud({
    reason: 'paused',
    stepChanged: false,
    beatChanged: false,
    beatIndex: currentBeatIndex,
    stepIndex: Math.max(0, Math.trunc(Number(directorSnapshot?.stepIndex) || 0)),
    spawnerActiveCount: 0,
    spawnerTriggeredCount: 0,
    spawnerSpawnCount: 0,
    directorState: directorSnapshot,
  });
  updateWeaponSubBoardSession();
  const zPause = getZoomState();
  const scalePause = Number.isFinite(zPause?.targetScale) ? zPause.targetScale : (Number.isFinite(zPause?.currentScale) ? zPause.currentScale : 1);
  const centerPause = getViewportCenterWorld();
  const outsideMainPause = arenaCenterWorld
    ? (Math.hypot(centerPause.x - arenaCenterWorld.x, centerPause.y - arenaCenterWorld.y) > swarmArenaRadiusWorld)
    : false;
  updateArenaVisual(scalePause, outsideMainPause);
  updateStarfieldVisual();
  updateSpawnHealthDebugUi();
  updateSpawnerRuntime(0);
  updatePausePreview(dt);
}
