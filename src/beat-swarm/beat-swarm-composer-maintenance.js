import {
  applyBeatSwarmFormationRuntime,
  buildBeatSwarmFormationRuntime,
} from './beat-swarm-formation-spawn.js';
import {
  getBeatSwarmLevel1EpochId,
  getBeatSwarmLevel1RoleContract,
} from './beat-swarm-level1-contract.js';

export function maintainComposerEnemyGroupsRuntime(options = null) {
  const state = options?.state && typeof options.state === 'object' ? options.state : {};
  const constants = options?.constants && typeof options.constants === 'object' ? options.constants : {};
  const helpers = options?.helpers && typeof options.helpers === 'object' ? options.helpers : {};
  const getPerfNow = typeof helpers.getPerfNow === 'function'
    ? helpers.getPerfNow
    : (() => {
      try {
        if (typeof performance !== 'undefined' && typeof performance.now === 'function') return () => performance.now();
      } catch {}
      return () => Date.now();
    })();
  const recordPerfSample = typeof helpers.recordPerfSample === 'function'
    ? helpers.recordPerfSample
    : null;
  const withPerfSample = (name, fn) => {
    if (typeof fn !== 'function') return undefined;
    if (!name || typeof recordPerfSample !== 'function') return fn();
    const startedAt = getPerfNow();
    try {
      return fn();
    } finally {
      recordPerfSample(name, Math.max(0, getPerfNow() - startedAt));
    }
  };

  const composerEnemyGroups = Array.isArray(state.composerEnemyGroups) ? state.composerEnemyGroups : [];
  const composerRuntime = state.composerRuntime && typeof state.composerRuntime === 'object' ? state.composerRuntime : {};
  const currentBeatIndex = Number(state.currentBeatIndex) || 0;
  const currentBarIndex = Math.max(0, Math.trunc(Number(state.currentBarIndex) || 0));
  const sessionAgeBars = Math.max(0, Math.trunc(Number(state.sessionAgeBars) || 0));
  const sessionAgeBeats = Math.max(0, Math.trunc(Number(state.sessionAgeBeats) || 0));
  const sessionSeed = Math.max(0, Math.trunc(Number(state.sessionSeed) || 0));
  const introStateAgeBars = Math.max(0, Math.trunc(Number(state.introStateAgeBars) || 0));
  const introStateAgeBeats = Math.max(0, Math.trunc(Number(state.introStateAgeBeats) || 0));
  const currentEnergyStateName = String(state.currentEnergyStateName || '').trim().toLowerCase();
  const introStage = String(state.introStage || 'none').trim().toLowerCase() || 'none';
  const enemies = Array.isArray(state.enemies) ? state.enemies : [];
  const musicModeRuntime = state.musicModeRuntime && typeof state.musicModeRuntime === 'object'
    ? state.musicModeRuntime
    : null;
  const levelPhaseRuntime = state.levelPhaseRuntime && typeof state.levelPhaseRuntime === 'object'
    ? state.levelPhaseRuntime
    : null;
  const leadAuthorityRuntime = state.leadAuthorityRuntime && typeof state.leadAuthorityRuntime === 'object'
    ? state.leadAuthorityRuntime
    : null;
  const enemyDirectorRuntime = state.enemyDirectorRuntime && typeof state.enemyDirectorRuntime === 'object'
    ? state.enemyDirectorRuntime
    : null;
  const eventSectionRuntime = state.eventSectionRuntime && typeof state.eventSectionRuntime === 'object'
    ? state.eventSectionRuntime
    : null;
  const activeEventSection = String(eventSectionRuntime?.activeEventSection || '').trim().toLowerCase();
  const sanitizeEnemyMusicInstrumentId = typeof helpers.sanitizeEnemyMusicInstrumentId === 'function'
    ? helpers.sanitizeEnemyMusicInstrumentId
    : ((instrumentId, fallback) => helpers.resolveInstrumentIdOrFallback?.(instrumentId, fallback) || fallback || 'tone');
  const inferInstrumentLaneFromCatalogId = typeof helpers.inferInstrumentLaneFromCatalogId === 'function'
    ? helpers.inferInstrumentLaneFromCatalogId
    : (() => '');
  const noteMusicSystemEvent = typeof helpers.noteMusicSystemEvent === 'function'
    ? helpers.noteMusicSystemEvent
    : null;
  const noteDirectorSpawnArchetype = typeof helpers.noteDirectorSpawnArchetype === 'function'
    ? helpers.noteDirectorSpawnArchetype
    : null;
  const enemyById = withPerfSample('maintainComposerGroups.enemyIndex', () => {
    const index = new Map();
    for (let i = 0; i < enemies.length; i++) {
      const enemy = enemies[i];
      const enemyId = Math.trunc(Number(enemy?.id) || 0);
      if (enemyId > 0) index.set(enemyId, enemy);
    }
    return index;
  });
  const getAliveComposerEnemiesByIds = (idsLike) => {
    const out = [];
    const ids = idsLike instanceof Set ? Array.from(idsLike) : (Array.isArray(idsLike) ? idsLike : []);
    for (let i = 0; i < ids.length; i++) {
      const enemy = enemyById.get(Math.trunc(Number(ids[i]) || 0));
      if (!enemy || enemy?.retreating) continue;
      if (String(enemy?.enemyType || '') !== 'composer-group-member') continue;
      out.push(enemy);
    }
    return out;
  };

  const pacingCaps = helpers.getCurrentPacingCaps?.() || {};
  const directorLanePlan = helpers.getDirectorLanePlan?.() || null;
  const spawnDirectorState = helpers.getSpawnDirectorState?.() || null;
  const spawnConfigLoaded = String(spawnDirectorState?.configStatus || '').trim().toLowerCase() === 'loaded';
  const spawnChosenId = String(spawnDirectorState?.lastEvaluation?.chosenId || '').trim().toLowerCase();
  const spawnWantsComposer = spawnConfigLoaded && (spawnChosenId === 'composer_basic' || spawnChosenId === 'solo_rhythm_basic');
  const supportLanePlan = directorLanePlan && typeof directorLanePlan === 'object' ? directorLanePlan.support : null;
  const answerLanePlan = directorLanePlan && typeof directorLanePlan === 'object' ? directorLanePlan.answer : null;
  const answerLanePreferredProfileSourceType = String(answerLanePlan?.preferredProfileSourceType || '').trim().toLowerCase() || 'answer_ornament';
  const answerLanePreferredLaneId = String(answerLanePlan?.preferredLaneId || '').trim().toLowerCase();
  const answerLaneResponseFamily = String(answerLanePlan?.responseFamily || '').trim().toLowerCase();
  const primaryLoopLanePlan = directorLanePlan && typeof directorLanePlan === 'object' ? directorLanePlan.primary_loop : null;
  const foundationLanePlan = directorLanePlan && typeof directorLanePlan === 'object' ? directorLanePlan.foundation : null;
  const supportLaneActive = supportLanePlan?.active === true;
  const answerLaneActive = answerLanePlan?.active === true;
  const primaryLoopLaneActive = primaryLoopLanePlan?.active === true;
  const pacingState = String(helpers.getCurrentPacingStateName?.() || '').trim().toLowerCase();
  const introWindowActive = introStage !== 'none';
  const introComposerLockActive = introStage === 'player_only';
  const introRhythmOnlyWindow = introStage === 'rhythm_only';
  const introSoftRampWindow = introStage === 'soft_ramp';
  const melodySoloWindowOpen = !introWindowActive && currentBarIndex >= 12;
  const getGroupFormationCarrierType = (groupLike) => {
    const group = groupLike && typeof groupLike === 'object' ? groupLike : {};
    const soloCarrierType = String(group?.soloCarrierType || '').trim().toLowerCase();
    const introCarrierBodyType = String(group?.introCarrierBodyType || '').trim().toLowerCase();
    return (soloCarrierType || introCarrierBodyType === 'solo') ? 'solo_carrier' : 'composer_group';
  };
  const applyFormationRuntimeToGroup = (groupLike) => {
    const group = groupLike && typeof groupLike === 'object' ? groupLike : null;
    if (!group) return group;
    const formationRuntime = buildBeatSwarmFormationRuntime({
      group,
      activeMusicMode: String(musicModeRuntime?.activeMusicMode || '').trim().toLowerCase(),
      introStage,
      activeEventSection: String(eventSectionRuntime?.activeEventSection || '').trim().toLowerCase(),
      enemyDirectorRuntime,
      runSeed: sessionSeed,
      barIndex: currentBarIndex,
      carrierType: getGroupFormationCarrierType(group),
    });
    return applyBeatSwarmFormationRuntime(group, formationRuntime);
  };
  const leadEntryMergeActive = String(musicModeRuntime?.activeMusicMode || '').trim().toLowerCase() === 'lead_entry_merge';
  const fullTextureActive = String(musicModeRuntime?.activeMusicMode || '').trim().toLowerCase() === 'full_texture';
  const fullTexturePhaseVariant = String(levelPhaseRuntime?.phaseVariant || musicModeRuntime?.phaseVariant || 'default').trim().toLowerCase();
  const eventShowcaseActive = !!activeEventSection && activeEventSection !== 'none';
  const sustainedFullTextureNoShowcase = fullTextureActive && !eventShowcaseActive;
  const degradedFullTextureNoOrnamentActive = fullTextureActive && fullTexturePhaseVariant === 'no_ornament';
  const protectedMergeTextureActive = leadEntryMergeActive || fullTextureActive;
  const leadMergeStableBars = Math.max(0, Math.trunc(Number(levelPhaseRuntime?.leadMergeStableBars) || 0));
  const stableMergeSupportLockActive = leadEntryMergeActive && leadMergeStableBars >= 2;
  const fullTextureSupportLockActive = fullTextureActive
    && Math.max(0, Math.trunc(Number(levelPhaseRuntime?.timeInPhaseBars) || 0)) <= 2;
  const level1RoleContract = getBeatSwarmLevel1RoleContract({
    activeLevelPhase: String(levelPhaseRuntime?.activeLevelPhase || musicModeRuntime?.activeMusicMode || '').trim().toLowerCase(),
    phaseVariant: fullTexturePhaseVariant,
    answerWindowActive: answerLaneActive,
    cadenceWindowActive: answerLaneActive && answerLaneResponseFamily === 'echo',
    stableWindow: answerLaneActive || supportLaneActive || primaryLoopLaneActive,
  });
  const level1SupportPolicy = level1RoleContract?.supportPolicy && typeof level1RoleContract.supportPolicy === 'object'
    ? level1RoleContract.supportPolicy
    : {};
  const level1AllowedRoles = new Set(
    Array.isArray(level1RoleContract?.allowedRoles) ? level1RoleContract.allowedRoles : []
  );
  const level1EpochId = getBeatSwarmLevel1EpochId({
    activeLevelPhase: String(levelPhaseRuntime?.activeLevelPhase || musicModeRuntime?.activeMusicMode || '').trim().toLowerCase(),
    phaseVariant: fullTexturePhaseVariant,
    sectionIntent: String(directorLanePlan?.__pressure?.sectionIntent || '').trim().toLowerCase(),
    sectionId: String(composerRuntime?.activeSectionId || '').trim().toLowerCase(),
    barIndex: currentBarIndex,
  });
  const level1CounterRhythmEpochLocked = fullTextureActive
    && level1SupportPolicy.counterRhythmFamilyScope === 'epoch_locked';
  const level1PreferredCounterRhythmFamily = String(level1SupportPolicy.preferredCounterRhythmFamily || '').trim().toLowerCase()
    || 'rhythm_lane';
  const level1SupportPatternBudget = String(level1SupportPolicy.supportPatternBudget || '').trim().toLowerCase();
  const level1PreferredSupportStepIndices = Array.isArray(level1SupportPolicy.preferredSupportStepIndices)
    ? level1SupportPolicy.preferredSupportStepIndices
        .map((value) => Math.trunc(Number(value) || -1))
        .filter((value) => value >= 0 && value < constants.weaponTuneSteps)
    : [];
  const level1SparkleDisabled = level1SupportPolicy.allowSparkle !== true;
  const coerceLevel1LaneId = (laneId) => (
    level1SparkleDisabled && String(laneId || '').trim().toLowerCase() === 'sparkle_lane'
      ? 'secondary_loop_lane'
      : laneId
  );
  const coerceLevel1LaneLayer = (layer) => (
    level1SparkleDisabled && String(layer || '').trim().toLowerCase() === 'sparkle'
      ? 'loops'
      : layer
  );
  const enforceLevel1NoSparkleOnGroup = (groupLike) => {
    const group = groupLike && typeof groupLike === 'object' ? groupLike : null;
    if (!group || !level1SparkleDisabled) return;
    if (String(group.musicLaneId || '').trim().toLowerCase() === 'sparkle_lane') {
      group.musicLaneId = 'secondary_loop_lane';
      group.musicLaneLayer = 'loops';
      if (String(group.actionType || '').trim().toLowerCase() === 'explosion') group.actionType = 'projectile';
    }
    if (String(group.musicLaneLayer || '').trim().toLowerCase() === 'sparkle') group.musicLaneLayer = 'loops';
    if (String(group.introSlotMusicLaneId || '').trim().toLowerCase() === 'sparkle_lane') {
      group.introSlotMusicLaneId = 'secondary_loop_lane';
      group.introSlotMusicLaneLayer = 'loops';
      if (String(group.introSlotActionType || '').trim().toLowerCase() === 'explosion') group.introSlotActionType = 'projectile';
    }
    if (String(group.introSlotMusicLaneLayer || '').trim().toLowerCase() === 'sparkle') group.introSlotMusicLaneLayer = 'loops';
    if (String(group.groupRhythmMusicLaneId || '').trim().toLowerCase() === 'sparkle_lane') {
      group.groupRhythmMusicLaneId = 'secondary_loop_lane';
      group.groupRhythmMusicLaneLayer = 'loops';
      if (String(group.groupRhythmActionType || '').trim().toLowerCase() === 'explosion') group.groupRhythmActionType = 'projectile';
    }
    if (String(group.groupRhythmMusicLaneLayer || '').trim().toLowerCase() === 'sparkle') group.groupRhythmMusicLaneLayer = 'loops';
  };
  const isLevel1ProtectedStructuralLane = (laneId) => (
    fullTextureActive
    && (
      String(laneId || '').trim().toLowerCase() === 'foundation_lane'
      || String(laneId || '').trim().toLowerCase() === 'secondary_loop_lane'
      || String(laneId || '').trim().toLowerCase() === 'primary_loop_lane'
    )
  );
  const resolveLevel1StableEnemyInstrumentId = (enemyLike, laneId, nextInstrumentId = '') => {
    const enemy = enemyLike && typeof enemyLike === 'object' ? enemyLike : null;
    if (!enemy || !isLevel1ProtectedStructuralLane(laneId)) return String(nextInstrumentId || '').trim();
    const lockedInstrumentId = String(enemy.__bsLevel1StableInstrumentId || '').trim();
    if (lockedInstrumentId) return lockedInstrumentId;
    const resolvedInstrumentId = String(
      nextInstrumentId
      || enemy.musicLaneInstrumentId
      || enemy.musicInstrumentId
      || enemy.instrumentId
      || ''
    ).trim();
    if (resolvedInstrumentId) enemy.__bsLevel1StableInstrumentId = resolvedInstrumentId;
    return resolvedInstrumentId;
  };
  const applyLevel1StableEnemyInstrument = (enemyLike, laneId, nextInstrumentId = '') => {
    const enemy = enemyLike && typeof enemyLike === 'object' ? enemyLike : null;
    if (!enemy || !isLevel1ProtectedStructuralLane(laneId)) return false;
    const stableInstrumentId = resolveLevel1StableEnemyInstrumentId(enemy, laneId, nextInstrumentId);
    if (!stableInstrumentId) return false;
    enemy.composerInstrument = stableInstrumentId;
    enemy.instrumentId = stableInstrumentId;
    enemy.musicInstrumentId = stableInstrumentId;
    enemy.musicLaneInstrumentId = stableInstrumentId;
    return true;
  };
  const resolveAccentSupportInstrumentId = (preferredInstrumentId = '', fallbackInstrumentId = '') => {
    const fallbackResolved = String(
      fallbackInstrumentId
      || helpers.resolveSwarmRoleInstrumentId?.(constants.accentRole || 'accent', helpers.resolveSwarmSoundInstrumentId?.('projectile') || 'tone')
      || helpers.resolveSwarmSoundInstrumentId?.('projectile')
      || 'tone'
    ).trim();
    const candidateIds = [
      preferredInstrumentId,
      helpers.getIdForDisplayName?.('Laser'),
      helpers.getIdForDisplayName?.('Retro Projectile Subtle'),
      helpers.getIdForDisplayName?.('Tone (Sine)'),
      helpers.getIdForDisplayName?.('Tone'),
      helpers.resolveSwarmRoleInstrumentId?.(constants.accentRole || 'accent', helpers.resolveSwarmSoundInstrumentId?.('projectile') || 'tone'),
      fallbackResolved,
    ];
    for (const candidate of candidateIds) {
      const sanitized = sanitizeEnemyMusicInstrumentId(
        candidate,
        fallbackResolved,
        { role: constants.accentRole || 'accent' }
      );
      if (!sanitized) continue;
      const inferredLane = String(inferInstrumentLaneFromCatalogId(sanitized, 'accent') || '').trim().toLowerCase();
      if (inferredLane === 'lead') continue;
      return sanitized;
    }
    return sanitizeEnemyMusicInstrumentId(fallbackResolved, fallbackResolved, { role: constants.accentRole || 'accent' });
  };
  const enforceAccentSupportInstrumentFamily = (groupLike = null) => {
    const group = groupLike && typeof groupLike === 'object' ? groupLike : null;
    if (!group) return;
    const laneId = String(group?.musicLaneId || '').trim().toLowerCase();
    const callResponseLane = String(group?.callResponseLane || '').trim().toLowerCase();
    const role = helpers.normalizeSwarmRole?.(group?.role || '', '') || String(group?.role || '').trim().toLowerCase();
    const accentSupportGroup = (
      role === (constants.accentRole || 'accent')
      || laneId === 'secondary_loop_lane'
      || laneId === 'answer_lane'
      || callResponseLane === 'response'
    );
    if (!accentSupportGroup) return;
    if (laneId === 'primary_loop_lane') return;
    const accentInstrumentId = resolveAccentSupportInstrumentId(
      String(group?.musicLaneInstrumentId || group?.instrumentId || group?.instrument || '').trim(),
      helpers.resolveSwarmSoundInstrumentId?.('projectile') || 'tone'
    );
    if (!accentInstrumentId) return;
    group.instrumentId = accentInstrumentId;
    group.instrument = accentInstrumentId;
    group.musicLaneInstrumentId = accentInstrumentId;
  };
  const resolveGroupMemberPlaybackInstrumentId = (groupLike = null, enemyLike = null, memberLaneId = '', fallbackInstrumentId = '') => {
    const group = groupLike && typeof groupLike === 'object' ? groupLike : null;
    const enemy = enemyLike && typeof enemyLike === 'object' ? enemyLike : null;
    const laneId = String(memberLaneId || group?.musicLaneId || enemy?.musicLaneId || '').trim().toLowerCase();
    const callResponseLane = String(group?.callResponseLane || enemy?.callResponseLane || '').trim().toLowerCase();
    const preferredInstrumentId = String(
      group?.musicLaneInstrumentId
      || group?.instrumentId
      || group?.instrument
      || fallbackInstrumentId
      || enemy?.musicLaneInstrumentId
      || enemy?.musicInstrumentId
      || enemy?.instrumentId
      || enemy?.composerInstrument
      || ''
    ).trim();
    const accentSupportLane = (
      laneId === 'secondary_loop_lane'
      || laneId === 'answer_lane'
      || callResponseLane === 'response'
      || (helpers.normalizeSwarmRole?.(group?.role || enemy?.composerRole || enemy?.musicalRole || '', '') || '') === (constants.accentRole || 'accent')
    );
    if (accentSupportLane && laneId !== 'primary_loop_lane') {
      return resolveAccentSupportInstrumentId(preferredInstrumentId, fallbackInstrumentId);
    }
    return preferredInstrumentId;
  };
  const getLevel1SecondaryLoopEpochContinuityId = () => (
    level1CounterRhythmEpochLocked
      ? `level1-secondary:${String(level1EpochId || 'default').trim().toLowerCase() || 'default'}`
      : ''
  );
  const enforceLevel1SecondaryLoopEpochIdentity = (groupLike = null) => {
    const group = groupLike && typeof groupLike === 'object' ? groupLike : null;
    if (!group) return;
    if (!fullTextureActive || !level1CounterRhythmEpochLocked) return;
    if (String(group?.callResponseLane || '').trim().toLowerCase() === 'response') return;
    if (String(group?.musicLaneId || '').trim().toLowerCase() !== 'secondary_loop_lane') return;
    const epochContinuityId = getLevel1SecondaryLoopEpochContinuityId();
    if (!epochContinuityId) return;
    group.musicProfileSourceType = level1CounterRhythmFamily || 'secondary_bridge_backbeat';
    group.continuityId = epochContinuityId;
    group.musicLaneContinuityId = epochContinuityId;
  };
  if (level1CounterRhythmEpochLocked) {
    if (String(composerRuntime.__bsLevel1CounterRhythmEpochId || '') !== level1EpochId) {
      composerRuntime.__bsLevel1CounterRhythmEpochId = level1EpochId;
      composerRuntime.__bsLevel1CounterRhythmFamily = level1PreferredCounterRhythmFamily;
    }
  } else {
    composerRuntime.__bsLevel1CounterRhythmEpochId = '';
    composerRuntime.__bsLevel1CounterRhythmFamily = '';
  }
  const level1CounterRhythmFamily = String(composerRuntime.__bsLevel1CounterRhythmFamily || '').trim().toLowerCase();
  const fullTextureAnswerOrnamentRecovering = degradedFullTextureNoOrnamentActive
    && composerEnemyGroups.some((group) => {
      if (!group || group.active !== true || group.retiring) return false;
      if (String(group?.callResponseLane || '').trim().toLowerCase() !== 'response') return false;
      if ((String(group?.musicProfileSourceType || '').trim().toLowerCase() || '') !== 'answer_ornament') return false;
      const persistUntilBar = Math.max(-1, Math.trunc(Number(group?.__bsFullTextureAnswerOrnamentPersistUntilBar) || -1));
      const seenBarIndex = Math.max(-1, Math.trunc(Number(group?.__bsAnswerOrnamentSeenBarIndex) || -1));
      return getAliveComposerEnemiesByIds(group?.memberIds).length > 0
        || persistUntilBar >= currentBarIndex
        || (seenBarIndex >= 0 && (currentBarIndex - seenBarIndex) <= 1);
    });
  const fullTextureAnswerOrnamentLockActive = fullTextureActive
    && (
      Math.max(0, Math.trunc(Number(levelPhaseRuntime?.timeInPhaseBars) || 0)) <= 4
      || fullTextureAnswerOrnamentRecovering
    );
  const spawnWantsSoloRhythm = spawnConfigLoaded && spawnChosenId === 'solo_rhythm_basic' && !introRhythmOnlyWindow;
  const stepAbs = Math.max(0, Math.trunc(currentBeatIndex));
  const legacyIntroHoldActive = !!helpers.shouldHoldIntroLayerExpansion?.(stepAbs);
  const introHoldActive = legacyIntroHoldActive;
  if (typeof helpers.noteIntroDebug === 'function' && currentBarIndex < 20) {
    helpers.noteIntroDebug('composer_maint_state', {
      introStage,
      currentBeatIndex: stepAbs,
      currentBarIndex,
      introComposerLockActive,
      introRhythmOnlyWindow,
      introSoftRampWindow,
      introHoldActive,
      legacyIntroHoldActive,
      responseMode: String(pacingCaps?.responseMode || '').trim().toLowerCase(),
      maxComposerGroups: Math.max(0, Math.trunc(Number(pacingCaps?.maxComposerGroups) || 0)),
      spawnChosenId,
    });
  }
  const effectivePacingCaps = introComposerLockActive
    ? {
      ...pacingCaps,
      responseMode: 'group',
      maxComposerGroups: 0,
      maxComposerGroupSize: 0,
      maxComposerPerformers: 0,
    }
    : (introRhythmOnlyWindow
    ? {
      ...pacingCaps,
      responseMode: 'group',
      maxComposerGroups: 1,
      maxComposerGroupSize: 1,
      maxComposerPerformers: 1,
    }
    : (introSoftRampWindow
    ? {
      ...pacingCaps,
      responseMode: 'group',
      maxComposerGroups: Math.min(Math.max(2, Math.trunc(Number(pacingCaps?.maxComposerGroups) || 0)), 2),
      maxComposerGroupSize: 1,
      maxComposerPerformers: 1,
    }
    : pacingCaps));
  if (
    !introComposerLockActive
    && !introHoldActive
    && String(effectivePacingCaps?.responseMode || '').trim().toLowerCase() === 'group'
  ) {
    effectivePacingCaps.maxComposerGroups = Math.max(2, Math.trunc(Number(effectivePacingCaps?.maxComposerGroups) || 0));
    const activeFoundationBufferGroups = composerEnemyGroups.filter((group) => (
      group
      && group.active
      && !group.retiring
      && String(group?.templateId || '').trim() === 'foundation-buffer'
    )).length;
    if (activeFoundationBufferGroups > 0) {
      effectivePacingCaps.maxComposerGroups += activeFoundationBufferGroups;
    }
  }
  const directorSupportGroups = (supportLanePlan?.active === true && String(supportLanePlan?.preferredCarrier || '').trim().toLowerCase() === 'group')
    ? Math.max(0, Math.trunc(Number(supportLanePlan?.targetCount) || 0))
    : 0;
  const directorAnswerGroups = (answerLanePlan?.active === true && String(answerLanePlan?.preferredCarrier || '').trim().toLowerCase() === 'group')
    ? Math.max(0, Math.trunc(Number(answerLanePlan?.targetCount) || 0))
    : 0;
  const activePrimaryLoopIntensity = Math.max(0, Number(primaryLoopLanePlan?.intensity) || 0);
  const strongLeadWindowActive = primaryLoopLanePlan?.active === true && activePrimaryLoopIntensity >= 0.66;
  const melodyPersistenceWindowActive = melodySoloWindowOpen;
  const melodyFallbackWindowOpen = melodySoloWindowOpen
    && (
      pacingState === 'peak'
      || pacingState === 'break'
      || currentBarIndex >= 12
    );
  const effectiveDirectorSupportGroups = strongLeadWindowActive && directorAnswerGroups > 0
    ? Math.min(Math.max(1, directorSupportGroups), 1)
    : directorSupportGroups;
  const effectiveDirectorAnswerGroups = directorAnswerGroups;
  const directorRequestedGroupCount = effectiveDirectorSupportGroups + effectiveDirectorAnswerGroups;
  const fallbackMelodyCoverageRequested = (melodyFallbackWindowOpen || melodyPersistenceWindowActive)
    && spawnChosenId !== 'snake_basic';
  const fallbackRhythmCoverageRequested = (supportLaneActive || answerLaneActive) && !spawnWantsSoloRhythm && spawnChosenId !== 'spawner_basic';
  const fallbackCoverageGroupCount = (fallbackMelodyCoverageRequested ? 1 : 0) + (fallbackRhythmCoverageRequested ? 1 : 0);
  if (
    noteMusicSystemEvent
    && currentBarIndex >= 8
    && currentBarIndex <= 40
    && Math.trunc(Number(composerRuntime.__lastTransitionSnapshotBar) || -1) !== currentBarIndex
  ) {
    composerRuntime.__lastTransitionSnapshotBar = currentBarIndex;
    const activeGroupsForSnapshot = composerEnemyGroups.filter((group) => group && group.active === true && !group.retiring);
    const laneCounts = Object.create(null);
    const profileCounts = Object.create(null);
    for (const group of activeGroupsForSnapshot) {
      const laneId = String(group?.musicLaneId || '').trim().toLowerCase() || 'unassigned';
      const profile = String(group?.musicProfileSourceType || '').trim().toLowerCase() || 'unknown';
      laneCounts[laneId] = Math.max(0, Math.trunc(Number(laneCounts[laneId]) || 0)) + 1;
      profileCounts[profile] = Math.max(0, Math.trunc(Number(profileCounts[profile]) || 0)) + 1;
    }
    noteMusicSystemEvent('music_transition_snapshot', {
      introStage,
      currentEnergyStateName,
      pacingState,
      supportLanePlan: supportLanePlan ? {
        active: supportLanePlan.active === true,
        targetCount: Math.max(0, Math.trunc(Number(supportLanePlan.targetCount) || 0)),
        preferredCarrier: String(supportLanePlan.preferredCarrier || '').trim().toLowerCase(),
        intensity: Math.max(0, Number(supportLanePlan.intensity) || 0),
      } : null,
      answerLanePlan: answerLanePlan ? {
        active: answerLanePlan.active === true,
        targetCount: Math.max(0, Math.trunc(Number(answerLanePlan.targetCount) || 0)),
        preferredCarrier: String(answerLanePlan.preferredCarrier || '').trim().toLowerCase(),
        preferredProfileSourceType: answerLanePreferredProfileSourceType,
        preferredLaneId: answerLanePreferredLaneId,
        responseFamily: answerLaneResponseFamily,
        intensity: Math.max(0, Number(answerLanePlan.intensity) || 0),
      } : null,
      primaryLoopLanePlan: primaryLoopLanePlan ? {
        active: primaryLoopLanePlan.active === true,
        targetCount: Math.max(0, Math.trunc(Number(primaryLoopLanePlan.targetCount) || 0)),
        preferredCarrier: String(primaryLoopLanePlan.preferredCarrier || '').trim().toLowerCase(),
        intensity: Math.max(0, Number(primaryLoopLanePlan.intensity) || 0),
      } : null,
      foundationLanePlan: foundationLanePlan ? {
        active: foundationLanePlan.active === true,
        targetCount: Math.max(0, Math.trunc(Number(foundationLanePlan.targetCount) || 0)),
        preferredCarrier: String(foundationLanePlan.preferredCarrier || '').trim().toLowerCase(),
        intensity: Math.max(0, Number(foundationLanePlan.intensity) || 0),
      } : null,
      effectiveDirectorSupportGroups,
      effectiveDirectorAnswerGroups,
      directorRequestedGroupCount,
      activeGroupCount: activeGroupsForSnapshot.length,
      laneCounts,
      profileCounts,
      groups: activeGroupsForSnapshot.slice(0, 16).map((group) => ({
        id: Math.trunc(Number(group?.id) || 0),
        laneId: String(group?.musicLaneId || '').trim().toLowerCase(),
        laneLayer: String(group?.musicLaneLayer || '').trim().toLowerCase(),
        profile: String(group?.musicProfileSourceType || '').trim().toLowerCase(),
        role: String(group?.role || '').trim().toLowerCase(),
        callResponseLane: String(group?.callResponseLane || '').trim().toLowerCase(),
        lifecycleState: String(group?.lifecycleState || '').trim(),
        introStageCarrier: group?.introStageCarrier === true,
        introSlotProfile: String(group?.introSlotProfileSourceType || '').trim().toLowerCase(),
        memberCount: group?.memberIds instanceof Set ? group.memberIds.size : (Array.isArray(group?.memberIds) ? group.memberIds.length : 0),
        aliveMemberCount: getAliveComposerEnemiesByIds(group?.memberIds).length,
        continuityId: String(group?.continuityId || '').trim(),
      })),
    }, {
      beatIndex: currentBeatIndex,
      stepIndex: stepAbs,
      barIndex: currentBarIndex,
    });
  }
  if (!introComposerLockActive && !introHoldActive) {
    effectivePacingCaps.maxComposerGroups = Math.max(
      0,
      Math.max(
        Math.trunc(Number(effectivePacingCaps?.maxComposerGroups) || 0),
        directorRequestedGroupCount,
        fallbackCoverageGroupCount
      )
    );
    if (!introWindowActive && !(effectiveDirectorSupportGroups > 0 || effectiveDirectorAnswerGroups > 0) && !spawnWantsComposer && fallbackCoverageGroupCount === 0) {
      effectivePacingCaps.maxComposerGroups = 0;
    }
    const minimumCoverageGroupCount = Math.max(1, fallbackCoverageGroupCount);
    if (spawnWantsComposer || fallbackCoverageGroupCount > 0) {
      effectivePacingCaps.responseMode = 'group';
      effectivePacingCaps.maxComposerGroups = Math.max(
        minimumCoverageGroupCount,
        Math.trunc(Number(effectivePacingCaps?.maxComposerGroups) || 0)
      );
      effectivePacingCaps.maxComposerGroupSize = Math.max(1, Math.trunc(Number(effectivePacingCaps?.maxComposerGroupSize) || 1));
      effectivePacingCaps.maxComposerPerformers = Math.max(1, Math.trunc(Number(effectivePacingCaps?.maxComposerPerformers) || 1));
    }
    if (strongLeadWindowActive && !spawnWantsComposer) {
      const layeredGroupFloor = (effectiveDirectorSupportGroups > 0 || effectiveDirectorAnswerGroups > 0)
        ? 4
        : 2;
      effectivePacingCaps.maxComposerGroups = Math.max(
        Math.max(minimumCoverageGroupCount, layeredGroupFloor),
        Math.min(Math.trunc(Number(effectivePacingCaps?.maxComposerGroups) || 0), layeredGroupFloor)
      );
      effectivePacingCaps.maxComposerGroupSize = Math.max(
        1,
        Math.min(Math.trunc(Number(effectivePacingCaps?.maxComposerGroupSize) || 1), 2)
      );
      effectivePacingCaps.maxComposerPerformers = Math.max(
        1,
        Math.min(Math.trunc(Number(effectivePacingCaps?.maxComposerPerformers) || 1), 2)
      );
      if (effectiveDirectorAnswerGroups > 0) {
        effectivePacingCaps.responseMode = 'group';
        // Keep the strong-lead restraint, but leave room for a live answer/ornament layer.
        effectivePacingCaps.maxComposerGroups = Math.max(4, Math.trunc(Number(effectivePacingCaps?.maxComposerGroups) || 0));
      }
    }
  }
  const templateLibrary = Array.isArray(constants.composerGroupTemplateLibrary) ? constants.composerGroupTemplateLibrary : [];
  const templateById = new Map();
  for (let i = 0; i < templateLibrary.length; i++) {
    const template = templateLibrary[i];
    const templateId = String(template?.id || '').trim();
    if (templateId) templateById.set(templateId, template);
  }
  const forcedIntroBassTemplate = templateLibrary.find(
    (t) => helpers.normalizeSwarmRole?.(t?.role || '', constants.leadRole) === constants.bassRole
  ) || null;
  const defaultResponseTemplate = templateLibrary.find((t) => String(t?.id || '').trim() === 'response_group')
    || templateLibrary.find((t) => {
      const lane = helpers.normalizeCallResponseLane?.(t?.callResponseLane || '', '') || String(t?.callResponseLane || '').trim().toLowerCase();
      const role = helpers.normalizeSwarmRole?.(t?.role || '', constants.leadRole) || '';
      return lane === 'response' && role !== constants.bassRole;
    })
    || null;
  const defaultCallTemplate = templateLibrary.find((t) => {
    const lane = helpers.normalizeCallResponseLane?.(t?.callResponseLane || '', 'call') || String(t?.callResponseLane || '').trim().toLowerCase() || 'call';
    const role = helpers.normalizeSwarmRole?.(t?.role || '', constants.leadRole) || '';
    const templateId = String(t?.id || '').trim();
    return lane !== 'response' && role !== constants.bassRole && templateId !== 'foundation-buffer';
  }) || null;
  const defaultLeadTemplate = templateLibrary.find((t) => {
    const templateId = String(t?.id || '').trim().toLowerCase();
    const role = helpers.normalizeSwarmRole?.(t?.role || '', constants.leadRole) || '';
    return templateId.includes('lead') && role !== constants.bassRole;
  }) || defaultCallTemplate || null;
  const forcedIntroRhythmTemplate = {
    id: 'intro_percussion_group',
    role: 'accent',
    callResponseLane: 'call',
    shape: 'square',
    color: '#9ad6ff',
    actionType: 'explosion',
  };
  const chooseStableVariant = (variants = [], salt = 0) => {
    const list = Array.isArray(variants) ? variants.filter((variant) => variant && typeof variant === 'object') : [];
    if (!list.length) return null;
    if (!(Math.trunc(Number(composerRuntime.__introArrangementSeed)) > 0)) {
      composerRuntime.__introArrangementSeed = Math.max(
        1,
        Math.trunc(
          (Math.random() * 0x7fffffff)
          + Math.max(0, Math.trunc(Number(sessionSeed) || 0))
          + Math.max(0, Math.trunc(Number(currentBeatIndex) || 0))
        )
      );
    }
    const baseSeed = Math.max(
      0,
      Math.trunc(Number(composerRuntime.__introArrangementSeed) || 0)
    );
    return list[Math.abs(baseSeed + Math.trunc(Number(salt) || 0)) % list.length] || list[0];
  };
  const melodyPhraseEpoch = Math.max(0, Math.trunc((Math.max(0, currentBarIndex - 12)) / 2));
  const normalizeComposerProfileSourceType = (value) => {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return '';
    return normalized;
  };
  const normalizeFoundationRegisterNote = (noteLike = '', fallback = 'C3') => {
    const normalized = helpers.normalizeSwarmNoteName?.(noteLike) || '';
    const match = normalized.match(/^([A-G](?:#|b)?)(-?\d+)$/i);
    if (!match) return fallback;
    const pitchClass = String(match[1] || '').toUpperCase();
    return `${pitchClass}3`;
  };
  const isComposerMelodyProfile = (value) => normalizeComposerProfileSourceType(value) === 'lead_melody';
  const isGenericComposerRhythmProfile = (value) => {
    const normalized = normalizeComposerProfileSourceType(value);
    return normalized === 'rhythm_lane' || normalized === 'rhythm_lane_backbeat' || normalized === 'secondary_bridge_backbeat';
  };
  const isIntroSlotRhythmProfile = (value) => {
    const normalized = normalizeComposerProfileSourceType(value);
    return normalized === 'spawner_rhythm_pulse'
      || normalized === 'spawner_rhythm_backbeat'
      || normalized === 'spawner_rhythm_motion';
  };
  const normalizeArrangementSectionId = (value) => {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return 'default';
    if (normalized.includes('counterpoint')) return 'counterpoint';
    if (normalized.includes('break')) return 'breakdown';
    if (normalized.includes('build')) return 'build';
    if (normalized.includes('release')) return 'release';
    if (normalized.includes('engaged')) return 'engaged';
    return normalized;
  };
  const chooseRhythmFamily = (profileSourceType, options = null) => {
    const normalized = normalizeComposerProfileSourceType(profileSourceType);
    const sectionId = normalizeArrangementSectionId(options?.sectionId || '');
    const energyId = String(options?.energyState || currentEnergyStateName || '').trim().toLowerCase();
    const epoch = Math.max(0, Math.trunc(Number(options?.epoch) || 0));
    if (
      sustainedFullTextureNoShowcase
      && level1CounterRhythmEpochLocked
      && (
        normalized === 'secondary_bridge_backbeat'
        || normalized === 'rhythm_lane'
        || normalized === 'rhythm_lane_backbeat'
      )
    ) {
      return level1CounterRhythmFamily === 'secondary_bridge_backbeat' ? 'backbeat' : 'pulse';
    }
    if (normalized === 'spawner_rhythm_motion') return 'motion';
    if (normalized === 'spawner_rhythm_backbeat' || normalized === 'rhythm_lane_backbeat' || normalized === 'secondary_bridge_backbeat') {
      const families = (sectionId === 'counterpoint' || sectionId === 'engaged')
        ? ['offbeat', 'backbeat', 'offbeat']
        : ((sectionId === 'build' || energyId === 'build')
          ? ['driving', 'backbeat', 'offbeat']
          : ['backbeat', 'offbeat', 'backbeat']);
      return families[epoch % families.length];
    }
    if (normalized === 'spawner_rhythm_pulse') return 'pulse';
    const families = sectionId === 'counterpoint'
      ? ['syncopated', 'rolling', 'driving']
      : ((sectionId === 'build' || energyId === 'peak')
        ? ['driving', 'syncopated', 'pulse']
        : (sectionId === 'release'
          ? ['rolling', 'pulse', 'syncopated']
          : ['pulse', 'rolling', 'syncopated']));
    return families[epoch % families.length];
  };
  const chooseLeadFamily = (options = null) => {
    const sectionId = normalizeArrangementSectionId(options?.sectionId || '');
    const energyId = String(options?.energyState || currentEnergyStateName || '').trim().toLowerCase();
    const epoch = Math.max(0, Math.trunc(Number(options?.epoch) || 0));
    const earlyMelodyWindow = currentBarIndex < 48;
    const families = earlyMelodyWindow
      ? (sectionId === 'build' || energyId === 'peak'
        ? ['hook', 'arc', 'glide']
        : ['hook', 'glide', 'hook'])
      : (sectionId === 'counterpoint'
        ? ['glide', 'hook', 'arc']
        : ((sectionId === 'build' || energyId === 'peak')
          ? ['arc', 'hook', 'glide']
          : (sectionId === 'release'
            ? ['glide', 'hook', 'arc']
            : ['hook', 'glide', 'arc'])));
    return families[epoch % families.length];
  };
  const chooseAnswerFamily = (options = null) => {
    const sectionId = normalizeArrangementSectionId(options?.sectionId || '');
    const energyId = String(options?.energyState || currentEnergyStateName || '').trim().toLowerCase();
    const epoch = Math.max(0, Math.trunc(Number(options?.epoch) || 0));
    const families = sectionId === 'counterpoint'
      ? ['echo', 'ornament', 'reply']
      : ((sectionId === 'build' || energyId === 'peak')
        ? ['ornament', 'reply', 'echo']
        : (sectionId === 'release'
          ? ['echo', 'reply', 'ornament']
          : ['reply', 'echo', 'ornament']));
    return families[epoch % families.length];
  };
  const sparsifyStepPattern = (stepsLike, preferredIndices = [], maxActiveCount = 2) => {
    const steps = Array.isArray(stepsLike)
      ? stepsLike.slice(0, constants.weaponTuneSteps).map((step) => !!step)
      : [];
    const maxCount = Math.max(0, Math.trunc(Number(maxActiveCount) || 0));
    if (!steps.length || maxCount <= 0) return steps;
    const activeIndices = [];
    for (let i = 0; i < steps.length; i += 1) {
      if (steps[i]) activeIndices.push(i);
    }
    if (activeIndices.length <= maxCount) return steps;
    const keep = new Set();
    const preferred = Array.isArray(preferredIndices) ? preferredIndices : [];
    for (let i = 0; i < preferred.length; i += 1) {
      const preferredIndex = Math.trunc(Number(preferred[i]) || -1);
      if (preferredIndex < 0 || preferredIndex >= steps.length || !steps[preferredIndex]) continue;
      keep.add(preferredIndex);
      if (keep.size >= maxCount) break;
    }
    if (keep.size < maxCount && activeIndices.length) keep.add(activeIndices[0]);
    if (keep.size < maxCount && activeIndices.length) keep.add(activeIndices[activeIndices.length - 1]);
    for (let i = 0; i < activeIndices.length && keep.size < maxCount; i += 1) {
      keep.add(activeIndices[i]);
    }
    return steps.map((step, index) => step && keep.has(index));
  };
  const maskPatternValuesBySteps = (valuesLike, stepsLike, offValue = 0) => {
    if (!Array.isArray(valuesLike)) return valuesLike;
    const steps = Array.isArray(stepsLike) ? stepsLike : [];
    return valuesLike.slice(0, constants.weaponTuneSteps).map((value, index) => (
      steps[index] ? value : offValue
    ));
  };
  const getSharedCarrierMusicProfile = (profileSourceType, options = null) => {
    const normalizedProfileSourceType = normalizeComposerProfileSourceType(profileSourceType);
    if (
      normalizedProfileSourceType === 'rhythm_lane'
      || normalizedProfileSourceType === 'rhythm_lane_backbeat'
      || normalizedProfileSourceType === 'spawner_rhythm_pulse'
      || normalizedProfileSourceType === 'spawner_rhythm_backbeat'
      || normalizedProfileSourceType === 'spawner_rhythm_motion'
      || normalizedProfileSourceType === 'secondary_bridge_backbeat'
    ) {
      const explicitLayerKey = normalizedProfileSourceType === 'spawner_rhythm_pulse'
        ? 'pulse'
        : (normalizedProfileSourceType === 'spawner_rhythm_backbeat'
          ? 'backbeat'
          : (normalizedProfileSourceType === 'spawner_rhythm_motion' ? 'motion' : ''));
      const secondarySpawnerRhythmProfile = normalizedProfileSourceType === 'rhythm_lane_backbeat'
        || normalizedProfileSourceType === 'secondary_bridge_backbeat'
        || explicitLayerKey === 'backbeat';
      const dedicatedSecondaryBridgeProfile = normalizedProfileSourceType === 'secondary_bridge_backbeat';
      const resolvedLayerKey = explicitLayerKey || (secondarySpawnerRhythmProfile ? 'backbeat' : 'pulse');
      const spawnerProfile = helpers.buildSpawnerPercussionLayerProfile?.(resolvedLayerKey, {
        barIndex: currentBarIndex,
      }) || helpers.createSpawnerEnemyRhythmProfile?.({
        role: 'drum',
        barIndex: currentBarIndex,
        instrumentInfluence: secondarySpawnerRhythmProfile
          ? `${String(options?.instrumentInfluence || 'intro')}-secondary`
          : options?.instrumentInfluence,
      }) || null;
      const introBuildRhythmActive = introRhythmOnlyWindow || introSoftRampWindow;
      const rhythmEpoch = Math.max(0, Math.trunc((Math.max(0, currentBarIndex - 4)) / 4));
      const rhythmFamily = chooseRhythmFamily(normalizedProfileSourceType, { ...options, epoch: rhythmEpoch });
      const fallbackBaseNoteName = resolvedLayerKey === 'motion'
        ? 'C4'
        : (resolvedLayerKey === 'backbeat'
          ? (dedicatedSecondaryBridgeProfile ? 'D4' : 'G3')
          : 'C3');
      const fallbackInstrumentId = sanitizeEnemyMusicInstrumentId(
        dedicatedSecondaryBridgeProfile
          ? (
            helpers.getIdForDisplayName?.('DRUM SNARE 2')
            || helpers.getIdForDisplayName?.('HAND CLAP (ELECTRO)')
            || helpers.resolveSpawnerPercussionSlotInstrument?.(`percussion_${resolvedLayerKey}`)
            || helpers.resolveSwarmSoundInstrumentId?.('projectile')
            || 'tone'
          )
          : (
            helpers.resolveSpawnerPercussionSlotInstrument?.(`percussion_${resolvedLayerKey}`)
            || helpers.resolveSwarmSoundInstrumentId?.('projectile')
            || 'tone'
          ),
        helpers.resolveSwarmSoundInstrumentId?.('projectile') || 'tone',
        { role: helpers.resolveSpawnerPercussionSlotRole?.(`percussion_${resolvedLayerKey}`) || constants.leadRole, toyKey: 'loopgrid-drum' }
      );
      const effectiveSpawnerProfile = spawnerProfile || {
        steps: [],
        noteIndices: [],
        notePalette: [],
        instrument: fallbackInstrumentId,
        baseNoteName: fallbackBaseNoteName,
      };
      const baseSteps = Array.isArray(effectiveSpawnerProfile?.steps) ? effectiveSpawnerProfile.steps.slice(0, constants.weaponTuneSteps) : [];
      const baseNoteIndices = Array.isArray(effectiveSpawnerProfile?.noteIndices) ? effectiveSpawnerProfile.noteIndices.slice(0, constants.weaponTuneSteps) : [];
      const introArrangementVariants = [
        {
          pulse: { steps: [true, false, false, false, true, false, false, false], noteIndices: [1, 0, 0, 0, 4, 0, 0, 0], baseNoteName: 'C3' },
          backbeat: { steps: [false, false, true, false, false, false, true, false], noteIndices: [0, 0, 5, 0, 0, 0, 4, 0], baseNoteName: 'G3' },
          motion: { steps: [false, true, false, true, false, true, false, true], noteIndices: [0, 6, 0, 6, 0, 6, 0, 6], baseNoteName: 'C4' },
        },
        {
          pulse: { steps: [true, false, true, false, true, false, false, true], noteIndices: [1, 0, 3, 0, 4, 0, 0, 2], baseNoteName: 'C3' },
          backbeat: { steps: [false, false, false, true, false, true, false, false], noteIndices: [0, 0, 0, 5, 0, 4, 0, 0], baseNoteName: 'G3' },
          motion: { steps: [false, true, true, false, false, true, false, true], noteIndices: [0, 6, 5, 0, 0, 6, 0, 5], baseNoteName: 'C4' },
        },
        {
          pulse: { steps: [true, false, false, true, true, false, true, false], noteIndices: [1, 0, 0, 2, 4, 0, 3, 0], baseNoteName: 'C3' },
          backbeat: { steps: [false, true, false, false, false, false, true, true], noteIndices: [0, 4, 0, 0, 0, 0, 5, 4], baseNoteName: 'G3' },
          motion: { steps: [false, false, true, true, false, true, true, false], noteIndices: [0, 0, 6, 5, 0, 6, 5, 0], baseNoteName: 'C4' },
        },
        {
          pulse: { steps: [true, true, false, false, true, false, false, true], noteIndices: [1, 2, 0, 0, 4, 0, 0, 3], baseNoteName: 'C3' },
          backbeat: { steps: [false, false, true, false, true, false, false, false], noteIndices: [0, 0, 5, 0, 4, 0, 0, 0], baseNoteName: 'G3' },
          motion: { steps: [false, true, false, false, true, false, true, false], noteIndices: [0, 6, 0, 0, 5, 0, 6, 0], baseNoteName: 'C4' },
        },
      ];
      const introArrangementVariant = chooseStableVariant(introArrangementVariants, 7) || null;
      const introPatternVariant = !introBuildRhythmActive
        ? null
        : (
          resolvedLayerKey === 'motion'
            ? introArrangementVariant?.motion || null
            : (
              secondarySpawnerRhythmProfile
                ? introArrangementVariant?.backbeat || null
                : introArrangementVariant?.pulse || null
            )
        );
      const introPatternSteps = !introBuildRhythmActive
        ? null
        : (Array.isArray(introPatternVariant?.steps) ? introPatternVariant.steps.slice(0, constants.weaponTuneSteps) : null);
      const introStrengthenedSteps = Array.isArray(introPatternSteps) && introPatternSteps.length
        ? introPatternSteps.slice(0, constants.weaponTuneSteps)
        : (introBuildRhythmActive && baseSteps.filter(Boolean).length < 3
          ? [true, false, true, false, true, false, true, false].slice(0, constants.weaponTuneSteps)
          : baseSteps);
      const introStrengthenedNoteIndices = Array.isArray(introPatternSteps) && introPatternSteps.length
        ? (
          Array.isArray(introPatternVariant?.noteIndices) && introPatternVariant.noteIndices.length
            ? introPatternVariant.noteIndices.slice(0, constants.weaponTuneSteps)
            : introStrengthenedSteps.map((isOn, idx) => {
              if (!isOn) return 0;
              if (resolvedLayerKey === 'motion') return 6;
              if (secondarySpawnerRhythmProfile) return ((idx % 4) === 2) ? 5 : 4;
              return ((idx % 4) === 0) ? 1 : (3 + ((sessionSeed + idx) % 3));
            })
        )
        : (introBuildRhythmActive && introStrengthenedSteps.length
          ? introStrengthenedSteps.map((isOn, idx) => (isOn ? (((idx % 4) === 0) ? 1 : 4) : 0))
          : baseNoteIndices);
      const genericRhythmVariants = {
        pulse: {
          steps: [true, false, false, true, true, false, false, true],
          noteIndices: [1, 0, 0, 3, 4, 0, 0, 2],
          notes: ['C3', 'G3', 'D#3'],
        },
        syncopated: {
          steps: [true, false, true, false, false, true, true, false],
          noteIndices: [1, 0, 4, 0, 0, 5, 3, 0],
          notes: ['C3', 'D#3', 'G3', 'A#3'],
        },
        driving: {
          steps: [true, true, false, true, true, false, true, false],
          noteIndices: [1, 3, 0, 4, 5, 0, 3, 0],
          notes: ['C3', 'G3', 'A#3'],
        },
        rolling: {
          steps: [true, false, true, true, false, true, false, true],
          noteIndices: [1, 0, 3, 4, 0, 5, 0, 2],
          notes: ['C3', 'D#3', 'G3'],
        },
        backbeat: {
          steps: [false, false, true, false, false, false, true, false],
          noteIndices: [0, 0, 5, 0, 0, 0, 4, 0],
          notes: ['G3', 'A#3'],
        },
        offbeat: {
          steps: [false, true, false, true, false, false, true, false],
          noteIndices: [0, 4, 0, 5, 0, 0, 3, 0],
          notes: ['G3', 'A#3', 'D#4'],
        },
        motion: {
          steps: [false, true, false, true, false, true, false, true],
          noteIndices: [0, 6, 0, 5, 0, 6, 0, 4],
          notes: ['C4', 'D#4', 'G4'],
        },
      };
      const genericRhythmProfile = dedicatedSecondaryBridgeProfile
        ? {
            steps: [false, true, false, true, false, false, true, false],
            noteIndices: [0, 4, 0, 5, 0, 0, 4, 0],
            notes: ['D4', 'G4', 'A#4'],
          }
        : (genericRhythmVariants[rhythmFamily] || genericRhythmVariants.pulse);
      const resolvedSteps = introBuildRhythmActive ? introStrengthenedSteps : genericRhythmProfile.steps.slice(0, constants.weaponTuneSteps);
      const resolvedNoteIndices = introBuildRhythmActive ? introStrengthenedNoteIndices : genericRhythmProfile.noteIndices.slice(0, constants.weaponTuneSteps);
      const shapedRhythmSteps = sustainedFullTextureNoShowcase
        ? (
          level1SupportPatternBudget === 'single_offbeat_punctuation'
          || level1SupportPatternBudget === 'two_hit_backbeat_punctuation'
            ? (
              resolvedLayerKey === 'motion'
                ? new Array(constants.weaponTuneSteps).fill(false)
                : sparsifyStepPattern(
                    resolvedSteps,
                    level1PreferredSupportStepIndices.length ? level1PreferredSupportStepIndices : [6],
                    level1SupportPatternBudget === 'two_hit_backbeat_punctuation' ? 2 : 1
                  )
            )
            : (
              resolvedLayerKey === 'pulse'
                ? (
                  normalizedProfileSourceType === 'rhythm_lane'
                    ? sparsifyStepPattern(resolvedSteps, [2], 1)
                    : sparsifyStepPattern(resolvedSteps, [0], 1)
                )
                : (
                  resolvedLayerKey === 'motion'
                    ? new Array(constants.weaponTuneSteps).fill(false)
                    : resolvedSteps.slice(0, constants.weaponTuneSteps).map((step) => !!step)
                )
            )
        )
        : resolvedSteps.slice(0, constants.weaponTuneSteps).map((step) => !!step);
      const shapedRhythmNoteIndices = maskPatternValuesBySteps(resolvedNoteIndices, shapedRhythmSteps, 0);
      const baseNoteName = helpers.normalizeSwarmNoteName?.(
        introPatternVariant?.baseNoteName || effectiveSpawnerProfile?.baseNoteName
      ) || 'C3';
      const level1RhythmLaneSupportProfile = sustainedFullTextureNoShowcase
        && level1CounterRhythmEpochLocked
        && normalizedProfileSourceType === 'rhythm_lane';
      return {
        role: level1RhythmLaneSupportProfile
          ? 'accent'
          : (dedicatedSecondaryBridgeProfile
          ? 'accent'
          : (helpers.resolveSpawnerPercussionSlotRole?.(`percussion_${resolvedLayerKey}`) || constants.leadRole)),
        actionType: (dedicatedSecondaryBridgeProfile || level1RhythmLaneSupportProfile) ? 'projectile' : 'explosion',
        musicLaneId: coerceLevel1LaneId(level1RhythmLaneSupportProfile
          ? 'secondary_loop_lane'
          : (resolvedLayerKey === 'pulse'
          ? 'foundation_lane'
          : (resolvedLayerKey === 'motion' ? 'sparkle_lane' : 'secondary_loop_lane'))),
        musicLaneLayer: coerceLevel1LaneLayer(level1RhythmLaneSupportProfile
          ? 'loops'
          : (resolvedLayerKey === 'pulse'
          ? 'foundation'
          : (resolvedLayerKey === 'motion' ? 'sparkle' : 'loops'))),
        callResponseLane: (dedicatedSecondaryBridgeProfile || level1RhythmLaneSupportProfile) ? 'call' : 'solo',
        steps: shapedRhythmSteps,
        noteIndices: shapedRhythmNoteIndices,
        notePalette: Array.isArray(effectiveSpawnerProfile?.notePalette) ? effectiveSpawnerProfile.notePalette.slice() : [],
        notes: introBuildRhythmActive ? [baseNoteName] : genericRhythmProfile.notes.slice(),
        phraseRoot: baseNoteName,
        phraseFifth: introBuildRhythmActive ? baseNoteName : (genericRhythmProfile.notes[1] || baseNoteName),
        resolutionTargets: introBuildRhythmActive ? [baseNoteName] : genericRhythmProfile.notes.slice(0, 3),
        instrumentId: sanitizeEnemyMusicInstrumentId(
          effectiveSpawnerProfile?.instrument,
          helpers.resolveSwarmSoundInstrumentId?.('projectile') || 'tone',
          { role: helpers.resolveSpawnerPercussionSlotRole?.(`percussion_${resolvedLayerKey}`) || constants.leadRole, toyKey: 'loopgrid-drum' }
        ),
      };
    }
    if (normalizedProfileSourceType === 'lead_melody') {
      const leadFamily = chooseLeadFamily({ ...options, epoch: melodyPhraseEpoch });
      const leadPhraseVariantEpoch = (melodyPhraseEpoch * 2) + motifLockIndex;
      const leadArcPhase = Math.max(0, Math.trunc((Math.max(0, currentBarIndex - 12)) / 2)) % 4;
      const leadPhraseBarPhase = Math.max(0, Math.trunc(Math.max(0, currentBarIndex - 12))) % 4;
      const leadCadenceVariant = leadPhraseVariantEpoch % 3;
      const leadArcLift = leadArcPhase === 1
        ? 1
        : (leadArcPhase === 2 ? 2 : (leadArcPhase === 3 ? -1 : 0));
      const leadInstrumentVariants = (
        currentBarIndex < 48
          ? [
            helpers.getIdForDisplayName?.('Retro Square'),
            helpers.getIdForDisplayName?.('Retro Lead'),
          ]
          : [
            helpers.getIdForDisplayName?.('Retro Square'),
            helpers.getIdForDisplayName?.('Retro Lead'),
            helpers.getIdForDisplayName?.('Pulse Lead'),
            helpers.resolveSwarmRoleInstrumentId?.(constants.leadRole, helpers.resolveSwarmSoundInstrumentId?.('projectile') || 'tone'),
          ]
      ).filter((id) => String(id || '').trim());
      const selectedLeadInstrumentId = String(
        chooseStableVariant(
          leadInstrumentVariants.map((instrumentId) => ({ instrumentId })),
          53 + leadPhraseVariantEpoch
        )?.instrumentId
          || leadInstrumentVariants[0]
          || helpers.resolveSwarmSoundInstrumentId?.('projectile')
          || 'tone'
      ).trim();
      const leadFamilyRows = {
        hook: [
          { rows: [1, 1, 2, 3, 2, 4, 3, 2] },
          { rows: [2, 3, 1, 4, 2, 5, 3, 1] },
          { rows: [1, 4, 2, 5, 3, 6, 4, 2] },
        ],
        glide: [
          { rows: [1, 2, 3, 4, 3, 2, 4, 5] },
          { rows: [2, 3, 4, 5, 4, 3, 2, 1] },
          { rows: [0, 2, 4, 5, 6, 4, 2, 3] },
        ],
        answer: [
          { rows: [4, 2, 3, 1, 4, 2, 5, 3] },
          { rows: [3, 1, 4, 2, 5, 3, 4, 2] },
          { rows: [5, 3, 1, 4, 2, 6, 3, 5] },
        ],
        arc: [
          { rows: [1, 3, 4, 5, 4, 3, 2, 4] },
          { rows: [2, 4, 5, 6, 5, 3, 4, 2] },
          { rows: [0, 2, 5, 6, 4, 3, 5, 2] },
        ],
      };
      const baseRows = chooseStableVariant(
        leadFamilyRows[leadFamily] || leadFamilyRows.hook,
        17 + leadPhraseVariantEpoch
      )?.rows?.slice(0, constants.weaponTuneSteps) || [];
      const melodicRowVariants = [
        baseRows,
        baseRows.length ? baseRows.map((row, idx) => Math.max(0, Math.trunc(Number(row) || 0) + ((idx % 3) === 1 ? 1 : 0))) : baseRows,
        baseRows.length ? baseRows.slice().reverse() : baseRows,
        baseRows.length ? baseRows.map((row, idx) => Math.max(0, Math.trunc(Number(row) || 0) + ((idx % 2) === 0 ? 2 : -1))) : baseRows,
        baseRows.length ? baseRows.map((row, idx) => Math.max(0, Math.trunc(Number(row) || 0) + ((idx >= 4) ? 1 : 0))) : baseRows,
      ].filter((rows) => Array.isArray(rows) && rows.length);
      const rows = (chooseStableVariant(
        melodicRowVariants.map((variantRows) => ({ rows: variantRows })),
        29 + leadPhraseVariantEpoch
      )?.rows || baseRows).slice();
      const leadFamilySteps = {
        hook: [
          { steps: [false, true, true, false, true, false, true, false] },
          { steps: [true, false, true, false, false, true, true, false] },
        ],
        glide: [
          { steps: [true, false, false, true, false, true, false, true] },
          { steps: [false, true, false, true, true, false, false, true] },
        ],
        answer: [
          { steps: [false, true, false, true, false, false, true, true] },
          { steps: [true, false, false, true, true, false, true, false] },
        ],
        arc: [
          { steps: [true, false, true, true, false, true, false, true] },
          { steps: [true, true, false, true, false, true, true, false] },
        ],
      };
      const baseSteps = chooseStableVariant(
        leadFamilySteps[leadFamily] || leadFamilySteps.hook,
        19 + leadPhraseVariantEpoch
      )?.steps?.slice(0, constants.weaponTuneSteps) || [];
      const melodicStepVariants = [
        baseSteps,
        [false, true, true, false, true, false, true, false],
        [true, false, true, false, false, true, true, false],
        [true, false, false, true, true, false, true, false],
        [false, true, false, true, false, true, true, false],
        [true, true, false, true, false, true, false, true],
        [false, true, false, true, true, false, true, true],
      ].filter((steps) => Array.isArray(steps) && steps.length);
      const steps = chooseStableVariant(
        melodicStepVariants.map((variantSteps) => ({ steps: variantSteps })),
        31 + leadPhraseVariantEpoch
      )?.steps || baseSteps;
      const lateRunLeadDensityFloor = currentBarIndex >= 24 ? 5 : 4;
      const activeStepCount = steps.reduce((count, isOn) => count + (isOn ? 1 : 0), 0);
      if (activeStepCount < lateRunLeadDensityFloor) {
        const priorityFillOrder = [0, 4, 2, 6, 1, 5, 3, 7];
        for (const idx of priorityFillOrder) {
          if (!Number.isInteger(idx) || idx < 0 || idx >= steps.length) continue;
          if (steps[idx]) continue;
          steps[idx] = true;
          const nextCount = steps.reduce((count, isOn) => count + (isOn ? 1 : 0), 0);
          if (nextCount >= lateRunLeadDensityFloor) break;
        }
      }
      let consecutiveSilentSteps = 0;
      for (let i = 0; i < steps.length; i += 1) {
        if (steps[i]) {
          consecutiveSilentSteps = 0;
          continue;
        }
        consecutiveSilentSteps += 1;
        if (consecutiveSilentSteps >= 3) {
          steps[i] = true;
          consecutiveSilentSteps = 0;
        }
      }
      const activeStepIndices = steps
        .map((isOn, idx) => (isOn ? idx : -1))
        .filter((idx) => idx >= 0);
      if (activeStepIndices.length >= 3) {
        const activeUniqueRows = new Set(activeStepIndices.map((idx) => Math.max(0, Math.trunc(Number(rows[idx]) || 0))));
        if (activeUniqueRows.size <= 1) {
          const melodicContourVariants = [
            [0, 2, 1, 3, 2, 4, 1, 0],
            [0, 1, 3, 2, 4, 2, 1, 3],
            [0, 3, 1, 4, 2, 3, 1, 0],
            [0, 2, 4, 1, 3, 5, 2, 0],
          ];
          const contour = chooseStableVariant(
            melodicContourVariants.map((variant) => ({ contour: variant })),
            37 + leadPhraseVariantEpoch
          )?.contour
            || melodicContourVariants[0];
          const baseRow = Math.max(0, Math.trunc(Number(rows[activeStepIndices[0]]) || 2));
          const rowCeiling = Math.max(4, Math.min(6, (Array.isArray(constants?.swarmPentatonicNotesOneOctave)
            ? constants.swarmPentatonicNotesOneOctave.length - 1
            : 6)));
          for (let i = 0; i < activeStepIndices.length; i += 1) {
            const idx = activeStepIndices[i];
            rows[idx] = Math.max(0, Math.min(rowCeiling, baseRow + Math.trunc(Number(contour[i % contour.length]) || 0)));
          }
          for (let i = 1; i < rows.length; i += 1) {
            if (activeStepIndices.includes(i)) continue;
            rows[i] = Math.max(0, Math.min(rowCeiling, Math.trunc(Number(rows[i - 1]) || baseRow)));
          }
        }
      }
      let notes = rows.length
        ? rows.map((row, idx) => helpers.getSwarmPentatonicNoteByIndex?.(Math.max(0, Math.trunc(Number(row) || 0)))
          || helpers.getRandomSwarmPentatonicNote?.()
          || 'C4')
        : [helpers.getRandomSwarmPentatonicNote?.() || 'C4'];
      if (activeStepIndices.length >= 3) {
        const activeNotes = activeStepIndices.map((idx) => String(notes[idx] || '').trim()).filter(Boolean);
        const uniqueActiveNotes = new Set(activeNotes);
        if (uniqueActiveNotes.size < Math.min(3, activeStepIndices.length)) {
          const noteContourVariants = [
            [0, 2, 4, 2, 1, 3, 5, 2],
            [0, 3, 1, 4, 2, 5, 3, 1],
            [0, 1, 4, 2, 5, 3, 2, 4],
            [0, 2, 5, 3, 1, 4, 2, 6],
          ];
          const contour = chooseStableVariant(
            noteContourVariants.map((variant) => ({ contour: variant })),
            41 + leadPhraseVariantEpoch
          )?.contour
            || noteContourVariants[0];
          const baseRow = Math.max(0, Math.trunc(Number(rows[activeStepIndices[0]]) || 1));
          for (let i = 0; i < activeStepIndices.length; i += 1) {
            const idx = activeStepIndices[i];
            const noteIndex = Math.max(0, Math.min(6, baseRow + Math.trunc(Number(contour[i % contour.length]) || 0)));
            notes[idx] = helpers.getSwarmPentatonicNoteByIndex?.(noteIndex)
              || notes[idx]
              || 'C4';
          }
          for (let i = 1; i < notes.length; i += 1) {
            if (String(notes[i] || '').trim()) continue;
            notes[i] = notes[i - 1] || notes[0] || 'C4';
          }
        }
      }
      if (activeStepIndices.length >= 3) {
        const usedNoteNames = new Set();
        const pitchCycle = [0, 2, 4, 1, 3, 5, 2, 6];
        const baseRow = Math.max(0, Math.trunc(Number(rows[activeStepIndices[0]]) || 1));
        for (let i = 0; i < activeStepIndices.length; i += 1) {
          const idx = activeStepIndices[i];
          const normalizedExisting = helpers.normalizeSwarmNoteName?.(notes[idx]) || '';
          if (normalizedExisting && !usedNoteNames.has(normalizedExisting)) {
            usedNoteNames.add(normalizedExisting);
            continue;
          }
          const noteIndex = Math.max(0, Math.min(6, baseRow + pitchCycle[(i + leadPhraseVariantEpoch) % pitchCycle.length]));
          const replacementNote = helpers.getSwarmPentatonicNoteByIndex?.(noteIndex)
            || normalizedExisting
            || 'C4';
          notes[idx] = replacementNote;
          usedNoteNames.add(String(replacementNote || '').trim());
        }
      }
      if (activeStepIndices.length >= 3) {
        const phraseShift = leadPhraseVariantEpoch % Math.max(1, activeStepIndices.length);
        if (phraseShift > 0) {
          const rotatedSteps = steps.slice();
          const rotatedActive = activeStepIndices.slice(phraseShift).concat(activeStepIndices.slice(0, phraseShift));
          for (let i = 0; i < activeStepIndices.length; i += 1) {
            rotatedSteps[activeStepIndices[i]] = !!steps[rotatedActive[i]];
          }
          for (let i = 0; i < steps.length; i += 1) steps[i] = !!rotatedSteps[i];
        }
      }
      if (activeStepIndices.length >= 3) {
        const rowCeiling = Math.max(4, Math.min(6, (Array.isArray(constants?.swarmPentatonicNotesOneOctave)
          ? constants.swarmPentatonicNotesOneOctave.length - 1
          : 6)));
        const phraseLift = ((leadPhraseVariantEpoch % 4) === 2 || (leadPhraseVariantEpoch % 4) === 3) ? 1 : 0;
        const phraseDip = (leadPhraseVariantEpoch % 5) === 4 ? -1 : 0;
        const contourBias = phraseLift + phraseDip + leadArcLift;
        if (contourBias !== 0) {
          for (let i = 0; i < activeStepIndices.length; i += 1) {
            const idx = activeStepIndices[i];
            const offset = (i >= Math.ceil(activeStepIndices.length / 2))
              ? contourBias
              : (leadArcLift > 0 && i === 0 ? 1 : 0);
            rows[idx] = Math.max(0, Math.min(rowCeiling, Math.trunc(Number(rows[idx]) || 0) + offset));
          }
        }
      }
      if (activeStepIndices.length >= 4) {
        const rowCeiling = Math.max(4, Math.min(6, (Array.isArray(constants?.swarmPentatonicNotesOneOctave)
          ? constants.swarmPentatonicNotesOneOctave.length - 1
          : 6)));
        const zoneBaseByPhase = [2, 3, 5, 1];
        const zoneBase = zoneBaseByPhase[leadArcPhase % zoneBaseByPhase.length];
        const zoneSpread = leadArcPhase === 2 ? 2 : 1;
        const halfway = Math.ceil(activeStepIndices.length / 2);
        for (let i = 0; i < activeStepIndices.length; i += 1) {
          const idx = activeStepIndices[i];
          const sectionTarget = i < halfway
            ? zoneBase
            : Math.max(0, Math.min(rowCeiling, zoneBase + zoneSpread));
          const currentRow = Math.max(0, Math.trunc(Number(rows[idx]) || 0));
          const pull = currentRow < sectionTarget ? 1 : (currentRow > sectionTarget ? -1 : 0);
          const boostedTarget = (i === activeStepIndices.length - 1 && leadArcPhase !== 3)
            ? Math.max(sectionTarget, Math.min(rowCeiling, sectionTarget + 1))
            : sectionTarget;
          rows[idx] = Math.max(
            0,
            Math.min(
              rowCeiling,
              currentRow + pull + (currentRow === sectionTarget ? (boostedTarget - sectionTarget) : 0)
            )
          );
        }
      }
      if (activeStepIndices.length >= 4) {
        const rowCeiling = Math.max(4, Math.min(6, (Array.isArray(constants?.swarmPentatonicNotesOneOctave)
          ? constants.swarmPentatonicNotesOneOctave.length - 1
          : 6)));
        const callZoneByBar = [2, 3, 4, 5];
        const releaseZoneByBar = [4, 2, 3, 1];
        const callZone = Math.max(
          0,
          Math.min(rowCeiling, callZoneByBar[leadPhraseBarPhase % callZoneByBar.length])
        );
        const releaseBias = leadCadenceVariant === 0
          ? -1
          : (leadCadenceVariant === 2 ? 1 : 0);
        const releaseZone = Math.max(0, Math.min(
          rowCeiling,
          releaseZoneByBar[leadPhraseBarPhase % releaseZoneByBar.length]
            + (leadArcPhase === 2 ? 1 : 0)
            + releaseBias
        ));
        const cadenceTarget = Math.max(
          0,
          Math.min(
            rowCeiling,
            leadCadenceVariant === 0
              ? Math.max(0, Math.min(callZone, releaseZone))
              : (leadCadenceVariant === 1
                ? Math.max(0, Math.min(rowCeiling, releaseZone))
                : Math.max(releaseZone, Math.min(rowCeiling, callZone + (leadArcPhase === 2 ? 1 : 0))))
          )
        );
        const halfway = Math.ceil(activeStepIndices.length / 2);
        for (let i = 0; i < activeStepIndices.length; i += 1) {
          const idx = activeStepIndices[i];
          const currentRow = Math.max(0, Math.trunc(Number(rows[idx]) || 0));
          const targetRow = i < halfway
            ? Math.max(
              0,
              Math.min(
                rowCeiling,
                callZone + (i === halfway - 1 ? 1 : 0)
              )
            )
            : Math.max(
              0,
              Math.min(
                rowCeiling,
                i === activeStepIndices.length - 1
                  ? cadenceTarget
                  : (i >= activeStepIndices.length - 2
                    ? Math.max(0, Math.min(rowCeiling, leadCadenceVariant === 0 ? releaseZone : Math.max(callZone - 1, releaseZone)))
                    : Math.max(
                      0,
                      Math.min(
                        rowCeiling,
                        leadCadenceVariant === 0
                          ? callZone - 1
                          : Math.max(callZone, releaseZone - 1)
                      )
                    ))
              )
            );
          const distance = targetRow - currentRow;
          const stepTowardTarget = distance === 0
            ? 0
            : (Math.abs(distance) > 1 ? Math.sign(distance) * 2 : Math.sign(distance));
          rows[idx] = Math.max(0, Math.min(rowCeiling, currentRow + stepTowardTarget));
        }
        const finalActiveIdx = activeStepIndices[activeStepIndices.length - 1];
        const penultimateActiveIdx = activeStepIndices[activeStepIndices.length - 2];
        if (Number.isInteger(penultimateActiveIdx)) {
          rows[penultimateActiveIdx] = Math.max(
            0,
            Math.min(
              rowCeiling,
              leadCadenceVariant === 0
                ? Math.max(0, Math.min(callZone, releaseZone + 1))
                : Math.max(callZone, releaseZone - 1)
            )
          );
        }
        if (Number.isInteger(finalActiveIdx)) {
          rows[finalActiveIdx] = cadenceTarget;
        }
      }
      notes = rows.length
        ? rows.map((row, idx) => helpers.getSwarmPentatonicNoteByIndex?.(Math.max(0, Math.trunc(Number(row) || 0)))
          || notes[idx]
          || helpers.getRandomSwarmPentatonicNote?.()
          || 'C4')
        : notes;
      if (activeStepIndices.length >= 4) {
        const recentNoteWindow = [];
        const arcCycle = [0, 2, 4, 1, 5, 3, 6, 2];
        const arcBase = Math.max(0, Math.min(
          6,
          Math.trunc(Number(rows[activeStepIndices[0]]) || 1) + Math.max(-1, Math.min(2, leadArcLift))
        ));
        for (let i = 0; i < activeStepIndices.length; i += 1) {
          const idx = activeStepIndices[i];
          const currentNote = helpers.normalizeSwarmNoteName?.(notes[idx]) || '';
          const repeatedRecent = currentNote && recentNoteWindow.slice(-2).includes(currentNote);
          const overusedCenter = currentNote && recentNoteWindow.filter((noteName) => noteName === currentNote).length >= 1;
          if (repeatedRecent || overusedCenter) {
            const targetIndex = Math.max(
              0,
              Math.min(6, arcBase + Math.trunc(Number(arcCycle[(i + leadPhraseVariantEpoch) % arcCycle.length]) || 0))
            );
            const replacementNote = helpers.getSwarmPentatonicNoteByIndex?.(targetIndex)
              || currentNote
              || 'C4';
            notes[idx] = replacementNote;
            rows[idx] = targetIndex;
            recentNoteWindow.push(String(replacementNote || '').trim());
            continue;
          }
          recentNoteWindow.push(currentNote);
        }
      }
      if (activeStepIndices.length >= 4 && currentBarIndex >= 24) {
        const finalActiveIdx = activeStepIndices[activeStepIndices.length - 1];
        const penultimateActiveIdx = activeStepIndices[activeStepIndices.length - 2];
        const antepenultimateActiveIdx = activeStepIndices[activeStepIndices.length - 3];
        if (Number.isInteger(finalActiveIdx) && Number.isInteger(penultimateActiveIdx)) {
          const finalRow = Math.max(0, Math.min(6, Math.trunc(Number(rows[finalActiveIdx]) || 0)));
          const penultimateRow = Math.max(0, Math.min(6, Math.trunc(Number(rows[penultimateActiveIdx]) || 0)));
          const antepenultimateRow = Number.isInteger(antepenultimateActiveIdx)
            ? Math.max(0, Math.min(6, Math.trunc(Number(rows[antepenultimateActiveIdx]) || 0)))
            : -1;
          const sameCadenceLanding = finalRow === penultimateRow;
          const compressedTail = Math.abs(finalRow - penultimateRow) <= 1
            && penultimateRow === antepenultimateRow;
          if (sameCadenceLanding || compressedTail) {
            const cadenceAlternates = leadCadenceVariant === 0
              ? [-2, -1, 1]
              : (leadCadenceVariant === 1 ? [-1, 1, 2] : [1, 2, -1]);
            let diversifiedCadenceRow = finalRow;
            for (let i = 0; i < cadenceAlternates.length; i += 1) {
              const candidateRow = Math.max(0, Math.min(6, finalRow + cadenceAlternates[i]));
              if (candidateRow === penultimateRow || candidateRow === antepenultimateRow) continue;
              diversifiedCadenceRow = candidateRow;
              break;
            }
            rows[finalActiveIdx] = diversifiedCadenceRow;
            notes[finalActiveIdx] = helpers.getSwarmPentatonicNoteByIndex?.(diversifiedCadenceRow)
              || notes[finalActiveIdx]
              || 'C4';
          }
        }
      }
      if (activeStepIndices.length >= 4) {
        const preserveLateCadence = currentBarIndex >= 24;
        const phrasePeaks = [activeStepIndices[Math.floor(activeStepIndices.length / 2)]]
          .filter((idx) => Number.isInteger(idx) && idx >= 0);
        if (!preserveLateCadence) {
          phrasePeaks.push(activeStepIndices[activeStepIndices.length - 1]);
        }
        for (let i = 0; i < phrasePeaks.length; i += 1) {
          const idx = phrasePeaks[i];
          const boostedRow = Math.max(
            0,
            Math.min(
              6,
              Math.trunc(Number(rows[idx]) || 0) + (i === 0 ? 1 : (leadArcPhase === 3 ? 0 : 1))
            )
          );
          rows[idx] = boostedRow;
          notes[idx] = helpers.getSwarmPentatonicNoteByIndex?.(boostedRow)
            || notes[idx]
            || 'C4';
        }
      }
      const firstActiveIdx = activeStepIndices.length ? activeStepIndices[0] : 0;
      const finalActiveIdx = activeStepIndices.length ? activeStepIndices[activeStepIndices.length - 1] : 0;
      const phraseRoot = helpers.normalizeSwarmNoteName?.(notes[finalActiveIdx])
        || helpers.normalizeSwarmNoteName?.(notes[firstActiveIdx])
        || 'C4';
      const resolvedPhraseFifth = notes.find((note) => String(note || '').trim() && String(note || '').trim() !== String(phraseRoot || '').trim()) || notes[Math.min(2, Math.max(0, notes.length - 1))];
      const phraseFifth = helpers.normalizeSwarmNoteName?.(resolvedPhraseFifth) || phraseRoot;
      return {
        role: constants.leadRole,
        actionType: 'projectile',
        musicLaneId: 'primary_loop_lane',
        musicLaneLayer: 'loops',
        callResponseLane: 'solo',
        steps,
        rows,
        notes,
        phraseRoot,
        phraseFifth,
        resolutionTargets: [phraseRoot, phraseFifth].filter(Boolean),
        instrumentId: sanitizeEnemyMusicInstrumentId(
          selectedLeadInstrumentId,
          helpers.resolveSwarmSoundInstrumentId?.('projectile') || 'tone',
          { role: constants.leadRole }
        ),
      };
    }
    if (normalizedProfileSourceType === 'answer_ornament') {
      const answerEpoch = Math.max(0, Math.trunc((Math.max(0, currentBarIndex - 12)) / 4));
      const requestedAnswerFamily = String(options?.answerFamily || '').trim().toLowerCase();
      const answerFamily = (
        requestedAnswerFamily === 'reply'
        || requestedAnswerFamily === 'echo'
        || requestedAnswerFamily === 'ornament'
      )
        ? requestedAnswerFamily
        : chooseAnswerFamily({ ...options, epoch: answerEpoch });
      const preferredAnswerLaneId = String(options?.preferredLaneId || '').trim().toLowerCase();
      const answerInstrumentVariants = [
        helpers.getIdForDisplayName?.('Bell'),
        helpers.getIdForDisplayName?.('Chime'),
        helpers.getIdForDisplayName?.('Xylophone'),
        helpers.getIdForDisplayName?.('Retro Triangle'),
        helpers.resolveSwarmRoleInstrumentId?.(constants.accentRole || 'accent', helpers.resolveSwarmSoundInstrumentId?.('projectile') || 'tone'),
        helpers.resolveSwarmSoundInstrumentId?.('projectile'),
      ].filter((id) => String(id || '').trim());
      const answerRowsByFamily = {
        reply: [
          { rows: [4, 0, 5, 0, 6, 0, 5, 0], steps: [false, true, false, false, false, true, false, true], laneId: 'secondary_loop_lane', layer: 'loops' },
          { rows: [5, 0, 4, 0, 6, 0, 4, 0], steps: [false, true, false, true, false, false, true, false], laneId: 'secondary_loop_lane', layer: 'loops' },
        ],
        echo: [
          { rows: [6, 0, 5, 0, 4, 0, 5, 0], steps: [false, false, true, false, false, true, false, true], laneId: 'secondary_loop_lane', layer: 'loops' },
          { rows: [5, 0, 6, 0, 4, 0, 6, 0], steps: [false, true, false, false, true, false, false, true], laneId: 'secondary_loop_lane', layer: 'loops' },
        ],
        ornament: [
          { rows: [6, 0, 7, 0, 6, 0, 7, 0], steps: [false, true, false, false, false, true, false, false], laneId: 'secondary_loop_lane', layer: 'loops' },
          { rows: [7, 0, 6, 0, 7, 0, 6, 0], steps: [false, false, false, true, false, false, false, true], laneId: 'secondary_loop_lane', layer: 'loops' },
        ],
      };
      const chosenAnswerVariant = chooseStableVariant(
        answerRowsByFamily[answerFamily] || answerRowsByFamily.reply,
        61 + answerEpoch
      ) || answerRowsByFamily.reply[0];
      const steps = Array.isArray(chosenAnswerVariant?.steps)
        ? chosenAnswerVariant.steps.slice(0, constants.weaponTuneSteps)
        : [false, true, false, false, false, true, false, true];
      const rows = Array.isArray(chosenAnswerVariant?.rows)
        ? chosenAnswerVariant.rows.slice(0, constants.weaponTuneSteps)
        : [5, 0, 6, 0, 4, 0, 5, 0];
      const shapedAnswerSteps = sustainedFullTextureNoShowcase
        ? (() => {
          const weakOnlySteps = steps.slice(0, constants.weaponTuneSteps).map((step, index) => (
            !!step && (index === 1 || index === 3 || index === 5 || index === 7)
          ));
          const keptWeakOnlySteps = sparsifyStepPattern(weakOnlySteps, [5, 1, 7, 3], 1);
          if (keptWeakOnlySteps.some(Boolean)) return keptWeakOnlySteps;
          return sparsifyStepPattern(steps, [5, 1, 7, 3], 1);
        })()
        : steps.slice(0, constants.weaponTuneSteps).map((step) => !!step);
      const shapedAnswerRows = maskPatternValuesBySteps(rows, shapedAnswerSteps, 0);
      const notes = shapedAnswerRows.map((row, idx) => {
        if (!shapedAnswerSteps[idx]) return '';
        return helpers.getSwarmPentatonicNoteByIndex?.(Math.max(0, Math.trunc(Number(row) || 0)))
          || helpers.getRandomSwarmPentatonicNote?.()
          || 'C5';
      });
      const activeNotes = notes.filter(Boolean);
      const phraseRoot = helpers.normalizeSwarmNoteName?.(activeNotes[0]) || 'C5';
      const phraseFifth = helpers.normalizeSwarmNoteName?.(activeNotes[1] || activeNotes[0]) || phraseRoot;
      const selectedInstrumentId = String(
        chooseStableVariant(
          answerInstrumentVariants.map((instrumentId) => ({ instrumentId })),
          67 + answerEpoch
        )?.instrumentId
          || answerInstrumentVariants[0]
          || helpers.resolveSwarmSoundInstrumentId?.('projectile')
          || 'tone'
      ).trim();
      return {
        role: 'accent',
        actionType: 'projectile',
        musicLaneId: 'answer_lane',
        musicLaneLayer: 'loops',
        callResponseLane: 'response',
        steps: shapedAnswerSteps,
        rows: shapedAnswerRows,
        notes,
        phraseRoot,
        phraseFifth,
        resolutionTargets: [phraseRoot, phraseFifth].filter(Boolean),
        instrumentId: sanitizeEnemyMusicInstrumentId(
          selectedInstrumentId,
          helpers.resolveSwarmSoundInstrumentId?.('projectile') || 'tone',
          { role: 'accent' }
        ),
      };
    }
    return null;
  };
  const getSoloRhythmPreferredLaneId = (profileSourceType = '') => {
    const normalized = normalizeComposerProfileSourceType(profileSourceType);
    if (normalized === 'spawner_rhythm_pulse') return 'foundation_lane';
    if (normalized === 'spawner_rhythm_motion') return coerceLevel1LaneId('sparkle_lane');
    return 'secondary_loop_lane';
  };
  const getIntroSlotLockUntilBar = () => Math.max(
    Math.trunc(Number(currentBarIndex) || 0) + 4,
    18
  );
  const getIntroSlotProfileSourceType = (groupLike) => {
    const group = groupLike && typeof groupLike === 'object' ? groupLike : null;
    if (!group) return '';
    return String(group?.introSlotProfileSourceType || group?.musicProfileSourceType || '').trim().toLowerCase();
  };
  const buildStepSignature = (stepsLike) => (
    Array.isArray(stepsLike)
      ? stepsLike.map((step) => (step ? '1' : '0')).join('')
      : ''
  );
  const isIntroSlotProfileSourceType = (profileSourceType) => {
    return isIntroSlotRhythmProfile(profileSourceType);
  };
  const isIntroSlotIdentityActive = (groupLike) => {
    const group = groupLike && typeof groupLike === 'object' ? groupLike : null;
    if (!group || group?.active !== true || group?.retiring) return false;
    if (!isIntroSlotProfileSourceType(getIntroSlotProfileSourceType(group))) return false;
    if (group?.introSlotLock !== true) return true;
    const lockUntilBar = Math.max(-1, Math.trunc(Number(group?.introSlotLockUntilBar) || -1));
    return lockUntilBar < 0 || currentBarIndex <= lockUntilBar;
  };
  const isIntroRhythmStageCarrier = (groupLike) => {
    const group = groupLike && typeof groupLike === 'object' ? groupLike : null;
    if (!group || group?.introStageCarrier !== true) return false;
    return isIntroSlotProfileSourceType(getIntroSlotProfileSourceType(group));
  };
  const buildInactiveIntroSlotState = () => ({
    introSlotCreatedBarIndex: -1,
    introSlotCreatedBeatIndex: -1,
    introSlotLock: false,
    introSlotLockUntilBar: -1,
    introSlotProfileSourceType: '',
    introSlotRole: '',
    introSlotMusicLaneId: '',
    introSlotMusicLaneLayer: '',
    introSlotCallResponseLane: '',
    introSlotInstrumentId: '',
    introSlotActionType: '',
    introSlotSteps: null,
    introSlotRows: null,
    introSlotNotes: null,
    introSlotNoteIndices: null,
    introSlotNotePalette: null,
    introSlotPhraseRoot: '',
    introSlotPhraseFifth: '',
    introSlotResolutionTargets: null,
  });
  const buildIntroSlotState = ({
    active = false,
    profileSourceType = '',
    role = '',
    musicLaneId = '',
    musicLaneLayer = '',
    callResponseLane = 'call',
    instrumentId = '',
    actionType = '',
    steps = null,
    rows = null,
    notes = null,
    noteIndices = null,
    notePalette = null,
    phraseRoot = '',
    phraseFifth = '',
    resolutionTargets = null,
    createdBarIndex = -1,
    createdBeatIndex = -1,
    lockUntilBar = -1,
  } = {}) => {
    if (!active) return buildInactiveIntroSlotState();
    return {
      introSlotCreatedBarIndex: Math.trunc(Number(createdBarIndex) || 0),
      introSlotCreatedBeatIndex: Math.trunc(Number(createdBeatIndex) || 0),
      introSlotLock: true,
      introSlotLockUntilBar: Math.max(-1, Math.trunc(Number(lockUntilBar) || -1)),
      introSlotProfileSourceType: String(profileSourceType || '').trim().toLowerCase(),
      introSlotRole: String(role || ''),
      introSlotMusicLaneId: String(musicLaneId || '').trim().toLowerCase(),
      introSlotMusicLaneLayer: String(musicLaneLayer || '').trim().toLowerCase(),
      introSlotCallResponseLane: String(callResponseLane || 'call').trim().toLowerCase() || 'call',
      introSlotInstrumentId: String(instrumentId || ''),
      introSlotActionType: String(actionType || ''),
      introSlotSteps: Array.isArray(steps) ? steps.slice(0, constants.weaponTuneSteps) : null,
      introSlotRows: Array.isArray(rows) ? rows.slice(0, constants.weaponTuneSteps) : null,
      introSlotNotes: Array.isArray(notes) ? notes.slice() : null,
      introSlotNoteIndices: Array.isArray(noteIndices) ? noteIndices.slice(0, constants.weaponTuneSteps) : null,
      introSlotNotePalette: Array.isArray(notePalette) ? notePalette.slice() : null,
      introSlotPhraseRoot: String(phraseRoot || ''),
      introSlotPhraseFifth: String(phraseFifth || ''),
      introSlotResolutionTargets: Array.isArray(resolutionTargets) ? resolutionTargets.slice() : null,
    };
  };
  const applyIntroSlotStateToGroup = (groupLike) => {
    const group = groupLike && typeof groupLike === 'object' ? groupLike : null;
    if (!group) return;
    if (group?.introSlotRole) group.role = String(group.introSlotRole);
    if (group?.introSlotActionType) group.actionType = String(group.introSlotActionType);
    if (group?.introSlotMusicLaneId) group.musicLaneId = String(group.introSlotMusicLaneId).trim().toLowerCase();
    if (group?.introSlotMusicLaneLayer) group.musicLaneLayer = String(group.introSlotMusicLaneLayer).trim().toLowerCase();
    if (group?.introSlotCallResponseLane) group.callResponseLane = String(group.introSlotCallResponseLane).trim().toLowerCase();
    if (group?.introSlotProfileSourceType) group.musicProfileSourceType = String(group.introSlotProfileSourceType).trim().toLowerCase();
    if (group?.introSlotInstrumentId) {
      group.instrumentId = String(group.introSlotInstrumentId);
      group.instrument = String(group.introSlotInstrumentId);
    }
    if (Array.isArray(group?.introSlotSteps) && group.introSlotSteps.length) {
      group.steps = group.introSlotSteps.slice(0, constants.weaponTuneSteps);
    }
    if (Array.isArray(group?.introSlotRows)) {
      group.rows = group.introSlotRows.slice(0, constants.weaponTuneSteps);
    }
    if (Array.isArray(group?.introSlotNotes) && group.introSlotNotes.length) {
      group.notes = group.introSlotNotes.slice();
    }
    if (Array.isArray(group?.introSlotNoteIndices)) {
      group.noteIndices = group.introSlotNoteIndices.slice(0, constants.weaponTuneSteps);
    }
    if (Array.isArray(group?.introSlotNotePalette)) {
      group.notePalette = group.introSlotNotePalette.slice();
    }
    if (group?.introSlotPhraseRoot) group.phraseRoot = String(group.introSlotPhraseRoot);
    if (group?.introSlotPhraseFifth) group.phraseFifth = String(group.introSlotPhraseFifth);
    if (Array.isArray(group?.introSlotResolutionTargets) && group.introSlotResolutionTargets.length) {
      group.resolutionTargets = group.introSlotResolutionTargets.slice();
    }
  };
  const buildInactiveGroupRhythmState = () => ({
    groupRhythmCarrierLock: false,
    groupRhythmSteps: null,
    groupRhythmRole: '',
    groupRhythmInstrumentId: '',
    groupRhythmCallResponseLane: '',
    groupRhythmMusicLaneId: '',
    groupRhythmMusicLaneLayer: '',
    groupRhythmNotes: null,
    groupRhythmPhraseRoot: '',
    groupRhythmPhraseFifth: '',
    groupRhythmResolutionTargets: null,
  });
  const buildGroupRhythmState = ({
    active = false,
    steps = null,
    role = '',
    instrumentId = '',
    callResponseLane = 'call',
    musicLaneId = '',
    musicLaneLayer = '',
    notes = null,
    phraseRoot = '',
    phraseFifth = '',
    resolutionTargets = null,
  } = {}) => {
    if (!active) return buildInactiveGroupRhythmState();
    return {
      groupRhythmCarrierLock: true,
      groupRhythmSteps: Array.isArray(steps) ? steps.slice(0, constants.weaponTuneSteps) : null,
      groupRhythmRole: String(role || ''),
      groupRhythmInstrumentId: String(instrumentId || ''),
      groupRhythmCallResponseLane: String(callResponseLane || 'call').trim().toLowerCase() || 'call',
      groupRhythmMusicLaneId: String(musicLaneId || '').trim().toLowerCase(),
      groupRhythmMusicLaneLayer: String(musicLaneLayer || '').trim().toLowerCase(),
      groupRhythmNotes: Array.isArray(notes) ? notes.slice() : null,
      groupRhythmPhraseRoot: String(phraseRoot || ''),
      groupRhythmPhraseFifth: String(phraseFifth || ''),
      groupRhythmResolutionTargets: Array.isArray(resolutionTargets) ? resolutionTargets.slice() : null,
    };
  };
  const clearGroupRhythmState = (groupLike) => {
    const group = groupLike && typeof groupLike === 'object' ? groupLike : null;
    if (!group) return;
    Object.assign(group, buildInactiveGroupRhythmState());
  };
  const applyLockedGroupRhythmStateToGroup = (groupLike, lockedProfile = null) => {
    const group = groupLike && typeof groupLike === 'object' ? groupLike : null;
    if (!group) return;
    group.role = String(group?.groupRhythmRole || lockedProfile?.role || group?.role || constants.leadRole);
    group.actionType = 'explosion';
    group.musicLaneId = String(group?.groupRhythmMusicLaneId || lockedProfile?.musicLaneId || group?.musicLaneId || '').trim().toLowerCase();
    group.musicLaneLayer = String(group?.groupRhythmMusicLaneLayer || lockedProfile?.musicLaneLayer || group?.musicLaneLayer || 'loops').trim().toLowerCase();
    group.callResponseLane = String(group?.groupRhythmCallResponseLane || 'call').trim().toLowerCase();
    group.performers = Math.max(2, Math.trunc(Number(group?.performers) || 6));
    group.size = Math.max(2, Math.trunc(Number(group?.size) || 6));
    if (Array.isArray(group?.groupRhythmSteps) && group.groupRhythmSteps.length) {
      group.steps = group.groupRhythmSteps.slice(0, constants.weaponTuneSteps);
    } else if (Array.isArray(lockedProfile?.steps) && lockedProfile.steps.length) {
      group.steps = lockedProfile.steps.slice(0, constants.weaponTuneSteps);
    }
    group.rows = [];
    group.noteIndices = [];
    group.notePalette = [];
    if (Array.isArray(group?.groupRhythmNotes) && group.groupRhythmNotes.length) {
      group.notes = group.groupRhythmNotes.slice();
    } else if (Array.isArray(lockedProfile?.notes) && lockedProfile.notes.length) {
      group.notes = lockedProfile.notes.slice();
    }
    if (group?.groupRhythmPhraseRoot || lockedProfile?.phraseRoot) {
      group.phraseRoot = String(group?.groupRhythmPhraseRoot || lockedProfile?.phraseRoot || '');
    }
    if (group?.groupRhythmPhraseFifth || lockedProfile?.phraseFifth) {
      group.phraseFifth = String(group?.groupRhythmPhraseFifth || lockedProfile?.phraseFifth || '');
    }
    if (Array.isArray(group?.groupRhythmResolutionTargets) && group.groupRhythmResolutionTargets.length) {
      group.resolutionTargets = group.groupRhythmResolutionTargets.slice();
    } else if (Array.isArray(lockedProfile?.resolutionTargets) && lockedProfile.resolutionTargets.length) {
      group.resolutionTargets = lockedProfile.resolutionTargets.slice();
    }
    const lockedGroupRhythmInstrumentId = sanitizeEnemyMusicInstrumentId(
      group?.groupRhythmInstrumentId || lockedProfile?.instrumentId || group?.instrumentId || group?.instrument,
      helpers.resolveSwarmSoundInstrumentId?.('projectile') || 'tone',
      { role: group?.groupRhythmRole || lockedProfile?.role || group?.role || constants.leadRole, toyKey: 'loopgrid-drum' }
    );
    if (lockedGroupRhythmInstrumentId) {
      group.instrumentId = lockedGroupRhythmInstrumentId;
      group.instrument = lockedGroupRhythmInstrumentId;
    }
  };
  const hasActiveIntroSlotCarrierProfile = (profileSourceType = '') => {
    const normalized = String(profileSourceType || '').trim().toLowerCase();
    if (!normalized) return false;
    return composerEnemyGroups.some((group) => (
      group
      && group.active
      && !group.retiring
      && getIntroSlotProfileSourceType(group) === normalized
    ));
  };
  const getOldestActiveIntroSlotCarrierBarIndex = (profileSourceType = '') => {
    const normalized = String(profileSourceType || '').trim().toLowerCase();
    if (!normalized) return -1;
    let oldestBarIndex = Infinity;
    for (const group of composerEnemyGroups) {
      if (!group || group.active !== true || group.retiring) continue;
      if (getIntroSlotProfileSourceType(group) !== normalized) continue;
      const createdBarIndex = Math.trunc(Number(group?.introSlotCreatedBarIndex) || -1);
      if (createdBarIndex >= 0 && createdBarIndex < oldestBarIndex) oldestBarIndex = createdBarIndex;
    }
    return Number.isFinite(oldestBarIndex) ? oldestBarIndex : -1;
  };
  const getOldestActiveIntroSlotCarrierBeatIndex = (profileSourceType = '') => {
    const normalized = String(profileSourceType || '').trim().toLowerCase();
    if (!normalized) return -1;
    let oldestBeatIndex = Infinity;
    for (const group of composerEnemyGroups) {
      if (!group || group.active !== true || group.retiring) continue;
      if (getIntroSlotProfileSourceType(group) !== normalized) continue;
      const firstAudibleBeatIndex = Math.trunc(Number(group?.introSlotFirstAudibleBeatIndex) || -1);
      const createdBeatIndex = Math.trunc(Number(group?.introSlotCreatedBeatIndex) || -1);
      const candidateBeatIndex = firstAudibleBeatIndex >= 0 ? firstAudibleBeatIndex : createdBeatIndex;
      if (candidateBeatIndex >= 0 && candidateBeatIndex < oldestBeatIndex) oldestBeatIndex = candidateBeatIndex;
    }
    return Number.isFinite(oldestBeatIndex) ? oldestBeatIndex : -1;
  };
  const pulseCarrierReadyForBackbeat = (() => {
    const oldestPulseCarrierBeatIndex = getOldestActiveIntroSlotCarrierBeatIndex('spawner_rhythm_pulse');
    if (!(oldestPulseCarrierBeatIndex >= 0)) return false;
    return (Math.max(0, Math.trunc(Number(currentBeatIndex) || 0)) - oldestPulseCarrierBeatIndex) >= 16;
  })();
  const chooseComposerBodyTypeForMusicLane = typeof helpers.chooseComposerBodyTypeForMusicLane === 'function'
    ? helpers.chooseComposerBodyTypeForMusicLane
    : ((_laneId, _preferredCarrier, fallbackBodyType = 'group') => String(fallbackBodyType || 'group').trim().toLowerCase() === 'solo' ? 'solo' : 'group');
  const getPreferredCarrierForMusicLaneId = (laneId = '') => {
    const normalizedLaneId = String(laneId || '').trim().toLowerCase();
    if (normalizedLaneId === 'foundation_lane') return String(foundationLanePlan?.preferredCarrier || '').trim().toLowerCase();
    if (normalizedLaneId === 'primary_loop_lane') return String(primaryLoopLanePlan?.preferredCarrier || '').trim().toLowerCase();
    if (normalizedLaneId === 'secondary_loop_lane') {
      return String(supportLanePlan?.preferredCarrier || answerLanePlan?.preferredCarrier || '').trim().toLowerCase();
    }
    if (normalizedLaneId === 'sparkle_lane') {
      return String(answerLanePlan?.preferredCarrier || supportLanePlan?.preferredCarrier || '').trim().toLowerCase();
    }
    return '';
  };
  const composer = helpers.getComposerDirective?.() || {};
  const motifScopeKey = helpers.getComposerMotifScopeKey?.() || '';
  const runtimeSectionKey = `${String(composer.sectionId || 'default')}:${Math.max(0, Math.trunc(Number(composer.cycle) || 0))}:${motifScopeKey}`;
  const syncLeadAuthorityFromGroup = (groupLike = null, source = 'maintenance') => {
    if (!leadAuthorityRuntime) return;
    const group = groupLike && typeof groupLike === 'object' ? groupLike : null;
    if (!group) {
      leadAuthorityRuntime.active = false;
      leadAuthorityRuntime.activeLevelPhase = String(levelPhaseRuntime?.activeLevelPhase || musicModeRuntime?.activeLevelPhase || '').trim().toLowerCase() || 'intro_teach';
      leadAuthorityRuntime.activeMusicMode = String(musicModeRuntime?.activeMusicMode || '').trim().toLowerCase() || 'intro_pulse';
      leadAuthorityRuntime.source = source;
      return;
    }
    leadAuthorityRuntime.canonicalGroupId = Math.max(0, Math.trunc(Number(group?.id) || 0));
    const previousLeadInstrumentId = String(leadAuthorityRuntime?.instrumentId || '').trim();
    leadAuthorityRuntime.continuityId = String(
      group?.musicLaneContinuityId
      || group?.continuityId
      || composer?.__bsCanonicalPrimaryLeadContinuityId
      || leadAuthorityRuntime?.continuityId
      || ''
    ).trim();
    const observedInstrumentId = String(
      group?.__bsCanonicalLeadInstrumentId
      || group?.musicLaneInstrumentId
      || group?.instrumentId
      || group?.instrument
      || composer?.__bsCanonicalPrimaryLeadInstrumentId
      || leadAuthorityRuntime?.instrumentId
      || ''
    ).trim();
    leadAuthorityRuntime.instrumentId = observedInstrumentId;
    leadAuthorityRuntime.sectionContinuityKey = String(
      group?.sectionContinuityKey
      || composer?.__bsCanonicalPrimaryLeadSectionContinuityKey
      || leadAuthorityRuntime?.sectionContinuityKey
      || ''
    ).trim().toLowerCase();
    leadAuthorityRuntime.lastSeenBar = currentBarIndex;
    if (group?.active === true && !group?.retiring) {
      leadAuthorityRuntime.lastValidLeadBar = currentBarIndex;
      leadAuthorityRuntime.active = true;
    } else {
      leadAuthorityRuntime.active = false;
    }
    leadAuthorityRuntime.activeLevelPhase = String(levelPhaseRuntime?.activeLevelPhase || musicModeRuntime?.activeLevelPhase || '').trim().toLowerCase() || 'intro_teach';
    leadAuthorityRuntime.activeMusicMode = String(musicModeRuntime?.activeMusicMode || '').trim().toLowerCase() || 'intro_pulse';
    leadAuthorityRuntime.source = source;
    if (leadAuthorityRuntime.instrumentId && leadAuthorityRuntime.instrumentId !== previousLeadInstrumentId) {
      try {
        noteMusicSystemEvent?.('music_primary_lead_instrument_change', {
          source,
          previousInstrumentId: previousLeadInstrumentId,
          instrumentId: String(leadAuthorityRuntime.instrumentId || '').trim(),
          canonicalLeadGroupId: Math.max(0, Math.trunc(Number(leadAuthorityRuntime?.canonicalGroupId) || 0)),
          canonicalLeadContinuityId: String(leadAuthorityRuntime?.continuityId || '').trim(),
          activeLevelPhase: String(leadAuthorityRuntime?.activeLevelPhase || '').trim().toLowerCase(),
          activeMusicMode: String(leadAuthorityRuntime?.activeMusicMode || '').trim().toLowerCase(),
        }, {
          beatIndex: Math.max(0, Math.trunc(Number(currentBeatIndex) || 0)),
          barIndex: currentBarIndex,
        });
      } catch {}
    }
  };
  if (leadAuthorityRuntime && !leadAuthorityRuntime.canonicalGroupId) {
    leadAuthorityRuntime.canonicalGroupId = Math.max(0, Math.trunc(Number(composer?.__bsCanonicalPrimaryLeadGroupId) || 0));
    leadAuthorityRuntime.continuityId = String(composer?.__bsCanonicalPrimaryLeadContinuityId || '').trim();
    leadAuthorityRuntime.instrumentId = String(composer?.__bsCanonicalPrimaryLeadInstrumentId || '').trim();
    leadAuthorityRuntime.sectionContinuityKey = String(composer?.__bsCanonicalPrimaryLeadSectionContinuityKey || '').trim().toLowerCase();
  }
  const getMotifLockIndex = (scopeKeyLike = '') => {
    const scopeKey = String(scopeKeyLike || '').trim().toLowerCase();
    if (!scopeKey) return 0;
    const match = scopeKey.match(/lock-(\d+)/);
    return match ? Math.max(0, Math.trunc(Number(match[1]) || 0)) : 0;
  };
  const motifLockIndex = getMotifLockIndex(motifScopeKey);
  const getActiveComposerLaneCoverage = () => {
    const activeGroups = composerEnemyGroups.filter((g) => g && g.active && !g.retiring);
    let hasNonBassCall = false;
    let hasResponse = false;
    for (const g of activeGroups) {
      const lane = helpers.normalizeCallResponseLane?.(g?.callResponseLane || '', 'call') || String(g?.callResponseLane || '').trim().toLowerCase() || 'call';
      const templateId = String(g?.templateId || '').trim();
      const role = helpers.normalizeSwarmRole?.(g?.role || templateById.get(templateId)?.role || '', constants.leadRole) || '';
      if (lane === 'response' && role !== constants.bassRole && templateId !== 'foundation-buffer') hasResponse = true;
      if (lane !== 'response' && role !== constants.bassRole && templateId !== 'foundation-buffer') hasNonBassCall = true;
    }
    return { hasNonBassCall, hasResponse };
  };
  const hasEmbodiedAnswerOrnamentCarrier = () => composerEnemyGroups.some((group) => {
    if (!group || group.active !== true || group.retiring) return false;
    const normalizedResponseLane = String(group?.callResponseLane || '').trim().toLowerCase();
    const normalizedProfileSourceType = String(group?.musicProfileSourceType || '').trim().toLowerCase();
    if (normalizedResponseLane !== 'response' && normalizedProfileSourceType !== 'answer_ornament') return false;
    const persistUntilBar = Math.max(-1, Math.trunc(Number(group?.__bsFullTextureAnswerOrnamentPersistUntilBar) || -1));
    const seenBarIndex = Math.max(-1, Math.trunc(Number(group?.__bsAnswerOrnamentSeenBarIndex) || -1));
    return getAliveComposerEnemiesByIds(group?.memberIds).length > 0
      || persistUntilBar >= currentBarIndex
      || (seenBarIndex >= 0 && (currentBarIndex - seenBarIndex) <= 1);
  });
  const isAnswerOrnamentIntentGroup = (groupLike = null) => {
    const group = groupLike && typeof groupLike === 'object' ? groupLike : null;
    if (!group || group.active !== true || group.retiring) return false;
    const normalizedResponseLane = String(group?.callResponseLane || '').trim().toLowerCase();
    const normalizedProfileSourceType = normalizeComposerProfileSourceType(group?.musicProfileSourceType);
    return normalizedResponseLane === 'response' || normalizedProfileSourceType === 'answer_ornament';
  };
  const fullTextureAnswerRecoveryFloorRequested = false;
  if (fullTextureAnswerRecoveryFloorRequested && composerRuntime && typeof composerRuntime === 'object') {
    composerRuntime.__answerOrnamentReservation = null;
  }
  const getDesiredComposerLane = (groupIndex) => {
    const parityLane = helpers.normalizeCallResponseLane?.((groupIndex % 2) === 0 ? 'call' : 'response', 'call')
      || ((groupIndex % 2) === 0 ? 'call' : 'response');
    if (introComposerLockActive || String(effectivePacingCaps?.responseMode || '').trim().toLowerCase() !== 'group') {
      return parityLane;
    }
    if (fullTextureActive) {
      if (!level1AllowedRoles.has('answer_ornament') || !answerLaneActive) return 'call';
      const coverage = getActiveComposerLaneCoverage();
      return coverage.hasResponse ? parityLane : 'response';
    }
    if (fullTextureAnswerRecoveryFloorRequested) return 'response';
    if (fallbackRhythmCoverageRequested && getActiveSoloCarrierCount('rhythm') === 0) return 'call';
    if (fallbackMelodyCoverageRequested && getActiveMelodyCoverageCount() === 0) return 'call';
    const coverage = getActiveComposerLaneCoverage();
    if (!coverage.hasNonBassCall) return 'call';
    if (!coverage.hasResponse) return 'response';
    return parityLane;
  };
  const retireGroup = (group, reason) => {
    if (!group || group.retiring) return;
    const normalizedLaneId = String(group?.musicLaneId || '').trim().toLowerCase();
    const normalizedCallResponseLane = String(group?.callResponseLane || '').trim().toLowerCase();
    const normalizedProfileSourceType = normalizeComposerProfileSourceType(group?.musicProfileSourceType);
    const protectedPrimaryLeadGroup = (
      (leadEntryMergeActive || fullTextureActive)
      && normalizedLaneId === 'primary_loop_lane'
      && normalizedCallResponseLane !== 'response'
      && normalizedProfileSourceType === 'lead_melody'
    );
    const protectedLeadMergeSecondaryBridge = (
      (leadEntryMergeActive || fullTextureSupportLockActive)
      && normalizedLaneId === 'secondary_loop_lane'
      && normalizedCallResponseLane !== 'response'
      && normalizedProfileSourceType === 'secondary_bridge_backbeat'
    );
    const protectedFullTextureAnswerOrnament = (
      fullTextureAnswerOrnamentLockActive
      && normalizedCallResponseLane === 'response'
      && normalizedProfileSourceType === 'answer_ornament'
    );
    if (protectedPrimaryLeadGroup) {
      group.active = true;
      group.retiring = false;
      group.lifecycleState = 'active';
      group.musicParticipationGain = 1;
      group.__bsPrimaryLeadSeenBarIndex = currentBarIndex;
      group.__bsPrimaryLeadPersistUntilBar = Math.max(
        Math.max(-1, Math.trunc(Number(group?.__bsPrimaryLeadPersistUntilBar) || -1)),
        currentBarIndex + (fullTextureActive ? 6 : 4)
      );
      refreshPrimaryLeadReservation(group);
      syncLeadAuthorityFromGroup(group, 'maintenance_retire_guard');
      return;
    }
    if (protectedLeadMergeSecondaryBridge) {
      group.active = true;
      group.retiring = false;
      group.lifecycleState = 'active';
      group.musicParticipationGain = 1;
      group.__bsSecondaryCoverageSeenBarIndex = currentBarIndex;
      group.__bsLeadMergeSecondaryPersistUntilBar = Math.max(
        Math.max(-1, Math.trunc(Number(group?.__bsLeadMergeSecondaryPersistUntilBar) || -1)),
        currentBarIndex + ((stableMergeSupportLockActive || fullTextureSupportLockActive) ? 4 : 2)
      );
      return;
    }
    if (protectedFullTextureAnswerOrnament) {
      group.active = true;
      group.retiring = false;
      group.lifecycleState = 'active';
      group.musicParticipationGain = 1;
      group.__bsAnswerOrnamentSeenBarIndex = currentBarIndex;
      group.__bsFullTextureAnswerOrnamentPersistUntilBar = Math.max(
        Math.max(-1, Math.trunc(Number(group?.__bsFullTextureAnswerOrnamentPersistUntilBar) || -1)),
        currentBarIndex + (degradedFullTextureNoOrnamentActive ? 6 : 4)
      );
      refreshAnswerOrnamentReservation(group);
      return;
    }
    group.active = false;
    group.retiring = true;
    group.lifecycleState = 'retiring';
    group.retireReason = String(reason || 'retreated').trim().toLowerCase() || 'retreated';
    const aliveMembers = getAliveComposerEnemiesByIds(group.memberIds);
    group.memberIds = new Set(aliveMembers.map((e) => Math.trunc(Number(e?.id) || 0)).filter((id) => id > 0));
    for (const enemy of aliveMembers) {
      enemy.lifecycleState = 'retiring';
      enemy.composerRetiring = true;
      enemy.retireReason = group.retireReason;
      enemy.retirePhaseStartMs = Number(performance?.now?.() || 0);
    }
  };
  const enforceSingleAnswerOrnamentGroup = () => {
    const activeAnswerGroups = composerEnemyGroups
      .filter((group) => isAnswerOrnamentIntentGroup(group))
      .sort((a, b) => {
        const aReservation = Math.trunc(Number(a?.id) || 0) === Math.max(0, Math.trunc(Number(composerRuntime?.__answerOrnamentReservation?.groupId) || 0)) ? 1 : 0;
        const bReservation = Math.trunc(Number(b?.id) || 0) === Math.max(0, Math.trunc(Number(composerRuntime?.__answerOrnamentReservation?.groupId) || 0)) ? 1 : 0;
        if (aReservation !== bReservation) return bReservation - aReservation;
        const aSection = String(a?.sectionKey || '').trim().toLowerCase() === String(runtimeSectionKey || '').trim().toLowerCase() ? 1 : 0;
        const bSection = String(b?.sectionKey || '').trim().toLowerCase() === String(runtimeSectionKey || '').trim().toLowerCase() ? 1 : 0;
        if (aSection !== bSection) return bSection - aSection;
        const aAlive = getAliveComposerEnemiesByIds(a?.memberIds).length;
        const bAlive = getAliveComposerEnemiesByIds(b?.memberIds).length;
        if (aAlive !== bAlive) return bAlive - aAlive;
        const aSeen = Math.max(-1, Math.trunc(Number(a?.__bsAnswerOrnamentSeenBarIndex) || -1));
        const bSeen = Math.max(-1, Math.trunc(Number(b?.__bsAnswerOrnamentSeenBarIndex) || -1));
        if (aSeen !== bSeen) return bSeen - aSeen;
        return Math.trunc(Number(a?.id) || 0) - Math.trunc(Number(b?.id) || 0);
      });
    const keeper = activeAnswerGroups[0] || null;
    if (keeper) {
      keeper.size = 1;
      keeper.performers = 1;
      keeper.musicParticipationGain = Math.min(0.82, Math.max(0.45, Number(keeper.musicParticipationGain) || 0.68));
      refreshAnswerOrnamentReservation(keeper);
    }
    for (let i = 1; i < activeAnswerGroups.length; i += 1) {
      retireGroup(activeAnswerGroups[i], 'answer_ornament_overflow');
    }
  };
  const hasPendingPrimaryLeadReservation = () => {
    const reservation = composerRuntime?.__primaryLeadReservation
      && typeof composerRuntime.__primaryLeadReservation === 'object'
      ? composerRuntime.__primaryLeadReservation
      : null;
    if (!reservation) return false;
    const expiresBeatIndex = Math.max(0, Math.trunc(Number(reservation.expiresBeatIndex) || 0));
    if (expiresBeatIndex <= Math.max(0, Math.trunc(Number(currentBeatIndex) || 0))) {
      composerRuntime.__primaryLeadReservation = null;
      return false;
    }
    return true;
  };
  const refreshPrimaryLeadReservation = (groupLike = null) => {
    const group = groupLike && typeof groupLike === 'object' ? groupLike : null;
    composerRuntime.__primaryLeadReservation = {
      groupId: Math.max(0, Math.trunc(Number(group?.id) || 0)),
      expiresBeatIndex: Math.max(0, Math.trunc(Number(currentBeatIndex) || 0)) + 8,
      sectionKey: String(group?.sectionKey || '').trim().toLowerCase(),
      sectionId: String(group?.sectionId || '').trim().toLowerCase(),
    };
  };
  const hasPendingAnswerOrnamentReservation = () => {
    const reservation = composerRuntime?.__answerOrnamentReservation
      && typeof composerRuntime.__answerOrnamentReservation === 'object'
      ? composerRuntime.__answerOrnamentReservation
      : null;
    if (!reservation) return false;
    const expiresBeatIndex = Math.max(0, Math.trunc(Number(reservation.expiresBeatIndex) || 0));
    if (expiresBeatIndex <= Math.max(0, Math.trunc(Number(currentBeatIndex) || 0))) {
      composerRuntime.__answerOrnamentReservation = null;
      return false;
    }
    return true;
  };
  const refreshAnswerOrnamentReservation = (groupLike = null) => {
    const group = groupLike && typeof groupLike === 'object' ? groupLike : null;
    composerRuntime.__answerOrnamentReservation = {
      groupId: Math.max(0, Math.trunc(Number(group?.id) || 0)),
      expiresBeatIndex: Math.max(0, Math.trunc(Number(currentBeatIndex) || 0)) + 4,
      sectionKey: String(group?.sectionKey || '').trim().toLowerCase(),
      sectionId: String(group?.sectionId || '').trim().toLowerCase(),
    };
  };
  const hasPendingSecondaryLoopReservation = () => {
    const reservation = composerRuntime?.__secondaryLoopReservation
      && typeof composerRuntime.__secondaryLoopReservation === 'object'
      ? composerRuntime.__secondaryLoopReservation
      : null;
    if (!reservation) return false;
    const expiresBeatIndex = Math.max(0, Math.trunc(Number(reservation.expiresBeatIndex) || 0));
    if (expiresBeatIndex <= Math.max(0, Math.trunc(Number(currentBeatIndex) || 0))) {
      composerRuntime.__secondaryLoopReservation = null;
      return false;
    }
    return true;
  };
  const refreshSecondaryLoopReservation = (groupLike = null) => {
    const group = groupLike && typeof groupLike === 'object' ? groupLike : null;
    composerRuntime.__secondaryLoopReservation = {
      groupId: Math.max(0, Math.trunc(Number(group?.id) || 0)),
      expiresBeatIndex: Math.max(0, Math.trunc(Number(currentBeatIndex) || 0)) + 8,
      sectionKey: String(group?.sectionKey || runtimeSectionKey || '').trim().toLowerCase(),
      sectionId: String(group?.sectionId || composer?.sectionId || '').trim().toLowerCase(),
    };
  };
  enforceSingleAnswerOrnamentGroup();
  const syncGroupPrimaryNote = (groupLike = null) => {
    const group = groupLike && typeof groupLike === 'object' ? groupLike : null;
    if (!group) return '';
    const notesLen = Array.isArray(group?.notes) ? group.notes.length : 0;
    const cursorIndex = notesLen > 0
      ? (Math.max(0, Math.trunc(Number(group?.noteCursor) || 0)) % Math.max(1, notesLen))
      : 0;
    const cursorArrayNote = notesLen > 0
      ? (helpers.normalizeSwarmNoteName?.(group.notes[cursorIndex]) || '')
      : '';
    const explicitNote = helpers.normalizeSwarmNoteName?.(group?.note) || '';
    const firstArrayNote = Array.isArray(group?.notes) && group.notes.length
      ? (helpers.normalizeSwarmNoteName?.(group.notes[0]) || '')
      : '';
    const phraseRootNote = helpers.normalizeSwarmNoteName?.(group?.phraseRoot) || '';
    const resolvedNote = cursorArrayNote || explicitNote || firstArrayNote || phraseRootNote || '';
    group.note = resolvedNote;
    return resolvedNote;
  };

  const getActiveSoloCarrierCount = (soloType) => composerEnemyGroups.filter((group) => (
    group
    && group.active
    && !group.retiring
    && (
      String(group?.soloCarrierType || '').trim().toLowerCase() === soloType
      || (
        soloType === 'rhythm'
        && isIntroSlotIdentityActive(group)
      )
    )
  )).length;
  const isActivePrimaryLeadIntentGroup = (groupLike) => {
    const group = groupLike && typeof groupLike === 'object' ? groupLike : null;
    if (!group || group.active !== true || group.retiring) return false;
    const musicLaneId = String(group?.musicLaneId || '').trim().toLowerCase();
    const profileSourceType = normalizeComposerProfileSourceType(group?.musicProfileSourceType);
    const introProfileSourceType = getIntroSlotProfileSourceType(group);
    if (profileSourceType === 'lead_melody') return true;
    if (
      musicLaneId === 'primary_loop_lane'
      && profileSourceType !== 'spawner_rhythm_backbeat'
      && profileSourceType !== 'rhythm_lane_backbeat'
      && introProfileSourceType !== 'spawner_rhythm_backbeat'
      && !isIntroSlotIdentityActive(group)
    ) {
      return true;
    }
    if (musicLaneId === 'foundation_lane' || musicLaneId === 'secondary_loop_lane' || musicLaneId === 'sparkle_lane') return false;
    if (isIntroSlotIdentityActive(group)) return false;
    if (String(group?.soloCarrierType || '').trim().toLowerCase() === 'rhythm') return false;
    const templateId = String(group?.templateId || '').trim();
    if (!templateId || templateId === 'foundation-buffer' || templateId === 'response_group') return false;
    const callResponseLane = helpers.normalizeCallResponseLane?.(group?.callResponseLane || '', 'call')
      || String(group?.callResponseLane || '').trim().toLowerCase()
      || 'call';
    if (callResponseLane === 'response') return false;
    const normalizedRole = helpers.normalizeSwarmRole?.(
      group?.role || templateById.get(templateId)?.role || '',
      ''
    ) || '';
    return normalizedRole === constants.leadRole;
  };
  const getActiveMelodyCoverageCount = () => composerEnemyGroups.filter((group) => (
    isActivePrimaryLeadIntentGroup(group)
  )).length + (hasPendingPrimaryLeadReservation() ? 1 : 0);
  const getActiveRhythmCoverageCount = () => composerEnemyGroups.filter((group) => {
    if (!group || group.active !== true || group.retiring) return false;
    const laneId = String(group?.musicLaneId || '').trim().toLowerCase();
    const profileSourceType = normalizeComposerProfileSourceType(group?.musicProfileSourceType);
    const soloCarrierType = String(group?.soloCarrierType || '').trim().toLowerCase();
    return soloCarrierType === 'rhythm'
      || profileSourceType === 'rhythm_lane'
      || profileSourceType === 'rhythm_lane_backbeat'
      || profileSourceType === 'spawner_rhythm_pulse'
      || profileSourceType === 'spawner_rhythm_backbeat'
      || profileSourceType === 'spawner_rhythm_motion'
      || laneId === 'foundation_lane'
      || laneId === 'secondary_loop_lane';
  }).length;
  const getActiveVisibleNonFoundationSoloCount = () => composerEnemyGroups.filter((group) => {
    if (!group || group.active !== true || group.retiring) return false;
    if (String(group?.musicLaneId || '').trim().toLowerCase() === 'foundation_lane') return false;
    const templateId = String(group?.templateId || '').trim().toLowerCase();
    const soloCarrierType = String(group?.soloCarrierType || '').trim().toLowerCase();
    const introCarrierBodyType = String(group?.introCarrierBodyType || '').trim().toLowerCase();
    return templateId.startsWith('solo-') || (!!soloCarrierType && introCarrierBodyType !== 'group');
  }).length;
  const getActiveVisibleNonFoundationSoloGroups = () => composerEnemyGroups.filter((group) => {
    if (!group || group.active !== true || group.retiring) return false;
    if (String(group?.musicLaneId || '').trim().toLowerCase() === 'foundation_lane') return false;
    const templateId = String(group?.templateId || '').trim().toLowerCase();
    const soloCarrierType = String(group?.soloCarrierType || '').trim().toLowerCase();
    const introCarrierBodyType = String(group?.introCarrierBodyType || '').trim().toLowerCase();
    return templateId.startsWith('solo-') || (!!soloCarrierType && introCarrierBodyType !== 'group');
  });
  const findReplaceableNonSoloGroup = () => {
    const activeGroups = composerEnemyGroups.filter((group) => (
      group
      && group.active
      && !group.retiring
      && !String(group?.soloCarrierType || '').trim()
      && !isIntroSlotIdentityActive(group)
      && String(group?.templateId || '').trim() !== 'foundation-buffer'
      && !isActivePrimaryLeadIntentGroup(group)
      && !(
        stableMergeSupportLockActive
        && String(group?.musicLaneId || '').trim().toLowerCase() === 'secondary_loop_lane'
        && String(group?.callResponseLane || '').trim().toLowerCase() !== 'response'
      )
      && !(
        fullTextureAnswerOrnamentLockActive
        && String(group?.callResponseLane || '').trim().toLowerCase() === 'response'
        && normalizeComposerProfileSourceType(group?.musicProfileSourceType) === 'answer_ornament'
      )
    ));
    activeGroups.sort((a, b) => {
      const aLead = String(a?.musicLaneId || '').trim().toLowerCase() === 'primary_loop_lane' ? 1 : 0;
      const bLead = String(b?.musicLaneId || '').trim().toLowerCase() === 'primary_loop_lane' ? 1 : 0;
      if (aLead !== bLead) return aLead - bLead;
      const aLife = String(a?.lifecycleState || '').trim().toLowerCase() === 'active' ? 1 : 0;
      const bLife = String(b?.lifecycleState || '').trim().toLowerCase() === 'active' ? 1 : 0;
      if (aLife !== bLife) return aLife - bLife;
      return Math.trunc(Number(a?.id) || 0) - Math.trunc(Number(b?.id) || 0);
    });
    return activeGroups[0] || null;
  };
  if (currentBarIndex < 20) {
    const earlyVisibleSoloGroups = getActiveVisibleNonFoundationSoloGroups()
      .slice()
      .sort((a, b) => Math.trunc(Number(a?.id) || 0) - Math.trunc(Number(b?.id) || 0));
    let keptMelody = 0;
    let keptRhythm = 0;
    for (let i = 0; i < earlyVisibleSoloGroups.length; i++) {
      const group = earlyVisibleSoloGroups[i];
      const soloCarrierTypeRaw = String(group?.soloCarrierType || '').trim().toLowerCase();
      const soloCarrierType = soloCarrierTypeRaw === 'rhythm' ? 'rhythm' : '';
      if (soloCarrierType !== soloCarrierTypeRaw) {
        group.soloCarrierType = soloCarrierType;
      }
      const laneId = String(group?.musicLaneId || '').trim().toLowerCase();
      const isMelody = laneId === 'primary_loop_lane';
      const isRhythm = !isMelody;
      if (isMelody) {
        if (keptMelody < 1) {
          keptMelody += 1;
          continue;
        }
      } else if (isRhythm) {
        if (keptRhythm < 1) {
          keptRhythm += 1;
          continue;
        }
      }
      retireGroup(group, 'early_solo_overflow');
    }
  }
  if (!introComposerLockActive) {
    if (spawnWantsSoloRhythm && getActiveSoloCarrierCount('rhythm') === 0) {
      const replaceable = stableMergeSupportLockActive ? null : findReplaceableNonSoloGroup();
      if (replaceable) retireGroup(replaceable, 'solo_rhythm_turnover');
      effectivePacingCaps.responseMode = 'group';
      effectivePacingCaps.maxComposerGroups = Math.max(1, Math.trunc(Number(effectivePacingCaps?.maxComposerGroups) || 0));
      effectivePacingCaps.maxComposerGroupSize = Math.max(1, Math.trunc(Number(effectivePacingCaps?.maxComposerGroupSize) || 1));
      effectivePacingCaps.maxComposerPerformers = Math.max(1, Math.trunc(Number(effectivePacingCaps?.maxComposerPerformers) || 1));
    }
    if (!spawnWantsSoloRhythm && fallbackRhythmCoverageRequested && getActiveSoloCarrierCount('rhythm') === 0) {
      const replaceable = stableMergeSupportLockActive ? null : findReplaceableNonSoloGroup();
      if (replaceable) retireGroup(replaceable, 'fallback_rhythm_turnover');
      effectivePacingCaps.responseMode = 'group';
      effectivePacingCaps.maxComposerGroups = Math.max(1, Math.trunc(Number(effectivePacingCaps?.maxComposerGroups) || 0));
      effectivePacingCaps.maxComposerGroupSize = Math.max(1, Math.trunc(Number(effectivePacingCaps?.maxComposerGroupSize) || 1));
      effectivePacingCaps.maxComposerPerformers = Math.max(1, Math.trunc(Number(effectivePacingCaps?.maxComposerPerformers) || 1));
    }
    if (fallbackMelodyCoverageRequested && getActiveMelodyCoverageCount() === 0) {
      const replaceable = stableMergeSupportLockActive ? null : findReplaceableNonSoloGroup();
      if (replaceable) retireGroup(replaceable, 'fallback_melody_turnover');
      effectivePacingCaps.responseMode = 'group';
      effectivePacingCaps.maxComposerGroups = Math.max(1, Math.trunc(Number(effectivePacingCaps?.maxComposerGroups) || 0));
      effectivePacingCaps.maxComposerGroupSize = Math.max(1, Math.trunc(Number(effectivePacingCaps?.maxComposerGroupSize) || 1));
      effectivePacingCaps.maxComposerPerformers = Math.max(1, Math.trunc(Number(effectivePacingCaps?.maxComposerPerformers) || 1));
    }
    if (fullTextureAnswerRecoveryFloorRequested) {
      const replaceable = findReplaceableNonSoloGroup();
      if (replaceable) retireGroup(replaceable, 'full_texture_answer_ornament_turnover');
      effectivePacingCaps.responseMode = 'group';
      effectivePacingCaps.maxComposerGroups = Math.max(4, Math.trunc(Number(effectivePacingCaps?.maxComposerGroups) || 0));
      effectivePacingCaps.maxComposerGroupSize = Math.max(1, Math.trunc(Number(effectivePacingCaps?.maxComposerGroupSize) || 1));
      effectivePacingCaps.maxComposerPerformers = Math.max(1, Math.trunc(Number(effectivePacingCaps?.maxComposerPerformers) || 1));
    }
  }
  if (introRhythmOnlyWindow || introSoftRampWindow) {
    const allowedIntroRhythmCarriers = introRhythmOnlyWindow
      ? 1
      : (pulseCarrierReadyForBackbeat ? 2 : 1);
    const activeIntroRhythmCarriers = composerEnemyGroups
      .filter((group) => (
        group
        && group.active
        && !group.retiring
        && isIntroRhythmStageCarrier(group)
      ))
      .sort((a, b) => Math.trunc(Number(a?.id) || 0) - Math.trunc(Number(b?.id) || 0));
    for (let i = allowedIntroRhythmCarriers; i < activeIntroRhythmCarriers.length; i++) {
      retireGroup(activeIntroRhythmCarriers[i], 'intro_stage_overflow');
    }
  }
  if (!introWindowActive) {
    const postIntroGroupFloor = currentBarIndex >= 16 ? 4 : 3;
    effectivePacingCaps.maxComposerGroups = Math.max(
      postIntroGroupFloor,
      Math.trunc(Number(effectivePacingCaps?.maxComposerGroups) || 0)
    );
    effectivePacingCaps.maxComposerGroupSize = Math.max(
      1,
      Math.trunc(Number(effectivePacingCaps?.maxComposerGroupSize) || 1)
    );
    effectivePacingCaps.maxComposerPerformers = Math.max(
      Math.min(postIntroGroupFloor, 2),
      Math.trunc(Number(effectivePacingCaps?.maxComposerPerformers) || 0)
    );
    effectivePacingCaps.responseMode = 'group';
  }
  if (leadEntryMergeActive) {
    effectivePacingCaps.maxComposerGroups = Math.max(3, Math.trunc(Number(effectivePacingCaps?.maxComposerGroups) || 0));
    effectivePacingCaps.maxComposerGroupSize = Math.max(2, Math.trunc(Number(effectivePacingCaps?.maxComposerGroupSize) || 0));
    effectivePacingCaps.maxComposerPerformers = Math.max(2, Math.trunc(Number(effectivePacingCaps?.maxComposerPerformers) || 0));
  }
  if (fullTextureActive) {
    const fullTexturePhaseVariant = String(musicModeRuntime?.phaseVariant || 'default').trim().toLowerCase();
    effectivePacingCaps.maxComposerGroups = Math.min(
      Math.max(2, Math.trunc(Number(effectivePacingCaps?.maxComposerGroups) || 0)),
      fullTexturePhaseVariant === 'no_ornament' ? 2 : 3
    );
    effectivePacingCaps.maxComposerPerformers = Math.min(
      Math.max(1, Math.trunc(Number(effectivePacingCaps?.maxComposerPerformers) || 0)),
      fullTexturePhaseVariant === 'no_ornament' ? 1 : 2
    );
    if (fullTexturePhaseVariant !== 'no_ornament') {
      effectivePacingCaps.maxComposerGroups = Math.min(
        Math.max(2, Math.trunc(Number(effectivePacingCaps?.maxComposerGroups) || 0)),
        3
      );
      effectivePacingCaps.maxComposerPerformers = Math.min(
        Math.max(1, Math.trunc(Number(effectivePacingCaps?.maxComposerPerformers) || 0)),
        1
      );
    }
  }
  const getActiveEmbodiedSecondaryLoopBridgeGroup = () => composerEnemyGroups.find((group) => {
    if (!group || group.active !== true || group.retiring) return false;
    if (String(group?.sectionKey || '').trim().toLowerCase() !== String(runtimeSectionKey || '').trim().toLowerCase()) return false;
    if (String(group?.musicLaneId || '').trim().toLowerCase() !== 'secondary_loop_lane') return false;
    if (String(group?.callResponseLane || '').trim().toLowerCase() === 'response') return false;
    const profileSourceType = normalizeComposerProfileSourceType(group?.musicProfileSourceType);
    return profileSourceType === 'secondary_bridge_backbeat'
      || String(group?.templateId || '').trim().toLowerCase() === 'secondary_loop_bridge_group';
  }) || null;
  const getActiveEmbodiedSecondaryLoopCoverageCount = () => composerEnemyGroups.filter((group) => {
    if (!group || group.active !== true || group.retiring) return false;
    if (String(group?.sectionKey || '').trim().toLowerCase() !== String(runtimeSectionKey || '').trim().toLowerCase()) return false;
    if (String(group?.musicLaneId || '').trim().toLowerCase() !== 'secondary_loop_lane') return false;
    if (String(group?.callResponseLane || '').trim().toLowerCase() === 'response') return false;
    return getAliveComposerEnemiesByIds(group?.memberIds).length > 0;
  }).length;
  if (getActiveEmbodiedSecondaryLoopCoverageCount() > 0) {
    refreshSecondaryLoopReservation(
      getActiveEmbodiedSecondaryLoopBridgeGroup()
      || composerEnemyGroups.find((group) => (
        group
        && group.active === true
        && !group.retiring
        && String(group?.sectionKey || '').trim().toLowerCase() === String(runtimeSectionKey || '').trim().toLowerCase()
        && String(group?.musicLaneId || '').trim().toLowerCase() === 'secondary_loop_lane'
        && String(group?.callResponseLane || '').trim().toLowerCase() !== 'response'
      ))
      || null
    );
  }
  const getActiveEmbodiedPrimaryLeadGroup = () => composerEnemyGroups
    .filter((group) => isActivePrimaryLeadIntentGroup(group))
    .filter((group) => (
      String(group?.sectionKey || '').trim().toLowerCase() === String(runtimeSectionKey || '').trim().toLowerCase()
      && getAliveComposerEnemiesByIds(group?.memberIds).length > 0
    ))
    .sort((a, b) => {
      const aCanonical = Math.trunc(Number(a?.id) || 0) === Math.max(0, Math.trunc(Number(leadAuthorityRuntime?.canonicalGroupId) || 0)) ? 1 : 0;
      const bCanonical = Math.trunc(Number(b?.id) || 0) === Math.max(0, Math.trunc(Number(leadAuthorityRuntime?.canonicalGroupId) || 0)) ? 1 : 0;
      if (aCanonical !== bCanonical) return bCanonical - aCanonical;
      return rankPrimaryLeadGroup(b) - rankPrimaryLeadGroup(a);
    })[0] || null;
  if (getActiveEmbodiedPrimaryLeadGroup()) {
    const embodiedPrimaryLead = getActiveEmbodiedPrimaryLeadGroup();
    refreshPrimaryLeadReservation(embodiedPrimaryLead);
    syncLeadAuthorityFromGroup(embodiedPrimaryLead, 'maintenance_embodied_lead');
  }
  const ensureStrongPrimaryLeadGroup = () => {
    if (!leadEntryMergeActive && !fullTextureActive) return;
    const targetGroup = getActiveEmbodiedPrimaryLeadGroup()
      || composerEnemyGroups
        .filter((group) => (
          group
          && group.active === true
          && !group.retiring
          && Math.trunc(Number(group?.id) || 0) === Math.max(0, Math.trunc(Number(leadAuthorityRuntime?.canonicalGroupId) || 0))
        ))
        .sort((a, b) => rankPrimaryLeadGroup(b) - rankPrimaryLeadGroup(a))[0]
      || composerEnemyGroups
        .filter((group) => (
          group
          && group.active === true
          && !group.retiring
          && String(group?.sectionKey || '').trim().toLowerCase() === String(runtimeSectionKey || '').trim().toLowerCase()
          && String(group?.musicLaneId || '').trim().toLowerCase() === 'primary_loop_lane'
          && String(group?.callResponseLane || '').trim().toLowerCase() !== 'response'
        ))
        .sort((a, b) => rankPrimaryLeadGroup(b) - rankPrimaryLeadGroup(a))[0]
      || null;
    if (!targetGroup) return;
    targetGroup.active = true;
    targetGroup.retiring = false;
    targetGroup.lifecycleState = 'active';
    targetGroup.musicParticipationGain = 1;
    targetGroup.size = Math.max(2, Math.trunc(Number(targetGroup?.size) || 0));
    targetGroup.performers = Math.max(2, Math.trunc(Number(targetGroup?.performers) || 0));
    targetGroup.__bsPrimaryLeadSeenBarIndex = currentBarIndex;
    targetGroup.__bsPrimaryLeadPersistUntilBar = Math.max(
      Math.max(-1, Math.trunc(Number(targetGroup?.__bsPrimaryLeadPersistUntilBar) || -1)),
      currentBarIndex + (fullTextureActive ? 6 : 4)
    );
    refreshPrimaryLeadReservation(targetGroup);
    syncLeadAuthorityFromGroup(targetGroup, 'maintenance_lead_bias');
    const aliveCount = getAliveComposerEnemiesByIds(targetGroup?.memberIds).length;
    const refillNeeded = Math.max(0, Math.trunc(Number(targetGroup?.size) || 0) - aliveCount);
    if (refillNeeded > 0) {
      try {
        helpers.spawnComposerGroupOffscreenMembers?.(targetGroup, refillNeeded);
      } catch {}
    }
    try {
      noteMusicSystemEvent?.('music_composer_group_state', {
        phase: 'primary_lead_continuity_bias',
        groupId: Math.trunc(Number(targetGroup?.id) || 0),
        reason: 'protect_and_refill_primary_lead',
        musicLaneId: String(targetGroup?.musicLaneId || '').trim().toLowerCase(),
        stage: String(targetGroup?.musicProfileSourceType || '').trim().toLowerCase(),
        size: Math.max(0, Math.trunc(Number(targetGroup?.size) || 0)),
        performers: Math.max(0, Math.trunc(Number(targetGroup?.performers) || 0)),
        refillNeeded,
        fullTextureActive,
        leadEntryMergeActive,
      }, {
        beatIndex: Math.max(0, Math.trunc(Number(currentBeatIndex) || 0)),
        barIndex: currentBarIndex,
      });
    } catch {}
  };
  const ensureStrongLeadSecondaryBridgeGroup = () => {
    const mergeVariant = String(musicModeRuntime?.phaseVariant || 'default').trim().toLowerCase();
    if (
      (!leadEntryMergeActive && !fullTextureSupportLockActive)
      || (leadEntryMergeActive && mergeVariant !== 'reduced_support' && !stableMergeSupportLockActive)
    ) return;
    const targetGroup = getActiveEmbodiedSecondaryLoopBridgeGroup()
      || composerEnemyGroups.find((group) => (
        group
        && group.active === true
        && !group.retiring
        && String(group?.sectionKey || '').trim().toLowerCase() === String(runtimeSectionKey || '').trim().toLowerCase()
        && String(group?.musicLaneId || '').trim().toLowerCase() === 'secondary_loop_lane'
        && String(group?.callResponseLane || '').trim().toLowerCase() !== 'response'
      ))
      || null;
    if (!targetGroup) return;
    targetGroup.retiring = false;
    targetGroup.lifecycleState = 'active';
    targetGroup.musicParticipationGain = 1;
    targetGroup.size = Math.max(2, Math.trunc(Number(targetGroup?.size) || 0));
    targetGroup.performers = Math.max(2, Math.trunc(Number(targetGroup?.performers) || 0));
    targetGroup.__bsSecondaryCoverageSeenBarIndex = currentBarIndex;
    if (stableMergeSupportLockActive || fullTextureSupportLockActive) {
      targetGroup.__bsLeadMergeSecondaryPersistUntilBar = Math.max(
        Math.max(-1, Math.trunc(Number(targetGroup?.__bsLeadMergeSecondaryPersistUntilBar) || -1)),
        currentBarIndex + 4
      );
    }
    refreshSecondaryLoopReservation(targetGroup);
    const aliveCount = getAliveComposerEnemiesByIds(targetGroup?.memberIds).length;
    const refillNeeded = Math.max(0, Math.trunc(Number(targetGroup?.size) || 0) - aliveCount);
    if (refillNeeded > 0) {
      try {
        helpers.spawnComposerGroupOffscreenMembers?.(targetGroup, refillNeeded);
      } catch {}
    }
    try {
      noteMusicSystemEvent?.('music_composer_group_state', {
        phase: 'lead_merge_secondary_support_bias',
        groupId: Math.trunc(Number(targetGroup?.id) || 0),
        reason: 'protect_and_refill_secondary_loop_during_reduced_support',
        musicLaneId: String(targetGroup?.musicLaneId || '').trim().toLowerCase(),
        stage: String(targetGroup?.musicProfileSourceType || '').trim().toLowerCase(),
        size: Math.max(0, Math.trunc(Number(targetGroup?.size) || 0)),
        performers: Math.max(0, Math.trunc(Number(targetGroup?.performers) || 0)),
        refillNeeded,
        leadMergeStableBars,
        stableMergeSupportLockActive,
      }, {
        beatIndex: Math.max(0, Math.trunc(Number(currentBeatIndex) || 0)),
        barIndex: currentBarIndex,
      });
    } catch {}
  };
  const ensureStrongAnswerOrnamentGroup = () => {
    if (!fullTextureAnswerOrnamentLockActive) return;
    const targetGroup = composerEnemyGroups.find((group) => (
      group
      && group.active === true
      && !group.retiring
      && String(group?.sectionKey || '').trim().toLowerCase() === String(runtimeSectionKey || '').trim().toLowerCase()
      && String(group?.callResponseLane || '').trim().toLowerCase() === 'response'
      && normalizeComposerProfileSourceType(group?.musicProfileSourceType) === 'answer_ornament'
    )) || null;
    if (!targetGroup) return;
    targetGroup.retiring = false;
    targetGroup.lifecycleState = 'active';
    targetGroup.musicParticipationGain = 1;
    targetGroup.size = Math.max(1, Math.trunc(Number(targetGroup?.size) || 0));
    targetGroup.performers = Math.max(1, Math.trunc(Number(targetGroup?.performers) || 0));
    targetGroup.__bsAnswerOrnamentSeenBarIndex = currentBarIndex;
    targetGroup.__bsFullTextureAnswerOrnamentPersistUntilBar = Math.max(
      Math.max(-1, Math.trunc(Number(targetGroup?.__bsFullTextureAnswerOrnamentPersistUntilBar) || -1)),
      currentBarIndex + (degradedFullTextureNoOrnamentActive ? 6 : 4)
    );
    refreshAnswerOrnamentReservation(targetGroup);
    const aliveCount = getAliveComposerEnemiesByIds(targetGroup?.memberIds).length;
    const refillNeeded = Math.max(0, Math.trunc(Number(targetGroup?.size) || 0) - aliveCount);
    if (refillNeeded > 0) {
      helpers.spawnComposerGroupOffscreenMembers?.(targetGroup, refillNeeded);
    }
    try {
      noteMusicSystemEvent?.('music_composer_group_state', {
        phase: 'full_texture_answer_ornament_bias',
        groupId: Math.trunc(Number(targetGroup?.id) || 0),
        reason: 'full_texture_answer_ornament_lock',
        musicLaneId: String(targetGroup?.musicLaneId || '').trim().toLowerCase(),
        callResponseLane: String(targetGroup?.callResponseLane || '').trim().toLowerCase(),
        stage: String(targetGroup?.musicProfileSourceType || '').trim().toLowerCase(),
        instrumentId: String(targetGroup?.instrumentId || targetGroup?.instrument || '').trim(),
        degradedFullTextureNoOrnamentActive,
        renewableLock: fullTextureAnswerOrnamentRecovering,
      }, {
        beatIndex: Math.max(0, Math.trunc(Number(currentBeatIndex) || 0)),
        barIndex: currentBarIndex,
      });
    } catch {}
  };
  ensureStrongPrimaryLeadGroup();
  ensureStrongLeadSecondaryBridgeGroup();
  ensureStrongAnswerOrnamentGroup();
  withPerfSample('maintainComposerGroups.lifecycle', () => {
    helpers.maintainComposerEnemyGroupsLifecycle?.({
      enabled: !!constants.composerGroupsEnabled && !!composerRuntime.enabled,
      composerEnemyGroups,
      pacingCaps: effectivePacingCaps,
      composer,
      composerRuntime,
      introStage,
      sessionAgeBars,
      introStateAgeBars,
      currentBarIndex,
      directorLanePlan,
      musicModeRuntime,
      leadAuthorityRuntime,
      motifScopeKey,
      retireGroup,
      getAliveIdsForGroup: (group) => new Set(
        getAliveComposerEnemiesByIds(group?.memberIds)
          .map((e) => Math.trunc(Number(e?.id) || 0))
          .filter((id) => id > 0)
      ),
      spawnComposerGroupOffscreenMembers: helpers.spawnComposerGroupOffscreenMembers,
      pickTemplate: (groupIndex) => {
        if (introComposerLockActive) return null;
        if (introRhythmOnlyWindow && forcedIntroRhythmTemplate) {
          return forcedIntroRhythmTemplate;
        }
        if (fallbackMelodyCoverageRequested && getActiveMelodyCoverageCount() === 0) {
          return defaultLeadTemplate;
        }
        const desiredLane = getDesiredComposerLane(groupIndex);
        const laneMatchedTemplates = templateLibrary.filter((template) => {
          const lane = helpers.normalizeCallResponseLane?.(template?.callResponseLane || '', '') || String(template?.callResponseLane || '').trim().toLowerCase();
          if (lane !== desiredLane) return false;
          const templateId = String(template?.id || '').trim();
          const role = helpers.normalizeSwarmRole?.(template?.role || '', constants.leadRole) || '';
          const coverage = getActiveComposerLaneCoverage();
          if (desiredLane === 'response') return templateId !== 'foundation-buffer' && role !== constants.bassRole;
          if (!coverage.hasNonBassCall) return templateId !== 'foundation-buffer' && role !== constants.bassRole;
          return true;
        });
        const templatePool = laneMatchedTemplates.length
          ? laneMatchedTemplates
          : (
            desiredLane === 'response' && defaultResponseTemplate
              ? [defaultResponseTemplate]
              : (() => {
                  const nonBassCallTemplates = templateLibrary.filter((template) => {
                    const lane = helpers.normalizeCallResponseLane?.(template?.callResponseLane || '', '') || String(template?.callResponseLane || '').trim().toLowerCase();
                    const templateId = String(template?.id || '').trim().toLowerCase();
                    const role = helpers.normalizeSwarmRole?.(template?.role || '', constants.leadRole) || '';
                    return lane !== 'response'
                      && templateId !== 'foundation-buffer'
                      && role !== constants.bassRole;
                  });
                  if (protectedMergeTextureActive && desiredLane !== 'response' && nonBassCallTemplates.length) {
                    return nonBassCallTemplates;
                  }
                  if (!getActiveComposerLaneCoverage().hasNonBassCall && defaultCallTemplate) {
                    return [defaultCallTemplate];
                  }
                  return templateLibrary;
                })()
          );
        return helpers.pickComposerGroupTemplate?.({
          templates: templatePool,
          groupIndex,
          energyState: helpers.getCurrentSwarmEnergyStateName?.(),
          normalizeRole: (roleName) => helpers.normalizeSwarmRole?.(roleName, constants.leadRole),
          bassRole: constants.bassRole,
          fullThreat: constants.fullThreat,
        });
      },
      getComposerMotif: helpers.getComposerMotif,
      createComposerEnemyGroupProfile: helpers.createComposerEnemyGroupProfile,
      hasPendingSecondaryLoopReservation,
      noteMusicSystemEvent,
      createGroupFromMotif: ({ groupIndex, sectionKey, composer: composerDirective, templateId, motif, pacingCaps: caps, forcedProfileSourceType = '' }) => {
        return withPerfSample('maintainComposerGroups.createGroup', () => {
          const forcedProfile = String(forcedProfileSourceType || '').trim().toLowerCase();
          const forcedIntroProfile = isIntroSlotProfileSourceType(forcedProfile) ? forcedProfile : '';
          const forcedLeadProfile = forcedProfile === 'lead_melody';
          const forcedRhythmProfile = isGenericComposerRhythmProfile(forcedProfile) ? forcedProfile : '';
          const forcedSecondaryBridgeProfile = forcedRhythmProfile === 'secondary_bridge_backbeat';
          if (forcedSecondaryBridgeProfile && hasPendingSecondaryLoopReservation()) {
            return null;
          }
          const desiredLane = forcedRhythmProfile ? 'call' : getDesiredComposerLane(groupIndex);
          const coverage = getActiveComposerLaneCoverage();
          const forcedResponseTemplateId = desiredLane === 'response' && defaultResponseTemplate
            ? String(defaultResponseTemplate.id || '').trim()
            : '';
          const forcedCallTemplateId = desiredLane !== 'response' && !coverage.hasNonBassCall && defaultCallTemplate
            ? String(defaultCallTemplate.id || '').trim()
            : '';
          const requestedTemplateId = String(motif?.templateId || templateId || '').trim();
          const requestedTemplateRole = helpers.normalizeSwarmRole?.(
            templateById.get(requestedTemplateId)?.role || '',
            ''
          ) || '';
          let effectiveTemplateId = desiredLane === 'response'
            && (
              requestedTemplateId === 'foundation-buffer'
              || requestedTemplateRole === constants.bassRole
            )
            && forcedResponseTemplateId
            ? forcedResponseTemplateId
            : (
              desiredLane !== 'response'
              && !coverage.hasNonBassCall
              && (
                requestedTemplateId === 'foundation-buffer'
                || requestedTemplateRole === constants.bassRole
              )
              && forcedCallTemplateId
                ? forcedCallTemplateId
                : requestedTemplateId
            );
          if (
            stableMergeSupportLockActive
            && forcedRhythmProfile !== 'secondary_bridge_backbeat'
            && String(effectiveTemplateId || '').trim().toLowerCase() === 'foundation-buffer'
          ) {
            effectiveTemplateId = String(defaultCallTemplate?.id || effectiveTemplateId || '').trim();
          }
          if (forcedRhythmProfile) {
            const requestedLane = helpers.normalizeCallResponseLane?.(
              templateById.get(effectiveTemplateId)?.callResponseLane || '',
              ''
            ) || String(templateById.get(effectiveTemplateId)?.callResponseLane || '').trim().toLowerCase();
            if (requestedLane === 'response' || String(effectiveTemplateId || '').trim() === 'response_group') {
              effectiveTemplateId = String(defaultCallTemplate?.id || effectiveTemplateId || '').trim();
            }
          }
          const templateLane = helpers.normalizeCallResponseLane?.(
            templateById.get(effectiveTemplateId)?.callResponseLane || '',
            ''
          ) || '';
          const motifLane = helpers.normalizeCallResponseLane?.(motif?.callResponseLane || '', '') || '';
          const resolvedCallResponseLane = forcedRhythmProfile
            ? 'call'
            : (desiredLane === 'response'
            ? 'response'
            : (motifLane || templateLane || desiredLane));
          const templateRole = helpers.normalizeSwarmRole?.(
            templateById.get(effectiveTemplateId)?.role || '',
            ''
          );
          const role = templateRole || helpers.normalizeSwarmRole?.(motif?.role || 'lead', constants.leadRole);
          const activeIntroPulseCarrier = hasActiveIntroSlotCarrierProfile('spawner_rhythm_pulse');
          const activeIntroBackbeatCarrier = hasActiveIntroSlotCarrierProfile('spawner_rhythm_backbeat');
          const activePrimaryLoopCarrier = composerEnemyGroups.some((group) => (
            group
            && group.active === true
            && !group.retiring
            && String(group?.musicLaneId || '').trim().toLowerCase() === 'primary_loop_lane'
          )) || hasPendingPrimaryLeadReservation();
          const activePrimaryLoopMelodyCarrier = composerEnemyGroups.some((group) => (
            isActivePrimaryLeadIntentGroup(group)
          )) || hasPendingPrimaryLeadReservation();
          const liveEmbodiedAnswerOrnamentCarrier = composerEnemyGroups.some((group) => {
            if (!group || group.active !== true || group.retiring) return false;
            const normalizedProfileSourceType = normalizeComposerProfileSourceType(group?.musicProfileSourceType);
            if (normalizedProfileSourceType === 'answer_ornament') {
              const aliveCount = getAliveComposerEnemiesByIds(group?.memberIds).length;
              const persistUntilBar = Math.max(-1, Math.trunc(Number(group?.__bsFullTextureAnswerOrnamentPersistUntilBar) || -1));
              const seenBarIndex = Math.max(-1, Math.trunc(Number(group?.__bsAnswerOrnamentSeenBarIndex) || -1));
              return aliveCount > 0
                || persistUntilBar >= currentBarIndex
                || (seenBarIndex >= 0 && (currentBarIndex - seenBarIndex) <= 1);
            }
            const normalizedLane = helpers.normalizeCallResponseLane?.(group?.callResponseLane || '', 'call')
              || String(group?.callResponseLane || '').trim().toLowerCase()
              || 'call';
            return normalizedLane === 'response'
              && getAliveComposerEnemiesByIds(group?.memberIds).length > 0;
          });
          const activeAnswerOrnamentCarrier = degradedFullTextureNoOrnamentActive
            ? liveEmbodiedAnswerOrnamentCarrier
            : (liveEmbodiedAnswerOrnamentCarrier || hasPendingAnswerOrnamentReservation());
          const activeFoundationCarrier = composerEnemyGroups.some((group) => {
            if (!group || group.active !== true || group.retiring) return false;
            const laneId = String(group?.musicLaneId || '').trim().toLowerCase();
            if (laneId !== 'foundation_lane') return false;
            const templateId = String(group?.templateId || '').trim();
            if (templateId === 'foundation-buffer') return true;
            const groupRole = helpers.normalizeSwarmRole?.(
              group?.role || templateById.get(templateId)?.role || '',
              ''
            ) || '';
            return groupRole === constants.bassRole;
          });
          if (
            !forcedLeadProfile
            && !forcedIntroProfile
            && !forcedSecondaryBridgeProfile
            && activePrimaryLoopMelodyCarrier
            && desiredLane !== 'response'
            && role === constants.leadRole
          ) {
            try {
              noteMusicSystemEvent?.('music_composer_spawn_blocked', {
                reason: 'blocked_by_active_primary_lead',
                forcedProfileSourceType: forcedProfile,
                forcedSecondaryBridgeProfile,
                desiredLane,
                role,
                requestedTemplateId,
                effectiveTemplateId,
                activePrimaryLoopMelodyCarrier,
                sectionKey: String(sectionKey || '').trim().toLowerCase(),
                motifScopeKey: String(motifScopeKey || '').trim().toLowerCase(),
              }, {
                beatIndex: Math.max(0, Math.trunc(Number(currentBeatIndex) || 0)),
              });
            } catch {}
            return null;
          }
          const introBridgeFoundationHoldActive = !forcedIntroProfile
            && activeIntroPulseCarrier
            && (introRhythmOnlyWindow || introSoftRampWindow || currentBarIndex <= 14);
          const introBridgeBackbeatHoldActive = !forcedIntroProfile
            && activeIntroBackbeatCarrier
            && (introSoftRampWindow || currentBarIndex <= 14);
          const requestedGenericFoundationSolo = introBridgeFoundationHoldActive
            && desiredLane !== 'response'
            && role === constants.bassRole;
          const requestedGenericBackbeatSolo = introBridgeBackbeatHoldActive
            && desiredLane !== 'response'
            && String(templateId || effectiveTemplateId || '').trim() !== 'foundation-buffer'
            && role !== constants.bassRole
            && String(motif?.callResponseLane || templateLane || '').trim().toLowerCase() !== 'response';
          if (requestedGenericFoundationSolo || requestedGenericBackbeatSolo) return null;
          const forcedIntroCarrierActive = !!forcedIntroProfile;
          const introStageSoloRhythmActive = (
            forcedIntroCarrierActive
            || (introRhythmOnlyWindow || introSoftRampWindow)
          );
          const groupedMelodyRequested = forcedLeadProfile || (
            fallbackMelodyCoverageRequested
            && getActiveMelodyCoverageCount() === 0
          );
          const fallbackSoloCarrierType = (
            fallbackRhythmCoverageRequested
            && getActiveRhythmCoverageCount() === 0
          )
            ? 'rhythm'
            : '';
          const soloCarrierType = introStageSoloRhythmActive
            ? 'rhythm'
            : (spawnWantsSoloRhythm
              ? 'rhythm'
              : fallbackSoloCarrierType);
          const melodyCarrierRequested = false;
          const leadCarrierAlreadyActive = (
            forcedLeadProfile
            || melodyCarrierRequested
            || groupedMelodyRequested
          ) && activePrimaryLoopMelodyCarrier;
          if (forcedLeadProfile || groupedMelodyRequested) {
            try {
              noteMusicSystemEvent('music_primary_lead_request', {
                phase: leadCarrierAlreadyActive ? 'blocked_existing_coverage' : 'requested',
                forcedProfileSourceType: forcedProfile,
                groupedMelodyRequested,
                desiredLane,
                activePrimaryLoopCarrier,
                activePrimaryLoopMelodyCarrier,
                activeMelodyCoverageCount: getActiveMelodyCoverageCount(),
                activeRhythmCoverageCount: getActiveRhythmCoverageCount(),
                fallbackMelodyCoverageRequested,
                sectionKey: String(sectionKey || '').trim().toLowerCase(),
                motifScopeKey: String(motifScopeKey || '').trim().toLowerCase(),
              });
            } catch {}
          }
          if (leadCarrierAlreadyActive) {
            return null;
          }
          if (melodyCarrierRequested || groupedMelodyRequested) {
            const effectiveTemplateRole = helpers.normalizeSwarmRole?.(
              templateById.get(effectiveTemplateId)?.role || requestedTemplateRole || '',
              ''
            ) || '';
            if (
              effectiveTemplateRole === constants.bassRole
              || String(effectiveTemplateId || '').trim() === 'foundation-buffer'
            ) {
              effectiveTemplateId = String(defaultLeadTemplate?.id || defaultCallTemplate?.id || effectiveTemplateId || '').trim();
            }
          }
          const earlyIntroVisualLockActive = !forcedIntroProfile
            && activeIntroPulseCarrier
            && (introRhythmOnlyWindow || introSoftRampWindow || currentBarIndex <= 14);
          const soloCarrierActive = !!soloCarrierType;
          const introRhythmProfileSourceType = (() => {
            if (!introStageSoloRhythmActive) return '';
            const forcedProfile = forcedIntroProfile;
            if (forcedProfile) return forcedProfile;
            const allowedProfiles = introRhythmOnlyWindow
              ? ['spawner_rhythm_pulse']
              : (pulseCarrierReadyForBackbeat
                ? ['spawner_rhythm_pulse', 'spawner_rhythm_backbeat']
                : ['spawner_rhythm_pulse']);
            const activeProfiles = new Set(
              composerEnemyGroups
                .filter((group) => (
                  group
                  && group.active
                  && !group.retiring
                  && isIntroRhythmStageCarrier(group)
                ))
                .map((group) => getIntroSlotProfileSourceType(group))
                .filter(Boolean)
            );
            return allowedProfiles.find((profileId) => !activeProfiles.has(profileId)) || '';
          })();
          const introSecondaryRhythmLaneId = getSoloRhythmPreferredLaneId(introRhythmProfileSourceType);
          const introSecondaryRhythmCarrierActive = introRhythmProfileSourceType === 'spawner_rhythm_backbeat';
          if (introStageSoloRhythmActive && !introRhythmProfileSourceType) return null;
          if (
            earlyIntroVisualLockActive
            && !introStageSoloRhythmActive
            && (
              activePrimaryLoopCarrier
            )
          ) {
            return null;
          }
          const introRhythmCarrierBodyType = introStageSoloRhythmActive
            ? chooseComposerBodyTypeForMusicLane(
                introSecondaryRhythmLaneId,
                getPreferredCarrierForMusicLaneId(introSecondaryRhythmLaneId),
                'group'
              )
            : '';
          const introRhythmUsesGroupBody = introStageSoloRhythmActive && introRhythmCarrierBodyType === 'group';
          const suppressEarlyFallbackRhythmSoloVisual = currentBarIndex < 20
            && soloCarrierType === 'rhythm'
            && !introStageSoloRhythmActive
            && !spawnWantsSoloRhythm;
          const visualSoloCarrierType = (introRhythmUsesGroupBody || suppressEarlyFallbackRhythmSoloVisual) ? '' : soloCarrierType;
          const visualSoloCarrierActive = !!visualSoloCarrierType;
          const earlySoloHandoffClampActive = currentBarIndex < 20;
          if (earlySoloHandoffClampActive && visualSoloCarrierActive && getActiveVisibleNonFoundationSoloCount() >= 1) {
            return null;
          }
          const sharedProfileSourceType = forcedRhythmProfile || (
            soloCarrierType === 'rhythm'
              ? (introRhythmProfileSourceType || 'rhythm_lane')
              : (groupedMelodyRequested ? 'lead_melody' : '')
          );
          const responseGroupRequested = !forcedIntroProfile
            && !forcedLeadProfile
            && !soloCarrierType
            && resolvedCallResponseLane === 'response';
          if (responseGroupRequested && activeAnswerOrnamentCarrier) {
            return null;
          }
          const foundationGroupRequested = !forcedIntroProfile
            && !forcedLeadProfile
            && !soloCarrierType
            && resolvedCallResponseLane !== 'response'
            && role === constants.bassRole;
          if (foundationGroupRequested && activeFoundationCarrier) {
            return null;
          }
          const sharedSoloProfile = sharedProfileSourceType
            ? getSharedCarrierMusicProfile(sharedProfileSourceType, {
                instrumentInfluence: motif?.instrumentInfluence || motif?.musicPaletteOverride,
                sectionId: composerDirective?.sectionId,
                energyState: currentEnergyStateName,
              })
            : null;
          const introPercussionCarrierActive = introRhythmOnlyWindow && !soloCarrierActive;
          if (introPercussionCarrierActive) effectiveTemplateId = 'intro_percussion_group';
          const soloLaneId = soloCarrierType === 'rhythm'
            ? getSoloRhythmPreferredLaneId(sharedProfileSourceType)
            : (groupedMelodyRequested ? 'primary_loop_lane' : '');
          const resolvedCarrierLaneId = introPercussionCarrierActive
            ? 'secondary_loop_lane'
            : (responseGroupRequested
              ? 'secondary_loop_lane'
              : (sharedSoloProfile?.musicLaneId || soloLaneId));
          const resolvedComposerBodyType = soloCarrierActive
            ? chooseComposerBodyTypeForMusicLane(
                resolvedCarrierLaneId,
                getPreferredCarrierForMusicLaneId(resolvedCarrierLaneId),
                'solo'
              )
            : 'group';
          const groupRhythmCarrierActive = soloCarrierType === 'rhythm'
            && resolvedComposerBodyType === 'group'
            && !introStageSoloRhythmActive;
          const effectiveVisualSoloCarrierType = ((resolvedComposerBodyType === 'group' && !introStageSoloRhythmActive)
            ? ''
            : visualSoloCarrierType);
          const effectiveVisualSoloCarrierActive = !!effectiveVisualSoloCarrierType;
          const groupRhythmPattern = groupRhythmCarrierActive
            ? (
              resolvedCarrierLaneId === 'foundation_lane'
                ? [true, false, false, false, true, false, false, false]
                : (resolvedCarrierLaneId === 'sparkle_lane'
                  ? [false, true, false, true, false, true, false, true]
                  : [false, false, true, false, false, false, true, false])
            )
            : null;
          const leadIdentityRequested = (melodyCarrierRequested || groupedMelodyRequested)
            && soloCarrierType !== 'rhythm'
            && !introPercussionCarrierActive;
          const leadSoloBodyType = leadIdentityRequested
            ? chooseComposerBodyTypeForMusicLane(
                resolvedCarrierLaneId || 'primary_loop_lane',
                getPreferredCarrierForMusicLaneId(resolvedCarrierLaneId || 'primary_loop_lane'),
                'solo'
              )
            : '';
          const leadSoloCarrierActive = leadIdentityRequested && leadSoloBodyType !== 'group';
          const forcedVisualIdentity = introSecondaryRhythmCarrierActive
            ? {
                roleLane: 'accent',
                roleColor: '#9ad6ff',
                roleColorBright: '#dff4ff',
                roleColorDeep: '#3d7ea6',
                identityVisualLocked: true,
              }
            : null;
          const createdRole = introPercussionCarrierActive
            ? constants.accentRole || 'accent'
            : (responseGroupRequested
              ? constants.accentRole || 'accent'
              : (sharedSoloProfile?.role || (groupedMelodyRequested ? constants.leadRole : role)));
          const soloRhythmCarrierActive = soloCarrierType === 'rhythm';
          const responseCarrierProfile = (!forcedIntroProfile && !soloCarrierActive && resolvedCallResponseLane === 'response')
            ? getSharedCarrierMusicProfile(answerLanePreferredProfileSourceType, {
                instrumentInfluence: motif?.instrumentInfluence || motif?.musicPaletteOverride,
                sectionId: composerDirective?.sectionId,
                energyState: currentEnergyStateName,
                answerFamily: answerLaneResponseFamily,
                preferredLaneId: answerLanePreferredLaneId,
              })
            : null;
          const fallbackInstrument = introPercussionCarrierActive
            ? (
              helpers.getIdForDisplayName?.('Bass Tone 3')
              || helpers.getIdForDisplayName?.('Bass Tone 4')
              || 'tone'
            )
            : (
              createdRole === (constants.accentRole || 'accent')
                ? resolveAccentSupportInstrumentId(
                    responseGroupRequested
                      ? responseCarrierProfile?.instrumentId
                      : sharedSoloProfile?.instrumentId,
                    helpers.resolveSwarmSoundInstrumentId?.('projectile') || 'tone'
                  )
                : (
                  motif?.instrument
                  || helpers.resolveSwarmRoleInstrumentId?.(createdRole, helpers.resolveSwarmSoundInstrumentId?.('projectile') || 'tone')
                  || helpers.resolveSwarmSoundInstrumentId?.('projectile')
                  || 'tone'
                )
            );
          const melodyInstrumentPreferred = leadIdentityRequested
            ? (
              sharedSoloProfile?.instrumentId
              || motif?.instrument
              || helpers.resolveSwarmRoleInstrumentId?.(constants.leadRole, helpers.resolveSwarmSoundInstrumentId?.('projectile') || 'tone')
            )
            : '';
          const instrumentId = sanitizeEnemyMusicInstrumentId(
            introPercussionCarrierActive
              ? fallbackInstrument
              : (
                leadIdentityRequested
                  ? (melodyInstrumentPreferred || sharedSoloProfile?.instrumentId || motif?.instrument)
                  : (
                    createdRole === (constants.accentRole || 'accent')
                      ? resolveAccentSupportInstrumentId(
                          responseGroupRequested
                            ? responseCarrierProfile?.instrumentId
                            : sharedSoloProfile?.instrumentId,
                          fallbackInstrument
                        )
                      : (sharedSoloProfile?.instrumentId || motif?.instrument)
                  )
              ),
            fallbackInstrument,
            { role: leadIdentityRequested ? constants.leadRole : createdRole, toyKey: introPercussionCarrierActive ? 'loopgrid-drum' : undefined }
          );
          const created = ({
            id: helpers.getNextComposerEnemyGroupId?.(),
            sectionKey,
            sectionId: String(composerDirective?.sectionId || 'default'),
            templateId: (introRhythmUsesGroupBody || (soloCarrierActive && resolvedComposerBodyType === 'group'))
              ? effectiveTemplateId
              : (leadSoloCarrierActive
                ? 'solo-melody-carrier'
                : (effectiveVisualSoloCarrierActive ? `solo-${effectiveVisualSoloCarrierType}-carrier` : effectiveTemplateId)),
            role: responseCarrierProfile?.role || createdRole,
            musicLaneId: responseCarrierProfile?.musicLaneId || resolvedCarrierLaneId,
            musicLaneLayer: introPercussionCarrierActive
              ? 'loops'
              : (
                responseCarrierProfile?.musicLaneLayer
                || sharedSoloProfile?.musicLaneLayer
                || (soloCarrierType === 'rhythm' ? 'loops' : (groupedMelodyRequested ? 'loops' : ''))
              ),
            callResponseLane: groupRhythmCarrierActive
              ? (sharedSoloProfile?.callResponseLane || 'call')
              : (soloCarrierType === 'rhythm'
                ? (sharedSoloProfile?.callResponseLane || (introStageSoloRhythmActive ? 'call' : 'solo'))
                : (groupedMelodyRequested
                  ? (sharedSoloProfile?.callResponseLane || 'call')
                  : (introPercussionCarrierActive ? 'call' : (responseCarrierProfile?.callResponseLane || resolvedCallResponseLane)))),
            shape: (
              normalizeComposerProfileSourceType(sharedProfileSourceType) === 'lead_melody'
              || normalizeComposerProfileSourceType(responseCarrierProfile?.musicProfileSourceType || responseCarrierProfile?.profileSourceType || '') === 'lead_melody'
              || leadIdentityRequested
            )
              ? 'diamond'
              : (introRhythmUsesGroupBody
              ? String(motif?.shape || helpers.pickComposerGroupShape?.({ shapes: constants.composerGroupShapes, index: groupIndex }))
              : (soloCarrierActive
              ? (soloCarrierType === 'rhythm' ? 'square' : 'diamond')
              : String(motif?.shape || helpers.pickComposerGroupShape?.({ shapes: constants.composerGroupShapes, index: groupIndex })))),
            color: soloCarrierActive
              ? (soloCarrierType === 'rhythm'
                ? (normalizeComposerProfileSourceType(sharedProfileSourceType) === 'spawner_rhythm_backbeat'
                  ? '#9ad6ff'
                  : (normalizeComposerProfileSourceType(sharedProfileSourceType) === 'spawner_rhythm_motion' ? '#c8ff9a' : '#ffd29a'))
                : '#ffe7a6')
              : (
                (
                  normalizeComposerProfileSourceType(sharedProfileSourceType) === 'lead_melody'
                  || normalizeComposerProfileSourceType(responseCarrierProfile?.musicProfileSourceType || responseCarrierProfile?.profileSourceType || '') === 'lead_melody'
                  || leadIdentityRequested
                )
                  ? '#ffe7a6'
                  : String(motif?.color || helpers.pickComposerGroupColor?.({ colors: constants.composerGroupColors, index: groupIndex }))
              ),
            actionType: introPercussionCarrierActive
              ? 'explosion'
              : (groupRhythmCarrierActive
                ? 'explosion'
                : (
                  responseCarrierProfile?.actionType
                  || sharedSoloProfile?.actionType
                  || (soloCarrierType === 'rhythm' ? 'explosion' : String(motif?.actionType || 'projectile'))
                )),
            threatLevel: String(motif?.threatLevel || constants.fullThreat),
            introPercussionCarrier: introPercussionCarrierActive,
            performers: responseGroupRequested
              ? 1
              : (introRhythmUsesGroupBody || groupRhythmCarrierActive)
              ? 6
              : ((leadSoloCarrierActive || soloCarrierActive)
              ? 1
              : Math.max(
                1,
                Math.min(
                  Math.max(constants.composerGroupPerformersMin, Math.min(constants.composerGroupPerformersMax, Math.trunc(Number(motif?.performers) || 1))),
                  Math.max(1, caps?.maxComposerPerformers || constants.composerGroupPerformersMax)
                )
              )),
            size: responseGroupRequested
              ? 1
              : (introRhythmUsesGroupBody || groupRhythmCarrierActive)
              ? 6
              : ((leadSoloCarrierActive || soloCarrierActive)
              ? 1
              : Math.max(
                1,
                Math.min(
                  Math.max(constants.composerGroupSizeMin, Math.min(constants.composerGroupSizeMax, Math.trunc(Number(motif?.size) || constants.composerGroupSizeMin))),
                  Math.max(1, caps?.maxComposerGroupSize || constants.composerGroupSizeMax)
                )
              )),
            steps: groupRhythmCarrierActive && Array.isArray(groupRhythmPattern)
              ? groupRhythmPattern.slice(0, constants.weaponTuneSteps)
              : (Array.isArray(responseCarrierProfile?.steps) && responseCarrierProfile.steps.length)
                ? responseCarrierProfile.steps.slice(0, constants.weaponTuneSteps)
              : (soloCarrierActive
              ? (Array.isArray(sharedSoloProfile?.steps)
                ? sharedSoloProfile.steps.slice(0, constants.weaponTuneSteps)
                : (Array.isArray(motif?.steps)
                  ? motif.steps.slice(0, constants.weaponTuneSteps)
                  : Array.from({ length: constants.weaponTuneSteps }, () => Math.random() >= 0.5)))
              : (introPercussionCarrierActive
                ? [true, false, true, false, true, false, true, false]
              : (Array.isArray(motif?.steps)
                ? motif.steps.slice(0, constants.weaponTuneSteps)
                : Array.from({ length: constants.weaponTuneSteps }, () => Math.random() >= 0.5)))),
            rows: (Array.isArray(responseCarrierProfile?.rows) && responseCarrierProfile.rows.length)
              ? responseCarrierProfile.rows.slice(0, constants.weaponTuneSteps)
              : (soloCarrierActive && !groupRhythmCarrierActive && Array.isArray(sharedSoloProfile?.rows)
                ? sharedSoloProfile.rows.slice(0, constants.weaponTuneSteps)
                : undefined),
            motif: motif?.motif && typeof motif.motif === 'object'
              ? {
                id: String(motif.motif.id || `${templateId}-motif`),
                steps: Array.isArray(motif.motif.steps) ? motif.motif.steps.slice(0, constants.weaponTuneSteps) : [],
              }
              : {
                id: `${templateId}-motif`,
                steps: Array.isArray(motif?.steps) ? motif.steps.slice(0, constants.weaponTuneSteps) : [],
              },
            notes: (Array.isArray(responseCarrierProfile?.notes) && responseCarrierProfile.notes.length
              ? responseCarrierProfile.notes
              : (introPercussionCarrierActive
              ? ['C3']
              : (soloCarrierActive && Array.isArray(sharedSoloProfile?.notes) && sharedSoloProfile.notes.length
                ? sharedSoloProfile.notes
                : (Array.isArray(motif?.notes) && motif.notes.length ? motif.notes : [helpers.getRandomSwarmPentatonicNote?.()])))
              )
              .map((n, idx) => {
                const normalized = helpers.normalizeSwarmNoteName?.(n) || helpers.getRandomSwarmPentatonicNote?.();
                return introPercussionCarrierActive
                  ? normalized
                  : helpers.clampNoteToDirectorPool?.(normalized, groupIndex + idx);
              }),
            gravityNotes: (Array.isArray(motif?.gravityNotes) ? motif.gravityNotes : [])
              .map((n, idx) => helpers.clampNoteToDirectorPool?.(helpers.normalizeSwarmNoteName?.(n) || helpers.getRandomSwarmPentatonicNote?.(), groupIndex + idx))
              .filter(Boolean),
            phraseRoot: responseCarrierProfile?.phraseRoot
              ? helpers.clampNoteToDirectorPool?.(
                helpers.normalizeSwarmNoteName?.(responseCarrierProfile.phraseRoot) || helpers.getRandomSwarmPentatonicNote?.(),
                groupIndex
              )
              : (introPercussionCarrierActive
              ? 'C3'
              : helpers.clampNoteToDirectorPool?.(
                helpers.normalizeSwarmNoteName?.(sharedSoloProfile?.phraseRoot)
                  || (
                helpers.normalizeSwarmNoteName?.(motif?.phraseRoot)
                  || helpers.normalizeSwarmNoteName?.(Array.isArray(motif?.notes) ? motif.notes[0] : '')
                  || helpers.getRandomSwarmPentatonicNote?.()),
                groupIndex
              )),
            phraseFifth: responseCarrierProfile?.phraseFifth
              ? helpers.clampNoteToDirectorPool?.(
                helpers.normalizeSwarmNoteName?.(responseCarrierProfile.phraseFifth) || helpers.getRandomSwarmPentatonicNote?.(),
                groupIndex + 2
              )
              : (introPercussionCarrierActive
              ? 'C3'
              : helpers.clampNoteToDirectorPool?.(
                helpers.normalizeSwarmNoteName?.(sharedSoloProfile?.phraseFifth)
                  || (
                helpers.normalizeSwarmNoteName?.(motif?.phraseFifth)
                  || helpers.normalizeSwarmNoteName?.(Array.isArray(motif?.notes) ? motif.notes[Math.min(2, Math.max(0, motif.notes.length - 1))] : '')
                  || helpers.getRandomSwarmPentatonicNote?.()),
                groupIndex + 2
              )),
            resolutionTargets: ((Array.isArray(responseCarrierProfile?.resolutionTargets) && responseCarrierProfile.resolutionTargets.length)
              ? responseCarrierProfile.resolutionTargets
              : (soloCarrierActive && Array.isArray(sharedSoloProfile?.resolutionTargets) && sharedSoloProfile.resolutionTargets.length
              ? sharedSoloProfile.resolutionTargets
              : (Array.isArray(motif?.resolutionTargets) ? motif.resolutionTargets : [])))
              .map((n, idx) => helpers.clampNoteToDirectorPool?.(helpers.normalizeSwarmNoteName?.(n) || helpers.getRandomSwarmPentatonicNote?.(), groupIndex + idx + 3))
              .filter(Boolean),
            instrument: responseCarrierProfile?.instrumentId || instrumentId,
            instrumentId: responseCarrierProfile?.instrumentId || instrumentId,
            continuityId: forcedSecondaryBridgeProfile
              ? `secondary-bridge:${String(sectionKey || '').trim().toLowerCase() || 'default'}`
              : ((
                fullTextureActive
                && level1CounterRhythmEpochLocked
                && !responseGroupRequested
                && String(resolvedCarrierLaneId || '').trim().toLowerCase() === 'secondary_loop_lane'
              )
                ? getLevel1SecondaryLoopEpochContinuityId()
                : (String(motif?.continuityId || '') || helpers.getNextMusicContinuityId?.())),
            roleLane: forcedVisualIdentity?.roleLane || '',
            roleColor: forcedVisualIdentity?.roleColor || '',
            roleColorBright: forcedVisualIdentity?.roleColorBright || '',
            roleColorDeep: forcedVisualIdentity?.roleColorDeep || '',
            identityVisualLocked: forcedVisualIdentity?.identityVisualLocked === true,
            soloCarrierType: effectiveVisualSoloCarrierType,
            introCarrierBodyType: introStageSoloRhythmActive
              ? introRhythmCarrierBodyType
              : ((leadSoloCarrierActive && leadSoloBodyType)
                ? leadSoloBodyType
                : (soloCarrierActive ? resolvedComposerBodyType : '')),
            introStageCarrier: introStageSoloRhythmActive,
            musicProfileSourceType: responseGroupRequested ? 'answer_ornament' : (sharedProfileSourceType || ''),
            ...buildIntroSlotState({
              active: introStageSoloRhythmActive,
              profileSourceType: sharedProfileSourceType || '',
              role: createdRole || '',
              musicLaneId: sharedSoloProfile?.musicLaneId || soloLaneId || '',
              musicLaneLayer: sharedSoloProfile?.musicLaneLayer || (soloCarrierType === 'rhythm' ? 'loops' : ''),
              callResponseLane: sharedSoloProfile?.callResponseLane || 'call',
              instrumentId: instrumentId || '',
              actionType: sharedSoloProfile?.actionType || (soloCarrierType === 'rhythm' ? 'explosion' : String(motif?.actionType || 'projectile')),
              steps: sharedSoloProfile?.steps,
              rows: sharedSoloProfile?.rows,
              notes: sharedSoloProfile?.notes,
              noteIndices: sharedSoloProfile?.noteIndices,
              notePalette: sharedSoloProfile?.notePalette,
              phraseRoot: sharedSoloProfile?.phraseRoot || '',
              phraseFifth: sharedSoloProfile?.phraseFifth || '',
              resolutionTargets: sharedSoloProfile?.resolutionTargets,
              createdBarIndex: currentBarIndex,
              createdBeatIndex: currentBeatIndex,
              lockUntilBar: getIntroSlotLockUntilBar(),
            }),
            ...buildGroupRhythmState({
              active: groupRhythmCarrierActive,
              steps: groupRhythmPattern,
              role: createdRole || '',
              instrumentId: instrumentId || '',
              callResponseLane: 'call',
              musicLaneId: resolvedCarrierLaneId || '',
              musicLaneLayer: sharedSoloProfile?.musicLaneLayer || (resolvedCarrierLaneId === 'foundation_lane' ? 'foundation' : 'loops'),
              notes: sharedSoloProfile?.notes,
              phraseRoot: sharedSoloProfile?.phraseRoot || '',
              phraseFifth: sharedSoloProfile?.phraseFifth || '',
              resolutionTargets: sharedSoloProfile?.resolutionTargets,
            }),
            noteIndices: (soloCarrierActive && !groupRhythmCarrierActive && Array.isArray(sharedSoloProfile?.noteIndices))
              ? sharedSoloProfile.noteIndices.slice(0, constants.weaponTuneSteps)
              : undefined,
            notePalette: (soloCarrierActive && !groupRhythmCarrierActive && Array.isArray(sharedSoloProfile?.notePalette))
              ? sharedSoloProfile.notePalette.slice()
              : undefined,
            phraseState: null,
            noteToEnemyId: new Map(),
            memberIds: new Set(),
            noteCursor: 0,
            nextSpawnNoteIndex: 0,
            active: true,
            lifecycleState: 'active',
          });
          if (responseCarrierProfile) {
            created.musicProfileSourceType = 'answer_ornament';
            created.role = responseCarrierProfile.role || created.role;
            created.actionType = responseCarrierProfile.actionType || created.actionType;
            created.musicLaneId = responseCarrierProfile.musicLaneId || created.musicLaneId;
            created.musicLaneLayer = responseCarrierProfile.musicLaneLayer || created.musicLaneLayer || 'loops';
            created.callResponseLane = 'response';
            if (Array.isArray(responseCarrierProfile.steps) && responseCarrierProfile.steps.length) {
              created.steps = responseCarrierProfile.steps.slice(0, constants.weaponTuneSteps);
            }
            if (Array.isArray(responseCarrierProfile.rows)) {
              created.rows = responseCarrierProfile.rows.slice(0, constants.weaponTuneSteps);
            }
            if (Array.isArray(responseCarrierProfile.notes) && responseCarrierProfile.notes.length) {
              created.notes = responseCarrierProfile.notes.slice();
            }
            if (responseCarrierProfile.phraseRoot) created.phraseRoot = responseCarrierProfile.phraseRoot;
            if (responseCarrierProfile.phraseFifth) created.phraseFifth = responseCarrierProfile.phraseFifth;
            if (Array.isArray(responseCarrierProfile.resolutionTargets) && responseCarrierProfile.resolutionTargets.length) {
              created.resolutionTargets = responseCarrierProfile.resolutionTargets.slice();
            }
            if (responseCarrierProfile.instrumentId) {
              created.instrumentId = responseCarrierProfile.instrumentId;
              created.instrument = responseCarrierProfile.instrumentId;
            }
          }
          if (forcedSecondaryBridgeProfile) {
            created.templateId = 'secondary_loop_bridge_group';
            created.musicLaneId = 'secondary_loop_lane';
            created.musicLaneLayer = 'loops';
            created.musicProfileSourceType = 'secondary_bridge_backbeat';
            created.callResponseLane = 'call';
            created.performers = Math.max(2, Math.trunc(Number(created?.performers) || 0));
            created.size = Math.max(2, Math.trunc(Number(created?.size) || 0));
            created.musicParticipationGain = 1;
            try {
              refreshSecondaryLoopReservation(created);
              noteMusicSystemEvent?.('music_reserved_secondary_bridge_result', {
                sectionKey: String(sectionKey || '').trim().toLowerCase(),
                created: true,
                groupId: Math.trunc(Number(created?.id) || 0),
                templateId: String(created?.templateId || '').trim(),
                musicLaneId: String(created?.musicLaneId || '').trim().toLowerCase(),
                musicProfileSourceType: String(created?.musicProfileSourceType || '').trim().toLowerCase(),
                role: String(created?.role || '').trim().toLowerCase(),
                instrumentId: String(created?.instrumentId || created?.instrument || '').trim(),
              }, {
                beatIndex: Math.max(0, Math.trunc(Number(currentBeatIndex) || 0)),
              });
            } catch {}
          }
          enforceLevel1NoSparkleOnGroup(created);
          applyFormationRuntimeToGroup(created);
          syncGroupPrimaryNote(created);
          if (typeof helpers.noteIntroDebug === 'function' && currentBarIndex < 24 && soloCarrierType === 'rhythm') {
            helpers.noteIntroDebug('intro_rhythm_carrier_created', {
              groupId: Math.trunc(Number(created?.id) || 0),
              introStage,
              sessionAgeBars,
              slotProfile: sharedProfileSourceType,
              bodyType: String(created?.introCarrierBodyType || '').trim().toLowerCase(),
              musicLaneId: String(created?.musicLaneId || '').trim().toLowerCase(),
              musicLaneLayer: String(created?.musicLaneLayer || '').trim().toLowerCase(),
              instrumentId: String(created?.instrumentId || '').trim(),
              steps: Array.isArray(created?.steps) ? created.steps.map((v) => !!v) : [],
              notes: Array.isArray(created?.notes) ? created.notes.slice() : [],
              introStageCarrier: created?.introStageCarrier === true,
            });
          }
          enforceLevel1SecondaryLoopEpochIdentity(created);
          helpers.ensureMusicLaneAssignment?.({
            group: created,
            role: created.role,
            layer: created.musicLaneLayer || (created.role === constants.bassRole ? 'foundation' : 'loops'),
            preferredLaneId: created.musicLaneId || soloLaneId,
            instrumentId: created.instrumentId || instrumentId,
            continuityId: created.continuityId,
            phraseId: String(created?.motif?.id || ''),
            performerGroupId: Math.trunc(Number(created.id) || 0),
            performerType: 'composer-group',
            lockInstrument: true,
          });
          if (!forcedIntroProfile && !soloCarrierActive && !introPercussionCarrierActive) {
            const normalizedCreatedLaneId = String(created?.musicLaneId || '').trim().toLowerCase();
            if (created.callResponseLane === 'response') {
              created.musicProfileSourceType = 'answer_ornament';
            } else if (
              fullTextureActive
              && level1CounterRhythmEpochLocked
              && normalizedCreatedLaneId === 'secondary_loop_lane'
              && created.callResponseLane !== 'response'
            ) {
              created.musicProfileSourceType = level1CounterRhythmFamily || 'secondary_bridge_backbeat';
            } else if (
              normalizedCreatedLaneId === 'secondary_loop_lane'
              && created.callResponseLane !== 'response'
              && normalizeComposerProfileSourceType(created?.musicProfileSourceType) !== 'secondary_bridge_backbeat'
            ) {
              created.musicProfileSourceType = 'rhythm_lane';
            } else if (normalizedCreatedLaneId === 'primary_loop_lane' && created.callResponseLane !== 'response') {
              created.musicProfileSourceType = 'lead_melody';
            }
          }
          if (noteMusicSystemEvent) {
            const leadCreationDebugPayload = (forcedLeadProfile || groupedMelodyRequested || created?.musicProfileSourceType === 'lead_melody')
              ? {
                  leadDebug_forcedProfileSourceType: forcedProfile,
                  leadDebug_groupedMelodyRequested: groupedMelodyRequested,
                  leadDebug_desiredLane: desiredLane,
                  leadDebug_activePrimaryLoopCarrier: activePrimaryLoopCarrier,
                  leadDebug_activePrimaryLoopMelodyCarrier: activePrimaryLoopMelodyCarrier,
                  leadDebug_activeMelodyCoverageCount: getActiveMelodyCoverageCount(),
                  leadDebug_activeRhythmCoverageCount: getActiveRhythmCoverageCount(),
                  leadDebug_fallbackMelodyCoverageRequested: fallbackMelodyCoverageRequested,
                  leadDebug_sectionKey: String(sectionKey || '').trim().toLowerCase(),
                  leadDebug_motifScopeKey: String(motifScopeKey || '').trim().toLowerCase(),
                }
              : null;
            noteMusicSystemEvent('music_composer_group_state', {
              phase: 'created',
              groupId: Math.trunc(Number(created?.id) || 0),
              templateId: String(created?.templateId || '').trim(),
              callResponseLane: String(created?.callResponseLane || '').trim().toLowerCase(),
              sectionId: String(created?.sectionId || '').trim().toLowerCase(),
              active: created?.active === true,
              retiring: created?.retiring === true,
              lifecycleState: String(created?.lifecycleState || '').trim().toLowerCase(),
              role: String(created?.role || '').trim().toLowerCase(),
              musicLaneId: String(created?.musicLaneId || '').trim().toLowerCase(),
              instrumentId: String(created?.instrumentId || created?.instrument || '').trim(),
              note: Array.isArray(created?.notes) && created.notes.length ? String(created.notes[0] || '').trim() : '',
              reason: String(created?.introSlotProfileSourceType || created?.musicProfileSourceType || '').trim().toLowerCase(),
              stage: buildStepSignature(created?.introSlotSteps || created?.steps),
              formationRole: String(created?.formationRole || '').trim().toLowerCase(),
              formationArchetype: String(created?.formationArchetype || '').trim().toLowerCase(),
              formationStyleFamily: String(created?.formationStyleFamily || '').trim().toLowerCase(),
              formationSpawnRegion: String(created?.formationSpawnRegion || '').trim().toLowerCase(),
              formationSpacingProfile: String(created?.formationSpacingProfile || '').trim().toLowerCase(),
              formationSymmetry: String(created?.formationSymmetry || '').trim().toLowerCase(),
              formationPresentationWeight: Number(created?.formationPresentationWeight) || 0,
              formationMergeProtectionActive: created?.formationMergeProtectionActive === true,
              formationDesiredMemberCount: Math.max(1, Math.trunc(Number(created?.formationDesiredMemberCount) || 1)),
              behavioralFormationArchetype: String(created?.behavioralFormationArchetype || '').trim().toLowerCase(),
              behavioralFormationClass: String(created?.behavioralFormationClass || '').trim().toLowerCase(),
              behavioralFormationActivationMode: String(created?.behavioralFormationActivationMode || '').trim().toLowerCase(),
              behavioralFormationIntensity: Number(created?.behavioralFormationIntensity) || 0,
              behavioralFormationActive: created?.behavioralFormationActive === true,
              singleBehaviorId: String(created?.singleBehaviorId || '').trim().toLowerCase(),
              groupBehaviorId: String(created?.groupBehaviorId || '').trim().toLowerCase(),
              eventBehaviorId: String(created?.eventBehaviorId || '').trim().toLowerCase(),
              behaviorPriority: String(created?.behaviorPriority || '').trim().toLowerCase(),
              behaviorWindow: String(created?.behaviorWindow || '').trim().toLowerCase(),
              behaviorSource: String(created?.behaviorSource || '').trim().toLowerCase(),
              ...(leadCreationDebugPayload || {}),
            }, {
              beatIndex: Math.max(0, Math.trunc(Number(currentBeatIndex) || 0)),
            });
          }
          if (created?.musicProfileSourceType === 'lead_melody' || forcedLeadProfile || groupedMelodyRequested) {
            refreshPrimaryLeadReservation(created);
          }
          if (created?.musicProfileSourceType === 'answer_ornament' || responseGroupRequested) {
            created.size = 1;
            created.performers = 1;
            refreshAnswerOrnamentReservation(created);
          }
          try {
            noteDirectorSpawnArchetype?.(
              introRhythmUsesGroupBody
                ? 'composer_basic'
                : (visualSoloCarrierActive ? `solo_${visualSoloCarrierType}_basic` : 'composer_basic')
            );
          } catch {}
          return created;
        });
      },
    });
  });
  withPerfSample('maintainComposerGroups.syncMembers', () => {
    for (const group of composerEnemyGroups) {
      if (!group || group.retiring || group.active === false) continue;
      enforceLevel1NoSparkleOnGroup(group);
      const introPercussionCarrier = group?.introPercussionCarrier === true;
      const soloCarrierType = String(group?.soloCarrierType || '').trim().toLowerCase();
      let groupRhythmCarrierLocked = group?.groupRhythmCarrierLock === true
        && !soloCarrierType
        && String(group?.introCarrierBodyType || '').trim().toLowerCase() === 'group';
      const introSlotIdentityActive = isIntroSlotIdentityActive(group);
      const templateRole = helpers.normalizeSwarmRole?.(
        templateById.get(String(group?.templateId || ''))?.role || '',
        ''
      );
      const responseTemplateIdentity = String(group?.templateId || '').trim().toLowerCase() === 'response_group';
      const foundationBufferGroup = String(group?.templateId || '').trim().toLowerCase() === 'foundation-buffer'
        || String(group?.sectionId || '').trim().toLowerCase() === 'foundation-buffer';
      const introBackbeatMergePromotionRequested = (
        (leadEntryMergeActive || fullTextureActive)
        && group?.introStageCarrier === true
        && getIntroSlotProfileSourceType(group) === 'spawner_rhythm_backbeat'
        && String(group?.musicLaneId || '').trim().toLowerCase() === 'secondary_loop_lane'
      );
      if (introBackbeatMergePromotionRequested) {
        group.introStageCarrier = false;
        group.introSlotLock = false;
        group.introSlotLockUntilBar = -1;
        group.introSlotProfileSourceType = '';
        group.introSlotRole = '';
        group.introSlotMusicLaneId = '';
        group.introSlotMusicLaneLayer = '';
        group.introSlotCallResponseLane = '';
        group.introSlotInstrumentId = '';
        group.introSlotActionType = '';
        group.introSlotSteps = null;
        group.introSlotRows = null;
        group.introSlotNotes = null;
        group.introSlotNoteIndices = null;
        group.introSlotNotePalette = null;
        group.introSlotPhraseRoot = '';
        group.introSlotPhraseFifth = '';
        group.introSlotResolutionTargets = null;
        group.musicProfileSourceType = 'secondary_bridge_backbeat';
        group.callResponseLane = 'call';
        group.musicLaneId = 'secondary_loop_lane';
        group.musicLaneLayer = 'loops';
        group.groupRhythmCarrierLock = false;
        try {
          noteMusicSystemEvent?.('music_composer_group_state', {
            phase: 'intro_backbeat_promoted',
            groupId: Math.trunc(Number(group?.id) || 0),
            reason: 'lead_entry_merge_secondary_bridge_promotion',
            musicLaneId: 'secondary_loop_lane',
            callResponseLane: 'call',
            stage: 'secondary_bridge_backbeat',
            instrumentId: String(group?.instrumentId || group?.instrument || '').trim(),
          }, {
            beatIndex: Math.max(0, Math.trunc(Number(currentBeatIndex) || 0)),
            barIndex: currentBarIndex,
          });
        } catch {}
      }
      if (introSlotIdentityActive) {
        applyIntroSlotStateToGroup(group);
      } else if (
        !foundationBufferGroup
        &&
        !groupRhythmCarrierLocked
        && templateRole
        && !introPercussionCarrier
        && !responseTemplateIdentity
        && !(
          String(group?.musicLaneId || '').trim().toLowerCase() === 'primary_loop_lane'
          && isComposerMelodyProfile(group?.musicProfileSourceType)
        )
      ) {
        group.role = templateRole;
        const sanitizedInstrumentId = sanitizeEnemyMusicInstrumentId(
          group?.instrumentId || group?.instrument,
          helpers.resolveSwarmSoundInstrumentId?.('projectile') || 'tone',
          { role: templateRole }
        );
        if (sanitizedInstrumentId) {
          group.instrumentId = sanitizedInstrumentId;
          group.instrument = sanitizedInstrumentId;
        }
      }
      if (foundationBufferGroup) {
        const foundationNote = normalizeFoundationRegisterNote(
          Array.isArray(group?.notes) && group.notes.length ? group.notes[0] : (group?.phraseRoot || group?.note || ''),
          'C3'
        );
        const foundationInstrumentId = sanitizeEnemyMusicInstrumentId(
          helpers.getIdForDisplayName?.('Bass Tone 3')
            || helpers.getIdForDisplayName?.('Bass Tone 4')
            || group?.musicLaneInstrumentId
            || group?.instrumentId
            || group?.instrument
            || helpers.resolveSwarmSoundInstrumentId?.('projectile')
            || 'tone',
          helpers.resolveSwarmSoundInstrumentId?.('projectile') || 'tone',
          { role: constants.bassRole }
        );
        group.role = constants.bassRole;
        group.actionType = 'projectile';
        group.musicLaneId = 'foundation_lane';
        group.musicLaneLayer = 'foundation';
        group.callResponseLane = 'call';
        group.musicProfileSourceType = 'rhythm_lane';
        group.notes = [foundationNote];
        group.gravityNotes = [foundationNote];
        group.phraseRoot = foundationNote;
        group.phraseFifth = foundationNote;
        group.resolutionTargets = [foundationNote];
        if (foundationInstrumentId) {
          group.instrumentId = foundationInstrumentId;
          group.instrument = foundationInstrumentId;
          group.musicLaneInstrumentId = foundationInstrumentId;
        }
      }
      const memberLifecycleState = helpers.normalizeMusicLifecycleState?.(group.lifecycleState, 'active');
      let musicProfileSourceType = introSlotIdentityActive
        ? getIntroSlotProfileSourceType(group)
        : normalizeComposerProfileSourceType(group?.musicProfileSourceType);
      enforceLevel1SecondaryLoopEpochIdentity(group);
      if (
        fullTextureActive
        && level1CounterRhythmEpochLocked
        && String(group?.callResponseLane || '').trim().toLowerCase() !== 'response'
        && String(group?.musicLaneId || '').trim().toLowerCase() === 'secondary_loop_lane'
      ) {
        musicProfileSourceType = level1CounterRhythmFamily || 'secondary_bridge_backbeat';
      }
      const lockedPrimaryLoopLeadIdentity = (
        group?.__bsPrimaryLoopLeadIdentityLocked === true
        || (
          String(group?.musicLaneId || '').trim().toLowerCase() === 'primary_loop_lane'
          && isComposerMelodyProfile(musicProfileSourceType)
        )
      );
      if (lockedPrimaryLoopLeadIdentity && String(group?.callResponseLane || '').trim().toLowerCase() !== 'response') {
        group.__bsPrimaryLoopLeadIdentityLocked = true;
        musicProfileSourceType = 'lead_melody';
        group.musicProfileSourceType = 'lead_melody';
        group.role = constants.leadRole;
        group.musicLaneId = 'primary_loop_lane';
        group.musicLaneLayer = 'loops';
        group.callResponseLane = String(group?.callResponseLane || '').trim().toLowerCase() === 'solo' ? 'solo' : 'call';
        group.soloCarrierType = '';
        group.groupRhythmCarrierLock = false;
        groupRhythmCarrierLocked = false;
        group.groupRhythmProfileSourceType = '';
        group.groupRhythmMusicLaneId = '';
        group.groupRhythmMusicLaneLayer = '';
        group.groupRhythmCallResponseLane = '';
      } else if (
        String(group?.musicLaneId || '').trim().toLowerCase() === 'primary_loop_lane'
        && String(group?.callResponseLane || '').trim().toLowerCase() !== 'response'
        && !isComposerMelodyProfile(musicProfileSourceType)
      ) {
        musicProfileSourceType = level1CounterRhythmFamily || 'secondary_bridge_backbeat';
        group.musicProfileSourceType = musicProfileSourceType;
        group.role = constants.accentRole || 'accent';
        group.musicLaneId = 'secondary_loop_lane';
        group.musicLaneLayer = 'loops';
        group.callResponseLane = 'call';
      }
      if (!musicProfileSourceType && String(group?.callResponseLane || '').trim().toLowerCase() === 'response') {
        musicProfileSourceType = 'answer_ornament';
        group.musicProfileSourceType = 'answer_ornament';
      }
      if (responseTemplateIdentity) {
        musicProfileSourceType = 'answer_ornament';
        group.musicProfileSourceType = 'answer_ornament';
        group.role = 'accent';
        group.actionType = 'projectile';
        group.callResponseLane = 'response';
        group.musicLaneId = level1SupportPolicy.allowSparkle !== true
          ? 'answer_lane'
          : (String(group?.musicLaneId || '').trim().toLowerCase() === 'sparkle_lane'
          ? 'sparkle_lane'
          : 'secondary_loop_lane');
        group.musicLaneLayer = group.musicLaneId === 'sparkle_lane' ? 'sparkle' : 'loops';
        clearGroupRhythmState(group);
      }
      if (musicProfileSourceType === 'answer_ornament' || String(group?.callResponseLane || '').trim().toLowerCase() === 'response') {
        const normalizedResponseProfile = getSharedCarrierMusicProfile('answer_ornament', {
          instrumentInfluence: group?.instrumentInfluence,
          sectionId: group?.sectionId,
          energyState: currentEnergyStateName,
        });
        group.musicProfileSourceType = 'answer_ornament';
        group.callResponseLane = 'response';
        group.role = normalizedResponseProfile?.role || group.role || 'accent';
        group.actionType = normalizedResponseProfile?.actionType || group.actionType || 'projectile';
        group.musicLaneId = level1SupportPolicy.allowSparkle !== true
          ? 'answer_lane'
          : (normalizedResponseProfile?.musicLaneId
            || (String(group?.musicLaneId || '').trim().toLowerCase() === 'sparkle_lane' ? 'sparkle_lane' : 'secondary_loop_lane'));
        group.musicLaneLayer = normalizedResponseProfile?.musicLaneLayer
          || (group.musicLaneId === 'sparkle_lane' ? 'sparkle' : 'loops');
        if (level1SupportPolicy.allowSparkle !== true) group.musicLaneLayer = 'loops';
        if (Array.isArray(normalizedResponseProfile?.steps) && normalizedResponseProfile.steps.length) {
          group.steps = normalizedResponseProfile.steps.slice(0, constants.weaponTuneSteps);
        }
        if (Array.isArray(normalizedResponseProfile?.rows)) {
          group.rows = normalizedResponseProfile.rows.slice(0, constants.weaponTuneSteps);
        }
        if (Array.isArray(normalizedResponseProfile?.notes) && normalizedResponseProfile.notes.length) {
          group.notes = normalizedResponseProfile.notes.slice();
        }
        if (normalizedResponseProfile?.phraseRoot) group.phraseRoot = normalizedResponseProfile.phraseRoot;
        if (normalizedResponseProfile?.phraseFifth) group.phraseFifth = normalizedResponseProfile.phraseFifth;
        if (Array.isArray(normalizedResponseProfile?.resolutionTargets) && normalizedResponseProfile.resolutionTargets.length) {
          group.resolutionTargets = normalizedResponseProfile.resolutionTargets.slice();
        }
        if (normalizedResponseProfile?.instrumentId) {
          group.instrumentId = normalizedResponseProfile.instrumentId;
          group.instrument = normalizedResponseProfile.instrumentId;
        }
        clearGroupRhythmState(group);
      }
      const primaryLoopMelodyIdentity = (
        String(group?.musicLaneId || '').trim().toLowerCase() === 'primary_loop_lane'
        && isComposerMelodyProfile(musicProfileSourceType)
      );
      if (primaryLoopMelodyIdentity) {
        const canonicalLeadProfile = getSharedCarrierMusicProfile('lead_melody', {
          instrumentInfluence: group?.instrumentInfluence,
          sectionId: group?.sectionId,
          energyState: currentEnergyStateName,
        });
        const existingBodyType = String(group?.introCarrierBodyType || '').trim().toLowerCase();
        const existingTemplateId = String(group?.templateId || '').trim().toLowerCase();
        const explicitSoloLeadCarrier = existingBodyType === 'solo' || existingTemplateId.startsWith('solo-');
        group.__bsPrimaryLoopLeadIdentityLocked = true;
        group.soloCarrierType = '';
        group.groupRhythmCarrierLock = false;
        group.introStageCarrier = false;
        group.introPercussionCarrier = false;
        group.introCarrierBodyType = explicitSoloLeadCarrier ? 'solo' : 'group';
        group.musicProfileSourceType = 'lead_melody';
        if (explicitSoloLeadCarrier && !existingTemplateId.startsWith('solo-')) {
          group.templateId = 'solo-melody-carrier';
        } else if (!explicitSoloLeadCarrier) {
          group.templateId = 'lead_group';
        }
        group.role = canonicalLeadProfile?.role || constants.leadRole;
        group.musicLaneId = 'primary_loop_lane';
        group.musicLaneLayer = 'loops';
        group.callResponseLane = explicitSoloLeadCarrier ? 'solo' : 'call';
        const persistedLeadInstrumentId = String(
          leadAuthorityRuntime?.instrumentId
          || composer?.__bsCanonicalPrimaryLeadInstrumentId
          || group?.__bsCanonicalLeadInstrumentId
          || group?.musicLaneInstrumentId
          || group?.instrumentId
          || group?.instrument
          || ''
        ).trim();
        const canonicalLeadInstrumentId = sanitizeEnemyMusicInstrumentId(
          persistedLeadInstrumentId || canonicalLeadProfile?.instrumentId,
          persistedLeadInstrumentId || group?.instrumentId || group?.instrument || helpers.resolveSwarmSoundInstrumentId?.('projectile') || 'tone',
          { role: canonicalLeadProfile?.role || constants.leadRole }
        );
        if (canonicalLeadInstrumentId) {
          group.__bsCanonicalLeadInstrumentId = canonicalLeadInstrumentId;
          group.instrumentId = canonicalLeadInstrumentId;
          group.instrument = canonicalLeadInstrumentId;
          group.musicLaneInstrumentId = canonicalLeadInstrumentId;
        }
        syncLeadAuthorityFromGroup(group, 'maintenance_primary_loop_normalization');
        group.roleLane = '';
        group.roleColor = '';
        group.roleColorBright = '';
        group.roleColorDeep = '';
        group.identityVisualLocked = false;
      }
      const effectiveGroupSoloCarrierType = primaryLoopMelodyIdentity ? '' : soloCarrierType;
      const soloPreferredLaneId = soloCarrierType === 'rhythm'
        ? getSoloRhythmPreferredLaneId(musicProfileSourceType)
        : '';
      const lockedGroupRhythmProfile = groupRhythmCarrierLocked && musicProfileSourceType
        ? getSharedCarrierMusicProfile(musicProfileSourceType, {
            instrumentInfluence: group?.instrumentInfluence,
            sectionId: group?.sectionId,
            energyState: currentEnergyStateName,
          })
        : null;
      if (introPercussionCarrier) {
        group.role = helpers.normalizeSwarmRole?.(group?.role || 'lead', constants.leadRole) || constants.leadRole;
        group.actionType = 'explosion';
        group.musicLaneId = 'secondary_loop_lane';
        group.musicLaneLayer = 'loops';
        const percussionInstrumentId = sanitizeEnemyMusicInstrumentId(
          helpers.resolveSwarmSoundInstrumentId?.('explosion') || group?.instrumentId || group?.instrument,
          helpers.resolveSwarmSoundInstrumentId?.('explosion') || 'tone',
          { toyKey: 'loopgrid-drum' }
        );
        if (percussionInstrumentId) {
          group.instrumentId = percussionInstrumentId;
          group.instrument = percussionInstrumentId;
        }
      }
      if (soloCarrierType) {
        const lockIntroRhythmProfile = soloCarrierType === 'rhythm'
          && introSlotIdentityActive
          && isIntroSlotProfileSourceType(musicProfileSourceType);
        const sharedProfileSourceType = musicProfileSourceType
          || (soloCarrierType === 'rhythm'
            ? 'rhythm_lane'
            : (String(group?.musicLaneId || '').trim().toLowerCase() === 'primary_loop_lane'
              ? 'lead_melody'
              : 'rhythm_lane'));
        const sharedSoloProfile = lockIntroRhythmProfile
          ? null
          : getSharedCarrierMusicProfile(sharedProfileSourceType, {
            instrumentInfluence: group?.instrumentInfluence,
            sectionId: group?.sectionId,
            energyState: currentEnergyStateName,
          });
        if (sharedSoloProfile) {
          group.role = sharedSoloProfile.role || group.role;
          group.actionType = sharedSoloProfile.actionType || group.actionType;
          group.musicLaneId = sharedSoloProfile.musicLaneId || group.musicLaneId;
          group.musicLaneLayer = sharedSoloProfile.musicLaneLayer || group.musicLaneLayer || 'loops';
          group.callResponseLane = sharedSoloProfile.callResponseLane
            || group.callResponseLane
            || ((introSlotIdentityActive || groupRhythmCarrierLocked) ? 'call' : 'solo');
          if (Array.isArray(sharedSoloProfile.steps) && sharedSoloProfile.steps.length) {
            group.steps = sharedSoloProfile.steps.slice(0, constants.weaponTuneSteps);
          }
          if (Array.isArray(sharedSoloProfile.rows)) {
            group.rows = sharedSoloProfile.rows.slice(0, constants.weaponTuneSteps);
          }
          if (Array.isArray(sharedSoloProfile.notes) && sharedSoloProfile.notes.length) {
            group.notes = sharedSoloProfile.notes.slice();
          }
          if (Array.isArray(sharedSoloProfile.noteIndices)) {
            group.noteIndices = sharedSoloProfile.noteIndices.slice(0, constants.weaponTuneSteps);
          }
          if (Array.isArray(sharedSoloProfile.notePalette)) {
            group.notePalette = sharedSoloProfile.notePalette.slice();
          }
          if (sharedSoloProfile.phraseRoot) group.phraseRoot = sharedSoloProfile.phraseRoot;
          if (sharedSoloProfile.phraseFifth) group.phraseFifth = sharedSoloProfile.phraseFifth;
          if (Array.isArray(sharedSoloProfile.resolutionTargets) && sharedSoloProfile.resolutionTargets.length) {
            group.resolutionTargets = sharedSoloProfile.resolutionTargets.slice();
          }
          const syncedSoloInstrumentId = (primaryLoopMelodyIdentity || !String(group?.instrumentId || group?.instrument || '').trim())
            ? sanitizeEnemyMusicInstrumentId(
                sharedSoloProfile.instrumentId,
                group?.instrumentId || group?.instrument || helpers.resolveSwarmSoundInstrumentId?.('projectile') || 'tone',
                { role: sharedSoloProfile.role || constants.leadRole }
              )
            : '';
          if (syncedSoloInstrumentId) {
            group.instrumentId = syncedSoloInstrumentId;
            group.instrument = syncedSoloInstrumentId;
          }
        }
        if (typeof helpers.noteIntroDebug === 'function' && currentBarIndex < 24 && soloCarrierType === 'rhythm' && group?.introStageCarrier === true) {
          helpers.noteIntroDebug('intro_rhythm_carrier_sync', {
            groupId: Math.trunc(Number(group?.id) || 0),
            introStage,
            slotProfile: musicProfileSourceType,
            lockIntroRhythmProfile,
            musicLaneId: String(group?.musicLaneId || '').trim().toLowerCase(),
            musicLaneLayer: String(group?.musicLaneLayer || '').trim().toLowerCase(),
            instrumentId: String(group?.instrumentId || group?.instrument || '').trim(),
            steps: Array.isArray(group?.steps) ? group.steps.map((v) => !!v) : [],
            notes: Array.isArray(group?.notes) ? group.notes.slice() : [],
            memberCount: group?.memberIds instanceof Set ? group.memberIds.size : (Array.isArray(group?.memberIds) ? group.memberIds.length : 0),
          });
        }
      }
      if (musicProfileSourceType === 'answer_ornament') {
        const answerProfile = getSharedCarrierMusicProfile('answer_ornament', {
          instrumentInfluence: group?.instrumentInfluence,
          sectionId: group?.sectionId,
          energyState: currentEnergyStateName,
        });
        clearGroupRhythmState(group);
        group.role = answerProfile?.role || 'accent';
        group.actionType = answerProfile?.actionType || group.actionType || 'projectile';
        group.musicLaneId = answerProfile?.musicLaneId || group.musicLaneId || 'secondary_loop_lane';
        group.musicLaneLayer = answerProfile?.musicLaneLayer || group.musicLaneLayer || 'loops';
        group.callResponseLane = 'response';
        if (Array.isArray(answerProfile?.steps) && answerProfile.steps.length) {
          group.steps = answerProfile.steps.slice(0, constants.weaponTuneSteps);
        }
        if (Array.isArray(answerProfile?.rows)) {
          group.rows = answerProfile.rows.slice(0, constants.weaponTuneSteps);
        }
        if (Array.isArray(answerProfile?.notes) && answerProfile.notes.length) {
          group.notes = answerProfile.notes.slice();
        }
        if (answerProfile?.phraseRoot) group.phraseRoot = answerProfile.phraseRoot;
        if (answerProfile?.phraseFifth) group.phraseFifth = answerProfile.phraseFifth;
        if (Array.isArray(answerProfile?.resolutionTargets) && answerProfile.resolutionTargets.length) {
          group.resolutionTargets = answerProfile.resolutionTargets.slice();
        }
        const answerInstrumentId = sanitizeEnemyMusicInstrumentId(
          answerProfile?.instrumentId,
          group?.instrumentId || group?.instrument || helpers.resolveSwarmSoundInstrumentId?.('projectile') || 'tone',
          { role: answerProfile?.role || 'accent' }
        );
        if (answerInstrumentId) {
          group.instrumentId = answerInstrumentId;
          group.instrument = answerInstrumentId;
        }
      }
      if (groupRhythmCarrierLocked) {
        applyLockedGroupRhythmStateToGroup(group, lockedGroupRhythmProfile);
      } else if (!soloCarrierType && musicProfileSourceType) {
        const sharedCarrierProfile = getSharedCarrierMusicProfile(musicProfileSourceType, {
          instrumentInfluence: group?.instrumentInfluence,
          sectionId: group?.sectionId,
          energyState: currentEnergyStateName,
        });
        if (sharedCarrierProfile) {
          group.role = sharedCarrierProfile.role || group.role;
          group.actionType = sharedCarrierProfile.actionType || group.actionType;
          group.musicLaneId = sharedCarrierProfile.musicLaneId || group.musicLaneId;
          group.musicLaneLayer = sharedCarrierProfile.musicLaneLayer || group.musicLaneLayer || 'loops';
          if (Array.isArray(sharedCarrierProfile.steps) && sharedCarrierProfile.steps.length) {
            group.steps = sharedCarrierProfile.steps.slice(0, constants.weaponTuneSteps);
          }
          if (Array.isArray(sharedCarrierProfile.rows)) {
            group.rows = sharedCarrierProfile.rows.slice(0, constants.weaponTuneSteps);
          }
          if (Array.isArray(sharedCarrierProfile.notes) && sharedCarrierProfile.notes.length) {
            group.notes = sharedCarrierProfile.notes.slice();
          }
          if (Array.isArray(sharedCarrierProfile.noteIndices)) {
            group.noteIndices = sharedCarrierProfile.noteIndices.slice(0, constants.weaponTuneSteps);
          }
          if (Array.isArray(sharedCarrierProfile.notePalette)) {
            group.notePalette = sharedCarrierProfile.notePalette.slice();
          }
          if (sharedCarrierProfile.phraseRoot) group.phraseRoot = sharedCarrierProfile.phraseRoot;
          if (sharedCarrierProfile.phraseFifth) group.phraseFifth = sharedCarrierProfile.phraseFifth;
          if (Array.isArray(sharedCarrierProfile.resolutionTargets) && sharedCarrierProfile.resolutionTargets.length) {
            group.resolutionTargets = sharedCarrierProfile.resolutionTargets.slice();
          }
          const normalizedCarrierProfileSourceType = normalizeComposerProfileSourceType(musicProfileSourceType);
          const structuralRhythmCarrier = (
            normalizedCarrierProfileSourceType === 'secondary_bridge_backbeat'
            || normalizedCarrierProfileSourceType === 'spawner_rhythm_backbeat'
            || normalizedCarrierProfileSourceType === 'rhythm_lane_backbeat'
            || (
              normalizedCarrierProfileSourceType === 'rhythm_lane'
              && String(group?.musicLaneId || '').trim().toLowerCase() === 'secondary_loop_lane'
            )
          );
          if (structuralRhythmCarrier) {
            if (sharedCarrierProfile.callResponseLane) {
              group.callResponseLane = String(sharedCarrierProfile.callResponseLane).trim().toLowerCase() || 'call';
            } else if (!String(group?.callResponseLane || '').trim()) {
              group.callResponseLane = 'call';
            }
            const structuralRhythmInstrumentId = sanitizeEnemyMusicInstrumentId(
              sharedCarrierProfile.instrumentId,
              group?.instrumentId || group?.instrument || helpers.resolveSwarmSoundInstrumentId?.('projectile') || 'tone',
              { role: sharedCarrierProfile.role || group?.role || constants.leadRole, toyKey: 'loopgrid-drum' }
            );
            if (structuralRhythmInstrumentId) {
              group.instrumentId = structuralRhythmInstrumentId;
              group.instrument = structuralRhythmInstrumentId;
              group.musicLaneInstrumentId = structuralRhythmInstrumentId;
            }
          }
        }
      }
      enforceLevel1SecondaryLoopEpochIdentity(group);
      enforceAccentSupportInstrumentFamily(group);
      applyFormationRuntimeToGroup(group);
      syncGroupPrimaryNote(group);
      if (soloPreferredLaneId && !String(group?.musicLaneId || '').trim()) group.musicLaneId = soloPreferredLaneId;
      if (effectiveGroupSoloCarrierType && !String(group?.musicLaneLayer || '').trim()) group.musicLaneLayer = 'loops';
      const templateRoleEligible = !effectiveGroupSoloCarrierType
        && !introSlotIdentityActive
        && !groupRhythmCarrierLocked
        && musicProfileSourceType !== 'answer_ornament'
        && String(group?.callResponseLane || '').trim().toLowerCase() !== 'response';
      const effectiveRole = (templateRoleEligible ? templateRole : '') || group?.role;
      const effectiveLayer = String(
        group?.musicLaneLayer
          || ((templateRoleEligible && templateRole === constants.bassRole) ? 'foundation' : 'loops')
      );
      const effectiveInstrumentId = String(group?.musicLaneInstrumentId || group?.instrumentId || '').trim();
      const effectiveContinuityId = String(group?.musicLaneContinuityId || group?.continuityId || '').trim();
      const effectivePhraseId = String(group?.musicLanePhraseId || group?.motif?.id || '');
      const groupMemberCount = group?.memberIds instanceof Set
        ? group.memberIds.size
        : (Array.isArray(group?.memberIds) ? group.memberIds.length : 0);
      const groupSyncSignature = [
        String(effectiveRole || ''),
        effectiveLayer,
        effectiveInstrumentId,
        effectiveContinuityId,
        effectivePhraseId,
        memberLifecycleState,
      ].join('|');
      if (
        String(group?.__bsComposerMemberSyncSignature || '') === groupSyncSignature
        && Math.trunc(Number(group?.__bsComposerMemberSyncCount) || 0) === Math.max(0, Math.trunc(Number(groupMemberCount) || 0))
      ) {
        const lastSteadyTraceBeat = Math.max(-1, Math.trunc(Number(group?.__bsLastSteadyTraceBeat) || -1));
        const shouldTraceSteady = noteMusicSystemEvent && (
          lastSteadyTraceBeat < 0
          || (Math.max(0, Math.trunc(Number(currentBeatIndex) || 0)) - lastSteadyTraceBeat) >= 16
        );
        if (shouldTraceSteady) {
          group.__bsLastSteadyTraceBeat = Math.max(0, Math.trunc(Number(currentBeatIndex) || 0));
          noteMusicSystemEvent('music_composer_group_state', {
            phase: 'steady',
            groupId: Math.trunc(Number(group?.id) || 0),
            templateId: String(group?.templateId || '').trim(),
            callResponseLane: String(group?.callResponseLane || '').trim().toLowerCase(),
            sectionId: String(group?.sectionId || '').trim().toLowerCase(),
            active: group?.active === true,
            retiring: group?.retiring === true,
            lifecycleState: String(group?.lifecycleState || '').trim().toLowerCase(),
            role: String(effectiveRole || '').trim().toLowerCase(),
            musicLaneId: String(group?.musicLaneId || '').trim().toLowerCase(),
            instrumentId: String(group?.instrumentId || group?.instrument || '').trim(),
            note: Array.isArray(group?.notes) && group.notes.length ? String(group.notes[0] || '').trim() : '',
            reason: String(group?.introSlotProfileSourceType || group?.musicProfileSourceType || '').trim().toLowerCase(),
            stage: buildStepSignature(group?.introSlotSteps || group?.steps),
            formationRole: String(group?.formationRole || '').trim().toLowerCase(),
            formationArchetype: String(group?.formationArchetype || '').trim().toLowerCase(),
            formationStyleFamily: String(group?.formationStyleFamily || '').trim().toLowerCase(),
            formationSpawnRegion: String(group?.formationSpawnRegion || '').trim().toLowerCase(),
            formationSpacingProfile: String(group?.formationSpacingProfile || '').trim().toLowerCase(),
            formationSymmetry: String(group?.formationSymmetry || '').trim().toLowerCase(),
            formationPresentationWeight: Number(group?.formationPresentationWeight) || 0,
            formationMergeProtectionActive: group?.formationMergeProtectionActive === true,
            formationDesiredMemberCount: Math.max(1, Math.trunc(Number(group?.formationDesiredMemberCount) || 1)),
            behavioralFormationArchetype: String(group?.behavioralFormationArchetype || '').trim().toLowerCase(),
            behavioralFormationClass: String(group?.behavioralFormationClass || '').trim().toLowerCase(),
            behavioralFormationActivationMode: String(group?.behavioralFormationActivationMode || '').trim().toLowerCase(),
            behavioralFormationIntensity: Number(group?.behavioralFormationIntensity) || 0,
            behavioralFormationActive: group?.behavioralFormationActive === true,
            singleBehaviorId: String(group?.singleBehaviorId || '').trim().toLowerCase(),
            groupBehaviorId: String(group?.groupBehaviorId || '').trim().toLowerCase(),
            eventBehaviorId: String(group?.eventBehaviorId || '').trim().toLowerCase(),
            behaviorPriority: String(group?.behaviorPriority || '').trim().toLowerCase(),
            behaviorWindow: String(group?.behaviorWindow || '').trim().toLowerCase(),
            behaviorSource: String(group?.behaviorSource || '').trim().toLowerCase(),
          }, {
            beatIndex: Math.max(0, Math.trunc(Number(currentBeatIndex) || 0)),
          });
        }
        continue;
      }
      if (noteMusicSystemEvent) {
        noteMusicSystemEvent('music_composer_group_state', {
          phase: 'updated',
          groupId: Math.trunc(Number(group?.id) || 0),
          templateId: String(group?.templateId || '').trim(),
          callResponseLane: String(group?.callResponseLane || '').trim().toLowerCase(),
          sectionId: String(group?.sectionId || '').trim().toLowerCase(),
          active: group?.active === true,
          retiring: group?.retiring === true,
          lifecycleState: String(group?.lifecycleState || '').trim().toLowerCase(),
          role: String(effectiveRole || '').trim().toLowerCase(),
          musicLaneId: String(group?.musicLaneId || '').trim().toLowerCase(),
          instrumentId: String(group?.instrumentId || group?.instrument || '').trim(),
          note: Array.isArray(group?.notes) && group.notes.length ? String(group.notes[0] || '').trim() : '',
          reason: String(group?.introSlotProfileSourceType || group?.musicProfileSourceType || '').trim().toLowerCase(),
          stage: buildStepSignature(group?.introSlotSteps || group?.steps),
          formationRole: String(group?.formationRole || '').trim().toLowerCase(),
          formationArchetype: String(group?.formationArchetype || '').trim().toLowerCase(),
          formationStyleFamily: String(group?.formationStyleFamily || '').trim().toLowerCase(),
          formationSpawnRegion: String(group?.formationSpawnRegion || '').trim().toLowerCase(),
          formationSpacingProfile: String(group?.formationSpacingProfile || '').trim().toLowerCase(),
          formationSymmetry: String(group?.formationSymmetry || '').trim().toLowerCase(),
          formationPresentationWeight: Number(group?.formationPresentationWeight) || 0,
          formationMergeProtectionActive: group?.formationMergeProtectionActive === true,
          formationDesiredMemberCount: Math.max(1, Math.trunc(Number(group?.formationDesiredMemberCount) || 1)),
          behavioralFormationArchetype: String(group?.behavioralFormationArchetype || '').trim().toLowerCase(),
          behavioralFormationClass: String(group?.behavioralFormationClass || '').trim().toLowerCase(),
          behavioralFormationActivationMode: String(group?.behavioralFormationActivationMode || '').trim().toLowerCase(),
          behavioralFormationIntensity: Number(group?.behavioralFormationIntensity) || 0,
          behavioralFormationActive: group?.behavioralFormationActive === true,
          singleBehaviorId: String(group?.singleBehaviorId || '').trim().toLowerCase(),
          groupBehaviorId: String(group?.groupBehaviorId || '').trim().toLowerCase(),
          eventBehaviorId: String(group?.eventBehaviorId || '').trim().toLowerCase(),
          behaviorPriority: String(group?.behaviorPriority || '').trim().toLowerCase(),
          behaviorWindow: String(group?.behaviorWindow || '').trim().toLowerCase(),
          behaviorSource: String(group?.behaviorSource || '').trim().toLowerCase(),
        }, {
          beatIndex: Math.max(0, Math.trunc(Number(currentBeatIndex) || 0)),
        });
      }
      const aliveMembers = getAliveComposerEnemiesByIds(group.memberIds);
      if (primaryLoopMelodyIdentity) {
        const explicitSoloLeadCarrier = String(group?.introCarrierBodyType || '').trim().toLowerCase() === 'solo'
          || String(group?.templateId || '').trim().toLowerCase().startsWith('solo-');
        if (explicitSoloLeadCarrier) {
          group.size = 1;
          group.performers = 1;
        } else {
          const sharedLeadCount = Math.max(1, Math.min(aliveMembers.length || groupMemberCount || 1, 3));
          group.size = sharedLeadCount;
          group.performers = sharedLeadCount;
        }
        if (explicitSoloLeadCarrier && aliveMembers.length > 1) {
          const keeper = aliveMembers[0] || null;
          for (let i = 1; i < aliveMembers.length; i++) {
            const extraEnemy = aliveMembers[i];
            if (!extraEnemy) continue;
            extraEnemy.lifecycleState = 'retiring';
            extraEnemy.composerRetiring = true;
            extraEnemy.retireReason = 'lead_diagnostic_trim';
            extraEnemy.retirePhaseStartMs = Number(performance?.now?.() || 0);
            extraEnemy.retreating = false;
          }
          group.memberIds = new Set(keeper ? [Math.trunc(Number(keeper?.id) || 0)].filter((id) => id > 0) : []);
        }
      }
      const nonSoloGroupedTemplate = String(group?.templateId || '').trim().toLowerCase();
      const ordinaryGroupedMusicalRole = (
        !effectiveGroupSoloCarrierType
        && String(group?.introCarrierBodyType || '').trim().toLowerCase() !== 'solo'
        && !nonSoloGroupedTemplate.startsWith('solo-')
        && nonSoloGroupedTemplate !== 'foundation-buffer'
        && musicProfileSourceType !== 'answer_ornament'
        && String(group?.callResponseLane || '').trim().toLowerCase() !== 'response'
      );
      if (musicProfileSourceType === 'answer_ornament' || String(group?.callResponseLane || '').trim().toLowerCase() === 'response') {
        group.size = 1;
        group.performers = 1;
        if (aliveMembers.length > 1) {
          const keeper = aliveMembers[0] || null;
          for (let i = 1; i < aliveMembers.length; i += 1) {
            const extraEnemy = aliveMembers[i];
            if (!extraEnemy) continue;
            extraEnemy.lifecycleState = 'retiring';
            extraEnemy.composerRetiring = true;
            extraEnemy.retireReason = 'answer_ornament_member_overflow';
            extraEnemy.retirePhaseStartMs = Number(performance?.now?.() || 0);
            extraEnemy.retreating = false;
          }
          group.memberIds = new Set(keeper ? [Math.trunc(Number(keeper?.id) || 0)].filter((id) => id > 0) : []);
        }
      }
      if (ordinaryGroupedMusicalRole) {
        const groupedFloorCount = Math.max(2, Math.min(aliveMembers.length || groupMemberCount || 2, 2));
        group.size = Math.max(groupedFloorCount, Math.trunc(Number(group?.size) || 0));
        group.performers = Math.max(groupedFloorCount, Math.trunc(Number(group?.performers) || 0));
      }
      if (effectiveGroupSoloCarrierType) {
        group.size = 1;
        group.performers = 1;
        if (aliveMembers.length > 1) {
          const keeper = aliveMembers[0] || null;
          for (let i = 1; i < aliveMembers.length; i++) {
            const extraEnemy = aliveMembers[i];
            if (!extraEnemy) continue;
            extraEnemy.lifecycleState = 'retiring';
            extraEnemy.composerRetiring = true;
            extraEnemy.retireReason = 'solo_carrier_trim';
            extraEnemy.retirePhaseStartMs = Number(performance?.now?.() || 0);
            extraEnemy.retreating = false;
          }
          group.memberIds = new Set(keeper ? [Math.trunc(Number(keeper?.id) || 0)].filter((id) => id > 0) : []);
        }
      }
      const syncedAliveMembers = getAliveComposerEnemiesByIds(group.memberIds);
      const primarySoloMemberId = effectiveGroupSoloCarrierType && syncedAliveMembers.length
        ? Math.trunc(Number(syncedAliveMembers[0]?.id) || 0)
        : 0;
      const effectiveMemberLaneId = String(
        group?.musicLaneId
        || soloPreferredLaneId
        || ''
      ).trim().toLowerCase();
      const level1ProtectedMemberLane = isLevel1ProtectedStructuralLane(effectiveMemberLaneId);
      for (const enemy of syncedAliveMembers) {
        enemy.lifecycleState = memberLifecycleState;
        const memberSyncSignature = [
          Math.trunc(Number(group?.id) || 0),
          String(effectiveRole || ''),
          effectiveLayer,
          effectiveInstrumentId,
          effectiveContinuityId,
          effectivePhraseId,
          memberLifecycleState,
        ].join('|');
        if (String(enemy?.__bsComposerSyncSignature || '') === memberSyncSignature) {
          if (templateRoleEligible && templateRole) {
            enemy.musicalRole = templateRole;
            enemy.composerRole = templateRole;
            if (group?.instrumentId) {
              const groupInstrument = level1ProtectedMemberLane
                ? resolveLevel1StableEnemyInstrumentId(enemy, effectiveMemberLaneId, group.instrumentId)
                : resolveGroupMemberPlaybackInstrumentId(
                    group,
                    enemy,
                    effectiveMemberLaneId,
                    String(group?.musicLaneInstrumentId || group?.instrumentId || effectiveInstrumentId || '').trim()
                  );
              enemy.composerInstrument = groupInstrument;
              enemy.instrumentId = groupInstrument;
              enemy.musicInstrumentId = groupInstrument;
              enemy.musicLaneInstrumentId = groupInstrument;
            }
          }
          continue;
        }
        helpers.ensureMusicLaneAssignment?.({
          group,
          enemy,
          role: effectiveRole,
          layer: effectiveLayer,
          preferredLaneId: soloPreferredLaneId,
          instrumentId: effectiveInstrumentId,
          continuityId: effectiveContinuityId,
          phraseId: effectivePhraseId,
          performerEnemyId: Math.trunc(Number(enemy?.id) || 0),
          performerGroupId: Math.trunc(Number(group?.id) || 0),
          performerType: 'composer-group-member',
          lockInstrument: group?.introStageCarrier === true || introSlotIdentityActive || level1ProtectedMemberLane,
        });
        applyLevel1StableEnemyInstrument(
          enemy,
          effectiveMemberLaneId,
          String(group?.musicLaneInstrumentId || group?.instrumentId || effectiveInstrumentId || '').trim()
        );
        if (primaryLoopMelodyIdentity) {
          enemy.introStageCarrier = false;
          enemy.introPercussionCarrier = false;
          enemy.musicLaneId = 'primary_loop_lane';
          enemy.musicRoleLane = '';
          enemy.musicRoleColor = '';
          enemy.musicRoleColorBright = '';
          enemy.musicRoleColorDeep = '';
          enemy.identityVisualLocked = false;
          if (group?.instrumentId) {
            const leadInstrumentId = level1ProtectedMemberLane
              ? resolveLevel1StableEnemyInstrumentId(enemy, effectiveMemberLaneId, group.instrumentId)
              : String(group.instrumentId).trim();
            enemy.composerInstrument = leadInstrumentId;
            enemy.instrumentId = leadInstrumentId;
            enemy.musicInstrumentId = leadInstrumentId;
            enemy.musicLaneInstrumentId = leadInstrumentId;
          }
        }
        if (templateRoleEligible && templateRole) {
          enemy.musicalRole = templateRole;
          enemy.composerRole = templateRole;
          if (group?.instrumentId) {
            const groupInstrument = level1ProtectedMemberLane
              ? resolveLevel1StableEnemyInstrumentId(enemy, effectiveMemberLaneId, group.instrumentId)
              : resolveGroupMemberPlaybackInstrumentId(
                  group,
                  enemy,
                  effectiveMemberLaneId,
                  String(group?.musicLaneInstrumentId || group?.instrumentId || effectiveInstrumentId || '').trim()
                );
            enemy.composerInstrument = groupInstrument;
            enemy.instrumentId = groupInstrument;
            enemy.musicInstrumentId = groupInstrument;
            enemy.musicLaneInstrumentId = groupInstrument;
          }
        }
        enemy.introStageCarrier = group?.introStageCarrier === true;
        const effectiveEnemySoloCarrierType = effectiveGroupSoloCarrierType;
        const enemyIsPrimarySoloMember = effectiveEnemySoloCarrierType && Math.trunc(Number(enemy?.id) || 0) === primarySoloMemberId;
        enemy.soloCarrierType = enemyIsPrimarySoloMember ? effectiveEnemySoloCarrierType : '';
        enemy.introCarrierBodyType = enemyIsPrimarySoloMember
          ? String(group?.introCarrierBodyType || '').trim().toLowerCase()
          : 'group';
        enemy.introSlotProfileSourceType = String(group?.introSlotProfileSourceType || group?.musicProfileSourceType || '').trim().toLowerCase();
        enemy.musicParticipationGain = Number(group?.musicParticipationGain == null ? enemy?.musicParticipationGain : group.musicParticipationGain);
        enemy.callResponseLane = String(group?.callResponseLane || enemy?.callResponseLane || '').trim().toLowerCase();
        helpers.applyMusicalIdentityVisualToEnemy?.(enemy, group);
        enemy.__bsComposerSyncSignature = memberSyncSignature;
      }
      group.__bsComposerMemberSyncSignature = groupSyncSignature;
      group.__bsComposerMemberSyncCount = Math.max(
        0,
        Math.trunc(Number(effectiveGroupSoloCarrierType ? syncedAliveMembers.length : groupMemberCount) || 0)
      );
    }
  });
}
