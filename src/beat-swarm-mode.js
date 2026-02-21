import { getZoomState } from './zoom/ZoomCoordinator.js';
import { screenToWorld, worldToScreen } from './board-viewport.js';
import { createBeatSwarmSpawnerRuntime, registerLoopgridSpawnerType } from './beat-swarm/spawner-runtime.js';
import { getLoopInfo, isRunning } from './audio-core.js';

const OVERLAY_ID = 'beat-swarm-overlay';

// Beat Swarm movement tuning.
const SWARM_MAX_SPEED = 920; // px/sec
const SWARM_ACCEL = 2100; // px/sec^2
const SWARM_DECEL = 2.8; // release damping
const SWARM_TURN_WEIGHT = 0.35; // lower = heavier directional change
const SWARM_JOYSTICK_RADIUS = 70; // px
const SWARM_STOP_EPS = 8; // px/sec

let active = false;
let overlayEl = null;
let exitBtn = null;
let joystickEl = null;
let joystickKnobEl = null;
let spawnerLayerEl = null;
let enemyLayerEl = null;

let dragPointerId = null;
let dragStartX = 0;
let dragStartY = 0;
let dragNowX = 0;
let dragNowY = 0;

let velocityX = 0;
let velocityY = 0;
let shipFacingDeg = 0;
const enemies = [];
const pickups = [];
const projectiles = [];
const effects = [];
const ENEMY_CAP = 120;
const ENEMY_ACCEL = 680;
const ENEMY_MAX_SPEED = 260;
const ENEMY_HIT_RADIUS = 20;
const PICKUP_COLLECT_RADIUS_PX = 46;
const PROJECTILE_SPEED = 1100;
const PROJECTILE_HIT_RADIUS_PX = 24;
const PROJECTILE_LIFETIME = 1.1;
const LASER_TTL = 0.12;
const EXPLOSION_TTL = 0.22;
const EXPLOSION_RADIUS_WORLD = 220;
const weaponDefs = Object.freeze({
  laser: { id: 'laser', damage: 2 },
  projectile: { id: 'projectile', damage: 2 },
  explosion: { id: 'explosion', damage: 1 },
});
const equippedWeapons = new Set();
let lastBeatIndex = null;
let spawnerRuntime = null;
const difficultyConfig = Object.seal({
  initialEnabledSpawnerCount: 1,
  enemySpeedMultiplier: 0.5,
  enemyHealth: 2,
});

let rafId = 0;
let lastFrameTs = 0;

function ensureUi() {
  if (overlayEl && exitBtn) return;
  overlayEl = document.getElementById(OVERLAY_ID);
  if (!overlayEl) {
    overlayEl = document.createElement('div');
    overlayEl.id = OVERLAY_ID;
    overlayEl.className = 'beat-swarm-overlay';
    overlayEl.hidden = true;
    overlayEl.innerHTML = `
      <div class="beat-swarm-ship-wrap" aria-hidden="true">
        <div class="beat-swarm-ship"></div>
      </div>
      <div class="beat-swarm-spawner-layer" aria-hidden="true"></div>
      <div class="beat-swarm-enemy-layer" aria-hidden="true"></div>
      <div class="beat-swarm-joystick" aria-hidden="true">
        <div class="beat-swarm-joystick-knob"></div>
      </div>
    `;
    document.body.appendChild(overlayEl);
  }
  spawnerLayerEl = overlayEl.querySelector('.beat-swarm-spawner-layer');
  enemyLayerEl = overlayEl.querySelector('.beat-swarm-enemy-layer');
  joystickEl = overlayEl.querySelector('.beat-swarm-joystick');
  joystickKnobEl = overlayEl.querySelector('.beat-swarm-joystick-knob');
  if (!spawnerRuntime) {
    spawnerRuntime = createBeatSwarmSpawnerRuntime({
      getLayerEl: () => spawnerLayerEl,
      onSpawn: ({ point }) => {
        if (!point) return;
        spawnEnemyAt(point.x, point.y);
      },
    });
    registerLoopgridSpawnerType(spawnerRuntime);
  }

  exitBtn = document.getElementById('beat-swarm-exit');
  if (!exitBtn) {
    exitBtn = document.createElement('button');
    exitBtn.id = 'beat-swarm-exit';
    exitBtn.type = 'button';
    exitBtn.className = 'c-btn beat-swarm-exit';
    exitBtn.setAttribute('aria-label', 'Exit Beat Swarm');
    exitBtn.title = 'Exit Beat Swarm';
    exitBtn.innerHTML = '<div class="c-btn-outer"></div><div class="c-btn-glow"></div><div class="c-btn-core"></div>';
    const core = exitBtn.querySelector('.c-btn-core');
    if (core) core.style.setProperty('--c-btn-icon-url', "url('./assets/UI/T_ButtonExit.png')");
    exitBtn.addEventListener('click', () => exitBeatSwarmMode());
    document.body.appendChild(exitBtn);
  }
}

