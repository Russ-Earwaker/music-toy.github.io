// Extracted constants/config from beat-swarm-mode.js to keep the mode entry file smaller.
import { buildPalette, midiToName } from '../note-helpers.js';
import { BEAT_EVENT_ROLES, BEAT_EVENT_THREAT } from './beat-events.js';

export const SWARM_MAX_SPEED = 920; // px/sec
export const SWARM_ACCEL = 2100; // px/sec^2
export const SWARM_DECEL = 2.8; // release damping
export const SWARM_TURN_WEIGHT = 0.35; // lower = heavier directional change
export const SWARM_JOYSTICK_RADIUS = 70; // px
export const SWARM_STOP_EPS = 8; // px/sec
export const WEAPON_TUNE_STEPS = 8;
export const SWARM_CAMERA_TARGET_SCALE = 0.5; // smaller = further out
export const SWARM_ARENA_RADIUS_WORLD = 1100;
export const SWARM_ARENA_RESIST_RANGE_WORLD = SWARM_ARENA_RADIUS_WORLD * 0.25; // reduced outer band by half
export const SWARM_ARENA_INWARD_ACCEL_WORLD = 380;
export const SWARM_ARENA_OUTWARD_BRAKE_WORLD = 1800;
export const SWARM_ARENA_OUTWARD_CANCEL_WORLD = 2400;
export const SWARM_ARENA_EDGE_BRAKE_WORLD = 3400;
export const SWARM_ARENA_OUTER_SOFT_BUFFER_WORLD = 120;
export const SWARM_ARENA_RUBBER_K_WORLD = 7.5;
export const SWARM_ARENA_RUBBER_DAMP_LINEAR = 2.1;
export const SWARM_ARENA_RUBBER_DAMP_QUAD = 0.0028;
export const SWARM_ARENA_SLINGSHOT_IMPULSE = 860;
export const SWARM_RELEASE_POST_FIRE_BORDER_SCALE = 0.2;
export const SWARM_RELEASE_POST_FIRE_DURATION = 0.55;
export const SWARM_RELEASE_BEAT_LEVEL_MAX = 3; // three pip levels
export const SWARM_RELEASE_MULTIPLIER_BASE = 2.0; // doubled default force
export const SWARM_RELEASE_MULTIPLIER_AT_MAX = 31.0; // keep level-3 feel
export const SWARM_RELEASE_POST_FIRE_SPEED_SCALE = 1.8; // extra max-speed scale per beat level during launch assist
export const SWARM_RELEASE_BOUNCE_RESTITUTION = 0.9;
export const SWARM_RELEASE_BOUNCE_MIN_SPEED = 180;
export const SWARM_ARENA_PATH_SPEED_WORLD = 22; // world units/sec
export const SWARM_ARENA_PATH_MAX_TURN_RATE_RAD = (Math.PI / 180) * 12; // smooth, no sharp turn-backs
export const SWARM_ARENA_PATH_TURN_SMOOTH = 1.8;
export const SWARM_ARENA_PATH_RETARGET_MIN = 2.6;
export const SWARM_ARENA_PATH_RETARGET_MAX = 5.8;
export const SWARM_STARFIELD_COUNT = 520;
export const SWARM_STARFIELD_PARALLAX_MIN = 0.42;
export const SWARM_STARFIELD_PARALLAX_MAX = 0.88;
export const SWARM_STARFIELD_PARALLAX_SHIFT_SCALE = 0.7;
export const BEAT_SWARM_SECTION_HEADING_COOLDOWN_MS = 14000;
export const BEAT_SWARM_SECTION_HEADING_DURATION_MS = 2000;
export const BEAT_SWARM_SECTION_HEADING_MIN_SECTION_BARS = 4;
export const SECTION_HEADING_TRANSITION_POLICY = Object.freeze({
  'default->opening_movement': true,
  'opening_movement->bassline_awakens': true,
  'bassline_awakens->counterpoint_engaged': true,
  'counterpoint_engaged->rising_tension': true,
  'rising_tension->breakdown': true,
  'breakdown->crescendo': true,
  'crescendo->final_movement': true,
  'final_movement->opening_movement': true,
});
export const BEAT_SWARM_FLAVOR_NAMING = Object.freeze({
  level: Object.freeze({
    title: 'Beat Swarm',
    subtitle: 'Rondo of Reactive Fire',
    flavorText: 'An arcade chamber-piece where every shot is a note and every wave is a variation.',
  }),
  sectionAliases: Object.freeze({
    verse: 'bassline_awakens',
    chorus: 'counterpoint_engaged',
  }),
  sectionHeadings: Object.freeze({
    default: Object.freeze([
      Object.freeze({ title: 'Opening Movement', subtitle: 'Establishing Pulse' }),
    ]),
    opening_movement: Object.freeze([
      Object.freeze({ title: 'Opening Movement', subtitle: 'Movement I: Establishing Pulse' }),
      Object.freeze({ title: 'Opening Movement', subtitle: 'Movement I: Engines in Time' }),
    ]),
    bassline_awakens: Object.freeze([
      Object.freeze({ title: 'Bassline Awakens', subtitle: 'Movement II: Pulse Pattern Locked' }),
      Object.freeze({ title: 'Bassline Awakens', subtitle: 'Movement II: Low-End Formation' }),
    ]),
    counterpoint_engaged: Object.freeze([
      Object.freeze({ title: 'Counterpoint Engaged', subtitle: 'Movement III: Combat Motifs Rising' }),
      Object.freeze({ title: 'Counterpoint Engaged', subtitle: 'Movement III: Tactical Answers' }),
    ]),
    rising_tension: Object.freeze([
      Object.freeze({ title: 'Rising Tension', subtitle: 'Movement IV: Layer Density Climbing' }),
      Object.freeze({ title: 'Rising Tension', subtitle: 'Movement IV: Pressure Vector Increasing' }),
    ]),
    breakdown: Object.freeze([
      Object.freeze({ title: 'Breakdown', subtitle: 'Movement V: Core Pulse Exposed' }),
      Object.freeze({ title: 'Breakdown', subtitle: 'Movement V: Texture Reset Window' }),
    ]),
    crescendo: Object.freeze([
      Object.freeze({ title: 'Crescendo', subtitle: 'Movement VI: Known Motifs Rebuilding' }),
      Object.freeze({ title: 'Crescendo', subtitle: 'Movement VI: Ensemble Re-entry' }),
    ]),
    final_movement: Object.freeze([
      Object.freeze({ title: 'Final Movement', subtitle: 'Movement VII: Maximum Counterpoint' }),
      Object.freeze({ title: 'Final Movement', subtitle: 'Movement VII: Last Return of the Riff' }),
    ]),
  }),
  sectionFlavorText: Object.freeze({
    default: Object.freeze([
      Object.freeze({ tag: 'overture', text: 'Set the groove, reveal the lanes, leave space for recognition.' }),
    ]),
    opening_movement: Object.freeze([
      Object.freeze({ tag: 'overture', text: 'Sparse pulse first, clarity before complexity.' }),
      Object.freeze({ tag: 'overture', text: 'Introduce the board like an ensemble tuning up.' }),
    ]),
    bassline_awakens: Object.freeze([
      Object.freeze({ tag: 'grounding', text: 'Low register identity locks in the battlefield heartbeat.' }),
      Object.freeze({ tag: 'grounding', text: 'Bass sources stay readable while upper lanes remain restrained.' }),
    ]),
    counterpoint_engaged: Object.freeze([
      Object.freeze({ tag: 'dialogue', text: 'Second role enters and answers without erasing the first.' }),
      Object.freeze({ tag: 'dialogue', text: 'Call and response should be visible in enemy behavior.' }),
    ]),
    rising_tension: Object.freeze([
      Object.freeze({ tag: 'ascent', text: 'Density climbs, but known motifs remain traceable.' }),
      Object.freeze({ tag: 'ascent', text: 'Pressure rises through layering, not random novelty spikes.' }),
    ]),
    breakdown: Object.freeze([
      Object.freeze({ tag: 'reset', text: 'Peel back the texture so player and core identities reset cleanly.' }),
      Object.freeze({ tag: 'reset', text: 'Intentional contrast: less clutter, stronger memory anchor.' }),
    ]),
    crescendo: Object.freeze([
      Object.freeze({ tag: 'rebuild', text: 'Bring back familiar layers with tightened timing and intent.' }),
      Object.freeze({ tag: 'rebuild', text: 'Reassemble known parts before the final push.' }),
    ]),
    final_movement: Object.freeze([
      Object.freeze({ tag: 'finale', text: 'Peak difficulty with preserved source-to-sound readability.' }),
      Object.freeze({ tag: 'finale', text: 'Last return of motifs at full intensity, still intelligible.' }),
    ]),
  }),
});

