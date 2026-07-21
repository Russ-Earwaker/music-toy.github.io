const STYLE_ID = 'beat-swarm-lead-ball-style';
const BALL_RADIUS = 42;
const BALL_SPEED = 1450;
const BALL_TURN_RATE = 6.8;
const BALL_HOP_TURN_RATE = 11.5;
const BALL_HIT_RADIUS = 74;
const BALL_INCIDENTAL_HIT_RADIUS = 150;
const BALL_HOP_PATH_RADIUS = 280;
const BALL_BUMP_RADIUS = 94;
const BALL_MAX_IDLE_SECONDS = 10;
const BALL_PICKUP_RADIUS = 74;
const BALL_COUNT = 2;
const DEFAULT_STEP_COUNT = 32;
const DEFAULT_TARGET_HITS = 18;

function point(value = null) {
  return {
    x: Number(value?.x) || 0,
    y: Number(value?.y) || 0,
  };
}

function normalize(x = 0, y = 0, fallbackX = 1, fallbackY = 0) {
  const len = Math.hypot(Number(x) || 0, Number(y) || 0);
  if (len > 0.0001) return { x: x / len, y: y / len };
  const fallbackLen = Math.max(0.0001, Math.hypot(Number(fallbackX) || 1, Number(fallbackY) || 0));
  return { x: fallbackX / fallbackLen, y: fallbackY / fallbackLen };
}

function getClockStep(clock = null, stepCount = DEFAULT_STEP_COUNT) {
  const count = Math.max(1, Math.trunc(Number(stepCount) || DEFAULT_STEP_COUNT));
  const motifCount = Math.max(0, Math.trunc(Number(clock?.motifStepCount) || 0));
  const raw = motifCount === count && Number.isFinite(Number(clock?.motifStepIndex))
    ? Number(clock.motifStepIndex)
    : (Number.isFinite(Number(clock?.stepIndex)) ? Number(clock.stepIndex) : 0);
  return ((Math.trunc(raw) % count) + count) % count;
}

function getClockTick(clock = null) {
  const raw = Number.isFinite(Number(clock?.tickIndex))
    ? Number(clock.tickIndex)
    : (Number.isFinite(Number(clock?.absoluteStepIndex)) ? Number(clock.absoluteStepIndex) : Number(clock?.stepIndex));
  return Math.max(0, Math.trunc(Number(raw) || 0));
}

