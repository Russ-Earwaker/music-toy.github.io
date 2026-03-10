import { normalizeCallResponseLane, chooseResponseNoteFromPool } from './beat-swarm-groups.js';

function normalizeLifecycleState(value, fallback = 'active') {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'active') return 'active';
  if (raw === 'retiring') return 'retiring';
  if (raw === 'inactiveforscheduling' || raw === 'inactive_for_scheduling' || raw === 'inactive-for-scheduling') return 'inactiveForScheduling';
  const fb = String(fallback || 'active').trim().toLowerCase();
  if (fb === 'retiring') return 'retiring';
  if (fb.includes('inactive')) return 'inactiveForScheduling';
  return 'active';
}

export function chooseComposerGroupEnemyForNote(options = null) {
  const group = options?.group || null;
  const aliveMembers = Array.isArray(options?.aliveMembers) ? options.aliveMembers : [];
  const normalizeNoteName = typeof options?.normalizeNoteName === 'function' ? options.normalizeNoteName : ((n) => String(n || '').trim());
  const getFallbackNote = typeof options?.getFallbackNote === 'function' ? options.getFallbackNote : (() => '');
  const noteName = options?.noteName;
  const note = normalizeNoteName(noteName) || getFallbackNote();
  const aliveIds = new Set(aliveMembers.map((e) => Math.trunc(Number(e?.id) || 0)));
  const pinned = Math.trunc(Number(group?.noteToEnemyId?.get?.(note)) || 0);
  if (pinned > 0 && aliveIds.has(pinned)) {
    return aliveMembers.find((e) => Math.trunc(Number(e?.id) || 0) === pinned) || null;
  }
  if (!aliveMembers.length) return null;
  const picked = aliveMembers[Math.max(0, Math.min(aliveMembers.length - 1, Math.trunc(Math.random() * aliveMembers.length)))] || null;
  if (picked) group?.noteToEnemyId?.set?.(note, Math.trunc(Number(picked.id) || 0));
  return picked;
}

