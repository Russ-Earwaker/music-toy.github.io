import { createSeededRng, createWeaponGateRatioState, decideGateType } from './beat-swarm-weapon-gate-ratio.js';
import { createWeaponGate } from './beat-swarm-weapon-gate-core.js';
import { getWeaponGateCorridorWorldBounds, getWeaponGateShipWorldX } from './beat-swarm-weapon-gate-geometry.js?v=2026-06-18-corridor-curve-v1';
import {
  hashWeaponGateSeed,
  WEAPON_GATE_CURVE_AMPLITUDE,
  WEAPON_GATE_CURVE_ANGLE_SCALE,
  WEAPON_GATE_CURVE_VARIANCE,
  WEAPON_GATE_CURVE_WAVELENGTH,
  WEAPON_GATE_MAX_SILENCE_STREAK,
  WEAPON_GATE_NOTE_POOL,
  WEAPON_GATE_SPACING,
  WEAPON_GATE_START_X,
  WEAPON_GATE_TARGET_SILENCES,
  WEAPON_GATE_TOTAL_SLOTS,
} from './beat-swarm-weapon-gate-config.js?v=2026-06-18-corridor-curve-v1';

export function createWeaponGateIntroState(layer, options = {}) {
  const seed = String(options.seed || `level-start-${Date.now()}`);
  const seedHash = hashWeaponGateSeed(seed);
  const state = {
    layer,
    rng: createSeededRng(seedHash),
    corridorCurveSeed: seedHash,
    corridorCurveAmplitude: Number.isFinite(Number(options.corridorCurveAmplitude))
      ? Number(options.corridorCurveAmplitude)
      : WEAPON_GATE_CURVE_AMPLITUDE,
    corridorCurveVariance: Number.isFinite(Number(options.corridorCurveVariance))
      ? Number(options.corridorCurveVariance)
      : WEAPON_GATE_CURVE_VARIANCE,
    corridorCurveWavelength: Number.isFinite(Number(options.corridorCurveWavelength))
      ? Number(options.corridorCurveWavelength)
      : WEAPON_GATE_CURVE_WAVELENGTH,
    corridorCurveAngleScale: Number.isFinite(Number(options.corridorCurveAngleScale))
      ? Number(options.corridorCurveAngleScale)
      : WEAPON_GATE_CURVE_ANGLE_SCALE,
    ratioState: createWeaponGateRatioState({
      totalSlots: WEAPON_GATE_TOTAL_SLOTS,
      targetSilences: WEAPON_GATE_TARGET_SILENCES,
      maxSilenceStreak: WEAPON_GATE_MAX_SILENCE_STREAK,
    }),
    gates: [],
    selections: Array.from({ length: WEAPON_GATE_TOTAL_SLOTS }, () => null),
    summary: Array.from({ length: WEAPON_GATE_TOTAL_SLOTS }, () => '-'),
    nextGateIndex: 0,
    progress: -1120,
    speed: 0,
    y: window.innerHeight * 0.5,
    vy: 0,
    shots: [],
    targets: [],
    dashPickup: null,
    dashPickupCooldown: 0.9,
    noteStars: [],
    noteStarPulseT: 0,
    noteStarPulseSlot: -1,
    motifStep: 0,
    motifTimer: 0.35,
    feedbackText: 'Pull back to launch',
    feedbackKind: '',
    feedbackTtl: 1.2,
    wallPulseTtl: 0,
    wallPulseY: 0,
    phase: 'prelaunch',
    completeDelay: 0,
    outroDuration: 2.35,
  };
  state.y = getWeaponGateCorridorWorldBounds(state, getWeaponGateShipWorldX(state)).center;
  appendNextWeaponGate(state);
  return state;
}

export function appendNextWeaponGate(state) {
  if (!state) return null;
  const slotIndex = state.gates.length;
  if (slotIndex >= WEAPON_GATE_TOTAL_SLOTS) return null;
  const decision = decideGateType(state.ratioState, slotIndex, state.rng);
  const gate = createWeaponGate(slotIndex, decision, {
    rng: state.rng,
    notePool: WEAPON_GATE_NOTE_POOL,
    gateSpacing: WEAPON_GATE_SPACING,
    startX: WEAPON_GATE_START_X,
  });
  state.gates.push(gate);
  return gate;
}
