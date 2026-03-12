export function queuePausePreviewChainRuntime(options = null) {
  const state = options?.state && typeof options.state === 'object' ? options.state : {};
  const helpers = options?.helpers && typeof options.helpers === 'object' ? options.helpers : {};
  const pausePreview = state.pausePreview && typeof state.pausePreview === 'object' ? state.pausePreview : null;
  if (!pausePreview || !Array.isArray(pausePreview.pendingEvents)) return;

  const stages = helpers.sanitizeWeaponStages?.(options?.nextStages) || [];
  if (!stages.length) return;
  const context = options?.context && typeof options.context === 'object' ? options.context : null;
  pausePreview.pendingEvents.push({
    beatIndex: Math.max(0, Math.trunc(Number(options?.beatIndex) || 0)),
    stages,
    context: {
      origin: context?.origin ? { x: Number(context.origin.x) || 0, y: Number(context.origin.y) || 0 } : null,
      impactPoint: context?.impactPoint ? { x: Number(context.impactPoint.x) || 0, y: Number(context.impactPoint.y) || 0 } : null,
      weaponSlotIndex: Number.isFinite(context?.weaponSlotIndex) ? Math.trunc(context.weaponSlotIndex) : null,
      stageIndex: Number.isFinite(context?.stageIndex) ? Math.trunc(context.stageIndex) : null,
      impactEnemy: context?.impactEnemy || null,
      sourceEnemy: context?.sourceEnemy || null,
    },
  });
}

export function countPausePreviewOrbitingHomingMissilesRuntime(options = null) {
  const state = options?.state && typeof options.state === 'object' ? options.state : {};
  const pausePreview = state.pausePreview && typeof state.pausePreview === 'object' ? state.pausePreview : null;
  if (!pausePreview || !Array.isArray(pausePreview.projectiles)) return 0;
  let n = 0;
  for (const p of pausePreview.projectiles) {
    if (String(p?.kind || '') !== 'homing-missile') continue;
    if (String(p?.homingState || '') !== 'orbit') continue;
    n += 1;
  }
  return n;
}

export function addPausePreviewLaserRuntime(options = null) {
  const state = options?.state && typeof options.state === 'object' ? options.state : {};
  const constants = options?.constants && typeof options.constants === 'object' ? options.constants : {};
  const pausePreview = state.pausePreview && typeof state.pausePreview === 'object' ? state.pausePreview : null;
  const pausePreviewSceneEl = state.pausePreviewSceneEl || null;
  if (!pausePreview || !Array.isArray(pausePreview.effects) || !pausePreviewSceneEl) return;
  const from = options?.from && typeof options.from === 'object' ? options.from : { x: 0, y: 0 };
  const to = options?.to && typeof options.to === 'object' ? options.to : { x: from.x, y: from.y };
  const el = document.createElement('div');
  el.className = 'beat-swarm-preview-fx-laser';
  pausePreviewSceneEl.appendChild(el);
  pausePreview.effects.push({
    kind: 'laser',
    ttl: Math.max(0.01, Number(constants.previewLaserTtl) || 0.16),
    from: { x: Number(from.x) || 0, y: Number(from.y) || 0 },
    to: { x: Number(to.x) || 0, y: Number(to.y) || 0 },
    sourceEnemy: options?.sourceEnemy || null,
    targetEnemy: options?.targetEnemy || null,
    el,
  });
}

