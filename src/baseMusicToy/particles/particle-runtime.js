function copyBounds(bounds) {
  const left = Number(bounds?.left) || 0;
  const top = Number(bounds?.top) || 0;
  const width = Math.max(0, Number(bounds?.width) || 0);
  const height = Math.max(0, Number(bounds?.height) || 0);
  return Object.freeze({ left, top, width, height, right: left + width, bottom: top + height });
}

export function integrateParticleVelocity(particle, dt) {
  particle.x += (Number(particle.vx) || 0) * dt;
  particle.y += (Number(particle.vy) || 0) * dt;
  return particle;
}

export function applyParticleDamping(particle, dampingPerFrame, dt, referenceDt = 1 / 60) {
  const factor = Math.pow(Math.max(0, Number(dampingPerFrame) || 0), dt / referenceDt);
  particle.vx *= factor;
  particle.vy *= factor;
  return particle;
}

export function bounceParticleInBounds(particle, bounds, { restitution = 0.8, onBounce } = {}) {
  let bounced = false;
  if (particle.x < bounds.left) { particle.x = bounds.left; particle.vx = Math.abs(particle.vx) * restitution; bounced = true; }
  if (particle.x > bounds.right) { particle.x = bounds.right; particle.vx = -Math.abs(particle.vx) * restitution; bounced = true; }
  if (particle.y < bounds.top) { particle.y = bounds.top; particle.vy = Math.abs(particle.vy) * restitution; bounced = true; }
  if (particle.y > bounds.bottom) { particle.y = bounds.bottom; particle.vy = -Math.abs(particle.vy) * restitution; bounced = true; }
  if (bounced && typeof onBounce === 'function') onBounce(particle, bounds);
  return bounced;
}

export function renderParticles2D(ctx, particles, drawParticle) {
  if (!ctx || typeof drawParticle !== 'function') return;
  ctx.save();
  for (let index = 0; index < particles.length; index += 1) drawParticle(ctx, particles[index], index);
  ctx.restore();
}

export function createParticleRuntime({
  bounds,
  capacity = Infinity,
  createParticle = (spec) => ({ ...spec }),
  integrateParticle = integrateParticleVelocity,
  boundsPolicy = null,
} = {}) {
  let logicalBounds = copyBounds(bounds);
  const particles = [];
  const maxParticles = Number.isFinite(capacity) ? Math.max(0, Math.floor(capacity)) : Infinity;

  function spawn(spec = {}) {
    if (particles.length >= maxParticles) return null;
    const particle = createParticle(spec, logicalBounds, particles.length);
    if (!particle) return null;
    particles.push(particle);
    return particle;
  }

  function step(dt, environment) {
    const delta = Number(dt);
    if (!Number.isFinite(delta) || delta <= 0) return;
    let write = 0;
    for (let index = 0; index < particles.length; index += 1) {
      const particle = particles[index];
      const keepIntegrated = integrateParticle(particle, delta, { bounds: logicalBounds, environment, index, particles });
      const keepInBounds = typeof boundsPolicy === 'function'
        ? boundsPolicy(particle, logicalBounds, { dt: delta, environment, index, particles })
        : true;
      if (keepIntegrated === false || keepInBounds === false || particle.dead === true) continue;
      particles[write++] = particle;
    }
    particles.length = write;
  }

  function retire(target) {
    const predicate = typeof target === 'function'
      ? target
      : (_particle, index) => target === index || target === _particle;
    let write = 0;
    for (let index = 0; index < particles.length; index += 1) {
      const particle = particles[index];
      if (predicate(particle, index)) continue;
      particles[write++] = particle;
    }
    particles.length = write;
  }

  return {
    spawn,
    step,
    retire,
    clear: () => { particles.length = 0; },
    setBounds: (nextBounds) => { logicalBounds = copyBounds(nextBounds); },
    get bounds() { return logicalBounds; },
    get particles() { return particles; },
    get size() { return particles.length; },
  };
}

