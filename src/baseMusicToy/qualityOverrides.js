// src/baseMusicToy/qualityOverrides.js
// Shared quality override helpers.
//
// Philosophy:
// - Quality Lab is the canonical UI source of truth.
// - Console globals remain supported as legacy / debug overrides.
// - BaseMusicToy provides the shared "read override" contract so toys don't
//   each invent their own ad-hoc precedence rules.

export function readForcedTier({ qlabKey, legacyGlobalKey } = {}) {
  // 1) Prefer Quality Lab UI (window.__QUALITY_LAB.<key>)
  try {
    const q = (typeof window !== 'undefined') ? window.__QUALITY_LAB : null;
    if (q && qlabKey && Number.isFinite(q[qlabKey])) return (q[qlabKey] | 0);
  } catch {}

  // 2) Fallback to legacy global (window.__LG_FORCE_TIER etc)
  try {
    const w = (typeof window !== 'undefined') ? window : null;
    if (w && legacyGlobalKey && Number.isFinite(w[legacyGlobalKey])) return (w[legacyGlobalKey] | 0);
  } catch {}

  return null;
}

