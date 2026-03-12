export function renderComponentPreviewMarkupRuntime(componentDef = null) {
  const cls = String(componentDef?.previewClass || 'is-empty').trim();
  const componentId = String(componentDef?.id || '').trim();
  const liveAttr = componentId ? `data-component-id="${componentId}"` : '';
  return `
    <div class="beat-swarm-component-preview ${cls}${componentId ? ' is-live' : ''}" ${liveAttr} aria-hidden="true">
      ${componentId ? '<div class="beat-swarm-component-mini-scene"></div>' : ''}
      <span class="cp-lane"></span>
      <span class="cp-ship"></span>
      <span class="cp-enemy"></span>
      <span class="cp-shot cp-shot-a"></span>
      <span class="cp-shot cp-shot-b"></span>
      <span class="cp-shot cp-shot-c"></span>
      <span class="cp-beam"></span>
      <span class="cp-burst"></span>
      <span class="cp-dot"></span>
    </div>
  `;
}

export function createComponentMiniNodeRuntime(options = null) {
  const className = String(options?.className || '').trim();
  const parent = options?.parent || null;
  if (!parent || !className) return null;
  const el = document.createElement('div');
  el.className = className;
  parent.appendChild(el);
  return el;
}

function spawnComponentMiniProjectileRuntime(options = null) {
  const state = options?.state || null;
  const from = options?.from || null;
  const to = options?.to || null;
  const kind = String(options?.kind || 'standard').trim();
  const helpers = options?.helpers && typeof options.helpers === 'object' ? options.helpers : {};
  if (!state || !from || !to || !state.scene) return null;
  const dir = helpers.normalizeDir?.((to?.x || 0) - from.x, (to?.y || 0) - from.y, 1, 0) || { x: 1, y: 0 };
  const rect = state?.root?.getBoundingClientRect?.();
  const sceneSize = Math.max(100, Math.min(Number(rect?.width) || 0, Number(rect?.height) || 0));
  const boomRadius = Math.max(18, Math.min(36, sceneSize * 0.2));
  const el = helpers.createComponentMiniNode?.({
    className: `beat-swarm-preview-projectile${kind === 'boomerang' ? ' is-boomerang' : ''}`,
    parent: state.scene,
  });
  const p = {
    kind,
    x: from.x,
    y: from.y,
    vx: dir.x * 120,
    vy: dir.y * 120,
    ttl: kind === 'boomerang' ? 1.2 : 1.6,
    el,
    centerX: from.x,
    centerY: from.y,
    boomDirX: dir.x,
    boomDirY: dir.y,
    boomPerpX: dir.y,
    boomPerpY: -dir.x,
    boomTheta: Math.PI,
    boomOmega: (Math.PI * 2) / 1.2,
    boomRadius,
  };
  state.projectiles.push(p);
  return p;
}

function spawnComponentMiniEffectRuntime(options = null) {
  const state = options?.state || null;
  const kind = String(options?.kind || '').trim();
  const from = options?.from || null;
  const to = options?.to || null;
  const ttl = Math.max(0.01, Number(options?.ttl) || 0.22);
  const radius = Math.max(8, Number(options?.radius) || 14);
  const helpers = options?.helpers && typeof options.helpers === 'object' ? options.helpers : {};
  if (!state || !kind || !state.scene) return;
  const cls = kind === 'explosion' ? 'beat-swarm-preview-fx-explosion' : 'beat-swarm-preview-fx-laser';
  const e = {
    kind,
    ttl,
    from: from ? { x: from.x, y: from.y } : null,
    to: to ? { x: to.x, y: to.y } : null,
    at: to ? { x: to.x, y: to.y } : (from ? { x: from.x, y: from.y } : null),
    radius,
    el: helpers.createComponentMiniNode?.({ className: cls, parent: state.scene }),
  };
  state.effects.push(e);
}

