export function shouldSuppressSteeringForReleaseRuntime(options = null) {
  const constants = options?.constants && typeof options.constants === 'object' ? options.constants : {};
  const state = options?.state && typeof options.state === 'object' ? options.state : {};
  const input = options?.input && typeof options.input === 'object' ? options.input : null;
  const centerWorld = options?.centerWorld && typeof options.centerWorld === 'object' ? options.centerWorld : null;
  const arenaCenterWorld = state?.arenaCenterWorld && typeof state.arenaCenterWorld === 'object' ? state.arenaCenterWorld : null;
  if (state.dragPointerId == null) return false;
  if (!arenaCenterWorld || !centerWorld) return false;
  if (!input || !(Number(input.mag) > 0.0001)) return false;
  const dx = centerWorld.x - arenaCenterWorld.x;
  const dy = centerWorld.y - arenaCenterWorld.y;
  const dist = Math.hypot(dx, dy) || 0;
  if (!(dist > (Number(constants.swarmArenaRadiusWorld) || 0)) || !(dist > 0.0001)) return false;
  const nx = dx / dist;
  const ny = dy / dist;
  const inputOut = Math.max(0, (Number(input.x) || 0) * nx + (Number(input.y) || 0) * ny);
  return inputOut > 0.0001;
}

export function getOutwardOnlyInputRuntime(options = null) {
  const state = options?.state && typeof options.state === 'object' ? options.state : {};
  const input = options?.input && typeof options.input === 'object' ? options.input : null;
  const centerWorld = options?.centerWorld && typeof options.centerWorld === 'object' ? options.centerWorld : null;
  const arenaCenterWorld = state?.arenaCenterWorld && typeof state.arenaCenterWorld === 'object' ? state.arenaCenterWorld : null;
  if (!input || !arenaCenterWorld || !centerWorld) return { x: 0, y: 0, mag: 0 };
  const dx = centerWorld.x - arenaCenterWorld.x;
  const dy = centerWorld.y - arenaCenterWorld.y;
  const dist = Math.hypot(dx, dy) || 0;
  if (!(dist > 0.0001)) return { x: 0, y: 0, mag: 0 };
  const nx = dx / dist;
  const ny = dy / dist;
  const inputOut = Math.max(0, (Number(input.x) || 0) * nx + (Number(input.y) || 0) * ny);
  if (!(inputOut > 0.0001)) return { x: 0, y: 0, mag: 0 };
  return {
    x: nx * inputOut,
    y: ny * inputOut,
    mag: Math.max(0, Math.min(1, (Number(input.mag) || 0) * inputOut)),
  };
}

export function getShipFacingFromReleaseAimRuntime(options = null) {
  const constants = options?.constants && typeof options.constants === 'object' ? options.constants : {};
  const state = options?.state && typeof options.state === 'object' ? options.state : {};
  const input = options?.input && typeof options.input === 'object' ? options.input : null;
  const centerWorld = options?.centerWorld && typeof options.centerWorld === 'object' ? options.centerWorld : null;
  const arenaCenterWorld = state?.arenaCenterWorld && typeof state.arenaCenterWorld === 'object' ? state.arenaCenterWorld : null;
  if (!input || !arenaCenterWorld || !centerWorld) return null;
  if (!(Number(input.mag) > 0.0001)) return null;
  const dx = centerWorld.x - arenaCenterWorld.x;
  const dy = centerWorld.y - arenaCenterWorld.y;
  const dist = Math.hypot(dx, dy) || 0;
  if (!(dist > (Number(constants.swarmArenaRadiusWorld) || 0)) || !(dist > 0.0001)) return null;
  const nx = dx / dist;
  const ny = dy / dist;
  const inputOut = Math.max(0, (Number(input.x) || 0) * nx + (Number(input.y) || 0) * ny);
  if (!(inputOut > 0.0001)) return null;
  return (Math.atan2(-(Number(input.y) || 0), -(Number(input.x) || 0)) * 180 / Math.PI) + 90;
}
