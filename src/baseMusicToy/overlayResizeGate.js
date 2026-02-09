// src/baseMusicToy/overlayResizeGate.js
// Shared overlay resize gate to avoid backing-store resize thrash when DPR oscillates.
//
// Behaviour matches DrawGrid's existing approach:
// - Quantize requested backing size to a step (e.g. 32px).
// - For non-big-jumps, require N consecutive frames requesting the same size before resizing.
// - Big jumps apply immediately.
//
// Callers choose which layers are "overlay"; this helper just governs resize cadence.

export function quantizePx(n, step) {
  const v = Math.max(1, (n | 0));
  const s = Math.max(1, (step | 0));
  return Math.max(s, Math.round(v / s) * s);
}

export function createOverlayResizeGate({
  quantStepPx = 32,
  stableFrames = 6,
  bigJumpSteps = 2,
  cachePrefix = '__dg',
  stateKey = null,
} = {}) {
  const step = Math.max(8, (quantStepPx | 0));
  const need = Math.max(1, (stableFrames | 0));
  const bigSteps = Math.max(1, (bigJumpSteps | 0));

  const sk = stateKey || cachePrefix || '__bm';
  const kW = `${sk}PendingW`;
  const kH = `${sk}PendingH`;
  const kN = `${sk}PendingN`;

  function gate(canvas, wantW, wantH, curW, curH) {
    const w = quantizePx(wantW, step);
    const h = quantizePx(wantH, step);

    const cw = curW | 0;
    const ch = curH | 0;
    const dw = Math.abs(cw - w);
    const dh = Math.abs(ch - h);
    const bigJump = (dw >= (step * bigSteps)) || (dh >= (step * bigSteps));

    if (bigJump || (cw === w && ch === h)) {
      // Apply immediately; clear pending so next oscillation must re-stabilize.
      try { canvas[kN] = 0; } catch {}
      return { apply: true, w, h, bigJump };
    }

    // Not a big jump and size differs: require stableFrames consecutive requests.
    const pw = canvas[kW] | 0;
    const ph = canvas[kH] | 0;
    if (pw === w && ph === h) {
      canvas[kN] = (canvas[kN] | 0) + 1;
    } else {
      canvas[kW] = w;
      canvas[kH] = h;
      canvas[kN] = 1;
    }

    if ((canvas[kN] | 0) < need) {
      return { apply: false, w, h, bigJump: false };
    }

    // Stable enough: apply, then clear pending.
    try { canvas[kN] = 0; } catch {}
    return { apply: true, w, h, bigJump: false };
  }

  return { gate, step, need };
}