function ensureComponentMiniHelperRuntime(options = null) {
  const state = options?.state || null;
  const variant = String(options?.variant || '').trim();
  const helpers = options?.helpers && typeof options.helpers === 'object' ? options.helpers : {};
  if (!state || !variant || !Array.isArray(state.helpers)) return;
  if (variant === 'turret') {
    if (state.helpers.some((h) => h.kind === 'turret')) return;
    const at = { x: state.ship.x, y: state.ship.y - 20 };
    state.helpers.push({
      kind: 'turret',
      x: at.x,
      y: at.y,
      el: helpers.createComponentMiniNode?.({
        className: 'beat-swarm-preview-projectile beat-swarm-preview-helper-turret',
        parent: state.scene,
      }),
    });
    return;
  }
  if (variant === 'orbital-drone') {
    if (state.helpers.some((h) => h.kind === 'orbital-drone')) return;
    state.helpers.push({
      kind: 'orbital-drone',
      anchor: 'ship',
      angle: 0,
      radius: 18,
      elA: helpers.createComponentMiniNode?.({
        className: 'beat-swarm-preview-projectile beat-swarm-preview-helper-orbital',
        parent: state.scene,
      }),
      elB: helpers.createComponentMiniNode?.({
        className: 'beat-swarm-preview-projectile beat-swarm-preview-helper-orbital',
        parent: state.scene,
      }),
      ax: 0,
      ay: 0,
      bx: 0,
      by: 0,
    });
  }
}

export function fireComponentLivePreviewRuntime(options = null) {
  const state = options?.state || null;
  const constants = options?.constants && typeof options.constants === 'object' ? options.constants : {};
  const helpers = options?.helpers && typeof options.helpers === 'object' ? options.helpers : {};
  const c = state?.component || null;
  if (!state || !c) return;
  if (c.archetype === 'projectile') {
    if (c.variant === 'split-shot') {
      const base = Math.atan2(state.enemy.y - state.ship.y, state.enemy.x - state.ship.x);
      const split = Number(constants.previewProjectileSplitAngleRad) || 0;
      const offs = [0, -split, split];
      for (const o of offs) {
        const dir = { x: Math.cos(base + o), y: Math.sin(base + o) };
        spawnComponentMiniProjectileRuntime({
          state,
          from: state.ship,
          to: { x: state.ship.x + dir.x * 200, y: state.ship.y + dir.y * 200 },
          helpers,
        });
      }
      return;
    }
    if (c.variant === 'boomerang') {
      spawnComponentMiniProjectileRuntime({ state, from: state.ship, to: state.enemy, kind: 'boomerang', helpers });
      return;
    }
    if (c.variant === 'homing-missile') {
      spawnComponentMiniProjectileRuntime({
        state,
        from: state.ship,
        to: { x: state.ship.x + 220, y: state.ship.y },
        kind: 'homing',
        helpers,
      });
      return;
    }
    spawnComponentMiniProjectileRuntime({ state, from: state.ship, to: state.enemy, helpers });
    return;
  }
  if (c.archetype === 'laser') {
    if (c.variant === 'beam') {
      spawnComponentMiniEffectRuntime({ state, kind: 'beam', from: state.ship, to: state.enemy, ttl: 0.5, helpers });
    } else {
      spawnComponentMiniEffectRuntime({ state, kind: 'laser', from: state.ship, to: state.enemy, ttl: 0.18, helpers });
    }
    helpers.pulseHitFlash?.(state.enemy.el);
    return;
  }
  if (c.archetype === 'aoe') {
    spawnComponentMiniEffectRuntime({
      state,
      kind: 'explosion',
      from: state.ship,
      to: state.ship,
      ttl: c.variant === 'dot-area' ? 0.7 : 0.24,
      radius: 36,
      helpers,
    });
    helpers.pulseHitFlash?.(state.enemy.el);
    return;
  }
  if (c.archetype === 'helper') {
    ensureComponentMiniHelperRuntime({ state, variant: c.variant, helpers });
    if (c.variant === 'turret') {
      const t = state.helpers.find((h) => h.kind === 'turret');
      if (t) spawnComponentMiniProjectileRuntime({ state, from: { x: t.x, y: t.y }, to: state.enemy, helpers });
    } else {
      const h = state.helpers.find((x) => x.kind === 'orbital-drone');
      if (h) {
        spawnComponentMiniProjectileRuntime({ state, from: { x: h.ax, y: h.ay }, to: state.enemy, helpers });
        spawnComponentMiniProjectileRuntime({ state, from: { x: h.bx, y: h.by }, to: state.enemy, helpers });
      }
    }
  }
}