function ensureStyle() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .beat-swarm-lead-ball-layer {
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 8;
    }
    .beat-swarm-lead-ball {
      position: absolute;
      left: 0;
      top: 0;
      width: ${BALL_RADIUS * 2}px;
      height: ${BALL_RADIUS * 2}px;
      margin-left: -${BALL_RADIUS}px;
      margin-top: -${BALL_RADIUS}px;
      border-radius: 999px;
      background:
        radial-gradient(circle at 34% 30%, rgba(255,255,255,.98) 0 8%, rgba(182,247,255,.9) 20%, rgba(38,205,255,.7) 38%, rgba(99,42,255,.44) 62%, rgba(16,17,40,.82) 100%);
      border: 2px solid rgba(244, 254, 255, .96);
      box-shadow:
        0 0 16px rgba(82, 221, 255, .9),
        0 0 34px rgba(171, 74, 255, .58);
      transform: translate(-9999px, -9999px);
      opacity: .96;
    }
    .beat-swarm-lead-ball-pickup {
      position: absolute;
      left: 0;
      top: 0;
      width: ${BALL_PICKUP_RADIUS * 2}px;
      height: ${BALL_PICKUP_RADIUS * 2}px;
      margin-left: -${BALL_PICKUP_RADIUS}px;
      margin-top: -${BALL_PICKUP_RADIUS}px;
      border-radius: 999px;
      background:
        radial-gradient(circle, rgba(255,255,255,.88) 0 10%, rgba(91,232,255,.62) 24%, rgba(143,76,255,.34) 48%, rgba(16,18,46,.72) 72%, rgba(5,8,22,.92) 100%);
      border: 2px solid rgba(226, 252, 255, .9);
      box-shadow:
        0 0 22px rgba(90, 230, 255, .86),
        0 0 52px rgba(177, 76, 255, .42);
      transform: translate(-9999px, -9999px);
      animation: beatSwarmLeadBallPickup 1s ease-in-out infinite alternate;
    }
    .beat-swarm-lead-ball-pickup::before,
    .beat-swarm-lead-ball-pickup::after {
      content: "";
      position: absolute;
      width: 34px;
      height: 34px;
      margin: -17px 0 0 -17px;
      border-radius: 999px;
      background: radial-gradient(circle, rgba(255,255,255,.96), rgba(92,230,255,.72) 46%, rgba(106,56,255,.4) 100%);
      box-shadow: 0 0 18px rgba(115, 234, 255, .76);
      left: 50%;
      top: 50%;
    }
    .beat-swarm-lead-ball-pickup::before {
      transform: translate(-30px, 0);
    }
    .beat-swarm-lead-ball-pickup::after {
      transform: translate(30px, 0);
    }
    .beat-swarm-lead-ball::after {
      content: "";
      position: absolute;
      inset: 10px;
      border-radius: inherit;
      border: 1px solid rgba(255,255,255,.38);
      box-shadow: inset 0 0 16px rgba(255,255,255,.24);
    }
    .beat-swarm-lead-ball.is-ready {
      animation: beatSwarmLeadBallReady .72s ease-in-out infinite alternate;
    }
    .beat-swarm-lead-ball-trail {
      position: absolute;
      left: 0;
      top: 0;
      width: 11px;
      height: 11px;
      margin-left: -5.5px;
      margin-top: -5.5px;
      border-radius: 999px;
      background: rgba(170, 246, 255, .78);
      box-shadow: 0 0 14px rgba(120, 230, 255, .72);
      transform: translate(-9999px, -9999px);
    }
    .beat-swarm-lead-ball-impact {
      position: absolute;
      left: 0;
      top: 0;
      width: 120px;
      height: 120px;
      margin-left: -60px;
      margin-top: -60px;
      border-radius: 999px;
      border: 2px solid rgba(255,255,255,.95);
      box-shadow: 0 0 28px rgba(111, 232, 255, .86), inset 0 0 30px rgba(255,255,255,.44);
      background: radial-gradient(circle, rgba(255,255,255,.86), rgba(81,220,255,.36) 32%, rgba(175,78,255,.18) 58%, transparent 72%);
      transform: translate(-9999px, -9999px) scale(.42);
      opacity: 0;
    }
    .beat-swarm-lead-ball-impact.is-live {
      animation: beatSwarmLeadBallImpact .36s ease-out forwards;
    }
    @keyframes beatSwarmLeadBallReady {
      from { filter: brightness(1); transform: var(--bs-lead-ball-transform, translate(-9999px, -9999px)) scale(.96); }
      to { filter: brightness(1.32); transform: var(--bs-lead-ball-transform, translate(-9999px, -9999px)) scale(1.04); }
    }
    @keyframes beatSwarmLeadBallPickup {
      from { filter: brightness(.9); transform: var(--bs-lead-pickup-transform, translate(-9999px, -9999px)) scale(.94); }
      to { filter: brightness(1.28); transform: var(--bs-lead-pickup-transform, translate(-9999px, -9999px)) scale(1.04); }
    }
    @keyframes beatSwarmLeadBallImpact {
      0% { opacity: .96; transform: var(--bs-lead-impact-transform, translate(-9999px, -9999px)) scale(.34); }
      45% { opacity: .9; transform: var(--bs-lead-impact-transform, translate(-9999px, -9999px)) scale(1.02); }
      100% { opacity: 0; transform: var(--bs-lead-impact-transform, translate(-9999px, -9999px)) scale(1.48); }
    }
  `;
  document.head.appendChild(style);
}

export function createBeatSwarmLeadBallRuntime(deps = {}) {
  const state = {
    active: false,
    eventId: '',
    themeId: 'leadTheme',
    laneId: 'primary_loop_lane',
    stepCount: DEFAULT_STEP_COUNT,
    targetHitCount: DEFAULT_TARGET_HITS,
    rootEl: null,
    pickupEl: null,
    pickup: null,
    balls: [],
    previousPlayer: null,
    pendingHits: [],
    selections: [],
    hitHistory: [],
    hitSteps: new Set(),
    pendingEnemyIds: new Set(),
    hitEnemyIds: new Set(),
    lastTargetEnemyId: 0,
    committed: false,
    captureStartTick: -1,
    captureEndTick: -1,
    lastClockTick: -1,
    postCompleteUntilTick: -1,
    postCompleteNotified: false,
    lastNotes: [],
    impacts: [],
    trails: [],
    elapsed: 0,
  };

  function ensureRoot() {
    ensureStyle();
    const overlay = deps.getOverlayEl?.();
    if (!overlay) return null;
    if (state.rootEl instanceof HTMLElement) return state.rootEl;
    const root = document.createElement('div');
    root.className = 'beat-swarm-lead-ball-layer';
    const pickup = document.createElement('div');
    pickup.className = 'beat-swarm-lead-ball-pickup';
    root.appendChild(pickup);
    overlay.appendChild(root);
    state.rootEl = root;
    state.pickupEl = pickup;
    return root;
  }

  function createBallEl() {
    const root = ensureRoot();
    if (!(root instanceof HTMLElement)) return null;
    const ball = document.createElement('div');
    ball.className = 'beat-swarm-lead-ball';
    root.appendChild(ball);
    return ball;
  }

  function clearVisuals() {
    for (const entry of state.trails) {
      try { entry.el?.remove?.(); } catch {}
    }
    for (const entry of state.impacts) {
      try { entry.el?.remove?.(); } catch {}
    }
    state.trails.length = 0;
    state.impacts.length = 0;
    try { state.rootEl?.remove?.(); } catch {}
    state.rootEl = null;
    state.pickupEl = null;
  }

  function reset() {
    state.active = false;
    state.eventId = '';
    state.themeId = 'leadTheme';
    state.laneId = 'primary_loop_lane';
    state.stepCount = DEFAULT_STEP_COUNT;
    state.targetHitCount = DEFAULT_TARGET_HITS;
    state.pickup = null;
    state.balls = [];
    state.previousPlayer = null;
    state.pendingHits.length = 0;
    state.selections = [];
    state.hitHistory.length = 0;
    state.hitSteps.clear();
    state.pendingEnemyIds.clear();
    state.hitEnemyIds.clear();
    state.lastTargetEnemyId = 0;
    state.committed = false;
    state.captureStartTick = -1;
    state.captureEndTick = -1;
    state.lastClockTick = -1;
    state.postCompleteUntilTick = -1;
    state.postCompleteNotified = false;
    state.lastNotes.length = 0;
    state.elapsed = 0;
  }

  function start(options = null) {
    const opts = options && typeof options === 'object' ? options : {};
    reset();
    ensureRoot();
    const center = point(deps.getArenaCenterWorld?.() || deps.getPlayerWorld?.());
    const player = point(deps.getPlayerWorld?.() || center);
    const radius = Math.max(120, Number(deps.getArenaRadius?.()) || 900);
    state.active = true;
    state.eventId = String(opts.eventId || `lead-ball-${Date.now().toString(36)}`).trim();
    state.themeId = String(opts.themeId || 'leadTheme').trim();
    state.laneId = String(opts.laneId || 'primary_loop_lane').trim();
    state.stepCount = Math.max(1, Math.trunc(Number(opts.stepCount) || DEFAULT_STEP_COUNT));
    state.targetHitCount = Math.max(1, Math.min(state.stepCount, Math.trunc(Number(opts.targetHitCount) || DEFAULT_TARGET_HITS)));
    state.selections = Array.from({ length: state.stepCount }, () => null);
    state.pickup = {
      x: center.x + radius * 0.18,
      y: center.y,
    };
    state.previousPlayer = player;
    deps.onStarted?.({
      eventId: state.eventId,
      themeId: state.themeId,
      laneId: state.laneId,
      stepCount: state.stepCount,
      targetHitCount: state.targetHitCount,
    });
    return { eventId: state.eventId, stepCount: state.stepCount, targetHitCount: state.targetHitCount };
  }

  function releaseBallsFromPickup(player = null) {
    if (!state.pickup || state.balls.length > 0) return;
    const origin = point(state.pickup);
    const prev = state.previousPlayer || player || origin;
    const px = Number(player?.x) || origin.x;
    const py = Number(player?.y) || origin.y;
    const moveDir = normalize(px - prev.x, py - prev.y, 1, 0);
    const baseAngle = Math.atan2(moveDir.y, moveDir.x);
    const spread = 0.42;
    state.balls = Array.from({ length: BALL_COUNT }, (_, index) => {
      const offset = BALL_COUNT <= 1 ? 0 : (index - ((BALL_COUNT - 1) / 2)) * spread;
      const angle = baseAngle + offset;
      return {
        id: index + 1,
        x: origin.x + Math.cos(angle) * 28,
        y: origin.y + Math.sin(angle) * 28,
        vx: Math.cos(angle) * BALL_SPEED,
        vy: Math.sin(angle) * BALL_SPEED,
        targetEnemyId: 0,
        el: createBallEl(),
      };
    });
    if (state.pickupEl instanceof HTMLElement) {
      state.pickupEl.style.opacity = '0';
      state.pickupEl.style.transform = 'translate(-9999px, -9999px)';
    }
    state.pickup = null;
    deps.onLaunched?.({ eventId: state.eventId, x: origin.x, y: origin.y, ballCount: state.balls.length });
  }

  function stop() {
    reset();
    clearVisuals();
  }

  function getLiveEnemies() {
    const list = deps.getEnemies?.();
    return Array.isArray(list)
      ? list.filter((enemy) => enemy && enemy.__bsRemoved !== true && enemy.__bsPendingDeath !== true && Number(enemy.hp) > 0)
      : [];
  }

  function enemyPoint(enemy = null) {
    return { x: Number(enemy?.wx) || 0, y: Number(enemy?.wy) || 0 };
  }

  function getEnemyNote(enemy = null) {
    const note = deps.getNoteForWorld?.(enemyPoint(enemy));
    return String(note || '').trim();
  }

  function isWorldPointOnscreen(world = null) {
    const screen = deps.worldToScreen?.(world);
    if (!screen || !Number.isFinite(screen.x) || !Number.isFinite(screen.y)) return false;
    const viewport = typeof window !== 'undefined' ? window : null;
    const width = Math.max(1, Number(viewport?.innerWidth) || 1);
    const height = Math.max(1, Number(viewport?.innerHeight) || 1);
    return screen.x >= 0 && screen.x <= width && screen.y >= 0 && screen.y <= height;
  }

  function isEnemySelectable(enemy = null) {
    if (!enemy) return false;
    const enemyId = Math.trunc(Number(enemy?.id) || 0);
    if (enemyId && enemyId === state.lastTargetEnemyId && getLiveEnemies().length > 1) return false;
    if (enemyId && state.pendingEnemyIds.has(enemyId)) return false;
    if (enemyId && state.hitEnemyIds.has(enemyId)) return false;
    return isWorldPointOnscreen(enemyPoint(enemy));
  }

  function getDestinationNotesForOtherBalls(ballActor = null) {
    const notes = new Set();
    for (const other of state.balls) {
      if (!other || other === ballActor) continue;
      const enemy = getEnemyById(other.targetEnemyId);
      const note = getEnemyNote(enemy);
      if (note) notes.add(note);
    }
    return notes;
  }

  function chooseTargetEnemy(ballActor = null, options = null) {
    const opts = options && typeof options === 'object' ? options : {};
    const enemies = getLiveEnemies();
    if (!enemies.length) return null;
    const ball = ballActor || point(deps.getPlayerWorld?.());
    const arenaCenter = point(deps.getArenaCenterWorld?.() || deps.getPlayerWorld?.());
    const arenaRadius = Math.max(1, Number(deps.getArenaRadius?.()) || 900);
    const currentDir = normalize(Number(ball.vx) || 1, Number(ball.vy) || 0, 1, 0);
    const recent = state.lastNotes.slice(-3);
    const repeatNote = recent.length >= 2 && recent.every((note) => note && note === recent[0]) ? recent[0] : '';
    const avoidNotes = getDestinationNotesForOtherBalls(ballActor);
    let best = null;
    let bestScore = Infinity;
    for (const enemy of enemies) {
      const enemyId = Math.trunc(Number(enemy?.id) || 0);
      if (!isEnemySelectable(enemy)) continue;
      const dx = (Number(enemy.wx) || 0) - ball.x;
      const dy = (Number(enemy.wy) || 0) - ball.y;
      const distance = Math.hypot(dx, dy);
      const arenaDistance = Math.hypot((Number(enemy.wx) || 0) - arenaCenter.x, (Number(enemy.wy) || 0) - arenaCenter.y);
      const arenaIdeal = Math.min(arenaRadius * 0.74, 760);
      const arenaProximityPenalty = Math.max(0, arenaDistance - arenaIdeal) * 1.15;
      const arenaCoreBonus = arenaDistance <= arenaRadius * 0.92 ? 520 : 0;
      const note = getEnemyNote(enemy);
      const repeatPenalty = repeatNote && note === repeatNote ? 1200 : 0;
      const otherBallNotePenalty = note && avoidNotes.has(note) ? 3800 : 0;
      const closePenalty = distance < 620
        ? (620 - distance) * 5.2
        : (distance < 860 ? (860 - distance) * 1.15 : 0);
      const verticalTravel = Math.abs(dy);
      const flatRoutePenalty = verticalTravel < 280 ? (280 - verticalTravel) * 1.65 : 0;
      const verticalTravelBonus = verticalTravel >= 420 ? Math.min(860, verticalTravel * 0.78) : 0;
      const dir = normalize(dx, dy, currentDir.x, currentDir.y);
      const alignment = Math.max(-1, Math.min(1, (dir.x * currentDir.x) + (dir.y * currentDir.y)));
      const straightRouteBonus = distance > 520 ? alignment * Math.min(1180, distance * 0.72) : alignment * 40;
      const preferredDistanceBonus = distance >= 860 && distance <= 1650 ? 420 : 0;
      const destinationDistanceBonus = opts.distant === true && distance >= 1150 ? Math.min(1300, distance * 0.62) : 0;
      const score = distance + closePenalty + flatRoutePenalty + arenaProximityPenalty + repeatPenalty + otherBallNotePenalty - straightRouteBonus - preferredDistanceBonus - verticalTravelBonus - destinationDistanceBonus - arenaCoreBonus;
      if (score < bestScore) {
        bestScore = score;
        best = enemy;
      }
    }
    return best;
  }

  function getEnemyById(id = 0) {
    const enemyId = Math.trunc(Number(id) || 0);
    if (!enemyId) return null;
    return getLiveEnemies().find((enemy) => Math.trunc(Number(enemy?.id) || 0) === enemyId) || null;
  }

  function getCurrentTargetEnemy(ballActor = null) {
    const current = getEnemyById(ballActor?.targetEnemyId);
    const currentId = Math.trunc(Number(current?.id) || 0);
    if (current && !state.pendingEnemyIds.has(currentId) && !state.hitEnemyIds.has(currentId) && isWorldPointOnscreen(enemyPoint(current))) return current;
    const next = chooseTargetEnemy(ballActor, { distant: true });
    if (ballActor) ballActor.targetEnemyId = Math.trunc(Number(next?.id) || 0);
    return next;
  }

  function findFreeCaptureSlot(triggerTickLike = 0) {
    let triggerTick = Math.max(0, Math.trunc(Number(triggerTickLike) || 0));
    if (state.captureStartTick < 0) {
      state.captureStartTick = triggerTick;
      state.captureEndTick = state.captureStartTick + state.stepCount - 1;
    }
    if (triggerTick < state.captureStartTick) triggerTick = state.captureStartTick;
    if (state.captureEndTick >= 0 && triggerTick > state.captureEndTick) return null;
    const reserved = new Set(state.hitSteps);
    state.pendingHits.forEach((entry) => reserved.add(Math.max(0, Math.trunc(Number(entry.stepIndex) || 0))));
    const relative = Math.max(0, Math.trunc(triggerTick - state.captureStartTick));
    for (let stepIndex = relative; stepIndex < state.stepCount; stepIndex += 1) {
      if (reserved.has(stepIndex)) continue;
      return {
        stepIndex,
        triggerTick: state.captureStartTick + stepIndex,
      };
    }
    return null;
  }

  function completeEvent(finalEvent = null) {
    if (state.committed) return;
    const final = finalEvent && typeof finalEvent === 'object' ? finalEvent : {};
    const ballWorlds = state.balls.map((ball) => point(ball));
    state.active = false;
    state.committed = true;
    for (const ball of state.balls) {
      if (ball?.el instanceof HTMLElement) {
        ball.el.style.opacity = '0';
        ball.el.style.transform = 'translate(-9999px, -9999px)';
      }
    }
    state.balls = [];
    state.pendingHits.length = 0;
    state.pendingEnemyIds.clear();
    state.postCompleteUntilTick = -1;
    state.postCompleteNotified = true;
    deps.onMotifHit?.({
      note: String(final.note || '').trim(),
      stepIndex: Number.isFinite(Number(final.stepIndex)) ? Math.max(0, Math.trunc(Number(final.stepIndex) || 0)) : -1,
      themeId: state.themeId,
      laneId: state.laneId,
      eventId: state.eventId,
      hitCount: state.hitSteps.size,
      targetHitCount: state.targetHitCount,
      complete: true,
      selections: state.selections.slice(),
    });
    deps.onPostCompletePlayback?.({
      eventId: state.eventId,
      themeId: state.themeId,
      laneId: state.laneId,
      selections: state.selections.slice(),
    });
    const explosionWorlds = ballWorlds.length ? ballWorlds : [null];
    for (const at of explosionWorlds) {
      deps.onCompleteExplosion?.({
        eventId: state.eventId,
        themeId: state.themeId,
        laneId: state.laneId,
        at,
        hitCount: state.hitSteps.size,
        targetHitCount: state.targetHitCount,
      });
    }
  }

  function renderAt(el, world, angleRad = 0) {
    const screen = deps.worldToScreen?.(world);
    if (!el || !screen || !Number.isFinite(screen.x) || !Number.isFinite(screen.y)) return;
    const transform = `translate(${screen.x.toFixed(2)}px, ${screen.y.toFixed(2)}px) rotate(${(angleRad * 180 / Math.PI).toFixed(2)}deg)`;
    el.style.setProperty('--bs-lead-ball-transform', transform);
    el.style.transform = transform;
  }

  function spawnTrail(world = null) {
    if (!(state.rootEl instanceof HTMLElement)) return;
    const screen = deps.worldToScreen?.(world);
    if (!screen || !Number.isFinite(screen.x) || !Number.isFinite(screen.y)) return;
    const el = document.createElement('div');
    el.className = 'beat-swarm-lead-ball-trail';
    el.style.transform = `translate(${screen.x.toFixed(2)}px, ${screen.y.toFixed(2)}px)`;
    state.rootEl.appendChild(el);
    state.trails.push({ el, age: 0, ttl: 0.42 });
  }

  function spawnImpact(world = null) {
    if (!(state.rootEl instanceof HTMLElement)) return;
    const screen = deps.worldToScreen?.(world);
    if (!screen || !Number.isFinite(screen.x) || !Number.isFinite(screen.y)) return;
    const el = document.createElement('div');
    el.className = 'beat-swarm-lead-ball-impact is-live';
    const transform = `translate(${screen.x.toFixed(2)}px, ${screen.y.toFixed(2)}px)`;
    el.style.setProperty('--bs-lead-impact-transform', transform);
    el.style.transform = `${transform} scale(.34)`;
    state.rootEl.appendChild(el);
    state.impacts.push({ el, age: 0, ttl: 0.42 });
  }

  function queueHit(enemy = null, at = null, options = null) {
    const opts = options && typeof options === 'object' ? options : {};
    if (!enemy) return false;
    if (state.committed || state.hitSteps.size >= state.targetHitCount) return false;
    if (state.hitSteps.size + state.pendingHits.length >= state.targetHitCount) return false;
    const enemyId = Math.trunc(Number(enemy.id) || 0);
    if (enemyId && state.pendingEnemyIds.has(enemyId)) return false;
    if (enemyId && state.hitEnemyIds.has(enemyId)) return false;
    const clock = deps.getBeatClock?.() || {};
    const baseTriggerTick = getClockTick(clock) + 1;
    const slot = findFreeCaptureSlot(baseTriggerTick);
    if (!slot) {
      completeEvent();
      return false;
    }
    const world = point(at || enemyPoint(enemy));
    const note = String(deps.getNoteForWorld?.(world) || getEnemyNote(enemy) || '').trim();
    state.pendingHits.push({
      enemy,
      enemyId,
      at: world,
      note,
      stepIndex: slot.stepIndex,
      triggerTick: slot.triggerTick,
    });
    deps.onHitQueued?.({
      eventId: state.eventId,
      themeId: state.themeId,
      laneId: state.laneId,
      enemyId,
      note,
      stepIndex: slot.stepIndex,
    });
    if (enemyId) state.pendingEnemyIds.add(enemyId);
    state.lastTargetEnemyId = enemyId || state.lastTargetEnemyId;
    if (opts.ball && opts.keepDestination !== true) opts.ball.targetEnemyId = 0;
    return true;
  }

  function triggerHit(entry = null) {
    if (!entry) return;
    if (entry.enemyId) state.pendingEnemyIds.delete(entry.enemyId);
    if (state.committed || state.hitSteps.size >= state.targetHitCount) return;
    const stepIndex = Math.max(0, Math.trunc(Number(entry.stepIndex) || 0));
    const note = String(entry.note || deps.getNoteForWorld?.(entry.at) || '').trim();
    const hitTick = getClockTick(deps.getBeatClock?.());
    state.hitSteps.add(stepIndex);
    state.selections[stepIndex] = {
      slotIndex: stepIndex,
      kind: 'note',
      note,
      reason: 'lead_ball_enemy_hit',
    };
    state.hitHistory.push({ note, tick: hitTick, stepIndex });
    if (entry.enemyId) state.hitEnemyIds.add(entry.enemyId);
    state.lastNotes.push(note);
    while (state.lastNotes.length > 6) state.lastNotes.shift();
    state.lastClockTick = getClockTick(deps.getBeatClock?.());
    spawnImpact(entry.at);
    deps.createImpactEffect?.({
      at: entry.at,
      enemy: entry.enemy,
      note,
      stepIndex,
      eventId: state.eventId,
      hitCount: state.hitSteps.size,
      targetHitCount: state.targetHitCount,
    });
    deps.playMotifNote?.({
      note,
      stepIndex,
      themeId: state.themeId,
      laneId: state.laneId,
      eventId: state.eventId,
      hitCount: state.hitSteps.size,
      targetHitCount: state.targetHitCount,
    });
    const complete = state.hitSteps.size >= state.targetHitCount;
    if (complete) {
      completeEvent({ note, stepIndex });
    }
    if (!complete) {
      deps.onMotifHit?.({
        note,
        stepIndex,
        themeId: state.themeId,
        laneId: state.laneId,
        eventId: state.eventId,
        hitCount: state.hitSteps.size,
        targetHitCount: state.targetHitCount,
        complete: false,
        selections: state.selections.slice(),
      });
    }
  }

  function getSegmentDistanceInfo(pointLike = null, fromLike = null, toLike = null) {
    const p = point(pointLike);
    const from = point(fromLike);
    const to = point(toLike);
    const sx = to.x - from.x;
    const sy = to.y - from.y;
    const lenSq = (sx * sx) + (sy * sy);
    const rawT = lenSq > 0.0001 ? (((p.x - from.x) * sx) + ((p.y - from.y) * sy)) / lenSq : 0;
    const t = Math.max(0, Math.min(1, rawT));
    const x = from.x + sx * t;
    const y = from.y + sy * t;
    return {
      t,
      x,
      y,
      distance: Math.hypot(p.x - x, p.y - y),
    };
  }

  function findCollisionEnemy(fromLike = null, toLike = null) {
    const enemies = getLiveEnemies();
    let best = null;
    let bestInfo = null;
    for (const enemy of enemies) {
      const enemyId = Math.trunc(Number(enemy?.id) || 0);
      if (enemyId && state.pendingEnemyIds.has(enemyId)) continue;
      if (enemyId && state.hitEnemyIds.has(enemyId)) continue;
      const info = getSegmentDistanceInfo(enemyPoint(enemy), fromLike, toLike);
      if (info.distance > BALL_INCIDENTAL_HIT_RADIUS) continue;
      if (!bestInfo || info.t < bestInfo.t) {
        best = enemy;
        bestInfo = info;
      }
    }
    return best ? { enemy: best, info: bestInfo } : null;
  }

  function findHopEnemyOnDestinationPath(ballActor = null, destinationEnemy = null) {
    if (!ballActor || !destinationEnemy) return null;
    const destinationId = Math.trunc(Number(destinationEnemy?.id) || 0);
    const from = point(ballActor);
    const to = enemyPoint(destinationEnemy);
    const arenaCenter = point(deps.getArenaCenterWorld?.() || deps.getPlayerWorld?.());
    const arenaRadius = Math.max(1, Number(deps.getArenaRadius?.()) || 900);
    const enemies = getLiveEnemies();
    let best = null;
    let bestInfo = null;
    let bestScore = Infinity;
    for (const enemy of enemies) {
      const enemyId = Math.trunc(Number(enemy?.id) || 0);
      if (!enemyId || enemyId === destinationId) continue;
      if (state.pendingEnemyIds.has(enemyId) || state.hitEnemyIds.has(enemyId)) continue;
      if (!isWorldPointOnscreen(enemyPoint(enemy))) continue;
      const info = getSegmentDistanceInfo(enemyPoint(enemy), from, to);
      if (info.t <= 0.05 || info.t >= 0.92) continue;
      if (info.distance > BALL_HOP_PATH_RADIUS) continue;
      const enemyWorld = enemyPoint(enemy);
      const arenaDistance = Math.hypot(enemyWorld.x - arenaCenter.x, enemyWorld.y - arenaCenter.y);
      const arenaPenalty = Math.max(0, arenaDistance - Math.min(arenaRadius * 0.82, 820)) * 0.95;
      const score = (info.t * 900) + (info.distance * 2.2) + arenaPenalty;
      if (score < bestScore) {
        bestScore = score;
        best = enemy;
        bestInfo = info;
      }
    }
    return best ? { enemy: best, info: bestInfo } : null;
  }

  function handleEnemyCollision(ballActor = null, enemy = null, collisionWorld = null) {
    if (!enemy || !ballActor) return false;
    const ball = ballActor;
    const enemyWorld = enemyPoint(enemy);
    const hitWorld = point(collisionWorld || enemyWorld);
    const normal = normalize(ball.x - enemyWorld.x, ball.y - enemyWorld.y, -ball.vx, -ball.vy);
    const dot = (ball.vx * normal.x) + (ball.vy * normal.y);
    if (dot < 0) {
      ball.vx -= 2 * dot * normal.x;
      ball.vy -= 2 * dot * normal.y;
    } else {
      ball.vx = normal.x * BALL_SPEED;
      ball.vy = normal.y * BALL_SPEED;
    }
    const dir = normalize(ball.vx, ball.vy, normal.x, normal.y);
    ball.vx = dir.x * BALL_SPEED;
    ball.vy = dir.y * BALL_SPEED;
    const distance = Math.hypot(ball.x - enemyWorld.x, ball.y - enemyWorld.y);
    const separation = Math.max(0, BALL_HIT_RADIUS - distance) + 10;
    ball.x += normal.x * separation;
    ball.y += normal.y * separation;
    enemy.vx = (Number(enemy.vx) || 0) - normal.x * 360;
    enemy.vy = (Number(enemy.vy) || 0) - normal.y * 360;
    const targetId = Math.trunc(Number(ball.targetEnemyId) || 0);
    const enemyId = Math.trunc(Number(enemy?.id) || 0);
    const queued = queueHit(enemy, hitWorld, { ball, keepDestination: targetId > 0 && enemyId !== targetId });
    if (enemyId === targetId || !getEnemyById(targetId)) ball.targetEnemyId = 0;
    return queued;
  }

  function updatePendingHits() {
    const tick = getClockTick(deps.getBeatClock?.());
    for (let i = state.pendingHits.length - 1; i >= 0; i -= 1) {
      const entry = state.pendingHits[i];
      if (tick < entry.triggerTick) continue;
      state.pendingHits.splice(i, 1);
      triggerHit(entry);
    }
    if (state.active && state.captureEndTick >= 0 && tick > state.captureEndTick && state.pendingHits.length <= 0) {
      completeEvent();
    }
  }

  function updateMotifLoop() {
    if (!state.hitSteps.size || state.active) return;
    if (state.postCompleteUntilTick < 0) return;
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
          selections: state.selections.slice(),
        });
      }
      return;
    }
    if (tick === state.lastClockTick) return;
    state.lastClockTick = tick;
    const stepIndex = getClockStep(clock, state.stepCount);
    const selection = state.selections[stepIndex];
    if (!selection?.note) return;
    deps.playMotifNote?.({
      note: selection.note,
      stepIndex,
      themeId: state.themeId,
      laneId: state.laneId,
      eventId: state.eventId,
      loopPlayback: true,
      hitCount: state.hitSteps.size,
      targetHitCount: state.targetHitCount,
    });
  }

  function updatePickup(player) {
    if (!state.active || !state.pickup) return;
    const dx = state.pickup.x - player.x;
    const dy = state.pickup.y - player.y;
    if (Math.hypot(dx, dy) <= BALL_PICKUP_RADIUS + 42) {
      releaseBallsFromPickup(player);
    }
  }

  function updateBall(ball, dt) {
    if (!state.active || !ball) return;
    const target = getCurrentTargetEnemy(ball);
    if (target) {
      ball.targetEnemyId = Math.trunc(Number(target.id) || 0);
      const hop = findHopEnemyOnDestinationPath(ball, target);
      const aim = hop?.enemy || target;
      const desired = normalize((Number(aim.wx) || 0) - ball.x, (Number(aim.wy) || 0) - ball.y, ball.vx, ball.vy);
      const current = normalize(ball.vx, ball.vy, desired.x, desired.y);
      const turnRate = hop?.enemy ? BALL_HOP_TURN_RATE : BALL_TURN_RATE;
      const blend = Math.max(0, Math.min(1, turnRate * dt));
      const dir = normalize(
        current.x + (desired.x - current.x) * blend,
        current.y + (desired.y - current.y) * blend,
        desired.x,
        desired.y
      );
      ball.vx = dir.x * BALL_SPEED;
      ball.vy = dir.y * BALL_SPEED;
    }
    const previousBall = { x: ball.x, y: ball.y };
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    const collision = findCollisionEnemy(previousBall, ball);
    if (collision) {
      handleEnemyCollision(ball, collision.enemy, { x: collision.info.x, y: collision.info.y });
    }
    spawnTrail(ball);
  }

  function updateVisualLists(dt) {
    for (let i = state.trails.length - 1; i >= 0; i -= 1) {
      const entry = state.trails[i];
      entry.age += dt;
      const n = Math.max(0, Math.min(1, 1 - entry.age / Math.max(0.001, entry.ttl)));
      if (entry.el instanceof HTMLElement) {
        entry.el.style.opacity = `${(n * 0.72).toFixed(3)}`;
      }
      if (entry.age >= entry.ttl) {
        try { entry.el?.remove?.(); } catch {}
        state.trails.splice(i, 1);
      }
    }
    for (let i = state.impacts.length - 1; i >= 0; i -= 1) {
      const entry = state.impacts[i];
      entry.age += dt;
      if (entry.age >= entry.ttl) {
        try { entry.el?.remove?.(); } catch {}
        state.impacts.splice(i, 1);
      }
    }
  }

  function update(dt = 0) {
    if (!state.active && state.postCompleteUntilTick < 0 && !state.pendingHits.length && !state.trails.length && !state.impacts.length) return;
    ensureRoot();
    const safeDt = Math.max(0, Math.min(0.1, Number(dt) || 0));
    state.elapsed += safeDt;
    const player = point(deps.getPlayerWorld?.());
    updatePickup(player);
    for (const ball of state.balls) updateBall(ball, safeDt);
    updatePendingHits();
    updateMotifLoop();
    updateVisualLists(safeDt);
    if (state.pickup && state.pickupEl instanceof HTMLElement) {
      const screen = deps.worldToScreen?.(state.pickup);
      if (screen && Number.isFinite(screen.x) && Number.isFinite(screen.y)) {
        const transform = `translate(${screen.x.toFixed(2)}px, ${screen.y.toFixed(2)}px)`;
        state.pickupEl.style.setProperty('--bs-lead-pickup-transform', transform);
        state.pickupEl.style.transform = transform;
      }
    }
    for (const ball of state.balls) {
      if (!(ball?.el instanceof HTMLElement)) continue;
      const angle = Math.atan2(Number(ball.vy) || 0, Number(ball.vx) || 1);
      renderAt(ball.el, ball, angle);
    }
    state.previousPlayer = player;
    if (state.active && state.elapsed > BALL_MAX_IDLE_SECONDS && state.pickup) {
      releaseBallsFromPickup({ x: state.pickup.x - 80, y: state.pickup.y });
    }
  }

  return {
    start,
    stop,
    update,
    isActive: () => state.active,
    isPostCompletePlaybackActive: () => state.postCompleteUntilTick >= 0 && state.postCompleteNotified !== true,
    getSnapshot: () => ({
      active: state.active,
      eventId: state.eventId,
      themeId: state.themeId,
      laneId: state.laneId,
      hitCount: state.hitSteps.size,
      targetHitCount: state.targetHitCount,
      pendingHitCount: state.pendingHits.length,
      complete: state.hitSteps.size >= state.targetHitCount,
      pickupActive: !!state.pickup,
      ballCount: state.balls.length,
      postCompletePlaybackActive: state.postCompleteUntilTick >= 0 && state.postCompleteNotified !== true,
      captureStartTick: state.captureStartTick,
      captureEndTick: state.captureEndTick,
      selections: state.selections.slice(),
      hitHistory: state.hitHistory.slice(),
      hitEnemyCount: state.hitEnemyIds.size,
    }),
  };
}
