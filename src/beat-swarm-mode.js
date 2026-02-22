import { getZoomState } from './zoom/ZoomCoordinator.js';
import { screenToWorld, worldToScreen } from './board-viewport.js';
import { createBeatSwarmSpawnerRuntime, registerLoopgridSpawnerType } from './beat-swarm/spawner-runtime.js';
import { getLoopInfo, isRunning, start as startTransport } from './audio-core.js';

const OVERLAY_ID = 'beat-swarm-overlay';
const BEAT_SWARM_STATE_KEY = 'mt.beatSwarm.state.v1';

// Beat Swarm movement tuning.
const SWARM_MAX_SPEED = 920; // px/sec
const SWARM_ACCEL = 2100; // px/sec^2
const SWARM_DECEL = 2.8; // release damping
const SWARM_TURN_WEIGHT = 0.35; // lower = heavier directional change
const SWARM_JOYSTICK_RADIUS = 70; // px
const SWARM_STOP_EPS = 8; // px/sec
const SWARM_CAMERA_TARGET_SCALE = 0.5; // smaller = further out
const SWARM_ARENA_RADIUS_WORLD = 1100;
const SWARM_ARENA_RESIST_RANGE_WORLD = SWARM_ARENA_RADIUS_WORLD * 0.25; // reduced outer band by half
const SWARM_ARENA_INWARD_ACCEL_WORLD = 380;
const SWARM_ARENA_OUTWARD_BRAKE_WORLD = 1800;
const SWARM_ARENA_OUTWARD_CANCEL_WORLD = 2400;
const SWARM_ARENA_EDGE_BRAKE_WORLD = 3400;
const SWARM_ARENA_OUTER_SOFT_BUFFER_WORLD = 120;
const SWARM_ARENA_RUBBER_K_WORLD = 7.5;
const SWARM_ARENA_RUBBER_DAMP_LINEAR = 2.1;
const SWARM_ARENA_RUBBER_DAMP_QUAD = 0.0028;
const SWARM_ARENA_SLINGSHOT_IMPULSE = 860;
const SWARM_RELEASE_POST_FIRE_BORDER_SCALE = 0.2;
const SWARM_RELEASE_POST_FIRE_DURATION = 0.55;
const SWARM_RELEASE_BEAT_LEVEL_MAX = 3; // three pip levels
const SWARM_RELEASE_MULTIPLIER_BASE = 2.0; // doubled default force
const SWARM_RELEASE_MULTIPLIER_AT_MAX = 31.0; // keep level-3 feel
const SWARM_RELEASE_POST_FIRE_SPEED_SCALE = 1.8; // extra max-speed scale per beat level during launch assist
const SWARM_RELEASE_BOUNCE_RESTITUTION = 0.9;
const SWARM_RELEASE_BOUNCE_MIN_SPEED = 180;

let active = false;
let overlayEl = null;
let exitBtn = null;
let joystickEl = null;
let joystickKnobEl = null;
let resistanceEl = null;
let reactiveArrowEl = null;
let thrustFxEl = null;
let spawnerLayerEl = null;
let enemyLayerEl = null;
let arenaRingEl = null;
let arenaCoreEl = null;
let arenaLimitEl = null;
let arenaCenterWorld = null;
let barrierPushingOut = false;
let barrierPushCharge = 0;
let releaseBeatLevel = 0;
let lastLaunchBeatLevel = 0;
let postReleaseAssistTimer = 0;
let outerForceContinuousSeconds = 0;
let releaseForcePrimed = false;

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
const ENEMY_SPAWN_START_SCALE = 0.2;
const ENEMY_SPAWN_DURATION = 0.58;
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

function safeSessionStorage() {
  try { return window.sessionStorage; } catch { return null; }
}

function captureBeatSwarmState() {
  const z = getZoomState();
  const scale = Number.isFinite(z?.targetScale) ? z.targetScale : (Number.isFinite(z?.currentScale) ? z.currentScale : 1);
  const x = Number.isFinite(z?.targetX) ? z.targetX : (Number.isFinite(z?.currentX) ? z.currentX : 0);
  const y = Number.isFinite(z?.targetY) ? z.targetY : (Number.isFinite(z?.currentY) ? z.currentY : 0);
  return {
    active: !!active,
    viewport: { scale, x, y },
    velocity: { x: velocityX, y: velocityY },
    shipFacingDeg,
    releaseBeatLevel,
    lastLaunchBeatLevel,
    postReleaseAssistTimer,
    outerForceContinuousSeconds,
    releaseForcePrimed,
    arenaCenterWorld: arenaCenterWorld ? { x: arenaCenterWorld.x, y: arenaCenterWorld.y } : null,
    equippedWeapons: Array.from(equippedWeapons),
    enemies: enemies.map((e) => ({
      wx: Number(e.wx) || 0,
      wy: Number(e.wy) || 0,
      vx: Number(e.vx) || 0,
      vy: Number(e.vy) || 0,
      hp: Number(e.hp) || 1,
      maxHp: Number(e.maxHp) || 1,
      spawnT: Number(e.spawnT) || 0,
      spawnDur: Number(e.spawnDur) || ENEMY_SPAWN_DURATION,
    })),
    pickups: pickups.map((p) => ({
      weaponId: p.weaponId,
      wx: Number(p.wx) || 0,
      wy: Number(p.wy) || 0,
    })),
    projectiles: projectiles.map((p) => ({
      wx: Number(p.wx) || 0,
      wy: Number(p.wy) || 0,
      vx: Number(p.vx) || 0,
      vy: Number(p.vy) || 0,
      ttl: Number(p.ttl) || 0,
      damage: Number(p.damage) || 1,
    })),
    effects: effects.map((fx) => ({
      kind: fx.kind,
      ttl: Number(fx.ttl) || 0,
      from: fx.from ? { x: Number(fx.from.x) || 0, y: Number(fx.from.y) || 0 } : null,
      to: fx.to ? { x: Number(fx.to.x) || 0, y: Number(fx.to.y) || 0 } : null,
      at: fx.at ? { x: Number(fx.at.x) || 0, y: Number(fx.at.y) || 0 } : null,
      radiusWorld: Number(fx.radiusWorld) || EXPLOSION_RADIUS_WORLD,
    })),
  };
}