export function addPausePreviewBeamRuntime(options = null) {
  const state = options?.state && typeof options.state === 'object' ? options.state : {};
  const constants = options?.constants && typeof options.constants === 'object' ? options.constants : {};
  const helpers = options?.helpers && typeof options.helpers === 'object' ? options.helpers : {};
  const pausePreview = state.pausePreview && typeof state.pausePreview === 'object' ? state.pausePreview : null;
  const pausePreviewSceneEl = state.pausePreviewSceneEl || null;
  const target = options?.target && typeof options.target === 'object' ? options.target : null;
  if (!pausePreview || !Array.isArray(pausePreview.effects) || !pausePreviewSceneEl || !target) return;
  const from = options?.from && typeof options.from === 'object' ? options.from : { x: 0, y: 0 };
  const el = document.createElement('div');
  el.className = 'beat-swarm-preview-fx-laser';
  pausePreviewSceneEl.appendChild(el);
  pausePreview.effects.push({
    kind: 'beam',
    ttl: Math.max(0.05, Number.isFinite(options?.ttl) ? Number(options.ttl) : Number(helpers.getPausePreviewBeatLen?.() || 0.5)),
    from: { x: Number(from.x) || 0, y: Number(from.y) || 0 },
    to: { x: Number(target.x) || 0, y: Number(target.y) || 0 },
    targetEnemy: target,
    sourceEnemy: null,
    sourceGoneTtl: null,
    damagePerSec: Math.max(0, Number(constants.previewBeamDamagePerSec) || 3.2),
    el,
  });
}

export function addPausePreviewExplosionRuntime(options = null) {
  const state = options?.state && typeof options.state === 'object' ? options.state : {};
  const constants = options?.constants && typeof options.constants === 'object' ? options.constants : {};
  const pausePreview = state.pausePreview && typeof state.pausePreview === 'object' ? state.pausePreview : null;
  const pausePreviewSceneEl = state.pausePreviewSceneEl || null;
  if (!pausePreview || !Array.isArray(pausePreview.effects) || !pausePreviewSceneEl) return;
  const at = options?.at && typeof options.at === 'object' ? options.at : { x: 0, y: 0 };
  const radiusFallback = Math.max(8, Number(constants.previewExplosionRadius) || 52);
  const ttlFallback = Math.max(0.01, Number(constants.previewExplosionTtl) || 0.24);
  const el = document.createElement('div');
  el.className = 'beat-swarm-preview-fx-explosion';
  pausePreviewSceneEl.appendChild(el);
  pausePreview.effects.push({
    kind: 'explosion',
    ttl: Math.max(0.01, Number(options?.ttl) || ttlFallback),
    at: { x: Number(at.x) || 0, y: Number(at.y) || 0 },
    radius: Math.max(8, Number(options?.radius) || radiusFallback),
    el,
  });
}

export function spawnPausePreviewProjectileFromDirectionRuntime(options = null) {
  const state = options?.state && typeof options.state === 'object' ? options.state : {};
  const constants = options?.constants && typeof options.constants === 'object' ? options.constants : {};
  const helpers = options?.helpers && typeof options.helpers === 'object' ? options.helpers : {};
  const pausePreview = state.pausePreview && typeof state.pausePreview === 'object' ? state.pausePreview : null;
  const pausePreviewSceneEl = state.pausePreviewSceneEl || null;
  if (!pausePreview || !Array.isArray(pausePreview.projectiles) || !pausePreviewSceneEl) return;
  const from = options?.from && typeof options.from === 'object' ? options.from : { x: 0, y: 0 };
  const dir = helpers.normalizeDir?.(options?.dirX, options?.dirY) || { x: 1, y: 0 };
  const chainContext = options?.chainContext && typeof options.chainContext === 'object' ? options.chainContext : null;
  const el = document.createElement('div');
  el.className = 'beat-swarm-preview-projectile';
  pausePreviewSceneEl.appendChild(el);
  pausePreview.projectiles.push({
    x: Number(from.x) || 0,
    y: Number(from.y) || 0,
    vx: (Number(dir.x) || 0) * Math.max(1, Number(constants.previewProjectileSpeed) || 360),
    vy: (Number(dir.y) || 0) * Math.max(1, Number(constants.previewProjectileSpeed) || 360),
    ttl: Math.max(0.01, Number(constants.previewProjectileLifetime) || 2.1),
    damage: Math.max(1, Number(options?.damage) || 1),
    kind: 'standard',
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
    targetEnemy: null,
    orbitAngle: 0,
    orbitAngVel: 0,
    orbitRadius: 0,
    hitEnemyIds: new Set(),
    chainWeaponSlotIndex: Number.isFinite(chainContext?.weaponSlotIndex) ? Math.trunc(chainContext.weaponSlotIndex) : null,
    chainStageIndex: Number.isFinite(chainContext?.stageIndex) ? Math.trunc(chainContext.stageIndex) : null,
    chainDamageScale: Math.max(0.05, Number(chainContext?.damageScale) || 1),
    nextStages: helpers.sanitizeWeaponStages?.(options?.nextStages) || [],
    nextBeatIndex: Number.isFinite(options?.nextBeatIndex) ? Math.max(0, Math.trunc(options.nextBeatIndex)) : null,
    ignoreEnemy: chainContext?.sourceEnemy || null,
    el,
  });
}

