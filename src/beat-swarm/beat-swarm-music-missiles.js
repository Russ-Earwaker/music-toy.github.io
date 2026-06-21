const STYLE_ID = 'beat-swarm-music-missile-style';
const MAX_ITEMS = 8;
const PICKUP_TRAVEL_SPEED = 520;
const PICKUP_COLLECT_RADIUS = 76;
const PICKUP_MAGNET_RADIUS = 260;
const PICKUP_MAGNET_SPEED = 1500;
const MISSILE_ORBIT_RADIUS = 270;
const MISSILE_ORBIT_SPEED = 1.85;
const MISSILE_SEEK_SPEED = 980;
const MISSILE_TURN_RATE = 6.4;
const MISSILE_HIT_RADIUS = 58;
const MISSILE_MAX_SEEK_SECONDS = 4;
const ENEMY_RAM_RADIUS = 72;
const TRAIL_SAMPLE_SECONDS = 0.035;
const TRAIL_LIFETIME_SECONDS = 0.9;
const TRAIL_MIN_SEGMENT_WORLD = 8;

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function point(value = null) {
  return {
    x: Number(value?.x) || 0,
    y: Number(value?.y) || 0,
  };
}

function normalize(x = 0, y = 0, fallbackX = 1, fallbackY = 0) {
  const len = Math.hypot(Number(x) || 0, Number(y) || 0);
  if (len > 0.0001) return { x: x / len, y: y / len };
  const fallbackLen = Math.max(0.0001, Math.hypot(fallbackX, fallbackY));
  return { x: fallbackX / fallbackLen, y: fallbackY / fallbackLen };
}

function getClockStep(clock = null, stepCount = 16) {
  const raw = Number.isFinite(Number(clock?.motifStepIndex))
    ? Number(clock.motifStepIndex)
    : (Number.isFinite(Number(clock?.stepIndex)) ? Number(clock.stepIndex) : 0);
  const count = Math.max(1, Math.trunc(Number(stepCount) || 16));
  return ((Math.trunc(raw) % count) + count) % count;
}

function getClockTick(clock = null) {
  const raw = Number.isFinite(Number(clock?.tickIndex))
    ? Number(clock.tickIndex)
    : (Number.isFinite(Number(clock?.absoluteStepIndex)) ? Number(clock.absoluteStepIndex) : Number(clock?.stepIndex));
  return Math.max(0, Math.trunc(Number(raw) || 0));
}

