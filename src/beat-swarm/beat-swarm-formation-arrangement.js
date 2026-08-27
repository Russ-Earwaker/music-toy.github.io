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

export function projectMelodySubdivisionsToBeats(noteStepsLike = null, subdivisionsPerBeatLike = 2) {
  const noteSteps = Array.isArray(noteStepsLike)
    ? noteStepsLike.map((note) => String(note || '').trim())
    : [];
  const subdivisionsPerBeat = Math.max(1, Math.trunc(Number(subdivisionsPerBeatLike) || 2));
  const beatCount = Math.ceil(noteSteps.length / subdivisionsPerBeat);
  return Array.from({ length: beatCount }, (_, beatIndex) => {
    const start = beatIndex * subdivisionsPerBeat;
    return noteSteps.slice(start, start + subdivisionsPerBeat).find(Boolean) || '';
  });
}

function shiftNoteInPalette(noteLike, paletteLike, offsetLike = 0) {
  const note = String(noteLike || '').trim();
  const palette = Array.isArray(paletteLike) ? paletteLike.map((entry) => String(entry || '').trim()) : [];
  const index = palette.indexOf(note);
  if (index < 0 || !palette.length) return note;
  const offset = Math.trunc(Number(offsetLike) || 0);
  return palette[Math.max(0, Math.min(palette.length - 1, index + offset))] || note;
}

export function deriveMelodicFormationMotifs(options = null) {
  const opts = options && typeof options === 'object' ? options : {};
  const sourceLaneId = normalizeLaneId(opts.sourceLaneId || 'primary_loop_lane');
  const sourceNoteSteps = Array.isArray(opts.sourceNoteSteps) ? opts.sourceNoteSteps : [];
  const motifLength = Math.max(1, Math.trunc(Number(opts.motifLength) || 32));
  const memberCount = Math.max(1, Math.trunc(Number(opts.memberCount) || 1));
  const startBeat = Math.max(0, Math.trunc(Number(opts.startBeat) || 0));
  const subdivisionsPerBeat = Math.max(1, Math.trunc(Number(opts.subdivisionsPerBeat) || 2));
  const responseDelayBeats = Math.max(1, Math.trunc(Number(opts.responseDelayBeats) || 1));
  const sourceEventStride = Math.max(1, Math.trunc(Number(opts.sourceEventStride) || 1));
  const sourceBeatNotes = projectMelodySubdivisionsToBeats(sourceNoteSteps, subdivisionsPerBeat);
  const pitchPalette = Array.isArray(opts.pitchPalette)
    ? opts.pitchPalette.map((note) => String(note || '').trim()).filter(Boolean)
    : [];
  const explicitPitchOffset = opts.pitchOffset !== null
    && opts.pitchOffset !== undefined
    && String(opts.pitchOffset).trim() !== ''
    && Number.isFinite(Number(opts.pitchOffset));
  const sourcePitchIndices = sourceBeatNotes
    .map((note) => pitchPalette.indexOf(note))
    .filter((index) => index >= 0);
  const averagePitchIndex = sourcePitchIndices.length
    ? sourcePitchIndices.reduce((sum, index) => sum + index, 0) / sourcePitchIndices.length
    : 0;
  const pitchOffset = explicitPitchOffset
    ? Math.trunc(Number(opts.pitchOffset) || 0)
    : (averagePitchIndex >= ((pitchPalette.length - 1) * 0.5) ? -1 : 1);
  if (!sourceBeatNotes.some(Boolean)) {
    return {
      derived: false,
      derivationMode: 'legacy_independent_fallback',
      sourceLaneId: '',
      sourceSubdivisionCount: 0,
      sourceBeatLength: 0,
      sourceHitCount: 0,
      motifHitCount: 0,
      responseDelayBeats,
      pitchOffset,
      sourceEventStride,
      members: [],
    };
  }

  const sourceBeatLength = sourceBeatNotes.length;
  const events = [];
  const sourceEventOrdinalByBeat = new Map();
  let sourceEventOrdinal = 0;
  sourceBeatNotes.forEach((note, beat) => {
    if (!note) return;
    sourceEventOrdinalByBeat.set(beat, sourceEventOrdinal);
    sourceEventOrdinal += 1;
  });
  for (let relativeBeat = 0; relativeBeat < motifLength; relativeBeat += 1) {
    const sourceBeat = (
      startBeat + relativeBeat - responseDelayBeats + sourceBeatLength
    ) % sourceBeatLength;
    const sourceNote = sourceBeatNotes[sourceBeat];
    if (!sourceNote) continue;
    if ((sourceEventOrdinalByBeat.get(sourceBeat) % sourceEventStride) !== 0) continue;
    events.push({
      step: relativeBeat,
      note: shiftNoteInPalette(sourceNote, pitchPalette, pitchOffset),
      sourceNote,
    });
  }
  const members = Array.from({ length: memberCount }, () => ({ steps: [], noteByStep: {} }));
  events.forEach((event, eventIndex) => {
    const member = members[eventIndex % memberCount];
    member.steps.push(event.step);
    member.noteByStep[event.step] = event.note;
  });

  return {
    derived: true,
    derivationMode: 'player_lead_delayed_pentatonic_response',
    sourceLaneId,
    sourceSubdivisionCount: sourceNoteSteps.length,
    sourceBeatLength,
    sourceHitCount: sourceBeatNotes.reduce((sum, note) => sum + (note ? 1 : 0), 0),
    motifHitCount: events.length,
    responseDelayBeats,
    pitchOffset,
    sourceEventStride,
    members,
  };
}