export function spawnPausePreviewProjectileRuntime(options = null) {
  const target = options?.target && typeof options.target === 'object' ? options.target : null;
  const from = options?.from && typeof options.from === 'object' ? options.from : null;
  if (!target || !from) return;
  const helpers = options?.helpers && typeof options.helpers === 'object' ? options.helpers : {};
  helpers.spawnPausePreviewProjectileFromDirection?.({
    ...options,
    dirX: (Number(target.x) || 0) - (Number(from.x) || 0),
    dirY: (Number(target.y) || 0) - (Number(from.y) || 0),
  });
}

export function spawnPausePreviewBoomerangProjectileRuntime(options = null) {
  const state = options?.state && typeof options.state === 'object' ? options.state : {};
  const constants = options?.constants && typeof options.constants === 'object' ? options.constants : {};
  const helpers = options?.helpers && typeof options.helpers === 'object' ? options.helpers : {};
  const pausePreview = state.pausePreview && typeof state.pausePreview === 'object' ? state.pausePreview : null;
  const pausePreviewSceneEl = state.pausePreviewSceneEl || null;
  if (!pausePreview || !Array.isArray(pausePreview.projectiles) || !pausePreviewSceneEl) return;
  const from = options?.from && typeof options.from === 'object' ? options.from : { x: 0, y: 0 };
  const chainContext = options?.chainContext && typeof options.chainContext === 'object' ? options.chainContext : null;
  const dir = helpers.normalizeDir?.(options?.dirX, options?.dirY) || { x: 1, y: 0 };
  const perp = { x: dir.y, y: -dir.x };
  const radius = Math.max(20, Number(constants.previewProjectileBoomerangRadius) || 63);
  const theta = Math.PI;
  const omega = (Math.PI * 2) / Math.max(0.35, Number(constants.previewProjectileBoomerangLoopSeconds) || 1.15);
  const el = document.createElement('div');
  el.className = 'beat-swarm-preview-projectile is-boomerang';
  pausePreviewSceneEl.appendChild(el);
  pausePreview.projectiles.push({
    x: Number(from.x) || 0,
    y: Number(from.y) || 0,
    vx: 0,
    vy: 0,
    ttl: Math.max(0.35, Number(constants.previewProjectileBoomerangLoopSeconds) || 1.15),
    damage: Math.max(1, Number(options?.damage) || 1),
    kind: 'boomerang',
    boomCenterX: Number(from.x) || 0,
    boomCenterY: Number(from.y) || 0,
    boomDirX: Number(dir.x) || 0,
    boomDirY: Number(dir.y) || 0,
    boomPerpX: Number(perp.x) || 0,
    boomPerpY: Number(perp.y) || 0,
    boomRadius: radius,
    boomTheta: theta,
    boomOmega: omega,
    homingState: '',
    targetEnemy: null,
    orbitAngle: 0,
    orbitAngVel: 0,
    orbitRadius: 0,
    hitEnemyIds: new Set(),
    chainWeaponSlotIndex: Number.isFinite(chainContext?.weaponSlotIndex) ? Math.trunc(chainContext.weaponSlotIndex) : null,
    chainStageIndex: Number.isFinite(chainContext?.stageIndex) ? Math.trunc(chainContext.stageIndex) : null,
    chainDamageScale: Math.max(0.05, Number(chainContext?.damageScale) || 1),
    nextStages: helpers.sanitizeWeaponStages?.(options?.nextStages) || [],
    nextBeatIndex: Number.isFinite(options?.nextBeatIndex) ? Math.max(0, Math.trunc(options.nextBeatIndex)) : null,
    ignoreEnemy: chainContext?.sourceEnemy || null,
    el,
  });
}

