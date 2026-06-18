import { WEAPON_GATE_SPACING, WEAPON_GATE_START_X } from './beat-swarm-weapon-gate-config.js?v=2026-06-18-onboarding-selection-v1';

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
  return {
    top: h / 3,
    bottom: h * 2 / 3,
  };
}

export function getWeaponGateCorridorBounds(state, viewportHeight = window.innerHeight) {
  const bounds = getWeaponGateLogicalBounds(viewportHeight);
  const ship = getWeaponGateShipScreenPoint(window.innerWidth, viewportHeight);
  const offset = ship.y - (Number(state?.y) || ship.y);
  return {
    top: bounds.top + offset,
    bottom: bounds.bottom + offset,
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
