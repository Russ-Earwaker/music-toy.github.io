// src/art/base-art-toy.js
// Shared base for Art Toys.
// This file owns the common container behaviors:
// - top-left drag button (tap to reveal controls)
// - drag by drag button (pointer capture)
// - outside click hides controls

export function createBaseArtToyPanel({
  kind,
  size = 220,
  left = 0,
  top = 0,
  idPrefix = 'art',
} = {}) {
  const panel = document.createElement('section');
  panel.className = 'art-toy-panel';
  panel.dataset.artToy = String(kind || '');
  panel.dataset.controlsVisible = '0';

  const idSuffix = Math.random().toString(36).slice(2, 8);
  panel.id = `${idPrefix}-${String(kind || 'unknown')}-${Date.now()}-${idSuffix}`;

  panel.style.position = 'absolute';
  panel.style.left = `${left}px`;
  panel.style.top = `${top}px`;
  panel.style.width = `${size}px`;
  panel.style.height = `${size}px`;

  // Ensure the toy sits above board anchors/glows that may live in the same world.
  // (UI overlays like the spawner/topbar are separate layers, so this is safe.)
  panel.style.zIndex = '70';

  return panel;
}

function getViewportScaleForPanel(panel) {
  // Board zoom is stored on the active ".board-viewport" via CSS var --bv-scale.
  // We only need scale for converting pointer deltas into world-space deltas.
  const vp = panel.closest('.board-viewport') || document.querySelector('.board-viewport');
  if (!vp) return 1;
  const raw = getComputedStyle(vp).getPropertyValue('--bv-scale');
  const s = Number.parseFloat(String(raw || '').trim());
  return Number.isFinite(s) && s > 0 ? s : 1;
}

let g_openControlsPanel = null;

function setDragButtonActive(panel, active) {
  const dragButton = panel?.querySelector?.('.art-toy-drag-btn');
  if (!dragButton) return;
  dragButton.classList.toggle('is-active', !!active);
  dragButton.setAttribute('aria-pressed', active ? 'true' : 'false');
}

function hideControls(panel) {
  if (!panel) return;
  const controlsHost = panel.querySelector('.art-toy-controls');
  const volumeHost = panel.querySelector('.art-toy-volume');
  if (controlsHost) controlsHost.style.display = 'none';
  if (volumeHost) volumeHost.style.display = 'none';
  panel.dataset.controlsVisible = '0';
  setDragButtonActive(panel, false);
  if (g_openControlsPanel === panel) g_openControlsPanel = null;
}

function showControls(panel) {
  if (!panel) return;
  if (g_openControlsPanel && g_openControlsPanel !== panel) hideControls(g_openControlsPanel);
  const controlsHost = panel.querySelector('.art-toy-controls');
  const volumeHost = panel.querySelector('.art-toy-volume');
  if (controlsHost) controlsHost.style.display = '';
  if (volumeHost) volumeHost.style.display = '';
  panel.dataset.controlsVisible = '1';
  setDragButtonActive(panel, true);
  g_openControlsPanel = panel;
}

export function setBaseArtToyControlsVisible(panel, visible) {
  if (!panel) return;
  if (visible) showControls(panel);
  else hideControls(panel);
}

