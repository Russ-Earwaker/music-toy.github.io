// src/toy-spawner.js
// Provides the "Create Toy" palette dock and drag-to-spawn affordance.
import { screenToWorld } from './board-viewport.js';

import { toggleHelp, isHelpActive } from './help-overlay.js';
import { overviewMode } from './overview-mode.js';

const state = {
  dock: null,
  toggle: null,
  artToggle: null,
  gameToggle: null,
  menu: null,
  listHost: null,
  trash: null,
  helpButton: null,
  helpActive: false,
  activePalette: 'music',
  configMusic: {
    getCatalog: () => [],
    create: () => null,
    remove: () => false,
  },
  configArt: {
    getCatalog: () => [],
    create: () => null,
    remove: () => false,
  },
  configGame: {
    getCatalog: () => [],
    create: () => null,
    remove: () => false,
  },
  // Back-compat: many call sites assume a single active config.
  // We keep `config` as a pointer to the currently active palette config.
  config: null,
  overviewButton: null,
  overviewActive: false,
  drag: null,
  open: false,
  justSpawned: false,
  panelDrag: null,
  trashFeedbackTimer: null,
  trashHelpTimer: null,
  trashHint: null,
};

const BUTTON_ICON_HTML = '<div class="c-btn-outer"></div><div class="c-btn-glow"></div><div class="c-btn-core"></div>';
const OVERVIEW_ICON_OUT = "url('./assets/UI/T_ButtonOverviewZoomOut.png')";
const OVERVIEW_ICON_IN = "url('./assets/UI/T_ButtonOverviewZoomIn.png')";
const FOCUS_CLOSE_ICON = "url('./assets/UI/T_ButtonClose.png')";
const ART_MENU_ICON = "url('./assets/UI/T_ButtonArtMenu.png')";
const GAME_MENU_ICON = "url('./assets/UI/T_ButtonGameMenu.png')";

function dbg(...args) {
  try {
    if (!window.__MT_DEBUG_TOY_SPAWNER) return;
    // eslint-disable-next-line no-console
    console.log('[ToySpawner]', ...args);
  } catch (err) {
    // ignore
  }
}

function updateHelpToggleUI(nextState) {
  if (typeof nextState === 'boolean') {
    state.helpActive = nextState;
  }
  const active = !!state.helpActive;
  if (!state.helpButton) return;
  state.helpButton.setAttribute('aria-pressed', active ? 'true' : 'false');
  state.helpButton.classList.toggle('is-active', active);
}

function updateOverviewToggleUI(nextState) {
  if (typeof nextState === 'boolean') {
    state.overviewActive = nextState;
  }
  const active = !!state.overviewActive;
  const button = state.overviewButton;
  if (!button) return;
  button.setAttribute('aria-pressed', active ? 'true' : 'false');
  button.classList.toggle('is-active', active);
  const core = button.querySelector('.c-btn-core');
  if (core) {
    core.style.setProperty('--c-btn-icon-url', active ? OVERVIEW_ICON_IN : OVERVIEW_ICON_OUT);
  }
}

function updatePaletteToggleUI() {
  const isArt = state.activePalette === 'art';
  const isGame = state.activePalette === 'game';
  const isMusic = !isArt && !isGame;
  if (state.toggle) {
    state.toggle.classList.toggle('is-active', isMusic && state.open);
    state.toggle.setAttribute('aria-pressed', (isMusic && state.open) ? 'true' : 'false');
  }
  if (state.artToggle) {
    state.artToggle.classList.toggle('is-active', isArt && state.open);
    state.artToggle.setAttribute('aria-pressed', (isArt && state.open) ? 'true' : 'false');
  }
  if (state.gameToggle) {
    state.gameToggle.classList.toggle('is-active', isGame && state.open);
    state.gameToggle.setAttribute('aria-pressed', (isGame && state.open) ? 'true' : 'false');
  }
}