let active = false;
let overlayEl = null;
let exitBtn = null;
let joystickEl = null;
let joystickKnobEl = null;
let resistanceEl = null;
let reactiveArrowEl = null;
let thrustFxEl = null;
let pauseLabelEl = null;
let sectionHeadingEl = null;
let sectionHeadingTitleEl = null;
let sectionHeadingSubtitleEl = null;
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
let starfieldVisualPhase = 0;
let borderForceEnabled = true;
let gameplayPaused = false;
let activeDamageSoundStageIndex = null;
let beamSoundGateBeatIndex = -1;
export const beamSoundGateSlotKeys = new Set();
export const beamSustainStateBySlot = new Map();
export const SECTION_PRESENTATION_PROFILE_BY_ID = Object.freeze({
  default: Object.freeze({
    title: 'Opening Movement',
    subtitle: 'Establishing Pulse',
    starfield: Object.freeze({
      tint: '#000000',
      parallaxIntensity: 1,
      density: 0.72,
      twinkleRate: 0.45,
      pulseStrength: 0.18,
      entryBurst: 0.32,
    }),
  }),
  opening_movement: Object.freeze({
    title: 'Opening Movement',
    subtitle: 'Establishing Pulse',
    starfield: Object.freeze({
      tint: '#000000',
      parallaxIntensity: 1,
      density: 0.72,
      twinkleRate: 0.45,
      pulseStrength: 0.18,
      entryBurst: 0.32,
    }),
  }),
  bassline_awakens: Object.freeze({
    title: 'Bassline Awakens',
    subtitle: 'Pulse Pattern Locked',
    starfield: Object.freeze({
      tint: '#030914',
      parallaxIntensity: 1.04,
      density: 0.78,
      twinkleRate: 0.54,
      pulseStrength: 0.28,
      entryBurst: 0.42,
    }),
  }),
  counterpoint_engaged: Object.freeze({
    title: 'Counterpoint Engaged',
    subtitle: 'Combat Motifs Rising',
    starfield: Object.freeze({
      tint: '#081326',
      parallaxIntensity: 1.14,
      density: 0.9,
      twinkleRate: 0.78,
      pulseStrength: 0.42,
      entryBurst: 0.58,
    }),
  }),
  rising_tension: Object.freeze({
    title: 'Rising Tension',
    subtitle: 'Layer Density Climbing',
    starfield: Object.freeze({
      tint: '#0c1a2f',
      parallaxIntensity: 1.2,
      density: 0.94,
      twinkleRate: 0.92,
      pulseStrength: 0.5,
      entryBurst: 0.66,
    }),
  }),
  breakdown: Object.freeze({
    title: 'Breakdown',
    subtitle: 'Core Pulse Exposed',
    starfield: Object.freeze({
      tint: '#02060d',
      parallaxIntensity: 0.94,
      density: 0.58,
      twinkleRate: 0.3,
      pulseStrength: 0.16,
      entryBurst: 0.28,
    }),
  }),
  crescendo: Object.freeze({
    title: 'Crescendo',
    subtitle: 'Known Motifs Rebuilding',
    starfield: Object.freeze({
      tint: '#12233b',
      parallaxIntensity: 1.24,
      density: 0.96,
      twinkleRate: 1.02,
      pulseStrength: 0.56,
      entryBurst: 0.72,
    }),
  }),
  final_movement: Object.freeze({
    title: 'Final Movement',
    subtitle: 'Maximum Counterpoint',
    starfield: Object.freeze({
      tint: '#182f4c',
      parallaxIntensity: 1.34,
      density: 1,
      twinkleRate: 1.14,
      pulseStrength: 0.64,
      entryBurst: 0.84,
    }),
  }),
  // Legacy aliases for older section ids.
  verse: Object.freeze({
    title: 'Bassline Awakens',
    subtitle: 'Pulse Pattern Locked',
    starfield: Object.freeze({
      tint: '#030914',
      parallaxIntensity: 1.04,
      density: 0.78,
      twinkleRate: 0.54,
      pulseStrength: 0.28,
      entryBurst: 0.42,
    }),
  }),
  chorus: Object.freeze({
    title: 'Counterpoint Engaged',
    subtitle: 'Combat Motifs Rising',
    starfield: Object.freeze({
      tint: '#081326',
      parallaxIntensity: 1.14,
      density: 0.9,
      twinkleRate: 0.78,
      pulseStrength: 0.42,
      entryBurst: 0.58,
    }),
  }),
});


