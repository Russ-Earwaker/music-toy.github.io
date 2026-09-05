export const BEAT_SWARM_LANE_FOCUS_ORDER = Object.freeze([
  'foundation_lane',
  'secondary_loop_lane',
  'primary_loop_lane',
  'tonal_bass_lane',
  'sparkle_lane',
  'answer_lane',
]);

export const BEAT_SWARM_LANE_FOCUS_CONFIG = Object.freeze({
  phraseBars: 4,
  minimumPrimaryPhrases: 1,
  difficultySupportingLaneStep: 1,
  difficultyExtraPrimaryAt: 3,
  budgets: Object.freeze({
    silent: Object.freeze({ primary: 0, supporting: 0 }),
    intro: Object.freeze({ primary: 1, supporting: 0 }),
    low: Object.freeze({ primary: 1, supporting: 0 }),
    settle: Object.freeze({ primary: 1, supporting: 0 }),
    medium: Object.freeze({ primary: 1, supporting: 1 }),
    release: Object.freeze({ primary: 1, supporting: 1 }),
    build: Object.freeze({ primary: 1, supporting: 2 }),
    peak: Object.freeze({ primary: 2, supporting: 2 }),
  }),
});

function normalizeLaneIds(values = null) {
  const source = values instanceof Set ? Array.from(values) : (Array.isArray(values) ? values : []);
  return source
    .map((value) => String(value || '').trim().toLowerCase())
    .filter((value, index, lanes) => !!value && lanes.indexOf(value) === index);
}

function normalizeStage(stageLike = '', configLike = null) {
  const config = configLike && typeof configLike === 'object' ? configLike : BEAT_SWARM_LANE_FOCUS_CONFIG;
  const stage = String(stageLike || '').trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(config.budgets || {}, stage) ? stage : 'low';
}

export function resolveBeatSwarmLaneFocusBudget(stageLike = '', difficultyLike = 0, configLike = null) {
  const config = configLike && typeof configLike === 'object' ? configLike : BEAT_SWARM_LANE_FOCUS_CONFIG;
  const stage = normalizeStage(stageLike, config);
  const base = config.budgets?.[stage] || config.budgets?.low || { primary: 1, supporting: 0 };
  const difficulty = Math.max(0, Math.trunc(Number(difficultyLike) || 0));
  const supportingStep = Math.max(0, Math.trunc(Number(config.difficultySupportingLaneStep) || 0));
  const extraPrimaryAt = Math.max(1, Math.trunc(Number(config.difficultyExtraPrimaryAt) || 3));
  return {
    stage,
    difficulty,
    primary: Math.max(0, Math.trunc(Number(base.primary) || 0)) + (difficulty >= extraPrimaryAt ? 1 : 0),
    supporting: Math.max(0, Math.trunc(Number(base.supporting) || 0)) + (difficulty * supportingStep),
  };
}

export function applyBeatSwarmLaneFocusToCarrierCounts(countsLike = null, snapshotLike = null) {
  const counts = countsLike && typeof countsLike === 'object' ? countsLike : {};
  const result = { ...counts };
  const focusedLaneIds = Array.isArray(snapshotLike?.focusedLaneIds)
    ? snapshotLike.focusedLaneIds
        .map((laneId) => String(laneId || '').trim().toLowerCase())
        .filter(Boolean)
    : [];
  if (!snapshotLike || typeof snapshotLike !== 'object') return result;
  const focused = new Set(focusedLaneIds);
  const focusedCount = (field, laneId) => focused.has(laneId)
    ? Math.max(1, Math.trunc(Number(result[field]) || 0))
    : 0;
  result.foundation = focusedCount('foundation', 'foundation_lane');
  result.secondary_loop_rhythm = focusedCount('secondary_loop_rhythm', 'secondary_loop_lane');
  result.primary_loop_lead = focusedCount('primary_loop_lead', 'primary_loop_lane');
  result.ornament = (focused.has('sparkle_lane') || focused.has('answer_lane'))
    ? Math.max(1, Math.trunc(Number(result.ornament) || 0))
    : 0;
  return result;
}

export function evaluateBeatSwarmLaneFocusPresentation(snapshotLike = null, statusByLaneLike = null) {
  const snapshot = snapshotLike && typeof snapshotLike === 'object' ? snapshotLike : {};
  const statusByLane = statusByLaneLike && typeof statusByLaneLike === 'object' ? statusByLaneLike : {};
  const primaryLaneIds = normalizeLaneIds(snapshot.primaryLaneIds);
  const supportingLaneIds = normalizeLaneIds(snapshot.supportingLaneIds);
  const focusedLaneIds = normalizeLaneIds([...primaryLaneIds, ...supportingLaneIds]);
  const laneStates = {};
  const visibleLaneIds = [];
  const enteringLaneIds = [];
  const missingLaneIds = [];
  for (const laneId of focusedLaneIds) {
    const status = statusByLane[laneId] && typeof statusByLane[laneId] === 'object'
      ? statusByLane[laneId]
      : {};
    const visibleCount = Math.max(0, Math.trunc(Number(status.visibleCount) || 0));
    const candidateCount = Math.max(0, Math.trunc(Number(status.candidateCount) || 0));
    const state = visibleCount > 0 ? 'visible' : (candidateCount > 0 ? 'entering' : 'missing');
    laneStates[laneId] = {
      state,
      visibleCount,
      candidateCount,
      selectedEnemyId: Math.max(0, Math.trunc(Number(status.selectedEnemyId) || 0)),
      guidanceActive: status.guidanceActive === true,
    };
    if (state === 'visible') visibleLaneIds.push(laneId);
    else if (state === 'entering') enteringLaneIds.push(laneId);
    else missingLaneIds.push(laneId);
  }
  const missingPrimaryLaneIds = primaryLaneIds.filter((laneId) => laneStates[laneId]?.state === 'missing');
  const pendingPrimaryLaneIds = primaryLaneIds.filter((laneId) => laneStates[laneId]?.state === 'entering');
  return {
    ready: focusedLaneIds.length === 0 || (missingPrimaryLaneIds.length === 0 && pendingPrimaryLaneIds.length === 0),
    primaryReady: missingPrimaryLaneIds.length === 0 && pendingPrimaryLaneIds.length === 0,
    focusedLaneIds,
    primaryLaneIds,
    supportingLaneIds,
    visibleLaneIds,
    enteringLaneIds,
    missingLaneIds,
    missingPrimaryLaneIds,
    pendingPrimaryLaneIds,
    laneStates,
  };
}

