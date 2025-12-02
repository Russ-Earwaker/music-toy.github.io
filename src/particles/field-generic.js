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
import {
  BASE_RADIUS_PX,
  RNG_SEED_PER_TOY,
  computeParticleLayout,
  particleRadiusPx,
  screenRadiusToWorld,
  seededRandomFactory,
} from './particle-density.js';
import { makeDebugLogger } from '../debug-flags.js';

const fieldLog = makeDebugLogger('mt_debug_logs', 'log');

// Color stops for particles as they fade back home after a poke.
// Sequence: bright cyan punch -> pink -> clean white settle.
export const PARTICLE_RETURN_GRADIENT = Object.freeze([
  { stop: 0.0, rgb: [51, 153, 255] },   // Bright cyan blue at impact
  { stop: 0.55, rgb: [255, 255, 255] }, // Pink mid fade
  { stop: 1.0, rgb: [255, 108, 196] },  // White as it settles
]);

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function sampleReturnGradient(t) {
  const stops = PARTICLE_RETURN_GRADIENT;
  const clamped = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0));
  for (let i = 1; i < stops.length; i++) {
    const prev = stops[i - 1];
    const next = stops[i];
    if (clamped <= next.stop) {
      const span = Math.max(1e-6, next.stop - prev.stop);
      const localT = (clamped - prev.stop) / span;
      return [
        Math.round(lerp(prev.rgb[0], next.rgb[0], localT)),
        Math.round(lerp(prev.rgb[1], next.rgb[1], localT)),
        Math.round(lerp(prev.rgb[2], next.rgb[2], localT)),
      ];
    }
  }
  const last = stops[stops.length - 1];
  return [last.rgb[0], last.rgb[1], last.rgb[2]];
}

