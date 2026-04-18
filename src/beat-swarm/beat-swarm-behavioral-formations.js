export const BEAT_SWARM_BEHAVIORAL_FORMATION_ARCHETYPES = Object.freeze({
  none: Object.freeze({
    archetype: 'none',
    behaviorClass: 'none',
    activationMode: 'inactive',
    defaultIntensity: 0,
  }),
  winding_chain: Object.freeze({
    archetype: 'winding_chain',
    behaviorClass: 'follow_the_leader',
    activationMode: 'opt_in',
    defaultIntensity: 0.55,
  }),
  paired_dance: Object.freeze({
    archetype: 'paired_dance',
    behaviorClass: 'paired_motion',
    activationMode: 'opt_in',
    defaultIntensity: 0.5,
  }),
  advancing_line: Object.freeze({
    archetype: 'advancing_line',
    behaviorClass: 'lane_push',
    activationMode: 'opt_in',
    defaultIntensity: 0.62,
  }),
});

function normalizeBehaviorId(value = '', fallback = 'none') {
  const id = String(value || '').trim().toLowerCase();
  return id || String(fallback || 'none').trim().toLowerCase() || 'none';
}

function normalizeBehaviorSource(value = '', fallback = 'default') {
  const src = String(value || '').trim().toLowerCase();
  if (src === 'default' || src === 'director' || src === 'style' || src === 'event' || src === 'perf_lab') return src;
  return String(fallback || 'default').trim().toLowerCase() || 'default';
}

function normalizeBehaviorWindow(value = '', fallback = 'continuous') {
  const windowId = String(value || '').trim().toLowerCase();
  if (windowId === 'continuous' || windowId === 'persistent' || windowId === 'timed' || windowId === 'section') return windowId;
  return String(fallback || 'continuous').trim().toLowerCase() || 'continuous';
}

function resolveBehaviorPriority(singleBehaviorId = 'none', groupBehaviorId = 'none', eventBehaviorId = 'none') {
  if (normalizeBehaviorId(eventBehaviorId) !== 'none') return 'event';
  if (normalizeBehaviorId(groupBehaviorId) !== 'none') return 'group';
  if (normalizeBehaviorId(singleBehaviorId) !== 'none') return 'single';
  return 'single';
}

export function buildBeatSwarmBehaviorScopeRuntime(options = null) {
  const opts = options && typeof options === 'object' ? options : {};
  const group = opts.group && typeof opts.group === 'object' ? opts.group : {};
  const formation = opts.formation && typeof opts.formation === 'object' ? opts.formation : {};
  const singleBehaviorId = normalizeBehaviorId(
    opts.singleBehaviorId || formation.singleBehaviorId || group.singleBehaviorId || 'default_motion',
    'default_motion'
  );
  const groupBehaviorId = normalizeBehaviorId(
    opts.groupBehaviorId || formation.groupBehaviorId || formation.behavioralFormationArchetype || group.groupBehaviorId || group.behavioralFormationArchetype || 'none',
    'none'
  );
  const eventBehaviorId = normalizeBehaviorId(
    opts.eventBehaviorId || formation.eventBehaviorId || group.eventBehaviorId || group.perfRepeatEventBehavior || 'none',
    'none'
  );
  const behaviorPriority = String(opts.behaviorPriority || formation.behaviorPriority || group.behaviorPriority || resolveBehaviorPriority(singleBehaviorId, groupBehaviorId, eventBehaviorId)).trim().toLowerCase();
  const singleBehaviorWindow = normalizeBehaviorWindow(opts.singleBehaviorWindow || formation.singleBehaviorWindow || group.singleBehaviorWindow || 'continuous', 'continuous');
  const groupBehaviorWindow = normalizeBehaviorWindow(
    opts.groupBehaviorWindow || formation.groupBehaviorWindow || group.groupBehaviorWindow || (groupBehaviorId !== 'none' ? 'persistent' : 'continuous'),
    groupBehaviorId !== 'none' ? 'persistent' : 'continuous'
  );
  const eventBehaviorWindow = normalizeBehaviorWindow(
    opts.eventBehaviorWindow || formation.eventBehaviorWindow || group.eventBehaviorWindow || (eventBehaviorId !== 'none' ? 'timed' : 'continuous'),
    eventBehaviorId !== 'none' ? 'timed' : 'continuous'
  );
  const behaviorWindow = normalizeBehaviorWindow(
    opts.behaviorWindow || formation.behaviorWindow || group.behaviorWindow || (behaviorPriority === 'event' ? eventBehaviorWindow : (behaviorPriority === 'group' ? groupBehaviorWindow : singleBehaviorWindow)),
    'continuous'
  );
  const behaviorSource = normalizeBehaviorSource(
    opts.behaviorSource
      || formation.behaviorSource
      || group.behaviorSource
      || (eventBehaviorId !== 'none'
        ? (group.perfRepeatEventBehavior ? 'perf_lab' : 'event')
        : (groupBehaviorId !== 'none'
          ? (String(formation.behavioralFormationActivationMode || group.behavioralFormationActivationMode || '').trim().toLowerCase() === 'forced_test' ? 'perf_lab' : 'director')
          : 'default')),
    'default'
  );
  return {
    singleBehaviorId,
    groupBehaviorId,
    eventBehaviorId,
    behaviorPriority,
    behaviorWindow,
    behaviorSource,
    singleBehaviorWindow,
    groupBehaviorWindow,
    eventBehaviorWindow,
  };
}

