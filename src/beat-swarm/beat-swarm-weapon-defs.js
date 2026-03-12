export const WEAPON_ARCHETYPES = Object.freeze({
  projectile: Object.freeze({
    id: 'projectile',
    label: 'Projectile',
    variants: Object.freeze([
      Object.freeze({ id: 'standard', label: 'Standard' }),
      Object.freeze({ id: 'homing-missile', label: 'Homing Missile' }),
      Object.freeze({ id: 'boomerang', label: 'Boomerang' }),
      Object.freeze({ id: 'split-shot', label: 'Split Shot' }),
    ]),
  }),
  aoe: Object.freeze({
    id: 'aoe',
    label: 'AOE',
    variants: Object.freeze([
      Object.freeze({ id: 'explosion', label: 'Explosion' }),
      Object.freeze({ id: 'dot-area', label: 'Damage Over Time Area' }),
    ]),
  }),
  laser: Object.freeze({
    id: 'laser',
    label: 'Laser',
    variants: Object.freeze([
      Object.freeze({ id: 'hitscan', label: 'Hit-scan' }),
      Object.freeze({ id: 'beam', label: 'Constant Beam' }),
    ]),
  }),
  helper: Object.freeze({
    id: 'helper',
    label: 'Helper',
    variants: Object.freeze([
      Object.freeze({ id: 'orbital-drone', label: 'Orbital Drone' }),
      Object.freeze({ id: 'turret', label: 'Turret' }),
    ]),
  }),
});

export const WEAPON_COMPONENTS = Object.freeze([
  Object.freeze({ id: 'projectile:standard', archetype: 'projectile', variant: 'standard', label: 'Standard', previewClass: 'is-proj' }),
  Object.freeze({ id: 'projectile:homing-missile', archetype: 'projectile', variant: 'homing-missile', label: 'Homing Missile', previewClass: 'is-proj' }),
  Object.freeze({ id: 'projectile:boomerang', archetype: 'projectile', variant: 'boomerang', label: 'Boomerang', previewClass: 'is-boomerang' }),
  Object.freeze({ id: 'projectile:split-shot', archetype: 'projectile', variant: 'split-shot', label: 'Split Shot', previewClass: 'is-split' }),
  Object.freeze({ id: 'laser:hitscan', archetype: 'laser', variant: 'hitscan', label: 'Hit-scan', previewClass: 'is-hitscan' }),
  Object.freeze({ id: 'laser:beam', archetype: 'laser', variant: 'beam', label: 'Constant Beam', previewClass: 'is-beam' }),
  Object.freeze({ id: 'aoe:explosion', archetype: 'aoe', variant: 'explosion', label: 'Explosion', previewClass: 'is-explosion' }),
  Object.freeze({ id: 'aoe:dot-area', archetype: 'aoe', variant: 'dot-area', label: 'Damage Over Time Area', previewClass: 'is-dotarea' }),
  Object.freeze({ id: 'helper:orbital-drone', archetype: 'helper', variant: 'orbital-drone', label: 'Orbital Drone', previewClass: 'is-helper-orbital' }),
  Object.freeze({ id: 'helper:turret', archetype: 'helper', variant: 'turret', label: 'Turret', previewClass: 'is-helper-turret' }),
]);
