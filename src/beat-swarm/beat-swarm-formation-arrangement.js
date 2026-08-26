function normalizeLaneId(value = '') {
  return String(value || '').trim().toLowerCase();
}

function normalizeSteps(stepsLike = null) {
  return Array.isArray(stepsLike) ? stepsLike.map(Boolean) : [];
}

export function projectRhythmSubdivisionsToBeats(stepsLike = null, subdivisionsPerBeatLike = 2) {
  const steps = normalizeSteps(stepsLike);
  const subdivisionsPerBeat = Math.max(1, Math.trunc(Number(subdivisionsPerBeatLike) || 2));
  const beatCount = Math.ceil(steps.length / subdivisionsPerBeat);
  return Array.from({ length: beatCount }, (_, beatIndex) => {
    const start = beatIndex * subdivisionsPerBeat;
    return steps.slice(start, start + subdivisionsPerBeat).some(Boolean);
  });
}

export function deriveRhythmicFormationMotifs(options = null) {
  const opts = options && typeof options === 'object' ? options : {};
  const sourceLaneIds = Array.isArray(opts.sourceLaneIds)
    ? opts.sourceLaneIds.map(normalizeLaneId).filter(Boolean)
    : [];
  const laneStepsById = opts.laneStepsById && typeof opts.laneStepsById === 'object'
    ? opts.laneStepsById
    : {};
  const motifLength = Math.max(1, Math.trunc(Number(opts.motifLength) || 16));
  const memberCount = Math.max(1, Math.trunc(Number(opts.memberCount) || 1));
  const startBeat = Math.max(0, Math.trunc(Number(opts.startBeat) || 0));
  const subdivisionsPerBeat = Math.max(1, Math.trunc(Number(opts.subdivisionsPerBeat) || 2));

  let sourceLaneId = '';
  let sourceSubdivisionSteps = [];
  let sourceBeatSteps = [];
  for (const laneId of sourceLaneIds) {
    const laneSteps = normalizeSteps(laneStepsById[laneId]);
    const beatSteps = projectRhythmSubdivisionsToBeats(laneSteps, subdivisionsPerBeat);
    if (!beatSteps.some(Boolean)) continue;
    sourceLaneId = laneId;
    sourceSubdivisionSteps = laneSteps;
    sourceBeatSteps = beatSteps;
    break;
  }

  if (!sourceLaneId) {
    return {
      derived: false,
      derivationMode: 'legacy_independent_fallback',
      sourceLaneId: '',
      sourceSubdivisionCount: 0,
      sourceBeatLength: 0,
      sourceHitCount: 0,
      motifHitCount: 0,
      memberSteps: [],
    };
  }

  const sourceBeatLength = Math.max(1, sourceBeatSteps.length);
  const motifSteps = Array.from({ length: motifLength }, (_, relativeBeat) => relativeBeat)
    .filter((relativeBeat) => sourceBeatSteps[(startBeat + relativeBeat) % sourceBeatLength]);
  const memberSteps = Array.from({ length: memberCount }, () => []);
  motifSteps.forEach((step, hitIndex) => {
    memberSteps[hitIndex % memberCount].push(step);
  });

  return {
    derived: true,
    derivationMode: 'player_rhythm_beat_projection',
    sourceLaneId,
    sourceSubdivisionCount: sourceSubdivisionSteps.length,
    sourceBeatLength,
    sourceHitCount: sourceBeatSteps.reduce((sum, active) => sum + (active ? 1 : 0), 0),
    motifHitCount: motifSteps.length,
    memberSteps,
  };
}
