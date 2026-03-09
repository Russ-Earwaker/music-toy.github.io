const DEFAULT_BEATS_PER_BAR = 4;
const DEFAULT_STEPS_PER_BAR = 8;
const DEFAULT_ENERGY_STATE = 'intro';

const ENERGY_STATES = Object.freeze(['intro', 'build', 'clash', 'break', 'peak']);

const NOTE_RE = /^([A-G])([#b]?)(-?\d+)$/;
const NOTE_BASE_SEMI = Object.freeze({
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
});

function clampInt(v, min, max, fallback) {
  const n = Math.trunc(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function normalizeEnergyState(next) {
  const s = String(next || '').trim().toLowerCase();
  return ENERGY_STATES.includes(s) ? s : DEFAULT_ENERGY_STATE;
}

function normalizeNotePool(next, fallbackPool) {
  const src = Array.isArray(next) ? next : [];
  const out = [];
  for (const note of src) {
    const n = String(note || '').trim();
    if (!n) continue;
    if (out.includes(n)) continue;
    out.push(n);
  }
  if (out.length) return out;
  return Array.isArray(fallbackPool) ? fallbackPool.slice() : ['C4', 'D#4', 'F4', 'G4', 'A#4'];
}

function noteNameToMidi(note) {
  const s = String(note || '').trim();
  const m = NOTE_RE.exec(s);
  if (!m) return null;
  const letter = String(m[1] || '').toUpperCase();
  const accidental = String(m[2] || '');
  const octave = Math.trunc(Number(m[3]));
  const base = NOTE_BASE_SEMI[letter];
  if (!Number.isFinite(base) || !Number.isFinite(octave)) return null;
  let semi = base;
  if (accidental === '#') semi += 1;
  else if (accidental === 'b') semi -= 1;
  return ((octave + 1) * 12) + semi;
}

function createThreatBudgets(base = null) {
  const raw = base && typeof base === 'object' ? base : {};
  return {
    maxFullThreatsPerBeat: clampInt(raw.maxFullThreatsPerBeat, 0, 128, 3),
    maxLightThreatsPerBeat: clampInt(raw.maxLightThreatsPerBeat, 0, 128, 6),
    maxAudibleAccentsPerBeat: clampInt(raw.maxAudibleAccentsPerBeat, 0, 128, 8),
  };
}

export function createSwarmDirector(options = null) {
  const opts = options && typeof options === 'object' ? options : {};
  const beatsPerBar = Math.max(1, clampInt(opts.beatsPerBar, 1, 128, DEFAULT_BEATS_PER_BAR));
  const stepsPerBar = Math.max(1, clampInt(opts.stepsPerBar, 1, 256, DEFAULT_STEPS_PER_BAR));
  const fallbackPool = normalizeNotePool(opts.notePool, ['C4', 'D#4', 'F4', 'G4', 'A#4']);

  const state = {
    barIndex: 0,
    beatIndex: 0,
    stepIndex: 0,
    lastBarIndex: null,
    lastBeatIndex: null,
    lastStepIndex: null,
    phase01: 0,
    energyState: normalizeEnergyState(opts.energyState),
    notePool: fallbackPool.slice(),
    budgets: createThreatBudgets(opts.budgets),
    usage: {
      beatIndex: null,
      fullThreats: 0,
      lightThreats: 0,
      audibleAccents: 0,
    },
    eventQueue: [],
    eventSeq: 1,
  };

  function resetBeatUsage(beatIndex = null) {
    state.usage.beatIndex = Number.isFinite(beatIndex) ? Math.max(0, Math.trunc(beatIndex)) : null;
    state.usage.fullThreats = 0;
    state.usage.lightThreats = 0;
    state.usage.audibleAccents = 0;
  }

  function ensureUsageBeat(beatIndex = state.beatIndex) {
    const beat = Math.max(0, Math.trunc(Number(beatIndex) || 0));
    if (state.usage.beatIndex !== beat) resetBeatUsage(beat);
    return beat;
  }

  function getSnapshot() {
    const fullRemaining = Math.max(0, state.budgets.maxFullThreatsPerBeat - state.usage.fullThreats);
    const lightRemaining = Math.max(0, state.budgets.maxLightThreatsPerBeat - state.usage.lightThreats);
    const accentRemaining = Math.max(0, state.budgets.maxAudibleAccentsPerBeat - state.usage.audibleAccents);
    return {
      barIndex: state.barIndex,
      beatIndex: state.beatIndex,
      stepIndex: state.stepIndex,
      phase01: state.phase01,
      beatsPerBar,
      stepsPerBar,
      energyState: state.energyState,
      notePool: state.notePool.slice(),
      budgets: { ...state.budgets },
      usage: {
        beatIndex: state.usage.beatIndex,
        fullThreats: state.usage.fullThreats,
        lightThreats: state.usage.lightThreats,
        audibleAccents: state.usage.audibleAccents,
      },
      remaining: {
        fullThreats: fullRemaining,
        lightThreats: lightRemaining,
        audibleAccents: accentRemaining,
      },
      queuedEventCount: Math.max(0, Math.trunc(state.eventQueue.length || 0)),
    };
  }

  function syncToBeat(beatIndex = 0) {
    const beat = Math.max(0, Math.trunc(Number(beatIndex) || 0));
    const bar = Math.floor(beat / beatsPerBar);
    const step = Math.floor((beat * stepsPerBar) / beatsPerBar);
    state.beatIndex = beat;
    state.barIndex = Math.max(0, bar);
    state.stepIndex = Math.max(0, step);
    state.lastBeatIndex = beat;
    state.lastBarIndex = state.barIndex;
    state.lastStepIndex = state.stepIndex;
    resetBeatUsage(beat);
    return getSnapshot();
  }

  function updateFromLoopInfo(loopInfo) {
    const beatLen = Number(loopInfo?.beatLen) || 0;
    const loopStart = Number(loopInfo?.loopStartTime);
    const now = Number(loopInfo?.now);
    if (!(beatLen > 0) || !Number.isFinite(loopStart) || !Number.isFinite(now)) {
      return { valid: false, beatChanged: false, stepChanged: false, barChanged: false, state: getSnapshot() };
    }
    const barLen = beatLen * beatsPerBar;
    const stepLen = barLen / stepsPerBar;
    const elapsed = now - loopStart;
    const beatIndex = Math.max(0, Math.floor((elapsed / beatLen) + 1e-6));
    const stepIndex = Math.max(0, Math.floor((elapsed / stepLen) + 1e-6));
    const barIndex = Math.max(0, Math.floor(beatIndex / beatsPerBar));
    const phase01 = barLen > 0 ? ((((elapsed % barLen) + barLen) % barLen) / barLen) : 0;

    const beatChanged = state.lastBeatIndex === null || beatIndex !== state.lastBeatIndex;
    const stepChanged = state.lastStepIndex === null || stepIndex !== state.lastStepIndex;
    const barChanged = state.lastBarIndex === null || barIndex !== state.lastBarIndex;

    state.beatIndex = beatIndex;
    state.stepIndex = stepIndex;
    state.barIndex = barIndex;
    state.phase01 = Math.max(0, Math.min(1, phase01));
    if (beatChanged) resetBeatUsage(beatIndex);
    state.lastBeatIndex = beatIndex;
    state.lastStepIndex = stepIndex;
    state.lastBarIndex = barIndex;

    return { valid: true, beatChanged, stepChanged, barChanged, beatIndex, stepIndex, barIndex, state: getSnapshot() };
  }

  function noteThreatIntent(threatClass = 'full', amount = 1, beatIndex = state.beatIndex) {
    const beat = ensureUsageBeat(beatIndex);
    const count = Math.max(1, Math.trunc(Number(amount) || 1));
    const cls = String(threatClass || 'full').trim().toLowerCase();

    if (cls === 'light') state.usage.lightThreats += count;
    else if (cls === 'accent') state.usage.audibleAccents += count;
    else state.usage.fullThreats += count;

    const fullWithinBudget = state.usage.fullThreats <= state.budgets.maxFullThreatsPerBeat;
    const lightWithinBudget = state.usage.lightThreats <= state.budgets.maxLightThreatsPerBeat;
    const accentWithinBudget = state.usage.audibleAccents <= state.budgets.maxAudibleAccentsPerBeat;

    return {
      beatIndex: beat,
      threatClass: cls,
      withinBudget: fullWithinBudget && lightWithinBudget && accentWithinBudget,
      state: getSnapshot(),
    };
  }

  function enqueueBeatEvent(event) {
    const ev = event && typeof event === 'object' ? { ...event } : null;
    if (!ev) return null;
    const beatIndex = Math.max(0, Math.trunc(Number(ev.beatIndex) || 0));
    const stepIndex = Math.max(0, Math.trunc(Number(ev.stepIndex) || 0));
    const eventId = Math.max(1, Math.trunc(Number(ev.eventId) || state.eventSeq));
    state.eventSeq = Math.max(state.eventSeq, eventId + 1);
    const queued = { ...ev, eventId, beatIndex, stepIndex };
    state.eventQueue.push(queued);
    return queued;
  }

  function drainBeatEventsForStep(beatIndex = state.beatIndex, stepIndex = state.stepIndex) {
    const beat = Math.max(0, Math.trunc(Number(beatIndex) || 0));
    const step = Math.max(0, Math.trunc(Number(stepIndex) || 0));
    const out = [];
    for (let i = 0; i < state.eventQueue.length; i++) {
      const ev = state.eventQueue[i];
      if (!ev) continue;
      if (Math.trunc(Number(ev.beatIndex) || 0) !== beat) continue;
      if (Math.trunc(Number(ev.stepIndex) || 0) !== step) continue;
      out.push(ev);
    }
    if (!out.length) return [];
    const kept = [];
    const pickedIds = new Set(out.map((ev) => Math.trunc(Number(ev.eventId) || 0)));
    for (let i = 0; i < state.eventQueue.length; i++) {
      const ev = state.eventQueue[i];
      const id = Math.trunc(Number(ev?.eventId) || 0);
      if (pickedIds.has(id)) continue;
      kept.push(ev);
    }
    state.eventQueue = kept;
    out.sort((a, b) => Math.trunc(Number(a.eventId) || 0) - Math.trunc(Number(b.eventId) || 0));
    return out;
  }

  function clearBeatEvents() {
    state.eventQueue.length = 0;
  }

  function setEnergyState(next) {
    state.energyState = normalizeEnergyState(next);
    return state.energyState;
  }

  function setNotePool(next) {
    state.notePool = normalizeNotePool(next, fallbackPool);
    return state.notePool.slice();
  }

  function getNotePool() {
    return state.notePool.slice();
  }

  function pickNoteFromPool(index = 0) {
    const pool = state.notePool;
    if (!Array.isArray(pool) || !pool.length) return 'C4';
    const i = ((Math.trunc(Number(index) || 0) % pool.length) + pool.length) % pool.length;
    return String(pool[i] || pool[0] || 'C4');
  }

  function clampNoteToPool(note, fallbackIndex = 0) {
    const normalized = String(note || '').trim();
    const pool = state.notePool;
    if (!Array.isArray(pool) || !pool.length) return normalized || 'C4';
    if (normalized && pool.includes(normalized)) return normalized;
    const targetMidi = noteNameToMidi(normalized);
    if (targetMidi == null) return pickNoteFromPool(fallbackIndex);
    let bestNote = pickNoteFromPool(fallbackIndex);
    let bestDelta = Infinity;
    for (let i = 0; i < pool.length; i++) {
      const n = String(pool[i] || '').trim();
      if (!n) continue;
      const midi = noteNameToMidi(n);
      if (midi == null) continue;
      const delta = Math.abs(midi - targetMidi);
      if (delta < bestDelta) {
        bestDelta = delta;
        bestNote = n;
      }
    }
    return bestNote || pickNoteFromPool(fallbackIndex);
  }

  function setBudgets(next) {
    const merged = { ...state.budgets, ...(next && typeof next === 'object' ? next : {}) };
    state.budgets = createThreatBudgets(merged);
    return { ...state.budgets };
  }

  function reset() {
    state.barIndex = 0;
    state.beatIndex = 0;
    state.stepIndex = 0;
    state.lastBarIndex = null;
    state.lastBeatIndex = null;
    state.lastStepIndex = null;
    state.phase01 = 0;
    resetBeatUsage(null);
    clearBeatEvents();
  }

  return Object.freeze({
    updateFromLoopInfo,
    noteThreatIntent,
    enqueueBeatEvent,
    drainBeatEventsForStep,
    clearBeatEvents,
    getSnapshot,
    syncToBeat,
    setEnergyState,
    setNotePool,
    getNotePool,
    pickNoteFromPool,
    clampNoteToPool,
    setBudgets,
    reset,
  });
}