export function spawnPausePreviewHomingMissileRuntime(options = null) {
  const state = options?.state && typeof options.state === 'object' ? options.state : {};
  const constants = options?.constants && typeof options.constants === 'object' ? options.constants : {};
  const helpers = options?.helpers && typeof options.helpers === 'object' ? options.helpers : {};
  const pausePreview = state.pausePreview && typeof state.pausePreview === 'object' ? state.pausePreview : null;
  const pausePreviewSceneEl = state.pausePreviewSceneEl || null;
  if (!pausePreview || !Array.isArray(pausePreview.projectiles) || !pausePreviewSceneEl) return false;
  const from = options?.from && typeof options.from === 'object' ? options.from : { x: 0, y: 0 };
  const chainContext = options?.chainContext && typeof options.chainContext === 'object' ? options.chainContext : null;
  const maxOrbiting = Math.max(1, Math.trunc(Number(constants.previewProjectileHomingMaxOrbiting) || 8));
  const orbitingCount = helpers.countPausePreviewOrbitingHomingMissiles?.(options) || 0;
  if (orbitingCount >= maxOrbiting) return false;
  const angle = ((orbitingCount / Math.max(1, maxOrbiting)) * Math.PI * 2);
  const el = document.createElement('div');
  el.className = 'beat-swarm-preview-projectile';
  pausePreviewSceneEl.appendChild(el);
  pausePreview.projectiles.push({
    x: Number(from.x) || 0,
    y: Number(from.y) || 0,
    vx: 0,
    vy: 0,
    ttl: 60,
    damage: Math.max(1, Number(options?.damage) || 1),
    kind: 'homing-missile',
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
    targetEnemy: null,
    orbitAngle: angle,
    orbitAngVel: Number(constants.previewProjectileHomingOrbitAngVel) || 2.8,
    orbitRadius: Math.max(8, Number(constants.previewProjectileHomingOrbitRadius) || 38),
    hitEnemyIds: new Set(),
    chainWeaponSlotIndex: Number.isFinite(chainContext?.weaponSlotIndex) ? Math.trunc(chainContext.weaponSlotIndex) : null,
    chainStageIndex: Number.isFinite(chainContext?.stageIndex) ? Math.trunc(chainContext.stageIndex) : null,
    chainDamageScale: Math.max(0.05, Number(chainContext?.damageScale) || 1),
    nextStages: helpers.sanitizeWeaponStages?.(options?.nextStages) || [],
    nextBeatIndex: Number.isFinite(options?.nextBeatIndex) ? Math.max(0, Math.trunc(options.nextBeatIndex)) : null,
    ignoreEnemy: chainContext?.sourceEnemy || null,
    el,
  });
  return true;
}

