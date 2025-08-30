let __basePPF = 0;
let __ppfOverride = 0;
let __baseDiag = 0;
/* Extracted from bouncer.main.js (behavior-preserving) */

export function updateLaunchBaseline(worldW, worldH, EDGE){
  try{
    const w = Math.max(1, worldW()) - EDGE*2;
    const h = Math.max(1, worldH()) - EDGE*2;
    __baseDiag = Math.max(1, Math.hypot(w, h));
  }catch{}
}

export function setSpawnSpeedFromBallSpeed(){ /* no-op: we now use speedFactor only */ }


export function computeLaunchVelocity(hx, hy, px, py, worldW, worldH, getLoopInfo, speedFactor, EDGE = 0) {
  const dx = (px - hx), dy = (py - hy);
  const dist = Math.hypot(dx, dy) || 1;
  let ux = dx / dist, uy = dy / dist;

  // Fallback direction for tiny drags
  if (dist < 3){ ux = 0; uy = -1; }

  // Simple, size-independent pixels-per-frame baseline
  // Tuned so Standard feels like before at sf=1.0
  const LAUNCH_PPF_BASE = 22.0;  // adjust if needed
  const sf = Math.max(0.2, Math.min(1.6, Number(speedFactor)||1));

  // Optionally incorporate tempo if provided (keeps feel across tempos)
  let tempoAdj = 1.0;
  try {
    const li = (typeof getLoopInfo === 'function') ? getLoopInfo() : null;
    if (li && li.barLen){ tempoAdj = 1 / Math.max(0.5, Math.min(2.0, li.barLen)); }
  } catch {}

    // Scale spawn speed by current frame size so Advanced (bigger) matches Standard relatively
  let rel = 1.0;
  try{
    const w = Math.max(1, (worldW?.()||1) - EDGE*2);
    const h = Math.max(1, (worldH?.()||1) - EDGE*2);
    const diagNow = Math.hypot(w,h);
    if (!__baseDiag) __baseDiag = diagNow;
    rel = Math.max(0.4, Math.min(3.0, diagNow / __baseDiag));
  }catch{}
  const desiredPPF = LAUNCH_PPF_BASE * sf * tempoAdj * rel;

  if (globalThis.BOUNCER_DEBUG){ console.log('[bouncer-geom] launch', {hx,hy,px,py,desiredPPF, EDGE, sf, tempoAdj}); }
  return { vx: ux * desiredPPF, vy: uy * desiredPPF };
}
export function getLaunchDiag(){ return { baseDiag: __baseDiag, ppfOverride: __ppfOverride }; }
