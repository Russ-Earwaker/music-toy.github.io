export function spawnProjectileFromDirectionRuntime(options = null) {
  const fromW = options?.fromW || null;
  const dirX = Number(options?.dirX) || 0;
  const dirY = Number(options?.dirY) || 0;
  const damage = Number(options?.damage);
  const nextStages = options?.nextStages;
  const nextBeatIndex = options?.nextBeatIndex;
  const chainContext = options?.chainContext || null;
  const state = options?.state && typeof options.state === 'object' ? options.state : {};
  const constants = options?.constants && typeof options.constants === 'object' ? options.constants : {};
  const helpers = options?.helpers && typeof options.helpers === 'object' ? options.helpers : {};
  const enemyLayerEl = state.enemyLayerEl || null;
  const projectiles = Array.isArray(state.projectiles) ? state.projectiles : null;
  const currentBeatIndex = Math.trunc(Number(state.currentBeatIndex) || 0);
  if (!enemyLayerEl || !projectiles || !fromW) return;
  helpers.logWeaponTuneFireDebug?.('spawn-raw', {
    source: String(chainContext?.debugSource || 'unknown'),
    slotIndex: Number.isFinite(chainContext?.weaponSlotIndex) ? Math.trunc(chainContext.weaponSlotIndex) : null,
    stageIndex: Number.isFinite(chainContext?.stageIndex) ? Math.trunc(chainContext.stageIndex) : null,
    stepIndex: Number.isFinite(chainContext?.debugStepIndex) ? Math.trunc(chainContext.debugStepIndex) : null,
    beatIndex: Number.isFinite(chainContext?.debugBeatIndex) ? Math.trunc(chainContext.debugBeatIndex) : currentBeatIndex,
    damage: Math.max(1, Number.isFinite(damage) ? damage : 1),
  });
  const dir = helpers.normalizeDir?.(dirX, dirY) || { x: 1, y: 0 };
  const el = document.createElement('div');
  el.className = 'beat-swarm-projectile';
  enemyLayerEl.appendChild(el);
  projectiles.push({
    wx: Number(fromW.x) || 0,
    wy: Number(fromW.y) || 0,
    vx: dir.x * (Number(constants.projectileSpeed) || 700),
    vy: dir.y * (Number(constants.projectileSpeed) || 700),
    ttl: Number(constants.projectileLifetime) || 1.8,
    damage: Math.max(1, Number.isFinite(damage) ? damage : 1),
    kind: 'standard',
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
    chainWeaponSlotIndex: Number.isFinite(chainContext?.weaponSlotIndex) ? Math.trunc(chainContext.weaponSlotIndex) : null,
    chainStageIndex: Number.isFinite(chainContext?.stageIndex) ? Math.trunc(chainContext.stageIndex) : null,
    chainDamageScale: Math.max(0.05, Number(chainContext?.damageScale) || 1),
    nextStages: helpers.sanitizeWeaponStages?.(nextStages) || [],
    nextBeatIndex: Number.isFinite(nextBeatIndex) ? Math.max(0, Math.trunc(nextBeatIndex)) : null,
    ignoreEnemyId: Number.isFinite(chainContext?.sourceEnemyId) ? Math.trunc(chainContext.sourceEnemyId) : null,
    hasEnteredScreen: false,
    collisionGraceT: Number(constants.projectileCollisionGraceSeconds) || 0,
    el,
  });
}

export function spawnProjectileRuntime(options = null) {
  const fromW = options?.fromW || null;
  const toEnemy = options?.toEnemy || null;
  const helpers = options?.helpers && typeof options.helpers === 'object' ? options.helpers : {};
  if (!fromW || !toEnemy) return;
  const dx = (Number(toEnemy.wx) || 0) - (Number(fromW.x) || 0);
  const dy = (Number(toEnemy.wy) || 0) - (Number(fromW.y) || 0);
  helpers.spawnProjectileFromDirection?.({
    ...options,
    dirX: dx,
    dirY: dy,
  });
}