export function updateComponentLivePreviewStateRuntime(options = null) {
  const state = options?.state || null;
  const dt = Math.max(0.001, Number(options?.dt) || 0);
  const constants = options?.constants && typeof options.constants === 'object' ? options.constants : {};
  const helpers = options?.helpers && typeof options.helpers === 'object' ? options.helpers : {};
  if (!state?.root || !state?.ship?.el || !state?.enemy?.el) return;
  const rect = state.root.getBoundingClientRect();
  const w = Math.max(120, Number(rect.width) || 0);
  const h = Math.max(120, Number(rect.height) || 0);
  const nowMs = Number(options?.nowMs) || performance.now();

  if (state.component?.archetype === 'aoe') {
    state.ship.x = w * 0.5;
    state.ship.y = h * 0.5;
    state.enemy.x = state.ship.x + 28;
    state.enemy.y = state.ship.y - 10;
  } else if (state.component?.archetype === 'projectile' && state.component?.variant === 'boomerang') {
    state.ship.x = w * 0.2;
    state.ship.y = h * 0.52;
    state.enemy.x = w * 0.56;
    state.enemy.y = h * 0.48;
    if (state.enemyAlt?.el) {
      state.enemyAlt.x = w * 0.62;
      state.enemyAlt.y = h * 0.56;
    }
  } else if (state.component?.archetype === 'projectile' && state.component?.variant === 'homing-missile') {
    state.ship.x = w * 0.2;
    state.ship.y = h * 0.52;
    state.enemy.x = w * 0.8;
    state.enemy.y = (h * 0.5) + (Math.sin(nowMs * 0.004) * (h * 0.17));
    if (state.enemyAlt?.el) {
      state.enemyAlt.x = w * 0.9;
      state.enemyAlt.y = h * 0.42;
    }
  } else {
    state.ship.x = w * 0.2;
    state.ship.y = h * 0.52;
    state.enemy.x = w * 0.78;
    state.enemy.y = h * 0.52;
    if (state.enemyAlt?.el) {
      state.enemyAlt.x = w * 0.88;
      state.enemyAlt.y = h * 0.42;
    }
  }
  state.ship.el.style.transform = `translate(${state.ship.x.toFixed(2)}px, ${state.ship.y.toFixed(2)}px)`;
  state.enemy.el.style.transform = `translate(${state.enemy.x.toFixed(2)}px, ${state.enemy.y.toFixed(2)}px)`;
  state.enemy.el.style.opacity = '1';
  state.ship.el.style.opacity = '1';
  if (state.enemyAlt?.el) {
    const showAlt = state.component?.archetype === 'projectile' && state.component?.variant === 'boomerang';
    state.enemyAlt.el.style.opacity = showAlt ? '1' : '0';
    state.enemyAlt.el.style.transform = `translate(${state.enemyAlt.x.toFixed(2)}px, ${state.enemyAlt.y.toFixed(2)}px)`;
  }

  for (const hObj of state.helpers) {
    if (hObj.kind === 'orbital-drone' && (!hObj.elA || !hObj.elB || !hObj.elA.isConnected || !hObj.elB.isConnected)) continue;
    if (hObj.kind === 'turret' && (!hObj.el || !hObj.el.isConnected)) continue;
    if (hObj.kind === 'orbital-drone') {
      hObj.angle += dt * 2.2;
      const r = 18;
      hObj.ax = state.ship.x + Math.cos(hObj.angle) * r;
      hObj.ay = state.ship.y + Math.sin(hObj.angle) * r;
      hObj.bx = state.ship.x + Math.cos(hObj.angle + Math.PI) * r;
      hObj.by = state.ship.y + Math.sin(hObj.angle + Math.PI) * r;
      hObj.elA.style.transform = `translate(${hObj.ax.toFixed(2)}px, ${hObj.ay.toFixed(2)}px)`;
      hObj.elB.style.transform = `translate(${hObj.bx.toFixed(2)}px, ${hObj.by.toFixed(2)}px)`;
    } else if (hObj.kind === 'turret') {
      hObj.el.style.transform = `translate(${hObj.x.toFixed(2)}px, ${hObj.y.toFixed(2)}px)`;
    }
  }

  for (let i = state.projectiles.length - 1; i >= 0; i--) {
    const p = state.projectiles[i];
    if (!p?.el || !p.el.isConnected) {
      state.projectiles.splice(i, 1);
      continue;
    }
    p.ttl -= dt;
    if (p.kind === 'boomerang') {
      p.boomTheta += p.boomOmega * dt;
      const c = Math.cos(p.boomTheta);
      const s = Math.sin(p.boomTheta);
      p.x = state.ship.x + (p.boomDirX * (1 + c) * p.boomRadius) + (p.boomPerpX * s * p.boomRadius);
      p.y = state.ship.y + (p.boomDirY * (1 + c) * p.boomRadius) + (p.boomPerpY * s * p.boomRadius);
    } else if (p.kind === 'homing') {
      const desired = helpers.normalizeDir?.(state.enemy.x - p.x, state.enemy.y - p.y, p.vx, p.vy) || { x: 1, y: 0 };
      const cur = helpers.normalizeDir?.(p.vx, p.vy, desired.x, desired.y) || desired;
      const steer = Math.max(0, Math.min(1, 4.8 * dt));
      const nd = helpers.normalizeDir?.(
        (cur.x * (1 - steer)) + (desired.x * steer),
        (cur.y * (1 - steer)) + (desired.y * steer),
        desired.x,
        desired.y
      ) || desired;
      p.vx = nd.x * 120;
      p.vy = nd.y * 120;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    } else {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    if (p.ttl <= 0 || p.x < -20 || p.y < -20 || p.x > w + 20 || p.y > h + 20) {
      try { p.el?.remove?.(); } catch {}
      state.projectiles.splice(i, 1);
      continue;
    }
    const dx = p.x - state.enemy.x;
    const dy = p.y - state.enemy.y;
    let hitAny = (dx * dx + dy * dy) <= 110;
    if (!hitAny && state.enemyAlt?.el && (state.component?.archetype === 'projectile' && state.component?.variant === 'boomerang')) {
      const dx2 = p.x - state.enemyAlt.x;
      const dy2 = p.y - state.enemyAlt.y;
      hitAny = (dx2 * dx2 + dy2 * dy2) <= 110;
    }
    if (hitAny) {
      helpers.pulseHitFlash?.(state.enemy.el);
      if (state.enemyAlt?.el && (state.component?.archetype === 'projectile' && state.component?.variant === 'boomerang')) {
        const dxMain = p.x - state.enemy.x;
        const dyMain = p.y - state.enemy.y;
        if ((dxMain * dxMain + dyMain * dyMain) > 110) helpers.pulseHitFlash?.(state.enemyAlt.el);
      }
      if (p.kind !== 'boomerang') {
        try { p.el?.remove?.(); } catch {}
        state.projectiles.splice(i, 1);
        continue;
      }
    }
    if (p.kind === 'boomerang') {
      const spin = Number(constants.projectileBoomerangSpinMult) || 1;
      const deg = ((Number(p.boomTheta) || 0) * (180 / Math.PI) * spin) + 180;
      p.el.style.transform = `translate(${p.x.toFixed(2)}px, ${p.y.toFixed(2)}px) rotate(${deg.toFixed(2)}deg)`;
    } else {
      p.el.style.transform = `translate(${p.x.toFixed(2)}px, ${p.y.toFixed(2)}px)`;
    }
  }

  for (let i = state.effects.length - 1; i >= 0; i--) {
    const fx = state.effects[i];
    if (!fx?.el || !fx.el.isConnected) {
      state.effects.splice(i, 1);
      continue;
    }
    fx.ttl -= dt;
    if (fx.ttl <= 0) {
      try { fx.el?.remove?.(); } catch {}
      state.effects.splice(i, 1);
      continue;
    }
    if (fx.kind === 'laser' || fx.kind === 'beam') {
      const from = fx.from || state.ship;
      const to = fx.to || state.enemy;
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const len = Math.max(1, Math.hypot(dx, dy));
      const ang = Math.atan2(dy, dx) * (180 / Math.PI);
      fx.el.style.width = `${len.toFixed(2)}px`;
      fx.el.style.transform = `translate(${from.x.toFixed(2)}px, ${from.y.toFixed(2)}px) rotate(${ang.toFixed(2)}deg)`;
      fx.el.style.opacity = fx.kind === 'beam' ? '1' : `${Math.max(0.15, Math.min(1, fx.ttl / 0.2)).toFixed(3)}`;
    } else {
      const r = Math.max(8, Number(fx.radius) || 14);
      fx.el.style.width = `${(r * 2).toFixed(2)}px`;
      fx.el.style.height = `${(r * 2).toFixed(2)}px`;
      fx.el.style.marginLeft = `${(-r).toFixed(2)}px`;
      fx.el.style.marginTop = `${(-r).toFixed(2)}px`;
      fx.el.style.transform = `translate(${(fx.at?.x || state.enemy.x).toFixed(2)}px, ${(fx.at?.y || state.enemy.y).toFixed(2)}px)`;
      fx.el.style.opacity = `${Math.max(0.1, Math.min(1, fx.ttl / 0.24)).toFixed(3)}`;
    }
  }

  state.beatTimer += dt;
  const beatLen = Math.max(0.32, (Number(helpers.getPausePreviewBeatLen?.() || 0.5) * 0.9));
  while (state.beatTimer >= beatLen) {
    state.beatTimer -= beatLen;
    fireComponentLivePreviewRuntime({ state, constants, helpers });
  }
}