function applyCameraDelta(dx, dy) {
  const z = getZoomState();
  const s = Number.isFinite(z?.targetScale) ? z.targetScale : (Number.isFinite(z?.currentScale) ? z.currentScale : 1);
  const x = Number.isFinite(z?.targetX) ? z.targetX : (Number.isFinite(z?.currentX) ? z.currentX : 0);
  const y = Number.isFinite(z?.targetY) ? z.targetY : (Number.isFinite(z?.currentY) ? z.currentY : 0);
  const nextX = x - dx;
  const nextY = y - dy;
  try { window.__setBoardViewportNow?.(s, nextX, nextY); } catch {}
}

function getViewportCenterClient() {
  return { x: window.innerWidth * 0.5, y: window.innerHeight * 0.5 };
}

function getViewportCenterWorld() {
  const c = getViewportCenterClient();
  const w = screenToWorld({ x: c.x, y: c.y });
  return (w && Number.isFinite(w.x) && Number.isFinite(w.y)) ? w : { x: 0, y: 0 };
}

function removeEnemy(enemy) {
  if (!enemy) return;
  try { enemy.el?.remove?.(); } catch {}
}

function updateEnemyHealthUi(enemy) {
  if (!enemy?.hpFillEl || !Number.isFinite(enemy.hp) || !Number.isFinite(enemy.maxHp)) return;
  const t = Math.max(0, Math.min(1, enemy.hp / Math.max(1, enemy.maxHp)));
  enemy.hpFillEl.style.transform = `scaleX(${t.toFixed(4)})`;
}

function damageEnemy(enemy, amount = 1) {
  if (!enemy || !Number.isFinite(enemy.hp)) return false;
  enemy.hp -= Math.max(0, Number(amount) || 0);
  updateEnemyHealthUi(enemy);
  if (enemy.hp <= 0) {
    const idx = enemies.indexOf(enemy);
    if (idx >= 0) enemies.splice(idx, 1);
    removeEnemy(enemy);
    return true;
  }
  return false;
}

function clearEnemies() {
  while (enemies.length) {
    removeEnemy(enemies.pop());
  }
}

function clearPickups() {
  while (pickups.length) {
    const p = pickups.pop();
    try { p?.el?.remove?.(); } catch {}
  }
}

function clearProjectiles() {
  while (projectiles.length) {
    const p = projectiles.pop();
    try { p?.el?.remove?.(); } catch {}
  }
}

function clearEffects() {
  while (effects.length) {
    const e = effects.pop();
    try { e?.el?.remove?.(); } catch {}
  }
}

