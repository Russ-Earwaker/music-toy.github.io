import {
  WEAPON_GATE_CURVE_AMPLITUDE,
  WEAPON_GATE_CURVE_ANGLE_SCALE,
  WEAPON_GATE_CURVE_VARIANCE,
  WEAPON_GATE_CURVE_WAVELENGTH,
  WEAPON_GATE_SPACING,
  WEAPON_GATE_START_X,
} from './beat-swarm-weapon-gate-config.js?v=2026-06-18-corridor-curve-v1';

export function clampWeaponGateValue(v, min, max) {
  return Math.max(min, Math.min(max, Number(v) || 0));
}

export function getWeaponGateShipScreenPoint(viewportWidth = window.innerWidth, viewportHeight = window.innerHeight) {
  return {
    x: Number(viewportWidth) * 0.5,
    y: Number(viewportHeight) * 0.5,
  };
}

export function getWeaponGateLogicalBounds(viewportHeight = window.innerHeight) {
  const h = Math.max(1, Number(viewportHeight) || 1);
  const center = h * 0.5;
  const halfHeight = h / 6;
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

export function getWeaponGateCorridorWorldBounds(state, worldX = 0, viewportHeight = window.innerHeight) {
  const base = getWeaponGateLogicalBounds(viewportHeight);
  const center = ((base.top + base.bottom) * 0.5) + getWeaponGateCurveOffsetAtWorldX(state, worldX);
  const halfHeight = Math.max(1, (base.bottom - base.top) * 0.5);
  return {
    top: center - halfHeight,
    bottom: center + halfHeight,
    center,
    halfHeight,
  };
}

export function getWeaponGateShipWorldX(state, viewportWidth = window.innerWidth) {
  const ship = getWeaponGateShipScreenPoint(viewportWidth, window.innerHeight);
  return (Number(state?.progress) || 0) + ship.x;
}

export function getWeaponGateCameraYOffset(state, viewportHeight = window.innerHeight) {
  const ship = getWeaponGateShipScreenPoint(window.innerWidth, viewportHeight);
  return ship.y - (Number(state?.y) || ship.y);
}

export function getWeaponGateCorridorBounds(state, viewportHeight = window.innerHeight) {
  const worldX = getWeaponGateShipWorldX(state, window.innerWidth);
  const bounds = getWeaponGateCorridorWorldBounds(state, worldX, viewportHeight);
  const offset = getWeaponGateCameraYOffset(state, viewportHeight);
  return {
    top: bounds.top + offset,
    bottom: bounds.bottom + offset,
    center: bounds.center + offset,
    halfHeight: bounds.halfHeight,
  };
}

export function getWeaponGateCorridorScreenBoundsAtX(state, screenX = 0, viewportHeight = window.innerHeight) {
  const worldX = (Number(state?.progress) || 0) + (Number(screenX) || 0);
  const bounds = getWeaponGateCorridorWorldBounds(state, worldX, viewportHeight);
  const offset = getWeaponGateCameraYOffset(state, viewportHeight);
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
  viewportWidth = window.innerWidth,
  viewportHeight = window.innerHeight,
} = {}) {
  const safeTotalSlots = Math.max(1, Math.trunc(Number(totalSlots) || 1));
  const safeNotePool = Array.isArray(notePool) && notePool.length ? notePool : ['C4'];
  const slot = Math.max(0, Math.min(safeTotalSlots - 1, Math.trunc(Number(slotIndex) || 0)));
  const noteIndex = Math.max(0, safeNotePool.indexOf(note || safeNotePool[0]));
  return {
    x: Number(viewportWidth) * (0.14 + (slot / Math.max(1, safeTotalSlots - 1)) * 0.72),
    y: Number(viewportHeight) * (0.24 + ((safeNotePool.length - 1 - noteIndex) / Math.max(1, safeNotePool.length - 1)) * 0.52),
    slot,
  };
}

export function getWeaponGateEndProgress(totalSlots = 1, viewportWidth = window.innerWidth) {
  const safeTotalSlots = Math.max(1, Math.trunc(Number(totalSlots) || 1));
  return WEAPON_GATE_START_X + ((safeTotalSlots - 1) * WEAPON_GATE_SPACING) - (Number(viewportWidth) * 0.5);
}
