// src/tutorial-fx.js

let behindCanvas, frontCanvas;
let behindCtx, frontCtx;
let animationFrameId = null;
let particles = [];
let desiredFrontLayer = 'front';
let activeCanvas = null;
let activeCtx = null;
let activeLayer = 'front';
let activeTargetEl = null;
let lastStreamKey = null;
let lastStartTs = 0;
let lastStopTs = 0;

/* << GPT:TASK_MASK_GLOBALS START >> */
// Rect in canvas CSS coords that should be “punched out” of the front canvas.
// This is aligned to the active goal-task that owns the origin element.
let activeTaskMaskRect = null;
// Keep track of which element started the current stream so we can recompute the mask on resize.
let activeOriginEl = null;
// Controls whether the current animation should continue spawning new particles.
let spawnParticles = false;
/* << GPT:TASK_MASK_GLOBALS END >> */

function removeHighlight(el) {
  if (!el || !el.classList) return;
  el.classList.remove('tutorial-pulse-target', 'tutorial-active-pulse', 'tutorial-addtoy-pulse', 'tutorial-flash');
}

function notifyGuideTaskTapped() {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent('guide:task-tapped'));
  } catch {
    // ignore
  }
}

function elKey(el) {
  if (!el) return 'null';
  if (el.id) return `#${el.id}`;
  return `${el.tagName}:${el.className}:${Math.round(el.getBoundingClientRect?.()?.left || 0)}:${Math.round(el.getBoundingClientRect?.()?.top || 0)}`;
}
const PARTICLES_PER_SEC = 60;
const BURST_COLOR_RGB = { r: 92, g: 178, b: 255 };
const burstColor = (alpha = 1) => `rgba(${BURST_COLOR_RGB.r}, ${BURST_COLOR_RGB.g}, ${BURST_COLOR_RGB.b}, ${alpha})`;

function recomputeActiveTaskMaskRect(front) {
  if (!front || !activeOriginEl) {
    activeTaskMaskRect = null;
    return;
  }

  const maskEl = activeOriginEl?.closest?.('.goal-task');
  if (!maskEl) {
    activeTaskMaskRect = null;
    return;
  }

  const canvasRect = front.getBoundingClientRect();
  const taskRect = maskEl.getBoundingClientRect();
  activeTaskMaskRect = {
    x: taskRect.left - canvasRect.left,
    y: taskRect.top  - canvasRect.top,
    w: taskRect.width,
    h: taskRect.height,
  };
}

function setupCanvases(behind, front) {
  behindCanvas = behind;
  frontCanvas = front;
  if (behindCanvas) behindCtx = behindCanvas.getContext('2d');
  if (frontCanvas) frontCtx = frontCanvas.getContext('2d');

  const resize = () => {
    const dpr = window.devicePixelRatio || 1;
    if (behindCanvas && behindCanvas.parentElement && behindCtx) {
      const rect = behindCanvas.parentElement.getBoundingClientRect();
      behindCanvas.width = rect.width * dpr;
      behindCanvas.height = rect.height * dpr;
      behindCanvas.style.width = `${rect.width}px`;
      behindCanvas.style.height = `${rect.height}px`;
      behindCtx.setTransform(1, 0, 0, 1, 0, 0);
      behindCtx.scale(dpr, dpr);
    }
    if (frontCanvas && frontCtx) {
      frontCanvas.width = window.innerWidth * dpr;
      frontCanvas.height = window.innerHeight * dpr;
      frontCanvas.style.width = `${window.innerWidth}px`;
      frontCanvas.style.height = `${window.innerHeight}px`;
      frontCtx.setTransform(1, 0, 0, 1, 0, 0);
      frontCtx.scale(dpr, dpr);
      recomputeActiveTaskMaskRect(frontCanvas);
    }
  };

  window.addEventListener('resize', resize, { passive: true });
  resize();
  applyFrontCanvasLayer(desiredFrontLayer);
}

