export const BEAT_SWARM_MUSIC_OWNERSHIP = Object.freeze({
  PLAYER_CORE: 'player_core',
  TEMPORARY_ARRANGEMENT: 'temporary_arrangement',
  GAMEPLAY_FEEDBACK: 'gameplay_feedback',
});

export const BEAT_SWARM_MUSIC_MUTATION = Object.freeze({
  IMMUTABLE: 'immutable',
  IDENTITY_PRESERVING: 'identity_preserving',
  DERIVED: 'derived',
});

export const BEAT_SWARM_FOUNDATION_INSTRUMENT_ID = 'DRUM KICK';
export const BEAT_SWARM_FOUNDATION_NOTE = 'C4';

export const BEAT_SWARM_PLAYER_MUSIC_CONTRACTS = Object.freeze({
  weaponRiff: Object.freeze({
    id: 'weaponRiff',
    laneId: 'player_weapon',
    ownership: BEAT_SWARM_MUSIC_OWNERSHIP.GAMEPLAY_FEEDBACK,
    semanticRole: 'weapon_pulse',
    mutationPolicy: BEAT_SWARM_MUSIC_MUTATION.IMMUTABLE,
    preserveTiming: true,
    preservePitch: true,
    preserveInstrument: true,
    preserveDamageSlots: true,
  }),
  bassDrive: Object.freeze({
    id: 'bassDrive',
    laneId: 'foundation_lane',
    ownership: BEAT_SWARM_MUSIC_OWNERSHIP.PLAYER_CORE,
    semanticRole: 'foundation_percussion',
    mutationPolicy: BEAT_SWARM_MUSIC_MUTATION.IDENTITY_PRESERVING,
    defaultInstrumentId: BEAT_SWARM_FOUNDATION_INSTRUMENT_ID,
    defaultNote: BEAT_SWARM_FOUNDATION_NOTE,
  }),
  accentRhythm: Object.freeze({
    id: 'accentRhythm',
    laneId: 'secondary_loop_lane',
    ownership: BEAT_SWARM_MUSIC_OWNERSHIP.PLAYER_CORE,
    semanticRole: 'accent_percussion',
    mutationPolicy: BEAT_SWARM_MUSIC_MUTATION.IDENTITY_PRESERVING,
  }),
  leadTheme: Object.freeze({
    id: 'leadTheme',
    laneId: 'primary_loop_lane',
    ownership: BEAT_SWARM_MUSIC_OWNERSHIP.PLAYER_CORE,
    semanticRole: 'lead_melody',
    mutationPolicy: BEAT_SWARM_MUSIC_MUTATION.IDENTITY_PRESERVING,
  }),
  powerTheme: Object.freeze({
    id: 'powerTheme',
    laneId: 'power_theme_lane',
    ownership: BEAT_SWARM_MUSIC_OWNERSHIP.PLAYER_CORE,
    semanticRole: 'power_lead',
    mutationPolicy: BEAT_SWARM_MUSIC_MUTATION.IDENTITY_PRESERVING,
  }),
  sparkle: Object.freeze({
    id: 'sparkle',
    laneId: 'sparkle_lane',
    ownership: BEAT_SWARM_MUSIC_OWNERSHIP.TEMPORARY_ARRANGEMENT,
    semanticRole: 'ornament_fill',
    mutationPolicy: BEAT_SWARM_MUSIC_MUTATION.DERIVED,
  }),
});

const PLAYER_CONTRACT_BY_LANE = new Map(
  Object.values(BEAT_SWARM_PLAYER_MUSIC_CONTRACTS).map((contract) => [contract.laneId, contract])
);

export const BEAT_SWARM_FORMATION_ARRANGEMENT_CONTRACTS = Object.freeze({
  gunner_snare: Object.freeze({
    ownership: BEAT_SWARM_MUSIC_OWNERSHIP.TEMPORARY_ARRANGEMENT,
    arrangementRole: 'rhythmic_reinforcement',
    derivedFromLaneIds: Object.freeze(['foundation_lane', 'secondary_loop_lane']),
  }),
  laser_hihat: Object.freeze({
    ownership: BEAT_SWARM_MUSIC_OWNERSHIP.TEMPORARY_ARRANGEMENT,
    arrangementRole: 'rhythmic_reinforcement',
    derivedFromLaneIds: Object.freeze(['secondary_loop_lane', 'player_weapon']),
  }),
  laser_lead: Object.freeze({
    ownership: BEAT_SWARM_MUSIC_OWNERSHIP.TEMPORARY_ARRANGEMENT,
    arrangementRole: 'countermelody',
    derivedFromLaneIds: Object.freeze(['primary_loop_lane']),
  }),
});

export function getBeatSwarmPlayerMusicContract(idOrLaneLike = '') {
  const key = String(idOrLaneLike || '').trim();
  return BEAT_SWARM_PLAYER_MUSIC_CONTRACTS[key]
    || PLAYER_CONTRACT_BY_LANE.get(key)
    || null;
}

export function getBeatSwarmFormationArrangementContract(kindLike = '') {
  const kind = String(kindLike || '').trim().toLowerCase();
  return BEAT_SWARM_FORMATION_ARRANGEMENT_CONTRACTS[kind] || null;
}

export function getBeatSwarmWeaponEventOwnershipPayload() {
  const contract = BEAT_SWARM_PLAYER_MUSIC_CONTRACTS.weaponRiff;
  return {
    musicOwnership: contract.ownership,
    musicSemanticRole: contract.semanticRole,
    musicMutationPolicy: contract.mutationPolicy,
    musicIdentityId: contract.id,
  };
}

export function isBeatSwarmWeaponTransformationAllowed(transformationLike = '') {
  const transformation = String(transformationLike || '').trim().toLowerCase();
  return transformation === 'reinforce'
    || transformation === 'harmonize_around'
    || transformation === 'echo'
    || transformation === 'fill_gaps';
}
