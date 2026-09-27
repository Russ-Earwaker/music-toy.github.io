import {
  WEAPON_GATE_CURVE_AMPLITUDE,
  WEAPON_GATE_CURVE_ANGLE_SCALE,
  WEAPON_GATE_CURVE_VARIANCE,
  WEAPON_GATE_CURVE_WAVELENGTH,
  WEAPON_GATE_SPACING,
  WEAPON_GATE_START_X,
} from './beat-swarm-weapon-gate-config.js?v=2026-06-18-corridor-curve-v1';

export const WEAPON_GATE_LOGICAL_WIDTH = 1600;
export const WEAPON_GATE_LOGICAL_HEIGHT = 900;
export const WEAPON_GATE_LOGICAL_CENTER = Object.freeze({ x: 800, y: 450 });

export function clampWeaponGateValue(v, min, max) {
  return Math.max(min, Math.min(max, Number(v) || 0));
}

export function getWeaponGateShipLogicalPoint() {
  return WEAPON_GATE_LOGICAL_CENTER;
}

export function getWeaponGateLogicalBounds() {
  const center = WEAPON_GATE_LOGICAL_CENTER.y;
  const halfHeight = WEAPON_GATE_LOGICAL_HEIGHT / 6;
  return {
    top: center - halfHeight,
    bottom: center + halfHeight,
  };
}

export function getWeaponGateCurveOffsetAtWorldX(state, worldX = 0) {
  const x = Number(worldX) || 0;
  const seed = Number(state?.corridorCurveSeed) || 0;
  const amp = Number(state?.corridorCurveAmplitude ?? WEAPON_GATE_CURVE_AMPLITUDE) || 0;
  const variance = Math.max(0, Number(state?.corridorCurveVariance ?? WEAPON_GATE_CURVE_VARIANCE) || 0);
  const wavelength = Math.max(120, Number(state?.corridorCurveWavelength ?? WEAPON_GATE_CURVE_WAVELENGTH) || 120);
  const angleScale = Math.max(0, Number(state?.corridorCurveAngleScale ?? WEAPON_GATE_CURVE_ANGLE_SCALE) || 0);
  const phaseA = ((seed % 997) / 997) * Math.PI * 2;
  const phaseB = ((seed % 619) / 619) * Math.PI * 2;
  const phaseC = ((seed % 431) / 431) * Math.PI * 2;
  const base = Math.sin((x / wavelength) * Math.PI * 2 * angleScale + phaseA);
  const mid = Math.sin((x / (wavelength * 0.61)) * Math.PI * 2 * (0.72 + variance) + phaseB) * variance;
  const slow = Math.sin((x / (wavelength * 1.74)) * Math.PI * 2 + phaseC) * variance * 0.58;
  const shaped = Math.tanh((base + mid + slow) * 0.9);
  return shaped * amp;
}

export function getWeaponGateCorridorWorldBounds(state, worldX = 0) {
  const base = getWeaponGateLogicalBounds();
  const center = ((base.top + base.bottom) * 0.5) + getWeaponGateCurveOffsetAtWorldX(state, worldX);
  const halfHeight = Math.max(1, (base.bottom - base.top) * 0.5);
  return {
    top: center - halfHeight,
    bottom: center + halfHeight,
    center,
    halfHeight,
  };
}

export function getWeaponGateShipWorldX(state) {
  return (Number(state?.progress) || 0) + WEAPON_GATE_LOGICAL_CENTER.x;
}

export function getWeaponGateCameraYOffset(state) {
  return WEAPON_GATE_LOGICAL_CENTER.y - (Number(state?.y) || WEAPON_GATE_LOGICAL_CENTER.y);
}

export function getWeaponGateCorridorBounds(state) {
  const worldX = getWeaponGateShipWorldX(state);
  const bounds = getWeaponGateCorridorWorldBounds(state, worldX);
  const offset = getWeaponGateCameraYOffset(state);
  return {
    top: bounds.top + offset,
    bottom: bounds.bottom + offset,
    center: bounds.center + offset,
    halfHeight: bounds.halfHeight,
  };
}

export function getWeaponGateCorridorLogicalBoundsAtX(state, logicalX = 0) {
  const worldX = (Number(state?.progress) || 0) + (Number(logicalX) || 0);
  const bounds = getWeaponGateCorridorWorldBounds(state, worldX);
  const offset = getWeaponGateCameraYOffset(state);
  return {
    top: bounds.top + offset,
    bottom: bounds.bottom + offset,
    center: bounds.center + offset,
    halfHeight: bounds.halfHeight,
  };
}

export function getWeaponGateNoteStarPosition({
  slotIndex = 0,
  note = '',
  notePool = [],
  totalSlots = 1,
} = {}) {
  const safeTotalSlots = Math.max(1, Math.trunc(Number(totalSlots) || 1));
  const safeNotePool = Array.isArray(notePool) && notePool.length ? notePool : ['C4'];
  const slot = Math.max(0, Math.min(safeTotalSlots - 1, Math.trunc(Number(slotIndex) || 0)));
  const noteIndex = Math.max(0, safeNotePool.indexOf(note || safeNotePool[0]));
  return {
    x: WEAPON_GATE_LOGICAL_WIDTH * (0.14 + (slot / Math.max(1, safeTotalSlots - 1)) * 0.72),
    y: WEAPON_GATE_LOGICAL_HEIGHT * (0.075 + ((safeNotePool.length - 1 - noteIndex) / Math.max(1, safeNotePool.length - 1)) * 0.14),
    slot,
  };
}

export function getWeaponGateEndProgress(totalSlots = 1) {
  const safeTotalSlots = Math.max(1, Math.trunc(Number(totalSlots) || 1));
  return WEAPON_GATE_START_X + ((safeTotalSlots - 1) * WEAPON_GATE_SPACING) - WEAPON_GATE_LOGICAL_CENTER.x;
}
