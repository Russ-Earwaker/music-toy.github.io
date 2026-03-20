function safeInt(value, fallback = 0) {
  return Number.isFinite(value) ? Math.trunc(value) : fallback;
}

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
  const pendingDeath = impactEnemyId > 0 ? (helpers.getPendingEnemyDeathByEnemyId?.(impactEnemyId) || null) : null;
  const resolvedBeatIndex = (
    firstStage?.archetype === 'aoe'
    && firstStage?.variant === 'explosion'
    && pendingDeath
    && Number.isFinite(pendingDeath?.popBeat)
  )
    ? Math.max(0, Math.trunc(Number(pendingDeath.popBeat) || queuedBeatIndex))
    : queuedBeatIndex;
  const existingExplosionEvent = (
    firstStage?.archetype === 'aoe'
    && firstStage?.variant === 'explosion'
    && impactEnemyId > 0
  )
    ? (pendingWeaponChainEvents.find((ev) => {
      const evStages = Array.isArray(ev?.stages) ? ev.stages : [];
      const evFirst = evStages[0] || null;
      const evImpactEnemyId = Number.isFinite(ev?.context?.impactEnemyId) ? Math.trunc(ev.context.impactEnemyId) : null;
      return evFirst?.archetype === 'aoe'
        && evFirst?.variant === 'explosion'
        && evImpactEnemyId === impactEnemyId;
    }) || null)
    : null;
  if (existingExplosionEvent) {
    helpers.noteMusicSystemEvent?.('weapon_explosion_queue_retargeted', {
      chainEventId: safeInt(existingExplosionEvent?.eventId, 0),
      weaponSlotIndex,
      impactEnemyId,
      scheduledBeatIndex: resolvedBeatIndex,
      damageScale: Math.max(0.05, Number(context?.damageScale) || 1),
    }, { beatIndex: resolvedBeatIndex, stepIndex: 0 });
    existingExplosionEvent.beatIndex = resolvedBeatIndex;
    existingExplosionEvent.stages = stages;
    existingExplosionEvent.context = {
      ...existingExplosionEvent.context,
      origin: context?.origin ? { x: Number(context.origin.x) || 0, y: Number(context.origin.y) || 0 } : existingExplosionEvent.context?.origin || null,
      impactPoint: impactPoint || existingExplosionEvent.context?.impactPoint || null,
      weaponSlotIndex,
      stageIndex: Number.isFinite(context?.stageIndex) ? Math.trunc(context.stageIndex) : existingExplosionEvent.context?.stageIndex ?? null,
      impactEnemyId,
      sourceEnemyId: Number.isFinite(context?.sourceEnemyId) ? Math.trunc(context.sourceEnemyId) : existingExplosionEvent.context?.sourceEnemyId ?? null,
      damageScale: Math.max(
        0.05,
        Math.max(Number(context?.damageScale) || 0, Number(existingExplosionEvent.context?.damageScale) || 0.05)
      ),
      forcedNoteName: helpers.normalizeSwarmNoteName?.(context?.forcedNoteName) || existingExplosionEvent.context?.forcedNoteName || null,
    };
    if (existingExplosionEvent?.eventId) helpers.removeExplosionPrimeEffectsForEvent?.(existingExplosionEvent.eventId);
    if (impactPoint) {
      const secondsUntilTrigger = helpers.getSecondsUntilQueuedChainBeat?.(resolvedBeatIndex) || 0;
      if (secondsUntilTrigger > 0.02) {
        helpers.addExplosionPrimeEffect?.(
          impactPoint,
          Number(constants.explosionRadiusWorld) || 0,
          secondsUntilTrigger,
          weaponSlotIndex,
          existingExplosionEvent.eventId,
          impactEnemyId,
          Number.isFinite(existingExplosionEvent.context?.stageIndex) ? Math.trunc(existingExplosionEvent.context.stageIndex) : null,
          Math.max(0.05, Number(existingExplosionEvent.context?.damageScale) || 1)
        );
      }
    }
    return;
  }
  const eventId = Math.max(1, Number(helpers.getNextWeaponChainEventId?.() || 1));
  if (firstStage?.archetype === 'aoe' && firstStage?.variant === 'explosion' && impactPoint) {
    const secondsUntilTrigger = helpers.getSecondsUntilQueuedChainBeat?.(resolvedBeatIndex) || 0;
    if (secondsUntilTrigger > 0.02) {
      helpers.addExplosionPrimeEffect?.(
        impactPoint,
        Number(constants.explosionRadiusWorld) || 0,
        secondsUntilTrigger,
        weaponSlotIndex,
        eventId,
        impactEnemyId,
        Number.isFinite(context?.stageIndex) ? Math.trunc(context.stageIndex) : null,
        Math.max(0.05, Number(context?.damageScale) || 1)
      );
    }
  }
  pendingWeaponChainEvents.push({
    eventId,
    beatIndex: resolvedBeatIndex,
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
  helpers.noteMusicSystemEvent?.('weapon_explosion_queue_created', {
    chainEventId: eventId,
    weaponSlotIndex,
    impactEnemyId,
    scheduledBeatIndex: resolvedBeatIndex,
    damageScale: Math.max(0.05, Number(context?.damageScale) || 1),
  }, { beatIndex: resolvedBeatIndex, stepIndex: 0 });
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
    const firstStage = Array.isArray(ev?.stages) ? (ev.stages[0] || null) : null;
    const preserveExplosionQueue = firstStage?.archetype === 'aoe' && firstStage?.variant === 'explosion';
    if (preserveExplosionQueue) continue;
    helpers.noteMusicSystemEvent?.('weapon_explosion_queue_cleared', {
      chainEventId: safeInt(ev?.eventId, 0),
      weaponSlotIndex: evSlot,
      impactEnemyId: safeInt(ev?.context?.impactEnemyId, 0),
      scheduledBeatIndex: safeInt(ev?.beatIndex, 0),
      reason: 'slot_cleared',
    }, { beatIndex: safeInt(ev?.beatIndex, 0), stepIndex: 0 });
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
  const avoidId = Number.isFinite(avoidEnemyId) ? Math.trunc(avoidEnemyId) : null;
  let nearestCandidate = null;
  let fallbackCandidate = null;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (!e) continue;
    const dx = (Number(e.wx) || 0) - (Number(point.x) || 0);
    const dy = (Number(e.wy) || 0) - (Number(point.y) || 0);
    const d2 = (dx * dx) + (dy * dy);
    if (d2 > r2) continue;
    helpers.withDamageSoundStage?.(stageIndex, () => helpers.damageEnemy?.(e, hitDamage));
    const candidate = {
      enemyId: Number.isFinite(e?.id) ? Math.trunc(e.id) : null,
      point: { x: Number(e.wx) || 0, y: Number(e.wy) || 0 },
      d2,
    };
    if (!fallbackCandidate || d2 < fallbackCandidate.d2) fallbackCandidate = candidate;
    if (candidate.enemyId !== avoidId && (!nearestCandidate || d2 < nearestCandidate.d2)) nearestCandidate = candidate;
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
  const selected = nearestCandidate || fallbackCandidate || null;
  return {
    firstHitEnemyId: Number.isFinite(selected?.enemyId) ? Math.trunc(selected.enemyId) : null,
    firstHitPoint: selected?.point || null,
  };
}

export function processPendingWeaponChainsRuntime(options = null) {
  const beatIndex = Math.trunc(Number(options?.beatIndex) || 0);
  const state = options?.state && typeof options.state === 'object' ? options.state : {};
  const helpers = options?.helpers && typeof options.helpers === 'object' ? options.helpers : {};
  const pendingWeaponChainEvents = Array.isArray(state.pendingWeaponChainEvents) ? state.pendingWeaponChainEvents : null;
  if (!pendingWeaponChainEvents) return;
  for (let i = pendingWeaponChainEvents.length - 1; i >= 0; i--) {
    const ev = pendingWeaponChainEvents[i];
    if ((Number(ev?.beatIndex) || 0) > beatIndex) continue;
    pendingWeaponChainEvents.splice(i, 1);
    helpers.noteMusicSystemEvent?.('weapon_explosion_queue_processed', {
      chainEventId: safeInt(ev?.eventId, 0),
      weaponSlotIndex: safeInt(ev?.context?.weaponSlotIndex, -1),
      impactEnemyId: safeInt(ev?.context?.impactEnemyId, 0),
      scheduledBeatIndex: safeInt(ev?.beatIndex, 0),
    }, { beatIndex, stepIndex: 0 });
    if (Number.isFinite(ev?.eventId)) helpers.removeExplosionPrimeEffectsForEvent?.(ev.eventId);
    const stages = helpers.sanitizeWeaponStages?.(ev?.stages) || [];
    if (!stages.length) continue;
    const stage = stages[0];
    const rem = stages.slice(1);
    const origin = ev?.context?.impactPoint || ev?.context?.origin || helpers.getViewportCenterWorld?.();
    helpers.triggerWeaponStage?.(stage, origin, beatIndex, rem, {
      ...(ev?.context || null),
      chainEventId: Number.isFinite(ev?.eventId) ? Math.trunc(ev.eventId) : null,
    });
  }
}

export function applyLingeringAoeBeatRuntime(options = null) {
  const beatIndex = Math.trunc(Number(options?.beatIndex) || 0);
  const state = options?.state && typeof options.state === 'object' ? options.state : {};
  const constants = options?.constants && typeof options.constants === 'object' ? options.constants : {};
  const helpers = options?.helpers && typeof options.helpers === 'object' ? options.helpers : {};
  const lingeringAoeZones = Array.isArray(state.lingeringAoeZones) ? state.lingeringAoeZones : null;
  const enemies = Array.isArray(state.enemies) ? state.enemies : [];
  if (!lingeringAoeZones) return;
  for (let i = lingeringAoeZones.length - 1; i >= 0; i--) {
    const z = lingeringAoeZones[i];
    if ((Number(z?.untilBeat) || 0) < beatIndex) {
      lingeringAoeZones.splice(i, 1);
      continue;
    }
    const r2 = (Number(z?.radius) || Number(constants.explosionRadiusWorld) || 1) ** 2;
    const dmg = Math.max(0, Number(z?.damagePerBeat) || 0);
    const stageIndex = Number.isFinite(z?.stageIndex) ? Math.trunc(z.stageIndex) : null;
    for (let j = enemies.length - 1; j >= 0; j--) {
      const e = enemies[j];
      const dx = (Number(e?.wx) || 0) - (Number(z?.x) || 0);
      const dy = (Number(e?.wy) || 0) - (Number(z?.y) || 0);
      if ((dx * dx + dy * dy) <= r2) {
        helpers.withDamageSoundStage?.(stageIndex, () => helpers.damageEnemy?.(e, dmg));
      }
    }
  }
}

export function triggerWeaponStageRuntime(options = null) {
  const stage = options?.stage || null;
  const originWorld = options?.originWorld || null;
  const beatIndex = Number(options?.beatIndex) || 0;
  const remainingStages = options?.remainingStages;
  const context = options?.context || null;
  const state = options?.state && typeof options.state === 'object' ? options.state : {};
  const constants = options?.constants && typeof options.constants === 'object' ? options.constants : {};
  const helpers = options?.helpers && typeof options.helpers === 'object' ? options.helpers : {};
  const getPerfNow = typeof helpers.getPerfNow === 'function'
    ? helpers.getPerfNow
    : (() => (globalThis.performance?.now?.() ?? Date.now()));
  const recordPerfSample = typeof helpers.recordStepEventsPerfSample === 'function'
    ? helpers.recordStepEventsPerfSample
    : null;
  const withPerfSample = (name, fn) => {
    if (typeof fn !== 'function') return undefined;
    if (typeof recordPerfSample !== 'function') return fn();
    const startedAt = getPerfNow();
    try {
      return fn();
    } finally {
      recordPerfSample(name, Math.max(0, getPerfNow() - startedAt));
    }
  };
  if (!stage || !originWorld) return;
  const archetype = stage.archetype;
  const variant = stage.variant;
  const continuation = withPerfSample(
    'pickupsCombat.weaponRuntime.stepChange.processEvents.execute.player.fire.tunedStage.continuation',
    () => (helpers.sanitizeWeaponStages?.(remainingStages) || [])
  );
  const slotIndex = Number.isFinite(context?.weaponSlotIndex) ? Math.trunc(context.weaponSlotIndex) : -1;
  const stageIndex = Number.isFinite(context?.stageIndex) ? Math.trunc(context.stageIndex) : 0;
  const damageScale = Math.max(0.05, Number(context?.damageScale) || 1);
  const forcedNoteName = helpers.normalizeSwarmNoteName?.(context?.forcedNoteName) || null;
  const directSound = !!context?.directSound;
  const playerSoundVolumeMult = Math.max(0.1, Math.min(1, Number(context?.playerSoundVolumeMult) || 1));
  const gameplayWeaponSoundVolume = (() => {
    const volumeArchetype = (archetype === 'laser' && variant === 'hitscan') ? 'projectile' : archetype;
    const volumeVariant = (archetype === 'laser' && variant === 'hitscan') ? 'standard' : variant;
    if (typeof helpers.getGameplayWeaponSoundVolume === 'function') {
      return Math.max(0, Math.min(1, (Number(helpers.getGameplayWeaponSoundVolume(volumeArchetype, volumeVariant, stageIndex)) || 0) * 0.58 * playerSoundVolumeMult));
    }
    return Math.max(0, Math.min(1, (Number(helpers.getStageSoundVolume?.(stageIndex)) || 0) * 0.58 * playerSoundVolumeMult));
  })();
  const nextCtx = {
    weaponSlotIndex: slotIndex,
    stageIndex: stageIndex + 1,
    damageScale,
    forcedNoteName: helpers.normalizeSwarmNoteName?.(context?.forcedNoteName) || null,
    directSound,
    debugSource: String(context?.debugSource || ''),
    debugStepIndex: Number.isFinite(context?.debugStepIndex) ? Math.trunc(context.debugStepIndex) : null,
    debugBeatIndex: Number.isFinite(context?.debugBeatIndex) ? Math.trunc(context.debugBeatIndex) : null,
    debugNoteIndex: Number.isFinite(context?.debugNoteIndex) ? Math.trunc(context.debugNoteIndex) : null,
  };
  withPerfSample('pickupsCombat.weaponRuntime.stepChange.processEvents.execute.player.fire.tunedStage.debug', () => {
    helpers.logWeaponTuneFireDebug?.('stage', {
      source: String(context?.debugSource || ''),
      archetype: String(archetype || ''),
      variant: String(variant || ''),
      soundEventKey: helpers.getPlayerWeaponSoundEventKeyForStage?.(archetype, variant) || '',
      damageScale,
      stageIndex,
      slotIndex,
      stepIndex: Number.isFinite(context?.debugStepIndex) ? Math.trunc(context.debugStepIndex) : null,
      beatIndex: Number.isFinite(context?.debugBeatIndex) ? Math.trunc(context.debugBeatIndex) : Math.trunc(Number(beatIndex) || 0),
      noteIndex: Number.isFinite(context?.debugNoteIndex) ? Math.trunc(context.debugNoteIndex) : null,
    });
  });
  const sourceEnemyId = Number.isFinite(context?.sourceEnemyId) ? Math.trunc(context.sourceEnemyId) : null;
  const nearest = withPerfSample(
    'pickupsCombat.weaponRuntime.stepChange.processEvents.execute.player.fire.tunedStage.nearestEnemy',
    () => (helpers.getNearestEnemy?.(originWorld.x, originWorld.y, sourceEnemyId) || null)
  );
  if (archetype === 'projectile') {
    return withPerfSample('pickupsCombat.weaponRuntime.stepChange.processEvents.execute.player.fire.tunedStage.projectile', () => {
      if (!helpers.shouldMuteProjectileStageSound?.(slotIndex)) {
        const noteName = forcedNoteName || helpers.getSwarmEnemySoundNoteById?.(nearest?.id);
        const weaponSoundKey = helpers.getPlayerWeaponSoundEventKeyForStage?.(archetype, variant) || 'projectile';
        if (directSound) {
          helpers.playSwarmSoundEventImmediate?.(weaponSoundKey, gameplayWeaponSoundVolume, noteName);
        } else {
          helpers.noteSwarmSoundEvent?.(weaponSoundKey, gameplayWeaponSoundVolume, beatIndex, noteName, {
            authoringClass: 'gameplayauthored',
            sourceSystem: 'player',
            actionType: `${archetype}-${variant}`,
          });
        }
      }
      const facingDir = helpers.getShipFacingDirWorld?.() || { x: 1, y: 0 };
      const baseDir = nearest
        ? (helpers.normalizeDir?.(nearest.wx - originWorld.x, nearest.wy - originWorld.y) || facingDir)
        : facingDir;
      const chainSpawnOffsetWorld = helpers.getProjectileChainSpawnOffsetWorld?.() || 0;
      const spawnOrigin = Number.isFinite(sourceEnemyId)
        ? (helpers.getOffsetPoint?.(originWorld, nearest ? { x: nearest.wx, y: nearest.wy } : null, chainSpawnOffsetWorld, facingDir) || originWorld)
        : originWorld;
      if (variant === 'homing-missile') {
        helpers.logWeaponTuneFireDebug?.('spawn', { source: nextCtx.debugSource, projectileKind: 'homing-missile', shots: 1, stageIndex, slotIndex });
        helpers.spawnHomingMissile?.(spawnOrigin, 2 * damageScale, continuation, beatIndex + 1, nextCtx);
        return;
      }
      if (variant === 'boomerang') {
        helpers.logWeaponTuneFireDebug?.('spawn', { source: nextCtx.debugSource, projectileKind: 'boomerang', shots: 1, stageIndex, slotIndex });
        helpers.spawnBoomerangProjectile?.(spawnOrigin, baseDir.x, baseDir.y, 2 * damageScale, continuation, beatIndex + 1, nextCtx);
        return;
      }
      if (variant === 'split-shot') {
        const baseAngle = Math.atan2(baseDir.y, baseDir.x);
        const split = Number(constants.projectileSplitAngleRad) || 0;
        const angles = [baseAngle, baseAngle - split, baseAngle + split];
        helpers.logWeaponTuneFireDebug?.('spawn', { source: nextCtx.debugSource, projectileKind: 'split-shot', shots: angles.length, stageIndex, slotIndex });
        for (const ang of angles) {
          helpers.spawnProjectileFromDirection?.(spawnOrigin, Math.cos(ang), Math.sin(ang), 2 * damageScale, continuation, beatIndex + 1, nextCtx);
        }
        return;
      }
      helpers.logWeaponTuneFireDebug?.('spawn', { source: nextCtx.debugSource, projectileKind: 'standard', shots: 1, stageIndex, slotIndex });
      if (nearest) {
        helpers.spawnProjectile?.(spawnOrigin, nearest, 2 * damageScale, continuation, beatIndex + 1, nextCtx);
      } else {
        helpers.spawnProjectileFromDirection?.(spawnOrigin, baseDir.x, baseDir.y, 2 * damageScale, continuation, beatIndex + 1, nextCtx);
      }
    });
  }
  if (archetype === 'helper') {
    return withPerfSample('pickupsCombat.weaponRuntime.stepChange.processEvents.execute.player.fire.tunedStage.helper', () => {
      const anchorEnemyId = (
        variant !== 'turret' && Number.isFinite(context?.impactEnemyId)
      ) ? Math.trunc(context.impactEnemyId) : null;
      const defaultAnchorType = (variant === 'orbital-drone') ? 'player' : 'world';
      const turretSpawnPoint = (variant === 'turret')
        ? (helpers.getOffsetPoint?.(
          originWorld,
          nearest ? { x: nearest.wx, y: nearest.wy } : null,
          Number(constants.helperTurretSpawnOffsetWorld) || 0,
          helpers.getShipFacingDirWorld?.() || null
        ) || originWorld)
        : originWorld;
      helpers.spawnHelper?.(variant, turretSpawnPoint, beatIndex, continuation, {
        weaponSlotIndex: slotIndex,
        stageIndex,
        helperAnchorType: context?.helperAnchorType || defaultAnchorType,
        damageScale,
        forcedNoteName: helpers.normalizeSwarmNoteName?.(context?.forcedNoteName) || null,
      }, anchorEnemyId);
    });
  }
  if (archetype === 'laser') {
    if (variant === 'beam') {
      return withPerfSample('pickupsCombat.weaponRuntime.stepChange.processEvents.execute.player.fire.tunedStage.laserBeam', () => {
        const noteName = forcedNoteName || helpers.getSwarmEnemySoundNoteById?.(nearest?.id);
        const weaponSoundKey = helpers.getPlayerWeaponSoundEventKeyForStage?.(archetype, variant) || 'beam';
        const slotKey = Number.isFinite(slotIndex) ? Math.trunc(slotIndex) : -1;
        const beamSustainStateBySlot = state.beamSustainStateBySlot instanceof Map ? state.beamSustainStateBySlot : null;
        const sustain = beamSustainStateBySlot?.get(slotKey) || null;
        const sameNote = sustain && String(sustain.note || '') === String(noteName || '');
        const contiguous = sustain && Math.max(0, Math.trunc(Number(beatIndex) || 0)) === (Math.max(0, Math.trunc(Number(sustain.beat) || 0)) + 1);
        const sustaining = !!(sameNote && contiguous);
        const beamVol = gameplayWeaponSoundVolume * (sustaining ? 0.36 : 0.82);
        if (helpers.shouldPlayBeamSoundForBeat?.(slotIndex, beatIndex)) {
          if (directSound) {
            helpers.playSwarmSoundEventImmediate?.(weaponSoundKey, beamVol, noteName);
          } else {
            helpers.noteSwarmSoundEvent?.(weaponSoundKey, beamVol, beatIndex, noteName, {
              authoringClass: 'gameplayauthored',
              sourceSystem: 'player',
              actionType: `${archetype}-${variant}`,
            });
          }
        }
        beamSustainStateBySlot?.set(slotKey, {
          beat: Math.max(0, Math.trunc(Number(beatIndex) || 0)),
          note: String(noteName || ''),
        });
        if (!nearest) {
          const dir = helpers.getShipFacingDirWorld?.() || { x: 1, y: 0 };
          withPerfSample('pickupsCombat.weaponRuntime.stepChange.processEvents.execute.player.fire.tunedStage.laserEffect', () => {
            helpers.addLaserEffect?.(originWorld, {
              x: originWorld.x + (dir.x * 1400),
              y: originWorld.y + (dir.y * 1400),
            }, slotIndex, sourceEnemyId, null);
          });
          if (continuation.length) {
            withPerfSample('pickupsCombat.weaponRuntime.stepChange.processEvents.execute.player.fire.tunedStage.chainQueue', () => {
              helpers.queueWeaponChain?.(beatIndex + 1, continuation, {
                origin: originWorld,
                impactPoint: {
                  x: originWorld.x + (dir.x * 1400),
                  y: originWorld.y + (dir.y * 1400),
                },
                weaponSlotIndex: slotIndex,
                stageIndex: stageIndex + 1,
                damageScale,
                forcedNoteName: helpers.normalizeSwarmNoteName?.(context?.forcedNoteName) || null,
              });
            });
          }
          return;
        }
        withPerfSample('pickupsCombat.weaponRuntime.stepChange.processEvents.execute.player.fire.tunedStage.laserEffect', () => {
          helpers.addBeamEffect?.(originWorld, nearest, helpers.getGameplayBeatLen?.(), slotIndex, (Number(constants.beamDamagePerSecond) || 0) * damageScale);
        });
        const effects = Array.isArray(state.effects) ? state.effects : [];
        const beamFx = effects[effects.length - 1];
        if (beamFx && beamFx.kind === 'beam') beamFx.sourceEnemyId = sourceEnemyId;
        if (continuation.length) {
          const firstNext = continuation[0];
          const restNext = continuation.slice(1);
          if (firstNext?.archetype === 'laser' && firstNext?.variant === 'beam') {
            withPerfSample('pickupsCombat.weaponRuntime.stepChange.processEvents.execute.player.fire.tunedStage.chainTrigger', () => {
              helpers.triggerWeaponStage?.(firstNext, { x: nearest.wx, y: nearest.wy }, beatIndex, restNext, {
                origin: context?.origin || originWorld,
                impactPoint: { x: nearest.wx, y: nearest.wy },
                weaponSlotIndex: slotIndex,
                stageIndex: stageIndex + 1,
                impactEnemyId: Number.isFinite(nearest.id) ? Math.trunc(nearest.id) : null,
                sourceEnemyId: Number.isFinite(nearest.id) ? Math.trunc(nearest.id) : null,
                damageScale,
                forcedNoteName: helpers.normalizeSwarmNoteName?.(context?.forcedNoteName) || null,
              });
            });
          } else {
            withPerfSample('pickupsCombat.weaponRuntime.stepChange.processEvents.execute.player.fire.tunedStage.chainQueue', () => {
              helpers.queueWeaponChain?.(beatIndex + 1, continuation, {
                origin: originWorld,
                impactPoint: { x: nearest.wx, y: nearest.wy },
                weaponSlotIndex: slotIndex,
                stageIndex: stageIndex + 1,
                impactEnemyId: Number.isFinite(nearest.id) ? Math.trunc(nearest.id) : null,
                sourceEnemyId: Number.isFinite(nearest.id) ? Math.trunc(nearest.id) : null,
                damageScale,
                forcedNoteName: helpers.normalizeSwarmNoteName?.(context?.forcedNoteName) || null,
              });
            });
          }
        }
      });
    }
    return withPerfSample('pickupsCombat.weaponRuntime.stepChange.processEvents.execute.player.fire.tunedStage.laserHitscan', () => {
      {
        const noteName = forcedNoteName || helpers.getSwarmEnemySoundNoteById?.(nearest?.id);
        const weaponSoundKey = helpers.getPlayerWeaponSoundEventKeyForStage?.(archetype, variant) || 'hitscan';
        if (directSound) {
          helpers.playSwarmSoundEventImmediate?.(weaponSoundKey, gameplayWeaponSoundVolume, noteName);
        } else {
          helpers.noteSwarmSoundEvent?.(weaponSoundKey, gameplayWeaponSoundVolume, beatIndex, noteName, {
            authoringClass: 'gameplayauthored',
            sourceSystem: 'player',
            actionType: `${archetype}-${variant}`,
          });
        }
      }
      if (!nearest) {
        const dir = helpers.getShipFacingDirWorld?.() || { x: 1, y: 0 };
        const to = {
          x: originWorld.x + (dir.x * 1400),
          y: originWorld.y + (dir.y * 1400),
        };
        withPerfSample('pickupsCombat.weaponRuntime.stepChange.processEvents.execute.player.fire.tunedStage.laserEffect', () => {
          helpers.addLaserEffect?.(originWorld, to, slotIndex, sourceEnemyId, null);
        });
        if (continuation.length) {
          withPerfSample('pickupsCombat.weaponRuntime.stepChange.processEvents.execute.player.fire.tunedStage.chainQueue', () => {
            helpers.queueWeaponChain?.(beatIndex + 1, continuation, {
              origin: originWorld,
              impactPoint: to,
              weaponSlotIndex: slotIndex,
              stageIndex: stageIndex + 1,
              damageScale,
              forcedNoteName: helpers.normalizeSwarmNoteName?.(context?.forcedNoteName) || null,
            });
          });
        }
        return;
      }
      withPerfSample('pickupsCombat.weaponRuntime.stepChange.processEvents.execute.player.fire.tunedStage.laserEffect', () => {
        helpers.addLaserEffect?.(
          originWorld,
          { x: nearest.wx, y: nearest.wy },
          slotIndex,
          sourceEnemyId,
          Number.isFinite(nearest.id) ? Math.trunc(nearest.id) : null
        );
      });
      withPerfSample('pickupsCombat.weaponRuntime.stepChange.processEvents.execute.player.fire.tunedStage.directDamage', () => {
        helpers.withDamageSoundStage?.(stageIndex, () => helpers.damageEnemy?.(nearest, 2 * damageScale));
      });
      if (continuation.length) {
        const firstNext = continuation[0];
        const restNext = continuation.slice(1);
        if (firstNext?.archetype === 'laser' && firstNext?.variant === 'hitscan') {
          withPerfSample('pickupsCombat.weaponRuntime.stepChange.processEvents.execute.player.fire.tunedStage.chainTrigger', () => {
            helpers.triggerWeaponStage?.(firstNext, { x: nearest.wx, y: nearest.wy }, beatIndex, restNext, {
              origin: context?.origin || originWorld,
              impactPoint: { x: nearest.wx, y: nearest.wy },
              weaponSlotIndex: slotIndex,
              stageIndex: stageIndex + 1,
              impactEnemyId: Number.isFinite(nearest.id) ? Math.trunc(nearest.id) : null,
              sourceEnemyId: Number.isFinite(nearest.id) ? Math.trunc(nearest.id) : null,
              damageScale,
              forcedNoteName: helpers.normalizeSwarmNoteName?.(context?.forcedNoteName) || null,
            });
          });
        } else {
          withPerfSample('pickupsCombat.weaponRuntime.stepChange.processEvents.execute.player.fire.tunedStage.chainQueue', () => {
            helpers.queueWeaponChain?.(beatIndex + 1, continuation, {
              origin: originWorld,
              impactPoint: { x: nearest.wx, y: nearest.wy },
              weaponSlotIndex: slotIndex,
              stageIndex: stageIndex + 1,
              impactEnemyId: Number.isFinite(nearest.id) ? Math.trunc(nearest.id) : null,
              sourceEnemyId: Number.isFinite(nearest.id) ? Math.trunc(nearest.id) : null,
              damageScale,
              forcedNoteName: helpers.normalizeSwarmNoteName?.(context?.forcedNoteName) || null,
            });
          });
        }
      }
    });
  }
  if (archetype === 'aoe') {
    return withPerfSample('pickupsCombat.weaponRuntime.stepChange.processEvents.execute.player.fire.tunedStage.aoe', () => {
      const chainEventId = Number.isFinite(context?.chainEventId) ? Math.trunc(context.chainEventId) : null;
      const aoeHit = withPerfSample('pickupsCombat.weaponRuntime.stepChange.processEvents.execute.player.fire.tunedStage.aoeApply', () => (
        helpers.applyAoeAt?.(originWorld, variant, beatIndex, slotIndex, sourceEnemyId, stageIndex, damageScale, chainEventId)
      ));
      if (variant === 'explosion') {
        const explosionSoundKey = helpers.getPlayerWeaponSoundEventKeyForStage?.(archetype, variant) || 'explosion';
        const defaultExplosionNote = helpers.normalizeSwarmNoteName?.(constants.swarmSoundEvents?.[explosionSoundKey]?.note) || 'C4';
        if (directSound) {
          helpers.playSwarmSoundEventImmediate?.(explosionSoundKey, gameplayWeaponSoundVolume, defaultExplosionNote);
        } else {
          helpers.noteSwarmSoundEvent?.(explosionSoundKey, gameplayWeaponSoundVolume, beatIndex, defaultExplosionNote, {
            authoringClass: 'gameplayauthored',
            sourceSystem: 'player',
            actionType: `${archetype}-${variant}`,
          });
        }
      }
      if (continuation.length) {
        if (variant === 'explosion' && aoeHit?.firstHitPoint) {
          const firstNext = continuation[0];
          const restNext = continuation.slice(1);
          const nextOrigin = aoeHit.firstHitPoint;
          withPerfSample('pickupsCombat.weaponRuntime.stepChange.processEvents.execute.player.fire.tunedStage.chainTrigger', () => {
            helpers.triggerWeaponStage?.(firstNext, nextOrigin, beatIndex, restNext, {
              origin: context?.origin || originWorld,
              impactPoint: nextOrigin,
              weaponSlotIndex: slotIndex,
              stageIndex: stageIndex + 1,
              impactEnemyId: Number.isFinite(aoeHit.firstHitEnemyId) ? Math.trunc(aoeHit.firstHitEnemyId) : null,
              sourceEnemyId: Number.isFinite(aoeHit.firstHitEnemyId) ? Math.trunc(aoeHit.firstHitEnemyId) : null,
              damageScale,
              forcedNoteName: helpers.normalizeSwarmNoteName?.(context?.forcedNoteName) || null,
            });
          });
        } else if (variant !== 'explosion') {
          withPerfSample('pickupsCombat.weaponRuntime.stepChange.processEvents.execute.player.fire.tunedStage.chainQueue', () => {
            helpers.queueWeaponChain?.(beatIndex + 1, continuation, {
              origin: context?.origin || originWorld,
              impactPoint: originWorld,
              weaponSlotIndex: slotIndex,
              stageIndex: stageIndex + 1,
              damageScale,
              forcedNoteName: helpers.normalizeSwarmNoteName?.(context?.forcedNoteName) || null,
            });
          });
        }
      }
    });
  }
}

export function fireConfiguredWeaponsOnBeatRuntime(options = null) {
  const centerWorld = options?.centerWorld || null;
  const beatIndex = Number(options?.beatIndex) || 0;
  const contextBeatIndex = Number.isFinite(options?.contextBeatIndex) ? Number(options.contextBeatIndex) : beatIndex;
  const state = options?.state && typeof options.state === 'object' ? options.state : {};
  const constants = options?.constants && typeof options.constants === 'object' ? options.constants : {};
  const helpers = options?.helpers && typeof options.helpers === 'object' ? options.helpers : {};
  const runtimeOptions = options?.options && typeof options.options === 'object' ? options.options : {};
  const getPerfNow = typeof helpers.getPerfNow === 'function'
    ? helpers.getPerfNow
    : (() => (globalThis.performance?.now?.() ?? Date.now()));
  const recordPerfSample = typeof helpers.recordStepEventsPerfSample === 'function'
    ? helpers.recordStepEventsPerfSample
    : null;
  const withPerfSample = (name, fn) => {
    if (typeof fn !== 'function') return undefined;
    if (typeof recordPerfSample !== 'function') return fn();
    const startedAt = getPerfNow();
    try {
      return fn();
    } finally {
      recordPerfSample(name, Math.max(0, getPerfNow() - startedAt));
    }
  };

  const weaponLoadout = Array.isArray(state.weaponLoadout) ? state.weaponLoadout : [];
  const equippedWeapons = state.equippedWeapons instanceof Set ? state.equippedWeapons : new Set();
  const beamSustainStateBySlot = state.beamSustainStateBySlot instanceof Map ? state.beamSustainStateBySlot : null;
  const weaponDefs = state.weaponDefs && typeof state.weaponDefs === 'object' ? state.weaponDefs : {};
  const weaponSubBoardState = state.weaponSubBoardState && typeof state.weaponSubBoardState === 'object' ? state.weaponSubBoardState : {};
  const activeWeaponSlotIndex = Number(state.activeWeaponSlotIndex) || 0;

  if (!centerWorld) return { attempted: false, playerAudible: false };
  const slotIndex = Math.max(0, Math.min(weaponLoadout.length - 1, Math.trunc(activeWeaponSlotIndex)));
  if (weaponSubBoardState.open && Math.trunc(Number(weaponSubBoardState.slotIndex) || -1) === slotIndex) {
    return { attempted: false, playerAudible: false };
  }
  const weapon = weaponLoadout[slotIndex];
  const stages = helpers.sanitizeWeaponStages?.(weapon?.stages) || [];
  if (stages.length) {
    let tuneStats = null;
    let damageScale = 1;
    let tuneNotes = [];
    let noteName = null;
    withPerfSample('pickupsCombat.weaponRuntime.stepChange.processEvents.execute.player.fire.tune', () => {
      tuneStats = helpers.getWeaponTuneActivityStats?.(slotIndex) || null;
      damageScale = Number(helpers.getWeaponTuneDamageScale?.(slotIndex)) || 1;
      tuneNotes = helpers.getWeaponTuneStepNotes?.(slotIndex, beatIndex) || [];
      noteName = tuneNotes.length ? tuneNotes[0] : null;
    });
    helpers.logWeaponTuneFireDebug?.('step', {
      slotIndex,
      stepIndex: Math.trunc(Number(beatIndex) || 0),
      beatIndex: Math.trunc(Number(contextBeatIndex) || 0),
      noteCount: tuneNotes.length,
      notes: tuneNotes.slice(),
      chosenNote: noteName,
      damageScale,
      activeNotes: Math.max(0, Math.trunc(Number(tuneStats?.activeNotes) || 0)),
      totalNotes: Math.max(1, Math.trunc(Number(tuneStats?.totalNotes) || Number(constants.weaponTuneSteps) || 16)),
      firstStage: `${String(stages[0]?.archetype || '')}:${String(stages[0]?.variant || '')}`,
    });
    if (!noteName) {
      withPerfSample('pickupsCombat.weaponRuntime.stepChange.processEvents.execute.player.fire.clearIdle', () => {
        helpers.clearBeamEffectsForWeaponSlot?.(slotIndex);
        helpers.clearPendingWeaponChainsForSlot?.(slotIndex);
        beamSustainStateBySlot?.delete(slotIndex);
      });
      return { attempted: true, playerAudible: false };
    }
    const first = stages[0];
    const rest = stages.slice(1);
    withPerfSample('pickupsCombat.weaponRuntime.stepChange.processEvents.execute.player.fire.tunedStage', () => {
      helpers.pulsePlayerShipNoteFlash?.();
      helpers.triggerWeaponStage?.(first, centerWorld, contextBeatIndex, rest, {
        origin: centerWorld,
        impactPoint: centerWorld,
        weaponSlotIndex: slotIndex,
        stageIndex: 0,
        damageScale,
        forcedNoteName: noteName,
        directSound: true,
        playerSoundVolumeMult: Math.max(0.1, Math.min(1, Number(runtimeOptions?.playerSoundVolumeMult) || 1)),
        debugSource: 'tune-primary',
        debugStepIndex: Math.trunc(Number(beatIndex) || 0),
        debugBeatIndex: Math.trunc(Number(contextBeatIndex) || 0),
        debugNoteIndex: 0,
      });
    });
    return { attempted: true, playerAudible: true };
  }
  withPerfSample('pickupsCombat.weaponRuntime.stepChange.processEvents.execute.player.fire.clearUntuned', () => {
    helpers.clearBeamEffectsForWeaponSlot?.(slotIndex);
    helpers.clearPendingWeaponChainsForSlot?.(slotIndex);
    beamSustainStateBySlot?.delete(slotIndex);
  });
  const anyConfigured = weaponLoadout.some((w) => Array.isArray(w?.stages) && w.stages.length > 0);
  if (anyConfigured) return { attempted: true, playerAudible: false };
  let playerAudible = false;
  withPerfSample('pickupsCombat.weaponRuntime.stepChange.processEvents.execute.player.fire.legacyExplosion', () => {
    if (equippedWeapons.has('explosion')) {
      helpers.applyAoeAt?.(centerWorld, 'explosion', contextBeatIndex);
      playerAudible = true;
    }
  });
  let target = null;
  withPerfSample('pickupsCombat.weaponRuntime.stepChange.processEvents.execute.player.fire.legacyTarget', () => {
    target = helpers.getNearestEnemy?.(centerWorld.x, centerWorld.y) || null;
  });
  if (!target) return { attempted: true, playerAudible };
  withPerfSample('pickupsCombat.weaponRuntime.stepChange.processEvents.execute.player.fire.legacyLaser', () => {
    if (equippedWeapons.has('laser')) {
      helpers.addLaserEffect?.(
        centerWorld,
        { x: target.wx, y: target.wy },
        null,
        null,
        Number.isFinite(target.id) ? Math.trunc(target.id) : null
      );
      helpers.damageEnemy?.(target, Number(weaponDefs?.laser?.damage) || 0);
      playerAudible = true;
    }
  });
  withPerfSample('pickupsCombat.weaponRuntime.stepChange.processEvents.execute.player.fire.legacyProjectile', () => {
    if (equippedWeapons.has('projectile')) {
      helpers.spawnProjectile?.(centerWorld, target, Number(weaponDefs?.projectile?.damage) || 0, null, null);
      playerAudible = true;
    }
  });
  return { attempted: true, playerAudible };
}