function applyFrontCanvasLayer(mode = 'front') {
  desiredFrontLayer = mode;
  if (!frontCanvas) return;
  if (frontCanvas.dataset?.tutorialLayer) delete frontCanvas.dataset.tutorialLayer;
  if (mode === 'front') {
    try {
      frontCanvas.style.setProperty('z-index', '600', 'important');
    } catch {
      frontCanvas.style.zIndex = '600';
    }
  } else {
    try {
      frontCanvas.style.removeProperty('z-index');
    } catch {
      frontCanvas.style.zIndex = '';
    }
  }
}
function createParticle(x, y, endPos) {
  return {
    x,
    y,
    startX: x,
    startY: y,
    endX: endPos ? endPos.x : 0,
    endY: endPos ? endPos.y : 0,
    progress: 0,
    speed: 0.005 + Math.random() * 0.001,
    amplitude: 10 + Math.random() * 22.5,
    frequency: 0.6 + Math.random() * 0.1,
    phase: Math.random() * Math.PI * 2,
    size: 1.5 + Math.random() * 0.5,
    life: 1.0,
    isBurst: false,
    isTrail: false,
    isExplosion: false,
    isSun: false,
    isSweeper: false,
    vx: 0,
    vy: 0,
    orbitRadius: 0,
    orbitPhase: 0,
    orbitSpeed: 0,
  };
}

function getRectCenter(rect) {
  if (!rect) return { x: 0, y: 0 };
  return {
    x: rect.left + (rect.width * 0.5),
    y: rect.top + (rect.height * 0.5),
  };
}

function createBurst(x, y, endPos) {
  // Sun
  const sun = createParticle(x, y, endPos);
  sun.isSun = true;
  sun.isBurst = true; // Sun is part of the burst
  sun.size = 10.0;
  sun.speed = 0.012;
  sun.amplitude = 0;
  particles.push(sun);

  // 2 Orbiters
  for (let i = 0; i < 2; i++) {
    const p = createParticle(x, y, endPos);
    p.isBurst = true;
    p.isSun = false;
    p.speed = 0.012;
    p.orbitRadius = 36;
    p.orbitPhase = i * Math.PI; // Start on opposite sides
    p.orbitSpeed = 0.22 + Math.random() * 0.06;
    particles.push(p);
  }

  // 2 Sweepers
  for (let i = 0; i < 2; i++) {
    const p = createParticle(x, y, endPos);
    p.isBurst = true;
    p.isSweeper = true;
    p.speed = 0.006;
    p.size = 3.2;
    p.amplitude = 36;
    p.phase = i * Math.PI;
    p.frequency = 1;
    particles.push(p);
  }
}

