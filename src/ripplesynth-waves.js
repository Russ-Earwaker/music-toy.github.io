// src/ripplesynth-waves.js
export function drawWaves(ctx, cx, cy, now, speed, ripples, NUM_STEPS, stepSeconds, scale=1){
  if (!ripples) return;
  ctx.save();
  const cssW = ctx.canvas.clientWidth || ctx.canvas.width;
  const cssH = ctx.canvas.clientHeight || ctx.canvas.height;
  for (let i = ripples.length - 1; i >= 0; i--) {
    const canvasW = ctx.canvas.width || (ctx.canvas.clientWidth || 0);
    const canvasH = ctx.canvas.height || (ctx.canvas.clientHeight || 0);

    const rp = ripples[i];
    const r = Math.max(0, (now - (rp.startAT ?? rp.startTime)) * speed);

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
      ctx.lineWidth = Math.max(0.5, width * scale);
      ctx.beginPath();
      ctx.arc(cx, cy, rr, 0, Math.PI*2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    };

    // gradient ring with soft edges (for secondary & tertiary waves)
    const strokeGradientRing = (rad, width, alpha) => {
      /*GRAD_LIGHTER*/
      ctx.save(); const __oldComp = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
      /*WAVES_TINT_DEBUG*/
      const debugTint = (typeof window !== 'undefined') && window.__ripplerWavesTint;

      const rr = Math.max(0.0001, rad);
      if (!isFinite(rr) || rr <= 0) return;
      const inner = Math.max(0.0001, rr - (width * scale) * 0.5);
      const outer = Math.max(inner + 0.5, rr + (width * scale) * 0.5);
      const g = ctx.createRadialGradient(cx, cy, inner, cx, cy, outer);
      if (debugTint){
        g.addColorStop(0.00, 'rgba(120,180,255,0.00)');
        g.addColorStop(0.50, 'rgba(120,200,255,' + alpha + ')');
        g.addColorStop(1.00, 'rgba(120,180,255,0.00)');
      } else {
        g.addColorStop(0.00, 'rgba(255,255,255,0.00)');
        g.addColorStop(0.50, 'rgba(255,255,255,' + alpha + ')');
        g.addColorStop(1.00, 'rgba(255,255,255,0.00)');
      }
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, outer, 0, Math.PI * 2);
      ctx.arc(cx, cy, inner, 0, Math.PI * 2, true);
      ctx.closePath();
      ctx.fill(); ctx.globalCompositeOperation = __oldComp; ctx.restore();
    };

  // draw faint trailing concentric rings behind a crest
  function drawTrails(rad, baseLW, baseAlpha, gapPx, count){
    const g = Math.max(1, gapPx|0);
    for (let i = 1; i <= count; i++){
      const rr = Math.max(0.0001, (rad - i * g));
      const a = Math.max(0, baseAlpha * Math.pow(0.5, i)); // each trail dimmer
      const lw = Math.max(0.5, baseLW * 0.6 * scale);              // slightly thinner
      if (rr < 1) break;
      strokeRing(rr, lw, a);
    }
  }

const strokeWobblyRing = (rad, width, alpha, ampPx, k, phase) => {
      const rr = Math.max(0.0001, rad);
      if (!isFinite(rr) || rr <= 0) return;
      const seg = 48; // segment count keeps perf reasonable
      // keep wobble well below radius so we never go negative
      const amp = Math.max(0, Math.min(ampPx || 0, rr * 0.6));
      const kk = k || 7;
      const ph = phase || 0;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.lineWidth = Math.max(0.5, width);
      for (let i = 0; i < seg; i++) {
        const a0 = (i / seg) * Math.PI * 2;
        const a1 = ((i + 1) / seg) * Math.PI * 2;
        const mid = (a0 + a1) * 0.5;
        const dr = amp * Math.sin(kk * mid + ph);
        const rseg = Math.max(0.0001, rr + dr);
        ctx.beginPath();
        ctx.arc(cx, cy, rseg, a0, a1);
        ctx.stroke();
      }
      ctx.restore();
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
  drawTrails(r1, baseLW,        0.70, baseLW * 1.0, 3);
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

    // bright inner-only gradient behind r1 (additive)
    strokeGradientRing(Math.max(0.0001, r1 - ambW * 5.80), ambW * 14.0, 0.36);
    // subtle ambience ring before the main bright ring
    strokeRing(r2 - ambW*0.5, ambW, 0.10);
  drawTrails(r2, baseLW * 0.9,  0.25, baseLW * 1.6, 3);
    strokeGradientRing(r2, baseLW * 16.00, 0.12);

    // front & rear fades around r2
    ctx.save();
    const __oldComp2 = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
    strokeGradientRing(Math.max(0.0001, r2 - ambW * 10.0), ambW * 20.0, 0.05); // rear fade-in
    strokeGradientRing(r2 + ambW * 10.0, ambW * 20.0, 0.05); // front fade-out (ahead of crest)
    ctx.globalCompositeOperation = __oldComp2;
    ctx.restore();

    strokeWobblyRing(r2, Math.max(0.5, baseLW * 0.70), 0.05, baseLW * 1.10, 9, now * 2.0);
    // trailing ripples (water decay) for r2
    (function() {
  const gap = Math.max(2, baseLW * 3.6);
  const baseA = 0.28;
  const baseWidth = baseLW * 0.45;
  for (let i=1;i<=3;i++) {
    const rr = Math.max(0.0001, r2 - i*gap);
    const a  = baseA * Math.pow(0.5, i);
    const lw = Math.max(0.5, baseWidth * Math.pow(0.82, i));
    strokeRing(rr, lw, a);
  }
})();// faint third ring (was second bright)
    strokeRing(r3 - ambW*0.5, ambW, 0.10);
  drawTrails(r3, baseLW * 1.1,  0.30, baseLW * 1.8, 3);
    strokeGradientRing(r3, baseLW * 18.00, 0.045);

    // front & rear fades around r3
    ctx.save();
    const __oldComp3 = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
    strokeGradientRing(Math.max(0.0001, r3 - ambW * 12.0), ambW * 24.0, 0.02); // rear fade-in
    strokeGradientRing(r3 + ambW * 12.0, ambW * 24.0, 0.02); // front fade-out (ahead of crest)
    ctx.globalCompositeOperation = __oldComp3;
    ctx.restore();

    strokeWobblyRing(r3, Math.max(0.5, baseLW * 0.80), 0.03, baseLW * 1.35, 8, now * 1.8);
    // trailing ripples (water decay) for r3
    (function() {
  const gap = Math.max(2, baseLW * 4.2);
  const baseA = 0.30;
  const baseWidth = baseLW * 0.50;
  for (let i=1;i<=3;i++) {
    const rr = Math.max(0.0001, r3 - i*gap);
    const a  = baseA * Math.pow(0.5, i);
    const lw = Math.max(0.5, baseWidth * Math.pow(0.82, i));
    strokeRing(rr, lw, a);
  }
})();
  ctx.restore();
}
}

