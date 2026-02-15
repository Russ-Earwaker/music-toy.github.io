import { getRect } from '../layout-cache.js';

const DEFAULT_SPAWN_PADDING = 40;

function pickPositive(...values) {
  for (const value of values) {
    const num = Number(value);
    if (Number.isFinite(num) && num > 0) return num;
  }
  return 1;
}

export function getVisualExtents(panel) {
  const panelWidth = panel.offsetWidth;
  const panelHeight = panel.offsetHeight;
  let minX = 0;
  let maxX = panelWidth;
  let minY = 0;
  let maxY = panelHeight;

  const toyKind = panel.dataset.toy;
  const hasExternalButtons = ['loopgrid', 'loopgrid-drum', 'bouncer', 'rippler', 'chordwheel', 'drawgrid'].includes(toyKind);

  if (hasExternalButtons) {
    const externalButtons = panel.querySelectorAll(':scope > .toy-mode-btn');
    externalButtons.forEach((btn) => {
      const btnSize = parseFloat(btn.style.getPropertyValue('--c-btn-size')) || 0;
      const btnLeft = btn.style.left ? parseFloat(btn.style.left) : null;
      const btnTop = parseFloat(btn.style.top) || 0;
      if (Number.isFinite(btnLeft)) {
        const btnRight = btnLeft + btnSize;
        if (btnLeft < minX) minX = btnLeft;
        if (btnRight > maxX) maxX = btnRight;
      }
      const btnBottom = btnTop + btnSize;
      if (btnTop < minY) minY = btnTop;
      if (btnBottom > maxY) maxY = btnBottom;
    });
  }

  return { left: minX, right: maxX, top: minY, bottom: maxY };
}

function getPanelLocalExtents(panel, { fallbackWidth, fallbackHeight } = {}) {
  let extents = null;
  try {
    extents = getVisualExtents(panel);
  } catch {
    extents = null;
  }
  const rect = getRect(panel);

  const fallbackWidthValue = pickPositive(
    fallbackWidth,
    panel.offsetWidth,
    rect?.width,
    parseFloat(panel.style.width),
    380
  );
  const fallbackHeightValue = pickPositive(
    fallbackHeight,
    panel.offsetHeight,
    rect?.height,
    parseFloat(panel.style.height),
    320
  );

  let localLeft = Number.isFinite(extents?.left) ? extents.left : 0;
  let localTop = Number.isFinite(extents?.top) ? extents.top : 0;
  let localRight = Number.isFinite(extents?.right) ? extents.right : localLeft + fallbackWidthValue;
  let localBottom = Number.isFinite(extents?.bottom) ? extents.bottom : localTop + fallbackHeightValue;

  if (!Number.isFinite(localRight)) localRight = localLeft + fallbackWidthValue;
  if (!Number.isFinite(localBottom)) localBottom = localTop + fallbackHeightValue;

  const width = Math.max(1, localRight - localLeft);
  const height = Math.max(1, localBottom - localTop);

  return { left: localLeft, top: localTop, right: localRight, bottom: localBottom, width, height };
}

function getPanelPosition(panel) {
  const styleLeft = parseFloat(panel.style.left);
  const styleTop = parseFloat(panel.style.top);
  if (Number.isFinite(styleLeft) && Number.isFinite(styleTop)) {
    return { left: styleLeft, top: styleTop };
  }
  const fallbackLeft = Number.isFinite(styleLeft) ? styleLeft : panel.offsetLeft;
  const fallbackTop = Number.isFinite(styleTop) ? styleTop : panel.offsetTop;
  if (Number.isFinite(fallbackLeft) && Number.isFinite(fallbackTop)) {
    return { left: fallbackLeft, top: fallbackTop };
  }
  const panelRect = getRect(panel);
  const parentRect = getRect(panel.parentElement);
  if (panelRect && parentRect) {
    return {
      left: panelRect.left - parentRect.left,
      top: panelRect.top - parentRect.top,
    };
  }
  return { left: 0, top: 0 };
}

function buildBoundsFromLocal(local, left, top, padding = 0) {
  return {
    left: left + local.left - padding,
    right: left + local.right + padding,
    top: top + local.top - padding,
    bottom: top + local.bottom + padding,
  };
}

function boundsOverlap(a, b) {
  return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
}

