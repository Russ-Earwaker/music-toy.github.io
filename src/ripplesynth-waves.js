// src/ripplesynth-waves.js
export function drawWaves(ctx, cx, cy, now, speed, ripples, NUM_STEPS, stepSeconds){
  if (!ripples) return;
  ctx.save();
  for (let i = ripples.length - 1; i >= 0; i--) {
    const rp = ripples[i];
    const r = Math.max(0, (now - rp.startTime) * speed);

    const cornerMax = Math.max(
      Math.hypot(cx - 0,                cy - 0),
      Math.hypot(cx - ctx.canvas.width, cy - 0),
      Math.hypot(cx - 0,                cy - ctx.canvas.height),
      Math.hypot(cx - ctx.canvas.width, cy - ctx.canvas.height)
    );
    if (r > cornerMax + 60){ ripples.splice(i,1); continue; }

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
    const tailW = 16, ambW = 10;

    strokeRing(r1 - tailW*0.5, tailW, 0.26);
    strokeRing(r1, 3.6, 1.0);
    {
      const loopDur = NUM_STEPS * stepSeconds();
      const prog = Math.max(0, (now - rp.startTime)) / Math.max(0.001, loopDur);
      const ang = (prog * Math.PI * 2) % (Math.PI * 2);
      ctx.save();
      ctx.lineCap = 'round';
      ctx.globalAlpha = 0.90;
      ctx.lineWidth = 4.6;
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(0.0001, r1), ang - 0.22, ang + 0.22);
      ctx.stroke();
      ctx.globalAlpha = 0.22;
      ctx.lineWidth = 10.0;
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(0.0001, r1), ang - 0.18, ang + 0.18);
      ctx.stroke();
      ctx.restore();
    }

    strokeRing(r2 - ambW*0.5, ambW, 0.12);
    strokeRing(r2, 1.6, 0.32);
    strokeRing(r3 - ambW*0.5, ambW, 0.12);
    strokeRing(r3, 1.6, 0.30);
  }
  ctx.restore();
}