function startFlight(ctx, canvas, startEl, endEl) {
    const isValidNode = (el) => {
      if (!el) return false;
      if (!el.isConnected) return false;
      const rects = el.getClientRects?.();
      return rects && rects.length > 0;
    };
    const nodesValid = isValidNode(startEl) && isValidNode(endEl);
    const canDrain = !nodesValid && particles.length > 0;
    if (!ctx || !canvas || (!nodesValid && !canDrain)) {
        stopParticleStream({ clearHighlight: true, targetEl: endEl || activeTargetEl || null });
        return;
    }
    if (!nodesValid) {
      spawnParticles = false;
      removeHighlight(endEl || activeTargetEl || null);
    }
    if (nodesValid && startEl.closest && startEl.closest('.goal-task.is-disabled')) {
      spawnParticles = false;
      removeHighlight(endEl || activeTargetEl || null);
    }

    if (!startFlight._lastTs) startFlight._lastTs = performance.now();
    if (typeof startFlight._accum !== 'number') startFlight._accum = 0;

    const now = performance.now();
    const shimmerPhase = now * 0.012;
    const dt = Math.max(0, now - startFlight._lastTs) / 1000;
    startFlight._lastTs = now;

    const canvasRect = canvas.getBoundingClientRect();

    let sx = 0, sy = 0, ex = 0, ey = 0;
    if (spawnParticles && nodesValid) {
      const startRect = startEl.getBoundingClientRect();
      const endRect = endEl.getBoundingClientRect();
      const startCenter = getRectCenter(startRect);
      const endCenter = getRectCenter(endRect);
      sx = startCenter.x - canvasRect.left;
      sy = startCenter.y - canvasRect.top;
      ex = endCenter.x - canvasRect.left;
      ey = endCenter.y - canvasRect.top;
      startFlight._accum += PARTICLES_PER_SEC * dt;
      while (startFlight._accum >= 1) {
          particles.push(createParticle(sx, sy, { x: ex, y: ey }));
          startFlight._accum -= 1;
      }
    }

    if (canvas && ctx) {
        const logicalW = canvasRect.width;
        const logicalH = canvasRect.height;
        if (window.__TUTORIAL_STREAM_DEBUG) {
            console.debug('[FX][stream] clear', {
                w: logicalW,
                h: logicalH,
                dpr: window.devicePixelRatio || 1,
            });
        }
        ctx.clearRect(0, 0, logicalW, logicalH);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
    }

    const sun = particles.find(p => p.isSun);
    if (sun) {
        sun.progress = Math.min(1, sun.progress + sun.speed * (dt * 60));
        sun.x = sun.startX + (sun.endX - sun.startX) * sun.progress;
        sun.y = sun.startY + (sun.endY - sun.startY) * sun.progress;

        // Sun's trail
        if (sun.progress < 1) {
            const trailP = createParticle(sun.x, sun.y, {});
            trailP.isTrail = true;
            trailP.life = 0.45;
            trailP.size = sun.size * 0.8;
            trailP.trailBaseSize = sun.size;
            particles.push(trailP);
        }
    }

    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];

        if (p.isBurst && !p.isSun && !p.isSweeper) { // Orbiter
            if (sun) {
                p.progress = sun.progress;
                const orbitAngle = p.orbitPhase + sun.progress * 20 * p.orbitSpeed;
                p.x = sun.x + Math.cos(orbitAngle) * p.orbitRadius;
                p.y = sun.y + Math.sin(orbitAngle) * p.orbitRadius;

                const trailP = createParticle(p.x, p.y, {});
                trailP.isTrail = true;
                trailP.life = 0.35;
                trailP.size = p.size * 0.7;
                trailP.trailBaseSize = p.size;
                particles.push(trailP);
            }
            if (p.progress >= 1) {
                particles.splice(i, 1);
                continue;
            }
        } else if (p.isSweeper) {
            if (sun) {
                p.progress = sun.progress;
                const sweepOffset = Math.sin(p.phase + sun.progress * 7 * p.frequency) * p.amplitude;
                const dx = sun.endX - sun.startX;
                const dy = sun.endY - sun.startY;
                const len = Math.sqrt(dx*dx + dy*dy) || 1;
                const pdx = -dy / len;
                const pdy = dx / len;
                p.x = sun.x + pdx * sweepOffset;
                p.y = sun.y + pdy * sweepOffset;

                // Sweeper trail
                const trailP = createParticle(p.x, p.y, {});
                trailP.isTrail = true;
                trailP.life = 0.45;
                trailP.size = p.size * 0.85;
                trailP.trailBaseSize = p.size;
                particles.push(trailP);
            }
            if (p.progress >= 1) {
                particles.splice(i, 1);
                continue;
            }
        } else if (p.isSun) {
            if (p.progress >= 1) {
                particles.splice(i, 1);
                continue;
            }
        } else if (p.isTrail) {
            p.life -= dt * 1.5;
            p.size *= 0.98;
            if (p.life <= 0) {
                particles.splice(i, 1);
                continue;
            }
        } else { // Regular stream
            p.progress = Math.min(1, p.progress + p.speed * (dt * 60));
            const t = p.progress;
            p.x = p.startX + (p.endX - p.startX) * t;
            p.y = p.startY + (p.endY - p.startY) * t + Math.sin(p.phase + t * Math.PI * 2 * p.frequency) * p.amplitude;

            if (p.progress >= 1) {
                particles.splice(i, 1);
                continue;
            }
        }

        if(ctx){
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            let fillAlpha = 0.85;
            let trailHighlightAlpha = null;
            if (p.isSun || (p.isBurst && !p.isSun && !p.isSweeper)) {
              const phaseOffset = (p.orbitPhase ?? p.phase ?? 0) * 0.8;
              const shimmer = Math.sin(shimmerPhase + phaseOffset);
              fillAlpha = Math.min(1, Math.max(0.45, 0.75 + 0.25 * shimmer));
            } else if (p.isTrail) {
              const opacity = Math.max(0, Math.min(1, 0.8 * p.life + 0.2));
              fillAlpha = opacity;
              trailHighlightAlpha = Math.min(1, opacity + 0.2);
            } else if (p.isSweeper) {
              fillAlpha = 0.78;
            }

            ctx.fillStyle = burstColor(fillAlpha);
            ctx.fill();

            if (p.isTrail && p.trailBaseSize) {
              ctx.beginPath();
              ctx.arc(p.x, p.y, Math.max(0.6, p.trailBaseSize * 0.12), 0, Math.PI * 2);
              ctx.fillStyle = burstColor(trailHighlightAlpha ?? fillAlpha);
              ctx.fill();
            }
        }
    }

    if (canvas === frontCanvas && activeLayer === 'behind' && activeTargetEl) {
        const rect = activeTargetEl.getBoundingClientRect();
        const canvasRect = canvas.getBoundingClientRect();
        const padding = 16;
        ctx.save();
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath();
        ctx.rect(
          rect.left - canvasRect.left - padding,
          rect.top - canvasRect.top - padding,
          rect.width + padding * 2,
          rect.height + padding * 2
        );
        ctx.fill();
        ctx.restore();
    }

    /* << GPT:TASK_MASK_APPLY START >> */
    // If we are drawing on the front canvas and have a valid task mask rect,
    // punch that area out so the stream never draws over the Task panel.
    if (canvas === frontCanvas && activeTaskMaskRect && ctx) {
      const r = activeTaskMaskRect;
      ctx.save();
      ctx.clearRect(r.x, r.y, r.w, r.h);
      ctx.restore();
    }
    /* << GPT:TASK_MASK_APPLY END >> */

    if(ctx) ctx.restore();

    const shouldContinueAnimating = spawnParticles || particles.length > 0;
    if (shouldContinueAnimating) {
        animationFrameId = requestAnimationFrame(() => startFlight(ctx, canvas, startEl, endEl));
    } else {
        animationFrameId = null;
        activeCtx = null;
        activeCanvas = null;
        activeLayer = 'front';
        activeTargetEl = null;
        activeTaskMaskRect = null;
        activeOriginEl = null;
    }
}