function setActivePalette(palette) {
  const next = palette === 'art'
    ? 'art'
    : (palette === 'game' ? 'game' : 'music');
  if (state.activePalette === next && state.config) return;
  state.activePalette = next;
  state.config = next === 'art'
    ? state.configArt
    : (next === 'game' ? state.configGame : state.configMusic);
  dbg('setActivePalette', next, { open: state.open });
  if (state.open) renderCatalog();
  updatePaletteToggleUI();
}

window.addEventListener('focus:change', (event) => {
  const hasFocus = event.detail.hasFocus;
  const button = state.overviewButton;
  if (button) {
    const core = button.querySelector('.c-btn-core');
    if (core) {
      if (hasFocus) {
        core.style.setProperty('--c-btn-icon-url', FOCUS_CLOSE_ICON);
        button.title = 'Close Focus';
        // Add this line to change background to red
        button.style.setProperty('--c-btn-bg', 'rgba(255, 0, 0, 0.9)');
      } else {
        const active = !!state.overviewActive;
        core.style.setProperty('--c-btn-icon-url', active ? OVERVIEW_ICON_IN : OVERVIEW_ICON_OUT);
        button.title = 'Overview';
        // Add this line to change background back to purple
        button.style.setProperty('--c-btn-bg', 'rgba(96, 82, 176, 0.9)'); // Original purple color
      }
    }
  }

  const toggleButton = state.toggle;
  if (toggleButton) {
    toggleButton.disabled = hasFocus;
    toggleButton.style.display = hasFocus ? 'none' : '';
  }
});

window.addEventListener('overview:change', (event) => {
  const active = typeof event?.detail?.active === 'boolean'
    ? event.detail.active
    : overviewMode?.isActive?.();
  updateOverviewToggleUI(active);
});

