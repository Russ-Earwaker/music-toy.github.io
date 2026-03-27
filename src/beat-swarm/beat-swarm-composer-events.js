import { normalizeCallResponseLane, chooseResponseNoteFromPool } from './beat-swarm-groups.js';

function normalizeLifecycleState(value, fallback = 'active') {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'active') return 'active';
  if (raw === 'retiring') return 'retiring';
  if (raw === 'deemphasized' || raw === 'de_emphasized' || raw === 'de-emphasized') return 'deEmphasized';
  if (raw === 'inactiveforscheduling' || raw === 'inactive_for_scheduling' || raw === 'inactive-for-scheduling') return 'inactiveForScheduling';
  const fb = String(fallback || 'active').trim().toLowerCase();
  if (fb === 'retiring') return 'retiring';
  if (fb === 'deemphasized' || fb === 'de_emphasized' || fb === 'de-emphasized') return 'deEmphasized';
  if (fb.includes('inactive')) return 'inactiveForScheduling';
  return 'active';
}

function normalizePhraseNoteList(values, normalizeNoteName) {
  if (!Array.isArray(values) || !values.length) return [];
  const out = [];
  const seen = new Set();
  for (const v of values) {
    const note = normalizeNoteName(v);
    if (!note || seen.has(note)) continue;
    seen.add(note);
    out.push(note);
  }
  return out;
}

function getPhraseStepState(stepAbs = 0, phraseSteps = 4) {
  const steps = Math.max(2, Math.trunc(Number(phraseSteps) || 4));
  const abs = Math.max(0, Math.trunc(Number(stepAbs) || 0));
  const stepInPhrase = ((abs % steps) + steps) % steps;
  const stepsToEnd = Math.max(0, (steps - 1) - stepInPhrase);
  const nearPhraseEnd = stepsToEnd <= Math.max(1, Math.floor(steps * 0.25));
  const resolutionOpportunity = stepsToEnd === 0;
  return {
    phraseSteps: steps,
    stepInPhrase,
    stepsToEnd,
    nearPhraseEnd,
    resolutionOpportunity,
  };
}

function pickClosestPhraseTarget(noteName, targets, options = null) {
  const normalizeNoteName = typeof options?.normalizeNoteName === 'function'
    ? options.normalizeNoteName
    : ((n) => String(n || '').trim());
  const getNotePoolIndex = typeof options?.getNotePoolIndex === 'function'
    ? options.getNotePoolIndex
    : (() => -1);
  const note = normalizeNoteName(noteName);
  const candidateNotes = normalizePhraseNoteList(targets, normalizeNoteName);
  if (!candidateNotes.length) return '';
  const noteIdx = Math.max(-1, Math.trunc(Number(getNotePoolIndex(note)) || -1));
  if (noteIdx < 0) return candidateNotes[0];
  let picked = candidateNotes[0];
  let best = Number.POSITIVE_INFINITY;
  for (const candidate of candidateNotes) {
    const idx = Math.max(-1, Math.trunc(Number(getNotePoolIndex(candidate)) || -1));
    if (idx < 0) continue;
    const dist = Math.abs(idx - noteIdx);
    if (dist < best) {
      best = dist;
      picked = candidate;
    }
  }
  return picked;
}

export function chooseComposerGroupEnemyForNote(options = null) {
  const group = options?.group || null;
  const aliveMembers = Array.isArray(options?.aliveMembers) ? options.aliveMembers : [];
  const normalizeNoteName = typeof options?.normalizeNoteName === 'function' ? options.normalizeNoteName : ((n) => String(n || '').trim());
  const getFallbackNote = typeof options?.getFallbackNote === 'function' ? options.getFallbackNote : (() => '');
  const noteName = options?.noteName;
  const note = normalizeNoteName(noteName) || getFallbackNote();
  const aliveIds = new Set(aliveMembers.map((e) => Math.trunc(Number(e?.id) || 0)));
  const pinned = Math.trunc(Number(group?.noteToEnemyId?.get?.(note)) || 0);
  if (pinned > 0 && aliveIds.has(pinned)) {
    return aliveMembers.find((e) => Math.trunc(Number(e?.id) || 0) === pinned) || null;
  }
  if (!aliveMembers.length) return null;
  const picked = aliveMembers[Math.max(0, Math.min(aliveMembers.length - 1, Math.trunc(Math.random() * aliveMembers.length)))] || null;
  if (picked) group?.noteToEnemyId?.set?.(note, Math.trunc(Number(picked.id) || 0));
  return picked;
}

