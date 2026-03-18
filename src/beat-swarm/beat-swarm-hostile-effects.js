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
  const pooledHostileRedProjectiles = Array.isArray(state.pooledHostileRedProjectiles) ? state.pooledHostileRedProjectiles : null;
  const pooledHostileRedProjectileStates = Array.isArray(state.pooledHostileRedProjectileStates) ? state.pooledHostileRedProjectileStates : null;
  if (!enemyLayerEl || !projectiles || !origin) return;
  const ang = Number.isFinite(opts?.angle) ? Number(opts.angle) : (Math.random() * Math.PI * 2);
  const speed = Math.max(120, Number(opts?.speed) || Number(constants.composerGroupProjectileSpeed) || 0);
  const hostileNoteName = String(
    opts?.noteNameResolved
      || helpers.normalizeSwarmNoteName?.(opts?.noteName)
      || 'C4'
  ).trim() || 'C4';
  const hostileInstrument = String(
    opts?.instrumentResolved
      || helpers.resolveInstrumentIdOrFallback?.(
        opts?.instrument,
        helpers.resolveSwarmSoundInstrumentId?.('projectile') || 'tone'
      )
      || 'tone'
  ).trim() || 'tone';
  const pooledEl = pooledHostileRedProjectiles && pooledHostileRedProjectiles.length
    ? pooledHostileRedProjectiles.pop()
    : null;
  const el = pooledEl instanceof HTMLElement ? pooledEl : document.createElement('div');
  el.className = 'beat-swarm-projectile is-hostile-red';
  enemyLayerEl.appendChild(el);
  const pooledProjectile = pooledHostileRedProjectileStates && pooledHostileRedProjectileStates.length
    ? pooledHostileRedProjectileStates.pop()
    : null;
  const projectile = pooledProjectile && typeof pooledProjectile === 'object'
    ? pooledProjectile
    : {};
  const hitEnemyIds = projectile.hitEnemyIds instanceof Set ? projectile.hitEnemyIds : new Set();
  hitEnemyIds.clear();
  projectile.wx = Number(origin.x) || 0;
  projectile.wy = Number(origin.y) || 0;
  projectile.vx = Math.cos(ang) * speed;
  projectile.vy = Math.sin(ang) * speed;
  projectile.ttl = Number(constants.projectileLifetime) || 1.5;
  projectile.damage = Math.max(0.1, Number(opts?.damage) || 1);
  projectile.kind = 'hostile-red';
  projectile.hitEnemyIds = hitEnemyIds;
  projectile.boomCenterX = 0;
  projectile.boomCenterY = 0;
  projectile.boomDirX = 0;
  projectile.boomDirY = 0;
  projectile.boomPerpX = 0;
  projectile.boomPerpY = 0;
  projectile.boomRadius = 0;
  projectile.boomTheta = 0;
  projectile.boomOmega = 0;
  projectile.homingState = '';
  projectile.targetEnemyId = null;
  projectile.orbitAngle = 0;
  projectile.orbitAngVel = 0;
  projectile.orbitRadius = 0;
  projectile.chainWeaponSlotIndex = null;
  projectile.chainStageIndex = null;
  projectile.nextStages = Array.isArray(projectile.nextStages) ? projectile.nextStages : [];
  projectile.nextStages.length = 0;
  projectile.nextBeatIndex = null;
  projectile.ignoreEnemyId = null;
  projectile.hasEnteredScreen = false;
  projectile.hostileToEnemies = false;
  projectile.hostileNoteName = hostileNoteName;
  projectile.hostileInstrument = hostileInstrument;
  projectile.el = el;
  projectiles.push(projectile);
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
