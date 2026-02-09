// src/baseMusicToy/toyQualityTier.js
// Shared tier selection scaffolding (table-driven).
//
// This does NOT define tier tables (each toy owns its own table).
// This does NOT compute DPR (each toy owns its own policy).
// It only standardizes how we pick a tier and stamp debug metadata.

export function clampInt(v, lo, hi, fallback) {
  const n = (Number.isFinite(v) ? (v | 0) : (fallback | 0));
  return Math.max(lo | 0, Math.min(hi | 0, n));
}

export function pickTierFromTable({
  forcedTier = null,
  table,
  defaultId = 0,
} = {}) {
  const t = Array.isArray(table) ? table : [];
  const maxId = Math.max(0, t.length - 1);

  let tierId = null;
  if (Number.isFinite(forcedTier)) tierId = clampInt(forcedTier, 0, maxId, defaultId);
  if (tierId == null) tierId = clampInt(defaultId, 0, maxId, 0);

  const params = t[tierId] || t[0] || null;
  return { tierId, params };
}

export function stampTierDebugMeta({
  panel,
  state,
  key = 'tier',
  tierId,
  params,
} = {}) {
  // Purely diagnostic; safe if it fails.
  try { if (panel) panel[`__${key}TierId`] = tierId; } catch {}
  try { if (state) state[`_${key}TierParams`] = params; } catch {}
}

