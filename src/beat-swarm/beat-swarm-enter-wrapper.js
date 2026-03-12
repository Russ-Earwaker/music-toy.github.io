export function applyEnterSceneBootstrapRuntimeWrapper(deps = {}) {
  const restoreState = deps.restoreState ?? null;
  const state = deps.state && typeof deps.state === 'object' ? deps.state : {};
  const constants = deps.constants && typeof deps.constants === 'object' ? deps.constants : {};
  const helpers = deps.helpers && typeof deps.helpers === 'object' ? deps.helpers : {};
  const seedDefaultWeaponLoadout = typeof helpers.seedDefaultWeaponLoadout === 'function' ? helpers.seedDefaultWeaponLoadout : () => {};
  const renderPauseWeaponUi = typeof helpers.renderPauseWeaponUi === 'function' ? helpers.renderPauseWeaponUi : () => {};
  const getSceneStartWorld = typeof helpers.getSceneStartWorld === 'function'
    ? helpers.getSceneStartWorld
    : () => ({ x: 0, y: 0 });
  const snapCameraToWorld = typeof helpers.snapCameraToWorld === 'function' ? helpers.snapCameraToWorld : () => {};
  const initStarfieldNear = typeof helpers.initStarfieldNear === 'function' ? helpers.initStarfieldNear : () => {};
  const spawnStarterPickups = typeof helpers.spawnStarterPickups === 'function' ? helpers.spawnStarterPickups : () => {};
  const restoreBeatSwarmState = typeof helpers.restoreBeatSwarmState === 'function' ? helpers.restoreBeatSwarmState : () => {};
  const getZoomState = typeof helpers.getZoomState === 'function'
    ? helpers.getZoomState
    : () => ({ currentScale: 1, targetScale: 1 });
  const updateArenaVisual = typeof helpers.updateArenaVisual === 'function' ? helpers.updateArenaVisual : () => {};
  const updateStarfieldVisual = typeof helpers.updateStarfieldVisual === 'function' ? helpers.updateStarfieldVisual : () => {};
  const updateSpawnerRuntime = typeof helpers.updateSpawnerRuntime === 'function' ? helpers.updateSpawnerRuntime : () => {};
  const setResistanceVisual = typeof helpers.setResistanceVisual === 'function' ? helpers.setResistanceVisual : () => {};
  const setReactiveArrowVisual = typeof helpers.setReactiveArrowVisual === 'function' ? helpers.setReactiveArrowVisual : () => {};

  const swarmCameraTargetScale = Number(constants.swarmCameraTargetScale) || 0.5;

  if (!restoreState) {
    state.activeWeaponSlotIndex = 0;
    seedDefaultWeaponLoadout();
    renderPauseWeaponUi();
    const startWorld = getSceneStartWorld();
    snapCameraToWorld(startWorld, swarmCameraTargetScale);
    state.arenaCenterWorld = { x: Number(startWorld?.x) || 0, y: Number(startWorld?.y) || 0 };
    initStarfieldNear(state.arenaCenterWorld);
    spawnStarterPickups(state.arenaCenterWorld);
  } else {
    restoreBeatSwarmState(restoreState);
  }

  const z = getZoomState();
  const scale = Number(z?.targetScale) || Number(z?.currentScale) || 1;
  updateArenaVisual(scale);
  updateStarfieldVisual();
  updateSpawnerRuntime(0);
  setResistanceVisual(false);
  setReactiveArrowVisual(false);
}
