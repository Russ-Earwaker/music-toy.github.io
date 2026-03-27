export function updateBeatSwarmEnemiesRuntime(options = null) {
  const constants = options?.constants && typeof options.constants === 'object' ? options.constants : {};
  const helpers = options?.helpers && typeof options.helpers === 'object' ? options.helpers : {};
  const state = options?.state && typeof options.state === 'object' ? options.state : {};

  const enemies = Array.isArray(state.enemies) ? state.enemies : [];
  if (!enemies.length) return;

  const centerWorld = helpers.getViewportCenterWorld?.() || { x: 0, y: 0 };
  const z = helpers.getZoomState?.();
  const scale = Number.isFinite(z?.targetScale) ? z.targetScale : (Number.isFinite(z?.currentScale) ? z.currentScale : 1);
  const hitRadiusWorld = (Number(constants.enemyHitRadius) || 0) / Math.max(0.001, scale || 1);
  const offscreenRemovePad = 80;
  const offscreenGraceSeconds = 2.4;
  const frameIndex = Math.max(0, Math.trunc(Number(state.frameIndex) || 0));
  const projectileCount = Math.max(0, Math.trunc(Number(state.projectileCount) || 0));
  const effectCount = Math.max(0, Math.trunc(Number(state.effectCount) || 0));
  const liveObjectPressure = enemies.length + projectileCount + effectCount;
  const drawSnakeVisualStride = liveObjectPressure >= 72 ? 3 : (liveObjectPressure >= 40 ? 2 : 1);

  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    const enemyType = String(e?.enemyType || '');
    const lifecycleState = helpers.normalizeMusicLifecycleState?.(e?.lifecycleState || 'active', 'active');
    const aggressionScale = helpers.getLifecycleAggressionScale?.(lifecycleState);
    const resolveRolePulseScale = () => {
      const pulseDur = Math.max(0.01, Number(e?.musicRolePulseDur) || Number(constants.musicRolePulseSeconds) || 0.24);
      const pulseT = Math.max(0, Number(e?.musicRolePulseT) || 0);
      const pulseScale = Math.max(0, Math.min(0.5, Number(e?.musicRolePulseScale) || Number(constants.musicRolePulseScale) || 0.1));
      if (!(pulseT > 0)) {
        if (e?.el) {
          try { e.el.style.setProperty('--bs-role-pulse', '0'); } catch {}
        }
        return 1;
      }
      const phase = 1 - Math.max(0, Math.min(1, pulseT / pulseDur));
      const strength = Math.sin(phase * Math.PI);
      const nextPulseT = Math.max(0, pulseT - (Number(state.dt) || 0));
      e.musicRolePulseT = nextPulseT;
      if (e?.el) {
        try { e.el.style.setProperty('--bs-role-pulse', String(Math.max(0, Math.min(1, strength)).toFixed(3))); } catch {}
      }
      return 1 + (strength * pulseScale);
    };
    if (enemyType === 'spawner') helpers.updateSpawnerEnemyFlash?.(e, state.dt);
    const isPersistentSpecialEnemy = enemyType === 'spawner' || enemyType === 'drawsnake';
    if (!e?.retreating && lifecycleState === 'retiring' && enemyType === 'composer-group-member') {
      const retireStartedMs = Number(e?.retirePhaseStartMs) || 0;
      const nowMs = Number(globalThis?.performance?.now?.() || 0);
      if (retireStartedMs > 0 && (nowMs - retireStartedMs) >= ((Number(constants.retiringRetreatDelaySec) || 0) * 1000)) {
        helpers.startEnemyRetreat?.(e, e?.retireReason || 'retreated', 'retiring-timeout');
      }
    }
    if (e?.retreating) {
      const away = helpers.normalizeDir?.(
        (Number(e.wx) || 0) - (Number(centerWorld.x) || 0),
        (Number(e.wy) || 0) - (Number(centerWorld.y) || 0),
        Number(e.vx) || 0,
        Number(e.vy) || 0
      ) || { x: 0, y: 0 };
      const retreatSpeed = (Number(constants.enemyMaxSpeed) || 0) * (enemyType === 'composer-group-member' ? 0.95 : 1.05);
      const blend = Math.max(0, Math.min(1, (Number(state.dt) || 0) * 2.2));
      e.vx += (((Number(away.x) || 0) * retreatSpeed) - (Number(e.vx) || 0)) * blend;
      e.vy += (((Number(away.y) || 0) * retreatSpeed) - (Number(e.vy) || 0)) * blend;
      e.wx += (Number(e.vx) || 0) * (Number(state.dt) || 0);
      e.wy += (Number(e.vy) || 0) * (Number(state.dt) || 0);
      const s = helpers.worldToScreen?.({ x: e.wx, y: e.wy });
      if (!s || !Number.isFinite(s.x) || !Number.isFinite(s.y)) {
        helpers.removeEnemy?.(e, e.retreatReason || 'retreated', {
          retireOrigin: String(e?.retreatOrigin || '').trim().toLowerCase(),
        });
        enemies.splice(i, 1);
        continue;
      }
      const outPad = 120;
      if (s.x < -outPad || s.y < -outPad || s.x > globalThis.window.innerWidth + outPad || s.y > globalThis.window.innerHeight + outPad) {
        helpers.removeEnemy?.(e, e.retreatReason || 'retreated', {
          retireOrigin: String(e?.retreatOrigin || '').trim().toLowerCase(),
        });
        enemies.splice(i, 1);
        continue;
      }
      if (e.el) {
        e.spawnT = Math.min(Number(e.spawnDur) || 0.14, (Number(e.spawnT) || 0) + (Number(state.dt) || 0));
        const spawnScale = enemyType === 'drawsnake' ? 1 : (helpers.getEnemySpawnScale?.(e) || 1);
        const rolePulseScale = resolveRolePulseScale();
        e.el.style.transform = `translate(${s.x}px, ${s.y}px) scale(${(spawnScale * rolePulseScale).toFixed(3)})`;
      }
      if (enemyType === 'dumb' && Number.isFinite(e?.linkedSpawnerId)) helpers.updateSpawnerLinkedEnemyLine?.(e);
      if (enemyType === 'drawsnake' && ((frameIndex + Math.max(0, Math.trunc(Number(e?.id) || 0))) % drawSnakeVisualStride) === 0) {
        helpers.updateDrawSnakeVisual?.(e, scale, state.dt);
      }
      continue;
    }
    const dx = centerWorld.x - e.wx;
    const dy = centerWorld.y - e.wy;
    const d = Math.hypot(dx, dy) || 0.0001;
    const typeSpeedMult = String(e?.enemyType || '') === 'spawner' ? (Number(constants.spawnerEnemySpeedMultiplier) || 1) : 1;
    const enemySpeedScale = Math.max(0.35, Number(e?.enemySpeedMultiplier) || 1);
    const speedMult = Math.max(0.05, Number(state?.difficultyConfig?.enemySpeedMultiplier) || 1)
      * Math.max(0.05, Number(typeSpeedMult) || 1)
      * enemySpeedScale
      * Math.max(0.35, Number(aggressionScale) || 0);
    let ax = (dx / d) * (Number(constants.enemyAccel) || 0) * speedMult;
    let ay = (dy / d) * (Number(constants.enemyAccel) || 0) * speedMult;
    if (enemyType === 'drawsnake') {
      const curAngle = Number(e.drawsnakeMoveAngle);
      e.drawsnakeMoveAngle = Number.isFinite(curAngle) ? curAngle : (Math.random() * Math.PI * 2);
      e.drawsnakeTurnTimer = (Number(e.drawsnakeTurnTimer) || 0) - (Number(state.dt) || 0);
      if (!(Number(e.drawsnakeTurnTimer) > 0)) {
        e.drawsnakeTurnTimer = helpers.randRange?.(
          Number(constants.drawSnakeTurnIntervalMin) || 0,
          Number(constants.drawSnakeTurnIntervalMax) || 0
        );
        const dir = Math.random() >= 0.5 ? 1 : -1;
        e.drawsnakeTurnTarget = dir * (helpers.randRange?.(
          Number(constants.drawSnakeTurnRateMin) || 0,
          Number(constants.drawSnakeTurnRateMax) || 0
        ) || 0);
      }
      const targetTurn = Number(e.drawsnakeTurnTarget) || 0;
      const curTurn = Number(e.drawsnakeTurnRate) || 0;
      const turnBlend = Math.max(0, Math.min(1, (Number(state.dt) || 0) * 1.85));
      e.drawsnakeTurnRate = curTurn + ((targetTurn - curTurn) * turnBlend);
      e.drawsnakeWindPhase = (Number(e.drawsnakeWindPhase) || 0) + ((Number(state.dt) || 0) * Math.PI * 2 * (Number(constants.drawSnakeWindFreqHz) || 0));
      const wind = Math.sin(Number(e.drawsnakeWindPhase) || 0);
      e.drawsnakeMoveAngle += ((Number(e.drawsnakeTurnRate) || 0) + (wind * 0.18)) * (Number(state.dt) || 0);
      const arenaCenter = (state.arenaCenterWorld && Number.isFinite(state.arenaCenterWorld.x) && Number.isFinite(state.arenaCenterWorld.y))
        ? state.arenaCenterWorld
        : centerWorld;
      const toArenaX = Number(arenaCenter.x) - Number(e.wx);
      const toArenaY = Number(arenaCenter.y) - Number(e.wy);
      const arenaDist = Math.hypot(toArenaX, toArenaY) || 0.0001;
      const arenaSoft = (Number(constants.swarmArenaRadiusWorld) || 0) * (Number(constants.drawSnakeArenaBiasRadiusScale) || 0);
      if (arenaDist > arenaSoft) {
        const inwardAngle = Math.atan2(toArenaY, toArenaX);
        let delta = inwardAngle - e.drawsnakeMoveAngle;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        const over = Math.max(0, arenaDist - arenaSoft);
        const maxOver = Math.max(1, (Number(constants.swarmArenaRadiusWorld) || 0) - arenaSoft);
        const bias = Math.max(0, Math.min(1, over / maxOver)) * (Number(constants.drawSnakeArenaBiasStrength) || 0);
        e.drawsnakeMoveAngle += delta * Math.max(0, Math.min(1, bias));
      }
      const roamSpeed = (Number(constants.enemyMaxSpeed) || 0) * Math.max(0.36, Math.min(1.2, speedMult * 0.78));
      const desiredVx = Math.cos(e.drawsnakeMoveAngle) * roamSpeed;
      const desiredVy = Math.sin(e.drawsnakeMoveAngle) * roamSpeed;
      const blend = Math.max(0, Math.min(1, (Number(state.dt) || 0) * 2.2));
      e.vx += (desiredVx - e.vx) * blend;
      e.vy += (desiredVy - e.vy) * blend;
      ax = 0;
      ay = 0;
    }
    if (enemyType === 'composer-group-member') {
      const sepR = Math.max(20, Number(constants.composerGroupSeparationRadiusWorld) || 200);
      const sepR2 = sepR * sepR;
      let repelX = 0;
      let repelY = 0;
      for (let j = 0; j < enemies.length; j++) {
        const o = enemies[j];
        if (!o || o === e || String(o?.enemyType || '') !== 'composer-group-member') continue;
        const ddx = e.wx - o.wx;
        const ddy = e.wy - o.wy;
        const d2 = (ddx * ddx) + (ddy * ddy);
        if (!(d2 > 0.0001) || d2 >= sepR2) continue;
        const dist = Math.sqrt(d2);
        const push = (1 - (dist / sepR));
        repelX += (ddx / dist) * push;
        repelY += (ddy / dist) * push;
      }
      if (repelX !== 0 || repelY !== 0) {
        const repelLen = Math.hypot(repelX, repelY) || 1;
        const force = Math.max(0, Number(constants.composerGroupSeparationForce) || 0) * Math.max(0.45, Number(aggressionScale) || 0);
        ax += (repelX / repelLen) * force;
        ay += (repelY / repelLen) * force;
      }
    }
    e.vx += ax * (Number(state.dt) || 0);
    e.vy += ay * (Number(state.dt) || 0);
    const speed = Math.hypot(e.vx, e.vy);
    const maxSpeed = (Number(constants.enemyMaxSpeed) || 0) * speedMult;
    if (speed > maxSpeed) {
      const k = maxSpeed / speed;
      e.vx *= k;
      e.vy *= k;
    }
    e.wx += e.vx * (Number(state.dt) || 0);
    e.wy += e.vy * (Number(state.dt) || 0);
    if (d <= hitRadiusWorld) {
      const perfProtected = helpers.isPerfRepeatProtectedEnemy?.(e) === true;
      if (lifecycleState === 'retiring') {
        const back = helpers.normalizeDir?.(e.wx - centerWorld.x, e.wy - centerWorld.y, e.vx, e.vy) || { x: 0, y: 0 };
        const repulseSpeed = Math.max(80, (Number(constants.enemyMaxSpeed) || 0) * Math.max(0.4, Number(aggressionScale) || 0));
        e.vx = back.x * repulseSpeed;
        e.vy = back.y * repulseSpeed;
        e.wx += e.vx * Math.max(0.016, (Number(state.dt) || 0) * 1.2);
        e.wy += e.vy * Math.max(0.016, (Number(state.dt) || 0) * 1.2);
        continue;
      }
      if (enemyType === 'drawsnake') {
        e.drawsnakeMoveAngle = (Number(e.drawsnakeMoveAngle) || 0) + Math.PI * 0.75;
        e.vx *= -0.45;
        e.vy *= -0.45;
        continue;
      }
      if (enemyType === 'dumb' && Number.isFinite(e?.linkedSpawnerId)) {
        const back = helpers.normalizeDir?.(e.wx - centerWorld.x, e.wy - centerWorld.y, e.vx, e.vy) || { x: 0, y: 0 };
        e.vx = back.x * Math.max(120, Math.hypot(e.vx, e.vy));
        e.vy = back.y * Math.max(120, Math.hypot(e.vx, e.vy));
        e.wx += e.vx * Math.max(0.016, (Number(state.dt) || 0) * 1.6);
        e.wy += e.vy * Math.max(0.016, (Number(state.dt) || 0) * 1.6);
        continue;
      }
      if (perfProtected) {
        const back = helpers.normalizeDir?.(e.wx - centerWorld.x, e.wy - centerWorld.y, e.vx, e.vy) || { x: 0, y: 0 };
        const bounceSpeed = Math.max(110, Math.hypot(e.vx, e.vy), (Number(constants.enemyMaxSpeed) || 0) * 0.7);
        e.vx = back.x * bounceSpeed;
        e.vy = back.y * bounceSpeed;
        e.wx += e.vx * Math.max(0.016, (Number(state.dt) || 0) * 1.4);
        e.wy += e.vy * Math.max(0.016, (Number(state.dt) || 0) * 1.4);
        continue;
      }
      helpers.removeEnemy?.(e, 'killed');
      enemies.splice(i, 1);
      continue;
    }
    const s = helpers.worldToScreen?.({ x: e.wx, y: e.wy });
    if (!s || !Number.isFinite(s.x) || !Number.isFinite(s.y)) {
      if (isPersistentSpecialEnemy) {
        if (e.el) e.el.style.transform = 'translate(-9999px, -9999px)';
        continue;
      }
      helpers.removeEnemy?.(e, 'expired');
      enemies.splice(i, 1);
      continue;
    }
    const isOffscreenBeyondGracePad = s.x < -offscreenRemovePad
      || s.y < -offscreenRemovePad
      || s.x > globalThis.window.innerWidth + offscreenRemovePad
      || s.y > globalThis.window.innerHeight + offscreenRemovePad;
    if (isOffscreenBeyondGracePad) {
      e.offscreenGraceT = Math.max(0, Number(e.offscreenGraceT) || 0) + (Number(state.dt) || 0);
      if (!isPersistentSpecialEnemy && Number(e.offscreenGraceT) >= offscreenGraceSeconds) {
        helpers.removeEnemy?.(e, 'retreated');
        enemies.splice(i, 1);
        continue;
      }
    } else {
      e.offscreenGraceT = 0;
    }
    if (e.el) {
      e.spawnT = Math.min(Number(e.spawnDur) || 0.14, (Number(e.spawnT) || 0) + (Number(state.dt) || 0));
      const spawnScale = enemyType === 'drawsnake' ? 1 : (helpers.getEnemySpawnScale?.(e) || 1);
      const rolePulseScale = enemyType === 'drawsnake' ? 1 : resolveRolePulseScale();
      let actionScale = 1;
      if (enemyType === 'composer-group-member') {
        const pulseDur = Math.max(0.01, Number(e.composerActionPulseDur) || Number(constants.composerGroupActionPulseSeconds) || 0);
        const pulseT = Math.max(0, Number(e.composerActionPulseT) || 0);
        if (pulseT > 0) {
          const phase = 1 - Math.max(0, Math.min(1, pulseT / pulseDur));
          const localPulseScale = Math.max(0, Number(e?.composerActionPulseScale) || Number(constants.composerGroupActionPulseScale) || 0);
          actionScale = 1 + (Math.sin(phase * Math.PI) * localPulseScale);
          e.composerActionPulseT = Math.max(0, pulseT - (Number(state.dt) || 0));
        }
        const soloPulseDur = Math.max(0.01, Number(e?.soloCarrierActivationPulseDur) || 0);
        const soloPulseT = Math.max(0, Number(e?.soloCarrierActivationPulseT) || 0);
        const soloCarrierType = String(e?.soloCarrierType || '').trim().toLowerCase();
        const isSoloCarrier = soloCarrierType === 'rhythm' || soloCarrierType === 'melody';
        if (isSoloCarrier && soloPulseT > 0) {
          const soloPhase = 1 - Math.max(0, Math.min(1, soloPulseT / soloPulseDur));
          const soloPulseStrength = Math.sin(soloPhase * Math.PI);
          const soloPulseScale = Math.max(0, Number(e?.soloCarrierActivationPulseScale) || 0.18);
          actionScale *= 1 + (soloPulseStrength * soloPulseScale);
          const shouldLogRhythmPulse = soloCarrierType === 'rhythm'
            && Number(e?.soloPulseDebugLastLoggedT) !== Number(soloPulseT);
          e.soloCarrierActivationPulseT = Math.max(0, soloPulseT - (Number(state.dt) || 0));
          if (e.el instanceof HTMLElement) {
            e.el.classList.add('is-solo-note-active');
            try {
              e.el.style.setProperty('--bs-solo-pulse-level', soloPulseStrength.toFixed(3));
            } catch {}
            if (soloCarrierType === 'rhythm') {
              try {
                e.el.style.borderColor = 'rgba(255, 246, 224, 0.88)';
                e.el.style.filter = `brightness(${(1.02 + (soloPulseStrength * 0.16)).toFixed(3)}) saturate(${(1.01 + (soloPulseStrength * 0.1)).toFixed(3)})`;
              } catch {}
            }
          }
          if (shouldLogRhythmPulse && typeof helpers.noteIntroDebug === 'function') {
            try {
              e.soloPulseDebugLastLoggedT = soloPulseT;
              helpers.noteIntroDebug('square_visual_pulse_frame', {
                enemyId: Math.trunc(Number(e?.id) || 0),
                groupId: Math.trunc(Number(e?.composerGroupId) || e?.musicGroupId || 0),
                soloPulseT: Number(soloPulseT) || 0,
                soloPulseDur: Number(soloPulseDur) || 0,
                soloPulseStrength,
                hasEl: e.el instanceof HTMLElement,
                className: e.el instanceof HTMLElement ? String(e.el.className || '') : '',
                transform: e.el instanceof HTMLElement ? String(e.el.style.transform || '') : '',
                background: e.el instanceof HTMLElement ? String(e.el.style.background || '') : '',
                filter: e.el instanceof HTMLElement ? String(e.el.style.filter || '') : '',
              });
            } catch {}
          }
        } else if (isSoloCarrier && e.el instanceof HTMLElement) {
          e.el.classList.remove('is-solo-note-active');
          try { e.el.style.setProperty('--bs-solo-pulse-level', '0'); } catch {}
          if (soloCarrierType === 'rhythm') {
            try {
              e.el.style.borderColor = '';
              e.el.style.filter = '';
            } catch {}
          }
          if (soloCarrierType === 'rhythm' && typeof helpers.noteIntroDebug === 'function' && e.soloPulseDebugLastLoggedT) {
            try {
              helpers.noteIntroDebug('square_visual_pulse_clear', {
                enemyId: Math.trunc(Number(e?.id) || 0),
                groupId: Math.trunc(Number(e?.composerGroupId) || e?.musicGroupId || 0),
                hasEl: e.el instanceof HTMLElement,
                className: e.el instanceof HTMLElement ? String(e.el.className || '') : '',
              });
            } catch {}
          }
          e.soloPulseDebugLastLoggedT = 0;
        }
      }
      e.el.style.transform = `translate(${s.x}px, ${s.y}px) scale(${(spawnScale * actionScale * rolePulseScale).toFixed(3)})`;
    }
    if (enemyType === 'dumb' && Number.isFinite(e?.linkedSpawnerId)) helpers.updateSpawnerLinkedEnemyLine?.(e);
    if (enemyType === 'drawsnake' && ((frameIndex + Math.max(0, Math.trunc(Number(e?.id) || 0))) % drawSnakeVisualStride) === 0) {
      helpers.updateDrawSnakeVisual?.(e, scale, state.dt);
    }
  }
}

