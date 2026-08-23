export function parseBeatSwarmTraceRecords(textLike = '') {
  return String(textLike || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try { return JSON.parse(line); } catch { return null; }
    })
    .filter((record) => record && typeof record === 'object');
}

function countAuthoredThemeSteps(themeLike = null) {
  const data = themeLike?.data && typeof themeLike.data === 'object' ? themeLike.data : {};
  if (String(data.toyType || '').trim() === 'simpleRhythm') {
    const patterns = Array.isArray(data.patternChain) ? data.patternChain : [data.active];
    return patterns.reduce((sum, pattern) => (
      sum + (Array.isArray(pattern) ? pattern.filter(Boolean).length : 0)
    ), 0);
  }
  const tunes = Array.isArray(data.tuneChain) ? data.tuneChain : [data.tune];
  return tunes.reduce((sum, tune) => (
    sum + (Array.isArray(tune?.active) ? tune.active.filter(Boolean).length : 0)
  ), 0);
}

function countPatternChainSteps(patternChainLike = null) {
  const patterns = Array.isArray(patternChainLike) ? patternChainLike : [];
  return patterns.reduce((sum, pattern) => {
    if (Array.isArray(pattern)) return sum + pattern.filter(Boolean).length;
    return sum + Array.from(String(pattern || '')).filter((value) => value === '1').length;
  }, 0);
}

export function evaluateAuthoringIntensityHandoffTrace(recordsLike = null, themesLike = null) {
  const records = Array.isArray(recordsLike) ? recordsLike : [];
  const themes = themesLike && typeof themesLike === 'object' ? themesLike : {};
  const ofType = (type) => records.filter((record) => String(record?.type || '').trim().toLowerCase() === type);
  const emptyLaneEvent = ofType('music_contribution_empty_lanes_armed')[0] || null;
  const completions = ofType('music_contribution_completed');
  const completedLaneIds = new Set(completions.map((record) => String(record?.payload?.laneId || '').trim().toLowerCase()).filter(Boolean));
  const protections = ofType('music_contribution_protection_armed');
  const protectedLaneIds = new Set(protections.map((record) => String(record?.payload?.laneId || '').trim().toLowerCase()).filter(Boolean));
  const intensityOrder = [];
  for (const record of ofType('music_level1_arrangement_state')) {
    const section = String(record?.payload?.intensityAuditionSection || '').trim().toLowerCase();
    if (section && intensityOrder.at(-1) !== section) intensityOrder.push(section);
  }
  const expectedIntensityOrder = ['low', 'medium', 'build', 'peak', 'release', 'settle'];
  let intensityCursor = -1;
  const intensityOrderValid = expectedIntensityOrder.every((section) => {
    const nextIndex = intensityOrder.indexOf(section, intensityCursor + 1);
    if (nextIndex < 0) return false;
    intensityCursor = nextIndex;
    return true;
  });
  const flowStartIndex = records.findIndex((record) => String(record?.type || '').trim().toLowerCase() === 'director_formation_flow_started_after_onboarding');
  const completionIndices = records
    .map((record, index) => String(record?.type || '').trim().toLowerCase() === 'music_contribution_completed' ? index : -1)
    .filter((index) => index >= 0);
  const primaryEmissions = ofType('music_primary_loop_lane_emitted');
  const literalLeadEmissions = primaryEmissions.filter((record) => record?.payload?.leadGateLiteralLoop === true);
  const leadProtectionExpiry = ofType('music_contribution_protection_expired')
    .find((record) => String(record?.payload?.laneId || '').trim().toLowerCase() === 'primary_loop_lane') || null;
  const leadEmissionsAfterProtection = leadProtectionExpiry
    ? primaryEmissions.filter((record) => Math.max(0, Number(record?.stepIndex) || 0) >= Math.max(0, Number(leadProtectionExpiry?.stepIndex) || 0))
    : [];
  const densityRequests = ofType('director_density_contribution_requested');
  const queuedDensityRequests = ofType('music_density_request_queued_as_contribution');
  const queuedContributionIds = new Set(queuedDensityRequests.map((record) => String(record?.payload?.id || '').trim()).filter(Boolean));
  const densityRequestsPaired = densityRequests.every((record) => queuedContributionIds.has(String(record?.payload?.contributionId || '').trim()));
  const committedThemeStepCounts = {
    foundation_lane: 0,
    secondary_loop_lane: 0,
    primary_loop_lane: 0,
  };
  for (const record of ofType('music_rhythm_rewrite_committed_to_theme')) {
    const laneId = String(record?.payload?.laneId || '').trim().toLowerCase();
    if (!(laneId in committedThemeStepCounts)) continue;
    committedThemeStepCounts[laneId] = Math.max(
      committedThemeStepCounts[laneId],
      countPatternChainSteps(record?.payload?.patternChain),
    );
  }
  for (const record of ofType('lead_ball_rewrite_committed_to_theme')) {
    const laneId = String(record?.payload?.laneId || '').trim().toLowerCase();
    if (!(laneId in committedThemeStepCounts)) continue;
    committedThemeStepCounts[laneId] = Math.max(
      committedThemeStepCounts[laneId],
      Array.isArray(record?.payload?.activeSteps) ? record.payload.activeSteps.length : 0,
    );
  }
  const themeStepCounts = {
    foundation_lane: Math.max(countAuthoredThemeSteps(themes.bassDrive), committedThemeStepCounts.foundation_lane),
    secondary_loop_lane: Math.max(countAuthoredThemeSteps(themes.accentRhythm), committedThemeStepCounts.secondary_loop_lane),
    primary_loop_lane: Math.max(countAuthoredThemeSteps(themes.leadTheme), committedThemeStepCounts.primary_loop_lane),
  };
  const assertions = {
    lanesStartedEmpty: !!emptyLaneEvent
      && Number(emptyLaneEvent?.payload?.bassDriveSteps) === 0
      && Number(emptyLaneEvent?.payload?.accentRhythmSteps) === 0
      && Number(emptyLaneEvent?.payload?.leadSteps) === 0,
    allFiveContributionsCompleted: completions.length >= 5,
    allMusicalLanesCommitted: ['foundation_lane', 'secondary_loop_lane', 'primary_loop_lane'].every((laneId) => completedLaneIds.has(laneId)),
    allMusicalLanesProtected: ['foundation_lane', 'secondary_loop_lane', 'primary_loop_lane'].every((laneId) => protectedLaneIds.has(laneId)),
    directorStartedAfterAuthoring: flowStartIndex >= 0
      && completionIndices.filter((index) => index < flowStartIndex).length >= 5,
    fullIntensitySequenceObserved: intensityOrderValid,
    literalLeadAudible: literalLeadEmissions.length > 0,
    leadContinuedAfterProtection: leadEmissionsAfterProtection.length > 0,
    authoredThemesPersisted: Object.values(themeStepCounts).every((count) => count > 0),
    densityRequestsUseInteractions: densityRequestsPaired,
  };
  return {
    assertions,
    assertionsPassed: Object.values(assertions).every(Boolean),
    eventCount: records.length,
    completionCount: completions.length,
    completedLaneIds: Array.from(completedLaneIds),
    protectedLaneIds: Array.from(protectedLaneIds),
    intensityOrder,
    literalLeadEmissionCount: literalLeadEmissions.length,
    leadEmissionsAfterProtection: leadEmissionsAfterProtection.length,
    densityRequestCount: densityRequests.length,
    queuedDensityRequestCount: queuedDensityRequests.length,
    committedThemeStepCounts,
    themeStepCounts,
  };
}
