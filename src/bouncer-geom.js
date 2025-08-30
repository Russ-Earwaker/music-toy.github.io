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

  // Canvas geometry (usable area inside frame)
  const w = Math.max(1, worldW()) - EDGE*2;
  const h = Math.max(1, worldH()) - EDGE*2;
  const diagNow = Math.max(1, Math.hypot(w, h));
  const baseDiag = (__baseDiag || diagNow);
  const rel = diagNow / baseDiag;
  const diag = baseDiag;

  // Fallback direction for simple clicks (tiny drags)
  const minDrag = Math.max(4, diag*0.005);
  if (dist < minDrag){ ux = 0; uy = -1; }

  // Time base
  const FPS = 60;
  let barLen = 1.0;
  try{ const li = (typeof getLoopInfo==='function') ? getLoopInfo() : null; if (li && li.barLen) barLen = li.barLen; }catch{}

  // Base pixels-per-frame so the ball roughly crosses the diagonal in ~1 bar at sf=1
  const basePPF = (diag / (FPS * barLen));
  const sf = Math.max(0.2, Math.min(1.6, speedFactor || 1));

  // Desired speed derived only from slider (consistent across views via baseline diag)
  let desiredPPF = Math.max(0.4, basePPF * sf * rel);
  desiredPPF *= 3.2; // softened from 4.0 for calmer default // keep prior global boost so it feels lively

  if (globalThis.BOUNCER_DEBUG){ console.log('[bouncer-geom] launch', {hx,hy,px,py,desiredPPF,EDGE}); } /*DBG*/
  return { vx: ux * desiredPPF, vy: uy * desiredPPF };
}

export function getLaunchDiag(){ return { baseDiag: __baseDiag, ppfOverride: __ppfOverride }; }