export function spawnBoomerangProjectileRuntime(options = null) {
  const fromW = options?.fromW || null;
  const dirX = Number(options?.dirX) || 0;
  const dirY = Number(options?.dirY) || 0;
  const damage = Number(options?.damage);
  const nextStages = options?.nextStages;
  const nextBeatIndex = options?.nextBeatIndex;
  const chainContext = options?.chainContext || null;
  const state = options?.state && typeof options.state === 'object' ? options.state : {};
  const constants = options?.constants && typeof options.constants === 'object' ? options.constants : {};
  const helpers = options?.helpers && typeof options.helpers === 'object' ? options.helpers : {};
  const enemyLayerEl = state.enemyLayerEl || null;
  const projectiles = Array.isArray(state.projectiles) ? state.projectiles : null;
  if (!enemyLayerEl || !projectiles || !fromW) return;
  const dir = helpers.normalizeDir?.(dirX, dirY) || { x: 1, y: 0 };
  const perp = { x: dir.y, y: -dir.x };
  const radius = Math.max(40, Number(constants.projectileBoomerangRadiusWorld) || 320);
  const loopSec = Math.max(0.35, Number(constants.projectileBoomerangLoopSeconds) || 1.15);
  const theta = Math.PI;
  const omega = (Math.PI * 2) / loopSec;
  const el = document.createElement('div');
  el.className = 'beat-swarm-projectile is-boomerang';
  enemyLayerEl.appendChild(el);
  projectiles.push({
    wx: Number(fromW.x) || 0,
    wy: Number(fromW.y) || 0,
    vx: 0,
    vy: 0,
    ttl: loopSec,
    damage: Math.max(1, Number.isFinite(damage) ? damage : 1),
    kind: 'boomerang',
    hitEnemyIds: new Set(),
    boomCenterX: Number(fromW.x) || 0,
    boomCenterY: Number(fromW.y) || 0,
    boomDirX: dir.x,
    boomDirY: dir.y,
    boomPerpX: perp.x,
    boomPerpY: perp.y,
    boomRadius: radius,
    boomTheta: theta,
    boomOmega: omega,
    homingState: '',
    targetEnemyId: null,
    orbitAngle: 0,
    orbitAngVel: 0,
    orbitRadius: 0,
    chainWeaponSlotIndex: Number.isFinite(chainContext?.weaponSlotIndex) ? Math.trunc(chainContext.weaponSlotIndex) : null,
    chainStageIndex: Number.isFinite(chainContext?.stageIndex) ? Math.trunc(chainContext.stageIndex) : null,
    chainDamageScale: Math.max(0.05, Number(chainContext?.damageScale) || 1),
    nextStages: helpers.sanitizeWeaponStages?.(nextStages) || [],
    nextBeatIndex: Number.isFinite(nextBeatIndex) ? Math.max(0, Math.trunc(nextBeatIndex)) : null,
    ignoreEnemyId: Number.isFinite(chainContext?.sourceEnemyId) ? Math.trunc(chainContext.sourceEnemyId) : null,
    hasEnteredScreen: false,
    collisionGraceT: Number(constants.projectileCollisionGraceSeconds) || 0,
    el,
  });
}

export function spawnHomingMissileRuntime(options = null) {
  const fromW = options?.fromW || null;
  const damage = Number(options?.damage);
  const nextStages = options?.nextStages;
  const nextBeatIndex = options?.nextBeatIndex;
  const chainContext = options?.chainContext || null;
  const state = options?.state && typeof options.state === 'object' ? options.state : {};
  const constants = options?.constants && typeof options.constants === 'object' ? options.constants : {};
  const helpers = options?.helpers && typeof options.helpers === 'object' ? options.helpers : {};
  const enemyLayerEl = state.enemyLayerEl || null;
  const projectiles = Array.isArray(state.projectiles) ? state.projectiles : null;
  if (!enemyLayerEl || !projectiles || !fromW) return false;
  const maxOrbiting = Math.max(1, Math.trunc(Number(constants.projectileHomingMaxOrbiting) || 1));
  const orbitingCount = Math.max(0, Math.trunc(Number(helpers.countOrbitingHomingMissiles?.() || 0)));
  if (orbitingCount >= maxOrbiting) return false;
  const angle = ((orbitingCount / maxOrbiting) * Math.PI * 2);
  const el = document.createElement('div');
  el.className = 'beat-swarm-projectile is-homing-missile';
  enemyLayerEl.appendChild(el);
  projectiles.push({
    wx: Number(fromW.x) || 0,
    wy: Number(fromW.y) || 0,
    vx: 0,
    vy: 0,
    ttl: 60,
    damage: Math.max(1, Number.isFinite(damage) ? damage : 1),
    kind: 'homing-missile',
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
    homingState: 'orbit',
    targetEnemyId: null,
    orbitAngle: angle,
    orbitAngVel: Number(constants.projectileHomingOrbitAngVel) || 0,
    orbitRadius: Number(constants.projectileHomingOrbitRadiusWorld) || 0,
    chainWeaponSlotIndex: Number.isFinite(chainContext?.weaponSlotIndex) ? Math.trunc(chainContext.weaponSlotIndex) : null,
    chainStageIndex: Number.isFinite(chainContext?.stageIndex) ? Math.trunc(chainContext.stageIndex) : null,
    chainDamageScale: Math.max(0.05, Number(chainContext?.damageScale) || 1),
    nextStages: helpers.sanitizeWeaponStages?.(nextStages) || [],
    nextBeatIndex: Number.isFinite(nextBeatIndex) ? Math.max(0, Math.trunc(nextBeatIndex)) : null,
    ignoreEnemyId: Number.isFinite(chainContext?.sourceEnemyId) ? Math.trunc(chainContext.sourceEnemyId) : null,
    hasEnteredScreen: false,
    collisionGraceT: Number(constants.projectileCollisionGraceSeconds) || 0,
    el,
  });
  return true;
}

