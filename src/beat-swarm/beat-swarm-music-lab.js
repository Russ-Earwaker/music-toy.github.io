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
  const authoringClass = String(context?.authoringClass ?? payload?.authoringClass ?? '').trim().toLowerCase();
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
    authoringClass,
    audioGain: Number(context?.audioGain ?? payload?.audioGain) || 0,
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
  }
}

function shouldStoreRawSystemEvent(eventType) {
  const type = String(eventType || '').trim().toLowerCase();
  if (!type) return false;
  return !SYSTEM_EVENT_SUMMARY_ONLY_TYPES.has(type);
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
  for (const s of snaps) {
    const beatKey = String(clampInt(s?.beatIndex, 0, 0));
    const barKey = String(clampInt(s?.barIndex, 0, 0));
    const usage = s?.usage && typeof s.usage === 'object' ? s.usage : {};
    const budgets = s?.budgets && typeof s.budgets === 'object' ? s.budgets : {};
    perBeat[beatKey] = {
      fullThreats: clampInt(usage?.fullThreats, 0, 0),
      lightThreats: clampInt(usage?.lightThreats, 0, 0),
      audibleAccents: clampInt(usage?.audibleAccents, 0, 0),
      cosmeticParticipants: clampInt(usage?.cosmeticParticipants, 0, 0),
      maxFullThreatsPerBeat: clampInt(budgets?.maxFullThreatsPerBeat, 0, 0),
      maxLightThreatsPerBeat: clampInt(budgets?.maxLightThreatsPerBeat, 0, 0),
      maxAudibleAccentsPerBeat: clampInt(budgets?.maxAudibleAccentsPerBeat, 0, 0),
      maxCosmeticPerBeat: clampInt(budgets?.maxCosmeticPerBeat, 0, 0),
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
  }
  return {
    snapshots: snaps.length,
    perBeat,
    perBar,
  };
}

function collectIntervalProfile(events) {
  const melodic = events
    .filter((ev) => String(ev?.noteResolved || ev?.note || '').trim().length > 0)
    .sort((a, b) => clampInt(a?.timestamp, 0, 0) - clampInt(b?.timestamp, 0, 0));
  const buckets = { repeat: 0, step: 0, smallLeap: 0, largeLeap: 0 };
  let previousMidi = null;
  let compared = 0;
  for (const ev of melodic) {
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
  const smoothShare = compared > 0
    ? (buckets.repeat + buckets.step + buckets.smallLeap) / compared
    : 0;
  return { buckets, compared, smoothShare };
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
    if (!isAudibleEvent(ev)) continue;
    playerAudibleKeys.add(`${clampInt(ev?.beatIndex, 0, 0)}:${clampInt(ev?.stepIndex, 0, 0)}`);
  }
  let enemyAudibleEvents = 0;
  let maskedEnemyEvents = 0;
  for (const ev of events) {
    const src = String(ev?.sourceSystem || '').trim().toLowerCase();
    if (src === 'player') continue;
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
      if (continuityPreserved && !instrumentChanged && !phraseChanged && !patternChanged) {
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
  let harmonyWeaponOutsidePoolBars = 0;
  let harmonyWeaponOutsidePoolCount = 0;
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
      const outsidePoolCount = Math.max(0, clampInt(e?.weaponOutsidePoolCount, 0, 0));
      harmonyWeaponOutsidePoolCount += outsidePoolCount;
      if (outsidePoolCount > 0) harmonyWeaponOutsidePoolBars += 1;
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
    harmonyWeaponOutsidePoolBars,
    harmonyWeaponOutsidePoolCount,
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
    const enemyCompetingDuringPlayer = Math.max(0, clampInt(r?.enemyCompetingDuringPlayer, 0, 0));
    const foregroundShare = enemyEvents > 0 ? (enemyForegroundEvents / enemyEvents) : 0;
    const competitionShare = enemyEvents > 0 ? (enemyCompetingDuringPlayer / enemyEvents) : 0;
    sumMaskingRisk += Number(r?.playerMaskingRisk) || 0;
    sumOverlapRisk += Number(r?.sameRegisterOverlapRisk) || 0;
    sumPlayerAudibleShare += Number(r?.playerAudibleShare) || 0;
    sumEnemyForegroundShare += foregroundShare;
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
  for (let i = 1; i < bassSteps.length; i++) {
    const gap = Math.max(0, bassSteps[i] - bassSteps[i - 1]);
    if (gap > maxBassStepGap) maxBassStepGap = gap;
  }

  const executedSteps = Array.from(new Set(executed.map((ev) => clampInt(ev?.stepIndex, 0, 0))))
    .sort((a, b) => a - b);
  const bassStepSet = new Set(bassSteps);
  let maxEnemyStepsWithoutBass = 0;
  let currentRun = 0;
  for (const step of executedSteps) {
    if (bassStepSet.has(step)) {
      currentRun = 0;
      continue;
    }
    currentRun += 1;
    if (currentRun > maxEnemyStepsWithoutBass) maxEnemyStepsWithoutBass = currentRun;
  }

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
    maxEnemyStepsWithoutBass,
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
  for (const ev of events) {
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
    poolComplianceRate: considered > 0 ? (insidePool / considered) : 1,
  };
}

function collectMotifReuse(events) {
  const melodic = events
    .filter((ev) => String(ev?.noteResolved || ev?.note || '').trim().length > 0)
    .sort((a, b) => clampInt(a?.timestamp, 0, 0) - clampInt(b?.timestamp, 0, 0))
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
  const motifReuseRate = totalWindows > 0 ? (repeatedWindows / totalWindows) : 0;

  return {
    windowsByN,
    repeatedByN,
    uniqueMotifsByN: {
      n2: Object.keys(motifCounts.n2).length,
      n3: Object.keys(motifCounts.n3).length,
      n4: Object.keys(motifCounts.n4).length,
    },
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
  // Prefer that absolute position when present; otherwise fall back to beat-derived.
  if (step >= beatDerived) return step;
  return beatDerived + step;
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
      let responseSize = 1;
      let bestAudibility = audibleWeightForEvent(resp);
      for (let k = j + 1; k < actionable.length; k++) {
        const follow = actionable[k];
        if (String(follow?.callResponseLane || '').trim().toLowerCase() !== 'response') continue;
        const followStep = toAbsStepIndex(follow, options?.stepsPerBeat || 8);
        const followDelta = followStep - callStep;
        if (followDelta <= delta) continue;
        if (followDelta > responseWindowSteps) break;
        if (actorKey(follow) !== respActor) break;
        responseSize += 1;
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
  const deferredLaneChanges = Math.max(0, clampInt(metrics?.passDiagnostics?.ownershipContinuity?.deferredChanges, 0, 0));
  const appliedDeferredLaneChanges = Math.max(0, clampInt(metrics?.passDiagnostics?.ownershipContinuity?.appliedDeferredChanges, 0, 0));
  const replacedDeferredLaneChanges = Math.max(0, clampInt(metrics?.passDiagnostics?.ownershipContinuity?.replacedDeferredChanges, 0, 0));
  const droppedDeferredLaneChanges = Math.max(0, clampInt(metrics?.passDiagnostics?.ownershipContinuity?.droppedDeferredChanges, 0, 0));
  const rejectedDeferredLaneChanges = Math.max(0, clampInt(metrics?.passDiagnostics?.ownershipContinuity?.rejectedDeferredChanges, 0, 0));
  const avgDeferredWaitSteps = Number(metrics?.passDiagnostics?.ownershipContinuity?.avgDeferredWaitSteps) || 0;
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
    readabilityDensity: (avgEnemyCompetitionShare <= 0.2 && avgEnemyForegroundShare <= 0.35) ? 'clear' : 'busy',
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
      && sameContinuityPatternDrift === 0
      && resetLaneHandoffs === 0
    ) ? 'stable' : 'drift',
    ownershipContinuity: (resetLaneHandoffs === 0 && sameContinuityInstrumentDrift === 0 && sameContinuityPatternDrift === 0)
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
  };
}

function computeMetricsForEvents(session, executedEvents, maxBarIndex) {
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
  const createdEvents = (Array.isArray(session?.events) ? session.events : [])
    .filter((e) => String(e?.phase || '').trim().toLowerCase() === 'created' && clampInt(e?.barIndex, 0, 0) <= maxBarIndex);
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
  const readabilityStructureOnboarding = collectReadabilityStructureOnboarding(session, maxBarIndex);
  const grooveStability = collectGrooveStability(executedEvents, sectionStability);
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
  const metrics = {
    notePoolCompliance,
    pitchEntropy,
    intervalProfile,
    melodicContour,
    motifReuse,
    motifPersistence,
    phraseGravity,
    laneCompliance,
    roleBalance,
    threatBalance,
    threatBudgetUsage,
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
    harmonyWeaponOutsidePoolBars: Number(passDiagnostics?.decisionMaking?.harmonyWeaponOutsidePoolBars) || 0,
    harmonyWeaponOutsidePoolCount: Number(passDiagnostics?.decisionMaking?.harmonyWeaponOutsidePoolCount) || 0,
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
    sectionStability,
    sectionPresentation,
    readability: readabilityStructureOnboarding.readability,
    structure: readabilityStructureOnboarding.structure,
    onboarding: readabilityStructureOnboarding.onboarding,
    grooveStability,
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
  };
  return {
    metrics,
    sessionSummary: computeSummary(metrics),
  };
}

export function createBeatSwarmMusicLab(options = null) {
  const beatsPerBar = Math.max(1, clampInt(options?.beatsPerBar, DEFAULT_BEATS_PER_BAR, 1));
  const metricsEveryBars = Math.max(1, clampInt(options?.metricsEveryBars, DEFAULT_METRICS_EVERY_BARS, 1));
  let enabled = true;
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
    const s = ensureSession(context);
    const rec = makeSystemEventRecord(eventType, payload, context || {}, beatsPerBar);
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
    downloadSession,
    setEnabled,
    getSessionSnapshot,
  };
}
