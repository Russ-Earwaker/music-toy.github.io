const DEFAULT_SPAWN_CONFIG_URL = './data/beat-swarm/enemy_spawn_config.csv';

function clampInt(value, min, max, fallback) {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function toBoolFlag(value, fallback = false) {
  const raw = String(value == null ? '' : value).trim().toLowerCase();
  if (!raw) return !!fallback;
  if (raw === '1' || raw === 'true' || raw === 'yes' || raw === 'y') return true;
  if (raw === '0' || raw === 'false' || raw === 'no' || raw === 'n') return false;
  return !!fallback;
}

function splitTagList(value) {
  return String(value || '')
    .split('|')
    .map((part) => String(part || '').trim().toLowerCase())
    .filter(Boolean);
}

function parseCsvLine(line) {
  const out = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      out.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  out.push(current);
  return out.map((part) => String(part || '').trim());
}

function createEmptySpawnDebug() {
  return {
    evaluatedAtBeat: -1,
    timingBoundary: '',
    needs: [],
    occupiedSlots: {},
    eligibleCount: 0,
    chosenId: '',
    candidates: [],
    rejected: [],
  };
}

function normalizeSpawnConfigRow(row = null) {
  const input = row && typeof row === 'object' ? row : {};
  const readListField = (...keys) => {
    for (const key of keys) {
      if (!key) continue;
      if (Object.prototype.hasOwnProperty.call(input, key)) {
        const value = input[key];
        if (Array.isArray(value)) return value.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean);
        return splitTagList(value);
      }
      const lowerKey = String(key).trim().toLowerCase();
      if (lowerKey && Object.prototype.hasOwnProperty.call(input, lowerKey)) {
        const value = input[lowerKey];
        if (Array.isArray(value)) return value.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean);
        return splitTagList(value);
      }
    }
    return [];
  };
  const readField = (...keys) => {
    for (const key of keys) {
      if (!key) continue;
      if (Object.prototype.hasOwnProperty.call(input, key)) return input[key];
      const lowerKey = String(key).trim().toLowerCase();
      if (lowerKey && Object.prototype.hasOwnProperty.call(input, lowerKey)) return input[lowerKey];
    }
    return '';
  };
  const id = String(readField('id') || '').trim().toLowerCase();
  if (!id) return null;
  return {
    id,
    displayName: String(readField('displayName') || id).trim(),
    roleTags: readListField('roleTags'),
    spawnCost: Math.max(1, clampInt(readField('spawnCost'), 1, 999, 1)),
    threatValue: Math.max(0, clampInt(readField('threatValue'), 0, 999, 0)),
    musicValue: Math.max(0, clampInt(readField('musicValue'), 0, 999, 0)),
    baseWeight: Math.max(0.01, Number(readField('baseWeight')) || 1),
    rarityClass: String(readField('rarityClass') || 'common').trim().toLowerCase() || 'common',
    minPhase: Math.max(0, clampInt(readField('minPhase'), 0, 999, 0)),
    maxPhase: Math.max(0, clampInt(readField('maxPhase'), 0, 999, 99)),
    maxAlive: Math.max(0, clampInt(readField('maxAlive'), 0, 999, 0)),
    cooldownBars: Math.max(0, clampInt(readField('cooldownBars'), 0, 999, 0)),
    spawnTiming: {
      beat: toBoolFlag(readField('spawnOnBeat', 'spawnTimingBeat', 'spawnTiming.beat') || input?.spawnTiming?.beat, false),
      bar: toBoolFlag(readField('spawnOnBar', 'spawnTimingBar', 'spawnTiming.bar') || input?.spawnTiming?.bar, false),
      phrase: toBoolFlag(readField('spawnOnPhrase', 'spawnTimingPhrase', 'spawnTiming.phrase') || input?.spawnTiming?.phrase, false),
    },
    preferredSectionTags: readListField('preferredSectionTags'),
    forbiddenSectionTags: readListField('forbiddenSectionTags'),
    preferredNeeds: readListField('preferredNeeds'),
    forbiddenNeeds: readListField('forbiddenNeeds'),
    groupMin: Math.max(1, clampInt(readField('groupMin'), 1, 999, 1)),
    groupMax: Math.max(1, clampInt(readField('groupMax'), 1, 999, Math.max(1, clampInt(readField('groupMin'), 1, 999, 1)))),
    variantTier: Math.max(1, clampInt(readField('variantTier'), 1, 999, 1)),
    notes: String(readField('notes') || '').trim(),
  };
}

