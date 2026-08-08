const GUNNER_ATTACK_PATTERNS = Object.freeze({
  straight: Object.freeze({
    id: 'straight',
    cadenceBeats: 2,
    projectileCount: 1,
    projectileSpeed: 620,
    spreadRadians: 0,
    damage: 1,
    soundVolume: 0.34,
  }),
  spread: Object.freeze({
    id: 'spread',
    cadenceBeats: 4,
    projectileCount: 5,
    projectileSpeed: 540,
    spreadRadians: 0.72,
    damage: 0.72,
    soundVolume: 0.42,
  }),
  burst: Object.freeze({
    id: 'burst',
    cadenceBeats: 6,
    projectileCount: 1,
    projectileSpeed: 680,
    spreadRadians: 0,
    damage: 0.82,
    soundVolume: 0.32,
    burstCount: 3,
    burstSpacingBeats: 1,
  }),
});

const SEEKER_ATTACK_PATTERNS = Object.freeze({
  homing: Object.freeze({
    id: 'homing',
    cadenceBeats: 6,
    projectileCount: 1,
    projectileSpeed: 330,
    spreadRadians: 0,
    damage: 1,
    soundVolume: 0.42,
    homing: true,
    homingTurnRate: 1.7,
    projectileLifetime: 5.5,
  }),
  homing_swarm: Object.freeze({
    id: 'homing_swarm',
    cadenceBeats: 8,
    projectileCount: 5,
    projectileSpeed: 270,
    spreadRadians: 0.68,
    damage: 0.48,
    soundVolume: 0.38,
    homing: true,
    homingTurnRate: 1.08,
    projectileLifetime: 4.8,
  }),
});

const LASER_SPINNER_ATTACK_PATTERNS = Object.freeze({
  sweep_laser: Object.freeze({
    id: 'sweep_laser',
    attackKind: 'laser',
    cadenceBeats: 12,
    warningBeats: 1,
    activeBeats: 8,
    beamCount: 1,
    angularSpeed: 0.82,
    lengthWorld: 1800,
    soundVolume: 0.44,
    deferSoundToActivation: true,
  }),
  radial_laser: Object.freeze({
    id: 'radial_laser',
    attackKind: 'laser',
    cadenceBeats: 16,
    warningBeats: 1,
    activeBeats: 12,
    beamCount: 3,
    angularSpeed: -0.46,
    lengthWorld: 1800,
    soundVolume: 0.48,
    deferSoundToActivation: true,
  }),
});

const SHAPE_CASTER_ATTACK_PATTERNS = Object.freeze({
  safe_inside_circle: Object.freeze({
    id: 'safe_inside_circle',
    attackKind: 'shape',
    cadenceBeats: 10,
    warningBeats: 2,
    activeBeats: 5,
    shape: 'circle',
    safety: 'inside',
    placement: 'approach',
    radiusWorld: 380,
    outerRadiusWorld: 620,
    minTargetDistanceWorld: 660,
    soundVolume: 0.46,
    deferSoundToActivation: true,
  }),
  safe_outside_hex: Object.freeze({
    id: 'safe_outside_hex',
    attackKind: 'shape',
    cadenceBeats: 12,
    warningBeats: 2,
    activeBeats: 6,
    shape: 'hex',
    safety: 'outside',
    placement: 'player',
    radiusWorld: 230,
    outerRadiusWorld: 520,
    soundVolume: 0.48,
    deferSoundToActivation: true,
  }),
});

const CHARGER_ATTACK_PATTERNS = Object.freeze({
  direct_charge: Object.freeze({
    id: 'direct_charge',
    attackKind: 'charge',
    cadenceBeats: 8,
    warningBeats: 2,
    chargeBeats: 2,
    aimMode: 'direct',
    chargeSpeed: 920,
    lineLengthWorld: 1550,
    soundVolume: 0.5,
    deferSoundToActivation: true,
  }),
  intercept_charge: Object.freeze({
    id: 'intercept_charge',
    attackKind: 'charge',
    cadenceBeats: 10,
    warningBeats: 2,
    chargeBeats: 2,
    aimMode: 'intercept',
    predictionSeconds: 0.78,
    chargeSpeed: 1080,
    lineLengthWorld: 1650,
    soundVolume: 0.54,
    deferSoundToActivation: true,
  }),
});

