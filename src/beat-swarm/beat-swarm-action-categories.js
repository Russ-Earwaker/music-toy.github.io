export const BEAT_SWARM_ACTION_CATEGORY = Object.freeze({
  MOVEMENT_EVENT: 'movement_event',
  MUSICAL_NOTE: 'musical_note',
  GAMEPLAY_ATTACK: 'gameplay_attack',
  COMBAT_FEEDBACK: 'combat_feedback',
  UNKNOWN: 'unknown',
});

export function classifyBeatSwarmEventSection(sectionIdLike = 'none') {
  const sectionId = String(sectionIdLike || 'none').trim().toLowerCase();
  if (sectionId === 'beat_bounce') {
    return Object.freeze({
      actionCategory: BEAT_SWARM_ACTION_CATEGORY.MOVEMENT_EVENT,
      audioRequired: false,
      classificationReason: 'beat_synced_movement_section',
    });
  }
  return Object.freeze({
    actionCategory: BEAT_SWARM_ACTION_CATEGORY.UNKNOWN,
    audioRequired: false,
    classificationReason: 'no_event_section',
  });
}

export function classifyBeatSwarmPerformedAction(eventLike = null, context = null) {
  const event = eventLike && typeof eventLike === 'object' ? eventLike : {};
  const payload = event?.payload && typeof event.payload === 'object' ? event.payload : {};
  const ctx = context && typeof context === 'object' ? context : {};
  const actionType = String(event?.actionType || ctx?.actionType || '').trim().toLowerCase();
  const sourceSystem = String(ctx?.sourceSystem || payload?.sourceSystem || event?.sourceSystem || '').trim().toLowerCase();
  const authoringClass = String(ctx?.authoringClass || payload?.authoringClass || event?.authoringClass || '').trim().toLowerCase();

  if (
    sourceSystem === 'player'
    || actionType === 'player-weapon-step'
    || actionType.includes('chain')
    || actionType.includes('beam')
    || actionType.includes('boomerang')
    || actionType.includes('hitscan')
  ) {
    return {
      actionCategory: BEAT_SWARM_ACTION_CATEGORY.GAMEPLAY_ATTACK,
      audioRequired: true,
      classificationReason: 'player_or_weapon_attack',
    };
  }

  if (
    sourceSystem === 'death'
    || actionType === 'enemy-death-accent'
    || actionType.includes('death')
    || actionType.includes('impact')
    || actionType.includes('collision')
  ) {
    return {
      actionCategory: BEAT_SWARM_ACTION_CATEGORY.COMBAT_FEEDBACK,
      audioRequired: true,
      classificationReason: 'combat_feedback',
    };
  }

  if (
    actionType === 'spawner-spawn'
    || actionType === 'drawsnake-projectile'
    || actionType === 'composer-group-projectile'
    || actionType === 'composer-group-explosion'
    || actionType.includes('projectile')
    || actionType.includes('explosion')
  ) {
    return {
      actionCategory: BEAT_SWARM_ACTION_CATEGORY.GAMEPLAY_ATTACK,
      audioRequired: true,
      classificationReason: 'enemy_attack',
    };
  }

  if (authoringClass === 'musicauthored' || sourceSystem === 'group') {
    return {
      actionCategory: BEAT_SWARM_ACTION_CATEGORY.MUSICAL_NOTE,
      audioRequired: true,
      classificationReason: 'music_authored_note',
    };
  }

  if (authoringClass === 'gameplayauthored') {
    return {
      actionCategory: BEAT_SWARM_ACTION_CATEGORY.GAMEPLAY_ATTACK,
      audioRequired: true,
      classificationReason: 'gameplay_authored_action',
    };
  }

  return {
    actionCategory: BEAT_SWARM_ACTION_CATEGORY.UNKNOWN,
    audioRequired: false,
    classificationReason: 'unclassified',
  };
}