function ensureDock() {
  if (state.dock) return;

  // Default active palette.
  if (!state.config) {
    state.config = state.configMusic;
    state.activePalette = 'music';
  }

  const dock = document.createElement('div');
  dock.className = 'toy-spawner-dock';

  const trash = document.createElement('button');
  trash.type = 'button';
  trash.className = 'toy-spawner-trash c-btn';
  trash.setAttribute('aria-label', 'Delete Toy');
  trash.title = 'Delete Toy';
  trash.dataset.helpLabel = 'Drag a toy here to delete it';
  trash.dataset.helpPosition = 'left';
  trash.innerHTML = BUTTON_ICON_HTML;
  const trashCore = trash.querySelector('.c-btn-core');
  if (trashCore) trashCore.style.setProperty('--c-btn-icon-url', "url('./assets/UI/T_ButtonTrash.png')");
  trash.style.setProperty('--c-btn-size', 'var(--toy-spawner-button-size)');

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'toy-spawner-toggle c-btn';
  toggle.setAttribute('aria-label', 'Create Toy');
  toggle.title = 'Create Toy';
  toggle.dataset.helpLabel = 'Open the Add Toy menu';
  toggle.dataset.helpPosition = 'left';
  toggle.innerHTML = BUTTON_ICON_HTML;
  const toggleCore = toggle.querySelector('.c-btn-core');
  if (toggleCore) toggleCore.style.setProperty('--c-btn-icon-url', "url('./assets/UI/T_ButtonAddMusic.png')");
  toggle.style.setProperty('--c-btn-size', 'var(--toy-spawner-button-size)');
  toggle.style.setProperty('--c-btn-bg', 'rgba(47, 102, 179, 0.85)');

  const artToggle = document.createElement('button');
  artToggle.type = 'button';
  artToggle.className = 'toy-spawner-art c-btn';
  artToggle.setAttribute('aria-label', 'Create Art');
  artToggle.title = 'Create Art';
  artToggle.dataset.helpLabel = 'Open the Add Art menu';
  artToggle.dataset.helpPosition = 'left';
  artToggle.innerHTML = BUTTON_ICON_HTML;
  const artCore = artToggle.querySelector('.c-btn-core');
  if (artCore) artCore.style.setProperty('--c-btn-icon-url', ART_MENU_ICON);
  artToggle.style.setProperty('--c-btn-size', 'var(--toy-spawner-button-size)');
  artToggle.style.setProperty('--c-btn-bg', 'rgba(176, 82, 144, 0.88)');

  const gameToggle = document.createElement('button');
  gameToggle.type = 'button';
  gameToggle.className = 'toy-spawner-game c-btn';
  gameToggle.setAttribute('aria-label', 'Game Menu');
  gameToggle.title = 'Game Menu';
  gameToggle.dataset.helpLabel = 'Open the Game menu';
  gameToggle.dataset.helpPosition = 'left';
  gameToggle.innerHTML = BUTTON_ICON_HTML;
  const gameCore = gameToggle.querySelector('.c-btn-core');
  if (gameCore) gameCore.style.setProperty('--c-btn-icon-url', GAME_MENU_ICON);
  gameToggle.style.setProperty('--c-btn-size', 'var(--toy-spawner-button-size)');
  gameToggle.style.setProperty('--c-btn-bg', 'rgba(72, 132, 77, 0.9)');

  const overview = document.createElement('button');
  overview.type = 'button';
  overview.id = 'overview-mode-button';
  overview.className = 'toy-spawner-overview c-btn';
  overview.setAttribute('aria-label', 'Toggle Overview');
  overview.title = 'Overview';
  overview.dataset.helpLabel = 'Toggle overview mode';
  overview.dataset.helpPosition = 'left';
  overview.innerHTML = BUTTON_ICON_HTML;
  const overviewCore = overview.querySelector('.c-btn-core');
  if (overviewCore) overviewCore.style.setProperty('--c-btn-icon-url', OVERVIEW_ICON_OUT);
  overview.style.setProperty('--c-btn-size', 'var(--toy-spawner-button-size)');
  overview.style.setProperty('--c-btn-bg', 'rgba(96, 82, 176, 0.9)');

  const help = document.createElement('button');
  help.type = 'button';
  help.className = 'toy-spawner-help c-btn';
  help.setAttribute('aria-label', 'Toggle Help');
  help.title = 'Help';
  help.dataset.helpLabel = 'Toggle help labels';
  help.dataset.helpPosition = 'left';
  help.innerHTML = BUTTON_ICON_HTML;
  const helpCore = help.querySelector('.c-btn-core');
  if (helpCore) helpCore.style.setProperty('--c-btn-icon-url', "url('./assets/UI/T_ButtonHelp.png')");
  help.style.setProperty('--c-btn-size', 'var(--toy-spawner-button-size)');
  help.style.setProperty('--c-btn-bg', 'rgba(43, 133, 140, 0.88)');

  const menu = document.createElement('div');
  menu.className = 'toy-spawner-menu';
  menu.setAttribute('role', 'menu');

  const list = document.createElement('div');
  list.className = 'toy-spawner-list';
  menu.appendChild(list);

  dock.append(trash, toggle, artToggle, gameToggle, overview, help, menu);
  document.body.appendChild(dock);

  state.dock = dock;
  state.toggle = toggle;
  state.artToggle = artToggle;
  state.gameToggle = gameToggle;
  state.menu = menu;
  state.listHost = list;
  state.trash = trash;
  state.helpButton = help;
  state.overviewButton = overview;
  updateHelpToggleUI(isHelpActive());
  updateOverviewToggleUI(overviewMode?.isActive?.());
  updatePaletteToggleUI();

  help.addEventListener('click', (event) => {
    event.preventDefault();
    const active = toggleHelp();
    updateHelpToggleUI(active);
  });

  window.addEventListener('help:toggle', (event) => {
    updateHelpToggleUI(!!event?.detail?.active);
  });

  toggle.addEventListener('click', () => {
    setActivePalette('music');
    setMenuOpen(!state.open);
  });

  artToggle.addEventListener('click', () => {
    setActivePalette('art');
    setMenuOpen(!state.open);
  });

  gameToggle.addEventListener('click', () => {
    setActivePalette('game');
    setMenuOpen(!state.open);
  });

  trash.addEventListener('click', (event) => {
    if (state.panelDrag) return;
    event.preventDefault();
    triggerTrashErrorFeedback();
    showTrashHint();
  });

  document.addEventListener(
    'pointerdown',
    (event) => {
      if (!state.open) return;
      if (state.dock?.contains(event.target)) return;
      if (state.drag) return;
      setMenuOpen(false);
    },
    true,
  );

  document.addEventListener(
    'keydown',
    (event) => {
      if (!state.open) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        setMenuOpen(false);
      }
    },
    true,
  );
}