function rgbToRgbaString(rgb, alpha = 1) {
  const [r, g, b] = Array.isArray(rgb) ? rgb : [255, 255, 255];
  const a = Math.max(0, Math.min(1, Number.isFinite(alpha) ? alpha : 1));
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${a})`;
}

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
  // Static mode: no ambient noise, no radial "kick" gravity. Only reacts to pokes.
  const STATIC_MODE = !!opts.staticMode;
  const ctx = canvas.getContext('2d', { alpha: true });
  const fieldLabel = opts.debugLabel ?? opts.id ?? 'field-unknown';

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
    layoutOverrides: opts.layout && typeof opts.layout === 'object' ? opts.layout : null,
    seed: opts.seed ?? 'particle-field',
    cap: opts.cap ?? 2200,
    noise: STATIC_MODE ? 0.0 : (opts.noise ?? 0.0),
    kick: STATIC_MODE ? 0.0 : (opts.kick ?? 0.0),
    kickDecay: opts.kickDecay ?? 6.0,
    /**
     * Target return time (seconds) for particles to settle ~critically damped.
     * 2.0 gives a nice "float back in" feel.
     */
    returnSeconds: Math.max(0.3, Number(opts.returnSeconds ?? 2.0)),
    sizePx: typeof opts.sizePx === 'number' ? opts.sizePx : BASE_RADIUS_PX,
    minAlpha: opts.minAlpha ?? 0.25,
    maxAlpha: opts.maxAlpha ?? 0.85,
    lineAlpha: opts.lineAlpha ?? 0.1,
    drawMode: opts.drawMode ?? 'dots',
    linkDist: opts.linkDist ?? 42,
    strokeStyle: opts.strokeStyle ?? 'rgba(143,168,255,0.35)',
    fillStyle: opts.fillStyle ?? '#9fb7ff',
    forceMul: typeof opts.forceMul === 'number' ? opts.forceMul : 1.3,
    debugLabel: fieldLabel,
  };

  const state = {
    w: 1,
    h: 1,
    dpr: 1,
    particles: [],
    pulseEnergy: 0,
    lodScale: 1,
    spacing: 18,
  };
  const PARTICLE_HIGHLIGHT_DURATION = 900; // ms
  const PARTICLE_HIGHLIGHT_INTENSITY = 0.6; // base cap
  const PARTICLE_HIGHLIGHT_SIZE_BUMP = 0.25; // relative radius increase at peak highlight
  const highlightEvents = [];
  // evt: {x,y,radius,t,amp,dur}

  function hashSeed(value) {
    const key = String(value ?? '');
    let h = 2166136261 >>> 0;
    for (let i = 0; i < key.length; i++) {
      h ^= key.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0) || 1;
  }

  function makeRng(token) {
    const key = String(token ?? '');
    if (RNG_SEED_PER_TOY) return seededRandomFactory(key);
    let s = hashSeed(key);
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 0xffffffff;
    };
  }

  function normalizedKick(distPx, spacing) {
    const s = Math.max(8, spacing || 18);
    const span = Math.max(1, s * 1.5);
    const ratio = Math.min(1, distPx / span);
    return Math.max(0.2, 1 - ratio);
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

    const layoutOpts = config.layoutOverrides || {};
    const computedLayout = computeParticleLayout({
      widthPx: state.w,
      heightPx: state.h,
      baseArea: layoutOpts.baseArea,
      baseCount: layoutOpts.baseCount,
      minCount: layoutOpts.minCount,
      maxCount: layoutOpts.maxCount,
      debugLabel: opts.debugLabel || config.seed || 'field',
    });
    const resolvedCount = Number.isFinite(layoutOpts.count)
      ? Math.max(1, Math.round(layoutOpts.count))
      : computedLayout.count;
    const spacingCandidate = Number.isFinite(layoutOpts.spacing)
      ? layoutOpts.spacing
      : computedLayout.spacing;
    state.spacing = Math.max(8, spacingCandidate || computedLayout.spacing || 8);
    const cap = Number.isFinite(config.cap) ? config.cap : Number.POSITIVE_INFINITY;
    const target = Math.min(cap, Math.max(1, Math.round(resolvedCount)));

    if (state.particles.length) {
      const scaleX = prevW > 0 ? (state.w / prevW) : 1;
      const scaleY = prevH > 0 ? (state.h / prevH) : 1;
      for (let i = 0; i < state.particles.length; i++) {
        const p = state.particles[i];
        const homeX = Number.isFinite(p.hx) ? p.hx : p.x;
        const homeY = Number.isFinite(p.hy) ? p.hy : p.y;
        const dispX = Number.isFinite(p.x) ? (p.x - homeX) : 0;
        const dispY = Number.isFinite(p.y) ? (p.y - homeY) : 0;
        const u = prevW > 0 ? (homeX / prevW) : 0.5;
        const v = prevH > 0 ? (homeY / prevH) : 0.5;
        const clampedU = Math.min(Math.max(u, 0), 1);
        const clampedV = Math.min(Math.max(v, 0), 1);
        const nextHx = clampedU * state.w;
        const nextHy = clampedV * state.h;
        const nextX = nextHx + dispX * scaleX;
        const nextY = nextHy + dispY * scaleY;
        p.hx = nextHx;
        p.hy = nextHy;
        p.x = Math.min(Math.max(nextX, 0), state.w);
        p.y = Math.min(Math.max(nextY, 0), state.h);
      }
    }

    if (target === state.particles.length) return;

    if (target < state.particles.length) {
      state.particles.length = target;
      return;
    }

    const seedKey = `${config.seed}:${state.w}x${state.h}`;
    const rng = makeRng(seedKey);
    while (state.particles.length < target) {
      const x = rng() * state.w;
      const y = rng() * state.h;
      const a = rng();
      const rPx = particleRadiusPx(rng);
      state.particles.push({ x, y, hx: x, hy: y, vx: 0, vy: 0, a, rPx });
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
    // If velocities ever become NaN (from bad math), reset gracefully
    if (!Number.isFinite(dt) || dt <= 0) dt = 1 / 60;

    const spacing = Math.max(8, state.spacing || 18);
    const spacingScale = spacing / 18;

    // Derive spring constants from target return time (critical-ish damping).
    // For x'' + 2ζω x' + ω² x = 0 with ζ≈1, T_settle ≈ 2/ω to 4/ω depending on definition.
    // Empirically ω = 3 / T gives a good ~2s visual settle.
    const T = Math.max(0.3, config.returnSeconds);
    const w0 = 3.0 / T;
    const k = (w0 * w0) * spacingScale; // spring to home
    const c = 2.0 * w0;
    const hum = STATIC_MODE ? 0.0 : (config.noise ?? 0.0);
    const kick = STATIC_MODE ? 0.0 : (state.pulseEnergy * (config.kick ?? 0.0));

    const cx = state.w * 0.5;
    const cy = state.h * 0.5;

    for (let i = 0; i < state.particles.length; i++) {
      const p = state.particles[i];

      const ax = (p.hx - p.x) * k;
      const ay = (p.hy - p.y) * k;

      p.a += 0.35 * dt;
      if (p.a > 1) p.a -= 1;
      const ang = p.a * Math.PI * 2;
      const nx = hum ? Math.cos(ang) * hum : 0;
      const ny = hum ? Math.sin(ang) * hum : 0;

      const rx = p.x - cx;
      const ry = p.y - cy;
      const rl = Math.hypot(rx, ry) || 1;
      const kx = (rx / rl) * kick;
      const ky = (ry / rl) * kick;

      p.vx += (ax - p.vx * c + nx - kx) * dt;
      p.vy += (ay - p.vy * c + ny - ky) * dt;

      // Cap velocities relative to spacing so the field doesn't sling particles wildly.
      // vmax is expressed in px/sec; dt already scales movement when applied.
      const defaultVmax = Math.max(60, spacing * 18);
      const staticVmax = Math.max(90, spacing * 28);
      const vmax = STATIC_MODE ? staticVmax : defaultVmax;
      const speed = Math.hypot(p.vx, p.vy);
      if (speed > vmax && speed > 0) {
        const scale = vmax / speed;
        p.vx *= scale;
        p.vy *= scale;
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // Snap to home a bit earlier to feel "short settle"
      const dxh = p.hx - p.x;
      const dyh = p.hy - p.y;
      const dist2 = dxh * dxh + dyh * dyh;
      const vel2  = p.vx * p.vx + p.vy * p.vy;
      if (dist2 < 1.0 && vel2 < 0.09) { // ~1px and ~0.3px/s
        p.x = p.hx; p.y = p.hy;
        p.vx = 0; p.vy = 0;
      }
    }

    if (state.pulseEnergy > 0) {
      state.pulseEnergy = Math.max(0, state.pulseEnergy - config.kickDecay * dt);
    }
  }

  function draw() {
    ctx.clearRect(0, 0, state.w, state.h);

    // Canvas is sized from getBoundingClientRect (CSS space), so use screen-px radius directly.
    const fallbackRadiusPx = config.sizePx ?? BASE_RADIUS_PX;
    const baseWorldRadius = Math.max(0.5, fallbackRadiusPx);
    const zoom = readZoom(pv);
    const now = performance?.now?.() ?? Date.now();
    while (
      highlightEvents.length &&
      now - highlightEvents[0].t >= (highlightEvents[0].dur || PARTICLE_HIGHLIGHT_DURATION)
    ) {
      highlightEvents.shift();
    }

    if (config.drawMode === 'dots+links' && state.particles.length <= 1500) {
      ctx.globalAlpha = config.lineAlpha;
      ctx.strokeStyle = config.strokeStyle;
      ctx.lineWidth = Math.max(0.6, baseWorldRadius * 0.8);
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

    const baseFillStyle = config.fillStyle;
    const glowFillStyle = 'rgba(201, 228, 255, 0.96)';
    for (let i = 0; i < state.particles.length; i++) {
      const p = state.particles[i];
      const alpha =
        config.minAlpha +
        (config.maxAlpha - config.minAlpha) *
          (0.5 + 0.5 * Math.sin(p.a * Math.PI * 2));
      let highlight = 0;
      let highlightAmp = 0;
      let highlightProgress = 0;
      if (highlightEvents.length) {
        for (const evt of highlightEvents) {
          const dt = now - evt.t;
          const evtDur = evt.dur || PARTICLE_HIGHLIGHT_DURATION;
          if (dt >= evtDur) continue;
          const life = 1 - dt / evtDur;
          const dx = p.x - evt.x;
          const dy = p.y - evt.y;
          const distSq = dx * dx + dy * dy;
          if (distSq >= evt.radius * evt.radius) continue;
          const dist = Math.sqrt(distSq);
          const radial = 1 - Math.min(1, dist / evt.radius);
          const candidate = radial * life;
          if (candidate > highlight) {
            highlight = candidate;
            highlightAmp = Math.max(0, Math.min(1, evt.amp ?? 0.6));
            // Track how far through the highlight we are to drive color fade.
            highlightProgress = 1 - life;
          }
        }
      }
      const particleRadius = Math.max(0.5, screenRadiusToWorld(p.rPx ?? fallbackRadiusPx, zoom));
      const highlightSizeScale = 1 + highlight * PARTICLE_HIGHLIGHT_SIZE_BUMP;
      const drawRadius = particleRadius * highlightSizeScale;
      const accent = Math.min(
        1,
        highlight *
          PARTICLE_HIGHLIGHT_INTENSITY *
          (1 + 0.5 * highlightAmp)
      );
      const accentRgb = highlight > 0 ? sampleReturnGradient(highlightProgress) : null;
      ctx.globalAlpha = Math.min(1, alpha + accent);
      ctx.fillStyle = (highlight > 0 && accentRgb)
        ? rgbToRgbaString(accentRgb, 1)
        : baseFillStyle;
      ctx.beginPath();
      ctx.arc(p.x, p.y, drawRadius, 0, Math.PI * 2);
      ctx.fill();
      if (highlight > 0) {
        const glowAlpha = Math.min(0.85, accent * 1.2);
        const glowRgb = accentRgb || sampleReturnGradient(1);
        ctx.globalAlpha = glowAlpha;
        ctx.fillStyle = glowRgb ? rgbToRgbaString(glowRgb, 0.95) : glowFillStyle;
        ctx.beginPath();
        ctx.arc(p.x, p.y, drawRadius * (1 + highlight * 0.8), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
    ctx.globalAlpha = 1;
  }

  function tick(dt = 1 / 60) {
    maybeResizeFromLayout();
    setLODFromView();
    step(dt);
    draw();
  }

  function poke(x, y, opts = {}) {
    const isPlow = opts && opts.mode === 'plow';
    if (!window.__PF_DIAG) window.__PF_DIAG = { count: 0 };
    window.__PF_DIAG.count++;
    const pokeTime = performance?.now?.() ?? Date.now();
    window.__PF_LAST_POKE__ = {
      x,
      y,
      r: Number.isFinite(opts.radius) ? opts.radius : NaN,
      s: Number.isFinite(opts.strength) ? opts.strength : NaN,
      t: pokeTime,
    };
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const radiusCss = Number.isFinite(opts.radius) ? opts.radius : 64;
    // Caller passes toy-relative radius; do not rescale here.
    const radius = Math.max(1, radiusCss);
    const strength = Number.isFinite(opts.strength) ? opts.strength : 28;
    const rim = isPlow ? (radius + Math.max(1, state.spacing * 0.15)) : radius;
    const highlightEnabled = opts.highlight !== false;
    const highlightRadius = Math.max(8, radius * 1.15);
    const highlightAmp = Math.max(
      0,
      Math.min(
        1,
        Number.isFinite(opts.highlightAmp) ? opts.highlightAmp : 0.8
      )
    );
    const highlightDur = Number.isFinite(opts.highlightDur)
      ? opts.highlightDur
      : Number.isFinite(opts.highlightMs)
      ? opts.highlightMs
      : PARTICLE_HIGHLIGHT_DURATION;
    const highlightTime = pokeTime;
    let highlightQueued = false;
    const enqueueHighlight = (cx, cy) => {
      if (!highlightEnabled || highlightQueued) return;
      highlightEvents.push({
        x: cx,
        y: cy,
        radius: highlightRadius,
        t: highlightTime,
        dur: highlightDur,
        amp: highlightAmp,
      });
      highlightQueued = true;
      if (highlightEvents.length > 32) {
        highlightEvents.shift();
      }
    };
    const radiusSq = radius * radius;
    for (let i = 0; i < state.particles.length; i++) {
      const p = state.particles[i];
      const dx = p.x - x;
      const dy = p.y - y;
      const distSq = dx * dx + dy * dy;
      if (distSq > radiusSq) continue;
      const dist = Math.sqrt(distSq) || 1;
      const nx = dx / dist;
      const ny = dy / dist;

      if (isPlow) {
        // 1) Snap to the rim (true snow-plow push)
        p.x = x + nx * rim;
        p.y = y + ny * rim;

        // 2) Small outward kick so it glides a touch then springs back
        const influence = 1 - Math.min(1, dist / radius);
        const falloff   = influence * influence * influence; // tight & local
        const kickScale = Math.max(0.25, normalizedKick(dist, state.spacing));
        const force     = strength * 0.35 * falloff * kickScale * (config.forceMul || 1.0);
        p.vx += nx * force;
        p.vy += ny * force;
        enqueueHighlight(p.x, p.y);
      } else {
        // Legacy local impulse
        const influence = 1 - Math.min(1, dist / radius);
        const falloff   = influence * influence * influence;
        const kickScale = Math.max(0.25, normalizedKick(dist, state.spacing));
        const force = strength * falloff * kickScale * (config.forceMul || 1.0);
        p.vx += nx * force;
        p.vy += ny * force;
        enqueueHighlight(p.x, p.y);
      }
    }
  }

  function pushDirectional(x, y, dirX, dirY, opts = {}) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const radius = Math.max(1, Number.isFinite(opts.radius) ? opts.radius : 40);
    const strength = Number.isFinite(opts.strength) ? opts.strength : 1200;
    const falloffMode = opts.falloff === 'linear' ? 'linear' : 'gaussian';
    let ux = Number.isFinite(dirX) ? dirX : 0;
    let uy = Number.isFinite(dirY) ? dirY : 0;
    const len = Math.hypot(ux, uy);
    if (len > 1e-6) {
      ux /= len;
      uy /= len;
    } else {
      ux = 1;
      uy = 0;
    }
    const radiusSq = radius * radius;
    const particles = state.particles;
    const forceMul = Number.isFinite(opts.forceMul) ? opts.forceMul : (config.forceMul || 1);
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const dx = p.x - x;
      const dy = p.y - y;
      const distSq = dx * dx + dy * dy;
      if (distSq > radiusSq) continue;
      const dist = Math.sqrt(distSq) || 0;
      let weight = 0;
      if (falloffMode === 'linear') {
        weight = Math.max(0, 1 - dist / radius);
      } else {
        const k = radius > 0 ? dist / radius : 0;
        weight = Math.exp(-4.5 * k * k);
      }
      if (weight <= 0) continue;
      const mass = Number.isFinite(p.mass) && p.mass > 0 ? p.mass : 1;
      const impulse = (strength * forceMul * weight) / mass;
      p.vx += ux * impulse;
      p.vy += uy * impulse;
    }
  }

  function setStyle(style = {}) {
    if (!style || typeof style !== 'object') return;
    if (style.fillStyle) config.fillStyle = style.fillStyle;
    if (style.strokeStyle) config.strokeStyle = style.strokeStyle;
    if (typeof style.drawMode === 'string') config.drawMode = style.drawMode;
    if (typeof style.sizePx === 'number') config.sizePx = style.sizePx;
    if (typeof style.minAlpha === 'number') config.minAlpha = style.minAlpha;
    if (typeof style.maxAlpha === 'number') config.maxAlpha = style.maxAlpha;
  }

  function destroy() {
    state.particles.length = 0;
    ctx.clearRect(0, 0, state.w, state.h);
  }

  resize();
  fieldLog('[FIELD][init]', {
    id: fieldLabel,
    widthPx: state.w,
    heightPx: state.h,
    config,
  });

  return {
    tick,
    pulse,
    resize,
    destroy,
    poke,
    pushDirectional,
    setStyle,
    canvas,
    _state: state,
    _config: config,
    // expose static flag for diagnostics
    _static: STATIC_MODE,
  };
}
