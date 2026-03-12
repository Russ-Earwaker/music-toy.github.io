export function clearPauseWeaponDragMarkersRuntime(options = null) {
  const state = options?.state && typeof options.state === 'object' ? options.state : {};
  const pauseScreenEl = state.pauseScreenEl || null;
  if (!pauseScreenEl) return;
  for (const el of pauseScreenEl.querySelectorAll('.beat-swarm-stage-cell.is-drag-source, .beat-swarm-stage-cell.is-drag-target')) {
    el.classList.remove('is-drag-source', 'is-drag-target');
  }
}

export function clearPauseWeaponDragProxyRuntime(options = null) {
  const state = options?.state && typeof options.state === 'object' ? options.state : {};
  const pauseWeaponDrag = state.pauseWeaponDrag || null;
  if (!pauseWeaponDrag?.proxyEl) return;
  try { pauseWeaponDrag.proxyEl.remove?.(); } catch {}
  pauseWeaponDrag.proxyEl = null;
}

export function resetPauseWeaponDragRuntime(options = null) {
  const suppressClick = !!options?.suppressClick;
  const state = options?.state && typeof options.state === 'object' ? options.state : {};
  const pauseWeaponDrag = state.pauseWeaponDrag || null;
  const helpers = options?.helpers && typeof options.helpers === 'object' ? options.helpers : {};
  if (!pauseWeaponDrag) return;
  if (pauseWeaponDrag.holdTimer) {
    try { clearTimeout(pauseWeaponDrag.holdTimer); } catch {}
    pauseWeaponDrag.holdTimer = 0;
  }
  if (suppressClick) pauseWeaponDrag.suppressClickUntil = (performance.now() || 0) + 280;
  helpers.clearPauseWeaponDragMarkers?.(options);
  helpers.clearPauseWeaponDragProxy?.(options);
  pauseWeaponDrag.pointerId = null;
  pauseWeaponDrag.started = false;
  pauseWeaponDrag.sourceSlotIndex = -1;
  pauseWeaponDrag.sourceStageIndex = -1;
  pauseWeaponDrag.targetSlotIndex = -1;
  pauseWeaponDrag.targetStageIndex = -1;
}

export function getPauseWeaponStageCellFromEventTargetRuntime(options = null) {
  const target = options?.target || null;
  if (!(target instanceof HTMLElement)) return null;
  const cell = target.closest('.beat-swarm-stage-cell.is-filled[data-slot-index][data-stage-index]');
  return (cell instanceof HTMLElement) ? cell : null;
}

export function parsePauseWeaponStageCellRuntime(options = null) {
  const cellEl = options?.cellEl || null;
  const state = options?.state && typeof options.state === 'object' ? options.state : {};
  const helpers = options?.helpers && typeof options.helpers === 'object' ? options.helpers : {};
  const weaponLoadout = Array.isArray(state.weaponLoadout) ? state.weaponLoadout : [];
  if (!(cellEl instanceof HTMLElement)) return null;
  const slotIndex = Math.trunc(Number(cellEl.dataset.slotIndex));
  const stageIndex = Math.trunc(Number(cellEl.dataset.stageIndex));
  if (!(slotIndex >= 0 && slotIndex < weaponLoadout.length)) return null;
  const stages = helpers.sanitizeWeaponStages?.(weaponLoadout[slotIndex]?.stages) || [];
  if (!(stageIndex >= 0 && stageIndex < stages.length)) return null;
  return { slotIndex, stageIndex };
}

export function getPauseWeaponDropTargetAtClientRuntime(options = null) {
  const clientX = Number(options?.clientX) || 0;
  const clientY = Number(options?.clientY) || 0;
  const sourceSlotIndex = Math.trunc(Number(options?.sourceSlotIndex));
  const sourceStageIndex = Math.trunc(Number(options?.sourceStageIndex));
  const helpers = options?.helpers && typeof options.helpers === 'object' ? options.helpers : {};
  const raw = document.elementFromPoint(clientX, clientY);
  const cell = helpers.getPauseWeaponStageCellFromEventTarget?.({ ...options, target: raw }) || null;
  if (!cell) return null;
  const parsed = helpers.parsePauseWeaponStageCell?.({ ...options, cellEl: cell }) || null;
  if (!parsed) return null;
  if (parsed.slotIndex !== sourceSlotIndex) return null;
  if (parsed.stageIndex === sourceStageIndex) return null;
  return { ...parsed, cellEl: cell };
}

