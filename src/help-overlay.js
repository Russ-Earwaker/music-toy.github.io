const overlayState = {
  active: false,
  host: null,
  pending: false,
  observer: null,
  watchers: [],
  cache: new WeakMap(),
};

const BASE_MARGIN = 36;
const BASE_GAP = 44;
const MAX_OFFSETS = 6;
const MAX_ATTEMPTS = 4;
const TARGET_PADDING = 40;

const scheduleUpdateHandler = () => scheduleUpdate();

function ensureHost() {
  if (overlayState.host && overlayState.host.isConnected) {
    return overlayState.host;
  }
  destroyHost();
  const host = document.createElement('div');
  host.className = 'toy-help-overlay';
  host.style.position = 'fixed';
  host.style.inset = '0';
  host.style.pointerEvents = 'none';
  host.style.zIndex = '5000';
  document.body.appendChild(host);
  overlayState.host = host;
  return host;
}

function destroyHost() {
  if (overlayState.host && overlayState.host.parentNode) {
    overlayState.host.parentNode.removeChild(overlayState.host);
  }
  overlayState.host = null;
}

function addWatcher(target, type, listener, options) {
  target.addEventListener(type, listener, options);
  overlayState.watchers.push({ target, type, listener, options });
}

function removeWatchers() {
  while (overlayState.watchers.length) {
    const { target, type, listener, options } = overlayState.watchers.pop();
    target.removeEventListener(type, listener, options);
  }
}

function startObserver() {
  if (overlayState.observer) return;
  const observer = new MutationObserver((mutations) => {
    if (!overlayState.active) return;
    for (const mutation of mutations) {
      if (overlayState.host && overlayState.host.contains(mutation.target)) continue;
      scheduleUpdate();
      break;
    }
  });
  observer.observe(document.body, {
    attributes: true,
    attributeFilter: ['style', 'class', 'data-help-label', 'data-help-position', 'data-help-ignore'],
    childList: true,
    subtree: true,
  });
  overlayState.observer = observer;
}

function stopObserver() {
  if (overlayState.observer) {
    overlayState.observer.disconnect();
    overlayState.observer = null;
  }
}

function setHelpActive(active) {
  const next = !!active;
  if (overlayState.active === next) {
    if (next) scheduleUpdate(true);
    return overlayState.active;
  }
  overlayState.active = next;
  if (overlayState.active) {
    ensureHost();
    document.body.classList.add('toy-help-mode');
    addWatcher(window, 'resize', scheduleUpdateHandler, true);
    addWatcher(window, 'orientationchange', scheduleUpdateHandler, true);
    addWatcher(document, 'scroll', scheduleUpdateHandler, true);
    startObserver();
    scheduleUpdate(true);
  } else {
    document.body.classList.remove('toy-help-mode');
    removeWatchers();
    stopObserver();
    destroyHost();
  }
  return overlayState.active;
}

function toggleHelp() {
  return setHelpActive(!overlayState.active);
}

function isHelpActive() {
  return !!overlayState.active;
}

function refreshHelpOverlay() {
  if (!overlayState.active) return;
  scheduleUpdate();
}

function scheduleUpdate(immediate = false) {
  if (!overlayState.active) return;
  if (immediate) {
    overlayState.pending = false;
    renderOverlay();
    return;
  }
  if (overlayState.pending) return;
  overlayState.pending = true;
  requestAnimationFrame(() => {
    overlayState.pending = false;
    renderOverlay();
  });
}

function renderOverlay() {
  if (!overlayState.active) return;
  const host = ensureHost();
  host.innerHTML = '';
  const entries = gatherTargets();
  if (!entries.length) return;

  const elements = entries.map((entry) => {
    const callout = document.createElement('div');
    callout.className = 'toy-help-callout';
    callout.dataset.position = entry.position;
    callout.style.visibility = 'hidden';
    callout.style.transformOrigin = 'top left';

    const textEl = document.createElement('div');
    textEl.className = 'toy-help-callout-text';
    textEl.textContent = entry.label;
    callout.appendChild(textEl);

    const connector = document.createElement('div');
    connector.className = 'toy-help-connector';
    connector.style.visibility = 'hidden';
    connector.style.transformOrigin = '0 50%';

    host.append(callout, connector);

    const widthPx = callout.offsetWidth || 220;
    const heightPx = callout.offsetHeight || 60;
    entry.widthPx = widthPx;
    entry.heightPx = heightPx;
    if (entry.metrics) {
      entry.width = widthPx / entry.metrics.scale;
      entry.height = heightPx / entry.metrics.scale;
    } else {
      entry.width = widthPx;
      entry.height = heightPx;
    }
    return { callout, connector };
  });

  let layout = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS && !layout; attempt++) {
    layout = tryLayout(entries, BASE_GAP * (attempt + 1), false);
  }
  if (!layout) layout = tryLayout(entries, BASE_GAP * (MAX_ATTEMPTS + 1), true);
  if (!layout) return;

  layout.forEach((placement, index) => {
    const { callout, connector } = elements[index];
    const entry = entries[index];
    applyPlacement(callout, connector, placement, entry);
    overlayState.cache.set(entry.target, {
      dir: placement.dir,
      offset: placement.offset,
      vertical: placement.vertical,
    });
  });
}

