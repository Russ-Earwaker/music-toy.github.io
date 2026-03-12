export function processPausePreviewPendingChainsRuntime(options = null) {
  const state = options?.state && typeof options.state === 'object' ? options.state : {};
  const helpers = options?.helpers && typeof options.helpers === 'object' ? options.helpers : {};
  const beatIndex = Math.max(0, Math.trunc(Number(options?.beatIndex) || 0));

  const pausePreview = state.pausePreview && typeof state.pausePreview === 'object' ? state.pausePreview : null;
  if (!pausePreview || !Array.isArray(pausePreview.pendingEvents)) return;

  for (let i = pausePreview.pendingEvents.length - 1; i >= 0; i--) {
    const ev = pausePreview.pendingEvents[i];
    if ((Number(ev?.beatIndex) || 0) > beatIndex) continue;
    pausePreview.pendingEvents.splice(i, 1);
    const stages = helpers.sanitizeWeaponStages?.(ev?.stages) || [];
    if (!stages.length) continue;
    const stage = stages[0];
    const rem = stages.slice(1);
    const origin = ev?.context?.impactPoint || ev?.context?.origin || { x: pausePreview.ship?.x || 0, y: pausePreview.ship?.y || 0 };
    helpers.triggerPausePreviewWeaponStage?.(stage, origin, beatIndex, rem, ev?.context || null);
  }
}

export function applyPausePreviewLingeringAoeBeatRuntime(options = null) {
  const state = options?.state && typeof options.state === 'object' ? options.state : {};
  const constants = options?.constants && typeof options.constants === 'object' ? options.constants : {};
  const helpers = options?.helpers && typeof options.helpers === 'object' ? options.helpers : {};
  const beatIndex = Math.max(0, Math.trunc(Number(options?.beatIndex) || 0));

  const pausePreview = state.pausePreview && typeof state.pausePreview === 'object' ? state.pausePreview : null;
  if (!pausePreview || !Array.isArray(pausePreview.aoeZones) || !Array.isArray(pausePreview.enemies)) return;

  const previewExplosionRadius = Math.max(8, Number(constants.previewExplosionRadius) || 52);
  for (let i = pausePreview.aoeZones.length - 1; i >= 0; i--) {
    const z = pausePreview.aoeZones[i];
    if ((Number(z.untilBeat) || 0) < beatIndex) {
      pausePreview.aoeZones.splice(i, 1);
      continue;
    }
    const r2 = (Number(z.radius) || previewExplosionRadius) ** 2;
    const dmg = Math.max(0, Number(z.damagePerBeat) || 0);
    for (let j = pausePreview.enemies.length - 1; j >= 0; j--) {
      const e = pausePreview.enemies[j];
      const dx = e.x - z.x;
      const dy = e.y - z.y;
      if ((dx * dx + dy * dy) <= r2) helpers.damagePausePreviewEnemy?.(e, dmg);
    }
  }
}

export function firePausePreviewWeaponsOnBeatRuntime(options = null) {
  const state = options?.state && typeof options.state === 'object' ? options.state : {};
  const helpers = options?.helpers && typeof options.helpers === 'object' ? options.helpers : {};
  const beatIndex = Math.max(0, Math.trunc(Number(options?.beatIndex) || 0));
  const previewSelectedWeaponSlotIndex = Number.isInteger(options?.previewSelectedWeaponSlotIndex)
    ? options.previewSelectedWeaponSlotIndex
    : null;

  const pausePreview = state.pausePreview && typeof state.pausePreview === 'object' ? state.pausePreview : null;
  const weaponLoadout = Array.isArray(state.weaponLoadout) ? state.weaponLoadout : [];
  if (!pausePreview || !weaponLoadout.length) return;

  const origin = { x: pausePreview.ship?.x || 0, y: pausePreview.ship?.y || 0 };
  const indices = Number.isInteger(previewSelectedWeaponSlotIndex)
    ? [previewSelectedWeaponSlotIndex]
    : weaponLoadout.map((_, i) => i);
  for (const slotIndex of indices) {
    const weapon = weaponLoadout[slotIndex];
    const stages = helpers.sanitizeWeaponStages?.(weapon?.stages) || [];
    if (!stages.length) continue;
    const first = stages[0];
    const rest = stages.slice(1);
    helpers.triggerPausePreviewWeaponStage?.(first, origin, beatIndex, rest, {
      origin,
      impactPoint: origin,
      weaponSlotIndex: slotIndex,
      stageIndex: 0,
    });
  }
}

