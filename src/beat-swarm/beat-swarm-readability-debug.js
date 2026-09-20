function getBeatSwarmReadabilityDebugConfig(globalLike = globalThis) {
  const value = globalLike?.__beatSwarmDebug;
  return value && typeof value === 'object' ? value : {};
}

export function isBeatSwarmLeadHarmonyDisabled(globalLike = globalThis) {
  return getBeatSwarmReadabilityDebugConfig(globalLike).disableLeadHarmony === true;
}