export function startParticleStream(originEl, targetEl, options = {}) {
  const layer = options?.layer === 'behind-target' ? 'behind-target' : 'front';
  console.debug('[tutorial-fx] resolved layer', {
    layer,
    originClass: originEl?.className,
    targetClass: targetEl?.className,
  });
  const oRect = originEl?.getBoundingClientRect?.();
  const tRect = targetEl?.getBoundingClientRect?.();
  console.debug('[DIAG] startParticleStream', {
    t: performance?.now?.(),
    layer,
    origin: oRect ? { x: oRect.left, y: oRect.top, w: oRect.width, h: oRect.height } : null,
    target: tRect ? { x: tRect.left, y: tRect.top, w: tRect.width, h: tRect.height } : null,
    lastPointerup: window.__LAST_POINTERUP_DIAG__,
  });
  const isValidNode = (el) => {
    if (!el) return false;
    if (!el.isConnected) return false;
    const rects = el.getClientRects?.();
    return rects && rects.length > 0;
  };
  if (!originEl || !targetEl || !isValidNode(originEl) || !isValidNode(targetEl)) {
    console.log('[tutorial-fx] startParticleStream skipped: origin or target missing', { originElExists: !!originEl, targetElExists: !!targetEl });
    activeTaskMaskRect = null;
    activeOriginEl = null;
    return;
  }
  if (originEl.closest && originEl.closest('.goal-task.is-disabled')) {
    console.log('[tutorial-fx] startParticleStream skipped: origin task is disabled');
    removeHighlight(targetEl);
    return;
  }

  notifyGuideTaskTapped();

  const newKey = `o=${elKey(originEl)}->t=${elKey(targetEl)}:L=${layer}`;
  const prevKey = lastStreamKey;
  let forceReset = !prevKey || (prevKey && newKey !== prevKey);
  const now = performance?.now?.() ?? Date.now();

  if (newKey === prevKey && (now - lastStopTs) < 200) {
    console.debug('[FX] startParticleStream deduped (recent stop; continuing)', { key: newKey });
    const nextLayer = layer === 'behind-target' ? 'behind' : 'front';
    applyFrontCanvasLayer(layer === 'behind-target' ? 'behind-target' : 'front');
    activeLayer = nextLayer;
    if (!activeCtx || !activeCanvas) {
      if (frontCtx && frontCanvas) {
        activeCtx = frontCtx;
        activeCanvas = frontCanvas;
      }
    }
    activeOriginEl = originEl;
    recomputeActiveTaskMaskRect(frontCanvas);
    spawnParticles = true;
    activeTargetEl = nextLayer === 'behind' ? targetEl : null;
    if (!animationFrameId && activeCtx && activeCanvas) {
      animationFrameId = requestAnimationFrame(() => startFlight(activeCtx, activeCanvas, originEl, targetEl));
    }
    lastStreamKey = newKey;
    lastStartTs = now;
    return;
  }

  if (!animationFrameId) {
    forceReset = true;
  }

  const panel = originEl.closest('.guide-goals-panel, .tutorial-goals-panel, #tutorial-goals');
  const behind = panel ? panel.querySelector('.goal-particles-behind') : null;
  const front  = document.querySelector('.tutorial-particles-front');
  if (!behind || !front) {
    console.log('[tutorial-fx] startParticleStream skipped: canvas missing', { hasPanel: !!panel, hasBehind: !!behind, hasFront: !!front });
    activeTaskMaskRect = null;
    activeOriginEl = null;
    return;
  }

  lastStreamKey = newKey;
  lastStartTs = now;
  if (forceReset) {
    particles = [];
    startFlight._lastTs = undefined;
    startFlight._accum = 0;
  }

  // Remember which element we’re masking around for this stream.
  activeOriginEl = originEl;

  /* << GPT:TASK_MASK_CAPTURE START >> */
  // Capture the rect of the goal-task that owns the origin element.
  // We store it in canvas coordinates so we can clear it later as a mask.
  recomputeActiveTaskMaskRect(front);
  /* << GPT:TASK_MASK_CAPTURE END >> */

  setupCanvases(behind, front);
  applyFrontCanvasLayer(layer);

  if (animationFrameId) cancelAnimationFrame(animationFrameId);
  startFlight._lastTs = performance?.now?.() ?? Date.now();
  startFlight._accum = 0;

  const startRect = originEl.getBoundingClientRect();
  const endRect = targetEl.getBoundingClientRect();
  console.log('[tutorial-fx] startParticleStream kicking off', {
    originClass: originEl.className,
    targetClass: targetEl.className,
    startRect: { left: startRect.left, top: startRect.top, width: startRect.width, height: startRect.height },
    endRect: { left: endRect.left, top: endRect.top, width: endRect.width, height: endRect.height },
  });

  const drawCtx = frontCtx;
  const drawCanvas = frontCanvas;
  if (!drawCtx || !drawCanvas) {
    console.log('[tutorial-fx] startParticleStream skipped: no drawing context for layer', { layer });
    activeTaskMaskRect = null;
    activeOriginEl = null;
    return;
  }

  const canvasRect = drawCanvas.getBoundingClientRect();
  const startCenter = getRectCenter(startRect);
  const endCenter = getRectCenter(endRect);
  const sx = startCenter.x - canvasRect.left;
  const sy = startCenter.y - canvasRect.top;
  const ex = endCenter.x - canvasRect.left;
  const ey = endCenter.y - canvasRect.top;

  console.debug('[tutorial-fx] create stream', {
    type: 'burst',
    key: newKey,
    start: { x: sx, y: sy },
    end: { x: ex, y: ey },
  });
  createBurst(sx, sy, { x: ex, y: ey });
  console.debug('[tutorial-fx] create stream', {
    type: 'trail',
    key: newKey,
    rate: PARTICLES_PER_SEC,
  });
  spawnParticles = true;
  activeLayer = layer === 'behind-target' ? 'behind' : 'front';
  activeCtx = drawCtx;
  activeCanvas = drawCanvas;
  activeTargetEl = layer === 'behind-target' ? targetEl : null;
  if (forceReset) {
    if (layer === 'behind-target' && frontCanvas && frontCtx) {
      const rect = frontCanvas.getBoundingClientRect();
      frontCtx.clearRect(0, 0, rect.width, rect.height);
    }
    if (layer === 'front' && behindCanvas && behindCtx) {
      const rect = behindCanvas.getBoundingClientRect();
      behindCtx.clearRect(0, 0, rect.width, rect.height);
    }
  }

  // Kick the animation
  animationFrameId = requestAnimationFrame(() => startFlight(drawCtx, drawCanvas, originEl, targetEl));
}

