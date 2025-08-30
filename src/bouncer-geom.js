// src/bouncer-geom.js
export function computeLaunchVelocity(hx, hy, px, py, worldW, worldH, getLoopInfo, speedFactor, EDGE){
  const dx = (px - hx), dy = (py - hy);
  const dist = Math.hypot(dx, dy) || 1;
  let ux = dx / dist, uy = dy / dist;
  // Canvas geometry (usable area inside frame)
  const w = Math.max(1, worldW()) - EDGE*2;
  const h = Math.max(1, worldH()) - EDGE*2;
  const diag = Math.max(1, Math.hypot(w, h));
  const minDrag = Math.max(4, diag*0.005);
  if (dist < minDrag){ ux = 0; uy = -1; }
  const FPS = 60;
  let barLen = 1.0;
  try{ const li = (typeof getLoopInfo==='function') ? getLoopInfo() : null; if (li && li.barLen) barLen = li.barLen; }catch{}
  const basePPF = (diag / (FPS * barLen));
  const sf = Math.max(0.2, Math.min(1.6, speedFactor || 1));
  let desiredPPF = Math.min(8.0, Math.max(0.4, basePPF * sf));
  desiredPPF *= 5.0;
  return { vx: ux * desiredPPF, vy: uy * desiredPPF };
}
