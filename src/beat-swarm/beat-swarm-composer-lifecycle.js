export function maintainComposerEnemyGroupsLifecycle(options = null) {
  const enabled = !!options?.enabled;
  if (!enabled) return;

  const composerEnemyGroups = Array.isArray(options?.composerEnemyGroups) ? options.composerEnemyGroups : [];
  const pacingCaps = options?.pacingCaps && typeof options.pacingCaps === 'object' ? options.pacingCaps : {};
  const composer = options?.composer && typeof options.composer === 'object' ? options.composer : {};
  const motifScopeKey = String(options?.motifScopeKey || 'default');

  const retireGroup = typeof options?.retireGroup === 'function' ? options.retireGroup : (() => {});
  const getAliveIdsForGroup = typeof options?.getAliveIdsForGroup === 'function' ? options.getAliveIdsForGroup : (() => new Set());
  const spawnComposerGroupOffscreenMembers = typeof options?.spawnComposerGroupOffscreenMembers === 'function' ? options.spawnComposerGroupOffscreenMembers : (() => {});
  const pickTemplate = typeof options?.pickTemplate === 'function' ? options.pickTemplate : (() => null);
  const getComposerMotif = typeof options?.getComposerMotif === 'function' ? options.getComposerMotif : ((_scope, _id, factory) => (typeof factory === 'function' ? factory() : null));
  const createComposerEnemyGroupProfile = typeof options?.createComposerEnemyGroupProfile === 'function' ? options.createComposerEnemyGroupProfile : (() => ({}));
  const createGroupFromMotif = typeof options?.createGroupFromMotif === 'function' ? options.createGroupFromMotif : (() => null);

  const responseMode = String(pacingCaps.responseMode || 'none');
  const responseAllowsGroups = responseMode === 'either' || responseMode === 'group';
  const desiredGroupsRaw = Math.max(1, Math.min(2, Math.max(1, Math.trunc((Number(composer.intensity) || 1) * 2))));
  const desiredGroups = responseAllowsGroups
    ? Math.max(0, Math.min(desiredGroupsRaw, Math.max(0, Math.trunc(Number(pacingCaps.maxComposerGroups) || 0))))
    : 0;
  const sectionKey = `${String(composer.sectionId || 'default')}:${Math.max(0, Math.trunc(Number(composer.cycle) || 0))}:${motifScopeKey}`;

  for (let i = composerEnemyGroups.length - 1; i >= 0; i--) {
    const g = composerEnemyGroups[i];
    if (!g) {
      composerEnemyGroups.splice(i, 1);
      continue;
    }
    const aliveIds = getAliveIdsForGroup(g);
    g.memberIds = aliveIds;
    if (g.retiring || g.active === false) {
      if (!aliveIds.size) composerEnemyGroups.splice(i, 1);
      continue;
    }
    if (g.sectionKey !== sectionKey) {
      retireGroup(g, 'section_change_cleanup');
      continue;
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

  const sameSection = composerEnemyGroups.filter((g) => g && g.sectionKey === sectionKey && g.active && !g.retiring);
  if (sameSection.length > desiredGroups) {
    const extras = sameSection
      .slice()
      .sort((a, b) => (Math.trunc(Number(b?.id) || 0) - Math.trunc(Number(a?.id) || 0)))
      .slice(0, sameSection.length - desiredGroups);
    for (const extra of extras) {
      retireGroup(extra, 'director_cleanup');
    }
  }

  const currentSectionCount = composerEnemyGroups
    .filter((g) => g && g.sectionKey === sectionKey && g.active && !g.retiring)
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
    composerEnemyGroups.push(group);
    spawnComposerGroupOffscreenMembers(group, Math.max(0, Math.trunc(Number(group.size) || 0)));
  }
}
