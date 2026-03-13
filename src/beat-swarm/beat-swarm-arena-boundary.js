export function applyArenaBoundaryResistanceRuntime(options = null) {
  const constants = options?.constants && typeof options.constants === 'object' ? options.constants : {};
  const helpers = options?.helpers && typeof options.helpers === 'object' ? options.helpers : {};
  const state = options?.state && typeof options.state === 'object' ? options.state : {};
  const dt = Math.max(0, Number(options?.dt) || 0);
  const input = options?.input && typeof options.input === 'object' ? options.input : null;
  const centerWorld = options?.centerWorld && typeof options.centerWorld === 'object' ? options.centerWorld : null;
  const scale = Number(options?.scale) || 1;

  if (!state.borderForceEnabled) {
    state.barrierPushingOut = false;
    state.barrierPushCharge = 0;
    helpers.setResistanceVisual?.(false);
    helpers.setReactiveArrowVisual?.(false);
    return { outsideForceActive: false, state };
  }
  if (!state.arenaCenterWorld || !centerWorld) {
    state.barrierPushingOut = false;
    state.barrierPushCharge = 0;
    helpers.setResistanceVisual?.(false);
    helpers.setReactiveArrowVisual?.(false);
    return { outsideForceActive: false, state };
  }

  const dx = centerWorld.x - state.arenaCenterWorld.x;
  const dy = centerWorld.y - state.arenaCenterWorld.y;
  const dist = Math.hypot(dx, dy) || 0;
  const arenaRadius = Number(constants.swarmArenaRadiusWorld) || 0;
  const resistRange = Math.max(1, Number(constants.swarmArenaResistRangeWorld) || 1);
  const resistStartDist = Math.max(0, arenaRadius - resistRange);
  const rawBoundaryProximity = Math.max(0, Math.min(1, (dist - resistStartDist) / resistRange));
  const preEdgeStart = 0.52;
  const boundaryProximity = rawBoundaryProximity <= preEdgeStart
    ? 0
    : Math.max(0, Math.min(1, (rawBoundaryProximity - preEdgeStart) / Math.max(0.0001, 1 - preEdgeStart)));
  const outside = Math.max(0, dist - arenaRadius);
  if (!(boundaryProximity > 0.0001) || !(dist > 0.0001)) {
    state.barrierPushingOut = false;
    state.barrierPushCharge = Math.max(0, (Number(state.barrierPushCharge) || 0) - (dt * 1.8));
    helpers.setResistanceVisual?.(false);
    helpers.setReactiveArrowVisual?.(false);
    return { outsideForceActive: false, state };
  }

  const nx = dx / dist;
  const ny = dy / dist;
  const outsideN = Math.max(0, Math.min(1, outside / resistRange));
  const worldToScreenScale = Math.max(0.001, scale || 1);
  const borderScale = (Number(state.postReleaseAssistTimer) || 0) > 0
    ? (Number(constants.swarmReleasePostFireBorderScale) || 0) * 0.2
    : 1;
  const preEdgeBias = boundaryProximity * boundaryProximity;
  const preEdgeInwardBias = preEdgeBias * 0.42;
  const baseInward = (Number(constants.swarmArenaInwardAccelWorld) || 0)
    * borderScale
    * (preEdgeInwardBias + (outsideN * outsideN * 1.2))
    * worldToScreenScale
    * dt;
  state.velocityX = (Number(state.velocityX) || 0) - (nx * baseInward);
  state.velocityY = (Number(state.velocityY) || 0) - (ny * baseInward);

  const maxDist = arenaRadius + resistRange;
  const edgeBand = Math.max(1, resistRange * 0.35);
  const nearEdgeN = Math.max(boundaryProximity * 0.45, Math.max(0, Math.min(1, (dist - (maxDist - edgeBand)) / edgeBand)));
  const softStartDist = Math.max(
    arenaRadius,
    maxDist - (Number(constants.swarmArenaOuterSoftBufferWorld) || 0)
  );
  const nearLimitN = Math.max(0, Math.min(1, (dist - softStartDist) / Math.max(1, (maxDist - softStartDist))));

  let inputOut = 0;
  if (input && input.mag > 0.0001) {
    inputOut = Math.max(0, (Number(input.x) || 0) * nx + (Number(input.y) || 0) * ny);
  }

  const radialBefore = (Number(state.velocityX) || 0) * nx + (Number(state.velocityY) || 0) * ny;
  const radialOut = Math.max(0, radialBefore);

  if (outside > 0) {
    const springAccel = (Number(constants.swarmArenaRubberKWorld) || 0) * borderScale * outside * 1.3 * worldToScreenScale;
    const dampAccel = borderScale * (
      ((Number(constants.swarmArenaRubberDampLinear) || 0) * 1.2) * radialOut
      + ((Number(constants.swarmArenaRubberDampQuad) || 0) * 1.3) * radialOut * radialOut
    );
    const inward = (springAccel + dampAccel) * dt;
    state.velocityX -= nx * inward;
    state.velocityY -= ny * inward;
  }

  const radialAfterRubber = (Number(state.velocityX) || 0) * nx + (Number(state.velocityY) || 0) * ny;
  const radialOutAfterRubber = Math.max(0, radialAfterRubber);
  if (radialOutAfterRubber > 0 && nearEdgeN > 0) {
    const edgeBrake = ((Number(constants.swarmArenaEdgeBrakeWorld) || 0) * 2 * borderScale * (nearEdgeN * nearEdgeN) * (1 + (2.4 * nearLimitN)))
      * worldToScreenScale * dt;
    const remove = Math.min(radialOutAfterRubber, edgeBrake);
    state.velocityX -= nx * remove;
    state.velocityY -= ny * remove;
  }

  if (inputOut > 0.0001) {
    state.barrierPushingOut = true;
    state.barrierPushCharge = Math.min(1, (Number(state.barrierPushCharge) || 0) + (dt * (0.3 + (boundaryProximity * 0.8) + (outsideN * 1.15) + (inputOut * 0.7))));
    if (radialBefore > 0) {
      const brake = borderScale * (
        (Number(constants.swarmArenaOutwardBrakeWorld) || 0)
        + ((Number(constants.swarmArenaOutwardCancelWorld) || 0) * Math.max(boundaryProximity, outsideN) * inputOut)
      ) * worldToScreenScale * dt;
      const nextRad = Math.max(0, radialBefore - brake);
      const remove = radialBefore - nextRad;
      state.velocityX -= nx * remove;
      state.velocityY -= ny * remove;
    }
    const inAngle = (Math.atan2(Number(input.y) || 0, Number(input.x) || 0) * 180 / Math.PI) + 90;
    helpers.setResistanceVisual?.(true, inAngle, boundaryProximity * inputOut * 0.8);
    const releaseDirAngle = Math.atan2(-(Number(input.y) || 0), -(Number(input.x) || 0)) * 180 / Math.PI;
    const releaseImpulse = helpers.getReactiveReleaseImpulse?.(Math.max(boundaryProximity, outsideN), state.barrierPushCharge) || 0;
    helpers.setReactiveArrowVisual?.(true, releaseDirAngle, releaseImpulse);
    return { outsideForceActive: true, state };
  }

  state.barrierPushingOut = false;
  state.barrierPushCharge = Math.max(0, (Number(state.barrierPushCharge) || 0) - (dt * 1.4));
  helpers.setResistanceVisual?.(true, (Math.atan2(-ny, -nx) * 180 / Math.PI) + 90, boundaryProximity * 0.3);
  helpers.setReactiveArrowVisual?.(false);
  return { outsideForceActive: true, state };
}

