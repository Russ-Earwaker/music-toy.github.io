const overlayState = {
  active: false,
  host: null,
  pending: false,
  observer: null,
  watchers: [],
};

const scheduleUpdateHandler = () => scheduleUpdate();

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

    positionCallout(callout, connector, rect, position, target);
    callout.style.visibility = 'visible';
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

function positionCallout(callout, connector, rect, preferred, target) {
  const margin = 24;
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

  let chosen = 'right';
  const fits = {
    right: rect.right + margin + width <= vw - 12,
    left: rect.left - margin - width >= 12,
    bottom: rect.bottom + margin + height <= vh - 12,
    top: rect.top - margin - height >= 12,
  };
  for (const dir of options) {
    if (fits[dir]) {
      chosen = dir;
      break;
    }
  }

  let left;
  let top;
  switch (chosen) {
    case 'left':
      left = rect.left - margin - width;
      top = rect.top + rect.height / 2 - height / 2;
      break;
    case 'top':
      left = rect.left + rect.width / 2 - width / 2;
      top = rect.top - margin - height;
      break;
    case 'bottom':
      left = rect.left + rect.width / 2 - width / 2;
      top = rect.bottom + margin;
      break;
    case 'right':
    default:
      left = rect.right + margin;
      top = rect.top + rect.height / 2 - height / 2;
      break;
  }

  const minLeft = 12;
  const maxLeft = Math.max(minLeft, vw - width - 12);
  const minTop = 12;
  const maxTop = Math.max(minTop, vh - height - 12);
  left = Math.min(Math.max(left, minLeft), maxLeft);
  top = Math.min(Math.max(top, minTop), maxTop);

  callout.style.left = `${Math.round(left)}px`;
  callout.style.top = `${Math.round(top)}px`;
  callout.dataset.position = chosen;
  callout.classList.remove('arrow-left', 'arrow-right', 'arrow-top', 'arrow-bottom');
  callout.classList.add(`arrow-${chosen}`);

  if (target && target.id) {
    callout.dataset.target = target.id;
  } else {
    delete callout.dataset.target;
  }

  const targetX = rect.left + rect.width / 2;
  const targetY = rect.top + rect.height / 2;

  const calloutRect = {
    left,
    top,
    width,
    height,
  };

  let anchorX;
  let anchorY;
  switch (chosen) {
    case 'left':
      anchorX = calloutRect.left + calloutRect.width;
      anchorY = calloutRect.top + calloutRect.height / 2;
      break;
    case 'top':
      anchorX = calloutRect.left + calloutRect.width / 2;
      anchorY = calloutRect.top + calloutRect.height;
      break;
    case 'bottom':
      anchorX = calloutRect.left + calloutRect.width / 2;
      anchorY = calloutRect.top;
      break;
    case 'right':
    default:
      anchorX = calloutRect.left;
      anchorY = calloutRect.top + calloutRect.height / 2;
      break;
  }

  const dx = targetX - anchorX;
  const dy = targetY - anchorY;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const trim = 16;
  const usable = Math.max(distance - trim, 0);
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);

  connector.style.left = `${Math.round(anchorX)}px`;
  connector.style.top = `${Math.round(anchorY)}px`;
  connector.style.width = `${Math.round(usable)}px`;
  connector.style.transform = `translateY(-50%) rotate(${angle}deg)`;
  connector.dataset.position = chosen;

  if (target && target.id) {
    connector.dataset.target = target.id;
  } else {
    delete connector.dataset.target;
  }

  connector.style.visibility = usable > 0 ? 'visible' : 'hidden';
}

export { setHelpActive, toggleHelp, isHelpActive, refreshHelpOverlay };

try {
  window.HelpOverlay = { setHelpActive, toggleHelp, isHelpActive, refreshHelpOverlay };
} catch (err) {
  // no-op
}
