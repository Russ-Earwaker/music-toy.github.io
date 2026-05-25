import { classifyBeatSwarmPerformedAction } from './beat-swarm-action-categories.js';

export function executePerformedBeatEventRuntime(options = null) {
  const ev = options?.event && typeof options.event === 'object' ? options.event : null;
  if (!ev) return false;
  let actionType = String(ev.actionType || '').trim().toLowerCase();
  if (!actionType) return false;

  const constants = options?.constants && typeof options.constants === 'object' ? options.constants : {};
  const helpers = options?.helpers && typeof options.helpers === 'object' ? options.helpers : {};
  const state = options?.state && typeof options.state === 'object' ? options.state : {};
  const getPerfNow = (() => {
    try {
      if (typeof performance !== 'undefined' && typeof performance.now === 'function') return () => performance.now();
    } catch {}
    return () => Date.now();
  })();
  const recordPerfSample = typeof helpers.recordStepEventsPerfSample === 'function'
    ? helpers.recordStepEventsPerfSample
    : null;
  const withPerfSample = (name, fn) => {
    if (typeof fn !== 'function') return undefined;
    if (typeof recordPerfSample !== 'function') return fn();
    const startedAt = getPerfNow();
    try {
      return fn();
    } finally {
      recordPerfSample(name, Math.max(0, getPerfNow() - startedAt));
    }
  };

  const beatIndex = Math.max(0, Math.trunc(Number(ev.beatIndex) || 0));
  const stepIndex = Math.max(0, Math.trunc(Number(ev.stepIndex) || 0));
  const barIndex = Math.floor(beatIndex / Math.max(1, Math.trunc(Number(constants.composerBeatsPerBar) || 4)));
  const playerStepLikelyAudible = helpers.isPlayerWeaponStepLikelyAudible?.(stepIndex) === true;
  const actionClassification = classifyBeatSwarmPerformedAction(ev, ev?.payload || null);
  const musicModeRuntime = state.musicModeRuntime && typeof state.musicModeRuntime === 'object'
    ? state.musicModeRuntime
    : null;
  const activeMusicMode = String(musicModeRuntime?.activeMusicMode || '').trim().toLowerCase();
  const primaryLoopForegroundProtected = activeMusicMode === 'lead_entry_merge' || activeMusicMode === 'full_texture';
  const isCombatFeedbackAction = (eventLike = null) => {
    const event = eventLike && typeof eventLike === 'object' ? eventLike : {};
    const payload = event?.payload && typeof event.payload === 'object' ? event.payload : {};
    const action = String(event?.actionType || eventLike || '').trim().toLowerCase();
    const source = String(payload?.sourceSystem || event?.sourceSystem || '').trim().toLowerCase();
    const authoringClass = String(payload?.authoringClass || event?.authoringClass || '').trim().toLowerCase();
    if (!action) return false;
    if (source === 'player' || source === 'death') return true;
    if (authoringClass === 'gameplayauthored') return true;
    if (authoringClass === 'musicauthored') return false;
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
  };
  const inferInstrumentLaneFromCatalogId = typeof helpers.inferInstrumentLaneFromCatalogId === 'function'
    ? helpers.inferInstrumentLaneFromCatalogId
    : ((_, fallbackLane = 'lead') => String(fallbackLane || 'lead').trim().toLowerCase() || 'lead');
  const getInstrumentPlaybackMetadata = typeof helpers.getInstrumentPlaybackMetadata === 'function'
    ? helpers.getInstrumentPlaybackMetadata
    : (() => null);
  const payloadGroupId = Math.max(0, Math.trunc(Number(ev?.payload?.groupId) || 0));
  const getCurrentLevel1Contract = () => {
    try {
      const plan = helpers.getDirectorLanePlanForBar?.(barIndex) || helpers.getDirectorLanePlan?.() || null;
      return plan?.__level1Contract && typeof plan.__level1Contract === 'object'
        ? plan.__level1Contract
        : null;
    } catch {
      return null;
    }
  };
  const normalizeIntensityStage = (stageLike = '') => {
    const raw = String(stageLike || '').trim().toLowerCase();
    if (raw === 'intro' || raw === 'silent' || raw === 'low' || raw === 'medium' || raw === 'build' || raw === 'peak' || raw === 'release' || raw === 'settle') return raw;
    return '';
  };
  const getCurrentArrangementState = () => {
    try {
      const plan = helpers.getDirectorLanePlanForBar?.(barIndex) || helpers.getDirectorLanePlan?.() || null;
      if (plan?.__arrangementState && typeof plan.__arrangementState === 'object') return plan.__arrangementState;
    } catch {}
    return musicModeRuntime?.level1ArrangementState && typeof musicModeRuntime.level1ArrangementState === 'object'
      ? musicModeRuntime.level1ArrangementState
      : null;
  };
  const getCurrentIntensityStage = () => normalizeIntensityStage(getCurrentArrangementState()?.intensityAuditionSection);
  const isContractBlockedOrnamentExecution = (base = null, enemyLike = null, groupLike = null) => {
    const contract = getCurrentLevel1Contract();
    if (!contract) return false;
    const payload = ev?.payload && typeof ev.payload === 'object' ? ev.payload : {};
    const ctx = base && typeof base === 'object' ? base : {};
    const enemy = enemyLike && typeof enemyLike === 'object' ? enemyLike : null;
    const group = groupLike && typeof groupLike === 'object' ? groupLike : null;
    const sourceSystem = String(ctx?.sourceSystem || payload?.sourceSystem || ev?.sourceSystem || '').trim().toLowerCase();
    if (sourceSystem && sourceSystem !== 'group') return false;
    const laneId = String(ctx?.musicLaneId || payload?.musicLaneId || enemy?.musicLaneId || group?.musicLaneId || '').trim().toLowerCase();
    const layer = String(ctx?.musicLayer || payload?.musicLayer || group?.musicLaneLayer || '').trim().toLowerCase();
    const voiceKey = String(ctx?.musicVoiceKey || payload?.musicVoiceKey || '').trim().toLowerCase();
    const callResponseLane = String(ctx?.callResponseLane || payload?.callResponseLane || enemy?.callResponseLane || group?.callResponseLane || '').trim().toLowerCase();
    const profile = String(ctx?.musicProfileSourceType || payload?.musicProfileSourceType || enemy?.musicProfileSourceType || group?.musicProfileSourceType || '').trim().toLowerCase();
    if (payload?.directorAuthorizedAnswerOrnament === true) return false;
    const ornamentLike = laneId === 'sparkle_lane'
      || layer === 'sparkle'
      || voiceKey === 'answer_ornament'
      || callResponseLane === 'response'
      || profile === 'answer_ornament';
    if (!ornamentLike) return false;
    return contract.allowSparkle !== true || contract.contractAnswerActive !== true;
  };
  const noteContractBlockedOrnamentExecution = (phase, base = null, enemyLike = null, groupLike = null) => {
    try {
      const payload = ev?.payload && typeof ev.payload === 'object' ? ev.payload : {};
      const ctx = base && typeof base === 'object' ? base : {};
      const enemy = enemyLike && typeof enemyLike === 'object' ? enemyLike : null;
      const group = groupLike && typeof groupLike === 'object' ? groupLike : null;
      const contract = getCurrentLevel1Contract();
      helpers.noteMusicSystemEvent?.('music_contract_ornament_blocked', {
        phase: String(phase || '').trim().toLowerCase(),
        beatIndex,
        stepIndex,
        barIndex,
        allowSparkle: contract?.allowSparkle === true,
        contractAnswerActive: contract?.contractAnswerActive === true,
        musicLaneId: String(ctx?.musicLaneId || payload?.musicLaneId || enemy?.musicLaneId || group?.musicLaneId || '').trim().toLowerCase(),
        musicLayer: String(ctx?.musicLayer || payload?.musicLayer || group?.musicLaneLayer || '').trim().toLowerCase(),
        musicVoiceKey: String(ctx?.musicVoiceKey || payload?.musicVoiceKey || '').trim().toLowerCase(),
        callResponseLane: String(ctx?.callResponseLane || payload?.callResponseLane || enemy?.callResponseLane || group?.callResponseLane || '').trim().toLowerCase(),
        musicProfileSourceType: String(ctx?.musicProfileSourceType || payload?.musicProfileSourceType || enemy?.musicProfileSourceType || group?.musicProfileSourceType || '').trim().toLowerCase(),
        actionType,
        actionCategory: String(actionClassification.actionCategory || '').trim().toLowerCase(),
        audioRequired: actionClassification.audioRequired === true,
        classificationReason: String(actionClassification.classificationReason || '').trim().toLowerCase(),
      }, { beatIndex, stepIndex, barIndex });
    } catch {}
  };
  const logMusicLabExecution = (context = null) => {
    const base = context && typeof context === 'object' ? context : {};
    const payload = ev?.payload && typeof ev.payload === 'object' ? ev.payload : {};
    const sourceEnemyId = Math.max(0, Math.trunc(Number(ev?.actorId) || 0));
    const sourceEnemy = sourceEnemyId > 0 ? helpers.getSwarmEnemyById?.(sourceEnemyId) : null;
    const sourceGroup = sourceEnemy ? helpers.getEnemyMusicGroup?.(sourceEnemy, undefined, { sync: false }) : null;
    if (isContractBlockedOrnamentExecution(base, sourceEnemy, sourceGroup)) {
      noteContractBlockedOrnamentExecution('log_execution', base, sourceEnemy, sourceGroup);
      return;
    }
    try {
      state.swarmMusicLab?.logExecutedEvent?.(ev, helpers.getMusicLabContext?.({
        beatIndex,
        stepIndex,
        barIndex,
        groupId: payloadGroupId,
        actionCategory: String(base?.actionCategory || payload?.actionCategory || actionClassification.actionCategory || '').trim().toLowerCase(),
        audioRequired: base?.audioRequired === true || payload?.audioRequired === true || actionClassification.audioRequired === true,
        classificationReason: String(base?.classificationReason || payload?.classificationReason || actionClassification.classificationReason || '').trim().toLowerCase(),
        callResponseLane: String(base?.callResponseLane || payload?.callResponseLane || '').trim().toLowerCase(),
        musicLaneId: String(base?.musicLaneId || payload?.musicLaneId || '').trim().toLowerCase(),
        musicLayer: String(base?.musicLayer || payload?.musicLayer || '').trim().toLowerCase(),
        musicVoiceKey: String(base?.musicVoiceKey || payload?.musicVoiceKey || '').trim().toLowerCase(),
        musicProminence: String(base?.musicProminence || payload?.musicProminence || '').trim().toLowerCase(),
        musicProfileSourceType: String(base?.musicProfileSourceType || payload?.musicProfileSourceType || '').trim().toLowerCase(),
        musicLanePhraseId: String(base?.musicLanePhraseId || payload?.musicLanePhraseId || '').trim().toLowerCase(),
        musicLanePatternKey: String(base?.musicLanePatternKey || payload?.musicLanePatternKey || '').trim().toLowerCase(),
        musicLanePlayerThemeSource: String(base?.musicLanePlayerThemeSource || payload?.musicLanePlayerThemeSource || '').trim(),
        intensityAuditionSection: String(base?.intensityAuditionSection || payload?.intensityAuditionSection || getCurrentIntensityStage() || '').trim().toLowerCase(),
        callResponseQualified: base?.callResponseQualified === true
          ? true
          : (base?.callResponseQualified === false
            ? false
            : (payload?.callResponseQualified === true
              ? true
              : (payload?.callResponseQualified === false ? false : null))),
        callResponsePhraseProgress: Math.max(
          0,
          Math.trunc(Number(
            base?.callResponsePhraseProgress != null
              ? base.callResponsePhraseProgress
              : payload?.callResponsePhraseProgress
          ) || 0)
        ),
        foundationPhraseId: String(
          base?.foundationPhraseId
            || payload?.foundationPhraseId
            || sourceGroup?.foundationPhraseId
            || sourceEnemy?.foundationPhraseId
            || ''
        ).trim().toLowerCase(),
        foundationPatternKey: String(
          base?.foundationPatternKey
            || payload?.foundationPatternKey
            || sourceGroup?.foundationPatternKey
            || sourceEnemy?.foundationPatternKey
            || ''
        ).trim().toLowerCase(),
        foundationPlayerThemeSource: String(
          base?.foundationPlayerThemeSource
            || payload?.foundationPlayerThemeSource
            || sourceGroup?.foundationPlayerThemeSource
            || sourceEnemy?.foundationPlayerThemeSource
            || ''
        ).trim(),
        foundationRawPatternKey: String(
          base?.foundationRawPatternKey
            || payload?.foundationRawPatternKey
            || sourceGroup?.foundationRawPatternKey
            || sourceEnemy?.foundationRawPatternKey
            || ''
        ).trim().toLowerCase(),
        foundationShapedPatternKey: String(
          base?.foundationShapedPatternKey
            || payload?.foundationShapedPatternKey
            || sourceGroup?.foundationShapedPatternKey
            || sourceEnemy?.foundationShapedPatternKey
            || ''
        ).trim().toLowerCase(),
        foundationInterpretationMode: String(
          base?.foundationInterpretationMode
            || payload?.foundationInterpretationMode
            || sourceGroup?.foundationInterpretationMode
            || sourceEnemy?.foundationInterpretationMode
            || ''
        ).trim().toLowerCase(),
        foundationPhrasePartIndex: Math.max(0, Math.trunc(Number(
          base?.foundationPhrasePartIndex
            ?? payload?.foundationPhrasePartIndex
            ?? sourceGroup?.foundationPhrasePartIndex
            ?? sourceEnemy?.foundationPhrasePartIndex
        ) || 0)),
        leadFamily: String(
          base?.leadFamily
            || payload?.leadFamily
            || sourceGroup?.leadFamily
            || sourceEnemy?.leadFamily
            || ''
        ).trim().toLowerCase(),
        leadContourId: String(
          base?.leadContourId
            || payload?.leadContourId
            || sourceGroup?.leadContourId
            || sourceEnemy?.leadContourId
            || ''
        ).trim().toLowerCase(),
        leadContourEpoch: Math.max(0, Math.trunc(Number(
          base?.leadContourEpoch
            ?? payload?.leadContourEpoch
            ?? sourceGroup?.leadContourEpoch
            ?? sourceEnemy?.leadContourEpoch
        ) || 0)),
        leadCadenceVariant: Math.max(0, Math.trunc(Number(
          base?.leadCadenceVariant
            ?? payload?.leadCadenceVariant
            ?? sourceGroup?.leadCadenceVariant
            ?? sourceEnemy?.leadCadenceVariant
        ) || 0)),
        sectionTransitionRole: String(
          base?.sectionTransitionRole
            || payload?.sectionTransitionRole
            || sourceGroup?.sectionTransitionRole
            || sourceEnemy?.sectionTransitionRole
            || ''
        ).trim().toLowerCase(),
        sectionArcEpoch: Math.max(0, Math.trunc(Number(
          base?.sectionArcEpoch
            ?? payload?.sectionArcEpoch
            ?? sourceGroup?.sectionArcEpoch
            ?? sourceEnemy?.sectionArcEpoch
        ) || 0)),
        ...base,
      }));
    } catch {}
  };
  const buildLeadThemeExecutionContext = (groupLike = null, enemyLike = null) => {
    const payload = ev?.payload && typeof ev.payload === 'object' ? ev.payload : {};
    const group = groupLike && typeof groupLike === 'object' ? groupLike : null;
    const enemy = enemyLike && typeof enemyLike === 'object' ? enemyLike : null;
    const laneId = String(payload?.musicLaneId || group?.musicLaneId || enemy?.musicLaneId || '').trim().toLowerCase();
    if (laneId !== 'primary_loop_lane') return {};
    const existingThemeSource = String(payload?.leadPlayerThemeSource || group?.leadPlayerThemeSource || enemy?.leadPlayerThemeSource || '').trim();
    const existingMode = String(payload?.leadThemeInterpretationMode || group?.leadThemeInterpretationMode || enemy?.leadThemeInterpretationMode || '').trim().toLowerCase();
    if (existingThemeSource || existingMode) {
      return {
        leadPlayerThemeSource: existingThemeSource,
        leadThemeInterpretationMode: existingMode,
        leadThemePartIndex: Math.max(0, Math.trunc(Number(payload?.leadThemePartIndex ?? group?.leadThemePartIndex ?? enemy?.leadThemePartIndex) || 0)),
        leadThemeStepIndex: Math.max(0, Math.trunc(Number(payload?.leadThemeStepIndex ?? group?.leadThemeStepIndex ?? enemy?.leadThemeStepIndex) || 0)),
        leadThemePatternKey: String(payload?.leadThemePatternKey || group?.leadThemePatternKey || enemy?.leadThemePatternKey || '').trim().toLowerCase(),
        leadThemeContourKey: String(payload?.leadThemeContourKey || group?.leadThemeContourKey || enemy?.leadThemeContourKey || '').trim().toLowerCase(),
        leadThemeRawStepActive: payload?.leadThemeRawStepActive === true || group?.leadThemeRawStepActive === true || enemy?.leadThemeRawStepActive === true,
        leadThemeRawNote: String(payload?.leadThemeRawNote || group?.leadThemeRawNote || enemy?.leadThemeRawNote || '').trim(),
      };
    }
    const section = getCurrentIntensityStage();
    const leadThemeStep = typeof helpers.getPlayerLeadThemePrimaryStep === 'function'
      ? helpers.getPlayerLeadThemePrimaryStep(barIndex, stepIndex, section)
      : null;
    if (!leadThemeStep || typeof leadThemeStep !== 'object') return {};
    return {
      leadPlayerThemeSource: 'leadTheme',
      leadThemeInterpretationMode: String(leadThemeStep.interpretationMode || '').trim().toLowerCase(),
      leadThemePartIndex: Math.max(0, Math.trunc(Number(leadThemeStep.phrasePartIndex) || 0)),
      leadThemeStepIndex: Math.max(0, Math.trunc(Number(leadThemeStep.step) || 0)),
      leadThemePatternKey: String(leadThemeStep.patternKey || '').trim().toLowerCase(),
      leadThemeContourKey: String(leadThemeStep.contourKey || '').trim().toLowerCase(),
      leadThemeRawStepActive: leadThemeStep.active === true,
      leadThemeRawNote: String(leadThemeStep.rawNote || '').trim(),
    };
  };
  const executionInstrumentRuntime = state.executionInstrumentRuntime && typeof state.executionInstrumentRuntime === 'object'
    ? state.executionInstrumentRuntime
    : (state.executionInstrumentRuntime = { bySourceKey: new Map() });
  if (!(executionInstrumentRuntime.bySourceKey instanceof Map)) executionInstrumentRuntime.bySourceKey = new Map();
  const noteExecutedInstrumentChange = (instrumentIdLike, enemyLike = null, groupLike = null) => {
    const instrumentId = String(instrumentIdLike || '').trim();
    if (!instrumentId) return;
    const enemy = enemyLike && typeof enemyLike === 'object' ? enemyLike : null;
    const group = groupLike && typeof groupLike === 'object' ? groupLike : null;
    const payload = ev?.payload && typeof ev.payload === 'object' ? ev.payload : {};
    const continuityId = String(
      payload?.continuityId
        || group?.musicLaneContinuityId
        || group?.continuityId
        || enemy?.musicLaneContinuityId
        || enemy?.musicContinuityId
        || enemy?.continuityId
        || ''
    ).trim();
    const laneId = String(payload?.musicLaneId || payload?.foundationLaneId || '').trim().toLowerCase();
    const groupId = Math.max(0, Math.trunc(Number(group?.id) || Number(payload?.groupId) || 0));
    const actorId = Math.max(0, Math.trunc(Number(enemy?.id) || Number(ev?.actorId) || 0));
    const sourceKey = String(
      (laneId === 'foundation_lane' || laneId === 'primary_loop_lane')
        ? `lane:${laneId}`
        : (continuityId
          ? `continuity:${continuityId}`
          : (groupId > 0 ? `group:${groupId}` : (actorId > 0 ? `actor:${actorId}` : '')))
    ).trim().toLowerCase();
    if (!sourceKey) return;
    const laneScope = (() => {
      if (laneId === 'foundation_lane' || laneId === 'primary_loop_lane') return 'protected_lane';
      const bufferSection = String(group?.sectionId || group?.sectionKey || '').trim().toLowerCase();
      if (bufferSection === 'foundation-buffer') return 'buffer_takeover';
      const musicLayer = String(payload?.musicLayer || '').trim().toLowerCase();
      if (musicLayer === 'loops') return 'support_lane';
      return 'unscoped';
    })();
    const identityChangeReason = String(
      payload?.identityChangeReason
        || group?.musicLaneIdentityChangeReason
        || enemy?.musicLaneIdentityChangeReason
        || ''
    ).trim().toLowerCase();
    const sectionId = String(
      payload?.sectionId
        || group?.sectionId
        || group?.sectionKey
        || enemy?.sectionId
        || ''
    ).trim().toLowerCase();
    const motifScopeKey = String(
      payload?.motifScopeKey
        || group?.motifScopeKey
        || enemy?.motifScopeKey
        || ''
    ).trim().toLowerCase();
    const lifecycleState = String(
      payload?.lifecycleState
        || group?.lifecycleState
        || enemy?.lifecycleState
        || ''
    ).trim().toLowerCase();
    const previous = executionInstrumentRuntime.bySourceKey.get(sourceKey) || null;
    const continuityClass = previous
      ? (
        previous.continuityId && continuityId
          ? (previous.continuityId === continuityId ? 'same_continuity' : 'new_continuity')
          : 'unknown'
      )
      : 'first_seen';
    if (previous && previous.instrumentId && previous.instrumentId !== instrumentId) {
      const cause = (() => {
        if (identityChangeReason === 'reorchestrate_lane') return 'explicit_reorchestration';
        if (identityChangeReason === 'continuity_reset') return 'continuity_reset';
        if (previous.actorId > 0 && actorId > 0 && previous.actorId !== actorId) return 'performer_change';
        if (previous.groupId > 0 && groupId > 0 && previous.groupId !== groupId) return 'group_change';
        if (previous.sectionId && sectionId && previous.sectionId !== sectionId) return 'section_change';
        if (previous.motifScopeKey && motifScopeKey && previous.motifScopeKey !== motifScopeKey) return 'motif_scope_change';
        if (previous.lifecycleState === 'retiring' || lifecycleState === 'retiring') return 'retiring_owner';
        if (identityChangeReason === 'section_restatement') return 'section_restatement';
        if (identityChangeReason === 'phrase_boundary_mutation') return 'phrase_boundary_mutation';
        return 'unknown';
      })();
      try {
        helpers.noteMusicSystemEvent?.('music_execution_instrument_change', {
          actorId,
          enemyId: actorId,
          enemyType: String(enemy?.enemyType || ev?.enemyType || '').trim().toLowerCase(),
          groupId,
          continuityId,
          previousContinuityId: String(previous.continuityId || '').trim(),
          instrumentId,
          previousInstrumentId: String(previous.instrumentId || '').trim(),
          laneId,
          role: String(ev?.role || group?.role || '').trim().toLowerCase(),
          actionType,
          reason: 'execution_playback_change',
          continuityClass,
          laneScope,
          sourceKey,
          identityChangeReason,
          sectionId,
          motifScopeKey,
          lifecycleState,
          previousActorId: Math.max(0, Math.trunc(Number(previous.actorId) || 0)),
          previousGroupId: Math.max(0, Math.trunc(Number(previous.groupId) || 0)),
          previousSectionId: String(previous.sectionId || '').trim().toLowerCase(),
          previousMotifScopeKey: String(previous.motifScopeKey || '').trim().toLowerCase(),
          previousLifecycleState: String(previous.lifecycleState || '').trim().toLowerCase(),
          cause,
        }, {
          beatIndex,
          stepIndex,
          barIndex,
          continuityId,
        });
      } catch {}
    }
    executionInstrumentRuntime.bySourceKey.set(sourceKey, {
      continuityId,
      instrumentId,
      lastBeatIndex: beatIndex,
      lastStepIndex: stepIndex,
      laneScope,
      actorId,
      groupId,
      sectionId,
      motifScopeKey,
      lifecycleState,
    });
  };
  const resolveContinuitySafeExecutionInstrument = (
    requestedInstrumentLike,
    enemyLike = null,
    groupLike = null,
    fallbackInstrumentLike = ''
  ) => {
    const enemy = enemyLike && typeof enemyLike === 'object' ? enemyLike : null;
    const group = groupLike && typeof groupLike === 'object' ? groupLike : null;
    const requestedInstrumentId = String(requestedInstrumentLike || '').trim();
    const fallbackInstrumentId = String(fallbackInstrumentLike || '').trim();
    const payload = ev?.payload && typeof ev.payload === 'object' ? ev.payload : {};
    const identityChangeReason = String(
      payload?.identityChangeReason
        || group?.musicLaneIdentityChangeReason
        || enemy?.musicLaneIdentityChangeReason
        || ''
    ).trim().toLowerCase();
    const allowRequestedRewrite = (
      identityChangeReason === 'reorchestrate_lane'
      || identityChangeReason === 'continuity_reset'
    );
    const eventContinuityId = String(
      payload?.continuityId
        || ev?.continuityId
        || ''
    ).trim();
    const liveContinuityId = String(
      group?.musicLaneContinuityId
        || group?.continuityId
        || enemy?.musicLaneContinuityId
        || enemy?.musicContinuityId
        || enemy?.continuityId
        || ''
    ).trim();
    const sameContinuity = !!eventContinuityId && !!liveContinuityId && eventContinuityId === liveContinuityId;
    const lockedLiveInstrumentId = String(
      group?.musicLaneInstrumentId
        || enemy?.musicLaneInstrumentId
        || group?.instrumentId
        || enemy?.musicInstrumentId
        || enemy?.instrumentId
        || ''
    ).trim();
    if (!allowRequestedRewrite && sameContinuity && lockedLiveInstrumentId) {
      return lockedLiveInstrumentId;
    }
    return requestedInstrumentId || lockedLiveInstrumentId || fallbackInstrumentId;
  };
  const shouldPersistExecutionInstrumentRewrite = (enemyLike = null, groupLike = null) => {
    const enemy = enemyLike && typeof enemyLike === 'object' ? enemyLike : null;
    const group = groupLike && typeof groupLike === 'object' ? groupLike : null;
    const payload = ev?.payload && typeof ev.payload === 'object' ? ev.payload : {};
    const identityChangeReason = String(
      payload?.identityChangeReason
        || group?.musicLaneIdentityChangeReason
        || enemy?.musicLaneIdentityChangeReason
        || ''
    ).trim().toLowerCase();
    if (identityChangeReason === 'reorchestrate_lane' || identityChangeReason === 'continuity_reset') {
      return true;
    }
    const eventContinuityId = String(payload?.continuityId || ev?.continuityId || '').trim();
    const liveContinuityId = String(
      group?.musicLaneContinuityId
        || group?.continuityId
        || enemy?.musicLaneContinuityId
        || enemy?.musicContinuityId
        || enemy?.continuityId
        || ''
    ).trim();
    return !(eventContinuityId && liveContinuityId && eventContinuityId === liveContinuityId);
  };
  const resolveMusicProminenceGain = (raw) => {
    const key = String(raw || '').trim().toLowerCase();
    const entryAudibilityGrace = ev?.payload?.entryAudibilityGrace === true;
    const traceGainBase = Math.max(0, Math.min(1, Number(constants.supportTraceGain) || 0.24));
    const quietGainBase = Math.max(traceGainBase, Math.min(1, Number(constants.supportQuietGain) || 0.52));
    const traceGain = entryAudibilityGrace
      ? Math.max(traceGainBase, Math.min(1, traceGainBase * Math.max(1, Number(constants.entryAudibilityTraceGainMult) || 1.35)))
      : traceGainBase;
    const quietGain = entryAudibilityGrace
      ? Math.max(quietGainBase, Math.min(1, quietGainBase * Math.max(1, Number(constants.entryAudibilityQuietGainMult) || 1.18)))
      : quietGainBase;
    if (key === 'suppressed') return 0;
    if (key === 'trace') return traceGain;
    if (key === 'quiet') return quietGain;
    return 1;
  };
  const isMaskingAudibleProminence = (raw) => {
    const key = String(raw || '').trim().toLowerCase();
    return key === 'full' || key === 'quiet';
  };
  const normalizeEnemyProminenceForPlayerStep = (raw) => {
    const key = String(raw || '').trim().toLowerCase() || 'full';
    const entryAudibilityGrace = ev?.payload?.entryAudibilityGrace === true;
    const eventLaneId = String(ev?.payload?.musicLaneId || '').trim().toLowerCase();
    const intensitySection = String(ev?.payload?.intensityAuditionSection || '').trim().toLowerCase();
    const leadThemeMode = String(ev?.payload?.leadThemeInterpretationMode || '').trim().toLowerCase();
    const continuityId = String(ev?.payload?.continuityId || '').trim().toLowerCase();
    if (!playerStepLikelyAudible) return key;
    if (actionType === 'player-weapon-step') return key;
    const eventLayer = String(ev?.payload?.musicLayer || '').trim().toLowerCase();
    if (eventLayer === 'foundation') return key;
    if (
      intensitySection === 'release'
      && eventLaneId === 'primary_loop_lane'
      && (leadThemeMode === 'release_riff' || continuityId === 'player-lead-theme-direct')
    ) {
      return key;
    }
    if (primaryLoopForegroundProtected && eventLaneId === 'primary_loop_lane') {
      return key === 'suppressed' ? 'suppressed' : 'full';
    }
    if (entryAudibilityGrace && (key === 'trace' || key === 'quiet')) return 'quiet';
    // During player-audible steps, keep enemy voices present but ducked (quiet) instead of muting to trace.
    if (key === 'full') return 'quiet';
    if (key === 'quiet') return 'quiet';
    return key;
  };
  const normalizeBassRegister = (noteLike, fallback = 'C3') => {
    const src = String(noteLike || '').trim();
    const m = /^([A-Ga-g])([#b]?)(-?\d+)$/.exec(src);
    if (!m) return String(fallback || 'C3').trim() || 'C3';
    const letter = String(m[1] || '').toUpperCase();
    const accidental = String(m[2] || '');
    const semitoneBase = (
      letter === 'C' ? 0
        : letter === 'D' ? 2
          : letter === 'E' ? 4
            : letter === 'F' ? 5
              : letter === 'G' ? 7
                : letter === 'A' ? 9
                  : 11
    );
    const accidentalDelta = accidental === '#' ? 1 : (accidental === 'b' ? -1 : 0);
    const pitchClass = Math.max(0, Math.min(11, semitoneBase + accidentalDelta));
    let clamped = Math.trunc(Number(m[3]) || 3);
    while (clamped > 2 && (clamped > 3 || (clamped === 3 && pitchClass > 2))) clamped -= 1;
    while (clamped < 2) clamped += 1;
    return `${letter}${accidental}${clamped}`;
  };
  const buildPlaybackLoggingContext = (instrumentIdLike, triggerVolumeLike) => {
    const meta = getInstrumentPlaybackMetadata(instrumentIdLike) || null;
    const triggerVolume = Math.max(0, Number(triggerVolumeLike) || 0);
    const sampleVolumeMultiplier = Math.max(0.0001, Number(meta?.sampleVolumeMultiplier) || 1);
    return {
      resolvedPlaybackInstrumentId: String(meta?.instrumentId || instrumentIdLike || '').trim(),
      playbackKind: String(meta?.playbackKind || '').trim().toLowerCase(),
      sampleVolumeHint: String(meta?.sampleVolumeHint || '').trim(),
      sampleVolumeMultiplier,
      triggerVolume,
      approxPlaybackVolume: triggerVolume * sampleVolumeMultiplier,
    };
  };
  const enemyForAction = helpers.getSwarmEnemyById?.(ev.actorId) || null;
  const composerEnemyGroups = Array.isArray(state?.composerEnemyGroups) ? state.composerEnemyGroups : [];
  const noteSlotSpawnerExecutionReason = (enemyLike, payload = null) => {
    const enemy = enemyLike && typeof enemyLike === 'object' ? enemyLike : null;
    const musicVoiceKey = String(enemy?.musicVoiceKey || ev?.payload?.musicVoiceKey || '').trim().toLowerCase();
    if (!musicVoiceKey) return;
    try {
      helpers.noteMusicSystemEvent?.('music_slot_spawner_execution_reason', {
        actorId: Math.max(0, Math.trunc(Number(enemy?.id || ev?.actorId) || 0)),
        groupId: Math.max(0, Math.trunc(Number(ev?.payload?.groupId) || 0)),
        musicVoiceKey,
        musicLayer: String(ev?.payload?.musicLayer || '').trim().toLowerCase(),
        continuityId: String(enemy?.musicContinuityId || enemy?.continuityId || '').trim(),
        reason: String(payload?.reason || '').trim().toLowerCase(),
        failureReason: String(payload?.failureReason || '').trim().toLowerCase(),
        instrumentId: String(payload?.instrumentId || '').trim(),
        phase: String(payload?.phase || '').trim().toLowerCase(),
      }, { beatIndex, stepIndex, barIndex });
    } catch {}
  };
  if (actionType === 'projectile' && enemyForAction) {
    const enemyType = String(enemyForAction?.enemyType || '').trim().toLowerCase();
    if (enemyType === 'spawner') actionType = 'spawner-spawn';
    else if (enemyType === 'drawsnake') actionType = 'drawsnake-projectile';
    else if (enemyType === 'composer-group-member') actionType = 'composer-group-projectile';
  }

  if (actionType === 'spawner-spawn') {
    return withPerfSample('pickupsCombat.weaponRuntime.stepChange.processEvents.execute.spawner', () => {
    const enemy = helpers.getSwarmEnemyById?.(ev.actorId);
    if (!enemy || String(enemy?.enemyType || '') !== 'spawner') {
      noteSlotSpawnerExecutionReason(enemy, { reason: 'missing_enemy', failureReason: 'missing_enemy' });
      return false;
    }
    const liveGroup = withPerfSample('pickupsCombat.weaponRuntime.stepChange.processEvents.execute.spawner.group', () => (
      helpers.getEnemyMusicGroup?.(enemy, 'spawner-spawn', { sync: false })
    ));
    const slotOwnedSpawner = !!String(enemy?.musicVoiceKey || '').trim();
    if (slotOwnedSpawner) {
      try {
        helpers.noteMusicSystemEvent?.('music_slot_spawner_stage', {
          stage: 'executed',
          actorId: Math.max(0, Math.trunc(Number(enemy?.id) || 0)),
          groupId: Math.max(0, Math.trunc(Number(ev?.payload?.groupId) || 0)),
          musicVoiceKey: String(enemy?.musicVoiceKey || '').trim().toLowerCase(),
          musicLayer: String(ev?.payload?.musicLayer || '').trim().toLowerCase(),
          continuityId: String(enemy?.musicContinuityId || enemy?.continuityId || '').trim(),
          actionType: 'spawner-spawn',
        }, { beatIndex, stepIndex, barIndex });
      } catch {}
    }
    const group = slotOwnedSpawner
      ? {
        id: 0,
        role: String(ev.role || enemy?.musicalRole || constants?.roles?.bass || 'bass').trim().toLowerCase(),
        actionType: 'spawner-spawn',
        note: String(enemy?.spawnerNoteName || '').trim(),
        instrumentId: String(enemy?.spawnerInstrument || enemy?.musicInstrumentId || enemy?.instrumentId || '').trim(),
        steps: Array.isArray(enemy?.spawnerSteps) ? enemy.spawnerSteps.slice(0, 8) : [],
        noteIndices: Array.isArray(enemy?.spawnerNoteIndices) ? enemy.spawnerNoteIndices.slice(0, 8) : [],
        notePalette: Array.isArray(enemy?.spawnerNotePalette) ? enemy.spawnerNotePalette.slice() : [],
        continuityId: String(enemy?.musicContinuityId || enemy?.continuityId || '').trim(),
        lifecycleState: String(enemy?.lifecycleState || 'active').trim(),
      }
      : (liveGroup || null);
    if (!group) {
      noteSlotSpawnerExecutionReason(enemy, { reason: 'missing_group', failureReason: 'missing_group' });
      return false;
    }
    noteSlotSpawnerExecutionReason(enemy, { reason: 'entered', instrumentId: String(group?.instrumentId || enemy?.spawnerInstrument || '').trim() });
    const sourceEnemyId = Math.max(0, Math.trunc(Number(enemy?.id) || 0));
    const sourceGroupId = Math.max(0, Math.trunc(Number(group?.id) || 0));
    const emitSpawnerSystemEvent = (eventType, payload = null) => {
      if (eventType !== 'music_spawner_gameplay_event' && eventType !== 'music_spawner_pipeline_mismatch') {
        return;
      }
      try {
        helpers.noteMusicSystemEvent?.(eventType, payload && typeof payload === 'object' ? payload : {}, {
          beatIndex,
          stepIndex,
          barIndex,
        });
      } catch {}
    };
    const aggressionScale = helpers.getEnemyAggressionScale?.(enemy, group?.lifecycleState || 'active');
    let normalizedGroupRole = '';
    let instrumentId = '';
    let musicProminence = 'full';
    let prominenceGain = 1;
    let enemyAudible = true;
    let audioMutedExplicitly = false;
    let shouldTriggerAudio = true;
    let triggerVolume = 0;
    let requestedNote = '';
    let noteName = '';
    let audioDedupKey = '';
    withPerfSample('pickupsCombat.weaponRuntime.stepChange.processEvents.execute.spawner.prep', () => {
      const lockedInstrumentId = String(
        ev?.instrumentId
          || group?.instrumentId
          || enemy?.spawnerInstrument
          || enemy?.instrumentId
          || enemy?.musicInstrumentId
          || ''
      ).trim();
      const lockedLane = inferInstrumentLaneFromCatalogId(lockedInstrumentId, constants.roles?.bass || 'bass');
      normalizedGroupRole = lockedLane === String(constants?.roles?.bass || 'bass')
        ? String(constants?.roles?.bass || 'bass')
        : helpers.normalizeSwarmRole?.(ev.role || group.role, constants.roles?.bass);
      instrumentId = resolveContinuitySafeExecutionInstrument(
        lockedInstrumentId,
        enemy,
        group,
        helpers.resolveSwarmRoleInstrumentId?.(
          normalizedGroupRole,
          helpers.resolveSwarmSoundInstrumentId?.('projectile') || 'tone'
        )
      ) || helpers.resolveSwarmRoleInstrumentId?.(
        normalizedGroupRole,
        helpers.resolveSwarmSoundInstrumentId?.('projectile') || 'tone'
      );
      group.instrumentId = instrumentId;
      group.role = normalizedGroupRole;
      const duckForPlayer = false;
      const combatFeedback = isCombatFeedbackAction(ev);
      const audioGain = combatFeedback
        ? 1
        : helpers.clamp01?.(Number(ev?.payload?.audioGain == null ? 1 : ev.payload.audioGain));
      musicProminence = combatFeedback
        ? 'full'
        : normalizeEnemyProminenceForPlayerStep(
          String(ev?.payload?.musicProminence || 'full').trim().toLowerCase() || 'full'
        );
      prominenceGain = combatFeedback ? 1 : resolveMusicProminenceGain(musicProminence);
      enemyAudible = combatFeedback ? true : isMaskingAudibleProminence(musicProminence);
      audioMutedExplicitly = ev?.payload?.muteAudio === true || ev?.payload?.audioMuted === true;
      shouldTriggerAudio = !audioMutedExplicitly;
      triggerVolume = (Number(constants.spawnerTriggerSoundVolume) || 0)
        * (duckForPlayer ? (Number(constants.playerMaskDuckEnemyVolumeMult) || 1) : 1)
        * (Number(audioGain) || 0)
        * Math.max(0.18, prominenceGain)
        * (0.7 + ((Number(aggressionScale) || 0) * 0.3));
      requestedNote = String(ev?.payload?.requestedNoteRaw || ev.note || '').trim();
      noteName = helpers.clampNoteToDirectorPool?.(requestedNote || ev.note, beatIndex + ev.stepIndex + ev.actorId);
      if (String(instrumentId || '').trim().toUpperCase() === 'CLICK PERCUSSION SHORT') {
        noteName = 'C4';
      }
      if (String(normalizedGroupRole || '') === String(constants?.roles?.bass || 'bass')) {
        const bassFallbackNote = normalizeBassRegister(requestedNote || noteName || 'C3', 'C3');
        noteName = normalizeBassRegister(noteName || requestedNote || bassFallbackNote, bassFallbackNote);
      }
      group.note = noteName;
      audioDedupKey = [
        sourceGroupId,
        String(group?.continuityId || enemy?.musicContinuityId || ''),
        beatIndex,
        stepIndex,
        String(instrumentId || ''),
        String(noteName || ''),
        String(musicProminence || ''),
      ].join('|');
    });
    withPerfSample('pickupsCombat.weaponRuntime.stepChange.processEvents.execute.spawner.audioVisual', () => {
      enemy.musicalRole = normalizedGroupRole;
      enemy.composerRole = normalizedGroupRole;
      enemy.musicInstrumentId = instrumentId;
      enemy.instrumentId = instrumentId;
      if (!slotOwnedSpawner) {
        enemy.spawnerInstrument = instrumentId;
        enemy.spawnerNoteName = noteName;
      }
      if (group?.continuityId) {
        enemy.musicContinuityId = String(group.continuityId);
        enemy.continuityId = String(group.continuityId);
      }
      noteExecutedInstrumentChange(instrumentId, enemy, group);
      helpers.pulseEnemyMusicalRoleVisual?.(enemy, enemyAudible ? 'strong' : 'soft');
    });
    let visualTriggered = false;
    let audioTriggered = false;
    const nodeStepIndex = ((Math.trunc(Number(ev?.payload?.nodeStepIndex) || ev.stepIndex || 0) % 8) + 8) % 8;
    const shouldFlashSpawnerCell = prominenceGain > 0;
    const spawnerFlashMode = musicProminence === 'full' ? 'strong' : 'soft';
    if (shouldFlashSpawnerCell) {
      withPerfSample('pickupsCombat.weaponRuntime.stepChange.processEvents.execute.spawner.flash', () => {
        helpers.flashSpawnerEnemyCell?.(enemy, nodeStepIndex, spawnerFlashMode);
        const peerSignature = String(enemy?.__bsSpawnerSyncSignature || '').trim();
        if (!peerSignature || !Array.isArray(state?.enemies)) return;
        for (const peer of state.enemies) {
          if (!peer || peer === enemy) continue;
          if (String(peer?.enemyType || '').trim().toLowerCase() !== 'spawner') continue;
          if (String(peer?.__bsSpawnerSyncSignature || '').trim() !== peerSignature) continue;
          const peerSteps = Array.isArray(peer?.spawnerSteps) ? peer.spawnerSteps : [];
          if (!peerSteps[nodeStepIndex]) continue;
          helpers.flashSpawnerEnemyCell?.(peer, nodeStepIndex, 'soft');
        }
      });
      visualTriggered = true;
    }
    const shouldTriggerGroupAudio = shouldTriggerAudio
      && String(group?.lastAudioDedupKey || '') !== audioDedupKey;
    if (audioMutedExplicitly) {
      noteSlotSpawnerExecutionReason(enemy, {
        reason: 'audio_muted',
        failureReason: 'audio_muted',
        instrumentId,
      });
    } else if (!shouldTriggerGroupAudio) {
      noteSlotSpawnerExecutionReason(enemy, {
        reason: 'audio_deduped',
        failureReason: 'audio_deduped',
        instrumentId,
      });
    }
    if (shouldTriggerGroupAudio) {
      withPerfSample('pickupsCombat.weaponRuntime.stepChange.processEvents.execute.spawner.audioTrigger', () => {
        try {
          helpers.triggerInstrument?.(instrumentId, noteName, undefined, 'master', {}, triggerVolume);
          audioTriggered = true;
          group.lastAudioDedupKey = audioDedupKey;
          if (
            slotOwnedSpawner
            && String(enemy?.musicVoiceKey || '').trim().toLowerCase() === 'percussion_pulse'
            && !enemy.__bsLoggedFirstIntroPulseNote
            && barIndex < 24
          ) {
            enemy.__bsLoggedFirstIntroPulseNote = true;
            try {
              helpers.noteMusicSystemEvent?.('music_intro_drum_first_note', {
                actorId: Math.max(0, Math.trunc(Number(enemy?.id) || 0)),
                musicVoiceKey: String(enemy?.musicVoiceKey || '').trim().toLowerCase(),
                requestedNote: String(requestedNote || '').trim(),
                resolvedNote: String(noteName || '').trim(),
                instrumentId: String(instrumentId || '').trim(),
                nodeStepIndex,
                introPrimaryLoopBlendWindow: barIndex >= 20 && barIndex < 24,
              }, { beatIndex, stepIndex, barIndex });
            } catch {}
          }
          noteSlotSpawnerExecutionReason(enemy, {
            reason: 'audio_triggered',
            instrumentId,
          });
        } catch {}
      });
    }
    if (!Array.isArray(enemy.spawnerNodeEnemyIds)) enemy.spawnerNodeEnemyIds = Array.from({ length: 8 }, () => 0);
    let linkedEnemy = withPerfSample('pickupsCombat.weaponRuntime.stepChange.processEvents.execute.spawner.linkedLookup', () => {
      const linkedEnemyId = Math.trunc(Number(enemy.spawnerNodeEnemyIds[nodeStepIndex]) || 0);
      const resolved = linkedEnemyId > 0 ? helpers.getSwarmEnemyById?.(linkedEnemyId) : null;
      if (!resolved || String(resolved?.enemyType || '') !== 'dumb') {
        enemy.spawnerNodeEnemyIds[nodeStepIndex] = 0;
        return null;
      }
      return resolved;
    });
    if (!linkedEnemy) {
      const spawned = withPerfSample('pickupsCombat.weaponRuntime.stepChange.processEvents.execute.spawner.spawnLinked', () => {
        const spawnWorld = helpers.getSpawnerNodeCellWorld?.(enemy, nodeStepIndex) || { x: Number(enemy.wx) || 0, y: Number(enemy.wy) || 0 };
        const spawnScreen = helpers.worldToScreen?.(spawnWorld);
        if (!spawnScreen || !Number.isFinite(spawnScreen.x) || !Number.isFinite(spawnScreen.y)) {
          emitSpawnerSystemEvent('music_spawner_pipeline_mismatch', {
            sourceEnemyId,
            sourceGroupId,
            failureReason: 'spawn_screen_invalid',
          });
          return false;
        }
        const hp = Math.max(1, Number(state.currentEnemySpawnMaxHp) || 1);
        const beforeCount = Array.isArray(state.enemies) ? state.enemies.length : 0;
        helpers.spawnEnemyAt?.(spawnScreen.x, spawnScreen.y, {
          linkedSpawnerId: Math.trunc(Number(enemy.id) || 0),
          linkedSpawnerStepIndex: nodeStepIndex,
          hp,
          role: normalizedGroupRole,
          layer: 'foundation',
          note: noteName,
          instrumentId,
          continuityId: String(group?.musicLaneContinuityId || group?.continuityId || enemy?.musicContinuityId || '').trim(),
          skipMusicGroupInit: true,
        });
        if ((Array.isArray(state.enemies) ? state.enemies.length : 0) > beforeCount) {
          const created = state.enemies[state.enemies.length - 1];
          if (created && Number.isFinite(created.id)) {
            enemy.spawnerNodeEnemyIds[nodeStepIndex] = Math.trunc(created.id);
          }
        }
        return true;
      });
      if (!spawned) {
        noteSlotSpawnerExecutionReason(enemy, {
          reason: 'spawn_link_failed',
          failureReason: 'spawn_link_failed',
          instrumentId,
        });
        return false;
      }
      if ((shouldFlashSpawnerCell && !visualTriggered) || (!audioTriggered && !audioMutedExplicitly)) {
        emitSpawnerSystemEvent('music_spawner_pipeline_mismatch', {
          sourceEnemyId,
          sourceGroupId,
          failureReason: (!visualTriggered && shouldFlashSpawnerCell) ? 'visual_missing' : 'audio_missing',
        });
      }
      withPerfSample('pickupsCombat.weaponRuntime.stepChange.processEvents.execute.spawner.logging', () => {
        logMusicLabExecution({
          sourceSystem: 'spawner',
          requestedNote,
          resolvedNote: noteName,
          noteWasClamped: requestedNote ? requestedNote !== noteName : false,
          enemyAudible,
          musicProminence,
          ...buildPlaybackLoggingContext(instrumentId, triggerVolume),
        });
      });
      noteSlotSpawnerExecutionReason(enemy, {
        reason: 'completed_spawned_link',
        instrumentId,
      });
      return true;
    }
    const origin = { x: Number(linkedEnemy.wx) || 0, y: Number(linkedEnemy.wy) || 0 };
    const toPlayer = helpers.getViewportCenterWorld?.();
    withPerfSample('pickupsCombat.weaponRuntime.stepChange.processEvents.execute.spawner.launchLinked', () => {
      const dir = Math.atan2((Number(toPlayer?.y) || 0) - origin.y, (Number(toPlayer?.x) || 0) - origin.x);
      helpers.spawnHostileRedProjectileAt?.(origin, {
        angle: dir + helpers.randRange?.(-0.24, 0.24),
        speed: (Number(constants.spawnerLinkedAttackSpeed) || 0) * Math.max(0.4, Math.min(1, aggressionScale)),
        noteName,
        instrument: instrumentId,
        damage: Math.max(0.2, aggressionScale),
      });
    });
    if ((shouldFlashSpawnerCell && !visualTriggered) || (!audioTriggered && !audioMutedExplicitly)) {
      emitSpawnerSystemEvent('music_spawner_pipeline_mismatch', {
        sourceEnemyId,
        sourceGroupId,
        targetEnemyId: Math.max(0, Math.trunc(Number(linkedEnemy?.id) || 0)),
        failureReason: (!visualTriggered && shouldFlashSpawnerCell) ? 'visual_missing' : 'audio_missing',
      });
    }
    withPerfSample('pickupsCombat.weaponRuntime.stepChange.processEvents.execute.spawner.linkedVisual', () => {
      helpers.pulseHitFlash?.(linkedEnemy.el);
    });
    withPerfSample('pickupsCombat.weaponRuntime.stepChange.processEvents.execute.spawner.logging', () => {
      logMusicLabExecution({
        sourceSystem: 'spawner',
        requestedNote,
        resolvedNote: noteName,
        noteWasClamped: requestedNote ? requestedNote !== noteName : false,
        enemyAudible,
        musicProminence,
        ...buildPlaybackLoggingContext(instrumentId, triggerVolume),
      });
    });
    noteSlotSpawnerExecutionReason(enemy, {
      reason: 'completed_existing_link',
      instrumentId,
    });
    return true;
  });
  }

  if (actionType === 'drawsnake-projectile') {
    return withPerfSample('pickupsCombat.weaponRuntime.stepChange.processEvents.execute.drawsnake', () => {
    const enemy = helpers.getSwarmEnemyById?.(ev.actorId);
    if (!enemy || String(enemy?.enemyType || '') !== 'drawsnake') return false;
    const group = withPerfSample('pickupsCombat.weaponRuntime.stepChange.processEvents.execute.drawsnake.group', () => (
      helpers.getEnemyMusicGroup?.(enemy, 'drawsnake-projectile', { sync: false })
    ));
    if (!group) return false;
    const aggressionScale = helpers.getEnemyAggressionScale?.(enemy, group?.lifecycleState || 'active');
    const requestedInstrumentId = String(
      ev?.instrumentId
        || group?.instrumentId
        || enemy?.drawsnakeInstrument
        || enemy?.musicInstrumentId
        || enemy?.instrumentId
        || helpers.resolveSwarmRoleInstrumentId?.(
          ev.role || group.role || helpers.getSwarmRoleForEnemy?.(enemy, constants.roles?.lead),
          helpers.resolveSwarmSoundInstrumentId?.('projectile') || 'tone'
        )
        || 'tone'
    ).trim() || 'tone';
    const instrumentId = resolveContinuitySafeExecutionInstrument(
      requestedInstrumentId,
      enemy,
      group,
      'tone'
    ) || 'tone';
    const persistExecutionInstrumentRewrite = shouldPersistExecutionInstrumentRewrite(enemy, group);
    if (persistExecutionInstrumentRewrite) {
      group.instrumentId = instrumentId;
      group.instrument = instrumentId;
    }
    group.role = helpers.normalizeSwarmRole?.(ev.role || group.role, constants.roles?.lead);
    const duckForPlayer = false;
    const combatFeedback = isCombatFeedbackAction(ev);
    const audioGain = combatFeedback
      ? 1
      : helpers.clamp01?.(Number(ev?.payload?.audioGain == null ? 1 : ev.payload.audioGain));
    const musicProminence = combatFeedback
      ? 'full'
      : normalizeEnemyProminenceForPlayerStep(
        String(ev?.payload?.musicProminence || 'full').trim().toLowerCase() || 'full'
      );
    const prominenceGain = combatFeedback ? 1 : resolveMusicProminenceGain(musicProminence);
    const enemyAudible = combatFeedback ? true : isMaskingAudibleProminence(musicProminence);
    const triggerVolume = (Number(constants.drawSnakeTriggerSoundVolume) || 0)
      * (duckForPlayer ? (Number(constants.playerMaskDuckEnemyVolumeMult) || 1) : 1)
      * (Number(audioGain) || 0)
      * prominenceGain
      * (0.72 + ((Number(aggressionScale) || 0) * 0.28));
    const requestedNote = String(ev?.payload?.requestedNoteRaw || ev.note || '').trim();
    const preserveRequestedNote = ev?.payload?.preserveRequestedNote === true;
    let noteName = preserveRequestedNote
      ? (requestedNote || String(ev.note || '').trim())
      : helpers.clampNoteToDirectorPool?.(requestedNote || ev.note, beatIndex + ev.stepIndex + ev.actorId);
    if (String(ev?.instrumentId || group?.instrumentId || enemy?.drawsnakeInstrument || '').trim().toUpperCase() === 'CLICK PERCUSSION SHORT') {
      noteName = 'C4';
    }
    group.note = noteName;
    withPerfSample('pickupsCombat.weaponRuntime.stepChange.processEvents.execute.drawsnake.audioVisual', () => {
      enemy.musicalRole = group.role;
      enemy.composerRole = group.role;
      if (persistExecutionInstrumentRewrite) {
        enemy.drawsnakeInstrument = instrumentId;
        enemy.musicInstrumentId = instrumentId;
        enemy.instrumentId = instrumentId;
      }
      if (group?.continuityId) {
        enemy.musicContinuityId = String(group.continuityId);
        enemy.continuityId = String(group.continuityId);
      }
      noteExecutedInstrumentChange(instrumentId, enemy, group);
      helpers.pulseEnemyMusicalRoleVisual?.(enemy, enemyAudible ? 'strong' : 'soft');
    });
    if (enemyAudible) {
      withPerfSample('pickupsCombat.weaponRuntime.stepChange.processEvents.execute.drawsnake.audioTrigger', () => {
        try { helpers.triggerInstrument?.(instrumentId, noteName, undefined, 'master', {}, triggerVolume); } catch {}
      });
    }
    let nodeIndex = 0;
    withPerfSample('pickupsCombat.weaponRuntime.stepChange.processEvents.execute.drawsnake.projectilePrep', () => {
      nodeIndex = Math.trunc(Number(ev?.payload?.nodeIndex) || 0);
    });
    withPerfSample('pickupsCombat.weaponRuntime.stepChange.processEvents.execute.drawsnake.projectileFire', () => {
      helpers.fireDrawSnakeProjectile?.(enemy, nodeIndex, noteName, aggressionScale, instrumentId);
    });
    withPerfSample('pickupsCombat.weaponRuntime.stepChange.processEvents.execute.drawsnake.logging', () => {
      logMusicLabExecution({
        sourceSystem: 'drawsnake',
        requestedNote,
        resolvedNote: noteName,
        noteWasClamped: requestedNote ? requestedNote !== noteName : false,
        enemyAudible,
        musicProminence,
        ...buildPlaybackLoggingContext(instrumentId, triggerVolume),
      });
    });
    return true;
  });
  }

  if (actionType === 'player-lead-release-echo' || actionType === 'player-lead-settle-echo') {
    return withPerfSample('pickupsCombat.weaponRuntime.stepChange.processEvents.execute.releaseLeadEcho', () => {
      const payload = ev?.payload && typeof ev.payload === 'object' ? ev.payload : {};
      const requestedNote = String(payload?.requestedNoteRaw || ev?.note || '').trim();
      const noteName = String(requestedNote || ev?.note || '').trim();
      const instrumentId = String(ev?.instrumentId || '').trim();
      if (!instrumentId || !noteName) return false;
      const authoredGain = Number(payload?.audioGain == null ? 0.24 : payload.audioGain);
      const settleEcho = actionType === 'player-lead-settle-echo';
      const motifSectionBar = Math.max(0, Math.trunc(Number(payload?.motifSectionBar) || 0));
      const releaseGesturePhase = String(payload?.releaseGesturePhase || '').trim().toLowerCase();
      const releaseEchoGain = (() => {
        const baseGain = Number.isFinite(authoredGain) ? authoredGain : 0.24;
        if (releaseGesturePhase === 'entry') return Math.max(0.72, baseGain);
        if (releaseGesturePhase === 'decay') return Math.max(0.72, baseGain);
        if (releaseGesturePhase === 'tail') return Math.max(0.72, baseGain);
        if (motifSectionBar <= 1) return Math.max(0.42, baseGain);
        if (motifSectionBar <= 3) return Math.max(0.34, baseGain);
        if (motifSectionBar <= 5) return Math.max(0.28, baseGain);
        return Math.max(0.24, baseGain);
      })();
      const triggerVolume = settleEcho
        ? Math.max(0.16, Math.min(0.72, Number.isFinite(authoredGain) ? authoredGain : 0.72))
        : Math.max(0.16, Math.min(0.72, releaseEchoGain));
      try {
        helpers.triggerInstrument?.(
          instrumentId,
          noteName,
          undefined,
          'master',
          { source: settleEcho ? 'beat-swarm-settle-lead-echo' : 'beat-swarm-release-lead-echo', preserveRequestedNote: true, stepIndex },
          triggerVolume
        );
      } catch {}
      try {
        helpers.noteMusicSystemEvent?.(settleEcho ? 'music_settle_lead_echo_triggered' : 'music_release_lead_echo_triggered', {
          instrumentId,
          note: noteName,
          triggerVolume,
          musicProminence: 'quiet',
          motifSectionBar,
          releaseGesturePhase,
          leadThemeInterpretationMode: String(payload?.leadThemeInterpretationMode || '').trim().toLowerCase(),
          leadThemePartIndex: Math.max(0, Math.trunc(Number(payload?.leadThemePartIndex) || 0)),
          leadThemeStepIndex: Math.max(0, Math.trunc(Number(payload?.leadThemeStepIndex) || 0)),
        }, { beatIndex, stepIndex, barIndex });
      } catch {}
      logMusicLabExecution({
        sourceSystem: 'music',
        requestedNote,
        resolvedNote: noteName,
        noteWasClamped: false,
        enemyAudible: true,
        musicProminence: 'quiet',
        musicLaneId: 'primary_loop_lane',
        musicLayer: 'loops',
        musicVoiceKey: settleEcho ? 'player_lead_settle_echo' : 'player_lead_release_echo',
        callResponseLane: String(payload?.callResponseLane || 'call').trim().toLowerCase(),
        callResponseQualified: payload?.callResponseQualified === true,
        callResponsePhraseProgress: Math.max(0, Math.trunc(Number(payload?.callResponsePhraseProgress) || 0)),
        intensityAuditionSection: settleEcho ? 'settle' : 'release',
        releaseGesturePhase,
        ...buildLeadThemeExecutionContext(null, null),
        ...buildPlaybackLoggingContext(instrumentId, triggerVolume),
      });
      return true;
    });
  }

  if (actionType === 'composer-group-projectile' || actionType === 'composer-group-explosion') {
    return withPerfSample('pickupsCombat.weaponRuntime.stepChange.processEvents.execute.composer', () => {
    let enemy = helpers.getSwarmEnemyById?.(ev.actorId);
    const payload = ev?.payload && typeof ev.payload === 'object' ? ev.payload : {};
    const ghostPlayback = payload?.ghostPlayback === true;
    const payloadGroupId = Math.max(0, Math.trunc(Number(payload?.groupId) || 0));
    const noteComposerExecutionStage = (stage, extra = null) => {
      try {
        helpers.noteMusicSystemEvent?.('music_composer_execution_stage', {
          stage: String(stage || '').trim().toLowerCase(),
          actorId: Math.max(0, Math.trunc(Number(ev?.actorId) || 0)),
          groupId: payloadGroupId,
          actionType,
          ghostPlayback,
          enemyType: String(enemy?.enemyType || '').trim().toLowerCase(),
          hasEnemy: !!enemy,
          hasEnemyEl: !!(enemy?.el instanceof HTMLElement),
          hasGroup: false,
          instrumentId: String(ev?.instrumentId || '').trim(),
          note: String(ev?.note || payload?.requestedNoteRaw || '').trim(),
          musicLayer: String(payload?.musicLayer || '').trim().toLowerCase(),
          callResponseLane: String(payload?.callResponseLane || '').trim().toLowerCase(),
          ...(extra && typeof extra === 'object' ? extra : {}),
        }, { beatIndex, stepIndex, barIndex });
      } catch {}
    };
    const noteIntroSlotExecution = (phase, extra = null) => {
      const payload = ev?.payload && typeof ev.payload === 'object' ? ev.payload : {};
      if (!(barIndex <= 20) || !(payloadGroupId > 0)) return;
      try {
        helpers.noteMusicSystemEvent?.('music_composer_group_state', {
          phase: String(phase || 'execute').trim().toLowerCase(),
          groupId: payloadGroupId,
          actorId: Math.max(0, Math.trunc(Number(ev?.actorId) || 0)),
          role: String(ev?.role || payload?.musicRole || '').trim().toLowerCase(),
          musicLaneId: String(payload?.musicLaneId || payload?.foundationLaneId || '').trim().toLowerCase(),
          instrumentId: String(ev?.instrumentId || '').trim(),
          note: String(ev?.note || payload?.requestedNoteRaw || '').trim(),
          reason: String(payload?.soloCarrierType || '').trim().toLowerCase(),
          stage: String(phase || 'execute').trim().toLowerCase(),
          ...(extra && typeof extra === 'object' ? extra : {}),
        }, { beatIndex, stepIndex, barIndex });
      } catch {}
    };
    const payloadSoloCarrierType = String(ev?.payload?.soloCarrierType || '').trim().toLowerCase();
    const isSquareCandidate = payloadSoloCarrierType === 'rhythm'
      || (
        String(ev?.actionType || '').trim().toLowerCase() === 'composer-group-explosion'
        && String(ev?.instrumentId || '').trim().toUpperCase() === 'BASS TONE 3'
        && String(ev?.note || '').trim().toUpperCase() === 'C3'
      );
    try {
      if (false && isSquareCandidate && typeof globalThis !== 'undefined' && typeof globalThis.console?.log === 'function') {
        globalThis.console.log('[BS-INTRO-DEBUG]', JSON.stringify({
          eventType: 'square_exec_lookup',
          actorId: Math.max(0, Math.trunc(Number(ev?.actorId) || 0)),
          foundEnemy: !!enemy,
          enemyType: String(enemy?.enemyType || '').trim().toLowerCase(),
          enemySoloCarrierType: String(enemy?.soloCarrierType || '').trim().toLowerCase(),
          actionType,
          instrumentId: String(ev?.instrumentId || '').trim(),
          noteName: String(ev?.note || '').trim(),
          payloadSoloCarrierType,
        }));
      }
    } catch {}
    if ((!enemy || String(enemy?.enemyType || '') !== 'composer-group-member') && !ghostPlayback) {
      noteComposerExecutionStage('missing_enemy', {
        failureReason: !enemy ? 'missing_enemy' : 'wrong_enemy_type',
      });
      noteIntroSlotExecution('execute_missing_enemy', {
        admissionReason: !enemy ? 'missing_enemy' : 'wrong_enemy_type',
      });
      return false;
    }
    const group = ghostPlayback
      ? (
        composerEnemyGroups.find((g) => Math.max(0, Math.trunc(Number(g?.id) || 0)) === payloadGroupId)
        || {
          id: 0,
          role: ev?.role || payload?.musicRole || 'accent',
          actionType,
          instrumentId: ev?.instrumentId || '',
          instrument: ev?.instrumentId || '',
          musicLaneInstrumentId: ev?.instrumentId || '',
          musicLaneId: payload?.musicLaneId || '',
          musicLaneLayer: payload?.musicLayer || '',
          musicProfileSourceType: payload?.musicProfileSourceType || '',
          musicLanePlayerThemeSource: payload?.musicLanePlayerThemeSource || '',
          musicLanePhraseId: payload?.musicLanePhraseId || '',
          musicLanePatternKey: payload?.musicLanePatternKey || '',
          callResponseLane: payload?.callResponseLane || '',
          soloCarrierType: payload?.soloCarrierType || '',
          lifecycleState: 'active',
        }
      )
      : helpers.getEnemyMusicGroup?.(enemy, actionType);
    try {
      if (false && isSquareCandidate && typeof globalThis !== 'undefined' && typeof globalThis.console?.log === 'function') {
        globalThis.console.log('[BS-INTRO-DEBUG]', JSON.stringify({
          eventType: 'square_exec_group',
          actorId: Math.max(0, Math.trunc(Number(ev?.actorId) || 0)),
          foundGroup: !!group,
          groupId: Math.max(0, Math.trunc(Number(group?.id) || 0)),
          groupSoloCarrierType: String(group?.soloCarrierType || '').trim().toLowerCase(),
          payloadSoloCarrierType: String(ev?.payload?.soloCarrierType || '').trim().toLowerCase(),
        }));
      }
    } catch {}
    if (!group) {
      noteComposerExecutionStage('missing_group', {
        failureReason: 'missing_group',
      });
      noteIntroSlotExecution('execute_missing_group', {
        admissionReason: 'missing_group',
      });
      return false;
    }
    const suppressLegacySecondaryFallback = (() => {
      const stage = getCurrentIntensityStage();
      if (stage !== 'medium' && stage !== 'build') return false;
      const laneId = String(payload?.musicLaneId || group?.musicLaneId || enemy?.musicLaneId || '').trim().toLowerCase();
      if (laneId !== 'secondary_loop_lane') return false;
      const playerThemeSource = String(
        payload?.musicLanePlayerThemeSource
          || group?.musicLanePlayerThemeSource
          || enemy?.musicLanePlayerThemeSource
          || ''
      ).trim();
      if (playerThemeSource) return false;
      const continuityId = String(payload?.continuityId || ev?.continuityId || '').trim().toLowerCase();
      const profileSourceType = String(
        payload?.musicProfileSourceType
          || group?.musicProfileSourceType
          || enemy?.musicProfileSourceType
          || ''
      ).trim().toLowerCase();
      const groupEventSource = String(payload?.groupEventSource || '').trim().toLowerCase();
      return continuityId === 'secondary-loop-bridge-fallback'
        || groupEventSource === 'secondary_loop_bridge_fallback'
        || profileSourceType === 'secondary_bridge_backbeat';
    })();
    if (suppressLegacySecondaryFallback) {
      noteComposerExecutionStage('suppressed_legacy_secondary_fallback', {
        hasGroup: true,
        musicLaneId: 'secondary_loop_lane',
        intensityAuditionSection: getCurrentIntensityStage(),
      });
      return true;
    }
    if (isContractBlockedOrnamentExecution({ sourceSystem: 'group' }, enemy || null, group)) {
      noteContractBlockedOrnamentExecution('execute_group', { sourceSystem: 'group' }, enemy || null, group);
      return false;
    }
    noteComposerExecutionStage('entered', {
      hasGroup: true,
      instrumentId: String(group?.instrumentId || ev?.instrumentId || '').trim(),
    });
    noteIntroSlotExecution('execute_entered', {
      admissionReason: '',
    });
    const aggressionScale = helpers.getEnemyAggressionScale?.(enemy, group?.lifecycleState || 'active');
    const requestedNote = String(ev?.payload?.requestedNoteRaw || ev.note || '').trim();
    let noteName = helpers.clampNoteToDirectorPool?.(requestedNote || ev.note, beatIndex + ev.stepIndex + ev.actorId);
    const lockedInstrumentId = String(
      ev?.instrumentId
        || group?.instrumentId
        || enemy?.instrumentId
        || enemy?.musicInstrumentId
        || enemy?.composerInstrument
        || ''
    ).trim();
    if (String(lockedInstrumentId || '').trim().toUpperCase() === 'CLICK PERCUSSION SHORT') {
      noteName = 'C4';
    }
    const lockedLane = inferInstrumentLaneFromCatalogId(lockedInstrumentId, '');
    const normalizedGroupRole = lockedLane === String(constants?.roles?.bass || 'bass')
      ? String(constants?.roles?.bass || 'bass')
      : helpers.normalizeSwarmRole?.(ev.role || group.role, constants.roles?.lead);
    let instrumentId = resolveContinuitySafeExecutionInstrument(
      lockedInstrumentId,
      enemy,
      group,
      helpers.resolveSwarmRoleInstrumentId?.(
        normalizedGroupRole,
        helpers.resolveSwarmSoundInstrumentId?.('projectile') || 'tone'
      )
    ) || helpers.resolveSwarmRoleInstrumentId?.(
      normalizedGroupRole,
      helpers.resolveSwarmSoundInstrumentId?.('projectile') || 'tone'
    );
    const execSoloType = String(
      enemy?.soloCarrierType
        || ev?.payload?.soloCarrierType
        || group?.soloCarrierType
        || ''
    ).trim().toLowerCase();
    if (enemy && execSoloType && !String(enemy?.soloCarrierType || '').trim()) {
      enemy.soloCarrierType = execSoloType;
    }
    group.instrumentId = instrumentId;
    group.role = normalizedGroupRole;
    if (String(normalizedGroupRole || '') === String(constants?.roles?.bass || 'bass')) {
      const bassFallbackNote = normalizeBassRegister(requestedNote || noteName || 'C3', 'C3');
      noteName = normalizeBassRegister(noteName || requestedNote || bassFallbackNote, bassFallbackNote);
    }
    const duckForPlayer = false;
    const combatFeedback = isCombatFeedbackAction(ev);
    const executionLaneId = String(ev?.payload?.musicLaneId || group?.musicLaneId || enemy?.musicLaneId || '').trim().toLowerCase();
    const executionVoiceKey = String(ev?.payload?.musicVoiceKey || '').trim().toLowerCase();
    const executionProfileSourceType = String(ev?.payload?.musicProfileSourceType || group?.musicProfileSourceType || enemy?.musicProfileSourceType || '').trim().toLowerCase();
    const executionCallResponseLane = String(ev?.payload?.callResponseLane || group?.callResponseLane || enemy?.callResponseLane || '').trim().toLowerCase();
    const answerOrnamentExecution = (
      executionLaneId === 'answer_lane'
      || executionLaneId === 'sparkle_lane'
      || executionVoiceKey === 'answer_ornament'
      || executionProfileSourceType === 'answer_ornament'
      || executionCallResponseLane === 'response'
    );
    const authoredAudioGain = Number(ev?.payload?.audioGain == null ? 1 : ev.payload.audioGain);
    const audioGain = combatFeedback
      ? 1
      : answerOrnamentExecution
      ? helpers.clamp01?.(Math.min(Number.isFinite(authoredAudioGain) ? authoredAudioGain : 1, 0.28))
      : helpers.clamp01?.(authoredAudioGain);
    const peakPrimaryLoopLead = getCurrentIntensityStage() === 'peak'
      && executionLaneId === 'primary_loop_lane';
    const releaseLeadThemeEcho = String(ev?.payload?.intensityAuditionSection || '').trim().toLowerCase() === 'release'
      && executionLaneId === 'primary_loop_lane'
      && (
        String(ev?.payload?.leadThemeInterpretationMode || '').trim().toLowerCase() === 'release_riff'
        || String(ev?.payload?.continuityId || '').trim().toLowerCase() === 'player-lead-theme-direct'
      );
    const normalizedProminence = normalizeEnemyProminenceForPlayerStep(
      String(ev?.payload?.musicProminence || 'full').trim().toLowerCase() || 'full'
    );
    const musicProminence = combatFeedback
      ? 'full'
      : releaseLeadThemeEcho
      ? 'quiet'
      : peakPrimaryLoopLead
      ? 'full'
      : answerOrnamentExecution
      ? (playerStepLikelyAudible ? 'trace' : 'quiet')
      : normalizedProminence;
    const prominenceGain = combatFeedback ? 1 : resolveMusicProminenceGain(musicProminence);
    const enemyAudible = combatFeedback ? true : isMaskingAudibleProminence(musicProminence);
    const triggerVolume = (execSoloType === 'rhythm'
      ? (Number(constants.spawnerTriggerSoundVolume) || 0.24)
      : 0.62)
      * (duckForPlayer ? (Number(constants.playerMaskDuckEnemyVolumeMult) || 1) : 1)
      * (Number(audioGain) || 0)
      * prominenceGain
      * (0.72 + ((Number(aggressionScale) || 0) * 0.28));
    if (enemy) helpers.syncSingletonEnemyStateFromMusicGroup?.(enemy, group);
    noteExecutedInstrumentChange(instrumentId, enemy || null, group);
    if (enemy) helpers.pulseEnemyMusicalRoleVisual?.(enemy, enemyAudible ? 'strong' : 'soft');
    const isGroupedPrimaryLead = String(group?.musicLaneId || ev?.payload?.musicLaneId || '').trim().toLowerCase() === 'primary_loop_lane'
      && String(group?.musicProfileSourceType || '').trim().toLowerCase() === 'lead_melody'
      && String(group?.callResponseLane || '').trim().toLowerCase() !== 'solo'
      && execSoloType !== 'rhythm';
    if (isGroupedPrimaryLead && group?.memberIds && typeof helpers.getSwarmEnemyById === 'function') {
      const memberIds = group.memberIds instanceof Set
        ? Array.from(group.memberIds)
        : (Array.isArray(group.memberIds) ? group.memberIds : []);
      for (let i = 0; i < memberIds.length; i++) {
        const memberId = Math.max(0, Math.trunc(Number(memberIds[i]) || 0));
        if (!(memberId > 0) || memberId === Math.max(0, Math.trunc(Number(enemy?.id) || 0))) continue;
        const memberEnemy = helpers.getSwarmEnemyById(memberId);
        if (!memberEnemy || memberEnemy?.retreating || String(memberEnemy?.enemyType || '').trim().toLowerCase() !== 'composer-group-member') continue;
        const companionPulseDur = Math.max(
          0.01,
          (Number(memberEnemy?.composerActionPulseDur) || Number(constants.composerGroupActionPulseSeconds) || 0.24) * 0.72,
        );
        memberEnemy.composerActionPulseDur = companionPulseDur;
        memberEnemy.composerActionPulseT = Math.max(Number(memberEnemy?.composerActionPulseT) || 0, companionPulseDur);
        helpers.pulseEnemyMusicalRoleVisual?.(memberEnemy, 'soft');
      }
    }
    if (enemyAudible) {
      try {
        if (false && isSquareCandidate && typeof globalThis !== 'undefined' && typeof globalThis.console?.log === 'function') {
          globalThis.console.log('[BS-INTRO-DEBUG]', JSON.stringify({
            eventType: 'square_exec_trigger',
            actorId: Math.max(0, Math.trunc(Number(ev?.actorId) || 0)),
            instrumentId: String(instrumentId || '').trim(),
            noteName: String(noteName || '').trim(),
            triggerVolume: Number(triggerVolume) || 0,
            execSoloType,
          }));
        }
      } catch {}
      try { helpers.triggerInstrument?.(instrumentId, noteName, undefined, 'master', {}, triggerVolume); } catch {}
      if (enemy) {
        enemy.lastMusicalActionBeatIndex = beatIndex;
        enemy.lastMusicalActionStepIndex = stepIndex;
        enemy.lastMusicalActionAtMs = getPerfNow();
      }
      noteComposerExecutionStage('audio_triggered', {
        hasGroup: true,
        instrumentId: String(instrumentId || '').trim(),
        note: String(noteName || '').trim(),
        triggerVolume: Number(triggerVolume) || 0,
      });
    } else {
      noteComposerExecutionStage('audio_suppressed', {
        hasGroup: true,
        instrumentId: String(instrumentId || '').trim(),
        note: String(noteName || '').trim(),
        musicProminence: String(musicProminence || '').trim().toLowerCase(),
        triggerVolume: Number(triggerVolume) || 0,
      });
    }
    if (ghostPlayback) {
      logMusicLabExecution({
        sourceSystem: 'group',
        requestedNote,
        resolvedNote: noteName,
        noteWasClamped: requestedNote ? requestedNote !== noteName : false,
        enemyAudible,
        musicProminence,
        enemyType: 'composer-group-member',
        ghostPlayback: true,
        ...buildLeadThemeExecutionContext(group, enemy || null),
        ...buildPlaybackLoggingContext(instrumentId, triggerVolume),
      });
      noteComposerExecutionStage('completed_ghost', {
        hasGroup: true,
        instrumentId: String(instrumentId || '').trim(),
        note: String(noteName || '').trim(),
      });
      noteIntroSlotExecution('execute_completed', {
        admissionReason: 'ghost_playback',
      });
      return true;
    }
    helpers.pulseHitFlash?.(enemy.el);
    helpers.pulseSoloCarrierActivationVisual?.(enemy);
    noteComposerExecutionStage('visual_triggered', {
      hasGroup: true,
      hasEnemyEl: !!(enemy?.el instanceof HTMLElement),
      instrumentId: String(instrumentId || '').trim(),
      note: String(noteName || '').trim(),
    });
    if (execSoloType === 'rhythm') {
      const directPulseDur = Math.max(
        0.22,
        (Number(enemy?.composerActionPulseDur) || Number(constants.composerGroupActionPulseSeconds) || 0.24) * 1.15
      );
      enemy.soloCarrierActivationPulseDur = directPulseDur;
      enemy.soloCarrierActivationPulseT = directPulseDur;
      enemy.soloCarrierActivationPulseScale = Math.max(0.14, Number(enemy?.soloCarrierActivationPulseScale) || 0);
      if (enemy?.el instanceof HTMLElement) {
        enemy.el.classList.add('is-solo-note-active');
        try { enemy.el.style.setProperty('--bs-solo-pulse-level', '1'); } catch {}
      }
      try {
        if (false && typeof globalThis !== 'undefined' && typeof globalThis.console?.log === 'function') {
          globalThis.console.log('[BS-INTRO-DEBUG]', JSON.stringify({
            eventType: 'square_exec_direct_pulse',
            enemyId: Math.trunc(Number(enemy?.id) || 0),
            groupId: Math.trunc(Number(group?.id) || 0),
            soloCarrierType: execSoloType,
            pulseDur: directPulseDur,
            className: enemy?.el instanceof HTMLElement ? String(enemy.el.className || '') : '',
            hasEl: enemy?.el instanceof HTMLElement,
          }));
        }
      } catch {}
    }
    enemy.composerActionPulseDur = Math.max(0.01, Number(enemy?.composerActionPulseDur) || Number(constants.composerGroupActionPulseSeconds) || 0);
    enemy.composerActionPulseT = Math.max(0.01, Number(enemy?.composerActionPulseDur) || Number(constants.composerGroupActionPulseSeconds) || 0);
    const origin = { x: Number(enemy.wx) || 0, y: Number(enemy.wy) || 0 };
    if (actionType === 'composer-group-explosion') {
      helpers.addHostileRedExplosionEffect?.(origin);
      noteComposerExecutionStage('explosion_triggered', {
        hasGroup: true,
        instrumentId: String(instrumentId || '').trim(),
        note: String(noteName || '').trim(),
      });
    } else {
      const toPlayer = helpers.getViewportCenterWorld?.();
      const dir = Math.atan2((Number(toPlayer?.y) || 0) - origin.y, (Number(toPlayer?.x) || 0) - origin.x);
      helpers.spawnHostileRedProjectileAt?.(origin, {
        angle: dir + helpers.randRange?.(-0.28, 0.28),
        speed: (Number(constants.composerGroupProjectileSpeed) || 0) * Math.max(0.45, Math.min(1, aggressionScale)),
        noteName,
        instrument: instrumentId,
        damage: Math.max(0.2, aggressionScale),
      });
      noteComposerExecutionStage('projectile_triggered', {
        hasGroup: true,
        instrumentId: String(instrumentId || '').trim(),
        note: String(noteName || '').trim(),
      });
    }
    logMusicLabExecution({
      sourceSystem: 'group',
      requestedNote,
      resolvedNote: noteName,
      noteWasClamped: requestedNote ? requestedNote !== noteName : false,
      enemyAudible,
      musicProminence,
      ...buildLeadThemeExecutionContext(group, enemy),
      ...buildPlaybackLoggingContext(instrumentId, triggerVolume),
    });
    noteComposerExecutionStage('completed', {
      hasGroup: true,
      instrumentId: String(instrumentId || '').trim(),
      note: String(noteName || '').trim(),
    });
    noteIntroSlotExecution('execute_completed', {
      admissionReason: '',
    });
    return true;
  });
  }

  if (actionType === 'enemy-death-accent') {
    return withPerfSample('pickupsCombat.weaponRuntime.stepChange.processEvents.execute.deathAccent', () => {
    const musicProminence = normalizeEnemyProminenceForPlayerStep(
      String(ev?.payload?.musicProminence || 'quiet').trim().toLowerCase() || 'quiet'
    );
    const prominenceGain = resolveMusicProminenceGain(musicProminence);
    const enemyAudible = isMaskingAudibleProminence(musicProminence);
    const requestedNote = String(ev?.payload?.requestedNoteRaw || ev.note || '').trim();
    const noteName = helpers.clampNoteToDirectorPool?.(requestedNote || ev.note, beatIndex + ev.actorId);
    const eventKeyRaw = String(ev?.payload?.soundEventKey || '').trim();
    const eventKey = constants.swarmSoundEvents?.[eventKeyRaw]
      ? eventKeyRaw
      : helpers.resolveEnemyDeathEventKey?.(ev?.payload?.soundFamily, 'enemyDeathMedium');
    if (prominenceGain > 0) {
      helpers.noteSwarmSoundEvent?.(
        eventKey,
        Math.max(0.001, Math.min(1, (Number(ev?.payload?.volume) || 0) * prominenceGain)),
        beatIndex,
        noteName,
        {
          authoringClass: String(ev?.payload?.authoringClass || 'gameplayauthored').trim().toLowerCase(),
          sourceSystem: String(ev?.sourceSystem || 'death').trim().toLowerCase(),
          actionType,
          countInTimingAuthority: false,
        }
      );
    }
    logMusicLabExecution({
      sourceSystem: 'death',
      requestedNote,
      resolvedNote: noteName,
      noteWasClamped: requestedNote ? requestedNote !== noteName : false,
      enemyAudible,
      musicProminence,
    });
    return true;
  });
  }

  if (actionType === 'player-weapon-step') {
    return withPerfSample('pickupsCombat.weaponRuntime.stepChange.processEvents.execute.player', () => {
    let centerWorld = null;
    let playerStepIndex = 0;
    let playerFireOptions = null;
    withPerfSample('pickupsCombat.weaponRuntime.stepChange.processEvents.execute.player.prep', () => {
      const origin = ev?.payload?.centerWorld;
      centerWorld = origin && Number.isFinite(origin.x) && Number.isFinite(origin.y)
        ? { x: Number(origin.x) || 0, y: Number(origin.y) || 0 }
        : helpers.getViewportCenterWorld?.();
      playerStepIndex = Math.trunc(Number(ev.stepIndex) || 0);
      playerFireOptions = {
        playerSoundVolumeMult: Math.max(0.1, Math.min(1, Number(ev?.payload?.playerSoundVolumeMult) || 1)),
        foundationPresent: ev?.payload?.foundationPresent === true,
      };
    });
    const fireResult = withPerfSample('pickupsCombat.weaponRuntime.stepChange.processEvents.execute.player.fire', () => (
      helpers.fireConfiguredWeaponsOnBeat?.(
        centerWorld,
        playerStepIndex,
        beatIndex,
        playerFireOptions
      )
    ));
    logMusicLabExecution({
      sourceSystem: 'player',
      playerAudible: fireResult?.playerAudible === true,
    });
    return true;
  });
  }

  // Compatibility path for legacy/generic projectile events that do not map to a gameplay actor handler.
  if (actionType === 'projectile') {
    return withPerfSample('pickupsCombat.weaponRuntime.stepChange.processEvents.execute.genericProjectile', () => {
    const enemy = enemyForAction || helpers.getSwarmEnemyById?.(ev.actorId);
    if (!enemy) return false;
    const group = helpers.getEnemyMusicGroup?.(enemy, 'projectile');
    const role = ev.role
      || group?.role
      || helpers.getSwarmRoleForEnemy?.(enemy, constants.roles?.accent);
    const instrumentId = helpers.resolveSwarmRoleInstrumentId?.(
      role,
      helpers.resolveSwarmSoundInstrumentId?.('projectile') || 'tone'
    );
    const requestedNote = String(ev?.payload?.requestedNoteRaw || ev.note || '').trim();
    const noteName = helpers.clampNoteToDirectorPool?.(requestedNote || ev.note, beatIndex + ev.stepIndex + ev.actorId);
    const musicProminence = normalizeEnemyProminenceForPlayerStep(
      String(ev?.payload?.musicProminence || 'quiet').trim().toLowerCase() || 'quiet'
    );
    const prominenceGain = resolveMusicProminenceGain(musicProminence);
    const enemyAudible = isMaskingAudibleProminence(musicProminence);
    const triggerVolume = (Number(constants.drawSnakeTriggerSoundVolume) || 0.32) * prominenceGain;
    if (group) {
      group.instrumentId = instrumentId;
      group.role = helpers.normalizeSwarmRole?.(role, constants.roles?.accent);
      group.note = noteName;
      helpers.syncSingletonEnemyStateFromMusicGroup?.(enemy, group);
    }
    noteExecutedInstrumentChange(instrumentId, enemy, group);
    helpers.pulseEnemyMusicalRoleVisual?.(enemy, enemyAudible ? 'strong' : 'soft');
    if (enemyAudible && prominenceGain > 0) {
      try { helpers.triggerInstrument?.(instrumentId, noteName, undefined, 'master', {}, triggerVolume); } catch {}
    }
    logMusicLabExecution({
      sourceSystem: String(ev?.sourceSystem || ev?.payload?.sourceSystem || 'group').trim().toLowerCase() || 'group',
      requestedNote,
      resolvedNote: noteName,
      noteWasClamped: requestedNote ? requestedNote !== noteName : false,
      enemyAudible,
      musicProminence,
      ...buildPlaybackLoggingContext(instrumentId, triggerVolume),
    });
    return true;
  });
  }

  return false;
}
