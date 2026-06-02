const STYLE_ID = 'beat-swarm-tap-orb-style';
const ORB_REST_RADIUS_MULT = 1.08;
const ORB_TRAVEL_SPEED_WORLD = 620;
const ORB_SETTLE_SECONDS = 0.28;
const ORB_TRIGGER_SECONDS = 0.34;
const FOUNDATION_STEPS = 8;

function clamp01(v) {
  return Math.max(0, Math.min(1, Number(v) || 0));
}

function normalizePoint(p = null) {
  if (!p || typeof p !== 'object') return { x: 0, y: 0 };
  return {
    x: Number(p.x) || 0,
    y: Number(p.y) || 0,
  };
}

function installStyles() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .beat-swarm-tap-orb-layer {
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 5;
    }

    .beat-swarm-tap-orb {
      --tap-orb-x: -9999px;
      --tap-orb-y: -9999px;
      --tap-orb-scale: 1;
      position: fixed;
      left: 0;
      top: 0;
      width: 42px;
      height: 42px;
      margin-left: -21px;
      margin-top: -21px;
      border-radius: 50%;
      border: 1px solid rgba(222, 245, 255, 0.82);
      background:
        radial-gradient(circle at 42% 38%, rgba(255, 255, 255, 0.95), rgba(172, 228, 255, 0.76) 34%, rgba(92, 176, 255, 0.18) 72%, rgba(92, 176, 255, 0.04));
      box-shadow:
        0 0 12px rgba(172, 228, 255, 0.72),
        0 0 30px rgba(88, 179, 255, 0.26);
      color: rgba(235, 250, 255, 0.96);
      font: 700 10px/1 system-ui, sans-serif;
      letter-spacing: 0;
      display: grid;
      place-items: center;
      transform: translate(var(--tap-orb-x), var(--tap-orb-y)) scale(var(--tap-orb-scale));
      opacity: 0.92;
      pointer-events: auto;
      user-select: none;
      touch-action: none;
    }

    .beat-swarm-tap-orb::before {
      content: '';
      position: absolute;
      inset: -9px;
      border-radius: 50%;
      border: 1px solid rgba(172, 228, 255, 0.26);
      opacity: 0.48;
      animation: beat-swarm-tap-orb-pulse 900ms ease-in-out infinite;
    }

    .beat-swarm-tap-orb.is-traveling .beat-swarm-tap-orb-label,
    .beat-swarm-tap-orb.is-settling .beat-swarm-tap-orb-label {
      opacity: 0;
    }

    .beat-swarm-tap-orb.is-ready {
      cursor: pointer;
    }

    .beat-swarm-tap-orb.is-queued {
      background:
        radial-gradient(circle at 42% 38%, rgba(255, 255, 255, 1), rgba(211, 246, 255, 0.92) 30%, rgba(115, 210, 255, 0.38) 74%, rgba(115, 210, 255, 0.08));
      box-shadow:
        0 0 18px rgba(220, 248, 255, 0.95),
        0 0 42px rgba(116, 211, 255, 0.42);
    }

    .beat-swarm-tap-orb.is-triggered {
      opacity: 0;
      transition: opacity 260ms ease-out, transform 260ms ease-out;
    }

    .beat-swarm-tap-orb-label {
      position: relative;
      text-shadow: 0 0 8px rgba(60, 159, 255, 0.9);
    }

    .beat-swarm-beat-carrier {
      box-shadow:
        0 0 0 2px rgba(222, 245, 255, 0.78),
        0 0 18px rgba(172, 228, 255, 0.62),
        0 0 34px rgba(74, 182, 255, 0.24) !important;
    }

    .beat-swarm-foundation-flash {
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 4;
      background: radial-gradient(circle at center, rgba(185, 236, 255, 0.28), rgba(89, 185, 255, 0.08) 38%, transparent 72%);
      opacity: 0;
    }

    .beat-swarm-foundation-flash.is-active {
      animation: beat-swarm-foundation-flash 220ms ease-out;
    }

    @keyframes beat-swarm-tap-orb-pulse {
      0%, 100% { transform: scale(0.92); opacity: 0.2; }
      50% { transform: scale(1.18); opacity: 0.62; }
    }

    @keyframes beat-swarm-foundation-flash {
      0% { opacity: 0; }
      24% { opacity: 1; }
      100% { opacity: 0; }
    }
  `;
  document.head.appendChild(style);
}

export function createBeatSwarmTapOrbRuntime(deps = {}) {
  const state = {
    active: false,
    startedBar: 0,
    carrierWaveSpawned: false,
    foundationActivated: false,
    nextOrbId: 1,
    foundationHits: new Set(),
    orbs: [],
    rootEl: null,
    flashEl: null,
  };

  function ensureRoot() {
    installStyles();
    const overlay = deps.getOverlayEl?.() || document.body;
    if (!(overlay instanceof HTMLElement)) return null;
    if (!(state.rootEl instanceof HTMLElement)) {
      const root = document.createElement('div');
      root.className = 'beat-swarm-tap-orb-layer';
      root.addEventListener('pointerdown', (ev) => {
        const orbEl = ev.target instanceof HTMLElement ? ev.target.closest('.beat-swarm-tap-orb') : null;
        if (!(orbEl instanceof HTMLElement)) return;
        const orbId = Math.trunc(Number(orbEl.dataset.orbId) || 0);
        const orb = state.orbs.find((entry) => entry.id === orbId) || null;
        if (!orb || orb.status !== 'ready') return;
        ev.preventDefault();
        ev.stopPropagation();
        queueOrb(orb);
      });
      overlay.appendChild(root);
      state.rootEl = root;
    }
    if (!(state.flashEl instanceof HTMLElement)) {
      const flash = document.createElement('div');
      flash.className = 'beat-swarm-foundation-flash';
      overlay.appendChild(flash);
      state.flashEl = flash;
    }
    return state.rootEl;
  }

  function clearDom() {
    for (const orb of state.orbs) {
      try { orb.el?.remove?.(); } catch {}
    }
    state.orbs.length = 0;
    try { state.rootEl?.remove?.(); } catch {}
    try { state.flashEl?.remove?.(); } catch {}
    state.rootEl = null;
    state.flashEl = null;
  }

  function start(options = {}) {
    state.active = true;
    state.startedBar = Math.max(0, Math.trunc(Number(options.startBar) || 0));
    state.carrierWaveSpawned = false;
    state.foundationActivated = false;
    state.foundationHits.clear();
    clearDom();
    ensureRoot();
  }

  function stop() {
    state.active = false;
    state.carrierWaveSpawned = false;
    state.foundationActivated = false;
    state.foundationHits.clear();
    clearDom();
  }

  function getTargetWorld(slotIndex = 0) {
    const center = normalizePoint(deps.getArenaCenterWorld?.());
    const radius = Math.max(120, Number(deps.getArenaRadius?.()) || 360);
    const baseAngles = [-52, -34, 34, 52, -72, 72];
    const angle = (baseAngles[Math.max(0, Math.trunc(Number(slotIndex) || 0)) % baseAngles.length] || -52) * Math.PI / 180;
    return {
      x: center.x + Math.cos(angle) * radius * ORB_REST_RADIUS_MULT,
      y: center.y + Math.sin(angle) * radius * ORB_REST_RADIUS_MULT,
    };
  }

  function spawnFromCarrierDeath(options = {}) {
    if (!state.active || state.foundationActivated) return null;
    const root = ensureRoot();
    if (!(root instanceof HTMLElement)) return null;
    const source = normalizePoint(options.world || options);
    const target = getTargetWorld(state.orbs.length);
    const el = document.createElement('div');
    el.className = 'beat-swarm-tap-orb is-traveling';
    el.dataset.orbId = String(state.nextOrbId);
    el.innerHTML = '<span class="beat-swarm-tap-orb-label">TAP</span>';
    root.appendChild(el);
    const orb = {
      id: state.nextOrbId++,
      status: 'traveling',
      x: source.x,
      y: source.y,
      source,
      target,
      settleT: 0,
      triggerT: 0,
      queuedBeatIndex: -1,
      queuedStepIndex: -1,
      el,
    };
    state.orbs.push(orb);
    return orb;
  }

  function queueOrb(orb) {
    if (!orb || orb.status !== 'ready') return false;
    const clock = deps.getBeatClock?.() || {};
    const beatIndex = Math.max(0, Math.trunc(Number(clock.beatIndex) || 0));
    const stepIndex = Math.max(0, Math.trunc(Number(clock.stepIndex) || beatIndex) % FOUNDATION_STEPS);
    orb.status = 'queued';
    orb.queuedBeatIndex = beatIndex + 1;
    orb.queuedStepIndex = (stepIndex + 1) % FOUNDATION_STEPS;
    try { orb.el?.classList?.remove?.('is-ready'); } catch {}
    try { orb.el?.classList?.add?.('is-queued'); } catch {}
    return true;
  }

  function pulseFoundationFlash() {
    const el = state.flashEl;
    if (!(el instanceof HTMLElement)) return;
    el.classList.remove('is-active');
    void el.offsetWidth;
    el.classList.add('is-active');
  }

  function triggerOrb(orb) {
    if (!orb || orb.status !== 'queued') return false;
    const clock = deps.getBeatClock?.() || {};
    const beatIndex = Math.max(0, Math.trunc(Number(clock.beatIndex) || 0));
    const stepIndex = Math.max(0, Math.trunc(Number(orb.queuedStepIndex) || Number(clock.stepIndex) || beatIndex) % FOUNDATION_STEPS);
    orb.status = 'triggered';
    orb.triggerT = ORB_TRIGGER_SECONDS;
    state.foundationActivated = true;
    state.foundationHits.add(stepIndex);
    try {
      deps.onBeatOrbActivated?.({
        instrumentId: 'BASS TONE 4',
        beatTrackId: 'foundation',
        soundId: 'tap_orb_foundation',
        loopLayer: 'foundation',
        stepIndex,
        beatIndex,
      });
    } catch {}
    try { deps.playFoundationBeat?.({ stepIndex, beatIndex, world: { x: orb.x, y: orb.y } }); } catch {}
    try { deps.addExplosion?.({ x: orb.x, y: orb.y }, 150, 0.3); } catch {}
    try { deps.damageEnemiesNear?.({ x: orb.x, y: orb.y }, 190, 8); } catch {}
    pulseFoundationFlash();
    try {
      orb.el?.classList?.remove?.('is-queued');
      orb.el?.classList?.add?.('is-triggered');
      orb.el?.style?.setProperty('--tap-orb-scale', '1.6');
    } catch {}
    return true;
  }

  function updateOrbMotion(orb, dt) {
    if (!orb || orb.status !== 'traveling') return;
    const target = normalizePoint(orb.target);
    const dx = target.x - orb.x;
    const dy = target.y - orb.y;
    const dist = Math.hypot(dx, dy);
    const step = ORB_TRAVEL_SPEED_WORLD * Math.max(0, Number(dt) || 0);
    if (dist <= Math.max(4, step)) {
      orb.x = target.x;
      orb.y = target.y;
      orb.status = 'settling';
      orb.settleT = ORB_SETTLE_SECONDS;
      try {
        orb.el?.classList?.remove?.('is-traveling');
        orb.el?.classList?.add?.('is-settling');
      } catch {}
      return;
    }
    orb.x += (dx / dist) * step;
    orb.y += (dy / dist) * step;
  }

  function updateOrbState(orb, dt) {
    if (!orb) return;
    if (orb.status === 'traveling') {
      updateOrbMotion(orb, dt);
    } else if (orb.status === 'settling') {
      orb.settleT = Math.max(0, Number(orb.settleT) - dt);
      if (orb.settleT <= 0) {
        orb.status = 'ready';
        try {
          orb.el?.classList?.remove?.('is-settling');
          orb.el?.classList?.add?.('is-ready');
        } catch {}
      }
    } else if (orb.status === 'queued') {
      const clock = deps.getBeatClock?.() || {};
      const beatIndex = Math.max(0, Math.trunc(Number(clock.beatIndex) || 0));
      if (beatIndex >= Math.max(0, Math.trunc(Number(orb.queuedBeatIndex) || 0))) {
        triggerOrb(orb);
      }
    } else if (orb.status === 'triggered') {
      orb.triggerT = Math.max(0, Number(orb.triggerT) - dt);
      if (orb.triggerT <= 0) {
        orb.status = 'consumed';
        try { orb.el?.remove?.(); } catch {}
      }
    }
  }

  function renderOrb(orb) {
    if (!orb?.el) return;
    const screen = deps.worldToScreen?.({ x: orb.x, y: orb.y }) || null;
    if (!screen || !Number.isFinite(screen.x) || !Number.isFinite(screen.y)) {
      orb.el.style.setProperty('--tap-orb-x', '-9999px');
      orb.el.style.setProperty('--tap-orb-y', '-9999px');
      return;
    }
    const pulse = orb.status === 'ready'
      ? 1 + Math.sin((performance.now() || 0) * 0.008) * 0.06
      : 1;
    orb.el.style.setProperty('--tap-orb-x', `${screen.x.toFixed(2)}px`);
    orb.el.style.setProperty('--tap-orb-y', `${screen.y.toFixed(2)}px`);
    if (orb.status !== 'triggered') orb.el.style.setProperty('--tap-orb-scale', pulse.toFixed(3));
  }

  function update(dt = 0) {
    if (!state.active) return;
    ensureRoot();
    const safeDt = Math.max(0, Math.min(0.1, Number(dt) || 0));
    for (const orb of state.orbs) {
      updateOrbState(orb, safeDt);
      renderOrb(orb);
    }
    for (let i = state.orbs.length - 1; i >= 0; i -= 1) {
      if (state.orbs[i]?.status !== 'consumed') continue;
      state.orbs.splice(i, 1);
    }
  }

  function markCarrierEnemy(enemy) {
    if (!enemy || typeof enemy !== 'object') return false;
    enemy.beatCarrier = true;
    enemy.tapOrbCarrier = true;
    enemy.tapOrbDropped = false;
    enemy.soundNote = 'C3';
    try { enemy.el?.classList?.add?.('beat-swarm-beat-carrier'); } catch {}
    return true;
  }

  function noteCarrierWaveSpawned() {
    state.carrierWaveSpawned = true;
  }

  function getFoundationSteps() {
    const steps = Array.from({ length: FOUNDATION_STEPS }, () => false);
    for (const hit of state.foundationHits) {
      const idx = Math.max(0, Math.min(FOUNDATION_STEPS - 1, Math.trunc(Number(hit) || 0)));
      steps[idx] = true;
    }
    return steps;
  }

  return {
    start,
    stop,
    update,
    spawnFromCarrierDeath,
    markCarrierEnemy,
    noteCarrierWaveSpawned,
    getFoundationSteps,
    hasCarrierWaveSpawned: () => state.carrierWaveSpawned === true,
    isActive: () => state.active === true,
    hasActivatedFoundationBeat: () => state.foundationActivated === true,
  };
}
