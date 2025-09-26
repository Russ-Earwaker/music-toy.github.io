const overlayState = {
  active: false,
  host: null,
  pending: false,
  observer: null,
  watchers: [],
};

const scheduleUpdateHandler = () => scheduleUpdate();

const CALL_OUT_MARGIN = 28;
const BORDER_PADDING = 12;
const TARGET_PADDING = 6;
const SHIFT_GAP = 14;
const MAX_SHIFT_STEPS = 3;

function ensureHost() {
  if (overlayState.host && overlayState.host.isConnected) {
    return overlayState.host;
  }
  const host = document.createElement('div');
  host.className = 'toy-help-overlay';
  host.setAttribute('aria-hidden', 'true');
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
      if (overlayState.host && overlayState.host.contains(mutation.target)) {
        continue;
      }
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
  const targets = gatherTargets();
  const placements = [];
  for (const entry of targets) {
    const { target, rect, label, position } = entry;
    const callout = document.createElement('div');
    callout.className = 'toy-help-callout';
    callout.dataset.position = position;
    callout.style.visibility = 'hidden';

    const text = document.createElement('div');
    text.className = 'toy-help-callout-text';
    text.textContent = label;
    callout.appendChild(text);

    host.appendChild(callout);

    const connector = document.createElement('div');
    connector.className = 'toy-help-connector';
    connector.style.visibility = 'hidden';
    host.insertBefore(connector, callout);

    const record = positionCallout(callout, connector, rect, position, target, placements);
    callout.style.visibility = 'visible';
    if (record) placements.push(record);
  }
}

function gatherTargets() {
  const nodes = Array.from(document.querySelectorAll('[data-help-label]'));
  const items = [];
  for (const target of nodes) {
    const label = (target.dataset.helpLabel || '').trim();
    if (!label) continue;
    if (!target.isConnected) continue;
    if (target.dataset.helpIgnore === 'true') continue;
    const style = window.getComputedStyle(target);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;
    const rect = target.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) continue;
    if (rect.right < 0 || rect.bottom < 0 || rect.left > window.innerWidth || rect.top > window.innerHeight) continue;
    const preferred = (target.dataset.helpPosition || '').toLowerCase();
    items.push({ target, rect, label, position: preferred });
  }
  items.sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left);
  return items;
}

function positionCallout(callout, connector, rect, preferred, target, placements) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = callout.offsetWidth;
  const height = callout.offsetHeight;
  const allowed = ['right', 'left', 'bottom', 'top'];
  const options = [];
  if (preferred && allowed.includes(preferred)) options.push(preferred);
  for (const dir of allowed) {
    if (!options.includes(dir)) options.push(dir);
  }

  let best = null;
  const inflatedTarget = inflateRect(rect, TARGET_PADDING);

  for (const dir of options) {
    const isVertical = dir === 'right' || dir === 'left';
    const base = basePositionForDirection(dir, rect, width, height);
    const step = isVertical ? height + SHIFT_GAP : width + SHIFT_GAP;
    const offsets = [0];
    for (let i = 1; i <= MAX_SHIFT_STEPS; i++) {
      offsets.push(step * i, -step * i);
    }

    for (const offset of offsets) {
      let candidateLeft = base.left;
      let candidateTop = base.top;
      if (isVertical) candidateTop += offset;
      else candidateLeft += offset;

      const clampedLeft = clamp(candidateLeft, BORDER_PADDING, Math.max(BORDER_PADDING, vw - width - BORDER_PADDING));
      const clampedTop = clamp(candidateTop, BORDER_PADDING, Math.max(BORDER_PADDING, vh - height - BORDER_PADDING));

      const calloutRect = {
        left: clampedLeft,
        top: clampedTop,
        right: clampedLeft + width,
        bottom: clampedTop + height,
      };

      const overlapTargetArea = intersectionArea(calloutRect, inflatedTarget);
      const overlapWithTarget = overlapTargetArea > 0;

      let overlapArea = 0;
      for (const placed of placements) {
        overlapArea += intersectionArea(calloutRect, placed);
      }

      const clampPenalty = Math.abs(clampedLeft - candidateLeft) + Math.abs(clampedTop - candidateTop);
      const offsetPenalty = Math.abs(offset) * 0.05;
      const preferPenalty = dir === preferred ? 0 : 2;

      const score =
        (overlapWithTarget ? overlapTargetArea * 5000 + 1e6 : 0) +
        overlapArea * 200 +
        clampPenalty * 30 +
        offsetPenalty +
        preferPenalty;

      if (!best || score < best.score) {
        best = {
          score,
          dir,
          left: clampedLeft,
          top: clampedTop,
          rect: calloutRect,
          overlapArea,
          overlapWithTarget,
          anchor: anchorForDirection(dir, calloutRect, width, height),
        };
      }

      if (!overlapWithTarget && overlapArea === 0 && clampPenalty === 0 && offset === 0 && dir === preferred) {
        break;
      }
    }
    if (best && best.dir === preferred && best.overlapArea === 0 && !best.overlapWithTarget) {
      break;
    }
  }

  if (!best) {
    return null;
  }

  callout.style.left = `${Math.round(best.left)}px`;
  callout.style.top = `${Math.round(best.top)}px`;
  callout.dataset.position = best.dir;
  callout.classList.remove('arrow-left', 'arrow-right', 'arrow-top', 'arrow-bottom');
  callout.classList.add(`arrow-${best.dir}`);

  const targetCenterX = rect.left + rect.width / 2;
  const targetCenterY = rect.top + rect.height / 2;
  const anchor = best.anchor;
  const dx = targetCenterX - anchor.x;
  const dy = targetCenterY - anchor.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const trimmed = Math.max(distance - 16, 0);
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);

  connector.style.left = `${Math.round(anchor.x)}px`;
  connector.style.top = `${Math.round(anchor.y)}px`;
  connector.style.width = `${Math.round(trimmed)}px`;
  connector.style.transform = `translateY(-50%) rotate(${angle}deg)`;
  connector.dataset.position = best.dir;

  if (target && target.id) {
    connector.dataset.target = target.id;
    callout.dataset.target = target.id;
  } else {
    delete connector.dataset.target;
    delete callout.dataset.target;
  }

  connector.style.visibility = trimmed > 0 ? 'visible' : 'hidden';
  return best.rect;
}

function basePositionForDirection(direction, rect, width, height) {
  switch (direction) {
    case 'left':
      return {
        left: rect.left - CALL_OUT_MARGIN - width,
        top: rect.top + rect.height / 2 - height / 2,
      };
    case 'top':
      return {
        left: rect.left + rect.width / 2 - width / 2,
        top: rect.top - CALL_OUT_MARGIN - height,
      };
    case 'bottom':
      return {
        left: rect.left + rect.width / 2 - width / 2,
        top: rect.bottom + CALL_OUT_MARGIN,
      };
    case 'right':
    default:
      return {
        left: rect.right + CALL_OUT_MARGIN,
        top: rect.top + rect.height / 2 - height / 2,
      };
  }
}

function anchorForDirection(direction, rect, width, height) {
  switch (direction) {
    case 'left':
      return { x: rect.left + width, y: rect.top + height / 2 };
    case 'top':
      return { x: rect.left + width / 2, y: rect.top + height };
    case 'bottom':
      return { x: rect.left + width / 2, y: rect.top };
    case 'right':
    default:
      return { x: rect.left, y: rect.top + height / 2 };
  }
}

function clamp(value, min, max) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
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
