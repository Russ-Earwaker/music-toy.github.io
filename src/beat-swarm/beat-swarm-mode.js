import { getZoomState } from '../zoom/ZoomCoordinator.js';
import { screenToWorld, worldToScreen } from '../board-viewport.js';
import { createBeatSwarmSpawnerRuntime, registerLoopgridSpawnerType } from './spawner-runtime.js';
import { getLoopInfo, isRunning, start as startTransport, stop as stopTransport } from '../audio-core.js';
import { triggerInstrument } from '../audio-samples.js';
import { getAllIds, getIdForDisplayName, getInstrumentEntries } from '../instrument-catalog.js';
import { getSoundThemeKey, pickInstrumentForToy } from '../sound-theme.js';
import { buildPalette, midiToName } from '../note-helpers.js';
import { createArtToyAt } from '../art/art-toy-factory.js';
import { createSwarmDirector } from './swarm-director.js';
import { createPerformedBeatEvent, BEAT_EVENT_ROLES, BEAT_EVENT_THREAT } from './beat-events.js';
import { createBeatSwarmPaletteRuntime } from './beat-swarm-palette.js';
import { createBeatSwarmPacing } from './beat-swarm-pacing.js';
import { createBeatSwarmMusicLab } from './beat-swarm-music-lab.js';
import {
  normalizeCallResponseLane,
  pickComposerGroupTemplate,
} from './beat-swarm-groups.js';
import {
  createComposerEnemyGroupProfile as buildComposerEnemyGroupProfile,
  pickComposerGroupShape,
  pickComposerGroupColor,
} from './beat-swarm-composer-groups.js';
import { maintainComposerEnemyGroupsLifecycle } from './beat-swarm-composer-lifecycle.js';
import {
  chooseComposerGroupEnemyForNote as pickComposerEnemyForNote,
  collectComposerGroupStepBeatEvents as collectComposerGroupStepEvents,
} from './beat-swarm-composer-events.js';
import {
  spawnComposerGroupEnemyAtRuntime,
  spawnComposerGroupOffscreenMembersRuntime,
} from './beat-swarm-composer-spawn.js';

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
let spawnHealthDebugEl = null;
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
let activeDamageSoundStageIndex = null;
let beamSoundGateBeatIndex = -1;
const beamSoundGateSlotKeys = new Set();
const beamSustainStateBySlot = new Map();

let dragPointerId = null;
let dragStartX = 0;
let dragStartY = 0;
let dragNowX = 0;
let dragNowY = 0;

let velocityX = 0;
let velocityY = 0;
let shipFacingDeg = 0;
const perfLabRuntime = {
  autoMoveEnabled: false,
  autoMovePhase: 0,
  autoMoveMagnitude: 0.82,
};
const enemies = [];
const pendingEnemyDeaths = [];
const pickups = [];
const projectiles = [];
const effects = [];
const helpers = [];
const starfieldStars = [];
let enemyIdSeq = 1;
let helperIdSeq = 1;
let weaponChainEventSeq = 1;
const pendingWeaponChainEvents = [];
const lingeringAoeZones = [];
const MAX_WEAPON_SLOTS = 3;
const MAX_WEAPON_STAGES = 5;
const WEAPON_TUNE_STEPS = 8;
const WEAPON_TUNE_CHAIN_LENGTH = 2;
const WEAPON_TUNE_BASE_ACTIVE_EVENTS = WEAPON_TUNE_STEPS;
const WEAPON_TUNE_NOTES_ONE_OCTAVE = Object.freeze(['C4', 'D#4', 'F4', 'G4', 'A#4']);
const DRAWGRID_TUNE_ROWS = 12;
const DRAWGRID_TUNE_NOTE_PALETTE = Object.freeze(
  buildPalette(48, Array.from({ length: DRAWGRID_TUNE_ROWS }, (_, i) => i), 1).reverse().map((m) => midiToName(m))
);
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
  tune: null,
  tuneChain: [],
}));
const tuneEditorState = {
  open: false,
  slotIndex: -1,
  beatTimer: 0,
  playheadStep: 0,
  panel: null,
  panelUpdateHandler: null,
};
const weaponSubBoardState = {
  open: false,
  slotIndex: -1,
  slotBoards: Array.from({ length: MAX_WEAPON_SLOTS }, () => ({
    artToyId: '',
    boundPanelIds: new Set(),
    scheduledTimeoutIds: new Set(),
    seededStarterPattern: false,
    seedingStarterPattern: false,
    openTuneSnapshot: null,
    openTuneChainSnapshot: null,
    lastBindSignature: '',
    sessionDirty: false,
    syncTimerId: 0,
  })),
};
function createDefaultWeaponTune() {
  const notes = DRAWGRID_TUNE_NOTE_PALETTE.slice();
  const rows = Math.max(1, notes.length);
  const steps = Math.max(1, WEAPON_TUNE_STEPS);
  const active = Array.from({ length: steps }, () => true);
  const list = Array.from({ length: steps }, () => [Math.max(0, rows - 1)]);
  const disabled = Array.from({ length: steps }, () => []);
  return { kind: 'drawgrid', steps, notes, active, list, disabled };
}

function createRandomWeaponTune() {
  const base = createDefaultWeaponTune();
  const steps = Math.max(1, Math.trunc(Number(base.steps) || WEAPON_TUNE_STEPS));
  const notes = DRAWGRID_TUNE_NOTE_PALETTE.slice();
  const rows = Math.max(1, notes.length);
  const active = Array.from({ length: steps }, () => false);
  const list = Array.from({ length: steps }, () => []);
  const disabled = Array.from({ length: steps }, () => []);
  for (let s = 0; s < steps; s++) {
    if (Math.random() >= 0.62) continue;
    const r = Math.max(0, Math.min(rows - 1, Math.trunc(Math.random() * rows)));
    active[s] = true;
    // Startup tune is monophonic so projectile count maps 1:1 to active notes.
    list[s] = [r];
  }
  if (!active.some(Boolean)) {
    const s = Math.max(0, Math.min(steps - 1, Math.trunc(Math.random() * steps)));
    const r = Math.max(0, Math.min(rows - 1, Math.trunc(Math.random() * rows)));
    active[s] = true;
    list[s] = [r];
  }
  return { kind: 'drawgrid', steps, notes, active, list, disabled };
}

function createDistinctRandomWeaponTune(referenceTune) {
  const refSig = getWeaponTuneSignature(referenceTune);
  for (let i = 0; i < 16; i++) {
    const candidate = createRandomWeaponTune();
    if (getWeaponTuneSignature(candidate) !== refSig) return candidate;
  }
  // Extremely unlikely fallback: flip one step to force a different signature.
  const fallback = sanitizeWeaponTune(referenceTune);
  const steps = Math.max(1, Math.trunc(Number(fallback?.steps) || WEAPON_TUNE_STEPS));
  const rowCount = Math.max(1, Array.isArray(fallback?.notes) ? fallback.notes.length : DRAWGRID_TUNE_NOTE_PALETTE.length);
  const step = Math.max(0, Math.min(steps - 1, Math.trunc(Math.random() * steps)));
  const row = Math.max(0, Math.min(rowCount - 1, Math.trunc(Math.random() * rowCount)));
  fallback.active[step] = true;
  fallback.list[step] = [row];
  return fallback;
}

function sanitizeWeaponTune(rawTune) {
  const base = createDefaultWeaponTune();
  const steps = Math.max(1, WEAPON_TUNE_STEPS);
  const notes = DRAWGRID_TUNE_NOTE_PALETTE.slice();
  const active = Array.from({ length: steps }, () => false);
  const list = Array.from({ length: steps }, () => []);
  const disabled = Array.from({ length: steps }, () => []);
  if (rawTune && Array.isArray(rawTune.cells)) {
    // Back-compat with earlier 2D tune grid format.
    for (let s = 0; s < steps; s++) {
      const col = Array.isArray(rawTune.cells[s]) ? rawTune.cells[s] : [];
      const picked = [];
      for (let r = 0; r < Math.min(notes.length, col.length); r++) if (col[r]) picked.push(r);
      if (picked.length) {
        active[s] = true;
        list[s] = picked;
      }
    }
  } else {
    const srcSteps = Math.max(1, Math.trunc(Number(rawTune?.steps) || base.steps || steps));
    const srcActive = Array.isArray(rawTune?.nodes?.active) ? rawTune.nodes.active : Array.isArray(rawTune?.active) ? rawTune.active : base.active;
    const srcList = Array.isArray(rawTune?.nodes?.list) ? rawTune.nodes.list : Array.isArray(rawTune?.list) ? rawTune.list : base.list;
    const srcDisabled = Array.isArray(rawTune?.nodes?.disabled) ? rawTune.nodes.disabled : Array.isArray(rawTune?.disabled) ? rawTune.disabled : base.disabled;
    for (let s = 0; s < steps; s++) {
      const srcCol = ((s % srcSteps) + srcSteps) % srcSteps;
      const on = !!srcActive?.[srcCol];
      const rowsRaw = Array.isArray(srcList?.[srcCol]) ? srcList[srcCol] : [];
      const rows = rowsRaw
        .map((v) => Math.trunc(Number(v)))
        .filter((v) => v >= 0 && v < notes.length);
      active[s] = on && rows.length > 0;
      list[s] = rows;
      disabled[s] = (Array.isArray(srcDisabled?.[srcCol]) ? srcDisabled[srcCol] : [])
        .map((v) => Math.trunc(Number(v)))
        .filter((v) => v >= 0 && v < notes.length);
    }
  }
  return { kind: 'drawgrid', steps, notes, active, list, disabled };
}

function sanitizeWeaponTuneChain(rawChain) {
  const arr = Array.isArray(rawChain) ? rawChain : [];
  const out = [];
  for (const raw of arr) out.push(sanitizeWeaponTune(raw));
  return out;
}

function countWeaponTuneActiveEvents(tune) {
  let n = 0;
  const steps = Math.max(1, Math.trunc(Number(tune?.steps) || WEAPON_TUNE_STEPS));
  const active = Array.isArray(tune?.active) ? tune.active : [];
  const list = Array.isArray(tune?.list) ? tune.list : [];
  for (let s = 0; s < steps; s++) {
    if (!active[s]) continue;
    const rows = Array.isArray(list[s]) ? list[s] : [];
    n += rows.length;
  }
  return n;
}

function countWeaponTuneActiveColumns(tune) {
  let n = 0;
  const steps = Math.max(1, Math.trunc(Number(tune?.steps) || WEAPON_TUNE_STEPS));
  const active = Array.isArray(tune?.active) ? tune.active : [];
  const list = Array.isArray(tune?.list) ? tune.list : [];
  for (let s = 0; s < steps; s++) {
    if (!active[s]) continue;
    const rows = Array.isArray(list[s]) ? list[s] : [];
    if (rows.length > 0) n += 1;
  }
  return n;
}

function getWeaponSlotTuneChain(slotIndex) {
  const idx = Math.max(0, Math.min(MAX_WEAPON_SLOTS - 1, Math.trunc(Number(slotIndex) || 0)));
  const slot = weaponLoadout[idx];
  const baseChain = sanitizeWeaponTuneChain(slot?.tuneChain);
  const chain = baseChain.length ? baseChain : [sanitizeWeaponTune(slot?.tune)];
  let synthesized = chain.length !== baseChain.length;
  while (chain.length < WEAPON_TUNE_CHAIN_LENGTH) {
    const prev = chain[chain.length - 1] || chain[0];
    chain.push(createDistinctRandomWeaponTune(prev));
    synthesized = true;
  }
  if (chain.length > WEAPON_TUNE_CHAIN_LENGTH) chain.length = WEAPON_TUNE_CHAIN_LENGTH;
  if (synthesized) {
    slot.tuneChain = chain.map((t) => sanitizeWeaponTune(t));
    slot.tune = sanitizeWeaponTune(chain[0]);
  }
  return chain;
}

function getWeaponTuneActivityStats(slotIndex) {
  const chain = getWeaponSlotTuneChain(slotIndex);
  let totalNotes = 0;
  let activeNotes = 0;
  for (const tune of chain) {
    const steps = Math.max(1, Math.trunc(Number(tune?.steps) || WEAPON_TUNE_STEPS));
    totalNotes += steps;
    activeNotes += countWeaponTuneActiveColumns(tune);
  }
  if (totalNotes <= 0) totalNotes = WEAPON_TUNE_STEPS;
  return { activeNotes, totalNotes };
}

function shouldMuteProjectileStageSound(slotIndex) {
  const idx = Math.max(0, Math.min(MAX_WEAPON_SLOTS - 1, Math.trunc(Number(slotIndex) || 0)));
  return hasWeaponSubBoard(idx);
}

function getWeaponTuneDamageScale(slotIndex) {
  const stats = getWeaponTuneActivityStats(slotIndex);
  const active = Math.max(0, Number(stats.activeNotes) || 0);
  const total = Math.max(1, Number(stats.totalNotes) || WEAPON_TUNE_STEPS);
  if (active <= 0) return 1;
  const scale = total / active;
  return Math.max(0.25, Math.min(8, Number(scale) || 1));
}

function getWeaponTuneStepNotes(slotIndex, beatIndex) {
  const idx = Math.max(0, Math.min(MAX_WEAPON_SLOTS - 1, Math.trunc(Number(slotIndex) || 0)));
  const chain = getWeaponSlotTuneChain(idx);
  let totalSteps = 0;
  for (const tune of chain) totalSteps += Math.max(1, Math.trunc(Number(tune?.steps) || WEAPON_TUNE_STEPS));
  totalSteps = Math.max(1, totalSteps);
  let rem = ((Math.trunc(Number(beatIndex) || 0) % totalSteps) + totalSteps) % totalSteps;
  let tune = chain[0];
  let step = 0;
  for (const candidate of chain) {
    const steps = Math.max(1, Math.trunc(Number(candidate?.steps) || WEAPON_TUNE_STEPS));
    if (rem < steps) {
      tune = candidate;
      step = rem;
      break;
    }
    rem -= steps;
  }
  if (!Array.isArray(tune?.active) || !tune.active[step]) return [];
  const colRows = Array.isArray(tune?.list?.[step]) ? tune.list[step] : [];
  const out = [];
  for (const rRaw of colRows) {
    const r = Math.trunc(Number(rRaw));
    if (!(r >= 0 && r < tune.notes.length)) continue;
    const note = normalizeSwarmNoteName(tune.notes[r]) || getRandomSwarmPentatonicNote();
    out.push(note);
  }
  return out;
}

function hasWeaponTuneContent(slotIndex) {
  const chain = getWeaponSlotTuneChain(slotIndex);
  for (const tune of chain) {
    if (countWeaponTuneActiveEvents(sanitizeWeaponTune(tune)) > 0) return true;
  }
  return false;
}

function ensureWeaponHasStarterTune(slotIndex) {
  const idx = Math.max(0, Math.min(MAX_WEAPON_SLOTS - 1, Math.trunc(Number(slotIndex) || 0)));
  if (hasWeaponTuneContent(idx)) return;
  const starter = createRandomWeaponTune();
  weaponLoadout[idx].tune = starter;
  weaponLoadout[idx].tuneChain = [
    sanitizeWeaponTune(starter),
    sanitizeWeaponTune(createDistinctRandomWeaponTune(starter)),
  ];
}

function seedDefaultWeaponLoadout() {
  for (let i = 0; i < weaponLoadout.length; i++) {
    const slot = weaponLoadout[i];
    slot.name = `Weapon ${i + 1}`;
    slot.stages = [];
    slot.tune = createDefaultWeaponTune();
    slot.tuneChain = [sanitizeWeaponTune(slot.tune), sanitizeWeaponTune(slot.tune)];
  }
  // Default starter: Projectile -> Explosion.
  weaponLoadout[0].stages = [
    { archetype: 'projectile', variant: 'standard' },
    { archetype: 'aoe', variant: 'explosion' },
  ];
  const randomStarterTune = createRandomWeaponTune();
  weaponLoadout[0].tune = randomStarterTune;
  weaponLoadout[0].tuneChain = [
    sanitizeWeaponTune(randomStarterTune),
    sanitizeWeaponTune(createDistinctRandomWeaponTune(randomStarterTune)),
  ];
}

seedDefaultWeaponLoadout();
const ENEMY_CAP = 120;
const ENEMY_ACCEL = 680;
const ENEMY_MAX_SPEED = 260;
const ENEMY_HIT_RADIUS = 20;
const ENEMY_SPAWN_START_SCALE = 0.2;
const ENEMY_SPAWN_DURATION = 0.58;
const ENEMY_TARGET_ACTIVE_COUNT = 24;
const ENEMY_MANAGER_MAX_FALLBACK_PER_TICK = 2;
const ENEMY_FALLBACK_SPAWN_MARGIN_PX = 42;
const SPAWNER_ENEMY_ENABLED = true;
const SPAWNER_ENEMY_TARGET_COUNT = 1; // test mode
const SPAWNER_ENEMY_HEALTH_MULTIPLIER = 18;
const SPAWNER_ENEMY_TRIGGER_SOUND_VOLUME = 0.42;
const SPAWNER_ENEMY_GRID_WORLD_OFFSET = 86;
const SPAWNER_ENEMY_SPEED_MULTIPLIER = 0.5;
const SPAWNER_ENEMY_BURST_MIN_PX = 48;
const SPAWNER_ENEMY_BURST_MAX_PX = 180;
const SPAWNER_ENEMY_PROJECTILE_HIT_RADIUS_PX = 86;
const SPAWNER_LINKED_ATTACK_SPEED = 760;
const DRAW_SNAKE_ENEMY_ENABLED = true;
const DRAW_SNAKE_ENEMY_TARGET_COUNT = 1;
const DRAW_SNAKE_ENEMY_HEALTH_MULTIPLIER = SPAWNER_ENEMY_HEALTH_MULTIPLIER;
const DRAW_SNAKE_SEGMENT_COUNT = 12;
const DRAW_SNAKE_SEGMENT_SPACING_WORLD = 176;
const DRAW_SNAKE_TRIGGER_SOUND_VOLUME = 0.45;
const PLAYER_MASK_DUCK_ENEMY_VOLUME_MULT = 0.16;
const PLAYER_MASK_DUCK_KEEP_CHANCE_BY_CHANNEL = Object.freeze({
  spawner: 0.22,
  drawsnake: 0.26,
  composer: 0.24,
  default: 0.24,
});
const PLAYER_MASK_STEP_EVENT_KEEP_CHANCE = Object.freeze({
  'spawner-spawn': 0.22,
  'drawsnake-projectile': 0,
  'composer-group-projectile': 0,
  'composer-group-explosion': 0,
  default: 0,
});
const PLAYER_MASK_MAX_ENEMY_EVENTS_PER_STEP = 1;
const DRAW_SNAKE_PROJECTILE_SPEED = 760;
const DRAW_SNAKE_PROJECTILE_DAMAGE = 1.25;
const RETIRING_RETREAT_DELAY_SEC = 10;
const DRAW_SNAKE_LINE_WIDTH_PX_FALLBACK = 6;
const DRAW_SNAKE_VISUAL_SCALE = 4;
const DRAW_SNAKE_WIND_ACCEL = 420;
const DRAW_SNAKE_WIND_FREQ_HZ = 0.65;
const DRAW_SNAKE_SCREEN_MARGIN_PX = 180;
const DRAW_SNAKE_EDGE_PULL_RATE = 8;
const DRAW_SNAKE_NODE_SIZE_SCALE = 0.75;
const DRAW_SNAKE_TURN_INTERVAL_MIN = 1.1;
const DRAW_SNAKE_TURN_INTERVAL_MAX = 2.8;
const DRAW_SNAKE_TURN_RATE_MIN = 0.32;
const DRAW_SNAKE_TURN_RATE_MAX = 1.1;
const DRAW_SNAKE_ARENA_BIAS_RADIUS_SCALE = 0.82;
const DRAW_SNAKE_ARENA_BIAS_STRENGTH = 0.18;
const COMPOSER_ENABLED = true;
const COMPOSER_BEATS_PER_BAR = 4;
const COMPOSER_SECTIONS = Object.freeze([
  Object.freeze({ id: 'verse', bars: 8, directive: Object.freeze({ drumLoops: 1, drawSnakes: 1, intensity: 0.62 }) }),
  Object.freeze({ id: 'chorus', bars: 8, directive: Object.freeze({ drumLoops: 2, drawSnakes: 1, intensity: 0.92 }) }),
  Object.freeze({ id: 'verse', bars: 8, directive: Object.freeze({ drumLoops: 1, drawSnakes: 1, intensity: 0.68 }) }),
  Object.freeze({ id: 'chorus', bars: 8, directive: Object.freeze({ drumLoops: 2, drawSnakes: 1, intensity: 1.0 }) }),
]);
const COMPOSER_GROUPS_ENABLED = true;
const COMPOSER_GROUP_SIZE_MIN = 4;
const COMPOSER_GROUP_SIZE_MAX = 7;
const COMPOSER_GROUP_NOTES_MIN = 3;
const COMPOSER_GROUP_NOTES_MAX = 5;
const COMPOSER_GROUP_ACTIONS = Object.freeze(['projectile', 'explosion']);
const COMPOSER_GROUP_PERFORMERS_MIN = 1;
const COMPOSER_GROUP_PERFORMERS_MAX = 2;
const COMPOSER_GROUP_PROJECTILE_SPEED = 760;
const COMPOSER_GROUP_EXPLOSION_RADIUS_WORLD = 115;
const COMPOSER_GROUP_EXPLOSION_TTL = 0.18;
const LOW_THREAT_BURST_RADIUS_WORLD = 72;
const LOW_THREAT_BURST_TTL = 0.14;
const COMPOSER_GROUP_ACTION_PULSE_SECONDS = 0.24;
const COMPOSER_GROUP_ACTION_PULSE_SCALE = 0.28;
const COMPOSER_GROUP_LOOP_HITS_MIN = 2;
const COMPOSER_GROUP_LOOP_HITS_MAX = 3;
const COMPOSER_GROUP_SEPARATION_RADIUS_WORLD = 240;
const COMPOSER_GROUP_SEPARATION_FORCE = 760;
const COMPOSER_GROUP_COLORS = Object.freeze(['#ff8b6e', '#ff5f68', '#ffae56', '#73dcff', '#9bff8f']);
const COMPOSER_GROUP_SHAPES = Object.freeze(['circle', 'square', 'diamond']);
const COMPOSER_GROUP_TEMPLATE_LIBRARY = Object.freeze([
  Object.freeze({
    id: 'bass_spawner_group',
    role: BEAT_EVENT_ROLES.BASS,
    size: 1,
    performers: 1,
    actionType: 'projectile',
    threatLevel: BEAT_EVENT_THREAT.LIGHT,
    callResponseLane: 'call',
    notes: Object.freeze(['C3', 'G3', 'A#3']),
    motif: Object.freeze({
      id: 'bass_syncopated',
      steps: Object.freeze([1, 0, 1, 0, 1, 0, 0, 0]),
    }),
  }),
  Object.freeze({
    id: 'lead_drawsnake_group',
    role: BEAT_EVENT_ROLES.LEAD,
    size: 2,
    performers: 1,
    actionType: 'projectile',
    threatLevel: BEAT_EVENT_THREAT.FULL,
    callResponseLane: 'call',
    notes: Object.freeze(['C4', 'D#4', 'G4', 'A#4']),
    motif: Object.freeze({
      id: 'lead_lift',
      steps: Object.freeze([1, 0, 1, 0, 0, 1, 0, 1]),
    }),
  }),
  Object.freeze({
    id: 'accent_burst_group',
    role: BEAT_EVENT_ROLES.ACCENT,
    size: 2,
    performers: 1,
    actionType: 'explosion',
    threatLevel: BEAT_EVENT_THREAT.LIGHT,
    callResponseLane: 'response',
    notes: Object.freeze(['C4', 'F4', 'A#4']),
    motif: Object.freeze({
      id: 'accent_puncture',
      steps: Object.freeze([1, 0, 0, 1, 0, 0, 1, 0]),
    }),
  }),
  Object.freeze({
    id: 'response_group',
    role: BEAT_EVENT_ROLES.LEAD,
    size: 1,
    performers: 1,
    actionType: 'projectile',
    threatLevel: BEAT_EVENT_THREAT.LIGHT,
    callResponseLane: 'response',
    notes: Object.freeze(['D#4', 'F4', 'G4']),
    motif: Object.freeze({
      id: 'response_answer',
      steps: Object.freeze([0, 0, 1, 0, 0, 1, 0, 1]),
    }),
  }),
]);
const DIRECTOR_ENERGY_STATE_SEQUENCE = Object.freeze([
  Object.freeze({ state: 'intro', bars: 4 }),
  Object.freeze({ state: 'build', bars: 6 }),
  Object.freeze({ state: 'clash', bars: 8 }),
  Object.freeze({ state: 'break', bars: 4 }),
  Object.freeze({ state: 'build', bars: 6 }),
  Object.freeze({ state: 'clash', bars: 8 }),
  Object.freeze({ state: 'peak', bars: 4 }),
  Object.freeze({ state: 'break', bars: 4 }),
]);
const DIRECTOR_ENERGY_STATE_CONFIG = Object.freeze({
  intro: Object.freeze({
    budgets: Object.freeze({ maxFullThreatsPerBeat: 1, maxLightThreatsPerBeat: 3, maxAudibleAccentsPerBeat: 8, maxCosmeticPerBeat: 12 }),
    composer: Object.freeze({ drumLoops: 1, drawSnakes: 0, intensity: 0.56 }),
  }),
  build: Object.freeze({
    budgets: Object.freeze({ maxFullThreatsPerBeat: 2, maxLightThreatsPerBeat: 5, maxAudibleAccentsPerBeat: 8, maxCosmeticPerBeat: 14 }),
    composer: Object.freeze({ drumLoops: 1, drawSnakes: 1, intensity: 0.72 }),
  }),
  clash: Object.freeze({
    budgets: Object.freeze({ maxFullThreatsPerBeat: 3, maxLightThreatsPerBeat: 6, maxAudibleAccentsPerBeat: 9, maxCosmeticPerBeat: 16 }),
    composer: Object.freeze({ drumLoops: 2, drawSnakes: 1, intensity: 0.96 }),
  }),
  break: Object.freeze({
    budgets: Object.freeze({ maxFullThreatsPerBeat: 1, maxLightThreatsPerBeat: 4, maxAudibleAccentsPerBeat: 8, maxCosmeticPerBeat: 10 }),
    composer: Object.freeze({ drumLoops: 1, drawSnakes: 0, intensity: 0.48 }),
  }),
  peak: Object.freeze({
    budgets: Object.freeze({ maxFullThreatsPerBeat: 4, maxLightThreatsPerBeat: 7, maxAudibleAccentsPerBeat: 10, maxCosmeticPerBeat: 18 }),
    composer: Object.freeze({ drumLoops: 2, drawSnakes: 2, intensity: 1.12 }),
  }),
});
const DIRECTOR_ENERGY_STATE_ALIAS = Object.freeze({
  build_up: 'build',
  mini_break: 'break',
  boss_phase: 'peak',
  swarm_chaos: 'clash',
});
const DIRECTOR_STATE_THEME_CONFIG = Object.freeze({
  intro: Object.freeze({
    notePool: Object.freeze(['C4', 'D#4', 'G4']),
    spawnerRhythms: Object.freeze([
      Object.freeze([1, 0, 0, 0, 1, 0, 0, 0]),
      Object.freeze([1, 0, 1, 0, 1, 0, 0, 0]),
    ]),
    drawsnakePhrases: Object.freeze([
      Object.freeze({ steps: Object.freeze([1, 0, 0, 1, 0, 0, 1, 0]), rows: Object.freeze([0, 1, 2, 1, 0, 1, 2, 1]) }),
      Object.freeze({ steps: Object.freeze([1, 0, 1, 0, 0, 1, 0, 0]), rows: Object.freeze([0, 2, 1, 2, 0, 2, 1, 2]) }),
    ]),
    composerPhrases: Object.freeze([
      Object.freeze({ notes: Object.freeze(['C4', 'D#4', 'G4']), steps: Object.freeze([1, 0, 0, 1, 0, 0, 1, 0]), actionType: 'projectile' }),
      Object.freeze({ notes: Object.freeze(['C4', 'G4', 'D#4']), steps: Object.freeze([1, 0, 1, 0, 0, 1, 0, 0]), actionType: 'projectile' }),
    ]),
  }),
  build: Object.freeze({
    notePool: Object.freeze(['C4', 'D#4', 'F4', 'G4']),
    spawnerRhythms: Object.freeze([
      Object.freeze([1, 0, 1, 0, 1, 0, 1, 0]),
      Object.freeze([1, 0, 0, 1, 1, 0, 1, 0]),
    ]),
    drawsnakePhrases: Object.freeze([
      Object.freeze({ steps: Object.freeze([1, 0, 1, 0, 1, 0, 0, 1]), rows: Object.freeze([0, 1, 2, 3, 2, 1, 0, 1]) }),
      Object.freeze({ steps: Object.freeze([1, 1, 0, 1, 0, 0, 1, 0]), rows: Object.freeze([1, 2, 3, 2, 1, 0, 1, 2]) }),
    ]),
    composerPhrases: Object.freeze([
      Object.freeze({ notes: Object.freeze(['C4', 'F4', 'G4', 'D#4']), steps: Object.freeze([1, 0, 1, 0, 1, 0, 1, 0]), actionType: 'projectile' }),
      Object.freeze({ notes: Object.freeze(['D#4', 'F4', 'G4']), steps: Object.freeze([1, 0, 0, 1, 1, 0, 1, 0]), actionType: 'projectile' }),
    ]),
  }),
  clash: Object.freeze({
    notePool: Object.freeze(['C4', 'D#4', 'F4', 'G4', 'A#4']),
    spawnerRhythms: Object.freeze([
      Object.freeze([1, 1, 0, 1, 1, 0, 1, 0]),
      Object.freeze([1, 0, 1, 1, 0, 1, 1, 0]),
    ]),
    drawsnakePhrases: Object.freeze([
      Object.freeze({ steps: Object.freeze([1, 1, 0, 1, 0, 1, 1, 0]), rows: Object.freeze([0, 2, 3, 4, 3, 2, 1, 2]) }),
      Object.freeze({ steps: Object.freeze([1, 0, 1, 1, 0, 1, 0, 1]), rows: Object.freeze([1, 3, 4, 3, 2, 1, 0, 2]) }),
    ]),
    composerPhrases: Object.freeze([
      Object.freeze({ notes: Object.freeze(['C4', 'F4', 'A#4', 'G4']), steps: Object.freeze([1, 1, 0, 1, 0, 1, 1, 0]), actionType: 'projectile' }),
      Object.freeze({ notes: Object.freeze(['D#4', 'G4', 'A#4', 'F4']), steps: Object.freeze([1, 0, 1, 1, 0, 1, 0, 1]), actionType: 'explosion' }),
    ]),
  }),
  break: Object.freeze({
    notePool: Object.freeze(['C4', 'F4', 'A#4']),
    spawnerRhythms: Object.freeze([
      Object.freeze([1, 0, 0, 0, 1, 0, 0, 0]),
      Object.freeze([1, 0, 0, 1, 0, 0, 1, 0]),
    ]),
    drawsnakePhrases: Object.freeze([
      Object.freeze({ steps: Object.freeze([1, 0, 0, 1, 0, 0, 0, 1]), rows: Object.freeze([0, 1, 0, 2, 1, 0, 1, 2]) }),
      Object.freeze({ steps: Object.freeze([1, 0, 0, 0, 1, 0, 1, 0]), rows: Object.freeze([2, 1, 0, 1, 2, 1, 0, 1]) }),
    ]),
    composerPhrases: Object.freeze([
      Object.freeze({ notes: Object.freeze(['C4', 'A#4', 'F4']), steps: Object.freeze([1, 0, 0, 1, 0, 0, 0, 1]), actionType: 'projectile' }),
      Object.freeze({ notes: Object.freeze(['F4', 'C4', 'A#4']), steps: Object.freeze([1, 0, 0, 0, 1, 0, 1, 0]), actionType: 'projectile' }),
    ]),
  }),
  peak: Object.freeze({
    notePool: Object.freeze(['C4', 'D#4', 'F4', 'G4', 'A#4']),
    spawnerRhythms: Object.freeze([
      Object.freeze([1, 1, 1, 0, 1, 1, 0, 1]),
      Object.freeze([1, 0, 1, 1, 1, 0, 1, 1]),
    ]),
    drawsnakePhrases: Object.freeze([
      Object.freeze({ steps: Object.freeze([1, 1, 0, 1, 1, 0, 1, 1]), rows: Object.freeze([0, 2, 4, 3, 1, 2, 4, 3]) }),
      Object.freeze({ steps: Object.freeze([1, 0, 1, 1, 1, 1, 0, 1]), rows: Object.freeze([1, 3, 4, 2, 0, 2, 3, 4]) }),
    ]),
    composerPhrases: Object.freeze([
      Object.freeze({ notes: Object.freeze(['C4', 'D#4', 'F4', 'G4', 'A#4']), steps: Object.freeze([1, 1, 0, 1, 1, 0, 1, 1]), actionType: 'explosion' }),
      Object.freeze({ notes: Object.freeze(['A#4', 'G4', 'F4', 'D#4']), steps: Object.freeze([1, 0, 1, 1, 1, 1, 0, 1]), actionType: 'projectile' }),
    ]),
  }),
});
const DIRECTOR_CALL_RESPONSE_STATE_CONFIG = Object.freeze({
  intro: Object.freeze({ enabled: false, stepsPerPhrase: 4 }),
  build: Object.freeze({ enabled: true, stepsPerPhrase: 4 }),
  clash: Object.freeze({ enabled: true, stepsPerPhrase: 2 }),
  break: Object.freeze({ enabled: false, stepsPerPhrase: 4 }),
  peak: Object.freeze({ enabled: true, stepsPerPhrase: 2 }),
});
const DIRECTOR_CALL_RESPONSE_PACING_CONFIG = Object.freeze({
  intro_solo: Object.freeze({ enabled: false, stepsPerPhrase: 8 }),
  intro_bass: Object.freeze({ enabled: false, stepsPerPhrase: 8 }),
  intro_response: Object.freeze({ enabled: true, stepsPerPhrase: 4 }),
  main_low: Object.freeze({ enabled: true, stepsPerPhrase: 4 }),
  main_mid: Object.freeze({ enabled: true, stepsPerPhrase: 3 }),
  peak: Object.freeze({ enabled: true, stepsPerPhrase: 2 }),
  break: Object.freeze({ enabled: false, stepsPerPhrase: 6 }),
});
const PACING_ARRANGEMENT_INTENSITY_MULT = Object.freeze({
  intro_solo: 0.52,
  intro_bass: 0.66,
  intro_response: 0.78,
  main_low: 0.9,
  main_mid: 1,
  peak: 1.1,
  break: 0.72,
});
const ENERGY_GRAVITY_CONFIG = Object.freeze({
  smoothSeconds: 2.2,
  killWindowSeconds: 9,
  killsPerSecondTarget: 0.48,
  enemyPressureRadiusWorld: 520,
  projectilePressureRadiusWorld: 460,
  transitionDownThreshold: -0.55,
  transitionUpThreshold: 0.55,
  nudgeThreshold: 0.35,
});
const COMPOSER_MOTIF_EPOCH_BARS = 24;
const COMPOSER_MOTIF_LOCK_BARS = 8;
const DRAW_SNAKE_NODE_PULSE_SECONDS = 0.22;
const DRAW_SNAKE_NODE_PULSE_SCALE = 0.52;
const composerRuntime = {
  enabled: COMPOSER_ENABLED,
  lastSectionKey: '',
  currentSectionId: '',
  currentCycle: 0,
  currentDirective: { drumLoops: SPAWNER_ENEMY_TARGET_COUNT, drawSnakes: DRAW_SNAKE_ENEMY_TARGET_COUNT, intensity: 1 },
  motifEpochIndex: 0,
  motifEpochStartBar: 0,
  motifCache: new Map(),
};
const callResponseRuntime = {
  lastCallStepAbs: -1,
  lastCallGroupId: 0,
  lastCallNote: '',
  lastResponseStepAbs: -1,
  lastResponseGroupId: 0,
};
const energyStateRuntime = {
  sequenceIndex: 0,
  stateStartBar: 0,
  state: 'intro',
  cycle: 0,
  lastAppliedBar: -1,
};
const energyGravityRuntime = {
  pressure: 0,
  success: 0,
  gravity: 0,
  desired: 0,
  recentKillTimes: [],
};
const composerEnemyGroups = [];
let composerEnemyGroupIdSeq = 1;
const singletonEnemyMusicGroups = new Map();
let singletonEnemyMusicGroupIdSeq = 1;
const LOOPGRID_FALLBACK_NOTE_PALETTE = Object.freeze(buildPalette(48, Array.from({ length: 12 }, (_, i) => i), 3));
const SPAWNER_ENEMY_GRID_STEP_TO_CELL = Object.freeze([
  Object.freeze({ c: 0, r: 0 }), // 1
  Object.freeze({ c: 1, r: 0 }), // 2
  Object.freeze({ c: 2, r: 0 }), // 3
  Object.freeze({ c: 2, r: 1 }), // 4
  Object.freeze({ c: 2, r: 2 }), // 5
  Object.freeze({ c: 1, r: 2 }), // 6
  Object.freeze({ c: 0, r: 2 }), // 7
  Object.freeze({ c: 0, r: 1 }), // 8
]);
const BEAM_SOURCE_DEATH_GRACE_SECONDS = 0.5;
const ENEMY_DEATH_POP_FALLBACK_SECONDS = 0.65;
const ENEMY_HEALTH_RAMP_PER_SECOND = 0.1;
const PICKUP_COLLECT_RADIUS_PX = 46;
const PROJECTILE_SPEED = 1100;
const PROJECTILE_HIT_RADIUS_PX = 24;
const PROJECTILE_LIFETIME = 1.9;
const PROJECTILE_SPLIT_ANGLE_RAD = Math.PI / 7.2; // 25 deg
const PROJECTILE_BOOMERANG_RADIUS_WORLD = 480;
const PROJECTILE_BOOMERANG_LOOP_SECONDS = 1.15;
const PROJECTILE_BOOMERANG_SPIN_MULT = 2.4;
const PROJECTILE_HOMING_ACQUIRE_RANGE_WORLD = 920;
const PROJECTILE_HOMING_SPEED = 900;
const PROJECTILE_HOMING_TURN_RATE = 5.8;
const PROJECTILE_HOMING_ORBIT_RADIUS_WORLD = 170;
const PROJECTILE_HOMING_ORBIT_ANG_VEL = 2.4;
const PROJECTILE_HOMING_ORBIT_CHASE_SPEED = 420;
const PROJECTILE_HOMING_ORBIT_TURN_RATE = 4.2;
const PROJECTILE_HOMING_MAX_ORBITING = 8;
const PROJECTILE_HOMING_RETURN_SNAP_DIST_WORLD = 34;
const PROJECTILE_DESPAWN_OFFSCREEN_PAD_PX = 72;
const PROJECTILE_COLLISION_GRACE_SECONDS = 0.06;
const PROJECTILE_CHAIN_SPAWN_OFFSET_WORLD = 26;
const HELPER_LIFETIME_BEATS = 8;
const HELPER_ORBIT_RADIUS_WORLD = 150;
const HELPER_ORBIT_ANG_VEL = 1.9;
const HELPER_IMPACT_RADIUS_PX = 24;
const HELPER_IMPACT_DAMAGE = 1.25;
const HELPER_TURRET_SPAWN_OFFSET_WORLD = 78;
const LASER_TTL = 0.12;
const EXPLOSION_TTL = 0.22;
const EXPLOSION_RADIUS_WORLD = 220;
const EXPLOSION_PRIME_MAX_SCALE = 0.5;
const BEAM_DAMAGE_PER_SECOND = 3.2;
const PREVIEW_PROJECTILE_SPEED = 360;
const PREVIEW_PROJECTILE_LIFETIME = 2.1;
const PREVIEW_PROJECTILE_HIT_RADIUS = 14;
const PREVIEW_PROJECTILE_SPLIT_ANGLE_RAD = Math.PI / 7.2; // 25 deg
const PREVIEW_PROJECTILE_BOOMERANG_RADIUS = 63;
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
const PREVIEW_PROJECTILE_CHAIN_SPAWN_OFFSET = 20;
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
const SWARM_SOUND_EVENTS = Object.freeze({
  hitscan: Object.freeze({ instrumentDisplay: 'Laser', note: 'C4' }),
  projectile: Object.freeze({ instrumentDisplay: 'Tone (Sine)', note: 'C4' }),
  boomerang: Object.freeze({ instrumentDisplay: 'Tone (Sine)', note: 'G3' }),
  beam: Object.freeze({ instrumentDisplay: 'Laser', note: 'C3' }),
  explosion: Object.freeze({ instrumentDisplay: 'Retro Explosion Subtle', note: 'C4' }),
  enemyDeathSmall: Object.freeze({ instrumentDisplay: 'Arcade Blip', note: 'C5', volumeMult: 0.82, arpStepSec: 0.012, arpMaxNotes: 3, pitchDropSemitones: 2 }),
  enemyDeathMedium: Object.freeze({ instrumentDisplay: 'Gaming Bling', note: 'C4', volumeMult: 0.9, arpStepSec: 0.022, arpMaxNotes: 4, pitchDropSemitones: 4 }),
  enemyDeathLarge: Object.freeze({ instrumentDisplay: 'Bass Tone 4', note: 'C3', volumeMult: 1, arpStepSec: 0.032, arpMaxNotes: 5, pitchDropSemitones: 7 }),
  // Legacy key kept for compatibility with older runtime/debug calls.
  enemyDeath: Object.freeze({ instrumentDisplay: 'Gaming Bling', note: 'C4', volumeMult: 0.9, arpStepSec: 0.022, arpMaxNotes: 4, pitchDropSemitones: 4 }),
});
const SWARM_ENEMY_DEATH_EVENT_KEY_BY_FAMILY = Object.freeze({
  small: 'enemyDeathSmall',
  medium: 'enemyDeathMedium',
  large: 'enemyDeathLarge',
});
const SWARM_PENTATONIC_NOTES_ONE_OCTAVE = Object.freeze(['C4', 'D#4', 'F4', 'G4', 'A#4']);
const PLAYER_WEAPON_SOUND_EVENT_KEYS = Object.freeze({
  projectile: 'projectile',
  boomerang: 'boomerang',
  hitscan: 'hitscan',
  beam: 'beam',
  explosion: 'explosion',
});
const SWARM_DEFAULT_ROLE_BY_ENEMY_TYPE = Object.freeze({
  dumb: BEAT_EVENT_ROLES.ACCENT,
  spawner: BEAT_EVENT_ROLES.BASS,
  drawsnake: BEAT_EVENT_ROLES.LEAD,
  'composer-group-member': BEAT_EVENT_ROLES.LEAD,
});

function normalizeSwarmRole(roleName, fallback = BEAT_EVENT_ROLES.ACCENT) {
  const s = String(roleName || '').trim().toLowerCase();
  if (s === 'bass' || s === 'drum' || s === 'loop' || s === 'groove') return BEAT_EVENT_ROLES.BASS;
  if (s === 'lead' || s === 'phrase') return BEAT_EVENT_ROLES.LEAD;
  if (s === 'accent') return BEAT_EVENT_ROLES.ACCENT;
  if (s === 'motion' || s === 'cosmetic') return BEAT_EVENT_ROLES.MOTION;
  return normalizeSwarmRole(fallback, BEAT_EVENT_ROLES.ACCENT);
}

function getSwarmRoleForEnemy(enemyLike, fallback = BEAT_EVENT_ROLES.ACCENT) {
  const enemy = enemyLike && typeof enemyLike === 'object' ? enemyLike : {};
  const enemyType = String(enemy?.enemyType || '').trim().toLowerCase();
  const explicit = normalizeSwarmRole(enemy?.musicalRole || enemy?.composerRole || enemy?.role || '', '');
  if (explicit) return explicit;
  const mapped = SWARM_DEFAULT_ROLE_BY_ENEMY_TYPE[enemyType];
  if (mapped) return mapped;
  return normalizeSwarmRole(fallback, BEAT_EVENT_ROLES.ACCENT);
}

function getDefaultActionTypeForEnemyGroup(enemyType = '') {
  const t = String(enemyType || '').trim().toLowerCase();
  if (t === 'spawner') return 'spawner-spawn';
  if (t === 'drawsnake') return 'drawsnake-projectile';
  if (t === 'composer-group-member') return 'composer-group-projectile';
  return 'enemy-accent';
}

function normalizeMusicLifecycleState(value, fallback = 'active') {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'active') return 'active';
  if (raw === 'retiring') return 'retiring';
  if (raw === 'inactiveforscheduling' || raw === 'inactive_for_scheduling' || raw === 'inactive-for-scheduling') return 'inactiveForScheduling';
  return String(fallback || 'active').trim().toLowerCase() === 'retiring'
    ? 'retiring'
    : (String(fallback || 'active').trim().toLowerCase().includes('inactive') ? 'inactiveForScheduling' : 'active');
}

function isLifecycleSchedulable(stateLike) {
  const s = normalizeMusicLifecycleState(stateLike, 'active');
  return s === 'active';
}

function getLifecycleAggressionScale(stateLike) {
  const s = normalizeMusicLifecycleState(stateLike, 'active');
  if (s === 'retiring') return 0.42;
  if (s === 'inactiveForScheduling') return 0.74;
  return 1;
}

function getEnemyAggressionScale(enemyLike, fallbackState = 'active') {
  const state = normalizeMusicLifecycleState(enemyLike?.lifecycleState || fallbackState || 'active', 'active');
  return getLifecycleAggressionScale(state);
}

function getPlayerWeaponSoundEventKeyForStage(archetype = '', variant = '') {
  const a = String(archetype || '').trim().toLowerCase();
  const v = String(variant || '').trim().toLowerCase();
  if (a === 'projectile') {
    if (v === 'boomerang') return PLAYER_WEAPON_SOUND_EVENT_KEYS.boomerang;
    return PLAYER_WEAPON_SOUND_EVENT_KEYS.projectile;
  }
  if (a === 'laser') {
    if (v === 'beam') return PLAYER_WEAPON_SOUND_EVENT_KEYS.beam;
    return PLAYER_WEAPON_SOUND_EVENT_KEYS.hitscan;
  }
  if (a === 'aoe') return PLAYER_WEAPON_SOUND_EVENT_KEYS.explosion;
  return '';
}

function ensureSingletonMusicGroupForEnemy(enemyLike, options = null) {
  const enemy = enemyLike && typeof enemyLike === 'object' ? enemyLike : null;
  const enemyId = Math.trunc(Number(enemy?.id) || 0);
  if (!(enemyId > 0)) return null;
  const role = normalizeSwarmRole(options?.role || getSwarmRoleForEnemy(enemy, BEAT_EVENT_ROLES.ACCENT), BEAT_EVENT_ROLES.ACCENT);
  const actionType = String(options?.actionType || getDefaultActionTypeForEnemyGroup(enemy?.enemyType)).trim().toLowerCase();
  const note = normalizeSwarmNoteName(options?.note) || '';
  const instrumentId = resolveInstrumentIdOrFallback(options?.instrumentId, resolveSwarmSoundInstrumentId('projectile') || 'tone');
  const lifecycleState = normalizeMusicLifecycleState(
    options?.lifecycleState || enemy?.lifecycleState || 'active',
    'active'
  );
  const steps = Array.isArray(options?.steps) ? options.steps.map((v) => !!v) : null;
  const rows = Array.isArray(options?.rows) ? options.rows.map((v) => Math.max(0, Math.trunc(Number(v) || 0))) : null;
  let group = singletonEnemyMusicGroups.get(enemyId) || null;
  if (!group) {
    group = {
      id: singletonEnemyMusicGroupIdSeq++,
      type: 'singleton',
      enemyType: String(enemy?.enemyType || '').trim().toLowerCase(),
      memberIds: new Set([enemyId]),
      role,
      actionType,
      note,
      instrumentId,
      steps: steps || null,
      rows: rows || null,
      active: true,
      lifecycleState,
      size: 1,
      performers: 1,
    };
    singletonEnemyMusicGroups.set(enemyId, group);
  } else {
    group.enemyType = String(enemy?.enemyType || group.enemyType || '').trim().toLowerCase();
    group.role = role;
    group.actionType = actionType;
    if (note) group.note = note;
    if (instrumentId) group.instrumentId = instrumentId;
    if (steps) group.steps = steps;
    if (rows) group.rows = rows;
    group.memberIds = new Set([enemyId]);
    group.active = true;
    group.lifecycleState = lifecycleState;
    group.size = 1;
    group.performers = 1;
  }
  enemy.musicGroupId = Math.trunc(Number(group.id) || 0);
  enemy.musicGroupType = 'singleton';
  return group;
}

function syncSingletonEnemyStateFromMusicGroup(enemyLike, groupLike = null) {
  const enemy = enemyLike && typeof enemyLike === 'object' ? enemyLike : null;
  const group = groupLike && typeof groupLike === 'object' ? groupLike : null;
  if (!enemy || !group) return;
  const enemyType = String(enemy?.enemyType || '').trim().toLowerCase();
  if (enemyType === 'spawner') {
    if (Array.isArray(group.steps)) enemy.spawnerSteps = group.steps.slice(0, 8);
    if (group.note) enemy.spawnerNoteName = String(group.note);
    if (group.instrumentId) enemy.spawnerInstrument = String(group.instrumentId);
    return;
  }
  if (enemyType === 'drawsnake') {
    if (Array.isArray(group.steps)) enemy.drawsnakeSteps = group.steps.slice(0, WEAPON_TUNE_STEPS);
    if (Array.isArray(group.rows)) enemy.drawsnakeRows = group.rows.slice(0, WEAPON_TUNE_STEPS);
    if (group.instrumentId) enemy.drawsnakeInstrument = String(group.instrumentId);
    return;
  }
  if (enemyType === 'dumb') {
    if (group.note) enemy.soundNote = normalizeSwarmNoteName(group.note) || enemy.soundNote;
  }
}

function getEnemyMusicGroup(enemyLike, fallbackActionType = '') {
  const enemy = enemyLike && typeof enemyLike === 'object' ? enemyLike : null;
  const enemyId = Math.trunc(Number(enemy?.id) || 0);
  if (!(enemyId > 0)) return null;
  const enemyType = String(enemy?.enemyType || '').trim().toLowerCase();
  if (enemyType === 'composer-group-member') {
    const groupId = Math.trunc(Number(enemy?.composerGroupId) || 0);
    if (groupId > 0) {
      const group = composerEnemyGroups.find((g) => Math.trunc(Number(g?.id) || 0) === groupId) || null;
      if (group) return group;
    }
    return null;
  }
  const existing = singletonEnemyMusicGroups.get(enemyId) || null;
  if (existing) {
    syncSingletonEnemyStateFromMusicGroup(enemy, existing);
    return existing;
  }
  const created = ensureSingletonMusicGroupForEnemy(enemy, {
    actionType: String(fallbackActionType || getDefaultActionTypeForEnemyGroup(enemyType)).trim().toLowerCase(),
  });
  syncSingletonEnemyStateFromMusicGroup(enemy, created);
  return created;
}

function removeSingletonMusicGroupForEnemy(enemyId) {
  const id = Math.trunc(Number(enemyId) || 0);
  if (!(id > 0)) return;
  singletonEnemyMusicGroups.delete(id);
}

function getAllActiveMusicGroups() {
  const out = [];
  for (const g of singletonEnemyMusicGroups.values()) {
    if (!g || g.active === false) continue;
    if (!isLifecycleSchedulable(g?.lifecycleState || 'active')) continue;
    out.push(g);
  }
  for (const g of composerEnemyGroups) {
    if (!g || g.active === false) continue;
    if (!isLifecycleSchedulable(g?.lifecycleState || 'active')) continue;
    out.push(g);
  }
  return out;
}

function pickRandomArrayItem(items, fallback = null) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return fallback;
  const idx = Math.max(0, Math.min(list.length - 1, Math.trunc(Math.random() * list.length)));
  return list[idx];
}

function getCurrentSwarmEnergyStateName() {
  const ds = ensureSwarmDirector().getSnapshot();
  return String(ds?.energyState || energyStateRuntime.state || 'intro').trim().toLowerCase() || 'intro';
}

function getEnergyStateThemePreset(stateName = '') {
  const key = String(stateName || getCurrentSwarmEnergyStateName()).trim().toLowerCase();
  return DIRECTOR_STATE_THEME_CONFIG[key] || DIRECTOR_STATE_THEME_CONFIG.intro;
}

function getCurrentPacingStateName() {
  const pace = swarmPacingRuntime?.getSnapshot?.() || null;
  return String(pace?.state || 'intro_solo').trim().toLowerCase() || 'intro_solo';
}

function createStepPattern(pattern, length = WEAPON_TUNE_STEPS) {
  const len = Math.max(1, Math.trunc(Number(length) || WEAPON_TUNE_STEPS));
  const src = Array.isArray(pattern) ? pattern : [];
  return Array.from({ length: len }, (_, i) => !!src[i]);
}

function createRowPattern(pattern, length = WEAPON_TUNE_STEPS, rowLimit = SWARM_PENTATONIC_NOTES_ONE_OCTAVE.length) {
  const len = Math.max(1, Math.trunc(Number(length) || WEAPON_TUNE_STEPS));
  const maxRow = Math.max(1, Math.trunc(Number(rowLimit) || SWARM_PENTATONIC_NOTES_ONE_OCTAVE.length));
  const src = Array.isArray(pattern) ? pattern : [];
  return Array.from({ length: len }, (_, i) => {
    const raw = Math.trunc(Number(src[i]));
    if (!Number.isFinite(raw)) return Math.max(0, Math.min(maxRow - 1, i % maxRow));
    return Math.max(0, Math.min(maxRow - 1, raw));
  });
}

function updateComposerMotifEpochForBeat(beatIndex = currentBeatIndex) {
  const bar = Math.max(0, Math.floor(Math.max(0, Math.trunc(Number(beatIndex) || 0)) / Math.max(1, COMPOSER_BEATS_PER_BAR)));
  const epochBars = Math.max(4, Math.trunc(Number(COMPOSER_MOTIF_EPOCH_BARS) || 24));
  if (!(composerRuntime.motifEpochStartBar >= 0)) {
    composerRuntime.motifEpochStartBar = bar;
    composerRuntime.motifEpochIndex = 0;
    return;
  }
  let advanced = false;
  while (bar >= (composerRuntime.motifEpochStartBar + epochBars)) {
    composerRuntime.motifEpochStartBar += epochBars;
    composerRuntime.motifEpochIndex = Math.max(0, Math.trunc(Number(composerRuntime.motifEpochIndex) || 0)) + 1;
    advanced = true;
  }
  if (!advanced) return;
  // Keep current + previous epoch motifs so recurring sections stay recognizable without unbounded cache growth.
  const keepMinEpoch = Math.max(0, Math.trunc(Number(composerRuntime.motifEpochIndex) || 0) - 1);
  for (const key of Array.from(composerRuntime.motifCache.keys())) {
    const m = /:epoch-(\d+):/i.exec(String(key || ''));
    if (!m) continue;
    const epochNum = Math.max(0, Math.trunc(Number(m[1]) || 0));
    if (epochNum >= keepMinEpoch) continue;
    composerRuntime.motifCache.delete(key);
  }
}

function getComposerMotifScopeKey() {
  const sectionId = String(composerRuntime.currentSectionId || 'default').trim().toLowerCase() || 'default';
  const epoch = Math.max(0, Math.trunc(Number(composerRuntime.motifEpochIndex) || 0));
  const lockBars = Math.max(1, Math.trunc(Number(COMPOSER_MOTIF_LOCK_BARS) || 8));
  const bar = Math.max(0, Math.floor(Math.max(0, Math.trunc(Number(currentBeatIndex) || 0)) / Math.max(1, COMPOSER_BEATS_PER_BAR)));
  const lockIndex = Math.floor(bar / lockBars);
  return `section-${sectionId}:epoch-${epoch}:lock-${lockIndex}`;
}

function getNotePoolIndex(noteName) {
  const note = normalizeSwarmNoteName(noteName);
  if (!note) return -1;
  const pool = ensureSwarmDirector().getNotePool();
  if (!Array.isArray(pool) || !pool.length) return -1;
  return pool.findIndex((n) => normalizeSwarmNoteName(n) === note);
}

function getPhraseStepState(stepAbs = 0, phraseSteps = 4) {
  const steps = Math.max(2, Math.trunc(Number(phraseSteps) || 4));
  const abs = Math.max(0, Math.trunc(Number(stepAbs) || 0));
  const stepInPhrase = ((abs % steps) + steps) % steps;
  const stepsToEnd = Math.max(0, (steps - 1) - stepInPhrase);
  const nearPhraseEnd = stepsToEnd <= Math.max(1, Math.floor(steps * 0.25));
  const resolutionOpportunity = stepsToEnd === 0;
  return {
    phraseSteps: steps,
    stepInPhrase,
    stepsToEnd,
    nearPhraseEnd,
    resolutionOpportunity,
  };
}

function normalizePhraseGravityNoteList(values) {
  if (!Array.isArray(values) || !values.length) return [];
  const out = [];
  const seen = new Set();
  for (const value of values) {
    const note = normalizeSwarmNoteName(value);
    if (!note || seen.has(note)) continue;
    seen.add(note);
    out.push(note);
  }
  return out;
}

function pickClosestPhraseGravityTarget(noteName, targets) {
  const note = normalizeSwarmNoteName(noteName);
  const candidateNotes = normalizePhraseGravityNoteList(targets);
  if (!candidateNotes.length) return '';
  const noteIdx = getNotePoolIndex(note);
  if (noteIdx < 0) return candidateNotes[0];
  let picked = candidateNotes[0];
  let best = Number.POSITIVE_INFINITY;
  for (const candidate of candidateNotes) {
    const idx = getNotePoolIndex(candidate);
    if (idx < 0) continue;
    const dist = Math.abs(idx - noteIdx);
    if (dist < best) {
      best = dist;
      picked = candidate;
    }
  }
  return picked;
}

function getLockedMotifHook(scopeKey = '', fallbackLength = 4) {
  const scope = String(scopeKey || getComposerMotifScopeKey()).trim();
  const len = Math.max(3, Math.min(5, Math.trunc(Number(fallbackLength) || 4)));
  return getComposerMotif(scope, 'locked-hook', () => {
    const notes = Array.from({ length: len }, (_, i) => getSwarmPentatonicNoteByIndex(i));
    return { notes };
  }) || { notes: Array.from({ length: len }, (_, i) => getSwarmPentatonicNoteByIndex(i)) };
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function clamp11(value) {
  return Math.max(-1, Math.min(1, Number(value) || 0));
}

function getPaletteArrangementControls() {
  const snap = swarmPaletteRuntime?.getSnapshot?.() || null;
  const a = snap?.arrangement && typeof snap.arrangement === 'object' ? snap.arrangement : {};
  return {
    brightness: clamp01(a.brightness == null ? 0.5 : a.brightness),
    filter: clamp01(a.filter == null ? 0.45 : a.filter),
    density: clamp01(a.density == null ? 0.5 : a.density),
    octaveEmphasis: clamp01(a.octaveEmphasis == null ? 0.5 : a.octaveEmphasis),
    accentStrength: clamp01(a.accentStrength == null ? 0.5 : a.accentStrength),
  };
}

function applyStepPatternDensity(stepsLike, density01 = 0.5, options = null) {
  const steps = Array.from(Array.isArray(stepsLike) ? stepsLike : [], (v) => !!v);
  if (!steps.length) return steps;
  const len = steps.length;
  const minHits = Math.max(1, Math.min(len, Math.trunc(Number(options?.minHits) || 1)));
  const maxHits = Math.max(minHits, Math.min(len, Math.trunc(Number(options?.maxHits) || len)));
  const d = clamp01(density01);
  const targetHits = Math.max(minHits, Math.min(maxHits, Math.round(minHits + ((maxHits - minHits) * d))));
  const activeIdx = [];
  for (let i = 0; i < len; i++) if (steps[i]) activeIdx.push(i);
  while (activeIdx.length > targetHits) {
    const removeAt = Math.max(0, Math.min(activeIdx.length - 1, Math.trunc(Math.random() * activeIdx.length)));
    const idx = activeIdx.splice(removeAt, 1)[0];
    if (Number.isFinite(idx)) steps[idx] = false;
  }
  if (activeIdx.length < targetHits) {
    const priority = [0, 4, 2, 6, 1, 3, 5, 7];
    for (const p of priority) {
      if (activeIdx.length >= targetHits) break;
      const idx = p % len;
      if (steps[idx]) continue;
      steps[idx] = true;
      activeIdx.push(idx);
    }
  }
  if (activeIdx.length < targetHits) {
    for (let i = 0; i < len && activeIdx.length < targetHits; i++) {
      if (steps[i]) continue;
      steps[i] = true;
      activeIdx.push(i);
    }
  }
  if (!steps.some(Boolean)) steps[0] = true;
  return steps;
}

function getEnergyStateLevel(stateName = '') {
  const raw = String(stateName || '').trim().toLowerCase();
  const s = String(DIRECTOR_ENERGY_STATE_ALIAS[raw] || raw);
  if (s === 'peak') return 4;
  if (s === 'clash') return 3;
  if (s === 'build') return 2;
  if (s === 'break') return 1;
  return 0;
}

function resetEnergyGravityRuntime() {
  energyGravityRuntime.pressure = 0;
  energyGravityRuntime.success = 0;
  energyGravityRuntime.gravity = 0;
  energyGravityRuntime.desired = 0;
  if (Array.isArray(energyGravityRuntime.recentKillTimes)) {
    energyGravityRuntime.recentKillTimes.length = 0;
  } else {
    energyGravityRuntime.recentKillTimes = [];
  }
}

function noteEnergyGravityKill(nowSec = (performance.now() || 0) * 0.001) {
  const t = Math.max(0, Number(nowSec) || 0);
  if (!Array.isArray(energyGravityRuntime.recentKillTimes)) {
    energyGravityRuntime.recentKillTimes = [];
  }
  energyGravityRuntime.recentKillTimes.push(t);
  const cutoff = t - Math.max(2, Number(ENERGY_GRAVITY_CONFIG.killWindowSeconds) || 9);
  while (energyGravityRuntime.recentKillTimes.length && energyGravityRuntime.recentKillTimes[0] < cutoff) {
    energyGravityRuntime.recentKillTimes.shift();
  }
}

function getEnergyGravityMetrics() {
  return {
    pressure: clamp01(energyGravityRuntime.pressure),
    success: clamp01(energyGravityRuntime.success),
    gravity: clamp11(energyGravityRuntime.gravity),
    desired: clamp11(energyGravityRuntime.desired),
  };
}

function updateEnergyGravityRuntime(dt = 0, centerWorld = null, scale = 1) {
  if (!active || gameplayPaused) return;
  const delta = Math.max(0.001, Math.min(0.1, Number(dt) || 0.016));
  const cx = Number(centerWorld?.x) || 0;
  const cy = Number(centerWorld?.y) || 0;
  const nowSec = (performance.now() || 0) * 0.001;
  const enemyRadiusWorld = Math.max(140, Number(ENERGY_GRAVITY_CONFIG.enemyPressureRadiusWorld) || 520) / Math.max(0.001, Number(scale) || 1);
  const projectileRadiusWorld = Math.max(120, Number(ENERGY_GRAVITY_CONFIG.projectilePressureRadiusWorld) || 460) / Math.max(0.001, Number(scale) || 1);
  const enemyR2 = enemyRadiusWorld * enemyRadiusWorld;
  const projectileR2 = projectileRadiusWorld * projectileRadiusWorld;

  let enemyThreatSum = 0;
  for (const enemy of enemies) {
    if (!enemy) continue;
    const dx = (Number(enemy.wx) || 0) - cx;
    const dy = (Number(enemy.wy) || 0) - cy;
    const d2 = (dx * dx) + (dy * dy);
    if (d2 > enemyR2) continue;
    const enemyType = String(enemy?.enemyType || '').trim().toLowerCase();
    const typeWeight = enemyType === 'spawner'
      ? 1.35
      : (enemyType === 'drawsnake' ? 1.15 : (enemyType === 'composer-group-member' ? 1.05 : 0.75));
    const distWeight = 1 - Math.min(1, d2 / Math.max(1, enemyR2));
    enemyThreatSum += typeWeight * (0.35 + (0.65 * distWeight));
  }
  const enemyPressure = clamp01(enemyThreatSum / 8.5);

  let projectileThreat = 0;
  for (const projectile of projectiles) {
    if (!projectile || projectile?.hostileToEnemies !== false) continue;
    const dx = (Number(projectile.wx) || 0) - cx;
    const dy = (Number(projectile.wy) || 0) - cy;
    const d2 = (dx * dx) + (dy * dy);
    if (d2 > projectileR2) continue;
    const distWeight = 1 - Math.min(1, d2 / Math.max(1, projectileR2));
    projectileThreat += 0.45 + (0.75 * distWeight);
  }
  const projectilePressure = clamp01(projectileThreat / 9);
  const pressureRaw = clamp01((enemyPressure * 0.65) + (projectilePressure * 0.35));

  const cutoff = nowSec - Math.max(2, Number(ENERGY_GRAVITY_CONFIG.killWindowSeconds) || 9);
  if (!Array.isArray(energyGravityRuntime.recentKillTimes)) {
    energyGravityRuntime.recentKillTimes = [];
  }
  while (energyGravityRuntime.recentKillTimes.length && energyGravityRuntime.recentKillTimes[0] < cutoff) {
    energyGravityRuntime.recentKillTimes.shift();
  }
  const killRate = energyGravityRuntime.recentKillTimes.length / Math.max(2, Number(ENERGY_GRAVITY_CONFIG.killWindowSeconds) || 9);
  const killRateNorm = clamp01(killRate / Math.max(0.05, Number(ENERGY_GRAVITY_CONFIG.killsPerSecondTarget) || 0.48));
  const expectedActive = Math.max(1, Math.trunc(Number(ENEMY_TARGET_ACTIVE_COUNT) || 1));
  const activeLoad = clamp01(enemies.length / Math.max(1, expectedActive));
  const clearHeadroom = 1 - activeLoad;
  const successRaw = clamp01((killRateNorm * 0.58) + (clearHeadroom * 0.42));
  const desired = clamp11(successRaw - pressureRaw);

  const smoothSeconds = Math.max(0.2, Number(ENERGY_GRAVITY_CONFIG.smoothSeconds) || 2.2);
  const alpha = clamp01(delta / smoothSeconds);
  energyGravityRuntime.pressure += (pressureRaw - energyGravityRuntime.pressure) * alpha;
  energyGravityRuntime.success += (successRaw - energyGravityRuntime.success) * alpha;
  energyGravityRuntime.desired += (desired - energyGravityRuntime.desired) * alpha;
  energyGravityRuntime.gravity += (energyGravityRuntime.desired - energyGravityRuntime.gravity) * alpha;
}

function getCallResponseConfigForState(stateName = '') {
  const key = String(stateName || getCurrentPacingStateName()).trim().toLowerCase();
  if (DIRECTOR_CALL_RESPONSE_PACING_CONFIG[key]) return DIRECTOR_CALL_RESPONSE_PACING_CONFIG[key];
  const energyFallback = String(getCurrentSwarmEnergyStateName()).trim().toLowerCase();
  return DIRECTOR_CALL_RESPONSE_STATE_CONFIG[energyFallback] || DIRECTOR_CALL_RESPONSE_STATE_CONFIG.intro;
}

function isCallResponseLaneActive(lane = 'call', stepAbs = 0, participantCount = 0) {
  const cfg = getCallResponseConfigForState();
  const arrangement = getPaletteArrangementControls();
  if (!cfg?.enabled) return true;
  if (Math.max(0, Math.trunc(Number(participantCount) || 0)) < 2) return true;
  const basePhraseSteps = Math.max(1, Math.trunc(Number(cfg?.stepsPerPhrase) || 4));
  const phraseScale = 1.28 - (arrangement.accentStrength * 0.7);
  const phraseSteps = Math.max(1, Math.trunc(Math.round(basePhraseSteps * phraseScale)));
  const phraseIdx = Math.max(0, Math.floor(Math.max(0, Math.trunc(Number(stepAbs) || 0)) / phraseSteps));
  if (arrangement.density > 0.72 && (phraseIdx % 4) === 3) return true;
  const callTurn = (phraseIdx % 2) === 0;
  const normalizedLane = normalizeCallResponseLane(lane, 'call');
  return normalizedLane === 'call' ? callTurn : !callTurn;
}

function getCallResponseWindowSteps() {
  const cfg = getCallResponseConfigForState();
  const base = Math.max(1, Math.trunc(Number(cfg?.stepsPerPhrase) || 4));
  const arrangement = getPaletteArrangementControls();
  return Math.max(1, Math.trunc(Math.round(base * (0.8 + (arrangement.accentStrength * 0.4)))));
}

function ensureSwarmDirector() {
  if (swarmDirector) return swarmDirector;
  const introTheme = getEnergyStateThemePreset('intro');
  swarmDirector = createSwarmDirector({
    beatsPerBar: COMPOSER_BEATS_PER_BAR,
    stepsPerBar: WEAPON_TUNE_STEPS,
    energyState: 'intro',
    notePool: Array.isArray(introTheme?.notePool) ? introTheme.notePool : SWARM_PENTATONIC_NOTES_ONE_OCTAVE,
    budgets: DIRECTOR_ENERGY_STATE_CONFIG.intro?.budgets || {},
  });
  return swarmDirector;
}

function resetSwarmDirector(beatIndex = 0) {
  const director = ensureSwarmDirector();
  const introTheme = getEnergyStateThemePreset('intro');
  director.reset();
  director.setEnergyState('intro');
  director.setNotePool(Array.isArray(introTheme?.notePool) ? introTheme.notePool : SWARM_PENTATONIC_NOTES_ONE_OCTAVE);
  director.setBudgets(DIRECTOR_ENERGY_STATE_CONFIG.intro?.budgets || {});
  director.syncToBeat(Math.max(0, Math.trunc(Number(beatIndex) || 0)));
  callResponseRuntime.lastCallStepAbs = -1;
  callResponseRuntime.lastCallGroupId = 0;
  callResponseRuntime.lastCallNote = '';
  callResponseRuntime.lastResponseStepAbs = -1;
  callResponseRuntime.lastResponseGroupId = 0;
  return director;
}

function reportSwarmThreatIntent(threatClass = 'full', amount = 1, beatIndex = currentBeatIndex, reason = '') {
  const director = ensureSwarmDirector();
  const res = director.noteThreatIntent(threatClass, amount, beatIndex);
  if (swarmDirectorDebug.logBeats) {
    try {
      console.log('[BeatSwarmDirector][threat]', {
        reason: String(reason || ''),
        threatClass: String(threatClass || 'full'),
        beatIndex: Math.max(0, Math.trunc(Number(beatIndex) || 0)),
        withinBudget: !!res?.withinBudget,
        usage: res?.state?.usage || null,
        budgets: res?.state?.budgets || null,
      });
    } catch {}
  }
  return res;
}

function tryConsumeSwarmThreatIntent(threatClass = 'full', amount = 1, beatIndex = currentBeatIndex, reason = '') {
  const director = ensureSwarmDirector();
  const can = director.canConsumeThreatIntent?.(threatClass, amount, beatIndex);
  if (can && !can.withinBudget) {
    if (swarmDirectorDebug.logBeats) {
      try {
        console.log('[BeatSwarmDirector][threat-blocked]', {
          reason: String(reason || ''),
          threatClass: String(threatClass || 'full'),
          beatIndex: Math.max(0, Math.trunc(Number(beatIndex) || 0)),
          amount: Math.max(1, Math.trunc(Number(amount) || 1)),
          remaining: can?.state?.remaining || null,
        });
      } catch {}
    }
    return can;
  }
  return reportSwarmThreatIntent(threatClass, amount, beatIndex, reason);
}

function getDirectorEnergyStateConfig(stateName = 'intro') {
  const raw = String(stateName || 'intro').trim().toLowerCase();
  const key = String(DIRECTOR_ENERGY_STATE_ALIAS[raw] || raw);
  return DIRECTOR_ENERGY_STATE_CONFIG[key] || DIRECTOR_ENERGY_STATE_CONFIG.intro;
}

function findNextEnergySequenceIndexByState(seq, startIdx, stateName) {
  if (!Array.isArray(seq) || !seq.length) return -1;
  const target = String(stateName || '').trim().toLowerCase();
  if (!target) return -1;
  const start = ((Math.trunc(Number(startIdx) || 0) % seq.length) + seq.length) % seq.length;
  for (let offset = 0; offset < seq.length; offset++) {
    const idx = (start + offset) % seq.length;
    const name = String(seq[idx]?.state || '').trim().toLowerCase();
    if (name === target) return idx;
  }
  return -1;
}

function findNextEnergySequenceIndexAtOrAboveLevel(seq, startIdx, minLevel = 0) {
  if (!Array.isArray(seq) || !seq.length) return -1;
  const targetLevel = Math.max(0, Math.trunc(Number(minLevel) || 0));
  const start = ((Math.trunc(Number(startIdx) || 0) % seq.length) + seq.length) % seq.length;
  for (let offset = 0; offset < seq.length; offset++) {
    const idx = (start + offset) % seq.length;
    const level = getEnergyStateLevel(seq[idx]?.state);
    if (level >= targetLevel) return idx;
  }
  return -1;
}

function pickEnergySequenceIndexWithGravity(seq, currentIdx, baseNextIdx) {
  const list = Array.isArray(seq) ? seq : [];
  if (!list.length) return Math.max(0, Math.trunc(Number(baseNextIdx) || 0));
  const cur = ((Math.trunc(Number(currentIdx) || 0) % list.length) + list.length) % list.length;
  const base = ((Math.trunc(Number(baseNextIdx) || 0) % list.length) + list.length) % list.length;
  const gravity = clamp11(energyGravityRuntime.gravity);
  const pressure = clamp01(energyGravityRuntime.pressure);
  const downThreshold = Number(ENERGY_GRAVITY_CONFIG.transitionDownThreshold) || -0.55;
  const upThreshold = Number(ENERGY_GRAVITY_CONFIG.transitionUpThreshold) || 0.55;
  const curLevel = getEnergyStateLevel(list[cur]?.state);
  const baseLevel = getEnergyStateLevel(list[base]?.state);
  const baseStateName = String(list[base]?.state || '').trim().toLowerCase();

  if (gravity <= downThreshold) {
    if (curLevel >= 3) {
      const breakIdx = findNextEnergySequenceIndexByState(list, base, 'break');
      if (breakIdx >= 0) return breakIdx;
    }
    if (curLevel >= 2 && baseLevel >= curLevel) return cur;
    if (String(list[cur]?.state || '').trim().toLowerCase() === 'break' && pressure >= 0.6) return cur;
    return base;
  }

  if (gravity >= upThreshold) {
    if (baseStateName === 'break') {
      const skipBreakIdx = findNextEnergySequenceIndexAtOrAboveLevel(list, (base + 1) % list.length, 2);
      if (skipBreakIdx >= 0) return skipBreakIdx;
    }
    if (curLevel <= 1) {
      const raiseToBuild = findNextEnergySequenceIndexAtOrAboveLevel(list, base, 2);
      if (raiseToBuild >= 0) return raiseToBuild;
    }
    if (curLevel === 2) {
      const raiseToClash = findNextEnergySequenceIndexAtOrAboveLevel(list, base, 3);
      if (raiseToClash >= 0) return raiseToClash;
    }
    return base;
  }

  return base;
}

function getEnergyGravityBudgetNudges() {
  const gravity = clamp11(energyGravityRuntime.gravity);
  const threshold = Math.max(0.05, Number(ENERGY_GRAVITY_CONFIG.nudgeThreshold) || 0.35);
  const fullDelta = gravity >= threshold ? 1 : (gravity <= -threshold ? -1 : 0);
  const lightDelta = gravity >= threshold ? 1 : (gravity <= -threshold ? -1 : 0);
  const accentDelta = gravity >= (threshold + 0.12) ? 1 : (gravity <= -(threshold + 0.12) ? -1 : 0);
  return { fullDelta, lightDelta, accentDelta };
}

function applyEnergyGravityToBudgets(baseBudgets) {
  const base = baseBudgets && typeof baseBudgets === 'object' ? baseBudgets : {};
  const nudge = getEnergyGravityBudgetNudges();
  return {
    maxFullThreatsPerBeat: Math.max(0, Math.trunc(Number(base.maxFullThreatsPerBeat) || 0) + nudge.fullDelta),
    maxLightThreatsPerBeat: Math.max(0, Math.trunc(Number(base.maxLightThreatsPerBeat) || 0) + nudge.lightDelta),
    maxAudibleAccentsPerBeat: Math.max(0, Math.trunc(Number(base.maxAudibleAccentsPerBeat) || 0) + nudge.accentDelta),
    maxCosmeticPerBeat: Math.max(0, Math.trunc(Number(base.maxCosmeticPerBeat) || 0) + nudge.lightDelta),
  };
}

function applyEnergyGravityToComposerValues(baseValues) {
  const base = baseValues && typeof baseValues === 'object' ? baseValues : {};
  const gravity = clamp11(energyGravityRuntime.gravity);
  const nudge = Math.abs(gravity) >= Math.max(0.05, Number(ENERGY_GRAVITY_CONFIG.nudgeThreshold) || 0.35)
    ? (gravity > 0 ? 1 : -1)
    : 0;
  const drumLoops = Math.max(0, Math.trunc(Number(base.drumLoops) || 0) + nudge);
  const drawSnakes = Math.max(0, Math.trunc(Number(base.drawSnakes) || 0) + (gravity > 0.45 ? 1 : (gravity < -0.45 ? -1 : 0)));
  const intensity = Math.max(0.1, (Number(base.intensity) || 1) + (gravity * 0.14));
  return { drumLoops, drawSnakes, intensity };
}

function resetEnergyStateRuntime(barIndex = 0) {
  energyStateRuntime.sequenceIndex = 0;
  energyStateRuntime.stateStartBar = Math.max(0, Math.trunc(Number(barIndex) || 0));
  energyStateRuntime.state = String(DIRECTOR_ENERGY_STATE_SEQUENCE[0]?.state || 'intro');
  energyStateRuntime.cycle = 0;
  energyStateRuntime.lastAppliedBar = -1;
}

function advanceEnergyStateRuntimeForBar(barIndex = 0) {
  const bar = Math.max(0, Math.trunc(Number(barIndex) || 0));
  const seq = DIRECTOR_ENERGY_STATE_SEQUENCE;
  if (!Array.isArray(seq) || !seq.length) return;
  while (true) {
    const currentIdx = Math.max(0, Math.min(seq.length - 1, Math.trunc(Number(energyStateRuntime.sequenceIndex) || 0)));
    const current = seq[currentIdx] || seq[0];
    const barsInState = Math.max(1, Math.trunc(Number(current?.bars) || 1));
    const startBar = Math.max(0, Math.trunc(Number(energyStateRuntime.stateStartBar) || 0));
    if (bar < (startBar + barsInState)) break;
    const baseNext = (currentIdx + 1) % seq.length;
    let nextIdx = pickEnergySequenceIndexWithGravity(seq, currentIdx, baseNext);
    if (!(nextIdx >= 0 && nextIdx < seq.length)) nextIdx = baseNext;
    if (nextIdx < currentIdx) {
      energyStateRuntime.cycle = Math.max(0, Math.trunc(Number(energyStateRuntime.cycle) || 0)) + 1;
    }
    energyStateRuntime.sequenceIndex = nextIdx;
    energyStateRuntime.stateStartBar = startBar + barsInState;
    energyStateRuntime.state = String(seq[nextIdx]?.state || 'intro');
  }
}

function applyEnergyStateForBar(barIndex = 0) {
  const bar = Math.max(0, Math.trunc(Number(barIndex) || 0));
  if (energyStateRuntime.lastAppliedBar === bar) return;
  if (!(energyStateRuntime.stateStartBar >= 0)) resetEnergyStateRuntime(bar);
  advanceEnergyStateRuntimeForBar(bar);
  const stateName = String(energyStateRuntime.state || 'intro');
  const cfg = getDirectorEnergyStateConfig(stateName);
  const theme = getEnergyStateThemePreset(stateName);
  const budgets = applyEnergyGravityToBudgets(cfg?.budgets || {});
  const director = ensureSwarmDirector();
  director.setEnergyState(stateName);
  director.setNotePool(Array.isArray(theme?.notePool) && theme.notePool.length ? theme.notePool : SWARM_PENTATONIC_NOTES_ONE_OCTAVE);
  director.setBudgets(budgets);
  energyStateRuntime.lastAppliedBar = bar;
}

function applyEnergyStateToComposerDirective(baseDirective) {
  const base = baseDirective && typeof baseDirective === 'object' ? baseDirective : getComposerDefaultDirective();
  const energyState = String(ensureSwarmDirector().getSnapshot()?.energyState || 'intro');
  const pacingState = getCurrentPacingStateName();
  const pacingCaps = getCurrentPacingCaps();
  const cfg = getDirectorEnergyStateConfig(energyState);
  const composerCfg = applyEnergyGravityToComposerValues(cfg?.composer || {});
  const arrangement = getPaletteArrangementControls();
  const densityBias = arrangement.density > 0.62 ? 1 : (arrangement.density < 0.36 ? -1 : 0);
  const responseBias = arrangement.octaveEmphasis > 0.64 ? 1 : (arrangement.octaveEmphasis < 0.32 ? -1 : 0);
  const brightnessMul = 0.86 + (arrangement.brightness * 0.34);
  const pacingMul = Number(PACING_ARRANGEMENT_INTENSITY_MULT[pacingState]);
  const intensityMul = Number.isFinite(pacingMul) ? pacingMul : 1;
  const responseMode = String(pacingCaps.responseMode || 'none');
  const maxSpawners = Math.max(0, Math.trunc(Number(pacingCaps.maxSpawners) || 0));
  const maxDrawSnakes = Math.max(0, Math.trunc(Number(pacingCaps.maxDrawSnakes) || 0));
  const allowDrawSnakesByMode = responseMode === 'either' || responseMode === 'drawsnake';
  const drawSnakeCap = allowDrawSnakesByMode ? maxDrawSnakes : 0;
  return {
    drumLoops: Math.max(0, Math.min(maxSpawners, Math.trunc(Number(composerCfg?.drumLoops) || 0) + densityBias)),
    drawSnakes: Math.max(0, Math.min(drawSnakeCap, Math.trunc(Number(composerCfg?.drawSnakes) || 0) + responseBias)),
    intensity: Math.max(0.1, (Number(composerCfg?.intensity) || Number(base.intensity) || 1) * brightnessMul * intensityMul),
    sectionId: String(base.sectionId || 'default'),
    cycle: Math.max(0, Math.trunc(Number(base.cycle) || 0)),
  };
}

function ensureSwarmDirectorDebugHud() {
  if (!swarmDirectorDebug.hudEnabled) return null;
  if (!(overlayEl instanceof HTMLElement)) return null;
  let el = swarmDirectorDebug.hudEl;
  if (!(el instanceof HTMLElement)) {
    el = document.createElement('div');
    el.className = 'beat-swarm-director-debug';
    el.style.position = 'absolute';
    el.style.left = '12px';
    el.style.bottom = '12px';
    el.style.zIndex = '9999';
    el.style.minWidth = '280px';
    el.style.maxWidth = '52vw';
    el.style.maxHeight = '42vh';
    el.style.overflow = 'auto';
    el.style.padding = '8px 10px';
    el.style.borderRadius = '8px';
    el.style.border = '1px solid rgba(110,190,255,0.55)';
    el.style.background = 'rgba(8,14,24,0.82)';
    el.style.color = '#d7ecff';
    el.style.font = '12px/1.35 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
    el.style.whiteSpace = 'pre-wrap';
    el.style.pointerEvents = 'none';
    swarmDirectorDebug.hudEl = el;
  }
  if (el.parentElement !== overlayEl) {
    try { overlayEl.appendChild(el); } catch {}
  }
  return el;
}

function removeSwarmDirectorDebugHud() {
  const el = swarmDirectorDebug.hudEl;
  if (!(el instanceof HTMLElement)) return;
  try { el.remove(); } catch {}
  swarmDirectorDebug.hudEl = null;
}

function pushSwarmStepDebugEvent(event) {
  const e = event && typeof event === 'object' ? event : {};
  swarmDirectorDebug.stepEventLog.push({
    ts: Math.round((performance?.now?.() || 0)),
    beat: Math.max(0, Math.trunc(Number(e.beat) || 0)),
    step: Math.max(0, Math.trunc(Number(e.step) || 0)),
    activeSpawners: Math.max(0, Math.trunc(Number(e.activeSpawners) || 0)),
    triggeredSpawners: Math.max(0, Math.trunc(Number(e.triggeredSpawners) || 0)),
    stepChanged: !!e.stepChanged,
    source: String(e.source || ''),
  });
  if (swarmDirectorDebug.stepEventLog.length > 24) {
    swarmDirectorDebug.stepEventLog.splice(0, swarmDirectorDebug.stepEventLog.length - 24);
  }
}

function updateSwarmDirectorDebugHud(payload = null) {
  const p = payload && typeof payload === 'object' ? payload : {};
  swarmDirectorDebug.snapshot = {
    atMs: Date.now(),
    active: !!active,
    paused: !!gameplayPaused,
    ...p,
  };
  if (!swarmDirectorDebug.hudEnabled) return;
  const el = ensureSwarmDirectorDebugHud();
  if (!(el instanceof HTMLElement)) return;
  const snap = swarmDirectorDebug.snapshot || {};
  const ds = snap?.directorState || ensureSwarmDirector().getSnapshot();
  const lines = [];
  lines.push('Beat Swarm Director Debug');
  lines.push(`active=${snap.active ? 1 : 0} paused=${snap.paused ? 1 : 0} transport=${isRunning?.() ? 1 : 0}`);
  lines.push(`beat=${Math.trunc(Number(ds?.beatIndex) || 0)} bar=${Math.trunc(Number(ds?.barIndex) || 0)} step=${Math.trunc(Number(ds?.stepIndex) || 0)} phase=${(Number(ds?.phase01) || 0).toFixed(3)}`);
  lines.push(`energy=${String(ds?.energyState || '')} cycle=${Math.max(0, Math.trunc(Number(energyStateRuntime.cycle) || 0))} seq=${Math.max(0, Math.trunc(Number(energyStateRuntime.sequenceIndex) || 0))} pool=[${Array.isArray(ds?.notePool) ? ds.notePool.join(',') : ''}]`);
  const pace = swarmPacingRuntime.getSnapshot();
  lines.push(`pacing=${String(pace?.state || '')} startBar=${Math.trunc(Number(pace?.stateStartBar) || 0)} durBars=${Math.trunc(Number(pace?.barsInState) || 0)} mode=${String(pace?.responseMode || '')}`);
  const gravityMetrics = getEnergyGravityMetrics();
  lines.push(`gravity=${gravityMetrics.gravity.toFixed(3)} desired=${gravityMetrics.desired.toFixed(3)} pressure=${gravityMetrics.pressure.toFixed(3)} success=${gravityMetrics.success.toFixed(3)}`);
  lines.push(`stepChanged=${snap.stepChanged ? 1 : 0} beatChanged=${snap.beatChanged ? 1 : 0} reason=${String(snap.reason || '')}`);
  lines.push(`spawners active=${Math.trunc(Number(snap.spawnerActiveCount) || 0)} triggered=${Math.trunc(Number(snap.spawnerTriggeredCount) || 0)} spawned=${Math.trunc(Number(snap.spawnerSpawnCount) || 0)}`);
  lines.push(`events queued=${Math.trunc(Number(snap.queuedStepEvents) || 0)} drained=${Math.trunc(Number(snap.drainedStepEvents) || 0)}`);
  lines.push(`budgets full=${Math.trunc(Number(ds?.budgets?.maxFullThreatsPerBeat) || 0)} light=${Math.trunc(Number(ds?.budgets?.maxLightThreatsPerBeat) || 0)} acc=${Math.trunc(Number(ds?.budgets?.maxAudibleAccentsPerBeat) || 0)} cos=${Math.trunc(Number(ds?.budgets?.maxCosmeticPerBeat) || 0)}`);
  lines.push(`usage   full=${Math.trunc(Number(ds?.usage?.fullThreats) || 0)} light=${Math.trunc(Number(ds?.usage?.lightThreats) || 0)} acc=${Math.trunc(Number(ds?.usage?.audibleAccents) || 0)} cos=${Math.trunc(Number(ds?.usage?.cosmeticParticipants) || 0)}`);
  lines.push(
    `assert cleanup total=${Math.max(0, Math.trunc(Number(cleanupAssertionState.totalViolations) || 0))}`
    + ` director=${Math.max(0, Math.trunc(Number(cleanupAssertionState.directorCleanup) || 0))}`
    + ` section=${Math.max(0, Math.trunc(Number(cleanupAssertionState.sectionChangeCleanup) || 0))}`
  );
  lines.push('recent steps:');
  const recent = swarmDirectorDebug.stepEventLog.slice(-8);
  for (const ev of recent) {
    lines.push(`t${String(ev.ts).padStart(6, ' ')} b${ev.beat} s${ev.step} sc${ev.stepChanged ? 1 : 0} a${ev.activeSpawners} tr${ev.triggeredSpawners} ${ev.source}`);
  }
  el.textContent = lines.join('\n');
}

const swarmSoundEventState = {
  beatIndex: null,
  played: Object.create(null),
  maxVolume: Object.create(null),
  note: Object.create(null),
  noteList: Object.create(null),
  count: Object.create(null),
};
const swarmSoundInstrumentCache = new Map();
const swarmPaletteRuntime = createBeatSwarmPaletteRuntime();
const swarmPacingRuntime = createBeatSwarmPacing({ beatsPerBar: COMPOSER_BEATS_PER_BAR });
const swarmMusicLab = createBeatSwarmMusicLab({
  beatsPerBar: COMPOSER_BEATS_PER_BAR,
  metricsEveryBars: 4,
});
let musicLabLastPacingSignature = '';
let musicLabLastPaletteSignature = '';
try {
  window.addEventListener('instrument-catalog:loaded', () => {
    try { swarmSoundInstrumentCache.clear(); } catch {}
    try { swarmPaletteRuntime.invalidate(); } catch {}
  });
  window.addEventListener('sound-theme:change', () => {
    try { swarmPaletteRuntime.invalidate(); } catch {}
  });
} catch {}
const PREVIEW_NO_HIT_REPOSITION_SECONDS = 2.4;
const weaponDefs = Object.freeze({
  laser: { id: 'laser', damage: 2 },
  projectile: { id: 'projectile', damage: 2 },
  explosion: { id: 'explosion', damage: 1 },
});
const equippedWeapons = new Set();
let lastBeatIndex = null;
let lastWeaponTuneStepIndex = null;
let lastSpawnerEnemyStepIndex = null;
let currentBeatIndex = 0;
let swarmDirector = null;
const swarmDirectorDebug = {
  logBeats: false,
  hudEnabled: false,
  hudEl: null,
  snapshot: null,
  stepEventLog: [],
};
const cleanupAssertionState = {
  totalViolations: 0,
  directorCleanup: 0,
  sectionChangeCleanup: 0,
  lastViolation: null,
};
const weaponTuneFireDebug = {
  enabled: false,
  seq: 0,
};
let previewSelectedWeaponSlotIndex = null;
let activeWeaponSlotIndex = 0;
const stagePickerState = { open: false, slotIndex: -1, stageIndex: -1 };
const PAUSE_WEAPON_DRAG_HOLD_MS = 170;
const PAUSE_WEAPON_DRAG_START_SLOP_PX = 8;
const pauseWeaponDrag = {
  pointerId: null,
  holdTimer: 0,
  started: false,
  startX: 0,
  startY: 0,
  lastX: 0,
  lastY: 0,
  sourceSlotIndex: -1,
  sourceStageIndex: -1,
  targetSlotIndex: -1,
  targetStageIndex: -1,
  proxyEl: null,
  suppressClickUntil: 0,
};
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
  secondsSinceHit: 0,
};
let spawnerRuntime = null;
const difficultyConfig = Object.seal({
  initialEnabledSpawnerCount: 1,
  enemySpeedMultiplier: 0.5,
  enemyHealth: 2,
});
let enemyHealthRampSeconds = 0;
let currentEnemySpawnMaxHp = Math.max(1, Number(difficultyConfig.enemyHealth) || 1);

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
      tune: {
        steps: Math.max(1, Math.trunc(Number(w?.tune?.steps) || WEAPON_TUNE_STEPS)),
        notes: Array.isArray(w?.tune?.notes) ? w.tune.notes.map((n) => String(n || '')) : DRAWGRID_TUNE_NOTE_PALETTE.slice(),
        active: Array.isArray(w?.tune?.active)
          ? w.tune.active.map((v) => !!v)
          : createDefaultWeaponTune().active,
        list: Array.isArray(w?.tune?.list)
          ? w.tune.list.map((col) => (Array.isArray(col) ? col.map((v) => Math.trunc(Number(v) || 0)) : []))
          : createDefaultWeaponTune().list,
        disabled: Array.isArray(w?.tune?.disabled)
          ? w.tune.disabled.map((col) => (Array.isArray(col) ? col.map((v) => Math.trunc(Number(v) || 0)) : []))
          : createDefaultWeaponTune().disabled,
      },
      tuneChain: sanitizeWeaponTuneChain(w?.tuneChain).map((t) => ({
        steps: Math.max(1, Math.trunc(Number(t?.steps) || WEAPON_TUNE_STEPS)),
        notes: Array.isArray(t?.notes) ? t.notes.map((n) => String(n || '')) : DRAWGRID_TUNE_NOTE_PALETTE.slice(),
        active: Array.isArray(t?.active) ? t.active.map((v) => !!v) : createDefaultWeaponTune().active,
        list: Array.isArray(t?.list) ? t.list.map((col) => (Array.isArray(col) ? col.map((v) => Math.trunc(Number(v) || 0)) : [])) : createDefaultWeaponTune().list,
        disabled: Array.isArray(t?.disabled) ? t.disabled.map((col) => (Array.isArray(col) ? col.map((v) => Math.trunc(Number(v) || 0)) : [])) : createDefaultWeaponTune().disabled,
      })),
    })),
    activeWeaponSlotIndex: Math.max(0, Math.min(MAX_WEAPON_SLOTS - 1, Math.trunc(Number(activeWeaponSlotIndex) || 0))),
    pendingWeaponChainEvents: pendingWeaponChainEvents.map((ev) => ({
      eventId: Number.isFinite(ev.eventId) ? Math.trunc(ev.eventId) : null,
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
        sourceEnemyId: Number.isFinite(ev.context?.sourceEnemyId) ? Math.trunc(ev.context.sourceEnemyId) : null,
        damageScale: Math.max(0.05, Number(ev.context?.damageScale) || 1),
        forcedNoteName: normalizeSwarmNoteName(ev.context?.forcedNoteName) || null,
      },
    })),
    lingeringAoeZones: lingeringAoeZones.map((z) => ({
      x: Number(z.x) || 0,
      y: Number(z.y) || 0,
      radius: Number(z.radius) || EXPLOSION_RADIUS_WORLD,
      damagePerBeat: Number(z.damagePerBeat) || 1,
      untilBeat: Number(z.untilBeat) || 0,
      weaponSlotIndex: Number.isFinite(z.weaponSlotIndex) ? Math.trunc(z.weaponSlotIndex) : null,
      stageIndex: Number.isFinite(z.stageIndex) ? Math.trunc(z.stageIndex) : null,
    })),
    currentBeatIndex: Number(currentBeatIndex) || 0,
    directorState: ensureSwarmDirector().getSnapshot(),
    energyStateRuntime: {
      sequenceIndex: Math.max(0, Math.trunc(Number(energyStateRuntime.sequenceIndex) || 0)),
      stateStartBar: Math.max(0, Math.trunc(Number(energyStateRuntime.stateStartBar) || 0)),
      state: String(energyStateRuntime.state || 'intro'),
      cycle: Math.max(0, Math.trunc(Number(energyStateRuntime.cycle) || 0)),
      lastAppliedBar: Math.trunc(Number(energyStateRuntime.lastAppliedBar) || -1),
    },
    energyGravityRuntime: {
      pressure: clamp01(energyGravityRuntime.pressure),
      success: clamp01(energyGravityRuntime.success),
      gravity: clamp11(energyGravityRuntime.gravity),
      desired: clamp11(energyGravityRuntime.desired),
    },
    enemies: enemies.map((e) => ({
      id: Number(e.id) || 0,
      wx: Number(e.wx) || 0,
      wy: Number(e.wy) || 0,
      vx: Number(e.vx) || 0,
      vy: Number(e.vy) || 0,
      hp: Number(e.hp) || 1,
      maxHp: Number(e.maxHp) || 1,
      soundNote: normalizeSwarmNoteName(e.soundNote) || getRandomSwarmPentatonicNote(),
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
      duration: Number(fx.duration) || 0,
      chainEventId: Number.isFinite(fx.chainEventId) ? Math.trunc(fx.chainEventId) : null,
      anchorEnemyId: Number.isFinite(fx.anchorEnemyId) ? Math.trunc(fx.anchorEnemyId) : null,
      from: fx.from ? { x: Number(fx.from.x) || 0, y: Number(fx.from.y) || 0 } : null,
      to: fx.to ? { x: Number(fx.to.x) || 0, y: Number(fx.to.y) || 0 } : null,
      at: fx.at ? { x: Number(fx.at.x) || 0, y: Number(fx.at.y) || 0 } : null,
      fallbackAt: fx.fallbackAt ? { x: Number(fx.fallbackAt.x) || 0, y: Number(fx.fallbackAt.y) || 0 } : null,
      radiusWorld: Number(fx.radiusWorld) || EXPLOSION_RADIUS_WORLD,
      targetEnemyId: Number.isFinite(fx.targetEnemyId) ? Math.trunc(fx.targetEnemyId) : null,
      sourceEnemyId: Number.isFinite(fx.sourceEnemyId) ? Math.trunc(fx.sourceEnemyId) : null,
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
  const rect = state?.root?.getBoundingClientRect?.();
  const sceneSize = Math.max(100, Math.min(Number(rect?.width) || 0, Number(rect?.height) || 0));
  const boomRadius = Math.max(18, Math.min(36, sceneSize * 0.2));
  const p = {
    kind,
    x: from.x,
    y: from.y,
    vx: dir.x * 120,
    vy: dir.y * 120,
    ttl: kind === 'boomerang' ? 1.2 : 1.6,
    el: createComponentMiniNode(
      `beat-swarm-preview-projectile${kind === 'boomerang' ? ' is-boomerang' : ''}`,
      state.scene
    ),
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
      spawnComponentMiniProjectile(state, state.ship, { x: state.ship.x + 220, y: state.ship.y }, 'homing');
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
    pulseHitFlash(state.enemy.el);
    return;
  }
  if (c.archetype === 'aoe') {
    spawnComponentMiniEffect(state, 'explosion', state.ship, state.ship, c.variant === 'dot-area' ? 0.7 : 0.24, 36);
    pulseHitFlash(state.enemy.el);
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
    state.enemy.y = (h * 0.5) + (Math.sin((performance.now() || 0) * 0.004) * (h * 0.17));
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
    if (p.kind === 'boomerang') {
      const deg = ((Number(p.boomTheta) || 0) * (180 / Math.PI) * PROJECTILE_BOOMERANG_SPIN_MULT) + 180;
      p.el.style.transform = `translate(${p.x.toFixed(2)}px, ${p.y.toFixed(2)}px) rotate(${deg.toFixed(2)}deg)`;
    } else {
      p.el.style.transform = `translate(${p.x.toFixed(2)}px, ${p.y.toFixed(2)}px)`;
    }
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
    slot.tune = sanitizeWeaponTune(raw?.tune);
    slot.tuneChain = sanitizeWeaponTuneChain(raw?.tuneChain);
    if (!slot.tuneChain.length) slot.tuneChain = [sanitizeWeaponTune(slot.tune)];
    while (slot.tuneChain.length < WEAPON_TUNE_CHAIN_LENGTH) {
      slot.tuneChain.push(sanitizeWeaponTune(slot.tuneChain[0]));
    }
    if (slot.tuneChain.length > WEAPON_TUNE_CHAIN_LENGTH) slot.tuneChain.length = WEAPON_TUNE_CHAIN_LENGTH;
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
    removeEnemy(old, 'restore_overflow');
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
    soundNote: normalizeSwarmNoteName(state.soundNote) || getRandomSwarmPentatonicNote(),
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
  let restoredMaxEventId = 0;
  for (const ev of Array.isArray(state.pendingWeaponChainEvents) ? state.pendingWeaponChainEvents : []) {
    const stages = sanitizeWeaponStages(ev?.stages);
    if (!stages.length) continue;
    const eventId = Number.isFinite(ev?.eventId) ? Math.max(1, Math.trunc(ev.eventId)) : null;
    if (eventId && eventId > restoredMaxEventId) restoredMaxEventId = eventId;
    pendingWeaponChainEvents.push({
      eventId,
      beatIndex: Math.max(0, Math.trunc(Number(ev?.beatIndex) || 0)),
      stages,
      context: {
        origin: ev?.context?.origin ? { x: Number(ev.context.origin.x) || 0, y: Number(ev.context.origin.y) || 0 } : null,
        impactPoint: ev?.context?.impactPoint ? { x: Number(ev.context.impactPoint.x) || 0, y: Number(ev.context.impactPoint.y) || 0 } : null,
        weaponSlotIndex: Number.isFinite(ev?.context?.weaponSlotIndex) ? Math.trunc(ev.context.weaponSlotIndex) : null,
        stageIndex: Number.isFinite(ev?.context?.stageIndex) ? Math.trunc(ev.context.stageIndex) : null,
        impactEnemyId: Number.isFinite(ev?.context?.impactEnemyId) ? Math.trunc(ev.context.impactEnemyId) : null,
        sourceEnemyId: Number.isFinite(ev?.context?.sourceEnemyId) ? Math.trunc(ev.context.sourceEnemyId) : null,
        damageScale: Math.max(0.05, Number(ev?.context?.damageScale) || 1),
        forcedNoteName: normalizeSwarmNoteName(ev?.context?.forcedNoteName) || null,
      },
    });
  }
  weaponChainEventSeq = Math.max(1, restoredMaxEventId + 1);
  lingeringAoeZones.length = 0;
  for (const z of Array.isArray(state.lingeringAoeZones) ? state.lingeringAoeZones : []) {
    lingeringAoeZones.push({
      x: Number(z.x) || 0,
      y: Number(z.y) || 0,
      radius: Math.max(1, Number(z.radius) || EXPLOSION_RADIUS_WORLD),
      damagePerBeat: Math.max(0, Number(z.damagePerBeat) || 1),
      untilBeat: Math.max(0, Math.trunc(Number(z.untilBeat) || 0)),
      weaponSlotIndex: Number.isFinite(z.weaponSlotIndex) ? Math.trunc(z.weaponSlotIndex) : null,
      stageIndex: Number.isFinite(z.stageIndex) ? Math.trunc(z.stageIndex) : null,
    });
  }
  currentBeatIndex = Math.max(0, Math.trunc(Number(state.currentBeatIndex) || 0));
  const restoredEnergy = state?.energyStateRuntime && typeof state.energyStateRuntime === 'object'
    ? state.energyStateRuntime
    : null;
  if (restoredEnergy) {
    energyStateRuntime.sequenceIndex = Math.max(0, Math.trunc(Number(restoredEnergy.sequenceIndex) || 0));
    energyStateRuntime.stateStartBar = Math.max(0, Math.trunc(Number(restoredEnergy.stateStartBar) || 0));
    energyStateRuntime.state = String(restoredEnergy.state || 'intro');
    energyStateRuntime.cycle = Math.max(0, Math.trunc(Number(restoredEnergy.cycle) || 0));
    energyStateRuntime.lastAppliedBar = Math.trunc(Number(restoredEnergy.lastAppliedBar) || -1);
  } else {
    resetEnergyStateRuntime(Math.floor(currentBeatIndex / Math.max(1, COMPOSER_BEATS_PER_BAR)));
  }
  const restoredGravity = state?.energyGravityRuntime && typeof state.energyGravityRuntime === 'object'
    ? state.energyGravityRuntime
    : null;
  if (restoredGravity) {
    energyGravityRuntime.pressure = clamp01(restoredGravity.pressure);
    energyGravityRuntime.success = clamp01(restoredGravity.success);
    energyGravityRuntime.gravity = clamp11(restoredGravity.gravity);
    energyGravityRuntime.desired = clamp11(restoredGravity.desired);
    energyGravityRuntime.recentKillTimes = [];
  } else {
    resetEnergyGravityRuntime();
  }
  const director = ensureSwarmDirector();
  if (state?.directorState?.energyState) {
    director.setEnergyState(String(state.directorState.energyState));
  }
  if (Array.isArray(state?.directorState?.notePool)) {
    director.setNotePool(state.directorState.notePool);
  }
  if (state?.directorState?.budgets && typeof state.directorState.budgets === 'object') {
    director.setBudgets(state.directorState.budgets);
  }
  applyEnergyStateForBar(Math.floor(currentBeatIndex / Math.max(1, COMPOSER_BEATS_PER_BAR)));
  director.syncToBeat(currentBeatIndex);

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
    const kind = String(p.kind || '');
    el.className = kind === 'homing-missile'
      ? 'beat-swarm-projectile is-homing-missile'
      : (kind === 'boomerang'
        ? 'beat-swarm-projectile is-boomerang'
        : 'beat-swarm-projectile');
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
        sourceEnemyId: Number.isFinite(fx.sourceEnemyId) ? Math.trunc(fx.sourceEnemyId) : null,
        targetEnemyId: Number.isFinite(fx.targetEnemyId) ? Math.trunc(fx.targetEnemyId) : null,
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
        sourceEnemyId: Number.isFinite(fx.sourceEnemyId) ? Math.trunc(fx.sourceEnemyId) : null,
        damagePerSec: Math.max(0, Number(fx.damagePerSec) || BEAM_DAMAGE_PER_SECOND),
        weaponSlotIndex: Number.isFinite(fx.weaponSlotIndex) ? Math.trunc(fx.weaponSlotIndex) : null,
        el,
      });
    } else if (fx.kind === 'explosion' || fx.kind === 'explosion-prime' || fx.kind === 'hostile-explosion') {
      el.className = 'beat-swarm-fx-explosion';
      if (fx.kind === 'explosion-prime') {
        el.style.background = 'radial-gradient(circle at center, rgba(114, 208, 255, 0.35), rgba(68, 163, 255, 0.16), rgba(32, 116, 245, 0.03))';
        el.style.borderColor = 'rgba(122, 201, 255, 0.78)';
      }
      el.style.transform = 'translate(-9999px, -9999px)';
      enemyLayerEl.appendChild(el);
      effects.push({
        kind: fx.kind === 'explosion-prime' ? 'explosion-prime' : 'explosion',
        ttl: Math.max(0, Number(fx.ttl) || 0),
        duration: Math.max(0.01, Number(fx.duration) || Number(fx.ttl) || getGameplayBeatLen()),
        chainEventId: Number.isFinite(fx.chainEventId) ? Math.trunc(fx.chainEventId) : null,
        anchorEnemyId: Number.isFinite(fx.anchorEnemyId) ? Math.trunc(fx.anchorEnemyId) : null,
        at: fx.at ? { x: Number(fx.at.x) || 0, y: Number(fx.at.y) || 0 } : { x: 0, y: 0 },
        fallbackAt: fx.fallbackAt ? { x: Number(fx.fallbackAt.x) || 0, y: Number(fx.fallbackAt.y) || 0 } : null,
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

function getStageSoundVolume(stageIndex) {
  if (!Number.isFinite(stageIndex)) return 1;
  return Math.trunc(stageIndex) === 0 ? 1 : 0.5;
}

function getComposerDefaultDirective() {
  return {
    drumLoops: Math.max(0, Math.trunc(Number(SPAWNER_ENEMY_TARGET_COUNT) || 0)),
    drawSnakes: Math.max(0, Math.trunc(Number(DRAW_SNAKE_ENEMY_TARGET_COUNT) || 0)),
    intensity: 1,
    sectionId: 'default',
    cycle: 0,
  };
}

function getComposerSectionForBeat(beatIndex) {
  const sections = Array.isArray(COMPOSER_SECTIONS) ? COMPOSER_SECTIONS : [];
  if (!sections.length) return { id: 'default', cycle: 0, directive: getComposerDefaultDirective() };
  const beatsPerBar = Math.max(1, Math.trunc(Number(COMPOSER_BEATS_PER_BAR) || 4));
  const sectionBeats = sections.map((s) => Math.max(1, Math.trunc(Number(s?.bars) || 1)) * beatsPerBar);
  const totalBeats = sectionBeats.reduce((acc, n) => acc + n, 0) || beatsPerBar;
  const beat = Math.max(0, Math.trunc(Number(beatIndex) || 0));
  const cycle = Math.floor(beat / totalBeats);
  const beatInCycle = beat % totalBeats;
  let cursor = 0;
  for (let i = 0; i < sections.length; i++) {
    const len = sectionBeats[i];
    if (beatInCycle < (cursor + len)) {
      const section = sections[i] || {};
      const directive = {
        drumLoops: Math.max(0, Math.trunc(Number(section?.directive?.drumLoops) || 0)),
        drawSnakes: Math.max(0, Math.trunc(Number(section?.directive?.drawSnakes) || 0)),
        intensity: Math.max(0.1, Number(section?.directive?.intensity) || 1),
        sectionId: String(section?.id || `section-${i}`),
        cycle,
      };
      return { id: directive.sectionId, cycle, directive };
    }
    cursor += len;
  }
  return { id: 'default', cycle, directive: getComposerDefaultDirective() };
}

function updateComposerForBeat(beatIndex) {
  updateComposerMotifEpochForBeat(beatIndex);
  if (!composerRuntime.enabled) {
    composerRuntime.currentDirective = applyEnergyStateToComposerDirective(getComposerDefaultDirective());
    try {
      swarmPaletteRuntime.noteSectionDirective?.({
        sectionId: 'default',
        energyState: String(ensureSwarmDirector().getSnapshot()?.energyState || 'intro'),
        intensity: Number(composerRuntime.currentDirective?.intensity) || 0.5,
      });
    } catch {}
    composerRuntime.currentSectionId = 'default';
    composerRuntime.currentCycle = 0;
    composerRuntime.lastSectionKey = 'default:0';
    return;
  }
  const section = getComposerSectionForBeat(beatIndex);
  const key = `${section.id}:${section.cycle}`;
  const energyStateName = String(ensureSwarmDirector().getSnapshot()?.energyState || 'intro');
  const arrangementKey = `${key}:${energyStateName}`;
  composerRuntime.currentDirective = applyEnergyStateToComposerDirective(section.directive);
  if (composerRuntime.lastSectionKey !== arrangementKey) {
    try {
      swarmPaletteRuntime.noteSectionDirective?.({
        sectionId: String(section.id || 'default'),
        energyState: energyStateName,
        intensity: Number(composerRuntime.currentDirective?.intensity) || 0.5,
      });
    } catch {}
  }
  composerRuntime.currentSectionId = section.id;
  composerRuntime.currentCycle = section.cycle;
  composerRuntime.lastSectionKey = arrangementKey;
}

function getComposerDirective() {
  const d = composerRuntime.currentDirective || getComposerDefaultDirective();
  return {
    drumLoops: Math.max(0, Math.trunc(Number(d.drumLoops) || 0)),
    drawSnakes: Math.max(0, Math.trunc(Number(d.drawSnakes) || 0)),
    intensity: Math.max(0.1, Number(d.intensity) || 1),
    sectionId: String(d.sectionId || 'default'),
    cycle: Math.max(0, Math.trunc(Number(d.cycle) || 0)),
  };
}

function getComposerMotif(sectionId, motifId, factory) {
  const sid = String(sectionId || 'default');
  const mid = String(motifId || 'motif');
  const key = `${sid}:${mid}`;
  if (composerRuntime.motifCache.has(key)) return composerRuntime.motifCache.get(key);
  const created = typeof factory === 'function' ? factory() : null;
  composerRuntime.motifCache.set(key, created);
  return created;
}

function createComposerEnemyGroupProfile(groupIndex = 0, templateLike = null) {
  return buildComposerEnemyGroupProfile({
    groupIndex,
    templateLike,
    templates: COMPOSER_GROUP_TEMPLATE_LIBRARY,
    constants: {
      stepsPerBar: WEAPON_TUNE_STEPS,
      notesMin: COMPOSER_GROUP_NOTES_MIN,
      notesMax: COMPOSER_GROUP_NOTES_MAX,
      loopHitsMin: COMPOSER_GROUP_LOOP_HITS_MIN,
      loopHitsMax: COMPOSER_GROUP_LOOP_HITS_MAX,
      actions: COMPOSER_GROUP_ACTIONS,
      performersMin: COMPOSER_GROUP_PERFORMERS_MIN,
      performersMax: COMPOSER_GROUP_PERFORMERS_MAX,
      sizeMin: COMPOSER_GROUP_SIZE_MIN,
      sizeMax: COMPOSER_GROUP_SIZE_MAX,
      shapes: COMPOSER_GROUP_SHAPES,
      colors: COMPOSER_GROUP_COLORS,
    },
    roles: {
      lead: BEAT_EVENT_ROLES.LEAD,
      bass: BEAT_EVENT_ROLES.BASS,
    },
    threat: {
      full: BEAT_EVENT_THREAT.FULL,
    },
    randRange,
    normalizeRole: normalizeSwarmRole,
    normalizeNoteName: normalizeSwarmNoteName,
    clampNoteToPool: (noteName, noteIndex) => ensureSwarmDirector().clampNoteToPool(noteName, noteIndex),
    getPaletteArrangementControls,
    getCurrentSwarmEnergyStateName,
    getEnergyStateThemePreset,
    pickRandomArrayItem,
    getLockedMotifHook,
    getComposerMotifScopeKey,
    getSwarmPentatonicNoteByIndex,
    createStepPattern,
    applyStepPatternDensity,
    pickEnemyInstrumentIdForToyRandom,
    resolveSwarmSoundInstrumentId,
  });
}

function getRandomSwarmPentatonicNote() {
  const list = ensureSwarmDirector().getNotePool();
  const idx = Math.max(0, Math.min(list.length - 1, Math.trunc(Math.random() * list.length)));
  return list[idx] || 'C4';
}

function getSwarmPentatonicNoteByIndex(index) {
  const note = ensureSwarmDirector().pickNoteFromPool(index);
  return normalizeSwarmNoteName(note) || getRandomSwarmPentatonicNote();
}

function normalizeSwarmNoteName(noteName) {
  const s = String(noteName || '').trim().toUpperCase();
  const m = /^([A-G])([#B]?)(-?\d+)$/.exec(s);
  if (!m) return '';
  const letter = m[1];
  const accidental = (m[2] || '').replace('B', 'b');
  const octave = m[3];
  return `${letter}${accidental}${octave}`;
}

function noteNameToMidi(noteName) {
  const normalized = normalizeSwarmNoteName(noteName);
  const m = /^([A-G])([#b]?)(-?\d+)$/.exec(normalized);
  if (!m) return null;
  const base = m[1];
  const accidental = m[2] || '';
  const octave = Math.trunc(Number(m[3]) || 0);
  const semitoneBase = (
    base === 'C' ? 0
      : base === 'D' ? 2
        : base === 'E' ? 4
          : base === 'F' ? 5
            : base === 'G' ? 7
              : base === 'A' ? 9
                : 11
  );
  const accidentalDelta = accidental === '#' ? 1 : (accidental === 'b' ? -1 : 0);
  return ((octave + 1) * 12) + semitoneBase + accidentalDelta;
}

function transposeSwarmNoteName(noteName, semitoneDelta = 0) {
  const midi = noteNameToMidi(noteName);
  if (!Number.isFinite(midi)) return normalizeSwarmNoteName(noteName) || '';
  const shifted = Math.max(0, Math.min(127, Math.trunc(Number(midi) + Number(semitoneDelta || 0))));
  return normalizeSwarmNoteName(midiToName(shifted)) || normalizeSwarmNoteName(noteName) || '';
}

function getSwarmEnemySoundNoteById(enemyId) {
  const id = Math.trunc(Number(enemyId) || 0);
  if (!(id > 0)) return '';
  const alive = enemies.find((e) => Math.trunc(Number(e?.id) || 0) === id) || null;
  if (alive) return normalizeSwarmNoteName(alive.soundNote) || '';
  const pending = pendingEnemyDeaths.find((d) => Math.trunc(Number(d?.sourceEnemyId) || 0) === id) || null;
  if (pending) return normalizeSwarmNoteName(pending.soundNote) || '';
  return '';
}

function logWeaponTuneFireDebug(event, payload = null) {
  if (!weaponTuneFireDebug.enabled) return;
  weaponTuneFireDebug.seq = Math.max(0, Math.trunc(Number(weaponTuneFireDebug.seq) || 0)) + 1;
  try {
    console.log('[BS-TUNE-DEBUG]', event, { seq: weaponTuneFireDebug.seq, ...(payload && typeof payload === 'object' ? payload : {}) });
  } catch {}
}

function getWeaponTuneSignature(tuneLike) {
  const tune = sanitizeWeaponTune(tuneLike);
  const steps = Math.max(1, Math.trunc(Number(tune?.steps) || WEAPON_TUNE_STEPS));
  const parts = [];
  for (let s = 0; s < steps; s++) {
    if (!tune.active?.[s]) continue;
    const rows = Array.isArray(tune.list?.[s]) ? tune.list[s].slice() : [];
    if (!rows.length) continue;
    rows.sort((a, b) => a - b);
    parts.push(`${s}:${rows.join('.')}`);
  }
  return `steps=${steps}|events=${parts.length}|sig=${parts.join(',')}`;
}

function normalizeInstrumentIdToken(value) {
  return String(value || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
}

function resolveInstrumentIdOrFallback(candidate, fallback = 'tone') {
  const raw = String(candidate || '').trim();
  const allIds = Array.isArray(getAllIds?.()) ? getAllIds().map((id) => String(id || '').trim()).filter(Boolean) : [];
  if (!raw) return String(fallback || 'tone').trim() || 'tone';
  if (allIds.includes(raw)) return raw;
  const fromDisplay = String(getIdForDisplayName(raw) || '').trim();
  if (fromDisplay) return fromDisplay;
  if (allIds.length) {
    const token = normalizeInstrumentIdToken(raw);
    const match = allIds.find((id) => normalizeInstrumentIdToken(id) === token);
    if (match) return match;
  }
  return String(fallback || 'tone').trim() || 'tone';
}

function resolveSwarmSoundInstrumentId(eventKey) {
  const key = String(eventKey || '').trim();
  if (!key) return 'tone';
  const allIds = Array.isArray(getAllIds?.()) ? getAllIds().map((id) => String(id || '').trim()).filter(Boolean) : [];
  const idSet = new Set(allIds);
  if (swarmSoundInstrumentCache.has(key)) {
    const cached = String(swarmSoundInstrumentCache.get(key) || '').trim();
    if (cached && (idSet.has(cached) || allIds.length === 0)) return cached;
    swarmSoundInstrumentCache.delete(key);
  }
  const def = SWARM_SOUND_EVENTS[key] || null;
  const display = String(def?.instrumentDisplay || '').trim();
  let id = resolveInstrumentIdOrFallback(display, String(getIdForDisplayName('Tone (Sine)') || '').trim() || 'tone');
  if (!id && display && idSet.has(display)) id = display;
  swarmSoundInstrumentCache.set(key, id);
  return id;
}

function resolveSwarmRoleInstrumentId(roleName, fallback = 'tone') {
  const role = normalizeSwarmRole(roleName, BEAT_EVENT_ROLES.ACCENT);
  const fallbackId = resolveInstrumentIdOrFallback(fallback, 'tone');
  return resolveInstrumentIdOrFallback(swarmPaletteRuntime.resolveRoleInstrument(role, fallbackId), fallbackId);
}

function isEnemyDeathSoundEventKey(eventKey) {
  const key = String(eventKey || '').trim();
  if (!key) return false;
  if (key === 'enemyDeath') return true;
  return Object.values(SWARM_ENEMY_DEATH_EVENT_KEY_BY_FAMILY).includes(key);
}

function normalizeEnemyDeathFamily(family, fallback = 'medium') {
  const raw = String(family || '').trim().toLowerCase();
  if (raw === 'small' || raw === 'medium' || raw === 'large') return raw;
  return String(fallback || 'medium').trim().toLowerCase() === 'small'
    ? 'small'
    : (String(fallback || 'medium').trim().toLowerCase() === 'large' ? 'large' : 'medium');
}

function resolveEnemyDeathEventKey(family, fallback = 'enemyDeathMedium') {
  const normalized = normalizeEnemyDeathFamily(family, 'medium');
  const key = SWARM_ENEMY_DEATH_EVENT_KEY_BY_FAMILY[normalized];
  if (SWARM_SOUND_EVENTS[key]) return key;
  if (SWARM_SOUND_EVENTS[fallback]) return fallback;
  return SWARM_SOUND_EVENTS.enemyDeath ? 'enemyDeath' : '';
}

function classifyEnemyDeathFamily(enemyLike) {
  const enemy = enemyLike && typeof enemyLike === 'object' ? enemyLike : null;
  const enemyType = String(enemy?.enemyType || '').trim().toLowerCase();
  if (enemyType === 'spawner') return 'large';
  if (enemyType === 'drawsnake') return 'medium';
  if (enemyType === 'composer-group-member') return 'small';
  const hp = Math.max(0, Number(enemy?.maxHp) || Number(enemy?.hp) || 0);
  if (hp >= 12) return 'large';
  if (hp >= 5) return 'medium';
  return 'small';
}

function getCurrentPacingCaps() {
  const pace = swarmPacingRuntime.getSnapshot();
  const caps = pace?.caps && typeof pace.caps === 'object' ? pace.caps : {};
  return {
    maxFallbackEnemies: Math.max(0, Math.trunc(Number(caps.maxFallbackEnemies) || 0)),
    maxSpawners: Math.max(0, Math.trunc(Number(caps.maxSpawners) || 0)),
    maxDrawSnakes: Math.max(0, Math.trunc(Number(caps.maxDrawSnakes) || 0)),
    maxComposerGroups: Math.max(0, Math.trunc(Number(caps.maxComposerGroups) || 0)),
    maxComposerGroupSize: Math.max(0, Math.trunc(Number(caps.maxComposerGroupSize) || 0)),
    maxComposerPerformers: Math.max(0, Math.trunc(Number(caps.maxComposerPerformers) || 0)),
    responseMode: String(caps.responseMode || 'none'),
  };
}

function getMusicLabContext(base = null) {
  const input = base && typeof base === 'object' ? base : {};
  const beatIndex = Math.max(0, Math.trunc(Number(input.beatIndex) || 0));
  const barIndex = input.barIndex != null
    ? Math.max(0, Math.trunc(Number(input.barIndex) || 0))
    : Math.floor(beatIndex / Math.max(1, COMPOSER_BEATS_PER_BAR));
  const pacingSnap = swarmPacingRuntime?.getSnapshot?.() || null;
  const paletteSnap = swarmPaletteRuntime?.getSnapshot?.() || null;
  return {
    ...input,
    barIndex,
    pacingState: String(input.pacingState || pacingSnap?.state || '').trim().toLowerCase(),
    paletteId: String(input.paletteId || paletteSnap?.id || '').trim(),
    themeId: String(input.themeId || paletteSnap?.theme || '').trim(),
  };
}

function startMusicLabSession(reason = 'unknown') {
  musicLabLastPacingSignature = '';
  musicLabLastPaletteSignature = '';
  cleanupAssertionState.totalViolations = 0;
  cleanupAssertionState.directorCleanup = 0;
  cleanupAssertionState.sectionChangeCleanup = 0;
  cleanupAssertionState.lastViolation = null;
  try {
    swarmMusicLab.resetSession({
      reason: String(reason || 'unknown'),
      mode: 'beat-swarm',
      startedAtBeat: Math.max(0, Math.trunc(Number(currentBeatIndex) || 0)),
    });
  } catch {}
}

function normalizeEnemyRemovalReason(reason = 'unknown') {
  const raw = String(reason || '').trim().toLowerCase();
  if (!raw) return 'unknown';
  if (raw === 'killed') return 'killed';
  if (raw === 'expired') return 'expired';
  if (raw === 'retreated') return 'retreated';
  if (raw === 'director_cleanup') return 'director_cleanup';
  if (raw === 'section_change_cleanup') return 'section_change_cleanup';
  if (raw === 'restore_overflow') return 'restore_overflow';
  if (raw === 'mode_exit_clear') return 'mode_exit_clear';
  if (raw === 'debug_clear') return 'debug_clear';
  return raw;
}

function startEnemyRetreat(enemy, reason = 'retreated', origin = '') {
  if (!enemy || typeof enemy !== 'object') return false;
  enemy.retreating = true;
  enemy.lifecycleState = 'retiring';
  if (String(enemy?.enemyType || '') !== 'composer-group-member') {
    ensureSingletonMusicGroupForEnemy(enemy, { lifecycleState: 'retiring' });
  }
  enemy.retreatReason = String(reason || 'retreated').trim().toLowerCase() || 'retreated';
  enemy.retreatOrigin = String(origin || '').trim().toLowerCase();
  const center = getViewportCenterWorld();
  const dx = (Number(enemy.wx) || 0) - (Number(center?.x) || 0);
  const dy = (Number(enemy.wy) || 0) - (Number(center?.y) || 0);
  let dir = normalizeDir(dx, dy, Math.random() - 0.5, Math.random() - 0.5);
  if (!Number.isFinite(dir.x) || !Number.isFinite(dir.y) || (Math.abs(dir.x) < 0.0001 && Math.abs(dir.y) < 0.0001)) {
    dir = normalizeDir(Math.random() - 0.5, Math.random() - 0.5, 1, 0);
  }
  const speed = ENEMY_MAX_SPEED * 0.9;
  enemy.vx = (Number(dir.x) || 0) * speed;
  enemy.vy = (Number(dir.y) || 0) * speed;
  if (String(enemy?.enemyType || '') === 'composer-group-member') {
    enemy.composerRetiring = true;
  }
  return true;
}

function noteSwarmSoundEvent(eventKey, volume = 1, beatIndex = currentBeatIndex, noteName = null) {
  const key = String(eventKey || '').trim();
  if (!SWARM_SOUND_EVENTS[key]) return;
  const beat = Math.max(0, Math.trunc(Number(beatIndex) || 0));
  if (swarmSoundEventState.beatIndex !== beat) {
    swarmSoundEventState.beatIndex = beat;
    swarmSoundEventState.played = Object.create(null);
    swarmSoundEventState.maxVolume = Object.create(null);
    swarmSoundEventState.note = Object.create(null);
    swarmSoundEventState.noteList = Object.create(null);
    swarmSoundEventState.count = Object.create(null);
  }
  const vol = Math.max(0.001, Math.min(1, Number(volume) || 0));
  let note = normalizeSwarmNoteName(noteName) || getRandomSwarmPentatonicNote();
  if (isEnemyDeathSoundEventKey(key)) {
    const noteList = Array.isArray(swarmSoundEventState.noteList[key]) ? swarmSoundEventState.noteList[key] : [];
    if (noteList.includes(note)) {
      const count = Math.max(0, Math.trunc(Number(swarmSoundEventState.count[key]) || 0));
      const preferred = SWARM_PENTATONIC_NOTES_ONE_OCTAVE[count % SWARM_PENTATONIC_NOTES_ONE_OCTAVE.length];
      if (preferred && !noteList.includes(preferred)) {
        note = preferred;
      } else {
        const fallback = SWARM_PENTATONIC_NOTES_ONE_OCTAVE.find((n) => !noteList.includes(n));
        if (fallback) note = fallback;
      }
    }
    noteList.push(note);
    swarmSoundEventState.noteList[key] = noteList;
    swarmSoundEventState.count[key] = Math.max(0, Math.trunc(Number(swarmSoundEventState.count[key]) || 0)) + 1;
  }
  const prev = Number(swarmSoundEventState.maxVolume[key]) || 0;
  if (vol > prev) {
    swarmSoundEventState.maxVolume[key] = vol;
    swarmSoundEventState.note[key] = note;
  } else if (!swarmSoundEventState.note[key]) {
    swarmSoundEventState.note[key] = note;
  }
}

function flushSwarmSoundEventsForBeat(beatIndex = currentBeatIndex) {
  const beat = Math.max(0, Math.trunc(Number(beatIndex) || 0));
  if (swarmSoundEventState.beatIndex !== beat) return;
  for (const key of Object.keys(SWARM_SOUND_EVENTS)) {
    if (swarmSoundEventState.played[key]) continue;
    const vol = Number(swarmSoundEventState.maxVolume[key]) || 0;
    if (!(vol > 0.0001)) continue;
    const def = SWARM_SOUND_EVENTS[key];
    const inst = resolveSwarmSoundInstrumentId(key);
    const isDeathKey = isEnemyDeathSoundEventKey(key);
    const notes = (() => {
      if (!isDeathKey) {
        return [normalizeSwarmNoteName(swarmSoundEventState.note[key]) || String(def?.note || getRandomSwarmPentatonicNote())];
      }
      const list = Array.isArray(swarmSoundEventState.noteList[key]) ? swarmSoundEventState.noteList[key] : [];
      const uniq = [];
      for (const n of list) {
        const normalized = normalizeSwarmNoteName(n);
        if (!normalized) continue;
        if (uniq.includes(normalized)) continue;
        uniq.push(normalized);
      }
      if (uniq.length) return uniq;
      return [normalizeSwarmNoteName(swarmSoundEventState.note[key]) || String(def?.note || getRandomSwarmPentatonicNote())];
    })();
    const nowAudio = Number(getLoopInfo?.()?.now);
    const deathArpStepSec = Math.max(0.004, Number(def?.arpStepSec) || 0.028);
    const deathArpMaxNotes = Math.max(1, Math.trunc(Number(def?.arpMaxNotes) || SWARM_PENTATONIC_NOTES_ONE_OCTAVE.length));
    const deathPitchDropSemitones = Math.max(0, Math.trunc(Number(def?.pitchDropSemitones) || 0));
    const defVolumeMult = Math.max(0.1, Math.min(1.6, Number(def?.volumeMult) || 1));
    const deathPitchList = isDeathKey ? notes.slice(0, deathArpMaxNotes) : notes;
    for (let i = 0; i < deathPitchList.length; i++) {
      const when = (isDeathKey && Number.isFinite(nowAudio))
        ? (nowAudio + (i * deathArpStepSec))
        : undefined;
      const rawPitch = isDeathKey && deathPitchDropSemitones > 0
        ? transposeSwarmNoteName(deathPitchList[i], -Math.min(deathPitchDropSemitones, i))
        : deathPitchList[i];
      const pitch = isDeathKey
        ? clampNoteToDirectorPool(rawPitch, beat + i)
        : rawPitch;
      try { triggerInstrument(inst, pitch, when, 'master', {}, vol * defVolumeMult); } catch {}
    }
    swarmSoundEventState.played[key] = true;
  }
}

function withDamageSoundStage(stageIndex, fn) {
  const prev = activeDamageSoundStageIndex;
  activeDamageSoundStageIndex = Number.isFinite(stageIndex) ? Math.trunc(stageIndex) : null;
  try { return fn?.(); } finally { activeDamageSoundStageIndex = prev; }
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
      <div class="beat-swarm-spawn-health-debug" aria-hidden="true"></div>
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
  spawnHealthDebugEl = overlayEl.querySelector('.beat-swarm-spawn-health-debug');
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
  updateSpawnHealthDebugUi();

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
  if (!gameplayPaused && weaponSubBoardState.open) {
    try {
      if (window.__ArtInternal?.isActive?.()) window.__ArtInternal?.exit?.();
    } catch {}
    closeWeaponSubBoardEditor({ keepUi: true });
  }
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
    renderPauseWeaponUi();
    if (weaponSubBoardState.open) setPauseScreenSubBoardHidden(true);
  } else {
    teardownWeaponTuneToyEditor();
    stagePickerState.open = false;
    stagePickerState.slotIndex = -1;
    stagePickerState.stageIndex = -1;
    tuneEditorState.open = false;
    tuneEditorState.slotIndex = -1;
    tuneEditorState.beatTimer = 0;
    tuneEditorState.playheadStep = 0;
    stopComponentLivePreviews();
  }
}

function playSwarmSoundEventImmediate(eventKey, volume = 1, noteName = null) {
  const key = String(eventKey || '').trim();
  if (!SWARM_SOUND_EVENTS[key]) return;
  const vol = Math.max(0.001, Math.min(1, Number(volume) || 0));
  const def = SWARM_SOUND_EVENTS[key];
  const inst = resolveSwarmSoundInstrumentId(key);
  const note = normalizeSwarmNoteName(noteName) || String(def?.note || getRandomSwarmPentatonicNote());
  try { triggerInstrument(inst, note, undefined, 'master', {}, vol); } catch {}
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
  pausePreview.secondsSinceHit = 0;
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
    damageScale: Math.max(0.05, Number(context?.damageScale) || 1),
    nextStages: sanitizeWeaponStages(nextStages),
    context: {
      weaponSlotIndex: slotIndex,
      stageIndex,
      damageScale: Math.max(0.05, Number(context?.damageScale) || 1),
      forcedNoteName: normalizeSwarmNoteName(context?.forcedNoteName) || null,
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
          if ((dx * dx + dy * dy) <= ir2) damageEnemy(e, HELPER_IMPACT_DAMAGE * dt * 8 * Math.max(0.05, Number(h.damageScale) || 1));
        }
        const s = worldToScreen({ x: p.x, y: p.y });
        if (p.el && s && Number.isFinite(s.x) && Number.isFinite(s.y)) p.el.style.transform = `translate(${s.x}px, ${s.y}px)`;
      }
    } else {
      for (let j = enemies.length - 1; j >= 0; j--) {
        const e = enemies[j];
        const dx = e.wx - h.anchorX;
        const dy = e.wy - h.anchorY;
        if ((dx * dx + dy * dy) <= ir2) damageEnemy(e, HELPER_IMPACT_DAMAGE * dt * 7 * Math.max(0.05, Number(h.damageScale) || 1));
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
  const damageScale = Math.max(0.05, Number(helperObj?.context?.damageScale) || Number(helperObj?.damageScale) || 1);
  const forcedNoteName = normalizeSwarmNoteName(helperObj?.context?.forcedNoteName) || null;
  const nearest = getNearestEnemy(originWorld.x, originWorld.y);
  if (!stages.length) {
    const dir = nearest
      ? normalizeDir(nearest.wx - originWorld.x, nearest.wy - originWorld.y)
      : getShipFacingDirWorld();
    spawnProjectileFromDirection(originWorld, dir.x, dir.y, 2 * damageScale, null, null);
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
        damageScale,
        forcedNoteName,
      }, null);
    }
    const dir = nearest
      ? normalizeDir(nearest.wx - originWorld.x, nearest.wy - originWorld.y)
      : getShipFacingDirWorld();
    spawnProjectileFromDirection(originWorld, dir.x, dir.y, 2 * damageScale, null, null);
    return;
  }
  triggerWeaponStage(first, originWorld, beatIndex, rest, {
    origin: originWorld,
    impactPoint: originWorld,
    weaponSlotIndex: slotIndex,
    stageIndex: baseStageIndex + 1,
    damageScale,
    forcedNoteName,
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
  const minX = pausePreview.width * 0.62;
  const maxX = pausePreview.width * 0.92;
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
  nudgePausePreviewEnemiesIntoAction(true);
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

function getPausePreviewNearestEnemies(x, y, count = 1, excludeEnemy = null) {
  const scored = pausePreview.enemies
    .filter((e) => !excludeEnemy || e !== excludeEnemy)
    .map((e) => {
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
  pausePreview.secondsSinceHit = 0;
  enemy.hp -= Math.max(0, Number(amount) || 0);
  pulseHitFlash(enemy.el);
  if (enemy.hp <= 0) {
    removePausePreviewEnemy(enemy);
    return true;
  }
  return false;
}

function previewSelectionContainsBoomerang() {
  const indices = Number.isInteger(previewSelectedWeaponSlotIndex)
    ? [previewSelectedWeaponSlotIndex]
    : weaponLoadout.map((_, i) => i);
  for (const slotIndex of indices) {
    const stages = sanitizeWeaponStages(weaponLoadout?.[slotIndex]?.stages);
    for (const st of stages) {
      if (String(st?.archetype || '') === 'projectile' && String(st?.variant || '') === 'boomerang') return true;
    }
  }
  return false;
}

function previewSelectionStartsWithExplosion() {
  const indices = Number.isInteger(previewSelectedWeaponSlotIndex)
    ? [previewSelectedWeaponSlotIndex]
    : weaponLoadout.map((_, i) => i);
  for (const slotIndex of indices) {
    const stages = sanitizeWeaponStages(weaponLoadout?.[slotIndex]?.stages);
    const first = stages[0] || null;
    if (String(first?.archetype || '') === 'aoe' && String(first?.variant || '') === 'explosion') return true;
  }
  return false;
}

function ensurePausePreviewExplosionBiasEnemy() {
  if (!previewSelectionStartsWithExplosion()) return;
  if (!pausePreview.enemies.length) return;
  const cx = Number(pausePreview.ship.x) || 0;
  const cy = Number(pausePreview.ship.y) || 0;
  const biasRadius = Math.max(8, PREVIEW_EXPLOSION_RADIUS * 0.9);
  const r2 = biasRadius * biasRadius;
  for (const e of pausePreview.enemies) {
    const dx = (Number(e.x) || 0) - cx;
    const dy = (Number(e.y) || 0) - cy;
    if ((dx * dx + dy * dy) <= r2) return;
  }
  const target = pausePreview.enemies[pausePreview.enemies.length - 1] || pausePreview.enemies[0];
  if (!target) return;
  const minX = 32;
  const maxX = Math.max(minX + 12, (Number(pausePreview.width) || 0) - 32);
  const minY = 26;
  const maxY = Math.max(minY + 12, (Number(pausePreview.height) || 0) - 26);
  const ang = randRange(0, Math.PI * 2);
  const radius = randRange(Math.max(6, PREVIEW_EXPLOSION_RADIUS * 0.2), biasRadius);
  target.x = Math.min(maxX, Math.max(minX, cx + (Math.cos(ang) * radius)));
  target.y = Math.min(maxY, Math.max(minY, cy + (Math.sin(ang) * radius)));
}

function nudgePausePreviewEnemiesIntoAction(force = false) {
  if (!pausePreview.enemies.length) return;
  if (!force && (Number(pausePreview.secondsSinceHit) || 0) < PREVIEW_NO_HIT_REPOSITION_SECONDS) return;

  const shipX = Number(pausePreview.ship.x) || 0;
  const shipY = Number(pausePreview.ship.y) || 0;
  const minX = 32;
  const maxX = Math.max(minX + 12, (Number(pausePreview.width) || 0) - 32);
  const minY = 26;
  const maxY = Math.max(minY + 12, (Number(pausePreview.height) || 0) - 26);

  const nearCount = Math.min(3, pausePreview.enemies.length);
  const farCount = pausePreview.enemies.length - nearCount;
  const boomerangLayout = previewSelectionContainsBoomerang();
  const nearCenterX = Math.min(maxX, Math.max(minX, shipX + (boomerangLayout ? 98 : 74)));
  const nearCenterY = Math.min(maxY, Math.max(minY, shipY));
  const farMinX = Math.min(maxX, Math.max(minX, shipX + Math.max(150, (Number(pausePreview.width) || 0) * 0.34)));
  const nearRadiusMin = boomerangLayout ? 56 : 24;
  const nearRadiusMax = boomerangLayout ? 88 : 54;

  // Full reshuffle: keep a small cluster close to ship and spread the rest farther out.
  for (let i = 0; i < nearCount; i++) {
    const e = pausePreview.enemies[i];
    const ang = randRange(0, Math.PI * 2);
    const radius = randRange(nearRadiusMin, nearRadiusMax);
    e.x = Math.min(maxX, Math.max(minX, nearCenterX + (Math.cos(ang) * radius)));
    e.y = Math.min(maxY, Math.max(minY, nearCenterY + (Math.sin(ang) * radius)));
  }
  for (let i = 0; i < farCount; i++) {
    const e = pausePreview.enemies[nearCount + i];
    e.x = randRange(farMinX, maxX);
    e.y = randRange(minY, maxY);
  }
  ensurePausePreviewExplosionBiasEnemy();
  pausePreview.secondsSinceHit = 0;
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
      sourceEnemy: context?.sourceEnemy || null,
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

function addPausePreviewLaser(from, to, sourceEnemy = null, targetEnemy = null) {
  if (!pausePreviewSceneEl) return;
  const el = document.createElement('div');
  el.className = 'beat-swarm-preview-fx-laser';
  pausePreviewSceneEl.appendChild(el);
  pausePreview.effects.push({
    kind: 'laser',
    ttl: PREVIEW_LASER_TTL,
    from: { x: from.x, y: from.y },
    to: { x: to.x, y: to.y },
    sourceEnemy: sourceEnemy || null,
    targetEnemy: targetEnemy || null,
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
    sourceEnemy: null,
    sourceGoneTtl: null,
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
    chainDamageScale: Math.max(0.05, Number(chainContext?.damageScale) || 1),
    nextStages: sanitizeWeaponStages(nextStages),
    nextBeatIndex: Number.isFinite(nextBeatIndex) ? Math.max(0, Math.trunc(nextBeatIndex)) : null,
    ignoreEnemy: chainContext?.sourceEnemy || null,
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
  el.className = 'beat-swarm-preview-projectile is-boomerang';
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
    chainDamageScale: Math.max(0.05, Number(chainContext?.damageScale) || 1),
    nextStages: sanitizeWeaponStages(nextStages),
    nextBeatIndex: Number.isFinite(nextBeatIndex) ? Math.max(0, Math.trunc(nextBeatIndex)) : null,
    ignoreEnemy: chainContext?.sourceEnemy || null,
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
    chainDamageScale: Math.max(0.05, Number(chainContext?.damageScale) || 1),
    nextStages: sanitizeWeaponStages(nextStages),
    nextBeatIndex: Number.isFinite(nextBeatIndex) ? Math.max(0, Math.trunc(nextBeatIndex)) : null,
    ignoreEnemy: chainContext?.sourceEnemy || null,
    el,
  });
  return true;
}

function applyPausePreviewAoeAt(point, variant = 'explosion', beatIndex = 0, avoidEnemy = null) {
  const isDot = variant === 'dot-area';
  addPausePreviewExplosion(point, PREVIEW_EXPLOSION_RADIUS, isDot ? (getPausePreviewBeatLen() * 2) : PREVIEW_EXPLOSION_TTL);
  const r2 = PREVIEW_EXPLOSION_RADIUS * PREVIEW_EXPLOSION_RADIUS;
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
    if (d2 <= r2) damagePausePreviewEnemy(e, isDot ? 0.5 : 1);
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
  const selected = hitCandidates.find((c) => c.enemy !== avoidEnemy) || hitCandidates[0] || null;
  if (!selected?.enemy) return null;
  return {
    point: selected.point,
    enemy: selected.enemy,
  };
}

function triggerPausePreviewWeaponStage(stage, origin, beatIndex, remainingStages = [], context = null) {
  if (!stage || !origin) return;
  const archetype = stage.archetype;
  const variant = stage.variant;
  const continuation = sanitizeWeaponStages(remainingStages);
  const slotIndex = Number.isFinite(context?.weaponSlotIndex) ? Math.trunc(context.weaponSlotIndex) : -1;
  const stageIndex = Number.isFinite(context?.stageIndex) ? Math.trunc(context.stageIndex) : 0;
  const nextCtx = { weaponSlotIndex: slotIndex, stageIndex: stageIndex + 1 };
  const sourceEnemy = context?.sourceEnemy || null;
  const nearest = getPausePreviewNearestEnemies(origin.x, origin.y, 1, sourceEnemy)[0] || null;
  if (archetype === 'projectile') {
    const baseDir = nearest
      ? normalizeDir(nearest.x - origin.x, nearest.y - origin.y)
      : { x: 1, y: 0 };
    const spawnOrigin = context?.sourceEnemy
      ? {
        x: origin.x + (baseDir.x * PREVIEW_PROJECTILE_CHAIN_SPAWN_OFFSET),
        y: origin.y + (baseDir.y * PREVIEW_PROJECTILE_CHAIN_SPAWN_OFFSET),
      }
      : origin;
    if (variant === 'homing-missile') {
      spawnPausePreviewHomingMissile(spawnOrigin, 2, continuation, beatIndex + 1, nextCtx);
      return;
    }
    if (variant === 'boomerang') {
      spawnPausePreviewBoomerangProjectile(spawnOrigin, baseDir.x, baseDir.y, 2, continuation, beatIndex + 1, nextCtx);
      return;
    }
    if (variant === 'split-shot') {
      const baseAngle = Math.atan2(baseDir.y, baseDir.x);
      const angles = [baseAngle, baseAngle - PREVIEW_PROJECTILE_SPLIT_ANGLE_RAD, baseAngle + PREVIEW_PROJECTILE_SPLIT_ANGLE_RAD];
      for (const ang of angles) {
        spawnPausePreviewProjectileFromDirection(spawnOrigin, Math.cos(ang), Math.sin(ang), 2, continuation, beatIndex + 1, nextCtx);
      }
      return;
    }
    if (nearest) {
      spawnPausePreviewProjectile(spawnOrigin, nearest, 2, continuation, beatIndex + 1, nextCtx);
    } else {
      spawnPausePreviewProjectileFromDirection(spawnOrigin, baseDir.x, baseDir.y, 2, continuation, beatIndex + 1, nextCtx);
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
        addPausePreviewLaser(origin, to, sourceEnemy, null);
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
      const beamFx = pausePreview.effects[pausePreview.effects.length - 1];
      if (beamFx && beamFx.kind === 'beam') beamFx.sourceEnemy = sourceEnemy;
      if (continuation.length) {
        const firstNext = continuation[0];
        const restNext = continuation.slice(1);
        if (firstNext?.archetype === 'laser' && firstNext?.variant === 'beam') {
          triggerPausePreviewWeaponStage(firstNext, { x: nearest.x, y: nearest.y }, beatIndex, restNext, {
            origin: context?.origin || origin,
            impactPoint: { x: nearest.x, y: nearest.y },
            weaponSlotIndex: slotIndex,
            stageIndex: stageIndex + 1,
            impactEnemy: nearest,
            sourceEnemy: nearest,
          });
        } else {
          queuePausePreviewChain(beatIndex + 1, continuation, {
            origin,
            impactPoint: { x: nearest.x, y: nearest.y },
            weaponSlotIndex: slotIndex,
            stageIndex: stageIndex + 1,
            impactEnemy: nearest,
            sourceEnemy: nearest,
          });
        }
      }
      return;
    }
    if (!nearest) {
      const to = { x: origin.x + 300, y: origin.y };
      addPausePreviewLaser(origin, to, sourceEnemy, null);
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
    addPausePreviewLaser(origin, { x: nearest.x, y: nearest.y }, sourceEnemy, nearest);
    damagePausePreviewEnemy(nearest, 2);
    if (continuation.length) {
      const firstNext = continuation[0];
      const restNext = continuation.slice(1);
      if (firstNext?.archetype === 'laser' && firstNext?.variant === 'hitscan') {
        triggerPausePreviewWeaponStage(firstNext, { x: nearest.x, y: nearest.y }, beatIndex, restNext, {
          origin: context?.origin || origin,
          impactPoint: { x: nearest.x, y: nearest.y },
          weaponSlotIndex: slotIndex,
          stageIndex: stageIndex + 1,
          impactEnemy: nearest,
          sourceEnemy: nearest,
        });
      } else {
        queuePausePreviewChain(beatIndex + 1, continuation, {
          origin,
          impactPoint: { x: nearest.x, y: nearest.y },
          weaponSlotIndex: slotIndex,
          stageIndex: stageIndex + 1,
          impactEnemy: nearest,
          sourceEnemy: nearest,
        });
      }
    }
    return;
  }
  if (archetype === 'aoe') {
    const firstHit = applyPausePreviewAoeAt(origin, variant, beatIndex, context?.sourceEnemy || null);
    if (continuation.length) {
      if (variant === 'explosion' && firstHit?.point) {
        const firstNext = continuation[0];
        const restNext = continuation.slice(1);
        const nextOrigin = firstHit.point;
        triggerPausePreviewWeaponStage(firstNext, nextOrigin, beatIndex, restNext, {
          origin: context?.origin || origin,
          impactPoint: nextOrigin,
          weaponSlotIndex: slotIndex,
          stageIndex: stageIndex + 1,
          impactEnemy: firstHit.enemy || null,
          sourceEnemy: firstHit.enemy || null,
        });
      } else if (variant !== 'explosion') {
        queuePausePreviewChain(beatIndex + 1, continuation, {
          origin: context?.origin || origin,
          impactPoint: origin,
          weaponSlotIndex: slotIndex,
          stageIndex: stageIndex + 1,
        });
      }
    }
  }
}

function updateEnemySpawnHealthScaling() {
  const base = Math.max(1, Number(difficultyConfig.enemyHealth) || 1);
  const ramp = Math.max(0, Number(enemyHealthRampSeconds) || 0) * Math.max(0, Number(ENEMY_HEALTH_RAMP_PER_SECOND) || 0);
  currentEnemySpawnMaxHp = Math.max(1, base + ramp);
  return currentEnemySpawnMaxHp;
}

function updateSpawnHealthDebugUi() {
  if (!spawnHealthDebugEl) return;
  const hp = Math.max(1, Number(currentEnemySpawnMaxHp) || 1);
  const composer = getComposerDirective();
  const section = String(composer.sectionId || 'default');
  spawnHealthDebugEl.textContent = `Enemy Spawn Max HP: ${hp.toFixed(2)} | Composer: ${section} | Intensity: ${Number(composer.intensity || 1).toFixed(2)} | DrumLoops: ${composer.drumLoops} | DrawSnakes: ${composer.drawSnakes}`;
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
  const hitRadius = PREVIEW_PROJECTILE_HIT_RADIUS;
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
      const nearestNow = getPausePreviewNearestEnemies(p.x, p.y, 1, p.ignoreEnemy || null)[0] || null;
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
        if (!target || !pausePreview.enemies.includes(target)) target = getPausePreviewNearestEnemies(p.x, p.y, 1, p.ignoreEnemy || null)[0] || null;
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
        damagePausePreviewEnemy(e, p.damage);
        if (Array.isArray(p.nextStages) && p.nextStages.length) {
          const stages = sanitizeWeaponStages(p.nextStages);
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
            triggerPausePreviewWeaponStage(first, hitPoint, pausePreview.beatIndex, rest, chainCtx);
          } else {
            queuePausePreviewChain(nextBeat, stages, chainCtx);
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
      const deg = ((Number(p.boomTheta) || 0) * (180 / Math.PI) * PROJECTILE_BOOMERANG_SPIN_MULT) + 180;
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
          target = getPausePreviewNearestEnemies(fx.from?.x || 0, fx.from?.y || 0, 1, fx.sourceEnemy || null)[0] || null;
          fx.targetEnemy = target || null;
        }
        if (target) {
          fx.to = { x: target.x, y: target.y };
          damagePausePreviewEnemy(target, Math.max(0, Number(fx.damagePerSec) || 0) * dt);
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
  ensurePausePreviewExplosionBiasEnemy();
  pausePreview.secondsSinceHit += Math.max(0.001, Number(dt) || 0.016);
  nudgePausePreviewEnemiesIntoAction(false);
  updatePausePreviewHelpers(dt);
  updatePausePreviewProjectilesAndEffects(dt);
  for (const e of pausePreview.enemies) {
    e.el.style.transform = `translate(${e.x.toFixed(2)}px, ${e.y.toFixed(2)}px)`;
  }
  if (pausePreview.ship.el) {
    pausePreview.ship.el.style.transform = `translate(${pausePreview.ship.x.toFixed(2)}px, ${pausePreview.ship.y.toFixed(2)}px)`;
  }
  updateWeaponTuneEditor(dt);
}

function syncTuneEditorPlayheadUi() {
  if (!pauseScreenEl || !tuneEditorState.open) return;
  const step = Math.max(0, Math.min(WEAPON_TUNE_STEPS - 1, Math.trunc(Number(tuneEditorState.playheadStep) || 0)));
  const readout = pauseScreenEl.querySelector('.beat-swarm-tune-step-readout');
  if (readout) readout.textContent = `Step ${step + 1}/${WEAPON_TUNE_STEPS}`;
}

function applyTuneFromDrawgridState(slotIndex, rawState) {
  if (!(slotIndex >= 0 && slotIndex < weaponLoadout.length)) return;
  const st = rawState && typeof rawState === 'object' ? rawState : null;
  const tune = sanitizeWeaponTune({
    steps: Math.max(1, Math.trunc(Number(st?.steps) || WEAPON_TUNE_STEPS)),
    nodes: {
      active: Array.isArray(st?.nodes?.active) ? st.nodes.active : Array.isArray(st?.active) ? st.active : undefined,
      list: Array.isArray(st?.nodes?.list) ? st.nodes.list : Array.isArray(st?.list) ? st.list : undefined,
      disabled: Array.isArray(st?.nodes?.disabled) ? st.nodes.disabled : Array.isArray(st?.disabled) ? st.disabled : undefined,
    },
  });
  weaponLoadout[slotIndex].tune = tune;
  if (!Array.isArray(weaponLoadout[slotIndex].tuneChain) || !weaponLoadout[slotIndex].tuneChain.length) {
    weaponLoadout[slotIndex].tuneChain = [tune, sanitizeWeaponTune(tune)];
  } else {
    weaponLoadout[slotIndex].tuneChain[0] = tune;
    while (weaponLoadout[slotIndex].tuneChain.length < WEAPON_TUNE_CHAIN_LENGTH) {
      weaponLoadout[slotIndex].tuneChain.push(sanitizeWeaponTune(tune));
    }
    if (weaponLoadout[slotIndex].tuneChain.length > WEAPON_TUNE_CHAIN_LENGTH) {
      weaponLoadout[slotIndex].tuneChain.length = WEAPON_TUNE_CHAIN_LENGTH;
    }
  }
}

function getWeaponSubBoardSlotState(slotIndex) {
  const idx = Math.max(0, Math.min(MAX_WEAPON_SLOTS - 1, Math.trunc(Number(slotIndex) || 0)));
  return weaponSubBoardState.slotBoards[idx];
}

function getWeaponSubBoardArtToyId(slotIndex) {
  const slotState = getWeaponSubBoardSlotState(slotIndex);
  const id = String(slotState?.artToyId || '').trim();
  return id || '';
}

function hasWeaponSubBoard(slotIndex) {
  const artToyId = getWeaponSubBoardArtToyId(slotIndex);
  return artToyId.length > 0;
}

function setWeaponSubBoardPanelPlayback(slotIndex, playing) {
  const idx = Math.max(0, Math.min(MAX_WEAPON_SLOTS - 1, Math.trunc(Number(slotIndex) || 0)));
  const artToyId = getWeaponSubBoardArtToyId(idx);
  if (!artToyId) return;
  const panels = Array.from(document.querySelectorAll(`.toy-panel[data-toy="drawgrid"][data-art-owner-id="${CSS.escape(artToyId)}"]`));
  for (const panel of panels) {
    if (!(panel instanceof HTMLElement)) continue;
    try { panel.dataset.chainActive = playing ? 'true' : 'false'; } catch {}
    try { panel.dataset.forcePlayheadVisible = playing ? '1' : '0'; } catch {}
    try { panel.dispatchEvent(new CustomEvent('toy:visibility', { bubbles: true, detail: { visible: !!playing } })); } catch {}
  }
}

function ensureWeaponSubBoardDrawgridChain(slotIndex, count = 2) {
  const idx = Math.max(0, Math.min(MAX_WEAPON_SLOTS - 1, Math.trunc(Number(slotIndex) || 0)));
  const wanted = Math.max(1, Math.trunc(Number(count) || 1));
  const artToyId = getWeaponSubBoardArtToyId(idx);
  if (!artToyId) return [];
  const worldEl = document.getElementById('board') || document.getElementById('internal-board-world');
  let panels = Array.from(document.querySelectorAll(`.toy-panel[data-toy="drawgrid"][data-art-owner-id="${CSS.escape(artToyId)}"]`));
  if (panels.length < wanted && typeof window.MusicToyFactory?.create === 'function') {
    const baseX = (() => {
      const p = panels[0];
      if (p instanceof HTMLElement) return Number.parseFloat(p.style.left || '0') || 0;
      return Number(getSceneStartWorld()?.x) || 0;
    })();
    const baseY = (() => {
      const p = panels[0];
      if (p instanceof HTMLElement) return Number.parseFloat(p.style.top || '0') || 0;
      return Number(getSceneStartWorld()?.y) || 0;
    })();
    for (let i = panels.length; i < wanted; i++) {
      try {
        const p = window.MusicToyFactory.create('drawgrid', {
          centerX: baseX + i * 540,
          centerY: baseY,
          autoCenter: false,
          allowOffscreen: true,
          skipSpawnPlacement: false,
          containerEl: worldEl || undefined,
          artOwnerId: artToyId,
        });
        if (p instanceof HTMLElement) {
          try { p.classList.remove('art-internal-toy'); } catch {}
          try { p.style.pointerEvents = 'auto'; } catch {}
        }
      } catch {}
    }
    panels = Array.from(document.querySelectorAll(`.toy-panel[data-toy="drawgrid"][data-art-owner-id="${CSS.escape(artToyId)}"]`));
  }
  panels.sort((a, b) => {
    const ax = Number.parseFloat(a?.style?.left || '0') || 0;
    const bx = Number.parseFloat(b?.style?.left || '0') || 0;
    return ax - bx;
  });
  for (let i = 0; i < panels.length; i++) {
    const cur = panels[i];
    const prev = panels[i - 1] || null;
    if (!(cur instanceof HTMLElement)) continue;
    if (!prev) {
      delete cur.dataset.prevToyId;
      delete cur.dataset.chainParent;
    } else {
      cur.dataset.prevToyId = prev.id;
      cur.dataset.chainParent = prev.id;
    }
    if (i >= wanted) continue;
  }
  return panels.slice(0, wanted);
}

function clearWeaponSubBoardBindingsForSlot(slotIndex) {
  const slotState = getWeaponSubBoardSlotState(slotIndex);
  const ids = Array.from(slotState.boundPanelIds || []);
  for (const id of ids) {
    const panel = document.getElementById(id);
    if (!panel) continue;
    const noteHandler = panel.__beatSwarmSubBoardNoteHandler;
    if (typeof noteHandler === 'function') {
      try { panel.removeEventListener('drawgrid:note-fired', noteHandler); } catch {}
    }
    const updateHandler = panel.__beatSwarmSubBoardUpdateHandler;
    if (typeof updateHandler === 'function') {
      try { panel.removeEventListener('drawgrid:update', updateHandler); } catch {}
    }
    const dirtyHandler = panel.__beatSwarmSubBoardDirtyHandler;
    if (typeof dirtyHandler === 'function') {
      try { panel.removeEventListener('drawgrid:node-toggle', dirtyHandler); } catch {}
      try { panel.removeEventListener('drawgrid:node-drag-end', dirtyHandler); } catch {}
      try { panel.removeEventListener('toy-random', dirtyHandler); } catch {}
      try { panel.removeEventListener('toy-random-notes', dirtyHandler); } catch {}
      try { panel.removeEventListener('toy-random-blocks', dirtyHandler); } catch {}
      try { panel.removeEventListener('pointerdown', dirtyHandler); } catch {}
      try { panel.removeEventListener('touchstart', dirtyHandler); } catch {}
    }
    delete panel.__beatSwarmSubBoardSlotIndex;
    delete panel.__beatSwarmSubBoardNoteHandler;
    delete panel.__beatSwarmSubBoardUpdateHandler;
    delete panel.__beatSwarmSubBoardDirtyHandler;
  }
  slotState.boundPanelIds.clear();
}

function clearWeaponSubBoardScheduledTriggersForSlot(slotIndex) {
  const slotState = getWeaponSubBoardSlotState(slotIndex);
  for (const id of Array.from(slotState.scheduledTimeoutIds || [])) {
    try { clearTimeout(id); } catch {}
  }
  slotState.scheduledTimeoutIds.clear();
  slotState.syncTimerId = 0;
}

function scheduleWeaponSubBoardTuneChainSync(slotIndex, delayMs = 32) {
  const idx = Math.max(0, Math.min(MAX_WEAPON_SLOTS - 1, Math.trunc(Number(slotIndex) || 0)));
  const slotState = getWeaponSubBoardSlotState(idx);
  if (slotState.syncTimerId) return;
  const timerId = setTimeout(() => {
    slotState.scheduledTimeoutIds.delete(timerId);
    if (slotState.syncTimerId === timerId) slotState.syncTimerId = 0;
    if (!weaponSubBoardState.open || Math.trunc(Number(weaponSubBoardState.slotIndex) || -1) !== idx) return;
    slotState.sessionDirty = true;
    try { snapshotWeaponSubBoardTuneChain(idx); } catch {}
  }, Math.max(0, Math.trunc(Number(delayMs) || 0)));
  slotState.syncTimerId = timerId;
  slotState.scheduledTimeoutIds.add(timerId);
}

function hideWeaponSubBoardArtAnchor(slotIndex) {
  const artToyId = getWeaponSubBoardArtToyId(slotIndex);
  if (!artToyId) return;
  const sel = `.internal-art-anchor-ghost[data-art-toy-id="${CSS.escape(artToyId)}"]`;
  const ghosts = Array.from(document.querySelectorAll(sel));
  for (const ghost of ghosts) {
    if (!(ghost instanceof HTMLElement)) continue;
    ghost.classList.add('beat-swarm-subboard-hide-anchor');
    ghost.style.display = 'none';
    ghost.style.opacity = '0';
    ghost.style.pointerEvents = 'none';
  }
}

function drawgridStateHasAnyNotes(stateLike) {
  const st = stateLike && typeof stateLike === 'object' ? stateLike : null;
  const active = Array.isArray(st?.nodes?.active) ? st.nodes.active : Array.isArray(st?.active) ? st.active : [];
  const list = Array.isArray(st?.nodes?.list) ? st.nodes.list : Array.isArray(st?.list) ? st.list : [];
  const steps = Math.max(active.length, list.length);
  for (let i = 0; i < steps; i++) {
    if (!active[i]) continue;
    const rows = Array.isArray(list[i]) ? list[i] : [];
    if (rows.length > 0) return true;
  }
  return false;
}

function applyProjectileInstrumentToDrawgridPanel(panel) {
  if (!(panel instanceof HTMLElement)) return;
  const projectileInstrument = resolveSwarmSoundInstrumentId('projectile') || 'tone';
  try { panel.dataset.instrument = projectileInstrument; } catch {}
  try { panel.dataset.instrumentPersisted = '1'; } catch {}
  try { panel.dispatchEvent(new CustomEvent('toy-instrument', { detail: { value: projectileInstrument }, bubbles: true })); } catch {}
  try { panel.dispatchEvent(new CustomEvent('toy:instrument', { detail: { name: projectileInstrument, value: projectileInstrument }, bubbles: true })); } catch {}
}

function buildVisualStrokeFromWeaponTune(tuneLike) {
  const tune = sanitizeWeaponTune(tuneLike);
  const steps = Math.max(1, Math.trunc(Number(tune?.steps) || WEAPON_TUNE_STEPS));
  const noteRows = Math.max(1, Array.isArray(tune?.notes) ? tune.notes.length : DRAWGRID_TUNE_NOTE_PALETTE.length);
  const active = Array.isArray(tune?.active) ? tune.active : [];
  const list = Array.isArray(tune?.list) ? tune.list : [];
  const rowByStep = Array.from({ length: steps }, () => null);
  for (let s = 0; s < steps; s++) {
    if (!active[s]) continue;
    const rows = Array.isArray(list[s]) ? list[s] : [];
    if (!rows.length) continue;
    rowByStep[s] = Math.max(0, Math.min(noteRows - 1, Math.trunc(Number(rows[0]) || 0)));
  }
  const seededSteps = [];
  for (let s = 0; s < steps; s++) if (Number.isFinite(rowByStep[s])) seededSteps.push(s);
  if (!seededSteps.length) return [];
  const leftSeed = Array.from({ length: steps }, () => -1);
  const rightSeed = Array.from({ length: steps }, () => -1);
  let last = -1;
  for (let s = 0; s < steps; s++) {
    if (Number.isFinite(rowByStep[s])) last = s;
    leftSeed[s] = last;
  }
  last = -1;
  for (let s = steps - 1; s >= 0; s--) {
    if (Number.isFinite(rowByStep[s])) last = s;
    rightSeed[s] = last;
  }
  const anchors = [];
  for (let s = 0; s < steps; s++) {
    let row = rowByStep[s];
    if (!Number.isFinite(row)) {
      const l = leftSeed[s];
      const r = rightSeed[s];
      if (l >= 0 && r >= 0 && l !== r) {
        const t = (s - l) / (r - l);
        row = (rowByStep[l] * (1 - t)) + (rowByStep[r] * t);
      } else if (l >= 0) {
        row = rowByStep[l];
      } else if (r >= 0) {
        row = rowByStep[r];
      } else {
        row = Math.max(0, Math.min(noteRows - 1, Math.trunc(noteRows * 0.5)));
      }
    }
    const nx = (steps <= 1) ? 0.5 : (s / (steps - 1));
    const ny = (Math.max(0, Math.min(noteRows - 1, row)) + 0.5) / noteRows;
    anchors.push({ nx, ny });
  }
  if (anchors.length === 1) {
    anchors.unshift({ nx: 0, ny: anchors[0].ny });
    anchors.push({ nx: 1, ny: anchors[0].ny });
  }
  const catmull = (p0, p1, p2, p3, t) => {
    const t2 = t * t;
    const t3 = t2 * t;
    return 0.5 * (
      (2 * p1) +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3
    );
  };
  const ptsN = [];
  const samplesPerSeg = 4;
  for (let i = 0; i < anchors.length - 1; i++) {
    const p0 = anchors[Math.max(0, i - 1)];
    const p1 = anchors[i];
    const p2 = anchors[i + 1];
    const p3 = anchors[Math.min(anchors.length - 1, i + 2)];
    for (let j = 0; j < samplesPerSeg; j++) {
      const t = j / samplesPerSeg;
      const nx = Math.max(0, Math.min(1, catmull(p0.nx, p1.nx, p2.nx, p3.nx, t)));
      const ny = Math.max(0, Math.min(1, catmull(p0.ny, p1.ny, p2.ny, p3.ny, t)));
      ptsN.push({ nx, ny });
    }
  }
  ptsN.push({ nx: anchors[anchors.length - 1].nx, ny: anchors[anchors.length - 1].ny });
  if (ptsN[0]?.nx > 0) ptsN.unshift({ nx: 0, ny: ptsN[0].ny });
  if (ptsN[ptsN.length - 1]?.nx < 1) ptsN.push({ nx: 1, ny: ptsN[ptsN.length - 1].ny });
  return [{
    ptsN,
    isSpecial: true,
  }];
}

function applyWeaponTuneToDrawgridPanel(slotIndex, panel) {
  if (!(panel instanceof HTMLElement)) return false;
  const idx = Math.max(0, Math.min(MAX_WEAPON_SLOTS - 1, Math.trunc(Number(slotIndex) || 0)));
  const chain = getWeaponSlotTuneChain(idx);
  const api = panel.__drawToy;
  if (!api?.setState) return false;
  const tune = sanitizeWeaponTune(chain[0]);
  if (!(countWeaponTuneActiveEvents(tune) > 0)) return false;
  return applyWeaponTuneObjectToDrawgridPanel(tune, panel);
}

function applyWeaponTuneObjectToDrawgridPanel(tuneLike, panel) {
  if (!(panel instanceof HTMLElement)) return false;
  const api = panel.__drawToy;
  if (!api?.setState && !api?.restoreState) return false;
  const tune = sanitizeWeaponTune(tuneLike);
  if (!(countWeaponTuneActiveEvents(tune) > 0)) return false;
  logWeaponTuneFireDebug('subboard-apply-panel-tune', {
    panelId: String(panel?.id || ''),
    signature: getWeaponTuneSignature(tune),
  });
  const payload = {
    steps: tune.steps,
    strokes: buildVisualStrokeFromWeaponTune(tune),
    meta: {
      preserveNodesOverStrokes: true,
    },
    nodes: {
      active: tune.active.slice(),
      list: tune.list.map((col) => (Array.isArray(col) ? col.slice() : [])),
      disabled: tune.disabled.map((col) => (Array.isArray(col) ? col.slice() : [])),
    },
  };
  try {
    if (typeof api.setState === 'function') api.setState(payload);
    else api.restoreState(payload);
    return true;
  } catch {
    return false;
  }
}

function panelDrawgridSignature(panel) {
  if (!(panel instanceof HTMLElement)) return '';
  try {
    const st = panel.__drawToy?.getState?.();
    if (!st || typeof st !== 'object') return '';
    return getWeaponTuneSignature(sanitizeWeaponTune(st));
  } catch {
    return '';
  }
}

function forceApplyOpenTuneSnapshotToSubBoard(slotIndex) {
  const idx = Math.max(0, Math.min(MAX_WEAPON_SLOTS - 1, Math.trunc(Number(slotIndex) || 0)));
  const slotState = getWeaponSubBoardSlotState(idx);
  const chain = Array.isArray(slotState?.openTuneChainSnapshot) && slotState.openTuneChainSnapshot.length
    ? sanitizeWeaponTuneChain(slotState.openTuneChainSnapshot)
    : getWeaponSlotTuneChain(idx);
  if (!chain.length) return;
  logWeaponTuneFireDebug('subboard-force-apply-open-snapshot', {
    slotIndex: idx,
    signature: getWeaponTuneSignature(chain[0]),
  });
  const artToyId = getWeaponSubBoardArtToyId(idx);
  if (!artToyId) return;
  const panels = ensureWeaponSubBoardDrawgridChain(idx, WEAPON_TUNE_CHAIN_LENGTH);
  for (let i = 0; i < panels.length; i++) {
    const panel = panels[i];
    const snap = sanitizeWeaponTune(chain[Math.min(i, chain.length - 1)]);
    if (!(countWeaponTuneActiveEvents(snap) > 0)) continue;
    applyProjectileInstrumentToDrawgridPanel(panel);
    applyWeaponTuneObjectToDrawgridPanel(snap, panel);
  }
}

function getWeaponSubBoardSlotIndexByArtToyId(artToyId) {
  const target = String(artToyId || '').trim();
  if (!target) return -1;
  for (let i = 0; i < MAX_WEAPON_SLOTS; i++) {
    if (getWeaponSubBoardArtToyId(i) === target) return i;
  }
  return -1;
}

function getWeaponSubBoardPendingDrawgridState(artToyId, panelId = '') {
  const idx = getWeaponSubBoardSlotIndexByArtToyId(artToyId);
  if (idx < 0) return null;
  const slotState = getWeaponSubBoardSlotState(idx);
  const panelIdNorm = String(panelId || '').trim();
  const snapshotChain = Array.isArray(slotState?.openTuneChainSnapshot) && slotState.openTuneChainSnapshot.length
    ? sanitizeWeaponTuneChain(slotState.openTuneChainSnapshot)
    : [];
  const snapshotTune = slotState?.openTuneSnapshot ? sanitizeWeaponTune(slotState.openTuneSnapshot) : null;
  const runtimeTune = sanitizeWeaponTune(weaponLoadout[idx]?.tune);
  const runtimeChain = getWeaponSlotTuneChain(idx).map((t) => sanitizeWeaponTune(t));
  const chain = snapshotChain.length ? snapshotChain : runtimeChain;
  let panelIndex = 0;
  try {
    if (panelIdNorm) {
      const panels = Array.from(document.querySelectorAll(`.toy-panel[data-toy="drawgrid"][data-art-owner-id="${CSS.escape(artToyId)}"]`));
      panels.sort((a, b) => {
        const ax = Number.parseFloat(a?.style?.left || '0') || 0;
        const bx = Number.parseFloat(b?.style?.left || '0') || 0;
        return ax - bx;
      });
      const found = panels.findIndex((p) => String(p?.id || '') === panelIdNorm);
      if (found >= 0) panelIndex = found;
    }
  } catch {}
  const chainTune = sanitizeWeaponTune(chain[Math.min(panelIndex, Math.max(0, chain.length - 1))] || runtimeTune);
  let source = snapshotChain.length ? 'snapshot-chain' : 'runtime-chain';
  let tune = chainTune;
  if (!(countWeaponTuneActiveEvents(tune) > 0) && snapshotTune && countWeaponTuneActiveEvents(snapshotTune) > 0) {
    source = 'snapshot-primary';
    tune = snapshotTune;
  } else if (!(countWeaponTuneActiveEvents(tune) > 0) && countWeaponTuneActiveEvents(runtimeTune) > 0) {
    source = 'runtime-primary';
    tune = runtimeTune;
  }
  if (!(countWeaponTuneActiveEvents(tune) > 0)) return null;
  logWeaponTuneFireDebug('subboard-pending-state', {
    slotIndex: idx,
    panelId: panelIdNorm || null,
    panelIndex,
    source,
    signature: getWeaponTuneSignature(tune),
    runtimeSignature: getWeaponTuneSignature(runtimeTune),
    chainSignature: getWeaponTuneSignature(chainTune),
    snapshotSignature: snapshotTune ? getWeaponTuneSignature(snapshotTune) : '',
  });
  return {
    steps: tune.steps,
    strokes: buildVisualStrokeFromWeaponTune(tune),
    meta: {
      preserveNodesOverStrokes: true,
    },
    nodes: {
      active: tune.active.slice(),
      list: tune.list.map((col) => (Array.isArray(col) ? col.slice() : [])),
      disabled: tune.disabled.map((col) => (Array.isArray(col) ? col.slice() : [])),
    },
  };
}

function maybeSeedStarterDrawgridPattern(slotIndex) {
  const idx = Math.max(0, Math.min(MAX_WEAPON_SLOTS - 1, Math.trunc(Number(slotIndex) || 0)));
  const weaponHasTune = hasWeaponTuneContent(idx);
  const slotState = getWeaponSubBoardSlotState(idx);
  if (slotState.seededStarterPattern || slotState.seedingStarterPattern) return;
  const artToyId = getWeaponSubBoardArtToyId(idx);
  if (!artToyId) return;
  const panels = Array.from(document.querySelectorAll(`.toy-panel[data-toy="drawgrid"][data-art-owner-id="${CSS.escape(artToyId)}"]`));
  if (!panels.length) return;
  panels.sort((a, b) => {
    const ax = Number.parseFloat(a?.style?.left || '0') || 0;
    const bx = Number.parseFloat(b?.style?.left || '0') || 0;
    return ax - bx;
  });
  const panel = panels[0];
  if (!(panel instanceof HTMLElement)) return;
  const ownerId = String(panel?.dataset?.artOwnerId || '').trim();
  const ownerPanel = ownerId ? document.getElementById(ownerId) : null;
  const isBeatSwarmSubboard = String(ownerPanel?.dataset?.beatSwarmSubboard || '') === '1';
  if (isBeatSwarmSubboard && weaponHasTune) {
    // Beat Swarm subboard gets deterministic pending/open-snapshot hydration; avoid late reseed writes.
    slotState.seededStarterPattern = true;
    slotState.seedingStarterPattern = false;
    logWeaponTuneFireDebug('subboard-seed-skip-has-tune', { slotIndex: idx });
    return;
  }
  applyProjectileInstrumentToDrawgridPanel(panel);
  const hasNotes = (() => {
    try {
      const st = panel.__drawToy?.getState?.();
      return drawgridStateHasAnyNotes(st);
    } catch {
      return false;
    }
  })();
  if (hasNotes) {
    slotState.seededStarterPattern = true;
    slotState.seedingStarterPattern = false;
    return;
  }
  slotState.seedingStarterPattern = true;
  let hydratedFromWeapon = weaponHasTune ? applyWeaponTuneToDrawgridPanel(idx, panel) : false;
  const tryFinalize = (attempt = 0) => {
    if (weaponHasTune && !hydratedFromWeapon) {
      // Keep hydrating until DrawGrid API is attached and accepts the weapon tune.
      hydratedFromWeapon = !!applyWeaponTuneToDrawgridPanel(idx, panel);
    }
    const st = panel.__drawToy?.getState?.();
    const ready = drawgridStateHasAnyNotes(st);
    if (ready && (!weaponHasTune || hydratedFromWeapon)) {
      slotState.seededStarterPattern = true;
      slotState.seedingStarterPattern = false;
      return;
    }
    if (attempt >= 30) {
      slotState.seedingStarterPattern = false;
      return;
    }
    const timerId = setTimeout(() => {
      slotState.scheduledTimeoutIds.delete(timerId);
      tryFinalize(attempt + 1);
    }, 40);
    slotState.scheduledTimeoutIds.add(timerId);
  };
  tryFinalize(0);
}

function ensureWeaponSubBoardArtToy(slotIndex) {
  const slotState = getWeaponSubBoardSlotState(slotIndex);
  const existingId = String(slotState.artToyId || '').trim();
  const existing = existingId ? document.getElementById(existingId) : null;
  if (existing && existing.classList?.contains?.('art-toy-panel')) return existingId;
  const center = getSceneStartWorld();
  const artPanel = createArtToyAt('flashCircle', {
    centerX: Number(center?.x) || 0,
    centerY: Number(center?.y) || 0,
    autoCenter: false,
    showControlsOnSpawn: false,
  });
  if (!(artPanel instanceof HTMLElement)) return '';
  try { artPanel.classList.add('beat-swarm-weapon-subboard-anchor'); } catch {}
  try { artPanel.dataset.beatSwarmWeaponSlot = String(slotIndex); } catch {}
  try { artPanel.dataset.beatSwarmSubboard = '1'; } catch {}
  try { artPanel.dataset.pendingRandMusic = '0'; } catch {}
  try { artPanel.dataset.pendingRandAll = '0'; } catch {}
  slotState.seededStarterPattern = false;
  slotState.seedingStarterPattern = false;
  slotState.artToyId = String(artPanel.id || '');
  return slotState.artToyId;
}

function weaponSubBoardRowToNoteName(rowIndex) {
  const row = Math.trunc(Number(rowIndex));
  if (!(row >= 0 && row < DRAWGRID_TUNE_NOTE_PALETTE.length)) return getRandomSwarmPentatonicNote();
  return normalizeSwarmNoteName(DRAWGRID_TUNE_NOTE_PALETTE[row]) || getRandomSwarmPentatonicNote();
}

function snapshotWeaponSubBoardTuneChain(slotIndex) {
  const idx = Math.max(0, Math.min(MAX_WEAPON_SLOTS - 1, Math.trunc(Number(slotIndex) || 0)));
  const artToyId = getWeaponSubBoardArtToyId(idx);
  if (!artToyId) return;
  const panels = Array.from(document.querySelectorAll(`.toy-panel[data-toy="drawgrid"][data-art-owner-id="${CSS.escape(artToyId)}"]`));
  if (!panels.length) return;
  panels.sort((a, b) => {
    const ax = Number.parseFloat(a?.style?.left || '0') || 0;
    const bx = Number.parseFloat(b?.style?.left || '0') || 0;
    return ax - bx;
  });
  const chain = [];
  for (const panel of panels) {
    try {
      const st = panel?.__drawToy?.getState?.();
      if (!st || typeof st !== 'object') continue;
      chain.push(sanitizeWeaponTune(st));
    } catch {}
  }
  if (!chain.length) return;
  let nextEvents = 0;
  for (const tune of chain) nextEvents += countWeaponTuneActiveEvents(tune);
  const previousHadContent = hasWeaponTuneContent(idx);
  if (nextEvents <= 0 && previousHadContent) {
    logWeaponTuneFireDebug('snapshot-skip-empty', { slotIndex: idx, chainPanels: chain.length });
    return;
  }
  logWeaponTuneFireDebug('snapshot-apply', { slotIndex: idx, chainPanels: chain.length, activeEvents: nextEvents });
  logWeaponTuneFireDebug('snapshot-primary-signature', {
    slotIndex: idx,
    signature: getWeaponTuneSignature(chain[0]),
  });
  weaponLoadout[idx].tuneChain = chain;
  weaponLoadout[idx].tune = chain[0];
}

function triggerWeaponFromSubBoardNote(slotIndex, rowIndex) {
  if (!active || gameplayPaused) return;
  const idx = Math.max(0, Math.min(MAX_WEAPON_SLOTS - 1, Math.trunc(Number(slotIndex) || 0)));
  if (idx !== Math.max(0, Math.trunc(Number(activeWeaponSlotIndex) || 0))) return;
  const weapon = weaponLoadout[idx];
  const stages = sanitizeWeaponStages(weapon?.stages);
  if (!stages.length) return;
  const centerWorld = getViewportCenterWorld();
  const beatIndex = Number.isFinite(currentBeatIndex) ? Math.trunc(currentBeatIndex) : 0;
  const damageScale = getWeaponTuneDamageScale(idx);
  const first = stages[0];
  const rest = stages.slice(1);
  logWeaponTuneFireDebug('subboard-note-fire', {
    slotIndex: idx,
    rowIndex: Math.trunc(Number(rowIndex) || 0),
    beatIndex,
  });
  pulsePlayerShipNoteFlash();
  triggerWeaponStage(first, centerWorld, beatIndex, rest, {
    origin: centerWorld,
    impactPoint: centerWorld,
    weaponSlotIndex: idx,
    stageIndex: 0,
    damageScale,
    forcedNoteName: weaponSubBoardRowToNoteName(rowIndex),
    directSound: true,
    debugSource: 'subboard-note',
    debugBeatIndex: beatIndex,
  });
}

function scheduleWeaponFromSubBoardNote(slotIndex, rowIndex, whenAudio) {
  const idx = Math.max(0, Math.min(MAX_WEAPON_SLOTS - 1, Math.trunc(Number(slotIndex) || 0)));
  const row = Math.trunc(Number(rowIndex));
  const when = Number(whenAudio);
  const info = getLoopInfo?.();
  const nowAudio = Number(info?.now);
  if (!Number.isFinite(row)) return;
  if (!Number.isFinite(when) || !Number.isFinite(nowAudio)) {
    logWeaponTuneFireDebug('subboard-note-schedule', {
      slotIndex: idx,
      rowIndex: row,
      whenAudio: null,
      delayMs: 0,
    });
    triggerWeaponFromSubBoardNote(idx, row);
    return;
  }
  const delayMs = Math.max(0, (when - nowAudio) * 1000);
  logWeaponTuneFireDebug('subboard-note-schedule', {
    slotIndex: idx,
    rowIndex: row,
    whenAudio: when,
    delayMs: Math.round(delayMs),
  });
  if (!(delayMs > 2)) {
    triggerWeaponFromSubBoardNote(idx, row);
    return;
  }
  const slotState = getWeaponSubBoardSlotState(idx);
  const timerId = setTimeout(() => {
    slotState.scheduledTimeoutIds.delete(timerId);
    triggerWeaponFromSubBoardNote(idx, row);
  }, delayMs);
  slotState.scheduledTimeoutIds.add(timerId);
}

function syncWeaponSubBoardBindingsForSlot(slotIndex) {
  const idx = Math.max(0, Math.min(MAX_WEAPON_SLOTS - 1, Math.trunc(Number(slotIndex) || 0)));
  const slotState = getWeaponSubBoardSlotState(idx);
  const artToyId = String(slotState.artToyId || '').trim();
  if (!artToyId) {
    clearWeaponSubBoardBindingsForSlot(idx);
    return;
  }
  const panels = Array.from(document.querySelectorAll(`.toy-panel[data-toy="drawgrid"][data-art-owner-id="${CSS.escape(artToyId)}"]`));
  const panelIdsForDebug = panels.map((p) => String(p?.id || '')).filter(Boolean);
  const bindSignature = panelIdsForDebug.join('|');
  if (slotState.lastBindSignature !== bindSignature) {
    slotState.lastBindSignature = bindSignature;
    logWeaponTuneFireDebug('subboard-bind-panels', {
      slotIndex: idx,
      panelCount: panels.length,
      panelIds: panelIdsForDebug,
    });
  }
  const nextIds = new Set(panels.map((p) => String(p.id || '')).filter((id) => !!id));
  for (const oldId of Array.from(slotState.boundPanelIds)) {
    if (nextIds.has(oldId)) continue;
    const oldPanel = document.getElementById(oldId);
    const oldNote = oldPanel?.__beatSwarmSubBoardNoteHandler;
    if (typeof oldNote === 'function') {
      try { oldPanel.removeEventListener('drawgrid:note-fired', oldNote); } catch {}
    }
    const oldUpdate = oldPanel?.__beatSwarmSubBoardUpdateHandler;
    if (typeof oldUpdate === 'function') {
      try { oldPanel.removeEventListener('drawgrid:update', oldUpdate); } catch {}
    }
    const oldDirty = oldPanel?.__beatSwarmSubBoardDirtyHandler;
    if (typeof oldDirty === 'function') {
      try { oldPanel.removeEventListener('drawgrid:node-toggle', oldDirty); } catch {}
      try { oldPanel.removeEventListener('drawgrid:node-drag-end', oldDirty); } catch {}
      try { oldPanel.removeEventListener('toy-random', oldDirty); } catch {}
      try { oldPanel.removeEventListener('toy-random-notes', oldDirty); } catch {}
      try { oldPanel.removeEventListener('toy-random-blocks', oldDirty); } catch {}
      try { oldPanel.removeEventListener('pointerdown', oldDirty); } catch {}
      try { oldPanel.removeEventListener('touchstart', oldDirty); } catch {}
    }
    if (oldPanel) {
      delete oldPanel.__beatSwarmSubBoardSlotIndex;
      delete oldPanel.__beatSwarmSubBoardNoteHandler;
      delete oldPanel.__beatSwarmSubBoardUpdateHandler;
      delete oldPanel.__beatSwarmSubBoardDirtyHandler;
    }
    slotState.boundPanelIds.delete(oldId);
  }
  for (const panel of panels) {
    if (!(panel instanceof HTMLElement) || !panel.id) continue;
    if (slotState.boundPanelIds.has(panel.id)) continue;
    applyProjectileInstrumentToDrawgridPanel(panel);
    const onNote = (ev) => {
      if (gameplayPaused) {
        logWeaponTuneFireDebug('subboard-note-ignored-paused', {
          slotIndex: idx,
          rowIndex: Math.trunc(Number(ev?.detail?.row) || 0),
        });
        return;
      }
      if (!weaponSubBoardState.open || Math.trunc(Number(weaponSubBoardState.slotIndex) || -1) !== idx) return;
      const row = Math.trunc(Number(ev?.detail?.row));
      if (!Number.isFinite(row)) return;
      scheduleWeaponFromSubBoardNote(idx, row, ev?.detail?.when);
    };
    const onUpdate = () => {
      if (weaponSubBoardState.open && Math.trunc(Number(weaponSubBoardState.slotIndex) || -1) === idx) {
        getWeaponSubBoardSlotState(idx).sessionDirty = true;
      }
      scheduleWeaponSubBoardTuneChainSync(idx, 32);
    };
    const markDirty = () => {
      if (!weaponSubBoardState.open || Math.trunc(Number(weaponSubBoardState.slotIndex) || -1) !== idx) return;
      getWeaponSubBoardSlotState(idx).sessionDirty = true;
      scheduleWeaponSubBoardTuneChainSync(idx, 20);
    };
    panel.__beatSwarmSubBoardSlotIndex = idx;
    panel.__beatSwarmSubBoardNoteHandler = onNote;
    panel.__beatSwarmSubBoardUpdateHandler = onUpdate;
    panel.__beatSwarmSubBoardDirtyHandler = markDirty;
    try { panel.addEventListener('drawgrid:note-fired', onNote); } catch {}
    try { panel.addEventListener('drawgrid:update', onUpdate); } catch {}
    try { panel.addEventListener('drawgrid:node-toggle', markDirty); } catch {}
    try { panel.addEventListener('drawgrid:node-drag-end', markDirty); } catch {}
    try { panel.addEventListener('toy-random', markDirty); } catch {}
    try { panel.addEventListener('toy-random-notes', markDirty); } catch {}
    try { panel.addEventListener('toy-random-blocks', markDirty); } catch {}
    try { panel.addEventListener('pointerdown', markDirty); } catch {}
    try { panel.addEventListener('touchstart', markDirty); } catch {}
    // Keep tune state stable during autoplay; we snapshot on sub-board close.
    slotState.boundPanelIds.add(panel.id);
  }
}

function setPauseScreenSubBoardHidden(hidden) {
  if (!pauseScreenEl) return;
  pauseScreenEl.classList.toggle('is-subboard-hidden', !!hidden);
  overlayEl?.classList?.toggle?.('is-subboard-open', !!hidden);
}

function closeWeaponSubBoardEditor(options = null) {
  const opts = options && typeof options === 'object' ? options : {};
  const wasOpen = !!weaponSubBoardState.open;
  const prevSlotIndex = Number.isFinite(weaponSubBoardState.slotIndex)
    ? Math.trunc(weaponSubBoardState.slotIndex)
    : Math.trunc(Number(weaponSubBoardState.slotIndex));
  if (wasOpen && prevSlotIndex >= 0 && prevSlotIndex < MAX_WEAPON_SLOTS) {
    // Always snapshot on close so latest edits are persisted even if dirty markers race.
    try { snapshotWeaponSubBoardTuneChain(prevSlotIndex); } catch {}
    try { setWeaponSubBoardPanelPlayback(prevSlotIndex, false); } catch {}
  }
  weaponSubBoardState.open = false;
  weaponSubBoardState.slotIndex = -1;
  setPauseScreenSubBoardHidden(false);
  if (wasOpen && prevSlotIndex >= 0 && prevSlotIndex < MAX_WEAPON_SLOTS) {
    try {
      const prevSlotState = getWeaponSubBoardSlotState(prevSlotIndex);
      prevSlotState.openTuneSnapshot = null;
      prevSlotState.openTuneChainSnapshot = null;
      prevSlotState.sessionDirty = false;
    } catch {}
    clearWeaponSubBoardScheduledTriggersForSlot(prevSlotIndex);
  }
  if (opts.keepUi !== true && gameplayPaused) renderPauseWeaponUi();
  if (wasOpen) persistBeatSwarmState();
}

function updateWeaponSubBoardSession() {
  for (let i = 0; i < MAX_WEAPON_SLOTS; i++) {
    syncWeaponSubBoardBindingsForSlot(i);
  }
  if (!weaponSubBoardState.open) return;
  const slotIndex = Math.max(0, Math.min(MAX_WEAPON_SLOTS - 1, Math.trunc(Number(weaponSubBoardState.slotIndex) || 0)));
  const artToyId = getWeaponSubBoardArtToyId(slotIndex);
  const activeInternal = !!window.__ArtInternal?.isActive?.();
  const activeHome = window.__ArtInternal?.getHomeAnchor?.();
  if (!activeInternal || !artToyId) {
    const wasRunning = !!isRunning?.();
    closeWeaponSubBoardEditor();
    if (wasRunning) {
      try { stopTransport?.(); } catch {}
    }
    if (!gameplayPaused) setGameplayPaused(true);
    return;
  }
  hideWeaponSubBoardArtAnchor(slotIndex);
  setPauseScreenSubBoardHidden(true);
  void activeHome;
}

function openWeaponSubBoardEditor(slotIndex) {
  const idx = Math.max(0, Math.min(MAX_WEAPON_SLOTS - 1, Math.trunc(Number(slotIndex) || 0)));
  if (!active || !gameplayPaused) return false;
  try {
    const slotState = getWeaponSubBoardSlotState(idx);
    slotState.openTuneSnapshot = sanitizeWeaponTune(weaponLoadout[idx]?.tune);
    slotState.openTuneChainSnapshot = getWeaponSlotTuneChain(idx).map((t) => sanitizeWeaponTune(t));
    slotState.sessionDirty = false;
    logWeaponTuneFireDebug('subboard-open-snapshot', {
      slotIndex: idx,
      signature: getWeaponTuneSignature(slotState.openTuneSnapshot),
    });
  } catch {}
  const artToyId = ensureWeaponSubBoardArtToy(idx);
  if (!artToyId) return false;
  weaponSubBoardState.open = true;
  weaponSubBoardState.slotIndex = idx;
  setPauseScreenSubBoardHidden(true);
  stagePickerState.open = false;
  stagePickerState.slotIndex = -1;
  stagePickerState.stageIndex = -1;
  tuneEditorState.open = false;
  tuneEditorState.slotIndex = -1;
  tuneEditorState.beatTimer = 0;
  tuneEditorState.playheadStep = 0;
  teardownWeaponTuneToyEditor();
  try { window.__ArtInternal?.enter?.(artToyId); } catch {}
  try { ensureWeaponSubBoardDrawgridChain(idx, WEAPON_TUNE_CHAIN_LENGTH); } catch {}
  try {
    const existingPanels = Array.from(document.querySelectorAll(`.toy-panel[data-toy="drawgrid"][data-art-owner-id="${CSS.escape(artToyId)}"]`));
    for (const p of existingPanels) {
      if (!(p instanceof HTMLElement)) continue;
      p.style.visibility = 'hidden';
      try { p.dataset.beatSwarmAwaitReveal = '1'; } catch {}
    }
  } catch {}
  setTimeout(() => {
    hideWeaponSubBoardArtAnchor(idx);
    syncWeaponSubBoardBindingsForSlot(idx);
    forceApplyOpenTuneSnapshotToSubBoard(idx);
  }, 80);
  setTimeout(() => {
    syncWeaponSubBoardBindingsForSlot(idx);
    forceApplyOpenTuneSnapshotToSubBoard(idx);
  }, 180);
  setTimeout(() => {
    syncWeaponSubBoardBindingsForSlot(idx);
    forceApplyOpenTuneSnapshotToSubBoard(idx);
    const boardPanels = Array.from(document.querySelectorAll(`.toy-panel[data-toy="drawgrid"][data-art-owner-id="${CSS.escape(artToyId)}"]`));
    logWeaponTuneFireDebug('subboard-open-start-panels', {
      slotIndex: idx,
      panelCount: boardPanels.length,
      panelIds: boardPanels.map((p) => String(p?.id || '')).filter(Boolean),
    });
    if (!boardPanels.length) return;
    const slotState = getWeaponSubBoardSlotState(idx);
    const openChain = Array.isArray(slotState?.openTuneChainSnapshot) && slotState.openTuneChainSnapshot.length
      ? sanitizeWeaponTuneChain(slotState.openTuneChainSnapshot)
      : getWeaponSlotTuneChain(idx);
    const targetSigs = boardPanels.map((_, i) => getWeaponTuneSignature(sanitizeWeaponTune(openChain[Math.min(i, openChain.length - 1)])));
    const finalizeStart = () => {
      for (const p of boardPanels) {
        try { p.dispatchEvent(new CustomEvent('toy:start', { bubbles: true })); } catch {}
        try { p.dispatchEvent(new CustomEvent('beat-swarm:reveal-subboard-panel', { bubbles: false })); } catch {}
        try { p.style.visibility = ''; } catch {}
        try { p.dataset.beatSwarmAwaitReveal = '0'; } catch {}
      }
      try { setWeaponSubBoardPanelPlayback(idx, true); } catch {}
    };
    // Do not block board open on async setState convergence; it causes visible delays.
    // Start immediately, then enforce the snapshot signature shortly after startup.
    finalizeStart();
    if (!targetSigs.length) return;
    const enforce = (delayMs) => {
      const timerId = setTimeout(() => {
        slotState.scheduledTimeoutIds.delete(timerId);
        for (let i = 0; i < boardPanels.length; i++) {
          const p = boardPanels[i];
          const snapTune = sanitizeWeaponTune(openChain[Math.min(i, openChain.length - 1)]);
          if (!(countWeaponTuneActiveEvents(snapTune) > 0)) continue;
          const targetSig = targetSigs[i] || getWeaponTuneSignature(snapTune);
          const sig = panelDrawgridSignature(p);
          if (sig !== targetSig) applyWeaponTuneObjectToDrawgridPanel(snapTune, p);
        }
      }, delayMs);
      slotState.scheduledTimeoutIds.add(timerId);
    };
    enforce(30);
    enforce(90);
    enforce(180);
  }, 260);
  return true;
}

function destroyWeaponSubBoards() {
  if (window.__ArtInternal?.isActive?.()) {
    try { window.__ArtInternal?.exit?.(); } catch {}
  }
  for (let i = 0; i < MAX_WEAPON_SLOTS; i++) {
    const slotState = getWeaponSubBoardSlotState(i);
    const artToyId = String(slotState.artToyId || '').trim();
    clearWeaponSubBoardBindingsForSlot(i);
    clearWeaponSubBoardScheduledTriggersForSlot(i);
    if (!artToyId) continue;
    const artPanel = document.getElementById(artToyId);
    if (artPanel) {
      try { window.ArtToyFactory?.destroy?.(artPanel); } catch { try { artPanel.remove?.(); } catch {} }
    }
    slotState.artToyId = '';
  }
  closeWeaponSubBoardEditor({ keepUi: true });
}

function teardownWeaponTuneToyEditor() {
  const panel = tuneEditorState.panel;
  if (panel) {
    try {
      if (tuneEditorState.panelUpdateHandler) panel.removeEventListener('drawgrid:update', tuneEditorState.panelUpdateHandler);
    } catch {}
    const st = panel.__drawToy?.getState?.();
    applyTuneFromDrawgridState(tuneEditorState.slotIndex, st);
    try { window.MusicToyFactory?.destroy?.(panel); } catch { try { panel.remove?.(); } catch {} }
  }
  tuneEditorState.panel = null;
  tuneEditorState.panelUpdateHandler = null;
}

function ensureWeaponTuneToyEditorMounted() {
  if (!tuneEditorState.open || !pauseScreenEl) return;
  const slotIndex = Math.max(0, Math.min(MAX_WEAPON_SLOTS - 1, Math.trunc(Number(tuneEditorState.slotIndex) || 0)));
  const host = pauseScreenEl.querySelector('#beat-swarm-tune-toy-host');
  if (!(host instanceof HTMLElement)) return;
  if (tuneEditorState.panel && tuneEditorState.panel.isConnected && host.contains(tuneEditorState.panel)) return;
  teardownWeaponTuneToyEditor();
  const panel = window.MusicToyFactory?.create?.('drawgrid', {
    centerX: 420,
    centerY: 240,
    containerEl: host,
    allowOffscreen: true,
    skipSpawnPlacement: true,
  }) || null;
  if (!(panel instanceof HTMLElement)) return;
  tuneEditorState.panel = panel;
  panel.classList.add('beat-swarm-tune-toy-panel');
  panel.style.position = 'absolute';
  panel.style.left = '10px';
  panel.style.top = '10px';
  const savedTune = sanitizeWeaponTune(weaponLoadout[slotIndex]?.tune);
  const applySaved = (retry = 0) => {
    try {
      const api = panel.__drawToy;
      if (api?.setState) {
        api.setState({
          steps: savedTune.steps,
          nodes: {
            active: savedTune.active.slice(),
            list: savedTune.list.map((v) => (Array.isArray(v) ? v.slice() : [])),
            disabled: savedTune.disabled.map((v) => (Array.isArray(v) ? v.slice() : [])),
          },
        });
        return;
      }
    } catch {}
    if (retry < 24) setTimeout(() => applySaved(retry + 1), 30);
  };
  applySaved(0);
  const onUpdate = () => {
    try {
      const st = panel.__drawToy?.getState?.();
      applyTuneFromDrawgridState(slotIndex, st);
    } catch {}
  };
  tuneEditorState.panelUpdateHandler = onUpdate;
  try { panel.addEventListener('drawgrid:update', onUpdate); } catch {}
}

function updateWeaponTuneEditor(dt) {
  if (!tuneEditorState.open) return;
  if (!gameplayPaused || !pauseScreenEl?.classList?.contains?.('is-visible')) return;
  ensureWeaponTuneToyEditorMounted();
  const panel = tuneEditorState.panel;
  const beatLen = getPausePreviewBeatLen();
  tuneEditorState.beatTimer += Math.max(0.001, Number(dt) || 0.016);
  let changed = false;
  while (tuneEditorState.beatTimer >= beatLen) {
    tuneEditorState.beatTimer -= beatLen;
    tuneEditorState.playheadStep = (Math.max(0, Math.trunc(Number(tuneEditorState.playheadStep) || 0)) + 1) % WEAPON_TUNE_STEPS;
    try { panel?.__sequencerStep?.(tuneEditorState.playheadStep); } catch {}
    changed = true;
  }
  if (changed) syncTuneEditorPlayheadUi();
}

function ensurePauseWeaponUi() {
  if (!pauseScreenEl) return;
  if (pauseScreenEl.dataset.uiReady === '1') return;
  pauseScreenEl.dataset.uiReady = '1';
  renderPauseWeaponUi();
  pauseScreenEl.addEventListener('click', (ev) => {
    if ((performance.now() || 0) < (Number(pauseWeaponDrag.suppressClickUntil) || 0)) {
      ev.preventDefault();
      ev.stopPropagation();
      return;
    }
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
    if (action === 'close-weapon-tune') {
      closeWeaponSubBoardEditor();
      return;
    }
    if (!(slotIndex >= 0 && slotIndex < weaponLoadout.length)) return;
    const slot = weaponLoadout[slotIndex];
    if (action === 'open-weapon-tune') {
      openWeaponSubBoardEditor(slotIndex);
      return;
    }
    if (action === 'random-weapon') {
      slot.stages = createRandomWeaponStages();
      clearHelpers();
      stagePickerState.open = false;
      renderPauseWeaponUi();
      persistBeatSwarmState();
      return;
    }
    if (action === 'open-component-picker') {
      tuneEditorState.open = false;
      tuneEditorState.slotIndex = -1;
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
  pauseScreenEl.addEventListener('pointerdown', (ev) => {
    if (!pauseScreenEl || stagePickerState.open || tuneEditorState.open || weaponSubBoardState.open) return;
    if (!(ev instanceof PointerEvent)) return;
    if (ev.button !== 0) return;
    if (pauseWeaponDrag.pointerId != null) resetPauseWeaponDrag(false);
    const dragHandle = (ev.target instanceof HTMLElement)
      ? ev.target.closest('.beat-swarm-stage-component-btn:not(.is-empty)')
      : null;
    if (!(dragHandle instanceof HTMLElement)) return;
    const cell = getPauseWeaponStageCellFromEventTarget(ev.target);
    const parsed = parsePauseWeaponStageCell(cell);
    if (!parsed) return;
    pauseWeaponDrag.pointerId = ev.pointerId;
    pauseWeaponDrag.started = false;
    pauseWeaponDrag.startX = Number(ev.clientX) || 0;
    pauseWeaponDrag.startY = Number(ev.clientY) || 0;
    pauseWeaponDrag.lastX = pauseWeaponDrag.startX;
    pauseWeaponDrag.lastY = pauseWeaponDrag.startY;
    pauseWeaponDrag.sourceSlotIndex = parsed.slotIndex;
    pauseWeaponDrag.sourceStageIndex = parsed.stageIndex;
    pauseWeaponDrag.targetSlotIndex = -1;
    pauseWeaponDrag.targetStageIndex = -1;
    if (pauseWeaponDrag.holdTimer) {
      try { clearTimeout(pauseWeaponDrag.holdTimer); } catch {}
      pauseWeaponDrag.holdTimer = 0;
    }
    pauseWeaponDrag.holdTimer = setTimeout(() => {
      pauseWeaponDrag.holdTimer = 0;
      if (pauseWeaponDrag.pointerId !== ev.pointerId) return;
      beginPauseWeaponDrag(pauseWeaponDrag.lastX, pauseWeaponDrag.lastY);
    }, PAUSE_WEAPON_DRAG_HOLD_MS);
  });
  pauseScreenEl.addEventListener('pointermove', (ev) => {
    if (!(ev instanceof PointerEvent)) return;
    if (pauseWeaponDrag.pointerId !== ev.pointerId) return;
    pauseWeaponDrag.lastX = Number(ev.clientX) || 0;
    pauseWeaponDrag.lastY = Number(ev.clientY) || 0;
    if (!pauseWeaponDrag.started) return;
    updatePauseWeaponDragVisual(pauseWeaponDrag.lastX, pauseWeaponDrag.lastY);
    ev.preventDefault();
  });
  pauseScreenEl.addEventListener('pointerup', (ev) => {
    if (!(ev instanceof PointerEvent)) return;
    if (pauseWeaponDrag.pointerId !== ev.pointerId) return;
    if (pauseWeaponDrag.started) {
      const didReorder = reorderWeaponStages(
        pauseWeaponDrag.sourceSlotIndex,
        pauseWeaponDrag.sourceStageIndex,
        pauseWeaponDrag.targetStageIndex
      );
      resetPauseWeaponDrag(true);
      if (didReorder) {
        clearHelpers();
        stagePickerState.open = false;
        stagePickerState.slotIndex = -1;
        stagePickerState.stageIndex = -1;
        renderPauseWeaponUi();
        persistBeatSwarmState();
      }
    } else {
      resetPauseWeaponDrag(false);
    }
    try { pauseScreenEl.releasePointerCapture(ev.pointerId); } catch {}
  });
  pauseScreenEl.addEventListener('pointercancel', (ev) => {
    if (!(ev instanceof PointerEvent)) return;
    if (pauseWeaponDrag.pointerId !== ev.pointerId) return;
    resetPauseWeaponDrag(false);
    try { pauseScreenEl.releasePointerCapture(ev.pointerId); } catch {}
  });
  pauseScreenEl.addEventListener('lostpointercapture', (ev) => {
    if (!(ev instanceof PointerEvent)) return;
    if (pauseWeaponDrag.pointerId !== ev.pointerId) return;
    resetPauseWeaponDrag(false);
  });
}

function renderPauseWeaponUi() {
  if (!pauseScreenEl) return;
  const cards = weaponLoadout.map((slot, slotIndex) => {
    const tune = sanitizeWeaponTune(slot.tune);
    slot.tune = tune;
    const tuneStats = getWeaponTuneActivityStats(slotIndex);
    const tuneActiveCount = Math.max(0, Math.trunc(Number(tuneStats.activeNotes) || 0));
    const tuneTotalCount = Math.max(1, Math.trunc(Number(tuneStats.totalNotes) || WEAPON_TUNE_STEPS));
    const tuneDmgScale = getWeaponTuneDamageScale(slotIndex);
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
        <div class="beat-swarm-stage-cell is-filled" data-slot-index="${slotIndex}" data-stage-index="${stageIndex}">
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
          <button type="button" class="beat-swarm-stage-add" data-action="open-weapon-tune" data-slot-index="${slotIndex}">Weapon Rhythm</button>
          <button type="button" class="beat-swarm-stage-add beat-swarm-random-weapon" data-action="random-weapon" data-slot-index="${slotIndex}">Create Random Weapon</button>
        </div>
        <div class="beat-swarm-weapon-tune-summary">Tune: ${tuneActiveCount}/${tuneTotalCount} active notes | Damage x${tuneDmgScale.toFixed(2)}</div>
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
  syncTuneEditorPlayheadUi();
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

function getSpawnerNodeCellWorld(spawner, stepIndex) {
  const enemy = spawner && typeof spawner === 'object' ? spawner : null;
  if (!enemy) return null;
  const idx = ((Math.trunc(Number(stepIndex) || 0) % 8) + 8) % 8;
  const map = SPAWNER_ENEMY_GRID_STEP_TO_CELL[idx];
  if (!map) return null;
  const col = Math.max(0, Math.min(2, Math.trunc(Number(map.c) || 0)));
  const row = Math.max(0, Math.min(2, Math.trunc(Number(map.r) || 0)));
  const stepWorld = Math.max(12, Number(SPAWNER_ENEMY_GRID_WORLD_OFFSET) || 86) * 0.78;
  const ox = (col - 1) * stepWorld;
  const oy = (row - 1) * stepWorld;
  return {
    x: (Number(enemy.wx) || 0) + ox,
    y: (Number(enemy.wy) || 0) + oy,
  };
}

function clearSpawnerNodeEnemyReference(spawnerId, nodeStepIndex, enemyId = null) {
  const sid = Math.trunc(Number(spawnerId) || 0);
  if (!(sid > 0)) return;
  const step = ((Math.trunc(Number(nodeStepIndex) || 0) % 8) + 8) % 8;
  const spawner = enemies.find((e) => Math.trunc(Number(e?.id) || 0) === sid && String(e?.enemyType || '') === 'spawner') || null;
  if (!spawner) return;
  if (!Array.isArray(spawner.spawnerNodeEnemyIds)) {
    spawner.spawnerNodeEnemyIds = Array.from({ length: 8 }, () => 0);
  }
  const currentId = Math.trunc(Number(spawner.spawnerNodeEnemyIds[step]) || 0);
  if (enemyId != null) {
    const targetId = Math.trunc(Number(enemyId) || 0);
    if (currentId !== targetId) return;
  }
  spawner.spawnerNodeEnemyIds[step] = 0;
}

function updateSpawnerLinkedEnemyLine(enemy) {
  const linkedEnemy = enemy && typeof enemy === 'object' ? enemy : null;
  const line = linkedEnemy?.linkedSpawnerLineEl;
  if (!(line instanceof HTMLElement)) return;
  const spawnerId = Math.trunc(Number(linkedEnemy?.linkedSpawnerId) || 0);
  const nodeStep = Math.trunc(Number(linkedEnemy?.linkedSpawnerStepIndex) || 0);
  const spawner = enemies.find((e) => Math.trunc(Number(e?.id) || 0) === spawnerId && String(e?.enemyType || '') === 'spawner') || null;
  if (!spawner) {
    if (linkedEnemy.linkedSpawnerLineVisible !== false) {
      line.style.opacity = '0';
      linkedEnemy.linkedSpawnerLineVisible = false;
    }
    return;
  }
  const fromWorld = getSpawnerNodeCellWorld(spawner, nodeStep);
  const toWorld = { x: Number(linkedEnemy.wx) || 0, y: Number(linkedEnemy.wy) || 0 };
  const from = fromWorld ? worldToScreen(fromWorld) : null;
  const to = worldToScreen(toWorld);
  if (!from || !to || !Number.isFinite(from.x) || !Number.isFinite(from.y) || !Number.isFinite(to.x) || !Number.isFinite(to.y)) {
    if (linkedEnemy.linkedSpawnerLineVisible !== false) {
      line.style.opacity = '0';
      linkedEnemy.linkedSpawnerLineVisible = false;
    }
    return;
  }
  const pad = 120;
  const offscreenFrom = from.x < -pad || from.y < -pad || from.x > (window.innerWidth + pad) || from.y > (window.innerHeight + pad);
  const offscreenTo = to.x < -pad || to.y < -pad || to.x > (window.innerWidth + pad) || to.y > (window.innerHeight + pad);
  if (offscreenFrom && offscreenTo) {
    if (linkedEnemy.linkedSpawnerLineVisible !== false) {
      line.style.opacity = '0';
      linkedEnemy.linkedSpawnerLineVisible = false;
    }
    return;
  }
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.max(1, Math.hypot(dx, dy));
  const ang = Math.atan2(dy, dx) * (180 / Math.PI);
  // Quantize values and skip tiny updates to reduce compositor churn.
  const qx = Math.round(from.x * 4) * 0.25;
  const qy = Math.round(from.y * 4) * 0.25;
  const qlen = Math.round(len * 4) * 0.25;
  const qang = Math.round(ang * 10) * 0.1;
  const lastX = Number(linkedEnemy.linkedSpawnerLineLastX);
  const lastY = Number(linkedEnemy.linkedSpawnerLineLastY);
  const lastLen = Number(linkedEnemy.linkedSpawnerLineLastLen);
  const lastAng = Number(linkedEnemy.linkedSpawnerLineLastAng);
  const changed = !(Math.abs(qx - lastX) < 0.2
    && Math.abs(qy - lastY) < 0.2
    && Math.abs(qlen - lastLen) < 0.2
    && Math.abs(qang - lastAng) < 0.1);
  if (linkedEnemy.linkedSpawnerLineVisible !== true) {
    line.style.opacity = '1';
    linkedEnemy.linkedSpawnerLineVisible = true;
  }
  if (!changed) return;
  linkedEnemy.linkedSpawnerLineLastX = qx;
  linkedEnemy.linkedSpawnerLineLastY = qy;
  linkedEnemy.linkedSpawnerLineLastLen = qlen;
  linkedEnemy.linkedSpawnerLineLastAng = qang;
  line.style.width = `${qlen.toFixed(1)}px`;
  line.style.transform = `translate(${qx.toFixed(1)}px, ${qy.toFixed(1)}px) rotate(${qang.toFixed(1)}deg)`;
}

function removeEnemy(enemy, reason = 'unknown', context = null) {
  if (!enemy) return;
  const removalReason = normalizeEnemyRemovalReason(reason);
  const ctx = context && typeof context === 'object' ? context : {};
  const beatIndex = Math.max(0, Math.trunc(Number(ctx.beatIndex) || Number(currentBeatIndex) || 0));
  const stepIndex = Math.max(0, Math.trunc(Number(ctx.stepIndex) || Number(ensureSwarmDirector().getSnapshot()?.stepIndex) || 0));
  const barIndex = Math.floor(beatIndex / Math.max(1, COMPOSER_BEATS_PER_BAR));
  try {
    swarmMusicLab.noteEnemyRemoval(enemy, getMusicLabContext({
      beatIndex,
      stepIndex,
      barIndex,
      reason: removalReason,
      groupId: Math.max(0, Math.trunc(Number(ctx.groupId) || Number(enemy?.composerGroupId) || 0)),
      retireOrigin: String(ctx.retireOrigin || enemy?.retreatOrigin || '').trim().toLowerCase(),
    }));
  } catch {}
  if (removalReason === 'director_cleanup' || removalReason === 'section_change_cleanup') {
    cleanupAssertionState.totalViolations = Math.max(0, Math.trunc(Number(cleanupAssertionState.totalViolations) || 0)) + 1;
    if (removalReason === 'director_cleanup') {
      cleanupAssertionState.directorCleanup = Math.max(0, Math.trunc(Number(cleanupAssertionState.directorCleanup) || 0)) + 1;
    } else {
      cleanupAssertionState.sectionChangeCleanup = Math.max(0, Math.trunc(Number(cleanupAssertionState.sectionChangeCleanup) || 0)) + 1;
    }
    cleanupAssertionState.lastViolation = {
      atMs: Math.round(performance?.now?.() || 0),
      reason: removalReason,
      enemyId: Math.trunc(Number(enemy?.id) || 0),
      enemyType: String(enemy?.enemyType || ''),
      beatIndex,
      stepIndex,
      barIndex,
    };
    try {
      console.error('[BeatSwarm][cleanup-assertion-failed]', {
        reason: removalReason,
        totalViolations: cleanupAssertionState.totalViolations,
        directorCleanup: cleanupAssertionState.directorCleanup,
        sectionChangeCleanup: cleanupAssertionState.sectionChangeCleanup,
        enemyId: Math.trunc(Number(enemy?.id) || 0),
        enemyType: String(enemy?.enemyType || ''),
        beatIndex,
        stepIndex,
        barIndex,
      });
    } catch {}
    try {
      window.dispatchEvent(new CustomEvent('beat-swarm:cleanup-violation', {
        detail: {
          ...cleanupAssertionState.lastViolation,
          counters: {
            totalViolations: cleanupAssertionState.totalViolations,
            directorCleanup: cleanupAssertionState.directorCleanup,
            sectionChangeCleanup: cleanupAssertionState.sectionChangeCleanup,
          },
        },
      }));
    } catch {}
  }
  const enemyId = Math.trunc(Number(enemy?.id) || 0);
  if (enemyId > 0) {
    removeSingletonMusicGroupForEnemy(enemyId);
    const composerGroupId = Math.trunc(Number(enemy?.composerGroupId) || 0);
    if (composerGroupId > 0) {
      const group = composerEnemyGroups.find((g) => Math.trunc(Number(g?.id) || 0) === composerGroupId) || null;
      if (group?.memberIds instanceof Set) {
        try { group.memberIds.delete(enemyId); } catch {}
      }
    }
  }
  if (enemy?.linkedSpawnerLineEl instanceof HTMLElement) {
    try { enemy.linkedSpawnerLineEl.remove(); } catch {}
    enemy.linkedSpawnerLineEl = null;
  }
  if (Number.isFinite(enemy?.linkedSpawnerId) && Number.isFinite(enemy?.linkedSpawnerStepIndex)) {
    clearSpawnerNodeEnemyReference(enemy.linkedSpawnerId, enemy.linkedSpawnerStepIndex, enemy.id);
  }
  try { enemy.el?.remove?.(); } catch {}
}

function clearPendingEnemyDeaths() {
  for (const d of pendingEnemyDeaths) {
    try { d?.el?.remove?.(); } catch {}
  }
  pendingEnemyDeaths.length = 0;
}

function getPendingEnemyDeathByEnemyId(enemyId) {
  const id = Math.trunc(Number(enemyId) || 0);
  if (!(id > 0)) return null;
  return pendingEnemyDeaths.find((d) => Math.trunc(Number(d?.sourceEnemyId) || 0) === id) || null;
}

function processPendingEnemyDeaths(nowTs = performance.now(), beatIndex = currentBeatIndex) {
  const now = Number(nowTs) || performance.now();
  const beat = Math.max(0, Math.trunc(Number(beatIndex) || 0));
  for (let i = pendingEnemyDeaths.length - 1; i >= 0; i--) {
    const d = pendingEnemyDeaths[i];
    const el = d?.el || null;
    if (!el) {
      pendingEnemyDeaths.splice(i, 1);
      continue;
    }
    const s = worldToScreen({ x: Number(d.wx) || 0, y: Number(d.wy) || 0 });
    if (s && Number.isFinite(s.x) && Number.isFinite(s.y)) {
      el.style.setProperty('--bs-death-x', `${s.x}px`);
      el.style.setProperty('--bs-death-y', `${s.y}px`);
    }
    if (!d.popped && (beat >= (Number(d.popBeat) || 0) || now >= (Number(d.fallbackPopAt) || 0))) {
      el.classList.remove('is-dying');
      el.classList.add('is-death-pop');
      d.popped = true;
      d.removeAt = now + 180;
      const deathFamily = normalizeEnemyDeathFamily(d?.soundFamily, 'medium');
      const deathEventKey = String(d?.soundEventKey || '').trim() || resolveEnemyDeathEventKey(deathFamily, 'enemyDeathMedium');
      const requestedNoteRaw = clampNoteToDirectorPool(
        normalizeSwarmNoteName(d.soundNote) || getRandomSwarmPentatonicNote(),
        beat + Math.max(0, Math.trunc(Number(d?.sourceEnemyId) || 0))
      );
      executePerformedBeatEvent(createPerformedBeatEvent({
        actorId: Math.max(0, Math.trunc(Number(d?.sourceEnemyId) || 0)),
        beatIndex: beat,
        stepIndex: Math.max(0, Math.trunc(Number(ensureSwarmDirector().getSnapshot()?.stepIndex) || 0)),
        role: BEAT_EVENT_ROLES.ACCENT,
        note: requestedNoteRaw || getRandomSwarmPentatonicNote(),
        instrumentId: resolveSwarmSoundInstrumentId(deathEventKey) || '',
        actionType: 'enemy-death-accent',
        threatClass: BEAT_EVENT_THREAT.ACCENT,
        visualSyncType: 'death-pop',
        payload: {
          volume: Math.max(0.001, Math.min(1, Number(d.soundVolume) || 0)),
          soundFamily: deathFamily,
          soundEventKey: deathEventKey,
          requestedNoteRaw,
        },
      }));
    }
    if (d.popped && now >= (Number(d.removeAt) || 0)) {
      try { el.remove?.(); } catch {}
      pendingEnemyDeaths.splice(i, 1);
    }
  }
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
    if (String(enemy?.enemyType || '') === 'spawner' && Array.isArray(enemy?.spawnerNodeEnemyIds)) {
      const linkedIds = enemy.spawnerNodeEnemyIds.map((id) => Math.trunc(Number(id) || 0)).filter((id) => id > 0);
      for (const linkedId of linkedIds) {
        const child = enemies.find((e) => Math.trunc(Number(e?.id) || 0) === linkedId) || null;
        if (!child) continue;
        removeEnemy(child, 'killed');
        const childIdx = enemies.indexOf(child);
        if (childIdx >= 0) enemies.splice(childIdx, 1);
      }
    }
    const linkedSpawnerId = Math.trunc(Number(enemy?.linkedSpawnerId) || 0);
    const linkedSpawnerStepIndex = Math.trunc(Number(enemy?.linkedSpawnerStepIndex) || 0);
    const linkedEnemyMaxHp = Math.max(0, Number(enemy?.maxHp) || 0);
    if (linkedSpawnerId > 0) {
      clearSpawnerNodeEnemyReference(linkedSpawnerId, linkedSpawnerStepIndex, enemy?.id);
      const owner = enemies.find((e) => Math.trunc(Number(e?.id) || 0) === linkedSpawnerId && String(e?.enemyType || '') === 'spawner') || null;
      if (owner && linkedEnemyMaxHp > 0) {
        damageEnemy(owner, linkedEnemyMaxHp);
      }
    }
    const idx = enemies.indexOf(enemy);
    const screenFromTransform = (() => {
      const tr = String(enemy?.el?.style?.transform || '');
      const m = tr.match(/translate\(\s*([-\d.]+)px,\s*([-\d.]+)px\s*\)/i);
      if (!m) return null;
      const x = Number(m[1]);
      const y = Number(m[2]);
      return (Number.isFinite(x) && Number.isFinite(y)) ? { x, y } : null;
    })();
    const s0 = worldToScreen({ x: Number(enemy.wx) || 0, y: Number(enemy.wy) || 0 }) || screenFromTransform || {
      x: window.innerWidth * 0.5,
      y: window.innerHeight * 0.5,
    };
    if (idx >= 0) enemies.splice(idx, 1);
    enemy.vx = 0;
    enemy.vy = 0;
    const deathEl = document.createElement('div');
    deathEl.className = 'beat-swarm-enemy beat-swarm-enemy-deathfx is-dying';
    if (s0 && Number.isFinite(s0.x) && Number.isFinite(s0.y)) {
      deathEl.style.setProperty('--bs-death-x', `${s0.x}px`);
      deathEl.style.setProperty('--bs-death-y', `${s0.y}px`);
    } else {
      deathEl.style.setProperty('--bs-death-x', '-9999px');
      deathEl.style.setProperty('--bs-death-y', '-9999px');
    }
    try { enemyLayerEl?.appendChild?.(deathEl); } catch {}
    const deathFamily = classifyEnemyDeathFamily(enemy);
    const deathEventKey = resolveEnemyDeathEventKey(deathFamily, 'enemyDeathMedium');
    removeEnemy(enemy, 'killed');
    pendingEnemyDeaths.push({
      el: deathEl,
      wx: Number(enemy.wx) || 0,
      wy: Number(enemy.wy) || 0,
      soundNote: clampNoteToDirectorPool(
        normalizeSwarmNoteName(enemy.soundNote) || getRandomSwarmPentatonicNote(),
        Math.max(0, Math.trunc(Number(enemy?.id) || 0)) + Math.max(0, Math.trunc(Number(currentBeatIndex) || 0))
      ),
      soundVolume: getStageSoundVolume(activeDamageSoundStageIndex),
      soundFamily: deathFamily,
      soundEventKey: deathEventKey,
      sourceEnemyId: Number.isFinite(enemy?.id) ? Math.trunc(enemy.id) : null,
      popBeat: Math.max(0, Math.trunc(Number(currentBeatIndex) || 0)) + 1,
      fallbackPopAt: (performance.now() || 0) + (ENEMY_DEATH_POP_FALLBACK_SECONDS * 1000),
      popped: false,
      removeAt: 0,
    });
    noteEnergyGravityKill();
    return true;
  }
  return false;
}

function clearEnemies() {
  while (enemies.length) {
    removeEnemy(enemies.pop(), 'mode_exit_clear');
  }
  composerEnemyGroups.length = 0;
  singletonEnemyMusicGroups.clear();
  singletonEnemyMusicGroupIdSeq = 1;
  clearPendingEnemyDeaths();
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

function spawnEnemyAt(clientX, clientY, options = null) {
  if (!enemyLayerEl) return;
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return;
  // Allow rhythm spawners to add pressure beyond baseline population control.
  if (enemies.length >= Math.max(1, Math.trunc(Number(ENEMY_CAP) || 1))) return;
  const w = screenToWorld({ x: clientX, y: clientY });
  if (!w || !Number.isFinite(w.x) || !Number.isFinite(w.y)) return;
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
  const linkedSpawnerId = Number.isFinite(options?.linkedSpawnerId) ? Math.trunc(Number(options.linkedSpawnerId)) : null;
  const linkedSpawnerStepIndex = Number.isFinite(options?.linkedSpawnerStepIndex) ? Math.trunc(Number(options.linkedSpawnerStepIndex)) : null;
  let linkedSpawnerLineEl = null;
  if (linkedSpawnerId && linkedSpawnerStepIndex != null) {
    linkedSpawnerLineEl = document.createElement('div');
    linkedSpawnerLineEl.className = 'beat-swarm-spawner-link';
    linkedSpawnerLineEl.style.transform = 'translate(-9999px, -9999px)';
    try {
      enemyLayerEl.insertBefore(linkedSpawnerLineEl, el);
    } catch {
      enemyLayerEl.appendChild(linkedSpawnerLineEl);
    }
  }
  const hpOverride = Number(options?.hp);
  const hpValue = Math.max(1, Number.isFinite(hpOverride) ? hpOverride : (Number(currentEnemySpawnMaxHp) || 1));
  const created = {
    id: enemyIdSeq++,
    wx: w.x,
    wy: w.y,
    vx: 0,
    vy: 0,
    soundNote: getRandomSwarmPentatonicNote(),
    el,
    hp: hpValue,
    maxHp: hpValue,
    hpFillEl: hpFill,
    spawnT: 0,
    spawnDur: ENEMY_SPAWN_DURATION,
    enemyType: 'dumb',
    musicalRole: BEAT_EVENT_ROLES.ACCENT,
    composerRole: BEAT_EVENT_ROLES.ACCENT,
    projectileHitRadiusPx: 0,
    linkedSpawnerId,
    linkedSpawnerStepIndex,
    linkedSpawnerLineEl,
    linkedSpawnerLineVisible: linkedSpawnerLineEl ? false : null,
    linkedSpawnerLineLastX: NaN,
    linkedSpawnerLineLastY: NaN,
    linkedSpawnerLineLastLen: NaN,
    linkedSpawnerLineLastAng: NaN,
    lifecycleState: 'active',
  };
  enemies.push(created);
  const group = ensureSingletonMusicGroupForEnemy(created, {
    role: getSwarmRoleForEnemy(created, BEAT_EVENT_ROLES.ACCENT),
    actionType: 'enemy-accent',
    note: created.soundNote,
    instrumentId: resolveSwarmRoleInstrumentId(
      getSwarmRoleForEnemy(created, BEAT_EVENT_ROLES.ACCENT),
      resolveSwarmSoundInstrumentId('projectile') || 'tone'
    ),
    lifecycleState: created.lifecycleState,
  });
  syncSingletonEnemyStateFromMusicGroup(created, group);
}

function getUsedSpawnerEnemyInstrumentIds() {
  const used = new Set();
  for (const g of getAllActiveMusicGroups()) {
    if (String(g?.enemyType || '').trim().toLowerCase() !== 'spawner') continue;
    const id = String(g?.instrumentId || g?.instrument || '').trim();
    if (id) used.add(id);
  }
  return used;
}

function getUsedEnemyInstrumentIds() {
  const used = new Set();
  for (const id of getUsedSpawnerEnemyInstrumentIds()) used.add(id);
  for (const g of getAllActiveMusicGroups()) {
    const id = String(g?.instrumentId || g?.instrument || '').trim();
    if (id) used.add(id);
  }
  return used;
}

function getUsedWeaponInstrumentIds() {
  const used = new Set();
  try {
    for (const key of Object.keys(SWARM_SOUND_EVENTS || {})) {
      const id = String(resolveSwarmSoundInstrumentId(key) || '').trim();
      if (id) used.add(id);
    }
  } catch {}
  return used;
}

function getEnemyToyKeyCandidates(toyKey) {
  const key = String(toyKey || '').trim().toLowerCase();
  if (!key) return ['drawgrid', 'loopgrid'];
  if (key === 'loopgrid-drum') return ['loopgrid-drum', 'loopgrid'];
  return [key];
}

function entryMatchesToy(entry, toyKey) {
  const key = String(toyKey || '').trim().toLowerCase();
  if (!key) return false;
  return Array.isArray(entry?.recommendedToys) && entry.recommendedToys.map((t) => String(t || '').toLowerCase()).includes(key);
}

function normalizeEnemyInstrumentLane(laneLike, fallback = 'lead') {
  const raw = String(laneLike || '').trim().toLowerCase();
  if (raw === 'bass' || raw === 'lead' || raw === 'accent' || raw === 'motion') return raw;
  if (raw === 'drum' || raw === 'rhythm' || raw === 'groove') return 'bass';
  if (raw === 'phrase' || raw === 'melody') return 'lead';
  if (raw === 'fx' || raw === 'effect') return 'accent';
  if (raw === 'texture' || raw === 'cosmetic' || raw === 'ambient') return 'motion';
  return String(fallback || 'lead').trim().toLowerCase() || 'lead';
}

function inferEnemyLaneFromToyKey(toyKey) {
  const key = String(toyKey || '').trim().toLowerCase();
  if (key === 'loopgrid-drum' || key === 'loopgrid') return 'bass';
  return 'lead';
}

function inferEnemyLaneFromRole(roleLike, fallbackLane = 'lead') {
  const role = normalizeSwarmRole(roleLike, '');
  if (role === BEAT_EVENT_ROLES.BASS) return 'bass';
  if (role === BEAT_EVENT_ROLES.LEAD) return 'lead';
  if (role === BEAT_EVENT_ROLES.MOTION) return 'motion';
  if (role === BEAT_EVENT_ROLES.ACCENT) return 'accent';
  return normalizeEnemyInstrumentLane(fallbackLane, 'lead');
}

function entryMatchesTheme(entry, themeKey = '') {
  const theme = String(themeKey || '').trim();
  if (!theme) return true;
  return Array.isArray(entry?.themes) && entry.themes.includes(theme);
}

function entryMatchesLane(entry, lane = 'lead', toyCandidates = null) {
  const laneKey = normalizeEnemyInstrumentLane(lane, 'lead');
  const laneHints = Array.isArray(entry?.laneHints)
    ? entry.laneHints.map((v) => normalizeEnemyInstrumentLane(v, '')).filter(Boolean)
    : [];
  if (laneHints.includes(laneKey)) return true;
  const pitchRank = Number(entry?.pitchRank);
  const family = String(entry?.instrumentFamily || '').trim().toLowerCase();
  const functionTag = String(entry?.functionTag || '').trim().toLowerCase();
  const type = String(entry?.type || '').trim().toLowerCase();
  const candidates = Array.isArray(toyCandidates) ? toyCandidates : [];
  const isLoopgridRecommended = candidates.some((k) => k === 'loopgrid' || k === 'loopgrid-drum')
    && (entryMatchesToy(entry, 'loopgrid') || entryMatchesToy(entry, 'loopgrid-drum'));
  const isDrawgridRecommended = candidates.includes('drawgrid') && entryMatchesToy(entry, 'drawgrid');
  if (laneKey === 'bass') {
    if (Number.isFinite(pitchRank) && pitchRank <= 3) return true;
    if (family.includes('bass') || family.includes('drum') || family.includes('kick') || family.includes('djembe')) return true;
    return isLoopgridRecommended;
  }
  if (laneKey === 'lead') {
    if (Number.isFinite(pitchRank) && pitchRank >= 3) return isDrawgridRecommended || !isLoopgridRecommended;
    if (
      family.includes('piano')
      || family.includes('guitar')
      || family.includes('kalimba')
      || family.includes('xylophone')
      || family.includes('marimba')
      || family.includes('ukulele')
    ) return true;
    return isDrawgridRecommended;
  }
  if (laneKey === 'accent') {
    if (functionTag.includes('short')) return true;
    if (
      family.includes('clap')
      || family.includes('snare')
      || family.includes('hihat')
      || family.includes('cowbell')
      || family.includes('percussion')
    ) return true;
    return Number.isFinite(pitchRank) ? (pitchRank >= 3 && pitchRank <= 4) : false;
  }
  if (laneKey === 'motion') {
    if (type.includes('effects')) return true;
    if (functionTag.includes('ambient') || functionTag.includes('texture')) return true;
    return laneHints.includes('motion');
  }
  return true;
}

function pickEntryIdWithPriority(entries) {
  const list = Array.isArray(entries) ? entries.filter((e) => String(e?.id || '').trim()) : [];
  if (!list.length) return '';
  const pri = list.filter((e) => e?.priority);
  const pool = pri.length ? pri : list;
  const picked = pool[Math.max(0, Math.min(pool.length - 1, Math.trunc(Math.random() * pool.length)))] || null;
  return String(picked?.id || '').trim();
}

function pickSpawnerEnemyInstrumentId(preferredId = '') {
  return pickEnemyInstrumentIdForToy('loopgrid-drum', preferredId, null, { lane: 'bass', role: BEAT_EVENT_ROLES.BASS });
}

function pickEnemyInstrumentIdForToy(toyKey, preferredId = '', extraUsed = null, options = null) {
  const preferred = String(preferredId || '').trim();
  const theme = getSoundThemeKey?.() || '';
  const candidates = getEnemyToyKeyCandidates(toyKey);
  const lane = normalizeEnemyInstrumentLane(
    options?.lane || inferEnemyLaneFromRole(options?.role, inferEnemyLaneFromToyKey(toyKey)),
    inferEnemyLaneFromToyKey(toyKey)
  );
  const used = new Set();
  for (const id of getUsedWeaponInstrumentIds()) used.add(id);
  for (const id of getUsedEnemyInstrumentIds()) used.add(id);
  if (extraUsed instanceof Set) for (const id of extraUsed) used.add(String(id || '').trim());
  const entries = Array.isArray(getInstrumentEntries?.()) ? getInstrumentEntries() : [];
  if (preferred && !used.has(preferred)) {
    const preferredEntry = entries.find((e) => String(e?.id || '').trim() === preferred);
    const preferredOk = preferredEntry
      ? (
        candidates.some((k) => entryMatchesToy(preferredEntry, k))
        && entryMatchesLane(preferredEntry, lane, candidates)
      )
      : false;
    if (preferredOk) return preferred;
  }
  const lanePoolUnused = entries.filter((entry) => {
    const id = String(entry?.id || '').trim();
    if (!id || used.has(id)) return false;
    if (!entryMatchesTheme(entry, theme)) return false;
    if (!candidates.some((k) => entryMatchesToy(entry, k))) return false;
    return entryMatchesLane(entry, lane, candidates);
  });
  const lanePick = pickEntryIdWithPriority(lanePoolUnused);
  if (lanePick) return lanePick;
  const lanePoolAny = entries.filter((entry) => {
    if (!entryMatchesTheme(entry, theme)) return false;
    if (!candidates.some((k) => entryMatchesToy(entry, k))) return false;
    return entryMatchesLane(entry, lane, candidates);
  });
  const laneAnyPick = pickEntryIdWithPriority(lanePoolAny);
  if (laneAnyPick) return laneAnyPick;
  for (const key of candidates) {
    const id = String(pickInstrumentForToy?.(key, { theme, usedIds: used, preferPriority: true }) || '').trim();
    if (id) return id;
  }
  return resolveInstrumentIdOrFallback(preferred, resolveSwarmSoundInstrumentId('projectile') || 'tone');
}

function pickEnemyInstrumentIdForToyRandom(toyKey, extraUsed = null, options = null) {
  return pickEnemyInstrumentIdForToy(toyKey, '', extraUsed, options);
}

function createSpawnerEnemyRhythmProfile(options = null) {
  const arrangement = getPaletteArrangementControls();
  const role = String(options?.role || 'loop').trim().toLowerCase();
  const toyType = role === 'drum' ? 'loopgrid-drum' : 'loopgrid';
  const fallbackInstrument = role === 'drum'
    ? (resolveSwarmSoundInstrumentId('explosion') || getIdForDisplayName('Bass Tone 4') || 'tone')
    : (resolveSwarmSoundInstrumentId('projectile') || getIdForDisplayName('Tone (Sine)') || 'tone');
  let panels = Array.from(document.querySelectorAll(`.toy-panel[data-toy="${toyType}"]`));
  if (!panels.length && toyType !== 'loopgrid') panels = Array.from(document.querySelectorAll('.toy-panel[data-toy="loopgrid"]'));
  const candidates = panels.filter((p) => Array.isArray(p?.__gridState?.steps) && p.__gridState.steps.some(Boolean));
  const source = candidates.length
    ? candidates[Math.max(0, Math.min(candidates.length - 1, Math.trunc(Math.random() * candidates.length)))]
    : null;
  const stepsRaw = source && Array.isArray(source?.__gridState?.steps) ? source.__gridState.steps : [];
  const noteIdxRaw = source && Array.isArray(source?.__gridState?.noteIndices) ? source.__gridState.noteIndices : [];
  const notePaletteRaw = source && Array.isArray(source?.__gridState?.notePalette) ? source.__gridState.notePalette : LOOPGRID_FALLBACK_NOTE_PALETTE;
  const notePalette = notePaletteRaw
    .map((m) => Math.trunc(Number(m)))
    .filter((m) => Number.isFinite(m));
  const steps = Array.from({ length: 8 }, (_, i) => !!stepsRaw[i]);
  const theme = getEnergyStateThemePreset();
  const themeRhythm = pickRandomArrayItem(theme?.spawnerRhythms, null);
  if (!steps.some(Boolean)) {
    if (Array.isArray(themeRhythm)) {
      const fromTheme = createStepPattern(themeRhythm, 8);
      for (let i = 0; i < steps.length; i++) steps[i] = !!fromTheme[i];
    } else {
      for (let i = 0; i < steps.length; i++) if (Math.random() >= 0.56) steps[i] = true;
    }
    if (!steps.some(Boolean)) steps[Math.max(0, Math.min(7, Math.trunc(Math.random() * 8)))] = true;
  }
  const densitySteps = applyStepPatternDensity(steps, arrangement.density, { minHits: 1, maxHits: 6 });
  for (let i = 0; i < steps.length; i++) steps[i] = !!densitySteps[i];
  const noteIndices = Array.from({ length: 8 }, (_, i) => Math.max(0, Math.trunc(Number(noteIdxRaw[i]) || (6 + (i % 7)))));
  const srcInstrument = String(source?.dataset?.instrument || source?.dataset?.instrumentId || fallbackInstrument || 'tone');
  const instrument = pickEnemyInstrumentIdForToy(toyType, srcInstrument, null, {
    lane: 'bass',
    role: BEAT_EVENT_ROLES.BASS,
  });
  const resolvedPalette = notePalette.length ? notePalette : Array.from(LOOPGRID_FALLBACK_NOTE_PALETTE);
  const firstActiveStep = Math.max(0, steps.findIndex(Boolean));
  const baseIdx = Math.max(0, Math.trunc(Number(noteIndices[firstActiveStep >= 0 ? firstActiveStep : 0]) || 0));
  const baseMidi = Math.trunc(Number(resolvedPalette[baseIdx % Math.max(1, resolvedPalette.length)]) || 60);
  const baseNoteName = clampNoteToDirectorPool(normalizeSwarmNoteName(midiToName(baseMidi)) || 'C4', baseIdx);
  return { steps, noteIndices, notePalette: resolvedPalette, instrument, baseNoteName };
}

function hashStringSeed(input = '') {
  const s = String(input || '');
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededNoise01(seedValue = 1) {
  let x = (Math.trunc(Number(seedValue) || 1) ^ 0x9e3779b9) >>> 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return (((x >>> 0) % 10000) / 10000);
}

function rotatePattern(src, shift = 0) {
  const arr = Array.isArray(src) ? src.slice() : [];
  const len = arr.length;
  if (!len) return arr;
  const off = ((Math.trunc(Number(shift) || 0) % len) + len) % len;
  if (!off) return arr;
  return Array.from({ length: len }, (_, i) => arr[(i - off + len) % len]);
}

function thinSpawnerStepsDeterministic(stepsLike, seedBase = 1, minHits = 1, maxDropChance = 0.28) {
  const steps = Array.isArray(stepsLike) ? stepsLike.map((v) => !!v) : [];
  const active = [];
  for (let i = 0; i < steps.length; i++) {
    if (steps[i]) active.push(i);
  }
  if (active.length <= Math.max(1, Math.trunc(Number(minHits) || 1))) return steps;
  const dropChance = Math.max(0.05, Math.min(0.48, Number(maxDropChance) || 0.28));
  for (let i = 0; i < active.length; i++) {
    const idx = active[i];
    const n = seededNoise01(seedBase + (idx * 97) + (i * 23));
    if (n < dropChance) steps[idx] = false;
  }
  const minKeep = Math.max(1, Math.min(steps.length, Math.trunc(Number(minHits) || 1)));
  let keepCount = 0;
  for (let i = 0; i < steps.length; i++) if (steps[i]) keepCount += 1;
  if (keepCount >= minKeep) return steps;
  const ranked = active
    .slice()
    .sort((a, b) => seededNoise01(seedBase + (a * 131)) - seededNoise01(seedBase + (b * 131)));
  for (let i = 0; i < ranked.length && keepCount < minKeep; i++) {
    const idx = ranked[i];
    if (steps[idx]) continue;
    steps[idx] = true;
    keepCount += 1;
  }
  return steps;
}

function buildSpawnerProfileVariant(baseProfile, enemyId = 0, motifScopeKey = '') {
  const base = baseProfile && typeof baseProfile === 'object' ? baseProfile : {};
  const baseSteps = Array.isArray(base.steps) ? base.steps.map((v) => !!v) : Array.from({ length: 8 }, () => false);
  const baseNoteIndices = Array.isArray(base.noteIndices) ? base.noteIndices.map((v) => Math.max(0, Math.trunc(Number(v) || 0))) : Array.from({ length: 8 }, () => 0);
  const palette = Array.isArray(base.notePalette) && base.notePalette.length
    ? base.notePalette.slice()
    : Array.from(LOOPGRID_FALLBACK_NOTE_PALETTE);
  const id = Math.max(0, Math.trunc(Number(enemyId) || 0));
  const seedBase = hashStringSeed(`${motifScopeKey}|spawner|${id}`);
  const rotationCandidates = [1, 3, 5, 7, 2, 6, 4];
  const rotation = (id > 0)
    ? rotationCandidates[Math.trunc(seedBase % rotationCandidates.length)]
    : 0;
  const noteOffset = ((Math.trunc(seedBase / 11) % 7) - 3);
  const minHits = baseSteps.filter(Boolean).length >= 3 ? 2 : 1;
  const rawSteps = rotatePattern(baseSteps, rotation);
  const steps = thinSpawnerStepsDeterministic(
    rawSteps,
    seedBase + 17,
    minHits,
    0.18 + (seededNoise01(seedBase + 31) * 0.14)
  );
  const noteIndices = rotatePattern(baseNoteIndices, rotation).map((n) => Math.max(0, n + noteOffset));
  if (!steps.some(Boolean)) {
    const fallbackIdx = ((rotation % Math.max(1, steps.length)) + steps.length) % steps.length;
    steps[fallbackIdx] = true;
  }
  const firstActiveStep = Math.max(0, steps.findIndex(Boolean));
  const baseIdx = Math.max(0, Math.trunc(Number(noteIndices[firstActiveStep]) || 0));
  const baseMidi = Math.trunc(Number(palette[baseIdx % Math.max(1, palette.length)]) || 60);
  const baseNoteName = clampNoteToDirectorPool(normalizeSwarmNoteName(midiToName(baseMidi)) || 'C4', baseIdx);
  return {
    ...base,
    steps,
    noteIndices,
    notePalette: palette,
    baseNoteName,
    variation: {
      rotation,
      noteOffset,
      thinningSeed: seedBase + 17,
    },
  };
}

function applySpawnerCollisionAvoidance(activeSpawners = []) {
  const getSpawnerPatternDistance = (stepsA, notesA, stepsB, notesB) => {
    let stepDelta = 0;
    let noteDelta = 0;
    for (let i = 0; i < 8; i++) {
      const aOn = !!stepsA?.[i];
      const bOn = !!stepsB?.[i];
      if (aOn !== bOn) {
        stepDelta += 1;
        noteDelta += 0.35;
        continue;
      }
      if (!aOn) continue;
      const aIdx = Math.max(0, Math.trunc(Number(notesA?.[i]) || 0));
      const bIdx = Math.max(0, Math.trunc(Number(notesB?.[i]) || 0));
      noteDelta += Math.min(4, Math.abs(aIdx - bIdx)) * 0.6;
    }
    return stepDelta + noteDelta;
  };
  const MIN_PATTERN_DISTANCE = 2.6;
  const MIN_DISTANCE_FOR_DUP_PRIMARY_NOTE = 4.1;
  const list = Array.isArray(activeSpawners) ? activeSpawners : [];
  if (list.length <= 1) return;
  const usedSignatures = new Set();
  const usedPrimaryNotes = new Set();
  const acceptedPatterns = [];
  for (const enemy of list) {
    if (!enemy || enemy?.retreating) continue;
    const group = getEnemyMusicGroup(enemy, 'spawner-spawn');
    const stepsSrc = Array.isArray(group?.steps) ? group.steps.map((v) => !!v) : Array.from({ length: 8 }, () => false);
    const noteIndicesSrc = Array.isArray(enemy?.spawnerNoteIndices)
      ? enemy.spawnerNoteIndices.map((v) => Math.max(0, Math.trunc(Number(v) || 0)))
      : Array.from({ length: 8 }, () => 0);
    const palette = Array.isArray(enemy.spawnerNotePalette) && enemy.spawnerNotePalette.length
      ? enemy.spawnerNotePalette.slice()
      : Array.from(LOOPGRID_FALLBACK_NOTE_PALETTE);
    let resolvedSteps = stepsSrc.slice(0, 8);
    let resolvedNoteIndices = noteIndicesSrc.slice(0, 8);
    let resolvedPrimaryNote = '';
    let resolvedSignature = '';
    let resolvedRotation = 0;
    let resolvedOffset = 0;
    let resolvedDistance = 0;
    const seedBase = hashStringSeed(`${String(enemy?.motifScopeKey || 'spawner')}|avoid|${Math.trunc(Number(enemy?.id) || 0)}`);
    const rotationOrder = [1, 3, 5, 7, 2, 6, 4, 0];
    const offsetOrder = [0, 1, -1, 2, -2, 3, -3, 4];
    let bestFallback = null;
    let bestFallbackScore = Number.NEGATIVE_INFINITY;
    for (let attempt = 0; attempt < 12; attempt++) {
      const rotation = rotationOrder[Math.trunc((seedBase + attempt) % rotationOrder.length)];
      const offset = offsetOrder[Math.trunc((seedBase + (attempt * 3)) % offsetOrder.length)];
      const preThinSteps = rotatePattern(stepsSrc, rotation);
      const minHits = preThinSteps.filter(Boolean).length >= 3 ? 2 : 1;
      const testSteps = thinSpawnerStepsDeterministic(
        preThinSteps,
        seedBase + (attempt * 101),
        minHits,
        0.16 + (seededNoise01(seedBase + (attempt * 29)) * 0.16)
      );
      const testNoteIndices = rotatePattern(noteIndicesSrc, rotation).map((n) => Math.max(0, n + offset));
      const entries = [];
      for (let i = 0; i < 8; i++) {
        if (!testSteps[i]) continue;
        const midi = Math.trunc(Number(palette[testNoteIndices[i] % Math.max(1, palette.length)]) || 60);
        entries.push(`${i}:${normalizeSwarmNoteName(midiToName(midi)) || 'C4'}`);
      }
      const signature = entries.join('|');
      const firstStep = Math.max(0, testSteps.findIndex(Boolean));
      const firstIdx = Math.max(0, Math.trunc(Number(testNoteIndices[firstStep]) || 0));
      const firstMidi = Math.trunc(Number(palette[firstIdx % Math.max(1, palette.length)]) || 60);
      const primaryNote = normalizeSwarmNoteName(midiToName(firstMidi)) || 'C4';
      const minDistance = acceptedPatterns.length
        ? acceptedPatterns.reduce((minSoFar, p) => Math.min(
          minSoFar,
          getSpawnerPatternDistance(testSteps, testNoteIndices, p.steps, p.noteIndices)
        ), Number.POSITIVE_INFINITY)
        : Number.POSITIVE_INFINITY;
      const signatureUnique = !usedSignatures.has(signature);
      const primaryUnique = !usedPrimaryNotes.has(primaryNote);
      const distanceOk = minDistance >= MIN_PATTERN_DISTANCE;
      const primaryNoteOk = primaryUnique || minDistance >= MIN_DISTANCE_FOR_DUP_PRIMARY_NOTE;
      const score = (signatureUnique ? 100 : -80)
        + (primaryUnique ? 18 : -8)
        + (Math.min(8, Number.isFinite(minDistance) ? minDistance : 8) * 6);
      if (score > bestFallbackScore) {
        bestFallbackScore = score;
        bestFallback = {
          steps: testSteps,
          noteIndices: testNoteIndices,
          primaryNote,
          signature,
          rotation,
          offset,
          minDistance,
        };
      }
      if (signatureUnique && distanceOk && primaryNoteOk) {
        resolvedSteps = testSteps;
        resolvedNoteIndices = testNoteIndices;
        resolvedPrimaryNote = primaryNote;
        resolvedSignature = signature;
        resolvedRotation = rotation;
        resolvedOffset = offset;
        resolvedDistance = Number.isFinite(minDistance) ? minDistance : 0;
        break;
      }
      if (attempt === 11) {
        const fb = bestFallback || {
          steps: testSteps,
          noteIndices: testNoteIndices,
          primaryNote,
          signature,
          rotation,
          offset,
          minDistance,
        };
        resolvedSteps = fb.steps;
        resolvedNoteIndices = fb.noteIndices;
        resolvedPrimaryNote = fb.primaryNote;
        resolvedSignature = fb.signature;
        resolvedRotation = fb.rotation;
        resolvedOffset = fb.offset;
        resolvedDistance = Number.isFinite(fb.minDistance) ? fb.minDistance : 0;
      }
    }
    enemy.spawnerSteps = resolvedSteps;
    enemy.spawnerNoteIndices = resolvedNoteIndices;
    enemy.spawnerNoteName = clampNoteToDirectorPool(
      resolvedPrimaryNote || enemy.spawnerNoteName || 'C4',
      Math.trunc(Number(enemy?.id) || 0)
    );
    enemy.spawnerCollisionVariant = {
      rotation: resolvedRotation,
      noteOffset: resolvedOffset,
      signature: resolvedSignature,
      minDistance: resolvedDistance,
    };
    usedSignatures.add(resolvedSignature);
    usedPrimaryNotes.add(enemy.spawnerNoteName);
    acceptedPatterns.push({
      steps: resolvedSteps,
      noteIndices: resolvedNoteIndices,
      primaryNote: enemy.spawnerNoteName,
      signature: resolvedSignature,
    });
    const syncedGroup = ensureSingletonMusicGroupForEnemy(enemy, {
      role: getSwarmRoleForEnemy(enemy, BEAT_EVENT_ROLES.BASS),
      actionType: 'spawner-spawn',
      note: enemy.spawnerNoteName,
      instrumentId: enemy.spawnerInstrument,
      steps: enemy.spawnerSteps,
    });
    syncSingletonEnemyStateFromMusicGroup(enemy, syncedGroup);
  }
}

function createDrawSnakeEnemyProfile() {
  const arrangement = getPaletteArrangementControls();
  const fallbackInstrument = resolveSwarmSoundInstrumentId('projectile') || getIdForDisplayName('Tone (Sine)') || 'tone';
  const theme = getEnergyStateThemePreset();
  const phrase = pickRandomArrayItem(theme?.drawsnakePhrases, null);
  const lockedHook = getLockedMotifHook(getComposerMotifScopeKey(), 4);
  const steps = Array.isArray(phrase?.steps)
    ? createStepPattern(phrase.steps, WEAPON_TUNE_STEPS)
    : Array.from({ length: WEAPON_TUNE_STEPS }, () => Math.random() >= 0.5);
  if (!steps.some(Boolean)) steps[Math.max(0, Math.min(WEAPON_TUNE_STEPS - 1, Math.trunc(Math.random() * WEAPON_TUNE_STEPS)))] = true;
  const densitySteps = applyStepPatternDensity(steps, arrangement.density, { minHits: 1, maxHits: Math.max(2, WEAPON_TUNE_STEPS - 1) });
  for (let i = 0; i < steps.length; i++) steps[i] = !!densitySteps[i];
  const hookRows = Array.isArray(lockedHook?.notes)
    ? lockedHook.notes.map((n) => {
      const idx = getNotePoolIndex(n);
      return idx >= 0 ? idx : 0;
    })
    : [];
  const rows = Array.isArray(phrase?.rows)
    ? createRowPattern(phrase.rows, WEAPON_TUNE_STEPS, SWARM_PENTATONIC_NOTES_ONE_OCTAVE.length)
    : Array.from({ length: WEAPON_TUNE_STEPS }, (_, i) => {
      if (hookRows.length) return hookRows[i % hookRows.length];
      return Math.max(0, Math.min(SWARM_PENTATONIC_NOTES_ONE_OCTAVE.length - 1, Math.trunc(Math.random() * SWARM_PENTATONIC_NOTES_ONE_OCTAVE.length)));
    });
  const midRow = Math.max(0, Math.floor((SWARM_PENTATONIC_NOTES_ONE_OCTAVE.length - 1) * 0.5));
  const spread = 0.34 + (arrangement.octaveEmphasis * 0.66);
  for (let i = 0; i < rows.length; i++) {
    const raw = Math.max(0, Math.min(SWARM_PENTATONIC_NOTES_ONE_OCTAVE.length - 1, Math.trunc(Number(rows[i]) || midRow)));
    rows[i] = Math.max(0, Math.min(
      SWARM_PENTATONIC_NOTES_ONE_OCTAVE.length - 1,
      Math.trunc(Math.round(midRow + ((raw - midRow) * spread)))
    ));
  }
  const usedDrawSnake = new Set(
    getAllActiveMusicGroups()
      .filter((g) => String(g?.enemyType || '').trim().toLowerCase() === 'drawsnake')
      .map((g) => String(g?.instrumentId || g?.instrument || '').trim())
      .filter(Boolean)
  );
  let instrument = pickEnemyInstrumentIdForToyRandom('drawgrid', usedDrawSnake, {
    lane: 'lead',
    role: BEAT_EVENT_ROLES.LEAD,
  });
  if (!instrument) instrument = fallbackInstrument;
  const lineWidthPx = getDrawSnakeLineWidthPxFromDrawgrid();
  return { steps, rows, instrument, lineWidthPx };
}

function getDrawSnakeLineWidthPxFromDrawgrid() {
  const fallback = Math.max(2, Number(DRAW_SNAKE_LINE_WIDTH_PX_FALLBACK) || 6);
  const panels = Array.from(document.querySelectorAll('.toy-panel[data-toy="drawgrid"]'));
  if (!panels.length) return fallback;
  for (const panel of panels) {
    try {
      const rect = panel.getBoundingClientRect?.();
      const w = Math.max(1, Number(rect?.width) || 0);
      const h = Math.max(1, Number(rect?.height) || 0);
      if (!(w > 0 && h > 0)) continue;
      const st = panel.__drawToy?.getState?.() || null;
      const steps = Math.max(1, Math.trunc(Number(st?.steps) || WEAPON_TUNE_STEPS));
      const rows = Math.max(1, DRAWGRID_TUNE_ROWS);
      const cell = Math.max(4, Math.min(w / steps, h / rows));
      const lineWidthPx = Math.max(2, Math.min(60, cell * 0.8));
      if (Number.isFinite(lineWidthPx) && lineWidthPx > 0) return lineWidthPx;
    } catch {}
  }
  return fallback;
}

function spawnSpawnerEnemyAt(clientX, clientY, options = null) {
  if (!enemyLayerEl) return;
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return;
  if (enemies.length >= Math.max(1, Math.trunc(Number(ENEMY_CAP) || 1))) return;
  const w = screenToWorld({ x: clientX, y: clientY });
  if (!w || !Number.isFinite(w.x) || !Number.isFinite(w.y)) return;
  const role = String(options?.role || '').trim().toLowerCase();
  const profileBase = options?.profile || createSpawnerEnemyRhythmProfile({ role });
  const previewEnemyId = enemyIdSeq;
  const profile = buildSpawnerProfileVariant(profileBase, previewEnemyId, String(options?.motifScopeKey || 'spawn'));
  const el = document.createElement('div');
  el.className = 'beat-swarm-enemy is-spawner-enemy';
  const grid = document.createElement('div');
  grid.className = 'beat-swarm-enemy-spawner-grid';
  const gridCells = [];
  for (let i = 0; i < 9; i++) {
    const cell = document.createElement('div');
    cell.className = 'beat-swarm-enemy-spawner-cell';
    if (i === 4) cell.classList.add('is-center');
    grid.appendChild(cell);
    gridCells.push(cell);
  }
  for (let i = 0; i < 8; i++) {
    if (!profile.steps[i]) continue;
    const map = SPAWNER_ENEMY_GRID_STEP_TO_CELL[i];
    if (!map) continue;
    const cellIndex = (Math.max(0, Math.min(2, map.r)) * 3) + Math.max(0, Math.min(2, map.c));
    const cell = gridCells[cellIndex];
    if (cell) cell.classList.add('is-active-note');
  }
  const hpWrap = document.createElement('div');
  hpWrap.className = 'beat-swarm-enemy-hp';
  const hpFill = document.createElement('div');
  hpFill.className = 'beat-swarm-enemy-hp-fill';
  hpWrap.appendChild(hpFill);
  el.appendChild(grid);
  el.appendChild(hpWrap);
  enemyLayerEl.appendChild(el);
  const s0 = worldToScreen({ x: w.x, y: w.y });
  if (s0 && Number.isFinite(s0.x) && Number.isFinite(s0.y)) {
    el.style.transform = `translate(${s0.x}px, ${s0.y}px) scale(${ENEMY_SPAWN_START_SCALE})`;
  } else {
    el.style.transform = `translate(-9999px, -9999px) scale(${ENEMY_SPAWN_START_SCALE})`;
  }
  const hpBase = Math.max(1, Number(currentEnemySpawnMaxHp) || 1);
  const mappedRole = normalizeSwarmRole(role || 'bass', BEAT_EVENT_ROLES.BASS);
  const created = {
    id: enemyIdSeq++,
    wx: w.x,
    wy: w.y,
    vx: 0,
    vy: 0,
    soundNote: getRandomSwarmPentatonicNote(),
    el,
    hp: hpBase * SPAWNER_ENEMY_HEALTH_MULTIPLIER,
    maxHp: hpBase * SPAWNER_ENEMY_HEALTH_MULTIPLIER,
    hpFillEl: hpFill,
    spawnT: 0,
    spawnDur: ENEMY_SPAWN_DURATION,
    enemyType: 'spawner',
    projectileHitRadiusPx: SPAWNER_ENEMY_PROJECTILE_HIT_RADIUS_PX,
    spawnerSteps: profile.steps.slice(0, 8),
    spawnerNoteIndices: profile.noteIndices.slice(0, 8),
    spawnerNotePalette: Array.isArray(profile.notePalette) ? profile.notePalette.slice() : Array.from(LOOPGRID_FALLBACK_NOTE_PALETTE),
    spawnerNoteName: clampNoteToDirectorPool(normalizeSwarmNoteName(profile.baseNoteName) || 'C4', previewEnemyId),
    spawnerInstrument: profile.instrument,
    spawnerNodeEnemyIds: Array.from({ length: 8 }, () => 0),
    spawnerCells: gridCells,
    spawnerCellFlash: Array.from({ length: 9 }, () => 0),
    spawnerCellPop: Array.from({ length: 9 }, () => 0),
    musicalRole: mappedRole,
    composerRole: mappedRole,
    lifecycleState: 'active',
    retreating: false,
  };
  enemies.push(created);
  const createdGroup = ensureSingletonMusicGroupForEnemy(created, {
    role: mappedRole,
    actionType: 'spawner-spawn',
    note: created.spawnerNoteName,
    instrumentId: created.spawnerInstrument,
    steps: created.spawnerSteps,
    lifecycleState: created.lifecycleState,
  });
  syncSingletonEnemyStateFromMusicGroup(created, createdGroup);
}

function spawnSpawnerEnemyOffscreen(options = null) {
  const w = Math.max(1, Number(window.innerWidth) || 0);
  const h = Math.max(1, Number(window.innerHeight) || 0);
  const m = Math.max(8, Number(ENEMY_FALLBACK_SPAWN_MARGIN_PX) || 42);
  const side = Math.floor(Math.random() * 4);
  let x = 0;
  let y = 0;
  if (side === 0) {
    x = -m;
    y = randRange(0, h);
  } else if (side === 1) {
    x = w + m;
    y = randRange(0, h);
  } else if (side === 2) {
    x = randRange(0, w);
    y = -m;
  } else {
    x = randRange(0, w);
    y = h + m;
  }
  spawnSpawnerEnemyAt(x, y, options);
}

function maintainSpawnerEnemyPopulation() {
  if (!SPAWNER_ENEMY_ENABLED) return;
  const pacingCaps = getCurrentPacingCaps();
  const composer = getComposerDirective();
  const motifScopeKey = getComposerMotifScopeKey();
  const target = composerRuntime.enabled
    ? Math.max(0, Math.trunc(Number(composer.drumLoops) || 0))
    : Math.max(0, Math.trunc(Number(SPAWNER_ENEMY_TARGET_COUNT) || 0));
  const pacedTarget = Math.max(0, Math.min(target, pacingCaps.maxSpawners));
  const spawners = enemies.filter((e) => String(e?.enemyType || '') === 'spawner');
  const rankedSpawners = spawners
    .slice()
    .sort((a, b) => Math.trunc(Number(a?.id) || 0) - Math.trunc(Number(b?.id) || 0));
  for (let i = 0; i < rankedSpawners.length; i++) {
    const enemy = rankedSpawners[i];
    if (enemy?.retreating) {
      enemy.musicParticipationGain = 0;
      enemy.lifecycleState = 'retiring';
    } else {
      const shouldSchedule = i < pacedTarget;
      enemy.musicParticipationGain = shouldSchedule ? 1 : 0.35;
      enemy.lifecycleState = shouldSchedule ? 'active' : 'inactiveForScheduling';
    }
    const syncGroup = ensureSingletonMusicGroupForEnemy(enemy, {
      role: getSwarmRoleForEnemy(enemy, BEAT_EVENT_ROLES.BASS),
      actionType: 'spawner-spawn',
      note: enemy?.spawnerNoteName,
      instrumentId: enemy?.spawnerInstrument,
      steps: enemy?.spawnerSteps,
      lifecycleState: enemy?.lifecycleState || 'active',
    });
    syncSingletonEnemyStateFromMusicGroup(enemy, syncGroup);
  }
  const motif = getComposerMotif(motifScopeKey, 'spawner-drum', () => createSpawnerEnemyRhythmProfile({ role: 'drum' }));
  applySpawnerCollisionAvoidance(spawners.filter((e) => !e?.retreating));
  for (const enemy of spawners) {
    if (enemy?.retreating) continue;
    if (String(enemy?.motifScopeKey || '') === motifScopeKey) continue;
    enemy.motifScopeKey = motifScopeKey;
    const varied = buildSpawnerProfileVariant(motif, Math.trunc(Number(enemy?.id) || 0), motifScopeKey);
    enemy.spawnerSteps = Array.isArray(varied?.steps) ? varied.steps.slice(0, 8) : enemy.spawnerSteps;
    enemy.spawnerNoteIndices = Array.isArray(varied?.noteIndices) ? varied.noteIndices.slice(0, 8) : enemy.spawnerNoteIndices;
    enemy.spawnerNotePalette = Array.isArray(varied?.notePalette) ? varied.notePalette.slice() : enemy.spawnerNotePalette;
    enemy.spawnerNoteName = clampNoteToDirectorPool(
      normalizeSwarmNoteName(varied?.baseNoteName) || enemy.spawnerNoteName || 'C4',
      Math.trunc(Number(enemy?.id) || 0)
    );
    enemy.spawnerInstrument = resolveInstrumentIdOrFallback(motif?.instrument, enemy.spawnerInstrument || resolveSwarmSoundInstrumentId('projectile') || 'tone');
    const syncGroup = ensureSingletonMusicGroupForEnemy(enemy, {
      role: getSwarmRoleForEnemy(enemy, BEAT_EVENT_ROLES.BASS),
      actionType: 'spawner-spawn',
      note: enemy.spawnerNoteName,
      instrumentId: enemy.spawnerInstrument,
      steps: enemy.spawnerSteps,
      lifecycleState: enemy.lifecycleState,
    });
    syncSingletonEnemyStateFromMusicGroup(enemy, syncGroup);
    if (!Array.isArray(enemy.spawnerNodeEnemyIds)) enemy.spawnerNodeEnemyIds = Array.from({ length: 8 }, () => 0);
    const groupSteps = Array.isArray(syncGroup?.steps) ? syncGroup.steps : [];
    const activeCellIndices = new Set();
    for (let i = 0; i < 8; i++) {
      if (!groupSteps[i]) continue;
      const map = SPAWNER_ENEMY_GRID_STEP_TO_CELL[i];
      if (!map) continue;
      const cellIndex = (Math.max(0, Math.min(2, map.r)) * 3) + Math.max(0, Math.min(2, map.c));
      activeCellIndices.add(cellIndex);
    }
    for (let i = 0; i < 8; i++) {
      if (groupSteps[i]) continue;
      const linkedId = Math.trunc(Number(enemy.spawnerNodeEnemyIds[i]) || 0);
      if (!(linkedId > 0)) continue;
      const linkedEnemy = enemies.find((e) => Math.trunc(Number(e?.id) || 0) === linkedId) || null;
      if (linkedEnemy) {
        removeEnemy(linkedEnemy, 'expired');
        const linkedIdx = enemies.indexOf(linkedEnemy);
        if (linkedIdx >= 0) enemies.splice(linkedIdx, 1);
      }
      enemy.spawnerNodeEnemyIds[i] = 0;
    }
    const cells = Array.isArray(enemy?.spawnerCells) ? enemy.spawnerCells : [];
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      if (!(cell instanceof HTMLElement)) continue;
      if (i === 4) continue;
      if (activeCellIndices.has(i)) cell.classList.add('is-active-note');
      else cell.classList.remove('is-active-note');
    }
  }
  const activeCount = spawners.length;
  if (activeCount >= pacedTarget) return;
  const spawnCount = Math.min(pacedTarget - activeCount, Math.max(0, ENEMY_CAP - enemies.length));
  for (let i = 0; i < spawnCount; i++) spawnSpawnerEnemyOffscreen({ role: 'drum', profile: motif });
}

function flashSpawnerEnemyCell(enemy, stepIndex, mode = 'soft') {
  const idx = ((Math.trunc(Number(stepIndex) || 0) % 8) + 8) % 8;
  const cellMap = SPAWNER_ENEMY_GRID_STEP_TO_CELL[idx];
  if (!cellMap) return;
  const cellIndex = (Math.max(0, Math.min(2, cellMap.r)) * 3) + Math.max(0, Math.min(2, cellMap.c));
  const cell = Array.isArray(enemy?.spawnerCells) ? enemy.spawnerCells[cellIndex] : null;
  if (!(cell instanceof HTMLElement)) return;
  if (!Array.isArray(enemy.spawnerCellFlash)) {
    enemy.spawnerCellFlash = Array.from({ length: 9 }, () => 0);
  }
  if (!Array.isArray(enemy.spawnerCellPop)) {
    enemy.spawnerCellPop = Array.from({ length: 9 }, () => 0);
  }
  const group = getEnemyMusicGroup(enemy, 'spawner-spawn');
  const groupSteps = Array.isArray(group?.steps) ? group.steps : [];
  const isActive = !!groupSteps[idx];
  const pulseMode = String(mode || 'soft').trim().toLowerCase();
  const classToApply = pulseMode === 'strong'
    ? 'is-spawn-flash'
    : (pulseMode === 'alternate' ? 'is-alt-tell' : 'is-rhythm-pulse');
  const boost = pulseMode === 'strong'
    ? 1
    : (pulseMode === 'alternate' ? (isActive ? 0.84 : 0.7) : (isActive ? 0.62 : 0.34));
  const popBoost = pulseMode === 'strong'
    ? 1
    : (pulseMode === 'alternate' ? (isActive ? 0.76 : 0.62) : (isActive ? 0.46 : 0.26));
  enemy.spawnerCellFlash[cellIndex] = Math.max(Number(enemy.spawnerCellFlash[cellIndex]) || 0, boost);
  enemy.spawnerCellPop[cellIndex] = Math.max(Number(enemy.spawnerCellPop[cellIndex]) || 0, popBoost);
  cell.classList.remove('is-rhythm-pulse', 'is-spawn-flash', 'is-alt-tell');
  void cell.offsetWidth;
  cell.classList.add(classToApply);
  try { cell.style.setProperty('--bs-cell-flash', String(enemy.spawnerCellFlash[cellIndex].toFixed(3))); } catch {}
  try { cell.style.setProperty('--bs-cell-pop', String(enemy.spawnerCellPop[cellIndex].toFixed(3))); } catch {}
}

function updateSpawnerEnemyFlash(enemy, dt) {
  const cells = Array.isArray(enemy?.spawnerCells) ? enemy.spawnerCells : [];
  if (!cells.length) return;
  if (!Array.isArray(enemy.spawnerCellFlash)) {
    enemy.spawnerCellFlash = Array.from({ length: Math.max(9, cells.length) }, () => 0);
  }
  if (!Array.isArray(enemy.spawnerCellPop)) {
    enemy.spawnerCellPop = Array.from({ length: Math.max(9, cells.length) }, () => 0);
  }
  const decay = Math.max(0.001, Number(dt) || 0.016) * 2.2;
  const popDecay = Math.max(0.001, Number(dt) || 0.016) * 6.8;
  for (let i = 0; i < cells.length; i++) {
    const el = cells[i];
    if (!(el instanceof HTMLElement)) continue;
    const cur = Math.max(0, Number(enemy.spawnerCellFlash[i]) || 0);
    const popCur = Math.max(0, Number(enemy.spawnerCellPop[i]) || 0);
    const next = Math.max(0, cur - decay);
    const popNext = Math.max(0, popCur - popDecay);
    enemy.spawnerCellFlash[i] = next;
    enemy.spawnerCellPop[i] = popNext;
    try { el.style.setProperty('--bs-cell-flash', String(next.toFixed(3))); } catch {}
    try { el.style.setProperty('--bs-cell-pop', String(popNext.toFixed(3))); } catch {}
  }
}

function flashDrawSnakeNode(enemy, nodeIndex) {
  const nodes = Array.isArray(enemy?.drawsnakeNodeEls) ? enemy.drawsnakeNodeEls : [];
  if (!nodes.length) return;
  const idx = ((Math.trunc(Number(nodeIndex) || 0) % nodes.length) + nodes.length) % nodes.length;
  const node = nodes[idx];
  if (!(node instanceof HTMLElement)) return;
  if (!Array.isArray(enemy.drawsnakeNodePulseTs)) enemy.drawsnakeNodePulseTs = Array.from({ length: nodes.length }, () => 0);
  if (!Array.isArray(enemy.drawsnakeNodePulseDur)) enemy.drawsnakeNodePulseDur = Array.from({ length: nodes.length }, () => DRAW_SNAKE_NODE_PULSE_SECONDS);
  enemy.drawsnakeNodePulseTs[idx] = DRAW_SNAKE_NODE_PULSE_SECONDS;
  enemy.drawsnakeNodePulseDur[idx] = DRAW_SNAKE_NODE_PULSE_SECONDS;
  node.style.setProperty('--bs-drawsnake-node-pulse', '1');
  node.classList.remove('is-spawn');
  void node.offsetWidth;
  node.classList.add('is-spawn');
}

function spawnDrawSnakeEnemyAt(clientX, clientY, options = null) {
  if (!enemyLayerEl) return;
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return;
  if (enemies.length >= Math.max(1, Math.trunc(Number(ENEMY_CAP) || 1))) return;
  const w = screenToWorld({ x: clientX, y: clientY });
  if (!w || !Number.isFinite(w.x) || !Number.isFinite(w.y)) return;
  const role = String(options?.role || '').trim().toLowerCase();
  const profile = options?.profile || createDrawSnakeEnemyProfile();
  const el = document.createElement('div');
  el.className = 'beat-swarm-enemy is-drawsnake-enemy';
  const segLayer = document.createElement('div');
  segLayer.className = 'beat-swarm-drawsnake-segments';
  const nodeLayer = document.createElement('div');
  nodeLayer.className = 'beat-swarm-drawsnake-nodes';
  const segEls = [];
  const nodeEls = [];
  for (let i = 0; i < Math.max(1, DRAW_SNAKE_SEGMENT_COUNT - 1); i++) {
    const seg = document.createElement('div');
    seg.className = 'beat-swarm-drawsnake-segment';
    segLayer.appendChild(seg);
    segEls.push(seg);
  }
  for (let i = 0; i < DRAW_SNAKE_SEGMENT_COUNT; i++) {
    const node = document.createElement('div');
    node.className = 'beat-swarm-drawsnake-node';
    nodeLayer.appendChild(node);
    nodeEls.push(node);
  }
  const hpWrap = document.createElement('div');
  hpWrap.className = 'beat-swarm-enemy-hp';
  const hpFill = document.createElement('div');
  hpFill.className = 'beat-swarm-enemy-hp-fill';
  hpWrap.appendChild(hpFill);
  el.appendChild(segLayer);
  el.appendChild(nodeLayer);
  el.appendChild(hpWrap);
  enemyLayerEl.appendChild(el);
  el.style.transform = 'translate(-9999px, -9999px)';
  const hpBase = Math.max(1, Number(currentEnemySpawnMaxHp) || 1);
  const mappedRole = normalizeSwarmRole(role || 'lead', BEAT_EVENT_ROLES.LEAD);
  const existingSnakeCount = enemies.filter((e) => String(e?.enemyType || '') === 'drawsnake').length;
  const callResponseLane = normalizeCallResponseLane(options?.callResponseLane, (existingSnakeCount % 2) === 0 ? 'call' : 'response');
  const seedAng = Math.random() * Math.PI * 2;
  const seedDirX = Math.cos(seedAng);
  const seedDirY = Math.sin(seedAng);
  const seedTrail = Array.from({ length: Math.max(24, DRAW_SNAKE_SEGMENT_COUNT * 6) }, (_, ti) => ({
    x: w.x - (seedDirX * ti * (DRAW_SNAKE_SEGMENT_SPACING_WORLD / 5)),
    y: w.y - (seedDirY * ti * (DRAW_SNAKE_SEGMENT_SPACING_WORLD / 5)),
  }));
  const created = {
    id: enemyIdSeq++,
    wx: w.x,
    wy: w.y,
    vx: 0,
    vy: 0,
    soundNote: getRandomSwarmPentatonicNote(),
    el,
    hp: hpBase * DRAW_SNAKE_ENEMY_HEALTH_MULTIPLIER,
    maxHp: hpBase * DRAW_SNAKE_ENEMY_HEALTH_MULTIPLIER,
    hpFillEl: hpFill,
    spawnT: 0,
    spawnDur: ENEMY_SPAWN_DURATION,
    enemyType: 'drawsnake',
    projectileHitRadiusPx: 296,
    drawsnakeSteps: profile.steps.slice(0, WEAPON_TUNE_STEPS),
    drawsnakeRows: profile.rows.slice(0, WEAPON_TUNE_STEPS),
    drawsnakeInstrument: profile.instrument,
    drawsnakeLineWidthPx: Math.max(2, Number(profile.lineWidthPx) || DRAW_SNAKE_LINE_WIDTH_PX_FALLBACK),
    drawsnakeWindPhase: Math.random() * Math.PI * 2,
    drawsnakeWindDir: Math.random() >= 0.5 ? 1 : -1,
    drawsnakeMoveAngle: Math.random() * Math.PI * 2,
    drawsnakeTurnRate: 0,
    drawsnakeTurnTarget: ((Math.random() >= 0.5 ? 1 : -1) * randRange(DRAW_SNAKE_TURN_RATE_MIN, DRAW_SNAKE_TURN_RATE_MAX)),
    drawsnakeTurnTimer: randRange(DRAW_SNAKE_TURN_INTERVAL_MIN, DRAW_SNAKE_TURN_INTERVAL_MAX),
    drawsnakeSegEls: segEls,
    drawsnakeNodeEls: nodeEls,
    drawsnakeNodeWorld: Array.from({ length: DRAW_SNAKE_SEGMENT_COUNT }, (_, ni) => ({
      x: w.x - (seedDirX * ni * DRAW_SNAKE_SEGMENT_SPACING_WORLD),
      y: w.y - (seedDirY * ni * DRAW_SNAKE_SEGMENT_SPACING_WORLD),
    })),
    drawsnakeNodePulseTs: Array.from({ length: DRAW_SNAKE_SEGMENT_COUNT }, () => 0),
    drawsnakeNodePulseDur: Array.from({ length: DRAW_SNAKE_SEGMENT_COUNT }, () => DRAW_SNAKE_NODE_PULSE_SECONDS),
    drawsnakeTrail: seedTrail,
    drawsnakeHasEnteredScreen: false,
    callResponseLane,
    musicalRole: mappedRole,
    composerRole: mappedRole,
    lifecycleState: 'active',
  };
  enemies.push(created);
  const createdGroup = ensureSingletonMusicGroupForEnemy(created, {
    role: mappedRole,
    actionType: 'drawsnake-projectile',
    instrumentId: created.drawsnakeInstrument,
    steps: created.drawsnakeSteps,
    rows: created.drawsnakeRows,
    lifecycleState: created.lifecycleState,
  });
  syncSingletonEnemyStateFromMusicGroup(created, createdGroup);
}

function spawnDrawSnakeEnemyOffscreen(options = null) {
  const w = Math.max(1, Number(window.innerWidth) || 0);
  const h = Math.max(1, Number(window.innerHeight) || 0);
  const m = Math.max(8, Number(ENEMY_FALLBACK_SPAWN_MARGIN_PX) || 42);
  const side = Math.floor(Math.random() * 4);
  let x = 0;
  let y = 0;
  if (side === 0) {
    x = -m;
    y = randRange(0, h);
  } else if (side === 1) {
    x = w + m;
    y = randRange(0, h);
  } else if (side === 2) {
    x = randRange(0, w);
    y = -m;
  } else {
    x = randRange(0, w);
    y = h + m;
  }
  spawnDrawSnakeEnemyAt(x, y, options);
}

function maintainDrawSnakeEnemyPopulation() {
  if (!DRAW_SNAKE_ENEMY_ENABLED) return;
  const pacingCaps = getCurrentPacingCaps();
  const composer = getComposerDirective();
  const motifScopeKey = getComposerMotifScopeKey();
  const target = composerRuntime.enabled
    ? Math.max(0, Math.trunc(Number(composer.drawSnakes) || 0))
    : Math.max(0, Math.trunc(Number(DRAW_SNAKE_ENEMY_TARGET_COUNT) || 0));
  const pacedTarget = Math.max(0, Math.min(target, pacingCaps.maxDrawSnakes));
  const snakes = enemies.filter((e) => String(e?.enemyType || '') === 'drawsnake');
  const rankedSnakes = snakes
    .slice()
    .sort((a, b) => Math.trunc(Number(a?.id) || 0) - Math.trunc(Number(b?.id) || 0));
  for (let i = 0; i < rankedSnakes.length; i++) {
    const enemy = rankedSnakes[i];
    if (enemy?.retreating) {
      enemy.musicParticipationGain = 0;
      enemy.lifecycleState = 'retiring';
    } else {
      const shouldSchedule = i < pacedTarget;
      enemy.musicParticipationGain = shouldSchedule ? 1 : 0.35;
      enemy.lifecycleState = shouldSchedule ? 'active' : 'inactiveForScheduling';
    }
    const syncGroup = ensureSingletonMusicGroupForEnemy(enemy, {
      role: getSwarmRoleForEnemy(enemy, BEAT_EVENT_ROLES.LEAD),
      actionType: 'drawsnake-projectile',
      instrumentId: enemy?.drawsnakeInstrument,
      steps: enemy?.drawsnakeSteps,
      rows: enemy?.drawsnakeRows,
      lifecycleState: enemy?.lifecycleState || 'active',
    });
    syncSingletonEnemyStateFromMusicGroup(enemy, syncGroup);
  }
  const motif = getComposerMotif(motifScopeKey, 'drawsnake-lead', () => createDrawSnakeEnemyProfile());
  for (const enemy of snakes) {
    if (enemy?.retreating) continue;
    if (String(enemy?.motifScopeKey || '') === motifScopeKey) continue;
    enemy.motifScopeKey = motifScopeKey;
    if (Array.isArray(motif?.steps)) enemy.drawsnakeSteps = motif.steps.slice(0, WEAPON_TUNE_STEPS);
    if (Array.isArray(motif?.rows)) enemy.drawsnakeRows = motif.rows.slice(0, WEAPON_TUNE_STEPS);
    enemy.drawsnakeInstrument = resolveInstrumentIdOrFallback(motif?.instrument, enemy.drawsnakeInstrument || resolveSwarmSoundInstrumentId('projectile') || 'tone');
    const syncGroup = ensureSingletonMusicGroupForEnemy(enemy, {
      role: getSwarmRoleForEnemy(enemy, BEAT_EVENT_ROLES.LEAD),
      actionType: 'drawsnake-projectile',
      instrumentId: enemy.drawsnakeInstrument,
      steps: enemy.drawsnakeSteps,
      rows: enemy.drawsnakeRows,
      lifecycleState: enemy.lifecycleState,
    });
    syncSingletonEnemyStateFromMusicGroup(enemy, syncGroup);
    enemy.drawsnakeLineWidthPx = Math.max(2, Number(motif?.lineWidthPx) || Number(enemy.drawsnakeLineWidthPx) || DRAW_SNAKE_LINE_WIDTH_PX_FALLBACK);
  }
  const activeCount = snakes.length;
  if (activeCount >= pacedTarget) return;
  const spawnCount = Math.min(pacedTarget - activeCount, Math.max(0, ENEMY_CAP - enemies.length));
  for (let i = 0; i < spawnCount; i++) spawnDrawSnakeEnemyOffscreen({ role: 'lead', profile: motif });
}

function sampleTrailAtDistance(trail, distanceWorld) {
  const pts = Array.isArray(trail) ? trail : null;
  if (!pts || !pts.length) return null;
  if (pts.length === 1) return pts[0];
  let remain = Math.max(0, Number(distanceWorld) || 0);
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.hypot(dx, dy);
    if (!(d > 0.0001)) continue;
    if (remain <= d) {
      const t = Math.max(0, Math.min(1, remain / d));
      return { x: a.x + (dx * t), y: a.y + (dy * t) };
    }
    remain -= d;
  }
  return pts[pts.length - 1];
}

function getClosestPointOnSegment2D(px, py, ax, ay, bx, by) {
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const denom = (abx * abx) + (aby * aby);
  if (!(denom > 0.000001)) {
    const dx0 = px - ax;
    const dy0 = py - ay;
    return { x: ax, y: ay, d2: (dx0 * dx0) + (dy0 * dy0) };
  }
  const tRaw = ((apx * abx) + (apy * aby)) / denom;
  const t = Math.max(0, Math.min(1, tRaw));
  const cx = ax + (abx * t);
  const cy = ay + (aby * t);
  const dx = px - cx;
  const dy = py - cy;
  return { x: cx, y: cy, d2: (dx * dx) + (dy * dy) };
}

function getDrawSnakeProjectileImpactPoint(enemy, projectile, baseProjectileRadiusWorld, scale) {
  const nodes = Array.isArray(enemy?.drawsnakeNodeWorld) ? enemy.drawsnakeNodeWorld : [];
  if (nodes.length < 2) return null;
  const px = Number(projectile?.wx) || 0;
  const py = Number(projectile?.wy) || 0;
  const lineWidthPx = Math.max(2, Number(enemy?.drawsnakeLineWidthPx) || DRAW_SNAKE_LINE_WIDTH_PX_FALLBACK) * DRAW_SNAKE_VISUAL_SCALE;
  const snakeRadiusWorld = (lineWidthPx * 0.5) / Math.max(0.001, Number(scale) || 1);
  const hitRadiusWorld = Math.max(baseProjectileRadiusWorld, snakeRadiusWorld + (baseProjectileRadiusWorld * 0.65));
  const hitRadius2 = hitRadiusWorld * hitRadiusWorld;
  let best = null;
  for (let i = 0; i < nodes.length - 1; i++) {
    const a = nodes[i];
    const b = nodes[i + 1];
    if (!a || !b) continue;
    const cp = getClosestPointOnSegment2D(
      px,
      py,
      Number(a.x) || 0,
      Number(a.y) || 0,
      Number(b.x) || 0,
      Number(b.y) || 0
    );
    if (!(cp.d2 <= hitRadius2)) continue;
    if (!best || cp.d2 < best.d2) best = cp;
  }
  if (!best) return null;
  return { x: best.x, y: best.y };
}

function updateDrawSnakeTrail(enemy) {
  const trail = Array.isArray(enemy?.drawsnakeTrail) ? enemy.drawsnakeTrail : (enemy.drawsnakeTrail = []);
  const head = { x: Number(enemy?.wx) || 0, y: Number(enemy?.wy) || 0 };
  if (!trail.length) {
    trail.push(head);
    return trail;
  }
  const prev = trail[0];
  const dx = head.x - prev.x;
  const dy = head.y - prev.y;
  const dist = Math.hypot(dx, dy);
  const step = Math.max(4, DRAW_SNAKE_SEGMENT_SPACING_WORLD * 0.25);
  if (dist < 0.01) return trail;
  const inserts = [head];
  if (dist > step) {
    const n = Math.max(1, Math.floor(dist / step));
    for (let i = n; i >= 1; i--) {
      const t = Math.max(0, Math.min(1, (i * step) / dist));
      inserts.push({
        x: prev.x + (dx * t),
        y: prev.y + (dy * t),
      });
    }
  }
  trail.unshift(...inserts);
  const needLen = Math.max(step, DRAW_SNAKE_SEGMENT_SPACING_WORLD * (DRAW_SNAKE_SEGMENT_COUNT + 2));
  let acc = 0;
  let keep = 1;
  for (let i = 1; i < trail.length; i++) {
    const a = trail[i - 1];
    const b = trail[i];
    acc += Math.hypot((a.x - b.x), (a.y - b.y));
    keep = i + 1;
    if (acc >= needLen) break;
  }
  if (trail.length > keep) trail.length = keep;
  return trail;
}

function updateDrawSnakeVisual(enemy, scale, dt = 0) {
  if (String(enemy?.enemyType || '') !== 'drawsnake') return;
  const originScreen = worldToScreen({ x: Number(enemy?.wx) || 0, y: Number(enemy?.wy) || 0 });
  if (!originScreen || !Number.isFinite(originScreen.x) || !Number.isFinite(originScreen.y)) return;
  const trail = updateDrawSnakeTrail(enemy);
  const nodes = [];
  for (let i = 0; i < DRAW_SNAKE_SEGMENT_COUNT; i++) {
    const p = sampleTrailAtDistance(trail, i * DRAW_SNAKE_SEGMENT_SPACING_WORLD) || { x: Number(enemy.wx) || 0, y: Number(enemy.wy) || 0 };
    nodes.push(p);
    enemy.drawsnakeNodeWorld[i] = { x: p.x, y: p.y };
  }
  const segEls = Array.isArray(enemy.drawsnakeSegEls) ? enemy.drawsnakeSegEls : [];
  const nodeEls = Array.isArray(enemy.drawsnakeNodeEls) ? enemy.drawsnakeNodeEls : [];
  const pulseTs = Array.isArray(enemy.drawsnakeNodePulseTs)
    ? enemy.drawsnakeNodePulseTs
    : (enemy.drawsnakeNodePulseTs = Array.from({ length: nodeEls.length }, () => 0));
  const pulseDur = Array.isArray(enemy.drawsnakeNodePulseDur)
    ? enemy.drawsnakeNodePulseDur
    : (enemy.drawsnakeNodePulseDur = Array.from({ length: nodeEls.length }, () => DRAW_SNAKE_NODE_PULSE_SECONDS));
  const frameDt = Math.max(0, Number(dt) || 0);
  const lineWidthPx = Math.max(2, Number(enemy?.drawsnakeLineWidthPx) || DRAW_SNAKE_LINE_WIDTH_PX_FALLBACK) * DRAW_SNAKE_VISUAL_SCALE;
  const jointSizePx = Math.max(7, lineWidthPx * 1.7 * DRAW_SNAKE_NODE_SIZE_SCALE);
  for (let i = 0; i < segEls.length; i++) {
    const a = nodes[i];
    const b = nodes[Math.min(nodes.length - 1, i + 1)];
    const sa = worldToScreen(a);
    const sb = worldToScreen(b);
    const seg = segEls[i];
    if (!seg || !sa || !sb || !Number.isFinite(sa.x) || !Number.isFinite(sa.y) || !Number.isFinite(sb.x) || !Number.isFinite(sb.y)) {
      try { if (seg) seg.style.opacity = '0'; } catch {}
      continue;
    }
    const dx = sb.x - sa.x;
    const dy = sb.y - sa.y;
    const len = Math.max(2, Math.hypot(dx, dy));
    const ang = Math.atan2(dy, dx) * (180 / Math.PI);
    seg.style.opacity = '1';
    seg.style.height = `${lineWidthPx}px`;
    seg.style.marginTop = `${(-lineWidthPx * 0.5).toFixed(2)}px`;
    seg.style.width = `${len}px`;
    seg.style.transform = `translate(${(sa.x - originScreen.x).toFixed(2)}px, ${(sa.y - originScreen.y).toFixed(2)}px) rotate(${ang}deg)`;
  }
  for (let i = 0; i < nodeEls.length; i++) {
    const node = nodeEls[i];
    const s = worldToScreen(nodes[i]);
    if (!node || !s || !Number.isFinite(s.x) || !Number.isFinite(s.y)) {
      try { if (node) node.style.opacity = '0'; } catch {}
      continue;
    }
    node.style.opacity = '1';
    node.style.width = `${jointSizePx}px`;
    node.style.height = `${jointSizePx}px`;
    node.style.marginLeft = `${(-jointSizePx * 0.5).toFixed(2)}px`;
    node.style.marginTop = `${(-jointSizePx * 0.5).toFixed(2)}px`;
    const rem = Math.max(0, Number(pulseTs[i]) || 0);
    const dur = Math.max(0.01, Number(pulseDur[i]) || DRAW_SNAKE_NODE_PULSE_SECONDS);
    let pulseScale = 1;
    if (rem > 0) {
      const t = 1 - Math.max(0, Math.min(1, rem / dur));
      pulseScale = 1 + (Math.sin(t * Math.PI) * DRAW_SNAKE_NODE_PULSE_SCALE);
      pulseTs[i] = Math.max(0, rem - frameDt);
      if (!(pulseTs[i] > 0.0001)) node.classList.remove('is-spawn');
    }
    node.style.setProperty('--bs-drawsnake-node-pulse', pulseScale.toFixed(3));
    node.style.transform = `translate(${(s.x - originScreen.x).toFixed(2)}px, ${(s.y - originScreen.y).toFixed(2)}px) scale(var(--bs-drawsnake-node-pulse, 1))`;
  }
  void scale;
}

function getDrawSnakeNodeIndexForStep(stepIndex, nodeCount) {
  const count = Math.max(1, Math.trunc(Number(nodeCount) || 1));
  const step = ((Math.trunc(Number(stepIndex) || 0) % WEAPON_TUNE_STEPS) + WEAPON_TUNE_STEPS) % WEAPON_TUNE_STEPS;
  if (count <= 1 || WEAPON_TUNE_STEPS <= 1) return 0;
  const t = step / Math.max(1, WEAPON_TUNE_STEPS - 1);
  return Math.max(0, Math.min(count - 1, Math.round(t * (count - 1))));
}

function fireDrawSnakeProjectile(enemy, nodeIndex, noteName, aggressionScale = 1) {
  if (!enemyLayerEl) return;
  const nodes = Array.isArray(enemy?.drawsnakeNodeWorld) ? enemy.drawsnakeNodeWorld : [];
  const idx = Math.max(0, Math.min(nodes.length - 1, Math.trunc(Number(nodeIndex) || 0)));
  flashDrawSnakeNode(enemy, idx);
  const origin = nodes[idx] || { x: Number(enemy?.wx) || 0, y: Number(enemy?.wy) || 0 };
  const dirAng = Math.random() * Math.PI * 2;
  const scale = Math.max(0.35, Math.min(1, Number(aggressionScale) || 1));
  const el = document.createElement('div');
  el.className = 'beat-swarm-projectile is-hostile-red';
  enemyLayerEl.appendChild(el);
  projectiles.push({
    wx: Number(origin.x) || 0,
    wy: Number(origin.y) || 0,
    vx: Math.cos(dirAng) * DRAW_SNAKE_PROJECTILE_SPEED * scale,
    vy: Math.sin(dirAng) * DRAW_SNAKE_PROJECTILE_SPEED * scale,
    ttl: PROJECTILE_LIFETIME,
    damage: DRAW_SNAKE_PROJECTILE_DAMAGE * Math.max(0.3, scale),
    kind: 'hostile-red',
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
    chainWeaponSlotIndex: null,
    chainStageIndex: null,
    nextStages: [],
    nextBeatIndex: null,
    ignoreEnemyId: null,
    hostileToEnemies: false,
    hostileNoteName: normalizeSwarmNoteName(noteName) || 'C4',
    hostileInstrument: resolveSwarmRoleInstrumentId(
      getSwarmRoleForEnemy(enemy, BEAT_EVENT_ROLES.LEAD),
      resolveSwarmSoundInstrumentId('projectile') || 'tone'
    ),
    el,
  });
}

function getSwarmEnemyById(enemyId) {
  const id = Math.trunc(Number(enemyId) || 0);
  if (!(id > 0)) return null;
  return enemies.find((e) => Math.trunc(Number(e?.id) || 0) === id) || null;
}

function isPlayerWeaponStepLikelyAudible(stepIndex = 0) {
  const slotIndex = Math.max(0, Math.min(weaponLoadout.length - 1, Math.trunc(Number(activeWeaponSlotIndex) || 0)));
  const weapon = weaponLoadout[slotIndex];
  const stages = sanitizeWeaponStages(weapon?.stages);
  if (stages.length) {
    const notes = getWeaponTuneStepNotes(slotIndex, Math.trunc(Number(stepIndex) || 0));
    return Array.isArray(notes) && notes.length > 0;
  }
  const anyConfigured = weaponLoadout.some((w) => Array.isArray(w?.stages) && w.stages.length > 0);
  if (anyConfigured) return false;
  return equippedWeapons.has('explosion') || equippedWeapons.has('laser') || equippedWeapons.has('projectile');
}

function shouldKeepEnemyAudibleDuringPlayerDuck(ev, channel = '') {
  const beat = Math.max(0, Math.trunc(Number(ev?.beatIndex) || 0));
  const step = Math.max(0, Math.trunc(Number(ev?.stepIndex) || 0));
  const actor = Math.max(0, Math.trunc(Number(ev?.actorId) || 0));
  const action = String(ev?.actionType || '').trim().toLowerCase();
  const channelKey = String(channel || '').trim().toLowerCase();
  const keepChance = Number(PLAYER_MASK_DUCK_KEEP_CHANCE_BY_CHANNEL[channelKey]);
  const threshold = Number.isFinite(keepChance)
    ? keepChance
    : Number(PLAYER_MASK_DUCK_KEEP_CHANCE_BY_CHANNEL.default);
  const seed = hashStringSeed(`${beat}|${step}|${actor}|${action}|${String(channel || '').trim().toLowerCase()}`);
  return seededNoise01(seed) < Math.max(0, Math.min(1, Number(threshold) || 0));
}

function shouldKeepEnemyEventDuringPlayerStep(ev, keepCount = 0) {
  if (!ev || typeof ev !== 'object') return false;
  const action = String(ev.actionType || '').trim().toLowerCase();
  if (!action) return false;
  if (action === 'player-weapon-step') return true;
  if (keepCount >= PLAYER_MASK_MAX_ENEMY_EVENTS_PER_STEP) return false;
  const beat = Math.max(0, Math.trunc(Number(ev?.beatIndex) || 0));
  const step = Math.max(0, Math.trunc(Number(ev?.stepIndex) || 0));
  const actor = Math.max(0, Math.trunc(Number(ev?.actorId) || 0));
  const keepChanceRaw = Number(PLAYER_MASK_STEP_EVENT_KEEP_CHANCE[action]);
  const keepChance = Number.isFinite(keepChanceRaw)
    ? keepChanceRaw
    : Number(PLAYER_MASK_STEP_EVENT_KEEP_CHANCE.default);
  const seed = hashStringSeed(`mask-step|${beat}|${step}|${actor}|${action}`);
  return seededNoise01(seed) < Math.max(0, Math.min(1, Number(keepChance) || 0));
}

function clampNoteToDirectorPool(noteName, fallbackIndex = 0) {
  const director = ensureSwarmDirector();
  const normalized = normalizeSwarmNoteName(noteName);
  const fallbackNote = director.pickNoteFromPool(Math.trunc(Number(fallbackIndex) || 0));
  const clamped = director.clampNoteToPool(normalized || fallbackNote, fallbackIndex);
  return normalizeSwarmNoteName(clamped) || normalizeSwarmNoteName(fallbackNote) || getRandomSwarmPentatonicNote();
}

function collectDrawSnakeStepBeatEvents(stepIndex, beatIndex = currentBeatIndex) {
  const events = [];
  if (!active || gameplayPaused) return events;
  const pacingCaps = getCurrentPacingCaps();
  const responseMode = String(pacingCaps.responseMode || 'none');
  if (responseMode === 'none' || responseMode === 'group') return events;
  const stepAbs = Math.max(0, Math.trunc(Number(stepIndex) || 0));
  const step = ((Math.trunc(Number(stepIndex) || 0) % WEAPON_TUNE_STEPS) + WEAPON_TUNE_STEPS) % WEAPON_TUNE_STEPS;
  const snakes = enemies.filter((e) => String(e?.enemyType || '') === 'drawsnake');
  for (const enemy of snakes) {
    if (enemy?.retreating) continue;
    const group = getEnemyMusicGroup(enemy, 'drawsnake-projectile');
    if (!group) continue;
    const lifecycleState = normalizeMusicLifecycleState(group?.lifecycleState || enemy?.lifecycleState || 'active', 'active');
    if (lifecycleState === 'retiring') continue;
    if (!isCallResponseLaneActive(enemy?.callResponseLane, stepAbs, snakes.length)) continue;
    const steps = Array.isArray(group?.steps) ? group.steps : [];
    if (!steps[step]) continue;
    const rows = Array.isArray(group?.rows) ? group.rows : [];
    const row = Math.max(0, Math.min(SWARM_PENTATONIC_NOTES_ONE_OCTAVE.length - 1, Math.trunc(Number(rows?.[step]) || 0)));
    const noteNameBase = getSwarmPentatonicNoteByIndex(row);
    const phraseStep = getPhraseStepState(stepAbs, Array.isArray(group?.steps) ? group.steps.length : WEAPON_TUNE_STEPS);
    const rowHead = Math.max(0, Math.min(SWARM_PENTATONIC_NOTES_ONE_OCTAVE.length - 1, Math.trunc(Number(rows?.[0]) || row)));
    const rowMiddle = Math.max(0, Math.min(SWARM_PENTATONIC_NOTES_ONE_OCTAVE.length - 1, Math.trunc(Number(rows?.[Math.floor(rows.length * 0.5)]) || rowHead)));
    const phraseTargets = normalizePhraseGravityNoteList([
      ...(Array.isArray(group?.resolutionTargets) ? group.resolutionTargets : []),
      group?.phraseRoot,
      group?.phraseFifth,
      ...(Array.isArray(group?.gravityNotes) ? group.gravityNotes : []),
      getSwarmPentatonicNoteByIndex(rowHead),
      getSwarmPentatonicNoteByIndex(rowMiddle),
    ]);
    const phraseGravityTarget = phraseStep.nearPhraseEnd
      ? pickClosestPhraseGravityTarget(noteNameBase, phraseTargets)
      : '';
    const phraseGravityOpportunity = !!phraseGravityTarget && phraseStep.nearPhraseEnd;
    const gravityBiasChance = phraseStep.resolutionOpportunity ? 0.74 : 0.52;
    const noteNameRaw = (phraseGravityOpportunity && Math.random() < gravityBiasChance)
      ? phraseGravityTarget
      : noteNameBase;
    const phraseGravityHit = phraseGravityOpportunity
      ? normalizeSwarmNoteName(noteNameRaw) === normalizeSwarmNoteName(phraseGravityTarget)
      : false;
    const phraseResolutionOpportunity = phraseGravityOpportunity && phraseStep.resolutionOpportunity;
    const phraseResolutionHit = phraseResolutionOpportunity && phraseGravityHit;
    const instrumentId = resolveSwarmRoleInstrumentId(
      normalizeSwarmRole(group?.role || getSwarmRoleForEnemy(enemy, BEAT_EVENT_ROLES.LEAD), BEAT_EVENT_ROLES.LEAD),
      resolveSwarmSoundInstrumentId('projectile') || 'tone'
    );
    const lifecycleAudioGain = lifecycleState === 'inactiveForScheduling' ? 0.35 : 1;
    events.push(createPerformedBeatEvent({
      actorId: Math.max(0, Math.trunc(Number(enemy?.id) || 0)),
      beatIndex,
      stepIndex: stepAbs,
      role: normalizeSwarmRole(group?.role || getSwarmRoleForEnemy(enemy, BEAT_EVENT_ROLES.LEAD), BEAT_EVENT_ROLES.LEAD),
      note: noteNameRaw,
      instrumentId,
      actionType: String(group?.actionType || 'drawsnake-projectile'),
      threatClass: BEAT_EVENT_THREAT.FULL,
      visualSyncType: 'node-pulse',
      payload: {
        groupId: Math.max(0, Math.trunc(Number(group?.id) || 0)),
        nodeIndex: getDrawSnakeNodeIndexForStep(step, DRAW_SNAKE_SEGMENT_COUNT),
        audioGain: clamp01(Number(enemy?.musicParticipationGain == null ? 1 : enemy.musicParticipationGain) * lifecycleAudioGain),
        requestedNoteRaw: noteNameRaw,
        phraseGravityTarget,
        phraseGravityHit,
        phraseResolutionOpportunity,
        phraseResolutionHit,
      },
    }));
  }
  return events;
}

function collectSpawnerStepBeatEvents(stepIndex, beatIndex) {
  const events = [];
  const stats = {
    activeSpawners: 0,
    triggeredSpawners: 0,
    spawnedEnemies: 0,
  };
  if (!active || gameplayPaused) return { events, stats };
  const stepAbs = Math.max(0, Math.trunc(Number(stepIndex) || 0));
  const step = ((Math.trunc(Number(stepIndex) || 0) % 8) + 8) % 8;
  for (const enemy of enemies) {
    if (String(enemy?.enemyType || '') !== 'spawner') continue;
    if (enemy?.retreating) continue;
    const group = getEnemyMusicGroup(enemy, 'spawner-spawn');
    if (!group) continue;
    const lifecycleState = normalizeMusicLifecycleState(group?.lifecycleState || enemy?.lifecycleState || 'active', 'active');
    if (lifecycleState === 'retiring') continue;
    const actorId = Math.max(0, Math.trunc(Number(enemy?.id) || 0));
    stats.activeSpawners += 1;
    const steps = Array.isArray(group?.steps) ? group.steps : [];
    const isActiveStep = !!steps[step];
    const lifecycleAudioGain = lifecycleState === 'inactiveForScheduling' ? 0.35 : 1;
    if (!isActiveStep) continue;
    stats.triggeredSpawners += 1;
    const noteNameRaw = normalizeSwarmNoteName(group?.note) || 'C4';
    const noteName = clampNoteToDirectorPool(
      noteNameRaw,
      beatIndex + stepAbs + actorId
    );
    const instrumentId = resolveSwarmRoleInstrumentId(
      normalizeSwarmRole(group?.role || getSwarmRoleForEnemy(enemy, BEAT_EVENT_ROLES.BASS), BEAT_EVENT_ROLES.BASS),
      resolveSwarmSoundInstrumentId('projectile') || 'tone'
    );
    events.push(createPerformedBeatEvent({
      actorId,
      beatIndex,
      stepIndex: stepAbs,
      role: normalizeSwarmRole(group?.role || getSwarmRoleForEnemy(enemy, BEAT_EVENT_ROLES.BASS), BEAT_EVENT_ROLES.BASS),
      note: noteName,
      instrumentId,
      actionType: String(group?.actionType || 'spawner-spawn'),
      threatClass: BEAT_EVENT_THREAT.FULL,
      visualSyncType: 'spawn-burst',
      payload: {
        groupId: Math.max(0, Math.trunc(Number(group?.id) || 0)),
        nodeStepIndex: step,
        audioGain: clamp01(Number(enemy?.musicParticipationGain == null ? 1 : enemy.musicParticipationGain) * lifecycleAudioGain),
        requestedNoteRaw: noteNameRaw,
      },
    }));
    stats.spawnedEnemies += 1;
  }
  return { events, stats };
}

function executePerformedBeatEvent(event) {
  const ev = event && typeof event === 'object' ? event : null;
  if (!ev) return false;
  const actionType = String(ev.actionType || '').trim().toLowerCase();
  if (!actionType) return false;
  const beatIndex = Math.max(0, Math.trunc(Number(ev.beatIndex) || 0));
  const stepIndex = Math.max(0, Math.trunc(Number(ev.stepIndex) || 0));
  const barIndex = Math.floor(beatIndex / Math.max(1, COMPOSER_BEATS_PER_BAR));
  const payloadGroupId = Math.max(0, Math.trunc(Number(ev?.payload?.groupId) || 0));
  const logMusicLabExecution = (context = null) => {
    const base = context && typeof context === 'object' ? context : {};
    try {
      swarmMusicLab.logExecutedEvent(ev, getMusicLabContext({
        beatIndex,
        stepIndex,
        barIndex,
        groupId: payloadGroupId,
        ...base,
      }));
    } catch {}
  };
  if (actionType === 'spawner-spawn') {
    const enemy = getSwarmEnemyById(ev.actorId);
    if (!enemy || String(enemy?.enemyType || '') !== 'spawner') return false;
    const group = getEnemyMusicGroup(enemy, 'spawner-spawn');
    if (!group) return false;
    const aggressionScale = getEnemyAggressionScale(enemy, group?.lifecycleState || 'active');
    const instrumentId = resolveSwarmRoleInstrumentId(
      ev.role || group.role || getSwarmRoleForEnemy(enemy, BEAT_EVENT_ROLES.BASS),
      resolveSwarmSoundInstrumentId('projectile') || 'tone'
    );
    group.instrumentId = instrumentId;
    group.role = normalizeSwarmRole(ev.role || group.role, BEAT_EVENT_ROLES.BASS);
    const duckForPlayer = ev?.payload?.duckForPlayer === true;
    const audioGain = clamp01(Number(ev?.payload?.audioGain == null ? 1 : ev.payload.audioGain));
    const enemyAudible = duckForPlayer ? shouldKeepEnemyAudibleDuringPlayerDuck(ev, 'spawner') : true;
    const triggerVolume = SPAWNER_ENEMY_TRIGGER_SOUND_VOLUME
      * (duckForPlayer ? PLAYER_MASK_DUCK_ENEMY_VOLUME_MULT : 1)
      * audioGain
      * (0.7 + (aggressionScale * 0.3));
    const requestedNote = String(ev?.payload?.requestedNoteRaw || ev.note || '').trim();
    const noteName = clampNoteToDirectorPool(requestedNote || ev.note, beatIndex + ev.stepIndex + ev.actorId);
    group.note = noteName;
    syncSingletonEnemyStateFromMusicGroup(enemy, group);
    if (enemyAudible) {
      try { triggerInstrument(instrumentId, noteName, undefined, 'master', {}, triggerVolume); } catch {}
    }
    const nodeStepIndex = ((Math.trunc(Number(ev?.payload?.nodeStepIndex) || ev.stepIndex || 0) % 8) + 8) % 8;
    flashSpawnerEnemyCell(enemy, nodeStepIndex, 'strong');
    if (!Array.isArray(enemy.spawnerNodeEnemyIds)) enemy.spawnerNodeEnemyIds = Array.from({ length: 8 }, () => 0);
    const linkedEnemyId = Math.trunc(Number(enemy.spawnerNodeEnemyIds[nodeStepIndex]) || 0);
    let linkedEnemy = linkedEnemyId > 0 ? getSwarmEnemyById(linkedEnemyId) : null;
    if (!linkedEnemy || String(linkedEnemy?.enemyType || '') !== 'dumb') {
      linkedEnemy = null;
      enemy.spawnerNodeEnemyIds[nodeStepIndex] = 0;
    }
    if (!linkedEnemy) {
      const spawnWorld = getSpawnerNodeCellWorld(enemy, nodeStepIndex) || { x: Number(enemy.wx) || 0, y: Number(enemy.wy) || 0 };
      const spawnScreen = worldToScreen(spawnWorld);
      if (!spawnScreen || !Number.isFinite(spawnScreen.x) || !Number.isFinite(spawnScreen.y)) return false;
      const hp = Math.max(1, Number(currentEnemySpawnMaxHp) || 1);
      const beforeCount = enemies.length;
      spawnEnemyAt(spawnScreen.x, spawnScreen.y, {
        linkedSpawnerId: Math.trunc(Number(enemy.id) || 0),
        linkedSpawnerStepIndex: nodeStepIndex,
        hp,
      });
      if (enemies.length > beforeCount) {
        const created = enemies[enemies.length - 1];
        if (created && Number.isFinite(created.id)) {
          enemy.spawnerNodeEnemyIds[nodeStepIndex] = Math.trunc(created.id);
          updateSpawnerLinkedEnemyLine(created);
        }
      }
      logMusicLabExecution({
        sourceSystem: 'spawner',
        requestedNote,
        resolvedNote: noteName,
        noteWasClamped: requestedNote ? requestedNote !== noteName : false,
        enemyAudible,
      });
      return true;
    }
    const origin = { x: Number(linkedEnemy.wx) || 0, y: Number(linkedEnemy.wy) || 0 };
    const toPlayer = getViewportCenterWorld();
    const dir = Math.atan2((Number(toPlayer?.y) || 0) - origin.y, (Number(toPlayer?.x) || 0) - origin.x);
    const fullThreat = tryConsumeSwarmThreatIntent('full', 1, beatIndex, 'spawner-linked-attack');
    if (!fullThreat?.withinBudget || aggressionScale <= 0.5) {
      flashSpawnerEnemyCell(enemy, nodeStepIndex, 'alternate');
      if (aggressionScale <= 0.5) {
        triggerCosmeticSyncAt(origin, beatIndex, 'spawner-retiring-cosmetic', linkedEnemy.el);
      } else {
        triggerLowThreatBurstAt(origin, beatIndex, 'spawner-linked-fallback');
      }
      pulseHitFlash(linkedEnemy.el);
      logMusicLabExecution({
        sourceSystem: 'spawner',
        requestedNote,
        resolvedNote: noteName,
        noteWasClamped: requestedNote ? requestedNote !== noteName : false,
        enemyAudible,
      });
      return true;
    }
    spawnHostileRedProjectileAt(origin, {
      angle: dir + randRange(-0.24, 0.24),
      speed: SPAWNER_LINKED_ATTACK_SPEED * Math.max(0.4, Math.min(1, aggressionScale)),
      noteName,
      instrument: instrumentId,
      damage: Math.max(0.2, aggressionScale),
    });
    pulseHitFlash(linkedEnemy.el);
    logMusicLabExecution({
      sourceSystem: 'spawner',
      requestedNote,
      resolvedNote: noteName,
      noteWasClamped: requestedNote ? requestedNote !== noteName : false,
      enemyAudible,
    });
    return true;
  }
  if (actionType === 'drawsnake-projectile') {
    const enemy = getSwarmEnemyById(ev.actorId);
    if (!enemy || String(enemy?.enemyType || '') !== 'drawsnake') return false;
    const group = getEnemyMusicGroup(enemy, 'drawsnake-projectile');
    if (!group) return false;
    const aggressionScale = getEnemyAggressionScale(enemy, group?.lifecycleState || 'active');
    const instrumentId = resolveSwarmRoleInstrumentId(
      ev.role || group.role || getSwarmRoleForEnemy(enemy, BEAT_EVENT_ROLES.LEAD),
      resolveSwarmSoundInstrumentId('projectile') || 'tone'
    );
    group.instrumentId = instrumentId;
    group.instrument = instrumentId;
    group.role = normalizeSwarmRole(ev.role || group.role, BEAT_EVENT_ROLES.LEAD);
    const duckForPlayer = ev?.payload?.duckForPlayer === true;
    const audioGain = clamp01(Number(ev?.payload?.audioGain == null ? 1 : ev.payload.audioGain));
    const enemyAudible = duckForPlayer ? false : true;
    const triggerVolume = DRAW_SNAKE_TRIGGER_SOUND_VOLUME
      * (duckForPlayer ? PLAYER_MASK_DUCK_ENEMY_VOLUME_MULT : 1)
      * audioGain
      * (0.72 + (aggressionScale * 0.28));
    const requestedNote = String(ev?.payload?.requestedNoteRaw || ev.note || '').trim();
    const noteName = clampNoteToDirectorPool(requestedNote || ev.note, beatIndex + ev.stepIndex + ev.actorId);
    group.note = noteName;
    syncSingletonEnemyStateFromMusicGroup(enemy, group);
    if (enemyAudible) {
      try { triggerInstrument(instrumentId, noteName, undefined, 'master', {}, triggerVolume); } catch {}
    }
    const nodeIndex = Math.trunc(Number(ev?.payload?.nodeIndex) || 0);
    const fullThreat = tryConsumeSwarmThreatIntent('full', 1, beatIndex, 'drawsnake-projectile');
    if (!fullThreat?.withinBudget || aggressionScale <= 0.5) {
      const nodes = Array.isArray(enemy?.drawsnakeNodeWorld) ? enemy.drawsnakeNodeWorld : [];
      const idx = Math.max(0, Math.min(nodes.length - 1, nodeIndex));
      const origin = nodes[idx] || { x: Number(enemy?.wx) || 0, y: Number(enemy?.wy) || 0 };
      flashDrawSnakeNode(enemy, idx);
      if (aggressionScale <= 0.5) {
        triggerCosmeticSyncAt(origin, beatIndex, 'drawsnake-retiring-cosmetic', enemy.el);
      } else {
        triggerLowThreatBurstAt(origin, beatIndex, 'drawsnake-fallback-burst');
      }
      pulseHitFlash(enemy.el);
      logMusicLabExecution({
        sourceSystem: 'drawsnake',
        requestedNote,
        resolvedNote: noteName,
        noteWasClamped: requestedNote ? requestedNote !== noteName : false,
        enemyAudible,
      });
      return true;
    }
    fireDrawSnakeProjectile(enemy, nodeIndex, noteName, aggressionScale);
    logMusicLabExecution({
      sourceSystem: 'drawsnake',
      requestedNote,
      resolvedNote: noteName,
      noteWasClamped: requestedNote ? requestedNote !== noteName : false,
      enemyAudible,
    });
    return true;
  }
  if (actionType === 'composer-group-projectile' || actionType === 'composer-group-explosion') {
    const enemy = getSwarmEnemyById(ev.actorId);
    if (!enemy || String(enemy?.enemyType || '') !== 'composer-group-member') return false;
    const group = getEnemyMusicGroup(enemy, actionType);
    if (!group) return false;
    const aggressionScale = getEnemyAggressionScale(enemy, group?.lifecycleState || 'active');
    const requestedNote = String(ev?.payload?.requestedNoteRaw || ev.note || '').trim();
    const noteName = clampNoteToDirectorPool(requestedNote || ev.note, beatIndex + ev.stepIndex + ev.actorId);
    const instrumentId = resolveSwarmRoleInstrumentId(
      ev.role || group.role || getSwarmRoleForEnemy(enemy, BEAT_EVENT_ROLES.LEAD),
      resolveSwarmSoundInstrumentId('projectile') || 'tone'
    );
    group.instrumentId = instrumentId;
    group.role = normalizeSwarmRole(ev.role || group.role, BEAT_EVENT_ROLES.LEAD);
    const duckForPlayer = ev?.payload?.duckForPlayer === true;
    const audioGain = clamp01(Number(ev?.payload?.audioGain == null ? 1 : ev.payload.audioGain));
    const enemyAudible = duckForPlayer ? false : true;
    const triggerVolume = 0.42
      * (duckForPlayer ? PLAYER_MASK_DUCK_ENEMY_VOLUME_MULT : 1)
      * audioGain
      * (0.72 + (aggressionScale * 0.28));
    if (enemyAudible) {
      try { triggerInstrument(instrumentId, noteName, undefined, 'master', {}, triggerVolume); } catch {}
    }
    pulseHitFlash(enemy.el);
    enemy.composerActionPulseDur = COMPOSER_GROUP_ACTION_PULSE_SECONDS;
    enemy.composerActionPulseT = COMPOSER_GROUP_ACTION_PULSE_SECONDS;
    const origin = { x: Number(enemy.wx) || 0, y: Number(enemy.wy) || 0 };
    const requestedThreatClass = String(ev?.threatClass || BEAT_EVENT_THREAT.FULL).trim().toLowerCase();
    if (requestedThreatClass === BEAT_EVENT_THREAT.COSMETIC) {
      triggerCosmeticSyncAt(origin, beatIndex, 'composer-cosmetic', enemy.el);
      logMusicLabExecution({
        sourceSystem: 'group',
        requestedNote,
        resolvedNote: noteName,
        noteWasClamped: requestedNote ? requestedNote !== noteName : false,
        enemyAudible,
      });
      return true;
    }
    if (requestedThreatClass === BEAT_EVENT_THREAT.LIGHT) {
      triggerLowThreatBurstAt(origin, beatIndex, 'composer-light-burst');
      logMusicLabExecution({
        sourceSystem: 'group',
        requestedNote,
        resolvedNote: noteName,
        noteWasClamped: requestedNote ? requestedNote !== noteName : false,
        enemyAudible,
      });
      return true;
    }
    const fullThreat = tryConsumeSwarmThreatIntent(
      'full',
      1,
      beatIndex,
      actionType === 'composer-group-explosion' ? 'composer-group-explosion' : 'composer-group-projectile'
    );
    if (!fullThreat?.withinBudget || aggressionScale <= 0.5) {
      if (aggressionScale <= 0.5) {
        triggerCosmeticSyncAt(origin, beatIndex, 'composer-retiring-cosmetic', enemy.el);
      } else {
        triggerLowThreatBurstAt(origin, beatIndex, 'composer-fallback-burst');
      }
      pulseHitFlash(enemy.el);
      logMusicLabExecution({
        sourceSystem: 'group',
        requestedNote,
        resolvedNote: noteName,
        noteWasClamped: requestedNote ? requestedNote !== noteName : false,
        enemyAudible,
      });
      return true;
    }
    if (actionType === 'composer-group-explosion') {
      addHostileRedExplosionEffect(origin);
    } else {
      const toPlayer = getViewportCenterWorld();
      const dir = Math.atan2((Number(toPlayer?.y) || 0) - origin.y, (Number(toPlayer?.x) || 0) - origin.x);
      spawnHostileRedProjectileAt(origin, {
        angle: dir + randRange(-0.28, 0.28),
        speed: COMPOSER_GROUP_PROJECTILE_SPEED * Math.max(0.45, Math.min(1, aggressionScale)),
        noteName,
        instrument: instrumentId,
        damage: Math.max(0.2, aggressionScale),
      });
    }
    logMusicLabExecution({
      sourceSystem: 'group',
      requestedNote,
      resolvedNote: noteName,
      noteWasClamped: requestedNote ? requestedNote !== noteName : false,
      enemyAudible,
    });
    return true;
  }
  if (actionType === 'enemy-death-accent') {
    const accentThreat = tryConsumeSwarmThreatIntent('accent', 1, beatIndex, 'enemy-death-pop');
    if (!accentThreat?.withinBudget) {
      logMusicLabExecution({ sourceSystem: 'death' });
      return true;
    }
    const requestedNote = String(ev?.payload?.requestedNoteRaw || ev.note || '').trim();
    const noteName = clampNoteToDirectorPool(requestedNote || ev.note, beatIndex + ev.actorId);
    const eventKeyRaw = String(ev?.payload?.soundEventKey || '').trim();
    const eventKey = SWARM_SOUND_EVENTS[eventKeyRaw]
      ? eventKeyRaw
      : resolveEnemyDeathEventKey(ev?.payload?.soundFamily, 'enemyDeathMedium');
    noteSwarmSoundEvent(
      eventKey,
      Math.max(0.001, Math.min(1, Number(ev?.payload?.volume) || 0)),
      beatIndex,
      noteName
    );
    logMusicLabExecution({
      sourceSystem: 'death',
      requestedNote,
      resolvedNote: noteName,
      noteWasClamped: requestedNote ? requestedNote !== noteName : false,
    });
    return true;
  }
  if (actionType === 'player-weapon-step') {
    const origin = ev?.payload?.centerWorld;
    const centerWorld = origin && Number.isFinite(origin.x) && Number.isFinite(origin.y)
      ? { x: Number(origin.x) || 0, y: Number(origin.y) || 0 }
      : getViewportCenterWorld();
    const fireResult = fireConfiguredWeaponsOnBeat(centerWorld, Math.trunc(Number(ev.stepIndex) || 0), beatIndex);
    logMusicLabExecution({
      sourceSystem: 'player',
      playerAudible: fireResult?.playerAudible === true,
    });
    return true;
  }
  return false;
}

function getNearestEnemy(worldX, worldY, excludeEnemyId = null) {
  const exId = Number.isFinite(excludeEnemyId) ? Math.trunc(excludeEnemyId) : null;
  let best = null;
  let bestD2 = Infinity;
  for (const e of enemies) {
    const eid = Number.isFinite(e?.id) ? Math.trunc(e.id) : null;
    if (exId !== null && eid === exId) continue;
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

function addLaserEffect(fromW, toW, weaponSlotIndex = null, sourceEnemyId = null, targetEnemyId = null) {
  if (!enemyLayerEl) return;
  const el = document.createElement('div');
  el.className = 'beat-swarm-fx-laser';
  enemyLayerEl.appendChild(el);
  effects.push({
    kind: 'laser',
    ttl: LASER_TTL,
    from: { ...fromW },
    to: { ...toW },
    sourceEnemyId: Number.isFinite(sourceEnemyId) ? Math.trunc(sourceEnemyId) : null,
    targetEnemyId: Number.isFinite(targetEnemyId) ? Math.trunc(targetEnemyId) : null,
    weaponSlotIndex: Number.isFinite(weaponSlotIndex) ? Math.trunc(weaponSlotIndex) : null,
    el,
  });
}

function getGameplayBeatLen() {
  const info = getLoopInfo?.();
  return Math.max(0.05, Number(info?.beatLen) || 0.5);
}

function getSecondsUntilQueuedChainBeat(queuedBeatIndex) {
  const info = getLoopInfo?.();
  const beatLen = Math.max(0.05, Number(info?.beatLen) || 0.5);
  const loopStart = Number(info?.loopStartTime) || 0;
  const now = Number(info?.now) || 0;
  const current = Math.max(0, Math.floor(((now - loopStart) / beatLen) + 1e-6));
  const targetBeat = Math.max(current + 1, Math.max(0, Math.trunc(Number(queuedBeatIndex) || 0)));
  const targetTime = loopStart + (targetBeat * beatLen);
  return Math.max(0.05, targetTime - now);
}

function addBeamEffect(fromW, targetEnemy, ttl = null, weaponSlotIndex = null, damagePerSecOverride = null) {
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
    sourceEnemyId: null,
    sourceGoneTtl: null,
    damagePerSec: Math.max(0, Number.isFinite(damagePerSecOverride) ? Number(damagePerSecOverride) : BEAM_DAMAGE_PER_SECOND),
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

function addExplosionPrimeEffect(
  centerW,
  radiusWorld = EXPLOSION_RADIUS_WORLD,
  ttl = null,
  weaponSlotIndex = null,
  chainEventId = null,
  anchorEnemyId = null
) {
  if (!enemyLayerEl) return;
  const duration = Math.max(0.05, Number.isFinite(ttl) ? Number(ttl) : getGameplayBeatLen());
  const el = document.createElement('div');
  el.className = 'beat-swarm-fx-explosion';
  // Debug tint so warm-up is visually distinct from the actual explosion.
  el.style.background = 'radial-gradient(circle at center, rgba(114, 208, 255, 0.35), rgba(68, 163, 255, 0.16), rgba(32, 116, 245, 0.03))';
  el.style.borderColor = 'rgba(122, 201, 255, 0.78)';
  // Keep off-screen until first visual update to avoid a one-frame origin flash.
  el.style.transform = 'translate(-9999px, -9999px)';
  enemyLayerEl.appendChild(el);
  effects.push({
    kind: 'explosion-prime',
    ttl: duration,
    duration,
    at: { ...centerW },
    fallbackAt: { ...centerW },
    chainEventId: Number.isFinite(chainEventId) ? Math.trunc(chainEventId) : null,
    anchorEnemyId: Number.isFinite(anchorEnemyId) ? Math.trunc(anchorEnemyId) : null,
    radiusWorld: Math.max(1, Number(radiusWorld) || EXPLOSION_RADIUS_WORLD),
    weaponSlotIndex: Number.isFinite(weaponSlotIndex) ? Math.trunc(weaponSlotIndex) : null,
    el,
  });
}

function removeExplosionPrimeEffectsForEvent(eventId) {
  const id = Math.trunc(Number(eventId) || 0);
  if (!(id > 0)) return;
  for (let i = effects.length - 1; i >= 0; i--) {
    const fx = effects[i];
    if (fx?.kind !== 'explosion-prime') continue;
    if (Math.trunc(Number(fx.chainEventId) || 0) !== id) continue;
    try { fx?.el?.remove?.(); } catch {}
    effects.splice(i, 1);
  }
}

function clearPauseWeaponDragMarkers() {
  if (!pauseScreenEl) return;
  for (const el of pauseScreenEl.querySelectorAll('.beat-swarm-stage-cell.is-drag-source, .beat-swarm-stage-cell.is-drag-target')) {
    el.classList.remove('is-drag-source', 'is-drag-target');
  }
}

function clearPauseWeaponDragProxy() {
  if (!pauseWeaponDrag.proxyEl) return;
  try { pauseWeaponDrag.proxyEl.remove?.(); } catch {}
  pauseWeaponDrag.proxyEl = null;
}

function resetPauseWeaponDrag(suppressClick = false) {
  if (pauseWeaponDrag.holdTimer) {
    try { clearTimeout(pauseWeaponDrag.holdTimer); } catch {}
    pauseWeaponDrag.holdTimer = 0;
  }
  if (suppressClick) pauseWeaponDrag.suppressClickUntil = (performance.now() || 0) + 280;
  clearPauseWeaponDragMarkers();
  clearPauseWeaponDragProxy();
  pauseWeaponDrag.pointerId = null;
  pauseWeaponDrag.started = false;
  pauseWeaponDrag.sourceSlotIndex = -1;
  pauseWeaponDrag.sourceStageIndex = -1;
  pauseWeaponDrag.targetSlotIndex = -1;
  pauseWeaponDrag.targetStageIndex = -1;
}

function getPauseWeaponStageCellFromEventTarget(target) {
  if (!(target instanceof HTMLElement)) return null;
  const cell = target.closest('.beat-swarm-stage-cell.is-filled[data-slot-index][data-stage-index]');
  return (cell instanceof HTMLElement) ? cell : null;
}

function parsePauseWeaponStageCell(cellEl) {
  if (!(cellEl instanceof HTMLElement)) return null;
  const slotIndex = Math.trunc(Number(cellEl.dataset.slotIndex));
  const stageIndex = Math.trunc(Number(cellEl.dataset.stageIndex));
  if (!(slotIndex >= 0 && slotIndex < weaponLoadout.length)) return null;
  const stages = sanitizeWeaponStages(weaponLoadout[slotIndex]?.stages);
  if (!(stageIndex >= 0 && stageIndex < stages.length)) return null;
  return { slotIndex, stageIndex };
}

function getPauseWeaponDropTargetAtClient(clientX, clientY, sourceSlotIndex, sourceStageIndex) {
  const raw = document.elementFromPoint(Number(clientX) || 0, Number(clientY) || 0);
  const cell = getPauseWeaponStageCellFromEventTarget(raw);
  if (!cell) return null;
  const parsed = parsePauseWeaponStageCell(cell);
  if (!parsed) return null;
  if (parsed.slotIndex !== sourceSlotIndex) return null;
  if (parsed.stageIndex === sourceStageIndex) return null;
  return { ...parsed, cellEl: cell };
}

function reorderWeaponStages(slotIndex, fromStageIndex, dropBeforeStageIndex) {
  if (!(slotIndex >= 0 && slotIndex < weaponLoadout.length)) return false;
  const slot = weaponLoadout[slotIndex];
  const stages = sanitizeWeaponStages(slot?.stages);
  if (!(fromStageIndex >= 0 && fromStageIndex < stages.length)) return false;
  if (!(dropBeforeStageIndex >= 0 && dropBeforeStageIndex < stages.length)) return false;
  if (fromStageIndex === dropBeforeStageIndex) return false;
  const a = stages[fromStageIndex];
  const b = stages[dropBeforeStageIndex];
  stages[fromStageIndex] = b;
  stages[dropBeforeStageIndex] = a;
  slot.stages = stages;
  return true;
}

function updatePauseWeaponDragVisual(clientX, clientY) {
  if (pauseWeaponDrag.proxyEl) {
    pauseWeaponDrag.proxyEl.style.left = `${Number(clientX) || 0}px`;
    pauseWeaponDrag.proxyEl.style.top = `${Number(clientY) || 0}px`;
  }
  clearPauseWeaponDragMarkers();
  const sourceSelector = `.beat-swarm-stage-cell.is-filled[data-slot-index="${pauseWeaponDrag.sourceSlotIndex}"][data-stage-index="${pauseWeaponDrag.sourceStageIndex}"]`;
  pauseScreenEl?.querySelector?.(sourceSelector)?.classList?.add?.('is-drag-source');
  const target = getPauseWeaponDropTargetAtClient(clientX, clientY, pauseWeaponDrag.sourceSlotIndex, pauseWeaponDrag.sourceStageIndex);
  pauseWeaponDrag.targetSlotIndex = target?.slotIndex ?? -1;
  pauseWeaponDrag.targetStageIndex = target?.stageIndex ?? -1;
  if (target?.cellEl) target.cellEl.classList.add('is-drag-target');
}

function beginPauseWeaponDrag(clientX, clientY) {
  if (pauseWeaponDrag.started || pauseWeaponDrag.pointerId == null || !pauseScreenEl) return;
  pauseWeaponDrag.started = true;
  try { pauseScreenEl.setPointerCapture(pauseWeaponDrag.pointerId); } catch {}
  const sourceSelector = `.beat-swarm-stage-cell.is-filled[data-slot-index="${pauseWeaponDrag.sourceSlotIndex}"][data-stage-index="${pauseWeaponDrag.sourceStageIndex}"] .beat-swarm-stage-component-btn`;
  const sourceBtn = pauseScreenEl.querySelector(sourceSelector);
  if (sourceBtn instanceof HTMLElement) {
    const rect = sourceBtn.getBoundingClientRect();
    const proxy = sourceBtn.cloneNode(true);
    if (proxy instanceof HTMLElement) {
      proxy.classList.add('beat-swarm-stage-drag-proxy');
      proxy.style.width = `${Math.max(80, rect.width).toFixed(2)}px`;
      proxy.style.height = `${Math.max(80, rect.height).toFixed(2)}px`;
      document.body.appendChild(proxy);
      pauseWeaponDrag.proxyEl = proxy;
    }
  }
  updatePauseWeaponDragVisual(clientX, clientY);
}

function normalizeDir(dx, dy, fallbackX = 1, fallbackY = 0) {
  const len = Math.hypot(dx, dy);
  if (len > 0.0001) return { x: dx / len, y: dy / len };
  const fLen = Math.hypot(fallbackX, fallbackY) || 1;
  return { x: fallbackX / fLen, y: fallbackY / fLen };
}

function pulseHitFlash(el) {
  if (!el?.classList) return;
  const now = performance.now();
  const last = Number(el.dataset?.hitFlashTs || 0);
  if ((now - last) < 60) return;
  if (el.dataset) el.dataset.hitFlashTs = `${now}`;
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

function getProjectileChainSpawnOffsetWorld() {
  const z = getZoomState?.();
  const s = Number.isFinite(z?.targetScale) ? z.targetScale : (Number.isFinite(z?.currentScale) ? z.currentScale : 1);
  const hitRadiusWorld = PROJECTILE_HIT_RADIUS_PX / Math.max(0.001, s || 1);
  return Math.max(PROJECTILE_CHAIN_SPAWN_OFFSET_WORLD, hitRadiusWorld + 8);
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
  logWeaponTuneFireDebug('spawn-raw', {
    source: String(chainContext?.debugSource || 'unknown'),
    slotIndex: Number.isFinite(chainContext?.weaponSlotIndex) ? Math.trunc(chainContext.weaponSlotIndex) : null,
    stageIndex: Number.isFinite(chainContext?.stageIndex) ? Math.trunc(chainContext.stageIndex) : null,
    stepIndex: Number.isFinite(chainContext?.debugStepIndex) ? Math.trunc(chainContext.debugStepIndex) : null,
    beatIndex: Number.isFinite(chainContext?.debugBeatIndex) ? Math.trunc(chainContext.debugBeatIndex) : Math.trunc(Number(currentBeatIndex) || 0),
    damage: Math.max(1, Number(damage) || 1),
  });
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
    chainDamageScale: Math.max(0.05, Number(chainContext?.damageScale) || 1),
    nextStages: sanitizeWeaponStages(nextStages),
    nextBeatIndex: Number.isFinite(nextBeatIndex) ? Math.max(0, Math.trunc(nextBeatIndex)) : null,
    ignoreEnemyId: Number.isFinite(chainContext?.sourceEnemyId) ? Math.trunc(chainContext.sourceEnemyId) : null,
    hasEnteredScreen: false,
    collisionGraceT: PROJECTILE_COLLISION_GRACE_SECONDS,
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
  el.className = 'beat-swarm-projectile is-boomerang';
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
    chainDamageScale: Math.max(0.05, Number(chainContext?.damageScale) || 1),
    nextStages: sanitizeWeaponStages(nextStages),
    nextBeatIndex: Number.isFinite(nextBeatIndex) ? Math.max(0, Math.trunc(nextBeatIndex)) : null,
    ignoreEnemyId: Number.isFinite(chainContext?.sourceEnemyId) ? Math.trunc(chainContext.sourceEnemyId) : null,
    hasEnteredScreen: false,
    collisionGraceT: PROJECTILE_COLLISION_GRACE_SECONDS,
    el,
  });
}

function spawnHomingMissile(fromW, damage, nextStages = null, nextBeatIndex = null, chainContext = null) {
  if (!enemyLayerEl) return false;
  if (countOrbitingHomingMissiles() >= PROJECTILE_HOMING_MAX_ORBITING) return false;
  const orbitCount = countOrbitingHomingMissiles();
  const angle = ((orbitCount / Math.max(1, PROJECTILE_HOMING_MAX_ORBITING)) * Math.PI * 2);
  const el = document.createElement('div');
  el.className = 'beat-swarm-projectile is-homing-missile';
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
    chainDamageScale: Math.max(0.05, Number(chainContext?.damageScale) || 1),
    nextStages: sanitizeWeaponStages(nextStages),
    nextBeatIndex: Number.isFinite(nextBeatIndex) ? Math.max(0, Math.trunc(nextBeatIndex)) : null,
    ignoreEnemyId: Number.isFinite(chainContext?.sourceEnemyId) ? Math.trunc(chainContext.sourceEnemyId) : null,
    hasEnteredScreen: false,
    collisionGraceT: PROJECTILE_COLLISION_GRACE_SECONDS,
    el,
  });
  return true;
}

function queueWeaponChain(beatIndex, nextStages, context) {
  const stages = sanitizeWeaponStages(nextStages);
  if (!stages.length) return;
  const queuedBeatIndex = Math.max(0, Math.trunc(Number(beatIndex) || 0));
  const impactPoint = context?.impactPoint ? { x: Number(context.impactPoint.x) || 0, y: Number(context.impactPoint.y) || 0 } : null;
  const weaponSlotIndex = Number.isFinite(context?.weaponSlotIndex) ? Math.trunc(context.weaponSlotIndex) : null;
  const impactEnemyId = Number.isFinite(context?.impactEnemyId) ? Math.trunc(context.impactEnemyId) : null;
  const firstStage = stages[0];
  const eventId = weaponChainEventSeq++;
  if (firstStage?.archetype === 'aoe' && firstStage?.variant === 'explosion' && impactPoint) {
    const secondsUntilTrigger = getSecondsUntilQueuedChainBeat(queuedBeatIndex);
    if (secondsUntilTrigger > 0.02) {
      addExplosionPrimeEffect(
        impactPoint,
        EXPLOSION_RADIUS_WORLD,
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
      forcedNoteName: normalizeSwarmNoteName(context?.forcedNoteName) || null,
    },
  });
}

function clearBeamEffectsForWeaponSlot(slotIndex = null) {
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

function clearPendingWeaponChainsForSlot(slotIndex = null) {
  const key = Number.isFinite(slotIndex) ? Math.trunc(slotIndex) : null;
  for (let i = pendingWeaponChainEvents.length - 1; i >= 0; i--) {
    const ev = pendingWeaponChainEvents[i];
    const evSlot = Number.isFinite(ev?.context?.weaponSlotIndex) ? Math.trunc(ev.context.weaponSlotIndex) : null;
    if (key !== null && evSlot !== key) continue;
    if (ev?.eventId) removeExplosionPrimeEffectsForEvent(ev.eventId);
    pendingWeaponChainEvents.splice(i, 1);
  }
}

function shouldPlayBeamSoundForBeat(slotIndex = null, beatIndex = currentBeatIndex) {
  const beat = Math.max(0, Math.trunc(Number(beatIndex) || 0));
  if (beamSoundGateBeatIndex !== beat) {
    beamSoundGateBeatIndex = beat;
    beamSoundGateSlotKeys.clear();
  }
  const key = Number.isFinite(slotIndex) ? `slot:${Math.trunc(slotIndex)}` : 'slot:none';
  if (beamSoundGateSlotKeys.has(key)) return false;
  beamSoundGateSlotKeys.add(key);
  return true;
}

function applyAoeAt(point, variant = 'explosion', beatIndex = 0, weaponSlotIndex = null, avoidEnemyId = null, stageIndex = null, damageScale = 1) {
  if (!point) return;
  const radius = Math.max(1, Number(EXPLOSION_RADIUS_WORLD) || 1);
  const info = getLoopInfo?.();
  const beatLen = Math.max(0.05, Number(info?.beatLen) || 0.5);
  const dmgScale = Math.max(0.05, Number(damageScale) || 1);
  addExplosionEffect(point, radius, variant === 'dot-area' ? (beatLen * 2) : null, weaponSlotIndex);
  const r2 = radius * radius;
  const isDot = variant === 'dot-area';
  const hitDamage = (isDot ? 0.5 : 1) * dmgScale;
  const hitCandidates = [];
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (!e) continue;
    const dx = e.wx - point.x;
    const dy = e.wy - point.y;
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
    const dx = e.wx - point.x;
    const dy = e.wy - point.y;
    const d2 = (dx * dx) + (dy * dy);
    if (d2 <= r2) {
      withDamageSoundStage(stageIndex, () => damageEnemy(e, hitDamage));
    }
  }
  if (isDot) {
    lingeringAoeZones.push({
      x: point.x,
      y: point.y,
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

function triggerWeaponStage(stage, originWorld, beatIndex, remainingStages = [], context = null) {
  if (!stage || !originWorld) return;
  const archetype = stage.archetype;
  const variant = stage.variant;
  const continuation = sanitizeWeaponStages(remainingStages);
  const slotIndex = Number.isFinite(context?.weaponSlotIndex) ? Math.trunc(context.weaponSlotIndex) : -1;
  const stageIndex = Number.isFinite(context?.stageIndex) ? Math.trunc(context.stageIndex) : 0;
  const damageScale = Math.max(0.05, Number(context?.damageScale) || 1);
  const forcedNoteName = normalizeSwarmNoteName(context?.forcedNoteName) || null;
  const directSound = !!context?.directSound;
  const nextCtx = {
    weaponSlotIndex: slotIndex,
    stageIndex: stageIndex + 1,
    damageScale,
    forcedNoteName: normalizeSwarmNoteName(context?.forcedNoteName) || null,
    directSound,
    debugSource: String(context?.debugSource || ''),
    debugStepIndex: Number.isFinite(context?.debugStepIndex) ? Math.trunc(context.debugStepIndex) : null,
    debugBeatIndex: Number.isFinite(context?.debugBeatIndex) ? Math.trunc(context.debugBeatIndex) : null,
    debugNoteIndex: Number.isFinite(context?.debugNoteIndex) ? Math.trunc(context.debugNoteIndex) : null,
  };
  logWeaponTuneFireDebug('stage', {
    source: String(context?.debugSource || ''),
    archetype: String(archetype || ''),
    variant: String(variant || ''),
    soundEventKey: getPlayerWeaponSoundEventKeyForStage(archetype, variant) || '',
    damageScale,
    stageIndex,
    slotIndex,
    stepIndex: Number.isFinite(context?.debugStepIndex) ? Math.trunc(context.debugStepIndex) : null,
    beatIndex: Number.isFinite(context?.debugBeatIndex) ? Math.trunc(context.debugBeatIndex) : Math.trunc(Number(beatIndex) || 0),
    noteIndex: Number.isFinite(context?.debugNoteIndex) ? Math.trunc(context.debugNoteIndex) : null,
  });
  const sourceEnemyId = Number.isFinite(context?.sourceEnemyId) ? Math.trunc(context.sourceEnemyId) : null;
  const nearest = getNearestEnemy(originWorld.x, originWorld.y, sourceEnemyId);
  if (archetype === 'projectile') {
    if (!shouldMuteProjectileStageSound(slotIndex)) {
      const noteName = forcedNoteName || getSwarmEnemySoundNoteById(nearest?.id);
      const weaponSoundKey = getPlayerWeaponSoundEventKeyForStage(archetype, variant) || 'projectile';
      if (directSound) {
        playSwarmSoundEventImmediate(weaponSoundKey, getStageSoundVolume(stageIndex), noteName);
      } else {
        noteSwarmSoundEvent(weaponSoundKey, getStageSoundVolume(stageIndex), beatIndex, noteName);
      }
    }
    const facingDir = getShipFacingDirWorld();
    const baseDir = nearest
      ? normalizeDir(nearest.wx - originWorld.x, nearest.wy - originWorld.y)
      : facingDir;
    const chainSpawnOffsetWorld = getProjectileChainSpawnOffsetWorld();
    const spawnOrigin = Number.isFinite(sourceEnemyId)
      ? getOffsetPoint(originWorld, nearest ? { x: nearest.wx, y: nearest.wy } : null, chainSpawnOffsetWorld, facingDir)
      : originWorld;
    if (variant === 'homing-missile') {
      logWeaponTuneFireDebug('spawn', { source: nextCtx.debugSource, projectileKind: 'homing-missile', shots: 1, stageIndex, slotIndex });
      spawnHomingMissile(spawnOrigin, 2 * damageScale, continuation, beatIndex + 1, nextCtx);
      return;
    }
    if (variant === 'boomerang') {
      logWeaponTuneFireDebug('spawn', { source: nextCtx.debugSource, projectileKind: 'boomerang', shots: 1, stageIndex, slotIndex });
      spawnBoomerangProjectile(spawnOrigin, baseDir.x, baseDir.y, 2 * damageScale, continuation, beatIndex + 1, nextCtx);
      return;
    }
    if (variant === 'split-shot') {
      const baseAngle = Math.atan2(baseDir.y, baseDir.x);
      const angles = [baseAngle, baseAngle - PROJECTILE_SPLIT_ANGLE_RAD, baseAngle + PROJECTILE_SPLIT_ANGLE_RAD];
      logWeaponTuneFireDebug('spawn', { source: nextCtx.debugSource, projectileKind: 'split-shot', shots: angles.length, stageIndex, slotIndex });
      for (const ang of angles) {
        spawnProjectileFromDirection(spawnOrigin, Math.cos(ang), Math.sin(ang), 2 * damageScale, continuation, beatIndex + 1, nextCtx);
      }
      return;
    }
    logWeaponTuneFireDebug('spawn', { source: nextCtx.debugSource, projectileKind: 'standard', shots: 1, stageIndex, slotIndex });
    if (nearest) {
      spawnProjectile(spawnOrigin, nearest, 2 * damageScale, continuation, beatIndex + 1, nextCtx);
    } else {
      spawnProjectileFromDirection(spawnOrigin, baseDir.x, baseDir.y, 2 * damageScale, continuation, beatIndex + 1, nextCtx);
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
      damageScale,
      forcedNoteName: normalizeSwarmNoteName(context?.forcedNoteName) || null,
    }, anchorEnemyId);
    return;
  }
  if (archetype === 'laser') {
    if (variant === 'beam') {
      const noteName = forcedNoteName || getSwarmEnemySoundNoteById(nearest?.id);
      const weaponSoundKey = getPlayerWeaponSoundEventKeyForStage(archetype, variant) || 'beam';
      const slotKey = Number.isFinite(slotIndex) ? Math.trunc(slotIndex) : -1;
      const sustain = beamSustainStateBySlot.get(slotKey) || null;
      const sameNote = sustain && String(sustain.note || '') === String(noteName || '');
      const contiguous = sustain && Math.max(0, Math.trunc(Number(beatIndex) || 0)) === (Math.max(0, Math.trunc(Number(sustain.beat) || 0)) + 1);
      const sustaining = !!(sameNote && contiguous);
      const beamVol = getStageSoundVolume(stageIndex) * (sustaining ? 0.36 : 0.82);
      if (shouldPlayBeamSoundForBeat(slotIndex, beatIndex)) {
        if (directSound) {
          playSwarmSoundEventImmediate(weaponSoundKey, beamVol, noteName);
        } else {
          noteSwarmSoundEvent(weaponSoundKey, beamVol, beatIndex, noteName);
        }
      }
      beamSustainStateBySlot.set(slotKey, {
        beat: Math.max(0, Math.trunc(Number(beatIndex) || 0)),
        note: String(noteName || ''),
      });
      if (!nearest) {
        const dir = getShipFacingDirWorld();
        addLaserEffect(originWorld, {
          x: originWorld.x + (dir.x * 1400),
          y: originWorld.y + (dir.y * 1400),
        }, slotIndex, sourceEnemyId, null);
        if (continuation.length) {
          queueWeaponChain(beatIndex + 1, continuation, {
            origin: originWorld,
            impactPoint: {
              x: originWorld.x + (dir.x * 1400),
              y: originWorld.y + (dir.y * 1400),
            },
            weaponSlotIndex: slotIndex,
            stageIndex: stageIndex + 1,
            damageScale,
            forcedNoteName: normalizeSwarmNoteName(context?.forcedNoteName) || null,
          });
        }
        return;
      }
      addBeamEffect(originWorld, nearest, getGameplayBeatLen(), slotIndex, BEAM_DAMAGE_PER_SECOND * damageScale);
      const beamFx = effects[effects.length - 1];
      if (beamFx && beamFx.kind === 'beam') beamFx.sourceEnemyId = sourceEnemyId;
      if (continuation.length) {
        const firstNext = continuation[0];
        const restNext = continuation.slice(1);
        if (firstNext?.archetype === 'laser' && firstNext?.variant === 'beam') {
          triggerWeaponStage(firstNext, { x: nearest.wx, y: nearest.wy }, beatIndex, restNext, {
            origin: context?.origin || originWorld,
            impactPoint: { x: nearest.wx, y: nearest.wy },
            weaponSlotIndex: slotIndex,
            stageIndex: stageIndex + 1,
            impactEnemyId: Number.isFinite(nearest.id) ? Math.trunc(nearest.id) : null,
            sourceEnemyId: Number.isFinite(nearest.id) ? Math.trunc(nearest.id) : null,
            damageScale,
            forcedNoteName: normalizeSwarmNoteName(context?.forcedNoteName) || null,
          });
        } else {
          queueWeaponChain(beatIndex + 1, continuation, {
            origin: originWorld,
            impactPoint: { x: nearest.wx, y: nearest.wy },
            weaponSlotIndex: slotIndex,
            stageIndex: stageIndex + 1,
            impactEnemyId: Number.isFinite(nearest.id) ? Math.trunc(nearest.id) : null,
            sourceEnemyId: Number.isFinite(nearest.id) ? Math.trunc(nearest.id) : null,
            damageScale,
            forcedNoteName: normalizeSwarmNoteName(context?.forcedNoteName) || null,
          });
        }
      }
      return;
    }
    {
      const noteName = forcedNoteName || getSwarmEnemySoundNoteById(nearest?.id);
      const weaponSoundKey = getPlayerWeaponSoundEventKeyForStage(archetype, variant) || 'hitscan';
      if (directSound) {
        playSwarmSoundEventImmediate(weaponSoundKey, getStageSoundVolume(stageIndex), noteName);
      } else {
        noteSwarmSoundEvent(weaponSoundKey, getStageSoundVolume(stageIndex), beatIndex, noteName);
      }
    }
    if (!nearest) {
      const dir = getShipFacingDirWorld();
      const to = {
        x: originWorld.x + (dir.x * 1400),
        y: originWorld.y + (dir.y * 1400),
      };
      addLaserEffect(originWorld, to, slotIndex, sourceEnemyId, null);
      if (continuation.length) {
        queueWeaponChain(beatIndex + 1, continuation, {
          origin: originWorld,
          impactPoint: to,
          weaponSlotIndex: slotIndex,
          stageIndex: stageIndex + 1,
          damageScale,
          forcedNoteName: normalizeSwarmNoteName(context?.forcedNoteName) || null,
        });
      }
      return;
    }
    addLaserEffect(
      originWorld,
      { x: nearest.wx, y: nearest.wy },
      slotIndex,
      sourceEnemyId,
      Number.isFinite(nearest.id) ? Math.trunc(nearest.id) : null
    );
    withDamageSoundStage(stageIndex, () => damageEnemy(nearest, 2 * damageScale));
    if (continuation.length) {
      const firstNext = continuation[0];
      const restNext = continuation.slice(1);
      if (firstNext?.archetype === 'laser' && firstNext?.variant === 'hitscan') {
        triggerWeaponStage(firstNext, { x: nearest.wx, y: nearest.wy }, beatIndex, restNext, {
          origin: context?.origin || originWorld,
          impactPoint: { x: nearest.wx, y: nearest.wy },
          weaponSlotIndex: slotIndex,
          stageIndex: stageIndex + 1,
          impactEnemyId: Number.isFinite(nearest.id) ? Math.trunc(nearest.id) : null,
          sourceEnemyId: Number.isFinite(nearest.id) ? Math.trunc(nearest.id) : null,
          damageScale,
          forcedNoteName: normalizeSwarmNoteName(context?.forcedNoteName) || null,
        });
      } else {
        queueWeaponChain(beatIndex + 1, continuation, {
          origin: originWorld,
          impactPoint: { x: nearest.wx, y: nearest.wy },
          weaponSlotIndex: slotIndex,
          stageIndex: stageIndex + 1,
          impactEnemyId: Number.isFinite(nearest.id) ? Math.trunc(nearest.id) : null,
          sourceEnemyId: Number.isFinite(nearest.id) ? Math.trunc(nearest.id) : null,
          damageScale,
          forcedNoteName: normalizeSwarmNoteName(context?.forcedNoteName) || null,
        });
      }
    }
    return;
  }
  if (archetype === 'aoe') {
    const aoeHit = applyAoeAt(originWorld, variant, beatIndex, slotIndex, sourceEnemyId, stageIndex, damageScale);
    if (variant === 'explosion') {
      const explosionSoundKey = getPlayerWeaponSoundEventKeyForStage(archetype, variant) || 'explosion';
      const defaultExplosionNote = normalizeSwarmNoteName(SWARM_SOUND_EVENTS[explosionSoundKey]?.note) || 'C4';
      if (directSound) {
        playSwarmSoundEventImmediate(explosionSoundKey, getStageSoundVolume(stageIndex), defaultExplosionNote);
      } else {
        noteSwarmSoundEvent(explosionSoundKey, getStageSoundVolume(stageIndex), beatIndex, defaultExplosionNote);
      }
    }
    if (continuation.length) {
      if (variant === 'explosion' && aoeHit?.firstHitPoint) {
        const firstNext = continuation[0];
        const restNext = continuation.slice(1);
        const nextOrigin = aoeHit.firstHitPoint;
        triggerWeaponStage(firstNext, nextOrigin, beatIndex, restNext, {
          origin: context?.origin || originWorld,
          impactPoint: nextOrigin,
          weaponSlotIndex: slotIndex,
          stageIndex: stageIndex + 1,
          impactEnemyId: Number.isFinite(aoeHit.firstHitEnemyId) ? Math.trunc(aoeHit.firstHitEnemyId) : null,
          sourceEnemyId: Number.isFinite(aoeHit.firstHitEnemyId) ? Math.trunc(aoeHit.firstHitEnemyId) : null,
          damageScale,
          forcedNoteName: normalizeSwarmNoteName(context?.forcedNoteName) || null,
        });
      } else if (variant !== 'explosion') {
        queueWeaponChain(beatIndex + 1, continuation, {
          origin: context?.origin || originWorld,
          impactPoint: originWorld,
          weaponSlotIndex: slotIndex,
          stageIndex: stageIndex + 1,
          damageScale,
          forcedNoteName: normalizeSwarmNoteName(context?.forcedNoteName) || null,
        });
      }
    }
  }
}

function processPendingWeaponChains(beatIndex) {
  for (let i = pendingWeaponChainEvents.length - 1; i >= 0; i--) {
    const ev = pendingWeaponChainEvents[i];
    if ((Number(ev?.beatIndex) || 0) > beatIndex) continue;
    pendingWeaponChainEvents.splice(i, 1);
    if (Number.isFinite(ev?.eventId)) removeExplosionPrimeEffectsForEvent(ev.eventId);
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
    const stageIndex = Number.isFinite(z.stageIndex) ? Math.trunc(z.stageIndex) : null;
    for (let j = enemies.length - 1; j >= 0; j--) {
      const e = enemies[j];
      const dx = e.wx - z.x;
      const dy = e.wy - z.y;
      if ((dx * dx + dy * dy) <= r2) withDamageSoundStage(stageIndex, () => damageEnemy(e, dmg));
    }
  }
}

function fireConfiguredWeaponsOnBeat(centerWorld, beatIndex, contextBeatIndex = beatIndex) {
  if (!centerWorld) return { attempted: false, playerAudible: false };
  const slotIndex = Math.max(0, Math.min(weaponLoadout.length - 1, Math.trunc(Number(activeWeaponSlotIndex) || 0)));
  if (weaponSubBoardState.open && Math.trunc(Number(weaponSubBoardState.slotIndex) || -1) === slotIndex) {
    return { attempted: false, playerAudible: false };
  }
  const weapon = weaponLoadout[slotIndex];
  const stages = sanitizeWeaponStages(weapon?.stages);
  if (stages.length) {
    const tuneStats = getWeaponTuneActivityStats(slotIndex);
    const damageScale = getWeaponTuneDamageScale(slotIndex);
    const tuneNotes = getWeaponTuneStepNotes(slotIndex, beatIndex);
    const noteName = tuneNotes.length ? tuneNotes[0] : null;
    logWeaponTuneFireDebug('step', {
      slotIndex,
      stepIndex: Math.trunc(Number(beatIndex) || 0),
      beatIndex: Math.trunc(Number(contextBeatIndex) || 0),
      noteCount: tuneNotes.length,
      notes: tuneNotes.slice(),
      chosenNote: noteName,
      damageScale,
      activeNotes: Math.max(0, Math.trunc(Number(tuneStats?.activeNotes) || 0)),
      totalNotes: Math.max(1, Math.trunc(Number(tuneStats?.totalNotes) || WEAPON_TUNE_STEPS)),
      firstStage: `${String(stages[0]?.archetype || '')}:${String(stages[0]?.variant || '')}`,
    });
    if (!noteName) {
      clearBeamEffectsForWeaponSlot(slotIndex);
      clearPendingWeaponChainsForSlot(slotIndex);
      beamSustainStateBySlot.delete(slotIndex);
      return { attempted: true, playerAudible: false };
    }
    const first = stages[0];
    const rest = stages.slice(1);
    pulsePlayerShipNoteFlash();
    triggerWeaponStage(first, centerWorld, contextBeatIndex, rest, {
      origin: centerWorld,
      impactPoint: centerWorld,
      weaponSlotIndex: slotIndex,
      stageIndex: 0,
      damageScale,
      forcedNoteName: noteName,
      directSound: true,
      debugSource: 'tune-primary',
      debugStepIndex: Math.trunc(Number(beatIndex) || 0),
      debugBeatIndex: Math.trunc(Number(contextBeatIndex) || 0),
      debugNoteIndex: 0,
    });
    return { attempted: true, playerAudible: true };
  }
  clearBeamEffectsForWeaponSlot(slotIndex);
  clearPendingWeaponChainsForSlot(slotIndex);
  beamSustainStateBySlot.delete(slotIndex);
  // Backward compatibility: legacy pickup behavior if no configured stages exist.
  const anyConfigured = weaponLoadout.some((w) => Array.isArray(w.stages) && w.stages.length > 0);
  if (anyConfigured) return { attempted: true, playerAudible: false };
  let playerAudible = false;
  if (equippedWeapons.has('explosion')) applyAoeAt(centerWorld, 'explosion', contextBeatIndex);
  if (equippedWeapons.has('explosion')) playerAudible = true;
  const target = getNearestEnemy(centerWorld.x, centerWorld.y);
  if (!target) return { attempted: true, playerAudible };
  if (equippedWeapons.has('laser')) {
    addLaserEffect(
      centerWorld,
      { x: target.wx, y: target.wy },
      null,
      null,
      Number.isFinite(target.id) ? Math.trunc(target.id) : null
    );
    damageEnemy(target, weaponDefs.laser.damage);
    playerAudible = true;
  }
  if (equippedWeapons.has('projectile')) {
    spawnProjectile(centerWorld, target, weaponDefs.projectile.damage, null, null);
    playerAudible = true;
  }
  return { attempted: true, playerAudible };
}

function updateBeatWeapons(centerWorld) {
  const director = ensureSwarmDirector();
  if (!isRunning?.()) {
    lastBeatIndex = null;
    lastWeaponTuneStepIndex = null;
    lastSpawnerEnemyStepIndex = null;
    swarmPacingRuntime.reset(Math.floor(Math.max(0, Math.trunc(Number(currentBeatIndex) || 0)) / Math.max(1, COMPOSER_BEATS_PER_BAR)));
    resetEnergyStateRuntime(Math.floor(Math.max(0, Math.trunc(Number(currentBeatIndex) || 0)) / Math.max(1, COMPOSER_BEATS_PER_BAR)));
    resetEnergyGravityRuntime();
    director.reset();
    director.syncToBeat(Math.max(0, Math.trunc(Number(currentBeatIndex) || 0)));
    updateSwarmDirectorDebugHud({
      reason: 'transport-stopped',
      stepChanged: false,
      beatChanged: false,
      beatIndex: currentBeatIndex,
      stepIndex: Math.max(0, Math.trunc(Number(director.getSnapshot()?.stepIndex) || 0)),
      spawnerActiveCount: 0,
      spawnerTriggeredCount: 0,
      spawnerSpawnCount: 0,
      directorState: director.getSnapshot(),
    });
    return;
  }
  const info = getLoopInfo?.();
  const tick = director.updateFromLoopInfo(info);
  if (!tick?.valid) return;
  const beatLen = Math.max(0, Number(info?.beatLen) || 0);
  if (!(beatLen > 0)) return;
  const beatIndex = Math.max(0, Math.trunc(Number(tick.beatIndex) || 0));
  const stepIndex = Math.max(0, Math.trunc(Number(tick.stepIndex) || 0));
  const barIndex = Math.max(0, Math.trunc(Number(tick.barIndex) || 0));
  currentBeatIndex = beatIndex;
  swarmPacingRuntime.updateForBar(barIndex);
  swarmPaletteRuntime.updateForBar(barIndex);
  applyEnergyStateForBar(barIndex);
  updateComposerForBeat(beatIndex);
  const pacingSnapshot = swarmPacingRuntime.getSnapshot();
  const paletteSnapshot = swarmPaletteRuntime.getSnapshot();
  const pacingSignature = [
    String(pacingSnapshot?.state || ''),
    Math.max(0, Math.trunc(Number(pacingSnapshot?.stateStartBar) || 0)),
    String(pacingSnapshot?.responseMode || ''),
    Math.max(0, Math.trunc(Number(pacingSnapshot?.cycle) || 0)),
  ].join('|');
  if (pacingSignature && pacingSignature !== musicLabLastPacingSignature) {
    musicLabLastPacingSignature = pacingSignature;
    try {
      swarmMusicLab.notePacingChange(pacingSnapshot, getMusicLabContext({ beatIndex, barIndex }));
    } catch {}
  }
  const paletteSignature = [
    String(paletteSnapshot?.id || ''),
    Math.max(0, Math.trunc(Number(paletteSnapshot?.paletteIndex) || 0)),
    String(paletteSnapshot?.theme || ''),
    String(paletteSnapshot?.roles?.bass || ''),
    String(paletteSnapshot?.roles?.lead || ''),
    String(paletteSnapshot?.roles?.accent || ''),
    String(paletteSnapshot?.roles?.motion || ''),
  ].join('|');
  if (paletteSignature && paletteSignature !== musicLabLastPaletteSignature) {
    musicLabLastPaletteSignature = paletteSignature;
    try {
      swarmMusicLab.notePaletteChange(paletteSnapshot, getMusicLabContext({ beatIndex, barIndex }));
    } catch {}
  }
  let spawnerStepStats = { activeSpawners: 0, triggeredSpawners: 0, spawnedEnemies: 0 };
  let queuedStepEvents = 0;
  let drainedStepEvents = 0;
  const stepChanged = !!tick?.stepChanged || stepIndex !== lastSpawnerEnemyStepIndex || stepIndex !== lastWeaponTuneStepIndex;
  if (stepChanged) {
    const playerLikelyAudible = isPlayerWeaponStepLikelyAudible(stepIndex);
    const spawnerStep = collectSpawnerStepBeatEvents(stepIndex, beatIndex);
    spawnerStepStats = spawnerStep?.stats || spawnerStepStats;
    const rawEnemyEvents = [
      ...(Array.isArray(spawnerStep?.events) ? spawnerStep.events : []),
      ...collectDrawSnakeStepBeatEvents(stepIndex, beatIndex),
      ...collectComposerGroupStepBeatEvents(stepIndex, beatIndex),
    ];
    let enemyKeepCount = 0;
    const filteredEnemyEvents = playerLikelyAudible
      ? rawEnemyEvents.filter((ev) => {
        const keep = shouldKeepEnemyEventDuringPlayerStep(ev, enemyKeepCount);
        if (keep) enemyKeepCount += 1;
        return keep;
      })
      : rawEnemyEvents;
    const withPlayerDuck = (ev) => {
      if (!playerLikelyAudible || !ev || typeof ev !== 'object') return ev;
      const action = String(ev.actionType || '').trim().toLowerCase();
      if (!action || action === 'player-weapon-step') return ev;
      const payload = ev?.payload && typeof ev.payload === 'object' ? ev.payload : {};
      return {
        ...ev,
        payload: {
          ...payload,
          duckForPlayer: true,
        },
      };
    };
    const stepEvents = [
      ...filteredEnemyEvents.map(withPlayerDuck),
      createPerformedBeatEvent({
        actorId: 0,
        beatIndex,
        stepIndex,
        role: BEAT_EVENT_ROLES.ACCENT,
        note: '',
        instrumentId: '',
        actionType: 'player-weapon-step',
        threatClass: BEAT_EVENT_THREAT.FULL,
        visualSyncType: 'weapon-fire',
        payload: {
          centerWorld: { x: Number(centerWorld?.x) || 0, y: Number(centerWorld?.y) || 0 },
        },
      }),
    ];
    for (const ev of stepEvents) {
      const queued = director.enqueueBeatEvent(ev);
      if (queued) {
        queuedStepEvents += 1;
        try {
          swarmMusicLab.logQueuedEvent(queued, getMusicLabContext({
            beatIndex,
            stepIndex,
            barIndex,
          }));
        } catch {}
      }
    }
    const drained = director.drainBeatEventsForStep(beatIndex, stepIndex);
    for (const ev of drained) {
      if (executePerformedBeatEvent(ev)) drainedStepEvents += 1;
    }
    lastSpawnerEnemyStepIndex = stepIndex;
    lastWeaponTuneStepIndex = stepIndex;
    pushSwarmStepDebugEvent({
      beat: beatIndex,
      step: stepIndex,
      activeSpawners: Number(spawnerStepStats?.activeSpawners) || 0,
      triggeredSpawners: Number(spawnerStepStats?.triggeredSpawners) || 0,
      stepChanged: true,
      source: 'updateBeatWeapons',
    });
  }
  const beatChanged = !!tick?.beatChanged || beatIndex !== lastBeatIndex;
  try {
    swarmMusicLab.noteThreatBudgetSnapshot(director.getSnapshot(), getMusicLabContext({
      beatIndex,
      stepIndex,
      barIndex,
    }));
  } catch {}
  updateSwarmDirectorDebugHud({
    reason: stepChanged ? 'step' : (beatChanged ? 'beat-only' : 'frame'),
    stepChanged,
    beatChanged,
    beatIndex,
    stepIndex,
    spawnerActiveCount: Number(spawnerStepStats?.activeSpawners) || 0,
    spawnerTriggeredCount: Number(spawnerStepStats?.triggeredSpawners) || 0,
    spawnerSpawnCount: Number(spawnerStepStats?.spawnedEnemies) || 0,
    queuedStepEvents,
    drainedStepEvents,
    directorState: director.getSnapshot(),
  });
  if (!beatChanged) return;
  if (swarmDirectorDebug.logBeats) {
    try { console.log('[BeatSwarmDirector][beat]', director.getSnapshot()); } catch {}
  }
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

function keepDrawSnakeEnemyOnscreen(enemy, dt) {
  if (String(enemy?.enemyType || '') !== 'drawsnake') return null;
  const s = worldToScreen({ x: Number(enemy.wx) || 0, y: Number(enemy.wy) || 0 });
  const screenW = Math.max(1, Number(window.innerWidth) || 0);
  const screenH = Math.max(1, Number(window.innerHeight) || 0);
  const pad = Math.max(40, Number(DRAW_SNAKE_SCREEN_MARGIN_PX) || 140);
  if (!s || !Number.isFinite(s.x) || !Number.isFinite(s.y)) return s;
  const isOffscreen = s.x < -pad || s.y < -pad || s.x > (screenW + pad) || s.y > (screenH + pad);
  if (!enemy.drawsnakeHasEnteredScreen) {
    if (isOffscreen) return s;
    enemy.drawsnakeHasEnteredScreen = true;
  }
  const clampedX = Math.max(pad, Math.min(screenW - pad, s.x));
  const clampedY = Math.max(pad, Math.min(screenH - pad, s.y));
  if (Math.abs(clampedX - s.x) < 0.001 && Math.abs(clampedY - s.y) < 0.001) return s;
  const pulled = screenToWorld({ x: clampedX, y: clampedY });
  if (!pulled || !Number.isFinite(pulled.x) || !Number.isFinite(pulled.y)) return s;
  const pullRate = Math.max(0.5, Number(DRAW_SNAKE_EDGE_PULL_RATE) || 8);
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
  return worldToScreen({ x: enemy.wx, y: enemy.wy }) || s;
}

function updateEnemies(dt) {
  if (!enemies.length) return;
  const centerWorld = getViewportCenterWorld();
  const z = getZoomState();
  const scale = Number.isFinite(z?.targetScale) ? z.targetScale : (Number.isFinite(z?.currentScale) ? z.currentScale : 1);
  const hitRadiusWorld = ENEMY_HIT_RADIUS / Math.max(0.001, scale || 1);
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    const enemyType = String(e?.enemyType || '');
    const lifecycleState = normalizeMusicLifecycleState(e?.lifecycleState || 'active', 'active');
    const aggressionScale = getLifecycleAggressionScale(lifecycleState);
    if (enemyType === 'spawner') updateSpawnerEnemyFlash(e, dt);
    const isPersistentSpecialEnemy = enemyType === 'spawner' || enemyType === 'drawsnake';
    if (!e?.retreating && lifecycleState === 'retiring' && enemyType === 'composer-group-member') {
      const retireStartedMs = Number(e?.retirePhaseStartMs) || 0;
      const nowMs = Number(performance?.now?.() || 0);
      if (retireStartedMs > 0 && (nowMs - retireStartedMs) >= (RETIRING_RETREAT_DELAY_SEC * 1000)) {
        startEnemyRetreat(e, e?.retireReason || 'retreated', 'retiring-timeout');
      }
    }
    if (e?.retreating) {
      const away = normalizeDir(
        (Number(e.wx) || 0) - (Number(centerWorld.x) || 0),
        (Number(e.wy) || 0) - (Number(centerWorld.y) || 0),
        Number(e.vx) || 0,
        Number(e.vy) || 0
      );
      const retreatSpeed = ENEMY_MAX_SPEED * (enemyType === 'composer-group-member' ? 0.95 : 1.05);
      const blend = Math.max(0, Math.min(1, dt * 2.2));
      e.vx += (((Number(away.x) || 0) * retreatSpeed) - (Number(e.vx) || 0)) * blend;
      e.vy += (((Number(away.y) || 0) * retreatSpeed) - (Number(e.vy) || 0)) * blend;
      e.wx += (Number(e.vx) || 0) * dt;
      e.wy += (Number(e.vy) || 0) * dt;
      const s = worldToScreen({ x: e.wx, y: e.wy });
      if (!s || !Number.isFinite(s.x) || !Number.isFinite(s.y)) {
        removeEnemy(e, e.retreatReason || 'retreated', {
          retireOrigin: String(e?.retreatOrigin || '').trim().toLowerCase(),
        });
        enemies.splice(i, 1);
        continue;
      }
      const outPad = 120;
      if (s.x < -outPad || s.y < -outPad || s.x > window.innerWidth + outPad || s.y > window.innerHeight + outPad) {
        removeEnemy(e, e.retreatReason || 'retreated', {
          retireOrigin: String(e?.retreatOrigin || '').trim().toLowerCase(),
        });
        enemies.splice(i, 1);
        continue;
      }
      if (e.el) {
        e.spawnT = Math.min(Number(e.spawnDur) || 0.14, (Number(e.spawnT) || 0) + dt);
        const spawnScale = enemyType === 'drawsnake' ? 1 : getEnemySpawnScale(e);
        e.el.style.transform = `translate(${s.x}px, ${s.y}px) scale(${spawnScale.toFixed(3)})`;
      }
      if (enemyType === 'dumb' && Number.isFinite(e?.linkedSpawnerId)) updateSpawnerLinkedEnemyLine(e);
      if (enemyType === 'drawsnake') updateDrawSnakeVisual(e, scale, dt);
      continue;
    }
    const dx = centerWorld.x - e.wx;
    const dy = centerWorld.y - e.wy;
    const d = Math.hypot(dx, dy) || 0.0001;
    const typeSpeedMult = String(e?.enemyType || '') === 'spawner' ? SPAWNER_ENEMY_SPEED_MULTIPLIER : 1;
    const speedMult = Math.max(0.05, Number(difficultyConfig.enemySpeedMultiplier) || 1)
      * Math.max(0.05, Number(typeSpeedMult) || 1)
      * Math.max(0.35, aggressionScale);
    let ax = (dx / d) * ENEMY_ACCEL * speedMult;
    let ay = (dy / d) * ENEMY_ACCEL * speedMult;
    if (enemyType === 'drawsnake') {
      const curAngle = Number(e.drawsnakeMoveAngle);
      e.drawsnakeMoveAngle = Number.isFinite(curAngle) ? curAngle : (Math.random() * Math.PI * 2);
      e.drawsnakeTurnTimer = (Number(e.drawsnakeTurnTimer) || 0) - dt;
      if (!(Number(e.drawsnakeTurnTimer) > 0)) {
        e.drawsnakeTurnTimer = randRange(DRAW_SNAKE_TURN_INTERVAL_MIN, DRAW_SNAKE_TURN_INTERVAL_MAX);
        const dir = Math.random() >= 0.5 ? 1 : -1;
        e.drawsnakeTurnTarget = dir * randRange(DRAW_SNAKE_TURN_RATE_MIN, DRAW_SNAKE_TURN_RATE_MAX);
      }
      const targetTurn = Number(e.drawsnakeTurnTarget) || 0;
      const curTurn = Number(e.drawsnakeTurnRate) || 0;
      const turnBlend = Math.max(0, Math.min(1, dt * 1.85));
      e.drawsnakeTurnRate = curTurn + ((targetTurn - curTurn) * turnBlend);
      e.drawsnakeWindPhase = (Number(e.drawsnakeWindPhase) || 0) + (dt * Math.PI * 2 * DRAW_SNAKE_WIND_FREQ_HZ);
      const wind = Math.sin(Number(e.drawsnakeWindPhase) || 0);
      e.drawsnakeMoveAngle += ((Number(e.drawsnakeTurnRate) || 0) + (wind * 0.18)) * dt;
      const arenaCenter = (arenaCenterWorld && Number.isFinite(arenaCenterWorld.x) && Number.isFinite(arenaCenterWorld.y))
        ? arenaCenterWorld
        : centerWorld;
      const toArenaX = Number(arenaCenter.x) - Number(e.wx);
      const toArenaY = Number(arenaCenter.y) - Number(e.wy);
      const arenaDist = Math.hypot(toArenaX, toArenaY) || 0.0001;
      const arenaSoft = SWARM_ARENA_RADIUS_WORLD * DRAW_SNAKE_ARENA_BIAS_RADIUS_SCALE;
      if (arenaDist > arenaSoft) {
        const inwardAngle = Math.atan2(toArenaY, toArenaX);
        let delta = inwardAngle - e.drawsnakeMoveAngle;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        const over = Math.max(0, arenaDist - arenaSoft);
        const maxOver = Math.max(1, SWARM_ARENA_RADIUS_WORLD - arenaSoft);
        const bias = Math.max(0, Math.min(1, over / maxOver)) * DRAW_SNAKE_ARENA_BIAS_STRENGTH;
        e.drawsnakeMoveAngle += delta * Math.max(0, Math.min(1, bias));
      }
      const roamSpeed = ENEMY_MAX_SPEED * Math.max(0.36, Math.min(1.2, speedMult * 0.78));
      const desiredVx = Math.cos(e.drawsnakeMoveAngle) * roamSpeed;
      const desiredVy = Math.sin(e.drawsnakeMoveAngle) * roamSpeed;
      const blend = Math.max(0, Math.min(1, dt * 2.2));
      e.vx += (desiredVx - e.vx) * blend;
      e.vy += (desiredVy - e.vy) * blend;
      ax = 0;
      ay = 0;
    }
    if (enemyType === 'composer-group-member') {
      const sepR = Math.max(20, Number(COMPOSER_GROUP_SEPARATION_RADIUS_WORLD) || 200);
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
        const force = Math.max(0, Number(COMPOSER_GROUP_SEPARATION_FORCE) || 0) * Math.max(0.45, aggressionScale);
        ax += (repelX / repelLen) * force;
        ay += (repelY / repelLen) * force;
      }
    }
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
      if (lifecycleState === 'retiring') {
        const back = normalizeDir(e.wx - centerWorld.x, e.wy - centerWorld.y, e.vx, e.vy);
        const repulseSpeed = Math.max(80, ENEMY_MAX_SPEED * Math.max(0.4, aggressionScale));
        e.vx = back.x * repulseSpeed;
        e.vy = back.y * repulseSpeed;
        e.wx += e.vx * Math.max(0.016, dt * 1.2);
        e.wy += e.vy * Math.max(0.016, dt * 1.2);
        continue;
      }
      if (enemyType === 'drawsnake') {
        e.drawsnakeMoveAngle = (Number(e.drawsnakeMoveAngle) || 0) + Math.PI * 0.75;
        e.vx *= -0.45;
        e.vy *= -0.45;
        continue;
      }
      if (enemyType === 'dumb' && Number.isFinite(e?.linkedSpawnerId)) {
        const back = normalizeDir(e.wx - centerWorld.x, e.wy - centerWorld.y, e.vx, e.vy);
        e.vx = back.x * Math.max(120, Math.hypot(e.vx, e.vy));
        e.vy = back.y * Math.max(120, Math.hypot(e.vx, e.vy));
        e.wx += e.vx * Math.max(0.016, dt * 1.6);
        e.wy += e.vy * Math.max(0.016, dt * 1.6);
        continue;
      }
      removeEnemy(e, 'killed');
      enemies.splice(i, 1);
      continue;
    }
    const s = (enemyType === 'drawsnake')
      ? keepDrawSnakeEnemyOnscreen(e, dt)
      : worldToScreen({ x: e.wx, y: e.wy });
    if (!s || !Number.isFinite(s.x) || !Number.isFinite(s.y)) {
      if (isPersistentSpecialEnemy) {
        if (e.el) e.el.style.transform = 'translate(-9999px, -9999px)';
        continue;
      }
      removeEnemy(e, 'expired');
      enemies.splice(i, 1);
      continue;
    }
    if (s.x < -80 || s.y < -80 || s.x > window.innerWidth + 80 || s.y > window.innerHeight + 80) {
      if (isPersistentSpecialEnemy) {
        // Keep persistent rhythm enemies alive when they travel off-screen.
        // We still update their transform so they can fully move beyond the edge.
      } else {
        removeEnemy(e, 'retreated');
        enemies.splice(i, 1);
        continue;
      }
    }
    if (e.el) {
      e.spawnT = Math.min(Number(e.spawnDur) || 0.14, (Number(e.spawnT) || 0) + dt);
      const spawnScale = enemyType === 'drawsnake' ? 1 : getEnemySpawnScale(e);
      let actionScale = 1;
      if (enemyType === 'composer-group-member') {
        const pulseDur = Math.max(0.01, Number(e.composerActionPulseDur) || COMPOSER_GROUP_ACTION_PULSE_SECONDS);
        const pulseT = Math.max(0, Number(e.composerActionPulseT) || 0);
        if (pulseT > 0) {
          const phase = 1 - Math.max(0, Math.min(1, pulseT / pulseDur));
          actionScale = 1 + (Math.sin(phase * Math.PI) * COMPOSER_GROUP_ACTION_PULSE_SCALE);
          e.composerActionPulseT = Math.max(0, pulseT - dt);
        }
      }
      e.el.style.transform = `translate(${s.x}px, ${s.y}px) scale(${(spawnScale * actionScale).toFixed(3)})`;
    }
    if (enemyType === 'dumb' && Number.isFinite(e?.linkedSpawnerId)) updateSpawnerLinkedEnemyLine(e);
    if (enemyType === 'drawsnake') updateDrawSnakeVisual(e, scale, dt);
  }
}

function spawnFallbackEnemyOffscreen() {
  const w = Math.max(1, Number(window.innerWidth) || 0);
  const h = Math.max(1, Number(window.innerHeight) || 0);
  const m = Math.max(8, Number(ENEMY_FALLBACK_SPAWN_MARGIN_PX) || 42);
  const side = Math.floor(Math.random() * 4);
  let x = 0;
  let y = 0;
  if (side === 0) {
    x = -m;
    y = randRange(0, h);
  } else if (side === 1) {
    x = w + m;
    y = randRange(0, h);
  } else if (side === 2) {
    x = randRange(0, w);
    y = -m;
  } else {
    x = randRange(0, w);
    y = h + m;
  }
  spawnEnemyAt(x, y);
}

function getRandomOffscreenSpawnPoint() {
  const w = Math.max(1, Number(window.innerWidth) || 0);
  const h = Math.max(1, Number(window.innerHeight) || 0);
  const m = Math.max(8, Number(ENEMY_FALLBACK_SPAWN_MARGIN_PX) || 42);
  const side = Math.floor(Math.random() * 4);
  if (side === 0) return { x: -m, y: randRange(0, h) };
  if (side === 1) return { x: w + m, y: randRange(0, h) };
  if (side === 2) return { x: randRange(0, w), y: -m };
  return { x: randRange(0, w), y: h + m };
}

function spawnComposerGroupEnemyAt(clientX, clientY, group) {
  return spawnComposerGroupEnemyAtRuntime({
    clientX,
    clientY,
    group,
    enemyLayerEl,
    enemies,
    enemyCap: ENEMY_CAP,
    screenToWorld,
    worldToScreen,
    normalizeSwarmNoteName,
    getRandomSwarmPentatonicNote,
    normalizeSwarmRole,
    nextEnemyId: () => enemyIdSeq++,
    spawnStartScale: ENEMY_SPAWN_START_SCALE,
    spawnDuration: ENEMY_SPAWN_DURATION,
    spawnMaxHp: currentEnemySpawnMaxHp,
    actionPulseSeconds: COMPOSER_GROUP_ACTION_PULSE_SECONDS,
    leadRole: BEAT_EVENT_ROLES.LEAD,
  });
}

function spawnComposerGroupOffscreenMembers(group, count = 1) {
  spawnComposerGroupOffscreenMembersRuntime({
    group,
    count,
    getRandomOffscreenSpawnPoint,
    spawnComposerGroupEnemyAt,
  });
}

function getAliveEnemiesByIds(idSet) {
  const ids = idSet instanceof Set ? idSet : new Set();
  const out = [];
  for (const e of enemies) {
    if (!ids.has(Math.trunc(Number(e?.id) || 0))) continue;
    out.push(e);
  }
  return out;
}

function spawnHostileRedProjectileAt(origin, opts = null) {
  if (!enemyLayerEl || !origin) return;
  const ang = Number.isFinite(opts?.angle) ? Number(opts.angle) : (Math.random() * Math.PI * 2);
  const speed = Math.max(120, Number(opts?.speed) || COMPOSER_GROUP_PROJECTILE_SPEED);
  const el = document.createElement('div');
  el.className = 'beat-swarm-projectile is-hostile-red';
  enemyLayerEl.appendChild(el);
  projectiles.push({
    wx: Number(origin.x) || 0,
    wy: Number(origin.y) || 0,
    vx: Math.cos(ang) * speed,
    vy: Math.sin(ang) * speed,
    ttl: PROJECTILE_LIFETIME,
    damage: Math.max(0.1, Number(opts?.damage) || 1),
    kind: 'hostile-red',
    hitEnemyIds: new Set(),
    boomCenterX: 0, boomCenterY: 0, boomDirX: 0, boomDirY: 0, boomPerpX: 0, boomPerpY: 0, boomRadius: 0, boomTheta: 0, boomOmega: 0,
    homingState: '', targetEnemyId: null, orbitAngle: 0, orbitAngVel: 0, orbitRadius: 0,
    chainWeaponSlotIndex: null, chainStageIndex: null, nextStages: [], nextBeatIndex: null, ignoreEnemyId: null,
    hasEnteredScreen: false,
    hostileToEnemies: false,
    hostileNoteName: normalizeSwarmNoteName(opts?.noteName) || 'C4',
    hostileInstrument: resolveInstrumentIdOrFallback(opts?.instrument, resolveSwarmSoundInstrumentId('projectile') || 'tone'),
    el,
  });
}

function addHostileRedExplosionEffect(centerW, radiusWorld = COMPOSER_GROUP_EXPLOSION_RADIUS_WORLD, ttlOverride = COMPOSER_GROUP_EXPLOSION_TTL) {
  if (!enemyLayerEl) return;
  const el = document.createElement('div');
  el.className = 'beat-swarm-fx-explosion is-hostile-red';
  el.style.transform = 'translate(-9999px, -9999px)';
  enemyLayerEl.appendChild(el);
  effects.push({
    kind: 'hostile-explosion',
    ttl: Math.max(0.01, Number(ttlOverride) || COMPOSER_GROUP_EXPLOSION_TTL),
    at: { ...centerW },
    radiusWorld: Math.max(10, Number(radiusWorld) || COMPOSER_GROUP_EXPLOSION_RADIUS_WORLD),
    weaponSlotIndex: null,
    el,
  });
}

function triggerCosmeticSyncAt(origin, beatIndex, reason = 'cosmetic-sync', actorEl = null) {
  if (!origin || !Number.isFinite(origin.x) || !Number.isFinite(origin.y)) return false;
  const cosmeticThreat = tryConsumeSwarmThreatIntent('cosmetic', 1, beatIndex, reason);
  if (!cosmeticThreat?.withinBudget) return false;
  addHostileRedExplosionEffect(
    { x: Number(origin.x) || 0, y: Number(origin.y) || 0 },
    Math.max(8, LOW_THREAT_BURST_RADIUS_WORLD * 0.32),
    Math.max(0.04, LOW_THREAT_BURST_TTL * 0.72)
  );
  if (actorEl) pulseHitFlash(actorEl);
  return true;
}

function triggerLowThreatBurstAt(origin, beatIndex, reason = 'low-threat-burst') {
  if (!origin || !Number.isFinite(origin.x) || !Number.isFinite(origin.y)) return false;
  const lightThreat = tryConsumeSwarmThreatIntent('light', 1, beatIndex, reason);
  if (!lightThreat?.withinBudget) {
    return triggerCosmeticSyncAt(origin, beatIndex, `${String(reason || 'low-threat-burst')}-cosmetic`);
  }
  addHostileRedExplosionEffect(
    { x: Number(origin.x) || 0, y: Number(origin.y) || 0 },
    LOW_THREAT_BURST_RADIUS_WORLD,
    LOW_THREAT_BURST_TTL
  );
  return true;
}

function chooseComposerGroupEnemyForNote(group, noteName, aliveMembers) {
  return pickComposerEnemyForNote({
    group,
    noteName,
    aliveMembers,
    normalizeNoteName: normalizeSwarmNoteName,
    getFallbackNote: getRandomSwarmPentatonicNote,
  });
}

function collectComposerGroupStepBeatEvents(stepIndex, beatIndex) {
  return collectComposerGroupStepEvents({
    active,
    gameplayPaused,
    stepIndex,
    beatIndex,
    composerEnemyGroups,
    constants: {
      stepsPerBar: WEAPON_TUNE_STEPS,
      performersMin: COMPOSER_GROUP_PERFORMERS_MIN,
      performersMax: COMPOSER_GROUP_PERFORMERS_MAX,
    },
    roles: {
      lead: BEAT_EVENT_ROLES.LEAD,
    },
    threat: {
      full: BEAT_EVENT_THREAT.FULL,
      light: BEAT_EVENT_THREAT.LIGHT,
      cosmetic: BEAT_EVENT_THREAT.COSMETIC,
    },
    callResponseRuntime,
    getCurrentPacingCaps,
    getCallResponseWindowSteps,
    isCallResponseLaneActive,
    getAliveEnemiesByIds,
    clampNoteToDirectorPool,
    normalizeSwarmNoteName,
    getRandomSwarmPentatonicNote,
    getDirectorNotePool: () => ensureSwarmDirector().getNotePool(),
    getNotePoolIndex,
    getPhraseLengthSteps: () => getCallResponseWindowSteps(),
    chooseEnemyForNote: ({ group, noteName, aliveMembers, normalizeNoteName, getFallbackNote }) => pickComposerEnemyForNote({
      group,
      noteName,
      aliveMembers,
      normalizeNoteName,
      getFallbackNote,
    }),
    normalizeSwarmRole,
    getSwarmRoleForEnemy,
    resolveSwarmRoleInstrumentId,
    resolveSwarmSoundInstrumentId,
    createPerformedBeatEvent,
    isLifecycleSchedulable,
  });
}

function maintainComposerEnemyGroups() {
  const pacingCaps = getCurrentPacingCaps();
  const composer = getComposerDirective();
  const motifScopeKey = getComposerMotifScopeKey();
  const retireGroup = (group, reason) => {
    if (!group || group.retiring) return;
    group.active = false;
    group.retiring = true;
    group.lifecycleState = 'retiring';
    group.retireReason = String(reason || 'retreated').trim().toLowerCase() || 'retreated';
    const aliveMembers = getAliveEnemiesByIds(group.memberIds)
      .filter((e) => String(e?.enemyType || '') === 'composer-group-member');
    group.memberIds = new Set(aliveMembers.map((e) => Math.trunc(Number(e?.id) || 0)).filter((id) => id > 0));
    for (const enemy of aliveMembers) {
      enemy.lifecycleState = 'retiring';
      enemy.composerRetiring = true;
      enemy.retireReason = group.retireReason;
      enemy.retirePhaseStartMs = Number(performance?.now?.() || 0);
    }
  };
  maintainComposerEnemyGroupsLifecycle({
    enabled: COMPOSER_GROUPS_ENABLED && composerRuntime.enabled,
    composerEnemyGroups,
    pacingCaps,
    composer,
    motifScopeKey,
    retireGroup,
    getAliveIdsForGroup: (group) => new Set(
      getAliveEnemiesByIds(group?.memberIds)
        .filter((e) => String(e?.enemyType || '') === 'composer-group-member')
        .map((e) => Math.trunc(Number(e?.id) || 0))
        .filter((id) => id > 0)
    ),
    spawnComposerGroupOffscreenMembers,
    pickTemplate: (groupIndex) => pickComposerGroupTemplate({
      templates: COMPOSER_GROUP_TEMPLATE_LIBRARY,
      groupIndex,
      energyState: getCurrentSwarmEnergyStateName(),
      normalizeRole: (roleName) => normalizeSwarmRole(roleName, BEAT_EVENT_ROLES.LEAD),
      bassRole: BEAT_EVENT_ROLES.BASS,
      fullThreat: BEAT_EVENT_THREAT.FULL,
    }),
    getComposerMotif,
    createComposerEnemyGroupProfile,
    createGroupFromMotif: ({ groupIndex, sectionKey, composer: composerDirective, templateId, motif, pacingCaps: caps }) => ({
      id: composerEnemyGroupIdSeq++,
      sectionKey,
      sectionId: String(composerDirective?.sectionId || 'default'),
      templateId: String(motif?.templateId || templateId),
      role: normalizeSwarmRole(motif?.role || 'lead', BEAT_EVENT_ROLES.LEAD),
      callResponseLane: normalizeCallResponseLane(motif?.callResponseLane || ((groupIndex % 2) === 0 ? 'call' : 'response')),
      shape: String(motif?.shape || pickComposerGroupShape({ shapes: COMPOSER_GROUP_SHAPES, index: groupIndex })),
      color: String(motif?.color || pickComposerGroupColor({ colors: COMPOSER_GROUP_COLORS, index: groupIndex })),
      actionType: String(motif?.actionType || 'projectile'),
      threatLevel: String(motif?.threatLevel || BEAT_EVENT_THREAT.FULL),
      performers: Math.max(
        1,
        Math.min(
          Math.max(COMPOSER_GROUP_PERFORMERS_MIN, Math.min(COMPOSER_GROUP_PERFORMERS_MAX, Math.trunc(Number(motif?.performers) || 1))),
          Math.max(1, caps?.maxComposerPerformers || COMPOSER_GROUP_PERFORMERS_MAX)
        )
      ),
      size: Math.max(
        1,
        Math.min(
          Math.max(COMPOSER_GROUP_SIZE_MIN, Math.min(COMPOSER_GROUP_SIZE_MAX, Math.trunc(Number(motif?.size) || COMPOSER_GROUP_SIZE_MIN))),
          Math.max(1, caps?.maxComposerGroupSize || COMPOSER_GROUP_SIZE_MAX)
        )
      ),
      steps: Array.isArray(motif?.steps) ? motif.steps.slice(0, WEAPON_TUNE_STEPS) : Array.from({ length: WEAPON_TUNE_STEPS }, () => Math.random() >= 0.5),
      motif: motif?.motif && typeof motif.motif === 'object'
        ? {
          id: String(motif.motif.id || `${templateId}-motif`),
          steps: Array.isArray(motif.motif.steps) ? motif.motif.steps.slice(0, WEAPON_TUNE_STEPS) : [],
        }
        : {
          id: `${templateId}-motif`,
          steps: Array.isArray(motif?.steps) ? motif.steps.slice(0, WEAPON_TUNE_STEPS) : [],
        },
      notes: (Array.isArray(motif?.notes) && motif.notes.length ? motif.notes : [getRandomSwarmPentatonicNote()])
        .map((n, idx) => clampNoteToDirectorPool(normalizeSwarmNoteName(n) || getRandomSwarmPentatonicNote(), groupIndex + idx)),
      gravityNotes: (Array.isArray(motif?.gravityNotes) ? motif.gravityNotes : [])
        .map((n, idx) => clampNoteToDirectorPool(normalizeSwarmNoteName(n) || getRandomSwarmPentatonicNote(), groupIndex + idx))
        .filter(Boolean),
      phraseRoot: clampNoteToDirectorPool(
        normalizeSwarmNoteName(motif?.phraseRoot)
          || normalizeSwarmNoteName(Array.isArray(motif?.notes) ? motif.notes[0] : '')
          || getRandomSwarmPentatonicNote(),
        groupIndex
      ),
      phraseFifth: clampNoteToDirectorPool(
        normalizeSwarmNoteName(motif?.phraseFifth)
          || normalizeSwarmNoteName(Array.isArray(motif?.notes) ? motif.notes[Math.min(2, Math.max(0, motif.notes.length - 1))] : '')
          || getRandomSwarmPentatonicNote(),
        groupIndex + 2
      ),
      resolutionTargets: (Array.isArray(motif?.resolutionTargets) ? motif.resolutionTargets : [])
        .map((n, idx) => clampNoteToDirectorPool(normalizeSwarmNoteName(n) || getRandomSwarmPentatonicNote(), groupIndex + idx + 3))
        .filter(Boolean),
      instrument: resolveInstrumentIdOrFallback(motif?.instrument, resolveSwarmSoundInstrumentId('projectile') || 'tone'),
      instrumentId: resolveInstrumentIdOrFallback(motif?.instrument, resolveSwarmSoundInstrumentId('projectile') || 'tone'),
      noteToEnemyId: new Map(),
      memberIds: new Set(),
      noteCursor: 0,
      nextSpawnNoteIndex: 0,
      active: true,
      lifecycleState: 'active',
    }),
  });
  for (const group of composerEnemyGroups) {
    if (!group || group.retiring || group.active === false) continue;
    const memberLifecycleState = normalizeMusicLifecycleState(group.lifecycleState, 'active');
    const aliveMembers = getAliveEnemiesByIds(group.memberIds)
      .filter((e) => String(e?.enemyType || '') === 'composer-group-member');
    for (const enemy of aliveMembers) enemy.lifecycleState = memberLifecycleState;
  }
}

function maintainEnemyPopulation() {
  // Section 1: fallback generic enemies are intentionally disabled.
  // Musical participation should come from explicit enemy groups/systems only.
}

function updatePickupsAndCombat(dt) {
  const centerWorld = getViewportCenterWorld();
  const z = getZoomState();
  const scale = Number.isFinite(z?.targetScale) ? z.targetScale : (Number.isFinite(z?.currentScale) ? z.currentScale : 1);
  const collectRadiusWorld = PICKUP_COLLECT_RADIUS_PX / Math.max(0.001, scale || 1);
  const projectileHitRadiusWorld = PROJECTILE_HIT_RADIUS_PX / Math.max(0.001, scale || 1);
  const projectileOffscreenPad = Math.max(16, Number(PROJECTILE_DESPAWN_OFFSCREEN_PAD_PX) || 72);
  const screenW = Math.max(1, Number(window.innerWidth) || 0);
  const screenH = Math.max(1, Number(window.innerHeight) || 0);
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
    p.collisionGraceT = Math.max(0, Number(p.collisionGraceT) - dt);
    const isBoomerang = String(p.kind || 'standard') === 'boomerang';
    const isHoming = String(p.kind || 'standard') === 'homing-missile';
    const useTtlDespawn = isBoomerang || isHoming;
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
      const nearestNow = getNearestEnemy(p.wx, p.wy, p.ignoreEnemyId);
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
        if (!target) target = getNearestEnemy(p.wx, p.wy, p.ignoreEnemyId);
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
        hitPoint = getDrawSnakeProjectileImpactPoint(e, p, projectileHitRadiusWorld, scale);
      } else {
        const dx = e.wx - p.wx;
        const dy = e.wy - p.wy;
        const enemyExtraRadiusWorld = Math.max(0, Number(e?.projectileHitRadiusPx) || 0) / Math.max(0.001, scale || 1);
        const effR = projectileHitRadiusWorld + enemyExtraRadiusWorld;
        if ((dx * dx + dy * dy) <= (effR * effR)) {
          hitPoint = { x: e.wx, y: e.wy };
        }
      }
      if (hitPoint) {
        if (isBoomerang) {
          if (!(p.hitEnemyIds instanceof Set)) p.hitEnemyIds = new Set();
          if (enemyId > 0 && p.hitEnemyIds.has(enemyId)) continue;
          if (enemyId > 0) p.hitEnemyIds.add(enemyId);
        }
        withDamageSoundStage(p.chainStageIndex, () => damageEnemy(e, p.damage));
        if (Array.isArray(p.nextStages) && p.nextStages.length) {
          const stages = sanitizeWeaponStages(p.nextStages);
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
            triggerWeaponStage(first, hitPoint, currentBeatIndex, rest, chainCtx);
          } else {
            queueWeaponChain(nextBeat, stages, chainCtx);
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
    const s = worldToScreen({ x: p.wx, y: p.wy });
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
      const deg = ((Number(p.boomTheta) || 0) * (180 / Math.PI) * PROJECTILE_BOOMERANG_SPIN_MULT) + 180;
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
            const pendingDeath = getPendingEnemyDeathByEnemyId(fx.sourceEnemyId);
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
          target = getNearestEnemy(fx.from?.x || 0, fx.from?.y || 0, fx.sourceEnemyId);
          fx.targetEnemyId = Number.isFinite(target?.id) ? Math.trunc(target.id) : null;
        }
        if (target) {
          fx.to = { x: target.wx, y: target.wy };
          damageEnemy(target, Math.max(0, Number(fx.damagePerSec) || 0) * dt);
        }
      } else if (fx.kind === 'laser') {
        if (Number.isFinite(fx.sourceEnemyId)) {
          const src = enemies.find((e) => Math.trunc(Number(e.id) || 0) === Math.trunc(fx.sourceEnemyId)) || null;
          if (src) {
            fx.from = { x: Number(src.wx) || 0, y: Number(src.wy) || 0 };
          } else {
            const pendingDeath = getPendingEnemyDeathByEnemyId(fx.sourceEnemyId);
            if (pendingDeath) fx.from = { x: Number(pendingDeath.wx) || 0, y: Number(pendingDeath.wy) || 0 };
          }
        }
        if (Number.isFinite(fx.targetEnemyId)) {
          const trg = enemies.find((e) => Math.trunc(Number(e.id) || 0) === Math.trunc(fx.targetEnemyId)) || null;
          if (trg) fx.to = { x: Number(trg.wx) || 0, y: Number(trg.wy) || 0 };
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
    } else if (fx.kind === 'explosion' || fx.kind === 'explosion-prime' || fx.kind === 'hostile-explosion') {
      const basePxRadius = Math.max(18, (Number(fx.radiusWorld) || EXPLOSION_RADIUS_WORLD) * Math.max(0.001, scale || 1));
      let radiusScale = 1;
      let opacity = Math.max(0, Math.min(1, fx.ttl / EXPLOSION_TTL));
      if (fx.kind === 'explosion-prime') {
        const anchorId = Number.isFinite(fx.anchorEnemyId) ? Math.trunc(fx.anchorEnemyId) : null;
        if (anchorId) {
          const anchorEnemy = enemies.find((e) => Math.trunc(Number(e.id) || 0) === anchorId) || null;
          if (anchorEnemy) {
            fx.at = { x: Number(anchorEnemy.wx) || 0, y: Number(anchorEnemy.wy) || 0 };
          } else {
            const pendingDeath = getPendingEnemyDeathByEnemyId(anchorId);
            if (pendingDeath) {
              fx.at = { x: Number(pendingDeath.wx) || 0, y: Number(pendingDeath.wy) || 0 };
            } else {
              try { fx.el?.remove?.(); } catch {}
              effects.splice(i, 1);
              continue;
            }
          }
        }
        const total = Math.max(0.05, Number(fx.duration) || getGameplayBeatLen());
        const elapsedN = Math.max(0, Math.min(1, 1 - (fx.ttl / total)));
        const eased = 1 - ((1 - elapsedN) * (1 - elapsedN));
        radiusScale = 0.04 + ((EXPLOSION_PRIME_MAX_SCALE - 0.04) * eased);
        opacity = 0.22 + (0.34 * eased);
      } else if (fx.kind === 'hostile-explosion') {
        opacity = Math.max(0, Math.min(1, fx.ttl / Math.max(0.01, COMPOSER_GROUP_EXPLOSION_TTL)));
      }
      const c = worldToScreen({ x: Number(fx.at?.x) || 0, y: Number(fx.at?.y) || 0 });
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

  updateEnergyGravityRuntime(dt, centerWorld, scale);
  updateBeatWeapons(centerWorld);
  flushSwarmSoundEventsForBeat(currentBeatIndex);
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

function pulsePlayerShipNoteFlash() {
  const shipEl = overlayEl?.querySelector?.('.beat-swarm-ship');
  if (!(shipEl instanceof HTMLElement)) return;
  shipEl.classList.remove('is-note-flash');
  void shipEl.offsetWidth;
  shipEl.classList.add('is-note-flash');
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
  if (dragPointerId == null) {
    if (active && perfLabRuntime.autoMoveEnabled) {
      const nowSec = (performance.now() || 0) * 0.001;
      const phase = nowSec + (Number(perfLabRuntime.autoMovePhase) || 0);
      // Smooth looping vector to keep movement realistic but deterministic for perf runs.
      const x = (Math.cos(phase * 0.9) * 0.82) + (Math.cos(phase * 0.31) * 0.28);
      const y = (Math.sin(phase * 0.74) * 0.78) + (Math.sin(phase * 0.19) * 0.34);
      const len = Math.hypot(x, y) || 1;
      return {
        x: x / len,
        y: y / len,
        mag: Math.max(0.15, Math.min(1, Number(perfLabRuntime.autoMoveMagnitude) || 0.82)),
      };
    }
    return { x: 0, y: 0, mag: 0 };
  }
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
    updateSwarmDirectorDebugHud({
      reason: 'paused',
      stepChanged: false,
      beatChanged: false,
      beatIndex: currentBeatIndex,
      stepIndex: Math.max(0, Math.trunc(Number(ensureSwarmDirector().getSnapshot()?.stepIndex) || 0)),
      spawnerActiveCount: 0,
      spawnerTriggeredCount: 0,
      spawnerSpawnCount: 0,
      directorState: ensureSwarmDirector().getSnapshot(),
    });
    updateWeaponSubBoardSession();
    const zPause = getZoomState();
    const scalePause = Number.isFinite(zPause?.targetScale) ? zPause.targetScale : (Number.isFinite(zPause?.currentScale) ? zPause.currentScale : 1);
    const centerPause = getViewportCenterWorld();
    const outsideMainPause = arenaCenterWorld
      ? (Math.hypot(centerPause.x - arenaCenterWorld.x, centerPause.y - arenaCenterWorld.y) > SWARM_ARENA_RADIUS_WORLD)
      : false;
    updateArenaVisual(scalePause, outsideMainPause);
    updateStarfieldVisual();
    updateSpawnHealthDebugUi();
    try { spawnerRuntime?.update?.(0); } catch {}
    updatePausePreview(dt);
    rafId = requestAnimationFrame(tick);
    return;
  }
  updateArenaPath(dt);
  updateWeaponSubBoardSession();
  updateStarfieldVisual();
  enemyHealthRampSeconds = Math.max(0, Number(enemyHealthRampSeconds) || 0) + dt;
  updateEnemySpawnHealthScaling();
  updateSpawnHealthDebugUi();
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
  processPendingEnemyDeaths(now, currentBeatIndex);
  updateEnemies(dt);
  updatePickupsAndCombat(dt);
  try { spawnerRuntime?.update?.(dt); } catch {}
  maintainEnemyPopulation();
  maintainSpawnerEnemyPopulation();
  maintainDrawSnakeEnemyPopulation();
  maintainComposerEnemyGroups();
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
  if (weaponSubBoardState.open) return;
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
  perfLabRuntime.autoMoveEnabled = false;
  perfLabRuntime.autoMoveMagnitude = 0.82;
  perfLabRuntime.autoMovePhase = Math.random() * Math.PI * 2;
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
  if (!restoreState) weaponChainEventSeq = 1;
  swarmPacingRuntime.reset(0);
  swarmPaletteRuntime.reset(0);
  startMusicLabSession('enter');
  swarmSoundEventState.beatIndex = null;
  swarmSoundEventState.played = Object.create(null);
  swarmSoundEventState.maxVolume = Object.create(null);
  swarmSoundEventState.note = Object.create(null);
  swarmSoundEventState.noteList = Object.create(null);
  swarmSoundEventState.count = Object.create(null);
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
  enemyHealthRampSeconds = 0;
  updateEnemySpawnHealthScaling();
  updateSpawnHealthDebugUi();
  resetEnergyStateRuntime(0);
  resetEnergyGravityRuntime();
  resetSwarmDirector(0);
  if (!restoreState) resetArenaPathState();
  lastBeatIndex = null;
  lastWeaponTuneStepIndex = null;
  lastSpawnerEnemyStepIndex = null;
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
  if (swarmDirectorDebug.hudEnabled) ensureSwarmDirectorDebugHud();
  else removeSwarmDirectorDebugHud();
  ensureSwarmDirector().syncToBeat(currentBeatIndex);
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
  destroyWeaponSubBoards();
  active = false;
  dragPointerId = null;
  velocityX = 0;
  velocityY = 0;
  perfLabRuntime.autoMoveEnabled = false;
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
  removeSwarmDirectorDebugHud();
  clearEnemies();
  clearPickups();
  clearProjectiles();
  clearEffects();
  clearHelpers();
  clearPendingWeaponChainEvents();
  weaponChainEventSeq = 1;
  swarmPacingRuntime.reset(0);
  swarmPaletteRuntime.invalidate();
  musicLabLastPacingSignature = '';
  musicLabLastPaletteSignature = '';
  swarmSoundEventState.beatIndex = null;
  swarmSoundEventState.played = Object.create(null);
  swarmSoundEventState.maxVolume = Object.create(null);
  swarmSoundEventState.note = Object.create(null);
  swarmSoundEventState.noteList = Object.create(null);
  swarmSoundEventState.count = Object.create(null);
  lastSpawnerEnemyStepIndex = null;
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
  resetEnergyStateRuntime(0);
  resetEnergyGravityRuntime();
  ensureSwarmDirector().reset();
  setGameplayPaused(false);
  resetArenaPathState();
  if (arenaRingEl) arenaRingEl.style.opacity = '0';
  if (arenaCoreEl) arenaCoreEl.style.opacity = '0';
  if (arenaLimitEl) arenaLimitEl.style.opacity = '0';
  setResistanceVisual(false);
  setReactiveArrowVisual(false);
  equippedWeapons.clear();
  activeWeaponSlotIndex = 0;
  enemyHealthRampSeconds = 0;
  updateEnemySpawnHealthScaling();
  updateSpawnHealthDebugUi();
  lastBeatIndex = null;
  lastWeaponTuneStepIndex = null;
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
  getSubBoardPendingDrawgridState: getWeaponSubBoardPendingDrawgridState,
};

function getBeatSwarmStabilitySmokeChecks() {
  const checks = [];
  const addCheck = (id, pass, detail = '') => {
    checks.push({
      id: String(id || '').trim() || 'unknown',
      pass: !!pass,
      detail: String(detail || ''),
    });
  };
  addCheck(
    'player-projectile-family',
    getPlayerWeaponSoundEventKeyForStage('projectile', 'standard') === 'projectile',
    'projectile:standard should route to projectile family'
  );
  addCheck(
    'player-boomerang-family',
    getPlayerWeaponSoundEventKeyForStage('projectile', 'boomerang') === 'boomerang',
    'projectile:boomerang should route to boomerang family'
  );
  addCheck(
    'player-hitscan-family',
    getPlayerWeaponSoundEventKeyForStage('laser', 'hitscan') === 'hitscan',
    'laser:hitscan should route to hitscan family'
  );
  addCheck(
    'player-beam-family',
    getPlayerWeaponSoundEventKeyForStage('laser', 'beam') === 'beam',
    'laser:beam should route to beam family'
  );
  addCheck(
    'player-explosion-family',
    getPlayerWeaponSoundEventKeyForStage('aoe', 'explosion') === 'explosion',
    'aoe:explosion should remain stable explosion family'
  );
  addCheck(
    'enemy-death-families',
    resolveEnemyDeathEventKey('small', '') === 'enemyDeathSmall'
      && resolveEnemyDeathEventKey('medium', '') === 'enemyDeathMedium'
      && resolveEnemyDeathEventKey('large', '') === 'enemyDeathLarge',
    'enemy deaths should resolve to small/medium/large families'
  );
  let directorReady = false;
  try {
    const director = ensureSwarmDirector();
    directorReady = !!director && typeof director.getSnapshot === 'function';
  } catch {}
  addCheck('director-runtime-ready', directorReady, 'director snapshot API should be available');
  let pacingReady = false;
  try {
    const snapshot = swarmPacingRuntime.getSnapshot();
    pacingReady = !!snapshot && typeof snapshot.stateId === 'string' && snapshot.stateId.length > 0;
  } catch {}
  addCheck('pacing-runtime-ready', pacingReady, 'pacing snapshot should include stateId');
  return {
    pass: checks.every((c) => c.pass),
    checks,
    failed: checks.filter((c) => !c.pass).map((c) => c.id),
  };
}

try {
  window.BeatSwarmMode = Object.assign(window.BeatSwarmMode || {}, BeatSwarmMode);
} catch {}

try {
  window.__beatSwarmDebug = Object.assign(window.__beatSwarmDebug || {}, {
    getDirectorState() {
      try { return ensureSwarmDirector().getSnapshot(); } catch { return null; }
    },
    getPaletteState() {
      try { return swarmPaletteRuntime.getSnapshot(); } catch { return null; }
    },
    getPacingState() {
      try { return swarmPacingRuntime.getSnapshot(); } catch { return null; }
    },
    getComposerMotifState() {
      return {
        sectionId: String(composerRuntime.currentSectionId || 'default'),
        cycle: Math.max(0, Math.trunc(Number(composerRuntime.currentCycle) || 0)),
        motifScopeKey: getComposerMotifScopeKey(),
        motifEpochIndex: Math.max(0, Math.trunc(Number(composerRuntime.motifEpochIndex) || 0)),
        motifEpochStartBar: Math.max(0, Math.trunc(Number(composerRuntime.motifEpochStartBar) || 0)),
        motifCacheSize: Math.max(0, Math.trunc(Number(composerRuntime.motifCache?.size) || 0)),
      };
    },
    getDirectorDebugSnapshot() {
      return swarmDirectorDebug.snapshot ? { ...swarmDirectorDebug.snapshot } : null;
    },
    getEnergyGravityState() {
      return {
        ...getEnergyGravityMetrics(),
        recentKillCount: Array.isArray(energyGravityRuntime.recentKillTimes) ? energyGravityRuntime.recentKillTimes.length : 0,
      };
    },
    getDirectorStepEventLog() {
      return Array.isArray(swarmDirectorDebug.stepEventLog) ? swarmDirectorDebug.stepEventLog.slice() : [];
    },
    getWeaponDamageScaleState(slotIndex = activeWeaponSlotIndex) {
      const idx = Math.max(0, Math.min(MAX_WEAPON_SLOTS - 1, Math.trunc(Number(slotIndex) || 0)));
      const stats = getWeaponTuneActivityStats(idx);
      return {
        slotIndex: idx,
        activeNotes: Math.max(0, Math.trunc(Number(stats?.activeNotes) || 0)),
        totalNotes: Math.max(1, Math.trunc(Number(stats?.totalNotes) || WEAPON_TUNE_STEPS)),
        damageScale: getWeaponTuneDamageScale(idx),
      };
    },
    runStabilitySmokeChecks() {
      return getBeatSwarmStabilitySmokeChecks();
    },
    setDirectorHudEnabled(next = true) {
      swarmDirectorDebug.hudEnabled = !!next;
      if (swarmDirectorDebug.hudEnabled) ensureSwarmDirectorDebugHud();
      else removeSwarmDirectorDebugHud();
      return swarmDirectorDebug.hudEnabled;
    },
    setDirectorBeatLogging(next = true) {
      swarmDirectorDebug.logBeats = !!next;
      return swarmDirectorDebug.logBeats;
    },
    enableTuneShotDebug(next = true) {
      weaponTuneFireDebug.enabled = !!next;
      weaponTuneFireDebug.seq = 0;
      return weaponTuneFireDebug.enabled;
    },
    setPerfWeaponStageCount(nextCount = 2) {
      const stageTemplates = [
        { archetype: 'projectile', variant: 'standard' },
        { archetype: 'aoe', variant: 'explosion' },
        { archetype: 'laser', variant: 'hitscan' },
        { archetype: 'projectile', variant: 'split-shot' },
        { archetype: 'projectile', variant: 'homing-missile' },
      ];
      const count = Math.max(1, Math.min(stageTemplates.length, Math.trunc(Number(nextCount) || 1)));
      seedDefaultWeaponLoadout();
      weaponLoadout[0].stages = stageTemplates.slice(0, count).map((s) => ({ ...s }));
      setActiveWeaponSlot(0);
      clearRuntimeForWeaponSlot(0);
      clearHomingMissiles();
      clearPendingWeaponChainEvents();
      clearLingeringAoeZones();
      clearHelpers();
      clearProjectiles();
      clearEffects();
      renderPauseWeaponUi();
      persistBeatSwarmState();
      return count;
    },
    setPerfAutoMove(next = true, magnitude = 0.82) {
      perfLabRuntime.autoMoveEnabled = !!next;
      perfLabRuntime.autoMoveMagnitude = Math.max(0.15, Math.min(1, Number(magnitude) || 0.82));
      return {
        enabled: perfLabRuntime.autoMoveEnabled,
        magnitude: perfLabRuntime.autoMoveMagnitude,
      };
    },
    getPerfAutoMove() {
      return {
        enabled: !!perfLabRuntime.autoMoveEnabled,
        magnitude: Number(perfLabRuntime.autoMoveMagnitude) || 0.82,
      };
    },
    spawnPerfEnemyDistribution(nextCount = ENEMY_TARGET_ACTIVE_COUNT) {
      if (!active) return 0;
      const target = Math.max(1, Math.min(Math.max(1, Math.trunc(Number(ENEMY_TARGET_ACTIVE_COUNT) || 1)), Math.trunc(Number(nextCount) || 1)));
      clearPendingEnemyDeaths();
      clearEnemies();
      const w = Math.max(240, Number(window.innerWidth) || 0);
      const h = Math.max(180, Number(window.innerHeight) || 0);
      const padX = Math.max(64, Math.round(w * 0.08));
      const padY = Math.max(56, Math.round(h * 0.1));
      const cols = Math.max(1, Math.ceil(Math.sqrt(target * 1.35)));
      const rows = Math.max(1, Math.ceil(target / cols));
      const usableW = Math.max(40, w - (padX * 2));
      const usableH = Math.max(40, h - (padY * 2));
      for (let i = 0; i < target; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const jitterX = (Math.random() * 2 - 1) * Math.min(18, usableW / Math.max(6, cols * 3));
        const jitterY = (Math.random() * 2 - 1) * Math.min(16, usableH / Math.max(6, rows * 3));
        const x = padX + ((col + 0.5) / cols) * usableW + jitterX;
        const y = padY + ((row + 0.5) / rows) * usableH + jitterY;
        spawnEnemyAt(Math.max(8, Math.min(w - 8, x)), Math.max(8, Math.min(h - 8, y)));
      }
      return enemies.length;
    },
    preparePerfScenario(options = null) {
      if (!active) return false;
      const stageCount = Number(options?.stageCount);
      const autoMove = options?.autoMove;
      const autoMoveMagnitude = Number(options?.autoMoveMagnitude);
      velocityX = 0;
      velocityY = 0;
      dragPointerId = null;
      barrierPushingOut = false;
      barrierPushCharge = 0;
      releaseForcePrimed = false;
      releaseBeatLevel = 0;
      outerForceContinuousSeconds = 0;
      postReleaseAssistTimer = 0;
      // Baseline perf setup: standard weapon, natural director/spawner flow, no special enemy layout.
      this.setPerfWeaponStageCount(Number.isFinite(stageCount) ? stageCount : 1);
      clearPendingEnemyDeaths();
      clearEnemies();
      this.setPerfAutoMove(
        autoMove == null ? true : !!autoMove,
        Number.isFinite(autoMoveMagnitude) ? autoMoveMagnitude : 0.82
      );
      return {
        ok: true,
        weaponStages: Number.isFinite(stageCount) ? Math.max(1, Math.trunc(stageCount)) : 1,
        autoMove: this.getPerfAutoMove(),
      };
    },
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

try {
  window.__beatSwarmMusicLab = Object.assign(window.__beatSwarmMusicLab || {}, {
    reset(reason = 'manual') {
      startMusicLabSession(reason);
      return swarmMusicLab.getSessionSnapshot();
    },
    exportSession() {
      return swarmMusicLab.exportSession();
    },
    downloadSession(fileName = 'music-lab-results.json') {
      return swarmMusicLab.downloadSession(fileName);
    },
    getSessionSnapshot() {
      return swarmMusicLab.getSessionSnapshot();
    },
    setEnabled(next = true) {
      return swarmMusicLab.setEnabled(next);
    },
    getCleanupAssertions() {
      return {
        totalViolations: Math.max(0, Math.trunc(Number(cleanupAssertionState.totalViolations) || 0)),
        directorCleanup: Math.max(0, Math.trunc(Number(cleanupAssertionState.directorCleanup) || 0)),
        sectionChangeCleanup: Math.max(0, Math.trunc(Number(cleanupAssertionState.sectionChangeCleanup) || 0)),
        lastViolation: cleanupAssertionState.lastViolation ? { ...cleanupAssertionState.lastViolation } : null,
      };
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

