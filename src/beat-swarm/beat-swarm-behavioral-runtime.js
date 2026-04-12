function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function normalizeArchetype(value = '') {
  return String(value || '').trim().toLowerCase();
}

function normalizeBehaviorClass(value = '') {
  return String(value || '').trim().toLowerCase();
}

function normalizeActivationMode(value = '') {
  return String(value || '').trim().toLowerCase();
}

function buildInactiveRuntime(enemyLike = null) {
  const enemy = enemyLike && typeof enemyLike === 'object' ? enemyLike : {};
  return Object.freeze({
    archetype: normalizeArchetype(enemy?.behavioralFormationArchetype || 'none'),
    behaviorClass: normalizeBehaviorClass(enemy?.behavioralFormationClass || 'none'),
    activationMode: normalizeActivationMode(enemy?.behavioralFormationActivationMode || 'inactive'),
    active: enemy?.behavioralFormationActive === true,
    intensity: clamp01(enemy?.behavioralFormationIntensity),
    slotIndex: Math.max(0, Math.trunc(Number(enemy?.formationMemberIndex) || 0)),
    slotCount: Math.max(1, Math.trunc(Number(enemy?.formationMemberCount) || 1)),
    leaderEnemyId: 0,
    leaderBias: 0,
    followDistanceWorld: 0,
    lateralOffsetWorld: 0,
    curvatureBias: 0,
    targetWorld: null,
  });
}

function buildWindingChainRuntime(enemyLike = null, helpers = null) {
  const enemy = enemyLike && typeof enemyLike === 'object' ? enemyLike : {};
  const slotIndex = Math.max(0, Math.trunc(Number(enemy?.formationMemberIndex) || 0));
  const slotCount = Math.max(1, Math.trunc(Number(enemy?.formationMemberCount) || 1));
  const screenToWorld = typeof helpers?.screenToWorld === 'function' ? helpers.screenToWorld : null;
  const screenW = Math.max(1, Number(globalThis.window?.innerWidth) || 0);
  const screenH = Math.max(1, Number(globalThis.window?.innerHeight) || 0);
  const centeredIndex = slotIndex - ((slotCount - 1) * 0.5);
  const laneSide = centeredIndex === 0 ? 0 : (centeredIndex < 0 ? -1 : 1);
  const targetWorld = screenToWorld
    ? screenToWorld({
        x: Math.max(24, Math.min(screenW - 24, (screenW * 0.5) + (centeredIndex * (screenW * 0.045)))),
        y: Math.max(24, Math.min(screenH - 24, (screenH * 0.22) + (Math.abs(centeredIndex) * (screenH * 0.035)))),
      })
    : null;
  return Object.freeze({
    archetype: 'winding_chain',
    behaviorClass: 'follow_the_leader',
    activationMode: normalizeActivationMode(enemy?.behavioralFormationActivationMode || 'opt_in'),
    active: enemy?.behavioralFormationActive === true,
    intensity: clamp01(enemy?.behavioralFormationIntensity || 0.55),
    slotIndex,
    slotCount,
    leaderEnemyId: slotIndex === 0 ? Math.max(0, Math.trunc(Number(enemy?.id) || 0)) : 0,
    leaderBias: slotIndex === 0 ? 1 : 0,
    followDistanceWorld: Math.max(44, Math.round((screenW || 1280) * 0.032)),
    lateralOffsetWorld: laneSide * Math.max(12, Math.round((screenW || 1280) * 0.008)),
    curvatureBias: centeredIndex * 0.18,
    speedMultiplier: enemy?.behavioralFormationActive === true ? 1.75 : 1,
    pathOscillationAmplitude: Math.max(0.18, Math.min(0.72, 0.3 + (clamp01(enemy?.behavioralFormationIntensity || 0.55) * 0.45))),
    pathOscillationHz: 0.55,
    velocityBlend: enemy?.behavioralFormationActive === true ? 0.34 : 0.12,
    targetWorld: targetWorld && Number.isFinite(targetWorld.x) && Number.isFinite(targetWorld.y)
      ? { x: Number(targetWorld.x) || 0, y: Number(targetWorld.y) || 0 }
      : null,
  });
}

export function buildBeatSwarmBehavioralFormationEnemyRuntime(options = null) {
  const opts = options && typeof options === 'object' ? options : {};
  const enemy = opts.enemy && typeof opts.enemy === 'object' ? opts.enemy : null;
  const helpers = opts.helpers && typeof opts.helpers === 'object' ? opts.helpers : null;
  if (!enemy) return buildInactiveRuntime(null);
  const archetype = normalizeArchetype(enemy?.behavioralFormationArchetype || 'none');
  if (archetype === 'winding_chain') {
    return buildWindingChainRuntime(enemy, helpers);
  }
  return buildInactiveRuntime(enemy);
}