function setMenuOpen(open) {
  ensureDock();
  state.open = !!open;
  state.menu?.classList.toggle('open', state.open);
  state.dock?.classList.toggle('open', state.open);
  if (state.open) {
    renderCatalog();
  } else {
    cancelDrag();
  }
  updatePaletteToggleUI();
}

function renderCatalog() {
  if (!state.listHost) return;
  const catalog = safeCatalog();
  dbg('renderCatalog', state.activePalette, { count: catalog.length });
  state.listHost.innerHTML = '';
  catalog.forEach((entry) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'toy-spawner-item';
    card.dataset.toyType = String(entry.type || '');

    const nameEl = document.createElement('div');
    nameEl.className = 'toy-spawner-name';
    nameEl.textContent = entry.name;

    const descEl = document.createElement('div');
    descEl.className = 'toy-spawner-description';
    descEl.textContent = entry.description || '';

    card.append(nameEl, descEl);

    const isDisabled = !!entry.disabled;
    const isActionOnly = typeof entry.action === 'function';
    if (isDisabled) {
      card.disabled = true;
      card.classList.add('is-disabled');
      card.setAttribute('aria-disabled', 'true');
      card.tabIndex = -1;
    } else {
      if (!isActionOnly) {
        card.addEventListener('pointerdown', (event) => startDrag(event, entry, card));
      }
      card.addEventListener('click', (event) => {
        if (state.justSpawned) {
          state.justSpawned = false;
          event.preventDefault();
          return;
        }
        event.preventDefault();
        const created = isActionOnly ? invokeEntryAction(entry) : spawnAtDefault(entry);
        state.justSpawned = false;
        if (created) setMenuOpen(false);
      });
    }
    state.listHost.appendChild(card);
  });
}

function safeCatalog() {
  try {
    const items = state.config.getCatalog?.() || [];
    if (!Array.isArray(items)) return [];
    const filtered = items.filter((item) => item && item.name && (item.type || typeof item.action === 'function'));
    if (!filtered.length) {
      dbg('catalog empty', state.activePalette, { rawCount: items.length });
    }
    return filtered;
  } catch (err) {
    console.warn('[ToySpawner] catalog failed', err);
    return [];
  }
}

function invokeEntryAction(entry) {
  if (!entry || typeof entry.action !== 'function') return false;
  try {
    const result = entry.action();
    return result !== false;
  } catch (err) {
    console.warn('[ToySpawner] action failed', err);
    return false;
  }
}

function startDrag(event, entry, source) {
  event.preventDefault();
  state.justSpawned = false;
  const pointerId = event.pointerId;
  const ghost = document.createElement('div');
  ghost.className = 'toy-spawner-ghost';
  ghost.textContent = entry.name;
  document.body.appendChild(ghost);

  state.drag = {
    entry,
    pointerId,
    ghost,
    captureTarget: source,
    startX: event.clientX,
    startY: event.clientY,
    moved: false,
  };

  try { source.setPointerCapture(pointerId); } catch (err) { console.warn('[ToySpawner] pointer capture failed', err); }
  updateGhostPosition(event.clientX, event.clientY);
  updateDropPreview(event.clientX, event.clientY);

  window.addEventListener('pointermove', onPointerMove, true);
  window.addEventListener('pointerup', onPointerUp, true);
}

function onPointerMove(event) {
  const drag = state.drag;
  if (!drag || event.pointerId !== drag.pointerId) return;
  if (!drag.moved) {
    const dx = Math.abs(event.clientX - drag.startX);
    const dy = Math.abs(event.clientY - drag.startY);
    drag.moved = dx > 3 || dy > 3;
  }
  updateGhostPosition(event.clientX, event.clientY);
  updateDropPreview(event.clientX, event.clientY);
}

