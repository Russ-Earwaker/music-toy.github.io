function getBeatSwarmReadabilityDebugConfig(globalLike = globalThis) {
  const value = globalLike?.__beatSwarmDebug;
  return value && typeof value === 'object' ? value : {};
}

export function isBeatSwarmLeadHarmonyDisabled(globalLike = globalThis) {
  return getBeatSwarmReadabilityDebugConfig(globalLike).disableLeadHarmony === true;
}

export function isBeatSwarmReadabilityBackgroundEnabled(globalLike = globalThis) {
  return getBeatSwarmReadabilityDebugConfig(globalLike).readabilityBackground === true;
}

export function isBeatSwarmEnemyRoleOverlayEnabled(globalLike = globalThis) {
  return getBeatSwarmReadabilityDebugConfig(globalLike).enemyRoleOverlay === true;
}

const BEAT_SWARM_ROLE_PRESENTATION = Object.freeze({
  hero: Object.freeze({
    role: 'hero', outlineWidthPx: 3.5, markerInsetPx: 8, markerOpacity: 1,
    glowNearPx: 18, glowFarPx: 38, triggerScale: 1.22,
    affectsBodyScale: false,
    idleBody: 'lane_color', triggerClass: 'is-hero-musical-trigger', triggerDurationMs: 300, triggerBody: 'black',
  }),
  support: Object.freeze({
    role: 'support', outlineWidthPx: 2, markerInsetPx: 7, markerOpacity: 0.72,
    glowNearPx: 12, glowFarPx: 22, triggerScale: 1.1,
    affectsBodyScale: false,
    idleBody: 'lane_color', triggerClass: 'is-support-musical-trigger', triggerDurationMs: 260, triggerBody: 'very_dark_lane',
  }),
  background: Object.freeze({
    role: 'background', outlineWidthPx: 1.25, markerInsetPx: 6, markerOpacity: 0.48,
    glowNearPx: 7, glowFarPx: 13, triggerScale: 1.05,
    affectsBodyScale: false,
    idleBody: 'lane_color', triggerClass: 'is-background-musical-trigger', triggerDurationMs: 240, triggerBody: 'dark_lane',
  }),
});

export function getBeatSwarmRoleVisualPresentation(roleLike = '') {
  return BEAT_SWARM_ROLE_PRESENTATION[String(roleLike || '').trim().toLowerCase()] || null;
}

export function applyBeatSwarmRoleTriggerClass(elementLike = null, enemyLike = null, roleLike = '', scheduleLike = setTimeout) {
  const element = elementLike && elementLike.classList ? elementLike : null;
  const enemy = enemyLike && typeof enemyLike === 'object' ? enemyLike : null;
  const presentation = getBeatSwarmRoleVisualPresentation(roleLike);
  if (!element || !enemy || !presentation) return false;
  const triggerClasses = ['is-hero-musical-trigger', 'is-support-musical-trigger', 'is-background-musical-trigger'];
  enemy.heroRoleVisualTriggerToken = Math.max(0, Math.trunc(Number(enemy.heroRoleVisualTriggerToken) || 0)) + 1;
  const visualToken = enemy.heroRoleVisualTriggerToken;
  element.classList.remove(...triggerClasses);
  void element.offsetWidth;
  element.classList.add(presentation.triggerClass);
  const schedule = typeof scheduleLike === 'function' ? scheduleLike : setTimeout;
  schedule(() => {
    if (enemy.heroRoleVisualTriggerToken !== visualToken) return;
    try { element.classList.remove(...triggerClasses); } catch {}
  }, presentation.triggerDurationMs);
  return true;
}

export function selectBeatSwarmVisibleTriggerRepresentative(ownerLike = null, visibleCandidatesLike = null, cursorLike = 0) {
  const owner = ownerLike && typeof ownerLike === 'object' ? ownerLike : null;
  const visibleCandidates = Array.isArray(visibleCandidatesLike) ? visibleCandidatesLike.filter(Boolean) : [];
  if (owner && visibleCandidates.includes(owner)) return { representative: owner, nextCursor: Math.max(0, Math.trunc(Number(cursorLike) || 0)) };
  const groupId = Math.max(0, Math.trunc(Number(owner?.composerGroupId || owner?.musicGroupId) || 0));
  const sameGroupVisible = groupId > 0
    ? visibleCandidates.filter((candidate) => Math.max(0, Math.trunc(Number(candidate?.composerGroupId || candidate?.musicGroupId) || 0)) === groupId)
    : [];
  const eligible = sameGroupVisible.length ? sameGroupVisible : visibleCandidates;
  const cursor = Math.max(0, Math.trunc(Number(cursorLike) || 0));
  return {
    representative: eligible[cursor % Math.max(1, eligible.length)] || null,
    nextCursor: eligible.length ? (cursor + 1) % eligible.length : cursor,
    groupScoped: sameGroupVisible.length > 0,
    groupId,
  };
}