export function createBeatSwarmLaneFocusRuntime(options = null) {
  const opts = options && typeof options === 'object' ? options : {};
  const config = opts.config && typeof opts.config === 'object' ? opts.config : BEAT_SWARM_LANE_FOCUS_CONFIG;
  const laneOrder = normalizeLaneIds(opts.laneOrder || BEAT_SWARM_LANE_FOCUS_ORDER);
  const exposureByLane = new Map(laneOrder.map((laneId) => [laneId, 0]));
  let state = null;

  const reset = () => {
    exposureByLane.clear();
    for (const laneId of laneOrder) exposureByLane.set(laneId, 0);
    state = null;
  };

  const getSnapshot = () => state ? {
    ...state,
    primaryLaneIds: state.primaryLaneIds.slice(),
    supportingLaneIds: state.supportingLaneIds.slice(),
    focusedLaneIds: state.focusedLaneIds.slice(),
    forcedLaneIds: state.forcedLaneIds.slice(),
    availableLaneIds: state.availableLaneIds.slice(),
    exposureByLane: Object.fromEntries(exposureByLane),
  } : null;

  const update = (input = null) => {
    const next = input && typeof input === 'object' ? input : {};
    const beatIndex = Math.max(0, Math.trunc(Number(next.beatIndex) || 0));
    const barIndex = Math.max(0, Math.trunc(Number(next.barIndex) || 0));
    const phraseBars = Math.max(1, Math.trunc(Number(next.phraseBars) || Number(config.phraseBars) || 4));
    const phraseIndex = Math.floor(barIndex / phraseBars);
    const availableLaneIds = normalizeLaneIds(next.availableLaneIds).filter((laneId) => laneOrder.includes(laneId));
    const forcedLaneIds = normalizeLaneIds(next.forcedLaneIds).filter((laneId) => availableLaneIds.includes(laneId));
    const budget = resolveBeatSwarmLaneFocusBudget(next.intensityStage, next.difficulty, config);
    const minimumPrimaryPhrases = Math.max(1, Math.trunc(Number(config.minimumPrimaryPhrases) || 1));
    const forcedSignature = forcedLaneIds.join('|');
    const availableSignature = availableLaneIds.join('|');
    const focusHoldComplete = !state
      || (phraseIndex - Math.max(0, Math.trunc(Number(state.primarySelectedPhraseIndex) || 0))) >= minimumPrimaryPhrases;
    const mustRebuild = !state
      || (state.phraseIndex !== phraseIndex && focusHoldComplete)
      || state.stage !== budget.stage
      || state.difficulty !== budget.difficulty
      || state.forcedSignature !== forcedSignature
      || state.availableSignature !== availableSignature;
    if (!mustRebuild) return getSnapshot();

    const ranked = availableLaneIds.slice().sort((a, b) => {
      const forcedDelta = Number(forcedLaneIds.includes(b)) - Number(forcedLaneIds.includes(a));
      if (forcedDelta) return forcedDelta;
      const exposureDelta = (exposureByLane.get(a) || 0) - (exposureByLane.get(b) || 0);
      if (exposureDelta) return exposureDelta;
      const rotatedA = (laneOrder.indexOf(a) - phraseIndex + laneOrder.length) % laneOrder.length;
      const rotatedB = (laneOrder.indexOf(b) - phraseIndex + laneOrder.length) % laneOrder.length;
      return rotatedA - rotatedB;
    });
    const primaryCount = Math.min(availableLaneIds.length, Math.max(forcedLaneIds.length, budget.primary));
    const totalCount = Math.min(availableLaneIds.length, Math.max(primaryCount, primaryCount + budget.supporting));
    const primaryLaneIds = ranked.slice(0, primaryCount);
    const supportingLaneIds = ranked.slice(primaryCount, totalCount);
    const focusedLaneIds = [...primaryLaneIds, ...supportingLaneIds];
    for (const laneId of primaryLaneIds) exposureByLane.set(laneId, (exposureByLane.get(laneId) || 0) + 2);
    for (const laneId of supportingLaneIds) exposureByLane.set(laneId, (exposureByLane.get(laneId) || 0) + 1);
    state = {
      beatIndex,
      barIndex,
      phraseIndex,
      primarySelectedPhraseIndex: phraseIndex,
      stage: budget.stage,
      difficulty: budget.difficulty,
      budget,
      primaryLaneIds,
      supportingLaneIds,
      focusedLaneIds,
      forcedLaneIds,
      availableLaneIds,
      forcedSignature,
      availableSignature,
      reason: forcedLaneIds.length ? 'player_authored_override' : 'phrase_rotation',
    };
    return getSnapshot();
  };

  return { reset, update, getSnapshot };
}
