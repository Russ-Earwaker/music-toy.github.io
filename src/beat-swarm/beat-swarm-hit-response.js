const TAU = Math.PI * 2;

function normalizeDirection(x, y, fallbackX = 1, fallbackY = 0) {
  const length = Math.hypot(Number(x) || 0, Number(y) || 0);
  if (length > 0.0001) return { x: (Number(x) || 0) / length, y: (Number(y) || 0) / length };
  const fallbackLength = Math.hypot(Number(fallbackX) || 0, Number(fallbackY) || 0) || 1;
  return { x: (Number(fallbackX) || 0) / fallbackLength, y: (Number(fallbackY) || 0) / fallbackLength };
}

function rotateDirection(direction, angleRad) {
  const c = Math.cos(angleRad);
  const s = Math.sin(angleRad);
  return {
    x: (direction.x * c) - (direction.y * s),
    y: (direction.x * s) + (direction.y * c),
  };
}

export function createBeatSwarmPlayerHealthRuntime(options = null) {
  const maximum = Math.max(1, Number(options?.maximum) || 100);
  return {
    current: maximum,
    maximum,
    infinite: options?.infinite !== false,
    knockbackImmuneUntilMs: 0,
    lastHitAtMs: -Infinity,
    hitCount: 0,
  };
}

export function resolveBeatSwarmPlayerHitRuntime(options = null) {
  const state = options?.state && typeof options.state === 'object' ? options.state : null;
  if (!state) return { accepted: false, knockbackApplied: false, reason: 'missing_state' };
  const hit = options?.hit && typeof options.hit === 'object' ? options.hit : {};
  const nowMs = Number.isFinite(Number(options?.nowMs)) ? Number(options.nowMs) : Date.now();
  const random = typeof options?.random === 'function' ? options.random : Math.random;
  const sourceType = String(hit.sourceType || 'unknown').trim().toLowerCase();
  const player = hit.playerPosition && typeof hit.playerPosition === 'object'
    ? hit.playerPosition
    : { x: 0, y: 0 };
  const source = hit.sourcePosition && typeof hit.sourcePosition === 'object'
    ? hit.sourcePosition
    : null;
  let direction;
  if (sourceType === 'aoe') {
    const angle = random() * TAU;
    direction = { x: Math.cos(angle), y: Math.sin(angle) };
  } else if (sourceType === 'collision' && source) {
    direction = normalizeDirection(
      (Number(player.x) || 0) - (Number(source.x) || 0),
      (Number(player.y) || 0) - (Number(source.y) || 0),
      1,
      0,
    );
  } else {
    direction = normalizeDirection(hit?.travelDirection?.x, hit?.travelDirection?.y, 1, 0);
    if (sourceType === 'projectile' || sourceType === 'laser') {
      const variationRad = ((random() * 2) - 1) * (Math.PI * (Math.max(0, Number(hit.variationDegrees) || 25) / 180));
      direction = rotateDirection(direction, variationRad);
    }
  }

  const damage = Math.max(0, Number(hit.damage) || 1);
  state.hitCount = Math.max(0, Math.trunc(Number(state.hitCount) || 0)) + 1;
  state.lastHitAtMs = nowMs;
  if (state.infinite !== true) state.current = Math.max(0, (Number(state.current) || 0) - damage);
  const knockbackApplied = nowMs >= (Number(state.knockbackImmuneUntilMs) || 0);
  if (knockbackApplied) {
    state.knockbackImmuneUntilMs = nowMs + Math.max(0, Number(hit.knockbackImmunityMs) || 1000);
  }
  return {
    accepted: true,
    knockbackApplied,
    direction,
    impulse: knockbackApplied ? Math.max(0, Number(hit.knockbackStrength) || 760) : 0,
    damageApplied: state.infinite === true ? 0 : damage,
    currentHealth: Math.max(0, Number(state.current) || 0),
    maximumHealth: Math.max(1, Number(state.maximum) || 100),
    infinite: state.infinite === true,
    sourceType,
  };
}

export function isEnemyMusicalActivationVisualActiveRuntime(enemy) {
  return enemy?.combatPrepareVisualStartedAtMs != null
    || enemy?.combatFireVisualStartedAtMs != null
    || enemy?.combatCharging === true;
}