export function getBeatSwarmBehavioralFormationArchetype(id = '') {
  const key = String(id || '').trim().toLowerCase();
  return BEAT_SWARM_BEHAVIORAL_FORMATION_ARCHETYPES[key] || BEAT_SWARM_BEHAVIORAL_FORMATION_ARCHETYPES.none;
}

export function selectBeatSwarmBehavioralFormationForRole(options = null) {
  const opts = options && typeof options === 'object' ? options : {};
  const role = String(opts.role || '').trim().toLowerCase();
  const group = opts.group && typeof opts.group === 'object' ? opts.group : {};
  const activeMusicMode = String(opts.activeMusicMode || '').trim().toLowerCase();
  const introStage = String(opts.introStage || '').trim().toLowerCase();
  const eventSection = String(opts.activeEventSection || '').trim().toLowerCase();
  const explicitGroupBehaviorId = normalizeBehaviorId(opts.groupBehaviorId || group.groupBehaviorId || 'none', 'none');
  const profile = String(group?.introSlotProfileSourceType || group?.musicProfileSourceType || '').trim().toLowerCase();
  let archetypeId = 'none';
  let behavioralFormationActive = false;
  let activationMode = 'inactive';
  let intensityOverride = null;

  if (
    role === 'counter_rhythm'
    && (introStage === 'rhythm_only' || introStage === 'soft_ramp')
    && profile === 'spawner_rhythm_pulse'
    && group?.introStageCarrier === true
  ) {
    archetypeId = 'winding_chain';
    behavioralFormationActive = true;
    activationMode = 'forced_test';
    intensityOverride = 0.34;
  } else if (eventSection === 'dance_phrase') {
    archetypeId = role === 'lead_phrase' || role === 'answer_ornament'
      ? 'paired_dance'
      : 'advancing_line';
  } else if (eventSection === 'hold_then_surge') {
    archetypeId = role === 'counter_rhythm' ? 'advancing_line' : 'none';
  } else if (activeMusicMode === 'full_texture' && role === 'lead_phrase') {
    archetypeId = 'winding_chain';
  } else if (explicitGroupBehaviorId !== 'none') {
    archetypeId = explicitGroupBehaviorId;
    activationMode = 'opt_in';
  }

  const archetype = getBeatSwarmBehavioralFormationArchetype(archetypeId);
  return {
    behavioralFormationArchetype: String(archetype?.archetype || 'none').trim().toLowerCase(),
    behavioralFormationClass: String(archetype?.behaviorClass || 'none').trim().toLowerCase(),
    behavioralFormationActivationMode: String(activationMode || archetype?.activationMode || 'inactive').trim().toLowerCase(),
    behavioralFormationIntensity: intensityOverride == null ? (Number(archetype?.defaultIntensity) || 0) : Number(intensityOverride) || 0,
    behavioralFormationActive,
  };
}

export function applyBeatSwarmBehavioralFormationRuntime(groupLike = null, formationLike = null) {
  const group = groupLike && typeof groupLike === 'object' ? groupLike : null;
  const formation = formationLike && typeof formationLike === 'object' ? formationLike : null;
  if (!group || !formation) return group;
  group.behavioralFormationArchetype = String(formation.behavioralFormationArchetype || 'none').trim().toLowerCase();
  group.behavioralFormationClass = String(formation.behavioralFormationClass || 'none').trim().toLowerCase();
  group.behavioralFormationActivationMode = String(formation.behavioralFormationActivationMode || 'inactive').trim().toLowerCase();
  group.behavioralFormationIntensity = Number(formation.behavioralFormationIntensity) || 0;
  group.behavioralFormationActive = formation.behavioralFormationActive === true;
  const behaviorScope = buildBeatSwarmBehaviorScopeRuntime({ group, formation });
  group.singleBehaviorId = behaviorScope.singleBehaviorId;
  group.groupBehaviorId = behaviorScope.groupBehaviorId;
  group.eventBehaviorId = behaviorScope.eventBehaviorId;
  group.behaviorPriority = behaviorScope.behaviorPriority;
  group.behaviorWindow = behaviorScope.behaviorWindow;
  group.behaviorSource = behaviorScope.behaviorSource;
  group.singleBehaviorWindow = behaviorScope.singleBehaviorWindow;
  group.groupBehaviorWindow = behaviorScope.groupBehaviorWindow;
  group.eventBehaviorWindow = behaviorScope.eventBehaviorWindow;
  return group;
}
