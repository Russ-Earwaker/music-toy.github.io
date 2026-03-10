export function updateBeatSwarmPickupsAndCombatRuntime(options = null) {
  const constants = options?.constants && typeof options.constants === 'object' ? options.constants : {};
  const helpers = options?.helpers && typeof options.helpers === 'object' ? options.helpers : {};
  const state = options?.state && typeof options.state === 'object' ? options.state : {};

  const pickups = Array.isArray(state.pickups) ? state.pickups : [];
  const projectiles = Array.isArray(state.projectiles) ? state.projectiles : [];
  const effects = Array.isArray(state.effects) ? state.effects : [];
  const enemies = Array.isArray(state.enemies) ? state.enemies : [];
  const equippedWeapons = state.equippedWeapons instanceof Set ? state.equippedWeapons : new Set();
  const currentBeatIndex = Math.max(0, Math.trunc(Number(state.currentBeatIndex) || 0));
  const dt = Math.max(0, Number(state.dt) || 0);

  const centerWorld = helpers.getViewportCenterWorld?.() || { x: 0, y: 0 };
  const z = helpers.getZoomState?.();
  const scale = Number.isFinite(z?.targetScale) ? z.targetScale : (Number.isFinite(z?.currentScale) ? z.currentScale : 1);
  const collectRadiusWorld = (Number(constants.pickupCollectRadiusPx) || 0) / Math.max(0.001, scale || 1);
  const projectileHitRadiusWorld = (Number(constants.projectileHitRadiusPx) || 0) / Math.max(0.001, scale || 1);
  const projectileOffscreenPad = Math.max(16, Number(constants.projectileDespawnOffscreenPadPx) || 72);
  const screenW = Math.max(1, Number(globalThis.window?.innerWidth) || 0);
  const screenH = Math.max(1, Number(globalThis.window?.innerHeight) || 0);
  const cr2 = collectRadiusWorld * collectRadiusWorld;

  helpers.updateHelpers?.(dt, centerWorld, scale);

  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    const dx = p.wx - centerWorld.x;
    const dy = p.wy - centerWorld.y;
    if ((dx * dx + dy * dy) <= cr2) {
      equippedWeapons.add(p.weaponId);
      helpers.ensureDefaultWeaponFromLegacy?.(p.weaponId);
      try { p.el?.remove?.(); } catch {}
      pickups.splice(i, 1);
      continue;
    }
    const s = helpers.worldToScreen?.({ x: p.wx, y: p.wy });
    if (!s || !Number.isFinite(s.x) || !Number.isFinite(s.y)) continue;
    p.el.style.transform = `translate(${s.x}px, ${s.y}px)`;
  }

  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.ttl -= dt;
    p.collisionGraceT = Math.max(0, Number(p.collisionGraceT) - dt);
    const isBoomerang = String(p.kind || 'standard') === 'boomerang';
    const isHoming = String(p.kind || 'standard') === 'homing-missile';
    const useTtlDespawn = isBoomerang || isHoming;
    if (isBoomerang) {
      p.boomTheta = (Number(p.boomTheta) || 0) + ((Number(p.boomOmega) || 0) * dt);
      const c = Math.cos(p.boomTheta || 0);
      const s = Math.sin(p.boomTheta || 0);
      const r = Math.max(1, Number(p.boomRadius) || Number(constants.projectileBoomerangRadiusWorld) || 0);
      const dirX = Number(p.boomDirX) || 0;
      const dirY = Number(p.boomDirY) || 0;
      const perpX = Number(p.boomPerpX) || 0;
      const perpY = Number(p.boomPerpY) || 0;
      p.wx = (Number(p.boomCenterX) || 0) + (dirX * (1 + c) * r) + (perpX * s * r);
      p.wy = (Number(p.boomCenterY) || 0) + (dirY * (1 + c) * r) + (perpY * s * r);
    } else if (isHoming) {
      let stateName = String(p.homingState || 'orbit');
      const orbitRadius = Math.max(20, Number(p.orbitRadius) || Number(constants.projectileHomingOrbitRadiusWorld) || 0);
      const orbitAngVel = Number(p.orbitAngVel) || Number(constants.projectileHomingOrbitAngVel) || 0;
      const nearestNow = helpers.getNearestEnemy?.(p.wx, p.wy, p.ignoreEnemyId);
      if (stateName === 'orbit' && nearestNow) {
        const dx = nearestNow.wx - p.wx;
        const dy = nearestNow.wy - p.wy;
        const acquireRange = Number(constants.projectileHomingAcquireRangeWorld) || 0;
        if ((dx * dx + dy * dy) <= (acquireRange * acquireRange)) {
          stateName = 'seek';
          p.targetEnemyId = Math.trunc(Number(nearestNow.id) || 0) || null;
        }
      }
      if (stateName === 'seek') {
        let target = null;
        if (Number.isFinite(p.targetEnemyId)) {
          target = enemies.find((e) => Math.trunc(Number(e.id) || 0) === Math.trunc(p.targetEnemyId)) || null;
        }
        if (!target) target = helpers.getNearestEnemy?.(p.wx, p.wy, p.ignoreEnemyId);
        if (!target) {
          stateName = 'return';
          p.targetEnemyId = null;
        } else {
          p.targetEnemyId = Math.trunc(Number(target.id) || 0) || null;
          const desired = helpers.normalizeDir?.(target.wx - p.wx, target.wy - p.wy, p.vx, p.vy) || { x: 0, y: 0 };
          const cur = helpers.normalizeDir?.(p.vx, p.vy, desired.x, desired.y) || desired;
          const steer = Math.max(0, Math.min(1, (Number(constants.projectileHomingTurnRate) || 0) * dt));
          const nd = helpers.normalizeDir?.(
            (cur.x * (1 - steer)) + (desired.x * steer),
            (cur.y * (1 - steer)) + (desired.y * steer),
            desired.x,
            desired.y
          ) || desired;
          p.vx = nd.x * (Number(constants.projectileHomingSpeed) || 0);
          p.vy = nd.y * (Number(constants.projectileHomingSpeed) || 0);
          p.wx += p.vx * dt;
          p.wy += p.vy * dt;
        }
      }
      if (stateName === 'return') {
        const desired = helpers.normalizeDir?.(centerWorld.x - p.wx, centerWorld.y - p.wy, p.vx, p.vy) || { x: 0, y: 0 };
        const cur = helpers.normalizeDir?.(p.vx, p.vy, desired.x, desired.y) || desired;
        const steer = Math.max(0, Math.min(1, ((Number(constants.projectileHomingTurnRate) || 0) * 1.2) * dt));
        const nd = helpers.normalizeDir?.(
          (cur.x * (1 - steer)) + (desired.x * steer),
          (cur.y * (1 - steer)) + (desired.y * steer),
          desired.x,
          desired.y
        ) || desired;
        p.vx = nd.x * (Number(constants.projectileHomingSpeed) || 0);
        p.vy = nd.y * (Number(constants.projectileHomingSpeed) || 0);
        p.wx += p.vx * dt;
        p.wy += p.vy * dt;
        const dx = p.wx - centerWorld.x;
        const dy = p.wy - centerWorld.y;
        const snapDist = Number(constants.projectileHomingReturnSnapDistWorld) || 0;
        if ((dx * dx + dy * dy) <= (snapDist * snapDist)) {
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
            (Math.max(0, (Number(p.orbitRadius) || orbitRadius)) / Math.max(1, Math.hypot((p.wx - centerWorld.x), (p.wy - centerWorld.y))))
          )
        );
        p.orbitAngle = (Number(p.orbitAngle) || 0) + (orbitAngVel * dt * phaseCatchup);
        const targetX = centerWorld.x + (Math.cos(p.orbitAngle) * orbitRadius);
        const targetY = centerWorld.y + (Math.sin(p.orbitAngle) * orbitRadius);
        const toTx = targetX - p.wx;
        const toTy = targetY - p.wy;
        const toDist = Math.hypot(toTx, toTy) || 0.0001;
        const desired = helpers.normalizeDir?.(targetX - p.wx, targetY - p.wy, 1, 0) || { x: 0, y: 0 };
        const cur = helpers.normalizeDir?.(p.vx, p.vy, desired.x, desired.y) || desired;
        const steer = Math.max(0, Math.min(1, (Number(constants.projectileHomingOrbitTurnRate) || 0) * dt));
        const nd = helpers.normalizeDir?.(
          (cur.x * (1 - steer)) + (desired.x * steer),
          (cur.y * (1 - steer)) + (desired.y * steer),
          desired.x,
          desired.y
        ) || desired;
        const speedN = Math.max(0.2, Math.min(1, toDist / Math.max(1, orbitRadius)));
        const chaseSpeed = (Number(constants.projectileHomingOrbitChaseSpeed) || 0) * speedN;
        p.vx = nd.x * chaseSpeed;
        p.vy = nd.y * chaseSpeed;
        p.wx += p.vx * dt;
        p.wy += p.vy * dt;
      }
      p.homingState = stateName;
    } else {
      p.wx += p.vx * dt;
      p.wy += p.vy * dt;
    }
    let hit = false;
    const allowCollision = !(Number(p.collisionGraceT) > 0);
    for (let j = enemies.length - 1; j >= 0; j--) {
      if (!allowCollision) break;
      const e = enemies[j];
      if (p?.hostileToEnemies === false) continue;
      const enemyId = Math.trunc(Number(e.id) || 0);
      if (Number.isFinite(p.ignoreEnemyId) && Math.trunc(p.ignoreEnemyId) === enemyId) continue;
      const enemyType = String(e?.enemyType || '');
      let hitPoint = null;
      if (enemyType === 'drawsnake') {
        hitPoint = helpers.getDrawSnakeProjectileImpactPoint?.(e, p, projectileHitRadiusWorld, scale);
      } else {
        const dx = e.wx - p.wx;
        const dy = e.wy - p.wy;
        const enemyExtraRadiusWorld = Math.max(0, Number(e?.projectileHitRadiusPx) || 0) / Math.max(0.001, scale || 1);
        const effR = projectileHitRadiusWorld + enemyExtraRadiusWorld;
        if ((dx * dx + dy * dy) <= (effR * effR)) hitPoint = { x: e.wx, y: e.wy };
      }
      if (hitPoint) {
        if (isBoomerang) {
          if (!(p.hitEnemyIds instanceof Set)) p.hitEnemyIds = new Set();
          if (enemyId > 0 && p.hitEnemyIds.has(enemyId)) continue;
          if (enemyId > 0) p.hitEnemyIds.add(enemyId);
        }
        helpers.withDamageSoundStage?.(p.chainStageIndex, () => helpers.damageEnemy?.(e, p.damage));
        if (Array.isArray(p.nextStages) && p.nextStages.length) {
          const stages = helpers.sanitizeWeaponStages?.(p.nextStages) || [];
          const first = stages[0];
          const rest = stages.slice(1);
          const nextBeat = Number.isFinite(p.nextBeatIndex)
            ? Math.max(Math.trunc(p.nextBeatIndex), Math.max(0, currentBeatIndex) + 1)
            : (Math.max(0, currentBeatIndex) + 1);
          const chainCtx = {
            origin: { x: p.wx, y: p.wy },
            impactPoint: hitPoint,
            weaponSlotIndex: Number.isFinite(p.chainWeaponSlotIndex) ? Math.trunc(p.chainWeaponSlotIndex) : null,
            stageIndex: Number.isFinite(p.chainStageIndex) ? Math.trunc(p.chainStageIndex) : null,
            impactEnemyId: enemyId > 0 ? enemyId : null,
            sourceEnemyId: enemyId > 0 ? enemyId : null,
            damageScale: Math.max(0.05, Number(p.chainDamageScale) || 1),
          };
          if (first?.archetype === 'projectile') {
            helpers.triggerWeaponStage?.(first, hitPoint, currentBeatIndex, rest, chainCtx);
          } else {
            helpers.queueWeaponChain?.(nextBeat, stages, chainCtx);
          }
        }
        if (!isBoomerang) {
          hit = true;
          break;
        }
      }
    }
    if (hit || (useTtlDespawn && p.ttl <= 0)) {
      try { p.el?.remove?.(); } catch {}
      projectiles.splice(i, 1);
      continue;
    }
    const s = helpers.worldToScreen?.({ x: p.wx, y: p.wy });
    if (!s || !Number.isFinite(s.x) || !Number.isFinite(s.y)) {
      if (p?.el) p.el.style.transform = 'translate(-9999px, -9999px)';
      continue;
    }
    if (s.x >= 0 && s.y >= 0 && s.x <= screenW && s.y <= screenH) p.hasEnteredScreen = true;
    const isOffscreen = s.x < -projectileOffscreenPad
      || s.y < -projectileOffscreenPad
      || s.x > (screenW + projectileOffscreenPad)
      || s.y > (screenH + projectileOffscreenPad);
    if (!useTtlDespawn && isOffscreen && (p.hasEnteredScreen || p.ttl <= 0)) {
      try { p.el?.remove?.(); } catch {}
      projectiles.splice(i, 1);
      continue;
    }
    if (isBoomerang) {
      const deg = ((Number(p.boomTheta) || 0) * (180 / Math.PI) * (Number(constants.projectileBoomerangSpinMult) || 1)) + 180;
      p.el.style.transform = `translate(${s.x}px, ${s.y}px) rotate(${deg.toFixed(2)}deg)`;
    } else {
      p.el.style.transform = `translate(${s.x}px, ${s.y}px)`;
    }
  }

  for (let i = effects.length - 1; i >= 0; i--) {
    const fx = effects[i];
    fx.ttl -= dt;
    if (fx.ttl <= 0) {
      try { fx.el?.remove?.(); } catch {}
      effects.splice(i, 1);
      continue;
    }
    if (fx.kind === 'laser' || fx.kind === 'beam') {
      if (fx.kind === 'beam') {
        if (Number.isFinite(fx.sourceEnemyId)) {
          const srcAlive = enemies.some((e) => Math.trunc(Number(e.id) || 0) === Math.trunc(fx.sourceEnemyId));
          if (!srcAlive) {
            const pendingDeath = helpers.getPendingEnemyDeathByEnemyId?.(fx.sourceEnemyId);
            if (!pendingDeath) {
              try { fx.el?.remove?.(); } catch {}
              effects.splice(i, 1);
              continue;
            } else {
              fx.from = { x: Number(pendingDeath.wx) || 0, y: Number(pendingDeath.wy) || 0 };
            }
          } else {
            fx.sourceGoneTtl = null;
            const src = enemies.find((e) => Math.trunc(Number(e.id) || 0) === Math.trunc(fx.sourceEnemyId)) || null;
            if (src) fx.from = { x: Number(src.wx) || 0, y: Number(src.wy) || 0 };
          }
        }
        let target = null;
        if (Number.isFinite(fx.targetEnemyId)) {
          target = enemies.find((e) => Math.trunc(Number(e.id) || 0) === Math.trunc(fx.targetEnemyId)) || null;
        }
        if (!target) {
          target = helpers.getNearestEnemy?.(fx.from?.x || 0, fx.from?.y || 0, fx.sourceEnemyId);
          fx.targetEnemyId = Number.isFinite(target?.id) ? Math.trunc(target.id) : null;
        }
        if (target) {
          fx.to = { x: target.wx, y: target.wy };
          helpers.damageEnemy?.(target, Math.max(0, Number(fx.damagePerSec) || 0) * dt);
        }
      } else if (fx.kind === 'laser') {
        if (Number.isFinite(fx.sourceEnemyId)) {
          const src = enemies.find((e) => Math.trunc(Number(e.id) || 0) === Math.trunc(fx.sourceEnemyId)) || null;
          if (src) {
            fx.from = { x: Number(src.wx) || 0, y: Number(src.wy) || 0 };
          } else {
            const pendingDeath = helpers.getPendingEnemyDeathByEnemyId?.(fx.sourceEnemyId);
            if (pendingDeath) fx.from = { x: Number(pendingDeath.wx) || 0, y: Number(pendingDeath.wy) || 0 };
          }
        }
        if (Number.isFinite(fx.targetEnemyId)) {
          const trg = enemies.find((e) => Math.trunc(Number(e.id) || 0) === Math.trunc(fx.targetEnemyId)) || null;
          if (trg) fx.to = { x: Number(trg.wx) || 0, y: Number(trg.wy) || 0 };
        }
      }
      const a = helpers.worldToScreen?.({ x: fx.from.x, y: fx.from.y });
      const b = helpers.worldToScreen?.({ x: fx.to.x, y: fx.to.y });
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.max(1, Math.hypot(dx, dy));
      const ang = Math.atan2(dy, dx) * (180 / Math.PI);
      fx.el.style.width = `${len}px`;
      fx.el.style.transform = `translate(${a.x}px, ${a.y}px) rotate(${ang}deg)`;
      if (fx.kind === 'beam') {
        fx.el.style.opacity = '1';
      } else {
        fx.el.style.opacity = `${Math.max(0, Math.min(1, fx.ttl / (Number(constants.laserTtl) || 1)))}`;
      }
    } else if (fx.kind === 'explosion' || fx.kind === 'explosion-prime' || fx.kind === 'hostile-explosion') {
      const basePxRadius = Math.max(18, (Number(fx.radiusWorld) || Number(constants.explosionRadiusWorld) || 0) * Math.max(0.001, scale || 1));
      let radiusScale = 1;
      let opacity = Math.max(0, Math.min(1, fx.ttl / (Number(constants.explosionTtl) || 1)));
      if (fx.kind === 'explosion-prime') {
        const anchorId = Number.isFinite(fx.anchorEnemyId) ? Math.trunc(fx.anchorEnemyId) : null;
        if (anchorId) {
          const anchorEnemy = enemies.find((e) => Math.trunc(Number(e.id) || 0) === anchorId) || null;
          if (anchorEnemy) {
            fx.at = { x: Number(anchorEnemy.wx) || 0, y: Number(anchorEnemy.wy) || 0 };
          } else {
            const pendingDeath = helpers.getPendingEnemyDeathByEnemyId?.(anchorId);
            if (pendingDeath) {
              fx.at = { x: Number(pendingDeath.wx) || 0, y: Number(pendingDeath.wy) || 0 };
            } else {
              try { fx.el?.remove?.(); } catch {}
              effects.splice(i, 1);
              continue;
            }
          }
        }
        const total = Math.max(0.05, Number(fx.duration) || (helpers.getGameplayBeatLen?.() || 0.05));
        const elapsedN = Math.max(0, Math.min(1, 1 - (fx.ttl / total)));
        const eased = 1 - ((1 - elapsedN) * (1 - elapsedN));
        radiusScale = 0.04 + (((Number(constants.explosionPrimeMaxScale) || 1) - 0.04) * eased);
        opacity = 0.22 + (0.34 * eased);
      } else if (fx.kind === 'hostile-explosion') {
        opacity = Math.max(0, Math.min(1, fx.ttl / Math.max(0.01, Number(constants.composerGroupExplosionTtl) || 0.01)));
      }
      const c = helpers.worldToScreen?.({ x: Number(fx.at?.x) || 0, y: Number(fx.at?.y) || 0 });
      if (!c) continue;
      const pxRadius = basePxRadius * radiusScale;
      const pxSize = pxRadius * 2;
      fx.el.style.width = `${pxSize}px`;
      fx.el.style.height = `${pxSize}px`;
      fx.el.style.marginLeft = `${-pxRadius}px`;
      fx.el.style.marginTop = `${-pxRadius}px`;
      fx.el.style.transform = `translate(${c.x}px, ${c.y}px)`;
      fx.el.style.opacity = `${opacity}`;
    }
  }

  helpers.updateEnergyGravityRuntime?.(dt, centerWorld, scale);
  helpers.updateBeatWeapons?.(centerWorld);
  helpers.flushSwarmSoundEventsForBeat?.(currentBeatIndex);
}