function spawnEnemyAt(clientX, clientY) {
  if (!enemyLayerEl) return;
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return;
  const w = screenToWorld({ x: clientX, y: clientY });
  if (!w || !Number.isFinite(w.x) || !Number.isFinite(w.y)) return;
  if (enemies.length >= ENEMY_CAP) {
    const old = enemies.shift();
    removeEnemy(old);
  }
  const el = document.createElement('div');
  el.className = 'beat-swarm-enemy';
  const hpWrap = document.createElement('div');
  hpWrap.className = 'beat-swarm-enemy-hp';
  const hpFill = document.createElement('div');
  hpFill.className = 'beat-swarm-enemy-hp-fill';
  hpWrap.appendChild(hpFill);
  el.appendChild(hpWrap);
  enemyLayerEl.appendChild(el);
  enemies.push({
    wx: w.x,
    wy: w.y,
    vx: 0,
    vy: 0,
    el,
    hp: Math.max(1, Number(difficultyConfig.enemyHealth) || 1),
    maxHp: Math.max(1, Number(difficultyConfig.enemyHealth) || 1),
    hpFillEl: hpFill,
  });
}

function getNearestEnemy(worldX, worldY) {
  let best = null;
  let bestD2 = Infinity;
  for (const e of enemies) {
    const dx = (e.wx - worldX);
    const dy = (e.wy - worldY);
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = e;
    }
  }
  return best;
}

function spawnPickup(weaponId, worldX, worldY) {
  if (!enemyLayerEl || !weaponDefs[weaponId]) return;
  const el = document.createElement('div');
  el.className = `beat-swarm-pickup is-${weaponId}`;
  el.setAttribute('data-weapon', weaponId);
  enemyLayerEl.appendChild(el);
  pickups.push({ weaponId, wx: worldX, wy: worldY, el });
}

function spawnStarterPickups(centerWorld) {
  clearPickups();
  equippedWeapons.clear();
  const c = centerWorld || { x: 0, y: 0 };
  spawnPickup('laser', c.x - 170, c.y - 90);
  spawnPickup('projectile', c.x + 170, c.y - 90);
  spawnPickup('explosion', c.x, c.y - 190);
}

function addLaserEffect(fromW, toW) {
  if (!enemyLayerEl) return;
  const el = document.createElement('div');
  el.className = 'beat-swarm-fx-laser';
  enemyLayerEl.appendChild(el);
  effects.push({ kind: 'laser', ttl: LASER_TTL, from: { ...fromW }, to: { ...toW }, el });
}

function addExplosionEffect(centerW) {
  if (!enemyLayerEl) return;
  const el = document.createElement('div');
  el.className = 'beat-swarm-fx-explosion';
  enemyLayerEl.appendChild(el);
  effects.push({ kind: 'explosion', ttl: EXPLOSION_TTL, at: { ...centerW }, el });
}

function spawnProjectile(fromW, toEnemy, damage) {
  if (!enemyLayerEl || !toEnemy) return;
  const el = document.createElement('div');
  el.className = 'beat-swarm-projectile';
  enemyLayerEl.appendChild(el);
  const dx = toEnemy.wx - fromW.x;
  const dy = toEnemy.wy - fromW.y;
  const len = Math.max(0.0001, Math.hypot(dx, dy));
  projectiles.push({
    wx: fromW.x,
    wy: fromW.y,
    vx: (dx / len) * PROJECTILE_SPEED,
    vy: (dy / len) * PROJECTILE_SPEED,
    ttl: PROJECTILE_LIFETIME,
    damage: Math.max(1, Number(damage) || 1),
    el,
  });
}

function fireWeaponsOnBeat(centerWorld) {
  if (!centerWorld) return;
  if (equippedWeapons.has('explosion')) {
    addExplosionEffect(centerWorld);
    const r2 = EXPLOSION_RADIUS_WORLD * EXPLOSION_RADIUS_WORLD;
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      const dx = e.wx - centerWorld.x;
      const dy = e.wy - centerWorld.y;
      if ((dx * dx + dy * dy) <= r2) damageEnemy(e, weaponDefs.explosion.damage);
    }
  }
  const target = getNearestEnemy(centerWorld.x, centerWorld.y);
  if (!target) return;
  if (equippedWeapons.has('laser')) {
    addLaserEffect(centerWorld, { x: target.wx, y: target.wy });
    damageEnemy(target, weaponDefs.laser.damage);
  }
  if (equippedWeapons.has('projectile')) {
    spawnProjectile(centerWorld, target, weaponDefs.projectile.damage);
  }
}

