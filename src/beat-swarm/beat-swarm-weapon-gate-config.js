export const WEAPON_GATE_NOTE_POOL = Object.freeze(['C4', 'D#4', 'F4', 'G4', 'A#4']);
export const WEAPON_GATE_TOTAL_SLOTS = 16;
export const WEAPON_GATE_TARGET_SILENCES = 6;
export const WEAPON_GATE_MAX_SILENCE_STREAK = 2;
export const WEAPON_GATE_START_X = 760;
export const WEAPON_GATE_SPACING = 690;

export function hashWeaponGateSeed(seed) {
  const s = String(seed || '1');
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