export function keepDrawSnakeEnemyOnscreenRuntime(options = null) {
  const constants = options?.constants && typeof options.constants === 'object' ? options.constants : {};
  const helpers = options?.helpers && typeof options.helpers === 'object' ? options.helpers : {};
  const enemy = options?.enemy;
  const dt = Number(options?.dt) || 0;
  if (String(enemy?.enemyType || '') !== 'drawsnake') return null;
  const s = helpers.worldToScreen?.({ x: Number(enemy.wx) || 0, y: Number(enemy.wy) || 0 });
  const screenW = Math.max(1, Number(globalThis.window?.innerWidth) || 0);
  const screenH = Math.max(1, Number(globalThis.window?.innerHeight) || 0);
  const pad = Math.max(40, Number(constants.drawSnakeScreenMarginPx) || 140);
  if (!s || !Number.isFinite(s.x) || !Number.isFinite(s.y)) return s;
  const isOffscreen = s.x < -pad || s.y < -pad || s.x > (screenW + pad) || s.y > (screenH + pad);
  if (!enemy.drawsnakeHasEnteredScreen) {
    if (isOffscreen) return s;
    enemy.drawsnakeHasEnteredScreen = true;
  }
  const clampedX = Math.max(pad, Math.min(screenW - pad, s.x));
  const clampedY = Math.max(pad, Math.min(screenH - pad, s.y));
  if (Math.abs(clampedX - s.x) < 0.001 && Math.abs(clampedY - s.y) < 0.001) return s;
  const pulled = helpers.screenToWorld?.({ x: clampedX, y: clampedY });
  if (!pulled || !Number.isFinite(pulled.x) || !Number.isFinite(pulled.y)) return s;
  const pullRate = Math.max(0.5, Number(constants.drawSnakeEdgePullRate) || 8);
  const t = Math.max(0, Math.min(1, dt * pullRate));
  const pullAngle = Math.atan2((pulled.y - enemy.wy), (pulled.x - enemy.wx));
  if (Number.isFinite(pullAngle)) {
    const cur = Number(enemy.drawsnakeMoveAngle) || 0;
    let delta = pullAngle - cur;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    enemy.drawsnakeMoveAngle = cur + (delta * Math.max(0, Math.min(1, t * 0.8)));
  }
  enemy.wx += (pulled.x - enemy.wx) * t;
  enemy.wy += (pulled.y - enemy.wy) * t;
  enemy.vx *= 0.86;
  enemy.vy *= 0.86;
  return helpers.worldToScreen?.({ x: enemy.wx, y: enemy.wy }) || s;
}
