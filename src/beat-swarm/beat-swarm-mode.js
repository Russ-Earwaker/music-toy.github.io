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
import { normalizeCallResponseLane, pickComposerGroupTemplate, } from './beat-swarm-groups.js';
import { createComposerEnemyGroupProfile as buildComposerEnemyGroupProfile, pickComposerGroupShape, pickComposerGroupColor, } from './beat-swarm-composer-groups.js';
import { maintainComposerEnemyGroupsLifecycle } from './beat-swarm-composer-lifecycle.js';
import { chooseComposerGroupEnemyForNote as pickComposerEnemyForNote, collectComposerGroupStepBeatEvents as collectComposerGroupStepEvents, } from './beat-swarm-composer-events.js';
import { collectDrawSnakeStepBeatEvents as collectDrawSnakeStepEvents, collectSpawnerStepBeatEvents as collectSpawnerStepEvents, } from './beat-swarm-singleton-events.js';
import { spawnComposerGroupEnemyAtRuntime, spawnComposerGroupOffscreenMembersRuntime, } from './beat-swarm-composer-spawn.js';
import { createBeatSwarmInstrumentLaneTools } from './beat-swarm-instrument-lanes.js';
import { getBeatSwarmStyleProfile } from './beat-swarm-style-profile.js';
import { executePerformedBeatEventRuntime } from './beat-swarm-event-execution.js';
import { processBeatSwarmStepEventsRuntime } from './beat-swarm-step-events.js';
import { keepDrawSnakeEnemyOnscreenRuntime, updateBeatSwarmEnemiesRuntime } from './beat-swarm-enemy-update.js';
import { updateBeatSwarmPickupsAndCombatRuntime } from './beat-swarm-pickups-combat.js';
import { createBeatSwarmPlayerInstrumentRuntime } from './beat-swarm-player-instrument.js';
import { applyArenaBoundaryResistanceRuntime, applyLaunchInnerCircleBounceRuntime, enforceArenaOuterLimitRuntime, } from './beat-swarm-arena-boundary.js';
import { getOutwardOnlyInputRuntime, getShipFacingFromReleaseAimRuntime, shouldSuppressSteeringForReleaseRuntime, } from './beat-swarm-release-input.js';
import { classifyEnemyDeathFamily, normalizeEnemyDeathFamily, normalizeInstrumentIdToken, normalizeSwarmNoteName, transposeSwarmNoteName, } from './beat-swarm-music-utils.js';
import { createBeatSwarmWeaponTuneTools } from './beat-swarm-weapon-tune.js';
import { WEAPON_ARCHETYPES, WEAPON_COMPONENTS } from './beat-swarm-weapon-defs.js';
import { createBeatSwarmSoundRoutingTools } from './beat-swarm-sound-routing.js';
import { PLAYER_WEAPON_SOUND_EVENT_KEYS, SWARM_ENEMY_DEATH_EVENT_KEY_BY_FAMILY, SWARM_SOUND_EVENTS, } from './beat-swarm-sound-defs.js';
import { applyPausePreviewLingeringAoeBeatRuntime, firePausePreviewWeaponsOnBeatRuntime, processPausePreviewPendingChainsRuntime, updatePausePreviewProjectilesAndEffectsRuntime, } from './beat-swarm-pause-preview-update.js';
import { addPausePreviewBeamRuntime, addPausePreviewExplosionRuntime, addPausePreviewLaserRuntime, applyPausePreviewAoeAtRuntime, countPausePreviewOrbitingHomingMissilesRuntime, queuePausePreviewChainRuntime, spawnPausePreviewBoomerangProjectileRuntime, spawnPausePreviewHomingMissileRuntime, spawnPausePreviewProjectileFromDirectionRuntime, spawnPausePreviewProjectileRuntime, triggerPausePreviewWeaponStageRuntime, } from './beat-swarm-pause-preview-spawn.js';
import { damagePausePreviewEnemyRuntime, ensurePausePreviewExplosionBiasEnemyRuntime, ensurePausePreviewStateRuntime, getPausePreviewBeatLenRuntime, getPausePreviewNearestEnemiesRuntime, nudgePausePreviewEnemiesIntoActionRuntime, previewSelectionContainsBoomerangRuntime, previewSelectionStartsWithExplosionRuntime, removePausePreviewEnemyRuntime, resetPausePreviewStateRuntime, spawnPausePreviewEnemyRuntime, } from './beat-swarm-pause-preview-state.js';
import { createPausePreviewHelperVisualsRuntime, firePausePreviewHelperPayloadAtRuntime, firePausePreviewHelpersOnBeatRuntime, getPausePreviewHelperKeyRuntime, hasActivePausePreviewHelperByKeyRuntime, spawnPausePreviewHelperRuntime, updatePausePreviewHelpersRuntime, } from './beat-swarm-pause-preview-helpers.js';
import { createComponentMiniNodeRuntime, fireComponentLivePreviewRuntime, renderComponentPreviewMarkupRuntime, updateComponentLivePreviewStateRuntime, } from './beat-swarm-component-preview-runtime.js';
import { getArchetypeDef, getVariantDef, getWeaponComponentDefById, getWeaponComponentDefForStage, } from './beat-swarm-weapon-components.js';
import { createHelperVisualsRuntime, fireHelperPayloadAtRuntime, fireHelpersOnBeatRuntime, getEnemyByIdRuntime, getHelperKeyRuntime, hasActiveHelperByKeyRuntime, spawnHelperRuntime, updateHelpersRuntime, } from './beat-swarm-helpers-runtime.js';
import { countOrbitingHomingMissilesRuntime, getOffsetPointRuntime, getProjectileChainSpawnOffsetWorldRuntime, getShipFacingDirWorldRuntime, normalizeDirRuntime, pulseHitFlashRuntime, } from './beat-swarm-combat-utils.js';
import { beginPauseWeaponDragRuntime, clearPauseWeaponDragMarkersRuntime, clearPauseWeaponDragProxyRuntime, getPauseWeaponDropTargetAtClientRuntime, getPauseWeaponStageCellFromEventTargetRuntime, parsePauseWeaponStageCellRuntime, reorderWeaponStagesRuntime, resetPauseWeaponDragRuntime, updatePauseWeaponDragVisualRuntime, } from './beat-swarm-pause-weapon-drag.js';
import { applyAoeAtRuntime, applyLingeringAoeBeatRuntime, clearBeamEffectsForWeaponSlotRuntime, clearPendingWeaponChainsForSlotRuntime, fireConfiguredWeaponsOnBeatRuntime, processPendingWeaponChainsRuntime, queueWeaponChainRuntime, shouldPlayBeamSoundForBeatRuntime, spawnBoomerangProjectileRuntime, spawnHomingMissileRuntime, spawnProjectileFromDirectionRuntime, spawnProjectileRuntime, triggerWeaponStageRuntime, } from './beat-swarm-weapon-chain-core.js';
import { handleBeatPreludeRuntime, handleBeatStepChangeRuntime, handleBeatTailRuntime, handleTransportStoppedBeatUpdateRuntime, updateMusicLabSignaturesRuntime, } from './beat-swarm-beat-update-runtime.js';
import { configureInitialSpawnerEnablementRuntime, getEnemySpawnScaleRuntime, getRandomOffscreenSpawnPointRuntime, keepDrawSnakeEnemyOnscreenRuntimeWrapper, spawnFallbackEnemyOffscreenRuntime, } from './beat-swarm-spawn-utils.js';
import { addHostileRedExplosionEffectRuntime, getAliveEnemiesByIdsRuntime, spawnHostileRedProjectileAtRuntime, triggerCosmeticSyncAtRuntime, triggerLowThreatBurstAtRuntime, } from './beat-swarm-hostile-effects.js';
import { maintainComposerEnemyGroupsRuntime } from './beat-swarm-composer-maintenance.js';
import { updatePickupsAndCombatRuntimeWrapper } from './beat-swarm-pickups-combat-wrapper.js';
import { getReactiveReleaseImpulseRuntime, pulsePlayerShipNoteFlashRuntime, pulseReactiveArrowChargeRuntime, setJoystickCenterRuntime, setJoystickKnobRuntime, setJoystickVisibleRuntime, setReactiveArrowVisualRuntime, setResistanceVisualRuntime, setThrustFxVisualRuntime, updateArenaVisualRuntime, } from './beat-swarm-visual-controls.js';
import { getInputVectorRuntime, updateShipFacingRuntime } from './beat-swarm-input-controls.js';
import { applyArenaBoundaryResistanceRuntimeWrapper, applyLaunchInnerCircleBounceRuntimeWrapper, enforceArenaOuterLimitRuntimeWrapper, } from './beat-swarm-arena-motion-wrapper.js';
import { applyTickMovementAndArenaClampRuntimeWrapper, applyTickSteeringAndResistanceRuntimeWrapper, } from './beat-swarm-tick-motion-wrapper.js';
import { updatePausedTickFrameRuntimeWrapper } from './beat-swarm-tick-paused-wrapper.js';
import { onPointerDownRuntimeWrapper, onPointerMoveRuntimeWrapper, onPointerUpRuntimeWrapper, } from './beat-swarm-pointer-input-wrapper.js';
import { onKeyDownRuntimeWrapper, onTransportPauseRuntimeWrapper, onTransportResumeRuntimeWrapper, onWheelRuntimeWrapper, } from './beat-swarm-input-events-wrapper.js';
import { bindBeatSwarmInputRuntimeWrapper, unbindBeatSwarmInputRuntimeWrapper, } from './beat-swarm-input-binding-wrapper.js';
import { applyEnterSceneBootstrapRuntimeWrapper } from './beat-swarm-enter-wrapper.js';
import { finalizeEnterBeatSwarmRuntimeWrapper } from './beat-swarm-enter-finalize-wrapper.js';
import { applyExitBeatSwarmRuntimeWrapper } from './beat-swarm-exit-wrapper.js';
import { installBeatSwarmPersistenceRuntime } from './beat-swarm-persistence-runtime.js';
import { createBeatSwarmPerfDebugToolsRuntime, createBeatSwarmDebugApiRuntime, createBeatSwarmMusicLabApiRuntime, getBeatSwarmStabilitySmokeChecksRuntime, installBeatSwarmDebugGlobalRuntime, installBeatSwarmModeGlobalRuntime, installBeatSwarmMusicLabGlobalRuntime, } from './beat-swarm-debug-runtime.js';
import { ensurePauseWeaponUiRuntime, renderPauseWeaponUiRuntime } from './beat-swarm-pause-weapon-ui-runtime.js';
import { SWARM_MAX_SPEED, SWARM_ACCEL, SWARM_DECEL, SWARM_TURN_WEIGHT, SWARM_JOYSTICK_RADIUS, SWARM_STOP_EPS, SWARM_CAMERA_TARGET_SCALE, SWARM_ARENA_RADIUS_WORLD, SWARM_ARENA_RESIST_RANGE_WORLD, SWARM_ARENA_INWARD_ACCEL_WORLD, SWARM_ARENA_OUTWARD_BRAKE_WORLD, SWARM_ARENA_OUTWARD_CANCEL_WORLD, SWARM_ARENA_EDGE_BRAKE_WORLD, SWARM_ARENA_OUTER_SOFT_BUFFER_WORLD, SWARM_ARENA_RUBBER_K_WORLD, SWARM_ARENA_RUBBER_DAMP_LINEAR, SWARM_ARENA_RUBBER_DAMP_QUAD, SWARM_ARENA_SLINGSHOT_IMPULSE, SWARM_RELEASE_POST_FIRE_BORDER_SCALE, SWARM_RELEASE_POST_FIRE_DURATION, SWARM_RELEASE_BEAT_LEVEL_MAX, SWARM_RELEASE_MULTIPLIER_BASE, SWARM_RELEASE_MULTIPLIER_AT_MAX, SWARM_RELEASE_POST_FIRE_SPEED_SCALE, SWARM_RELEASE_BOUNCE_RESTITUTION, SWARM_RELEASE_BOUNCE_MIN_SPEED, SWARM_ARENA_PATH_SPEED_WORLD, SWARM_ARENA_PATH_MAX_TURN_RATE_RAD, SWARM_ARENA_PATH_TURN_SMOOTH, SWARM_ARENA_PATH_RETARGET_MIN, SWARM_ARENA_PATH_RETARGET_MAX, SWARM_STARFIELD_COUNT, SWARM_STARFIELD_PARALLAX_MIN, SWARM_STARFIELD_PARALLAX_MAX, SWARM_STARFIELD_PARALLAX_SHIFT_SCALE, BEAT_SWARM_SECTION_HEADING_COOLDOWN_MS, BEAT_SWARM_SECTION_HEADING_DURATION_MS, BEAT_SWARM_SECTION_HEADING_MIN_SECTION_BARS, SECTION_HEADING_TRANSITION_POLICY, BEAT_SWARM_FLAVOR_NAMING, beamSoundGateSlotKeys, beamSustainStateBySlot, SECTION_PRESENTATION_PROFILE_BY_ID, ENEMY_CAP, ENEMY_ACCEL, ENEMY_MAX_SPEED, ENEMY_HIT_RADIUS, ENEMY_SPAWN_START_SCALE, ENEMY_SPAWN_DURATION, ENEMY_TARGET_ACTIVE_COUNT, ENEMY_MANAGER_MAX_FALLBACK_PER_TICK, ENEMY_FALLBACK_SPAWN_MARGIN_PX, SPAWNER_ENEMY_ENABLED, SPAWNER_ENEMY_TARGET_COUNT, SPAWNER_ENEMY_HEALTH_MULTIPLIER, SPAWNER_ENEMY_TRIGGER_SOUND_VOLUME, SPAWNER_ENEMY_GRID_WORLD_OFFSET, SPAWNER_ENEMY_SPEED_MULTIPLIER, SPAWNER_ENEMY_BURST_MIN_PX, SPAWNER_ENEMY_BURST_MAX_PX, SPAWNER_ENEMY_PROJECTILE_HIT_RADIUS_PX, SPAWNER_SCHEDULING_ROTATION_BARS, SPAWNER_LINKED_ATTACK_SPEED, DRAW_SNAKE_ENEMY_ENABLED, DRAW_SNAKE_ENEMY_TARGET_COUNT, DRAW_SNAKE_ENEMY_HEALTH_MULTIPLIER, DRAW_SNAKE_SEGMENT_COUNT, DRAW_SNAKE_SEGMENT_SPACING_WORLD, DRAW_SNAKE_TRIGGER_SOUND_VOLUME, PLAYER_MASK_DUCK_ENEMY_VOLUME_MULT, PLAYER_MASK_DUCK_KEEP_CHANCE_BY_CHANNEL, PLAYER_MASK_STEP_EVENT_KEEP_CHANCE, PLAYER_MASK_MAX_ENEMY_EVENTS_PER_STEP, MUSIC_LAYER_POLICY, LOOP_ADMISSION_POLICY, REGISTRATION_GATE_POLICY, ROLE_COLOR_HUE_BY_LANE, MUSIC_ROLE_PULSE_POLICY, ONBOARDING_PHASE_FLOW, DRAW_SNAKE_PROJECTILE_SPEED, DRAW_SNAKE_PROJECTILE_DAMAGE, RETIRING_RETREAT_DELAY_SEC, DRAW_SNAKE_LINE_WIDTH_PX_FALLBACK, DRAW_SNAKE_VISUAL_SCALE, DRAW_SNAKE_WIND_ACCEL, DRAW_SNAKE_WIND_FREQ_HZ, DRAW_SNAKE_SCREEN_MARGIN_PX, DRAW_SNAKE_EDGE_PULL_RATE, DRAW_SNAKE_NODE_SIZE_SCALE, DRAW_SNAKE_TURN_INTERVAL_MIN, DRAW_SNAKE_TURN_INTERVAL_MAX, DRAW_SNAKE_TURN_RATE_MIN, DRAW_SNAKE_TURN_RATE_MAX, DRAW_SNAKE_ARENA_BIAS_RADIUS_SCALE, DRAW_SNAKE_ARENA_BIAS_STRENGTH, COMPOSER_ENABLED, BEAT_SWARM_STYLE_ID, COMPOSER_BEATS_PER_BAR, COMPOSER_SECTIONS, COMPOSER_GROUPS_ENABLED, COMPOSER_GROUP_SIZE_MIN, COMPOSER_GROUP_SIZE_MAX, COMPOSER_GROUP_NOTES_MIN, COMPOSER_GROUP_NOTES_MAX, COMPOSER_GROUP_ACTIONS, COMPOSER_GROUP_PERFORMERS_MIN, COMPOSER_GROUP_PERFORMERS_MAX, COMPOSER_GROUP_PROJECTILE_SPEED, COMPOSER_GROUP_EXPLOSION_RADIUS_WORLD, COMPOSER_GROUP_EXPLOSION_TTL, LOW_THREAT_BURST_RADIUS_WORLD, LOW_THREAT_BURST_TTL, COMPOSER_GROUP_ACTION_PULSE_SECONDS, COMPOSER_GROUP_ACTION_PULSE_SCALE, COMPOSER_GROUP_LOOP_HITS_MIN, COMPOSER_GROUP_LOOP_HITS_MAX, COMPOSER_GROUP_SEPARATION_RADIUS_WORLD, COMPOSER_GROUP_SEPARATION_FORCE, COMPOSER_GROUP_COLORS, COMPOSER_GROUP_SHAPES, COMPOSER_GROUP_TEMPLATE_LIBRARY, DIRECTOR_ENERGY_STATE_SEQUENCE, DIRECTOR_ENERGY_STATE_CONFIG, DIRECTOR_ENERGY_STATE_ALIAS, DIRECTOR_STATE_THEME_CONFIG, DIRECTOR_CALL_RESPONSE_STATE_CONFIG, DIRECTOR_CALL_RESPONSE_PACING_CONFIG, PACING_ARRANGEMENT_INTENSITY_MULT, ENERGY_GRAVITY_CONFIG, SECTION_PACING_POLICY, COMPOSER_MOTIF_EPOCH_BARS, COMPOSER_MOTIF_LOCK_BARS, THEME_PERSISTENCE_POLICY, DRAW_SNAKE_NODE_PULSE_SECONDS, DRAW_SNAKE_NODE_PULSE_SCALE, composerRuntime, callResponseRuntime, energyStateRuntime, energyGravityRuntime, musicLayerRuntime, musicLaneRuntime, bassFoundationOwnerRuntime, bassKeepaliveRuntime, loopAdmissionRuntime, musicIdentityVisualRuntime, onboardingRuntime, sectionPresentationRuntime, starfieldSectionRuntime, readabilityMetricsRuntime, LOOPGRID_FALLBACK_NOTE_PALETTE, SPAWNER_ENEMY_GRID_STEP_TO_CELL, BEAM_SOURCE_DEATH_GRACE_SECONDS, ENEMY_DEATH_POP_FALLBACK_SECONDS, ENEMY_HEALTH_RAMP_PER_SECOND, PICKUP_COLLECT_RADIUS_PX, PROJECTILE_SPEED, PROJECTILE_HIT_RADIUS_PX, PROJECTILE_LIFETIME, PROJECTILE_SPLIT_ANGLE_RAD, PROJECTILE_BOOMERANG_RADIUS_WORLD, PROJECTILE_BOOMERANG_LOOP_SECONDS, PROJECTILE_BOOMERANG_SPIN_MULT, PROJECTILE_HOMING_ACQUIRE_RANGE_WORLD, PROJECTILE_HOMING_SPEED, PROJECTILE_HOMING_TURN_RATE, PROJECTILE_HOMING_ORBIT_RADIUS_WORLD, PROJECTILE_HOMING_ORBIT_ANG_VEL, PROJECTILE_HOMING_ORBIT_CHASE_SPEED, PROJECTILE_HOMING_ORBIT_TURN_RATE, PROJECTILE_HOMING_MAX_ORBITING, PROJECTILE_HOMING_RETURN_SNAP_DIST_WORLD, PROJECTILE_DESPAWN_OFFSCREEN_PAD_PX, PROJECTILE_COLLISION_GRACE_SECONDS, PROJECTILE_CHAIN_SPAWN_OFFSET_WORLD, HELPER_LIFETIME_BEATS, HELPER_ORBIT_RADIUS_WORLD, HELPER_ORBIT_ANG_VEL, HELPER_IMPACT_RADIUS_PX, HELPER_IMPACT_DAMAGE, HELPER_TURRET_SPAWN_OFFSET_WORLD, LASER_TTL, EXPLOSION_TTL, EXPLOSION_RADIUS_WORLD, EXPLOSION_PRIME_MAX_SCALE, BEAM_DAMAGE_PER_SECOND, PREVIEW_PROJECTILE_SPEED, PREVIEW_PROJECTILE_LIFETIME, PREVIEW_PROJECTILE_HIT_RADIUS, PREVIEW_PROJECTILE_SPLIT_ANGLE_RAD, PREVIEW_PROJECTILE_BOOMERANG_RADIUS, PREVIEW_PROJECTILE_BOOMERANG_LOOP_SECONDS, PREVIEW_PROJECTILE_HOMING_ACQUIRE_RANGE, PREVIEW_PROJECTILE_HOMING_SPEED, PREVIEW_PROJECTILE_HOMING_TURN_RATE, PREVIEW_PROJECTILE_HOMING_ORBIT_RADIUS, PREVIEW_PROJECTILE_HOMING_ORBIT_ANG_VEL, PREVIEW_PROJECTILE_HOMING_ORBIT_CHASE_SPEED, PREVIEW_PROJECTILE_HOMING_ORBIT_TURN_RATE, PREVIEW_PROJECTILE_HOMING_MAX_ORBITING, PREVIEW_PROJECTILE_HOMING_RETURN_SNAP_DIST, PREVIEW_PROJECTILE_CHAIN_SPAWN_OFFSET, PREVIEW_HELPER_LIFETIME_BEATS, PREVIEW_HELPER_ORBIT_RADIUS, PREVIEW_HELPER_ORBIT_ANG_VEL, PREVIEW_HELPER_IMPACT_RADIUS, PREVIEW_HELPER_IMPACT_DAMAGE, PREVIEW_HELPER_TURRET_SPAWN_OFFSET, PREVIEW_LASER_TTL, PREVIEW_EXPLOSION_TTL, PREVIEW_EXPLOSION_RADIUS, PREVIEW_BEAM_DAMAGE_PER_SECOND, PREVIEW_ENEMY_COUNT, PREVIEW_ENEMY_HP, PREVIEW_BEAT_LEN_FALLBACK, SWARM_PENTATONIC_NOTES_ONE_OCTAVE, SWARM_SOURCE_MUSIC_IDENTITY_BY_TYPE, FOUNDATION_LANE_PHRASE_LIBRARY, } from './beat-swarm-mode-constants.js';
const OVERLAY_ID = 'beat-swarm-overlay';
const BEAT_SWARM_STATE_KEY = 'mt.beatSwarm.state.v1';
// Beat Swarm movement tuning.
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
const {
  countWeaponTuneActiveColumns,
  countWeaponTuneActiveEvents,
  createDefaultWeaponTune,
  createRandomWeaponTune,
  ensureWeaponHasStarterTune,
  getWeaponSlotTuneChain,
  getWeaponTuneActivityStats,
  getWeaponTuneDamageScale,
  getWeaponTuneSignature,
  getWeaponTuneStepNotes,
  hasWeaponTuneContent,
  sanitizeWeaponTune,
  sanitizeWeaponTuneChain,
  seedDefaultWeaponLoadout,
  shouldMuteProjectileStageSound,
} = createBeatSwarmWeaponTuneTools({
  weaponTuneSteps: WEAPON_TUNE_STEPS,
  drawgridTuneNotePalette: DRAWGRID_TUNE_NOTE_PALETTE,
  maxWeaponSlots: MAX_WEAPON_SLOTS,
  weaponTuneChainLength: WEAPON_TUNE_CHAIN_LENGTH,
  weaponLoadout,
  hasWeaponSubBoard,
  normalizeSwarmNoteName,
  getRandomSwarmPentatonicNote,
});
seedDefaultWeaponLoadout();
const playerInstrumentRuntime = createBeatSwarmPlayerInstrumentRuntime({
  stepsPerBar: WEAPON_TUNE_STEPS,
  mode: 'guided_fire',
  grooveTargetSubdivision: 4,
  lockedPattern: [1, 0, 1, 0, 1, 0, 1, 0],
  customPatternEnabled: false,
  customPattern: [1, 0, 0, 1, 0, 0, 1, 0],
});
const PLAYER_WEAPON_SOUND_MIX_MULT = 0.52;
const composerEnemyGroups = [];
let composerEnemyGroupIdSeq = 1;
const singletonEnemyMusicGroups = new Map();
let singletonEnemyMusicGroupIdSeq = 1;
let musicContinuityIdSeq = 1;
function normalizeSwarmRole(roleName, fallback = BEAT_EVENT_ROLES.ACCENT) {
  const s = String(roleName || '').trim().toLowerCase();
  if (s === 'bass' || s === 'drum' || s === 'loop' || s === 'groove') return BEAT_EVENT_ROLES.BASS;
  if (s === 'lead' || s === 'phrase') return BEAT_EVENT_ROLES.LEAD;
  if (s === 'accent') return BEAT_EVENT_ROLES.ACCENT;
  if (s === 'motion' || s === 'cosmetic') return BEAT_EVENT_ROLES.MOTION;
  return normalizeSwarmRole(fallback, BEAT_EVENT_ROLES.ACCENT);
}
function getEnemyMusicIdentityProfile(enemyLike, fallbackRole = BEAT_EVENT_ROLES.ACCENT) {
  const enemy = enemyLike && typeof enemyLike === 'object' ? enemyLike : {};
  const enemyType = String(enemy?.enemyType || '').trim().toLowerCase();
  const base = SWARM_SOURCE_MUSIC_IDENTITY_BY_TYPE[enemyType] || SWARM_SOURCE_MUSIC_IDENTITY_BY_TYPE.default;
  const explicitRole = normalizeSwarmRole(enemy?.musicalRole || enemy?.composerRole || enemy?.role || '', '');
  const role = explicitRole || normalizeSwarmRole(base?.role || fallbackRole, fallbackRole);
  return {
    enemyType: enemyType || 'unknown',
    role,
    register: String(base?.register || 'mid').trim().toLowerCase() || 'mid',
    instrumentFamily: String(base?.instrumentFamily || 'projectile').trim().toLowerCase() || 'projectile',
    defaultProminence: String(base?.defaultProminence || 'quiet').trim().toLowerCase() || 'quiet',
    onboardingPriority: Math.max(0, Math.min(1, Number(base?.onboardingPriority) || 0.5)),
    layer: normalizeEnemyMusicLayer(base?.layer || 'sparkle', 'sparkle'),
    preferredActionType: String(base?.preferredActionType || 'enemy-accent').trim().toLowerCase() || 'enemy-accent',
  };
}
function getSwarmRoleForEnemy(enemyLike, fallback = BEAT_EVENT_ROLES.ACCENT) {
  return getEnemyMusicIdentityProfile(enemyLike, fallback).role;
}
function getFixedSingletonEnemyRole(enemyType = '', fallback = '') {
  const type = String(enemyType || '').trim().toLowerCase();
  if (type === 'spawner') return BEAT_EVENT_ROLES.BASS;
  if (type === 'drawsnake') return BEAT_EVENT_ROLES.LEAD;
  return normalizeSwarmRole(fallback, fallback || BEAT_EVENT_ROLES.ACCENT);
}
function getDefaultActionTypeForEnemyGroup(enemyType = '') {
  const profile = getEnemyMusicIdentityProfile({ enemyType: String(enemyType || '').trim().toLowerCase() }, BEAT_EVENT_ROLES.ACCENT);
  return String(profile?.preferredActionType || 'enemy-accent').trim().toLowerCase() || 'enemy-accent';
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
function getNextMusicContinuityId() {
  const next = Math.max(1, Math.trunc(Number(musicContinuityIdSeq) || 1));
  musicContinuityIdSeq = next + 1;
  return `mc-${next}`;
}
function getMusicLaneRuntimeEntry(laneId = '') {
  const key = String(laneId || '').trim().toLowerCase();
  if (key === 'foundation_lane') return musicLaneRuntime.foundationLane;
  if (key === 'primary_loop_lane') return musicLaneRuntime.primaryLoopLane;
  if (key === 'secondary_loop_lane') return musicLaneRuntime.secondaryLoopLane;
  if (key === 'sparkle_lane') return musicLaneRuntime.sparkleLane;
  return null;
}
function resolveMusicLaneId(options = null) {
  const opts = options && typeof options === 'object' ? options : {};
  const preferred = String(opts?.preferredLaneId || '').trim().toLowerCase();
  if (preferred) return preferred;
  const layer = normalizeEnemyMusicLayer(opts?.layer || '', 'sparkle');
  const role = normalizeSwarmRole(opts?.role || '', BEAT_EVENT_ROLES.ACCENT);
  if (layer === 'foundation' || role === BEAT_EVENT_ROLES.BASS) return 'foundation_lane';
  if (layer === 'sparkle') return 'sparkle_lane';
  return role === BEAT_EVENT_ROLES.LEAD ? 'primary_loop_lane' : 'secondary_loop_lane';
}
function assignMusicLaneIdentity(options = null) {
  const opts = options && typeof options === 'object' ? options : {};
  const laneId = resolveMusicLaneId(opts);
  const lane = getMusicLaneRuntimeEntry(laneId);
  if (!lane) return null;
  const barIndex = Math.max(0, Math.trunc(Number(opts?.barIndex) || 0));
  const role = normalizeSwarmRole(opts?.role || lane.role || '', lane.role || BEAT_EVENT_ROLES.ACCENT);
  const layer = normalizeEnemyMusicLayer(opts?.layer || lane.layer || '', lane.layer || 'sparkle');
  const continuityId = String(opts?.continuityId || lane.continuityId || '').trim() || getNextMusicContinuityId();
  const instrumentId = String(opts?.instrumentId || lane.instrumentId || '').trim();
  const phraseId = String(opts?.phraseId || lane.phraseId || '').trim().toLowerCase();
  const performerEnemyId = Math.max(0, Math.trunc(Number(opts?.performerEnemyId) || 0));
  const performerGroupId = Math.max(0, Math.trunc(Number(opts?.performerGroupId) || 0));
  lane.laneId = laneId;
  lane.layer = layer;
  lane.role = role;
  lane.continuityId = continuityId;
  if (instrumentId) lane.instrumentId = instrumentId;
  if (phraseId) lane.phraseId = phraseId;
  if (!(lane.activeSinceBar >= 0)) lane.activeSinceBar = barIndex;
  lane.lastAssignedBar = barIndex;
  lane.lifetimeBars = lane.activeSinceBar >= 0 ? Math.max(1, (barIndex - lane.activeSinceBar) + 1) : 0;
  lane.performerEnemyId = performerEnemyId;
  lane.performerGroupId = performerGroupId;
  lane.performerType = String(opts?.performerType || lane.performerType || '').trim().toLowerCase();
  lane.handoffPolicy = String(opts?.handoffPolicy || lane.handoffPolicy || '').trim().toLowerCase()
    || (laneId === 'foundation_lane' ? 'preserve_phrase' : (laneId === 'sparkle_lane' ? 'ephemeral_support' : 'inherit_identity'));
  const group = opts?.group && typeof opts.group === 'object' ? opts.group : null;
  const enemy = opts?.enemy && typeof opts.enemy === 'object' ? opts.enemy : null;
  if (group) {
    group.musicLaneId = laneId;
    group.musicLaneLayer = layer;
    group.musicLaneContinuityId = continuityId;
    group.musicLaneInstrumentId = String(lane.instrumentId || instrumentId || group.musicLaneInstrumentId || '').trim();
    group.musicLanePhraseId = String(lane.phraseId || group.musicLanePhraseId || '').trim();
    group.musicLaneLifetimeBars = lane.lifetimeBars;
    group.musicLaneHandoffPolicy = lane.handoffPolicy;
    if (laneId !== 'sparkle_lane') {
      group.continuityId = continuityId;
      if (group.musicLaneInstrumentId) {
        group.instrumentId = group.musicLaneInstrumentId;
        group.instrument = group.musicLaneInstrumentId;
      }
    }
  }
  if (enemy) {
    enemy.musicLaneId = laneId;
    enemy.musicLaneLayer = layer;
    enemy.musicLaneContinuityId = continuityId;
    enemy.musicLaneInstrumentId = String(lane.instrumentId || instrumentId || enemy.musicLaneInstrumentId || '').trim();
    enemy.musicLanePhraseId = String(lane.phraseId || enemy.musicLanePhraseId || '').trim();
    enemy.musicLaneLifetimeBars = lane.lifetimeBars;
    enemy.musicLaneHandoffPolicy = lane.handoffPolicy;
    if (laneId !== 'sparkle_lane') {
      enemy.musicContinuityId = continuityId;
      enemy.continuityId = continuityId;
      if (enemy.musicLaneInstrumentId) {
        enemy.instrumentId = enemy.musicLaneInstrumentId;
        enemy.musicInstrumentId = enemy.musicLaneInstrumentId;
      }
    }
  }
  return {
    laneId,
    layer,
    role,
    continuityId,
    instrumentId: String(lane.instrumentId || instrumentId || '').trim(),
    phraseId: String(lane.phraseId || '').trim(),
    lifetimeBars: lane.lifetimeBars,
    performerEnemyId,
    performerGroupId,
    performerType: lane.performerType,
    handoffPolicy: lane.handoffPolicy,
  };
}
function clampHslHue(value = 0) {
  const n = Number(value) || 0;
  return ((n % 360) + 360) % 360;
}
function getLaneHueBase(laneLike = 'lead') {
  const lane = normalizeEnemyInstrumentLane(laneLike, 'lead');
  return Number(ROLE_COLOR_HUE_BY_LANE[lane] ?? ROLE_COLOR_HUE_BY_LANE.lead);
}
function makeRoleColorSetFromIdentity(identity = null) {
  const id = identity && typeof identity === 'object' ? identity : {};
  const lane = normalizeEnemyInstrumentLane(id?.lane || 'lead', 'lead');
  const instrumentKey = String(id?.instrumentId || '').trim().toLowerCase() || 'instrument-unknown';
  const seedA = hashStringSeed(`music-role-hue|${lane}|${instrumentKey}`);
  const seedB = hashStringSeed(`music-role-sat|${instrumentKey}`);
  const baseHue = getLaneHueBase(lane);
  const hueOffset = Math.round((seededNoise01(seedA) * 24) - 12);
  const hue = clampHslHue(baseHue + hueOffset);
  const saturation = Math.max(52, Math.min(88, Math.round(66 + (seededNoise01(seedB) * 14))));
  const lightness = lane === 'bass'
    ? 46
    : (lane === 'lead' ? 52 : (lane === 'accent' ? 50 : 48));
  return {
    lane,
    hue,
    saturation,
    lightness,
    base: `hsl(${hue}deg ${saturation}% ${lightness}%)`,
    bright: `hsl(${hue}deg ${Math.max(40, Math.min(94, saturation - 2))}% ${Math.min(86, lightness + 20)}%)`,
    deep: `hsl(${hue}deg ${Math.max(36, Math.min(92, saturation + 2))}% ${Math.max(18, lightness - 22)}%)`,
    border: `hsla(${hue}deg ${Math.max(40, Math.min(92, saturation + 2))}% ${Math.min(90, lightness + 26)}% / 0.78)`,
    glow: `hsla(${hue}deg ${Math.max(42, Math.min(92, saturation + 8))}% ${Math.min(84, lightness + 8)}% / 0.56)`,
  };
}
function resolveMusicalIdentityRoleColorSet(options = null) {
  const opts = options && typeof options === 'object' ? options : {};
  const role = normalizeSwarmRole(opts?.role || '', BEAT_EVENT_ROLES.LEAD);
  const fallbackLane = inferEnemyLaneFromRole(role, 'lead');
  const instrumentId = String(opts?.instrumentId || '').trim();
  const lockedLane = String(opts?.lockedLane || '').trim();
  const lane = normalizeEnemyInstrumentLane(
    lockedLane || inferInstrumentLaneFromCatalogId(instrumentId, fallbackLane),
    fallbackLane
  );
  const instrumentKey = instrumentId.toLowerCase();
  if (instrumentKey) {
    const existing = musicIdentityVisualRuntime.colorByInstrumentId.get(instrumentKey);
    if (existing && typeof existing === 'object') return existing;
  }
  const continuityId = String(opts?.continuityId || '').trim();
  if (!instrumentKey && continuityId) {
    const existing = musicIdentityVisualRuntime.colorByContinuityId.get(continuityId);
    if (existing && typeof existing === 'object') return existing;
  }
  const created = makeRoleColorSetFromIdentity({
    role,
    lane,
    continuityId,
    instrumentId,
  });
  if (instrumentKey) musicIdentityVisualRuntime.colorByInstrumentId.set(instrumentKey, created);
  if (continuityId) musicIdentityVisualRuntime.colorByContinuityId.set(continuityId, created);
  return created;
}
function applyMusicalIdentityVisualToEnemy(enemyLike = null, groupLike = null) {
  const enemy = enemyLike && typeof enemyLike === 'object' ? enemyLike : null;
  if (!enemy) return null;
  const group = groupLike && typeof groupLike === 'object' ? groupLike : null;
  const explicitReorchestration = group?.explicitReorchestrationEvent === true || enemy?.explicitReorchestrationEvent === true;
  const role = normalizeSwarmRole(
    group?.role || enemy?.musicalRole || enemy?.composerRole || '',
    getSwarmRoleForEnemy(enemy, BEAT_EVENT_ROLES.ACCENT)
  );
  const instrumentId = resolveLockedEnemyInstrumentId(
    enemy,
    String(
      group?.musicLaneInstrumentId
        || enemy?.musicLaneInstrumentId
        || group?.instrumentId
        || enemy?.musicInstrumentId
        || enemy?.spawnerInstrument
        || enemy?.drawsnakeInstrument
        || enemy?.composerInstrument
        || ''
    ).trim(),
    false,
    role
  );
  if (group && instrumentId && !String(group.instrumentId || '').trim()) {
    group.instrumentId = instrumentId;
  }
  const lockedLane = !explicitReorchestration
    ? String(group?.roleLane || enemy?.musicRoleLane || '').trim()
    : '';
  const continuityId = String(
    group?.musicLaneContinuityId
      || enemy?.musicLaneContinuityId
      || group?.continuityId
      || enemy?.musicContinuityId
      || enemy?.continuityId
      || ''
  ).trim();
  const colors = resolveMusicalIdentityRoleColorSet({ role, instrumentId, continuityId, lockedLane });
  const resolvedLane = String(lockedLane || colors?.lane || inferEnemyLaneFromRole(role, 'lead'));
  const resolvedBaseColor = !explicitReorchestration && String(enemy?.musicRoleColor || group?.roleColor || '').trim()
    ? String(enemy?.musicRoleColor || group?.roleColor || '').trim()
    : String(colors?.base || '');
  const resolvedBrightColor = !explicitReorchestration && String(enemy?.musicRoleColorBright || group?.roleColorBright || '').trim()
    ? String(enemy?.musicRoleColorBright || group?.roleColorBright || '').trim()
    : String(colors?.bright || '');
  const resolvedDeepColor = !explicitReorchestration && String(enemy?.musicRoleColorDeep || group?.roleColorDeep || '').trim()
    ? String(enemy?.musicRoleColorDeep || group?.roleColorDeep || '').trim()
    : String(colors?.deep || '');
  if (group) {
    if (!(group.identityVisualLocked === true) || explicitReorchestration) {
      group.roleColor = resolvedBaseColor;
      group.roleColorBright = resolvedBrightColor;
      group.roleColorDeep = resolvedDeepColor;
      group.roleLane = resolvedLane;
      group.identityVisualLocked = true;
    }
  }
  enemy.musicalRole = role;
  enemy.instrumentId = String(instrumentId || enemy.instrumentId || enemy.musicInstrumentId || '');
  enemy.musicInstrumentId = String(instrumentId || enemy.musicInstrumentId || '');
  if (!(enemy.identityVisualLocked === true) || explicitReorchestration) {
    enemy.musicRoleLane = resolvedLane;
    enemy.musicRoleColor = resolvedBaseColor;
    enemy.musicRoleColorBright = resolvedBrightColor;
    enemy.musicRoleColorDeep = resolvedDeepColor;
    enemy.identityVisualLocked = true;
  }
  enemy.musicRoleVisualId = `${String(enemy.musicRoleLane || '')}:${String(enemy.musicRoleColor || '')}`;
  const lane = getMusicLaneRuntimeEntry(String(group?.musicLaneId || enemy?.musicLaneId || '').trim().toLowerCase());
  if (lane) {
    lane.colourId = String(enemy.musicRoleVisualId || lane.colourId || '').trim();
    if (group) {
      group.musicLaneColourId = lane.colourId;
    }
    enemy.musicLaneColourId = lane.colourId;
  }
  const el = enemy?.el instanceof HTMLElement ? enemy.el : null;
  if (el) {
    try { el.style.setProperty('--bs-role-color', enemy.musicRoleColor); } catch {}
    try { el.style.setProperty('--bs-role-color-bright', enemy.musicRoleColorBright); } catch {}
    try { el.style.setProperty('--bs-role-color-deep', enemy.musicRoleColorDeep); } catch {}
    try { el.style.setProperty('--bs-role-border-color', String(colors?.border || '')); } catch {}
    try { el.style.setProperty('--bs-role-glow-color', String(colors?.glow || '')); } catch {}
    try { el.dataset.musicContinuityId = continuityId; } catch {}
    try { el.dataset.musicRole = role; } catch {}
    try { el.dataset.musicLane = enemy.musicRoleLane; } catch {}
    try { el.dataset.musicVisualId = enemy.musicRoleVisualId; } catch {}
    if (enemy.enemyType === 'composer-group-member') {
      try { el.style.setProperty('--bs-group-color', enemy.musicRoleColor); } catch {}
    }
  }
  const link = enemy?.linkedSpawnerLineEl instanceof HTMLElement ? enemy.linkedSpawnerLineEl : null;
  if (link) {
    try { link.style.setProperty('--bs-role-glow-color', String(colors?.glow || '')); } catch {}
    try { link.style.setProperty('--bs-role-border-color', String(colors?.border || '')); } catch {}
  }
  return colors;
}
function pulseEnemyMusicalRoleVisual(enemyLike = null, strength = 'soft') {
  const enemy = enemyLike && typeof enemyLike === 'object' ? enemyLike : null;
  if (!enemy) return false;
  const mode = String(strength || 'soft').trim().toLowerCase();
  const dur = Math.max(0.05, Number(MUSIC_ROLE_PULSE_POLICY.seconds) || 0.24);
  const scaleBase = mode === 'strong'
    ? Number(MUSIC_ROLE_PULSE_POLICY.strongScale)
    : Number(MUSIC_ROLE_PULSE_POLICY.softScale);
  const scale = Math.max(0.02, Math.min(0.4, Number(scaleBase) || 0.08));
  enemy.musicRolePulseDur = dur;
  enemy.musicRolePulseT = dur;
  enemy.musicRolePulseScale = scale;
  if (String(enemy?.enemyType || '').trim().toLowerCase() === 'drawsnake') {
    enemy.drawsnakeLinePulseDur = dur;
    enemy.drawsnakeLinePulseT = dur;
    enemy.drawsnakeLinePulseScale = scale;
  }
  const el = enemy?.el instanceof HTMLElement ? enemy.el : null;
  if (el) {
    try { el.style.setProperty('--bs-role-pulse', '1'); } catch {}
  }
  return true;
}
function getEnemyVisualIdentitySnapshot(enemyLike = null) {
  const enemy = enemyLike && typeof enemyLike === 'object' ? enemyLike : null;
  if (!enemy) return null;
  return {
    enemyId: Math.max(0, Math.trunc(Number(enemy?.id) || 0)),
    enemyType: String(enemy?.enemyType || '').trim().toLowerCase(),
    continuityId: String(enemy?.musicContinuityId || enemy?.continuityId || '').trim(),
    lane: normalizeEnemyInstrumentLane(enemy?.musicRoleLane || '', 'lead'),
    role: normalizeSwarmRole(enemy?.musicalRole || enemy?.composerRole || '', BEAT_EVENT_ROLES.ACCENT),
    color: String(enemy?.musicRoleColor || '').trim().toLowerCase(),
    visualId: String(enemy?.musicRoleVisualId || '').trim().toLowerCase(),
  };
}
function clonePhraseState(stateLike = null) {
  const src = stateLike && typeof stateLike === 'object' ? stateLike : null;
  if (!src) return null;
  const loopLengthSteps = Math.max(1, Math.trunc(Number(src.loopLengthSteps) || WEAPON_TUNE_STEPS || 8));
  const stepIndex = Math.max(0, Math.trunc(Number(src.stepIndex) || 0));
  return {
    beatIndex: Math.max(0, Math.trunc(Number(src.beatIndex) || 0)),
    stepIndex,
    barIndex: Math.max(0, Math.trunc(Number(src.barIndex) || 0)),
    phraseIndex: Math.max(0, Math.trunc(Number(src.phraseIndex) || Math.floor(stepIndex / Math.max(1, loopLengthSteps)))),
    barOffset: Math.max(0, Math.trunc(Number(src.barOffset) || 0)),
    subdivisionPhase: Math.max(0, Math.trunc(Number(src.subdivisionPhase) || (stepIndex % Math.max(1, loopLengthSteps)))),
    loopLengthSteps,
    loopIdentity: String(src.loopIdentity || src.continuityId || '').trim().toLowerCase(),
    role: normalizeSwarmRole(src.role || '', ''),
    note: normalizeSwarmNoteName(src.note || ''),
    actionType: String(src.actionType || '').trim().toLowerCase(),
    updatedAtMs: Math.max(0, Number(src.updatedAtMs) || 0),
  };
}
function resetBassFoundationOwnerRuntime() {
  bassFoundationOwnerRuntime.active = false;
  bassFoundationOwnerRuntime.enemyId = 0;
  bassFoundationOwnerRuntime.groupId = 0;
  bassFoundationOwnerRuntime.continuityId = '';
  bassFoundationOwnerRuntime.loopIdentity = '';
  bassFoundationOwnerRuntime.assignedAtBeat = -1;
  bassFoundationOwnerRuntime.transferCount = 0;
}
function resetBassKeepaliveRuntime() {
  bassKeepaliveRuntime.lastNaturalBassStep = -1000000;
  bassKeepaliveRuntime.lastInjectedBassStep = -1000000;
}
function noteNaturalBassStepRuntime(stepIndex = 0) {
  const step = Math.max(0, Math.trunc(Number(stepIndex) || 0));
  bassKeepaliveRuntime.lastNaturalBassStep = step;
}
function isBassFoundationOwnerEnemy(enemyId = 0) {
  const id = Math.max(0, Math.trunc(Number(enemyId) || 0));
  return !!bassFoundationOwnerRuntime.active && id > 0 && bassFoundationOwnerRuntime.enemyId === id;
}
function assignBassFoundationOwner(enemyLike, groupLike, context = null) {
  const enemy = enemyLike && typeof enemyLike === 'object' ? enemyLike : null;
  const group = groupLike && typeof groupLike === 'object' ? groupLike : null;
  if (!enemy || !group) return false;
  const role = normalizeSwarmRole(group.role || getSwarmRoleForEnemy(enemy, BEAT_EVENT_ROLES.ACCENT), BEAT_EVENT_ROLES.ACCENT);
  if (role !== BEAT_EVENT_ROLES.BASS) return false;
  const enemyId = Math.max(0, Math.trunc(Number(enemy.id) || 0));
  const groupId = Math.max(0, Math.trunc(Number(group.id) || 0));
  if (!(enemyId > 0) || !(groupId > 0)) return false;
  const continuityId = String(group.continuityId || enemy.musicContinuityId || enemy.continuityId || '').trim() || getNextMusicContinuityId();
  const lane = applyFoundationLaneToPerformer(enemy, group, context || null);
  const loopIdentity = String(
    lane?.phraseId
      || group?.foundationPhraseId
      || group?.phraseState?.loopIdentity
      || continuityId
  ).trim().toLowerCase();
  const sameOwner = bassFoundationOwnerRuntime.active
    && bassFoundationOwnerRuntime.enemyId === enemyId
    && bassFoundationOwnerRuntime.groupId === groupId
    && String(bassFoundationOwnerRuntime.continuityId || '') === String(continuityId || '');
  bassFoundationOwnerRuntime.active = true;
  bassFoundationOwnerRuntime.enemyId = enemyId;
  bassFoundationOwnerRuntime.groupId = groupId;
  bassFoundationOwnerRuntime.continuityId = continuityId;
  bassFoundationOwnerRuntime.loopIdentity = loopIdentity;
  bassFoundationOwnerRuntime.assignedAtBeat = Math.max(0, Math.trunc(Number(context?.beatIndex) || Number(currentBeatIndex) || 0));
  if (!sameOwner) {
    noteMusicSystemEvent('music_bass_foundation_owner_assigned', {
      enemyId,
      groupId,
      continuityId,
      loopIdentity,
      transferCount: Math.max(0, Math.trunc(Number(bassFoundationOwnerRuntime.transferCount) || 0)),
    }, context || null);
  }
  return true;
}
function transferBassFoundationOwnerTo(enemyLike, groupLike, context = null) {
  const enemy = enemyLike && typeof enemyLike === 'object' ? enemyLike : null;
  const group = groupLike && typeof groupLike === 'object' ? groupLike : null;
  if (!enemy || !group) return false;
  const previousEnemyId = Math.max(0, Math.trunc(Number(bassFoundationOwnerRuntime.enemyId) || 0));
  const previousGroupId = Math.max(0, Math.trunc(Number(bassFoundationOwnerRuntime.groupId) || 0));
  const assigned = assignBassFoundationOwner(enemy, group, context);
  if (!assigned) return false;
  const nextEnemyId = Math.max(0, Math.trunc(Number(bassFoundationOwnerRuntime.enemyId) || 0));
  const nextGroupId = Math.max(0, Math.trunc(Number(bassFoundationOwnerRuntime.groupId) || 0));
  const changed = previousEnemyId !== nextEnemyId || previousGroupId !== nextGroupId;
  if (changed) {
    bassFoundationOwnerRuntime.transferCount = Math.max(0, Math.trunc(Number(bassFoundationOwnerRuntime.transferCount) || 0)) + 1;
    noteMusicSystemEvent('music_bass_foundation_owner_transferred', {
      fromEnemyId: previousEnemyId,
      fromGroupId: previousGroupId,
      toEnemyId: nextEnemyId,
      toGroupId: nextGroupId,
      continuityId: String(bassFoundationOwnerRuntime.continuityId || '').trim(),
      loopIdentity: String(bassFoundationOwnerRuntime.loopIdentity || '').trim().toLowerCase(),
      transferCount: Math.max(0, Math.trunc(Number(bassFoundationOwnerRuntime.transferCount) || 0)),
    }, context || null);
  }
  return true;
}
function clearBassFoundationOwnerIfMatches(enemyId = 0, reason = 'unknown', context = null) {
  const id = Math.max(0, Math.trunc(Number(enemyId) || 0));
  if (!isBassFoundationOwnerEnemy(id)) return false;
  const payload = {
    enemyId: id,
    groupId: Math.max(0, Math.trunc(Number(bassFoundationOwnerRuntime.groupId) || 0)),
    continuityId: String(bassFoundationOwnerRuntime.continuityId || '').trim(),
    loopIdentity: String(bassFoundationOwnerRuntime.loopIdentity || '').trim().toLowerCase(),
    reason: String(reason || 'unknown').trim().toLowerCase() || 'unknown',
  };
  resetBassFoundationOwnerRuntime();
  noteMusicSystemEvent('music_bass_foundation_owner_cleared', payload, context || null);
  return true;
}
function noteBassFoundationOwnerState(reason = 'tick', context = null) {
  noteMusicSystemEvent('music_bass_foundation_owner_state', {
    active: bassFoundationOwnerRuntime.active === true,
    enemyId: Math.max(0, Math.trunc(Number(bassFoundationOwnerRuntime.enemyId) || 0)),
    groupId: Math.max(0, Math.trunc(Number(bassFoundationOwnerRuntime.groupId) || 0)),
    continuityId: String(bassFoundationOwnerRuntime.continuityId || '').trim(),
    loopIdentity: String(bassFoundationOwnerRuntime.loopIdentity || '').trim().toLowerCase(),
    assignedAtBeat: Math.max(-1, Math.trunc(Number(bassFoundationOwnerRuntime.assignedAtBeat) || -1)),
    transferCount: Math.max(0, Math.trunc(Number(bassFoundationOwnerRuntime.transferCount) || 0)),
    reason: String(reason || 'tick').trim().toLowerCase() || 'tick',
  }, context || null);
}
function buildFallbackPhraseStateForHandoff(sourceGroup, beatIndex, stepIndex, continuityId = '') {
  const group = sourceGroup && typeof sourceGroup === 'object' ? sourceGroup : null;
  const safeBeat = Math.max(0, Math.trunc(Number(beatIndex) || 0));
  const safeStep = Math.max(0, Math.trunc(Number(stepIndex) || 0));
  const loopLengthSteps = Math.max(
    1,
    Math.trunc(
      Number(
        Array.isArray(group?.steps) && group.steps.length
          ? group.steps.length
          : WEAPON_TUNE_STEPS
      ) || WEAPON_TUNE_STEPS
    )
  );
  const resolvedContinuityId = String(continuityId || group?.continuityId || '').trim().toLowerCase();
  return {
    beatIndex: safeBeat,
    stepIndex: safeStep,
    barIndex: Math.floor(safeBeat / Math.max(1, COMPOSER_BEATS_PER_BAR)),
    phraseIndex: Math.floor(safeStep / Math.max(1, loopLengthSteps)),
    barOffset: safeBeat % Math.max(1, COMPOSER_BEATS_PER_BAR),
    subdivisionPhase: safeStep % Math.max(1, loopLengthSteps),
    loopLengthSteps,
    loopIdentity: resolvedContinuityId || `loop-${normalizeSwarmRole(group?.role || '', 'lead')}`,
    role: normalizeSwarmRole(group?.role || '', ''),
    note: normalizeSwarmNoteName(group?.note || ''),
    actionType: String(group?.actionType || '').trim().toLowerCase(),
    updatedAtMs: Number(performance?.now?.() || 0),
  };
}
function isCompatibleBassHandoffCandidate(sourceEnemy, sourceGroup, candidateEnemy) {
  const source = sourceEnemy && typeof sourceEnemy === 'object' ? sourceEnemy : null;
  const group = sourceGroup && typeof sourceGroup === 'object' ? sourceGroup : null;
  const candidate = candidateEnemy && typeof candidateEnemy === 'object' ? candidateEnemy : null;
  if (!source || !group || !candidate) return false;
  const sourceRole = normalizeSwarmRole(group.role || getSwarmRoleForEnemy(source, BEAT_EVENT_ROLES.BASS), BEAT_EVENT_ROLES.BASS);
  if (sourceRole !== BEAT_EVENT_ROLES.BASS) return false;
  const candidateRole = normalizeSwarmRole(getSwarmRoleForEnemy(candidate, BEAT_EVENT_ROLES.ACCENT), BEAT_EVENT_ROLES.ACCENT);
  if (candidateRole !== BEAT_EVENT_ROLES.BASS) return false;
  const sourceType = String(source.enemyType || group.enemyType || '').trim().toLowerCase();
  const candidateType = String(candidate.enemyType || '').trim().toLowerCase();
  const sourceHasRows = Array.isArray(group.rows) && group.rows.length > 0;
  const sourceHasSteps = Array.isArray(group.steps) && group.steps.length > 0;
  if (sourceHasRows && candidateType !== 'drawsnake') return false;
  if (sourceHasSteps) {
    const supportsStepPattern = candidateType === 'spawner' || candidateType === 'drawsnake';
    if (!supportsStepPattern) return false;
  }
  if (sourceType && candidateType && sourceType === candidateType) return true;
  const sourceActionType = String(group.actionType || getDefaultActionTypeForEnemyGroup(sourceType)).trim().toLowerCase();
  const candidateActionType = String(getDefaultActionTypeForEnemyGroup(candidateType)).trim().toLowerCase();
  if (sourceActionType && candidateActionType && sourceActionType === candidateActionType) return true;
  return true;
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
function getPlayerWeaponAssignedInstrumentIds() {
  const used = new Set();
  try {
    for (const key of Object.values(PLAYER_WEAPON_SOUND_EVENT_KEYS || {})) {
      const id = String(resolveSwarmSoundInstrumentId(key) || '').trim();
      if (id) used.add(id);
    }
  } catch {}
  return used;
}
function isPlayerWeaponAssignedInstrumentId(instrumentId = '') {
  const id = String(instrumentId || '').trim();
  if (!id) return false;
  return getPlayerWeaponAssignedInstrumentIds().has(id);
}
function getInstrumentCatalogEntryById(instrumentId = '') {
  const id = String(instrumentId || '').trim();
  if (!id) return null;
  const entries = Array.isArray(getInstrumentEntries?.()) ? getInstrumentEntries() : [];
  for (const entry of entries) {
    if (String(entry?.id || '').trim() === id) return entry;
  }
  return null;
}
function instrumentIdHasRecommendedToys(instrumentId = '') {
  const entry = getInstrumentCatalogEntryById(instrumentId);
  return Array.isArray(entry?.recommendedToys) && entry.recommendedToys.length > 0;
}
function entryMatchesSanitizedRole(entryLike = null, roleName = '') {
  const entry = entryLike && typeof entryLike === 'object' ? entryLike : null;
  if (!entry) return false;
  const role = normalizeSwarmRole(roleName, '');
  if (!role) return true;
  const laneRole = normalizeSwarmRole(entry?.laneRole || '', '');
  const registerClass = String(entry?.registerClass || '').trim().toLowerCase();
  const pitchRank = Math.trunc(Number(entry?.pitchRank));
  const combatRole = String(entry?.combatRole || '').trim().toLowerCase();
  const family = String(entry?.instrumentFamily || '').trim().toLowerCase();
  const type = String(entry?.type || '').trim().toLowerCase();
  const id = String(entry?.id || '').trim().toLowerCase();
  const display = String(entry?.display || '').trim().toLowerCase();
  const text = `${family} ${type} ${id} ${display}`;
  if (role === BEAT_EVENT_ROLES.BASS) {
    const recommendedToys = Array.isArray(entry?.recommendedToys)
      ? entry.recommendedToys.map((t) => String(t || '').trim().toLowerCase())
      : [];
    const hasLoopgridRecommendation = recommendedToys.includes('loopgrid') || recommendedToys.includes('loopgrid-drum');
    if (!hasLoopgridRecommendation) return false;
    if (laneRole && laneRole !== BEAT_EVENT_ROLES.BASS) return false;
    if (registerClass === 'high') return false;
    if (Number.isFinite(pitchRank) && pitchRank >= 4) return false;
    if (/xylophone|marimba|vibraphone|glock|bell|chime|celesta/.test(text)) return false;
    const foundationLike = combatRole === 'foundation' || /bass|kick|sub|drum|djembe/.test(text);
    const lowRegister = registerClass === 'low' || (Number.isFinite(pitchRank) && pitchRank <= 3);
    return foundationLike || laneRole === BEAT_EVENT_ROLES.BASS || (lowRegister && /tom|taiko|conga|bongo|tabla|perc/.test(text));
  }
  if (role === BEAT_EVENT_ROLES.LEAD) {
    if (laneRole === BEAT_EVENT_ROLES.BASS || combatRole === 'foundation') return false;
    if (laneRole) return laneRole === BEAT_EVENT_ROLES.LEAD;
    if (registerClass === 'low') return false;
    if (combatRole === 'punctuation' || combatRole === 'accent') return false;
    return true;
  }
  if (role === BEAT_EVENT_ROLES.ACCENT) {
    if (laneRole === BEAT_EVENT_ROLES.BASS) return false;
    if (laneRole) return laneRole === BEAT_EVENT_ROLES.ACCENT || laneRole === BEAT_EVENT_ROLES.MOTION;
    if (combatRole === 'foundation') return false;
    return registerClass !== 'low';
  }
  return true;
}
function pickSanitizedEnemyFallbackInstrumentId(themeKey = '', roleName = '') {
  const theme = String(themeKey || '').trim();
  const entries = Array.isArray(getInstrumentEntries?.()) ? getInstrumentEntries() : [];
  const eligible = entries.filter((entry) => {
    const id = String(entry?.id || '').trim();
    if (!id) return false;
    if (isPlayerWeaponAssignedInstrumentId(id)) return false;
    return Array.isArray(entry?.recommendedToys) && entry.recommendedToys.length > 0;
  }).filter((entry) => entryMatchesSanitizedRole(entry, roleName));
  if (!eligible.length) return '';
  const themed = theme
    ? eligible.filter((entry) => Array.isArray(entry?.themes) && entry.themes.includes(theme))
    : [];
  const themedPriority = themed.filter((entry) => entry?.priority === true);
  const globalPriority = eligible.filter((entry) => entry?.priority === true);
  const pool = themedPriority.length
    ? themedPriority
    : (themed.length ? themed : (globalPriority.length ? globalPriority : eligible));
  return String(pool[0]?.id || '').trim();
}
function sanitizeEnemyMusicInstrumentId(candidate, fallback = 'tone', options = null) {
  const roleName = String(options?.role || '').trim().toLowerCase();
  const fallbackProjectile = resolveInstrumentIdOrFallback(
    resolveSwarmSoundInstrumentId('projectile'),
    String(getIdForDisplayName('Tone (Sine)') || '').trim() || 'tone'
  );
  const safeFallback = isPlayerWeaponAssignedInstrumentId(fallbackProjectile)
    ? resolveInstrumentIdOrFallback(fallback, String(getIdForDisplayName('Tone (Sine)') || '').trim() || 'tone')
    : fallbackProjectile;
  const resolved = resolveInstrumentIdOrFallback(candidate, safeFallback);
  const resolvedEligible = instrumentIdHasRecommendedToys(resolved)
    && entryMatchesSanitizedRole(getInstrumentCatalogEntryById(resolved), roleName);
  if (!isPlayerWeaponAssignedInstrumentId(resolved) && resolvedEligible) return resolved;
  const themeKey = String(getSoundThemeKey?.() || '').trim();
  const preferredFallback = pickSanitizedEnemyFallbackInstrumentId(themeKey, roleName);
  const fallbackResolved = resolveInstrumentIdOrFallback(preferredFallback || safeFallback, 'tone');
  if (
    !isPlayerWeaponAssignedInstrumentId(fallbackResolved)
    && instrumentIdHasRecommendedToys(fallbackResolved)
    && entryMatchesSanitizedRole(getInstrumentCatalogEntryById(fallbackResolved), roleName)
  ) {
    return fallbackResolved;
  }
  const allIds = Array.isArray(getAllIds?.()) ? getAllIds().map((v) => String(v || '').trim()).filter(Boolean) : [];
  const firstRecommendedAllowed = allIds.find((id) => (
    !isPlayerWeaponAssignedInstrumentId(id)
    && instrumentIdHasRecommendedToys(id)
    && entryMatchesSanitizedRole(getInstrumentCatalogEntryById(id), roleName)
  )) || '';
  return resolveInstrumentIdOrFallback(firstRecommendedAllowed || fallbackResolved || safeFallback, 'tone');
}
function resolveLockedEnemyInstrumentId(enemyLike, preferredInstrumentId = '', forceReplace = false, roleOverride = '') {
  const enemy = enemyLike && typeof enemyLike === 'object' ? enemyLike : null;
  const role = normalizeSwarmRole(roleOverride || getSwarmRoleForEnemy(enemy, BEAT_EVENT_ROLES.ACCENT), BEAT_EVENT_ROLES.ACCENT);
  const preferred = sanitizeEnemyMusicInstrumentId(
    preferredInstrumentId,
    resolveSwarmSoundInstrumentId('projectile') || 'tone',
    { role }
  );
  if (!enemy) return preferred;
  const existing = String(
    enemy.instrumentId
      || enemy.musicInstrumentId
      || enemy.spawnerInstrument
      || enemy.drawsnakeInstrument
      || enemy.composerInstrument
      || ''
  ).trim();
  const existingEligible = !!existing
    && !isPlayerWeaponAssignedInstrumentId(existing)
    && instrumentIdHasRecommendedToys(existing)
    && entryMatchesSanitizedRole(getInstrumentCatalogEntryById(existing), role);
  const immutableLocked = enemy.instrumentIdentityLocked === true && !!existing;
  if (immutableLocked && existingEligible) return existing;
  if (existingEligible && !forceReplace) return existing;
  const resolved = preferred || existing || 'tone';
  enemy.instrumentId = String(resolved);
  enemy.musicInstrumentId = String(resolved);
  enemy.instrumentIdentityLocked = true;
  return String(resolved);
}
function ensureSingletonMusicGroupForEnemy(enemyLike, options = null) {
  const enemy = enemyLike && typeof enemyLike === 'object' ? enemyLike : null;
  const enemyId = Math.trunc(Number(enemy?.id) || 0);
  if (!(enemyId > 0)) return null;
  const forceInstrumentIdentity = options?.forceInstrumentIdentity === true;
  const enemyType = String(enemy?.enemyType || '').trim().toLowerCase();
  const role = getFixedSingletonEnemyRole(
    enemyType,
    normalizeSwarmRole(options?.role || getSwarmRoleForEnemy(enemy, BEAT_EVENT_ROLES.ACCENT), BEAT_EVENT_ROLES.ACCENT)
  );
  const identityProfile = getEnemyMusicIdentityProfile({ enemyType, role }, role);
  const laneLayer = normalizeEnemyMusicLayer(options?.layer || identityProfile?.layer || '', role === BEAT_EVENT_ROLES.BASS ? 'foundation' : 'sparkle');
  const actionType = String(options?.actionType || getDefaultActionTypeForEnemyGroup(enemy?.enemyType)).trim().toLowerCase();
  const note = normalizeSwarmNoteName(options?.note) || '';
  const requestedInstrumentId = resolveInstrumentIdOrFallback(options?.instrumentId, resolveSwarmSoundInstrumentId('projectile') || 'tone');
  let instrumentId = resolveLockedEnemyInstrumentId(enemy, requestedInstrumentId, forceInstrumentIdentity, role);
  const lifecycleState = normalizeMusicLifecycleState(
    options?.lifecycleState || enemy?.lifecycleState || 'active',
    'active'
  );
  const steps = Array.isArray(options?.steps) ? options.steps.map((v) => !!v) : null;
  const rows = Array.isArray(options?.rows) ? options.rows.map((v) => Math.max(0, Math.trunc(Number(v) || 0))) : null;
  const continuityId = String(
    options?.continuityId
      || enemy?.musicContinuityId
      || enemy?.continuityId
      || ''
  ).trim() || getNextMusicContinuityId();
  const phraseState = clonePhraseState(options?.phraseState);
  let group = singletonEnemyMusicGroups.get(enemyId) || null;
  if (!group) {
    group = {
      id: singletonEnemyMusicGroupIdSeq++,
      type: 'singleton',
      enemyType,
      memberIds: new Set([enemyId]),
      role,
      actionType,
      note,
      instrumentId,
      steps: steps || null,
      rows: rows || null,
      continuityId,
      phraseState: phraseState || null,
      active: true,
      lifecycleState,
      size: 1,
      performers: 1,
    };
    singletonEnemyMusicGroups.set(enemyId, group);
  } else {
    if (!forceInstrumentIdentity && String(group?.instrumentId || '').trim()) {
      instrumentId = String(group.instrumentId).trim();
      enemy.musicInstrumentId = instrumentId;
    }
    group.enemyType = String(enemy?.enemyType || group.enemyType || '').trim().toLowerCase();
    group.role = role;
    group.actionType = actionType;
    if (note) group.note = note;
    if (instrumentId && (forceInstrumentIdentity || !String(group.instrumentId || '').trim())) {
      group.instrumentId = instrumentId;
    }
    if (steps) group.steps = steps;
    if (rows) group.rows = rows;
    group.continuityId = continuityId;
    if (phraseState) group.phraseState = phraseState;
    group.memberIds = new Set([enemyId]);
    group.active = true;
    group.lifecycleState = lifecycleState;
    group.size = 1;
    group.performers = 1;
  }
  enemy.musicGroupId = Math.trunc(Number(group.id) || 0);
  enemy.musicGroupType = 'singleton';
  enemy.instrumentId = String(group.instrumentId || instrumentId || enemy.instrumentId || enemy.musicInstrumentId || 'tone');
  enemy.musicInstrumentId = String(group.instrumentId || instrumentId || enemy.musicInstrumentId || enemy.instrumentId || 'tone');
  enemy.musicContinuityId = String(group.continuityId || continuityId);
  enemy.continuityId = String(group.continuityId || continuityId);
  const laneAssignment = assignMusicLaneIdentity({
    group,
    enemy,
    role,
    layer: laneLayer,
    instrumentId: String(group.instrumentId || instrumentId || '').trim(),
    continuityId: String(group.continuityId || continuityId || '').trim(),
    phraseId: String(group?.foundationPhraseId || '').trim(),
    performerEnemyId: enemyId,
    performerGroupId: Math.trunc(Number(group.id) || 0),
    performerType: 'singleton',
  });
  if (laneAssignment?.instrumentId) {
    group.instrumentId = laneAssignment.instrumentId;
    enemy.instrumentId = laneAssignment.instrumentId;
    enemy.musicInstrumentId = laneAssignment.instrumentId;
  }
  if (laneAssignment?.continuityId) {
    group.continuityId = laneAssignment.continuityId;
    enemy.musicContinuityId = laneAssignment.continuityId;
    enemy.continuityId = laneAssignment.continuityId;
  }
  try {
    if (!bassFoundationOwnerRuntime.active || isBassFoundationOwnerEnemy(enemyId)) {
      assignBassFoundationOwner(enemy, group, null);
    }
  } catch {}
  return group;
}
function syncSingletonEnemyStateFromMusicGroup(enemyLike, groupLike = null) {
  const enemy = enemyLike && typeof enemyLike === 'object' ? enemyLike : null;
  const group = groupLike && typeof groupLike === 'object' ? groupLike : null;
  if (!enemy || !group) return;
  const fixedRole = getFixedSingletonEnemyRole(String(enemy?.enemyType || '').trim().toLowerCase(), group?.role || enemy?.musicalRole || '');
  if (fixedRole) {
    group.role = fixedRole;
    enemy.musicalRole = fixedRole;
    enemy.composerRole = fixedRole;
  }
  const continuityId = String(group?.continuityId || enemy?.musicContinuityId || '').trim();
  if (continuityId) {
    enemy.musicContinuityId = continuityId;
    enemy.continuityId = continuityId;
  }
  assignMusicLaneIdentity({
    group,
    enemy,
    role: fixedRole || group?.role || enemy?.musicalRole,
    layer: normalizeEnemyMusicLayer(group?.musicLaneLayer || getEnemyMusicIdentityProfile({ enemyType: enemy?.enemyType, role: fixedRole || group?.role || enemy?.musicalRole }, fixedRole || group?.role || enemy?.musicalRole)?.layer || '', 'sparkle'),
    instrumentId: String(group?.musicLaneInstrumentId || group?.instrumentId || enemy?.musicInstrumentId || '').trim(),
    continuityId: String(group?.musicLaneContinuityId || group?.continuityId || continuityId || '').trim(),
    phraseId: String(group?.musicLanePhraseId || group?.foundationPhraseId || '').trim(),
    performerEnemyId: Math.trunc(Number(enemy?.id) || 0),
    performerGroupId: Math.trunc(Number(group?.id) || 0),
    performerType: 'singleton',
  });
  applyMusicalIdentityVisualToEnemy(enemy, group);
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
function createBassFoundationKeepaliveEventRuntime(options = null) {
  if (!active || gameplayPaused) return null;
  const opts = options && typeof options === 'object' ? options : {};
  const beatIndex = Math.max(0, Math.trunc(Number(opts.beatIndex) || Number(currentBeatIndex) || 0));
  const stepIndex = Math.max(0, Math.trunc(Number(opts.stepIndex) || Number(ensureSwarmDirector().getSnapshot()?.stepIndex) || 0));
  const barIndex = Math.max(0, Math.trunc(Number(opts.barIndex) || Math.floor(beatIndex / Math.max(1, COMPOSER_BEATS_PER_BAR))));
  const center = opts.centerWorld && typeof opts.centerWorld === 'object'
    ? opts.centerWorld
    : (centerWorld && typeof centerWorld === 'object' ? centerWorld : { x: 0, y: 0 });
  let ownerEnemy = null;
  let group = null;
  const tryAttachOwner = (candidate) => {
    const enemy = candidate && typeof candidate === 'object' ? candidate : null;
    if (!enemy || enemy.retreating) return false;
    const fallbackActionType = getDefaultActionTypeForEnemyGroup(String(enemy?.enemyType || '').trim().toLowerCase());
    const g = getEnemyMusicGroup(enemy, fallbackActionType);
    if (!g) return false;
    const lifecycle = normalizeMusicLifecycleState(g?.lifecycleState || enemy?.lifecycleState || 'active', 'active');
    if (lifecycle === 'retiring') return false;
    const roleCheck = normalizeSwarmRole(g?.role || getSwarmRoleForEnemy(enemy, BEAT_EVENT_ROLES.BASS), BEAT_EVENT_ROLES.BASS);
    if (roleCheck !== BEAT_EVENT_ROLES.BASS) return false;
    ownerEnemy = enemy;
    group = g;
    assignBassFoundationOwner(ownerEnemy, group, { beatIndex, stepIndex, barIndex, reason: 'keepalive_recover' });
    return true;
  };
  if (bassFoundationOwnerRuntime.active) {
    const ownerId = Math.max(0, Math.trunc(Number(bassFoundationOwnerRuntime.enemyId) || 0));
    if (ownerId > 0) {
      const existingOwner = enemies.find((e) => Math.max(0, Math.trunc(Number(e?.id) || 0)) === ownerId) || null;
      tryAttachOwner(existingOwner);
    }
  }
  if (!ownerEnemy || !group) {
    let best = null;
    let bestDist = Number.POSITIVE_INFINITY;
    for (const enemy of enemies) {
      if (!enemy || enemy.retreating) continue;
      const fallbackActionType = getDefaultActionTypeForEnemyGroup(String(enemy?.enemyType || '').trim().toLowerCase());
      const g = getEnemyMusicGroup(enemy, fallbackActionType);
      if (!g) continue;
      const roleCheck = normalizeSwarmRole(g?.role || getSwarmRoleForEnemy(enemy, BEAT_EVENT_ROLES.BASS), BEAT_EVENT_ROLES.BASS);
      const lifecycle = normalizeMusicLifecycleState(g?.lifecycleState || enemy?.lifecycleState || 'active', 'active');
      if (roleCheck !== BEAT_EVENT_ROLES.BASS || lifecycle === 'retiring') continue;
      const dx = (Number(enemy?.x) || 0) - (Number(center?.x) || 0);
      const dy = (Number(enemy?.y) || 0) - (Number(center?.y) || 0);
      const dist = Math.hypot(dx, dy);
      if (dist < bestDist) {
        bestDist = dist;
        best = enemy;
      }
    }
    if (best) {
      tryAttachOwner(best);
    }
  }
  if (!ownerEnemy || !group) {
    const pacingCaps = getCurrentPacingCaps();
    const bassComposerGroups = composerEnemyGroups
      .filter((g) => !!g && g.active !== false && g.retiring !== true)
      .filter((g) => normalizeSwarmRole(g?.role || '', BEAT_EVENT_ROLES.LEAD) === BEAT_EVENT_ROLES.BASS);
    let spawned = null;
    let spawnedType = '';
    if (bassComposerGroups.length > 0) {
      const targetGroup = bassComposerGroups
        .slice()
        .sort((a, b) => {
          const aCount = getAliveEnemiesByIds(a?.memberIds).length;
          const bCount = getAliveEnemiesByIds(b?.memberIds).length;
          return aCount - bCount;
        })[0] || null;
      if (targetGroup) {
        const beforeIds = new Set(getAliveEnemiesByIds(targetGroup.memberIds).map((e) => Math.trunc(Number(e?.id) || 0)));
        try { spawnComposerGroupOffscreenMembers(targetGroup, 1); } catch {}
        const afterMembers = getAliveEnemiesByIds(targetGroup.memberIds)
          .filter((e) => String(e?.enemyType || '').trim().toLowerCase() === 'composer-group-member' && !e?.retreating)
          .sort((a, b) => Math.trunc(Number(b?.id) || 0) - Math.trunc(Number(a?.id) || 0));
        spawned = afterMembers.find((e) => !beforeIds.has(Math.trunc(Number(e?.id) || 0))) || afterMembers[0] || null;
        if (spawned) spawnedType = 'composer-group-member';
      }
    }
    if (!spawned && Number(pacingCaps?.maxDrawSnakes) > 0 && typeof spawnDrawSnakeEnemyOffscreen === 'function') {
      const foundationLane = getFoundationLaneSnapshot(stepIndex, barIndex);
      spawned = spawnDrawSnakeEnemyOffscreen({
        role: BEAT_EVENT_ROLES.BASS,
        profile: {
          steps: foundationLane.steps,
          rows: Array.from({ length: WEAPON_TUNE_STEPS }, () => 1),
          instrument: resolveSwarmSoundInstrumentId('projectile') || 'tone',
          lineWidthPx: DRAW_SNAKE_LINE_WIDTH_PX_FALLBACK,
        },
      }) || null;
      if (spawned) spawnedType = 'drawsnake';
    }
    if (!spawned && Number(pacingCaps?.maxSpawners) > 0 && typeof spawnSpawnerEnemyOffscreen === 'function') {
      spawned = spawnSpawnerEnemyOffscreen({
        role: BEAT_EVENT_ROLES.BASS,
        motifScopeKey: 'keepalive_recover',
      }) || null;
      if (spawned) spawnedType = 'spawner';
    }
    if (spawned) {
      tryAttachOwner(spawned);
      if (ownerEnemy && group) {
        try {
          noteMusicSystemEvent('music_bass_keepalive_owner_spawned', {
            enemyId: Math.max(0, Math.trunc(Number(ownerEnemy?.id) || 0)),
            enemyType: String(spawnedType || ownerEnemy?.enemyType || '').trim().toLowerCase(),
            groupId: Math.max(0, Math.trunc(Number(group?.id) || 0)),
            continuityId: String(group?.continuityId || ownerEnemy?.musicContinuityId || '').trim(),
          }, { beatIndex, stepIndex, barIndex });
        } catch {}
      }
    }
  }
  if (!ownerEnemy || !group) return null;
  const ownerType = String(ownerEnemy?.enemyType || '').trim().toLowerCase();
  const fallbackActionType = getDefaultActionTypeForEnemyGroup(ownerType);
  const lifecycleState = normalizeMusicLifecycleState(group?.lifecycleState || ownerEnemy?.lifecycleState || 'active', 'active');
  if (lifecycleState === 'retiring') return null;
  const role = normalizeSwarmRole(group?.role || getSwarmRoleForEnemy(ownerEnemy, BEAT_EVENT_ROLES.BASS), BEAT_EVENT_ROLES.BASS);
  if (role !== BEAT_EVENT_ROLES.BASS) return null;
  const pacingState = String(getCurrentPacingStateName() || '').trim().toLowerCase();
  const keepaliveGapTarget = (
    pacingState === 'intro_solo'
    || pacingState === 'intro_bass'
    || pacingState === 'intro_response'
  ) ? 2 : 3;
  const sinceNaturalBass = stepIndex - Math.max(-1000000, Math.trunc(Number(bassKeepaliveRuntime.lastNaturalBassStep) || -1000000));
  if (sinceNaturalBass < keepaliveGapTarget) return null;
  const bassKeepaliveCadenceSteps = Math.max(2, keepaliveGapTarget);
  const sinceInjectedBass = stepIndex - Math.max(-1000000, Math.trunc(Number(bassKeepaliveRuntime.lastInjectedBassStep) || -1000000));
  if (sinceInjectedBass < bassKeepaliveCadenceSteps) return null;
  const foundationLane = getFoundationLaneSnapshot(stepIndex, barIndex);
  if (!foundationLane.isActiveStep) return null;
  const ownerId = Math.max(0, Math.trunc(Number(ownerEnemy?.id) || 0));
  if (!(ownerId > 0)) return null;
  const requestedNoteRaw = normalizeSwarmNoteName(group?.note)
    || normalizeSwarmNoteName(ownerEnemy?.spawnerNoteName)
    || normalizeSwarmNoteName(ownerEnemy?.drawsnakePrimaryNote)
    || normalizeSwarmNoteName(ownerEnemy?.__bsLastSpawnerNote)
    || normalizeSwarmNoteName(ownerEnemy?.__bsLastDrawsnakeNote)
    || getSwarmPentatonicNoteByIndex(0);
  const note = clampNoteToDirectorPool(requestedNoteRaw, beatIndex + stepIndex + ownerId) || requestedNoteRaw;
  const instrumentId = resolveLockedEnemyInstrumentId(
    ownerEnemy,
    String(group?.instrumentId || ownerEnemy?.musicInstrumentId || '').trim() || resolveSwarmSoundInstrumentId('projectile') || 'tone',
    false,
    role
  );
  const groupActionType = String(group?.actionType || fallbackActionType || 'spawner-spawn').trim().toLowerCase() || 'spawner-spawn';
  const actionType = (() => {
    if (ownerType === 'composer-group-member') {
      if (groupActionType === 'projectile' || groupActionType === 'composer-group-projectile') return 'composer-group-projectile';
      if (groupActionType === 'explosion' || groupActionType === 'composer-group-explosion') return 'composer-group-explosion';
      return 'composer-group-projectile';
    }
    if (ownerType === 'drawsnake') {
      if (groupActionType === 'projectile' || groupActionType === 'drawsnake-projectile') return 'drawsnake-projectile';
      return 'drawsnake-projectile';
    }
    if (ownerType === 'spawner') return 'spawner-spawn';
    return groupActionType;
  })();
  const event = createLoggedPerformedBeatEvent({
    actorId: ownerId,
    beatIndex,
    stepIndex,
    role,
    note,
    instrumentId,
    actionType,
    threatClass: BEAT_EVENT_THREAT.LIGHT,
    visualSyncType: 'foundation-keepalive',
    payload: {
      groupId: Math.max(0, Math.trunc(Number(group?.id) || 0)),
      continuityId: String(group?.continuityId || ownerEnemy?.musicContinuityId || '').trim(),
      requestedNoteRaw,
      musicLayer: 'foundation',
      musicProminence: 'full',
      foundationLaneId: foundationLane.laneId,
      foundationPhraseId: foundationLane.phraseId,
      foundationPatternKey: foundationLane.patternKey,
      foundationStepIndex: foundationLane.stepIndex,
      bassKeepaliveInjected: true,
      keepaliveOwnerId: ownerId,
      keepaliveReason: 'missing_bass_step',
    },
  }, {
    beatIndex,
    stepIndex,
    sourceSystem: ownerType === 'drawsnake'
      ? 'drawsnake'
      : (ownerType === 'composer-group-member' ? 'group' : 'spawner'),
    enemyType: ownerType || 'spawner',
    groupId: Math.max(0, Math.trunc(Number(group?.id) || 0)),
  });
  bassKeepaliveRuntime.lastInjectedBassStep = stepIndex;
  try {
    noteMusicSystemEvent('music_bass_keepalive_injected', {
      enemyId: ownerId,
      groupId: Math.max(0, Math.trunc(Number(group?.id) || 0)),
      continuityId: String(group?.continuityId || ownerEnemy?.musicContinuityId || '').trim(),
      actionType,
      note,
      instrumentId,
    }, { beatIndex, stepIndex, barIndex });
  } catch {}
  return event;
}
function noteMusicSystemEvent(eventType, fields = null, context = null) {
  const payload = fields && typeof fields === 'object' ? fields : {};
  const beatIndex = Math.max(0, Math.trunc(Number(context?.beatIndex) || Number(currentBeatIndex) || 0));
  const stepIndex = Math.max(0, Math.trunc(Number(context?.stepIndex) || Number(ensureSwarmDirector().getSnapshot()?.stepIndex) || 0));
  const barIndex = Math.floor(beatIndex / Math.max(1, COMPOSER_BEATS_PER_BAR));
  const type = String(eventType || '').trim().toLowerCase();
  if (!type) return;
  try {
    swarmMusicLab.noteSystemEvent(type, payload, getMusicLabContext({
      beatIndex,
      stepIndex,
      barIndex,
      ...context,
    }));
  } catch {}
  try {
    window.dispatchEvent(new CustomEvent('beat-swarm:music-system-event', {
      detail: {
        type,
        payload: { ...payload },
        beatIndex,
        stepIndex,
        barIndex,
      },
    }));
  } catch {}
}
function getComposerSectionBars(sectionId = '') {
  const key = String(sectionId || '').trim().toLowerCase();
  if (!key) return 0;
  const sections = Array.isArray(COMPOSER_SECTIONS) ? COMPOSER_SECTIONS : [];
  const match = sections.find((s) => String(s?.id || '').trim().toLowerCase() === key) || null;
  return Math.max(0, Math.trunc(Number(match?.bars) || 0));
}
function normalizeSectionFlavorId(sectionId = '') {
  const raw = String(sectionId || '').trim().toLowerCase();
  if (!raw) return 'default';
  const aliases = BEAT_SWARM_FLAVOR_NAMING?.sectionAliases || null;
  if (aliases && typeof aliases === 'object' && aliases[raw]) {
    return String(aliases[raw] || '').trim().toLowerCase() || raw;
  }
  return raw;
}
function getBeatSwarmFlavorLevelProfile() {
  const level = BEAT_SWARM_FLAVOR_NAMING?.level || null;
  return {
    title: String(level?.title || 'Beat Swarm').trim() || 'Beat Swarm',
    subtitle: String(level?.subtitle || '').trim(),
    flavorText: String(level?.flavorText || '').trim(),
  };
}
function resolveSectionHeadingFlavor(sectionId = '', sectionCycle = 0) {
  const canonicalId = normalizeSectionFlavorId(sectionId);
  const headingMap = BEAT_SWARM_FLAVOR_NAMING?.sectionHeadings || null;
  const variants = headingMap && typeof headingMap === 'object'
    ? (headingMap[canonicalId] || headingMap.default || [])
    : [];
  const list = Array.isArray(variants) ? variants : [];
  const idx = list.length > 1
    ? Math.abs(Math.trunc(Number(sectionCycle) || 0)) % list.length
    : 0;
  const picked = list[idx] && typeof list[idx] === 'object' ? list[idx] : {};
  const flavorMap = BEAT_SWARM_FLAVOR_NAMING?.sectionFlavorText || null;
  const flavorVariants = flavorMap && typeof flavorMap === 'object'
    ? (flavorMap[canonicalId] || flavorMap.default || [])
    : [];
  const flavorList = Array.isArray(flavorVariants) ? flavorVariants : [];
  const flavorPicked = flavorList[idx] && typeof flavorList[idx] === 'object' ? flavorList[idx] : {};
  const level = getBeatSwarmFlavorLevelProfile();
  return {
    sectionId: canonicalId,
    title: String(picked?.title || 'Section Shift').trim() || 'Section Shift',
    subtitle: String(picked?.subtitle || level.subtitle || '').trim(),
    levelTitle: level.title,
    levelSubtitle: level.subtitle,
    levelFlavorText: level.flavorText,
    flavorTag: String(flavorPicked?.tag || '').trim().toLowerCase(),
    flavorText: String(flavorPicked?.text || '').trim(),
  };
}
function getSectionPresentationProfile(sectionId = '', energyState = '') {
  const sid = normalizeSectionFlavorId(sectionId);
  const eid = String(energyState || '').trim().toLowerCase();
  const base = SECTION_PRESENTATION_PROFILE_BY_ID[sid] || SECTION_PRESENTATION_PROFILE_BY_ID.default;
  if (eid === 'peak' || eid === 'clash') {
    return {
      ...base,
      starfield: {
        ...(base?.starfield || {}),
        parallaxIntensity: Math.max(1, Number(base?.starfield?.parallaxIntensity) || 1) * 1.1,
        density: Math.max(0.6, Number(base?.starfield?.density) || 0.72),
        pulseStrength: Math.max(0.25, Number(base?.starfield?.pulseStrength) || 0.2),
      },
    };
  }
  return base;
}
function applySectionStarfieldProfile(profile = null, withBurst = true) {
  const star = profile && typeof profile === 'object' ? profile : {};
  starfieldSectionRuntime.tint = String(star?.tint || '#000000').trim() || '#000000';
  starfieldSectionRuntime.parallaxIntensity = Math.max(0.5, Math.min(1.8, Number(star?.parallaxIntensity) || 1));
  starfieldSectionRuntime.density = Math.max(0.2, Math.min(1, Number(star?.density) || 0.72));
  starfieldSectionRuntime.twinkleRate = Math.max(0.05, Math.min(2.4, Number(star?.twinkleRate) || 0.45));
  starfieldSectionRuntime.pulseStrength = Math.max(0, Math.min(1, Number(star?.pulseStrength) || 0.2));
  starfieldSectionRuntime.entryBurstStrength = Math.max(0, Math.min(1.2, Number(star?.entryBurst) || 0.3));
  if (withBurst) {
    starfieldSectionRuntime.entryBurstDur = 0.9;
    starfieldSectionRuntime.entryBurstT = starfieldSectionRuntime.entryBurstDur;
  }
}
function hideSectionHeading() {
  sectionPresentationRuntime.visibleUntilMs = 0;
  if (!(sectionHeadingEl instanceof HTMLElement)) return;
  try { sectionHeadingEl.classList.remove('is-visible'); } catch {}
}
function showSectionHeading(title = '', subtitle = '', nowMs = performance.now()) {
  if (!(sectionHeadingEl instanceof HTMLElement)) return;
  const heading = String(title || '').trim();
  if (!heading) return;
  const sub = String(subtitle || '').trim();
  sectionPresentationRuntime.currentTitle = heading;
  sectionPresentationRuntime.currentSubtitle = sub;
  sectionPresentationRuntime.lastShownMs = Math.max(0, Number(nowMs) || performance.now());
  sectionPresentationRuntime.visibleUntilMs = sectionPresentationRuntime.lastShownMs + BEAT_SWARM_SECTION_HEADING_DURATION_MS;
  if (sectionHeadingTitleEl instanceof HTMLElement) sectionHeadingTitleEl.textContent = heading;
  if (sectionHeadingSubtitleEl instanceof HTMLElement) sectionHeadingSubtitleEl.textContent = sub;
  try { sectionHeadingEl.classList.add('is-visible'); } catch {}
}
function getComposerDirectiveVoiceDensity(directiveLike = null) {
  const d = directiveLike && typeof directiveLike === 'object' ? directiveLike : {};
  const drumLoops = Math.max(0, Math.trunc(Number(d?.drumLoops) || 0));
  const drawSnakes = Math.max(0, Math.trunc(Number(d?.drawSnakes) || 0));
  return drumLoops + drawSnakes;
}
function collectComposerGameplayStateSnapshot() {
  const directorState = ensureSwarmDirector().getSnapshot?.() || null;
  const usage = directorState?.usage && typeof directorState.usage === 'object' ? directorState.usage : {};
  const enemyCount = Math.max(0, enemies.length);
  let spawnerCount = 0;
  let drawSnakeCount = 0;
  let composerGroupCount = 0;
  let dumbCount = 0;
  let otherEnemyCount = 0;
  const roleSet = new Set();
  for (const enemy of enemies) {
    const type = String(enemy?.enemyType || '').trim().toLowerCase();
    if (type === 'spawner') spawnerCount += 1;
    else if (type === 'drawsnake') drawSnakeCount += 1;
    else if (type === 'composer-group-member') composerGroupCount += 1;
    else if (type === 'dumb') dumbCount += 1;
    else otherEnemyCount += 1;
    const role = normalizeSwarmRole(getSwarmRoleForEnemy(enemy, BEAT_EVENT_ROLES.ACCENT), '');
    if (role) roleSet.add(role);
  }
  const fullThreatUsage = Math.max(0, Math.trunc(Number(usage?.fullThreats) || 0));
  const lightThreatUsage = Math.max(0, Math.trunc(Number(usage?.lightThreats) || 0));
  const accentUsage = Math.max(0, Math.trunc(Number(usage?.audibleAccents) || 0));
  const cosmeticUsage = Math.max(0, Math.trunc(Number(usage?.cosmeticParticipants) || 0));
  return {
    enemyCount,
    projectileCount: Math.max(0, projectiles.length),
    activeRoleCount: roleSet.size,
    spawnerCount,
    drawSnakeCount,
    composerGroupCount,
    dumbCount,
    otherEnemyCount,
    fullThreatUsage,
    lightThreatUsage,
    accentUsage,
    cosmeticUsage,
    totalThreatUsage: fullThreatUsage + lightThreatUsage + accentUsage + cosmeticUsage,
  };
}
function computeComposerGameplayDelta(previousState = null, nextState = null) {
  const prev = previousState && typeof previousState === 'object' ? previousState : {};
  const next = nextState && typeof nextState === 'object' ? nextState : {};
  const enemyCountDelta = Math.abs(Math.max(0, Math.trunc(Number(next.enemyCount) || 0)) - Math.max(0, Math.trunc(Number(prev.enemyCount) || 0)));
  const projectileCountDelta = Math.abs(Math.max(0, Math.trunc(Number(next.projectileCount) || 0)) - Math.max(0, Math.trunc(Number(prev.projectileCount) || 0)));
  const activeRoleCountDelta = Math.abs(Math.max(0, Math.trunc(Number(next.activeRoleCount) || 0)) - Math.max(0, Math.trunc(Number(prev.activeRoleCount) || 0)));
  const totalThreatUsageDelta = Math.abs(Math.max(0, Math.trunc(Number(next.totalThreatUsage) || 0)) - Math.max(0, Math.trunc(Number(prev.totalThreatUsage) || 0)));
  const keys = ['spawnerCount', 'drawSnakeCount', 'composerGroupCount', 'dumbCount', 'otherEnemyCount'];
  const prevEnemyTotal = Math.max(1, keys.reduce((acc, k) => acc + Math.max(0, Math.trunc(Number(prev[k]) || 0)), 0));
  const nextEnemyTotal = Math.max(1, keys.reduce((acc, k) => acc + Math.max(0, Math.trunc(Number(next[k]) || 0)), 0));
  let enemyMixShift = 0;
  for (const key of keys) {
    const prevShare = Math.max(0, Math.trunc(Number(prev[key]) || 0)) / prevEnemyTotal;
    const nextShare = Math.max(0, Math.trunc(Number(next[key]) || 0)) / nextEnemyTotal;
    enemyMixShift += Math.abs(nextShare - prevShare);
  }
  const significant = (
    enemyCountDelta >= 3
    || activeRoleCountDelta >= 1
    || totalThreatUsageDelta >= 2
    || projectileCountDelta >= 4
    || enemyMixShift >= 0.22
  );
  return {
    enemyCountDelta,
    projectileCountDelta,
    activeRoleCountDelta,
    totalThreatUsageDelta,
    enemyMixShift: Number(enemyMixShift.toFixed(3)),
    significant,
  };
}
function evaluateSectionHeadingMeaningfulness(payload = null) {
  const p = payload && typeof payload === 'object' ? payload : {};
  const sectionId = String(p?.sectionId || '').trim().toLowerCase();
  const previousSectionId = String(p?.previousSectionId || '').trim().toLowerCase();
  if (!sectionId || !previousSectionId || sectionId === previousSectionId) {
    return {
      pass: false,
      sectionId,
      previousSectionId,
      transitionKey: '',
      transitionPreferred: false,
      gameplayMeaningful: false,
      musicalMeaningful: false,
      breakdownBridge: false,
      reasons: [],
      failedReasons: ['invalid_or_same_section'],
    };
  }
  const transitionKey = `${previousSectionId}->${sectionId}`;
  const transitionPreferred = SECTION_HEADING_TRANSITION_POLICY[transitionKey] === true;
  const sectionCycle = Math.max(0, Math.trunc(Number(p?.sectionCycle) || 0));
  const isOpeningBootstrap = transitionKey === 'default->opening_movement' && sectionCycle === 0;
  const previousIntensity = Number(p?.previousIntensity) || 0;
  const intensity = Number(p?.intensity) || 0;
  const intensityDelta = Math.abs(intensity - previousIntensity);
  const previousVoiceDensity = Math.max(
    0,
    Math.trunc(
      Number(p?.previousVoiceDensity)
      || ((Number(p?.previousDrumLoops) || 0) + (Number(p?.previousDrawSnakes) || 0))
    )
  );
  const voiceDensity = Math.max(
    0,
    Math.trunc(
      Number(p?.voiceDensity)
      || ((Number(p?.drumLoops) || 0) + (Number(p?.drawSnakes) || 0))
    )
  );
  const voiceDelta = Math.abs(voiceDensity - previousVoiceDensity);
  const gameplayDeltaEnemyCount = Math.abs(Math.max(0, Math.trunc(Number(p?.gameplayDeltaEnemyCount) || 0)));
  const gameplayDeltaProjectileCount = Math.abs(Math.max(0, Math.trunc(Number(p?.gameplayDeltaProjectileCount) || 0)));
  const gameplayDeltaRoleCount = Math.abs(Math.max(0, Math.trunc(Number(p?.gameplayDeltaRoleCount) || 0)));
  const gameplayDeltaThreatUsage = Math.abs(Math.max(0, Math.trunc(Number(p?.gameplayDeltaThreatUsage) || 0)));
  const gameplayDeltaMixShift = Math.abs(Number(p?.gameplayDeltaMixShift) || 0);
  const gameplayMeaningful = (
    p?.gameplayDeltaSignificant === true
    || gameplayDeltaEnemyCount >= 3
    || gameplayDeltaRoleCount >= 1
    || gameplayDeltaThreatUsage >= 2
    || gameplayDeltaProjectileCount >= 4
    || gameplayDeltaMixShift >= 0.22
  );
  const musicalMeaningful = intensityDelta >= 0.18 || voiceDelta >= 2;
  const breakdownBridge = sectionId === 'breakdown' || previousSectionId === 'breakdown';
  const reasons = [];
  const failedReasons = [];
  if (transitionPreferred) reasons.push('canonical_transition');
  if (isOpeningBootstrap) reasons.push('opening_bootstrap');
  if (breakdownBridge) reasons.push('breakdown_bridge');
  if (gameplayMeaningful) reasons.push('gameplay_delta');
  if (musicalMeaningful) reasons.push('musical_delta');
  if (p?.gameplayDeltaSignificant === true) reasons.push('gameplay_delta_flag');
  if (gameplayDeltaEnemyCount >= 3) reasons.push('enemy_count_delta');
  if (gameplayDeltaRoleCount >= 1) reasons.push('role_count_delta');
  if (gameplayDeltaThreatUsage >= 2) reasons.push('threat_delta');
  if (gameplayDeltaProjectileCount >= 4) reasons.push('projectile_delta');
  if (gameplayDeltaMixShift >= 0.22) reasons.push('enemy_mix_delta');
  if (intensityDelta >= 0.18) reasons.push('intensity_delta');
  if (voiceDelta >= 2) reasons.push('voice_density_delta');
  let pass = false;
  if (isOpeningBootstrap) {
    pass = true;
  } else if (breakdownBridge) {
    pass = gameplayMeaningful || musicalMeaningful;
    if (!pass) failedReasons.push('breakdown_without_delta');
  } else if (transitionPreferred) {
    pass = gameplayMeaningful;
    if (!gameplayMeaningful) failedReasons.push('canonical_missing_gameplay_delta');
  } else {
    pass = gameplayMeaningful && musicalMeaningful;
    if (!gameplayMeaningful) failedReasons.push('missing_gameplay_delta');
    if (!musicalMeaningful) failedReasons.push('missing_musical_delta');
  }
  return {
    pass,
    sectionId,
    previousSectionId,
    transitionKey,
    transitionPreferred,
    gameplayMeaningful,
    musicalMeaningful,
    breakdownBridge,
    reasons,
    failedReasons,
  };
}
function isMeaningfulSectionHeadingTransition(payload = null) {
  return evaluateSectionHeadingMeaningfulness(payload).pass === true;
}
function shouldShowSectionHeadingForMusicChange(payload = null, nowMs = performance.now()) {
  const p = payload && typeof payload === 'object' ? payload : {};
  const sectionId = String(p?.sectionId || '').trim().toLowerCase();
  const previousSectionId = String(p?.previousSectionId || '').trim().toLowerCase();
  if (!sectionId || sectionId === previousSectionId) return false;
  const sectionKey = `${sectionId}:${Math.max(0, Math.trunc(Number(p?.sectionCycle) || 0))}`;
  if (sectionPresentationRuntime.lastSectionKey === sectionKey) return false;
  const elapsed = Math.max(0, (Number(nowMs) || performance.now()) - (Number(sectionPresentationRuntime.lastShownMs) || 0));
  if (elapsed < BEAT_SWARM_SECTION_HEADING_COOLDOWN_MS) return false;
  const previousDurationBars = Math.max(0, Math.trunc(Number(p?.sectionDurationBars) || 0));
  const expectedBars = Math.max(0, getComposerSectionBars(sectionId));
  if (previousDurationBars > 0 && previousDurationBars < BEAT_SWARM_SECTION_HEADING_MIN_SECTION_BARS) return false;
  if (expectedBars > 0 && expectedBars < BEAT_SWARM_SECTION_HEADING_MIN_SECTION_BARS) return false;
  if (!isMeaningfulSectionHeadingTransition(p)) return false;
  return true;
}
function handleBeatSwarmMusicSystemEvent(event) {
  if (!active) return;
  const detail = event?.detail && typeof event.detail === 'object' ? event.detail : null;
  if (!detail) return;
  const type = String(detail?.type || '').trim().toLowerCase();
  if (type !== 'music_section_changed') return;
  const payload = detail?.payload && typeof detail.payload === 'object' ? detail.payload : {};
  const nowMs = performance.now();
  if (!shouldShowSectionHeadingForMusicChange(payload, nowMs)) return;
  const sectionId = String(payload?.sectionId || 'default').trim().toLowerCase();
  const sectionCycle = Math.max(0, Math.trunc(Number(payload?.sectionCycle) || 0));
  const energyState = String(payload?.energyState || '').trim().toLowerCase();
  const profile = getSectionPresentationProfile(sectionId, energyState);
  const flavor = resolveSectionHeadingFlavor(sectionId, sectionCycle);
  const title = String(flavor?.title || profile?.title || 'Section Shift').trim() || 'Section Shift';
  const subtitle = String(flavor?.subtitle || profile?.subtitle || '').trim();
  showSectionHeading(title, subtitle, nowMs);
  applySectionStarfieldProfile(profile?.starfield || null, true);
  sectionPresentationRuntime.lastSectionKey = `${sectionId}:${sectionCycle}`;
}
function updateSectionPresentationRuntime(dt = 0) {
  const delta = Math.max(0, Number(dt) || 0);
  if (starfieldSectionRuntime.entryBurstT > 0) {
    starfieldSectionRuntime.entryBurstT = Math.max(0, starfieldSectionRuntime.entryBurstT - delta);
  }
  if ((sectionPresentationRuntime.visibleUntilMs > 0) && performance.now() >= sectionPresentationRuntime.visibleUntilMs) {
    hideSectionHeading();
  }
}
function createEmptyLayerTotals() {
  return {
    foundation: { full: 0, quiet: 0, trace: 0, suppressed: 0 },
    loops: { full: 0, quiet: 0, trace: 0, suppressed: 0 },
    sparkle: { full: 0, quiet: 0, trace: 0, suppressed: 0 },
  };
}
function resetReadabilityMetricsRuntime(barIndex = -1) {
  readabilityMetricsRuntime.barIndex = Math.trunc(Number(barIndex) || -1);
  readabilityMetricsRuntime.steps = 0;
  readabilityMetricsRuntime.playerLikelyAudibleSteps = 0;
  readabilityMetricsRuntime.playerStepEmittedSteps = 0;
  readabilityMetricsRuntime.enemyEvents = 0;
  readabilityMetricsRuntime.enemyForegroundEvents = 0;
  readabilityMetricsRuntime.enemyCompetingDuringPlayer = 0;
  readabilityMetricsRuntime.sameRegisterOverlapDuringPlayer = 0;
  readabilityMetricsRuntime.layerTotals = createEmptyLayerTotals();
  readabilityMetricsRuntime.onboardingPhase = '';
}
function emitReadabilityMetricsSnapshotForBar(barIndex = 0, beatIndex = currentBeatIndex) {
  const bar = Math.max(0, Math.trunc(Number(barIndex) || 0));
  const steps = Math.max(0, Math.trunc(Number(readabilityMetricsRuntime.steps) || 0));
  if (!(steps > 0)) return;
  const playerLikelyAudibleSteps = Math.max(0, Math.trunc(Number(readabilityMetricsRuntime.playerLikelyAudibleSteps) || 0));
  const playerStepEmittedSteps = Math.max(0, Math.trunc(Number(readabilityMetricsRuntime.playerStepEmittedSteps) || 0));
  const enemyCompetingDuringPlayer = Math.max(0, Math.trunc(Number(readabilityMetricsRuntime.enemyCompetingDuringPlayer) || 0));
  const sameRegisterOverlapDuringPlayer = Math.max(0, Math.trunc(Number(readabilityMetricsRuntime.sameRegisterOverlapDuringPlayer) || 0));
  const enemyForegroundEvents = Math.max(0, Math.trunc(Number(readabilityMetricsRuntime.enemyForegroundEvents) || 0));
  const enemyEvents = Math.max(0, Math.trunc(Number(readabilityMetricsRuntime.enemyEvents) || 0));
  const maskingRisk = playerLikelyAudibleSteps > 0 ? (enemyCompetingDuringPlayer / playerLikelyAudibleSteps) : 0;
  const overlapRisk = playerLikelyAudibleSteps > 0 ? (sameRegisterOverlapDuringPlayer / playerLikelyAudibleSteps) : 0;
  const playerAudibleShare = (playerStepEmittedSteps + enemyCompetingDuringPlayer) > 0
    ? (playerStepEmittedSteps / (playerStepEmittedSteps + enemyCompetingDuringPlayer))
    : 1;
  const layer = readabilityMetricsRuntime.layerTotals || createEmptyLayerTotals();
  const foundationAudible = (layer.foundation.full + layer.foundation.quiet + layer.foundation.trace);
  const loopsAudible = (layer.loops.full + layer.loops.quiet + layer.loops.trace);
  const sparkleAudible = (layer.sparkle.full + layer.sparkle.quiet + layer.sparkle.trace);
  const continuityBars = musicLayerRuntime.foundationAnchorBar >= 0
    ? Math.max(1, (bar - musicLayerRuntime.foundationAnchorBar) + 1)
    : 0;
  noteMusicSystemEvent('music_readability_snapshot', {
    onboardingPhase: String(readabilityMetricsRuntime.onboardingPhase || '').trim().toLowerCase(),
    readability: {
      playerMaskingRisk: Number(maskingRisk.toFixed(3)),
      sameRegisterOverlapRisk: Number(overlapRisk.toFixed(3)),
      playerAudibleShare: Number(playerAudibleShare.toFixed(3)),
      enemyForegroundEvents,
      enemyEvents,
      enemyCompetingDuringPlayer,
    },
    structure: {
      foundationContinuityBars: continuityBars,
      foundationAudibleEvents: foundationAudible,
      loopAudibleEvents: loopsAudible,
      sparkleAudibleEvents: sparkleAudible,
      sparkleSuppressedEvents: layer.sparkle.suppressed,
      sectionId: String(composerRuntime.currentSectionId || 'default').trim().toLowerCase(),
    },
    onboarding: {
      knownIdentityCount: onboardingRuntime.identityFirstHeardBar.size,
      recentNovelIdentityCount: getOnboardingRecentNovelIdentityCount(bar, 8),
    },
  }, {
    beatIndex,
    barIndex: bar,
  });
}
function foldStepMetricsIntoReadabilityRuntime(stepResult = null, barIndex = 0, beatIndex = currentBeatIndex) {
  const bar = Math.max(0, Math.trunc(Number(barIndex) || 0));
  if (readabilityMetricsRuntime.barIndex < 0) resetReadabilityMetricsRuntime(bar);
  if (readabilityMetricsRuntime.barIndex !== bar) {
    emitReadabilityMetricsSnapshotForBar(readabilityMetricsRuntime.barIndex, beatIndex);
    resetReadabilityMetricsRuntime(bar);
  }
  readabilityMetricsRuntime.steps += 1;
  const stepStats = stepResult?.readabilityStepStats && typeof stepResult.readabilityStepStats === 'object'
    ? stepResult.readabilityStepStats
    : {};
  if (stepStats.playerLikelyAudible === true) readabilityMetricsRuntime.playerLikelyAudibleSteps += 1;
  if (stepStats.playerStepEmitted === true) readabilityMetricsRuntime.playerStepEmittedSteps += 1;
  readabilityMetricsRuntime.enemyEvents += Math.max(0, Math.trunc(Number(stepStats.enemyEvents) || 0));
  readabilityMetricsRuntime.enemyForegroundEvents += Math.max(0, Math.trunc(Number(stepStats.enemyForegroundEvents) || 0));
  readabilityMetricsRuntime.enemyCompetingDuringPlayer += Math.max(0, Math.trunc(Number(stepStats.enemyCompetingDuringPlayer) || 0));
  readabilityMetricsRuntime.sameRegisterOverlapDuringPlayer += Math.max(0, Math.trunc(Number(stepStats.sameRegisterOverlapDuringPlayer) || 0));
  readabilityMetricsRuntime.onboardingPhase = String(stepResult?.onboardingPhase || readabilityMetricsRuntime.onboardingPhase || '').trim().toLowerCase();
  const layerStep = stepResult?.layerStepStats && typeof stepResult.layerStepStats === 'object'
    ? stepResult.layerStepStats
    : null;
  if (layerStep) {
    for (const key of ['foundation', 'loops', 'sparkle']) {
      const src = layerStep[key] && typeof layerStep[key] === 'object' ? layerStep[key] : null;
      if (!src) continue;
      readabilityMetricsRuntime.layerTotals[key].full += Math.max(0, Math.trunc(Number(src.full) || 0));
      readabilityMetricsRuntime.layerTotals[key].quiet += Math.max(0, Math.trunc(Number(src.quiet) || 0));
      readabilityMetricsRuntime.layerTotals[key].trace += Math.max(0, Math.trunc(Number(src.trace) || 0));
      readabilityMetricsRuntime.layerTotals[key].suppressed += Math.max(0, Math.trunc(Number(src.suppressed) || 0));
    }
  }
}
function chooseSingletonMusicHandoffTarget(sourceEnemy, sourceGroup) {
  const source = sourceEnemy && typeof sourceEnemy === 'object' ? sourceEnemy : null;
  const group = sourceGroup && typeof sourceGroup === 'object' ? sourceGroup : null;
  if (!source || !group) return { targetEnemy: null, compatibleFound: false };
  const sourceId = Math.max(0, Math.trunc(Number(source.id) || 0));
  const sourceType = String(source.enemyType || '').trim().toLowerCase();
  const sourceRole = normalizeSwarmRole(
    group.role || getSwarmRoleForEnemy(source, BEAT_EVENT_ROLES.ACCENT),
    BEAT_EVENT_ROLES.ACCENT
  );
  const isBassSource = sourceRole === BEAT_EVENT_ROLES.BASS;
  if (!(sourceId > 0) || !sourceType) return { targetEnemy: null, compatibleFound: false };
  const sourceX = Number(source.x);
  const sourceY = Number(source.y);
  const style = getSwarmStyleProfile();
  const handoffAggressiveness = clamp01(Number(style?.handoffAggressiveness) || 0.72);
  const candidatesByTier = [[], [], []];
  for (const enemy of enemies) {
    if (!enemy || enemy === source) continue;
    const id = Math.max(0, Math.trunc(Number(enemy.id) || 0));
    if (!(id > 0) || id === sourceId) continue;
    if (enemy.retreating) continue;
    const lifecycleState = normalizeMusicLifecycleState(enemy.lifecycleState || 'active', 'active');
    if (lifecycleState === 'retiring') continue;
    const candidateType = String(enemy.enemyType || '').trim().toLowerCase();
    const candidateRole = normalizeSwarmRole(
      getSwarmRoleForEnemy(enemy, BEAT_EVENT_ROLES.ACCENT),
      BEAT_EVENT_ROLES.ACCENT
    );
    const tier = candidateType === sourceType
      ? 0
      : (candidateRole === sourceRole ? 1 : 2);
    candidatesByTier[tier].push(enemy);
  }
  const candidateList = candidatesByTier.find((list) => Array.isArray(list) && list.length) || [];
  if (!candidateList.length) {
    return {
      targetEnemy: null,
      compatibleFound: false,
      stableBassFound: false,
    };
  }
  const compatibleCandidates = isBassSource
    ? candidateList.filter((candidate) => isCompatibleBassHandoffCandidate(source, group, candidate))
    : [];
  const searchList = compatibleCandidates.length ? compatibleCandidates : candidateList;
  let stableBassFound = false;
  let best = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const candidate of searchList) {
    const cx = Number(candidate.x);
    const cy = Number(candidate.y);
    const dist = (Number.isFinite(sourceX) && Number.isFinite(sourceY) && Number.isFinite(cx) && Number.isFinite(cy))
      ? Math.hypot(cx - sourceX, cy - sourceY)
      : 9999;
    const lifecycleState = normalizeMusicLifecycleState(candidate.lifecycleState || 'active', 'active');
    const lifecyclePenalty = lifecycleState === 'inactiveForScheduling' ? (360 * (1 - handoffAggressiveness)) : 0;
    const hp = Math.max(0, Number(candidate?.hp) || 0);
    const maxHp = Math.max(1, Number(candidate?.maxHp) || hp || 1);
    const hpRatio = Math.max(0, Math.min(1, hp / maxHp));
    const lowHpPenalty = isBassSource
      ? (hpRatio < 0.35 ? 720 : (hpRatio < 0.55 ? 280 : 0))
      : 0;
    const unstableBassPenalty = isBassSource
      ? ((candidate?.retreating || lifecycleState !== 'active') ? 1200 : 0)
      : 0;
    const score = dist + lifecyclePenalty + lowHpPenalty + unstableBassPenalty;
    if (isBassSource && !candidate?.retreating && lifecycleState === 'active' && hpRatio >= 0.55) {
      stableBassFound = true;
    }
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return {
    targetEnemy: best,
    compatibleFound: !isBassSource || compatibleCandidates.length > 0,
    stableBassFound,
  };
}
function tryHandoffSingletonMusicGroup(sourceEnemy, reason = 'unknown', context = null) {
  const source = sourceEnemy && typeof sourceEnemy === 'object' ? sourceEnemy : null;
  if (!source) return { attempted: false, success: false, reason: 'no_source' };
  const sourceId = Math.max(0, Math.trunc(Number(source.id) || 0));
  if (!(sourceId > 0)) return { attempted: false, success: false, reason: 'invalid_source' };
  const sourceGroup = singletonEnemyMusicGroups.get(sourceId) || null;
  if (!sourceGroup) return { attempted: false, success: false, reason: 'no_group' };
  const sourceType = String(source.enemyType || sourceGroup.enemyType || '').trim().toLowerCase();
  if (sourceType === 'composer-group-member') return { attempted: false, success: false, reason: 'group_member' };
  const handoffReason = String(reason || 'unknown').trim().toLowerCase() || 'unknown';
  if (
    handoffReason === 'mode_exit_clear'
    || handoffReason === 'director_cleanup'
    || handoffReason === 'section_change_cleanup'
    || handoffReason === 'restore_overflow'
  ) {
    return { attempted: false, success: false, reason: 'reason_not_eligible' };
  }
  const beatIndex = Math.max(0, Math.trunc(Number(context?.beatIndex) || Number(currentBeatIndex) || 0));
  const stepIndex = Math.max(0, Math.trunc(Number(context?.stepIndex) || Number(ensureSwarmDirector().getSnapshot()?.stepIndex) || 0));
  const continuityId = String(sourceGroup.continuityId || source.musicContinuityId || '').trim() || getNextMusicContinuityId();
  const sourceVisual = getEnemyVisualIdentitySnapshot(source);
  const sourceRole = normalizeSwarmRole(
    sourceGroup.role || getSwarmRoleForEnemy(source, BEAT_EVENT_ROLES.LEAD),
    BEAT_EVENT_ROLES.LEAD
  );
  const isBassSource = sourceRole === BEAT_EVENT_ROLES.BASS;
  if (isBassSource) {
    try {
      if (!bassFoundationOwnerRuntime.active || isBassFoundationOwnerEnemy(sourceId)) {
        assignBassFoundationOwner(source, sourceGroup, { beatIndex, stepIndex, ...context });
      }
    } catch {}
  }
  const phraseState = clonePhraseState(sourceGroup.phraseState)
    || buildFallbackPhraseStateForHandoff(sourceGroup, beatIndex, stepIndex, continuityId);
  const sourceActionType = String(sourceGroup.actionType || '').trim().toLowerCase();
  const startedPayload = {
    sourceEnemyId: sourceId,
    sourceEnemyType: sourceType,
    sourceGroupId: Math.max(0, Math.trunc(Number(sourceGroup.id) || 0)),
    continuityId,
    laneRole: sourceRole,
    actionType: sourceActionType,
    phraseStep: Math.max(0, Math.trunc(Number(phraseState?.stepIndex) || stepIndex)),
    phraseIndex: Math.max(0, Math.trunc(Number(phraseState?.phraseIndex) || 0)),
    barOffset: Math.max(0, Math.trunc(Number(phraseState?.barOffset) || 0)),
    subdivisionPhase: Math.max(0, Math.trunc(Number(phraseState?.subdivisionPhase) || 0)),
    loopIdentity: String(phraseState?.loopIdentity || continuityId).trim().toLowerCase(),
    barPosition: Math.floor(beatIndex / Math.max(1, COMPOSER_BEATS_PER_BAR)),
    reason: handoffReason,
  };
  noteMusicSystemEvent('music_handoff_started', startedPayload, { beatIndex, stepIndex, ...context });
  const handoffTarget = chooseSingletonMusicHandoffTarget(source, sourceGroup);
  let targetEnemy = handoffTarget?.targetEnemy || null;
  let compatibleReceiverFound = handoffTarget?.compatibleFound !== false;
  if (isBassSource && !compatibleReceiverFound) {
    // Never move bass foundation onto an incompatible live enemy; spawn an immediate replacement instead.
    targetEnemy = null;
  }
  if (isBassSource) {
    // Bass is the foundation: always hand off onto a freshly spawned receiver to avoid fragile live-target transfers.
    targetEnemy = null;
  }
  if (!targetEnemy && isBassSource) {
    const emergencyProfileInstrument = sourceGroup.instrumentId || source?.spawnerInstrument || source?.drawsnakeInstrument || resolveSwarmSoundInstrumentId('projectile') || 'tone';
    if (sourceType === 'spawner') {
      targetEnemy = spawnSpawnerEnemyOffscreen({
        role: sourceRole || BEAT_EVENT_ROLES.BASS,
        profile: {
          steps: Array.isArray(sourceGroup.steps) ? sourceGroup.steps.slice(0, 8) : null,
          noteIndices: Array.isArray(source?.spawnerNoteIndices) ? source.spawnerNoteIndices.slice(0, 8) : null,
          notePalette: Array.isArray(source?.spawnerNotePalette) ? source.spawnerNotePalette.slice() : null,
          baseNoteName: sourceGroup.note || source?.spawnerNoteName || 'C4',
          instrument: emergencyProfileInstrument,
        },
        motifScopeKey: String(source?.motifScopeKey || 'handoff').trim(),
      }) || null;
    } else if (sourceType === 'drawsnake') {
      const fallbackFoundationSteps = getFoundationLaneSnapshot(stepIndex, Math.floor(stepIndex / Math.max(1, COMPOSER_BEATS_PER_BAR))).steps;
      targetEnemy = spawnDrawSnakeEnemyOffscreen({
        role: sourceRole || BEAT_EVENT_ROLES.BASS,
        profile: {
          steps: Array.isArray(sourceGroup.steps) ? sourceGroup.steps.slice(0, WEAPON_TUNE_STEPS) : fallbackFoundationSteps,
          rows: Array.isArray(sourceGroup.rows) ? sourceGroup.rows.slice(0, WEAPON_TUNE_STEPS) : Array.from({ length: WEAPON_TUNE_STEPS }, () => 1),
          instrument: emergencyProfileInstrument,
          lineWidthPx: Math.max(2, Number(source?.drawsnakeLineWidthPx) || DRAW_SNAKE_LINE_WIDTH_PX_FALLBACK),
        },
      }) || null;
    } else {
      targetEnemy = spawnSpawnerEnemyOffscreen({
        role: sourceRole || BEAT_EVENT_ROLES.BASS,
        profile: {
          steps: Array.isArray(sourceGroup.steps) ? sourceGroup.steps.slice(0, 8) : null,
          noteIndices: Array.isArray(source?.spawnerNoteIndices) ? source.spawnerNoteIndices.slice(0, 8) : null,
          notePalette: Array.isArray(source?.spawnerNotePalette) ? source.spawnerNotePalette.slice() : null,
          baseNoteName: sourceGroup.note || source?.spawnerNoteName || 'C4',
          instrument: emergencyProfileInstrument,
        },
        motifScopeKey: String(source?.motifScopeKey || 'handoff').trim(),
      }) || null;
    }
    if (targetEnemy) {
      compatibleReceiverFound = isCompatibleBassHandoffCandidate(source, sourceGroup, targetEnemy);
      noteMusicSystemEvent('music_handoff_emergency_receiver_spawned', {
        ...startedPayload,
        targetEnemyId: Math.max(0, Math.trunc(Number(targetEnemy.id) || 0)),
        targetEnemyType: String(targetEnemy?.enemyType || '').trim().toLowerCase(),
      }, { beatIndex, stepIndex, ...context });
    }
  }
  if (sourceType === 'dumb') {
    const targetTypeNow = String(targetEnemy?.enemyType || '').trim().toLowerCase();
    if (!targetEnemy || targetTypeNow !== 'dumb') {
      const fallbackPoint = getRandomOffscreenSpawnPoint();
      const spawnedDumb = fallbackPoint && Number.isFinite(fallbackPoint.x) && Number.isFinite(fallbackPoint.y)
        ? spawnEnemyAt(fallbackPoint.x, fallbackPoint.y)
        : null;
      if (spawnedDumb) {
        targetEnemy = spawnedDumb;
        compatibleReceiverFound = true;
        noteMusicSystemEvent('music_handoff_emergency_receiver_spawned', {
          ...startedPayload,
          targetEnemyId: Math.max(0, Math.trunc(Number(targetEnemy.id) || 0)),
          targetEnemyType: String(targetEnemy?.enemyType || '').trim().toLowerCase(),
        }, { beatIndex, stepIndex, ...context });
      }
    }
  }
  if (!targetEnemy) {
    noteMusicSystemEvent('music_handoff_failed', { ...startedPayload, failureReason: 'no_candidate' }, { beatIndex, stepIndex, ...context });
    if (!isBassSource) {
      noteMusicSystemEvent('music_handoff_reset_phrase', { ...startedPayload, failureReason: 'no_candidate' }, { beatIndex, stepIndex, ...context });
    }
    if (isBassSource) {
      clearBassFoundationOwnerIfMatches(sourceId, 'no_compatible_receiver', { beatIndex, stepIndex, ...context });
    }
    return { attempted: true, success: false, reason: 'no_candidate' };
  }
  const bassCompatibleFallback = isBassSource && isCompatibleBassHandoffCandidate(source, sourceGroup, targetEnemy);
  if (isBassSource && !compatibleReceiverFound && !bassCompatibleFallback) {
    noteMusicSystemEvent('music_handoff_compatible_receiver_missing', startedPayload, { beatIndex, stepIndex, ...context });
  }
  const targetType = String(targetEnemy.enemyType || '').trim().toLowerCase();
  const targetDefaultActionType = String(getDefaultActionTypeForEnemyGroup(targetType)).trim().toLowerCase();
  const handoffActionType = (targetType && targetType !== sourceType)
    ? targetDefaultActionType
    : (sourceActionType || targetDefaultActionType);
  if (phraseState) {
    phraseState.actionType = handoffActionType;
  }
  const targetGroup = ensureSingletonMusicGroupForEnemy(targetEnemy, {
    role: sourceGroup.role,
    actionType: handoffActionType,
    note: sourceGroup.note,
    instrumentId: sourceGroup.instrumentId,
    forceInstrumentIdentity: true,
    steps: Array.isArray(sourceGroup.steps) ? sourceGroup.steps.slice() : null,
    rows: Array.isArray(sourceGroup.rows) ? sourceGroup.rows.slice() : null,
    lifecycleState: targetEnemy.lifecycleState || 'active',
    continuityId,
    phraseState: phraseState || {
      beatIndex,
      stepIndex,
      barIndex: Math.floor(beatIndex / Math.max(1, COMPOSER_BEATS_PER_BAR)),
      phraseIndex: Math.floor(stepIndex / Math.max(1, WEAPON_TUNE_STEPS)),
      barOffset: beatIndex % Math.max(1, COMPOSER_BEATS_PER_BAR),
      subdivisionPhase: stepIndex % Math.max(1, WEAPON_TUNE_STEPS),
      loopLengthSteps: Math.max(1, WEAPON_TUNE_STEPS),
      loopIdentity: String(continuityId || '').trim().toLowerCase(),
      role: normalizeSwarmRole(sourceGroup.role || '', ''),
      note: normalizeSwarmNoteName(sourceGroup.note || ''),
      actionType: handoffActionType,
      updatedAtMs: Number(performance?.now?.() || 0),
    },
  });
  if (!targetGroup) {
    noteMusicSystemEvent('music_handoff_failed', { ...startedPayload, failureReason: 'target_group_create_failed' }, { beatIndex, stepIndex, ...context });
    if (!isBassSource) {
      noteMusicSystemEvent('music_handoff_reset_phrase', { ...startedPayload, failureReason: 'target_group_create_failed' }, { beatIndex, stepIndex, ...context });
    }
    if (isBassSource) {
      clearBassFoundationOwnerIfMatches(sourceId, 'target_group_create_failed', { beatIndex, stepIndex, ...context });
    }
    return { attempted: true, success: false, reason: 'target_group_create_failed' };
  }
  if (isBassSource) {
    transferBassFoundationOwnerTo(targetEnemy, targetGroup, { beatIndex, stepIndex, ...context });
  }
  syncSingletonEnemyStateFromMusicGroup(targetEnemy, targetGroup);
  pulseEnemyMusicalRoleVisual(source, 'soft');
  pulseEnemyMusicalRoleVisual(targetEnemy, 'strong');
  const targetVisual = getEnemyVisualIdentitySnapshot(targetEnemy);
  const visualFailureReasons = [];
  if (!sourceVisual || !String(sourceVisual?.continuityId || '').trim()) {
    visualFailureReasons.push('source_visual_missing');
  }
  if (!targetVisual || !String(targetVisual?.continuityId || '').trim()) {
    visualFailureReasons.push('target_visual_missing');
  } else {
    if (String(targetVisual.continuityId || '').trim() !== continuityId) visualFailureReasons.push('continuity_id_mismatch');
    if (sourceVisual) {
      const sourceColor = String(sourceVisual.color || '').trim().toLowerCase();
      const targetColor = String(targetVisual.color || '').trim().toLowerCase();
      if (sourceColor && targetColor && sourceColor !== targetColor) visualFailureReasons.push('role_color_mismatch');
      if (sourceVisual.lane && targetVisual.lane && sourceVisual.lane !== targetVisual.lane) visualFailureReasons.push('lane_mismatch');
    }
  }
  try {
    targetEnemy.__bsLastSpawnerNote = sourceEnemy?.__bsLastSpawnerNote || targetEnemy.__bsLastSpawnerNote;
    targetEnemy.__bsLastDrawsnakeNote = sourceEnemy?.__bsLastDrawsnakeNote || targetEnemy.__bsLastDrawsnakeNote;
    targetEnemy.__bsLastDrawsnakeRow = Number.isFinite(sourceEnemy?.__bsLastDrawsnakeRow)
      ? sourceEnemy.__bsLastDrawsnakeRow
      : targetEnemy.__bsLastDrawsnakeRow;
  } catch {}
  const resultPayload = {
    ...startedPayload,
    targetEnemyId: Math.max(0, Math.trunc(Number(targetEnemy.id) || 0)),
    targetEnemyType: String(targetEnemy.enemyType || '').trim().toLowerCase(),
    targetGroupId: Math.max(0, Math.trunc(Number(targetGroup.id) || 0)),
    targetActionType: handoffActionType,
    laneRole: sourceRole,
  };
  if (visualFailureReasons.length) {
    noteMusicSystemEvent('music_handoff_visual_continuity_failed', {
      ...resultPayload,
      visualFailureReasons: visualFailureReasons.slice(),
      sourceVisualId: String(sourceVisual?.visualId || '').trim().toLowerCase(),
      targetVisualId: String(targetVisual?.visualId || '').trim().toLowerCase(),
    }, { beatIndex, stepIndex, ...context });
  }
  const phraseContinuityPreserved = isBassSource
    ? true
    : (!!phraseState && (!isBassSource || compatibleReceiverFound || bassCompatibleFallback));
  noteMusicSystemEvent('music_handoff_completed', {
    ...resultPayload,
    handoffSuccess: phraseContinuityPreserved,
    handoffReset: !phraseContinuityPreserved,
  }, { beatIndex, stepIndex, ...context });
  noteMusicSystemEvent(
    phraseContinuityPreserved ? 'music_handoff_inherited_phrase' : 'music_handoff_reset_phrase',
    {
      ...resultPayload,
      handoffSuccess: phraseContinuityPreserved,
      handoffReset: !phraseContinuityPreserved,
    },
    { beatIndex, stepIndex, ...context }
  );
  return {
    attempted: true,
    success: phraseContinuityPreserved,
    reset: !phraseContinuityPreserved,
    sourceGroup,
    targetGroup,
    targetEnemy,
  };
}
function tryTransferBassFoundationOwnerWithinComposerGroup(sourceEnemy, reason = 'unknown', context = null) {
  const source = sourceEnemy && typeof sourceEnemy === 'object' ? sourceEnemy : null;
  if (!source) return { attempted: false, success: false, reason: 'no_source' };
  const sourceId = Math.max(0, Math.trunc(Number(source?.id) || 0));
  if (!(sourceId > 0) || !isBassFoundationOwnerEnemy(sourceId)) return { attempted: false, success: false, reason: 'not_owner' };
  if (String(source?.enemyType || '').trim().toLowerCase() !== 'composer-group-member') return { attempted: false, success: false, reason: 'not_group_member' };
  const composerGroupId = Math.max(0, Math.trunc(Number(source?.composerGroupId) || 0));
  if (!(composerGroupId > 0)) return { attempted: false, success: false, reason: 'no_group_id' };
  const group = composerEnemyGroups.find((g) => Math.max(0, Math.trunc(Number(g?.id) || 0)) === composerGroupId) || null;
  if (!group) return { attempted: false, success: false, reason: 'group_missing' };
  if (normalizeSwarmRole(group?.role || '', BEAT_EVENT_ROLES.ACCENT) !== BEAT_EVENT_ROLES.BASS) {
    return { attempted: false, success: false, reason: 'not_bass_group' };
  }
  const candidates = enemies
    .filter((enemy) => (
      enemy
      && enemy !== source
      && !enemy.retreating
      && String(enemy?.enemyType || '').trim().toLowerCase() === 'composer-group-member'
      && Math.max(0, Math.trunc(Number(enemy?.composerGroupId) || 0)) === composerGroupId
    ))
    .sort((a, b) => (Number(b?.hp) || 0) - (Number(a?.hp) || 0));
  const targetEnemy = candidates[0] || null;
  if (!targetEnemy) return { attempted: false, success: false, reason: 'no_receiver' };
  const beatIndex = Math.max(0, Math.trunc(Number(context?.beatIndex) || Number(currentBeatIndex) || 0));
  const stepIndex = Math.max(0, Math.trunc(Number(context?.stepIndex) || Number(ensureSwarmDirector().getSnapshot()?.stepIndex) || 0));
  const continuityId = String(group?.continuityId || source?.musicContinuityId || '').trim() || getNextMusicContinuityId();
  const payload = {
    sourceEnemyId: sourceId,
    sourceEnemyType: 'composer-group-member',
    sourceGroupId: composerGroupId,
    continuityId,
    laneRole: BEAT_EVENT_ROLES.BASS,
    actionType: String(group?.actionType || 'composer-group-projectile').trim().toLowerCase(),
    phraseStep: Math.max(0, Math.trunc(Number(group?.phraseState?.stepIndex) || stepIndex)),
    phraseIndex: Math.max(0, Math.trunc(Number(group?.phraseState?.phraseIndex) || 0)),
    barOffset: Math.max(0, Math.trunc(Number(group?.phraseState?.barOffset) || 0)),
    subdivisionPhase: Math.max(0, Math.trunc(Number(group?.phraseState?.subdivisionPhase) || 0)),
    loopIdentity: String(group?.phraseState?.loopIdentity || bassFoundationOwnerRuntime.loopIdentity || continuityId).trim().toLowerCase(),
    barPosition: Math.floor(beatIndex / Math.max(1, COMPOSER_BEATS_PER_BAR)),
    reason: String(reason || 'unknown').trim().toLowerCase() || 'unknown',
    targetEnemyId: Math.max(0, Math.trunc(Number(targetEnemy?.id) || 0)),
    targetEnemyType: 'composer-group-member',
    targetGroupId: composerGroupId,
    targetActionType: String(group?.actionType || 'composer-group-projectile').trim().toLowerCase(),
  };
  noteMusicSystemEvent('music_handoff_started', payload, { beatIndex, stepIndex, ...context });
  transferBassFoundationOwnerTo(targetEnemy, group, { beatIndex, stepIndex, ...context });
  noteMusicSystemEvent('music_handoff_completed', {
    ...payload,
    handoffSuccess: true,
    handoffReset: false,
  }, { beatIndex, stepIndex, ...context });
  noteMusicSystemEvent('music_handoff_inherited_phrase', {
    ...payload,
    handoffSuccess: true,
    handoffReset: false,
  }, { beatIndex, stepIndex, ...context });
  return {
    attempted: true,
    success: true,
    reset: false,
    sourceGroup: group,
    targetGroup: group,
    targetEnemy,
  };
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
function getSwarmStyleProfile() {
  return getBeatSwarmStyleProfile(BEAT_SWARM_STYLE_ID);
}
function getSwarmStyleId() {
  return String(getSwarmStyleProfile()?.id || BEAT_SWARM_STYLE_ID).trim().toLowerCase() || 'retro_shooter';
}
function getPlayerInstrumentStepDirective(stepIndex, beatIndex) {
  const style = getSwarmStyleProfile();
  return playerInstrumentRuntime.getStepDirective(stepIndex, beatIndex, style);
}
function getEnergyStateThemePreset(stateName = '') {
  const key = String(stateName || getCurrentSwarmEnergyStateName()).trim().toLowerCase();
  const base = DIRECTOR_STATE_THEME_CONFIG[key] || DIRECTOR_STATE_THEME_CONFIG.intro;
  const style = getSwarmStyleProfile();
  if (getSwarmStyleId() !== 'retro_shooter') return base;
  const maxUnique = Math.max(1, Math.trunc(Number(style?.notePoolMaxUnique) || 4));
  const basePool = Array.isArray(base?.notePool) ? base.notePool : SWARM_PENTATONIC_NOTES_ONE_OCTAVE;
  const notePool = basePool.slice(0, Math.min(basePool.length, maxUnique));
  return {
    ...base,
    notePool: notePool.length ? notePool : SWARM_PENTATONIC_NOTES_ONE_OCTAVE.slice(0, maxUnique),
  };
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
function cloneFoundationPhraseSteps(stepsLike = null) {
  const lib = Array.isArray(stepsLike) && stepsLike.length ? stepsLike : Array(WEAPON_TUNE_STEPS).fill(false);
  return createStepPattern(lib, WEAPON_TUNE_STEPS);
}
function getFoundationLanePhraseLibrary() {
  return Array.isArray(FOUNDATION_LANE_PHRASE_LIBRARY) && FOUNDATION_LANE_PHRASE_LIBRARY.length
    ? FOUNDATION_LANE_PHRASE_LIBRARY
    : [{ id: 'foundation_fallback', steps: [true, false, false, true, false, true, false, false] }];
}
function setFoundationLanePhrase(phraseLike = null, barIndex = 0) {
  const phrase = phraseLike && typeof phraseLike === 'object' ? phraseLike : null;
  const safeBar = Math.max(0, Math.trunc(Number(barIndex) || 0));
  const steps = cloneFoundationPhraseSteps(phrase?.steps);
  const nextPhraseId = String(phrase?.id || 'foundation_fallback').trim().toLowerCase() || 'foundation_fallback';
  const prevPhraseId = String(musicLayerRuntime.foundationPhraseId || '').trim().toLowerCase();
  const changed = !!prevPhraseId && prevPhraseId !== nextPhraseId;
  musicLayerRuntime.foundationLaneId = 'foundation_lane';
  musicLayerRuntime.foundationPhraseId = nextPhraseId;
  musicLayerRuntime.foundationPhraseSteps = steps;
  musicLayerRuntime.foundationPhraseStartBar = safeBar;
  musicLayerRuntime.foundationPhraseLockedUntilBar = safeBar + 3;
  if (changed) {
    musicLayerRuntime.foundationPatternChangeCount = Math.max(
      0,
      Math.trunc(Number(musicLayerRuntime.foundationPatternChangeCount) || 0)
    ) + 1;
  }
  const foundationLane = getMusicLaneRuntimeEntry('foundation_lane');
  if (foundationLane) {
    foundationLane.phraseId = nextPhraseId;
    if (!(foundationLane.activeSinceBar >= 0)) foundationLane.activeSinceBar = safeBar;
    foundationLane.lastAssignedBar = safeBar;
    foundationLane.lifetimeBars = foundationLane.activeSinceBar >= 0 ? Math.max(1, (safeBar - foundationLane.activeSinceBar) + 1) : 0;
  }
  return {
    laneId: musicLayerRuntime.foundationLaneId,
    phraseId: nextPhraseId,
    steps: steps.slice(),
    startBar: safeBar,
    lockedUntilBar: musicLayerRuntime.foundationPhraseLockedUntilBar,
  };
}
function ensureFoundationLanePlan(barIndex = 0, options = null) {
  const bar = Math.max(0, Math.trunc(Number(barIndex) || 0));
  const opts = options && typeof options === 'object' ? options : {};
  const currentSteps = cloneFoundationPhraseSteps(musicLayerRuntime.foundationPhraseSteps);
  const currentPhraseId = String(musicLayerRuntime.foundationPhraseId || '').trim().toLowerCase();
  const lockedUntilBar = Math.max(-1, Math.trunc(Number(musicLayerRuntime.foundationPhraseLockedUntilBar) || -1));
  if (currentPhraseId && currentSteps.some(Boolean) && !opts.forceRefresh && bar <= lockedUntilBar) {
    return {
      laneId: String(musicLayerRuntime.foundationLaneId || 'foundation_lane'),
      phraseId: currentPhraseId,
      steps: currentSteps,
      startBar: Math.max(0, Math.trunc(Number(musicLayerRuntime.foundationPhraseStartBar) || 0)),
      lockedUntilBar,
    };
  }
  const library = getFoundationLanePhraseLibrary();
  const currentSectionId = String(composerRuntime.currentSectionId || 'default').trim().toLowerCase() || 'default';
  const currentCycle = Math.max(0, Math.trunc(Number(composerRuntime.currentCycle) || 0));
  let phrase = library[0];
  if (library.length > 1) {
    const seed = hashStringSeed(`foundation-lane|${currentSectionId}|${currentCycle}|${bar}`);
    const candidates = library.filter((entry) => String(entry?.id || '').trim().toLowerCase() !== currentPhraseId);
    const pool = candidates.length ? candidates : library;
    const idx = Math.max(0, Math.floor(seededNoise01(seed) * pool.length)) % pool.length;
    phrase = pool[idx] || pool[0] || library[0];
  }
  return setFoundationLanePhrase(phrase, bar);
}
function getFoundationLaneSnapshot(stepIndex = 0, barIndex = 0) {
  const plan = ensureFoundationLanePlan(barIndex);
  const steps = cloneFoundationPhraseSteps(plan?.steps);
  const step = Math.max(0, Math.trunc(Number(stepIndex) || 0));
  const localStep = ((step % WEAPON_TUNE_STEPS) + WEAPON_TUNE_STEPS) % WEAPON_TUNE_STEPS;
  return {
    laneId: String(plan?.laneId || 'foundation_lane'),
    phraseId: String(plan?.phraseId || 'foundation_fallback').trim().toLowerCase() || 'foundation_fallback',
    steps,
    stepIndex: localStep,
    isActiveStep: !!steps[localStep],
    patternKey: steps.map((v) => (v ? '1' : '0')).join(''),
    startBar: Math.max(0, Math.trunc(Number(plan?.startBar) || 0)),
    lockedUntilBar: Math.max(0, Math.trunc(Number(plan?.lockedUntilBar) || 0)),
  };
}
function applyFoundationLaneToPerformer(enemyLike = null, groupLike = null, context = null) {
  const enemy = enemyLike && typeof enemyLike === 'object' ? enemyLike : null;
  const group = groupLike && typeof groupLike === 'object' ? groupLike : null;
  if (!enemy || !group) return null;
  const role = normalizeSwarmRole(group.role || getSwarmRoleForEnemy(enemy, BEAT_EVENT_ROLES.ACCENT), BEAT_EVENT_ROLES.ACCENT);
  if (role !== BEAT_EVENT_ROLES.BASS) return null;
  const beatIndex = Math.max(0, Math.trunc(Number(context?.beatIndex) || Number(currentBeatIndex) || 0));
  const barIndex = Math.max(0, Math.trunc(Number(context?.barIndex) || Math.floor(beatIndex / Math.max(1, COMPOSER_BEATS_PER_BAR))));
  const lane = getFoundationLaneSnapshot(Math.max(0, Math.trunc(Number(context?.stepIndex) || beatIndex)), barIndex);
  const steps = lane.steps.slice(0, WEAPON_TUNE_STEPS);
  group.steps = steps.slice();
  group.foundationLaneId = lane.laneId;
  group.foundationPhraseId = lane.phraseId;
  group.foundationPatternKey = lane.patternKey;
  enemy.foundationLaneId = lane.laneId;
  enemy.foundationPhraseId = lane.phraseId;
  enemy.foundationPatternKey = lane.patternKey;
  if (String(enemy.enemyType || '').trim().toLowerCase() === 'drawsnake') {
    enemy.drawsnakeSteps = steps.slice();
  }
  if (String(enemy.enemyType || '').trim().toLowerCase() === 'spawner') {
    enemy.spawnerSteps = steps.slice(0, 8);
  }
  assignMusicLaneIdentity({
    group,
    enemy,
    role,
    layer: 'foundation',
    instrumentId: String(group?.instrumentId || enemy?.musicInstrumentId || '').trim(),
    continuityId: String(group?.continuityId || enemy?.musicContinuityId || '').trim(),
    phraseId: lane.phraseId,
    performerEnemyId: Math.trunc(Number(enemy?.id) || 0),
    performerGroupId: Math.trunc(Number(group?.id) || 0),
    performerType: 'foundation-performer',
    barIndex,
  });
  return lane;
}
function updateComposerMotifEpochForBeat(beatIndex = currentBeatIndex) {
  const bar = Math.max(0, Math.floor(Math.max(0, Math.trunc(Number(beatIndex) || 0)) / Math.max(1, COMPOSER_BEATS_PER_BAR)));
  const style = getSwarmStyleProfile();
  const persistenceBars = Math.max(1, Math.trunc(Number(style?.patternPersistenceBars) || COMPOSER_MOTIF_LOCK_BARS || 8));
  const epochBars = Math.max(4, Math.max(Math.trunc(Number(COMPOSER_MOTIF_EPOCH_BARS) || 24), persistenceBars * 2));
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
  const style = getSwarmStyleProfile();
  const lockBars = Math.max(
    1,
    Math.max(
      Math.trunc(Number(COMPOSER_MOTIF_LOCK_BARS) || 8),
      Math.trunc(Number(style?.patternPersistenceBars) || 8)
    )
  );
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
const {
  isEnemyDeathSoundEventKey,
  resolveEnemyDeathEventKey,
  resolveInstrumentIdOrFallback,
  resolveSwarmRoleInstrumentId,
  resolveSwarmSoundInstrumentId,
} = createBeatSwarmSoundRoutingTools({
  getAllIds,
  getIdForDisplayName,
  normalizeInstrumentIdToken,
  normalizeSwarmRole,
  normalizeEnemyDeathFamily,
  sanitizeEnemyMusicInstrumentId,
  resolveRoleInstrument: (role, fallbackId) => swarmPaletteRuntime.resolveRoleInstrument(role, fallbackId),
  swarmSoundEvents: SWARM_SOUND_EVENTS,
  swarmEnemyDeathEventKeyByFamily: SWARM_ENEMY_DEATH_EVENT_KEY_BY_FAMILY,
  swarmSoundInstrumentCache,
  beatEventRoles: BEAT_EVENT_ROLES,
});
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
function renderComponentPreviewMarkup(componentDef) {
  return renderComponentPreviewMarkupRuntime(componentDef);
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
  return createComponentMiniNodeRuntime({ className, parent });
}
function fireComponentLivePreview(state) {
  fireComponentLivePreviewRuntime({
    state,
    constants: {
      previewProjectileSplitAngleRad: PREVIEW_PROJECTILE_SPLIT_ANGLE_RAD,
    },
    helpers: {
      createComponentMiniNode: ({ className, parent }) => createComponentMiniNode(className, parent),
      normalizeDir,
      pulseHitFlash,
    },
  });
}
function updateComponentLivePreviewState(state, dt) {
  updateComponentLivePreviewStateRuntime({
    state,
    dt,
    constants: {
      projectileBoomerangSpinMult: PROJECTILE_BOOMERANG_SPIN_MULT,
      previewProjectileSplitAngleRad: PREVIEW_PROJECTILE_SPLIT_ANGLE_RAD,
    },
    helpers: {
      createComponentMiniNode: ({ className, parent }) => createComponentMiniNode(className, parent),
      getPausePreviewBeatLen,
      normalizeDir,
      pulseHitFlash,
    },
  });
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
    let variant = String(raw?.variant || '').trim();
    if (archetype === 'helper') {
      const token = variant.toLowerCase().replace(/[\s_]+/g, '-');
      if (!token) {
        variant = 'turret';
      } else if (token === 'orbital' || token === 'drone' || token === 'orbitaldrone' || token === 'orbital-drone') {
        variant = 'orbital-drone';
      } else if (token === 'turret' || token === 'sentry' || token === 'mini-turret' || token === 'turret-drone') {
        variant = 'turret';
      }
    }
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
  for (const ev of pendingWeaponChainEvents) {
    noteMusicSystemEvent('weapon_explosion_queue_cleared', {
      chainEventId: Math.trunc(Number(ev?.eventId) || 0),
      weaponSlotIndex: Math.trunc(Number(ev?.context?.weaponSlotIndex) || -1),
      impactEnemyId: Math.trunc(Number(ev?.context?.impactEnemyId) || 0),
      scheduledBeatIndex: Math.trunc(Number(ev?.beatIndex) || 0),
      reason: 'clear_all',
    }, { beatIndex: Math.trunc(Number(ev?.beatIndex) || Number(currentBeatIndex) || 0), stepIndex: 0 });
    if (Number.isFinite(ev?.eventId)) removeExplosionPrimeEffectsForEvent(Math.trunc(ev.eventId));
  }
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
  const style = getSwarmStyleProfile();
  const minSectionBars = Math.max(1, Math.trunc(Number(style?.sectionMinDuration) || 1));
  const sectionBeats = sections.map((s) => Math.max(minSectionBars, Math.trunc(Number(s?.bars) || 1)) * beatsPerBar);
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
  const barIndex = Math.floor(Math.max(0, Math.trunc(Number(beatIndex) || 0)) / Math.max(1, COMPOSER_BEATS_PER_BAR));
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
    composerRuntime.lastDeferredSectionKey = '';
    composerRuntime.lastDeferredSectionBar = -1;
    if (!(composerRuntime.lastSectionChangeBar >= 0)) composerRuntime.lastSectionChangeBar = barIndex;
    composerRuntime.lastSectionGameplayState = collectComposerGameplayStateSnapshot();
    return;
  }
  const section = getComposerSectionForBeat(beatIndex);
  const key = `${section.id}:${section.cycle}`;
  const energyStateName = String(ensureSwarmDirector().getSnapshot()?.energyState || 'intro');
  const arrangementKey = key;
  const sectionMinBars = Math.max(1, Math.trunc(Number(SECTION_PACING_POLICY.sectionMinBars) || 8));
  const sectionChangeRequiresStableFoundation = SECTION_PACING_POLICY.sectionChangeRequiresStableFoundation !== false;
  const prevSectionId = String(composerRuntime.currentSectionId || '').trim().toLowerCase() || 'default';
  const prevCycle = Math.max(0, Math.trunc(Number(composerRuntime.currentCycle) || 0));
  const previousSectionChangeBar = Math.max(-1, Math.trunc(Number(composerRuntime.lastSectionChangeBar) || -1));
  const previousDirective = composerRuntime.currentDirective || getComposerDefaultDirective();
  const foundationAnchorBar = Math.max(-1, Math.trunc(Number(musicLayerRuntime.foundationAnchorBar) || -1));
  const foundationLastBar = Math.max(-1, Math.trunc(Number(musicLayerRuntime.lastFoundationBar) || -1));
  const foundationIdentityKey = String(musicLayerRuntime.foundationIdentityKey || '').trim().toLowerCase();
  const foundationContinuityBars = foundationAnchorBar >= 0
    ? Math.max(1, (barIndex - foundationAnchorBar) + 1)
    : 0;
  const foundationMinBars = Math.max(1, Math.trunc(Number(MUSIC_LAYER_POLICY.foundationMinBars) || 1));
  const foundationStableMinBars = Math.max(1, Math.min(sectionMinBars, foundationMinBars));
  const foundationRecentlyAudible = foundationLastBar >= 0 && (barIndex - foundationLastBar) <= 1;
  const foundationStable = foundationContinuityBars >= foundationStableMinBars
    && foundationRecentlyAudible
    && !!foundationIdentityKey;
  const currentGameplayState = collectComposerGameplayStateSnapshot();
  const previousGameplayState = composerRuntime.lastSectionGameplayState && typeof composerRuntime.lastSectionGameplayState === 'object'
    ? { ...composerRuntime.lastSectionGameplayState }
    : { ...currentGameplayState };
  const gameplayDelta = computeComposerGameplayDelta(previousGameplayState, currentGameplayState);
  const sectionChanged = composerRuntime.lastSectionKey !== arrangementKey;
  const barsSinceSectionChange = previousSectionChangeBar >= 0
    ? Math.max(0, barIndex - previousSectionChangeBar)
    : Number.POSITIVE_INFINITY;
  const sectionDeferredReasons = [];
  if (sectionChanged) {
    if (barsSinceSectionChange < sectionMinBars) sectionDeferredReasons.push('section_min_bars');
    if (sectionChangeRequiresStableFoundation && !foundationStable) sectionDeferredReasons.push('foundation_not_stable');
  }
  const canApplyScheduledSection = !sectionChanged || sectionDeferredReasons.length === 0;
  const candidateDirective = applyEnergyStateToComposerDirective(section.directive);
  const heldDirective = applyEnergyStateToComposerDirective({
    ...previousDirective,
    sectionId: prevSectionId,
    cycle: prevCycle,
  });
  composerRuntime.currentDirective = canApplyScheduledSection ? candidateDirective : heldDirective;
  const currentDirective = composerRuntime.currentDirective || getComposerDefaultDirective();
  const activeSectionId = canApplyScheduledSection ? String(section.id || 'default').trim().toLowerCase() || 'default' : prevSectionId;
  const activeSectionCycle = canApplyScheduledSection ? Math.max(0, Math.trunc(Number(section.cycle) || 0)) : prevCycle;
  const activeArrangementKey = canApplyScheduledSection ? arrangementKey : `${activeSectionId}:${activeSectionCycle}`;
  const headingFlavor = resolveSectionHeadingFlavor(section.id, section.cycle);
  const sectionChangePayload = {
    sectionId: String(section.id || 'default').trim().toLowerCase(),
    sectionCycle: Math.max(0, Math.trunc(Number(section.cycle) || 0)),
    previousSectionId: prevSectionId,
    previousSectionCycle: prevCycle,
    previousIntensity: Number(previousDirective?.intensity) || 0,
    intensity: Number(currentDirective?.intensity) || 0,
    previousDrumLoops: Math.max(0, Math.trunc(Number(previousDirective?.drumLoops) || 0)),
    drumLoops: Math.max(0, Math.trunc(Number(currentDirective?.drumLoops) || 0)),
    previousDrawSnakes: Math.max(0, Math.trunc(Number(previousDirective?.drawSnakes) || 0)),
    drawSnakes: Math.max(0, Math.trunc(Number(currentDirective?.drawSnakes) || 0)),
    previousVoiceDensity: getComposerDirectiveVoiceDensity(previousDirective),
    voiceDensity: getComposerDirectiveVoiceDensity(currentDirective),
    gameplayDeltaEnemyCount: gameplayDelta.enemyCountDelta,
    gameplayDeltaProjectileCount: gameplayDelta.projectileCountDelta,
    gameplayDeltaRoleCount: gameplayDelta.activeRoleCountDelta,
    gameplayDeltaThreatUsage: gameplayDelta.totalThreatUsageDelta,
    gameplayDeltaMixShift: gameplayDelta.enemyMixShift,
    gameplayDeltaSignificant: gameplayDelta.significant === true,
  };
  const transitionEval = evaluateSectionHeadingMeaningfulness(sectionChangePayload);
  if (sectionChanged && canApplyScheduledSection) {
    try {
      swarmPaletteRuntime.noteSectionDirective?.({
        sectionId: String(section.id || 'default'),
        energyState: energyStateName,
        intensity: Number(composerRuntime.currentDirective?.intensity) || 0.5,
      });
    } catch {}
    const durationBars = previousSectionChangeBar >= 0
      ? Math.max(0, barIndex - previousSectionChangeBar)
      : 0;
    noteMusicSystemEvent('music_section_changed', {
      ...sectionChangePayload,
      sectionDurationBars: durationBars,
      gameplayBefore: { ...previousGameplayState },
      gameplayAfter: { ...currentGameplayState },
      meaningfulTransitionEligible: transitionEval.pass === true,
      meaningfulTransitionReasons: Array.isArray(transitionEval.reasons) ? transitionEval.reasons.slice() : [],
      meaningfulTransitionFailedReasons: Array.isArray(transitionEval.failedReasons) ? transitionEval.failedReasons.slice() : [],
      transitionPreferred: transitionEval.transitionPreferred === true,
      gameplayMeaningful: transitionEval.gameplayMeaningful === true,
      musicalMeaningful: transitionEval.musicalMeaningful === true,
      headingTitle: String(headingFlavor?.title || '').trim(),
      headingSubtitle: String(headingFlavor?.subtitle || '').trim(),
      headingFlavorTag: String(headingFlavor?.flavorTag || '').trim().toLowerCase(),
      headingFlavorText: String(headingFlavor?.flavorText || '').trim(),
      levelTitle: String(headingFlavor?.levelTitle || '').trim(),
      levelSubtitle: String(headingFlavor?.levelSubtitle || '').trim(),
      levelFlavorText: String(headingFlavor?.levelFlavorText || '').trim(),
      energyState: energyStateName,
      reason: 'composer_section_change',
    }, {
      beatIndex,
      barIndex,
    });
    composerRuntime.lastSectionChangeBar = barIndex;
    composerRuntime.lastSectionGameplayState = { ...currentGameplayState };
    composerRuntime.lastDeferredSectionKey = '';
    composerRuntime.lastDeferredSectionBar = -1;
  } else if (sectionChanged) {
    const deferredKey = `${arrangementKey}|${sectionDeferredReasons.join('|')}`;
    if (
      String(composerRuntime.lastDeferredSectionKey || '') !== deferredKey
      || Math.max(-1, Math.trunc(Number(composerRuntime.lastDeferredSectionBar) || -1)) !== barIndex
    ) {
      noteMusicSystemEvent('music_section_change_deferred', {
        attemptedSectionId: String(section.id || 'default').trim().toLowerCase(),
        attemptedSectionCycle: Math.max(0, Math.trunc(Number(section.cycle) || 0)),
        currentSectionId: prevSectionId,
        currentSectionCycle: prevCycle,
        barsSinceSectionChange: Number.isFinite(barsSinceSectionChange) ? barsSinceSectionChange : -1,
        requiredMinBars: sectionMinBars,
        sectionChangeRequiresStableFoundation,
        foundationStable,
        foundationContinuityBars,
        foundationStableMinBars,
        foundationRecentlyAudible,
        deferredReasons: sectionDeferredReasons.slice(),
        energyState: energyStateName,
        reason: 'composer_section_pacing_gate',
      }, {
        beatIndex,
        barIndex,
      });
      composerRuntime.lastDeferredSectionKey = deferredKey;
      composerRuntime.lastDeferredSectionBar = barIndex;
    }
  }
  try {
    swarmPaletteRuntime.noteSectionDirective?.({
      sectionId: activeSectionId,
      energyState: energyStateName,
      intensity: Number(composerRuntime.currentDirective?.intensity) || 0.5,
    });
  } catch {}
  composerRuntime.currentSectionId = activeSectionId;
  composerRuntime.currentCycle = activeSectionCycle;
  composerRuntime.lastSectionKey = activeArrangementKey;
  if (!composerRuntime.lastSectionGameplayState || typeof composerRuntime.lastSectionGameplayState !== 'object') {
    composerRuntime.lastSectionGameplayState = { ...currentGameplayState };
  }
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
  const parseScopeCycleIndex = (scopeId = '') => {
    const src = String(scopeId || '');
    const m = /:lock-(\d+)/i.exec(src);
    return m ? Math.max(0, Math.trunc(Number(m[1]) || 0)) : -1;
  };
  const getReturnBiasChance = (biasLike = '') => {
    const keyBias = String(biasLike || 'medium').trim().toLowerCase();
    if (keyBias === 'high') return 0.82;
    if (keyBias === 'low') return 0.3;
    return 0.55;
  };
  const cloneMotif = (motif) => {
    if (!motif || typeof motif !== 'object') return motif;
    try { return structuredClone(motif); } catch {}
    try { return JSON.parse(JSON.stringify(motif)); } catch {}
    return motif;
  };
  const policy = THEME_PERSISTENCE_POLICY || {};
  const minCycles = Math.max(1, Math.trunc(Number(policy.themeMinCycles) || 2));
  const returnBiasChance = getReturnBiasChance(policy.themeReturnBias);
  const cycleIndex = parseScopeCycleIndex(sid);
  const themeState = composerRuntime.motifThemeState instanceof Map ? composerRuntime.motifThemeState : new Map();
  composerRuntime.motifThemeState = themeState;
  const prev = themeState.get(mid) || null;
  let selected = null;
  if (prev && typeof prev === 'object' && prev.active != null) {
    const activeCycle = Math.max(-1, Math.trunc(Number(prev.activeCycle) || -1));
    const elapsedCycles = (cycleIndex >= 0 && activeCycle >= 0)
      ? Math.max(0, cycleIndex - activeCycle)
      : Number.POSITIVE_INFINITY;
    if (elapsedCycles < minCycles) {
      selected = prev.active;
    } else if (Array.isArray(prev.retired) && prev.retired.length && Math.random() < returnBiasChance) {
      const ridx = Math.max(0, Math.min(prev.retired.length - 1, Math.trunc(Math.random() * prev.retired.length)));
      selected = prev.retired[ridx];
    }
  }
  if (selected == null) {
    selected = typeof factory === 'function' ? factory() : null;
  }
  if (selected == null && prev && typeof prev === 'object' && prev.active != null) {
    selected = prev.active;
  }
  if (prev && typeof prev === 'object') {
    const nextState = {
      active: selected,
      activeCycle: cycleIndex >= 0 ? cycleIndex : Math.max(-1, Math.trunc(Number(prev.activeCycle) || -1)),
      retired: Array.isArray(prev.retired) ? prev.retired.slice(0, 6) : [],
    };
    if (prev.active != null && prev.active !== selected) {
      nextState.retired.unshift(cloneMotif(prev.active));
      nextState.retired = nextState.retired.filter((v, i, arr) => v != null && arr.indexOf(v) === i).slice(0, 6);
    }
    themeState.set(mid, nextState);
  } else {
    themeState.set(mid, {
      active: selected,
      activeCycle: cycleIndex,
      retired: [],
    });
  }
  composerRuntime.motifCache.set(key, selected);
  return selected;
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
function createLoggedPerformedBeatEvent(eventLike, context = null) {
  const created = createPerformedBeatEvent(eventLike);
  const input = context && typeof context === 'object' ? context : {};
  const sourceSystem = String(input?.sourceSystem || '').trim().toLowerCase();
  const expectedInstrumentLane = normalizeEnemyInstrumentLane(
    input?.expectedInstrumentLane
      || inferEnemyLaneFromSourceSystem(sourceSystem, created?.actionType, created?.role),
    inferEnemyLaneFromRole(created?.role, 'lead')
  );
  const actualInstrumentLane = normalizeEnemyInstrumentLane(
    input?.actualInstrumentLane
      || inferInstrumentLaneFromCatalogId(created?.instrumentId, expectedInstrumentLane),
    expectedInstrumentLane
  );
  const actorId = Math.max(0, Math.trunc(Number(created?.actorId) || 0));
  const actor = actorId > 0 ? getSwarmEnemyById(actorId) : null;
  const logContext = {
    ...input,
    continuityId: String(input?.continuityId || created?.payload?.continuityId || actor?.musicContinuityId || '').trim(),
    enemyType: String(input?.enemyType || actor?.enemyType || '').trim().toLowerCase(),
    enemyVisualId: String(input?.enemyVisualId || actor?.musicRoleVisualId || '').trim().toLowerCase(),
    enemyRoleColor: String(input?.enemyRoleColor || actor?.musicRoleColor || '').trim().toLowerCase(),
    expectedInstrumentLane,
    actualInstrumentLane,
  };
  try {
    if (actor && created?.payload && typeof created.payload === 'object') {
      if (!String(created.payload.enemyVisualId || '').trim()) {
        created.payload.enemyVisualId = String(actor?.musicRoleVisualId || '').trim().toLowerCase();
      }
      if (!String(created.payload.enemyRoleColor || '').trim()) {
        created.payload.enemyRoleColor = String(actor?.musicRoleColor || '').trim().toLowerCase();
      }
    }
    swarmMusicLab.logCreatedEvent(created, getMusicLabContext(logContext));
  } catch {}
  try {
    if (actorId > 0) {
      const group = actor ? getEnemyMusicGroup(actor) : null;
      if (group && String(group?.type || 'singleton').trim().toLowerCase() === 'singleton') {
        group.phraseState = {
          beatIndex: Math.max(0, Math.trunc(Number(created?.beatIndex) || 0)),
          stepIndex: Math.max(0, Math.trunc(Number(created?.stepIndex) || 0)),
          barIndex: Math.floor(Math.max(0, Math.trunc(Number(created?.beatIndex) || 0)) / Math.max(1, COMPOSER_BEATS_PER_BAR)),
          phraseIndex: Math.floor(Math.max(0, Math.trunc(Number(created?.stepIndex) || 0)) / Math.max(1, WEAPON_TUNE_STEPS)),
          barOffset: Math.max(0, Math.trunc(Number(created?.beatIndex) || 0)) % Math.max(1, COMPOSER_BEATS_PER_BAR),
          subdivisionPhase: Math.max(0, Math.trunc(Number(created?.stepIndex) || 0)) % Math.max(1, WEAPON_TUNE_STEPS),
          loopLengthSteps: Math.max(1, WEAPON_TUNE_STEPS),
          loopIdentity: String(group?.continuityId || actor?.musicContinuityId || '').trim().toLowerCase(),
          role: normalizeSwarmRole(created?.role || '', ''),
          note: normalizeSwarmNoteName(created?.note || ''),
          actionType: String(created?.actionType || '').trim().toLowerCase(),
          updatedAtMs: Number(performance?.now?.() || 0),
        };
        if (!String(group.continuityId || '').trim()) group.continuityId = String(actor?.musicContinuityId || '') || getNextMusicContinuityId();
        if (actor && String(group.continuityId || '').trim()) {
          actor.musicContinuityId = String(group.continuityId);
          actor.continuityId = String(group.continuityId);
        }
      }
    }
  } catch {}
  return created;
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
  composerRuntime.lastSectionChangeBar = -1;
  composerRuntime.lastSectionKey = '';
  composerRuntime.lastDeferredSectionKey = '';
  composerRuntime.lastDeferredSectionBar = -1;
  composerRuntime.currentSectionId = 'default';
  composerRuntime.currentCycle = 0;
  composerRuntime.currentDirective = getComposerDefaultDirective();
  composerRuntime.lastSectionGameplayState = null;
  try { composerRuntime.motifThemeState?.clear?.(); } catch {}
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
      <div class="beat-swarm-section-heading" aria-hidden="true">
        <div class="beat-swarm-section-heading-title"></div>
        <div class="beat-swarm-section-heading-subtitle"></div>
      </div>
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
  sectionHeadingEl = overlayEl.querySelector('.beat-swarm-section-heading');
  sectionHeadingTitleEl = overlayEl.querySelector('.beat-swarm-section-heading-title');
  sectionHeadingSubtitleEl = overlayEl.querySelector('.beat-swarm-section-heading-subtitle');
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
  if (!gameplayPaused && pauseScreenEl?.contains?.(document.activeElement)) {
    try { document.activeElement?.blur?.(); } catch {}
  }
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
  if (pauseScreenEl) {
    pauseScreenEl.setAttribute('aria-hidden', gameplayPaused ? 'false' : 'true');
    if (gameplayPaused) {
      pauseScreenEl.removeAttribute('inert');
    } else {
      pauseScreenEl.setAttribute('inert', '');
    }
  }
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
  return getHelperKeyRuntime({ slotIndex, stageIndex });
}
function getEnemyById(enemyId) {
  return getEnemyByIdRuntime({
    enemyId,
    state: { enemies },
  });
}
function hasActiveHelperByKey(helperKey) {
  return hasActiveHelperByKeyRuntime({
    helperKey,
    state: { helpers },
  });
}
function createHelperVisuals(kind) {
  return createHelperVisualsRuntime({
    kind,
    state: { enemyLayerEl },
  });
}
function spawnHelper(kind, anchorWorld, beatIndex, nextStages = [], context = null, anchorEnemyId = null) {
  return spawnHelperRuntime({
    kind,
    anchorWorld,
    beatIndex,
    nextStages,
    context,
    anchorEnemyId,
    state: {
      enemyLayerEl,
      helpers,
    },
    constants: {
      helperLifetimeBeats: HELPER_LIFETIME_BEATS,
      helperOrbitRadiusWorld: HELPER_ORBIT_RADIUS_WORLD,
      helperOrbitAngVel: HELPER_ORBIT_ANG_VEL,
    },
    helpers: {
      createHelperVisuals: ({ kind: helperKind }) => createHelperVisuals(helperKind),
      getHelperKey: ({ slotIndex: si, stageIndex: ti }) => getHelperKey(si, ti),
      hasActiveHelperByKey: ({ helperKey }) => hasActiveHelperByKey(helperKey),
      getNextHelperId: () => helperIdSeq++,
      normalizeSwarmNoteName,
      sanitizeWeaponStages,
    },
  });
}
function updateHelpers(dt, centerWorld, scale) {
  updateHelpersRuntime({
    dt,
    centerWorld,
    scale,
    state: {
      currentBeatIndex,
      enemies,
      helpers,
    },
    constants: {
      helperImpactDamage: HELPER_IMPACT_DAMAGE,
      helperImpactRadiusPx: HELPER_IMPACT_RADIUS_PX,
      helperOrbitAngVel: HELPER_ORBIT_ANG_VEL,
      helperOrbitRadiusWorld: HELPER_ORBIT_RADIUS_WORLD,
    },
    helpers: {
      damageEnemy,
      getEnemyById: ({ enemyId: id }) => getEnemyById(id),
      worldToScreen,
    },
  });
}
function fireHelperPayloadAt(originWorld, helperObj, beatIndex) {
  fireHelperPayloadAtRuntime({
    originWorld,
    helperObj,
    beatIndex,
    constants: {
      helperTurretSpawnOffsetWorld: HELPER_TURRET_SPAWN_OFFSET_WORLD,
    },
    helpers: {
      getNearestEnemy,
      getOffsetPoint,
      getShipFacingDirWorld,
      normalizeDir,
      normalizeSwarmNoteName,
      sanitizeWeaponStages,
      spawnHelper: ({ kind, anchorWorld, beatIndex: nextBeatIndex, nextStages, context, anchorEnemyId }) =>
        spawnHelper(kind, anchorWorld, nextBeatIndex, nextStages, context, anchorEnemyId),
      spawnProjectileFromDirection: ({ fromW, dirX, dirY, damage, nextStages, nextBeatIndex, chainContext }) =>
        spawnProjectileFromDirection(fromW, dirX, dirY, damage, nextStages, nextBeatIndex, chainContext),
      triggerWeaponStage: ({ stage, originWorld: nextOrigin, beatIndex: nextBeatIndex, remainingStages, context }) =>
        triggerWeaponStage(stage, nextOrigin, nextBeatIndex, remainingStages, context),
    },
  });
}
function fireHelpersOnBeat(beatIndex) {
  fireHelpersOnBeatRuntime({
    beatIndex,
    state: { helpers },
    constants: {
      helperOrbitRadiusWorld: HELPER_ORBIT_RADIUS_WORLD,
    },
    helpers: {
      fireHelperPayloadAt: ({ originWorld, helperObj, beatIndex: helperBeatIndex }) =>
        fireHelperPayloadAt(originWorld, helperObj, helperBeatIndex),
    },
  });
}
function getPausePreviewHelperKey(slotIndex, stageIndex) {
  return getPausePreviewHelperKeyRuntime({ slotIndex, stageIndex });
}
function hasActivePausePreviewHelperByKey(helperKey) {
  return hasActivePausePreviewHelperByKeyRuntime({
    helperKey,
    state: { pausePreview },
  });
}
function createPausePreviewHelperVisuals(kind) {
  return createPausePreviewHelperVisualsRuntime({
    kind,
    state: { pausePreviewSceneEl },
  });
}
function spawnPausePreviewHelper(kind, anchorPoint, beatIndex, nextStages = [], context = null, anchorEnemy = null) {
  return spawnPausePreviewHelperRuntime({
    kind,
    anchorPoint,
    beatIndex,
    nextStages,
    context,
    anchorEnemy,
    state: {
      pausePreview,
      pausePreviewSceneEl,
    },
    constants: {
      previewHelperLifetimeBeats: PREVIEW_HELPER_LIFETIME_BEATS,
      previewHelperOrbitRadius: PREVIEW_HELPER_ORBIT_RADIUS,
      previewHelperOrbitAngVel: PREVIEW_HELPER_ORBIT_ANG_VEL,
    },
    helpers: {
      createPausePreviewHelperVisuals: createPausePreviewHelperVisualsRuntime,
      getPausePreviewHelperKey: getPausePreviewHelperKeyRuntime,
      hasActivePausePreviewHelperByKey: hasActivePausePreviewHelperByKeyRuntime,
      sanitizeWeaponStages,
    },
  });
}
function firePausePreviewHelperPayloadAt(origin, helperObj, beatIndex) {
  firePausePreviewHelperPayloadAtRuntime({
    origin,
    helperObj,
    beatIndex,
    constants: {
      previewHelperTurretSpawnOffset: PREVIEW_HELPER_TURRET_SPAWN_OFFSET,
    },
    helpers: {
      getOffsetPoint,
      getPausePreviewNearestEnemies,
      normalizeDir,
      sanitizeWeaponStages,
      spawnPausePreviewHelper: ({ kind, anchorPoint, beatIndex: nextBeatIndex, nextStages, context, anchorEnemy }) =>
        spawnPausePreviewHelper(kind, anchorPoint, nextBeatIndex, nextStages, context, anchorEnemy),
      spawnPausePreviewProjectileFromDirection: ({ from, dirX, dirY, damage, nextStages, nextBeatIndex, chainContext }) =>
        spawnPausePreviewProjectileFromDirection(from, dirX, dirY, damage, nextStages, nextBeatIndex, chainContext),
      triggerPausePreviewWeaponStage: ({ stage, origin: nextOrigin, beatIndex: nextBeatIndex, remainingStages, context }) =>
        triggerPausePreviewWeaponStage(stage, nextOrigin, nextBeatIndex, remainingStages, context),
    },
  });
}
function firePausePreviewHelpersOnBeat(beatIndex) {
  firePausePreviewHelpersOnBeatRuntime({
    beatIndex,
    state: { pausePreview },
    constants: {
      previewHelperOrbitRadius: PREVIEW_HELPER_ORBIT_RADIUS,
    },
    helpers: {
      firePausePreviewHelperPayloadAt: ({ origin, helperObj, beatIndex: helperBeatIndex }) =>
        firePausePreviewHelperPayloadAt(origin, helperObj, helperBeatIndex),
    },
  });
}
function updatePausePreviewHelpers(dt) {
  updatePausePreviewHelpersRuntime({
    dt,
    state: { pausePreview },
    constants: {
      previewHelperImpactRadius: PREVIEW_HELPER_IMPACT_RADIUS,
      previewHelperImpactDamage: PREVIEW_HELPER_IMPACT_DAMAGE,
      previewHelperOrbitRadius: PREVIEW_HELPER_ORBIT_RADIUS,
      previewHelperOrbitAngVel: PREVIEW_HELPER_ORBIT_ANG_VEL,
    },
    helpers: {
      damagePausePreviewEnemy: (enemy, amount) => damagePausePreviewEnemy(enemy, amount),
    },
  });
}
function spawnPausePreviewEnemy() {
  spawnPausePreviewEnemyRuntime({
    state: { pausePreview, pausePreviewSceneEl },
    constants: { previewEnemyHp: PREVIEW_ENEMY_HP },
    helpers: { randRange },
  });
}
function resetPausePreviewState() {
  resetPausePreviewStateRuntime({
    state: { pausePreview, pausePreviewSceneEl },
    constants: { previewEnemyCount: PREVIEW_ENEMY_COUNT },
    helpers: {
      clearPausePreviewVisuals,
      nudgePausePreviewEnemiesIntoAction: (force) => nudgePausePreviewEnemiesIntoAction(force),
      spawnPausePreviewEnemy: () => spawnPausePreviewEnemy(),
    },
  });
}
function ensurePausePreviewState() {
  ensurePausePreviewStateRuntime({
    state: { pausePreview, pausePreviewSceneEl },
    helpers: {
      resetPausePreviewState: () => resetPausePreviewState(),
    },
  });
}
function getPausePreviewNearestEnemies(x, y, count = 1, excludeEnemy = null) {
  return getPausePreviewNearestEnemiesRuntime({
    x,
    y,
    count,
    excludeEnemy,
    state: { pausePreview },
  });
}
function removePausePreviewEnemy(enemy) {
  removePausePreviewEnemyRuntime({
    enemy,
    state: { pausePreview },
  });
}
function damagePausePreviewEnemy(enemy, amount = 1) {
  return damagePausePreviewEnemyRuntime({
    enemy,
    amount,
    state: { pausePreview },
    helpers: {
      pulseHitFlash,
      removePausePreviewEnemy: ({ enemy: target }) => removePausePreviewEnemy(target),
    },
  });
}
function previewSelectionContainsBoomerang() {
  return previewSelectionContainsBoomerangRuntime({
    previewSelectedWeaponSlotIndex,
    state: { weaponLoadout },
    helpers: { sanitizeWeaponStages },
  });
}
function previewSelectionStartsWithExplosion() {
  return previewSelectionStartsWithExplosionRuntime({
    previewSelectedWeaponSlotIndex,
    state: { weaponLoadout },
    helpers: { sanitizeWeaponStages },
  });
}
function ensurePausePreviewExplosionBiasEnemy() {
  ensurePausePreviewExplosionBiasEnemyRuntime({
    state: { pausePreview },
    constants: { previewExplosionRadius: PREVIEW_EXPLOSION_RADIUS },
    helpers: {
      previewSelectionStartsWithExplosion: () => previewSelectionStartsWithExplosion(),
      randRange,
    },
  });
}
function nudgePausePreviewEnemiesIntoAction(force = false) {
  nudgePausePreviewEnemiesIntoActionRuntime({
    force,
    state: { pausePreview, weaponLoadout },
    constants: {
      previewNoHitRepositionSeconds: PREVIEW_NO_HIT_REPOSITION_SECONDS,
    },
    previewSelectedWeaponSlotIndex,
    helpers: {
      ensurePausePreviewExplosionBiasEnemy: () => ensurePausePreviewExplosionBiasEnemy(),
      previewSelectionContainsBoomerang: () => previewSelectionContainsBoomerang(),
      randRange,
      sanitizeWeaponStages,
    },
  });
}
function queuePausePreviewChain(beatIndex, nextStages, context) {
  queuePausePreviewChainRuntime({
    beatIndex,
    nextStages,
    context,
    state: { pausePreview },
    helpers: { sanitizeWeaponStages },
  });
}
function countPausePreviewOrbitingHomingMissiles() {
  return countPausePreviewOrbitingHomingMissilesRuntime({
    state: { pausePreview },
  });
}
function addPausePreviewLaser(from, to, sourceEnemy = null, targetEnemy = null) {
  addPausePreviewLaserRuntime({
    from,
    to,
    sourceEnemy,
    targetEnemy,
    state: {
      pausePreview,
      pausePreviewSceneEl,
    },
    constants: {
      previewLaserTtl: PREVIEW_LASER_TTL,
    },
  });
}
function addPausePreviewBeam(from, target, ttl = null) {
  addPausePreviewBeamRuntime({
    from,
    target,
    ttl,
    state: {
      pausePreview,
      pausePreviewSceneEl,
    },
    constants: {
      previewBeamDamagePerSec: PREVIEW_BEAM_DAMAGE_PER_SECOND,
    },
    helpers: {
      getPausePreviewBeatLen,
    },
  });
}
function addPausePreviewExplosion(at, radius = PREVIEW_EXPLOSION_RADIUS, ttl = PREVIEW_EXPLOSION_TTL) {
  addPausePreviewExplosionRuntime({
    at,
    radius,
    ttl,
    state: {
      pausePreview,
      pausePreviewSceneEl,
    },
    constants: {
      previewExplosionRadius: PREVIEW_EXPLOSION_RADIUS,
      previewExplosionTtl: PREVIEW_EXPLOSION_TTL,
    },
  });
}
function spawnPausePreviewProjectileFromDirection(from, dirX, dirY, damage, nextStages = null, nextBeatIndex = null, chainContext = null) {
  spawnPausePreviewProjectileFromDirectionRuntime({
    from,
    dirX,
    dirY,
    damage,
    nextStages,
    nextBeatIndex,
    chainContext,
    state: {
      pausePreview,
      pausePreviewSceneEl,
    },
    constants: {
      previewProjectileSpeed: PREVIEW_PROJECTILE_SPEED,
      previewProjectileLifetime: PREVIEW_PROJECTILE_LIFETIME,
    },
    helpers: {
      normalizeDir,
      sanitizeWeaponStages,
    },
  });
}
function spawnPausePreviewProjectile(from, target, damage, nextStages = null, nextBeatIndex = null, chainContext = null) {
  spawnPausePreviewProjectileRuntime({
    from,
    target,
    damage,
    nextStages,
    nextBeatIndex,
    chainContext,
    helpers: {
      spawnPausePreviewProjectileFromDirection: ({ from, dirX, dirY, damage, nextStages, nextBeatIndex, chainContext }) =>
        spawnPausePreviewProjectileFromDirection(from, dirX, dirY, damage, nextStages, nextBeatIndex, chainContext),
    },
    state: {
      pausePreview,
      pausePreviewSceneEl,
    },
    constants: {
      previewProjectileSpeed: PREVIEW_PROJECTILE_SPEED,
      previewProjectileLifetime: PREVIEW_PROJECTILE_LIFETIME,
    },
  });
}
function spawnPausePreviewBoomerangProjectile(from, dirX, dirY, damage, nextStages = null, nextBeatIndex = null, chainContext = null) {
  spawnPausePreviewBoomerangProjectileRuntime({
    from,
    dirX,
    dirY,
    damage,
    nextStages,
    nextBeatIndex,
    chainContext,
    state: {
      pausePreview,
      pausePreviewSceneEl,
    },
    constants: {
      previewProjectileBoomerangRadius: PREVIEW_PROJECTILE_BOOMERANG_RADIUS,
      previewProjectileBoomerangLoopSeconds: PREVIEW_PROJECTILE_BOOMERANG_LOOP_SECONDS,
    },
    helpers: {
      normalizeDir,
      sanitizeWeaponStages,
    },
  });
}
function spawnPausePreviewHomingMissile(from, damage, nextStages = null, nextBeatIndex = null, chainContext = null) {
  return spawnPausePreviewHomingMissileRuntime({
    from,
    damage,
    nextStages,
    nextBeatIndex,
    chainContext,
    state: {
      pausePreview,
      pausePreviewSceneEl,
    },
    constants: {
      previewProjectileHomingMaxOrbiting: PREVIEW_PROJECTILE_HOMING_MAX_ORBITING,
      previewProjectileHomingOrbitAngVel: PREVIEW_PROJECTILE_HOMING_ORBIT_ANG_VEL,
      previewProjectileHomingOrbitRadius: PREVIEW_PROJECTILE_HOMING_ORBIT_RADIUS,
    },
    helpers: {
      countPausePreviewOrbitingHomingMissiles: countPausePreviewOrbitingHomingMissilesRuntime,
      sanitizeWeaponStages,
    },
  });
}
function applyPausePreviewAoeAt(point, variant = 'explosion', beatIndex = 0, avoidEnemy = null) {
  return applyPausePreviewAoeAtRuntime({
    point,
    variant,
    beatIndex,
    avoidEnemy,
    state: {
      pausePreview,
      pausePreviewSceneEl,
    },
    constants: {
      previewExplosionRadius: PREVIEW_EXPLOSION_RADIUS,
      previewExplosionTtl: PREVIEW_EXPLOSION_TTL,
    },
    helpers: {
      addPausePreviewExplosion: addPausePreviewExplosionRuntime,
      damagePausePreviewEnemy,
      getPausePreviewBeatLen,
    },
  });
}
function triggerPausePreviewWeaponStage(stage, origin, beatIndex, remainingStages = [], context = null) {
  triggerPausePreviewWeaponStageRuntime({
    stage,
    origin,
    beatIndex,
    remainingStages,
    context,
    state: {
      pausePreview,
      pausePreviewSceneEl,
    },
    constants: {
      previewProjectileChainSpawnOffset: PREVIEW_PROJECTILE_CHAIN_SPAWN_OFFSET,
      previewProjectileSplitAngleRad: PREVIEW_PROJECTILE_SPLIT_ANGLE_RAD,
      previewHelperTurretSpawnOffset: PREVIEW_HELPER_TURRET_SPAWN_OFFSET,
    },
    helpers: {
      addPausePreviewBeam: ({ from, target, ttl }) =>
        addPausePreviewBeam(from, target, ttl),
      addPausePreviewLaser: ({ from, to, sourceEnemy, targetEnemy }) =>
        addPausePreviewLaser(from, to, sourceEnemy, targetEnemy),
      applyPausePreviewAoeAt: ({ point, variant, beatIndex: nextBeatIndex, avoidEnemy }) =>
        applyPausePreviewAoeAt(point, variant, nextBeatIndex, avoidEnemy),
      damagePausePreviewEnemy,
      getPausePreviewBeatLen,
      getPausePreviewNearestEnemies,
      normalizeDir,
      queuePausePreviewChain: ({ beatIndex: nextBeatIndex, nextStages, context }) =>
        queuePausePreviewChain(nextBeatIndex, nextStages, context),
      sanitizeWeaponStages,
      spawnPausePreviewBoomerangProjectile: ({ from, dirX, dirY, damage, nextStages, nextBeatIndex, chainContext }) =>
        spawnPausePreviewBoomerangProjectile(from, dirX, dirY, damage, nextStages, nextBeatIndex, chainContext),
      spawnPausePreviewHelper: ({ kind, anchorPoint, beatIndex: nextBeatIndex, nextStages, context, anchorEnemy }) =>
        spawnPausePreviewHelper(kind, anchorPoint, nextBeatIndex, nextStages, context, anchorEnemy),
      spawnPausePreviewHomingMissile: ({ from, damage, nextStages, nextBeatIndex, chainContext }) =>
        spawnPausePreviewHomingMissile(from, damage, nextStages, nextBeatIndex, chainContext),
      spawnPausePreviewProjectile: ({ from, target, damage, nextStages, nextBeatIndex, chainContext }) =>
        spawnPausePreviewProjectile(from, target, damage, nextStages, nextBeatIndex, chainContext),
      spawnPausePreviewProjectileFromDirection: ({ from, dirX, dirY, damage, nextStages, nextBeatIndex, chainContext }) =>
        spawnPausePreviewProjectileFromDirection(from, dirX, dirY, damage, nextStages, nextBeatIndex, chainContext),
      triggerPausePreviewWeaponStage: ({ stage, origin: nextOrigin, beatIndex: nextBeatIndex, remainingStages: nextRemainingStages = [], context: nextContext = null }) =>
        triggerPausePreviewWeaponStage(stage, nextOrigin, nextBeatIndex, nextRemainingStages, nextContext),
    },
  });
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
  processPausePreviewPendingChainsRuntime({
    beatIndex,
    state: { pausePreview },
    helpers: {
      sanitizeWeaponStages,
      triggerPausePreviewWeaponStage,
    },
  });
}
function applyPausePreviewLingeringAoeBeat(beatIndex) {
  applyPausePreviewLingeringAoeBeatRuntime({
    beatIndex,
    state: { pausePreview },
    constants: {
      previewExplosionRadius: PREVIEW_EXPLOSION_RADIUS,
    },
    helpers: {
      damagePausePreviewEnemy,
    },
  });
}
function firePausePreviewWeaponsOnBeat(beatIndex) {
  firePausePreviewWeaponsOnBeatRuntime({
    beatIndex,
    previewSelectedWeaponSlotIndex,
    state: {
      pausePreview,
      weaponLoadout,
    },
    helpers: {
      sanitizeWeaponStages,
      triggerPausePreviewWeaponStage,
    },
  });
}
function updatePausePreviewProjectilesAndEffects(dt) {
  updatePausePreviewProjectilesAndEffectsRuntime({
    dt,
    state: { pausePreview },
    constants: {
      previewProjectileHitRadius: PREVIEW_PROJECTILE_HIT_RADIUS,
      previewProjectileBoomerangRadius: PREVIEW_PROJECTILE_BOOMERANG_RADIUS,
      previewProjectileHomingAcquireRange: PREVIEW_PROJECTILE_HOMING_ACQUIRE_RANGE,
      previewProjectileHomingTurnRate: PREVIEW_PROJECTILE_HOMING_TURN_RATE,
      previewProjectileHomingSpeed: PREVIEW_PROJECTILE_HOMING_SPEED,
      previewProjectileHomingReturnSnapDist: PREVIEW_PROJECTILE_HOMING_RETURN_SNAP_DIST,
      previewProjectileHomingOrbitTurnRate: PREVIEW_PROJECTILE_HOMING_ORBIT_TURN_RATE,
      previewProjectileHomingOrbitChaseSpeed: PREVIEW_PROJECTILE_HOMING_ORBIT_CHASE_SPEED,
      previewProjectileHomingOrbitRadius: PREVIEW_PROJECTILE_HOMING_ORBIT_RADIUS,
      previewProjectileHomingOrbitAngVel: PREVIEW_PROJECTILE_HOMING_ORBIT_ANG_VEL,
      previewLaserTtl: PREVIEW_LASER_TTL,
      previewExplosionRadius: PREVIEW_EXPLOSION_RADIUS,
      previewExplosionTtl: PREVIEW_EXPLOSION_TTL,
      projectileBoomerangSpinMult: PROJECTILE_BOOMERANG_SPIN_MULT,
    },
    helpers: {
      damagePausePreviewEnemy,
      getPausePreviewNearestEnemies,
      normalizeDir,
      queuePausePreviewChain,
      sanitizeWeaponStages,
      triggerPausePreviewWeaponStage,
    },
  });
}
function getPausePreviewBeatLen() {
  return getPausePreviewBeatLenRuntime({
    constants: {
      previewBeatLenFallback: PREVIEW_BEAT_LEN_FALLBACK,
    },
    helpers: {
      getLoopInfo,
    },
  });
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
  const projectileInstrument = resolveSwarmSoundInstrumentId('playerProjectile') || 'tone';
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
  try {
    playerInstrumentRuntime.noteManualOverride(beatIndex, 2);
  } catch {}
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
  ensurePauseWeaponUiRuntime({
    getPauseScreenEl: () => pauseScreenEl,
    getPauseWeaponDrag: () => pauseWeaponDrag,
    getStagePickerState: () => stagePickerState,
    getTuneEditorState: () => tuneEditorState,
    getWeaponSubBoardState: () => weaponSubBoardState,
    getWeaponLoadout: () => weaponLoadout,
    getPreviewSelectedWeaponSlotIndex: () => previewSelectedWeaponSlotIndex,
    setPreviewSelectedWeaponSlotIndex(next) { previewSelectedWeaponSlotIndex = next; },
    renderPauseWeaponUi,
    closeWeaponSubBoardEditor,
    openWeaponSubBoardEditor,
    getWeaponComponentDefById,
    clearHelpers,
    persistBeatSwarmState,
    createRandomWeaponStages,
    getPauseWeaponStageCellFromEventTarget,
    parsePauseWeaponStageCell,
    resetPauseWeaponDrag,
    beginPauseWeaponDrag,
    updatePauseWeaponDragVisual,
    reorderWeaponStages,
    pauseWeaponDragHoldMs: PAUSE_WEAPON_DRAG_HOLD_MS,
    maxWeaponStages: MAX_WEAPON_STAGES,
  });
}
function renderPauseWeaponUi() {
  const result = renderPauseWeaponUiRuntime({
    getPauseScreenEl: () => pauseScreenEl,
    getWeaponLoadout: () => weaponLoadout,
    sanitizeWeaponTune,
    getWeaponTuneActivityStats,
    getWeaponTuneDamageScale,
    maxWeaponStages: MAX_WEAPON_STAGES,
    getWeaponComponentDefForStage,
    renderComponentPreviewMarkup,
    getPreviewSelectedWeaponSlotIndex: () => previewSelectedWeaponSlotIndex,
    getStagePickerState: () => stagePickerState,
    weaponArchetypes: WEAPON_ARCHETYPES,
    weaponComponents: WEAPON_COMPONENTS,
    resetPausePreviewState,
    initComponentLivePreviews,
    syncTuneEditorPlayheadUi,
  });
  pausePreviewSceneEl = result.pausePreviewSceneEl;
  pausePreviewStatusEl = result.pausePreviewStatusEl;
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
  starfieldVisualPhase += 0.016 * Math.max(0.1, Number(starfieldSectionRuntime.twinkleRate) || 0.45);
  const burst01 = starfieldSectionRuntime.entryBurstDur > 0
    ? Math.max(0, Math.min(1, starfieldSectionRuntime.entryBurstT / Math.max(0.001, starfieldSectionRuntime.entryBurstDur)))
    : 0;
  const burstStrength = Math.max(0, Number(starfieldSectionRuntime.entryBurstStrength) || 0) * burst01;
  const parallaxIntensity = Math.max(0.5, Number(starfieldSectionRuntime.parallaxIntensity) || 1) * (1 + (burstStrength * 0.25));
  const density = Math.max(0.2, Math.min(1, Number(starfieldSectionRuntime.density) || 0.72));
  const pulseStrength = Math.max(0, Math.min(1, Number(starfieldSectionRuntime.pulseStrength) || 0.2));
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
  starfieldLayerEl.style.background = String(starfieldSectionRuntime.tint || '#000000') || '#000000';
  const clip = `inset(0px 0px 0px ${splitX.toFixed(2)}px)`;
  starfieldLayerEl.style.clipPath = clip;
  starfieldLayerEl.style.webkitClipPath = clip;
  for (let i = 0; i < starfieldStars.length; i++) {
    const star = starfieldStars[i];
    const p = Math.max(0.08, Math.min(0.98, Number(star.p) || 0.82));
    const baseX = (Math.max(0, Math.min(1, Number(star.nx) || 0)) * w);
    const baseY = (Math.max(0, Math.min(1, Number(star.ny) || 0)) * h);
    const shiftX = -camDxPx * (1 - p) * SWARM_STARFIELD_PARALLAX_SHIFT_SCALE * parallaxIntensity;
    const shiftY = -camDyPx * (1 - p) * SWARM_STARFIELD_PARALLAX_SHIFT_SCALE * parallaxIntensity;
    let localX = baseX + shiftX;
    let localY = baseY + shiftY;
    localX = ((localX % w) + w) % w;
    localY = ((localY % h) + h) % h;
    if (star.el) {
      const twinkle = 0.76 + (0.24 * Math.sin(starfieldVisualPhase + (i * 0.91)));
      const densityGate = (i / Math.max(1, starfieldStars.length)) <= density ? 1 : 0;
      const baseAlpha = Math.max(0.45, Math.min(1, Number(star.alpha) || 0.78));
      const pulse = 1 + (pulseStrength * 0.18 * Math.sin((starfieldVisualPhase * 0.75) + (i * 0.12)));
      const alpha = baseAlpha * twinkle * pulse * densityGate;
      star.el.style.opacity = `${Math.max(0, Math.min(1, alpha)).toFixed(3)}`;
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
    let bassOwnerTransferResult = null;
    try {
      bassOwnerTransferResult = tryTransferBassFoundationOwnerWithinComposerGroup(enemy, removalReason, {
        beatIndex,
        stepIndex,
        barIndex,
        reason: removalReason,
        groupId: Math.max(0, Math.trunc(Number(ctx.groupId) || Number(enemy?.composerGroupId) || 0)),
        retireOrigin: String(ctx.retireOrigin || enemy?.retreatOrigin || '').trim().toLowerCase(),
      });
    } catch {}
    let handoffResult = null;
    try {
      handoffResult = tryHandoffSingletonMusicGroup(enemy, removalReason, {
        beatIndex,
        stepIndex,
        barIndex,
        reason: removalReason,
        groupId: Math.max(0, Math.trunc(Number(ctx.groupId) || Number(enemy?.composerGroupId) || 0)),
        retireOrigin: String(ctx.retireOrigin || enemy?.retreatOrigin || '').trim().toLowerCase(),
      });
    } catch {}
    if (isBassFoundationOwnerEnemy(enemyId)) {
      const transferredEnemyId = Math.max(0, Math.trunc(Number(
        bassOwnerTransferResult?.targetEnemy?.id
          || handoffResult?.targetEnemy?.id
          || 0
      ) || 0));
      if (!(transferredEnemyId > 0 && transferredEnemyId !== enemyId)) {
        clearBassFoundationOwnerIfMatches(enemyId, `enemy_removed_${removalReason}`, {
          beatIndex,
          stepIndex,
          barIndex,
          reason: removalReason,
        });
      }
    }
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
function hasPendingWeaponChainEventById(eventId) {
  const id = Math.trunc(Number(eventId) || 0);
  if (!(id > 0)) return false;
  return pendingWeaponChainEvents.some((ev) => Math.trunc(Number(ev?.eventId) || 0) === id);
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
      executePerformedBeatEvent(createLoggedPerformedBeatEvent({
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
      }, {
        beatIndex: beat,
        sourceSystem: 'death',
        enemyType: 'death',
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
  musicContinuityIdSeq = 1;
  resetBassFoundationOwnerRuntime();
  resetBassKeepaliveRuntime();
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
    noteMusicSystemEvent('weapon_explosion_queue_cleared', {
      chainEventId: Math.trunc(Number(ev?.eventId) || 0),
      weaponSlotIndex: idx,
      impactEnemyId: Math.trunc(Number(ev?.context?.impactEnemyId) || 0),
      scheduledBeatIndex: Math.trunc(Number(ev?.beatIndex) || 0),
      reason: 'runtime_slot_cleared',
    }, { beatIndex: Math.trunc(Number(ev?.beatIndex) || Number(currentBeatIndex) || 0), stepIndex: 0 });
    if (Number.isFinite(ev?.eventId)) removeExplosionPrimeEffectsForEvent(Math.trunc(ev.eventId));
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
  return created;
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
  return getPlayerWeaponAssignedInstrumentIds();
}
const beatSwarmInstrumentLaneTools = createBeatSwarmInstrumentLaneTools({
  normalizeSwarmRole,
  roles: {
    bass: BEAT_EVENT_ROLES.BASS,
    lead: BEAT_EVENT_ROLES.LEAD,
    accent: BEAT_EVENT_ROLES.ACCENT,
    motion: BEAT_EVENT_ROLES.MOTION,
  },
  getInstrumentEntries: () => getInstrumentEntries(),
  getSoundThemeKey,
  pickInstrumentForToy,
  getUsedWeaponInstrumentIds,
  getUsedEnemyInstrumentIds,
  getStyleProfile: getSwarmStyleProfile,
  resolveSwarmSoundInstrumentId,
  resolveInstrumentIdOrFallback,
});
function normalizeEnemyInstrumentLane(laneLike, fallback = 'lead') {
  return beatSwarmInstrumentLaneTools.normalizeEnemyInstrumentLane(laneLike, fallback);
}
function inferEnemyLaneFromRole(roleLike, fallbackLane = 'lead') {
  return beatSwarmInstrumentLaneTools.inferEnemyLaneFromRole(roleLike, fallbackLane);
}
function inferEnemyLaneFromSourceSystem(sourceSystem = '', actionType = '', roleLike = '') {
  return beatSwarmInstrumentLaneTools.inferEnemyLaneFromSourceSystem(sourceSystem, actionType, roleLike);
}
function inferInstrumentLaneFromCatalogId(instrumentId, fallbackLane = 'lead') {
  return beatSwarmInstrumentLaneTools.inferInstrumentLaneFromCatalogId(instrumentId, fallbackLane);
}
function pickSpawnerEnemyInstrumentId(preferredId = '') {
  return beatSwarmInstrumentLaneTools.pickSpawnerEnemyInstrumentId(preferredId);
}
function pickEnemyInstrumentIdForToy(toyKey, preferredId = '', extraUsed = null, options = null) {
  return beatSwarmInstrumentLaneTools.pickEnemyInstrumentIdForToy(toyKey, preferredId, extraUsed, options);
}
function pickEnemyInstrumentIdForToyRandom(toyKey, extraUsed = null, options = null) {
  return beatSwarmInstrumentLaneTools.pickEnemyInstrumentIdForToyRandom(toyKey, extraUsed, options);
}
function createSpawnerEnemyRhythmProfile(options = null) {
  const arrangement = getPaletteArrangementControls();
  const style = getSwarmStyleProfile();
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
  const styleDensity = clamp01(arrangement.density * Math.max(0.2, Number(style?.spawnerDensityMult) || 1));
  const densitySteps = applyStepPatternDensity(steps, styleDensity, { minHits: 1, maxHits: 6 });
  for (let i = 0; i < steps.length; i++) steps[i] = !!densitySteps[i];
  const noteIndices = Array.from({ length: 8 }, (_, i) => Math.max(0, Math.trunc(Number(noteIdxRaw[i]) || (6 + (i % 7)))));
  const srcInstrument = String(source?.dataset?.instrument || source?.dataset?.instrumentId || fallbackInstrument || 'tone');
  const instrument = pickEnemyInstrumentIdForToy(toyType, srcInstrument, null, {
    lane: 'bass',
    role: BEAT_EVENT_ROLES.BASS,
  });
  const sanitizedInstrument = sanitizeEnemyMusicInstrumentId(
    instrument,
    resolveSwarmSoundInstrumentId('projectile') || 'tone',
    { role: BEAT_EVENT_ROLES.BASS }
  );
  const resolvedPalette = notePalette.length ? notePalette : Array.from(LOOPGRID_FALLBACK_NOTE_PALETTE);
  const firstActiveStep = Math.max(0, steps.findIndex(Boolean));
  const baseIdx = Math.max(0, Math.trunc(Number(noteIndices[firstActiveStep >= 0 ? firstActiveStep : 0]) || 0));
  const baseMidi = Math.trunc(Number(resolvedPalette[baseIdx % Math.max(1, resolvedPalette.length)]) || 60);
  const baseNoteName = role === 'drum'
    ? 'C3'
    : clampNoteToDirectorPool(normalizeSwarmNoteName(midiToName(baseMidi)) || 'C4', baseIdx);
  return { steps, noteIndices, notePalette: resolvedPalette, instrument: sanitizedInstrument, baseNoteName };
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
  const role = normalizeSwarmRole(base?.role || 'bass', BEAT_EVENT_ROLES.BASS);
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
  const baseNoteName = normalizeSwarmNoteName(base?.baseNoteName) || 'C3';
  const instrument = sanitizeEnemyMusicInstrumentId(
    base?.instrument,
    resolveSwarmSoundInstrumentId('projectile') || 'tone',
    { role }
  );
  return {
    ...base,
    instrument,
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
    enemy.spawnerNoteName = normalizeSwarmNoteName(enemy.spawnerNoteName)
      || normalizeSwarmNoteName(resolvedPrimaryNote)
      || 'C3';
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
  const style = getSwarmStyleProfile();
  const fallbackInstrument = resolveSwarmSoundInstrumentId('projectile') || getIdForDisplayName('Tone (Sine)') || 'tone';
  const theme = getEnergyStateThemePreset();
  const phrase = pickRandomArrayItem(theme?.drawsnakePhrases, null);
  const lockedHook = getLockedMotifHook(getComposerMotifScopeKey(), 4);
  const steps = Array.isArray(phrase?.steps)
    ? createStepPattern(phrase.steps, WEAPON_TUNE_STEPS)
    : Array.from({ length: WEAPON_TUNE_STEPS }, () => Math.random() >= 0.5);
  if (!steps.some(Boolean)) steps[Math.max(0, Math.min(WEAPON_TUNE_STEPS - 1, Math.trunc(Math.random() * WEAPON_TUNE_STEPS)))] = true;
  const styleDensity = clamp01(arrangement.density * Math.max(0.2, Number(style?.drawsnakeDensityMult) || 1));
  const densitySteps = applyStepPatternDensity(steps, styleDensity, { minHits: 1, maxHits: Math.max(2, WEAPON_TUNE_STEPS - 1) });
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
    spawnerInstrument: sanitizeEnemyMusicInstrumentId(
      profile.instrument,
      resolveSwarmSoundInstrumentId('projectile') || 'tone',
      { role: mappedRole }
    ),
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
  return created;
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
  return spawnSpawnerEnemyAt(x, y, options);
}
function maintainSpawnerEnemyPopulation() {
  if (!SPAWNER_ENEMY_ENABLED) return;
  const pacingCaps = getCurrentPacingCaps();
  const stepAbs = Math.max(0, Math.trunc(Number(currentBeatIndex) || 0));
  const introHoldActive = shouldHoldIntroLayerExpansion(stepAbs);
  const composer = getComposerDirective();
  const motifScopeKey = getComposerMotifScopeKey();
  const target = composerRuntime.enabled
    ? Math.max(0, Math.trunc(Number(composer.drumLoops) || 0))
    : Math.max(0, Math.trunc(Number(SPAWNER_ENEMY_TARGET_COUNT) || 0));
  const pacedTarget = Math.max(0, Math.min(target, introHoldActive ? 0 : pacingCaps.maxSpawners));
  const spawners = enemies.filter((e) => String(e?.enemyType || '') === 'spawner');
  const rankedSpawners = spawners
    .slice()
    .sort((a, b) => Math.trunc(Number(a?.id) || 0) - Math.trunc(Number(b?.id) || 0));
  const barIndex = Math.floor(Math.max(0, Math.trunc(Number(currentBeatIndex) || 0)) / Math.max(1, COMPOSER_BEATS_PER_BAR));
  const rotationBars = Math.max(1, Math.trunc(Number(SPAWNER_SCHEDULING_ROTATION_BARS) || 1));
  const rotationBucket = Math.floor(barIndex / rotationBars);
  const activeStart = rankedSpawners.length > 0
    ? ((rotationBucket * Math.max(1, pacedTarget)) % rankedSpawners.length)
    : 0;
  for (let i = 0; i < rankedSpawners.length; i++) {
    const enemy = rankedSpawners[i];
    if (enemy?.retreating) {
      enemy.musicParticipationGain = 0;
      enemy.lifecycleState = 'retiring';
    } else {
      const shouldScheduleBase = (() => {
        if (!(pacedTarget > 0)) return false;
        if (pacedTarget >= rankedSpawners.length) return true;
        const rel = ((i - activeStart) + rankedSpawners.length) % rankedSpawners.length;
        return rel < pacedTarget;
      })();
      const shouldSchedule = shouldScheduleBase || (pacedTarget > 0 && isEnemyLikelyVisibleForAudio(enemy, 120));
      enemy.musicParticipationGain = shouldSchedule ? 1 : 0.6;
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
    enemy.spawnerInstrument = sanitizeEnemyMusicInstrumentId(
      motif?.instrument,
      enemy.spawnerInstrument || resolveSwarmSoundInstrumentId('projectile') || 'tone',
      { role: BEAT_EVENT_ROLES.BASS }
    );
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
    drawsnakeLinePulseT: 0,
    drawsnakeLinePulseDur: Math.max(0.05, Number(MUSIC_ROLE_PULSE_POLICY.seconds) || 0.24),
    drawsnakeLinePulseScale: Math.max(0.02, Math.min(0.4, Number(MUSIC_ROLE_PULSE_POLICY.softScale) || 0.08)),
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
  return created;
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
  return spawnDrawSnakeEnemyAt(x, y, options);
}
function maintainDrawSnakeEnemyPopulation() {
  if (!DRAW_SNAKE_ENEMY_ENABLED) return;
  const pacingCaps = getCurrentPacingCaps();
  const stepAbs = Math.max(0, Math.trunc(Number(currentBeatIndex) || 0));
  const introHoldActive = shouldHoldIntroLayerExpansion(stepAbs);
  const composer = getComposerDirective();
  const motifScopeKey = getComposerMotifScopeKey();
  const target = composerRuntime.enabled
    ? Math.max(0, Math.trunc(Number(composer.drawSnakes) || 0))
    : Math.max(0, Math.trunc(Number(DRAW_SNAKE_ENEMY_TARGET_COUNT) || 0));
  const pacedTarget = Math.max(0, Math.min(target, introHoldActive ? 0 : pacingCaps.maxDrawSnakes));
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
  const linePulseDur = Math.max(0.01, Number(enemy?.drawsnakeLinePulseDur) || Number(MUSIC_ROLE_PULSE_POLICY.seconds) || 0.24);
  const linePulseRem = Math.max(0, Number(enemy?.drawsnakeLinePulseT) || 0);
  const linePulseScale = Math.max(0, Math.min(0.5, Number(enemy?.drawsnakeLinePulseScale) || Number(MUSIC_ROLE_PULSE_POLICY.softScale) || 0.08));
  let linePulseStrength = 0;
  if (linePulseRem > 0) {
    const t = 1 - Math.max(0, Math.min(1, linePulseRem / linePulseDur));
    linePulseStrength = Math.sin(t * Math.PI);
    enemy.drawsnakeLinePulseT = Math.max(0, linePulseRem - frameDt);
  }
  const lineWidthPx = Math.max(2, Number(enemy?.drawsnakeLineWidthPx) || DRAW_SNAKE_LINE_WIDTH_PX_FALLBACK)
    * DRAW_SNAKE_VISUAL_SCALE
    * (1 + (linePulseStrength * linePulseScale));
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
function isEnemyLikelyVisibleForAudio(enemy, marginPx = 96) {
  if (!enemy || typeof enemy !== 'object') return false;
  const s = worldToScreen({ x: Number(enemy?.wx) || 0, y: Number(enemy?.wy) || 0 });
  if (!s || typeof s !== 'object') return false;
  const margin = Math.max(0, Number(marginPx) || 0);
  const w = Math.max(1, Number(window.innerWidth) || 0);
  const h = Math.max(1, Number(window.innerHeight) || 0);
  return s.x >= -margin && s.x <= (w + margin) && s.y >= -margin && s.y <= (h + margin);
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
function isPlayerWeaponTuneStepAuthoredActive(stepIndex = 0) {
  const slotIndex = Math.max(0, Math.min(weaponLoadout.length - 1, Math.trunc(Number(activeWeaponSlotIndex) || 0)));
  const weapon = weaponLoadout[slotIndex];
  const stages = sanitizeWeaponStages(weapon?.stages);
  if (!stages.length) return false;
  const notes = getWeaponTuneStepNotes(slotIndex, Math.trunc(Number(stepIndex) || 0));
  return Array.isArray(notes) && notes.length > 0;
}
function shouldKeepEnemyAudibleDuringPlayerDuck(ev, channel = '') {
  const style = getSwarmStyleProfile();
  const playerProminence = clamp01(Number(style?.playerProminence) || 0);
  const beat = Math.max(0, Math.trunc(Number(ev?.beatIndex) || 0));
  const step = Math.max(0, Math.trunc(Number(ev?.stepIndex) || 0));
  const actor = Math.max(0, Math.trunc(Number(ev?.actorId) || 0));
  const action = String(ev?.actionType || '').trim().toLowerCase();
  const channelKey = String(channel || '').trim().toLowerCase();
  const keepChance = Number(PLAYER_MASK_DUCK_KEEP_CHANCE_BY_CHANNEL[channelKey]);
  const thresholdBase = Number.isFinite(keepChance)
    ? keepChance
    : Number(PLAYER_MASK_DUCK_KEEP_CHANCE_BY_CHANNEL.default);
  const threshold = Math.max(0, Math.min(1, thresholdBase * (1 - (0.6 * playerProminence))));
  const seed = hashStringSeed(`${beat}|${step}|${actor}|${action}|${String(channel || '').trim().toLowerCase()}`);
  return seededNoise01(seed) < threshold;
}
function normalizeEnemyMusicLayer(layerLike, fallback = 'sparkle') {
  const raw = String(layerLike || '').trim().toLowerCase();
  if (raw === 'foundation' || raw === 'loops' || raw === 'sparkle') return raw;
  return String(fallback || 'sparkle').trim().toLowerCase() === 'foundation'
    ? 'foundation'
    : (String(fallback || 'sparkle').trim().toLowerCase() === 'loops' ? 'loops' : 'sparkle');
}
function getEnemyEventMusicLayer(ev) {
  const action = String(ev?.actionType || '').trim().toLowerCase();
  const role = normalizeSwarmRole(ev?.role || ev?.payload?.musicRole || '', BEAT_EVENT_ROLES.ACCENT);
  if (role === BEAT_EVENT_ROLES.BASS) {
    return 'foundation';
  }
  const enemyType = String(
    ev?.enemyType
    || ev?.payload?.enemyType
    || ev?.payload?.sourceEnemyType
    || ''
  ).trim().toLowerCase();
  if (enemyType) {
    const profile = getEnemyMusicIdentityProfile({ enemyType }, BEAT_EVENT_ROLES.ACCENT);
    const fromProfile = normalizeEnemyMusicLayer(profile?.layer || 'sparkle', 'sparkle');
    if (fromProfile) return fromProfile;
  }
  if (action === 'spawner-spawn') return 'foundation';
  if (action === 'composer-group-projectile' || action === 'composer-group-explosion') {
    if (role === BEAT_EVENT_ROLES.BASS) return 'foundation';
    return 'loops';
  }
  if (action === 'drawsnake-projectile') return 'loops';
  return 'sparkle';
}
function getOnboardingReadabilityDirective(barIndex = 0) {
  const bar = Math.max(0, Math.trunc(Number(barIndex) || 0));
  const flow = Array.isArray(ONBOARDING_PHASE_FLOW) ? ONBOARDING_PHASE_FLOW : [];
  const normalizeAllowedNewEnemyTypes = (listLike) => {
    const src = Array.isArray(listLike) ? listLike : [];
    const out = new Set();
    for (const item of src) {
      const key = String(item || '').trim().toLowerCase();
      if (!key) continue;
      out.add(key);
    }
    return out;
  };
  let cursor = 0;
  for (const phase of flow) {
    const len = Math.max(1, Math.trunc(Number(phase?.bars) || 1));
    if (bar < (cursor + len)) {
      const out = {
        id: String(phase?.id || 'opening').trim().toLowerCase() || 'opening',
        allowLayers: {
          foundation: phase?.allowLayers?.foundation !== false,
          loops: phase?.allowLayers?.loops !== false,
          sparkle: phase?.allowLayers?.sparkle !== false,
        },
        maxForeground: Math.max(1, Math.trunc(Number(phase?.maxForeground) || Number(MUSIC_LAYER_POLICY.foregroundVoiceLimit) || 2)),
        maxNewIdentitiesRecent: Math.max(1, Math.trunc(Number(phase?.maxNewIdentitiesRecent) || 1)),
        noveltyWindowBars: Math.max(1, Math.trunc(Number(phase?.noveltyWindowBars) || 8)),
        allowNewEnemyTypes: normalizeAllowedNewEnemyTypes(phase?.allowNewEnemyTypes),
      };
      if (onboardingRuntime.lastPhaseId !== out.id) onboardingRuntime.lastPhaseId = out.id;
      return out;
    }
    cursor += len;
  }
  return {
    id: 'rising_tension',
    allowLayers: { foundation: true, loops: true, sparkle: true },
    maxForeground: Math.max(1, Math.trunc(Number(MUSIC_LAYER_POLICY.foregroundVoiceLimit) || 2)),
    maxNewIdentitiesRecent: 2,
    noveltyWindowBars: 10,
    allowNewEnemyTypes: new Set(['spawner', 'drawsnake', 'composer-group-member', 'dumb', 'unknown']),
  };
}
function getEnemyEventIdentityKey(ev, layer = '') {
  const enemyType = String(ev?.enemyType || ev?.payload?.enemyType || '').trim().toLowerCase() || 'unknown';
  const role = normalizeSwarmRole(ev?.role || ev?.payload?.musicRole || '', BEAT_EVENT_ROLES.ACCENT);
  const safeLayer = normalizeEnemyMusicLayer(layer || getEnemyEventMusicLayer(ev), 'sparkle');
  if (safeLayer === 'foundation') {
    const laneId = String(ev?.payload?.foundationLaneId || musicLayerRuntime.foundationLaneId || 'foundation_lane').trim().toLowerCase();
    const phraseId = String(ev?.payload?.foundationPhraseId || musicLayerRuntime.foundationPhraseId || 'foundation_fallback').trim().toLowerCase();
    return `${laneId}|${phraseId}|${role}|${safeLayer}`;
  }
  return `${enemyType}|${role}|${safeLayer}`;
}
function getOnboardingRecentNovelIdentityCount(barIndex = 0, windowBars = 8) {
  const bar = Math.max(0, Math.trunc(Number(barIndex) || 0));
  const span = Math.max(1, Math.trunc(Number(windowBars) || 8));
  const minBar = Math.max(0, bar - span + 1);
  let count = 0;
  for (const firstBar of onboardingRuntime.identityFirstHeardBar.values()) {
    const b = Math.max(0, Math.trunc(Number(firstBar) || 0));
    if (b >= minBar && b <= bar) count += 1;
  }
  return count;
}
function noteEnemyMusicIdentityExposure(exposure = null, barIndex = 0) {
  const src = exposure && typeof exposure === 'object' ? exposure : null;
  if (!src) return false;
  const bar = Math.max(0, Math.trunc(Number(barIndex) || 0));
  const layer = normalizeEnemyMusicLayer(src?.musicLayer || src?.layer || 'sparkle', 'sparkle');
  const role = normalizeSwarmRole(src?.musicRole || src?.role || '', BEAT_EVENT_ROLES.ACCENT);
  const enemyType = String(src?.enemyType || 'unknown').trim().toLowerCase() || 'unknown';
  const key = `${enemyType}|${role}|${layer}`;
  if (!key) return false;
  if (onboardingRuntime.identityFirstHeardBar.has(key)) return false;
  onboardingRuntime.identityFirstHeardBar.set(key, bar);
  return true;
}
function getLoopAdmissionTunables() {
  const pacingState = String(getCurrentPacingStateName() || '').trim().toLowerCase();
  const policy = LOOP_ADMISSION_POLICY || {};
  const loopLengthSteps = Math.max(1, Math.trunc(Number(policy.loopLengthSteps) || WEAPON_TUNE_STEPS || 8));
  const phraseBoundarySteps = Math.max(
    1,
    Math.trunc(Number(getCallResponseWindowSteps?.() || policy.phraseBoundaryFallbackSteps || 4))
  );
  const minBarsSinceMajorIdentity = Math.max(0, Math.trunc(Number(policy.minBarsSinceMajorIdentity) || 0));
  const loopRegistrationCycles = Math.max(0, Math.trunc(Number(policy.loopRegistrationCycles) || 2));
  const minLayerSpacingBars = Math.max(0, Math.trunc(Number(policy.minLayerSpacingBars) || 4));
  const stateMap = policy?.minCompletedLoopsBeforeNextByPacingState || {};
  const minCompletedLoopsBeforeNext = Math.max(
    0,
    Math.trunc(Number(stateMap[pacingState]) || Number(stateMap.main_mid) || 1)
  );
  return {
    loopLengthSteps,
    phraseBoundarySteps,
    minBarsSinceMajorIdentity,
    loopRegistrationCycles,
    minLayerSpacingBars,
    minCompletedLoopsBeforeNext,
  };
}
function getRegistrationGateTunables() {
  const pacingState = String(getCurrentPacingStateName() || '').trim().toLowerCase();
  const policy = REGISTRATION_GATE_POLICY || {};
  const mapBars = policy?.minBarsBetweenMajorIdentityByPacingState || {};
  const mapLoops = policy?.minLoopCompletionsBetweenMajorIdentityByPacingState || {};
  const mapCap = policy?.maxForegroundIdentitiesByPacingState || {};
  return {
    minBarsBetweenMajorIdentity: Math.max(
      0,
      Math.trunc(Number(mapBars[pacingState]) || Number(mapBars.main_mid) || 1)
    ),
    minLoopCompletionsBetweenMajorIdentity: Math.max(
      0,
      Math.trunc(Number(mapLoops[pacingState]) || Number(mapLoops.main_mid) || 1)
    ),
    maxForegroundIdentities: Math.max(
      1,
      Math.trunc(Number(mapCap[pacingState]) || Number(mapCap.main_mid) || 2)
    ),
  };
}
function getForegroundIdentityCompletedLoops(stepAbs = 0, tunables = null) {
  const key = String(loopAdmissionRuntime.currentForegroundIdentityKey || '').trim().toLowerCase();
  const loopLen = Math.max(1, Math.trunc(Number(tunables?.loopLengthSteps) || WEAPON_TUNE_STEPS || 8));
  let start = Math.trunc(Number(loopAdmissionRuntime.currentForegroundIdentityStartStep) || -1);
  if (!key || !(start >= 0)) {
    const foundationBar = Math.max(-1, Math.trunc(Number(musicLayerRuntime.foundationAnchorBar) || -1));
    if (foundationBar >= 0) start = foundationBar * loopLen;
  }
  if (!(start >= 0)) return 0;
  const now = Math.max(0, Math.trunc(Number(stepAbs) || 0));
  if (now <= start) return 0;
  return Math.max(0, Math.floor((now - start) / loopLen));
}
function getFoundationCompletedLoopCycles(stepAbs = 0, tunables = null) {
  const loopLen = Math.max(1, Math.trunc(Number(tunables?.loopLengthSteps) || WEAPON_TUNE_STEPS || 8));
  const startStep = Math.trunc(Number(musicLayerRuntime.foundationAnchorStep) || -1);
  if (!(startStep >= 0)) return 0;
  const now = Math.max(0, Math.trunc(Number(stepAbs) || 0));
  if (now <= startStep) return 0;
  return Math.max(0, Math.floor((now - startStep) / loopLen));
}
function shouldHoldIntroLayerExpansion(stepAbs = 0) {
  const pacingState = String(getCurrentPacingStateName() || '').trim().toLowerCase();
  if (pacingState === 'intro_bass') return true;
  if (pacingState !== 'intro_response') return false;
  const loopTunables = getLoopAdmissionTunables();
  const bassMinLoopCycles = Math.max(1, Math.trunc(Number(MUSIC_LAYER_POLICY.bassMinLoopCycles) || 2));
  const foundationLoopCycles = getFoundationCompletedLoopCycles(stepAbs, loopTunables);
  return foundationLoopCycles < bassMinLoopCycles;
}
function shouldAdmitMajorForegroundIdentity(identityKey = '', stepAbs = 0, barIndex = 0, options = null) {
  const key = String(identityKey || '').trim().toLowerCase();
  if (!key) return false;
  const opts = options && typeof options === 'object' ? options : {};
  const step = Math.max(0, Math.trunc(Number(stepAbs) || 0));
  const bar = Math.max(0, Math.trunc(Number(barIndex) || 0));
  const loopTunables = getLoopAdmissionTunables();
  const registrationTunables = getRegistrationGateTunables();
  const knownIdentity = loopAdmissionRuntime.identityFirstForegroundStep.has(key);
  if (knownIdentity) return true;
  const requireBoundary = opts.requireBoundary === true;
  if (requireBoundary) {
    const isBarBoundary = (step % Math.max(1, loopTunables.loopLengthSteps)) === 0;
    const isPhraseBoundary = (step % Math.max(1, loopTunables.phraseBoundarySteps)) === 0;
    if (!isBarBoundary && !isPhraseBoundary) return false;
  }
  const lastIntro = Math.max(-1, Math.trunc(Number(loopAdmissionRuntime.lastMajorIdentityIntroStep) || -1));
  if (lastIntro >= 0) {
    const minGapStepsByBars = Math.max(0, registrationTunables.minBarsBetweenMajorIdentity) * Math.max(1, loopTunables.loopLengthSteps);
    if ((step - lastIntro) < minGapStepsByBars) return false;
    const loopsSinceLastIntro = Math.max(0, Math.floor((step - lastIntro) / Math.max(1, loopTunables.loopLengthSteps)));
    if (loopsSinceLastIntro < Math.max(0, registrationTunables.minLoopCompletionsBetweenMajorIdentity)) return false;
  }
  loopAdmissionRuntime.identityFirstForegroundStep.set(key, step);
  loopAdmissionRuntime.lastMajorIdentityIntroStep = step;
  if (opts.markAsCurrentForeground === true) {
    loopAdmissionRuntime.currentForegroundIdentityKey = key;
    loopAdmissionRuntime.currentForegroundIdentityStartStep = step;
    loopAdmissionRuntime.currentForegroundIdentityLayer = String(opts.layer || '').trim().toLowerCase();
  }
  return true;
}
function shouldAdmitNewForegroundIdentity(identityKey = '', stepAbs = 0, barIndex = 0) {
  const key = String(identityKey || '').trim().toLowerCase();
  if (!key) return false;
  const step = Math.max(0, Math.trunc(Number(stepAbs) || 0));
  const bar = Math.max(0, Math.trunc(Number(barIndex) || 0));
  const tunables = getLoopAdmissionTunables();
  const knownIdentity = loopAdmissionRuntime.identityFirstForegroundStep.has(key);
  if (knownIdentity) return true;
  const completedLoops = getForegroundIdentityCompletedLoops(step, tunables);
  const requiredRegistrationCycles = Math.max(
    0,
    Math.max(
      Math.trunc(Number(tunables.minCompletedLoopsBeforeNext) || 0),
      Math.trunc(Number(tunables.loopRegistrationCycles) || 0)
    )
  );
  if (completedLoops < requiredRegistrationCycles) return false;
  const lastForeground = Math.max(-1, Math.trunc(Number(loopAdmissionRuntime.lastMajorIdentityIntroStep) || -1));
  if (lastForeground >= 0) {
    const minLayerSpacingBars = Math.max(
      0,
      Math.max(
        Math.trunc(Number(tunables.minBarsSinceMajorIdentity) || 0),
        Math.trunc(Number(tunables.minLayerSpacingBars) || 0)
      )
    );
    const minLayerSpacingSteps = minLayerSpacingBars * Math.max(1, Math.trunc(Number(tunables.loopLengthSteps) || WEAPON_TUNE_STEPS || 8));
    if ((step - lastForeground) < minLayerSpacingSteps) return false;
  }
  return shouldAdmitMajorForegroundIdentity(key, step, bar, {
    requireBoundary: true,
    markAsCurrentForeground: true,
    layer: 'loops',
  });
}
function getEnemyEventMusicProminence(ev, context = null) {
  if (!ev || typeof ev !== 'object') return 'quiet';
  const action = String(ev.actionType || '').trim().toLowerCase();
  const beat = Math.max(0, Math.trunc(Number(ev?.beatIndex) || 0));
  const bar = Math.max(0, Math.trunc(Number(context?.barIndex) || Math.floor(beat / Math.max(1, COMPOSER_BEATS_PER_BAR))));
  const stepAbs = Math.max(0, Math.trunc(Number(ev?.stepIndex) || 0));
  const actor = Math.max(0, Math.trunc(Number(ev?.actorId) || 0));
  const enemyType = String(ev?.enemyType || ev?.payload?.enemyType || '').trim().toLowerCase();
  const identity = getEnemyMusicIdentityProfile({ enemyType, role: ev?.role }, BEAT_EVENT_ROLES.ACCENT);
  const defaultProminence = String(identity?.defaultProminence || 'quiet').trim().toLowerCase() || 'quiet';
  const playerLikelyAudible = context?.playerLikelyAudible === true;
  const layer = normalizeEnemyMusicLayer(context?.musicLayer || getEnemyEventMusicLayer(ev), 'sparkle');
  const onboarding = getOnboardingReadabilityDirective(bar);
  const allowLayers = onboarding?.allowLayers || { foundation: true, loops: true, sparkle: true };
  const layerAllowed = layer === 'foundation'
    ? allowLayers.foundation !== false
    : (layer === 'loops' ? allowLayers.loops !== false : allowLayers.sparkle !== false);
  const foundationProminenceFloorRaw = String(MUSIC_LAYER_POLICY.foundationProminenceFloor || 'quiet').trim().toLowerCase();
  const resolveFoundationProminenceFloor = (prominence) => {
    const p = String(prominence || 'quiet').trim().toLowerCase();
    const rankByProminence = { suppressed: 0, trace: 1, quiet: 2, full: 3 };
    const floorRank = Number.isFinite(rankByProminence[foundationProminenceFloorRaw])
      ? rankByProminence[foundationProminenceFloorRaw]
      : rankByProminence.quiet;
    const baseRank = Number.isFinite(rankByProminence[p]) ? rankByProminence[p] : rankByProminence.quiet;
    if (baseRank >= floorRank) return p;
    if (floorRank >= rankByProminence.full) return 'full';
    if (floorRank >= rankByProminence.quiet) return 'quiet';
    if (floorRank >= rankByProminence.trace) return 'trace';
    return 'suppressed';
  };
  if (!layerAllowed) return layer === 'foundation' ? resolveFoundationProminenceFloor('quiet') : 'suppressed';
  const identityKey = getEnemyEventIdentityKey(ev, layer);
  const identityFirstBar = onboardingRuntime.identityFirstHeardBar.get(identityKey);
  const identityKnown = Number.isFinite(identityFirstBar);
  const allowNewEnemyTypes = onboarding?.allowNewEnemyTypes instanceof Set
    ? onboarding.allowNewEnemyTypes
    : null;
  if (!identityKnown && allowNewEnemyTypes && allowNewEnemyTypes.size > 0) {
    const typeKey = enemyType || 'unknown';
    const allowedByPhase = allowNewEnemyTypes.has(typeKey) || allowNewEnemyTypes.has('any');
    if (!allowedByPhase) {
      return layer === 'foundation' ? 'quiet' : 'trace';
    }
  }
  const recentNovelCount = getOnboardingRecentNovelIdentityCount(bar, onboarding?.noveltyWindowBars || 8);
  if (!identityKnown && recentNovelCount >= Math.max(1, Math.trunc(Number(onboarding?.maxNewIdentitiesRecent) || 1))) {
    return layer === 'foundation' ? 'quiet' : 'trace';
  }
  const foregroundAssigned = Math.max(0, Math.trunc(Number(context?.foregroundAssigned) || 0));
  const sparkleAssigned = Math.max(0, Math.trunc(Number(context?.sparkleAssigned) || 0));
  const foregroundIdentityCount = Math.max(0, Math.trunc(Number(context?.foregroundIdentityCount) || 0));
  const loopForegroundIdentityCount = Math.max(0, Math.trunc(Number(context?.loopForegroundIdentityCount) || 0));
  const foundationAssigned = context?.foundationAssigned === true;
  const registrationTunables = getRegistrationGateTunables();
  const loopTunables = getLoopAdmissionTunables();
  const foregroundVoiceLimit = Math.max(
    1,
    Math.min(
      Math.trunc(Number(MUSIC_LAYER_POLICY.foregroundVoiceLimit) || 2),
      Math.trunc(Number(onboarding?.maxForeground) || 2),
      Math.trunc(Number(registrationTunables?.maxForegroundIdentities) || 2)
    )
  );
  const foregroundIdentityLimit = Math.max(
    1,
    Math.trunc(Number(MUSIC_LAYER_POLICY.foregroundIdentityLimit) || 3)
  );
  const loopForegroundIdentityLimit = Math.max(
    1,
    Math.trunc(Number(MUSIC_LAYER_POLICY.primaryLoopIdentityLimit) || 1)
    + Math.max(0, Math.trunc(Number(MUSIC_LAYER_POLICY.secondaryLoopIdentityLimit) || 1))
  );
  const sparkleMaxDensity = Math.max(0, Math.trunc(Number(MUSIC_LAYER_POLICY.sparkleMaxDensity) || 1));
  const sparkleMaxDensityPerBar = Math.max(0, Math.trunc(Number(MUSIC_LAYER_POLICY.sparkleMaxDensityPerBar) || 2));
  const sparkleCannotOverrideLoops = MUSIC_LAYER_POLICY.sparkleCannotOverrideLoops !== false;
  const sparkleCannotOverrideFoundation = MUSIC_LAYER_POLICY.sparkleCannotOverrideFoundation !== false;
  const lastFoundationBar = Math.max(-1, Math.trunc(Number(musicLayerRuntime.lastFoundationBar) || -1));
  const foundationRecentlyActive = lastFoundationBar >= 0 && (bar - lastFoundationBar) <= 1;
  const currentForegroundIdentityLayer = String(loopAdmissionRuntime.currentForegroundIdentityLayer || '').trim().toLowerCase();
  const currentForegroundIdentityKey = String(loopAdmissionRuntime.currentForegroundIdentityKey || '').trim().toLowerCase();
  const loopRegistrationCycles = Math.max(
    0,
    Math.max(
      Math.trunc(Number(loopTunables.minCompletedLoopsBeforeNext) || 0),
      Math.trunc(Number(loopTunables.loopRegistrationCycles) || 0)
    )
  );
  const loopRegistrationActive = currentForegroundIdentityLayer === 'loops'
    && !!currentForegroundIdentityKey
    && getForegroundIdentityCompletedLoops(stepAbs, loopTunables) < loopRegistrationCycles;
  const idx = Math.max(0, Math.trunc(Number(context?.enemyIndex) || 0));
  const total = Math.max(1, Math.trunc(Number(context?.totalEnemyEvents) || 1));
  const seed = hashStringSeed(`prominence|${beat}|${bar}|${actor}|${action}|${layer}|${idx}|${total}`);
  const roll = seededNoise01(seed);
  const bassMinLoopCycles = Math.max(1, Math.trunc(Number(MUSIC_LAYER_POLICY.bassMinLoopCycles) || 2));
  const foundationLoopCycles = getFoundationCompletedLoopCycles(stepAbs, loopTunables);
  if (layer !== 'foundation' && foundationLoopCycles < bassMinLoopCycles) {
    return layer === 'loops'
      ? (playerLikelyAudible ? 'trace' : 'quiet')
      : (playerLikelyAudible ? 'trace' : 'suppressed');
  }
  if (layer === 'foundation') {
    const foundationMinCycles = Math.max(1, Math.trunc(Number(MUSIC_LAYER_POLICY.foundationMinCycles) || 3));
    const foundationResetAllowed = MUSIC_LAYER_POLICY.foundationResetAllowed === true;
    const currentSectionId = String(composerRuntime.currentSectionId || 'default').trim().toLowerCase() || 'default';
    if (!(musicLayerRuntime.foundationAnchorBar >= 0)) musicLayerRuntime.foundationAnchorBar = bar;
    if (!String(musicLayerRuntime.foundationAnchorSectionId || '').trim()) {
      musicLayerRuntime.foundationAnchorSectionId = currentSectionId;
    }
    if (!(musicLayerRuntime.foundationAnchorStep >= 0)) musicLayerRuntime.foundationAnchorStep = stepAbs;
    if (!(musicLayerRuntime.foundationIdentityStartStep >= 0)) musicLayerRuntime.foundationIdentityStartStep = stepAbs;
    if (!String(musicLayerRuntime.foundationIdentityKey || '').trim()) {
      musicLayerRuntime.foundationIdentityKey = identityKey;
    }
    if (
      foundationResetAllowed
      && musicLayerRuntime.lastFoundationBar >= 0
      && (bar - musicLayerRuntime.lastFoundationBar) > 1
    ) {
      musicLayerRuntime.foundationAnchorBar = bar;
      musicLayerRuntime.foundationAnchorSectionId = currentSectionId;
      musicLayerRuntime.foundationAnchorStep = stepAbs;
    }
    const commitFoundationProminence = (prominence) => {
      const p = resolveFoundationProminenceFloor(prominence);
      musicLayerRuntime.lastFoundationBar = bar;
      musicLayerRuntime.lastFoundationStep = stepAbs;
      if (p === 'full') {
        musicLayerRuntime.foundationLastFullBar = bar;
        musicLayerRuntime.foundationLastFullStep = stepAbs;
        musicLayerRuntime.foundationConsecutiveQuietEvents = 0;
      } else if (p === 'quiet' || p === 'trace' || p === 'suppressed') {
        musicLayerRuntime.foundationConsecutiveQuietEvents = Math.max(
          0,
          Math.trunc(Number(musicLayerRuntime.foundationConsecutiveQuietEvents) || 0)
        ) + 1;
      }
      return p;
    };
    const continuityBars = Math.max(1, (bar - Math.max(0, musicLayerRuntime.foundationAnchorBar)) + 1);
    const foundationMinBars = Math.max(1, Math.trunc(Number(MUSIC_LAYER_POLICY.foundationMinBars) || 4));
    const forceFullEveryBars = Math.max(1, Math.trunc(Number(MUSIC_LAYER_POLICY.foundationForceFullEveryBars) || 1));
    const maxConsecutiveQuietEvents = Math.max(1, Math.trunc(Number(MUSIC_LAYER_POLICY.foundationMaxConsecutiveQuietEvents) || 2));
    const lastFullBar = Math.max(-1, Math.trunc(Number(musicLayerRuntime.foundationLastFullBar) || -1));
    const barsSinceLastFull = lastFullBar >= 0 ? Math.max(0, bar - lastFullBar) : Number.POSITIVE_INFINITY;
    const quietRun = Math.max(0, Math.trunc(Number(musicLayerRuntime.foundationConsecutiveQuietEvents) || 0));
    const shouldForceFull = barsSinceLastFull >= forceFullEveryBars || quietRun >= maxConsecutiveQuietEvents;
    const foundationIdentityStartStep = Math.max(
      0,
      Math.trunc(Number(musicLayerRuntime.foundationIdentityStartStep) || stepAbs)
    );
    const foundationIdentityCompletedCycles = stepAbs > foundationIdentityStartStep
      ? Math.max(0, Math.floor((stepAbs - foundationIdentityStartStep) / Math.max(1, loopTunables.loopLengthSteps)))
      : 0;
    const foundationIdentityKey = String(musicLayerRuntime.foundationIdentityKey || '').trim().toLowerCase();
    const identityChanging = !!foundationIdentityKey && foundationIdentityKey !== identityKey;
    if (identityChanging && foundationIdentityCompletedCycles < foundationMinCycles) {
      return commitFoundationProminence('quiet');
    }
    if (identityChanging) {
      musicLayerRuntime.foundationIdentityKey = identityKey;
      musicLayerRuntime.foundationIdentityStartStep = stepAbs;
    }
    if (!foundationAssigned && continuityBars <= foundationMinBars) {
      if (!shouldAdmitMajorForegroundIdentity(identityKey, stepAbs, bar, {
        requireBoundary: true,
        markAsCurrentForeground: true,
        layer: 'foundation',
      })) {
        return commitFoundationProminence(shouldForceFull ? 'full' : 'quiet');
      }
      return commitFoundationProminence('full');
    }
    if (playerLikelyAudible) {
      return commitFoundationProminence(shouldForceFull ? 'full' : 'quiet');
    }
    if (shouldForceFull) return commitFoundationProminence('full');
    return commitFoundationProminence(roll < 0.62 ? 'full' : 'quiet');
  }
  if (layer === 'loops') {
    if (foregroundIdentityCount >= foregroundIdentityLimit) return playerLikelyAudible ? 'trace' : 'quiet';
    if (loopForegroundIdentityCount >= loopForegroundIdentityLimit) return playerLikelyAudible ? 'trace' : 'quiet';
    if (foregroundAssigned >= foregroundVoiceLimit) return playerLikelyAudible ? 'trace' : 'quiet';
    if (playerLikelyAudible) return 'trace';
    let candidate = 'quiet';
    if (defaultProminence === 'full') candidate = roll < 0.42 ? 'full' : 'quiet';
    else if (defaultProminence === 'trace') candidate = roll < 0.1 ? 'quiet' : 'trace';
    else candidate = roll < 0.3 ? 'full' : 'quiet';
    if (candidate !== 'full') return candidate;
    const admitted = shouldAdmitNewForegroundIdentity(identityKey, stepAbs, bar);
    if (!admitted) return 'trace';
    return 'full';
  }
  const commitSparkleProminence = (prominence) => {
    const p = String(prominence || 'trace').trim().toLowerCase();
    if (musicLayerRuntime.sparkleBarIndex !== bar) {
      musicLayerRuntime.sparkleBarIndex = bar;
      musicLayerRuntime.sparkleEventsInBar = 0;
    }
    if (p !== 'suppressed') {
      musicLayerRuntime.sparkleEventsInBar = Math.max(
        0,
        Math.trunc(Number(musicLayerRuntime.sparkleEventsInBar) || 0)
      ) + 1;
    }
    return p;
  };
  const sparkleEventsInBar = musicLayerRuntime.sparkleBarIndex === bar
    ? Math.max(0, Math.trunc(Number(musicLayerRuntime.sparkleEventsInBar) || 0))
    : 0;
  const authoritativeForegroundActive = foundationAssigned
    || foundationRecentlyActive
    || loopForegroundIdentityCount > 0
    || loopRegistrationActive;
  if (sparkleEventsInBar >= sparkleMaxDensityPerBar) return commitSparkleProminence('suppressed');
  if (sparkleAssigned >= sparkleMaxDensity) return commitSparkleProminence('suppressed');
  if (!authoritativeForegroundActive) return commitSparkleProminence('suppressed');
  if (loopRegistrationActive) return commitSparkleProminence('suppressed');
  if (foregroundAssigned >= 2 || foregroundIdentityCount >= 2) return commitSparkleProminence('suppressed');
  if (sparkleCannotOverrideFoundation && foundationAssigned) return commitSparkleProminence('trace');
  if (sparkleCannotOverrideLoops && loopForegroundIdentityCount > 0) return commitSparkleProminence('trace');
  if (foregroundIdentityCount >= foregroundIdentityLimit) return commitSparkleProminence('trace');
  if (foregroundAssigned >= foregroundVoiceLimit) return commitSparkleProminence('trace');
  if (action === 'enemy-death-accent') return commitSparkleProminence(playerLikelyAudible ? 'trace' : 'quiet');
  return commitSparkleProminence(playerLikelyAudible ? 'trace' : (roll < 0.12 ? 'quiet' : 'trace'));
}
function shouldKeepEnemyEventDuringPlayerStep(ev, keepCount = 0) {
  const style = getSwarmStyleProfile();
  const playerProminence = clamp01(Number(style?.playerProminence) || 0);
  if (!ev || typeof ev !== 'object') return false;
  const action = String(ev.actionType || '').trim().toLowerCase();
  if (!action) return false;
  if (action === 'player-weapon-step') return true;
  if (action === 'spawner-spawn') return true;
  if (action === 'drawsnake-projectile') return true;
  if (action === 'composer-group-projectile') return true;
  if (action === 'composer-group-explosion') return true;
  const actor = Math.max(0, Math.trunc(Number(ev?.actorId) || 0));
  if (keepCount >= PLAYER_MASK_MAX_ENEMY_EVENTS_PER_STEP) return false;
  const beat = Math.max(0, Math.trunc(Number(ev?.beatIndex) || 0));
  const step = Math.max(0, Math.trunc(Number(ev?.stepIndex) || 0));
  const keepChanceRaw = Number(PLAYER_MASK_STEP_EVENT_KEEP_CHANCE[action]);
  const keepChanceBase = Number.isFinite(keepChanceRaw)
    ? keepChanceRaw
    : Number(PLAYER_MASK_STEP_EVENT_KEEP_CHANCE.default);
  const keepChance = Math.max(0, Math.min(1, keepChanceBase * (1 - (0.7 * playerProminence))));
  const seed = hashStringSeed(`mask-step|${beat}|${step}|${actor}|${action}`);
  return seededNoise01(seed) < keepChance;
}
function clampNoteToDirectorPool(noteName, fallbackIndex = 0) {
  const director = ensureSwarmDirector();
  const normalized = normalizeSwarmNoteName(noteName);
  const fallbackNote = director.pickNoteFromPool(Math.trunc(Number(fallbackIndex) || 0));
  const clamped = director.clampNoteToPool(normalized || fallbackNote, fallbackIndex);
  return normalizeSwarmNoteName(clamped) || normalizeSwarmNoteName(fallbackNote) || getRandomSwarmPentatonicNote();
}
function collectDrawSnakeStepBeatEvents(stepIndex, beatIndex = currentBeatIndex) {
  return collectDrawSnakeStepEvents({
    active,
    gameplayPaused,
    stepIndex,
    beatIndex,
    stepsPerBar: WEAPON_TUNE_STEPS,
    notePoolSize: SWARM_PENTATONIC_NOTES_ONE_OCTAVE.length,
    enemies,
    getCurrentPacingCaps,
    getEnemyMusicGroup,
    normalizeMusicLifecycleState,
    isCallResponseLaneActive,
    getPhraseStepState,
    getSwarmPentatonicNoteByIndex,
    normalizePhraseGravityNoteList,
    pickClosestPhraseGravityTarget,
    normalizeSwarmNoteName,
    resolveSwarmRoleInstrumentId,
    normalizeSwarmRole,
    getSwarmRoleForEnemy,
    resolveSwarmSoundInstrumentId,
    createLoggedPerformedBeatEvent,
    getDrawSnakeNodeIndexForStep,
    drawSnakeSegmentCount: DRAW_SNAKE_SEGMENT_COUNT,
    clamp01,
    roles: {
      lead: BEAT_EVENT_ROLES.LEAD,
    },
    threat: {
      full: BEAT_EVENT_THREAT.FULL,
    },
    styleProfile: getSwarmStyleProfile(),
  });
}
function collectSpawnerStepBeatEvents(stepIndex, beatIndex) {
  return collectSpawnerStepEvents({
    active,
    gameplayPaused,
    stepIndex,
    beatIndex,
    enemies,
    getEnemyMusicGroup,
    normalizeMusicLifecycleState,
    normalizeSwarmNoteName,
    clampNoteToDirectorPool,
    resolveSwarmRoleInstrumentId,
    inferInstrumentLaneFromCatalogId,
    normalizeSwarmRole,
    getSwarmRoleForEnemy,
    resolveSwarmSoundInstrumentId,
    createLoggedPerformedBeatEvent,
    clamp01,
    roles: {
      bass: BEAT_EVENT_ROLES.BASS,
    },
    threat: {
      full: BEAT_EVENT_THREAT.FULL,
    },
    styleProfile: getSwarmStyleProfile(),
  });
}
function executePerformedBeatEvent(event) {
  return executePerformedBeatEventRuntime({
    event,
    constants: {
      composerBeatsPerBar: COMPOSER_BEATS_PER_BAR,
      roles: BEAT_EVENT_ROLES,
      threat: BEAT_EVENT_THREAT,
      spawnerTriggerSoundVolume: SPAWNER_ENEMY_TRIGGER_SOUND_VOLUME,
      playerMaskDuckEnemyVolumeMult: PLAYER_MASK_DUCK_ENEMY_VOLUME_MULT,
      spawnerLinkedAttackSpeed: SPAWNER_LINKED_ATTACK_SPEED,
      drawSnakeTriggerSoundVolume: DRAW_SNAKE_TRIGGER_SOUND_VOLUME,
      composerGroupActionPulseSeconds: COMPOSER_GROUP_ACTION_PULSE_SECONDS,
      composerGroupProjectileSpeed: COMPOSER_GROUP_PROJECTILE_SPEED,
      supportTraceGain: MUSIC_LAYER_POLICY.supportTraceGain,
      supportQuietGain: MUSIC_LAYER_POLICY.supportQuietGain,
      swarmSoundEvents: SWARM_SOUND_EVENTS,
    },
    helpers: {
      getMusicLabContext,
      noteMusicSystemEvent,
      getSwarmEnemyById,
      getEnemyMusicGroup,
      getEnemyAggressionScale,
      resolveSwarmRoleInstrumentId,
      inferInstrumentLaneFromCatalogId,
      getSwarmRoleForEnemy,
      resolveSwarmSoundInstrumentId,
      normalizeSwarmRole,
      clamp01,
      shouldKeepEnemyAudibleDuringPlayerDuck,
      clampNoteToDirectorPool,
      syncSingletonEnemyStateFromMusicGroup,
      triggerInstrument,
      flashSpawnerEnemyCell,
      getSpawnerNodeCellWorld,
      worldToScreen,
      spawnEnemyAt,
      updateSpawnerLinkedEnemyLine,
      getViewportCenterWorld,
      tryConsumeSwarmThreatIntent,
      triggerCosmeticSyncAt,
      triggerLowThreatBurstAt,
      pulseHitFlash,
      pulseEnemyMusicalRoleVisual,
      spawnHostileRedProjectileAt,
      randRange,
      fireDrawSnakeProjectile,
      flashDrawSnakeNode,
      addHostileRedExplosionEffect,
      resolveEnemyDeathEventKey,
      noteSwarmSoundEvent,
      fireConfiguredWeaponsOnBeat,
      isPlayerWeaponStepLikelyAudible,
    },
    state: {
      swarmMusicLab,
      currentEnemySpawnMaxHp,
      enemies,
    },
  });
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
  anchorEnemyId = null,
  stageIndex = null,
  damageScale = 1
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
    stageIndex: Number.isFinite(stageIndex) ? Math.trunc(stageIndex) : null,
    damageScale: Math.max(0.05, Number(damageScale) || 1),
    radiusWorld: Math.max(1, Number(radiusWorld) || EXPLOSION_RADIUS_WORLD),
    weaponSlotIndex: Number.isFinite(weaponSlotIndex) ? Math.trunc(weaponSlotIndex) : null,
    el,
  });
  noteMusicSystemEvent('weapon_explosion_prime_created', {
    chainEventId: Number.isFinite(chainEventId) ? Math.trunc(chainEventId) : 0,
    weaponSlotIndex: Number.isFinite(weaponSlotIndex) ? Math.trunc(weaponSlotIndex) : -1,
    impactEnemyId: Number.isFinite(anchorEnemyId) ? Math.trunc(anchorEnemyId) : 0,
    stageIndex: Number.isFinite(stageIndex) ? Math.trunc(stageIndex) : -1,
    damageScale: Math.max(0.05, Number(damageScale) || 1),
  }, {
    beatIndex: currentBeatIndex,
    stepIndex: Math.max(0, Math.trunc(Number(ensureSwarmDirector().getSnapshot()?.stepIndex) || 0)),
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
  clearPauseWeaponDragMarkersRuntime({
    state: { pauseScreenEl },
  });
}
function clearPauseWeaponDragProxy() {
  clearPauseWeaponDragProxyRuntime({
    state: { pauseWeaponDrag },
  });
}
function resetPauseWeaponDrag(suppressClick = false) {
  resetPauseWeaponDragRuntime({
    suppressClick,
    state: { pauseWeaponDrag },
    helpers: {
      clearPauseWeaponDragMarkers: () => clearPauseWeaponDragMarkers(),
      clearPauseWeaponDragProxy: () => clearPauseWeaponDragProxy(),
    },
  });
}
function getPauseWeaponStageCellFromEventTarget(target) {
  return getPauseWeaponStageCellFromEventTargetRuntime({ target });
}
function parsePauseWeaponStageCell(cellEl) {
  return parsePauseWeaponStageCellRuntime({
    cellEl,
    state: { weaponLoadout },
    helpers: { sanitizeWeaponStages },
  });
}
function getPauseWeaponDropTargetAtClient(clientX, clientY, sourceSlotIndex, sourceStageIndex) {
  return getPauseWeaponDropTargetAtClientRuntime({
    clientX,
    clientY,
    sourceSlotIndex,
    sourceStageIndex,
    state: { weaponLoadout },
    helpers: {
      getPauseWeaponStageCellFromEventTarget: ({ target }) => getPauseWeaponStageCellFromEventTarget(target),
      parsePauseWeaponStageCell: ({ cellEl }) => parsePauseWeaponStageCell(cellEl),
    },
  });
}
function reorderWeaponStages(slotIndex, fromStageIndex, dropBeforeStageIndex) {
  return reorderWeaponStagesRuntime({
    slotIndex,
    fromStageIndex,
    dropBeforeStageIndex,
    state: { weaponLoadout },
    helpers: { sanitizeWeaponStages },
  });
}
function updatePauseWeaponDragVisual(clientX, clientY) {
  updatePauseWeaponDragVisualRuntime({
    clientX,
    clientY,
    state: {
      pauseScreenEl,
      pauseWeaponDrag,
    },
    helpers: {
      clearPauseWeaponDragMarkers: () => clearPauseWeaponDragMarkers(),
      getPauseWeaponDropTargetAtClient: ({ clientX: x, clientY: y, sourceSlotIndex, sourceStageIndex }) =>
        getPauseWeaponDropTargetAtClient(x, y, sourceSlotIndex, sourceStageIndex),
    },
  });
}
function beginPauseWeaponDrag(clientX, clientY) {
  beginPauseWeaponDragRuntime({
    clientX,
    clientY,
    state: {
      pauseScreenEl,
      pauseWeaponDrag,
    },
    helpers: {
      updatePauseWeaponDragVisual: ({ clientX: x, clientY: y }) => updatePauseWeaponDragVisual(x, y),
    },
  });
}
function normalizeDir(dx, dy, fallbackX = 1, fallbackY = 0) {
  return normalizeDirRuntime({ dx, dy, fallbackX, fallbackY });
}
function pulseHitFlash(el) {
  pulseHitFlashRuntime({ el });
}
function getOffsetPoint(fromPoint, towardPoint, offsetDist, fallbackDir = null) {
  return getOffsetPointRuntime({
    fromPoint,
    towardPoint,
    offsetDist,
    fallbackDir,
    helpers: {
      normalizeDir: ({ dx, dy, fallbackX = 1, fallbackY = 0 }) => normalizeDir(dx, dy, fallbackX, fallbackY),
    },
  });
}
function getShipFacingDirWorld() {
  return getShipFacingDirWorldRuntime({ shipFacingDeg });
}
function getProjectileChainSpawnOffsetWorld() {
  return getProjectileChainSpawnOffsetWorldRuntime({
    zoomState: getZoomState?.(),
    projectileHitRadiusPx: PROJECTILE_HIT_RADIUS_PX,
    projectileChainSpawnOffsetWorld: PROJECTILE_CHAIN_SPAWN_OFFSET_WORLD,
  });
}
function countOrbitingHomingMissiles() {
  return countOrbitingHomingMissilesRuntime({ projectiles });
}
function spawnProjectileFromDirection(fromW, dirX, dirY, damage, nextStages = null, nextBeatIndex = null, chainContext = null) {
  spawnProjectileFromDirectionRuntime({
    fromW,
    dirX,
    dirY,
    damage,
    nextStages,
    nextBeatIndex,
    chainContext,
    state: {
      currentBeatIndex,
      enemyLayerEl,
      projectiles,
    },
    constants: {
      projectileCollisionGraceSeconds: PROJECTILE_COLLISION_GRACE_SECONDS,
      projectileLifetime: PROJECTILE_LIFETIME,
      projectileSpeed: PROJECTILE_SPEED,
    },
    helpers: {
      logWeaponTuneFireDebug,
      normalizeDir,
      sanitizeWeaponStages,
    },
  });
}
function spawnProjectile(fromW, toEnemy, damage, nextStages = null, nextBeatIndex = null, chainContext = null) {
  spawnProjectileRuntime({
    fromW,
    toEnemy,
    damage,
    nextStages,
    nextBeatIndex,
    chainContext,
    helpers: {
      spawnProjectileFromDirection: ({ fromW, dirX, dirY, damage, nextStages, nextBeatIndex, chainContext }) =>
        spawnProjectileFromDirection(fromW, dirX, dirY, damage, nextStages, nextBeatIndex, chainContext),
    },
  });
}
function spawnBoomerangProjectile(fromW, dirX, dirY, damage, nextStages = null, nextBeatIndex = null, chainContext = null) {
  spawnBoomerangProjectileRuntime({
    fromW,
    dirX,
    dirY,
    damage,
    nextStages,
    nextBeatIndex,
    chainContext,
    state: {
      enemyLayerEl,
      projectiles,
    },
    constants: {
      projectileBoomerangLoopSeconds: PROJECTILE_BOOMERANG_LOOP_SECONDS,
      projectileBoomerangRadiusWorld: PROJECTILE_BOOMERANG_RADIUS_WORLD,
      projectileCollisionGraceSeconds: PROJECTILE_COLLISION_GRACE_SECONDS,
    },
    helpers: {
      normalizeDir,
      sanitizeWeaponStages,
    },
  });
}
function spawnHomingMissile(fromW, damage, nextStages = null, nextBeatIndex = null, chainContext = null) {
  return spawnHomingMissileRuntime({
    fromW,
    damage,
    nextStages,
    nextBeatIndex,
    chainContext,
    state: {
      enemyLayerEl,
      projectiles,
    },
    constants: {
      projectileCollisionGraceSeconds: PROJECTILE_COLLISION_GRACE_SECONDS,
      projectileHomingMaxOrbiting: PROJECTILE_HOMING_MAX_ORBITING,
      projectileHomingOrbitAngVel: PROJECTILE_HOMING_ORBIT_ANG_VEL,
      projectileHomingOrbitRadiusWorld: PROJECTILE_HOMING_ORBIT_RADIUS_WORLD,
    },
    helpers: {
      countOrbitingHomingMissiles,
      sanitizeWeaponStages,
    },
  });
}
function queueWeaponChain(beatIndex, nextStages, context) {
  queueWeaponChainRuntime({
    beatIndex,
    nextStages,
    context,
    state: {
      pendingWeaponChainEvents,
    },
    constants: {
      explosionRadiusWorld: EXPLOSION_RADIUS_WORLD,
    },
    helpers: {
      addExplosionPrimeEffect,
      noteMusicSystemEvent,
      getPendingEnemyDeathByEnemyId,
      getNextWeaponChainEventId: () => weaponChainEventSeq++,
      getSecondsUntilQueuedChainBeat,
      normalizeSwarmNoteName,
      removeExplosionPrimeEffectsForEvent,
      sanitizeWeaponStages,
    },
  });
}
function clearBeamEffectsForWeaponSlot(slotIndex = null) {
  clearBeamEffectsForWeaponSlotRuntime({
    slotIndex,
    state: { effects },
  });
}
function clearPendingWeaponChainsForSlot(slotIndex = null) {
  clearPendingWeaponChainsForSlotRuntime({
    slotIndex,
    state: { pendingWeaponChainEvents },
    helpers: {
      noteMusicSystemEvent,
      removeExplosionPrimeEffectsForEvent,
    },
  });
}
function shouldPlayBeamSoundForBeat(slotIndex = null, beatIndex = currentBeatIndex) {
  const gateState = {
    beamSoundGateBeatIndex,
    beamSoundGateSlotKeys,
  };
  const shouldPlay = shouldPlayBeamSoundForBeatRuntime({
    slotIndex,
    beatIndex,
    state: gateState,
  });
  beamSoundGateBeatIndex = Number(gateState.beamSoundGateBeatIndex) || 0;
  return shouldPlay;
}
function applyAoeAt(point, variant = 'explosion', beatIndex = 0, weaponSlotIndex = null, avoidEnemyId = null, stageIndex = null, damageScale = 1, chainEventId = null) {
  const result = applyAoeAtRuntime({
    point,
    variant,
    beatIndex,
    weaponSlotIndex,
    avoidEnemyId,
    stageIndex,
    damageScale,
    state: {
      enemies,
      lingeringAoeZones,
    },
    constants: {
      explosionRadiusWorld: EXPLOSION_RADIUS_WORLD,
    },
    helpers: {
      addExplosionEffect,
      damageEnemy,
      getLoopInfo,
      withDamageSoundStage,
    },
  });
  if (String(variant || '').trim().toLowerCase() === 'explosion' && point) {
    noteMusicSystemEvent('weapon_explosion_applied', {
      chainEventId: Number.isFinite(chainEventId) ? Math.trunc(chainEventId) : 0,
      weaponSlotIndex: Number.isFinite(weaponSlotIndex) ? Math.trunc(weaponSlotIndex) : -1,
      impactEnemyId: Number.isFinite(avoidEnemyId) ? Math.trunc(avoidEnemyId) : 0,
      scheduledBeatIndex: Math.max(0, Math.trunc(Number(beatIndex) || 0)),
      damageScale: Math.max(0.05, Number(damageScale) || 1),
      detonationSource: 'apply_aoe',
    }, {
      beatIndex,
      stepIndex: Math.max(0, Math.trunc(Number(ensureSwarmDirector().getSnapshot()?.stepIndex) || 0)),
    });
  }
  return result;
}
function triggerWeaponStage(stage, originWorld, beatIndex, remainingStages = [], context = null) {
  triggerWeaponStageRuntime({
    stage,
    originWorld,
    beatIndex,
    remainingStages,
    context,
    state: {
      beamSustainStateBySlot,
      effects,
    },
    constants: {
      beamDamagePerSecond: BEAM_DAMAGE_PER_SECOND,
      helperTurretSpawnOffsetWorld: HELPER_TURRET_SPAWN_OFFSET_WORLD,
      projectileSplitAngleRad: PROJECTILE_SPLIT_ANGLE_RAD,
      swarmSoundEvents: SWARM_SOUND_EVENTS,
    },
    helpers: {
      addBeamEffect,
      addLaserEffect,
      applyAoeAt,
      damageEnemy,
      getGameplayBeatLen,
      getGameplayWeaponSoundVolume: (archetype = '', variant = '', stageIndex = 0) => {
        const safeArchetype = String(archetype || '').trim().toLowerCase();
        const safeVariant = String(variant || '').trim().toLowerCase();
        const base = Number(getStageSoundVolume(stageIndex)) || 0;
        const fullStrength = safeArchetype === 'aoe'
          || safeArchetype === 'laser'
          || (safeArchetype === 'projectile' && (safeVariant === 'boomerang' || safeVariant === 'homing-missile' || safeVariant === 'split-shot'));
        const resolved = fullStrength ? 1 : base;
        return Math.max(0, Math.min(1, resolved * PLAYER_WEAPON_SOUND_MIX_MULT));
      },
      getNearestEnemy,
      getOffsetPoint,
      getPlayerWeaponSoundEventKeyForStage,
      getProjectileChainSpawnOffsetWorld,
      getShipFacingDirWorld,
      getStageSoundVolume: (stageIndex = 0) => {
        const base = Number(getStageSoundVolume(stageIndex)) || 0;
        return Math.max(0, Math.min(1, base * PLAYER_WEAPON_SOUND_MIX_MULT));
      },
      getSwarmEnemySoundNoteById,
      logWeaponTuneFireDebug,
      normalizeDir,
      normalizeSwarmNoteName,
      noteSwarmSoundEvent,
      playSwarmSoundEventImmediate,
      queueWeaponChain,
      sanitizeWeaponStages,
      shouldMuteProjectileStageSound,
      shouldPlayBeamSoundForBeat,
      spawnBoomerangProjectile,
      spawnHelper,
      spawnHomingMissile,
      spawnProjectile,
      spawnProjectileFromDirection,
      triggerWeaponStage,
      withDamageSoundStage,
    },
  });
}
function processPendingWeaponChains(beatIndex) {
  processPendingWeaponChainsRuntime({
    beatIndex,
    state: { pendingWeaponChainEvents },
    helpers: {
      noteMusicSystemEvent,
      getViewportCenterWorld,
      removeExplosionPrimeEffectsForEvent,
      sanitizeWeaponStages,
      triggerWeaponStage,
    },
  });
}
function applyLingeringAoeBeat(beatIndex) {
  applyLingeringAoeBeatRuntime({
    beatIndex,
    state: {
      enemies,
      lingeringAoeZones,
    },
    constants: {
      explosionRadiusWorld: EXPLOSION_RADIUS_WORLD,
    },
    helpers: {
      damageEnemy,
      withDamageSoundStage,
    },
  });
}
function fireConfiguredWeaponsOnBeat(centerWorld, beatIndex, contextBeatIndex = beatIndex) {
  return fireConfiguredWeaponsOnBeatRuntime({
    centerWorld,
    beatIndex,
    contextBeatIndex,
    state: {
      activeWeaponSlotIndex,
      beamSustainStateBySlot,
      equippedWeapons,
      weaponDefs,
      weaponLoadout,
      weaponSubBoardState,
    },
    constants: {
      weaponTuneSteps: WEAPON_TUNE_STEPS,
    },
    helpers: {
      addLaserEffect,
      applyAoeAt,
      clearBeamEffectsForWeaponSlot,
      clearPendingWeaponChainsForSlot,
      damageEnemy,
      getNearestEnemy,
      getWeaponTuneActivityStats,
      getWeaponTuneDamageScale,
      getWeaponTuneStepNotes,
      logWeaponTuneFireDebug,
      pulsePlayerShipNoteFlash,
      sanitizeWeaponStages,
      spawnProjectile,
      triggerWeaponStage,
    },
  });
}
function updateBeatWeapons(centerWorld) {
  const director = ensureSwarmDirector();
  const transportStopState = {
    currentBeatIndex,
    lastBeatIndex,
    lastSpawnerEnemyStepIndex,
    lastWeaponTuneStepIndex,
    loopAdmissionRuntime,
    musicIdentityVisualRuntime,
    musicLayerRuntime,
    musicLaneRuntime,
    onboardingRuntime,
    sectionPresentationRuntime,
    swarmPacingRuntime,
  };
  if (handleTransportStoppedBeatUpdateRuntime({
    director,
    state: transportStopState,
    constants: {
      composerBeatsPerBar: COMPOSER_BEATS_PER_BAR,
    },
    helpers: {
      hideSectionHeading,
      isRunning,
      resetEnergyGravityRuntime,
      resetEnergyStateRuntime,
      resetReadabilityMetricsRuntime,
      updateSwarmDirectorDebugHud,
    },
  })) {
    lastBeatIndex = transportStopState.lastBeatIndex;
    lastSpawnerEnemyStepIndex = transportStopState.lastSpawnerEnemyStepIndex;
    lastWeaponTuneStepIndex = transportStopState.lastWeaponTuneStepIndex;
    return;
  }
  const preludeState = {
    currentBeatIndex,
    swarmPacingRuntime,
    swarmPaletteRuntime,
  };
  const prelude = handleBeatPreludeRuntime({
    director,
    state: preludeState,
    helpers: {
      applyEnergyStateForBar,
      getLoopInfo,
      updateComposerForBeat,
    },
  });
  if (!prelude) return;
  currentBeatIndex = preludeState.currentBeatIndex;
  const info = prelude.info;
  const tick = prelude.tick;
  const beatLen = prelude.beatLen;
  const beatIndex = prelude.beatIndex;
  const stepIndex = prelude.stepIndex;
  const barIndex = prelude.barIndex;
  const pacingSnapshot = prelude.pacingSnapshot;
  const paletteSnapshot = prelude.paletteSnapshot;
  const signatureState = {
    musicLabLastPacingSignature,
    musicLabLastPaletteSignature,
  };
  updateMusicLabSignaturesRuntime({
    beatIndex,
    barIndex,
    pacingSnapshot,
    paletteSnapshot,
    state: signatureState,
    helpers: {
      getMusicLabContext,
      swarmMusicLab,
    },
  });
  musicLabLastPacingSignature = String(signatureState.musicLabLastPacingSignature || '');
  musicLabLastPaletteSignature = String(signatureState.musicLabLastPaletteSignature || '');
  let spawnerStepStats = { activeSpawners: 0, triggeredSpawners: 0, spawnedEnemies: 0 };
  let onboardingPhase = '';
  let layerStepStats = null;
  let readabilityStepStats = null;
  let queuedStepEvents = 0;
  let drainedStepEvents = 0;
  const stepState = {
    lastSpawnerEnemyStepIndex,
    lastWeaponTuneStepIndex,
  };
  const stepUpdate = handleBeatStepChangeRuntime({
    beatIndex,
    stepIndex,
    barIndex,
    centerWorld,
    tick,
    director,
    state: stepState,
    constants: {
      roles: BEAT_EVENT_ROLES,
      threat: BEAT_EVENT_THREAT,
      weaponTuneSteps: WEAPON_TUNE_STEPS,
    },
    helpers: {
      collectComposerGroupStepBeatEvents,
      collectDrawSnakeStepBeatEvents,
      collectSpawnerStepBeatEvents,
      createBassFoundationKeepaliveEventRuntime,
      createLoggedPerformedBeatEvent,
      executePerformedBeatEvent,
      foldStepMetricsIntoReadabilityRuntime,
      getEnemyEventMusicLayer,
      getEnemyEventMusicProminence,
      getEnemyMusicIdentityProfile,
      getFoundationLaneSnapshot,
      getMusicLabContext,
      getOnboardingReadabilityDirective,
      getPlayerInstrumentStepDirective,
      isPlayerWeaponStepLikelyAudible,
      isPlayerWeaponTuneStepAuthoredActive,
      noteBassFoundationOwnerState,
      noteEnemyMusicIdentityExposure,
      noteMusicSystemEvent,
      noteNaturalBassStepRuntime,
      processBeatSwarmStepEventsRuntime,
      pushSwarmStepDebugEvent,
      shouldKeepEnemyEventDuringPlayerStep,
      swarmMusicLab,
    },
  });
  lastSpawnerEnemyStepIndex = stepState.lastSpawnerEnemyStepIndex;
  lastWeaponTuneStepIndex = stepState.lastWeaponTuneStepIndex;
  const stepChanged = !!stepUpdate?.stepChanged;
  spawnerStepStats = stepUpdate?.spawnerStepStats || spawnerStepStats;
  onboardingPhase = String(stepUpdate?.onboardingPhase || onboardingPhase || '').trim().toLowerCase();
  layerStepStats = stepUpdate?.layerStepStats || layerStepStats;
  readabilityStepStats = stepUpdate?.readabilityStepStats || readabilityStepStats;
  queuedStepEvents += Math.max(0, Math.trunc(Number(stepUpdate?.queuedStepEvents) || 0));
  drainedStepEvents += Math.max(0, Math.trunc(Number(stepUpdate?.drainedStepEvents) || 0));
  const beatTailState = {
    active,
    barrierPushCharge,
    lastBeatIndex,
    outerForceContinuousSeconds,
    releaseBeatLevel,
    releaseForcePrimed,
  };
  const beatTail = handleBeatTailRuntime({
    beatIndex,
    stepIndex,
    barIndex,
    beatLen,
    tick,
    director,
    state: beatTailState,
    constants: {
      swarmReleaseBeatLevelMax: SWARM_RELEASE_BEAT_LEVEL_MAX,
    },
    metrics: {
      stepChanged,
      spawnerStepStats,
      queuedStepEvents,
      drainedStepEvents,
    },
    helpers: {
      applyLingeringAoeBeat,
      fireHelpersOnBeat,
      getMusicLabContext,
      processPendingWeaponChains,
      pulseReactiveArrowCharge,
      shouldLogBeatSnapshots: () => !!swarmDirectorDebug.logBeats,
      swarmMusicLab,
      updateSwarmDirectorDebugHud,
    },
  });
  barrierPushCharge = Number(beatTailState.barrierPushCharge) || 0;
  lastBeatIndex = beatTailState.lastBeatIndex;
  releaseBeatLevel = Math.max(0, Number(beatTailState.releaseBeatLevel) || 0);
  releaseForcePrimed = !!beatTailState.releaseForcePrimed;
  if (!beatTail?.beatChanged) return;
}
function configureInitialSpawnerEnablement() {
  configureInitialSpawnerEnablementRuntime({
    state: {
      difficultyConfig,
      spawnerRuntime,
    },
  });
}
function getEnemySpawnScale(enemy) {
  return getEnemySpawnScaleRuntime({
    enemy,
    spawnStartScale: ENEMY_SPAWN_START_SCALE,
  });
}
function keepDrawSnakeEnemyOnscreen(enemy, dt) {
  return keepDrawSnakeEnemyOnscreenRuntimeWrapper({
    enemy,
    dt,
    constants: {
      drawSnakeScreenMarginPx: DRAW_SNAKE_SCREEN_MARGIN_PX,
      drawSnakeEdgePullRate: DRAW_SNAKE_EDGE_PULL_RATE,
    },
    helpers: {
      keepDrawSnakeEnemyOnscreenRuntime,
      worldToScreen,
      screenToWorld,
    },
  });
}
function updateEnemies(dt) {
  updateBeatSwarmEnemiesRuntime({
    constants: {
      enemyHitRadius: ENEMY_HIT_RADIUS,
      retiringRetreatDelaySec: RETIRING_RETREAT_DELAY_SEC,
      enemyMaxSpeed: ENEMY_MAX_SPEED,
      spawnerEnemySpeedMultiplier: SPAWNER_ENEMY_SPEED_MULTIPLIER,
      enemyAccel: ENEMY_ACCEL,
      drawSnakeTurnIntervalMin: DRAW_SNAKE_TURN_INTERVAL_MIN,
      drawSnakeTurnIntervalMax: DRAW_SNAKE_TURN_INTERVAL_MAX,
      drawSnakeTurnRateMin: DRAW_SNAKE_TURN_RATE_MIN,
      drawSnakeTurnRateMax: DRAW_SNAKE_TURN_RATE_MAX,
      drawSnakeWindFreqHz: DRAW_SNAKE_WIND_FREQ_HZ,
      swarmArenaRadiusWorld: SWARM_ARENA_RADIUS_WORLD,
      drawSnakeArenaBiasRadiusScale: DRAW_SNAKE_ARENA_BIAS_RADIUS_SCALE,
      drawSnakeArenaBiasStrength: DRAW_SNAKE_ARENA_BIAS_STRENGTH,
      composerGroupSeparationRadiusWorld: COMPOSER_GROUP_SEPARATION_RADIUS_WORLD,
      composerGroupSeparationForce: COMPOSER_GROUP_SEPARATION_FORCE,
      composerGroupActionPulseSeconds: COMPOSER_GROUP_ACTION_PULSE_SECONDS,
      composerGroupActionPulseScale: COMPOSER_GROUP_ACTION_PULSE_SCALE,
      musicRolePulseSeconds: Number(MUSIC_ROLE_PULSE_POLICY.seconds) || 0.24,
      musicRolePulseScale: Number(MUSIC_ROLE_PULSE_POLICY.softScale) || 0.08,
    },
    helpers: {
      getViewportCenterWorld,
      getZoomState,
      normalizeMusicLifecycleState,
      getLifecycleAggressionScale,
      updateSpawnerEnemyFlash,
      startEnemyRetreat,
      normalizeDir,
      worldToScreen,
      removeEnemy,
      getEnemySpawnScale,
      updateSpawnerLinkedEnemyLine,
      updateDrawSnakeVisual,
      randRange,
      keepDrawSnakeEnemyOnscreen,
    },
    state: {
      dt,
      enemies,
      difficultyConfig,
      arenaCenterWorld,
    },
  });
}
function spawnFallbackEnemyOffscreen() {
  spawnFallbackEnemyOffscreenRuntime({
    constants: {
      enemyFallbackSpawnMarginPx: ENEMY_FALLBACK_SPAWN_MARGIN_PX,
    },
    helpers: {
      getRandomOffscreenSpawnPoint: (runtimeOptions = null) => getRandomOffscreenSpawnPoint(runtimeOptions),
      spawnEnemyAt,
    },
  });
}
function getRandomOffscreenSpawnPoint() {
  return getRandomOffscreenSpawnPointRuntime({
    constants: {
      enemyFallbackSpawnMarginPx: ENEMY_FALLBACK_SPAWN_MARGIN_PX,
    },
    helpers: { randRange },
  });
}
function spawnComposerGroupEnemyAt(clientX, clientY, group) {
  const created = spawnComposerGroupEnemyAtRuntime({
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
  if (created) applyMusicalIdentityVisualToEnemy(created, group);
  return created;
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
  return getAliveEnemiesByIdsRuntime({
    idSet,
    state: { enemies },
  });
}
function spawnHostileRedProjectileAt(origin, opts = null) {
  spawnHostileRedProjectileAtRuntime({
    origin,
    opts,
    state: {
      enemyLayerEl,
      projectiles,
    },
    constants: {
      composerGroupProjectileSpeed: COMPOSER_GROUP_PROJECTILE_SPEED,
      projectileLifetime: PROJECTILE_LIFETIME,
    },
    helpers: {
      normalizeSwarmNoteName,
      resolveInstrumentIdOrFallback,
      resolveSwarmSoundInstrumentId,
    },
  });
}
function addHostileRedExplosionEffect(centerW, radiusWorld = COMPOSER_GROUP_EXPLOSION_RADIUS_WORLD, ttlOverride = COMPOSER_GROUP_EXPLOSION_TTL) {
  addHostileRedExplosionEffectRuntime({
    centerW,
    radiusWorld,
    ttlOverride,
    state: {
      enemyLayerEl,
      effects,
    },
    constants: {
      composerGroupExplosionRadiusWorld: COMPOSER_GROUP_EXPLOSION_RADIUS_WORLD,
      composerGroupExplosionTtl: COMPOSER_GROUP_EXPLOSION_TTL,
    },
  });
}
function triggerCosmeticSyncAt(origin, beatIndex, reason = 'cosmetic-sync', actorEl = null) {
  return triggerCosmeticSyncAtRuntime({
    origin,
    beatIndex,
    reason,
    actorEl,
    constants: {
      lowThreatBurstRadiusWorld: LOW_THREAT_BURST_RADIUS_WORLD,
      lowThreatBurstTtl: LOW_THREAT_BURST_TTL,
    },
    helpers: {
      addHostileRedExplosionEffect,
      pulseHitFlash,
      tryConsumeSwarmThreatIntent,
    },
  });
}
function triggerLowThreatBurstAt(origin, beatIndex, reason = 'low-threat-burst') {
  return triggerLowThreatBurstAtRuntime({
    origin,
    beatIndex,
    reason,
    constants: {
      lowThreatBurstRadiusWorld: LOW_THREAT_BURST_RADIUS_WORLD,
      lowThreatBurstTtl: LOW_THREAT_BURST_TTL,
    },
    helpers: {
      addHostileRedExplosionEffect,
      triggerCosmeticSyncAt,
      tryConsumeSwarmThreatIntent,
    },
  });
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
    inferInstrumentLaneFromCatalogId,
    getSwarmRoleForEnemy,
    resolveSwarmRoleInstrumentId,
    resolveSwarmSoundInstrumentId,
    createPerformedBeatEvent: (evt) => createLoggedPerformedBeatEvent(evt, {
      sourceSystem: 'group',
      enemyType: 'composer-group-member',
      groupId: Math.max(0, Math.trunc(Number(evt?.payload?.groupId) || 0)),
      beatIndex: Math.max(0, Math.trunc(Number(evt?.beatIndex) || 0)),
      stepIndex: Math.max(0, Math.trunc(Number(evt?.stepIndex) || 0)),
    }),
    isLifecycleSchedulable,
    styleProfile: getSwarmStyleProfile(),
  });
}
function maintainComposerEnemyGroups() {
  maintainComposerEnemyGroupsRuntime({
    state: {
      composerEnemyGroups,
      composerRuntime,
      currentBeatIndex,
    },
    constants: {
      composerGroupsEnabled: COMPOSER_GROUPS_ENABLED,
      composerGroupColors: COMPOSER_GROUP_COLORS,
      composerGroupShapes: COMPOSER_GROUP_SHAPES,
      composerGroupPerformersMin: COMPOSER_GROUP_PERFORMERS_MIN,
      composerGroupPerformersMax: COMPOSER_GROUP_PERFORMERS_MAX,
      composerGroupSizeMin: COMPOSER_GROUP_SIZE_MIN,
      composerGroupSizeMax: COMPOSER_GROUP_SIZE_MAX,
      composerGroupTemplateLibrary: COMPOSER_GROUP_TEMPLATE_LIBRARY,
      leadRole: BEAT_EVENT_ROLES.LEAD,
      bassRole: BEAT_EVENT_ROLES.BASS,
      fullThreat: BEAT_EVENT_THREAT.FULL,
      weaponTuneSteps: WEAPON_TUNE_STEPS,
    },
    helpers: {
      applyMusicalIdentityVisualToEnemy,
      clampNoteToDirectorPool,
      createComposerEnemyGroupProfile,
      getAliveEnemiesByIds,
      getComposerDirective,
      getComposerMotif,
      getComposerMotifScopeKey,
      getCurrentPacingCaps,
      getCurrentPacingStateName,
      getCurrentSwarmEnergyStateName,
      getNextComposerEnemyGroupId: () => composerEnemyGroupIdSeq++,
      getNextMusicContinuityId,
      getRandomSwarmPentatonicNote,
      maintainComposerEnemyGroupsLifecycle,
      normalizeCallResponseLane,
      normalizeMusicLifecycleState,
      normalizeSwarmNoteName,
      normalizeSwarmRole,
      pickComposerGroupColor,
      pickComposerGroupShape,
      pickComposerGroupTemplate,
      ensureMusicLaneAssignment: assignMusicLaneIdentity,
      resolveInstrumentIdOrFallback,
      resolveSwarmSoundInstrumentId,
      sanitizeEnemyMusicInstrumentId,
      shouldHoldIntroLayerExpansion,
      spawnComposerGroupOffscreenMembers,
    },
  });
}
function maintainEnemyPopulation() {
  // Section 1: fallback generic enemies are intentionally disabled.
  // Musical participation should come from explicit enemy groups/systems only.
}
function updatePickupsAndCombat(dt) {
  updatePickupsAndCombatRuntimeWrapper({
    dt,
    constants: {
      pickupCollectRadiusPx: PICKUP_COLLECT_RADIUS_PX,
      projectileHitRadiusPx: PROJECTILE_HIT_RADIUS_PX,
      projectileDespawnOffscreenPadPx: PROJECTILE_DESPAWN_OFFSCREEN_PAD_PX,
      projectileBoomerangRadiusWorld: PROJECTILE_BOOMERANG_RADIUS_WORLD,
      projectileHomingOrbitRadiusWorld: PROJECTILE_HOMING_ORBIT_RADIUS_WORLD,
      projectileHomingOrbitAngVel: PROJECTILE_HOMING_ORBIT_ANG_VEL,
      projectileHomingAcquireRangeWorld: PROJECTILE_HOMING_ACQUIRE_RANGE_WORLD,
      projectileHomingTurnRate: PROJECTILE_HOMING_TURN_RATE,
      projectileHomingSpeed: PROJECTILE_HOMING_SPEED,
      projectileHomingReturnSnapDistWorld: PROJECTILE_HOMING_RETURN_SNAP_DIST_WORLD,
      projectileHomingOrbitTurnRate: PROJECTILE_HOMING_ORBIT_TURN_RATE,
      projectileHomingOrbitChaseSpeed: PROJECTILE_HOMING_ORBIT_CHASE_SPEED,
      projectileBoomerangSpinMult: PROJECTILE_BOOMERANG_SPIN_MULT,
      laserTtl: LASER_TTL,
      explosionRadiusWorld: EXPLOSION_RADIUS_WORLD,
      explosionTtl: EXPLOSION_TTL,
      explosionPrimeMaxScale: EXPLOSION_PRIME_MAX_SCALE,
      composerGroupExplosionTtl: COMPOSER_GROUP_EXPLOSION_TTL,
    },
    helpers: {
      updateBeatSwarmPickupsAndCombatRuntime,
      getViewportCenterWorld,
      getZoomState,
      updateHelpers,
      ensureDefaultWeaponFromLegacy,
      worldToScreen,
      getNearestEnemy,
      normalizeDir,
      getDrawSnakeProjectileImpactPoint,
      withDamageSoundStage,
      damageEnemy,
      sanitizeWeaponStages,
      triggerWeaponStage,
      queueWeaponChain,
      getPendingEnemyDeathByEnemyId,
      hasPendingWeaponChainEventById,
      getGameplayBeatLen,
      applyAoeAt,
      noteMusicSystemEvent,
      updateEnergyGravityRuntime,
      updateBeatWeapons,
      flushSwarmSoundEventsForBeat,
    },
    state: {
      currentBeatIndex,
      pickups,
      projectiles,
      effects,
      enemies,
      equippedWeapons,
    },
  });
}
function setJoystickVisible(show) {
  setJoystickVisibleRuntime({ joystickEl, show });
}
function setJoystickCenter(x, y) {
  setJoystickCenterRuntime({ joystickEl, x, y });
}
function setJoystickKnob(dx, dy) {
  setJoystickKnobRuntime({ joystickKnobEl, dx, dy });
}
function updateArenaVisual(scale = 1, showLimit = false) {
  updateArenaVisualRuntime({
    scale,
    showLimit,
    state: {
      arenaCenterWorld,
      arenaCoreEl,
      arenaLimitEl,
      arenaRingEl,
    },
    constants: {
      swarmArenaRadiusWorld: SWARM_ARENA_RADIUS_WORLD,
      swarmArenaResistRangeWorld: SWARM_ARENA_RESIST_RANGE_WORLD,
    },
    helpers: { worldToScreen },
  });
}
function setResistanceVisual(visible, angleDeg = 0, strength = 0) {
  setResistanceVisualRuntime({
    resistanceEl,
    visible,
    angleDeg,
    strength,
  });
}
function setThrustFxVisual(visible) {
  setThrustFxVisualRuntime({
    thrustFxEl,
    visible,
    state: { lastLaunchBeatLevel },
    constants: { swarmReleaseBeatLevelMax: SWARM_RELEASE_BEAT_LEVEL_MAX },
  });
}
function getReactiveReleaseImpulse(outsideN = 0, pushCharge = 0) {
  return getReactiveReleaseImpulseRuntime({
    outsideN,
    pushCharge,
    state: { releaseForcePrimed },
    constants: { swarmArenaSlingshotImpulse: SWARM_ARENA_SLINGSHOT_IMPULSE },
    helpers: { getReleaseBeatMultiplier },
  });
}
function setReactiveArrowVisual(visible, angleDeg = 0, impulse = 0) {
  setReactiveArrowVisualRuntime({
    reactiveArrowEl,
    thrustFxEl,
    visible,
    angleDeg,
    impulse,
    state: {
      releaseForcePrimed,
      releaseBeatLevel,
    },
    constants: {
      swarmReleaseBeatLevelMax: SWARM_RELEASE_BEAT_LEVEL_MAX,
    },
    helpers: {
      getReactiveReleaseImpulse,
    },
  });
}
function pulseReactiveArrowCharge() {
  pulseReactiveArrowChargeRuntime({ reactiveArrowEl });
}
function pulsePlayerShipNoteFlash() {
  pulsePlayerShipNoteFlashRuntime({ overlayEl });
}
function applyArenaBoundaryResistance(dt, input, centerWorld, scale) {
  const motionState = {
    borderForceEnabled,
    arenaCenterWorld,
    postReleaseAssistTimer,
    velocityX,
    velocityY,
    barrierPushingOut,
    barrierPushCharge,
  };
  const outsideForceActive = applyArenaBoundaryResistanceRuntimeWrapper({
    dt,
    input,
    centerWorld,
    scale,
    state: motionState,
    constants: {
      swarmArenaRadiusWorld: SWARM_ARENA_RADIUS_WORLD,
      swarmArenaResistRangeWorld: SWARM_ARENA_RESIST_RANGE_WORLD,
      swarmReleasePostFireBorderScale: SWARM_RELEASE_POST_FIRE_BORDER_SCALE,
      swarmArenaInwardAccelWorld: SWARM_ARENA_INWARD_ACCEL_WORLD,
      swarmArenaOuterSoftBufferWorld: SWARM_ARENA_OUTER_SOFT_BUFFER_WORLD,
      swarmArenaRubberKWorld: SWARM_ARENA_RUBBER_K_WORLD,
      swarmArenaRubberDampLinear: SWARM_ARENA_RUBBER_DAMP_LINEAR,
      swarmArenaRubberDampQuad: SWARM_ARENA_RUBBER_DAMP_QUAD,
      swarmArenaEdgeBrakeWorld: SWARM_ARENA_EDGE_BRAKE_WORLD,
      swarmArenaOutwardBrakeWorld: SWARM_ARENA_OUTWARD_BRAKE_WORLD,
      swarmArenaOutwardCancelWorld: SWARM_ARENA_OUTWARD_CANCEL_WORLD,
    },
    helpers: {
      applyArenaBoundaryResistanceRuntime,
      setResistanceVisual,
      setReactiveArrowVisual,
      getReactiveReleaseImpulse,
    },
  });
  velocityX = Number(motionState.velocityX) || 0;
  velocityY = Number(motionState.velocityY) || 0;
  barrierPushingOut = motionState.barrierPushingOut === true;
  barrierPushCharge = Math.max(0, Math.min(1, Number(motionState.barrierPushCharge) || 0));
  return outsideForceActive === true;
}
function enforceArenaOuterLimit(centerWorld, scale, dt) {
  const motionState = {
    borderForceEnabled,
    arenaCenterWorld,
    velocityX,
    velocityY,
  };
  const nextCenterWorld = enforceArenaOuterLimitRuntimeWrapper({
    centerWorld,
    scale,
    dt,
    state: motionState,
    constants: {
      swarmArenaRadiusWorld: SWARM_ARENA_RADIUS_WORLD,
      swarmArenaResistRangeWorld: SWARM_ARENA_RESIST_RANGE_WORLD,
    },
    helpers: {
      enforceArenaOuterLimitRuntime,
      applyCameraDelta,
    },
  });
  velocityX = Number(motionState.velocityX) || 0;
  velocityY = Number(motionState.velocityY) || 0;
  return nextCenterWorld || centerWorld;
}
function applyLaunchInnerCircleBounce(centerWorld, scale) {
  const motionState = {
    borderForceEnabled,
    arenaCenterWorld,
    postReleaseAssistTimer,
    dragPointerId,
    velocityX,
    velocityY,
  };
  const nextCenterWorld = applyLaunchInnerCircleBounceRuntimeWrapper({
    centerWorld,
    scale,
    state: motionState,
    constants: {
      swarmArenaRadiusWorld: SWARM_ARENA_RADIUS_WORLD,
      swarmReleaseBounceMinSpeed: SWARM_RELEASE_BOUNCE_MIN_SPEED,
      swarmReleaseBounceRestitution: SWARM_RELEASE_BOUNCE_RESTITUTION,
    },
    helpers: {
      applyLaunchInnerCircleBounceRuntime,
      applyCameraDelta,
    },
  });
  velocityX = Number(motionState.velocityX) || 0;
  velocityY = Number(motionState.velocityY) || 0;
  return nextCenterWorld || centerWorld;
}
function shouldSuppressSteeringForRelease(input, centerWorld) {
  return shouldSuppressSteeringForReleaseRuntime({
    input,
    centerWorld,
    constants: {
      swarmArenaRadiusWorld: SWARM_ARENA_RADIUS_WORLD,
    },
    state: {
      dragPointerId,
      arenaCenterWorld,
    },
  });
}
function getOutwardOnlyInput(input, centerWorld) {
  return getOutwardOnlyInputRuntime({
    input,
    centerWorld,
    state: {
      arenaCenterWorld,
    },
  });
}
function getShipFacingFromReleaseAim(input, centerWorld) {
  return getShipFacingFromReleaseAimRuntime({
    input,
    centerWorld,
    constants: {
      swarmArenaRadiusWorld: SWARM_ARENA_RADIUS_WORLD,
    },
    state: {
      arenaCenterWorld,
    },
  });
}
function getInputVector() {
  return getInputVectorRuntime({
    state: {
      active,
      dragPointerId,
      dragNowX,
      dragStartX,
      dragNowY,
      dragStartY,
      perfLabRuntime,
    },
    constants: {
      swarmJoystickRadius: SWARM_JOYSTICK_RADIUS,
    },
    helpers: {
      setJoystickKnob,
    },
  });
}
function updateShipFacing(dt, inputX, inputY, overrideTargetDeg = null) {
  const facingState = {
    dragPointerId,
    velocityX,
    velocityY,
    shipFacingDeg,
    overlayEl,
  };
  updateShipFacingRuntime({
    dt,
    inputX,
    inputY,
    overrideTargetDeg,
    state: facingState,
  });
  shipFacingDeg = Number(facingState.shipFacingDeg) || 0;
}
function tick(nowMs) {
  if (!active) return;
  const now = Number(nowMs) || performance.now();
  if (!lastFrameTs) lastFrameTs = now;
  const dt = Math.max(0.001, Math.min(0.05, (now - lastFrameTs) / 1000));
  lastFrameTs = now;
  if (gameplayPaused) {
    updatePausedTickFrameRuntimeWrapper({
      dt,
      state: {
        currentBeatIndex,
        arenaCenterWorld,
      },
      constants: {
        swarmArenaRadiusWorld: SWARM_ARENA_RADIUS_WORLD,
      },
      helpers: {
        updateSectionPresentationRuntime,
        updateSwarmDirectorDebugHud,
        ensureSwarmDirector,
        updateWeaponSubBoardSession,
        getZoomState,
        getViewportCenterWorld,
        updateArenaVisual,
        updateStarfieldVisual,
        updateSpawnHealthDebugUi,
        updateSpawnerRuntime(nextDt = 0) {
          try { spawnerRuntime?.update?.(nextDt); } catch {}
        },
        updatePausePreview,
      },
    });
    rafId = requestAnimationFrame(tick);
    return;
  }
  updateSectionPresentationRuntime(dt);
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
  const motionState = {
    borderForceEnabled,
    velocityX,
    velocityY,
    outerForceContinuousSeconds,
    releaseForcePrimed,
    releaseBeatLevel,
    postReleaseAssistTimer,
    arenaCenterWorld,
    barrierPushingOut,
    barrierPushCharge,
    dragPointerId,
  };
  applyTickSteeringAndResistanceRuntimeWrapper({
    dt,
    input,
    centerWorld,
    scale,
    state: motionState,
    constants: {
      swarmMaxSpeed: SWARM_MAX_SPEED,
      swarmAccel: SWARM_ACCEL,
      swarmTurnWeight: SWARM_TURN_WEIGHT,
      swarmDecel: SWARM_DECEL,
      swarmStopEps: SWARM_STOP_EPS,
    },
    helpers: {
      shouldSuppressSteeringForRelease,
      getOutwardOnlyInput,
      applyArenaBoundaryResistance(nextDt, nextInput, nextCenterWorld, nextScale) {
        return applyArenaBoundaryResistanceRuntimeWrapper({
          dt: nextDt,
          input: nextInput,
          centerWorld: nextCenterWorld,
          scale: nextScale,
          state: motionState,
          constants: {
            swarmArenaRadiusWorld: SWARM_ARENA_RADIUS_WORLD,
            swarmArenaResistRangeWorld: SWARM_ARENA_RESIST_RANGE_WORLD,
            swarmReleasePostFireBorderScale: SWARM_RELEASE_POST_FIRE_BORDER_SCALE,
            swarmArenaInwardAccelWorld: SWARM_ARENA_INWARD_ACCEL_WORLD,
            swarmArenaOuterSoftBufferWorld: SWARM_ARENA_OUTER_SOFT_BUFFER_WORLD,
            swarmArenaRubberKWorld: SWARM_ARENA_RUBBER_K_WORLD,
            swarmArenaRubberDampLinear: SWARM_ARENA_RUBBER_DAMP_LINEAR,
            swarmArenaRubberDampQuad: SWARM_ARENA_RUBBER_DAMP_QUAD,
            swarmArenaEdgeBrakeWorld: SWARM_ARENA_EDGE_BRAKE_WORLD,
            swarmArenaOutwardBrakeWorld: SWARM_ARENA_OUTWARD_BRAKE_WORLD,
            swarmArenaOutwardCancelWorld: SWARM_ARENA_OUTWARD_CANCEL_WORLD,
          },
          helpers: {
            applyArenaBoundaryResistanceRuntime,
            setResistanceVisual,
            setReactiveArrowVisual,
            getReactiveReleaseImpulse,
          },
        });
      },
      updateArenaVisual,
    },
  });
  velocityX = Number(motionState.velocityX) || 0;
  velocityY = Number(motionState.velocityY) || 0;
  outerForceContinuousSeconds = Math.max(0, Number(motionState.outerForceContinuousSeconds) || 0);
  releaseForcePrimed = !!motionState.releaseForcePrimed;
  releaseBeatLevel = Math.max(0, Number(motionState.releaseBeatLevel) || 0);
  barrierPushingOut = motionState.barrierPushingOut === true;
  barrierPushCharge = Math.max(0, Math.min(1, Number(motionState.barrierPushCharge) || 0));
  const moveResult = applyTickMovementAndArenaClampRuntimeWrapper({
    dt,
    scale,
    state: motionState,
    constants: {
      swarmMaxSpeed: SWARM_MAX_SPEED,
      swarmArenaRadiusWorld: SWARM_ARENA_RADIUS_WORLD,
    },
    helpers: {
      getReleaseSpeedCap,
      applyCameraDelta,
      getViewportCenterWorld,
      applyLaunchInnerCircleBounce(nextCenterWorld, nextScale) {
        return applyLaunchInnerCircleBounceRuntimeWrapper({
          centerWorld: nextCenterWorld,
          scale: nextScale,
          state: motionState,
          constants: {
            swarmArenaRadiusWorld: SWARM_ARENA_RADIUS_WORLD,
            swarmReleaseBounceMinSpeed: SWARM_RELEASE_BOUNCE_MIN_SPEED,
            swarmReleaseBounceRestitution: SWARM_RELEASE_BOUNCE_RESTITUTION,
          },
          helpers: {
            applyLaunchInnerCircleBounceRuntime,
            applyCameraDelta,
          },
        });
      },
      enforceArenaOuterLimit(nextCenterWorld, nextScale, nextDt) {
        return enforceArenaOuterLimitRuntimeWrapper({
          centerWorld: nextCenterWorld,
          scale: nextScale,
          dt: nextDt,
          state: motionState,
          constants: {
            swarmArenaRadiusWorld: SWARM_ARENA_RADIUS_WORLD,
            swarmArenaResistRangeWorld: SWARM_ARENA_RESIST_RANGE_WORLD,
          },
          helpers: {
            enforceArenaOuterLimitRuntime,
            applyCameraDelta,
          },
        });
      },
      updateArenaVisual,
    },
  });
  velocityX = Number(motionState.velocityX) || 0;
  velocityY = Number(motionState.velocityY) || 0;
  const centerWorldAfterMove = moveResult?.centerWorldAfterMove || getViewportCenterWorld();
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
  const pointerState = {
    active,
    gameplayPaused,
    dragPointerId,
    dragStartX,
    dragStartY,
    dragNowX,
    dragNowY,
    barrierPushingOut,
    barrierPushCharge,
    releaseBeatLevel,
    lastLaunchBeatLevel,
    postReleaseAssistTimer,
    outerForceContinuousSeconds,
    releaseForcePrimed,
  };
  onPointerDownRuntimeWrapper({
    ev,
    state: pointerState,
    helpers: {
      setReactiveArrowVisual,
      setThrustFxVisual,
      setJoystickCenter,
      setJoystickKnob,
      setJoystickVisible,
      setPointerCapture(pointerId) {
        try { overlayEl?.setPointerCapture?.(pointerId); } catch {}
      },
    },
  });
  dragPointerId = pointerState.dragPointerId;
  dragStartX = Number(pointerState.dragStartX) || 0;
  dragStartY = Number(pointerState.dragStartY) || 0;
  dragNowX = Number(pointerState.dragNowX) || 0;
  dragNowY = Number(pointerState.dragNowY) || 0;
  barrierPushingOut = !!pointerState.barrierPushingOut;
  barrierPushCharge = Math.max(0, Number(pointerState.barrierPushCharge) || 0);
  releaseBeatLevel = Math.max(0, Number(pointerState.releaseBeatLevel) || 0);
  lastLaunchBeatLevel = Math.max(0, Number(pointerState.lastLaunchBeatLevel) || 0);
  postReleaseAssistTimer = Math.max(0, Number(pointerState.postReleaseAssistTimer) || 0);
  outerForceContinuousSeconds = Math.max(0, Number(pointerState.outerForceContinuousSeconds) || 0);
  releaseForcePrimed = !!pointerState.releaseForcePrimed;
}
function onPointerMove(ev) {
  const pointerState = {
    active,
    gameplayPaused,
    dragPointerId,
    dragNowX,
    dragNowY,
  };
  onPointerMoveRuntimeWrapper({
    ev,
    state: pointerState,
  });
  dragNowX = Number(pointerState.dragNowX) || 0;
  dragNowY = Number(pointerState.dragNowY) || 0;
}
function onPointerUp(ev) {
  const pointerState = {
    active,
    gameplayPaused,
    dragPointerId,
    arenaCenterWorld,
    barrierPushingOut,
    barrierPushCharge,
    releaseBeatLevel,
    lastLaunchBeatLevel,
    postReleaseAssistTimer,
    dragNowX,
    dragNowY,
    dragStartX,
    dragStartY,
    velocityX,
    velocityY,
    outerForceContinuousSeconds,
    releaseForcePrimed,
  };
  onPointerUpRuntimeWrapper({
    ev,
    state: pointerState,
    constants: {
      swarmArenaRadiusWorld: SWARM_ARENA_RADIUS_WORLD,
      swarmArenaResistRangeWorld: SWARM_ARENA_RESIST_RANGE_WORLD,
      swarmReleasePostFireDuration: SWARM_RELEASE_POST_FIRE_DURATION,
    },
    helpers: {
      releasePointerCapture(pointerId) {
        try { overlayEl?.releasePointerCapture?.(pointerId); } catch {}
      },
      getViewportCenterWorld,
      getReactiveReleaseImpulse,
      setJoystickVisible,
      setReactiveArrowVisual,
      setThrustFxVisual,
    },
  });
  dragPointerId = pointerState.dragPointerId;
  barrierPushingOut = !!pointerState.barrierPushingOut;
  barrierPushCharge = Math.max(0, Number(pointerState.barrierPushCharge) || 0);
  lastLaunchBeatLevel = Math.max(0, Number(pointerState.lastLaunchBeatLevel) || 0);
  postReleaseAssistTimer = Math.max(0, Number(pointerState.postReleaseAssistTimer) || 0);
  velocityX = Number(pointerState.velocityX) || 0;
  velocityY = Number(pointerState.velocityY) || 0;
  outerForceContinuousSeconds = Math.max(0, Number(pointerState.outerForceContinuousSeconds) || 0);
  releaseForcePrimed = !!pointerState.releaseForcePrimed;
}
function onWheel(ev) {
  onWheelRuntimeWrapper({ ev, state: { active } });
}
function onTransportPause() {
  onTransportPauseRuntimeWrapper({ state: { active }, helpers: { setGameplayPaused } });
}
function onTransportResume() {
  onTransportResumeRuntimeWrapper({ state: { active, weaponSubBoardOpen: !!weaponSubBoardState.open }, helpers: { setGameplayPaused } });
}
function onKeyDown(ev) {
  onKeyDownRuntimeWrapper({ ev, state: { active, gameplayPaused, activeWeaponSlotIndex }, constants: { maxWeaponSlots: MAX_WEAPON_SLOTS }, helpers: { setActiveWeaponSlot } });
}
function bindInput() {
  bindBeatSwarmInputRuntimeWrapper({ targets: { overlayEl, document, window }, handlers: { onPointerDown, onPointerMove, onPointerUp, onKeyDown, onWheel, onTransportPause, onTransportResume, onMusicSystemEvent: handleBeatSwarmMusicSystemEvent } });
}
function unbindInput() {
  unbindBeatSwarmInputRuntimeWrapper({
    targets: {
      overlayEl,
      document,
      window,
    },
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onKeyDown,
      onWheel,
      onTransportPause,
      onTransportResume,
      onMusicSystemEvent: handleBeatSwarmMusicSystemEvent,
    },
  });
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
  musicLayerRuntime.foundationAnchorBar = -1;
  musicLayerRuntime.foundationAnchorSectionId = '';
  musicLayerRuntime.lastFoundationBar = -1;
  musicLayerRuntime.foundationAnchorStep = -1;
  musicLayerRuntime.foundationIdentityKey = '';
  musicLayerRuntime.foundationIdentityStartStep = -1;
  musicLayerRuntime.foundationLaneId = 'foundation_lane';
  musicLayerRuntime.foundationPhraseId = '';
  musicLayerRuntime.foundationPhraseSteps = [];
  musicLayerRuntime.foundationPhraseLockedUntilBar = -1;
  musicLayerRuntime.foundationPhraseStartBar = -1;
  musicLayerRuntime.foundationPatternChangeCount = 0;
  musicLayerRuntime.lastFoundationStep = -1;
  musicLayerRuntime.foundationLastFullBar = -1;
  musicLayerRuntime.foundationLastFullStep = -1;
  musicLayerRuntime.foundationConsecutiveQuietEvents = 0;
  musicLayerRuntime.sparkleBarIndex = -1;
  musicLayerRuntime.sparkleEventsInBar = 0;
  for (const lane of Object.values(musicLaneRuntime)) {
    if (!lane || typeof lane !== 'object') continue;
    lane.phraseId = '';
    lane.instrumentId = '';
    lane.colourId = '';
    lane.continuityId = '';
    lane.lifetimeBars = 0;
    lane.performerEnemyId = 0;
    lane.performerGroupId = 0;
    lane.performerType = '';
    lane.activeSinceBar = -1;
    lane.lastAssignedBar = -1;
  }
  loopAdmissionRuntime.identityFirstForegroundStep.clear();
  loopAdmissionRuntime.currentForegroundIdentityKey = '';
  loopAdmissionRuntime.currentForegroundIdentityStartStep = -1;
  loopAdmissionRuntime.currentForegroundIdentityLayer = '';
  loopAdmissionRuntime.lastMajorIdentityIntroStep = -1;
  musicIdentityVisualRuntime.colorByContinuityId.clear();
  musicIdentityVisualRuntime.colorByInstrumentId.clear();
  onboardingRuntime.identityFirstHeardBar.clear();
  onboardingRuntime.lastPhaseId = '';
  sectionPresentationRuntime.visibleUntilMs = 0;
  sectionPresentationRuntime.lastShownMs = 0;
  sectionPresentationRuntime.lastSectionKey = '';
  sectionPresentationRuntime.currentTitle = '';
  sectionPresentationRuntime.currentSubtitle = '';
  applySectionStarfieldProfile(getSectionPresentationProfile('default', 'intro')?.starfield || null, false);
  hideSectionHeading();
  resetReadabilityMetricsRuntime(-1);
  playerInstrumentRuntime.reset();
  startMusicLabSession('enter');
  swarmSoundEventState.beatIndex = null;
  swarmSoundEventState.played = Object.create(null);
  swarmSoundEventState.maxVolume = Object.create(null);
  swarmSoundEventState.note = Object.create(null);
  swarmSoundEventState.noteList = Object.create(null);
  swarmSoundEventState.count = Object.create(null);
  playerInstrumentRuntime.reset();
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
  const enterSceneState = {
    activeWeaponSlotIndex,
    arenaCenterWorld,
  };
  applyEnterSceneBootstrapRuntimeWrapper({
    restoreState,
    state: enterSceneState,
    constants: {
      swarmCameraTargetScale: SWARM_CAMERA_TARGET_SCALE,
    },
    helpers: {
      seedDefaultWeaponLoadout,
      renderPauseWeaponUi,
      getSceneStartWorld,
      snapCameraToWorld,
      initStarfieldNear,
      spawnStarterPickups,
      restoreBeatSwarmState,
      getZoomState,
      updateArenaVisual,
      updateStarfieldVisual,
      updateSpawnerRuntime(nextDt = 0) {
        try { spawnerRuntime?.update?.(nextDt); } catch {}
      },
      setResistanceVisual,
      setReactiveArrowVisual,
    },
  });
  activeWeaponSlotIndex = Math.max(0, Math.min(MAX_WEAPON_SLOTS - 1, Math.trunc(Number(enterSceneState.activeWeaponSlotIndex) || 0)));
  arenaCenterWorld = enterSceneState.arenaCenterWorld && typeof enterSceneState.arenaCenterWorld === 'object'
    ? { x: Number(enterSceneState.arenaCenterWorld.x) || 0, y: Number(enterSceneState.arenaCenterWorld.y) || 0 }
    : null;
  finalizeEnterBeatSwarmRuntimeWrapper({
    state: {
      swarmDirectorHudEnabled: !!swarmDirectorDebug.hudEnabled,
      currentBeatIndex,
    },
    ui: {
      spawnerLayerEl,
      enemyLayerEl,
      starfieldLayerEl,
      overlayEl,
    },
    helpers: {
      ensureSwarmDirectorDebugHud,
      removeSwarmDirectorDebugHud,
      ensureSwarmDirector,
      bindInput,
      startTick,
      persistBeatSwarmState,
    },
  });
  return true;
}
export function exitBeatSwarmMode() {
  if (!active) return true;
  destroyWeaponSubBoards();
  const exitState = {
    active,
    dragPointerId,
    velocityX,
    velocityY,
    currentBeatIndex,
    readabilityMetricsRuntime,
    weaponChainEventSeq,
    musicLabLastPacingSignature,
    musicLabLastPaletteSignature,
    swarmSoundEventState,
    lastSpawnerEnemyStepIndex,
    arenaCenterWorld,
    barrierPushingOut,
    barrierPushCharge,
    releaseBeatLevel,
    lastLaunchBeatLevel,
    postReleaseAssistTimer,
    outerForceContinuousSeconds,
    releaseForcePrimed,
    activeWeaponSlotIndex,
    enemyHealthRampSeconds,
    lastBeatIndex,
    lastWeaponTuneStepIndex,
  };
  applyExitBeatSwarmRuntimeWrapper({
    state: exitState,
    ui: {
      overlayEl,
      exitBtn,
      starfieldLayerEl,
      spawnerLayerEl,
      enemyLayerEl,
      arenaRingEl,
      arenaCoreEl,
      arenaLimitEl,
    },
    helpers: {
      setPerfAutoMoveEnabled(next = false) {
        perfLabRuntime.autoMoveEnabled = !!next;
      },
      setWindowBeatSwarmActive(next = false) {
        window.__beatSwarmActive = !!next;
      },
      removeBodyBeatSwarmClass() {
        document.body.classList.remove('beat-swarm-active');
      },
      setJoystickVisible,
      setThrustFxVisual,
      stopTick,
      stopComponentLivePreviews,
      unbindInput,
      hideSectionHeading,
      emitReadabilityMetricsSnapshotForBar,
      resetReadabilityMetricsRuntime,
      spawnerExit() {
        try { spawnerRuntime?.exit?.(); } catch {}
      },
      removeSwarmDirectorDebugHud,
      clearEnemies,
      clearPickups,
      clearProjectiles,
      clearEffects,
      clearHelpers,
      clearPendingWeaponChainEvents,
      resetSwarmPacingRuntime(next = 0) {
        swarmPacingRuntime.reset(next);
      },
      invalidateSwarmPaletteRuntime() {
        swarmPaletteRuntime.invalidate();
      },
      clearLingeringAoeZones,
      clearStarfield,
      resetEnergyStateRuntime,
      resetEnergyGravityRuntime,
      resetSwarmDirector() {
        ensureSwarmDirector().reset();
      },
      setGameplayPaused,
      resetArenaPathState,
      setResistanceVisual,
      setReactiveArrowVisual,
      clearEquippedWeapons() {
        equippedWeapons.clear();
      },
      updateEnemySpawnHealthScaling,
      updateSpawnHealthDebugUi,
      clearBeatSwarmPersistedState,
    },
  });
  ({
    active,
    dragPointerId,
    velocityX,
    velocityY,
    weaponChainEventSeq,
    musicLabLastPacingSignature,
    musicLabLastPaletteSignature,
    lastSpawnerEnemyStepIndex,
    arenaCenterWorld,
    barrierPushingOut,
    barrierPushCharge,
    releaseBeatLevel,
    lastLaunchBeatLevel,
    postReleaseAssistTimer,
    outerForceContinuousSeconds,
    releaseForcePrimed,
    activeWeaponSlotIndex,
    enemyHealthRampSeconds,
    lastBeatIndex,
    lastWeaponTuneStepIndex,
  } = exitState);
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
  return getBeatSwarmStabilitySmokeChecksRuntime({
    helpers: {
      getPlayerWeaponSoundEventKeyForStage,
      resolveEnemyDeathEventKey,
      ensureSwarmDirector,
      getPacingSnapshot() {
        try { return swarmPacingRuntime.getSnapshot(); } catch { return null; }
      },
    },
  });
}
const perfDebugTools = createBeatSwarmPerfDebugToolsRuntime({
  constants: {
    enemyTargetActiveCount: ENEMY_TARGET_ACTIVE_COUNT,
  },
  state: {
    getActive() { return active; },
    getMotionState() {
      return {
        active,
        velocityX,
        velocityY,
        dragPointerId,
        barrierPushingOut,
        barrierPushCharge,
        releaseForcePrimed,
        releaseBeatLevel,
        outerForceContinuousSeconds,
        postReleaseAssistTimer,
      };
    },
    setMotionState(next = {}) {
      velocityX = Number(next.velocityX) || 0;
      velocityY = Number(next.velocityY) || 0;
      dragPointerId = next.dragPointerId == null ? null : next.dragPointerId;
      barrierPushingOut = !!next.barrierPushingOut;
      barrierPushCharge = Math.max(0, Number(next.barrierPushCharge) || 0);
      releaseForcePrimed = !!next.releaseForcePrimed;
      releaseBeatLevel = Math.max(0, Number(next.releaseBeatLevel) || 0);
      outerForceContinuousSeconds = Math.max(0, Number(next.outerForceContinuousSeconds) || 0);
      postReleaseAssistTimer = Math.max(0, Number(next.postReleaseAssistTimer) || 0);
    },
    setBorderForceEnabled(next) {
      borderForceEnabled = !!next;
    },
    getBorderForceEnabled() {
      return !!borderForceEnabled;
    },
    resetBarrierState() {
      barrierPushingOut = false;
      barrierPushCharge = 0;
      releaseForcePrimed = false;
      releaseBeatLevel = 0;
    },
  },
  helpers: {
    seedDefaultWeaponLoadout,
    getWeaponLoadout() { return weaponLoadout; },
    setActiveWeaponSlot,
    clearRuntimeForWeaponSlot,
    clearHomingMissiles,
    clearPendingWeaponChainEvents,
    clearLingeringAoeZones,
    clearHelpers,
    clearProjectiles,
    clearEffects,
    renderPauseWeaponUi,
    persistBeatSwarmState,
    clearPendingEnemyDeaths,
    clearEnemies,
    windowObj: window,
    spawnEnemyAt,
    getEnemyCount() { return enemies.length; },
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
    setResistanceVisual,
    setReactiveArrowVisual,
  },
});
installBeatSwarmModeGlobalRuntime({
  windowObj: window,
  beatSwarmMode: BeatSwarmMode,
});
installBeatSwarmDebugGlobalRuntime({
  windowObj: window,
  api: createBeatSwarmDebugApiRuntime({
    constants: {
      maxWeaponSlots: MAX_WEAPON_SLOTS,
      weaponTuneSteps: WEAPON_TUNE_STEPS,
      enemyTargetActiveCount: ENEMY_TARGET_ACTIVE_COUNT,
    },
    state: {
      getActiveWeaponSlotIndex() { return activeWeaponSlotIndex; },
      getCurrentBeatIndex() { return currentBeatIndex; },
      getBorderForceEnabled() { return borderForceEnabled; },
    },
    helpers: {
      ensureSwarmDirector,
      swarmPaletteRuntime,
      swarmPacingRuntime,
      composerRuntime,
      getComposerMotifScopeKey,
      swarmDirectorDebug,
      getEnergyGravityMetrics,
      energyGravityRuntime,
      getWeaponTuneActivityStats,
      getWeaponTuneDamageScale,
      playerInstrumentRuntime,
      runStabilitySmokeChecks: getBeatSwarmStabilitySmokeChecks,
      ensureSwarmDirectorDebugHud,
      removeSwarmDirectorDebugHud,
      weaponTuneFireDebug,
      setPerfWeaponStageCount: perfDebugTools.setPerfWeaponStageCount,
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
      spawnPerfEnemyDistribution: perfDebugTools.spawnPerfEnemyDistribution,
      preparePerfScenario: perfDebugTools.preparePerfScenario,
      setBorderForceEnabled: perfDebugTools.setBorderForceEnabled,
    },
  }),
});
installBeatSwarmMusicLabGlobalRuntime({
  windowObj: window,
  api: createBeatSwarmMusicLabApiRuntime({
    helpers: {
      startMusicLabSession,
      swarmMusicLab,
    },
    state: {
      cleanupAssertionState,
    },
  }),
});
installBeatSwarmPersistenceRuntime({
  windowObj: window,
  documentObj: document,
  state: {
    isActive() { return !!active; },
  },
  helpers: {
    persistBeatSwarmState,
    consumeBeatSwarmPersistedState,
    enterBeatSwarmMode,
    isRunning,
    startTransport,
  },
});