function updateBeatWeapons(centerWorld) {
  if (!isRunning?.()) {
    lastBeatIndex = null;
    return;
  }
  const info = getLoopInfo?.();
  const beatLen = Number(info?.beatLen) || 0;
  const loopStart = Number(info?.loopStartTime) || 0;
  const now = Number(info?.now) || 0;
  if (!(beatLen > 0)) return;
  const beatIndex = Math.floor(((now - loopStart) / beatLen) + 1e-6);
  if (beatIndex === lastBeatIndex) return;
  lastBeatIndex = beatIndex;
  fireWeaponsOnBeat(centerWorld);
}

function configureInitialSpawnerEnablement() {
  const count = Math.max(0, Math.trunc(Number(difficultyConfig.initialEnabledSpawnerCount) || 0));
  if (!spawnerRuntime?.setEnabled) return;
  let enabledSoFar = 0;
  spawnerRuntime.setEnabled((entry) => {
    if (entry?.type !== 'loopgrid') return true;
    if (!entry?.state?.hasContent) return false;
    const on = enabledSoFar < count;
    if (on) enabledSoFar += 1;
    return on;
  });
}

function updateEnemies(dt) {
  if (!enemies.length) return;
  const centerWorld = getViewportCenterWorld();
  const z = getZoomState();
  const scale = Number.isFinite(z?.targetScale) ? z.targetScale : (Number.isFinite(z?.currentScale) ? z.currentScale : 1);
  const hitRadiusWorld = ENEMY_HIT_RADIUS / Math.max(0.001, scale || 1);
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    const dx = centerWorld.x - e.wx;
    const dy = centerWorld.y - e.wy;
    const d = Math.hypot(dx, dy) || 0.0001;
    const speedMult = Math.max(0.05, Number(difficultyConfig.enemySpeedMultiplier) || 1);
    const ax = (dx / d) * ENEMY_ACCEL * speedMult;
    const ay = (dy / d) * ENEMY_ACCEL * speedMult;
    e.vx += ax * dt;
    e.vy += ay * dt;
    const speed = Math.hypot(e.vx, e.vy);
    const maxSpeed = ENEMY_MAX_SPEED * speedMult;
    if (speed > maxSpeed) {
      const k = maxSpeed / speed;
      e.vx *= k;
      e.vy *= k;
    }
    e.wx += e.vx * dt;
    e.wy += e.vy * dt;
    if (d <= hitRadiusWorld) {
      removeEnemy(e);
      enemies.splice(i, 1);
      continue;
    }
    const s = worldToScreen({ x: e.wx, y: e.wy });
    if (!s || !Number.isFinite(s.x) || !Number.isFinite(s.y)) {
      removeEnemy(e);
      enemies.splice(i, 1);
      continue;
    }
    if (s.x < -80 || s.y < -80 || s.x > window.innerWidth + 80 || s.y > window.innerHeight + 80) {
      removeEnemy(e);
      enemies.splice(i, 1);
      continue;
    }
    if (e.el) {
      e.el.style.transform = `translate(${s.x}px, ${s.y}px)`;
    }
  }
}