export function updatePausePreviewProjectilesAndEffectsRuntime(options = null) {
  const state = options?.state && typeof options.state === 'object' ? options.state : {};
  const constants = options?.constants && typeof options.constants === 'object' ? options.constants : {};
  const helpers = options?.helpers && typeof options.helpers === 'object' ? options.helpers : {};
  const dt = Math.max(0, Number(options?.dt) || 0);

  const pausePreview = state.pausePreview && typeof state.pausePreview === 'object' ? state.pausePreview : null;
  if (!pausePreview || !Array.isArray(pausePreview.projectiles) || !Array.isArray(pausePreview.effects)) return;

  const previewProjectileHitRadius = Math.max(1, Number(constants.previewProjectileHitRadius) || 14);
  const previewProjectileBoomerangRadius = Math.max(1, Number(constants.previewProjectileBoomerangRadius) || 63);
  const previewProjectileHomingAcquireRange = Math.max(1, Number(constants.previewProjectileHomingAcquireRange) || 160);
  const previewProjectileHomingTurnRate = Math.max(0.01, Number(constants.previewProjectileHomingTurnRate) || 5.2);
  const previewProjectileHomingSpeed = Math.max(1, Number(constants.previewProjectileHomingSpeed) || 280);
  const previewProjectileHomingReturnSnapDist = Math.max(1, Number(constants.previewProjectileHomingReturnSnapDist) || 10);
  const previewProjectileHomingOrbitTurnRate = Math.max(0.01, Number(constants.previewProjectileHomingOrbitTurnRate) || 4.2);
  const previewProjectileHomingOrbitChaseSpeed = Math.max(1, Number(constants.previewProjectileHomingOrbitChaseSpeed) || 150);
  const previewProjectileHomingOrbitRadius = Math.max(8, Number(constants.previewProjectileHomingOrbitRadius) || 38);
  const previewProjectileHomingOrbitAngVel = Number(constants.previewProjectileHomingOrbitAngVel) || 2.8;
  const previewLaserTtl = Math.max(0.01, Number(constants.previewLaserTtl) || 0.16);
  const previewExplosionRadius = Math.max(8, Number(constants.previewExplosionRadius) || 52);
  const previewExplosionTtl = Math.max(0.01, Number(constants.previewExplosionTtl) || 0.24);
  const projectileBoomerangSpinMult = Math.max(0.1, Number(constants.projectileBoomerangSpinMult) || 2.4);

  const hitR2 = previewProjectileHitRadius * previewProjectileHitRadius;
  for (let i = pausePreview.projectiles.length - 1; i >= 0; i--) {
    const p = pausePreview.projectiles[i];
    p.ttl -= dt;
    const isBoomerang = String(p.kind || 'standard') === 'boomerang';
    const isHoming = String(p.kind || 'standard') === 'homing-missile';
    if (isBoomerang) {
      p.boomTheta = (Number(p.boomTheta) || 0) + ((Number(p.boomOmega) || 0) * dt);
      const c = Math.cos(p.boomTheta || 0);
      const s = Math.sin(p.boomTheta || 0);
      const r = Math.max(1, Number(p.boomRadius) || previewProjectileBoomerangRadius);
      const dirX = Number(p.boomDirX) || 0;
      const dirY = Number(p.boomDirY) || 0;
      const perpX = Number(p.boomPerpX) || 0;
      const perpY = Number(p.boomPerpY) || 0;
      p.x = (Number(p.boomCenterX) || 0) + (dirX * (1 + c) * r) + (perpX * s * r);
      p.y = (Number(p.boomCenterY) || 0) + (dirY * (1 + c) * r) + (perpY * s * r);
    } else if (isHoming) {
      let stateName = String(p.homingState || 'orbit');
      const orbitRadius = Math.max(8, Number(p.orbitRadius) || previewProjectileHomingOrbitRadius);
      const orbitAngVel = Number(p.orbitAngVel) || previewProjectileHomingOrbitAngVel;
      const nearestNow = helpers.getPausePreviewNearestEnemies?.(p.x, p.y, 1, p.ignoreEnemy || null)?.[0] || null;
      if (stateName === 'orbit' && nearestNow) {
        const dx = nearestNow.x - p.x;
        const dy = nearestNow.y - p.y;
        if ((dx * dx + dy * dy) <= (previewProjectileHomingAcquireRange * previewProjectileHomingAcquireRange)) {
          stateName = 'seek';
          p.targetEnemy = nearestNow;
        }
      }
      if (stateName === 'seek') {
        let target = p.targetEnemy || null;
        if (!target || !pausePreview.enemies.includes(target)) target = helpers.getPausePreviewNearestEnemies?.(p.x, p.y, 1, p.ignoreEnemy || null)?.[0] || null;
        if (!target) {
          stateName = 'return';
          p.targetEnemy = null;
        } else {
          p.targetEnemy = target;
          const desired = helpers.normalizeDir?.(target.x - p.x, target.y - p.y, p.vx, p.vy) || { x: 0, y: 0 };
          const cur = helpers.normalizeDir?.(p.vx, p.vy, desired.x, desired.y) || desired;
          const steer = Math.max(0, Math.min(1, previewProjectileHomingTurnRate * dt));
          const nd = helpers.normalizeDir?.(
            (cur.x * (1 - steer)) + (desired.x * steer),
            (cur.y * (1 - steer)) + (desired.y * steer),
            desired.x,
            desired.y
          ) || desired;
          p.vx = nd.x * previewProjectileHomingSpeed;
          p.vy = nd.y * previewProjectileHomingSpeed;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
        }
      }
      if (stateName === 'return') {
        const desired = helpers.normalizeDir?.(pausePreview.ship.x - p.x, pausePreview.ship.y - p.y, p.vx, p.vy) || { x: 0, y: 0 };
        const cur = helpers.normalizeDir?.(p.vx, p.vy, desired.x, desired.y) || desired;
        const steer = Math.max(0, Math.min(1, (previewProjectileHomingTurnRate * 1.2) * dt));
        const nd = helpers.normalizeDir?.(
          (cur.x * (1 - steer)) + (desired.x * steer),
          (cur.y * (1 - steer)) + (desired.y * steer),
          desired.x,
          desired.y
        ) || desired;
        p.vx = nd.x * previewProjectileHomingSpeed;
        p.vy = nd.y * previewProjectileHomingSpeed;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        const dx = p.x - pausePreview.ship.x;
        const dy = p.y - pausePreview.ship.y;
        if ((dx * dx + dy * dy) <= (previewProjectileHomingReturnSnapDist * previewProjectileHomingReturnSnapDist)) {
          stateName = 'orbit';
          const d = helpers.normalizeDir?.(dx, dy, 1, 0) || { x: 1, y: 0 };
          p.orbitAngle = Math.atan2(d.y, d.x);
          p.vx = 0;
          p.vy = 0;
        }
      }
      if (stateName === 'orbit') {
        const phaseCatchup = Math.max(
          0.2,
          Math.min(
            1,
            (Math.max(0, (Number(p.orbitRadius) || orbitRadius)) / Math.max(1, Math.hypot((p.x - pausePreview.ship.x), (p.y - pausePreview.ship.y))))
          )
        );
        p.orbitAngle = (Number(p.orbitAngle) || 0) + (orbitAngVel * dt * phaseCatchup);
        const targetX = pausePreview.ship.x + (Math.cos(p.orbitAngle) * orbitRadius);
        const targetY = pausePreview.ship.y + (Math.sin(p.orbitAngle) * orbitRadius);
        const toTx = targetX - p.x;
        const toTy = targetY - p.y;
        const toDist = Math.hypot(toTx, toTy) || 0.0001;
        const desired = helpers.normalizeDir?.(targetX - p.x, targetY - p.y, 1, 0) || { x: 0, y: 0 };
        const cur = helpers.normalizeDir?.(p.vx, p.vy, desired.x, desired.y) || desired;
        const steer = Math.max(0, Math.min(1, previewProjectileHomingOrbitTurnRate * dt));
        const nd = helpers.normalizeDir?.(
          (cur.x * (1 - steer)) + (desired.x * steer),
          (cur.y * (1 - steer)) + (desired.y * steer),
          desired.x,
          desired.y
        ) || desired;
        const speedN = Math.max(0.2, Math.min(1, toDist / Math.max(1, orbitRadius)));
        const chaseSpeed = previewProjectileHomingOrbitChaseSpeed * speedN;
        p.vx = nd.x * chaseSpeed;
        p.vy = nd.y * chaseSpeed;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
      p.homingState = stateName;
    } else {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    let hit = false;
    for (let j = pausePreview.enemies.length - 1; j >= 0; j--) {
      const e = pausePreview.enemies[j];
      if (p.ignoreEnemy && e === p.ignoreEnemy) continue;
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      if ((dx * dx + dy * dy) <= hitR2) {
        if (isBoomerang) {
          if (!(p.hitEnemyIds instanceof Set)) p.hitEnemyIds = new Set();
          if (p.hitEnemyIds.has(e)) continue;
          p.hitEnemyIds.add(e);
        }
        const hitPoint = { x: e.x, y: e.y };
        helpers.damagePausePreviewEnemy?.(e, p.damage);
        if (Array.isArray(p.nextStages) && p.nextStages.length) {
          const stages = helpers.sanitizeWeaponStages?.(p.nextStages) || [];
          const first = stages[0];
          const rest = stages.slice(1);
          const nextBeat = Number.isFinite(p.nextBeatIndex) ? p.nextBeatIndex : (Math.max(0, pausePreview.beatIndex) + 1);
          const chainCtx = {
            origin: { x: p.x, y: p.y },
            impactPoint: hitPoint,
            weaponSlotIndex: Number.isFinite(p.chainWeaponSlotIndex) ? Math.trunc(p.chainWeaponSlotIndex) : null,
            stageIndex: Number.isFinite(p.chainStageIndex) ? Math.trunc(p.chainStageIndex) : null,
            impactEnemy: e,
            sourceEnemy: e,
          };
          if (first?.archetype === 'projectile') {
            helpers.triggerPausePreviewWeaponStage?.(first, hitPoint, pausePreview.beatIndex, rest, chainCtx);
          } else {
            helpers.queuePausePreviewChain?.(nextBeat, stages, chainCtx);
          }
        }
        if (!isBoomerang) {
          hit = true;
          break;
        }
      }
    }
    if (
      hit || p.ttl <= 0
      || p.x < -30 || p.y < -30
      || p.x > pausePreview.width + 30
      || p.y > pausePreview.height + 30
    ) {
      try { p.el?.remove?.(); } catch {}
      pausePreview.projectiles.splice(i, 1);
      continue;
    }
    if (isBoomerang) {
      const deg = ((Number(p.boomTheta) || 0) * (180 / Math.PI) * projectileBoomerangSpinMult) + 180;
      p.el.style.transform = `translate(${p.x.toFixed(2)}px, ${p.y.toFixed(2)}px) rotate(${deg.toFixed(2)}deg)`;
    } else {
      p.el.style.transform = `translate(${p.x.toFixed(2)}px, ${p.y.toFixed(2)}px)`;
    }
  }

  for (let i = pausePreview.effects.length - 1; i >= 0; i--) {
    const fx = pausePreview.effects[i];
    fx.ttl -= dt;
    if (fx.ttl <= 0) {
      try { fx.el?.remove?.(); } catch {}
      pausePreview.effects.splice(i, 1);
      continue;
    }
    if (fx.kind === 'laser' || fx.kind === 'beam') {
      if (fx.kind === 'beam') {
        if (fx.sourceEnemy && !pausePreview.enemies.includes(fx.sourceEnemy)) {
          try { fx.el?.remove?.(); } catch {}
          pausePreview.effects.splice(i, 1);
          continue;
        } else {
          fx.sourceGoneTtl = null;
        }
        if (fx.sourceEnemy && pausePreview.enemies.includes(fx.sourceEnemy)) {
          fx.from = { x: Number(fx.sourceEnemy.x) || 0, y: Number(fx.sourceEnemy.y) || 0 };
        }
        let target = fx.targetEnemy || null;
        if (!target || !pausePreview.enemies.includes(target)) {
          target = helpers.getPausePreviewNearestEnemies?.(fx.from?.x || 0, fx.from?.y || 0, 1, fx.sourceEnemy || null)?.[0] || null;
          fx.targetEnemy = target || null;
        }
        if (target) {
          fx.to = { x: target.x, y: target.y };
          helpers.damagePausePreviewEnemy?.(target, Math.max(0, Number(fx.damagePerSec) || 0) * dt);
        }
      } else if (fx.kind === 'laser') {
        if (fx.sourceEnemy && pausePreview.enemies.includes(fx.sourceEnemy)) {
          fx.from = { x: Number(fx.sourceEnemy.x) || 0, y: Number(fx.sourceEnemy.y) || 0 };
        }
        if (fx.targetEnemy && pausePreview.enemies.includes(fx.targetEnemy)) {
          fx.to = { x: Number(fx.targetEnemy.x) || 0, y: Number(fx.targetEnemy.y) || 0 };
        }
      }
      const dx = fx.to.x - fx.from.x;
      const dy = fx.to.y - fx.from.y;
      const len = Math.max(1, Math.hypot(dx, dy));
      const ang = Math.atan2(dy, dx) * (180 / Math.PI);
      fx.el.style.width = `${len.toFixed(2)}px`;
      fx.el.style.transform = `translate(${fx.from.x.toFixed(2)}px, ${fx.from.y.toFixed(2)}px) rotate(${ang.toFixed(2)}deg)`;
      if (fx.kind === 'beam') {
        fx.el.style.opacity = '1';
      } else {
        fx.el.style.opacity = `${Math.max(0, Math.min(1, fx.ttl / previewLaserTtl)).toFixed(3)}`;
      }
    } else if (fx.kind === 'explosion') {
      const radius = Math.max(8, Number(fx.radius) || previewExplosionRadius);
      const size = radius * 2;
      fx.el.style.width = `${size.toFixed(2)}px`;
      fx.el.style.height = `${size.toFixed(2)}px`;
      fx.el.style.marginLeft = `${(-radius).toFixed(2)}px`;
      fx.el.style.marginTop = `${(-radius).toFixed(2)}px`;
      fx.el.style.transform = `translate(${fx.at.x.toFixed(2)}px, ${fx.at.y.toFixed(2)}px)`;
      fx.el.style.opacity = `${Math.max(0, Math.min(1, fx.ttl / previewExplosionTtl)).toFixed(3)}`;
    }
  }
}
