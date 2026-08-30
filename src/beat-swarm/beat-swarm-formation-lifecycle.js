export function createFormationHoldingSchedule({
  startBeat = 0,
  motifLength = 16,
  subdivisionsPerBeat = 1,
  overloadLoops = 2,
} = {}) {
  const safeStartBeat = Math.max(0, Math.trunc(Number(startBeat) || 0));
  const safeMotifLength = Math.max(1, Math.trunc(Number(motifLength) || 1));
  const safeSubdivisions = Math.max(1, Math.trunc(Number(subdivisionsPerBeat) || 1));
  const loopBeats = Math.max(1, Math.ceil(safeMotifLength / safeSubdivisions));
  const durationBeats = loopBeats * Math.max(1, Math.trunc(Number(overloadLoops) || 1));
  return {
    startBeat: safeStartBeat,
    loopBeats,
    durationBeats,
    triggerBeat: safeStartBeat + durationBeats,
  };
}

export function getFormationHoldingBeatState(schedule, beatIndex = 0) {
  const startBeat = Math.max(0, Math.trunc(Number(schedule?.startBeat) || 0));
  const durationBeats = Math.max(1, Math.trunc(Number(schedule?.durationBeats) || 1));
  const triggerBeat = Math.max(startBeat + 1, Math.trunc(Number(schedule?.triggerBeat) || (startBeat + durationBeats)));
  const beat = Math.max(0, Math.trunc(Number(beatIndex) || 0));
  const elapsedBeats = Math.max(0, beat - startBeat);
  const progress = Math.max(0, Math.min(1, elapsedBeats / durationBeats));
  const pulseEveryBeats = progress >= 0.75 ? 1 : (progress >= 0.5 ? 2 : 4);
  return {
    active: beat >= startBeat,
    trigger: beat >= triggerBeat,
    progress,
    pulseEveryBeats,
    pulse: beat >= startBeat && beat < triggerBeat && (elapsedBeats % pulseEveryBeats) === 0,
  };
}
