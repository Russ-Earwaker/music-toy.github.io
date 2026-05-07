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

function normalizeComposerProfileSourceType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return '';
  return normalized;
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

function isIntroSlotIdentityProfile(profileId) {
  const profile = normalizeComposerProfileSourceType(profileId);
  return profile === 'spawner_rhythm_pulse'
    || profile === 'spawner_rhythm_backbeat'
    || profile === 'spawner_rhythm_motion';
}

function isForcedSingleEmitterGroup(group, aliveMemberCount = 0) {
  const soloCarrierType = String(group?.soloCarrierType || '').trim().toLowerCase();
  const callResponseLane = String(group?.callResponseLane || '').trim().toLowerCase();
  const introCarrierBodyType = String(group?.introCarrierBodyType || '').trim().toLowerCase();
  const templateId = String(group?.templateId || '').trim().toLowerCase();
  const introSlotProfileSourceType = normalizeComposerProfileSourceType(group?.introSlotProfileSourceType || group?.musicProfileSourceType);
  const multiMemberIntroGroup = Math.max(0, Math.trunc(Number(aliveMemberCount) || 0)) > 1
    && ((group?.introStageCarrier === true) || isIntroSlotIdentityProfile(introSlotProfileSourceType));
  if (multiMemberIntroGroup) return false;
  return soloCarrierType === 'rhythm'
    || callResponseLane === 'solo'
    || introCarrierBodyType === 'solo'
    || templateId.startsWith('solo-');
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
  const explicitSoloGroup = isForcedSingleEmitterGroup(group, aliveMembers.length);
  const pinned = Math.trunc(Number(group?.noteToEnemyId?.get?.(note)) || 0);
  if (explicitSoloGroup && pinned > 0 && aliveIds.has(pinned)) {
    return aliveMembers.find((e) => Math.trunc(Number(e?.id) || 0) === pinned) || null;
  }
  if (!aliveMembers.length) return null;
  const stableSortedMembers = aliveMembers.slice().sort((a, b) => {
    const aIndex = Math.trunc(Number(a?.formationMemberIndex) || 0);
    const bIndex = Math.trunc(Number(b?.formationMemberIndex) || 0);
    if (aIndex !== bIndex) return aIndex - bIndex;
    return Math.trunc(Number(a?.id) || 0) - Math.trunc(Number(b?.id) || 0);
  });
  const lastChosenId = Math.trunc(Number(group?.__bsLastChosenEnemyId) || 0);
  const cursor = Math.max(0, Math.trunc(Number(group?.__bsGroupEmitCursor) || 0));
  const sortedMembers = stableSortedMembers.slice().sort((a, b) => {
    const aPulse = Math.max(
      0,
      Number(a?.composerActionPulseT) || 0,
      Number(a?.musicRolePulseT) || 0,
    );
    const bPulse = Math.max(
      0,
      Number(b?.composerActionPulseT) || 0,
      Number(b?.musicRolePulseT) || 0,
    );
    if (aPulse !== bPulse) return aPulse - bPulse;
    const aLastEmit = Math.max(-1000000, Math.trunc(Number(a?.__bsGroupLastEmitSequence) || -1000000));
    const bLastEmit = Math.max(-1000000, Math.trunc(Number(b?.__bsGroupLastEmitSequence) || -1000000));
    if (aLastEmit !== bLastEmit) return aLastEmit - bLastEmit;
    const aPinned = Math.trunc(Number(a?.id) || 0) === pinned ? 1 : 0;
    const bPinned = Math.trunc(Number(b?.id) || 0) === pinned ? 1 : 0;
    if (aPinned !== bPinned) return bPinned - aPinned;
    const aIndex = Math.trunc(Number(a?.formationMemberIndex) || 0);
    const bIndex = Math.trunc(Number(b?.formationMemberIndex) || 0);
    if (aIndex !== bIndex) return aIndex - bIndex;
    return Math.trunc(Number(a?.id) || 0) - Math.trunc(Number(b?.id) || 0);
  });
  let picked = null;
  if (stableSortedMembers.length === 1) {
    picked = stableSortedMembers[0] || null;
  } else {
    for (let offset = 0; offset < stableSortedMembers.length; offset++) {
      const member = stableSortedMembers[(cursor + offset) % stableSortedMembers.length];
      const memberId = Math.trunc(Number(member?.id) || 0);
      if (!(memberId > 0)) continue;
      if (memberId === lastChosenId && offset < stableSortedMembers.length - 1) continue;
      picked = member;
      break;
    }
    if (!picked) {
      picked = sortedMembers.find((enemy) => Math.trunc(Number(enemy?.id) || 0) !== lastChosenId)
        || sortedMembers[0]
        || null;
    }
  }
  if (picked) {
    const nextSequence = Math.max(1, Math.trunc(Number(group?.__bsGroupEmitSequence) || 0) + 1);
    if (group && typeof group === 'object') group.__bsGroupEmitSequence = nextSequence;
    picked.__bsGroupLastEmitSequence = nextSequence;
    const pickedId = Math.trunc(Number(picked?.id) || 0);
    if (pickedId > 0 && group && typeof group === 'object') {
      group.__bsLastChosenEnemyId = pickedId;
      const pickedIndex = stableSortedMembers.findIndex((enemy) => Math.trunc(Number(enemy?.id) || 0) === pickedId);
      group.__bsGroupEmitCursor = pickedIndex >= 0
        ? ((pickedIndex + 1) % Math.max(1, stableSortedMembers.length))
        : ((cursor + 1) % Math.max(1, stableSortedMembers.length));
    }
    if (explicitSoloGroup) group?.noteToEnemyId?.set?.(note, Math.trunc(Number(picked.id) || 0));
    else group?.noteToEnemyId?.delete?.(note);
  }
  return picked;
}