export function queueWeaponChainRuntime(options = null) {
  const beatIndex = options?.beatIndex;
  const nextStages = options?.nextStages;
  const context = options?.context || null;
  const state = options?.state && typeof options.state === 'object' ? options.state : {};
  const constants = options?.constants && typeof options.constants === 'object' ? options.constants : {};
  const helpers = options?.helpers && typeof options.helpers === 'object' ? options.helpers : {};
  const pendingWeaponChainEvents = Array.isArray(state.pendingWeaponChainEvents) ? state.pendingWeaponChainEvents : null;
  if (!pendingWeaponChainEvents) return;
  const stages = helpers.sanitizeWeaponStages?.(nextStages) || [];
  if (!stages.length) return;
  const queuedBeatIndex = Math.max(0, Math.trunc(Number(beatIndex) || 0));
  const impactPoint = context?.impactPoint ? { x: Number(context.impactPoint.x) || 0, y: Number(context.impactPoint.y) || 0 } : null;
  const weaponSlotIndex = Number.isFinite(context?.weaponSlotIndex) ? Math.trunc(context.weaponSlotIndex) : null;
  const impactEnemyId = Number.isFinite(context?.impactEnemyId) ? Math.trunc(context.impactEnemyId) : null;
  const firstStage = stages[0];
  const eventId = Math.max(1, Number(helpers.getNextWeaponChainEventId?.() || 1));
  if (firstStage?.archetype === 'aoe' && firstStage?.variant === 'explosion' && impactPoint) {
    const secondsUntilTrigger = helpers.getSecondsUntilQueuedChainBeat?.(queuedBeatIndex) || 0;
    if (secondsUntilTrigger > 0.02) {
      helpers.addExplosionPrimeEffect?.(
        impactPoint,
        Number(constants.explosionRadiusWorld) || 0,
        secondsUntilTrigger,
        weaponSlotIndex,
        eventId,
        impactEnemyId
      );
    }
  }
  pendingWeaponChainEvents.push({
    eventId,
    beatIndex: queuedBeatIndex,
    stages,
    context: {
      origin: context?.origin ? { x: Number(context.origin.x) || 0, y: Number(context.origin.y) || 0 } : null,
      impactPoint,
      weaponSlotIndex,
      stageIndex: Number.isFinite(context?.stageIndex) ? Math.trunc(context.stageIndex) : null,
      impactEnemyId,
      sourceEnemyId: Number.isFinite(context?.sourceEnemyId) ? Math.trunc(context.sourceEnemyId) : null,
      damageScale: Math.max(0.05, Number(context?.damageScale) || 1),
      forcedNoteName: helpers.normalizeSwarmNoteName?.(context?.forcedNoteName) || null,
    },
  });
}

export function clearBeamEffectsForWeaponSlotRuntime(options = null) {
  const slotIndex = options?.slotIndex;
  const state = options?.state && typeof options.state === 'object' ? options.state : {};
  const effects = Array.isArray(state.effects) ? state.effects : null;
  if (!effects) return;
  const key = Number.isFinite(slotIndex) ? Math.trunc(slotIndex) : null;
  for (let i = effects.length - 1; i >= 0; i--) {
    const fx = effects[i];
    const fxSlot = Number.isFinite(fx?.weaponSlotIndex) ? Math.trunc(fx.weaponSlotIndex) : null;
    const slotMatches = key === null ? true : fxSlot === key;
    if (!slotMatches) continue;
    const isBeam = String(fx?.kind || '') === 'beam';
    const isBeamFallbackLaser = String(fx?.kind || '') === 'laser' && !Number.isFinite(fx?.targetEnemyId);
    if (!isBeam && !isBeamFallbackLaser) continue;
    try { fx?.el?.remove?.(); } catch {}
    effects.splice(i, 1);
  }
}

export function clearPendingWeaponChainsForSlotRuntime(options = null) {
  const slotIndex = options?.slotIndex;
  const state = options?.state && typeof options.state === 'object' ? options.state : {};
  const helpers = options?.helpers && typeof options.helpers === 'object' ? options.helpers : {};
  const pendingWeaponChainEvents = Array.isArray(state.pendingWeaponChainEvents) ? state.pendingWeaponChainEvents : null;
  if (!pendingWeaponChainEvents) return;
  const key = Number.isFinite(slotIndex) ? Math.trunc(slotIndex) : null;
  for (let i = pendingWeaponChainEvents.length - 1; i >= 0; i--) {
    const ev = pendingWeaponChainEvents[i];
    const evSlot = Number.isFinite(ev?.context?.weaponSlotIndex) ? Math.trunc(ev.context.weaponSlotIndex) : null;
    if (key !== null && evSlot !== key) continue;
    if (ev?.eventId) helpers.removeExplosionPrimeEffectsForEvent?.(ev.eventId);
    pendingWeaponChainEvents.splice(i, 1);
  }
}