function updatePickupsAndCombat(dt) {
  const centerWorld = getViewportCenterWorld();
  const z = getZoomState();
  const scale = Number.isFinite(z?.targetScale) ? z.targetScale : (Number.isFinite(z?.currentScale) ? z.currentScale : 1);
  const collectRadiusWorld = PICKUP_COLLECT_RADIUS_PX / Math.max(0.001, scale || 1);
  const projectileHitRadiusWorld = PROJECTILE_HIT_RADIUS_PX / Math.max(0.001, scale || 1);
  const cr2 = collectRadiusWorld * collectRadiusWorld;
  const pr2 = projectileHitRadiusWorld * projectileHitRadiusWorld;

  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    const dx = p.wx - centerWorld.x;
    const dy = p.wy - centerWorld.y;
    if ((dx * dx + dy * dy) <= cr2) {
      equippedWeapons.add(p.weaponId);
      try { p.el?.remove?.(); } catch {}
      pickups.splice(i, 1);
      continue;
    }
    const s = worldToScreen({ x: p.wx, y: p.wy });
    if (!s || !Number.isFinite(s.x) || !Number.isFinite(s.y)) continue;
    p.el.style.transform = `translate(${s.x}px, ${s.y}px)`;
  }

  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.ttl -= dt;
    p.wx += p.vx * dt;
    p.wy += p.vy * dt;
    let hit = false;
    for (let j = enemies.length - 1; j >= 0; j--) {
      const e = enemies[j];
      const dx = e.wx - p.wx;
      const dy = e.wy - p.wy;
      if ((dx * dx + dy * dy) <= pr2) {
        damageEnemy(e, p.damage);
        hit = true;
        break;
      }
    }
    if (hit || p.ttl <= 0) {
      try { p.el?.remove?.(); } catch {}
      projectiles.splice(i, 1);
      continue;
    }
    const s = worldToScreen({ x: p.wx, y: p.wy });
    if (!s || !Number.isFinite(s.x) || !Number.isFinite(s.y)) {
      try { p.el?.remove?.(); } catch {}
      projectiles.splice(i, 1);
      continue;
    }
    p.el.style.transform = `translate(${s.x}px, ${s.y}px)`;
  }

  for (let i = effects.length - 1; i >= 0; i--) {
    const fx = effects[i];
    fx.ttl -= dt;
    if (fx.ttl <= 0) {
      try { fx.el?.remove?.(); } catch {}
      effects.splice(i, 1);
      continue;
    }
    if (fx.kind === 'laser') {
      const a = worldToScreen({ x: fx.from.x, y: fx.from.y });
      const b = worldToScreen({ x: fx.to.x, y: fx.to.y });
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.max(1, Math.hypot(dx, dy));
      const ang = Math.atan2(dy, dx) * (180 / Math.PI);
      fx.el.style.width = `${len}px`;
      fx.el.style.transform = `translate(${a.x}px, ${a.y}px) rotate(${ang}deg)`;
      fx.el.style.opacity = `${Math.max(0, Math.min(1, fx.ttl / LASER_TTL))}`;
    } else if (fx.kind === 'explosion') {
      const c = worldToScreen({ x: fx.at.x, y: fx.at.y });
      if (!c) continue;
      fx.el.style.transform = `translate(${c.x}px, ${c.y}px)`;
      fx.el.style.opacity = `${Math.max(0, Math.min(1, fx.ttl / EXPLOSION_TTL))}`;
    }
  }

  updateBeatWeapons(centerWorld);
}

function setJoystickVisible(show) {
  if (!joystickEl) return;
  joystickEl.classList.toggle('is-visible', !!show);
}

function setJoystickCenter(x, y) {
  if (!joystickEl) return;
  joystickEl.style.left = `${x}px`;
  joystickEl.style.top = `${y}px`;
}

function setJoystickKnob(dx, dy) {
  if (!joystickKnobEl) return;
  joystickKnobEl.style.transform = `translate(${dx}px, ${dy}px)`;
}

function getInputVector() {
  if (dragPointerId == null) return { x: 0, y: 0, mag: 0 };
  let dx = dragNowX - dragStartX;
  let dy = dragNowY - dragStartY;
  const len = Math.hypot(dx, dy) || 0;
  if (len <= 0.0001) return { x: 0, y: 0, mag: 0 };
  const clamped = Math.min(SWARM_JOYSTICK_RADIUS, len);
  const nx = dx / len;
  const ny = dy / len;
  dx = nx * clamped;
  dy = ny * clamped;
  setJoystickKnob(dx, dy);
  return { x: nx, y: ny, mag: clamped / SWARM_JOYSTICK_RADIUS };
}

