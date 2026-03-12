export function getInputVectorRuntime(options = null) {
  const state = options?.state && typeof options.state === 'object' ? options.state : {};
  const constants = options?.constants && typeof options.constants === 'object' ? options.constants : {};
  const helpers = options?.helpers && typeof options.helpers === 'object' ? options.helpers : {};
  const dragPointerId = state.dragPointerId;
  if (dragPointerId == null) {
    if (state.active && state.perfLabRuntime?.autoMoveEnabled) {
      const nowSec = (Number(options?.nowMs) || performance.now()) * 0.001;
      const phase = nowSec + (Number(state.perfLabRuntime?.autoMovePhase) || 0);
      const x = (Math.cos(phase * 0.9) * 0.82) + (Math.cos(phase * 0.31) * 0.28);
      const y = (Math.sin(phase * 0.74) * 0.78) + (Math.sin(phase * 0.19) * 0.34);
      const len = Math.hypot(x, y) || 1;
      return {
        x: x / len,
        y: y / len,
        mag: Math.max(0.15, Math.min(1, Number(state.perfLabRuntime?.autoMoveMagnitude) || 0.82)),
      };
    }
    return { x: 0, y: 0, mag: 0 };
  }
  let dx = (Number(state.dragNowX) || 0) - (Number(state.dragStartX) || 0);
  let dy = (Number(state.dragNowY) || 0) - (Number(state.dragStartY) || 0);
  const len = Math.hypot(dx, dy) || 0;
  if (len <= 0.0001) return { x: 0, y: 0, mag: 0 };
  const joyRadius = Math.max(1, Number(constants.swarmJoystickRadius) || 1);
  const clamped = Math.min(joyRadius, len);
  const nx = dx / len;
  const ny = dy / len;
  dx = nx * clamped;
  dy = ny * clamped;
  helpers.setJoystickKnob?.(dx, dy);
  return { x: nx, y: ny, mag: clamped / joyRadius };
}

export function updateShipFacingRuntime(options = null) {
  const dt = Math.max(0.0001, Number(options?.dt) || 0);
  const inputX = Number(options?.inputX) || 0;
  const inputY = Number(options?.inputY) || 0;
  const overrideTargetDeg = options?.overrideTargetDeg;
  const state = options?.state && typeof options.state === 'object' ? options.state : {};
  const velocityX = Number(state.velocityX) || 0;
  const velocityY = Number(state.velocityY) || 0;
  const dragPointerId = state.dragPointerId;
  let shipFacingDeg = Number(state.shipFacingDeg) || 0;
  const speed = Math.hypot(velocityX, velocityY);
  let targetDeg = Number.isFinite(overrideTargetDeg) ? Number(overrideTargetDeg) : shipFacingDeg;
  if (Number.isFinite(overrideTargetDeg)) {
    // explicit release-aim override
  } else if (speed > 14) {
    targetDeg = (Math.atan2(velocityY, velocityX) * 180 / Math.PI) + 90;
  } else if (dragPointerId != null && (Math.abs(inputX) > 0.001 || Math.abs(inputY) > 0.001)) {
    targetDeg = (Math.atan2(inputY, inputX) * 180 / Math.PI) + 90;
  }
  const wrap = (d) => {
    let v = d;
    while (v > 180) v -= 360;
    while (v < -180) v += 360;
    return v;
  };
  const delta = wrap(targetDeg - shipFacingDeg);
  const turnRate = 10 * dt;
  shipFacingDeg += delta * Math.min(1, turnRate);
  const overlayEl = state.overlayEl || null;
  const ship = overlayEl?.querySelector?.('.beat-swarm-ship');
  if (ship) ship.style.transform = `rotate(${shipFacingDeg.toFixed(2)}deg)`;
  state.shipFacingDeg = shipFacingDeg;
  return shipFacingDeg;
}
