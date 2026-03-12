export function ensurePauseWeaponUiRuntime(ctx) {
  const {
    getPauseScreenEl,
    getPauseWeaponDrag,
    getStagePickerState,
    getTuneEditorState,
    getWeaponSubBoardState,
    getWeaponLoadout,
    getPreviewSelectedWeaponSlotIndex,
    setPreviewSelectedWeaponSlotIndex,
    renderPauseWeaponUi,
    closeWeaponSubBoardEditor,
    openWeaponSubBoardEditor,
    getWeaponComponentDefById,
    clearHelpers,
    persistBeatSwarmState,
    createRandomWeaponStages,
    getPauseWeaponStageCellFromEventTarget,
    parsePauseWeaponStageCell,
    resetPauseWeaponDrag,
    beginPauseWeaponDrag,
    updatePauseWeaponDragVisual,
    reorderWeaponStages,
    pauseWeaponDragHoldMs,
    maxWeaponStages,
  } = ctx;
  const pauseScreenEl = getPauseScreenEl();
  if (!pauseScreenEl) return;
  if (pauseScreenEl.dataset.uiReady === '1') return;
  pauseScreenEl.dataset.uiReady = '1';
  renderPauseWeaponUi();
  pauseScreenEl.addEventListener('click', (ev) => {
    const pauseWeaponDrag = getPauseWeaponDrag();
    const stagePickerState = getStagePickerState();
    const tuneEditorState = getTuneEditorState();
    const weaponLoadout = getWeaponLoadout();
    if ((performance.now() || 0) < (Number(pauseWeaponDrag.suppressClickUntil) || 0)) {
      ev.preventDefault();
      ev.stopPropagation();
      return;
    }
    const target = ev.target;
    if (!(target instanceof HTMLElement)) return;
    if (!(target.closest('button, select, option, input, label'))) {
      const row = target.closest('.beat-swarm-weapon-card');
      if (row instanceof HTMLElement) {
        const slotIndex = Math.trunc(Number(row.dataset.slotIndex));
        if (slotIndex >= 0 && slotIndex < weaponLoadout.length) {
          const prev = getPreviewSelectedWeaponSlotIndex();
          setPreviewSelectedWeaponSlotIndex(prev === slotIndex ? null : slotIndex);
          renderPauseWeaponUi();
          return;
        }
      }
    }
    const actionEl = target.closest('[data-action]');
    if (!(actionEl instanceof HTMLElement)) return;
    const slotIndex = Math.trunc(Number(actionEl.dataset.slotIndex));
    const action = String(actionEl.dataset.action || '');
    if (action === 'close-component-picker') {
      stagePickerState.open = false;
      stagePickerState.slotIndex = -1;
      stagePickerState.stageIndex = -1;
      renderPauseWeaponUi();
      return;
    }
    if (action === 'close-weapon-tune') {
      closeWeaponSubBoardEditor();
      return;
    }
    if (!(slotIndex >= 0 && slotIndex < weaponLoadout.length)) return;
    const slot = weaponLoadout[slotIndex];
    if (action === 'open-weapon-tune') {
      openWeaponSubBoardEditor(slotIndex);
      return;
    }
    if (action === 'random-weapon') {
      slot.stages = createRandomWeaponStages();
      clearHelpers();
      stagePickerState.open = false;
      renderPauseWeaponUi();
      persistBeatSwarmState();
      return;
    }
    if (action === 'open-component-picker') {
      tuneEditorState.open = false;
      tuneEditorState.slotIndex = -1;
      const stageIndex = Math.max(0, Math.min(maxWeaponStages - 1, Math.trunc(Number(actionEl.dataset.stageIndex))));
      stagePickerState.open = true;
      stagePickerState.slotIndex = slotIndex;
      stagePickerState.stageIndex = stageIndex;
      renderPauseWeaponUi();
      return;
    }
    if (action === 'remove-stage') {
      const stageIndex = Math.trunc(Number(actionEl.dataset.stageIndex));
      if (!(stageIndex >= 0 && stageIndex < slot.stages.length)) return;
      slot.stages.splice(stageIndex, 1);
      clearHelpers();
      stagePickerState.open = false;
      renderPauseWeaponUi();
      persistBeatSwarmState();
      return;
    }
    if (action === 'assign-component') {
      const stageIndex = Math.max(0, Math.min(maxWeaponStages - 1, Math.trunc(Number(actionEl.dataset.stageIndex))));
      const componentId = String(actionEl.dataset.componentId || '');
      const component = getWeaponComponentDefById(componentId);
      if (!component) return;
      const prevStage = stageIndex > 0 ? slot.stages[stageIndex - 1] : null;
      if (
        prevStage
        && prevStage.archetype === 'helper'
        && component.archetype === 'helper'
        && String(prevStage.variant) === String(component.variant)
      ) return;
      if (stageIndex < slot.stages.length) {
        slot.stages[stageIndex] = { archetype: component.archetype, variant: component.variant };
      } else if (stageIndex === slot.stages.length && slot.stages.length < maxWeaponStages) {
        slot.stages.push({ archetype: component.archetype, variant: component.variant });
      } else {
        return;
      }
      stagePickerState.open = false;
      stagePickerState.slotIndex = -1;
      stagePickerState.stageIndex = -1;
      clearHelpers();
      renderPauseWeaponUi();
      persistBeatSwarmState();
    }
  });
  pauseScreenEl.addEventListener('pointerdown', (ev) => {
    const stagePickerState = getStagePickerState();
    const tuneEditorState = getTuneEditorState();
    const weaponSubBoardState = getWeaponSubBoardState();
    const pauseWeaponDrag = getPauseWeaponDrag();
    if (!getPauseScreenEl() || stagePickerState.open || tuneEditorState.open || weaponSubBoardState.open) return;
    if (!(ev instanceof PointerEvent)) return;
    if (ev.button !== 0) return;
    if (pauseWeaponDrag.pointerId != null) resetPauseWeaponDrag(false);
    const dragHandle = (ev.target instanceof HTMLElement)
      ? ev.target.closest('.beat-swarm-stage-component-btn:not(.is-empty)')
      : null;
    if (!(dragHandle instanceof HTMLElement)) return;
    const cell = getPauseWeaponStageCellFromEventTarget(ev.target);
    const parsed = parsePauseWeaponStageCell(cell);
    if (!parsed) return;
    pauseWeaponDrag.pointerId = ev.pointerId;
    pauseWeaponDrag.started = false;
    pauseWeaponDrag.startX = Number(ev.clientX) || 0;
    pauseWeaponDrag.startY = Number(ev.clientY) || 0;
    pauseWeaponDrag.lastX = pauseWeaponDrag.startX;
    pauseWeaponDrag.lastY = pauseWeaponDrag.startY;
    pauseWeaponDrag.sourceSlotIndex = parsed.slotIndex;
    pauseWeaponDrag.sourceStageIndex = parsed.stageIndex;
    pauseWeaponDrag.targetSlotIndex = -1;
    pauseWeaponDrag.targetStageIndex = -1;
    if (pauseWeaponDrag.holdTimer) {
      try { clearTimeout(pauseWeaponDrag.holdTimer); } catch {}
      pauseWeaponDrag.holdTimer = 0;
    }
    pauseWeaponDrag.holdTimer = setTimeout(() => {
      pauseWeaponDrag.holdTimer = 0;
      if (pauseWeaponDrag.pointerId !== ev.pointerId) return;
      beginPauseWeaponDrag(pauseWeaponDrag.lastX, pauseWeaponDrag.lastY);
    }, pauseWeaponDragHoldMs);
  });
  pauseScreenEl.addEventListener('pointermove', (ev) => {
    const pauseWeaponDrag = getPauseWeaponDrag();
    if (!(ev instanceof PointerEvent)) return;
    if (pauseWeaponDrag.pointerId !== ev.pointerId) return;
    pauseWeaponDrag.lastX = Number(ev.clientX) || 0;
    pauseWeaponDrag.lastY = Number(ev.clientY) || 0;
    if (!pauseWeaponDrag.started) return;
    updatePauseWeaponDragVisual(pauseWeaponDrag.lastX, pauseWeaponDrag.lastY);
    ev.preventDefault();
  });
  pauseScreenEl.addEventListener('pointerup', (ev) => {
    const pauseWeaponDrag = getPauseWeaponDrag();
    const stagePickerState = getStagePickerState();
    if (!(ev instanceof PointerEvent)) return;
    if (pauseWeaponDrag.pointerId !== ev.pointerId) return;
    if (pauseWeaponDrag.started) {
      const didReorder = reorderWeaponStages(
        pauseWeaponDrag.sourceSlotIndex,
        pauseWeaponDrag.sourceStageIndex,
        pauseWeaponDrag.targetStageIndex
      );
      resetPauseWeaponDrag(true);
      if (didReorder) {
        clearHelpers();
        stagePickerState.open = false;
        stagePickerState.slotIndex = -1;
        stagePickerState.stageIndex = -1;
        renderPauseWeaponUi();
        persistBeatSwarmState();
      }
    } else {
      resetPauseWeaponDrag(false);
    }
    try { pauseScreenEl.releasePointerCapture(ev.pointerId); } catch {}
  });
  pauseScreenEl.addEventListener('pointercancel', (ev) => {
    const pauseWeaponDrag = getPauseWeaponDrag();
    if (!(ev instanceof PointerEvent)) return;
    if (pauseWeaponDrag.pointerId !== ev.pointerId) return;
    resetPauseWeaponDrag(false);
    try { pauseScreenEl.releasePointerCapture(ev.pointerId); } catch {}
  });
  pauseScreenEl.addEventListener('lostpointercapture', (ev) => {
    const pauseWeaponDrag = getPauseWeaponDrag();
    if (!(ev instanceof PointerEvent)) return;
    if (pauseWeaponDrag.pointerId !== ev.pointerId) return;
    resetPauseWeaponDrag(false);
  });
}