function updateShipFacing(dt, inputX, inputY) {
  const speed = Math.hypot(velocityX, velocityY);
  let targetDeg = shipFacingDeg;
  if (speed > 14) {
    targetDeg = (Math.atan2(velocityY, velocityX) * 180 / Math.PI) + 90;
  } else if (dragPointerId != null && (Math.abs(inputX) > 0.001 || Math.abs(inputY) > 0.001)) {
    targetDeg = (Math.atan2(inputY, inputX) * 180 / Math.PI) + 90;
  }
  const wrap = (d) => {
    let v = d;
    while (v > 180) v -= 360;
    while (v < -180) v += 360;
    return v;
  };
  const delta = wrap(targetDeg - shipFacingDeg);
  const turnRate = 10 * Math.max(0.0001, dt);
  shipFacingDeg += delta * Math.min(1, turnRate);
  const ship = overlayEl?.querySelector('.beat-swarm-ship');
  if (ship) ship.style.transform = `rotate(${shipFacingDeg.toFixed(2)}deg)`;
}

function tick(nowMs) {
  if (!active) return;
  const now = Number(nowMs) || performance.now();
  if (!lastFrameTs) lastFrameTs = now;
  const dt = Math.max(0.001, Math.min(0.05, (now - lastFrameTs) / 1000));
  lastFrameTs = now;

  const input = getInputVector();
  if (input.mag > 0.0001) {
    const targetVx = input.x * SWARM_MAX_SPEED * input.mag;
    const targetVy = input.y * SWARM_MAX_SPEED * input.mag;
    let steerX = targetVx - velocityX;
    let steerY = targetVy - velocityY;
    const steerLen = Math.hypot(steerX, steerY) || 0;
    const maxDelta = SWARM_ACCEL * dt;
    if (steerLen > maxDelta) {
      const k = maxDelta / steerLen;
      steerX *= k;
      steerY *= k;
    }
    velocityX += steerX * SWARM_TURN_WEIGHT + steerX * (1 - SWARM_TURN_WEIGHT) * input.mag;
    velocityY += steerY * SWARM_TURN_WEIGHT + steerY * (1 - SWARM_TURN_WEIGHT) * input.mag;
  } else {
    const decay = Math.exp(-SWARM_DECEL * dt);
    velocityX *= decay;
    velocityY *= decay;
    if (Math.hypot(velocityX, velocityY) < SWARM_STOP_EPS) {
      velocityX = 0;
      velocityY = 0;
    }
  }

  const speed = Math.hypot(velocityX, velocityY);
  if (speed > SWARM_MAX_SPEED) {
    const k = SWARM_MAX_SPEED / speed;
    velocityX *= k;
    velocityY *= k;
  }
  if (speed > 0.01) {
    applyCameraDelta(velocityX * dt, velocityY * dt);
  }
  updateEnemies(dt);
  updatePickupsAndCombat(dt);
  try { spawnerRuntime?.update?.(dt); } catch {}
  updateShipFacing(dt, input.x, input.y);
  rafId = requestAnimationFrame(tick);
}

function startTick() {
  if (rafId) return;
  lastFrameTs = 0;
  rafId = requestAnimationFrame(tick);
}

function stopTick() {
  if (!rafId) return;
  cancelAnimationFrame(rafId);
  rafId = 0;
  lastFrameTs = 0;
}

function onPointerDown(ev) {
  if (!active) return;
  if (ev.button != null && ev.button !== 0) return;
  dragPointerId = ev.pointerId;
  dragStartX = ev.clientX;
  dragStartY = ev.clientY;
  dragNowX = ev.clientX;
  dragNowY = ev.clientY;
  setJoystickCenter(dragStartX, dragStartY);
  setJoystickKnob(0, 0);
  setJoystickVisible(true);
  try { overlayEl?.setPointerCapture?.(dragPointerId); } catch {}
  ev.preventDefault();
}

