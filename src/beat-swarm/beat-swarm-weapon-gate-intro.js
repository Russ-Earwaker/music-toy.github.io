import {
  WEAPON_GATE_CRUISE_SPEED,
  WEAPON_GATE_LAUNCH_DECEL_SECONDS,
  WEAPON_GATE_LAUNCH_SPEED,
  WEAPON_GATE_NOTE_POOL,
  WEAPON_GATE_TOTAL_SLOTS,
  getWeaponGateTravelDistance,
} from './beat-swarm-weapon-gate-config.js?v=2026-07-23-weapon-gate-cadence-v6';
import { tickWeaponGateTransientEffects } from './beat-swarm-weapon-gate-effects.js?v=2026-07-19-rhythm-visuals-v32';
import { clampWeaponGateValue, getWeaponGateCorridorBounds, getWeaponGateCorridorWorldBounds, getWeaponGateShipWorldX } from './beat-swarm-weapon-gate-geometry.js?v=2026-06-18-corridor-curve-v1';
import { ensureWeaponGateIntroStyle, renderWeaponGateIntro } from './beat-swarm-weapon-gate-render.js?v=2026-07-23-weapon-gate-cadence-v1';
import { chooseCurrentWeaponGate } from './beat-swarm-weapon-gate-selection.js?v=2026-07-24-weapon-gate-layering-v1';
import { createWeaponGateIntroState, initializeWeaponGateSchedule } from './beat-swarm-weapon-gate-state.js?v=2026-07-23-weapon-gate-cadence-v6';

