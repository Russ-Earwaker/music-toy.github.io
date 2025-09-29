const overlayState = {
  active: false,
  host: null,
  pending: false,
  observer: null,
  watchers: [],
  cache: new WeakMap(),
};

const BASE_MARGIN = 36;
const BASE_GAP = 1;
const INLINE_GAP = 5;
const MAX_OFFSETS = 6;
const MAX_ATTEMPTS = 4;
const TARGET_PADDING = 5;

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
      group: entry.group,
    });
  });
}

function gatherTargets() {
  const board = document.getElementById('board');
  const boardMetrics = board ? getBoardMetrics(board) : null;
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

    const defaultDirections = ['top', 'bottom', 'right', 'left'];
    let allowedDirections;
    const headerRoot = target.closest('.toy-header, #topbar, .app-topbar');
    const footerRoot = target.closest('.toy-footer');
    let preferred = (target.dataset.helpPosition || '').toLowerCase();
    if (!defaultDirections.includes(preferred)) {
      preferred = '';
    }

    if (label.includes('Choose Instrument')) {
      preferred = 'top';
      allowedDirections = ['top'];
    } else if (headerRoot) {
      preferred = 'top';
      allowedDirections = ['top'];
    } else if (footerRoot) {
      preferred = 'bottom';
      allowedDirections = ['bottom'];
    } else if (preferred) {
      allowedDirections = [preferred, ...defaultDirections.filter((dir) => dir !== preferred)];
    } else {
      allowedDirections = defaultDirections.slice();
    }

    const groupRoot = target.closest('[data-help-group], .toy-panel, #topbar, .app-topbar') || document.body;
    let group = 'global';
    if (groupRoot) {
      group =
        groupRoot.getAttribute('data-help-group') ||
        groupRoot.id ||
        (groupRoot.dataset ? (groupRoot.dataset.helpGroup || groupRoot.dataset.toyid || groupRoot.dataset.toy || groupRoot.dataset.panelId) : null) ||
        (groupRoot.classList && groupRoot.classList.length ? groupRoot.classList[0] : null) ||
        'global';
    }

    const metrics = boardMetrics && boardMetrics.board && boardMetrics.board.contains(target) ? boardMetrics : null;
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

    const position = preferred || allowedDirections[0] || 'top';

    items.push({
      target,
      label,
      position,
      allowedDirections,
      group,
      rect: rectLocal,
      rectScreen,
      metrics,
      width: 0,
      height: 0,
    });
  }

  items.sort((a, b) => {
    if (a.group !== b.group) {
      return a.group < b.group ? -1 : 1;
    }
    const topDiff = a.rect.top - b.rect.top;
    if (Math.abs(topDiff) > 10) return topDiff;
    return a.rect.left - b.rect.left;
  });
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
  const assigned = [];
  const results = [];
  for (const entry of entries) {
    const cachedRaw = overlayState.cache.get(entry.target) || null;
    const cached = cachedRaw && cachedRaw.group === entry.group ? cachedRaw : null;
    const placement = placeEntry(entry, assigned, gap, cached, allowOverlap);
    if (!placement) return null;
    assigned.push({ entry, placement });
    results.push(placement);
  }
  return results;
}

