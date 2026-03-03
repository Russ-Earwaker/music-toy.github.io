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
const SWARM_ARENA_PATH_SPEED_WORLD = 22; // world units/sec
const SWARM_ARENA_PATH_MAX_TURN_RATE_RAD = (Math.PI / 180) * 12; // smooth, no sharp turn-backs
const SWARM_ARENA_PATH_TURN_SMOOTH = 1.8;
const SWARM_ARENA_PATH_RETARGET_MIN = 2.6;
const SWARM_ARENA_PATH_RETARGET_MAX = 5.8;
const SWARM_STARFIELD_COUNT = 520;
const SWARM_STARFIELD_PARALLAX_MIN = 0.42;
const SWARM_STARFIELD_PARALLAX_MAX = 0.88;
const SWARM_STARFIELD_PARALLAX_SHIFT_SCALE = 0.7;

let active = false;
let overlayEl = null;
let exitBtn = null;
let joystickEl = null;
let joystickKnobEl = null;
let resistanceEl = null;
let reactiveArrowEl = null;
let thrustFxEl = null;
let pauseLabelEl = null;
let pauseScreenEl = null;
let pausePreviewSceneEl = null;
let pausePreviewStatusEl = null;
let spawnerLayerEl = null;
let enemyLayerEl = null;
let starfieldLayerEl = null;
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
let arenaPathHeadingRad = 0;
let arenaPathTurnRateRad = 0;
let arenaPathTargetTurnRateRad = 0;
let arenaPathRetargetTimer = 0;
let starfieldParallaxAnchorWorld = null;
let starfieldSplitWorldX = 0;
let borderForceEnabled = true;
let gameplayPaused = false;

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
const helpers = [];
const starfieldStars = [];
let enemyIdSeq = 1;
let helperIdSeq = 1;
const pendingWeaponChainEvents = [];
const lingeringAoeZones = [];
const MAX_WEAPON_SLOTS = 3;
const MAX_WEAPON_STAGES = 5;
const WEAPON_ARCHETYPES = Object.freeze({
  projectile: Object.freeze({
    id: 'projectile',
    label: 'Projectile',
    variants: Object.freeze([
      Object.freeze({ id: 'standard', label: 'Standard' }),
      Object.freeze({ id: 'homing-missile', label: 'Homing Missile' }),
      Object.freeze({ id: 'boomerang', label: 'Boomerang' }),
      Object.freeze({ id: 'split-shot', label: 'Split Shot' }),
    ]),
  }),
  aoe: Object.freeze({
    id: 'aoe',
    label: 'AOE',
    variants: Object.freeze([
      Object.freeze({ id: 'explosion', label: 'Explosion' }),
      Object.freeze({ id: 'dot-area', label: 'Damage Over Time Area' }),
    ]),
  }),
  laser: Object.freeze({
    id: 'laser',
    label: 'Laser',
    variants: Object.freeze([
      Object.freeze({ id: 'hitscan', label: 'Hit-scan' }),
      Object.freeze({ id: 'beam', label: 'Constant Beam' }),
    ]),
  }),
  helper: Object.freeze({
    id: 'helper',
    label: 'Helper',
    variants: Object.freeze([
      Object.freeze({ id: 'orbital-drone', label: 'Orbital Drone' }),
      Object.freeze({ id: 'turret', label: 'Turret' }),
    ]),
  }),
});
const WEAPON_COMPONENTS = Object.freeze([
  Object.freeze({ id: 'projectile:standard', archetype: 'projectile', variant: 'standard', label: 'Standard', previewClass: 'is-proj' }),
  Object.freeze({ id: 'projectile:homing-missile', archetype: 'projectile', variant: 'homing-missile', label: 'Homing Missile', previewClass: 'is-proj' }),
  Object.freeze({ id: 'projectile:boomerang', archetype: 'projectile', variant: 'boomerang', label: 'Boomerang', previewClass: 'is-boomerang' }),
  Object.freeze({ id: 'projectile:split-shot', archetype: 'projectile', variant: 'split-shot', label: 'Split Shot', previewClass: 'is-split' }),
  Object.freeze({ id: 'laser:hitscan', archetype: 'laser', variant: 'hitscan', label: 'Hit-scan', previewClass: 'is-hitscan' }),
  Object.freeze({ id: 'laser:beam', archetype: 'laser', variant: 'beam', label: 'Constant Beam', previewClass: 'is-beam' }),
  Object.freeze({ id: 'aoe:explosion', archetype: 'aoe', variant: 'explosion', label: 'Explosion', previewClass: 'is-explosion' }),
  Object.freeze({ id: 'aoe:dot-area', archetype: 'aoe', variant: 'dot-area', label: 'Damage Over Time Area', previewClass: 'is-dotarea' }),
  Object.freeze({ id: 'helper:orbital-drone', archetype: 'helper', variant: 'orbital-drone', label: 'Orbital Drone', previewClass: 'is-helper-orbital' }),
  Object.freeze({ id: 'helper:turret', archetype: 'helper', variant: 'turret', label: 'Turret', previewClass: 'is-helper-turret' }),
]);
const weaponLoadout = Array.from({ length: MAX_WEAPON_SLOTS }, (_, i) => ({
  id: `slot-${i + 1}`,
  name: `Weapon ${i + 1}`,
  stages: [],
}));

function seedDefaultWeaponLoadout() {
  for (let i = 0; i < weaponLoadout.length; i++) {
    const slot = weaponLoadout[i];
    slot.name = `Weapon ${i + 1}`;
    slot.stages = [];
  }
  // Default starter: Projectile -> Explosion.
  weaponLoadout[0].stages = [
    { archetype: 'projectile', variant: 'standard' },
    { archetype: 'aoe', variant: 'explosion' },
  ];
}

