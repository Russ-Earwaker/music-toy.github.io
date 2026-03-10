export function processBeatSwarmStepEventsRuntime(options = null) {
  const constants = options?.constants && typeof options.constants === 'object' ? options.constants : {};
  const helpers = options?.helpers && typeof options.helpers === 'object' ? options.helpers : {};
  const state = options?.state && typeof options.state === 'object' ? options.state : {};

  const beatIndex = Math.max(0, Math.trunc(Number(state.beatIndex) || 0));
  const stepIndex = Math.max(0, Math.trunc(Number(state.stepIndex) || 0));
  const barIndex = Math.max(0, Math.trunc(Number(state.barIndex) || 0));
  const centerWorld = state.centerWorld && typeof state.centerWorld === 'object'
    ? state.centerWorld
    : { x: 0, y: 0 };

  let spawnerStepStats = { activeSpawners: 0, triggeredSpawners: 0, spawnedEnemies: 0 };
  let queuedStepEvents = 0;
  let drainedStepEvents = 0;
  const playerStepDirective = helpers.getPlayerInstrumentStepDirective?.(stepIndex, beatIndex) || { emit: true, mode: 'free_fire', reason: 'default' };

  const playerTuneAuthoredStep = helpers.isPlayerWeaponTuneStepAuthoredActive?.(stepIndex) === true;
  const shouldEmitPlayerStep = playerStepDirective.emit === true || playerTuneAuthoredStep;
  const playerLikelyAudible = shouldEmitPlayerStep
    && helpers.isPlayerWeaponStepLikelyAudible?.(stepIndex) === true;
  const spawnerStep = helpers.collectSpawnerStepBeatEvents?.(stepIndex, beatIndex);
  if (spawnerStep?.stats && typeof spawnerStep.stats === 'object') {
    spawnerStepStats = spawnerStep.stats;
  }

  const rawEnemyEvents = [
    ...(Array.isArray(spawnerStep?.events) ? spawnerStep.events : []),
    ...(helpers.collectDrawSnakeStepBeatEvents?.(stepIndex, beatIndex) || []),
    ...(helpers.collectComposerGroupStepBeatEvents?.(stepIndex, beatIndex) || []),
  ];

  let enemyKeepCount = 0;
  const filteredEnemyEvents = playerLikelyAudible
    ? rawEnemyEvents.filter((ev) => {
      const keep = helpers.shouldKeepEnemyEventDuringPlayerStep?.(ev, enemyKeepCount) === true;
      if (keep) enemyKeepCount += 1;
      return keep;
    })
    : rawEnemyEvents;

  const withPlayerDuck = (ev) => {
    if (!playerLikelyAudible || !ev || typeof ev !== 'object') return ev;
    const action = String(ev.actionType || '').trim().toLowerCase();
    if (
      !action
      || action === 'player-weapon-step'
      || action === 'spawner-spawn'
      || action === 'drawsnake-projectile'
      || action === 'composer-group-projectile'
      || action === 'composer-group-explosion'
    ) return ev;
    const payload = ev?.payload && typeof ev.payload === 'object' ? ev.payload : {};
    return {
      ...ev,
      payload: {
        ...payload,
        duckForPlayer: true,
      },
    };
  };

  const stepEvents = [
    ...filteredEnemyEvents.map(withPlayerDuck),
    shouldEmitPlayerStep
      ? helpers.createLoggedPerformedBeatEvent?.({
        actorId: 0,
        beatIndex,
        stepIndex,
        role: constants.roles?.accent || 'accent',
        note: '',
        instrumentId: '',
        actionType: 'player-weapon-step',
        threatClass: constants.threat?.full || 'full',
        visualSyncType: 'weapon-fire',
        payload: {
          centerWorld: {
            x: Number(centerWorld?.x) || 0,
            y: Number(centerWorld?.y) || 0,
          },
          playerCadenceMode: String(playerStepDirective.mode || 'free_fire'),
          playerCadenceReason: playerTuneAuthoredStep
            ? 'tune_override'
            : String(playerStepDirective.reason || ''),
          playerManualOverrideActive: playerStepDirective.manualOverrideActive === true,
          playerTuneAuthoredStep,
        },
      }, {
        beatIndex,
        stepIndex,
        sourceSystem: 'player',
        enemyType: 'player',
      })
      : null,
  ].filter(Boolean);

  for (const ev of stepEvents) {
    const queued = helpers.director?.enqueueBeatEvent?.(ev);
    if (!queued) continue;
    queuedStepEvents += 1;
    try {
      helpers.swarmMusicLab?.logQueuedEvent?.(queued, helpers.getMusicLabContext?.({
        beatIndex,
        stepIndex,
        barIndex,
      }));
    } catch {}
  }

  const drained = helpers.director?.drainBeatEventsForStep?.(beatIndex, stepIndex) || [];
  for (const ev of drained) {
    if (helpers.executePerformedBeatEvent?.(ev)) drainedStepEvents += 1;
  }

  return {
    spawnerStepStats,
    queuedStepEvents,
    drainedStepEvents,
  };
}
