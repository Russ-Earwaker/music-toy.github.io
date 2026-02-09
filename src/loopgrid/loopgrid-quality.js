// src/loopgrid/loopgrid-quality.js
// LoopGrid (Simple Rhythm) quality tiers + selection.
// This stays toy-specific, but uses shared baseMusicToy tier helpers.

import {
  readForcedTier,
  pickTierFromTable,
  stampTierDebugMeta,
} from '../baseMusicToy/index.js';

// Philosophy (matches perf plan + DrawGrid approach):
// - resScale is a soft multiplier.
// - maxDprMul is the hard clamp (this is the real nonScript lever).
//
// NOTE: Tier application is done by the toy via computeResizeOpts (rig contract).
const __LG_TIER_TABLE = Object.freeze([
  { id: 0, name: 'full',   resScale: 1.00, maxDprMul: 1.00 },
  { id: 1, name: 'high',   resScale: 0.90, maxDprMul: 0.92 },
  { id: 2, name: 'med',    resScale: 0.78, maxDprMul: 0.80 },
  { id: 3, name: 'low',    resScale: 0.66, maxDprMul: 0.70 },
  { id: 4, name: 'ultra',  resScale: 0.55, maxDprMul: 0.62 },
]);

export function getLoopgridTierParams(panel, st) {
  const forced = readForcedTier({ qlabKey: 'lgForceTier', legacyGlobalKey: '__LG_FORCE_TIER' });
  // Default remains tier 0 unless a forced tier is present.
  const pick = pickTierFromTable({ forcedTier: forced, table: __LG_TIER_TABLE, defaultId: 0 });
  const tierId = pick.tierId;
  const out = { ...(pick.params || __LG_TIER_TABLE[0]) };

  const forcedMax = (typeof window !== 'undefined') ? window.__LG_FORCE_MAXDPRMUL : null;
  if (Number.isFinite(forcedMax) && forcedMax > 0) out.maxDprMul = forcedMax;

  // Store debug/telemetry in a standardized way.
  stampTierDebugMeta({ panel, state: st, key: 'loopgrid', tierId, params: out });
  return out;
}