const CONDUCTOR_ATTACK_PATTERNS = Object.freeze({
  shield_pair: Object.freeze({
    id: 'shield_pair',
    attackKind: 'conductor',
    cadenceBeats: 8,
    activeBeats: 8,
    radiusWorld: 700,
    maxTargets: 2,
    damageMultiplier: 0.12,
    soundVolume: 0.4,
  }),
  shield_field: Object.freeze({
    id: 'shield_field',
    attackKind: 'conductor',
    cadenceBeats: 12,
    activeBeats: 12,
    radiusWorld: 820,
    maxTargets: 4,
    damageMultiplier: 0.42,
    soundVolume: 0.46,
  }),
});

export const BEAT_SWARM_ENEMY_COMBAT_PROFILES = Object.freeze({
  gunner: Object.freeze({
    id: 'gunner',
    bodyProfileId: 'gunner',
    movementBehaviorId: 'hold_position',
    combatRole: 'pressure',
    challengeTags: Object.freeze(['quick_dodge', 'thread_gaps']),
    defaultPatternId: 'straight',
    attackPatterns: GUNNER_ATTACK_PATTERNS,
  }),
  seeker: Object.freeze({
    id: 'seeker',
    bodyProfileId: 'seeker',
    movementBehaviorId: 'pursue_player',
    combatRole: 'pursuit',
    challengeTags: Object.freeze(['sustained_movement', 'retreat', 'bait']),
    defaultPatternId: 'homing',
    attackPatterns: SEEKER_ATTACK_PATTERNS,
  }),
  laser_spinner: Object.freeze({
    id: 'laser_spinner',
    bodyProfileId: 'laser_spinner',
    movementBehaviorId: 'hold_position',
    combatRole: 'area_control',
    challengeTags: Object.freeze(['sustained_movement', 'orbit', 'thread_gaps']),
    defaultPatternId: 'sweep_laser',
    attackPatterns: LASER_SPINNER_ATTACK_PATTERNS,
  }),
  shape_caster: Object.freeze({
    id: 'shape_caster',
    bodyProfileId: 'shape_caster',
    movementBehaviorId: 'hold_position',
    combatRole: 'area_control',
    challengeTags: Object.freeze(['approach', 'retreat', 'reposition', 'space_management']),
    defaultPatternId: 'safe_inside_circle',
    attackPatterns: SHAPE_CASTER_ATTACK_PATTERNS,
  }),
  charger: Object.freeze({
    id: 'charger',
    bodyProfileId: 'charger',
    movementBehaviorId: 'hold_position',
    combatRole: 'physical_threat',
    challengeTags: Object.freeze(['quick_dodge', 'bait', 'reposition']),
    defaultPatternId: 'direct_charge',
    attackPatterns: CHARGER_ATTACK_PATTERNS,
  }),
  conductor: Object.freeze({
    id: 'conductor',
    bodyProfileId: 'conductor',
    movementBehaviorId: 'hold_position',
    combatRole: 'control',
    challengeTags: Object.freeze(['target_priority', 'space_management']),
    defaultPatternId: 'shield_pair',
    attackPatterns: CONDUCTOR_ATTACK_PATTERNS,
  }),
});

export function getBeatSwarmEnemyCombatProfile(profileId) {
  const id = String(profileId || '').trim().toLowerCase();
  return BEAT_SWARM_ENEMY_COMBAT_PROFILES[id] || null;
}

export function getBeatSwarmEnemyAttackPattern(profileId, patternId) {
  const profile = getBeatSwarmEnemyCombatProfile(profileId);
  if (!profile) return null;
  const id = String(patternId || profile.defaultPatternId || '').trim().toLowerCase();
  return profile.attackPatterns?.[id] || profile.attackPatterns?.[profile.defaultPatternId] || null;
}
