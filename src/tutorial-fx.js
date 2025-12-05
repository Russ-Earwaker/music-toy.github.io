// src/tutorial-fx.js
import { makeDebugLogger } from './debug-flags.js';

const fxDebug = makeDebugLogger('mt_debug_logs');

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
let fallbackPanel = null;
let autoStopTimer = null;

/* << GPT:TASK_MASK_GLOBALS START >> */
// Rect in canvas CSS coords that should be “punched out” of the front canvas.
// This is aligned to the active goal-task that owns the origin element.
let activeTaskMaskRect = null;
// Keep track of which element started the current stream so we can recompute the mask on resize.
let activeOriginEl = null;
// Controls whether the current animation should continue spawning new particles.
let spawnParticles = false;
// Cached path for the active stream (canvas coordinates)
let activeStreamStart = null;
let activeStreamEnd = null;
/* << GPT:TASK_MASK_GLOBALS END >> */

function ensureFrontCanvas() {
  if (typeof document === 'undefined') return null;
  let front = document.querySelector('.tutorial-particles-front');
  if (front && front.isConnected) return front;
  front = document.createElement('canvas');
  front.className = 'tutorial-particles-front';
  Object.assign(front.style, {
    position: 'fixed',
    inset: '0',
    pointerEvents: 'none',
    zIndex: '6000',
  });
  document.body.appendChild(front);
  return front;
}

function ensurePanelBehindCanvas(panel) {
  if (!panel || typeof document === 'undefined') return null;
  let behind = panel.querySelector('.goal-particles-behind');
  if (behind && behind.isConnected) return behind;
  behind = document.createElement('canvas');
  behind.className = 'goal-particles-behind';
  Object.assign(behind.style, {
    position: 'absolute',
    inset: '0',
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    zIndex: '590',
  });
  panel.appendChild(behind);
  return behind;
}

function ensureFallbackPanel() {
  if (fallbackPanel && fallbackPanel.isConnected) return fallbackPanel;
  if (typeof document === 'undefined') return null;
  const host = document.createElement('div');
  host.className = 'tutorial-fx-fallback-panel';
  Object.assign(host.style, {
    position: 'fixed',
    inset: '0',
    pointerEvents: 'none',
    zIndex: '580',
  });
  const canvas = document.createElement('canvas');
  canvas.className = 'goal-particles-behind';
  Object.assign(canvas.style, {
    position: 'absolute',
    inset: '0',
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    zIndex: '590',
  });
  host.appendChild(canvas);
  document.body.appendChild(host);
  fallbackPanel = host;
  return fallbackPanel;
}

