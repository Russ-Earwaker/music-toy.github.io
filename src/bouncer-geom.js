// src/bouncer-geom.js — launch vector & baseline

let __basePPF = 0;
let __ppfOverride = 0;
let __baseDiag = 0;

export function updateLaunchBaseline(worldW, worldH, EDGE){
  try{
    const w = Math.max(1, worldW()) - EDGE*2;
    const h = Math.max(1, worldH()) - EDGE*2;
    __baseDiag = Math.max(1, Math.hypot(w, h));
  }catch{}
}

// Kept for API compatibility; we drive spawn speed from slider only now.
export function setSpawnSpeedFromBallSpeed(){}

export function computeLaunchVelocity(hx, hy, px, py, worldW, worldH, getLoopInfo, speedFactor, EDGE = 0){
  // Direction only from drag; magnitude solely from speed slider.
  let dx = (px - hx), dy = (py - hy);
  let len = Math.hypot(dx, dy) || 1;
  let ux = dx/len, uy = dy/len;
  if (len < 3){ ux = 0; uy = -1; }

  const sf = Math.max(0.2, Math.min(1.6, Number(speedFactor)||1));
  // Ball velocity is interpreted as pixels-per-frame at ~60fps baseline in the stepper.
  const LAUNCH_PPF_BASE = 4.8;  // calmer default baseline
  const v = LAUNCH_PPF_BASE * sf;

  return { vx: ux * v, vy: uy * v };
}

export function getLaunchDiag(){ return { baseDiag: __baseDiag, ppfOverride: __ppfOverride }; }
