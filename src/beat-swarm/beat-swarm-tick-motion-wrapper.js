export function applyTickSteeringAndResistanceRuntimeWrapper(deps = {}) {
  const dt = Math.max(0, Number(deps.dt) || 0);
  const input = deps.input && typeof deps.input === 'object' ? deps.input : { x: 0, y: 0, mag: 0 };
  const centerWorld = deps.centerWorld && typeof deps.centerWorld === 'object' ? deps.centerWorld : { x: 0, y: 0 };
  const scale = Number.isFinite(deps.scale) ? deps.scale : 1;
  const state = deps.state && typeof deps.state === 'object' ? deps.state : {};
  const constants = deps.constants && typeof deps.constants === 'object' ? deps.constants : {};
  const helpers = deps.helpers && typeof deps.helpers === 'object' ? deps.helpers : {};
  const shouldSuppressSteeringForRelease = typeof helpers.shouldSuppressSteeringForRelease === 'function'
    ? helpers.shouldSuppressSteeringForRelease
    : () => false;
  const getOutwardOnlyInput = typeof helpers.getOutwardOnlyInput === 'function'
    ? helpers.getOutwardOnlyInput
    : (nextInput) => nextInput;
  const applyArenaBoundaryResistance = typeof helpers.applyArenaBoundaryResistance === 'function'
    ? helpers.applyArenaBoundaryResistance
    : () => false;
  const updateArenaVisual = typeof helpers.updateArenaVisual === 'function'
    ? helpers.updateArenaVisual
    : () => {};

  const swarmMaxSpeed = Number.isFinite(constants.swarmMaxSpeed) ? constants.swarmMaxSpeed : 0;
  const swarmAccel = Number.isFinite(constants.swarmAccel) ? constants.swarmAccel : 0;
  const swarmTurnWeight = Number.isFinite(constants.swarmTurnWeight) ? constants.swarmTurnWeight : 0;
  const swarmDecel = Number.isFinite(constants.swarmDecel) ? constants.swarmDecel : 0;
  const swarmStopEps = Number.isFinite(constants.swarmStopEps) ? constants.swarmStopEps : 0;

  let velocityX = Number(state.velocityX) || 0;
  let velocityY = Number(state.velocityY) || 0;
  let outerForceContinuousSeconds = Math.max(0, Number(state.outerForceContinuousSeconds) || 0);
  let releaseForcePrimed = !!state.releaseForcePrimed;
  let releaseBeatLevel = Math.max(0, Number(state.releaseBeatLevel) || 0);

  const suppressSteering = !!shouldSuppressSteeringForRelease(input, centerWorld);
  const steerInput = suppressSteering ? getOutwardOnlyInput(input, centerWorld) : input;
  if ((Number(steerInput?.mag) || 0) > 0.0001) {
    const steerMag = Number(steerInput.mag) || 0;
    const targetVx = (Number(steerInput?.x) || 0) * swarmMaxSpeed * steerMag;
    const targetVy = (Number(steerInput?.y) || 0) * swarmMaxSpeed * steerMag;
    let steerX = targetVx - velocityX;
    let steerY = targetVy - velocityY;
    const steerLen = Math.hypot(steerX, steerY) || 0;
    const maxDelta = swarmAccel * dt;
    if (steerLen > maxDelta) {
      const k = maxDelta / steerLen;
      steerX *= k;
      steerY *= k;
    }
    velocityX += steerX * swarmTurnWeight + steerX * (1 - swarmTurnWeight) * steerMag;
    velocityY += steerY * swarmTurnWeight + steerY * (1 - swarmTurnWeight) * steerMag;
  } else {
    const decay = Math.exp(-swarmDecel * dt);
    velocityX *= decay;
    velocityY *= decay;
    if (Math.hypot(velocityX, velocityY) < swarmStopEps) {
      velocityX = 0;
      velocityY = 0;
    }
  }

  const outsideForceActive = !!applyArenaBoundaryResistance(dt, input, centerWorld, scale);
  if (outsideForceActive) {
    outerForceContinuousSeconds += dt;
  } else {
    outerForceContinuousSeconds = 0;
    releaseForcePrimed = false;
    releaseBeatLevel = 0;
  }
  updateArenaVisual(scale);

  state.velocityX = velocityX;
  state.velocityY = velocityY;
  state.outerForceContinuousSeconds = outerForceContinuousSeconds;
  state.releaseForcePrimed = releaseForcePrimed;
  state.releaseBeatLevel = releaseBeatLevel;
  return {
    outsideForceActive,
  };
}

