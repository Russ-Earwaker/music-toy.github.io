import { getBeatSwarmFormationArchetype } from './beat-swarm-formations.js';
import {
  applyBeatSwarmBehavioralFormationRuntime,
  buildBeatSwarmBehaviorScopeRuntime,
  selectBeatSwarmBehavioralFormationForRole,
} from './beat-swarm-behavioral-formations.js';

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function normalizeProfile(value = '') {
  return String(value || '').trim().toLowerCase();
}

function normalizeRole(value = '', fallback = 'lead') {
  const raw = String(value || fallback || '').trim().toLowerCase();
  return raw || String(fallback || 'lead').trim().toLowerCase();
}

function computeSeedOffset(runSeed = 0, barIndex = 0, salt = 0) {
  const seed = Math.max(0, Math.trunc(Number(runSeed) || 0));
  const bar = Math.max(0, Math.trunc(Number(barIndex) || 0));
  return Math.abs((seed * 31) + (bar * 17) + Math.trunc(Number(salt) || 0));
}

function resolveBeatSwarmEventBehaviorId(groupLike = null, activeEventSection = '') {
  const group = groupLike && typeof groupLike === 'object' ? groupLike : {};
  const perfRepeatEventBehavior = String(group?.perfRepeatEventBehavior || '').trim().toLowerCase();
  if (perfRepeatEventBehavior) return perfRepeatEventBehavior;
  const eventSection = String(activeEventSection || '').trim().toLowerCase();
  if (eventSection === 'beat_bounce') return 'beat_bounce_event';
  if (eventSection === 'dance_phrase') return 'paired_dance';
  if (eventSection === 'hold_then_surge') return 'bass_drop_freeze';
  return 'none';
}

function resolveBeatSwarmDirectorBehaviorAssignment(role = '', enemyDirectorRuntimeLike = null) {
  const runtime = enemyDirectorRuntimeLike && typeof enemyDirectorRuntimeLike === 'object' ? enemyDirectorRuntimeLike : {};
  const assignments = runtime?.behaviorAssignmentByRole && typeof runtime.behaviorAssignmentByRole === 'object'
    ? runtime.behaviorAssignmentByRole
    : {};
  const roleKey = String(role || '').trim().toLowerCase();
  const assignment = assignments[roleKey] && typeof assignments[roleKey] === 'object'
    ? assignments[roleKey]
    : null;
  if (!assignment) return null;
  return {
    singleBehaviorId: String(assignment.singleBehaviorId || '').trim().toLowerCase(),
    groupBehaviorId: String(assignment.groupBehaviorId || '').trim().toLowerCase(),
    behaviorSource: String(assignment.behaviorSource || '').trim().toLowerCase(),
    singleBehaviorWindow: String(assignment.singleBehaviorWindow || '').trim().toLowerCase(),
    groupBehaviorWindow: String(assignment.groupBehaviorWindow || '').trim().toLowerCase(),
  };
}

export function inferBeatSwarmFormationRole(groupLike = null) {
  const group = groupLike && typeof groupLike === 'object' ? groupLike : {};
  const musicLaneId = String(group?.musicLaneId || '').trim().toLowerCase();
  const callResponseLane = String(group?.callResponseLane || '').trim().toLowerCase();
  const profile = normalizeProfile(group?.introSlotProfileSourceType || group?.musicProfileSourceType || '');
  const role = normalizeRole(group?.role || '', 'lead');

  if (musicLaneId === 'primary_loop_lane' || profile === 'lead_melody') return 'lead_phrase';
  if (musicLaneId === 'sparkle_lane' || callResponseLane === 'response' || profile === 'answer_ornament') return 'answer_ornament';
  if (
    musicLaneId === 'foundation_lane'
    || role === 'bass'
    || String(group?.templateId || '').trim().toLowerCase() === 'foundation-buffer'
    || profile === 'spawner_rhythm_pulse'
  ) return 'foundation_groove';
  if (
    musicLaneId === 'secondary_loop_lane'
    || profile === 'secondary_bridge_backbeat'
    || profile === 'spawner_rhythm_backbeat'
    || profile === 'rhythm_lane'
    || profile === 'rhythm_lane_backbeat'
  ) return 'counter_rhythm';
  return role === 'accent' ? 'answer_ornament' : 'counter_rhythm';
}