export function enforceArenaOuterLimitRuntime(options = null) {
  const constants = options?.constants && typeof options.constants === 'object' ? options.constants : {};
  const helpers = options?.helpers && typeof options.helpers === 'object' ? options.helpers : {};
  const state = options?.state && typeof options.state === 'object' ? options.state : {};
  const centerWorld = options?.centerWorld && typeof options.centerWorld === 'object' ? options.centerWorld : null;
  const scale = Number(options?.scale) || 1;

  if (!state.borderForceEnabled) return { centerWorld, state };
  if (!state.arenaCenterWorld || !centerWorld) return { centerWorld, state };
  const dx = centerWorld.x - state.arenaCenterWorld.x;
  const dy = centerWorld.y - state.arenaCenterWorld.y;
  const dist = Math.hypot(dx, dy) || 0;
  const maxDist = (Number(constants.swarmArenaRadiusWorld) || 0) + (Number(constants.swarmArenaResistRangeWorld) || 0);
  if (!(dist > maxDist) || !(dist > 0.0001)) return { centerWorld, state };
  const nx = dx / dist;
  const ny = dy / dist;
  const worldToScreenScale = Math.max(0.001, scale || 1);

  const cx = state.arenaCenterWorld.x + (nx * maxDist);
  const cy = state.arenaCenterWorld.y + (ny * maxDist);
  helpers.applyCameraDelta?.((cx - centerWorld.x) * worldToScreenScale, (cy - centerWorld.y) * worldToScreenScale);

  const radial = (Number(state.velocityX) || 0) * nx + (Number(state.velocityY) || 0) * ny;
  if (radial > 0) {
    state.velocityX -= nx * radial;
    state.velocityY -= ny * radial;
  }
  return { centerWorld: { x: cx, y: cy }, state };
}

