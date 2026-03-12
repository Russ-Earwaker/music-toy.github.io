export function onWheelRuntimeWrapper(deps = {}) {
  const ev = deps.ev;
  const state = deps.state && typeof deps.state === 'object' ? deps.state : {};
  if (!state.active) return false;
  try { ev?.preventDefault?.(); } catch {}
  try { ev?.stopPropagation?.(); } catch {}
  return true;
}

export function onTransportPauseRuntimeWrapper(deps = {}) {
  const state = deps.state && typeof deps.state === 'object' ? deps.state : {};
  const helpers = deps.helpers && typeof deps.helpers === 'object' ? deps.helpers : {};
  const setGameplayPaused = typeof helpers.setGameplayPaused === 'function' ? helpers.setGameplayPaused : () => {};
  if (!state.active) return false;
  setGameplayPaused(true);
  return true;
}

export function onTransportResumeRuntimeWrapper(deps = {}) {
  const state = deps.state && typeof deps.state === 'object' ? deps.state : {};
  const helpers = deps.helpers && typeof deps.helpers === 'object' ? deps.helpers : {};
  const setGameplayPaused = typeof helpers.setGameplayPaused === 'function' ? helpers.setGameplayPaused : () => {};
  if (!state.active) return false;
  if (state.weaponSubBoardOpen) return false;
  setGameplayPaused(false);
  return true;
}

export function onKeyDownRuntimeWrapper(deps = {}) {
  const ev = deps.ev;
  const state = deps.state && typeof deps.state === 'object' ? deps.state : {};
  const constants = deps.constants && typeof deps.constants === 'object' ? deps.constants : {};
  const helpers = deps.helpers && typeof deps.helpers === 'object' ? deps.helpers : {};
  const setActiveWeaponSlot = typeof helpers.setActiveWeaponSlot === 'function' ? helpers.setActiveWeaponSlot : () => false;

  const maxWeaponSlots = Math.max(1, Math.trunc(Number(constants.maxWeaponSlots) || 1));
  if (!state.active || state.gameplayPaused) return false;
  const code = String(ev?.code || '');
  if (code === 'Digit1') {
    if (setActiveWeaponSlot(0)) {
      try { ev?.preventDefault?.(); } catch {}
      return true;
    }
    return false;
  }
  if (code === 'Digit2') {
    if (setActiveWeaponSlot(1)) {
      try { ev?.preventDefault?.(); } catch {}
      return true;
    }
    return false;
  }
  if (code === 'Digit3') {
    if (setActiveWeaponSlot(2)) {
      try { ev?.preventDefault?.(); } catch {}
      return true;
    }
    return false;
  }
  if (code === 'KeyQ') {
    const next = (Math.max(0, Math.trunc(Number(state.activeWeaponSlotIndex) || 0) + maxWeaponSlots - 1)) % maxWeaponSlots;
    if (setActiveWeaponSlot(next)) {
      try { ev?.preventDefault?.(); } catch {}
      return true;
    }
    return false;
  }
  if (code === 'KeyE') {
    const next = (Math.max(0, Math.trunc(Number(state.activeWeaponSlotIndex) || 0) + 1)) % maxWeaponSlots;
    if (setActiveWeaponSlot(next)) {
      try { ev?.preventDefault?.(); } catch {}
      return true;
    }
    return false;
  }
  return false;
}