export function stopParticleStream(options = {}) {
  console.debug('[DIAG] stopParticleStream', {
    t: performance?.now?.(),
    lastPointerup: window.__LAST_POINTERUP_DIAG__,
  });
  console.debug('[tutorial-fx] stopParticleStream invoked', {
    t: performance?.now?.(),
    activeCount: particles?.length || 0,
    lastStreamKey,
    immediate: options?.immediate ?? false,
    clearHighlight: options?.clearHighlight ?? false,
  });
  lastStopTs = performance?.now?.() ?? Date.now();

  const { immediate = false, clearHighlight = false, targetEl = null } = options || {};
  if (clearHighlight) {
    removeHighlight(targetEl || activeTargetEl || activeOriginEl);
  }

  spawnParticles = false;
  startFlight._lastTs = undefined;
  startFlight._accum = 0;
  if (!immediate && !animationFrameId && activeCtx && activeCanvas && particles.length > 0) {
    animationFrameId = requestAnimationFrame(() => startFlight(activeCtx, activeCanvas, activeOriginEl, targetEl || activeTargetEl || activeOriginEl));
  }

  if (immediate) {
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    particles = [];
    if (frontCtx && frontCanvas) {
      const rect = frontCanvas.getBoundingClientRect();
      frontCtx.clearRect(0, 0, rect.width, rect.height);
    }
    if (behindCtx && behindCanvas) {
      const rect = behindCanvas.getBoundingClientRect();
      behindCtx.clearRect(0, 0, rect.width, rect.height);
    }
    console.debug('[tutorial-fx] destroy stream (immediate)', {
      key: lastStreamKey,
      remaining: particles.length,
    });
    activeTaskMaskRect = null;
    activeOriginEl = null;
    activeTargetEl = null;
    activeCtx = null;
    activeCanvas = null;
    activeLayer = 'front';
    return;
  }

  if (!particles.length && animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
    activeCtx = null;
    activeCanvas = null;
    activeTaskMaskRect = null;
    activeOriginEl = null;
    console.debug('[tutorial-fx] destroy stream (drain)', {
      key: lastStreamKey,
      remaining: particles.length,
    });
  }
}

if (typeof window !== 'undefined') {
  const clearParticlesOnSceneReset = () => stopParticleStream({ immediate: true });
  window.addEventListener('scene:new', clearParticlesOnSceneReset);
  window.addEventListener('guide:close', clearParticlesOnSceneReset);
}

