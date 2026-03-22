export function collectDrawSnakeStepBeatEvents(options = null) {
  const events = [];
  if (!options?.active || options?.gameplayPaused) return events;

  const getCurrentPacingCaps = typeof options?.getCurrentPacingCaps === 'function'
    ? options.getCurrentPacingCaps
    : (() => ({ responseMode: 'none' }));
  const pacingCaps = getCurrentPacingCaps();
  const responseMode = String(pacingCaps?.responseMode || 'none');
  const maxDrawSnakes = Math.max(0, Math.trunc(Number(pacingCaps?.maxDrawSnakes) || 0));
  const forceIntroPrimaryLoopWindow = options?.forceIntroPrimaryLoopWindow === true;

  const stepIndex = Math.trunc(Number(options?.stepIndex) || 0);
  const beatIndex = Math.trunc(Number(options?.beatIndex) || 0);
  const stepAbs = Math.max(0, stepIndex);
  const stepsPerBar = Math.max(1, Math.trunc(Number(options?.stepsPerBar) || 8));
  const notePoolSize = Math.max(1, Math.trunc(Number(options?.notePoolSize) || 5));
  const step = ((stepIndex % stepsPerBar) + stepsPerBar) % stepsPerBar;

  const enemies = Array.isArray(options?.enemies) ? options.enemies : [];
  const getEnemyMusicGroup = typeof options?.getEnemyMusicGroup === 'function' ? options.getEnemyMusicGroup : (() => null);
  const normalizeMusicLifecycleState = typeof options?.normalizeMusicLifecycleState === 'function'
    ? options.normalizeMusicLifecycleState
    : ((value) => String(value || '').trim().toLowerCase() || 'active');
  const isCallResponseLaneActive = typeof options?.isCallResponseLaneActive === 'function'
    ? options.isCallResponseLaneActive
    : (() => true);
  const getPhraseStepState = typeof options?.getPhraseStepState === 'function'
    ? options.getPhraseStepState
    : (() => ({ nearPhraseEnd: false, resolutionOpportunity: false }));
  const getSwarmPentatonicNoteByIndex = typeof options?.getSwarmPentatonicNoteByIndex === 'function'
    ? options.getSwarmPentatonicNoteByIndex
    : (() => 'C4');
  const normalizePhraseGravityNoteList = typeof options?.normalizePhraseGravityNoteList === 'function'
    ? options.normalizePhraseGravityNoteList
    : ((values) => Array.isArray(values) ? values : []);
  const pickClosestPhraseGravityTarget = typeof options?.pickClosestPhraseGravityTarget === 'function'
    ? options.pickClosestPhraseGravityTarget
    : ((noteName) => String(noteName || ''));
  const normalizeSwarmNoteName = typeof options?.normalizeSwarmNoteName === 'function'
    ? options.normalizeSwarmNoteName
    : ((n) => String(n || '').trim());
  const resolveSwarmRoleInstrumentId = typeof options?.resolveSwarmRoleInstrumentId === 'function'
    ? options.resolveSwarmRoleInstrumentId
    : ((_, fallback) => fallback);
  const normalizeSwarmRole = typeof options?.normalizeSwarmRole === 'function'
    ? options.normalizeSwarmRole
    : ((r, f) => String(r || f || '').trim().toLowerCase());
  const getSwarmRoleForEnemy = typeof options?.getSwarmRoleForEnemy === 'function'
    ? options.getSwarmRoleForEnemy
    : (() => String(options?.roles?.lead || 'lead'));
  const resolveSwarmSoundInstrumentId = typeof options?.resolveSwarmSoundInstrumentId === 'function'
    ? options.resolveSwarmSoundInstrumentId
    : (() => 'tone');
  const createLoggedPerformedBeatEvent = typeof options?.createLoggedPerformedBeatEvent === 'function'
    ? options.createLoggedPerformedBeatEvent
    : ((evt) => evt);
  const musicLaneRuntime = options?.musicLaneRuntime && typeof options.musicLaneRuntime === 'object'
    ? options.musicLaneRuntime
    : null;
  const getDrawSnakeNodeIndexForStep = typeof options?.getDrawSnakeNodeIndexForStep === 'function'
    ? options.getDrawSnakeNodeIndexForStep
    : (() => 0);
  const clamp01 = typeof options?.clamp01 === 'function'
    ? options.clamp01
    : ((v) => Math.max(0, Math.min(1, Number(v) || 0)));
  const roles = options?.roles && typeof options.roles === 'object' ? options.roles : {};
  const threat = options?.threat && typeof options.threat === 'object' ? options.threat : {};
  const drawSnakeSegmentCount = Math.max(1, Math.trunc(Number(options?.drawSnakeSegmentCount) || 1));
  const styleProfile = options?.styleProfile && typeof options.styleProfile === 'object' ? options.styleProfile : {};
  const styleId = String(styleProfile?.id || '').trim().toLowerCase();
  const motifRepeatBias = Math.max(0, Math.min(1, Number(styleProfile?.motifRepeatBias) || 0));
  const laneDrivenFoundation = options?.laneDrivenFoundation === true;
  const laneDrivenPrimaryLoop = options?.laneDrivenPrimaryLoop === true;
  const leadLeapChance = Math.max(0, Math.min(1, Number(styleProfile?.leadLeapChance) || 1));

  const snakes = enemies.filter((e) => String(e?.enemyType || '') === 'drawsnake');
  const primaryLoopLaneRuntime = musicLaneRuntime?.primaryLoopLane && typeof musicLaneRuntime.primaryLoopLane === 'object'
    ? musicLaneRuntime.primaryLoopLane
    : null;
  const primaryLoopOwnerEnemyId = Math.max(0, Math.trunc(Number(primaryLoopLaneRuntime?.performerEnemyId) || 0));
  const primaryLoopOwnerGroupId = Math.max(0, Math.trunc(Number(primaryLoopLaneRuntime?.performerGroupId) || 0));
  const lanePrimaryLoopActive = !!primaryLoopLaneRuntime
    && primaryLoopOwnerEnemyId > 0
    && !!String(primaryLoopLaneRuntime?.continuityId || '').trim();
  const loneStartupSnakeWindow = !forceIntroPrimaryLoopWindow
    && snakes.length === 1
    && !lanePrimaryLoopActive;
  if (!forceIntroPrimaryLoopWindow && (responseMode === 'none' || responseMode === 'group') && !loneStartupSnakeWindow) return events;
  for (const enemy of snakes) {
    if (enemy?.retreating) continue;
    const actorId = Math.max(0, Math.trunc(Number(enemy?.id) || 0));
    const group = getEnemyMusicGroup(enemy, 'drawsnake-projectile');
    if (!group) continue;
    const musicLaneId = String(group?.musicLaneId || enemy?.musicLaneId || '').trim().toLowerCase();
    const groupId = Math.max(0, Math.trunc(Number(group?.id) || 0));
    const isPrimaryLoopOwner = (
      (primaryLoopOwnerEnemyId > 0 && primaryLoopOwnerEnemyId === actorId)
      || (primaryLoopOwnerGroupId > 0 && primaryLoopOwnerGroupId === groupId)
    );
    const lifecycleState = normalizeMusicLifecycleState(group?.lifecycleState || enemy?.lifecycleState || 'active', 'active');
    if (lifecycleState === 'retiring') continue;
    const lastEmitStep = Math.max(-1000000, Math.trunc(Number(enemy?.__bsLastDrawsnakeEmitStep) || -1000000));
    const idleRescueWindow = (stepAbs - lastEmitStep) >= Math.max(stepsPerBar, 8);
    if (!forceIntroPrimaryLoopWindow && maxDrawSnakes > 1 && snakes.length > 1) {
      const snakeStepOffset = actorId % 2;
      if (((stepAbs + snakeStepOffset) % 2) !== 0 && !idleRescueWindow && !isPrimaryLoopOwner) continue;
    }
    if (!forceIntroPrimaryLoopWindow && !loneStartupSnakeWindow && musicLaneId !== 'primary_loop_lane') {
      const pacingGateStepModulo = maxDrawSnakes > 1 ? 4 : 2;
      if ((stepAbs % pacingGateStepModulo) !== (actorId % pacingGateStepModulo) && !idleRescueWindow) continue;
    }
    if (!forceIntroPrimaryLoopWindow && !loneStartupSnakeWindow && !isCallResponseLaneActive(enemy?.callResponseLane, stepAbs, snakes.length) && !idleRescueWindow && !isPrimaryLoopOwner) continue;
    const steps = Array.isArray(group?.steps) ? group.steps : [];
    if (!steps[step]) continue;
    const rows = Array.isArray(group?.rows) ? group.rows : [];
    let row = Math.max(0, Math.min(notePoolSize - 1, Math.trunc(Number(rows?.[step]) || 0)));
    if (styleId === 'retro_shooter') {
      const prevRow = Math.max(0, Math.min(notePoolSize - 1, Math.trunc(Number(enemy?.__bsLastDrawsnakeRow) || row)));
      const leap = Math.abs(row - prevRow);
      if (leap > 1 && Math.random() > leadLeapChance) {
        row = row > prevRow ? (prevRow + 1) : (prevRow - 1);
      }
    }
    const noteNameBase = getSwarmPentatonicNoteByIndex(row);
    const phraseStep = getPhraseStepState(stepAbs, Array.isArray(group?.steps) ? group.steps.length : stepsPerBar);
    const rowHead = Math.max(0, Math.min(notePoolSize - 1, Math.trunc(Number(rows?.[0]) || row)));
    const rowMiddle = Math.max(0, Math.min(notePoolSize - 1, Math.trunc(Number(rows?.[Math.floor(rows.length * 0.5)]) || rowHead)));
    const phraseTargets = normalizePhraseGravityNoteList([
      ...(Array.isArray(group?.resolutionTargets) ? group.resolutionTargets : []),
      group?.phraseRoot,
      group?.phraseFifth,
      ...(Array.isArray(group?.gravityNotes) ? group.gravityNotes : []),
      getSwarmPentatonicNoteByIndex(rowHead),
      getSwarmPentatonicNoteByIndex(rowMiddle),
    ]);
    const phraseGravityTarget = phraseStep.nearPhraseEnd
      ? pickClosestPhraseGravityTarget(noteNameBase, phraseTargets)
      : '';
    const phraseGravityOpportunity = !!phraseGravityTarget && phraseStep.nearPhraseEnd;
    const gravityBiasChance = phraseStep.resolutionOpportunity ? 0.74 : 0.52;
    let noteNameRaw = (phraseGravityOpportunity && Math.random() < gravityBiasChance)
      ? phraseGravityTarget
      : noteNameBase;
    if (styleId === 'retro_shooter') {
      const prevNote = normalizeSwarmNoteName(enemy?.__bsLastDrawsnakeNote);
      const prevRow = Math.max(0, Math.min(notePoolSize - 1, Math.trunc(Number(enemy?.__bsLastDrawsnakeRow) || row)));
      const repeatChance = prevRow === row ? (motifRepeatBias * 0.04) : (motifRepeatBias * 0.008);
      if (prevNote && Math.random() < repeatChance) {
        noteNameRaw = prevNote;
      }
    }
    const phraseGravityHit = phraseGravityOpportunity
      ? normalizeSwarmNoteName(noteNameRaw) === normalizeSwarmNoteName(phraseGravityTarget)
      : false;
    const phraseResolutionOpportunity = phraseGravityOpportunity && phraseStep.resolutionOpportunity;
    const phraseResolutionHit = phraseResolutionOpportunity && phraseGravityHit;
    const instrumentId = String(
      group?.instrumentId
        || enemy?.drawsnakeInstrument
        || enemy?.musicInstrumentId
        || enemy?.instrumentId
        || resolveSwarmRoleInstrumentId(
          normalizeSwarmRole(group?.role || getSwarmRoleForEnemy(enemy, roles.lead), roles.lead),
          resolveSwarmSoundInstrumentId('projectile') || 'tone'
        )
        || 'tone'
    ).trim() || 'tone';
    enemy.__bsLastDrawsnakeRow = row;
    enemy.__bsLastDrawsnakeNote = normalizeSwarmNoteName(noteNameRaw) || noteNameRaw;
    enemy.__bsLastDrawsnakeEmitStep = stepAbs;
    const lifecycleAudioGain = lifecycleState === 'inactiveForScheduling' ? 0.35 : 1;
    if (
      laneDrivenPrimaryLoop
      && lanePrimaryLoopActive
      && !isPrimaryLoopOwner
      && lifecycleState === 'inactiveForScheduling'
      && !idleRescueWindow
    ) {
      continue;
    }
    const baseAudioGain = clamp01(Number(enemy?.musicParticipationGain == null ? 1 : enemy.musicParticipationGain) * lifecycleAudioGain);
    const deconflictedAudioGain = (laneDrivenPrimaryLoop && lanePrimaryLoopActive && !isPrimaryLoopOwner)
      ? clamp01(baseAudioGain * 0.72)
      : baseAudioGain;
    events.push(createLoggedPerformedBeatEvent({
      actorId,
      beatIndex,
      stepIndex: stepAbs,
      role: normalizeSwarmRole(group?.role || getSwarmRoleForEnemy(enemy, roles.lead), roles.lead),
      note: noteNameRaw,
      instrumentId,
      actionType: String(group?.actionType || 'drawsnake-projectile'),
      threatClass: String(threat.full || 'full'),
      visualSyncType: 'node-pulse',
      payload: {
        groupId,
        continuityId: String(group?.continuityId || enemy?.musicContinuityId || '').trim(),
        nodeIndex: getDrawSnakeNodeIndexForStep(step, drawSnakeSegmentCount),
        audioGain: deconflictedAudioGain,
        requestedNoteRaw: noteNameRaw,
        phraseGravityTarget,
        phraseGravityHit,
        phraseResolutionOpportunity,
        phraseResolutionHit,
        drawsnakeIdleRescue: idleRescueWindow,
        drawsnakePrimaryLoopOwner: isPrimaryLoopOwner,
      },
    }, {
      beatIndex,
      stepIndex: stepAbs,
      sourceSystem: 'drawsnake',
      enemyType: 'drawsnake',
      groupId: Math.max(0, Math.trunc(Number(group?.id) || 0)),
    }));
  }
  return events;
}

