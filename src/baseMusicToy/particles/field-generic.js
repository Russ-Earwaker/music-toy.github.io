// Logical generic particle field used by toy hosts.
//
// Contract:
// - simulation owns fixed logical coordinates only;
// - the host owns canvas CSS size, backing resolution, DPR and visibility;
// - render(ctx) expects the host to have installed the logical-to-display transform.

import { createParticleRuntime, integrateParticleVelocity, renderParticles2D } from './particle-runtime.js';
import {
  BASE_AREA,
  BASE_COUNT,
  BASE_RADIUS_PX,
  MAX_COUNT,
  MIN_COUNT,
  computeParticleLayout,
  particleRadiusPx,
  seededRandomFactory,
} from './particle-density.js';

const FADE_IN_RATE = 1.6;
const FADE_OUT_RATE = 0.9;
const DEFAULT_MIN_PARTICLES = 50;
const RETURN_GRADIENT = Object.freeze([
  { stop: 0, rgb: [51, 153, 255] },
  { stop: 0.55, rgb: [255, 255, 255] },
  { stop: 1, rgb: [255, 108, 196] },
]);

function normalizeBounds(bounds = {}) {
  const left = Number.isFinite(bounds.left) ? bounds.left : 0;
  const top = Number.isFinite(bounds.top) ? bounds.top : 0;
  const width = Math.max(1, Number(bounds.width) || 1);
  const height = Math.max(1, Number(bounds.height) || 1);
  return Object.freeze({ left, top, width, height, right: left + width, bottom: top + height });
}

function gradientColor(t) {
  const value = Math.max(0, Math.min(1, Number(t) || 0));
  let previous = RETURN_GRADIENT[0];
  for (let index = 1; index < RETURN_GRADIENT.length; index += 1) {
    const next = RETURN_GRADIENT[index];
    if (value <= next.stop) {
      const local = (value - previous.stop) / Math.max(1e-6, next.stop - previous.stop);
      return previous.rgb.map((channel, channelIndex) => Math.round(channel + (next.rgb[channelIndex] - channel) * local));
    }
    previous = next;
  }
  return [...previous.rgb];
}

export function collectParticleLinks(particles, linkDistance) {
  const links = [];
  const distanceSq = Math.max(0, Number(linkDistance) || 0) ** 2;
  for (let first = 0; first < particles.length; first += 1) {
    const a = particles[first];
    if ((a.fade ?? 1) <= 0.001) continue;
    for (let second = first + 1; second < particles.length; second += 1) {
      const b = particles[second];
      if ((b.fade ?? 1) <= 0.001) continue;
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      if (dx * dx + dy * dy < distanceSq) links.push(Object.freeze({ first, second }));
    }
  }
  return links;
}