seedDefaultWeaponLoadout();
const ENEMY_CAP = 120;
const ENEMY_ACCEL = 680;
const ENEMY_MAX_SPEED = 260;
const ENEMY_HIT_RADIUS = 20;
const ENEMY_SPAWN_START_SCALE = 0.2;
const ENEMY_SPAWN_DURATION = 0.58;
const PICKUP_COLLECT_RADIUS_PX = 46;
const PROJECTILE_SPEED = 1100;
const PROJECTILE_HIT_RADIUS_PX = 24;
const PROJECTILE_LIFETIME = 1.9;
const PROJECTILE_SPLIT_ANGLE_RAD = Math.PI / 7.2; // 25 deg
const PROJECTILE_BOOMERANG_RADIUS_WORLD = 320;
const PROJECTILE_BOOMERANG_LOOP_SECONDS = 1.15;
const PROJECTILE_HOMING_ACQUIRE_RANGE_WORLD = 920;
const PROJECTILE_HOMING_SPEED = 900;
const PROJECTILE_HOMING_TURN_RATE = 5.8;
const PROJECTILE_HOMING_ORBIT_RADIUS_WORLD = 170;
const PROJECTILE_HOMING_ORBIT_ANG_VEL = 2.4;
const PROJECTILE_HOMING_ORBIT_CHASE_SPEED = 420;
const PROJECTILE_HOMING_ORBIT_TURN_RATE = 4.2;
const PROJECTILE_HOMING_MAX_ORBITING = 8;
const PROJECTILE_HOMING_RETURN_SNAP_DIST_WORLD = 34;
const HELPER_LIFETIME_BEATS = 8;
const HELPER_ORBIT_RADIUS_WORLD = 150;
const HELPER_ORBIT_ANG_VEL = 1.9;
const HELPER_IMPACT_RADIUS_PX = 24;
const HELPER_IMPACT_DAMAGE = 1.25;
const HELPER_TURRET_SPAWN_OFFSET_WORLD = 78;
const LASER_TTL = 0.12;
const EXPLOSION_TTL = 0.22;
const EXPLOSION_RADIUS_WORLD = 220;
const BEAM_DAMAGE_PER_SECOND = 3.2;
const PREVIEW_PROJECTILE_SPEED = 360;
const PREVIEW_PROJECTILE_LIFETIME = 2.1;
const PREVIEW_PROJECTILE_SPLIT_ANGLE_RAD = Math.PI / 7.2; // 25 deg
const PREVIEW_PROJECTILE_BOOMERANG_RADIUS = 42;
const PREVIEW_PROJECTILE_BOOMERANG_LOOP_SECONDS = 1.15;
const PREVIEW_PROJECTILE_HOMING_ACQUIRE_RANGE = 160;
const PREVIEW_PROJECTILE_HOMING_SPEED = 280;
const PREVIEW_PROJECTILE_HOMING_TURN_RATE = 5.2;
const PREVIEW_PROJECTILE_HOMING_ORBIT_RADIUS = 38;
const PREVIEW_PROJECTILE_HOMING_ORBIT_ANG_VEL = 2.8;
const PREVIEW_PROJECTILE_HOMING_ORBIT_CHASE_SPEED = 150;
const PREVIEW_PROJECTILE_HOMING_ORBIT_TURN_RATE = 4.2;
const PREVIEW_PROJECTILE_HOMING_MAX_ORBITING = 8;
const PREVIEW_PROJECTILE_HOMING_RETURN_SNAP_DIST = 10;
const PREVIEW_HELPER_LIFETIME_BEATS = 8;
const PREVIEW_HELPER_ORBIT_RADIUS = 34;
const PREVIEW_HELPER_ORBIT_ANG_VEL = 2.3;
const PREVIEW_HELPER_IMPACT_RADIUS = 12;
const PREVIEW_HELPER_IMPACT_DAMAGE = 1.1;
const PREVIEW_HELPER_TURRET_SPAWN_OFFSET = 18;
const PREVIEW_LASER_TTL = 0.16;
const PREVIEW_EXPLOSION_TTL = 0.24;
const PREVIEW_EXPLOSION_RADIUS = 52;
const PREVIEW_BEAM_DAMAGE_PER_SECOND = 3.2;
const PREVIEW_ENEMY_COUNT = 7;
const PREVIEW_ENEMY_HP = 4;
const PREVIEW_BEAT_LEN_FALLBACK = 0.5;
const weaponDefs = Object.freeze({
  laser: { id: 'laser', damage: 2 },
  projectile: { id: 'projectile', damage: 2 },
  explosion: { id: 'explosion', damage: 1 },
});
const equippedWeapons = new Set();
let lastBeatIndex = null;
let currentBeatIndex = 0;
let previewSelectedWeaponSlotIndex = null;
let activeWeaponSlotIndex = 0;
const stagePickerState = { open: false, slotIndex: -1, stageIndex: -1 };
const componentLivePreview = {
  rafId: 0,
  lastTs: 0,
  states: [],
};
const pausePreview = {
  initialized: false,
  width: 0,
  height: 0,
  ship: { x: 64, y: 160 },
  enemies: [],
  projectiles: [],
  effects: [],
  pendingEvents: [],
  aoeZones: [],
  helpers: [],
  beatIndex: 0,
  beatTimer: 0,
};
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
    arenaPath: {
      headingRad: arenaPathHeadingRad,
      turnRateRad: arenaPathTurnRateRad,
      targetTurnRateRad: arenaPathTargetTurnRateRad,
      retargetTimer: arenaPathRetargetTimer,
    },
    starfield: starfieldStars.map((s) => ({
      nx: Number(s.nx) || 0,
      ny: Number(s.ny) || 0,
      p: Number(s.p) || 0,
      size: Number(s.size) || 1.5,
      alpha: Number(s.alpha) || 0.7,
    })),
    starfieldParallaxAnchorWorld: starfieldParallaxAnchorWorld
      ? { x: Number(starfieldParallaxAnchorWorld.x) || 0, y: Number(starfieldParallaxAnchorWorld.y) || 0 }
      : null,
    starfieldSplitWorldX: Number(starfieldSplitWorldX) || 0,
    arenaCenterWorld: arenaCenterWorld ? { x: arenaCenterWorld.x, y: arenaCenterWorld.y } : null,
    equippedWeapons: Array.from(equippedWeapons),
    weaponLoadout: weaponLoadout.map((w) => ({
      id: w.id,
      name: w.name,
      stages: Array.isArray(w.stages)
        ? w.stages.map((s) => ({ archetype: s.archetype, variant: s.variant }))
        : [],
    })),
    activeWeaponSlotIndex: Math.max(0, Math.min(MAX_WEAPON_SLOTS - 1, Math.trunc(Number(activeWeaponSlotIndex) || 0))),
    pendingWeaponChainEvents: pendingWeaponChainEvents.map((ev) => ({
      beatIndex: Number(ev.beatIndex) || 0,
      stages: Array.isArray(ev.stages)
        ? ev.stages.map((s) => ({ archetype: s.archetype, variant: s.variant }))
        : [],
      context: {
        origin: ev.context?.origin ? { x: Number(ev.context.origin.x) || 0, y: Number(ev.context.origin.y) || 0 } : null,
        impactPoint: ev.context?.impactPoint ? { x: Number(ev.context.impactPoint.x) || 0, y: Number(ev.context.impactPoint.y) || 0 } : null,
        weaponSlotIndex: Number.isFinite(ev.context?.weaponSlotIndex) ? Math.trunc(ev.context.weaponSlotIndex) : null,
        stageIndex: Number.isFinite(ev.context?.stageIndex) ? Math.trunc(ev.context.stageIndex) : null,
        impactEnemyId: Number.isFinite(ev.context?.impactEnemyId) ? Math.trunc(ev.context.impactEnemyId) : null,
      },
    })),
    lingeringAoeZones: lingeringAoeZones.map((z) => ({
      x: Number(z.x) || 0,
      y: Number(z.y) || 0,
      radius: Number(z.radius) || EXPLOSION_RADIUS_WORLD,
      damagePerBeat: Number(z.damagePerBeat) || 1,
      untilBeat: Number(z.untilBeat) || 0,
      weaponSlotIndex: Number.isFinite(z.weaponSlotIndex) ? Math.trunc(z.weaponSlotIndex) : null,
    })),
    currentBeatIndex: Number(currentBeatIndex) || 0,
    enemies: enemies.map((e) => ({
      id: Number(e.id) || 0,
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
      kind: String(p.kind || 'standard'),
      boomCenterX: Number(p.boomCenterX) || 0,
      boomCenterY: Number(p.boomCenterY) || 0,
      boomDirX: Number(p.boomDirX) || 0,
      boomDirY: Number(p.boomDirY) || 0,
      boomPerpX: Number(p.boomPerpX) || 0,
      boomPerpY: Number(p.boomPerpY) || 0,
      boomRadius: Number(p.boomRadius) || 0,
      boomTheta: Number(p.boomTheta) || 0,
      boomOmega: Number(p.boomOmega) || 0,
      homingState: String(p.homingState || ''),
      targetEnemyId: Number.isFinite(p.targetEnemyId) ? Math.trunc(p.targetEnemyId) : null,
      orbitAngle: Number(p.orbitAngle) || 0,
      orbitAngVel: Number(p.orbitAngVel) || 0,
      orbitRadius: Number(p.orbitRadius) || 0,
      hitEnemyIds: Array.from(p.hitEnemyIds || []),
      chainWeaponSlotIndex: Number.isFinite(p.chainWeaponSlotIndex) ? Math.trunc(p.chainWeaponSlotIndex) : null,
      chainStageIndex: Number.isFinite(p.chainStageIndex) ? Math.trunc(p.chainStageIndex) : null,
      nextStages: Array.isArray(p.nextStages) ? p.nextStages.map((s) => ({ archetype: s.archetype, variant: s.variant })) : [],
      nextBeatIndex: Number.isFinite(p.nextBeatIndex) ? Math.trunc(p.nextBeatIndex) : null,
    })),
    effects: effects.map((fx) => ({
      kind: fx.kind,
      ttl: Number(fx.ttl) || 0,
      from: fx.from ? { x: Number(fx.from.x) || 0, y: Number(fx.from.y) || 0 } : null,
      to: fx.to ? { x: Number(fx.to.x) || 0, y: Number(fx.to.y) || 0 } : null,
      at: fx.at ? { x: Number(fx.at.x) || 0, y: Number(fx.at.y) || 0 } : null,
      radiusWorld: Number(fx.radiusWorld) || EXPLOSION_RADIUS_WORLD,
      targetEnemyId: Number.isFinite(fx.targetEnemyId) ? Math.trunc(fx.targetEnemyId) : null,
      damagePerSec: Number(fx.damagePerSec) || 0,
      weaponSlotIndex: Number.isFinite(fx.weaponSlotIndex) ? Math.trunc(fx.weaponSlotIndex) : null,
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

function getArchetypeDef(id) {
  const key = String(id || '').trim();
  return WEAPON_ARCHETYPES[key] || null;
}

function getVariantDef(archetype, variant) {
  const a = getArchetypeDef(archetype);
  if (!a) return null;
  return a.variants.find((v) => v.id === variant) || null;
}

function getWeaponComponentDefById(componentId) {
  const id = String(componentId || '').trim();
  return WEAPON_COMPONENTS.find((c) => c.id === id) || null;
}

function getWeaponComponentDefForStage(stage) {
  const archetype = String(stage?.archetype || '').trim();
  const variant = String(stage?.variant || '').trim();
  return getWeaponComponentDefById(`${archetype}:${variant}`);
}

function renderComponentPreviewMarkup(componentDef) {
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

function stopComponentLivePreviews() {
  if (componentLivePreview.rafId) {
    cancelAnimationFrame(componentLivePreview.rafId);
    componentLivePreview.rafId = 0;
  }
  componentLivePreview.lastTs = 0;
  componentLivePreview.states.length = 0;
}

function createComponentMiniNode(className, parent) {
  const el = document.createElement('div');
  el.className = className;
  parent.appendChild(el);
  return el;
}

function spawnComponentMiniProjectile(state, from, to, kind = 'standard') {
  const dir = normalizeDir((to?.x || 0) - from.x, (to?.y || 0) - from.y, 1, 0);
  const p = {
    kind,
    x: from.x,
    y: from.y,
    vx: dir.x * 120,
    vy: dir.y * 120,
    ttl: kind === 'boomerang' ? 1.2 : 1.6,
    el: createComponentMiniNode('beat-swarm-preview-projectile', state.scene),
    centerX: from.x,
    centerY: from.y,
    boomDirX: dir.x,
    boomDirY: dir.y,
    boomPerpX: dir.y,
    boomPerpY: -dir.x,
    boomTheta: Math.PI,
    boomOmega: (Math.PI * 2) / 1.2,
    boomRadius: 22,
  };
  state.projectiles.push(p);
  return p;
}

function spawnComponentMiniEffect(state, kind, from, to, ttl = 0.22, radius = 14) {
  const cls = kind === 'explosion' ? 'beat-swarm-preview-fx-explosion' : 'beat-swarm-preview-fx-laser';
  const e = {
    kind,
    ttl,
    from: from ? { x: from.x, y: from.y } : null,
    to: to ? { x: to.x, y: to.y } : null,
    at: to ? { x: to.x, y: to.y } : (from ? { x: from.x, y: from.y } : null),
    radius: Math.max(8, Number(radius) || 14),
    el: createComponentMiniNode(cls, state.scene),
  };
  state.effects.push(e);
}

function ensureComponentMiniHelper(state, variant) {
  if (variant === 'turret') {
    if (state.helpers.some((h) => h.kind === 'turret')) return;
    const at = { x: state.ship.x, y: state.ship.y - 20 };
    state.helpers.push({
      kind: 'turret',
      x: at.x,
      y: at.y,
      el: createComponentMiniNode('beat-swarm-preview-projectile beat-swarm-preview-helper-turret', state.scene),
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
      elA: createComponentMiniNode('beat-swarm-preview-projectile beat-swarm-preview-helper-orbital', state.scene),
      elB: createComponentMiniNode('beat-swarm-preview-projectile beat-swarm-preview-helper-orbital', state.scene),
      ax: 0,
      ay: 0,
      bx: 0,
      by: 0,
    });
  }
}

function fireComponentLivePreview(state) {
  const c = state.component;
  if (!c) return;
  if (c.archetype === 'projectile') {
    if (c.variant === 'split-shot') {
      const base = Math.atan2(state.enemy.y - state.ship.y, state.enemy.x - state.ship.x);
      const offs = [0, -PREVIEW_PROJECTILE_SPLIT_ANGLE_RAD, PREVIEW_PROJECTILE_SPLIT_ANGLE_RAD];
      for (const o of offs) {
        const dir = { x: Math.cos(base + o), y: Math.sin(base + o) };
        spawnComponentMiniProjectile(state, state.ship, { x: state.ship.x + dir.x * 200, y: state.ship.y + dir.y * 200 });
      }
      return;
    }
    if (c.variant === 'boomerang') {
      spawnComponentMiniProjectile(state, state.ship, state.enemy, 'boomerang');
      return;
    }
    if (c.variant === 'homing-missile') {
      spawnComponentMiniProjectile(state, state.ship, state.enemy, 'homing');
      return;
    }
    spawnComponentMiniProjectile(state, state.ship, state.enemy);
    return;
  }
  if (c.archetype === 'laser') {
    if (c.variant === 'beam') {
      spawnComponentMiniEffect(state, 'beam', state.ship, state.enemy, 0.5);
    } else {
      spawnComponentMiniEffect(state, 'laser', state.ship, state.enemy, 0.18);
    }
    return;
  }
  if (c.archetype === 'aoe') {
    spawnComponentMiniEffect(state, 'explosion', state.ship, state.ship, c.variant === 'dot-area' ? 0.7 : 0.24, 36);
    return;
  }
  if (c.archetype === 'helper') {
    ensureComponentMiniHelper(state, c.variant);
    if (c.variant === 'turret') {
      const t = state.helpers.find((h) => h.kind === 'turret');
      if (t) spawnComponentMiniProjectile(state, { x: t.x, y: t.y }, state.enemy);
    } else {
      const h = state.helpers.find((x) => x.kind === 'orbital-drone');
      if (h) {
        spawnComponentMiniProjectile(state, { x: h.ax, y: h.ay }, state.enemy);
        spawnComponentMiniProjectile(state, { x: h.bx, y: h.by }, state.enemy);
      }
    }
  }
}

function updateComponentLivePreviewState(state, dt) {
  const rect = state.root.getBoundingClientRect();
  const w = Math.max(120, Number(rect.width) || 0);
  const h = Math.max(120, Number(rect.height) || 0);
  if (state.component?.archetype === 'aoe') {
    state.ship.x = w * 0.5;
    state.ship.y = h * 0.5;
    state.enemy.x = state.ship.x + 28;
    state.enemy.y = state.ship.y - 10;
  } else if (state.component?.archetype === 'projectile' && state.component?.variant === 'boomerang') {
    state.ship.x = w * 0.28;
    state.ship.y = h * 0.52;
    state.enemy.x = w * 0.46;
    state.enemy.y = h * 0.49;
    if (state.enemyAlt?.el) {
      state.enemyAlt.x = w * 0.58;
      state.enemyAlt.y = h * 0.55;
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
    p.ttl -= dt;
    if (p.kind === 'boomerang') {
      p.boomTheta += p.boomOmega * dt;
      const c = Math.cos(p.boomTheta);
      const s = Math.sin(p.boomTheta);
      p.x = p.centerX + (p.boomDirX * (1 + c) * p.boomRadius) + (p.boomPerpX * s * p.boomRadius);
      p.y = p.centerY + (p.boomDirY * (1 + c) * p.boomRadius) + (p.boomPerpY * s * p.boomRadius);
    } else if (p.kind === 'homing') {
      const desired = normalizeDir(state.enemy.x - p.x, state.enemy.y - p.y, p.vx, p.vy);
      const cur = normalizeDir(p.vx, p.vy, desired.x, desired.y);
      const steer = Math.max(0, Math.min(1, 4.8 * dt));
      const nd = normalizeDir((cur.x * (1 - steer)) + (desired.x * steer), (cur.y * (1 - steer)) + (desired.y * steer), desired.x, desired.y);
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
      pulseHitFlash(state.enemy.el);
      if (state.enemyAlt?.el && (state.component?.archetype === 'projectile' && state.component?.variant === 'boomerang')) {
        const dxMain = p.x - state.enemy.x;
        const dyMain = p.y - state.enemy.y;
        if ((dxMain * dxMain + dyMain * dyMain) > 110) pulseHitFlash(state.enemyAlt.el);
      }
      if (p.kind !== 'boomerang') {
        try { p.el?.remove?.(); } catch {}
        state.projectiles.splice(i, 1);
        continue;
      }
    }
    p.el.style.transform = `translate(${p.x.toFixed(2)}px, ${p.y.toFixed(2)}px)`;
  }

  for (let i = state.effects.length - 1; i >= 0; i--) {
    const fx = state.effects[i];
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
  const beatLen = Math.max(0.32, getPausePreviewBeatLen() * 0.9);
  while (state.beatTimer >= beatLen) {
    state.beatTimer -= beatLen;
    fireComponentLivePreview(state);
  }
}

function tickComponentLivePreviews(ts) {
  if (!componentLivePreview.states.length) {
    componentLivePreview.rafId = 0;
    componentLivePreview.lastTs = 0;
    return;
  }
  const now = Number(ts) || performance.now();
  if (!componentLivePreview.lastTs) componentLivePreview.lastTs = now;
  const dt = Math.max(0.001, Math.min(0.05, (now - componentLivePreview.lastTs) / 1000));
  componentLivePreview.lastTs = now;
  for (const s of componentLivePreview.states) {
    if (!s.root?.isConnected) continue;
    updateComponentLivePreviewState(s, dt);
  }
  componentLivePreview.rafId = requestAnimationFrame(tickComponentLivePreviews);
}

function initComponentLivePreviews() {
  stopComponentLivePreviews();
  if (!pauseScreenEl) return;
  if (!gameplayPaused) return;
  const roots = Array.from(pauseScreenEl.querySelectorAll('.beat-swarm-component-preview.is-live[data-component-id]'));
  for (const root of roots) {
    if (!(root instanceof HTMLElement)) continue;
    const id = String(root.dataset.componentId || '').trim();
    const comp = getWeaponComponentDefById(id);
    if (!comp) continue;
    const scene = root.querySelector('.beat-swarm-component-mini-scene');
    if (!(scene instanceof HTMLElement)) continue;
    const shipEl = createComponentMiniNode('beat-swarm-preview-ship', scene);
    const enemyEl = createComponentMiniNode('beat-swarm-preview-enemy', scene);
    const enemyAltEl = createComponentMiniNode('beat-swarm-preview-enemy', scene);
    enemyAltEl.style.opacity = '0';
    componentLivePreview.states.push({
      root,
      scene,
      component: comp,
      ship: { x: 0, y: 0, el: shipEl },
      enemy: { x: 0, y: 0, el: enemyEl },
      enemyAlt: { x: 0, y: 0, el: enemyAltEl },
      projectiles: [],
      effects: [],
      helpers: [],
      beatTimer: Math.random() * 0.4,
    });
  }
  if (componentLivePreview.states.length) {
    componentLivePreview.rafId = requestAnimationFrame(tickComponentLivePreviews);
  }
}

function sanitizeWeaponStages(stages) {
  const out = [];
  for (const raw of Array.isArray(stages) ? stages : []) {
    if (out.length >= MAX_WEAPON_STAGES) break;
    const archetype = String(raw?.archetype || '').trim();
    const variant = String(raw?.variant || '').trim();
    if (!getArchetypeDef(archetype)) continue;
    if (!getVariantDef(archetype, variant)) continue;
    out.push({ archetype, variant });
  }
  return out;
}

function applyWeaponLoadoutFromState(loadoutState) {
  for (let i = 0; i < weaponLoadout.length; i++) {
    const slot = weaponLoadout[i];
    const raw = Array.isArray(loadoutState) ? loadoutState[i] : null;
    slot.name = String(raw?.name || slot.name || `Weapon ${i + 1}`);
    slot.stages = sanitizeWeaponStages(raw?.stages);
  }
  renderPauseWeaponUi();
}

function clearPendingWeaponChainEvents() {
  pendingWeaponChainEvents.length = 0;
}

function clearLingeringAoeZones() {
  lingeringAoeZones.length = 0;
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
    id: Math.max(1, Math.trunc(Number(state.id) || enemyIdSeq++)),
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
  enemyIdSeq = Math.max(enemyIdSeq, (Number(e.id) || 0) + 1);
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
  arenaPathHeadingRad = Number(state?.arenaPath?.headingRad);
  if (!Number.isFinite(arenaPathHeadingRad)) arenaPathHeadingRad = Math.random() * Math.PI * 2;
  arenaPathTurnRateRad = Number(state?.arenaPath?.turnRateRad);
  if (!Number.isFinite(arenaPathTurnRateRad)) arenaPathTurnRateRad = 0;
  arenaPathTargetTurnRateRad = Number(state?.arenaPath?.targetTurnRateRad);
  if (!Number.isFinite(arenaPathTargetTurnRateRad)) arenaPathTargetTurnRateRad = 0;
  arenaPathRetargetTimer = Number(state?.arenaPath?.retargetTimer);
  if (!Number.isFinite(arenaPathRetargetTimer)) arenaPathRetargetTimer = 0;
  arenaCenterWorld = state.arenaCenterWorld
    ? { x: Number(state.arenaCenterWorld.x) || 0, y: Number(state.arenaCenterWorld.y) || 0 }
    : getViewportCenterWorld();
  restoreStarfieldFromState(state.starfield, arenaCenterWorld, state.starfieldParallaxAnchorWorld, state.starfieldSplitWorldX);

  equippedWeapons.clear();
  for (const id of Array.isArray(state.equippedWeapons) ? state.equippedWeapons : []) {
    if (weaponDefs[id]) equippedWeapons.add(id);
  }
  applyWeaponLoadoutFromState(state.weaponLoadout);
  activeWeaponSlotIndex = Math.max(0, Math.min(MAX_WEAPON_SLOTS - 1, Math.trunc(Number(state.activeWeaponSlotIndex) || 0)));
  clearPendingWeaponChainEvents();
  for (const ev of Array.isArray(state.pendingWeaponChainEvents) ? state.pendingWeaponChainEvents : []) {
    const stages = sanitizeWeaponStages(ev?.stages);
    if (!stages.length) continue;
    pendingWeaponChainEvents.push({
      beatIndex: Math.max(0, Math.trunc(Number(ev?.beatIndex) || 0)),
      stages,
      context: {
        origin: ev?.context?.origin ? { x: Number(ev.context.origin.x) || 0, y: Number(ev.context.origin.y) || 0 } : null,
        impactPoint: ev?.context?.impactPoint ? { x: Number(ev.context.impactPoint.x) || 0, y: Number(ev.context.impactPoint.y) || 0 } : null,
        weaponSlotIndex: Number.isFinite(ev?.context?.weaponSlotIndex) ? Math.trunc(ev.context.weaponSlotIndex) : null,
        stageIndex: Number.isFinite(ev?.context?.stageIndex) ? Math.trunc(ev.context.stageIndex) : null,
        impactEnemyId: Number.isFinite(ev?.context?.impactEnemyId) ? Math.trunc(ev.context.impactEnemyId) : null,
      },
    });
  }
  lingeringAoeZones.length = 0;
  for (const z of Array.isArray(state.lingeringAoeZones) ? state.lingeringAoeZones : []) {
    lingeringAoeZones.push({
      x: Number(z.x) || 0,
      y: Number(z.y) || 0,
      radius: Math.max(1, Number(z.radius) || EXPLOSION_RADIUS_WORLD),
      damagePerBeat: Math.max(0, Number(z.damagePerBeat) || 1),
      untilBeat: Math.max(0, Math.trunc(Number(z.untilBeat) || 0)),
      weaponSlotIndex: Number.isFinite(z.weaponSlotIndex) ? Math.trunc(z.weaponSlotIndex) : null,
    });
  }
  currentBeatIndex = Math.max(0, Math.trunc(Number(state.currentBeatIndex) || 0));

  clearEnemies();
  clearPickups();
  clearProjectiles();
  clearEffects();
  clearHelpers();

  for (const e of Array.isArray(state.enemies) ? state.enemies : []) {
    spawnEnemyFromState(e);
  }
  // Pickups temporarily disabled in Beat Swarm (kept for future re-enable).
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
      kind: String(p.kind || 'standard'),
      boomCenterX: Number(p.boomCenterX) || 0,
      boomCenterY: Number(p.boomCenterY) || 0,
      boomDirX: Number(p.boomDirX) || 0,
      boomDirY: Number(p.boomDirY) || 0,
      boomPerpX: Number(p.boomPerpX) || 0,
      boomPerpY: Number(p.boomPerpY) || 0,
      boomRadius: Math.max(0, Number(p.boomRadius) || 0),
      boomTheta: Number(p.boomTheta) || 0,
      boomOmega: Number(p.boomOmega) || 0,
      homingState: String(p.homingState || ''),
      targetEnemyId: Number.isFinite(p.targetEnemyId) ? Math.trunc(p.targetEnemyId) : null,
      orbitAngle: Number(p.orbitAngle) || 0,
      orbitAngVel: Number(p.orbitAngVel) || 0,
      orbitRadius: Math.max(0, Number(p.orbitRadius) || 0),
      hitEnemyIds: new Set(Array.isArray(p.hitEnemyIds) ? p.hitEnemyIds.map((id) => Math.trunc(Number(id) || 0)).filter((id) => id > 0) : []),
      chainWeaponSlotIndex: Number.isFinite(p.chainWeaponSlotIndex) ? Math.trunc(p.chainWeaponSlotIndex) : null,
      chainStageIndex: Number.isFinite(p.chainStageIndex) ? Math.trunc(p.chainStageIndex) : null,
      nextStages: sanitizeWeaponStages(p.nextStages),
      nextBeatIndex: Number.isFinite(p.nextBeatIndex) ? Math.max(0, Math.trunc(p.nextBeatIndex)) : null,
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
        weaponSlotIndex: Number.isFinite(fx.weaponSlotIndex) ? Math.trunc(fx.weaponSlotIndex) : null,
        el,
      });
    } else if (fx.kind === 'beam') {
      el.className = 'beat-swarm-fx-laser';
      enemyLayerEl.appendChild(el);
      effects.push({
        kind: 'beam',
        ttl: Math.max(0, Number(fx.ttl) || 0),
        from: fx.from ? { x: Number(fx.from.x) || 0, y: Number(fx.from.y) || 0 } : { x: 0, y: 0 },
        to: fx.to ? { x: Number(fx.to.x) || 0, y: Number(fx.to.y) || 0 } : { x: 0, y: 0 },
        targetEnemyId: Number.isFinite(fx.targetEnemyId) ? Math.trunc(fx.targetEnemyId) : null,
        damagePerSec: Math.max(0, Number(fx.damagePerSec) || BEAM_DAMAGE_PER_SECOND),
        weaponSlotIndex: Number.isFinite(fx.weaponSlotIndex) ? Math.trunc(fx.weaponSlotIndex) : null,
        el,
      });
    } else if (fx.kind === 'explosion') {
      el.className = 'beat-swarm-fx-explosion';
      el.style.transform = 'translate(-9999px, -9999px)';
      enemyLayerEl.appendChild(el);
      effects.push({
        kind: 'explosion',
        ttl: Math.max(0, Number(fx.ttl) || 0),
        at: fx.at ? { x: Number(fx.at.x) || 0, y: Number(fx.at.y) || 0 } : { x: 0, y: 0 },
        radiusWorld: Math.max(1, Number(fx.radiusWorld) || EXPLOSION_RADIUS_WORLD),
        weaponSlotIndex: Number.isFinite(fx.weaponSlotIndex) ? Math.trunc(fx.weaponSlotIndex) : null,
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
      <div class="beat-swarm-pause-label" aria-hidden="true">PAUSE</div>
      <div class="beat-swarm-pause-screen" aria-hidden="true"></div>
      <div class="beat-swarm-starfield-layer" aria-hidden="true"></div>
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
  pauseLabelEl = overlayEl.querySelector('.beat-swarm-pause-label');
  pauseScreenEl = overlayEl.querySelector('.beat-swarm-pause-screen');
  starfieldLayerEl = overlayEl.querySelector('.beat-swarm-starfield-layer');
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
  ensurePauseWeaponUi();

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

function setGameplayPaused(next) {
  gameplayPaused = !!next;
  if (gameplayPaused) {
    dragPointerId = null;
    setJoystickVisible(false);
    setReactiveArrowVisual(false);
    setThrustFxVisual(false);
    barrierPushingOut = false;
    barrierPushCharge = 0;
    outerForceContinuousSeconds = 0;
    releaseForcePrimed = false;
  }
  pauseLabelEl?.classList?.toggle?.('is-visible', gameplayPaused);
  pauseScreenEl?.classList?.toggle?.('is-visible', gameplayPaused);
  if (gameplayPaused) {
    resetPausePreviewState();
  } else {
    stopComponentLivePreviews();
  }
}

function createRandomWeaponStages() {
  const archetypes = Object.values(WEAPON_ARCHETYPES);
  const count = Math.max(1, Math.min(MAX_WEAPON_STAGES, 1 + Math.floor(Math.random() * MAX_WEAPON_STAGES)));
  const out = [];
  for (let i = 0; i < count; i++) {
    const a = archetypes[Math.floor(Math.random() * archetypes.length)] || WEAPON_ARCHETYPES.projectile;
    const variants = Array.isArray(a.variants) ? a.variants : [];
      const v = variants[Math.floor(Math.random() * variants.length)] || variants[0];
      out.push({
        archetype: a.id,
        variant: v?.id || getArchetypeDef(a.id)?.variants?.[0]?.id || 'standard',
      });
  }
  return sanitizeWeaponStages(out);
}

function clearPausePreviewVisuals() {
  for (const e of pausePreview.enemies) {
    try { e?.el?.remove?.(); } catch {}
  }
  for (const p of pausePreview.projectiles) {
    try { p?.el?.remove?.(); } catch {}
  }
  for (const fx of pausePreview.effects) {
    try { fx?.el?.remove?.(); } catch {}
  }
  for (const h of pausePreview.helpers) {
    try { h?.elA?.remove?.(); } catch {}
    try { h?.elB?.remove?.(); } catch {}
    try { h?.el?.remove?.(); } catch {}
  }
  pausePreview.enemies.length = 0;
  pausePreview.projectiles.length = 0;
  pausePreview.effects.length = 0;
  pausePreview.helpers.length = 0;
  pausePreview.pendingEvents.length = 0;
  pausePreview.aoeZones.length = 0;
  pausePreview.beatIndex = 0;
  pausePreview.beatTimer = 0;
}

function getHelperKey(slotIndex, stageIndex) {
  const si = Number.isFinite(slotIndex) ? Math.trunc(slotIndex) : Math.trunc(Number(slotIndex));
  const ti = Number.isFinite(stageIndex) ? Math.trunc(stageIndex) : Math.trunc(Number(stageIndex));
  return `${Number.isFinite(si) ? si : -1}:${Number.isFinite(ti) ? ti : -1}`;
}

function getEnemyById(enemyId) {
  const id = Math.trunc(Number(enemyId) || 0);
  if (!(id > 0)) return null;
  return enemies.find((e) => Math.trunc(Number(e.id) || 0) === id) || null;
}

function hasActiveHelperByKey(helperKey) {
  return helpers.some((h) => String(h?.key || '') === String(helperKey || ''));
}

function createHelperVisuals(kind) {
  if (!enemyLayerEl) return null;
  if (kind === 'orbital-drone') {
    const elA = document.createElement('div');
    const elB = document.createElement('div');
    elA.className = 'beat-swarm-projectile beat-swarm-helper-orbital';
    elB.className = 'beat-swarm-projectile beat-swarm-helper-orbital';
    enemyLayerEl.appendChild(elA);
    enemyLayerEl.appendChild(elB);
    return { elA, elB };
  }
  const el = document.createElement('div');
  el.className = 'beat-swarm-projectile beat-swarm-helper-turret';
  enemyLayerEl.appendChild(el);
  return { el };
}

function spawnHelper(kind, anchorWorld, beatIndex, nextStages = [], context = null, anchorEnemyId = null) {
  if (!enemyLayerEl || !anchorWorld || !kind) return false;
  const slotRaw = Number(context?.weaponSlotIndex);
  const stageRaw = Number(context?.stageIndex);
  const slotIndex = Number.isFinite(slotRaw) ? Math.trunc(slotRaw) : -1;
  const stageIndex = Number.isFinite(stageRaw) ? Math.trunc(stageRaw) : -1;
  const key = getHelperKey(slotIndex, stageIndex);
  if (hasActiveHelperByKey(key)) return false;
  const visuals = createHelperVisuals(kind);
  if (!visuals) return false;
  helpers.push({
    id: helperIdSeq++,
    key,
    kind,
    anchorType: Number.isFinite(anchorEnemyId)
      ? 'enemy'
      : (String(context?.helperAnchorType || '') === 'player' ? 'player' : 'world'),
    anchorEnemyId: Number.isFinite(anchorEnemyId) ? Math.trunc(anchorEnemyId) : null,
    anchorX: Number(anchorWorld.x) || 0,
    anchorY: Number(anchorWorld.y) || 0,
    orbitAngle: 0,
    orbitRadius: HELPER_ORBIT_RADIUS_WORLD,
    orbitAngVel: HELPER_ORBIT_ANG_VEL,
    untilBeat: Math.max(0, Math.trunc(Number(beatIndex) || 0)) + HELPER_LIFETIME_BEATS,
    nextStages: sanitizeWeaponStages(nextStages),
    context: {
      weaponSlotIndex: slotIndex,
      stageIndex,
    },
    elA: visuals.elA || null,
    elB: visuals.elB || null,
    el: visuals.el || null,
  });
  return true;
}

function updateHelpers(dt, centerWorld, scale) {
  const impactRadiusWorld = HELPER_IMPACT_RADIUS_PX / Math.max(0.001, scale || 1);
  const ir2 = impactRadiusWorld * impactRadiusWorld;
  for (let i = helpers.length - 1; i >= 0; i--) {
    const h = helpers[i];
    if ((Number(h.untilBeat) || 0) < currentBeatIndex) {
      try { h?.elA?.remove?.(); } catch {}
      try { h?.elB?.remove?.(); } catch {}
      try { h?.el?.remove?.(); } catch {}
      helpers.splice(i, 1);
      continue;
    }
    if (String(h.anchorType) === 'enemy') {
      const e = getEnemyById(h.anchorEnemyId);
      if (e) {
        h.anchorX = Number(e.wx) || 0;
        h.anchorY = Number(e.wy) || 0;
      } else {
        h.anchorType = 'world';
        h.anchorEnemyId = null;
      }
    } else if (String(h.anchorType) === 'player' && centerWorld) {
      h.anchorX = Number(centerWorld.x) || 0;
      h.anchorY = Number(centerWorld.y) || 0;
    }

    if (h.kind === 'orbital-drone') {
      h.orbitAngle = (Number(h.orbitAngle) || 0) + ((Number(h.orbitAngVel) || HELPER_ORBIT_ANG_VEL) * dt);
      const pts = [
        {
          x: h.anchorX + (Math.cos(h.orbitAngle) * (Number(h.orbitRadius) || HELPER_ORBIT_RADIUS_WORLD)),
          y: h.anchorY + (Math.sin(h.orbitAngle) * (Number(h.orbitRadius) || HELPER_ORBIT_RADIUS_WORLD)),
          el: h.elA,
        },
        {
          x: h.anchorX + (Math.cos(h.orbitAngle + Math.PI) * (Number(h.orbitRadius) || HELPER_ORBIT_RADIUS_WORLD)),
          y: h.anchorY + (Math.sin(h.orbitAngle + Math.PI) * (Number(h.orbitRadius) || HELPER_ORBIT_RADIUS_WORLD)),
          el: h.elB,
        },
      ];
      for (const p of pts) {
        for (let j = enemies.length - 1; j >= 0; j--) {
          const e = enemies[j];
          const dx = e.wx - p.x;
          const dy = e.wy - p.y;
          if ((dx * dx + dy * dy) <= ir2) damageEnemy(e, HELPER_IMPACT_DAMAGE * dt * 8);
        }
        const s = worldToScreen({ x: p.x, y: p.y });
        if (p.el && s && Number.isFinite(s.x) && Number.isFinite(s.y)) p.el.style.transform = `translate(${s.x}px, ${s.y}px)`;
      }
    } else {
      for (let j = enemies.length - 1; j >= 0; j--) {
        const e = enemies[j];
        const dx = e.wx - h.anchorX;
        const dy = e.wy - h.anchorY;
        if ((dx * dx + dy * dy) <= ir2) damageEnemy(e, HELPER_IMPACT_DAMAGE * dt * 7);
      }
      const s = worldToScreen({ x: h.anchorX, y: h.anchorY });
      if (h.el && s && Number.isFinite(s.x) && Number.isFinite(s.y)) h.el.style.transform = `translate(${s.x}px, ${s.y}px)`;
    }
  }
}

function fireHelperPayloadAt(originWorld, helperObj, beatIndex) {
  const stages = sanitizeWeaponStages(helperObj?.nextStages);
  const slotRaw = Number(helperObj?.context?.weaponSlotIndex);
  const stageRaw = Number(helperObj?.context?.stageIndex);
  const slotIndex = Number.isFinite(slotRaw) ? Math.trunc(slotRaw) : -1;
  const baseStageIndex = Number.isFinite(stageRaw) ? Math.trunc(stageRaw) : -1;
  const nearest = getNearestEnemy(originWorld.x, originWorld.y);
  if (!stages.length) {
    const dir = nearest
      ? normalizeDir(nearest.wx - originWorld.x, nearest.wy - originWorld.y)
      : getShipFacingDirWorld();
    spawnProjectileFromDirection(originWorld, dir.x, dir.y, 2, null, null);
    return;
  }
  const first = stages[0];
  const rest = stages.slice(1);
  if (first.archetype === 'helper') {
    if (first.variant && first.variant !== helperObj.kind) {
      const helperSpawnPoint = (first.variant === 'turret')
        ? getOffsetPoint(
          originWorld,
          nearest ? { x: nearest.wx, y: nearest.wy } : null,
          HELPER_TURRET_SPAWN_OFFSET_WORLD,
          getShipFacingDirWorld()
        )
        : originWorld;
      spawnHelper(first.variant, helperSpawnPoint, beatIndex, rest, {
        weaponSlotIndex: slotIndex,
        stageIndex: baseStageIndex + 1,
        helperAnchorType: 'world',
      }, null);
    }
    const dir = nearest
      ? normalizeDir(nearest.wx - originWorld.x, nearest.wy - originWorld.y)
      : getShipFacingDirWorld();
    spawnProjectileFromDirection(originWorld, dir.x, dir.y, 2, null, null);
    return;
  }
  triggerWeaponStage(first, originWorld, beatIndex, rest, {
    origin: originWorld,
    impactPoint: originWorld,
    weaponSlotIndex: slotIndex,
    stageIndex: baseStageIndex + 1,
  });
}

function fireHelpersOnBeat(beatIndex) {
  for (const h of helpers) {
    if ((Number(h.untilBeat) || 0) < beatIndex) continue;
    if (h.kind === 'orbital-drone') {
      const r = Number(h.orbitRadius) || HELPER_ORBIT_RADIUS_WORLD;
      const a = Number(h.orbitAngle) || 0;
      const points = [
        { x: h.anchorX + (Math.cos(a) * r), y: h.anchorY + (Math.sin(a) * r) },
        { x: h.anchorX + (Math.cos(a + Math.PI) * r), y: h.anchorY + (Math.sin(a + Math.PI) * r) },
      ];
      for (const p of points) fireHelperPayloadAt(p, h, beatIndex);
    } else {
      fireHelperPayloadAt({ x: h.anchorX, y: h.anchorY }, h, beatIndex);
    }
  }
}

function getPausePreviewHelperKey(slotIndex, stageIndex) {
  const si = Number.isFinite(slotIndex) ? Math.trunc(slotIndex) : Math.trunc(Number(slotIndex));
  const ti = Number.isFinite(stageIndex) ? Math.trunc(stageIndex) : Math.trunc(Number(stageIndex));
  return `${Number.isFinite(si) ? si : -1}:${Number.isFinite(ti) ? ti : -1}`;
}

function hasActivePausePreviewHelperByKey(helperKey) {
  return pausePreview.helpers.some((h) => String(h?.key || '') === String(helperKey || ''));
}

function createPausePreviewHelperVisuals(kind) {
  if (!pausePreviewSceneEl) return null;
  if (kind === 'orbital-drone') {
    const elA = document.createElement('div');
    const elB = document.createElement('div');
    elA.className = 'beat-swarm-preview-projectile beat-swarm-preview-helper-orbital';
    elB.className = 'beat-swarm-preview-projectile beat-swarm-preview-helper-orbital';
    pausePreviewSceneEl.appendChild(elA);
    pausePreviewSceneEl.appendChild(elB);
    return { elA, elB };
  }
  const el = document.createElement('div');
  el.className = 'beat-swarm-preview-projectile beat-swarm-preview-helper-turret';
  pausePreviewSceneEl.appendChild(el);
  return { el };
}

function spawnPausePreviewHelper(kind, anchorPoint, beatIndex, nextStages = [], context = null, anchorEnemy = null) {
  if (!pausePreviewSceneEl || !kind || !anchorPoint) return false;
  const slotRaw = Number(context?.weaponSlotIndex);
  const stageRaw = Number(context?.stageIndex);
  const slotIndex = Number.isFinite(slotRaw) ? Math.trunc(slotRaw) : -1;
  const stageIndex = Number.isFinite(stageRaw) ? Math.trunc(stageRaw) : -1;
  const key = getPausePreviewHelperKey(slotIndex, stageIndex);
  if (hasActivePausePreviewHelperByKey(key)) return false;
  const visuals = createPausePreviewHelperVisuals(kind);
  if (!visuals) return false;
  pausePreview.helpers.push({
    key,
    kind,
    anchorType: anchorEnemy ? 'enemy' : (String(context?.helperAnchorType || '') === 'player' ? 'player' : 'world'),
    anchorEnemy: anchorEnemy || null,
    anchorX: Number(anchorPoint.x) || 0,
    anchorY: Number(anchorPoint.y) || 0,
    orbitAngle: 0,
    orbitRadius: PREVIEW_HELPER_ORBIT_RADIUS,
    orbitAngVel: PREVIEW_HELPER_ORBIT_ANG_VEL,
    untilBeat: Math.max(0, Math.trunc(Number(beatIndex) || 0)) + PREVIEW_HELPER_LIFETIME_BEATS,
    nextStages: sanitizeWeaponStages(nextStages),
    context: {
      weaponSlotIndex: slotIndex,
      stageIndex,
    },
    elA: visuals.elA || null,
    elB: visuals.elB || null,
    el: visuals.el || null,
  });
  return true;
}

function firePausePreviewHelperPayloadAt(origin, helperObj, beatIndex) {
  const stages = sanitizeWeaponStages(helperObj?.nextStages);
  const slotRaw = Number(helperObj?.context?.weaponSlotIndex);
  const stageRaw = Number(helperObj?.context?.stageIndex);
  const slotIndex = Number.isFinite(slotRaw) ? Math.trunc(slotRaw) : -1;
  const baseStageIndex = Number.isFinite(stageRaw) ? Math.trunc(stageRaw) : -1;
  const nearest = getPausePreviewNearestEnemies(origin.x, origin.y, 1)[0] || null;
  if (!stages.length) {
    const dir = nearest
      ? normalizeDir(nearest.x - origin.x, nearest.y - origin.y)
      : { x: 1, y: 0 };
    spawnPausePreviewProjectileFromDirection(origin, dir.x, dir.y, 2, null, null, null);
    return;
  }
  const first = stages[0];
  const rest = stages.slice(1);
  if (first.archetype === 'helper') {
    if (first.variant && first.variant !== helperObj.kind) {
      const helperSpawnPoint = (first.variant === 'turret')
        ? getOffsetPoint(
          origin,
          nearest ? { x: nearest.x, y: nearest.y } : null,
          PREVIEW_HELPER_TURRET_SPAWN_OFFSET,
          { x: 1, y: 0 }
        )
        : origin;
      spawnPausePreviewHelper(first.variant, helperSpawnPoint, beatIndex, rest, {
        weaponSlotIndex: slotIndex,
        stageIndex: baseStageIndex + 1,
        helperAnchorType: 'world',
      }, null);
    }
    const dir = nearest
      ? normalizeDir(nearest.x - origin.x, nearest.y - origin.y)
      : { x: 1, y: 0 };
    spawnPausePreviewProjectileFromDirection(origin, dir.x, dir.y, 2, null, null, null);
    return;
  }
  triggerPausePreviewWeaponStage(first, origin, beatIndex, rest, {
    origin,
    impactPoint: origin,
    weaponSlotIndex: slotIndex,
    stageIndex: baseStageIndex + 1,
  });
}

function firePausePreviewHelpersOnBeat(beatIndex) {
  for (const h of pausePreview.helpers) {
    if ((Number(h.untilBeat) || 0) < beatIndex) continue;
    if (h.kind === 'orbital-drone') {
      const r = Number(h.orbitRadius) || PREVIEW_HELPER_ORBIT_RADIUS;
      const a = Number(h.orbitAngle) || 0;
      const points = [
        { x: h.anchorX + (Math.cos(a) * r), y: h.anchorY + (Math.sin(a) * r) },
        { x: h.anchorX + (Math.cos(a + Math.PI) * r), y: h.anchorY + (Math.sin(a + Math.PI) * r) },
      ];
      for (const p of points) firePausePreviewHelperPayloadAt(p, h, beatIndex);
    } else {
      firePausePreviewHelperPayloadAt({ x: h.anchorX, y: h.anchorY }, h, beatIndex);
    }
  }
}

function updatePausePreviewHelpers(dt) {
  const ir = Math.max(4, Number(PREVIEW_HELPER_IMPACT_RADIUS) || 12);
  const ir2 = ir * ir;
  for (let i = pausePreview.helpers.length - 1; i >= 0; i--) {
    const h = pausePreview.helpers[i];
    if ((Number(h.untilBeat) || 0) < pausePreview.beatIndex) {
      try { h?.elA?.remove?.(); } catch {}
      try { h?.elB?.remove?.(); } catch {}
      try { h?.el?.remove?.(); } catch {}
      pausePreview.helpers.splice(i, 1);
      continue;
    }
    if (String(h.anchorType) === 'enemy') {
      if (h.anchorEnemy && pausePreview.enemies.includes(h.anchorEnemy)) {
        h.anchorX = Number(h.anchorEnemy.x) || 0;
        h.anchorY = Number(h.anchorEnemy.y) || 0;
      } else {
        h.anchorType = 'world';
        h.anchorEnemy = null;
      }
    } else if (String(h.anchorType) === 'player') {
      h.anchorX = Number(pausePreview.ship.x) || 0;
      h.anchorY = Number(pausePreview.ship.y) || 0;
    }
    if (h.kind === 'orbital-drone') {
      h.orbitAngle = (Number(h.orbitAngle) || 0) + ((Number(h.orbitAngVel) || PREVIEW_HELPER_ORBIT_ANG_VEL) * dt);
      const pts = [
        {
          x: h.anchorX + (Math.cos(h.orbitAngle) * (Number(h.orbitRadius) || PREVIEW_HELPER_ORBIT_RADIUS)),
          y: h.anchorY + (Math.sin(h.orbitAngle) * (Number(h.orbitRadius) || PREVIEW_HELPER_ORBIT_RADIUS)),
          el: h.elA,
        },
        {
          x: h.anchorX + (Math.cos(h.orbitAngle + Math.PI) * (Number(h.orbitRadius) || PREVIEW_HELPER_ORBIT_RADIUS)),
          y: h.anchorY + (Math.sin(h.orbitAngle + Math.PI) * (Number(h.orbitRadius) || PREVIEW_HELPER_ORBIT_RADIUS)),
          el: h.elB,
        },
      ];
      for (const p of pts) {
        for (let j = pausePreview.enemies.length - 1; j >= 0; j--) {
          const e = pausePreview.enemies[j];
          const dx = e.x - p.x;
          const dy = e.y - p.y;
          if ((dx * dx + dy * dy) <= ir2) damagePausePreviewEnemy(e, PREVIEW_HELPER_IMPACT_DAMAGE * dt * 8);
        }
        if (p.el) p.el.style.transform = `translate(${p.x.toFixed(2)}px, ${p.y.toFixed(2)}px)`;
      }
    } else {
      for (let j = pausePreview.enemies.length - 1; j >= 0; j--) {
        const e = pausePreview.enemies[j];
        const dx = e.x - h.anchorX;
        const dy = e.y - h.anchorY;
        if ((dx * dx + dy * dy) <= ir2) damagePausePreviewEnemy(e, PREVIEW_HELPER_IMPACT_DAMAGE * dt * 7);
      }
      if (h.el) h.el.style.transform = `translate(${h.anchorX.toFixed(2)}px, ${h.anchorY.toFixed(2)}px)`;
    }
  }
}

function spawnPausePreviewEnemy() {
  if (!pausePreviewSceneEl) return;
  const minX = pausePreview.width * 0.48;
  const maxX = pausePreview.width * 0.9;
  const minY = pausePreview.height * 0.18;
  const maxY = pausePreview.height * 0.84;
  const x = randRange(minX, maxX);
  const y = randRange(minY, maxY);
  const el = document.createElement('div');
  el.className = 'beat-swarm-preview-enemy';
  pausePreviewSceneEl.appendChild(el);
  pausePreview.enemies.push({
    x,
    y,
    hp: PREVIEW_ENEMY_HP,
    maxHp: PREVIEW_ENEMY_HP,
    el,
  });
}

function resetPausePreviewState() {
  if (!pausePreviewSceneEl) return;
  const rect = pausePreviewSceneEl.getBoundingClientRect();
  pausePreview.width = Math.max(260, Number(rect.width) || 0);
  pausePreview.height = Math.max(200, Number(rect.height) || 0);
  pausePreview.ship.x = pausePreview.width * 0.18;
  pausePreview.ship.y = pausePreview.height * 0.55;
  clearPausePreviewVisuals();
  pausePreviewSceneEl.innerHTML = '';
  const shipEl = document.createElement('div');
  shipEl.className = 'beat-swarm-preview-ship';
  pausePreviewSceneEl.appendChild(shipEl);
  pausePreview.ship.el = shipEl;
  for (let i = 0; i < PREVIEW_ENEMY_COUNT; i++) spawnPausePreviewEnemy();
  pausePreview.initialized = true;
}

function ensurePausePreviewState() {
  if (!pausePreviewSceneEl) return;
  const rect = pausePreviewSceneEl.getBoundingClientRect();
  const w = Math.max(260, Number(rect.width) || 0);
  const h = Math.max(200, Number(rect.height) || 0);
  if (!pausePreview.initialized || Math.abs(w - pausePreview.width) > 1 || Math.abs(h - pausePreview.height) > 1) {
    resetPausePreviewState();
  }
}

function getPausePreviewNearestEnemies(x, y, count = 1) {
  const scored = pausePreview.enemies.map((e) => {
    const dx = e.x - x;
    const dy = e.y - y;
    return { e, d2: (dx * dx) + (dy * dy) };
  });
  scored.sort((a, b) => a.d2 - b.d2);
  return scored.slice(0, Math.max(1, Math.trunc(Number(count) || 1))).map((it) => it.e);
}

function removePausePreviewEnemy(enemy) {
  if (!enemy) return;
  const idx = pausePreview.enemies.indexOf(enemy);
  if (idx >= 0) pausePreview.enemies.splice(idx, 1);
  try { enemy.el?.remove?.(); } catch {}
}

function damagePausePreviewEnemy(enemy, amount = 1) {
  if (!enemy) return false;
  enemy.hp -= Math.max(0, Number(amount) || 0);
  pulseHitFlash(enemy.el);
  if (enemy.hp <= 0) {
    removePausePreviewEnemy(enemy);
    return true;
  }
  return false;
}

function queuePausePreviewChain(beatIndex, nextStages, context) {
  const stages = sanitizeWeaponStages(nextStages);
  if (!stages.length) return;
  pausePreview.pendingEvents.push({
    beatIndex: Math.max(0, Math.trunc(Number(beatIndex) || 0)),
    stages,
    context: {
      origin: context?.origin ? { x: Number(context.origin.x) || 0, y: Number(context.origin.y) || 0 } : null,
      impactPoint: context?.impactPoint ? { x: Number(context.impactPoint.x) || 0, y: Number(context.impactPoint.y) || 0 } : null,
      weaponSlotIndex: Number.isFinite(context?.weaponSlotIndex) ? Math.trunc(context.weaponSlotIndex) : null,
      stageIndex: Number.isFinite(context?.stageIndex) ? Math.trunc(context.stageIndex) : null,
      impactEnemy: context?.impactEnemy || null,
    },
  });
}

function countPausePreviewOrbitingHomingMissiles() {
  let n = 0;
  for (const p of pausePreview.projectiles) {
    if (String(p?.kind || '') !== 'homing-missile') continue;
    if (String(p?.homingState || '') !== 'orbit') continue;
    n += 1;
  }
  return n;
}

function addPausePreviewLaser(from, to) {
  if (!pausePreviewSceneEl) return;
  const el = document.createElement('div');
  el.className = 'beat-swarm-preview-fx-laser';
  pausePreviewSceneEl.appendChild(el);
  pausePreview.effects.push({
    kind: 'laser',
    ttl: PREVIEW_LASER_TTL,
    from: { x: from.x, y: from.y },
    to: { x: to.x, y: to.y },
    el,
  });
}

function addPausePreviewBeam(from, target, ttl = null) {
  if (!pausePreviewSceneEl || !target) return;
  const el = document.createElement('div');
  el.className = 'beat-swarm-preview-fx-laser';
  pausePreviewSceneEl.appendChild(el);
  pausePreview.effects.push({
    kind: 'beam',
    ttl: Math.max(0.05, Number.isFinite(ttl) ? Number(ttl) : getPausePreviewBeatLen()),
    from: { x: from.x, y: from.y },
    to: { x: target.x, y: target.y },
    targetEnemy: target,
    damagePerSec: PREVIEW_BEAM_DAMAGE_PER_SECOND,
    el,
  });
}

function addPausePreviewExplosion(at, radius = PREVIEW_EXPLOSION_RADIUS, ttl = PREVIEW_EXPLOSION_TTL) {
  if (!pausePreviewSceneEl) return;
  const el = document.createElement('div');
  el.className = 'beat-swarm-preview-fx-explosion';
  pausePreviewSceneEl.appendChild(el);
  pausePreview.effects.push({
    kind: 'explosion',
    ttl: Math.max(0.01, Number(ttl) || PREVIEW_EXPLOSION_TTL),
    at: { x: at.x, y: at.y },
    radius: Math.max(8, Number(radius) || PREVIEW_EXPLOSION_RADIUS),
    el,
  });
}

function spawnPausePreviewProjectileFromDirection(from, dirX, dirY, damage, nextStages = null, nextBeatIndex = null, chainContext = null) {
  if (!pausePreviewSceneEl) return;
  const dir = normalizeDir(dirX, dirY);
  const el = document.createElement('div');
  el.className = 'beat-swarm-preview-projectile';
  pausePreviewSceneEl.appendChild(el);
  pausePreview.projectiles.push({
    x: from.x,
    y: from.y,
    vx: dir.x * PREVIEW_PROJECTILE_SPEED,
    vy: dir.y * PREVIEW_PROJECTILE_SPEED,
    ttl: PREVIEW_PROJECTILE_LIFETIME,
    damage: Math.max(1, Number(damage) || 1),
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
    nextStages: sanitizeWeaponStages(nextStages),
    nextBeatIndex: Number.isFinite(nextBeatIndex) ? Math.max(0, Math.trunc(nextBeatIndex)) : null,
    el,
  });
}

function spawnPausePreviewProjectile(from, target, damage, nextStages = null, nextBeatIndex = null, chainContext = null) {
  if (!target) return;
  spawnPausePreviewProjectileFromDirection(from, target.x - from.x, target.y - from.y, damage, nextStages, nextBeatIndex, chainContext);
}

function spawnPausePreviewBoomerangProjectile(from, dirX, dirY, damage, nextStages = null, nextBeatIndex = null, chainContext = null) {
  if (!pausePreviewSceneEl) return;
  const dir = normalizeDir(dirX, dirY);
  const perp = { x: dir.y, y: -dir.x };
  const radius = Math.max(20, Number(PREVIEW_PROJECTILE_BOOMERANG_RADIUS) || 42);
  const theta = Math.PI;
  const omega = (Math.PI * 2) / Math.max(0.35, Number(PREVIEW_PROJECTILE_BOOMERANG_LOOP_SECONDS) || 1.15);
  const el = document.createElement('div');
  el.className = 'beat-swarm-preview-projectile';
  pausePreviewSceneEl.appendChild(el);
  pausePreview.projectiles.push({
    x: from.x,
    y: from.y,
    vx: 0,
    vy: 0,
    ttl: Math.max(0.35, Number(PREVIEW_PROJECTILE_BOOMERANG_LOOP_SECONDS) || 1.15),
    damage: Math.max(1, Number(damage) || 1),
    kind: 'boomerang',
    boomCenterX: from.x,
    boomCenterY: from.y,
    boomDirX: dir.x,
    boomDirY: dir.y,
    boomPerpX: perp.x,
    boomPerpY: perp.y,
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
    nextStages: sanitizeWeaponStages(nextStages),
    nextBeatIndex: Number.isFinite(nextBeatIndex) ? Math.max(0, Math.trunc(nextBeatIndex)) : null,
    el,
  });
}

function spawnPausePreviewHomingMissile(from, damage, nextStages = null, nextBeatIndex = null, chainContext = null) {
  if (!pausePreviewSceneEl) return false;
  if (countPausePreviewOrbitingHomingMissiles() >= PREVIEW_PROJECTILE_HOMING_MAX_ORBITING) return false;
  const orbitCount = countPausePreviewOrbitingHomingMissiles();
  const angle = ((orbitCount / Math.max(1, PREVIEW_PROJECTILE_HOMING_MAX_ORBITING)) * Math.PI * 2);
  const el = document.createElement('div');
  el.className = 'beat-swarm-preview-projectile';
  pausePreviewSceneEl.appendChild(el);
  pausePreview.projectiles.push({
    x: from.x,
    y: from.y,
    vx: 0,
    vy: 0,
    ttl: 60,
    damage: Math.max(1, Number(damage) || 1),
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
    orbitAngVel: PREVIEW_PROJECTILE_HOMING_ORBIT_ANG_VEL,
    orbitRadius: PREVIEW_PROJECTILE_HOMING_ORBIT_RADIUS,
    hitEnemyIds: new Set(),
    chainWeaponSlotIndex: Number.isFinite(chainContext?.weaponSlotIndex) ? Math.trunc(chainContext.weaponSlotIndex) : null,
    chainStageIndex: Number.isFinite(chainContext?.stageIndex) ? Math.trunc(chainContext.stageIndex) : null,
    nextStages: sanitizeWeaponStages(nextStages),
    nextBeatIndex: Number.isFinite(nextBeatIndex) ? Math.max(0, Math.trunc(nextBeatIndex)) : null,
    el,
  });
  return true;
}

function applyPausePreviewAoeAt(point, variant = 'explosion', beatIndex = 0) {
  const isDot = variant === 'dot-area';
  addPausePreviewExplosion(point, PREVIEW_EXPLOSION_RADIUS, isDot ? (getPausePreviewBeatLen() * 2) : PREVIEW_EXPLOSION_TTL);
  const r2 = PREVIEW_EXPLOSION_RADIUS * PREVIEW_EXPLOSION_RADIUS;
  for (let i = pausePreview.enemies.length - 1; i >= 0; i--) {
    const e = pausePreview.enemies[i];
    const dx = e.x - point.x;
    const dy = e.y - point.y;
    if ((dx * dx + dy * dy) <= r2) damagePausePreviewEnemy(e, isDot ? 0.5 : 1);
  }
  if (isDot) {
    pausePreview.aoeZones.push({
      x: point.x,
      y: point.y,
      radius: PREVIEW_EXPLOSION_RADIUS,
      damagePerBeat: 0.6,
      untilBeat: Math.max(beatIndex + 2, beatIndex + 1),
    });
  }
}

function triggerPausePreviewWeaponStage(stage, origin, beatIndex, remainingStages = [], context = null) {
  if (!stage || !origin) return;
  const archetype = stage.archetype;
  const variant = stage.variant;
  const continuation = sanitizeWeaponStages(remainingStages);
  const slotIndex = Number.isFinite(context?.weaponSlotIndex) ? Math.trunc(context.weaponSlotIndex) : -1;
  const stageIndex = Number.isFinite(context?.stageIndex) ? Math.trunc(context.stageIndex) : 0;
  const nextCtx = { weaponSlotIndex: slotIndex, stageIndex: stageIndex + 1 };
  const nearest = getPausePreviewNearestEnemies(origin.x, origin.y, 1)[0] || null;
  if (archetype === 'projectile') {
    const baseDir = nearest
      ? normalizeDir(nearest.x - origin.x, nearest.y - origin.y)
      : { x: 1, y: 0 };
    if (variant === 'homing-missile') {
      spawnPausePreviewHomingMissile(origin, 2, continuation, beatIndex + 1, nextCtx);
      return;
    }
    if (variant === 'boomerang') {
      spawnPausePreviewBoomerangProjectile(origin, baseDir.x, baseDir.y, 2, continuation, beatIndex + 1, nextCtx);
      return;
    }
    if (variant === 'split-shot') {
      const baseAngle = Math.atan2(baseDir.y, baseDir.x);
      const angles = [baseAngle, baseAngle - PREVIEW_PROJECTILE_SPLIT_ANGLE_RAD, baseAngle + PREVIEW_PROJECTILE_SPLIT_ANGLE_RAD];
      for (const ang of angles) {
        spawnPausePreviewProjectileFromDirection(origin, Math.cos(ang), Math.sin(ang), 2, continuation, beatIndex + 1, nextCtx);
      }
      return;
    }
    if (nearest) {
      spawnPausePreviewProjectile(origin, nearest, 2, continuation, beatIndex + 1, nextCtx);
    } else {
      spawnPausePreviewProjectileFromDirection(origin, baseDir.x, baseDir.y, 2, continuation, beatIndex + 1, nextCtx);
    }
    return;
  }
  if (archetype === 'helper') {
    const impactEnemy = (variant !== 'turret') ? (context?.impactEnemy || null) : null;
    const defaultAnchorType = (variant === 'orbital-drone') ? 'player' : 'world';
    const turretSpawnPoint = (variant === 'turret')
      ? { x: origin.x, y: origin.y - PREVIEW_HELPER_TURRET_SPAWN_OFFSET }
      : origin;
    spawnPausePreviewHelper(variant, turretSpawnPoint, beatIndex, continuation, {
      weaponSlotIndex: slotIndex,
      stageIndex,
      helperAnchorType: context?.helperAnchorType || defaultAnchorType,
    }, impactEnemy);
    return;
  }
  if (archetype === 'laser') {
    if (variant === 'beam') {
      if (!nearest) {
        const to = { x: origin.x + 300, y: origin.y };
        addPausePreviewLaser(origin, to);
        if (continuation.length) {
          queuePausePreviewChain(beatIndex + 1, continuation, {
            origin,
            impactPoint: to,
            weaponSlotIndex: slotIndex,
            stageIndex: stageIndex + 1,
          });
        }
        return;
      }
      addPausePreviewBeam(origin, nearest, getPausePreviewBeatLen());
      if (continuation.length) {
        queuePausePreviewChain(beatIndex + 1, continuation, {
          origin,
          impactPoint: { x: nearest.x, y: nearest.y },
          weaponSlotIndex: slotIndex,
          stageIndex: stageIndex + 1,
        });
      }
      return;
    }
    if (!nearest) {
      const to = { x: origin.x + 300, y: origin.y };
      addPausePreviewLaser(origin, to);
      if (continuation.length) {
        queuePausePreviewChain(beatIndex + 1, continuation, {
          origin,
          impactPoint: to,
          weaponSlotIndex: slotIndex,
          stageIndex: stageIndex + 1,
        });
      }
      return;
    }
    addPausePreviewLaser(origin, { x: nearest.x, y: nearest.y });
    damagePausePreviewEnemy(nearest, 2);
    if (continuation.length) {
      queuePausePreviewChain(beatIndex + 1, continuation, {
        origin,
        impactPoint: { x: nearest.x, y: nearest.y },
        weaponSlotIndex: slotIndex,
        stageIndex: stageIndex + 1,
      });
    }
    return;
  }
  if (archetype === 'aoe') {
    applyPausePreviewAoeAt(origin, variant, beatIndex);
    if (continuation.length) {
      queuePausePreviewChain(beatIndex + 1, continuation, {
        origin: context?.origin || origin,
        impactPoint: origin,
        weaponSlotIndex: slotIndex,
        stageIndex: stageIndex + 1,
      });
    }
  }
}

function processPausePreviewPendingChains(beatIndex) {
  for (let i = pausePreview.pendingEvents.length - 1; i >= 0; i--) {
    const ev = pausePreview.pendingEvents[i];
    if ((Number(ev?.beatIndex) || 0) > beatIndex) continue;
    pausePreview.pendingEvents.splice(i, 1);
    const stages = sanitizeWeaponStages(ev?.stages);
    if (!stages.length) continue;
    const stage = stages[0];
    const rem = stages.slice(1);
    const origin = ev?.context?.impactPoint || ev?.context?.origin || { x: pausePreview.ship.x, y: pausePreview.ship.y };
    triggerPausePreviewWeaponStage(stage, origin, beatIndex, rem, ev?.context || null);
  }
}

function applyPausePreviewLingeringAoeBeat(beatIndex) {
  for (let i = pausePreview.aoeZones.length - 1; i >= 0; i--) {
    const z = pausePreview.aoeZones[i];
    if ((Number(z.untilBeat) || 0) < beatIndex) {
      pausePreview.aoeZones.splice(i, 1);
      continue;
    }
    const r2 = (Number(z.radius) || PREVIEW_EXPLOSION_RADIUS) ** 2;
    const dmg = Math.max(0, Number(z.damagePerBeat) || 0);
    for (let j = pausePreview.enemies.length - 1; j >= 0; j--) {
      const e = pausePreview.enemies[j];
      const dx = e.x - z.x;
      const dy = e.y - z.y;
      if ((dx * dx + dy * dy) <= r2) damagePausePreviewEnemy(e, dmg);
    }
  }
}

function firePausePreviewWeaponsOnBeat(beatIndex) {
  const origin = { x: pausePreview.ship.x, y: pausePreview.ship.y };
  const indices = Number.isInteger(previewSelectedWeaponSlotIndex)
    ? [previewSelectedWeaponSlotIndex]
    : weaponLoadout.map((_, i) => i);
  for (const slotIndex of indices) {
    const weapon = weaponLoadout[slotIndex];
    const stages = sanitizeWeaponStages(weapon?.stages);
    if (!stages.length) continue;
    const first = stages[0];
    const rest = stages.slice(1);
    triggerPausePreviewWeaponStage(first, origin, beatIndex, rest, {
      origin,
      impactPoint: origin,
      weaponSlotIndex: slotIndex,
      stageIndex: 0,
    });
  }
}

function updatePausePreviewProjectilesAndEffects(dt) {
  const hitRadius = 14;
  const hitR2 = hitRadius * hitRadius;
  for (let i = pausePreview.projectiles.length - 1; i >= 0; i--) {
    const p = pausePreview.projectiles[i];
    p.ttl -= dt;
    const isBoomerang = String(p.kind || 'standard') === 'boomerang';
    const isHoming = String(p.kind || 'standard') === 'homing-missile';
    if (isBoomerang) {
      p.boomTheta = (Number(p.boomTheta) || 0) + ((Number(p.boomOmega) || 0) * dt);
      const c = Math.cos(p.boomTheta || 0);
      const s = Math.sin(p.boomTheta || 0);
      const r = Math.max(1, Number(p.boomRadius) || PREVIEW_PROJECTILE_BOOMERANG_RADIUS);
      const dirX = Number(p.boomDirX) || 0;
      const dirY = Number(p.boomDirY) || 0;
      const perpX = Number(p.boomPerpX) || 0;
      const perpY = Number(p.boomPerpY) || 0;
      p.x = (Number(p.boomCenterX) || 0) + (dirX * (1 + c) * r) + (perpX * s * r);
      p.y = (Number(p.boomCenterY) || 0) + (dirY * (1 + c) * r) + (perpY * s * r);
    } else if (isHoming) {
      let state = String(p.homingState || 'orbit');
      const orbitRadius = Math.max(8, Number(p.orbitRadius) || PREVIEW_PROJECTILE_HOMING_ORBIT_RADIUS);
      const orbitAngVel = Number(p.orbitAngVel) || PREVIEW_PROJECTILE_HOMING_ORBIT_ANG_VEL;
      const nearestNow = getPausePreviewNearestEnemies(p.x, p.y, 1)[0] || null;
      if (state === 'orbit' && nearestNow) {
        const dx = nearestNow.x - p.x;
        const dy = nearestNow.y - p.y;
        if ((dx * dx + dy * dy) <= (PREVIEW_PROJECTILE_HOMING_ACQUIRE_RANGE * PREVIEW_PROJECTILE_HOMING_ACQUIRE_RANGE)) {
          state = 'seek';
          p.targetEnemy = nearestNow;
        }
      }
      if (state === 'seek') {
        let target = p.targetEnemy || null;
        if (!target || !pausePreview.enemies.includes(target)) target = getPausePreviewNearestEnemies(p.x, p.y, 1)[0] || null;
        if (!target) {
          state = 'return';
          p.targetEnemy = null;
        } else {
          p.targetEnemy = target;
          const desired = normalizeDir(target.x - p.x, target.y - p.y, p.vx, p.vy);
          const cur = normalizeDir(p.vx, p.vy, desired.x, desired.y);
          const steer = Math.max(0, Math.min(1, PREVIEW_PROJECTILE_HOMING_TURN_RATE * dt));
          const nd = normalizeDir(
            (cur.x * (1 - steer)) + (desired.x * steer),
            (cur.y * (1 - steer)) + (desired.y * steer),
            desired.x,
            desired.y
          );
          p.vx = nd.x * PREVIEW_PROJECTILE_HOMING_SPEED;
          p.vy = nd.y * PREVIEW_PROJECTILE_HOMING_SPEED;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
        }
      }
      if (state === 'return') {
        const desired = normalizeDir(pausePreview.ship.x - p.x, pausePreview.ship.y - p.y, p.vx, p.vy);
        const cur = normalizeDir(p.vx, p.vy, desired.x, desired.y);
        const steer = Math.max(0, Math.min(1, (PREVIEW_PROJECTILE_HOMING_TURN_RATE * 1.2) * dt));
        const nd = normalizeDir(
          (cur.x * (1 - steer)) + (desired.x * steer),
          (cur.y * (1 - steer)) + (desired.y * steer),
          desired.x,
          desired.y
        );
        p.vx = nd.x * PREVIEW_PROJECTILE_HOMING_SPEED;
        p.vy = nd.y * PREVIEW_PROJECTILE_HOMING_SPEED;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        const dx = p.x - pausePreview.ship.x;
        const dy = p.y - pausePreview.ship.y;
        if ((dx * dx + dy * dy) <= (PREVIEW_PROJECTILE_HOMING_RETURN_SNAP_DIST * PREVIEW_PROJECTILE_HOMING_RETURN_SNAP_DIST)) {
          state = 'orbit';
          const d = normalizeDir(dx, dy, 1, 0);
          p.orbitAngle = Math.atan2(d.y, d.x);
          p.vx = 0;
          p.vy = 0;
        }
      }
      if (state === 'orbit') {
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
        const desired = normalizeDir(targetX - p.x, targetY - p.y, 1, 0);
        const cur = normalizeDir(p.vx, p.vy, desired.x, desired.y);
        const steer = Math.max(0, Math.min(1, PREVIEW_PROJECTILE_HOMING_ORBIT_TURN_RATE * dt));
        const nd = normalizeDir(
          (cur.x * (1 - steer)) + (desired.x * steer),
          (cur.y * (1 - steer)) + (desired.y * steer),
          desired.x,
          desired.y
        );
        const speedN = Math.max(0.2, Math.min(1, toDist / Math.max(1, orbitRadius)));
        const chaseSpeed = PREVIEW_PROJECTILE_HOMING_ORBIT_CHASE_SPEED * speedN;
        p.vx = nd.x * chaseSpeed;
        p.vy = nd.y * chaseSpeed;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
      p.homingState = state;
    } else {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    let hit = false;
    for (let j = pausePreview.enemies.length - 1; j >= 0; j--) {
      const e = pausePreview.enemies[j];
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      if ((dx * dx + dy * dy) <= hitR2) {
        if (isBoomerang) {
          if (!(p.hitEnemyIds instanceof Set)) p.hitEnemyIds = new Set();
          if (p.hitEnemyIds.has(e)) continue;
          p.hitEnemyIds.add(e);
        }
        const hitPoint = { x: e.x, y: e.y };
        damagePausePreviewEnemy(e, p.damage);
        if (Array.isArray(p.nextStages) && p.nextStages.length) {
          const nextBeat = Number.isFinite(p.nextBeatIndex) ? p.nextBeatIndex : (Math.max(0, pausePreview.beatIndex) + 1);
          queuePausePreviewChain(nextBeat, p.nextStages, {
            origin: { x: p.x, y: p.y },
            impactPoint: hitPoint,
            weaponSlotIndex: Number.isFinite(p.chainWeaponSlotIndex) ? Math.trunc(p.chainWeaponSlotIndex) : null,
            stageIndex: Number.isFinite(p.chainStageIndex) ? Math.trunc(p.chainStageIndex) : null,
            impactEnemy: e,
          });
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
    p.el.style.transform = `translate(${p.x.toFixed(2)}px, ${p.y.toFixed(2)}px)`;
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
        fx.from = { x: pausePreview.ship.x, y: pausePreview.ship.y };
        let target = fx.targetEnemy || null;
        if (!target || !pausePreview.enemies.includes(target)) {
          target = getPausePreviewNearestEnemies(fx.from?.x || 0, fx.from?.y || 0, 1)[0] || null;
          fx.targetEnemy = target || null;
        }
        if (target) {
          fx.to = { x: target.x, y: target.y };
          damagePausePreviewEnemy(target, Math.max(0, Number(fx.damagePerSec) || 0) * dt);
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
        fx.el.style.opacity = `${Math.max(0, Math.min(1, fx.ttl / PREVIEW_LASER_TTL)).toFixed(3)}`;
      }
    } else if (fx.kind === 'explosion') {
      const radius = Math.max(8, Number(fx.radius) || PREVIEW_EXPLOSION_RADIUS);
      const size = radius * 2;
      fx.el.style.width = `${size.toFixed(2)}px`;
      fx.el.style.height = `${size.toFixed(2)}px`;
      fx.el.style.marginLeft = `${(-radius).toFixed(2)}px`;
      fx.el.style.marginTop = `${(-radius).toFixed(2)}px`;
      fx.el.style.transform = `translate(${fx.at.x.toFixed(2)}px, ${fx.at.y.toFixed(2)}px)`;
      fx.el.style.opacity = `${Math.max(0, Math.min(1, fx.ttl / PREVIEW_EXPLOSION_TTL)).toFixed(3)}`;
    }
  }
}

function getPausePreviewBeatLen() {
  const info = getLoopInfo?.();
  return Math.max(0.2, Number(info?.beatLen) || PREVIEW_BEAT_LEN_FALLBACK);
}

function updatePausePreview(dt) {
  if (!gameplayPaused || !pauseScreenEl?.classList?.contains?.('is-visible')) return;
  ensurePausePreviewState();
  if (!pausePreviewSceneEl || !pausePreview.initialized) return;

  pausePreview.beatTimer += Math.max(0.001, Number(dt) || 0.016);
  const beatLen = getPausePreviewBeatLen();
  while (pausePreview.beatTimer >= beatLen) {
    pausePreview.beatTimer -= beatLen;
    pausePreview.beatIndex += 1;
    processPausePreviewPendingChains(pausePreview.beatIndex);
    applyPausePreviewLingeringAoeBeat(pausePreview.beatIndex);
    firePausePreviewHelpersOnBeat(pausePreview.beatIndex);
    firePausePreviewWeaponsOnBeat(pausePreview.beatIndex);
  }

  while (pausePreview.enemies.length < PREVIEW_ENEMY_COUNT) spawnPausePreviewEnemy();
  updatePausePreviewHelpers(dt);
  updatePausePreviewProjectilesAndEffects(dt);
  for (const e of pausePreview.enemies) {
    e.el.style.transform = `translate(${e.x.toFixed(2)}px, ${e.y.toFixed(2)}px)`;
  }
  if (pausePreview.ship.el) {
    pausePreview.ship.el.style.transform = `translate(${pausePreview.ship.x.toFixed(2)}px, ${pausePreview.ship.y.toFixed(2)}px)`;
  }
}

function ensurePauseWeaponUi() {
  if (!pauseScreenEl) return;
  if (pauseScreenEl.dataset.uiReady === '1') return;
  pauseScreenEl.dataset.uiReady = '1';
  renderPauseWeaponUi();
  pauseScreenEl.addEventListener('click', (ev) => {
    const target = ev.target;
    if (!(target instanceof HTMLElement)) return;
    if (!(target.closest('button, select, option, input, label'))) {
      const row = target.closest('.beat-swarm-weapon-card');
      if (row instanceof HTMLElement) {
        const slotIndex = Math.trunc(Number(row.dataset.slotIndex));
        if (slotIndex >= 0 && slotIndex < weaponLoadout.length) {
          previewSelectedWeaponSlotIndex = (previewSelectedWeaponSlotIndex === slotIndex) ? null : slotIndex;
          renderPauseWeaponUi();
          return;
        }
      }
    }
    const actionEl = target.closest('[data-action]');
    if (!(actionEl instanceof HTMLElement)) return;
    const slotIndex = Math.trunc(Number(actionEl.dataset.slotIndex));
    const action = String(actionEl.dataset.action || '');
    if (action === 'close-component-picker') {
      stagePickerState.open = false;
      stagePickerState.slotIndex = -1;
      stagePickerState.stageIndex = -1;
      renderPauseWeaponUi();
      return;
    }
    if (!(slotIndex >= 0 && slotIndex < weaponLoadout.length)) return;
    const slot = weaponLoadout[slotIndex];
    if (action === 'random-weapon') {
      slot.stages = createRandomWeaponStages();
      clearHelpers();
      stagePickerState.open = false;
      renderPauseWeaponUi();
      persistBeatSwarmState();
      return;
    }
    if (action === 'open-component-picker') {
      const stageIndex = Math.max(0, Math.min(MAX_WEAPON_STAGES - 1, Math.trunc(Number(actionEl.dataset.stageIndex))));
      stagePickerState.open = true;
      stagePickerState.slotIndex = slotIndex;
      stagePickerState.stageIndex = stageIndex;
      renderPauseWeaponUi();
      return;
    }
    if (action === 'remove-stage') {
      const stageIndex = Math.trunc(Number(actionEl.dataset.stageIndex));
      if (!(stageIndex >= 0 && stageIndex < slot.stages.length)) return;
      slot.stages.splice(stageIndex, 1);
      clearHelpers();
      stagePickerState.open = false;
      renderPauseWeaponUi();
      persistBeatSwarmState();
      return;
    }
    if (action === 'assign-component') {
      const stageIndex = Math.max(0, Math.min(MAX_WEAPON_STAGES - 1, Math.trunc(Number(actionEl.dataset.stageIndex))));
      const componentId = String(actionEl.dataset.componentId || '');
      const component = getWeaponComponentDefById(componentId);
      if (!component) return;
      const prevStage = stageIndex > 0 ? slot.stages[stageIndex - 1] : null;
      if (
        prevStage
        && prevStage.archetype === 'helper'
        && component.archetype === 'helper'
        && String(prevStage.variant) === String(component.variant)
      ) return;
      if (stageIndex < slot.stages.length) {
        slot.stages[stageIndex] = { archetype: component.archetype, variant: component.variant };
      } else if (stageIndex === slot.stages.length && slot.stages.length < MAX_WEAPON_STAGES) {
        slot.stages.push({ archetype: component.archetype, variant: component.variant });
      } else {
        return;
      }
      stagePickerState.open = false;
      stagePickerState.slotIndex = -1;
      stagePickerState.stageIndex = -1;
      clearHelpers();
      renderPauseWeaponUi();
      persistBeatSwarmState();
    }
  });
}

function renderPauseWeaponUi() {
  if (!pauseScreenEl) return;
  const cards = weaponLoadout.map((slot, slotIndex) => {
    const stageCells = Array.from({ length: MAX_WEAPON_STAGES }, (_, stageIndex) => {
      const st = slot.stages[stageIndex] || null;
      const isFillableEmpty = !st && stageIndex === slot.stages.length;
      const comp = getWeaponComponentDefForStage(st);
      if (!st) {
        return `
          <div class="beat-swarm-stage-cell is-empty">
            <div class="beat-swarm-stage-index">${stageIndex + 1}</div>
            <button
              type="button"
              class="beat-swarm-stage-component-btn is-empty"
              data-action="open-component-picker"
              data-slot-index="${slotIndex}"
              data-stage-index="${stageIndex}"
              ${isFillableEmpty ? '' : 'disabled'}
            >
              ${renderComponentPreviewMarkup(null)}
              <span class="beat-swarm-stage-component-name">Select Component</span>
              <span class="beat-swarm-stage-component-detail">${isFillableEmpty ? 'Tap to choose' : 'Fill previous stage first'}</span>
            </button>
          </div>
        `;
      }
      return `
        <div class="beat-swarm-stage-cell is-filled">
          <div class="beat-swarm-stage-index">${stageIndex + 1}</div>
          <button type="button" class="beat-swarm-stage-component-btn" data-action="open-component-picker" data-slot-index="${slotIndex}" data-stage-index="${stageIndex}">
            ${renderComponentPreviewMarkup(comp)}
            <span class="beat-swarm-stage-component-name">${comp?.label || st.variant}</span>
          </button>
          <button type="button" class="beat-swarm-stage-remove" data-action="remove-stage" data-slot-index="${slotIndex}" data-stage-index="${stageIndex}">Remove</button>
        </div>
      `;
    }).join('');
    return `
      <section class="beat-swarm-weapon-card${previewSelectedWeaponSlotIndex === slotIndex ? ' is-preview-selected' : ''}" data-slot-index="${slotIndex}">
        <div class="beat-swarm-weapon-head-wrap">
          <header class="beat-swarm-weapon-head">${slot.name}</header>
          <button type="button" class="beat-swarm-stage-add beat-swarm-random-weapon" data-action="random-weapon" data-slot-index="${slotIndex}">Create Random Weapon</button>
        </div>
        <div class="beat-swarm-weapon-stages">
          ${stageCells}
        </div>
      </section>
    `;
  }).join('');
  const previewStatus = Number.isInteger(previewSelectedWeaponSlotIndex)
    ? `Previewing ${weaponLoadout[previewSelectedWeaponSlotIndex]?.name || 'Weapon'}`
    : 'Previewing all weapons';
  const pickerSlot = Math.max(0, Math.min(weaponLoadout.length - 1, Math.trunc(Number(stagePickerState.slotIndex) || 0)));
  const pickerStage = Math.max(0, Math.min(MAX_WEAPON_STAGES - 1, Math.trunc(Number(stagePickerState.stageIndex) || 0)));
  const pickerOpen = !!stagePickerState.open;
  const pickerSlotStages = weaponLoadout[pickerSlot]?.stages || [];
  const prevStage = pickerStage > 0 ? pickerSlotStages[pickerStage - 1] : null;
  const blockedHelperVariant = (prevStage?.archetype === 'helper')
    ? String(prevStage.variant || '')
    : '';
  const pickerItems = Object.values(WEAPON_ARCHETYPES).map((archetypeDef) => {
    const comps = WEAPON_COMPONENTS.filter((c) => c.archetype === archetypeDef.id);
    const compButtons = comps.map((c) => {
      const sameHelperBlocked = (
        archetypeDef.id === 'helper'
        && blockedHelperVariant
        && String(c.variant || '') === blockedHelperVariant
      );
      return `
      <button
        type="button"
        class="beat-swarm-component-option"
        data-action="assign-component"
        data-slot-index="${pickerSlot}"
        data-stage-index="${pickerStage}"
        data-component-id="${c.id}"
        ${sameHelperBlocked ? 'disabled' : ''}
      >
        ${renderComponentPreviewMarkup(c)}
        <span class="beat-swarm-component-option-name">${c.label}</span>
        ${sameHelperBlocked ? '<span class="beat-swarm-stage-component-detail">Cannot follow same helper</span>' : ''}
      </button>
    `;
    }).join('');
    return `
      <section class="beat-swarm-component-group">
        <div class="beat-swarm-component-group-head">${archetypeDef.label}</div>
        <div class="beat-swarm-component-picker-grid">${compButtons}</div>
      </section>
    `;
  }).join('');
  pauseScreenEl.innerHTML = `
    <div class="beat-swarm-pause-title">Weapon Customisation</div>
    <div class="beat-swarm-pause-subtitle">Up to 3 weapons, each with up to 5 beat stages.</div>
    <div class="beat-swarm-pause-layout">
      <div class="beat-swarm-weapon-grid">${cards}</div>
      <aside class="beat-swarm-preview-panel">
        <div class="beat-swarm-preview-title">Live Preview</div>
        <div class="beat-swarm-preview-status">${previewStatus}</div>
        <div class="beat-swarm-preview-scene" aria-hidden="true"></div>
      </aside>
    </div>
    ${pickerOpen ? `
      <div class="beat-swarm-component-picker-backdrop" data-action="close-component-picker">
        <div class="beat-swarm-component-picker" role="dialog" aria-modal="true" aria-label="Weapon Components">
          <div class="beat-swarm-component-picker-head">
            <div class="beat-swarm-component-picker-title">Choose Component</div>
            <div class="beat-swarm-component-picker-actions">
              <button type="button" class="beat-swarm-stage-remove" data-action="close-component-picker" data-slot-index="${pickerSlot}">Close</button>
              <button type="button" class="beat-swarm-component-picker-close" aria-label="Close component picker" title="Close" data-action="close-component-picker">x</button>
            </div>
          </div>
          <div class="beat-swarm-component-picker-groups">${pickerItems}</div>
        </div>
      </div>
    ` : ''}
  `;
  pauseScreenEl.classList.toggle('has-component-picker', pickerOpen);
  pausePreviewSceneEl = pauseScreenEl.querySelector('.beat-swarm-preview-scene');
  pausePreviewStatusEl = pauseScreenEl.querySelector('.beat-swarm-preview-status');
  resetPausePreviewState();
  initComponentLivePreviews();
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

function getSceneStartWorld() {
  try {
    if (window.__ArtInternal?.isActive?.()) {
      const home = window.__ArtInternal?.getHomeAnchor?.();
      if (home && Number.isFinite(home.x) && Number.isFinite(home.y)) {
        return { x: Number(home.x) || 0, y: Number(home.y) || 0 };
      }
    }
  } catch {}
  try {
    const w = window.__MT_ANCHOR_WORLD;
    if (w && Number.isFinite(w.x) && Number.isFinite(w.y)) {
      return { x: Number(w.x) || 0, y: Number(w.y) || 0 };
    }
  } catch {}
  return getViewportCenterWorld();
}

function snapCameraToWorld(worldPoint, scaleValue = SWARM_CAMERA_TARGET_SCALE) {
  const w = worldPoint && Number.isFinite(worldPoint.x) && Number.isFinite(worldPoint.y)
    ? worldPoint
    : getViewportCenterWorld();
  const s = Math.max(0.3, Math.min(1, Number(scaleValue) || 0.6));
  const cx = window.innerWidth * 0.5;
  const cy = window.innerHeight * 0.5;
  const tx = cx - (w.x * s);
  const ty = cy - (w.y * s);
  try { window.__setBoardViewportNow?.(s, tx, ty); } catch {}
}

function applyBeatSwarmCameraScaleWithRetry(retries = 0) {
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
  if (retries >= 1) requestAnimationFrame(apply);
  if (retries >= 2) setTimeout(apply, 140);
  if (retries >= 3) setTimeout(apply, 320);
}

function randRange(min, max) {
  const a = Number(min) || 0;
  const b = Number(max) || 0;
  return a + ((b - a) * Math.random());
}

function clearStarfield() {
  while (starfieldStars.length) {
    const star = starfieldStars.pop();
    try { star?.el?.remove?.(); } catch {}
  }
  starfieldParallaxAnchorWorld = null;
  starfieldSplitWorldX = 0;
  if (starfieldLayerEl) {
    starfieldLayerEl.style.clipPath = '';
    starfieldLayerEl.style.webkitClipPath = '';
    starfieldLayerEl.style.background = 'transparent';
  }
}

function createStarElement(starMeta) {
  const el = document.createElement('div');
  el.className = 'beat-swarm-star';
  const sizePx = Math.max(1, Number(starMeta?.size) || 1.4);
  const alpha = Math.max(0.45, Math.min(1, Number(starMeta?.alpha) || 0.78));
  el.style.width = `${sizePx.toFixed(2)}px`;
  el.style.height = `${sizePx.toFixed(2)}px`;
  el.style.opacity = alpha.toFixed(3);
  return el;
}

function buildInfiniteStarfield(stars = null) {
  if (!starfieldLayerEl) return;
  const source = Array.isArray(stars) ? stars : null;
  const count = source ? source.length : SWARM_STARFIELD_COUNT;
  for (let i = 0; i < count; i++) {
    const meta = source?.[i] || {};
    const p = source
      ? Math.max(0.08, Math.min(0.98, Number(meta.p) || SWARM_STARFIELD_PARALLAX_MIN))
      : (SWARM_STARFIELD_PARALLAX_MIN + ((SWARM_STARFIELD_PARALLAX_MAX - SWARM_STARFIELD_PARALLAX_MIN) * Math.pow(Math.random(), 0.65)));
    const star = {
      nx: source ? (Math.max(0, Math.min(1, Number(meta.nx) || 0))) : Math.random(),
      ny: source ? (Math.max(0, Math.min(1, Number(meta.ny) || 0))) : Math.random(),
      p,
      size: source ? Math.max(1.05, Number(meta.size) || 1.45) : randRange(1.0, 2.35),
      alpha: source ? Math.max(0.45, Number(meta.alpha) || 0.72) : randRange(0.45, 0.98),
      el: null,
    };
    star.el = createStarElement(star);
    try { starfieldLayerEl.appendChild(star.el); } catch {}
    starfieldStars.push(star);
  }
}

function initStarfieldNear(centerWorld) {
  if (!centerWorld || !starfieldLayerEl) return;
  clearStarfield();
  starfieldParallaxAnchorWorld = { x: Number(centerWorld.x) || 0, y: Number(centerWorld.y) || 0 };
  starfieldSplitWorldX = Number(centerWorld.x) || 0;
  buildInfiniteStarfield();
}

function restoreStarfieldFromState(stateStarfield, centerWorld, anchorWorld = null, splitWorldX = null) {
  if (!starfieldLayerEl) return;
  clearStarfield();
  if (anchorWorld && Number.isFinite(anchorWorld.x) && Number.isFinite(anchorWorld.y)) {
    starfieldParallaxAnchorWorld = { x: Number(anchorWorld.x) || 0, y: Number(anchorWorld.y) || 0 };
  } else {
    const c = centerWorld || getViewportCenterWorld();
    starfieldParallaxAnchorWorld = { x: Number(c.x) || 0, y: Number(c.y) || 0 };
  }
  if (Number.isFinite(splitWorldX)) {
    starfieldSplitWorldX = Number(splitWorldX) || 0;
  } else {
    starfieldSplitWorldX = Number(centerWorld?.x) || 0;
  }
  let sourceStars = null;
  if (Array.isArray(stateStarfield)) {
    if (stateStarfield.length && Array.isArray(stateStarfield[0]?.stars)) {
      // Backward compatibility: older saves stored starfield by sections.
      sourceStars = [];
      for (const sec of stateStarfield) {
        const secSize = Math.max(1, Number(sec?.size) || 1);
        for (const s of Array.isArray(sec?.stars) ? sec.stars : []) {
          sourceStars.push({
            nx: Math.max(0, Math.min(1, (Number(s?.lx) || 0) / secSize)),
            ny: Math.max(0, Math.min(1, (Number(s?.ly) || 0) / secSize)),
            p: Number(s?.p) || SWARM_STARFIELD_PARALLAX_MIN,
            size: Number(s?.size) || 1.4,
            alpha: Number(s?.alpha) || 0.72,
          });
        }
      }
    } else {
      sourceStars = stateStarfield;
    }
  }
  buildInfiniteStarfield(sourceStars);
}

function updateStarfieldVisual() {
  if (!starfieldStars.length || !starfieldLayerEl) return;
  const camWorld = getViewportCenterWorld();
  const z = getZoomState();
  const scale = Number.isFinite(z?.targetScale) ? z.targetScale : (Number.isFinite(z?.currentScale) ? z.currentScale : 1);
  const anchor = starfieldParallaxAnchorWorld || camWorld;
  const camDxPx = ((Number(camWorld?.x) || 0) - (Number(anchor?.x) || 0)) * Math.max(0.001, scale || 1);
  const camDyPx = ((Number(camWorld?.y) || 0) - (Number(anchor?.y) || 0)) * Math.max(0.001, scale || 1);
  const splitPoint = worldToScreen({ x: Number(starfieldSplitWorldX) || 0, y: Number(camWorld?.y) || 0 });
  const splitX = Math.max(0, Math.min(window.innerWidth, Number(splitPoint?.x) || 0));
  const rightW = Math.max(0, window.innerWidth - splitX);
  const w = Math.max(1, window.innerWidth);
  const h = Math.max(1, window.innerHeight);
  if (rightW <= 0.5) {
    starfieldLayerEl.style.clipPath = '';
    starfieldLayerEl.style.webkitClipPath = '';
    starfieldLayerEl.style.background = 'transparent';
    for (const star of starfieldStars) {
      if (star.el) star.el.style.opacity = '0';
    }
    return;
  }
  starfieldLayerEl.style.background = '#000';
  const clip = `inset(0px 0px 0px ${splitX.toFixed(2)}px)`;
  starfieldLayerEl.style.clipPath = clip;
  starfieldLayerEl.style.webkitClipPath = clip;
  for (const star of starfieldStars) {
    const p = Math.max(0.08, Math.min(0.98, Number(star.p) || 0.82));
    const baseX = (Math.max(0, Math.min(1, Number(star.nx) || 0)) * w);
    const baseY = (Math.max(0, Math.min(1, Number(star.ny) || 0)) * h);
    const shiftX = -camDxPx * (1 - p) * SWARM_STARFIELD_PARALLAX_SHIFT_SCALE;
    const shiftY = -camDyPx * (1 - p) * SWARM_STARFIELD_PARALLAX_SHIFT_SCALE;
    let localX = baseX + shiftX;
    let localY = baseY + shiftY;
    localX = ((localX % w) + w) % w;
    localY = ((localY % h) + h) % h;
    if (star.el) {
      star.el.style.opacity = `${Math.max(0.45, Math.min(1, Number(star.alpha) || 0.78)).toFixed(3)}`;
      star.el.style.transform = `translate(${localX.toFixed(2)}px, ${localY.toFixed(2)}px)`;
    }
  }
}

function resetArenaPathState() {
  arenaPathHeadingRad = Math.random() * Math.PI * 2;
  arenaPathTurnRateRad = 0;
  arenaPathTargetTurnRateRad = randRange(-SWARM_ARENA_PATH_MAX_TURN_RATE_RAD, SWARM_ARENA_PATH_MAX_TURN_RATE_RAD);
  arenaPathRetargetTimer = randRange(SWARM_ARENA_PATH_RETARGET_MIN, SWARM_ARENA_PATH_RETARGET_MAX);
}

function updateArenaPath(dt) {
  if (!arenaCenterWorld || !(dt > 0)) return;
  arenaPathRetargetTimer -= dt;
  if (!(arenaPathRetargetTimer > 0)) {
    // Keep turn-rate targets modest so the path stays curvy but avoids frequent reversals.
    arenaPathTargetTurnRateRad = randRange(
      -SWARM_ARENA_PATH_MAX_TURN_RATE_RAD,
      SWARM_ARENA_PATH_MAX_TURN_RATE_RAD
    );
    arenaPathRetargetTimer = randRange(SWARM_ARENA_PATH_RETARGET_MIN, SWARM_ARENA_PATH_RETARGET_MAX);
  }
  const s = Math.max(0, Math.min(1, SWARM_ARENA_PATH_TURN_SMOOTH * dt));
  arenaPathTurnRateRad += (arenaPathTargetTurnRateRad - arenaPathTurnRateRad) * s;
  arenaPathTurnRateRad = Math.max(
    -SWARM_ARENA_PATH_MAX_TURN_RATE_RAD,
    Math.min(SWARM_ARENA_PATH_MAX_TURN_RATE_RAD, arenaPathTurnRateRad)
  );
  arenaPathHeadingRad += arenaPathTurnRateRad * dt;
  const step = SWARM_ARENA_PATH_SPEED_WORLD * dt;
  arenaCenterWorld.x += Math.cos(arenaPathHeadingRad) * step;
  arenaCenterWorld.y += Math.sin(arenaPathHeadingRad) * step;
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
  pulseHitFlash(enemy.el);
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

function clearHelpers() {
  while (helpers.length) {
    const h = helpers.pop();
    try { h?.elA?.remove?.(); } catch {}
    try { h?.elB?.remove?.(); } catch {}
    try { h?.el?.remove?.(); } catch {}
  }
}

function clearRuntimeForWeaponSlot(slotIndex) {
  const slotRaw = Number(slotIndex);
  const idx = Number.isFinite(slotRaw) ? Math.trunc(slotRaw) : -1;
  if (!(idx >= 0)) return;
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    const v = Number(p?.chainWeaponSlotIndex);
    if ((Number.isFinite(v) ? Math.trunc(v) : -1) !== idx) continue;
    try { p?.el?.remove?.(); } catch {}
    projectiles.splice(i, 1);
  }
  for (let i = helpers.length - 1; i >= 0; i--) {
    const h = helpers[i];
    const v = Number(h?.context?.weaponSlotIndex);
    if ((Number.isFinite(v) ? Math.trunc(v) : -1) !== idx) continue;
    try { h?.elA?.remove?.(); } catch {}
    try { h?.elB?.remove?.(); } catch {}
    try { h?.el?.remove?.(); } catch {}
    helpers.splice(i, 1);
  }
  for (let i = effects.length - 1; i >= 0; i--) {
    const fx = effects[i];
    const v = Number(fx?.weaponSlotIndex);
    if ((Number.isFinite(v) ? Math.trunc(v) : -1) !== idx) continue;
    try { fx?.el?.remove?.(); } catch {}
    effects.splice(i, 1);
  }
  for (let i = pendingWeaponChainEvents.length - 1; i >= 0; i--) {
    const ev = pendingWeaponChainEvents[i];
    const v = Number(ev?.context?.weaponSlotIndex);
    if ((Number.isFinite(v) ? Math.trunc(v) : -1) !== idx) continue;
    pendingWeaponChainEvents.splice(i, 1);
  }
  for (let i = lingeringAoeZones.length - 1; i >= 0; i--) {
    const z = lingeringAoeZones[i];
    const v = Number(z?.weaponSlotIndex);
    if ((Number.isFinite(v) ? Math.trunc(v) : -1) !== idx) continue;
    lingeringAoeZones.splice(i, 1);
  }
}

function clearHomingMissiles() {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    if (String(p?.kind || '') !== 'homing-missile') continue;
    try { p?.el?.remove?.(); } catch {}
    projectiles.splice(i, 1);
  }
}

function setActiveWeaponSlot(nextSlotIndex) {
  const next = Math.max(0, Math.min(MAX_WEAPON_SLOTS - 1, Math.trunc(Number(nextSlotIndex) || 0)));
  const prev = Math.max(0, Math.min(MAX_WEAPON_SLOTS - 1, Math.trunc(Number(activeWeaponSlotIndex) || 0)));
  if (next === prev) return false;
  clearRuntimeForWeaponSlot(prev);
  clearHomingMissiles();
  activeWeaponSlotIndex = next;
  persistBeatSwarmState();
  return true;
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
    id: enemyIdSeq++,
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

function getNearestEnemies(worldX, worldY, count = 1) {
  const scored = enemies.map((e) => {
    const dx = e.wx - worldX;
    const dy = e.wy - worldY;
    return { e, d2: (dx * dx) + (dy * dy) };
  });
  scored.sort((a, b) => a.d2 - b.d2);
  return scored.slice(0, Math.max(1, Math.trunc(Number(count) || 1))).map((it) => it.e);
}

function ensureDefaultWeaponFromLegacy(weaponId) {
  const map = {
    projectile: { archetype: 'projectile', variant: 'standard' },
    laser: { archetype: 'laser', variant: 'hitscan' },
    explosion: { archetype: 'aoe', variant: 'explosion' },
  };
  const stage = map[weaponId];
  if (!stage) return;
  const exists = weaponLoadout.some((w) => Array.isArray(w.stages) && w.stages.some((s) => s.archetype === stage.archetype && s.variant === stage.variant));
  if (exists) return;
  const slot = weaponLoadout.find((w) => !w.stages.length) || weaponLoadout[0];
  if (!slot) return;
  slot.stages = [{ ...stage }];
  renderPauseWeaponUi();
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
  // Pickups temporarily disabled in Beat Swarm (kept for future re-enable).
  clearPickups();
}

function addLaserEffect(fromW, toW, weaponSlotIndex = null) {
  if (!enemyLayerEl) return;
  const el = document.createElement('div');
  el.className = 'beat-swarm-fx-laser';
  enemyLayerEl.appendChild(el);
  effects.push({
    kind: 'laser',
    ttl: LASER_TTL,
    from: { ...fromW },
    to: { ...toW },
    weaponSlotIndex: Number.isFinite(weaponSlotIndex) ? Math.trunc(weaponSlotIndex) : null,
    el,
  });
}

function getGameplayBeatLen() {
  const info = getLoopInfo?.();
  return Math.max(0.05, Number(info?.beatLen) || 0.5);
}

function addBeamEffect(fromW, targetEnemy, ttl = null, weaponSlotIndex = null) {
  if (!enemyLayerEl || !targetEnemy) return;
  const el = document.createElement('div');
  el.className = 'beat-swarm-fx-laser';
  enemyLayerEl.appendChild(el);
  effects.push({
    kind: 'beam',
    ttl: Math.max(0.05, Number.isFinite(ttl) ? Number(ttl) : getGameplayBeatLen()),
    from: { ...fromW },
    to: { x: Number(targetEnemy.wx) || 0, y: Number(targetEnemy.wy) || 0 },
    targetEnemyId: Number.isFinite(targetEnemy.id) ? Math.trunc(targetEnemy.id) : null,
    damagePerSec: BEAM_DAMAGE_PER_SECOND,
    weaponSlotIndex: Number.isFinite(weaponSlotIndex) ? Math.trunc(weaponSlotIndex) : null,
    el,
  });
}

function addExplosionEffect(centerW, radiusWorld = EXPLOSION_RADIUS_WORLD, ttlOverride = null, weaponSlotIndex = null) {
  if (!enemyLayerEl) return;
  const el = document.createElement('div');
  el.className = 'beat-swarm-fx-explosion';
  // Keep off-screen until first visual update to avoid a one-frame origin flash.
  el.style.transform = 'translate(-9999px, -9999px)';
  enemyLayerEl.appendChild(el);
  effects.push({
    kind: 'explosion',
    ttl: Math.max(0.01, Number.isFinite(ttlOverride) ? Number(ttlOverride) : EXPLOSION_TTL),
    at: { ...centerW },
    radiusWorld: Math.max(1, Number(radiusWorld) || EXPLOSION_RADIUS_WORLD),
    weaponSlotIndex: Number.isFinite(weaponSlotIndex) ? Math.trunc(weaponSlotIndex) : null,
    el,
  });
}

function normalizeDir(dx, dy, fallbackX = 1, fallbackY = 0) {
  const len = Math.hypot(dx, dy);
  if (len > 0.0001) return { x: dx / len, y: dy / len };
  const fLen = Math.hypot(fallbackX, fallbackY) || 1;
  return { x: fallbackX / fLen, y: fallbackY / fLen };
}

function pulseHitFlash(el) {
  if (!el?.classList) return;
  el.classList.remove('is-hit-flash');
  void el.offsetWidth;
  el.classList.add('is-hit-flash');
}

function getOffsetPoint(fromPoint, towardPoint, offsetDist, fallbackDir = null) {
  const ox = Number(fromPoint?.x) || 0;
  const oy = Number(fromPoint?.y) || 0;
  const tx = Number(towardPoint?.x);
  const ty = Number(towardPoint?.y);
  let dir = null;
  if (Number.isFinite(tx) && Number.isFinite(ty)) {
    dir = normalizeDir(tx - ox, ty - oy);
  } else if (fallbackDir && Number.isFinite(fallbackDir.x) && Number.isFinite(fallbackDir.y)) {
    dir = normalizeDir(fallbackDir.x, fallbackDir.y);
  } else {
    dir = { x: 1, y: 0 };
  }
  const d = Math.max(0, Number(offsetDist) || 0);
  return { x: ox + (dir.x * d), y: oy + (dir.y * d) };
}

function getShipFacingDirWorld() {
  const rad = ((Number(shipFacingDeg) || 0) - 90) * (Math.PI / 180);
  return { x: Math.cos(rad), y: Math.sin(rad) };
}

function countOrbitingHomingMissiles() {
  let n = 0;
  for (const p of projectiles) {
    if (String(p?.kind || '') !== 'homing-missile') continue;
    if (String(p?.homingState || '') !== 'orbit') continue;
    n += 1;
  }
  return n;
}

function spawnProjectileFromDirection(fromW, dirX, dirY, damage, nextStages = null, nextBeatIndex = null, chainContext = null) {
  if (!enemyLayerEl) return;
  const dir = normalizeDir(dirX, dirY);
  const el = document.createElement('div');
  el.className = 'beat-swarm-projectile';
  enemyLayerEl.appendChild(el);
  projectiles.push({
    wx: fromW.x,
    wy: fromW.y,
    vx: dir.x * PROJECTILE_SPEED,
    vy: dir.y * PROJECTILE_SPEED,
    ttl: PROJECTILE_LIFETIME,
    damage: Math.max(1, Number(damage) || 1),
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
    nextStages: sanitizeWeaponStages(nextStages),
    nextBeatIndex: Number.isFinite(nextBeatIndex) ? Math.max(0, Math.trunc(nextBeatIndex)) : null,
    el,
  });
}

function spawnProjectile(fromW, toEnemy, damage, nextStages = null, nextBeatIndex = null, chainContext = null) {
  if (!toEnemy) return;
  const dx = toEnemy.wx - fromW.x;
  const dy = toEnemy.wy - fromW.y;
  spawnProjectileFromDirection(fromW, dx, dy, damage, nextStages, nextBeatIndex, chainContext);
}

function spawnBoomerangProjectile(fromW, dirX, dirY, damage, nextStages = null, nextBeatIndex = null, chainContext = null) {
  if (!enemyLayerEl) return;
  const dir = normalizeDir(dirX, dirY);
  const perp = { x: dir.y, y: -dir.x };
  const radius = Math.max(40, Number(PROJECTILE_BOOMERANG_RADIUS_WORLD) || 320);
  const theta = Math.PI;
  const omega = (Math.PI * 2) / Math.max(0.35, Number(PROJECTILE_BOOMERANG_LOOP_SECONDS) || 1.15);
  const el = document.createElement('div');
  el.className = 'beat-swarm-projectile';
  enemyLayerEl.appendChild(el);
  projectiles.push({
    wx: fromW.x,
    wy: fromW.y,
    vx: 0,
    vy: 0,
    ttl: Math.max(0.35, Number(PROJECTILE_BOOMERANG_LOOP_SECONDS) || 1.15),
    damage: Math.max(1, Number(damage) || 1),
    kind: 'boomerang',
    hitEnemyIds: new Set(),
    boomCenterX: fromW.x,
    boomCenterY: fromW.y,
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
    nextStages: sanitizeWeaponStages(nextStages),
    nextBeatIndex: Number.isFinite(nextBeatIndex) ? Math.max(0, Math.trunc(nextBeatIndex)) : null,
    el,
  });
}

function spawnHomingMissile(fromW, damage, nextStages = null, nextBeatIndex = null, chainContext = null) {
  if (!enemyLayerEl) return false;
  if (countOrbitingHomingMissiles() >= PROJECTILE_HOMING_MAX_ORBITING) return false;
  const orbitCount = countOrbitingHomingMissiles();
  const angle = ((orbitCount / Math.max(1, PROJECTILE_HOMING_MAX_ORBITING)) * Math.PI * 2);
  const el = document.createElement('div');
  el.className = 'beat-swarm-projectile';
  enemyLayerEl.appendChild(el);
  projectiles.push({
    wx: fromW.x,
    wy: fromW.y,
    vx: 0,
    vy: 0,
    ttl: 60,
    damage: Math.max(1, Number(damage) || 1),
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
    orbitAngVel: PROJECTILE_HOMING_ORBIT_ANG_VEL,
    orbitRadius: PROJECTILE_HOMING_ORBIT_RADIUS_WORLD,
    chainWeaponSlotIndex: Number.isFinite(chainContext?.weaponSlotIndex) ? Math.trunc(chainContext.weaponSlotIndex) : null,
    chainStageIndex: Number.isFinite(chainContext?.stageIndex) ? Math.trunc(chainContext.stageIndex) : null,
    nextStages: sanitizeWeaponStages(nextStages),
    nextBeatIndex: Number.isFinite(nextBeatIndex) ? Math.max(0, Math.trunc(nextBeatIndex)) : null,
    el,
  });
  return true;
}

function queueWeaponChain(beatIndex, nextStages, context) {
  const stages = sanitizeWeaponStages(nextStages);
  if (!stages.length) return;
  pendingWeaponChainEvents.push({
    beatIndex: Math.max(0, Math.trunc(Number(beatIndex) || 0)),
    stages,
    context: {
      origin: context?.origin ? { x: Number(context.origin.x) || 0, y: Number(context.origin.y) || 0 } : null,
      impactPoint: context?.impactPoint ? { x: Number(context.impactPoint.x) || 0, y: Number(context.impactPoint.y) || 0 } : null,
      weaponSlotIndex: Number.isFinite(context?.weaponSlotIndex) ? Math.trunc(context.weaponSlotIndex) : null,
      stageIndex: Number.isFinite(context?.stageIndex) ? Math.trunc(context.stageIndex) : null,
      impactEnemyId: Number.isFinite(context?.impactEnemyId) ? Math.trunc(context.impactEnemyId) : null,
    },
  });
}

function applyAoeAt(point, variant = 'explosion', beatIndex = 0, weaponSlotIndex = null) {
  if (!point) return;
  const radius = Math.max(1, Number(EXPLOSION_RADIUS_WORLD) || 1);
  const info = getLoopInfo?.();
  const beatLen = Math.max(0.05, Number(info?.beatLen) || 0.5);
  addExplosionEffect(point, radius, variant === 'dot-area' ? (beatLen * 2) : null, weaponSlotIndex);
  const r2 = radius * radius;
  const isDot = variant === 'dot-area';
  const hitDamage = isDot ? 0.5 : 1;
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    const dx = e.wx - point.x;
    const dy = e.wy - point.y;
    if ((dx * dx + dy * dy) <= r2) damageEnemy(e, hitDamage);
  }
  if (isDot) {
    lingeringAoeZones.push({
      x: point.x,
      y: point.y,
      radius,
      damagePerBeat: 0.6,
      untilBeat: Math.max(beatIndex + 2, beatIndex + 1),
      weaponSlotIndex: Number.isFinite(weaponSlotIndex) ? Math.trunc(weaponSlotIndex) : null,
    });
  }
}

function triggerWeaponStage(stage, originWorld, beatIndex, remainingStages = [], context = null) {
  if (!stage || !originWorld) return;
  const archetype = stage.archetype;
  const variant = stage.variant;
  const continuation = sanitizeWeaponStages(remainingStages);
  const slotIndex = Number.isFinite(context?.weaponSlotIndex) ? Math.trunc(context.weaponSlotIndex) : -1;
  const stageIndex = Number.isFinite(context?.stageIndex) ? Math.trunc(context.stageIndex) : 0;
  const nextCtx = { weaponSlotIndex: slotIndex, stageIndex: stageIndex + 1 };
  const nearest = getNearestEnemy(originWorld.x, originWorld.y);
  if (archetype === 'projectile') {
    const facingDir = getShipFacingDirWorld();
    const baseDir = nearest
      ? normalizeDir(nearest.wx - originWorld.x, nearest.wy - originWorld.y)
      : facingDir;
    if (variant === 'homing-missile') {
      spawnHomingMissile(originWorld, 2, continuation, beatIndex + 1, nextCtx);
      return;
    }
    if (variant === 'boomerang') {
      spawnBoomerangProjectile(originWorld, baseDir.x, baseDir.y, 2, continuation, beatIndex + 1, nextCtx);
      return;
    }
    if (variant === 'split-shot') {
      const baseAngle = Math.atan2(baseDir.y, baseDir.x);
      const angles = [baseAngle, baseAngle - PROJECTILE_SPLIT_ANGLE_RAD, baseAngle + PROJECTILE_SPLIT_ANGLE_RAD];
      for (const ang of angles) {
        spawnProjectileFromDirection(originWorld, Math.cos(ang), Math.sin(ang), 2, continuation, beatIndex + 1, nextCtx);
      }
      return;
    }
    if (nearest) {
      spawnProjectile(originWorld, nearest, 2, continuation, beatIndex + 1, nextCtx);
    } else {
      spawnProjectileFromDirection(originWorld, baseDir.x, baseDir.y, 2, continuation, beatIndex + 1, nextCtx);
    }
    return;
  }
  if (archetype === 'helper') {
    const anchorEnemyId = (
      variant !== 'turret' && Number.isFinite(context?.impactEnemyId)
    ) ? Math.trunc(context.impactEnemyId) : null;
    const defaultAnchorType = (variant === 'orbital-drone') ? 'player' : 'world';
    const turretSpawnPoint = (variant === 'turret')
      ? getOffsetPoint(
        originWorld,
        nearest ? { x: nearest.wx, y: nearest.wy } : null,
        HELPER_TURRET_SPAWN_OFFSET_WORLD,
        getShipFacingDirWorld()
      )
      : originWorld;
    spawnHelper(variant, turretSpawnPoint, beatIndex, continuation, {
      weaponSlotIndex: slotIndex,
      stageIndex,
      helperAnchorType: context?.helperAnchorType || defaultAnchorType,
    }, anchorEnemyId);
    return;
  }
  if (archetype === 'laser') {
    if (variant === 'beam') {
      if (!nearest) {
        const dir = getShipFacingDirWorld();
        addLaserEffect(originWorld, {
          x: originWorld.x + (dir.x * 1400),
          y: originWorld.y + (dir.y * 1400),
        }, slotIndex);
        if (continuation.length) {
          queueWeaponChain(beatIndex + 1, continuation, {
            origin: originWorld,
            impactPoint: {
              x: originWorld.x + (dir.x * 1400),
              y: originWorld.y + (dir.y * 1400),
            },
            weaponSlotIndex: slotIndex,
            stageIndex: stageIndex + 1,
          });
        }
        return;
      }
      addBeamEffect(originWorld, nearest, getGameplayBeatLen(), slotIndex);
      if (continuation.length) {
        queueWeaponChain(beatIndex + 1, continuation, {
          origin: originWorld,
          // Chain source is defined by previous stage output point.
          impactPoint: { x: nearest.wx, y: nearest.wy },
          weaponSlotIndex: slotIndex,
          stageIndex: stageIndex + 1,
        });
      }
      return;
    }
    if (!nearest) {
      const dir = getShipFacingDirWorld();
      const to = {
        x: originWorld.x + (dir.x * 1400),
        y: originWorld.y + (dir.y * 1400),
      };
      addLaserEffect(originWorld, to, slotIndex);
      if (continuation.length) {
        queueWeaponChain(beatIndex + 1, continuation, {
          origin: originWorld,
          impactPoint: to,
          weaponSlotIndex: slotIndex,
          stageIndex: stageIndex + 1,
        });
      }
      return;
    }
    addLaserEffect(originWorld, { x: nearest.wx, y: nearest.wy }, slotIndex);
    damageEnemy(nearest, 2);
    if (continuation.length) {
      queueWeaponChain(beatIndex + 1, continuation, {
        origin: originWorld,
        impactPoint: { x: nearest.wx, y: nearest.wy },
        weaponSlotIndex: slotIndex,
        stageIndex: stageIndex + 1,
      });
    }
    return;
  }
  if (archetype === 'aoe') {
    applyAoeAt(originWorld, variant, beatIndex, slotIndex);
    if (continuation.length) {
      queueWeaponChain(beatIndex + 1, continuation, {
        origin: context?.origin || originWorld,
        impactPoint: originWorld,
        weaponSlotIndex: slotIndex,
        stageIndex: stageIndex + 1,
      });
    }
  }
}

function processPendingWeaponChains(beatIndex) {
  for (let i = pendingWeaponChainEvents.length - 1; i >= 0; i--) {
    const ev = pendingWeaponChainEvents[i];
    if ((Number(ev?.beatIndex) || 0) > beatIndex) continue;
    pendingWeaponChainEvents.splice(i, 1);
    const stages = sanitizeWeaponStages(ev?.stages);
    if (!stages.length) continue;
    const stage = stages[0];
    const rem = stages.slice(1);
    // Each stage starts from the source point emitted by the previous stage.
    const origin = ev?.context?.impactPoint || ev?.context?.origin || getViewportCenterWorld();
    triggerWeaponStage(stage, origin, beatIndex, rem, ev?.context || null);
  }
}

function applyLingeringAoeBeat(beatIndex) {
  for (let i = lingeringAoeZones.length - 1; i >= 0; i--) {
    const z = lingeringAoeZones[i];
    if ((Number(z.untilBeat) || 0) < beatIndex) {
      lingeringAoeZones.splice(i, 1);
      continue;
    }
    const r2 = (Number(z.radius) || EXPLOSION_RADIUS_WORLD) ** 2;
    const dmg = Math.max(0, Number(z.damagePerBeat) || 0);
    for (let j = enemies.length - 1; j >= 0; j--) {
      const e = enemies[j];
      const dx = e.wx - z.x;
      const dy = e.wy - z.y;
      if ((dx * dx + dy * dy) <= r2) damageEnemy(e, dmg);
    }
  }
}

function fireConfiguredWeaponsOnBeat(centerWorld, beatIndex) {
  if (!centerWorld) return;
  const slotIndex = Math.max(0, Math.min(weaponLoadout.length - 1, Math.trunc(Number(activeWeaponSlotIndex) || 0)));
  const weapon = weaponLoadout[slotIndex];
  const stages = sanitizeWeaponStages(weapon?.stages);
  if (stages.length) {
    const first = stages[0];
    const rest = stages.slice(1);
    triggerWeaponStage(first, centerWorld, beatIndex, rest, {
      origin: centerWorld,
      impactPoint: centerWorld,
      weaponSlotIndex: slotIndex,
      stageIndex: 0,
    });
    return;
  }
  // Backward compatibility: legacy pickup behavior if no configured stages exist.
  const anyConfigured = weaponLoadout.some((w) => Array.isArray(w.stages) && w.stages.length > 0);
  if (anyConfigured) return;
  if (equippedWeapons.has('explosion')) applyAoeAt(centerWorld, 'explosion', beatIndex);
  const target = getNearestEnemy(centerWorld.x, centerWorld.y);
  if (!target) return;
  if (equippedWeapons.has('laser')) {
    addLaserEffect(centerWorld, { x: target.wx, y: target.wy });
    damageEnemy(target, weaponDefs.laser.damage);
  }
  if (equippedWeapons.has('projectile')) {
    spawnProjectile(centerWorld, target, weaponDefs.projectile.damage, null, null);
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
  currentBeatIndex = beatIndex;
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
  processPendingWeaponChains(beatIndex);
  applyLingeringAoeBeat(beatIndex);
  fireHelpersOnBeat(beatIndex);
  fireConfiguredWeaponsOnBeat(centerWorld, beatIndex);
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
  updateHelpers(dt, centerWorld, scale);

  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    const dx = p.wx - centerWorld.x;
    const dy = p.wy - centerWorld.y;
    if ((dx * dx + dy * dy) <= cr2) {
      equippedWeapons.add(p.weaponId);
      ensureDefaultWeaponFromLegacy(p.weaponId);
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
    const isBoomerang = String(p.kind || 'standard') === 'boomerang';
    const isHoming = String(p.kind || 'standard') === 'homing-missile';
    if (isBoomerang) {
      p.boomTheta = (Number(p.boomTheta) || 0) + ((Number(p.boomOmega) || 0) * dt);
      const c = Math.cos(p.boomTheta || 0);
      const s = Math.sin(p.boomTheta || 0);
      const r = Math.max(1, Number(p.boomRadius) || PROJECTILE_BOOMERANG_RADIUS_WORLD);
      const dirX = Number(p.boomDirX) || 0;
      const dirY = Number(p.boomDirY) || 0;
      const perpX = Number(p.boomPerpX) || 0;
      const perpY = Number(p.boomPerpY) || 0;
      // Furthest point from origin is aligned with forward target direction (dir).
      p.wx = (Number(p.boomCenterX) || 0) + (dirX * (1 + c) * r) + (perpX * s * r);
      p.wy = (Number(p.boomCenterY) || 0) + (dirY * (1 + c) * r) + (perpY * s * r);
    } else if (isHoming) {
      let state = String(p.homingState || 'orbit');
      const orbitRadius = Math.max(20, Number(p.orbitRadius) || PROJECTILE_HOMING_ORBIT_RADIUS_WORLD);
      const orbitAngVel = Number(p.orbitAngVel) || PROJECTILE_HOMING_ORBIT_ANG_VEL;
      const nearestNow = getNearestEnemy(p.wx, p.wy);
      if (state === 'orbit' && nearestNow) {
        const dx = nearestNow.wx - p.wx;
        const dy = nearestNow.wy - p.wy;
        if ((dx * dx + dy * dy) <= (PROJECTILE_HOMING_ACQUIRE_RANGE_WORLD * PROJECTILE_HOMING_ACQUIRE_RANGE_WORLD)) {
          state = 'seek';
          p.targetEnemyId = Math.trunc(Number(nearestNow.id) || 0) || null;
        }
      }
      if (state === 'seek') {
        let target = null;
        if (Number.isFinite(p.targetEnemyId)) {
          target = enemies.find((e) => Math.trunc(Number(e.id) || 0) === Math.trunc(p.targetEnemyId)) || null;
        }
        if (!target) target = getNearestEnemy(p.wx, p.wy);
        if (!target) {
          state = 'return';
          p.targetEnemyId = null;
        } else {
          p.targetEnemyId = Math.trunc(Number(target.id) || 0) || null;
          const desired = normalizeDir(target.wx - p.wx, target.wy - p.wy, p.vx, p.vy);
          const cur = normalizeDir(p.vx, p.vy, desired.x, desired.y);
          const steer = Math.max(0, Math.min(1, PROJECTILE_HOMING_TURN_RATE * dt));
          const nd = normalizeDir(
            (cur.x * (1 - steer)) + (desired.x * steer),
            (cur.y * (1 - steer)) + (desired.y * steer),
            desired.x,
            desired.y
          );
          p.vx = nd.x * PROJECTILE_HOMING_SPEED;
          p.vy = nd.y * PROJECTILE_HOMING_SPEED;
          p.wx += p.vx * dt;
          p.wy += p.vy * dt;
        }
      }
      if (state === 'return') {
        const desired = normalizeDir(centerWorld.x - p.wx, centerWorld.y - p.wy, p.vx, p.vy);
        const cur = normalizeDir(p.vx, p.vy, desired.x, desired.y);
        const steer = Math.max(0, Math.min(1, (PROJECTILE_HOMING_TURN_RATE * 1.2) * dt));
        const nd = normalizeDir(
          (cur.x * (1 - steer)) + (desired.x * steer),
          (cur.y * (1 - steer)) + (desired.y * steer),
          desired.x,
          desired.y
        );
        p.vx = nd.x * PROJECTILE_HOMING_SPEED;
        p.vy = nd.y * PROJECTILE_HOMING_SPEED;
        p.wx += p.vx * dt;
        p.wy += p.vy * dt;
        const dx = p.wx - centerWorld.x;
        const dy = p.wy - centerWorld.y;
        if ((dx * dx + dy * dy) <= (PROJECTILE_HOMING_RETURN_SNAP_DIST_WORLD * PROJECTILE_HOMING_RETURN_SNAP_DIST_WORLD)) {
          state = 'orbit';
          const d = normalizeDir(dx, dy, 1, 0);
          p.orbitAngle = Math.atan2(d.y, d.x);
          p.vx = 0;
          p.vy = 0;
        }
      }
      if (state === 'orbit') {
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
        const desired = normalizeDir(targetX - p.wx, targetY - p.wy, 1, 0);
        const cur = normalizeDir(p.vx, p.vy, desired.x, desired.y);
        const steer = Math.max(0, Math.min(1, PROJECTILE_HOMING_ORBIT_TURN_RATE * dt));
        const nd = normalizeDir(
          (cur.x * (1 - steer)) + (desired.x * steer),
          (cur.y * (1 - steer)) + (desired.y * steer),
          desired.x,
          desired.y
        );
        const speedN = Math.max(0.2, Math.min(1, toDist / Math.max(1, orbitRadius)));
        const chaseSpeed = PROJECTILE_HOMING_ORBIT_CHASE_SPEED * speedN;
        p.vx = nd.x * chaseSpeed;
        p.vy = nd.y * chaseSpeed;
        p.wx += p.vx * dt;
        p.wy += p.vy * dt;
      }
      p.homingState = state;
    } else {
      p.wx += p.vx * dt;
      p.wy += p.vy * dt;
    }
    let hit = false;
    for (let j = enemies.length - 1; j >= 0; j--) {
      const e = enemies[j];
      const dx = e.wx - p.wx;
      const dy = e.wy - p.wy;
      if ((dx * dx + dy * dy) <= pr2) {
        const enemyId = Math.trunc(Number(e.id) || 0);
        if (isBoomerang) {
          if (!(p.hitEnemyIds instanceof Set)) p.hitEnemyIds = new Set();
          if (enemyId > 0 && p.hitEnemyIds.has(enemyId)) continue;
          if (enemyId > 0) p.hitEnemyIds.add(enemyId);
        }
        damageEnemy(e, p.damage);
        const hitPoint = { x: e.wx, y: e.wy };
        if (Array.isArray(p.nextStages) && p.nextStages.length) {
          const nextBeat = Number.isFinite(p.nextBeatIndex) ? p.nextBeatIndex : (Math.max(0, currentBeatIndex) + 1);
          queueWeaponChain(nextBeat, p.nextStages, {
            origin: { x: p.wx, y: p.wy },
            impactPoint: hitPoint,
            weaponSlotIndex: Number.isFinite(p.chainWeaponSlotIndex) ? Math.trunc(p.chainWeaponSlotIndex) : null,
            stageIndex: Number.isFinite(p.chainStageIndex) ? Math.trunc(p.chainStageIndex) : null,
            impactEnemyId: enemyId > 0 ? enemyId : null,
          });
        }
        if (!isBoomerang) {
          hit = true;
          break;
        }
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
    if (fx.kind === 'laser' || fx.kind === 'beam') {
      if (fx.kind === 'beam') {
        // Constant beam always originates from the live ship position.
        fx.from = { x: centerWorld.x, y: centerWorld.y };
        let target = null;
        if (Number.isFinite(fx.targetEnemyId)) {
          target = enemies.find((e) => Math.trunc(Number(e.id) || 0) === Math.trunc(fx.targetEnemyId)) || null;
        }
        if (!target) {
          target = getNearestEnemy(fx.from?.x || 0, fx.from?.y || 0);
          fx.targetEnemyId = Number.isFinite(target?.id) ? Math.trunc(target.id) : null;
        }
        if (target) {
          fx.to = { x: target.wx, y: target.wy };
          damageEnemy(target, Math.max(0, Number(fx.damagePerSec) || 0) * dt);
        }
      }
      const a = worldToScreen({ x: fx.from.x, y: fx.from.y });
      const b = worldToScreen({ x: fx.to.x, y: fx.to.y });
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
        fx.el.style.opacity = `${Math.max(0, Math.min(1, fx.ttl / LASER_TTL))}`;
      }
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
  if (!borderForceEnabled) {
    barrierPushingOut = false;
    barrierPushCharge = 0;
    setResistanceVisual(false);
    setReactiveArrowVisual(false);
    return false;
  }
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
  if (!borderForceEnabled) return centerWorld;
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
  if (!borderForceEnabled) return centerWorld;
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

function shouldSuppressSteeringForRelease(input, centerWorld) {
  if (dragPointerId == null) return false;
  if (!arenaCenterWorld || !centerWorld) return false;
  if (!input || !(input.mag > 0.0001)) return false;
  const dx = centerWorld.x - arenaCenterWorld.x;
  const dy = centerWorld.y - arenaCenterWorld.y;
  const dist = Math.hypot(dx, dy) || 0;
  if (!(dist > SWARM_ARENA_RADIUS_WORLD) || !(dist > 0.0001)) return false;
  const nx = dx / dist;
  const ny = dy / dist;
  const inputOut = Math.max(0, (input.x * nx) + (input.y * ny));
  return inputOut > 0.0001;
}

function getOutwardOnlyInput(input, centerWorld) {
  if (!input || !arenaCenterWorld || !centerWorld) return { x: 0, y: 0, mag: 0 };
  const dx = centerWorld.x - arenaCenterWorld.x;
  const dy = centerWorld.y - arenaCenterWorld.y;
  const dist = Math.hypot(dx, dy) || 0;
  if (!(dist > 0.0001)) return { x: 0, y: 0, mag: 0 };
  const nx = dx / dist;
  const ny = dy / dist;
  const inputOut = Math.max(0, (input.x * nx) + (input.y * ny));
  if (!(inputOut > 0.0001)) return { x: 0, y: 0, mag: 0 };
  return {
    x: nx * inputOut,
    y: ny * inputOut,
    mag: Math.max(0, Math.min(1, (Number(input.mag) || 0) * inputOut)),
  };
}

function getShipFacingFromReleaseAim(input, centerWorld) {
  if (!input || !arenaCenterWorld || !centerWorld) return null;
  if (!(input.mag > 0.0001)) return null;
  const dx = centerWorld.x - arenaCenterWorld.x;
  const dy = centerWorld.y - arenaCenterWorld.y;
  const dist = Math.hypot(dx, dy) || 0;
  if (!(dist > SWARM_ARENA_RADIUS_WORLD) || !(dist > 0.0001)) return null;
  const nx = dx / dist;
  const ny = dy / dist;
  const inputOut = Math.max(0, (input.x * nx) + (input.y * ny));
  if (!(inputOut > 0.0001)) return null;
  // Match reactive-arrow heading: arrow angle is atan2(-input.y, -input.x), and
  // ship uses +90deg convention for its sprite orientation.
  return (Math.atan2(-input.y, -input.x) * 180 / Math.PI) + 90;
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

function updateShipFacing(dt, inputX, inputY, overrideTargetDeg = null) {
  const speed = Math.hypot(velocityX, velocityY);
  let targetDeg = Number.isFinite(overrideTargetDeg) ? Number(overrideTargetDeg) : shipFacingDeg;
  if (Number.isFinite(overrideTargetDeg)) {
    // keep explicit override from release-aim state
  } else if (speed > 14) {
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
  if (gameplayPaused) {
    const zPause = getZoomState();
    const scalePause = Number.isFinite(zPause?.targetScale) ? zPause.targetScale : (Number.isFinite(zPause?.currentScale) ? zPause.currentScale : 1);
    const centerPause = getViewportCenterWorld();
    const outsideMainPause = arenaCenterWorld
      ? (Math.hypot(centerPause.x - arenaCenterWorld.x, centerPause.y - arenaCenterWorld.y) > SWARM_ARENA_RADIUS_WORLD)
      : false;
    updateArenaVisual(scalePause, outsideMainPause);
    updateStarfieldVisual();
    try { spawnerRuntime?.update?.(0); } catch {}
    updatePausePreview(dt);
    rafId = requestAnimationFrame(tick);
    return;
  }
  updateArenaPath(dt);
  updateStarfieldVisual();
  postReleaseAssistTimer = Math.max(0, postReleaseAssistTimer - dt);
  if (postReleaseAssistTimer <= 0) lastLaunchBeatLevel = 0;
  setThrustFxVisual(postReleaseAssistTimer > 0);

  const z = getZoomState();
  const scale = Number.isFinite(z?.targetScale) ? z.targetScale : (Number.isFinite(z?.currentScale) ? z.currentScale : 1);
  const centerWorld = getViewportCenterWorld();
  const input = getInputVector();
  const suppressSteering = shouldSuppressSteeringForRelease(input, centerWorld);
  const steerInput = suppressSteering ? getOutwardOnlyInput(input, centerWorld) : input;
  if (steerInput.mag > 0.0001) {
    const targetVx = steerInput.x * SWARM_MAX_SPEED * steerInput.mag;
    const targetVy = steerInput.y * SWARM_MAX_SPEED * steerInput.mag;
    let steerX = targetVx - velocityX;
    let steerY = targetVy - velocityY;
    const steerLen = Math.hypot(steerX, steerY) || 0;
    const maxDelta = SWARM_ACCEL * dt;
    if (steerLen > maxDelta) {
      const k = maxDelta / steerLen;
      steerX *= k;
      steerY *= k;
    }
    velocityX += steerX * SWARM_TURN_WEIGHT + steerX * (1 - SWARM_TURN_WEIGHT) * steerInput.mag;
    velocityY += steerY * SWARM_TURN_WEIGHT + steerY * (1 - SWARM_TURN_WEIGHT) * steerInput.mag;
  } else {
    const decay = Math.exp(-SWARM_DECEL * dt);
    velocityX *= decay;
    velocityY *= decay;
    if (Math.hypot(velocityX, velocityY) < SWARM_STOP_EPS) {
      velocityX = 0;
      velocityY = 0;
    }
  }
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
  const aimFacingDeg = getShipFacingFromReleaseAim(input, centerWorldAfterMove);
  updateShipFacing(dt, input.x, input.y, aimFacingDeg);
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
  if (gameplayPaused) return;
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
  if (gameplayPaused) return;
  if (dragPointerId == null || ev.pointerId !== dragPointerId) return;
  dragNowX = ev.clientX;
  dragNowY = ev.clientY;
  ev.preventDefault();
}

function onPointerUp(ev) {
  if (!active) return;
  if (gameplayPaused) return;
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

function onTransportPause() {
  if (!active) return;
  setGameplayPaused(true);
}

function onTransportResume() {
  if (!active) return;
  setGameplayPaused(false);
}

function onKeyDown(ev) {
  if (!active) return;
  if (gameplayPaused) return;
  const code = String(ev?.code || '');
  if (code === 'Digit1') {
    if (setActiveWeaponSlot(0)) ev.preventDefault();
    return;
  }
  if (code === 'Digit2') {
    if (setActiveWeaponSlot(1)) ev.preventDefault();
    return;
  }
  if (code === 'Digit3') {
    if (setActiveWeaponSlot(2)) ev.preventDefault();
    return;
  }
  if (code === 'KeyQ') {
    const next = (Math.max(0, Math.trunc(Number(activeWeaponSlotIndex) || 0) + MAX_WEAPON_SLOTS - 1)) % MAX_WEAPON_SLOTS;
    if (setActiveWeaponSlot(next)) ev.preventDefault();
    return;
  }
  if (code === 'KeyE') {
    const next = (Math.max(0, Math.trunc(Number(activeWeaponSlotIndex) || 0) + 1)) % MAX_WEAPON_SLOTS;
    if (setActiveWeaponSlot(next)) ev.preventDefault();
  }
}

function bindInput() {
  overlayEl?.addEventListener('pointerdown', onPointerDown, { passive: false });
  overlayEl?.addEventListener('pointermove', onPointerMove, { passive: false });
  overlayEl?.addEventListener('pointerup', onPointerUp, { passive: false });
  overlayEl?.addEventListener('pointercancel', onPointerUp, { passive: false });
  document.addEventListener('keydown', onKeyDown, { passive: false });
  window.addEventListener('wheel', onWheel, { passive: false, capture: true });
  document.addEventListener('transport:pause', onTransportPause, { passive: true });
  document.addEventListener('transport:resume', onTransportResume, { passive: true });
  document.addEventListener('transport:play', onTransportResume, { passive: true });
}

function unbindInput() {
  overlayEl?.removeEventListener('pointerdown', onPointerDown);
  overlayEl?.removeEventListener('pointermove', onPointerMove);
  overlayEl?.removeEventListener('pointerup', onPointerUp);
  overlayEl?.removeEventListener('pointercancel', onPointerUp);
  document.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('wheel', onWheel, { capture: true });
  document.removeEventListener('transport:pause', onTransportPause);
  document.removeEventListener('transport:resume', onTransportResume);
  document.removeEventListener('transport:play', onTransportResume);
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
  if (overlayEl) overlayEl.hidden = true;
  if (exitBtn) exitBtn.hidden = false;
  if (starfieldLayerEl) starfieldLayerEl.hidden = true;
  if (spawnerLayerEl) spawnerLayerEl.hidden = true;
  if (enemyLayerEl) enemyLayerEl.hidden = true;
  setJoystickVisible(false);
  setThrustFxVisual(false);
  clearEnemies();
  clearPickups();
  clearProjectiles();
  clearEffects();
  clearHelpers();
  clearPendingWeaponChainEvents();
  clearLingeringAoeZones();
  clearStarfield();
  arenaCenterWorld = null;
  barrierPushingOut = false;
  barrierPushCharge = 0;
  releaseBeatLevel = 0;
  lastLaunchBeatLevel = 0;
  postReleaseAssistTimer = 0;
  outerForceContinuousSeconds = 0;
  releaseForcePrimed = false;
  const shouldStartPaused = !(isRunning?.());
  setGameplayPaused(shouldStartPaused);
  if (!restoreState) resetArenaPathState();
  lastBeatIndex = null;
  try { spawnerRuntime?.enter?.(); } catch {}
  try { configureInitialSpawnerEnablement(); } catch {}
  if (!restoreState) {
    activeWeaponSlotIndex = 0;
    seedDefaultWeaponLoadout();
    renderPauseWeaponUi();
    const startWorld = getSceneStartWorld();
    snapCameraToWorld(startWorld, SWARM_CAMERA_TARGET_SCALE);
    arenaCenterWorld = { x: Number(startWorld.x) || 0, y: Number(startWorld.y) || 0 };
    initStarfieldNear(arenaCenterWorld);
    spawnStarterPickups(arenaCenterWorld);
    updateArenaVisual((Number(getZoomState?.()?.targetScale) || Number(getZoomState?.()?.currentScale) || 1));
    updateStarfieldVisual();
    try { spawnerRuntime?.update?.(0); } catch {}
    setResistanceVisual(false);
    setReactiveArrowVisual(false);
  } else {
    restoreBeatSwarmState(restoreState);
    updateArenaVisual((Number(getZoomState?.()?.targetScale) || Number(getZoomState?.()?.currentScale) || 1));
    updateStarfieldVisual();
    try { spawnerRuntime?.update?.(0); } catch {}
    setResistanceVisual(false);
    setReactiveArrowVisual(false);
  }
  if (spawnerLayerEl) spawnerLayerEl.hidden = false;
  if (enemyLayerEl) enemyLayerEl.hidden = false;
  if (starfieldLayerEl) starfieldLayerEl.hidden = false;
  if (overlayEl) overlayEl.hidden = false;
  bindInput();
  startTick();
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
  if (starfieldLayerEl) starfieldLayerEl.hidden = true;
  if (spawnerLayerEl) spawnerLayerEl.hidden = true;
  if (enemyLayerEl) enemyLayerEl.hidden = true;
  setJoystickVisible(false);
  setThrustFxVisual(false);
  stopTick();
  stopComponentLivePreviews();
  unbindInput();
  try { spawnerRuntime?.exit?.(); } catch {}
  clearEnemies();
  clearPickups();
  clearProjectiles();
  clearEffects();
  clearHelpers();
  clearPendingWeaponChainEvents();
  clearLingeringAoeZones();
  clearStarfield();
  arenaCenterWorld = null;
  barrierPushingOut = false;
  barrierPushCharge = 0;
  releaseBeatLevel = 0;
  lastLaunchBeatLevel = 0;
  postReleaseAssistTimer = 0;
  outerForceContinuousSeconds = 0;
  releaseForcePrimed = false;
  setGameplayPaused(false);
  resetArenaPathState();
  if (arenaRingEl) arenaRingEl.style.opacity = '0';
  if (arenaCoreEl) arenaCoreEl.style.opacity = '0';
  if (arenaLimitEl) arenaLimitEl.style.opacity = '0';
  setResistanceVisual(false);
  setReactiveArrowVisual(false);
  equippedWeapons.clear();
  activeWeaponSlotIndex = 0;
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

try {
  window.__beatSwarmDebug = Object.assign(window.__beatSwarmDebug || {}, {
    setBorderForceEnabled(next) {
      borderForceEnabled = !!next;
      if (!borderForceEnabled) {
        barrierPushingOut = false;
        barrierPushCharge = 0;
        releaseForcePrimed = false;
        releaseBeatLevel = 0;
        setResistanceVisual(false);
        setReactiveArrowVisual(false);
      }
      return borderForceEnabled;
    },
    getBorderForceEnabled() {
      return !!borderForceEnabled;
    },
  });
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
