const SURFACE_FIELD_MAX_PARTICLES = 240;
const SURFACE_FIELD_AMBIENT_TARGET = 92;

function isFinitePoint(point) {
  return !!point && Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y));
}

export function createBeatSwarmSurfaceFieldRuntime(options = null) {
  const opts = options && typeof options === 'object' ? options : {};
  const constants = opts.constants && typeof opts.constants === 'object' ? opts.constants : {};
  const helpers = opts.helpers && typeof opts.helpers === 'object' ? opts.helpers : {};
  const getState = typeof opts.getState === 'function' ? opts.getState : () => ({});
  const particles = [];
  let canvasEl = null;
  let canvasW = 0;
  let canvasH = 0;

  function worldToScreen(point) {
    return typeof helpers.worldToScreen === 'function' ? helpers.worldToScreen(point) : null;
  }

  function screenToWorld(point) {
    return typeof helpers.screenToWorld === 'function' ? helpers.screenToWorld(point) : null;
  }

  function setCanvas(nextCanvasEl = null) {
    canvasEl = nextCanvasEl && typeof nextCanvasEl.getContext === 'function' ? nextCanvasEl : null;
  }

  function spawnDebris(world = null, options = null) {
    if (!isFinitePoint(world)) return;
    const localOpts = options && typeof options === 'object' ? options : {};
    const count = Math.max(1, Math.min(28, Math.trunc(Number(localOpts.count) || 10)));
    const power = Math.max(0, Number(localOpts.power) || 120);
    const baseSize = Math.max(1, Number(localOpts.size) || 2.4);
    for (let i = 0; i < count; i += 1) {
      if (particles.length >= SURFACE_FIELD_MAX_PARTICLES) particles.shift();
      const angle = Math.random() * Math.PI * 2;
      const speed = power * (0.22 + Math.random() * 0.78);
      const dist = Math.random() * 20;
      const ttl = 2.2 + Math.random() * 2.7;
      particles.push({
        kind: 'dust',
        x: Number(world.x) + Math.cos(angle) * dist,
        y: Number(world.y) + Math.sin(angle) * dist,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        ttl,
        maxTtl: ttl,
        size: baseSize * (0.7 + Math.random() * 1.2),
        hue: Math.random() < 0.55 ? 195 : (Math.random() < 0.5 ? 285 : 330),
      });
    }
  }

  function spawnCorpse(enemy = null, world = null) {
    if (!isFinitePoint(world)) return;
    const type = String(enemy?.enemyType || '').trim().toLowerCase();
    const radius = Math.max(14, Number(enemy?.hitRadiusWorld) || Number(enemy?.radiusWorld) || 34);
    const templates = type === 'spawner'
      ? [
          ['rect', 1.15, 0.42], ['rect', 0.9, 0.36], ['tri', 0.7, 0.7],
          ['line', 1.3, 0.18], ['rect', 0.62, 0.38], ['tri', 0.5, 0.5],
        ]
      : type === 'drawsnake'
        ? [
            ['line', 1.6, 0.16], ['line', 1.35, 0.16], ['line', 1.1, 0.16],
            ['tri', 0.55, 0.55], ['rect', 0.58, 0.26],
          ]
        : type === 'composer-group-member'
          ? [['tri', 0.55, 0.55], ['rect', 0.48, 0.3], ['line', 0.72, 0.14]]
          : [['rect', 0.78, 0.34], ['tri', 0.68, 0.68], ['line', 1.05, 0.16], ['rect', 0.52, 0.42]];
    const hueBase = type === 'spawner' ? 194 : (type === 'drawsnake' ? 304 : (type === 'composer-group-member' ? 46 : 220));
    for (let i = 0; i < templates.length; i += 1) {
      if (particles.length >= SURFACE_FIELD_MAX_PARTICLES) particles.shift();
      const [shape, lenScale, thickScale] = templates[i];
      const angle = (i / Math.max(1, templates.length)) * Math.PI * 2 + Math.random() * 0.55;
      const speed = 35 + Math.random() * 95;
      const ttl = 9 + Math.random() * 5;
      particles.push({
        kind: 'shard',
        shape,
        x: Number(world.x) + Math.cos(angle) * radius * 0.28,
        y: Number(world.y) + Math.sin(angle) * radius * 0.28,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        ttl,
        maxTtl: ttl,
        size: Math.max(10, radius * 0.84),
        lengthScale: Number(lenScale) || 1,
        thicknessScale: Number(thickScale) || 0.3,
        rot: angle + Math.PI * (Math.random() - 0.5),
        vr: (Math.random() - 0.5) * 2.2,
        hue: hueBase + (Math.random() - 0.5) * 24,
      });
    }
  }

  function pushDebris(centerWorld = null, radiusWorld = 160, power = 260) {
    if (!isFinitePoint(centerWorld) || !particles.length) return;
    const cx = Number(centerWorld.x) || 0;
    const cy = Number(centerWorld.y) || 0;
    const radius = Math.max(1, Number(radiusWorld) || 1);
    const force = Math.max(0, Number(power) || 0);
    for (const p of particles) {
      const dx = (Number(p.x) || 0) - cx;
      const dy = (Number(p.y) || 0) - cy;
      const d = Math.hypot(dx, dy);
      if (!(d < radius) || d <= 0.001) continue;
      const n = 1 - (d / radius);
      const kindBoost = p.kind === 'shard' ? 1.75 : (p.kind === 'ambient' ? 0.42 : 1);
      p.vx += (dx / d) * force * n * kindBoost;
      p.vy += (dy / d) * force * n * kindBoost;
      p.flash = Math.max(Number(p.flash) || 0, n * (p.kind === 'ambient' ? 0.35 : 1));
    }
  }

  function applyRepeller(centerWorld = null, radiusWorld = 180, power = 220, dt = 0, options = null) {
    if (!isFinitePoint(centerWorld) || !particles.length) return;
    const cx = Number(centerWorld.x) || 0;
    const cy = Number(centerWorld.y) || 0;
    const radius = Math.max(1, Number(radiusWorld) || 1);
    const force = Math.max(0, Number(power) || 0);
    const safeDt = Math.max(0, Math.min(0.08, Number(dt) || 0));
    const kindScale = options && typeof options.kindScale === 'object' ? options.kindScale : null;
    for (const p of particles) {
      const dx = (Number(p.x) || 0) - cx;
      const dy = (Number(p.y) || 0) - cy;
      const d = Math.hypot(dx, dy);
      if (!(d < radius) || d <= 0.001) continue;
      const n = 1 - (d / radius);
      const scale = Math.max(0, Number(kindScale?.[p.kind]) || 1);
      p.vx += (dx / d) * force * n * safeDt * scale;
      p.vy += (dy / d) * force * n * safeDt * scale;
      p.flash = Math.max(Number(p.flash) || 0, n * Math.min(1, scale));
    }
  }

  function applyShockwaveFronts(dt = 0) {
    const state = getState() || {};
    const effects = Array.isArray(state.effects) ? state.effects : [];
    if (!particles.length || !effects.length) return;
    const safeDt = Math.max(0, Math.min(0.08, Number(dt) || 0));
    for (const fx of effects) {
      if (fx?.kind !== 'pinball-shockwave') continue;
      const cx = Number(fx?.at?.x);
      const cy = Number(fx?.at?.y);
      if (!Number.isFinite(cx) || !Number.isFinite(cy)) continue;
      const currentRadius = Math.max(0, Number(fx.currentRadiusWorld) || 0);
      const previousRadius = Math.max(0, Number(fx.__surfaceFieldRadiusWorld) || Number(fx.previousRadiusWorld) || 0);
      const nextRadius = Math.max(currentRadius, previousRadius);
      const minRadius = Math.max(0, Math.min(previousRadius, nextRadius) - 60);
      const maxRadius = Math.max(minRadius + 1, nextRadius + Math.max(120, Number(fx.ringWidthWorld) || 170));
      const power = Math.max(0, Number(fx.pushPower) || 1250);
      for (const p of particles) {
        const dx = (Number(p.x) || 0) - cx;
        const dy = (Number(p.y) || 0) - cy;
        const d = Math.hypot(dx, dy);
        if (!(d >= minRadius && d <= maxRadius) || d <= 0.001) continue;
        const edgeDistance = Math.abs(d - nextRadius);
        const n = Math.max(0, 1 - edgeDistance / Math.max(80, Number(fx.ringWidthWorld) || 170));
        if (!(n > 0)) continue;
        const kindBoost = p.kind === 'shard' ? 1.45 : (p.kind === 'ambient' ? 0.18 : 0.65);
        p.vx += (dx / d) * power * n * safeDt * kindBoost;
        p.vy += (dy / d) * power * n * safeDt * kindBoost;
        p.flash = Math.max(Number(p.flash) || 0, n * (p.kind === 'ambient' ? 0.22 : 0.85));
      }
      fx.__surfaceFieldRadiusWorld = nextRadius;
    }
  }

  function maintainAmbientParticles(playerWorld = null) {
    const state = getState() || {};
    const center = state.arenaCenterWorld || playerWorld;
    if (!isFinitePoint(center)) return;
    const cx = Number(center.x) || 0;
    const cy = Number(center.y) || 0;
    const arenaRadiusWorld = Math.max(1, Number(constants.swarmArenaRadiusWorld) || 1100);
    const radius = Math.max(80, arenaRadiusWorld * 0.82);
    let ambientCount = 0;
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const p = particles[i];
      if (p?.kind !== 'ambient') continue;
      ambientCount += 1;
      const dx = (Number(p.x) || 0) - cx;
      const dy = (Number(p.y) || 0) - cy;
      if (Math.hypot(dx, dy) > radius * 1.08) {
        particles.splice(i, 1);
        ambientCount -= 1;
      }
    }
    while (ambientCount < SURFACE_FIELD_AMBIENT_TARGET && particles.length < SURFACE_FIELD_MAX_PARTICLES) {
      const angle = Math.random() * Math.PI * 2;
      const dist = radius * Math.sqrt(Math.random()) * 0.98;
      const drift = 5 + Math.random() * 14;
      const tangent = angle + Math.PI * 0.5 + (Math.random() - 0.5) * 0.9;
      const ttl = 7 + Math.random() * 6;
      particles.push({
        kind: 'ambient',
        x: cx + Math.cos(angle) * dist,
        y: cy + Math.sin(angle) * dist,
        vx: Math.cos(tangent) * drift,
        vy: Math.sin(tangent) * drift,
        ttl,
        maxTtl: ttl,
        size: 3.2 + Math.random() * 3.8,
        hue: Math.random() < 0.55 ? 194 : (Math.random() < 0.5 ? 286 : 326),
        pulse: Math.random() * Math.PI * 2,
      });
      ambientCount += 1;
    }
  }

  function update(dt = 0, playerWorld = null) {
    if (!canvasEl || typeof canvasEl.getContext !== 'function') return;
    const w = Math.max(1, Math.trunc(Number(globalThis.window?.innerWidth) || 1));
    const h = Math.max(1, Math.trunc(Number(globalThis.window?.innerHeight) || 1));
    if (canvasW !== w || canvasH !== h) {
      canvasW = w;
      canvasH = h;
      canvasEl.width = w;
      canvasEl.height = h;
    }
    const ctx = canvasEl.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    const safeDt = Math.max(0, Math.min(0.05, Number(dt) || 0));
    const player = playerWorld && typeof playerWorld === 'object' ? playerWorld : null;
    maintainAmbientParticles(player);
    if (!particles.length) return;
    applyShockwaveFronts(safeDt);
    const state = getState() || {};
    if (player) {
      applyRepeller(player, 210, 270, safeDt, {
        kindScale: { ambient: 1.15, dust: 0.8, shard: 0.35 },
      });
    }
    if (state.dragPointerId !== null && Number.isFinite(Number(state.dragNowX)) && Number.isFinite(Number(state.dragNowY))) {
      const pointerWorld = screenToWorld({ x: Number(state.dragNowX) || 0, y: Number(state.dragNowY) || 0 });
      if (isFinitePoint(pointerWorld)) {
        applyRepeller(pointerWorld, 190, 360, safeDt, {
          kindScale: { ambient: 1.45, dust: 0.95, shard: 0.3 },
        });
      }
    }
    const velocityX = Number(state.velocityX) || 0;
    const velocityY = Number(state.velocityY) || 0;
    if (player && Math.hypot(velocityX, velocityY) > 20) {
      const px = Number(player.x) || 0;
      const py = Number(player.y) || 0;
      for (const p of particles) {
        const dx = (Number(p.x) || 0) - px;
        const dy = (Number(p.y) || 0) - py;
        const d = Math.hypot(dx, dy);
        if (!(d < 150) || d <= 0.001) continue;
        const n = 1 - d / 150;
        p.vx += ((dx / d) * 145 + velocityX * 0.14) * n * safeDt;
        p.vy += ((dy / d) * 145 + velocityY * 0.14) * n * safeDt;
        p.flash = Math.max(Number(p.flash) || 0, n * 0.8);
      }
    }
    const phase = Number(state.starfieldVisualPhase) || 0;
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const p = particles[i];
      p.ttl = Math.max(0, Number(p.ttl) - safeDt);
      if (p.ttl <= 0) {
        particles.splice(i, 1);
        continue;
      }
      p.x += (Number(p.vx) || 0) * safeDt;
      p.y += (Number(p.vy) || 0) * safeDt;
      p.vx *= Math.pow(p.kind === 'ambient' ? 0.82 : (p.kind === 'shard' ? 0.34 : 0.22), safeDt);
      p.vy *= Math.pow(p.kind === 'ambient' ? 0.82 : (p.kind === 'shard' ? 0.34 : 0.22), safeDt);
      p.rot = (Number(p.rot) || 0) + (Number(p.vr) || 0) * safeDt;
      p.flash = Math.max(0, (Number(p.flash) || 0) - safeDt * 1.25);
      const s = worldToScreen({ x: p.x, y: p.y });
      if (!isFinitePoint(s)) continue;
      if (s.x < -40 || s.y < -40 || s.x > w + 40 || s.y > h + 40) continue;
      const life = Math.max(0, Math.min(1, p.ttl / Math.max(0.001, Number(p.maxTtl) || 1)));
      const hue = Math.trunc(Number(p.hue) || 195);
      if (p.kind === 'ambient') {
        const pulse = 0.72 + 0.28 * Math.sin(phase * 1.4 + (Number(p.pulse) || 0));
        const speedGlow = Math.min(0.65, Math.hypot(Number(p.vx) || 0, Number(p.vy) || 0) / 260);
        const flashGlow = Math.min(0.55, Number(p.flash) || 0);
        ctx.globalAlpha = Math.max(0, Math.min(0.72, life * (0.44 + speedGlow + flashGlow) * pulse));
        ctx.fillStyle = `hsl(${hue} 100% 78%)`;
        const size = Math.max(1, Number(p.size) || 2) * (0.95 + pulse * 0.35 + speedGlow * 0.4 + flashGlow * 0.55);
        ctx.fillRect(s.x - size * 0.5, s.y - size * 0.5, size, size);
      } else if (p.kind === 'shard') {
        const size = Math.max(4, Number(p.size) || 10) * (0.74 + life * 0.24);
        const len = size * Math.max(0.25, Number(p.lengthScale) || 1);
        const thick = Math.max(2, size * Math.max(0.1, Number(p.thicknessScale) || 0.3));
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(Number(p.rot) || 0);
        ctx.globalAlpha = Math.min(0.95, life * (0.7 + Math.min(0.35, Number(p.flash) || 0)));
        ctx.fillStyle = `hsl(${hue} 92% 67%)`;
        ctx.strokeStyle = `hsl(${hue} 100% 82%)`;
        ctx.lineWidth = 1.2;
        if (p.shape === 'tri') {
          ctx.beginPath();
          ctx.moveTo(len * 0.48, 0);
          ctx.lineTo(-len * 0.28, -thick * 0.9);
          ctx.lineTo(-len * 0.42, thick * 0.78);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        } else if (p.shape === 'line') {
          ctx.beginPath();
          ctx.moveTo(-len * 0.5, 0);
          ctx.lineTo(len * 0.5, 0);
          ctx.stroke();
        } else {
          ctx.fillRect(-len * 0.5, -thick * 0.5, len, thick);
          ctx.strokeRect(-len * 0.5, -thick * 0.5, len, thick);
        }
        ctx.restore();
      } else {
        ctx.globalAlpha = life * 0.68;
        ctx.fillStyle = `hsl(${hue} 100% 76%)`;
        const size = Math.max(1, Number(p.size) || 2) * (0.75 + life * 0.55);
        ctx.fillRect(s.x - size * 0.5, s.y - size * 0.5, size, size);
      }
    }
    ctx.globalAlpha = 1;
  }

  function clear() {
    particles.length = 0;
    try {
      const ctx = canvasEl?.getContext?.('2d');
      ctx?.clearRect?.(0, 0, canvasEl.width || 0, canvasEl.height || 0);
    } catch {}
  }

  return {
    setCanvas,
    spawnDebris,
    spawnCorpse,
    pushDebris,
    update,
    clear,
  };
}
