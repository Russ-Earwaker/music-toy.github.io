export function getAliveEnemiesByIdsRuntime(options = null) {
  const idSet = options?.idSet instanceof Set ? options.idSet : new Set();
  const state = options?.state && typeof options.state === 'object' ? options.state : {};
  const enemies = Array.isArray(state.enemies) ? state.enemies : [];
  const out = [];
  for (const e of enemies) {
    if (!idSet.has(Math.trunc(Number(e?.id) || 0))) continue;
    out.push(e);
  }
  return out;
}

export function spawnHostileRedProjectileAtRuntime(options = null) {
  const origin = options?.origin || null;
  const opts = options?.opts && typeof options.opts === 'object' ? options.opts : {};
  const state = options?.state && typeof options.state === 'object' ? options.state : {};
  const constants = options?.constants && typeof options.constants === 'object' ? options.constants : {};
  const helpers = options?.helpers && typeof options.helpers === 'object' ? options.helpers : {};
  const enemyLayerEl = state.enemyLayerEl || null;
  const projectiles = Array.isArray(state.projectiles) ? state.projectiles : null;
  if (!enemyLayerEl || !projectiles || !origin) return;
  const ang = Number.isFinite(opts?.angle) ? Number(opts.angle) : (Math.random() * Math.PI * 2);
  const speed = Math.max(120, Number(opts?.speed) || Number(constants.composerGroupProjectileSpeed) || 0);
  const el = document.createElement('div');
  el.className = 'beat-swarm-projectile is-hostile-red';
  enemyLayerEl.appendChild(el);
  projectiles.push({
    wx: Number(origin.x) || 0,
    wy: Number(origin.y) || 0,
    vx: Math.cos(ang) * speed,
    vy: Math.sin(ang) * speed,
    ttl: Number(constants.projectileLifetime) || 1.5,
    damage: Math.max(0.1, Number(opts?.damage) || 1),
    kind: 'hostile-red',
    hitEnemyIds: new Set(),
    boomCenterX: 0,
    boomCenterY: 0,
    boomDirX: 0,
    boomDirY: 0,
    boomPerpX: 0,
    boomPerpY: 0,
    boomRadius: 0,
    boomTheta: 0,
    boomOmega: 0,
    homingState: '',
    targetEnemyId: null,
    orbitAngle: 0,
    orbitAngVel: 0,
    orbitRadius: 0,
    chainWeaponSlotIndex: null,
    chainStageIndex: null,
    nextStages: [],
    nextBeatIndex: null,
    ignoreEnemyId: null,
    hasEnteredScreen: false,
    hostileToEnemies: false,
    hostileNoteName: helpers.normalizeSwarmNoteName?.(opts?.noteName) || 'C4',
    hostileInstrument: helpers.resolveInstrumentIdOrFallback?.(
      opts?.instrument,
      helpers.resolveSwarmSoundInstrumentId?.('projectile') || 'tone'
    ),
    el,
  });
}

export function addHostileRedExplosionEffectRuntime(options = null) {
  const centerW = options?.centerW || null;
  const radiusWorld = options?.radiusWorld;
  const ttlOverride = options?.ttlOverride;
  const state = options?.state && typeof options.state === 'object' ? options.state : {};
  const constants = options?.constants && typeof options.constants === 'object' ? options.constants : {};
  const enemyLayerEl = state.enemyLayerEl || null;
  const effects = Array.isArray(state.effects) ? state.effects : null;
  if (!enemyLayerEl || !effects || !centerW) return;
  const el = document.createElement('div');
  el.className = 'beat-swarm-fx-explosion is-hostile-red';
  el.style.transform = 'translate(-9999px, -9999px)';
  enemyLayerEl.appendChild(el);
  effects.push({
    kind: 'hostile-explosion',
    ttl: Math.max(0.01, Number(ttlOverride) || Number(constants.composerGroupExplosionTtl) || 0.1),
    at: { ...centerW },
    radiusWorld: Math.max(10, Number(radiusWorld) || Number(constants.composerGroupExplosionRadiusWorld) || 10),
    weaponSlotIndex: null,
    el,
  });
}

export function triggerCosmeticSyncAtRuntime(options = null) {
  const origin = options?.origin || null;
  const beatIndex = options?.beatIndex;
  const reason = options?.reason;
  const actorEl = options?.actorEl || null;
  const constants = options?.constants && typeof options.constants === 'object' ? options.constants : {};
  const helpers = options?.helpers && typeof options.helpers === 'object' ? options.helpers : {};
  if (!origin || !Number.isFinite(origin.x) || !Number.isFinite(origin.y)) return false;
  const cosmeticThreat = helpers.tryConsumeSwarmThreatIntent?.('cosmetic', 1, beatIndex, reason);
  if (!cosmeticThreat?.withinBudget) return false;
  helpers.addHostileRedExplosionEffect?.(
    { x: Number(origin.x) || 0, y: Number(origin.y) || 0 },
    Math.max(8, (Number(constants.lowThreatBurstRadiusWorld) || 0) * 0.32),
    Math.max(0.04, (Number(constants.lowThreatBurstTtl) || 0) * 0.72)
  );
  if (actorEl) helpers.pulseHitFlash?.(actorEl);
  return true;
}

export function triggerLowThreatBurstAtRuntime(options = null) {
  const origin = options?.origin || null;
  const beatIndex = options?.beatIndex;
  const reason = options?.reason;
  const constants = options?.constants && typeof options.constants === 'object' ? options.constants : {};
  const helpers = options?.helpers && typeof options.helpers === 'object' ? options.helpers : {};
  if (!origin || !Number.isFinite(origin.x) || !Number.isFinite(origin.y)) return false;
  const lightThreat = helpers.tryConsumeSwarmThreatIntent?.('light', 1, beatIndex, reason);
  if (!lightThreat?.withinBudget) {
    return helpers.triggerCosmeticSyncAt?.(
      origin,
      beatIndex,
      `${String(reason || 'low-threat-burst')}-cosmetic`
    );
  }
  helpers.addHostileRedExplosionEffect?.(
    { x: Number(origin.x) || 0, y: Number(origin.y) || 0 },
    Number(constants.lowThreatBurstRadiusWorld) || 0,
    Number(constants.lowThreatBurstTtl) || 0
  );
  return true;
}