function installStyles() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .beat-swarm-music-missile-layer { position: fixed; inset: 0; z-index: 7; pointer-events: none; }
    .beat-swarm-music-pickup,
    .beat-swarm-music-missile { position: fixed; left: 0; top: 0; transform: translate(-9999px, -9999px); pointer-events: none; }
    .beat-swarm-music-pickup {
      width: 56px; height: 56px; margin: -28px 0 0 -28px; border-radius: 50%;
      border: 2px solid rgba(255,255,255,.92);
      background: radial-gradient(circle, rgba(255,255,255,.98) 0 13%, rgba(142,224,255,.7) 30%, rgba(102,139,255,.16) 68%, transparent 72%);
      box-shadow: 0 0 18px rgba(255,255,255,.8), 0 0 34px rgba(117,205,255,.48);
    }
    .beat-swarm-music-pickup::before {
      content: ''; position: absolute; inset: -74px; border-radius: 50%;
      border: 1px solid rgba(168,226,255,.2); box-shadow: inset 0 0 26px rgba(129,203,255,.08);
    }
    .beat-swarm-music-pickup.is-magnetic::before { border-color: rgba(220,247,255,.62); box-shadow: 0 0 24px rgba(160,222,255,.3), inset 0 0 30px rgba(160,222,255,.18); }
    .beat-swarm-music-pickup::after { content: '\\266A'; display: grid; place-items: center; height: 100%; color: #fff; font: 700 25px/1 system-ui; text-shadow: 0 0 10px #fff; }
    .beat-swarm-music-missile {
      width: 29px; height: 12px; margin: -6px 0 0 -15px; border-radius: 55% 80% 80% 55%;
      border: 1px solid rgba(255,255,255,.95);
      background: linear-gradient(180deg, #fff 0 18%, #bfeeff 38%, #739eff 72%, #4d58df 100%);
      box-shadow: 0 0 16px rgba(255,255,255,.92), 0 0 34px rgba(116,182,255,.72);
      transform-origin: 50% 50%;
    }
    .beat-swarm-music-missile::before {
      content: ''; position: absolute; left: 3px; top: -4px; width: 11px; height: 19px;
      background: linear-gradient(90deg, rgba(121,145,255,.92), rgba(235,247,255,.98));
      clip-path: polygon(0 0, 100% 29%, 100% 71%, 0 100%, 30% 50%);
      z-index: -1;
    }
    .beat-swarm-music-missile::after {
      content: ''; position: absolute; right: 100%; top: 50%; width: 12px; height: 6px; transform: translateY(-50%);
      border-radius: 999px;
      background: linear-gradient(90deg, transparent, rgba(108,176,255,.22) 28%, rgba(210,243,255,.86) 82%, #fff 100%);
      filter: blur(1px); box-shadow: 0 0 14px rgba(142,211,255,.62);
    }
    .beat-swarm-music-missile-trail {
      position: fixed; left: 0; top: 0; height: 5px; transform-origin: left center;
      border-radius: 999px; pointer-events: none;
      background: rgba(210, 240, 255, .9);
      box-shadow: 0 0 10px rgba(139,207,255,.54);
    }
    .beat-swarm-music-missile.is-seeking { box-shadow: 0 0 18px #fff, 0 0 42px rgba(164,116,255,.9); }
    .beat-swarm-music-missile-prompt {
      position: fixed; left: 50%; bottom: 118px; transform: translateX(-50%);
      color: rgba(255,255,255,.94); font: 700 14px/1 system-ui; letter-spacing: 0;
      text-shadow: 0 0 12px rgba(135,207,255,.9); opacity: 0; transition: opacity 120ms ease;
    }
    .beat-swarm-music-missile-prompt.is-visible { opacity: 1; }
  `;
  document.head.appendChild(style);
}

export function createBeatSwarmMusicMissileRuntime(deps = {}) {
  const state = {
    active: false,
    eventId: '',
    themeId: 'accentRhythm',
    laneId: 'secondary_loop_lane',
    stepCount: 16,
    targetHitCount: MAX_ITEMS,
    placementMode: 'free',
    nextId: 1,
    lastClockTick: -1,
    lastCarrierTick: -1000000,
    wasInputHeld: false,
    pickups: [],
    missiles: [],
    trails: [],
    pendingDetonations: [],
    motifHits: new Set(),
    postCompleteUntilTick: -1,
    postCompleteNotified: false,
    rootEl: null,
    promptEl: null,
  };

  function ensureRoot() {
    installStyles();
    const overlay = deps.getOverlayEl?.() || document.body;
    if (!(overlay instanceof HTMLElement)) return null;
    if (!(state.rootEl instanceof HTMLElement)) {
      state.rootEl = document.createElement('div');
      state.rootEl.className = 'beat-swarm-music-missile-layer';
      overlay.appendChild(state.rootEl);
    }
    if (!(state.promptEl instanceof HTMLElement)) {
      state.promptEl = document.createElement('div');
      state.promptEl.className = 'beat-swarm-music-missile-prompt';
      state.promptEl.textContent = 'RELEASE TO LAUNCH';
      state.rootEl.appendChild(state.promptEl);
    }
    return state.rootEl;
  }

  function removeEntry(entry) {
    try { entry?.el?.remove?.(); } catch {}
  }

  function clear() {
    state.pickups.forEach(removeEntry);
    state.missiles.forEach(removeEntry);
    state.trails.forEach(removeEntry);
    state.pendingDetonations.length = 0;
    state.pickups.length = 0;
    state.missiles.length = 0;
    state.trails.length = 0;
    state.motifHits.clear();
    state.postCompleteUntilTick = -1;
    state.postCompleteNotified = false;
    try { state.rootEl?.remove?.(); } catch {}
    state.rootEl = null;
    state.promptEl = null;
  }

  function start(options = null) {
    const opts = options && typeof options === 'object' ? options : {};
    clear();
    state.active = true;
    state.eventId = String(opts.eventId || '').trim();
    state.themeId = String(opts.themeId || 'accentRhythm').trim() || 'accentRhythm';
    state.laneId = String(opts.laneId || 'secondary_loop_lane').trim() || 'secondary_loop_lane';
    state.stepCount = Math.max(1, Math.trunc(Number(opts.stepCount) || 16));
    state.targetHitCount = Math.max(1, Math.min(MAX_ITEMS, Math.trunc(Number(opts.targetHitCount) || MAX_ITEMS)));
    state.placementMode = String(opts.placementMode || 'free').trim().toLowerCase() || 'free';
    state.nextId = 1;
    state.lastClockTick = -1;
    state.lastCarrierTick = -1000000;
    state.wasInputHeld = deps.isInputHeld?.() === true;
    ensureRoot();
  }

  function stop() {
    state.active = false;
    state.eventId = '';
    clear();
  }

  function getReservedCount() {
    return state.pickups.length + state.missiles.length + state.pendingDetonations.length + state.motifHits.size;
  }

  function canAcceptDrop() {
    return state.active && getReservedCount() < state.targetHitCount;
  }

  function noteCarrierSpawned() {
    state.lastCarrierTick = getClockTick(deps.getBeatClock?.());
  }

  function shouldSpawnCarrier() {
    if (!canAcceptDrop()) return false;
    const tick = getClockTick(deps.getBeatClock?.());
    return (tick - state.lastCarrierTick) >= Math.max(4, Math.floor(state.stepCount / 2));
  }

  function spawnPickupFromCarrierDeath(options = null) {
    if (!canAcceptDrop()) return null;
    const root = ensureRoot();
    if (!(root instanceof HTMLElement)) return null;
    const source = point(options?.world || options);
    const index = getReservedCount();
    const el = document.createElement('div');
    el.className = 'beat-swarm-music-pickup';
    root.appendChild(el);
    const pickup = {
      id: state.nextId++,
      x: source.x,
      y: source.y,
      anchorAngle: (-Math.PI / 2) + (index * Math.PI * 2 / state.targetHitCount),
      anchorRadiusN: index % 2 === 0 ? 0.56 : 0.72,
      magneticLatched: false,
      el,
    };
    state.pickups.push(pickup);
    deps.onPickupSpawned?.({ id: pickup.id, eventId: state.eventId, themeId: state.themeId });
    return pickup;
  }

  function pickOpenOrbitAngle() {
    const angles = state.missiles
      .filter((entry) => entry.state === 'orbit')
      .map((entry) => ((Number(entry.angle) % (Math.PI * 2)) + (Math.PI * 2)) % (Math.PI * 2))
      .sort((a, b) => a - b);
    if (!angles.length) return 0;
    let bestStart = angles[0];
    let bestGap = -1;
    for (let i = 0; i < angles.length; i += 1) {
      const start = angles[i];
      const end = i === angles.length - 1 ? angles[0] + (Math.PI * 2) : angles[i + 1];
      const gap = end - start;
      if (gap > bestGap) {
        bestGap = gap;
        bestStart = start;
      }
    }
    return (bestStart + bestGap * 0.5) % (Math.PI * 2);
  }

  function spawnOrbitingMissile() {
    if (state.missiles.length >= MAX_ITEMS) return null;
    const root = ensureRoot();
    const center = point(deps.getPlayerWorld?.());
    const el = document.createElement('div');
    el.className = 'beat-swarm-music-missile';
    root?.appendChild?.(el);
    const missile = {
      id: state.nextId++,
      state: 'orbit',
      x: center.x,
      y: center.y,
      vx: 0,
      vy: 0,
      angle: pickOpenOrbitAngle(),
      targetEnemyId: 0,
      trailSampleT: 0,
      trailLastX: center.x,
      trailLastY: center.y,
      trailPrimed: false,
      seekSeconds: 0,
      el,
    };
    state.missiles.push(missile);
    deps.onMissileCollected?.({ id: missile.id, eventId: state.eventId, activeCount: state.missiles.length });
    return missile;
  }

  function findEnemyById(id = 0) {
    return (deps.getEnemies?.() || []).find((enemy) => Math.trunc(Number(enemy?.id) || 0) === Math.trunc(Number(id) || 0)) || null;
  }

  function getNearestEnemy(x = 0, y = 0, excludedEnemyIds = null) {
    let best = null;
    let bestD2 = Infinity;
    for (const enemy of deps.getEnemies?.() || []) {
      if (!enemy || enemy.__bsRemoved || Number(enemy.hp) <= 0 || enemy.retreating === true) continue;
      const enemyId = Math.trunc(Number(enemy.id) || 0);
      if (excludedEnemyIds instanceof Set && excludedEnemyIds.has(enemyId)) continue;
      const dx = (Number(enemy.wx) || 0) - x;
      const dy = (Number(enemy.wy) || 0) - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = enemy;
      }
    }
    return best;
  }

  function releaseAllMissiles() {
    const orbiting = state.missiles.filter((entry) => entry.state === 'orbit');
    const reservedTargets = new Set(
      state.missiles
        .filter((entry) => entry.state === 'seek' && Number(entry.targetEnemyId) > 0)
        .map((entry) => Math.trunc(Number(entry.targetEnemyId) || 0))
    );
    let released = 0;
    for (const missile of orbiting) {
      const target = getNearestEnemy(missile.x, missile.y, reservedTargets);
      missile.state = 'seek';
      missile.seekSeconds = 0;
      missile.targetEnemyId = Math.trunc(Number(target?.id) || 0);
      if (missile.targetEnemyId > 0) reservedTargets.add(missile.targetEnemyId);
      const dir = target
        ? normalize((Number(target.wx) || 0) - missile.x, (Number(target.wy) || 0) - missile.y)
        : normalize(Math.cos(missile.angle), Math.sin(missile.angle));
      missile.vx = dir.x * MISSILE_SEEK_SPEED;
      missile.vy = dir.y * MISSILE_SEEK_SPEED;
      missile.el?.classList?.add?.('is-seeking');
      deps.onMissileReleased?.({ id: missile.id, targetEnemyId: missile.targetEnemyId, eventId: state.eventId });
      released += 1;
    }
    return released;
  }

  function findNextFreeStep(fromStep = 0) {
    const reserved = new Set(state.motifHits);
    state.pendingDetonations.forEach((entry) => reserved.add(entry.stepIndex));
    for (let offset = 1; offset <= state.stepCount; offset += 1) {
      const stepIndex = (fromStep + offset) % state.stepCount;
      if (!reserved.has(stepIndex)) return { stepIndex, offset };
    }
    return null;
  }

  function queueDetonation(missile, at, enemy = null, reason = 'impact') {
    if (!missile || missile.state === 'queued') return false;
    const clock = deps.getBeatClock?.() || {};
    const slot = findNextFreeStep(getClockStep(clock, state.stepCount));
    if (!slot) return false;
    missile.state = 'queued';
    removeEntry(missile);
    const idx = state.missiles.indexOf(missile);
    if (idx >= 0) state.missiles.splice(idx, 1);
    state.pendingDetonations.push({
      id: missile.id,
      at: point(at),
      enemyId: Math.trunc(Number(enemy?.id) || 0),
      stepIndex: slot.stepIndex,
      triggerTick: getClockTick(clock) + slot.offset,
      reason,
    });
    deps.onMissileImpactQueued?.({ id: missile.id, stepIndex: slot.stepIndex, reason, eventId: state.eventId });
    return true;
  }

  function detonate(entry) {
    state.motifHits.add(entry.stepIndex);
    state.lastClockTick = getClockTick(deps.getBeatClock?.());
    deps.createMusicExplosion?.({
      at: entry.at,
      enemyId: entry.enemyId,
      stepIndex: entry.stepIndex,
      themeId: state.themeId,
      laneId: state.laneId,
      eventId: state.eventId,
      hitCount: state.motifHits.size,
      targetHitCount: state.targetHitCount,
    });
    deps.playMotifNote?.({
      stepIndex: entry.stepIndex,
      themeId: state.themeId,
      laneId: state.laneId,
      eventId: state.eventId,
      hitCount: state.motifHits.size,
      targetHitCount: state.targetHitCount,
    });
    const complete = state.motifHits.size >= state.targetHitCount;
    if (complete) {
      state.active = false;
      state.postCompleteUntilTick = state.lastClockTick + (state.stepCount * 2);
      state.postCompleteNotified = false;
    }
    deps.onMotifHit?.({
      stepIndex: entry.stepIndex,
      themeId: state.themeId,
      laneId: state.laneId,
      eventId: state.eventId,
      hitCount: state.motifHits.size,
      targetHitCount: state.targetHitCount,
      complete,
      steps: getMotifSteps(),
    });
  }

  function getMotifSteps() {
    return Array.from({ length: state.stepCount }, (_, index) => state.motifHits.has(index));
  }

  function renderAt(el, world, angleRad = null) {
    const screen = deps.worldToScreen?.(world);
    if (!el || !screen || !Number.isFinite(screen.x) || !Number.isFinite(screen.y)) return;
    const rotation = Number.isFinite(Number(angleRad)) ? ` rotate(${(Number(angleRad) * 180 / Math.PI).toFixed(2)}deg)` : '';
    el.style.transform = `translate(${screen.x.toFixed(2)}px, ${screen.y.toFixed(2)}px)${rotation}`;
  }

  function appendTrailSegment(missile, dt) {
    if (!missile) return;
    missile.trailSampleT = Math.max(0, Number(missile.trailSampleT) || 0) + dt;
    if (missile.trailPrimed !== true) {
      missile.trailPrimed = true;
      missile.trailLastX = missile.x;
      missile.trailLastY = missile.y;
      missile.trailSampleT = 0;
      return;
    }
    const dx = missile.x - Number(missile.trailLastX);
    const dy = missile.y - Number(missile.trailLastY);
    if (missile.trailSampleT < TRAIL_SAMPLE_SECONDS || Math.hypot(dx, dy) < TRAIL_MIN_SEGMENT_WORLD) return;
    const root = ensureRoot();
    const el = document.createElement('div');
    el.className = 'beat-swarm-music-missile-trail';
    root?.appendChild?.(el);
    state.trails.push({
      from: { x: Number(missile.trailLastX) || 0, y: Number(missile.trailLastY) || 0 },
      to: { x: missile.x, y: missile.y },
      ttl: TRAIL_LIFETIME_SECONDS,
      el,
    });
    missile.trailLastX = missile.x;
    missile.trailLastY = missile.y;
    missile.trailSampleT = 0;
  }

  function updateTrails(dt) {
    for (let i = state.trails.length - 1; i >= 0; i -= 1) {
      const trail = state.trails[i];
      trail.ttl = Math.max(0, Number(trail.ttl) - dt);
      if (trail.ttl <= 0) {
        removeEntry(trail);
        state.trails.splice(i, 1);
        continue;
      }
      const from = deps.worldToScreen?.(trail.from);
      const to = deps.worldToScreen?.(trail.to);
      if (!from || !to) continue;
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const length = Math.max(1, Math.hypot(dx, dy));
      const angle = Math.atan2(dy, dx) * 180 / Math.PI;
      const lifeN = clamp01(trail.ttl / TRAIL_LIFETIME_SECONDS);
      trail.el.style.width = `${length.toFixed(2)}px`;
      trail.el.style.opacity = `${(lifeN * lifeN).toFixed(3)}`;
      trail.el.style.height = `${(1.5 + (3.5 * lifeN)).toFixed(2)}px`;
      trail.el.style.transform = `translate(${from.x.toFixed(2)}px, ${from.y.toFixed(2)}px) rotate(${angle.toFixed(2)}deg)`;
    }
  }

  function updatePickups(dt, player) {
    const arena = point(deps.getArenaCenterWorld?.());
    const arenaRadius = Math.max(120, Number(deps.getArenaRadius?.()) || 500);
    for (let i = state.pickups.length - 1; i >= 0; i -= 1) {
      const pickup = state.pickups[i];
      let target = {
        x: arena.x + Math.cos(pickup.anchorAngle) * arenaRadius * pickup.anchorRadiusN,
        y: arena.y + Math.sin(pickup.anchorAngle) * arenaRadius * pickup.anchorRadiusN,
      };
      const playerDist = Math.hypot(pickup.x - player.x, pickup.y - player.y);
      if (playerDist <= PICKUP_MAGNET_RADIUS) pickup.magneticLatched = true;
      const magnetic = pickup.magneticLatched === true;
      if (magnetic) target = player;
      pickup.el?.classList?.toggle?.('is-magnetic', magnetic);
      const dx = target.x - pickup.x;
      const dy = target.y - pickup.y;
      const dist = Math.hypot(dx, dy);
      const speed = magnetic
        ? Math.min(2400, PICKUP_MAGNET_SPEED + (playerDist * 1.5))
        : PICKUP_TRAVEL_SPEED;
      const step = Math.min(dist, speed * dt);
      if (dist > 0.001) {
        pickup.x += dx / dist * step;
        pickup.y += dy / dist * step;
      }
      renderAt(pickup.el, pickup);
      if (Math.hypot(pickup.x - player.x, pickup.y - player.y) > PICKUP_COLLECT_RADIUS) continue;
      removeEntry(pickup);
      state.pickups.splice(i, 1);
      spawnOrbitingMissile();
    }
  }

  function updateMissiles(dt, player) {
    for (const missile of state.missiles.slice()) {
      if (missile.state === 'orbit') {
        missile.angle += MISSILE_ORBIT_SPEED * dt;
        missile.x = player.x + Math.cos(missile.angle) * MISSILE_ORBIT_RADIUS;
        missile.y = player.y + Math.sin(missile.angle) * MISSILE_ORBIT_RADIUS;
      } else if (missile.state === 'seek') {
        missile.seekSeconds = Math.max(0, Number(missile.seekSeconds) || 0) + dt;
        let target = findEnemyById(missile.targetEnemyId);
        if (!target) {
          const reservedTargets = new Set(
            state.missiles
              .filter((entry) => entry !== missile && entry.state === 'seek' && Number(entry.targetEnemyId) > 0)
              .map((entry) => Math.trunc(Number(entry.targetEnemyId) || 0))
          );
          target = getNearestEnemy(missile.x, missile.y, reservedTargets);
          missile.targetEnemyId = Math.trunc(Number(target?.id) || 0);
        }
        if (target) {
          const desired = normalize((Number(target.wx) || 0) - missile.x, (Number(target.wy) || 0) - missile.y, missile.vx, missile.vy);
          const current = normalize(missile.vx, missile.vy, desired.x, desired.y);
          const steer = clamp01(MISSILE_TURN_RATE * dt);
          const dir = normalize(current.x * (1 - steer) + desired.x * steer, current.y * (1 - steer) + desired.y * steer, desired.x, desired.y);
          missile.vx = dir.x * MISSILE_SEEK_SPEED;
          missile.vy = dir.y * MISSILE_SEEK_SPEED;
          missile.x += missile.vx * dt;
          missile.y += missile.vy * dt;
          if (Math.hypot((Number(target.wx) || 0) - missile.x, (Number(target.wy) || 0) - missile.y) <= MISSILE_HIT_RADIUS) {
            queueDetonation(missile, { x: target.wx, y: target.wy }, target, 'released_homing_hit');
            continue;
          }
        } else {
          missile.x += missile.vx * dt;
          missile.y += missile.vy * dt;
        }
        if (missile.seekSeconds >= MISSILE_MAX_SEEK_SECONDS) {
          queueDetonation(missile, { x: missile.x, y: missile.y }, target, 'seek_timeout');
          continue;
        }
      }
      appendTrailSegment(missile, dt);
      if (missile.state === 'orbit') {
        const ramTarget = getNearestEnemy(missile.x, missile.y);
        if (ramTarget && Math.hypot((Number(ramTarget.wx) || 0) - missile.x, (Number(ramTarget.wy) || 0) - missile.y) <= ENEMY_RAM_RADIUS) {
          queueDetonation(missile, { x: ramTarget.wx, y: ramTarget.wy }, ramTarget, 'orbit_ram_hit');
          continue;
        }
      }
      const facing = missile.state === 'seek'
        ? Math.atan2(missile.vy, missile.vx)
        : (missile.angle + Math.PI / 2);
      renderAt(missile.el, missile, facing);
    }
  }

  function updatePendingDetonations() {
    const tick = getClockTick(deps.getBeatClock?.());
    for (let i = state.pendingDetonations.length - 1; i >= 0; i -= 1) {
      const entry = state.pendingDetonations[i];
      if (tick < entry.triggerTick) continue;
      state.pendingDetonations.splice(i, 1);
      detonate(entry);
    }
  }

  function updateMotifLoop() {
    if (!state.motifHits.size) return;
    if (!state.active && state.postCompleteUntilTick < 0) return;
    const clock = deps.getBeatClock?.() || {};
    const tick = getClockTick(clock);
    if (state.postCompleteUntilTick >= 0 && tick > state.postCompleteUntilTick) {
      state.postCompleteUntilTick = -1;
      if (!state.postCompleteNotified) {
        state.postCompleteNotified = true;
        deps.onPostCompletePlayback?.({
          eventId: state.eventId,
          themeId: state.themeId,
          laneId: state.laneId,
          steps: getMotifSteps(),
        });
      }
      return;
    }
    if (tick === state.lastClockTick) return;
    state.lastClockTick = tick;
    const stepIndex = getClockStep(clock, state.stepCount);
    if (!state.motifHits.has(stepIndex)) return;
    deps.playMotifNote?.({
      stepIndex,
      themeId: state.themeId,
      laneId: state.laneId,
      eventId: state.eventId,
      loopPlayback: true,
      hitCount: state.motifHits.size,
      targetHitCount: state.targetHitCount,
    });
  }

  function update(dt = 0) {
    if (!state.active && state.postCompleteUntilTick < 0 && !state.missiles.length && !state.pendingDetonations.length && !state.trails.length) return;
    ensureRoot();
    const safeDt = Math.max(0, Math.min(0.1, Number(dt) || 0));
    const player = point(deps.getPlayerWorld?.());
    updatePickups(safeDt, player);
    updateMissiles(safeDt, player);
    updateTrails(safeDt);
    updatePendingDetonations();
    updateMotifLoop();
    const inputHeld = deps.isInputHeld?.() === true;
    if (state.wasInputHeld && !inputHeld) releaseAllMissiles();
    state.wasInputHeld = inputHeld;
    const hasOrbiting = state.missiles.some((entry) => entry.state === 'orbit');
    if (state.promptEl) {
      state.promptEl.textContent = inputHeld ? 'RELEASE TO LAUNCH' : 'HOLD, THEN RELEASE';
      state.promptEl.classList.toggle('is-visible', hasOrbiting);
    }
  }

  return {
    start,
    stop,
    update,
    releaseAllMissiles,
    spawnPickupFromCarrierDeath,
    shouldSpawnCarrier,
    noteCarrierSpawned,
    canAcceptDrop,
    isActive: () => state.active,
    isPostCompletePlaybackActive: () => state.postCompleteUntilTick >= getClockTick(deps.getBeatClock?.()),
    getMotifSteps,
    getSnapshot: () => ({
      active: state.active,
      eventId: state.eventId,
      themeId: state.themeId,
      laneId: state.laneId,
      pickupCount: state.pickups.length,
      orbitingCount: state.missiles.filter((entry) => entry.state === 'orbit').length,
      seekingCount: state.missiles.filter((entry) => entry.state === 'seek').length,
      pendingDetonationCount: state.pendingDetonations.length,
      hitCount: state.motifHits.size,
      targetHitCount: state.targetHitCount,
      complete: state.motifHits.size >= state.targetHitCount,
      postCompletePlaybackActive: state.postCompleteUntilTick >= getClockTick(deps.getBeatClock?.()),
    }),
  };
}
