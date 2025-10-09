// src/tutorial-fx.js

let behindCanvas, frontCanvas;
let behindCtx, frontCtx;
let animationFrameId = null;
let particles = [];
const PARTICLES_PER_SEC = 60;

function setupCanvases(behind, front) {
  behindCanvas = behind;
  frontCanvas = front;
  if (behindCanvas) behindCtx = behindCanvas.getContext('2d');
  if (frontCanvas) frontCtx = frontCanvas.getContext('2d');

  const resize = () => {
    const dpr = window.devicePixelRatio || 1;
    if (behindCanvas) {
      const rect = behindCanvas.getBoundingClientRect();
      behindCanvas.width = rect.width * dpr;
      behindCanvas.height = rect.height * dpr;
      behindCtx?.scale(dpr, dpr);
    }
    if (frontCanvas) {
      frontCanvas.width = window.innerWidth;
      frontCanvas.height = window.innerHeight;
    }
  };

  window.addEventListener('resize', resize, { passive: true });
  resize();
}

function createParticle(x, y, endPos) {
  return {
    x,
    y,
    startX: x,
    startY: y,
    endX: endPos.x,
    endY: endPos.y,
    progress: 0,
    speed: 0.005 + Math.random() * 0.001, // 75% slower than original
    amplitude: 10 + Math.random() * 22.5, // Increased wander
    frequency: 0.6 + Math.random() * 0.1,
    phase: Math.random() * Math.PI * 2,
    size: 1.5
  };
}