export function selectBeatSwarmFormationForRole(options = null) {
  const opts = options && typeof options === 'object' ? options : {};
  const role = String(opts.role || 'counter_rhythm').trim().toLowerCase();
  const group = opts.group && typeof opts.group === 'object' ? opts.group : {};
  const activeMusicMode = String(opts.activeMusicMode || '').trim().toLowerCase();
  const runSeed = Math.max(0, Math.trunc(Number(opts.runSeed) || 0));
  const barIndex = Math.max(0, Math.trunc(Number(opts.barIndex) || 0));
  const carrierType = String(opts.carrierType || '').trim().toLowerCase() === 'solo_carrier'
    ? 'solo_carrier'
    : 'composer_group';
  const seedOffset = computeSeedOffset(runSeed, barIndex, role.length + carrierType.length);

  let archetypeId = 'syncopation_stair';
  if (role === 'foundation_groove') archetypeId = 'foundation_anchor_line';
  else if (role === 'lead_phrase') archetypeId = 'lead_arc';
  else if (role === 'answer_ornament') archetypeId = 'answer_echo';
  else if (
    role === 'counter_rhythm'
    && (
      normalizeProfile(group?.introSlotProfileSourceType || group?.musicProfileSourceType || '') === 'spawner_rhythm_backbeat'
      || activeMusicMode === 'intro_backbeat_bridge'
      || activeMusicMode === 'lead_entry_merge'
      || activeMusicMode === 'full_texture'
    )
  ) {
    archetypeId = 'backbeat_pair';
  }

  const archetype = getBeatSwarmFormationArchetype(archetypeId) || getBeatSwarmFormationArchetype('syncopation_stair');
  const memberRange = Array.isArray(archetype?.memberCountRange) ? archetype.memberCountRange : [1, 2];
  const minMembers = Math.max(1, Math.trunc(Number(memberRange[0]) || 1));
  const maxMembers = Math.max(minMembers, Math.trunc(Number(memberRange[1]) || minMembers));
  const desiredMemberCount = carrierType === 'solo_carrier'
    ? 1
    : (minMembers + (seedOffset % Math.max(1, (maxMembers - minMembers + 1))));
  const mergeProtectionActive = (
    (activeMusicMode === 'lead_entry_merge'
      || (activeMusicMode === 'full_texture' && role === 'counter_rhythm'))
    && role !== 'lead_phrase'
    && role !== 'foundation_groove'
  );
  const basePresentationWeight = clamp01(archetype?.defaultPresentationWeight ?? 0.5);
  const roleWeightBias = role === 'counter_rhythm'
    ? (activeMusicMode === 'full_texture' ? 0.12 : 0.08)
    : 0;
  const presentationWeight = clamp01(basePresentationWeight + roleWeightBias + (mergeProtectionActive ? 0.12 : 0));
  const styleFamily = carrierType === 'solo_carrier'
    ? 'solo_carrier'
    : 'composer_group';
  const spawnRegion = role === 'counter_rhythm'
    ? (
      (activeMusicMode === 'lead_entry_merge' || activeMusicMode === 'full_texture')
        ? String(archetype?.defaultSpawnRegion || 'mid_side')
        : ((seedOffset % 2) === 0 ? String(archetype?.defaultSpawnRegion || 'mid_side') : 'side_diagonal')
    )
    : String(archetype?.defaultSpawnRegion || 'upper_mid');
  const spacingProfile = carrierType === 'solo_carrier'
    ? 'solo_focus'
    : String(archetype?.defaultSpacingProfile || 'paired');
  const symmetry = carrierType === 'solo_carrier'
    ? 'none'
    : String(archetype?.defaultSymmetry || 'none');

  return {
    role,
    formationArchetype: String(archetype?.archetype || archetypeId).trim().toLowerCase(),
    styleFamily,
    spawnRegion: String(spawnRegion || '').trim().toLowerCase(),
    spacingProfile: String(spacingProfile || '').trim().toLowerCase(),
    symmetry: String(symmetry || '').trim().toLowerCase(),
    presentationWeight,
    mergeProtectionActive,
    desiredMemberCount,
  };
}