function onPointerUp(event) {
  const drag = state.drag;
  if (!drag || event.pointerId !== drag.pointerId) return;

  // If not moved, it's a click. Let the click handler spawn.
  if (!drag.moved) {
    cleanupDrag();
    return;
  }

  const { entry } = drag;
  const clientX = event.clientX;
  const clientY = event.clientY;

  const dropped = trySpawn(entry, clientX, clientY);
  state.justSpawned = dropped;

  cleanupDrag();
  if (dropped) setMenuOpen(false);
}

function spawnAtDefault(entry) {
  const metrics = getBoardMetrics();
  if (!metrics) return false;
  const container = metrics.board.closest?.('.board-viewport') || document.documentElement;
  const viewportRect = container.getBoundingClientRect();

  const guide = document.querySelector('.guide-launcher');
  const spawner = document.querySelector('.toy-spawner-dock');
  const guideRight = guide ? guide.getBoundingClientRect().right : 0;
  const spawnerLeft = spawner ? spawner.getBoundingClientRect().left : window.innerWidth;
  const centerX = (guideRight + spawnerLeft) / 2;

  const targetScreenX = centerX;
  const targetScreenY = viewportRect.top + viewportRect.height * 0.5;
  // Convert screen coords into world/board space using the same mapping as the main board.
  // (This correctly accounts for internal-board pan/zoom which may not be a simple CSS scale on #board.)
  const w = screenToWorld({ x: targetScreenX, y: targetScreenY }) || { x: 0, y: 0 };
  const worldCenterX = w.x;
  const worldCenterY = w.y;
  try {
    const internalActive = !!window.__mtInternalBoard?.isActive?.();
    const internalWorld = internalActive ? window.__mtInternalBoard?.getWorldEl?.() : null;
    const artOwnerId = internalActive ? window.__mtInternalBoard?.getActiveArtToyId?.() : null;
    dbg('spawnAtDefault', state.activePalette, entry.type, { x: worldCenterX, y: worldCenterY, internalActive, artOwnerId });
    const panel = state.config.create?.(entry.type, {
      centerX: worldCenterX,
      centerY: worldCenterY,
      autoCenter: true,
      ...(internalActive && internalWorld ? { containerEl: internalWorld } : null),
      ...(internalActive && artOwnerId ? { artOwnerId } : null),
    });
    return !!panel;
  } catch (err) {
    console.warn('[ToySpawner] default create failed', err);
    return false;
  }
}

function updateGhostPosition(x, y) {
  if (!state.drag?.ghost) return;
  state.drag.ghost.style.transform = `translate(${x + 12}px, ${y + 12}px)`;
}

function updateDropPreview(x, y) {
  const point = clientPointToBoard(x, y);
  highlightBoard(!!point?.inside);
}

function highlightBoard(active) {
  // If internal-board is active, highlight its viewport instead of the main board.
  const internalViewport = window.__mtInternalBoard?.isActive?.()
    ? document.getElementById('internal-board-viewport')
    : null;
  const target = internalViewport || document.getElementById('board');
  if (!target) return;
  target.classList.toggle('toy-drop-ready', !!active);
}

function trySpawn(entry, clientX, clientY) {
  const point = clientPointToBoard(clientX, clientY);
  if (!point || !point.inside) {
    highlightBoard(false);
    return false;
  }

  try {
    // If internal-board is active, spawn into its world and tag ownership.
    const internalActive = !!window.__mtInternalBoard?.isActive?.();
    const internalWorld = internalActive ? window.__mtInternalBoard?.getWorldEl?.() : null;
    const artOwnerId = internalActive ? window.__mtInternalBoard?.getActiveArtToyId?.() : null;
    dbg('spawn', state.activePalette, entry.type, { x: point.x, y: point.y, internalActive, artOwnerId });
    const panel = state.config.create?.(entry.type, {
      centerX: point.x,
      centerY: point.y,
      autoCenter: true,
      ...(internalActive && internalWorld ? { containerEl: internalWorld } : null),
      ...(internalActive && artOwnerId ? { artOwnerId } : null),
    });
    return !!panel;
  } catch (err) {
    console.warn('[ToySpawner] create failed', err);
    return false;
  } finally {
    highlightBoard(false);
  }
}

