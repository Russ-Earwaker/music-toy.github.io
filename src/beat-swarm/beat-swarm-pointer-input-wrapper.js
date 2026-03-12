export function onPointerDownRuntimeWrapper(deps = {}) {
  const ev = deps.ev;
  const state = deps.state && typeof deps.state === 'object' ? deps.state : {};
  const helpers = deps.helpers && typeof deps.helpers === 'object' ? deps.helpers : {};
  const setReactiveArrowVisual = typeof helpers.setReactiveArrowVisual === 'function' ? helpers.setReactiveArrowVisual : () => {};
  const setThrustFxVisual = typeof helpers.setThrustFxVisual === 'function' ? helpers.setThrustFxVisual : () => {};
  const setJoystickCenter = typeof helpers.setJoystickCenter === 'function' ? helpers.setJoystickCenter : () => {};
  const setJoystickKnob = typeof helpers.setJoystickKnob === 'function' ? helpers.setJoystickKnob : () => {};
  const setJoystickVisible = typeof helpers.setJoystickVisible === 'function' ? helpers.setJoystickVisible : () => {};
  const setPointerCapture = typeof helpers.setPointerCapture === 'function' ? helpers.setPointerCapture : () => {};

  if (!state.active || state.gameplayPaused) return false;
  if (!ev || (ev.button != null && ev.button !== 0)) return false;
  state.dragPointerId = ev.pointerId;
  state.dragStartX = ev.clientX;
  state.dragStartY = ev.clientY;
  state.dragNowX = ev.clientX;
  state.dragNowY = ev.clientY;
  setReactiveArrowVisual(false);
  state.barrierPushingOut = false;
  state.barrierPushCharge = 0;
  state.releaseBeatLevel = 0;
  state.lastLaunchBeatLevel = 0;
  state.postReleaseAssistTimer = 0;
  state.outerForceContinuousSeconds = 0;
  state.releaseForcePrimed = false;
  setThrustFxVisual(false);
  setJoystickCenter(state.dragStartX, state.dragStartY);
  setJoystickKnob(0, 0);
  setJoystickVisible(true);
  setPointerCapture(state.dragPointerId);
  try { ev.preventDefault?.(); } catch {}
  return true;
}

export function onPointerMoveRuntimeWrapper(deps = {}) {
  const ev = deps.ev;
  const state = deps.state && typeof deps.state === 'object' ? deps.state : {};
  if (!state.active || state.gameplayPaused) return false;
  if (!ev) return false;
  if (state.dragPointerId == null || ev.pointerId !== state.dragPointerId) return false;
  state.dragNowX = ev.clientX;
  state.dragNowY = ev.clientY;
  try { ev.preventDefault?.(); } catch {}
  return true;
}

export function onPointerUpRuntimeWrapper(deps = {}) {
  const ev = deps.ev;
  const state = deps.state && typeof deps.state === 'object' ? deps.state : {};
  const constants = deps.constants && typeof deps.constants === 'object' ? deps.constants : {};
  const helpers = deps.helpers && typeof deps.helpers === 'object' ? deps.helpers : {};
  const releasePointerCapture = typeof helpers.releasePointerCapture === 'function' ? helpers.releasePointerCapture : () => {};
  const getViewportCenterWorld = typeof helpers.getViewportCenterWorld === 'function'
    ? helpers.getViewportCenterWorld
    : () => ({ x: 0, y: 0 });
  const getReactiveReleaseImpulse = typeof helpers.getReactiveReleaseImpulse === 'function'
    ? helpers.getReactiveReleaseImpulse
    : () => 0;
  const setJoystickVisible = typeof helpers.setJoystickVisible === 'function' ? helpers.setJoystickVisible : () => {};
  const setReactiveArrowVisual = typeof helpers.setReactiveArrowVisual === 'function' ? helpers.setReactiveArrowVisual : () => {};
  const setThrustFxVisual = typeof helpers.setThrustFxVisual === 'function' ? helpers.setThrustFxVisual : () => {};

  const swarmArenaRadiusWorld = Number.isFinite(constants.swarmArenaRadiusWorld) ? constants.swarmArenaRadiusWorld : 0;
  const swarmArenaResistRangeWorld = Number.isFinite(constants.swarmArenaResistRangeWorld) ? constants.swarmArenaResistRangeWorld : 1;
  const swarmReleasePostFireDuration = Number.isFinite(constants.swarmReleasePostFireDuration) ? constants.swarmReleasePostFireDuration : 0;

  if (!state.active || state.gameplayPaused) return false;
  if (!ev) return false;
  if (state.dragPointerId == null || ev.pointerId !== state.dragPointerId) return false;
  releasePointerCapture(state.dragPointerId);
  if (state.arenaCenterWorld && state.barrierPushingOut && (Number(state.barrierPushCharge) || 0) > 0.02) {
    const centerWorld = getViewportCenterWorld();
    const dx = (Number(centerWorld?.x) || 0) - (Number(state.arenaCenterWorld?.x) || 0);
    const dy = (Number(centerWorld?.y) || 0) - (Number(state.arenaCenterWorld?.y) || 0);
    const dist = Math.hypot(dx, dy) || 0;
    if (dist > swarmArenaRadiusWorld) {
      const nx = dx / Math.max(0.0001, dist);
      const ny = dy / Math.max(0.0001, dist);
      const outside = Math.max(0, dist - swarmArenaRadiusWorld);
      const outsideN = Math.max(0, Math.min(1, outside / Math.max(1, swarmArenaResistRangeWorld)));
      const impulse = Number(getReactiveReleaseImpulse(outsideN, state.barrierPushCharge)) || 0;
      const inputDx = (Number(state.dragNowX) || 0) - (Number(state.dragStartX) || 0);
      const inputDy = (Number(state.dragNowY) || 0) - (Number(state.dragStartY) || 0);
      const inputLen = Math.hypot(inputDx, inputDy) || 0;
      if (inputLen > 0.0001) {
        const ux = inputDx / inputLen;
        const uy = inputDy / inputLen;
        state.velocityX = (Number(state.velocityX) || 0) - ux * impulse;
        state.velocityY = (Number(state.velocityY) || 0) - uy * impulse;
      } else {
        state.velocityX = (Number(state.velocityX) || 0) - nx * impulse;
        state.velocityY = (Number(state.velocityY) || 0) - ny * impulse;
      }
      state.lastLaunchBeatLevel = Math.max(0, Number(state.releaseBeatLevel) || 0);
      state.postReleaseAssistTimer = swarmReleasePostFireDuration;
    }
  }
  state.dragPointerId = null;
  state.barrierPushingOut = false;
  state.barrierPushCharge = 0;
  state.outerForceContinuousSeconds = 0;
  state.releaseForcePrimed = false;
  setJoystickVisible(false);
  setReactiveArrowVisual(false);
  setThrustFxVisual(false);
  try { ev.preventDefault?.(); } catch {}
  return true;
}
