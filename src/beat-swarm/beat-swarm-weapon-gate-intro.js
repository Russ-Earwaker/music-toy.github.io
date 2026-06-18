import { WEAPON_GATE_NOTE_POOL, WEAPON_GATE_TOTAL_SLOTS } from './beat-swarm-weapon-gate-config.js?v=2026-06-18-corridor-curve-v1';
import { applyWeaponGateWallBounce, tickWeaponGateTransientEffects } from './beat-swarm-weapon-gate-effects.js?v=2026-06-18-corridor-curve-v1';
import { clampWeaponGateValue, getWeaponGateCorridorBounds, getWeaponGateCorridorWorldBounds, getWeaponGateShipWorldX } from './beat-swarm-weapon-gate-geometry.js?v=2026-06-18-corridor-curve-v1';
import { updateWeaponGateDashPickup } from './beat-swarm-weapon-gate-pickups.js?v=2026-06-18-corridor-curve-v1';
import { ensureWeaponGateIntroStyle, renderWeaponGateIntro } from './beat-swarm-weapon-gate-render.js?v=2026-06-18-corridor-curve-v1';
import { chooseCurrentWeaponGate } from './beat-swarm-weapon-gate-selection.js?v=2026-06-18-corridor-curve-v1';
import { createWeaponGateIntroState } from './beat-swarm-weapon-gate-state.js?v=2026-06-18-corridor-curve-v1';

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
    const forwardDelta = Math.max(0, Number(options?.forwardDelta) || 0);
    const sideDelta = Number(options?.sideDelta) || 0;
    let appliedSideDelta = sideDelta;
    let reflectedY = false;
    tickWeaponGateTransientEffects(state, dt);
    const pickupDash = updateWeaponGateDashPickup(state, dt, input);
    if (state.phase === 'prelaunch') {
      const { top, bottom, center } = getWeaponGateCorridorWorldBounds(state, getWeaponGateShipWorldX(state));
      state.speed = 0;
      state.y += sideDelta * 0.55;
      state.y += (center - state.y) * Math.min(1, dt * 4.8);
      state.y = clampWeaponGateValue(state.y, top + 34, bottom - 34);
      render();
      return { active: true, sideDelta: (state.y - center) * -0.18 * dt, reflectedY, pickupDash, prelaunch: true };
    }
    if (state.phase === 'outro') {
      const { center } = getWeaponGateCorridorWorldBounds(state, getWeaponGateShipWorldX(state));
      state.speed = Math.min(820, state.speed + 28 * dt);
      state.progress += forwardDelta || (state.speed * dt);
      state.y += sideDelta;
      state.y += (center - state.y) * Math.min(1, dt * 2.3);
      state.completeDelay -= dt;
      render();
      if (state.completeDelay <= 0) {
        stop();
        return { active: false, sideDelta: appliedSideDelta, reflectedY, pickupDash, handoffComplete: true };
      }
      return { active: true, sideDelta: appliedSideDelta, reflectedY, pickupDash, handoffComplete: true };
    }
    const { top, bottom } = getWeaponGateCorridorWorldBounds(state, getWeaponGateShipWorldX(state));
    state.speed = Math.min(700, state.speed + 16 * dt);
    state.progress += forwardDelta || (state.speed * dt);
    state.vy += clampWeaponGateValue(Number(input?.y) || 0, -1, 1) * 1400 * dt;
    state.vy *= Math.pow(0.05, dt);
    state.y += (state.vy * dt) + sideDelta;
    if (state.y < top + 20) {
      if (sideDelta < 0) appliedSideDelta = Math.abs(sideDelta) * 0.78;
      reflectedY = true;
      applyWeaponGateWallBounce(state, top + 20, 1);
    }
    if (state.y > bottom - 20) {
      if (sideDelta > 0) appliedSideDelta = -Math.abs(sideDelta) * 0.78;
      reflectedY = true;
      applyWeaponGateWallBounce(state, bottom - 20, -1);
    }
    chooseCurrentWeaponGate(state, {
      applySelections: deps.applySelections,
      onComplete: deps.onComplete,
      triggerWeaponNote,
    });
    if (!state) {
      return { active: false, sideDelta: appliedSideDelta, reflectedY, pickupDash, handoffComplete: true };
    }
    render();
    return { active: true, sideDelta: appliedSideDelta, reflectedY, pickupDash };
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
      state.speed = 620;
      state.feedbackKind = 'launch';
      state.feedbackText = 'Launch';
      state.feedbackTtl = 0.65;
      return true;
    },
    update,
    isActive: () => !!state,
    getState: () => state,
    getPhase: () => state?.phase || '',
    getArenaBlend,
  };
  function getArenaBlend() {
    if (!state || state.phase !== 'outro') return 0;
    const t = Math.max(0, state.outroDuration - state.completeDelay);
    return clampWeaponGateValue(t / 0.95, 0, 1);
  }
}
