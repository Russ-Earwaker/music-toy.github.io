// src/baseMusicToy/effectiveDpr.js
// Shared effective DPR helpers.
//
// Philosophy:
// - Toys own policy and multipliers (pressure, gesture, auto quality, etc).
// - Base provides the consistent "pixels-first" math:
//     rawDpr -> optional hard clamp (deviceDpr * maxDprMul) -> safe final

export function getDeviceDpr() {
  try {
    const d = (typeof window !== 'undefined' && Number.isFinite(window.devicePixelRatio) && window.devicePixelRatio > 0)
      ? window.devicePixelRatio
      : 1;
    return d;
  } catch {
    return 1;
  }
}

export function computeEffectiveDpr({
  deviceDpr,
  rawDpr,
  resScale,
  maxDprMul,
} = {}) {
  const dd = (Number.isFinite(deviceDpr) && deviceDpr > 0) ? deviceDpr : getDeviceDpr();

  let rd = dd;
  if (Number.isFinite(rawDpr) && rawDpr > 0) rd = rawDpr;
  else if (Number.isFinite(resScale) && resScale > 0) rd = dd * resScale;

  let out = rd;
  if (Number.isFinite(maxDprMul) && maxDprMul > 0) {
    const hardMax = dd * maxDprMul;
    if (Number.isFinite(hardMax) && hardMax > 0) out = Math.min(out, hardMax);
  }

  // Final safety
  if (!Number.isFinite(out) || out <= 0) out = dd;
  return { deviceDpr: dd, rawDpr: rd, effectiveDpr: out };
}