export function createGenericParticleField({ bounds, qualityPolicy = null } = {}, opts = {}) {
  const logicalBounds = normalizeBounds(bounds);
  const staticMode = !!opts.staticMode;
  const config = {
    seed: opts.seed ?? 'particle-field',
    cap: Math.max(1, Math.round(opts.cap ?? MAX_COUNT)),
    returnSeconds: Math.max(0.3, Number(opts.returnSeconds ?? 2)),
    noise: staticMode ? 0 : Number(opts.noise ?? 0),
    kick: staticMode ? 0 : Number(opts.kick ?? 0),
    kickDecay: Number(opts.kickDecay ?? 6),
    vmaxMul: Number.isFinite(opts.vmaxMul) ? opts.vmaxMul : 1,
    forceMul: Number.isFinite(opts.forceMul) ? opts.forceMul : 1.3,
    size: Number.isFinite(opts.size) ? opts.size : Number(opts.sizePx ?? BASE_RADIUS_PX),
    minAlpha: Number(opts.minAlpha ?? 0.25),
    maxAlpha: Number(opts.maxAlpha ?? 0.85),
    lineAlpha: Number(opts.lineAlpha ?? 0.1),
    linkDist: Number(opts.linkDist ?? 42),
    drawMode: opts.drawMode ?? 'dots',
    strokeStyle: opts.strokeStyle ?? 'rgba(143,168,255,0.35)',
    fillStyle: opts.fillStyle ?? '#9fb7ff',
  };
  const layout = computeParticleLayout({
    widthPx: logicalBounds.width,
    heightPx: logicalBounds.height,
    baseArea: opts.layout?.baseArea ?? BASE_AREA,
    baseCount: opts.layout?.baseCount ?? BASE_COUNT,
    minCount: opts.layout?.minCount ?? MIN_COUNT,
    maxCount: opts.layout?.maxCount ?? MAX_COUNT,
  });
  const authoredCount = Number.isFinite(opts.layout?.count) ? Math.round(opts.layout.count) : layout.count;
  const state = {
    bounds: logicalBounds,
    particles: null,
    spacing: Number.isFinite(opts.layout?.spacing) ? opts.layout.spacing : layout.spacing,
    authoredCount,
    targetDesired: 0,
    minParticles: Math.min(config.cap, Number.isFinite(opts.minParticles) ? Math.max(0, Math.round(opts.minParticles)) : DEFAULT_MIN_PARTICLES),
    lodScale: 1,
    capScale: 1,
    tickModulo: 1,
    tickModuloCounter: 0,
    tickAccumDt: 0,
    pulseEnergy: 0,
    elapsed: 0,
    highlights: [],
    emergencyFade: false,
  };
  const rng = seededRandomFactory(`${config.seed}:${logicalBounds.width}x${logicalBounds.height}`);
  const runtime = createParticleRuntime({
    bounds: logicalBounds,
    capacity: config.cap,
    createParticle: (spec = {}) => {
      const x = Number.isFinite(spec.x) ? spec.x : logicalBounds.left + rng() * logicalBounds.width;
      const y = Number.isFinite(spec.y) ? spec.y : logicalBounds.top + rng() * logicalBounds.height;
      return {
        x, y, hx: x, hy: y, vx: 0, vy: 0,
        a: rng(),
        r: particleRadiusPx(rng),
        fade: spec.fade ?? 1,
        fadeTarget: spec.fadeTarget ?? 1,
        fadeRate: spec.fadeRate ?? FADE_IN_RATE,
        fadeReturn: false,
      };
    },
    integrateParticle: (particle, dt) => {
      const spacingScale = Math.max(8, state.spacing) / 18;
      const frequency = 3 / config.returnSeconds;
      const spring = frequency * frequency * spacingScale;
      const damping = 2 * frequency;
      const centerX = logicalBounds.left + logicalBounds.width / 2;
      const centerY = logicalBounds.top + logicalBounds.height / 2;
      const radialX = particle.x - centerX;
      const radialY = particle.y - centerY;
      const radialLength = Math.hypot(radialX, radialY) || 1;
      particle.a = (particle.a + 0.35 * dt) % 1;
      const angle = particle.a * Math.PI * 2;
      const kick = state.pulseEnergy * config.kick;
      particle.vx += ((particle.hx - particle.x) * spring - particle.vx * damping
        + Math.cos(angle) * config.noise - radialX / radialLength * kick) * dt;
      particle.vy += ((particle.hy - particle.y) * spring - particle.vy * damping
        + Math.sin(angle) * config.noise - radialY / radialLength * kick) * dt;
      const maxVelocity = Math.max(staticMode ? 90 : 60, state.spacing * (staticMode ? 28 : 18)) * config.vmaxMul;
      const speed = Math.hypot(particle.vx, particle.vy);
      if (speed > maxVelocity) {
        particle.vx *= maxVelocity / speed;
        particle.vy *= maxVelocity / speed;
      }
      integrateParticleVelocity(particle, dt);
      const homeDx = particle.hx - particle.x;
      const homeDy = particle.hy - particle.y;
      if (homeDx * homeDx + homeDy * homeDy < 1 && particle.vx * particle.vx + particle.vy * particle.vy < 0.09) {
        particle.x = particle.hx;
        particle.y = particle.hy;
        particle.vx = 0;
        particle.vy = 0;
      }
    },
  });
  state.particles = runtime.particles;

  function resolveTarget() {
    const policy = typeof qualityPolicy === 'function' ? qualityPolicy() || {} : qualityPolicy || {};
    const qualityScale = Number.isFinite(policy.countScale) ? Math.max(0, policy.countScale) : 1;
    const desired = Math.round(authoredCount * state.lodScale * qualityScale);
    const cap = Math.max(0, Math.round(config.cap * state.capScale));
    state.targetDesired = state.emergencyFade ? 0 : Math.max(state.minParticles, Math.min(cap, desired));
    return state.targetDesired;
  }

  function reconcile(immediate = false) {
    const target = resolveTarget();
    if (runtime.size < target) {
      const amount = immediate ? target - runtime.size : Math.min(target - runtime.size, 2);
      for (let index = 0; index < amount; index += 1) runtime.spawn({ fade: immediate ? 1 : 0 });
    } else if (runtime.size > target) {
      let remaining = immediate ? runtime.size - target : Math.min(runtime.size - target, 2);
      for (let index = runtime.particles.length - 1; index >= 0 && remaining > 0; index -= 1) {
        const particle = runtime.particles[index];
        if (particle.fadeTarget <= 0) continue;
        particle.fadeTarget = 0;
        particle.fadeRate = state.emergencyFade ? FADE_OUT_RATE * 3.5 : FADE_OUT_RATE;
        remaining -= 1;
      }
    }
  }

  function updateFades(dt) {
    for (const particle of runtime.particles) {
      const difference = particle.fadeTarget - particle.fade;
      const amount = Math.sign(difference) * particle.fadeRate * dt;
      particle.fade = Math.abs(amount) >= Math.abs(difference) ? particle.fadeTarget : particle.fade + amount;
      if (particle.fadeReturn && particle.fade === particle.fadeTarget) {
        if (particle.fadeTarget < 1) {
          particle.fadeTarget = 1;
          particle.fadeRate = FADE_IN_RATE * 0.75;
        } else particle.fadeReturn = false;
      }
    }
    runtime.retire((particle) => particle.fadeTarget === 0 && particle.fade <= 0.01);
  }

  function step(dt = 1 / 60) {
    const delta = Number.isFinite(dt) && dt > 0 ? Math.min(0.12, dt) : 1 / 60;
    state.elapsed += delta;
    state.tickModuloCounter = (state.tickModuloCounter + 1) % state.tickModulo;
    state.tickAccumDt += delta;
    updateFades(delta);
    if (state.tickModuloCounter !== 0) return;
    const effectiveDt = state.tickAccumDt;
    state.tickAccumDt = 0;
    reconcile(false);
    runtime.step(effectiveDt);
    state.pulseEnergy = Math.max(0, state.pulseEnergy - config.kickDecay * effectiveDt);
    state.highlights = state.highlights.filter((event) => state.elapsed - event.started < event.duration);
  }

  function render(ctx) {
    if (!ctx) return;
    const clip = state.clipRect;
    ctx.save();
    if (clip) {
      ctx.beginPath();
      ctx.rect(clip.x, clip.y, clip.w, clip.h);
      ctx.clip();
      ctx.clearRect(clip.x, clip.y, clip.w, clip.h);
    } else ctx.clearRect(logicalBounds.left, logicalBounds.top, logicalBounds.width, logicalBounds.height);
    if (config.drawMode === 'dots+links' && runtime.size <= 1500) {
      ctx.strokeStyle = config.strokeStyle;
      ctx.lineWidth = Math.max(0.6, config.size * 0.8);
      for (const { first, second } of collectParticleLinks(runtime.particles, config.linkDist)) {
        const a = runtime.particles[first];
        const b = runtime.particles[second];
        ctx.globalAlpha = config.lineAlpha * Math.min(a.fade, b.fade);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
    renderParticles2D(ctx, runtime.particles, (target, particle) => {
      if (particle.fade <= 0.001) return;
      let highlight = 0;
      let progress = 0;
      for (const event of state.highlights) {
        const distance = Math.hypot(particle.x - event.x, particle.y - event.y);
        if (distance >= event.radius) continue;
        const life = 1 - (state.elapsed - event.started) / event.duration;
        const candidate = (1 - distance / event.radius) * life;
        if (candidate > highlight) { highlight = candidate; progress = 1 - life; }
      }
      const alpha = config.minAlpha + (config.maxAlpha - config.minAlpha) * (0.5 + 0.5 * Math.sin(particle.a * Math.PI * 2));
      const radius = Math.max(0.5, particle.r ?? config.size) * (1 + highlight * 0.25);
      target.globalAlpha = Math.min(1, alpha + highlight * 0.6) * particle.fade;
      if (highlight > 0) {
        const color = gradientColor(progress);
        target.fillStyle = `rgb(${color[0]},${color[1]},${color[2]})`;
      } else target.fillStyle = config.fillStyle;
      target.beginPath();
      target.arc(particle.x, particle.y, radius, 0, Math.PI * 2);
      target.fill();
    });
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function addHighlight(x, y, opts) {
    if (opts.highlight === false) return;
    state.highlights.push({
      x, y,
      radius: Math.max(8, (Number(opts.radius) || 64) * 1.15),
      amplitude: Math.max(0, Math.min(2, Number(opts.highlightAmp ?? 0.8))),
      started: state.elapsed,
      duration: Math.max(0.001, Number(opts.highlightDur ?? opts.highlightMs ?? 1800) / 1000),
    });
    if (state.highlights.length > 128) state.highlights.shift();
  }

  function poke(x, y, opts = {}) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const radius = Math.max(1, Number(opts.radius) || 64);
    const strength = Number.isFinite(opts.strength) ? opts.strength : 28;
    const plow = opts.mode === 'plow';
    addHighlight(x, y, opts);
    for (const particle of runtime.particles) {
      const dx = particle.x - x;
      const dy = particle.y - y;
      const distance = Math.hypot(dx, dy);
      if (distance > radius) continue;
      const nx = dx / (distance || 1);
      const ny = dy / (distance || 1);
      if (plow) {
        const rim = radius + Math.max(1, state.spacing * 0.15);
        particle.x = x + nx * rim;
        particle.y = y + ny * rim;
      }
      const falloff = Math.pow(1 - Math.min(1, distance / radius), 3);
      const force = strength * (plow ? 0.35 : 1) * falloff * config.forceMul;
      particle.vx += nx * force;
      particle.vy += ny * force;
    }
  }

  function pushDirectional(x, y, dirX, dirY, opts = {}) {
    const radius = Math.max(1, Number(opts.radius) || 40);
    const strength = Number.isFinite(opts.strength) ? opts.strength : 1200;
    const length = Math.hypot(dirX, dirY) || 1;
    const ux = (Number.isFinite(dirX) ? dirX : 1) / length;
    const uy = (Number.isFinite(dirY) ? dirY : 0) / length;
    addHighlight(x, y, opts);
    for (const particle of runtime.particles) {
      const distance = Math.hypot(particle.x - x, particle.y - y);
      if (distance > radius) continue;
      const ratio = distance / radius;
      const weight = opts.falloff === 'linear' ? 1 - ratio : Math.exp(-4.5 * ratio * ratio);
      particle.vx += ux * strength * weight * config.forceMul;
      particle.vy += uy * strength * weight * config.forceMul;
    }
  }

  function applyBudget(budget = {}) {
    if (Number.isFinite(budget.minCount)) state.minParticles = Math.max(0, Math.round(budget.minCount));
    if (typeof budget.emergencyFade === 'boolean') state.emergencyFade = budget.emergencyFade;
    if (Number.isFinite(budget.maxCountScale)) state.lodScale = Math.max(0, Math.min(1, budget.maxCountScale));
    if (Number.isFinite(budget.capScale)) state.capScale = Math.max(0, Math.min(1.25, budget.capScale));
    if (Number.isFinite(budget.tickModulo)) state.tickModulo = Math.max(1, Math.round(budget.tickModulo));
    if (Number.isFinite(budget.sizeScale)) config.size = Math.max(0.4, Number(opts.size ?? opts.sizePx ?? BASE_RADIUS_PX) * budget.sizeScale);
    reconcile(false);
  }

  function resetHome() {
    state.pulseEnergy = 0;
    state.highlights.length = 0;
    for (const particle of runtime.particles) {
      particle.x = particle.hx; particle.y = particle.hy;
      particle.vx = 0; particle.vy = 0;
      particle.fade = 1; particle.fadeTarget = 1;
    }
  }

  function setStyle(style = {}) {
    if (style.fillStyle) config.fillStyle = style.fillStyle;
    if (style.strokeStyle) config.strokeStyle = style.strokeStyle;
    if (typeof style.drawMode === 'string') config.drawMode = style.drawMode;
    if (Number.isFinite(style.size) || Number.isFinite(style.sizePx)) config.size = Number(style.size ?? style.sizePx);
    if (Number.isFinite(style.minAlpha)) config.minAlpha = style.minAlpha;
    if (Number.isFinite(style.maxAlpha)) config.maxAlpha = style.maxAlpha;
  }

  function setClipRect(rect) {
    state.clipRect = rect && rect.w > 0 && rect.h > 0
      ? { x: rect.x, y: rect.y, w: rect.w, h: rect.h }
      : null;
  }

  reconcile(true);
  return {
    step,
    tick: step,
    render,
    pulse: (intensity = 0.6) => { state.pulseEnergy = Math.min(2, state.pulseEnergy + Math.max(0, intensity)); },
    poke,
    pushDirectional,
    applyBudget,
    resetHome,
    setStyle,
    setClipRect,
    forceSeed: () => { reconcile(true); return runtime.size; },
    resize: () => false,
    destroy: () => { runtime.clear(); state.highlights.length = 0; },
    runtime,
    _state: state,
    _config: config,
    _static: staticMode,
  };
}
