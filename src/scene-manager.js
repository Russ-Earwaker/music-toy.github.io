// src/scene-manager.js
// Scene Manager overlay for save/load/delete using Persistence slots.

(function () {
  const MODAL_ID = 'scene-manager-overlay';

  let overlayEl = null;
  let panelEl = null;
  let listEl = null;
  let modeLabelEl = null;
  let currentMode = 'manage'; // 'save' | 'load' | 'manage'

  function getPersistence() {
    const P = window.Persistence || {};
    if (!P.listSceneSlots || !P.getSnapshot) {
      console.warn('[SceneManager] Persistence API is not ready');
    }
    return P;
  }

  function ensureOverlay() {
    if (overlayEl && panelEl && listEl && modeLabelEl) {
      return { overlayEl, panelEl, listEl, modeLabelEl };
    }

    overlayEl = document.getElementById(MODAL_ID);
    if (!overlayEl) {
      overlayEl = document.createElement('div');
      overlayEl.id = MODAL_ID;
      overlayEl.className = 'scene-manager-overlay';
      overlayEl.style.display = 'none';

      overlayEl.innerHTML = `
        <div class="scene-manager-panel">
          <div class="scene-manager-header">
            <div class="scene-manager-title">
              <span>Scenes</span>
              <span class="scene-manager-mode-label"></span>
            </div>
            <button class="scene-manager-close" type="button" aria-label="Close">&times;</button>
          </div>
          <div class="scene-manager-body">
            <ul class="scene-slot-list"></ul>
          </div>
          <div class="scene-manager-footer">
            <button class="scene-manager-footer-btn" type="button" data-scene-manager-action="close">Close</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlayEl);
    }

    panelEl = overlayEl.querySelector('.scene-manager-panel');
    listEl = overlayEl.querySelector('.scene-slot-list');
    modeLabelEl = overlayEl.querySelector('.scene-manager-mode-label');

    // Close on X or footer Close
    const closeBtn = overlayEl.querySelector('.scene-manager-close');
    const closeFooterBtn = overlayEl.querySelector('[data-scene-manager-action="close"]');
    if (closeBtn) closeBtn.addEventListener('click', closeSceneManager);
    if (closeFooterBtn) closeFooterBtn.addEventListener('click', closeSceneManager);

    // Close when clicking backdrop (but not panel)
    overlayEl.addEventListener('click', (evt) => {
      if (evt.target === overlayEl) {
        closeSceneManager();
      }
    });

    return { overlayEl, panelEl, listEl, modeLabelEl };
  }

  function setModeLabel(mode) {
    if (!modeLabelEl) return;
    let label = '';
    if (mode === 'save') label = '· Save to slot';
    else if (mode === 'load') label = '· Load scene';
    else label = '';
    modeLabelEl.textContent = label;
  }

  function renderSlots() {
    const P = getPersistence();
    if (!P.listSceneSlots || !listEl) return;

    const slots = P.listSceneSlots();
    listEl.textContent = '';

    slots.forEach((meta) => {
      const li = createSlotRow(meta);
      listEl.appendChild(li);
    });
  }

  function createSlotRow(meta) {
    const { slotId, index, isEmpty, displayName, package: pkg } = meta;
    const li = document.createElement('li');
    li.className = 'scene-slot' + (isEmpty ? ' empty' : '');
    li.dataset.slotId = slotId;

    const main = document.createElement('div');
    main.className = 'scene-slot-main';

    const nameEl = document.createElement('div');
    nameEl.className = 'scene-slot-name';
    nameEl.textContent = displayName || `Save ${index + 1}`;
    nameEl.title = 'Click to rename';
    nameEl.addEventListener('click', () => beginRenameSlot(slotId, nameEl));

    const metaEl = document.createElement('div');
    metaEl.className = 'scene-slot-meta';
    if (pkg && (pkg.updatedAt || pkg.createdAt)) {
      const updated = pkg.updatedAt || pkg.createdAt;
      metaEl.textContent = `Slot ${index + 1} · Updated ${formatTimestamp(updated)}`;
    } else {
      metaEl.textContent = `Slot ${index + 1} · Empty`;
    }

    main.appendChild(nameEl);
    main.appendChild(metaEl);

    const buttons = document.createElement('div');
    buttons.className = 'scene-slot-buttons';

    // Save button (always present)
    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'scene-slot-btn primary';
    saveBtn.textContent = isEmpty ? 'Save' : 'Overwrite';
    saveBtn.addEventListener('click', () => handleSaveToSlot(slotId, index));
    buttons.appendChild(saveBtn);

    if (!isEmpty) {
      // Load button
      const loadBtn = document.createElement('button');
      loadBtn.type = 'button';
      loadBtn.className = 'scene-slot-btn';
      loadBtn.textContent = 'Load';
      loadBtn.addEventListener('click', () => handleLoadSlot(slotId));
      buttons.appendChild(loadBtn);

      // Delete button
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'scene-slot-btn';
      delBtn.textContent = 'Delete';
      delBtn.addEventListener('click', () => handleDeleteSlot(slotId));
      buttons.appendChild(delBtn);
    }

    li.appendChild(main);
    li.appendChild(buttons);
    return li;
  }

  function formatTimestamp(iso) {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return iso;
      return d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return iso;
    }
  }

  function beginRenameSlot(slotId, nameEl) {
    const currentText = nameEl.textContent || '';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'scene-slot-name-input';
    input.value = currentText;
    nameEl.replaceWith(input);
    input.focus();
    input.select();

    let finished = false;

    const commit = () => {
      if (finished) return;
      finished = true;
      const newName = input.value.trim() || currentText;
      updateSlotName(slotId, newName);

      const newNameEl = document.createElement('div');
      newNameEl.className = 'scene-slot-name';
      newNameEl.textContent = newName;
      newNameEl.title = 'Click to rename';
      newNameEl.addEventListener('click', () => beginRenameSlot(slotId, newNameEl));
      input.replaceWith(newNameEl);
    };

    const cancel = () => {
      if (finished) return;
      finished = true;
      const newNameEl = document.createElement('div');
      newNameEl.className = 'scene-slot-name';
      newNameEl.textContent = currentText;
      newNameEl.title = 'Click to rename';
      newNameEl.addEventListener('click', () => beginRenameSlot(slotId, newNameEl));
      input.replaceWith(newNameEl);
    };

    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (evt) => {
      if (evt.key === 'Enter') {
        evt.preventDefault();
        commit();
      } else if (evt.key === 'Escape') {
        evt.preventDefault();
        cancel();
      }
    });
  }

  function updateSlotName(slotId, newName) {
    const P = getPersistence();
    if (!P.getScenePackageFromSlot || !P.saveScenePackageToSlot) return;
    const pkg = P.getScenePackageFromSlot(slotId);
    if (!pkg) return;
    pkg.displayName = newName;
    P.saveScenePackageToSlot(slotId, pkg);
    // No full re-render to keep it simple; caller already updates visible text.
  }

  function handleSaveToSlot(slotId, index) {
    const P = getPersistence();
    if (!P.getSnapshot || !P.saveScenePackageToSlot) return;

    const snap = P.getSnapshot();
    const slots = (P.listSceneSlots && P.listSceneSlots()) || [];
    const existingMeta = slots.find(s => s.slotId === slotId);
    const defaultName = existingMeta?.displayName || `Save ${index + 1}`;

    // Optional confirm on overwrite when in load/manage mode
    if (existingMeta && !existingMeta.isEmpty && currentMode !== 'save') {
      const ok = window.confirm('Overwrite this save slot?');
      if (!ok) return;
    }

    const pkg = {
      displayName: defaultName,
      payload: snap
    };

    P.saveScenePackageToSlot(slotId, pkg);
    renderSlots();
  }

  function handleLoadSlot(slotId) {
    const P = getPersistence();
    if (!P.loadSceneFromSlot) return;
    const ok = P.loadSceneFromSlot(slotId);
    if (ok) {
      closeSceneManager();
    } else {
      window.alert('Could not load this scene.');
    }
  }

  function handleDeleteSlot(slotId) {
    const P = getPersistence();
    if (!P.deleteSceneSlot) return;
    const ok = window.confirm('Delete this save? This cannot be undone.');
    if (!ok) return;
    P.deleteSceneSlot(slotId);
    renderSlots();
  }

  function openSceneManager(opts) {
    const { overlayEl: ov } = ensureOverlay();
    currentMode = (opts && opts.mode) || 'manage';
    setModeLabel(currentMode);
    renderSlots();
    if (ov) {
      ov.style.display = 'flex';
    }
  }

  function closeSceneManager() {
    if (overlayEl) {
      overlayEl.style.display = 'none';
    }
  }

  // Expose globally for menu wiring
  if (typeof window !== 'undefined') {
    window.SceneManager = {
      open: openSceneManager,
      close: closeSceneManager
    };
  }
})();
