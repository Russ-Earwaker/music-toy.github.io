export const BEAT_SWARM_LEVEL1_ALLOWED_ROLES = Object.freeze([
  'foundation_groove',
  'counter_rhythm',
  'lead_phrase',
  'answer_ornament',
]);

export const BEAT_SWARM_LEVEL1_PHASE_SEQUENCE = Object.freeze([
  'player_impact',
  'foundation_intro',
  'layer_intro',
  'full_texture',
]);

function normalizeId(value) {
  return String(value || '').trim().toLowerCase();
}

function clampInt(value, fallback = 0) {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) ? n : Math.trunc(Number(fallback) || 0);
}

export function getBeatSwarmLevel1EpochId(input = null) {
  const data = input && typeof input === 'object' ? input : {};
  const activeLevelPhase = normalizeId(data.activeLevelPhase);
  const phaseVariant = normalizeId(data.phaseVariant || 'default') || 'default';
  const sectionIntent = normalizeId(data.sectionIntent || 'default') || 'default';
  const sectionId = normalizeId(data.sectionId || 'default') || 'default';
  const barIndex = Math.max(0, clampInt(data.barIndex, 0));
  const cadenceEpoch = Math.max(0, Math.trunc(barIndex / 8));
  return `${activeLevelPhase || 'unknown'}:${phaseVariant}:${sectionIntent}:${sectionId}:epoch-${cadenceEpoch}`;
}

export function getBeatSwarmLevel1RoleContract(input = null) {
  const data = input && typeof input === 'object' ? input : {};
  const activeLevelPhase = normalizeId(data.activeLevelPhase);
  const phaseVariant = normalizeId(data.phaseVariant || 'default') || 'default';
  const answerWindowActive = data.answerWindowActive === true;
  const stableWindow = data.stableWindow === true;

  const isFullTexture = activeLevelPhase === 'full_texture';
  const isDegradedFullTexture = isFullTexture && phaseVariant === 'no_ornament';

  const roles = {
    foundation_groove: {
      allowed: activeLevelPhase !== 'player_impact',
      required: activeLevelPhase !== 'player_impact',
      maxIdentities: 1,
      behavior: 'persistent',
    },
    counter_rhythm: {
      allowed: activeLevelPhase === 'layer_intro' || isFullTexture,
      required: activeLevelPhase === 'layer_intro' || isFullTexture,
      maxIdentities: 1,
      behavior: isFullTexture ? 'epoch_locked' : 'intro_layer',
    },
    lead_phrase: {
      allowed: isFullTexture,
      required: isFullTexture,
      maxIdentities: 1,
      behavior: isFullTexture ? 'dominant_foreground' : 'inactive',
    },
    answer_ornament: {
      allowed: isFullTexture && !isDegradedFullTexture && stableWindow && answerWindowActive,
      required: false,
      maxIdentities: 1,
      behavior: 'stable_window_punctuation',
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
      preferredSupportStepIndices: Object.freeze([6]),
      answerPolicy: roles.answer_ornament.allowed ? 'stable_window_punctuation' : 'disabled',
    }),
  };
}

export function isBeatSwarmLevel1RoleAllowed(roleId, input = null) {
  const role = normalizeId(roleId);
  const contract = getBeatSwarmLevel1RoleContract(input);
  return contract.allowedRoles.includes(role);
}
