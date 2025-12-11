// src/toy-spawner.js
// Provides the "Create Toy" palette dock and drag-to-spawn affordance.

import { toggleHelp, isHelpActive } from './help-overlay.js';
import { overviewMode } from './overview-mode.js';

const state = {
  dock: null,
  toggle: null,
  menu: null,
  listHost: null,
  trash: null,
  helpButton: null,
  helpActive: false,
  config: {
    getCatalog: () => [],
    create: () => null,
    remove: () => false,
  },
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
const OVERVIEW_ICON_OUT = "url('/assets/UI/T_ButtonOverviewZoomOut.png')";
const OVERVIEW_ICON_IN = "url('/assets/UI/T_ButtonOverviewZoomIn.png')";
const FOCUS_CLOSE_ICON = "url('/assets/UI/T_ButtonClose.png')";

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
  if (trashCore) trashCore.style.setProperty('--c-btn-icon-url', "url('/assets/UI/T_ButtonTrash.png')");
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
  if (toggleCore) toggleCore.style.setProperty('--c-btn-icon-url', "url('/assets/UI/T_ButtonAddMusic.png')");
  toggle.style.setProperty('--c-btn-size', 'var(--toy-spawner-button-size)');
  toggle.style.setProperty('--c-btn-bg', 'rgba(47, 102, 179, 0.85)');

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
  if (helpCore) helpCore.style.setProperty('--c-btn-icon-url', "url('/assets/UI/T_ButtonHelp.png')");
  help.style.setProperty('--c-btn-size', 'var(--toy-spawner-button-size)');
  help.style.setProperty('--c-btn-bg', 'rgba(43, 133, 140, 0.88)');

  const menu = document.createElement('div');
  menu.className = 'toy-spawner-menu';
  menu.setAttribute('role', 'menu');

  const list = document.createElement('div');
  list.className = 'toy-spawner-list';
  menu.appendChild(list);

  dock.append(trash, toggle, overview, help, menu);
  document.body.appendChild(dock);

  state.dock = dock;
  state.toggle = toggle;
  state.menu = menu;
  state.listHost = list;
  state.trash = trash;
  state.helpButton = help;
  state.overviewButton = overview;
  updateHelpToggleUI(isHelpActive());
  updateOverviewToggleUI(overviewMode?.isActive?.());

  help.addEventListener('click', (event) => {
    event.preventDefault();
    const active = toggleHelp();
    updateHelpToggleUI(active);
  });

  toggle.addEventListener('click', () => setMenuOpen(!state.open));

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
}

function renderCatalog() {
  if (!state.listHost) return;
  const catalog = safeCatalog();
  state.listHost.innerHTML = '';
  catalog.forEach((entry) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'toy-spawner-item';
    card.dataset.toyType = entry.type;

    const nameEl = document.createElement('div');
    nameEl.className = 'toy-spawner-name';
    nameEl.textContent = entry.name;

    const descEl = document.createElement('div');
    descEl.className = 'toy-spawner-description';
    descEl.textContent = entry.description || '';

    card.append(nameEl, descEl);

    const isDisabled = !!entry.disabled;
    if (isDisabled) {
      card.disabled = true;
      card.classList.add('is-disabled');
      card.setAttribute('aria-disabled', 'true');
      card.tabIndex = -1;
    } else {
      card.addEventListener('pointerdown', (event) => startDrag(event, entry, card));
      card.addEventListener('click', (event) => {
        if (state.justSpawned) {
          state.justSpawned = false;
          event.preventDefault();
          return;
        }
        event.preventDefault();
        const created = spawnAtDefault(entry);
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
    return items.filter((item) => item && item.type && item.name);
  } catch (err) {
    console.warn('[ToySpawner] catalog failed', err);
    return [];
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
  const scaleX = Math.max(1e-6, metrics.scaleX || 1);
  const scaleY = Math.max(1e-6, metrics.scaleY || 1);
  // Convert viewport screen coords into world/board space, accounting for current zoom.
  const worldCenterX = (targetScreenX - metrics.rect.left) / scaleX;
  const worldCenterY = (targetScreenY - metrics.rect.top) / scaleY;
  try {
    const panel = state.config.create?.(entry.type, { centerX: worldCenterX, centerY: worldCenterY, autoCenter: true });
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
  const board = document.getElementById('board');
  if (!board) return;
  board.classList.toggle('toy-drop-ready', !!active);
}

function trySpawn(entry, clientX, clientY) {
  const point = clientPointToBoard(clientX, clientY);
  if (!point || !point.inside) {
    highlightBoard(false);
    return false;
  }

  try {
    const panel = state.config.create?.(entry.type, { centerX: point.x, centerY: point.y, autoCenter: true });
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
  const metrics = getBoardMetrics();
  if (!metrics) return null;
  const { rect, scaleX, scaleY } = metrics;
  const localX = clientX - rect.left;
  const localY = clientY - rect.top;
  const inside = localX >= 0 && localY >= 0 && localX <= rect.width && localY <= rect.height;
  const x = scaleX ? localX / scaleX : localX;
  const y = scaleY ? localY / scaleY : localY;
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
  state.panelDrag = { panel, pointerId: pointerId ?? null, hovering: false };
  setPanelDragActive(true);
  setTrashArmed(true);
  setTrashHover(false);
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
}

function endPanelDrag({ clientX, clientY, pointerId, canceled } = {}) {
  if (!state.panelDrag) return false;
  ensureDock();
  const panel = state.panelDrag.panel;
  const shouldRemove = !canceled && panel && typeof clientX === 'number' && typeof clientY === 'number' && isPointOverTrash(clientX, clientY);
  setTrashHover(false);
  setPanelDragActive(false);
  setTrashArmed(false);
  state.panelDrag = null;

  if (shouldRemove && typeof state.config.remove === 'function') {
    try {
      return !!state.config.remove(panel);
    } catch (err) {
      console.warn('[ToySpawner] remove failed', err);
    }
  }
  return false;
}

function configure(options) {
  state.config = Object.assign({}, state.config, options || {});
  if (state.open) renderCatalog();
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
