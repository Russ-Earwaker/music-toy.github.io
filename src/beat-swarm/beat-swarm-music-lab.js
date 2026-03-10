const DEFAULT_BEATS_PER_BAR = 4;
const DEFAULT_METRICS_EVERY_BARS = 4;

function clampInt(value, fallback = 0, min = 0) {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n)) return Math.max(min, Math.trunc(Number(fallback) || 0));
  return Math.max(min, n);
}

function nowMs() {
  try {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
      return Number(performance.now()) || Date.now();
    }
  } catch {}
  return Date.now();
}

function cloneJson(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return null;
  }
}

function normalizeSourceSystem(sourceSystem, actionType = '') {
  const src = String(sourceSystem || '').trim().toLowerCase();
  if (src) return src;
  const action = String(actionType || '').trim().toLowerCase();
  if (action === 'player-weapon-step') return 'player';
  if (action.startsWith('spawner-')) return 'spawner';
  if (action.startsWith('drawsnake-')) return 'drawsnake';
  if (action.startsWith('composer-group-')) return 'group';
  if (action.startsWith('enemy-death-')) return 'death';
  return 'unknown';
}

function toMidi(noteName) {
  const raw = String(noteName || '').trim();
  if (!raw) return null;
  const m = /^([A-Ga-g])([#b]?)(-?\d+)?$/.exec(raw);
  if (!m) return null;
  const base = String(m[1] || '').toUpperCase();
  const accidental = String(m[2] || '');
  const octave = clampInt(m[3], 4, -3);
  const semitoneBase = (
    base === 'C' ? 0
      : base === 'D' ? 2
        : base === 'E' ? 4
          : base === 'F' ? 5
            : base === 'G' ? 7
              : base === 'A' ? 9
                : 11
  );
  const accidentalDelta = accidental === '#' ? 1 : (accidental === 'b' ? -1 : 0);
  return ((octave + 1) * 12) + semitoneBase + accidentalDelta;
}

function makeEventRecord(event, phase, context, beatsPerBar) {
  const ev = event && typeof event === 'object' ? event : {};
  const beatIndex = clampInt(ev.beatIndex, 0, 0);
  const stepIndex = clampInt(ev.stepIndex, 0, 0);
  const barIndex = context?.barIndex != null
    ? clampInt(context.barIndex, Math.floor(beatIndex / Math.max(1, beatsPerBar)), 0)
    : Math.floor(beatIndex / Math.max(1, beatsPerBar));
  const actionType = String(ev.actionType || '').trim();
  const payload = ev?.payload && typeof ev.payload === 'object' ? ev.payload : {};
  const requestedNote = String(context?.requestedNote ?? payload.requestedNoteRaw ?? ev.note ?? '').trim();
  const resolvedNote = String(context?.resolvedNote ?? requestedNote).trim();
  const noteWasClamped = context?.noteWasClamped === true;
  const sourceSystem = normalizeSourceSystem(context?.sourceSystem, actionType);
  const playerAudible = context?.playerAudible === true;
  const enemyAudible = context?.enemyAudible === true
    ? true
    : (context?.enemyAudible === false ? false : null);
  const phraseGravityTarget = String(context?.phraseGravityTarget ?? payload.phraseGravityTarget ?? '').trim();
  const phraseGravityHit = context?.phraseGravityHit === true
    ? true
    : (context?.phraseGravityHit === false
      ? false
      : (payload?.phraseGravityHit === true ? true : (payload?.phraseGravityHit === false ? false : null)));
  const phraseResolutionOpportunity = context?.phraseResolutionOpportunity === true
    ? true
    : (context?.phraseResolutionOpportunity === false
      ? false
      : (payload?.phraseResolutionOpportunity === true ? true : (payload?.phraseResolutionOpportunity === false ? false : null)));
  const phraseResolutionHit = context?.phraseResolutionHit === true
    ? true
    : (context?.phraseResolutionHit === false
      ? false
      : (payload?.phraseResolutionHit === true ? true : (payload?.phraseResolutionHit === false ? false : null)));
  return {
    tMs: nowMs(),
    phase: String(phase || '').trim() || 'queued',
    eventId: clampInt(ev.eventId, 0, 0),
    timestamp: Date.now(),
    barIndex,
    beatIndex,
    stepIndex,
    actorId: clampInt(ev.actorId, 0, 0),
    groupId: clampInt(context?.groupId ?? payload.groupId, 0, 0),
    role: String(ev.role || '').trim().toLowerCase(),
    note: requestedNote,
    noteResolved: resolvedNote,
    noteWasClamped,
    instrumentId: String(ev.instrumentId || '').trim(),
    actionType,
    threatClass: String(ev.threatClass || '').trim().toLowerCase(),
    pacingState: String(context?.pacingState || '').trim().toLowerCase(),
    paletteId: String(context?.paletteId || '').trim(),
    themeId: String(context?.themeId || '').trim(),
    sourceSystem,
    playerAudible,
    enemyAudible,
    visualSyncType: String(ev.visualSyncType || '').trim(),
    phraseGravityTarget,
    phraseGravityHit,
    phraseResolutionOpportunity,
    phraseResolutionHit,
  };
}

function makeEnemyRemovalRecord(enemyLike, context, beatsPerBar) {
  const enemy = enemyLike && typeof enemyLike === 'object' ? enemyLike : {};
  const beatIndex = clampInt(context?.beatIndex, 0, 0);
  const barIndex = context?.barIndex != null
    ? clampInt(context.barIndex, Math.floor(beatIndex / Math.max(1, beatsPerBar)), 0)
    : Math.floor(beatIndex / Math.max(1, beatsPerBar));
  const reason = String(context?.reason || '').trim().toLowerCase() || 'unknown';
  return {
    tMs: nowMs(),
    timestamp: Date.now(),
    barIndex,
    beatIndex,
    stepIndex: clampInt(context?.stepIndex, 0, 0),
    actorId: clampInt(enemy?.id, 0, 0),
    groupId: clampInt(context?.groupId ?? enemy?.composerGroupId, 0, 0),
    enemyType: String(enemy?.enemyType || '').trim().toLowerCase(),
    reason,
    retireOrigin: String(context?.retireOrigin || '').trim().toLowerCase(),
    pacingState: String(context?.pacingState || '').trim().toLowerCase(),
    paletteId: String(context?.paletteId || '').trim(),
    themeId: String(context?.themeId || '').trim(),
  };
}

function isAudibleEvent(eventLike) {
  const ev = eventLike && typeof eventLike === 'object' ? eventLike : {};
  const source = String(ev?.sourceSystem || '').trim().toLowerCase();
  const action = String(ev?.actionType || '').trim().toLowerCase();
  const note = String(ev?.noteResolved || ev?.note || '').trim();
  if (source === 'player') return ev?.playerAudible === true;
  if (ev?.enemyAudible === false) return false;
  if (ev?.enemyAudible === true) return true;
  if (action === 'spawner-flash') return false;
  if (action === 'player-weapon-step') return false;
  if (note) return true;
  if (action === 'enemy-death-accent') return true;
  return false;
}

function collectRoleBalance(events) {
  const perBar = Object.create(null);
  const totals = Object.create(null);
  let totalEvents = 0;
  for (const ev of events) {
    const role = String(ev?.role || '').trim().toLowerCase();
    if (!role) continue;
    const barKey = String(clampInt(ev?.barIndex, 0, 0));
    if (!perBar[barKey]) perBar[barKey] = Object.create(null);
    perBar[barKey][role] = clampInt(perBar[barKey][role], 0, 0) + 1;
    totals[role] = clampInt(totals[role], 0, 0) + 1;
    totalEvents += 1;
  }
  const distribution = Object.create(null);
  for (const key of Object.keys(totals)) {
    distribution[key] = totalEvents > 0 ? (totals[key] / totalEvents) : 0;
  }
  return { perBar, totals, distribution, totalEvents };
}

function collectThreatBalance(events) {
  const perBeat = Object.create(null);
  const perBar = Object.create(null);
  for (const ev of events) {
    const cls = String(ev?.threatClass || '').trim().toLowerCase() || 'unknown';
    const beatKey = String(clampInt(ev?.beatIndex, 0, 0));
    const barKey = String(clampInt(ev?.barIndex, 0, 0));
    if (!perBeat[beatKey]) perBeat[beatKey] = Object.create(null);
    if (!perBar[barKey]) perBar[barKey] = Object.create(null);
    perBeat[beatKey][cls] = clampInt(perBeat[beatKey][cls], 0, 0) + 1;
    perBar[barKey][cls] = clampInt(perBar[barKey][cls], 0, 0) + 1;
  }
  return { perBeat, perBar };
}

function collectThreatBudgetUsage(session, maxBarIndex) {
  const snaps = (Array.isArray(session?.threatBudgetSnapshots) ? session.threatBudgetSnapshots : [])
    .filter((s) => clampInt(s?.barIndex, 0, 0) <= maxBarIndex);
  const perBeat = Object.create(null);
  const perBar = Object.create(null);
  for (const s of snaps) {
    const beatKey = String(clampInt(s?.beatIndex, 0, 0));
    const barKey = String(clampInt(s?.barIndex, 0, 0));
    const usage = s?.usage && typeof s.usage === 'object' ? s.usage : {};
    const budgets = s?.budgets && typeof s.budgets === 'object' ? s.budgets : {};
    perBeat[beatKey] = {
      fullThreats: clampInt(usage?.fullThreats, 0, 0),
      lightThreats: clampInt(usage?.lightThreats, 0, 0),
      audibleAccents: clampInt(usage?.audibleAccents, 0, 0),
      cosmeticParticipants: clampInt(usage?.cosmeticParticipants, 0, 0),
      maxFullThreatsPerBeat: clampInt(budgets?.maxFullThreatsPerBeat, 0, 0),
      maxLightThreatsPerBeat: clampInt(budgets?.maxLightThreatsPerBeat, 0, 0),
      maxAudibleAccentsPerBeat: clampInt(budgets?.maxAudibleAccentsPerBeat, 0, 0),
      maxCosmeticPerBeat: clampInt(budgets?.maxCosmeticPerBeat, 0, 0),
    };
    if (!perBar[barKey]) {
      perBar[barKey] = {
        fullThreats: 0,
        lightThreats: 0,
        audibleAccents: 0,
        cosmeticParticipants: 0,
        maxFullThreatsPerBeat: 0,
        maxLightThreatsPerBeat: 0,
        maxAudibleAccentsPerBeat: 0,
        maxCosmeticPerBeat: 0,
        beats: 0,
      };
    }
    const b = perBar[barKey];
    b.fullThreats += clampInt(usage?.fullThreats, 0, 0);
    b.lightThreats += clampInt(usage?.lightThreats, 0, 0);
    b.audibleAccents += clampInt(usage?.audibleAccents, 0, 0);
    b.cosmeticParticipants += clampInt(usage?.cosmeticParticipants, 0, 0);
    b.maxFullThreatsPerBeat += clampInt(budgets?.maxFullThreatsPerBeat, 0, 0);
    b.maxLightThreatsPerBeat += clampInt(budgets?.maxLightThreatsPerBeat, 0, 0);
    b.maxAudibleAccentsPerBeat += clampInt(budgets?.maxAudibleAccentsPerBeat, 0, 0);
    b.maxCosmeticPerBeat += clampInt(budgets?.maxCosmeticPerBeat, 0, 0);
    b.beats += 1;
  }
  return {
    snapshots: snaps.length,
    perBeat,
    perBar,
  };
}

function collectIntervalProfile(events) {
  const melodic = events
    .filter((ev) => String(ev?.noteResolved || ev?.note || '').trim().length > 0)
    .sort((a, b) => clampInt(a?.timestamp, 0, 0) - clampInt(b?.timestamp, 0, 0));
  const buckets = { repeat: 0, step: 0, smallLeap: 0, largeLeap: 0 };
  let previousMidi = null;
  let compared = 0;
  for (const ev of melodic) {
    const midi = toMidi(ev.noteResolved || ev.note);
    if (midi == null) continue;
    if (previousMidi != null) {
      const delta = Math.abs(midi - previousMidi);
      if (delta === 0) buckets.repeat += 1;
      else if (delta <= 2) buckets.step += 1;
      else if (delta <= 5) buckets.smallLeap += 1;
      else buckets.largeLeap += 1;
      compared += 1;
    }
    previousMidi = midi;
  }
  const smoothShare = compared > 0
    ? (buckets.repeat + buckets.step + buckets.smallLeap) / compared
    : 0;
  return { buckets, compared, smoothShare };
}

function computeShannonEntropyFromCounts(countsLike) {
  const counts = countsLike && typeof countsLike === 'object' ? countsLike : {};
  const values = Object.values(counts).map((v) => Math.max(0, Number(v) || 0)).filter((v) => v > 0);
  const total = values.reduce((sum, v) => sum + v, 0);
  if (!(total > 0)) return 0;
  let h = 0;
  for (const c of values) {
    const p = c / total;
    h += -p * Math.log2(p);
  }
  return Number(h) || 0;
}

function collectPitchEntropy(events) {
  const countsOverall = Object.create(null);
  const countsByRole = Object.create(null);
  let considered = 0;
  for (const ev of events) {
    const note = String(ev?.noteResolved || ev?.note || '').trim();
    if (!note) continue;
    const role = String(ev?.role || '').trim().toLowerCase() || 'unknown';
    const key = note;
    countsOverall[key] = clampInt(countsOverall[key], 0, 0) + 1;
    if (!countsByRole[role]) countsByRole[role] = Object.create(null);
    countsByRole[role][key] = clampInt(countsByRole[role][key], 0, 0) + 1;
    considered += 1;
  }
  const byRole = Object.create(null);
  for (const roleKey of Object.keys(countsByRole)) {
    byRole[roleKey] = computeShannonEntropyFromCounts(countsByRole[roleKey]);
  }
  return {
    considered,
    entropyOverall: computeShannonEntropyFromCounts(countsOverall),
    entropyByRole: byRole,
  };
}

function collectMelodicContour(intervalProfile) {
  const buckets = intervalProfile?.buckets && typeof intervalProfile.buckets === 'object'
    ? intervalProfile.buckets
    : { repeat: 0, step: 0, smallLeap: 0, largeLeap: 0 };
  const compared = clampInt(intervalProfile?.compared, 0, 0);
  const largeLeapRate = compared > 0 ? ((Number(buckets.largeLeap) || 0) / compared) : 0;
  const smoothShare = Number(intervalProfile?.smoothShare) || 0;
  return {
    buckets: {
      repeat: clampInt(buckets.repeat, 0, 0),
      step: clampInt(buckets.step, 0, 0),
      smallLeap: clampInt(buckets.smallLeap, 0, 0),
      largeLeap: clampInt(buckets.largeLeap, 0, 0),
    },
    compared,
    smoothShare,
    largeLeapRate,
    contourStability: smoothShare >= 0.8 ? 'good' : (smoothShare >= 0.62 ? 'acceptable' : 'rough'),
  };
}

function collectDeathDensity(events) {
  const perBeat = Object.create(null);
  const perBar = Object.create(null);
  for (const ev of events) {
    const action = String(ev?.actionType || '').trim().toLowerCase();
    if (action !== 'enemy-death-accent') continue;
    const beatKey = String(clampInt(ev?.beatIndex, 0, 0));
    const barKey = String(clampInt(ev?.barIndex, 0, 0));
    perBeat[beatKey] = clampInt(perBeat[beatKey], 0, 0) + 1;
    perBar[barKey] = clampInt(perBar[barKey], 0, 0) + 1;
  }
  let clusterBeats = 0;
  for (const beatKey of Object.keys(perBeat)) {
    if (clampInt(perBeat[beatKey], 0, 0) >= 2) clusterBeats += 1;
  }
  return { perBeat, perBar, clusterBeats };
}

function collectPlayerMasking(events) {
  const playerAudibleKeys = new Set();
  for (const ev of events) {
    if (String(ev?.sourceSystem || '') !== 'player') continue;
    if (!isAudibleEvent(ev)) continue;
    playerAudibleKeys.add(`${clampInt(ev?.beatIndex, 0, 0)}:${clampInt(ev?.stepIndex, 0, 0)}`);
  }
  let enemyAudibleEvents = 0;
  let maskedEnemyEvents = 0;
  for (const ev of events) {
    const src = String(ev?.sourceSystem || '').trim().toLowerCase();
    if (src === 'player') continue;
    if (!isAudibleEvent(ev)) continue;
    enemyAudibleEvents += 1;
    const key = `${clampInt(ev?.beatIndex, 0, 0)}:${clampInt(ev?.stepIndex, 0, 0)}`;
    if (playerAudibleKeys.has(key)) maskedEnemyEvents += 1;
  }
  return {
    playerAudibleSteps: playerAudibleKeys.size,
    enemyEvents: enemyAudibleEvents,
    maskedEnemyEvents,
    playerMaskingRate: enemyAudibleEvents > 0 ? (maskedEnemyEvents / enemyAudibleEvents) : 0,
  };
}

function collectEnemyRemovalDiagnostics(session, maxBarIndex) {
  const removals = (Array.isArray(session?.enemyRemovals) ? session.enemyRemovals : [])
    .filter((r) => clampInt(r?.barIndex, 0, 0) <= maxBarIndex);
  const byReason = Object.create(null);
  const byEnemyType = Object.create(null);
  let directorCleanupRemovals = 0;
  let sectionChangeCleanupRemovals = 0;
  let groupRetirements = 0;
  let groupNaturalDeaths = 0;
  for (const r of removals) {
    const reason = String(r?.reason || '').trim().toLowerCase() || 'unknown';
    const retireOrigin = String(r?.retireOrigin || '').trim().toLowerCase();
    const enemyType = String(r?.enemyType || '').trim().toLowerCase() || 'unknown';
    byReason[reason] = clampInt(byReason[reason], 0, 0) + 1;
    byEnemyType[enemyType] = clampInt(byEnemyType[enemyType], 0, 0) + 1;
    if (reason === 'director_cleanup') directorCleanupRemovals += 1;
    if (reason === 'section_change_cleanup') sectionChangeCleanupRemovals += 1;
    if (
      reason === 'retiring'
      || reason === 'inactiveforscheduling'
      || (
        reason === 'retreated'
        && (retireOrigin === 'director_cleanup' || retireOrigin === 'section_change_cleanup' || retireOrigin === 'retiring' || retireOrigin === 'inactiveforscheduling')
      )
    ) {
      groupRetirements += 1;
    }
    if (reason === 'killed' || reason === 'expired') groupNaturalDeaths += 1;
  }
  const frameBuckets = Object.create(null);
  for (const r of removals) {
    const gid = clampInt(r?.groupId, 0, 0);
    if (!(gid > 0)) continue;
    const t = clampInt(r?.timestamp, 0, 0);
    const key = `${t}:g${gid}`;
    frameBuckets[key] = clampInt(frameBuckets[key], 0, 0) + 1;
  }
  let sameFrameGroupRemovals = 0;
  for (const key of Object.keys(frameBuckets)) {
    if (frameBuckets[key] >= 2) sameFrameGroupRemovals += frameBuckets[key];
  }
  return {
    totalEnemyRemovals: removals.length,
    byReason,
    byEnemyType,
    directorCleanupRemovals,
    sectionChangeCleanupRemovals,
    sameFrameGroupRemovals,
    groupRetirements,
    groupNaturalDeaths,
  };
}

function jaccardSimilarity(setA, setB) {
  const a = setA instanceof Set ? setA : new Set();
  const b = setB instanceof Set ? setB : new Set();
  if (!a.size && !b.size) return 1;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter += 1;
  const union = a.size + b.size - inter;
  return union > 0 ? (inter / union) : 0;
}

function collectSpawnerSync(events) {
  const spawnerEvents = events
    .filter((ev) => String(ev?.actionType || '').trim().toLowerCase() === 'spawner-spawn')
    .sort((a, b) => clampInt(a?.timestamp, 0, 0) - clampInt(b?.timestamp, 0, 0));
  const bySpawner = Object.create(null);
  for (const ev of spawnerEvents) {
    const actorId = clampInt(ev?.actorId, 0, 0);
    if (!(actorId > 0)) continue;
    if (!bySpawner[actorId]) {
      bySpawner[actorId] = {
        actorId,
        stepSet: new Set(),
        noteByStep: Object.create(null),
        firstStepMod8: null,
        eventCount: 0,
      };
    }
    const s = bySpawner[actorId];
    const stepMod8 = ((clampInt(ev?.stepIndex, 0, 0) % 8) + 8) % 8;
    const note = String(ev?.noteResolved || ev?.note || '').trim();
    s.stepSet.add(stepMod8);
    if (s.firstStepMod8 == null) s.firstStepMod8 = stepMod8;
    if (note) s.noteByStep[stepMod8] = note;
    s.eventCount += 1;
  }

  const spawners = Object.values(bySpawner);
  let perfectSyncSpawnerPairs = 0;
  let nearDuplicateSpawnerPairs = 0;
  const pairExamples = [];
  for (let i = 0; i < spawners.length; i++) {
    for (let j = i + 1; j < spawners.length; j++) {
      const a = spawners[i];
      const b = spawners[j];
      const stepSim = jaccardSimilarity(a.stepSet, b.stepSet);
      const sharedSteps = Array.from(a.stepSet).filter((st) => b.stepSet.has(st));
      let noteMatches = 0;
      for (const st of sharedSteps) {
        if (String(a.noteByStep[st] || '') && String(a.noteByStep[st] || '') === String(b.noteByStep[st] || '')) {
          noteMatches += 1;
        }
      }
      const noteSim = sharedSteps.length > 0 ? (noteMatches / sharedSteps.length) : 0;
      const phaseMatch = a.firstStepMod8 != null && b.firstStepMod8 != null && a.firstStepMod8 === b.firstStepMod8;
      const perfect = stepSim >= 0.999 && noteSim >= 0.999 && phaseMatch;
      const near = !perfect && stepSim >= 0.75 && noteSim >= 0.75;
      if (!perfect && !near) continue;
      if (perfect) perfectSyncSpawnerPairs += 1;
      else nearDuplicateSpawnerPairs += 1;
      if (pairExamples.length < 24) {
        pairExamples.push({
          a: a.actorId,
          b: b.actorId,
          type: perfect ? 'perfect-sync' : 'near-duplicate',
          stepSimilarity: Number(stepSim.toFixed(3)),
          noteSimilarity: Number(noteSim.toFixed(3)),
          phaseMatch: !!phaseMatch,
        });
      }
    }
  }

  const clusterMap = Object.create(null);
  for (const s of spawners) {
    const stepKey = Array.from(s.stepSet).sort((x, y) => x - y).join(',');
    const noteKey = Object.keys(s.noteByStep)
      .sort((x, y) => clampInt(x, 0, 0) - clampInt(y, 0, 0))
      .map((k) => `${k}:${String(s.noteByStep[k] || '')}`)
      .join('|');
    const key = `${stepKey}::${noteKey}::phase:${s.firstStepMod8 == null ? '' : s.firstStepMod8}`;
    if (!clusterMap[key]) clusterMap[key] = [];
    clusterMap[key].push(s.actorId);
  }
  const duplicateSpawnerPatternClusters = Object.values(clusterMap)
    .filter((ids) => Array.isArray(ids) && ids.length >= 2)
    .map((ids) => ({ size: ids.length, actorIds: ids.slice() }));

  return {
    spawnerCount: spawners.length,
    perfectSyncSpawnerPairs,
    nearDuplicateSpawnerPairs,
    duplicateSpawnerPatternClusters,
    pairExamples,
  };
}

function collectNotePoolCompliance(events) {
  let considered = 0;
  let clamped = 0;
  let offPoolNoteRequests = 0;
  let clampedNoteCount = 0;
  const clampedNoteBySource = Object.create(null);
  const clampedNoteByEnemyId = Object.create(null);
  for (const ev of events) {
    const requested = String(ev?.note || '').trim();
    const resolved = String(ev?.noteResolved || '').trim();
    if (!requested || !resolved) continue;
    considered += 1;
    if (ev?.noteWasClamped === true || requested !== resolved) {
      clamped += 1;
      offPoolNoteRequests += 1;
      clampedNoteCount += 1;
      const src = String(ev?.sourceSystem || '').trim().toLowerCase() || 'unknown';
      clampedNoteBySource[src] = clampInt(clampedNoteBySource[src], 0, 0) + 1;
      const actorId = clampInt(ev?.actorId, 0, 0);
      if (actorId > 0) clampedNoteByEnemyId[String(actorId)] = clampInt(clampedNoteByEnemyId[String(actorId)], 0, 0) + 1;
    }
  }
  const insidePool = Math.max(0, considered - clamped);
  return {
    offPoolNoteRequests,
    clampedNoteCount,
    clampedNoteBySource,
    clampedNoteByEnemyId,
    considered,
    clamped,
    insidePool,
    poolComplianceRate: considered > 0 ? (insidePool / considered) : 1,
  };
}

function collectMotifReuse(events) {
  const melodic = events
    .filter((ev) => String(ev?.noteResolved || ev?.note || '').trim().length > 0)
    .sort((a, b) => clampInt(a?.timestamp, 0, 0) - clampInt(b?.timestamp, 0, 0))
    .map((ev) => String(ev?.noteResolved || ev?.note || '').trim())
    .filter((n) => n.length > 0);
  const motifCounts = {
    n2: Object.create(null),
    n3: Object.create(null),
    n4: Object.create(null),
  };
  const repeatedByN = { n2: 0, n3: 0, n4: 0 };
  const windowsByN = { n2: 0, n3: 0, n4: 0 };

  const pushWindow = (size, key) => {
    if (!key) return;
    const bucket = size === 2 ? motifCounts.n2 : (size === 3 ? motifCounts.n3 : motifCounts.n4);
    const winKey = size === 2 ? 'n2' : (size === 3 ? 'n3' : 'n4');
    bucket[key] = clampInt(bucket[key], 0, 0) + 1;
    windowsByN[winKey] += 1;
  };

  for (let i = 0; i < melodic.length; i++) {
    if ((i + 2) <= melodic.length) pushWindow(2, melodic.slice(i, i + 2).join('|'));
    if ((i + 3) <= melodic.length) pushWindow(3, melodic.slice(i, i + 3).join('|'));
    if ((i + 4) <= melodic.length) pushWindow(4, melodic.slice(i, i + 4).join('|'));
  }

  for (const k of Object.keys(motifCounts.n2)) if (motifCounts.n2[k] > 1) repeatedByN.n2 += motifCounts.n2[k] - 1;
  for (const k of Object.keys(motifCounts.n3)) if (motifCounts.n3[k] > 1) repeatedByN.n3 += motifCounts.n3[k] - 1;
  for (const k of Object.keys(motifCounts.n4)) if (motifCounts.n4[k] > 1) repeatedByN.n4 += motifCounts.n4[k] - 1;

  const totalWindows = windowsByN.n2 + windowsByN.n3 + windowsByN.n4;
  const repeatedWindows = repeatedByN.n2 + repeatedByN.n3 + repeatedByN.n4;
  const motifReuseRate = totalWindows > 0 ? (repeatedWindows / totalWindows) : 0;

  return {
    windowsByN,
    repeatedByN,
    uniqueMotifsByN: {
      n2: Object.keys(motifCounts.n2).length,
      n3: Object.keys(motifCounts.n3).length,
      n4: Object.keys(motifCounts.n4).length,
    },
    motifReuseRate,
  };
}

function collectMotifPersistence(motifReuse) {
  const windowsByN = motifReuse?.windowsByN && typeof motifReuse.windowsByN === 'object'
    ? motifReuse.windowsByN
    : { n2: 0, n3: 0, n4: 0 };
  const repeatedByN = motifReuse?.repeatedByN && typeof motifReuse.repeatedByN === 'object'
    ? motifReuse.repeatedByN
    : { n2: 0, n3: 0, n4: 0 };
  const persistenceByN = {
    n2: Number(windowsByN.n2) > 0 ? ((Number(repeatedByN.n2) || 0) / Number(windowsByN.n2)) : 0,
    n3: Number(windowsByN.n3) > 0 ? ((Number(repeatedByN.n3) || 0) / Number(windowsByN.n3)) : 0,
    n4: Number(windowsByN.n4) > 0 ? ((Number(repeatedByN.n4) || 0) / Number(windowsByN.n4)) : 0,
  };
  const weightedPersistence = (
    (persistenceByN.n2 * 1)
    + (persistenceByN.n3 * 1.35)
    + (persistenceByN.n4 * 1.8)
  ) / (1 + 1.35 + 1.8);
  return {
    windowsByN: {
      n2: clampInt(windowsByN.n2, 0, 0),
      n3: clampInt(windowsByN.n3, 0, 0),
      n4: clampInt(windowsByN.n4, 0, 0),
    },
    persistenceByN,
    weightedPersistence,
    motifReuseRate: Number(motifReuse?.motifReuseRate) || 0,
  };
}

function collectPhraseGravity(events) {
  const actionable = events.filter((ev) => {
    const source = String(ev?.sourceSystem || '').trim().toLowerCase();
    if (source === 'player' || source === 'death' || source === 'unknown') return false;
    return true;
  });
  let gravityOpportunities = 0;
  let gravityHits = 0;
  let phraseResolutionOpportunities = 0;
  let phraseResolutionHits = 0;
  for (const ev of actionable) {
    const gravityTarget = String(ev?.phraseGravityTarget || '').trim();
    const gravityOpportunity = gravityTarget.length > 0;
    if (gravityOpportunity) {
      gravityOpportunities += 1;
      if (ev?.phraseGravityHit === true) gravityHits += 1;
    }
    if (ev?.phraseResolutionOpportunity === true) {
      phraseResolutionOpportunities += 1;
      if (ev?.phraseResolutionHit === true) phraseResolutionHits += 1;
    }
  }
  return {
    gravityOpportunities,
    gravityHits,
    gravityHitRate: gravityOpportunities > 0 ? (gravityHits / gravityOpportunities) : 0,
    phraseResolutionOpportunities,
    phraseResolutionHits,
    phraseResolutionRate: phraseResolutionOpportunities > 0 ? (phraseResolutionHits / phraseResolutionOpportunities) : 0,
  };
}

function toAbsStepIndex(eventLike, stepsPerBeat = 8) {
  const ev = eventLike && typeof eventLike === 'object' ? eventLike : {};
  const beat = clampInt(ev?.beatIndex, 0, 0);
  const step = clampInt(ev?.stepIndex, 0, 0);
  return (beat * Math.max(1, clampInt(stepsPerBeat, 8, 1))) + step;
}

function collectCallResponse(events, options = null) {
  const responseWindowSteps = Math.max(1, clampInt(options?.responseWindowSteps, 8, 1));
  const actionable = events
    .filter((ev) => {
      const src = String(ev?.sourceSystem || '').trim().toLowerCase();
      if (src === 'player' || src === 'death' || src === 'unknown') return false;
      return true;
    })
    .sort((a, b) => clampInt(a?.timestamp, 0, 0) - clampInt(b?.timestamp, 0, 0));

  let responsePairs = 0;
  let callCount = 0;
  const pairExamples = [];

  const actorKey = (ev) => {
    const gid = clampInt(ev?.groupId, 0, 0);
    if (gid > 0) return `group:${gid}`;
    const aid = clampInt(ev?.actorId, 0, 0);
    if (aid > 0) return `actor:${aid}`;
    return `src:${String(ev?.sourceSystem || 'unknown')}`;
  };

  for (let i = 0; i < actionable.length; i++) {
    const call = actionable[i];
    callCount += 1;
    const callActor = actorKey(call);
    const callStep = toAbsStepIndex(call, options?.stepsPerBeat || 8);
    let matched = false;
    for (let j = i + 1; j < actionable.length; j++) {
      const resp = actionable[j];
      const respStep = toAbsStepIndex(resp, options?.stepsPerBeat || 8);
      const delta = respStep - callStep;
      if (delta <= 0) continue;
      if (delta > responseWindowSteps) break;
      if (actorKey(resp) === callActor) continue;
      responsePairs += 1;
      matched = true;
      if (pairExamples.length < 24) {
        pairExamples.push({
          call: {
            beatIndex: clampInt(call?.beatIndex, 0, 0),
            stepIndex: clampInt(call?.stepIndex, 0, 0),
            sourceSystem: String(call?.sourceSystem || ''),
            actorId: clampInt(call?.actorId, 0, 0),
            groupId: clampInt(call?.groupId, 0, 0),
          },
          response: {
            beatIndex: clampInt(resp?.beatIndex, 0, 0),
            stepIndex: clampInt(resp?.stepIndex, 0, 0),
            sourceSystem: String(resp?.sourceSystem || ''),
            actorId: clampInt(resp?.actorId, 0, 0),
            groupId: clampInt(resp?.groupId, 0, 0),
          },
          deltaSteps: delta,
        });
      }
      break;
    }
    if (!matched) continue;
  }

  return {
    callCount,
    responsePairs,
    responseRate: callCount > 0 ? (responsePairs / callCount) : 0,
    responseWindowSteps,
    pairExamples,
  };
}

function collectPaletteContinuity(session, maxBarIndex) {
  const paletteChanges = (Array.isArray(session?.paletteChanges) ? session.paletteChanges : [])
    .filter((e) => clampInt(e?.barIndex, 0, 0) <= maxBarIndex);
  const barsSinceLastPaletteChange = (() => {
    if (!paletteChanges.length) return maxBarIndex + 1;
    const lastBar = clampInt(paletteChanges[paletteChanges.length - 1]?.barIndex, 0, 0);
    return Math.max(0, maxBarIndex - lastBar);
  })();
  let themeChanges = 0;
  let roleInstrumentChanges = 0;
  for (let i = 1; i < paletteChanges.length; i++) {
    const prev = paletteChanges[i - 1] || {};
    const cur = paletteChanges[i] || {};
    if (String(prev.themeId || '') !== String(cur.themeId || '')) themeChanges += 1;
    const prevRoles = prev?.roles && typeof prev.roles === 'object' ? prev.roles : {};
    const curRoles = cur?.roles && typeof cur.roles === 'object' ? cur.roles : {};
    const roleKeys = new Set([...Object.keys(prevRoles), ...Object.keys(curRoles)]);
    for (const roleKey of roleKeys) {
      if (String(prevRoles[roleKey] || '') !== String(curRoles[roleKey] || '')) roleInstrumentChanges += 1;
    }
  }
  if (paletteChanges.length <= 1) {
    return {
      paletteChanges: paletteChanges.length,
      barsSinceLastPaletteChange,
      avgBarsBetweenChanges: maxBarIndex + 1,
      themeChanges,
      roleInstrumentChanges,
      paletteContinuityScore: 1,
    };
  }
  let spanTotal = 0;
  let spanCount = 0;
  for (let i = 1; i < paletteChanges.length; i++) {
    const prevBar = clampInt(paletteChanges[i - 1]?.barIndex, 0, 0);
    const curBar = clampInt(paletteChanges[i]?.barIndex, 0, 0);
    if (curBar < prevBar) continue;
    spanTotal += (curBar - prevBar);
    spanCount += 1;
  }
  const avgBarsBetweenChanges = spanCount > 0 ? (spanTotal / spanCount) : (maxBarIndex + 1);
  const spacingScore = Math.max(0, Math.min(1, avgBarsBetweenChanges / 32));
  const themePenalty = Math.min(0.35, themeChanges * 0.12);
  const rolePenalty = Math.min(0.35, roleInstrumentChanges * 0.02);
  const paletteContinuityScore = Math.max(0, Math.min(1, spacingScore - themePenalty - rolePenalty));
  return {
    paletteChanges: paletteChanges.length,
    barsSinceLastPaletteChange,
    avgBarsBetweenChanges,
    themeChanges,
    roleInstrumentChanges,
    paletteContinuityScore,
  };
}

function computeSummary(metrics) {
  const smooth = Number(metrics?.intervalProfile?.smoothShare) || 0;
  const maxRoleShare = Object.values(metrics?.roleBalance?.distribution || {}).reduce((m, v) => Math.max(m, Number(v) || 0), 0);
  const masking = Number(metrics?.playerMasking?.playerMaskingRate) || 0;
  const continuity = Number(metrics?.paletteContinuity?.paletteContinuityScore) || 0;
  const motifReuse = Number(metrics?.motifReuse?.motifReuseRate) || 0;
  const gravityHitRate = Number(metrics?.phraseGravity?.gravityHitRate) || 0;
  const phraseResolutionRate = Number(metrics?.phraseGravity?.phraseResolutionRate) || 0;
  const responseRate = Number(metrics?.callResponse?.responseRate) || 0;
  const pitchEntropy = Number(metrics?.pitchEntropy?.entropyOverall) || 0;
  const contourLargeLeapRate = Number(metrics?.melodicContour?.largeLeapRate) || 0;
  const motifPersistence = Number(metrics?.motifPersistence?.weightedPersistence) || 0;
  return {
    notePoolCompliance: `${Math.round((Number(metrics?.notePoolCompliance?.poolComplianceRate) || 0) * 100)}%`,
    motifReuse: `${Math.round(motifReuse * 100)}%`,
    gravityHitRate: Number(gravityHitRate.toFixed(3)),
    phraseResolutionRate: Number(phraseResolutionRate.toFixed(3)),
    leadIntervalSmoothness: smooth >= 0.8 ? 'good' : (smooth >= 0.62 ? 'acceptable' : 'rough'),
    roleBalance: maxRoleShare <= 0.58 ? 'acceptable' : 'skewed',
    responseRate: Number(responseRate.toFixed(3)),
    pitchEntropy: Number(pitchEntropy.toFixed(3)),
    melodicContour: contourLargeLeapRate <= 0.18 ? 'stable' : (contourLargeLeapRate <= 0.32 ? 'mixed' : 'jumpy'),
    motifPersistence: Number(motifPersistence.toFixed(3)),
    paletteContinuity: continuity >= 0.6 ? 'stable' : 'volatile',
    playerMasking: masking <= 0.25 ? 'low' : (masking <= 0.45 ? 'moderate' : 'high'),
    removalCleanup: (
      (Number(metrics?.enemyRemovals?.directorCleanupRemovals) || 0) > 0
      || (Number(metrics?.enemyRemovals?.sectionChangeCleanupRemovals) || 0) > 0
    ) ? 'warning' : 'clean',
    spawnerSync: (Number(metrics?.spawnerSync?.perfectSyncSpawnerPairs) || 0) > 0 ? 'warning' : 'ok',
  };
}

function computeMetricsForEvents(session, executedEvents, maxBarIndex) {
  const roleBalance = collectRoleBalance(executedEvents);
  const threatBalance = collectThreatBalance(executedEvents);
  const threatBudgetUsage = collectThreatBudgetUsage(session, maxBarIndex);
  const intervalProfile = collectIntervalProfile(executedEvents);
  const melodicContour = collectMelodicContour(intervalProfile);
  const pitchEntropy = collectPitchEntropy(executedEvents);
  const deathDensity = collectDeathDensity(executedEvents);
  const playerMasking = collectPlayerMasking(executedEvents);
  const notePoolCompliance = collectNotePoolCompliance(executedEvents);
  const motifReuse = collectMotifReuse(executedEvents);
  const motifPersistence = collectMotifPersistence(motifReuse);
  const phraseGravity = collectPhraseGravity(executedEvents);
  const callResponse = collectCallResponse(executedEvents, {
    responseWindowSteps: 8,
    stepsPerBeat: 8,
  });
  const paletteContinuity = collectPaletteContinuity(session, maxBarIndex);
  const enemyRemovals = collectEnemyRemovalDiagnostics(session, maxBarIndex);
  const spawnerSync = collectSpawnerSync(executedEvents);
  const metrics = {
    notePoolCompliance,
    pitchEntropy,
    intervalProfile,
    melodicContour,
    motifReuse,
    motifPersistence,
    phraseGravity,
    roleBalance,
    threatBalance,
    threatBudgetUsage,
    callResponse,
    deathDensity,
    playerMasking,
    paletteContinuity,
    enemyRemovals,
    spawnerSync,
  };
  return {
    metrics,
    sessionSummary: computeSummary(metrics),
  };
}

export function createBeatSwarmMusicLab(options = null) {
  const beatsPerBar = Math.max(1, clampInt(options?.beatsPerBar, DEFAULT_BEATS_PER_BAR, 1));
  const metricsEveryBars = Math.max(1, clampInt(options?.metricsEveryBars, DEFAULT_METRICS_EVERY_BARS, 1));
  let enabled = true;
  let sessionSeq = 1;
  let session = null;
  let lastMetricsBar = -1;

  function ensureSession(context = null) {
    if (session) return session;
    const nowIso = new Date().toISOString();
    session = {
      sessionId: `music-lab-${nowIso}-${sessionSeq}`,
      startedAtIso: nowIso,
      startedAtMs: nowMs(),
      sequence: sessionSeq,
      context: context && typeof context === 'object' ? { ...context } : {},
      beatsPerBar,
      metricsEveryBars,
      events: [],
      paletteChanges: [],
      pacingChanges: [],
      enemyRemovals: [],
      threatBudgetSnapshots: [],
      metricsHistory: [],
      metrics: null,
      sessionSummary: null,
      endedAtIso: null,
    };
    sessionSeq += 1;
    lastMetricsBar = -1;
    return session;
  }

  function recordMetricsCheckpoint(barIndex) {
    const s = ensureSession();
    const bar = clampInt(barIndex, 0, 0);
    if (bar < 0) return;
    if (lastMetricsBar >= 0 && bar < (lastMetricsBar + metricsEveryBars)) return;
    const executed = s.events.filter((e) => e?.phase === 'executed' && clampInt(e?.barIndex, 0, 0) <= bar);
    const bundle = computeMetricsForEvents(s, executed, bar);
    s.metricsHistory.push({
      barIndex: bar,
      tMs: nowMs(),
      metrics: bundle.metrics,
      sessionSummary: bundle.sessionSummary,
    });
    lastMetricsBar = bar;
  }

  function resetSession(context = null) {
    session = null;
    lastMetricsBar = -1;
    return ensureSession(context);
  }

  function logEvent(event, phase, context = null) {
    if (!enabled) return null;
    const s = ensureSession(context);
    const rec = makeEventRecord(event, phase, context, beatsPerBar);
    s.events.push(rec);
    recordMetricsCheckpoint(rec.barIndex);
    return rec;
  }

  function logQueuedEvent(event, context = null) {
    return logEvent(event, 'queued', context);
  }

  function logExecutedEvent(event, context = null) {
    return logEvent(event, 'executed', context);
  }

  function notePaletteChange(next, context = null) {
    if (!enabled) return null;
    const s = ensureSession(context);
    const snap = next && typeof next === 'object' ? next : {};
    const rec = {
      tMs: nowMs(),
      timestamp: Date.now(),
      barIndex: clampInt(context?.barIndex, 0, 0),
      paletteId: String(snap?.id || '').trim(),
      paletteIndex: clampInt(snap?.paletteIndex, 0, 0),
      themeId: String(snap?.theme || '').trim(),
      roles: snap?.roles && typeof snap.roles === 'object' ? { ...snap.roles } : {},
    };
    s.paletteChanges.push(rec);
    recordMetricsCheckpoint(rec.barIndex);
    return rec;
  }

  function notePacingChange(next, context = null) {
    if (!enabled) return null;
    const s = ensureSession(context);
    const snap = next && typeof next === 'object' ? next : {};
    const rec = {
      tMs: nowMs(),
      timestamp: Date.now(),
      barIndex: clampInt(context?.barIndex, 0, 0),
      state: String(snap?.state || '').trim(),
      stateStartBar: clampInt(snap?.stateStartBar, 0, 0),
      responseMode: String(snap?.responseMode || '').trim(),
      cycle: clampInt(snap?.cycle, 0, 0),
    };
    s.pacingChanges.push(rec);
    recordMetricsCheckpoint(rec.barIndex);
    return rec;
  }

  function noteEnemyRemoval(enemyLike, context = null) {
    if (!enabled) return null;
    const s = ensureSession(context);
    const rec = makeEnemyRemovalRecord(enemyLike, context || {}, beatsPerBar);
    s.enemyRemovals.push(rec);
    recordMetricsCheckpoint(rec.barIndex);
    return rec;
  }

  function noteThreatBudgetSnapshot(snapshot, context = null) {
    if (!enabled) return null;
    const s = ensureSession(context);
    const snap = snapshot && typeof snapshot === 'object' ? snapshot : {};
    const rec = {
      tMs: nowMs(),
      timestamp: Date.now(),
      barIndex: clampInt(context?.barIndex, 0, 0),
      beatIndex: clampInt(context?.beatIndex, 0, 0),
      stepIndex: clampInt(context?.stepIndex, 0, 0),
      energyState: String(snap?.energyState || '').trim().toLowerCase(),
      budgets: snap?.budgets && typeof snap.budgets === 'object' ? { ...snap.budgets } : {},
      usage: snap?.usage && typeof snap.usage === 'object' ? { ...snap.usage } : {},
      remaining: snap?.remaining && typeof snap.remaining === 'object' ? { ...snap.remaining } : {},
    };
    s.threatBudgetSnapshots.push(rec);
    recordMetricsCheckpoint(rec.barIndex);
    return rec;
  }

  function exportSession() {
    const s = ensureSession();
    let maxBar = 0;
    for (const ev of s.events) maxBar = Math.max(maxBar, clampInt(ev?.barIndex, 0, 0));
    const executed = s.events.filter((e) => e?.phase === 'executed');
    const bundle = computeMetricsForEvents(s, executed, maxBar);
    s.metrics = bundle.metrics;
    s.sessionSummary = bundle.sessionSummary;
    s.endedAtIso = new Date().toISOString();
    return cloneJson({
      sessionId: s.sessionId,
      startedAtIso: s.startedAtIso,
      endedAtIso: s.endedAtIso,
      beatsPerBar: s.beatsPerBar,
      metricsEveryBars: s.metricsEveryBars,
      eventTimeline: s.events,
      paletteChanges: s.paletteChanges,
      pacingChanges: s.pacingChanges,
      enemyRemovals: s.enemyRemovals,
      threatBudgetSnapshots: s.threatBudgetSnapshots,
      metricsHistory: s.metricsHistory,
      metrics: s.metrics,
      sessionSummary: s.sessionSummary,
    });
  }

  function downloadSession(fileName = 'music-lab-results.json') {
    const payload = exportSession();
    if (!payload) return false;
    try {
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = String(fileName || 'music-lab-results.json').trim() || 'music-lab-results.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      return true;
    } catch {
      return false;
    }
  }

  function setEnabled(next = true) {
    enabled = !!next;
    return enabled;
  }

  function getSessionSnapshot() {
    const s = ensureSession();
    return cloneJson(s);
  }

  return {
    resetSession,
    logQueuedEvent,
    logExecutedEvent,
    notePaletteChange,
    notePacingChange,
    noteEnemyRemoval,
    noteThreatBudgetSnapshot,
    exportSession,
    downloadSession,
    setEnabled,
    getSessionSnapshot,
  };
}
