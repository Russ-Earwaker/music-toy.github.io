export function createBeatSwarmInstrumentLaneTools(options = null) {
  const normalizeSwarmRole = typeof options?.normalizeSwarmRole === 'function'
    ? options.normalizeSwarmRole
    : ((role) => String(role || '').trim().toLowerCase());
  const roles = options?.roles && typeof options.roles === 'object'
    ? options.roles
    : { bass: 'bass', lead: 'lead', accent: 'accent', motion: 'motion' };
  const getInstrumentEntries = typeof options?.getInstrumentEntries === 'function'
    ? options.getInstrumentEntries
    : (() => []);
  const getSoundThemeKey = typeof options?.getSoundThemeKey === 'function'
    ? options.getSoundThemeKey
    : (() => '');
  const pickInstrumentForToy = typeof options?.pickInstrumentForToy === 'function'
    ? options.pickInstrumentForToy
    : (() => '');
  const getUsedWeaponInstrumentIds = typeof options?.getUsedWeaponInstrumentIds === 'function'
    ? options.getUsedWeaponInstrumentIds
    : (() => new Set());
  const getUsedEnemyInstrumentIds = typeof options?.getUsedEnemyInstrumentIds === 'function'
    ? options.getUsedEnemyInstrumentIds
    : (() => new Set());
  const resolveSwarmSoundInstrumentId = typeof options?.resolveSwarmSoundInstrumentId === 'function'
    ? options.resolveSwarmSoundInstrumentId
    : (() => 'tone');
  const resolveInstrumentIdOrFallback = typeof options?.resolveInstrumentIdOrFallback === 'function'
    ? options.resolveInstrumentIdOrFallback
    : ((candidate, fallback = 'tone') => String(candidate || fallback || 'tone').trim() || 'tone');

  function getEnemyToyKeyCandidates(toyKey) {
    const key = String(toyKey || '').trim().toLowerCase();
    if (!key) return ['drawgrid', 'loopgrid'];
    if (key === 'loopgrid-drum') return ['loopgrid-drum', 'loopgrid'];
    return [key];
  }

  function entryMatchesToy(entry, toyKey) {
    const key = String(toyKey || '').trim().toLowerCase();
    if (!key) return false;
    return Array.isArray(entry?.recommendedToys) && entry.recommendedToys.map((t) => String(t || '').toLowerCase()).includes(key);
  }

  function normalizeEnemyInstrumentLane(laneLike, fallback = 'lead') {
    const raw = String(laneLike || '').trim().toLowerCase();
    if (raw === 'bass' || raw === 'lead' || raw === 'accent' || raw === 'motion') return raw;
    if (raw === 'drum' || raw === 'rhythm' || raw === 'groove') return 'bass';
    if (raw === 'phrase' || raw === 'melody') return 'lead';
    if (raw === 'fx' || raw === 'effect') return 'accent';
    if (raw === 'texture' || raw === 'cosmetic' || raw === 'ambient') return 'motion';
    return String(fallback || 'lead').trim().toLowerCase() || 'lead';
  }

  function inferEnemyLaneFromToyKey(toyKey) {
    const key = String(toyKey || '').trim().toLowerCase();
    if (key === 'loopgrid-drum' || key === 'loopgrid') return 'bass';
    return 'lead';
  }

  function inferEnemyLaneFromRole(roleLike, fallbackLane = 'lead') {
    const role = normalizeSwarmRole(roleLike, '');
    if (role === roles.bass) return 'bass';
    if (role === roles.lead) return 'lead';
    if (role === roles.motion) return 'motion';
    if (role === roles.accent) return 'accent';
    return normalizeEnemyInstrumentLane(fallbackLane, 'lead');
  }

  function inferEnemyLaneFromSourceSystem(sourceSystem = '', actionType = '', roleLike = '') {
    const src = String(sourceSystem || '').trim().toLowerCase();
    const action = String(actionType || '').trim().toLowerCase();
    if (action === 'composer-group-explosion') return 'bass';
    if (src === 'spawner' || action.startsWith('spawner-')) return 'bass';
    if (src === 'drawsnake' || action.startsWith('drawsnake-')) return 'lead';
    if (src === 'group' || action.startsWith('composer-group-')) return inferEnemyLaneFromRole(roleLike, 'lead');
    if (src === 'player' || action === 'player-weapon-step') return 'accent';
    if (src === 'death' || action.startsWith('enemy-death-')) return 'accent';
    return inferEnemyLaneFromRole(roleLike, 'lead');
  }

  function inferInstrumentLaneFromCatalogId(instrumentId, fallbackLane = 'lead') {
    const id = String(instrumentId || '').trim();
    if (!id) return normalizeEnemyInstrumentLane(fallbackLane, 'lead');
    const entries = Array.isArray(getInstrumentEntries()) ? getInstrumentEntries() : [];
    const entry = entries.find((e) => String(e?.id || '').trim() === id) || null;
    if (!entry) return normalizeEnemyInstrumentLane(fallbackLane, 'lead');
    const laneHints = Array.isArray(entry?.laneHints)
      ? entry.laneHints.map((v) => normalizeEnemyInstrumentLane(v, '')).filter(Boolean)
      : [];
    if (laneHints.length) return laneHints[0];
    const type = String(entry?.type || '').trim().toLowerCase();
    const family = String(entry?.instrumentFamily || '').trim().toLowerCase();
    const functionTag = String(entry?.functionTag || '').trim().toLowerCase();
    const pitchRank = Number(entry?.pitchRank);
    if (type.includes('effects')) return 'motion';
    if (functionTag.includes('ambient') || functionTag.includes('texture')) return 'motion';
    if (family.includes('bass') || family.includes('drum') || family.includes('kick') || family.includes('djembe')) return 'bass';
    if (
      family.includes('clap')
      || family.includes('snare')
      || family.includes('hihat')
      || family.includes('cowbell')
      || family.includes('percussion')
    ) return 'accent';
    if (Number.isFinite(pitchRank) && pitchRank <= 2) return 'bass';
    if (Number.isFinite(pitchRank) && pitchRank >= 4) return 'lead';
    if (Number.isFinite(pitchRank) && pitchRank === 3) return 'lead';
    return normalizeEnemyInstrumentLane(fallbackLane, 'lead');
  }

  function entryMatchesTheme(entry, themeKey = '') {
    const theme = String(themeKey || '').trim();
    if (!theme) return true;
    return Array.isArray(entry?.themes) && entry.themes.includes(theme);
  }

  function entryMatchesLane(entry, lane = 'lead', toyCandidates = null) {
    const laneKey = normalizeEnemyInstrumentLane(lane, 'lead');
    const laneHints = Array.isArray(entry?.laneHints)
      ? entry.laneHints.map((v) => normalizeEnemyInstrumentLane(v, '')).filter(Boolean)
      : [];
    if (laneHints.includes(laneKey)) return true;
    const pitchRank = Number(entry?.pitchRank);
    const family = String(entry?.instrumentFamily || '').trim().toLowerCase();
    const functionTag = String(entry?.functionTag || '').trim().toLowerCase();
    const type = String(entry?.type || '').trim().toLowerCase();
    const candidates = Array.isArray(toyCandidates) ? toyCandidates : [];
    const isLoopgridRecommended = candidates.some((k) => k === 'loopgrid' || k === 'loopgrid-drum')
      && (entryMatchesToy(entry, 'loopgrid') || entryMatchesToy(entry, 'loopgrid-drum'));
    const isDrawgridRecommended = candidates.includes('drawgrid') && entryMatchesToy(entry, 'drawgrid');
    if (laneKey === 'bass') {
      if (Number.isFinite(pitchRank) && pitchRank <= 3) return true;
      if (family.includes('bass') || family.includes('drum') || family.includes('kick') || family.includes('djembe')) return true;
      return isLoopgridRecommended;
    }
    if (laneKey === 'lead') {
      if (Number.isFinite(pitchRank) && pitchRank >= 3) return isDrawgridRecommended || !isLoopgridRecommended;
      if (
        family.includes('piano')
        || family.includes('guitar')
        || family.includes('kalimba')
        || family.includes('xylophone')
        || family.includes('marimba')
        || family.includes('ukulele')
      ) return true;
      return isDrawgridRecommended;
    }
    if (laneKey === 'accent') {
      if (functionTag.includes('short')) return true;
      if (
        family.includes('clap')
        || family.includes('snare')
        || family.includes('hihat')
        || family.includes('cowbell')
        || family.includes('percussion')
      ) return true;
      return Number.isFinite(pitchRank) ? (pitchRank >= 3 && pitchRank <= 4) : false;
    }
    if (laneKey === 'motion') {
      if (type.includes('effects')) return true;
      if (functionTag.includes('ambient') || functionTag.includes('texture')) return true;
      return laneHints.includes('motion');
    }
    return true;
  }

  function pickEntryIdWithPriority(entries) {
    const list = Array.isArray(entries) ? entries.filter((e) => String(e?.id || '').trim()) : [];
    if (!list.length) return '';
    const pri = list.filter((e) => e?.priority);
    const pool = pri.length ? pri : list;
    const picked = pool[Math.max(0, Math.min(pool.length - 1, Math.trunc(Math.random() * pool.length)))] || null;
    return String(picked?.id || '').trim();
  }

  function pickEnemyInstrumentIdForToy(toyKey, preferredId = '', extraUsed = null, optionsLike = null) {
    const preferred = String(preferredId || '').trim();
    const theme = getSoundThemeKey() || '';
    const candidates = getEnemyToyKeyCandidates(toyKey);
    const lane = normalizeEnemyInstrumentLane(
      optionsLike?.lane || inferEnemyLaneFromRole(optionsLike?.role, inferEnemyLaneFromToyKey(toyKey)),
      inferEnemyLaneFromToyKey(toyKey)
    );
    const used = new Set();
    for (const id of getUsedWeaponInstrumentIds()) used.add(id);
    for (const id of getUsedEnemyInstrumentIds()) used.add(id);
    if (extraUsed instanceof Set) for (const id of extraUsed) used.add(String(id || '').trim());
    const entries = Array.isArray(getInstrumentEntries()) ? getInstrumentEntries() : [];
    if (preferred && !used.has(preferred)) {
      const preferredEntry = entries.find((e) => String(e?.id || '').trim() === preferred);
      const preferredOk = preferredEntry
        ? (
          candidates.some((k) => entryMatchesToy(preferredEntry, k))
          && entryMatchesLane(preferredEntry, lane, candidates)
        )
        : false;
      if (preferredOk) return preferred;
    }
    const lanePoolUnused = entries.filter((entry) => {
      const id = String(entry?.id || '').trim();
      if (!id || used.has(id)) return false;
      if (!entryMatchesTheme(entry, theme)) return false;
      if (!candidates.some((k) => entryMatchesToy(entry, k))) return false;
      return entryMatchesLane(entry, lane, candidates);
    });
    const lanePick = pickEntryIdWithPriority(lanePoolUnused);
    if (lanePick) return lanePick;
    const lanePoolAny = entries.filter((entry) => {
      if (!entryMatchesTheme(entry, theme)) return false;
      if (!candidates.some((k) => entryMatchesToy(entry, k))) return false;
      return entryMatchesLane(entry, lane, candidates);
    });
    const laneAnyPick = pickEntryIdWithPriority(lanePoolAny);
    if (laneAnyPick) return laneAnyPick;
    for (const key of candidates) {
      const id = String(pickInstrumentForToy(key, { theme, usedIds: used, preferPriority: true }) || '').trim();
      if (id) return id;
    }
    return resolveInstrumentIdOrFallback(preferred, resolveSwarmSoundInstrumentId('projectile') || 'tone');
  }

  function pickEnemyInstrumentIdForToyRandom(toyKey, extraUsed = null, optionsLike = null) {
    return pickEnemyInstrumentIdForToy(toyKey, '', extraUsed, optionsLike);
  }

  function pickSpawnerEnemyInstrumentId(preferredId = '') {
    return pickEnemyInstrumentIdForToy('loopgrid-drum', preferredId, null, { lane: 'bass', role: roles.bass });
  }

  return {
    normalizeEnemyInstrumentLane,
    inferEnemyLaneFromRole,
    inferEnemyLaneFromSourceSystem,
    inferInstrumentLaneFromCatalogId,
    pickEnemyInstrumentIdForToy,
    pickEnemyInstrumentIdForToyRandom,
    pickSpawnerEnemyInstrumentId,
  };
}
