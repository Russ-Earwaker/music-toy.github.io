const STYLE_ID = 'beat-swarm-lead-ball-style';
const BALL_RADIUS = 42;
const BALL_SPEED = 980;
const BALL_TURN_RATE = 5.4;
const BALL_HIT_RADIUS = 74;
const BALL_BUMP_RADIUS = 94;
const BALL_MAX_IDLE_SECONDS = 10;
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
    ballEl: null,
    ball: null,
    previousPlayer: null,
    pendingHits: [],
    selections: [],
    hitHistory: [],
    hitSteps: new Set(),
    pendingEnemyIds: new Set(),
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
    const ball = document.createElement('div');
    ball.className = 'beat-swarm-lead-ball is-ready';
    root.appendChild(ball);
    overlay.appendChild(root);
    state.rootEl = root;
    state.ballEl = ball;
    return root;
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
    state.ballEl = null;
  }

  function reset() {
    state.active = false;
    state.eventId = '';
    state.themeId = 'leadTheme';
    state.laneId = 'primary_loop_lane';
    state.stepCount = DEFAULT_STEP_COUNT;
    state.targetHitCount = DEFAULT_TARGET_HITS;
    state.ball = null;
    state.previousPlayer = null;
    state.pendingHits.length = 0;
    state.selections = [];
    state.hitHistory.length = 0;
    state.hitSteps.clear();
    state.pendingEnemyIds.clear();
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
    state.ball = {
      x: center.x + radius * 0.18,
      y: center.y,
      vx: 0,
      vy: 0,
      launched: false,
      targetEnemyId: 0,
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

  function chooseTargetEnemy() {
    const enemies = getLiveEnemies();
    if (!enemies.length) return null;
    const ball = state.ball || point(deps.getPlayerWorld?.());
    const currentDir = normalize(Number(ball.vx) || 1, Number(ball.vy) || 0, 1, 0);
    const recent = state.lastNotes.slice(-3);
    const repeatNote = recent.length >= 2 && recent.every((note) => note && note === recent[0]) ? recent[0] : '';
    let best = null;
    let bestScore = Infinity;
    for (const enemy of enemies) {
      const enemyId = Math.trunc(Number(enemy?.id) || 0);
      if (enemyId && enemyId === state.lastTargetEnemyId && enemies.length > 1) continue;
      if (enemyId && state.pendingEnemyIds.has(enemyId) && enemies.length > 1) continue;
      const dx = (Number(enemy.wx) || 0) - ball.x;
      const dy = (Number(enemy.wy) || 0) - ball.y;
      const distance = Math.hypot(dx, dy);
      const note = getEnemyNote(enemy);
      const repeatPenalty = repeatNote && note === repeatNote ? 1200 : 0;
      const closePenalty = distance < 360
        ? (360 - distance) * 3.2
        : (distance < 560 ? (560 - distance) * 0.72 : 0);
      const dir = normalize(dx, dy, currentDir.x, currentDir.y);
      const alignment = Math.max(-1, Math.min(1, (dir.x * currentDir.x) + (dir.y * currentDir.y)));
      const straightRouteBonus = distance > 360 ? alignment * Math.min(980, distance * 0.64) : alignment * 60;
      const preferredDistanceBonus = distance >= 560 && distance <= 1250 ? 220 : 0;
      const score = distance + closePenalty + repeatPenalty - straightRouteBonus - preferredDistanceBonus;
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

  function getCurrentTargetEnemy() {
    const current = getEnemyById(state.ball?.targetEnemyId);
    if (current && !state.pendingEnemyIds.has(Math.trunc(Number(current.id) || 0))) return current;
    const next = chooseTargetEnemy();
    if (state.ball) state.ball.targetEnemyId = Math.trunc(Number(next?.id) || 0);
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
    state.active = false;
    state.committed = true;
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

  function queueHit(enemy = null, at = null) {
    if (!enemy) return false;
    if (state.committed || state.hitSteps.size >= state.targetHitCount) return false;
    if (state.hitSteps.size + state.pendingHits.length >= state.targetHitCount) return false;
    const enemyId = Math.trunc(Number(enemy.id) || 0);
    if (enemyId && state.pendingEnemyIds.has(enemyId)) return false;
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
    if (state.ball) state.ball.targetEnemyId = 0;
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

  function updateBall(dt, player) {
    if (!state.active || !state.ball) return;
    const ball = state.ball;
    if (!ball.launched) {
      const prev = state.previousPlayer || player;
      const vx = player.x - prev.x;
      const vy = player.y - prev.y;
      const dx = ball.x - player.x;
      const dy = ball.y - player.y;
      const distance = Math.hypot(dx, dy);
      if (distance <= BALL_BUMP_RADIUS) {
        const dir = Math.hypot(vx, vy) > 4
          ? normalize(vx, vy, dx || 1, dy || 0)
          : normalize(dx, dy, 1, 0);
        const overlap = Math.max(0, BALL_BUMP_RADIUS - distance);
        ball.x += dir.x * overlap;
        ball.y += dir.y * overlap;
        ball.vx = dir.x * BALL_SPEED;
        ball.vy = dir.y * BALL_SPEED;
        ball.launched = true;
        ball.targetEnemyId = 0;
        deps.onPlayerBounced?.({
          normalWorld: { x: -dir.x, y: -dir.y },
          power: 650,
          at: { x: ball.x, y: ball.y },
          eventId: state.eventId,
        });
        deps.onLaunched?.({ eventId: state.eventId, x: ball.x, y: ball.y });
      }
      return;
    }
    const target = getCurrentTargetEnemy();
    if (target) {
      ball.targetEnemyId = Math.trunc(Number(target.id) || 0);
      const desired = normalize((Number(target.wx) || 0) - ball.x, (Number(target.wy) || 0) - ball.y, ball.vx, ball.vy);
      const current = normalize(ball.vx, ball.vy, desired.x, desired.y);
      const blend = Math.max(0, Math.min(1, BALL_TURN_RATE * dt));
      const dir = normalize(
        current.x + (desired.x - current.x) * blend,
        current.y + (desired.y - current.y) * blend,
        desired.x,
        desired.y
      );
      ball.vx = dir.x * BALL_SPEED;
      ball.vy = dir.y * BALL_SPEED;
      const distance = Math.hypot((Number(target.wx) || 0) - ball.x, (Number(target.wy) || 0) - ball.y);
      if (distance <= BALL_HIT_RADIUS) {
        const enemyWorld = enemyPoint(target);
        const normal = normalize(ball.x - enemyWorld.x, ball.y - enemyWorld.y, -desired.x, -desired.y);
        const dot = (ball.vx * normal.x) + (ball.vy * normal.y);
        if (dot < 0) {
          ball.vx -= 2 * dot * normal.x;
          ball.vy -= 2 * dot * normal.y;
        } else {
          ball.vx = normal.x * BALL_SPEED;
          ball.vy = normal.y * BALL_SPEED;
        }
        const separation = Math.max(0, BALL_HIT_RADIUS - distance) + 6;
        ball.x += normal.x * separation;
        ball.y += normal.y * separation;
        target.vx = (Number(target.vx) || 0) - normal.x * 160;
        target.vy = (Number(target.vy) || 0) - normal.y * 160;
        queueHit(target, enemyWorld);
      }
    }
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
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
    updateBall(safeDt, player);
    updatePendingHits();
    updateMotifLoop();
    updateVisualLists(safeDt);
    if (state.ball && state.ballEl) {
      const angle = Math.atan2(Number(state.ball.vy) || 0, Number(state.ball.vx) || 1);
      renderAt(state.ballEl, state.ball, angle);
      state.ballEl.classList.toggle('is-ready', state.ball.launched !== true);
    }
    state.previousPlayer = player;
    if (state.active && state.elapsed > BALL_MAX_IDLE_SECONDS && !state.ball?.launched) {
      const dir = normalize(1, 0);
      state.ball.launched = true;
      state.ball.vx = dir.x * BALL_SPEED;
      state.ball.vy = dir.y * BALL_SPEED;
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
      postCompletePlaybackActive: state.postCompleteUntilTick >= 0 && state.postCompleteNotified !== true,
      captureStartTick: state.captureStartTick,
      captureEndTick: state.captureEndTick,
      selections: state.selections.slice(),
      hitHistory: state.hitHistory.slice(),
    }),
  };
}
