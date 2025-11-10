// src/particles/field-generic.js
// Generic background particle field derived from DrawGrid's particle backdrop.
// Keeps viewport behaviour in sync with DrawGrid by reusing the same particle
// viewport helper and honoring board zoom / overview state.
//
// API:
//   const field = createField({ canvas, viewport, pausedRef }, opts)
//   field.tick(dtSeconds)
//   field.pulse(intensity)
//   field.resize()
//   field.destroy()

import { createParticleViewport } from './particle-viewport.js';

function readZoom(viewport) {
  if (viewport && typeof viewport.getZoom === 'function') {
    const z = Number(viewport.getZoom());
    if (Number.isFinite(z) && z > 0) return z;
  }
  const fallback = Number(window.__boardScale);
  return Number.isFinite(fallback) && fallback > 0 ? fallback : 1;
}

function readOverview(viewport) {
  if (viewport && typeof viewport.isOverview === 'function') {
    try { return !!viewport.isOverview(); } catch { /* noop */ }
  }
  try {
    return document.documentElement.classList.contains('overview-outline');
  } catch {
    return false;
  }
}

export function createField({ canvas, viewport, pausedRef } = {}, opts = {}) {
  if (!canvas) throw new Error('createField requires a canvas reference');
  const ctx = canvas.getContext('2d', { alpha: true });

  const measure = () => {
    const rect = canvas.getBoundingClientRect?.();
    const w = Math.max(1, Math.round(rect?.width || canvas.clientWidth || canvas.width || 1));
    const h = Math.max(1, Math.round(rect?.height || canvas.clientHeight || canvas.height || 1));
    return { w, h };
  };

  // If an external viewport was provided (from Draw Toy, etc.), reuse it.
  const pv = viewport && viewport.map && typeof viewport.map.size === 'function'
    ? viewport
    : createParticleViewport(() => measure());

  const config = {
    density: opts.density ?? 0.0002,
    cap: opts.cap ?? 2200,
    stiffness: opts.stiffness ?? 18.0,
    damping: opts.damping ?? 0.16,
    noise: opts.noise ?? 0.1,
    kick: opts.kick ?? 20.0,
    kickDecay: opts.kickDecay ?? 7.0,
    sizePx: opts.sizePx ?? 1.8,
    minAlpha: opts.minAlpha ?? 0.25,
    maxAlpha: opts.maxAlpha ?? 0.85,
    lineAlpha: opts.lineAlpha ?? 0.1,
    drawMode: opts.drawMode ?? 'dots',
    linkDist: opts.linkDist ?? 42,
    strokeStyle: opts.strokeStyle ?? 'rgba(143,168,255,0.35)',
    fillStyle: opts.fillStyle ?? '#9fb7ff',
  };

  const state = {
    w: 1,
    h: 1,
    dpr: 1,
    particles: [],
    pulseEnergy: 0,
    lodScale: 1,
  };

  function makeRng(seed = 1337) {
    let s = (seed >>> 0) || 1;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 0xffffffff);
  }

  function rebuild() {
    const size = pv?.map?.size?.() || measure();
    const prevW = state.w;
    const prevH = state.h;
    state.w = Math.max(1, Math.round(size.w || 1));
    state.h = Math.max(1, Math.round(size.h || 1));
    state.dpr = window.devicePixelRatio && window.devicePixelRatio > 0 ? window.devicePixelRatio : 1;

    const pxW = Math.max(1, Math.round(state.w * state.dpr));
    const pxH = Math.max(1, Math.round(state.h * state.dpr));
    if (canvas.width !== pxW) canvas.width = pxW;
    if (canvas.height !== pxH) canvas.height = pxH;
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);

    const target = Math.min(
      Math.floor(state.w * state.h * config.density),
      config.cap,
    );

    if (state.particles.length) {
      for (let i = 0; i < state.particles.length; i++) {
        const p = state.particles[i];
        const u = prevW > 0 ? (p.x / prevW) : 0.5;
        const v = prevH > 0 ? (p.y / prevH) : 0.5;
        const clampedU = Math.min(Math.max(u, 0), 1);
        const clampedV = Math.min(Math.max(v, 0), 1);
        p.x = p.hx = clampedU * state.w;
        p.y = p.hy = clampedV * state.h;
      }
    }

    if (target === state.particles.length) return;

    if (target < state.particles.length) {
      state.particles.length = target;
    } else {
      const seed = Math.floor((state.w * 73856093) ^ (state.h * 19349663)) || 1;
      const rng = makeRng(seed);
      while (state.particles.length < target) {
        const x = rng() * state.w;
        const y = rng() * state.h;
        const a = rng();
        state.particles.push({ x, y, hx: x, hy: y, vx: 0, vy: 0, a });
      }
    }
  }

  function resize() {
    pv?.refreshSize?.({ snap: true });
    rebuild();
  }

  function maybeResizeFromLayout() {
    const rect = measure();
    if (rect.w !== state.w || rect.h !== state.h) {
      resize();
    }
  }

  function setLODFromView() {
    const zoom = readZoom(viewport);
    const inOverview = readOverview(viewport);
    const paused = pausedRef?.() ?? false;

    const zoomFactor = zoom < 0.6 ? 0.85 : 1.0;
    const overviewFactor = inOverview ? 0.85 : 1.0;
    const pauseFactor = paused ? 0.85 : 1.0;
    state.lodScale = overviewFactor * zoomFactor * pauseFactor;
  }

  function pulse(intensity = 0.6) {
    state.pulseEnergy = Math.min(2.0, state.pulseEnergy + Math.max(0, intensity));
  }

  function step(dt) {
    const k = config.stiffness;
    const c = config.damping;
    const hum = config.noise;
    const kick = state.pulseEnergy * config.kick;
    const cx = state.w * 0.5;
    const cy = state.h * 0.5;

    for (let i = 0; i < state.particles.length; i++) {
      const p = state.particles[i];

      const ax = (p.hx - p.x) * k;
      const ay = (p.hy - p.y) * k;

      p.a += 0.35 * dt;
      if (p.a > 1) p.a -= 1;
      const ang = p.a * Math.PI * 2;
      const nx = Math.cos(ang) * hum;
      const ny = Math.sin(ang) * hum;

      const rx = p.x - cx;
      const ry = p.y - cy;
      const rl = Math.hypot(rx, ry) || 1;
      const kx = (rx / rl) * kick;
      const ky = (ry / rl) * kick;

      p.vx += (ax - p.vx * c + nx - kx) * dt;
      p.vy += (ay - p.vy * c + ny - ky) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }

    if (state.pulseEnergy > 0) {
      state.pulseEnergy = Math.max(0, state.pulseEnergy - config.kickDecay * dt);
    }
  }

  function draw() {
    ctx.clearRect(0, 0, state.w, state.h);

    const zoom = readZoom(viewport) || 1;
    const deviceDotPx = Math.max(1, Math.round((config.sizePx ?? 1.8) * zoom * state.dpr));
    const radius = Math.max(0.5, deviceDotPx / state.dpr);
    if (config.drawMode === 'dots+links' && state.particles.length <= 1500) {
      ctx.globalAlpha = config.lineAlpha;
      ctx.strokeStyle = config.strokeStyle;
      ctx.lineWidth = Math.max(0.6, radius * 0.8);
      for (let i = 0; i < state.particles.length; i++) {
        const a = state.particles[i];
        for (let j = i + 1; j < state.particles.length; j++) {
          const b = state.particles[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          if (dx * dx + dy * dy < config.linkDist * config.linkDist) {
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }
    }

    ctx.fillStyle = config.fillStyle;
    for (let i = 0; i < state.particles.length; i++) {
      const p = state.particles[i];
      const alpha =
        config.minAlpha +
        (config.maxAlpha - config.minAlpha) *
          (0.5 + 0.5 * Math.sin(p.a * Math.PI * 2));
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function tick(dt = 1 / 60) {
    maybeResizeFromLayout();
    setLODFromView();
    step(dt);
    draw();
  }

  function destroy() {
    state.particles.length = 0;
    ctx.clearRect(0, 0, state.w, state.h);
  }

  resize();

  return { tick, pulse, resize, destroy, canvas, _state: state, _config: config };
}