function onPointerMove(ev) {
  if (!active) return;
  if (dragPointerId == null || ev.pointerId !== dragPointerId) return;
  dragNowX = ev.clientX;
  dragNowY = ev.clientY;
  ev.preventDefault();
}

function onPointerUp(ev) {
  if (!active) return;
  if (dragPointerId == null || ev.pointerId !== dragPointerId) return;
  try { overlayEl?.releasePointerCapture?.(dragPointerId); } catch {}
  dragPointerId = null;
  setJoystickVisible(false);
  ev.preventDefault();
}

function onWheel(ev) {
  if (!active) return;
  ev.preventDefault();
  ev.stopPropagation();
}

function bindInput() {
  overlayEl?.addEventListener('pointerdown', onPointerDown, { passive: false });
  overlayEl?.addEventListener('pointermove', onPointerMove, { passive: false });
  overlayEl?.addEventListener('pointerup', onPointerUp, { passive: false });
  overlayEl?.addEventListener('pointercancel', onPointerUp, { passive: false });
  window.addEventListener('wheel', onWheel, { passive: false, capture: true });
}

function unbindInput() {
  overlayEl?.removeEventListener('pointerdown', onPointerDown);
  overlayEl?.removeEventListener('pointermove', onPointerMove);
  overlayEl?.removeEventListener('pointerup', onPointerUp);
  overlayEl?.removeEventListener('pointercancel', onPointerUp);
  window.removeEventListener('wheel', onWheel, { capture: true });
}

export function enterBeatSwarmMode() {
  if (active) return true;
  ensureUi();
  active = true;
  dragPointerId = null;
  velocityX = 0;
  velocityY = 0;
  window.__beatSwarmActive = true;
  document.body.classList.add('beat-swarm-active');
  try { window.ToySpawner?.close?.(); } catch {}
  if (overlayEl) overlayEl.hidden = false;
  if (exitBtn) exitBtn.hidden = false;
  if (spawnerLayerEl) spawnerLayerEl.hidden = false;
  if (enemyLayerEl) enemyLayerEl.hidden = false;
  setJoystickVisible(false);
  clearEnemies();
  clearPickups();
  clearProjectiles();
  clearEffects();
  spawnStarterPickups(getViewportCenterWorld());
  lastBeatIndex = null;
  try { spawnerRuntime?.enter?.(); } catch {}
  try { configureInitialSpawnerEnablement(); } catch {}
  bindInput();
  startTick();
  try { window.__MT_ANCHOR?.center?.(); } catch {}
  return true;
}

export function exitBeatSwarmMode() {
  if (!active) return true;
  active = false;
  dragPointerId = null;
  velocityX = 0;
  velocityY = 0;
  window.__beatSwarmActive = false;
  document.body.classList.remove('beat-swarm-active');
  if (overlayEl) overlayEl.hidden = true;
  if (exitBtn) exitBtn.hidden = true;
  if (spawnerLayerEl) spawnerLayerEl.hidden = true;
  if (enemyLayerEl) enemyLayerEl.hidden = true;
  setJoystickVisible(false);
  stopTick();
  unbindInput();
  try { spawnerRuntime?.exit?.(); } catch {}
  clearEnemies();
  clearPickups();
  clearProjectiles();
  clearEffects();
  equippedWeapons.clear();
  lastBeatIndex = null;
  return true;
}

export function isBeatSwarmModeActive() {
  return !!active;
}

export const BeatSwarmMode = {
  enter: enterBeatSwarmMode,
  exit: exitBeatSwarmMode,
  isActive: isBeatSwarmModeActive,
};

try {
  window.BeatSwarmMode = Object.assign(window.BeatSwarmMode || {}, BeatSwarmMode);
} catch {}