function persistBeatSwarmState() {
  const ss = safeSessionStorage();
  if (!ss) return;
  try { ss.setItem(BEAT_SWARM_STATE_KEY, JSON.stringify(captureBeatSwarmState())); } catch {}
}

function clearBeatSwarmPersistedState() {
  const ss = safeSessionStorage();
  if (!ss) return;
  try { ss.removeItem(BEAT_SWARM_STATE_KEY); } catch {}
}

function consumeBeatSwarmPersistedState() {
  const ss = safeSessionStorage();
  if (!ss) return null;
  try {
    const raw = ss.getItem(BEAT_SWARM_STATE_KEY);
    if (!raw) return null;
    ss.removeItem(BEAT_SWARM_STATE_KEY);
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function spawnEnemyFromState(state) {
  if (!enemyLayerEl || !state) return;
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
  const e = {
    wx: Number(state.wx) || 0,
    wy: Number(state.wy) || 0,
    vx: Number(state.vx) || 0,
    vy: Number(state.vy) || 0,
    el,
    hp: Math.max(1, Number(state.hp) || 1),
    maxHp: Math.max(1, Number(state.maxHp) || 1),
    hpFillEl: hpFill,
    spawnT: Math.max(0, Number(state.spawnT) || 0),
    spawnDur: Math.max(0.001, Number(state.spawnDur) || ENEMY_SPAWN_DURATION),
  };
  enemies.push(e);
  updateEnemyHealthUi(e);
}

function restoreBeatSwarmState(state) {
  if (!state || typeof state !== 'object') return;
  const vp = state.viewport;
  if (vp && Number.isFinite(vp.scale) && Number.isFinite(vp.x) && Number.isFinite(vp.y)) {
    try { window.__setBoardViewportNow?.(vp.scale, vp.x, vp.y); } catch {}
  }
  velocityX = Number(state?.velocity?.x) || 0;
  velocityY = Number(state?.velocity?.y) || 0;
  shipFacingDeg = Number(state.shipFacingDeg) || 0;
  barrierPushingOut = false;
  barrierPushCharge = 0;
  releaseBeatLevel = Math.max(0, Math.min(SWARM_RELEASE_BEAT_LEVEL_MAX, Math.floor(Number(state.releaseBeatLevel) || 0)));
  lastLaunchBeatLevel = Math.max(0, Math.min(SWARM_RELEASE_BEAT_LEVEL_MAX, Math.floor(Number(state.lastLaunchBeatLevel) || 0)));
  postReleaseAssistTimer = Math.max(0, Number(state.postReleaseAssistTimer) || 0);
  outerForceContinuousSeconds = Math.max(0, Number(state.outerForceContinuousSeconds) || 0);
  releaseForcePrimed = !!state.releaseForcePrimed;
  arenaCenterWorld = state.arenaCenterWorld
    ? { x: Number(state.arenaCenterWorld.x) || 0, y: Number(state.arenaCenterWorld.y) || 0 }
    : getViewportCenterWorld();

  equippedWeapons.clear();
  for (const id of Array.isArray(state.equippedWeapons) ? state.equippedWeapons : []) {
    if (weaponDefs[id]) equippedWeapons.add(id);
  }

  clearEnemies();
  clearPickups();
  clearProjectiles();
  clearEffects();

  for (const e of Array.isArray(state.enemies) ? state.enemies : []) {
    spawnEnemyFromState(e);
  }
  for (const p of Array.isArray(state.pickups) ? state.pickups : []) {
    if (weaponDefs[p?.weaponId]) {
      spawnPickup(p.weaponId, Number(p.wx) || 0, Number(p.wy) || 0);
    }
  }
  for (const p of Array.isArray(state.projectiles) ? state.projectiles : []) {
    if (!enemyLayerEl) continue;
    const el = document.createElement('div');
    el.className = 'beat-swarm-projectile';
    enemyLayerEl.appendChild(el);
    projectiles.push({
      wx: Number(p.wx) || 0,
      wy: Number(p.wy) || 0,
      vx: Number(p.vx) || 0,
      vy: Number(p.vy) || 0,
      ttl: Math.max(0, Number(p.ttl) || 0),
      damage: Math.max(1, Number(p.damage) || 1),
      el,
    });
  }
  for (const fx of Array.isArray(state.effects) ? state.effects : []) {
    if (!enemyLayerEl || !fx || !fx.kind) continue;
    const el = document.createElement('div');
    if (fx.kind === 'laser') {
      el.className = 'beat-swarm-fx-laser';
      enemyLayerEl.appendChild(el);
      effects.push({
        kind: 'laser',
        ttl: Math.max(0, Number(fx.ttl) || 0),
        from: fx.from ? { x: Number(fx.from.x) || 0, y: Number(fx.from.y) || 0 } : { x: 0, y: 0 },
        to: fx.to ? { x: Number(fx.to.x) || 0, y: Number(fx.to.y) || 0 } : { x: 0, y: 0 },
        el,
      });
    } else if (fx.kind === 'explosion') {
      el.className = 'beat-swarm-fx-explosion';
      enemyLayerEl.appendChild(el);
      effects.push({
        kind: 'explosion',
        ttl: Math.max(0, Number(fx.ttl) || 0),
        at: fx.at ? { x: Number(fx.at.x) || 0, y: Number(fx.at.y) || 0 } : { x: 0, y: 0 },
        radiusWorld: Math.max(1, Number(fx.radiusWorld) || EXPLOSION_RADIUS_WORLD),
        el,
      });
    }
  }
}

function getReleaseBeatMultiplier() {
  const activeLevel = postReleaseAssistTimer > 0 ? lastLaunchBeatLevel : releaseBeatLevel;
  const t = Math.max(0, Math.min(1, activeLevel / Math.max(1, SWARM_RELEASE_BEAT_LEVEL_MAX)));
  return SWARM_RELEASE_MULTIPLIER_BASE + ((SWARM_RELEASE_MULTIPLIER_AT_MAX - SWARM_RELEASE_MULTIPLIER_BASE) * t);
}

function getReleaseSpeedCap() {
  const lvl = Math.max(0, Math.min(SWARM_RELEASE_BEAT_LEVEL_MAX, lastLaunchBeatLevel));
  const scale = 1 + (lvl * SWARM_RELEASE_POST_FIRE_SPEED_SCALE);
  return SWARM_MAX_SPEED * Math.max(1, scale);
}

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
      <div class="beat-swarm-resistance" aria-hidden="true"></div>
      <div class="beat-swarm-reactive-arrow" aria-hidden="true"></div>
      <div class="beat-swarm-thrust-fx" aria-hidden="true"></div>
      <div class="beat-swarm-joystick" aria-hidden="true">
        <div class="beat-swarm-joystick-knob"></div>
      </div>
    `;
    document.body.appendChild(overlayEl);
  }
  spawnerLayerEl = overlayEl.querySelector('.beat-swarm-spawner-layer');
  enemyLayerEl = overlayEl.querySelector('.beat-swarm-enemy-layer');
  resistanceEl = overlayEl.querySelector('.beat-swarm-resistance');
  reactiveArrowEl = overlayEl.querySelector('.beat-swarm-reactive-arrow');
  thrustFxEl = overlayEl.querySelector('.beat-swarm-thrust-fx');
  joystickEl = overlayEl.querySelector('.beat-swarm-joystick');
  joystickKnobEl = overlayEl.querySelector('.beat-swarm-joystick-knob');
  if (!arenaRingEl && enemyLayerEl) {
    arenaRingEl = document.createElement('div');
    arenaRingEl.className = 'beat-swarm-arena-ring';
    enemyLayerEl.appendChild(arenaRingEl);
  }
  if (!arenaCoreEl && enemyLayerEl) {
    arenaCoreEl = document.createElement('div');
    arenaCoreEl.className = 'beat-swarm-arena-core';
    enemyLayerEl.appendChild(arenaCoreEl);
  }
  if (!arenaLimitEl && enemyLayerEl) {
    arenaLimitEl = document.createElement('div');
    arenaLimitEl.className = 'beat-swarm-arena-limit-ring';
    enemyLayerEl.appendChild(arenaLimitEl);
  }
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

function applyBeatSwarmCameraScaleWithRetry() {
  const apply = () => {
    try {
      const z = getZoomState();
      const x = Number.isFinite(z?.targetX) ? z.targetX : (Number.isFinite(z?.currentX) ? z.currentX : 0);
      const y = Number.isFinite(z?.targetY) ? z.targetY : (Number.isFinite(z?.currentY) ? z.currentY : 0);
      const nextScale = Math.max(0.3, Math.min(1, Number(SWARM_CAMERA_TARGET_SCALE) || 0.6));
      window.__setBoardViewportNow?.(nextScale, x, y);
    } catch {}
  };
  apply();
  setTimeout(apply, 140);
  setTimeout(apply, 320);
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
  const s0 = worldToScreen({ x: w.x, y: w.y });
  if (s0 && Number.isFinite(s0.x) && Number.isFinite(s0.y)) {
    el.style.transform = `translate(${s0.x}px, ${s0.y}px) scale(${ENEMY_SPAWN_START_SCALE})`;
  } else {
    el.style.transform = `translate(-9999px, -9999px) scale(${ENEMY_SPAWN_START_SCALE})`;
  }
  enemies.push({
    wx: w.x,
    wy: w.y,
    vx: 0,
    vy: 0,
    el,
    hp: Math.max(1, Number(difficultyConfig.enemyHealth) || 1),
    maxHp: Math.max(1, Number(difficultyConfig.enemyHealth) || 1),
    hpFillEl: hpFill,
    spawnT: 0,
    spawnDur: ENEMY_SPAWN_DURATION,
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

function addExplosionEffect(centerW, radiusWorld = EXPLOSION_RADIUS_WORLD) {
  if (!enemyLayerEl) return;
  const el = document.createElement('div');
  el.className = 'beat-swarm-fx-explosion';
  enemyLayerEl.appendChild(el);
  effects.push({
    kind: 'explosion',
    ttl: EXPLOSION_TTL,
    at: { ...centerW },
    radiusWorld: Math.max(1, Number(radiusWorld) || EXPLOSION_RADIUS_WORLD),
    el,
  });
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
    const blastRadius = Math.max(1, Number(EXPLOSION_RADIUS_WORLD) || 1);
    addExplosionEffect(centerWorld, blastRadius);
    const r2 = blastRadius * blastRadius;
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
  if (active && outerForceContinuousSeconds >= beatLen) {
    if (!releaseForcePrimed) {
      releaseForcePrimed = true;
      barrierPushCharge = 1;
      releaseBeatLevel = 0;
      pulseReactiveArrowCharge();
    } else {
      const nextLevel = Math.min(SWARM_RELEASE_BEAT_LEVEL_MAX, Math.max(0, releaseBeatLevel) + 1);
      if (nextLevel > releaseBeatLevel) {
        releaseBeatLevel = nextLevel;
        pulseReactiveArrowCharge();
      }
    }
  }
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

function getEnemySpawnScale(enemy) {
  const dur = Math.max(0.001, Number(enemy?.spawnDur) || 0.14);
  const t = Math.max(0, Math.min(1, (Number(enemy?.spawnT) || 0) / dur));
  if (t <= 0.72) {
    const u = t / 0.72;
    const eased = 1 - Math.pow(1 - u, 3);
    return ENEMY_SPAWN_START_SCALE + ((1.1 - ENEMY_SPAWN_START_SCALE) * eased); // 0.2 -> 1.1 quickly
  }
  const v = (t - 0.72) / 0.28;
  return 1.1 - (0.1 * v); // settle from 1.1 -> 1.0
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
      e.spawnT = Math.min(Number(e.spawnDur) || 0.14, (Number(e.spawnT) || 0) + dt);
      const spawnScale = getEnemySpawnScale(e);
      e.el.style.transform = `translate(${s.x}px, ${s.y}px) scale(${spawnScale.toFixed(3)})`;
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
      const pxRadius = Math.max(18, (Number(fx.radiusWorld) || EXPLOSION_RADIUS_WORLD) * Math.max(0.001, scale || 1));
      const pxSize = pxRadius * 2;
      fx.el.style.width = `${pxSize}px`;
      fx.el.style.height = `${pxSize}px`;
      fx.el.style.marginLeft = `${-pxRadius}px`;
      fx.el.style.marginTop = `${-pxRadius}px`;
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

function updateArenaVisual(scale = 1, showLimit = false) {
  if (!arenaRingEl || !arenaCoreEl || !arenaCenterWorld) return;
  const s = worldToScreen({ x: arenaCenterWorld.x, y: arenaCenterWorld.y });
  if (!s || !Number.isFinite(s.x) || !Number.isFinite(s.y)) {
    arenaRingEl.style.opacity = '0';
    arenaCoreEl.style.opacity = '0';
    if (arenaLimitEl) arenaLimitEl.style.opacity = '0';
    return;
  }
  const rPx = Math.max(140, SWARM_ARENA_RADIUS_WORLD * Math.max(0.001, scale || 1));
  const dPx = rPx * 2;
  arenaRingEl.style.opacity = '1';
  arenaRingEl.style.width = `${dPx}px`;
  arenaRingEl.style.height = `${dPx}px`;
  arenaRingEl.style.marginLeft = `${-rPx}px`;
  arenaRingEl.style.marginTop = `${-rPx}px`;
  arenaRingEl.style.transform = `translate(${s.x}px, ${s.y}px)`;
  arenaCoreEl.style.opacity = '1';
  arenaCoreEl.style.transform = `translate(${s.x}px, ${s.y}px)`;
  if (arenaLimitEl) {
    const rLimitPx = Math.max(150, (SWARM_ARENA_RADIUS_WORLD + SWARM_ARENA_RESIST_RANGE_WORLD) * Math.max(0.001, scale || 1));
    const dLimitPx = rLimitPx * 2;
    arenaLimitEl.style.opacity = showLimit ? '1' : '0';
    arenaLimitEl.style.width = `${dLimitPx}px`;
    arenaLimitEl.style.height = `${dLimitPx}px`;
    arenaLimitEl.style.marginLeft = `${-rLimitPx}px`;
    arenaLimitEl.style.marginTop = `${-rLimitPx}px`;
    arenaLimitEl.style.transform = `translate(${s.x}px, ${s.y}px)`;
  }
}

function setResistanceVisual(visible, angleDeg = 0, strength = 0) {
  if (!resistanceEl) return;
  if (!visible || !(strength > 0.001)) {
    resistanceEl.classList.remove('is-visible');
    resistanceEl.style.opacity = '0';
    return;
  }
  const s = Math.max(0, Math.min(1, strength));
  resistanceEl.classList.add('is-visible');
  resistanceEl.style.opacity = `${(0.24 + 0.72 * s).toFixed(3)}`;
  resistanceEl.style.setProperty('--bs-resist-thickness', `${(2 + 8 * s).toFixed(2)}px`);
  resistanceEl.style.setProperty('--bs-resist-rotation', `${angleDeg.toFixed(2)}deg`);
}

function setThrustFxVisual(visible) {
  if (!thrustFxEl) return;
  if (!visible) {
    thrustFxEl.classList.remove('is-visible', 'is-full');
    thrustFxEl.style.opacity = '0';
    return;
  }
  const lvl = Math.max(0, Math.min(SWARM_RELEASE_BEAT_LEVEL_MAX, lastLaunchBeatLevel));
  const t = lvl / Math.max(1, SWARM_RELEASE_BEAT_LEVEL_MAX);
  const len = 18 + (70 * t);
  const width = 5 + (8 * t);
  thrustFxEl.classList.add('is-visible');
  thrustFxEl.classList.toggle('is-full', lvl >= SWARM_RELEASE_BEAT_LEVEL_MAX);
  thrustFxEl.style.opacity = `${(0.35 + (0.55 * t)).toFixed(3)}`;
  thrustFxEl.style.setProperty('--bs-thrust-len', `${len.toFixed(2)}px`);
  thrustFxEl.style.setProperty('--bs-thrust-width', `${width.toFixed(2)}px`);
}

function getReactiveReleaseImpulse(outsideN = 0, pushCharge = 0) {
  const effectivePush = releaseForcePrimed ? 1 : Math.max(0, Math.min(1, pushCharge));
  const effectiveOutside = releaseForcePrimed ? 1 : Math.max(0, Math.min(1, outsideN));
  const base = SWARM_ARENA_SLINGSHOT_IMPULSE
    * (0.5 + (effectivePush * 1.25) + (effectiveOutside * 0.65));
  return base * getReleaseBeatMultiplier();
}

function setReactiveArrowVisual(visible, angleDeg = 0, impulse = 0) {
  if (!reactiveArrowEl) return;
  const multiplierPips = releaseForcePrimed ? Math.max(0, Math.min(3, Math.floor(releaseBeatLevel))) : 0;
  reactiveArrowEl.classList.toggle('is-primed', !!releaseForcePrimed);
  reactiveArrowEl.style.setProperty('--bs-reactive-arrow-thickness', `${(3 + (multiplierPips * 2)).toFixed(2)}px`);
  if (!visible || !(impulse > 0.001)) {
    reactiveArrowEl.classList.remove('is-visible');
    reactiveArrowEl.classList.remove('is-full-charge');
    reactiveArrowEl.style.opacity = '0';
    return;
  }
  const maxImpulse = getReactiveReleaseImpulse(1, 1);
  const t = Math.max(0, Math.min(1, impulse / Math.max(1, maxImpulse)));
  const len = 26 + (160 * t);
  reactiveArrowEl.classList.add('is-visible');
  reactiveArrowEl.style.opacity = `${(0.24 + (0.74 * t)).toFixed(3)}`;
  reactiveArrowEl.style.setProperty('--bs-reactive-arrow-len', `${len.toFixed(2)}px`);
  reactiveArrowEl.style.setProperty('--bs-reactive-arrow-angle', `${angleDeg.toFixed(2)}deg`);
  if (thrustFxEl) thrustFxEl.style.setProperty('--bs-reactive-arrow-angle', `${angleDeg.toFixed(2)}deg`);
  reactiveArrowEl.classList.toggle('is-full-charge', releaseBeatLevel >= SWARM_RELEASE_BEAT_LEVEL_MAX);
}

function pulseReactiveArrowCharge() {
  if (!reactiveArrowEl) return;
  reactiveArrowEl.classList.remove('is-beat-pulse');
  void reactiveArrowEl.offsetWidth;
  reactiveArrowEl.classList.add('is-beat-pulse');
}

function applyArenaBoundaryResistance(dt, input, centerWorld, scale) {
  if (!arenaCenterWorld || !centerWorld) {
    barrierPushingOut = false;
    barrierPushCharge = 0;
    setResistanceVisual(false);
    setReactiveArrowVisual(false);
    return false;
  }
  const dx = centerWorld.x - arenaCenterWorld.x;
  const dy = centerWorld.y - arenaCenterWorld.y;
  const dist = Math.hypot(dx, dy) || 0;
  const outside = Math.max(0, dist - SWARM_ARENA_RADIUS_WORLD);
  if (!(outside > 0.0001) || !(dist > 0.0001)) {
    barrierPushingOut = false;
    barrierPushCharge = 0;
    setResistanceVisual(false);
    setReactiveArrowVisual(false);
    return false;
  }

  const nx = dx / dist;
  const ny = dy / dist;
  const outsideN = Math.max(0, Math.min(1, outside / Math.max(1, SWARM_ARENA_RESIST_RANGE_WORLD)));
  const worldToScreenScale = Math.max(0.001, scale || 1);
  const borderScale = postReleaseAssistTimer > 0 ? SWARM_RELEASE_POST_FIRE_BORDER_SCALE * 0.2 : 1;
  const baseInward = SWARM_ARENA_INWARD_ACCEL_WORLD * borderScale * (outsideN * outsideN) * worldToScreenScale * dt;
  velocityX -= nx * baseInward;
  velocityY -= ny * baseInward;
  const maxDist = SWARM_ARENA_RADIUS_WORLD + SWARM_ARENA_RESIST_RANGE_WORLD;
  const edgeBand = Math.max(1, SWARM_ARENA_RESIST_RANGE_WORLD * 0.35);
  const nearEdgeN = Math.max(0, Math.min(1, (dist - (maxDist - edgeBand)) / edgeBand));
  const softStartDist = Math.max(SWARM_ARENA_RADIUS_WORLD, maxDist - SWARM_ARENA_OUTER_SOFT_BUFFER_WORLD);
  const nearLimitN = Math.max(0, Math.min(1, (dist - softStartDist) / Math.max(1, (maxDist - softStartDist))));

  let inputOut = 0;
  if (input && input.mag > 0.0001) {
    inputOut = Math.max(0, (input.x * nx) + (input.y * ny));
  }

  const radialBefore = (velocityX * nx) + (velocityY * ny);
  const radialOut = Math.max(0, radialBefore);

  // Rubber-band response:
  // spring grows with stretch, and damping grows with outward speed so faster
  // outward motion is cushioned harder instead of hard-stopping.
  if (outside > 0) {
    const springAccel = SWARM_ARENA_RUBBER_K_WORLD * borderScale * outside * worldToScreenScale;
    const dampAccel = borderScale * ((SWARM_ARENA_RUBBER_DAMP_LINEAR * radialOut) + (SWARM_ARENA_RUBBER_DAMP_QUAD * radialOut * radialOut));
    const inward = (springAccel + dampAccel) * dt;
    velocityX -= nx * inward;
    velocityY -= ny * inward;
  }

  const radialAfterRubber = (velocityX * nx) + (velocityY * ny);
  const radialOutAfterRubber = Math.max(0, radialAfterRubber);
  if (radialOutAfterRubber > 0 && nearEdgeN > 0) {
    const edgeBrake = (SWARM_ARENA_EDGE_BRAKE_WORLD * 2 * borderScale * (nearEdgeN * nearEdgeN) * (1 + (2.4 * nearLimitN)))
      * worldToScreenScale * dt;
    const remove = Math.min(radialOutAfterRubber, edgeBrake);
    velocityX -= nx * remove;
    velocityY -= ny * remove;
  }
  if (inputOut > 0.0001) {
    barrierPushingOut = true;
    barrierPushCharge = Math.min(1, barrierPushCharge + (dt * (0.75 + (outsideN * 1.8) + (inputOut * 1.1))));
    if (radialBefore > 0) {
      const brake = borderScale * (SWARM_ARENA_OUTWARD_BRAKE_WORLD + (SWARM_ARENA_OUTWARD_CANCEL_WORLD * outsideN * inputOut))
        * worldToScreenScale * dt;
      const nextRad = Math.max(0, radialBefore - brake);
      const remove = radialBefore - nextRad;
      velocityX -= nx * remove;
      velocityY -= ny * remove;
    }
    const inAngle = (Math.atan2(input.y, input.x) * 180 / Math.PI) + 90;
    setResistanceVisual(true, inAngle, outsideN * inputOut);
    const releaseDirAngle = (Math.atan2(-input.y, -input.x) * 180 / Math.PI);
    const releaseImpulse = getReactiveReleaseImpulse(outsideN, barrierPushCharge);
    setReactiveArrowVisual(true, releaseDirAngle, releaseImpulse);
    return true;
  }

  barrierPushingOut = false;
  barrierPushCharge = Math.max(0, barrierPushCharge - (dt * 1.4));
  setResistanceVisual(false);
  setReactiveArrowVisual(false);
  return true;
}

function enforceArenaOuterLimit(centerWorld, scale, dt) {
  if (!arenaCenterWorld || !centerWorld) return centerWorld;
  const dx = centerWorld.x - arenaCenterWorld.x;
  const dy = centerWorld.y - arenaCenterWorld.y;
  const dist = Math.hypot(dx, dy) || 0;
  const maxDist = SWARM_ARENA_RADIUS_WORLD + SWARM_ARENA_RESIST_RANGE_WORLD;
  if (!(dist > maxDist) || !(dist > 0.0001)) return centerWorld;
  const nx = dx / dist;
  const ny = dy / dist;
  const worldToScreenScale = Math.max(0.001, scale || 1);

  // Safety non-penetration correction: never allow visual center beyond outer limit.
  const cx = arenaCenterWorld.x + (nx * maxDist);
  const cy = arenaCenterWorld.y + (ny * maxDist);
  applyCameraDelta((cx - centerWorld.x) * worldToScreenScale, (cy - centerWorld.y) * worldToScreenScale);

  const radial = (velocityX * nx) + (velocityY * ny);
  if (radial > 0) {
    velocityX -= nx * radial;
    velocityY -= ny * radial;
  }
  return { x: cx, y: cy };
}

function applyLaunchInnerCircleBounce(centerWorld, scale) {
  if (!arenaCenterWorld || !centerWorld) return centerWorld;
  if (!(postReleaseAssistTimer > 0) || dragPointerId != null) return centerWorld;
  const dx = centerWorld.x - arenaCenterWorld.x;
  const dy = centerWorld.y - arenaCenterWorld.y;
  const dist = Math.hypot(dx, dy) || 0;
  const r = SWARM_ARENA_RADIUS_WORLD;
  if (!(dist >= r) || !(dist > 0.0001)) return centerWorld;
  const nx = dx / dist;
  const ny = dy / dist;
  const radial = (velocityX * nx) + (velocityY * ny);
  if (radial <= SWARM_RELEASE_BOUNCE_MIN_SPEED) return centerWorld;
  const worldToScreenScale = Math.max(0.001, scale || 1);
  const cx = arenaCenterWorld.x + (nx * r);
  const cy = arenaCenterWorld.y + (ny * r);
  applyCameraDelta((cx - centerWorld.x) * worldToScreenScale, (cy - centerWorld.y) * worldToScreenScale);
  const rx = velocityX - (2 * radial * nx);
  const ry = velocityY - (2 * radial * ny);
  velocityX = rx * SWARM_RELEASE_BOUNCE_RESTITUTION;
  velocityY = ry * SWARM_RELEASE_BOUNCE_RESTITUTION;
  return { x: cx, y: cy };
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
  postReleaseAssistTimer = Math.max(0, postReleaseAssistTimer - dt);
  if (postReleaseAssistTimer <= 0) lastLaunchBeatLevel = 0;
  setThrustFxVisual(postReleaseAssistTimer > 0);

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

  const z = getZoomState();
  const scale = Number.isFinite(z?.targetScale) ? z.targetScale : (Number.isFinite(z?.currentScale) ? z.currentScale : 1);
  const centerWorld = getViewportCenterWorld();
  const outsideForceActive = applyArenaBoundaryResistance(dt, input, centerWorld, scale);
  if (outsideForceActive) {
    outerForceContinuousSeconds += dt;
  } else {
    outerForceContinuousSeconds = 0;
    releaseForcePrimed = false;
    releaseBeatLevel = 0;
  }
  updateArenaVisual(scale);

  const speed = Math.hypot(velocityX, velocityY);
  const maxSpeedNow = postReleaseAssistTimer > 0 ? getReleaseSpeedCap() : SWARM_MAX_SPEED;
  if (speed > maxSpeedNow) {
    const k = maxSpeedNow / speed;
    velocityX *= k;
    velocityY *= k;
  }
  if (speed > 0.01) {
    applyCameraDelta(velocityX * dt, velocityY * dt);
  }
  let centerWorldAfterMove = getViewportCenterWorld();
  centerWorldAfterMove = applyLaunchInnerCircleBounce(centerWorldAfterMove, scale);
  centerWorldAfterMove = enforceArenaOuterLimit(centerWorldAfterMove, scale, dt);
  const outsideMain = arenaCenterWorld
    ? (Math.hypot(centerWorldAfterMove.x - arenaCenterWorld.x, centerWorldAfterMove.y - arenaCenterWorld.y) > SWARM_ARENA_RADIUS_WORLD)
    : false;
  updateArenaVisual(scale, outsideMain);
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
  setReactiveArrowVisual(false);
  barrierPushingOut = false;
  barrierPushCharge = 0;
  releaseBeatLevel = 0;
  lastLaunchBeatLevel = 0;
  postReleaseAssistTimer = 0;
  outerForceContinuousSeconds = 0;
  releaseForcePrimed = false;
  setThrustFxVisual(false);
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
  if (arenaCenterWorld && barrierPushingOut && barrierPushCharge > 0.02) {
    const centerWorld = getViewportCenterWorld();
    const dx = centerWorld.x - arenaCenterWorld.x;
    const dy = centerWorld.y - arenaCenterWorld.y;
    const dist = Math.hypot(dx, dy) || 0;
    if (dist > SWARM_ARENA_RADIUS_WORLD) {
      const nx = dx / Math.max(0.0001, dist);
      const ny = dy / Math.max(0.0001, dist);
      const outside = Math.max(0, dist - SWARM_ARENA_RADIUS_WORLD);
      const outsideN = Math.max(0, Math.min(1, outside / Math.max(1, SWARM_ARENA_RESIST_RANGE_WORLD)));
      const impulse = getReactiveReleaseImpulse(outsideN, barrierPushCharge);
      const inputDx = dragNowX - dragStartX;
      const inputDy = dragNowY - dragStartY;
      const inputLen = Math.hypot(inputDx, inputDy) || 0;
      if (inputLen > 0.0001) {
        const ux = inputDx / inputLen;
        const uy = inputDy / inputLen;
        // Fire in the opposite direction to current joystick direction.
        velocityX -= ux * impulse;
        velocityY -= uy * impulse;
      } else {
        // Fallback if joystick vector is lost at release time.
        velocityX -= nx * impulse;
        velocityY -= ny * impulse;
      }
      lastLaunchBeatLevel = releaseBeatLevel;
      postReleaseAssistTimer = SWARM_RELEASE_POST_FIRE_DURATION;
    }
  }
  dragPointerId = null;
  barrierPushingOut = false;
  barrierPushCharge = 0;
  // Keep charge level for active launch; reset when launch assist ends.
  outerForceContinuousSeconds = 0;
  releaseForcePrimed = false;
  setJoystickVisible(false);
  setReactiveArrowVisual(false);
  setThrustFxVisual(false);
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

export function enterBeatSwarmMode(options = null) {
  if (active) return true;
  const restoreState = options && typeof options === 'object' ? options.restoreState : null;
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
  setThrustFxVisual(false);
  clearEnemies();
  clearPickups();
  clearProjectiles();
  clearEffects();
  arenaCenterWorld = null;
  barrierPushingOut = false;
  barrierPushCharge = 0;
  releaseBeatLevel = 0;
  lastLaunchBeatLevel = 0;
  postReleaseAssistTimer = 0;
  outerForceContinuousSeconds = 0;
  releaseForcePrimed = false;
  if (!restoreState) {
    spawnStarterPickups(getViewportCenterWorld());
  }
  lastBeatIndex = null;
  try { spawnerRuntime?.enter?.(); } catch {}
  try { configureInitialSpawnerEnablement(); } catch {}
  bindInput();
  startTick();
  if (!restoreState) {
    try { window.__MT_ANCHOR?.center?.(); } catch {}
    applyBeatSwarmCameraScaleWithRetry();
    arenaCenterWorld = getViewportCenterWorld();
    updateArenaVisual((Number(getZoomState?.()?.targetScale) || Number(getZoomState?.()?.currentScale) || 1));
    setResistanceVisual(false);
    setReactiveArrowVisual(false);
  } else {
    restoreBeatSwarmState(restoreState);
    applyBeatSwarmCameraScaleWithRetry();
    setReactiveArrowVisual(false);
  }
  persistBeatSwarmState();
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
  setThrustFxVisual(false);
  stopTick();
  unbindInput();
  try { spawnerRuntime?.exit?.(); } catch {}
  clearEnemies();
  clearPickups();
  clearProjectiles();
  clearEffects();
  arenaCenterWorld = null;
  barrierPushingOut = false;
  barrierPushCharge = 0;
  releaseBeatLevel = 0;
  lastLaunchBeatLevel = 0;
  postReleaseAssistTimer = 0;
  outerForceContinuousSeconds = 0;
  releaseForcePrimed = false;
  if (arenaRingEl) arenaRingEl.style.opacity = '0';
  if (arenaCoreEl) arenaCoreEl.style.opacity = '0';
  if (arenaLimitEl) arenaLimitEl.style.opacity = '0';
  setResistanceVisual(false);
  setReactiveArrowVisual(false);
  equippedWeapons.clear();
  lastBeatIndex = null;
  clearBeatSwarmPersistedState();
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

function installBeatSwarmPersistence() {
  const persistIfActive = () => {
    if (!active) return;
    persistBeatSwarmState();
  };
  try {
    window.addEventListener('beforeunload', persistIfActive, { capture: true });
    window.addEventListener('pagehide', persistIfActive, { capture: true });
  } catch {}

  const restore = consumeBeatSwarmPersistedState();
  if (!restore?.active) return;
  const doRestore = () => {
    try { enterBeatSwarmMode({ restoreState: restore }); } catch {}
    try {
      if (!isRunning?.()) startTransport?.();
    } catch {}
  };
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(doRestore, 0);
  } else {
    window.addEventListener('DOMContentLoaded', doRestore, { once: true });
  }
}

installBeatSwarmPersistence();