function cleanupDrag() {
  window.removeEventListener('pointermove', onPointerMove, true);
  window.removeEventListener('pointerup', onPointerUp, true);
  cancelDrag();
}

function cancelDrag() {
  const drag = state.drag;
  if (!drag) return;
  try {
    if (drag.captureTarget && drag.pointerId != null) {
      drag.captureTarget.releasePointerCapture?.(drag.pointerId);
    }
  } catch (err) {
    console.warn('[ToySpawner] release pointer failed', err);
  }
  if (drag.ghost?.parentNode) drag.ghost.parentNode.removeChild(drag.ghost);
  state.drag = null;
  highlightBoard(false);
}

function getBoardMetrics() {
  // If internal-board is active, treat its viewport as the "board" for hit testing.
  if (window.__mtInternalBoard?.isActive?.()) {
    const viewport = window.__mtInternalBoard?.getViewportEl?.() || document.getElementById('internal-board-viewport');
    const rect = viewport?.getBoundingClientRect?.();
    if (!viewport || !rect) return null;
    const scale = Math.max(1e-6, Number(window.__mtInternalBoard?.clientToWorld?.(rect.left, rect.top)?.scaleX) || 1);
    // For internal we set offset* so that rect/offset ~= scale.
    const offsetWidth = rect.width / scale || 1;
    const offsetHeight = rect.height / scale || 1;
    return { board: viewport, rect, offsetWidth, offsetHeight, scaleX: scale, scaleY: scale };
  }

  const board = document.getElementById('board');
  if (!board) return null;
  const rect = board.getBoundingClientRect();
  const offsetWidth = board.offsetWidth || rect.width || 1;
  const offsetHeight = board.offsetHeight || rect.height || 1;
  const scaleX = rect.width / offsetWidth || 1;
  const scaleY = rect.height / offsetHeight || 1;
  return { board, rect, offsetWidth, offsetHeight, scaleX, scaleY };
}

function clientPointToBoard(clientX, clientY) {
  // Internal-board route uses the authoritative transform in main.js
  if (window.__mtInternalBoard?.isActive?.()) {
    const w = window.__mtInternalBoard?.clientToWorld?.(clientX, clientY);
    const metrics = getBoardMetrics();
    if (!w || !metrics) return null;
    return { metrics, inside: !!w.inside, x: w.x, y: w.y };
  }

  const metrics = getBoardMetrics();
  if (!metrics) return null;
  const { rect, scaleX, scaleY } = metrics;
  const localX = clientX - rect.left;
  const localY = clientY - rect.top;
  const inside = localX >= 0 && localY >= 0 && localX <= rect.width && localY <= rect.height;
  // Use shared screen->world conversion so internal-board pan/zoom maps correctly.
  // Keep the "inside" test in screen-space so we still reject drops outside the board rect.
  const w = screenToWorld({ x: clientX, y: clientY }) || { x: 0, y: 0 };
  const x = w.x;
  const y = w.y;
  return { metrics, inside, x, y };
}

function setTrashHover(active) {
  if (!state.trash) return;
  if (active) {
    state.trash.dataset.hover = 'true';
  } else {
    delete state.trash.dataset.hover;
  }
}

function setTrashArmed(active) {
  if (!state.trash) return;
  state.trash.classList.toggle('is-armed', !!active);
}

function setPanelDragActive(active) {
  if (!state.dock) return;
  state.dock.classList.toggle('panel-drag-active', !!active);
}

function isPointOverTrash(x, y) {
  if (!state.trash) return false;
  const rect = state.trash.getBoundingClientRect();
  const margin = 6;
  return x >= rect.left - margin && x <= rect.right + margin && y >= rect.top - margin && y <= rect.bottom + margin;
}