function gatherTargets() {
  const board = document.getElementById('board');
  const metrics = board ? getBoardMetrics(board) : null;
  const items = [];

  const nodes = Array.from(document.querySelectorAll('[data-help-label]'));
  for (const target of nodes) {
    const label = (target.dataset.helpLabel || '').trim();
    if (!label) continue;
    if (!target.isConnected) continue;
    if (target.dataset.helpIgnore === 'true') continue;

    const style = window.getComputedStyle(target);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;

    const rectScreen = target.getBoundingClientRect();
    if (rectScreen.width < 1 || rectScreen.height < 1) continue;
    if (rectScreen.right < 0 || rectScreen.bottom < 0 || rectScreen.left > window.innerWidth || rectScreen.top > window.innerHeight) continue;

    const preferred = (target.dataset.helpPosition || '').toLowerCase();

    const rectLocal = metrics
      ? {
          left: (rectScreen.left - metrics.rect.left) / metrics.scale,
          top: (rectScreen.top - metrics.rect.top) / metrics.scale,
          right: (rectScreen.right - metrics.rect.left) / metrics.scale,
          bottom: (rectScreen.bottom - metrics.rect.top) / metrics.scale,
        }
      : {
          left: rectScreen.left,
          top: rectScreen.top,
          right: rectScreen.right,
          bottom: rectScreen.bottom,
        };

    items.push({
      target,
      label,
      position: preferred,
      rect: rectLocal,
      rectScreen,
      metrics,
      width: 0,
      height: 0,
    });
  }

  items.sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left);
  return items;
}

function getBoardMetrics(board) {
  const rect = board.getBoundingClientRect();
  const scale = extractScale(board);
  return { board, rect, scale };
}

function extractScale(el) {
  const style = window.getComputedStyle(el);
  const transform = style.transform || style.webkitTransform || '';
  if (transform && transform !== 'none') {
    const match = transform.match(/matrix\(([^)]+)\)/);
    if (match) {
      const parts = match[1].split(',');
      if (parts.length >= 2) {
        const a = parseFloat(parts[0]);
        const b = parseFloat(parts[1]);
        const scale = Math.sqrt(a * a + b * b);
        if (Number.isFinite(scale) && scale > 0) {
          return scale;
        }
      }
    }
  }
  return 1;
}

function tryLayout(entries, gap, allowOverlap) {
  const placements = [];
  for (const entry of entries) {
    const cached = overlayState.cache.get(entry.target) || null;
    const placement = placeEntry(entry, placements, gap, cached, allowOverlap);
    if (!placement) return null;
    placements.push(placement);
  }
  return placements;
}

function placeEntry(entry, placements, gap, cachedPlacement, allowOverlap) {
  const width = entry.width;
  const height = entry.height;
  const directions = orderDirections(cachedPlacement?.dir, entry.position);
  const inflatedTarget = inflateRect(entry.rect, TARGET_PADDING);

  let fallback = null;

  for (const dir of directions) {
    const vertical = dir === 'right' || dir === 'left';
    const base = basePositionForDirection(dir, entry.rect, width, height, BASE_MARGIN);
    const offsets = buildOffsetSeries(gap, cachedPlacement, dir, vertical);

    for (const offset of offsets) {
      const candidate = buildCandidate(base, width, height, vertical, offset);
      const overlapsTarget = intersectionArea(candidate, inflatedTarget) > 0;
      if (overlapsTarget) continue;

      let overlapsOther = false;
      for (const placed of placements) {
        if (intersectionArea(candidate, placed.rect) > 0) {
          overlapsOther = true;
          break;
        }
      }
      if (overlapsOther && !allowOverlap) continue;

      const placement = { dir, rect: candidate, offset, vertical };

      if (!overlapsOther) {
        return placement;
      }
      if (!fallback || fallback.overlapsOther) {
        fallback = { ...placement, overlapsOther };
      }
    }
  }

  return allowOverlap ? fallback : null;
}

function buildCandidate(base, width, height, vertical, offset) {
  const left = vertical ? base.left : base.left + offset;
  const top = vertical ? base.top + offset : base.top;
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
  };
}

function buildOffsetSeries(gap, cached, direction, vertical) {
  const offsets = [];
  const seen = new Set();
  const cachedOffset = cached && cached.dir === direction && cached.vertical === vertical ? cached.offset : null;
  if (cachedOffset !== null && Number.isFinite(cachedOffset)) {
    offsets.push(cachedOffset);
    seen.add(Math.round(cachedOffset));
  }
  if (!seen.has(0)) offsets.push(0);
  for (let i = 1; i <= MAX_OFFSETS; i++) {
    const value = gap * i;
    if (!seen.has(value)) {
      offsets.push(value);
      seen.add(value);
    }
    if (!seen.has(-value)) {
      offsets.push(-value);
      seen.add(-value);
    }
  }
  return offsets;
}