function sortComposerGroupCandidatesByVisibilityAndRecency(members = [], isEnemyLikelyOnScreen = null) {
  const visibleFn = typeof isEnemyLikelyOnScreen === 'function'
    ? isEnemyLikelyOnScreen
    : (() => false);
  return members.slice().sort((a, b) => {
    const aOn = visibleFn(a) ? 1 : 0;
    const bOn = visibleFn(b) ? 1 : 0;
    if (aOn !== bOn) return bOn - aOn;
    const aPulse = Math.max(
      0,
      Number(a?.composerActionPulseT) || 0,
      Number(a?.musicRolePulseT) || 0,
    );
    const bPulse = Math.max(
      0,
      Number(b?.composerActionPulseT) || 0,
      Number(b?.musicRolePulseT) || 0,
    );
    if (aPulse !== bPulse) return aPulse - bPulse;
    const aLastEmit = Math.max(-1000000, Math.trunc(Number(a?.__bsGroupLastEmitSequence) || -1000000));
    const bLastEmit = Math.max(-1000000, Math.trunc(Number(b?.__bsGroupLastEmitSequence) || -1000000));
    if (aLastEmit !== bLastEmit) return aLastEmit - bLastEmit;
    const aIndex = Math.trunc(Number(a?.formationMemberIndex) || 0);
    const bIndex = Math.trunc(Number(b?.formationMemberIndex) || 0);
    if (aIndex !== bIndex) return aIndex - bIndex;
    return Math.trunc(Number(a?.id) || 0) - Math.trunc(Number(b?.id) || 0);
  });
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
    return soloCarrierType === 'rhythm';
  });
  const hasIntroSlotRhythmCarrier = composerEnemyGroups.some((g) => {
    if (!g || !g.active || g.retiring) return false;
    const profile = normalizeComposerProfileSourceType(g?.introSlotProfileSourceType || g?.musicProfileSourceType);
    return profile === 'spawner_rhythm_pulse'
      || profile === 'spawner_rhythm_backbeat'
      || profile === 'spawner_rhythm_motion';
  });
  const getCurrentPacingCaps = typeof options?.getCurrentPacingCaps === 'function' ? options.getCurrentPacingCaps : (() => ({ responseMode: 'none' }));
  const pacingCaps = getCurrentPacingCaps();
  const responseMode = String(pacingCaps?.responseMode || 'none');
  if ((responseMode === 'none' || responseMode === 'drawsnake') && !hasIntroPercussionCarrier && !hasSoloCarrier && !hasIntroSlotRhythmCarrier) return events;

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
  const activeAnswerOrnamentGroup = activeGroups.find((g) => {
    if (!g) return false;
    const profile = normalizeComposerProfileSourceType(g?.musicProfileSourceType);
    const lane = normalizeCallResponseLane(g?.callResponseLane, '');
    return profile === 'answer_ornament' || lane === 'response';
  }) || null;
  const fallbackResponseProxyGroup = activeAnswerOrnamentGroup || activeGroups.find((g) => {
    if (!g) return false;
    const laneId = String(g?.musicLaneId || '').trim().toLowerCase();
    const lane = normalizeCallResponseLane(g?.callResponseLane, '');
    const roleId = String(g?.role || '').trim().toLowerCase();
    if (lane === 'call') return false;
    if (laneId === 'secondary_loop_lane' || laneId === 'sparkle_lane') return true;
    return roleId === String(options?.roles?.accent || 'accent').trim().toLowerCase();
  }) || activeGroups.find((g) => {
    if (!g) return false;
    const lane = normalizeCallResponseLane(g?.callResponseLane, '');
    return lane !== 'call';
  }) || null;
  const activePrimaryLoopLeadGroups = activeGroups.filter((g) => {
    if (!g) return false;
    const laneId = String(g?.musicLaneId || '').trim().toLowerCase();
    if (laneId !== 'primary_loop_lane') return false;
    const roleId = String(g?.role || options?.roles?.lead || 'lead').trim().toLowerCase();
    const profileId = normalizeComposerProfileSourceType(g?.musicProfileSourceType);
    const soloCarrierType = String(g?.soloCarrierType || '').trim().toLowerCase();
    return (
      roleId === String(options?.roles?.lead || 'lead').trim().toLowerCase()
      || profileId === 'lead_melody'
      || soloCarrierType === 'melody'
      || soloCarrierType === 'solo'
    );
  });
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
  const isEnemyLikelyOnScreen = typeof options?.isEnemyLikelyOnScreen === 'function'
    ? options.isEnemyLikelyOnScreen
    : (() => false);
  const playerLikelyAudible = options?.playerLikelyAudible === true;
  const musicModeRuntime = options?.musicModeRuntime && typeof options.musicModeRuntime === 'object'
    ? options.musicModeRuntime
    : null;

  const getAliveEnemiesByIds = typeof options?.getAliveEnemiesByIds === 'function' ? options.getAliveEnemiesByIds : (() => []);
  const getLiveComposerMembersForGroup = (group) => getAliveEnemiesByIds(group?.memberIds).filter((e) => {
    if (!e) return false;
    if (String(e?.enemyType || '').trim().toLowerCase() !== 'composer-group-member') return false;
    const groupId = Math.max(0, Math.trunc(Number(group?.id) || 0));
    const enemyGroupId = Math.max(0, Math.trunc(Number(e?.composerGroupId || e?.musicGroupId) || 0));
    if (groupId > 0 && enemyGroupId > 0 && enemyGroupId !== groupId) return false;
    const groupLaneId = String(group?.musicLaneId || '').trim().toLowerCase();
    const enemyLaneId = String(e?.musicLaneId || '').trim().toLowerCase();
    return !groupLaneId || !enemyLaneId || groupLaneId === enemyLaneId;
  });
  const isRhythmicSecondaryLoopCarrier = (group) => {
    if (!group) return false;
    const laneId = String(group?.musicLaneId || '').trim().toLowerCase();
    if (laneId !== 'secondary_loop_lane') return false;
    if (getLiveComposerMembersForGroup(group).length <= 0) return false;
    const profile = normalizeComposerProfileSourceType(group?.musicProfileSourceType);
    const templateId = String(group?.templateId || '').trim().toLowerCase();
    const responseLane = normalizeCallResponseLane(group?.callResponseLane, '');
    if (responseLane === 'response' || profile === 'answer_ornament') return false;
    return profile === 'rhythm_lane'
      || profile === 'rhythm_lane_backbeat'
      || profile === 'secondary_bridge_backbeat'
      || profile === 'spawner_rhythm_backbeat'
      || templateId === 'secondary_loop_bridge_group';
  };
  const activeSecondaryLoopCoveragePresent = activeGroups.some((g) => {
    if (!g) return false;
    const laneId = String(g?.musicLaneId || '').trim().toLowerCase();
    if (laneId !== 'secondary_loop_lane') return false;
    return getLiveComposerMembersForGroup(g).length > 0;
  });
  const activeSecondaryLoopRhythmCoveragePresent = activeGroups.some((g) => isRhythmicSecondaryLoopCarrier(g));
  const fallbackResponseCarrierGroup = activeAnswerOrnamentGroup || activeGroups.find((g) => {
    if (!g) return false;
    const laneId = String(g?.musicLaneId || '').trim().toLowerCase();
    const lane = normalizeCallResponseLane(g?.callResponseLane, '');
    if (lane === 'call') return false;
    if (laneId !== 'secondary_loop_lane' && laneId !== 'sparkle_lane') return false;
    return getLiveComposerMembersForGroup(g).length > 0;
  }) || activeGroups.find((g) => {
    if (!g) return false;
    const laneId = String(g?.musicLaneId || '').trim().toLowerCase();
    const roleId = String(g?.role || '').trim().toLowerCase();
    if (laneId === 'primary_loop_lane' && roleId === String(options?.roles?.lead || 'lead').trim().toLowerCase()) return false;
    return getLiveComposerMembersForGroup(g).length > 0;
  }) || activeGroups.find((g) => {
    if (!g) return false;
    return getLiveComposerMembersForGroup(g).length > 0;
  }) || null;
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
  const getGroupEventContinuityId = (groupLike = null) => String(
    groupLike?.musicLaneContinuityId
    || groupLike?.continuityId
    || ''
  ).trim();
  const chooseEnemyForNote = typeof options?.chooseEnemyForNote === 'function' ? options.chooseEnemyForNote : ((o) => chooseComposerGroupEnemyForNote(o));
  const roles = options?.roles && typeof options.roles === 'object' ? options.roles : {};
  const threat = options?.threat && typeof options.threat === 'object' ? options.threat : {};
  const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));
  const styleProfile = options?.styleProfile && typeof options.styleProfile === 'object' ? options.styleProfile : {};
  const styleId = String(styleProfile?.id || '').trim().toLowerCase();
  const motifRepeatBias = Math.max(0, Math.min(1, Number(styleProfile?.motifRepeatBias) || 0));
  const leadLeapChance = Math.max(0, Math.min(1, Number(styleProfile?.leadLeapChance) || 1));
  const accentPitchVariance = Math.max(0, Math.min(1, Number(styleProfile?.accentPitchVariance) || 1));
  const isSupportLaneEvent = ({ musicLaneId = '', callResponseLane = '', role = '' } = {}) => {
    const normalizedLaneId = String(musicLaneId || '').trim().toLowerCase();
    const normalizedCallResponseLane = String(callResponseLane || '').trim().toLowerCase();
    const normalizedRole = normalizeSwarmRole(role || '', '');
    return normalizedLaneId === 'secondary_loop_lane'
      || normalizedLaneId === 'answer_lane'
      || normalizedLaneId === 'sparkle_lane'
      || normalizedCallResponseLane === 'response'
      || normalizedRole === String(roles?.accent || 'accent').trim().toLowerCase();
  };
  const resolveSupportSafeInstrumentId = (preferredInstrumentId = '', optionsLike = null) => {
    const musicLaneId = String(optionsLike?.musicLaneId || '').trim().toLowerCase();
    const callResponseLane = String(optionsLike?.callResponseLane || '').trim().toLowerCase();
    const role = normalizeSwarmRole(optionsLike?.role || '', roles?.accent || 'accent');
    const preferred = String(preferredInstrumentId || '').trim();
    const preferredLane = inferInstrumentLaneFromCatalogId(preferred, '');
    if (!isSupportLaneEvent({ musicLaneId, callResponseLane, role }) || preferredLane !== 'lead') return preferred;
    const responseLike = callResponseLane === 'response' || musicLaneId === 'answer_lane' || musicLaneId === 'sparkle_lane';
    const candidateIds = responseLike
      ? [
          getIdForDisplayName('Bell'),
          getIdForDisplayName('Xylophone'),
          getIdForDisplayName('Chime'),
          getIdForDisplayName('Retro Triangle'),
          resolveSwarmRoleInstrumentId(roles?.accent || 'accent', resolveSwarmSoundInstrumentId('projectile') || 'tone'),
          resolveSwarmSoundInstrumentId('projectile'),
          'tone',
        ]
      : [
          getIdForDisplayName('Drum Snare 2'),
          getIdForDisplayName('Hand clap (electro)'),
          getIdForDisplayName('Hand clap'),
          getIdForDisplayName('Retro Projectile Subtle'),
          getIdForDisplayName('Laser'),
          resolveSwarmRoleInstrumentId(roles?.accent || 'accent', resolveSwarmSoundInstrumentId('projectile') || 'tone'),
          resolveSwarmSoundInstrumentId('projectile'),
          'tone',
        ];
    for (const candidate of candidateIds) {
      const instrumentId = String(candidate || '').trim();
      if (!instrumentId) continue;
      if (inferInstrumentLaneFromCatalogId(instrumentId, '') === 'lead') continue;
      return instrumentId;
    }
    return preferred;
  };
  const laneDrivenFoundation = options?.laneDrivenFoundation === true;
  const laneDrivenPrimaryLoop = options?.laneDrivenPrimaryLoop === true;
  const answerLanePlan = directorLanePlan && typeof directorLanePlan === 'object'
    ? (directorLanePlan.answer || null)
    : null;
  const directorWantsAnswerGroup = answerLanePlan?.active === true
    && String(answerLanePlan?.preferredCarrier || '').trim().toLowerCase() === 'group';
  const answerOrnamentAllowed = answerLanePlan?.active === true;
  const sparkleLanePlan = directorLanePlan && typeof directorLanePlan === 'object'
    ? (directorLanePlan.sparkle || null)
    : null;
  const sparkleLaneAllowed = sparkleLanePlan?.active === true;
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
    : (strongLeadWindowActive ? 2 : (structureIntent === 'build' ? 3 : 4));
  const responseCadenceRestSteps = directorWantsAnswerGroup
    ? (preDropActive ? 2 : (strongLeadWindowActive ? 3 : 2))
    : 1;
  const callCadenceRestSteps = 1;
  const activeMusicMode = String(musicModeRuntime?.activeMusicMode || '').trim().toLowerCase();
  const getPrimaryLeadTraceFallback = () => {
    const arrangementPhraseIntent = String(musicModeRuntime?.level1ArrangementState?.phraseIntent || '').trim().toLowerCase();
    const sectionBar = Math.max(0, Math.trunc(Math.max(0, barIndex - 24))) % 16;
    const sectionArcEpoch = Math.max(0, Math.trunc(Math.max(0, barIndex - 24) / 16));
    const pickupWindow = activeMusicMode === 'full_texture' && barIndex >= 24 && sectionBar <= 1;
    const cadenceWindow = (activeMusicMode === 'full_texture' && barIndex >= 24 && sectionBar >= 14)
      || arrangementPhraseIntent === 'cadence';
    const buildWindow = arrangementPhraseIntent === 'build';
    const recoveryWindow = arrangementPhraseIntent === 'recovery';
    const bodyWindow = arrangementPhraseIntent === 'body';
    const melodyEpoch = Math.max(0, Math.trunc(Math.max(0, barIndex - 12) / 2));
    const earlyMelodyWindow = barIndex < 48;
    const fallbackFamilies = cadenceWindow
      ? ['hook', 'arc', 'hook']
      : (buildWindow
        ? ['arc', 'glide', 'hook']
        : (earlyMelodyWindow || recoveryWindow || bodyWindow
          ? ['hook', 'glide', 'hook']
          : ['hook', 'glide', 'arc']));
    const contourEpoch = Math.max(0, Math.trunc(Math.max(0, barIndex - 24) / 8));
    const contourRotation = ['hook_return', 'ascending_arc', 'descending_answer', 'cadence_turn'];
    return {
      leadFamily: fallbackFamilies[melodyEpoch % fallbackFamilies.length] || 'hook',
      leadContourId: cadenceWindow
        ? 'cadence_turn'
        : (recoveryWindow
          ? 'hook_return'
          : (buildWindow
            ? 'ascending_arc'
            : (bodyWindow
              ? (sectionArcEpoch % 3 === 2 ? 'descending_answer' : 'hook_return')
              : (pickupWindow
                ? (sectionArcEpoch % 2 === 0 ? 'ascending_arc' : 'hook_return')
                : (contourRotation[contourEpoch % contourRotation.length] || 'hook_return'))))),
      leadContourEpoch: contourEpoch,
      leadCadenceVariant: cadenceWindow
        ? (sectionArcEpoch % 3)
        : (recoveryWindow
          ? 0
          : (bodyWindow ? ((sectionArcEpoch + 1) % 3) : ((melodyEpoch * 2) % 3))),
      sectionTransitionRole: cadenceWindow ? 'cadence' : (pickupWindow ? 'pickup' : 'body'),
      sectionArcEpoch,
    };
  };
  const protectedContinuityLanes = Array.isArray(musicModeRuntime?.protectedContinuityLanes)
    ? musicModeRuntime.protectedContinuityLanes.map((laneId) => String(laneId || '').trim().toLowerCase()).filter(Boolean)
    : [];
  const secondaryLoopProtected = activeMusicMode === 'lead_entry_merge'
    || activeMusicMode === 'full_texture'
    || protectedContinuityLanes.includes('secondary_loop_lane');
  const directBedFallbackWanted = (strongLeadWindowActive || secondaryLoopProtected)
    && activePrimaryLoopLeadGroups.length > 0
    && !activeSecondaryLoopCoveragePresent;
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
  let emittedResponseThisStep = false;
  let emittedSecondaryLoopRhythmThisStep = false;
  let emittedSecondaryBedFallbackThisStep = false;
  let emittedAnswerOrnamentThisStep = false;

  for (const group of composerEnemyGroups) {
    if (!group || !group.active || group.retiring) continue;
    const lifecycleState = normalizeLifecycleState(group?.lifecycleState, 'active');
    if (lifecycleState === 'retiring') continue;
    const introPercussionCarrier = group?.introPercussionCarrier === true;
    const introStageCarrier = group?.introStageCarrier === true;
    const soloCarrierType = String(group?.soloCarrierType || '').trim().toLowerCase() === 'rhythm' ? 'rhythm' : '';
    const introSlotProfileSourceType = normalizeComposerProfileSourceType(group?.introSlotProfileSourceType);
    const introSlotIdentityLocked = group?.introSlotLock === true
      && Math.max(-1, Math.trunc(Number(group?.introSlotLockUntilBar) || -1)) >= barIndex;
    const introSlotIdentityActive = isIntroSlotIdentityProfile(introSlotProfileSourceType);
    const musicProfileSourceType = normalizeComposerProfileSourceType(introSlotIdentityActive
      ? (introSlotProfileSourceType || group?.musicProfileSourceType)
      : group?.musicProfileSourceType) || '';
    const soloRhythmCarrier = soloCarrierType === 'rhythm';
    const rhythmProfileCarrier = musicProfileSourceType === 'rhythm_lane'
      || musicProfileSourceType === 'rhythm_lane_backbeat'
      || musicProfileSourceType === 'secondary_bridge_backbeat'
      || musicProfileSourceType === 'spawner_rhythm_pulse'
      || musicProfileSourceType === 'spawner_rhythm_backbeat'
      || musicProfileSourceType === 'spawner_rhythm_motion';
    const rhythmPulseCarrier = musicProfileSourceType === 'spawner_rhythm_pulse';
    const rhythmBackbeatCarrier = musicProfileSourceType === 'spawner_rhythm_backbeat'
      || musicProfileSourceType === 'secondary_bridge_backbeat';
    const rhythmMotionCarrier = musicProfileSourceType === 'spawner_rhythm_motion';
    const slotRhythmCarrier = rhythmPulseCarrier || rhythmBackbeatCarrier || rhythmMotionCarrier;
    const melodyProfileCarrier = musicProfileSourceType === 'lead_melody';
    const answerOrnamentCarrier = musicProfileSourceType === 'answer_ornament';
    const rhythmPercussionCarrier = introPercussionCarrier || rhythmProfileCarrier;
    const isSoloCarrier = soloCarrierType === 'rhythm';
    const lockedIntroLane = introSlotIdentityActive
      ? normalizeCallResponseLane(group?.introSlotCallResponseLane || group?.callResponseLane, 'solo')
      : '';
    const lane = introSlotIdentityActive
      ? lockedIntroLane
      : (isSoloCarrier ? 'solo' : normalizeCallResponseLane(group?.callResponseLane, answerOrnamentCarrier ? 'response' : 'call'));
    const groupId = Math.max(0, Math.trunc(Number(group?.id) || 0));
    const noteIntroCollectorState = (phase, extra = null) => {
      if (!noteMusicSystemEvent || !slotRhythmCarrier || barIndex > 20) return;
      noteMusicSystemEvent('music_composer_group_state', {
        phase: String(phase || 'collector').trim().toLowerCase(),
        groupId,
        role: String(group?.role || '').trim().toLowerCase(),
        musicLaneId: String(group?.musicLaneId || group?.introSlotMusicLaneId || '').trim().toLowerCase(),
        instrumentId: String(group?.instrumentId || group?.introSlotInstrumentId || '').trim(),
        note: Array.isArray(group?.introSlotNotes) && group.introSlotNotes.length
          ? String(group.introSlotNotes[0] || '').trim()
          : (Array.isArray(group?.notes) && group.notes.length ? String(group.notes[0] || '').trim() : ''),
        reason: String(musicProfileSourceType || '').trim().toLowerCase(),
        stage: Array.isArray(group?.introSlotSteps) && group.introSlotSteps.length
          ? group.introSlotSteps.map((stepOn) => (stepOn ? '1' : '0')).join('')
          : (Array.isArray(group?.steps) ? group.steps.map((stepOn) => (stepOn ? '1' : '0')).join('') : ''),
        callResponseLane: String(lane || '').trim().toLowerCase(),
        lifecycleState,
        ...(extra && typeof extra === 'object' ? extra : {}),
      }, {
        beatIndex,
        stepIndex: stepAbs,
        barIndex,
      });
    };
    const noteEarlyCarrierTrace = (phase, extra = null) => {
      if (!noteMusicSystemEvent || barIndex > 20) return;
      if (!(slotRhythmCarrier || soloCarrierType === 'rhythm')) return;
      const aliveMembersNow = getAliveEnemiesByIds(group?.memberIds).filter((enemy) => String(enemy?.enemyType || '') === 'composer-group-member');
      const aliveMemberIds = aliveMembersNow
        .map((enemy) => Math.max(0, Math.trunc(Number(enemy?.id) || 0)))
        .filter((id) => id > 0);
      const visibleSoloEnemyIds = aliveMembersNow
        .filter((enemy) => {
          const memberSoloCarrierType = String(enemy?.soloCarrierType || '').trim().toLowerCase();
          const introCarrierBodyType = String(enemy?.introCarrierBodyType || '').trim().toLowerCase();
          return memberSoloCarrierType === 'rhythm' || introCarrierBodyType === 'solo';
        })
        .map((enemy) => Math.max(0, Math.trunc(Number(enemy?.id) || 0)))
        .filter((id) => id > 0);
      noteMusicSystemEvent('music_intro_carrier_trace', {
        phase: String(phase || '').trim().toLowerCase(),
        groupId,
        role: String(group?.role || '').trim().toLowerCase(),
        musicLaneId: String(group?.musicLaneId || group?.introSlotMusicLaneId || '').trim().toLowerCase(),
        slotProfile: String(musicProfileSourceType || '').trim().toLowerCase(),
        introSlotProfileSourceType,
        callResponseLane: String(lane || '').trim().toLowerCase(),
        soloCarrierType,
        introCarrierBodyType: String(group?.introCarrierBodyType || '').trim().toLowerCase(),
        introStageCarrier: group?.introStageCarrier === true,
        introSlotIdentityActive,
        introSlotIdentityLocked,
        aliveMemberIds,
        visibleSoloEnemyIds,
        ...(extra && typeof extra === 'object' ? extra : {}),
      }, {
        beatIndex,
        stepIndex: stepAbs,
        barIndex,
      });
    };
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
    let laneActive = (isSoloCarrier || introPercussionCarrier || slotRhythmCarrier)
      ? true
      : isCallResponseLaneActive(lane, stepAbs, activeGroups.length);
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
      noteIntroCollectorState('collector_suppressed', { admissionReason: 'lane_inactive' });
      noteEarlyCarrierTrace('suppressed', {
        branch: 'collector',
        admissionReason: 'lane_inactive',
      });
      if (slotRhythmCarrier) {
        const introSlotSuppressedPayload = {
          reason: 'lane_inactive',
          groupId,
          stepIndex: stepAbs,
          beatIndex,
          slotProfile: musicProfileSourceType,
          musicLaneId: String(group?.musicLaneId || '').trim().toLowerCase(),
          callResponseLane: lane,
        };
        if (noteIntroDebug) noteIntroDebug('intro_slot_rhythm_suppressed', introSlotSuppressedPayload);
        noteMusicSystemEvent?.('music_intro_slot_suppressed', introSlotSuppressedPayload, { beatIndex, stepIndex: stepAbs, barIndex });
      }
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
      const primaryLeadPresent = activePrimaryLoopLeadGroups.length > 0;
      const responseSupportOnlyGate = (
        primaryLeadPresent
        && strongLeadWindowActive
        && !continuingResponsePhrase
        && !responseOverrideHit
        && step !== 0
      );
      if (responseSupportOnlyGate) {
        noteResponseDiagnostic('support_only_gate', {
          stepInBar: step,
          primaryLeadPresent,
        });
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

    const lockedIntroSteps = introSlotIdentityActive && Array.isArray(group?.introSlotSteps)
      ? group.introSlotSteps
      : null;
    if (slotRhythmCarrier && barIndex <= 20) {
      const introSlotStatePayload = {
        groupId,
        barIndex,
        beatIndex,
        stepIndex: stepAbs,
        lifecycleState,
        soloCarrierType,
        musicProfileSourceType,
        introSlotProfileSourceType,
        introSlotIdentityLocked,
        introSlotIdentityActive,
        callResponseLane: lane,
        musicLaneId: String(group?.musicLaneId || '').trim().toLowerCase(),
        introSlotMusicLaneId: String(group?.introSlotMusicLaneId || '').trim().toLowerCase(),
        liveSteps: Array.isArray(group?.steps) ? group.steps.map((v) => !!v) : [],
        introSteps: Array.isArray(group?.introSlotSteps) ? group.introSlotSteps.map((v) => !!v) : [],
        liveNotes: Array.isArray(group?.notes) ? group.notes.slice() : [],
        introNotes: Array.isArray(group?.introSlotNotes) ? group.introSlotNotes.slice() : [],
        memberCount: Array.isArray(group?.memberIds)
          ? group.memberIds.length
          : (group?.memberIds instanceof Set ? group.memberIds.size : 0),
      };
      if (noteIntroDebug) noteIntroDebug('intro_slot_state', introSlotStatePayload);
      noteMusicSystemEvent?.('music_intro_slot_state', introSlotStatePayload, { beatIndex, stepIndex: stepAbs, barIndex });
    }
    const stepActive = Array.isArray(lockedIntroSteps)
      ? !!lockedIntroSteps[step]
      : (Array.isArray(group.steps) && !!group.steps[step]);
    if (!stepActive && !responseOverrideHit) {
      noteIntroCollectorState('collector_suppressed', { admissionReason: 'step_inactive' });
      noteEarlyCarrierTrace('suppressed', {
        branch: 'collector',
        admissionReason: 'step_inactive',
      });
      if (slotRhythmCarrier) {
        const introSlotSuppressedPayload = {
          reason: 'step_inactive',
          groupId,
          stepIndex: stepAbs,
          beatIndex,
          slotProfile: musicProfileSourceType,
          musicLaneId: String(group?.musicLaneId || '').trim().toLowerCase(),
        };
        if (noteIntroDebug) noteIntroDebug('intro_slot_rhythm_suppressed', introSlotSuppressedPayload);
        noteMusicSystemEvent?.('music_intro_slot_suppressed', introSlotSuppressedPayload, { beatIndex, stepIndex: stepAbs, barIndex });
      }
      noteCallDiagnostic('step_inactive');
      noteResponseDiagnostic('step_inactive');
      continue;
    }
    const phraseRestUntilStepAbs = slotRhythmCarrier
      ? -1
      : Math.max(-1, Math.trunc(Number(group?.__bsPhraseRestUntilStep) || -1));
    if (phraseRestUntilStepAbs >= stepAbs) {
      noteIntroCollectorState('collector_suppressed', { admissionReason: 'post_cadence_rest' });
      noteEarlyCarrierTrace('suppressed', {
        branch: 'collector',
        admissionReason: 'post_cadence_rest',
        restUntilStepAbs: phraseRestUntilStepAbs,
      });
      if (slotRhythmCarrier) {
        const introSlotSuppressedPayload = {
          reason: 'post_cadence_rest',
          groupId,
          stepIndex: stepAbs,
          beatIndex,
          slotProfile: musicProfileSourceType,
          restUntilStepAbs: phraseRestUntilStepAbs,
        };
        if (noteIntroDebug) noteIntroDebug('intro_slot_rhythm_suppressed', introSlotSuppressedPayload);
        noteMusicSystemEvent?.('music_intro_slot_suppressed', introSlotSuppressedPayload, { beatIndex, stepIndex: stepAbs, barIndex });
      }
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
      const canGhostCarry = slotRhythmCarrier && introSlotIdentityActive;
      if (canGhostCarry) {
        const lockedRole = normalizeSwarmRole(
          group?.introSlotRole || group?.role || (rhythmPulseCarrier ? roles.bass : roles.accent),
          rhythmPulseCarrier ? roles.bass : roles.accent
        );
        const lockedLaneId = String(group?.introSlotMusicLaneId || group?.musicLaneId || '').trim().toLowerCase();
        const lockedInstrumentIdRaw = String(
          group?.introSlotInstrumentId
            || group?.instrumentId
            || group?.instrument
            || ''
        ).trim();
        const lockedInstrumentLane = inferInstrumentLaneFromCatalogId(lockedInstrumentIdRaw, '');
        const lockedResolvedRole = lockedInstrumentLane === 'bass'
          ? 'bass'
          : normalizeSwarmRole(lockedRole || roles.lead, roles.lead);
        const lockedInstrumentId = resolveSupportSafeInstrumentId(
          lockedInstrumentIdRaw || resolveSwarmRoleInstrumentId(
            lockedResolvedRole,
            resolveSwarmSoundInstrumentId('projectile') || 'tone'
          ),
          {
            musicLaneId: lockedLaneId,
            callResponseLane: lockedIntroLane || lane || 'solo',
            role: lockedInstrumentLane === 'bass' ? 'bass' : lockedResolvedRole,
          }
        );
        const lockedNoteName = normalizeSwarmNoteName(
          Array.isArray(group?.introSlotNotes) && group.introSlotNotes.length
            ? group.introSlotNotes[0]
            : (Array.isArray(group?.notes) && group.notes.length ? group.notes[0] : '')
        ) || getRandomSwarmPentatonicNote();
        const lockedThreatClass = (() => {
          const t = String(group?.threatLevel || threat.full || 'full').trim().toLowerCase();
          if (t === String(threat.cosmetic || 'cosmetic')) return String(threat.cosmetic || 'cosmetic');
          if (t === String(threat.light || 'light')) return String(threat.light || 'light');
          return String(threat.full || 'full');
        })();
        const lockedMusicVoiceKey = rhythmPulseCarrier
          ? 'percussion_pulse'
          : (rhythmBackbeatCarrier ? 'percussion_backbeat' : (rhythmMotionCarrier ? 'percussion_motion' : ''));
        const lockedMusicLayer = rhythmPulseCarrier
          ? 'foundation'
          : (rhythmMotionCarrier ? 'sparkle' : 'loops');
        noteIntroCollectorState('collector_emit_strict', {
          actorId: 0,
          requestedNote: lockedNoteName,
          admissionReason: 'ghost_playback',
        });
        noteEarlyCarrierTrace('emit', {
          branch: 'ghost',
          performerEnemyIds: [],
          requestedNote: lockedNoteName,
          instrumentId: lockedInstrumentId,
          actionType: String(group?.introSlotActionType || group?.actionType || 'explosion') === 'explosion'
            ? 'composer-group-explosion'
            : 'composer-group-projectile',
        });
        events.push(createPerformedBeatEvent({
          actorId: 0,
          beatIndex,
          stepIndex: stepAbs,
          role: lockedInstrumentLane === 'bass' ? 'bass' : lockedResolvedRole,
          note: lockedNoteName,
          instrumentId: lockedInstrumentId,
          actionType: String(group?.introSlotActionType || group?.actionType || 'explosion') === 'explosion'
            ? 'composer-group-explosion'
            : 'composer-group-projectile',
          threatClass: lockedThreatClass,
          visualSyncType: 'group-pulse',
          payload: {
            groupId,
            ghostPlayback: true,
            groupEventSource: 'intro_slot_strict',
            continuityId: getGroupEventContinuityId(group),
            musicVoiceKey: lockedMusicVoiceKey,
            musicRole: lockedInstrumentLane === 'bass' ? 'bass' : lockedResolvedRole,
            musicLayer: lockedMusicLayer,
            musicProminence: 'full',
            introDrumProtected: rhythmBackbeatCarrier || rhythmMotionCarrier,
            soloCarrierType,
            musicLaneId: lockedLaneId,
            callResponseLane: lockedIntroLane || lane || 'solo',
            callResponseQualified: true,
            callResponsePhraseProgress: 0,
            musicRegister: rhythmPulseCarrier ? 'low' : 'mid',
            audioGain: 1,
            requestedNoteRaw: lockedNoteName,
            phraseGravityTarget: '',
            phraseGravityHit: false,
            phraseResolutionOpportunity: false,
            phraseResolutionHit: false,
          },
        }));
        const introSlotGhostPayload = {
          groupId,
          stepIndex: stepAbs,
          beatIndex,
          slotProfile: musicProfileSourceType,
          note: lockedNoteName,
          instrumentId: lockedInstrumentId,
          musicLaneId: lockedLaneId,
          callResponseLane: lockedIntroLane || lane || 'solo',
          reason: 'ghost_playback',
        };
        if (noteIntroDebug) noteIntroDebug('intro_slot_strict_emit', introSlotGhostPayload);
        noteMusicSystemEvent?.('music_intro_slot_strict_emit', introSlotGhostPayload, { beatIndex, stepIndex: stepAbs, barIndex });
        continue;
      }
      noteIntroCollectorState('collector_suppressed', { admissionReason: 'no_alive_members' });
      noteEarlyCarrierTrace('suppressed', {
        branch: 'collector',
        admissionReason: 'no_alive_members',
      });
      if (slotRhythmCarrier) {
        const introSlotSuppressedPayload = {
          reason: 'no_alive_members',
          groupId,
          stepIndex: stepAbs,
          beatIndex,
          slotProfile: musicProfileSourceType,
        };
        if (noteIntroDebug) noteIntroDebug('intro_slot_rhythm_suppressed', introSlotSuppressedPayload);
        noteMusicSystemEvent?.('music_intro_slot_suppressed', introSlotSuppressedPayload, { beatIndex, stepIndex: stepAbs, barIndex });
      }
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

    if (introSlotIdentityActive && slotRhythmCarrier) {
      const lockedRole = normalizeSwarmRole(
        group?.introSlotRole || group?.role || (rhythmPulseCarrier ? roles.bass : roles.accent),
        rhythmPulseCarrier ? roles.bass : roles.accent
      );
      const lockedLaneId = String(group?.introSlotMusicLaneId || group?.musicLaneId || '').trim().toLowerCase();
      const lockedInstrumentIdRaw = String(
        group?.introSlotInstrumentId
          || group?.musicLaneInstrumentId
          || group?.instrumentId
          || group?.instrument
          || aliveMembers[0]?.musicLaneInstrumentId
          || aliveMembers[0]?.composerInstrument
          || ''
      ).trim();
      const lockedInstrumentLane = inferInstrumentLaneFromCatalogId(lockedInstrumentIdRaw, '');
      const lockedResolvedRole = lockedInstrumentLane === 'bass'
        ? 'bass'
        : normalizeSwarmRole(lockedRole || getSwarmRoleForEnemy(aliveMembers[0], roles.lead), roles.lead);
      const lockedInstrumentId = resolveSupportSafeInstrumentId(
        lockedInstrumentIdRaw || resolveSwarmRoleInstrumentId(
          lockedResolvedRole,
          resolveSwarmSoundInstrumentId('projectile') || 'tone'
        ),
        {
          musicLaneId: lockedLaneId,
          callResponseLane: lockedIntroLane || lane || 'solo',
          role: lockedInstrumentLane === 'bass' ? 'bass' : lockedResolvedRole,
        }
      );
      const lockedNoteName = normalizeSwarmNoteName(
        Array.isArray(group?.introSlotNotes) && group.introSlotNotes.length
          ? group.introSlotNotes[0]
          : (Array.isArray(group?.notes) && group.notes.length ? group.notes[0] : '')
      ) || getRandomSwarmPentatonicNote();
      const lockedPerformer = chooseEnemyForNote({
        group,
        noteName: lockedNoteName,
        aliveMembers,
        normalizeNoteName: normalizeSwarmNoteName,
        getFallbackNote: getRandomSwarmPentatonicNote,
      }) || aliveMembers[0] || null;
      if (!lockedPerformer) continue;
      noteIntroCollectorState('collector_emit_strict', {
        actorId: Math.max(0, Math.trunc(Number(lockedPerformer?.id) || 0)),
        requestedNote: lockedNoteName,
      });
      noteEarlyCarrierTrace('emit', {
        branch: 'strict',
        performerEnemyIds: [Math.max(0, Math.trunc(Number(lockedPerformer?.id) || 0))].filter((id) => id > 0),
        requestedNote: lockedNoteName,
        instrumentId: lockedInstrumentId,
        actionType: String(group?.introSlotActionType || group?.actionType || 'explosion') === 'explosion'
          ? 'composer-group-explosion'
          : 'composer-group-projectile',
      });
      const lockedThreatClass = (() => {
        const t = String(group?.threatLevel || threat.full || 'full').trim().toLowerCase();
        if (t === String(threat.cosmetic || 'cosmetic')) return String(threat.cosmetic || 'cosmetic');
        if (t === String(threat.light || 'light')) return String(threat.light || 'light');
        return String(threat.full || 'full');
      })();
      const lockedMusicVoiceKey = rhythmPulseCarrier
        ? 'percussion_pulse'
        : (rhythmBackbeatCarrier ? 'percussion_backbeat' : (rhythmMotionCarrier ? 'percussion_motion' : ''));
      const lockedMusicLayer = rhythmPulseCarrier
        ? 'foundation'
        : (rhythmMotionCarrier ? 'sparkle' : 'loops');
      const lockedProminence = 'full';
      group.__bsPhraseRestUntilStep = -1;
      events.push(createPerformedBeatEvent({
        actorId: Math.max(0, Math.trunc(Number(lockedPerformer?.id) || 0)),
        beatIndex,
        stepIndex: stepAbs,
        role: lockedInstrumentLane === 'bass' ? 'bass' : lockedResolvedRole,
        note: lockedNoteName,
        instrumentId: lockedInstrumentId,
        actionType: String(group?.introSlotActionType || group?.actionType || 'explosion') === 'explosion'
          ? 'composer-group-explosion'
          : 'composer-group-projectile',
        threatClass: lockedThreatClass,
        visualSyncType: 'group-pulse',
        payload: {
          groupId,
          groupEventSource: 'intro_slot_strict',
          continuityId: getGroupEventContinuityId(group),
          musicVoiceKey: lockedMusicVoiceKey,
          musicRole: lockedInstrumentLane === 'bass' ? 'bass' : lockedResolvedRole,
          musicLayer: lockedMusicLayer,
          musicProminence: lockedProminence,
          introDrumProtected: rhythmBackbeatCarrier || rhythmMotionCarrier,
          soloCarrierType,
          musicLaneId: lockedLaneId,
          callResponseLane: lockedIntroLane || lane || 'solo',
          callResponseQualified: true,
          callResponsePhraseProgress: 0,
          musicRegister: rhythmPulseCarrier ? 'low' : 'mid',
          audioGain: 1,
          requestedNoteRaw: lockedNoteName,
          phraseGravityTarget: '',
          phraseGravityHit: false,
          phraseResolutionOpportunity: false,
          phraseResolutionHit: false,
        },
      }));
      if (slotRhythmCarrier) {
        if (!(Math.trunc(Number(group?.introSlotFirstAudibleBeatIndex) || -1) >= 0)) {
          group.introSlotFirstAudibleBeatIndex = beatIndex;
        }
        const introSlotEmitPayload = {
          groupId,
          stepIndex: stepAbs,
          beatIndex,
          performerCount: 1,
          instrumentId: lockedInstrumentId,
          note: lockedNoteName,
          slotProfile: musicProfileSourceType,
          musicLaneId: lockedLaneId,
        };
        if (noteIntroDebug) noteIntroDebug('intro_slot_rhythm_emitted', introSlotEmitPayload);
        const introSlotStrictPayload = {
          groupId,
          stepIndex: stepAbs,
          beatIndex,
          slotProfile: musicProfileSourceType,
          note: lockedNoteName,
          instrumentId: lockedInstrumentId,
          musicLaneId: lockedLaneId,
          callResponseLane: lockedIntroLane || lane || 'solo',
        };
        if (noteIntroDebug) noteIntroDebug('intro_slot_strict_emit', introSlotStrictPayload);
        noteMusicSystemEvent?.('music_intro_slot_strict_emit', introSlotStrictPayload, { beatIndex, stepIndex: stepAbs, barIndex });
      }
      continue;
    }

    const groupRole = normalizeSwarmRole(
      introSlotIdentityActive ? (group?.introSlotRole || group?.role || roles.lead) : (group?.role || roles.lead),
      roles.lead
    );
    const isBassRole = groupRole === String(roles?.bass || 'bass');
    const groupLaneId = String(
      introSlotIdentityActive
        ? (group?.introSlotMusicLaneId || group?.musicLaneId || '')
        : (group?.musicLaneId || '')
    ).trim().toLowerCase();
    if (
      groupLaneId === 'secondary_loop_lane'
      && rhythmProfileCarrier
      && !introSlotIdentityActive
      && emittedSecondaryLoopRhythmThisStep
    ) {
      noteCallDiagnostic('secondary_loop_rhythm_step_cap');
      noteResponseDiagnostic('secondary_loop_rhythm_step_cap');
      continue;
    }
    const isPrimaryLoopOwnerGroup = groupLaneId === 'primary_loop_lane';
    const isFoundationBufferGroup = String(group?.sectionId || '').trim().toLowerCase() === 'foundation-buffer';
    if (laneDrivenFoundation && isBassRole && !rhythmProfileCarrier) {
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
    const explicitSoloGroup = isForcedSingleEmitterGroup(group, aliveMembers.length);
    const configuredPerformerCount = Math.max(performersMin, Math.min(performersMax, Math.trunc(Number(group.performers) || 1)));
    const groupedPerformerFloor = explicitSoloGroup
      ? 1
      : Math.min(2, Math.max(1, aliveMembers.length));
    const performerCount = Math.max(
      1,
      Math.min(
        aliveMembers.length || 1,
        Math.max(groupedPerformerFloor, configuredPerformerCount)
      )
    );
    const foundationLaneSnapshot = getFoundationLaneSnapshot
      ? getFoundationLaneSnapshot(stepAbs, barIndex)
      : null;
    if ((isBassRole || rhythmPulseCarrier) && foundationLaneSnapshot && !(introSlotIdentityActive && rhythmPulseCarrier)) {
      if (!foundationLaneSnapshot?.isActiveStep) {
        noteIntroCollectorState('collector_suppressed', { admissionReason: 'foundation_step_inactive' });
        if (slotRhythmCarrier) {
          const introSlotSuppressedPayload = {
            reason: 'foundation_step_inactive',
            groupId,
            stepIndex: stepAbs,
            beatIndex,
            slotProfile: musicProfileSourceType,
            musicLaneId: String(group?.musicLaneId || '').trim().toLowerCase(),
          };
          if (noteIntroDebug) noteIntroDebug('intro_slot_rhythm_suppressed', introSlotSuppressedPayload);
          noteMusicSystemEvent?.('music_intro_slot_suppressed', introSlotSuppressedPayload, { beatIndex, stepIndex: stepAbs, barIndex });
        }
        noteCallDiagnostic('foundation_step_inactive');
        noteResponseDiagnostic('foundation_step_inactive');
        continue;
      }
    }
    const mergeRhythmOverlapGate = (
      foundationLaneSnapshot?.isActiveStep === true
      && (activeMusicMode === 'lead_entry_merge' || activeMusicMode === 'full_texture')
      && groupLaneId === 'secondary_loop_lane'
      && rhythmProfileCarrier
      && !introSlotIdentityActive
      && !responseOverrideHit
    );
    if (mergeRhythmOverlapGate) {
      noteCallDiagnostic('secondary_foundation_overlap_gate', {
        stepInBar: step,
        slotProfile: musicProfileSourceType,
        instrumentId: String(group?.instrumentId || '').trim(),
      });
      noteResponseDiagnostic('secondary_foundation_overlap_gate', {
        stepInBar: step,
        slotProfile: musicProfileSourceType,
      });
      continue;
    }
    const melodyRows = introSlotIdentityActive && Array.isArray(group?.introSlotRows)
      ? group.introSlotRows
      : (Array.isArray(group?.rows) ? group.rows : []);
    const melodyStepDriven = melodyProfileCarrier
      && groupLaneId === 'primary_loop_lane';
    const primaryLoopRescueStep = (
      !stepActive
      && !responseOverrideHit
      && isPrimaryLoopOwnerGroup
      && melodyStepDriven
      && lane === 'call'
      && barIndex >= 12
      && (step === 0 || step === Math.max(1, Math.trunc(stepsPerBar / 2)))
    );
    if (primaryLoopRescueStep) {
      noteCallDiagnostic('primary_loop_rescue_step', {
        stepInBar: step,
        stepsPerBar,
      });
    } else if (!stepActive && !responseOverrideHit) {
      noteIntroCollectorState('collector_suppressed', { admissionReason: 'step_inactive' });
      noteEarlyCarrierTrace('suppressed', {
        branch: 'collector',
        admissionReason: 'step_inactive',
      });
      if (slotRhythmCarrier) {
        const introSlotSuppressedPayload = {
          reason: 'step_inactive',
          groupId,
          stepIndex: stepAbs,
          beatIndex,
          slotProfile: musicProfileSourceType,
          musicLaneId: String(group?.musicLaneId || '').trim().toLowerCase(),
        };
        if (noteIntroDebug) noteIntroDebug('intro_slot_rhythm_suppressed', introSlotSuppressedPayload);
        noteMusicSystemEvent?.('music_intro_slot_suppressed', introSlotSuppressedPayload, { beatIndex, stepIndex: stepAbs, barIndex });
      }
      noteCallDiagnostic('step_inactive');
      noteResponseDiagnostic('step_inactive');
      continue;
    }
    const melodyProfileNote = melodyProfileCarrier && melodyRows.length
      ? (options?.getSwarmPentatonicNoteByIndex?.(Math.max(0, Math.trunc(Number(melodyRows[step] ?? melodyRows[0]) || 0)))
        || getRandomSwarmPentatonicNote())
      : '';
    const effectiveNotes = introSlotIdentityActive && Array.isArray(group?.introSlotNotes) && group.introSlotNotes.length
      ? group.introSlotNotes
      : (Array.isArray(group?.notes) ? group.notes : []);
    const notesLen = Math.max(1, effectiveNotes.length);
    const noteIdx = (isBassRole || rhythmPercussionCarrier || soloCarrierType === 'rhythm')
      ? 0
      : (melodyStepDriven
        ? (step % notesLen)
        : (Math.max(0, Math.trunc(Number(group.noteCursor) || 0)) % notesLen));
    const lockedIntroNote = introSlotIdentityActive && Array.isArray(group?.introSlotNotes) && group.introSlotNotes.length
      ? normalizeSwarmNoteName(group.introSlotNotes[0])
      : '';
    const stepDrivenNoteName = melodyStepDriven
      ? normalizeSwarmNoteName(effectiveNotes?.[step] || melodyProfileNote || effectiveNotes?.[noteIdx])
      : '';
    const noteNameBaseRaw = lockedIntroNote
      || normalizeSwarmNoteName(stepDrivenNoteName || melodyProfileNote || effectiveNotes?.[noteIdx])
      || getRandomSwarmPentatonicNote();
    const noteNameBase = clampNoteToDirectorPool(
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
    const noteName = clampNoteToDirectorRegisterTarget(
      noteNameRaw,
      stepAbs + noteIdx + (lane === 'response' ? 1 : 0),
      registerTarget
    );
    const phraseStep = getPhraseStepState(
      stepAbs,
      melodyStepDriven ? Math.max(8, Math.trunc(Number(getPhraseLengthSteps(lane, group, stepAbs)) || 8)) : getPhraseLengthSteps(lane, group, stepAbs)
    );
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
    const playablePhraseGravityTarget = phraseGravityTarget
      ? clampNoteToDirectorRegisterTarget(
        phraseGravityTarget,
        stepAbs + noteIdx + (lane === 'response' ? 1 : 0),
        registerTarget
      )
      : '';
    const gravityBiasChance = melodyStepDriven
      ? (phraseStep.resolutionOpportunity ? 0.3 : 0.12)
      : (phraseStep.resolutionOpportunity ? 0.92 : 0.54);
    const phraseGravityOpportunity = !!playablePhraseGravityTarget && phraseStep.nearPhraseEnd;
    const gravityNoteNameRaw = (phraseGravityOpportunity && Math.random() < gravityBiasChance)
      ? playablePhraseGravityTarget
      : noteNameRaw;
    const gravityNoteName = clampNoteToDirectorRegisterTarget(
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
      } else if (!phraseStep.resolutionOpportunity && prevNote && Math.random() < (melodyStepDriven ? (motifRepeatBias * 0.08) : (motifRepeatBias * 0.5))) {
        styledNoteName = prevNote;
      } else if (!melodyStepDriven && prevIdx >= 0 && currIdx >= 0 && Math.abs(currIdx - prevIdx) > 1 && Math.random() > leadLeapChance) {
        styledNoteName = prevNote;
      } else if (roleForStyle === String(roles?.accent || 'accent') && prevNote && Math.random() > accentPitchVariance) {
        styledNoteName = prevNote;
      }
    }
    const resolutionGravityChance = melodyStepDriven
      ? (activeMusicMode === 'full_texture' ? 0.9 : 0.42)
      : 0.84;
    if (phraseStep.resolutionOpportunity && phraseGravityOpportunity && !isBassRole && !rhythmPercussionCarrier && Math.random() < resolutionGravityChance) {
      styledNoteName = playablePhraseGravityTarget;
    }
    const phraseGravityHit = phraseGravityOpportunity
      ? normalizeSwarmNoteName(styledNoteName) === normalizeSwarmNoteName(playablePhraseGravityTarget)
      : false;
    const phraseResolutionOpportunity = phraseGravityOpportunity && phraseStep.resolutionOpportunity;
    const phraseResolutionHit = phraseResolutionOpportunity && phraseGravityHit;
    const localCadenceRestSteps = lane === 'response'
      ? responseCadenceRestSteps
      : callCadenceRestSteps;
    const postCadenceRestUntilStep = melodyStepDriven
      ? -1
      : (phraseStep.resolutionOpportunity
      ? (stepAbs + localCadenceRestSteps)
      : -1);
    if (!melodyStepDriven) {
      group.noteCursor = noteIdx + 1;
    }

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
      const remaining = sortComposerGroupCandidatesByVisibilityAndRecency(
        aliveMembers.filter((e) => !usedEnemyIds.has(Math.trunc(Number(e.id) || 0))),
        isEnemyLikelyOnScreen,
      );
      if (!remaining.length) break;
      const enemy = remaining[0] || null;
      if (!enemy) continue;
      const enemyId = Math.trunc(Number(enemy.id) || 0);
      if (!(enemyId > 0) || usedEnemyIds.has(enemyId)) continue;
      usedEnemyIds.add(enemyId);
      performers.push(enemy);
    }
    if (!performers.length) continue;
    noteIntroCollectorState('collector_emit_generic', {
      actorId: Math.max(0, Math.trunc(Number(performers[0]?.id) || 0)),
      requestedNote: styledNoteName,
    });
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
          || group?.musicLaneInstrumentId
          || group?.instrumentId
          || ''
        )
        : (group?.musicLaneInstrumentId || group?.instrumentId))
        || performers[0]?.musicLaneInstrumentId
        || performers[0]?.instrumentId
        || performers[0]?.musicInstrumentId
        || performers[0]?.composerInstrument
        || ''
    ).trim();
    const lockedLane = inferInstrumentLaneFromCatalogId(lockedInstrumentId, '');
    const resolvedRole = lockedLane === 'bass'
      ? 'bass'
      : normalizeSwarmRole(group?.role || getSwarmRoleForEnemy(performers[0], roles.lead), roles.lead);
    const instrumentId = resolveSupportSafeInstrumentId(
      lockedInstrumentId || resolveSwarmRoleInstrumentId(
        resolvedRole,
        resolveSwarmSoundInstrumentId('projectile') || 'tone'
      ),
      {
        musicLaneId: groupLaneId,
        callResponseLane: lane,
        role: resolvedRole,
      }
    );
    const lifecycleAudioGain = lifecycleState === 'inactiveForScheduling'
      ? 0.35
      : (lifecycleState === 'deEmphasized' ? 0.52 : 1);
    const musicProminence = (() => {
      if (rhythmPercussionCarrier) return 'full';
      if (isSoloCarrier && soloCarrierType === 'rhythm') return 'full';
      if (melodyProfileCarrier || rhythmProfileCarrier) return 'full';
      if (isPrimaryLoopOwnerGroup) return 'full';
      if (isFoundationBufferGroup) return 'trace';
      if (isBassRole) return 'quiet';
      if (lane === 'response') return 'trace';
      return 'trace';
    })();
    const musicLayer = (() => {
      if (rhythmPulseCarrier || groupLaneId === 'foundation_lane') return 'foundation';
      if (rhythmMotionCarrier || groupLaneId === 'sparkle_lane') return 'sparkle';
      if (isBassRole) return 'foundation';
      return 'loops';
    })();
    const restrainedGroupGain = (() => {
      if (rhythmPercussionCarrier) return 1;
      if (isSoloCarrier) return 0.92;
      if (melodyProfileCarrier || rhythmProfileCarrier) return 0.92;
      if (isPrimaryLoopOwnerGroup) return 1;
      if (isFoundationBufferGroup) return 0.4;
      if (isBassRole) return 0.56;
      if (strongLeadWindowActive && directorWantsAnswerGroup) {
        if (lane === 'response') return 0.1;
        if (lane === 'call') return 0.14;
      }
      if (lane === 'response') return isPrimaryLoopOwnerGroup ? 0.22 : 0.16;
      if (groupLaneId === 'secondary_loop_lane') return 0.42;
      return 0.34;
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
      && !isPrimaryLoopOwnerGroup
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
    const directPlayerDuckGate = (
      playerLikelyAudible
      && !isSoloCarrier
      && !rhythmPercussionCarrier
      && !isPrimaryLoopOwnerGroup
      && !isBassRole
      && !isFoundationBufferGroup
      && (
        lane === 'response'
        || lane === 'call'
        || groupLaneId === 'sparkle_lane'
        || musicLayer === 'sparkle'
      )
      && !phraseResolutionOpportunity
      && !phraseGravityOpportunity
      && !responseOverrideHit
    );
    if (directPlayerDuckGate) {
      noteResponseDiagnostic(lane === 'response' ? 'player_duck_gate' : 'player_duck_support_gate', {
        stepInPhrase: Math.max(0, Math.trunc(Number(phraseStep?.stepInPhrase) || 0)),
        stepInBar: step,
        playerLikelyAudible,
      });
      noteCallDiagnostic('player_duck_gate', {
        stepInPhrase: Math.max(0, Math.trunc(Number(phraseStep?.stepInPhrase) || 0)),
        stepInBar: step,
        playerLikelyAudible,
      });
      continue;
    }
    const supportMaskingGate = (
      strongLeadWindowActive
      && !isSoloCarrier
      && !rhythmPercussionCarrier
      && !isPrimaryLoopOwnerGroup
      && !isBassRole
      && !isFoundationBufferGroup
      && (
        (lane === 'response'
          && !responseOverrideHit
          && !phraseResolutionOpportunity
          && !phraseGravityOpportunity
          && (step % 2) === 1)
        || (lane !== 'call'
          && lane !== 'response'
          && phraseStep.stepInPhrase > 0
          && (step % 2) === 1)
      )
    );
    if (supportMaskingGate) {
      noteResponseDiagnostic(lane === 'response' ? 'support_masking_gate' : 'support_lane_masking_gate', {
        stepInPhrase: Math.max(0, Math.trunc(Number(phraseStep?.stepInPhrase) || 0)),
        stepInBar: step,
        responseOverrideHit,
        phraseResolutionOpportunity,
        phraseGravityOpportunity,
      });
      continue;
    }
    group.__bsPhraseRestUntilStep = slotRhythmCarrier
      ? -1
      : (phraseResolutionHit
        ? (stepAbs + localCadenceRestSteps)
        : Math.max(-1, postCadenceRestUntilStep));
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
    const forcePlayableStructuralRhythmAction = (
      groupLaneId === 'secondary_loop_lane'
      && rhythmProfileCarrier
      && !introSlotIdentityActive
    );
    if (forcePlayableStructuralRhythmAction) {
      emittedSecondaryLoopRhythmThisStep = true;
    }
    const primaryLeadTraceFallback = isPrimaryLoopOwnerGroup
      ? getPrimaryLeadTraceFallback()
      : null;
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
        actionType: !forcePlayableStructuralRhythmAction && String(group.actionType || 'projectile') === 'explosion'
          ? 'composer-group-explosion'
          : 'composer-group-projectile',
        threatClass,
        visualSyncType: 'group-pulse',
        payload: {
          groupId,
          groupEventSource: slotRhythmCarrier
            ? 'intro_slot_generic'
            : (isFoundationBufferGroup ? 'foundation_buffer_generic' : 'composer_group_generic'),
          continuityId: getGroupEventContinuityId(group),
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
          leadFamily: String(group?.leadFamily || primaryLeadTraceFallback?.leadFamily || '').trim().toLowerCase(),
          leadContourId: String(group?.leadContourId || primaryLeadTraceFallback?.leadContourId || '').trim().toLowerCase(),
          leadContourEpoch: Math.max(0, Math.trunc(Number(
            group?.leadContourEpoch ?? primaryLeadTraceFallback?.leadContourEpoch
          ) || 0)),
          leadCadenceVariant: Math.max(0, Math.trunc(Number(
            group?.leadCadenceVariant ?? primaryLeadTraceFallback?.leadCadenceVariant
          ) || 0)),
          sectionTransitionRole: String(group?.sectionTransitionRole || primaryLeadTraceFallback?.sectionTransitionRole || '').trim().toLowerCase(),
          sectionArcEpoch: Math.max(0, Math.trunc(Number(
            group?.sectionArcEpoch ?? primaryLeadTraceFallback?.sectionArcEpoch
          ) || 0)),
          arrangementSupportIntent: String(group?.arrangementSupportIntent || '').trim().toLowerCase(),
          arrangementSupportStepBudget: Math.max(0, Math.trunc(Number(group?.arrangementSupportStepBudget) || 0)),
        },
      }));
    }
    if (!isSoloCarrier && lane === 'response' && performers.length > 0) {
      emittedResponseThisStep = true;
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
    if (slotRhythmCarrier) {
      if (!(Math.trunc(Number(group?.introSlotFirstAudibleBeatIndex) || -1) >= 0)) {
        group.introSlotFirstAudibleBeatIndex = beatIndex;
      }
      const introSlotGenericEmitPayload = {
        groupId,
        stepIndex: stepAbs,
        beatIndex,
        performerCount: performers.length,
        instrumentId,
        note: styledNoteName,
        slotProfile: musicProfileSourceType,
        musicLaneId: String(group?.musicLaneId || '').trim().toLowerCase(),
      };
      if (noteIntroDebug) noteIntroDebug('intro_slot_rhythm_emitted', introSlotGenericEmitPayload);
      const introSlotGenericBranchPayload = {
        groupId,
        stepIndex: stepAbs,
        beatIndex,
        slotProfile: musicProfileSourceType,
        note: styledNoteName,
        instrumentId,
        musicLaneId: String(group?.musicLaneId || '').trim().toLowerCase(),
        callResponseLane: lane,
      };
      if (noteIntroDebug) noteIntroDebug('intro_slot_generic_emit', introSlotGenericBranchPayload);
      noteMusicSystemEvent?.('music_intro_slot_generic_emit', introSlotGenericBranchPayload, { beatIndex, stepIndex: stepAbs, barIndex });
    }
    noteEarlyCarrierTrace('emit', {
      branch: slotRhythmCarrier
        ? 'generic'
        : ((introPercussionCarrier || ((rhythmProfileCarrier || soloRhythmCarrier) && !slotRhythmCarrier)) ? 'direct_candidate' : 'generic'),
      performerEnemyIds: performers
        .map((enemy) => Math.max(0, Math.trunc(Number(enemy?.id) || 0)))
        .filter((id) => id > 0),
      performerCount: performers.length,
      requestedNote: styledNoteName,
      instrumentId,
      actionType: String(group.actionType || 'projectile') === 'explosion'
        ? 'composer-group-explosion'
        : 'composer-group-projectile',
      directTriggerEligible: !!(
        (introPercussionCarrier || (introSlotIdentityActive && (rhythmBackbeatCarrier || rhythmMotionCarrier)) || ((rhythmProfileCarrier || soloRhythmCarrier) && !slotRhythmCarrier))
        && directTriggerComposerCarrier
      ),
    });
    if (noteMusicSystemEvent) {
      const aliveMemberIds = aliveMembers
        .map((enemy) => Math.max(0, Math.trunc(Number(enemy?.id) || 0)))
        .filter((id) => id > 0);
      const visibleMemberIds = aliveMembers
        .filter((enemy) => isEnemyLikelyOnScreen(enemy))
        .map((enemy) => Math.max(0, Math.trunc(Number(enemy?.id) || 0)))
        .filter((id) => id > 0);
      const performerEnemyIds = performers
        .map((enemy) => Math.max(0, Math.trunc(Number(enemy?.id) || 0)))
        .filter((id) => id > 0);
      noteMusicSystemEvent('music_group_performer_trace', {
        groupId,
        actorId: performerEnemyIds[0] || 0,
        role: String(group?.role || '').trim().toLowerCase(),
        musicLaneId: String(group?.musicLaneId || '').trim().toLowerCase(),
        reason: String(musicProfileSourceType || '').trim().toLowerCase(),
        performerCount: performers.length,
        selectedPrimaryEnemyId: performerEnemyIds[0] || 0,
        aliveEnemyIdsCsv: aliveMemberIds.join(','),
        visibleEnemyIdsCsv: visibleMemberIds.join(','),
        performerEnemyIdsCsv: performerEnemyIds.join(','),
      }, {
        beatIndex,
        stepIndex: stepAbs,
        barIndex,
      });
    }
    if ((introPercussionCarrier || (introSlotIdentityActive && (rhythmBackbeatCarrier || rhythmMotionCarrier)) || ((rhythmProfileCarrier || soloRhythmCarrier) && !slotRhythmCarrier)) && directTriggerComposerCarrier) {
      noteEarlyCarrierTrace('direct_trigger', {
        branch: 'direct_trigger',
        performerEnemyIds: performers
          .map((enemy) => Math.max(0, Math.trunc(Number(enemy?.id) || 0)))
          .filter((id) => id > 0),
        performerCount: performers.length,
        requestedNote: styledNoteName,
        instrumentId,
        actionType: String(group.actionType || 'projectile') === 'explosion'
          ? 'composer-group-explosion'
          : 'composer-group-projectile',
      });
      for (const enemy of performers) {
        try {
          directTriggerComposerCarrier({
            enemyId: Math.max(0, Math.trunc(Number(enemy?.id) || 0)),
            groupId,
            instrumentId,
            note: styledNoteName,
            audioGain: (introPercussionCarrier || rhythmProfileCarrier)
              ? 1
              : clamp01(Number(group?.musicParticipationGain == null ? 1 : group.musicParticipationGain) * lifecycleAudioGain * restrainedGroupGain),
            musicProminence,
            soloCarrierType,
            introPercussionCarrier,
            visualOnly: true,
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
        callResponseRuntime.fallbackResponseGroupId = 0;
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
  if (
    !emittedResponseThisStep
    && directorWantsAnswerGroup
  ) {
    const lastCallStep = Math.max(-1, Math.trunc(Number(callResponseRuntime.lastCallStepAbs) || -1));
    const sinceCall = lastCallStep >= 0 ? (stepAbs - lastCallStep) : -1;
    const pendingCallExpiresStepAbs = Math.max(
      Math.trunc(Number(callResponseRuntime.pendingCallExpiresStepAbs) || -1),
      getPendingCallExpiry(lastCallStep, callResponseRuntime.responsePhraseTargetLength)
    );
    const responseWindowOpen = lastCallStep >= 0
      && sinceCall >= minResponseDelaySteps
      && stepAbs <= pendingCallExpiresStepAbs;
    const proxyFallbackGroupId = Math.max(
      1,
      Math.trunc(Number(callResponseRuntime.fallbackResponseGroupId) || 0)
        || (900000 + Math.max(0, Math.trunc(Number(callResponseRuntime.lastCallGroupId) || 0)))
    );
    const fallbackResponseGroup = fallbackResponseProxyGroup
      ? {
        ...fallbackResponseProxyGroup,
        id: Math.max(1, Math.trunc(Number(fallbackResponseProxyGroup?.id) || 0)) || proxyFallbackGroupId,
      }
      : {
        id: proxyFallbackGroupId,
        role: roles?.accent || 'accent',
        musicLaneId: 'secondary_loop_lane',
        musicLaneLayer: 'loops',
        continuityId: `fallback-response-${proxyFallbackGroupId}`,
        instrumentId: '',
        instrument: '',
        notes: [],
        phraseTargets: [],
        phraseRoot: '',
        musicParticipationGain: 1,
      };
    const continuingResponsePhrase = Math.max(0, Math.trunc(Number(callResponseRuntime.activeResponseGroupId) || 0)) > 0
      && Math.max(0, Math.trunc(Number(callResponseRuntime.activeResponseGroupId) || 0)) === Math.max(0, Math.trunc(Number(fallbackResponseGroup?.id) || 0))
      && stepAbs <= Math.max(-1, Math.trunc(Number(callResponseRuntime.responseHoldUntilStepAbs) || -1));
    if (responseWindowOpen || continuingResponsePhrase) {
      const responsePool = getDirectorNotePool();
      const fallbackBaseNote = normalizeSwarmNoteName(
        Array.isArray(fallbackResponseGroup?.notes) && fallbackResponseGroup.notes.length
          ? fallbackResponseGroup.notes.find(Boolean)
          : ''
      ) || getRandomSwarmPentatonicNote();
      const responseSeedNote = normalizeSwarmNoteName(chooseResponseNoteFromPool({
        callNote: callResponseRuntime.lastCallNote,
        fallbackNote: fallbackBaseNote,
        stepAbs,
        notePool: responsePool,
        normalizeNoteName: normalizeSwarmNoteName,
      })) || fallbackBaseNote;
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
      const minimumFallbackResponseLength = strongLeadWindowActive ? 2 : 3;
      const responseTargetLength = Math.max(minimumFallbackResponseLength, Math.min(
        responseLengthCap,
        Math.trunc(Number(callResponseRuntime.responsePhraseTargetLength) || 2)
      ));
      const responseOffsets = responseTargetLength <= 1
        ? [responseDir]
        : (responseTargetLength === 2
          ? [responseDir, 0]
          : (responseTargetLength === 3 ? [responseDir, responseDir * 2, responseDir] : [responseDir, responseDir * 2, responseDir, 0]));
      const responseIdx = callIdx >= 0 && Array.isArray(responsePool) && responsePool.length
        ? (((callIdx + responseOffsets[Math.min(responseProgress, responseOffsets.length - 1)]) % responsePool.length) + responsePool.length) % responsePool.length
        : -1;
      const noteName = clampNoteToDirectorRegisterTarget(
        responseIdx >= 0
          ? (normalizeSwarmNoteName(responsePool[responseIdx]) || responseSeedNote)
          : responseSeedNote,
        stepAbs + 1,
        getGroupRegisterTarget({ lane: 'response' })
      );
      const responsePhraseProgressForEvent = continuingResponsePhrase
        ? (Math.max(0, Math.trunc(Number(callResponseRuntime.responsePhraseProgress) || 0)) + 1)
        : 1;
      const groupId = Math.max(0, Math.trunc(Number(fallbackResponseGroup?.id) || 0));
      const fallbackCarrierSourceGroup = fallbackResponseCarrierGroup || fallbackResponseGroup;
      const fallbackAliveMembers = getLiveComposerMembersForGroup(fallbackCarrierSourceGroup);
      const fallbackPerformer = fallbackAliveMembers.length
        ? (chooseEnemyForNote({
          group: fallbackCarrierSourceGroup,
          noteName,
          aliveMembers: fallbackAliveMembers,
          normalizeNoteName: normalizeSwarmNoteName,
          getFallbackNote: getRandomSwarmPentatonicNote,
        }) || fallbackAliveMembers[0] || null)
        : null;
      const fallbackActorId = Math.max(0, Math.trunc(Number(fallbackPerformer?.id) || 0));
      let fallbackMusicLaneId = String(
        fallbackResponseGroup?.musicLaneId
          || (String(fallbackResponseGroup?.musicLaneLayer || '').trim().toLowerCase() === 'sparkle' ? 'sparkle_lane' : 'secondary_loop_lane')
      ).trim().toLowerCase() || 'secondary_loop_lane';
      if (!sparkleLaneAllowed && fallbackMusicLaneId === 'sparkle_lane') {
        fallbackMusicLaneId = 'secondary_loop_lane';
      }
      const instrumentId = resolveSupportSafeInstrumentId(
        String(
          fallbackResponseGroup?.instrumentId
            || fallbackResponseGroup?.instrument
            || fallbackCarrierSourceGroup?.instrumentId
            || fallbackCarrierSourceGroup?.instrument
            || fallbackPerformer?.instrumentId
            || fallbackPerformer?.musicInstrumentId
            || fallbackPerformer?.composerInstrument
            || getIdForDisplayName('Chime')
            || resolveSwarmRoleInstrumentId(roles?.accent || 'accent', resolveSwarmSoundInstrumentId('projectile') || 'tone')
            || resolveSwarmSoundInstrumentId('projectile')
            || 'tone'
        ).trim(),
        {
          musicLaneId: fallbackMusicLaneId,
          callResponseLane: 'response',
          role: roles?.accent || 'accent',
        }
      );
      const fallbackMusicLayer = fallbackMusicLaneId === 'sparkle_lane'
        ? 'sparkle'
        : 'loops';
      events.push(createPerformedBeatEvent({
        actorId: fallbackActorId,
        beatIndex,
        stepIndex: stepAbs,
        role: normalizeSwarmRole(fallbackResponseGroup?.role || 'accent', roles?.accent || 'accent'),
        note: noteName,
        instrumentId,
        actionType: 'composer-group-projectile',
        threatClass: String(threat.light || 'light'),
        visualSyncType: 'group-pulse',
        payload: {
          groupId,
          groupEventSource: 'composer_group_response_fallback',
          continuityId: String(fallbackResponseGroup?.continuityId || '').trim(),
          musicLayer: fallbackMusicLayer,
          musicProminence: 'quiet',
          soloCarrierType: '',
          musicLaneId: fallbackMusicLaneId,
          callResponseLane: 'response',
          callResponseQualified: true,
          callResponsePhraseProgress: responsePhraseProgressForEvent,
          musicRegister: 'high',
          audioGain: clamp01(Number(fallbackResponseGroup?.musicParticipationGain == null ? 0.3 : fallbackResponseGroup.musicParticipationGain * 0.3)),
          requestedNoteRaw: noteName,
          phraseGravityTarget: normalizeSwarmNoteName(fallbackResponseGroup?.phraseRoot) || '',
          phraseGravityHit: false,
          phraseResolutionOpportunity: false,
          phraseResolutionHit: false,
        },
      }));
      callResponseRuntime.lastResponseStepAbs = stepAbs;
      callResponseRuntime.lastResponseGroupId = groupId;
      callResponseRuntime.lastResponseNote = normalizeSwarmNoteName(noteName) || noteName;
      callResponseRuntime.pendingCallExpiresStepAbs = -1;
      callResponseRuntime.activeResponseGroupId = groupId;
      callResponseRuntime.fallbackResponseGroupId = groupId;
      callResponseRuntime.responseDirection = responseDir;
      callResponseRuntime.responsePhraseProgress = responsePhraseProgressForEvent;
      emittedResponseThisStep = true;
      callResponseRuntime.responseHoldUntilStepAbs = Math.max(
        stepAbs,
        Math.min(
          stepAbs + Math.max(0, (responseTargetLength - 1) * responsePhraseSteps),
          Math.max(stepAbs, lastCallStep + responseWindowSteps + responseWindowGraceSteps)
        )
      );
      noteMusicSystemEvent?.('music_call_response_response_group_state', {
        groupId,
        stepIndex: stepAbs,
        beatIndex,
        reason: 'fallback_emitted',
        callStepAbs: lastCallStep,
        responseHoldUntilStepAbs: Math.max(-1, Math.trunc(Number(callResponseRuntime.responseHoldUntilStepAbs) || -1)),
        activeResponseGroupId: Math.max(0, Math.trunc(Number(callResponseRuntime.activeResponseGroupId) || 0)),
        lifecycleState: 'active',
      });
    }
  }
  if (directBedFallbackWanted) {
    const anchorStep = step === 0 || step === 4;
    const backbeatStep = step === 2 || step === 6;
    const bridgePulseStep = anchorStep || backbeatStep;
    const fallbackFoundationLaneSnapshot = getFoundationLaneSnapshot
      ? getFoundationLaneSnapshot(stepAbs, barIndex)
      : null;
    const mergeFallbackFoundationOverlap = (
      fallbackFoundationLaneSnapshot?.isActiveStep === true
      && (activeMusicMode === 'lead_entry_merge' || activeMusicMode === 'full_texture')
    );
    const allowBedStep = (playerLikelyAudible ? backbeatStep : bridgePulseStep)
      && !mergeFallbackFoundationOverlap;
    if (allowBedStep && !emittedSecondaryLoopRhythmThisStep) {
      const leadCarrierGroup = activePrimaryLoopLeadGroups[0] || null;
      const bedActorId = 0;
      const bedNote = normalizeSwarmNoteName(
        anchorStep ? 'D4' : 'A#4'
      ) || (anchorStep ? 'D4' : 'A#4');
      const bedInstrumentId = String(
        backbeatStep
          ? (
            getIdForDisplayName('Drum Snare 2')
            || getIdForDisplayName('Drum Snare 1')
            || getIdForDisplayName('Hand clap (electro)')
            || getIdForDisplayName('Hand clap')
            || getIdForDisplayName('Bass Tone 3')
          )
          : (
            getIdForDisplayName('Drum Snare 2')
            || getIdForDisplayName('Hand clap (electro)')
            || getIdForDisplayName('Hand clap')
            || getIdForDisplayName('Drum Snare 1')
            || getIdForDisplayName('Bass Tone 3')
          )
          || resolveSwarmRoleInstrumentId(roles?.accent || 'accent', resolveSwarmSoundInstrumentId('projectile') || 'tone')
          || resolveSwarmSoundInstrumentId('projectile')
          || 'tone'
      ).trim();
      const bedProminence = backbeatStep ? 'full' : 'quiet';
      const bedGain = clamp01(
        playerLikelyAudible
          ? 0.52
          : (backbeatStep ? 0.82 : 0.66)
      );
      events.push(createPerformedBeatEvent({
        actorId: bedActorId,
        beatIndex,
        stepIndex: stepAbs,
        role: normalizeSwarmRole(roles?.accent || 'accent', roles?.accent || 'accent'),
        note: bedNote,
        instrumentId: bedInstrumentId,
        actionType: 'composer-group-projectile',
        threatClass: String(threat.light || 'light'),
        visualSyncType: 'none',
        payload: {
          groupId: Math.max(0, Math.trunc(Number(leadCarrierGroup?.id) || 0)),
          ghostPlayback: true,
          groupEventSource: 'secondary_loop_bridge_fallback',
          continuityId: 'secondary-loop-bridge-fallback',
          musicLayer: 'loops',
          musicVoiceKey: 'percussion_backbeat',
          onboardingPriority: 1,
          musicProminence: bedProminence,
          soloCarrierType: '',
          musicLaneId: 'secondary_loop_lane',
          callResponseLane: 'call',
          callResponseQualified: false,
          callResponsePhraseProgress: 0,
          musicRegister: 'mid',
          audioGain: bedGain,
          requestedNoteRaw: bedNote,
          phraseGravityTarget: '',
          phraseGravityHit: false,
          phraseResolutionOpportunity: false,
          phraseResolutionHit: false,
        },
      }));
      emittedSecondaryBedFallbackThisStep = true;
      noteMusicSystemEvent?.('music_secondary_loop_bridge_fallback', {
        stepIndex: stepAbs,
        beatIndex,
        barIndex,
        actorId: bedActorId,
        leadGroupId: Math.max(0, Math.trunc(Number(leadCarrierGroup?.id) || 0)),
        note: bedNote,
        instrumentId: bedInstrumentId,
        playerLikelyAudible,
      });
    }
  }
  const explicitOrnamentCompanionWanted = (
    answerOrnamentAllowed
    && sparkleLaneAllowed
    && !emittedAnswerOrnamentThisStep
    && (activeMusicMode === 'lead_entry_merge' || activeMusicMode === 'full_texture' || secondaryLoopProtected)
    && activePrimaryLoopLeadGroups.length > 0
    && (step === 2 || step === 6)
    && (barIndex % 2 === 0)
  );
  if (explicitOrnamentCompanionWanted) {
    const leadCarrierGroup = activePrimaryLoopLeadGroups[0] || null;
    const ornamentCarrierSourceGroup = fallbackResponseCarrierGroup || leadCarrierGroup || null;
    const ornamentRawNote = normalizeSwarmNoteName(step === 2 ? 'D5' : 'A4') || 'D5';
    const ornamentNote = clampNoteToDirectorRegisterTarget(
      ornamentRawNote,
      stepAbs + 3,
      'mid'
    );
    const ornamentInstrumentId = resolveSupportSafeInstrumentId(
      String(
        getIdForDisplayName('Bell')
          || getIdForDisplayName('Xylophone')
          || getIdForDisplayName('Chime')
          || getIdForDisplayName('Retro Triangle')
          || resolveSwarmRoleInstrumentId(roles?.accent || 'accent', resolveSwarmSoundInstrumentId('projectile') || 'tone')
          || resolveSwarmSoundInstrumentId('projectile')
          || 'tone'
      ).trim(),
      {
        musicLaneId: 'sparkle_lane',
        callResponseLane: 'response',
        role: roles?.accent || 'accent',
      }
    );
    const ornamentAliveMembers = ornamentCarrierSourceGroup
      ? getLiveComposerMembersForGroup(ornamentCarrierSourceGroup)
      : [];
    const ornamentPerformer = ornamentAliveMembers.length
      ? (chooseEnemyForNote({
        group: ornamentCarrierSourceGroup,
        noteName: ornamentNote,
        aliveMembers: ornamentAliveMembers,
        normalizeNoteName: normalizeSwarmNoteName,
        getFallbackNote: getRandomSwarmPentatonicNote,
      }) || ornamentAliveMembers[0] || null)
      : null;
    const ornamentActorId = Math.max(0, Math.trunc(Number(ornamentPerformer?.id) || 0));
    const ornamentGroupId = Math.max(
      0,
      Math.trunc(Number(ornamentCarrierSourceGroup?.id) || 0)
        || Math.trunc(Number(leadCarrierGroup?.id) || 0)
    );
    events.push(createPerformedBeatEvent({
      actorId: ornamentActorId,
      beatIndex,
      stepIndex: stepAbs,
      role: normalizeSwarmRole(roles?.accent || 'accent', roles?.accent || 'accent'),
      note: ornamentNote,
      instrumentId: ornamentInstrumentId,
      actionType: 'composer-group-projectile',
      threatClass: String(threat.light || 'light'),
      visualSyncType: ornamentActorId > 0 ? 'group-pulse' : 'none',
      payload: {
        groupId: ornamentGroupId,
        ghostPlayback: ornamentActorId <= 0,
        groupEventSource: 'answer_ornament_fallback',
        continuityId: 'answer-ornament-fallback',
        musicLayer: 'sparkle',
        musicVoiceKey: 'answer_ornament',
        onboardingPriority: 0,
        musicProminence: playerLikelyAudible ? 'trace' : 'quiet',
        soloCarrierType: '',
        musicLaneId: 'sparkle_lane',
        callResponseLane: 'response',
        callResponseQualified: true,
        callResponsePhraseProgress: 1,
        musicRegister: 'mid',
        audioGain: playerLikelyAudible ? 0.24 : 0.48,
        requestedNoteRaw: ornamentNote,
        phraseGravityTarget: '',
        phraseGravityHit: false,
        phraseResolutionOpportunity: false,
        phraseResolutionHit: false,
      },
    }));
    emittedAnswerOrnamentThisStep = true;
    noteMusicSystemEvent?.('music_answer_ornament_fallback', {
      stepIndex: stepAbs,
      beatIndex,
      barIndex,
      actorId: ornamentActorId,
      note: ornamentNote,
      instrumentId: ornamentInstrumentId,
    });
  }
  const directAnswerOrnamentWanted = (
    answerOrnamentAllowed
    && sparkleLaneAllowed
    && (strongLeadWindowActive || secondaryLoopProtected)
    && activePrimaryLoopLeadGroups.length > 0
  );
  if (directAnswerOrnamentWanted && !emittedAnswerOrnamentThisStep) {
    const ornamentStep = step === 2 || step === 6;
    if (ornamentStep) {
      const leadCarrierGroup = activePrimaryLoopLeadGroups[0] || null;
      const ornamentCarrierSourceGroup = fallbackResponseCarrierGroup || leadCarrierGroup || null;
      const notePool = getDirectorNotePool();
      const poolLength = Array.isArray(notePool) ? notePool.length : 0;
      const poolIndex = poolLength
        ? (((Math.trunc(Number(stepAbs) || 0) + Math.trunc(Number(barIndex) || 0)) % poolLength) + poolLength) % poolLength
        : -1;
      const ornamentPhraseProgress = step === 2 ? 1 : 2;
      const rawOrnamentNote = normalizeSwarmNoteName(
        poolIndex >= 0 ? notePool[poolIndex] : ''
      ) || (step === 2 ? 'D5' : 'A4');
      const ornamentNote = clampNoteToDirectorRegisterTarget(
        rawOrnamentNote,
        stepAbs + 5,
        'mid'
      );
      const ornamentInstrumentId = resolveSupportSafeInstrumentId(
        String(
          getIdForDisplayName('Bell')
            || getIdForDisplayName('Xylophone')
            || getIdForDisplayName('Chime')
            || getIdForDisplayName('Retro Triangle')
            || resolveSwarmRoleInstrumentId(roles?.accent || 'accent', resolveSwarmSoundInstrumentId('projectile') || 'tone')
            || resolveSwarmSoundInstrumentId('projectile')
            || 'tone'
        ).trim(),
        {
          musicLaneId: 'sparkle_lane',
          callResponseLane: 'response',
          role: roles?.accent || 'accent',
        }
      );
      const ornamentAliveMembers = ornamentCarrierSourceGroup
        ? getLiveComposerMembersForGroup(ornamentCarrierSourceGroup)
        : [];
      const ornamentPerformer = ornamentAliveMembers.length
        ? (chooseEnemyForNote({
          group: ornamentCarrierSourceGroup,
          noteName: ornamentNote,
          aliveMembers: ornamentAliveMembers,
          normalizeNoteName: normalizeSwarmNoteName,
          getFallbackNote: getRandomSwarmPentatonicNote,
        }) || ornamentAliveMembers[0] || null)
        : null;
      const ornamentActorId = Math.max(0, Math.trunc(Number(ornamentPerformer?.id) || 0));
      const ornamentGroupId = Math.max(
        0,
        Math.trunc(Number(ornamentCarrierSourceGroup?.id) || 0)
          || Math.trunc(Number(leadCarrierGroup?.id) || 0)
      );
      events.push(createPerformedBeatEvent({
        actorId: ornamentActorId,
        beatIndex,
        stepIndex: stepAbs,
        role: normalizeSwarmRole(roles?.accent || 'accent', roles?.accent || 'accent'),
        note: ornamentNote,
        instrumentId: ornamentInstrumentId,
        actionType: 'composer-group-projectile',
        threatClass: String(threat.light || 'light'),
        visualSyncType: ornamentActorId > 0 ? 'group-pulse' : 'none',
        payload: {
          groupId: ornamentGroupId,
          ghostPlayback: ornamentActorId <= 0,
          groupEventSource: 'answer_ornament_fallback',
          continuityId: 'answer-ornament-fallback',
          musicLayer: 'sparkle',
          musicVoiceKey: 'answer_ornament',
          onboardingPriority: 0,
          musicProminence: playerLikelyAudible ? 'trace' : (step === 2 ? 'quiet' : 'full'),
          soloCarrierType: '',
          musicLaneId: 'sparkle_lane',
          callResponseLane: 'response',
          callResponseQualified: true,
          callResponsePhraseProgress: ornamentPhraseProgress,
          musicRegister: 'mid',
          audioGain: playerLikelyAudible ? 0.28 : (step === 2 ? 0.46 : 0.58),
          requestedNoteRaw: ornamentNote,
          phraseGravityTarget: '',
          phraseGravityHit: false,
          phraseResolutionOpportunity: false,
          phraseResolutionHit: false,
        },
      }));
      noteMusicSystemEvent?.('music_answer_ornament_fallback', {
        stepIndex: stepAbs,
        beatIndex,
        barIndex,
        note: ornamentNote,
        instrumentId: ornamentInstrumentId,
      });
    }
  }
  return events;
}