export const ENEMY_CAP = 120;
export const ENEMY_ACCEL = 680;
export const ENEMY_MAX_SPEED = 260;
export const ENEMY_HIT_RADIUS = 20;
export const ENEMY_SPAWN_START_SCALE = 0.2;
export const ENEMY_SPAWN_DURATION = 0.58;
export const ENEMY_TARGET_ACTIVE_COUNT = 24;
export const ENEMY_MANAGER_MAX_FALLBACK_PER_TICK = 2;
export const ENEMY_FALLBACK_SPAWN_MARGIN_PX = 42;
export const SPAWNER_ENEMY_ENABLED = true;
export const SPAWNER_ENEMY_TARGET_COUNT = 1; // test mode
export const SPAWNER_ENEMY_HEALTH_MULTIPLIER = 18;
export const SPAWNER_ENEMY_TRIGGER_SOUND_VOLUME = 0.42;
export const SPAWNER_ENEMY_GRID_WORLD_OFFSET = 86;
export const SPAWNER_ENEMY_SPEED_MULTIPLIER = 0.5;
export const SPAWNER_ENEMY_BURST_MIN_PX = 48;
export const SPAWNER_ENEMY_BURST_MAX_PX = 180;
export const SPAWNER_ENEMY_PROJECTILE_HIT_RADIUS_PX = 86;
export const SPAWNER_SCHEDULING_ROTATION_BARS = 1;
export const SPAWNER_LINKED_ATTACK_SPEED = 760;
export const DRAW_SNAKE_ENEMY_ENABLED = true;
export const DRAW_SNAKE_ENEMY_TARGET_COUNT = 1;
export const DRAW_SNAKE_ENEMY_HEALTH_MULTIPLIER = SPAWNER_ENEMY_HEALTH_MULTIPLIER;
export const DRAW_SNAKE_SEGMENT_COUNT = 12;
export const DRAW_SNAKE_SEGMENT_SPACING_WORLD = 176;
export const DRAW_SNAKE_TRIGGER_SOUND_VOLUME = 0.45;
export const PLAYER_MASK_DUCK_ENEMY_VOLUME_MULT = 0.36;
export const PLAYER_MASK_DUCK_KEEP_CHANCE_BY_CHANNEL = Object.freeze({
  spawner: 0.52,
  drawsnake: 0.5,
  composer: 0.48,
  default: 0.44,
});
export const PLAYER_MASK_STEP_EVENT_KEEP_CHANCE = Object.freeze({
  'spawner-spawn': 0.54,
  'drawsnake-projectile': 0.36,
  'composer-group-projectile': 0.32,
  'composer-group-explosion': 0.22,
  default: 0.18,
});
export const PLAYER_MASK_MAX_ENEMY_EVENTS_PER_STEP = 3;
export const MUSIC_LAYER_POLICY = Object.freeze({
  foundationMinBars: 6,
  foundationMinCycles: 3,
  foundationProminenceFloor: 'quiet',
  foundationResetAllowed: false,
  bassMinLoopCycles: 2,
  foundationForceFullEveryBars: 1,
  foundationMaxConsecutiveQuietEvents: 2,
  sparkleMaxDensity: 1,
  sparkleMaxDensityPerBar: 2,
  sparkleCannotOverrideLoops: true,
  sparkleCannotOverrideFoundation: true,
  foregroundVoiceLimit: 2,
  foregroundIdentityLimit: 3,
  primaryLoopIdentityLimit: 1,
  secondaryLoopIdentityLimit: 1,
  supportTraceGain: 0.58,
  supportQuietGain: 0.92,
});
export const LOOP_ADMISSION_POLICY = Object.freeze({
  loopLengthSteps: WEAPON_TUNE_STEPS,
  loopRegistrationCycles: 2,
  minLayerSpacingBars: 4,
  minBarsSinceMajorIdentity: 2,
  phraseBoundaryFallbackSteps: 4,
  minCompletedLoopsBeforeNextByPacingState: Object.freeze({
    intro_solo: 1,
    intro_bass: 2,
    intro_response: 2,
    main_low: 2,
    main_mid: 2,
    peak: 2,
    break: 1,
  }),
});
export const REGISTRATION_GATE_POLICY = Object.freeze({
  minBarsBetweenMajorIdentityByPacingState: Object.freeze({
    intro_solo: 1,
    intro_bass: 2,
    intro_response: 2,
    main_low: 4,
    main_mid: 4,
    peak: 2,
    break: 1,
  }),
  minLoopCompletionsBetweenMajorIdentityByPacingState: Object.freeze({
    intro_solo: 1,
    intro_bass: 2,
    intro_response: 2,
    main_low: 2,
    main_mid: 2,
    peak: 2,
    break: 1,
  }),
  maxForegroundIdentitiesByPacingState: Object.freeze({
    intro_solo: 1,
    intro_bass: 1,
    intro_response: 1,
    main_low: 1,
    main_mid: 2,
    peak: 2,
    break: 1,
  }),
});
export const FOUNDATION_LANE_PHRASE_LIBRARY = Object.freeze([
  Object.freeze({ id: 'foundation_arcade_a', family: 'arcade_downbeat', steps: Object.freeze([true, false, false, true, false, true, false, false]) }),
  Object.freeze({ id: 'foundation_arcade_b', family: 'arcade_downbeat', steps: Object.freeze([true, false, false, false, true, false, true, false]) }),
  Object.freeze({ id: 'foundation_arcade_c', family: 'arcade_hook', steps: Object.freeze([true, false, true, false, false, true, false, false]) }),
  Object.freeze({ id: 'foundation_arcade_d', family: 'arcade_hook', steps: Object.freeze([true, false, false, true, false, false, false, true]) }),
  Object.freeze({ id: 'foundation_arcade_e', family: 'arcade_sparse', steps: Object.freeze([true, false, false, false, false, true, false, true]) }),
  Object.freeze({ id: 'foundation_arcade_f', family: 'arcade_sparse', steps: Object.freeze([true, false, true, false, false, false, false, true]) }),
  Object.freeze({ id: 'foundation_arcade_g', family: 'arcade_response', steps: Object.freeze([true, false, false, true, false, false, true, false]) }),
  Object.freeze({ id: 'foundation_arcade_h', family: 'arcade_response', steps: Object.freeze([true, false, false, false, true, false, false, true]) }),
  Object.freeze({ id: 'foundation_arcade_i', family: 'arcade_offbeat', steps: Object.freeze([true, false, false, true, false, false, true, true]) }),
  Object.freeze({ id: 'foundation_arcade_j', family: 'arcade_offbeat', steps: Object.freeze([true, false, true, false, false, true, false, true]) }),
]);
export const ROLE_COLOR_HUE_BY_LANE = Object.freeze({
  bass: 22,
  lead: 196,
  accent: 338,
  motion: 138,
});
export const MUSIC_ROLE_PULSE_POLICY = Object.freeze({
  seconds: 0.24,
  softScale: 0.08,
  strongScale: 0.16,
});
export const ONBOARDING_PHASE_FLOW = Object.freeze([
  Object.freeze({
    id: 'opening',
    bars: 3,
    allowLayers: Object.freeze({ foundation: true, loops: false, sparkle: false }),
    maxForeground: 1,
    maxNewIdentitiesRecent: 1,
    noveltyWindowBars: 6,
    allowNewEnemyTypes: Object.freeze(['spawner']),
  }),
  Object.freeze({
    id: 'bassline_awakens',
    bars: 8,
    allowLayers: Object.freeze({ foundation: true, loops: true, sparkle: false }),
    maxForeground: 1,
    maxNewIdentitiesRecent: 1,
    noveltyWindowBars: 10,
    allowNewEnemyTypes: Object.freeze(['composer-group-member', 'spawner']),
  }),
  Object.freeze({
    id: 'counterpoint_engaged',
    bars: 10,
    allowLayers: Object.freeze({ foundation: true, loops: true, sparkle: true }),
    maxForeground: 2,
    maxNewIdentitiesRecent: 1,
    noveltyWindowBars: 10,
    allowNewEnemyTypes: Object.freeze(['spawner', 'drawsnake', 'composer-group-member']),
  }),
  Object.freeze({
    id: 'rising_tension',
    bars: 9999,
    allowLayers: Object.freeze({ foundation: true, loops: true, sparkle: true }),
    maxForeground: 3,
    maxNewIdentitiesRecent: 2,
    noveltyWindowBars: 10,
    allowNewEnemyTypes: Object.freeze(['spawner', 'drawsnake', 'composer-group-member', 'dumb', 'unknown']),
  }),
]);
export const DRAW_SNAKE_PROJECTILE_SPEED = 760;
export const DRAW_SNAKE_PROJECTILE_DAMAGE = 1.25;
export const RETIRING_RETREAT_DELAY_SEC = 10;
export const DRAW_SNAKE_LINE_WIDTH_PX_FALLBACK = 6;
export const DRAW_SNAKE_VISUAL_SCALE = 4;
export const DRAW_SNAKE_WIND_ACCEL = 420;
export const DRAW_SNAKE_WIND_FREQ_HZ = 0.65;
export const DRAW_SNAKE_SCREEN_MARGIN_PX = 180;
export const DRAW_SNAKE_EDGE_PULL_RATE = 8;
export const DRAW_SNAKE_NODE_SIZE_SCALE = 0.75;
export const DRAW_SNAKE_TURN_INTERVAL_MIN = 1.1;
export const DRAW_SNAKE_TURN_INTERVAL_MAX = 2.8;
export const DRAW_SNAKE_TURN_RATE_MIN = 0.32;
export const DRAW_SNAKE_TURN_RATE_MAX = 1.1;
export const DRAW_SNAKE_ARENA_BIAS_RADIUS_SCALE = 0.82;
export const DRAW_SNAKE_ARENA_BIAS_STRENGTH = 0.18;
export const COMPOSER_ENABLED = true;
export const BEAT_SWARM_STYLE_ID = 'retro_shooter';
export const COMPOSER_BEATS_PER_BAR = 4;
export const COMPOSER_SECTIONS = Object.freeze([
  Object.freeze({ id: 'opening_movement', bars: 8, directive: Object.freeze({ drumLoops: 1, drawSnakes: 0, intensity: 0.5 }) }),
  Object.freeze({ id: 'bassline_awakens', bars: 8, directive: Object.freeze({ drumLoops: 1, drawSnakes: 1, intensity: 0.62 }) }),
  Object.freeze({ id: 'counterpoint_engaged', bars: 10, directive: Object.freeze({ drumLoops: 2, drawSnakes: 1, intensity: 0.8 }) }),
  Object.freeze({ id: 'rising_tension', bars: 10, directive: Object.freeze({ drumLoops: 2, drawSnakes: 2, intensity: 0.96 }) }),
  Object.freeze({ id: 'breakdown', bars: 6, directive: Object.freeze({ drumLoops: 1, drawSnakes: 0, intensity: 0.58 }) }),
  Object.freeze({ id: 'crescendo', bars: 8, directive: Object.freeze({ drumLoops: 2, drawSnakes: 2, intensity: 1.02 }) }),
  Object.freeze({ id: 'final_movement', bars: 10, directive: Object.freeze({ drumLoops: 3, drawSnakes: 2, intensity: 1.08 }) }),
]);
export const COMPOSER_GROUPS_ENABLED = true;
export const COMPOSER_GROUP_SIZE_MIN = 4;
export const COMPOSER_GROUP_SIZE_MAX = 7;
export const COMPOSER_GROUP_NOTES_MIN = 3;
export const COMPOSER_GROUP_NOTES_MAX = 5;
export const COMPOSER_GROUP_ACTIONS = Object.freeze(['projectile', 'explosion']);
export const COMPOSER_GROUP_PERFORMERS_MIN = 1;
export const COMPOSER_GROUP_PERFORMERS_MAX = 2;
export const COMPOSER_GROUP_PROJECTILE_SPEED = 760;
export const COMPOSER_GROUP_EXPLOSION_RADIUS_WORLD = 115;
export const COMPOSER_GROUP_EXPLOSION_TTL = 0.18;
export const LOW_THREAT_BURST_RADIUS_WORLD = 72;
export const LOW_THREAT_BURST_TTL = 0.14;
export const COMPOSER_GROUP_ACTION_PULSE_SECONDS = 0.24;
export const COMPOSER_GROUP_ACTION_PULSE_SCALE = 0.28;
export const COMPOSER_GROUP_LOOP_HITS_MIN = 2;
export const COMPOSER_GROUP_LOOP_HITS_MAX = 3;
export const COMPOSER_GROUP_SEPARATION_RADIUS_WORLD = 240;
export const COMPOSER_GROUP_SEPARATION_FORCE = 760;
export const COMPOSER_GROUP_COLORS = Object.freeze(['#ff7a45', '#57d8ff', '#a3ff5f', '#ff5f9f', '#8a7dff']);
export const COMPOSER_GROUP_SHAPES = Object.freeze(['circle', 'square', 'diamond']);
export const COMPOSER_GROUP_TEMPLATE_LIBRARY = Object.freeze([
  Object.freeze({
    id: 'bass_spawner_group',
    role: BEAT_EVENT_ROLES.BASS,
    size: 1,
    performers: 1,
    actionType: 'projectile',
    threatLevel: BEAT_EVENT_THREAT.LIGHT,
    callResponseLane: 'call',
    notes: Object.freeze(['C3']),
    motif: Object.freeze({
      id: 'bass_syncopated',
      steps: Object.freeze([1, 0, 0, 1, 0, 1, 0, 0]),
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
export const DIRECTOR_ENERGY_STATE_SEQUENCE = Object.freeze([
  Object.freeze({ state: 'intro', bars: 4 }),
  Object.freeze({ state: 'build', bars: 6 }),
  Object.freeze({ state: 'clash', bars: 8 }),
  Object.freeze({ state: 'break', bars: 4 }),
  Object.freeze({ state: 'build', bars: 6 }),
  Object.freeze({ state: 'clash', bars: 8 }),
  Object.freeze({ state: 'peak', bars: 4 }),
  Object.freeze({ state: 'break', bars: 4 }),
]);
export const DIRECTOR_ENERGY_STATE_CONFIG = Object.freeze({
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
export const DIRECTOR_ENERGY_STATE_ALIAS = Object.freeze({
  build_up: 'build',
  mini_break: 'break',
  boss_phase: 'peak',
  swarm_chaos: 'clash',
});
export const DIRECTOR_STATE_THEME_CONFIG = Object.freeze({
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
export const DIRECTOR_CALL_RESPONSE_STATE_CONFIG = Object.freeze({
  intro: Object.freeze({ enabled: false, stepsPerPhrase: 4 }),
  build: Object.freeze({ enabled: true, stepsPerPhrase: 4 }),
  clash: Object.freeze({ enabled: true, stepsPerPhrase: 2 }),
  break: Object.freeze({ enabled: false, stepsPerPhrase: 4 }),
  peak: Object.freeze({ enabled: true, stepsPerPhrase: 2 }),
});
export const DIRECTOR_CALL_RESPONSE_PACING_CONFIG = Object.freeze({
  intro_solo: Object.freeze({ enabled: false, stepsPerPhrase: 8 }),
  intro_bass: Object.freeze({ enabled: false, stepsPerPhrase: 8 }),
  intro_response: Object.freeze({ enabled: true, stepsPerPhrase: 4 }),
  main_low: Object.freeze({ enabled: true, stepsPerPhrase: 4 }),
  main_mid: Object.freeze({ enabled: true, stepsPerPhrase: 3 }),
  peak: Object.freeze({ enabled: true, stepsPerPhrase: 2 }),
  break: Object.freeze({ enabled: false, stepsPerPhrase: 6 }),
});
export const PACING_ARRANGEMENT_INTENSITY_MULT = Object.freeze({
  intro_solo: 0.52,
  intro_bass: 0.66,
  intro_response: 0.78,
  main_low: 0.9,
  main_mid: 1,
  peak: 1.1,
  break: 0.72,
});
export const ENERGY_GRAVITY_CONFIG = Object.freeze({
  smoothSeconds: 2.2,
  killWindowSeconds: 9,
  killsPerSecondTarget: 0.48,
  enemyPressureRadiusWorld: 520,
  projectilePressureRadiusWorld: 460,
  transitionDownThreshold: -0.55,
  transitionUpThreshold: 0.55,
  nudgeThreshold: 0.35,
});
export const SECTION_PACING_POLICY = Object.freeze({
  sectionMinBars: 8,
  sectionChangeRequiresStableFoundation: true,
});
export const COMPOSER_MOTIF_EPOCH_BARS = 24;
export const COMPOSER_MOTIF_LOCK_BARS = 8;
export const THEME_PERSISTENCE_POLICY = Object.freeze({
  themeMinCycles: 2,
  themeReturnBias: 'high',
});
export const DRAW_SNAKE_NODE_PULSE_SECONDS = 0.22;
export const DRAW_SNAKE_NODE_PULSE_SCALE = 0.72;
export const composerRuntime = {
  enabled: COMPOSER_ENABLED,
  lastSectionKey: '',
  lastSectionChangeBar: -1,
  lastDeferredSectionKey: '',
  lastDeferredSectionBar: -1,
  lastSectionGameplayState: null,
  currentSectionId: '',
  currentCycle: 0,
  currentDirective: { drumLoops: SPAWNER_ENEMY_TARGET_COUNT, drawSnakes: DRAW_SNAKE_ENEMY_TARGET_COUNT, intensity: 1 },
  motifEpochIndex: 0,
  motifEpochStartBar: 0,
  motifCache: new Map(),
  motifThemeState: new Map(),
};
export const callResponseRuntime = {
  lastCallStepAbs: -1,
  lastCallGroupId: 0,
  lastCallNote: '',
  lastResponseStepAbs: -1,
  lastResponseGroupId: 0,
};
export const energyStateRuntime = {
  sequenceIndex: 0,
  stateStartBar: 0,
  state: 'intro',
  cycle: 0,
  lastAppliedBar: -1,
};
export const energyGravityRuntime = {
  pressure: 0,
  success: 0,
  gravity: 0,
  desired: 0,
  recentKillTimes: [],
};
export const musicLayerRuntime = {
  foundationAnchorBar: -1,
  foundationAnchorSectionId: '',
  lastFoundationBar: -1,
  foundationAnchorStep: -1,
  foundationIdentityKey: '',
  foundationIdentityStartStep: -1,
  foundationLaneId: 'foundation_lane',
  foundationPhraseId: '',
  foundationPhraseSteps: [],
  foundationPhraseLockedUntilBar: -1,
  foundationPhraseStartBar: -1,
  foundationPatternChangeCount: 0,
  lastFoundationStep: -1,
  foundationLastFullBar: -1,
  foundationLastFullStep: -1,
  foundationConsecutiveQuietEvents: 0,
  sparkleBarIndex: -1,
  sparkleEventsInBar: 0,
};
export const musicLaneRuntime = {
  foundationLane: {
    laneId: 'foundation_lane',
    layer: 'foundation',
    role: 'bass',
    phraseId: '',
    phraseFamily: '',
    patternKey: '',
    instrumentId: '',
    colourId: '',
    continuityId: '',
    lifetimeBars: 0,
    performerEnemyId: 0,
    performerGroupId: 0,
    performerType: '',
    handoffPolicy: 'preserve_phrase',
    activeSinceBar: -1,
    lastAssignedBar: -1,
  },
  primaryLoopLane: {
    laneId: 'primary_loop_lane',
    layer: 'loops',
    role: 'lead',
    phraseId: '',
    phraseFamily: '',
    patternKey: '',
    instrumentId: '',
    colourId: '',
    continuityId: '',
    lifetimeBars: 0,
    performerEnemyId: 0,
    performerGroupId: 0,
    performerType: '',
    handoffPolicy: 'inherit_identity',
    activeSinceBar: -1,
    lastAssignedBar: -1,
  },
  secondaryLoopLane: {
    laneId: 'secondary_loop_lane',
    layer: 'loops',
    role: 'accent',
    phraseId: '',
    phraseFamily: '',
    patternKey: '',
    instrumentId: '',
    colourId: '',
    continuityId: '',
    lifetimeBars: 0,
    performerEnemyId: 0,
    performerGroupId: 0,
    performerType: '',
    handoffPolicy: 'inherit_identity',
    activeSinceBar: -1,
    lastAssignedBar: -1,
  },
  sparkleLane: {
    laneId: 'sparkle_lane',
    layer: 'sparkle',
    role: 'accent',
    phraseId: '',
    phraseFamily: '',
    patternKey: '',
    instrumentId: '',
    colourId: '',
    continuityId: '',
    lifetimeBars: 0,
    performerEnemyId: 0,
    performerGroupId: 0,
    performerType: '',
    handoffPolicy: 'ephemeral_support',
    activeSinceBar: -1,
    lastAssignedBar: -1,
  },
};
export const bassFoundationOwnerRuntime = {
  active: false,
  enemyId: 0,
  groupId: 0,
  continuityId: '',
  loopIdentity: '',
  assignedAtBeat: -1,
  transferCount: 0,
};
export const bassKeepaliveRuntime = {
  lastNaturalBassStep: -1000000,
  lastInjectedBassStep: -1000000,
};
export const loopAdmissionRuntime = {
  identityFirstForegroundStep: new Map(),
  currentForegroundIdentityKey: '',
  currentForegroundIdentityStartStep: -1,
  currentForegroundIdentityLayer: '',
  lastMajorIdentityIntroStep: -1,
};
export const musicIdentityVisualRuntime = {
  colorByContinuityId: new Map(),
  colorByInstrumentId: new Map(),
};
export const onboardingRuntime = {
  identityFirstHeardBar: new Map(),
  lastPhaseId: '',
};
export const sectionPresentationRuntime = {
  visibleUntilMs: 0,
  lastShownMs: 0,
  lastSectionKey: '',
  currentTitle: '',
  currentSubtitle: '',
};
export const starfieldSectionRuntime = {
  tint: '#000000',
  parallaxIntensity: 1,
  density: 0.72,
  twinkleRate: 0.45,
  pulseStrength: 0.2,
  entryBurstStrength: 0.3,
  entryBurstT: 0,
  entryBurstDur: 0.9,
};
export const readabilityMetricsRuntime = {
  barIndex: -1,
  steps: 0,
  playerLikelyAudibleSteps: 0,
  playerStepEmittedSteps: 0,
  enemyEvents: 0,
  enemyForegroundEvents: 0,
  enemyCompetingDuringPlayer: 0,
  sameRegisterOverlapDuringPlayer: 0,
  layerTotals: {
    foundation: { full: 0, quiet: 0, trace: 0, suppressed: 0 },
    loops: { full: 0, quiet: 0, trace: 0, suppressed: 0 },
    sparkle: { full: 0, quiet: 0, trace: 0, suppressed: 0 },
  },
  onboardingPhase: '',
};

export const LOOPGRID_FALLBACK_NOTE_PALETTE = Object.freeze(buildPalette(48, Array.from({ length: 12 }, (_, i) => i), 3));
export const SPAWNER_ENEMY_GRID_STEP_TO_CELL = Object.freeze([
  Object.freeze({ c: 0, r: 0 }), // 1
  Object.freeze({ c: 1, r: 0 }), // 2
  Object.freeze({ c: 2, r: 0 }), // 3
  Object.freeze({ c: 2, r: 1 }), // 4
  Object.freeze({ c: 2, r: 2 }), // 5
  Object.freeze({ c: 1, r: 2 }), // 6
  Object.freeze({ c: 0, r: 2 }), // 7
  Object.freeze({ c: 0, r: 1 }), // 8
]);
export const BEAM_SOURCE_DEATH_GRACE_SECONDS = 0.5;
export const ENEMY_DEATH_POP_FALLBACK_SECONDS = 0.65;
export const ENEMY_HEALTH_RAMP_PER_SECOND = 0.1;
export const PICKUP_COLLECT_RADIUS_PX = 46;
export const PROJECTILE_SPEED = 1100;
export const PROJECTILE_HIT_RADIUS_PX = 24;
export const PROJECTILE_LIFETIME = 1.9;
export const PROJECTILE_SPLIT_ANGLE_RAD = Math.PI / 7.2; // 25 deg
export const PROJECTILE_BOOMERANG_RADIUS_WORLD = 480;
export const PROJECTILE_BOOMERANG_LOOP_SECONDS = 1.15;
export const PROJECTILE_BOOMERANG_SPIN_MULT = 2.4;
export const PROJECTILE_HOMING_ACQUIRE_RANGE_WORLD = 920;
export const PROJECTILE_HOMING_SPEED = 900;
export const PROJECTILE_HOMING_TURN_RATE = 5.8;
export const PROJECTILE_HOMING_ORBIT_RADIUS_WORLD = 170;
export const PROJECTILE_HOMING_ORBIT_ANG_VEL = 2.4;
export const PROJECTILE_HOMING_ORBIT_CHASE_SPEED = 420;
export const PROJECTILE_HOMING_ORBIT_TURN_RATE = 4.2;
export const PROJECTILE_HOMING_MAX_ORBITING = 8;
export const PROJECTILE_HOMING_RETURN_SNAP_DIST_WORLD = 34;
export const PROJECTILE_DESPAWN_OFFSCREEN_PAD_PX = 72;
export const PROJECTILE_COLLISION_GRACE_SECONDS = 0.06;
export const PROJECTILE_CHAIN_SPAWN_OFFSET_WORLD = 26;
export const HELPER_LIFETIME_BEATS = 8;
export const HELPER_ORBIT_RADIUS_WORLD = 150;
export const HELPER_ORBIT_ANG_VEL = 1.9;
export const HELPER_IMPACT_RADIUS_PX = 24;
export const HELPER_IMPACT_DAMAGE = 1.25;
export const HELPER_TURRET_SPAWN_OFFSET_WORLD = 78;
export const LASER_TTL = 0.12;
export const EXPLOSION_TTL = 0.22;
export const EXPLOSION_RADIUS_WORLD = 220;
export const EXPLOSION_PRIME_MAX_SCALE = 0.5;
export const BEAM_DAMAGE_PER_SECOND = 3.2;
export const PREVIEW_PROJECTILE_SPEED = 360;
export const PREVIEW_PROJECTILE_LIFETIME = 2.1;
export const PREVIEW_PROJECTILE_HIT_RADIUS = 14;
export const PREVIEW_PROJECTILE_SPLIT_ANGLE_RAD = Math.PI / 7.2; // 25 deg
export const PREVIEW_PROJECTILE_BOOMERANG_RADIUS = 63;
export const PREVIEW_PROJECTILE_BOOMERANG_LOOP_SECONDS = 1.15;
export const PREVIEW_PROJECTILE_HOMING_ACQUIRE_RANGE = 160;
export const PREVIEW_PROJECTILE_HOMING_SPEED = 280;
export const PREVIEW_PROJECTILE_HOMING_TURN_RATE = 5.2;
export const PREVIEW_PROJECTILE_HOMING_ORBIT_RADIUS = 38;
export const PREVIEW_PROJECTILE_HOMING_ORBIT_ANG_VEL = 2.8;
export const PREVIEW_PROJECTILE_HOMING_ORBIT_CHASE_SPEED = 150;
export const PREVIEW_PROJECTILE_HOMING_ORBIT_TURN_RATE = 4.2;
export const PREVIEW_PROJECTILE_HOMING_MAX_ORBITING = 8;
export const PREVIEW_PROJECTILE_HOMING_RETURN_SNAP_DIST = 10;
export const PREVIEW_PROJECTILE_CHAIN_SPAWN_OFFSET = 20;
export const PREVIEW_HELPER_LIFETIME_BEATS = 8;
export const PREVIEW_HELPER_ORBIT_RADIUS = 34;
export const PREVIEW_HELPER_ORBIT_ANG_VEL = 2.3;
export const PREVIEW_HELPER_IMPACT_RADIUS = 12;
export const PREVIEW_HELPER_IMPACT_DAMAGE = 1.1;
export const PREVIEW_HELPER_TURRET_SPAWN_OFFSET = 18;
export const PREVIEW_LASER_TTL = 0.16;
export const PREVIEW_EXPLOSION_TTL = 0.24;
export const PREVIEW_EXPLOSION_RADIUS = 52;
export const PREVIEW_BEAM_DAMAGE_PER_SECOND = 3.2;
export const PREVIEW_ENEMY_COUNT = 7;
export const PREVIEW_ENEMY_HP = 4;
export const PREVIEW_BEAT_LEN_FALLBACK = 0.5;
export const SWARM_PENTATONIC_NOTES_ONE_OCTAVE = Object.freeze(['C4', 'D#4', 'F4', 'G4', 'A#4']);
export const SWARM_SOURCE_MUSIC_IDENTITY_BY_TYPE = Object.freeze({
  dumb: Object.freeze({
    role: BEAT_EVENT_ROLES.ACCENT,
    register: 'mid',
    instrumentFamily: 'projectile',
    defaultProminence: 'quiet',
    onboardingPriority: 0.45,
    layer: 'sparkle',
    preferredActionType: 'enemy-accent',
  }),
  spawner: Object.freeze({
    role: BEAT_EVENT_ROLES.BASS,
    register: 'low',
    instrumentFamily: 'projectile',
    defaultProminence: 'full',
    onboardingPriority: 0.9,
    layer: 'foundation',
    preferredActionType: 'spawner-spawn',
  }),
  drawsnake: Object.freeze({
    role: BEAT_EVENT_ROLES.LEAD,
    register: 'mid_high',
    instrumentFamily: 'projectile',
    defaultProminence: 'quiet',
    onboardingPriority: 0.76,
    layer: 'loops',
    preferredActionType: 'drawsnake-projectile',
  }),
  'composer-group-member': Object.freeze({
    role: BEAT_EVENT_ROLES.LEAD,
    register: 'mid',
    instrumentFamily: 'projectile',
    defaultProminence: 'quiet',
    onboardingPriority: 0.72,
    layer: 'loops',
    preferredActionType: 'composer-group-projectile',
  }),
  default: Object.freeze({
    role: BEAT_EVENT_ROLES.ACCENT,
    register: 'mid',
    instrumentFamily: 'projectile',
    defaultProminence: 'trace',
    onboardingPriority: 0.5,
    layer: 'sparkle',
    preferredActionType: 'enemy-accent',
  }),
});