export function shouldPlayBeamSoundForBeatRuntime(options = null) {
  const slotIndex = options?.slotIndex;
  const beatIndex = options?.beatIndex;
  const state = options?.state && typeof options.state === 'object' ? options.state : {};
  const beamSoundGateSlotKeys = state.beamSoundGateSlotKeys instanceof Set ? state.beamSoundGateSlotKeys : null;
  if (!beamSoundGateSlotKeys) return true;
  const beat = Math.max(0, Math.trunc(Number(beatIndex) || 0));
  if (Number(state.beamSoundGateBeatIndex) !== beat) {
    state.beamSoundGateBeatIndex = beat;
    beamSoundGateSlotKeys.clear();
  }
  const key = Number.isFinite(slotIndex) ? `slot:${Math.trunc(slotIndex)}` : 'slot:none';
  if (beamSoundGateSlotKeys.has(key)) return false;
  beamSoundGateSlotKeys.add(key);
  return true;
}

export function applyAoeAtRuntime(options = null) {
  const point = options?.point || null;
  const variant = String(options?.variant || 'explosion');
  const beatIndex = Number(options?.beatIndex) || 0;
  const weaponSlotIndex = options?.weaponSlotIndex;
  const avoidEnemyId = options?.avoidEnemyId;
  const stageIndex = options?.stageIndex;
  const damageScale = Number(options?.damageScale);
  const state = options?.state && typeof options.state === 'object' ? options.state : {};
  const constants = options?.constants && typeof options.constants === 'object' ? options.constants : {};
  const helpers = options?.helpers && typeof options.helpers === 'object' ? options.helpers : {};
  const enemies = Array.isArray(state.enemies) ? state.enemies : [];
  const lingeringAoeZones = Array.isArray(state.lingeringAoeZones) ? state.lingeringAoeZones : null;
  if (!point || !lingeringAoeZones) return;
  const radius = Math.max(1, Number(constants.explosionRadiusWorld) || 1);
  const info = helpers.getLoopInfo?.();
  const beatLen = Math.max(0.05, Number(info?.beatLen) || 0.5);
  const dmgScale = Math.max(0.05, Number.isFinite(damageScale) ? damageScale : 1);
  helpers.addExplosionEffect?.(point, radius, variant === 'dot-area' ? (beatLen * 2) : null, weaponSlotIndex);
  const r2 = radius * radius;
  const isDot = variant === 'dot-area';
  const hitDamage = (isDot ? 0.5 : 1) * dmgScale;
  const hitCandidates = [];
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (!e) continue;
    const dx = (Number(e.wx) || 0) - (Number(point.x) || 0);
    const dy = (Number(e.wy) || 0) - (Number(point.y) || 0);
    const d2 = (dx * dx) + (dy * dy);
    if (d2 <= r2) {
      hitCandidates.push({
        enemyId: Number.isFinite(e?.id) ? Math.trunc(e.id) : null,
        point: { x: Number(e.wx) || 0, y: Number(e.wy) || 0 },
        d2,
      });
    }
  }
  hitCandidates.sort((a, b) => a.d2 - b.d2);
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    if (!e) continue;
    const dx = (Number(e.wx) || 0) - (Number(point.x) || 0);
    const dy = (Number(e.wy) || 0) - (Number(point.y) || 0);
    const d2 = (dx * dx) + (dy * dy);
    if (d2 <= r2) helpers.withDamageSoundStage?.(stageIndex, () => helpers.damageEnemy?.(e, hitDamage));
  }
  if (isDot) {
    lingeringAoeZones.push({
      x: Number(point.x) || 0,
      y: Number(point.y) || 0,
      radius,
      damagePerBeat: 0.6 * dmgScale,
      untilBeat: Math.max(beatIndex + 2, beatIndex + 1),
      weaponSlotIndex: Number.isFinite(weaponSlotIndex) ? Math.trunc(weaponSlotIndex) : null,
      stageIndex: Number.isFinite(stageIndex) ? Math.trunc(stageIndex) : null,
    });
  }
  const avoidId = Number.isFinite(avoidEnemyId) ? Math.trunc(avoidEnemyId) : null;
  const selected = hitCandidates.find((c) => c.enemyId !== avoidId) || hitCandidates[0] || null;
  return {
    firstHitEnemyId: Number.isFinite(selected?.enemyId) ? Math.trunc(selected.enemyId) : null,
    firstHitPoint: selected?.point || null,
  };
}