export function createBeatSwarmWeaponGateIntroRuntime(deps = {}) {
  let state = null;
  function getLayer() {
    const overlay = deps.getOverlayEl?.();
    if (!(overlay instanceof HTMLElement)) return null;
    let layer = overlay.querySelector('.beat-swarm-weapon-gate-intro');
    if (!(layer instanceof HTMLElement)) {
      layer = document.createElement('div');
      layer.className = 'beat-swarm-weapon-gate-intro';
      overlay.appendChild(layer);
    }
    return layer;
  }
  function start(options = {}) {
    ensureWeaponGateIntroStyle();
    const layer = getLayer();
    if (!layer) return false;
    state = createWeaponGateIntroState(layer, options);
    render();
    return true;
  }

  function stop() {
    if (state?.layer) {
      const layer = state.layer;
      layer.style.transition = 'opacity 420ms ease';
      layer.style.opacity = '0';
      setTimeout(() => {
        if (layer.isConnected) {
          layer.innerHTML = '';
          layer.style.transition = '';
          layer.style.opacity = '';
        }
      }, 450);
    }
    state = null;
  }

  function update(dt, input = null, options = null) {
    if (!state) return false;
    const sideDelta = Number(options?.sideDelta) || 0;
    let appliedSideDelta = sideDelta;
    tickWeaponGateTransientEffects(state, dt);
    state.flowTime = Math.max(0, Number(state.flowTime) || 0) + dt;
    if (state.phase === 'prelaunch') {
      const { top, bottom, center } = getWeaponGateCorridorWorldBounds(state, getWeaponGateShipWorldX(state));
      state.speed = 0;
      state.y += sideDelta * 0.55;
      state.y += (center - state.y) * Math.min(1, dt * 4.8);
      state.y = clampWeaponGateValue(state.y, top + 34, bottom - 34);
      render();
      return { active: true, forwardDelta: 0, sideDelta: (state.y - center) * -0.18 * dt, prelaunch: true };
    }
    if (state.phase === 'outro') {
      const { center } = getWeaponGateCorridorWorldBounds(state, getWeaponGateShipWorldX(state));
      state.speed = Math.min(1100, state.speed + 36 * dt);
      const forwardDelta = state.speed * dt;
      state.progress += forwardDelta;
      state.y += sideDelta;
      state.y += (center - state.y) * Math.min(1, dt * 2.3);
      state.completeDelay -= dt;
      render();
      if (state.completeDelay <= 0) {
        stop();
        return { active: false, forwardDelta, sideDelta: appliedSideDelta, handoffComplete: true };
      }
      return { active: true, forwardDelta, sideDelta: appliedSideDelta, handoffComplete: true };
    }
    const { top, bottom } = getWeaponGateCorridorWorldBounds(state, getWeaponGateShipWorldX(state));
    state.launchElapsed = Math.max(0, Number(state.launchElapsed) || 0) + dt;
    const launchN = clampWeaponGateValue(state.launchElapsed / Math.max(0.001, WEAPON_GATE_LAUNCH_DECEL_SECONDS), 0, 1);
    state.speed = WEAPON_GATE_LAUNCH_SPEED + ((WEAPON_GATE_CRUISE_SPEED - WEAPON_GATE_LAUNCH_SPEED) * launchN);
    const nextProgress = (Number(state.launchProgress) || 0) + getWeaponGateTravelDistance(state.launchElapsed);
    const forwardDelta = Math.max(0, nextProgress - (Number(state.progress) || 0));
    state.progress = nextProgress;
    state.y = clampWeaponGateValue(state.y + sideDelta, top + 20, bottom - 20);
    appliedSideDelta = state.y <= top + 20 || state.y >= bottom - 20 ? 0 : sideDelta;
    chooseCurrentWeaponGate(state, {
      applySelections: deps.applySelections,
      onComplete: deps.onComplete,
      onSelection: deps.onSelection,
      triggerWeaponNote,
    });
    if (!state) {
      return { active: false, forwardDelta, sideDelta: appliedSideDelta, handoffComplete: true };
    }
    render();
    return { active: true, forwardDelta, sideDelta: appliedSideDelta };
  }

  function triggerWeaponNote(note, source) {
    try {
      if (typeof deps.triggerWeaponNote === 'function') {
        deps.triggerWeaponNote(note || 'C4', source);
        return true;
      }
    } catch {}
    return false;
  }
  function getCorridorBounds() {
    return getWeaponGateCorridorBounds(state);
  }

  function render() {
    renderWeaponGateIntro(state, {
      corridorBounds: getCorridorBounds(),
      notePool: WEAPON_GATE_NOTE_POOL,
      totalSlots: WEAPON_GATE_TOTAL_SLOTS,
    });
  }

  return {
    start,
    stop,
    launch() {
      if (!state || state.phase !== 'prelaunch') return false;
      state.phase = 'gate';
      state.speed = WEAPON_GATE_LAUNCH_SPEED;
      initializeWeaponGateSchedule(
        state,
        deps.getWeaponStepSeconds?.(),
        deps.getWeaponStepAlignmentDelay?.()
      );
      state.feedbackKind = 'launch';
      state.feedbackText = 'Launch';
      state.feedbackTtl = 0.65;
      return true;
    },
    update,
    isActive: () => !!state,
    getState: () => state,
    getPhase: () => state?.phase || '',
    pulseMotifStep(stepIndex = 0) {
      if (!state || state.livePlaybackStarted !== true) return false;
      const slot = ((Math.trunc(Number(stepIndex) || 0) % WEAPON_GATE_TOTAL_SLOTS) + WEAPON_GATE_TOTAL_SLOTS) % WEAPON_GATE_TOTAL_SLOTS;
      if (!state.noteStars.some((star) => {
        const starSlot = Number(star?.slot);
        return Number.isFinite(starSlot) && Math.trunc(starSlot) === slot;
      })) return false;
      state.noteStarPulseSlot = slot;
      state.noteStarPulseT = Math.max(Number(state.noteStarPulseT) || 0, 0.22);
      return true;
    },
    getArenaBlend,
  };
  function getArenaBlend() {
    if (!state || state.phase !== 'outro') return 0;
    const t = Math.max(0, state.outroDuration - state.completeDelay);
    return clampWeaponGateValue(t / 0.95, 0, 1);
  }
}
