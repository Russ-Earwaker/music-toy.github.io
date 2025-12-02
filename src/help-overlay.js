const overlayState = {
  active: false,
  host: null,
  pending: false,
  observer: null,
  watchers: [],
  cache: new WeakMap(),
  advBaseline: null,
  debugSeen: new Set(),
  lastScale: null,
  shouldLog: false,
  overlayReadyFired: false,
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
  const prev = overlayState.active;
  overlayState.active = next;
  overlayState.overlayReadyFired = false;
  const detail = { active: overlayState.active, previous: prev };
  try { window.dispatchEvent(new CustomEvent('help:toggle', { detail })); } catch {}
  if (overlayState.active) {
    try { window.dispatchEvent(new CustomEvent('help:open', { detail })); } catch {}
  } else {
    try { window.dispatchEvent(new CustomEvent('help:close', { detail })); } catch {}
  }
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

// Hide help when starting a new scene to avoid stale overlays.
window.addEventListener('scene:new', () => {
  setHelpActive(false);
});

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

  // Preserve the existing Controls callout so its animations aren't reset on rerender.
  const existingControls = host.querySelector('.toy-help-controls');
  const preservedTutorialClasses = existingControls
    ? Array.from(existingControls.classList).filter((cls) => cls.startsWith('tutorial-'))
    : [];

  // Remove everything except the Controls callout to avoid restarting its animations.
  Array.from(host.children).forEach((child) => {
    if (child !== existingControls) host.removeChild(child);
  });

  // Reset per-render debug set to limit logs
  overlayState.debugSeen = new Set();
  const entries = gatherTargets();
  
  // Always render the controls help, even if there are no other labels.
  // Reuse the existing element when possible to avoid restarting animations.
  let controlsLabel = existingControls;
  if (!controlsLabel) {
    controlsLabel = renderControlsHelp(host);
  } else if (controlsLabel.parentNode !== host) {
    host.appendChild(controlsLabel);
  }

  if (controlsLabel instanceof HTMLElement) {
    // Reapply any tutorial highlight classes that were present before the rerender (in case we rebuilt).
    if (preservedTutorialClasses.length) {
      preservedTutorialClasses.forEach((cls) => controlsLabel.classList.add(cls));
    }

    const rect = controlsLabel.getBoundingClientRect();
    const ready =
      rect.width > 0 &&
      rect.height > 0 &&
      Number.isFinite(rect.x) &&
      Number.isFinite(rect.y);

    console.debug('[help-overlay] controls label rect', {
      x: rect.x,
      y: rect.y,
      w: rect.width,
      h: rect.height,
      ready,
      alreadyFired: overlayState.overlayReadyFired,
    });

    if (ready && !overlayState.overlayReadyFired) {
      overlayState.overlayReadyFired = true;

      // Fire on the next frame so any CSS transforms/relayout are fully applied.
      requestAnimationFrame(() => {
        try {
          window.dispatchEvent(
            new CustomEvent('help:overlay-ready', {
              detail: { rect },
            })
          );
          console.debug('[help-overlay] dispatched help:overlay-ready');
        } catch (err) {
          console.debug('[help-overlay] failed to dispatch help:overlay-ready', err);
        }
      });
    } else if (!ready) {
      console.debug('[help-overlay] controls label not ready yet');
    }
  } else {
    console.debug('[help-overlay] no .toy-help-controls found');
  }

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
    // Enforce solid line (no gradient) regardless of external CSS
    connector.style.background = 'rgba(95, 179, 255, 0.95)';
    connector.style.boxShadow = 'none';
    connector.style.opacity = '1';

    host.append(callout, connector);

    const widthPx = callout.offsetWidth || 220;
    const heightPx = callout.offsetHeight || 60;
    entry.widthPx = widthPx;
    entry.heightPx = heightPx;
    // Use local units for layout when board is scaled, so centering math is correct
    if (entry.metrics) {
      entry.width = widthPx / entry.metrics.scale;
      entry.height = heightPx / entry.metrics.scale;
    } else {
      entry.width = widthPx;
      entry.height = heightPx;
    }
    return { callout, connector };
  });

  // Align other top labels to the height of "Advanced Controls", scoped to its group and coordinate system
  overlayState.advBaseline = null;
  const advEntry = entries.find((e) => e.label && e.label.includes('Advanced Controls'));
  if (advEntry) {
    const advBase = basePositionForDirection('top', advEntry.rect, advEntry.width, advEntry.height, BASE_MARGIN);
    overlayState.advBaseline = {
      top: advBase.top,
      group: advEntry.group,
      boardRef: advEntry.metrics ? advEntry.metrics.board : null,
    };
  }

  const layout = tryLayout(entries, BASE_GAP, true);
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
    // For tutorial, show labels for locked (but not explicitly hidden) buttons
    const isTutorialLocked = target.classList.contains('tutorial-control-locked');
    if (!isTutorialLocked && (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')) continue;

    const rectScreen = target.getBoundingClientRect();
    if (rectScreen.width < 1 || rectScreen.height < 1) continue;

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

    items.push({
      target,
      label,
      helpPosition: (target.dataset.helpPosition || '').toLowerCase(),
      allowedDirections: ['top', 'bottom', 'left', 'right'],
      group,
      rect: rectLocal,
      rectScreen,
      metrics,
      width: 0,
      height: 0,
    });
  }

  // Simple sort by label name for consistency
  items.sort((a, b) => a.label.localeCompare(b.label));
  return items;
}