export function reorderWeaponStagesRuntime(options = null) {
  const slotIndex = Math.trunc(Number(options?.slotIndex));
  const fromStageIndex = Math.trunc(Number(options?.fromStageIndex));
  const dropBeforeStageIndex = Math.trunc(Number(options?.dropBeforeStageIndex));
  const state = options?.state && typeof options.state === 'object' ? options.state : {};
  const helpers = options?.helpers && typeof options.helpers === 'object' ? options.helpers : {};
  const weaponLoadout = Array.isArray(state.weaponLoadout) ? state.weaponLoadout : [];
  if (!(slotIndex >= 0 && slotIndex < weaponLoadout.length)) return false;
  const slot = weaponLoadout[slotIndex];
  const stages = helpers.sanitizeWeaponStages?.(slot?.stages) || [];
  if (!(fromStageIndex >= 0 && fromStageIndex < stages.length)) return false;
  if (!(dropBeforeStageIndex >= 0 && dropBeforeStageIndex < stages.length)) return false;
  if (fromStageIndex === dropBeforeStageIndex) return false;
  const a = stages[fromStageIndex];
  const b = stages[dropBeforeStageIndex];
  stages[fromStageIndex] = b;
  stages[dropBeforeStageIndex] = a;
  slot.stages = stages;
  return true;
}

export function updatePauseWeaponDragVisualRuntime(options = null) {
  const clientX = Number(options?.clientX) || 0;
  const clientY = Number(options?.clientY) || 0;
  const state = options?.state && typeof options.state === 'object' ? options.state : {};
  const pauseWeaponDrag = state.pauseWeaponDrag || null;
  const pauseScreenEl = state.pauseScreenEl || null;
  const helpers = options?.helpers && typeof options.helpers === 'object' ? options.helpers : {};
  if (!pauseWeaponDrag) return;
  if (pauseWeaponDrag.proxyEl) {
    pauseWeaponDrag.proxyEl.style.left = `${clientX}px`;
    pauseWeaponDrag.proxyEl.style.top = `${clientY}px`;
  }
  helpers.clearPauseWeaponDragMarkers?.(options);
  const sourceSelector = `.beat-swarm-stage-cell.is-filled[data-slot-index="${pauseWeaponDrag.sourceSlotIndex}"][data-stage-index="${pauseWeaponDrag.sourceStageIndex}"]`;
  pauseScreenEl?.querySelector?.(sourceSelector)?.classList?.add?.('is-drag-source');
  const target = helpers.getPauseWeaponDropTargetAtClient?.({
    ...options,
    clientX,
    clientY,
    sourceSlotIndex: pauseWeaponDrag.sourceSlotIndex,
    sourceStageIndex: pauseWeaponDrag.sourceStageIndex,
  }) || null;
  pauseWeaponDrag.targetSlotIndex = target?.slotIndex ?? -1;
  pauseWeaponDrag.targetStageIndex = target?.stageIndex ?? -1;
  if (target?.cellEl) target.cellEl.classList.add('is-drag-target');
}

export function beginPauseWeaponDragRuntime(options = null) {
  const clientX = Number(options?.clientX) || 0;
  const clientY = Number(options?.clientY) || 0;
  const state = options?.state && typeof options.state === 'object' ? options.state : {};
  const pauseWeaponDrag = state.pauseWeaponDrag || null;
  const pauseScreenEl = state.pauseScreenEl || null;
  const helpers = options?.helpers && typeof options.helpers === 'object' ? options.helpers : {};
  if (!pauseWeaponDrag || pauseWeaponDrag.started || pauseWeaponDrag.pointerId == null || !pauseScreenEl) return;
  pauseWeaponDrag.started = true;
  try { pauseScreenEl.setPointerCapture(pauseWeaponDrag.pointerId); } catch {}
  const sourceSelector = `.beat-swarm-stage-cell.is-filled[data-slot-index="${pauseWeaponDrag.sourceSlotIndex}"][data-stage-index="${pauseWeaponDrag.sourceStageIndex}"] .beat-swarm-stage-component-btn`;
  const sourceBtn = pauseScreenEl.querySelector(sourceSelector);
  if (sourceBtn instanceof HTMLElement) {
    const rect = sourceBtn.getBoundingClientRect();
    const proxy = sourceBtn.cloneNode(true);
    if (proxy instanceof HTMLElement) {
      proxy.classList.add('beat-swarm-stage-drag-proxy');
      proxy.style.width = `${Math.max(80, rect.width).toFixed(2)}px`;
      proxy.style.height = `${Math.max(80, rect.height).toFixed(2)}px`;
      document.body.appendChild(proxy);
      pauseWeaponDrag.proxyEl = proxy;
    }
  }
  helpers.updatePauseWeaponDragVisual?.({ ...options, clientX, clientY });
}
