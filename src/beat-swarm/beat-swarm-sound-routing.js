export function createBeatSwarmSoundRoutingTools(options = {}) {
  const getAllIds = typeof options.getAllIds === 'function' ? options.getAllIds : () => [];
  const getIdForDisplayName = typeof options.getIdForDisplayName === 'function' ? options.getIdForDisplayName : () => '';
  const normalizeInstrumentIdToken = typeof options.normalizeInstrumentIdToken === 'function'
    ? options.normalizeInstrumentIdToken
    : (value) => String(value || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
  const normalizeSwarmRole = typeof options.normalizeSwarmRole === 'function'
    ? options.normalizeSwarmRole
    : (roleName, fallback = '') => String(roleName || fallback || '');
  const normalizeEnemyDeathFamily = typeof options.normalizeEnemyDeathFamily === 'function'
    ? options.normalizeEnemyDeathFamily
    : (family, fallback = 'medium') => String(family || fallback || 'medium');
  const sanitizeEnemyMusicInstrumentId = typeof options.sanitizeEnemyMusicInstrumentId === 'function'
    ? options.sanitizeEnemyMusicInstrumentId
    : (candidate, fallback = 'tone') => String(candidate || fallback || 'tone');
  const resolveRoleInstrument = typeof options.resolveRoleInstrument === 'function'
    ? options.resolveRoleInstrument
    : ((_role, fallback) => fallback);
  const getEventInstrumentId = typeof options.getEventInstrumentId === 'function'
    ? options.getEventInstrumentId
    : (() => '');
  const swarmSoundEvents = (options.swarmSoundEvents && typeof options.swarmSoundEvents === 'object')
    ? options.swarmSoundEvents
    : Object.freeze({});
  const swarmEnemyDeathEventKeyByFamily = (options.swarmEnemyDeathEventKeyByFamily && typeof options.swarmEnemyDeathEventKeyByFamily === 'object')
    ? options.swarmEnemyDeathEventKeyByFamily
    : Object.freeze({});
  const swarmSoundInstrumentCache = options.swarmSoundInstrumentCache instanceof Map
    ? options.swarmSoundInstrumentCache
    : new Map();
  const beatEventRoles = (options.beatEventRoles && typeof options.beatEventRoles === 'object')
    ? options.beatEventRoles
    : Object.freeze({ ACCENT: 'accent' });

  function resolveInstrumentIdOrFallback(candidate, fallback = 'tone') {
    const raw = String(candidate || '').trim();
    const allIds = Array.isArray(getAllIds?.()) ? getAllIds().map((id) => String(id || '').trim()).filter(Boolean) : [];
    if (!raw) return String(fallback || 'tone').trim() || 'tone';
    if (allIds.includes(raw)) return raw;
    const fromDisplay = String(getIdForDisplayName(raw) || '').trim();
    if (fromDisplay) return fromDisplay;
    if (allIds.length) {
      const token = normalizeInstrumentIdToken(raw);
      const match = allIds.find((id) => normalizeInstrumentIdToken(id) === token);
      if (match) return match;
    }
    return String(fallback || 'tone').trim() || 'tone';
  }

  function resolveSwarmSoundInstrumentId(eventKey) {
    const key = String(eventKey || '').trim();
    if (!key) return 'tone';
    const allIds = Array.isArray(getAllIds?.()) ? getAllIds().map((id) => String(id || '').trim()).filter(Boolean) : [];
    const idSet = new Set(allIds);
    const explicitId = resolveInstrumentIdOrFallback(
      getEventInstrumentId(key),
      String(getIdForDisplayName('Tone (Sine)') || '').trim() || 'tone'
    );
    if (explicitId && (idSet.has(explicitId) || allIds.length === 0)) {
      swarmSoundInstrumentCache.set(key, explicitId);
      return explicitId;
    }
    if (swarmSoundInstrumentCache.has(key)) {
      const cached = String(swarmSoundInstrumentCache.get(key) || '').trim();
      if (cached && (idSet.has(cached) || allIds.length === 0)) return cached;
      swarmSoundInstrumentCache.delete(key);
    }
    const def = swarmSoundEvents[key] || null;
    const display = String(def?.instrumentDisplay || '').trim();
    let id = resolveInstrumentIdOrFallback(display, String(getIdForDisplayName('Tone (Sine)') || '').trim() || 'tone');
    if (!id && display && idSet.has(display)) id = display;
    swarmSoundInstrumentCache.set(key, id);
    return id;
  }

  function resolveSwarmRoleInstrumentId(roleName, fallback = 'tone') {
    const role = normalizeSwarmRole(roleName, beatEventRoles.ACCENT);
    const fallbackId = sanitizeEnemyMusicInstrumentId(fallback, 'tone', { role });
    const roleId = resolveInstrumentIdOrFallback(resolveRoleInstrument(role, fallbackId), fallbackId);
    return sanitizeEnemyMusicInstrumentId(roleId, fallbackId, { role });
  }

  function isEnemyDeathSoundEventKey(eventKey) {
    const key = String(eventKey || '').trim();
    if (!key) return false;
    if (key === 'enemyDeath') return true;
    return Object.values(swarmEnemyDeathEventKeyByFamily).includes(key);
  }

  function resolveEnemyDeathEventKey(family, fallback = 'enemyDeathMedium') {
    const normalized = normalizeEnemyDeathFamily(family, 'medium');
    const key = swarmEnemyDeathEventKeyByFamily[normalized];
    if (swarmSoundEvents[key]) return key;
    if (swarmSoundEvents[fallback]) return fallback;
    return swarmSoundEvents.enemyDeath ? 'enemyDeath' : '';
  }

  return Object.freeze({
    isEnemyDeathSoundEventKey,
    resolveEnemyDeathEventKey,
    resolveInstrumentIdOrFallback,
    resolveSwarmRoleInstrumentId,
    resolveSwarmSoundInstrumentId,
  });
}
