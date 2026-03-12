import { WEAPON_ARCHETYPES, WEAPON_COMPONENTS } from './beat-swarm-weapon-defs.js';

export function getArchetypeDef(id) {
  const key = String(id || '').trim();
  return WEAPON_ARCHETYPES[key] || null;
}

export function getVariantDef(archetype, variant) {
  const a = getArchetypeDef(archetype);
  if (!a) return null;
  return a.variants.find((v) => v.id === variant) || null;
}

export function getWeaponComponentDefById(componentId) {
  const id = String(componentId || '').trim();
  return WEAPON_COMPONENTS.find((c) => c.id === id) || null;
}

export function getWeaponComponentDefForStage(stage) {
  const archetype = String(stage?.archetype || '').trim();
  const variant = String(stage?.variant || '').trim();
  return getWeaponComponentDefById(`${archetype}:${variant}`);
}
