/* Extracted from bouncer.main.js (behavior-preserving) */
export function computeLaunchVelocity(hx, hy, px, py, worldW, worldH, getLoopInfo, speedFactor, EDGE = 0) {
  const dx = (px - hx), dy = (py - hy);
  const dist = Math.hypot(dx, dy) || 1;
  let ux = dx / dist, uy = dy / dist;
  // Canvas geometry (usable area inside frame)
  const w = Math.max(1, worldW()) - EDGE*2;
  const h = Math.max(1, worldH()) - EDGE*2;
  const diag = Math.max(1, Math.hypot(w, h));
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
  let desiredPPF = Math.min(8.0, Math.max(0.4, basePPF * sf));
  desiredPPF *= 4.0; // keep prior global boost so it feels lively
  return { vx: ux * desiredPPF, vy: uy * desiredPPF };
}
