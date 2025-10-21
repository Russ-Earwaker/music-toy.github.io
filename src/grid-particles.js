// src/grid-particles.js — springy particles for the grid toy
import { clamp } from './toyhelpers.js';

export function initGridParticles(count=90){
  return Array.from({length:count}, ()=> ({
    nx: Math.random(), ny: Math.random(),
    sx: null, sy: null,
    vx: 0, vy: 0,
    flash: 0
  }));
}

/** Advance + draw particles. map: { n2x(n), n2y(n), scale() } */
export function drawGridParticles(ctx, parts, map, {
  kSpring = 3.2,
  damping = 0.88,
  radius = (s)=> Math.max(1.8, 2.4 * map.scale()),
  col,
} = {}){
  const dt = 1/60;
  if (col >= 0) {
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    kickParticles(parts, map, {
      gx: (col + 0.5) / 8 * w,
      gy: h / 2,
      radiusR: 0,
      kick: 30,
      band: 20,
    });
  }
  ctx.save();
  for (const p of parts){
    const tx = map.n2x(p.nx), ty = map.n2y(p.ny);
    const px = (p.sx ?? tx), py = (p.sy ?? ty);
    const dx = tx - px, dy = ty - py;
    p.vx += dx * kSpring * dt; p.vy += dy * kSpring * dt;
    p.vx *= damping; p.vy *= damping;
    p.sx = px + p.vx * dt; p.sy = py + p.vy * dt;

    const r = radius();
    ctx.beginPath(); ctx.arc(p.sx, p.sy, r, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(200,210,230,0.25)'; ctx.fill();
    if (p.flash > 0){
      ctx.globalAlpha = p.flash;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(p.sx, p.sy, r, 0, Math.PI*2); ctx.fill();
      ctx.globalAlpha = 1;
      p.flash = Math.max(0, p.flash - 0.08);
    }
  }
  ctx.restore();
}

/** Nudge particles */
export function kickParticles(parts, map, {
  gx, gy, radiusR, band=20, kick=24, maxSpeed=60
}){
  for (const p of parts){
    const px = map.n2x(p.nx), py = map.n2y(p.ny);
    const dp = Math.hypot(px - gx, py - gy);
    if (Math.abs(dp - radiusR) <= band){
      p.flash = 1;
      const ang = Math.atan2(py - gy, px - gx);
      p.vx = (p.vx||0) + Math.cos(ang) * kick;
      p.vy = (p.vy||0) + Math.sin(ang) * kick;
      const sp = Math.hypot(p.vx, p.vy);
      if (sp > maxSpeed){ p.vx *= maxSpeed/sp; p.vy *= maxSpeed/sp; }
    }
  }
}

// Loopgrid-specific particle init (Rippler-like density & size)
export function initLoopgridParticles(count = 56) {
  const pts = initGridParticles(count);   // reuse the base generator
  // If Rippler uses a larger base radius/energy, normalize here:
  // e.g., pts.forEach(p => { p.size *= 1.0; p.energy *= 1.0; });
  return pts;
}