export function summarizeBeatSwarmHeroVisualMetrics(input = null) {
  const value = input && typeof input === 'object' ? input : {};
  const visibleHeroBodyCount = Math.max(0, Math.trunc(Number(value.visibleHeroBodyCount) || 0));
  const visibleSupportBodyCount = Math.max(0, Math.trunc(Number(value.visibleSupportBodyCount) || 0));
  const visibleBackgroundBodyCount = Math.max(0, Math.trunc(Number(value.visibleBackgroundBodyCount) || 0));
  const totalVisibleMusicalBodies = visibleHeroBodyCount + visibleSupportBodyCount + visibleBackgroundBodyCount;
  const firstVisibleHeroDelayMs = value.firstVisibleHeroDelayMs == null ? NaN : Number(value.firstVisibleHeroDelayMs);
  const sampledPhraseDurationMs = Math.max(0, Number(value.sampledPhraseDurationMs) || 0);
  const visibleHeroAtLeastOneDurationMs = Math.max(0, Number(value.visibleHeroAtLeastOneDurationMs) || 0);
  const visibleHeroAtLeastTwoDurationMs = Math.max(0, Number(value.visibleHeroAtLeastTwoDurationMs) || 0);
  const currentNoVisibleHeroDurationMs = Math.max(0, Number(value.currentNoVisibleHeroDurationMs) || 0);
  const longestNoVisibleHeroDurationMs = Math.max(
    Math.max(0, Number(value.longestNoVisibleHeroDurationMs) || 0),
    currentNoVisibleHeroDurationMs,
  );
  const lastVisibleHeroTimeMs = value.lastVisibleHeroTimeMs == null ? NaN : Number(value.lastVisibleHeroTimeMs);
  const noVisibleHeroTailMs = Number.isFinite(lastVisibleHeroTimeMs)
    ? Math.max(0, sampledPhraseDurationMs - lastVisibleHeroTimeMs)
    : sampledPhraseDurationMs;
  const heroTriggerEvents = Math.max(0, Math.trunc(Number(value.visibleTriggerEventsByRole?.hero) || 0));
  const supportTriggerEvents = Math.max(0, Math.trunc(Number(value.visibleTriggerEventsByRole?.support) || 0));
  const backgroundTriggerEvents = Math.max(0, Math.trunc(Number(value.visibleTriggerEventsByRole?.background) || 0));
  const heroMusicalTriggerCount = Math.max(0, Math.trunc(Number(value.heroMusicalTriggerCount) || 0));
  const heroTriggersAssignedToVisibleHeroCarrier = Math.max(0, Math.trunc(Number(value.heroTriggersAssignedToVisibleHeroCarrier) || 0));
  return Object.freeze({
    visibleHeroBodyCount,
    visibleSupportBodyCount,
    visibleBackgroundBodyCount,
    totalVisibleMusicalBodies,
    visibleHeroPercentage: totalVisibleMusicalBodies > 0
      ? Number(((visibleHeroBodyCount / totalVisibleMusicalBodies) * 100).toFixed(1))
      : 0,
    hasVisibleHeroBody: visibleHeroBodyCount > 0,
    sampledPhraseDurationMs: Math.round(sampledPhraseDurationMs),
    visibleHeroAtLeastOnePercentage: sampledPhraseDurationMs > 0
      ? Number(((visibleHeroAtLeastOneDurationMs / sampledPhraseDurationMs) * 100).toFixed(1))
      : 0,
    visibleHeroAtLeastTwoPercentage: sampledPhraseDurationMs > 0
      ? Number(((visibleHeroAtLeastTwoDurationMs / sampledPhraseDurationMs) * 100).toFixed(1))
      : 0,
    longestNoVisibleHeroDurationMs: Math.round(longestNoVisibleHeroDurationMs),
    firstVisibleHeroDelayMs: Number.isFinite(firstVisibleHeroDelayMs) ? Math.max(0, Math.round(firstVisibleHeroDelayMs)) : null,
    lastVisibleHeroTimeMs: Number.isFinite(lastVisibleHeroTimeMs) ? Math.max(0, Math.round(lastVisibleHeroTimeMs)) : null,
    noVisibleHeroTailMs: Math.round(noVisibleHeroTailMs),
    heroDisappearedEarly: Number.isFinite(lastVisibleHeroTimeMs) && visibleHeroBodyCount === 0 && noVisibleHeroTailMs > 0,
    heroTriggerEvents,
    supportTriggerEvents,
    backgroundTriggerEvents,
    heroMusicalTriggerCount,
    heroTriggersAssignedToVisibleHeroCarrier,
    successfulHeroVisualTriggerPercentage: heroMusicalTriggerCount > 0
      ? Number(((heroTriggersAssignedToVisibleHeroCarrier / heroMusicalTriggerCount) * 100).toFixed(1))
      : 0,
    visibleTriggerEventsByRole: Object.freeze({
      hero: heroTriggerEvents,
      support: supportTriggerEvents,
      background: backgroundTriggerEvents,
    }),
    triggerEventsWithoutVisibleCarrier: Math.max(0, Math.trunc(Number(value.triggerEventsWithoutVisibleCarrier) || 0)),
    noCarrierExists: Math.max(0, Math.trunc(Number(value.noCarrierExists) || 0)),
    carrierExistsButNotResolved: Math.max(0, Math.trunc(Number(value.carrierExistsButNotResolved) || 0)),
    triggerEventsBySource: Object.freeze(Object.fromEntries(
      Object.entries(value.triggerEventsBySource && typeof value.triggerEventsBySource === 'object' ? value.triggerEventsBySource : {})
        .map(([source, count]) => [String(source || '').trim().toLowerCase(), Math.max(0, Math.trunc(Number(count) || 0))])
        .filter(([source, count]) => source && count > 0)
    )),
  });
}
