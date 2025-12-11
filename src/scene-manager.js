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
            <input class="scene-manager-import-input" type="file" accept=".json,.mt,.mtjson,application/json" style="display:none" />
            <button class="scene-manager-footer-btn" type="button" data-scene-manager-action="import">Import from file</button>
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
    const importBtn = overlayEl.querySelector('[data-scene-manager-action="import"]');
    const importInput = overlayEl.querySelector('.scene-manager-import-input');

    if (closeBtn) closeBtn.addEventListener('click', closeSceneManager);
    if (closeFooterBtn) closeFooterBtn.addEventListener('click', closeSceneManager);

    if (importBtn && importInput) {
      importBtn.addEventListener('click', () => {
        importInput.value = '';
        importInput.click();
      });
      importInput.addEventListener('change', (evt) => {
        const file = evt.target.files && evt.target.files[0];
        if (file) {
          handleImportFile(file);
        }
      });
    }

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

    // Thumbnail area
    const thumbWrapper = document.createElement('div');
    thumbWrapper.className = 'scene-slot-thumb';

    if (!isEmpty && pkg && pkg.thumbnail) {
      const img = document.createElement('img');
      img.src = pkg.thumbnail;
      img.alt = displayName || `Save ${index + 1}`;
      thumbWrapper.appendChild(img);
    } else {
      const ph = document.createElement('div');
      ph.className = 'scene-slot-thumb-placeholder';
      ph.textContent = isEmpty ? '+' : '…';
      thumbWrapper.appendChild(ph);
    }

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

      // Export button
      const exportBtn = document.createElement('button');
      exportBtn.type = 'button';
      exportBtn.className = 'scene-slot-btn';
      exportBtn.textContent = 'Export';
      exportBtn.addEventListener('click', () => handleExportSlot(slotId));
      buttons.appendChild(exportBtn);

      // Delete button
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'scene-slot-btn';
      delBtn.textContent = 'Delete';
      delBtn.addEventListener('click', () => handleDeleteSlot(slotId));
      buttons.appendChild(delBtn);
    }

    li.appendChild(thumbWrapper);
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

  function canCaptureThumbnail() {
    const hasWindow = typeof window !== 'undefined';
    const fnType = hasWindow ? typeof window.html2canvas : 'n/a';
    const ok = hasWindow && fnType === 'function';

    if (!ok) {
      console.warn('[SceneManager] html2canvas not available; thumbnails disabled', {
        hasWindow,
        html2canvasType: fnType
      });
    }
    return ok;
  }

  function captureThumbnailForSlot(slotId) {
    const P = getPersistence();
    if (!P) return;

    if (!canCaptureThumbnail()) {
      return;
    }

    const target = document.querySelector('.board-viewport');
    if (!target) {
      console.warn('[SceneManager] no .board-viewport found for thumbnail capture');
      return;
    }

    const opts = {
      scale: 0.25,
      backgroundColor: '#000000',
      // IMPORTANT: sanitize in the cloned DOM, not the live DOM
      onclone: (doc) => {
        try {
          const cloneTarget = doc.querySelector('.board-viewport');
          if (!cloneTarget) {
            console.warn('[SceneManager] onclone: no .board-viewport in clone');
            return;
          }

          const propsToCheck = [
            'background',
            'background-image',
            'background-color',
            'color',
            'box-shadow',
            'border',
            'border-color',
            'border-top-color',
            'border-right-color',
            'border-bottom-color',
            'border-left-color',
            'outline-color',
            'text-shadow'
          ];

          const win = doc.defaultView || window;

          function sanitizeEl(el) {
            const cs = win.getComputedStyle(el);
            let touched = false;

            for (const prop of propsToCheck) {
              const val = cs.getPropertyValue(prop);
              if (val && val.includes('color(')) {
                touched = true;
                // Apply a safe inline override on the CLONE
                if (prop.startsWith('background')) {
                  el.style.setProperty('background-image', 'none', 'important');
                  el.style.setProperty('background-color', 'transparent', 'important');
                } else if (prop === 'color' || prop.endsWith('-color')) {
                  el.style.setProperty(prop, '#ffffff', 'important');
                } else if (prop === 'box-shadow' || prop === 'text-shadow') {
                  el.style.setProperty(prop, 'none', 'important');
                }
              }
            }

            return touched;
          }

          let patchedCount = 0;
          // Sanitize the viewport and all its descendants in the clone
          if (sanitizeEl(cloneTarget)) patchedCount++;
          cloneTarget.querySelectorAll('*').forEach((el) => {
            if (sanitizeEl(el)) patchedCount++;
          });

          if (patchedCount) {
            console.log('[SceneManager] onclone sanitizer patched elements', patchedCount);
          }
        } catch (err) {
          console.warn('[SceneManager] onclone sanitizer failed', err);
        }
      }
    };

    console.log('[SceneManager] capturing thumbnail for slot', slotId, { target });

    window.html2canvas(target, opts)
      .then((canvas) => {
        try {
          const dataUrl = canvas.toDataURL('image/png');
          const pkg = P.getScenePackageFromSlot
            ? P.getScenePackageFromSlot(slotId)
            : null;

          if (!pkg) {
            console.warn('[SceneManager] capture ok but no pkg for slot', slotId);
            return;
          }

          pkg.thumbnail = dataUrl;
          P.saveScenePackageToSlot(slotId, pkg);
          console.log('[SceneManager] thumbnail saved for slot', slotId);
          renderSlots();
        } catch (err) {
          console.warn('[SceneManager] failed to save thumbnail', err);
        }
      })
      .catch((err) => {
        console.warn('[SceneManager] html2canvas capture failed', err);
      });
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

    // Basic package (no thumbnail yet, or keep existing thumbnail)
    const existingThumb = existingMeta?.package?.thumbnail || null;
    const pkg = {
      displayName: defaultName,
      payload: snap,
      thumbnail: existingThumb
    };

    // Save immediately so data is safe
    P.saveScenePackageToSlot(slotId, pkg);
    renderSlots();

    // Then try to capture a fresh thumbnail in the background
    captureThumbnailForSlot(slotId);
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

  function handleExportSlot(slotId) {
    const P = getPersistence();
    if (!P || !P.getScenePackageFromSlot) return;
    const pkg = P.getScenePackageFromSlot(slotId);
    if (!pkg) {
      window.alert('No scene in this slot to export.');
      return;
    }

    const data = JSON.stringify(pkg, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const baseName = (pkg.displayName || slotId || 'scene')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'scene';

    const a = document.createElement('a');
    a.href = url;
    a.download = `musictoy-${baseName}.mt.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 0);
  }

  function handleImportFile(file) {
    const P = getPersistence();
    if (!P) return;
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const text = String(evt.target?.result || '');
        const raw = JSON.parse(text);

        let pkg = null;

        // Prefer Persistence.isScenePackage if available
        const isPkg = typeof P.isScenePackage === 'function'
          ? P.isScenePackage(raw)
          : (raw && raw.type === 'music-toys-scene' && raw.payload);

        if (isPkg) {
          pkg = raw;
        } else {
          // Treat as bare snapshot or legacy export; wrap into a package if possible
          const snapshot = (raw && raw.payload && typeof raw.payload === 'object')
            ? raw.payload
            : raw;
          const displayName =
            (snapshot && snapshot.displayName) ||
            (typeof file.name === 'string' ? file.name.replace(/\.[^.]+$/, '') : 'Imported scene');

          if (typeof P.wrapSnapshotAsPackage === 'function') {
            pkg = P.wrapSnapshotAsPackage(snapshot, { displayName });
          } else {
            pkg = { displayName, payload: snapshot };
          }
        }

        const slots = (P.listSceneSlots && P.listSceneSlots()) || [];
        let target = slots.find(s => s.isEmpty);
        if (!target) {
          window.alert('No empty save slots. Please delete a save before importing.');
          return;
        }

        P.saveScenePackageToSlot(target.slotId, pkg);
        renderSlots();
        window.alert(`Imported scene into ${target.displayName || target.slotId}.`);
      } catch (err) {
        console.warn('[SceneManager] import failed', err);
        window.alert('Could not import this file. Is it a valid scene export?');
      }
    };
    reader.readAsText(file);
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
