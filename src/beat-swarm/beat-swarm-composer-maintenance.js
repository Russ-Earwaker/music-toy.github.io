export function maintainComposerEnemyGroupsRuntime(options = null) {
  const state = options?.state && typeof options.state === 'object' ? options.state : {};
  const constants = options?.constants && typeof options.constants === 'object' ? options.constants : {};
  const helpers = options?.helpers && typeof options.helpers === 'object' ? options.helpers : {};

  const composerEnemyGroups = Array.isArray(state.composerEnemyGroups) ? state.composerEnemyGroups : [];
  const composerRuntime = state.composerRuntime && typeof state.composerRuntime === 'object' ? state.composerRuntime : {};
  const currentBeatIndex = Number(state.currentBeatIndex) || 0;
  const enemies = Array.isArray(state.enemies) ? state.enemies : [];
  const sanitizeEnemyMusicInstrumentId = typeof helpers.sanitizeEnemyMusicInstrumentId === 'function'
    ? helpers.sanitizeEnemyMusicInstrumentId
    : ((instrumentId, fallback) => helpers.resolveInstrumentIdOrFallback?.(instrumentId, fallback) || fallback || 'tone');
  const enemyById = new Map();
  for (let i = 0; i < enemies.length; i++) {
    const enemy = enemies[i];
    const enemyId = Math.trunc(Number(enemy?.id) || 0);
    if (enemyId > 0) enemyById.set(enemyId, enemy);
  }
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
  const pacingState = String(helpers.getCurrentPacingStateName?.() || '').trim().toLowerCase();
  const introWindowActive = pacingState === 'intro_solo' || pacingState === 'intro_bass' || pacingState === 'intro_response';
  const stepAbs = Math.max(0, Math.trunc(currentBeatIndex));
  const introHoldActive = !!helpers.shouldHoldIntroLayerExpansion?.(stepAbs);
  const effectivePacingCaps = introWindowActive
    ? {
      ...pacingCaps,
      responseMode: 'group',
      maxComposerGroups: 0,
      maxComposerGroupSize: 0,
      maxComposerPerformers: 0,
    }
    : (introHoldActive
    ? {
      ...pacingCaps,
      responseMode: 'group',
      maxComposerGroups: Math.max(1, Math.trunc(Number(pacingCaps?.maxComposerGroups) || 0)),
      maxComposerGroupSize: Math.max(1, Math.trunc(Number(pacingCaps?.maxComposerGroupSize) || 1)),
      maxComposerPerformers: Math.max(1, Math.trunc(Number(pacingCaps?.maxComposerPerformers) || 1)),
    }
    : pacingCaps);
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
  const composer = helpers.getComposerDirective?.() || {};
  const motifScopeKey = helpers.getComposerMotifScopeKey?.() || '';
  const retireGroup = (group, reason) => {
    if (!group || group.retiring) return;
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
  helpers.maintainComposerEnemyGroupsLifecycle?.({
    enabled: !!constants.composerGroupsEnabled && !!composerRuntime.enabled,
    composerEnemyGroups,
    pacingCaps: effectivePacingCaps,
    composer,
    motifScopeKey,
    retireGroup,
    getAliveIdsForGroup: (group) => new Set(
      getAliveComposerEnemiesByIds(group?.memberIds)
        .map((e) => Math.trunc(Number(e?.id) || 0))
        .filter((id) => id > 0)
    ),
    spawnComposerGroupOffscreenMembers: helpers.spawnComposerGroupOffscreenMembers,
    pickTemplate: (groupIndex) => {
      if (introWindowActive) return null;
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
    createGroupFromMotif: ({ groupIndex, sectionKey, composer: composerDirective, templateId, motif, pacingCaps: caps }) => {
      const templateRole = helpers.normalizeSwarmRole?.(
        templateById.get(String(templateId || ''))?.role || '',
        ''
      );
      const role = templateRole || helpers.normalizeSwarmRole?.(motif?.role || 'lead', constants.leadRole);
      const fallbackInstrument = helpers.resolveSwarmSoundInstrumentId?.('projectile') || 'tone';
      const instrumentId = sanitizeEnemyMusicInstrumentId(
        motif?.instrument,
        fallbackInstrument,
        { role }
      );
      const created = ({
      id: helpers.getNextComposerEnemyGroupId?.(),
      sectionKey,
      sectionId: String(composerDirective?.sectionId || 'default'),
      templateId: String(motif?.templateId || templateId),
      role,
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
      instrument: instrumentId,
      instrumentId,
      continuityId: String(motif?.continuityId || '') || helpers.getNextMusicContinuityId?.(),
      phraseState: null,
      noteToEnemyId: new Map(),
      memberIds: new Set(),
      noteCursor: 0,
      nextSpawnNoteIndex: 0,
      active: true,
      lifecycleState: 'active',
    });
      helpers.ensureMusicLaneAssignment?.({
        group: created,
        role,
        layer: role === constants.bassRole ? 'foundation' : 'loops',
        instrumentId,
        continuityId: created.continuityId,
        phraseId: String(created?.motif?.id || ''),
        performerGroupId: Math.trunc(Number(created.id) || 0),
        performerType: 'composer-group',
      });
      return created;
    },
  });
  for (const group of composerEnemyGroups) {
    if (!group || group.retiring || group.active === false) continue;
    const templateRole = helpers.normalizeSwarmRole?.(
      templateById.get(String(group?.templateId || ''))?.role || '',
      ''
    );
    if (templateRole) {
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
    const memberLifecycleState = helpers.normalizeMusicLifecycleState?.(group.lifecycleState, 'active');
    const aliveMembers = getAliveComposerEnemiesByIds(group.memberIds);
    for (const enemy of aliveMembers) {
      enemy.lifecycleState = memberLifecycleState;
      helpers.ensureMusicLaneAssignment?.({
        group,
        enemy,
        role: templateRole || group?.role,
        layer: String(group?.musicLaneLayer || (templateRole === constants.bassRole ? 'foundation' : 'loops')),
        instrumentId: String(group?.musicLaneInstrumentId || group?.instrumentId || '').trim(),
        continuityId: String(group?.musicLaneContinuityId || group?.continuityId || '').trim(),
        phraseId: String(group?.musicLanePhraseId || group?.motif?.id || ''),
        performerEnemyId: Math.trunc(Number(enemy?.id) || 0),
        performerGroupId: Math.trunc(Number(group?.id) || 0),
        performerType: 'composer-group-member',
      });
      if (templateRole) {
        enemy.musicalRole = templateRole;
        enemy.composerRole = templateRole;
        if (group?.instrumentId) {
          enemy.composerInstrument = String(group.instrumentId);
          enemy.instrumentId = String(group.instrumentId);
          enemy.musicInstrumentId = String(group.instrumentId);
        }
      }
      helpers.applyMusicalIdentityVisualToEnemy?.(enemy, group);
    }
  }
}
