// src/ripplesynth-blocks.js
// Self-contained blocks renderer: includes a default drawBlock and guards optional helpers.

// --- helpers ---
function clamp01(x){ return x < 0 ? 0 : x > 1 ? 1 : x; }
function easeOutQuad(t){ t = clamp01(t); return 1 - (1 - t) * (1 - t); }
function lerp(a,b,t){ return a + (b - a) * t; }

// Default block renderer (used if no override is provided)
function drawBlockDefault(ctx, b, zoomed){
  ctx.fillStyle = '#ff9500';
  ctx.fillRect(b.x, b.y, b.w, b.h);
  // subtle border
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1;
  ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
  // simple highlight in zoom
  if (zoomed){
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 2;
    ctx.strokeRect(b.x + 2, b.y + 2, b.w - 4, b.h - 4);
  }
}

// Draw outward square ripples starting at block extents
function drawSquareRipples(ctx, b, now){
  const age = b.rippleAge ?? 999;
  const maxT = b.rippleMax ?? 0.9; // seconds
  if (age > maxT) return;

  const t = clamp01(age / maxT);
  const growth = 1 + easeOutQuad(t) * 1.8;  // how far beyond the extents
  const alpha = (1 - t) * 0.35;             // fade out
  const lw = lerp(2.0, 0.5, t);

  ctx.save();
  ctx.translate(b.x + b.w * 0.5, b.y + b.h * 0.5);
  ctx.strokeStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
  ctx.lineWidth = lw;

  const hw = (b.w * growth) * 0.5;
  const hh = (b.h * growth) * 0.5;
  ctx.strokeRect(-hw, -hh, hw * 2, hh * 2);
  ctx.restore();
}

// Gentle “buoy” motion with spring back to rest
function integrateBuoy(b, dt, pushX, pushY, motionScale){
  if (b.rx === undefined){ b.rx = b.x; b.ry = b.y; }
  if (b.vx === undefined){ b.vx = 0; b.vy = 0; }

  const k = 18, d = 6, m = 1;
  const fx = (pushX * motionScale) - k * (b.x - b.rx) - d * b.vx;
  const fy = (pushY * motionScale) - k * (b.y - b.ry) - d * b.vy;

  b.vx += (fx / m) * dt;
  b.vy += (fy / m) * dt;
  b.x  += b.vx * dt;
  b.y  += b.vy * dt;
}

// Lightweight radial push field from ripples
function sampleRipplePush(ripples, px, py, cx, cy, now){
  if (!Array.isArray(ripples) || ripples.length === 0) return { x: 0, y: 0 };

  const r0 = ripples[0] || {};
  const ox = r0.x ?? cx, oy = r0.y ?? cy;

  let dx = px - ox, dy = py - oy;
  const dist = Math.hypot(dx, dy) || 1;
  dx /= dist; dy /= dist;

  const w = 2.2; // wavelength-ish
  const amp = 35;
  const phase = (dist * 0.02 - now * 1.2) * Math.PI * w;
  const s = Math.sin(phase) * Math.exp(-dist * 0.002);

  return { x: dx * amp * s, y: dy * amp * s };
}

/**
 * Draws and updates all blocks with gentle buoy motion and per-block square ripples.
 * If a custom drawBlock or drawNoteStripsAndLabel is provided it will be used; otherwise we fall back safely.
 */
export function drawBlocksSection(
  ctx, blocks, cx, cy, ripples,
  motionScale = 1.0,
  noteList = null,
  sizing = null,
  drawBlock = null,
  drawNoteStripsAndLabel = null,
  now = (performance.now ? performance.now() : Date.now())/1000
){
  if (!Array.isArray(blocks)) return;

  const zoomed = !!(sizing && sizing.scale > 1);
  const drawBlockSafe = (typeof drawBlock === 'function') ? drawBlock : drawBlockDefault;

  const dt = 1/60;
  for (let i=0; i<blocks.length; i++){
    const b = blocks[i];

    // Buoy push (disabled if ambient=false)
    if (!sizing || sizing.ambient !== false){
      const push = sampleRipplePush(ripples, b.x + b.w*0.5, b.y + b.h*0.5, cx, cy, now);
      integrateBuoy(b, dt, push.x, push.y, motionScale);
    }

    // Per-block ambient square ripple (disabled if ambient=false)
    b.rippleAge = (b.rippleAge ?? 999) + dt;
    if (!sizing || sizing.ambient !== false){
      if (b.rippleAge > (b.rippleMax ?? 0.9)){
        const pulse = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(0.7 * now + i * 1.7));
        if (Math.random() < 0.035 * pulse) b.rippleAge = 0;
      }
    }

    // Draw block
    drawBlockSafe(ctx, b, zoomed);

    // Draw outward square ripple
    drawSquareRipples(ctx, b, now);

    // Optional note strips/labels (guarded)
    if (zoomed && typeof drawNoteStripsAndLabel === 'function' && noteList && noteList.length){
      try {
        drawNoteStripsAndLabel(ctx, b, noteList[b.noteIndex % noteList.length]);
      } catch { /* optional */ }
    }
  }
}
