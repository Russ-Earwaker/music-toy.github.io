export function finalizeEnterBeatSwarmRuntimeWrapper(deps = {}) {
  const state = deps.state && typeof deps.state === 'object' ? deps.state : {};
  const ui = deps.ui && typeof deps.ui === 'object' ? deps.ui : {};
  const helpers = deps.helpers && typeof deps.helpers === 'object' ? deps.helpers : {};
  const ensureSwarmDirectorDebugHud = typeof helpers.ensureSwarmDirectorDebugHud === 'function'
    ? helpers.ensureSwarmDirectorDebugHud
    : () => {};
  const removeSwarmDirectorDebugHud = typeof helpers.removeSwarmDirectorDebugHud === 'function'
    ? helpers.removeSwarmDirectorDebugHud
    : () => {};
  const ensureSwarmDirector = typeof helpers.ensureSwarmDirector === 'function'
    ? helpers.ensureSwarmDirector
    : () => ({ syncToBeat: () => {} });
  const bindInput = typeof helpers.bindInput === 'function' ? helpers.bindInput : () => {};
  const startTick = typeof helpers.startTick === 'function' ? helpers.startTick : () => {};
  const persistBeatSwarmState = typeof helpers.persistBeatSwarmState === 'function' ? helpers.persistBeatSwarmState : () => {};

  if (state.swarmDirectorHudEnabled) ensureSwarmDirectorDebugHud();
  else removeSwarmDirectorDebugHud();
  ensureSwarmDirector().syncToBeat(Math.max(0, Math.trunc(Number(state.currentBeatIndex) || 0)));
  if (ui.spawnerLayerEl) ui.spawnerLayerEl.hidden = false;
  if (ui.enemyLayerEl) ui.enemyLayerEl.hidden = false;
  if (ui.starfieldLayerEl) ui.starfieldLayerEl.hidden = false;
  if (ui.overlayEl) ui.overlayEl.hidden = false;
  bindInput();
  startTick();
  persistBeatSwarmState();
}
