export const WEAPON_GATE_NOTE_POOL = Object.freeze(['C4', 'D#4', 'F4', 'G4', 'A#4']);
export const WEAPON_GATE_TOTAL_SLOTS = 16;
export const WEAPON_GATE_TARGET_SILENCES = 6;
export const WEAPON_GATE_MAX_SILENCE_STREAK = 2;
export const WEAPON_GATE_START_X = 760;
export const WEAPON_GATE_SPACING = 690;
export const WEAPON_GATE_CRUISE_SPEED = 760;
export const WEAPON_GATE_LAUNCH_SPEED = 1120;
export const WEAPON_GATE_LAUNCH_DECEL_SECONDS = 0.8;
export const WEAPON_GATE_FIRST_ARRIVAL_STEPS = 8;
export const WEAPON_GATE_CURVE_AMPLITUDE = 82;
export const WEAPON_GATE_CURVE_VARIANCE = 0.38;
export const WEAPON_GATE_CURVE_WAVELENGTH = 1850;
export const WEAPON_GATE_CURVE_ANGLE_SCALE = 0.72;

export function getWeaponGateAuthoredSchedule() {
  const slotsByPass = [
    [0],
    [2],
    [4, 6],
    [8, 10, 12, 14],
    [],
    [1, 3, 5, 7],
    [9, 11, 13, 15],
  ];
  return slotsByPass.flatMap((slots, passIndex) => slots.map((slotIndex) => ({
    passIndex,
    slotIndex,
    motifStep: slotIndex,
    absoluteStep: (passIndex * WEAPON_GATE_TOTAL_SLOTS) + slotIndex,
    forceNote: passIndex < 3,
  })));
}

export function getWeaponGateTravelDistance(seconds = 0) {
  const t = Math.max(0, Number(seconds) || 0);
  const decelDuration = Math.max(0.001, WEAPON_GATE_LAUNCH_DECEL_SECONDS);
  const launchExtra = Math.max(0, WEAPON_GATE_LAUNCH_SPEED - WEAPON_GATE_CRUISE_SPEED);
  if (t < decelDuration) {
    return (WEAPON_GATE_CRUISE_SPEED * t)
      + launchExtra * (t - ((t * t) / (2 * decelDuration)));
  }
  return (WEAPON_GATE_CRUISE_SPEED * t) + (launchExtra * decelDuration * 0.5);
}

export function hashWeaponGateSeed(seed) {
  const s = String(seed || '1');
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
