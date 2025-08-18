// src/ripplesynth-waves.js
export function drawWaves(ctx, cx, cy, now, speed, ripples, NUM_STEPS, stepSeconds){
  if (!ripples) return;
  ctx.save();
  const cssW = ctx.canvas.clientWidth || ctx.canvas.width;
  const cssH = ctx.canvas.clientHeight || ctx.canvas.height;
  for (let i = ripples.length - 1; i >= 0; i--) {
    const canvasW = ctx.canvas.width || (ctx.canvas.clientWidth || 0);
    const canvasH = ctx.canvas.height || (ctx.canvas.clientHeight || 0);

    const rp = ripples[i];
    const r = Math.max(0, (now - rp.startTime) * speed);

    const cornerMax = Math.max(
      Math.hypot(cx - 0,        cy - 0),
      Math.hypot(cx - cssW,     cy - 0),
      Math.hypot(cx - 0,        cy - cssH),
      Math.hypot(cx - cssW,     cy - cssH)
    );
    // CSS-unit culling to match cx,cy and r units
const farCss = Math.hypot(Math.max(cx, cssW - cx), Math.max(cy, cssH - cy));
const offR = farCss + 720; // generous margin beyond far corner
if (r > offR) { ripples.splice(i,1); continue; }

    const strokeRing = (rad, width, alpha) => {
      const rr = Math.max(0.0001, rad);
      if (!isFinite(rr) || rr <= 0) return;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = Math.max(0.5, width);
      ctx.beginPath();
      ctx.arc(cx, cy, rr, 0, Math.PI*2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    };

    
const r1 = Math.max(0, r);
    const r2 = Math.max(0, r - speed * 0.60);
    const r3 = Math.max(0, r - speed * 1.20);

    // dynamic stroke widths for a lighter, watery feel
    const baseLW = Math.max(1.2, Math.min(8, cssW * 0.006));
    const ambW  = baseLW * 1.2;
    const glowW = baseLW * 1.6;

    // (black interleave removed; water aesthetic prefers softer edges)

    // primary ring — slim + inner glow pass
    strokeRing(r1, baseLW, 0.85);
    strokeRing(r1, glowW, 0.34);

    // moving highlight wedge
    if (r1 > 0.0001){
      const ang = now * 1.4 % (Math.PI*2);
      ctx.save();
      ctx.globalAlpha = 0.12;
      ctx.lineWidth = baseLW;
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(0.0001, r1), ang - 0.18, ang + 0.18);
      ctx.stroke();
      ctx.restore();
    }

    // subtle ambience ring before the main bright ring
    strokeRing(r2 - ambW*0.5, ambW, 0.10);
    strokeRing(r2, baseLW * 0.45, 0.28);

    // faint third ring (was second bright)
    strokeRing(r3 - ambW*0.5, ambW, 0.10);
    strokeRing(r3, baseLW * 0.50, 0.30);

  }
  ctx.restore();
}

export function drawGenerator(ctx, gx, gy, r, now){
  // soft radial glow
  ctx.save();
  const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, r * 2.6);
  g.addColorStop(0.0, 'rgba(255,255,255,0.22)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.10)');
  g.addColorStop(1.0, 'rgba(255,255,255,0.00)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(gx, gy, r * 2.6, 0, Math.PI*2); ctx.fill();

  // pulsing core
  const k = 0.12;
  const inner = r * (0.92 + k * Math.sin(now * 2.0));
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(gx, gy, Math.max(2, inner), 0, Math.PI*2); ctx.fill();

  // tiny spinner hints
  const ang = (now * 2.4) % (Math.PI*2);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = Math.max(1, r * 0.25);
  for (let i=0;i<3;i++){
    const a0 = ang + i * (Math.PI * 2 / 3);
    ctx.beginPath();
    ctx.arc(gx, gy, r * 1.4, a0, a0 + 0.36);
    ctx.stroke();
  }
  ctx.restore();
}