export function collectSpawnerStepBeatEvents(options = null) {
  const events = [];
  const stats = {
    activeSpawners: 0,
    triggeredSpawners: 0,
    spawnedEnemies: 0,
  };
  if (!options?.active || options?.gameplayPaused) return { events, stats };

  const stepIndex = Math.trunc(Number(options?.stepIndex) || 0);
  const beatIndex = Math.trunc(Number(options?.beatIndex) || 0);
  const barIndex = Math.max(0, Math.trunc(Number(options?.barIndex) || 0));
  const stepAbs = Math.max(0, stepIndex);
  const step = ((stepIndex % 8) + 8) % 8;

  const enemies = Array.isArray(options?.enemies) ? options.enemies : [];
  const getEnemyMusicGroup = typeof options?.getEnemyMusicGroup === 'function' ? options.getEnemyMusicGroup : (() => null);
  const normalizeMusicLifecycleState = typeof options?.normalizeMusicLifecycleState === 'function'
    ? options.normalizeMusicLifecycleState
    : ((value) => String(value || '').trim().toLowerCase() || 'active');
  const normalizeSwarmNoteName = typeof options?.normalizeSwarmNoteName === 'function'
    ? options.normalizeSwarmNoteName
    : ((n) => String(n || '').trim());
  const clampNoteToDirectorPool = typeof options?.clampNoteToDirectorPool === 'function'
    ? options.clampNoteToDirectorPool
    : ((n) => String(n || ''));
  const resolveSwarmRoleInstrumentId = typeof options?.resolveSwarmRoleInstrumentId === 'function'
    ? options.resolveSwarmRoleInstrumentId
    : ((_, fallback) => fallback);
  const normalizeSwarmRole = typeof options?.normalizeSwarmRole === 'function'
    ? options.normalizeSwarmRole
    : ((r, f) => String(r || f || '').trim().toLowerCase());
  const inferInstrumentLaneFromCatalogId = typeof options?.inferInstrumentLaneFromCatalogId === 'function'
    ? options.inferInstrumentLaneFromCatalogId
    : ((_, fallbackLane = 'lead') => String(fallbackLane || 'lead').trim().toLowerCase() || 'lead');
  const getSwarmRoleForEnemy = typeof options?.getSwarmRoleForEnemy === 'function'
    ? options.getSwarmRoleForEnemy
    : (() => String(options?.roles?.bass || 'bass'));
  const resolveSwarmSoundInstrumentId = typeof options?.resolveSwarmSoundInstrumentId === 'function'
    ? options.resolveSwarmSoundInstrumentId
    : (() => 'tone');
  const createLoggedPerformedBeatEvent = typeof options?.createLoggedPerformedBeatEvent === 'function'
    ? options.createLoggedPerformedBeatEvent
    : ((evt) => evt);
  const getFoundationLaneSnapshot = typeof options?.getFoundationLaneSnapshot === 'function'
    ? options.getFoundationLaneSnapshot
    : null;
  const clamp01 = typeof options?.clamp01 === 'function'
    ? options.clamp01
    : ((v) => Math.max(0, Math.min(1, Number(v) || 0)));
  const roles = options?.roles && typeof options.roles === 'object' ? options.roles : {};
  const threat = options?.threat && typeof options.threat === 'object' ? options.threat : {};
  const styleProfile = options?.styleProfile && typeof options.styleProfile === 'object' ? options.styleProfile : {};
  const styleId = String(styleProfile?.id || '').trim().toLowerCase();
  const motifRepeatBias = Math.max(0, Math.min(1, Number(styleProfile?.motifRepeatBias) || 0));
  const laneDrivenFoundation = options?.laneDrivenFoundation === true;
  const musicLaneRuntime = options?.musicLaneRuntime && typeof options.musicLaneRuntime === 'object'
    ? options.musicLaneRuntime
    : null;
  const getPerfNow = typeof options?.getPerfNow === 'function'
    ? options.getPerfNow
    : (() => (globalThis.performance?.now?.() ?? Date.now()));
  const recordPerfSample = typeof options?.recordStepEventsPerfSample === 'function'
    ? options.recordStepEventsPerfSample
    : (typeof options?.recordPerfSample === 'function' ? options.recordPerfSample : null);
  const createDirectPerfMark = (name) => {
    if (!name || typeof recordPerfSample !== 'function') return () => {};
    const startedAt = getPerfNow();
    return () => {
      const durationMs = Math.max(0, getPerfNow() - startedAt);
      recordPerfSample(name, durationMs);
    };
  };
  const bassRoleKey = String(roles?.bass || 'bass');
  const foundationLaneStep = getFoundationLaneSnapshot
    ? getFoundationLaneSnapshot(stepAbs, barIndex)
    : null;
  const foundationLaneRuntime = musicLaneRuntime?.foundationLane && typeof musicLaneRuntime.foundationLane === 'object'
    ? musicLaneRuntime.foundationLane
    : null;
  const primaryLoopLaneRuntime = musicLaneRuntime?.primaryLoopLane && typeof musicLaneRuntime.primaryLoopLane === 'object'
    ? musicLaneRuntime.primaryLoopLane
    : null;

  for (const enemy of enemies) {
    if (String(enemy?.enemyType || '') !== 'spawner') continue;
    const finishGroupPerf = createDirectPerfMark('pickupsCombat.weaponRuntime.stepChange.processEvents.collect.spawner.group');
    const group = getEnemyMusicGroup(enemy, 'spawner-spawn', { sync: false });
    finishGroupPerf();
    if (!group) continue;
    const lifecycleState = normalizeMusicLifecycleState(group?.lifecycleState || enemy?.lifecycleState || 'active', 'active');
    const loopTailUntilStep = Math.max(0, Math.trunc(Number(enemy?.musicLoopTailUntilStep) || 0));
    const tailContinuationActive = (
      (enemy?.retreating || lifecycleState === 'retiring')
      && loopTailUntilStep >= stepAbs
    );
    if (enemy?.retreating && !tailContinuationActive) continue;
    if (lifecycleState === 'retiring' && !tailContinuationActive) continue;
    const actorId = Math.max(0, Math.trunc(Number(enemy?.id) || 0));
    stats.activeSpawners += 1;
    const steps = Array.isArray(group?.steps) ? group.steps : [];
    const isActiveStep = !!steps[step];
    const lifecycleAudioGain = tailContinuationActive
      ? 0.82
      : (lifecycleState === 'inactiveForScheduling' ? 0.6 : 1);
    if (!isActiveStep) continue;
    stats.triggeredSpawners += 1;
    const lockedInstrumentId = String(
      group?.instrumentId
        || enemy?.spawnerInstrument
        || enemy?.instrumentId
        || enemy?.musicInstrumentId
        || ''
    ).trim();
    const finishShapePerf = createDirectPerfMark('pickupsCombat.weaponRuntime.stepChange.processEvents.collect.spawner.shape');
    const lockedLane = lockedInstrumentId
      ? inferInstrumentLaneFromCatalogId(lockedInstrumentId, bassRoleKey)
      : bassRoleKey;
    const roleName = lockedLane === bassRoleKey
      ? bassRoleKey
      : normalizeSwarmRole(group?.role || getSwarmRoleForEnemy(enemy, bassRoleKey), bassRoleKey);
    const isBassRole = roleName === bassRoleKey;
    const foundationOwnerEnemyId = Math.max(0, Math.trunc(Number(foundationLaneStep?.performerEnemyId) || 0));
    const foundationOwnerGroupId = Math.max(0, Math.trunc(Number(foundationLaneStep?.performerGroupId) || 0));
    const primaryLoopOwnerEnemyId = Math.max(0, Math.trunc(Number(primaryLoopLaneRuntime?.performerEnemyId) || 0));
    const primaryLoopOwnerGroupId = Math.max(0, Math.trunc(Number(primaryLoopLaneRuntime?.performerGroupId) || 0));
    const isFoundationOwner = (
      (foundationOwnerEnemyId > 0 && foundationOwnerEnemyId === actorId)
      || (foundationOwnerGroupId > 0 && foundationOwnerGroupId === Math.max(0, Math.trunc(Number(group?.id) || 0)))
    );
    const isPrimaryLoopOwner = (
      (primaryLoopOwnerEnemyId > 0 && primaryLoopOwnerEnemyId === actorId)
      || (primaryLoopOwnerGroupId > 0 && primaryLoopOwnerGroupId === Math.max(0, Math.trunc(Number(group?.id) || 0)))
    );
    if (
      laneDrivenFoundation
      && isBassRole
      && !isFoundationOwner
      && lifecycleState === 'inactiveForScheduling'
      && !tailContinuationActive
    ) {
      continue;
    }
    const continuityId = String(group?.continuityId || enemy?.musicContinuityId || '').trim();
    const tailLaneId = String(enemy?.musicLoopTailLaneId || group?.musicLaneId || '').trim().toLowerCase();
    const liveSameContinuitySuccessor = tailContinuationActive
      ? enemies.find((candidate) => {
        if (!candidate || candidate === enemy || candidate?.retreating) return false;
        const candidateId = Math.max(0, Math.trunc(Number(candidate?.id) || 0));
        if (!(candidateId > 0)) return false;
        const candidateGroup = getEnemyMusicGroup(candidate, 'spawner-spawn', { sync: false });
        if (!candidateGroup) return false;
        const candidateLifecycle = normalizeMusicLifecycleState(candidateGroup?.lifecycleState || candidate?.lifecycleState || 'active', 'active');
        if (candidateLifecycle === 'retiring') return false;
        const candidateRole = normalizeSwarmRole(candidateGroup?.role || getSwarmRoleForEnemy(candidate, roleName), roleName);
        if (candidateRole !== roleName) return false;
        const candidateContinuityId = String(candidateGroup?.continuityId || candidate?.musicContinuityId || '').trim();
        if (!candidateContinuityId || candidateContinuityId !== continuityId) return false;
        const candidateGroupId = Math.max(0, Math.trunc(Number(candidateGroup?.id) || 0));
        if (roleName === bassRoleKey) {
          if (
            Math.max(0, Math.trunc(Number(foundationLaneRuntime?.performerEnemyId) || 0)) === candidateId
            || Math.max(0, Math.trunc(Number(foundationLaneRuntime?.performerGroupId) || 0)) === candidateGroupId
          ) return true;
        } else if (tailLaneId === 'primary_loop_lane') {
          if (
            Math.max(0, Math.trunc(Number(primaryLoopLaneRuntime?.performerEnemyId) || 0)) === candidateId
            || Math.max(0, Math.trunc(Number(primaryLoopLaneRuntime?.performerGroupId) || 0)) === candidateGroupId
          ) return true;
        }
        return candidateLifecycle === 'active';
      }) || null
      : null;
    if (tailContinuationActive && liveSameContinuitySuccessor) {
      enemy.musicLoopTailStartedStep = 0;
      enemy.musicLoopTailUntilStep = stepAbs;
      enemy.musicLoopTailLaneId = '';
      continue;
    }
    if (tailContinuationActive && isBassRole && !isFoundationOwner && (foundationOwnerEnemyId > 0 || foundationOwnerGroupId > 0)) {
      enemy.musicLoopTailUntilStep = stepAbs;
      continue;
    }
    if (tailContinuationActive && tailLaneId === 'primary_loop_lane' && !isPrimaryLoopOwner && (primaryLoopOwnerEnemyId > 0 || primaryLoopOwnerGroupId > 0)) {
      enemy.musicLoopTailUntilStep = stepAbs;
      enemy.musicLoopTailLaneId = '';
      continue;
    }
    let noteNameRaw = normalizeSwarmNoteName(group?.note) || (isBassRole ? 'C3' : 'C4');
    if (isBassRole) {
      const locked = normalizeSwarmNoteName(enemy?.__bsLockedBassNote) || noteNameRaw || 'C3';
      enemy.__bsLockedBassNote = locked;
      noteNameRaw = locked;
    } else if (styleId === 'retro_shooter') {
      const prevNote = normalizeSwarmNoteName(enemy?.__bsLastSpawnerNote);
      if (prevNote && Math.random() < (motifRepeatBias * 0.55)) {
        noteNameRaw = prevNote;
      }
    }
    const noteName = isBassRole
      ? noteNameRaw
      : clampNoteToDirectorPool(
        noteNameRaw,
        beatIndex + stepAbs + actorId
      );
    const instrumentId = lockedInstrumentId || resolveSwarmRoleInstrumentId(
      roleName,
      resolveSwarmSoundInstrumentId('projectile') || 'tone'
    );
    finishShapePerf();
    const finishEventPerf = createDirectPerfMark('pickupsCombat.weaponRuntime.stepChange.processEvents.collect.spawner.event');
    const baseAudioGain = clamp01(Number(enemy?.musicParticipationGain == null ? 1 : enemy.musicParticipationGain) * lifecycleAudioGain);
    const deconflictedAudioGain = (laneDrivenFoundation && isBassRole && !isFoundationOwner)
      ? clamp01(baseAudioGain * 0.78)
      : baseAudioGain;
    events.push(createLoggedPerformedBeatEvent({
      actorId,
      beatIndex,
      stepIndex: stepAbs,
      role: roleName,
      note: noteName,
      instrumentId,
      actionType: String(group?.actionType || 'spawner-spawn'),
      threatClass: String(threat.full || 'full'),
      visualSyncType: 'spawn-burst',
      payload: {
        groupId: Math.max(0, Math.trunc(Number(group?.id) || 0)),
        continuityId,
        nodeStepIndex: step,
        audioGain: deconflictedAudioGain,
        requestedNoteRaw: noteNameRaw,
        spawnerTailContinuation: tailContinuationActive,
        spawnerFoundationOwner: isFoundationOwner,
      },
    }, {
      beatIndex,
      stepIndex: stepAbs,
      sourceSystem: 'spawner',
      enemyType: 'spawner',
      groupId: Math.max(0, Math.trunc(Number(group?.id) || 0)),
    }));
    finishEventPerf();
    enemy.__bsLastSpawnerNote = noteName;
    if (tailContinuationActive && loopTailUntilStep <= stepAbs) {
      enemy.musicLoopTailStartedStep = 0;
      enemy.musicLoopTailUntilStep = 0;
      enemy.musicLoopTailLaneId = '';
    }
    stats.spawnedEnemies += 1;
  }
  return { events, stats };
}
