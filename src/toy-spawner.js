// src/toy-spawner.js
// Provides the "Create Toy" palette dock and drag-to-spawn affordance.

const state = {
  dock: null,
  toggle: null,
  menu: null,
  listHost: null,
  config: {
    getCatalog: () => [],
    create: () => null,
  },
  drag: null,
  open: false,
  justSpawned: false,
};

function ensureDock() {
  if (state.dock) return;

  const dock = document.createElement('div');
  dock.className = 'toy-spawner-dock';

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'toy-spawner-toggle toy-btn';
  toggle.textContent = 'Create Toy';

  const menu = document.createElement('div');
  menu.className = 'toy-spawner-menu';
  menu.setAttribute('role', 'menu');

  const list = document.createElement('div');
  list.className = 'toy-spawner-list';
  menu.appendChild(list);

  dock.append(toggle, menu);
  document.body.appendChild(dock);

  state.dock = dock;
  state.toggle = toggle;
  state.menu = menu;
  state.listHost = list;

  toggle.addEventListener('click', () => setMenuOpen(!state.open));

  document.addEventListener('pointerdown', (event) => {
    if (!state.open) return;
    if (state.dock?.contains(event.target)) return;
    if (state.drag) return;
    setMenuOpen(false);
  }, true);

  document.addEventListener('keydown', (event) => {
    if (!state.open) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      setMenuOpen(false);
    }
  }, true);
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
    state.justSpawned = false;
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
  const { entry } = drag;
  const clientX = event.clientX;
  const clientY = event.clientY;

  const dropped = trySpawn(entry, clientX, clientY);
  state.justSpawned = dropped;

  cleanupDrag();
  if (dropped) setMenuOpen(false);
}

function spawnAtDefault(entry) {
  const board = document.getElementById('board');
  if (!board) return false;
  const rect = board.getBoundingClientRect();
  const scale = window.__boardScale || 1;
  const centerX = (rect.width / 2) / scale;
  const centerY = (rect.height / 2) / scale;
  try {
    state.config.create?.(entry.type, { centerX, centerY });
    return true;
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
  const board = document.getElementById('board');
  if (!board) return;
  const rect = board.getBoundingClientRect();
  const inside = x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  highlightBoard(inside);
}

function highlightBoard(active) {
  const board = document.getElementById('board');
  if (!board) return;
  board.classList.toggle('toy-drop-ready', !!active);
}

function trySpawn(entry, clientX, clientY) {
  const board = document.getElementById('board');
  if (!board) return false;
  const rect = board.getBoundingClientRect();
  const inside = clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
  if (!inside) {
    highlightBoard(false);
    return false;
  }

  const scale = window.__boardScale || 1;
  const centerX = (clientX - rect.left) / scale;
  const centerY = (clientY - rect.top) / scale;

  try {
    state.config.create?.(entry.type, { centerX, centerY });
    return true;
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

function configure(options) {
  state.config = Object.assign({}, state.config, options || {});
  if (state.open) renderCatalog();
}

export const ToySpawner = {
  open: () => setMenuOpen(true),
  close: () => setMenuOpen(false),
  configure,
};

try {
  window.ToySpawner = Object.assign(window.ToySpawner || {}, ToySpawner);
} catch (err) {
  console.warn('[ToySpawner] global registration failed', err);
}

ensureDock();
