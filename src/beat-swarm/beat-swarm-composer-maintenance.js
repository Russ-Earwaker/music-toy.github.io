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
  const spawnWantsComposer = spawnConfigLoaded && (spawnChosenId === 'composer_basic' || spawnChosenId === 'solo_rhythm_basic' || spawnChosenId === 'solo_melody_basic');
  const supportLanePlan = directorLanePlan && typeof directorLanePlan === 'object' ? directorLanePlan.support : null;
  const answerLanePlan = directorLanePlan && typeof directorLanePlan === 'object' ? directorLanePlan.answer : null;
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
  const spawnWantsSoloRhythm = spawnConfigLoaded && spawnChosenId === 'solo_rhythm_basic' && !introRhythmOnlyWindow;
  const spawnWantsSoloMelody = spawnConfigLoaded
    && spawnChosenId === 'solo_melody_basic'
    && !introRhythmOnlyWindow
    && melodySoloWindowOpen;
  const stepAbs = Math.max(0, Math.trunc(currentBeatIndex));
  const legacyIntroHoldActive = !!helpers.shouldHoldIntroLayerExpansion?.(stepAbs);
  const introHoldActive = false;
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
    ? 0
    : directorSupportGroups;
  const effectiveDirectorAnswerGroups = directorAnswerGroups;
  const directorRequestedGroupCount = effectiveDirectorSupportGroups + effectiveDirectorAnswerGroups;
  const fallbackMelodyCoverageRequested = (melodyFallbackWindowOpen || melodyPersistenceWindowActive)
    && !spawnWantsSoloMelody
    && spawnChosenId !== 'snake_basic';
  const fallbackRhythmCoverageRequested = (supportLaneActive || answerLaneActive) && !spawnWantsSoloRhythm && spawnChosenId !== 'spawner_basic';
  const fallbackCoverageGroupCount = (fallbackMelodyCoverageRequested ? 1 : 0) + (fallbackRhythmCoverageRequested ? 1 : 0);
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
      effectivePacingCaps.maxComposerGroups = Math.max(
        minimumCoverageGroupCount,
        Math.min(Math.trunc(Number(effectivePacingCaps?.maxComposerGroups) || 0), 1)
      );
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
  const defaultLeadTemplate = templateLibrary.find((t) => {
    const templateId = String(t?.id || '').trim().toLowerCase();
    const role = helpers.normalizeSwarmRole?.(t?.role || '', constants.leadRole) || '';
    return templateId.includes('lead') && role !== constants.bassRole;
  }) || defaultCallTemplate || null;
  const forcedIntroRhythmTemplate = {
    id: 'intro_percussion_group',
    role: constants.leadRole,
    callResponseLane: 'call',
    shape: 'square',
    color: '#ffd29a',
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
    if (normalized === 'snake_melody') return 'lead_melody';
    if (normalized === 'spawner_rhythm') return 'rhythm_lane';
    if (normalized === 'spawner_rhythm_secondary') return 'rhythm_lane_backbeat';
    return normalized;
  };
  const isComposerMelodyProfile = (value) => normalizeComposerProfileSourceType(value) === 'lead_melody';
  const isGenericComposerRhythmProfile = (value) => {
    const normalized = normalizeComposerProfileSourceType(value);
    return normalized === 'rhythm_lane' || normalized === 'rhythm_lane_backbeat';
  };
  const isIntroSlotRhythmProfile = (value) => {
    const normalized = normalizeComposerProfileSourceType(value);
    return normalized === 'spawner_rhythm_pulse'
      || normalized === 'spawner_rhythm_backbeat'
      || normalized === 'spawner_rhythm_motion';
  };
  const getSharedCarrierMusicProfile = (profileSourceType, options = null) => {
    const normalizedProfileSourceType = normalizeComposerProfileSourceType(profileSourceType);
    if (
      normalizedProfileSourceType === 'rhythm_lane'
      || normalizedProfileSourceType === 'rhythm_lane_backbeat'
      || normalizedProfileSourceType === 'spawner_rhythm_pulse'
      || normalizedProfileSourceType === 'spawner_rhythm_backbeat'
      || normalizedProfileSourceType === 'spawner_rhythm_motion'
    ) {
      const explicitLayerKey = normalizedProfileSourceType === 'spawner_rhythm_pulse'
        ? 'pulse'
        : (normalizedProfileSourceType === 'spawner_rhythm_backbeat'
          ? 'backbeat'
          : (normalizedProfileSourceType === 'spawner_rhythm_motion' ? 'motion' : ''));
      const secondarySpawnerRhythmProfile = normalizedProfileSourceType === 'rhythm_lane_backbeat' || explicitLayerKey === 'backbeat';
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
      const fallbackBaseNoteName = resolvedLayerKey === 'motion'
        ? 'C4'
        : (resolvedLayerKey === 'backbeat' ? 'G3' : 'C3');
      const fallbackInstrumentId = sanitizeEnemyMusicInstrumentId(
        helpers.resolveSpawnerPercussionSlotInstrument?.(`percussion_${resolvedLayerKey}`)
          || helpers.resolveSwarmSoundInstrumentId?.('projectile')
          || 'tone',
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
      const baseNoteName = helpers.normalizeSwarmNoteName?.(
        introPatternVariant?.baseNoteName || effectiveSpawnerProfile?.baseNoteName
      ) || 'C3';
      return {
        role: helpers.resolveSpawnerPercussionSlotRole?.(`percussion_${resolvedLayerKey}`) || constants.leadRole,
        actionType: 'explosion',
        musicLaneId: resolvedLayerKey === 'pulse'
          ? 'foundation_lane'
          : (resolvedLayerKey === 'motion' ? 'sparkle_lane' : 'secondary_loop_lane'),
        musicLaneLayer: resolvedLayerKey === 'pulse'
          ? 'foundation'
          : (resolvedLayerKey === 'motion' ? 'sparkle' : 'loops'),
        callResponseLane: 'solo',
        steps: introStrengthenedSteps,
        noteIndices: introStrengthenedNoteIndices,
        notePalette: Array.isArray(effectiveSpawnerProfile?.notePalette) ? effectiveSpawnerProfile.notePalette.slice() : [],
        notes: [baseNoteName],
        phraseRoot: baseNoteName,
        phraseFifth: baseNoteName,
        resolutionTargets: [baseNoteName],
        instrumentId: sanitizeEnemyMusicInstrumentId(
          effectiveSpawnerProfile?.instrument,
          helpers.resolveSwarmSoundInstrumentId?.('projectile') || 'tone',
          { role: helpers.resolveSpawnerPercussionSlotRole?.(`percussion_${resolvedLayerKey}`) || constants.leadRole, toyKey: 'loopgrid-drum' }
        ),
      };
    }
    if (normalizedProfileSourceType === 'lead_melody') {
      const leadInstrumentVariants = [
        helpers.getIdForDisplayName?.('Retro Square'),
        helpers.getIdForDisplayName?.('Retro Lead'),
        helpers.getIdForDisplayName?.('Pulse Lead'),
        helpers.resolveSwarmRoleInstrumentId?.(constants.leadRole, helpers.resolveSwarmSoundInstrumentId?.('projectile') || 'tone'),
      ].filter((id) => String(id || '').trim());
      const selectedLeadInstrumentId = String(
        chooseStableVariant(
          leadInstrumentVariants.map((instrumentId) => ({ instrumentId })),
          53 + melodyPhraseEpoch
        )?.instrumentId
          || leadInstrumentVariants[0]
          || helpers.resolveSwarmSoundInstrumentId?.('projectile')
          || 'tone'
      ).trim();
      const baseRows = chooseStableVariant([
        { rows: [1, 1, 2, 3, 2, 4, 3, 2] },
        { rows: [2, 3, 1, 4, 2, 5, 3, 1] },
        { rows: [1, 4, 2, 5, 3, 4, 2, 1] },
        { rows: [2, 2, 4, 1, 3, 5, 2, 4] },
      ], 17 + melodyPhraseEpoch)?.rows?.slice(0, constants.weaponTuneSteps) || [];
      const melodicRowVariants = [
        baseRows,
        baseRows.length ? baseRows.map((row, idx) => Math.max(0, Math.trunc(Number(row) || 0) + ((idx % 3) === 1 ? 1 : 0))) : baseRows,
        baseRows.length ? baseRows.slice().reverse() : baseRows,
      ].filter((rows) => Array.isArray(rows) && rows.length);
      const rows = (chooseStableVariant(
        melodicRowVariants.map((variantRows) => ({ rows: variantRows })),
        29 + melodyPhraseEpoch
      )?.rows || baseRows).slice();
      const baseSteps = chooseStableVariant([
        { steps: [false, true, true, false, true, false, true, false] },
        { steps: [true, false, true, false, false, true, true, false] },
        { steps: [true, false, false, true, true, false, true, false] },
        { steps: [false, true, false, true, false, true, true, false] },
      ], 19 + melodyPhraseEpoch)?.steps?.slice(0, constants.weaponTuneSteps) || [];
      const melodicStepVariants = [
        baseSteps,
        [false, true, true, false, true, false, true, false],
        [true, false, true, false, false, true, true, false],
        [true, false, false, true, true, false, true, false],
        [false, true, false, true, false, true, true, false],
      ].filter((steps) => Array.isArray(steps) && steps.length);
      const steps = chooseStableVariant(
        melodicStepVariants.map((variantSteps) => ({ steps: variantSteps })),
        31 + melodyPhraseEpoch
      )?.steps || baseSteps;
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
            37 + melodyPhraseEpoch
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
            41 + melodyPhraseEpoch
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
          const noteIndex = Math.max(0, Math.min(6, baseRow + pitchCycle[(i + melodyPhraseEpoch) % pitchCycle.length]));
          const replacementNote = helpers.getSwarmPentatonicNoteByIndex?.(noteIndex)
            || normalizedExisting
            || 'C4';
          notes[idx] = replacementNote;
          usedNoteNames.add(String(replacementNote || '').trim());
        }
      }
      if (activeStepIndices.length >= 3) {
        const phraseShift = melodyPhraseEpoch % Math.max(1, activeStepIndices.length);
        if (phraseShift > 0) {
          const rotatedSteps = steps.slice();
          const rotatedActive = activeStepIndices.slice(phraseShift).concat(activeStepIndices.slice(0, phraseShift));
          for (let i = 0; i < activeStepIndices.length; i += 1) {
            rotatedSteps[activeStepIndices[i]] = !!steps[rotatedActive[i]];
          }
          for (let i = 0; i < steps.length; i += 1) steps[i] = !!rotatedSteps[i];
        }
      }
      const phraseRoot = helpers.normalizeSwarmNoteName?.(notes[0]) || 'C4';
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
    return null;
  };
  const getSoloRhythmPreferredLaneId = (profileSourceType = '') => {
    const normalized = normalizeComposerProfileSourceType(profileSourceType);
    if (normalized === 'spawner_rhythm_pulse') return 'foundation_lane';
    if (normalized === 'spawner_rhythm_motion') return 'sparkle_lane';
    return 'secondary_loop_lane';
  };
  const getIntroSlotLockUntilBar = () => Math.max(
    Math.trunc(Number(currentBarIndex) || 0) + 4,
    18
  );
  const isLockedIntroSlotProfile = (groupLike) => {
    const group = groupLike && typeof groupLike === 'object' ? groupLike : null;
    if (!group || group.introSlotLock !== true) return false;
    const lockUntilBar = Math.max(-1, Math.trunc(Number(group?.introSlotLockUntilBar) || -1));
    return lockUntilBar < 0 || currentBarIndex <= lockUntilBar;
  };
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
  const isActiveIntroSlotProfile = (groupLike) => {
    const group = groupLike && typeof groupLike === 'object' ? groupLike : null;
    if (!group || group?.active !== true || group?.retiring) return false;
    return isIntroSlotProfileSourceType(getIntroSlotProfileSourceType(group));
  };
  const isIntroRhythmStageCarrier = (groupLike) => {
    const group = groupLike && typeof groupLike === 'object' ? groupLike : null;
    if (!group || group?.introStageCarrier !== true) return false;
    return isIntroSlotProfileSourceType(getIntroSlotProfileSourceType(group));
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
  const INTRO_SLOT_BODY_POLICY = Object.freeze({
    spawner_rhythm_pulse: Object.freeze(['group']),
    spawner_rhythm_backbeat: Object.freeze(['group', 'solo']),
    spawner_rhythm_motion: Object.freeze(['solo']),
  });
  const getEligibleIntroRhythmCarrierBodyTypes = (profileSourceType = '') => {
    const normalized = String(profileSourceType || '').trim().toLowerCase();
    const eligible = INTRO_SLOT_BODY_POLICY[normalized];
    return Array.isArray(eligible) && eligible.length ? eligible.slice() : ['solo'];
  };
  const chooseDefaultIntroRhythmCarrierBodyType = (profileSourceType = '') => {
    const eligible = getEligibleIntroRhythmCarrierBodyTypes(profileSourceType);
    if (eligible.length <= 1) return String(eligible[0] || 'solo').trim().toLowerCase();
    const profileSalt = normalizeComposerProfileSourceType(profileSourceType) === 'spawner_rhythm_backbeat' ? 23 : 0;
    const seed = Math.max(
      0,
      Math.trunc(Number(composerRuntime.__introArrangementSeed) || Number(sessionSeed) || 0)
    ) + profileSalt;
    return String(eligible[seed % eligible.length] || eligible[0] || 'solo').trim().toLowerCase();
  };
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
    if (introComposerLockActive || String(effectivePacingCaps?.responseMode || '').trim().toLowerCase() !== 'group') {
      return parityLane;
    }
    if (fallbackMelodyCoverageRequested || fallbackRhythmCoverageRequested) return 'call';
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

  const getActiveSoloCarrierCount = (soloType) => composerEnemyGroups.filter((group) => (
    group
    && group.active
    && !group.retiring
    && (
      String(group?.soloCarrierType || '').trim().toLowerCase() === soloType
      || (
        soloType === 'rhythm'
        && isActiveIntroSlotProfile(group)
      )
    )
  )).length;
  const getActiveMelodyCoverageCount = () => composerEnemyGroups.filter((group) => (
    group
    && group.active
    && !group.retiring
    && (
      String(group?.soloCarrierType || '').trim().toLowerCase() === 'melody'
      || String(group?.musicLaneId || '').trim().toLowerCase() === 'primary_loop_lane'
    )
  )).length;
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
      && !isActiveIntroSlotProfile(group)
      && String(group?.templateId || '').trim() !== 'foundation-buffer'
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
  const promoteExistingGroupToFallbackSoloCarrier = (soloType) => {
    const normalizedSoloType = String(soloType || '').trim().toLowerCase();
    if (normalizedSoloType !== 'melody' && normalizedSoloType !== 'rhythm') return null;
    const profileSourceType = normalizedSoloType === 'melody' ? 'lead_melody' : 'rhythm_lane';
    const sharedSoloProfile = getSharedCarrierMusicProfile(profileSourceType) || null;
    const candidate = composerEnemyGroups.find((group) => {
      if (!group || group.active !== true || group.retiring) return false;
      if (isActiveIntroSlotProfile(group)) return false;
      if (String(group?.templateId || '').trim() === 'foundation-buffer') return false;
      if (String(group?.soloCarrierType || '').trim()) return false;
      if (String(group?.musicLaneId || '').trim().toLowerCase() === 'primary_loop_lane') return false;
      if (normalizedSoloType === 'melody') {
        const role = helpers.normalizeSwarmRole?.(group?.role || '', constants.leadRole) || '';
        if (role === constants.bassRole) return false;
      }
      return getAliveComposerEnemiesByIds(group?.memberIds).length > 0;
    }) || null;
    if (!candidate) {
      try {
        noteMusicSystemEvent?.('music_composer_fallback_promotion', {
          phase: 'miss',
          soloCarrierType: normalizedSoloType,
          reason: 'no_candidate_group',
        }, {
          beatIndex: Math.max(0, Math.trunc(Number(currentBeatIndex) || 0)),
          barIndex: Math.max(0, Math.trunc(Number(currentBarIndex) || 0)),
        });
      } catch {}
      return null;
    }
    candidate.soloCarrierType = normalizedSoloType;
    candidate.musicProfileSourceType = profileSourceType;
    candidate.role = sharedSoloProfile?.role || (normalizedSoloType === 'melody' ? constants.leadRole : candidate.role);
    candidate.actionType = sharedSoloProfile?.actionType || (normalizedSoloType === 'rhythm' ? 'explosion' : 'projectile');
    candidate.musicLaneId = sharedSoloProfile?.musicLaneId
      || (normalizedSoloType === 'melody' ? 'primary_loop_lane' : getSoloRhythmPreferredLaneId(profileSourceType));
    candidate.musicLaneLayer = sharedSoloProfile?.musicLaneLayer || 'loops';
    candidate.callResponseLane = sharedSoloProfile?.callResponseLane || 'solo';
    if (Array.isArray(sharedSoloProfile?.steps) && sharedSoloProfile.steps.length) {
      candidate.steps = sharedSoloProfile.steps.slice(0, constants.weaponTuneSteps);
    }
    if (Array.isArray(sharedSoloProfile?.rows)) {
      candidate.rows = sharedSoloProfile.rows.slice(0, constants.weaponTuneSteps);
    }
    if (Array.isArray(sharedSoloProfile?.notes) && sharedSoloProfile.notes.length) {
      candidate.notes = sharedSoloProfile.notes.slice();
    }
    if (Array.isArray(sharedSoloProfile?.noteIndices)) {
      candidate.noteIndices = sharedSoloProfile.noteIndices.slice(0, constants.weaponTuneSteps);
    }
    if (Array.isArray(sharedSoloProfile?.notePalette)) {
      candidate.notePalette = sharedSoloProfile.notePalette.slice();
    }
    if (sharedSoloProfile?.phraseRoot) candidate.phraseRoot = sharedSoloProfile.phraseRoot;
    if (sharedSoloProfile?.phraseFifth) candidate.phraseFifth = sharedSoloProfile.phraseFifth;
    if (Array.isArray(sharedSoloProfile?.resolutionTargets) && sharedSoloProfile.resolutionTargets.length) {
      candidate.resolutionTargets = sharedSoloProfile.resolutionTargets.slice();
    }
    if (sharedSoloProfile?.instrumentId) {
      candidate.instrumentId = String(sharedSoloProfile.instrumentId);
      candidate.instrument = String(sharedSoloProfile.instrumentId);
    }
    candidate.__bsComposerMemberSyncSignature = '';
    candidate.__bsComposerMemberSyncCount = -1;
    const aliveMembers = getAliveComposerEnemiesByIds(candidate?.memberIds);
    for (const enemy of aliveMembers) {
      if (!enemy || typeof enemy !== 'object') continue;
      enemy.__bsComposerSyncSignature = '';
      enemy.callResponseLane = 'solo';
      enemy.musicLaneId = String(candidate.musicLaneId || enemy.musicLaneId || '').trim().toLowerCase();
    }
    try {
      noteMusicSystemEvent?.('music_composer_fallback_promotion', {
        phase: 'promoted',
        groupId: Math.trunc(Number(candidate?.id) || 0),
        soloCarrierType: normalizedSoloType,
        musicLaneId: String(candidate?.musicLaneId || '').trim().toLowerCase(),
        callResponseLane: String(candidate?.callResponseLane || '').trim().toLowerCase(),
        aliveMemberCount: aliveMembers.length,
      }, {
        beatIndex: Math.max(0, Math.trunc(Number(currentBeatIndex) || 0)),
        barIndex: Math.max(0, Math.trunc(Number(currentBarIndex) || 0)),
      });
    } catch {}
    return candidate;
  };
  if (currentBarIndex < 20) {
    const earlyVisibleSoloGroups = getActiveVisibleNonFoundationSoloGroups()
      .slice()
      .sort((a, b) => Math.trunc(Number(a?.id) || 0) - Math.trunc(Number(b?.id) || 0));
    for (let i = 1; i < earlyVisibleSoloGroups.length; i++) {
      retireGroup(earlyVisibleSoloGroups[i], 'early_solo_overflow');
    }
  }
  if (!introComposerLockActive) {
    if (spawnWantsSoloRhythm && getActiveSoloCarrierCount('rhythm') === 0) {
      const replaceable = findReplaceableNonSoloGroup();
      if (replaceable) retireGroup(replaceable, 'solo_rhythm_turnover');
      effectivePacingCaps.responseMode = 'group';
      effectivePacingCaps.maxComposerGroups = Math.max(1, Math.trunc(Number(effectivePacingCaps?.maxComposerGroups) || 0));
      effectivePacingCaps.maxComposerGroupSize = Math.max(1, Math.trunc(Number(effectivePacingCaps?.maxComposerGroupSize) || 1));
      effectivePacingCaps.maxComposerPerformers = Math.max(1, Math.trunc(Number(effectivePacingCaps?.maxComposerPerformers) || 1));
    }
    if (spawnWantsSoloMelody && getActiveMelodyCoverageCount() === 0) {
      promoteExistingGroupToFallbackSoloCarrier('melody');
      const replaceable = findReplaceableNonSoloGroup();
      if (replaceable) retireGroup(replaceable, 'solo_melody_turnover');
      effectivePacingCaps.responseMode = 'group';
      effectivePacingCaps.maxComposerGroups = Math.max(1, Math.trunc(Number(effectivePacingCaps?.maxComposerGroups) || 0));
      effectivePacingCaps.maxComposerGroupSize = Math.max(1, Math.trunc(Number(effectivePacingCaps?.maxComposerGroupSize) || 1));
      effectivePacingCaps.maxComposerPerformers = Math.max(1, Math.trunc(Number(effectivePacingCaps?.maxComposerPerformers) || 1));
    }
    if (!spawnWantsSoloRhythm && fallbackRhythmCoverageRequested && getActiveSoloCarrierCount('rhythm') === 0) {
      const replaceable = findReplaceableNonSoloGroup();
      if (replaceable) retireGroup(replaceable, 'fallback_rhythm_turnover');
      effectivePacingCaps.responseMode = 'group';
      effectivePacingCaps.maxComposerGroups = Math.max(1, Math.trunc(Number(effectivePacingCaps?.maxComposerGroups) || 0));
      effectivePacingCaps.maxComposerGroupSize = Math.max(1, Math.trunc(Number(effectivePacingCaps?.maxComposerGroupSize) || 1));
      effectivePacingCaps.maxComposerPerformers = Math.max(1, Math.trunc(Number(effectivePacingCaps?.maxComposerPerformers) || 1));
    }
    if (!spawnWantsSoloMelody && fallbackMelodyCoverageRequested && getActiveMelodyCoverageCount() === 0) {
      if (getActiveMelodyCoverageCount() === 0) {
        promoteExistingGroupToFallbackSoloCarrier('melody');
      }
      const replaceable = findReplaceableNonSoloGroup();
      if (replaceable) retireGroup(replaceable, 'fallback_melody_turnover');
      effectivePacingCaps.responseMode = 'group';
      effectivePacingCaps.maxComposerGroups = Math.max(1, Math.trunc(Number(effectivePacingCaps?.maxComposerGroups) || 0));
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
  withPerfSample('maintainComposerGroups.lifecycle', () => {
    helpers.maintainComposerEnemyGroupsLifecycle?.({
      enabled: !!constants.composerGroupsEnabled && !!composerRuntime.enabled,
      composerEnemyGroups,
      pacingCaps: effectivePacingCaps,
      composer,
      introStage,
      sessionAgeBars,
      introStateAgeBars,
      currentBarIndex,
      directorLanePlan,
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
        if (spawnWantsSoloMelody || fallbackMelodyCoverageRequested) {
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
      noteMusicSystemEvent,
      createGroupFromMotif: ({ groupIndex, sectionKey, composer: composerDirective, templateId, motif, pacingCaps: caps, forcedIntroProfileSourceType = '' }) => {
        return withPerfSample('maintainComposerGroups.createGroup', () => {
          const forcedIntroProfile = String(forcedIntroProfileSourceType || '').trim().toLowerCase();
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
          const activeIntroPulseCarrier = hasActiveIntroSlotCarrierProfile('spawner_rhythm_pulse');
          const activeIntroBackbeatCarrier = hasActiveIntroSlotCarrierProfile('spawner_rhythm_backbeat');
          const activePrimaryLoopCarrier = composerEnemyGroups.some((group) => (
            group
            && group.active === true
            && !group.retiring
            && String(group?.musicLaneId || '').trim().toLowerCase() === 'primary_loop_lane'
          ));
          const activePrimaryLoopMelodyCarrier = composerEnemyGroups.some((group) => (
            group
            && group.active === true
            && !group.retiring
            && String(group?.musicLaneId || '').trim().toLowerCase() === 'primary_loop_lane'
            && (
              String(group?.soloCarrierType || '').trim().toLowerCase() === 'melody'
              || isComposerMelodyProfile(group?.musicProfileSourceType)
            )
          ));
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
            || ((introRhythmOnlyWindow || introSoftRampWindow) && !spawnWantsSoloMelody)
          );
          const fallbackSoloCarrierType = fallbackMelodyCoverageRequested
            ? 'melody'
            : (fallbackRhythmCoverageRequested ? 'rhythm' : '');
          const soloCarrierType = introStageSoloRhythmActive
            ? 'rhythm'
            : (spawnWantsSoloRhythm
              ? 'rhythm'
              : (spawnWantsSoloMelody ? 'melody' : fallbackSoloCarrierType));
          const melodyCarrierRequested = soloCarrierType === 'melody';
          if (melodyCarrierRequested && activePrimaryLoopMelodyCarrier) {
            return null;
          }
          if (melodyCarrierRequested) {
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
              soloCarrierType !== 'melody'
              || activePrimaryLoopCarrier
            )
          ) {
            return null;
          }
          const introRhythmCarrierBodyType = introStageSoloRhythmActive
            ? chooseComposerBodyTypeForMusicLane(
                introSecondaryRhythmLaneId,
                getPreferredCarrierForMusicLaneId(introSecondaryRhythmLaneId),
                chooseDefaultIntroRhythmCarrierBodyType(introRhythmProfileSourceType)
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
          const sharedProfileSourceType = soloCarrierType === 'rhythm'
            ? (introRhythmProfileSourceType || 'rhythm_lane')
            : (soloCarrierType === 'melody' ? 'lead_melody' : '');
          const sharedSoloProfile = sharedProfileSourceType
            ? getSharedCarrierMusicProfile(sharedProfileSourceType, { instrumentInfluence: motif?.instrumentInfluence || motif?.musicPaletteOverride })
            : null;
          const introPercussionCarrierActive = introRhythmOnlyWindow && !soloCarrierActive;
          if (introPercussionCarrierActive) effectiveTemplateId = 'intro_percussion_group';
          const soloLaneId = soloCarrierType === 'rhythm'
            ? getSoloRhythmPreferredLaneId(sharedProfileSourceType)
            : (soloCarrierType === 'melody' ? 'primary_loop_lane' : '');
          const resolvedCarrierLaneId = introPercussionCarrierActive
            ? 'secondary_loop_lane'
            : (sharedSoloProfile?.musicLaneId || soloLaneId);
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
          const effectiveVisualSoloCarrierType = (resolvedComposerBodyType === 'group' && !introStageSoloRhythmActive)
            ? ''
            : visualSoloCarrierType;
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
          const createdRole = introPercussionCarrierActive
            ? constants.leadRole
            : (sharedSoloProfile?.role || (soloCarrierType === 'melody' ? constants.leadRole : role));
          const soloRhythmCarrierActive = soloCarrierType === 'rhythm';
          const fallbackInstrument = introPercussionCarrierActive
            ? (
              helpers.getIdForDisplayName?.('Bass Tone 3')
              || helpers.getIdForDisplayName?.('Bass Tone 4')
              || 'tone'
            )
            : (
              motif?.instrument
              || helpers.resolveSwarmRoleInstrumentId?.(createdRole, helpers.resolveSwarmSoundInstrumentId?.('projectile') || 'tone')
              || helpers.resolveSwarmSoundInstrumentId?.('projectile')
              || 'tone'
            );
          const melodyInstrumentPreferred = melodyCarrierRequested
            ? (
              sharedSoloProfile?.instrumentId
              || motif?.instrument
              || helpers.resolveSwarmRoleInstrumentId?.(constants.leadRole, helpers.resolveSwarmSoundInstrumentId?.('projectile') || 'tone')
            )
            : '';
          const instrumentId = sanitizeEnemyMusicInstrumentId(
            introPercussionCarrierActive
              ? fallbackInstrument
              : (melodyInstrumentPreferred || sharedSoloProfile?.instrumentId || motif?.instrument),
            fallbackInstrument,
            { role: melodyCarrierRequested ? constants.leadRole : createdRole, toyKey: introPercussionCarrierActive ? 'loopgrid-drum' : undefined }
          );
          const created = ({
            id: helpers.getNextComposerEnemyGroupId?.(),
            sectionKey,
            sectionId: String(composerDirective?.sectionId || 'default'),
            templateId: (introRhythmUsesGroupBody || (soloCarrierActive && resolvedComposerBodyType === 'group'))
              ? effectiveTemplateId
              : (effectiveVisualSoloCarrierActive ? `solo-${effectiveVisualSoloCarrierType}-carrier` : effectiveTemplateId),
            role: createdRole,
            musicLaneId: resolvedCarrierLaneId,
            musicLaneLayer: introPercussionCarrierActive ? 'loops' : (sharedSoloProfile?.musicLaneLayer || (soloCarrierType === 'rhythm' ? 'loops' : (soloCarrierType === 'melody' ? 'loops' : ''))),
            callResponseLane: groupRhythmCarrierActive
              ? (sharedSoloProfile?.callResponseLane || 'solo')
              : ((soloCarrierType === 'rhythm' || soloCarrierType === 'melody')
              ? (sharedSoloProfile?.callResponseLane || 'solo')
              : (introPercussionCarrierActive ? 'call' : (soloCarrierType === 'melody' ? 'call' : resolvedCallResponseLane))),
            shape: introRhythmUsesGroupBody
              ? String(motif?.shape || helpers.pickComposerGroupShape?.({ shapes: constants.composerGroupShapes, index: groupIndex }))
              : (soloCarrierActive
              ? (soloCarrierType === 'rhythm' ? 'square' : 'diamond')
              : String(motif?.shape || helpers.pickComposerGroupShape?.({ shapes: constants.composerGroupShapes, index: groupIndex }))),
            color: soloCarrierActive
              ? (soloCarrierType === 'rhythm'
                ? (normalizeComposerProfileSourceType(sharedProfileSourceType) === 'spawner_rhythm_backbeat'
                  ? '#9ad6ff'
                  : (normalizeComposerProfileSourceType(sharedProfileSourceType) === 'spawner_rhythm_motion' ? '#c8ff9a' : '#ffd29a'))
                : '#ffe7a6')
              : String(motif?.color || helpers.pickComposerGroupColor?.({ colors: constants.composerGroupColors, index: groupIndex })),
            actionType: introPercussionCarrierActive
              ? 'explosion'
              : (groupRhythmCarrierActive
                ? 'explosion'
                : (sharedSoloProfile?.actionType || (soloCarrierType === 'rhythm' ? 'explosion' : String(motif?.actionType || 'projectile')))),
            threatLevel: String(motif?.threatLevel || constants.fullThreat),
            introPercussionCarrier: introPercussionCarrierActive,
            performers: (introRhythmUsesGroupBody || groupRhythmCarrierActive)
              ? 6
              : (soloCarrierActive
              ? 1
              : Math.max(
                1,
                Math.min(
                  Math.max(constants.composerGroupPerformersMin, Math.min(constants.composerGroupPerformersMax, Math.trunc(Number(motif?.performers) || 1))),
                  Math.max(1, caps?.maxComposerPerformers || constants.composerGroupPerformersMax)
                )
              )),
            size: (introRhythmUsesGroupBody || groupRhythmCarrierActive)
              ? 6
              : (soloCarrierActive
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
            rows: soloCarrierActive && !groupRhythmCarrierActive && Array.isArray(sharedSoloProfile?.rows)
              ? sharedSoloProfile.rows.slice(0, constants.weaponTuneSteps)
              : undefined,
            motif: motif?.motif && typeof motif.motif === 'object'
              ? {
                id: String(motif.motif.id || `${templateId}-motif`),
                steps: Array.isArray(motif.motif.steps) ? motif.motif.steps.slice(0, constants.weaponTuneSteps) : [],
              }
              : {
                id: `${templateId}-motif`,
                steps: Array.isArray(motif?.steps) ? motif.steps.slice(0, constants.weaponTuneSteps) : [],
              },
            notes: (introPercussionCarrierActive
              ? ['C3']
              : (soloCarrierActive && Array.isArray(sharedSoloProfile?.notes) && sharedSoloProfile.notes.length
                ? sharedSoloProfile.notes
                : (Array.isArray(motif?.notes) && motif.notes.length ? motif.notes : [helpers.getRandomSwarmPentatonicNote?.()])))
              .map((n, idx) => {
                const normalized = helpers.normalizeSwarmNoteName?.(n) || helpers.getRandomSwarmPentatonicNote?.();
                return introPercussionCarrierActive
                  ? normalized
                  : helpers.clampNoteToDirectorPool?.(normalized, groupIndex + idx);
              }),
            gravityNotes: (Array.isArray(motif?.gravityNotes) ? motif.gravityNotes : [])
              .map((n, idx) => helpers.clampNoteToDirectorPool?.(helpers.normalizeSwarmNoteName?.(n) || helpers.getRandomSwarmPentatonicNote?.(), groupIndex + idx))
              .filter(Boolean),
            phraseRoot: introPercussionCarrierActive
              ? 'C3'
              : helpers.clampNoteToDirectorPool?.(
                helpers.normalizeSwarmNoteName?.(sharedSoloProfile?.phraseRoot)
                  || (
                helpers.normalizeSwarmNoteName?.(motif?.phraseRoot)
                  || helpers.normalizeSwarmNoteName?.(Array.isArray(motif?.notes) ? motif.notes[0] : '')
                  || helpers.getRandomSwarmPentatonicNote?.()),
                groupIndex
              ),
            phraseFifth: introPercussionCarrierActive
              ? 'C3'
              : helpers.clampNoteToDirectorPool?.(
                helpers.normalizeSwarmNoteName?.(sharedSoloProfile?.phraseFifth)
                  || (
                helpers.normalizeSwarmNoteName?.(motif?.phraseFifth)
                  || helpers.normalizeSwarmNoteName?.(Array.isArray(motif?.notes) ? motif.notes[Math.min(2, Math.max(0, motif.notes.length - 1))] : '')
                  || helpers.getRandomSwarmPentatonicNote?.()),
                groupIndex + 2
              ),
            resolutionTargets: (soloCarrierActive && Array.isArray(sharedSoloProfile?.resolutionTargets) && sharedSoloProfile.resolutionTargets.length
              ? sharedSoloProfile.resolutionTargets
              : (Array.isArray(motif?.resolutionTargets) ? motif.resolutionTargets : []))
              .map((n, idx) => helpers.clampNoteToDirectorPool?.(helpers.normalizeSwarmNoteName?.(n) || helpers.getRandomSwarmPentatonicNote?.(), groupIndex + idx + 3))
              .filter(Boolean),
            instrument: instrumentId,
            instrumentId,
            continuityId: String(motif?.continuityId || '') || helpers.getNextMusicContinuityId?.(),
            soloCarrierType: effectiveVisualSoloCarrierType,
            introCarrierBodyType: introStageSoloRhythmActive ? introRhythmCarrierBodyType : (soloCarrierActive ? resolvedComposerBodyType : ''),
            introStageCarrier: introStageSoloRhythmActive,
            introSlotCreatedBarIndex: introStageSoloRhythmActive ? Math.trunc(Number(currentBarIndex) || 0) : -1,
            introSlotCreatedBeatIndex: introStageSoloRhythmActive ? Math.trunc(Number(currentBeatIndex) || 0) : -1,
            introSlotLock: introStageSoloRhythmActive,
            introSlotLockUntilBar: introStageSoloRhythmActive ? getIntroSlotLockUntilBar() : -1,
            musicProfileSourceType: sharedProfileSourceType || '',
            introSlotProfileSourceType: introStageSoloRhythmActive ? (sharedProfileSourceType || '') : '',
            introSlotRole: introStageSoloRhythmActive ? String(createdRole || '') : '',
            introSlotMusicLaneId: introStageSoloRhythmActive ? String(sharedSoloProfile?.musicLaneId || soloLaneId || '') : '',
            introSlotMusicLaneLayer: introStageSoloRhythmActive ? String(sharedSoloProfile?.musicLaneLayer || (soloCarrierType === 'rhythm' ? 'loops' : '')) : '',
            introSlotCallResponseLane: introStageSoloRhythmActive ? String(sharedSoloProfile?.callResponseLane || 'solo') : '',
            introSlotInstrumentId: introStageSoloRhythmActive ? String(instrumentId || '') : '',
            introSlotActionType: introStageSoloRhythmActive ? String(sharedSoloProfile?.actionType || (soloCarrierType === 'rhythm' ? 'explosion' : String(motif?.actionType || 'projectile'))) : '',
            introSlotSteps: introStageSoloRhythmActive && Array.isArray(sharedSoloProfile?.steps)
              ? sharedSoloProfile.steps.slice(0, constants.weaponTuneSteps)
              : null,
            introSlotRows: introStageSoloRhythmActive && Array.isArray(sharedSoloProfile?.rows)
              ? sharedSoloProfile.rows.slice(0, constants.weaponTuneSteps)
              : null,
            introSlotNotes: introStageSoloRhythmActive && Array.isArray(sharedSoloProfile?.notes)
              ? sharedSoloProfile.notes.slice()
              : null,
            introSlotNoteIndices: introStageSoloRhythmActive && Array.isArray(sharedSoloProfile?.noteIndices)
              ? sharedSoloProfile.noteIndices.slice(0, constants.weaponTuneSteps)
              : null,
            introSlotNotePalette: introStageSoloRhythmActive && Array.isArray(sharedSoloProfile?.notePalette)
              ? sharedSoloProfile.notePalette.slice()
              : null,
            introSlotPhraseRoot: introStageSoloRhythmActive ? String(sharedSoloProfile?.phraseRoot || '') : '',
            introSlotPhraseFifth: introStageSoloRhythmActive ? String(sharedSoloProfile?.phraseFifth || '') : '',
            introSlotResolutionTargets: introStageSoloRhythmActive && Array.isArray(sharedSoloProfile?.resolutionTargets)
              ? sharedSoloProfile.resolutionTargets.slice()
              : null,
            groupRhythmCarrierLock: groupRhythmCarrierActive,
            groupRhythmSteps: groupRhythmCarrierActive && Array.isArray(groupRhythmPattern)
              ? groupRhythmPattern.slice(0, constants.weaponTuneSteps)
              : null,
            groupRhythmRole: groupRhythmCarrierActive ? String(createdRole || '') : '',
            groupRhythmInstrumentId: groupRhythmCarrierActive ? String(instrumentId || '') : '',
            groupRhythmCallResponseLane: groupRhythmCarrierActive ? 'solo' : '',
            groupRhythmMusicLaneId: groupRhythmCarrierActive ? String(resolvedCarrierLaneId || '') : '',
            groupRhythmMusicLaneLayer: groupRhythmCarrierActive
              ? String(sharedSoloProfile?.musicLaneLayer || (resolvedCarrierLaneId === 'foundation_lane' ? 'foundation' : 'loops'))
              : '',
            groupRhythmNotes: groupRhythmCarrierActive && Array.isArray(sharedSoloProfile?.notes)
              ? sharedSoloProfile.notes.slice()
              : null,
            groupRhythmPhraseRoot: groupRhythmCarrierActive ? String(sharedSoloProfile?.phraseRoot || '') : '',
            groupRhythmPhraseFifth: groupRhythmCarrierActive ? String(sharedSoloProfile?.phraseFifth || '') : '',
            groupRhythmResolutionTargets: groupRhythmCarrierActive && Array.isArray(sharedSoloProfile?.resolutionTargets)
              ? sharedSoloProfile.resolutionTargets.slice()
              : null,
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
          helpers.ensureMusicLaneAssignment?.({
            group: created,
            role: created.role,
            layer: created.role === constants.bassRole ? 'foundation' : 'loops',
            preferredLaneId: soloLaneId,
            instrumentId,
            continuityId: created.continuityId,
            phraseId: String(created?.motif?.id || ''),
            performerGroupId: Math.trunc(Number(created.id) || 0),
            performerType: 'composer-group',
            lockInstrument: true,
          });
          if (!forcedIntroProfile && !soloCarrierActive && !introPercussionCarrierActive) {
            const normalizedCreatedLaneId = String(created?.musicLaneId || '').trim().toLowerCase();
            if (normalizedCreatedLaneId === 'secondary_loop_lane' && created.callResponseLane !== 'response') {
              created.musicProfileSourceType = 'rhythm_lane';
            } else if (normalizedCreatedLaneId === 'primary_loop_lane' && created.callResponseLane !== 'response') {
              created.musicProfileSourceType = 'lead_melody';
            }
          }
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
              musicLaneId: String(created?.musicLaneId || '').trim().toLowerCase(),
              instrumentId: String(created?.instrumentId || created?.instrument || '').trim(),
              note: Array.isArray(created?.notes) && created.notes.length ? String(created.notes[0] || '').trim() : '',
              reason: String(created?.introSlotProfileSourceType || created?.musicProfileSourceType || '').trim().toLowerCase(),
              stage: buildStepSignature(created?.introSlotSteps || created?.steps),
            }, {
              beatIndex: Math.max(0, Math.trunc(Number(currentBeatIndex) || 0)),
            });
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
      const introPercussionCarrier = group?.introPercussionCarrier === true;
      const soloCarrierType = String(group?.soloCarrierType || '').trim().toLowerCase();
      const groupRhythmCarrierLocked = group?.groupRhythmCarrierLock === true
        && !soloCarrierType
        && String(group?.introCarrierBodyType || '').trim().toLowerCase() === 'group';
      const introSlotIdentityLocked = isLockedIntroSlotProfile(group);
      const introSlotIdentityActive = introSlotIdentityLocked || isActiveIntroSlotProfile(group);
      const templateRole = helpers.normalizeSwarmRole?.(
        templateById.get(String(group?.templateId || ''))?.role || '',
        ''
      );
      if (introSlotIdentityActive) {
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
      } else if (
        !groupRhythmCarrierLocked
        && templateRole
        && !introPercussionCarrier
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
      const memberLifecycleState = helpers.normalizeMusicLifecycleState?.(group.lifecycleState, 'active');
      const musicProfileSourceType = introSlotIdentityActive
        ? getIntroSlotProfileSourceType(group)
        : normalizeComposerProfileSourceType(group?.musicProfileSourceType);
      const primaryLoopMelodyIdentity = (
        String(group?.musicLaneId || '').trim().toLowerCase() === 'primary_loop_lane'
        && isComposerMelodyProfile(musicProfileSourceType)
      );
      const soloPreferredLaneId = soloCarrierType === 'rhythm'
        ? getSoloRhythmPreferredLaneId(musicProfileSourceType)
        : (soloCarrierType === 'melody' ? 'primary_loop_lane' : '');
      const lockedGroupRhythmProfile = groupRhythmCarrierLocked && musicProfileSourceType
        ? getSharedCarrierMusicProfile(musicProfileSourceType, { instrumentInfluence: group?.instrumentInfluence })
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
        const sharedSoloProfile = lockIntroRhythmProfile
          ? null
          : getSharedCarrierMusicProfile(
            musicProfileSourceType || (soloCarrierType === 'rhythm' ? 'rhythm_lane' : 'lead_melody'),
            { instrumentInfluence: group?.instrumentInfluence }
          );
        if (sharedSoloProfile) {
          group.role = sharedSoloProfile.role || group.role;
          group.actionType = sharedSoloProfile.actionType || group.actionType;
          group.musicLaneId = sharedSoloProfile.musicLaneId || group.musicLaneId;
          group.musicLaneLayer = sharedSoloProfile.musicLaneLayer || group.musicLaneLayer || 'loops';
          group.callResponseLane = sharedSoloProfile.callResponseLane || group.callResponseLane || 'solo';
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
          const syncedSoloInstrumentId = (primaryLoopMelodyIdentity || soloCarrierType === 'melody' || !String(group?.instrumentId || group?.instrument || '').trim())
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
      if (groupRhythmCarrierLocked) {
        group.role = String(group?.groupRhythmRole || lockedGroupRhythmProfile?.role || group?.role || constants.leadRole);
        group.actionType = 'explosion';
        group.musicLaneId = String(group?.groupRhythmMusicLaneId || lockedGroupRhythmProfile?.musicLaneId || group?.musicLaneId || '').trim().toLowerCase();
        group.musicLaneLayer = String(group?.groupRhythmMusicLaneLayer || lockedGroupRhythmProfile?.musicLaneLayer || group?.musicLaneLayer || 'loops').trim().toLowerCase();
        group.callResponseLane = String(group?.groupRhythmCallResponseLane || 'solo').trim().toLowerCase();
        group.performers = Math.max(2, Math.trunc(Number(group?.performers) || 6));
        group.size = Math.max(2, Math.trunc(Number(group?.size) || 6));
        if (Array.isArray(group?.groupRhythmSteps) && group.groupRhythmSteps.length) {
          group.steps = group.groupRhythmSteps.slice(0, constants.weaponTuneSteps);
        } else if (Array.isArray(lockedGroupRhythmProfile?.steps) && lockedGroupRhythmProfile.steps.length) {
          group.steps = lockedGroupRhythmProfile.steps.slice(0, constants.weaponTuneSteps);
        }
        group.rows = [];
        group.noteIndices = [];
        group.notePalette = [];
        if (Array.isArray(group?.groupRhythmNotes) && group.groupRhythmNotes.length) {
          group.notes = group.groupRhythmNotes.slice();
        } else if (Array.isArray(lockedGroupRhythmProfile?.notes) && lockedGroupRhythmProfile.notes.length) {
          group.notes = lockedGroupRhythmProfile.notes.slice();
        }
        if (group?.groupRhythmPhraseRoot || lockedGroupRhythmProfile?.phraseRoot) {
          group.phraseRoot = String(group?.groupRhythmPhraseRoot || lockedGroupRhythmProfile?.phraseRoot || '');
        }
        if (group?.groupRhythmPhraseFifth || lockedGroupRhythmProfile?.phraseFifth) {
          group.phraseFifth = String(group?.groupRhythmPhraseFifth || lockedGroupRhythmProfile?.phraseFifth || '');
        }
        if (Array.isArray(group?.groupRhythmResolutionTargets) && group.groupRhythmResolutionTargets.length) {
          group.resolutionTargets = group.groupRhythmResolutionTargets.slice();
        } else if (Array.isArray(lockedGroupRhythmProfile?.resolutionTargets) && lockedGroupRhythmProfile.resolutionTargets.length) {
          group.resolutionTargets = lockedGroupRhythmProfile.resolutionTargets.slice();
        }
        const lockedGroupRhythmInstrumentId = sanitizeEnemyMusicInstrumentId(
          group?.groupRhythmInstrumentId || lockedGroupRhythmProfile?.instrumentId || group?.instrumentId || group?.instrument,
          helpers.resolveSwarmSoundInstrumentId?.('projectile') || 'tone',
          { role: group?.groupRhythmRole || lockedGroupRhythmProfile?.role || group?.role || constants.leadRole, toyKey: 'loopgrid-drum' }
        );
        if (lockedGroupRhythmInstrumentId) {
          group.instrumentId = lockedGroupRhythmInstrumentId;
          group.instrument = lockedGroupRhythmInstrumentId;
        }
      } else if (!soloCarrierType && musicProfileSourceType) {
        const sharedCarrierProfile = getSharedCarrierMusicProfile(musicProfileSourceType, { instrumentInfluence: group?.instrumentInfluence });
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
        }
      }
      if (soloPreferredLaneId && !String(group?.musicLaneId || '').trim()) group.musicLaneId = soloPreferredLaneId;
      if (soloCarrierType && !String(group?.musicLaneLayer || '').trim()) group.musicLaneLayer = 'loops';
      const templateRoleEligible = !soloCarrierType && !introSlotIdentityActive && !groupRhythmCarrierLocked;
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
            musicLaneId: String(group?.musicLaneId || '').trim().toLowerCase(),
            instrumentId: String(group?.instrumentId || group?.instrument || '').trim(),
            note: Array.isArray(group?.notes) && group.notes.length ? String(group.notes[0] || '').trim() : '',
            reason: String(group?.introSlotProfileSourceType || group?.musicProfileSourceType || '').trim().toLowerCase(),
            stage: buildStepSignature(group?.introSlotSteps || group?.steps),
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
        }, {
          beatIndex: Math.max(0, Math.trunc(Number(currentBeatIndex) || 0)),
        });
      }
      const aliveMembers = getAliveComposerEnemiesByIds(group.memberIds);
      if (soloCarrierType) {
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
            extraEnemy.retreating = true;
          }
          group.memberIds = new Set(keeper ? [Math.trunc(Number(keeper?.id) || 0)].filter((id) => id > 0) : []);
        }
      }
      const syncedAliveMembers = getAliveComposerEnemiesByIds(group.memberIds);
      const primarySoloMemberId = soloCarrierType && syncedAliveMembers.length
        ? Math.trunc(Number(syncedAliveMembers[0]?.id) || 0)
        : 0;
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
          preferredLaneId: soloPreferredLaneId,
          instrumentId: effectiveInstrumentId,
          continuityId: effectiveContinuityId,
          phraseId: effectivePhraseId,
          performerEnemyId: Math.trunc(Number(enemy?.id) || 0),
          performerGroupId: Math.trunc(Number(group?.id) || 0),
          performerType: 'composer-group-member',
          lockInstrument: group?.introStageCarrier === true || introSlotIdentityActive,
        });
        if (templateRoleEligible && templateRole) {
          enemy.musicalRole = templateRole;
          enemy.composerRole = templateRole;
          if (group?.instrumentId) {
            enemy.composerInstrument = String(group.instrumentId);
            enemy.instrumentId = String(group.instrumentId);
            enemy.musicInstrumentId = String(group.instrumentId);
          }
        }
        enemy.introStageCarrier = group?.introStageCarrier === true;
        const enemyIsPrimarySoloMember = soloCarrierType && Math.trunc(Number(enemy?.id) || 0) === primarySoloMemberId;
        enemy.soloCarrierType = enemyIsPrimarySoloMember ? soloCarrierType : '';
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
        Math.trunc(Number(soloCarrierType ? syncedAliveMembers.length : groupMemberCount) || 0)
      );
    }
  });
}
