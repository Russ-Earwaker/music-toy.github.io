export function spawnComposerGroupEnemyAtRuntime(options = null) {
  const group = options?.group || null;
  const clientX = Number(options?.clientX);
  const clientY = Number(options?.clientY);
  const formationMemberIndex = Math.max(0, Math.trunc(Number(options?.memberIndex) || 0));
  const formationMemberCount = Math.max(1, Math.trunc(Number(options?.memberCount) || 1));
  if (!group) return null;
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;
  if (!options?.enemyLayerEl) return null;

  const enemies = Array.isArray(options?.enemies) ? options.enemies : [];
  const enemyCap = Math.max(1, Math.trunc(Number(options?.enemyCap) || 1));
  if (enemies.length >= enemyCap) return null;

  const screenToWorld = typeof options?.screenToWorld === 'function' ? options.screenToWorld : (() => null);
  const worldToScreen = typeof options?.worldToScreen === 'function' ? options.worldToScreen : (() => null);
  const normalizeSwarmNoteName = typeof options?.normalizeSwarmNoteName === 'function' ? options.normalizeSwarmNoteName : ((n) => String(n || '').trim());
  const getRandomSwarmPentatonicNote = typeof options?.getRandomSwarmPentatonicNote === 'function' ? options.getRandomSwarmPentatonicNote : (() => 'C4');
  const normalizeSwarmRole = typeof options?.normalizeSwarmRole === 'function' ? options.normalizeSwarmRole : ((r, f) => String(r || f || '').trim().toLowerCase());
  const nextEnemyId = typeof options?.nextEnemyId === 'function' ? options.nextEnemyId : (() => 0);

  const spawnStartScale = Number(options?.spawnStartScale) || 0.2;
  const spawnDuration = Math.max(0.001, Number(options?.spawnDuration) || 0.58);
  const spawnMaxHp = Math.max(1, Number(options?.spawnMaxHp) || 1);
  const actionPulseSeconds = Math.max(0.01, Number(options?.actionPulseSeconds) || 0.24);
  const leadRole = String(options?.leadRole || 'lead');
  const groupRole = normalizeSwarmRole(group?.role || leadRole, leadRole);

  const w = screenToWorld({ x: clientX, y: clientY });
  if (!w || !Number.isFinite(w.x) || !Number.isFinite(w.y)) return null;

  const soloCarrierTypeRaw = String(group?.soloCarrierType || '').trim().toLowerCase();
  const soloCarrierType = soloCarrierTypeRaw === 'rhythm' ? 'rhythm' : '';
  const introCarrierBodyType = String(group?.introCarrierBodyType || '').trim().toLowerCase();
  const templateId = String(group?.templateId || '').trim().toLowerCase();
  const soloCarrierFlavor = soloCarrierType === 'rhythm'
    ? 'rhythm'
    : ((introCarrierBodyType === 'solo' || templateId.startsWith('solo-')) ? 'melody' : '');
  const isSoloCarrier = !!soloCarrierFlavor;
  const el = document.createElement('div');
  el.className = `beat-swarm-enemy is-composer-group is-shape-${String(group.shape || 'circle')}${isSoloCarrier ? ` is-solo-carrier is-solo-${soloCarrierFlavor}-carrier` : ''}`;
  el.style.setProperty('--bs-group-color', String(group.color || '#ff8b6e'));
  const formationArchetype = String(group?.formationArchetype || '').trim().toLowerCase();
  const formationRole = String(group?.formationRole || '').trim().toLowerCase();
  const musicState = String(group?.musicState || 'active').trim().toLowerCase() || 'active';
  const combatState = String(group?.combatState || 'armed').trim().toLowerCase() || 'armed';
  const musicRole = String(group?.musicRole || formationRole || '').trim().toLowerCase();
  const formationStyleFamily = String(group?.formationStyleFamily || '').trim().toLowerCase();
  const behavioralFormationArchetype = String(group?.behavioralFormationArchetype || '').trim().toLowerCase();
  const behavioralFormationClass = String(group?.behavioralFormationClass || '').trim().toLowerCase();
  const behavioralFormationActivationMode = String(group?.behavioralFormationActivationMode || '').trim().toLowerCase();
  if (formationArchetype) {
    el.classList.add(`is-formation-${formationArchetype.replace(/[^a-z0-9_-]/g, '-')}`);
    el.dataset.formationArchetype = formationArchetype;
  }
  if (formationRole) el.dataset.formationRole = formationRole;
  if (musicRole) el.dataset.musicGroupRole = musicRole;
  el.dataset.musicState = musicState;
  el.dataset.combatState = combatState;
  if (formationStyleFamily) el.dataset.formationStyleFamily = formationStyleFamily;
  if (behavioralFormationArchetype && behavioralFormationArchetype !== 'none') {
    el.classList.add(`is-behavioral-formation-${behavioralFormationArchetype.replace(/[^a-z0-9_-]/g, '-')}`);
    el.dataset.behavioralFormationArchetype = behavioralFormationArchetype;
  }
  if (behavioralFormationClass && behavioralFormationClass !== 'none') el.dataset.behavioralFormationClass = behavioralFormationClass;
  if (behavioralFormationActivationMode && behavioralFormationActivationMode !== 'inactive') el.dataset.behavioralFormationActivationMode = behavioralFormationActivationMode;
  const hpWrap = document.createElement('div');
  hpWrap.className = 'beat-swarm-enemy-hp';
  const hpFill = document.createElement('div');
  hpFill.className = 'beat-swarm-enemy-hp-fill';
  hpWrap.appendChild(hpFill);
  if (isSoloCarrier) {
    const soloPulse = document.createElement('div');
    soloPulse.className = 'beat-swarm-solo-pulse';
    el.appendChild(soloPulse);
    const soloBadge = document.createElement('div');
    soloBadge.className = `beat-swarm-solo-badge beat-swarm-solo-badge-${soloCarrierFlavor}`;
    el.appendChild(soloBadge);
  }
  el.appendChild(hpWrap);
  options.enemyLayerEl.appendChild(el);

  const s0 = worldToScreen({ x: w.x, y: w.y });
  if (s0 && Number.isFinite(s0.x) && Number.isFinite(s0.y)) {
    el.style.transform = `translate(${s0.x}px, ${s0.y}px) scale(${spawnStartScale})`;
  } else {
    el.style.transform = `translate(-9999px, -9999px) scale(${spawnStartScale})`;
  }

  const notesLen = Math.max(1, Array.isArray(group.notes) ? group.notes.length : 0);
  const spawnIdx = Math.max(0, Math.trunc(Number(group.nextSpawnNoteIndex) || 0)) % notesLen;
  const noteName = String(group.notes?.[spawnIdx] || getRandomSwarmPentatonicNote());
  group.nextSpawnNoteIndex = (spawnIdx + 1) % notesLen;

  const enemy = {
    id: nextEnemyId(),
    wx: w.x,
    wy: w.y,
    vx: 0,
    vy: 0,
    soundNote: normalizeSwarmNoteName(noteName) || getRandomSwarmPentatonicNote(),
    el,
    hp: spawnMaxHp * (isSoloCarrier ? 10 : 2),
    maxHp: spawnMaxHp * (isSoloCarrier ? 10 : 2),
    hpFillEl: hpFill,
    spawnT: 0,
    spawnDur: spawnDuration,
    enemyType: 'composer-group-member',
    musicalRole: groupRole,
    composerGroupId: group.id,
    composerGroupShape: group.shape,
    composerGroupColor: group.color,
    composerActionType: group.actionType,
    composerInstrument: group.instrumentId || group.instrument,
    composerActionPulseT: 0,
    composerActionPulseDur: actionPulseSeconds * (isSoloCarrier ? 1.45 : 1.15),
    composerActionPulseScale: isSoloCarrier ? 0.24 : 0.26,
    composerRole: groupRole,
    enemySpeedMultiplier: (
      (
        String(group?.behavioralFormationArchetype || '').trim().toLowerCase() === 'winding_chain'
        || String(group?.behavioralFormationArchetype || '').trim().toLowerCase() === 'advancing_line'
      )
      && group?.behavioralFormationActive === true
    )
      ? ((isSoloCarrier ? 1.25 : 1.7) * Math.max(0.25, Math.min(4, Number(group?.perfRepeatSpeedScale) || 1)))
      : (isSoloCarrier ? 0.82 : 1),
    soloCarrierType,
    introStageCarrier: group?.introStageCarrier === true,
    introCarrierBodyType: String(group?.introCarrierBodyType || '').trim().toLowerCase(),
    introSlotProfileSourceType: String(group?.introSlotProfileSourceType || group?.musicProfileSourceType || '').trim().toLowerCase(),
    musicGroupId: Math.trunc(Number(group.id) || 0),
    musicGroupType: 'composer',
    musicState,
    combatState,
    musicGroupRole: musicRole,
    musicParticipationGain: Number(group?.musicParticipationGain == null ? 1 : group.musicParticipationGain),
    musicLaneId: String(group.musicLaneId || ''),
    musicLaneLayer: String(group.musicLaneLayer || ''),
    musicLaneContinuityId: String(group.musicLaneContinuityId || group.continuityId || ''),
    musicLaneInstrumentId: String(group.musicLaneInstrumentId || group.instrumentId || group.instrument || ''),
    musicLanePhraseId: String(group.musicLanePhraseId || group?.motif?.id || ''),
    musicLaneHandoffPolicy: String(group.musicLaneHandoffPolicy || ''),
    formationRole,
    formationArchetype,
    formationStyleFamily,
    formationSpawnRegion: String(group?.formationSpawnRegion || '').trim().toLowerCase(),
    formationSpacingProfile: String(group?.formationSpacingProfile || '').trim().toLowerCase(),
    formationSymmetry: String(group?.formationSymmetry || '').trim().toLowerCase(),
    formationPresentationWeight: Number(group?.formationPresentationWeight) || 0,
    formationMergeProtectionActive: group?.formationMergeProtectionActive === true,
    formationDesiredMemberCount: Math.max(1, Math.trunc(Number(group?.formationDesiredMemberCount) || 1)),
    behavioralFormationArchetype,
    behavioralFormationClass,
    behavioralFormationActivationMode,
    behavioralFormationIntensity: Number(group?.behavioralFormationIntensity) || 0,
    behavioralFormationActive: group?.behavioralFormationActive === true,
    singleBehaviorId: String(group?.singleBehaviorId || '').trim().toLowerCase(),
    groupBehaviorId: String(group?.groupBehaviorId || '').trim().toLowerCase(),
    eventBehaviorId: String(group?.eventBehaviorId || '').trim().toLowerCase(),
    behaviorPriority: String(group?.behaviorPriority || '').trim().toLowerCase(),
    behaviorWindow: String(group?.behaviorWindow || '').trim().toLowerCase(),
    behaviorSource: String(group?.behaviorSource || '').trim().toLowerCase(),
    singleBehaviorWindow: String(group?.singleBehaviorWindow || '').trim().toLowerCase(),
    groupBehaviorWindow: String(group?.groupBehaviorWindow || '').trim().toLowerCase(),
    eventBehaviorWindow: String(group?.eventBehaviorWindow || '').trim().toLowerCase(),
    perfRepeatEventBehavior: String(group?.perfRepeatEventBehavior || '').trim().toLowerCase(),
    behavioralFormationPathOriginWorldX: Number(group?.behavioralFormationPathOriginWorldX) || 0,
    behavioralFormationPathOriginWorldY: Number(group?.behavioralFormationPathOriginWorldY) || 0,
    behavioralFormationPathDirX: Number(group?.behavioralFormationPathDirX) || 0,
    behavioralFormationPathDirY: Number(group?.behavioralFormationPathDirY) || 0,
    behavioralFormationPathCrossOffsetWorld: Number(group?.behavioralFormationPathCrossOffsetWorld) || 0,
    perfRepeatSpeedScale: Math.max(0.25, Math.min(4, Number(group?.perfRepeatSpeedScale) || 1)),
    formationMemberIndex,
    formationMemberCount,
    callResponseLane: String(group?.callResponseLane || '').trim().toLowerCase(),
    lifecycleState: String(group?.lifecycleState || 'active'),
  };
  enemies.push(enemy);
  group.memberIds?.add?.(enemy.id);
  return enemy;
}