function getBoardMetrics(board) {
  const rect = board.getBoundingClientRect();
  const scale = extractScale(board);
  // Only log on scale changes
  const prev = overlayState.lastScale;
  const changed = prev === null || Math.abs(scale - prev) > 0.001;
  overlayState.shouldLog = !!changed;
  if (changed) {
    overlayState.lastScale = scale;
    try {
      const tf = (window.getComputedStyle(board).transform || 'none');
      if (window.__TUTORIAL_STREAM_DEBUG) {
        console.log(`Board scale detected: ${scale} from transform: ${tf}`);
      }
    } catch {}
  }
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
  const results = [];
  for (const entry of entries) {
    const placement = placeEntry(entry, [], gap, null, allowOverlap);
    if (!placement) return null;
    results.push(placement);
  }
  return results;
}

// Fixed position mappings for consistent label placement across all toys
// Based on actual toyui.js positioning:
// - Advanced Controls: External button at headerHeight-40px, left -48px
// - Random/Clear: Directly above their target buttons
// - Choose Instrument: Directly above its target button
// - Volume controls: Directly below their targets in footer
const LABEL_POSITIONS = {
  // keys are lowercase, we compare case-insensitively
  'advanced controls': { dir: 'top', offsetX: -48, offsetY: -40 },
  'exit advanced controls': { dir: 'top', offsetX: -48, offsetY: -40 },
  'clear': { dir: 'top', offsetX: 12, offsetY: -BASE_MARGIN },
  'random': { dir: 'top', offsetX: 0, offsetY: -BASE_MARGIN },
  'randomize': { dir: 'top', offsetX: 0, offsetY: -BASE_MARGIN },
  'randomize notes': { dir: 'top', offsetX: 0, offsetY: -BASE_MARGIN },
  'randomize blocks': { dir: 'top', offsetX: 0, offsetY: -BASE_MARGIN },
  'choose instrument': { dir: 'top', offsetX: 0, offsetY: -BASE_MARGIN },
  'main menu': { dir: 'right', offsetX: 26, offsetY: 0 },
  'guide': { dir: 'right', offsetX: 38, offsetY: -70 },
  'goal select menu': { dir: 'right', offsetX: 32, offsetY: 0 },
  'toggle play/pause': { dir: 'bottom', offsetX: 0, offsetY: 30 },
  'mute': { dir: 'bottom', offsetX: 0, offsetY: 15 },
  'adjust volume': { dir: 'bottom', offsetX: 0, offsetY: 15 },
  // Spawner buttons
  'open the add toy menu': { dir: 'left', offsetX: -25, offsetY: 0 },
  'drag a toy here to delete it': { dir: 'left', offsetX: -25, offsetY: 0 },
  'toggle overview mode': { dir: 'left', offsetX: -25, offsetY: 0 },
  'toggle help labels': { dir: 'left', offsetX: -25, offsetY: 0 },
};

