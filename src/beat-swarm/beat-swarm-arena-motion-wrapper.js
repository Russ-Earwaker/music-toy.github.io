export function applyArenaBoundaryResistanceRuntimeWrapper(options = null) {
  const dt = Number(options?.dt) || 0;
  const input = options?.input || null;
  const centerWorld = options?.centerWorld || null;
  const scale = Number(options?.scale) || 1;
  const state = options?.state && typeof options.state === 'object' ? options.state : {};
  const constants = options?.constants && typeof options.constants === 'object' ? options.constants : {};
  const helpers = options?.helpers && typeof options.helpers === 'object' ? options.helpers : {};
  const runtime = helpers.applyArenaBoundaryResistanceRuntime?.({
    dt,
    input,
    centerWorld,
    scale,
    constants: {
      swarmArenaRadiusWorld: Number(constants.swarmArenaRadiusWorld) || 0,
      swarmArenaResistRangeWorld: Number(constants.swarmArenaResistRangeWorld) || 0,
      swarmReleasePostFireBorderScale: Number(constants.swarmReleasePostFireBorderScale) || 0,
      swarmArenaInwardAccelWorld: Number(constants.swarmArenaInwardAccelWorld) || 0,
      swarmArenaOuterSoftBufferWorld: Number(constants.swarmArenaOuterSoftBufferWorld) || 0,
      swarmArenaRubberKWorld: Number(constants.swarmArenaRubberKWorld) || 0,
      swarmArenaRubberDampLinear: Number(constants.swarmArenaRubberDampLinear) || 0,
      swarmArenaRubberDampQuad: Number(constants.swarmArenaRubberDampQuad) || 0,
      swarmArenaEdgeBrakeWorld: Number(constants.swarmArenaEdgeBrakeWorld) || 0,
      swarmArenaOutwardBrakeWorld: Number(constants.swarmArenaOutwardBrakeWorld) || 0,
      swarmArenaOutwardCancelWorld: Number(constants.swarmArenaOutwardCancelWorld) || 0,
    },
    helpers: {
      setResistanceVisual: helpers.setResistanceVisual,
      setReactiveArrowVisual: helpers.setReactiveArrowVisual,
      getReactiveReleaseImpulse: helpers.getReactiveReleaseImpulse,
    },
    state: {
      borderForceEnabled: !!state.borderForceEnabled,
      arenaCenterWorld: state.arenaCenterWorld,
      postReleaseAssistTimer: Number(state.postReleaseAssistTimer) || 0,
      velocityX: Number(state.velocityX) || 0,
      velocityY: Number(state.velocityY) || 0,
      barrierPushingOut: !!state.barrierPushingOut,
      barrierPushCharge: Number(state.barrierPushCharge) || 0,
    },
  }) || {};
  const nextState = runtime?.state || {};
  state.velocityX = Number(nextState.velocityX) || 0;
  state.velocityY = Number(nextState.velocityY) || 0;
  state.barrierPushingOut = nextState.barrierPushingOut === true;
  state.barrierPushCharge = Math.max(0, Math.min(1, Number(nextState.barrierPushCharge) || 0));
  return runtime?.outsideForceActive === true;
}

export function enforceArenaOuterLimitRuntimeWrapper(options = null) {
  const centerWorld = options?.centerWorld || null;
  const scale = Number(options?.scale) || 1;
  const dt = Number(options?.dt) || 0;
  const state = options?.state && typeof options.state === 'object' ? options.state : {};
  const constants = options?.constants && typeof options.constants === 'object' ? options.constants : {};
  const helpers = options?.helpers && typeof options.helpers === 'object' ? options.helpers : {};
  const runtime = helpers.enforceArenaOuterLimitRuntime?.({
    centerWorld,
    scale,
    dt,
    constants: {
      swarmArenaRadiusWorld: Number(constants.swarmArenaRadiusWorld) || 0,
      swarmArenaResistRangeWorld: Number(constants.swarmArenaResistRangeWorld) || 0,
    },
    helpers: {
      applyCameraDelta: helpers.applyCameraDelta,
    },
    state: {
      borderForceEnabled: !!state.borderForceEnabled,
      arenaCenterWorld: state.arenaCenterWorld,
      velocityX: Number(state.velocityX) || 0,
      velocityY: Number(state.velocityY) || 0,
    },
  }) || {};
  const nextState = runtime?.state || {};
  state.velocityX = Number(nextState.velocityX) || 0;
  state.velocityY = Number(nextState.velocityY) || 0;
  return runtime?.centerWorld || centerWorld;
}

export function applyLaunchInnerCircleBounceRuntimeWrapper(options = null) {
  const centerWorld = options?.centerWorld || null;
  const scale = Number(options?.scale) || 1;
  const state = options?.state && typeof options.state === 'object' ? options.state : {};
  const constants = options?.constants && typeof options.constants === 'object' ? options.constants : {};
  const helpers = options?.helpers && typeof options.helpers === 'object' ? options.helpers : {};
  const runtime = helpers.applyLaunchInnerCircleBounceRuntime?.({
    centerWorld,
    scale,
    constants: {
      swarmArenaRadiusWorld: Number(constants.swarmArenaRadiusWorld) || 0,
      swarmReleaseBounceMinSpeed: Number(constants.swarmReleaseBounceMinSpeed) || 0,
      swarmReleaseBounceRestitution: Number(constants.swarmReleaseBounceRestitution) || 0,
    },
    helpers: {
      applyCameraDelta: helpers.applyCameraDelta,
    },
    state: {
      borderForceEnabled: !!state.borderForceEnabled,
      arenaCenterWorld: state.arenaCenterWorld,
      postReleaseAssistTimer: Number(state.postReleaseAssistTimer) || 0,
      dragPointerId: state.dragPointerId,
      velocityX: Number(state.velocityX) || 0,
      velocityY: Number(state.velocityY) || 0,
    },
  }) || {};
  const nextState = runtime?.state || {};
  state.velocityX = Number(nextState.velocityX) || 0;
  state.velocityY = Number(nextState.velocityY) || 0;
  return runtime?.centerWorld || centerWorld;
}