function placeEntry(entry, assigned, gap, cachedPlacement, allowOverlap) {
  const width = entry.width;
  const height = entry.height;

  const label = entry.label;
  const isAdv = label.includes('Advanced Controls') || label.includes('Clear') || label.includes('Random');

  if (isAdv) {
    const dir = 'top';
    const vertical = false;
    const margin = BASE_MARGIN;
    let base = basePositionForDirection(dir, entry.rect, width, height, margin);

    if (label.includes('Advanced Controls')) {
      base.left -= 30;
    } else if (label.includes('Clear')) {
      base.left += 30;
    } else if (label.includes('Random')) {
      base.top -= 20;
    }

    const candidate = buildCandidate(base, width, height, vertical, 0);
    return { dir, rect: candidate, offset: 0, vertical };
  }
  
  const isSpecial = label.includes('Choose Instrument') || label.includes('Mute');
  if (isSpecial) {
    const dir = label.includes('Mute') ? 'bottom' : 'top';
    const vertical = false;
    const margin = BASE_MARGIN;
    let base = basePositionForDirection(dir, entry.rect, width, height, margin);
    const candidate = buildCandidate(base, width, height, vertical, 0);
    return { dir, rect: candidate, offset: 0, vertical };
  }

  const directions = orderDirections(cachedPlacement?.dir, entry.position, entry.allowedDirections);
  const inflatedTarget = inflateRect(entry.rect, TARGET_PADDING);

  const siblings = assigned.filter(({ entry: other }) => other.group === entry.group);

  const hasSiblingOverlap = (rect) => {
    const inflated = inflateRect(rect, 5);
    for (const { placement } of siblings) {
      if (intersectionArea(inflated, placement.rect) > 0) {
        return true;
      }
    }
    return false;
  };

  if (cachedPlacement && cachedPlacement.dir && directions.includes(cachedPlacement.dir)) {
    const dir = cachedPlacement.dir;
    const vertical = dir === 'right' || dir === 'left';
    const offset = Number.isFinite(cachedPlacement.offset) ? cachedPlacement.offset : 0;
    const margin = BASE_MARGIN + gap * 0.25;
    const base = basePositionForDirection(dir, entry.rect, width, height, margin);
    const candidate = buildCandidate(base, width, height, vertical, offset);
    if (intersectionArea(candidate, inflatedTarget) <= 0 && !hasSiblingOverlap(candidate)) {
      return { dir, rect: candidate, offset, vertical };
    }
  }

  let fallback = null;

  const findPrevSameDir = (dir) => {
    for (let i = siblings.length - 1; i >= 0; i--) {
      const placed = siblings[i].placement;
      if (!placed.vertical && placed.dir === dir) {
        return placed;
      }
    }
    return null;
  };

  for (const dir of directions) {
    const vertical = dir === 'right' || dir === 'left';
    const margin = BASE_MARGIN + gap * 0.25;
    const base = basePositionForDirection(dir, entry.rect, width, height, margin);
    const offsets = buildOffsetSeries(gap, cachedPlacement, dir, vertical);

    for (const offset of offsets) {
      let candidate = buildCandidate(base, width, height, vertical, offset);
      let adjustedOffset = offset;

      if (entry.group === 'adv-controls' && dir === 'top') {
        let nudge = 0;
        if (entry.label.includes('Open Advanced')) nudge = -30;
        if (entry.label.includes('Clear')) nudge = 30;
        candidate.left += nudge;
        candidate.right += nudge;
      }



      if (intersectionArea(candidate, inflatedTarget) > 0) continue;

      const overlapsOther = hasSiblingOverlap(candidate);
      if (overlapsOther && !allowOverlap) continue;

      const placement = { dir, rect: candidate, offset: adjustedOffset, vertical };

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

function orderDirections(cachedDir, preferred, allowedDirections) {
  const fallback = ['top', 'bottom', 'right', 'left'];
  let allowed = Array.isArray(allowedDirections) && allowedDirections.length
    ? allowedDirections.filter((dir) => fallback.includes(dir))
    : fallback.slice();
  if (!allowed.length) {
    allowed = fallback.slice();
  }
  const order = [];
  const push = (dir) => {
    if (dir && allowed.includes(dir) && !order.includes(dir)) {
      order.push(dir);
    }
  };
  push(cachedDir);
  push(preferred);
  allowed.forEach(push);
  if (!order.length) {
    order.push(...allowed);
  }
  return order;
}

function basePositionForDirection(direction, rect, width, height, margin) {
  const rectWidth = rect.right - rect.left;
  const rectHeight = rect.bottom - rect.top;
  switch (direction) {
    case 'left':
      return { left: rect.left - margin - width, top: rect.top + rectHeight / 2 - height / 2 };
    case 'top':
      return { left: rect.left + rectWidth / 2 - width / 2, top: rect.top - margin - height };
    case 'bottom':
      return { left: rect.left + rectWidth / 2 - width / 2, top: rect.bottom + margin };
    case 'right':
    default:
      return { left: rect.right + margin, top: rect.top + rectHeight / 2 - height / 2 };
  }
}

function getTargetAnchor(direction, rect) {
  const width = rect.right - rect.left;
  const height = rect.bottom - rect.top;
  switch (direction) {
    case 'left':
      return { x: rect.left, y: rect.top + height / 2 };
    case 'right':
      return { x: rect.right, y: rect.top + height / 2 };
    case 'top':
      return { x: rect.left + width / 2, y: rect.top };
    case 'bottom':
      return { x: rect.left + width / 2, y: rect.bottom };
    default:
      return { x: rect.left + width / 2, y: rect.top + height / 2 };
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
  const targetAnchor = getTargetAnchor(dir, targetRectLocal);
  const targetCenterXLocal = targetAnchor.x;
  const targetCenterYLocal = targetAnchor.y;

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
  const trimmed = Math.max(distance - 16, 0);
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








