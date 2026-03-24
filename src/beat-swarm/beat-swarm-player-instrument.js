function clampInt(value, fallback = 0, min = 0, max = Number.POSITIVE_INFINITY) {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n)) return Math.max(min, Math.min(max, Math.trunc(Number(fallback) || 0)));
  return Math.max(min, Math.min(max, n));
}

function normalizeMode(modeLike, fallback = 'guided_fire') {
  const raw = String(modeLike || '').trim().toLowerCase();
  if (raw === 'free_fire') return 'free_fire';
  if (raw === 'guided_fire') return 'guided_fire';
  if (raw === 'locked_pattern') return 'locked_pattern';
  if (raw === 'custom_pattern') return 'custom_pattern';
  return String(fallback || 'guided_fire').trim().toLowerCase() === 'free_fire'
    ? 'free_fire'
    : (String(fallback || 'guided_fire').trim().toLowerCase() === 'locked_pattern'
      ? 'locked_pattern'
      : (String(fallback || 'guided_fire').trim().toLowerCase() === 'custom_pattern' ? 'custom_pattern' : 'guided_fire'));
}

function normalizePattern(patternLike, length = 8, fallback = null) {
  const len = Math.max(1, clampInt(length, 8, 1, 128));
  const fallbackPattern = Array.isArray(fallback) ? fallback : Array.from({ length: len }, (_, i) => (i % 2) === 0);
  const out = Array.from({ length: len }, (_, i) => !!fallbackPattern[i]);
  if (Array.isArray(patternLike)) {
    for (let i = 0; i < len; i++) out[i] = !!patternLike[i];
    return out;
  }
  const raw = String(patternLike || '').trim();
  if (!raw) return out;
  const tokens = raw.split(/[,\s|/]+/).map((v) => String(v || '').trim()).filter(Boolean);
  if (!tokens.length) return out;
  for (let i = 0; i < len; i++) {
    const t = String(tokens[i % tokens.length] || '').trim().toLowerCase();
    out[i] = (t === '1' || t === 'true' || t === 'x' || t === 'on');
  }
  return out;
}

function normalizeStructureIntent(intentLike, fallback = 'drive') {
  const raw = String(intentLike || '').trim().toLowerCase();
  if (raw === 'intro' || raw === 'build' || raw === 'drive' || raw === 'drop' || raw === 'peak') return raw;
  return String(fallback || 'drive').trim().toLowerCase() || 'drive';
}

function getSectionDirective(context = null, stepsPerBar = 8, baseSubdivision = 4) {
  const structureIntent = normalizeStructureIntent(context?.structureIntent, 'drive');
  const preDropActive = context?.preDropActive === true;
  const hasAuthoredTune = context?.hasAuthoredTune === true;
  const effectiveIntent = preDropActive ? 'predrop' : structureIntent;
  const base = {
    structureIntent,
    effectiveIntent,
    musicRole: 'support',
    musicLayer: 'loops',
    presentation: 'supportive',
    registerTarget: 'mid_high',
    volumeMult: 0.82,
    targetSubdivision: Math.max(1, clampInt(baseSubdivision, 4, 1, stepsPerBar)),
  };
  if (effectiveIntent === 'intro') {
    return {
      ...base,
      presentation: 'restrained',
      registerTarget: 'high',
      volumeMult: hasAuthoredTune ? 0.72 : 0.62,
      targetSubdivision: Math.max(1, Math.min(base.targetSubdivision, 2)),
    };
  }
  if (effectiveIntent === 'build') {
    return {
      ...base,
      presentation: 'supportive',
      registerTarget: 'mid_high',
      volumeMult: hasAuthoredTune ? 0.84 : 0.76,
      targetSubdivision: Math.max(1, Math.min(base.targetSubdivision, 4)),
    };
  }
  if (effectiveIntent === 'predrop') {
    return {
      ...base,
      presentation: 'tense_support',
      registerTarget: 'mid_high',
      volumeMult: hasAuthoredTune ? 0.76 : 0.66,
      targetSubdivision: Math.max(1, Math.min(base.targetSubdivision, 4)),
    };
  }
  if (effectiveIntent === 'peak') {
    return {
      ...base,
      musicRole: 'accent',
      presentation: 'assertive_support',
      registerTarget: 'mid',
      volumeMult: hasAuthoredTune ? 0.86 : 0.78,
      targetSubdivision: Math.max(1, Math.min(base.targetSubdivision, 4)),
    };
  }
  if (effectiveIntent === 'drop') {
    return {
      ...base,
      musicRole: 'accent',
      presentation: 'restrained',
      registerTarget: 'high',
      volumeMult: hasAuthoredTune ? 0.64 : 0.54,
      targetSubdivision: Math.max(1, Math.min(base.targetSubdivision, 2)),
    };
  }
  return {
    ...base,
    musicRole: 'support',
    presentation: 'reinforcement',
    registerTarget: 'mid',
    volumeMult: hasAuthoredTune ? 0.9 : 0.8,
    targetSubdivision: Math.max(1, Math.min(base.targetSubdivision, 4)),
  };
}