export function applyPausePreviewAoeAtRuntime(options = null) {
  const state = options?.state && typeof options.state === 'object' ? options.state : {};
  const constants = options?.constants && typeof options.constants === 'object' ? options.constants : {};
  const helpers = options?.helpers && typeof options.helpers === 'object' ? options.helpers : {};
  const pausePreview = state.pausePreview && typeof state.pausePreview === 'object' ? state.pausePreview : null;
  if (!pausePreview || !Array.isArray(pausePreview.enemies) || !Array.isArray(pausePreview.aoeZones)) return null;

  const point = options?.point && typeof options.point === 'object' ? options.point : { x: 0, y: 0 };
  const variant = String(options?.variant || 'explosion');
  const beatIndex = Math.max(0, Math.trunc(Number(options?.beatIndex) || 0));
  const avoidEnemy = options?.avoidEnemy || null;
  const previewExplosionRadius = Math.max(8, Number(constants.previewExplosionRadius) || 52);
  const previewExplosionTtl = Math.max(0.01, Number(constants.previewExplosionTtl) || 0.24);
  const isDot = variant === 'dot-area';
  helpers.addPausePreviewExplosion?.({
    ...options,
    at: point,
    radius: previewExplosionRadius,
    ttl: isDot ? (Number(helpers.getPausePreviewBeatLen?.() || 0.5) * 2) : previewExplosionTtl,
  });
  const r2 = previewExplosionRadius * previewExplosionRadius;
  const hitCandidates = [];
  for (let i = 0; i < pausePreview.enemies.length; i++) {
    const e = pausePreview.enemies[i];
    const dx = e.x - point.x;
    const dy = e.y - point.y;
    const d2 = (dx * dx) + (dy * dy);
    if (d2 <= r2) {
      hitCandidates.push({
        enemy: e,
        point: { x: Number(e.x) || 0, y: Number(e.y) || 0 },
        d2,
      });
    }
  }
  hitCandidates.sort((a, b) => a.d2 - b.d2);
  for (let i = pausePreview.enemies.length - 1; i >= 0; i--) {
    const e = pausePreview.enemies[i];
    const dx = e.x - point.x;
    const dy = e.y - point.y;
    const d2 = (dx * dx) + (dy * dy);
    if (d2 <= r2) helpers.damagePausePreviewEnemy?.(e, isDot ? 0.5 : 1);
  }
  if (isDot) {
    pausePreview.aoeZones.push({
      x: point.x,
      y: point.y,
      radius: previewExplosionRadius,
      damagePerBeat: 0.6,
      untilBeat: Math.max(beatIndex + 2, beatIndex + 1),
    });
  }
  const selected = hitCandidates.find((c) => c.enemy !== avoidEnemy) || hitCandidates[0] || null;
  if (!selected?.enemy) return null;
  return {
    point: selected.point,
    enemy: selected.enemy,
  };
}

