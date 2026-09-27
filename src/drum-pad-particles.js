import {
  applyParticleDamping,
  bounceParticleInBounds,
  createParticleRuntime,
  integrateParticleVelocity,
  renderParticles2D,
} from './baseMusicToy/particles/particle-runtime.js';
import { DRUM_PARTICLE_LOGICAL_HEIGHT, DRUM_PARTICLE_LOGICAL_WIDTH } from './drum-particle-viewport-space.js';

const FRAME_SECONDS = 1 / 60;

export function createDrumPadParticles({ count = 150, random = Math.random } = {}) {
  const bounds = { left: 0, top: 0, width: DRUM_PARTICLE_LOGICAL_WIDTH, height: DRUM_PARTICLE_LOGICAL_HEIGHT };
  const onBounce = (particle) => {
    particle.flash = 1;
    const dx = particle.homeX - particle.x;
    const dy = particle.homeY - particle.y;
    const distance = Math.hypot(dx, dy) || 1;
    particle.vx += (dx / distance) * 6 + (random() - 0.5) * 12;
    particle.vy += (dy / distance) * 6 + (random() - 0.5) * 12;
  };
  const runtime = createParticleRuntime({
    bounds,
    capacity: count,
    createParticle: () => {
      const homeX = random() * DRUM_PARTICLE_LOGICAL_WIDTH;
      const homeY = random() * DRUM_PARTICLE_LOGICAL_HEIGHT;
      return { x: homeX, y: homeY, vx: 0, vy: 0, homeX, homeY, flash: 0 };
    },
    integrateParticle: (particle, dt) => {
      integrateParticleVelocity(particle, dt);
      applyParticleDamping(particle, 0.97, dt, FRAME_SECONDS);
      particle.flash = Math.max(0, particle.flash - 3 * dt);
    },
    boundsPolicy: (particle, logicalBounds) => {
      bounceParticleInBounds(particle, logicalBounds, { restitution: 0.8, onBounce });
    },
  });
  for (let index = 0; index < count; index += 1) runtime.spawn();

  function disturb() {
    const centerX = DRUM_PARTICLE_LOGICAL_WIDTH / 2;
    const centerY = DRUM_PARTICLE_LOGICAL_HEIGHT / 2;
    const radius = (Math.min(DRUM_PARTICLE_LOGICAL_WIDTH * 0.55, DRUM_PARTICLE_LOGICAL_HEIGHT * 0.65) / 2) * 1.5;
    const radiusSq = radius * radius;
    for (const particle of runtime.particles) {
      particle.vx += (random() - 0.5) * 150;
      particle.vy += (random() - 0.5) * 150;
      particle.flash = Math.max(particle.flash, 0.8);
      const dx = particle.x - centerX;
      const dy = particle.y - centerY;
      const distanceSq = dx * dx + dy * dy;
      if (distanceSq >= radiusSq) continue;
      const distance = Math.sqrt(distanceSq) || 1;
      const kick = 240 * (1 - distance / radius);
      particle.vx += (dx / distance) * kick;
      particle.vy += (dy / distance) * kick;
    }
  }

  function draw(ctx) {
    renderParticles2D(ctx, runtime.particles, (target, particle) => {
      target.globalAlpha = Math.max(0, Math.min(1, 0.4 + 1.5 * particle.flash));
      target.fillStyle = '#c8d8ff';
      const size = 1.5 * (1 + particle.flash * 2);
      target.fillRect(Math.trunc(particle.x) - size / 2, Math.trunc(particle.y) - size / 2, size, size);
    });
  }

  return { runtime, step: (dt) => runtime.step(dt), draw, disturb };
}