export function ensureBaseArtToyUI(panel, { artToyId } = {}) {
  if (!panel) return null;
  if (panel.querySelector('.art-toy-drag-btn')) return panel;

  const dragButton = document.createElement('button');
  dragButton.type = 'button';
  dragButton.className = 'art-toy-drag-btn c-btn';
  dragButton.setAttribute('aria-label', 'Drag art toy');
  dragButton.title = 'Drag / Show Controls';
  dragButton.setAttribute('aria-pressed', 'false');
  dragButton.innerHTML = '<div class="c-btn-outer"></div><div class="c-btn-glow"></div><div class="c-btn-core"></div>';
  const dragCore = dragButton.querySelector('.c-btn-core');
  if (dragCore) dragCore.style.setProperty('--c-btn-icon-url', "url('./assets/UI/T_ButtonDrag.png')");
  panel.appendChild(dragButton);

  const controls = document.createElement('div');
  controls.className = 'art-toy-controls';
  controls.style.display = 'none';
  panel.appendChild(controls);

  const volume = document.createElement('div');
  volume.className = 'art-toy-volume';
  volume.style.display = 'none';
  panel.appendChild(volume);

  // Store the "public" id used by internal-board entry handlers.
  if (artToyId) panel.dataset.artToyId = String(artToyId);

  // Tap drag button to toggle controls.
  const toggleControls = (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    const isVisible = panel.dataset.controlsVisible === '1';
    if (isVisible) hideControls(panel);
    else showControls(panel);
  };

  dragButton.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' || ev.key === ' ') toggleControls(ev);
  });

  // Hide controls when clicking elsewhere.
  const onDocDown = (ev) => {
    if (!g_openControlsPanel) return;
    if (!g_openControlsPanel.contains(ev.target)) hideControls(g_openControlsPanel);
  };
  // Only attach once per page.
  if (!window.__MT_ART_TOY_OUTSIDE_CLICK_INSTALLED) {
    window.__MT_ART_TOY_OUTSIDE_CLICK_INSTALLED = true;
    document.addEventListener('pointerdown', onDocDown, { capture: true });
  }

  // Drag by drag button (pointer capture).
  let dragActive = false;
  let dragPid = null;
  let startClientX = 0;
  let startClientY = 0;
  let startLeft = 0;
  let startTop = 0;
  let moved = false;
  const TAP_SLOP_PX = 6;

  dragButton.addEventListener('pointerdown', (ev) => {
    // Primary button / touch only.
    if (ev.button != null && ev.button !== 0) return;
    ev.preventDefault();
    ev.stopPropagation();

    dragActive = true;
    dragPid = ev.pointerId;
    startClientX = ev.clientX;
    startClientY = ev.clientY;
    startLeft = Number.parseFloat(panel.style.left || '0') || 0;
    startTop = Number.parseFloat(panel.style.top || '0') || 0;
    moved = false;

    try {
      dragButton.setPointerCapture(ev.pointerId);
    } catch (err) {
      // ignore
    }
  });

  dragButton.addEventListener('pointermove', (ev) => {
    if (!dragActive) return;
    if (dragPid != null && ev.pointerId !== dragPid) return;
    ev.preventDefault();
    ev.stopPropagation();

    const scale = getViewportScaleForPanel(panel);
    const rawDx = (ev.clientX - startClientX);
    const rawDy = (ev.clientY - startClientY);

    // Tap vs drag: do not move the toy until the pointer has moved a bit.
    if (!moved) {
      if (Math.abs(rawDx) < TAP_SLOP_PX && Math.abs(rawDy) < TAP_SLOP_PX) return;
      moved = true;
    }

    const dx = rawDx / scale;
    const dy = rawDy / scale;

    panel.style.left = `${startLeft + dx}px`;
    panel.style.top = `${startTop + dy}px`;
  });

  const endDrag = (ev) => {
    if (!dragActive) return;
    if (dragPid != null && ev.pointerId !== dragPid) return;

    // If the user tapped (no movement), toggle controls.
    // If the user dragged, do NOT change the current controls visibility.
    if (!moved) {
      toggleControls(ev);
    }

    dragActive = false;
    dragPid = null;
    try {
      dragButton.releasePointerCapture(ev.pointerId);
    } catch (err) {
      // ignore
    }
  };
  dragButton.addEventListener('pointerup', endDrag);
  dragButton.addEventListener('pointercancel', endDrag);

  return panel;
}

export function getBaseArtToyControlsHost(panel) {
  return panel?.querySelector?.('.art-toy-controls') || null;
}

export function getBaseArtToyVolumeHost(panel) {
  return panel?.querySelector?.('.art-toy-volume') || null;
}
