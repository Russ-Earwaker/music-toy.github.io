export const SWARM_SOUND_EVENTS = Object.freeze({
  hitscan: Object.freeze({ instrumentDisplay: 'Laser', note: 'C4' }),
  playerProjectile: Object.freeze({ instrumentDisplay: 'Retro Projectile Subtle', note: 'C4' }),
  projectile: Object.freeze({ instrumentDisplay: 'Tone (Sine)', note: 'C4' }),
  boomerang: Object.freeze({ instrumentDisplay: 'Tone (Sine)', note: 'G3' }),
  beam: Object.freeze({ instrumentDisplay: 'Laser', note: 'C3' }),
  explosion: Object.freeze({ instrumentDisplay: 'Retro Explosion Subtle', note: 'C4' }),
  enemyDeathSmall: Object.freeze({ instrumentDisplay: 'Arcade Blip', note: 'C5', volumeMult: 0.82, arpStepSec: 0.012, arpMaxNotes: 3, pitchDropSemitones: 2 }),
  enemyDeathMedium: Object.freeze({ instrumentDisplay: 'Gaming Bling', note: 'C4', volumeMult: 0.9, arpStepSec: 0.022, arpMaxNotes: 4, pitchDropSemitones: 4 }),
  enemyDeathLarge: Object.freeze({ instrumentDisplay: 'Bass Tone 4', note: 'C3', volumeMult: 1, arpStepSec: 0.032, arpMaxNotes: 5, pitchDropSemitones: 7 }),
  // Legacy key kept for compatibility with older runtime/debug calls.
  enemyDeath: Object.freeze({ instrumentDisplay: 'Gaming Bling', note: 'C4', volumeMult: 0.9, arpStepSec: 0.022, arpMaxNotes: 4, pitchDropSemitones: 4 }),
});

export const SWARM_ENEMY_DEATH_EVENT_KEY_BY_FAMILY = Object.freeze({
  small: 'enemyDeathSmall',
  medium: 'enemyDeathMedium',
  large: 'enemyDeathLarge',
});

export const PLAYER_WEAPON_SOUND_EVENT_KEYS = Object.freeze({
  projectile: 'playerProjectile',
  boomerang: 'boomerang',
  hitscan: 'hitscan',
  beam: 'beam',
  explosion: 'explosion',
});
