export const BEAT_SWARM_LEVEL1_ALLOWED_ROLES = Object.freeze([
  'foundation_groove',
  'counter_rhythm',
  'lead_phrase',
  'answer_ornament',
]);

export const BEAT_SWARM_LEVEL1_PHASE_SEQUENCE = Object.freeze([
  'player_impact',
  'intro_teach',
  'groove_establish',
  'full_texture',
]);

export const BEAT_SWARM_LEVEL1_ROLE_BY_LANE_ID = Object.freeze({
  foundation_lane: 'foundation_groove',
  secondary_loop_lane: 'counter_rhythm',
  primary_loop_lane: 'lead_phrase',
  sparkle_lane: 'answer_ornament',
});

const BEAT_SWARM_LEVEL1_ROLE_BY_PROFILE_SOURCE_TYPE = Object.freeze({
  lead_melody: 'lead_phrase',
  answer_ornament: 'answer_ornament',
  spawner_rhythm_pulse: 'foundation_groove',
  secondary_bridge_backbeat: 'counter_rhythm',
  spawner_rhythm_backbeat: 'counter_rhythm',
  rhythm_lane: 'counter_rhythm',
  rhythm_lane_backbeat: 'counter_rhythm',
});

function normalizeId(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeLevel1Phase(value) {
  const phase = normalizeId(value);
  if (phase === 'foundation_intro' || phase === 'intro_pulse') return 'intro_teach';
  if (phase === 'layer_intro' || phase === 'intro_backbeat_bridge') return 'groove_establish';
  return phase;
}

function clampInt(value, fallback = 0) {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) ? n : Math.trunc(Number(fallback) || 0);
}

export function getBeatSwarmLevel1RoleForLane(laneId = '') {
  return BEAT_SWARM_LEVEL1_ROLE_BY_LANE_ID[normalizeId(laneId)] || '';
}

export function inferBeatSwarmLevel1RoleForCarrier(carrierLike = null, fallbackRole = 'counter_rhythm') {
  const carrier = carrierLike && typeof carrierLike === 'object' ? carrierLike : {};
  const laneRole = getBeatSwarmLevel1RoleForLane(carrier?.musicLaneId);
  if (laneRole) return laneRole;
  const callResponseLane = normalizeId(carrier?.callResponseLane);
  if (callResponseLane === 'response') return 'answer_ornament';
  const profile = normalizeId(carrier?.introSlotProfileSourceType || carrier?.musicProfileSourceType || '');
  if (BEAT_SWARM_LEVEL1_ROLE_BY_PROFILE_SOURCE_TYPE[profile]) {
    return BEAT_SWARM_LEVEL1_ROLE_BY_PROFILE_SOURCE_TYPE[profile];
  }
  const role = normalizeId(carrier?.role);
  if (role === 'bass') return 'foundation_groove';
  if (role === 'accent') return 'answer_ornament';
  if (
    normalizeId(carrier?.templateId) === 'foundation-buffer'
    || normalizeId(carrier?.sectionId) === 'foundation-buffer'
    || normalizeId(carrier?.sectionKey) === 'foundation-buffer'
  ) return 'foundation_groove';
  return normalizeId(fallbackRole) || 'counter_rhythm';
}

export function isBeatSwarmLevel1RoleEligibleForLane(roleId = '', laneId = '', eligibleRoles = null) {
  const roles = Array.isArray(eligibleRoles) ? eligibleRoles.map(normalizeId).filter(Boolean) : [];
  if (roles.length <= 0) return true;
  const role = normalizeId(roleId);
  if (role && roles.includes(role)) return true;
  const laneRole = getBeatSwarmLevel1RoleForLane(laneId);
  return !!laneRole && roles.includes(laneRole);
}

export function getBeatSwarmLevel1TargetCarrierCounts(input = null) {
  const data = input && typeof input === 'object' ? input : {};
  const activeLevelPhase = normalizeLevel1Phase(data.activeLevelPhase);
  const phaseVariant = normalizeId(data.phaseVariant || 'default') || 'default';
  const secondaryActive = (activeLevelPhase === 'groove_establish' && phaseVariant !== 'foundation_only')
    || activeLevelPhase === 'lead_merge'
    || activeLevelPhase === 'full_texture';
  const primaryActive = activeLevelPhase === 'lead_merge' || activeLevelPhase === 'full_texture';
  const ornamentActive = activeLevelPhase === 'full_texture' && phaseVariant !== 'no_ornament';
  return Object.freeze({
    foundation: 1,
    secondary_loop_rhythm: secondaryActive ? 1 : 0,
    primary_loop_lead: primaryActive ? 1 : 0,
    ornament: ornamentActive ? 1 : 0,
  });
}