function orderDirections(cachedDir, preferred) {
  const order = [];
  if (cachedDir) order.push(cachedDir);
  if (preferred && preferred !== cachedDir) order.push(preferred);
  ['right', 'left', 'bottom', 'top'].forEach((dir) => {
    if (!order.includes(dir)) order.push(dir);
  });
  return order;
}

function basePositionForDirection(direction, rect, width, height, margin) {
  switch (direction) {
    case 'left':
      return { left: rect.left - margin - width, top: rect.top + rect.height / 2 - height / 2 };
    case 'top':
      return { left: rect.left + rect.width / 2 - width / 2, top: rect.top - margin - height };
    case 'bottom':
      return { left: rect.left + rect.width / 2 - width / 2, top: rect.bottom + margin };
    case 'right':
    default:
      return { left: rect.right + margin, top: rect.top + rect.height / 2 - height / 2 };
  }
}

function applyPlacement(callout, connector, placement, entry) {
  const { dir, rect, offset, vertical } = placement;
  const { metrics } = entry;

  callout.dataset.position = dir;
  callout.style.visibility = 'visible';
  callout.classList.remove('arrow-left', 'arrow-right', 'arrow-top', 'arrow-bottom');
  callout.classList.add(`arrow-${dir}`);

  if (metrics) {
    const { rect: boardRect, scale } = metrics;
    const screenLeft = boardRect.left + rect.left * scale;
    const screenTop = boardRect.top + rect.top * scale;
    callout.style.left = '0px';
    callout.style.top = '0px';
    callout.style.transform = `translate(${Math.round(screenLeft)}px, ${Math.round(screenTop)}px) scale(${scale})`;
    callout.style.transformOrigin = 'top left';
  } else {
    callout.style.left = `${Math.round(rect.left)}px`;
    callout.style.top = `${Math.round(rect.top)}px`;
    callout.style.transform = '';
  }

  const anchor = anchorForDirection(dir, rect);
  const targetRectLocal = entry.rect;
  const targetCenterXLocal = targetRectLocal.left + (targetRectLocal.right - targetRectLocal.left) / 2;
  const targetCenterYLocal = targetRectLocal.top + (targetRectLocal.bottom - targetRectLocal.top) / 2;

  let anchorScreenX;
  let anchorScreenY;
  let targetScreenX;
  let targetScreenY;
  let scaleForLine = 1;

  if (metrics) {
    const { rect: boardRect, scale } = metrics;
    scaleForLine = scale;
    anchorScreenX = boardRect.left + anchor.x * scale;
    anchorScreenY = boardRect.top + anchor.y * scale;
    targetScreenX = boardRect.left + targetCenterXLocal * scale;
    targetScreenY = boardRect.top + targetCenterYLocal * scale;
  } else {
    anchorScreenX = anchor.x;
    anchorScreenY = anchor.y;
    targetScreenX = targetCenterXLocal;
    targetScreenY = targetCenterYLocal;
  }

  const dx = targetScreenX - anchorScreenX;
  const dy = targetScreenY - anchorScreenY;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const trimmed = Math.max(distance - 16 * scaleForLine, 0);
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);

  connector.dataset.position = dir;
  connector.style.visibility = trimmed > 0 ? 'visible' : 'hidden';
  connector.style.transform = `translate(${Math.round(anchorScreenX)}px, ${Math.round(anchorScreenY)}px) rotate(${angle}deg)`;
  connector.style.width = `${Math.max(0, Math.round(trimmed))}px`;
  connector.style.height = `${Math.max(2 * scaleForLine, 1)}px`;

  const targetEl = entry.target;
  if (targetEl && targetEl.id) {
    connector.dataset.target = targetEl.id;
    callout.dataset.target = targetEl.id;
  } else {
    delete connector.dataset.target;
    delete callout.dataset.target;
  }

  placement.offset = offset;
  placement.vertical = vertical;
}

function anchorForDirection(direction, rect) {
  const width = rect.right - rect.left;
  const height = rect.bottom - rect.top;
  switch (direction) {
    case 'left':
      return { x: rect.right, y: rect.top + height / 2 };
    case 'top':
      return { x: rect.left + width / 2, y: rect.bottom };
    case 'bottom':
      return { x: rect.left + width / 2, y: rect.top };
    case 'right':
    default:
      return { x: rect.left, y: rect.top + height / 2 };
  }
}

function inflateRect(rect, amount) {
  return {
    left: rect.left - amount,
    top: rect.top - amount,
    right: rect.right + amount,
    bottom: rect.bottom + amount,
  };
}

function intersectionArea(a, b) {
  const left = Math.max(a.left, b.left);
  const right = Math.min(a.right, b.right);
  if (right <= left) return 0;
  const top = Math.max(a.top, b.top);
  const bottom = Math.min(a.bottom, b.bottom);
  if (bottom <= top) return 0;
  return (right - left) * (bottom - top);
}

export { setHelpActive, toggleHelp, isHelpActive, refreshHelpOverlay };

try {
  window.HelpOverlay = { setHelpActive, toggleHelp, isHelpActive, refreshHelpOverlay };
} catch (err) {
  // no-op
}