export function ensurePanelSpawnPlacement(panel, {
  baseLeft,
  baseTop,
  fallbackWidth,
  fallbackHeight,
  skipIfMoved = false,
  padding = DEFAULT_SPAWN_PADDING,
  maxAttempts = 400,
  panelsSelector = ':scope > .toy-panel, :scope > .art-toy-panel',
} = {}) {
  if (!panel?.isConnected) return null;
  const board = panel.parentElement;
  if (!board) return null;

  void panel.offsetWidth;

  const currentPos = getPanelPosition(panel);
  const basePosition = {
    left: Number.isFinite(baseLeft) ? baseLeft : currentPos.left,
    top: Number.isFinite(baseTop) ? baseTop : currentPos.top,
  };

  if (skipIfMoved) {
    const storedLeft = Number(panel.dataset.spawnAutoLeft);
    const storedTop = Number(panel.dataset.spawnAutoTop);
    if (Number.isFinite(storedLeft) && Number.isFinite(storedTop)) {
      const deltaLeft = Math.abs(currentPos.left - storedLeft);
      const deltaTop = Math.abs(currentPos.top - storedTop);
      if (deltaLeft > 1 || deltaTop > 1) {
        return { left: currentPos.left, top: currentPos.top, changed: false, skipped: true };
      }
    }
  }

  const localExtents = getPanelLocalExtents(panel, { fallbackWidth, fallbackHeight });
  const existingBounds = Array.from(board.querySelectorAll(panelsSelector))
    .filter(other => other !== panel)
    .map((other) => {
      const otherPos = getPanelPosition(other);
      const otherLocal = getPanelLocalExtents(other);
      return buildBoundsFromLocal(otherLocal, otherPos.left, otherPos.top, padding);
    })
    .filter(Boolean);

  const overlapsAt = (left, top) => {
    const bounds = buildBoundsFromLocal(localExtents, left, top, padding);
    return existingBounds.some(other => boundsOverlap(bounds, other));
  };

  let candidateLeft = basePosition.left;
  let candidateTop = basePosition.top;

  if (!overlapsAt(candidateLeft, candidateTop)) {
    const changed = Math.abs(candidateLeft - currentPos.left) > 1 || Math.abs(candidateTop - currentPos.top) > 1;
    if (changed) {
      panel.style.left = `${Math.round(candidateLeft)}px`;
      panel.style.top = `${Math.round(candidateTop)}px`;
    }
    panel.dataset.spawnAutoManaged = 'true';
    panel.dataset.spawnAutoLeft = String(Math.round(candidateLeft));
    panel.dataset.spawnAutoTop = String(Math.round(candidateTop));
    return { left: candidateLeft, top: candidateTop, changed };
  }

  const stepX = Math.max(48, Math.round(localExtents.width / 2));
  const stepY = Math.max(48, Math.round(localExtents.height / 2));
  const halfStepX = Math.max(32, Math.round(stepX / 2));
  const halfStepY = Math.max(32, Math.round(stepY / 2));

  const queue = [];
  const visited = new Set();

  const enqueue = (left, top) => {
    const qLeft = Math.round(left);
    const qTop = Math.round(top);
    const key = `${qLeft}|${qTop}`;
    if (!visited.has(key)) {
      visited.add(key);
      queue.push({ left: qLeft, top: qTop });
    }
  };

  enqueue(candidateLeft, candidateTop);

  let best = null;
  let iterations = 0;

  while (queue.length && iterations < maxAttempts) {
    iterations++;
    const current = queue.shift();
    const hasCollision = overlapsAt(current.left, current.top);
    if (!hasCollision) {
      best = current;
      break;
    }

    const neighbors = [
      [current.left + stepX, current.top],
      [current.left - stepX, current.top],
      [current.left, current.top + stepY],
      [current.left, current.top - stepY],
      [current.left + stepX, current.top + stepY],
      [current.left - stepX, current.top + stepY],
      [current.left + halfStepX, current.top],
      [current.left - halfStepX, current.top],
      [current.left, current.top + halfStepY],
      [current.left, current.top - halfStepY],
    ];
    for (const [nx, ny] of neighbors) enqueue(nx, ny);
  }

  if (best) {
    panel.style.left = `${Math.round(best.left)}px`;
    panel.style.top = `${Math.round(best.top)}px`;
    panel.dataset.spawnAutoManaged = 'true';
    panel.dataset.spawnAutoLeft = String(Math.round(best.left));
    panel.dataset.spawnAutoTop = String(Math.round(best.top));
    return { left: best.left, top: best.top, changed: true };
  }

  panel.dataset.spawnAutoManaged = 'true';
  panel.dataset.spawnAutoLeft = String(Math.round(currentPos.left));
  panel.dataset.spawnAutoTop = String(Math.round(currentPos.top));
  return { left: currentPos.left, top: currentPos.top, changed: false };
}

function getSpawnSafeCenterFracX() {
  const guide = document.querySelector('.guide-launcher');
  const spawner = document.querySelector('.toy-spawner-dock');
  const guideRight = guide ? getRect(guide).right : 0;
  const spawnerLeft = spawner ? getRect(spawner).left : window.innerWidth;
  const centerX = (guideRight + spawnerLeft) / 2;
  const frac = centerX / Math.max(1, window.innerWidth || 1);
  return Math.max(0.2, Math.min(0.8, frac));
}

export function panToSpawnedPanel(panel, { duration = 650 } = {}) {
  if (!panel || !panel.isConnected) return false;
  const desiredScale = (typeof window !== 'undefined' && Number.isFinite(window.__boardScale)) ? window.__boardScale : 1.0;
  const centerFracX = getSpawnSafeCenterFracX();
  try {
    window.centerBoardOnElementSlow?.(panel, desiredScale, { duration, centerFracX, centerFracY: 0.5 });
    return true;
  } catch {}
  return false;
}