export function collectComposerGroupStepBeatEvents(options = null) {
  const events = [];
  if (!options?.active || options?.gameplayPaused) return events;
  if (options?.introLeadStabilizationActive === true) return events;

  const composerEnemyGroups = Array.isArray(options?.composerEnemyGroups) ? options.composerEnemyGroups : [];
  const hasIntroPercussionCarrier = composerEnemyGroups.some((g) => g && g.active && !g.retiring && g?.introPercussionCarrier === true);
  const hasSoloCarrier = composerEnemyGroups.some((g) => {
    if (!g || !g.active || g.retiring) return false;
    const soloCarrierType = String(g?.soloCarrierType || '').trim().toLowerCase();
    return soloCarrierType === 'rhythm' || soloCarrierType === 'melody';
  });
  const getCurrentPacingCaps = typeof options?.getCurrentPacingCaps === 'function' ? options.getCurrentPacingCaps : (() => ({ responseMode: 'none' }));
  const pacingCaps = getCurrentPacingCaps();
  const responseMode = String(pacingCaps?.responseMode || 'none');
  if ((responseMode === 'none' || responseMode === 'drawsnake') && !hasIntroPercussionCarrier && !hasSoloCarrier) return events;

  const constants = options?.constants && typeof options.constants === 'object' ? options.constants : {};
  const stepIndex = Math.trunc(Number(options?.stepIndex) || 0);
  const beatIndex = Math.trunc(Number(options?.beatIndex) || 0);
  const barIndex = Math.max(0, Math.trunc(Number(options?.barIndex) || 0));
  const stepAbs = Math.max(0, stepIndex);
  const stepsPerBar = Math.max(1, Math.trunc(Number(constants.stepsPerBar) || 8));
  const step = ((stepIndex % stepsPerBar) + stepsPerBar) % stepsPerBar;
  const performersMin = Math.max(1, Math.trunc(Number(constants.performersMin) || 1));
  const performersMax = Math.max(performersMin, Math.trunc(Number(constants.performersMax) || 2));

  const activeGroups = composerEnemyGroups.filter((g) => g && g.active && !g.retiring);
  const getCallResponseWindowSteps = typeof options?.getCallResponseWindowSteps === 'function' ? options.getCallResponseWindowSteps : (() => 1);
  const responseWindowSteps = Math.max(1, Math.trunc(Number(getCallResponseWindowSteps()) || 1));
  const isCallResponseLaneActive = typeof options?.isCallResponseLaneActive === 'function' ? options.isCallResponseLaneActive : (() => true);
  const callResponseRuntime = options?.callResponseRuntime && typeof options.callResponseRuntime === 'object' ? options.callResponseRuntime : {};
  const structureIntentRuntime = options?.structureIntentRuntime && typeof options.structureIntentRuntime === 'object'
    ? options.structureIntentRuntime
    : null;
  const directorLanePlan = options?.directorLanePlan && typeof options.directorLanePlan === 'object'
    ? options.directorLanePlan
    : null;
  const noteMusicSystemEvent = typeof options?.noteMusicSystemEvent === 'function' ? options.noteMusicSystemEvent : null;
  const noteIntroDebug = typeof options?.noteIntroDebug === 'function' ? options.noteIntroDebug : null;
  const directTriggerComposerCarrier = typeof options?.directTriggerComposerCarrier === 'function'
    ? options.directTriggerComposerCarrier
    : null;

  const getAliveEnemiesByIds = typeof options?.getAliveEnemiesByIds === 'function' ? options.getAliveEnemiesByIds : (() => []);
  const getFoundationLaneSnapshot = typeof options?.getFoundationLaneSnapshot === 'function'
    ? options.getFoundationLaneSnapshot
    : null;
  const clampNoteToDirectorPool = typeof options?.clampNoteToDirectorPool === 'function' ? options.clampNoteToDirectorPool : ((n) => String(n || ''));
  const clampNoteToDirectorRegisterTarget = typeof options?.clampNoteToDirectorRegisterTarget === 'function'
    ? options.clampNoteToDirectorRegisterTarget
    : ((n, i) => clampNoteToDirectorPool(n, i));
  const normalizeSwarmNoteName = typeof options?.normalizeSwarmNoteName === 'function' ? options.normalizeSwarmNoteName : ((n) => String(n || '').trim());
  const getRandomSwarmPentatonicNote = typeof options?.getRandomSwarmPentatonicNote === 'function' ? options.getRandomSwarmPentatonicNote : (() => 'C4');
  const getDirectorNotePool = typeof options?.getDirectorNotePool === 'function' ? options.getDirectorNotePool : (() => []);
  const getNotePoolIndex = typeof options?.getNotePoolIndex === 'function' ? options.getNotePoolIndex : (() => -1);
  const getPhraseLengthSteps = typeof options?.getPhraseLengthSteps === 'function' ? options.getPhraseLengthSteps : (() => 4);
  const normalizeSwarmRole = typeof options?.normalizeSwarmRole === 'function' ? options.normalizeSwarmRole : ((r, f) => String(r || f || '').trim().toLowerCase());
  const inferInstrumentLaneFromCatalogId = typeof options?.inferInstrumentLaneFromCatalogId === 'function'
    ? options.inferInstrumentLaneFromCatalogId
    : ((_, fallbackLane = 'lead') => String(fallbackLane || 'lead').trim().toLowerCase() || 'lead');
  const getIdForDisplayName = typeof options?.getIdForDisplayName === 'function'
    ? options.getIdForDisplayName
    : (() => '');
  const getSwarmRoleForEnemy = typeof options?.getSwarmRoleForEnemy === 'function' ? options.getSwarmRoleForEnemy : (() => String(options?.roles?.lead || 'lead'));
  const resolveSwarmRoleInstrumentId = typeof options?.resolveSwarmRoleInstrumentId === 'function' ? options.resolveSwarmRoleInstrumentId : ((_, fallback) => fallback);
  const resolveSwarmSoundInstrumentId = typeof options?.resolveSwarmSoundInstrumentId === 'function' ? options.resolveSwarmSoundInstrumentId : (() => 'tone');
  const createPerformedBeatEvent = typeof options?.createPerformedBeatEvent === 'function' ? options.createPerformedBeatEvent : ((evt) => evt);
  const chooseEnemyForNote = typeof options?.chooseEnemyForNote === 'function' ? options.chooseEnemyForNote : ((o) => chooseComposerGroupEnemyForNote(o));
  const roles = options?.roles && typeof options.roles === 'object' ? options.roles : {};
  const threat = options?.threat && typeof options.threat === 'object' ? options.threat : {};
  const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));
  const styleProfile = options?.styleProfile && typeof options.styleProfile === 'object' ? options.styleProfile : {};
  const styleId = String(styleProfile?.id || '').trim().toLowerCase();
  const motifRepeatBias = Math.max(0, Math.min(1, Number(styleProfile?.motifRepeatBias) || 0));
  const leadLeapChance = Math.max(0, Math.min(1, Number(styleProfile?.leadLeapChance) || 1));
  const accentPitchVariance = Math.max(0, Math.min(1, Number(styleProfile?.accentPitchVariance) || 1));
  const laneDrivenFoundation = options?.laneDrivenFoundation === true;
  const laneDrivenPrimaryLoop = options?.laneDrivenPrimaryLoop === true;
  const answerLanePlan = directorLanePlan && typeof directorLanePlan === 'object'
    ? (directorLanePlan.answer || null)
    : null;
  const directorWantsAnswerGroup = answerLanePlan?.active === true
    && String(answerLanePlan?.preferredCarrier || '').trim().toLowerCase() === 'group';
  const answerLaneIntensity = Math.max(0, Number(answerLanePlan?.intensity) || 0);
  const primaryLoopLanePlan = directorLanePlan && typeof directorLanePlan === 'object'
    ? (directorLanePlan.primary_loop || null)
    : null;
  const strongLeadWindowActive = primaryLoopLanePlan?.active === true
    && Math.max(0, Number(primaryLoopLanePlan?.intensity) || 0) >= 0.66;
  const structureIntent = String(structureIntentRuntime?.intent || '').trim().toLowerCase();
  const preDropActive = structureIntentRuntime?.preDropActive === true;
  const minResponseDelaySteps = 2;
  const globalResponseCooldownSteps = directorWantsAnswerGroup
    ? (preDropActive ? 8 : (answerLaneIntensity >= 0.72 ? 5 : 6))
    : 0;
  const callAdmissionCooldownSteps = directorWantsAnswerGroup
    ? (preDropActive ? 12 : (answerLaneIntensity >= 0.72 ? 8 : 10))
    : 0;
  const responseWindowGraceSteps = 2;
  const responsePhraseSteps = 2;
  const responseLengthCap = preDropActive
    ? 1
    : (structureIntent === 'build' ? 3 : 4);
  const responseCadenceRestSteps = directorWantsAnswerGroup
    ? (preDropActive ? 2 : (strongLeadWindowActive ? 3 : 2))
    : 1;
  const callCadenceRestSteps = 1;
  const getPendingCallExpiry = (callStepAbs, targetLength) => {
    const lastCallStep = Math.max(-1, Math.trunc(Number(callStepAbs) || -1));
    if (lastCallStep < 0) return -1;
    const target = Math.max(1, Math.trunc(Number(targetLength) || 2));
    return lastCallStep + responseWindowSteps + responseWindowGraceSteps + Math.max(1, target);
  };
  const getGroupRegisterTarget = ({ lane = '', isBassRole = false, isPrimaryLoopOwnerGroup = false, isFoundationBufferGroup = false }) => {
    if (isBassRole || isFoundationBufferGroup) return 'low';
    if (isPrimaryLoopOwnerGroup) return 'mid';
    if (lane === 'response') return 'high';
    if (lane === 'call') return 'high';
    return 'mid';
  };

  for (const group of composerEnemyGroups) {
    if (!group || !group.active || group.retiring) continue;
    const lifecycleState = normalizeLifecycleState(group?.lifecycleState, 'active');
    if (lifecycleState === 'retiring') continue;
    const introPercussionCarrier = group?.introPercussionCarrier === true;
    const soloCarrierType = String(group?.soloCarrierType || '').trim().toLowerCase();
    const musicProfileSourceType = String(group?.musicProfileSourceType || '').trim().toLowerCase();
    const soloRhythmCarrier = soloCarrierType === 'rhythm';
    const rhythmProfileCarrier = musicProfileSourceType === 'spawner_rhythm';
    const melodyProfileCarrier = musicProfileSourceType === 'snake_melody';
    const rhythmPercussionCarrier = introPercussionCarrier || rhythmProfileCarrier;
    const isSoloCarrier = soloCarrierType === 'rhythm' || soloCarrierType === 'melody';
    const lane = isSoloCarrier ? 'solo' : normalizeCallResponseLane(group?.callResponseLane, 'call');
    const groupId = Math.max(0, Math.trunc(Number(group?.id) || 0));
    const noteResponseDiagnostic = (reason, extra = null) => {
      if (lane !== 'response' || !noteMusicSystemEvent) return;
      noteMusicSystemEvent('music_call_response_response_group_state', {
        groupId,
        stepIndex: stepAbs,
        beatIndex,
        reason: String(reason || '').trim().toLowerCase(),
        callStepAbs: Math.max(-1, Math.trunc(Number(callResponseRuntime.lastCallStepAbs) || -1)),
        responseHoldUntilStepAbs: Math.max(-1, Math.trunc(Number(callResponseRuntime.responseHoldUntilStepAbs) || -1)),
        activeResponseGroupId: Math.max(0, Math.trunc(Number(callResponseRuntime.activeResponseGroupId) || 0)),
        lifecycleState,
        ...(extra && typeof extra === 'object' ? extra : {}),
      });
    };
    const noteCallDiagnostic = (reason, extra = null) => {
      if (lane !== 'call' || !noteMusicSystemEvent) return;
      noteMusicSystemEvent('music_call_response_call_group_state', {
        groupId,
        stepIndex: stepAbs,
        beatIndex,
        reason: String(reason || '').trim().toLowerCase(),
        callStepAbs: Math.max(-1, Math.trunc(Number(callResponseRuntime.lastCallStepAbs) || -1)),
        lastResponseStepAbs: Math.max(-1, Math.trunc(Number(callResponseRuntime.lastResponseStepAbs) || -1)),
        pendingCallExpiresStepAbs: Math.max(-1, Math.trunc(Number(callResponseRuntime.pendingCallExpiresStepAbs) || -1)),
        activeResponseGroupId: Math.max(0, Math.trunc(Number(callResponseRuntime.activeResponseGroupId) || 0)),
        lifecycleState,
        ...(extra && typeof extra === 'object' ? extra : {}),
      });
    };
    let continuingResponsePhrase = false;
    let responseOverrideHit = false;
    let hasLiveCallWindow = false;
    let sinceCall = -1;
    let laneActive = (isSoloCarrier || introPercussionCarrier) ? true : isCallResponseLaneActive(lane, stepAbs, activeGroups.length);
    if (!isSoloCarrier && lane === 'response') {
      const lastCallStep = Math.max(-1, Math.trunc(Number(callResponseRuntime.lastCallStepAbs) || -1));
      sinceCall = lastCallStep >= 0 ? (stepAbs - lastCallStep) : -1;
      const pendingCallExpiresStepAbs = Math.max(
        Math.trunc(Number(callResponseRuntime.pendingCallExpiresStepAbs) || -1),
        getPendingCallExpiry(lastCallStep, callResponseRuntime.responsePhraseTargetLength)
      );
      continuingResponsePhrase = groupId > 0
        && groupId === Math.max(0, Math.trunc(Number(callResponseRuntime.activeResponseGroupId) || 0))
        && stepAbs <= Math.max(-1, Math.trunc(Number(callResponseRuntime.responseHoldUntilStepAbs) || -1));
      hasLiveCallWindow = lastCallStep >= 0 && sinceCall >= minResponseDelaySteps && stepAbs <= pendingCallExpiresStepAbs;
      if (!laneActive && (continuingResponsePhrase || hasLiveCallWindow)) laneActive = true;
      if (!laneActive && directorWantsAnswerGroup && hasLiveCallWindow) laneActive = true;
    }
    if (!laneActive) {
      noteCallDiagnostic('lane_inactive');
      noteResponseDiagnostic('lane_inactive', lane === 'response'
        ? {
          continuingResponsePhrase,
          hasLiveCallWindow,
        }
        : null);
      continue;
    }
    if (isSoloCarrier) {
      continuingResponsePhrase = false;
      responseOverrideHit = false;
      hasLiveCallWindow = false;
      sinceCall = -1;
    }
    if (!isSoloCarrier && !introPercussionCarrier && lane === 'call' && directorWantsAnswerGroup) {
      const responsePhraseActive = (
        Math.max(0, Math.trunc(Number(callResponseRuntime.activeResponseGroupId) || 0)) > 0
        && stepAbs <= Math.max(-1, Math.trunc(Number(callResponseRuntime.responseHoldUntilStepAbs) || -1))
      );
      if (responsePhraseActive) {
        noteCallDiagnostic('response_phrase_active');
        continue;
      }
    }
    if (lane === 'response') {
      if (!continuingResponsePhrase) {
        if (!hasLiveCallWindow) {
          noteResponseDiagnostic('no_call_window', {
            sinceCall,
            pendingCallExpiresStepAbs: Math.max(-1, Math.trunc(Number(callResponseRuntime.pendingCallExpiresStepAbs) || -1)),
          });
          continue;
        }
      }
      if (groupId > 0 && groupId === Math.max(0, Math.trunc(Number(callResponseRuntime.lastCallGroupId) || 0))) {
        noteResponseDiagnostic('same_group_as_call');
        continue;
      }
      const lastRespStep = Math.max(-1, Math.trunc(Number(callResponseRuntime.lastResponseStepAbs) || -1));
      const sameRespGroup = groupId > 0 && groupId === Math.max(0, Math.trunc(Number(callResponseRuntime.lastResponseGroupId) || 0));
      const responseWindowWithGrace = responseWindowSteps + responseWindowGraceSteps;
      if (
        !continuingResponsePhrase
        && globalResponseCooldownSteps > 0
        && lastRespStep >= 0
        && (stepAbs - lastRespStep) < globalResponseCooldownSteps
      ) {
        noteResponseDiagnostic('global_response_cooldown', {
          lastRespStep,
          sinceLastResponse: stepAbs - lastRespStep,
        });
        continue;
      }
      if (!continuingResponsePhrase && sameRespGroup && lastRespStep >= 0 && (stepAbs - lastRespStep) <= responseWindowWithGrace) {
        noteResponseDiagnostic('response_cooldown', { lastRespStep, sinceLastResponse: stepAbs - lastRespStep });
        continue;
      }
    const responseProgressNow = Math.max(0, Math.trunc(Number(callResponseRuntime.responsePhraseProgress) || 0));
      const responseTargetNow = Math.max(1, Math.trunc(Number(callResponseRuntime.responsePhraseTargetLength) || 2));
      const sinceLastResponse = Math.max(
        -1,
        stepAbs - Math.max(-1, Math.trunc(Number(callResponseRuntime.lastResponseStepAbs) || -1))
      );
      responseOverrideHit = (
        !continuingResponsePhrase
        && (sinceCall === minResponseDelaySteps || sinceCall === (minResponseDelaySteps + 1))
      ) || (
        continuingResponsePhrase
        && responseProgressNow < responseTargetNow
        && sinceLastResponse >= responsePhraseSteps
        && sinceLastResponse <= (responsePhraseSteps + 1)
      );
    }

    const stepActive = Array.isArray(group.steps) && !!group.steps[step];
    if (!stepActive && !responseOverrideHit) {
      noteCallDiagnostic('step_inactive');
      noteResponseDiagnostic('step_inactive');
      continue;
    }
    const phraseRestUntilStepAbs = Math.max(-1, Math.trunc(Number(group?.__bsPhraseRestUntilStep) || -1));
    if (phraseRestUntilStepAbs >= stepAbs) {
      if (introPercussionCarrier && noteIntroDebug) {
        noteIntroDebug('intro_percussion_suppressed', {
          reason: 'post_cadence_rest',
          groupId,
          stepIndex: stepAbs,
        });
      }
      noteCallDiagnostic('post_cadence_rest', { restUntilStepAbs: phraseRestUntilStepAbs });
      noteResponseDiagnostic('post_cadence_rest', { restUntilStepAbs: phraseRestUntilStepAbs });
      continue;
    }
    const aliveMembers = getAliveEnemiesByIds(group.memberIds).filter((e) => {
      if (String(e?.enemyType || '') !== 'composer-group-member') return false;
      if (e?.retreating !== true) return true;
      if (!isSoloCarrier) return false;
      const tailUntilStep = Math.max(0, Math.trunc(Number(e?.musicLoopTailUntilStep) || 0));
      return tailUntilStep >= stepAbs;
    });
    if (!aliveMembers.length) {
      if (introPercussionCarrier && noteIntroDebug) {
        noteIntroDebug('intro_percussion_suppressed', {
          reason: 'no_alive_members',
          groupId,
          stepIndex: stepAbs,
        });
      }
      noteCallDiagnostic('no_alive_members');
      noteResponseDiagnostic('no_alive_members');
      continue;
    }

    const groupRole = normalizeSwarmRole(group?.role || roles.lead, roles.lead);
    const isBassRole = groupRole === String(roles?.bass || 'bass');
    const groupLaneId = String(group?.musicLaneId || '').trim().toLowerCase();
    const isPrimaryLoopOwnerGroup = groupLaneId === 'primary_loop_lane';
    const isFoundationBufferGroup = String(group?.sectionId || '').trim().toLowerCase() === 'foundation-buffer';
    if (laneDrivenFoundation && isBassRole) {
      noteCallDiagnostic('lane_driven_foundation');
      noteResponseDiagnostic('lane_driven_foundation');
      continue;
    }
    if (
      laneDrivenPrimaryLoop
      && lane !== 'response'
      && lane !== 'call'
      && groupRole === String(roles?.lead || 'lead')
      && groupLaneId === 'primary_loop_lane'
    ) {
      noteCallDiagnostic('lane_driven_primary_loop');
      noteResponseDiagnostic('lane_driven_primary_loop');
      continue;
    }
    const performerCount = (isBassRole || isFoundationBufferGroup || !isPrimaryLoopOwnerGroup)
      ? 1
      : Math.max(performersMin, Math.min(performersMax, Math.trunc(Number(group.performers) || 1)));
    if (isBassRole && getFoundationLaneSnapshot) {
      const lane = getFoundationLaneSnapshot(stepAbs, barIndex);
      if (!lane?.isActiveStep) {
        noteCallDiagnostic('foundation_step_inactive');
        noteResponseDiagnostic('foundation_step_inactive');
        continue;
      }
    }
    const melodyRows = Array.isArray(group?.rows) ? group.rows : [];
    const melodyProfileNote = (soloCarrierType === 'melody' || melodyProfileCarrier) && melodyRows.length
      ? (options?.getSwarmPentatonicNoteByIndex?.(Math.max(0, Math.trunc(Number(melodyRows[step] ?? melodyRows[0]) || 0)))
        || getRandomSwarmPentatonicNote())
      : '';
    const notesLen = Math.max(1, Array.isArray(group?.notes) ? group.notes.length : 0);
    const noteIdx = (isBassRole || rhythmPercussionCarrier || soloCarrierType === 'rhythm')
      ? 0
      : (Math.max(0, Math.trunc(Number(group.noteCursor) || 0)) % notesLen);
    const noteNameBaseRaw = normalizeSwarmNoteName(melodyProfileNote || group?.notes?.[noteIdx]) || getRandomSwarmPentatonicNote();
    const noteNameBase = (isBassRole || rhythmPercussionCarrier || soloCarrierType === 'rhythm')
      ? noteNameBaseRaw
      : clampNoteToDirectorPool(
        noteNameBaseRaw,
        stepAbs + noteIdx
      );
    const responsePool = getDirectorNotePool();
    const responseSeedNote = normalizeSwarmNoteName(
      chooseResponseNoteFromPool({
        callNote: callResponseRuntime.lastCallNote,
        fallbackNote: noteNameBaseRaw,
        stepAbs,
        notePool: responsePool,
        normalizeNoteName: normalizeSwarmNoteName,
      })
    ) || noteNameBaseRaw;
    let noteNameRaw = noteNameBaseRaw;
    if (lane === 'response') {
      const callNote = normalizeSwarmNoteName(callResponseRuntime.lastCallNote);
      const callIdx = callNote ? getNotePoolIndex(callNote) : -1;
      const seedIdx = getNotePoolIndex(responseSeedNote);
      const defaultDir = seedIdx >= 0 && callIdx >= 0 && seedIdx < callIdx ? -1 : 1;
      const responseDir = continuingResponsePhrase
        ? (Math.trunc(Number(callResponseRuntime.responseDirection) || defaultDir) || defaultDir)
        : defaultDir;
      const responseProgress = continuingResponsePhrase
        ? Math.max(0, Math.trunc(Number(callResponseRuntime.responsePhraseProgress) || 0))
        : 0;
      const responseTargetLength = continuingResponsePhrase
        ? Math.max(1, Math.trunc(Number(callResponseRuntime.responsePhraseTargetLength) || 2))
        : Math.max(1, Math.trunc(Number(callResponseRuntime.responsePhraseTargetLength) || 2));
      const responseOffsets = (() => {
        if (responseTargetLength <= 1) return [responseDir];
        if (responseTargetLength === 2) return [responseDir, 0];
        if (responseTargetLength === 3) return [responseDir, responseDir * 2, responseDir];
        return [responseDir, responseDir * 2, responseDir, 0];
      })();
      const responseIdx = callIdx >= 0
        ? (((callIdx + responseOffsets[Math.min(responseProgress, responseOffsets.length - 1)]) % responsePool.length) + responsePool.length) % responsePool.length
        : -1;
      noteNameRaw = responseIdx >= 0
        ? (normalizeSwarmNoteName(responsePool[responseIdx]) || responseSeedNote)
        : responseSeedNote;
    }
    const responsePhraseProgressForEvent = lane === 'response'
      ? (continuingResponsePhrase
        ? (Math.max(0, Math.trunc(Number(callResponseRuntime.responsePhraseProgress) || 0)) + 1)
        : 1)
      : 0;
    const registerTarget = getGroupRegisterTarget({
      lane,
      isBassRole,
      isPrimaryLoopOwnerGroup,
      isFoundationBufferGroup,
    });
    const noteName = (isBassRole || rhythmPercussionCarrier || soloCarrierType === 'rhythm')
      ? noteNameRaw
      : clampNoteToDirectorRegisterTarget(
        noteNameRaw,
        stepAbs + noteIdx + (lane === 'response' ? 1 : 0),
        registerTarget
      );
    const phraseStep = getPhraseStepState(stepAbs, getPhraseLengthSteps(lane, group, stepAbs));
    const phraseTargets = normalizePhraseNoteList([
      ...(Array.isArray(group?.resolutionTargets) ? group.resolutionTargets : []),
      group?.phraseRoot,
      group?.phraseFifth,
      ...(Array.isArray(group?.gravityNotes) ? group.gravityNotes : []),
    ], normalizeSwarmNoteName);
    const phraseGravityTargetBase = phraseStep.nearPhraseEnd
      ? pickClosestPhraseTarget(noteName, phraseTargets, {
        normalizeNoteName: normalizeSwarmNoteName,
        getNotePoolIndex,
      })
      : '';
    const phraseGravityTarget = phraseStep.resolutionOpportunity
      ? (normalizeSwarmNoteName(group?.phraseRoot) || phraseGravityTargetBase)
      : phraseGravityTargetBase;
    const gravityBiasChance = phraseStep.resolutionOpportunity ? 0.92 : 0.54;
    const phraseGravityOpportunity = !!phraseGravityTarget && phraseStep.nearPhraseEnd;
    const gravityNoteNameRaw = (phraseGravityOpportunity && Math.random() < gravityBiasChance)
      ? phraseGravityTarget
      : noteNameRaw;
    const gravityNoteName = (isBassRole || rhythmPercussionCarrier || soloCarrierType === 'rhythm')
      ? gravityNoteNameRaw
      : clampNoteToDirectorRegisterTarget(
        gravityNoteNameRaw,
        stepAbs + noteIdx + (lane === 'response' ? 1 : 0),
        registerTarget
      );
    let styledNoteName = gravityNoteName;
    if (styleId === 'retro_shooter') {
      const prevNote = normalizeSwarmNoteName(group?.__bsLastComposerNote);
      const currentNote = normalizeSwarmNoteName(gravityNoteName);
      const roleForStyle = groupRole;
      const prevIdx = prevNote ? getNotePoolIndex(prevNote) : -1;
      const currIdx = currentNote ? getNotePoolIndex(currentNote) : -1;
      if (roleForStyle === String(roles?.bass || 'bass')) {
        styledNoteName = gravityNoteName;
      } else if (!phraseStep.resolutionOpportunity && prevNote && Math.random() < (motifRepeatBias * 0.5)) {
        styledNoteName = prevNote;
      } else if (prevIdx >= 0 && currIdx >= 0 && Math.abs(currIdx - prevIdx) > 1 && Math.random() > leadLeapChance) {
        styledNoteName = prevNote;
      } else if (roleForStyle === String(roles?.accent || 'accent') && prevNote && Math.random() > accentPitchVariance) {
        styledNoteName = prevNote;
      }
    }
    if (phraseStep.resolutionOpportunity && phraseGravityOpportunity && !isBassRole && !rhythmPercussionCarrier && Math.random() < 0.84) {
      styledNoteName = clampNoteToDirectorRegisterTarget(
        phraseGravityTarget,
        stepAbs + noteIdx + (lane === 'response' ? 1 : 0),
        registerTarget
      );
    }
    const phraseGravityHit = phraseGravityOpportunity
      ? normalizeSwarmNoteName(styledNoteName) === normalizeSwarmNoteName(phraseGravityTarget)
      : false;
    const phraseResolutionOpportunity = phraseGravityOpportunity && phraseStep.resolutionOpportunity;
    const phraseResolutionHit = phraseResolutionOpportunity && phraseGravityHit;
    const localCadenceRestSteps = lane === 'response'
      ? responseCadenceRestSteps
      : callCadenceRestSteps;
    const postCadenceRestUntilStep = phraseStep.resolutionOpportunity
      ? (stepAbs + localCadenceRestSteps)
      : -1;
    group.noteCursor = noteIdx + 1;

    const performers = [];
    const usedEnemyIds = new Set();
    const primary = chooseEnemyForNote({
      group,
      noteName: styledNoteName,
      aliveMembers,
      normalizeNoteName: normalizeSwarmNoteName,
      getFallbackNote: getRandomSwarmPentatonicNote,
    });
    if (primary) {
      performers.push(primary);
      const primaryId = Math.trunc(Number(primary.id) || 0);
      if (primaryId > 0) usedEnemyIds.add(primaryId);
    }
    while (performers.length < performerCount) {
      const remaining = aliveMembers.filter((e) => !usedEnemyIds.has(Math.trunc(Number(e.id) || 0)));
      if (!remaining.length) break;
      const enemy = remaining[Math.max(0, Math.min(remaining.length - 1, Math.trunc(Math.random() * remaining.length)))] || null;
      if (!enemy) continue;
      const enemyId = Math.trunc(Number(enemy.id) || 0);
      if (!(enemyId > 0) || usedEnemyIds.has(enemyId)) continue;
      usedEnemyIds.add(enemyId);
      performers.push(enemy);
    }
    if (!performers.length) continue;
    noteResponseDiagnostic('emitted', {
      continuingResponsePhrase,
      responseOverrideHit,
      performerCount: performers.length,
    });

    const threatClass = (() => {
      const t = String(group?.threatLevel || threat.full || 'full').trim().toLowerCase();
      if (t === String(threat.cosmetic || 'cosmetic')) return String(threat.cosmetic || 'cosmetic');
      if (t === String(threat.light || 'light')) return String(threat.light || 'light');
      return String(threat.full || 'full');
    })();
    const lockedInstrumentId = String(
      (introPercussionCarrier
        ? (
          getIdForDisplayName('Bass Tone 3')
          || getIdForDisplayName('Bass Tone 4')
          || group?.instrumentId
          || ''
        )
        : group?.instrumentId)
        || performers[0]?.instrumentId
        || performers[0]?.musicInstrumentId
        || performers[0]?.composerInstrument
        || ''
    ).trim();
    const lockedLane = inferInstrumentLaneFromCatalogId(lockedInstrumentId, '');
    const resolvedRole = lockedLane === 'bass'
      ? 'bass'
      : normalizeSwarmRole(group?.role || getSwarmRoleForEnemy(performers[0], roles.lead), roles.lead);
    const instrumentId = lockedInstrumentId || resolveSwarmRoleInstrumentId(
      resolvedRole,
      resolveSwarmSoundInstrumentId('projectile') || 'tone'
    );
    const lifecycleAudioGain = lifecycleState === 'inactiveForScheduling'
      ? 0.35
      : (lifecycleState === 'deEmphasized' ? 0.52 : 1);
    const musicProminence = (() => {
      if (rhythmPercussionCarrier) return 'full';
      if (isSoloCarrier && soloCarrierType === 'melody') return 'full';
      if (isSoloCarrier && soloCarrierType === 'rhythm') return 'full';
      if (melodyProfileCarrier || rhythmProfileCarrier) return 'full';
      if (isPrimaryLoopOwnerGroup) return 'full';
      if (isFoundationBufferGroup) return 'trace';
      if (isBassRole) return 'quiet';
      if (lane === 'response') return 'trace';
      return 'trace';
    })();
    const musicLayer = isBassRole ? 'foundation' : 'loops';
    const restrainedGroupGain = (() => {
      if (rhythmPercussionCarrier) return 1;
      if (isSoloCarrier) return 0.92;
      if (melodyProfileCarrier || rhythmProfileCarrier) return 0.92;
      if (isPrimaryLoopOwnerGroup) return 1;
      if (isFoundationBufferGroup) return 0.4;
      if (isBassRole) return 0.56;
      if (strongLeadWindowActive && directorWantsAnswerGroup) {
        if (lane === 'response') return 0.38;
        if (lane === 'call') return 0.24;
      }
      if (lane === 'response') return 0.5;
      return 0.46;
    })();
    const melodicCallGroup = (
      lane === 'call'
      && !isBassRole
      && !isFoundationBufferGroup
    );
    const suppressNonMelodicCallLane = (
      !rhythmPercussionCarrier
      && !isSoloCarrier
      && lane === 'call'
      && !melodicCallGroup
    );
    if (suppressNonMelodicCallLane) {
      noteCallDiagnostic('non_melodic_call_suppressed', {
        isBassRole,
        isFoundationBufferGroup,
      });
      continue;
    }
    const strongCallCandidate = melodicCallGroup
      ? (isPrimaryLoopOwnerGroup
        || phraseStep.stepInPhrase <= 2
        || phraseResolutionOpportunity
        || phraseGravityOpportunity
        || phraseResolutionHit
        || phraseGravityHit
        || phraseStep.stepInPhrase === Math.max(0, responsePhraseSteps - 1))
      : false;
    const answerWindowSelectiveCallGate = (
      !isSoloCarrier
      && lane === 'call'
      && directorWantsAnswerGroup
      && strongLeadWindowActive
      && melodicCallGroup
      && !isPrimaryLoopOwnerGroup
      && !phraseResolutionOpportunity
      && !phraseResolutionHit
      && !phraseGravityHit
      && phraseStep.stepInPhrase > 1
    );
    if (answerWindowSelectiveCallGate) {
      noteCallDiagnostic('answer_window_selective_call_gate', {
        stepInPhrase: Math.max(0, Math.trunc(Number(phraseStep?.stepInPhrase) || 0)),
        phraseGravityOpportunity,
        phraseResolutionOpportunity,
        phraseResolutionHit,
        phraseGravityHit,
      });
      continue;
    }
    const callAdmission = (() => {
      if (!strongCallCandidate) return { accepted: false, reason: 'not_strong_call' };
      const lastCallStep = Math.max(-1, Math.trunc(Number(callResponseRuntime.lastCallStepAbs) || -1));
      const pendingCallExpiresStepAbs = Math.max(
        Math.trunc(Number(callResponseRuntime.pendingCallExpiresStepAbs) || -1),
        getPendingCallExpiry(lastCallStep, callResponseRuntime.responsePhraseTargetLength)
      );
      const pendingResponse = (
        Math.max(0, Math.trunc(Number(callResponseRuntime.activeResponseGroupId) || 0)) > 0
        && stepAbs <= Math.max(-1, Math.trunc(Number(callResponseRuntime.responseHoldUntilStepAbs) || -1))
      );
      if (pendingResponse) return { accepted: false, reason: 'pending_response' };
      if (
        directorWantsAnswerGroup
        && callAdmissionCooldownSteps > 0
        && lastCallStep >= 0
        && (stepAbs - lastCallStep) < callAdmissionCooldownSteps
      ) {
        return { accepted: false, reason: 'call_cooldown' };
      }
      if (lastCallStep < 0) return { accepted: true, reason: 'accepted' };
      const answeredCurrentCall = Math.max(-1, Math.trunc(Number(callResponseRuntime.lastResponseStepAbs) || -1)) >= lastCallStep;
      if (!answeredCurrentCall && stepAbs <= pendingCallExpiresStepAbs) {
        return { accepted: false, reason: 'pending_call_exists' };
      }
      return { accepted: true, reason: 'accepted' };
    })();
    const acceptedStrongCall = callAdmission.accepted === true;
    const suppressInactiveSupportCall = (
      !isSoloCarrier
      && melodicCallGroup
      && !isPrimaryLoopOwnerGroup
      && !isFoundationBufferGroup
      && !isBassRole
      && (lifecycleState === 'inactiveForScheduling' || lifecycleState === 'deEmphasized')
      && !acceptedStrongCall
      && !phraseResolutionOpportunity
      && !phraseGravityOpportunity
      && phraseStep.stepInPhrase > 2
    );
    if (suppressInactiveSupportCall) {
      noteCallDiagnostic('inactive_support_suppressed', {
        strongCallCandidate,
        acceptedStrongCall,
        admissionReason: callAdmission.reason,
        stepInPhrase: Math.max(0, Math.trunc(Number(phraseStep?.stepInPhrase) || 0)),
      });
      noteResponseDiagnostic('inactive_support_suppressed');
      continue;
    }
    const suppressRedundantCallEmission = (
      !isSoloCarrier
      && melodicCallGroup
      && !acceptedStrongCall
      && (
        !strongCallCandidate
        || callAdmission.reason === 'pending_call_exists'
        || callAdmission.reason === 'pending_response'
        || callAdmission.reason === 'not_strong_call'
      )
    );
    if (suppressRedundantCallEmission) {
      noteCallDiagnostic('redundant_call_suppressed', {
        strongCallCandidate,
        acceptedStrongCall,
        admissionReason: callAdmission.reason,
        stepInPhrase: Math.max(0, Math.trunc(Number(phraseStep?.stepInPhrase) || 0)),
      });
      continue;
    }
    group.__bsPhraseRestUntilStep = phraseResolutionHit
      ? (stepAbs + localCadenceRestSteps)
      : Math.max(-1, postCadenceRestUntilStep);
    noteCallDiagnostic('emitted', {
      performerCount: performers.length,
      strongCallCandidate,
      acceptedStrongCall,
      admissionReason: callAdmission.reason,
      stepInPhrase: Math.max(0, Math.trunc(Number(phraseStep?.stepInPhrase) || 0)),
      phraseGravityOpportunity,
      phraseResolutionOpportunity,
      phraseGravityHit,
      phraseResolutionHit,
    });
    for (const enemy of performers) {
      events.push(createPerformedBeatEvent({
        actorId: Math.max(0, Math.trunc(Number(enemy?.id) || 0)),
        beatIndex,
        stepIndex: stepAbs,
        role: lockedLane === 'bass'
          ? 'bass'
          : normalizeSwarmRole(group?.role || getSwarmRoleForEnemy(enemy, roles.lead), roles.lead),
        note: styledNoteName,
        instrumentId,
        actionType: String(group.actionType || 'projectile') === 'explosion'
          ? 'composer-group-explosion'
          : 'composer-group-projectile',
        threatClass,
        visualSyncType: 'group-pulse',
        payload: {
          groupId,
          continuityId: String(group?.continuityId || '').trim(),
          musicLayer,
          musicProminence,
          soloCarrierType,
          musicLaneId: String(group?.musicLaneId || (isPrimaryLoopOwnerGroup ? 'primary_loop_lane' : '')).trim().toLowerCase(),
          callResponseLane: lane,
          callResponseQualified: lane === 'call' ? acceptedStrongCall : true,
          callResponsePhraseProgress: responsePhraseProgressForEvent,
          musicRegister: registerTarget,
          audioGain: rhythmPercussionCarrier
            ? 1
            : clamp01(Number(group?.musicParticipationGain == null ? 1 : group.musicParticipationGain) * lifecycleAudioGain * restrainedGroupGain),
          requestedNoteRaw: gravityNoteNameRaw,
          phraseGravityTarget,
          phraseGravityHit,
          phraseResolutionOpportunity,
          phraseResolutionHit,
        },
      }));
    }
    if ((introPercussionCarrier || isSoloCarrier) && noteIntroDebug) {
      noteIntroDebug(introPercussionCarrier ? 'intro_percussion_emitted' : 'solo_carrier_emitted', {
        groupId,
        stepIndex: stepAbs,
        performerCount: performers.length,
        instrumentId,
        note: styledNoteName,
        soloCarrierType,
      });
    }
    if ((introPercussionCarrier || rhythmProfileCarrier || soloRhythmCarrier) && directTriggerComposerCarrier) {
      for (const enemy of performers) {
        try {
          directTriggerComposerCarrier({
            enemyId: Math.max(0, Math.trunc(Number(enemy?.id) || 0)),
            groupId,
            instrumentId,
            note: styledNoteName,
            audioGain: introPercussionCarrier ? 1 : clamp01(Number(group?.musicParticipationGain == null ? 1 : group.musicParticipationGain) * lifecycleAudioGain * restrainedGroupGain),
            musicProminence,
            soloCarrierType,
            introPercussionCarrier,
          });
        } catch {}
      }
    }

    if (!isSoloCarrier && lane === 'call') {
      if (acceptedStrongCall) {
        const responseTargetLength = (() => {
          if (isPrimaryLoopOwnerGroup && phraseResolutionHit) return 4;
          if (phraseResolutionHit || phraseGravityHit || isPrimaryLoopOwnerGroup) return Math.random() < 0.35 ? 4 : 3;
          return Math.random() < 0.2 ? 1 : 2;
        })();
        const minimumDirectedResponseLength = directorWantsAnswerGroup
          ? (preDropActive ? 1 : (answerLaneIntensity >= 0.72 ? 3 : 2))
          : 1;
        const cappedResponseTargetLength = Math.max(
          minimumDirectedResponseLength,
          Math.min(responseLengthCap, responseTargetLength)
        );
        callResponseRuntime.lastCallStepAbs = stepAbs;
        callResponseRuntime.lastCallGroupId = groupId;
        callResponseRuntime.lastCallNote = styledNoteName;
        callResponseRuntime.pendingCallExpiresStepAbs = getPendingCallExpiry(stepAbs, cappedResponseTargetLength);
        callResponseRuntime.lastResponseNote = '';
        callResponseRuntime.activeResponseGroupId = 0;
        callResponseRuntime.responseHoldUntilStepAbs = -1;
        callResponseRuntime.responsePhraseProgress = 0;
        callResponseRuntime.responsePhraseTargetLength = cappedResponseTargetLength;
      }
    } else if (!isSoloCarrier) {
      const responseTargetLength = Math.max(1, Math.min(
        responseLengthCap,
        Math.trunc(Number(callResponseRuntime.responsePhraseTargetLength) || 2)
      ));
      callResponseRuntime.lastResponseStepAbs = stepAbs;
      callResponseRuntime.lastResponseGroupId = groupId;
      callResponseRuntime.lastResponseNote = normalizeSwarmNoteName(styledNoteName) || styledNoteName;
      callResponseRuntime.pendingCallExpiresStepAbs = -1;
      callResponseRuntime.activeResponseGroupId = groupId;
      callResponseRuntime.responseDirection = continuingResponsePhrase
        ? (Math.trunc(Number(callResponseRuntime.responseDirection) || 1) || 1)
        : (((getNotePoolIndex(callResponseRuntime.lastResponseNote) >= 0 && getNotePoolIndex(callResponseRuntime.lastCallNote) >= 0 && getNotePoolIndex(callResponseRuntime.lastResponseNote) < getNotePoolIndex(callResponseRuntime.lastCallNote)) ? -1 : 1) || 1);
      callResponseRuntime.responsePhraseProgress = continuingResponsePhrase
        ? (Math.max(0, Math.trunc(Number(callResponseRuntime.responsePhraseProgress) || 0)) + 1)
        : 1;
      callResponseRuntime.responseHoldUntilStepAbs = Math.max(
        stepAbs,
        Math.min(
          stepAbs + Math.max(0, (responseTargetLength - 1) * responsePhraseSteps),
          Math.max(stepAbs, Math.trunc(Number(callResponseRuntime.lastCallStepAbs) || stepAbs) + responseWindowSteps + responseWindowGraceSteps)
        )
      );
    }
    group.__bsLastComposerNote = normalizeSwarmNoteName(styledNoteName) || styledNoteName;
  }
  return events;
}