function placeEntry(entry, assigned, gap, cachedPlacement, allowOverlap) {
  const width = entry.width;
  const height = entry.height;
  const label = entry.label;

  const targetRect = entry.rect;
  const targetCenterX = targetRect.left + (targetRect.right - targetRect.left) / 2;
  
  // Find matching position config (case-insensitive)
  let positionConfig = null;
  const lower = label.toLowerCase();
  for (const [labelKey, config] of Object.entries(LABEL_POSITIONS)) {
    if (lower.includes(labelKey)) {
      positionConfig = config;
      break;
    }
  }
  
  // Default fallback if no specific config found
  if (!positionConfig) {
    positionConfig = { dir: entry.helpPosition || 'top', offsetX: 0, offsetY: (entry.helpPosition === 'bottom' ? 15 : -BASE_MARGIN) };
  }

  const dir = positionConfig.dir || entry.helpPosition || 'top';
  let base;

  // Special handling for volume controls - position below their specific targets,
  // but never above the footer
  if (lower.includes('adjust volume') || lower.includes('mute')) {
    const footer = entry.target.closest('.toy-footer');
    let footerRect = null;
    if (footer) {
      const footerScreen = footer.getBoundingClientRect();
      if (entry.metrics) {
        footerRect = {
          left: (footerScreen.left - entry.metrics.rect.left) / entry.metrics.scale,
          top: (footerScreen.top - entry.metrics.rect.top) / entry.metrics.scale,
          right: (footerScreen.right - entry.metrics.rect.left) / entry.metrics.scale,
          bottom: (footerScreen.bottom - entry.metrics.rect.top) / entry.metrics.scale,
        };
      } else {
        footerRect = {
          left: footerScreen.left,
          top: footerScreen.top,
          right: footerScreen.right,
          bottom: footerScreen.bottom,
        };
      }
    }

    const below = Math.max(targetRect.bottom, footerRect ? footerRect.bottom : targetRect.bottom);
    base = {
      left: targetCenterX - width / 2 + positionConfig.offsetX,
      top: below + positionConfig.offsetY,
    };

    // Minimal debug (once per render per label, only on zoom changes)
    const key = `${label}::vol`;
    if (overlayState.shouldLog && !overlayState.debugSeen.has(key)) {
      console.log(`[${label}] target+footer-based: base=${base.left},${base.top}`);
      overlayState.debugSeen.add(key);
    }
  } else if (dir === 'bottom') {
    base = {
      left: targetCenterX - width / 2 + positionConfig.offsetX,
      top: targetRect.bottom + positionConfig.offsetY
    };
  } else if (dir === 'right') {
    base = {
      left: targetRect.right + positionConfig.offsetX,
      top: targetRect.top + (targetRect.bottom - targetRect.top) / 2 - height / 2 + positionConfig.offsetY
    };
  } else if (dir === 'left') {
    base = {
      left: targetRect.left - width + positionConfig.offsetX,
      top: targetRect.top + (targetRect.bottom - targetRect.top) / 2 - height / 2 + positionConfig.offsetY
    };
  } else {
    // Top direction
    base = {
      left: targetCenterX - width / 2 + positionConfig.offsetX,
      top: targetRect.top + positionConfig.offsetY - height
    };
  }

  // Apply baseline alignment for same group/coordinate system (only for top labels)
  // Advanced Controls is external and higher, so align other top labels to its level
  const bl = overlayState.advBaseline;
  if (dir === 'top' && bl && entry.group === bl.group && ((entry.metrics && entry.metrics.board) || null) === bl.boardRef) {
    // Advanced Controls uses -40px offset, others use -BASE_MARGIN, so adjust
    if (!label.includes('Advanced Controls')) {
      base.top = bl.top + (BASE_MARGIN - 40); // Align to Advanced Controls level
    }
  }

  const candidate = buildCandidate(base, width, height, false, 0);
  
  return { dir, rect: candidate, offset: 0, vertical: false, fixed: true };
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

  // Use simple screen coordinate positioning - no complex transforms
  let screenLeft, screenTop;
  
  if (metrics) {
    const { rect: boardRect, scale } = metrics;
    const localLeft = rect.left;
    const localTop = rect.top;
    // Position at board origin, then translate by scaled local coords, then scale
    callout.style.left = `${boardRect.left}px`;
    callout.style.top = `${boardRect.top}px`;
    callout.style.transform = `translate(${localLeft * scale}px, ${localTop * scale}px) scale(${scale})`;
    callout.style.transformOrigin = '0 0';
    
    // For anchor computations
    screenLeft = boardRect.left + localLeft * scale;
    screenTop = boardRect.top + localTop * scale;

    // Debug scaling issues (once per label per render, only on zoom changes)
    const dbgKey = `${entry.label}::scaled`;
    if (overlayState.shouldLog && (entry.label.includes('Random') || entry.label.toLowerCase().includes('adjust volume')) && !overlayState.debugSeen.has(dbgKey)) {
      if (window.__TUTORIAL_STREAM_DEBUG) {
        console.log(`[${entry.label}] Scale=${scale}, BoardRect=${boardRect.left},${boardRect.top}, LocalRect=${rect.left},${rect.top}, Final=${screenLeft},${screenTop}`);
      }
      overlayState.debugSeen.add(dbgKey);
    }
  } else {
    screenLeft = rect.left;
    screenTop = rect.top;
    
    callout.style.left = `${screenLeft}px`;
    callout.style.top = `${screenTop}px`;
    callout.style.transform = '';
    callout.style.transformOrigin = '';
    
    // Debug non-scaled positioning (once per label per render, only on zoom changes)
    const dbgKey2 = `${entry.label}::noscale`;
    if (overlayState.shouldLog && entry.label.toLowerCase().includes('adjust volume') && !overlayState.debugSeen.has(dbgKey2)) {
      if (window.__TUTORIAL_STREAM_DEBUG) {
        console.log(`[${entry.label}] Non-scaled: ${screenLeft},${screenTop}`);
      }
      overlayState.debugSeen.add(dbgKey2);
    }
  }

  // Compute callout anchor directly from the scaled visual box to avoid drift
  const scaleForLine = metrics ? metrics.scale : 1;
  const visualW = entry.widthPx * scaleForLine;
  const visualH = entry.heightPx * scaleForLine;

  let anchorScreenX, anchorScreenY;
  switch (dir) {
    case 'left':
      anchorScreenX = screenLeft + visualW;
      anchorScreenY = screenTop + visualH / 2;
      break;
    case 'right':
      anchorScreenX = screenLeft;
      anchorScreenY = screenTop + visualH / 2;
      break;
    case 'top':
      anchorScreenX = screenLeft + visualW / 2;
      anchorScreenY = screenTop + visualH;
      break;
    case 'bottom':
    default:
      anchorScreenX = screenLeft + visualW / 2;
      anchorScreenY = screenTop;
      break;
  }

  // Compute target anchor in screen space (converted if needed)
  const targetAnchor = getTargetAnchor(dir, entry.rect);
  let targetScreenX, targetScreenY;
  if (metrics) {
    const { rect: boardRect, scale } = metrics;
    targetScreenX = boardRect.left + targetAnchor.x * scale;
    targetScreenY = boardRect.top + targetAnchor.y * scale;
  } else {
    targetScreenX = targetAnchor.x;
    targetScreenY = targetAnchor.y;
  }

  const dx = targetScreenX - anchorScreenX;
  const dy = targetScreenY - anchorScreenY;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const trimmed = Math.max(distance - 16 * scaleForLine, 0); // Scale the trim distance
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);

  connector.dataset.position = dir;
  connector.style.visibility = trimmed > 0 ? 'visible' : 'hidden';
  connector.style.transform = `translate(${anchorScreenX}px, ${anchorScreenY}px) rotate(${angle}deg)`;
  connector.style.width = `${Math.max(0, Math.round(trimmed))}px`;
  connector.style.height = `${Math.max(2 * scaleForLine, 1)}px`; // Scale connector height

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

function renderControlsHelp(host) {
  const helpBox = document.createElement('div');
  helpBox.className = 'toy-help-callout toy-help-controls';
  const isMobile = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

  let content = '';
  if (isMobile) {
    content = `
      <strong>Controls:</strong>
      <ul>
        <li><strong>Pan:</strong> Drag with one finger</li>
        <li><strong>Zoom:</strong> Pinch with two fingers</li>
      </ul>
    `;
  } else {
    content = `
      <strong>Controls:</strong>
      <ul>
        <li><strong>Pan:</strong> Left-click and drag</li>
        <li><strong>Zoom:</strong> Scroll wheel</li>
      </ul>
    `;
  }
  helpBox.innerHTML = content;

  // Pin the controls callout so it has a stable rect and doesn't jump during layout.
  helpBox.style.position = 'absolute';
  helpBox.style.right = '32px';
  helpBox.style.bottom = '32px';
  helpBox.style.maxWidth = '260px';

  host.appendChild(helpBox);
  return helpBox;
}

export { setHelpActive, toggleHelp, isHelpActive, refreshHelpOverlay };

try {
  window.HelpOverlay = { setHelpActive, toggleHelp, isHelpActive, refreshHelpOverlay };
} catch (err) {
  // no-op
}