export function spawnComposerGroupOffscreenMembersRuntime(options = null) {
  const group = options?.group || null;
  if (!group) return;
  const requestedCount = Math.max(0, Math.trunc(Number(options?.count) || 0));
  const soloCarrierType = String(group?.soloCarrierType || '').trim().toLowerCase() === 'rhythm' ? 'rhythm' : '';
  const introCarrierBodyType = String(group?.introCarrierBodyType || '').trim().toLowerCase();
  const count = (
    soloCarrierType === 'rhythm'
    || introCarrierBodyType === 'solo'
  )
    ? Math.min(requestedCount, 1)
    : requestedCount;
  const getRandomOffscreenSpawnPoint = typeof options?.getRandomOffscreenSpawnPoint === 'function' ? options.getRandomOffscreenSpawnPoint : (() => ({ x: 0, y: 0 }));
  const spawnComposerGroupEnemyAt = typeof options?.spawnComposerGroupEnemyAt === 'function' ? options.spawnComposerGroupEnemyAt : (() => null);
  const screenToWorld = typeof options?.screenToWorld === 'function' ? options.screenToWorld : (() => null);
  const worldToScreen = typeof options?.worldToScreen === 'function' ? options.worldToScreen : (() => null);
  const behavioralFormationArchetype = String(group?.behavioralFormationArchetype || '').trim().toLowerCase();
  const useSharedBatchEntryPoint = group?.behavioralFormationActive === true && behavioralFormationArchetype === 'advancing_line';
  let sharedEntryPoint = null;
  if (useSharedBatchEntryPoint) {
    const freshEntryPoint = getRandomOffscreenSpawnPoint({
      group,
      memberIndex: 0,
      memberCount: count,
    }) || { x: 0, y: 0 };
    const freshWorld = screenToWorld(freshEntryPoint);
    const storedOriginWorld = (
      Number.isFinite(Number(group?.behavioralFormationPathOriginWorldX))
      && Number.isFinite(Number(group?.behavioralFormationPathOriginWorldY))
    )
      ? {
          x: Number(group.behavioralFormationPathOriginWorldX) || 0,
          y: Number(group.behavioralFormationPathOriginWorldY) || 0,
        }
      : (freshWorld && Number.isFinite(freshWorld.x) && Number.isFinite(freshWorld.y) ? freshWorld : null);
    const fromLeft = Number(freshEntryPoint?.x) <= 0;
    const pathDirX = fromLeft ? 1 : -1;
    const pathDirY = 0;
    if (storedOriginWorld) {
      group.behavioralFormationPathOriginWorldX = Number(storedOriginWorld.x) || 0;
      group.behavioralFormationPathOriginWorldY = Number(storedOriginWorld.y) || 0;
      group.behavioralFormationPathDirX = pathDirX;
      group.behavioralFormationPathDirY = pathDirY;
      if (!Number.isFinite(Number(group?.behavioralFormationPathCrossOffsetWorld))) {
        group.behavioralFormationPathCrossOffsetWorld = 0;
      }
      let spawnWorld = { x: Number(storedOriginWorld.x) || 0, y: Number(storedOriginWorld.y) || 0 };
      let projected = worldToScreen(spawnWorld);
      const screenW = Math.max(1, Number(globalThis.window?.innerWidth) || 0);
      const screenH = Math.max(1, Number(globalThis.window?.innerHeight) || 0);
      const offscreenPad = 56;
      let guard = 0;
      while (
        projected
        && Number.isFinite(projected.x)
        && Number.isFinite(projected.y)
        && projected.x >= -offscreenPad
        && projected.x <= (screenW + offscreenPad)
        && projected.y >= -offscreenPad
        && projected.y <= (screenH + offscreenPad)
        && guard < 32
      ) {
        spawnWorld = {
          x: Number(spawnWorld.x) - (pathDirX * 96),
          y: Number(spawnWorld.y) - (pathDirY * 96),
        };
        projected = worldToScreen(spawnWorld);
        guard += 1;
      }
      group.behavioralFormationPathOriginWorldX = Number(spawnWorld.x) || 0;
      group.behavioralFormationPathOriginWorldY = Number(spawnWorld.y) || 0;
      sharedEntryPoint = projected && Number.isFinite(projected.x) && Number.isFinite(projected.y)
        ? { x: Number(projected.x) || 0, y: Number(projected.y) || 0 }
        : freshEntryPoint;
    } else {
      sharedEntryPoint = freshEntryPoint;
    }
  }
  for (let i = 0; i < count; i++) {
    const p = sharedEntryPoint || getRandomOffscreenSpawnPoint({
      group,
      memberIndex: i,
      memberCount: count,
    });
    spawnComposerGroupEnemyAt(p?.x, p?.y, group, i, count);
  }
}
