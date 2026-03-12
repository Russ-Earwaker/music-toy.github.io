export function maintainComposerEnemyGroupsRuntime(options = null) {
  const state = options?.state && typeof options.state === 'object' ? options.state : {};
  const constants = options?.constants && typeof options.constants === 'object' ? options.constants : {};
  const helpers = options?.helpers && typeof options.helpers === 'object' ? options.helpers : {};

  const composerEnemyGroups = Array.isArray(state.composerEnemyGroups) ? state.composerEnemyGroups : [];
  const composerRuntime = state.composerRuntime && typeof state.composerRuntime === 'object' ? state.composerRuntime : {};
  const currentBeatIndex = Number(state.currentBeatIndex) || 0;

  const pacingCaps = helpers.getCurrentPacingCaps?.() || {};
  const pacingState = String(helpers.getCurrentPacingStateName?.() || '').trim().toLowerCase();
  const stepAbs = Math.max(0, Math.trunc(currentBeatIndex));
  const introHoldActive = !!helpers.shouldHoldIntroLayerExpansion?.(stepAbs);
  const effectivePacingCaps = introHoldActive
    ? {
      ...pacingCaps,
      responseMode: 'group',
      maxComposerGroups: Math.max(1, Math.trunc(Number(pacingCaps?.maxComposerGroups) || 0)),
      maxComposerGroupSize: Math.max(1, Math.trunc(Number(pacingCaps?.maxComposerGroupSize) || 1)),
      maxComposerPerformers: Math.max(1, Math.trunc(Number(pacingCaps?.maxComposerPerformers) || 1)),
    }
    : pacingCaps;
  const templateLibrary = Array.isArray(constants.composerGroupTemplateLibrary) ? constants.composerGroupTemplateLibrary : [];
  const forcedIntroBassTemplate = templateLibrary.find(
    (t) => helpers.normalizeSwarmRole?.(t?.role || '', constants.leadRole) === constants.bassRole
  ) || null;
  const composer = helpers.getComposerDirective?.() || {};
  const motifScopeKey = helpers.getComposerMotifScopeKey?.() || '';
  const retireGroup = (group, reason) => {
    if (!group || group.retiring) return;
    group.active = false;
    group.retiring = true;
    group.lifecycleState = 'retiring';
    group.retireReason = String(reason || 'retreated').trim().toLowerCase() || 'retreated';
    const aliveMembers = (helpers.getAliveEnemiesByIds?.(group.memberIds) || [])
      .filter((e) => String(e?.enemyType || '') === 'composer-group-member');
    group.memberIds = new Set(aliveMembers.map((e) => Math.trunc(Number(e?.id) || 0)).filter((id) => id > 0));
    for (const enemy of aliveMembers) {
      enemy.lifecycleState = 'retiring';
      enemy.composerRetiring = true;
      enemy.retireReason = group.retireReason;
      enemy.retirePhaseStartMs = Number(performance?.now?.() || 0);
    }
  };
  helpers.maintainComposerEnemyGroupsLifecycle?.({
    enabled: !!constants.composerGroupsEnabled && !!composerRuntime.enabled,
    composerEnemyGroups,
    pacingCaps: effectivePacingCaps,
    composer,
    motifScopeKey,
    retireGroup,
    getAliveIdsForGroup: (group) => new Set(
      (helpers.getAliveEnemiesByIds?.(group?.memberIds) || [])
        .filter((e) => String(e?.enemyType || '') === 'composer-group-member')
        .map((e) => Math.trunc(Number(e?.id) || 0))
        .filter((id) => id > 0)
    ),
    spawnComposerGroupOffscreenMembers: helpers.spawnComposerGroupOffscreenMembers,
    pickTemplate: (groupIndex) => {
      if ((pacingState === 'intro_bass' || pacingState === 'intro_response' || introHoldActive) && forcedIntroBassTemplate) {
        return forcedIntroBassTemplate;
      }
      return helpers.pickComposerGroupTemplate?.({
        templates: templateLibrary,
        groupIndex,
        energyState: helpers.getCurrentSwarmEnergyStateName?.(),
        normalizeRole: (roleName) => helpers.normalizeSwarmRole?.(roleName, constants.leadRole),
        bassRole: constants.bassRole,
        fullThreat: constants.fullThreat,
      });
    },
    getComposerMotif: helpers.getComposerMotif,
    createComposerEnemyGroupProfile: helpers.createComposerEnemyGroupProfile,
    createGroupFromMotif: ({ groupIndex, sectionKey, composer: composerDirective, templateId, motif, pacingCaps: caps }) => ({
      id: helpers.getNextComposerEnemyGroupId?.(),
      sectionKey,
      sectionId: String(composerDirective?.sectionId || 'default'),
      templateId: String(motif?.templateId || templateId),
      role: helpers.normalizeSwarmRole?.(motif?.role || 'lead', constants.leadRole),
      callResponseLane: helpers.normalizeCallResponseLane?.(motif?.callResponseLane || ((groupIndex % 2) === 0 ? 'call' : 'response')),
      shape: String(motif?.shape || helpers.pickComposerGroupShape?.({ shapes: constants.composerGroupShapes, index: groupIndex })),
      color: String(motif?.color || helpers.pickComposerGroupColor?.({ colors: constants.composerGroupColors, index: groupIndex })),
      actionType: String(motif?.actionType || 'projectile'),
      threatLevel: String(motif?.threatLevel || constants.fullThreat),
      performers: Math.max(
        1,
        Math.min(
          Math.max(constants.composerGroupPerformersMin, Math.min(constants.composerGroupPerformersMax, Math.trunc(Number(motif?.performers) || 1))),
          Math.max(1, caps?.maxComposerPerformers || constants.composerGroupPerformersMax)
        )
      ),
      size: Math.max(
        1,
        Math.min(
          Math.max(constants.composerGroupSizeMin, Math.min(constants.composerGroupSizeMax, Math.trunc(Number(motif?.size) || constants.composerGroupSizeMin))),
          Math.max(1, caps?.maxComposerGroupSize || constants.composerGroupSizeMax)
        )
      ),
      steps: Array.isArray(motif?.steps)
        ? motif.steps.slice(0, constants.weaponTuneSteps)
        : Array.from({ length: constants.weaponTuneSteps }, () => Math.random() >= 0.5),
      motif: motif?.motif && typeof motif.motif === 'object'
        ? {
          id: String(motif.motif.id || `${templateId}-motif`),
          steps: Array.isArray(motif.motif.steps) ? motif.motif.steps.slice(0, constants.weaponTuneSteps) : [],
        }
        : {
          id: `${templateId}-motif`,
          steps: Array.isArray(motif?.steps) ? motif.steps.slice(0, constants.weaponTuneSteps) : [],
        },
      notes: (Array.isArray(motif?.notes) && motif.notes.length ? motif.notes : [helpers.getRandomSwarmPentatonicNote?.()])
        .map((n, idx) => helpers.clampNoteToDirectorPool?.(helpers.normalizeSwarmNoteName?.(n) || helpers.getRandomSwarmPentatonicNote?.(), groupIndex + idx)),
      gravityNotes: (Array.isArray(motif?.gravityNotes) ? motif.gravityNotes : [])
        .map((n, idx) => helpers.clampNoteToDirectorPool?.(helpers.normalizeSwarmNoteName?.(n) || helpers.getRandomSwarmPentatonicNote?.(), groupIndex + idx))
        .filter(Boolean),
      phraseRoot: helpers.clampNoteToDirectorPool?.(
        helpers.normalizeSwarmNoteName?.(motif?.phraseRoot)
          || helpers.normalizeSwarmNoteName?.(Array.isArray(motif?.notes) ? motif.notes[0] : '')
          || helpers.getRandomSwarmPentatonicNote?.(),
        groupIndex
      ),
      phraseFifth: helpers.clampNoteToDirectorPool?.(
        helpers.normalizeSwarmNoteName?.(motif?.phraseFifth)
          || helpers.normalizeSwarmNoteName?.(Array.isArray(motif?.notes) ? motif.notes[Math.min(2, Math.max(0, motif.notes.length - 1))] : '')
          || helpers.getRandomSwarmPentatonicNote?.(),
        groupIndex + 2
      ),
      resolutionTargets: (Array.isArray(motif?.resolutionTargets) ? motif.resolutionTargets : [])
        .map((n, idx) => helpers.clampNoteToDirectorPool?.(helpers.normalizeSwarmNoteName?.(n) || helpers.getRandomSwarmPentatonicNote?.(), groupIndex + idx + 3))
        .filter(Boolean),
      instrument: helpers.resolveInstrumentIdOrFallback?.(motif?.instrument, helpers.resolveSwarmSoundInstrumentId?.('projectile') || 'tone'),
      instrumentId: helpers.resolveInstrumentIdOrFallback?.(motif?.instrument, helpers.resolveSwarmSoundInstrumentId?.('projectile') || 'tone'),
      continuityId: String(motif?.continuityId || '') || helpers.getNextMusicContinuityId?.(),
      phraseState: null,
      noteToEnemyId: new Map(),
      memberIds: new Set(),
      noteCursor: 0,
      nextSpawnNoteIndex: 0,
      active: true,
      lifecycleState: 'active',
    }),
  });
  for (const group of composerEnemyGroups) {
    if (!group || group.retiring || group.active === false) continue;
    const memberLifecycleState = helpers.normalizeMusicLifecycleState?.(group.lifecycleState, 'active');
    const aliveMembers = (helpers.getAliveEnemiesByIds?.(group.memberIds) || [])
      .filter((e) => String(e?.enemyType || '') === 'composer-group-member');
    for (const enemy of aliveMembers) {
      enemy.lifecycleState = memberLifecycleState;
      helpers.applyMusicalIdentityVisualToEnemy?.(enemy, group);
    }
  }
}
