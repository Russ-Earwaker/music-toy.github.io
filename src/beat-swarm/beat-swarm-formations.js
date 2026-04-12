export const BEAT_SWARM_FORMATION_ARCHETYPES = Object.freeze({
  foundation_anchor_line: Object.freeze({
    archetype: 'foundation_anchor_line',
    defaultSpawnRegion: 'lower_outer',
    defaultSpacingProfile: 'broad_line',
    defaultSymmetry: 'mirrored',
    defaultPresentationWeight: 0.9,
    memberCountRange: Object.freeze([2, 4]),
  }),
  backbeat_pair: Object.freeze({
    archetype: 'backbeat_pair',
    defaultSpawnRegion: 'mid_side',
    defaultSpacingProfile: 'paired',
    defaultSymmetry: 'mirrored',
    defaultPresentationWeight: 0.84,
    memberCountRange: Object.freeze([2, 3]),
  }),
  syncopation_stair: Object.freeze({
    archetype: 'syncopation_stair',
    defaultSpawnRegion: 'side_diagonal',
    defaultSpacingProfile: 'staggered',
    defaultSymmetry: 'offset',
    defaultPresentationWeight: 0.8,
    memberCountRange: Object.freeze([2, 4]),
  }),
  lead_arc: Object.freeze({
    archetype: 'lead_arc',
    defaultSpawnRegion: 'upper_mid',
    defaultSpacingProfile: 'loose_chain',
    defaultSymmetry: 'none',
    defaultPresentationWeight: 1,
    memberCountRange: Object.freeze([1, 3]),
  }),
  answer_echo: Object.freeze({
    archetype: 'answer_echo',
    defaultSpawnRegion: 'lead_reply_edge',
    defaultSpacingProfile: 'tight_cluster',
    defaultSymmetry: 'reply_mirror',
    defaultPresentationWeight: 0.58,
    memberCountRange: Object.freeze([1, 2]),
  }),
});

export function getBeatSwarmFormationArchetype(id = '') {
  const key = String(id || '').trim().toLowerCase();
  return BEAT_SWARM_FORMATION_ARCHETYPES[key] || null;
}
