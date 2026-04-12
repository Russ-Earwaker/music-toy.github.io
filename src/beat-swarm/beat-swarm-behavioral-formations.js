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
  return group;
}
