import {
  getBeatSwarmLevel1EpochId,
  getBeatSwarmLevel1RoleContract,
} from './beat-swarm-level1-contract.js';

export function maintainComposerEnemyGroupsLifecycle(options = null) {
  const enabled = !!options?.enabled;
  if (!enabled) return;

  const composerEnemyGroups = Array.isArray(options?.composerEnemyGroups) ? options.composerEnemyGroups : [];
  const pacingCaps = options?.pacingCaps && typeof options.pacingCaps === 'object' ? options.pacingCaps : {};
  const composer = options?.composer && typeof options.composer === 'object' ? options.composer : {};
  const composerRuntime = options?.composerRuntime && typeof options.composerRuntime === 'object'
    ? options.composerRuntime
    : {};
  const directorLanePlan = options?.directorLanePlan && typeof options.directorLanePlan === 'object' ? options.directorLanePlan : null;
  const introStage = String(options?.introStage || 'none').trim().toLowerCase();
  const sessionAgeBars = Math.max(0, Math.trunc(Number(options?.sessionAgeBars) || 0));
  const introStateAgeBars = Math.max(0, Math.trunc(Number(options?.introStateAgeBars) || 0));
  const currentBarIndex = Math.max(0, Math.trunc(Number(options?.currentBarIndex) || 0));
  const motifScopeKey = String(options?.motifScopeKey || 'default');
  const musicModeRuntime = options?.musicModeRuntime && typeof options.musicModeRuntime === 'object'
    ? options.musicModeRuntime
    : null;
  const leadAuthorityRuntime = options?.leadAuthorityRuntime && typeof options.leadAuthorityRuntime === 'object'
    ? options.leadAuthorityRuntime
    : null;

  const getAliveIdsForGroup = typeof options?.getAliveIdsForGroup === 'function' ? options.getAliveIdsForGroup : (() => new Set());
  const spawnComposerGroupOffscreenMembers = typeof options?.spawnComposerGroupOffscreenMembers === 'function' ? options.spawnComposerGroupOffscreenMembers : (() => {});
  const pickTemplate = typeof options?.pickTemplate === 'function' ? options.pickTemplate : (() => null);
  const getComposerMotif = typeof options?.getComposerMotif === 'function' ? options.getComposerMotif : ((_scope, _id, factory) => (typeof factory === 'function' ? factory() : null));
  const createComposerEnemyGroupProfile = typeof options?.createComposerEnemyGroupProfile === 'function' ? options.createComposerEnemyGroupProfile : (() => ({}));
  const createGroupFromMotif = typeof options?.createGroupFromMotif === 'function' ? options.createGroupFromMotif : (() => null);
  const hasPendingSecondaryLoopReservation = typeof options?.hasPendingSecondaryLoopReservation === 'function'
    ? options.hasPendingSecondaryLoopReservation
    : (() => false);
  const noteMusicSystemEvent = typeof options?.noteMusicSystemEvent === 'function' ? options.noteMusicSystemEvent : null;
  const retireGroup = typeof options?.retireGroup === 'function' ? options.retireGroup : (() => {});
  const normalizeLifecycleState = (value, fallback = 'active') => {
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
  };
  const normalizeComposerProfileSourceType = (value) => {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return '';
    return normalized;
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
  const getIntroSlotProfileSourceType = (groupLike) => {
    const group = groupLike && typeof groupLike === 'object' ? groupLike : null;
    if (!group) return '';
    return normalizeComposerProfileSourceType(group?.introSlotProfileSourceType || group?.musicProfileSourceType);
  };
  const getOldestActiveIntroSlotCarrierBarIndex = (profileSourceType = '') => {
    const normalized = String(profileSourceType || '').trim().toLowerCase();
    if (!normalized) return -1;
    let oldestBarIndex = Infinity;
    for (const group of composerEnemyGroups) {
      if (!group || group?.retiring || group?.active === false) continue;
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
      if (!group || group?.retiring || group?.active === false) continue;
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
    return ((currentBarIndex * 4) - oldestPulseCarrierBeatIndex) >= 16;
  })();
  const isPersistentIntroSlotCarrier = (groupLike) => {
    const group = groupLike && typeof groupLike === 'object' ? groupLike : null;
    if (!group || group?.retiring || group?.active === false) return false;
    if (currentBarIndex > 24) return false;
    const profile = getIntroSlotProfileSourceType(group);
    if (profile === 'spawner_rhythm_pulse' || profile === 'spawner_rhythm_motion') return true;
    if (profile === 'spawner_rhythm_backbeat') {
      return introStage !== 'none'
        && introStage !== 'ended';
    }
    return false;
  };
  const getTargetIntroProfiles = () => {
    if (introStage === 'rhythm_only') return ['spawner_rhythm_pulse'];
    if (introStage === 'soft_ramp') {
      return pulseCarrierReadyForBackbeat
        ? ['spawner_rhythm_pulse', 'spawner_rhythm_backbeat']
        : ['spawner_rhythm_pulse'];
    }
    return [];
  };
  const responseMode = String(pacingCaps.responseMode || 'none');
  const responseAllowsGroups = responseMode === 'either' || responseMode === 'group';
  const activeMusicMode = String(musicModeRuntime?.activeMusicMode || '').trim().toLowerCase();
  const phaseVariant = String(musicModeRuntime?.phaseVariant || 'default').trim().toLowerCase();
  const protectedMergeTextureWindow = activeMusicMode === 'lead_entry_merge' || activeMusicMode === 'full_texture';
  const leadMergeReducedSupportActive = activeMusicMode === 'lead_entry_merge' && phaseVariant === 'reduced_support';
  const desiredGroupsRaw = Math.max(1, Math.min(4, Math.max(1, Math.trunc((Number(composer.intensity) || 1) * 4))));
  const primaryLoopPlan = directorLanePlan && typeof directorLanePlan === 'object'
    ? (directorLanePlan.primary_loop || null)
    : null;
  const secondaryLoopPlan = directorLanePlan && typeof directorLanePlan === 'object'
    ? (directorLanePlan.secondary_loop || null)
    : null;
  const supportPlan = directorLanePlan && typeof directorLanePlan === 'object'
    ? (directorLanePlan.support || null)
    : null;
  const answerPlan = directorLanePlan && typeof directorLanePlan === 'object'
    ? (directorLanePlan.answer || null)
    : null;
  const fullTextureActive = activeMusicMode === 'full_texture';
  const level1RoleContract = getBeatSwarmLevel1RoleContract({
    activeLevelPhase: activeMusicMode,
    phaseVariant,
    answerWindowActive: answerPlan?.active === true,
    cadenceWindowActive: answerPlan?.active === true
      && String(answerPlan?.responseFamily || '').trim().toLowerCase() === 'echo',
    stableWindow: answerPlan?.active === true || supportPlan?.active === true || primaryLoopPlan?.active === true,
  });
  const level1SupportPolicy = level1RoleContract?.supportPolicy && typeof level1RoleContract.supportPolicy === 'object'
    ? level1RoleContract.supportPolicy
    : {};
  const level1AllowedRoles = new Set(
    Array.isArray(level1RoleContract?.allowedRoles) ? level1RoleContract.allowedRoles : []
  );
  const level1CounterRhythmAllowed = level1AllowedRoles.has('counter_rhythm');
  const level1AnswerAllowed = level1AllowedRoles.has('answer_ornament');
  const level1EpochId = getBeatSwarmLevel1EpochId({
    activeLevelPhase: activeMusicMode,
    phaseVariant,
    sectionIntent: String(directorLanePlan?.__pressure?.sectionIntent || '').trim().toLowerCase(),
    sectionId: String(composer?.sectionId || 'default').trim().toLowerCase(),
    barIndex: currentBarIndex,
  });
  const level1CounterRhythmEpochLocked = fullTextureActive
    && level1SupportPolicy.counterRhythmFamilyScope === 'epoch_locked';
  const level1PreferredCounterRhythmFamily = String(level1SupportPolicy.preferredCounterRhythmFamily || '').trim().toLowerCase()
    || 'rhythm_lane';
  if (level1CounterRhythmEpochLocked) {
    if (String(composerRuntime.__bsLevel1CounterRhythmEpochId || '') !== level1EpochId) {
      composerRuntime.__bsLevel1CounterRhythmEpochId = level1EpochId;
      composerRuntime.__bsLevel1CounterRhythmFamily = level1PreferredCounterRhythmFamily;
    }
  } else {
    composerRuntime.__bsLevel1CounterRhythmEpochId = '';
    composerRuntime.__bsLevel1CounterRhythmFamily = '';
  }
  const level1CounterRhythmFamily = String(composerRuntime.__bsLevel1CounterRhythmFamily || '').trim().toLowerCase()
    || 'secondary_bridge_backbeat';
  const arrangementSectionId = normalizeArrangementSectionId(composer.sectionId || '');
  const primaryLoopReserveWindowActive = currentBarIndex >= 12;
  const explicitNoLeadSection = false;
  const persistentLeadCoverageRequested = primaryLoopReserveWindowActive && !explicitNoLeadSection;
  const primaryLoopNeedsGroupCoverage = responseAllowsGroups && persistentLeadCoverageRequested;
  const earlyBackbeatRecoveryWindowActive = sessionAgeBars <= 10;
  const introForcedDesiredGroups = introStage === 'rhythm_only'
    ? 1
    : ((introStage === 'soft_ramp' || (earlyBackbeatRecoveryWindowActive && pulseCarrierReadyForBackbeat))
      ? 2
      : -1);
  const desiredGroupsBase = introForcedDesiredGroups > 0
    ? Math.max(
      0,
      Math.min(
        introForcedDesiredGroups,
        Math.max(0, Math.trunc(Number(pacingCaps.maxComposerGroups) || 0))
      )
    )
    : (
      responseAllowsGroups
        ? Math.max(
          0,
          Math.min(
            desiredGroupsRaw,
            Math.max(0, Math.trunc(Number(pacingCaps.maxComposerGroups) || 0))
          )
        )
        : 0
    );
  const desiredGroups = primaryLoopNeedsGroupCoverage
    ? Math.max(
      protectedMergeTextureWindow
        ? 3
        : (currentBarIndex >= 12 ? 2 : 1),
      Math.min(
        Math.max(
          protectedMergeTextureWindow
            ? 3
            : (currentBarIndex >= 12 ? 2 : 1),
          Math.trunc(Number(pacingCaps.maxComposerGroups) || 0)
        ),
        desiredGroupsBase
      )
    )
    : desiredGroupsBase;
  const sectionContinuityKey = `${String(composer.sectionId || 'default')}:${Math.max(0, Math.trunc(Number(composer.cycle) || 0))}`;
  const sectionKey = `${sectionContinuityKey}:${motifScopeKey}`;
  const isFoundationBufferGroup = (group) => (
    !!group
    && (
      String(group?.templateId || '').trim() === 'foundation-buffer'
      || String(group?.sectionId || '').trim() === 'foundation-buffer'
      || String(group?.sectionKey || '').trim() === 'foundation-buffer'
    )
  );
  const hasLiveMembers = (groupLike) => {
    const group = groupLike && typeof groupLike === 'object' ? groupLike : null;
    if (!group) return false;
    if (group.memberIds instanceof Set) return group.memberIds.size > 0;
    if (Array.isArray(group.memberIds)) return group.memberIds.length > 0;
    return false;
  };
  const isBassLikeGroup = (groupLike) => {
    const group = groupLike && typeof groupLike === 'object' ? groupLike : null;
    if (!group) return false;
    return String(group?.role || '').trim().toLowerCase() === 'bass'
      || String(group?.musicLaneId || '').trim().toLowerCase() === 'foundation_lane';
  };
  const isPromotableLeadCandidate = (groupLike) => {
    const group = groupLike && typeof groupLike === 'object' ? groupLike : null;
    if (!group || group.active !== true || group.retiring) return false;
    if (activeMusicMode !== 'lead_entry_merge' && activeMusicMode !== 'full_texture') return false;
    if (isFoundationBufferGroup(group)) return false;
    if (isPersistentIntroSlotCarrier(group)) return false;
    if (String(group?.soloCarrierType || '').trim()) return false;
    const normalizedProfileSourceType = normalizeComposerProfileSourceType(group?.musicProfileSourceType);
    const introProfileSourceType = getIntroSlotProfileSourceType(group);
    if (
      normalizedProfileSourceType === 'spawner_rhythm_backbeat'
      || normalizedProfileSourceType === 'rhythm_lane_backbeat'
      || introProfileSourceType === 'spawner_rhythm_backbeat'
    ) {
      return false;
    }
    if (!hasLiveMembers(group)) return false;
    return !isBassLikeGroup(group);
  };
  const hasPendingPrimaryLoopIdentity = (groupLike) => {
    const group = groupLike && typeof groupLike === 'object' ? groupLike : null;
    if (!group || group.active !== true || group.retiring) return false;
    if (String(group?.musicLaneId || '').trim().toLowerCase() !== 'primary_loop_lane') return false;
    const musicProfileSourceType = normalizeComposerProfileSourceType(group?.musicProfileSourceType);
    const introProfileSourceType = getIntroSlotProfileSourceType(group);
    if (musicProfileSourceType === 'lead_melody') return true;
    if (
      musicProfileSourceType === 'spawner_rhythm_backbeat'
      || musicProfileSourceType === 'rhythm_lane_backbeat'
      || introProfileSourceType === 'spawner_rhythm_backbeat'
    ) {
      return false;
    }
    return hasPrimaryLeadPersistence(group) || hasRecentPrimaryLeadCoverageMemory(group);
  };
  const hasActivePrimaryLoopCoverage = (groupLike) => {
    const group = groupLike && typeof groupLike === 'object' ? groupLike : null;
    if (!group || group.active !== true || group.retiring) return false;
    if (String(group?.musicLaneId || '').trim().toLowerCase() !== 'primary_loop_lane') return false;
    if (hasLiveMembers(group)) return true;
    return hasPendingPrimaryLoopIdentity(group);
  };
  const hasPendingSecondaryLoopIdentity = (groupLike) => {
    const group = groupLike && typeof groupLike === 'object' ? groupLike : null;
    if (!group || group.active !== true || group.retiring) return false;
    if (String(group?.musicLaneId || '').trim().toLowerCase() !== 'secondary_loop_lane') return false;
    const normalizedProfileSourceType = normalizeComposerProfileSourceType(group?.musicProfileSourceType);
    const normalizedTemplateId = String(group?.templateId || '').trim().toLowerCase();
    if (
      normalizedProfileSourceType === 'answer_ornament'
      || String(group?.callResponseLane || '').trim().toLowerCase() === 'response'
    ) {
      return false;
    }
    if (level1CounterRhythmEpochLocked) {
      if (level1CounterRhythmFamily === 'rhythm_lane') {
        return normalizedProfileSourceType === 'rhythm_lane'
          || normalizedProfileSourceType === 'rhythm_lane_backbeat';
      }
      return normalizedProfileSourceType === 'secondary_bridge_backbeat'
        || normalizedProfileSourceType === 'spawner_rhythm_backbeat'
        || normalizedProfileSourceType === 'rhythm_lane_backbeat'
        || normalizedTemplateId === 'secondary_loop_bridge_group'
        || normalizedTemplateId === 'intro_percussion_group';
    }
    if (
      protectedMergeTextureWindow
      && (
        normalizedProfileSourceType === 'secondary_bridge_backbeat'
        || normalizedProfileSourceType === 'spawner_rhythm_backbeat'
        || normalizedProfileSourceType === 'rhythm_lane'
        || normalizedProfileSourceType === 'rhythm_lane_backbeat'
        || normalizedTemplateId === 'secondary_loop_bridge_group'
        || normalizedTemplateId === 'intro_percussion_group'
      )
    ) {
      return true;
    }
    return normalizedProfileSourceType === 'secondary_bridge_backbeat'
      || normalizedProfileSourceType === 'spawner_rhythm_backbeat'
      || normalizedProfileSourceType === 'rhythm_lane'
      || normalizedProfileSourceType === 'rhythm_lane_backbeat'
      || normalizedTemplateId === 'secondary_loop_bridge_group'
      || normalizedTemplateId === 'intro_percussion_group';
  };
  const isStructuralSecondaryLoopCarrier = (groupLike) => {
    const group = groupLike && typeof groupLike === 'object' ? groupLike : null;
    if (!group || group.active !== true || group.retiring) return false;
    if (String(group?.musicLaneId || '').trim().toLowerCase() !== 'secondary_loop_lane') return false;
    if (String(group?.callResponseLane || '').trim().toLowerCase() === 'response') return false;
    if (normalizeComposerProfileSourceType(group?.musicProfileSourceType) === 'answer_ornament') return false;
    return hasPendingSecondaryLoopIdentity(group);
  };
  const hasRecentSecondaryLoopCoverageMemory = (groupLike) => {
    const group = groupLike && typeof groupLike === 'object' ? groupLike : null;
    if (!isStructuralSecondaryLoopCarrier(group)) return false;
    const lastSeenBarIndex = Math.max(-1, Math.trunc(Number(group?.__bsSecondaryCoverageSeenBarIndex) || -1));
    if (lastSeenBarIndex < 0) return false;
    return (currentBarIndex - lastSeenBarIndex) <= 1;
  };
  const hasActiveSecondaryLoopCoverage = (groupLike) => {
    const group = groupLike && typeof groupLike === 'object' ? groupLike : null;
    if (!group || group.active !== true || group.retiring) return false;
    if (String(group?.musicLaneId || '').trim().toLowerCase() !== 'secondary_loop_lane') return false;
    const normalizedProfileSourceType = normalizeComposerProfileSourceType(group?.musicProfileSourceType);
    if (
      normalizedProfileSourceType === 'answer_ornament'
      || String(group?.callResponseLane || '').trim().toLowerCase() === 'response'
    ) {
      return false;
    }
    if (hasLiveMembers(group)) return true;
    return hasPendingSecondaryLoopIdentity(group);
  };
  const countsAsLiveSectionGroup = (groupLike) => {
    const group = groupLike && typeof groupLike === 'object' ? groupLike : null;
    if (!group || group.active !== true || group.retiring) return false;
    if (isFoundationBufferGroup(group)) return false;
    if (isPersistentIntroSlotCarrier(group)) return hasLiveMembers(group);
    return hasLiveMembers(group)
      || hasPendingPrimaryLoopIdentity(group)
      || hasRecentPrimaryLeadCoverageMemory(group)
      || hasPrimaryLeadPersistence(group)
      || hasPendingSecondaryLoopIdentity(group)
      || hasRecentSecondaryLoopCoverageMemory(group)
      || hasRecentAnswerOrnamentCoverageMemory(group)
      || hasFullTextureAnswerOrnamentPersistence(group);
  };
  const hasProtectedSecondaryLoopContinuity = (groupLike) => {
    const group = groupLike && typeof groupLike === 'object' ? groupLike : null;
    if (!group || group.active !== true || group.retiring) return false;
    const groupContinuityKey = String(group?.sectionContinuityKey || '').trim().toLowerCase();
    if (groupContinuityKey && groupContinuityKey !== String(sectionContinuityKey || '').trim().toLowerCase()) return false;
    return hasActiveSecondaryLoopCoverage(group)
      || hasPendingSecondaryLoopIdentity(group)
      || hasRecentSecondaryLoopCoverageMemory(group);
  };
  const isPrimaryLeadMelodyGroup = (groupLike) => {
    const group = groupLike && typeof groupLike === 'object' ? groupLike : null;
    if (!group || group.active !== true || group.retiring) return false;
    if (String(group?.musicLaneId || '').trim().toLowerCase() !== 'primary_loop_lane') return false;
    return normalizeComposerProfileSourceType(group?.musicProfileSourceType) === 'lead_melody';
  };
  const hasRecentPrimaryLeadCoverageMemory = (groupLike) => {
    const group = groupLike && typeof groupLike === 'object' ? groupLike : null;
    if (!isPrimaryLeadMelodyGroup(group)) return false;
    const lastSeenBarIndex = Math.max(-1, Math.trunc(Number(group?.__bsPrimaryLeadSeenBarIndex) || -1));
    if (lastSeenBarIndex < 0) return false;
    return (currentBarIndex - lastSeenBarIndex) <= 2;
  };
  const hasPrimaryLeadPersistence = (groupLike) => {
    const group = groupLike && typeof groupLike === 'object' ? groupLike : null;
    if (!isPrimaryLeadMelodyGroup(group)) return false;
    const persistUntilBar = Math.max(-1, Math.trunc(Number(group?.__bsPrimaryLeadPersistUntilBar) || -1));
    return persistUntilBar >= currentBarIndex;
  };
  const isAnswerOrnamentGroup = (groupLike) => {
    const group = groupLike && typeof groupLike === 'object' ? groupLike : null;
    if (!group || group.active !== true || group.retiring) return false;
    return normalizeComposerProfileSourceType(group?.musicProfileSourceType) === 'answer_ornament'
      || String(group?.callResponseLane || '').trim().toLowerCase() === 'response';
  };
  const hasRecentAnswerOrnamentCoverageMemory = (groupLike) => {
    const group = groupLike && typeof groupLike === 'object' ? groupLike : null;
    if (!isAnswerOrnamentGroup(group)) return false;
    const lastSeenBarIndex = Math.max(-1, Math.trunc(Number(group?.__bsAnswerOrnamentSeenBarIndex) || -1));
    if (lastSeenBarIndex < 0) return false;
    return (currentBarIndex - lastSeenBarIndex) <= 1;
  };
  const hasFullTextureAnswerOrnamentPersistence = (groupLike) => {
    const group = groupLike && typeof groupLike === 'object' ? groupLike : null;
    if (!group || group.active !== true || group.retiring) return false;
    if (activeMusicMode !== 'full_texture') return false;
    if (!isAnswerOrnamentGroup(group)) return false;
    const persistUntilBar = Math.max(-1, Math.trunc(Number(group?.__bsFullTextureAnswerOrnamentPersistUntilBar) || -1));
    return persistUntilBar >= currentBarIndex;
  };
  const hasProtectedAnswerOrnamentContinuity = (groupLike) => {
    const group = groupLike && typeof groupLike === 'object' ? groupLike : null;
    if (!group || group.active !== true || group.retiring) return false;
    const groupContinuityKey = String(group?.sectionContinuityKey || '').trim().toLowerCase();
    if (groupContinuityKey && groupContinuityKey !== String(sectionContinuityKey || '').trim().toLowerCase()) return false;
    return isAnswerOrnamentGroup(group)
      && (hasLiveMembers(group) || hasRecentAnswerOrnamentCoverageMemory(group) || hasFullTextureAnswerOrnamentPersistence(group));
  };
  const rankPrimaryLeadGroup = (groupLike) => {
    const group = groupLike && typeof groupLike === 'object' ? groupLike : null;
    if (!group) return -1;
    let score = 0;
    if (hasLiveMembers(group)) score += 100;
    if (String(group?.callResponseLane || '').trim().toLowerCase() === 'call') score += 50;
    if (String(group?.soloCarrierType || '').trim()) score -= 25;
    score += Math.max(0, Math.trunc(Number(group?.musicParticipationGain) || 0) * 10);
    score += Math.max(0, 10000 - Math.trunc(Number(group?.id) || 0)) / 10000;
    return score;
  };
  const getCanonicalPrimaryLeadGroupId = () => Math.max(
    0,
    Math.trunc(Number(leadAuthorityRuntime?.canonicalGroupId) || 0)
      || Math.trunc(Number(composer?.__bsCanonicalPrimaryLeadGroupId) || 0)
  );
  const setCanonicalPrimaryLeadGroup = (groupLike = null) => {
    const group = groupLike && typeof groupLike === 'object' ? groupLike : null;
    const canonicalGroupId = Math.max(0, Math.trunc(Number(group?.id) || 0));
    const sectionContinuityKey = String(group?.sectionContinuityKey || '').trim().toLowerCase();
    const previousLeadInstrumentId = String(leadAuthorityRuntime?.instrumentId || composer?.__bsCanonicalPrimaryLeadInstrumentId || '').trim();
    const instrumentId = String(
      group?.__bsCanonicalLeadInstrumentId
      || group?.musicLaneInstrumentId
      || group?.instrumentId
      || group?.instrument
      || ''
    ).trim();
    const continuityId = String(group?.continuityId || '').trim();
    composer.__bsCanonicalPrimaryLeadGroupId = canonicalGroupId;
    composer.__bsCanonicalPrimaryLeadSectionContinuityKey = sectionContinuityKey;
    composer.__bsCanonicalPrimaryLeadInstrumentId = instrumentId;
    composer.__bsCanonicalPrimaryLeadContinuityId = continuityId;
    if (leadAuthorityRuntime) {
      leadAuthorityRuntime.canonicalGroupId = canonicalGroupId;
      leadAuthorityRuntime.sectionContinuityKey = sectionContinuityKey;
      leadAuthorityRuntime.instrumentId = instrumentId;
      leadAuthorityRuntime.continuityId = continuityId;
      leadAuthorityRuntime.lastSeenBar = currentBarIndex;
      leadAuthorityRuntime.lastValidLeadBar = currentBarIndex;
      leadAuthorityRuntime.active = true;
      leadAuthorityRuntime.activeLevelPhase = String(musicModeRuntime?.activeLevelPhase || '').trim().toLowerCase() || 'intro_teach';
      leadAuthorityRuntime.activeMusicMode = String(musicModeRuntime?.activeMusicMode || '').trim().toLowerCase() || 'intro_pulse';
      leadAuthorityRuntime.source = 'lifecycle_canonical';
      if (instrumentId && instrumentId !== previousLeadInstrumentId) {
        try {
          noteMusicSystemEvent?.('music_primary_lead_instrument_change', {
            source: 'lifecycle_canonical',
            previousInstrumentId: previousLeadInstrumentId,
            instrumentId: String(instrumentId || '').trim(),
            canonicalLeadGroupId: canonicalGroupId,
            canonicalLeadContinuityId: continuityId,
            activeLevelPhase: String(leadAuthorityRuntime?.activeLevelPhase || '').trim().toLowerCase(),
            activeMusicMode: String(leadAuthorityRuntime?.activeMusicMode || '').trim().toLowerCase(),
          }, {
            beatIndex: Math.max(0, currentBarIndex * 4),
            barIndex: currentBarIndex,
          });
        } catch {}
      }
    }
  };
  const clearCanonicalPrimaryLeadGroup = () => {
    composer.__bsCanonicalPrimaryLeadGroupId = 0;
    composer.__bsCanonicalPrimaryLeadSectionContinuityKey = '';
    composer.__bsCanonicalPrimaryLeadInstrumentId = '';
    composer.__bsCanonicalPrimaryLeadContinuityId = '';
    if (leadAuthorityRuntime) {
      leadAuthorityRuntime.canonicalGroupId = 0;
      leadAuthorityRuntime.sectionContinuityKey = '';
      leadAuthorityRuntime.instrumentId = '';
      leadAuthorityRuntime.continuityId = '';
      leadAuthorityRuntime.active = false;
      leadAuthorityRuntime.source = 'lifecycle_clear';
    }
  };
  const rankAnswerOrnamentGroup = (groupLike) => {
    const group = groupLike && typeof groupLike === 'object' ? groupLike : null;
    if (!group) return -1;
    let score = 0;
    if (hasLiveMembers(group)) score += 100;
    if (String(group?.musicLaneId || '').trim().toLowerCase() === 'secondary_loop_lane') score += 25;
    if (String(group?.musicLaneLayer || '').trim().toLowerCase() === 'loops') score += 10;
    score += Math.max(0, 10000 - Math.trunc(Number(group?.id) || 0)) / 10000;
    return score;
  };
  const getDirectorGroupFallbackGain = () => {
    const protectedHold = (plan) => !!plan && plan.protected === true && String(plan.continuityBias || '').trim().toLowerCase() === 'hold';
    if (protectedHold(supportPlan) || protectedHold(answerPlan)) return 0.5;
    const blend = (plan) => !!plan && String(plan.continuityBias || '').trim().toLowerCase() === 'blend';
    if (blend(supportPlan) || blend(answerPlan)) return 0.46;
    return 0.42;
  };
  const hasLeadMergeSecondaryBridgePersistence = (groupLike) => {
    const group = groupLike && typeof groupLike === 'object' ? groupLike : null;
    if (!group || group.active !== true || group.retiring) return false;
    if (activeMusicMode !== 'lead_entry_merge') return false;
    if (String(group?.musicLaneId || '').trim().toLowerCase() !== 'secondary_loop_lane') return false;
    if (normalizeComposerProfileSourceType(group?.musicProfileSourceType) !== 'secondary_bridge_backbeat') return false;
    if (String(group?.callResponseLane || '').trim().toLowerCase() === 'response') return false;
    const persistUntilBar = Math.max(-1, Math.trunc(Number(group?.__bsLeadMergeSecondaryPersistUntilBar) || -1));
    return persistUntilBar >= currentBarIndex || activeMusicMode === 'lead_entry_merge';
  };

  for (let i = composerEnemyGroups.length - 1; i >= 0; i--) {
    const g = composerEnemyGroups[i];
    if (!g) {
      composerEnemyGroups.splice(i, 1);
      continue;
    }
    const aliveIds = getAliveIdsForGroup(g);
    g.memberIds = aliveIds;
    if (g.retiring || g.active === false) {
      g.lifecycleState = normalizeLifecycleState(g.lifecycleState, 'retiring');
      if (!aliveIds.size) composerEnemyGroups.splice(i, 1);
      continue;
    }
    g.lifecycleState = normalizeLifecycleState(g.lifecycleState, 'active');
    if (!String(g?.sectionContinuityKey || '').trim()) {
      g.sectionContinuityKey = `${String(g?.sectionId || composer?.sectionId || 'default')}:${Math.max(0, Math.trunc(Number(composer?.cycle ?? g?.cycle ?? 0) || 0))}`;
    }
    if (hasActiveSecondaryLoopCoverage(g) || hasPendingSecondaryLoopIdentity(g)) {
      g.__bsSecondaryCoverageSeenBarIndex = currentBarIndex;
    }
    if (isPrimaryLeadMelodyGroup(g) && (hasLiveMembers(g) || hasPrimaryLeadPersistence(g))) {
      g.__bsPrimaryLeadSeenBarIndex = currentBarIndex;
      if (protectedMergeTextureWindow) {
        g.__bsPrimaryLeadPersistUntilBar = Math.max(
          Math.max(-1, Math.trunc(Number(g?.__bsPrimaryLeadPersistUntilBar) || -1)),
          currentBarIndex + (activeMusicMode === 'full_texture' ? 8 : 6)
        );
      }
    }
    if (isAnswerOrnamentGroup(g) && (hasLiveMembers(g) || hasFullTextureAnswerOrnamentPersistence(g))) {
      g.__bsAnswerOrnamentSeenBarIndex = currentBarIndex;
    }
    if (g.sectionKey !== sectionKey) {
      const carryAcrossSection = isPrimaryLeadMelodyGroup(g)
        || hasRecentPrimaryLeadCoverageMemory(g)
        || hasPrimaryLeadPersistence(g)
        || hasProtectedSecondaryLoopContinuity(g)
        || hasProtectedAnswerOrnamentContinuity(g)
        || isPersistentIntroSlotCarrier(g);
      if (carryAcrossSection) {
        g.sectionKey = sectionKey;
        g.sectionId = String(composer?.sectionId || g.sectionId || 'default');
        g.sectionContinuityKey = sectionContinuityKey;
      } else {
        // Off-section groups should age out naturally; don't retag or replenish them into the new section.
        g.lifecycleState = normalizeLifecycleState(g.lifecycleState, 'retiring');
        if (!aliveIds.size) composerEnemyGroups.splice(i, 1);
        continue;
      }
    }
    const introGroupBodyLocked = isPersistentIntroSlotCarrier(g)
      && String(g?.introCarrierBodyType || '').trim().toLowerCase() === 'group';
    const normalizedTemplateId = String(g?.templateId || '').trim().toLowerCase();
    const ordinaryGroupedMusicalRole = (
      !introGroupBodyLocked
      && !isFoundationBufferGroup(g)
      && !String(g?.soloCarrierType || '').trim()
      && String(g?.introCarrierBodyType || '').trim().toLowerCase() !== 'solo'
      && !normalizedTemplateId.startsWith('solo-')
    );
    const groupedFloor = ordinaryGroupedMusicalRole ? 2 : 1;
    if (!introGroupBodyLocked && Number(pacingCaps.maxComposerPerformers) > 0) {
      g.performers = Math.max(
        groupedFloor,
        Math.min(
          Math.trunc(Number(g.performers) || groupedFloor),
          Math.max(groupedFloor, Math.trunc(Number(pacingCaps.maxComposerPerformers) || groupedFloor))
        )
      );
    }
    if (!introGroupBodyLocked && Number(pacingCaps.maxComposerGroupSize) > 0) {
      g.size = Math.max(
        groupedFloor,
        Math.min(
          Math.trunc(Number(g.size) || groupedFloor),
          Math.max(groupedFloor, Math.trunc(Number(pacingCaps.maxComposerGroupSize) || groupedFloor))
        )
      );
    }
    const need = Math.max(0, Math.trunc(Number(g.size) || 0) - aliveIds.size);
    if (need > 0) {
      spawnComposerGroupOffscreenMembers(g, need);
    }
  }

  const sameSection = composerEnemyGroups.filter((g) => {
    if (!g || !countsAsLiveSectionGroup(g)) return false;
    if (g.sectionKey === sectionKey) return true;
    const groupContinuityKey = String(g?.sectionContinuityKey || '').trim().toLowerCase();
    if (groupContinuityKey !== String(sectionContinuityKey || '').trim().toLowerCase()) return false;
    return hasProtectedSecondaryLoopContinuity(g);
  });
  const canonicalPrimaryLeadGroupId = getCanonicalPrimaryLeadGroupId();
  const activePrimaryLeadGroups = composerEnemyGroups.filter((group) => isPrimaryLeadMelodyGroup(group));
  let activeGlobalPrimaryLead = activePrimaryLeadGroups.find((group) => Math.trunc(Number(group?.id) || 0) === canonicalPrimaryLeadGroupId) || null;
  if (!activeGlobalPrimaryLead) {
    activeGlobalPrimaryLead = activePrimaryLeadGroups
      .slice()
      .sort((a, b) => rankPrimaryLeadGroup(b) - rankPrimaryLeadGroup(a))[0] || null;
  }
  const activeGlobalPrimaryLeadPresent = !!activeGlobalPrimaryLead;
  if (activeGlobalPrimaryLeadPresent) setCanonicalPrimaryLeadGroup(activeGlobalPrimaryLead);
  else if (canonicalPrimaryLeadGroupId > 0) clearCanonicalPrimaryLeadGroup();
  if (
    activeGlobalPrimaryLead
    && !sameSection.includes(activeGlobalPrimaryLead)
  ) {
    activeGlobalPrimaryLead.sectionKey = sectionKey;
    activeGlobalPrimaryLead.sectionId = String(composer?.sectionId || activeGlobalPrimaryLead.sectionId || 'default');
    activeGlobalPrimaryLead.lifecycleState = 'active';
    activeGlobalPrimaryLead.musicParticipationGain = 1;
    sameSection.push(activeGlobalPrimaryLead);
  }
  const activePersistentIntroSlotGroups = sameSection.filter((g) => isPersistentIntroSlotCarrier(g));
  const globalSecondaryLoopCoverageGroups = composerEnemyGroups.filter((group) => (
    hasActiveSecondaryLoopCoverage(group) || hasRecentSecondaryLoopCoverageMemory(group)
  ));
  const activeSecondaryLoopCoveragePresent = globalSecondaryLoopCoverageGroups.length > 0;
  let activePrimaryLoopCoveragePresent = sameSection.some((group) => hasActivePrimaryLoopCoverage(group));
    if (activeGlobalPrimaryLeadPresent) activePrimaryLoopCoveragePresent = true;
  const earlyIntroBridgeActive = activePersistentIntroSlotGroups.length > 0
    && (
      (introStage !== 'none' && introStage !== 'ended')
      || earlyBackbeatRecoveryWindowActive
    );
  let promotableLeadCandidatePresent = sameSection.some((group) => isPromotableLeadCandidate(group));
  if (activeGlobalPrimaryLeadPresent) {
    promotableLeadCandidatePresent = false;
  }
  if (primaryLoopNeedsGroupCoverage && !earlyIntroBridgeActive && !activePrimaryLoopCoveragePresent && !activeGlobalPrimaryLeadPresent) {
    const promotableLeadCandidate = sameSection.find((group) => isPromotableLeadCandidate(group)) || null;
    if (promotableLeadCandidate) {
      promotableLeadCandidate.role = 'lead';
      promotableLeadCandidate.musicLaneId = 'primary_loop_lane';
      promotableLeadCandidate.musicLaneLayer = 'loops';
      promotableLeadCandidate.callResponseLane = 'call';
      promotableLeadCandidate.musicProfileSourceType = 'lead_melody';
      promotableLeadCandidate.lifecycleState = 'active';
      promotableLeadCandidate.musicParticipationGain = 1;
      promotableLeadCandidate.__bsPrimaryLeadSeenBarIndex = currentBarIndex;
      promotableLeadCandidate.__bsPrimaryLeadPersistUntilBar = Math.max(
        Math.max(-1, Math.trunc(Number(promotableLeadCandidate?.__bsPrimaryLeadPersistUntilBar) || -1)),
        currentBarIndex + 8
      );
      setCanonicalPrimaryLeadGroup(promotableLeadCandidate);
      activePrimaryLoopCoveragePresent = true;
      promotableLeadCandidatePresent = true;
      try {
        noteMusicSystemEvent?.('music_composer_group_state', {
          phase: 'lead_candidate_promoted',
          groupId: Math.trunc(Number(promotableLeadCandidate?.id) || 0),
          reason: 'primary_loop_group_promotion',
          role: String(promotableLeadCandidate?.role || '').trim().toLowerCase(),
          musicLaneId: String(promotableLeadCandidate?.musicLaneId || '').trim().toLowerCase(),
          callResponseLane: String(promotableLeadCandidate?.callResponseLane || '').trim().toLowerCase(),
          stage: String(promotableLeadCandidate?.musicProfileSourceType || '').trim().toLowerCase(),
        }, {
          beatIndex: Math.max(0, currentBarIndex * 4),
          barIndex: currentBarIndex,
        });
      } catch {}
    }
  }
  let reservedLeadSpawnNeeded = primaryLoopReserveWindowActive
    && primaryLoopNeedsGroupCoverage
    && !activePrimaryLoopCoveragePresent
    && !promotableLeadCandidatePresent;
  const secondaryLoopCoverageRequested = level1CounterRhythmAllowed
    && primaryLoopReserveWindowActive
    && activeGlobalPrimaryLeadPresent
    && (
      leadMergeReducedSupportActive
      || currentBarIndex >= 12
      || (
        secondaryLoopPlan?.active === true
        && String(secondaryLoopPlan?.preferredCarrier || '').trim().toLowerCase() === 'group'
        && (
          supportPlan?.active === true
          || answerPlan?.active === true
          || String(secondaryLoopPlan?.continuityBias || '').trim().toLowerCase() === 'hold'
          || String(secondaryLoopPlan?.continuityBias || '').trim().toLowerCase() === 'blend'
        )
      )
    );
  let reservedSecondaryLoopSpawnNeeded = secondaryLoopCoverageRequested
    && !activeSecondaryLoopCoveragePresent;
  if (reservedSecondaryLoopSpawnNeeded && hasPendingSecondaryLoopReservation()) {
    reservedSecondaryLoopSpawnNeeded = false;
  }
  if (activeGlobalPrimaryLeadPresent) reservedLeadSpawnNeeded = false;
  if (leadMergeReducedSupportActive) {
    try {
      const secondaryBridgeGroups = composerEnemyGroups.filter((group) => (
        group
        && group.active === true
        && !group.retiring
        && String(group?.musicLaneId || '').trim().toLowerCase() === 'secondary_loop_lane'
        && String(group?.callResponseLane || '').trim().toLowerCase() !== 'response'
        && (
          hasActiveSecondaryLoopCoverage(group)
          || hasPendingSecondaryLoopIdentity(group)
          || hasRecentSecondaryLoopCoverageMemory(group)
        )
      ));
      noteMusicSystemEvent?.('music_secondary_bridge_coverage_trace', {
        activeMusicMode,
        phaseVariant,
        activeSecondaryLoopCoveragePresent,
        reservedSecondaryLoopSpawnNeeded,
        pendingSecondaryLoopReservation: hasPendingSecondaryLoopReservation() === true,
        bridgeGroupCount: secondaryBridgeGroups.length,
        bridgeGroups: secondaryBridgeGroups.slice(0, 6).map((group) => ({
          groupId: Math.trunc(Number(group?.id) || 0),
          active: group?.active === true,
          retiring: group?.retiring === true,
          lifecycleState: String(group?.lifecycleState || '').trim().toLowerCase(),
          memberCount: hasLiveMembers(group)
            ? (group?.memberIds instanceof Set
              ? group.memberIds.size
              : (Array.isArray(group?.memberIds) ? group.memberIds.length : 0))
            : 0,
          hasActiveCoverage: hasActiveSecondaryLoopCoverage(group),
          hasPendingIdentity: hasPendingSecondaryLoopIdentity(group),
          hasRecentCoverageMemory: hasRecentSecondaryLoopCoverageMemory(group),
          persistUntilBar: Math.max(-1, Math.trunc(Number(group?.__bsLeadMergeSecondaryPersistUntilBar) || -1)),
          musicParticipationGain: Number(group?.musicParticipationGain) || 0,
        })),
      }, {
        beatIndex: Math.max(0, currentBarIndex * 4),
        barIndex: currentBarIndex,
      });
    } catch {}
  }
  try {
    noteMusicSystemEvent?.('music_primary_loop_coverage_status', {
      sectionId: String(composer?.sectionId || 'default').trim().toLowerCase(),
      sectionKey: String(sectionKey || '').trim().toLowerCase(),
      motifScopeKey: String(motifScopeKey || '').trim().toLowerCase(),
      desiredGroups,
      primaryLoopReserveWindowActive,
      primaryLoopNeedsGroupCoverage,
      activePrimaryLoopCoveragePresent,
      activeSecondaryLoopCoveragePresent,
      activeGlobalPrimaryLeadPresent,
      promotableLeadCandidatePresent,
      reservedLeadSpawnNeeded,
      reservedSecondaryLoopSpawnNeeded,
      earlyIntroBridgeActive,
      sameSectionCount: sameSection.length,
      persistentIntroSlotGroupCount: activePersistentIntroSlotGroups.length,
    }, {
      beatIndex: Math.max(0, currentBarIndex * 4),
      barIndex: currentBarIndex,
    });
  } catch {}
  try {
    const leadSnapshot = activeGlobalPrimaryLead && typeof activeGlobalPrimaryLead === 'object'
      ? activeGlobalPrimaryLead
      : null;
      noteMusicSystemEvent?.('music_primary_lead_snapshot', {
      present: !!leadSnapshot,
      groupId: Math.trunc(Number(leadSnapshot?.id) || 0),
      canonicalGroupId: getCanonicalPrimaryLeadGroupId(),
      sectionId: String(leadSnapshot?.sectionId || '').trim().toLowerCase(),
      sectionKey: String(leadSnapshot?.sectionKey || '').trim().toLowerCase(),
      motifScopeKey: String(motifScopeKey || '').trim().toLowerCase(),
      musicLaneId: String(leadSnapshot?.musicLaneId || '').trim().toLowerCase(),
      musicProfileSourceType: String(leadSnapshot?.musicProfileSourceType || '').trim().toLowerCase(),
      active: leadSnapshot?.active === true,
      retiring: leadSnapshot?.retiring === true,
      lifecycleState: String(leadSnapshot?.lifecycleState || '').trim().toLowerCase(),
      memberCount: hasLiveMembers(leadSnapshot)
        ? (leadSnapshot?.memberIds instanceof Set
          ? leadSnapshot.memberIds.size
          : (Array.isArray(leadSnapshot?.memberIds) ? leadSnapshot.memberIds.length : 0))
        : 0,
      note: String(leadSnapshot?.note || '').trim(),
      instrumentId: String(leadSnapshot?.instrumentId || '').trim(),
      musicParticipationGain: Number(leadSnapshot?.musicParticipationGain) || 0,
      desiredGroups,
      primaryLoopNeedsGroupCoverage,
    }, {
      beatIndex: Math.max(0, currentBarIndex * 4),
      barIndex: currentBarIndex,
    });
  } catch {}
  const primaryLeadGroups = sameSection.filter((group) => isPrimaryLeadMelodyGroup(group));
  if (primaryLeadGroups.length > 1) {
    const canonicalPrimaryLead = primaryLeadGroups.find((group) => Math.trunc(Number(group?.id) || 0) === getCanonicalPrimaryLeadGroupId())
      || primaryLeadGroups.slice().sort((a, b) => rankPrimaryLeadGroup(b) - rankPrimaryLeadGroup(a))[0]
      || null;
    if (canonicalPrimaryLead) setCanonicalPrimaryLeadGroup(canonicalPrimaryLead);
    for (const duplicateLead of primaryLeadGroups) {
      if (!duplicateLead || duplicateLead === canonicalPrimaryLead) continue;
      retireGroup(duplicateLead, 'duplicate_primary_lead');
      try {
        noteMusicSystemEvent?.('music_composer_group_state', {
          phase: 'lead_deduplicated',
          groupId: Math.trunc(Number(duplicateLead?.id) || 0),
          reason: 'duplicate_primary_loop_lead',
          keptGroupId: Math.trunc(Number(canonicalPrimaryLead?.id) || 0),
          musicLaneId: String(duplicateLead?.musicLaneId || '').trim().toLowerCase(),
          callResponseLane: String(duplicateLead?.callResponseLane || '').trim().toLowerCase(),
          stage: String(duplicateLead?.musicProfileSourceType || '').trim().toLowerCase(),
        }, {
          beatIndex: Math.max(0, currentBarIndex * 4),
          barIndex: currentBarIndex,
        });
      } catch {}
    }
  }
  const answerOrnamentGroups = sameSection.filter((group) => isAnswerOrnamentGroup(group));
  if (fullTextureActive && !level1AnswerAllowed) {
    for (const disabledAnswerGroup of answerOrnamentGroups) {
      if (!disabledAnswerGroup) continue;
      retireGroup(disabledAnswerGroup, 'level1_answer_contract_disabled');
      try {
        noteMusicSystemEvent?.('music_composer_group_state', {
          phase: 'answer_ornament_retired',
          groupId: Math.trunc(Number(disabledAnswerGroup?.id) || 0),
          reason: 'level1_answer_contract_disabled',
          musicLaneId: String(disabledAnswerGroup?.musicLaneId || '').trim().toLowerCase(),
          callResponseLane: String(disabledAnswerGroup?.callResponseLane || '').trim().toLowerCase(),
          stage: String(disabledAnswerGroup?.musicProfileSourceType || '').trim().toLowerCase(),
        }, {
          beatIndex: Math.max(0, currentBarIndex * 4),
          barIndex: currentBarIndex,
        });
      } catch {}
    }
  } else if (answerOrnamentGroups.length > 1) {
    const canonicalOrnament = answerOrnamentGroups
      .slice()
      .sort((a, b) => rankAnswerOrnamentGroup(b) - rankAnswerOrnamentGroup(a))[0] || null;
    for (const duplicateOrnament of answerOrnamentGroups) {
      if (!duplicateOrnament || duplicateOrnament === canonicalOrnament) continue;
      retireGroup(duplicateOrnament, 'duplicate_answer_ornament');
      try {
        noteMusicSystemEvent?.('music_composer_group_state', {
          phase: 'answer_ornament_deduplicated',
          groupId: Math.trunc(Number(duplicateOrnament?.id) || 0),
          reason: 'duplicate_answer_ornament',
          keptGroupId: Math.trunc(Number(canonicalOrnament?.id) || 0),
          musicLaneId: String(duplicateOrnament?.musicLaneId || '').trim().toLowerCase(),
          callResponseLane: String(duplicateOrnament?.callResponseLane || '').trim().toLowerCase(),
          stage: String(duplicateOrnament?.musicProfileSourceType || '').trim().toLowerCase(),
        }, {
          beatIndex: Math.max(0, currentBarIndex * 4),
          barIndex: currentBarIndex,
        });
      } catch {}
    }
  }
  const rankedGroups = sameSection
    .slice()
    .sort((a, b) => (Math.trunc(Number(a?.id) || 0) - Math.trunc(Number(b?.id) || 0)));
  for (let i = 0; i < rankedGroups.length; i++) {
    const group = rankedGroups[i];
    const introSlotLocked = group?.introSlotLock === true
      && Math.max(-1, Math.trunc(Number(group?.introSlotLockUntilBar) || -1)) >= currentBarIndex;
    const introSlotPersistent = isPersistentIntroSlotCarrier(group);
    const primaryLoopCoverage = hasActivePrimaryLoopCoverage(group);
    const secondaryLoopCoverage = hasActiveSecondaryLoopCoverage(group) || hasRecentSecondaryLoopCoverageMemory(group);
    const forcedSecondaryBridgePersistence = hasLeadMergeSecondaryBridgePersistence(group);
    const primaryLeadPersistence = hasPrimaryLeadPersistence(group) || hasRecentPrimaryLeadCoverageMemory(group);
    const normalizedProfileSourceType = normalizeComposerProfileSourceType(group?.musicProfileSourceType);
    const pinnedPrimaryLead = String(group?.musicLaneId || '').trim().toLowerCase() === 'primary_loop_lane'
      && normalizedProfileSourceType === 'lead_melody';
    const pinnedStructuralSecondary = String(group?.musicLaneId || '').trim().toLowerCase() === 'secondary_loop_lane'
      && String(group?.callResponseLane || '').trim().toLowerCase() !== 'response';
    const pinnedAnswerOrnament = level1AnswerAllowed
      && isAnswerOrnamentGroup(group)
      && (
        hasProtectedAnswerOrnamentContinuity(group)
        || hasFullTextureAnswerOrnamentPersistence(group)
      );
    const baseShouldSchedule = i < desiredGroups
      || introSlotLocked
      || introSlotPersistent
      || primaryLoopCoverage
      || secondaryLoopCoverage
      || forcedSecondaryBridgePersistence
      || primaryLeadPersistence;
    const fullTextureLeadFirstTrim = activeMusicMode === 'full_texture'
      && activeGlobalPrimaryLeadPresent
      && !pinnedPrimaryLead
      && !pinnedStructuralSecondary
      && !forcedSecondaryBridgePersistence
      && !primaryLeadPersistence
      && (
        String(group?.callResponseLane || '').trim().toLowerCase() === 'response'
        || isAnswerOrnamentGroup(group)
      )
      && !pinnedAnswerOrnament
      && i >= Math.max(2, desiredGroups - 1);
    const shouldSchedule = baseShouldSchedule && !fullTextureLeadFirstTrim;
    group.musicParticipationGain = (shouldSchedule || pinnedPrimaryLead || pinnedStructuralSecondary) ? 1 : getDirectorGroupFallbackGain();
    group.lifecycleState = (shouldSchedule || pinnedPrimaryLead || pinnedStructuralSecondary) ? 'active' : 'deEmphasized';
  }

  if (earlyIntroBridgeActive) {
    const overflowFoundationGroups = rankedGroups.filter((group) => (
      group
      && group.active === true
      && !group.retiring
      && !isPersistentIntroSlotCarrier(group)
      && !hasActivePrimaryLoopCoverage(group)
      && !hasActiveSecondaryLoopCoverage(group)
      && isBassLikeGroup(group)
    ));
    for (const overflowGroup of overflowFoundationGroups) {
      retireGroup(overflowGroup, 'intro_bridge_foundation_overflow');
    }
  }

  const currentSectionCount = composerEnemyGroups
    .filter((g) => (
      g
      && g.sectionKey === sectionKey
      && countsAsLiveSectionGroup(g)
    ))
    .length;
  let effectiveCurrentSectionCount = currentSectionCount;
  if (activeGlobalPrimaryLeadPresent) {
    effectiveCurrentSectionCount = Math.max(effectiveCurrentSectionCount, desiredGroups);
  }
  const reservedCoverageSpawnNeeded = reservedLeadSpawnNeeded || reservedSecondaryLoopSpawnNeeded;
  if (!earlyIntroBridgeActive && reservedCoverageSpawnNeeded && effectiveCurrentSectionCount >= Math.max(0, Math.trunc(Number(pacingCaps.maxComposerGroups) || 0))) {
    const replaceableGroup = rankedGroups.find((group) => (
      group
      && !isPersistentIntroSlotCarrier(group)
      && !hasPrimaryLeadPersistence(group)
      && !hasRecentPrimaryLeadCoverageMemory(group)
      && !hasLeadMergeSecondaryBridgePersistence(group)
      && hasLiveMembers(group)
      && !hasActivePrimaryLoopCoverage(group)
      && (
        reservedLeadSpawnNeeded
          ? (isBassLikeGroup(group) && !hasActiveSecondaryLoopCoverage(group))
          : (!hasActiveSecondaryLoopCoverage(group) && !isAnswerOrnamentGroup(group))
      )
    )) || null;
    if (replaceableGroup) {
      retireGroup(replaceableGroup, reservedLeadSpawnNeeded ? 'lead_candidate_reserve' : 'secondary_loop_reserve');
      effectiveCurrentSectionCount = Math.max(0, effectiveCurrentSectionCount - 1);
      try {
        noteMusicSystemEvent?.('music_composer_group_state', {
          phase: reservedLeadSpawnNeeded ? 'lead_candidate_reserve' : 'secondary_loop_reserve',
          groupId: Math.trunc(Number(replaceableGroup?.id) || 0),
          reason: reservedLeadSpawnNeeded
            ? 'retire_bass_for_primary_loop_candidate'
            : 'retire_group_for_secondary_loop_bridge',
          primaryLoopNeedsGroupCoverage,
          secondaryLoopCoverageRequested,
          currentSectionCount,
          maxComposerGroups: Math.max(0, Math.trunc(Number(pacingCaps.maxComposerGroups) || 0)),
        }, {
          beatIndex: Math.max(0, currentBarIndex * 4),
          barIndex: currentBarIndex,
        });
      } catch {}
    }
  }
  const targetIntroProfilesBase = getTargetIntroProfiles();
  const shouldRecoverBackbeatProfile = (
    pulseCarrierReadyForBackbeat
    && earlyBackbeatRecoveryWindowActive
    && !activeSecondaryLoopCoveragePresent
  );
  const targetIntroProfiles = shouldRecoverBackbeatProfile
    ? Array.from(new Set([...targetIntroProfilesBase, 'spawner_rhythm_backbeat']))
    : targetIntroProfilesBase;
  const existingIntroProfiles = new Set(
    composerEnemyGroups
      .filter((g) => (
        g
        && g.sectionKey === sectionKey
        && g.active
        && !g.retiring
        && !isFoundationBufferGroup(g)
        && hasLiveMembers(g)
      ))
      .map((g) => getIntroSlotProfileSourceType(g))
      .filter(Boolean)
  );
  const requiredIntroProfiles = targetIntroProfiles.length > 0
    ? (
      existingIntroProfiles.has('spawner_rhythm_pulse')
        ? targetIntroProfiles
        : ['spawner_rhythm_pulse']
    )
    : [];
  const introMissingCount = requiredIntroProfiles.length > 0
    ? requiredIntroProfiles.filter((profile) => !existingIntroProfiles.has(profile)).length
    : 0;
  const missingIntroProfiles = requiredIntroProfiles.length > 0
    ? requiredIntroProfiles.filter((profile) => !existingIntroProfiles.has(profile))
    : [];
  const introBridgeBlocksGenericSpawn = requiredIntroProfiles.length === 0
    && earlyIntroBridgeActive;
  const genericGroupSpawnBlockedByIntroBridge = introBridgeBlocksGenericSpawn && !reservedLeadSpawnNeeded;
  const spawnCount = requiredIntroProfiles.length > 0
    ? Math.max(0, introMissingCount)
    : (
      earlyIntroBridgeActive && reservedCoverageSpawnNeeded
        ? 1
        : (genericGroupSpawnBlockedByIntroBridge ? 0 : Math.max(
            reservedCoverageSpawnNeeded ? 1 : 0,
            Math.max(0, desiredGroups - effectiveCurrentSectionCount)
          ))
    );
  for (let i = 0; i < spawnCount; i++) {
    const forcedIntroProfileSourceType = missingIntroProfiles[i] || '';
    const forcedProfileSourceType = forcedIntroProfileSourceType || (
      reservedLeadSpawnNeeded && i === 0
        ? 'lead_melody'
        : (reservedSecondaryLoopSpawnNeeded && i === 0 ? level1CounterRhythmFamily : '')
    );
    const groupIndex = sameSection.length + i;
    const template = pickTemplate(groupIndex);
    const templateId = String(template?.id || `template-${groupIndex}`);
    const motif = getComposerMotif(
      motifScopeKey,
      `enemy-group-${templateId}-${groupIndex}`,
      () => createComposerEnemyGroupProfile(groupIndex, template)
    );
    const group = createGroupFromMotif({
      groupIndex,
      sectionKey,
      composer,
      templateId,
      motif,
      pacingCaps,
      forcedProfileSourceType,
    });
    if (!group) continue;
    group.lifecycleState = normalizeLifecycleState(group.lifecycleState, 'active');
    group.sectionContinuityKey = sectionContinuityKey;
    if (
      leadMergeReducedSupportActive
      && String(forcedProfileSourceType || '').trim().toLowerCase() === 'secondary_bridge_backbeat'
    ) {
      group.__bsLeadMergeSecondaryPersistUntilBar = currentBarIndex + 4;
    }
    composerEnemyGroups.push(group);
    if (noteMusicSystemEvent && currentBarIndex < 24) {
      try {
        noteMusicSystemEvent('music_composer_group_state', {
          phase: 'creation_trace',
          groupId: Math.trunc(Number(group?.id) || 0),
          sectionId: String(group?.sectionId || composer?.sectionId || '').trim().toLowerCase(),
          introStage,
          sessionAgeBars,
          desiredGroups,
          currentSectionCount,
          groupIndex,
          reason: forcedProfileSourceType
            ? (
              forcedProfileSourceType === 'lead_melody'
                ? 'reserved_lead_spawn'
                : (reservedSecondaryLoopSpawnNeeded && !forcedIntroProfileSourceType
                  ? 'reserved_secondary_support_spawn'
                  : 'intro_required_profile')
            )
            : (genericGroupSpawnBlockedByIntroBridge ? 'blocked_generic' : 'generic_group_fill'),
          templateId: String(templateId || '').trim(),
          role: String(group?.role || '').trim().toLowerCase(),
          musicLaneId: String(group?.musicLaneId || '').trim().toLowerCase(),
          callResponseLane: String(group?.callResponseLane || '').trim().toLowerCase(),
          instrumentId: String(group?.instrumentId || group?.instrument || '').trim(),
          note: Array.isArray(group?.notes) && group.notes.length ? String(group.notes[0] || '').trim() : '',
          stage: String(forcedProfileSourceType || group?.introSlotProfileSourceType || group?.musicProfileSourceType || '').trim().toLowerCase(),
        }, {
          beatIndex: Math.max(0, currentBarIndex * 4),
        });
      } catch {}
    }
    spawnComposerGroupOffscreenMembers(group, Math.max(0, Math.trunc(Number(group.size) || 0)));
  }
}