export function applyLaunchInnerCircleBounceRuntime(options = null) {
  const constants = options?.constants && typeof options.constants === 'object' ? options.constants : {};
  const helpers = options?.helpers && typeof options.helpers === 'object' ? options.helpers : {};
  const state = options?.state && typeof options.state === 'object' ? options.state : {};
  const centerWorld = options?.centerWorld && typeof options.centerWorld === 'object' ? options.centerWorld : null;
  const scale = Number(options?.scale) || 1;

  if (!state.borderForceEnabled) return { centerWorld, state };
  if (!state.arenaCenterWorld || !centerWorld) return { centerWorld, state };
  if (!((Number(state.postReleaseAssistTimer) || 0) > 0) || state.dragPointerId != null) return { centerWorld, state };
  const dx = centerWorld.x - state.arenaCenterWorld.x;
  const dy = centerWorld.y - state.arenaCenterWorld.y;
  const dist = Math.hypot(dx, dy) || 0;
  const r = Number(constants.swarmArenaRadiusWorld) || 0;
  if (!(dist >= r) || !(dist > 0.0001)) return { centerWorld, state };
  const nx = dx / dist;
  const ny = dy / dist;
  const radial = (Number(state.velocityX) || 0) * nx + (Number(state.velocityY) || 0) * ny;
  if (radial <= (Number(constants.swarmReleaseBounceMinSpeed) || 0)) return { centerWorld, state };
  const worldToScreenScale = Math.max(0.001, scale || 1);
  const cx = state.arenaCenterWorld.x + (nx * r);
  const cy = state.arenaCenterWorld.y + (ny * r);
  helpers.applyCameraDelta?.((cx - centerWorld.x) * worldToScreenScale, (cy - centerWorld.y) * worldToScreenScale);
  const rx = (Number(state.velocityX) || 0) - (2 * radial * nx);
  const ry = (Number(state.velocityY) || 0) - (2 * radial * ny);
  state.velocityX = rx * (Number(constants.swarmReleaseBounceRestitution) || 0);
  state.velocityY = ry * (Number(constants.swarmReleaseBounceRestitution) || 0);
  return { centerWorld: { x: cx, y: cy }, state };
}
