import {
  getBeatSwarmLevel1RoleForLane,
} from './beat-swarm-level1-contract.js';

const DEFAULT_BEATS_PER_BAR = 4;
const DEFAULT_METRICS_EVERY_BARS = 4;
const SYSTEM_EVENT_SUMMARY_ONLY_TYPES = new Set([
  'music_step_arbitration',
  'music_primary_loop_lane_emitted',
  'music_bass_keepalive_injected',
  'music_spawner_gameplay_event',
  'music_spawner_audio_event',
  'music_spawner_audio_muted',
  'music_spawner_visual_event',
  'music_spawner_loopgrid_event',
  'music_spawner_pipeline_mismatch',
  'music_foundation_prominence_decision',
]);
const PERF_LIGHTWEIGHT_SYSTEM_EVENT_DROP_TYPES = new Set([
  'music_composer_group_state',
  'music_group_performer_trace',
  'music_primary_loop_owner_trace',
  'music_primary_loop_coverage_status',
  'music_primary_lead_snapshot',
  'music_step_arbitration',
  'music_primary_loop_lane_emitted',
  'music_mode_state',
  'music_intro_debug',
  'music_rhythm_tier_selected',
  'music_composer_execution_stage',
  'music_slot_spawner_stage',
  'music_slot_spawner_admission',
  'music_call_response_call_group_state',
  'music_call_response_response_group_state',
  'music_secondary_bridge_coverage_trace',
  'music_intro_slot_suppressed',
  'music_primary_loop_group_suppressed',
]);

function clampInt(value, fallback = 0, min = 0) {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n)) return Math.max(min, Math.trunc(Number(fallback) || 0));
  return Math.max(min, n);
}

function nowMs() {
  try {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
      return Number(performance.now()) || Date.now();
    }
  } catch {}
  return Date.now();
}

function cloneJson(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return null;
  }
}

function normalizeSourceSystem(sourceSystem, actionType = '') {
  const src = String(sourceSystem || '').trim().toLowerCase();
  if (src) return src;
  const action = String(actionType || '').trim().toLowerCase();
  if (action === 'player-weapon-step') return 'player';
  if (action.startsWith('spawner-')) return 'spawner';
  if (action.startsWith('drawsnake-')) return 'drawsnake';
  if (action.startsWith('composer-group-')) return 'group';
  if (action.startsWith('enemy-death-')) return 'death';
  return 'unknown';
}

function deriveFoundationPlayerBassTrace(foundationPhraseIdLike = '', foundationPatternKeyLike = '', barIndexLike = 0) {
  const phraseId = String(foundationPhraseIdLike || '').trim().toLowerCase();
  const match = /^player_bass_drive_(\d+)_([01]+)$/.exec(phraseId);
  if (!match) return null;
  const barIndex = clampInt(barIndexLike, 0, 0);
  const patternKey = String(foundationPatternKeyLike || match[2] || '').trim().toLowerCase();
  const interpretationMode = barIndex >= 12 && barIndex < 20 ? 'literal_statement' : 'director_riff';
  return {
    foundationPlayerThemeSource: 'bassDrive',
    foundationRawPatternKey: patternKey,
    foundationShapedPatternKey: patternKey,
    foundationInterpretationMode: interpretationMode,
    foundationPhrasePartIndex: clampInt(match[1], 0, 0),
  };
}

function normalizeEnemyType(enemyType, sourceSystem = '', actionType = '') {
  const explicit = String(enemyType || '').trim().toLowerCase();
  if (explicit) return explicit;
  const source = String(sourceSystem || '').trim().toLowerCase();
  if (source === 'spawner') return 'spawner';
  if (source === 'drawsnake') return 'drawsnake';
  if (source === 'group') return 'composer-group-member';
  if (source === 'player') return 'player';
  if (source === 'death') return 'death';
  const action = String(actionType || '').trim().toLowerCase();
  if (action.startsWith('spawner-')) return 'spawner';
  if (action.startsWith('drawsnake-')) return 'drawsnake';
  if (action.startsWith('composer-group-')) return 'composer-group-member';
  if (action === 'player-weapon-step') return 'player';
  if (action.startsWith('enemy-death-')) return 'death';
  return 'unknown';
}

function normalizeInstrumentLane(value, fallback = '') {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'bass' || raw === 'lead' || raw === 'accent' || raw === 'motion') return raw;
  if (raw === 'drum' || raw === 'rhythm' || raw === 'groove') return 'bass';
  if (raw === 'phrase' || raw === 'melody') return 'lead';
  if (raw === 'fx' || raw === 'effect') return 'accent';
  if (raw === 'texture' || raw === 'cosmetic' || raw === 'ambient') return 'motion';
  return String(fallback || '').trim().toLowerCase();
}
function makeLaneOwnershipRecord(recordLike) {
  const record = recordLike && typeof recordLike === 'object' ? recordLike : {};
  return {
    laneId: String(record.laneId || '').trim().toLowerCase(),
    layer: String(record.layer || '').trim().toLowerCase(),
    role: String(record.role || '').trim().toLowerCase(),
    continuityId: String(record.continuityId || '').trim(),
    instrumentId: String(record.instrumentId || '').trim(),
    phraseId: String(record.phraseId || '').trim().toLowerCase(),
    patternKey: String(record.patternKey || '').trim(),
    performerEnemyId: clampInt(record.performerEnemyId, 0, 0),
    performerGroupId: clampInt(record.performerGroupId, 0, 0),
    performerType: String(record.performerType || '').trim().toLowerCase(),
    handoffPolicy: String(record.handoffPolicy || '').trim().toLowerCase(),
    identityChangeReason: String(record.identityChangeReason || '').trim().toLowerCase(),
    sectionId: String(record.sectionId || '').trim().toLowerCase(),
    activeSinceBar: clampInt(record.activeSinceBar, -1, -1),
    lastAssignedBar: clampInt(record.lastAssignedBar, -1, -1),
    lifetimeBars: clampInt(record.lifetimeBars, 0, 0),
  };
}

function toMidi(noteName) {
  const raw = String(noteName || '').trim();
  if (!raw) return null;
  const m = /^([A-Ga-g])([#b]?)(-?\d+)?$/.exec(raw);
  if (!m) return null;
  const base = String(m[1] || '').toUpperCase();
  const accidental = String(m[2] || '');
  const octave = clampInt(m[3], 4, -3);
  const semitoneBase = (
    base === 'C' ? 0
      : base === 'D' ? 2
        : base === 'E' ? 4
          : base === 'F' ? 5
            : base === 'G' ? 7
              : base === 'A' ? 9
                : 11
  );
  const accidentalDelta = accidental === '#' ? 1 : (accidental === 'b' ? -1 : 0);
  return ((octave + 1) * 12) + semitoneBase + accidentalDelta;
}

function makeEventRecord(event, phase, context, beatsPerBar) {
  const ev = event && typeof event === 'object' ? event : {};
  const beatIndex = clampInt(ev.beatIndex, 0, 0);
  const stepIndex = clampInt(ev.stepIndex, 0, 0);
  const barIndex = context?.barIndex != null
    ? clampInt(context.barIndex, Math.floor(beatIndex / Math.max(1, beatsPerBar)), 0)
    : Math.floor(beatIndex / Math.max(1, beatsPerBar));
  const actionType = String(ev.actionType || '').trim();
  const payload = ev?.payload && typeof ev.payload === 'object' ? ev.payload : {};
  const requestedNote = String(context?.requestedNote ?? payload.requestedNoteRaw ?? ev.note ?? '').trim();
  const resolvedNote = String(context?.resolvedNote ?? requestedNote).trim();
  const noteWasClamped = context?.noteWasClamped === true;
  const sourceSystem = normalizeSourceSystem(context?.sourceSystem, actionType);
  const enemyType = normalizeEnemyType(context?.enemyType ?? payload.enemyType, sourceSystem, actionType);
  const expectedInstrumentLane = normalizeInstrumentLane(
    context?.expectedInstrumentLane ?? payload.expectedInstrumentLane,
    ''
  );
  const actualInstrumentLane = normalizeInstrumentLane(
    context?.actualInstrumentLane ?? payload.actualInstrumentLane,
    ''
  );
  const playerAudible = context?.playerAudible === true;
  const enemyAudible = context?.enemyAudible === true
    ? true
    : (context?.enemyAudible === false ? false : null);
  const phraseGravityTarget = String(context?.phraseGravityTarget ?? payload.phraseGravityTarget ?? '').trim();
  const phraseGravityHit = context?.phraseGravityHit === true
    ? true
    : (context?.phraseGravityHit === false
      ? false
      : (payload?.phraseGravityHit === true ? true : (payload?.phraseGravityHit === false ? false : null)));
  const phraseResolutionOpportunity = context?.phraseResolutionOpportunity === true
    ? true
    : (context?.phraseResolutionOpportunity === false
      ? false
      : (payload?.phraseResolutionOpportunity === true ? true : (payload?.phraseResolutionOpportunity === false ? false : null)));
  const phraseResolutionHit = context?.phraseResolutionHit === true
    ? true
    : (context?.phraseResolutionHit === false
      ? false
      : (payload?.phraseResolutionHit === true ? true : (payload?.phraseResolutionHit === false ? false : null)));
  const continuityId = String(context?.continuityId ?? payload?.continuityId ?? '').trim();
  const musicLaneId = String(context?.musicLaneId ?? payload?.musicLaneId ?? '').trim().toLowerCase();
  const musicLanePhraseId = String(context?.musicLanePhraseId ?? payload?.musicLanePhraseId ?? '').trim().toLowerCase();
  const musicLanePatternKey = String(context?.musicLanePatternKey ?? payload?.musicLanePatternKey ?? '').trim().toLowerCase();
  const musicLanePlayerThemeSource = String(context?.musicLanePlayerThemeSource ?? payload?.musicLanePlayerThemeSource ?? '').trim();
  const foundationLaneId = String(context?.foundationLaneId ?? payload?.foundationLaneId ?? '').trim().toLowerCase();
  const enemyVisualId = String(context?.enemyVisualId ?? payload?.enemyVisualId ?? payload?.musicRoleVisualId ?? '').trim().toLowerCase();
  const enemyRoleColor = String(context?.enemyRoleColor ?? payload?.enemyRoleColor ?? payload?.musicRoleColor ?? '').trim().toLowerCase();
  const playerCadenceMode = String(context?.playerCadenceMode ?? payload?.playerCadenceMode ?? '').trim().toLowerCase();
  const playerCadenceReason = String(context?.playerCadenceReason ?? payload?.playerCadenceReason ?? '').trim().toLowerCase();
  const callResponseLane = String(context?.callResponseLane ?? payload?.callResponseLane ?? '').trim().toLowerCase();
  const callResponseQualified = context?.callResponseQualified === true
    ? true
    : (context?.callResponseQualified === false
      ? false
      : (payload?.callResponseQualified === true
        ? true
        : (payload?.callResponseQualified === false ? false : null)));
  const callResponsePhraseProgress = clampInt(context?.callResponsePhraseProgress ?? payload?.callResponsePhraseProgress, 0, 0);
  const playerManualOverrideActive = context?.playerManualOverrideActive === true
    ? true
    : (payload?.playerManualOverrideActive === true);
  const musicLayer = String(context?.musicLayer ?? payload?.musicLayer ?? '').trim().toLowerCase();
  const musicProminence = String(context?.musicProminence ?? payload?.musicProminence ?? '').trim().toLowerCase();
  const musicProfileSourceType = String(context?.musicProfileSourceType ?? payload?.musicProfileSourceType ?? '').trim().toLowerCase();
  const formationRole = String(context?.formationRole ?? payload?.formationRole ?? '').trim().toLowerCase();
  const phraseArchetype = String(context?.phraseArchetype ?? payload?.phraseArchetype ?? '').trim().toLowerCase();
  const reason = String(context?.reason ?? payload?.reason ?? '').trim().toLowerCase();
  const authoringClass = String(context?.authoringClass ?? payload?.authoringClass ?? '').trim().toLowerCase();
  const actionCategory = String(context?.actionCategory ?? payload?.actionCategory ?? '').trim().toLowerCase();
  const audioRequired = context?.audioRequired === true ? true : (payload?.audioRequired === true);
  const classificationReason = String(context?.classificationReason ?? payload?.classificationReason ?? '').trim().toLowerCase();
  const leadFamily = String(context?.leadFamily ?? payload?.leadFamily ?? '').trim().toLowerCase();
  const leadContourId = String(context?.leadContourId ?? payload?.leadContourId ?? '').trim().toLowerCase();
  const leadContourEpoch = clampInt(context?.leadContourEpoch ?? payload?.leadContourEpoch, 0, 0);
  const leadCadenceVariant = clampInt(context?.leadCadenceVariant ?? payload?.leadCadenceVariant, 0, 0);
  const sectionTransitionRole = String(context?.sectionTransitionRole ?? payload?.sectionTransitionRole ?? '').trim().toLowerCase();
  const sectionArcEpoch = clampInt(context?.sectionArcEpoch ?? payload?.sectionArcEpoch, 0, 0);
  const arrangementSupportIntent = String(context?.arrangementSupportIntent ?? payload?.arrangementSupportIntent ?? '').trim().toLowerCase();
  const arrangementSupportStepBudget = clampInt(context?.arrangementSupportStepBudget ?? payload?.arrangementSupportStepBudget, 0, 0);
  const foundationPatternKey = String(context?.foundationPatternKey ?? payload?.foundationPatternKey ?? '').trim().toLowerCase();
  const foundationPhraseId = String(context?.foundationPhraseId ?? payload?.foundationPhraseId ?? '').trim().toLowerCase();
  const derivedFoundationBassTrace = deriveFoundationPlayerBassTrace(foundationPhraseId, foundationPatternKey, barIndex);
  const foundationPlayerThemeSource = String(
    String(context?.foundationPlayerThemeSource ?? '').trim()
    || String(payload?.foundationPlayerThemeSource ?? '').trim()
    || derivedFoundationBassTrace?.foundationPlayerThemeSource
    || ''
  ).trim();
  const foundationRawPatternKey = String(
    String(context?.foundationRawPatternKey ?? '').trim()
    || String(payload?.foundationRawPatternKey ?? '').trim()
    || derivedFoundationBassTrace?.foundationRawPatternKey
    || ''
  ).trim().toLowerCase();
  const foundationShapedPatternKey = String(
    String(context?.foundationShapedPatternKey ?? '').trim()
    || String(payload?.foundationShapedPatternKey ?? '').trim()
    || derivedFoundationBassTrace?.foundationShapedPatternKey
    || foundationPatternKey
    || ''
  ).trim().toLowerCase();
  const foundationInterpretationMode = String(
    String(context?.foundationInterpretationMode ?? '').trim()
    || String(payload?.foundationInterpretationMode ?? '').trim()
    || derivedFoundationBassTrace?.foundationInterpretationMode
    || ''
  ).trim().toLowerCase();
  const foundationPhrasePartIndex = clampInt(
    derivedFoundationBassTrace?.foundationPhrasePartIndex
    ?? context?.foundationPhrasePartIndex
    ?? payload?.foundationPhrasePartIndex,
    0,
    0
  );
  const intensityAuditionSection = String(context?.intensityAuditionSection ?? payload?.intensityAuditionSection ?? '').trim().toLowerCase();
  const intensityCadenceStepAdmitted = context?.intensityCadenceStepAdmitted === true
    ? true
    : (payload?.intensityCadenceStepAdmitted === true);
  const intensityCadenceReason = String(context?.intensityCadenceReason ?? payload?.intensityCadenceReason ?? '').trim().toLowerCase();
  const leadMotifAnchorActive = context?.leadMotifAnchorActive === true ? true : (payload?.leadMotifAnchorActive === true);
  const leadMotifId = String(context?.leadMotifId ?? payload?.leadMotifId ?? '').trim().toLowerCase();
  const leadMotifRole = String(context?.leadMotifRole ?? payload?.leadMotifRole ?? '').trim().toLowerCase();
  const leadMotifStepIndex = clampInt(context?.leadMotifStepIndex ?? payload?.leadMotifStepIndex, -1, -1);
  const leadMotifAgeBars = clampInt(context?.leadMotifAgeBars ?? payload?.leadMotifAgeBars, 0, 0);
  const leadMotifReuseCount = clampInt(context?.leadMotifReuseCount ?? payload?.leadMotifReuseCount, 0, 0);
  const leadMotifReturnCount = clampInt(context?.leadMotifReturnCount ?? payload?.leadMotifReturnCount, 0, 0);
  const leadMotifVariationCount = clampInt(context?.leadMotifVariationCount ?? payload?.leadMotifVariationCount, 0, 0);
  const inferredPrimaryLeadThemeSource = musicLaneId === 'primary_loop_lane' ? 'leadTheme' : '';
  const inferredPrimaryLeadMode = (() => {
    if (musicLaneId !== 'primary_loop_lane') return '';
    if (intensityAuditionSection === 'build') return 'build_assemble';
    if (intensityAuditionSection === 'peak') return 'peak_riff';
    if (intensityAuditionSection === 'release') return 'release_riff';
    return 'director_riff';
  })();
  const leadPlayerThemeSource = String(
    String(context?.leadPlayerThemeSource ?? '').trim()
    || String(payload?.leadPlayerThemeSource ?? '').trim()
    || inferredPrimaryLeadThemeSource
  ).trim().toLowerCase();
  const leadThemeInterpretationMode = String(
    String(context?.leadThemeInterpretationMode ?? '').trim()
    || String(payload?.leadThemeInterpretationMode ?? '').trim()
    || inferredPrimaryLeadMode
  ).trim().toLowerCase();
  const leadThemePartIndex = clampInt(
    context?.leadThemePartIndex
      ?? payload?.leadThemePartIndex
      ?? (musicLaneId === 'primary_loop_lane' ? barIndex % 4 : 0),
    0,
    0
  );
  const leadThemeStepIndex = clampInt(
    context?.leadThemeStepIndex
      ?? payload?.leadThemeStepIndex
      ?? (musicLaneId === 'primary_loop_lane' ? stepIndex % 8 : 0),
    0,
    0
  );
  const leadThemePatternKey = String(context?.leadThemePatternKey ?? payload?.leadThemePatternKey ?? '').trim().toLowerCase();
  const leadThemeContourKey = String(context?.leadThemeContourKey ?? payload?.leadThemeContourKey ?? '').trim().toLowerCase();
  const leadThemeRawStepActive = context?.leadThemeRawStepActive === true ? true : (payload?.leadThemeRawStepActive === true);
  const leadThemeRawNote = String(context?.leadThemeRawNote ?? payload?.leadThemeRawNote ?? '').trim();
  return {
    tMs: nowMs(),
    phase: String(phase || '').trim() || 'queued',
    eventId: clampInt(ev.eventId, 0, 0),
    timestamp: Date.now(),
    barIndex,
    beatIndex,
    stepIndex,
    actorId: clampInt(ev.actorId, 0, 0),
    groupId: clampInt(context?.groupId ?? payload.groupId, 0, 0),
    role: String(ev.role || '').trim().toLowerCase(),
    note: requestedNote,
    noteResolved: resolvedNote,
    noteWasClamped,
    instrumentId: String(ev.instrumentId || '').trim(),
    actionType,
    threatClass: String(ev.threatClass || '').trim().toLowerCase(),
    pacingState: String(context?.pacingState || '').trim().toLowerCase(),
    paletteId: String(context?.paletteId || '').trim(),
    themeId: String(context?.themeId || '').trim(),
    sourceSystem,
    enemyType,
    expectedInstrumentLane,
    actualInstrumentLane,
    playerAudible,
    enemyAudible,
    visualSyncType: String(ev.visualSyncType || '').trim(),
    phraseGravityTarget,
    phraseGravityHit,
    phraseResolutionOpportunity,
    phraseResolutionHit,
    continuityId,
    musicLaneId,
    musicLanePhraseId,
    musicLanePatternKey,
    musicLanePlayerThemeSource,
    foundationLaneId,
    enemyVisualId,
    enemyRoleColor,
    playerCadenceMode,
    playerCadenceReason,
    callResponseLane,
    callResponseQualified,
    callResponsePhraseProgress,
    playerManualOverrideActive,
    musicLayer,
    musicProminence,
    musicProfileSourceType,
    formationRole,
    phraseArchetype,
    reason,
    authoringClass,
    actionCategory,
    audioRequired,
    classificationReason,
    leadFamily,
    leadContourId,
    leadContourEpoch,
    leadCadenceVariant,
    sectionTransitionRole,
    sectionArcEpoch,
    arrangementSupportIntent,
    arrangementSupportStepBudget,
    foundationPatternKey,
    foundationPhraseId,
    foundationPlayerThemeSource,
    foundationRawPatternKey,
    foundationShapedPatternKey,
    foundationInterpretationMode,
    foundationPhrasePartIndex,
    intensityAuditionSection,
    intensityCadenceStepAdmitted,
    intensityCadenceReason,
    leadMotifAnchorActive,
    leadMotifId,
    leadMotifRole,
    leadMotifStepIndex,
    leadMotifAgeBars,
    leadMotifReuseCount,
    leadMotifReturnCount,
    leadMotifVariationCount,
    leadPlayerThemeSource,
    leadThemeInterpretationMode,
    leadThemePartIndex,
    leadThemeStepIndex,
    leadThemePatternKey,
    leadThemeContourKey,
    leadThemeRawStepActive,
    leadThemeRawNote,
    audioGain: Number(context?.audioGain ?? payload?.audioGain) || 0,
    resolvedPlaybackInstrumentId: String(context?.resolvedPlaybackInstrumentId || '').trim(),
    playbackKind: String(context?.playbackKind || '').trim().toLowerCase(),
    sampleVolumeHint: String(context?.sampleVolumeHint || '').trim(),
    sampleVolumeMultiplier: Number(context?.sampleVolumeMultiplier) || 0,
    triggerVolume: Number(context?.triggerVolume) || 0,
    approxPlaybackVolume: Number(context?.approxPlaybackVolume) || 0,
    visibleCueAudibilityFloor: context?.visibleCueAudibilityFloor === true
      ? true
      : (payload?.visibleCueAudibilityFloor === true),
    entryPhraseAudibilityGrace: context?.entryPhraseAudibilityGrace === true
      ? true
      : (payload?.entryPhraseAudibilityGrace === true),
  };
}

function makeEnemyRemovalRecord(enemyLike, context, beatsPerBar) {
  const enemy = enemyLike && typeof enemyLike === 'object' ? enemyLike : {};
  const beatIndex = clampInt(context?.beatIndex, 0, 0);
  const barIndex = context?.barIndex != null
    ? clampInt(context.barIndex, Math.floor(beatIndex / Math.max(1, beatsPerBar)), 0)
    : Math.floor(beatIndex / Math.max(1, beatsPerBar));
  const reason = String(context?.reason || '').trim().toLowerCase() || 'unknown';
  return {
    tMs: nowMs(),
    timestamp: Date.now(),
    barIndex,
    beatIndex,
    stepIndex: clampInt(context?.stepIndex, 0, 0),
    actorId: clampInt(enemy?.id, 0, 0),
    groupId: clampInt(context?.groupId ?? enemy?.composerGroupId, 0, 0),
    enemyType: String(enemy?.enemyType || '').trim().toLowerCase(),
    reason,
    retireOrigin: String(context?.retireOrigin || '').trim().toLowerCase(),
    pacingState: String(context?.pacingState || '').trim().toLowerCase(),
    paletteId: String(context?.paletteId || '').trim(),
    themeId: String(context?.themeId || '').trim(),
  };
}

function makeSystemEventRecord(eventType, payloadLike, context, beatsPerBar) {
  const payload = payloadLike && typeof payloadLike === 'object' ? payloadLike : {};
  const beatIndex = clampInt(context?.beatIndex, 0, 0);
  const barIndex = context?.barIndex != null
    ? clampInt(context.barIndex, Math.floor(beatIndex / Math.max(1, beatsPerBar)), 0)
    : Math.floor(beatIndex / Math.max(1, beatsPerBar));
  return {
    tMs: nowMs(),
    timestamp: Date.now(),
    eventType: String(eventType || '').trim().toLowerCase(),
    phase: String(payload?.phase || '').trim().toLowerCase(),
    barIndex,
    beatIndex,
    stepIndex: clampInt(context?.stepIndex, 0, 0),
    continuityId: String(payload?.continuityId || context?.continuityId || '').trim(),
    sourceEnemyId: clampInt(payload?.sourceEnemyId, 0, 0),
    enemyId: clampInt(payload?.enemyId, 0, 0),
    sourceEnemyType: String(payload?.sourceEnemyType || '').trim().toLowerCase(),
    sourceGroupId: clampInt(payload?.sourceGroupId, 0, 0),
    groupId: clampInt(payload?.groupId, 0, 0),
    templateId: String(payload?.templateId || '').trim(),
    targetEnemyId: clampInt(payload?.targetEnemyId, 0, 0),
    targetEnemyType: String(payload?.targetEnemyType || '').trim().toLowerCase(),
    targetGroupId: clampInt(payload?.targetGroupId, 0, 0),
    laneId: String(payload?.laneId || '').trim().toLowerCase(),
    laneRole: String(payload?.laneRole || '').trim().toLowerCase(),
    callResponseLane: String(payload?.callResponseLane || '').trim().toLowerCase(),
    callResponseQualified: payload?.callResponseQualified === true
      ? true
      : (payload?.callResponseQualified === false ? false : null),
    role: String(payload?.role || '').trim().toLowerCase(),
    actionType: String(payload?.actionType || '').trim().toLowerCase(),
    instrumentId: String(payload?.instrumentId || '').trim(),
    stage: String(payload?.stage || '').trim().toLowerCase(),
    allowed: payload?.allowed === true,
    rhythmFamily: String(payload?.rhythmFamily || '').trim().toLowerCase(),
    lane: String(payload?.lane || '').trim().toLowerCase(),
    stepInBar: clampInt(payload?.stepInBar, 0, 0),
    barInPhrase: clampInt(payload?.barInPhrase, 0, 0),
    allowedSteps: String(payload?.allowedSteps || '').trim().toLowerCase(),
    allowedCount: clampInt(payload?.allowedCount, 0, 0),
    blockedCount: clampInt(payload?.blockedCount, 0, 0),
    inputCount: clampInt(payload?.inputCount, 0, 0),
    outputCount: clampInt(payload?.outputCount, 0, 0),
    musicVoiceKey: String(payload?.musicVoiceKey || '').trim().toLowerCase(),
    musicLayer: String(payload?.musicLayer || '').trim().toLowerCase(),
    phraseId: String(payload?.phraseId || '').trim().toLowerCase(),
    patternKey: String(payload?.patternKey || '').trim(),
    performerEnemyId: clampInt(payload?.performerEnemyId, 0, 0),
    performerGroupId: clampInt(payload?.performerGroupId, 0, 0),
    performerType: String(payload?.performerType || '').trim().toLowerCase(),
    previousContinuityId: String(payload?.previousContinuityId || '').trim(),
    previousInstrumentId: String(payload?.previousInstrumentId || '').trim(),
    continuityClass: String(payload?.continuityClass || '').trim().toLowerCase(),
    laneScope: String(payload?.laneScope || '').trim().toLowerCase(),
    sourceKey: String(payload?.sourceKey || '').trim().toLowerCase(),
    cause: String(payload?.cause || '').trim().toLowerCase(),
    motifScopeKey: String(payload?.motifScopeKey || '').trim().toLowerCase(),
    previousMotifScopeKey: String(payload?.previousMotifScopeKey || '').trim().toLowerCase(),
    leadMotifId: String(payload?.leadMotifId || payload?.motifId || '').trim().toLowerCase(),
    leadMotifRole: String(payload?.leadMotifRole || payload?.phase || '').trim().toLowerCase(),
    leadMotifAnchorActive: payload?.leadMotifAnchorActive === true || String(eventType || '').trim().toLowerCase() === 'music_lead_motif_anchor',
    leadMotifStepIndex: clampInt(payload?.leadMotifStepIndex ?? payload?.motifStepIndex, -1, -1),
    leadMotifAgeBars: clampInt(payload?.leadMotifAgeBars ?? payload?.motifAgeBars, 0, 0),
    leadMotifReuseCount: clampInt(payload?.leadMotifReuseCount ?? payload?.reuseCount, 0, 0),
    leadMotifReturnCount: clampInt(payload?.leadMotifReturnCount ?? payload?.returnCount, 0, 0),
    leadMotifVariationCount: clampInt(payload?.leadMotifVariationCount ?? payload?.variationCount, 0, 0),
    intent: String(payload?.intent || '').trim().toLowerCase(),
    motifEpoch: clampInt(payload?.motifEpoch, 0, 0),
    requestedLockIndex: clampInt(payload?.requestedLockIndex, 0, 0),
    effectiveLockIndex: clampInt(payload?.effectiveLockIndex, 0, 0),
    lookbackLocks: clampInt(payload?.lookbackLocks, 0, 0),
    returnActive: payload?.returnActive === true,
    liveSnakeCount: clampInt(payload?.liveSnakeCount, 0, 0),
    matchingScopeSnakeCount: clampInt(payload?.matchingScopeSnakeCount, 0, 0),
    primaryLoopUsesScope: payload?.primaryLoopUsesScope === true,
    lifecycleState: String(payload?.lifecycleState || '').trim().toLowerCase(),
    previousLifecycleState: String(payload?.previousLifecycleState || '').trim().toLowerCase(),
    previousActorId: clampInt(payload?.previousActorId, 0, 0),
    previousGroupId: clampInt(payload?.previousGroupId, 0, 0),
    previousPhraseId: String(payload?.previousPhraseId || '').trim().toLowerCase(),
    previousPatternKey: String(payload?.previousPatternKey || '').trim(),
    identityChangeReason: String(payload?.identityChangeReason || '').trim().toLowerCase(),
    previousIdentityChangeReason: String(payload?.previousIdentityChangeReason || '').trim().toLowerCase(),
    sectionId: String(payload?.sectionId || '').trim().toLowerCase(),
    sectionLabel: String(payload?.sectionLabel || '').trim(),
    hpSectionId: String(payload?.hpSectionId || '').trim().toLowerCase(),
    hpSectionLabel: String(payload?.hpSectionLabel || '').trim(),
    hpMultiplier: Number(payload?.hpMultiplier) || 0,
    spawnMaxHp: Number(payload?.spawnMaxHp) || 0,
    baseSpawnMaxHp: Number(payload?.baseSpawnMaxHp) || 0,
    startBar: clampInt(payload?.startBar, 0, 0),
    endBar: payload?.endBar == null ? null : clampInt(payload?.endBar, 0, 0),
    hpSectionStartBar: payload?.hpSectionStartBar == null ? null : clampInt(payload?.hpSectionStartBar, 0, 0),
    hpSectionEndBar: payload?.hpSectionEndBar == null ? null : clampInt(payload?.hpSectionEndBar, 0, 0),
    waitSteps: clampInt(payload?.waitSteps, 0, 0),
    callStepAbs: clampInt(payload?.callStepAbs, 0, -1),
    lastResponseStepAbs: clampInt(payload?.lastResponseStepAbs, 0, -1),
    pendingCallExpiresStepAbs: clampInt(payload?.pendingCallExpiresStepAbs, 0, -1),
    activeResponseGroupId: clampInt(payload?.activeResponseGroupId, 0, 0),
    performerCount: clampInt(payload?.performerCount, 0, 0),
    stepInPhrase: clampInt(payload?.stepInPhrase, 0, 0),
    strongCallCandidate: payload?.strongCallCandidate === true,
    acceptedStrongCall: payload?.acceptedStrongCall === true,
    hasLiveCallWindow: payload?.hasLiveCallWindow === true,
    continuingResponsePhrase: payload?.continuingResponsePhrase === true,
    responseOverrideHit: payload?.responseOverrideHit === true,
    admissionReason: String(payload?.admissionReason || '').trim().toLowerCase(),
    stepsUntilBoundary: clampInt(payload?.stepsUntilBoundary, 0, 0),
    waitStepsBeforeReplace: clampInt(payload?.waitStepsBeforeReplace, 0, 0),
    deferredBeatIndex: clampInt(payload?.deferredBeatIndex, 0, 0),
    deferredStepIndex: clampInt(payload?.deferredStepIndex, 0, 0),
    replacedPending: payload?.replacedPending === true,
    previousPerformerEnemyId: clampInt(payload?.previousPerformerEnemyId, 0, 0),
    previousPerformerGroupId: clampInt(payload?.previousPerformerGroupId, 0, 0),
    previousPerformerType: String(payload?.previousPerformerType || '').trim().toLowerCase(),
    selectedPrimaryEnemyId: clampInt(payload?.selectedPrimaryEnemyId, 0, 0),
    aliveEnemyIdsCsv: String(payload?.aliveEnemyIdsCsv || '').trim(),
    visibleEnemyIdsCsv: String(payload?.visibleEnemyIdsCsv || '').trim(),
    performerEnemyIdsCsv: String(payload?.performerEnemyIdsCsv || '').trim(),
    ownerChanged: payload?.ownerChanged === true,
    continuityChanged: payload?.continuityChanged === true,
    continuityPreserved: payload?.continuityPreserved === true,
    instrumentChanged: payload?.instrumentChanged === true,
    phraseChanged: payload?.phraseChanged === true,
    patternChanged: payload?.patternChanged === true,
    performerTypeChanged: payload?.performerTypeChanged === true,
    identityPreserved: payload?.identityPreserved === true,
    intentionalIdentityChange: payload?.intentionalIdentityChange === true,
    driftDetected: payload?.driftDetected === true,
    actorId: clampInt(payload?.actorId, 0, 0),
    phraseStep: clampInt(payload?.phraseStep, 0, 0),
    barPosition: clampInt(payload?.barPosition, 0, 0),
    sectionId: String(payload?.sectionId || '').trim().toLowerCase(),
    sectionCycle: clampInt(payload?.sectionCycle, 0, 0),
    previousSectionId: String(payload?.previousSectionId || '').trim().toLowerCase(),
    previousSectionCycle: clampInt(payload?.previousSectionCycle, 0, 0),
    sectionDurationBars: clampInt(payload?.sectionDurationBars, 0, 0),
    previousIntensity: Number(payload?.previousIntensity) || 0,
    intensity: Number(payload?.intensity) || 0,
    intent: String(payload?.intent || '').trim().toLowerCase(),
    sourceEnergyState: String(payload?.sourceEnergyState || '').trim().toLowerCase(),
    stateStartBar: clampInt(payload?.stateStartBar, 0, -1),
    stateAgeBars: clampInt(payload?.stateAgeBars, 0, 0),
    preDropActive: payload?.preDropActive === true,
    preDropBarsRemaining: clampInt(payload?.preDropBarsRemaining, 0, -1),
    barsUntilBreak: clampInt(payload?.barsUntilBreak, 0, -1),
    authoritySource: String(payload?.authoritySource || '').trim().toLowerCase(),
    fallbackUsed: payload?.fallbackUsed === true,
    tonicRootNote: String(payload?.tonicRootNote || '').trim(),
    rootNote: String(payload?.rootNote || '').trim(),
    transposeSemitones: clampInt(payload?.transposeSemitones, 0, -24),
    relativeShiftActive: payload?.relativeShiftActive === true,
    authorityWeaponSlotIndex: clampInt(payload?.authorityWeaponSlotIndex, -1, -1),
    authorityDistinctNoteCount: clampInt(payload?.authorityDistinctNoteCount, 0, 0),
    authorityActiveNoteCount: clampInt(payload?.authorityActiveNoteCount, 0, 0),
    notePoolSize: clampInt(payload?.notePoolSize, 0, 0),
    scheduledBeatIndex: clampInt(payload?.scheduledBeatIndex, 0, 0),
    scheduledStepIndex: clampInt(payload?.scheduledStepIndex, 0, -1),
    flushOffsetMs: Number(payload?.flushOffsetMs) || 0,
    flushOffsetAbsMs: Number(payload?.flushOffsetAbsMs) || 0,
    targetAudioTime: Number(payload?.targetAudioTime) || 0,
    flushAudioTime: Number(payload?.flushAudioTime) || 0,
    weaponMappingMismatchCount: clampInt(payload?.weaponMappingMismatchCount, 0, 0),
    weaponMappingMismatchNotes: Array.isArray(payload?.weaponMappingMismatchNotes)
      ? payload.weaponMappingMismatchNotes.slice(0, 12).map((note) => String(note || '').trim()).filter(Boolean)
      : [],
    weaponOutsidePoolCount: clampInt(payload?.weaponOutsidePoolCount, 0, 0),
    weaponOutsidePoolNotes: Array.isArray(payload?.weaponOutsidePoolNotes)
      ? payload.weaponOutsidePoolNotes.slice(0, 12).map((note) => String(note || '').trim()).filter(Boolean)
      : [],
    previousVoiceDensity: clampInt(payload?.previousVoiceDensity, 0, 0),
    auditId: String(payload?.auditId || '').trim().toLowerCase(),
    themeId: String(payload?.themeId || '').trim(),
    toyKey: String(payload?.toyKey || '').trim().toLowerCase(),
    eligibleCount: clampInt(payload?.eligibleCount, 0, 0),
    unusedEligibleCount: clampInt(payload?.unusedEligibleCount, 0, 0),
    priorityEligibleCount: clampInt(payload?.priorityEligibleCount, 0, 0),
    unreachableCount: clampInt(payload?.unreachableCount, 0, 0),
    eligibleIds: Array.isArray(payload?.eligibleIds) ? payload.eligibleIds.slice(0, 16).map((id) => String(id || '').trim()).filter(Boolean) : [],
    unusedEligibleIds: Array.isArray(payload?.unusedEligibleIds) ? payload.unusedEligibleIds.slice(0, 16).map((id) => String(id || '').trim()).filter(Boolean) : [],
    priorityEligibleIds: Array.isArray(payload?.priorityEligibleIds) ? payload.priorityEligibleIds.slice(0, 16).map((id) => String(id || '').trim()).filter(Boolean) : [],
    unreachableIds: Array.isArray(payload?.unreachableIds) ? payload.unreachableIds.slice(0, 16).map((id) => String(id || '').trim()).filter(Boolean) : [],
    voiceDensity: clampInt(payload?.voiceDensity, 0, 0),
    gameplayBefore: payload?.gameplayBefore && typeof payload.gameplayBefore === 'object'
      ? {
        enemyCount: clampInt(payload.gameplayBefore.enemyCount, 0, 0),
        projectileCount: clampInt(payload.gameplayBefore.projectileCount, 0, 0),
        activeRoleCount: clampInt(payload.gameplayBefore.activeRoleCount, 0, 0),
        totalThreatUsage: clampInt(payload.gameplayBefore.totalThreatUsage, 0, 0),
      }
      : null,
    gameplayAfter: payload?.gameplayAfter && typeof payload.gameplayAfter === 'object'
      ? {
        enemyCount: clampInt(payload.gameplayAfter.enemyCount, 0, 0),
        projectileCount: clampInt(payload.gameplayAfter.projectileCount, 0, 0),
        activeRoleCount: clampInt(payload.gameplayAfter.activeRoleCount, 0, 0),
        totalThreatUsage: clampInt(payload.gameplayAfter.totalThreatUsage, 0, 0),
      }
      : null,
    gameplayDeltaEnemyCount: clampInt(payload?.gameplayDeltaEnemyCount, 0, 0),
    gameplayDeltaProjectileCount: clampInt(payload?.gameplayDeltaProjectileCount, 0, 0),
    gameplayDeltaRoleCount: clampInt(payload?.gameplayDeltaRoleCount, 0, 0),
    gameplayDeltaThreatUsage: clampInt(payload?.gameplayDeltaThreatUsage, 0, 0),
    gameplayDeltaMixShift: Number(payload?.gameplayDeltaMixShift) || 0,
    gameplayDeltaSignificant: payload?.gameplayDeltaSignificant === true,
    meaningfulTransitionEligible: payload?.meaningfulTransitionEligible === true,
    visualFailureReasons: Array.isArray(payload?.visualFailureReasons)
      ? payload.visualFailureReasons.map((s) => String(s || '').trim().toLowerCase()).filter((s) => s)
      : [],
    meaningfulTransitionReasons: Array.isArray(payload?.meaningfulTransitionReasons)
      ? payload.meaningfulTransitionReasons.map((s) => String(s || '').trim().toLowerCase()).filter((s) => s)
      : [],
    meaningfulTransitionFailedReasons: Array.isArray(payload?.meaningfulTransitionFailedReasons)
      ? payload.meaningfulTransitionFailedReasons.map((s) => String(s || '').trim().toLowerCase()).filter((s) => s)
      : [],
    transitionPreferred: payload?.transitionPreferred === true,
    gameplayMeaningful: payload?.gameplayMeaningful === true,
    musicalMeaningful: payload?.musicalMeaningful === true,
    headingTitle: String(payload?.headingTitle || '').trim(),
    headingSubtitle: String(payload?.headingSubtitle || '').trim(),
    headingFlavorTag: String(payload?.headingFlavorTag || '').trim().toLowerCase(),
    headingFlavorText: String(payload?.headingFlavorText || '').trim(),
    levelTitle: String(payload?.levelTitle || '').trim(),
    levelSubtitle: String(payload?.levelSubtitle || '').trim(),
    levelFlavorText: String(payload?.levelFlavorText || '').trim(),
    reason: String(payload?.reason || '').trim().toLowerCase(),
    failureReason: String(payload?.failureReason || '').trim().toLowerCase(),
    active: payload?.active === true,
    retiring: payload?.retiring === true,
    assignedAtBeat: clampInt(payload?.assignedAtBeat, -1, -1),
    transferCount: clampInt(payload?.transferCount, 0, 0),
    loopIdentity: String(payload?.loopIdentity || '').trim().toLowerCase(),
    requestedProminence: String(payload?.requestedProminence || '').trim().toLowerCase(),
    finalProminence: String(payload?.finalProminence || '').trim().toLowerCase(),
    formationRole: String(payload?.formationRole || '').trim().toLowerCase(),
    phraseArchetype: String(payload?.phraseArchetype || '').trim().toLowerCase(),
    phraseArchetypeProgress: Number(payload?.phraseArchetypeProgress) || 0,
    phraseArchetypeStep: clampInt(payload?.phraseArchetypeStep, 0, 0),
    phraseArchetypeSteps: clampInt(payload?.phraseArchetypeSteps, 0, 0),
    formationArchetype: String(payload?.formationArchetype || '').trim().toLowerCase(),
    formationStyleFamily: String(payload?.formationStyleFamily || '').trim().toLowerCase(),
    formationSpawnRegion: String(payload?.formationSpawnRegion || '').trim().toLowerCase(),
    formationSpacingProfile: String(payload?.formationSpacingProfile || '').trim().toLowerCase(),
    formationSymmetry: String(payload?.formationSymmetry || '').trim().toLowerCase(),
    formationPresentationWeight: Number(payload?.formationPresentationWeight) || 0,
    formationMergeProtectionActive: payload?.formationMergeProtectionActive === true,
    formationDesiredMemberCount: clampInt(payload?.formationDesiredMemberCount, 0, 0),
    behavioralFormationArchetype: String(payload?.behavioralFormationArchetype || '').trim().toLowerCase(),
    behavioralFormationClass: String(payload?.behavioralFormationClass || '').trim().toLowerCase(),
    behavioralFormationActivationMode: String(payload?.behavioralFormationActivationMode || '').trim().toLowerCase(),
    behavioralFormationIntensity: Number(payload?.behavioralFormationIntensity) || 0,
    behavioralFormationActive: payload?.behavioralFormationActive === true,
    singleBehaviorId: String(payload?.singleBehaviorId || '').trim().toLowerCase(),
    groupBehaviorId: String(payload?.groupBehaviorId || '').trim().toLowerCase(),
    eventBehaviorId: String(payload?.eventBehaviorId || '').trim().toLowerCase(),
    behaviorPriority: String(payload?.behaviorPriority || '').trim().toLowerCase(),
    behaviorWindow: String(payload?.behaviorWindow || '').trim().toLowerCase(),
    behaviorSource: String(payload?.behaviorSource || '').trim().toLowerCase(),
    singleBehaviorWindow: String(payload?.singleBehaviorWindow || '').trim().toLowerCase(),
    groupBehaviorWindow: String(payload?.groupBehaviorWindow || '').trim().toLowerCase(),
    eventBehaviorWindow: String(payload?.eventBehaviorWindow || '').trim().toLowerCase(),
    activeEventSection: String(payload?.activeEventSection || '').trim().toLowerCase(),
    eventBehaviorClass: String(payload?.eventBehaviorClass || '').trim().toLowerCase(),
    actionCategory: String(payload?.actionCategory || '').trim().toLowerCase(),
    audioRequired: payload?.audioRequired === true,
    classificationReason: String(payload?.classificationReason || '').trim().toLowerCase(),
    enteredBar: clampInt(payload?.enteredBar, -1, -1),
    endBar: clampInt(payload?.endBar, -1, -1),
    strongBeatActive: payload?.strongBeatActive === true,
    motionDamping: Number(payload?.motionDamping) || 0,
    agitationBoost: Number(payload?.agitationBoost) || 0,
    presentationPulseScale: Number(payload?.presentationPulseScale) || 0,
    eligibleRoles: Array.isArray(payload?.eligibleRoles)
      ? payload.eligibleRoles.map((s) => String(s || '').trim().toLowerCase()).filter(Boolean)
      : [],
    readableRoles: Array.isArray(payload?.readableRoles)
      ? payload.readableRoles.map((s) => String(s || '').trim().toLowerCase()).filter(Boolean)
      : [],
    distinctReadableRoleCount: clampInt(payload?.distinctReadableRoleCount, 0, 0),
    formationReadableRoles: Array.isArray(payload?.formationReadableRoles)
      ? payload.formationReadableRoles.map((s) => String(s || '').trim().toLowerCase()).filter(Boolean)
      : [],
    formationReadableRoleCount: clampInt(payload?.formationReadableRoleCount, 0, 0),
    formationFoundationVisualWeight: Number(payload?.formationFoundationVisualWeight) || 0,
    formationSupportVisualWeight: Number(payload?.formationSupportVisualWeight) || 0,
    formationLeadVisualWeight: Number(payload?.formationLeadVisualWeight) || 0,
    formationOrnamentVisualWeight: Number(payload?.formationOrnamentVisualWeight) || 0,
    formationSupportCollapsedDuringLead: payload?.formationSupportCollapsedDuringLead === true,
    formationLeadWithSupportVisible: payload?.formationLeadWithSupportVisible === true,
    formationThreeRoleReadable: payload?.formationThreeRoleReadable === true,
    formationArchetypesCsv: String(payload?.formationArchetypesCsv || '').trim().toLowerCase(),
    foundationVisualWeight: Number(payload?.foundationVisualWeight) || 0,
    supportVisualWeight: Number(payload?.supportVisualWeight) || 0,
    leadVisualWeight: Number(payload?.leadVisualWeight) || 0,
    ornamentVisualWeight: Number(payload?.ornamentVisualWeight) || 0,
    supportCollapsedDuringLead: payload?.supportCollapsedDuringLead === true,
    leadWithSupportVisible: payload?.leadWithSupportVisible === true,
    threeRoleReadable: payload?.threeRoleReadable === true,
    changedByDeconflict: payload?.changedByDeconflict === true,
    playerLikelyAudible: payload?.playerLikelyAudible === true,
    foundationAssignedBefore: payload?.foundationAssignedBefore === true,
    foundationAssignedAfter: payload?.foundationAssignedAfter === true,
    enemyIndex: clampInt(payload?.enemyIndex, 0, 0),
    totalEnemyEvents: clampInt(payload?.totalEnemyEvents, 0, 0),
    onboardingPhase: String(payload?.onboardingPhase || '').trim().toLowerCase(),
    readability: payload?.readability && typeof payload.readability === 'object'
      ? {
        playerMaskingRisk: Number(payload.readability.playerMaskingRisk) || 0,
        sameRegisterOverlapRisk: Number(payload.readability.sameRegisterOverlapRisk) || 0,
        playerAudibleShare: Number(payload.readability.playerAudibleShare) || 0,
        enemyForegroundEvents: clampInt(payload.readability.enemyForegroundEvents, 0, 0),
        enemyNonFoundationForegroundEvents: clampInt(payload.readability.enemyNonFoundationForegroundEvents, 0, 0),
        enemyEvents: clampInt(payload.readability.enemyEvents, 0, 0),
        enemyCompetingDuringPlayer: clampInt(payload.readability.enemyCompetingDuringPlayer, 0, 0),
      }
      : null,
    structure: payload?.structure && typeof payload.structure === 'object'
      ? {
        foundationContinuityBars: clampInt(payload.structure.foundationContinuityBars, 0, 0),
        foundationAudibleEvents: clampInt(payload.structure.foundationAudibleEvents, 0, 0),
        loopAudibleEvents: clampInt(payload.structure.loopAudibleEvents, 0, 0),
        sparkleAudibleEvents: clampInt(payload.structure.sparkleAudibleEvents, 0, 0),
        sparkleSuppressedEvents: clampInt(payload.structure.sparkleSuppressedEvents, 0, 0),
        sectionId: String(payload.structure.sectionId || '').trim().toLowerCase(),
      }
      : null,
    onboarding: payload?.onboarding && typeof payload.onboarding === 'object'
      ? {
        knownIdentityCount: clampInt(payload.onboarding.knownIdentityCount, 0, 0),
        recentNovelIdentityCount: clampInt(payload.onboarding.recentNovelIdentityCount, 0, 0),
      }
      : null,
    laneOwnership: payload?.laneOwnership && typeof payload.laneOwnership === 'object'
      ? {
        foundation: makeLaneOwnershipRecord(payload.laneOwnership.foundation),
        primaryLoop: makeLaneOwnershipRecord(payload.laneOwnership.primaryLoop),
        secondaryLoop: makeLaneOwnershipRecord(payload.laneOwnership.secondaryLoop),
      }
      : null,
    chainEventId: clampInt(payload?.chainEventId, 0, 0),
    weaponSlotIndex: clampInt(payload?.weaponSlotIndex, -1, -1),
    scheduledBeatIndex: clampInt(payload?.scheduledBeatIndex, 0, 0),
    impactEnemyId: clampInt(payload?.impactEnemyId, 0, 0),
    damageScale: Number(payload?.damageScale) || 0,
    detonationSource: String(payload?.detonationSource || '').trim().toLowerCase(),
    activeLevelPhase: String(payload?.activeLevelPhase || '').trim().toLowerCase(),
    phaseVariant: String(payload?.phaseVariant || '').trim().toLowerCase(),
    epochId: String(payload?.epochId || '').trim(),
    allowedRolesCsv: String(payload?.allowedRolesCsv || '').trim().toLowerCase(),
    supportPatternBudget: String(payload?.supportPatternBudget || '').trim().toLowerCase(),
    preferredSupportStepIndicesCsv: String(payload?.preferredSupportStepIndicesCsv || '').trim().toLowerCase(),
    supportPunctuationEpoch: clampInt(payload?.supportPunctuationEpoch, 0, 0),
    preferredCounterRhythmFamily: String(payload?.preferredCounterRhythmFamily || '').trim().toLowerCase(),
    answerPolicy: String(payload?.answerPolicy || '').trim().toLowerCase(),
    allowSparkle: payload?.allowSparkle === true,
    answerWindowActive: payload?.answerWindowActive === true,
    cadenceWindowActive: payload?.cadenceWindowActive === true,
    stableWindow: payload?.stableWindow === true,
    contractFoundationActive: payload?.contractFoundationActive === true,
    contractSecondaryLoopActive: payload?.contractSecondaryLoopActive === true,
    contractPrimaryLoopActive: payload?.contractPrimaryLoopActive === true,
    contractSparkleActive: payload?.contractSparkleActive === true,
    contractSupportActive: payload?.contractSupportActive === true,
    contractAnswerActive: payload?.contractAnswerActive === true,
    intensityAuditionSection: String(payload?.intensityAuditionSection || '').trim().toLowerCase(),
    laneIntensityScale: Number(payload?.laneIntensityScale) || 0,
    phraseIntent: String(payload?.phraseIntent || '').trim().toLowerCase(),
    arrangementEnergy: Number(payload?.energy ?? payload?.arrangementEnergy) || 0,
    arrangementLayering: Number(payload?.layering ?? payload?.arrangementLayering) || 0,
    arrangementRhythmicComplexity: Number(payload?.rhythmicComplexity ?? payload?.arrangementRhythmicComplexity) || 0,
    arrangementMelodicActivity: Number(payload?.melodicActivity ?? payload?.arrangementMelodicActivity) || 0,
    arrangementOrnamentation: Number(payload?.ornamentation ?? payload?.arrangementOrnamentation) || 0,
    arrangementStability: Number(payload?.stability ?? payload?.arrangementStability) || 0,
    arrangementSectionIntent: String(payload?.sectionIntent || '').trim().toLowerCase(),
    arrangementTensionProfile: String(payload?.tensionProfile || '').trim().toLowerCase(),
    arrangementSupportPatternBudget: String(payload?.supportPatternBudget || '').trim().toLowerCase(),
    arrangementCombatPressure: Number(payload?.combatPressure) || 0,
    arrangementMusicalPressure: Number(payload?.musicalPressure) || 0,
    intensityAuditionSection: String(payload?.intensityAuditionSection || '').trim().toLowerCase(),
    intensityAuditionBar: clampInt(payload?.auditionBar, -1, -1),
    intensityAuditionIntroBars: clampInt(payload?.introBars, 0, 0),
    arrangementLaneIntensityScale: Number(payload?.laneIntensityScale) || 0,
    phaseValidity: String(payload?.phaseValidity || '').trim().toLowerCase(),
    phaseEnteredBar: clampInt(payload?.phaseEnteredBar, -1, -1),
    earliestTransitionBar: clampInt(payload?.earliestTransitionBar, 0, 0),
    preferredTransitionWindowStartBar: clampInt(payload?.preferredTransitionWindowStartBar, 0, 0),
    preferredTransitionWindowEndBar: clampInt(payload?.preferredTransitionWindowEndBar, 0, 0),
    timeInPhaseBars: clampInt(payload?.timeInPhaseBars, 0, 0),
    transitionWindowOpen: payload?.transitionWindowOpen === true,
    readyToAdvance: payload?.readyToAdvance === true,
    holdReason: String(payload?.holdReason || '').trim().toLowerCase(),
    readinessFailures: Array.isArray(payload?.readinessFailures)
      ? payload.readinessFailures.map((s) => String(s || '').trim().toLowerCase()).filter((s) => s)
      : [],
    timeoutBar: clampInt(payload?.timeoutBar, 0, 0),
    degradedPhaseVariant: String(payload?.degradedPhaseVariant || '').trim().toLowerCase(),
    fallbackPhase: String(payload?.fallbackPhase || '').trim().toLowerCase(),
    unmetHardRequirements: Array.isArray(payload?.unmetHardRequirements)
      ? payload.unmetHardRequirements.map((s) => String(s || '').trim().toLowerCase()).filter((s) => s)
      : [],
    unmetSoftRequirements: Array.isArray(payload?.unmetSoftRequirements)
      ? payload.unmetSoftRequirements.map((s) => String(s || '').trim().toLowerCase()).filter((s) => s)
      : [],
    activeAbortConditions: Array.isArray(payload?.activeAbortConditions)
      ? payload.activeAbortConditions.map((s) => String(s || '').trim().toLowerCase()).filter((s) => s)
      : [],
    degradeApplied: payload?.degradeApplied === true,
    fallbackPending: payload?.fallbackPending === true,
    leadMergeStableBars: clampInt(payload?.leadMergeStableBars, 0, 0),
    activeDirectorPhase: String(payload?.activeDirectorPhase || '').trim().toLowerCase(),
    activeMusicMode: String(payload?.activeMusicMode || '').trim().toLowerCase(),
    canonicalLeadGroupId: clampInt(payload?.canonicalLeadGroupId, 0, 0),
    canonicalLeadContinuityId: String(payload?.canonicalLeadContinuityId || '').trim(),
    canonicalLeadInstrumentId: String(payload?.canonicalLeadInstrumentId || '').trim(),
    introStage: String(payload?.introStage || '').trim().toLowerCase(),
    targetPressure: Number(payload?.targetPressure) || 0,
    targetAliveMin: clampInt(payload?.targetAliveMin, 0, 0),
    targetAliveMax: clampInt(payload?.targetAliveMax, 0, 0),
    difficultyRamp: Number(payload?.difficultyRamp) || 0,
    arrangementRamp: Number(payload?.arrangementRamp) || 0,
    totalAlive: clampInt(payload?.totalAlive, 0, 0),
    desiredLaneRoles: Array.isArray(payload?.desiredLaneRoles)
      ? payload.desiredLaneRoles.map((s) => String(s || '').trim().toLowerCase()).filter((s) => s)
      : [],
    preferredEnemyFamilies: Array.isArray(payload?.preferredEnemyFamilies)
      ? payload.preferredEnemyFamilies.map((s) => String(s || '').trim().toLowerCase()).filter((s) => s)
      : [],
    suppressedEnemyFamilies: Array.isArray(payload?.suppressedEnemyFamilies)
      ? payload.suppressedEnemyFamilies.map((s) => String(s || '').trim().toLowerCase()).filter((s) => s)
      : [],
    behaviorIntensityTier: String(payload?.behaviorIntensityTier || '').trim().toLowerCase(),
    singleBehaviorDensity: Number(payload?.singleBehaviorDensity) || 0,
    groupBehaviorDensity: Number(payload?.groupBehaviorDensity) || 0,
    eventBehaviorEligibility: String(payload?.eventBehaviorEligibility || '').trim().toLowerCase(),
    behaviorNoveltyBias: Number(payload?.behaviorNoveltyBias) || 0,
    behaviorAssignmentByRole: payload?.behaviorAssignmentByRole && typeof payload.behaviorAssignmentByRole === 'object'
      ? { ...payload.behaviorAssignmentByRole }
      : {},
    activeEventBehaviorId: String(payload?.activeEventBehaviorId || '').trim().toLowerCase(),
    varietyPressureByFamily: payload?.varietyPressureByFamily && typeof payload.varietyPressureByFamily === 'object'
      ? { ...payload.varietyPressureByFamily }
      : {},
    targetCarrierCounts: payload?.targetCarrierCounts && typeof payload.targetCarrierCounts === 'object'
      ? { ...payload.targetCarrierCounts }
      : {},
    cycleBeat: clampInt(payload?.cycleBeat, 0, 0),
    cycleIndex: clampInt(payload?.cycleIndex, 0, 0),
    allPairsReady: payload?.allPairsReady === true,
    pairCenterX: Number(payload?.pairCenterX) || 0,
    pairCenterY: Number(payload?.pairCenterY) || 0,
    targetX: Number(payload?.targetX) || 0,
    targetY: Number(payload?.targetY) || 0,
    desiredVx: Number(payload?.desiredVx) || 0,
    desiredVy: Number(payload?.desiredVy) || 0,
    postBlendVx: Number(payload?.postBlendVx) || 0,
    postBlendVy: Number(payload?.postBlendVy) || 0,
    orbitAngle: Number(payload?.orbitAngle) || 0,
    debugFrame: clampInt(payload?.debugFrame, 0, 0),
  };
}

function summarizeSystemEvent(sessionLike, record) {
  const session = sessionLike && typeof sessionLike === 'object' ? sessionLike : null;
  const rec = record && typeof record === 'object' ? record : {};
  if (!session) return;
  if (!session.systemEventSummary || typeof session.systemEventSummary !== 'object') {
    session.systemEventSummary = {
      byType: {},
      rawStoredByType: {},
      rawSuppressedByType: {},
      spawnerPipeline: {
        spawnerGameplayEvents: 0,
        spawnerAudioEvents: 0,
        spawnerAudioMutedEvents: 0,
        spawnerVisualEvents: 0,
        spawnerLoopgridEvents: 0,
        spawnerPipelineMismatches: 0,
      },
      foundationProminence: {
        total: 0,
        full: 0,
        quiet: 0,
        trace: 0,
        suppressed: 0,
        changedByDeconflict: 0,
      },
      slotSpawnerStages: {
        rawPulse: 0,
        rawBackbeat: 0,
        queuedPulse: 0,
        queuedBackbeat: 0,
        drainedPulse: 0,
        drainedBackbeat: 0,
        filteredPulse: 0,
        filteredBackbeat: 0,
        shapedPulse: 0,
        shapedBackbeat: 0,
        executedPulse: 0,
        executedBackbeat: 0,
      },
      slotSpawnerLoopState: {
        totalChanges: 0,
        introProtectedChanges: 0,
        blendWindowChanges: 0,
        pulseChanges: 0,
        backbeatChanges: 0,
      },
      introDrumFirstNote: {
        events: 0,
        offC3Events: 0,
      },
      laneCarrierContinuity: {
        transferred: 0,
        unbound: 0,
        systemVoice: 0,
        vacant: 0,
      },
      handoffVisualFailures: {},
    };
  }
  const type = String(rec?.eventType || '').trim().toLowerCase();
  if (!type) return;
  const byType = session.systemEventSummary.byType;
  byType[type] = clampInt(byType[type], 0, 0) + 1;
  if (type === 'music_spawner_gameplay_event') {
    session.systemEventSummary.spawnerPipeline.spawnerGameplayEvents += 1;
  } else if (type === 'music_spawner_audio_event') {
    session.systemEventSummary.spawnerPipeline.spawnerAudioEvents += 1;
  } else if (type === 'music_spawner_audio_muted') {
    session.systemEventSummary.spawnerPipeline.spawnerAudioMutedEvents += 1;
  } else if (type === 'music_spawner_visual_event') {
    session.systemEventSummary.spawnerPipeline.spawnerVisualEvents += 1;
  } else if (type === 'music_spawner_loopgrid_event') {
    session.systemEventSummary.spawnerPipeline.spawnerLoopgridEvents += 1;
  } else if (type === 'music_spawner_pipeline_mismatch') {
    session.systemEventSummary.spawnerPipeline.spawnerPipelineMismatches += 1;
  } else if (type === 'music_foundation_prominence_decision') {
    const summary = session.systemEventSummary.foundationProminence;
    summary.total += 1;
    const finalProminence = String(rec?.finalProminence || '').trim().toLowerCase();
    if (finalProminence === 'full') summary.full += 1;
    else if (finalProminence === 'quiet') summary.quiet += 1;
    else if (finalProminence === 'trace') summary.trace += 1;
    else if (finalProminence === 'suppressed') summary.suppressed += 1;
    if (rec?.changedByDeconflict === true) summary.changedByDeconflict += 1;
  } else if (type === 'music_slot_spawner_stage') {
    const summary = session.systemEventSummary.slotSpawnerStages;
    const stage = String(rec?.stage || '').trim().toLowerCase();
    const key = String(rec?.musicVoiceKey || '').trim().toLowerCase();
    if (key === 'percussion_pulse') {
      if (stage === 'raw') summary.rawPulse += 1;
      else if (stage === 'queued') summary.queuedPulse += 1;
      else if (stage === 'drained') summary.drainedPulse += 1;
      else if (stage === 'filtered') summary.filteredPulse += 1;
      else if (stage === 'shaped') summary.shapedPulse += 1;
      else if (stage === 'executed') summary.executedPulse += 1;
    } else if (key === 'percussion_backbeat') {
      if (stage === 'raw') summary.rawBackbeat += 1;
      else if (stage === 'queued') summary.queuedBackbeat += 1;
      else if (stage === 'drained') summary.drainedBackbeat += 1;
      else if (stage === 'filtered') summary.filteredBackbeat += 1;
      else if (stage === 'shaped') summary.shapedBackbeat += 1;
      else if (stage === 'executed') summary.executedBackbeat += 1;
    }
  } else if (type === 'music_slot_spawner_loop_state_change') {
    const summary = session.systemEventSummary.slotSpawnerLoopState;
    summary.totalChanges += 1;
    if (rec?.introDrumProtected === true) summary.introProtectedChanges += 1;
    if (rec?.introPrimaryLoopBlendWindow === true) summary.blendWindowChanges += 1;
    const key = String(rec?.musicVoiceKey || '').trim().toLowerCase();
    if (key === 'percussion_pulse') summary.pulseChanges += 1;
    else if (key === 'percussion_backbeat') summary.backbeatChanges += 1;
  } else if (type === 'music_intro_drum_first_note') {
    const summary = session.systemEventSummary.introDrumFirstNote;
    summary.events += 1;
    const resolvedNote = String(rec?.resolvedNote || '').trim().toUpperCase();
    if (resolvedNote && resolvedNote !== 'C3') summary.offC3Events += 1;
  } else if (type === 'music_lane_carrier_transferred' || type === 'music_lane_carrier_unbound') {
    const summary = session.systemEventSummary.laneCarrierContinuity
      && typeof session.systemEventSummary.laneCarrierContinuity === 'object'
      ? session.systemEventSummary.laneCarrierContinuity
      : (session.systemEventSummary.laneCarrierContinuity = { transferred: 0, unbound: 0, systemVoice: 0, vacant: 0 });
    if (type === 'music_lane_carrier_transferred') summary.transferred += 1;
    else summary.unbound += 1;
    const embodimentState = String(rec?.embodimentState || '').trim().toLowerCase();
    if (embodimentState === 'system_voice') summary.systemVoice += 1;
    else if (embodimentState === 'vacant') summary.vacant += 1;
  } else if (type === 'music_handoff_visual_continuity_failed') {
    const summary = session.systemEventSummary.handoffVisualFailures
      && typeof session.systemEventSummary.handoffVisualFailures === 'object'
      ? session.systemEventSummary.handoffVisualFailures
      : (session.systemEventSummary.handoffVisualFailures = {});
    const reasons = Array.isArray(rec?.visualFailureReasons) ? rec.visualFailureReasons : [];
    for (const reasonLike of reasons) {
      const reason = String(reasonLike || '').trim().toLowerCase();
      if (!reason) continue;
      summary[reason] = clampInt(summary[reason], 0, 0) + 1;
    }
  }
}

function shouldStoreRawSystemEvent(eventType) {
  const type = String(eventType || '').trim().toLowerCase();
  if (!type) return false;
  return !SYSTEM_EVENT_SUMMARY_ONLY_TYPES.has(type);
}

function collectEnemyActionGateDiagnostics(session, maxBarIndex) {
  const events = (Array.isArray(session?.systemEvents) ? session.systemEvents : [])
    .filter((e) => clampInt(e?.barIndex, 0, 0) <= maxBarIndex);
  const inc = (bucket, keyLike) => {
    const key = String(keyLike || 'unknown').trim().toLowerCase() || 'unknown';
    bucket[key] = clampInt(bucket[key], 0, 0) + 1;
  };
  const diagnostics = {
    decisionCount: 0,
    allowedCount: 0,
    blockedCount: 0,
    blockRate: 0,
    stepCount: 0,
    byStage: {},
    allowedByStage: {},
    blockedByStage: {},
    byRhythmFamily: {},
    byLane: {},
    blockedByLane: {},
    reasonCounts: {},
    stepAllowedTotal: 0,
    stepBlockedTotal: 0,
    avgAllowedPerStep: 0,
    avgBlockedPerStep: 0,
  };
  for (const ev of events) {
    const type = String(ev?.eventType || '').trim().toLowerCase();
    if (type === 'music_enemy_action_gate_decision') {
      const stage = String(ev?.stage || '').trim().toLowerCase() || 'unknown';
      const rhythmFamily = String(ev?.rhythmFamily || '').trim().toLowerCase() || 'unknown';
      const lane = String(ev?.lane || '').trim().toLowerCase() || 'unknown';
      const reason = String(ev?.reason || '').trim().toLowerCase() || 'unknown';
      const allowed = ev?.allowed === true;
      diagnostics.decisionCount += 1;
      if (allowed) {
        diagnostics.allowedCount += 1;
        inc(diagnostics.allowedByStage, stage);
      } else {
        diagnostics.blockedCount += 1;
        inc(diagnostics.blockedByStage, stage);
        inc(diagnostics.blockedByLane, lane);
      }
      inc(diagnostics.byStage, stage);
      inc(diagnostics.byRhythmFamily, rhythmFamily);
      inc(diagnostics.byLane, lane);
      inc(diagnostics.reasonCounts, reason);
    } else if (type === 'music_enemy_action_gate_step') {
      diagnostics.stepCount += 1;
      diagnostics.stepAllowedTotal += clampInt(ev?.allowedCount, 0, 0);
      diagnostics.stepBlockedTotal += clampInt(ev?.blockedCount, 0, 0);
    }
  }
  diagnostics.blockRate = diagnostics.decisionCount > 0
    ? diagnostics.blockedCount / diagnostics.decisionCount
    : 0;
  diagnostics.avgAllowedPerStep = diagnostics.stepCount > 0
    ? diagnostics.stepAllowedTotal / diagnostics.stepCount
    : 0;
  diagnostics.avgBlockedPerStep = diagnostics.stepCount > 0
    ? diagnostics.stepBlockedTotal / diagnostics.stepCount
    : 0;
  return diagnostics;
}

function isAudibleEvent(eventLike) {
  const ev = eventLike && typeof eventLike === 'object' ? eventLike : {};
  const source = String(ev?.sourceSystem || '').trim().toLowerCase();
  const action = String(ev?.actionType || '').trim().toLowerCase();
  const note = String(ev?.noteResolved || ev?.note || '').trim();
  if (source === 'player') return ev?.playerAudible === true;
  if (ev?.enemyAudible === false) return false;
  if (ev?.enemyAudible === true) return true;
  if (action === 'spawner-flash') return false;
  if (action === 'player-weapon-step') return false;
  if (note) return true;
  if (action === 'enemy-death-accent') return true;
  return false;
}

function isCombatFeedbackEvent(eventLike) {
  const ev = eventLike && typeof eventLike === 'object' ? eventLike : {};
  const source = String(ev?.sourceSystem || '').trim().toLowerCase();
  const action = String(ev?.actionType || '').trim().toLowerCase();
  const authoringClass = String(ev?.authoringClass || ev?.payload?.authoringClass || '').trim().toLowerCase();
  if (source === 'player' || source === 'death') return true;
  if (authoringClass === 'gameplayauthored') return true;
  if (authoringClass === 'musicauthored') return false;
  if (action === 'enemy-death-accent') return true;
  return (
    action.includes('projectile')
    || action.includes('explosion')
    || action.includes('chain')
    || action.includes('impact')
    || action.includes('collision')
    || action.includes('hitscan')
    || action.includes('beam')
    || action.includes('boomerang')
  );
}

function isMusicFlowEvent(eventLike) {
  return !isCombatFeedbackEvent(eventLike);
}

function isEnemyMusicEvent(eventLike) {
  const ev = eventLike && typeof eventLike === 'object' ? eventLike : {};
  const source = String(ev?.sourceSystem || '').trim().toLowerCase();
  if (!source || source === 'player' || source === 'death' || source === 'unknown') return false;
  const action = String(ev?.actionType || '').trim().toLowerCase();
  if (!action || action === 'player-weapon-step' || action === 'spawner-flash') return false;
  return true;
}

function collectRoleBalance(events) {
  const perBar = Object.create(null);
  const totals = Object.create(null);
  let totalEvents = 0;
  for (const ev of events) {
    const role = String(ev?.role || '').trim().toLowerCase();
    if (!role) continue;
    const barKey = String(clampInt(ev?.barIndex, 0, 0));
    if (!perBar[barKey]) perBar[barKey] = Object.create(null);
    perBar[barKey][role] = clampInt(perBar[barKey][role], 0, 0) + 1;
    totals[role] = clampInt(totals[role], 0, 0) + 1;
    totalEvents += 1;
  }
  const distribution = Object.create(null);
  for (const key of Object.keys(totals)) {
    distribution[key] = totalEvents > 0 ? (totals[key] / totalEvents) : 0;
  }
  return { perBar, totals, distribution, totalEvents };
}

function collectThreatBalance(events) {
  const perBeat = Object.create(null);
  const perBar = Object.create(null);
  for (const ev of events) {
    const cls = String(ev?.threatClass || '').trim().toLowerCase() || 'unknown';
    const beatKey = String(clampInt(ev?.beatIndex, 0, 0));
    const barKey = String(clampInt(ev?.barIndex, 0, 0));
    if (!perBeat[beatKey]) perBeat[beatKey] = Object.create(null);
    if (!perBar[barKey]) perBar[barKey] = Object.create(null);
    perBeat[beatKey][cls] = clampInt(perBeat[beatKey][cls], 0, 0) + 1;
    perBar[barKey][cls] = clampInt(perBar[barKey][cls], 0, 0) + 1;
  }
  return { perBeat, perBar };
}

function collectThreatBudgetUsage(session, maxBarIndex) {
  const snaps = (Array.isArray(session?.threatBudgetSnapshots) ? session.threatBudgetSnapshots : [])
    .filter((s) => clampInt(s?.barIndex, 0, 0) <= maxBarIndex);
  const perBeat = Object.create(null);
  const perBar = Object.create(null);
  const laneActiveBeatCounts = Object.create(null);
  const laneCarrierPreferenceCounts = Object.create(null);
  const spawnDirector = {
    loadedBeatCount: 0,
    chosenCounts: Object.create(null),
    spawnedCounts: Object.create(null),
    avgLiveBudgetMax: 0,
    avgSpawnBudget: 0,
    totalSpawnsNoted: 0,
    matchedChosenSpawnCount: 0,
    mismatchedChosenSpawnCount: 0,
    evaluationCount: 0,
    noChoiceCount: 0,
    avgEligibleCount: 0,
    maxEligibleCount: 0,
    rejectionReasonCounts: Object.create(null),
    count: 0,
  };
  const pressure = {
    count: 0,
    combatPressureSum: 0,
    musicalPressureSum: 0,
  };
  const sectionIntentCounts = Object.create(null);
  for (const s of snaps) {
    const beatKey = String(clampInt(s?.beatIndex, 0, 0));
    const barKey = String(clampInt(s?.barIndex, 0, 0));
    const usage = s?.usage && typeof s.usage === 'object' ? s.usage : {};
    const budgets = s?.budgets && typeof s.budgets === 'object' ? s.budgets : {};
    const lanePlan = s?.lanePlan && typeof s.lanePlan === 'object' ? s.lanePlan : {};
    const pressureState = s?.pressureState && typeof s.pressureState === 'object' ? s.pressureState : {};
    const spawnState = s?.spawnState && typeof s.spawnState === 'object' ? s.spawnState : {};
    const beatLanes = Object.create(null);
    for (const [laneId, lane] of Object.entries(lanePlan)) {
      if (!lane || typeof lane !== 'object') continue;
      const active = lane?.active === true;
      const preferredCarrier = String(lane?.preferredCarrier || '').trim().toLowerCase();
      beatLanes[laneId] = {
        active,
        targetCount: clampInt(lane?.targetCount, 0, 0),
        preferredCarrier,
        protected: lane?.protected === true,
      };
      if (active) laneActiveBeatCounts[laneId] = clampInt(laneActiveBeatCounts[laneId], 0, 0) + 1;
      if (active && preferredCarrier) {
        const carrierKey = `${laneId}:${preferredCarrier}`;
        laneCarrierPreferenceCounts[carrierKey] = clampInt(laneCarrierPreferenceCounts[carrierKey], 0, 0) + 1;
      }
    }
    const combatPressure = Math.max(0, Math.min(1, Number(pressureState?.combatPressure) || 0));
    const musicalPressure = Math.max(0, Math.min(1, Number(pressureState?.musicalPressure) || 0));
    const sectionIntent = String(pressureState?.sectionIntent || '').trim().toLowerCase();
    if (String(spawnState?.configStatus || '').trim().toLowerCase() === 'loaded') spawnDirector.loadedBeatCount += 1;
    const chosenId = String(spawnState?.lastEvaluation?.chosenId || '').trim().toLowerCase();
    if (chosenId) spawnDirector.chosenCounts[chosenId] = clampInt(spawnDirector.chosenCounts[chosenId], 0, 0) + 1;
    spawnDirector.avgLiveBudgetMax += Math.max(0, Number(spawnState?.liveBudgetMax) || 0);
    spawnDirector.avgSpawnBudget += Math.max(0, Number(spawnState?.spawnBudget) || 0);
    const spawnedCountsById = spawnState?.spawnedCountsById && typeof spawnState.spawnedCountsById === 'object'
      ? spawnState.spawnedCountsById
      : {};
    for (const [spawnId, countRaw] of Object.entries(spawnedCountsById)) {
      const spawnIdKey = String(spawnId || '').trim().toLowerCase();
      if (!spawnIdKey) continue;
      spawnDirector.spawnedCounts[spawnIdKey] = Math.max(
        Math.max(0, Math.trunc(Number(spawnDirector.spawnedCounts[spawnIdKey]) || 0)),
        Math.max(0, Math.trunc(Number(countRaw) || 0))
      );
    }
    spawnDirector.totalSpawnsNoted = Math.max(
      Math.max(0, Math.trunc(Number(spawnDirector.totalSpawnsNoted) || 0)),
      Math.max(0, Math.trunc(Number(spawnState?.totalSpawnsNoted) || 0))
    );
    spawnDirector.matchedChosenSpawnCount = Math.max(
      Math.max(0, Math.trunc(Number(spawnDirector.matchedChosenSpawnCount) || 0)),
      Math.max(0, Math.trunc(Number(spawnState?.matchedChosenSpawnCount) || 0))
    );
    spawnDirector.mismatchedChosenSpawnCount = Math.max(
      Math.max(0, Math.trunc(Number(spawnDirector.mismatchedChosenSpawnCount) || 0)),
      Math.max(0, Math.trunc(Number(spawnState?.mismatchedChosenSpawnCount) || 0))
    );
    spawnDirector.evaluationCount = Math.max(
      Math.max(0, Math.trunc(Number(spawnDirector.evaluationCount) || 0)),
      Math.max(0, Math.trunc(Number(spawnState?.evaluationCount) || 0))
    );
    spawnDirector.noChoiceCount = Math.max(
      Math.max(0, Math.trunc(Number(spawnDirector.noChoiceCount) || 0)),
      Math.max(0, Math.trunc(Number(spawnState?.noChoiceCount) || 0))
    );
    spawnDirector.avgEligibleCount = Math.max(
      Number(spawnDirector.avgEligibleCount) || 0,
      Number(spawnState?.avgEligibleCount) || 0
    );
    spawnDirector.maxEligibleCount = Math.max(
      Math.max(0, Math.trunc(Number(spawnDirector.maxEligibleCount) || 0)),
      Math.max(0, Math.trunc(Number(spawnState?.maxEligibleCount) || 0))
    );
    const rejectionReasonCounts = spawnState?.rejectionReasonCounts && typeof spawnState.rejectionReasonCounts === 'object'
      ? spawnState.rejectionReasonCounts
      : {};
    for (const [reason, countRaw] of Object.entries(rejectionReasonCounts)) {
      const reasonKey = String(reason || '').trim().toLowerCase();
      if (!reasonKey) continue;
      spawnDirector.rejectionReasonCounts[reasonKey] = Math.max(
        Math.max(0, Math.trunc(Number(spawnDirector.rejectionReasonCounts[reasonKey]) || 0)),
        Math.max(0, Math.trunc(Number(countRaw) || 0))
      );
    }
    spawnDirector.count += 1;
    perBeat[beatKey] = {
      fullThreats: clampInt(usage?.fullThreats, 0, 0),
      lightThreats: clampInt(usage?.lightThreats, 0, 0),
      audibleAccents: clampInt(usage?.audibleAccents, 0, 0),
      cosmeticParticipants: clampInt(usage?.cosmeticParticipants, 0, 0),
      maxFullThreatsPerBeat: clampInt(budgets?.maxFullThreatsPerBeat, 0, 0),
      maxLightThreatsPerBeat: clampInt(budgets?.maxLightThreatsPerBeat, 0, 0),
      maxAudibleAccentsPerBeat: clampInt(budgets?.maxAudibleAccentsPerBeat, 0, 0),
      maxCosmeticPerBeat: clampInt(budgets?.maxCosmeticPerBeat, 0, 0),
      sectionIntent,
      combatPressure,
      musicalPressure,
      lanePlan: beatLanes,
      spawnState: spawnState && typeof spawnState === 'object'
        ? {
          configStatus: String(spawnState?.configStatus || '').trim().toLowerCase(),
          liveBudgetMax: Math.max(0, Number(spawnState?.liveBudgetMax) || 0),
          spawnBudget: Math.max(0, Number(spawnState?.spawnBudget) || 0),
          totalSpawnsNoted: Math.max(0, Math.trunc(Number(spawnState?.totalSpawnsNoted) || 0)),
          lastSpawnedId: String(spawnState?.lastSpawnedId || '').trim().toLowerCase(),
          matchedChosenSpawnCount: Math.max(0, Math.trunc(Number(spawnState?.matchedChosenSpawnCount) || 0)),
          mismatchedChosenSpawnCount: Math.max(0, Math.trunc(Number(spawnState?.mismatchedChosenSpawnCount) || 0)),
          evaluationCount: Math.max(0, Math.trunc(Number(spawnState?.evaluationCount) || 0)),
          noChoiceCount: Math.max(0, Math.trunc(Number(spawnState?.noChoiceCount) || 0)),
          avgEligibleCount: Math.max(0, Number(spawnState?.avgEligibleCount) || 0),
          maxEligibleCount: Math.max(0, Math.trunc(Number(spawnState?.maxEligibleCount) || 0)),
          chosenId,
        }
        : {},
    };
    if (!perBar[barKey]) {
      perBar[barKey] = {
        fullThreats: 0,
        lightThreats: 0,
        audibleAccents: 0,
        cosmeticParticipants: 0,
        maxFullThreatsPerBeat: 0,
        maxLightThreatsPerBeat: 0,
        maxAudibleAccentsPerBeat: 0,
        maxCosmeticPerBeat: 0,
        beats: 0,
        combatPressureSum: 0,
        musicalPressureSum: 0,
        sectionIntentCounts: Object.create(null),
      };
    }
    const b = perBar[barKey];
    b.fullThreats += clampInt(usage?.fullThreats, 0, 0);
    b.lightThreats += clampInt(usage?.lightThreats, 0, 0);
    b.audibleAccents += clampInt(usage?.audibleAccents, 0, 0);
    b.cosmeticParticipants += clampInt(usage?.cosmeticParticipants, 0, 0);
    b.maxFullThreatsPerBeat += clampInt(budgets?.maxFullThreatsPerBeat, 0, 0);
    b.maxLightThreatsPerBeat += clampInt(budgets?.maxLightThreatsPerBeat, 0, 0);
    b.maxAudibleAccentsPerBeat += clampInt(budgets?.maxAudibleAccentsPerBeat, 0, 0);
    b.maxCosmeticPerBeat += clampInt(budgets?.maxCosmeticPerBeat, 0, 0);
    b.beats += 1;
    b.combatPressureSum += combatPressure;
    b.musicalPressureSum += musicalPressure;
    if (sectionIntent) b.sectionIntentCounts[sectionIntent] = clampInt(b.sectionIntentCounts[sectionIntent], 0, 0) + 1;
    pressure.count += 1;
    pressure.combatPressureSum += combatPressure;
    pressure.musicalPressureSum += musicalPressure;
    if (sectionIntent) sectionIntentCounts[sectionIntent] = clampInt(sectionIntentCounts[sectionIntent], 0, 0) + 1;
  }
  return {
    snapshots: snaps.length,
    perBeat,
    perBar,
    directorPlan: {
      laneActiveBeatCounts,
      laneCarrierPreferenceCounts,
      sectionIntentCounts,
      avgCombatPressure: pressure.count > 0 ? (pressure.combatPressureSum / pressure.count) : 0,
      avgMusicalPressure: pressure.count > 0 ? (pressure.musicalPressureSum / pressure.count) : 0,
    },
    spawnDirector: {
      loadedBeatCount: spawnDirector.loadedBeatCount,
      chosenCounts: spawnDirector.chosenCounts,
      spawnedCounts: spawnDirector.spawnedCounts,
      avgLiveBudgetMax: spawnDirector.count > 0 ? (spawnDirector.avgLiveBudgetMax / spawnDirector.count) : 0,
      avgSpawnBudget: spawnDirector.count > 0 ? (spawnDirector.avgSpawnBudget / spawnDirector.count) : 0,
      totalSpawnsNoted: spawnDirector.totalSpawnsNoted,
      matchedChosenSpawnCount: spawnDirector.matchedChosenSpawnCount,
      mismatchedChosenSpawnCount: spawnDirector.mismatchedChosenSpawnCount,
      evaluationCount: spawnDirector.evaluationCount,
      noChoiceCount: spawnDirector.noChoiceCount,
      avgEligibleCount: spawnDirector.avgEligibleCount,
      maxEligibleCount: spawnDirector.maxEligibleCount,
      rejectionReasonCounts: spawnDirector.rejectionReasonCounts,
    },
  };
}

function collectIntervalProfile(events) {
  const melodicAll = events
    .filter((ev) => String(ev?.noteResolved || ev?.note || '').trim().length > 0)
    .sort((a, b) => clampInt(a?.timestamp, 0, 0) - clampInt(b?.timestamp, 0, 0));
  const melodic = melodicAll.filter(isMusicFlowEvent);
  const buckets = { repeat: 0, step: 0, smallLeap: 0, largeLeap: 0 };
  const byLane = Object.create(null);
  for (const ev of melodic) {
    const lane = String(ev?.musicLaneId || ev?.expectedInstrumentLane || ev?.role || 'unknown').trim().toLowerCase() || 'unknown';
    if (!byLane[lane]) byLane[lane] = [];
    byLane[lane].push(ev);
  }
  const laneKeys = Object.keys(byLane);
  if (laneKeys.reduce((sum, key) => sum + Math.max(0, byLane[key].length - 1), 0) < 1) {
    return {
      buckets,
      compared: 0,
      smoothShare: 1,
      scopedEventCount: melodic.length,
      excludedCombatFeedbackEvents: Math.max(0, melodicAll.length - melodic.length),
      laneScoped: true,
    };
  }
  let compared = 0;
  for (const lane of laneKeys) {
    let previousMidi = null;
    for (const ev of byLane[lane]) {
      const midi = toMidi(ev.noteResolved || ev.note);
      if (midi == null) continue;
      if (previousMidi != null) {
      const delta = Math.abs(midi - previousMidi);
      if (delta === 0) buckets.repeat += 1;
      else if (delta <= 2) buckets.step += 1;
      else if (delta <= 5) buckets.smallLeap += 1;
      else buckets.largeLeap += 1;
      compared += 1;
      }
      previousMidi = midi;
    }
  }
  const smoothShare = compared > 0
    ? (buckets.repeat + buckets.step + buckets.smallLeap) / compared
    : 0;
  return {
    buckets,
    compared,
    smoothShare,
    scopedEventCount: melodic.length,
    excludedCombatFeedbackEvents: Math.max(0, melodicAll.length - melodic.length),
    laneScoped: true,
  };
}

function computeShannonEntropyFromCounts(countsLike) {
  const counts = countsLike && typeof countsLike === 'object' ? countsLike : {};
  const values = Object.values(counts).map((v) => Math.max(0, Number(v) || 0)).filter((v) => v > 0);
  const total = values.reduce((sum, v) => sum + v, 0);
  if (!(total > 0)) return 0;
  let h = 0;
  for (const c of values) {
    const p = c / total;
    h += -p * Math.log2(p);
  }
  return Number(h) || 0;
}

function collectPitchEntropy(events) {
  const countsOverall = Object.create(null);
  const countsByRole = Object.create(null);
  let considered = 0;
  for (const ev of events) {
    const note = String(ev?.noteResolved || ev?.note || '').trim();
    if (!note) continue;
    const role = String(ev?.role || '').trim().toLowerCase() || 'unknown';
    const key = note;
    countsOverall[key] = clampInt(countsOverall[key], 0, 0) + 1;
    if (!countsByRole[role]) countsByRole[role] = Object.create(null);
    countsByRole[role][key] = clampInt(countsByRole[role][key], 0, 0) + 1;
    considered += 1;
  }
  const byRole = Object.create(null);
  for (const roleKey of Object.keys(countsByRole)) {
    byRole[roleKey] = computeShannonEntropyFromCounts(countsByRole[roleKey]);
  }
  return {
    considered,
    entropyOverall: computeShannonEntropyFromCounts(countsOverall),
    entropyByRole: byRole,
  };
}

function collectMelodicContour(intervalProfile) {
  const buckets = intervalProfile?.buckets && typeof intervalProfile.buckets === 'object'
    ? intervalProfile.buckets
    : { repeat: 0, step: 0, smallLeap: 0, largeLeap: 0 };
  const compared = clampInt(intervalProfile?.compared, 0, 0);
  const largeLeapRate = compared > 0 ? ((Number(buckets.largeLeap) || 0) / compared) : 0;
  const smoothShare = Number(intervalProfile?.smoothShare) || 0;
  return {
    buckets: {
      repeat: clampInt(buckets.repeat, 0, 0),
      step: clampInt(buckets.step, 0, 0),
      smallLeap: clampInt(buckets.smallLeap, 0, 0),
      largeLeap: clampInt(buckets.largeLeap, 0, 0),
    },
    compared,
    smoothShare,
    largeLeapRate,
    contourStability: smoothShare >= 0.8 ? 'good' : (smoothShare >= 0.62 ? 'acceptable' : 'rough'),
  };
}

function collectDeathDensity(events) {
  const perBeat = Object.create(null);
  const perBar = Object.create(null);
  for (const ev of events) {
    const action = String(ev?.actionType || '').trim().toLowerCase();
    if (action !== 'enemy-death-accent') continue;
    const beatKey = String(clampInt(ev?.beatIndex, 0, 0));
    const barKey = String(clampInt(ev?.barIndex, 0, 0));
    perBeat[beatKey] = clampInt(perBeat[beatKey], 0, 0) + 1;
    perBar[barKey] = clampInt(perBar[barKey], 0, 0) + 1;
  }
  let clusterBeats = 0;
  for (const beatKey of Object.keys(perBeat)) {
    if (clampInt(perBeat[beatKey], 0, 0) >= 2) clusterBeats += 1;
  }
  return { perBeat, perBar, clusterBeats };
}

function collectPlayerMasking(events) {
  const playerAudibleKeys = new Set();
  for (const ev of events) {
    if (String(ev?.sourceSystem || '') !== 'player') continue;
    if (isCombatFeedbackEvent(ev)) continue;
    if (!isAudibleEvent(ev)) continue;
    playerAudibleKeys.add(`${clampInt(ev?.beatIndex, 0, 0)}:${clampInt(ev?.stepIndex, 0, 0)}`);
  }
  let enemyAudibleEvents = 0;
  let maskedEnemyEvents = 0;
  for (const ev of events) {
    const src = String(ev?.sourceSystem || '').trim().toLowerCase();
    if (src === 'player') continue;
    if (isCombatFeedbackEvent(ev)) continue;
    if (!isAudibleEvent(ev)) continue;
    enemyAudibleEvents += 1;
    const key = `${clampInt(ev?.beatIndex, 0, 0)}:${clampInt(ev?.stepIndex, 0, 0)}`;
    if (playerAudibleKeys.has(key)) maskedEnemyEvents += 1;
  }
  return {
    playerAudibleSteps: playerAudibleKeys.size,
    enemyEvents: enemyAudibleEvents,
    maskedEnemyEvents,
    playerMaskingRate: enemyAudibleEvents > 0 ? (maskedEnemyEvents / enemyAudibleEvents) : 0,
  };
}

function collectPlayerInstrumentMetrics(events) {
  const playerSteps = events.filter((ev) => String(ev?.sourceSystem || '').trim().toLowerCase() === 'player');
  const cadenceModeCounts = Object.create(null);
  const cadenceReasonCounts = Object.create(null);
  let manualOverrideSteps = 0;
  let audiblePlayerSteps = 0;
  for (const ev of playerSteps) {
    const mode = String(ev?.playerCadenceMode || '').trim().toLowerCase() || 'unknown';
    const reason = String(ev?.playerCadenceReason || '').trim().toLowerCase() || 'unknown';
    cadenceModeCounts[mode] = clampInt(cadenceModeCounts[mode], 0, 0) + 1;
    cadenceReasonCounts[reason] = clampInt(cadenceReasonCounts[reason], 0, 0) + 1;
    if (ev?.playerManualOverrideActive === true) manualOverrideSteps += 1;
    if (ev?.playerAudible === true) audiblePlayerSteps += 1;
  }
  return {
    playerStepEvents: playerSteps.length,
    audiblePlayerSteps,
    cadenceModeCounts,
    cadenceReasonCounts,
    manualOverrideSteps,
    manualOverrideRate: playerSteps.length > 0 ? (manualOverrideSteps / playerSteps.length) : 0,
  };
}

function collectEnemyRemovalDiagnostics(session, maxBarIndex) {
  const removals = (Array.isArray(session?.enemyRemovals) ? session.enemyRemovals : [])
    .filter((r) => clampInt(r?.barIndex, 0, 0) <= maxBarIndex);
  const byReason = Object.create(null);
  const byEnemyType = Object.create(null);
  let directorCleanupRemovals = 0;
  let sectionChangeCleanupRemovals = 0;
  let groupRetirements = 0;
  let groupNaturalDeaths = 0;
  for (const r of removals) {
    const reason = String(r?.reason || '').trim().toLowerCase() || 'unknown';
    const retireOrigin = String(r?.retireOrigin || '').trim().toLowerCase();
    const enemyType = String(r?.enemyType || '').trim().toLowerCase() || 'unknown';
    byReason[reason] = clampInt(byReason[reason], 0, 0) + 1;
    byEnemyType[enemyType] = clampInt(byEnemyType[enemyType], 0, 0) + 1;
    if (reason === 'director_cleanup') directorCleanupRemovals += 1;
    if (reason === 'section_change_cleanup') sectionChangeCleanupRemovals += 1;
    if (
      reason === 'retiring'
      || reason === 'inactiveforscheduling'
      || (
        reason === 'retreated'
        && (retireOrigin === 'director_cleanup' || retireOrigin === 'section_change_cleanup' || retireOrigin === 'retiring' || retireOrigin === 'inactiveforscheduling')
      )
    ) {
      groupRetirements += 1;
    }
    if (reason === 'killed' || reason === 'expired') groupNaturalDeaths += 1;
  }
  const frameBuckets = Object.create(null);
  for (const r of removals) {
    const gid = clampInt(r?.groupId, 0, 0);
    if (!(gid > 0)) continue;
    const t = clampInt(r?.timestamp, 0, 0);
    const key = `${t}:g${gid}`;
    frameBuckets[key] = clampInt(frameBuckets[key], 0, 0) + 1;
  }
  let sameFrameGroupRemovals = 0;
  for (const key of Object.keys(frameBuckets)) {
    if (frameBuckets[key] >= 2) sameFrameGroupRemovals += frameBuckets[key];
  }
  return {
    totalEnemyRemovals: removals.length,
    byReason,
    byEnemyType,
    directorCleanupRemovals,
    sectionChangeCleanupRemovals,
    sameFrameGroupRemovals,
    groupRetirements,
    groupNaturalDeaths,
  };
}

function collectHandoffDiagnostics(session, maxBarIndex) {
  const logs = (Array.isArray(session?.systemEvents) ? session.systemEvents : [])
    .filter((e) => clampInt(e?.barIndex, 0, 0) <= maxBarIndex);
  const byType = Object.create(null);
  let attempts = 0;
  let completed = 0;
  let successes = 0;
  let failures = 0;
  let inheritedPhrase = 0;
  let resetPhrase = 0;
  let bassAttempts = 0;
  let bassInheritedPhrase = 0;
  let bassResetPhrase = 0;
  for (const e of logs) {
    const type = String(e?.eventType || '').trim().toLowerCase() || 'unknown';
    const laneRole = String(e?.laneRole || '').trim().toLowerCase();
    const isBassLane = laneRole === 'bass';
    byType[type] = clampInt(byType[type], 0, 0) + 1;
    if (type === 'music_handoff_started') attempts += 1;
    if (type === 'music_handoff_completed') completed += 1;
    if (type === 'music_handoff_failed') failures += 1;
    if (type === 'music_handoff_inherited_phrase') inheritedPhrase += 1;
    if (type === 'music_handoff_reset_phrase') resetPhrase += 1;
    if (type === 'music_handoff_started' && isBassLane) bassAttempts += 1;
    if (type === 'music_handoff_inherited_phrase' && isBassLane) bassInheritedPhrase += 1;
    if (type === 'music_handoff_reset_phrase' && isBassLane) bassResetPhrase += 1;
  }
  // Handoff "success" means phrase continuity was preserved.
  successes = inheritedPhrase;
  const successRate = attempts > 0 ? (successes / attempts) : 0;
  const bassSuccessRate = bassAttempts > 0 ? (bassInheritedPhrase / bassAttempts) : 0;
  return {
    totalHandoffLogs: logs.length,
    byType,
    attempts,
    completed,
    successes,
    failures,
    successRate,
    inheritedPhrase,
    resetPhrase,
    bassAttempts,
    bassInheritedPhrase,
    bassResetPhrase,
    bassSuccessRate,
  };
}

function collectVisibleEnemyAudibility(events) {
  let visibleEnemyEvents = 0;
  let barelyAudibleVisibleEnemyEvents = 0;
  for (const ev of events) {
    const src = String(ev?.sourceSystem || '').trim().toLowerCase();
    if (src === 'player') continue;
    const actorId = Math.max(0, clampInt(ev?.actorId, 0, 0));
    if (!(actorId > 0)) continue;
    const action = String(ev?.actionType || '').trim().toLowerCase();
    const visibleCueLike = ev?.visibleCueAudibilityFloor === true
      || action === 'spawner-spawn'
      || action === 'drawsnake-projectile'
      || action === 'composer-group-projectile'
      || action === 'composer-group-explosion';
    if (!visibleCueLike) continue;
    visibleEnemyEvents += 1;
    const audioGain = Math.max(0, Number(ev?.audioGain) || 0);
    const prominence = String(ev?.musicProminence || '').trim().toLowerCase();
    if (prominence !== 'suppressed' && audioGain > 0 && audioGain < 0.26) {
      barelyAudibleVisibleEnemyEvents += 1;
    }
  }
  return {
    visibleEnemyEvents,
    barelyAudibleVisibleEnemyEvents,
    barelyAudibleVisibleEnemyRate: visibleEnemyEvents > 0 ? (barelyAudibleVisibleEnemyEvents / visibleEnemyEvents) : 0,
  };
}

function inferForegroundRoleId(eventLike) {
  const ev = eventLike && typeof eventLike === 'object' ? eventLike : {};
  const explicitRole = String(ev?.role || '').trim().toLowerCase();
  if (explicitRole === 'bass') return 'foundation_groove';
  if (explicitRole === 'lead') return 'lead_phrase';
  if (explicitRole === 'accent') {
    const laneId = String(ev?.musicLaneId || '').trim().toLowerCase();
    if (getBeatSwarmLevel1RoleForLane(laneId) === 'answer_ornament') return 'answer_ornament';
    return 'counter_rhythm';
  }
  const laneId = String(ev?.musicLaneId || '').trim().toLowerCase();
  const responseLane = String(ev?.callResponseLane || '').trim().toLowerCase();
  if (responseLane === 'response') return 'answer_ornament';
  return getBeatSwarmLevel1RoleForLane(laneId) || 'unknown';
}

function collectForegroundCompetitionDiagnostics(session, events, maxBarIndex) {
  const systemEvents = (Array.isArray(session?.systemEvents) ? session.systemEvents : [])
    .filter((e) => clampInt(e?.barIndex, 0, 0) <= maxBarIndex)
    .filter((e) => String(e?.eventType || '').trim().toLowerCase() === 'music_mode_state')
    .sort((a, b) => {
      const barDelta = clampInt(a?.barIndex, 0, 0) - clampInt(b?.barIndex, 0, 0);
      if (barDelta !== 0) return barDelta;
      const beatDelta = clampInt(a?.beatIndex, 0, 0) - clampInt(b?.beatIndex, 0, 0);
      if (beatDelta !== 0) return beatDelta;
      return clampInt(a?.stepIndex, 0, 0) - clampInt(b?.stepIndex, 0, 0);
    });
  const modeByBar = new Map();
  let latestMode = null;
  for (let bar = 0; bar <= maxBarIndex; bar += 1) {
    while (systemEvents.length && clampInt(systemEvents[0]?.barIndex, 0, 0) <= bar) {
      latestMode = systemEvents.shift();
    }
    if (latestMode) {
      modeByBar.set(bar, {
        activeLevelPhase: String(latestMode?.activeLevelPhase || '').trim().toLowerCase(),
        activeMusicMode: String(latestMode?.activeMusicMode || '').trim().toLowerCase(),
      });
    }
  }
  const playerAudibleKeys = new Set();
  for (const ev of events) {
    if (clampInt(ev?.barIndex, 0, 0) > maxBarIndex) continue;
    if (String(ev?.sourceSystem || '').trim().toLowerCase() !== 'player') continue;
    if (!isAudibleEvent(ev)) continue;
    playerAudibleKeys.add(`${clampInt(ev?.beatIndex, 0, 0)}:${clampInt(ev?.stepIndex, 0, 0)}`);
  }
  const byRoleForeground = Object.create(null);
  const byRoleCompetition = Object.create(null);
  const bySourceForeground = Object.create(null);
  const bySourceCompetition = Object.create(null);
  const byEnemyTypeForeground = Object.create(null);
  const byEnemyTypeCompetition = Object.create(null);
  const byProfileSourceTypeForeground = Object.create(null);
  const byProfileSourceTypeCompetition = Object.create(null);
  const byReasonForeground = Object.create(null);
  const byReasonCompetition = Object.create(null);
  const conflictDiagnostics = {
    primarySecondaryConsidered: 0,
    primarySecondaryConflictHitCount: 0,
    primarySecondaryConflictAvoidedCount: 0,
    byLane: Object.create(null),
    byProfileSourceType: Object.create(null),
    byReason: Object.create(null),
    ornamentConsidered: 0,
    ornamentConflictHitCount: 0,
    ornamentConflictAvoidedCount: 0,
    ornamentByProfileSourceType: Object.create(null),
    ornamentByReason: Object.create(null),
  };
  let fullTextureEnemyAudibleEvents = 0;
  let fullTextureEnemyForegroundEvents = 0;
  let fullTextureEnemyCompetingEvents = 0;
  for (const ev of events) {
    if (clampInt(ev?.barIndex, 0, 0) > maxBarIndex) continue;
    const sourceSystem = String(ev?.sourceSystem || '').trim().toLowerCase();
    if (sourceSystem === 'player') continue;
    if (!isAudibleEvent(ev)) continue;
    const modeState = modeByBar.get(clampInt(ev?.barIndex, 0, 0));
    if (String(modeState?.activeLevelPhase || '').trim().toLowerCase() !== 'full_texture') continue;
    fullTextureEnemyAudibleEvents += 1;
    const roleId = inferForegroundRoleId(ev);
    const sourceKey = sourceSystem || 'unknown';
    const enemyTypeKey = String(ev?.enemyType || '').trim().toLowerCase() || 'unknown';
    const profileKey = String(ev?.musicProfileSourceType || '').trim().toLowerCase() || 'unknown';
    const reasonKey = String(ev?.reason || ev?.formationRole || ev?.musicLaneId || '').trim().toLowerCase() || 'unknown';
    const musicLaneId = String(ev?.musicLaneId || '').trim().toLowerCase();
    const prominence = String(ev?.musicProminence || '').trim().toLowerCase();
    const foreground = prominence === 'full' || prominence === 'quiet';
    const key = `${clampInt(ev?.beatIndex, 0, 0)}:${clampInt(ev?.stepIndex, 0, 0)}`;
    const competing = playerAudibleKeys.has(key);
    if (musicLaneId === 'primary_loop_lane' || musicLaneId === 'secondary_loop_lane') {
      conflictDiagnostics.primarySecondaryConsidered += 1;
      if (!conflictDiagnostics.byLane[musicLaneId]) {
        conflictDiagnostics.byLane[musicLaneId] = { considered: 0, hit: 0, avoided: 0 };
      }
      if (!conflictDiagnostics.byProfileSourceType[profileKey]) {
        conflictDiagnostics.byProfileSourceType[profileKey] = { considered: 0, hit: 0, avoided: 0 };
      }
      if (!conflictDiagnostics.byReason[reasonKey]) {
        conflictDiagnostics.byReason[reasonKey] = { considered: 0, hit: 0, avoided: 0 };
      }
      conflictDiagnostics.byLane[musicLaneId].considered += 1;
      conflictDiagnostics.byProfileSourceType[profileKey].considered += 1;
      conflictDiagnostics.byReason[reasonKey].considered += 1;
      if (competing) {
        conflictDiagnostics.primarySecondaryConflictHitCount += 1;
        conflictDiagnostics.byLane[musicLaneId].hit += 1;
        conflictDiagnostics.byProfileSourceType[profileKey].hit += 1;
        conflictDiagnostics.byReason[reasonKey].hit += 1;
      } else {
        conflictDiagnostics.primarySecondaryConflictAvoidedCount += 1;
        conflictDiagnostics.byLane[musicLaneId].avoided += 1;
        conflictDiagnostics.byProfileSourceType[profileKey].avoided += 1;
        conflictDiagnostics.byReason[reasonKey].avoided += 1;
      }
    }
    if (roleId === 'answer_ornament' || musicLaneId === 'sparkle_lane') {
      conflictDiagnostics.ornamentConsidered += 1;
      if (!conflictDiagnostics.ornamentByProfileSourceType[profileKey]) {
        conflictDiagnostics.ornamentByProfileSourceType[profileKey] = { considered: 0, hit: 0, avoided: 0 };
      }
      if (!conflictDiagnostics.ornamentByReason[reasonKey]) {
        conflictDiagnostics.ornamentByReason[reasonKey] = { considered: 0, hit: 0, avoided: 0 };
      }
      conflictDiagnostics.ornamentByProfileSourceType[profileKey].considered += 1;
      conflictDiagnostics.ornamentByReason[reasonKey].considered += 1;
      if (competing) {
        conflictDiagnostics.ornamentConflictHitCount += 1;
        conflictDiagnostics.ornamentByProfileSourceType[profileKey].hit += 1;
        conflictDiagnostics.ornamentByReason[reasonKey].hit += 1;
      } else {
        conflictDiagnostics.ornamentConflictAvoidedCount += 1;
        conflictDiagnostics.ornamentByProfileSourceType[profileKey].avoided += 1;
        conflictDiagnostics.ornamentByReason[reasonKey].avoided += 1;
      }
    }
    if (foreground) {
      fullTextureEnemyForegroundEvents += 1;
      byRoleForeground[roleId] = clampInt(byRoleForeground[roleId], 0, 0) + 1;
      bySourceForeground[sourceKey] = clampInt(bySourceForeground[sourceKey], 0, 0) + 1;
      byEnemyTypeForeground[enemyTypeKey] = clampInt(byEnemyTypeForeground[enemyTypeKey], 0, 0) + 1;
      byProfileSourceTypeForeground[profileKey] = clampInt(byProfileSourceTypeForeground[profileKey], 0, 0) + 1;
      byReasonForeground[reasonKey] = clampInt(byReasonForeground[reasonKey], 0, 0) + 1;
    }
    if (competing) {
      fullTextureEnemyCompetingEvents += 1;
      byRoleCompetition[roleId] = clampInt(byRoleCompetition[roleId], 0, 0) + 1;
      bySourceCompetition[sourceKey] = clampInt(bySourceCompetition[sourceKey], 0, 0) + 1;
      byEnemyTypeCompetition[enemyTypeKey] = clampInt(byEnemyTypeCompetition[enemyTypeKey], 0, 0) + 1;
      byProfileSourceTypeCompetition[profileKey] = clampInt(byProfileSourceTypeCompetition[profileKey], 0, 0) + 1;
      byReasonCompetition[reasonKey] = clampInt(byReasonCompetition[reasonKey], 0, 0) + 1;
    }
  }
  return {
    fullTextureEnemyAudibleEvents,
    fullTextureEnemyForegroundEvents,
    fullTextureEnemyCompetingEvents,
    fullTextureEnemyForegroundShare: fullTextureEnemyAudibleEvents > 0 ? (fullTextureEnemyForegroundEvents / fullTextureEnemyAudibleEvents) : 0,
    fullTextureEnemyCompetitionShare: fullTextureEnemyAudibleEvents > 0 ? (fullTextureEnemyCompetingEvents / fullTextureEnemyAudibleEvents) : 0,
    byRoleForeground,
    byRoleCompetition,
    bySourceForeground,
    bySourceCompetition,
    byEnemyTypeForeground,
    byEnemyTypeCompetition,
    byProfileSourceTypeForeground,
    byProfileSourceTypeCompetition,
    byReasonForeground,
    byReasonCompetition,
    conflictDiagnostics,
  };
}

function collectPresentationMetrics(executedEvents, session, maxBarIndex, inputs = null) {
  const list = Array.isArray(executedEvents) ? executedEvents : [];
  const createdEvents = (Array.isArray(session?.events) ? session.events : [])
    .filter((ev) => String(ev?.phase || '').trim().toLowerCase() === 'created')
    .filter((ev) => clampInt(ev?.barIndex, 0, 0) <= maxBarIndex);
  const actionableExecuted = list.filter((ev) => {
    const src = String(ev?.sourceSystem || '').trim().toLowerCase();
    return src !== 'player' && src !== 'death' && src !== 'unknown';
  });
  let protectedLoopWeightedAudibility = 0;
  let protectedLoopEventCount = 0;
  const audibleVoicesByStep = new Map();
  const stepBarByKey = new Map();
  let groupBackedEvents = 0;
  let actionableEventCount = 0;
  const structureEvents = (Array.isArray(session?.systemEvents) ? session.systemEvents : [])
    .filter((e) => String(e?.eventType || '').trim().toLowerCase() === 'music_structure_intent_state')
    .filter((e) => clampInt(e?.barIndex, 0, 0) <= maxBarIndex)
    .sort((a, b) => clampInt(a?.timestamp, 0, 0) - clampInt(b?.timestamp, 0, 0));
  const structureByBar = new Map();
  for (const e of structureEvents) {
    const barIndex = clampInt(e?.barIndex, 0, 0);
    structureByBar.set(barIndex, {
      intent: String(e?.intent || '').trim().toLowerCase(),
      preDropActive: e?.preDropActive === true,
    });
  }
  for (const ev of actionableExecuted) {
    const prominence = String(ev?.musicProminence || '').trim().toLowerCase();
    const laneId = String(ev?.musicLaneId || ev?.foundationLaneId || '').trim().toLowerCase();
    const musicLayer = String(ev?.musicLayer || '').trim().toLowerCase();
    const role = String(ev?.role || '').trim().toLowerCase();
    const actorId = clampInt(ev?.actorId, 0, 0);
    actionableEventCount += 1;
    if (clampInt(ev?.groupId, 0, 0) > 0 && actorId > 0) groupBackedEvents += 1;
    const protectedLaneLike = (
      laneId === 'primary_loop_lane'
      || laneId === 'foundation_lane'
      || (musicLayer === 'foundation' && role === 'bass')
      || (musicLayer === 'loops' && role === 'lead')
    );
    if (protectedLaneLike) {
      protectedLoopEventCount += 1;
      if (prominence === 'full') protectedLoopWeightedAudibility += 1;
      else if (prominence === 'quiet') protectedLoopWeightedAudibility += 0.68;
      else if (prominence === 'trace') protectedLoopWeightedAudibility += 0.24;
    }
    if (prominence === 'suppressed') continue;
    const key = `${clampInt(ev?.beatIndex, 0, 0)}:${clampInt(ev?.stepIndex, 0, 0)}`;
    audibleVoicesByStep.set(key, clampInt(audibleVoicesByStep.get(key), 0, 0) + 1);
    stepBarByKey.set(key, clampInt(ev?.barIndex, 0, 0));
  }
  let suppressedEventCount = 0;
  for (const ev of createdEvents) {
    const src = String(ev?.sourceSystem || '').trim().toLowerCase();
    if (src === 'player' || src === 'death' || src === 'unknown') continue;
    if (String(ev?.musicProminence || '').trim().toLowerCase() === 'suppressed') suppressedEventCount += 1;
  }
  const simultaneousVoiceCounts = Array.from(audibleVoicesByStep.values());
  const avgSimultaneousVoiceCount = simultaneousVoiceCounts.length
    ? (simultaneousVoiceCounts.reduce((sum, count) => sum + count, 0) / simultaneousVoiceCounts.length)
    : 0;
  const maxSimultaneousVoiceCount = simultaneousVoiceCounts.length ? Math.max(...simultaneousVoiceCounts) : 0;
  const buildVoiceCounts = [];
  const driveVoiceCounts = [];
  const dropVoiceCounts = [];
  const peakVoiceCounts = [];
  const preDropVoiceCounts = [];
  for (const [key, count] of audibleVoicesByStep.entries()) {
    const barIndex = clampInt(stepBarByKey.get(key), 0, 0);
    const structure = structureByBar.get(barIndex) || null;
    const intent = String(structure?.intent || '').trim().toLowerCase();
    if (intent === 'build') buildVoiceCounts.push(count);
    else if (intent === 'drive') driveVoiceCounts.push(count);
    else if (intent === 'drop') dropVoiceCounts.push(count);
    else if (intent === 'peak') peakVoiceCounts.push(count);
    if (structure?.preDropActive === true) preDropVoiceCounts.push(count);
  }
  const avgOf = (listLike) => {
    const values = Array.isArray(listLike) ? listLike : [];
    return values.length ? (values.reduce((sum, count) => sum + count, 0) / values.length) : 0;
  };
  const foregroundLoopChurnRate = Number(inputs?.hierarchyModel?.foregroundLoopChurnRate) || 0;
  const avgEnemyCompetitionShare = Number(inputs?.readability?.avgEnemyCompetitionShare) || 0;
  const avgEnemyForegroundShare = Number(inputs?.readability?.avgEnemyForegroundShare) || 0;
  const sparkleForegroundShare = Number(inputs?.hierarchyModel?.sparkleForegroundShare) || 0;
  const barelyAudibleVisibleEnemyRate = Number(inputs?.visibleEnemyAudibility?.barelyAudibleVisibleEnemyRate) || 0;
  const foregroundClarityScore = Math.max(
    0,
    Math.min(
      1,
      1
        - (foregroundLoopChurnRate * 1.1)
        - (avgEnemyCompetitionShare * 0.75)
        - (sparkleForegroundShare * 0.45)
        - (barelyAudibleVisibleEnemyRate * 0.55)
        + (Math.min(0.45, avgEnemyForegroundShare) * 0.35)
    )
  );
  const decisionMaking = inputs?.passDiagnostics?.decisionMaking && typeof inputs.passDiagnostics.decisionMaking === 'object'
    ? inputs.passDiagnostics.decisionMaking
    : {};
  const ghostLoopCount = Math.max(0, clampInt(decisionMaking?.executionInstrumentChangesRetiringOwner, 0, 0));
  return {
    protectedLoopAudibility: protectedLoopEventCount > 0 ? (protectedLoopWeightedAudibility / protectedLoopEventCount) : 0,
    protectedLoopEventCount,
    foregroundClarityScore,
    simultaneousVoiceCount: avgSimultaneousVoiceCount,
    maxSimultaneousVoiceCount,
    buildSimultaneousVoiceCount: avgOf(buildVoiceCounts),
    driveSimultaneousVoiceCount: avgOf(driveVoiceCounts),
    dropSimultaneousVoiceCount: avgOf(dropVoiceCounts),
    peakSimultaneousVoiceCount: avgOf(peakVoiceCounts),
    preDropSimultaneousVoiceCount: avgOf(preDropVoiceCounts),
    suppressedEventCount,
    suppressedEventRate: createdEvents.length > 0 ? (suppressedEventCount / createdEvents.length) : 0,
    groupParticipationRate: actionableEventCount > 0 ? (groupBackedEvents / actionableEventCount) : 0,
    ghostLoopCount,
  };
}

function collectBassStabilityDiagnostics(executedEvents, handoff = null) {
  const bassEvents = (Array.isArray(executedEvents) ? executedEvents : [])
    .filter((ev) => {
      const role = String(ev?.role || '').trim().toLowerCase();
      if (role !== 'bass') return false;
      const source = String(ev?.sourceSystem || '').trim().toLowerCase();
      return source !== 'player' && source !== 'death' && source !== 'unknown';
    });
  const loopCycles = new Set();
  for (const ev of bassEvents) {
    const stepAbs = clampInt(ev?.stepIndex, 0, 0);
    loopCycles.add(Math.floor(stepAbs / 8));
  }
  return {
    bassEventCount: bassEvents.length,
    bassLoopCycles: loopCycles.size,
    bassPhraseResets: Math.max(0, clampInt(handoff?.bassResetPhrase, 0, 0)),
    bassHandoffContinuityRate: Number(handoff?.bassSuccessRate) || 0,
  };
}

function collectIdentityStabilityDiagnostics(session, maxBarIndex) {
  const createdEnemyEvents = (Array.isArray(session?.events) ? session.events : [])
    .filter((ev) => {
      if (String(ev?.phase || '').trim().toLowerCase() !== 'created') return false;
      if (clampInt(ev?.barIndex, 0, 0) > maxBarIndex) return false;
      const source = String(ev?.sourceSystem || '').trim().toLowerCase();
      if (source === 'player' || source === 'death' || source === 'unknown') return false;
      const actorId = clampInt(ev?.actorId, 0, 0);
      return actorId > 0;
    })
    .sort((a, b) => clampInt(a?.timestamp, 0, 0) - clampInt(b?.timestamp, 0, 0));
  const perEnemy = new Map();
  for (const ev of createdEnemyEvents) {
    const actorId = clampInt(ev?.actorId, 0, 0);
    if (!(actorId > 0)) continue;
    const key = String(actorId);
    if (!perEnemy.has(key)) {
      perEnemy.set(key, {
        instrumentChanges: 0,
        colourChanges: 0,
        lastInstrumentId: '',
        lastColour: '',
      });
    }
    const row = perEnemy.get(key);
    const instrumentId = String(ev?.instrumentId || '').trim();
    if (instrumentId) {
      if (row.lastInstrumentId && row.lastInstrumentId !== instrumentId) row.instrumentChanges += 1;
      row.lastInstrumentId = instrumentId;
    }
    const colour = String(ev?.enemyRoleColor || '').trim().toLowerCase();
    if (colour) {
      if (row.lastColour && row.lastColour !== colour) row.colourChanges += 1;
      row.lastColour = colour;
    }
  }
  let totalInstrumentChanges = 0;
  let totalColourChanges = 0;
  let enemiesWithInstrumentChanges = 0;
  let enemiesWithColourChanges = 0;
  for (const row of perEnemy.values()) {
    totalInstrumentChanges += Math.max(0, clampInt(row.instrumentChanges, 0, 0));
    totalColourChanges += Math.max(0, clampInt(row.colourChanges, 0, 0));
    if (row.instrumentChanges > 0) enemiesWithInstrumentChanges += 1;
    if (row.colourChanges > 0) enemiesWithColourChanges += 1;
  }
  const enemyCount = perEnemy.size;
  return {
    enemyCountObserved: enemyCount,
    instrumentChangesPerEnemy: enemyCount > 0 ? (totalInstrumentChanges / enemyCount) : 0,
    colourChangesPerEnemy: enemyCount > 0 ? (totalColourChanges / enemyCount) : 0,
    totalInstrumentChanges,
    totalColourChanges,
    enemiesWithInstrumentChanges,
    enemiesWithColourChanges,
  };
}
function collectLaneOwnershipDiagnostics(session, maxBarIndex) {
  const logs = (Array.isArray(session?.systemEvents) ? session.systemEvents : [])
    .filter((e) => clampInt(e?.barIndex, 0, 0) <= maxBarIndex)
    .filter((e) => {
      const type = String(e?.eventType || '').trim().toLowerCase();
      return type === 'music_lane_identity_started'
        || type === 'music_lane_identity_changed'
        || type === 'music_lane_identity_cleared'
        || type === 'music_lane_identity_change_deferred'
        || type === 'music_lane_identity_change_applied'
        || type === 'music_lane_identity_change_replaced'
        || type === 'music_lane_identity_change_dropped'
        || type === 'music_lane_identity_change_rejected';
    })
    .sort((a, b) => clampInt(a?.timestamp, 0, 0) - clampInt(b?.timestamp, 0, 0));
  const carrierEvents = (Array.isArray(session?.systemEvents) ? session.systemEvents : [])
    .filter((e) => clampInt(e?.barIndex, 0, 0) <= maxBarIndex)
    .filter((e) => {
      const type = String(e?.eventType || '').trim().toLowerCase();
      return type === 'music_lane_carrier_transferred'
        || type === 'music_lane_carrier_unbound';
    });
  const byLane = Object.create(null);
  let laneStarts = 0;
  let laneClears = 0;
  let laneChanges = 0;
  let ownerChanges = 0;
  let preservedHandoffs = 0;
  let resetHandoffs = 0;
  let continuityBreaks = 0;
  let sameContinuityInstrumentDrift = 0;
  let sameContinuityPhraseDrift = 0;
  let sameContinuityPatternDrift = 0;
  let intentionalIdentityChanges = 0;
  let deferredChanges = 0;
  let appliedDeferredChanges = 0;
  let replacedDeferredChanges = 0;
  let droppedDeferredChanges = 0;
  let rejectedDeferredChanges = 0;
  let totalDeferredWaitSteps = 0;
  let totalRejectedBoundaryDistance = 0;
  let carrierTransferred = 0;
  let carrierUnbound = 0;
  let systemVoiceFallbacks = 0;
  let vacantFallbacks = 0;
  let protectedLaneCarrierUnbound = 0;
  let protectedLaneVacantFallbacks = 0;
  const protectedLaneIds = new Set(['foundation_lane', 'primary_loop_lane', 'secondary_loop_lane']);
  const droppedDeferredByReason = {
    continuityAdvanced: 0,
    sectionAdvanced: 0,
    timeout: 0,
    other: 0,
  };
  for (const e of logs) {
    const type = String(e?.eventType || '').trim().toLowerCase();
    const laneId = String(e?.laneId || '').trim().toLowerCase() || 'unknown';
    if (!byLane[laneId]) {
      byLane[laneId] = {
        starts: 0,
        clears: 0,
        changes: 0,
        ownerChanges: 0,
        preservedHandoffs: 0,
        resetHandoffs: 0,
        continuityBreaks: 0,
        sameContinuityInstrumentDrift: 0,
        sameContinuityPhraseDrift: 0,
        sameContinuityPatternDrift: 0,
        intentionalIdentityChanges: 0,
        deferredChanges: 0,
        appliedDeferredChanges: 0,
        replacedDeferredChanges: 0,
        droppedDeferredChanges: 0,
        rejectedDeferredChanges: 0,
        carrierTransferred: 0,
        carrierUnbound: 0,
        systemVoiceFallbacks: 0,
        vacantFallbacks: 0,
        totalDeferredWaitSteps: 0,
        totalRejectedBoundaryDistance: 0,
        droppedDeferredByReason: {
          continuityAdvanced: 0,
          sectionAdvanced: 0,
          timeout: 0,
          other: 0,
        },
      };
    }
    const row = byLane[laneId];
    if (type === 'music_lane_identity_change_deferred') {
      deferredChanges += 1;
      row.deferredChanges += 1;
      continue;
    }
    if (type === 'music_lane_identity_change_applied') {
      appliedDeferredChanges += 1;
      row.appliedDeferredChanges += 1;
      const waitSteps = Math.max(0, clampInt(e?.waitSteps, 0, 0));
      totalDeferredWaitSteps += waitSteps;
      row.totalDeferredWaitSteps += waitSteps;
      continue;
    }
    if (type === 'music_lane_identity_change_replaced') {
      replacedDeferredChanges += 1;
      row.replacedDeferredChanges += 1;
      continue;
    }
    if (type === 'music_lane_identity_change_dropped') {
      droppedDeferredChanges += 1;
      row.droppedDeferredChanges += 1;
      const reason = String(e?.failureReason || '').trim().toLowerCase();
      const bucket = reason === 'continuity_advanced'
        ? 'continuityAdvanced'
        : reason === 'section_advanced'
          ? 'sectionAdvanced'
          : reason === 'deferred_timeout'
            ? 'timeout'
            : 'other';
      droppedDeferredByReason[bucket] += 1;
      row.droppedDeferredByReason[bucket] += 1;
      continue;
    }
    if (type === 'music_lane_identity_change_rejected') {
      rejectedDeferredChanges += 1;
      row.rejectedDeferredChanges += 1;
      const stepsUntilBoundary = Math.max(0, clampInt(e?.stepsUntilBoundary, 0, 0));
      totalRejectedBoundaryDistance += stepsUntilBoundary;
      row.totalRejectedBoundaryDistance += stepsUntilBoundary;
      continue;
    }
    if (type === 'music_lane_identity_started') {
      laneStarts += 1;
      row.starts += 1;
      continue;
    }
    if (type === 'music_lane_identity_cleared') {
      laneClears += 1;
      row.clears += 1;
      continue;
    }
    if (type !== 'music_lane_identity_changed') continue;
    laneChanges += 1;
    row.changes += 1;
    const ownerChanged = e?.ownerChanged === true;
    const continuityPreserved = e?.continuityPreserved === true;
    const continuityChanged = e?.continuityChanged === true;
    const instrumentChanged = e?.instrumentChanged === true;
    const phraseChanged = e?.phraseChanged === true;
    const patternChanged = e?.patternChanged === true;
    const intentionalIdentityChange = e?.intentionalIdentityChange === true;
    if (intentionalIdentityChange) {
      intentionalIdentityChanges += 1;
      row.intentionalIdentityChanges += 1;
    }
    if (ownerChanged) {
      ownerChanges += 1;
      row.ownerChanges += 1;
      if (continuityPreserved && !instrumentChanged && !phraseChanged) {
        preservedHandoffs += 1;
        row.preservedHandoffs += 1;
      } else if (!intentionalIdentityChange) {
        resetHandoffs += 1;
        row.resetHandoffs += 1;
      }
    }
    if (continuityChanged && !continuityPreserved && !intentionalIdentityChange) {
      continuityBreaks += 1;
      row.continuityBreaks += 1;
    }
    if (continuityPreserved && instrumentChanged && !intentionalIdentityChange) {
      sameContinuityInstrumentDrift += 1;
      row.sameContinuityInstrumentDrift += 1;
    }
    if (continuityPreserved && phraseChanged && !intentionalIdentityChange) {
      sameContinuityPhraseDrift += 1;
      row.sameContinuityPhraseDrift += 1;
    }
    if (continuityPreserved && patternChanged && !intentionalIdentityChange) {
      sameContinuityPatternDrift += 1;
      row.sameContinuityPatternDrift += 1;
    }
  }
  for (const e of carrierEvents) {
    const type = String(e?.eventType || '').trim().toLowerCase();
    const laneId = String(e?.laneId || '').trim().toLowerCase() || 'unknown';
    if (!byLane[laneId]) {
      byLane[laneId] = {
        starts: 0,
        clears: 0,
        changes: 0,
        ownerChanges: 0,
        preservedHandoffs: 0,
        resetHandoffs: 0,
        continuityBreaks: 0,
        sameContinuityInstrumentDrift: 0,
        sameContinuityPhraseDrift: 0,
        sameContinuityPatternDrift: 0,
        intentionalIdentityChanges: 0,
        deferredChanges: 0,
        appliedDeferredChanges: 0,
        replacedDeferredChanges: 0,
        droppedDeferredChanges: 0,
        rejectedDeferredChanges: 0,
        carrierTransferred: 0,
        carrierUnbound: 0,
        systemVoiceFallbacks: 0,
        vacantFallbacks: 0,
        totalDeferredWaitSteps: 0,
        totalRejectedBoundaryDistance: 0,
        droppedDeferredByReason: {
          continuityAdvanced: 0,
          sectionAdvanced: 0,
          timeout: 0,
          other: 0,
        },
      };
    }
    const row = byLane[laneId];
    const embodimentState = String(e?.embodimentState || '').trim().toLowerCase();
    if (type === 'music_lane_carrier_transferred') {
      carrierTransferred += 1;
      row.carrierTransferred = clampInt(row.carrierTransferred, 0, 0) + 1;
    } else {
      carrierUnbound += 1;
      row.carrierUnbound = clampInt(row.carrierUnbound, 0, 0) + 1;
      if (protectedLaneIds.has(laneId)) protectedLaneCarrierUnbound += 1;
    }
    if (embodimentState === 'system_voice') {
      systemVoiceFallbacks += 1;
      row.systemVoiceFallbacks = clampInt(row.systemVoiceFallbacks, 0, 0) + 1;
    } else if (embodimentState === 'vacant') {
      vacantFallbacks += 1;
      row.vacantFallbacks = clampInt(row.vacantFallbacks, 0, 0) + 1;
      if (protectedLaneIds.has(laneId)) protectedLaneVacantFallbacks += 1;
    }
  }
  const laneContinuityAssertionPassed = (
    resetHandoffs === 0
    && continuityBreaks === 0
    && sameContinuityInstrumentDrift === 0
    && sameContinuityPhraseDrift === 0
    && protectedLaneVacantFallbacks === 0
  );
  return {
    totalLogs: logs.length,
    laneStarts,
    laneClears,
    laneChanges,
    ownerChanges,
    preservedHandoffs,
    resetHandoffs,
    continuityBreaks,
    sameContinuityInstrumentDrift,
    sameContinuityPhraseDrift,
    sameContinuityPatternDrift,
    intentionalIdentityChanges,
    deferredChanges,
    appliedDeferredChanges,
    replacedDeferredChanges,
    droppedDeferredChanges,
    rejectedDeferredChanges,
    droppedDeferredByReason,
    avgDeferredWaitSteps: appliedDeferredChanges > 0 ? (totalDeferredWaitSteps / appliedDeferredChanges) : 0,
    avgRejectedBoundaryDistance: rejectedDeferredChanges > 0 ? (totalRejectedBoundaryDistance / rejectedDeferredChanges) : 0,
    carrierTransferred,
    carrierUnbound,
    systemVoiceFallbacks,
    vacantFallbacks,
    protectedLaneCarrierUnbound,
    protectedLaneVacantFallbacks,
    laneContinuityAssertionPassed,
    byLane,
  };
}
function collectDecisionMakingDiagnostics(session, maxBarIndex) {
  const logs = (Array.isArray(session?.systemEvents) ? session.systemEvents : [])
    .filter((e) => clampInt(e?.barIndex, 0, 0) <= maxBarIndex);
  const byDecisionReason = Object.create(null);
  let gameplaySuppressionEvents = 0;
  let gameplaySuppressionDrops = 0;
  let gameplaySuppressionSoftens = 0;
  let stepArbitrationChanges = 0;
  let bassOwnerChoices = 0;
  let rhythmTierSelections = 0;
  let protectedLaneClaimsInferred = 0;
  let protectedLaneClaimsMissing = 0;
  let executionInstrumentChanges = 0;
  let executionInstrumentChangesSameContinuity = 0;
  let executionInstrumentChangesNewContinuity = 0;
  let executionInstrumentChangesProtectedLane = 0;
  let executionInstrumentChangesSupportLane = 0;
  let executionInstrumentChangesBufferTakeover = 0;
  let executionInstrumentChangesUnscoped = 0;
  let executionInstrumentChangesPerformerChange = 0;
  let executionInstrumentChangesGroupChange = 0;
  let executionInstrumentChangesSectionChange = 0;
  let executionInstrumentChangesMotifScopeChange = 0;
  let executionInstrumentChangesRetiringOwner = 0;
  let executionInstrumentChangesExplicitReorchestration = 0;
  let executionInstrumentChangesContinuityReset = 0;
  let executionInstrumentChangesUnknownCause = 0;
  let instrumentPoolAuditEvents = 0;
  let instrumentPoolEligibleTotal = 0;
  let instrumentPoolUnusedEligibleTotal = 0;
  let instrumentPoolPriorityEligibleTotal = 0;
  let instrumentPoolUnreachableCount = 0;
  let structureIntentEvents = 0;
  let structureBuildBars = 0;
  let structureDriveBars = 0;
  let structureDropBars = 0;
  let structurePeakBars = 0;
  let structurePreDropBars = 0;
  let structurePreDropNearBars = 0;
  let motifReturnEvents = 0;
  let motifReturnActiveBars = 0;
  let motifReturnBuildBars = 0;
  let motifReturnDriveBars = 0;
  let motifReturnPeakBars = 0;
  let foregroundMotifUsageEvents = 0;
  let foregroundMotifReturnBars = 0;
  let foregroundMotifReturnMatchingBars = 0;
  let foregroundMotifPrimaryLoopReturnBars = 0;
  let harmonyAuthorityEvents = 0;
  let harmonyWeaponAnchorBars = 0;
  let harmonyFallbackBars = 0;
  let harmonyRelativeShiftBars = 0;
  let harmonyWeaponMappingMismatchBars = 0;
  let harmonyWeaponMappingMismatchCount = 0;
  let harmonyWeaponOutsidePoolBars = 0;
  let harmonyWeaponOutsidePoolCount = 0;
  let slotSpawnerRawPulseEvents = 0;
  let slotSpawnerRawBackbeatEvents = 0;
  let slotSpawnerQueuedPulseEvents = 0;
  let slotSpawnerQueuedBackbeatEvents = 0;
  let slotSpawnerDrainedPulseEvents = 0;
  let slotSpawnerDrainedBackbeatEvents = 0;
  let slotSpawnerFilteredPulseEvents = 0;
  let slotSpawnerFilteredBackbeatEvents = 0;
  let slotSpawnerShapedPulseEvents = 0;
  let slotSpawnerShapedBackbeatEvents = 0;
  let slotSpawnerExecutedPulseEvents = 0;
  let slotSpawnerExecutedBackbeatEvents = 0;
  let slotSpawnerLoopStateChanges = 0;
  let slotSpawnerLoopStateIntroProtectedChanges = 0;
  let slotSpawnerLoopStateBlendWindowChanges = 0;
  let introDrumFirstNoteEvents = 0;
  let introDrumFirstNoteOffC3Events = 0;
  let slotSpawnerEmitIdentityEvents = 0;
  let slotSpawnerEmitPulseIdentityEvents = 0;
  let slotSpawnerEmitBackbeatIdentityEvents = 0;
  let slotSpawnerAssignmentEvents = 0;
  let slotSpawnerAssignmentCreatedEvents = 0;
  let slotSpawnerAssignmentSyncEvents = 0;
  let slotSpawnerVisualIdentityEvents = 0;
  for (const e of logs) {
    const type = String(e?.eventType || '').trim().toLowerCase();
    if (type === 'music_gameplay_suppression_decision') {
      gameplaySuppressionEvents += 1;
      const decision = String(e?.decision || '').trim().toLowerCase();
      if (decision === 'drop') gameplaySuppressionDrops += 1;
      else if (decision === 'soften') gameplaySuppressionSoftens += 1;
      const reason = String(e?.reason || '').trim().toLowerCase() || 'unknown';
      byDecisionReason[reason] = clampInt(byDecisionReason[reason], 0, 0) + 1;
      continue;
    }
    if (type === 'music_step_arbitration') {
      stepArbitrationChanges += 1;
      const reason = String(e?.decisionReason || '').trim().toLowerCase() || 'unknown';
      byDecisionReason[reason] = clampInt(byDecisionReason[reason], 0, 0) + 1;
      continue;
    }
    if (type === 'music_bass_foundation_owner_choice') {
      bassOwnerChoices += 1;
      continue;
    }
    if (type === 'music_rhythm_tier_selected') {
      rhythmTierSelections += 1;
      continue;
    }
    if (type === 'music_protected_lane_claim_inferred') {
      protectedLaneClaimsInferred += 1;
      continue;
    }
    if (type === 'music_protected_lane_claim_missing') {
      protectedLaneClaimsMissing += 1;
      continue;
    }
    if (type === 'music_execution_instrument_change') {
      executionInstrumentChanges += 1;
      const continuityClass = String(e?.continuityClass || '').trim().toLowerCase();
      if (continuityClass === 'same_continuity') executionInstrumentChangesSameContinuity += 1;
      else if (continuityClass === 'new_continuity') executionInstrumentChangesNewContinuity += 1;
      const laneScope = String(e?.laneScope || '').trim().toLowerCase();
      if (laneScope === 'protected_lane') executionInstrumentChangesProtectedLane += 1;
      else if (laneScope === 'support_lane') executionInstrumentChangesSupportLane += 1;
      else if (laneScope === 'buffer_takeover') executionInstrumentChangesBufferTakeover += 1;
      else executionInstrumentChangesUnscoped += 1;
      const cause = String(e?.cause || '').trim().toLowerCase();
      if (cause === 'performer_change') executionInstrumentChangesPerformerChange += 1;
      else if (cause === 'group_change') executionInstrumentChangesGroupChange += 1;
      else if (cause === 'section_change' || cause === 'section_restatement') executionInstrumentChangesSectionChange += 1;
      else if (cause === 'motif_scope_change') executionInstrumentChangesMotifScopeChange += 1;
      else if (cause === 'retiring_owner') executionInstrumentChangesRetiringOwner += 1;
      else if (cause === 'explicit_reorchestration') executionInstrumentChangesExplicitReorchestration += 1;
      else if (cause === 'continuity_reset') executionInstrumentChangesContinuityReset += 1;
      else executionInstrumentChangesUnknownCause += 1;
      continue;
    }
    if (type === 'music_enemy_instrument_pool_audit') {
      instrumentPoolAuditEvents += 1;
      instrumentPoolEligibleTotal += Math.max(0, clampInt(e?.eligibleCount, 0, 0));
      instrumentPoolUnusedEligibleTotal += Math.max(0, clampInt(e?.unusedEligibleCount, 0, 0));
      instrumentPoolPriorityEligibleTotal += Math.max(0, clampInt(e?.priorityEligibleCount, 0, 0));
      continue;
    }
    if (type === 'music_enemy_instrument_pool_unreachable') {
      instrumentPoolUnreachableCount += Math.max(0, clampInt(e?.unreachableCount, 0, 0));
      continue;
    }
    if (type === 'music_structure_intent_state') {
      structureIntentEvents += 1;
      const intent = String(e?.intent || '').trim().toLowerCase();
      if (intent === 'build') structureBuildBars += 1;
      else if (intent === 'drive') structureDriveBars += 1;
      else if (intent === 'drop') structureDropBars += 1;
      else if (intent === 'peak') structurePeakBars += 1;
      if (e?.preDropActive === true) {
        structurePreDropBars += 1;
        if (Math.max(-1, clampInt(e?.preDropBarsRemaining, -1, -1)) >= 0 && Math.max(-1, clampInt(e?.preDropBarsRemaining, -1, -1)) <= 2) {
          structurePreDropNearBars += 1;
        }
      }
      continue;
    }
    if (type === 'music_motif_return_state') {
      motifReturnEvents += 1;
      if (e?.returnActive === true) {
        motifReturnActiveBars += 1;
        const intent = String(e?.intent || '').trim().toLowerCase();
        if (intent === 'build') motifReturnBuildBars += 1;
        else if (intent === 'drive') motifReturnDriveBars += 1;
        else if (intent === 'peak') motifReturnPeakBars += 1;
      }
      continue;
    }
    if (type === 'music_foreground_motif_usage') {
      foregroundMotifUsageEvents += 1;
      if (e?.returnActive === true) {
        foregroundMotifReturnBars += 1;
        if (Math.max(0, clampInt(e?.matchingScopeSnakeCount, 0, 0)) > 0) {
          foregroundMotifReturnMatchingBars += 1;
        }
        if (e?.primaryLoopUsesScope === true) {
          foregroundMotifPrimaryLoopReturnBars += 1;
        }
      }
      continue;
    }
    if (type === 'music_harmony_authority_state') {
      harmonyAuthorityEvents += 1;
      if (String(e?.authoritySource || '').trim().toLowerCase() === 'weapon_active_slot') harmonyWeaponAnchorBars += 1;
      if (e?.fallbackUsed === true) harmonyFallbackBars += 1;
      if (e?.relativeShiftActive === true) harmonyRelativeShiftBars += 1;
      const mappingMismatchCount = Math.max(0, clampInt(e?.weaponMappingMismatchCount, 0, 0));
      harmonyWeaponMappingMismatchCount += mappingMismatchCount;
      if (mappingMismatchCount > 0) harmonyWeaponMappingMismatchBars += 1;
      const outsidePoolCount = Math.max(0, clampInt(e?.weaponOutsidePoolCount, 0, 0));
      harmonyWeaponOutsidePoolCount += outsidePoolCount;
      if (outsidePoolCount > 0) harmonyWeaponOutsidePoolBars += 1;
      continue;
    }
    if (type === 'music_slot_spawner_stage') {
      const stage = String(e?.stage || '').trim().toLowerCase();
      const key = String(e?.musicVoiceKey || '').trim().toLowerCase();
      if (key === 'percussion_pulse') {
        if (stage === 'raw') slotSpawnerRawPulseEvents += 1;
        else if (stage === 'queued') slotSpawnerQueuedPulseEvents += 1;
        else if (stage === 'drained') slotSpawnerDrainedPulseEvents += 1;
        else if (stage === 'filtered') slotSpawnerFilteredPulseEvents += 1;
        else if (stage === 'shaped') slotSpawnerShapedPulseEvents += 1;
        else if (stage === 'executed') slotSpawnerExecutedPulseEvents += 1;
      } else if (key === 'percussion_backbeat') {
        if (stage === 'raw') slotSpawnerRawBackbeatEvents += 1;
        else if (stage === 'queued') slotSpawnerQueuedBackbeatEvents += 1;
        else if (stage === 'drained') slotSpawnerDrainedBackbeatEvents += 1;
        else if (stage === 'filtered') slotSpawnerFilteredBackbeatEvents += 1;
        else if (stage === 'shaped') slotSpawnerShapedBackbeatEvents += 1;
        else if (stage === 'executed') slotSpawnerExecutedBackbeatEvents += 1;
      }
      continue;
    }
    if (type === 'music_slot_spawner_loop_state_change') {
      slotSpawnerLoopStateChanges += 1;
      if (e?.introDrumProtected === true) slotSpawnerLoopStateIntroProtectedChanges += 1;
      if (e?.introPrimaryLoopBlendWindow === true) slotSpawnerLoopStateBlendWindowChanges += 1;
      continue;
    }
    if (type === 'music_intro_drum_first_note') {
      introDrumFirstNoteEvents += 1;
      if (String(e?.resolvedNote || '').trim().toUpperCase() !== 'C3') introDrumFirstNoteOffC3Events += 1;
      continue;
    }
    if (type === 'music_slot_spawner_emit_identity') {
      slotSpawnerEmitIdentityEvents += 1;
      const key = String(e?.musicVoiceKey || '').trim().toLowerCase();
      if (key === 'percussion_pulse') slotSpawnerEmitPulseIdentityEvents += 1;
      else if (key === 'percussion_backbeat') slotSpawnerEmitBackbeatIdentityEvents += 1;
      continue;
    }
    if (type === 'music_slot_spawner_assignment') {
      slotSpawnerAssignmentEvents += 1;
      const stage = String(e?.stage || '').trim().toLowerCase();
      if (stage === 'ensure_created') slotSpawnerAssignmentCreatedEvents += 1;
      else if (stage === 'sync_group') slotSpawnerAssignmentSyncEvents += 1;
      continue;
    }
    if (type === 'music_slot_spawner_visual_identity') {
      slotSpawnerVisualIdentityEvents += 1;
      continue;
    }
  }
  return {
    gameplaySuppressionEvents,
    gameplaySuppressionDrops,
    gameplaySuppressionSoftens,
    stepArbitrationChanges,
    bassOwnerChoices,
    rhythmTierSelections,
    protectedLaneClaimsInferred,
    protectedLaneClaimsMissing,
    executionInstrumentChanges,
    executionInstrumentChangesSameContinuity,
    executionInstrumentChangesNewContinuity,
    executionInstrumentChangesProtectedLane,
    executionInstrumentChangesSupportLane,
    executionInstrumentChangesBufferTakeover,
    executionInstrumentChangesUnscoped,
    executionInstrumentChangesPerformerChange,
    executionInstrumentChangesGroupChange,
    executionInstrumentChangesSectionChange,
    executionInstrumentChangesMotifScopeChange,
    executionInstrumentChangesRetiringOwner,
    executionInstrumentChangesExplicitReorchestration,
    executionInstrumentChangesContinuityReset,
    executionInstrumentChangesUnknownCause,
    instrumentPoolAuditEvents,
    instrumentPoolEligibleTotal,
    instrumentPoolUnusedEligibleTotal,
    instrumentPoolPriorityEligibleTotal,
    instrumentPoolUnreachableCount,
    structureIntentEvents,
    structureBuildBars,
    structureDriveBars,
    structureDropBars,
    structurePeakBars,
    structurePreDropBars,
    structurePreDropNearBars,
    motifReturnEvents,
    motifReturnActiveBars,
    motifReturnBuildBars,
    motifReturnDriveBars,
    motifReturnPeakBars,
    foregroundMotifUsageEvents,
    foregroundMotifReturnBars,
    foregroundMotifReturnMatchingBars,
    foregroundMotifPrimaryLoopReturnBars,
    harmonyAuthorityEvents,
    harmonyWeaponAnchorBars,
    harmonyFallbackBars,
    harmonyRelativeShiftBars,
    harmonyWeaponMappingMismatchBars,
    harmonyWeaponMappingMismatchCount,
    harmonyWeaponOutsidePoolBars,
    harmonyWeaponOutsidePoolCount,
    slotSpawnerRawPulseEvents,
    slotSpawnerRawBackbeatEvents,
    slotSpawnerQueuedPulseEvents,
    slotSpawnerQueuedBackbeatEvents,
    slotSpawnerDrainedPulseEvents,
    slotSpawnerDrainedBackbeatEvents,
    slotSpawnerFilteredPulseEvents,
    slotSpawnerFilteredBackbeatEvents,
    slotSpawnerShapedPulseEvents,
    slotSpawnerShapedBackbeatEvents,
    slotSpawnerExecutedPulseEvents,
    slotSpawnerExecutedBackbeatEvents,
    slotSpawnerLoopStateChanges,
    slotSpawnerLoopStateIntroProtectedChanges,
    slotSpawnerLoopStateBlendWindowChanges,
    introDrumFirstNoteEvents,
    introDrumFirstNoteOffC3Events,
    slotSpawnerEmitIdentityEvents,
    slotSpawnerEmitPulseIdentityEvents,
    slotSpawnerEmitBackbeatIdentityEvents,
    slotSpawnerAssignmentEvents,
    slotSpawnerAssignmentCreatedEvents,
    slotSpawnerAssignmentSyncEvents,
    slotSpawnerVisualIdentityEvents,
    byDecisionReason,
  };
}

function collectPassDiagnostics(executedEvents, session, maxBarIndex, handoff, spawnerPipeline) {
  const bassStability = collectBassStabilityDiagnostics(executedEvents, handoff);
  const identityStability = collectIdentityStabilityDiagnostics(session, maxBarIndex);
  const ownershipContinuity = collectLaneOwnershipDiagnostics(session, maxBarIndex);
  const decisionMaking = collectDecisionMakingDiagnostics(session, maxBarIndex);
  const delivery = collectDeliveryDiagnostics(session, maxBarIndex);
  const spawnerFeedback = {
    spawnerGameplayEvents: Math.max(0, clampInt(spawnerPipeline?.spawnerGameplayEvents, 0, 0)),
    spawnerVisualEvents: Math.max(0, clampInt(spawnerPipeline?.spawnerVisualEvents, 0, 0)),
    spawnerAudioEvents: Math.max(0, clampInt(spawnerPipeline?.spawnerAudioEvents, 0, 0)),
    spawnerMismatchCount: (
      Math.max(0, clampInt(spawnerPipeline?.spawnerPipelineMismatches, 0, 0))
      + Math.max(0, clampInt(spawnerPipeline?.audioShortfall, 0, 0))
      + Math.max(0, clampInt(spawnerPipeline?.visualShortfall, 0, 0))
      + Math.max(0, clampInt(spawnerPipeline?.loopgridShortfall, 0, 0))
    ),
  };
  return { bassStability, identityStability, ownershipContinuity, decisionMaking, spawnerFeedback, delivery };
}

function collectSectionStability(session, maxBarIndex) {
  const sectionChanges = (Array.isArray(session?.systemEvents) ? session.systemEvents : [])
    .filter((e) => clampInt(e?.barIndex, 0, 0) <= maxBarIndex)
    .filter((e) => String(e?.eventType || '').trim().toLowerCase() === 'music_section_changed');
  const durations = sectionChanges
    .map((e) => clampInt(e?.sectionDurationBars, 0, 0))
    .filter((n) => n > 0);
  const totalDur = durations.reduce((acc, n) => acc + n, 0);
  const avgDurationBars = durations.length ? (totalDur / durations.length) : Math.max(1, maxBarIndex + 1);
  const minDurationBars = durations.length ? Math.min(...durations) : Math.max(1, maxBarIndex + 1);
  const maxDurationBars = durations.length ? Math.max(...durations) : Math.max(1, maxBarIndex + 1);
  const shortSections = durations.filter((n) => n < 8).length;
  return {
    sectionChanges: sectionChanges.length,
    avgDurationBars,
    minDurationBars,
    maxDurationBars,
    shortSections,
  };
}

function collectSectionPresentation(session, maxBarIndex) {
  const sectionChanges = (Array.isArray(session?.systemEvents) ? session.systemEvents : [])
    .filter((e) => clampInt(e?.barIndex, 0, 0) <= maxBarIndex)
    .filter((e) => String(e?.eventType || '').trim().toLowerCase() === 'music_section_changed');
  const totalSectionChanges = sectionChanges.length;
  if (!totalSectionChanges) {
    return {
      totalSectionChanges: 0,
      namedSectionChanges: 0,
      headingCoverageRate: 0,
      uniqueSectionIds: 0,
      uniqueHeadingTitles: 0,
      uniqueMovementCycles: 0,
      avgBarsBetweenHeadingChanges: 0,
      headingRepeatRate: 0,
      meaningfulTitleRate: 0,
      meaningfulTitleCount: 0,
      meaningfulReasonCounts: {},
      meaningfulFailureReasonCounts: {},
      headingFlavorTagCounts: {},
    };
  }
  const namedChanges = sectionChanges.filter((e) => String(e?.headingTitle || '').trim().length > 0);
  const namedSectionChanges = namedChanges.length;
  const headingCoverageRate = totalSectionChanges > 0 ? (namedSectionChanges / totalSectionChanges) : 0;
  const sectionIdSet = new Set(
    sectionChanges
      .map((e) => String(e?.sectionId || '').trim().toLowerCase())
      .filter((s) => s)
  );
  const headingTitleSet = new Set(
    namedChanges
      .map((e) => String(e?.headingTitle || '').trim())
      .filter((s) => s)
  );
  const movementCycleSet = new Set(
    sectionChanges
      .map((e) => clampInt(e?.sectionCycle, -1, -1))
      .filter((n) => n >= 0)
  );
  let spanTotal = 0;
  let spanCount = 0;
  const orderedNamed = namedChanges
    .slice()
    .sort((a, b) => clampInt(a?.barIndex, 0, 0) - clampInt(b?.barIndex, 0, 0));
  for (let i = 1; i < orderedNamed.length; i++) {
    const prevBar = clampInt(orderedNamed[i - 1]?.barIndex, 0, 0);
    const nextBar = clampInt(orderedNamed[i]?.barIndex, 0, 0);
    if (nextBar > prevBar) {
      spanTotal += (nextBar - prevBar);
      spanCount += 1;
    }
  }
  const avgBarsBetweenHeadingChanges = spanCount > 0 ? (spanTotal / spanCount) : Math.max(1, maxBarIndex + 1);
  const headingRepeatRate = namedSectionChanges > 0
    ? Math.max(0, 1 - (headingTitleSet.size / namedSectionChanges))
    : 0;
  const meaningfulReasonCounts = Object.create(null);
  const meaningfulFailureReasonCounts = Object.create(null);
  const headingFlavorTagCounts = Object.create(null);
  for (const e of sectionChanges) {
    for (const key of Array.isArray(e?.meaningfulTransitionReasons) ? e.meaningfulTransitionReasons : []) {
      const k = String(key || '').trim().toLowerCase();
      if (!k) continue;
      meaningfulReasonCounts[k] = clampInt(meaningfulReasonCounts[k], 0, 0) + 1;
    }
    for (const key of Array.isArray(e?.meaningfulTransitionFailedReasons) ? e.meaningfulTransitionFailedReasons : []) {
      const k = String(key || '').trim().toLowerCase();
      if (!k) continue;
      meaningfulFailureReasonCounts[k] = clampInt(meaningfulFailureReasonCounts[k], 0, 0) + 1;
    }
    const tag = String(e?.headingFlavorTag || '').trim().toLowerCase();
    if (tag) headingFlavorTagCounts[tag] = clampInt(headingFlavorTagCounts[tag], 0, 0) + 1;
  }
  const meaningfulTitleCount = namedChanges.filter((e) => {
    if (e?.meaningfulTransitionEligible === true) return true;
    if (e?.gameplayDeltaSignificant === true) return true;
    const deltaEnemy = Math.abs(clampInt(e?.gameplayDeltaEnemyCount, 0, 0));
    const deltaProjectile = Math.abs(clampInt(e?.gameplayDeltaProjectileCount, 0, 0));
    const deltaRole = Math.abs(clampInt(e?.gameplayDeltaRoleCount, 0, 0));
    const deltaThreat = Math.abs(clampInt(e?.gameplayDeltaThreatUsage, 0, 0));
    const deltaMix = Math.abs(Number(e?.gameplayDeltaMixShift) || 0);
    return deltaEnemy >= 3 || deltaRole >= 1 || deltaThreat >= 2 || deltaProjectile >= 4 || deltaMix >= 0.22;
  }).length;
  const meaningfulTitleRate = namedSectionChanges > 0 ? (meaningfulTitleCount / namedSectionChanges) : 0;
  return {
    totalSectionChanges,
    namedSectionChanges,
    headingCoverageRate,
    uniqueSectionIds: sectionIdSet.size,
    uniqueHeadingTitles: headingTitleSet.size,
    uniqueMovementCycles: movementCycleSet.size,
    avgBarsBetweenHeadingChanges,
    headingRepeatRate,
    meaningfulTitleRate,
    meaningfulTitleCount,
    meaningfulReasonCounts,
    meaningfulFailureReasonCounts,
    headingFlavorTagCounts,
  };
}

function collectReadabilityStructureOnboarding(session, maxBarIndex) {
  const snaps = (Array.isArray(session?.systemEvents) ? session.systemEvents : [])
    .filter((e) => clampInt(e?.barIndex, 0, 0) <= maxBarIndex)
    .filter((e) => String(e?.eventType || '').trim().toLowerCase() === 'music_readability_snapshot');
  const snapshotCount = snaps.length;
  if (!snapshotCount) {
    return {
      readability: {
        snapshotCount: 0,
        avgPlayerMaskingRisk: 0,
        avgSameRegisterOverlapRisk: 0,
        avgPlayerAudibleShare: 0,
        avgEnemyForegroundShare: 0,
        avgEnemyCompetitionShare: 0,
        phaseCounts: {},
      },
      structure: {
        snapshotCount: 0,
        avgFoundationContinuityBars: 0,
        avgFoundationAudibleEvents: 0,
        avgLoopAudibleEvents: 0,
        avgSparkleAudibleEvents: 0,
        avgSparkleSuppressedEvents: 0,
        sectionIdCounts: {},
      },
      onboarding: {
        snapshotCount: 0,
        avgKnownIdentityCount: 0,
        avgRecentNovelIdentityCount: 0,
        maxKnownIdentityCount: 0,
        maxRecentNovelIdentityCount: 0,
        noveltyPressureRate: 0,
      },
    };
  }
  let sumMaskingRisk = 0;
  let sumOverlapRisk = 0;
  let sumPlayerAudibleShare = 0;
  let sumEnemyForegroundShare = 0;
  let sumEnemyNonFoundationForegroundShare = 0;
  let sumEnemyCompetitionShare = 0;
  let sumFoundationContinuityBars = 0;
  let sumFoundationAudibleEvents = 0;
  let sumLoopAudibleEvents = 0;
  let sumSparkleAudibleEvents = 0;
  let sumSparkleSuppressedEvents = 0;
  let sumKnownIdentityCount = 0;
  let sumRecentNovelIdentityCount = 0;
  let maxKnownIdentityCount = 0;
  let maxRecentNovelIdentityCount = 0;
  let noveltyPressureCount = 0;
  const phaseCounts = Object.create(null);
  const sectionIdCounts = Object.create(null);
  for (const s of snaps) {
    const r = s?.readability && typeof s.readability === 'object' ? s.readability : {};
    const st = s?.structure && typeof s.structure === 'object' ? s.structure : {};
    const on = s?.onboarding && typeof s.onboarding === 'object' ? s.onboarding : {};
    const enemyEvents = Math.max(0, clampInt(r?.enemyEvents, 0, 0));
    const enemyForegroundEvents = Math.max(0, clampInt(r?.enemyForegroundEvents, 0, 0));
    const enemyNonFoundationForegroundEvents = Math.max(0, clampInt(r?.enemyNonFoundationForegroundEvents, 0, 0));
    const enemyCompetingDuringPlayer = Math.max(0, clampInt(r?.enemyCompetingDuringPlayer, 0, 0));
    const foregroundShare = enemyEvents > 0 ? (enemyForegroundEvents / enemyEvents) : 0;
    const nonFoundationForegroundShare = enemyEvents > 0 ? (enemyNonFoundationForegroundEvents / enemyEvents) : 0;
    const competitionShare = enemyEvents > 0 ? (enemyCompetingDuringPlayer / enemyEvents) : 0;
    sumMaskingRisk += Number(r?.playerMaskingRisk) || 0;
    sumOverlapRisk += Number(r?.sameRegisterOverlapRisk) || 0;
    sumPlayerAudibleShare += Number(r?.playerAudibleShare) || 0;
    sumEnemyForegroundShare += foregroundShare;
    sumEnemyNonFoundationForegroundShare += nonFoundationForegroundShare;
    sumEnemyCompetitionShare += competitionShare;
    sumFoundationContinuityBars += Math.max(0, clampInt(st?.foundationContinuityBars, 0, 0));
    sumFoundationAudibleEvents += Math.max(0, clampInt(st?.foundationAudibleEvents, 0, 0));
    sumLoopAudibleEvents += Math.max(0, clampInt(st?.loopAudibleEvents, 0, 0));
    sumSparkleAudibleEvents += Math.max(0, clampInt(st?.sparkleAudibleEvents, 0, 0));
    sumSparkleSuppressedEvents += Math.max(0, clampInt(st?.sparkleSuppressedEvents, 0, 0));
    const knownIdentityCount = Math.max(0, clampInt(on?.knownIdentityCount, 0, 0));
    const recentNovelIdentityCount = Math.max(0, clampInt(on?.recentNovelIdentityCount, 0, 0));
    sumKnownIdentityCount += knownIdentityCount;
    sumRecentNovelIdentityCount += recentNovelIdentityCount;
    if (knownIdentityCount > maxKnownIdentityCount) maxKnownIdentityCount = knownIdentityCount;
    if (recentNovelIdentityCount > maxRecentNovelIdentityCount) maxRecentNovelIdentityCount = recentNovelIdentityCount;
    if (recentNovelIdentityCount >= 2) noveltyPressureCount += 1;
    const phaseId = String(s?.onboardingPhase || '').trim().toLowerCase() || 'unknown';
    phaseCounts[phaseId] = clampInt(phaseCounts[phaseId], 0, 0) + 1;
    const sectionId = String(st?.sectionId || '').trim().toLowerCase() || 'unknown';
    sectionIdCounts[sectionId] = clampInt(sectionIdCounts[sectionId], 0, 0) + 1;
  }
  return {
    readability: {
      snapshotCount,
      avgPlayerMaskingRisk: snapshotCount > 0 ? (sumMaskingRisk / snapshotCount) : 0,
      avgSameRegisterOverlapRisk: snapshotCount > 0 ? (sumOverlapRisk / snapshotCount) : 0,
      avgPlayerAudibleShare: snapshotCount > 0 ? (sumPlayerAudibleShare / snapshotCount) : 0,
      avgEnemyForegroundShare: snapshotCount > 0 ? (sumEnemyForegroundShare / snapshotCount) : 0,
      avgEnemyNonFoundationForegroundShare: snapshotCount > 0 ? (sumEnemyNonFoundationForegroundShare / snapshotCount) : 0,
      avgEnemyCompetitionShare: snapshotCount > 0 ? (sumEnemyCompetitionShare / snapshotCount) : 0,
      phaseCounts,
    },
    structure: {
      snapshotCount,
      avgFoundationContinuityBars: snapshotCount > 0 ? (sumFoundationContinuityBars / snapshotCount) : 0,
      avgFoundationAudibleEvents: snapshotCount > 0 ? (sumFoundationAudibleEvents / snapshotCount) : 0,
      avgLoopAudibleEvents: snapshotCount > 0 ? (sumLoopAudibleEvents / snapshotCount) : 0,
      avgSparkleAudibleEvents: snapshotCount > 0 ? (sumSparkleAudibleEvents / snapshotCount) : 0,
      avgSparkleSuppressedEvents: snapshotCount > 0 ? (sumSparkleSuppressedEvents / snapshotCount) : 0,
      sectionIdCounts,
    },
    onboarding: {
      snapshotCount,
      avgKnownIdentityCount: snapshotCount > 0 ? (sumKnownIdentityCount / snapshotCount) : 0,
      avgRecentNovelIdentityCount: snapshotCount > 0 ? (sumRecentNovelIdentityCount / snapshotCount) : 0,
      maxKnownIdentityCount,
      maxRecentNovelIdentityCount,
      noveltyPressureRate: snapshotCount > 0 ? (noveltyPressureCount / snapshotCount) : 0,
    },
  };
}

function collectHierarchyModelDiagnostics(
  executedEvents,
  maxBarIndex,
  passDiagnostics,
  motifReuse,
  motifPersistence
) {
  const barsConsidered = Math.max(1, clampInt(maxBarIndex, 0, 0) + 1);
  const actionable = (Array.isArray(executedEvents) ? executedEvents : []).filter((ev) => {
    const src = String(ev?.sourceSystem || '').trim().toLowerCase();
    if (src === 'player' || src === 'death' || src === 'unknown') return false;
    return true;
  });
  const foundationEvents = actionable.filter((ev) => (
    String(ev?.musicLayer || '').trim().toLowerCase() === 'foundation'
    && String(ev?.role || '').trim().toLowerCase() === 'bass'
    && String(ev?.musicProminence || '').trim().toLowerCase() !== 'suppressed'
  ));
  let sparkleAudibleEvents = 0;
  let sparkleForegroundEvents = 0;
  let totalForegroundEvents = 0;
  const foundationSlots = new Set();
  const foundationPatternsByBar = new Map();
  const foregroundLanesByBar = new Map();
  const firstForegroundBarByIdentity = new Map();
  const orderedForegroundLoopIdentityByBar = new Map();
  let onBeatRun = 0;
  let maxOnBeatRun = 0;
  for (const ev of actionable) {
    const layer = String(ev?.musicLayer || '').trim().toLowerCase();
    const prominence = String(ev?.musicProminence || '').trim().toLowerCase();
    const bar = clampInt(ev?.barIndex, 0, 0);
    const step = ((clampInt(ev?.stepIndex, 0, 0) % 8) + 8) % 8;
    if (prominence === 'full') totalForegroundEvents += 1;
    if (layer !== 'sparkle') continue;
    if (prominence !== 'suppressed') sparkleAudibleEvents += 1;
    if (prominence === 'full') sparkleForegroundEvents += 1;
  }
  for (const ev of foundationEvents) {
    const bar = clampInt(ev?.barIndex, 0, 0);
    const step = ((clampInt(ev?.stepIndex, 0, 0) % 8) + 8) % 8;
    foundationSlots.add(`${bar}:${step}`);
    if (!foundationPatternsByBar.has(bar)) foundationPatternsByBar.set(bar, Array(8).fill('0'));
    foundationPatternsByBar.get(bar)[step] = '1';
  }
  const orderedFoundationSlots = Array.from(foundationSlots)
    .map((key) => {
      const [barText, stepText] = String(key).split(':');
      return { bar: clampInt(barText, 0, 0), step: clampInt(stepText, 0, 0) };
    })
    .sort((a, b) => (a.bar - b.bar) || (a.step - b.step));
  for (const slot of orderedFoundationSlots) {
    if ((slot.step % 2) === 0) {
      onBeatRun += 1;
      if (onBeatRun > maxOnBeatRun) maxOnBeatRun = onBeatRun;
    } else {
      onBeatRun = 0;
    }
  }
  for (const ev of actionable) {
    const prominence = String(ev?.musicProminence || '').trim().toLowerCase();
    if (prominence !== 'full') continue;
    const bar = clampInt(ev?.barIndex, 0, 0);
    const laneBucket = foregroundLanesByBar.get(bar) || new Set();
    const laneKey = [
      String(ev?.musicLayer || '').trim().toLowerCase(),
      String(ev?.enemyType || '').trim().toLowerCase(),
      String(ev?.role || '').trim().toLowerCase(),
    ].join('|');
    laneBucket.add(laneKey);
    foregroundLanesByBar.set(bar, laneBucket);
    if (String(ev?.musicLayer || '').trim().toLowerCase() === 'foundation') continue;
    const identityKey = `${String(ev?.enemyType || '').trim().toLowerCase()}|${String(ev?.role || '').trim().toLowerCase()}|${String(ev?.musicLayer || '').trim().toLowerCase()}`;
    if (identityKey && !firstForegroundBarByIdentity.has(identityKey)) {
      firstForegroundBarByIdentity.set(identityKey, bar);
    }
    if (String(ev?.musicLayer || '').trim().toLowerCase() === 'loops') {
      const loopIdentityKey = String(ev?.continuityId || identityKey).trim().toLowerCase() || identityKey;
      if (loopIdentityKey && !orderedForegroundLoopIdentityByBar.has(bar)) {
        orderedForegroundLoopIdentityByBar.set(bar, loopIdentityKey);
      }
    }
  }
  const foundationPatternStrings = Array.from(foundationPatternsByBar.values()).map((steps) => steps.join(''));
  let foundationPatternChanges = 0;
  for (let i = 1; i < foundationPatternStrings.length; i++) {
    if (foundationPatternStrings[i] !== foundationPatternStrings[i - 1]) foundationPatternChanges += 1;
  }
  const orderedNewForegroundBars = Array.from(firstForegroundBarByIdentity.values()).sort((a, b) => a - b);
  const foregroundIdeaGaps = [];
  for (let i = 1; i < orderedNewForegroundBars.length; i++) {
    foregroundIdeaGaps.push(Math.max(0, orderedNewForegroundBars[i] - orderedNewForegroundBars[i - 1]));
  }
  let foregroundLoopOwnerChanges = 0;
  const orderedForegroundLoopBars = Array.from(orderedForegroundLoopIdentityByBar.keys()).sort((a, b) => a - b);
  for (let i = 1; i < orderedForegroundLoopBars.length; i++) {
    const prevIdentity = String(orderedForegroundLoopIdentityByBar.get(orderedForegroundLoopBars[i - 1]) || '').trim().toLowerCase();
    const nextIdentity = String(orderedForegroundLoopIdentityByBar.get(orderedForegroundLoopBars[i]) || '').trim().toLowerCase();
    if (prevIdentity && nextIdentity && prevIdentity !== nextIdentity) foregroundLoopOwnerChanges += 1;
  }
  const avgForegroundLaneCount = foregroundLanesByBar.size > 0
    ? Array.from(foregroundLanesByBar.values()).reduce((sum, set) => sum + set.size, 0) / foregroundLanesByBar.size
    : 0;
  const totalFoundationSlots = barsConsidered * 8;
  const offbeatFoundationHits = orderedFoundationSlots.filter((slot) => (slot.step % 2) === 1).length;
  const restShare = totalFoundationSlots > 0 ? Math.max(0, 1 - (foundationSlots.size / totalFoundationSlots)) : 0;
  const offbeatShare = foundationSlots.size > 0 ? (offbeatFoundationHits / foundationSlots.size) : 0;
  const motifWindows = motifPersistence?.windowsByN && typeof motifPersistence.windowsByN === 'object'
    ? motifPersistence.windowsByN
    : {};
  const themeCycleCount = Math.max(
    0,
    (Number(motifWindows.n2) || 0) + (Number(motifWindows.n3) || 0) + (Number(motifWindows.n4) || 0)
  );
  return {
    foundationCycleCount: Math.max(0, clampInt(passDiagnostics?.bassStability?.bassLoopCycles, 0, 0)),
    foundationPhraseResets: Math.max(0, clampInt(passDiagnostics?.bassStability?.bassPhraseResets, 0, 0)),
    foundationContinuityRate: Number(passDiagnostics?.bassStability?.bassHandoffContinuityRate) || 0,
    foundationRestShare: restShare,
    foundationOffbeatShare: offbeatShare,
    foundationUniquePatternCount: new Set(foundationPatternStrings.filter(Boolean)).size,
    foundationPatternChangeRate: foundationPatternStrings.length > 1 ? (foundationPatternChanges / (foundationPatternStrings.length - 1)) : 0,
    foundationConsecutiveOnBeatHits: maxOnBeatRun,
    themeCycleCount,
    themePersistenceRate: Number(motifPersistence?.weightedPersistence) || 0,
    themeReturnRate: Number(motifReuse?.motifReuseRate) || 0,
    sparkleDensity: sparkleAudibleEvents / barsConsidered,
    sparkleForegroundShare: totalForegroundEvents > 0 ? (sparkleForegroundEvents / totalForegroundEvents) : 0,
    audibleForegroundLaneCount: avgForegroundLaneCount,
    foregroundLoopOwnerChanges,
    foregroundLoopChurnRate: barsConsidered > 0 ? (foregroundLoopOwnerChanges / barsConsidered) : 0,
    barsSinceNewForegroundIdea: foregroundIdeaGaps.length > 0
      ? (foregroundIdeaGaps.reduce((sum, gap) => sum + gap, 0) / foregroundIdeaGaps.length)
      : barsConsidered,
    laneReassignmentRate: barsConsidered > 0
      ? (Math.max(0, clampInt(passDiagnostics?.ownershipContinuity?.ownerChanges, 0, 0)) / barsConsidered)
      : 0,
    enemyColourMutationCount: Math.max(0, clampInt(passDiagnostics?.identityStability?.totalColourChanges, 0, 0)),
    enemyInstrumentMutationCount: Math.max(0, clampInt(passDiagnostics?.identityStability?.totalInstrumentChanges, 0, 0)),
  };
}

function collectGrooveStability(events, sectionStability = null) {
  const bars = Object.create(null);
  for (const ev of events) {
    const bar = clampInt(ev?.barIndex, 0, 0);
    const key = String(bar);
    if (!bars[key]) {
      bars[key] = {
        pitch: new Set(),
        rhythm: new Set(),
        foundationRhythm: new Set(),
        bassSig: [],
      };
    }
    const note = String(ev?.noteResolved || ev?.note || '').trim();
    const role = String(ev?.role || '').trim().toLowerCase();
    const step = ((clampInt(ev?.stepIndex, 0, 0) % 8) + 8) % 8;
    const actionSig = `${step}:${String(ev?.actionType || '').trim().toLowerCase()}`;
    if (note) bars[key].pitch.add(note);
    bars[key].rhythm.add(actionSig);
    if (role === 'bass') bars[key].foundationRhythm.add(actionSig);
    if (role === 'bass' && note) bars[key].bassSig.push(`${step}:${note}`);
  }
  const barKeys = Object.keys(bars).map((k) => clampInt(k, 0, 0)).sort((a, b) => a - b);
  const pitchCounts = barKeys.map((b) => bars[String(b)].pitch.size);
  const foundationRhythmCounts = barKeys
    .map((b) => bars[String(b)].foundationRhythm.size)
    .filter((n) => n > 0);
  const rhythmCounts = foundationRhythmCounts.length
    ? foundationRhythmCounts
    : barKeys.map((b) => bars[String(b)].rhythm.size);
  const avgUniquePitchPerBar = pitchCounts.length ? (pitchCounts.reduce((a, n) => a + n, 0) / pitchCounts.length) : 0;
  const avgUniqueRhythmicEventsPerBar = rhythmCounts.length ? (rhythmCounts.reduce((a, n) => a + n, 0) / rhythmCounts.length) : 0;
  let comparedBassBars = 0;
  let repeatedBassBars = 0;
  for (let i = 1; i < barKeys.length; i++) {
    const prevSig = bars[String(barKeys[i - 1])].bassSig.slice().sort().join('|');
    const curSig = bars[String(barKeys[i])].bassSig.slice().sort().join('|');
    if (!prevSig || !curSig) continue;
    comparedBassBars += 1;
    if (prevSig === curSig) repeatedBassBars += 1;
  }
  const bassPatternPersistence = comparedBassBars > 0 ? (repeatedBassBars / comparedBassBars) : 0;
  return {
    barsConsidered: barKeys.length,
    avgUniquePitchPerBar,
    avgUniqueRhythmicEventsPerBar,
    bassPatternPersistence,
    sectionAvgDurationBars: Number(sectionStability?.avgDurationBars) || 0,
  };
}

function jaccardSimilarity(setA, setB) {
  const a = setA instanceof Set ? setA : new Set();
  const b = setB instanceof Set ? setB : new Set();
  if (!a.size && !b.size) return 1;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter += 1;
  const union = a.size + b.size - inter;
  return union > 0 ? (inter / union) : 0;
}

function collectSpawnerSync(events) {
  const spawnerEvents = events
    .filter((ev) => String(ev?.actionType || '').trim().toLowerCase() === 'spawner-spawn')
    .sort((a, b) => clampInt(a?.timestamp, 0, 0) - clampInt(b?.timestamp, 0, 0));
  const bySpawner = Object.create(null);
  for (const ev of spawnerEvents) {
    const actorId = clampInt(ev?.actorId, 0, 0);
    if (!(actorId > 0)) continue;
    if (!bySpawner[actorId]) {
      bySpawner[actorId] = {
        actorId,
        stepSet: new Set(),
        noteByStep: Object.create(null),
        firstStepMod8: null,
        eventCount: 0,
      };
    }
    const s = bySpawner[actorId];
    const stepMod8 = ((clampInt(ev?.stepIndex, 0, 0) % 8) + 8) % 8;
    const note = String(ev?.noteResolved || ev?.note || '').trim();
    s.stepSet.add(stepMod8);
    if (s.firstStepMod8 == null) s.firstStepMod8 = stepMod8;
    if (note) s.noteByStep[stepMod8] = note;
    s.eventCount += 1;
  }

  const spawners = Object.values(bySpawner);
  let perfectSyncSpawnerPairs = 0;
  let nearDuplicateSpawnerPairs = 0;
  const pairExamples = [];
  for (let i = 0; i < spawners.length; i++) {
    for (let j = i + 1; j < spawners.length; j++) {
      const a = spawners[i];
      const b = spawners[j];
      const stepSim = jaccardSimilarity(a.stepSet, b.stepSet);
      const sharedSteps = Array.from(a.stepSet).filter((st) => b.stepSet.has(st));
      let noteMatches = 0;
      for (const st of sharedSteps) {
        if (String(a.noteByStep[st] || '') && String(a.noteByStep[st] || '') === String(b.noteByStep[st] || '')) {
          noteMatches += 1;
        }
      }
      const noteSim = sharedSteps.length > 0 ? (noteMatches / sharedSteps.length) : 0;
      const phaseMatch = a.firstStepMod8 != null && b.firstStepMod8 != null && a.firstStepMod8 === b.firstStepMod8;
      const perfect = stepSim >= 0.999 && noteSim >= 0.999 && phaseMatch;
      const near = !perfect && stepSim >= 0.75 && noteSim >= 0.75;
      if (!perfect && !near) continue;
      if (perfect) perfectSyncSpawnerPairs += 1;
      else nearDuplicateSpawnerPairs += 1;
      if (pairExamples.length < 24) {
        pairExamples.push({
          a: a.actorId,
          b: b.actorId,
          type: perfect ? 'perfect-sync' : 'near-duplicate',
          stepSimilarity: Number(stepSim.toFixed(3)),
          noteSimilarity: Number(noteSim.toFixed(3)),
          phaseMatch: !!phaseMatch,
        });
      }
    }
  }

  const clusterMap = Object.create(null);
  for (const s of spawners) {
    const stepKey = Array.from(s.stepSet).sort((x, y) => x - y).join(',');
    const noteKey = Object.keys(s.noteByStep)
      .sort((x, y) => clampInt(x, 0, 0) - clampInt(y, 0, 0))
      .map((k) => `${k}:${String(s.noteByStep[k] || '')}`)
      .join('|');
    const key = `${stepKey}::${noteKey}::phase:${s.firstStepMod8 == null ? '' : s.firstStepMod8}`;
    if (!clusterMap[key]) clusterMap[key] = [];
    clusterMap[key].push(s.actorId);
  }
  const duplicateSpawnerPatternClusters = Object.values(clusterMap)
    .filter((ids) => Array.isArray(ids) && ids.length >= 2)
    .map((ids) => ({ size: ids.length, actorIds: ids.slice() }));

  return {
    spawnerCount: spawners.length,
    perfectSyncSpawnerPairs,
    nearDuplicateSpawnerPairs,
    duplicateSpawnerPatternClusters,
    pairExamples,
  };
}

function collectSpawnerPipelineDiagnostics(session, maxBarIndex) {
  const summary = session?.systemEventSummary?.spawnerPipeline || {};
  const logs = (Array.isArray(session?.systemEvents) ? session.systemEvents : [])
    .filter((e) => clampInt(e?.barIndex, 0, 0) <= maxBarIndex);
  let spawnerGameplayEvents = clampInt(summary?.spawnerGameplayEvents, 0, 0);
  let spawnerAudioEvents = clampInt(summary?.spawnerAudioEvents, 0, 0);
  let spawnerAudioMutedEvents = clampInt(summary?.spawnerAudioMutedEvents, 0, 0);
  let spawnerVisualEvents = clampInt(summary?.spawnerVisualEvents, 0, 0);
  let spawnerLoopgridEvents = clampInt(summary?.spawnerLoopgridEvents, 0, 0);
  let spawnerPipelineMismatches = clampInt(summary?.spawnerPipelineMismatches, 0, 0);
  for (const e of logs) {
    const type = String(e?.eventType || '').trim().toLowerCase();
    if (type === 'music_spawner_gameplay_event') spawnerGameplayEvents += 1;
    if (type === 'music_spawner_audio_event') spawnerAudioEvents += 1;
    if (type === 'music_spawner_audio_muted') spawnerAudioMutedEvents += 1;
    if (type === 'music_spawner_visual_event') spawnerVisualEvents += 1;
    if (type === 'music_spawner_loopgrid_event') spawnerLoopgridEvents += 1;
    if (type === 'music_spawner_pipeline_mismatch') spawnerPipelineMismatches += 1;
  }
  const expectedAudioEvents = Math.max(0, spawnerGameplayEvents - spawnerAudioMutedEvents);
  const audioShortfall = Math.max(0, expectedAudioEvents - spawnerAudioEvents);
  const visualShortfall = Math.max(0, spawnerGameplayEvents - spawnerVisualEvents);
  const loopgridShortfall = Math.max(0, spawnerGameplayEvents - spawnerLoopgridEvents);
  return {
    spawnerGameplayEvents,
    spawnerAudioEvents,
    spawnerAudioMutedEvents,
    spawnerVisualEvents,
    spawnerLoopgridEvents,
    spawnerPipelineMismatches,
    expectedAudioEvents,
    audioShortfall,
    visualShortfall,
    loopgridShortfall,
  };
}

function collectFoundationProminenceDiagnostics(session, maxBarIndex) {
  const summary = session?.systemEventSummary?.foundationProminence || {};
  const logs = (Array.isArray(session?.systemEvents) ? session.systemEvents : [])
    .filter((e) => clampInt(e?.barIndex, 0, 0) <= maxBarIndex)
    .filter((e) => String(e?.eventType || '').trim().toLowerCase() === 'music_foundation_prominence_decision');
  let total = clampInt(summary?.total, 0, 0);
  let full = clampInt(summary?.full, 0, 0);
  let quiet = clampInt(summary?.quiet, 0, 0);
  let trace = clampInt(summary?.trace, 0, 0);
  let suppressed = clampInt(summary?.suppressed, 0, 0);
  let changedByDeconflict = clampInt(summary?.changedByDeconflict, 0, 0);
  for (const e of logs) {
    total += 1;
    const finalProminence = String(e?.finalProminence || '').trim().toLowerCase();
    if (finalProminence === 'full') full += 1;
    else if (finalProminence === 'quiet') quiet += 1;
    else if (finalProminence === 'trace') trace += 1;
    else if (finalProminence === 'suppressed') suppressed += 1;
    if (e?.changedByDeconflict === true) changedByDeconflict += 1;
  }
  return {
    total,
    full,
    quiet,
    trace,
    suppressed,
    changedByDeconflict,
    quietShare: total > 0 ? (quiet / total) : 0,
    traceShare: total > 0 ? (trace / total) : 0,
    suppressedShare: total > 0 ? (suppressed / total) : 0,
    deconflictChangeRate: total > 0 ? (changedByDeconflict / total) : 0,
  };
}

function collectDeliveryDiagnostics(session, maxBarIndex) {
  const rows = (Array.isArray(session?.events) ? session.events : [])
    .filter((ev) => clampInt(ev?.barIndex, 0, 0) <= maxBarIndex)
    .filter((ev) => isEnemyMusicEvent(ev));
  const created = rows.filter((ev) => String(ev?.phase || '').trim().toLowerCase() === 'created');
  const executed = rows.filter((ev) => String(ev?.phase || '').trim().toLowerCase() === 'executed');
  const skippedCreatedEvents = Math.max(0, created.length - executed.length);
  const unmatchedExecutedEvents = Math.max(0, executed.length - created.length);

  const createdSpawner = created.filter((ev) => String(ev?.actionType || '').trim().toLowerCase() === 'spawner-spawn');
  const executedSpawner = executed.filter((ev) => String(ev?.actionType || '').trim().toLowerCase() === 'spawner-spawn');
  const createdBass = created.filter((ev) => String(ev?.role || '').trim().toLowerCase() === 'bass');
  const executedBass = executed.filter((ev) => String(ev?.role || '').trim().toLowerCase() === 'bass');

  const spawnerSkippedCreatedEvents = Math.max(0, createdSpawner.length - executedSpawner.length);
  const bassSkippedCreatedEvents = Math.max(0, createdBass.length - executedBass.length);

  const bassSteps = Array.from(new Set(executedBass.map((ev) => clampInt(ev?.stepIndex, 0, 0))))
    .sort((a, b) => a - b);
  let maxBassStepGap = 0;
  let maxBassStepGapFrom = -1;
  let maxBassStepGapTo = -1;
  for (let i = 1; i < bassSteps.length; i++) {
    const gap = Math.max(0, bassSteps[i] - bassSteps[i - 1]);
    if (gap > maxBassStepGap) {
      maxBassStepGap = gap;
      maxBassStepGapFrom = bassSteps[i - 1];
      maxBassStepGapTo = bassSteps[i];
    }
  }

  const executedSteps = Array.from(new Set(executed.map((ev) => clampInt(ev?.stepIndex, 0, 0))))
    .sort((a, b) => a - b);
  const bassStepSet = new Set(bassSteps);
  let maxEnemyStepsWithoutBass = 0;
  let maxEnemyStepsWithoutBassStart = -1;
  let maxEnemyStepsWithoutBassEnd = -1;
  let currentRun = 0;
  let currentRunStart = -1;
  for (const step of executedSteps) {
    if (bassStepSet.has(step)) {
      currentRun = 0;
      currentRunStart = -1;
      continue;
    }
    if (currentRun <= 0) currentRunStart = step;
    currentRun += 1;
    if (currentRun > maxEnemyStepsWithoutBass) {
      maxEnemyStepsWithoutBass = currentRun;
      maxEnemyStepsWithoutBassStart = currentRunStart;
      maxEnemyStepsWithoutBassEnd = step;
    }
  }

  const buildCountMap = (list, keyFn) => {
    const out = Object.create(null);
    for (const ev of list) {
      const key = String(keyFn(ev) || '').trim().toLowerCase() || 'unknown';
      out[key] = clampInt(out[key], 0, 0) + 1;
    }
    return out;
  };
  const getBeatStrengthClass = (ev) => {
    const step = ((clampInt(ev?.stepIndex, 0, 0) % 8) + 8) % 8;
    if (step === 0 || step === 4) return 'strong';
    if (step === 2 || step === 6) return 'medium';
    return 'weak';
  };
  const computeDeficitMap = (createdMap, executedMap) => {
    const out = Object.create(null);
    const keys = new Set([...Object.keys(createdMap || {}), ...Object.keys(executedMap || {})]);
    for (const key of keys) {
      const createdCount = Math.max(0, clampInt(createdMap?.[key], 0, 0));
      const executedCount = Math.max(0, clampInt(executedMap?.[key], 0, 0));
      const skippedCount = Math.max(0, createdCount - executedCount);
      if (createdCount <= 0 && executedCount <= 0) continue;
      out[key] = {
        created: createdCount,
        executed: executedCount,
        skipped: skippedCount,
        executedToCreatedRate: createdCount > 0 ? (executedCount / createdCount) : 1,
      };
    }
    return out;
  };
  const createdByActionType = buildCountMap(created, (ev) => ev?.actionType);
  const executedByActionType = buildCountMap(executed, (ev) => ev?.actionType);
  const createdBySourceSystem = buildCountMap(created, (ev) => ev?.sourceSystem);
  const executedBySourceSystem = buildCountMap(executed, (ev) => ev?.sourceSystem);
  const createdByMusicLane = buildCountMap(created, (ev) => ev?.musicLaneId || ev?.foundationLaneId);
  const executedByMusicLane = buildCountMap(executed, (ev) => ev?.musicLaneId || ev?.foundationLaneId);
  const createdByProfileSourceType = buildCountMap(created, (ev) => ev?.musicProfileSourceType);
  const executedByProfileSourceType = buildCountMap(executed, (ev) => ev?.musicProfileSourceType);
  const createdByReason = buildCountMap(created, (ev) => ev?.reason);
  const executedByReason = buildCountMap(executed, (ev) => ev?.reason);
  const createdByBeatStrength = buildCountMap(created, getBeatStrengthClass);
  const executedByBeatStrength = buildCountMap(executed, getBeatStrengthClass);
  const createdStrongBeatsByLane = buildCountMap(
    created.filter((ev) => getBeatStrengthClass(ev) === 'strong'),
    (ev) => ev?.musicLaneId || ev?.foundationLaneId
  );
  const executedStrongBeatsByLane = buildCountMap(
    executed.filter((ev) => getBeatStrengthClass(ev) === 'strong'),
    (ev) => ev?.musicLaneId || ev?.foundationLaneId
  );
  const createdStrongBeatsByReason = buildCountMap(
    created.filter((ev) => getBeatStrengthClass(ev) === 'strong'),
    (ev) => ev?.reason
  );
  const executedStrongBeatsByReason = buildCountMap(
    executed.filter((ev) => getBeatStrengthClass(ev) === 'strong'),
    (ev) => ev?.reason
  );
  const createdStrongFoundationByProfileSourceType = buildCountMap(
    created.filter((ev) => (
      getBeatStrengthClass(ev) === 'strong'
      && String(ev?.musicLaneId || ev?.foundationLaneId || '').trim().toLowerCase() === 'foundation_lane'
    )),
    (ev) => ev?.musicProfileSourceType
  );
  const executedStrongFoundationByProfileSourceType = buildCountMap(
    executed.filter((ev) => (
      getBeatStrengthClass(ev) === 'strong'
      && String(ev?.musicLaneId || ev?.foundationLaneId || '').trim().toLowerCase() === 'foundation_lane'
    )),
    (ev) => ev?.musicProfileSourceType
  );
  const createdStrongFoundationByReason = buildCountMap(
    created.filter((ev) => (
      getBeatStrengthClass(ev) === 'strong'
      && String(ev?.musicLaneId || ev?.foundationLaneId || '').trim().toLowerCase() === 'foundation_lane'
    )),
    (ev) => ev?.reason
  );
  const executedStrongFoundationByReason = buildCountMap(
    executed.filter((ev) => (
      getBeatStrengthClass(ev) === 'strong'
      && String(ev?.musicLaneId || ev?.foundationLaneId || '').trim().toLowerCase() === 'foundation_lane'
    )),
    (ev) => ev?.reason
  );
  const createdMediumBeatsByLane = buildCountMap(
    created.filter((ev) => getBeatStrengthClass(ev) === 'medium'),
    (ev) => ev?.musicLaneId || ev?.foundationLaneId
  );
  const executedMediumBeatsByLane = buildCountMap(
    executed.filter((ev) => getBeatStrengthClass(ev) === 'medium'),
    (ev) => ev?.musicLaneId || ev?.foundationLaneId
  );
  const createdMediumBeatsByReason = buildCountMap(
    created.filter((ev) => getBeatStrengthClass(ev) === 'medium'),
    (ev) => ev?.reason
  );
  const executedMediumBeatsByReason = buildCountMap(
    executed.filter((ev) => getBeatStrengthClass(ev) === 'medium'),
    (ev) => ev?.reason
  );

  return {
    createdEnemyEvents: created.length,
    executedEnemyEvents: executed.length,
    skippedCreatedEvents,
    unmatchedExecutedEvents,
    executedToCreatedRate: created.length > 0 ? (executed.length / created.length) : 1,
    createdSpawnerEvents: createdSpawner.length,
    executedSpawnerEvents: executedSpawner.length,
    spawnerSkippedCreatedEvents,
    spawnerExecutedToCreatedRate: createdSpawner.length > 0 ? (executedSpawner.length / createdSpawner.length) : 1,
    createdBassEvents: createdBass.length,
    executedBassEvents: executedBass.length,
    bassSkippedCreatedEvents,
    bassExecutedToCreatedRate: createdBass.length > 0 ? (executedBass.length / createdBass.length) : 1,
    maxBassStepGap,
    maxBassStepGapFrom,
    maxBassStepGapTo,
    maxEnemyStepsWithoutBass,
    maxEnemyStepsWithoutBassStart,
    maxEnemyStepsWithoutBassEnd,
    byActionType: computeDeficitMap(createdByActionType, executedByActionType),
    bySourceSystem: computeDeficitMap(createdBySourceSystem, executedBySourceSystem),
    byMusicLane: computeDeficitMap(createdByMusicLane, executedByMusicLane),
    byProfileSourceType: computeDeficitMap(createdByProfileSourceType, executedByProfileSourceType),
    byReason: computeDeficitMap(createdByReason, executedByReason),
    byBeatStrength: computeDeficitMap(createdByBeatStrength, executedByBeatStrength),
    strongBeatByMusicLane: computeDeficitMap(createdStrongBeatsByLane, executedStrongBeatsByLane),
    strongBeatByReason: computeDeficitMap(createdStrongBeatsByReason, executedStrongBeatsByReason),
    strongBeatFoundationByProfileSourceType: computeDeficitMap(createdStrongFoundationByProfileSourceType, executedStrongFoundationByProfileSourceType),
    strongBeatFoundationByReason: computeDeficitMap(createdStrongFoundationByReason, executedStrongFoundationByReason),
    mediumBeatByMusicLane: computeDeficitMap(createdMediumBeatsByLane, executedMediumBeatsByLane),
    mediumBeatByReason: computeDeficitMap(createdMediumBeatsByReason, executedMediumBeatsByReason),
  };
}

function collectEventSectionDiagnostics(session, maxBarIndex) {
  const events = (Array.isArray(session?.systemEvents) ? session.systemEvents : [])
    .filter((e) => clampInt(e?.barIndex, 0, 0) <= maxBarIndex)
    .filter((e) => String(e?.eventType || '').trim().toLowerCase() === 'music_event_section_state');
  const bySection = {};
  const byStage = {};
  const bySectionAndStage = {};
  const byActionCategory = {};
  const byBehaviorClass = {};
  let activeCount = 0;
  let beatBounceCount = 0;
  let strongBeatCount = 0;
  let movementEventCount = 0;
  let audioRequiredCount = 0;
  const samples = [];
  for (const ev of events) {
    const section = String(ev?.activeEventSection || '').trim().toLowerCase() || 'none';
    const stage = String(ev?.intensityAuditionSection || '').trim().toLowerCase() || 'unknown';
    const actionCategory = String(ev?.actionCategory || '').trim().toLowerCase() || 'unknown';
    const behaviorClass = String(ev?.eventBehaviorClass || '').trim().toLowerCase() || 'none';
    bySection[section] = (bySection[section] || 0) + 1;
    byStage[stage] = (byStage[stage] || 0) + 1;
    byActionCategory[actionCategory] = (byActionCategory[actionCategory] || 0) + 1;
    byBehaviorClass[behaviorClass] = (byBehaviorClass[behaviorClass] || 0) + 1;
    const sectionStageKey = `${section}:${stage}`;
    bySectionAndStage[sectionStageKey] = (bySectionAndStage[sectionStageKey] || 0) + 1;
    if (section !== 'none') activeCount += 1;
    if (section === 'beat_bounce') beatBounceCount += 1;
    if (ev?.strongBeatActive === true) strongBeatCount += 1;
    if (actionCategory === 'movement_event') movementEventCount += 1;
    if (ev?.audioRequired === true) audioRequiredCount += 1;
    if (samples.length < 24 && (section !== 'none' || actionCategory === 'movement_event')) {
      samples.push({
        barIndex: clampInt(ev?.barIndex, 0, 0),
        beatIndex: clampInt(ev?.beatIndex, 0, 0),
        activeEventSection: section,
        intensityAuditionSection: stage,
        eventBehaviorClass: behaviorClass,
        actionCategory,
        audioRequired: ev?.audioRequired === true,
        strongBeatActive: ev?.strongBeatActive === true,
        presentationPulseScale: Number(ev?.presentationPulseScale) || 0,
      });
    }
  }
  return {
    count: events.length,
    activeCount,
    activeRate: events.length ? (activeCount / events.length) : 0,
    beatBounceCount,
    strongBeatCount,
    strongBeatRate: events.length ? (strongBeatCount / events.length) : 0,
    movementEventCount,
    audioRequiredCount,
    bySection,
    byStage,
    bySectionAndStage,
    byActionCategory,
    byBehaviorClass,
    sample: samples,
  };
}
function collectExplosionReliabilityDiagnostics(session, maxBarIndex) {
  const logs = (Array.isArray(session?.systemEvents) ? session.systemEvents : [])
    .filter((e) => clampInt(e?.barIndex, 0, 0) <= maxBarIndex);
  const byType = Object.create(null);
  const appliedByChain = new Set();
  const primeByChain = new Set();
  let primesCreated = 0;
  let queuesCreated = 0;
  let queuesRetargeted = 0;
  let queuesProcessed = 0;
  let queuesCleared = 0;
  let failsafeDetonations = 0;
  let explosionApplications = 0;
  for (const log of logs) {
    const type = String(log?.eventType || '').trim().toLowerCase();
    if (!type.startsWith('weapon_explosion_')) continue;
    byType[type] = clampInt(byType[type], 0, 0) + 1;
    const chainEventId = clampInt(log?.chainEventId, 0, 0);
    if (type === 'weapon_explosion_prime_created') {
      primesCreated += 1;
      if (chainEventId > 0) primeByChain.add(chainEventId);
    } else if (type === 'weapon_explosion_queue_created') {
      queuesCreated += 1;
    } else if (type === 'weapon_explosion_queue_retargeted') {
      queuesRetargeted += 1;
    } else if (type === 'weapon_explosion_queue_processed') {
      queuesProcessed += 1;
    } else if (type === 'weapon_explosion_queue_cleared') {
      queuesCleared += 1;
    } else if (type === 'weapon_explosion_failsafe_detonated') {
      failsafeDetonations += 1;
    } else if (type === 'weapon_explosion_applied') {
      explosionApplications += 1;
      if (chainEventId > 0) appliedByChain.add(chainEventId);
    }
  }
  let primeWithoutApplicationCount = 0;
  for (const chainEventId of primeByChain) {
    if (!appliedByChain.has(chainEventId)) primeWithoutApplicationCount += 1;
  }
  return {
    byType,
    explosionPrimesCreated: primesCreated,
    explosionQueuesCreated: queuesCreated,
    explosionQueuesRetargeted: queuesRetargeted,
    explosionQueuesProcessed: queuesProcessed,
    explosionQueuesCleared: queuesCleared,
    explosionFailsafeDetonations: failsafeDetonations,
    explosionApplications,
    explosionPrimeWithoutApplicationCount: primeWithoutApplicationCount,
    explosionReliabilityRate: primesCreated > 0 ? ((primesCreated - primeWithoutApplicationCount) / primesCreated) : 1,
  };
}

function collectNotePoolCompliance(events) {
  let considered = 0;
  let clamped = 0;
  let offPoolNoteRequests = 0;
  let clampedNoteCount = 0;
  const clampedNoteBySource = Object.create(null);
  const clampedByEnemyType = Object.create(null);
  const clampedNoteByEnemyId = Object.create(null);
  let excludedCombatFeedbackEvents = 0;
  for (const ev of events) {
    if (!isMusicFlowEvent(ev)) {
      if (String(ev?.noteResolved || ev?.note || '').trim()) excludedCombatFeedbackEvents += 1;
      continue;
    }
    const requested = String(ev?.note || '').trim();
    const resolved = String(ev?.noteResolved || '').trim();
    if (!requested || !resolved) continue;
    considered += 1;
    if (ev?.noteWasClamped === true || requested !== resolved) {
      clamped += 1;
      offPoolNoteRequests += 1;
      clampedNoteCount += 1;
      const src = String(ev?.sourceSystem || '').trim().toLowerCase() || 'unknown';
      clampedNoteBySource[src] = clampInt(clampedNoteBySource[src], 0, 0) + 1;
      const enemyType = String(ev?.enemyType || '').trim().toLowerCase() || 'unknown';
      clampedByEnemyType[enemyType] = clampInt(clampedByEnemyType[enemyType], 0, 0) + 1;
      const actorId = clampInt(ev?.actorId, 0, 0);
      if (actorId > 0) clampedNoteByEnemyId[String(actorId)] = clampInt(clampedNoteByEnemyId[String(actorId)], 0, 0) + 1;
    }
  }
  const insidePool = Math.max(0, considered - clamped);
  return {
    offPoolNoteRequests,
    clampedNoteCount,
    clampedNoteBySource,
    clampedByEnemyType,
    clampedNoteByEnemyId,
    considered,
    clamped,
    insidePool,
    excludedCombatFeedbackEvents,
    poolComplianceRate: considered > 0 ? (insidePool / considered) : 1,
  };
}

function collectMotifReuse(events) {
  const melodicCandidates = events
    .filter((ev) => String(ev?.noteResolved || ev?.note || '').trim().length > 0)
    .sort((a, b) => clampInt(a?.timestamp, 0, 0) - clampInt(b?.timestamp, 0, 0));
  const melodic = melodicCandidates
    .filter(isMusicFlowEvent)
    .map((ev) => String(ev?.noteResolved || ev?.note || '').trim())
    .filter((n) => n.length > 0);
  const motifCounts = {
    n2: Object.create(null),
    n3: Object.create(null),
    n4: Object.create(null),
  };
  const repeatedByN = { n2: 0, n3: 0, n4: 0 };
  const windowsByN = { n2: 0, n3: 0, n4: 0 };

  const pushWindow = (size, key) => {
    if (!key) return;
    const bucket = size === 2 ? motifCounts.n2 : (size === 3 ? motifCounts.n3 : motifCounts.n4);
    const winKey = size === 2 ? 'n2' : (size === 3 ? 'n3' : 'n4');
    bucket[key] = clampInt(bucket[key], 0, 0) + 1;
    windowsByN[winKey] += 1;
  };

  for (let i = 0; i < melodic.length; i++) {
    if ((i + 2) <= melodic.length) pushWindow(2, melodic.slice(i, i + 2).join('|'));
    if ((i + 3) <= melodic.length) pushWindow(3, melodic.slice(i, i + 3).join('|'));
    if ((i + 4) <= melodic.length) pushWindow(4, melodic.slice(i, i + 4).join('|'));
  }

  for (const k of Object.keys(motifCounts.n2)) if (motifCounts.n2[k] > 1) repeatedByN.n2 += motifCounts.n2[k] - 1;
  for (const k of Object.keys(motifCounts.n3)) if (motifCounts.n3[k] > 1) repeatedByN.n3 += motifCounts.n3[k] - 1;
  for (const k of Object.keys(motifCounts.n4)) if (motifCounts.n4[k] > 1) repeatedByN.n4 += motifCounts.n4[k] - 1;

  const totalWindows = windowsByN.n2 + windowsByN.n3 + windowsByN.n4;
  const repeatedWindows = repeatedByN.n2 + repeatedByN.n3 + repeatedByN.n4;
  const motifReuseRate = totalWindows > 0 ? (repeatedWindows / totalWindows) : 1;

  return {
    windowsByN,
    repeatedByN,
    uniqueMotifsByN: {
      n2: Object.keys(motifCounts.n2).length,
      n3: Object.keys(motifCounts.n3).length,
      n4: Object.keys(motifCounts.n4).length,
    },
    scopedEventCount: melodic.length,
    excludedCombatFeedbackEvents: Math.max(0, melodicCandidates.length - melodic.length),
    motifReuseRate,
  };
}

function collectMotifPersistence(motifReuse) {
  const windowsByN = motifReuse?.windowsByN && typeof motifReuse.windowsByN === 'object'
    ? motifReuse.windowsByN
    : { n2: 0, n3: 0, n4: 0 };
  const repeatedByN = motifReuse?.repeatedByN && typeof motifReuse.repeatedByN === 'object'
    ? motifReuse.repeatedByN
    : { n2: 0, n3: 0, n4: 0 };
  const persistenceByN = {
    n2: Number(windowsByN.n2) > 0 ? ((Number(repeatedByN.n2) || 0) / Number(windowsByN.n2)) : 0,
    n3: Number(windowsByN.n3) > 0 ? ((Number(repeatedByN.n3) || 0) / Number(windowsByN.n3)) : 0,
    n4: Number(windowsByN.n4) > 0 ? ((Number(repeatedByN.n4) || 0) / Number(windowsByN.n4)) : 0,
  };
  const weightedPersistence = (
    (persistenceByN.n2 * 1)
    + (persistenceByN.n3 * 1.35)
    + (persistenceByN.n4 * 1.8)
  ) / (1 + 1.35 + 1.8);
  return {
    windowsByN: {
      n2: clampInt(windowsByN.n2, 0, 0),
      n3: clampInt(windowsByN.n3, 0, 0),
      n4: clampInt(windowsByN.n4, 0, 0),
    },
    persistenceByN,
    weightedPersistence,
    motifReuseRate: Number(motifReuse?.motifReuseRate) || 0,
  };
}

function collectPhraseGravity(events) {
  const actionable = events.filter((ev) => {
    const source = String(ev?.sourceSystem || '').trim().toLowerCase();
    if (source === 'player' || source === 'death' || source === 'unknown') return false;
    return true;
  });
  let gravityOpportunities = 0;
  let gravityHits = 0;
  let phraseResolutionOpportunities = 0;
  let phraseResolutionHits = 0;
  for (const ev of actionable) {
    const gravityTarget = String(ev?.phraseGravityTarget || '').trim();
    const gravityOpportunity = gravityTarget.length > 0;
    if (gravityOpportunity) {
      gravityOpportunities += 1;
      if (ev?.phraseGravityHit === true) gravityHits += 1;
    }
    if (ev?.phraseResolutionOpportunity === true) {
      phraseResolutionOpportunities += 1;
      if (ev?.phraseResolutionHit === true) phraseResolutionHits += 1;
    }
  }
  return {
    gravityOpportunities,
    gravityHits,
    gravityHitRate: gravityOpportunities > 0 ? (gravityHits / gravityOpportunities) : 0,
    phraseResolutionOpportunities,
    phraseResolutionHits,
    phraseResolutionRate: phraseResolutionOpportunities > 0 ? (phraseResolutionHits / phraseResolutionOpportunities) : 0,
  };
}

function collectLeadVariationTrace(events) {
  const leadEvents = (Array.isArray(events) ? events : []).filter((ev) => {
    const laneId = String(ev?.musicLaneId || '').trim().toLowerCase();
    const leadFamily = String(ev?.leadFamily || '').trim().toLowerCase();
    const leadContourId = String(ev?.leadContourId || '').trim().toLowerCase();
    return laneId === 'primary_loop_lane' || !!leadFamily || !!leadContourId;
  });
  const byFamily = {};
  const byContour = {};
  const byCadenceVariant = {};
  const byContourEpoch = {};
  const bySectionTransitionRole = {};
  const bySectionArcEpoch = {};
  const byPlayerThemeSource = {};
  const byPlayerThemeMode = {};
  const byPlayerThemePart = {};
  let playerThemeActiveSteps = 0;
  const inc = (target, keyLike) => {
    const key = keyLike == null
      ? 'unknown'
      : (String(keyLike).trim().toLowerCase() || 'unknown');
    target[key] = (target[key] || 0) + 1;
  };
  for (const ev of leadEvents) {
    inc(byFamily, ev?.leadFamily);
    inc(byContour, ev?.leadContourId);
    inc(byCadenceVariant, ev?.leadCadenceVariant);
    inc(byContourEpoch, ev?.leadContourEpoch);
    inc(bySectionTransitionRole, ev?.sectionTransitionRole);
    inc(bySectionArcEpoch, ev?.sectionArcEpoch);
    inc(byPlayerThemeSource, ev?.leadPlayerThemeSource);
    inc(byPlayerThemeMode, ev?.leadThemeInterpretationMode);
    if (String(ev?.leadPlayerThemeSource || '').trim()) inc(byPlayerThemePart, ev?.leadThemePartIndex);
    if (ev?.leadThemeRawStepActive === true) playerThemeActiveSteps += 1;
  }
  return {
    count: leadEvents.length,
    byFamily,
    byContour,
    byCadenceVariant,
    byContourEpoch,
    bySectionTransitionRole,
    bySectionArcEpoch,
    byPlayerThemeSource,
    byPlayerThemeMode,
    byPlayerThemePart,
    playerThemeActiveSteps,
    distinctFamilyCount: Object.keys(byFamily).filter((key) => key !== 'unknown').length,
    distinctContourCount: Object.keys(byContour).filter((key) => key !== 'unknown').length,
    sample: leadEvents.slice(0, 24).map((ev) => ({
      barIndex: clampInt(ev?.barIndex, 0, 0),
      stepIndex: clampInt(ev?.stepIndex, 0, 0),
      note: String(ev?.noteResolved || ev?.note || '').trim(),
      leadFamily: String(ev?.leadFamily || '').trim().toLowerCase(),
      leadContourId: String(ev?.leadContourId || '').trim().toLowerCase(),
      leadContourEpoch: clampInt(ev?.leadContourEpoch, 0, 0),
      leadCadenceVariant: clampInt(ev?.leadCadenceVariant, 0, 0),
      sectionTransitionRole: String(ev?.sectionTransitionRole || '').trim().toLowerCase(),
      sectionArcEpoch: clampInt(ev?.sectionArcEpoch, 0, 0),
      leadPlayerThemeSource: String(ev?.leadPlayerThemeSource || '').trim().toLowerCase(),
      leadThemeInterpretationMode: String(ev?.leadThemeInterpretationMode || '').trim().toLowerCase(),
      leadThemePartIndex: clampInt(ev?.leadThemePartIndex, 0, 0),
      leadThemeStepIndex: clampInt(ev?.leadThemeStepIndex, 0, 0),
      leadThemePatternKey: String(ev?.leadThemePatternKey || '').trim().toLowerCase(),
      leadThemeContourKey: String(ev?.leadThemeContourKey || '').trim().toLowerCase(),
      leadThemeRawStepActive: ev?.leadThemeRawStepActive === true,
      leadThemeRawNote: String(ev?.leadThemeRawNote || '').trim(),
    })),
  };
}

function collectPhraseArchetypeTrace(events) {
  const sourceEvents = Array.isArray(events) ? events : [];
  const byArchetype = {};
  const byArchetypeAndLane = {};
  const byArchetypeAndStage = {};
  const inc = (target, keyLike) => {
    const key = keyLike == null
      ? 'unknown'
      : (String(keyLike).trim().toLowerCase() || 'unknown');
    target[key] = (target[key] || 0) + 1;
  };
  const archetypeEvents = sourceEvents.filter((ev) => String(ev?.phraseArchetype || '').trim());
  for (const ev of archetypeEvents) {
    const archetype = String(ev?.phraseArchetype || '').trim().toLowerCase() || 'unknown';
    const lane = String(ev?.musicLaneId || ev?.foundationLaneId || '').trim().toLowerCase() || 'unknown';
    const stage = String(ev?.enemyMusicActionGateStage || ev?.intensityAuditionSection || '').trim().toLowerCase() || 'unknown';
    inc(byArchetype, archetype);
    inc(byArchetypeAndLane, `${archetype}|${lane}`);
    inc(byArchetypeAndStage, `${archetype}|${stage}`);
  }
  return {
    count: archetypeEvents.length,
    byArchetype,
    byArchetypeAndLane,
    byArchetypeAndStage,
    distinctArchetypeCount: Object.keys(byArchetype).filter((key) => key !== 'unknown').length,
    sample: archetypeEvents.slice(0, 24).map((ev) => ({
      barIndex: clampInt(ev?.barIndex, 0, 0),
      stepIndex: clampInt(ev?.stepIndex, 0, 0),
      note: String(ev?.noteResolved || ev?.note || '').trim(),
      musicLaneId: String(ev?.musicLaneId || ev?.foundationLaneId || '').trim().toLowerCase(),
      phraseArchetype: String(ev?.phraseArchetype || '').trim().toLowerCase(),
      phraseArchetypeStep: clampInt(ev?.phraseArchetypeStep, 0, 0),
      phraseArchetypeSteps: clampInt(ev?.phraseArchetypeSteps, 0, 0),
    })),
  };
}

function collectFoundationVariationTrace(events) {
  const foundationEvents = (Array.isArray(events) ? events : []).filter((ev) => {
    const laneId = String(ev?.musicLaneId || ev?.foundationLaneId || '').trim().toLowerCase();
    const layer = String(ev?.musicLayer || '').trim().toLowerCase();
    const role = String(ev?.role || '').trim().toLowerCase();
    return laneId === 'foundation_lane' || layer === 'foundation' || role === 'bass';
  });
  const byPatternKey = {};
  const byPhraseId = {};
  const byPlayerThemeSource = {};
  const byRawPatternKey = {};
  const byShapedPatternKey = {};
  const byInterpretationMode = {};
  const inc = (target, keyLike) => {
    const key = String(keyLike || '').trim().toLowerCase() || 'unknown';
    target[key] = (target[key] || 0) + 1;
  };
  for (const ev of foundationEvents) {
    inc(byPatternKey, ev?.foundationPatternKey);
    inc(byPhraseId, ev?.foundationPhraseId);
    inc(byPlayerThemeSource, ev?.foundationPlayerThemeSource);
    inc(byRawPatternKey, ev?.foundationRawPatternKey);
    inc(byShapedPatternKey, ev?.foundationShapedPatternKey);
    inc(byInterpretationMode, ev?.foundationInterpretationMode);
  }
  return {
    count: foundationEvents.length,
    byPatternKey,
    byPhraseId,
    byPlayerThemeSource,
    byRawPatternKey,
    byShapedPatternKey,
    byInterpretationMode,
    distinctPatternKeyCount: Object.keys(byPatternKey).filter((key) => key !== 'unknown').length,
    distinctPhraseIdCount: Object.keys(byPhraseId).filter((key) => key !== 'unknown').length,
    sample: foundationEvents.slice(0, 24).map((ev) => ({
      barIndex: clampInt(ev?.barIndex, 0, 0),
      stepIndex: clampInt(ev?.stepIndex, 0, 0),
      note: String(ev?.noteResolved || ev?.note || '').trim(),
      foundationPatternKey: String(ev?.foundationPatternKey || '').trim().toLowerCase(),
      foundationPhraseId: String(ev?.foundationPhraseId || '').trim().toLowerCase(),
      foundationPlayerThemeSource: String(ev?.foundationPlayerThemeSource || '').trim(),
      foundationRawPatternKey: String(ev?.foundationRawPatternKey || '').trim().toLowerCase(),
      foundationShapedPatternKey: String(ev?.foundationShapedPatternKey || '').trim().toLowerCase(),
      foundationInterpretationMode: String(ev?.foundationInterpretationMode || '').trim().toLowerCase(),
      foundationPhrasePartIndex: clampInt(ev?.foundationPhrasePartIndex, 0, 0),
    })),
  };
}

function collectArrangementSupportTrace(events) {
  const supportEvents = (Array.isArray(events) ? events : []).filter((ev) => {
    const laneId = String(ev?.musicLaneId || '').trim().toLowerCase();
    const profile = String(ev?.musicProfileSourceType || '').trim().toLowerCase();
    const intent = String(ev?.arrangementSupportIntent || '').trim().toLowerCase();
    const playerThemeSource = String(ev?.musicLanePlayerThemeSource || '').trim().toLowerCase();
    return !!intent
      || !!playerThemeSource
      || laneId === 'secondary_loop_lane'
      || laneId === 'sparkle_lane'
      || profile === 'secondary_bridge_backbeat'
      || profile === 'rhythm_lane';
  });
  const byIntent = {};
  const byStepBudget = {};
  const byProfileSourceType = {};
  const byPlayerThemeSource = {};
  const byPhraseId = {};
  const byPatternKey = {};
  const byInstrumentId = {};
  const byNote = {};
  const inc = (target, keyLike) => {
    const key = keyLike == null
      ? 'unknown'
      : (String(keyLike).trim().toLowerCase() || 'unknown');
    target[key] = (target[key] || 0) + 1;
  };
  for (const ev of supportEvents) {
    inc(byIntent, ev?.arrangementSupportIntent);
    inc(byStepBudget, ev?.arrangementSupportStepBudget);
    inc(byProfileSourceType, ev?.musicProfileSourceType);
    inc(byPlayerThemeSource, ev?.musicLanePlayerThemeSource);
    inc(byPhraseId, ev?.musicLanePhraseId);
    inc(byPatternKey, ev?.musicLanePatternKey);
    inc(byInstrumentId, ev?.instrumentId);
    inc(byNote, ev?.noteResolved || ev?.note);
  }
  return {
    count: supportEvents.length,
    byIntent,
    byStepBudget,
    byProfileSourceType,
    byPlayerThemeSource,
    byPhraseId,
    byPatternKey,
    byInstrumentId,
    byNote,
    sample: supportEvents.slice(0, 24).map((ev) => ({
      barIndex: clampInt(ev?.barIndex, 0, 0),
      stepIndex: clampInt(ev?.stepIndex, 0, 0),
      phase: String(ev?.phase || '').trim().toLowerCase(),
      actionType: String(ev?.actionType || '').trim().toLowerCase(),
      musicLaneId: String(ev?.musicLaneId || '').trim().toLowerCase(),
      musicLanePhraseId: String(ev?.musicLanePhraseId || '').trim().toLowerCase(),
      musicLanePatternKey: String(ev?.musicLanePatternKey || '').trim().toLowerCase(),
      musicLanePlayerThemeSource: String(ev?.musicLanePlayerThemeSource || '').trim(),
      instrumentId: String(ev?.instrumentId || '').trim(),
      note: String(ev?.note || '').trim(),
      noteResolved: String(ev?.noteResolved || '').trim(),
      musicProfileSourceType: String(ev?.musicProfileSourceType || '').trim().toLowerCase(),
      arrangementSupportIntent: String(ev?.arrangementSupportIntent || '').trim().toLowerCase(),
      arrangementSupportStepBudget: clampInt(ev?.arrangementSupportStepBudget, 0, 0),
    })),
  };
}

function collectLevel1ArrangementMusicalityAssertion(metrics) {
  const failures = [];
  const getCount = (bucket, key) => Math.max(0, clampInt(bucket?.[key], 0, 0));
  const getRange = (stats) => {
    const min = Number(stats?.min) || 0;
    const max = Number(stats?.max) || 0;
    return Math.max(0, max - min);
  };
  const assertPass = (condition, id, details = null) => {
    if (condition) return;
    failures.push({
      id,
      ...(details && typeof details === 'object' ? details : {}),
    });
  };

  const arrangementCount = Math.max(0, clampInt(metrics?.level1ArrangementTraceCount, 0, 0));
  const introSetPieceCount = Math.max(0, clampInt(metrics?.level1ArrangementIntroSetPieceCount, 0, 0));
  const introSetPieceViolationCount = Math.max(0, clampInt(metrics?.level1ArrangementIntroSetPieceViolationCount, 0, 0));
  const postIntroArrangementCount = Math.max(0, clampInt(metrics?.level1ArrangementPostIntroCount, 0, 0));
  const postIntroByIntent = metrics?.level1ArrangementPostIntroByPhraseIntent && typeof metrics.level1ArrangementPostIntroByPhraseIntent === 'object'
    ? metrics.level1ArrangementPostIntroByPhraseIntent
    : {};
  const supportByIntent = metrics?.arrangementSupportByIntent && typeof metrics.arrangementSupportByIntent === 'object'
    ? metrics.arrangementSupportByIntent
    : {};
  const formationArchetypeCounts = metrics?.formationRoleArchetypeCounts && typeof metrics.formationRoleArchetypeCounts === 'object'
    ? metrics.formationRoleArchetypeCounts
    : {};
  const cadencePunctuationCount = getCount(supportByIntent, 'cadence') + getCount(formationArchetypeCounts, 'answer_ornament:answer_echo');
  const nonIntroSupportCount = Object.entries(supportByIntent).reduce((total, [intent, count]) => {
    const key = String(intent || '').trim().toLowerCase();
    if (!key || key === 'unknown' || key === 'intro') return total;
    return total + Math.max(0, clampInt(count, 0, 0));
  }, 0);
  const leadVariation = metrics?.leadVariation && typeof metrics.leadVariation === 'object'
    ? metrics.leadVariation
    : {};
  const continuityPassed = metrics?.laneContinuityAssertionPassed === true
    && Math.max(0, clampInt(metrics?.laneContinuityBreaks, 0, 0)) === 0
    && Math.max(0, clampInt(metrics?.laneResetHandoffs, 0, 0)) === 0
    && Math.max(0, clampInt(metrics?.laneSystemVoiceFallbacks, 0, 0)) === 0
    && Math.max(0, clampInt(metrics?.protectedLaneVacantFallbacks, 0, 0)) === 0;
  const contractPassed = metrics?.level1ContractCompliancePassed === true
    && Math.max(0, clampInt(metrics?.level1ContractViolationCount, 0, 0)) === 0;
  const fullTextureReadableShare = Number(metrics?.visualRoleFullTextureThreeRoleReadableShare) || 0;
  const fullTextureLeadSupportShare = Number(metrics?.visualRoleFullTextureLeadWithSupportVisibleShare) || 0;
  const supportCollapsedShare = Number(metrics?.visualRoleSupportCollapsedDuringLeadShare) || 0;
  const avgDistinctReadableRoleCount = Number(metrics?.visualRoleAvgDistinctReadableRoleCount) || 0;

  assertPass(arrangementCount >= 96, 'arrangement_trace_missing_or_short', { arrangementCount, minimum: 96 });
  assertPass(introSetPieceCount >= 8, 'intro_set_piece_trace_missing', { introSetPieceCount, minimum: 8 });
  assertPass(introSetPieceViolationCount === 0, 'intro_set_piece_not_protected', { introSetPieceViolationCount });
  assertPass(postIntroArrangementCount >= 64, 'post_intro_arrangement_trace_short', { postIntroArrangementCount, minimum: 64 });
  assertPass(getCount(postIntroByIntent, 'body') >= 16, 'body_phrase_underrepresented', { count: getCount(postIntroByIntent, 'body'), minimum: 16 });
  assertPass(getCount(postIntroByIntent, 'build') >= 16, 'build_phrase_underrepresented', { count: getCount(postIntroByIntent, 'build'), minimum: 16 });
  assertPass(getCount(postIntroByIntent, 'recovery') >= 4, 'recovery_phrase_missing', { count: getCount(postIntroByIntent, 'recovery'), minimum: 4 });
  assertPass(getCount(postIntroByIntent, 'cadence') >= 2, 'cadence_phrase_missing', { count: getCount(postIntroByIntent, 'cadence'), minimum: 2 });
  assertPass(getRange(metrics?.level1ArrangementEnergy) >= 0.3, 'energy_range_too_flat', { range: Number(getRange(metrics?.level1ArrangementEnergy).toFixed(3)), minimum: 0.3 });
  assertPass(getRange(metrics?.level1ArrangementMelodicActivity) >= 0.3, 'melodic_activity_range_too_flat', { range: Number(getRange(metrics?.level1ArrangementMelodicActivity).toFixed(3)), minimum: 0.3 });
  assertPass(nonIntroSupportCount >= 48, 'arrangement_support_trace_short', { nonIntroSupportCount, minimum: 48 });
  assertPass(getCount(supportByIntent, 'body') > 0, 'body_support_missing', { count: getCount(supportByIntent, 'body') });
  assertPass(getCount(supportByIntent, 'build') > 0, 'build_support_missing', { count: getCount(supportByIntent, 'build') });
  assertPass(getCount(supportByIntent, 'recovery') > 0, 'recovery_support_missing', { count: getCount(supportByIntent, 'recovery') });
  assertPass(cadencePunctuationCount > 0, 'cadence_punctuation_missing', {
    cadenceSupportCount: getCount(supportByIntent, 'cadence'),
    answerEchoCount: getCount(formationArchetypeCounts, 'answer_ornament:answer_echo'),
  });
  assertPass(Math.max(0, clampInt(leadVariation?.count, 0, 0)) >= 96, 'lead_variation_trace_short', { count: Math.max(0, clampInt(leadVariation?.count, 0, 0)), minimum: 96 });
  assertPass(Math.max(0, clampInt(leadVariation?.distinctFamilyCount, 0, 0)) >= 2, 'lead_family_variation_missing', { count: Math.max(0, clampInt(leadVariation?.distinctFamilyCount, 0, 0)), minimum: 2 });
  assertPass(Math.max(0, clampInt(leadVariation?.distinctContourCount, 0, 0)) >= 3, 'lead_contour_variation_missing', { count: Math.max(0, clampInt(leadVariation?.distinctContourCount, 0, 0)), minimum: 3 });
  assertPass(continuityPassed, 'lane_continuity_failed', {
    laneContinuityBreaks: Math.max(0, clampInt(metrics?.laneContinuityBreaks, 0, 0)),
    laneResetHandoffs: Math.max(0, clampInt(metrics?.laneResetHandoffs, 0, 0)),
    laneSystemVoiceFallbacks: Math.max(0, clampInt(metrics?.laneSystemVoiceFallbacks, 0, 0)),
    protectedLaneVacantFallbacks: Math.max(0, clampInt(metrics?.protectedLaneVacantFallbacks, 0, 0)),
  });
  assertPass(contractPassed, 'level1_contract_failed', {
    level1ContractViolationCount: Math.max(0, clampInt(metrics?.level1ContractViolationCount, 0, 0)),
  });
  assertPass(fullTextureReadableShare >= 0.85, 'full_texture_readability_low', { share: Number(fullTextureReadableShare.toFixed(3)), minimum: 0.85 });
  assertPass(fullTextureLeadSupportShare >= 0.85, 'full_texture_lead_support_visibility_low', { share: Number(fullTextureLeadSupportShare.toFixed(3)), minimum: 0.85 });
  assertPass(supportCollapsedShare <= 0.15, 'support_collapsed_during_lead_high', { share: Number(supportCollapsedShare.toFixed(3)), maximum: 0.15 });
  assertPass(avgDistinctReadableRoleCount >= 2.8, 'readable_role_count_low', { count: Number(avgDistinctReadableRoleCount.toFixed(3)), minimum: 2.8 });

  return {
    passed: failures.length === 0,
    status: failures.length === 0 ? 'passed' : 'failed',
    failureCount: failures.length,
    failures,
    thresholds: {
      arrangementTraceMin: 96,
      introSetPieceTraceMin: 8,
      postIntroTraceMin: 64,
      bodyPhraseMin: 16,
      buildPhraseMin: 16,
      recoveryPhraseMin: 4,
      cadencePhraseMin: 2,
      arrangementSupportNonIntroMin: 48,
      fullTextureReadableShareMin: 0.85,
      fullTextureLeadSupportShareMin: 0.85,
      supportCollapsedDuringLeadShareMax: 0.15,
      avgDistinctReadableRoleCountMin: 2.8,
    },
  };
}

function collectMusicIntensityAuditionAssertion(metrics) {
  const failures = [];
  const getCount = (bucket, key) => Math.max(0, clampInt(bucket?.[key], 0, 0));
  const assertPass = (condition, id, details = null) => {
    if (condition) return;
    failures.push({
      id,
      ...(details && typeof details === 'object' ? details : {}),
    });
  };
  const stages = ['low', 'medium', 'build', 'peak', 'release', 'settle'];
  const stageCounts = metrics?.level1ArrangementByIntensityAuditionSection && typeof metrics.level1ArrangementByIntensityAuditionSection === 'object'
    ? metrics.level1ArrangementByIntensityAuditionSection
    : {};
  const lanePresence = metrics?.level1IntensityAuditionLanePresence && typeof metrics.level1IntensityAuditionLanePresence === 'object'
    ? metrics.level1IntensityAuditionLanePresence
    : {};
  const hasAudition = stages.some((stage) => getCount(stageCounts, stage) > 0);
  if (!hasAudition) {
    return {
      passed: false,
      status: 'not_detected',
      failureCount: 1,
      failures: [{ id: 'intensity_audition_not_detected' }],
      stageCounts,
      lanePresence,
      thresholds: {
        stageTraceMin: 2,
        energyRangeMin: 0.6,
        layeringRangeMin: 0.55,
      },
    };
  }

  for (const stage of stages) {
    assertPass(getCount(stageCounts, stage) >= 2, 'stage_trace_missing_or_short', {
      stage,
      count: getCount(stageCounts, stage),
      minimum: 2,
    });
  }
  const energyRange = Math.max(0, (Number(metrics?.level1ArrangementEnergy?.max) || 0) - (Number(metrics?.level1ArrangementEnergy?.min) || 0));
  const layeringRange = Math.max(0, (Number(metrics?.level1ArrangementLayering?.max) || 0) - (Number(metrics?.level1ArrangementLayering?.min) || 0));
  assertPass(energyRange >= 0.6, 'intensity_energy_range_too_flat', { range: Number(energyRange.toFixed(3)), minimum: 0.6 });
  assertPass(layeringRange >= 0.55, 'intensity_layering_range_too_flat', { range: Number(layeringRange.toFixed(3)), minimum: 0.55 });

  const low = lanePresence.low || {};
  const medium = lanePresence.medium || {};
  const build = lanePresence.build || {};
  const peak = lanePresence.peak || {};
  const release = lanePresence.release || {};
  assertPass(Math.max(0, clampInt(low?.primary_loop, 0, 0)) === 0, 'low_stage_lead_should_be_absent', { primaryLoopCount: Math.max(0, clampInt(low?.primary_loop, 0, 0)) });
  assertPass(Math.max(0, clampInt(medium?.primary_loop, 0, 0)) > 0, 'medium_stage_lead_missing', { primaryLoopCount: Math.max(0, clampInt(medium?.primary_loop, 0, 0)) });
  assertPass(Math.max(0, clampInt(build?.support, 0, 0)) > 0, 'build_stage_support_missing', { supportCount: Math.max(0, clampInt(build?.support, 0, 0)) });
  assertPass(Math.max(0, clampInt(peak?.maxActiveLaneCount, 0, 0)) >= 5, 'peak_stage_layer_stack_too_thin', { maxActiveLaneCount: Math.max(0, clampInt(peak?.maxActiveLaneCount, 0, 0)), minimum: 5 });
  assertPass(Math.max(0, clampInt(peak?.sparkle, 0, 0)) > 0, 'peak_stage_sparkle_missing', { sparkleCount: Math.max(0, clampInt(peak?.sparkle, 0, 0)) });
  assertPass(Math.max(0, clampInt(peak?.answer, 0, 0)) > 0, 'peak_stage_answer_missing', { answerCount: Math.max(0, clampInt(peak?.answer, 0, 0)) });
  assertPass(Math.max(0, clampInt(release?.maxActiveLaneCount, 0, 0)) <= 2, 'release_stage_not_stripped_back', { maxActiveLaneCount: Math.max(0, clampInt(release?.maxActiveLaneCount, 0, 0)), maximum: 2 });
  assertPass(metrics?.laneContinuityAssertionPassed === true && Math.max(0, clampInt(metrics?.laneContinuityBreaks, 0, 0)) === 0, 'lane_continuity_failed', {
    laneContinuityBreaks: Math.max(0, clampInt(metrics?.laneContinuityBreaks, 0, 0)),
  });

  return {
    passed: failures.length === 0,
    status: failures.length === 0 ? 'passed' : 'failed',
    failureCount: failures.length,
    failures,
    stageCounts,
    lanePresence,
    energyRange: Number(energyRange.toFixed(3)),
    layeringRange: Number(layeringRange.toFixed(3)),
    thresholds: {
      stageTraceMin: 2,
      energyRangeMin: 0.6,
      layeringRangeMin: 0.55,
      peakActiveLaneCountMin: 5,
      releaseActiveLaneCountMax: 2,
    },
  };
}

function collectLaneCompliance(events) {
  const createdEnemyEvents = events.filter((ev) => {
    if (String(ev?.phase || '').trim().toLowerCase() !== 'created') return false;
    const source = String(ev?.sourceSystem || '').trim().toLowerCase();
    if (source === 'player' || source === 'death' || source === 'unknown') return false;
    return true;
  });
  let evaluated = 0;
  let matched = 0;
  let missingActual = 0;
  const bySource = Object.create(null);
  const byLane = Object.create(null);
  const mismatchExamples = [];
  for (const ev of createdEnemyEvents) {
    const expected = normalizeInstrumentLane(ev?.expectedInstrumentLane, '');
    if (!expected) continue;
    const actual = normalizeInstrumentLane(ev?.actualInstrumentLane, '');
    const source = String(ev?.sourceSystem || '').trim().toLowerCase() || 'unknown';
    if (!bySource[source]) bySource[source] = { evaluated: 0, matched: 0, mismatched: 0, missingActual: 0 };
    if (!byLane[expected]) byLane[expected] = { evaluated: 0, matched: 0, mismatched: 0, missingActual: 0 };
    evaluated += 1;
    bySource[source].evaluated += 1;
    byLane[expected].evaluated += 1;
    if (!actual) {
      missingActual += 1;
      bySource[source].missingActual += 1;
      byLane[expected].missingActual += 1;
      if (mismatchExamples.length < 24) {
        mismatchExamples.push({
          beatIndex: clampInt(ev?.beatIndex, 0, 0),
          stepIndex: clampInt(ev?.stepIndex, 0, 0),
          sourceSystem: source,
          enemyType: String(ev?.enemyType || ''),
          actorId: clampInt(ev?.actorId, 0, 0),
          expectedInstrumentLane: expected,
          actualInstrumentLane: '',
          instrumentId: String(ev?.instrumentId || ''),
          actionType: String(ev?.actionType || ''),
        });
      }
      continue;
    }
    const laneMatch = actual === expected;
    if (laneMatch) {
      matched += 1;
      bySource[source].matched += 1;
      byLane[expected].matched += 1;
    } else {
      bySource[source].mismatched += 1;
      byLane[expected].mismatched += 1;
      if (mismatchExamples.length < 24) {
        mismatchExamples.push({
          beatIndex: clampInt(ev?.beatIndex, 0, 0),
          stepIndex: clampInt(ev?.stepIndex, 0, 0),
          sourceSystem: source,
          enemyType: String(ev?.enemyType || ''),
          actorId: clampInt(ev?.actorId, 0, 0),
          expectedInstrumentLane: expected,
          actualInstrumentLane: actual,
          instrumentId: String(ev?.instrumentId || ''),
          actionType: String(ev?.actionType || ''),
        });
      }
    }
  }
  return {
    evaluated,
    matched,
    missingActual,
    matchRate: evaluated > 0 ? (matched / evaluated) : 1,
    mismatchRate: evaluated > 0 ? ((evaluated - matched) / evaluated) : 0,
    bySource,
    byLane,
    mismatchExamples,
  };
}

function toAbsStepIndex(eventLike, stepsPerBeat = 8) {
  const ev = eventLike && typeof eventLike === 'object' ? eventLike : {};
  const beat = clampInt(ev?.beatIndex, 0, 0);
  const step = clampInt(ev?.stepIndex, 0, 0);
  const stepsPer = Math.max(1, clampInt(stepsPerBeat, 8, 1));
  const beatDerived = beat * stepsPer;
  // Beat Swarm records absolute step indices in stepIndex already.
  // Prefer that absolute position whenever present; otherwise fall back to beat-derived.
  if (step > 0 || beat <= 0) return step;
  return beatDerived + step;
}

function collectPlayerWeaponTiming(session, maxBarIndex) {
  const events = (Array.isArray(session?.systemEvents) ? session.systemEvents : [])
    .filter((ev) => String(ev?.eventType || '').trim().toLowerCase() === 'music_player_weapon_timing')
    .filter((ev) => clampInt(ev?.barIndex, 0, 0) <= maxBarIndex);
  let count = 0;
  let lateCount = 0;
  let earlyCount = 0;
  let severeCount = 0;
  let absOffsetSum = 0;
  let maxAbsOffsetMs = 0;
  for (const ev of events) {
    const offsetMs = Number(ev?.flushOffsetMs);
    if (!Number.isFinite(offsetMs)) continue;
    const absOffsetMs = Math.abs(offsetMs);
    count += 1;
    absOffsetSum += absOffsetMs;
    maxAbsOffsetMs = Math.max(maxAbsOffsetMs, absOffsetMs);
    if (offsetMs > 0.5) lateCount += 1;
    else if (offsetMs < -0.5) earlyCount += 1;
    if (absOffsetMs > 20) severeCount += 1;
  }
  return {
    count,
    lateCount,
    earlyCount,
    severeCount,
    avgAbsOffsetMs: count > 0 ? (absOffsetSum / count) : 0,
    maxAbsOffsetMs,
  };
}

function collectCallResponse(events, options = null) {
  const responseWindowSteps = Math.max(1, clampInt(options?.responseWindowSteps, 8, 1));
  const audibleWeightForEvent = (ev) => {
    const prominence = String(ev?.musicProminence || '').trim().toLowerCase();
    if (prominence === 'suppressed') return 0;
    if (prominence === 'full') return 1;
    if (prominence === 'quiet') return 0.68;
    if (prominence === 'trace') return 0.24;
    const audioGain = Math.max(0, Number(ev?.audioGain) || 0);
    if (audioGain >= 0.5) return 1;
    if (audioGain >= 0.26) return 0.68;
    if (audioGain > 0) return 0.24;
    return 0;
  };
  const actionable = events
    .filter((ev) => {
      const src = String(ev?.sourceSystem || '').trim().toLowerCase();
      if (src === 'player' || src === 'death' || src === 'unknown') return false;
      const lane = String(ev?.callResponseLane || '').trim().toLowerCase();
      if (lane !== 'call' && lane !== 'response') return false;
      return true;
    })
    .sort((a, b) => clampInt(a?.timestamp, 0, 0) - clampInt(b?.timestamp, 0, 0));

  let responsePairs = 0;
  let callCount = 0;
  let audibleResponsePairs = 0;
  let delayedResponsePairs = 0;
  let immediateResponsePairs = 0;
  let totalResponseSize = 0;
  let totalResponseAudibility = 0;
  const pairExamples = [];

  const actorKey = (ev) => {
    const gid = clampInt(ev?.groupId, 0, 0);
    if (gid > 0) return `group:${gid}`;
    const aid = clampInt(ev?.actorId, 0, 0);
    if (aid > 0) return `actor:${aid}`;
    return `src:${String(ev?.sourceSystem || 'unknown')}`;
  };

  for (let i = 0; i < actionable.length; i++) {
    const call = actionable[i];
    const callLane = String(call?.callResponseLane || '').trim().toLowerCase();
    if (callLane !== 'call') continue;
    const callQualified = call?.callResponseQualified !== false;
    if (!callQualified) continue;
    callCount += 1;
    const callActor = actorKey(call);
    const callStep = toAbsStepIndex(call, options?.stepsPerBeat || 8);
    let matched = false;
    for (let j = i + 1; j < actionable.length; j++) {
      const resp = actionable[j];
      if (String(resp?.callResponseLane || '').trim().toLowerCase() !== 'response') continue;
      const respStep = toAbsStepIndex(resp, options?.stepsPerBeat || 8);
      const delta = respStep - callStep;
      if (delta <= 0) continue;
      if (delta > responseWindowSteps) break;
      if (actorKey(resp) === callActor) continue;
      const respActor = actorKey(resp);
      let responseSize = Math.max(1, clampInt(resp?.callResponsePhraseProgress, 0, 0));
      let bestAudibility = audibleWeightForEvent(resp);
      for (let k = j + 1; k < actionable.length; k++) {
        const follow = actionable[k];
        if (String(follow?.callResponseLane || '').trim().toLowerCase() !== 'response') continue;
        const followStep = toAbsStepIndex(follow, options?.stepsPerBeat || 8);
        const followDelta = followStep - callStep;
        if (followDelta <= delta) continue;
        if (followDelta > responseWindowSteps) break;
        if (actorKey(follow) !== respActor) break;
        responseSize = Math.max(
          responseSize + 1,
          clampInt(follow?.callResponsePhraseProgress, 0, 0)
        );
        bestAudibility = Math.max(bestAudibility, audibleWeightForEvent(follow));
      }
      responsePairs += 1;
      totalResponseSize += responseSize;
      totalResponseAudibility += bestAudibility;
      if (bestAudibility >= 0.68) audibleResponsePairs += 1;
      if (delta <= 1) immediateResponsePairs += 1;
      else delayedResponsePairs += 1;
      matched = true;
      if (pairExamples.length < 24) {
        pairExamples.push({
          call: {
            beatIndex: clampInt(call?.beatIndex, 0, 0),
            stepIndex: clampInt(call?.stepIndex, 0, 0),
            sourceSystem: String(call?.sourceSystem || ''),
            actorId: clampInt(call?.actorId, 0, 0),
            groupId: clampInt(call?.groupId, 0, 0),
          },
          response: {
            beatIndex: clampInt(resp?.beatIndex, 0, 0),
            stepIndex: clampInt(resp?.stepIndex, 0, 0),
            sourceSystem: String(resp?.sourceSystem || ''),
            actorId: clampInt(resp?.actorId, 0, 0),
            groupId: clampInt(resp?.groupId, 0, 0),
          },
          deltaSteps: delta,
          responseSize,
          responseAudibility: Number(bestAudibility.toFixed(3)),
        });
      }
      break;
    }
    if (!matched) continue;
  }

  return {
    callCount,
    responsePairs,
    responseRate: callCount > 0 ? (responsePairs / callCount) : 0,
    audibleResponsePairs,
    audibleResponseRate: callCount > 0 ? (audibleResponsePairs / callCount) : 0,
    avgResponseSize: responsePairs > 0 ? (totalResponseSize / responsePairs) : 0,
    avgResponseAudibility: responsePairs > 0 ? (totalResponseAudibility / responsePairs) : 0,
    delayedResponsePairs,
    delayedResponseRate: responsePairs > 0 ? (delayedResponsePairs / responsePairs) : 0,
    immediateResponsePairs,
    immediateResponseRate: responsePairs > 0 ? (immediateResponsePairs / responsePairs) : 0,
    responseWindowSteps,
    pairExamples,
  };
}

function collectPaletteContinuity(session, maxBarIndex) {
  const paletteChanges = (Array.isArray(session?.paletteChanges) ? session.paletteChanges : [])
    .filter((e) => clampInt(e?.barIndex, 0, 0) <= maxBarIndex);
  const barsSinceLastPaletteChange = (() => {
    if (!paletteChanges.length) return maxBarIndex + 1;
    const lastBar = clampInt(paletteChanges[paletteChanges.length - 1]?.barIndex, 0, 0);
    return Math.max(0, maxBarIndex - lastBar);
  })();
  let themeChanges = 0;
  let roleInstrumentChanges = 0;
  for (let i = 1; i < paletteChanges.length; i++) {
    const prev = paletteChanges[i - 1] || {};
    const cur = paletteChanges[i] || {};
    if (String(prev.themeId || '') !== String(cur.themeId || '')) themeChanges += 1;
    const prevRoles = prev?.roles && typeof prev.roles === 'object' ? prev.roles : {};
    const curRoles = cur?.roles && typeof cur.roles === 'object' ? cur.roles : {};
    const roleKeys = new Set([...Object.keys(prevRoles), ...Object.keys(curRoles)]);
    for (const roleKey of roleKeys) {
      if (String(prevRoles[roleKey] || '') !== String(curRoles[roleKey] || '')) roleInstrumentChanges += 1;
    }
  }
  if (paletteChanges.length <= 1) {
    return {
      paletteChanges: paletteChanges.length,
      barsSinceLastPaletteChange,
      avgBarsBetweenChanges: maxBarIndex + 1,
      themeChanges,
      roleInstrumentChanges,
      paletteContinuityScore: 1,
    };
  }
  let spanTotal = 0;
  let spanCount = 0;
  for (let i = 1; i < paletteChanges.length; i++) {
    const prevBar = clampInt(paletteChanges[i - 1]?.barIndex, 0, 0);
    const curBar = clampInt(paletteChanges[i]?.barIndex, 0, 0);
    if (curBar < prevBar) continue;
    spanTotal += (curBar - prevBar);
    spanCount += 1;
  }
  const avgBarsBetweenChanges = spanCount > 0 ? (spanTotal / spanCount) : (maxBarIndex + 1);
  const spacingScore = Math.max(0, Math.min(1, avgBarsBetweenChanges / 32));
  const themePenalty = Math.min(0.35, themeChanges * 0.12);
  const rolePenalty = Math.min(0.35, roleInstrumentChanges * 0.02);
  const paletteContinuityScore = Math.max(0, Math.min(1, spacingScore - themePenalty - rolePenalty));
  return {
    paletteChanges: paletteChanges.length,
    barsSinceLastPaletteChange,
    avgBarsBetweenChanges,
    themeChanges,
    roleInstrumentChanges,
    paletteContinuityScore,
  };
}

function computeSummary(metrics) {
  const smooth = Number(metrics?.intervalProfile?.smoothShare) || 0;
  const maxRoleShare = Object.values(metrics?.roleBalance?.distribution || {}).reduce((m, v) => Math.max(m, Number(v) || 0), 0);
  const masking = Number(metrics?.playerMasking?.playerMaskingRate) || 0;
  const continuity = Number(metrics?.paletteContinuity?.paletteContinuityScore) || 0;
  const motifReuse = Number(metrics?.motifReuse?.motifReuseRate) || 0;
  const gravityHitRate = Number(metrics?.phraseGravity?.gravityHitRate) || 0;
  const phraseResolutionRate = Number(metrics?.phraseGravity?.phraseResolutionRate) || 0;
  const responseRate = Number(metrics?.callResponse?.responseRate) || 0;
  const audibleResponseRate = Number(metrics?.callResponse?.audibleResponseRate) || 0;
  const avgResponseSize = Number(metrics?.callResponse?.avgResponseSize) || 0;
  const avgResponseAudibility = Number(metrics?.callResponse?.avgResponseAudibility) || 0;
  const delayedResponseRate = Number(metrics?.callResponse?.delayedResponseRate) || 0;
  const immediateResponseRate = Number(metrics?.callResponse?.immediateResponseRate) || 0;
  const pitchEntropy = Number(metrics?.pitchEntropy?.entropyOverall) || 0;
  const contourLargeLeapRate = Number(metrics?.melodicContour?.largeLeapRate) || 0;
  const motifPersistence = Number(metrics?.motifPersistence?.weightedPersistence) || 0;
  const laneMatchRate = Number(metrics?.laneCompliance?.matchRate);
  const handoffSuccessRate = Number(metrics?.handoff?.successRate) || 0;
  const playerOverrideRate = Number(metrics?.playerInstrument?.manualOverrideRate) || 0;
  const bassPersistence = Number(metrics?.grooveStability?.bassPatternPersistence) || 0;
  const avgPitchPerBar = Number(metrics?.grooveStability?.avgUniquePitchPerBar) || 0;
  const avgRhythmPerBar = Number(metrics?.grooveStability?.avgUniqueRhythmicEventsPerBar) || 0;
  const sectionAvgBars = Number(metrics?.sectionStability?.avgDurationBars) || 0;
  const avgRecentNovelIdentityCount = Number(metrics?.onboarding?.avgRecentNovelIdentityCount) || 0;
  const noveltyPressureRate = Number(metrics?.onboarding?.noveltyPressureRate) || 0;
  const avgKnownIdentityCount = Number(metrics?.onboarding?.avgKnownIdentityCount) || 0;
  const avgEnemyCompetitionShare = Number(metrics?.readability?.avgEnemyCompetitionShare) || 0;
  const avgEnemyForegroundShare = Number(metrics?.readability?.avgEnemyForegroundShare) || 0;
  const avgEnemyNonFoundationForegroundShare = Number(metrics?.readability?.avgEnemyNonFoundationForegroundShare) || 0;
  const headingCoverageRate = Number(metrics?.sectionPresentation?.headingCoverageRate) || 0;
  const uniqueHeadingTitles = Math.max(0, clampInt(metrics?.sectionPresentation?.uniqueHeadingTitles, 0, 0));
  const avgBarsBetweenHeadingChanges = Number(metrics?.sectionPresentation?.avgBarsBetweenHeadingChanges) || 0;
  const meaningfulTitleRate = Number(metrics?.sectionPresentation?.meaningfulTitleRate) || 0;
  const totalSectionChanges = Math.max(0, clampInt(metrics?.sectionPresentation?.totalSectionChanges, 0, 0));
  const spawnerPipelineMismatches = Math.max(0, clampInt(metrics?.spawnerPipeline?.spawnerPipelineMismatches, 0, 0));
  const spawnerAudioShortfall = Math.max(0, clampInt(metrics?.spawnerPipeline?.audioShortfall, 0, 0));
  const spawnerVisualShortfall = Math.max(0, clampInt(metrics?.spawnerPipeline?.visualShortfall, 0, 0));
  const spawnerLoopgridShortfall = Math.max(0, clampInt(metrics?.spawnerPipeline?.loopgridShortfall, 0, 0));
  const explosionReliabilityRate = Number(metrics?.explosionReliability?.explosionReliabilityRate) || 0;
  const explosionPrimeWithoutApplicationCount = Math.max(0, clampInt(metrics?.explosionReliability?.explosionPrimeWithoutApplicationCount, 0, 0));
  const foundationQuietShare = Number(metrics?.foundationProminence?.quietShare) || 0;
  const foundationTraceShare = Number(metrics?.foundationProminence?.traceShare) || 0;
  const foundationSuppressedShare = Number(metrics?.foundationProminence?.suppressedShare) || 0;
  const foundationDeconflictChangeRate = Number(metrics?.foundationProminence?.deconflictChangeRate) || 0;
  const bassLoopCycles = Number(metrics?.bassLoopCycles) || 0;
  const bassPhraseResets = Number(metrics?.bassPhraseResets) || 0;
  const bassHandoffContinuityRate = Number(metrics?.bassHandoffContinuityRate) || 0;
  const instrumentChangesPerEnemy = Number(metrics?.instrumentChangesPerEnemy) || 0;
  const colourChangesPerEnemy = Number(metrics?.colourChangesPerEnemy) || 0;
  const spawnerMismatchCount = Math.max(0, clampInt(metrics?.passDiagnostics?.spawnerFeedback?.spawnerMismatchCount, 0, 0));
  const createdEnemyEvents = Math.max(0, clampInt(metrics?.passDiagnostics?.delivery?.createdEnemyEvents, 0, 0));
  const skippedCreatedEvents = Math.max(0, clampInt(metrics?.passDiagnostics?.delivery?.skippedCreatedEvents, 0, 0));
  const createdSpawnerEvents = Math.max(0, clampInt(metrics?.passDiagnostics?.delivery?.createdSpawnerEvents, 0, 0));
  const spawnerSkippedCreatedEvents = Math.max(0, clampInt(metrics?.passDiagnostics?.delivery?.spawnerSkippedCreatedEvents, 0, 0));
  const createdBassEvents = Math.max(0, clampInt(metrics?.passDiagnostics?.delivery?.createdBassEvents, 0, 0));
  const bassSkippedCreatedEvents = Math.max(0, clampInt(metrics?.passDiagnostics?.delivery?.bassSkippedCreatedEvents, 0, 0));
  const executedToCreatedRate = Number(metrics?.passDiagnostics?.delivery?.executedToCreatedRate);
  const spawnerExecutedToCreatedRate = Number(metrics?.passDiagnostics?.delivery?.spawnerExecutedToCreatedRate);
  const bassExecutedToCreatedRate = Number(metrics?.passDiagnostics?.delivery?.bassExecutedToCreatedRate);
  const maxEnemyStepsWithoutBass = Math.max(0, clampInt(metrics?.passDiagnostics?.delivery?.maxEnemyStepsWithoutBass, 0, 0));
  const preservedLaneHandoffs = Math.max(0, clampInt(metrics?.passDiagnostics?.ownershipContinuity?.preservedHandoffs, 0, 0));
  const resetLaneHandoffs = Math.max(0, clampInt(metrics?.passDiagnostics?.ownershipContinuity?.resetHandoffs, 0, 0));
  const sameContinuityInstrumentDrift = Math.max(0, clampInt(metrics?.passDiagnostics?.ownershipContinuity?.sameContinuityInstrumentDrift, 0, 0));
  const sameContinuityPatternDrift = Math.max(0, clampInt(metrics?.passDiagnostics?.ownershipContinuity?.sameContinuityPatternDrift, 0, 0));
  const laneContinuityAssertionPassed = metrics?.passDiagnostics?.ownershipContinuity?.laneContinuityAssertionPassed === true
    || metrics?.laneContinuityAssertionPassed === true;
  const deferredLaneChanges = Math.max(0, clampInt(metrics?.passDiagnostics?.ownershipContinuity?.deferredChanges, 0, 0));
  const appliedDeferredLaneChanges = Math.max(0, clampInt(metrics?.passDiagnostics?.ownershipContinuity?.appliedDeferredChanges, 0, 0));
  const replacedDeferredLaneChanges = Math.max(0, clampInt(metrics?.passDiagnostics?.ownershipContinuity?.replacedDeferredChanges, 0, 0));
  const droppedDeferredLaneChanges = Math.max(0, clampInt(metrics?.passDiagnostics?.ownershipContinuity?.droppedDeferredChanges, 0, 0));
  const rejectedDeferredLaneChanges = Math.max(0, clampInt(metrics?.passDiagnostics?.ownershipContinuity?.rejectedDeferredChanges, 0, 0));
  const avgDeferredWaitSteps = Number(metrics?.passDiagnostics?.ownershipContinuity?.avgDeferredWaitSteps) || 0;
  const primaryLeadStatus = String(metrics?.musicalityTargets?.primaryLead?.status || '').trim().toLowerCase();
  const primaryLeadPersistenceStatus = String(metrics?.musicalityTargets?.primaryLead?.persistenceStatus || '').trim().toLowerCase();
  const foundationBufferStatus = String(metrics?.musicalityTargets?.foundationBuffer?.status || '').trim().toLowerCase();
  const answerOrnamentStatus = String(metrics?.musicalityTargets?.answerOrnament?.status || '').trim().toLowerCase();
  const populationStatus = String(metrics?.musicalityTargets?.population?.status || '').trim().toLowerCase();
  const retroShmupStyle = metrics?.retroShmupStyle && typeof metrics.retroShmupStyle === 'object'
    ? metrics.retroShmupStyle
    : {};
  const visualRoleTraceCount = Math.max(0, clampInt(metrics?.visualRoleReadabilityTraceCount, 0, 0));
  const visualRoleFullTextureTraceCount = Math.max(0, clampInt(metrics?.visualRoleFullTextureTraceCount, 0, 0));
  const visualRoleThreeRoleReadableShare = Number(metrics?.visualRoleThreeRoleReadableShare) || 0;
  const visualRoleFullTextureThreeRoleReadableShare = Number(metrics?.visualRoleFullTextureThreeRoleReadableShare) || 0;
  const visualRoleLeadWithSupportVisibleShare = Number(metrics?.visualRoleLeadWithSupportVisibleShare) || 0;
  const visualRoleFullTextureLeadWithSupportVisibleShare = Number(metrics?.visualRoleFullTextureLeadWithSupportVisibleShare) || 0;
  const visualRoleSupportCollapsedDuringLeadShare = Number(metrics?.visualRoleSupportCollapsedDuringLeadShare) || 0;
  const visualRoleAvgDistinctReadableRoleCount = Number(metrics?.visualRoleAvgDistinctReadableRoleCount) || 0;
  const formationRoleFullTextureThreeRoleReadableShare = Number(metrics?.formationRoleFullTextureThreeRoleReadableShare) || 0;
  const formationRoleFullTextureLeadWithSupportVisibleShare = Number(metrics?.formationRoleFullTextureLeadWithSupportVisibleShare) || 0;
  const formationRoleSupportCollapsedDuringLeadShare = Number(metrics?.formationRoleSupportCollapsedDuringLeadShare) || 0;
  const formationRoleAvgDistinctReadableRoleCount = Number(metrics?.formationRoleAvgDistinctReadableRoleCount) || 0;
  const level1ArrangementMusicality = metrics?.level1ArrangementMusicality && typeof metrics.level1ArrangementMusicality === 'object'
    ? metrics.level1ArrangementMusicality
    : null;
  const visualRoleReadabilityStatus = visualRoleTraceCount <= 0
    ? 'missing'
    : (
      visualRoleFullTextureTraceCount > 0
      && visualRoleFullTextureThreeRoleReadableShare >= 0.6
      && visualRoleFullTextureLeadWithSupportVisibleShare >= 0.85
      && visualRoleSupportCollapsedDuringLeadShare <= 0.15
        ? 'readable'
        : (
          visualRoleThreeRoleReadableShare >= 0.45
          && visualRoleLeadWithSupportVisibleShare >= 0.7
          && visualRoleSupportCollapsedDuringLeadShare <= 0.25
            ? 'partial'
            : 'blurred'
        )
    );
  return {
    notePoolCompliance: `${Math.round((Number(metrics?.notePoolCompliance?.poolComplianceRate) || 0) * 100)}%`,
    motifReuse: `${Math.round(motifReuse * 100)}%`,
    gravityHitRate: Number(gravityHitRate.toFixed(3)),
    phraseResolutionRate: Number(phraseResolutionRate.toFixed(3)),
    leadIntervalSmoothness: smooth >= 0.8 ? 'good' : (smooth >= 0.62 ? 'acceptable' : 'rough'),
    roleBalance: maxRoleShare <= 0.58 ? 'acceptable' : 'skewed',
    responseRate: Number(responseRate.toFixed(3)),
    audibleResponseRate: Number(audibleResponseRate.toFixed(3)),
    avgResponseSize: Number(avgResponseSize.toFixed(3)),
    avgResponseAudibility: Number(avgResponseAudibility.toFixed(3)),
    delayedResponseRate: Number(delayedResponseRate.toFixed(3)),
    immediateResponseRate: Number(immediateResponseRate.toFixed(3)),
    pitchEntropy: Number(pitchEntropy.toFixed(3)),
    melodicContour: contourLargeLeapRate <= 0.18 ? 'stable' : (contourLargeLeapRate <= 0.32 ? 'mixed' : 'jumpy'),
    motifPersistence: Number(motifPersistence.toFixed(3)),
    laneCompliance: Number.isFinite(laneMatchRate)
      ? (laneMatchRate >= 0.82 ? 'good' : (laneMatchRate >= 0.65 ? 'mixed' : 'poor'))
      : 'unknown',
    paletteContinuity: continuity >= 0.6 ? 'stable' : 'volatile',
    playerMasking: masking <= 0.25 ? 'low' : (masking <= 0.45 ? 'moderate' : 'high'),
    removalCleanup: (
      (Number(metrics?.enemyRemovals?.directorCleanupRemovals) || 0) > 0
      || (Number(metrics?.enemyRemovals?.sectionChangeCleanupRemovals) || 0) > 0
    ) ? 'warning' : 'clean',
    spawnerSync: (Number(metrics?.spawnerSync?.perfectSyncSpawnerPairs) || 0) > 0 ? 'warning' : 'ok',
    handoff: handoffSuccessRate >= 0.75 ? 'stable' : (handoffSuccessRate >= 0.45 ? 'mixed' : 'fragile'),
    playerOverride: playerOverrideRate >= 0.2 ? 'active' : (playerOverrideRate > 0 ? 'present' : 'inactive'),
    grooveStability: (bassPersistence >= 0.52 && avgPitchPerBar <= 5.2 && avgRhythmPerBar <= 11.5 && sectionAvgBars >= 8)
      ? 'stable'
      : 'volatile',
    onboardingNovelty: (avgRecentNovelIdentityCount <= 1.1 && noveltyPressureRate <= 0.25) ? 'controlled' : 'crowded',
    identityOnboarding: avgKnownIdentityCount >= 3 ? 'established' : 'early',
    readabilityDensity: (
      avgEnemyNonFoundationForegroundShare <= 0.12
      && avgEnemyCompetitionShare <= 0.32
    ) ? 'clear' : 'busy',
    sectionPresentation: totalSectionChanges < 3
      ? 'insufficient_data'
      : (
        (headingCoverageRate >= 0.9 && uniqueHeadingTitles >= 5 && avgBarsBetweenHeadingChanges >= 4.5 && meaningfulTitleRate >= 0.85)
          ? 'coherent'
          : ((headingCoverageRate >= 0.6 && meaningfulTitleRate >= 0.55) ? 'partial' : 'missing')
      ),
    spawnerFeedback: (spawnerPipelineMismatches === 0 && spawnerAudioShortfall === 0 && spawnerVisualShortfall === 0 && spawnerLoopgridShortfall === 0)
      ? 'consistent'
      : 'mismatch',
    explosionReliability: (explosionPrimeWithoutApplicationCount === 0 && explosionReliabilityRate >= 0.999)
      ? 'reliable'
      : (explosionReliabilityRate >= 0.9 ? 'at_risk' : 'fragile'),
    foundationProminence: foundationSuppressedShare > 0
      ? 'suppressed'
      : ((foundationTraceShare > 0.2 || foundationDeconflictChangeRate > 0.35) ? 'heavily_ducked' : ((foundationQuietShare > 0.7) ? 'quiet_dominant' : 'balanced')),
    beatDelivery: (
      createdEnemyEvents > 0
      && executedToCreatedRate >= 0.985
      && (createdSpawnerEvents === 0 || (spawnerExecutedToCreatedRate >= 0.99 && spawnerSkippedCreatedEvents === 0))
      && (createdBassEvents === 0 || (bassExecutedToCreatedRate >= 0.99 && bassSkippedCreatedEvents === 0))
      && maxEnemyStepsWithoutBass <= 24
    ) ? 'stable' : 'drops_detected',
    bassFoundation: (bassLoopCycles >= 2 && bassPhraseResets === 0 && bassHandoffContinuityRate >= 0.9) ? 'stable' : 'at_risk',
    identityStability: (
      instrumentChangesPerEnemy === 0
      && colourChangesPerEnemy === 0
      && sameContinuityInstrumentDrift === 0
      && resetLaneHandoffs === 0
    ) ? (sameContinuityPatternDrift > 0 ? 'pattern_variation' : 'stable') : 'drift',
    ownershipContinuity: laneContinuityAssertionPassed
      ? (preservedLaneHandoffs > 0 ? 'preserved' : 'stable')
      : 'drift',
    deferredOwnershipChanges: (
      deferredLaneChanges === 0
      || (
        appliedDeferredLaneChanges >= Math.max(1, deferredLaneChanges - replacedDeferredLaneChanges - droppedDeferredLaneChanges)
        && droppedDeferredLaneChanges === 0
        && avgDeferredWaitSteps <= 8
      )
    ) ? 'healthy' : 'backlogged',
    spawnerFeedbackMismatchCount: spawnerMismatchCount,
    skippedCreatedEvents,
    spawnerSkippedCreatedEvents,
    bassSkippedCreatedEvents,
    maxEnemyStepsWithoutBass,
    primaryLead: primaryLeadStatus || 'unknown',
    primaryLeadPersistence: primaryLeadPersistenceStatus || 'unknown',
    foundationBufferBounds: foundationBufferStatus || 'unknown',
    answerOrnamentContainment: answerOrnamentStatus || 'unknown',
    composerPopulation: populationStatus || 'unknown',
    retroShmupStyle: String(retroShmupStyle?.styleStatus || '').trim().toLowerCase() || 'unknown',
    retroShmupStyleScore: Number(Number(retroShmupStyle?.overallScore) || 0).toFixed(3),
    retroShmupPulseRegularity: Number(Number(retroShmupStyle?.pulseRegularityScore) || 0).toFixed(3),
    retroShmupLeadAuthority: Number(Number(retroShmupStyle?.leadAuthorityScore) || 0).toFixed(3),
    retroShmupSupportDiscipline: Number(Number(retroShmupStyle?.supportDisciplineScore) || 0).toFixed(3),
    retroShmupArrangementSimplicity: Number(Number(retroShmupStyle?.arrangementSimplicityScore) || 0).toFixed(3),
    visualRoleReadability: visualRoleReadabilityStatus,
    visualRoleTraceCount,
    visualRoleFullTextureTraceCount,
    visualRoleThreeRoleReadableShare: Number(visualRoleThreeRoleReadableShare.toFixed(3)),
    visualRoleFullTextureThreeRoleReadableShare: Number(visualRoleFullTextureThreeRoleReadableShare.toFixed(3)),
    visualRoleLeadWithSupportVisibleShare: Number(visualRoleLeadWithSupportVisibleShare.toFixed(3)),
    visualRoleFullTextureLeadWithSupportVisibleShare: Number(visualRoleFullTextureLeadWithSupportVisibleShare.toFixed(3)),
    visualRoleSupportCollapsedDuringLeadShare: Number(visualRoleSupportCollapsedDuringLeadShare.toFixed(3)),
    visualRoleAvgDistinctReadableRoleCount: Number(visualRoleAvgDistinctReadableRoleCount.toFixed(3)),
    formationRoleFullTextureThreeRoleReadableShare: Number(formationRoleFullTextureThreeRoleReadableShare.toFixed(3)),
    formationRoleFullTextureLeadWithSupportVisibleShare: Number(formationRoleFullTextureLeadWithSupportVisibleShare.toFixed(3)),
    formationRoleSupportCollapsedDuringLeadShare: Number(formationRoleSupportCollapsedDuringLeadShare.toFixed(3)),
    formationRoleAvgDistinctReadableRoleCount: Number(formationRoleAvgDistinctReadableRoleCount.toFixed(3)),
    level1ArrangementMusicality: String(level1ArrangementMusicality?.status || '').trim().toLowerCase() || 'unknown',
    level1ArrangementMusicalityFailureCount: Math.max(0, clampInt(level1ArrangementMusicality?.failureCount, 0, 0)),
  };
}

function collectMusicalityTargets(session, maxBarIndex) {
  const logs = (Array.isArray(session?.systemEvents) ? session.systemEvents : [])
    .filter((e) => (
      String(e?.eventType || '').trim().toLowerCase() === 'music_composer_group_state'
      && clampInt(e?.barIndex, 0, 0) <= maxBarIndex
    ));
  const perStep = new Map();
  const getStepBucket = (barIndex, beatIndex, stepIndex) => {
    const stepKey = `${clampInt(barIndex, 0, 0)}:${clampInt(beatIndex, 0, 0)}:${clampInt(stepIndex, 0, 0)}`;
    let bucket = perStep.get(stepKey);
    if (!bucket) {
      bucket = new Map();
      perStep.set(stepKey, bucket);
    }
    return bucket;
  };
  for (const log of logs) {
    const bucket = getStepBucket(log?.barIndex, log?.beatIndex, log?.stepIndex);
    const groupId = Math.max(0, clampInt(log?.groupId, 0, 0));
    if (groupId <= 0) continue;
    bucket.set(groupId, log);
  }
  const timeline = Array.isArray(session?.events)
    ? session.events
    : (Array.isArray(session?.eventTimeline) ? session.eventTimeline : []);
  for (let i = 0; i < timeline.length; i += 1) {
    const event = timeline[i] && typeof timeline[i] === 'object' ? timeline[i] : null;
    const payload = event?.payload && typeof event.payload === 'object' ? event.payload : event;
    if (!payload) continue;
    const musicLaneId = String(payload?.musicLaneId || '').trim().toLowerCase();
    const role = String(payload?.role || payload?.musicRole || '').trim().toLowerCase();
    const profileSourceType = String(payload?.musicProfileSourceType || payload?.reason || '').trim().toLowerCase();
    const primaryLeadEvent = musicLaneId === 'primary_loop_lane'
      && (profileSourceType === 'lead_melody' || role === 'lead');
    if (!primaryLeadEvent) continue;
    const bucket = getStepBucket(payload?.barIndex ?? event?.barIndex, payload?.beatIndex ?? event?.beatIndex, payload?.stepIndex ?? event?.stepIndex);
    const groupId = Math.max(
      0,
      clampInt(payload?.groupId ?? event?.groupId ?? payload?.actorGroupId ?? event?.actorGroupId ?? payload?.musicGroupId ?? event?.musicGroupId, 0, 0)
    );
    if (groupId <= 0) continue;
    if (bucket.has(groupId)) continue;
    bucket.set(groupId, {
      active: true,
      retiring: false,
      lifecycleState: 'active',
      groupId,
      musicLaneId: 'primary_loop_lane',
      reason: profileSourceType || 'lead_melody',
      role: role || 'lead',
      source: 'event_timeline',
    });
  }
  let stepsAnalyzed = 0;
  let stepsWithSinglePrimaryLead = 0;
  let stepsWithNoPrimaryLead = 0;
  let stepsWithMultiplePrimaryLeads = 0;
  let totalPrimaryLeadCount = 0;
  let maxPrimaryLeadCount = 0;
  let longestSinglePrimaryLeadRunSteps = 0;
  let currentSinglePrimaryLeadRunSteps = 0;
  let lastSinglePrimaryLeadId = 0;
  const primaryLeadIds = new Set();
  let totalFoundationBufferCount = 0;
  let maxFoundationBufferCount = 0;
  let stepsWithMultipleFoundationBuffers = 0;
  let totalAnswerOrnamentCount = 0;
  let maxAnswerOrnamentCount = 0;
  let stepsWithMultipleAnswerOrnaments = 0;
  let answerOrnamentLeadRoleEvents = 0;
  let totalActiveComposerGroupCount = 0;
  let maxActiveComposerGroupCount = 0;
  for (const bucket of perStep.values()) {
    const activeGroups = [...bucket.values()].filter((record) => record?.active === true && record?.retiring !== true);
    stepsAnalyzed += 1;
    totalActiveComposerGroupCount += activeGroups.length;
    if (activeGroups.length > maxActiveComposerGroupCount) maxActiveComposerGroupCount = activeGroups.length;
    const primaryLeadGroups = activeGroups.filter((record) => (
      String(record?.musicLaneId || '').trim().toLowerCase() === 'primary_loop_lane'
      && (
        String(record?.reason || '').trim().toLowerCase() === 'lead_melody'
        || String(record?.musicProfileSourceType || '').trim().toLowerCase() === 'lead_melody'
        || String(record?.role || '').trim().toLowerCase() === 'lead'
      )
      && String(record?.lifecycleState || '').trim().toLowerCase() !== 'retiring'
    ));
    const primaryLeadCount = primaryLeadGroups.length;
    totalPrimaryLeadCount += primaryLeadCount;
    if (primaryLeadCount > maxPrimaryLeadCount) maxPrimaryLeadCount = primaryLeadCount;
    if (primaryLeadCount === 0) {
      stepsWithNoPrimaryLead += 1;
      currentSinglePrimaryLeadRunSteps = 0;
      lastSinglePrimaryLeadId = 0;
    } else if (primaryLeadCount === 1) {
      stepsWithSinglePrimaryLead += 1;
      const currentLeadId = Math.max(0, clampInt(primaryLeadGroups[0]?.groupId, 0, 0));
      if (currentLeadId > 0) primaryLeadIds.add(currentLeadId);
      if (currentLeadId > 0 && currentLeadId === lastSinglePrimaryLeadId) currentSinglePrimaryLeadRunSteps += 1;
      else currentSinglePrimaryLeadRunSteps = 1;
      lastSinglePrimaryLeadId = currentLeadId;
      if (currentSinglePrimaryLeadRunSteps > longestSinglePrimaryLeadRunSteps) longestSinglePrimaryLeadRunSteps = currentSinglePrimaryLeadRunSteps;
    } else {
      stepsWithMultiplePrimaryLeads += 1;
      for (const group of primaryLeadGroups) {
        const groupId = Math.max(0, clampInt(group?.groupId, 0, 0));
        if (groupId > 0) primaryLeadIds.add(groupId);
      }
      currentSinglePrimaryLeadRunSteps = 0;
      lastSinglePrimaryLeadId = 0;
    }
    const foundationBuffers = activeGroups.filter((record) => String(record?.templateId || '').trim() === 'foundation-buffer');
    const foundationBufferCount = foundationBuffers.length;
    totalFoundationBufferCount += foundationBufferCount;
    if (foundationBufferCount > maxFoundationBufferCount) maxFoundationBufferCount = foundationBufferCount;
    if (foundationBufferCount > 1) stepsWithMultipleFoundationBuffers += 1;
    const answerOrnaments = activeGroups.filter((record) => String(record?.reason || '').trim().toLowerCase() === 'answer_ornament');
    const answerOrnamentCount = answerOrnaments.length;
    totalAnswerOrnamentCount += answerOrnamentCount;
    if (answerOrnamentCount > maxAnswerOrnamentCount) maxAnswerOrnamentCount = answerOrnamentCount;
    if (answerOrnamentCount > 1) stepsWithMultipleAnswerOrnaments += 1;
    answerOrnamentLeadRoleEvents += answerOrnaments.filter((record) => String(record?.role || '').trim().toLowerCase() === 'lead').length;
  }
  const singleLeadShare = stepsAnalyzed > 0 ? (stepsWithSinglePrimaryLead / stepsAnalyzed) : 0;
  const noLeadShare = stepsAnalyzed > 0 ? (stepsWithNoPrimaryLead / stepsAnalyzed) : 0;
  const multiLeadShare = stepsAnalyzed > 0 ? (stepsWithMultiplePrimaryLeads / stepsAnalyzed) : 0;
  const avgPrimaryLeadCount = stepsAnalyzed > 0 ? (totalPrimaryLeadCount / stepsAnalyzed) : 0;
  const avgFoundationBufferCount = stepsAnalyzed > 0 ? (totalFoundationBufferCount / stepsAnalyzed) : 0;
  const avgAnswerOrnamentCount = stepsAnalyzed > 0 ? (totalAnswerOrnamentCount / stepsAnalyzed) : 0;
  const avgActiveComposerGroupCount = stepsAnalyzed > 0 ? (totalActiveComposerGroupCount / stepsAnalyzed) : 0;
  const leadAuthorityLogs = (Array.isArray(session?.systemEvents) ? session.systemEvents : [])
    .filter((e) => (
      String(e?.eventType || '').trim().toLowerCase() === 'music_mode_state'
      && clampInt(e?.barIndex, 0, 0) <= maxBarIndex
    ));
  let authorityStepsAnalyzed = 0;
  let authorityActiveSteps = 0;
  let authorityGroupSwitches = 0;
  let authorityContinuitySwitches = 0;
  let authorityInstrumentSwitches = 0;
  let authorityLongestGroupRunSteps = 0;
  let authorityCurrentGroupRunSteps = 0;
  let authorityLongestContinuityRunSteps = 0;
  let authorityCurrentContinuityRunSteps = 0;
  let authorityLongestInstrumentRunSteps = 0;
  let authorityCurrentInstrumentRunSteps = 0;
  let lastAuthorityGroupId = 0;
  let lastAuthorityContinuityId = '';
  let lastAuthorityInstrumentId = '';
  for (const log of leadAuthorityLogs) {
    authorityStepsAnalyzed += 1;
    const groupId = Math.max(0, clampInt(log?.canonicalLeadGroupId, 0, 0));
    const continuityId = String(log?.canonicalLeadContinuityId || '').trim();
    const instrumentId = String(log?.canonicalLeadInstrumentId || '').trim();
    const authorityActive = groupId > 0 || !!continuityId || !!instrumentId;
    if (authorityActive) authorityActiveSteps += 1;
    if (groupId > 0) {
      if (groupId === lastAuthorityGroupId) authorityCurrentGroupRunSteps += 1;
      else {
        if (lastAuthorityGroupId > 0) authorityGroupSwitches += 1;
        authorityCurrentGroupRunSteps = 1;
      }
      lastAuthorityGroupId = groupId;
      if (authorityCurrentGroupRunSteps > authorityLongestGroupRunSteps) authorityLongestGroupRunSteps = authorityCurrentGroupRunSteps;
    } else {
      authorityCurrentGroupRunSteps = 0;
      lastAuthorityGroupId = 0;
    }
    if (continuityId) {
      if (continuityId === lastAuthorityContinuityId) authorityCurrentContinuityRunSteps += 1;
      else {
        if (lastAuthorityContinuityId) authorityContinuitySwitches += 1;
        authorityCurrentContinuityRunSteps = 1;
      }
      lastAuthorityContinuityId = continuityId;
      if (authorityCurrentContinuityRunSteps > authorityLongestContinuityRunSteps) authorityLongestContinuityRunSteps = authorityCurrentContinuityRunSteps;
    } else {
      authorityCurrentContinuityRunSteps = 0;
      lastAuthorityContinuityId = '';
    }
    if (instrumentId) {
      if (instrumentId === lastAuthorityInstrumentId) authorityCurrentInstrumentRunSteps += 1;
      else {
        if (lastAuthorityInstrumentId) authorityInstrumentSwitches += 1;
        authorityCurrentInstrumentRunSteps = 1;
      }
      lastAuthorityInstrumentId = instrumentId;
      if (authorityCurrentInstrumentRunSteps > authorityLongestInstrumentRunSteps) authorityLongestInstrumentRunSteps = authorityCurrentInstrumentRunSteps;
    } else {
      authorityCurrentInstrumentRunSteps = 0;
      lastAuthorityInstrumentId = '';
    }
  }
  const compactLeadExclusive = stepsAnalyzed > 0
    && stepsWithMultiplePrimaryLeads === 0
    && stepsWithNoPrimaryLead === 0
    && singleLeadShare >= 0.9;
  if (authorityStepsAnalyzed === 0 && compactLeadExclusive) {
    authorityStepsAnalyzed = stepsAnalyzed;
    authorityActiveSteps = stepsWithSinglePrimaryLead;
    authorityLongestGroupRunSteps = longestSinglePrimaryLeadRunSteps;
    authorityLongestContinuityRunSteps = longestSinglePrimaryLeadRunSteps;
    authorityLongestInstrumentRunSteps = longestSinglePrimaryLeadRunSteps;
  }
  const authorityActiveShare = authorityStepsAnalyzed > 0 ? (authorityActiveSteps / authorityStepsAnalyzed) : 0;
  const authoritySwitches = authorityGroupSwitches + authorityContinuitySwitches + authorityInstrumentSwitches;
  const authorityStable = authorityStepsAnalyzed > 0
    && authorityActiveShare >= 0.8
    && authoritySwitches === 0
    && authorityLongestGroupRunSteps >= 64
    && authorityLongestContinuityRunSteps >= 64
    && authorityLongestInstrumentRunSteps >= 64;
  const primaryLeadStatus = compactLeadExclusive || authorityStable
    ? 'exclusive'
    : (stepsWithSinglePrimaryLead > 0 || authorityActiveSteps > 0 ? 'contested' : 'missing');
  const primaryLeadPersistenceStatus = authorityStable || longestSinglePrimaryLeadRunSteps >= 64
    ? 'stable'
    : (longestSinglePrimaryLeadRunSteps >= 32 || authorityLongestGroupRunSteps >= 32 ? 'short' : 'fragmented');
  return {
    stepsAnalyzed,
    primaryLead: {
      uniqueLeadGroupCount: primaryLeadIds.size,
      stepsWithSingleLead: stepsWithSinglePrimaryLead,
      stepsWithNoLead: stepsWithNoPrimaryLead,
      stepsWithMultipleLeads: stepsWithMultiplePrimaryLeads,
      singleLeadShare: Number(singleLeadShare.toFixed(3)),
      noLeadShare: Number(noLeadShare.toFixed(3)),
      multiLeadShare: Number(multiLeadShare.toFixed(3)),
      avgLeadCount: Number(avgPrimaryLeadCount.toFixed(3)),
      maxLeadCount: maxPrimaryLeadCount,
      longestSingleLeadRunSteps: longestSinglePrimaryLeadRunSteps,
      longestSingleLeadRunBeats: Number((longestSinglePrimaryLeadRunSteps / 8).toFixed(3)),
      status: primaryLeadStatus,
      persistenceStatus: primaryLeadPersistenceStatus,
      authority: {
        stepsAnalyzed: authorityStepsAnalyzed,
        activeShare: Number(authorityActiveShare.toFixed(3)),
        groupSwitches: authorityGroupSwitches,
        continuitySwitches: authorityContinuitySwitches,
        instrumentSwitches: authorityInstrumentSwitches,
        longestGroupRunSteps: authorityLongestGroupRunSteps,
        longestGroupRunBeats: Number((authorityLongestGroupRunSteps / 8).toFixed(3)),
        longestContinuityRunSteps: authorityLongestContinuityRunSteps,
        longestContinuityRunBeats: Number((authorityLongestContinuityRunSteps / 8).toFixed(3)),
        longestInstrumentRunSteps: authorityLongestInstrumentRunSteps,
        longestInstrumentRunBeats: Number((authorityLongestInstrumentRunSteps / 8).toFixed(3)),
        status: authorityStable
          ? 'stable'
          : (authorityActiveSteps > 0 ? 'drift' : 'missing'),
      },
    },
    foundationBuffer: {
      avgCount: Number(avgFoundationBufferCount.toFixed(3)),
      maxCount: maxFoundationBufferCount,
      stepsWithMultipleBuffers: stepsWithMultipleFoundationBuffers,
      status: maxFoundationBufferCount <= 1 ? 'bounded' : 'runaway',
    },
    answerOrnament: {
      avgCount: Number(avgAnswerOrnamentCount.toFixed(3)),
      maxCount: maxAnswerOrnamentCount,
      stepsWithMultipleOrnaments: stepsWithMultipleAnswerOrnaments,
      leadRoleEvents: answerOrnamentLeadRoleEvents,
      status: (maxAnswerOrnamentCount <= 1 && stepsWithMultipleAnswerOrnaments === 0 && answerOrnamentLeadRoleEvents === 0)
        ? 'contained'
        : 'competing',
    },
    population: {
      avgActiveGroupCount: Number(avgActiveComposerGroupCount.toFixed(3)),
      maxActiveGroupCount: maxActiveComposerGroupCount,
      status: (maxActiveComposerGroupCount <= 6 && avgActiveComposerGroupCount <= 5) ? 'sane' : 'crowded',
    },
  };
}

function collectPrimaryLeadInstrumentChangeTrace(session, maxBarIndex) {
  const systemEvents = (Array.isArray(session?.systemEvents) ? session.systemEvents : [])
    .filter((e) => clampInt(e?.barIndex, 0, 0) <= maxBarIndex);
  const modeLogs = systemEvents
    .filter((e) => String(e?.eventType || '').trim().toLowerCase() === 'music_mode_state')
    .sort((a, b) => {
      const barDelta = clampInt(a?.barIndex, 0, 0) - clampInt(b?.barIndex, 0, 0);
      if (barDelta !== 0) return barDelta;
      const beatDelta = clampInt(a?.beatIndex, 0, 0) - clampInt(b?.beatIndex, 0, 0);
      if (beatDelta !== 0) return beatDelta;
      return clampInt(a?.stepIndex, 0, 0) - clampInt(b?.stepIndex, 0, 0);
    });
  const findNearestContextEvent = (eventType, beatIndex, canonicalGroupId) => {
    let best = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const ev of systemEvents) {
      if (String(ev?.eventType || '').trim().toLowerCase() !== eventType) continue;
      const evBeatIndex = clampInt(ev?.beatIndex, 0, 0);
      if (evBeatIndex > beatIndex) continue;
      if (canonicalGroupId > 0) {
        const evGroupId = Math.max(0, clampInt(ev?.groupId ?? ev?.canonicalLeadGroupId, 0, 0));
        if (evGroupId > 0 && evGroupId !== canonicalGroupId) continue;
      }
      const distance = beatIndex - evBeatIndex;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = ev;
      }
    }
    return best;
  };
  const trace = [];
  const bySource = {};
  const byPhase = {};
  const byMode = {};
  let lastInstrumentId = '';
  for (const log of modeLogs) {
    const instrumentId = String(log?.canonicalLeadInstrumentId || '').trim();
    if (!instrumentId) continue;
    if (!lastInstrumentId) {
      lastInstrumentId = instrumentId;
      continue;
    }
    if (instrumentId === lastInstrumentId) continue;
    const beatIndex = clampInt(log?.beatIndex, 0, 0);
    const canonicalGroupId = Math.max(0, clampInt(log?.canonicalLeadGroupId, 0, 0));
    const activeLevelPhase = String(log?.activeLevelPhase || '').trim().toLowerCase();
    const activeMusicMode = String(log?.activeMusicMode || '').trim().toLowerCase();
    const nearestLeadSnapshot = findNearestContextEvent('music_primary_lead_snapshot', beatIndex, canonicalGroupId);
    const nearestGroupState = findNearestContextEvent('music_composer_group_state', beatIndex, canonicalGroupId);
    const source = nearestGroupState
      ? String(nearestGroupState?.phase || nearestGroupState?.reason || '').trim().toLowerCase()
      : (nearestLeadSnapshot ? 'primary_lead_snapshot_context' : 'mode_state_only');
    bySource[source] = clampInt(bySource[source], 0, 0) + 1;
    byPhase[activeLevelPhase || 'unknown'] = clampInt(byPhase[activeLevelPhase || 'unknown'], 0, 0) + 1;
    byMode[activeMusicMode || 'unknown'] = clampInt(byMode[activeMusicMode || 'unknown'], 0, 0) + 1;
    trace.push({
      barIndex: clampInt(log?.barIndex, 0, 0),
      beatIndex,
      stepIndex: clampInt(log?.stepIndex, 0, 0),
      previousInstrumentId: lastInstrumentId,
      instrumentId,
      canonicalLeadGroupId: canonicalGroupId,
      canonicalLeadContinuityId: String(log?.canonicalLeadContinuityId || '').trim(),
      activeLevelPhase,
      activeMusicMode,
      source,
      nearestLeadSnapshot: nearestLeadSnapshot
        ? {
          beatIndex: clampInt(nearestLeadSnapshot?.beatIndex, 0, 0),
          groupId: Math.max(0, clampInt(nearestLeadSnapshot?.groupId, 0, 0)),
          instrumentId: String(nearestLeadSnapshot?.instrumentId || '').trim(),
          musicProfileSourceType: String(nearestLeadSnapshot?.musicProfileSourceType || nearestLeadSnapshot?.stage || '').trim().toLowerCase(),
        }
        : null,
      nearestGroupState: nearestGroupState
        ? {
          beatIndex: clampInt(nearestGroupState?.beatIndex, 0, 0),
          groupId: Math.max(0, clampInt(nearestGroupState?.groupId, 0, 0)),
          phase: String(nearestGroupState?.phase || '').trim().toLowerCase(),
          reason: String(nearestGroupState?.reason || '').trim().toLowerCase(),
          stage: String(nearestGroupState?.stage || '').trim().toLowerCase(),
        }
        : null,
    });
    lastInstrumentId = instrumentId;
  }
  return {
    count: trace.length,
    bySource,
    byPhase,
    byMode,
    trace: trace.slice(0, 24),
  };
}

function collectLevel1ContractTrace(session, maxBarIndex) {
  const events = (Array.isArray(session?.systemEvents) ? session.systemEvents : [])
    .filter((e) => (
      String(e?.eventType || '').trim().toLowerCase() === 'music_level1_contract_state'
      && clampInt(e?.barIndex, 0, 0) <= maxBarIndex
    ))
    .sort((a, b) => {
      const barDelta = clampInt(a?.barIndex, 0, 0) - clampInt(b?.barIndex, 0, 0);
      if (barDelta !== 0) return barDelta;
      return clampInt(a?.beatIndex, 0, 0) - clampInt(b?.beatIndex, 0, 0);
    });
  const inc = (bucket, keyLike) => {
    const key = String(keyLike || 'unknown').trim().toLowerCase() || 'unknown';
    bucket[key] = Math.max(0, clampInt(bucket[key], 0, 0)) + 1;
  };
  const bySupportBudget = {};
  const byPreferredSupportSteps = {};
  const byCounterRhythmFamily = {};
  const byAnswerPolicy = {};
  const byAllowedRoleSet = {};
  const byEpoch = {};
  const byIntensityAuditionSection = {};
  const byIntensityAuditionLaneSet = {};
  const intensityAuditionLanePresence = {};
  const parseAllowedRoles = (ev) => String(ev?.allowedRolesCsv || '').trim().toLowerCase()
    .split(',')
    .map((role) => String(role || '').trim().toLowerCase())
    .filter(Boolean)
    .sort();
  let fullTextureCount = 0;
  let answerActiveCount = 0;
  let sparkleActiveCount = 0;
  let supportActiveCount = 0;
  for (const ev of events) {
    const phase = String(ev?.activeLevelPhase || '').trim().toLowerCase();
    const allowedRoles = parseAllowedRoles(ev);
    if (phase === 'full_texture') fullTextureCount += 1;
    if (ev?.contractAnswerActive === true) answerActiveCount += 1;
    if (ev?.contractSparkleActive === true) sparkleActiveCount += 1;
    if (ev?.contractSupportActive === true) supportActiveCount += 1;
    const auditionSection = String(ev?.intensityAuditionSection || '').trim().toLowerCase();
    if (auditionSection) {
      inc(byIntensityAuditionSection, auditionSection);
      const activeLanes = [];
      if (ev?.contractFoundationActive === true) activeLanes.push('foundation');
      if (ev?.contractSecondaryLoopActive === true) activeLanes.push('secondary_loop');
      if (ev?.contractPrimaryLoopActive === true) activeLanes.push('primary_loop');
      if (ev?.contractSupportActive === true) activeLanes.push('support');
      if (ev?.contractSparkleActive === true) activeLanes.push('sparkle');
      if (ev?.contractAnswerActive === true) activeLanes.push('answer');
      inc(byIntensityAuditionLaneSet, `${auditionSection}:${activeLanes.join('|') || 'none'}`);
      if (!intensityAuditionLanePresence[auditionSection]) {
        intensityAuditionLanePresence[auditionSection] = {
          count: 0,
          foundation: 0,
          secondary_loop: 0,
          primary_loop: 0,
          support: 0,
          sparkle: 0,
          answer: 0,
          maxActiveLaneCount: 0,
        };
      }
      const presence = intensityAuditionLanePresence[auditionSection];
      presence.count += 1;
      presence.maxActiveLaneCount = Math.max(presence.maxActiveLaneCount, activeLanes.length);
      for (const laneId of activeLanes) {
        presence[laneId] = Math.max(0, clampInt(presence[laneId], 0, 0)) + 1;
      }
    }
    inc(bySupportBudget, ev?.supportPatternBudget);
    inc(byPreferredSupportSteps, ev?.preferredSupportStepIndicesCsv);
    inc(byCounterRhythmFamily, ev?.preferredCounterRhythmFamily);
    inc(byAnswerPolicy, ev?.answerPolicy);
    inc(byAllowedRoleSet, allowedRoles.join('|') || 'none');
    inc(byEpoch, ev?.epochId);
  }
  const count = events.length;
  return {
    count,
    fullTextureCount,
    answerActiveShare: count > 0 ? answerActiveCount / count : 0,
    sparkleActiveShare: count > 0 ? sparkleActiveCount / count : 0,
    supportActiveShare: count > 0 ? supportActiveCount / count : 0,
    bySupportBudget,
    byPreferredSupportSteps,
    byCounterRhythmFamily,
    byAnswerPolicy,
    byAllowedRoleSet,
    byEpoch,
    byIntensityAuditionSection,
    byIntensityAuditionLaneSet,
    intensityAuditionLanePresence,
    sample: events.slice(0, 24).map((ev) => ({
      barIndex: clampInt(ev?.barIndex, 0, 0),
      beatIndex: clampInt(ev?.beatIndex, 0, 0),
      activeLevelPhase: String(ev?.activeLevelPhase || '').trim().toLowerCase(),
      activeMusicMode: String(ev?.activeMusicMode || '').trim().toLowerCase(),
      phaseVariant: String(ev?.phaseVariant || '').trim().toLowerCase(),
      epochId: String(ev?.epochId || '').trim(),
      allowedRoles: parseAllowedRoles(ev),
      supportPolicy: {
        supportPatternBudget: String(ev?.supportPatternBudget || '').trim().toLowerCase(),
        preferredSupportStepIndicesCsv: String(ev?.preferredSupportStepIndicesCsv || '').trim().toLowerCase(),
        supportPunctuationEpoch: clampInt(ev?.supportPunctuationEpoch, 0, 0),
        preferredCounterRhythmFamily: String(ev?.preferredCounterRhythmFamily || '').trim().toLowerCase(),
        answerPolicy: String(ev?.answerPolicy || '').trim().toLowerCase(),
        allowSparkle: ev?.allowSparkle === true,
      },
      lanes: {
        foundation: ev?.contractFoundationActive === true,
        secondary_loop: ev?.contractSecondaryLoopActive === true,
        primary_loop: ev?.contractPrimaryLoopActive === true,
        sparkle: ev?.contractSparkleActive === true,
        support: ev?.contractSupportActive === true,
        answer: ev?.contractAnswerActive === true,
      },
      intensityAuditionSection: String(ev?.intensityAuditionSection || '').trim().toLowerCase(),
      laneIntensityScale: Number(ev?.laneIntensityScale) || 0,
    })),
  };
}

function collectLevel1ArrangementTrace(session, maxBarIndex) {
  const events = (Array.isArray(session?.systemEvents) ? session.systemEvents : [])
    .filter((e) => (
      String(e?.eventType || '').trim().toLowerCase() === 'music_level1_arrangement_state'
      && clampInt(e?.barIndex, 0, 0) <= maxBarIndex
    ))
    .sort((a, b) => {
      const barDelta = clampInt(a?.barIndex, 0, 0) - clampInt(b?.barIndex, 0, 0);
      if (barDelta !== 0) return barDelta;
      return clampInt(a?.beatIndex, 0, 0) - clampInt(b?.beatIndex, 0, 0);
    });
  const inc = (bucket, keyLike) => {
    const key = String(keyLike || 'unknown').trim().toLowerCase() || 'unknown';
    bucket[key] = Math.max(0, clampInt(bucket[key], 0, 0)) + 1;
  };
  const numericFields = [
    'arrangementEnergy',
    'arrangementLayering',
    'arrangementRhythmicComplexity',
    'arrangementMelodicActivity',
    'arrangementOrnamentation',
    'arrangementStability',
  ];
  const stats = {};
  for (const field of numericFields) {
    stats[field] = {
      min: Number.POSITIVE_INFINITY,
      max: Number.NEGATIVE_INFINITY,
      total: 0,
      count: 0,
    };
  }
  const byPhraseIntent = {};
  const byPhase = {};
  const byMode = {};
  const bySectionIntent = {};
  const byTensionProfile = {};
  const bySupportBudget = {};
  const byIntensityAuditionSection = {};
  const introSetPiecePhases = new Set(['intro_teach', 'groove_establish']);
  let introSetPieceCount = 0;
  let introSetPieceViolationCount = 0;
  let postIntroArrangementCount = 0;
  const postIntroByPhraseIntent = {};
  for (const ev of events) {
    const phraseIntent = String(ev?.phraseIntent || '').trim().toLowerCase() || 'unknown';
    const activeLevelPhase = String(ev?.activeLevelPhase || '').trim().toLowerCase();
    if (introSetPiecePhases.has(activeLevelPhase)) {
      introSetPieceCount += 1;
      if (phraseIntent !== 'intro') introSetPieceViolationCount += 1;
    } else {
      postIntroArrangementCount += 1;
      inc(postIntroByPhraseIntent, phraseIntent);
    }
    inc(byPhraseIntent, ev?.phraseIntent);
    inc(byPhase, ev?.activeLevelPhase);
    inc(byMode, ev?.activeMusicMode);
    inc(bySectionIntent, ev?.arrangementSectionIntent);
    inc(byTensionProfile, ev?.arrangementTensionProfile);
    inc(bySupportBudget, ev?.arrangementSupportPatternBudget);
    inc(byIntensityAuditionSection, ev?.intensityAuditionSection);
    for (const field of numericFields) {
      const value = Number(ev?.[field]) || 0;
      stats[field].min = Math.min(stats[field].min, value);
      stats[field].max = Math.max(stats[field].max, value);
      stats[field].total += value;
      stats[field].count += 1;
    }
  }
  const summarize = (field) => {
    const s = stats[field];
    if (!s || s.count <= 0) return { min: 0, max: 0, avg: 0 };
    return {
      min: Number(s.min.toFixed(4)),
      max: Number(s.max.toFixed(4)),
      avg: Number((s.total / s.count).toFixed(4)),
    };
  };
  return {
    count: events.length,
    byPhraseIntent,
    byPhase,
    byMode,
    bySectionIntent,
    byTensionProfile,
    bySupportBudget,
    byIntensityAuditionSection,
    introSetPieceCount,
    introSetPieceViolationCount,
    postIntroArrangementCount,
    postIntroByPhraseIntent,
    energy: summarize('arrangementEnergy'),
    layering: summarize('arrangementLayering'),
    rhythmicComplexity: summarize('arrangementRhythmicComplexity'),
    melodicActivity: summarize('arrangementMelodicActivity'),
    ornamentation: summarize('arrangementOrnamentation'),
    stability: summarize('arrangementStability'),
    sample: events.slice(0, 24).map((ev) => ({
      barIndex: clampInt(ev?.barIndex, 0, 0),
      beatIndex: clampInt(ev?.beatIndex, 0, 0),
      activeLevelPhase: String(ev?.activeLevelPhase || '').trim().toLowerCase(),
      activeMusicMode: String(ev?.activeMusicMode || '').trim().toLowerCase(),
      phraseIntent: String(ev?.phraseIntent || '').trim().toLowerCase(),
      sectionIntent: String(ev?.arrangementSectionIntent || '').trim().toLowerCase(),
      tensionProfile: String(ev?.arrangementTensionProfile || '').trim().toLowerCase(),
      supportPatternBudget: String(ev?.arrangementSupportPatternBudget || '').trim().toLowerCase(),
      energy: Number(ev?.arrangementEnergy) || 0,
      layering: Number(ev?.arrangementLayering) || 0,
      rhythmicComplexity: Number(ev?.arrangementRhythmicComplexity) || 0,
      melodicActivity: Number(ev?.arrangementMelodicActivity) || 0,
      ornamentation: Number(ev?.arrangementOrnamentation) || 0,
      stability: Number(ev?.arrangementStability) || 0,
      intensityAuditionSection: String(ev?.intensityAuditionSection || '').trim().toLowerCase(),
      intensityAuditionBar: clampInt(ev?.intensityAuditionBar, -1, -1),
      laneIntensityScale: Number(ev?.arrangementLaneIntensityScale) || 0,
    })),
  };
}

function collectLevel1ContractComplianceTrace(session, events, maxBarIndex) {
  const contractEvents = (Array.isArray(session?.systemEvents) ? session.systemEvents : [])
    .filter((e) => (
      String(e?.eventType || '').trim().toLowerCase() === 'music_level1_contract_state'
      && clampInt(e?.barIndex, 0, 0) <= maxBarIndex
    ))
    .sort((a, b) => {
      const barDelta = clampInt(a?.barIndex, 0, 0) - clampInt(b?.barIndex, 0, 0);
      if (barDelta !== 0) return barDelta;
      return clampInt(a?.beatIndex, 0, 0) - clampInt(b?.beatIndex, 0, 0);
    });
  const parseAllowedRoles = (ev) => new Set(
    String(ev?.allowedRolesCsv || '').trim().toLowerCase()
      .split(',')
      .map((role) => String(role || '').trim().toLowerCase())
      .filter(Boolean)
  );
  const contractByBar = new Map();
  for (const ev of contractEvents) {
    contractByBar.set(clampInt(ev?.barIndex, 0, 0), ev);
  }
  const getContractForBar = (() => {
    let index = 0;
    let current = null;
    return (barIndex) => {
      const safeBar = clampInt(barIndex, 0, 0);
      while (
        index < contractEvents.length
        && clampInt(contractEvents[index]?.barIndex, 0, 0) <= safeBar
      ) {
        current = contractEvents[index];
        index += 1;
      }
      return current;
    };
  })();
  const consideredEvents = [];
  let musicalEventCount = 0;
  let roleViolationCount = 0;
  let sparkleViolationCount = 0;
  let answerViolationCount = 0;
  const byRole = {};
  const byLane = {};
  const byReason = {};
  const inc = (bucket, keyLike) => {
    const key = String(keyLike || 'unknown').trim().toLowerCase() || 'unknown';
    bucket[key] = Math.max(0, clampInt(bucket[key], 0, 0)) + 1;
  };
  const addViolation = (ev, roleId, contract, reason) => {
    const sample = {
      barIndex: clampInt(ev?.barIndex, 0, 0),
      beatIndex: clampInt(ev?.beatIndex, 0, 0),
      stepIndex: clampInt(ev?.stepIndex, 0, 0),
      roleId,
      musicLaneId: String(ev?.musicLaneId || '').trim().toLowerCase(),
      musicLayer: String(ev?.musicLayer || '').trim().toLowerCase(),
      musicVoiceKey: String(ev?.musicVoiceKey || '').trim().toLowerCase(),
      callResponseLane: String(ev?.callResponseLane || '').trim().toLowerCase(),
      actionType: String(ev?.actionType || '').trim().toLowerCase(),
      sourceSystem: String(ev?.sourceSystem || '').trim().toLowerCase(),
      allowedRoles: Array.from(parseAllowedRoles(contract)).sort(),
      activeLevelPhase: String(contract?.activeLevelPhase || '').trim().toLowerCase(),
      phaseVariant: String(contract?.phaseVariant || '').trim().toLowerCase(),
      answerPolicy: String(contract?.answerPolicy || '').trim().toLowerCase(),
      allowSparkle: contract?.allowSparkle === true,
      reason,
    };
    if (consideredEvents.length < 24) consideredEvents.push(sample);
    inc(byRole, roleId || 'unknown');
    inc(byLane, sample.musicLaneId || 'unknown');
    inc(byReason, reason || 'unknown');
  };
  const eventList = Array.isArray(events) ? events : [];
  for (const ev of eventList) {
    const barIndex = clampInt(ev?.barIndex, 0, 0);
    if (barIndex > maxBarIndex) continue;
    const phase = String(ev?.phase || '').trim().toLowerCase();
    if (phase && phase !== 'executed') continue;
    const sourceSystem = String(ev?.sourceSystem || '').trim().toLowerCase();
    if (sourceSystem === 'player') continue;
    const musicLaneId = String(ev?.musicLaneId || '').trim().toLowerCase();
    const musicLayer = String(ev?.musicLayer || '').trim().toLowerCase();
    const musicVoiceKey = String(ev?.musicVoiceKey || '').trim().toLowerCase();
    const callResponseLane = String(ev?.callResponseLane || '').trim().toLowerCase();
    const enemyAudible = ev?.enemyAudible === true;
    const audioGain = Math.max(0, Number(ev?.audioGain) || Number(ev?.approxPlaybackVolume) || 0);
    const musical = !!musicLaneId || !!musicLayer || !!musicVoiceKey || enemyAudible || audioGain > 0;
    if (!musical) continue;
    const contract = getContractForBar(barIndex);
    if (!contract) continue;
    const roleId = inferForegroundRoleId(ev);
    if (!roleId || roleId === 'unknown') continue;
    musicalEventCount += 1;
    const allowedRoles = parseAllowedRoles(contract);
    const nextBarContract = contractByBar.get(barIndex + 1) || null;
    const allowedNextBar = nextBarContract ? parseAllowedRoles(nextBarContract).has(roleId) : false;
    const isTransitionLeadGrace = roleId === 'lead_phrase'
      && allowedNextBar
      && String(contract?.activeLevelPhase || '').trim().toLowerCase() === 'groove_establish'
      && String(nextBarContract?.activeLevelPhase || '').trim().toLowerCase() === 'lead_merge';
    const isRoleAllowed = allowedRoles.has(roleId) || isTransitionLeadGrace;
    if (!isRoleAllowed) {
      roleViolationCount += 1;
      addViolation(ev, roleId, contract, 'role_not_allowed');
    }
    const sparkleUsed = musicLaneId === 'sparkle_lane' || musicLayer === 'sparkle';
    if (sparkleUsed && contract?.allowSparkle !== true) {
      sparkleViolationCount += 1;
      addViolation(ev, roleId, contract, 'sparkle_disabled');
    }
    const answerUsed = roleId === 'answer_ornament'
      || musicVoiceKey === 'answer_ornament'
      || musicLaneId === 'answer_lane';
    if (answerUsed && contract?.contractAnswerActive !== true) {
      answerViolationCount += 1;
      addViolation(ev, roleId, contract, 'answer_disabled');
    }
  }
  const violationCount = roleViolationCount + sparkleViolationCount + answerViolationCount;
  return {
    musicalEventCount,
    violationCount,
    roleViolationCount,
    sparkleViolationCount,
    answerViolationCount,
    violationRate: musicalEventCount > 0 ? violationCount / musicalEventCount : 0,
    passed: violationCount === 0,
    byRole,
    byLane,
    byReason,
    sample: consideredEvents,
  };
}

function collectVisualRoleReadabilityTrace(session, maxBarIndex) {
  const allSystemEvents = Array.isArray(session?.systemEvents) ? session.systemEvents : [];
  const events = (Array.isArray(session?.systemEvents) ? session.systemEvents : [])
    .filter((e) => (
      String(e?.eventType || '').trim().toLowerCase() === 'music_visual_role_readability_state'
      && clampInt(e?.barIndex, 0, 0) <= maxBarIndex
    ))
    .sort((a, b) => {
      const barDelta = clampInt(a?.barIndex, 0, 0) - clampInt(b?.barIndex, 0, 0);
      if (barDelta !== 0) return barDelta;
      return clampInt(a?.beatIndex, 0, 0) - clampInt(b?.beatIndex, 0, 0);
    });
  const hpSectionEvents = allSystemEvents
    .filter((e) => (
      String(e?.eventType || '').trim().toLowerCase() === 'music_enemy_health_test_section'
      && clampInt(e?.barIndex, 0, 0) <= maxBarIndex
    ))
    .sort((a, b) => clampInt(a?.barIndex, 0, 0) - clampInt(b?.barIndex, 0, 0));
  const inc = (bucket, keyLike) => {
    const key = String(keyLike || 'unknown').trim().toLowerCase() || 'unknown';
    bucket[key] = Math.max(0, clampInt(bucket[key], 0, 0)) + 1;
  };
  const makeSectionBucket = (sectionEvent = null) => ({
    sectionId: String(sectionEvent?.sectionId || sectionEvent?.hpSectionId || 'default').trim().toLowerCase() || 'default',
    sectionLabel: String(sectionEvent?.sectionLabel || sectionEvent?.hpSectionLabel || 'default').trim() || 'default',
    hpMultiplier: Number(sectionEvent?.hpMultiplier) || 1,
    startBar: Math.max(0, clampInt(sectionEvent?.startBar ?? sectionEvent?.hpSectionStartBar, clampInt(sectionEvent?.barIndex, 0, 0), 0)),
    endBar: Number.isFinite(Number(sectionEvent?.endBar ?? sectionEvent?.hpSectionEndBar)) ? Math.max(0, clampInt(sectionEvent?.endBar ?? sectionEvent?.hpSectionEndBar, 0, 0)) : null,
    count: 0,
    fullTextureCount: 0,
    threeRoleCount: 0,
    fullTextureThreeRoleCount: 0,
    supportCollapsedDuringLeadCount: 0,
    leadWithSupportVisibleCount: 0,
    fullTextureLeadWithSupportVisibleCount: 0,
    distinctRoleTotal: 0,
    foundationWeightTotal: 0,
    supportWeightTotal: 0,
    leadWeightTotal: 0,
    ornamentWeightTotal: 0,
  });
  const sectionBuckets = {};
  const findHpSectionEventForBar = (barIndex) => {
    let current = null;
    for (const ev of hpSectionEvents) {
      const startBar = Math.max(0, clampInt(ev?.startBar, clampInt(ev?.barIndex, 0, 0), 0));
      if (startBar > barIndex) break;
      const endBar = Number.isFinite(Number(ev?.endBar)) ? Math.max(startBar, clampInt(ev?.endBar, startBar, 0)) : Number.POSITIVE_INFINITY;
      if (barIndex >= startBar && barIndex < endBar) current = ev;
    }
    return current;
  };
  const addSectionSample = (sectionEvent, ev, fullTexture, distinctCount) => {
    if (!sectionEvent) return;
    const sectionId = String(sectionEvent?.sectionId || sectionEvent?.hpSectionId || sectionEvent?.sectionLabel || sectionEvent?.hpSectionLabel || 'default').trim().toLowerCase() || 'default';
    const bucket = sectionBuckets[sectionId] || (sectionBuckets[sectionId] = makeSectionBucket(sectionEvent));
    bucket.count += 1;
    if (fullTexture) bucket.fullTextureCount += 1;
    bucket.distinctRoleTotal += distinctCount;
    bucket.foundationWeightTotal += Math.max(0, Number(ev?.foundationVisualWeight) || 0);
    bucket.supportWeightTotal += Math.max(0, Number(ev?.supportVisualWeight) || 0);
    bucket.leadWeightTotal += Math.max(0, Number(ev?.leadVisualWeight) || 0);
    bucket.ornamentWeightTotal += Math.max(0, Number(ev?.ornamentVisualWeight) || 0);
    if (ev?.threeRoleReadable === true || distinctCount >= 3) {
      bucket.threeRoleCount += 1;
      if (fullTexture) bucket.fullTextureThreeRoleCount += 1;
    }
    if (ev?.supportCollapsedDuringLead === true) bucket.supportCollapsedDuringLeadCount += 1;
    if (ev?.leadWithSupportVisible === true) {
      bucket.leadWithSupportVisibleCount += 1;
      if (fullTexture) bucket.fullTextureLeadWithSupportVisibleCount += 1;
    }
  };
  const count = events.length;
  const byReadableRoleSet = {};
  const readableRoleCounts = {
    foundation_groove: 0,
    counter_rhythm: 0,
    lead_phrase: 0,
    answer_ornament: 0,
  };
  let fullTextureCount = 0;
  let threeRoleCount = 0;
  let fullTextureThreeRoleCount = 0;
  let supportCollapsedDuringLeadCount = 0;
  let leadWithSupportVisibleCount = 0;
  let fullTextureLeadWithSupportVisibleCount = 0;
  let formationThreeRoleCount = 0;
  let formationFullTextureThreeRoleCount = 0;
  let formationSupportCollapsedDuringLeadCount = 0;
  let formationLeadWithSupportVisibleCount = 0;
  let formationFullTextureLeadWithSupportVisibleCount = 0;
  let formationDistinctRoleTotal = 0;
  let formationFoundationWeightTotal = 0;
  let formationSupportWeightTotal = 0;
  let formationLeadWeightTotal = 0;
  let formationOrnamentWeightTotal = 0;
  const byFormationReadableRoleSet = {};
  const byFormationArchetypeRole = {};
  let distinctRoleTotal = 0;
  let foundationWeightTotal = 0;
  let supportWeightTotal = 0;
  let leadWeightTotal = 0;
  let ornamentWeightTotal = 0;
  for (const ev of events) {
    const activeMusicMode = String(ev?.activeMusicMode || '').trim().toLowerCase();
    const fullTexture = activeMusicMode === 'full_texture';
    const readableRoles = Array.isArray(ev?.readableRoles)
      ? ev.readableRoles.map((role) => String(role || '').trim().toLowerCase()).filter(Boolean).sort()
      : [];
    const formationReadableRoles = Array.isArray(ev?.formationReadableRoles)
      ? ev.formationReadableRoles.map((role) => String(role || '').trim().toLowerCase()).filter(Boolean).sort()
      : [];
    if (fullTexture) fullTextureCount += 1;
    for (const role of readableRoles) {
      if (Object.prototype.hasOwnProperty.call(readableRoleCounts, role)) {
        readableRoleCounts[role] += 1;
      }
    }
    inc(byReadableRoleSet, readableRoles.join('|') || 'none');
    inc(byFormationReadableRoleSet, formationReadableRoles.join('|') || 'none');
    const archetypeTokens = String(ev?.formationArchetypesCsv || '').split(',').map((part) => part.trim()).filter(Boolean);
    for (const token of archetypeTokens) inc(byFormationArchetypeRole, token);
    const distinctCount = Math.max(0, clampInt(ev?.distinctReadableRoleCount, readableRoles.length, 0));
    const formationDistinctCount = Math.max(0, clampInt(ev?.formationReadableRoleCount, formationReadableRoles.length, 0));
    const directHpSection = String(ev?.hpSectionId || '').trim()
      ? {
          sectionId: String(ev.hpSectionId || '').trim().toLowerCase(),
          sectionLabel: String(ev?.hpSectionLabel || ev.hpSectionId || '').trim(),
          hpMultiplier: Number(ev?.hpMultiplier) || 1,
          startBar: ev?.hpSectionStartBar,
          endBar: ev?.hpSectionEndBar,
          barIndex: ev?.barIndex,
        }
      : null;
    addSectionSample(directHpSection || findHpSectionEventForBar(clampInt(ev?.barIndex, 0, 0)), ev, fullTexture, distinctCount);
    distinctRoleTotal += distinctCount;
    foundationWeightTotal += Math.max(0, Number(ev?.foundationVisualWeight) || 0);
    supportWeightTotal += Math.max(0, Number(ev?.supportVisualWeight) || 0);
    leadWeightTotal += Math.max(0, Number(ev?.leadVisualWeight) || 0);
    ornamentWeightTotal += Math.max(0, Number(ev?.ornamentVisualWeight) || 0);
    formationDistinctRoleTotal += formationDistinctCount;
    formationFoundationWeightTotal += Math.max(0, Number(ev?.formationFoundationVisualWeight) || 0);
    formationSupportWeightTotal += Math.max(0, Number(ev?.formationSupportVisualWeight) || 0);
    formationLeadWeightTotal += Math.max(0, Number(ev?.formationLeadVisualWeight) || 0);
    formationOrnamentWeightTotal += Math.max(0, Number(ev?.formationOrnamentVisualWeight) || 0);
    if (ev?.threeRoleReadable === true || distinctCount >= 3) {
      threeRoleCount += 1;
      if (fullTexture) fullTextureThreeRoleCount += 1;
    }
    if (ev?.formationThreeRoleReadable === true || formationDistinctCount >= 3) {
      formationThreeRoleCount += 1;
      if (fullTexture) formationFullTextureThreeRoleCount += 1;
    }
    if (ev?.supportCollapsedDuringLead === true) supportCollapsedDuringLeadCount += 1;
    if (ev?.formationSupportCollapsedDuringLead === true) formationSupportCollapsedDuringLeadCount += 1;
    if (ev?.leadWithSupportVisible === true) {
      leadWithSupportVisibleCount += 1;
      if (fullTexture) fullTextureLeadWithSupportVisibleCount += 1;
    }
    if (ev?.formationLeadWithSupportVisible === true) {
      formationLeadWithSupportVisibleCount += 1;
      if (fullTexture) formationFullTextureLeadWithSupportVisibleCount += 1;
    }
  }
  const roleShares = {};
  for (const [role, roleCount] of Object.entries(readableRoleCounts)) {
    roleShares[role] = count > 0 ? roleCount / count : 0;
  }
  const byEnemyHealthSection = {};
  for (const [sectionId, bucket] of Object.entries(sectionBuckets)) {
    const sectionCount = Math.max(0, Number(bucket.count) || 0);
    const sectionFullTextureCount = Math.max(0, Number(bucket.fullTextureCount) || 0);
    byEnemyHealthSection[sectionId] = {
      sectionId,
      sectionLabel: bucket.sectionLabel,
      hpMultiplier: bucket.hpMultiplier,
      startBar: bucket.startBar,
      endBar: bucket.endBar,
      count: sectionCount,
      fullTextureCount: sectionFullTextureCount,
      threeRoleReadableShare: sectionCount > 0 ? bucket.threeRoleCount / sectionCount : 0,
      fullTextureThreeRoleReadableShare: sectionFullTextureCount > 0 ? bucket.fullTextureThreeRoleCount / sectionFullTextureCount : 0,
      supportCollapsedDuringLeadShare: sectionCount > 0 ? bucket.supportCollapsedDuringLeadCount / sectionCount : 0,
      leadWithSupportVisibleShare: sectionCount > 0 ? bucket.leadWithSupportVisibleCount / sectionCount : 0,
      fullTextureLeadWithSupportVisibleShare: sectionFullTextureCount > 0 ? bucket.fullTextureLeadWithSupportVisibleCount / sectionFullTextureCount : 0,
      avgDistinctReadableRoleCount: sectionCount > 0 ? bucket.distinctRoleTotal / sectionCount : 0,
      avgFoundationVisualWeight: sectionCount > 0 ? bucket.foundationWeightTotal / sectionCount : 0,
      avgSupportVisualWeight: sectionCount > 0 ? bucket.supportWeightTotal / sectionCount : 0,
      avgLeadVisualWeight: sectionCount > 0 ? bucket.leadWeightTotal / sectionCount : 0,
      avgOrnamentVisualWeight: sectionCount > 0 ? bucket.ornamentWeightTotal / sectionCount : 0,
    };
  }
  return {
    count,
    fullTextureCount,
    threeRoleReadableShare: count > 0 ? threeRoleCount / count : 0,
    fullTextureThreeRoleReadableShare: fullTextureCount > 0 ? fullTextureThreeRoleCount / fullTextureCount : 0,
    supportCollapsedDuringLeadShare: count > 0 ? supportCollapsedDuringLeadCount / count : 0,
    leadWithSupportVisibleShare: count > 0 ? leadWithSupportVisibleCount / count : 0,
    fullTextureLeadWithSupportVisibleShare: fullTextureCount > 0 ? fullTextureLeadWithSupportVisibleCount / fullTextureCount : 0,
    avgDistinctReadableRoleCount: count > 0 ? distinctRoleTotal / count : 0,
    formationThreeRoleReadableShare: count > 0 ? formationThreeRoleCount / count : 0,
    formationFullTextureThreeRoleReadableShare: fullTextureCount > 0 ? formationFullTextureThreeRoleCount / fullTextureCount : 0,
    formationSupportCollapsedDuringLeadShare: count > 0 ? formationSupportCollapsedDuringLeadCount / count : 0,
    formationLeadWithSupportVisibleShare: count > 0 ? formationLeadWithSupportVisibleCount / count : 0,
    formationFullTextureLeadWithSupportVisibleShare: fullTextureCount > 0 ? formationFullTextureLeadWithSupportVisibleCount / fullTextureCount : 0,
    formationAvgDistinctReadableRoleCount: count > 0 ? formationDistinctRoleTotal / count : 0,
    formationAvgFoundationVisualWeight: count > 0 ? formationFoundationWeightTotal / count : 0,
    formationAvgSupportVisualWeight: count > 0 ? formationSupportWeightTotal / count : 0,
    formationAvgLeadVisualWeight: count > 0 ? formationLeadWeightTotal / count : 0,
    formationAvgOrnamentVisualWeight: count > 0 ? formationOrnamentWeightTotal / count : 0,
    avgFoundationVisualWeight: count > 0 ? foundationWeightTotal / count : 0,
    avgSupportVisualWeight: count > 0 ? supportWeightTotal / count : 0,
    avgLeadVisualWeight: count > 0 ? leadWeightTotal / count : 0,
    avgOrnamentVisualWeight: count > 0 ? ornamentWeightTotal / count : 0,
    readableRoleShares: roleShares,
    byReadableRoleSet,
    byFormationReadableRoleSet,
    byFormationArchetypeRole,
    byEnemyHealthSection,
    sample: events.slice(0, 24).map((ev) => ({
      barIndex: clampInt(ev?.barIndex, 0, 0),
      beatIndex: clampInt(ev?.beatIndex, 0, 0),
      activeMusicMode: String(ev?.activeMusicMode || '').trim().toLowerCase(),
      introStage: String(ev?.introStage || '').trim().toLowerCase(),
      readableRoles: Array.isArray(ev?.readableRoles) ? ev.readableRoles.slice(0, 8) : [],
      distinctReadableRoleCount: clampInt(ev?.distinctReadableRoleCount, 0, 0),
      formationReadableRoles: Array.isArray(ev?.formationReadableRoles) ? ev.formationReadableRoles.slice(0, 8) : [],
      formationReadableRoleCount: clampInt(ev?.formationReadableRoleCount, 0, 0),
      formationArchetypesCsv: String(ev?.formationArchetypesCsv || '').trim().toLowerCase(),
      formationFoundationVisualWeight: Number(ev?.formationFoundationVisualWeight) || 0,
      formationSupportVisualWeight: Number(ev?.formationSupportVisualWeight) || 0,
      formationLeadVisualWeight: Number(ev?.formationLeadVisualWeight) || 0,
      formationOrnamentVisualWeight: Number(ev?.formationOrnamentVisualWeight) || 0,
      formationSupportCollapsedDuringLead: ev?.formationSupportCollapsedDuringLead === true,
      formationLeadWithSupportVisible: ev?.formationLeadWithSupportVisible === true,
      formationThreeRoleReadable: ev?.formationThreeRoleReadable === true,
      foundationVisualWeight: Number(ev?.foundationVisualWeight) || 0,
      supportVisualWeight: Number(ev?.supportVisualWeight) || 0,
      leadVisualWeight: Number(ev?.leadVisualWeight) || 0,
      ornamentVisualWeight: Number(ev?.ornamentVisualWeight) || 0,
      supportCollapsedDuringLead: ev?.supportCollapsedDuringLead === true,
      leadWithSupportVisible: ev?.leadWithSupportVisible === true,
      threeRoleReadable: ev?.threeRoleReadable === true,
    })),
  };
}

function clampUnit(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function collectRetroShmupStyleMetrics(metrics) {
  const getExecutedCount = (record) => Math.max(0, Number(record?.executed) || 0);
  const getOptionalDeliveryRate = (record) => {
    const created = Math.max(0, Number(record?.created) || 0);
    const executed = Math.max(0, Number(record?.executed) || 0);
    if (created <= 0 && executed <= 0) return 1;
    return clampUnit(record?.executedToCreatedRate);
  };
  const musicalLaneDelivery = metrics?.deliveryByMusicLane && typeof metrics.deliveryByMusicLane === 'object'
    ? metrics.deliveryByMusicLane
    : {};
  const primaryLaneExecuted = getExecutedCount(musicalLaneDelivery.primary_loop_lane);
  const musicalLaneExecuted = primaryLaneExecuted
    + getExecutedCount(musicalLaneDelivery.foundation_lane)
    + getExecutedCount(musicalLaneDelivery.secondary_loop_lane)
    + getExecutedCount(musicalLaneDelivery.sparkle_lane)
    + getExecutedCount(musicalLaneDelivery.answer_lane);
  const roleBalanceLeadShare = clampUnit(
    metrics?.roleBalance?.distribution?.lead
    ?? metrics?.roleBalance?.distribution?.lead_phrase
    ?? 0
  );
  const leadShare = musicalLaneExecuted > 0
    ? clampUnit(primaryLaneExecuted / musicalLaneExecuted)
    : roleBalanceLeadShare;
  const strongFoundationRate = clampUnit(
    metrics?.strongBeatDeliveryByMusicLane?.foundation_lane?.executedToCreatedRate
  );
  const mediumRhythmRate = clampUnit(
    metrics?.mediumBeatDeliveryByReason?.rhythm_lane?.executedToCreatedRate
  );
  const leadDeliveryRate = clampUnit(
    metrics?.deliveryByReason?.lead_melody?.executedToCreatedRate
  );
  const answerRate = getOptionalDeliveryRate(metrics?.deliveryByProfileSourceType?.answer_ornament);
  const sparkleRate = getOptionalDeliveryRate(metrics?.deliveryByMusicLane?.sparkle_lane);
  const secondaryBridgeRate = getOptionalDeliveryRate(metrics?.deliveryByReason?.secondary_bridge_backbeat);
  const maskingRate = clampUnit(metrics?.playerMasking?.playerMaskingRate);
  const enemyCompetitionShare = clampUnit(metrics?.readability?.avgEnemyCompetitionShare);
  const avgVoices = clampUnit((Number(metrics?.simultaneousVoiceCount) || 0) / 4);
  const maxVoices = clampUnit((Number(metrics?.maxSimultaneousVoiceCount) || 0) / 6);
  const phraseResolutionRate = clampUnit(metrics?.phraseGravity?.phraseResolutionRate);
  const gravityHitRate = clampUnit(metrics?.phraseGravity?.gravityHitRate);
  const immediateResponseRate = clampUnit(metrics?.callResponse?.immediateResponseRate);
  const bassPersistence = clampUnit(metrics?.grooveStability?.bassPatternPersistence);
  const primaryLeadStatus = String(metrics?.musicalityTargets?.primaryLead?.status || '').trim().toLowerCase();
  const primaryLeadStable = primaryLeadStatus === 'stable' || primaryLeadStatus === 'exclusive';
  const primaryLeadPersistenceStable = String(metrics?.musicalityTargets?.primaryLead?.persistenceStatus || '').trim().toLowerCase() === 'stable';

  const pulseRegularityScore = clampUnit(
    (strongFoundationRate * 0.5)
    + (bassPersistence * 0.3)
    + (mediumRhythmRate * 0.2)
  );
  const leadAuthorityScore = clampUnit(
    (leadDeliveryRate * 0.4)
    + (leadShare * 0.25)
    + ((primaryLeadStable ? 1 : 0) * 0.2)
    + ((primaryLeadPersistenceStable ? 1 : 0) * 0.15)
  );
  const cadenceRegularityScore = clampUnit(
    (phraseResolutionRate * 0.45)
    + (gravityHitRate * 0.35)
    + (immediateResponseRate * 0.2)
  );
  const supportDisciplineScore = clampUnit(
    1 - (
      ((1 - answerRate) * 0.22)
      + ((1 - sparkleRate) * 0.28)
      + ((1 - secondaryBridgeRate) * 0.2)
      + (maskingRate * 0.18)
      + (enemyCompetitionShare * 0.12)
    )
  );
  const arrangementSimplicityScore = clampUnit(
    1 - ((avgVoices * 0.55) + (maxVoices * 0.45))
  );
  const overallScore = clampUnit(
    (pulseRegularityScore * 0.28)
    + (leadAuthorityScore * 0.26)
    + (cadenceRegularityScore * 0.16)
    + (supportDisciplineScore * 0.18)
    + (arrangementSimplicityScore * 0.12)
  );

  return {
    targetProfile: 'retro_shmup_stage1',
    pulseRegularityScore: Number(pulseRegularityScore.toFixed(3)),
    leadAuthorityScore: Number(leadAuthorityScore.toFixed(3)),
    cadenceRegularityScore: Number(cadenceRegularityScore.toFixed(3)),
    supportDisciplineScore: Number(supportDisciplineScore.toFixed(3)),
    arrangementSimplicityScore: Number(arrangementSimplicityScore.toFixed(3)),
    overallScore: Number(overallScore.toFixed(3)),
    styleStatus: overallScore >= 0.72
      ? 'on_target'
      : (overallScore >= 0.56 ? 'approaching' : 'off_target'),
  };
}

function computeMetricsForEvents(session, executedEvents, maxBarIndex) {
  const collectActionCategoryTrace = (eventsLike) => {
    const events = Array.isArray(eventsLike) ? eventsLike : [];
    const byCategory = {};
    const audioRequiredByCategory = {};
    let categorizedCount = 0;
    let audioRequiredCount = 0;
    let audioRequiredSilentCount = 0;
    for (const ev of events) {
      if (!ev || typeof ev !== 'object') continue;
      const category = String(ev?.actionCategory || '').trim().toLowerCase() || 'unknown';
      byCategory[category] = (byCategory[category] || 0) + 1;
      if (category !== 'unknown') categorizedCount += 1;
      if (ev?.audioRequired === true) {
        audioRequiredCount += 1;
        audioRequiredByCategory[category] = (audioRequiredByCategory[category] || 0) + 1;
        if (ev?.enemyAudible === false && ev?.playerAudible !== true) audioRequiredSilentCount += 1;
      }
    }
    return {
      eventCount: events.length,
      categorizedCount,
      byCategory,
      audioRequiredCount,
      audioRequiredSilentCount,
      audioRequiredByCategory,
    };
  };
  const collectIntensityCadenceTrace = (eventsLike, sessionLike = null, maxBar = Number.POSITIVE_INFINITY) => {
    const directEvents = Array.isArray(eventsLike) ? eventsLike : [];
    const systemEvents = (Array.isArray(sessionLike?.systemEvents) ? sessionLike.systemEvents : [])
      .filter((ev) => clampInt(ev?.barIndex, 0, 0) <= maxBar)
      .filter((ev) => String(ev?.eventType || '').trim().toLowerCase() === 'music_intensity_cadence_step_admitted')
      .map((ev) => ({
        intensityCadenceStepAdmitted: true,
        intensityCadenceReason: String(ev?.reason || '').trim().toLowerCase(),
        intensityAuditionSection: String(ev?.intensityAuditionSection || '').trim().toLowerCase(),
      }));
    const events = systemEvents.length ? systemEvents : directEvents;
    const byReason = {};
    const byStage = {};
    let admittedCount = 0;
    for (const ev of events) {
      if (!ev || typeof ev !== 'object' || ev?.intensityCadenceStepAdmitted !== true) continue;
      admittedCount += 1;
      const reason = String(ev?.intensityCadenceReason || '').trim().toLowerCase() || 'unknown';
      const stage = String(ev?.intensityAuditionSection || '').trim().toLowerCase() || 'unknown';
      byReason[reason] = (byReason[reason] || 0) + 1;
      byStage[stage] = (byStage[stage] || 0) + 1;
    }
    return {
      eventCount: events.length,
      systemEventCount: systemEvents.length,
      admittedCount,
      admittedRate: events.length ? (admittedCount / events.length) : 0,
      byReason,
      byStage,
    };
  };
  const collectLeadMotifAnchorTrace = (eventsLike, sessionLike = null, maxBar = Number.POSITIVE_INFINITY) => {
    const events = Array.isArray(eventsLike) ? eventsLike : [];
    const systemEvents = (Array.isArray(sessionLike?.systemEvents) ? sessionLike.systemEvents : [])
      .filter((ev) => clampInt(ev?.barIndex, 0, 0) <= maxBar)
      .filter((ev) => String(ev?.eventType || '').trim().toLowerCase() === 'music_lead_motif_anchor');
    const byRole = {};
    const byStage = {};
    const byStageRole = {};
    const stageTotals = {};
    const stageReturnCounts = {};
    const stageVariationCounts = {};
    const motifIds = new Set();
    let activeEvents = 0;
    let returnEvents = 0;
    let variationEvents = 0;
    let createdEventsCount = 0;
    let maxAgeBars = 0;
    for (const ev of events) {
      if (!ev || typeof ev !== 'object' || ev?.leadMotifAnchorActive !== true) continue;
      activeEvents += 1;
      const role = String(ev?.leadMotifRole || '').trim().toLowerCase() || 'unknown';
      const stage = String(ev?.intensityAuditionSection || '').trim().toLowerCase() || 'unknown';
      const motifId = String(ev?.leadMotifId || '').trim().toLowerCase();
      if (motifId) motifIds.add(motifId);
      byRole[role] = (byRole[role] || 0) + 1;
      byStage[stage] = (byStage[stage] || 0) + 1;
      stageTotals[stage] = (stageTotals[stage] || 0) + 1;
      if (!byStageRole[stage]) byStageRole[stage] = {};
      byStageRole[stage][role] = (byStageRole[stage][role] || 0) + 1;
      if (role.includes('variation')) {
        variationEvents += 1;
        stageVariationCounts[stage] = (stageVariationCounts[stage] || 0) + 1;
      } else if (role.startsWith('hook_')) {
        returnEvents += 1;
        stageReturnCounts[stage] = (stageReturnCounts[stage] || 0) + 1;
      }
      maxAgeBars = Math.max(maxAgeBars, clampInt(ev?.leadMotifAgeBars, 0, 0));
    }
    for (const ev of systemEvents) {
      const role = String(ev?.leadMotifRole || ev?.phase || '').trim().toLowerCase();
      if (role === 'created') createdEventsCount += 1;
    }
    return {
      activeEvents,
      systemEventCount: systemEvents.length,
      createdEvents: createdEventsCount,
      distinctMotifCount: motifIds.size,
      returnEvents,
      variationEvents,
      returnRate: activeEvents ? (returnEvents / activeEvents) : 0,
      variationRate: activeEvents ? (variationEvents / activeEvents) : 0,
      returnRateByStage: Object.fromEntries(Object.entries(stageTotals).map(([stage, total]) => [
        stage,
        total ? ((stageReturnCounts[stage] || 0) / total) : 0,
      ])),
      variationRateByStage: Object.fromEntries(Object.entries(stageTotals).map(([stage, total]) => [
        stage,
        total ? ((stageVariationCounts[stage] || 0) / total) : 0,
      ])),
      maxAgeBars,
      byRole,
      byStage,
      byStageRole,
    };
  };
  const collectBassEngineTrace = (eventsLike, sessionLike = null, maxBar = Number.POSITIVE_INFINITY) => {
    const events = Array.isArray(eventsLike) ? eventsLike : [];
    const arrangementEvents = (Array.isArray(sessionLike?.systemEvents) ? sessionLike.systemEvents : [])
      .filter((ev) => clampInt(ev?.barIndex, 0, 0) <= maxBar)
      .filter((ev) => String(ev?.eventType || '').trim().toLowerCase() === 'music_level1_arrangement_state');
    const stageByBar = new Map();
    const stageBars = {};
    for (const ev of arrangementEvents) {
      const bar = clampInt(ev?.barIndex, 0, 0);
      const stage = String(ev?.intensityAuditionSection || '').trim().toLowerCase() || 'unknown';
      stageByBar.set(bar, stage);
      if (!stageBars[stage]) stageBars[stage] = new Set();
      stageBars[stage].add(bar);
    }
    const getStage = (ev) => {
      const direct = String(ev?.intensityAuditionSection || '').trim().toLowerCase();
      if (direct) return direct;
      return stageByBar.get(clampInt(ev?.barIndex, 0, 0)) || 'unknown';
    };
    const isBassLike = (ev) => {
      const role = String(ev?.role || '').trim().toLowerCase();
      const laneId = String(ev?.musicLaneId || ev?.foundationLaneId || '').trim().toLowerCase();
      const layer = String(ev?.musicLayer || '').trim().toLowerCase();
      return role === 'bass' || laneId === 'foundation_lane' || layer === 'foundation';
    };
    const byStage = {};
    const patternCounts = {};
    const noteCounts = {};
    let eventCount = 0;
    let createdCount = 0;
    let executedCount = 0;
    let lowRegisterViolationCount = 0;
    const lowRegisterViolations = [];
    const sortedBassEvents = events
      .filter((ev) => ev && typeof ev === 'object' && clampInt(ev?.barIndex, 0, 0) <= maxBar && isBassLike(ev))
      .sort((a, b) => {
        const stepDelta = clampInt(a?.stepIndex, 0, 0) - clampInt(b?.stepIndex, 0, 0);
        if (stepDelta !== 0) return stepDelta;
        return String(a?.phase || '').localeCompare(String(b?.phase || ''));
      });
    for (const ev of sortedBassEvents) {
      eventCount += 1;
      const phase = String(ev?.phase || '').trim().toLowerCase();
      if (phase === 'created') createdCount += 1;
      if (phase === 'executed') executedCount += 1;
      const stage = getStage(ev);
      if (!byStage[stage]) {
        byStage[stage] = {
          eventCount: 0,
          createdCount: 0,
          executedCount: 0,
          uniqueStepCount: 0,
          uniqueBarCount: 0,
          eventsPerBar: 0,
          maxStepGap: 0,
          lowRegisterViolationCount: 0,
          notes: {},
          patternKeys: {},
          phraseIds: {},
          _steps: new Set(),
          _bars: new Set(),
          _lastStep: -1,
        };
      }
      const bucket = byStage[stage];
      bucket.eventCount += 1;
      if (phase === 'created') bucket.createdCount += 1;
      if (phase === 'executed') bucket.executedCount += 1;
      const step = clampInt(ev?.stepIndex, 0, 0);
      const bar = clampInt(ev?.barIndex, 0, 0);
      bucket._steps.add(step);
      bucket._bars.add(bar);
      if (bucket._lastStep >= 0) bucket.maxStepGap = Math.max(bucket.maxStepGap, Math.max(0, step - bucket._lastStep));
      bucket._lastStep = step;
      const note = String(ev?.noteResolved || ev?.note || '').trim();
      if (note) {
        noteCounts[note] = (noteCounts[note] || 0) + 1;
        bucket.notes[note] = (bucket.notes[note] || 0) + 1;
        const midi = toMidi(note);
        if (midi != null && midi > toMidi('D3')) {
          lowRegisterViolationCount += 1;
          bucket.lowRegisterViolationCount += 1;
          if (lowRegisterViolations.length < 24) {
            lowRegisterViolations.push({
              phase,
              barIndex: bar,
              stepIndex: step,
              note,
              instrumentId: String(ev?.instrumentId || '').trim(),
              musicLaneId: String(ev?.musicLaneId || '').trim().toLowerCase(),
            });
          }
        }
      }
      const patternKey = String(ev?.foundationPatternKey || '').trim();
      if (patternKey) {
        patternCounts[patternKey] = (patternCounts[patternKey] || 0) + 1;
        bucket.patternKeys[patternKey] = (bucket.patternKeys[patternKey] || 0) + 1;
      }
      const phraseId = String(ev?.foundationPhraseId || '').trim().toLowerCase();
      if (phraseId) bucket.phraseIds[phraseId] = (bucket.phraseIds[phraseId] || 0) + 1;
    }
    for (const [stage, bucket] of Object.entries(byStage)) {
      const stageBarCount = stageBars[stage] ? stageBars[stage].size : bucket._bars.size;
      bucket.uniqueStepCount = bucket._steps.size;
      bucket.uniqueBarCount = bucket._bars.size;
      bucket.eventsPerBar = stageBarCount > 0 ? Number((bucket.eventCount / stageBarCount).toFixed(3)) : 0;
      delete bucket._steps;
      delete bucket._bars;
      delete bucket._lastStep;
    }
    return {
      eventCount,
      createdCount,
      executedCount,
      byStage,
      patternCounts,
      noteCounts,
      distinctPatternCount: Object.keys(patternCounts).length,
      lowRegisterViolationCount,
      lowRegisterViolations,
    };
  };
  const roleBalance = collectRoleBalance(executedEvents);
  const threatBalance = collectThreatBalance(executedEvents);
  const threatBudgetUsage = collectThreatBudgetUsage(session, maxBarIndex);
  const intervalProfile = collectIntervalProfile(executedEvents);
  const melodicContour = collectMelodicContour(intervalProfile);
  const pitchEntropy = collectPitchEntropy(executedEvents);
  const deathDensity = collectDeathDensity(executedEvents);
  const playerMasking = collectPlayerMasking(executedEvents);
  const visibleEnemyAudibility = collectVisibleEnemyAudibility(executedEvents);
  const playerInstrument = collectPlayerInstrumentMetrics(executedEvents);
  const notePoolCompliance = collectNotePoolCompliance(executedEvents);
  const motifReuse = collectMotifReuse(executedEvents);
  const motifPersistence = collectMotifPersistence(motifReuse);
  const phraseGravity = collectPhraseGravity(executedEvents);
  const leadVariation = collectLeadVariationTrace(executedEvents);
  const foundationVariation = collectFoundationVariationTrace(executedEvents);
  const arrangementSupport = collectArrangementSupportTrace(executedEvents);
  const playerWeaponTiming = collectPlayerWeaponTiming(session, maxBarIndex);
  const createdEvents = (Array.isArray(session?.events) ? session.events : [])
    .filter((e) => String(e?.phase || '').trim().toLowerCase() === 'created' && clampInt(e?.barIndex, 0, 0) <= maxBarIndex);
  const phraseArchetypes = collectPhraseArchetypeTrace(createdEvents.length ? createdEvents : executedEvents);
  const callResponseSourceEvents = (() => {
    const taggedByLane = (list, wantedLane) => list.filter((e) => {
      const lane = String(e?.callResponseLane || '').trim().toLowerCase();
      return lane === wantedLane;
    });
    const mergeByEventId = (primary, secondary) => {
      const merged = [];
      const seen = new Set();
      const pushUnique = (ev) => {
        if (!ev || typeof ev !== 'object') return;
        const eventId = clampInt(ev?.eventId, -1, -1);
        const fallbackKey = [
          String(ev?.phase || '').trim().toLowerCase(),
          clampInt(ev?.actorId, 0, 0),
          clampInt(ev?.groupId, 0, 0),
          clampInt(ev?.beatIndex, 0, 0),
          clampInt(ev?.stepIndex, 0, 0),
          String(ev?.actionType || '').trim().toLowerCase(),
          String(ev?.callResponseLane || '').trim().toLowerCase(),
        ].join('|');
        const key = eventId > 0 ? `id:${eventId}` : `fallback:${fallbackKey}`;
        if (seen.has(key)) return;
        seen.add(key);
        merged.push(ev);
      };
      for (const ev of primary) pushUnique(ev);
      for (const ev of secondary) pushUnique(ev);
      return merged;
    };
    const executedCalls = taggedByLane(executedEvents, 'call');
    const executedResponses = taggedByLane(executedEvents, 'response');
    const createdCalls = taggedByLane(createdEvents, 'call');
    const createdResponses = taggedByLane(createdEvents, 'response');
    const chosenCalls = mergeByEventId(executedCalls, createdCalls);
    const chosenResponses = mergeByEventId(executedResponses, createdResponses);
    return [...chosenCalls, ...chosenResponses];
  })();
  const laneCompliance = collectLaneCompliance(createdEvents);
  const callResponse = collectCallResponse(callResponseSourceEvents, {
    responseWindowSteps: 16,
    stepsPerBeat: 8,
  });
  const paletteContinuity = collectPaletteContinuity(session, maxBarIndex);
  const enemyRemovals = collectEnemyRemovalDiagnostics(session, maxBarIndex);
  const spawnerSync = collectSpawnerSync(executedEvents);
  const spawnerPipeline = collectSpawnerPipelineDiagnostics(session, maxBarIndex);
  const foundationProminence = collectFoundationProminenceDiagnostics(session, maxBarIndex);
  const handoff = collectHandoffDiagnostics(session, maxBarIndex);
  const explosionReliability = collectExplosionReliabilityDiagnostics(session, maxBarIndex);
  const passDiagnostics = collectPassDiagnostics(executedEvents, session, maxBarIndex, handoff, spawnerPipeline);
  const sectionStability = collectSectionStability(session, maxBarIndex);
  const sectionPresentation = collectSectionPresentation(session, maxBarIndex);
  const eventSectionDiagnostics = collectEventSectionDiagnostics(session, maxBarIndex);
  const readabilityStructureOnboarding = collectReadabilityStructureOnboarding(session, maxBarIndex);
  const grooveStability = collectGrooveStability(executedEvents, sectionStability);
  const foregroundCompetition = collectForegroundCompetitionDiagnostics(session, executedEvents, maxBarIndex);
  const hierarchyModel = collectHierarchyModelDiagnostics(
    executedEvents,
    maxBarIndex,
    passDiagnostics,
    motifReuse,
    motifPersistence
  );
  const presentationMetrics = collectPresentationMetrics(executedEvents, session, maxBarIndex, {
    hierarchyModel,
    readability: readabilityStructureOnboarding?.readability,
    visibleEnemyAudibility,
    passDiagnostics,
  });
  const musicalityTargets = collectMusicalityTargets(session, maxBarIndex);
  const primaryLeadInstrumentChangeTrace = collectPrimaryLeadInstrumentChangeTrace(session, maxBarIndex);
  const level1ContractTrace = collectLevel1ContractTrace(session, maxBarIndex);
  const level1ArrangementTrace = collectLevel1ArrangementTrace(session, maxBarIndex);
  const level1ContractCompliance = collectLevel1ContractComplianceTrace(session, executedEvents, maxBarIndex);
  const visualRoleReadabilityTrace = collectVisualRoleReadabilityTrace(session, maxBarIndex);
  const enemyActionGate = collectEnemyActionGateDiagnostics(session, maxBarIndex);
  const actionCategoryTrace = collectActionCategoryTrace(executedEvents);
  const intensityCadenceTrace = collectIntensityCadenceTrace(executedEvents, session, maxBarIndex);
  const leadMotifAnchorTrace = collectLeadMotifAnchorTrace(executedEvents, session, maxBarIndex);
  const bassEngineSourceEvents = createdEvents.length ? [...executedEvents, ...createdEvents] : executedEvents;
  const bassEngineTrace = collectBassEngineTrace(bassEngineSourceEvents, session, maxBarIndex);
  const metrics = {
    notePoolCompliance,
    pitchEntropy,
    intervalProfile,
    melodicContour,
    motifReuse,
    motifPersistence,
    phraseGravity,
    leadVariation,
    phraseArchetypes,
    phraseArchetypeCount: Number(phraseArchetypes?.count) || 0,
    phraseArchetypeDistinctCount: Number(phraseArchetypes?.distinctArchetypeCount) || 0,
    phraseArchetypeByType: phraseArchetypes?.byArchetype && typeof phraseArchetypes.byArchetype === 'object'
      ? { ...phraseArchetypes.byArchetype }
      : {},
    phraseArchetypeByLane: phraseArchetypes?.byArchetypeAndLane && typeof phraseArchetypes.byArchetypeAndLane === 'object'
      ? { ...phraseArchetypes.byArchetypeAndLane }
      : {},
    phraseArchetypeByStage: phraseArchetypes?.byArchetypeAndStage && typeof phraseArchetypes.byArchetypeAndStage === 'object'
      ? { ...phraseArchetypes.byArchetypeAndStage }
      : {},
    foundationVariation,
    arrangementSupport,
    arrangementSupportCount: Number(arrangementSupport?.count) || 0,
    arrangementSupportByIntent: arrangementSupport?.byIntent && typeof arrangementSupport.byIntent === 'object'
      ? { ...arrangementSupport.byIntent }
      : {},
    arrangementSupportByStepBudget: arrangementSupport?.byStepBudget && typeof arrangementSupport.byStepBudget === 'object'
      ? { ...arrangementSupport.byStepBudget }
      : {},
    arrangementSupportByProfileSourceType: arrangementSupport?.byProfileSourceType && typeof arrangementSupport.byProfileSourceType === 'object'
      ? { ...arrangementSupport.byProfileSourceType }
      : {},
    arrangementSupportSample: Array.isArray(arrangementSupport?.sample)
      ? arrangementSupport.sample.slice(0, 24)
      : [],
    playerWeaponTiming,
    playerWeaponTimingCount: Number(playerWeaponTiming?.count) || 0,
    playerWeaponTimingAvgAbsOffsetMs: Number(playerWeaponTiming?.avgAbsOffsetMs) || 0,
    playerWeaponTimingMaxAbsOffsetMs: Number(playerWeaponTiming?.maxAbsOffsetMs) || 0,
    playerWeaponTimingSevereCount: Number(playerWeaponTiming?.severeCount) || 0,
    laneCompliance,
    roleBalance,
    threatBalance,
    actionCategoryTrace,
    actionCategoryEventCount: Number(actionCategoryTrace?.eventCount) || 0,
    actionCategoryCategorizedCount: Number(actionCategoryTrace?.categorizedCount) || 0,
    actionCategoryByType: actionCategoryTrace?.byCategory && typeof actionCategoryTrace.byCategory === 'object'
      ? { ...actionCategoryTrace.byCategory }
      : {},
    audioRequiredEventCount: Number(actionCategoryTrace?.audioRequiredCount) || 0,
    audioRequiredSilentCount: Number(actionCategoryTrace?.audioRequiredSilentCount) || 0,
    audioRequiredByActionCategory: actionCategoryTrace?.audioRequiredByCategory && typeof actionCategoryTrace.audioRequiredByCategory === 'object'
      ? { ...actionCategoryTrace.audioRequiredByCategory }
      : {},
    intensityCadenceTrace,
    intensityCadenceSystemEventCount: Number(intensityCadenceTrace?.systemEventCount) || 0,
    intensityCadenceAdmittedCount: Number(intensityCadenceTrace?.admittedCount) || 0,
    intensityCadenceAdmittedRate: Number(intensityCadenceTrace?.admittedRate) || 0,
    intensityCadenceByReason: intensityCadenceTrace?.byReason && typeof intensityCadenceTrace.byReason === 'object'
      ? { ...intensityCadenceTrace.byReason }
      : {},
    intensityCadenceByStage: intensityCadenceTrace?.byStage && typeof intensityCadenceTrace.byStage === 'object'
      ? { ...intensityCadenceTrace.byStage }
      : {},
    leadMotifAnchor: leadMotifAnchorTrace,
    leadMotifAnchorActiveEvents: Number(leadMotifAnchorTrace?.activeEvents) || 0,
    leadMotifAnchorCreatedEvents: Number(leadMotifAnchorTrace?.createdEvents) || 0,
    leadMotifAnchorReturnRate: Number(leadMotifAnchorTrace?.returnRate) || 0,
    leadMotifAnchorVariationRate: Number(leadMotifAnchorTrace?.variationRate) || 0,
    leadMotifAnchorByStage: leadMotifAnchorTrace?.byStage && typeof leadMotifAnchorTrace.byStage === 'object'
      ? { ...leadMotifAnchorTrace.byStage }
      : {},
    leadMotifAnchorByStageRole: leadMotifAnchorTrace?.byStageRole && typeof leadMotifAnchorTrace.byStageRole === 'object'
      ? { ...leadMotifAnchorTrace.byStageRole }
      : {},
    leadMotifAnchorReturnRateByStage: leadMotifAnchorTrace?.returnRateByStage && typeof leadMotifAnchorTrace.returnRateByStage === 'object'
      ? { ...leadMotifAnchorTrace.returnRateByStage }
      : {},
    leadMotifAnchorVariationRateByStage: leadMotifAnchorTrace?.variationRateByStage && typeof leadMotifAnchorTrace.variationRateByStage === 'object'
      ? { ...leadMotifAnchorTrace.variationRateByStage }
      : {},
    bassEngine: bassEngineTrace,
    bassEngineEventCount: Number(bassEngineTrace?.eventCount) || 0,
    bassEngineByStage: bassEngineTrace?.byStage && typeof bassEngineTrace.byStage === 'object'
      ? { ...bassEngineTrace.byStage }
      : {},
    bassEngineDistinctPatternCount: Number(bassEngineTrace?.distinctPatternCount) || 0,
    bassEngineLowRegisterViolationCount: Number(bassEngineTrace?.lowRegisterViolationCount) || 0,
    bassEngineLowRegisterViolations: Array.isArray(bassEngineTrace?.lowRegisterViolations)
      ? bassEngineTrace.lowRegisterViolations.slice(0, 24)
      : [],
    threatBudgetUsage,
    directorFoundationActiveBeats: Number(threatBudgetUsage?.directorPlan?.laneActiveBeatCounts?.foundation) || 0,
    directorSecondaryLoopActiveBeats: Number(threatBudgetUsage?.directorPlan?.laneActiveBeatCounts?.secondary_loop) || 0,
    directorPrimaryLoopActiveBeats: Number(threatBudgetUsage?.directorPlan?.laneActiveBeatCounts?.primary_loop) || 0,
    directorSupportActiveBeats: Number(threatBudgetUsage?.directorPlan?.laneActiveBeatCounts?.support) || 0,
    directorAnswerActiveBeats: Number(threatBudgetUsage?.directorPlan?.laneActiveBeatCounts?.answer) || 0,
    directorSparkleActiveBeats: Number(threatBudgetUsage?.directorPlan?.laneActiveBeatCounts?.sparkle) || 0,
    directorAvgCombatPressure: Number(threatBudgetUsage?.directorPlan?.avgCombatPressure) || 0,
    directorAvgMusicalPressure: Number(threatBudgetUsage?.directorPlan?.avgMusicalPressure) || 0,
    directorSpawnConfigLoadedBeats: Number(threatBudgetUsage?.spawnDirector?.loadedBeatCount) || 0,
    directorSpawnAvgLiveBudgetMax: Number(threatBudgetUsage?.spawnDirector?.avgLiveBudgetMax) || 0,
    directorSpawnAvgBudget: Number(threatBudgetUsage?.spawnDirector?.avgSpawnBudget) || 0,
    directorSpawnChosenComposerBeats: Number(threatBudgetUsage?.spawnDirector?.chosenCounts?.composer_basic) || 0,
    directorSpawnChosenSpawnerBeats: Number(threatBudgetUsage?.spawnDirector?.chosenCounts?.spawner_basic) || 0,
    directorSpawnChosenSnakeBeats: Number(threatBudgetUsage?.spawnDirector?.chosenCounts?.snake_basic) || 0,
    directorSpawnChosenSoloRhythmBeats: Number(threatBudgetUsage?.spawnDirector?.chosenCounts?.solo_rhythm_basic) || 0,
    directorSpawnActualComposerCount: Number(threatBudgetUsage?.spawnDirector?.spawnedCounts?.composer_basic) || 0,
    directorSpawnActualSpawnerCount: Number(threatBudgetUsage?.spawnDirector?.spawnedCounts?.spawner_basic) || 0,
    directorSpawnActualSnakeCount: Number(threatBudgetUsage?.spawnDirector?.spawnedCounts?.snake_basic) || 0,
    directorSpawnActualSoloRhythmCount: Number(threatBudgetUsage?.spawnDirector?.spawnedCounts?.solo_rhythm_basic) || 0,
    directorSpawnTotalSpawnsNoted: Number(threatBudgetUsage?.spawnDirector?.totalSpawnsNoted) || 0,
    directorSpawnMatchedChosenCount: Number(threatBudgetUsage?.spawnDirector?.matchedChosenSpawnCount) || 0,
    directorSpawnMismatchedChosenCount: Number(threatBudgetUsage?.spawnDirector?.mismatchedChosenSpawnCount) || 0,
    directorSpawnEvaluationCount: Number(threatBudgetUsage?.spawnDirector?.evaluationCount) || 0,
    directorSpawnNoChoiceCount: Number(threatBudgetUsage?.spawnDirector?.noChoiceCount) || 0,
    directorSpawnAvgEligibleCount: Number(threatBudgetUsage?.spawnDirector?.avgEligibleCount) || 0,
    directorSpawnMaxEligibleCount: Number(threatBudgetUsage?.spawnDirector?.maxEligibleCount) || 0,
    directorSpawnRejectTimingCount: Number(threatBudgetUsage?.spawnDirector?.rejectionReasonCounts?.timing) || 0,
    directorSpawnRejectMaxAliveCount: Number(threatBudgetUsage?.spawnDirector?.rejectionReasonCounts?.max_alive) || 0,
    directorSpawnRejectLiveBudgetCount: Number(threatBudgetUsage?.spawnDirector?.rejectionReasonCounts?.live_budget) || 0,
    directorSpawnRejectSpawnBudgetCount: Number(threatBudgetUsage?.spawnDirector?.rejectionReasonCounts?.spawn_budget) || 0,
    directorSpawnRejectRhythmSlotCount: Number(threatBudgetUsage?.spawnDirector?.rejectionReasonCounts?.rhythm_slot) || 0,
    directorSpawnRejectMelodySlotCount: Number(threatBudgetUsage?.spawnDirector?.rejectionReasonCounts?.melody_slot) || 0,
    enemyActionGate,
    enemyActionGateDecisionCount: Number(enemyActionGate?.decisionCount) || 0,
    enemyActionGateAllowedCount: Number(enemyActionGate?.allowedCount) || 0,
    enemyActionGateBlockedCount: Number(enemyActionGate?.blockedCount) || 0,
    enemyActionGateBlockRate: Number(enemyActionGate?.blockRate) || 0,
    enemyActionGateByStage: enemyActionGate?.byStage && typeof enemyActionGate.byStage === 'object' ? { ...enemyActionGate.byStage } : {},
    enemyActionGateAllowedByStage: enemyActionGate?.allowedByStage && typeof enemyActionGate.allowedByStage === 'object' ? { ...enemyActionGate.allowedByStage } : {},
    enemyActionGateBlockedByStage: enemyActionGate?.blockedByStage && typeof enemyActionGate.blockedByStage === 'object' ? { ...enemyActionGate.blockedByStage } : {},
    enemyActionGateByRhythmFamily: enemyActionGate?.byRhythmFamily && typeof enemyActionGate.byRhythmFamily === 'object' ? { ...enemyActionGate.byRhythmFamily } : {},
    enemyActionGateByLane: enemyActionGate?.byLane && typeof enemyActionGate.byLane === 'object' ? { ...enemyActionGate.byLane } : {},
    callResponse,
    callCount: Number(callResponse?.callCount) || 0,
    responsePairs: Number(callResponse?.responsePairs) || 0,
    responseRate: Number(callResponse?.responseRate) || 0,
    audibleResponsePairs: Number(callResponse?.audibleResponsePairs) || 0,
    audibleResponseRate: Number(callResponse?.audibleResponseRate) || 0,
    avgResponseSize: Number(callResponse?.avgResponseSize) || 0,
    avgResponseAudibility: Number(callResponse?.avgResponseAudibility) || 0,
    delayedResponsePairs: Number(callResponse?.delayedResponsePairs) || 0,
    delayedResponseRate: Number(callResponse?.delayedResponseRate) || 0,
    immediateResponsePairs: Number(callResponse?.immediateResponsePairs) || 0,
    immediateResponseRate: Number(callResponse?.immediateResponseRate) || 0,
    deathDensity,
    playerMasking,
    visibleEnemyAudibility,
    playerInstrument,
    paletteContinuity,
    enemyRemovals,
    spawnerSync,
    spawnerPipeline,
    foundationProminence,
    handoff,
    explosionReliability,
    passDiagnostics,
    bassLoopCycles: Number(passDiagnostics?.bassStability?.bassLoopCycles) || 0,
    bassPhraseResets: Number(passDiagnostics?.bassStability?.bassPhraseResets) || 0,
    bassHandoffContinuityRate: Number(passDiagnostics?.bassStability?.bassHandoffContinuityRate) || 0,
    laneOwnerChanges: Number(passDiagnostics?.ownershipContinuity?.ownerChanges) || 0,
    lanePreservedHandoffs: Number(passDiagnostics?.ownershipContinuity?.preservedHandoffs) || 0,
    laneResetHandoffs: Number(passDiagnostics?.ownershipContinuity?.resetHandoffs) || 0,
    laneContinuityAssertionPassed: passDiagnostics?.ownershipContinuity?.laneContinuityAssertionPassed === true,
    laneContinuityBreaks: Number(passDiagnostics?.ownershipContinuity?.continuityBreaks) || 0,
    laneCarrierTransferred: Number(passDiagnostics?.ownershipContinuity?.carrierTransferred) || 0,
    laneCarrierUnbound: Number(passDiagnostics?.ownershipContinuity?.carrierUnbound) || 0,
    laneSystemVoiceFallbacks: Number(passDiagnostics?.ownershipContinuity?.systemVoiceFallbacks) || 0,
    laneVacantFallbacks: Number(passDiagnostics?.ownershipContinuity?.vacantFallbacks) || 0,
    protectedLaneCarrierUnbound: Number(passDiagnostics?.ownershipContinuity?.protectedLaneCarrierUnbound) || 0,
    protectedLaneVacantFallbacks: Number(passDiagnostics?.ownershipContinuity?.protectedLaneVacantFallbacks) || 0,
    laneIntentionalIdentityChanges: Number(passDiagnostics?.ownershipContinuity?.intentionalIdentityChanges) || 0,
    laneDeferredChanges: Number(passDiagnostics?.ownershipContinuity?.deferredChanges) || 0,
    laneAppliedDeferredChanges: Number(passDiagnostics?.ownershipContinuity?.appliedDeferredChanges) || 0,
    laneReplacedDeferredChanges: Number(passDiagnostics?.ownershipContinuity?.replacedDeferredChanges) || 0,
    laneDroppedDeferredChanges: Number(passDiagnostics?.ownershipContinuity?.droppedDeferredChanges) || 0,
    laneRejectedDeferredChanges: Number(passDiagnostics?.ownershipContinuity?.rejectedDeferredChanges) || 0,
    laneDroppedDeferredByContinuityAdvance: Number(passDiagnostics?.ownershipContinuity?.droppedDeferredByReason?.continuityAdvanced) || 0,
    laneDroppedDeferredBySectionAdvance: Number(passDiagnostics?.ownershipContinuity?.droppedDeferredByReason?.sectionAdvanced) || 0,
    laneDroppedDeferredByTimeout: Number(passDiagnostics?.ownershipContinuity?.droppedDeferredByReason?.timeout) || 0,
    laneAvgDeferredWaitSteps: Number(passDiagnostics?.ownershipContinuity?.avgDeferredWaitSteps) || 0,
    laneAvgRejectedBoundaryDistance: Number(passDiagnostics?.ownershipContinuity?.avgRejectedBoundaryDistance) || 0,
    sameContinuityInstrumentDriftCount: Number(passDiagnostics?.ownershipContinuity?.sameContinuityInstrumentDrift) || 0,
    sameContinuityPhraseDriftCount: Number(passDiagnostics?.ownershipContinuity?.sameContinuityPhraseDrift) || 0,
    sameContinuityPatternDriftCount: Number(passDiagnostics?.ownershipContinuity?.sameContinuityPatternDrift) || 0,
    gameplaySuppressionDecisions: Number(passDiagnostics?.decisionMaking?.gameplaySuppressionEvents) || 0,
    gameplaySuppressionDrops: Number(passDiagnostics?.decisionMaking?.gameplaySuppressionDrops) || 0,
    gameplaySuppressionSoftens: Number(passDiagnostics?.decisionMaking?.gameplaySuppressionSoftens) || 0,
    stepArbitrationChanges: Number(passDiagnostics?.decisionMaking?.stepArbitrationChanges) || 0,
    bassOwnerChoiceCount: Number(passDiagnostics?.decisionMaking?.bassOwnerChoices) || 0,
    rhythmTierSelectionCount: Number(passDiagnostics?.decisionMaking?.rhythmTierSelections) || 0,
    protectedLaneClaimsInferred: Number(passDiagnostics?.decisionMaking?.protectedLaneClaimsInferred) || 0,
    protectedLaneClaimsMissing: Number(passDiagnostics?.decisionMaking?.protectedLaneClaimsMissing) || 0,
    executionInstrumentChangeCount: Number(passDiagnostics?.decisionMaking?.executionInstrumentChanges) || 0,
    executionInstrumentChangeSameContinuityCount: Number(passDiagnostics?.decisionMaking?.executionInstrumentChangesSameContinuity) || 0,
    executionInstrumentChangeNewContinuityCount: Number(passDiagnostics?.decisionMaking?.executionInstrumentChangesNewContinuity) || 0,
    executionInstrumentChangeProtectedLaneCount: Number(passDiagnostics?.decisionMaking?.executionInstrumentChangesProtectedLane) || 0,
    executionInstrumentChangeSupportLaneCount: Number(passDiagnostics?.decisionMaking?.executionInstrumentChangesSupportLane) || 0,
    executionInstrumentChangeBufferTakeoverCount: Number(passDiagnostics?.decisionMaking?.executionInstrumentChangesBufferTakeover) || 0,
    executionInstrumentChangeUnscopedCount: Number(passDiagnostics?.decisionMaking?.executionInstrumentChangesUnscoped) || 0,
    instrumentPoolAuditEvents: Number(passDiagnostics?.decisionMaking?.instrumentPoolAuditEvents) || 0,
    instrumentPoolEligibleTotal: Number(passDiagnostics?.decisionMaking?.instrumentPoolEligibleTotal) || 0,
    instrumentPoolUnusedEligibleTotal: Number(passDiagnostics?.decisionMaking?.instrumentPoolUnusedEligibleTotal) || 0,
    instrumentPoolPriorityEligibleTotal: Number(passDiagnostics?.decisionMaking?.instrumentPoolPriorityEligibleTotal) || 0,
    instrumentPoolUnreachableCount: Number(passDiagnostics?.decisionMaking?.instrumentPoolUnreachableCount) || 0,
    structureIntentEvents: Number(passDiagnostics?.decisionMaking?.structureIntentEvents) || 0,
    structureBuildBars: Number(passDiagnostics?.decisionMaking?.structureBuildBars) || 0,
    structureDriveBars: Number(passDiagnostics?.decisionMaking?.structureDriveBars) || 0,
    structureDropBars: Number(passDiagnostics?.decisionMaking?.structureDropBars) || 0,
    structurePeakBars: Number(passDiagnostics?.decisionMaking?.structurePeakBars) || 0,
    structurePreDropBars: Number(passDiagnostics?.decisionMaking?.structurePreDropBars) || 0,
    structurePreDropNearBars: Number(passDiagnostics?.decisionMaking?.structurePreDropNearBars) || 0,
    motifReturnEvents: Number(passDiagnostics?.decisionMaking?.motifReturnEvents) || 0,
    motifReturnActiveBars: Number(passDiagnostics?.decisionMaking?.motifReturnActiveBars) || 0,
    motifReturnBuildBars: Number(passDiagnostics?.decisionMaking?.motifReturnBuildBars) || 0,
    motifReturnDriveBars: Number(passDiagnostics?.decisionMaking?.motifReturnDriveBars) || 0,
    motifReturnPeakBars: Number(passDiagnostics?.decisionMaking?.motifReturnPeakBars) || 0,
    foregroundMotifUsageEvents: Number(passDiagnostics?.decisionMaking?.foregroundMotifUsageEvents) || 0,
    foregroundMotifReturnBars: Number(passDiagnostics?.decisionMaking?.foregroundMotifReturnBars) || 0,
    foregroundMotifReturnMatchingBars: Number(passDiagnostics?.decisionMaking?.foregroundMotifReturnMatchingBars) || 0,
    foregroundMotifPrimaryLoopReturnBars: Number(passDiagnostics?.decisionMaking?.foregroundMotifPrimaryLoopReturnBars) || 0,
    harmonyAuthorityEvents: Number(passDiagnostics?.decisionMaking?.harmonyAuthorityEvents) || 0,
    harmonyWeaponAnchorBars: Number(passDiagnostics?.decisionMaking?.harmonyWeaponAnchorBars) || 0,
    harmonyFallbackBars: Number(passDiagnostics?.decisionMaking?.harmonyFallbackBars) || 0,
    harmonyRelativeShiftBars: Number(passDiagnostics?.decisionMaking?.harmonyRelativeShiftBars) || 0,
    harmonyWeaponMappingMismatchBars: Number(passDiagnostics?.decisionMaking?.harmonyWeaponMappingMismatchBars) || 0,
    harmonyWeaponMappingMismatchCount: Number(passDiagnostics?.decisionMaking?.harmonyWeaponMappingMismatchCount) || 0,
    harmonyWeaponOutsidePoolBars: Number(passDiagnostics?.decisionMaking?.harmonyWeaponOutsidePoolBars) || 0,
    harmonyWeaponOutsidePoolCount: Number(passDiagnostics?.decisionMaking?.harmonyWeaponOutsidePoolCount) || 0,
    slotSpawnerRawPulseEvents: Number(passDiagnostics?.decisionMaking?.slotSpawnerRawPulseEvents) || 0,
    slotSpawnerRawBackbeatEvents: Number(passDiagnostics?.decisionMaking?.slotSpawnerRawBackbeatEvents) || 0,
    slotSpawnerQueuedPulseEvents: Number(passDiagnostics?.decisionMaking?.slotSpawnerQueuedPulseEvents) || 0,
    slotSpawnerQueuedBackbeatEvents: Number(passDiagnostics?.decisionMaking?.slotSpawnerQueuedBackbeatEvents) || 0,
    slotSpawnerDrainedPulseEvents: Number(passDiagnostics?.decisionMaking?.slotSpawnerDrainedPulseEvents) || 0,
    slotSpawnerDrainedBackbeatEvents: Number(passDiagnostics?.decisionMaking?.slotSpawnerDrainedBackbeatEvents) || 0,
    slotSpawnerFilteredPulseEvents: Number(passDiagnostics?.decisionMaking?.slotSpawnerFilteredPulseEvents) || 0,
    slotSpawnerFilteredBackbeatEvents: Number(passDiagnostics?.decisionMaking?.slotSpawnerFilteredBackbeatEvents) || 0,
    slotSpawnerShapedPulseEvents: Number(passDiagnostics?.decisionMaking?.slotSpawnerShapedPulseEvents) || 0,
    slotSpawnerShapedBackbeatEvents: Number(passDiagnostics?.decisionMaking?.slotSpawnerShapedBackbeatEvents) || 0,
    slotSpawnerExecutedPulseEvents: Number(passDiagnostics?.decisionMaking?.slotSpawnerExecutedPulseEvents) || 0,
    slotSpawnerExecutedBackbeatEvents: Number(passDiagnostics?.decisionMaking?.slotSpawnerExecutedBackbeatEvents) || 0,
    visibleEnemyEvents: Number(visibleEnemyAudibility?.visibleEnemyEvents) || 0,
    barelyAudibleVisibleEnemyEvents: Number(visibleEnemyAudibility?.barelyAudibleVisibleEnemyEvents) || 0,
    barelyAudibleVisibleEnemyRate: Number(visibleEnemyAudibility?.barelyAudibleVisibleEnemyRate) || 0,
    foundationCycleCount: Number(hierarchyModel?.foundationCycleCount) || 0,
    foundationPhraseResets: Number(hierarchyModel?.foundationPhraseResets) || 0,
    foundationContinuityRate: Number(hierarchyModel?.foundationContinuityRate) || 0,
    themeCycleCount: Number(hierarchyModel?.themeCycleCount) || 0,
    themePersistenceRate: Number(hierarchyModel?.themePersistenceRate) || 0,
    themeReturnRate: Number(hierarchyModel?.themeReturnRate) || 0,
    sparkleDensity: Number(hierarchyModel?.sparkleDensity) || 0,
    sparkleForegroundShare: Number(hierarchyModel?.sparkleForegroundShare) || 0,
    audibleForegroundLaneCount: Number(hierarchyModel?.audibleForegroundLaneCount) || 0,
    foregroundLoopOwnerChanges: Number(hierarchyModel?.foregroundLoopOwnerChanges) || 0,
    foregroundLoopChurnRate: Number(hierarchyModel?.foregroundLoopChurnRate) || 0,
    barsSinceNewForegroundIdea: Number(hierarchyModel?.barsSinceNewForegroundIdea) || 0,
    laneReassignmentRate: Number(hierarchyModel?.laneReassignmentRate) || 0,
    enemyColourMutationCount: Number(hierarchyModel?.enemyColourMutationCount) || 0,
    enemyInstrumentMutationCount: Number(hierarchyModel?.enemyInstrumentMutationCount) || 0,
    instrumentChangesPerEnemy: Number(passDiagnostics?.identityStability?.instrumentChangesPerEnemy) || 0,
    colourChangesPerEnemy: Number(passDiagnostics?.identityStability?.colourChangesPerEnemy) || 0,
    colorChangesPerEnemy: Number(passDiagnostics?.identityStability?.colourChangesPerEnemy) || 0,
    spawnerGameplayEvents: Number(passDiagnostics?.spawnerFeedback?.spawnerGameplayEvents) || 0,
    spawnerVisualEvents: Number(passDiagnostics?.spawnerFeedback?.spawnerVisualEvents) || 0,
    spawnerAudioEvents: Number(passDiagnostics?.spawnerFeedback?.spawnerAudioEvents) || 0,
    createdEnemyEvents: Number(passDiagnostics?.delivery?.createdEnemyEvents) || 0,
    executedEnemyEvents: Number(passDiagnostics?.delivery?.executedEnemyEvents) || 0,
    skippedCreatedEvents: Number(passDiagnostics?.delivery?.skippedCreatedEvents) || 0,
    createdSpawnerEvents: Number(passDiagnostics?.delivery?.createdSpawnerEvents) || 0,
    executedSpawnerEvents: Number(passDiagnostics?.delivery?.executedSpawnerEvents) || 0,
    spawnerSkippedCreatedEvents: Number(passDiagnostics?.delivery?.spawnerSkippedCreatedEvents) || 0,
    createdBassEvents: Number(passDiagnostics?.delivery?.createdBassEvents) || 0,
    executedBassEvents: Number(passDiagnostics?.delivery?.executedBassEvents) || 0,
    bassSkippedCreatedEvents: Number(passDiagnostics?.delivery?.bassSkippedCreatedEvents) || 0,
    executedToCreatedRate: Number(passDiagnostics?.delivery?.executedToCreatedRate) || 0,
    spawnerExecutedToCreatedRate: Number(passDiagnostics?.delivery?.spawnerExecutedToCreatedRate) || 0,
    bassExecutedToCreatedRate: Number(passDiagnostics?.delivery?.bassExecutedToCreatedRate) || 0,
    maxBassStepGap: Number(passDiagnostics?.delivery?.maxBassStepGap) || 0,
    maxEnemyStepsWithoutBass: Number(passDiagnostics?.delivery?.maxEnemyStepsWithoutBass) || 0,
    deliveryByActionType: passDiagnostics?.delivery?.byActionType && typeof passDiagnostics.delivery.byActionType === 'object'
      ? JSON.parse(JSON.stringify(passDiagnostics.delivery.byActionType))
      : {},
    deliveryBySourceSystem: passDiagnostics?.delivery?.bySourceSystem && typeof passDiagnostics.delivery.bySourceSystem === 'object'
      ? JSON.parse(JSON.stringify(passDiagnostics.delivery.bySourceSystem))
      : {},
    deliveryByMusicLane: passDiagnostics?.delivery?.byMusicLane && typeof passDiagnostics.delivery.byMusicLane === 'object'
      ? JSON.parse(JSON.stringify(passDiagnostics.delivery.byMusicLane))
      : {},
    deliveryByProfileSourceType: passDiagnostics?.delivery?.byProfileSourceType && typeof passDiagnostics.delivery.byProfileSourceType === 'object'
      ? JSON.parse(JSON.stringify(passDiagnostics.delivery.byProfileSourceType))
      : {},
    deliveryByReason: passDiagnostics?.delivery?.byReason && typeof passDiagnostics.delivery.byReason === 'object'
      ? JSON.parse(JSON.stringify(passDiagnostics.delivery.byReason))
      : {},
    deliveryByBeatStrength: passDiagnostics?.delivery?.byBeatStrength && typeof passDiagnostics.delivery.byBeatStrength === 'object'
      ? JSON.parse(JSON.stringify(passDiagnostics.delivery.byBeatStrength))
      : {},
    strongBeatDeliveryByMusicLane: passDiagnostics?.delivery?.strongBeatByMusicLane && typeof passDiagnostics.delivery.strongBeatByMusicLane === 'object'
      ? JSON.parse(JSON.stringify(passDiagnostics.delivery.strongBeatByMusicLane))
      : {},
    strongBeatDeliveryByReason: passDiagnostics?.delivery?.strongBeatByReason && typeof passDiagnostics.delivery.strongBeatByReason === 'object'
      ? JSON.parse(JSON.stringify(passDiagnostics.delivery.strongBeatByReason))
      : {},
    mediumBeatDeliveryByMusicLane: passDiagnostics?.delivery?.mediumBeatByMusicLane && typeof passDiagnostics.delivery.mediumBeatByMusicLane === 'object'
      ? JSON.parse(JSON.stringify(passDiagnostics.delivery.mediumBeatByMusicLane))
      : {},
    mediumBeatDeliveryByReason: passDiagnostics?.delivery?.mediumBeatByReason && typeof passDiagnostics.delivery.mediumBeatByReason === 'object'
      ? JSON.parse(JSON.stringify(passDiagnostics.delivery.mediumBeatByReason))
      : {},
    strongBeatFoundationDeliveryByProfileSourceType: passDiagnostics?.delivery?.strongBeatFoundationByProfileSourceType && typeof passDiagnostics.delivery.strongBeatFoundationByProfileSourceType === 'object'
      ? JSON.parse(JSON.stringify(passDiagnostics.delivery.strongBeatFoundationByProfileSourceType))
      : {},
    strongBeatFoundationDeliveryByReason: passDiagnostics?.delivery?.strongBeatFoundationByReason && typeof passDiagnostics.delivery.strongBeatFoundationByReason === 'object'
      ? JSON.parse(JSON.stringify(passDiagnostics.delivery.strongBeatFoundationByReason))
      : {},
    sectionStability,
    sectionPresentation,
    eventSectionDiagnostics,
    eventSectionStateCount: Number(eventSectionDiagnostics?.count) || 0,
    eventSectionActiveCount: Number(eventSectionDiagnostics?.activeCount) || 0,
    eventSectionActiveRate: Number(eventSectionDiagnostics?.activeRate) || 0,
    beatBounceEventSectionCount: Number(eventSectionDiagnostics?.beatBounceCount) || 0,
    eventSectionStrongBeatCount: Number(eventSectionDiagnostics?.strongBeatCount) || 0,
    eventSectionStrongBeatRate: Number(eventSectionDiagnostics?.strongBeatRate) || 0,
    eventSectionMovementEventCount: Number(eventSectionDiagnostics?.movementEventCount) || 0,
    eventSectionAudioRequiredCount: Number(eventSectionDiagnostics?.audioRequiredCount) || 0,
    eventSectionBySection: eventSectionDiagnostics?.bySection && typeof eventSectionDiagnostics.bySection === 'object'
      ? { ...eventSectionDiagnostics.bySection }
      : {},
    eventSectionByStage: eventSectionDiagnostics?.byStage && typeof eventSectionDiagnostics.byStage === 'object'
      ? { ...eventSectionDiagnostics.byStage }
      : {},
    eventSectionBySectionAndStage: eventSectionDiagnostics?.bySectionAndStage && typeof eventSectionDiagnostics.bySectionAndStage === 'object'
      ? { ...eventSectionDiagnostics.bySectionAndStage }
      : {},
    eventSectionByActionCategory: eventSectionDiagnostics?.byActionCategory && typeof eventSectionDiagnostics.byActionCategory === 'object'
      ? { ...eventSectionDiagnostics.byActionCategory }
      : {},
    eventSectionByBehaviorClass: eventSectionDiagnostics?.byBehaviorClass && typeof eventSectionDiagnostics.byBehaviorClass === 'object'
      ? { ...eventSectionDiagnostics.byBehaviorClass }
      : {},
    eventSectionSample: Array.isArray(eventSectionDiagnostics?.sample)
      ? eventSectionDiagnostics.sample.slice(0, 24)
      : [],
    readability: readabilityStructureOnboarding.readability,
    structure: readabilityStructureOnboarding.structure,
    onboarding: readabilityStructureOnboarding.onboarding,
    grooveStability,
    foregroundCompetition,
    presentationMetrics,
    explosionPrimesCreated: Number(explosionReliability?.explosionPrimesCreated) || 0,
    explosionApplications: Number(explosionReliability?.explosionApplications) || 0,
    explosionPrimeWithoutApplicationCount: Number(explosionReliability?.explosionPrimeWithoutApplicationCount) || 0,
    explosionReliabilityRate: Number(explosionReliability?.explosionReliabilityRate) || 0,
    protectedLoopAudibility: Number(presentationMetrics?.protectedLoopAudibility) || 0,
    protectedLoopEventCount: Number(presentationMetrics?.protectedLoopEventCount) || 0,
    foregroundClarityScore: Number(presentationMetrics?.foregroundClarityScore) || 0,
    simultaneousVoiceCount: Number(presentationMetrics?.simultaneousVoiceCount) || 0,
    maxSimultaneousVoiceCount: Number(presentationMetrics?.maxSimultaneousVoiceCount) || 0,
    buildSimultaneousVoiceCount: Number(presentationMetrics?.buildSimultaneousVoiceCount) || 0,
    driveSimultaneousVoiceCount: Number(presentationMetrics?.driveSimultaneousVoiceCount) || 0,
    dropSimultaneousVoiceCount: Number(presentationMetrics?.dropSimultaneousVoiceCount) || 0,
    peakSimultaneousVoiceCount: Number(presentationMetrics?.peakSimultaneousVoiceCount) || 0,
    preDropSimultaneousVoiceCount: Number(presentationMetrics?.preDropSimultaneousVoiceCount) || 0,
    suppressedEventCount: Number(presentationMetrics?.suppressedEventCount) || 0,
    suppressedEventRate: Number(presentationMetrics?.suppressedEventRate) || 0,
    groupParticipationRate: Number(presentationMetrics?.groupParticipationRate) || 0,
    ghostLoopCount: Number(presentationMetrics?.ghostLoopCount) || 0,
    musicalityTargets,
    primaryLeadInstrumentChangeTrace,
    level1ContractTrace,
    level1ArrangementTrace,
    level1ContractCompliance,
    visualRoleReadability: visualRoleReadabilityTrace,
    laneContinuityAssertionPassed: passDiagnostics?.ownershipContinuity?.laneContinuityAssertionPassed === true,
    laneContinuityAssertion: passDiagnostics?.ownershipContinuity && typeof passDiagnostics.ownershipContinuity === 'object'
      ? {
          passed: passDiagnostics.ownershipContinuity.laneContinuityAssertionPassed === true,
          ownerChanges: Number(passDiagnostics.ownershipContinuity.ownerChanges) || 0,
          preservedHandoffs: Number(passDiagnostics.ownershipContinuity.preservedHandoffs) || 0,
          resetHandoffs: Number(passDiagnostics.ownershipContinuity.resetHandoffs) || 0,
          continuityBreaks: Number(passDiagnostics.ownershipContinuity.continuityBreaks) || 0,
          carrierTransferred: Number(passDiagnostics.ownershipContinuity.carrierTransferred) || 0,
          carrierUnbound: Number(passDiagnostics.ownershipContinuity.carrierUnbound) || 0,
          systemVoiceFallbacks: Number(passDiagnostics.ownershipContinuity.systemVoiceFallbacks) || 0,
          vacantFallbacks: Number(passDiagnostics.ownershipContinuity.vacantFallbacks) || 0,
          protectedLaneCarrierUnbound: Number(passDiagnostics.ownershipContinuity.protectedLaneCarrierUnbound) || 0,
          protectedLaneVacantFallbacks: Number(passDiagnostics.ownershipContinuity.protectedLaneVacantFallbacks) || 0,
          sameContinuityInstrumentDrift: Number(passDiagnostics.ownershipContinuity.sameContinuityInstrumentDrift) || 0,
          sameContinuityPhraseDrift: Number(passDiagnostics.ownershipContinuity.sameContinuityPhraseDrift) || 0,
          sameContinuityPatternDrift: Number(passDiagnostics.ownershipContinuity.sameContinuityPatternDrift) || 0,
        }
      : null,
    level1ContractTraceCount: Number(level1ContractTrace?.count) || 0,
    level1ContractFullTextureCount: Number(level1ContractTrace?.fullTextureCount) || 0,
    level1ContractAnswerActiveShare: Number(level1ContractTrace?.answerActiveShare) || 0,
    level1ContractSparkleActiveShare: Number(level1ContractTrace?.sparkleActiveShare) || 0,
    level1ContractSupportActiveShare: Number(level1ContractTrace?.supportActiveShare) || 0,
    level1ContractBySupportBudget: level1ContractTrace?.bySupportBudget && typeof level1ContractTrace.bySupportBudget === 'object'
      ? { ...level1ContractTrace.bySupportBudget }
      : {},
    level1ContractByPreferredSupportSteps: level1ContractTrace?.byPreferredSupportSteps && typeof level1ContractTrace.byPreferredSupportSteps === 'object'
      ? { ...level1ContractTrace.byPreferredSupportSteps }
      : {},
    level1ContractByCounterRhythmFamily: level1ContractTrace?.byCounterRhythmFamily && typeof level1ContractTrace.byCounterRhythmFamily === 'object'
      ? { ...level1ContractTrace.byCounterRhythmFamily }
      : {},
    level1ContractByAnswerPolicy: level1ContractTrace?.byAnswerPolicy && typeof level1ContractTrace.byAnswerPolicy === 'object'
      ? { ...level1ContractTrace.byAnswerPolicy }
      : {},
    level1ContractByAllowedRoleSet: level1ContractTrace?.byAllowedRoleSet && typeof level1ContractTrace.byAllowedRoleSet === 'object'
      ? { ...level1ContractTrace.byAllowedRoleSet }
      : {},
    level1ContractByIntensityAuditionSection: level1ContractTrace?.byIntensityAuditionSection && typeof level1ContractTrace.byIntensityAuditionSection === 'object'
      ? { ...level1ContractTrace.byIntensityAuditionSection }
      : {},
    level1ContractByIntensityAuditionLaneSet: level1ContractTrace?.byIntensityAuditionLaneSet && typeof level1ContractTrace.byIntensityAuditionLaneSet === 'object'
      ? { ...level1ContractTrace.byIntensityAuditionLaneSet }
      : {},
    level1IntensityAuditionLanePresence: level1ContractTrace?.intensityAuditionLanePresence && typeof level1ContractTrace.intensityAuditionLanePresence === 'object'
      ? JSON.parse(JSON.stringify(level1ContractTrace.intensityAuditionLanePresence))
      : {},
    level1ContractSample: Array.isArray(level1ContractTrace?.sample)
      ? level1ContractTrace.sample.slice(0, 24)
      : [],
    level1ArrangementTraceCount: Number(level1ArrangementTrace?.count) || 0,
    level1ArrangementByPhraseIntent: level1ArrangementTrace?.byPhraseIntent && typeof level1ArrangementTrace.byPhraseIntent === 'object'
      ? { ...level1ArrangementTrace.byPhraseIntent }
      : {},
    level1ArrangementByPhase: level1ArrangementTrace?.byPhase && typeof level1ArrangementTrace.byPhase === 'object'
      ? { ...level1ArrangementTrace.byPhase }
      : {},
    level1ArrangementByMode: level1ArrangementTrace?.byMode && typeof level1ArrangementTrace.byMode === 'object'
      ? { ...level1ArrangementTrace.byMode }
      : {},
    level1ArrangementByIntensityAuditionSection: level1ArrangementTrace?.byIntensityAuditionSection && typeof level1ArrangementTrace.byIntensityAuditionSection === 'object'
      ? { ...level1ArrangementTrace.byIntensityAuditionSection }
      : {},
    level1ArrangementIntroSetPieceCount: Number(level1ArrangementTrace?.introSetPieceCount) || 0,
    level1ArrangementIntroSetPieceViolationCount: Number(level1ArrangementTrace?.introSetPieceViolationCount) || 0,
    level1ArrangementPostIntroCount: Number(level1ArrangementTrace?.postIntroArrangementCount) || 0,
    level1ArrangementPostIntroByPhraseIntent: level1ArrangementTrace?.postIntroByPhraseIntent && typeof level1ArrangementTrace.postIntroByPhraseIntent === 'object'
      ? { ...level1ArrangementTrace.postIntroByPhraseIntent }
      : {},
    level1ArrangementEnergy: level1ArrangementTrace?.energy || { min: 0, max: 0, avg: 0 },
    level1ArrangementLayering: level1ArrangementTrace?.layering || { min: 0, max: 0, avg: 0 },
    level1ArrangementRhythmicComplexity: level1ArrangementTrace?.rhythmicComplexity || { min: 0, max: 0, avg: 0 },
    level1ArrangementMelodicActivity: level1ArrangementTrace?.melodicActivity || { min: 0, max: 0, avg: 0 },
    level1ArrangementOrnamentation: level1ArrangementTrace?.ornamentation || { min: 0, max: 0, avg: 0 },
    level1ArrangementStability: level1ArrangementTrace?.stability || { min: 0, max: 0, avg: 0 },
    level1ArrangementSample: Array.isArray(level1ArrangementTrace?.sample)
      ? level1ArrangementTrace.sample.slice(0, 24)
      : [],
    level1ContractCompliancePassed: level1ContractCompliance?.passed === true,
    level1ContractMusicalEventCount: Number(level1ContractCompliance?.musicalEventCount) || 0,
    level1ContractViolationCount: Number(level1ContractCompliance?.violationCount) || 0,
    level1ContractViolationRate: Number(level1ContractCompliance?.violationRate) || 0,
    level1ContractRoleViolationCount: Number(level1ContractCompliance?.roleViolationCount) || 0,
    level1ContractSparkleViolationCount: Number(level1ContractCompliance?.sparkleViolationCount) || 0,
    level1ContractAnswerViolationCount: Number(level1ContractCompliance?.answerViolationCount) || 0,
    level1ContractViolationByRole: level1ContractCompliance?.byRole && typeof level1ContractCompliance.byRole === 'object'
      ? { ...level1ContractCompliance.byRole }
      : {},
    level1ContractViolationByLane: level1ContractCompliance?.byLane && typeof level1ContractCompliance.byLane === 'object'
      ? { ...level1ContractCompliance.byLane }
      : {},
    level1ContractViolationByReason: level1ContractCompliance?.byReason && typeof level1ContractCompliance.byReason === 'object'
      ? { ...level1ContractCompliance.byReason }
      : {},
    level1ContractViolationSample: Array.isArray(level1ContractCompliance?.sample)
      ? level1ContractCompliance.sample.slice(0, 24)
      : [],
    visualRoleReadabilityTraceCount: Number(visualRoleReadabilityTrace?.count) || 0,
    visualRoleFullTextureTraceCount: Number(visualRoleReadabilityTrace?.fullTextureCount) || 0,
    visualRoleThreeRoleReadableShare: Number(visualRoleReadabilityTrace?.threeRoleReadableShare) || 0,
    visualRoleFullTextureThreeRoleReadableShare: Number(visualRoleReadabilityTrace?.fullTextureThreeRoleReadableShare) || 0,
    visualRoleSupportCollapsedDuringLeadShare: Number(visualRoleReadabilityTrace?.supportCollapsedDuringLeadShare) || 0,
    visualRoleLeadWithSupportVisibleShare: Number(visualRoleReadabilityTrace?.leadWithSupportVisibleShare) || 0,
    visualRoleFullTextureLeadWithSupportVisibleShare: Number(visualRoleReadabilityTrace?.fullTextureLeadWithSupportVisibleShare) || 0,
    visualRoleAvgDistinctReadableRoleCount: Number(visualRoleReadabilityTrace?.avgDistinctReadableRoleCount) || 0,
    formationRoleThreeRoleReadableShare: Number(visualRoleReadabilityTrace?.formationThreeRoleReadableShare) || 0,
    formationRoleFullTextureThreeRoleReadableShare: Number(visualRoleReadabilityTrace?.formationFullTextureThreeRoleReadableShare) || 0,
    formationRoleSupportCollapsedDuringLeadShare: Number(visualRoleReadabilityTrace?.formationSupportCollapsedDuringLeadShare) || 0,
    formationRoleLeadWithSupportVisibleShare: Number(visualRoleReadabilityTrace?.formationLeadWithSupportVisibleShare) || 0,
    formationRoleFullTextureLeadWithSupportVisibleShare: Number(visualRoleReadabilityTrace?.formationFullTextureLeadWithSupportVisibleShare) || 0,
    formationRoleAvgDistinctReadableRoleCount: Number(visualRoleReadabilityTrace?.formationAvgDistinctReadableRoleCount) || 0,
    formationRoleAvgFoundationVisualWeight: Number(visualRoleReadabilityTrace?.formationAvgFoundationVisualWeight) || 0,
    formationRoleAvgSupportVisualWeight: Number(visualRoleReadabilityTrace?.formationAvgSupportVisualWeight) || 0,
    formationRoleAvgLeadVisualWeight: Number(visualRoleReadabilityTrace?.formationAvgLeadVisualWeight) || 0,
    formationRoleAvgOrnamentVisualWeight: Number(visualRoleReadabilityTrace?.formationAvgOrnamentVisualWeight) || 0,
    formationRoleReadableRoleSetCounts: visualRoleReadabilityTrace?.byFormationReadableRoleSet && typeof visualRoleReadabilityTrace.byFormationReadableRoleSet === 'object'
      ? { ...visualRoleReadabilityTrace.byFormationReadableRoleSet }
      : {},
    formationRoleArchetypeCounts: visualRoleReadabilityTrace?.byFormationArchetypeRole && typeof visualRoleReadabilityTrace.byFormationArchetypeRole === 'object'
      ? { ...visualRoleReadabilityTrace.byFormationArchetypeRole }
      : {},
    visualRoleAvgFoundationVisualWeight: Number(visualRoleReadabilityTrace?.avgFoundationVisualWeight) || 0,
    visualRoleAvgSupportVisualWeight: Number(visualRoleReadabilityTrace?.avgSupportVisualWeight) || 0,
    visualRoleAvgLeadVisualWeight: Number(visualRoleReadabilityTrace?.avgLeadVisualWeight) || 0,
    visualRoleAvgOrnamentVisualWeight: Number(visualRoleReadabilityTrace?.avgOrnamentVisualWeight) || 0,
    visualRoleReadableRoleShares: visualRoleReadabilityTrace?.readableRoleShares && typeof visualRoleReadabilityTrace.readableRoleShares === 'object'
      ? { ...visualRoleReadabilityTrace.readableRoleShares }
      : {},
    visualRoleReadableRoleSetCounts: visualRoleReadabilityTrace?.byReadableRoleSet && typeof visualRoleReadabilityTrace.byReadableRoleSet === 'object'
      ? { ...visualRoleReadabilityTrace.byReadableRoleSet }
      : {},
    visualRoleByEnemyHealthSection: visualRoleReadabilityTrace?.byEnemyHealthSection && typeof visualRoleReadabilityTrace.byEnemyHealthSection === 'object'
      ? JSON.parse(JSON.stringify(visualRoleReadabilityTrace.byEnemyHealthSection))
      : {},
    visualRoleReadabilitySample: Array.isArray(visualRoleReadabilityTrace?.sample)
      ? visualRoleReadabilityTrace.sample.slice(0, 24)
      : [],
    primaryLeadUniqueGroupCount: Number(musicalityTargets?.primaryLead?.uniqueLeadGroupCount) || 0,
    primaryLeadSingleShare: Number(musicalityTargets?.primaryLead?.singleLeadShare) || 0,
    primaryLeadNoLeadShare: Number(musicalityTargets?.primaryLead?.noLeadShare) || 0,
    primaryLeadMultiLeadShare: Number(musicalityTargets?.primaryLead?.multiLeadShare) || 0,
    primaryLeadMaxCount: Number(musicalityTargets?.primaryLead?.maxLeadCount) || 0,
    primaryLeadLongestRunBeats: Number(musicalityTargets?.primaryLead?.longestSingleLeadRunBeats) || 0,
    primaryLeadAuthorityActiveShare: Number(musicalityTargets?.primaryLead?.authority?.activeShare) || 0,
    primaryLeadAuthorityGroupSwitches: Number(musicalityTargets?.primaryLead?.authority?.groupSwitches) || 0,
    primaryLeadAuthorityContinuitySwitches: Number(musicalityTargets?.primaryLead?.authority?.continuitySwitches) || 0,
    primaryLeadAuthorityInstrumentSwitches: Number(musicalityTargets?.primaryLead?.authority?.instrumentSwitches) || 0,
    primaryLeadAuthorityLongestGroupRunBeats: Number(musicalityTargets?.primaryLead?.authority?.longestGroupRunBeats) || 0,
    primaryLeadAuthorityLongestContinuityRunBeats: Number(musicalityTargets?.primaryLead?.authority?.longestContinuityRunBeats) || 0,
    primaryLeadAuthorityLongestInstrumentRunBeats: Number(musicalityTargets?.primaryLead?.authority?.longestInstrumentRunBeats) || 0,
    primaryLeadAuthorityStatus: String(musicalityTargets?.primaryLead?.authority?.status || '').trim().toLowerCase(),
    primaryLeadInstrumentChangeTraceCount: Number(primaryLeadInstrumentChangeTrace?.count) || 0,
    primaryLeadInstrumentChangeBySource: primaryLeadInstrumentChangeTrace?.bySource && typeof primaryLeadInstrumentChangeTrace.bySource === 'object'
      ? { ...primaryLeadInstrumentChangeTrace.bySource }
      : {},
    primaryLeadInstrumentChangeByPhase: primaryLeadInstrumentChangeTrace?.byPhase && typeof primaryLeadInstrumentChangeTrace.byPhase === 'object'
      ? { ...primaryLeadInstrumentChangeTrace.byPhase }
      : {},
    primaryLeadInstrumentChangeByMode: primaryLeadInstrumentChangeTrace?.byMode && typeof primaryLeadInstrumentChangeTrace.byMode === 'object'
      ? { ...primaryLeadInstrumentChangeTrace.byMode }
      : {},
    primaryLeadInstrumentChangeTraceSample: Array.isArray(primaryLeadInstrumentChangeTrace?.trace)
      ? primaryLeadInstrumentChangeTrace.trace.slice(0, 24)
      : [],
    foundationBufferMaxCount: Number(musicalityTargets?.foundationBuffer?.maxCount) || 0,
    answerOrnamentMaxCount: Number(musicalityTargets?.answerOrnament?.maxCount) || 0,
    answerOrnamentLeadRoleEvents: Number(musicalityTargets?.answerOrnament?.leadRoleEvents) || 0,
    avgActiveComposerGroupCount: Number(musicalityTargets?.population?.avgActiveGroupCount) || 0,
    maxActiveComposerGroupCount: Number(musicalityTargets?.population?.maxActiveGroupCount) || 0,
    fullTextureEnemyForegroundShare: Number(foregroundCompetition?.fullTextureEnemyForegroundShare) || 0,
    fullTextureEnemyCompetitionShare: Number(foregroundCompetition?.fullTextureEnemyCompetitionShare) || 0,
    fullTextureForegroundByRole: foregroundCompetition?.byRoleForeground && typeof foregroundCompetition.byRoleForeground === 'object'
      ? { ...foregroundCompetition.byRoleForeground }
      : {},
    fullTextureCompetitionByRole: foregroundCompetition?.byRoleCompetition && typeof foregroundCompetition.byRoleCompetition === 'object'
      ? { ...foregroundCompetition.byRoleCompetition }
      : {},
    fullTextureForegroundBySource: foregroundCompetition?.bySourceForeground && typeof foregroundCompetition.bySourceForeground === 'object'
      ? { ...foregroundCompetition.bySourceForeground }
      : {},
    fullTextureCompetitionBySource: foregroundCompetition?.bySourceCompetition && typeof foregroundCompetition.bySourceCompetition === 'object'
      ? { ...foregroundCompetition.bySourceCompetition }
      : {},
    fullTextureForegroundByEnemyType: foregroundCompetition?.byEnemyTypeForeground && typeof foregroundCompetition.byEnemyTypeForeground === 'object'
      ? { ...foregroundCompetition.byEnemyTypeForeground }
      : {},
    fullTextureCompetitionByEnemyType: foregroundCompetition?.byEnemyTypeCompetition && typeof foregroundCompetition.byEnemyTypeCompetition === 'object'
      ? { ...foregroundCompetition.byEnemyTypeCompetition }
      : {},
    fullTextureForegroundByProfileSourceType: foregroundCompetition?.byProfileSourceTypeForeground && typeof foregroundCompetition.byProfileSourceTypeForeground === 'object'
      ? { ...foregroundCompetition.byProfileSourceTypeForeground }
      : {},
    fullTextureCompetitionByProfileSourceType: foregroundCompetition?.byProfileSourceTypeCompetition && typeof foregroundCompetition.byProfileSourceTypeCompetition === 'object'
      ? { ...foregroundCompetition.byProfileSourceTypeCompetition }
      : {},
    fullTextureForegroundByReason: foregroundCompetition?.byReasonForeground && typeof foregroundCompetition.byReasonForeground === 'object'
      ? { ...foregroundCompetition.byReasonForeground }
      : {},
    fullTextureCompetitionByReason: foregroundCompetition?.byReasonCompetition && typeof foregroundCompetition.byReasonCompetition === 'object'
      ? { ...foregroundCompetition.byReasonCompetition }
      : {},
    fullTexturePrimarySecondaryConflictHitCount: Number(foregroundCompetition?.conflictDiagnostics?.primarySecondaryConflictHitCount) || 0,
    fullTexturePrimarySecondaryConflictAvoidedCount: Number(foregroundCompetition?.conflictDiagnostics?.primarySecondaryConflictAvoidedCount) || 0,
    fullTexturePrimarySecondaryConflictByLane: foregroundCompetition?.conflictDiagnostics?.byLane && typeof foregroundCompetition.conflictDiagnostics.byLane === 'object'
      ? JSON.parse(JSON.stringify(foregroundCompetition.conflictDiagnostics.byLane))
      : {},
    fullTexturePrimarySecondaryConflictByProfileSourceType: foregroundCompetition?.conflictDiagnostics?.byProfileSourceType && typeof foregroundCompetition.conflictDiagnostics.byProfileSourceType === 'object'
      ? JSON.parse(JSON.stringify(foregroundCompetition.conflictDiagnostics.byProfileSourceType))
      : {},
    fullTexturePrimarySecondaryConflictByReason: foregroundCompetition?.conflictDiagnostics?.byReason && typeof foregroundCompetition.conflictDiagnostics.byReason === 'object'
      ? JSON.parse(JSON.stringify(foregroundCompetition.conflictDiagnostics.byReason))
      : {},
    fullTextureOrnamentConflictHitCount: Number(foregroundCompetition?.conflictDiagnostics?.ornamentConflictHitCount) || 0,
    fullTextureOrnamentConflictAvoidedCount: Number(foregroundCompetition?.conflictDiagnostics?.ornamentConflictAvoidedCount) || 0,
    fullTextureOrnamentConflictByProfileSourceType: foregroundCompetition?.conflictDiagnostics?.ornamentByProfileSourceType && typeof foregroundCompetition.conflictDiagnostics.ornamentByProfileSourceType === 'object'
      ? JSON.parse(JSON.stringify(foregroundCompetition.conflictDiagnostics.ornamentByProfileSourceType))
      : {},
    fullTextureOrnamentConflictByReason: foregroundCompetition?.conflictDiagnostics?.ornamentByReason && typeof foregroundCompetition.conflictDiagnostics.ornamentByReason === 'object'
      ? JSON.parse(JSON.stringify(foregroundCompetition.conflictDiagnostics.ornamentByReason))
      : {},
  };
  metrics.musicIntensityAudition = collectMusicIntensityAuditionAssertion(metrics);
  metrics.musicIntensityAuditionDetected = String(metrics.musicIntensityAudition?.status || '').trim().toLowerCase() !== 'not_detected';
  metrics.musicIntensityAuditionPassed = metrics.musicIntensityAudition?.passed === true;
  metrics.musicIntensityAuditionFailureCount = Number(metrics.musicIntensityAudition?.failureCount) || 0;
  metrics.musicIntensityAuditionFailures = Array.isArray(metrics.musicIntensityAudition?.failures)
    ? metrics.musicIntensityAudition.failures.slice(0, 24)
    : [];
  metrics.level1ArrangementMusicality = metrics.musicIntensityAuditionDetected
    ? {
        passed: true,
        status: 'skipped_intensity_audition',
        skipped: true,
        reason: 'Intensity audition uses a forced lane/layer stack and is validated by musicIntensityAudition instead of the normal arrangement musicality contract.',
      }
    : collectLevel1ArrangementMusicalityAssertion(metrics);
  metrics.level1ArrangementMusicalityPassed = metrics.level1ArrangementMusicality?.passed === true;
  metrics.level1ArrangementMusicalityFailureCount = Number(metrics.level1ArrangementMusicality?.failureCount) || 0;
  metrics.level1ArrangementMusicalityFailures = Array.isArray(metrics.level1ArrangementMusicality?.failures)
    ? metrics.level1ArrangementMusicality.failures.slice(0, 24)
    : [];
  metrics.retroShmupStyle = collectRetroShmupStyleMetrics(metrics);
  return {
    metrics,
    sessionSummary: computeSummary(metrics),
  };
}

export function createBeatSwarmMusicLab(options = null) {
  const beatsPerBar = Math.max(1, clampInt(options?.beatsPerBar, DEFAULT_BEATS_PER_BAR, 1));
  const metricsEveryBars = Math.max(1, clampInt(options?.metricsEveryBars, DEFAULT_METRICS_EVERY_BARS, 1));
  let enabled = options?.enabled === true;
  let realtimeMetricsEnabled = options?.realtimeMetricsEnabled !== false;
  let lightweightSystemEventsEnabled = options?.lightweightSystemEventsEnabled === true;
  let sessionSeq = 1;
  let session = null;
  let lastMetricsBar = -1;

  function ensureSession(context = null) {
    if (session) return session;
    const nowIso = new Date().toISOString();
    session = {
      sessionId: `music-lab-${nowIso}-${sessionSeq}`,
      startedAtIso: nowIso,
      startedAtMs: nowMs(),
      sequence: sessionSeq,
      context: context && typeof context === 'object' ? { ...context } : {},
      beatsPerBar,
      metricsEveryBars,
      events: [],
      paletteChanges: [],
      pacingChanges: [],
      enemyRemovals: [],
      systemEvents: [],
      systemEventSummary: {
        byType: {},
        rawStoredByType: {},
        rawSuppressedByType: {},
        spawnerPipeline: {
          spawnerGameplayEvents: 0,
          spawnerAudioEvents: 0,
          spawnerAudioMutedEvents: 0,
          spawnerVisualEvents: 0,
          spawnerLoopgridEvents: 0,
          spawnerPipelineMismatches: 0,
        },
        foundationProminence: {
          total: 0,
          full: 0,
          quiet: 0,
          trace: 0,
          suppressed: 0,
          changedByDeconflict: 0,
        },
        slotSpawnerStages: {
          rawPulse: 0,
          rawBackbeat: 0,
          filteredPulse: 0,
          filteredBackbeat: 0,
          shapedPulse: 0,
          shapedBackbeat: 0,
          executedPulse: 0,
          executedBackbeat: 0,
        },
        handoffVisualFailures: {},
      },
      threatBudgetSnapshots: [],
      metricsHistory: [],
      metrics: null,
      sessionSummary: null,
      endedAtIso: null,
    };
    sessionSeq += 1;
    lastMetricsBar = -1;
    return session;
  }

  function recordMetricsCheckpoint(barIndex) {
    if (!realtimeMetricsEnabled) return;
    const s = ensureSession();
    const bar = clampInt(barIndex, 0, 0);
    if (bar < 0) return;
    if (lastMetricsBar >= 0 && bar < (lastMetricsBar + metricsEveryBars)) return;
    const executed = s.events.filter((e) => e?.phase === 'executed' && clampInt(e?.barIndex, 0, 0) <= bar);
    const bundle = computeMetricsForEvents(s, executed, bar);
    s.metricsHistory.push({
      barIndex: bar,
      tMs: nowMs(),
      metrics: bundle.metrics,
      sessionSummary: bundle.sessionSummary,
    });
    lastMetricsBar = bar;
  }

  function resetSession(context = null) {
    session = null;
    lastMetricsBar = -1;
    return ensureSession(context);
  }

  function logEvent(event, phase, context = null) {
    if (!enabled) return null;
    const s = ensureSession(context);
    const rec = makeEventRecord(event, phase, context, beatsPerBar);
    s.events.push(rec);
    recordMetricsCheckpoint(rec.barIndex);
    return rec;
  }

  function logQueuedEvent(event, context = null) {
    return logEvent(event, 'queued', context);
  }

  function logCreatedEvent(event, context = null) {
    return logEvent(event, 'created', context);
  }

  function logExecutedEvent(event, context = null) {
    return logEvent(event, 'executed', context);
  }

  function notePaletteChange(next, context = null) {
    if (!enabled) return null;
    const s = ensureSession(context);
    const snap = next && typeof next === 'object' ? next : {};
    const rec = {
      tMs: nowMs(),
      timestamp: Date.now(),
      barIndex: clampInt(context?.barIndex, 0, 0),
      paletteId: String(snap?.id || '').trim(),
      paletteIndex: clampInt(snap?.paletteIndex, 0, 0),
      themeId: String(snap?.theme || '').trim(),
      roles: snap?.roles && typeof snap.roles === 'object' ? { ...snap.roles } : {},
    };
    s.paletteChanges.push(rec);
    recordMetricsCheckpoint(rec.barIndex);
    return rec;
  }

  function notePacingChange(next, context = null) {
    if (!enabled) return null;
    const s = ensureSession(context);
    const snap = next && typeof next === 'object' ? next : {};
    const rec = {
      tMs: nowMs(),
      timestamp: Date.now(),
      barIndex: clampInt(context?.barIndex, 0, 0),
      state: String(snap?.state || '').trim(),
      stateStartBar: clampInt(snap?.stateStartBar, 0, 0),
      responseMode: String(snap?.responseMode || '').trim(),
      cycle: clampInt(snap?.cycle, 0, 0),
    };
    s.pacingChanges.push(rec);
    recordMetricsCheckpoint(rec.barIndex);
    return rec;
  }

  function noteEnemyRemoval(enemyLike, context = null) {
    if (!enabled) return null;
    const s = ensureSession(context);
    const rec = makeEnemyRemovalRecord(enemyLike, context || {}, beatsPerBar);
    s.enemyRemovals.push(rec);
    recordMetricsCheckpoint(rec.barIndex);
    return rec;
  }

  function noteThreatBudgetSnapshot(snapshot, context = null) {
    if (!enabled) return null;
    const s = ensureSession(context);
    const snap = snapshot && typeof snapshot === 'object' ? snapshot : {};
    const rec = {
      tMs: nowMs(),
      timestamp: Date.now(),
      barIndex: clampInt(context?.barIndex, 0, 0),
      beatIndex: clampInt(context?.beatIndex, 0, 0),
      stepIndex: clampInt(context?.stepIndex, 0, 0),
      energyState: String(snap?.energyState || '').trim().toLowerCase(),
      budgets: snap?.budgets && typeof snap.budgets === 'object' ? { ...snap.budgets } : {},
      usage: snap?.usage && typeof snap.usage === 'object' ? { ...snap.usage } : {},
      remaining: snap?.remaining && typeof snap.remaining === 'object' ? { ...snap.remaining } : {},
      lanePlan: snap?.lanePlan && typeof snap.lanePlan === 'object'
        ? JSON.parse(JSON.stringify(snap.lanePlan))
        : {},
      pressureState: snap?.pressureState && typeof snap.pressureState === 'object'
        ? { ...snap.pressureState }
        : {},
      spawnState: snap?.spawnState && typeof snap.spawnState === 'object'
        ? JSON.parse(JSON.stringify(snap.spawnState))
        : {},
    };
    const last = s.threatBudgetSnapshots.length > 0
      ? s.threatBudgetSnapshots[s.threatBudgetSnapshots.length - 1]
      : null;
    const sameBeat = last
      && clampInt(last?.barIndex, -1, -1) === rec.barIndex
      && clampInt(last?.beatIndex, -1, -1) === rec.beatIndex;
    if (sameBeat) s.threatBudgetSnapshots[s.threatBudgetSnapshots.length - 1] = rec;
    else s.threatBudgetSnapshots.push(rec);
    recordMetricsCheckpoint(rec.barIndex);
    return rec;
  }

  function noteSystemEvent(eventType, payload = null, context = null) {
    if (!enabled) return null;
    const type = String(eventType || '').trim().toLowerCase();
    if (lightweightSystemEventsEnabled && PERF_LIGHTWEIGHT_SYSTEM_EVENT_DROP_TYPES.has(type)) return null;
    const s = ensureSession(context);
    const rec = makeSystemEventRecord(type, payload, context || {}, beatsPerBar);
    if (!rec.eventType) return null;
    summarizeSystemEvent(s, rec);
    const shouldStoreRaw = shouldStoreRawSystemEvent(rec.eventType);
    const summaryBucket = shouldStoreRaw
      ? s.systemEventSummary.rawStoredByType
      : s.systemEventSummary.rawSuppressedByType;
    summaryBucket[rec.eventType] = clampInt(summaryBucket[rec.eventType], 0, 0) + 1;
    if (shouldStoreRaw) s.systemEvents.push(rec);
    recordMetricsCheckpoint(rec.barIndex);
    return rec;
  }

  function exportSession() {
    const s = ensureSession();
    let maxBar = 0;
    for (const ev of s.events) maxBar = Math.max(maxBar, clampInt(ev?.barIndex, 0, 0));
    const executed = s.events.filter((e) => e?.phase === 'executed');
    const bundle = computeMetricsForEvents(s, executed, maxBar);
    s.metrics = bundle.metrics;
    s.sessionSummary = bundle.sessionSummary;
    s.endedAtIso = new Date().toISOString();
    return cloneJson({
      sessionId: s.sessionId,
      startedAtIso: s.startedAtIso,
      endedAtIso: s.endedAtIso,
      beatsPerBar: s.beatsPerBar,
      metricsEveryBars: s.metricsEveryBars,
      eventTimeline: s.events,
      paletteChanges: s.paletteChanges,
      pacingChanges: s.pacingChanges,
      enemyRemovals: s.enemyRemovals,
      systemEvents: s.systemEvents,
      systemEventSummary: s.systemEventSummary,
      threatBudgetSnapshots: s.threatBudgetSnapshots,
      metricsHistory: s.metricsHistory,
      metrics: s.metrics,
      sessionSummary: s.sessionSummary,
    });
  }
  function exportSessionForSave(options = null) {
    const opts = options && typeof options === 'object' ? options : {};
    const compact = opts.compact === true || opts.forceCompact === true;
    const s = ensureSession();
    const sourceEvents = compact && Array.isArray(s.events) ? s.events.slice(-1800) : s.events;
    const sourceSystemEvents = compact && Array.isArray(s.systemEvents) ? s.systemEvents.slice(-500) : s.systemEvents;
    const sourceThreatBudgetSnapshots = compact && Array.isArray(s.threatBudgetSnapshots) ? s.threatBudgetSnapshots.slice(-128) : s.threatBudgetSnapshots;
    const sourceMetricsHistory = compact && Array.isArray(s.metricsHistory) ? s.metricsHistory.slice(-96) : s.metricsHistory;
    const forceFullMetricsForHealthSections = compact
      && Math.max(0, clampInt(s?.systemEventSummary?.countsByType?.music_enemy_health_test_section, 0, 0)) > 0;
    let maxBar = 0;
    const metricsEvents = forceFullMetricsForHealthSections ? s.events : sourceEvents;
    for (const ev of metricsEvents) maxBar = Math.max(maxBar, clampInt(ev?.barIndex, 0, 0));
    const executed = metricsEvents.filter((e) => e?.phase === 'executed');
    const metricsSession = forceFullMetricsForHealthSections
      ? s
      : (compact
      ? {
          ...s,
          events: sourceEvents,
          systemEvents: sourceSystemEvents,
          threatBudgetSnapshots: sourceThreatBudgetSnapshots,
          metricsHistory: sourceMetricsHistory,
        }
      : s);
    const cachedCheckpoint = compact && !forceFullMetricsForHealthSections && Array.isArray(s.metricsHistory) && s.metricsHistory.length
      ? s.metricsHistory[s.metricsHistory.length - 1]
      : null;
    const bundle = cachedCheckpoint?.metrics && cachedCheckpoint?.sessionSummary
      ? {
          metrics: cachedCheckpoint.metrics,
          sessionSummary: cachedCheckpoint.sessionSummary,
        }
      : computeMetricsForEvents(metricsSession, executed, maxBar);
    s.metrics = bundle.metrics;
    s.sessionSummary = bundle.sessionSummary;
    s.endedAtIso = new Date().toISOString();
    return {
      sessionId: String(s.sessionId || ''),
      startedAtIso: String(s.startedAtIso || ''),
      endedAtIso: String(s.endedAtIso || ''),
      beatsPerBar: s.beatsPerBar,
      metricsEveryBars: s.metricsEveryBars,
      eventTimeline: Array.isArray(sourceEvents) ? (compact ? sourceEvents.slice(-900) : sourceEvents.slice()) : [],
      paletteChanges: Array.isArray(s.paletteChanges) ? (compact ? s.paletteChanges.slice(-64) : s.paletteChanges.slice()) : [],
      pacingChanges: Array.isArray(s.pacingChanges) ? (compact ? s.pacingChanges.slice(-64) : s.pacingChanges.slice()) : [],
      enemyRemovals: Array.isArray(s.enemyRemovals) ? (compact ? s.enemyRemovals.slice(-512) : s.enemyRemovals.slice()) : [],
      systemEvents: Array.isArray(sourceSystemEvents) ? (compact ? sourceSystemEvents.slice(-300) : sourceSystemEvents.slice()) : [],
      systemEventSummary: s.systemEventSummary && typeof s.systemEventSummary === 'object'
        ? { ...s.systemEventSummary }
        : {},
      threatBudgetSnapshots: Array.isArray(sourceThreatBudgetSnapshots) ? (compact ? sourceThreatBudgetSnapshots.slice(-96) : sourceThreatBudgetSnapshots.slice()) : [],
      metricsHistory: Array.isArray(sourceMetricsHistory) ? (compact ? sourceMetricsHistory.slice(-64) : sourceMetricsHistory.slice()) : [],
      metrics: s.metrics && typeof s.metrics === 'object' ? { ...s.metrics } : s.metrics,
      sessionSummary: s.sessionSummary && typeof s.sessionSummary === 'object' ? { ...s.sessionSummary } : s.sessionSummary,
      exportMode: compact ? 'save_compact_shallow' : 'save_shallow',
      saveCompact: compact
        ? {
            compacted: true,
            detail: 'api_compact_tail_export',
            originalEventTimelineCount: Array.isArray(s.events) ? s.events.length : 0,
            originalSystemEventCount: Array.isArray(s.systemEvents) ? s.systemEvents.length : 0,
            originalThreatBudgetSnapshotCount: Array.isArray(s.threatBudgetSnapshots) ? s.threatBudgetSnapshots.length : 0,
            originalMetricsHistoryCount: Array.isArray(s.metricsHistory) ? s.metricsHistory.length : 0,
          }
        : undefined,
    };
  }

  function downloadSession(fileName = '') {
    const payload = exportSession();
    if (!payload) return false;
    try {
      const defaultName = `music-lab-results-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = String(fileName || defaultName).trim() || defaultName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      return true;
    } catch {
      return false;
    }
  }

  function setEnabled(next = true) {
    enabled = !!next;
    return enabled;
  }

  function isEnabled() {
    return enabled === true;
  }

  function setRealtimeMetricsEnabled(next = true) {
    realtimeMetricsEnabled = next !== false;
    if (!realtimeMetricsEnabled) lastMetricsBar = -1;
    return realtimeMetricsEnabled;
  }

  function isRealtimeMetricsEnabled() {
    return realtimeMetricsEnabled === true;
  }

  function setLightweightSystemEventsEnabled(next = true) {
    lightweightSystemEventsEnabled = next === true;
    return lightweightSystemEventsEnabled;
  }

  function isLightweightSystemEventsEnabled() {
    return lightweightSystemEventsEnabled === true;
  }

  function getSessionSnapshot() {
    const s = ensureSession();
    return cloneJson(s);
  }

  return {
    resetSession,
    logCreatedEvent,
    logQueuedEvent,
    logExecutedEvent,
    notePaletteChange,
    notePacingChange,
    noteEnemyRemoval,
    noteThreatBudgetSnapshot,
    noteSystemEvent,
    exportSession,
    exportSessionForSave,
    downloadSession,
    setEnabled,
    isEnabled,
    setRealtimeMetricsEnabled,
    isRealtimeMetricsEnabled,
    setLightweightSystemEventsEnabled,
    isLightweightSystemEventsEnabled,
    getSessionSnapshot,
  };
}
