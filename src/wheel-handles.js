// src/wheel-handles.js — handle + geometry helpers for Wheel (keeps wheel.js < 300 lines)
export function cubeGapPx(worldW, worldH){
  const s = Math.min(worldW|0, worldH|0);
  return Math.max(6, Math.round(s * 0.02));
}
export function handleMaxRadius(radii){
  const { Rout, Rbtn } = radii;
  return Math.max(Rout - cubeGapPx(radii.cx*2, radii.cy*2) - Math.max(10, Rbtn*0.8), 10);
}
export function spokePointAt(i, r, radii, spokeAngle){
  const a = spokeAngle(i);
  return { x: radii.cx + Math.cos(a)*r, y: radii.cy + Math.sin(a)*r, a };
}
export function semiToRadius(semi, Rmin, Rmax){
  const t = Math.max(0, Math.min(11, semi|0)) / 11;
  return Rmin + t * (Rmax - Rmin);
}
export function radiusToSemi(r, Rmin, Rmax){
  const t = Math.max(0, Math.min(1, (r - Rmin) / Math.max(1, (Rmax - Rmin))));
  return Math.round(t * 11);
}
export function handlePos(i, semiOffsets, radii, spokeAngle){
  const r = semiToRadius((semiOffsets[i]|0), radii.Rmin, handleMaxRadius(radii));
  return spokePointAt(i, r, radii, spokeAngle);
}
export function hitHandle(x,y, semiOffsets, radii, spokeAngle){
  const maxD = Math.max(12, radii.Rbtn*0.5);
  let best=-1, bestD=maxD;
  for (let i=0;i<semiOffsets.length;i++){
    const p = handlePos(i, semiOffsets, radii, spokeAngle);
    const d = Math.hypot(x-p.x, y-p.y);
    if (d < bestD){ best=i; bestD=d; }
  }
  return best;
}