export function createBeatSwarmPlayerInstrumentRuntime(options = null) {
  const stepsPerBar = Math.max(1, clampInt(options?.stepsPerBar, 8, 1, 128));
  const state = {
    mode: normalizeMode(options?.mode, 'guided_fire'),
    grooveTargetSubdivision: Math.max(1, clampInt(options?.grooveTargetSubdivision, 4, 1, stepsPerBar)),
    lockedPattern: normalizePattern(options?.lockedPattern, stepsPerBar, Array.from({ length: stepsPerBar }, (_, i) => (i % 2) === 0)),
    customPatternEnabled: options?.customPatternEnabled === true,
    customPattern: normalizePattern(options?.customPattern, stepsPerBar, Array.from({ length: stepsPerBar }, (_, i) => i === 0 || i === 4)),
    manualOverrideUntilBeat: -1,
  };

  function reset() {
    state.manualOverrideUntilBeat = -1;
  }

  function getSnapshot() {
    return {
      mode: state.mode,
      grooveTargetSubdivision: state.grooveTargetSubdivision,
      lockedPattern: state.lockedPattern.slice(),
      customPatternEnabled: state.customPatternEnabled,
      customPattern: state.customPattern.slice(),
      manualOverrideUntilBeat: state.manualOverrideUntilBeat,
      stepsPerBar,
    };
  }

  function setMode(modeLike) {
    state.mode = normalizeMode(modeLike, state.mode);
    return state.mode;
  }

  function setGrooveTargetSubdivision(next) {
    state.grooveTargetSubdivision = Math.max(1, clampInt(next, state.grooveTargetSubdivision, 1, stepsPerBar));
    return state.grooveTargetSubdivision;
  }

  function setLockedPattern(patternLike) {
    state.lockedPattern = normalizePattern(patternLike, stepsPerBar, state.lockedPattern);
    return state.lockedPattern.slice();
  }

  function setCustomPattern(patternLike) {
    state.customPattern = normalizePattern(patternLike, stepsPerBar, state.customPattern);
    return state.customPattern.slice();
  }

  function setCustomPatternEnabled(next = true) {
    state.customPatternEnabled = !!next;
    return state.customPatternEnabled;
  }

  function noteManualOverride(beatIndex = 0, durationBeats = 2) {
    const beat = Math.max(0, clampInt(beatIndex, 0, 0));
    const dur = Math.max(1, clampInt(durationBeats, 2, 1, 32));
    state.manualOverrideUntilBeat = Math.max(state.manualOverrideUntilBeat, beat + dur);
    return state.manualOverrideUntilBeat;
  }

  function patternHasAnyHit(pattern) {
    return Array.isArray(pattern) && pattern.some(Boolean);
  }

  function getStepDirective(stepIndex = 0, beatIndex = 0, styleProfile = null, musicalContext = null) {
    const step = ((Math.trunc(Number(stepIndex) || 0) % stepsPerBar) + stepsPerBar) % stepsPerBar;
    const beat = Math.max(0, Math.trunc(Number(beatIndex) || 0));
    const styleId = String(styleProfile?.id || '').trim().toLowerCase();
    const sectionDirective = getSectionDirective(musicalContext, stepsPerBar, state.grooveTargetSubdivision);
    const manualOverrideActive = beat <= Math.max(-1, Math.trunc(Number(state.manualOverrideUntilBeat) || -1));
    const modeBase = normalizeMode(state.mode, 'guided_fire');
    let mode = modeBase;
    if (manualOverrideActive) mode = 'free_fire';
    else if (styleId === 'retro_shooter' && modeBase === 'free_fire') mode = 'guided_fire';

    let emit = true;
    let reason = 'free';
    if (mode === 'free_fire') {
      emit = true;
      reason = manualOverrideActive ? 'manual_override' : 'free';
    } else if (mode === 'locked_pattern') {
      emit = !!state.lockedPattern[step];
      reason = 'locked_pattern';
    } else if (mode === 'custom_pattern') {
      if (state.customPatternEnabled && patternHasAnyHit(state.customPattern)) {
        emit = !!state.customPattern[step];
        reason = 'custom_pattern';
      } else {
        emit = (step % Math.max(1, Math.round(stepsPerBar / Math.max(1, sectionDirective.targetSubdivision)))) === 0;
        reason = 'custom_fallback_guided';
      }
    } else {
      if (state.customPatternEnabled && patternHasAnyHit(state.customPattern)) {
        emit = !!state.customPattern[step];
        reason = 'guided_custom_override';
      } else {
        const stride = Math.max(1, Math.round(stepsPerBar / Math.max(1, sectionDirective.targetSubdivision)));
        emit = (step % stride) === 0;
        reason = 'guided_grid';
      }
    }

    if (!emit && styleId === 'retro_shooter' && step === 0) {
      emit = true;
      reason = `${reason}_bar_anchor`;
    }
    return {
      emit,
      mode,
      reason,
      manualOverrideActive,
      grooveTargetSubdivision: state.grooveTargetSubdivision,
      targetSubdivision: sectionDirective.targetSubdivision,
      musicRole: sectionDirective.musicRole,
      musicLayer: sectionDirective.musicLayer,
      presentation: sectionDirective.presentation,
      registerTarget: sectionDirective.registerTarget,
      volumeMult: sectionDirective.volumeMult,
      structureIntent: sectionDirective.structureIntent,
      effectiveIntent: sectionDirective.effectiveIntent,
      stepsPerBar,
    };
  }

  return {
    reset,
    getSnapshot,
    setMode,
    setGrooveTargetSubdivision,
    setLockedPattern,
    setCustomPattern,
    setCustomPatternEnabled,
    noteManualOverride,
    getStepDirective,
  };
}
