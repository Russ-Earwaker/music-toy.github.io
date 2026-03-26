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
  const enemies = Array.isArray(state.enemies) ? state.enemies : [];
  const sanitizeEnemyMusicInstrumentId = typeof helpers.sanitizeEnemyMusicInstrumentId === 'function'
    ? helpers.sanitizeEnemyMusicInstrumentId
    : ((instrumentId, fallback) => helpers.resolveInstrumentIdOrFallback?.(instrumentId, fallback) || fallback || 'tone');
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
  const spawnWantsComposer = spawnConfigLoaded && spawnChosenId === 'composer_basic';
  const supportLanePlan = directorLanePlan && typeof directorLanePlan === 'object' ? directorLanePlan.support : null;
  const answerLanePlan = directorLanePlan && typeof directorLanePlan === 'object' ? directorLanePlan.answer : null;
  const primaryLoopLanePlan = directorLanePlan && typeof directorLanePlan === 'object' ? directorLanePlan.primary_loop : null;
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
  if (
    !introWindowActive
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
  const effectiveDirectorSupportGroups = strongLeadWindowActive && directorAnswerGroups > 0
    ? 0
    : directorSupportGroups;
  const effectiveDirectorAnswerGroups = directorAnswerGroups;
  const directorRequestedGroupCount = effectiveDirectorSupportGroups + effectiveDirectorAnswerGroups;
  if (!introWindowActive && !introHoldActive) {
    effectivePacingCaps.maxComposerGroups = Math.max(
      0,
      Math.max(Math.trunc(Number(effectivePacingCaps?.maxComposerGroups) || 0), directorRequestedGroupCount)
    );
    if (!(effectiveDirectorSupportGroups > 0 || effectiveDirectorAnswerGroups > 0) && !spawnWantsComposer) {
      effectivePacingCaps.maxComposerGroups = 0;
    }
    if (spawnWantsComposer) {
      effectivePacingCaps.responseMode = 'group';
      effectivePacingCaps.maxComposerGroups = Math.max(1, Math.trunc(Number(effectivePacingCaps?.maxComposerGroups) || 0));
      effectivePacingCaps.maxComposerGroupSize = Math.max(1, Math.trunc(Number(effectivePacingCaps?.maxComposerGroupSize) || 1));
      effectivePacingCaps.maxComposerPerformers = Math.max(1, Math.trunc(Number(effectivePacingCaps?.maxComposerPerformers) || 1));
    }
    if (strongLeadWindowActive && !spawnWantsComposer) {
      effectivePacingCaps.maxComposerGroups = Math.min(Math.trunc(Number(effectivePacingCaps?.maxComposerGroups) || 0), 1);
      effectivePacingCaps.maxComposerGroupSize = Math.min(Math.trunc(Number(effectivePacingCaps?.maxComposerGroupSize) || 1), 1);
      effectivePacingCaps.maxComposerPerformers = Math.min(Math.trunc(Number(effectivePacingCaps?.maxComposerPerformers) || 1), 1);
      if (effectiveDirectorAnswerGroups > 0) {
        effectivePacingCaps.responseMode = 'group';
        // Keep the strong-lead restraint, but leave room for one live answer group.
        effectivePacingCaps.maxComposerGroups = Math.max(2, Math.trunc(Number(effectivePacingCaps?.maxComposerGroups) || 0));
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
  const composer = helpers.getComposerDirective?.() || {};
  const motifScopeKey = helpers.getComposerMotifScopeKey?.() || '';
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
  const getDesiredComposerLane = (groupIndex) => {
    const parityLane = helpers.normalizeCallResponseLane?.((groupIndex % 2) === 0 ? 'call' : 'response', 'call')
      || ((groupIndex % 2) === 0 ? 'call' : 'response');
    if (introWindowActive || introHoldActive || String(effectivePacingCaps?.responseMode || '').trim().toLowerCase() !== 'group') {
      return parityLane;
    }
    const coverage = getActiveComposerLaneCoverage();
    if (!coverage.hasNonBassCall) return 'call';
    if (!coverage.hasResponse) return 'response';
    return parityLane;
  };
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
  withPerfSample('maintainComposerGroups.lifecycle', () => {
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
              : ((!getActiveComposerLaneCoverage().hasNonBassCall && defaultCallTemplate) ? [defaultCallTemplate] : templateLibrary)
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
      createGroupFromMotif: ({ groupIndex, sectionKey, composer: composerDirective, templateId, motif, pacingCaps: caps }) => {
        return withPerfSample('maintainComposerGroups.createGroup', () => {
          const desiredLane = getDesiredComposerLane(groupIndex);
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
          const effectiveTemplateId = desiredLane === 'response'
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
          const templateLane = helpers.normalizeCallResponseLane?.(
            templateById.get(effectiveTemplateId)?.callResponseLane || '',
            ''
          ) || '';
          const motifLane = helpers.normalizeCallResponseLane?.(motif?.callResponseLane || '', '') || '';
          const resolvedCallResponseLane = desiredLane === 'response'
            ? 'response'
            : (motifLane || templateLane || desiredLane);
          const templateRole = helpers.normalizeSwarmRole?.(
            templateById.get(effectiveTemplateId)?.role || '',
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
            templateId: effectiveTemplateId,
            role,
            callResponseLane: resolvedCallResponseLane,
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
          if (noteMusicSystemEvent) {
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
            }, {
              beatIndex: Math.max(0, Math.trunc(Number(currentBeatIndex) || 0)),
            });
          }
          try { noteDirectorSpawnArchetype?.('composer_basic'); } catch {}
          return created;
        });
      },
    });
  });
  withPerfSample('maintainComposerGroups.syncMembers', () => {
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
      const effectiveRole = templateRole || group?.role;
      const effectiveLayer = String(group?.musicLaneLayer || (templateRole === constants.bassRole ? 'foundation' : 'loops'));
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
        if (noteMusicSystemEvent) {
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
        }, {
          beatIndex: Math.max(0, Math.trunc(Number(currentBeatIndex) || 0)),
        });
      }
      const aliveMembers = getAliveComposerEnemiesByIds(group.memberIds);
      for (const enemy of aliveMembers) {
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
          if (templateRole) {
            enemy.musicalRole = templateRole;
            enemy.composerRole = templateRole;
            if (group?.instrumentId) {
              const groupInstrument = String(group.instrumentId);
              enemy.composerInstrument = groupInstrument;
              enemy.instrumentId = groupInstrument;
              enemy.musicInstrumentId = groupInstrument;
            }
          }
          continue;
        }
        helpers.ensureMusicLaneAssignment?.({
          group,
          enemy,
          role: effectiveRole,
          layer: effectiveLayer,
          instrumentId: effectiveInstrumentId,
          continuityId: effectiveContinuityId,
          phraseId: effectivePhraseId,
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
        enemy.__bsComposerSyncSignature = memberSyncSignature;
      }
      group.__bsComposerMemberSyncSignature = groupSyncSignature;
      group.__bsComposerMemberSyncCount = Math.max(0, Math.trunc(Number(groupMemberCount) || 0));
    }
  });
}
