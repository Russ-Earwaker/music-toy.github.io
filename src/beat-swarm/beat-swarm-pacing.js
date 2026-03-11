const DEFAULT_BEATS_PER_BAR = 4;

const PACING_STATES = Object.freeze({
  INTRO_SOLO: 'intro_solo',
  INTRO_BASS: 'intro_bass',
  INTRO_RESPONSE: 'intro_response',
  MAIN_LOW: 'main_low',
  MAIN_MID: 'main_mid',
  PEAK: 'peak',
  BREAK: 'break',
});

const INTRO_SEQUENCE = Object.freeze([
  Object.freeze({ id: PACING_STATES.INTRO_SOLO, bars: 3 }),
  Object.freeze({ id: PACING_STATES.INTRO_BASS, bars: 4 }),
  Object.freeze({ id: PACING_STATES.INTRO_RESPONSE, bars: 4 }),
]);

const LOOP_SEQUENCE = Object.freeze([
  Object.freeze({ id: PACING_STATES.MAIN_LOW, bars: 8 }),
  Object.freeze({ id: PACING_STATES.MAIN_MID, bars: 8 }),
  Object.freeze({ id: PACING_STATES.PEAK, bars: 4 }),
  Object.freeze({ id: PACING_STATES.BREAK, bars: 4 }),
]);

function getPacingCapsForState(stateName, responseMode = 'drawsnake') {
  const s = String(stateName || PACING_STATES.INTRO_SOLO).trim().toLowerCase();
  if (s === PACING_STATES.INTRO_SOLO) {
    return {
      maxFallbackEnemies: 0,
      maxSpawners: 0,
      maxDrawSnakes: 0,
      maxComposerGroups: 0,
      maxComposerGroupSize: 0,
      maxComposerPerformers: 0,
      responseMode: 'none',
    };
  }
  if (s === PACING_STATES.INTRO_BASS) {
    return {
      maxFallbackEnemies: 0,
      maxSpawners: 0,
      maxDrawSnakes: 0,
      maxComposerGroups: 1,
      maxComposerGroupSize: 4,
      maxComposerPerformers: 1,
      responseMode: 'group',
    };
  }
  if (s === PACING_STATES.INTRO_RESPONSE) {
    const mode = String(responseMode || 'drawsnake') === 'group' ? 'group' : 'drawsnake';
    return {
      maxFallbackEnemies: 0,
      maxSpawners: mode === 'group' ? 1 : 0,
      maxDrawSnakes: mode === 'drawsnake' ? 1 : 0,
      // Phase 2 should add one response loop while preserving phase-1 bass foundation.
      maxComposerGroups: 1,
      maxComposerGroupSize: 4,
      maxComposerPerformers: 1,
      responseMode: mode,
    };
  }
  if (s === PACING_STATES.MAIN_LOW) {
    return {
      maxFallbackEnemies: 0,
      maxSpawners: 1,
      maxDrawSnakes: 1,
      maxComposerGroups: 1,
      maxComposerGroupSize: 3,
      maxComposerPerformers: 1,
      responseMode: 'either',
    };
  }
  if (s === PACING_STATES.MAIN_MID) {
    return {
      maxFallbackEnemies: 0,
      maxSpawners: 2,
      maxDrawSnakes: 2,
      maxComposerGroups: 2,
      maxComposerGroupSize: 4,
      maxComposerPerformers: 2,
      responseMode: 'either',
    };
  }
  if (s === PACING_STATES.PEAK) {
    return {
      maxFallbackEnemies: 0,
      maxSpawners: 3,
      maxDrawSnakes: 2,
      maxComposerGroups: 3,
      maxComposerGroupSize: 5,
      maxComposerPerformers: 3,
      responseMode: 'either',
    };
  }
  if (s === PACING_STATES.BREAK) {
    return {
      maxFallbackEnemies: 0,
      maxSpawners: 1,
      maxDrawSnakes: 1,
      maxComposerGroups: 1,
      maxComposerGroupSize: 2,
      maxComposerPerformers: 1,
      responseMode: 'either',
    };
  }
  return getPacingCapsForState(PACING_STATES.INTRO_SOLO, responseMode);
}

export function createBeatSwarmPacing(options = null) {
  const beatsPerBar = Math.max(1, Math.trunc(Number(options?.beatsPerBar) || DEFAULT_BEATS_PER_BAR));

  let introIndex = 0;
  let loopIndex = 0;
  let inLoop = false;
  let cycle = 0;
  let state = INTRO_SEQUENCE[0].id;
  let stateStartBar = 0;
  let barsInState = INTRO_SEQUENCE[0].bars;
  let lastBar = -1;
  let introResponseCount = 0;
  let responseMode = 'drawsnake';

  function applyState(nextState, nextBars, startBar) {
    state = String(nextState || PACING_STATES.INTRO_SOLO);
    barsInState = Math.max(1, Math.trunc(Number(nextBars) || 1));
    stateStartBar = Math.max(0, Math.trunc(Number(startBar) || 0));
    if (state === PACING_STATES.INTRO_RESPONSE) {
      responseMode = (introResponseCount % 2) === 0 ? 'drawsnake' : 'group';
      introResponseCount += 1;
    }
  }

  function reset(barIndex = 0) {
    const bar = Math.max(0, Math.trunc(Number(barIndex) || 0));
    introIndex = 0;
    loopIndex = 0;
    inLoop = false;
    cycle = 0;
    introResponseCount = 0;
    responseMode = 'drawsnake';
    applyState(INTRO_SEQUENCE[0].id, INTRO_SEQUENCE[0].bars, bar);
    lastBar = bar;
  }

  function advanceOnce() {
    if (!inLoop) {
      introIndex += 1;
      if (introIndex < INTRO_SEQUENCE.length) {
        const next = INTRO_SEQUENCE[introIndex];
        applyState(next.id, next.bars, stateStartBar + barsInState);
        return;
      }
      inLoop = true;
      loopIndex = 0;
      const first = LOOP_SEQUENCE[0];
      applyState(first.id, first.bars, stateStartBar + barsInState);
      return;
    }
    loopIndex = (loopIndex + 1) % LOOP_SEQUENCE.length;
    if (loopIndex === 0) cycle += 1;
    const next = LOOP_SEQUENCE[loopIndex];
    applyState(next.id, next.bars, stateStartBar + barsInState);
  }

  function updateForBar(barIndex = 0) {
    const bar = Math.max(0, Math.trunc(Number(barIndex) || 0));
    if (lastBar === bar) return;
    lastBar = bar;
    while (bar >= (stateStartBar + barsInState)) {
      advanceOnce();
    }
  }

  function getSnapshot() {
    return {
      state,
      stateStartBar,
      barsInState,
      barIndex: lastBar,
      cycle,
      introIndex,
      loopIndex,
      inLoop,
      responseMode,
      beatsPerBar,
      caps: getPacingCapsForState(state, responseMode),
    };
  }

  return {
    states: PACING_STATES,
    beatsPerBar,
    reset,
    updateForBar,
    getSnapshot,
  };
}