export function renderPauseWeaponUiRuntime(ctx) {
  const {
    getPauseScreenEl,
    getWeaponLoadout,
    sanitizeWeaponTune,
    getWeaponTuneActivityStats,
    getWeaponTuneDamageScale,
    maxWeaponStages,
    getWeaponComponentDefForStage,
    renderComponentPreviewMarkup,
    getPreviewSelectedWeaponSlotIndex,
    getStagePickerState,
    weaponArchetypes,
    weaponComponents,
    resetPausePreviewState,
    initComponentLivePreviews,
    syncTuneEditorPlayheadUi,
  } = ctx;
  const pauseScreenEl = getPauseScreenEl();
  if (!pauseScreenEl) return { pausePreviewSceneEl: null, pausePreviewStatusEl: null };
  const weaponLoadout = getWeaponLoadout();
  const stagePickerState = getStagePickerState();
  const cards = weaponLoadout.map((slot, slotIndex) => {
    const tune = sanitizeWeaponTune(slot.tune);
    slot.tune = tune;
    const tuneStats = getWeaponTuneActivityStats(slotIndex);
    const tuneActiveCount = Math.max(0, Math.trunc(Number(tuneStats.activeNotes) || 0));
    const tuneTotalCount = Math.max(1, Math.trunc(Number(tuneStats.totalNotes) || 8));
    const tuneDmgScale = getWeaponTuneDamageScale(slotIndex);
    const stageCells = Array.from({ length: maxWeaponStages }, (_, stageIndex) => {
      const st = slot.stages[stageIndex] || null;
      const isFillableEmpty = !st && stageIndex === slot.stages.length;
      const comp = getWeaponComponentDefForStage(st);
      if (!st) {
        return `
          <div class="beat-swarm-stage-cell is-empty">
            <div class="beat-swarm-stage-index">${stageIndex + 1}</div>
            <button
              type="button"
              class="beat-swarm-stage-component-btn is-empty"
              data-action="open-component-picker"
              data-slot-index="${slotIndex}"
              data-stage-index="${stageIndex}"
              ${isFillableEmpty ? '' : 'disabled'}
            >
              ${renderComponentPreviewMarkup(null)}
              <span class="beat-swarm-stage-component-name">Select Component</span>
              <span class="beat-swarm-stage-component-detail">${isFillableEmpty ? 'Tap to choose' : 'Fill previous stage first'}</span>
            </button>
          </div>
        `;
      }
      return `
        <div class="beat-swarm-stage-cell is-filled" data-slot-index="${slotIndex}" data-stage-index="${stageIndex}">
          <div class="beat-swarm-stage-index">${stageIndex + 1}</div>
          <button type="button" class="beat-swarm-stage-component-btn" data-action="open-component-picker" data-slot-index="${slotIndex}" data-stage-index="${stageIndex}">
            ${renderComponentPreviewMarkup(comp)}
            <span class="beat-swarm-stage-component-name">${comp?.label || st.variant}</span>
          </button>
          <button type="button" class="beat-swarm-stage-remove" data-action="remove-stage" data-slot-index="${slotIndex}" data-stage-index="${stageIndex}">Remove</button>
        </div>
      `;
    }).join('');
    return `
      <section class="beat-swarm-weapon-card${getPreviewSelectedWeaponSlotIndex() === slotIndex ? ' is-preview-selected' : ''}" data-slot-index="${slotIndex}">
        <div class="beat-swarm-weapon-head-wrap">
          <header class="beat-swarm-weapon-head">${slot.name}</header>
          <button type="button" class="beat-swarm-stage-add" data-action="open-weapon-tune" data-slot-index="${slotIndex}">Weapon Rhythm</button>
          <button type="button" class="beat-swarm-stage-add beat-swarm-random-weapon" data-action="random-weapon" data-slot-index="${slotIndex}">Create Random Weapon</button>
        </div>
        <div class="beat-swarm-weapon-tune-summary">Tune: ${tuneActiveCount}/${tuneTotalCount} active notes | Damage x${tuneDmgScale.toFixed(2)}</div>
        <div class="beat-swarm-weapon-stages">
          ${stageCells}
        </div>
      </section>
    `;
  }).join('');
  const selectedSlot = getPreviewSelectedWeaponSlotIndex();
  const previewStatus = Number.isInteger(selectedSlot)
    ? `Previewing ${weaponLoadout[selectedSlot]?.name || 'Weapon'}`
    : 'Previewing all weapons';
  const pickerSlot = Math.max(0, Math.min(weaponLoadout.length - 1, Math.trunc(Number(stagePickerState.slotIndex) || 0)));
  const pickerStage = Math.max(0, Math.min(maxWeaponStages - 1, Math.trunc(Number(stagePickerState.stageIndex) || 0)));
  const pickerOpen = !!stagePickerState.open;
  const pickerSlotStages = weaponLoadout[pickerSlot]?.stages || [];
  const prevStage = pickerStage > 0 ? pickerSlotStages[pickerStage - 1] : null;
  const blockedHelperVariant = (prevStage?.archetype === 'helper')
    ? String(prevStage.variant || '')
    : '';
  const pickerItems = Object.values(weaponArchetypes).map((archetypeDef) => {
    const comps = weaponComponents.filter((c) => c.archetype === archetypeDef.id);
    const compButtons = comps.map((c) => {
      const sameHelperBlocked = (
        archetypeDef.id === 'helper'
        && blockedHelperVariant
        && String(c.variant || '') === blockedHelperVariant
      );
      return `
      <button
        type="button"
        class="beat-swarm-component-option"
        data-action="assign-component"
        data-slot-index="${pickerSlot}"
        data-stage-index="${pickerStage}"
        data-component-id="${c.id}"
        ${sameHelperBlocked ? 'disabled' : ''}
      >
        ${renderComponentPreviewMarkup(c)}
        <span class="beat-swarm-component-option-name">${c.label}</span>
        ${sameHelperBlocked ? '<span class="beat-swarm-stage-component-detail">Cannot follow same helper</span>' : ''}
      </button>
    `;
    }).join('');
    return `
      <section class="beat-swarm-component-group">
        <div class="beat-swarm-component-group-head">${archetypeDef.label}</div>
        <div class="beat-swarm-component-picker-grid">${compButtons}</div>
      </section>
    `;
  }).join('');
  pauseScreenEl.innerHTML = `
    <div class="beat-swarm-pause-title">Weapon Customisation</div>
    <div class="beat-swarm-pause-subtitle">Up to 3 weapons, each with up to 5 beat stages.</div>
    <div class="beat-swarm-pause-layout">
      <div class="beat-swarm-weapon-grid">${cards}</div>
      <aside class="beat-swarm-preview-panel">
        <div class="beat-swarm-preview-title">Live Preview</div>
        <div class="beat-swarm-preview-status">${previewStatus}</div>
        <div class="beat-swarm-preview-scene" aria-hidden="true"></div>
      </aside>
    </div>
    ${pickerOpen ? `
      <div class="beat-swarm-component-picker-backdrop" data-action="close-component-picker">
        <div class="beat-swarm-component-picker" role="dialog" aria-modal="true" aria-label="Weapon Components">
          <div class="beat-swarm-component-picker-head">
            <div class="beat-swarm-component-picker-title">Choose Component</div>
            <div class="beat-swarm-component-picker-actions">
              <button type="button" class="beat-swarm-stage-remove" data-action="close-component-picker" data-slot-index="${pickerSlot}">Close</button>
              <button type="button" class="beat-swarm-component-picker-close" aria-label="Close component picker" title="Close" data-action="close-component-picker">x</button>
            </div>
          </div>
          <div class="beat-swarm-component-picker-groups">${pickerItems}</div>
        </div>
      </div>
    ` : ''}
  `;
  pauseScreenEl.classList.toggle('has-component-picker', pickerOpen);
  const pausePreviewSceneEl = pauseScreenEl.querySelector('.beat-swarm-preview-scene');
  const pausePreviewStatusEl = pauseScreenEl.querySelector('.beat-swarm-preview-status');
  resetPausePreviewState();
  initComponentLivePreviews();
  syncTuneEditorPlayheadUi();
  return { pausePreviewSceneEl, pausePreviewStatusEl };
}