export function applyTickMovementAndArenaClampRuntimeWrapper(deps = {}) {
  const dt = Math.max(0, Number(deps.dt) || 0);
  const scale = Number.isFinite(deps.scale) ? deps.scale : 1;
  const state = deps.state && typeof deps.state === 'object' ? deps.state : {};
  const constants = deps.constants && typeof deps.constants === 'object' ? deps.constants : {};
  const helpers = deps.helpers && typeof deps.helpers === 'object' ? deps.helpers : {};
  const getReleaseSpeedCap = typeof helpers.getReleaseSpeedCap === 'function'
    ? helpers.getReleaseSpeedCap
    : () => 0;
  const applyCameraDelta = typeof helpers.applyCameraDelta === 'function'
    ? helpers.applyCameraDelta
    : () => {};
  const getViewportCenterWorld = typeof helpers.getViewportCenterWorld === 'function'
    ? helpers.getViewportCenterWorld
    : () => ({ x: 0, y: 0 });
  const applyLaunchInnerCircleBounce = typeof helpers.applyLaunchInnerCircleBounce === 'function'
    ? helpers.applyLaunchInnerCircleBounce
    : (center) => center;
  const enforceArenaOuterLimit = typeof helpers.enforceArenaOuterLimit === 'function'
    ? helpers.enforceArenaOuterLimit
    : (center) => center;
  const updateArenaVisual = typeof helpers.updateArenaVisual === 'function'
    ? helpers.updateArenaVisual
    : () => {};

  const swarmMaxSpeed = Number.isFinite(constants.swarmMaxSpeed) ? constants.swarmMaxSpeed : 0;
  const swarmArenaRadiusWorld = Number.isFinite(constants.swarmArenaRadiusWorld) ? constants.swarmArenaRadiusWorld : 0;

  let velocityX = Number(state.velocityX) || 0;
  let velocityY = Number(state.velocityY) || 0;
  const postReleaseAssistTimer = Math.max(0, Number(state.postReleaseAssistTimer) || 0);
  const arenaCenterWorld = state.arenaCenterWorld && typeof state.arenaCenterWorld === 'object'
    ? state.arenaCenterWorld
    : null;

  const speed = Math.hypot(velocityX, velocityY);
  const maxSpeedNow = postReleaseAssistTimer > 0 ? getReleaseSpeedCap() : swarmMaxSpeed;
  if (speed > maxSpeedNow) {
    const k = maxSpeedNow / speed;
    velocityX *= k;
    velocityY *= k;
  }
  if (speed > 0.01) {
    applyCameraDelta(velocityX * dt, velocityY * dt);
  }
  let centerWorldAfterMove = getViewportCenterWorld();
  centerWorldAfterMove = applyLaunchInnerCircleBounce(centerWorldAfterMove, scale);
  centerWorldAfterMove = enforceArenaOuterLimit(centerWorldAfterMove, scale, dt);
  const outsideMain = arenaCenterWorld
    ? (Math.hypot(centerWorldAfterMove.x - arenaCenterWorld.x, centerWorldAfterMove.y - arenaCenterWorld.y) > swarmArenaRadiusWorld)
    : false;
  updateArenaVisual(scale, outsideMain);

  state.velocityX = velocityX;
  state.velocityY = velocityY;
  return {
    centerWorldAfterMove,
    outsideMain,
  };
}
