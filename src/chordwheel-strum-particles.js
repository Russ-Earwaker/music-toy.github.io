import {
  applyParticleDamping,
  createParticleRuntime,
  integrateParticleVelocity,
  renderParticles2D,
} from './baseMusicToy/particles/particle-runtime.js';
import {
  CHORDWHEEL_STRUM_LOGICAL_HEIGHT,
  CHORDWHEEL_STRUM_LOGICAL_WIDTH,
} from './chordwheel-strum-viewport-space.js';

const FRAME_SECONDS = 1 / 60;
const BASE_ALPHA = 0.55;
const MAX_BURST_PARTICLES = 220;

export function createChordWheelStrumParticles({ random = Math.random } = {}) {
  const bounds = {
    left: 0,
    top: 0,
    width: CHORDWHEEL_STRUM_LOGICAL_WIDTH,
    height: CHORDWHEEL_STRUM_LOGICAL_HEIGHT,
  };
  const runtime = createParticleRuntime({
    bounds,
    capacity: MAX_BURST_PARTICLES,
    createParticle: (spec) => ({
      x: spec.x,
      y: spec.y,
      vx: spec.vx,
      vy: spec.vy,
      homeX: spec.homeX,
      homeY: spec.homeY,
      alpha: spec.alpha ?? 0.8,
      tSince: 0,
      delay: spec.delay ?? 0,
      burst: true,
    }),
    integrateParticle: (particle, dt) => {
      if (particle.delay > 0) {
        particle.delay = Math.max(0, particle.delay - dt);
        return;
      }
      particle.tSince += dt;
      applyParticleDamping(particle, 0.985, dt, FRAME_SECONDS);
      particle.vx += 3600 * 0.0065 * (particle.homeX - particle.x) * dt;
      particle.vy += 3600 * 0.0065 * (particle.homeY - particle.y) * dt;
      const previousX = particle.x;
      integrateParticleVelocity(particle, dt);
      const middleX = CHORDWHEEL_STRUM_LOGICAL_WIDTH / 2;
      if ((previousX - middleX) * (particle.x - middleX) < 0) {
        particle.vx *= 0.68 * 0.68;
        particle.vy *= 0.86 * 0.86;
      }
      if (particle.x < bounds.left) { particle.x = bounds.left; particle.vx = Math.abs(particle.vx) * 0.8; }
      if (particle.x > bounds.right) { particle.x = bounds.right; particle.vx = -Math.abs(particle.vx) * 0.8; }
      if (particle.y < bounds.top) { particle.y = bounds.top; particle.vy = Math.abs(particle.vy) * 0.8; }
      if (particle.y > bounds.bottom) { particle.y = bounds.bottom; particle.vy = -Math.abs(particle.vy) * 0.8; }
      const alphaBlend = 1 - Math.pow(0.95, dt / FRAME_SECONDS);
      particle.alpha += (BASE_ALPHA - particle.alpha) * alphaBlend;
    },
  });

  function lineBurst(x, count = 80, baseSpeed = 3, speedMultiplier = 1) {
    const centerY = CHORDWHEEL_STRUM_LOGICAL_HEIGHT / 2;
    for (let index = 0; index < count; index += 1) {
      const u = random() - random();
      const y = ((u + 1) * 0.5) * CHORDWHEEL_STRUM_LOGICAL_HEIGHT;
      const centerFactor = 1 - Math.min(1, Math.abs(y - centerY) / centerY);
      const jitter = 0.5 + random() * 0.9;
      const weight = 0.005 + (1.32 - 0.005) * Math.pow(centerFactor, 0.8);
      // The original tuning was authored as logical units per 60 Hz frame.
      const velocity = baseSpeed * weight * jitter * Math.max(0.1, speedMultiplier) * 60;
      const delay = random() * 0.12;
      const vertical = () => (random() * 2 - 1) * velocity * 0.22;
      if (runtime.size >= MAX_BURST_PARTICLES) runtime.retire(0);
      runtime.spawn({ x, y, vx: -velocity, vy: vertical(), homeX: x, homeY: y, delay });
      if (runtime.size >= MAX_BURST_PARTICLES) runtime.retire(0);
      runtime.spawn({ x, y, vx: velocity, vy: vertical(), homeX: x, homeY: y, delay });
    }
  }

  function draw(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const middleX = CHORDWHEEL_STRUM_LOGICAL_WIDTH / 2;
    renderParticles2D(ctx, runtime.particles, (target, particle) => {
      const speed = Math.hypot(particle.vx, particle.vy);
      const speedRatio = Math.max(0, Math.min(1, speed / 300));
      const fastBias = Math.pow(speedRatio, 1.25);
      const away = (particle.x < middleX && particle.vx < 0) || (particle.x > middleX && particle.vx > 0);
      target.globalAlpha = Math.min(1, Math.max(0.08, Math.min(1, particle.alpha)) + (away ? 0.8 * fastBias : 0));
      const mix = away ? Math.min(0.9, Math.pow(speedRatio, 1.4)) : 0;
      const channel = (base) => Math.round(base + (255 - base) * mix);
      target.fillStyle = `rgb(${channel(143)},${channel(168)},${channel(255)})`;
      target.fillRect(Math.trunc(particle.x), Math.trunc(particle.y), 1.5, 1.5);
    });
    ctx.restore();
  }

  return { runtime, step: (dt) => runtime.step(dt), draw, lineBurst };
}