export function triggerPausePreviewWeaponStageRuntime(options = null) {
  const state = options?.state && typeof options.state === 'object' ? options.state : {};
  const constants = options?.constants && typeof options.constants === 'object' ? options.constants : {};
  const helpers = options?.helpers && typeof options.helpers === 'object' ? options.helpers : {};
  const pausePreview = state.pausePreview && typeof state.pausePreview === 'object' ? state.pausePreview : null;
  if (!pausePreview) return;

  const stage = options?.stage || null;
  const origin = options?.origin && typeof options.origin === 'object' ? options.origin : null;
  const beatIndex = Math.max(0, Math.trunc(Number(options?.beatIndex) || 0));
  const context = options?.context && typeof options.context === 'object' ? options.context : null;
  if (!stage || !origin) return;

  const archetype = stage.archetype;
  const variant = stage.variant;
  const continuation = helpers.sanitizeWeaponStages?.(options?.remainingStages) || [];
  const slotIndex = Number.isFinite(context?.weaponSlotIndex) ? Math.trunc(context.weaponSlotIndex) : -1;
  const stageIndex = Number.isFinite(context?.stageIndex) ? Math.trunc(context.stageIndex) : 0;
  const nextCtx = { weaponSlotIndex: slotIndex, stageIndex: stageIndex + 1 };
  const sourceEnemy = context?.sourceEnemy || null;
  const nearest = helpers.getPausePreviewNearestEnemies?.(origin.x, origin.y, 1, sourceEnemy)?.[0] || null;

  if (archetype === 'projectile') {
    const baseDir = nearest
      ? (helpers.normalizeDir?.(nearest.x - origin.x, nearest.y - origin.y) || { x: 1, y: 0 })
      : { x: 1, y: 0 };
    const spawnOrigin = context?.sourceEnemy
      ? {
        x: origin.x + (baseDir.x * (Number(constants.previewProjectileChainSpawnOffset) || 20)),
        y: origin.y + (baseDir.y * (Number(constants.previewProjectileChainSpawnOffset) || 20)),
      }
      : origin;
    if (variant === 'homing-missile') {
      helpers.spawnPausePreviewHomingMissile?.({
        ...options,
        from: spawnOrigin,
        damage: 2,
        nextStages: continuation,
        nextBeatIndex: beatIndex + 1,
        chainContext: nextCtx,
      });
      return;
    }
    if (variant === 'boomerang') {
      helpers.spawnPausePreviewBoomerangProjectile?.({
        ...options,
        from: spawnOrigin,
        dirX: baseDir.x,
        dirY: baseDir.y,
        damage: 2,
        nextStages: continuation,
        nextBeatIndex: beatIndex + 1,
        chainContext: nextCtx,
      });
      return;
    }
    if (variant === 'split-shot') {
      const splitAngle = Number(constants.previewProjectileSplitAngleRad) || (Math.PI / 7.2);
      const baseAngle = Math.atan2(baseDir.y, baseDir.x);
      const angles = [baseAngle, baseAngle - splitAngle, baseAngle + splitAngle];
      for (const ang of angles) {
        helpers.spawnPausePreviewProjectileFromDirection?.({
          ...options,
          from: spawnOrigin,
          dirX: Math.cos(ang),
          dirY: Math.sin(ang),
          damage: 2,
          nextStages: continuation,
          nextBeatIndex: beatIndex + 1,
          chainContext: nextCtx,
        });
      }
      return;
    }
    if (nearest) {
      helpers.spawnPausePreviewProjectile?.({
        ...options,
        from: spawnOrigin,
        target: nearest,
        damage: 2,
        nextStages: continuation,
        nextBeatIndex: beatIndex + 1,
        chainContext: nextCtx,
      });
    } else {
      helpers.spawnPausePreviewProjectileFromDirection?.({
        ...options,
        from: spawnOrigin,
        dirX: baseDir.x,
        dirY: baseDir.y,
        damage: 2,
        nextStages: continuation,
        nextBeatIndex: beatIndex + 1,
        chainContext: nextCtx,
      });
    }
    return;
  }
  if (archetype === 'helper') {
    const impactEnemy = (variant !== 'turret') ? (context?.impactEnemy || null) : null;
    const defaultAnchorType = (variant === 'orbital-drone') ? 'player' : 'world';
    const turretSpawnPoint = (variant === 'turret')
      ? { x: origin.x, y: origin.y - (Number(constants.previewHelperTurretSpawnOffset) || 18) }
      : origin;
    helpers.spawnPausePreviewHelper?.({
      ...options,
      kind: variant,
      anchorPoint: turretSpawnPoint,
      beatIndex,
      nextStages: continuation,
      context: {
        weaponSlotIndex: slotIndex,
        stageIndex,
        helperAnchorType: context?.helperAnchorType || defaultAnchorType,
      },
      anchorEnemy: impactEnemy,
    });
    return;
  }
  if (archetype === 'laser') {
    if (variant === 'beam') {
      if (!nearest) {
        const to = { x: origin.x + 300, y: origin.y };
        helpers.addPausePreviewLaser?.({ ...options, from: origin, to, sourceEnemy, targetEnemy: null });
        if (continuation.length) {
          helpers.queuePausePreviewChain?.({
            ...options,
            beatIndex: beatIndex + 1,
            nextStages: continuation,
            context: {
              origin,
              impactPoint: to,
              weaponSlotIndex: slotIndex,
              stageIndex: stageIndex + 1,
            },
          });
        }
        return;
      }
      helpers.addPausePreviewBeam?.({ ...options, from: origin, target: nearest, ttl: helpers.getPausePreviewBeatLen?.() });
      const beamFx = pausePreview.effects[pausePreview.effects.length - 1];
      if (beamFx && beamFx.kind === 'beam') beamFx.sourceEnemy = sourceEnemy;
      if (continuation.length) {
        const firstNext = continuation[0];
        const restNext = continuation.slice(1);
        if (firstNext?.archetype === 'laser' && firstNext?.variant === 'beam') {
          helpers.triggerPausePreviewWeaponStage?.({
            ...options,
            stage: firstNext,
            origin: { x: nearest.x, y: nearest.y },
            beatIndex,
            remainingStages: restNext,
            context: {
              origin: context?.origin || origin,
              impactPoint: { x: nearest.x, y: nearest.y },
              weaponSlotIndex: slotIndex,
              stageIndex: stageIndex + 1,
              impactEnemy: nearest,
              sourceEnemy: nearest,
            },
          });
        } else {
          helpers.queuePausePreviewChain?.({
            ...options,
            beatIndex: beatIndex + 1,
            nextStages: continuation,
            context: {
              origin,
              impactPoint: { x: nearest.x, y: nearest.y },
              weaponSlotIndex: slotIndex,
              stageIndex: stageIndex + 1,
              impactEnemy: nearest,
              sourceEnemy: nearest,
            },
          });
        }
      }
      return;
    }
    if (!nearest) {
      const to = { x: origin.x + 300, y: origin.y };
      helpers.addPausePreviewLaser?.({ ...options, from: origin, to, sourceEnemy, targetEnemy: null });
      if (continuation.length) {
        helpers.queuePausePreviewChain?.({
          ...options,
          beatIndex: beatIndex + 1,
          nextStages: continuation,
          context: {
            origin,
            impactPoint: to,
            weaponSlotIndex: slotIndex,
            stageIndex: stageIndex + 1,
          },
        });
      }
      return;
    }
    helpers.addPausePreviewLaser?.({ ...options, from: origin, to: { x: nearest.x, y: nearest.y }, sourceEnemy, targetEnemy: nearest });
    helpers.damagePausePreviewEnemy?.(nearest, 2);
    if (continuation.length) {
      const firstNext = continuation[0];
      const restNext = continuation.slice(1);
      if (firstNext?.archetype === 'laser' && firstNext?.variant === 'hitscan') {
        helpers.triggerPausePreviewWeaponStage?.({
          ...options,
          stage: firstNext,
          origin: { x: nearest.x, y: nearest.y },
          beatIndex,
          remainingStages: restNext,
          context: {
            origin: context?.origin || origin,
            impactPoint: { x: nearest.x, y: nearest.y },
            weaponSlotIndex: slotIndex,
            stageIndex: stageIndex + 1,
            impactEnemy: nearest,
            sourceEnemy: nearest,
          },
        });
      } else {
        helpers.queuePausePreviewChain?.({
          ...options,
          beatIndex: beatIndex + 1,
          nextStages: continuation,
          context: {
            origin,
            impactPoint: { x: nearest.x, y: nearest.y },
            weaponSlotIndex: slotIndex,
            stageIndex: stageIndex + 1,
            impactEnemy: nearest,
            sourceEnemy: nearest,
          },
        });
      }
    }
    return;
  }
  if (archetype === 'aoe') {
    const firstHit = helpers.applyPausePreviewAoeAt?.({
      ...options,
      point: origin,
      variant,
      beatIndex,
      avoidEnemy: context?.sourceEnemy || null,
    });
    if (continuation.length) {
      if (variant === 'explosion' && firstHit?.point) {
        const firstNext = continuation[0];
        const restNext = continuation.slice(1);
        const nextOrigin = firstHit.point;
        helpers.triggerPausePreviewWeaponStage?.({
          ...options,
          stage: firstNext,
          origin: nextOrigin,
          beatIndex,
          remainingStages: restNext,
          context: {
            origin: context?.origin || origin,
            impactPoint: nextOrigin,
            weaponSlotIndex: slotIndex,
            stageIndex: stageIndex + 1,
            impactEnemy: firstHit.enemy || null,
            sourceEnemy: firstHit.enemy || null,
          },
        });
      } else if (variant !== 'explosion') {
        helpers.queuePausePreviewChain?.({
          ...options,
          beatIndex: beatIndex + 1,
          nextStages: continuation,
          context: {
            origin: context?.origin || origin,
            impactPoint: origin,
            weaponSlotIndex: slotIndex,
            stageIndex: stageIndex + 1,
          },
        });
      }
    }
  }
}
