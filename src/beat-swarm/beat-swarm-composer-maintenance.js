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
  const pacingState = String(helpers.getCurrentPacingStateName?.() || '').trim().toLowerCase();
  const introWindowActive = introStage !== 'none';
  const introComposerLockActive = introStage === 'player_only';
  const introRhythmOnlyWindow = introStage === 'rhythm_only';
  const introSoftRampWindow = introStage === 'soft_ramp';
  const spawnWantsSoloRhythm = spawnConfigLoaded && spawnChosenId === 'solo_rhythm_basic' && !introRhythmOnlyWindow;
  const spawnWantsSoloMelody = spawnConfigLoaded && spawnChosenId === 'solo_melody_basic' && !introRhythmOnlyWindow;
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
  const effectiveDirectorSupportGroups = strongLeadWindowActive && directorAnswerGroups > 0
    ? 0
    : directorSupportGroups;
  const effectiveDirectorAnswerGroups = directorAnswerGroups;
  const directorRequestedGroupCount = effectiveDirectorSupportGroups + effectiveDirectorAnswerGroups;
  if (!introComposerLockActive && !introHoldActive) {
    effectivePacingCaps.maxComposerGroups = Math.max(
      0,
      Math.max(Math.trunc(Number(effectivePacingCaps?.maxComposerGroups) || 0), directorRequestedGroupCount)
    );
    if (!introWindowActive && !(effectiveDirectorSupportGroups > 0 || effectiveDirectorAnswerGroups > 0) && !spawnWantsComposer) {
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
  const forcedIntroRhythmTemplate = {
    id: 'intro_percussion_group',
    role: constants.leadRole,
    callResponseLane: 'call',
    shape: 'square',
    color: '#ffd29a',
    actionType: 'explosion',
  };
  const getSharedCarrierMusicProfile = (profileSourceType, options = null) => {
    const normalizedProfileSourceType = String(profileSourceType || '').trim().toLowerCase();
    if (
      normalizedProfileSourceType === 'spawner_rhythm'
      || normalizedProfileSourceType === 'spawner_rhythm_secondary'
      || normalizedProfileSourceType === 'spawner_rhythm_pulse'
      || normalizedProfileSourceType === 'spawner_rhythm_backbeat'
      || normalizedProfileSourceType === 'spawner_rhythm_motion'
    ) {
      const explicitLayerKey = normalizedProfileSourceType === 'spawner_rhythm_pulse'
        ? 'pulse'
        : (normalizedProfileSourceType === 'spawner_rhythm_backbeat'
          ? 'backbeat'
          : (normalizedProfileSourceType === 'spawner_rhythm_motion' ? 'motion' : ''));
      const secondarySpawnerRhythmProfile = normalizedProfileSourceType === 'spawner_rhythm_secondary' || explicitLayerKey === 'backbeat';
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
      const introPulsePattern = [true, false, false, false, true, false, false, false];
      const introSecondaryPattern = [true, false, false, false, false, false, false, false];
      const introMotionPattern = [false, true, false, true, false, true, false, true];
      const introPatternSteps = !introBuildRhythmActive
        ? null
        : ((resolvedLayerKey === 'motion')
          ? introMotionPattern
          : (secondarySpawnerRhythmProfile
          ? introSecondaryPattern
          : ((introRhythmOnlyWindow || introSoftRampWindow)
          ? introPulsePattern
          : null)));
      const introStrengthenedSteps = Array.isArray(introPatternSteps) && introPatternSteps.length
        ? introPatternSteps.slice(0, constants.weaponTuneSteps)
        : (introBuildRhythmActive && baseSteps.filter(Boolean).length < 3
          ? [true, false, true, false, true, false, true, false].slice(0, constants.weaponTuneSteps)
          : baseSteps);
      const introStrengthenedNoteIndices = Array.isArray(introPatternSteps) && introPatternSteps.length
        ? introStrengthenedSteps.map((isOn, idx) => {
          if (!isOn) return 0;
          if (resolvedLayerKey === 'motion') return 6;
          if (secondarySpawnerRhythmProfile) return ((idx % 4) === 2) ? 5 : 4;
          return ((idx % 4) === 0) ? 1 : (3 + ((sessionSeed + idx) % 3));
        })
        : (introBuildRhythmActive && introStrengthenedSteps.length
          ? introStrengthenedSteps.map((isOn, idx) => (isOn ? (((idx % 4) === 0) ? 1 : 4) : 0))
          : baseNoteIndices);
      const baseNoteName = helpers.normalizeSwarmNoteName?.(effectiveSpawnerProfile?.baseNoteName) || 'C3';
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
    if (normalizedProfileSourceType === 'snake_melody') {
      const snakeProfile = helpers.getComposerMotif?.(
        helpers.getComposerMotifScopeKey?.() || '',
        'drawsnake-lead',
        () => helpers.createDrawSnakeEnemyProfile?.({
          instrumentInfluence: options?.instrumentInfluence,
        })
      ) || null;
      if (!snakeProfile) return null;
      const rows = Array.isArray(snakeProfile?.rows) ? snakeProfile.rows.slice(0, constants.weaponTuneSteps) : [];
      const notes = rows.length
        ? rows.map((row, idx) => helpers.getSwarmPentatonicNoteByIndex?.(Math.max(0, Math.trunc(Number(row) || 0)))
          || helpers.getRandomSwarmPentatonicNote?.()
          || 'C4')
        : [helpers.getRandomSwarmPentatonicNote?.() || 'C4'];
      const phraseRoot = helpers.normalizeSwarmNoteName?.(notes[0]) || 'C4';
      const phraseFifth = helpers.normalizeSwarmNoteName?.(notes[Math.min(2, Math.max(0, notes.length - 1))]) || phraseRoot;
      return {
        role: constants.leadRole,
        actionType: 'projectile',
        musicLaneId: 'primary_loop_lane',
        musicLaneLayer: 'loops',
        callResponseLane: 'solo',
        steps: Array.isArray(snakeProfile?.steps) ? snakeProfile.steps.slice(0, constants.weaponTuneSteps) : [],
        rows,
        notes,
        phraseRoot,
        phraseFifth,
        resolutionTargets: [phraseRoot, phraseFifth].filter(Boolean),
        instrumentId: sanitizeEnemyMusicInstrumentId(
          snakeProfile?.instrument,
          helpers.resolveSwarmSoundInstrumentId?.('projectile') || 'tone',
          { role: constants.leadRole, toyKey: 'drawgrid' }
        ),
      };
    }
    return null;
  };
  const getSoloRhythmPreferredLaneId = (profileSourceType = '') => {
    const normalized = String(profileSourceType || '').trim().toLowerCase();
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
    const normalized = String(profileSourceType || '').trim().toLowerCase();
    return normalized === 'spawner_rhythm_pulse'
      || normalized === 'spawner_rhythm_backbeat'
      || normalized === 'spawner_rhythm_motion';
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
  const getIntroRhythmCarrierBodyType = (profileSourceType = '') => {
    const normalized = String(profileSourceType || '').trim().toLowerCase();
    if (normalized === 'spawner_rhythm_pulse') return 'group';
    if (normalized === 'spawner_rhythm_backbeat') return 'group';
    if (normalized === 'spawner_rhythm_motion') return 'solo';
    return 'solo';
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
  if (!introComposerLockActive) {
    if (spawnWantsSoloRhythm && getActiveSoloCarrierCount('rhythm') === 0) {
      const replaceable = findReplaceableNonSoloGroup();
      if (replaceable) retireGroup(replaceable, 'solo_rhythm_turnover');
      effectivePacingCaps.responseMode = 'group';
      effectivePacingCaps.maxComposerGroups = Math.max(1, Math.trunc(Number(effectivePacingCaps?.maxComposerGroups) || 0));
      effectivePacingCaps.maxComposerGroupSize = Math.max(1, Math.trunc(Number(effectivePacingCaps?.maxComposerGroupSize) || 1));
      effectivePacingCaps.maxComposerPerformers = Math.max(1, Math.trunc(Number(effectivePacingCaps?.maxComposerPerformers) || 1));
    }
    if (spawnWantsSoloMelody && getActiveSoloCarrierCount('melody') === 0) {
      const replaceable = findReplaceableNonSoloGroup();
      if (replaceable) retireGroup(replaceable, 'solo_melody_turnover');
      effectivePacingCaps.responseMode = 'group';
      effectivePacingCaps.maxComposerGroups = Math.max(1, Math.trunc(Number(effectivePacingCaps?.maxComposerGroups) || 0));
      effectivePacingCaps.maxComposerGroupSize = Math.max(1, Math.trunc(Number(effectivePacingCaps?.maxComposerGroupSize) || 1));
      effectivePacingCaps.maxComposerPerformers = Math.max(1, Math.trunc(Number(effectivePacingCaps?.maxComposerPerformers) || 1));
    }
  }
  if (introRhythmOnlyWindow || introSoftRampWindow) {
    const allowedIntroRhythmCarriers = introRhythmOnlyWindow
      ? 1
      : (sessionAgeBars >= 8 ? 2 : 1);
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
          const introStageSoloRhythmActive = (introRhythmOnlyWindow || introSoftRampWindow) && !spawnWantsSoloMelody;
          const soloCarrierType = introStageSoloRhythmActive
            ? 'rhythm'
            : (spawnWantsSoloRhythm ? 'rhythm' : (spawnWantsSoloMelody ? 'melody' : ''));
          const soloCarrierActive = !!soloCarrierType;
          const introRhythmProfileSourceType = (() => {
            if (!introStageSoloRhythmActive) return '';
            const forcedProfile = forcedIntroProfile;
            if (forcedProfile) return forcedProfile;
            const allowedProfiles = introRhythmOnlyWindow
              ? ['spawner_rhythm_pulse']
              : (sessionAgeBars >= 8
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
          const introSecondaryRhythmCarrierActive = introRhythmProfileSourceType === 'spawner_rhythm_backbeat';
          if (introStageSoloRhythmActive && !introRhythmProfileSourceType) return null;
          const introRhythmCarrierBodyType = introStageSoloRhythmActive
            ? getIntroRhythmCarrierBodyType(introRhythmProfileSourceType)
            : '';
          const introRhythmUsesGroupBody = introStageSoloRhythmActive && introRhythmCarrierBodyType === 'group';
          const visualSoloCarrierType = introRhythmUsesGroupBody ? '' : soloCarrierType;
          const visualSoloCarrierActive = !!visualSoloCarrierType;
          const sharedProfileSourceType = soloCarrierType === 'rhythm'
            ? (introRhythmProfileSourceType || 'spawner_rhythm')
            : (soloCarrierType === 'melody' ? 'snake_melody' : '');
          const sharedSoloProfile = sharedProfileSourceType
            ? getSharedCarrierMusicProfile(sharedProfileSourceType, { instrumentInfluence: motif?.instrumentInfluence || motif?.musicPaletteOverride })
            : null;
          const introPercussionCarrierActive = introRhythmOnlyWindow && !soloCarrierActive;
          if (introPercussionCarrierActive) effectiveTemplateId = 'intro_percussion_group';
          const soloLaneId = soloCarrierType === 'rhythm'
            ? getSoloRhythmPreferredLaneId(sharedProfileSourceType)
            : (soloCarrierType === 'melody' ? 'primary_loop_lane' : '');
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
          const instrumentId = sanitizeEnemyMusicInstrumentId(
            introPercussionCarrierActive ? fallbackInstrument : (sharedSoloProfile?.instrumentId || motif?.instrument),
            fallbackInstrument,
            { role: createdRole, toyKey: introPercussionCarrierActive ? 'loopgrid-drum' : undefined }
          );
          const created = ({
            id: helpers.getNextComposerEnemyGroupId?.(),
            sectionKey,
            sectionId: String(composerDirective?.sectionId || 'default'),
            templateId: introRhythmUsesGroupBody
              ? effectiveTemplateId
              : (visualSoloCarrierActive ? `solo-${visualSoloCarrierType}-carrier` : effectiveTemplateId),
            role: createdRole,
            musicLaneId: introPercussionCarrierActive ? 'secondary_loop_lane' : (sharedSoloProfile?.musicLaneId || soloLaneId),
            musicLaneLayer: introPercussionCarrierActive ? 'loops' : (sharedSoloProfile?.musicLaneLayer || (soloCarrierType === 'rhythm' ? 'loops' : (soloCarrierType === 'melody' ? 'loops' : ''))),
            callResponseLane: (soloCarrierType === 'rhythm' || soloCarrierType === 'melody')
              ? (sharedSoloProfile?.callResponseLane || 'solo')
              : (introPercussionCarrierActive ? 'call' : (soloCarrierType === 'melody' ? 'call' : resolvedCallResponseLane)),
            shape: introRhythmUsesGroupBody
              ? String(motif?.shape || helpers.pickComposerGroupShape?.({ shapes: constants.composerGroupShapes, index: groupIndex }))
              : (soloCarrierActive
              ? (soloCarrierType === 'rhythm' ? 'square' : 'diamond')
              : String(motif?.shape || helpers.pickComposerGroupShape?.({ shapes: constants.composerGroupShapes, index: groupIndex }))),
            color: soloCarrierActive
              ? (soloCarrierType === 'rhythm'
                ? (sharedProfileSourceType === 'spawner_rhythm_backbeat'
                  ? '#9ad6ff'
                  : (sharedProfileSourceType === 'spawner_rhythm_motion' ? '#c8ff9a' : '#ffd29a'))
                : '#ffe7a6')
              : String(motif?.color || helpers.pickComposerGroupColor?.({ colors: constants.composerGroupColors, index: groupIndex })),
            actionType: introPercussionCarrierActive
              ? 'explosion'
              : (sharedSoloProfile?.actionType || (soloCarrierType === 'rhythm' ? 'explosion' : String(motif?.actionType || 'projectile'))),
            threatLevel: String(motif?.threatLevel || constants.fullThreat),
            introPercussionCarrier: introPercussionCarrierActive,
            performers: introRhythmUsesGroupBody
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
            size: introRhythmUsesGroupBody
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
            steps: soloCarrierActive
              ? (Array.isArray(sharedSoloProfile?.steps)
                ? sharedSoloProfile.steps.slice(0, constants.weaponTuneSteps)
                : (Array.isArray(motif?.steps)
                  ? motif.steps.slice(0, constants.weaponTuneSteps)
                  : Array.from({ length: constants.weaponTuneSteps }, () => Math.random() >= 0.5)))
              : (introPercussionCarrierActive
                ? [true, false, true, false, true, false, true, false]
              : (Array.isArray(motif?.steps)
                ? motif.steps.slice(0, constants.weaponTuneSteps)
                : Array.from({ length: constants.weaponTuneSteps }, () => Math.random() >= 0.5))),
            rows: soloCarrierActive && Array.isArray(sharedSoloProfile?.rows)
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
            soloCarrierType: visualSoloCarrierType,
            introCarrierBodyType: introStageSoloRhythmActive ? introRhythmCarrierBodyType : '',
            introStageCarrier: introStageSoloRhythmActive,
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
            noteIndices: soloCarrierActive && Array.isArray(sharedSoloProfile?.noteIndices) ? sharedSoloProfile.noteIndices.slice(0, constants.weaponTuneSteps) : undefined,
            notePalette: soloCarrierActive && Array.isArray(sharedSoloProfile?.notePalette) ? sharedSoloProfile.notePalette.slice() : undefined,
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
          if (!soloCarrierActive && !introPercussionCarrierActive) {
            const normalizedCreatedLaneId = String(created?.musicLaneId || '').trim().toLowerCase();
            if (normalizedCreatedLaneId === 'secondary_loop_lane' && created.callResponseLane !== 'response') {
              created.musicProfileSourceType = 'spawner_rhythm';
            } else if (normalizedCreatedLaneId === 'primary_loop_lane' && created.callResponseLane !== 'response') {
              created.musicProfileSourceType = 'snake_melody';
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
      } else if (templateRole && !introPercussionCarrier) {
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
        : String(group?.musicProfileSourceType || '').trim().toLowerCase();
      const soloPreferredLaneId = soloCarrierType === 'rhythm'
        ? getSoloRhythmPreferredLaneId(musicProfileSourceType)
        : (soloCarrierType === 'melody' ? 'primary_loop_lane' : '');
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
            musicProfileSourceType || (soloCarrierType === 'rhythm' ? 'spawner_rhythm' : 'snake_melody'),
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
          const syncedSoloInstrumentId = !String(group?.instrumentId || group?.instrument || '').trim()
            ? sanitizeEnemyMusicInstrumentId(
                sharedSoloProfile.instrumentId,
                group?.instrumentId || group?.instrument || helpers.resolveSwarmSoundInstrumentId?.('projectile') || 'tone',
                { role: sharedSoloProfile.role || group?.role || constants.leadRole }
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
      if (!soloCarrierType && musicProfileSourceType) {
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
      const templateRoleEligible = !soloCarrierType && !introSlotIdentityActive;
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
        enemy.introCarrierBodyType = String(group?.introCarrierBodyType || '').trim().toLowerCase();
        enemy.introSlotProfileSourceType = String(group?.introSlotProfileSourceType || group?.musicProfileSourceType || '').trim().toLowerCase();
        enemy.musicParticipationGain = Number(group?.musicParticipationGain == null ? enemy?.musicParticipationGain : group.musicParticipationGain);
        enemy.callResponseLane = String(group?.callResponseLane || enemy?.callResponseLane || '').trim().toLowerCase();
        helpers.applyMusicalIdentityVisualToEnemy?.(enemy, group);
        enemy.__bsComposerSyncSignature = memberSyncSignature;
      }
      group.__bsComposerMemberSyncSignature = groupSyncSignature;
      group.__bsComposerMemberSyncCount = Math.max(0, Math.trunc(Number(groupMemberCount) || 0));
    }
  });
}