// Draw a subtle origin burst on the behind-canvas so particles appear to emerge from under the task row
function drawOriginParticles(ctx, originEl) {
  if (!ctx || !originEl) return;
  const r = originEl.getBoundingClientRect();
  const x = r.left + r.width * 0.1;
  const y = r.top + r.height * 0.5;
  // soft radial burst
  const grad = ctx.createRadialGradient(x, y, 0, x, y, 24);
  grad.addColorStop(0, 'rgba(120, 170, 255, 0.25)');
  grad.addColorStop(1, 'rgba(120, 170, 255, 0.00)');
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, 28, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function startFlight(ctx, startEl, endEl) {
    if (!ctx || !startEl || !endEl) {
        
/* << GPT:MASK_FRONT_CANVAS_OVER_PANEL START >> */
try {
  const gp = document.getElementById('tutorial-goals');
  if (gp && typeof frontCtx !== 'undefined' && frontCtx && typeof frontCanvas !== 'undefined' && frontCanvas) {
    const dpr = (window.devicePixelRatio || 1);
    const r = gp.getBoundingClientRect();
    frontCtx.save();
    frontCtx.globalCompositeOperation = 'destination-out';
    frontCtx.fillRect(
      Math.floor(r.left * dpr),
      Math.floor(r.top * dpr),
      Math.ceil(r.width * dpr),
      Math.ceil(r.height * dpr)
    );
    frontCtx.restore();
  }
} catch (e) { /* no-op */ }
/* << GPT:MASK_FRONT_CANVAS_OVER_PANEL END >> */

/* << GPT:MASK_FRONT_CANVAS_OVER_PANEL START >> */
try {
  const gp = document.getElementById('tutorial-goals');
  if (gp && typeof frontCtx !== 'undefined' && frontCtx && typeof frontCanvas !== 'undefined' && frontCanvas) {
    const dpr = (window.devicePixelRatio || 1);
    const r = gp.getBoundingClientRect();
    frontCtx.save();
    frontCtx.globalCompositeOperation = 'destination-out';
    frontCtx.fillRect(
      Math.floor(r.left * dpr),
      Math.floor(r.top * dpr),
      Math.ceil(r.width * dpr),
      Math.ceil(r.height * dpr)
    );
    frontCtx.restore();
  }
} catch (e) { /* no-op */ }
/* << GPT:MASK_FRONT_CANVAS_OVER_PANEL END >> */

/* << GPT:MASK_FRONT_CANVAS_OVER_PANEL START >> */
try {
  const gp = document.getElementById('tutorial-goals');
  if (gp && typeof frontCtx !== 'undefined' && frontCtx && typeof frontCanvas !== 'undefined' && frontCanvas) {
    const dpr = (window.devicePixelRatio || 1);
    const r = gp.getBoundingClientRect();
    frontCtx.save();
    frontCtx.globalCompositeOperation = 'destination-out';
    frontCtx.fillRect(
      Math.floor(r.left * dpr),
      Math.floor(r.top * dpr),
      Math.ceil(r.width * dpr),
      Math.ceil(r.height * dpr)
    );
    frontCtx.restore();
  }
} catch (e) { /* no-op */ }
/* << GPT:MASK_FRONT_CANVAS_OVER_PANEL END >> */

/* << GPT:MASK_ACTIVE_TASK_CARD START >> */
// Erase front-canvas where the rounded task card sits (CSS pixel coords)
try {
  if (frontCtx && frontCanvas) {
    // Find the active task, fall back to first task/row
    const active =
      document.querySelector('#tutorial-goals .goal-task.is-active') ||
      document.querySelector('#tutorial-goals .goal-row.is-active') ||
      document.querySelector('#tutorial-goals .goal-task') ||
      document.querySelector('#tutorial-goals .goal-row');

    // Helper: px extractor
    const px = (v) => {
      if (!v) return 0;
      const m = /([\d.]+)/.exec(v);
      return m ? parseFloat(m[1]) : 0;
    };

    // Pick the largest descendant with a rounded, non-transparent background
    const pickRoundedCard = (root) => {
      if (!root) return null;
      let best = null;
      const list = [root, ...root.querySelectorAll('*')];
      for (const el of list) {
        const cs = getComputedStyle(el);
        const br = Math.max(px(cs.borderTopLeftRadius), px(cs.borderRadius));
        const bg = cs.backgroundColor;
        if (br <= 2) continue;
        if (!bg || bg === 'transparent' || bg === 'rgba(0, 0, 0, 0)') continue;
        const r = el.getBoundingClientRect();
        const area = Math.max(1, r.width * r.height);
        if (!best || area > best.area) best = { el, r, br };
      }
      return best || { el: root, r: root.getBoundingClientRect(), br: 12 };
    };

    const card = pickRoundedCard(active);
    if (card) {
      const { r, br } = card;

      // Rounded rect path in CSS pixels
      const roundedRect = (ctx, x, y, w, h, rad) => {
        const rr = Math.max(0, Math.min(rad, Math.min(w, h) / 2));
        ctx.beginPath();
        ctx.moveTo(x + rr, y);
        ctx.arcTo(x + w, y,     x + w, y + h, rr);
        ctx.arcTo(x + w, y + h, x,     y + h, rr);
        ctx.arcTo(x,     y + h, x,     y,     rr);
        ctx.arcTo(x,     y,     x + w, y,     rr);
        ctx.closePath();
      };

      frontCtx.save();
      frontCtx.globalCompositeOperation = 'destination-out';
      roundedRect(frontCtx, r.left, r.top, r.width, r.height, br);
      frontCtx.fill();
      frontCtx.restore();
    }
  }
} catch (_) { /* noop */ }
/* << GPT:MASK_ACTIVE_TASK_CARD END >> */
animationFrameId = requestAnimationFrame(() => startFlight(ctx, startEl, endEl));
        return;
    }

    if (!startFlight._lastTs) startFlight._lastTs = performance.now();
    if (typeof startFlight._accum !== 'number') startFlight._accum = 0;

    const now = performance.now();
    const dt = Math.max(0, now - startFlight._lastTs) / 1000;
    startFlight._lastTs = now;

    const startRect = startEl.getBoundingClientRect();
    const endRect = endEl.getBoundingClientRect();
    const sx = startRect.left + startRect.width * 0.9;
    const sy = startRect.top + startRect.height * 0.5;
    const ex = endRect.left + endRect.width * 0.5;
    const ey = endRect.top + endRect.height * 0.5;

    startFlight._accum += PARTICLES_PER_SEC * dt;
    while (startFlight._accum >= 1) {
        particles.push(createParticle(sx, sy, { x: ex, y: ey }));
        startFlight._accum -= 1;
    }

    if(frontCanvas && frontCtx){
        frontCtx.clearRect(0, 0, frontCanvas.width, frontCanvas.height);
        frontCtx.save();
        frontCtx.globalCompositeOperation = 'lighter';
    }
    
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.progress = Math.min(1, p.progress + p.speed * (dt * 60));
        const t = p.progress;

        p.x = p.startX + (p.endX - p.startX) * t;
        p.y = p.startY + (p.endY - p.startY) * t + Math.sin(p.phase + t * Math.PI * 2 * p.frequency) * p.amplitude;

        if (p.progress >= 1) {
            particles.splice(i, 1);
            continue;
        }

        if(frontCtx){
            frontCtx.beginPath();
            frontCtx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            frontCtx.fillStyle = Math.random() > 0.98 ? 'rgba(150,200,255,0.9)' : 'rgba(70,120,220,0.8)';
            frontCtx.fill();
        }
    }

    
/* << GPT:ROUNDED_CARD_MASK START >> */
// Mask the front canvas exactly over the highlighted bevelled card (per-corner, CSS px)
try {
  if (typeof frontCtx !== 'undefined' && frontCtx && typeof frontCanvas !== 'undefined' && frontCanvas) {
    const active =
      document.querySelector('#tutorial-goals .goal-row.is-active, #tutorial-goals .goal-task.is-active') ||
      document.querySelector('#tutorial-goals .goal-row, #tutorial-goals .goal-task');
    if (active) {
      const r = active.getBoundingClientRect();
      const cs = getComputedStyle(active);
      const px = v => (v ? parseFloat(String(v).replace(/[^0-9.]/g, '')) || 0 : 0);
      const tl = px(cs.borderTopLeftRadius);
      const tr = px(cs.borderTopRightRadius);
      const br = px(cs.borderBottomRightRadius);
      const bl = px(cs.borderBottomLeftRadius);

      // Slight inset so we don't erase the border stroke itself
      const inset = 1;
      const x = r.left + inset;
      const y = r.top + inset;
      const w = Math.max(0, r.width  - inset * 2);
      const h = Math.max(0, r.height - inset * 2);

      const roundedPath = (ctx, x, y, w, h, tl, tr, br, bl) => {
        ctx.beginPath();
        ctx.moveTo(x + tl, y);
        ctx.lineTo(x + w - tr, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + tr);
        ctx.lineTo(x + w, y + h - br);
        ctx.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
        ctx.lineTo(x + bl, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - bl);
        ctx.lineTo(x, y + tl);
        ctx.quadraticCurveTo(x, y, x + tl, y);
        ctx.closePath();
      };

      frontCtx.save();
      frontCtx.globalCompositeOperation = 'destination-out';
      // Tiny feather to avoid hard seam
      frontCtx.shadowBlur = 1.5;
      frontCtx.shadowColor = 'rgba(0,0,0,0.25)';
      roundedPath(frontCtx, x, y, w, h, tl, tr, br, bl);
      frontCtx.fill();
      frontCtx.restore();
    }
  }
} catch (e) { /* no-op */ }
/* << GPT:ROUNDED_CARD_MASK END >> */

/* << GPT:ROUNDED_CARD_MASK_V3 START >> */
// Erase front-canvas exactly under the highlighted bevelled card (per-corner radii).
try {
  if (typeof frontCtx !== 'undefined' && frontCtx && typeof frontCanvas !== 'undefined' && frontCanvas) {
    const active =
      document.querySelector('#tutorial-goals .goal-row.is-active, #tutorial-goals .goal-task.is-active') ||
      document.querySelector('#tutorial-goals .goal-row, #tutorial-goals .goal-task');
    if (active) {
      // If the highlight/border is on a child, pick the largest rounded, non-transparent descendant
      const px = v => (v ? parseFloat(String(v).replace(/[^0-9.]/g, '')) || 0 : 0);
      const list = [active, ...active.querySelectorAll('*')];
      let best = null;
      for (const el of list) {
        const cs = getComputedStyle(el);
        const tl = Math.max(px(cs.borderTopLeftRadius),  px(cs.borderRadius));
        const tr = Math.max(px(cs.borderTopRightRadius), px(cs.borderRadius));
        const br = Math.max(px(cs.borderBottomRightRadius),px(cs.borderRadius));
        const bl = Math.max(px(cs.borderBottomLeftRadius), px(cs.borderRadius));
        const hasRadius = (tl || tr || br || bl) > 2;
        const bg = cs.backgroundColor;
        const hasBg = bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)';
        if (!hasRadius || !hasBg) continue;
        const r = el.getBoundingClientRect();
        const area = Math.max(1, r.width * r.height);
        if (!best || area > best.area) best = { r, tl, tr, br, bl, area };
      }
      const target = best || { r: active.getBoundingClientRect(), tl: 12, tr: 12, br: 12, bl: 12 };
      const { r, tl, tr, br, bl } = target;

      // Slight inset so we don't erase the border stroke itself
      const inset = 2;

      // Determine the coordinate units the context expects:
      // If the context is scaled (common dpr scaling), draw in CSS px (scale≈dpr).
      // Else convert CSS px -> device px using dpr.
      let unit = 1;
      try {
        const m = frontCtx.getTransform ? frontCtx.getTransform() : null;
        const scaleX = m ? m.a : 1;
        if (Math.abs(scaleX - 1) < 0.05) {
          // unscaled context -> use device px
          const dpr = (frontCanvas.clientWidth > 0) ? (frontCanvas.width / frontCanvas.clientWidth) : (window.devicePixelRatio || 1);
          unit = dpr;
        } else {
          // scaled context -> CSS px
          unit = 1;
        }
      } catch (_) { unit = 1; }

      const x = (r.left + inset) * unit;
      const y = (r.top  + inset) * unit;
      const w = Math.max(0, (r.width  - inset * 2) * unit);
      const h = Math.max(0, (r.height - inset * 2) * unit);

      const roundedPath = (ctx, x, y, w, h, tl, tr, br, bl) => {
        const _tl = Math.min(tl * unit, Math.min(w, h) / 2);
        const _tr = Math.min(tr * unit, Math.min(w, h) / 2);
        const _br = Math.min(br * unit, Math.min(w, h) / 2);
        const _bl = Math.min(bl * unit, Math.min(w, h) / 2);
        ctx.beginPath();
        ctx.moveTo(x + _tl, y);
        ctx.lineTo(x + w - _tr, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + _tr);
        ctx.lineTo(x + w, y + h - _br);
        ctx.quadraticCurveTo(x + w, y + h, x + w - _br, y + h);
        ctx.lineTo(x + _bl, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - _bl);
        ctx.lineTo(x, y + _tl);
        ctx.quadraticCurveTo(x, y, x + _tl, y);
        ctx.closePath();
      };

      frontCtx.save();
      frontCtx.globalCompositeOperation = 'destination-out';
      // Tiny feather to hide any seam
      frontCtx.shadowBlur = 1.5 * unit;
      frontCtx.shadowColor = 'rgba(0,0,0,0.25)';
      roundedPath(frontCtx, x, y, w, h, tl, tr, br, bl);
      frontCtx.fill();
      frontCtx.restore();
    }
  }
} catch (e) { /* no-op */ }
/* << GPT:ROUNDED_CARD_MASK_V3 END >> */
if(frontCtx) frontCtx.restore();

    animationFrameId = requestAnimationFrame(() => startFlight(ctx, startEl, endEl));
}


export function startParticleStream(originEl, targetEl) {
  const behind = document.querySelector('#tutorial-goals .goal-particles-behind');
  const front  = document.querySelector('.tutorial-particles-front');
  if (!behind || !front || !originEl || !targetEl) return;

  setupCanvases(behind, front);

  drawOriginParticles(behind.getContext('2d'), originEl);

  if (animationFrameId) cancelAnimationFrame(animationFrameId);
  particles = [];
  startFlight._lastTs = performance.now();
  startFlight._accum = 0;

  // Kick the animation
  animationFrameId = requestAnimationFrame(() => startFlight(front.getContext('2d'), originEl, targetEl));
}

export function stopParticleStream() {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  particles = [];
  startFlight._lastTs = undefined;
  startFlight._accum = 0;
  if (frontCanvas && frontCtx) {
    frontCtx.clearRect(0, 0, frontCanvas.width, frontCanvas.height);
  }
  if (behindCanvas && behindCtx) {
    behindCtx.clearRect(0, 0, behindCanvas.width, behindCanvas.height);
  }
}
