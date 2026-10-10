// Original anchor core, drawn in board space so it shares the graph camera.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const CORE_BASE_R_PX=12, CORE_PULSE_R_PX=18;
export function drawHeartbeatCore(ctx, local, nowSec, running, drawScale = 1, pulseBeat = 0, pulseBar = 0, corePulseActive = false) {
    if (!ctx) return;

    const idle = 0.5;
    const energy = clamp((running ? 0.52 : 0.28) + idle * 0.20 + pulseBeat * 0.25 + pulseBar * 0.48, 0, 2.6);
    const coreR = CORE_BASE_R_PX + energy * CORE_PULSE_R_PX;

    ctx.save();
    ctx.translate(local.x, local.y);
    ctx.scale(drawScale, drawScale);

    // Outer glow
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, coreR * 3.6);
    g.addColorStop(0.00, `rgba(255,255,255,${0.36 + 0.12 * energy})`);
    g.addColorStop(0.20, `rgba(90, 100, 255,${0.24 + 0.11 * energy})`);
    g.addColorStop(0.58, `rgba(120, 130, 255,${0.12 + 0.09 * energy})`);
    g.addColorStop(1.00, `rgba(0,0,0,0)`);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, coreR * 3.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore(); // for composite op

    ctx.globalCompositeOperation = 'source-over';

  // Central sparkle (keeps a “ball” presence)
  const pulseFactor = clamp(pulseBeat + pulseBar, 0, 2.0) / 2.0;
  const base = { r: 80, g: 60, b: 220 };
  const cyan = { r: 92, g: 178, b: 255 };
  const idlePulse = 0.5 + 0.5 * Math.sin(nowSec * 2.35 + pulseBeat * 1.5 + pulseBar * 1.1);
  const mix = corePulseActive
    ? (0.15 + 0.85 * clamp((idlePulse + pulseFactor) * 0.5, 0, 1))
    : 0.0;
  const sparkR = Math.floor(base.r + (cyan.r - base.r) * mix);
  const sparkG = Math.floor(base.g + (cyan.g - base.g) * mix);
  const sparkB = Math.floor(base.b + (cyan.b - base.b) * mix);
  const sparkA = corePulseActive ? (0.55 + 0.45 * mix) : 1.0;
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  // Solid base to avoid any "hole" look.
  ctx.fillStyle = `rgb(${base.r},${base.g},${base.b})`;
  ctx.beginPath();
  ctx.arc(0, 0, coreR * 0.62, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = corePulseActive
    ? `rgba(${sparkR},${sparkG},${sparkB},${sparkA.toFixed(3)})`
    : `rgb(${sparkR},${sparkG},${sparkB})`;
  ctx.beginPath();
  ctx.arc(0, 0, coreR * 0.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

    ctx.restore(); // for scale/translate
}