function resolveParticleSurfaces(originEl) {
  const panel = originEl?.closest?.('.guide-goals-panel, .tutorial-goals-panel, #tutorial-goals') || null;
  const panelBehind = panel ? ensurePanelBehindCanvas(panel) : null;
  const fallback = (!panel || !panelBehind) ? ensureFallbackPanel() : null;
  const behind = panelBehind || fallback?.querySelector?.('.goal-particles-behind') || null;
  const front = ensureFrontCanvas();
  return { panel: panel || fallback, behind, front };
}

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
    // If we lose the canvas/context entirely, bail and clear highlights.
    if (!ctx || !canvas) {
        stopParticleStream({ clearHighlight: true, targetEl: endEl || activeTargetEl || null });
        return;
    }

    // Only gate on disabled tasks for the origin element.
    if (startEl && startEl.closest && startEl.closest('.goal-task.is-disabled')) {
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

    const maybeUpdateStreamEndpoints = () => {
      if (!canvasRect) return;
      // Recompute origin (goal task) in canvas coords
      if (activeOriginEl && activeOriginEl.isConnected) {
        const rect = activeOriginEl.getBoundingClientRect();
        const center = getRectCenter(rect);
        activeStreamStart = {
          x: center.x - canvasRect.left,
          y: center.y - canvasRect.top,
        };
      }
      // Recompute target (highlighted button) in canvas coords
      const targetEl = (endEl && endEl.isConnected) ? endEl : (activeTargetEl && activeTargetEl.isConnected ? activeTargetEl : null);
      if (targetEl) {
        const rect = targetEl.getBoundingClientRect();
        const center = getRectCenter(rect);
        activeStreamEnd = {
          x: center.x - canvasRect.left,
          y: center.y - canvasRect.top,
        };
      }
    };
    maybeUpdateStreamEndpoints();

    let sx = 0, sy = 0, ex = 0, ey = 0;
    if (spawnParticles && activeStreamStart && activeStreamEnd) {
      sx = activeStreamStart.x;
      sy = activeStreamStart.y;
      ex = activeStreamEnd.x;
      ey = activeStreamEnd.y;

      startFlight._accum += PARTICLES_PER_SEC * dt;

      let spawnedThisFrame = 0;
      while (startFlight._accum >= 1) {
          particles.push(createParticle(sx, sy, { x: ex, y: ey }));
          startFlight._accum -= 1;
          spawnedThisFrame++;
      }

      if (window.__TUTORIAL_STREAM_DEBUG) {
        fxDebug('[FX][stream] spawn', {
          dt,
          accum: startFlight._accum,
          spawnedThisFrame,
          totalParticles: particles.length,
          sx,
          sy,
          ex,
          ey,
        });
      }
    } else if (window.__TUTORIAL_STREAM_DEBUG) {
      fxDebug('[FX][stream] no spawn', {
        hasPath: !!(activeStreamStart && activeStreamEnd),
        spawnParticles,
        particles: particles.length,
      });
    }

    if (canvas && ctx) {
        const logicalW = canvasRect.width;
        const logicalH = canvasRect.height;
        if (window.__TUTORIAL_STREAM_DEBUG) {
            fxDebug('[FX][stream] clear', {
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
        if (window.__TUTORIAL_STREAM_DEBUG) {
          fxDebug('[FX][stream] end', {
            particles: particles.length,
          });
        }
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
  const durationMs = Number.isFinite(options?.durationMs) ? Math.max(0, options.durationMs) : null;
  const skipBurst = options?.skipBurst === true;
  const suppressGuideTapAck = options?.suppressGuideTapAck === true;
  fxDebug('[tutorial-fx] resolved layer', {
    layer,
    originClass: originEl?.className,
    targetClass: targetEl?.className,
  });
  const oRect = originEl?.getBoundingClientRect?.();
  const tRect = targetEl?.getBoundingClientRect?.();
  fxDebug('[DIAG] startParticleStream', {
    t: performance?.now?.(),
    layer,
    origin: oRect ? { x: oRect.left, y: oRect.top, w: oRect.width, h: oRect.height } : null,
    target: tRect ? { x: tRect.left, y: tRect.top, w: tRect.width, h: tRect.height } : null,
    lastPointerup: window.__LAST_POINTERUP_DIAG__,
  });
  const diagnoseNode = (el, rect) => {
    if (!el) return { valid: false, reason: 'missing' };
    if (!el.isConnected) return { valid: false, reason: 'disconnected' };

    const rects = el.getClientRects?.();
    const rectsCount = rects?.length ?? null;
    const firstRect = rects && rects.length > 0 ? rects[0] : null;
    const style = (() => {
      try {
        const cs = getComputedStyle(el);
        return {
          display: cs.display,
          visibility: cs.visibility,
          opacity: cs.opacity,
          pointerEvents: cs.pointerEvents,
        };
      } catch {
        return null;
      }
    })();

    if (rects && rects.length > 0) {
      return {
        valid: true,
        reason: 'client rects',
        rectsCount,
        firstRect: firstRect ? {
          left: firstRect.left,
          top: firstRect.top,
          width: firstRect.width,
          height: firstRect.height,
        } : null,
        boundingRect: rect ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height } : null,
        offset: { w: el.offsetWidth, h: el.offsetHeight },
        client: { w: el.clientWidth, h: el.clientHeight },
        style,
        tag: el.tagName,
        id: el.id || null,
        className: el.className || null,
      };
    }

    if (rect && typeof rect.width === 'number' && typeof rect.height === 'number' && rect.width > 0 && rect.height > 0) {
      return {
        valid: true,
        reason: 'bounding rect fallback',
        rectsCount,
        firstRect: firstRect ? {
          left: firstRect.left,
          top: firstRect.top,
          width: firstRect.width,
          height: firstRect.height,
        } : null,
        boundingRect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
        offset: { w: el.offsetWidth, h: el.offsetHeight },
        client: { w: el.clientWidth, h: el.clientHeight },
        style,
        tag: el.tagName,
        id: el.id || null,
        className: el.className || null,
      };
    }

    return {
      valid: false,
      reason: 'no rects and no size',
      rectsCount,
      firstRect: firstRect ? {
        left: firstRect.left,
        top: firstRect.top,
        width: firstRect.width,
        height: firstRect.height,
      } : null,
      boundingRect: rect ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height } : null,
      offset: { w: el.offsetWidth, h: el.offsetHeight },
      client: { w: el.clientWidth, h: el.clientHeight },
      style,
      tag: el.tagName,
      id: el.id || null,
      className: el.className || null,
    };
  };

  const originDiag = diagnoseNode(originEl, oRect);
  const targetDiag = diagnoseNode(targetEl, tRect);
  const originValid = originDiag.valid;
  const targetValid = targetDiag.valid;

  const diagSummary = (d) => ({
    valid: d?.valid,
    reason: d?.reason,
    rectsCount: d?.rectsCount,
    firstRect: d?.firstRect,
    boundingRect: d?.boundingRect,
    offset: d?.offset,
    client: d?.client,
    style: d?.style,
    tag: d?.tag,
    id: d?.id,
    className: d?.className,
  });

  if (!originEl || !targetEl || !originValid || !targetValid) {
    console.log('[tutorial-fx] startParticleStream skipped: origin or target invalid', {
      originElExists: !!originEl,
      targetElExists: !!targetEl,
      originValid,
      targetValid,
      originDiag,
      targetDiag,
      originSummary: diagSummary(originDiag),
      targetSummary: diagSummary(targetDiag),
    });
    activeTaskMaskRect = null;
    activeOriginEl = null;
    return;
  }
  if (originEl.closest && originEl.closest('.goal-task.is-disabled')) {
    console.log('[tutorial-fx] startParticleStream skipped: origin task is disabled');
    removeHighlight(targetEl);
    return;
  }

  if (autoStopTimer) {
    clearTimeout(autoStopTimer);
    autoStopTimer = null;
  }

  if (!suppressGuideTapAck) {
    notifyGuideTaskTapped();
  }

  const newKey = `o=${elKey(originEl)}->t=${elKey(targetEl)}:L=${layer}`;
  const prevKey = lastStreamKey;
  let forceReset = !prevKey || (prevKey && newKey !== prevKey);
  const now = performance?.now?.() ?? Date.now();

  if (newKey === prevKey && (now - lastStopTs) < 200) {
    fxDebug('[FX] startParticleStream deduped (recent stop; continuing)', { key: newKey });
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
    if (durationMs) {
      autoStopTimer = setTimeout(() => {
        autoStopTimer = null;
        stopParticleStream({ immediate: false, targetEl });
      }, durationMs);
    }
    return;
  }

  if (!animationFrameId) {
    forceReset = true;
  }

  const { panel, behind, front } = resolveParticleSurfaces(originEl);
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

  // Cache the path for the continuous trail so we don't depend on live DOM each frame.
  activeStreamStart = { x: sx, y: sy };
  activeStreamEnd = { x: ex, y: ey };

  fxDebug('[tutorial-fx] create stream', {
    type: 'burst',
    key: newKey,
    start: { x: sx, y: sy },
    end: { x: ex, y: ey },
  });
  if (!skipBurst) {
    createBurst(sx, sy, { x: ex, y: ey });
  }
  fxDebug('[tutorial-fx] create stream', {
    type: 'trail',
    key: newKey,
    rate: PARTICLES_PER_SEC,
  });
  spawnParticles = true;
  activeLayer = layer === 'behind-target' ? 'behind' : 'front';
  activeCtx = drawCtx;
  activeCanvas = drawCanvas;
  activeTargetEl = targetEl;
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

  if (durationMs) {
    autoStopTimer = setTimeout(() => {
      autoStopTimer = null;
      stopParticleStream({ immediate: false, targetEl });
    }, durationMs);
  }

  // Kick the animation
  animationFrameId = requestAnimationFrame(() => startFlight(drawCtx, drawCanvas, originEl, targetEl));
}

export function stopParticleStream(options = {}) {
  fxDebug('[DIAG] stopParticleStream', {
    t: performance?.now?.(),
    lastPointerup: window.__LAST_POINTERUP_DIAG__,
  });
  fxDebug('[tutorial-fx] stopParticleStream invoked', {
    t: performance?.now?.(),
    activeCount: particles?.length || 0,
    lastStreamKey,
    immediate: options?.immediate ?? false,
    clearHighlight: options?.clearHighlight ?? false,
  });
  lastStopTs = performance?.now?.() ?? Date.now();

  if (autoStopTimer) {
    clearTimeout(autoStopTimer);
    autoStopTimer = null;
  }

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
    fxDebug('[tutorial-fx] destroy stream (immediate)', {
      key: lastStreamKey,
      remaining: particles.length,
    });
    activeTaskMaskRect = null;
    activeOriginEl = null;
    activeTargetEl = null;
    activeCtx = null;
    activeCanvas = null;
    activeLayer = 'front';
    activeStreamStart = null;
    activeStreamEnd = null;
    return;
  }

  if (!particles.length && animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
    activeCtx = null;
    activeCanvas = null;
    activeTaskMaskRect = null;
    activeOriginEl = null;
    activeStreamStart = null;
    activeStreamEnd = null;
    fxDebug('[tutorial-fx] destroy stream (drain)', {
      key: lastStreamKey,
      remaining: particles.length,
    });
  }
}

if (typeof window !== 'undefined') {
  const stopOnGoalChange = () => stopParticleStream({ immediate: false, clearHighlight: true });
  window.addEventListener('guide:active-goal-change', stopOnGoalChange);
  const clearParticlesOnSceneReset = () => stopParticleStream({ immediate: true, clearHighlight: true });
  window.addEventListener('scene:new', clearParticlesOnSceneReset);
  window.addEventListener('guide:close', clearParticlesOnSceneReset);
}

