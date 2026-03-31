export function spawnComposerGroupEnemyAtRuntime(options = null) {
  const group = options?.group || null;
  const clientX = Number(options?.clientX);
  const clientY = Number(options?.clientY);
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

  const soloCarrierType = String(group?.soloCarrierType || '').trim().toLowerCase();
  const isSoloCarrier = soloCarrierType === 'rhythm' || soloCarrierType === 'melody';
  const el = document.createElement('div');
  el.className = `beat-swarm-enemy is-composer-group is-shape-${String(group.shape || 'circle')}${isSoloCarrier ? ` is-solo-carrier is-solo-${soloCarrierType}-carrier` : ''}`;
  el.style.setProperty('--bs-group-color', String(group.color || '#ff8b6e'));
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
    soloBadge.className = `beat-swarm-solo-badge beat-swarm-solo-badge-${soloCarrierType}`;
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
    enemySpeedMultiplier: isSoloCarrier ? 0.82 : 1,
    soloCarrierType,
    introStageCarrier: group?.introStageCarrier === true,
    introCarrierBodyType: String(group?.introCarrierBodyType || '').trim().toLowerCase(),
    introSlotProfileSourceType: String(group?.introSlotProfileSourceType || group?.musicProfileSourceType || '').trim().toLowerCase(),
    musicGroupId: Math.trunc(Number(group.id) || 0),
    musicGroupType: 'composer',
    musicParticipationGain: Number(group?.musicParticipationGain == null ? 1 : group.musicParticipationGain),
    musicLaneId: String(group.musicLaneId || ''),
    musicLaneLayer: String(group.musicLaneLayer || ''),
    musicLaneContinuityId: String(group.musicLaneContinuityId || group.continuityId || ''),
    musicLaneInstrumentId: String(group.musicLaneInstrumentId || group.instrumentId || group.instrument || ''),
    musicLanePhraseId: String(group.musicLanePhraseId || group?.motif?.id || ''),
    musicLaneHandoffPolicy: String(group.musicLaneHandoffPolicy || ''),
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
  const soloCarrierType = String(group?.soloCarrierType || '').trim().toLowerCase();
  const introCarrierBodyType = String(group?.introCarrierBodyType || '').trim().toLowerCase();
  const count = (
    soloCarrierType === 'rhythm'
    || soloCarrierType === 'melody'
    || introCarrierBodyType === 'solo'
  )
    ? Math.min(requestedCount, 1)
    : requestedCount;
  const getRandomOffscreenSpawnPoint = typeof options?.getRandomOffscreenSpawnPoint === 'function' ? options.getRandomOffscreenSpawnPoint : (() => ({ x: 0, y: 0 }));
  const spawnComposerGroupEnemyAt = typeof options?.spawnComposerGroupEnemyAt === 'function' ? options.spawnComposerGroupEnemyAt : (() => null);
  for (let i = 0; i < count; i++) {
    const p = getRandomOffscreenSpawnPoint();
    spawnComposerGroupEnemyAt(p?.x, p?.y, group);
  }
}