function beginPanelDrag({ panel, pointerId } = {}) {
  if (!panel) return;
  ensureDock();
  let chainPanels = [panel];
  try {
    const list = window.__mtArtToys?.collectChainPanelsForMove?.(panel);
    if (Array.isArray(list) && list.length) chainPanels = list;
  } catch {}
  const startPositions = chainPanels.map((p) => ({
    panel: p,
    left: Number.parseFloat(p?.style?.left || '') || Number(p?.offsetLeft) || 0,
    top: Number.parseFloat(p?.style?.top || '') || Number(p?.offsetTop) || 0,
  }));
  state.panelDrag = { panel, pointerId: pointerId ?? null, hovering: false, startPositions };
  setPanelDragActive(true);
  setTrashArmed(true);
  setTrashHover(false);
  try { window.__mtArtToys?.clearDropHover?.(); } catch {}
}

function updatePanelDrag({ clientX, clientY } = {}) {
  if (!state.panelDrag) return;
  if (typeof clientX !== 'number' || typeof clientY !== 'number') return;
  ensureDock();
  const hovering = isPointOverTrash(clientX, clientY);
  if (hovering !== state.panelDrag.hovering) {
    state.panelDrag.hovering = hovering;
    setTrashHover(hovering);
  }
  // Update art-toy drop highlight while dragging a music toy.
  try { window.__mtArtToys?.probeDropForPanel?.(state.panelDrag.panel, clientX, clientY); } catch {}
}

function resolveRemoveHandler(panel) {
  if (!panel) return null;
  if (panel.classList?.contains('art-toy-panel')) {
    return (typeof state.configArt?.remove === 'function') ? state.configArt.remove : null;
  }
  if (panel.classList?.contains('toy-panel')) {
    return (typeof state.configMusic?.remove === 'function') ? state.configMusic.remove : null;
  }
  return (typeof state.config?.remove === 'function') ? state.config.remove : null;
}

function endPanelDrag({ clientX, clientY, pointerId, canceled } = {}) {
  if (!state.panelDrag) return false;
  ensureDock();
  const panel = state.panelDrag.panel;
  const hasPoint = panel && !canceled && typeof clientX === 'number' && typeof clientY === 'number';

  const shouldRemove = hasPoint && isPointOverTrash(clientX, clientY);
  setTrashHover(false);
  setPanelDragActive(false);
  setTrashArmed(false);
  try { window.__mtArtToys?.clearDropHover?.(); } catch {}
  const startPositions = Array.isArray(state.panelDrag?.startPositions) ? state.panelDrag.startPositions : [];
  state.panelDrag = null;

  // Priority 1: trash delete
  const removeHandler = resolveRemoveHandler(panel);
  if (shouldRemove && typeof removeHandler === 'function') {
    try {
      return !!removeHandler(panel);
    } catch (err) {
      console.warn('[ToySpawner] remove failed', err);
    }
    return false;
  }

  // Priority 2: drop onto an Art Toy (moves the entire chain into the art toy's internal container)
  if (hasPoint) {
    try {
      const result = window.__mtArtToys?.tryPlaceChainFromPanel?.(panel, clientX, clientY);
      const placed = !!(result && (result.placed === true || result === true));
      if (placed) return true;
      const rejected = !!(result && result.rejected === true);
      if (rejected && startPositions.length) {
        for (const pos of startPositions) {
          try {
            if (!pos?.panel) continue;
            pos.panel.style.left = `${Number(pos.left || 0)}px`;
            pos.panel.style.top = `${Number(pos.top || 0)}px`;
          } catch {}
        }
        return true;
      }
    } catch (err) {
      console.warn('[ToySpawner] art drop failed', err);
    }
  }
  return false;
}

function configure(options) {
  state.configMusic = Object.assign({}, state.configMusic, options || {});
  dbg('configure(music)', {
    hasCatalog: typeof state.configMusic.getCatalog === 'function',
    hasCreate: typeof state.configMusic.create === 'function',
    hasRemove: typeof state.configMusic.remove === 'function',
  });
  if (state.activePalette === 'music') {
    state.config = state.configMusic;
    if (state.open) renderCatalog();
  }
}

