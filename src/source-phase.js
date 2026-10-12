// Every transport has its own tick clock, with the same stable origin policy.
// Activation gates playback; only authored offsets move its musical phase.
export const HEARTBEAT_PHASE_ORIGIN_TICK = 0;
export function applySourcePhase(instance) {
  if (!instance) return instance;
  instance.sourcePhaseOriginTick = HEARTBEAT_PHASE_ORIGIN_TICK + (Number(instance.explicitPhaseOffsetTicks) || 0);
  return instance;
}
export const patternOriginTick = instance => instance.sourcePhaseOriginTick ?? instance.startTick;
