export function setJoystickVisibleRuntime(options = null) {
  const joystickEl = options?.joystickEl || null;
  const show = !!options?.show;
  if (!joystickEl) return;
  joystickEl.classList.toggle('is-visible', show);
}

export function setJoystickCenterRuntime(options = null) {
  const joystickEl = options?.joystickEl || null;
  const x = Number(options?.x) || 0;
  const y = Number(options?.y) || 0;
  if (!joystickEl) return;
  joystickEl.style.left = `${x}px`;
  joystickEl.style.top = `${y}px`;
}

export function setJoystickKnobRuntime(options = null) {
  const joystickKnobEl = options?.joystickKnobEl || null;
  const dx = Number(options?.dx) || 0;
  const dy = Number(options?.dy) || 0;
  if (!joystickKnobEl) return;
  joystickKnobEl.style.transform = `translate(${dx}px, ${dy}px)`;
}

export function updateArenaVisualRuntime(options = null) {
  const scale = Number(options?.scale) || 1;
  const showLimit = !!options?.showLimit;
  const state = options?.state && typeof options.state === 'object' ? options.state : {};
  const constants = options?.constants && typeof options.constants === 'object' ? options.constants : {};
  const helpers = options?.helpers && typeof options.helpers === 'object' ? options.helpers : {};
  const arenaRingEl = state.arenaRingEl || null;
  const arenaCoreEl = state.arenaCoreEl || null;
  const arenaLimitEl = state.arenaLimitEl || null;
  const arenaCenterWorld = state.arenaCenterWorld || null;
  if (!arenaRingEl || !arenaCoreEl || !arenaCenterWorld) return;
  const s = helpers.worldToScreen?.({ x: arenaCenterWorld.x, y: arenaCenterWorld.y });
  if (!s || !Number.isFinite(s.x) || !Number.isFinite(s.y)) {
    arenaRingEl.style.opacity = '0';
    arenaCoreEl.style.opacity = '0';
    if (arenaLimitEl) arenaLimitEl.style.opacity = '0';
    return;
  }
  const arenaRadiusWorld = Number(constants.swarmArenaRadiusWorld) || 0;
  const arenaResistRangeWorld = Number(constants.swarmArenaResistRangeWorld) || 0;
  const rPx = Math.max(140, arenaRadiusWorld * Math.max(0.001, scale || 1));
  const dPx = rPx * 2;
  arenaRingEl.style.opacity = '1';
  arenaRingEl.style.width = `${dPx}px`;
  arenaRingEl.style.height = `${dPx}px`;
  arenaRingEl.style.marginLeft = `${-rPx}px`;
  arenaRingEl.style.marginTop = `${-rPx}px`;
  arenaRingEl.style.transform = `translate(${s.x}px, ${s.y}px)`;
  arenaCoreEl.style.opacity = '1';
  arenaCoreEl.style.transform = `translate(${s.x}px, ${s.y}px)`;
  if (arenaLimitEl) {
    const rLimitPx = Math.max(150, (arenaRadiusWorld + arenaResistRangeWorld) * Math.max(0.001, scale || 1));
    const dLimitPx = rLimitPx * 2;
    arenaLimitEl.style.opacity = showLimit ? '1' : '0';
    arenaLimitEl.style.width = `${dLimitPx}px`;
    arenaLimitEl.style.height = `${dLimitPx}px`;
    arenaLimitEl.style.marginLeft = `${-rLimitPx}px`;
    arenaLimitEl.style.marginTop = `${-rLimitPx}px`;
    arenaLimitEl.style.transform = `translate(${s.x}px, ${s.y}px)`;
  }
}

export function setResistanceVisualRuntime(options = null) {
  const resistanceEl = options?.resistanceEl || null;
  const visible = !!options?.visible;
  const angleDeg = Number(options?.angleDeg) || 0;
  const strength = Number(options?.strength) || 0;
  if (!resistanceEl) return;
  if (!visible || !(strength > 0.001)) {
    resistanceEl.classList.remove('is-visible');
    resistanceEl.style.opacity = '0';
    return;
  }
  const s = Math.max(0, Math.min(1, strength));
  resistanceEl.classList.add('is-visible');
  resistanceEl.style.opacity = `${(0.24 + 0.72 * s).toFixed(3)}`;
  resistanceEl.style.setProperty('--bs-resist-thickness', `${(2 + 8 * s).toFixed(2)}px`);
  resistanceEl.style.setProperty('--bs-resist-rotation', `${angleDeg.toFixed(2)}deg`);
}

