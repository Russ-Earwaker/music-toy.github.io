export function maintainComposerEnemyGroupsLifecycle(options = null) {
  const enabled = !!options?.enabled;
  if (!enabled) return;

  const composerEnemyGroups = Array.isArray(options?.composerEnemyGroups) ? options.composerEnemyGroups : [];
  const pacingCaps = options?.pacingCaps && typeof options.pacingCaps === 'object' ? options.pacingCaps : {};
  const composer = options?.composer && typeof options.composer === 'object' ? options.composer : {};
  const directorLanePlan = options?.directorLanePlan && typeof options.directorLanePlan === 'object' ? options.directorLanePlan : null;
  const introStage = String(options?.introStage || 'none').trim().toLowerCase();
  const sessionAgeBars = Math.max(0, Math.trunc(Number(options?.sessionAgeBars) || 0));
  const currentBarIndex = Math.max(0, Math.trunc(Number(options?.currentBarIndex) || 0));
  const motifScopeKey = String(options?.motifScopeKey || 'default');

  const getAliveIdsForGroup = typeof options?.getAliveIdsForGroup === 'function' ? options.getAliveIdsForGroup : (() => new Set());
  const spawnComposerGroupOffscreenMembers = typeof options?.spawnComposerGroupOffscreenMembers === 'function' ? options.spawnComposerGroupOffscreenMembers : (() => {});
  const pickTemplate = typeof options?.pickTemplate === 'function' ? options.pickTemplate : (() => null);
  const getComposerMotif = typeof options?.getComposerMotif === 'function' ? options.getComposerMotif : ((_scope, _id, factory) => (typeof factory === 'function' ? factory() : null));
  const createComposerEnemyGroupProfile = typeof options?.createComposerEnemyGroupProfile === 'function' ? options.createComposerEnemyGroupProfile : (() => ({}));
  const createGroupFromMotif = typeof options?.createGroupFromMotif === 'function' ? options.createGroupFromMotif : (() => null);
  const noteMusicSystemEvent = typeof options?.noteMusicSystemEvent === 'function' ? options.noteMusicSystemEvent : null;
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
  const getIntroSlotProfileSourceType = (groupLike) => {
    const group = groupLike && typeof groupLike === 'object' ? groupLike : null;
    if (!group) return '';
    return String(group?.introSlotProfileSourceType || group?.musicProfileSourceType || '').trim().toLowerCase();
  };
  const isPersistentIntroSlotCarrier = (groupLike) => {
    const group = groupLike && typeof groupLike === 'object' ? groupLike : null;
    if (!group || group?.retiring || group?.active === false) return false;
    const profile = getIntroSlotProfileSourceType(group);
    return profile === 'spawner_rhythm_pulse'
      || profile === 'spawner_rhythm_backbeat'
      || profile === 'spawner_rhythm_motion';
  };
  const getTargetIntroProfiles = () => {
    if (introStage === 'rhythm_only') return ['spawner_rhythm_pulse'];
    if (introStage === 'soft_ramp') {
      return sessionAgeBars >= 8
        ? ['spawner_rhythm_pulse', 'spawner_rhythm_backbeat']
        : ['spawner_rhythm_pulse'];
    }
    return [];
  };
  const responseMode = String(pacingCaps.responseMode || 'none');
  const responseAllowsGroups = responseMode === 'either' || responseMode === 'group';
  const desiredGroupsRaw = Math.max(1, Math.min(2, Math.max(1, Math.trunc((Number(composer.intensity) || 1) * 2))));
  const introForcedDesiredGroups = introStage === 'rhythm_only'
    ? 1
    : (introStage === 'soft_ramp' ? 2 : -1);
  const desiredGroups = introForcedDesiredGroups > 0
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
  const sectionKey = `${String(composer.sectionId || 'default')}:${Math.max(0, Math.trunc(Number(composer.cycle) || 0))}:${motifScopeKey}`;
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
  const getDirectorGroupFallbackGain = () => {
    const supportPlan = directorLanePlan && typeof directorLanePlan === 'object' ? (directorLanePlan.support || null) : null;
    const answerPlan = directorLanePlan && typeof directorLanePlan === 'object' ? (directorLanePlan.answer || null) : null;
    const protectedHold = (plan) => !!plan && plan.protected === true && String(plan.continuityBias || '').trim().toLowerCase() === 'hold';
    if (protectedHold(supportPlan) || protectedHold(answerPlan)) return 0.5;
    const blend = (plan) => !!plan && String(plan.continuityBias || '').trim().toLowerCase() === 'blend';
    if (blend(supportPlan) || blend(answerPlan)) return 0.46;
    return 0.42;
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
    if (g.sectionKey !== sectionKey) {
      // Keep groups alive across section boundaries and adapt scheduling/audio instead.
      g.sectionKey = sectionKey;
    }
    const introGroupBodyLocked = isPersistentIntroSlotCarrier(g)
      && String(g?.introCarrierBodyType || '').trim().toLowerCase() === 'group';
    if (!introGroupBodyLocked && Number(pacingCaps.maxComposerPerformers) > 0) {
      g.performers = Math.max(1, Math.min(Math.trunc(Number(g.performers) || 1), Math.trunc(Number(pacingCaps.maxComposerPerformers) || 1)));
    }
    if (!introGroupBodyLocked && Number(pacingCaps.maxComposerGroupSize) > 0) {
      g.size = Math.max(1, Math.min(Math.trunc(Number(g.size) || 1), Math.trunc(Number(pacingCaps.maxComposerGroupSize) || 1)));
    }
    const need = Math.max(0, Math.trunc(Number(g.size) || 0) - aliveIds.size);
    if (need > 0) {
      spawnComposerGroupOffscreenMembers(g, need);
    }
  }

  const sameSection = composerEnemyGroups.filter((g) => (
    g
    && g.sectionKey === sectionKey
    && g.active
    && !g.retiring
    && !isFoundationBufferGroup(g)
    && (
      !isPersistentIntroSlotCarrier(g)
      || hasLiveMembers(g)
    )
  ));
  const activePersistentIntroSlotGroups = sameSection.filter((g) => isPersistentIntroSlotCarrier(g));
  const rankedGroups = sameSection
    .slice()
    .sort((a, b) => (Math.trunc(Number(a?.id) || 0) - Math.trunc(Number(b?.id) || 0)));
  for (let i = 0; i < rankedGroups.length; i++) {
    const group = rankedGroups[i];
    const introSlotLocked = group?.introSlotLock === true
      && Math.max(-1, Math.trunc(Number(group?.introSlotLockUntilBar) || -1)) >= currentBarIndex;
    const introSlotPersistent = isPersistentIntroSlotCarrier(group);
    const shouldSchedule = i < desiredGroups || introSlotLocked || introSlotPersistent;
    group.musicParticipationGain = shouldSchedule ? 1 : getDirectorGroupFallbackGain();
    group.lifecycleState = shouldSchedule ? 'active' : 'deEmphasized';
  }

  const currentSectionCount = composerEnemyGroups
    .filter((g) => (
      g
      && g.sectionKey === sectionKey
      && g.active
      && !g.retiring
      && !isFoundationBufferGroup(g)
      && (
        !isPersistentIntroSlotCarrier(g)
        || hasLiveMembers(g)
      )
    ))
    .length;
  const targetIntroProfiles = getTargetIntroProfiles();
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
  const genericGroupSpawnBlockedByIntroBridge = requiredIntroProfiles.length === 0 && activePersistentIntroSlotGroups.length > 0;
  const spawnCount = requiredIntroProfiles.length > 0
    ? Math.max(0, introMissingCount)
    : (genericGroupSpawnBlockedByIntroBridge ? 0 : Math.max(0, desiredGroups - currentSectionCount));
  for (let i = 0; i < spawnCount; i++) {
    const forcedIntroProfileSourceType = missingIntroProfiles[i] || '';
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
      forcedIntroProfileSourceType,
    });
    if (!group) continue;
    group.lifecycleState = normalizeLifecycleState(group.lifecycleState, 'active');
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
          reason: forcedIntroProfileSourceType
            ? 'intro_required_profile'
            : (genericGroupSpawnBlockedByIntroBridge ? 'blocked_generic' : 'generic_group_fill'),
          templateId: String(templateId || '').trim(),
          role: String(group?.role || '').trim().toLowerCase(),
          musicLaneId: String(group?.musicLaneId || '').trim().toLowerCase(),
          callResponseLane: String(group?.callResponseLane || '').trim().toLowerCase(),
          instrumentId: String(group?.instrumentId || group?.instrument || '').trim(),
          note: Array.isArray(group?.notes) && group.notes.length ? String(group.notes[0] || '').trim() : '',
          stage: String(forcedIntroProfileSourceType || group?.introSlotProfileSourceType || group?.musicProfileSourceType || '').trim().toLowerCase(),
        }, {
          beatIndex: Math.max(0, currentBarIndex * 4),
        });
      } catch {}
    }
    spawnComposerGroupOffscreenMembers(group, Math.max(0, Math.trunc(Number(group.size) || 0)));
  }
}
