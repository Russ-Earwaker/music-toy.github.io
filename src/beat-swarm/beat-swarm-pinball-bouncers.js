const STYLE_ID = 'beat-swarm-pinball-bouncer-style';
const MAX_HITS = 8;
const MAX_ACTIVE_BOUNCERS = 3;
const ARRIVAL_SECONDS = 3.0;
const HIT_FLASH_SECONDS = 0.18;
const BOUNCER_HIT_RADIUS = 132;
const BOUNCER_BOUNCE_POWER = 1220;
const POST_COMPLETE_LOOP_STEPS = 16;
const TWO_PI = Math.PI * 2;

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

function distancePointToSegment(pointLike = null, aLike = null, bLike = null) {
  const p = point(pointLike);
  const a = point(aLike);
  const b = point(bLike);
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const len2 = abx * abx + aby * aby;
  if (len2 <= 0.0001) return Math.hypot(p.x - b.x, p.y - b.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2));
  const x = a.x + abx * t;
  const y = a.y + aby * t;
  return Math.hypot(p.x - x, p.y - y);
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
    .beat-swarm-pinball-layer { position: fixed; inset: 0; z-index: 7; pointer-events: none; }
    .beat-swarm-pinball-bouncer {
      position: fixed; left: 0; top: 0; width: 156px; height: 156px; margin: -78px 0 0 -78px;
      transform: translate(-9999px, -9999px) scale(.2); pointer-events: none;
      border: 0;
      background:
        linear-gradient(145deg, rgba(54,63,82,.96), rgba(12,15,24,.98) 45%, rgba(5,7,14,.99)),
        radial-gradient(circle at 50% 54%, rgba(15,20,32,.98) 0 48%, rgba(5,7,14,.98) 49% 100%);
      box-shadow:
        0 18px 22px rgba(0,0,0,.36),
        inset 0 7px 10px rgba(255,255,255,.1),
        inset 0 -16px 24px rgba(0,0,0,.64),
        0 0 12px rgba(178,54,255,.1);
      opacity: .22;
      will-change: transform, opacity, box-shadow;
    }
    .beat-swarm-pinball-bouncer::before,
    .beat-swarm-pinball-bouncer::after {
      content: ""; position: absolute; pointer-events: none;
    }
    .beat-swarm-pinball-bouncer::before {
      inset: 0;
      border-radius: inherit;
      border: 15px solid rgba(114,39,154,.5);
      background:
        conic-gradient(from 0deg, transparent 0 13deg, rgba(255,224,255,.18) 13deg 18deg, transparent 18deg 58deg, rgba(255,82,221,.16) 58deg 65deg, transparent 65deg 105deg, rgba(255,224,255,.18) 105deg 110deg, transparent 110deg 180deg, rgba(255,82,221,.16) 180deg 187deg, transparent 187deg 242deg, rgba(255,224,255,.18) 242deg 247deg, transparent 247deg 305deg, rgba(255,82,221,.16) 305deg 312deg, transparent 312deg 360deg),
        linear-gradient(145deg, rgba(42,48,64,.98), rgba(15,17,27,.98));
      box-shadow:
        inset 0 5px 8px rgba(255,255,255,.14),
        inset 0 -8px 16px rgba(0,0,0,.66),
        0 0 10px rgba(201,69,255,.16);
      opacity: .6;
    }
    .beat-swarm-pinball-bouncer::after {
      inset: 34px;
      border-radius: inherit;
      background:
        linear-gradient(145deg, rgba(41,48,63,.98), rgba(8,11,19,.99));
      border: 2px solid rgba(185,202,226,.18);
      box-shadow:
        inset 0 4px 8px rgba(255,255,255,.08),
        inset 0 -10px 18px rgba(0,0,0,.68),
        0 0 0 4px rgba(0,0,0,.18);
      opacity: .9;
    }
    .beat-swarm-pinball-bouncer.is-arrived {
      box-shadow:
        0 18px 22px rgba(0,0,0,.4),
        inset 0 7px 10px rgba(255,255,255,.12),
        inset 0 -16px 24px rgba(0,0,0,.58),
        0 0 16px rgba(207,64,255,.18);
    }
    .beat-swarm-pinball-bouncer.is-arrived::before {
      border-color: rgba(255,73,230,.92);
      background:
        conic-gradient(from 0deg, transparent 0 13deg, rgba(255,255,255,.92) 13deg 18deg, transparent 18deg 58deg, rgba(255,92,229,.78) 58deg 65deg, transparent 65deg 105deg, rgba(255,255,255,.92) 105deg 110deg, transparent 110deg 180deg, rgba(255,92,229,.78) 180deg 187deg, transparent 187deg 242deg, rgba(255,255,255,.92) 242deg 247deg, transparent 247deg 305deg, rgba(255,92,229,.78) 305deg 312deg, transparent 312deg 360deg),
        linear-gradient(145deg, rgba(51,57,72,.98), rgba(14,16,26,.98));
      box-shadow:
        inset 0 6px 9px rgba(255,255,255,.18),
        inset 0 -9px 16px rgba(0,0,0,.62),
        0 0 16px rgba(255,72,228,.72),
        0 0 30px rgba(161,68,255,.38);
      opacity: 1;
    }
    .beat-swarm-pinball-bouncer.is-arrived::after {
      background:
        radial-gradient(circle at 50% 50%, rgba(116,223,255,.18) 0 14%, transparent 15%),
        linear-gradient(145deg, rgba(43,51,68,.98), rgba(8,11,19,.99));
      border-color: rgba(218,230,255,.26);
      opacity: .94;
    }
    .beat-swarm-pinball-bouncer.is-activating {
      box-shadow: inset 0 8px 20px rgba(255,255,255,.2), inset 0 -16px 34px rgba(0,0,0,.42), 0 0 34px rgba(255,255,255,.76), 0 0 72px rgba(255,72,228,.7);
    }
    .beat-swarm-pinball-bouncer.is-impacting {
      background:
        linear-gradient(145deg, rgba(76,82,100,.98), rgba(16,18,28,.99) 48%, rgba(8,9,16,.99));
      box-shadow:
        0 20px 24px rgba(0,0,0,.45),
        inset 0 8px 18px rgba(255,255,255,.22),
        inset 0 -18px 28px rgba(0,0,0,.48),
        0 0 34px rgba(255,255,255,.62);
    }
    .beat-swarm-pinball-bouncer.is-impacting::before {
      border-width: 18px;
      border-color: #fff;
      background:
        conic-gradient(from 0deg, transparent 0 10deg, #fff 10deg 22deg, transparent 22deg 54deg, rgba(255,132,235,.96) 54deg 70deg, transparent 70deg 100deg, #fff 100deg 114deg, transparent 114deg 176deg, rgba(255,132,235,.96) 176deg 192deg, transparent 192deg 238deg, #fff 238deg 252deg, transparent 252deg 302deg, rgba(255,132,235,.96) 302deg 318deg, transparent 318deg 360deg),
        linear-gradient(145deg, rgba(78,82,98,.98), rgba(19,20,31,.98));
      box-shadow:
        inset 0 7px 12px rgba(255,255,255,.34),
        inset 0 -9px 18px rgba(0,0,0,.48),
        0 0 32px #fff,
        0 0 58px rgba(255,42,220,.8);
      opacity: 1;
    }
    .beat-swarm-pinball-bouncer.is-impacting::after {
      opacity: .95;
    }
    .beat-swarm-pinball-bouncer.shape-circle { border-radius: 50%; }
    .beat-swarm-pinball-bouncer.shape-pill { width: 222px; margin-left: -111px; border-radius: 999px; }
    .beat-swarm-pinball-bouncer.shape-square { border-radius: 22px; }
    .beat-swarm-pinball-bouncer.shape-triangle {
      width: 156px; height: 135px; margin: -67.5px 0 0 -78px;
      border-radius: 0;
      clip-path: polygon(50% 0, 100% 100%, 0 100%);
      background:
        linear-gradient(145deg, rgba(142,48,188,.98), rgba(38,20,58,.98) 46%, rgba(6,8,14,.99));
      box-shadow: none;
      filter:
        drop-shadow(0 18px 14px rgba(0,0,0,.38))
        drop-shadow(0 0 16px rgba(255,72,228,.38));
    }
    .beat-swarm-pinball-bouncer.shape-triangle.is-arrived {
      background:
        linear-gradient(145deg, rgba(255,172,248,1), rgba(170,48,214,1) 36%, rgba(23,16,42,.99));
      filter:
        drop-shadow(0 18px 14px rgba(0,0,0,.4))
        drop-shadow(0 0 30px rgba(255,86,235,.98))
        drop-shadow(0 0 58px rgba(178,70,255,.68));
    }
    .beat-swarm-pinball-bouncer.shape-triangle.is-impacting {
      background:
        linear-gradient(145deg, rgba(255,255,255,.98), rgba(255,111,232,.98) 45%, rgba(32,22,46,.99));
      filter:
        drop-shadow(0 20px 16px rgba(0,0,0,.44))
        drop-shadow(0 0 28px rgba(255,255,255,.88))
        drop-shadow(0 0 52px rgba(255,54,223,.82));
    }
    .beat-swarm-pinball-bouncer.shape-triangle::before {
      inset: 13px 15px 14px;
      border: 0;
      clip-path: polygon(50% 0, 100% 100%, 0 100%);
      background:
        linear-gradient(145deg, rgba(52,58,76,.98), rgba(11,13,22,.99));
      box-shadow: none;
      opacity: .98;
    }
    .beat-swarm-pinball-bouncer.shape-triangle.is-arrived::before {
      background:
        linear-gradient(145deg, rgba(82,88,110,.98), rgba(18,18,31,.99));
      filter:
        drop-shadow(0 -4px 0 rgba(255,255,255,1))
        drop-shadow(6px 7px 0 rgba(255,72,228,.98))
        drop-shadow(-6px 7px 0 rgba(255,72,228,.98))
        drop-shadow(0 0 22px rgba(255,72,228,.94))
        drop-shadow(0 0 34px rgba(155,80,255,.58));
    }
    .beat-swarm-pinball-bouncer.shape-triangle.is-impacting::before {
      background:
        linear-gradient(145deg, rgba(86,92,110,.98), rgba(18,20,32,.99));
      filter:
        drop-shadow(0 -3px 0 #fff)
        drop-shadow(5px 6px 0 #fff)
        drop-shadow(-5px 6px 0 #fff)
        drop-shadow(0 0 18px #fff);
    }
    .beat-swarm-pinball-bouncer.shape-triangle::after {
      inset: 45px 48px 30px;
      border: 2px solid rgba(218,230,255,.2);
      clip-path: polygon(50% 0, 100% 100%, 0 100%);
      background:
        radial-gradient(circle at 50% 58%, rgba(116,223,255,.14) 0 14%, transparent 15%),
        linear-gradient(145deg, rgba(38,45,60,.98), rgba(7,9,16,.99));
    }
    .beat-swarm-pinball-bouncer.shape-triangle.is-arrived::after { border-color: rgba(218,230,255,.3); }
    .beat-swarm-pinball-bouncer.shape-triangle.is-arrived::after {
      background:
        radial-gradient(circle at 50% 58%, rgba(168,235,255,.24) 0 14%, transparent 15%),
        linear-gradient(145deg, rgba(50,58,78,.98), rgba(9,10,18,.99));
      border-color: rgba(245,238,255,.38);
    }
  `;
  document.head.appendChild(style);
}

export function createBeatSwarmPinballBouncerRuntime(deps = {}) {
  const state = {
    active: false,
    eventId: '',
    themeId: 'accentRhythm',
    laneId: 'secondary_loop_lane',
    stepCount: 16,
    targetHitCount: MAX_HITS,
    nextId: 1,
    spawnTimer: 0,
    lastClockTick: -1,
    bouncers: [],
    spawnedHitCount: 0,
    pendingHits: [],
    motifHits: new Set(),
    previousPlayer: null,
    rootEl: null,
    postCompleteUntilTick: -1,
    postCompleteNotified: false,
  };

  function ensureRoot() {
    installStyles();
    const overlay = deps.getOverlayEl?.() || document.body;
    if (!(overlay instanceof HTMLElement)) return null;
    if (!(state.rootEl instanceof HTMLElement)) {
      state.rootEl = document.createElement('div');
      state.rootEl.className = 'beat-swarm-pinball-layer';
      overlay.appendChild(state.rootEl);
    }
    return state.rootEl;
  }

  function removeEntry(entry) {
    try { entry?.el?.remove?.(); } catch {}
  }

  function clear() {
    state.bouncers.forEach(removeEntry);
    state.bouncers.length = 0;
    state.pendingHits.length = 0;
    state.motifHits.clear();
    state.postCompleteUntilTick = -1;
    state.postCompleteNotified = false;
    try { state.rootEl?.remove?.(); } catch {}
    state.rootEl = null;
  }

  function start(options = null) {
    const opts = options && typeof options === 'object' ? options : {};
    clear();
    state.active = true;
    state.eventId = String(opts.eventId || '').trim();
    state.themeId = String(opts.themeId || 'accentRhythm').trim() || 'accentRhythm';
    state.laneId = String(opts.laneId || 'secondary_loop_lane').trim() || 'secondary_loop_lane';
    state.stepCount = Math.max(1, Math.trunc(Number(opts.stepCount) || 16));
    state.targetHitCount = Math.max(1, Math.min(MAX_HITS, Math.trunc(Number(opts.targetHitCount) || MAX_HITS)));
    state.nextId = 1;
    state.spawnedHitCount = 0;
    state.lastClockTick = -1;
    state.previousPlayer = null;
    ensureRoot();
  }

  function stop() {
    state.active = false;
    state.eventId = '';
    clear();
  }

  function canSpawnGroup() {
    return state.active
      && state.bouncers.length <= 0
      && state.spawnedHitCount < state.targetHitCount;
  }

  function pickNextGroupSize() {
    const remaining = Math.max(0, state.targetHitCount - state.spawnedHitCount);
    if (remaining <= 0) return 0;
    if (remaining <= MAX_ACTIVE_BOUNCERS) return remaining;
    if (remaining === 4) return 2;
    return Math.random() < 0.5 ? 2 : 3;
  }

  function spawnBouncer(groupIndex = 0, groupCount = 1, groupOffset = 0) {
    if (!state.active || state.spawnedHitCount >= state.targetHitCount) return null;
    const root = ensureRoot();
    if (!(root instanceof HTMLElement)) return null;
    const shapes = ['circle', 'pill', 'square', 'triangle'];
    const id = state.nextId++;
    const safeGroupCount = Math.max(1, Math.trunc(Number(groupCount) || 1));
    const safeGroupIndex = Math.max(0, Math.trunc(Number(groupIndex) || 0));
    const angleJitter = (Math.random() - 0.5) * 0.22;
    const angle = groupOffset + (safeGroupIndex * TWO_PI / safeGroupCount) + angleJitter;
    const radiusN = 0.38 + Math.random() * 0.28;
    const size = 0.88 + Math.random() * 0.28;
    const shape = shapes[(id + Math.floor(Math.random() * shapes.length)) % shapes.length];
    const rotationDeg = (Math.random() * 70) - 35 + (shape === 'triangle' ? 0 : (Math.random() < 0.5 ? 0 : 90));
    const el = document.createElement('div');
    el.className = `beat-swarm-pinball-bouncer shape-${shape}`;
    root.appendChild(el);
    const bouncer = {
      id,
      age: 0,
      impactAge: -1,
      hitQueued: false,
      shape,
      anchorAngle: angle,
      anchorRadiusN: radiusN,
      rotationDeg,
      size,
      el,
    };
    state.bouncers.push(bouncer);
    state.spawnedHitCount += 1;
    deps.onBouncerSpawned?.({
      id,
      shape,
      eventId: state.eventId,
      themeId: state.themeId,
      laneId: state.laneId,
    });
    return bouncer;
  }

  function spawnGroup() {
    const count = pickNextGroupSize();
    const offset = Math.random() * TWO_PI;
    for (let i = 0; i < count; i += 1) spawnBouncer(i, count, offset);
  }

  function getBouncerWorld(bouncer = null) {
    const arena = point(deps.getArenaCenterWorld?.());
    const arenaRadius = Math.max(120, Number(deps.getArenaRadius?.()) || 500);
    return {
      x: arena.x + Math.cos(Number(bouncer?.anchorAngle) || 0) * arenaRadius * (Number(bouncer?.anchorRadiusN) || 0.45),
      y: arena.y + Math.sin(Number(bouncer?.anchorAngle) || 0) * arenaRadius * (Number(bouncer?.anchorRadiusN) || 0.45),
    };
  }

  function renderBouncer(bouncer = null) {
    const el = bouncer?.el;
    const screen = deps.worldToScreen?.(getBouncerWorld(bouncer));
    if (!el || !screen || !Number.isFinite(screen.x) || !Number.isFinite(screen.y)) return;
    const arriveN = clamp01((Number(bouncer.age) || 0) / ARRIVAL_SECONDS);
    const eased = Math.pow(arriveN, 2.35);
    const impactN = bouncer.impactAge >= 0 ? clamp01(1 - (bouncer.impactAge / HIT_FLASH_SECONDS)) : 0;
    const activeAge = Math.max(0, (Number(bouncer.age) || 0) - ARRIVAL_SECONDS);
    const activeBounceN = clamp01(1 - (activeAge / 0.34));
    const activeBounce = Math.sin(activeBounceN * Math.PI) * 0.2;
    const impactBounce = Math.sin(impactN * Math.PI) * 0.24;
    const scale = (0.24 + eased * 0.76 + activeBounce + impactBounce) * (Number(bouncer.size) || 1);
    const opacity = 0.2 + eased * 0.78;
    const rotate = Number(bouncer.rotationDeg) || 0;
    el.style.opacity = opacity.toFixed(3);
    el.style.transform = `translate(${screen.x.toFixed(2)}px, ${screen.y.toFixed(2)}px) rotate(${rotate.toFixed(2)}deg) scale(${scale.toFixed(3)})`;
    el.classList.toggle('is-arrived', arriveN >= 1);
    el.classList.toggle('is-activating', activeBounceN > 0 && arriveN >= 1 && impactN <= 0);
    el.classList.toggle('is-impacting', impactN > 0);
  }

  function findNextFreeStep(fromStep = 0) {
    const reserved = new Set(state.motifHits);
    state.pendingHits.forEach((entry) => reserved.add(entry.stepIndex));
    for (let offset = 1; offset <= state.stepCount; offset += 1) {
      const stepIndex = (fromStep + offset) % state.stepCount;
      if (!reserved.has(stepIndex)) return { stepIndex, offset };
    }
    return null;
  }

  function queueHit(bouncer = null, player = null) {
    if (!bouncer || bouncer.hitQueued === true) return false;
    const at = getBouncerWorld(bouncer);
    const normal = normalize((Number(player?.x) || 0) - at.x, (Number(player?.y) || 0) - at.y, 1, 0);
    deps.onPlayerBounced?.({
      normalWorld: normal,
      power: BOUNCER_BOUNCE_POWER,
      at,
      eventId: state.eventId,
    });
    const clock = deps.getBeatClock?.() || {};
    const slot = findNextFreeStep(getClockStep(clock, state.stepCount));
    if (!slot) return false;
    state.pendingHits.push({
      id: bouncer.id,
      at,
      stepIndex: slot.stepIndex,
      triggerTick: getClockTick(clock) + slot.offset,
      shape: bouncer.shape,
    });
    bouncer.hitQueued = true;
    bouncer.impactAge = 0;
    deps.onBouncerHitQueued?.({
      id: bouncer.id,
      shape: bouncer.shape,
      stepIndex: slot.stepIndex,
      eventId: state.eventId,
      themeId: state.themeId,
      laneId: state.laneId,
    });
    return true;
  }

  function triggerHit(entry = null) {
    const stepIndex = Math.max(0, Math.trunc(Number(entry?.stepIndex) || 0));
    state.motifHits.add(stepIndex);
    state.lastClockTick = getClockTick(deps.getBeatClock?.());
    deps.playMotifNote?.({
      stepIndex,
      themeId: state.themeId,
      laneId: state.laneId,
      eventId: state.eventId,
      hitCount: state.motifHits.size,
      targetHitCount: state.targetHitCount,
    });
    deps.createImpactEffect?.({
      at: entry?.at,
      shape: entry?.shape,
      stepIndex,
      eventId: state.eventId,
      hitCount: state.motifHits.size,
      targetHitCount: state.targetHitCount,
    });
    const complete = state.motifHits.size >= state.targetHitCount;
    if (complete) {
      state.active = false;
      state.postCompleteUntilTick = state.lastClockTick + POST_COMPLETE_LOOP_STEPS;
      state.postCompleteNotified = false;
    }
    deps.onMotifHit?.({
      stepIndex,
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

  function updatePendingHits() {
    const tick = getClockTick(deps.getBeatClock?.());
    for (let i = state.pendingHits.length - 1; i >= 0; i -= 1) {
      const entry = state.pendingHits[i];
      if (tick < entry.triggerTick) continue;
      state.pendingHits.splice(i, 1);
      triggerHit(entry);
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
    if (!state.active && state.postCompleteUntilTick < 0 && !state.bouncers.length && !state.pendingHits.length) return;
    ensureRoot();
    const safeDt = Math.max(0, Math.min(0.1, Number(dt) || 0));
    const player = point(deps.getPlayerWorld?.());
    const previousPlayer = state.previousPlayer || player;
    if (canSpawnGroup()) spawnGroup();
    for (const bouncer of state.bouncers.slice()) {
      bouncer.age = Math.max(0, Number(bouncer.age) || 0) + safeDt;
      if (bouncer.impactAge >= 0) bouncer.impactAge += safeDt;
      renderBouncer(bouncer);
      if (bouncer.hitQueued === true) {
        if (bouncer.impactAge >= HIT_FLASH_SECONDS) {
          removeEntry(bouncer);
          const idx = state.bouncers.indexOf(bouncer);
          if (idx >= 0) state.bouncers.splice(idx, 1);
        }
        continue;
      }
      if (bouncer.age < ARRIVAL_SECONDS) continue;
      const at = getBouncerWorld(bouncer);
      const hitRadius = BOUNCER_HIT_RADIUS * (Number(bouncer.size) || 1);
      if (
        Math.hypot(player.x - at.x, player.y - at.y) <= hitRadius
        || distancePointToSegment(at, previousPlayer, player) <= hitRadius
      ) {
        queueHit(bouncer, player);
      }
    }
    state.previousPlayer = player;
    updatePendingHits();
    updateMotifLoop();
  }

  return {
    start,
    stop,
    update,
    isActive: () => state.active,
    isPostCompletePlaybackActive: () => state.postCompleteUntilTick >= 0 && state.postCompleteNotified !== true,
    getMotifSteps,
    getSnapshot: () => ({
      active: state.active,
      eventId: state.eventId,
      themeId: state.themeId,
      laneId: state.laneId,
      bouncerCount: state.bouncers.length,
      pendingHitCount: state.pendingHits.length,
      hitCount: state.motifHits.size,
      targetHitCount: state.targetHitCount,
      complete: state.motifHits.size >= state.targetHitCount,
      postCompletePlaybackActive: state.postCompleteUntilTick >= 0 && state.postCompleteNotified !== true,
    }),
  };
}
