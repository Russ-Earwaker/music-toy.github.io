import { createSeededRng, createWeaponGateRatioState, decideGateType } from './beat-swarm-weapon-gate-ratio.js';
import { createWeaponGate } from './beat-swarm-weapon-gate-core.js';
import { getWeaponGateCorridorWorldBounds, getWeaponGateShipWorldX } from './beat-swarm-weapon-gate-geometry.js?v=2026-07-26-weapon-gate-ghosts-v1';
import {
  hashWeaponGateSeed,
  WEAPON_GATE_CURVE_AMPLITUDE,
  WEAPON_GATE_CURVE_ANGLE_SCALE,
  WEAPON_GATE_CURVE_VARIANCE,
  WEAPON_GATE_CURVE_WAVELENGTH,
  WEAPON_GATE_MAX_SILENCE_STREAK,
  WEAPON_GATE_NOTE_POOL,
  WEAPON_GATE_FIRST_ARRIVAL_STEPS,
  WEAPON_GATE_SPACING,
  WEAPON_GATE_START_X,
  WEAPON_GATE_TARGET_SILENCES,
  WEAPON_GATE_TOTAL_SLOTS,
  getWeaponGateAuthoredSchedule,
  getWeaponGateTravelDistance,
} from './beat-swarm-weapon-gate-config.js?v=2026-07-23-weapon-gate-cadence-v6';

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
    gateSchedule: getWeaponGateAuthoredSchedule(),
    gateScheduleReady: false,
    gateStepSeconds: 0.22,
    gateArrivalOffsetSeconds: 0,
    gateLaunchStepIndex: 0,
    gateNextBoundaryOffset: 0,
    gatePlaybackAnchorStep: -1,
    launchProgress: -1120,
    launchElapsed: 0,
    launchClockTime: Number.NaN,
    progress: -1120,
    speed: 0,
    y: window.innerHeight * 0.5,
    vy: 0,
    shots: [],
    targets: [],
    dashPickup: null,
    dashPickupCooldown: 0.9,
    noteStars: [],
    noteTransfers: [],
    ghostGatePulses: [],
    noteStarPulseT: 0,
    noteStarPulseSlot: -1,
    motifStep: 0,
    motifTimer: 0.35,
    feedbackText: 'Pull back to launch',
    feedbackKind: '',
    feedbackTtl: 1.2,
    flowTime: 0,
    phase: 'prelaunch',
    completeDelay: 0,
    outroDuration: 2.35,
  };
  state.y = getWeaponGateCorridorWorldBounds(state, getWeaponGateShipWorldX(state)).center;
  return state;
}

export function appendNextWeaponGate(state) {
  if (!state) return null;
  const ordinal = state.gates.length;
  const scheduleEntry = state.gateSchedule?.[ordinal] || null;
  if (!scheduleEntry || ordinal >= WEAPON_GATE_TOTAL_SLOTS) return null;
  const slotIndex = Math.max(0, Math.trunc(Number(scheduleEntry.slotIndex) || 0));
  const ratioDecision = decideGateType(state.ratioState, ordinal, state.rng);
  const decision = scheduleEntry.forceNote === true
    ? {
      ...ratioDecision,
      type: 'note',
      reason: 'opening pulse pass: note only',
      damageSectionCount: 0,
    }
    : ratioDecision;
  const gate = createWeaponGate(slotIndex, decision, {
    rng: state.rng,
    notePool: WEAPON_GATE_NOTE_POOL,
    gateSpacing: WEAPON_GATE_SPACING,
    startX: WEAPON_GATE_START_X,
  });
  const stepSeconds = Math.max(0.05, Number(state.gateStepSeconds) || 0.22);
  const targetStep = WEAPON_GATE_FIRST_ARRIVAL_STEPS + Math.max(0, Number(scheduleEntry.absoluteStep) || 0);
  const targetSeconds = (targetStep * stepSeconds) + Math.max(0, Number(state.gateArrivalOffsetSeconds) || 0);
  gate.passIndex = Math.max(0, Math.trunc(Number(scheduleEntry.passIndex) || 0));
  gate.motifStep = Math.max(0, Math.trunc(Number(scheduleEntry.motifStep) || 0));
  gate.targetStep = targetStep;
  gate.playbackStepIndex = Math.max(
    0,
    Math.trunc(Number(state.gatePlaybackAnchorStep) || 0)
      + Math.max(0, Math.trunc(Number(scheduleEntry.absoluteStep) || 0))
  );
  gate.x = (Number(state.launchProgress) || 0)
    + getWeaponGateTravelDistance(targetSeconds)
    + (window.innerWidth * 0.5);
  state.gates.push(gate);
  return gate;
}

export function initializeWeaponGateSchedule(
  state,
  stepSeconds = 0.22,
  alignmentDelaySeconds = 0,
  launchStepIndex = 0,
  launchClockTime = Number.NaN
) {
  if (!state) return false;
  state.gateStepSeconds = Math.max(0.05, Number(stepSeconds) || 0.22);
  state.gateArrivalOffsetSeconds = Math.max(0, Number(alignmentDelaySeconds) || 0);
  const nextBoundaryOffset = state.gateArrivalOffsetSeconds > 0.008 ? 1 : 0;
  state.gateLaunchStepIndex = Math.max(0, Math.trunc(Number(launchStepIndex) || 0));
  state.gateNextBoundaryOffset = nextBoundaryOffset;
  state.gatePlaybackAnchorStep = Math.max(
    0,
    state.gateLaunchStepIndex + nextBoundaryOffset + WEAPON_GATE_FIRST_ARRIVAL_STEPS
  );
  state.launchProgress = Number(state.progress) || 0;
  state.launchElapsed = 0;
  state.launchClockTime = Number.isFinite(Number(launchClockTime))
    ? Number(launchClockTime)
    : Number.NaN;
  state.gates = [];
  state.nextGateIndex = 0;
  state.gateScheduleReady = true;
  appendNextWeaponGate(state);
  return true;
}