export function parseEnemySpawnConfigCsv(text = '') {
  const lines = String(text || '')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => String(line || '').trim())
    .filter((line) => line && !line.startsWith('#'));
  if (!lines.length) return [];
  const header = parseCsvLine(lines.shift()).map((cell) => String(cell || '').trim().toLowerCase());
  const rows = [];
  for (const line of lines) {
    const cells = parseCsvLine(line);
    const raw = {};
    for (let i = 0; i < header.length; i += 1) raw[header[i]] = cells[i] ?? '';
    const normalized = normalizeSpawnConfigRow(raw);
    if (normalized) rows.push(normalized);
  }
  return rows;
}

let enemySpawnConfigLoadPromise = null;

export function resetBeatSwarmEnemySpawnConfigCache() {
  enemySpawnConfigLoadPromise = null;
}

export async function loadBeatSwarmEnemySpawnConfig(csvUrl = DEFAULT_SPAWN_CONFIG_URL, fetchImpl = null) {
  const fetchFn = typeof fetchImpl === 'function'
    ? fetchImpl
    : (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
  if (typeof fetchFn !== 'function') return [];
  const res = await fetchFn(csvUrl);
  if (!res?.ok) throw new Error(`Enemy spawn config load failed: ${res?.status}`);
  const text = await res.text();
  return parseEnemySpawnConfigCsv(text);
}

export function warmBeatSwarmEnemySpawnConfig(csvUrl = DEFAULT_SPAWN_CONFIG_URL, fetchImpl = null) {
  if (!enemySpawnConfigLoadPromise) {
    enemySpawnConfigLoadPromise = loadBeatSwarmEnemySpawnConfig(csvUrl, fetchImpl).catch(() => []);
  }
  return enemySpawnConfigLoadPromise;
}

function deriveNeeds({ lanePlan = null, pressureState = null, battlefieldState = null }) {
  const plan = lanePlan && typeof lanePlan === 'object' ? lanePlan : {};
  const pressure = pressureState && typeof pressureState === 'object' ? pressureState : {};
  const field = battlefieldState && typeof battlefieldState === 'object' ? battlefieldState : {};
  const needs = new Set();
  const occupiedSlots = field.occupiedSlots && typeof field.occupiedSlots === 'object' ? field.occupiedSlots : {};
  if (plan.foundation?.active === true && !(field.countsById?.composer_basic > 0)) needs.add('needfoundation');
  if (plan.secondary_loop?.active === true && !occupiedSlots.rhythmSpecialOccupied && !(field.countsById?.solo_rhythm_basic > 0)) needs.add('needrhythm');
  if (plan.primary_loop?.active === true && !occupiedSlots.melodySpecialOccupied && !(field.countsById?.solo_melody_basic > 0)) needs.add('needmelody');
  if (clamp01(pressure.combatPressure) > 0.72 && clamp01(pressure.musicalPressure) < 0.52) needs.add('needescalation');
  if (clamp01(pressure.combatPressure) > 0.82 && clamp01(pressure.musicalPressure) > 0.72) needs.add('needrelief');
  return Array.from(needs);
}

function weightedPick(candidates = []) {
  const pool = Array.isArray(candidates) ? candidates.filter((c) => Number(c?.score) > 0) : [];
  if (!pool.length) return null;
  const total = pool.reduce((sum, c) => sum + Math.max(0, Number(c.score) || 0), 0);
  if (!(total > 0)) return pool[0] || null;
  let roll = Math.random() * total;
  for (const candidate of pool) {
    roll -= Math.max(0, Number(candidate.score) || 0);
    if (roll <= 0) return candidate;
  }
  return pool[pool.length - 1] || null;
}

function hasRoleTag(def, tag = '') {
  const tags = Array.isArray(def?.roleTags) ? def.roleTags : [];
  const target = String(tag || '').trim().toLowerCase();
  return !!target && tags.includes(target);
}

export function createSpawnDirectorSubsystem(options = null) {
  const opts = options && typeof options === 'object' ? options : {};
  const state = {
    configUrl: String(opts.configUrl || DEFAULT_SPAWN_CONFIG_URL).trim() || DEFAULT_SPAWN_CONFIG_URL,
    configStatus: 'idle',
    configRows: [],
    byId: new Map(),
    lastConfigError: '',
    beatIndex: 0,
    barIndex: 0,
    stepIndex: 0,
    lastBudgetBarIndex: -1,
    lastEvaluatedStepIndex: -1,
    battlefieldState: {
      countsById: {},
      roleTagCounts: {},
      occupiedSlots: {},
      totalAlive: 0,
      liveCostUsed: 0,
    },
    lanePlan: null,
    pressureState: null,
    spawnBudget: 0,
    spawnBudgetMax: 0,
    spawnBudgetRefillPerBar: 0,
    liveBudgetMax: 0,
    needs: [],
    lastSpawnBarById: new Map(),
    recentSpawnIds: [],
    totalSpawnsNoted: 0,
    lastSpawnedId: '',
    spawnedCountsById: {},
    matchedChosenSpawnCount: 0,
    mismatchedChosenSpawnCount: 0,
    evaluationCount: 0,
    noChoiceCount: 0,
    eligibleCountSum: 0,
    eligibleCountMax: 0,
    rejectionReasonCounts: {},
    lastEvaluation: createEmptySpawnDebug(),
  };

  function setConfigRows(rows = [], meta = null) {
    const nextRows = Array.isArray(rows) ? rows.map((row) => normalizeSpawnConfigRow(row)).filter(Boolean) : [];
    state.configRows = nextRows;
    state.byId = new Map(nextRows.map((row) => [row.id, row]));
    state.configStatus = nextRows.length ? 'loaded' : 'empty';
    state.lastConfigError = '';
    if (meta?.configUrl) state.configUrl = String(meta.configUrl || state.configUrl).trim() || state.configUrl;
    recalculateLiveCost();
    return nextRows.slice();
  }

  async function ensureConfigLoaded(fetchImpl = null) {
    if (state.configStatus === 'loaded') return state.configRows.slice();
    state.configStatus = 'loading';
    try {
      const rows = await warmBeatSwarmEnemySpawnConfig(state.configUrl, fetchImpl);
      return setConfigRows(rows, { configUrl: state.configUrl });
    } catch (err) {
      state.configStatus = 'error';
      state.lastConfigError = String(err?.message || err || 'config_load_failed').trim();
      return [];
    }
  }

  function setLanePlan(next) {
    state.lanePlan = next && typeof next === 'object' ? JSON.parse(JSON.stringify(next)) : null;
    state.needs = deriveNeeds({ lanePlan: state.lanePlan, pressureState: state.pressureState, battlefieldState: state.battlefieldState });
    return state.lanePlan;
  }

  function setPressureState(next) {
    state.pressureState = next && typeof next === 'object' ? { ...next } : null;
    state.needs = deriveNeeds({ lanePlan: state.lanePlan, pressureState: state.pressureState, battlefieldState: state.battlefieldState });
    return state.pressureState;
  }

  function recalculateLiveCost() {
    const countsById = state.battlefieldState?.countsById && typeof state.battlefieldState.countsById === 'object'
      ? state.battlefieldState.countsById
      : {};
    let used = 0;
    for (const [id, countRaw] of Object.entries(countsById)) {
      const def = state.byId.get(String(id || '').trim().toLowerCase());
      const count = Math.max(0, Math.trunc(Number(countRaw) || 0));
      if (!def || !(count > 0)) continue;
      used += count * Math.max(1, Number(def.spawnCost) || 1);
    }
    state.battlefieldState.liveCostUsed = used;
    return used;
  }

  function setBattlefieldState(next) {
    const input = next && typeof next === 'object' ? next : {};
    state.battlefieldState = {
      countsById: input.countsById && typeof input.countsById === 'object' ? { ...input.countsById } : {},
      roleTagCounts: input.roleTagCounts && typeof input.roleTagCounts === 'object' ? { ...input.roleTagCounts } : {},
      occupiedSlots: input.occupiedSlots && typeof input.occupiedSlots === 'object' ? { ...input.occupiedSlots } : {},
      totalAlive: Math.max(0, Math.trunc(Number(input.totalAlive) || 0)),
      liveCostUsed: 0,
    };
    recalculateLiveCost();
    state.needs = deriveNeeds({ lanePlan: state.lanePlan, pressureState: state.pressureState, battlefieldState: state.battlefieldState });
    return { ...state.battlefieldState, liveCostUsed: state.battlefieldState.liveCostUsed };
  }

  function computePhaseTier() {
    const barTier = Math.floor(Math.max(0, state.barIndex) / 24);
    const combatTier = Math.floor(clamp01(state.pressureState?.combatPressure) * 3);
    return Math.max(0, Math.min(99, Math.max(barTier, combatTier)));
  }

  function updateTimeline({ beatIndex = 0, barIndex = 0, stepIndex = 0 } = {}) {
    state.beatIndex = Math.max(0, Math.trunc(Number(beatIndex) || 0));
    state.barIndex = Math.max(0, Math.trunc(Number(barIndex) || 0));
    state.stepIndex = Math.max(0, Math.trunc(Number(stepIndex) || 0));
    const phaseTier = computePhaseTier();
    const combatPressure = clamp01(state.pressureState?.combatPressure);
    state.liveBudgetMax = 8 + (phaseTier * 3) + Math.round(combatPressure * 6);
    state.spawnBudgetMax = 3 + phaseTier + Math.round(combatPressure * 3);
    state.spawnBudgetRefillPerBar = 1 + (combatPressure * 1.5);
    if (state.lastBudgetBarIndex < 0) {
      state.lastBudgetBarIndex = state.barIndex;
      state.spawnBudget = state.spawnBudgetMax;
    } else if (state.barIndex > state.lastBudgetBarIndex) {
      const deltaBars = state.barIndex - state.lastBudgetBarIndex;
      state.spawnBudget = Math.min(
        state.spawnBudgetMax,
        Math.max(0, Number(state.spawnBudget) || 0) + (deltaBars * state.spawnBudgetRefillPerBar)
      );
      state.lastBudgetBarIndex = state.barIndex;
    }
    return getSnapshot();
  }

  function evaluateSpawnCandidates() {
    if (state.stepIndex === state.lastEvaluatedStepIndex) {
      return { ...state.lastEvaluation };
    }
    const phraseBoundary = (state.stepIndex % 8) === 0;
    const barBoundary = (state.beatIndex % 4) === 0;
    const beatBoundary = (state.stepIndex % 2) === 0;
    if (!(phraseBoundary || barBoundary || beatBoundary)) {
      return { ...state.lastEvaluation };
    }
    state.lastEvaluatedStepIndex = state.stepIndex;
    const sectionTag = String(state.pressureState?.sectionIntent || '').trim().toLowerCase();
    const phaseTier = computePhaseTier();
    const timingBoundary = phraseBoundary ? 'phrase' : (barBoundary ? 'bar' : 'beat');
    const liveRemaining = Math.max(0, state.liveBudgetMax - Math.max(0, Number(state.battlefieldState.liveCostUsed) || 0));
    const spawnRemaining = Math.max(0, Number(state.spawnBudget) || 0);
    const occupiedSlots = state.battlefieldState.occupiedSlots && typeof state.battlefieldState.occupiedSlots === 'object'
      ? state.battlefieldState.occupiedSlots
      : {};
    const needs = Array.isArray(state.needs) ? state.needs.slice() : [];
    const forceRhythmSpecial = needs.includes('needrhythm') && occupiedSlots.rhythmSpecialOccupied !== true;
    const forceMelodySpecial = needs.includes('needmelody') && occupiedSlots.melodySpecialOccupied !== true;
    const battlefieldAlive = Math.max(0, Math.trunc(Number(state.battlefieldState.totalAlive) || 0));
    const eligible = [];
    const rejected = [];

    for (const def of state.configRows) {
      const aliveCount = Math.max(0, Math.trunc(Number(state.battlefieldState.countsById?.[def.id]) || 0));
      const lastSpawnBar = Math.max(-9999, Math.trunc(Number(state.lastSpawnBarById.get(def.id)) || -9999));
      const reasons = [];
      const supportsPhrase = def.spawnTiming.phrase === true;
      const supportsBar = def.spawnTiming.bar === true;
      const supportsBeat = def.spawnTiming.beat === true;
      const isValidBoundary = phraseBoundary
        ? (supportsPhrase || supportsBar || supportsBeat)
        : (barBoundary
          ? (supportsBar || supportsBeat)
          : supportsBeat);
      if (!isValidBoundary) {
        rejected.push({ id: def.id, reasons: ['timing'] });
        continue;
      }
      if (def.spawnCost > liveRemaining) reasons.push('live_budget');
      if (def.spawnCost > spawnRemaining) reasons.push('spawn_budget');
      if (phaseTier < def.minPhase || phaseTier > def.maxPhase) reasons.push('phase');
      const maxAliveLimit = Math.max(0, Math.trunc(Number(def.maxAlive) || 0));
      if (maxAliveLimit > 0) {
        const relaxedAliveCount = def.id === 'composer_basic'
          ? Math.max(0, aliveCount - 1)
          : aliveCount;
        if (relaxedAliveCount >= maxAliveLimit) reasons.push('max_alive');
      }
      if ((state.barIndex - lastSpawnBar) < def.cooldownBars) reasons.push('cooldown');
      if (def.forbiddenSectionTags.includes(sectionTag)) reasons.push('forbidden_section');
      if (def.preferredSectionTags.length && sectionTag && !def.preferredSectionTags.includes(sectionTag)) {
        // not a hard reject
      }
      if (def.forbiddenNeeds.some((need) => needs.includes(need))) reasons.push('forbidden_need');
      if (hasRoleTag(def, 'rhythm') && occupiedSlots.rhythmSpecialOccupied) reasons.push('rhythm_slot');
      if (hasRoleTag(def, 'melody') && occupiedSlots.melodySpecialOccupied) reasons.push('melody_slot');
      if (forceRhythmSpecial && !(hasRoleTag(def, 'rhythm') && (hasRoleTag(def, 'special') || def.id === 'solo_rhythm_basic'))) reasons.push('forced_special_focus');
      if (forceMelodySpecial && !(hasRoleTag(def, 'melody') && (hasRoleTag(def, 'special') || def.id === 'solo_melody_basic'))) reasons.push('forced_special_focus');
      if (reasons.length) {
        rejected.push({ id: def.id, reasons });
        continue;
      }
      let score = Math.max(0.01, Number(def.baseWeight) || 0.01);
      if (def.preferredSectionTags.includes(sectionTag)) score += 24;
      for (const need of needs) {
        if (def.preferredNeeds.includes(need)) score += 32;
      }
      if (def.id === 'spawner_basic' && needs.includes('needrhythm')) score += 2;
      if (def.id === 'snake_basic' && needs.includes('needmelody')) score += 4;
      if (def.id === 'spawner_basic' && needs.includes('needescalation')) score += 2;
      if (def.id === 'snake_basic' && needs.includes('needescalation')) score += 3;
      if (def.id === 'spawner_basic' && forceRhythmSpecial) score += 4;
      if (def.id === 'snake_basic' && forceMelodySpecial) score += 6;
      const liveFit = liveRemaining > 0 ? (1 - Math.abs((liveRemaining - def.spawnCost) / Math.max(1, liveRemaining))) : 0;
      score += Math.max(0, liveFit) * 18;
      if (timingBoundary === 'phrase' && hasRoleTag(def, 'special')) score += 8;
      if (timingBoundary === 'bar' && def.id === 'snake_basic' && needs.includes('needmelody')) score += 6;
      if ((timingBoundary === 'bar' || timingBoundary === 'phrase') && def.id === 'snake_basic' && sectionTag === 'drop') score += 4;
      if ((timingBoundary === 'bar' || timingBoundary === 'phrase') && def.id === 'snake_basic' && sectionTag === 'peak') score += 4;
      if (def.id === 'solo_rhythm_basic' && needs.includes('needrhythm')) score += 72;
      if (def.id === 'solo_melody_basic' && needs.includes('needmelody')) score += 84;
      if (def.id === 'solo_rhythm_basic' && needs.includes('needfoundation')) score += 22;
      if (def.id === 'solo_rhythm_basic' && needs.includes('needescalation')) score += 26;
      if (def.id === 'solo_melody_basic' && needs.includes('needescalation')) score += 30;
      if (def.id === 'solo_rhythm_basic' && forceRhythmSpecial) score += 120;
      if (def.id === 'solo_melody_basic' && forceMelodySpecial) score += 140;
      if (battlefieldAlive >= 6 && hasRoleTag(def, 'solo')) score += 46;
      if (battlefieldAlive <= 4 && hasRoleTag(def, 'solo')) score += 10;
      if (sectionTag === 'drop' && def.id === 'solo_melody_basic') score += 18;
      if (sectionTag === 'peak' && def.id === 'solo_melody_basic') score += 18;
      if ((sectionTag === 'build' || sectionTag === 'drop') && def.id === 'solo_rhythm_basic') score += 14;
      if (def.id === 'composer_basic' && needs.includes('needfoundation')) score += 6;
      if (def.id === 'composer_basic' && (needs.includes('needrhythm') || needs.includes('needmelody'))) score *= 0.72;
      if (def.id === 'composer_basic' && needs.includes('needescalation')) score *= 0.84;
      const mostRecentIndex = state.recentSpawnIds.length
        ? state.recentSpawnIds.lastIndexOf(def.id)
        : -1;
      if (mostRecentIndex >= 0) {
        const recency = state.recentSpawnIds.length - mostRecentIndex;
        if (recency <= 1) score *= 0.28;
        else if (recency === 2) score *= 0.52;
        else if (recency === 3) score *= 0.72;
        else if (recency <= 5) score *= 0.88;
      }
      eligible.push({
        id: def.id,
        score,
        aliveCount,
        spawnCost: def.spawnCost,
        roleTags: def.roleTags.slice(),
      });
    }

    eligible.sort((a, b) => (b.score - a.score) || a.id.localeCompare(b.id));
    const chosen = weightedPick(eligible);
    state.evaluationCount += 1;
    state.eligibleCountSum += eligible.length;
    state.eligibleCountMax = Math.max(state.eligibleCountMax, eligible.length);
    if (!chosen) state.noChoiceCount += 1;
    for (const item of rejected) {
      const reasons = Array.isArray(item?.reasons) ? item.reasons : [];
      for (const reason of reasons) {
        const key = String(reason || '').trim().toLowerCase();
        if (!key) continue;
        state.rejectionReasonCounts[key] = Math.max(0, Math.trunc(Number(state.rejectionReasonCounts[key]) || 0)) + 1;
      }
    }
    state.lastEvaluation = {
      evaluatedAtBeat: state.beatIndex,
      timingBoundary,
      needs,
      occupiedSlots: { ...occupiedSlots },
      eligibleCount: eligible.length,
      chosenId: String(chosen?.id || '').trim().toLowerCase(),
      candidates: eligible.slice(0, 8).map((item) => ({ ...item })),
      rejected: rejected.slice(0, 16).map((item) => ({ ...item, reasons: item.reasons.slice() })),
    };
    return { ...state.lastEvaluation };
  }

  function noteSpawn({ id = '', barIndex = state.barIndex } = {}) {
    const spawnId = String(id || '').trim().toLowerCase();
    if (!spawnId) return false;
    const chosenIdAtSpawn = String(state.lastEvaluation?.chosenId || '').trim().toLowerCase();
    state.lastSpawnBarById.set(spawnId, Math.max(0, Math.trunc(Number(barIndex) || 0)));
    state.recentSpawnIds.push(spawnId);
    if (state.recentSpawnIds.length > 12) state.recentSpawnIds.splice(0, state.recentSpawnIds.length - 12);
    state.totalSpawnsNoted += 1;
    state.lastSpawnedId = spawnId;
    state.spawnedCountsById[spawnId] = Math.max(0, Math.trunc(Number(state.spawnedCountsById[spawnId]) || 0)) + 1;
    if (chosenIdAtSpawn) {
      if (chosenIdAtSpawn === spawnId) state.matchedChosenSpawnCount += 1;
      else state.mismatchedChosenSpawnCount += 1;
    }
    const def = state.byId.get(spawnId);
    if (def) {
      state.spawnBudget = Math.max(0, Math.max(0, Number(state.spawnBudget) || 0) - Math.max(1, Number(def.spawnCost) || 1));
    }
    return true;
  }

  function getSnapshot() {
    return {
      configStatus: state.configStatus,
      configUrl: state.configUrl,
      configCount: state.configRows.length,
      lastConfigError: state.lastConfigError,
      liveBudgetMax: Math.max(0, Number(state.liveBudgetMax) || 0),
      liveBudgetUsed: Math.max(0, Number(state.battlefieldState.liveCostUsed) || 0),
      liveBudgetRemaining: Math.max(0, (Number(state.liveBudgetMax) || 0) - (Number(state.battlefieldState.liveCostUsed) || 0)),
      spawnBudget: Math.max(0, Number(state.spawnBudget) || 0),
      spawnBudgetMax: Math.max(0, Number(state.spawnBudgetMax) || 0),
      spawnBudgetRefillPerBar: Math.max(0, Number(state.spawnBudgetRefillPerBar) || 0),
      needs: Array.isArray(state.needs) ? state.needs.slice() : [],
      occupiedSlots: state.battlefieldState.occupiedSlots && typeof state.battlefieldState.occupiedSlots === 'object'
        ? { ...state.battlefieldState.occupiedSlots }
        : {},
      countsById: state.battlefieldState.countsById && typeof state.battlefieldState.countsById === 'object'
        ? { ...state.battlefieldState.countsById }
        : {},
      spawnedCountsById: { ...state.spawnedCountsById },
      recentSpawnIds: state.recentSpawnIds.slice(),
      totalSpawnsNoted: Math.max(0, Math.trunc(Number(state.totalSpawnsNoted) || 0)),
      lastSpawnedId: String(state.lastSpawnedId || '').trim().toLowerCase(),
      matchedChosenSpawnCount: Math.max(0, Math.trunc(Number(state.matchedChosenSpawnCount) || 0)),
      mismatchedChosenSpawnCount: Math.max(0, Math.trunc(Number(state.mismatchedChosenSpawnCount) || 0)),
      evaluationCount: Math.max(0, Math.trunc(Number(state.evaluationCount) || 0)),
      noChoiceCount: Math.max(0, Math.trunc(Number(state.noChoiceCount) || 0)),
      avgEligibleCount: state.evaluationCount > 0 ? (state.eligibleCountSum / state.evaluationCount) : 0,
      maxEligibleCount: Math.max(0, Math.trunc(Number(state.eligibleCountMax) || 0)),
      rejectionReasonCounts: { ...state.rejectionReasonCounts },
      phaseTier: computePhaseTier(),
      lastEvaluation: {
        ...state.lastEvaluation,
        needs: Array.isArray(state.lastEvaluation.needs) ? state.lastEvaluation.needs.slice() : [],
        occupiedSlots: state.lastEvaluation.occupiedSlots && typeof state.lastEvaluation.occupiedSlots === 'object'
          ? { ...state.lastEvaluation.occupiedSlots }
          : {},
        candidates: Array.isArray(state.lastEvaluation.candidates) ? state.lastEvaluation.candidates.map((item) => ({ ...item, roleTags: Array.isArray(item.roleTags) ? item.roleTags.slice() : [] })) : [],
        rejected: Array.isArray(state.lastEvaluation.rejected) ? state.lastEvaluation.rejected.map((item) => ({ ...item, reasons: Array.isArray(item.reasons) ? item.reasons.slice() : [] })) : [],
      },
    };
  }

  function reset() {
    state.beatIndex = 0;
    state.barIndex = 0;
    state.stepIndex = 0;
    state.lastBudgetBarIndex = -1;
    state.lastEvaluatedStepIndex = -1;
    state.battlefieldState = {
      countsById: {},
      roleTagCounts: {},
      occupiedSlots: {},
      totalAlive: 0,
      liveCostUsed: 0,
    };
    state.spawnBudget = 0;
    state.spawnBudgetMax = 0;
    state.spawnBudgetRefillPerBar = 0;
    state.liveBudgetMax = 0;
    state.needs = [];
    state.lastSpawnBarById.clear();
    state.recentSpawnIds = [];
    state.totalSpawnsNoted = 0;
    state.lastSpawnedId = '';
    state.spawnedCountsById = {};
    state.matchedChosenSpawnCount = 0;
    state.mismatchedChosenSpawnCount = 0;
    state.evaluationCount = 0;
    state.noChoiceCount = 0;
    state.eligibleCountSum = 0;
    state.eligibleCountMax = 0;
    state.rejectionReasonCounts = {};
    state.lastEvaluation = createEmptySpawnDebug();
  }

  return Object.freeze({
    ensureConfigLoaded,
    setConfigRows,
    setLanePlan,
    setPressureState,
    setBattlefieldState,
    updateTimeline,
    evaluateSpawnCandidates,
    noteSpawn,
    getSnapshot,
    reset,
  });
}
