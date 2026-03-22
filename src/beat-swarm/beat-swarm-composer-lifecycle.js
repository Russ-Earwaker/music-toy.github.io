export function maintainComposerEnemyGroupsLifecycle(options = null) {
  const enabled = !!options?.enabled;
  if (!enabled) return;

  const composerEnemyGroups = Array.isArray(options?.composerEnemyGroups) ? options.composerEnemyGroups : [];
  const pacingCaps = options?.pacingCaps && typeof options.pacingCaps === 'object' ? options.pacingCaps : {};
  const composer = options?.composer && typeof options.composer === 'object' ? options.composer : {};
  const motifScopeKey = String(options?.motifScopeKey || 'default');

  const getAliveIdsForGroup = typeof options?.getAliveIdsForGroup === 'function' ? options.getAliveIdsForGroup : (() => new Set());
  const spawnComposerGroupOffscreenMembers = typeof options?.spawnComposerGroupOffscreenMembers === 'function' ? options.spawnComposerGroupOffscreenMembers : (() => {});
  const pickTemplate = typeof options?.pickTemplate === 'function' ? options.pickTemplate : (() => null);
  const getComposerMotif = typeof options?.getComposerMotif === 'function' ? options.getComposerMotif : ((_scope, _id, factory) => (typeof factory === 'function' ? factory() : null));
  const createComposerEnemyGroupProfile = typeof options?.createComposerEnemyGroupProfile === 'function' ? options.createComposerEnemyGroupProfile : (() => ({}));
  const createGroupFromMotif = typeof options?.createGroupFromMotif === 'function' ? options.createGroupFromMotif : (() => null);
  const normalizeLifecycleState = (value, fallback = 'active') => {
    const raw = String(value || '').trim().toLowerCase();
    if (raw === 'active') return 'active';
    if (raw === 'retiring') return 'retiring';
    if (raw === 'inactiveforscheduling' || raw === 'inactive_for_scheduling' || raw === 'inactive-for-scheduling') return 'inactiveForScheduling';
    const fb = String(fallback || 'active').trim().toLowerCase();
    if (fb === 'retiring') return 'retiring';
    if (fb.includes('inactive')) return 'inactiveForScheduling';
    return 'active';
  };

  const responseMode = String(pacingCaps.responseMode || 'none');
  const responseAllowsGroups = responseMode === 'either' || responseMode === 'group';
  const desiredGroupsRaw = Math.max(1, Math.min(2, Math.max(1, Math.trunc((Number(composer.intensity) || 1) * 2))));
  const desiredGroups = responseAllowsGroups
    ? Math.max(0, Math.min(desiredGroupsRaw, Math.max(0, Math.trunc(Number(pacingCaps.maxComposerGroups) || 0))))
    : 0;
  const sectionKey = `${String(composer.sectionId || 'default')}:${Math.max(0, Math.trunc(Number(composer.cycle) || 0))}:${motifScopeKey}`;
  const isFoundationBufferGroup = (group) => (
    !!group
    && (
      String(group?.templateId || '').trim() === 'foundation-buffer'
      || String(group?.sectionId || '').trim() === 'foundation-buffer'
      || String(group?.sectionKey || '').trim() === 'foundation-buffer'
    )
  );

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
    if (Number(pacingCaps.maxComposerPerformers) > 0) {
      g.performers = Math.max(1, Math.min(Math.trunc(Number(g.performers) || 1), Math.trunc(Number(pacingCaps.maxComposerPerformers) || 1)));
    }
    if (Number(pacingCaps.maxComposerGroupSize) > 0) {
      g.size = Math.max(1, Math.min(Math.trunc(Number(g.size) || 1), Math.trunc(Number(pacingCaps.maxComposerGroupSize) || 1)));
    }
    const need = Math.max(0, Math.trunc(Number(g.size) || 0) - aliveIds.size);
    if (need > 0) spawnComposerGroupOffscreenMembers(g, need);
  }

  const sameSection = composerEnemyGroups.filter((g) => (
    g
    && g.sectionKey === sectionKey
    && g.active
    && !g.retiring
    && !isFoundationBufferGroup(g)
  ));
  const rankedGroups = sameSection
    .slice()
    .sort((a, b) => (Math.trunc(Number(a?.id) || 0) - Math.trunc(Number(b?.id) || 0)));
  for (let i = 0; i < rankedGroups.length; i++) {
    const group = rankedGroups[i];
    const shouldSchedule = i < desiredGroups;
    group.musicParticipationGain = shouldSchedule ? 1 : 0.35;
    group.lifecycleState = shouldSchedule ? 'active' : 'inactiveForScheduling';
  }

  const currentSectionCount = composerEnemyGroups
    .filter((g) => g && g.sectionKey === sectionKey && g.active && !g.retiring && !isFoundationBufferGroup(g))
    .length;
  const spawnCount = Math.max(0, desiredGroups - currentSectionCount);
  for (let i = 0; i < spawnCount; i++) {
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
    });
    if (!group) continue;
    group.lifecycleState = normalizeLifecycleState(group.lifecycleState, 'active');
    composerEnemyGroups.push(group);
    spawnComposerGroupOffscreenMembers(group, Math.max(0, Math.trunc(Number(group.size) || 0)));
  }
}