export function setThrustFxVisualRuntime(options = null) {
  const thrustFxEl = options?.thrustFxEl || null;
  const visible = !!options?.visible;
  const state = options?.state && typeof options.state === 'object' ? options.state : {};
  const constants = options?.constants && typeof options.constants === 'object' ? options.constants : {};
  const lastLaunchBeatLevel = Number(state.lastLaunchBeatLevel) || 0;
  const maxBeatLevel = Math.max(1, Number(constants.swarmReleaseBeatLevelMax) || 1);
  if (!thrustFxEl) return;
  if (!visible) {
    thrustFxEl.classList.remove('is-visible', 'is-full');
    thrustFxEl.style.opacity = '0';
    return;
  }
  const lvl = Math.max(0, Math.min(maxBeatLevel, lastLaunchBeatLevel));
  const t = lvl / maxBeatLevel;
  const len = 18 + (70 * t);
  const width = 5 + (8 * t);
  thrustFxEl.classList.add('is-visible');
  thrustFxEl.classList.toggle('is-full', lvl >= maxBeatLevel);
  thrustFxEl.style.opacity = `${(0.35 + (0.55 * t)).toFixed(3)}`;
  thrustFxEl.style.setProperty('--bs-thrust-len', `${len.toFixed(2)}px`);
  thrustFxEl.style.setProperty('--bs-thrust-width', `${width.toFixed(2)}px`);
}

export function getReactiveReleaseImpulseRuntime(options = null) {
  const outsideN = Number(options?.outsideN) || 0;
  const pushCharge = Number(options?.pushCharge) || 0;
  const state = options?.state && typeof options.state === 'object' ? options.state : {};
  const constants = options?.constants && typeof options.constants === 'object' ? options.constants : {};
  const helpers = options?.helpers && typeof options.helpers === 'object' ? options.helpers : {};
  const releaseForcePrimed = !!state.releaseForcePrimed;
  const effectivePush = releaseForcePrimed ? 1 : Math.max(0, Math.min(1, pushCharge));
  const effectiveOutside = releaseForcePrimed ? 1 : Math.max(0, Math.min(1, outsideN));
  const baseImpulse = Number(constants.swarmArenaSlingshotImpulse) || 0;
  const base = baseImpulse * (0.5 + (effectivePush * 1.25) + (effectiveOutside * 0.65));
  return base * (Number(helpers.getReleaseBeatMultiplier?.() || 1));
}

export function setReactiveArrowVisualRuntime(options = null) {
  const reactiveArrowEl = options?.reactiveArrowEl || null;
  const thrustFxEl = options?.thrustFxEl || null;
  const visible = !!options?.visible;
  const angleDeg = Number(options?.angleDeg) || 0;
  const impulse = Number(options?.impulse) || 0;
  const state = options?.state && typeof options.state === 'object' ? options.state : {};
  const constants = options?.constants && typeof options.constants === 'object' ? options.constants : {};
  const helpers = options?.helpers && typeof options.helpers === 'object' ? options.helpers : {};
  const releaseForcePrimed = !!state.releaseForcePrimed;
  const releaseBeatLevel = Math.max(0, Number(state.releaseBeatLevel) || 0);
  const maxBeatLevel = Math.max(1, Number(constants.swarmReleaseBeatLevelMax) || 1);
  if (!reactiveArrowEl) return;
  const multiplierPips = releaseForcePrimed ? Math.max(0, Math.min(3, Math.floor(releaseBeatLevel))) : 0;
  reactiveArrowEl.classList.toggle('is-primed', releaseForcePrimed);
  reactiveArrowEl.style.setProperty('--bs-reactive-arrow-thickness', `${(3 + (multiplierPips * 2)).toFixed(2)}px`);
  if (!visible || !(impulse > 0.001)) {
    reactiveArrowEl.classList.remove('is-visible');
    reactiveArrowEl.classList.remove('is-full-charge');
    reactiveArrowEl.style.opacity = '0';
    return;
  }
  const maxImpulse = Number(helpers.getReactiveReleaseImpulse?.(1, 1) || 1);
  const t = Math.max(0, Math.min(1, impulse / Math.max(1, maxImpulse)));
  const len = 26 + (160 * t);
  reactiveArrowEl.classList.add('is-visible');
  reactiveArrowEl.style.opacity = `${(0.24 + (0.74 * t)).toFixed(3)}`;
  reactiveArrowEl.style.setProperty('--bs-reactive-arrow-len', `${len.toFixed(2)}px`);
  reactiveArrowEl.style.setProperty('--bs-reactive-arrow-angle', `${angleDeg.toFixed(2)}deg`);
  if (thrustFxEl) thrustFxEl.style.setProperty('--bs-reactive-arrow-angle', `${angleDeg.toFixed(2)}deg`);
  reactiveArrowEl.classList.toggle('is-full-charge', releaseBeatLevel >= maxBeatLevel);
}

export function pulseReactiveArrowChargeRuntime(options = null) {
  const reactiveArrowEl = options?.reactiveArrowEl || null;
  if (!reactiveArrowEl) return;
  reactiveArrowEl.classList.remove('is-beat-pulse');
  void reactiveArrowEl.offsetWidth;
  reactiveArrowEl.classList.add('is-beat-pulse');
}

export function pulsePlayerShipNoteFlashRuntime(options = null) {
  const overlayEl = options?.overlayEl || null;
  const shipEl = overlayEl?.querySelector?.('.beat-swarm-ship');
  if (!(shipEl instanceof HTMLElement)) return;
  shipEl.classList.remove('is-note-flash');
  void shipEl.offsetWidth;
  shipEl.classList.add('is-note-flash');
}
