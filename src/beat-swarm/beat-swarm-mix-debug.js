export function createBeatSwarmMusicMixDebugRecord(input = null) {
  const value = input && typeof input === 'object' ? input : {};
  const beatsPerBar = Math.max(1, Math.trunc(Number(value.beatsPerBar) || 4));
  const beatIndex = Math.max(0, Math.trunc(Number(value.beatIndex) || 0));
  const stepIndex = Math.max(0, Math.trunc(Number(value.stepIndex) || 0));
  const numberOrNull = (candidate) => Number.isFinite(Number(candidate)) ? Number(candidate) : null;
  return {
    barIndex: Math.floor(beatIndex / beatsPerBar),
    beatIndex,
    beatInBar: beatIndex % beatsPerBar,
    stepIndex,
    lane: String(value.lane || '').trim().toLowerCase(),
    source: String(value.source || 'performed_event').trim().toLowerCase(),
    eventType: String(value.eventType || 'musical_event').trim().toLowerCase(),
    instrument: String(value.instrument || '').trim(),
    notes: (Array.isArray(value.notes) ? value.notes : [value.notes])
      .map((note) => String(note || '').trim())
      .filter(Boolean),
    role: String(value.role || 'unassigned').trim().toLowerCase(),
    authoredGain: numberOrNull(value.authoredGain),
    postHierarchyGain: numberOrNull(value.postHierarchyGain),
    postHeroGain: numberOrNull(value.postHeroGain),
    preRoleFinalGain: numberOrNull(value.preRoleFinalGain),
    roleMultiplier: numberOrNull(value.roleMultiplier),
    postRoleFinalGain: numberOrNull(value.postRoleFinalGain),
    finalExecutionGain: numberOrNull(value.finalExecutionGain),
    prominence: String(value.prominence || '').trim().toLowerCase(),
  };
}
