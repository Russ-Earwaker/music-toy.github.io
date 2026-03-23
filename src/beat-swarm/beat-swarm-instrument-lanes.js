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
  const getStyleProfile = typeof options?.getStyleProfile === 'function'
    ? options.getStyleProfile
    : (() => ({ id: 'default' }));
  const resolveSwarmSoundInstrumentId = typeof options?.resolveSwarmSoundInstrumentId === 'function'
    ? options.resolveSwarmSoundInstrumentId
    : (() => 'tone');
  const resolveInstrumentIdOrFallback = typeof options?.resolveInstrumentIdOrFallback === 'function'
    ? options.resolveInstrumentIdOrFallback
    : ((candidate, fallback = 'tone') => String(candidate || fallback || 'tone').trim() || 'tone');
  const getSampleMusicRole = typeof options?.getSampleMusicRole === 'function'
    ? options.getSampleMusicRole
    : ((entry) => String(entry?.musicRole || entry?.music_role || '').trim().toLowerCase());
  const getSampleBehaviors = typeof options?.getSampleBehaviors === 'function'
    ? options.getSampleBehaviors
    : ((entry) => {
      const raw = entry?.musicBehavior || entry?.music_behavior || '';
      return String(raw || '')
        .split(/[;|,/]/)
        .map((token) => String(token || '').trim().toLowerCase())
        .filter(Boolean);
    });
  const hasSampleBehavior = typeof options?.hasSampleBehavior === 'function'
    ? options.hasSampleBehavior
    : ((entry, tag) => {
      const key = String(tag || '').trim().toLowerCase();
      if (!key) return false;
      return getSampleBehaviors(entry).includes(key);
    });

  function getStyleProfileSnapshot() {
    const profile = getStyleProfile();
    return profile && typeof profile === 'object' ? profile : { id: 'default' };
  }

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

  function entryExcludedFromEnemyPools(entry) {
    const combatRole = String(entry?.combatRole || '').trim().toLowerCase();
    return combatRole === 'player_weapon' || combatRole === 'player-reserved';
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

  function normalizeRegisterClassToken(rawValue = '') {
    const raw = String(rawValue || '').trim().toLowerCase();
    if (raw === 'low' || raw === 'mid' || raw === 'high') return raw;
    if (raw === 'sub') return 'low';
    if (raw === 'mid_low' || raw === 'mid-low' || raw === 'midlow') return 'mid';
    if (raw === 'mid_high' || raw === 'mid-high' || raw === 'midhigh') return 'high';
    return '';
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
    const style = getStyleProfileSnapshot();
    const src = String(sourceSystem || '').trim().toLowerCase();
    const action = String(actionType || '').trim().toLowerCase();
    let lane = 'lead';
    if (src === 'spawner' || action.startsWith('spawner-')) lane = 'bass';
    else if (src === 'drawsnake' || action.startsWith('drawsnake-')) lane = 'lead';
    else if (src === 'group' || action.startsWith('composer-group-')) lane = inferEnemyLaneFromRole(roleLike, 'lead');
    else if (src === 'player' || action === 'player-weapon-step') lane = 'accent';
    else if (src === 'death' || action.startsWith('enemy-death-')) lane = 'accent';
    else lane = inferEnemyLaneFromRole(roleLike, 'lead');

    if (String(style?.id || '').trim().toLowerCase() !== 'retro_shooter') return lane;
    const sourceKey = src || (action.startsWith('spawner-')
      ? 'spawner'
      : (action.startsWith('drawsnake-')
        ? 'drawsnake'
        : (action.startsWith('composer-group-')
          ? 'group'
          : (action === 'player-weapon-step'
            ? 'player'
            : (action.startsWith('enemy-death-') ? 'death' : 'unknown')))));
    const allowedRaw = style?.allowedLaneRolesBySourceType?.[sourceKey];
    const allowed = Array.isArray(allowedRaw)
      ? allowedRaw.map((v) => normalizeEnemyInstrumentLane(v, '')).filter(Boolean)
      : [];
    if (!allowed.length || allowed.includes(lane)) return lane;
    return allowed[0] || lane;
  }

  function inferInstrumentLaneFromCatalogId(instrumentId, fallbackLane = 'lead') {
    const id = String(instrumentId || '').trim();
    if (!id) return normalizeEnemyInstrumentLane(fallbackLane, 'lead');
    const entries = Array.isArray(getInstrumentEntries()) ? getInstrumentEntries() : [];
    const entry = entries.find((e) => String(e?.id || '').trim() === id) || null;
    if (!entry) return normalizeEnemyInstrumentLane(fallbackLane, 'lead');
    const explicitLaneRole = normalizeEnemyInstrumentLane(entry?.laneRole || '', '');
    if (explicitLaneRole) return explicitLaneRole;
    const laneHints = Array.isArray(entry?.laneHints)
      ? entry.laneHints.map((v) => normalizeEnemyInstrumentLane(v, '')).filter(Boolean)
      : [];
    if (laneHints.length) return laneHints[0];
    const type = String(entry?.type || '').trim().toLowerCase();
    const family = String(entry?.instrumentFamily || '').trim().toLowerCase();
    const functionTag = String(entry?.functionTag || '').trim().toLowerCase();
    const musicRole = getSampleMusicRole(entry);
    const registerClass = normalizeRegisterClassToken(entry?.registerClass || '');
    const pitchRank = Number(entry?.pitchRank);
    if (musicRole === 'foundation') return 'bass';
    if (musicRole === 'foreground') return 'lead';
    if (musicRole === 'accent') return 'accent';
    if (musicRole === 'support' && (type.includes('effects') || functionTag.includes('ambient') || functionTag.includes('texture'))) return 'motion';
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
    if (registerClass === 'low') return 'bass';
    if (registerClass === 'high') return 'lead';
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
    const style = getStyleProfileSnapshot();
    const laneKey = normalizeEnemyInstrumentLane(lane, 'lead');
    const explicitLaneRole = normalizeEnemyInstrumentLane(entry?.laneRole || '', '');
    const laneHints = Array.isArray(entry?.laneHints)
      ? entry.laneHints.map((v) => normalizeEnemyInstrumentLane(v, '')).filter(Boolean)
      : [];
    const registerClass = normalizeRegisterClassToken(entry?.registerClass || '');
    const pitchRank = Number(entry?.pitchRank);
    const family = String(entry?.instrumentFamily || '').trim().toLowerCase();
    const functionTag = String(entry?.functionTag || '').trim().toLowerCase();
    const type = String(entry?.type || '').trim().toLowerCase();
    const musicRole = getSampleMusicRole(entry);
    const loopLike = hasSampleBehavior(entry, 'loop');
    const melodicLike = hasSampleBehavior(entry, 'melodic');
    const shortLike = hasSampleBehavior(entry, 'short') || hasSampleBehavior(entry, 'oneshot');
    const rhythmicLike = hasSampleBehavior(entry, 'rhythmic');
    const candidates = Array.isArray(toyCandidates) ? toyCandidates : [];
    const isLoopgridRecommended = candidates.some((k) => k === 'loopgrid' || k === 'loopgrid-drum')
      && (entryMatchesToy(entry, 'loopgrid') || entryMatchesToy(entry, 'loopgrid-drum'));
    const isDrawgridRecommended = candidates.includes('drawgrid') && entryMatchesToy(entry, 'drawgrid');
    if (explicitLaneRole && explicitLaneRole !== laneKey) return false;
    if (laneKey === 'bass' && musicRole && musicRole !== 'foundation') return false;
    if (laneKey === 'lead' && (musicRole === 'foundation' || musicRole === 'accent')) return false;
    if (laneKey === 'accent' && (musicRole === 'foundation' || musicRole === 'foreground')) return false;
    if (laneKey === 'motion' && musicRole === 'foundation') return false;
    let laneMatch = explicitLaneRole === laneKey || laneHints.includes(laneKey);
    if (laneKey === 'bass') {
      if (musicRole === 'foundation') laneMatch = true;
      if (registerClass === 'low') laneMatch = true;
      if (Number.isFinite(pitchRank) && pitchRank <= 3) laneMatch = true;
      if (family.includes('bass') || family.includes('drum') || family.includes('kick') || family.includes('djembe')) laneMatch = true;
      if (isLoopgridRecommended && (loopLike || rhythmicLike || musicRole === 'foundation')) laneMatch = true;
    }
    if (!laneMatch && laneKey === 'lead') {
      if (musicRole === 'foreground') laneMatch = true;
      else if (musicRole === 'support') laneMatch = melodicLike || isDrawgridRecommended;
      if (registerClass === 'high') laneMatch = true;
      if (Number.isFinite(pitchRank) && pitchRank >= 3) laneMatch = isDrawgridRecommended || !isLoopgridRecommended;
      if (
        family.includes('piano')
        || family.includes('guitar')
        || family.includes('kalimba')
        || family.includes('xylophone')
        || family.includes('marimba')
        || family.includes('ukulele')
      ) laneMatch = true;
      if (isDrawgridRecommended) laneMatch = true;
    }
    if (!laneMatch && laneKey === 'accent') {
      if (musicRole === 'accent') laneMatch = true;
      else if (musicRole === 'support') laneMatch = shortLike;
      if (registerClass === 'mid') laneMatch = true;
      if (functionTag.includes('short')) laneMatch = true;
      if (
        family.includes('clap')
        || family.includes('snare')
        || family.includes('hihat')
        || family.includes('cowbell')
        || family.includes('percussion')
      ) laneMatch = true;
      if (!laneMatch) laneMatch = Number.isFinite(pitchRank) ? (pitchRank >= 3 && pitchRank <= 4) : false;
    }
    if (!laneMatch && laneKey === 'motion') {
      if (musicRole === 'support' && !melodicLike) laneMatch = true;
      if (type.includes('effects')) laneMatch = true;
      if (functionTag.includes('ambient') || functionTag.includes('texture')) laneMatch = true;
      if (laneHints.includes('motion')) laneMatch = true;
    }
    if (!laneMatch) return false;
    if (String(style?.id || '').trim().toLowerCase() === 'retro_shooter') {
      const isSoft = functionTag.includes('ambient') || functionTag.includes('texture');
      if (laneKey === 'bass' && (isSoft || type.includes('effects'))) return false;
      if (laneKey === 'lead' && (isSoft || family.includes('pad') || family.includes('strings'))) return false;
      if (laneKey === 'accent' && isSoft) return false;
      if (laneKey === 'motion') {
        const motionGain = Number(style?.motionParticipationGain);
        if (Number.isFinite(motionGain) && motionGain < 0.5) {
          return laneHints.includes('motion') || type.includes('effects');
        }
      }
    }
    return true;
  }

  function pickEntryIdWithPriority(entries) {
    const list = Array.isArray(entries) ? entries.filter((e) => String(e?.id || '').trim()) : [];
    if (!list.length) return '';
    const weighted = list.map((entry, idx) => ({
      entry,
      idx,
      weight: (entry?.priority ? 2.4 : 1),
    }));
    const totalWeight = weighted.reduce((sum, item) => sum + Math.max(0.001, Number(item.weight) || 0), 0);
    let roll = Math.random() * Math.max(0.001, totalWeight);
    let picked = weighted[weighted.length - 1]?.entry || null;
    for (const item of weighted) {
      roll -= Math.max(0.001, Number(item.weight) || 0);
      if (roll <= 0) {
        picked = item.entry;
        break;
      }
    }
    return String(picked?.id || '').trim();
  }

  function auditEnemyInstrumentPool(toyKey, optionsLike = null) {
    const style = getStyleProfileSnapshot();
    const theme = getSoundThemeKey() || '';
    const candidates = getEnemyToyKeyCandidates(toyKey);
    const lane = normalizeEnemyInstrumentLane(
      optionsLike?.lane || inferEnemyLaneFromRole(optionsLike?.role, inferEnemyLaneFromToyKey(toyKey)),
      inferEnemyLaneFromToyKey(toyKey)
    );
    const laneBias = Number(style?.styleLaneBias?.[lane]);
    const laneEnabled = !Number.isFinite(laneBias) || laneBias > 0.15;
    const effectiveLane = laneEnabled ? lane : 'accent';
    const used = new Set();
    for (const id of getUsedWeaponInstrumentIds()) used.add(id);
    for (const id of getUsedEnemyInstrumentIds()) used.add(id);
    const entries = Array.isArray(getInstrumentEntries()) ? getInstrumentEntries() : [];
    const themed = [];
    const eligible = [];
    const priorityEligible = [];
    for (const entry of entries) {
      const id = String(entry?.id || '').trim();
      if (!id) continue;
      if (entryExcludedFromEnemyPools(entry)) continue;
      if (!candidates.some((k) => entryMatchesToy(entry, k))) continue;
      if (!entryMatchesLane(entry, effectiveLane, candidates)) continue;
      if (entryMatchesTheme(entry, theme)) themed.push(id);
      const themeOk = entryMatchesTheme(entry, theme);
      if (!themeOk) continue;
      eligible.push(id);
      if (entry?.priority === true) priorityEligible.push(id);
    }
    const unusedEligible = eligible.filter((id) => !used.has(id));
    return {
      toyKey: String(toyKey || '').trim().toLowerCase(),
      lane: effectiveLane,
      theme: String(theme || '').trim(),
      eligibleCount: eligible.length,
      eligibleIds: eligible.slice(),
      unusedEligibleCount: unusedEligible.length,
      unusedEligibleIds: unusedEligible.slice(),
      priorityEligibleCount: priorityEligible.length,
      priorityEligibleIds: priorityEligible.slice(),
      themedMatchCount: themed.length,
    };
  }

  function pickEnemyInstrumentIdForToy(toyKey, preferredId = '', extraUsed = null, optionsLike = null) {
    const preferred = String(preferredId || '').trim();
    const style = getStyleProfileSnapshot();
    const theme = getSoundThemeKey() || '';
    const candidates = getEnemyToyKeyCandidates(toyKey);
    const lane = normalizeEnemyInstrumentLane(
      optionsLike?.lane || inferEnemyLaneFromRole(optionsLike?.role, inferEnemyLaneFromToyKey(toyKey)),
      inferEnemyLaneFromToyKey(toyKey)
    );
    const laneBias = Number(style?.styleLaneBias?.[lane]);
    const laneEnabled = !Number.isFinite(laneBias) || laneBias > 0.15;
    const effectiveLane = laneEnabled ? lane : 'accent';
    const used = new Set();
    for (const id of getUsedWeaponInstrumentIds()) used.add(id);
    for (const id of getUsedEnemyInstrumentIds()) used.add(id);
    if (extraUsed instanceof Set) for (const id of extraUsed) used.add(String(id || '').trim());
    const entries = Array.isArray(getInstrumentEntries()) ? getInstrumentEntries() : [];
    if (preferred && !used.has(preferred)) {
      const preferredEntry = entries.find((e) => String(e?.id || '').trim() === preferred);
      const preferredOk = preferredEntry
        ? (
          !entryExcludedFromEnemyPools(preferredEntry)
          && (
          candidates.some((k) => entryMatchesToy(preferredEntry, k))
          && entryMatchesLane(preferredEntry, effectiveLane, candidates)
          ))
        : false;
      if (preferredOk) return preferred;
    }
    const lanePoolUnused = entries.filter((entry) => {
      const id = String(entry?.id || '').trim();
      if (!id || used.has(id)) return false;
      if (entryExcludedFromEnemyPools(entry)) return false;
      if (!entryMatchesTheme(entry, theme)) return false;
      if (!candidates.some((k) => entryMatchesToy(entry, k))) return false;
      return entryMatchesLane(entry, effectiveLane, candidates);
    });
    const lanePick = pickEntryIdWithPriority(lanePoolUnused);
    if (lanePick) return lanePick;
    const lanePoolAny = entries.filter((entry) => {
      if (entryExcludedFromEnemyPools(entry)) return false;
      if (!entryMatchesTheme(entry, theme)) return false;
      if (!candidates.some((k) => entryMatchesToy(entry, k))) return false;
      return entryMatchesLane(entry, effectiveLane, candidates);
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
    auditEnemyInstrumentPool,
    entryExcludedFromEnemyPools,
  };
}