function configureArt(options) {
  state.configArt = Object.assign({}, state.configArt, options || {});
  dbg('configure(art)', {
    hasCatalog: typeof state.configArt.getCatalog === 'function',
    hasCreate: typeof state.configArt.create === 'function',
    hasRemove: typeof state.configArt.remove === 'function',
  });
  if (state.activePalette === 'art') {
    state.config = state.configArt;
    if (state.open) renderCatalog();
  }
}

function configureGame(options) {
  state.configGame = Object.assign({}, state.configGame, options || {});
  dbg('configure(game)', {
    hasCatalog: typeof state.configGame.getCatalog === 'function',
    hasCreate: typeof state.configGame.create === 'function',
    hasRemove: typeof state.configGame.remove === 'function',
  });
  if (state.activePalette === 'game') {
    state.config = state.configGame;
    if (state.open) renderCatalog();
  }
}

function triggerTrashErrorFeedback() {
  if (!state.trash) return;
  state.trash.classList.remove('trash-empty-error');
  // Force reflow so the animation can replay.
  void state.trash.offsetWidth;
  state.trash.classList.add('trash-empty-error');
  if (state.trashFeedbackTimer) {
    clearTimeout(state.trashFeedbackTimer);
  }
  state.trashFeedbackTimer = setTimeout(() => {
    state.trash?.classList.remove('trash-empty-error');
    state.trashFeedbackTimer = null;
  }, 900);
}

function showTrashHint() {
  if (!state.trash) return;
  const { callout, connector, host } = ensureTrashHint();

  const rect = state.trash.getBoundingClientRect();
  callout.textContent = 'Drag a toy here to delete it';

  // Measure after text set
  const width = callout.offsetWidth;
  const height = callout.offsetHeight;
  const margin = 18;
  const left = rect.left - width - margin;
  const top = rect.top + rect.height / 2 - height / 2;

  callout.style.left = `${left}px`;
  callout.style.top = `${top}px`;
  callout.classList.add('visible');
  host.classList.add('visible');

  // Connector from callout center-right to trash center-left
  const startX = left + width;
  const startY = top + height / 2;
  const endX = rect.left;
  const endY = rect.top + rect.height / 2;
  const dx = endX - startX;
  const dy = endY - startY;
  const length = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);

  connector.style.width = `${length}px`;
  connector.style.transform = `translate(${startX}px, ${startY}px) rotate(${angle}deg)`;
  connector.classList.add('visible');

  if (state.trashHelpTimer) clearTimeout(state.trashHelpTimer);
  state.trashHelpTimer = setTimeout(() => {
    state.trashHelpTimer = null;
    hideTrashHint();
  }, 3000);
}

function ensureTrashHint() {
  if (state.trashHint && state.trashHint.host?.isConnected) return state.trashHint;

  const host = document.createElement('div');
  host.className = 'toy-trash-hint-host';

  const callout = document.createElement('div');
  callout.className = 'toy-help-callout toy-trash-hint arrow-left';
  callout.textContent = 'Drag a toy here to delete it';

  const connector = document.createElement('div');
  connector.className = 'toy-help-connector toy-trash-hint-connector';

  host.append(callout, connector);
  document.body.appendChild(host);

  state.trashHint = { host, callout, connector };
  return state.trashHint;
}

function hideTrashHint() {
  if (!state.trashHint) return;
  state.trashHint.callout?.classList.remove('visible');
  state.trashHint.connector?.classList.remove('visible');
  state.trashHint.host?.classList.remove('visible');
  if (state.trashHint.connector) {
    state.trashHint.connector.style.width = '0px';
    state.trashHint.connector.style.transform = 'translate(0, 0)';
  }
}

export const ToySpawner = {
  open: () => setMenuOpen(true),
  close: () => setMenuOpen(false),
  configure,
  configureArt,
  configureGame,
  beginPanelDrag,
  updatePanelDrag,
  endPanelDrag,
};

try {
  window.ToySpawner = Object.assign(window.ToySpawner || {}, ToySpawner);
} catch (err) {
  console.warn('[ToySpawner] global registration failed', err);
}

ensureDock();

