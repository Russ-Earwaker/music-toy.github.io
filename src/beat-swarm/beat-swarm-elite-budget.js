const ELITE_BUDGET_BY_ENERGY = Object.freeze({
  intro: Object.freeze({ threat: 0.18, visual: 0.18, additive: 0.12, maxGroups: 0 }),
  silent: Object.freeze({ threat: 0.12, visual: 0.12, additive: 0.08, maxGroups: 0 }),
  low: Object.freeze({ threat: 0.28, visual: 0.28, additive: 0.22, maxGroups: 1 }),
  medium: Object.freeze({ threat: 0.48, visual: 0.46, additive: 0.42, maxGroups: 1 }),
  build: Object.freeze({ threat: 0.72, visual: 0.7, additive: 0.68, maxGroups: 2 }),
  clash: Object.freeze({ threat: 0.84, visual: 0.82, additive: 0.8, maxGroups: 3 }),
  peak: Object.freeze({ threat: 1, visual: 1, additive: 1, maxGroups: 4 }),
  release: Object.freeze({ threat: 0.42, visual: 0.4, additive: 0.34, maxGroups: 1 }),
  settle: Object.freeze({ threat: 0.32, visual: 0.32, additive: 0.26, maxGroups: 1 }),
});

const ELITE_KIND_COST = Object.freeze({
  laser_lead: Object.freeze({ threat: 0.15, visual: 0.18, additive: 0.18 }),
  laser_hihat: Object.freeze({ threat: 0.13, visual: 0.16, additive: 0.14 }),
  gunner_snare: Object.freeze({ threat: 0.14, visual: 0.14, additive: 0.15 }),
  drawsnake: Object.freeze({ threat: 0.2, visual: 0.22, additive: 0.2 }),
  spawner: Object.freeze({ threat: 0.22, visual: 0.24, additive: 0.18 }),
  default: Object.freeze({ threat: 0.16, visual: 0.17, additive: 0.16 }),
});

function normalizeToken(value, fallback = '') {
  const token = String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_');
  return token || fallback;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

export function getBeatSwarmEliteBudgetProfile(energyStateLike = '') {
  const energyState = normalizeToken(energyStateLike, 'low');
  return ELITE_BUDGET_BY_ENERGY[energyState] || ELITE_BUDGET_BY_ENERGY.low;
}

export function getBeatSwarmEliteSpawnCost(kindLike = '', memberCountLike = 1) {
  const kind = normalizeToken(kindLike, 'default');
  const memberCount = Math.max(1, Math.trunc(Number(memberCountLike) || 1));
  const base = ELITE_KIND_COST[kind] || ELITE_KIND_COST.default;
  const extraMembers = Math.max(0, memberCount - 1);
  return Object.freeze({
    threat: clamp01(base.threat + (extraMembers * 0.045)),
    visual: clamp01(base.visual + (extraMembers * 0.05)),
    additive: clamp01(base.additive + (extraMembers * 0.04)),
  });
}

export function evaluateBeatSwarmEliteSpawnBudget(options = null) {
  const opts = options && typeof options === 'object' ? options : {};
  const energyState = normalizeToken(opts.energyState, 'low');
  const profile = getBeatSwarmEliteBudgetProfile(energyState);
  const activeGroups = Math.max(0, Math.trunc(Number(opts.activeGroups) || 0));
  const activeMembers = Math.max(0, Math.trunc(Number(opts.activeMembers) || 0));
  const candidateMembers = Math.max(1, Math.trunc(Number(opts.candidateMembers) || 1));
  const candidateKind = normalizeToken(opts.candidateKind, 'default');
  const candidateCost = getBeatSwarmEliteSpawnCost(candidateKind, candidateMembers);
  const currentUsage = Object.freeze({
    threat: clamp01((activeGroups * 0.12) + (activeMembers * 0.045)),
    visual: clamp01((activeGroups * 0.14) + (activeMembers * 0.05)),
    additive: clamp01((activeGroups * 0.12) + (activeMembers * 0.04)),
  });
  const pressureAllowance = clamp01(opts.targetPressure) * 0.12;
  const limits = Object.freeze({
    threat: clamp01(profile.threat + pressureAllowance),
    visual: profile.visual,
    additive: profile.additive,
    maxGroups: profile.maxGroups,
  });
  const projected = Object.freeze({
    threat: currentUsage.threat + candidateCost.threat,
    visual: currentUsage.visual + candidateCost.visual,
    additive: currentUsage.additive + candidateCost.additive,
    groups: activeGroups + 1,
    members: activeMembers + candidateMembers,
  });
  const reasons = [];
  if (opts.musicallyJustified !== true) reasons.push('not_musically_justified');
  if (projected.groups > limits.maxGroups) reasons.push('visual_group_cap');
  if (projected.threat > limits.threat) reasons.push('threat_budget');
  if (projected.visual > limits.visual) reasons.push('visual_complexity_budget');
  if (projected.additive > limits.additive) reasons.push('additive_density_budget');
  return Object.freeze({
    allowed: reasons.length === 0,
    energyState,
    candidateKind,
    candidateMembers,
    reasons: Object.freeze(reasons),
    currentUsage,
    candidateCost,
    projected,
    limits,
  });
}