export function collectComposerGroupStepBeatEvents(options = null) {
  const events = [];
  if (!options?.active || options?.gameplayPaused) return events;

  const getCurrentPacingCaps = typeof options?.getCurrentPacingCaps === 'function' ? options.getCurrentPacingCaps : (() => ({ responseMode: 'none' }));
  const pacingCaps = getCurrentPacingCaps();
  const responseMode = String(pacingCaps?.responseMode || 'none');
  if (responseMode === 'none' || responseMode === 'drawsnake') return events;

  const constants = options?.constants && typeof options.constants === 'object' ? options.constants : {};
  const stepIndex = Math.trunc(Number(options?.stepIndex) || 0);
  const beatIndex = Math.trunc(Number(options?.beatIndex) || 0);
  const stepAbs = Math.max(0, stepIndex);
  const stepsPerBar = Math.max(1, Math.trunc(Number(constants.stepsPerBar) || 8));
  const step = ((stepIndex % stepsPerBar) + stepsPerBar) % stepsPerBar;
  const performersMin = Math.max(1, Math.trunc(Number(constants.performersMin) || 1));
  const performersMax = Math.max(performersMin, Math.trunc(Number(constants.performersMax) || 2));

  const composerEnemyGroups = Array.isArray(options?.composerEnemyGroups) ? options.composerEnemyGroups : [];
  const activeGroups = composerEnemyGroups.filter((g) => g && g.active && !g.retiring);
  const getCallResponseWindowSteps = typeof options?.getCallResponseWindowSteps === 'function' ? options.getCallResponseWindowSteps : (() => 1);
  const responseWindowSteps = Math.max(1, Math.trunc(Number(getCallResponseWindowSteps()) || 1));
  const isCallResponseLaneActive = typeof options?.isCallResponseLaneActive === 'function' ? options.isCallResponseLaneActive : (() => true);
  const callResponseRuntime = options?.callResponseRuntime && typeof options.callResponseRuntime === 'object' ? options.callResponseRuntime : {};

  const getAliveEnemiesByIds = typeof options?.getAliveEnemiesByIds === 'function' ? options.getAliveEnemiesByIds : (() => []);
  const clampNoteToDirectorPool = typeof options?.clampNoteToDirectorPool === 'function' ? options.clampNoteToDirectorPool : ((n) => String(n || ''));
  const normalizeSwarmNoteName = typeof options?.normalizeSwarmNoteName === 'function' ? options.normalizeSwarmNoteName : ((n) => String(n || '').trim());
  const getRandomSwarmPentatonicNote = typeof options?.getRandomSwarmPentatonicNote === 'function' ? options.getRandomSwarmPentatonicNote : (() => 'C4');
  const getDirectorNotePool = typeof options?.getDirectorNotePool === 'function' ? options.getDirectorNotePool : (() => []);
  const normalizeSwarmRole = typeof options?.normalizeSwarmRole === 'function' ? options.normalizeSwarmRole : ((r, f) => String(r || f || '').trim().toLowerCase());
  const getSwarmRoleForEnemy = typeof options?.getSwarmRoleForEnemy === 'function' ? options.getSwarmRoleForEnemy : (() => String(options?.roles?.lead || 'lead'));
  const resolveSwarmRoleInstrumentId = typeof options?.resolveSwarmRoleInstrumentId === 'function' ? options.resolveSwarmRoleInstrumentId : ((_, fallback) => fallback);
  const resolveSwarmSoundInstrumentId = typeof options?.resolveSwarmSoundInstrumentId === 'function' ? options.resolveSwarmSoundInstrumentId : (() => 'tone');
  const createPerformedBeatEvent = typeof options?.createPerformedBeatEvent === 'function' ? options.createPerformedBeatEvent : ((evt) => evt);
  const chooseEnemyForNote = typeof options?.chooseEnemyForNote === 'function' ? options.chooseEnemyForNote : ((o) => chooseComposerGroupEnemyForNote(o));
  const roles = options?.roles && typeof options.roles === 'object' ? options.roles : {};
  const threat = options?.threat && typeof options.threat === 'object' ? options.threat : {};
  const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));

  for (const group of composerEnemyGroups) {
    if (!group || !group.active || group.retiring) continue;
    const lifecycleState = normalizeLifecycleState(group?.lifecycleState, 'active');
    if (lifecycleState === 'retiring') continue;
    const lane = normalizeCallResponseLane(group?.callResponseLane, 'call');
    if (!isCallResponseLaneActive(lane, stepAbs, activeGroups.length)) continue;
    const groupId = Math.max(0, Math.trunc(Number(group?.id) || 0));

    if (lane === 'response') {
      const lastCallStep = Math.max(-1, Math.trunc(Number(callResponseRuntime.lastCallStepAbs) || -1));
      const sinceCall = lastCallStep >= 0 ? (stepAbs - lastCallStep) : -1;
      if (!(lastCallStep >= 0 && sinceCall > 0 && sinceCall <= responseWindowSteps)) continue;
      if (groupId > 0 && groupId === Math.max(0, Math.trunc(Number(callResponseRuntime.lastCallGroupId) || 0))) continue;
      const lastRespStep = Math.max(-1, Math.trunc(Number(callResponseRuntime.lastResponseStepAbs) || -1));
      const sameRespGroup = groupId > 0 && groupId === Math.max(0, Math.trunc(Number(callResponseRuntime.lastResponseGroupId) || 0));
      if (sameRespGroup && lastRespStep >= 0 && (stepAbs - lastRespStep) <= responseWindowSteps) continue;
    }

    if (!Array.isArray(group.steps) || !group.steps[step]) continue;
    const aliveMembers = getAliveEnemiesByIds(group.memberIds).filter((e) => String(e?.enemyType || '') === 'composer-group-member' && !e?.retreating);
    if (!aliveMembers.length) continue;

    const performerCount = Math.max(performersMin, Math.min(performersMax, Math.trunc(Number(group.performers) || 1)));
    const notesLen = Math.max(1, Array.isArray(group?.notes) ? group.notes.length : 0);
    const noteIdx = Math.max(0, Math.trunc(Number(group.noteCursor) || 0)) % notesLen;
    const noteNameBaseRaw = normalizeSwarmNoteName(group?.notes?.[noteIdx]) || getRandomSwarmPentatonicNote();
    const noteNameBase = clampNoteToDirectorPool(
      noteNameBaseRaw,
      stepAbs + noteIdx
    );
    const noteNameRaw = lane === 'response'
      ? normalizeSwarmNoteName(
        chooseResponseNoteFromPool({
          callNote: callResponseRuntime.lastCallNote,
          fallbackNote: noteNameBaseRaw,
          stepAbs,
          notePool: getDirectorNotePool(),
          normalizeNoteName: normalizeSwarmNoteName,
        })
      ) || noteNameBaseRaw
      : noteNameBaseRaw;
    const noteName = clampNoteToDirectorPool(
      noteNameRaw,
      stepAbs + noteIdx + (lane === 'response' ? 1 : 0)
    );
    group.noteCursor = noteIdx + 1;

    const performers = [];
    const usedEnemyIds = new Set();
    const primary = chooseEnemyForNote({
      group,
      noteName,
      aliveMembers,
      normalizeNoteName: normalizeSwarmNoteName,
      getFallbackNote: getRandomSwarmPentatonicNote,
    });
    if (primary) {
      performers.push(primary);
      const primaryId = Math.trunc(Number(primary.id) || 0);
      if (primaryId > 0) usedEnemyIds.add(primaryId);
    }
    while (performers.length < performerCount) {
      const remaining = aliveMembers.filter((e) => !usedEnemyIds.has(Math.trunc(Number(e.id) || 0)));
      if (!remaining.length) break;
      const enemy = remaining[Math.max(0, Math.min(remaining.length - 1, Math.trunc(Math.random() * remaining.length)))] || null;
      if (!enemy) continue;
      const enemyId = Math.trunc(Number(enemy.id) || 0);
      if (!(enemyId > 0) || usedEnemyIds.has(enemyId)) continue;
      usedEnemyIds.add(enemyId);
      performers.push(enemy);
    }
    if (!performers.length) continue;

    const threatClass = (() => {
      const t = String(group?.threatLevel || threat.full || 'full').trim().toLowerCase();
      if (t === String(threat.cosmetic || 'cosmetic')) return String(threat.cosmetic || 'cosmetic');
      if (t === String(threat.light || 'light')) return String(threat.light || 'light');
      return String(threat.full || 'full');
    })();
    const instrumentId = resolveSwarmRoleInstrumentId(
      normalizeSwarmRole(group?.role || getSwarmRoleForEnemy(performers[0], roles.lead), roles.lead),
      resolveSwarmSoundInstrumentId('projectile') || 'tone'
    );
    const lifecycleAudioGain = lifecycleState === 'inactiveForScheduling' ? 0.35 : 1;
    for (const enemy of performers) {
      events.push(createPerformedBeatEvent({
        actorId: Math.max(0, Math.trunc(Number(enemy?.id) || 0)),
        beatIndex,
        stepIndex: stepAbs,
        role: normalizeSwarmRole(group?.role || getSwarmRoleForEnemy(enemy, roles.lead), roles.lead),
        note: noteName,
        instrumentId,
        actionType: String(group.actionType || 'projectile') === 'explosion'
          ? 'composer-group-explosion'
          : 'composer-group-projectile',
        threatClass,
        visualSyncType: 'group-pulse',
        payload: {
          groupId,
          callResponseLane: lane,
          audioGain: clamp01(Number(group?.musicParticipationGain == null ? 1 : group.musicParticipationGain) * lifecycleAudioGain),
          requestedNoteRaw: noteName,
        },
      }));
    }

    if (lane === 'call') {
      callResponseRuntime.lastCallStepAbs = stepAbs;
      callResponseRuntime.lastCallGroupId = groupId;
      callResponseRuntime.lastCallNote = noteName;
    } else {
      callResponseRuntime.lastResponseStepAbs = stepAbs;
      callResponseRuntime.lastResponseGroupId = groupId;
    }
  }
  return events;
}
