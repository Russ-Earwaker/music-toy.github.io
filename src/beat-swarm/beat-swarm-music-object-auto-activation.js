export const MUSIC_OBJECT_DRAWGRID_STEPS = 8;
export const MUSIC_OBJECT_WARNING_PHASE_STEPS = MUSIC_OBJECT_DRAWGRID_STEPS * 2;
export const MUSIC_OBJECT_AUTO_ACTIVATION_STEPS = MUSIC_OBJECT_WARNING_PHASE_STEPS * 4;

function getClockTick(clock = null) {
  const raw = Number.isFinite(Number(clock?.tickIndex))
    ? Number(clock.tickIndex)
    : (Number.isFinite(Number(clock?.absoluteStepIndex)) ? Number(clock.absoluteStepIndex) : Number(clock?.stepIndex));
  return Math.max(0, Math.trunc(Number(raw) || 0));
}

export function updateMusicObjectAutoActivation(entry = null, clock = null) {
  if (!entry) return { phase: 0, pulse: false, activate: false };
  const tick = getClockTick(clock);
  if (!Number.isFinite(Number(entry.autoActivationStartTick))) {
    entry.autoActivationStartTick = tick;
  }
  const ageSteps = Math.max(0, tick - Math.trunc(Number(entry.autoActivationStartTick) || 0));
  const phase = Math.max(0, Math.min(4, Math.floor(ageSteps / MUSIC_OBJECT_WARNING_PHASE_STEPS)));
  const activate = ageSteps >= MUSIC_OBJECT_AUTO_ACTIVATION_STEPS;
  let cadence = 0;
  if (phase === 1) cadence = 4;
  else if (phase === 2) cadence = 2;
  else if (phase >= 3) cadence = 1;
  const pulse = !activate
    && cadence > 0
    && ageSteps % cadence === 0
    && entry.autoActivationLastPulseTick !== tick;
  if (pulse) entry.autoActivationLastPulseTick = tick;
  return { ageSteps, phase, pulse, activate };
}