export function getBeatSwarmLevel1EpochId(input = null) {
  const data = input && typeof input === 'object' ? input : {};
  const activeLevelPhase = normalizeLevel1Phase(data.activeLevelPhase);
  const phaseVariant = normalizeId(data.phaseVariant || 'default') || 'default';
  const sectionIntent = normalizeId(data.sectionIntent || 'default') || 'default';
  const sectionId = normalizeId(data.sectionId || 'default') || 'default';
  const barIndex = Math.max(0, clampInt(data.barIndex, 0));
  const cadenceEpoch = Math.max(0, Math.trunc(barIndex / 8));
  return `${activeLevelPhase || 'unknown'}:${phaseVariant}:${sectionIntent}:${sectionId}:epoch-${cadenceEpoch}`;
}

export function getBeatSwarmLevel1RoleContract(input = null) {
  const data = input && typeof input === 'object' ? input : {};
  const activeLevelPhase = normalizeLevel1Phase(data.activeLevelPhase);
  const phaseVariant = normalizeId(data.phaseVariant || 'default') || 'default';
  const barIndex = Math.max(0, clampInt(data.barIndex, 0));
  const answerWindowActive = data.answerWindowActive === true;
  const cadenceWindowActive = data.cadenceWindowActive === true;
  const stableWindow = data.stableWindow === true;

  const isFullTexture = activeLevelPhase === 'full_texture';
  const isIntroTeach = activeLevelPhase === 'intro_teach';
  const isGrooveEstablish = activeLevelPhase === 'groove_establish';
  const isDegradedFullTexture = isFullTexture && phaseVariant === 'no_ornament';
  const foundationAllowed = activeLevelPhase !== 'player_impact';
  const counterRhythmAllowed = isGrooveEstablish || activeLevelPhase === 'lead_merge' || isFullTexture;
  const leadPhraseAllowed = isFullTexture || activeLevelPhase === 'lead_merge';
  const supportPunctuationEpoch = Math.max(0, Math.trunc(barIndex / 8));
  const supportPunctuationRotation = Object.freeze([
    Object.freeze([6]),
    Object.freeze([3]),
    Object.freeze([1]),
    Object.freeze([3]),
  ]);
  const preferredSupportStepIndices = isFullTexture
    ? supportPunctuationRotation[supportPunctuationEpoch % supportPunctuationRotation.length]
    : Object.freeze([6]);

  const roles = {
    foundation_groove: {
      allowed: foundationAllowed,
      required: foundationAllowed,
      maxIdentities: 1,
      behavior: isIntroTeach ? 'intro_foundation' : 'persistent',
    },
    counter_rhythm: {
      allowed: counterRhythmAllowed,
      required: counterRhythmAllowed,
      maxIdentities: 1,
      behavior: isFullTexture ? 'epoch_locked' : 'intro_layer',
    },
    lead_phrase: {
      allowed: leadPhraseAllowed,
      required: leadPhraseAllowed,
      maxIdentities: 1,
      behavior: isFullTexture ? 'dominant_foreground' : 'inactive',
    },
    answer_ornament: {
      allowed: isFullTexture && !isDegradedFullTexture && (answerWindowActive || cadenceWindowActive),
      required: false,
      maxIdentities: 1,
      behavior: cadenceWindowActive ? 'cadence_punctuation' : 'stable_window_punctuation',
    },
  };

  return {
    allowedRoles: Object.freeze(
      Object.keys(roles).filter((role) => roles[role].allowed)
    ),
    roles: Object.freeze(roles),
    arbitration: Object.freeze({
      gameplayMayThin: true,
      gameplayMayDefer: true,
      gameplayMayFailToEmbody: true,
      gameplayMayAddRoles: false,
      gameplayMayReclassifyRoles: false,
      gameplayMayAlterTimingWindows: false,
    }),
    supportPolicy: Object.freeze({
      allowSparkle: false,
      allowAmbientFiller: false,
      allowDenseSupportStacks: false,
      counterRhythmFamilyScope: 'epoch_locked',
      preferredCounterRhythmFamily: isFullTexture ? 'secondary_bridge_backbeat' : 'secondary_bridge_backbeat',
      supportPatternBudget: isFullTexture ? 'single_offbeat_punctuation' : 'default',
      preferredSupportStepIndices,
      supportPunctuationEpoch,
      answerPolicy: roles.answer_ornament.allowed ? 'stable_window_punctuation' : 'disabled',
    }),
  };
}

export function isBeatSwarmLevel1RoleAllowed(roleId, input = null) {
  const role = normalizeId(roleId);
  const contract = getBeatSwarmLevel1RoleContract(input);
  return contract.allowedRoles.includes(role);
}
