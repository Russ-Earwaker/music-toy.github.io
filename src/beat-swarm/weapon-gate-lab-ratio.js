const DEFAULT_TOTAL_SLOTS = 16;

export function createSeededRng(seed = 1) {
  let s = Math.trunc(Number(seed) || 1) >>> 0;
  return function rng() {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function clampInt(v, min, max, fallback) {
  const n = Math.trunc(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

export function createWeaponGateRatioState(options = {}) {
  const totalSlots = clampInt(options.totalSlots, 1, 64, DEFAULT_TOTAL_SLOTS);
  const targetSilences = clampInt(options.targetSilences, 0, totalSlots, 6);
  const maxSilenceStreak = clampInt(options.maxSilenceStreak, 1, totalSlots, 2);
  const maxNoteStreak = clampInt(options.maxNoteStreak, 1, totalSlots, 5);
  return {
    totalSlots,
    targetSilences,
    targetNotes: totalSlots - targetSilences,
    maxSilenceStreak,
    maxNoteStreak,
    selectedNotes: 0,
    selectedSilences: 0,
    currentNoteStreak: 0,
    currentSilenceStreak: 0,
    decisions: [],
  };
}

function canFinishFrom(state, next) {
  const memo = new Map();
  const targetNotes = Math.max(0, Math.trunc(Number(state.targetNotes) || 0));
  const targetSilences = Math.max(0, Math.trunc(Number(state.targetSilences) || 0));
  const maxNotes = Math.max(1, Math.trunc(Number(state.maxNoteStreak) || 1));
  const maxSilences = Math.max(1, Math.trunc(Number(state.maxSilenceStreak) || 1));

  function walk(slot, notes, silences, noteStreak, silenceStreak) {
    if (notes > targetNotes || silences > targetSilences) return false;
    if (noteStreak > maxNotes || silenceStreak > maxSilences) return false;
    const remaining = Math.max(0, state.totalSlots - slot);
    if (notes + remaining < targetNotes) return false;
    if (silences + remaining < targetSilences) return false;
    if (slot >= state.totalSlots) return notes === targetNotes && silences === targetSilences;
    const key = `${slot}|${notes}|${silences}|${noteStreak}|${silenceStreak}`;
    if (memo.has(key)) return memo.get(key);
    const noteOk = walk(slot + 1, notes + 1, silences, noteStreak + 1, 0);
    const silenceOk = walk(slot + 1, notes, silences + 1, 0, silenceStreak + 1);
    const ok = noteOk || silenceOk;
    memo.set(key, ok);
    return ok;
  }

  return walk(
    Math.max(0, Math.trunc(Number(next.slotIndex) || 0)),
    Math.max(0, Math.trunc(Number(next.selectedNotes) || 0)),
    Math.max(0, Math.trunc(Number(next.selectedSilences) || 0)),
    Math.max(0, Math.trunc(Number(next.currentNoteStreak) || 0)),
    Math.max(0, Math.trunc(Number(next.currentSilenceStreak) || 0))
  );
}

export function decideGateType(state, slotIndex, rng = Math.random) {
  const remainingSlots = Math.max(0, state.totalSlots - slotIndex);
  const silencesNeeded = Math.max(0, state.targetSilences - state.selectedSilences);
  const notesNeeded = Math.max(0, state.targetNotes - state.selectedNotes);
  const noteValid = canFinishFrom(state, {
    slotIndex: slotIndex + 1,
    selectedNotes: state.selectedNotes + 1,
    selectedSilences: state.selectedSilences,
    currentNoteStreak: state.currentNoteStreak + 1,
    currentSilenceStreak: 0,
  });
  const silenceValid = canFinishFrom(state, {
    slotIndex: slotIndex + 1,
    selectedNotes: state.selectedNotes,
    selectedSilences: state.selectedSilences + 1,
    currentNoteStreak: 0,
    currentSilenceStreak: state.currentSilenceStreak + 1,
  });
  let type = 'mixed';
  let reason = 'balanced: mixed gate';
  let damageSectionCount = type === 'mixed' ? 1 : 0;

  if (state.currentSilenceStreak >= state.maxSilenceStreak) {
    type = 'note';
    reason = 'silence streak maxed: force note';
    damageSectionCount = 0;
  } else if (state.selectedSilences >= state.targetSilences) {
    type = 'note';
    reason = 'target silences reached: force note';
    damageSectionCount = 0;
  } else if (!noteValid && silenceValid) {
    type = 'damage';
    reason = 'remaining slots require silence';
    damageSectionCount = 5;
  } else if (noteValid && !silenceValid) {
    type = 'note';
    reason = notesNeeded >= remainingSlots ? 'remaining slots require note' : 'silence outcome would break target/streak';
    damageSectionCount = 0;
  } else if (!noteValid && !silenceValid) {
    type = state.currentSilenceStreak >= state.maxSilenceStreak ? 'note' : 'damage';
    reason = 'ratio recovery fallback';
    damageSectionCount = type === 'damage' ? 5 : 0;
  } else {
    const idealSilencesSoFar = (slotIndex / Math.max(1, state.totalSlots)) * state.targetSilences;
    const behindSilences = state.selectedSilences < Math.floor(idealSilencesSoFar);
    const urgent = silencesNeeded >= Math.ceil(remainingSlots * 0.5);
    type = 'mixed';
    if (urgent) {
      damageSectionCount = 1;
      reason = 'too few silences: urgent mixed gate';
    } else if (behindSilences || state.currentNoteStreak >= Math.max(1, state.maxNoteStreak - 1)) {
      damageSectionCount = 1;
      reason = 'too few silences: silence pressure';
    } else {
      damageSectionCount = 1;
      reason = 'balanced: mixed gate';
    }
  }

  return {
    type,
    reason,
    damageSectionCount,
    noteValid,
    silenceValid,
    slotIndex,
    remainingSlots,
    silencesNeeded,
    notesNeeded,
    currentNoteStreak: state.currentNoteStreak,
    currentSilenceStreak: state.currentSilenceStreak,
  };
}

export function applyWeaponGateSelection(state, selection) {
  const kind = selection?.kind === 'damage' ? 'damage' : 'note';
  if (kind === 'damage') {
    state.selectedSilences += 1;
    state.currentSilenceStreak += 1;
    state.currentNoteStreak = 0;
  } else {
    state.selectedNotes += 1;
    state.currentNoteStreak += 1;
    state.currentSilenceStreak = 0;
  }
  state.decisions.push({
    slotIndex: Math.max(0, Math.trunc(Number(selection?.slotIndex) || 0)),
    kind,
    note: String(selection?.note || ''),
    gateType: String(selection?.gateType || ''),
    availableSections: Array.isArray(selection?.availableSections) ? selection.availableSections.map((s) => s?.kind === 'damage' ? 'DMG' : String(s?.note || '?')) : [],
    selectedSection: selection?.selectedSection?.kind === 'damage' ? 'DMG' : String(selection?.selectedSection?.note || ''),
    reason: String(selection?.reason || ''),
    selectedNotes: state.selectedNotes,
    selectedSilences: state.selectedSilences,
    currentNoteStreak: state.currentNoteStreak,
    currentSilenceStreak: state.currentSilenceStreak,
  });
  return state;
}
