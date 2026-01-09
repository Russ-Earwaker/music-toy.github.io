// Drawgrid tuning constants and helpers.

function toyRadiusFromArea(area, gridAreaLogical, ratio, minimum) {
  const safeW = Number.isFinite(gridAreaLogical?.w) && gridAreaLogical.w > 0
    ? gridAreaLogical.w
    : (Number.isFinite(area?.w) ? area.w : 0);
  const safeH = Number.isFinite(gridAreaLogical?.h) && gridAreaLogical.h > 0
    ? gridAreaLogical.h
    : (Number.isFinite(area?.h) ? area.h : 0);
  const base = Math.min(safeW, safeH);
  return Math.max(minimum, base * ratio);
}

export const HeaderSweepForce = Object.freeze({
  radiusMul: 2.2,
  strength: 50,
  falloff: 'gaussian',
  spacingMul: 0.6,
});

// Smooth letter physics (spring back to center)
export const LETTER_PHYS = Object.freeze({
  k: 0.02,       // spring constant (higher = snappier return)
  damping: 0.82, // velocity damping (lower = more wobble)
  impulse: 0.05, // converts 'strength' to initial velocity kick
  max: 42,       // clamp max pixel offset from center
  epsilon: 0.02, // snap-to-zero deadzone
});

// Visual response for DRAW letters on ghost-hit (per-letter only)
export const LETTER_VIS = Object.freeze({
  // Flash timing
  flashUpMs: 0,         // ms to ramp up to peak (0 = instant)
  flashDownMs: 260,     // ms to decay to 0
  // Flash look
  flashBoost: 1.75,     // brightness multiplier at peak (1 = no extra)
  flashColor: 'rgba(51, 97, 234, 1)', // temporary text color during flash
  // Opacity behavior (becomes MORE opaque on hit)
  opacityBase: 0.35,       // baseline per-letter opacity (multiplies with the letter's base opacity)
  opacityBoost: 0.9,   // extra opacity at peak flash
  // Ghost hit detection: require touch within this ratio of the radius
  ghostCoreHitMul: 0.55,
});

export const DRAW_LABEL_OPACITY_BASE = 1;

const KNOCK_DEBUG = false; // flip to true in console if we need counts
const __pokeCounts = {
  header: 0,
  pointerDown: 0,
  pointerMove: 0,
  ghostTrail: 0,
  lettersMove: 0,
  drag: 0,
  'drag-band': 0,
};

export function dbgPoke(tag) {
  if (!KNOCK_DEBUG) return;
  __pokeCounts[tag] = (__pokeCounts[tag] || 0) + 1;
  if ((__pokeCounts[tag] % 25) === 1) console.debug('[DG][poke]', tag, { count: __pokeCounts[tag] });
}

export function __dgLogFirstPoke(drawgridLog, tag, r, s) {
  if (!drawgridLog) return;
  if (!window.__DG_POKED__) {
    window.__DG_POKED__ = true;
    drawgridLog('[DG] poke', tag, { radius: r, strength: s });
  }
}

export function createDGTuning(gridAreaLogical) {
  const ghostRadiusToy = (area) => toyRadiusFromArea(area, gridAreaLogical, 0.054, 12); // doubled radius, +50% applied when poking
  const ghostStrength = 1600;
  const headerRadiusToy = (area) => toyRadiusFromArea(area, gridAreaLogical, 0.022, 10);
  const DG_KNOCK = {
    ghostTrail:  { radiusToy: ghostRadiusToy, strength: ghostStrength },
    pointerDown: { radiusToy: ghostRadiusToy, strength: ghostStrength },
    pointerMove: { radiusToy: ghostRadiusToy, strength: ghostStrength },
    lettersMove: { radius:  120, strength: 24 },
    headerLine:  { radiusToy: headerRadiusToy, strength: 30 },
    nodePulse:   {
      strengthMul: 1800.0, // stronger per-note particle kick on playback
    },
  };

  return {
    ghostRadiusToy,
    headerRadiusToy,
    DG_KNOCK,
  };
}
