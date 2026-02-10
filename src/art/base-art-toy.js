// src/art/base-art-toy.js
// Shared base for Art Toys.
// This file owns the common container behaviors:
// - handle/header area (tap to reveal controls)
// - drag by handle (pointer capture)
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

function hideControls(panel) {
  if (!panel) return;
  const host = panel.querySelector('.art-toy-controls');
  if (host) host.style.display = 'none';
  panel.dataset.controlsVisible = '0';
  if (g_openControlsPanel === panel) g_openControlsPanel = null;
}

function showControls(panel) {
  if (!panel) return;
  if (g_openControlsPanel && g_openControlsPanel !== panel) hideControls(g_openControlsPanel);
  const host = panel.querySelector('.art-toy-controls');
  if (host) host.style.display = '';
  panel.dataset.controlsVisible = '1';
  g_openControlsPanel = panel;
}

export function ensureBaseArtToyUI(panel, { artToyId } = {}) {
  if (!panel) return null;
  if (panel.querySelector('.art-toy-handle')) return panel;

  const handle = document.createElement('div');
  handle.className = 'art-toy-handle';
  handle.setAttribute('role', 'button');
  handle.setAttribute('aria-label', 'Art toy handle');
  handle.tabIndex = 0;
  // Above any glow/anchor visuals *inside* the panel.
  handle.style.zIndex = '3';
  panel.appendChild(handle);

  const controls = document.createElement('div');
  controls.className = 'art-toy-controls';
  controls.style.display = 'none';
  panel.appendChild(controls);

  // Store the "public" id used by internal-board entry handlers.
  if (artToyId) panel.dataset.artToyId = String(artToyId);

  // Tap handle to toggle controls.
  const toggleControls = (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    const isVisible = panel.dataset.controlsVisible === '1';
    if (isVisible) hideControls(panel);
    else showControls(panel);
  };

  handle.addEventListener('keydown', (ev) => {
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

  // Drag by handle (pointer capture).
  let dragActive = false;
  let dragPid = null;
  let startClientX = 0;
  let startClientY = 0;
  let startLeft = 0;
  let startTop = 0;
  let moved = false;
  const TAP_SLOP_PX = 6;

  handle.addEventListener('pointerdown', (ev) => {
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
      handle.setPointerCapture(ev.pointerId);
    } catch (err) {
      // ignore
    }
  });

  handle.addEventListener('pointermove', (ev) => {
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
      handle.releasePointerCapture(ev.pointerId);
    } catch (err) {
      // ignore
    }
  };
  handle.addEventListener('pointerup', endDrag);
  handle.addEventListener('pointercancel', endDrag);

  return panel;
}

export function getBaseArtToyControlsHost(panel) {
  return panel?.querySelector?.('.art-toy-controls') || null;
}