export function drawGenerator(ctx, gx, gy, r, now, ripples, NUM_STEPS, stepSeconds, scale=1){
  // Determine newest ripple spawn to key the kick
  let tSinceSpawn = null, speed = null;
  if (ripples && ripples.length){
    const newest = ripples[ripples.length - 1];
    tSinceSpawn = now - (newest.startTime || 0);
    speed = newest.speed || 0;
  }

  // Loop duration from sequencer
  let loopDur = 0;
  if (typeof NUM_STEPS === 'number' && typeof stepSeconds === 'function'){
    loopDur = Math.max(0.0001, NUM_STEPS * stepSeconds());
  }

  // Envelope: instant "big" at spawn, then slow decay across the loop
  let env = 0;
  if (tSinceSpawn != null && tSinceSpawn >= 0){
    const x = Math.min(1, tSinceSpawn / loopDur);
    env = 1 - Math.pow(x, 0.35);
  }

  ctx.save();

  // soft radial glow
  const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, r * 2.6);
  g.addColorStop(0.0, 'rgba(255,255,255,0.22)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.10)');
  g.addColorStop(1.0, 'rgba(255,255,255,0.00)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(gx, gy, r * 2.6, 0, Math.PI * 2); ctx.fill();

  // pulsing core "kick"
  const inner = r * (0.95 + 0.90 * Math.max(0, env));
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(gx, gy, Math.max(2, inner), 0, Math.PI * 2); ctx.fill();

  ctx.restore();

}