export function buildBeatSwarmFormationRuntime(options = null) {
  const opts = options && typeof options === 'object' ? options : {};
  const group = opts.group && typeof opts.group === 'object' ? opts.group : {};
  const role = String(opts.role || inferBeatSwarmFormationRole(group)).trim().toLowerCase();
  const behaviorAssignment = resolveBeatSwarmDirectorBehaviorAssignment(role, opts.enemyDirectorRuntime);
  const eventBehaviorId = resolveBeatSwarmEventBehaviorId(group, opts.activeEventSection);
  const selection = selectBeatSwarmFormationForRole({
    role,
    group,
    activeMusicMode: opts.activeMusicMode,
    runSeed: opts.runSeed,
    barIndex: opts.barIndex,
    carrierType: opts.carrierType,
  });
  const behavioralSelection = selectBeatSwarmBehavioralFormationForRole({
    role,
    group,
    activeMusicMode: opts.activeMusicMode,
    introStage: opts.introStage,
    activeEventSection: opts.activeEventSection,
    groupBehaviorId: behaviorAssignment?.groupBehaviorId || '',
  });
  const behaviorScope = buildBeatSwarmBehaviorScopeRuntime({
    group,
    formation: {
      behavioralFormationArchetype: behavioralSelection.behavioralFormationArchetype,
      singleBehaviorId: behaviorAssignment?.singleBehaviorId || '',
      groupBehaviorId: behaviorAssignment?.groupBehaviorId || behavioralSelection.behavioralFormationArchetype || 'none',
      eventBehaviorId,
      behaviorSource: eventBehaviorId !== 'none'
        ? (String(group?.perfRepeatEventBehavior || '').trim() ? 'perf_lab' : 'event')
        : (behaviorAssignment?.behaviorSource || 'director'),
      singleBehaviorWindow: behaviorAssignment?.singleBehaviorWindow || 'continuous',
      groupBehaviorWindow: behaviorAssignment?.groupBehaviorWindow || (String(behaviorAssignment?.groupBehaviorId || '').trim() ? 'persistent' : 'continuous'),
      eventBehaviorWindow: eventBehaviorId !== 'none' ? 'timed' : 'continuous',
    },
  });
  return Object.freeze({
    role,
    formationArchetype: selection.formationArchetype,
    styleFamily: selection.styleFamily,
    spawnRegion: selection.spawnRegion,
    spacingProfile: selection.spacingProfile,
    symmetry: selection.symmetry,
    presentationWeight: selection.presentationWeight,
    mergeProtectionActive: selection.mergeProtectionActive === true,
    desiredMemberCount: Math.max(1, Math.trunc(Number(selection.desiredMemberCount) || 1)),
    behavioralFormationArchetype: String(behavioralSelection.behavioralFormationArchetype || 'none').trim().toLowerCase(),
    behavioralFormationClass: String(behavioralSelection.behavioralFormationClass || 'none').trim().toLowerCase(),
    behavioralFormationActivationMode: String(behavioralSelection.behavioralFormationActivationMode || 'inactive').trim().toLowerCase(),
    behavioralFormationIntensity: Number(behavioralSelection.behavioralFormationIntensity) || 0,
    behavioralFormationActive: behavioralSelection.behavioralFormationActive === true,
    singleBehaviorId: behaviorScope.singleBehaviorId,
    groupBehaviorId: behaviorScope.groupBehaviorId,
    eventBehaviorId: behaviorScope.eventBehaviorId,
    behaviorPriority: behaviorScope.behaviorPriority,
    behaviorWindow: behaviorScope.behaviorWindow,
    behaviorSource: behaviorScope.behaviorSource,
    singleBehaviorWindow: behaviorScope.singleBehaviorWindow,
    groupBehaviorWindow: behaviorScope.groupBehaviorWindow,
    eventBehaviorWindow: behaviorScope.eventBehaviorWindow,
  });
}

export function applyBeatSwarmFormationRuntime(groupLike = null, formationLike = null) {
  const group = groupLike && typeof groupLike === 'object' ? groupLike : null;
  const formation = formationLike && typeof formationLike === 'object' ? formationLike : null;
  if (!group || !formation) return group;
  group.formationRole = String(formation.role || '').trim().toLowerCase();
  group.formationArchetype = String(formation.formationArchetype || '').trim().toLowerCase();
  group.formationStyleFamily = String(formation.styleFamily || '').trim().toLowerCase();
  group.formationSpawnRegion = String(formation.spawnRegion || '').trim().toLowerCase();
  group.formationSpacingProfile = String(formation.spacingProfile || '').trim().toLowerCase();
  group.formationSymmetry = String(formation.symmetry || '').trim().toLowerCase();
  group.formationPresentationWeight = clamp01(formation.presentationWeight);
  group.formationMergeProtectionActive = formation.mergeProtectionActive === true;
  group.formationDesiredMemberCount = Math.max(1, Math.trunc(Number(formation.desiredMemberCount) || 1));
  applyBeatSwarmBehavioralFormationRuntime(group, formation);
  return group;
}
