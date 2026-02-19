// src/art/art-toy-factory.js
// Art toy factory (flash circle + fireworks + laser trails).

import {
  createBaseArtToyPanel,
  ensureBaseArtToyUI,
  getBaseArtToyControlsHost,
  getBaseArtToyVolumeHost,
  setBaseArtToyControlsVisible,
} from './base-art-toy.js';
import { ensurePanelSpawnPlacement, panToSpawnedPanel } from '../baseToy/spawn-placement.js';
import { installVolumeUI } from '../baseToy/volume-ui.js';
import { createArtLineThicknessControl } from './art-line-thickness-control.js';
import { createArtHueSatPicker } from './art-hue-sat-picker.js';
import { createArtDrawingState } from './art-drawing-state.js';

const ART_TYPES = Object.freeze({
  FLASH_CIRCLE: 'flashCircle',
  FIREWORKS: 'fireworks',
  LASER_TRAILS: 'laserTrails',
  STICKER: 'sticker',
});

const ART_SLOT_COUNT = 8;

// Match the custom circular button structure used by music toys / toy spawner.
const BUTTON_ICON_HTML = '<div class="c-btn-outer"></div><div class="c-btn-glow"></div><div class="c-btn-core"></div>';

function artFlashDebugEnabled() {
  try { if (window.__MT_DEBUG_ART_FLASH === true) return true; } catch {}
  try { if (localStorage.getItem('MT_DEBUG_ART_FLASH') === '1') return true; } catch {}
  return false;
}

function artFlashDbg(tag, payload = {}) {
  if (!artFlashDebugEnabled()) return;
  try { console.log(`[ART][flash] ${tag}`, payload); } catch {}
}

function markSceneDirtySafe() {
  try { window.Persistence?.markDirty?.(); } catch {}
}

function normalizeSlot(slotIndex) {
  const n = Number(slotIndex);
  if (!Number.isFinite(n)) return 0;
  const i = Math.trunc(n);
  if (i < 0) return 0;
  return i % ART_SLOT_COUNT;
}

function resolveSpawnPlacement(board, centerX, centerY, size) {
  let cx = centerX;
  let cy = centerY;
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) {
    cx = (board.offsetWidth || 0) * 0.5;
    cy = (board.offsetHeight || 0) * 0.5;
  }

  const jitter = () => (Math.random() - 0.5) * 18;
  const spawnOffsetX = size * 0.65;
  const spawnOffsetY = -size * 0.18;

  return {
    left: Math.max(0, cx - size * 0.5 + spawnOffsetX + jitter()),
    top: Math.max(0, cy - size * 0.5 + spawnOffsetY + jitter()),
  };
}

function attachSlotHandleDrag({
  handleBtn,
  layer,
  panelPx = 220,
  getStartPos,
  setPos,
  clampX,
  clampY,
  onDragStateChange,
  onCommit,
  onTap,
} = {}) {
  if (!handleBtn || !layer || typeof getStartPos !== 'function' || typeof setPos !== 'function') return;
  let dragActive = false;
  let dragPointerId = null;
  let startClientX = 0;
  let startClientY = 0;
  let startX = 0;
  let startY = 0;
  let moved = false;

  handleBtn.addEventListener('pointerdown', (ev) => {
    if (ev.button != null && ev.button !== 0) return;
    ev.preventDefault();
    ev.stopPropagation();
    const start = getStartPos() || { x: 0, y: 0 };
    dragActive = true;
    dragPointerId = ev.pointerId;
    startClientX = ev.clientX;
    startClientY = ev.clientY;
    startX = Number(start.x) || 0;
    startY = Number(start.y) || 0;
    moved = false;
    try { onDragStateChange?.(true); } catch {}
    try { handleBtn.setPointerCapture(ev.pointerId); } catch {}
  });

  handleBtn.addEventListener('pointermove', (ev) => {
    if (!dragActive) return;
    if (dragPointerId != null && ev.pointerId !== dragPointerId) return;
    ev.preventDefault();
    ev.stopPropagation();
    const rect = layer.getBoundingClientRect();
    if (!rect || rect.width < 1 || rect.height < 1) return;
    const dx = ((ev.clientX - startClientX) / rect.width) * panelPx;
    const dy = ((ev.clientY - startClientY) / rect.height) * panelPx;
    const nx = typeof clampX === 'function' ? clampX(startX + dx) : (startX + dx);
    const ny = typeof clampY === 'function' ? clampY(startY + dy) : (startY + dy);
    moved = moved || Math.abs(nx - startX) > 0.0001 || Math.abs(ny - startY) > 0.0001;
    setPos(nx, ny);
  });

  const endDrag = (ev) => {
    if (!dragActive) return;
    if (dragPointerId != null && ev.pointerId !== dragPointerId) return;
    ev.preventDefault();
    ev.stopPropagation();
    dragActive = false;
    dragPointerId = null;
    try { onDragStateChange?.(false); } catch {}
    try { handleBtn.releasePointerCapture(ev.pointerId); } catch {}
    if (moved) {
      try { onCommit?.(); } catch {}
    } else {
      try { onTap?.(); } catch {}
    }
  };

  handleBtn.addEventListener('pointerup', endDrag);
  handleBtn.addEventListener('pointercancel', endDrag);
}

function installArtToyControls(panel) {
  const controlsHost = getBaseArtToyControlsHost(panel);
  if (!controlsHost) return;

  const clearBtn = document.createElement('button');
  clearBtn.className = 'art-toy-btn art-toy-clear-btn c-btn';
  clearBtn.type = 'button';
  clearBtn.setAttribute('aria-label', 'Reset this Art Toy');
  clearBtn.title = 'Clear';
  clearBtn.innerHTML = BUTTON_ICON_HTML;
  const clearCore = clearBtn.querySelector('.c-btn-core');
  if (clearCore) clearCore.style.setProperty('--c-btn-icon-url', "url('./assets/UI/T_ButtonClear.png')");
  clearBtn.style.setProperty('--c-btn-size', '62px');
  clearBtn.style.setProperty('--accent', '#f87171');
  clearBtn.style.order = '99';
  clearBtn.dataset.action = 'artToy:clear';
  clearBtn.dataset.artToyId = panel.id;
  controlsHost.appendChild(clearBtn);

  const enterBtn = document.createElement('button');
  enterBtn.className = 'art-toy-btn art-toy-enter-btn c-btn';
  enterBtn.type = 'button';
  enterBtn.setAttribute('aria-label', 'Enter this Art Toy');
  enterBtn.title = 'Enter';
  enterBtn.innerHTML = BUTTON_ICON_HTML;
  const enterCore = enterBtn.querySelector('.c-btn-core');
  if (enterCore) enterCore.style.setProperty('--c-btn-icon-url', "url('./assets/UI/T_ButtonEnter.png')");
  enterBtn.style.setProperty('--c-btn-size', '62px');
  enterBtn.dataset.action = 'artToy:music';
  enterBtn.dataset.artToyId = panel.id;
  controlsHost.appendChild(enterBtn);

  const randAllBtn = document.createElement('button');
  randAllBtn.className = 'art-toy-btn art-toy-rand-all-btn c-btn';
  randAllBtn.type = 'button';
  randAllBtn.setAttribute('aria-label', 'Randomize this Art Toy');
  randAllBtn.title = 'Random';
  randAllBtn.innerHTML = BUTTON_ICON_HTML;
  const randAllCore = randAllBtn.querySelector('.c-btn-core');
  if (randAllCore) randAllCore.style.setProperty('--c-btn-icon-url', "url('./assets/UI/T_ButtonRandom.png')");
  randAllBtn.style.setProperty('--c-btn-size', '62px');
  randAllBtn.dataset.action = 'artToy:randomAll';
  randAllBtn.dataset.artToyId = panel.id;
  controlsHost.appendChild(randAllBtn);

  const randMusicBtn = document.createElement('button');
  randMusicBtn.className = 'art-toy-btn art-toy-rand-music-btn c-btn';
  randMusicBtn.type = 'button';
  randMusicBtn.setAttribute('aria-label', 'Randomize Art Toy Music');
  randMusicBtn.title = 'Random Music';
  randMusicBtn.innerHTML = BUTTON_ICON_HTML;
  const randMusicCore = randMusicBtn.querySelector('.c-btn-core');
  if (randMusicCore) randMusicCore.style.setProperty('--c-btn-icon-url', "url('./assets/UI/T_ButtonRandomNotes.png')");
  randMusicBtn.style.setProperty('--c-btn-size', '62px');
  randMusicBtn.dataset.action = 'artToy:randomMusic';
  randMusicBtn.dataset.artToyId = panel.id;
  controlsHost.appendChild(randMusicBtn);

  // Fireworks + Light Paths + Sticker: current effect preview + picker grid.
  if (
    panel?.dataset?.artToy === ART_TYPES.FIREWORKS
    || panel?.dataset?.artToy === ART_TYPES.LASER_TRAILS
    || panel?.dataset?.artToy === ART_TYPES.STICKER
  ) {
    const fxShell = document.createElement('div');
    fxShell.className = 'art-toy-fx-shell';
    fxShell.dataset.open = '0';
    fxShell.dataset.artToyId = panel.id;
    fxShell.style.order = '100';

    const fxCurrent = document.createElement('button');
    fxCurrent.type = 'button';
    fxCurrent.className = 'art-toy-fx-current';
    fxCurrent.setAttribute('aria-label', 'Choose art effect');
    fxCurrent.setAttribute('aria-haspopup', 'false');
    fxCurrent.setAttribute('aria-expanded', 'true');
    fxCurrent.tabIndex = -1;
    fxCurrent.title = 'Current Effect';

    const fxStage = document.createElement('span');
    fxStage.className = 'art-toy-fx-stage art-toy-fx-stage-current';
    fxCurrent.appendChild(fxStage);
    fxShell.appendChild(fxCurrent);

    const fxGrid = document.createElement('div');
    fxGrid.className = 'art-toy-fx-grid';
    fxGrid.hidden = false;
    fxShell.appendChild(fxGrid);

    controlsHost.appendChild(fxShell);
  }
}

function makePanelBase(type, opts = {}) {
  const { containerEl, artOwnerId } = opts;
  let { centerX, centerY } = opts;
  void artOwnerId; // compatibility with internal spawning options.

  const board = containerEl || document.getElementById('board');
  if (!board) return null;

  const size = 220;
  const pos = resolveSpawnPlacement(board, centerX, centerY, size);

  const panel = createBaseArtToyPanel({
    kind: type,
    size,
    left: pos.left,
    top: pos.top,
    idPrefix: 'art',
  });
  ensureBaseArtToyUI(panel, { artToyId: panel.id });
  installArtToyControls(panel);
  const volumeHost = getBaseArtToyVolumeHost(panel);
  if (volumeHost) {
    try { installVolumeUI(volumeHost, { panel }); } catch {}
  }
  if (opts.showControlsOnSpawn !== false) {
    setBaseArtToyControlsVisible(panel, true);
  }
  board.appendChild(panel);
  ensurePanelSpawnPlacement(panel, {
    baseLeft: pos.left,
    baseTop: pos.top,
    fallbackWidth: size,
    fallbackHeight: size,
  });
  if (opts.autoCenter) {
    panToSpawnedPanel(panel, { duration: 650 });
  }

  try {
    if (window.__MT_DEBUG_ART_SPAWN) {
      console.log('[ArtToyFactory] create', type, {
        id: panel.id,
        left: pos.left,
        top: pos.top,
        container: board.id || board.className || board.tagName,
      });
    }
  } catch {}

  return panel;
}

function setupFlashCircle(panel) {
  const circle = document.createElement('div');
  circle.className = 'art-toy-circle';
  panel.appendChild(circle);

  let flashClearTimer = 0;
  const clearFlashClass = () => {
    try { panel.classList.remove('flash'); } catch {}
  };

  circle.addEventListener('animationend', (e) => {
    if (e?.animationName !== 'art-toy-flash') return;
    clearFlashClass();
  });

  panel.flash = (meta = null) => {
    artFlashDbg('panel.flash:invoke', {
      artId: panel.id || null,
      meta: meta || null,
      zoom: !!window.__mtZoomGesturing,
      gesture: !!window.__GESTURE_ACTIVE,
      tween: !!window.__camTweenLock,
    });
    clearFlashClass();
    if (typeof circle.animate === 'function') {
      try { circle.__artFlashAnim?.cancel?.(); } catch {}
      try {
        const anim = circle.animate(
          [
            { filter: 'brightness(1) saturate(1)', transform: 'scale(1)' },
            { filter: 'brightness(2.1) saturate(1.3)', transform: 'scale(1.02)', offset: 0.4 },
            { filter: 'brightness(1) saturate(1)', transform: 'scale(1)' },
          ],
          { duration: 160, easing: 'ease-out' }
        );
        circle.__artFlashAnim = anim;
        const clearAnimRef = () => {
          if (circle.__artFlashAnim === anim) circle.__artFlashAnim = null;
        };
        anim.addEventListener('finish', clearAnimRef, { once: true });
        anim.addEventListener('cancel', clearAnimRef, { once: true });
        return;
      } catch {}
    }

    panel.classList.remove('flash');
    void panel.offsetWidth;
    panel.classList.add('flash');
    if (flashClearTimer) clearTimeout(flashClearTimer);
    flashClearTimer = setTimeout(() => {
      clearFlashClass();
      flashClearTimer = 0;
    }, 240);
  };

  panel.onArtTrigger = (trigger = null) => {
    panel.flash(trigger || null);
    return true;
  };
}

function setupFireworks(panel) {
  panel.classList.add('art-toy-fireworks');

  const layer = document.createElement('div');
  layer.className = 'art-fireworks-layer';
  panel.appendChild(layer);

  const activeGlowLayer = document.createElement('div');
  activeGlowLayer.className = 'art-fireworks-active-glows';
  panel.appendChild(activeGlowLayer);

  const dragAreaEl = document.createElement('div');
  dragAreaEl.className = 'art-fireworks-drag-area';
  panel.appendChild(dragAreaEl);

  const handlesLayer = document.createElement('div');
  handlesLayer.className = 'art-fireworks-handles';
  panel.appendChild(handlesLayer);

  const anchors = Array.from({ length: ART_SLOT_COUNT }, () => ({ x: 110, y: 110 }));
  const palette = ['#ff6b6b', '#ffd166', '#06d6a0', '#4cc9f0', '#f72585', '#ff9f1c', '#9b5de5', '#80ed99'];
  const FIREWORK_EFFECT_SCALE = 2;
  const HANDLE_SIZE_PX = 62;
  const ROTATE_HANDLE_MIN_SEPARATION_PX = 16;
  const PANEL_PX = 220;
  const ACTIVE_GLOW_SIZE_PX = 180;
  const AREA_MIN_X = -142; // align with left edge of the large drag button
  const AREA_MIN_Y = 74;   // keep below top button row
  // Keep the top/left lock, but preserve the larger workspace size.
  const MAX_DRAG_SPAN = 1600;
  const AREA_MAX_X = AREA_MIN_X + MAX_DRAG_SPAN;
  const AREA_MAX_Y = AREA_MIN_Y + MAX_DRAG_SPAN;
  const TOTAL_LIMIT_W = Math.max(1, AREA_MAX_X - AREA_MIN_X);
  const TOTAL_LIMIT_H = Math.max(1, AREA_MAX_Y - AREA_MIN_Y);
  const RANDOM_TOP_LEFT_QUARTER = {
    x: AREA_MIN_X,
    y: AREA_MIN_Y,
    w: TOTAL_LIMIT_W * 0.75,
    h: TOTAL_LIMIT_H * 0.75,
  };

  const dragArea = {
    x: AREA_MIN_X,
    y: AREA_MIN_Y,
    // 4x original area (192x138 => 384x276)
    w: 384,
    h: 276,
  };
  const INITIAL_DRAG_W = dragArea.w;
  const INITIAL_DRAG_H = dragArea.h;

  const handleEls = [];
  const activeGlowEls = Array.from({ length: ART_SLOT_COUNT }, () => null);
  const activeSlots = new Set();
  let selectedColorSlot = null;
  let refreshCustomizeUi = () => {};
  let setCustomiseOpen = () => {};
  let selectLineForCustomise = () => {};
  let syncSelectedHandleHighlight = () => {};
  let pulseColorButtonHit = () => {};
  let fireworkBurstSizeMultiplier = 1;
  const syncActiveStateFlags = () => {
    panel.dataset.hasActiveFireworks = activeSlots.size > 0 ? '1' : '0';
  };

  // Effect selection.
  // 0 = Classic Chrysanthemum (default)
  // 1 = Palm
  // 2 = Crackle
  // 3 = Flower
  // 4 = Wave Ring
  // 5 = Star Scatter
  const FIREWORK_FX = Object.freeze([
    { id: 0, key: 'classic', name: 'Classic' },
    { id: 1, key: 'palm', name: 'Palm' },
    { id: 2, key: 'crackle', name: 'Crackle' },
    { id: 3, key: 'flower', name: 'Flower' },
    { id: 4, key: 'ring', name: 'Ring' },
    { id: 5, key: 'star', name: 'Star' },
  ]);
  const clampFxId = (v) => {
    const n = Math.trunc(Number(v));
    return Number.isFinite(n) && n >= 0 && n < FIREWORK_FX.length ? n : 0;
  };
  let currentFxId = 0;
  let syncFxUi = () => {};
  const setFx = (nextId, { announce = true } = {}) => {
    currentFxId = clampFxId(nextId);
    panel.dataset.fireworkFx = String(currentFxId);
    try { syncFxUi(); } catch {}
    if (announce) markSceneDirtySafe();
  };
  // default
  setFx(0, { announce: false });

  // Keep DOM churn bounded.
  const activeParticles = [];
  const PARTICLE_CAP = 340;
  const trackParticleEl = (el) => {
    if (!el) return;
    activeParticles.push(el);
    while (activeParticles.length > PARTICLE_CAP) {
      const old = activeParticles.shift();
      try { old?.remove?.(); } catch {}
    }
  };

  // Fireworks controls UI: current effect preview + picker grid.
  try {
    const controlsHost = getBaseArtToyControlsHost(panel);
    let fxShell = controlsHost?.querySelector?.('.art-toy-fx-shell') || null;
    if (!fxShell && controlsHost) {
      fxShell = document.createElement('div');
      fxShell.className = 'art-toy-fx-shell';
      fxShell.dataset.open = '0';
      controlsHost.appendChild(fxShell);
    }
    const fxCurrentBtn = fxShell?.querySelector?.('.art-toy-fx-current') || null;
    const fxCurrentStage = fxShell?.querySelector?.('.art-toy-fx-stage-current') || null;
    const fxGrid = fxShell?.querySelector?.('.art-toy-fx-grid') || null;
    const fxCards = [];

    const previewParticles = new WeakMap();
    const PREVIEW_CAP = 56;
    const trackPreviewParticle = (stage, el) => {
      if (!stage || !el) return;
      let list = previewParticles.get(stage);
      if (!list) {
        list = [];
        previewParticles.set(stage, list);
      }
      list.push(el);
      while (list.length > PREVIEW_CAP) {
        const old = list.shift();
        try { old?.remove?.(); } catch {}
      }
    };

    const toneForFx = (fxId) => {
      const i = clampFxId(fxId);
      return palette[i % palette.length];
    };

    const spawnPreviewSpark = (stage, tone, { angle = 0, dist = 24, life = 520, width = 4, height = 22, gravity = 0 } = {}) => {
      const spark = document.createElement('span');
      spark.className = 'art-firework-spark';
      spark.style.left = '50%';
      spark.style.top = '50%';
      spark.style.background = tone;
      spark.style.width = `${Math.max(2, width)}px`;
      spark.style.height = `${Math.max(6, height)}px`;
      stage.appendChild(spark);
      trackPreviewParticle(stage, spark);
      const dx = Math.cos(angle) * dist;
      const dy = Math.sin(angle) * dist;
      const dy2 = dy + gravity;
      try {
        const anim = spark.animate(
          [
            { transform: `translate(-50%, -50%) rotate(${angle}rad) scale(0.2)`, opacity: 1 },
            { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) rotate(${angle}rad) scale(1)`, opacity: 0.92, offset: 0.56 },
            { transform: `translate(calc(-50% + ${dx * 1.14}px), calc(-50% + ${dy2 * 1.16}px)) rotate(${angle}rad) scale(0.72)`, opacity: 0 },
          ],
          { duration: life, easing: 'cubic-bezier(0.18, 0.72, 0.14, 1)' }
        );
        anim.addEventListener('finish', () => { try { spark.remove(); } catch {} }, { once: true });
        anim.addEventListener('cancel', () => { try { spark.remove(); } catch {} }, { once: true });
      } catch {
        setTimeout(() => { try { spark.remove(); } catch {} }, life + 30);
      }
    };

    const spawnPreviewDot = (stage, tone, { angle = 0, dist = 18, life = 420, size = 6, gravity = 0, flicker = false } = {}) => {
      const dot = document.createElement('span');
      dot.className = 'art-firework-dot';
      dot.style.left = '50%';
      dot.style.top = '50%';
      dot.style.background = tone;
      dot.style.width = `${Math.max(2, size)}px`;
      dot.style.height = `${Math.max(2, size)}px`;
      if (flicker) dot.classList.add('is-flicker');
      stage.appendChild(dot);
      trackPreviewParticle(stage, dot);
      const dx = Math.cos(angle) * dist;
      const dy = Math.sin(angle) * dist;
      const dy2 = dy + gravity;
      try {
        const anim = dot.animate(
          [
            { transform: 'translate(-50%, -50%) scale(0.3)', opacity: 1 },
            { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1)`, opacity: 0.92, offset: 0.58 },
            { transform: `translate(calc(-50% + ${dx * 1.12}px), calc(-50% + ${dy2 * 1.14}px)) scale(0.58)`, opacity: 0 },
          ],
          { duration: life, easing: 'cubic-bezier(0.18, 0.72, 0.14, 1)' }
        );
        anim.addEventListener('finish', () => { try { dot.remove(); } catch {} }, { once: true });
        anim.addEventListener('cancel', () => { try { dot.remove(); } catch {} }, { once: true });
      } catch {
        setTimeout(() => { try { dot.remove(); } catch {} }, life + 30);
      }
    };

    const spawnPreviewRing = ({
      stage,
      tone,
      life = 520,
      scale0 = 0.18,
      scale1 = 1.5,
      thickness = 2,
      burstIn = null,
      lingerUntil = null,
      lingerOpacity = 0.24
    } = {}) => {
      const ring = document.createElement('span');
      ring.className = 'art-firework-ring';
      ring.style.left = '50%';
      ring.style.top = '50%';
      ring.style.color = tone;
      ring.style.width = '36px';
      ring.style.height = '36px';
      ring.style.setProperty('--ring-thickness', `${thickness}px`);
      stage.appendChild(ring);
      trackPreviewParticle(stage, ring);
      try {
        const hasBurst = Number.isFinite(burstIn) && burstIn > 0 && burstIn < 1;
        const hasLinger = Number.isFinite(lingerUntil) && lingerUntil > 0 && lingerUntil < 1;
        const burstOffset = hasBurst ? Math.max(0.14, Math.min(0.72, Number(burstIn))) : 0.36;
        const lingerOffset = hasLinger ? Math.max(burstOffset + 0.08, Math.min(0.96, Number(lingerUntil))) : 0.78;
        const lingerA = Math.max(0, Math.min(0.9, Number(lingerOpacity) || 0));
        const keyframes = hasBurst || hasLinger
          ? [
              { transform: `translate(-50%, -50%) scale(${scale0})`, opacity: 0.9 },
              { transform: `translate(-50%, -50%) scale(${scale1})`, opacity: 0.58, offset: burstOffset },
              { transform: `translate(-50%, -50%) scale(${scale1})`, opacity: lingerA, offset: lingerOffset },
              { transform: `translate(-50%, -50%) scale(${scale1})`, opacity: 0 },
            ]
          : [
              { transform: `translate(-50%, -50%) scale(${scale0})`, opacity: 0.9 },
              { transform: `translate(-50%, -50%) scale(${scale1})`, opacity: 0 },
            ];
        const anim = ring.animate(
          keyframes,
          { duration: life, easing: 'ease-out' }
        );
        anim.addEventListener('finish', () => { try { ring.remove(); } catch {} }, { once: true });
        anim.addEventListener('cancel', () => { try { ring.remove(); } catch {} }, { once: true });
      } catch {
        setTimeout(() => { try { ring.remove(); } catch {} }, life + 30);
      }
    };

    const spawnPreviewStar = ({
      stage,
      tone,
      angle = 0,
      dist = 20,
      life = 520,
      size = 8,
      spin = 1,
      gravity = 0,
      burstOffset = 0.6,
      startScale = 0.46,
      burstScale = 1,
      endScale = 0.64
    } = {}) => {
      const star = document.createElement('span');
      star.className = 'art-firework-star';
      star.style.left = '50%';
      star.style.top = '50%';
      star.style.background = tone;
      star.style.width = `${Math.max(6, size)}px`;
      star.style.height = `${Math.max(6, size)}px`;
      stage.appendChild(star);
      trackPreviewParticle(stage, star);
      const dx = Math.cos(angle) * dist;
      const dy = Math.sin(angle) * dist;
      const dy2 = dy + gravity;
      const outOffset = Math.max(0.14, Math.min(0.76, Number(burstOffset) || 0.6));
      const s0 = Math.max(0.1, Number(startScale) || 0.46);
      const sb = Math.max(0.1, Number(burstScale) || 1);
      const se = Math.max(0.1, Number(endScale) || 0.64);
      try {
        const anim = star.animate(
          [
            { transform: `translate(-50%, -50%) rotate(0deg) scale(${s0})`, opacity: 1 },
            { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) rotate(${180 * spin}deg) scale(${sb})`, opacity: 0.9, offset: outOffset },
            { transform: `translate(calc(-50% + ${dx * 1.1}px), calc(-50% + ${dy2 * 1.1}px)) rotate(${360 * spin}deg) scale(${se})`, opacity: 0 },
          ],
          { duration: life, easing: 'cubic-bezier(0.18, 0.72, 0.14, 1)' }
        );
        anim.addEventListener('finish', () => { try { star.remove(); } catch {} }, { once: true });
        anim.addEventListener('cancel', () => { try { star.remove(); } catch {} }, { once: true });
      } catch {
        setTimeout(() => { try { star.remove(); } catch {} }, life + 30);
      }
    };

    const spawnPreviewCore = (stage, tone, life = 220) => {
      const core = document.createElement('span');
      core.className = 'art-firework-core';
      core.style.left = '50%';
      core.style.top = '50%';
      core.style.background = tone;
      core.style.width = '34px';
      core.style.height = '34px';
      stage.appendChild(core);
      trackPreviewParticle(stage, core);
      try {
        const anim = core.animate(
          [
            { transform: 'translate(-50%, -50%) scale(0.14)', opacity: 0.95 },
            { transform: 'translate(-50%, -50%) scale(1.35)', opacity: 0.2, offset: 0.45 },
            { transform: 'translate(-50%, -50%) scale(1.85)', opacity: 0 },
          ],
          { duration: life, easing: 'ease-out' }
        );
        anim.addEventListener('finish', () => { try { core.remove(); } catch {} }, { once: true });
        anim.addEventListener('cancel', () => { try { core.remove(); } catch {} }, { once: true });
      } catch {
        setTimeout(() => { try { core.remove(); } catch {} }, life + 30);
      }
    };

    const spawnPreviewFlashCircle = (stage, tone, life = 320) => {
      const flash = document.createElement('span');
      flash.className = 'art-firework-core';
      flash.style.left = '50%';
      flash.style.top = '50%';
      flash.style.background = tone;
      flash.style.width = '46px';
      flash.style.height = '46px';
      stage.appendChild(flash);
      trackPreviewParticle(stage, flash);
      try {
        const anim = flash.animate(
          [
            { transform: 'translate(-50%, -50%) scale(0.22)', opacity: 1, filter: 'blur(0.2px) brightness(1.35)' },
            { transform: 'translate(-50%, -50%) scale(1.08)', opacity: 0.86, offset: 0.38, filter: 'blur(0.35px) brightness(1.5)' },
            { transform: 'translate(-50%, -50%) scale(1.7)', opacity: 0, filter: 'blur(0.8px) brightness(1.1)' },
          ],
          { duration: life, easing: 'ease-out' }
        );
        anim.addEventListener('finish', () => { try { flash.remove(); } catch {} }, { once: true });
        anim.addEventListener('cancel', () => { try { flash.remove(); } catch {} }, { once: true });
      } catch {
        setTimeout(() => { try { flash.remove(); } catch {} }, life + 30);
      }
    };

    const playPreviewBurst = (stage, fxId) => {
      if (!stage) return 900;
      const id = clampFxId(fxId);
      const tone = toneForFx(id);
      if (id === 0) {
        // Classic preview card: simple bright flash circle for clearer differentiation.
        spawnPreviewFlashCircle(stage, tone, 320);
        return 420;
      }
      if (id === 4) {
        const RING_SIZE_SCALE = 2 / 3;
        spawnPreviewRing({
          stage,
          tone,
          life: 560,
          scale0: 0.22 * RING_SIZE_SCALE,
          scale1: 1.7 * RING_SIZE_SCALE,
          thickness: 2,
          burstIn: 0.24,
          lingerUntil: 0.9,
          lingerOpacity: 0.3
        });
        spawnPreviewRing({
          stage,
          tone,
          life: 650,
          scale0: 0.16 * RING_SIZE_SCALE,
          scale1: 1.3 * RING_SIZE_SCALE,
          thickness: 2,
          burstIn: 0.28,
          lingerUntil: 0.92,
          lingerOpacity: 0.24
        });
        return 780;
      }
      if (id === 5) {
        // Pinwheel preview to match in-scene behavior.
        spawnPreviewStar({
          stage,
          tone,
          angle: 0,
          dist: 0,
          life: 480,
          size: 22,
          spin: 2.6,
          gravity: 5,
          burstOffset: 0.18,
          startScale: 0.2,
          burstScale: 1.4,
          endScale: 0.46
        });

        const impactCount = 10;
        for (let i = 0; i < impactCount; i++) {
          const impactAngle = (Math.PI * 2 * i) / impactCount + (Math.random() - 0.5) * 0.14;
          const impactDist = 18 + Math.random() * 12;
          spawnPreviewStar({
            stage,
            tone,
            angle: impactAngle,
            dist: impactDist,
            life: 240 + Math.random() * 80,
            size: 6 + Math.random() * 4,
            spin: (Math.random() < 0.5 ? -1 : 1) * (2.1 + Math.random() * 1.2),
            gravity: 5,
            burstOffset: 0.16,
            startScale: 0.34,
            burstScale: 1.65,
            endScale: 0.42
          });
        }

        const arms = 5;
        const waves = 4;
        const spawnWindowMs = 230;
        const waveStepMs = Math.round(spawnWindowMs / Math.max(1, waves - 1));
        const baseAngle = Math.random() * Math.PI * 2;
        const angularVelocity = 0.86;
        for (let w = 0; w < waves; w++) {
          const delay = w * waveStepMs;
          setTimeout(() => {
            if (!stage.isConnected) return;
            const waveT = w / Math.max(1, waves - 1);
            const burstBoost = delay < 200
              ? (3.9 - (delay / 200) * 1.9)
              : Math.max(1.0, 1.7 - ((delay - 200) / Math.max(1, spawnWindowMs - 200)) * 0.7);
            const earlyBoost = (1.85 - (waveT * 0.75)) * burstBoost;
            const finalScale = 0.5 + (waveT * 0.22);
            for (let a = 0; a < arms; a++) {
              const angle = baseAngle + ((Math.PI * 2) / arms) * a + (w * angularVelocity);
              const dist = (10 + w * 4 + Math.random() * 8) * earlyBoost;
              spawnPreviewStar({
                stage,
                tone,
                angle,
                dist,
                life: 640 + Math.random() * 220,
                size: 7 + Math.random() * 4,
                spin: 1.1 + Math.random() * 0.9,
                gravity: 11,
                burstOffset: 0.2 + (waveT * 0.08),
                startScale: 0.38,
                burstScale: 2.0,
                endScale: finalScale
              });
            }
          }, delay);
        }
        return 980;
      }
      spawnPreviewCore(stage, tone, 220);
      if (id === 1) {
        const count = 11;
        for (let i = 0; i < count; i++) {
          const angle = ((Math.PI * 2) / count) * i + (Math.random() - 0.5) * 0.3;
          spawnPreviewSpark(stage, tone, { angle, dist: 24 + Math.random() * 14, life: 620 + Math.random() * 220, width: 4, height: 28, gravity: 14 });
        }
        return 940;
      }
      if (id === 2) {
        const count = 14;
        for (let i = 0; i < count; i++) {
          const angle = Math.random() * Math.PI * 2;
          spawnPreviewDot(stage, tone, { angle, dist: 20 + Math.random() * 24, life: 360 + Math.random() * 190, size: 6 + Math.random() * 3, gravity: 11, flicker: true });
        }
        return 700;
      }
      if (id === 3) {
        const petals = 6;
        for (let p = 0; p < petals; p++) {
          const baseA = ((Math.PI * 2) / petals) * p;
          for (let k = 0; k < 3; k++) {
            spawnPreviewDot(stage, tone, { angle: baseA + (Math.random() - 0.5) * 0.2, dist: 10 + (k * 8), life: 440 + Math.random() * 180, size: 4 + Math.random() * 2, gravity: 0 });
          }
        }
        return 760;
      }
      const count = 16;
      for (let i = 0; i < count; i++) {
        const angle = ((Math.PI * 2) / count) * i + (Math.random() - 0.5) * 0.36;
        spawnPreviewSpark(stage, tone, { angle, dist: 14 + Math.random() * 20, life: 430 + Math.random() * 180, width: 3 + Math.random() * 2, height: 20 + Math.random() * 7, gravity: 8 });
      }
      return 760;
    };

    const addPreviewLoop = (stage, fxResolver) => {
      if (!stage) return;
      let timer = 0;
      const tick = () => {
        if (!panel.isConnected || !stage.isConnected) {
          if (timer) clearTimeout(timer);
          return;
        }
        const nextId = typeof fxResolver === 'function' ? fxResolver() : fxResolver;
        const cycleMs = Math.max(420, Number(playPreviewBurst(stage, nextId)) || 760);
        timer = setTimeout(tick, cycleMs + 40);
      };
      tick();
    };

    const setFxPickerOpen = () => {
      if (!fxShell || !fxGrid) return;
      fxShell.dataset.open = '1';
      if (fxCurrentBtn) fxCurrentBtn.setAttribute('aria-expanded', 'true');
      fxGrid.hidden = false;
    };

    const fxById = new Map(FIREWORK_FX.map((fx) => [fx.id, fx]));
    syncFxUi = () => {
      const fxId = clampFxId(panel?.dataset?.fireworkFx);
      const fxName = fxById.get(fxId)?.name || 'Effect';
      if (fxCurrentBtn) {
        fxCurrentBtn.title = `Effect: ${fxName}`;
        fxCurrentBtn.setAttribute('aria-label', `Current firework effect: ${fxName}`);
      }
      for (const card of fxCards) {
        const selected = card.dataset.fxId === String(fxId);
        card.classList.toggle('is-selected', selected);
      }
    };

    if (fxGrid && FIREWORK_FX.length) {
      fxGrid.innerHTML = '';
      for (const fx of FIREWORK_FX) {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'art-toy-fx-card';
        card.dataset.fxId = String(fx.id);
        card.title = fx.name;
        card.setAttribute('aria-label', `Select ${fx.name} firework effect`);

        const stage = document.createElement('span');
        stage.className = 'art-toy-fx-stage';
        stage.dataset.fxId = String(fx.id);
        card.appendChild(stage);
        fxGrid.appendChild(card);
        fxCards.push(card);

        addPreviewLoop(stage, fx.id);
        card.addEventListener('click', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          setFx(fx.id);
        });
      }
    }

    setFxPickerOpen(true);
    syncFxUi();
  } catch {}
  const syncDragArea = () => {
    dragAreaEl.style.left = `${AREA_MIN_X.toFixed(2)}px`;
    dragAreaEl.style.top = `${AREA_MIN_Y.toFixed(2)}px`;
    dragAreaEl.style.width = `${TOTAL_LIMIT_W.toFixed(2)}px`;
    dragAreaEl.style.height = `${TOTAL_LIMIT_H.toFixed(2)}px`;
  };
  const syncHandle = (slot) => {
    const handle = handleEls[slot];
    const a = anchors[slot];
    if (!handle || !a) return;
    handle.style.left = `${(a.x - HANDLE_SIZE_PX * 0.5).toFixed(2)}px`;
    handle.style.top = `${(a.y - HANDLE_SIZE_PX * 0.5).toFixed(2)}px`;
  };
  syncSelectedHandleHighlight = () => {
    for (let i = 0; i < ART_SLOT_COUNT; i++) {
      handleEls[i]?.classList.toggle(
        'is-selected-line',
        selectedColorSlot != null && normalizeSlot(selectedColorSlot) === i
      );
    }
  };
  const syncActiveGlow = (slot) => {
    const glow = activeGlowEls[slot];
    const a = anchors[slot];
    if (!glow || !a) return;
    glow.style.left = `${(a.x - ACTIVE_GLOW_SIZE_PX * 0.5).toFixed(2)}px`;
    glow.style.top = `${(a.y - ACTIVE_GLOW_SIZE_PX * 0.5).toFixed(2)}px`;
    glow.style.width = `${ACTIVE_GLOW_SIZE_PX}px`;
    glow.style.height = `${ACTIVE_GLOW_SIZE_PX}px`;
  };
  const setSlotActive = (slot) => {
    const i = normalizeSlot(slot);
    activeSlots.add(i);
    const handle = handleEls[i];
    if (handle) handle.classList.add('is-active-firework');
    const glow = activeGlowEls[i];
    if (glow) glow.classList.add('is-active-firework');
    syncActiveGlow(i);
    syncActiveStateFlags();
    syncSelectedHandleHighlight();
    try { refreshCustomizeUi(); } catch {}
  };
  const setSlotInactive = (slot) => {
    const i = normalizeSlot(slot);
    activeSlots.delete(i);
    const handle = handleEls[i];
    if (handle) handle.classList.remove('is-active-firework');
    const glow = activeGlowEls[i];
    if (glow) glow.classList.remove('is-active-firework');
    syncActiveStateFlags();
    syncSelectedHandleHighlight();
    try { refreshCustomizeUi(); } catch {}
  };

  const clampAnchorX = (v) => {
    const n = Number(v) || 0;
    return Math.max(AREA_MIN_X, Math.min(AREA_MAX_X, n));
  };
  const clampAnchorY = (v) => {
    const n = Number(v) || 0;
    return Math.max(AREA_MIN_Y, Math.min(AREA_MAX_Y, n));
  };
  const minGap = 96;

  const syncAllAnchors = () => {
    for (let i = 0; i < ART_SLOT_COUNT; i++) {
      syncHandle(i);
      syncActiveGlow(i);
    }
  };

  const activateAllSlots = () => {
    for (let i = 0; i < ART_SLOT_COUNT; i++) setSlotActive(i);
  };

  const fitDragAreaToAnchors = () => {
    const activeList = Array.from(activeSlots);
    const useSlots = activeList.length ? activeList : Array.from({ length: ART_SLOT_COUNT }, (_, i) => i);
    const coords = useSlots
      .map((i) => anchors[i])
      .filter(Boolean)
      .map((a) => ({ x: clampAnchorX(a.x), y: clampAnchorY(a.y) }));
    if (!coords.length) {
      dragArea.x = AREA_MIN_X;
      dragArea.y = AREA_MIN_Y;
      dragArea.w = INITIAL_DRAG_W;
      dragArea.h = INITIAL_DRAG_H;
      syncDragArea();
      return;
    }

    const pad = 28;
    const minX = Math.min(...coords.map((p) => p.x));
    const maxX = Math.max(...coords.map((p) => p.x));
    const minY = Math.min(...coords.map((p) => p.y));
    const maxY = Math.max(...coords.map((p) => p.y));

    const right = Math.min(AREA_MAX_X, maxX + pad);
    const bottom = Math.min(AREA_MAX_Y, maxY + pad);

    // Keep the rectangle anchored to the top-left drag-area limits.
    dragArea.x = AREA_MIN_X;
    dragArea.y = AREA_MIN_Y;
    dragArea.w = Math.max(INITIAL_DRAG_W, right - AREA_MIN_X);
    dragArea.h = Math.max(INITIAL_DRAG_H, bottom - AREA_MIN_Y);
    syncDragArea();
  };

  function randomizeAnchorsWithinArea(area = dragArea) {
    const areaX = Number.isFinite(Number(area?.x)) ? Number(area.x) : dragArea.x;
    const areaY = Number.isFinite(Number(area?.y)) ? Number(area.y) : dragArea.y;
    const areaW = Math.max(1, Number.isFinite(Number(area?.w)) ? Number(area.w) : dragArea.w);
    const areaH = Math.max(1, Number.isFinite(Number(area?.h)) ? Number(area.h) : dragArea.h);
    const placed = [];
    const cols = Math.ceil(Math.sqrt(ART_SLOT_COUNT));
    const rows = Math.ceil(ART_SLOT_COUNT / cols);
    const cellW = areaW / cols;
    const cellH = areaH / rows;
    for (let i = 0; i < ART_SLOT_COUNT; i++) {
      let picked = null;
      let best = null;
      let bestDist = -Infinity;
      for (let attempts = 0; attempts < 140; attempts++) {
        const x = areaX + Math.random() * areaW;
        const y = areaY + Math.random() * areaH;
        const nearest = placed.length
          ? Math.min(...placed.map((p) => Math.hypot(p.x - x, p.y - y)))
          : Infinity;
        if (nearest >= minGap) {
          picked = { x, y };
          break;
        }
        if (nearest > bestDist) {
          bestDist = nearest;
          best = { x, y };
        }
      }
      if (!picked) {
        const row = Math.floor(i / cols);
        const col = i % cols;
        const gx = areaX + cellW * (col + 0.5);
        const gy = areaY + cellH * (row + 0.5);
        picked = best || { x: gx, y: gy };
      }
      anchors[i].x = clampAnchorX(picked.x);
      anchors[i].y = clampAnchorY(picked.y);
      placed.push({ ...anchors[i] });
    }
  };

  randomizeAnchorsWithinArea();
  syncActiveStateFlags();
  syncDragArea();
  for (let i = 0; i < ART_SLOT_COUNT; i++) {
    const glow = document.createElement('span');
    glow.className = 'art-firework-active-glow';
    glow.style.color = palette[i % palette.length];
    activeGlowLayer.appendChild(glow);
    activeGlowEls[i] = glow;
    syncActiveGlow(i);
  }

  for (let i = 0; i < ART_SLOT_COUNT; i++) {
    const handleBtn = document.createElement('button');
    handleBtn.type = 'button';
    handleBtn.className = 'c-btn art-firework-handle-btn';
    handleBtn.title = `Move Firework ${i + 1}`;
    handleBtn.setAttribute('aria-label', `Move Firework ${i + 1}`);
    handleBtn.style.setProperty('--c-btn-size', '62px');
    handleBtn.innerHTML = BUTTON_ICON_HTML;
    const core = handleBtn.querySelector('.c-btn-core');
    if (core) core.style.setProperty('--c-btn-icon-url', "url('./assets/UI/T_ButtonDrag.png')");

    attachSlotHandleDrag({
      handleBtn,
      layer,
      panelPx: PANEL_PX,
      getStartPos: () => ({ x: anchors[i].x, y: anchors[i].y }),
      setPos: (x, y) => {
        anchors[i].x = x;
        anchors[i].y = y;
        fitDragAreaToAnchors();
        syncHandle(i);
        syncActiveGlow(i);
      },
      clampX: clampAnchorX,
      clampY: clampAnchorY,
      onDragStateChange: (active) => {
        dragAreaEl.classList.toggle('is-dragging', !!active);
      },
      onCommit: () => markSceneDirtySafe(),
      onTap: () => {
        selectLineForCustomise(i, { openMenu: true });
      },
    });

    handlesLayer.appendChild(handleBtn);
    handleEls.push(handleBtn);
    syncHandle(i);
  }

  // Customise Art (Fireworks): burst size + active-burst color picker.
  let thicknessControlApi = null;
  let previewLoopTimer = 0;
  const stopPreviewLoop = () => {
    if (previewLoopTimer) clearTimeout(previewLoopTimer);
    previewLoopTimer = 0;
  };
  const startPreviewLoopForSlot = (slot) => {
    stopPreviewLoop();
    const i = normalizeSlot(slot);
    const isScenePlaying = () => {
      try { return !!document.querySelector('.toy-panel.toy-playing'); } catch {}
      return false;
    };
    const tick = () => {
      if (!panel.isConnected) return;
      if (selectedColorSlot == null || normalizeSlot(selectedColorSlot) !== i) return;
      if (!isScenePlaying()) spawnBurst(i, 1);
      previewLoopTimer = setTimeout(tick, 760);
    };
    tick();
  };

  const customisePanel = document.createElement('div');
  customisePanel.className = 'art-line-style-panel';
  customisePanel.hidden = true;
  panel.appendChild(customisePanel);

  thicknessControlApi = createArtLineThicknessControl({
    label: 'Burst Size',
    min: 0.5,
    max: 3,
    step: 0.05,
    value: fireworkBurstSizeMultiplier,
    onInput: (nextValue) => {
      const n = Number(nextValue);
      if (!Number.isFinite(n)) return;
      fireworkBurstSizeMultiplier = Math.max(0.2, n);
    },
    onCommit: () => markSceneDirtySafe(),
  });
  customisePanel.appendChild(thicknessControlApi.root);

  const lineButtonsTitle = document.createElement('div');
  lineButtonsTitle.className = 'art-line-style-subhead art-line-style-subhead-active-lines';
  lineButtonsTitle.textContent = 'Active Bursts';
  customisePanel.appendChild(lineButtonsTitle);

  const lineButtonsHost = document.createElement('div');
  lineButtonsHost.className = 'art-line-color-buttons';
  customisePanel.appendChild(lineButtonsHost);
  const colorButtonHitUntilBySlot = new Map();
  const colorButtonHitTimerBySlot = new Map();
  const applyColorButtonHitState = (slot) => {
    const i = normalizeSlot(slot);
    const btn = lineButtonsHost.querySelector(`button[data-slot="${i}"]`);
    if (!btn) return;
    const until = Number(colorButtonHitUntilBySlot.get(i) || 0);
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    btn.classList.toggle('is-note-hit', until > now);
  };
  pulseColorButtonHit = (slot) => {
    const i = normalizeSlot(slot);
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const until = now + 320;
    colorButtonHitUntilBySlot.set(i, until);
    const btn = lineButtonsHost.querySelector(`button[data-slot="${i}"]`);
    if (btn) {
      btn.classList.remove('is-note-hit');
      // Restart animation for rapid retriggers.
      void btn.offsetWidth;
      btn.classList.add('is-note-hit');
    }
    try { clearTimeout(colorButtonHitTimerBySlot.get(i)); } catch {}
    colorButtonHitTimerBySlot.set(i, setTimeout(() => {
      const latestUntil = Number(colorButtonHitUntilBySlot.get(i) || 0);
      const checkNow = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      if (latestUntil > checkNow) return;
      colorButtonHitUntilBySlot.delete(i);
      applyColorButtonHitState(i);
      colorButtonHitTimerBySlot.delete(i);
    }, 340));
  };

  const pickerTitle = document.createElement('div');
  pickerTitle.className = 'art-line-style-subhead';
  pickerTitle.textContent = 'Color';
  pickerTitle.hidden = true;
  customisePanel.appendChild(pickerTitle);

  const pickerWrap = document.createElement('div');
  pickerWrap.className = 'art-line-color-picker-wrap';
  pickerWrap.hidden = true;
  customisePanel.appendChild(pickerWrap);

  const pickerRow = document.createElement('div');
  pickerRow.className = 'art-line-picker-row';
  pickerWrap.appendChild(pickerRow);

  const pickerApi = createArtHueSatPicker({
    size: 296,
    color: palette[0],
    onChange: ({ hex } = {}) => {
      if (selectedColorSlot == null) return;
      const i = normalizeSlot(selectedColorSlot);
      const c = String(hex || '').trim();
      if (!/^#([0-9a-f]{6})$/i.test(c)) return;
      palette[i] = c;
      const glow = activeGlowEls[i];
      if (glow) glow.style.color = c;
      const btn = lineButtonsHost.querySelector(`button[data-slot="${i}"]`);
      if (btn) btn.style.setProperty('--accent', c);
    },
    onCommit: ({ hex } = {}) => {
      if (selectedColorSlot == null) return;
      const i = normalizeSlot(selectedColorSlot);
      const c = String(hex || '').trim();
      if (!/^#([0-9a-f]{6})$/i.test(c)) return;
      palette[i] = c;
      const glow = activeGlowEls[i];
      if (glow) glow.style.color = c;
      const btn = lineButtonsHost.querySelector(`button[data-slot="${i}"]`);
      if (btn) btn.style.setProperty('--accent', c);
      markSceneDirtySafe();
    },
  });
  pickerRow.appendChild(pickerApi.root);

  setCustomiseOpen = (open) => {
    const nextOpen = !!open;
    customisePanel.hidden = !nextOpen;
    customisePanel.classList.toggle('is-open', nextOpen);
    if (nextOpen) {
      try { refreshCustomizeUi(); } catch {}
      return;
    }
    selectedColorSlot = null;
    pickerWrap.hidden = true;
    pickerTitle.hidden = true;
    stopPreviewLoop();
    try { refreshCustomizeUi(); } catch {}
  };

  selectLineForCustomise = (slot, { openMenu = false } = {}) => {
    const i = normalizeSlot(slot);
    if (selectedColorSlot != null && normalizeSlot(selectedColorSlot) === i) {
      selectedColorSlot = null;
      pickerWrap.hidden = true;
      pickerTitle.hidden = true;
      stopPreviewLoop();
      refreshCustomizeUi();
      return;
    }
    selectedColorSlot = i;
    pickerWrap.hidden = false;
    pickerTitle.hidden = false;
    pickerApi.setColor(palette[i]);
    if (openMenu) setCustomiseOpen(true);
    refreshCustomizeUi();
    startPreviewLoopForSlot(i);
  };

  refreshCustomizeUi = () => {
    const active = Array.from(activeSlots.values()).map((s) => normalizeSlot(s)).sort((a, b) => a - b);
    const fxShell = getBaseArtToyControlsHost(panel)?.querySelector?.('.art-toy-fx-shell');
    if (fxShell) fxShell.hidden = active.length === 0;
    customisePanel.classList.toggle('is-empty-lines', active.length === 0);
    lineButtonsHost.innerHTML = '';
    if (!active.length) {
      selectedColorSlot = null;
      pickerWrap.hidden = true;
      pickerTitle.hidden = true;
      stopPreviewLoop();
      syncSelectedHandleHighlight();
      const empty = document.createElement('div');
      empty.className = 'art-line-color-empty';
      const emptyText = document.createElement('div');
      emptyText.className = 'art-line-color-empty-text';
      emptyText.textContent = 'Add some music with:';
      empty.appendChild(emptyText);
      const emptyActions = document.createElement('div');
      emptyActions.className = 'art-line-color-empty-actions';
      const randomBtn = document.createElement('button');
      randomBtn.type = 'button';
      randomBtn.className = 'c-btn art-line-empty-action-btn';
      randomBtn.setAttribute('aria-label', 'Randomize art toy music');
      randomBtn.title = 'Random Music';
      randomBtn.innerHTML = BUTTON_ICON_HTML;
      const randomCore = randomBtn.querySelector('.c-btn-core');
      if (randomCore) randomCore.style.setProperty('--c-btn-icon-url', "url('./assets/UI/T_ButtonRandomNotes.png')");
      randomBtn.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const randomActionBtn = panel.querySelector(`[data-action="artToy:randomMusic"][data-art-toy-id="${panel.id}"]`)
          || panel.querySelector(`[data-action="artToy:randomMusic"]`);
        try { randomActionBtn?.click?.(); } catch {}
        const selectFirstActive = () => {
          const activeSorted = Array.from(activeSlots.values())
            .map((s) => normalizeSlot(s))
            .sort((a, b) => a - b);
          if (!activeSorted.length) return false;
          try { selectLineForCustomise(activeSorted[0], { openMenu: false }); } catch {}
          return true;
        };
        if (selectFirstActive()) return;
        setTimeout(() => { try { selectFirstActive(); } catch {} }, 0);
        setTimeout(() => { try { selectFirstActive(); } catch {} }, 60);
      });
      emptyActions.appendChild(randomBtn);
      const enterBtn = document.createElement('button');
      enterBtn.type = 'button';
      enterBtn.className = 'c-btn art-line-empty-action-btn art-line-empty-enter-btn';
      enterBtn.setAttribute('aria-label', 'Enter internal view');
      enterBtn.title = 'Enter';
      enterBtn.innerHTML = BUTTON_ICON_HTML;
      const enterCore = enterBtn.querySelector('.c-btn-core');
      if (enterCore) enterCore.style.setProperty('--c-btn-icon-url', "url('./assets/UI/T_ButtonEnter.png')");
      enterBtn.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const enterActionBtn = panel.querySelector(`[data-action="artToy:music"][data-art-toy-id="${panel.id}"]`)
          || panel.querySelector(`[data-action="artToy:music"]`);
        try { enterActionBtn?.click?.(); } catch {}
      });
      emptyActions.appendChild(enterBtn);
      empty.appendChild(emptyActions);
      lineButtonsHost.appendChild(empty);
      return;
    }
    if (selectedColorSlot != null && !active.includes(normalizeSlot(selectedColorSlot))) {
      selectedColorSlot = null;
      pickerWrap.hidden = true;
      pickerTitle.hidden = true;
      stopPreviewLoop();
    }
    for (const i of active) {
      const row = document.createElement('div');
      row.className = 'art-line-color-row';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'c-btn art-line-color-btn';
      btn.dataset.slot = String(i);
      btn.title = `Edit Burst ${i + 1}`;
      btn.setAttribute('aria-label', `Edit burst ${i + 1} color`);
      btn.style.setProperty('--c-btn-size', '112px');
      btn.style.setProperty('--accent', palette[i]);
      btn.innerHTML = BUTTON_ICON_HTML;
      const colorCore = btn.querySelector('.c-btn-core');
      if (colorCore) colorCore.style.setProperty('--c-btn-icon-url', 'none');
      btn.classList.toggle('is-selected', selectedColorSlot != null && normalizeSlot(selectedColorSlot) === i);
      applyColorButtonHitState(i);
      btn.addEventListener('pointerdown', (ev) => {
        if (ev.button != null && ev.button !== 0) return;
        ev.preventDefault();
        ev.stopPropagation();
        selectLineForCustomise(i, { openMenu: false });
      });
      row.appendChild(btn);
      lineButtonsHost.appendChild(row);
    }
    syncSelectedHandleHighlight();
  };

  try {
    const controlsVisMo = new MutationObserver(() => {
      setCustomiseOpen(panel.dataset.controlsVisible === '1');
    });
    controlsVisMo.observe(panel, { attributes: true, attributeFilter: ['data-controls-visible'] });
  } catch {}
  setCustomiseOpen(panel.dataset.controlsVisible === '1');

  panel.onArtRandomMusic = () => {
    activateAllSlots();
    fitDragAreaToAnchors();
    syncAllAnchors();
    markSceneDirtySafe();
  };

  panel.onArtRandomAll = () => {
    activateAllSlots();
    randomizeAnchorsWithinArea(RANDOM_TOP_LEFT_QUARTER);
    fitDragAreaToAnchors();
    syncAllAnchors();
    // Random All also selects a random firework effect.
    if (FIREWORK_FX.length > 1) {
      let next = Math.floor(Math.random() * FIREWORK_FX.length);
      if (next === currentFxId) next = (next + 1 + Math.floor(Math.random() * (FIREWORK_FX.length - 1))) % FIREWORK_FX.length;
      setFx(next);
    }
    markSceneDirtySafe();
  };

  panel.onArtSetActiveSlots = (slots = []) => {
    const wanted = new Set(
      (Array.isArray(slots) ? slots : [])
        .map((s) => normalizeSlot(s))
    );
    for (let i = 0; i < ART_SLOT_COUNT; i++) {
      if (wanted.has(i)) setSlotActive(i);
      else setSlotInactive(i);
    }
    fitDragAreaToAnchors();
    syncAllAnchors();
  };

  panel.onArtClear = () => {
    for (let i = 0; i < ART_SLOT_COUNT; i++) setSlotInactive(i);
    try {
      layer.querySelectorAll('.art-firework-spark, .art-firework-core, .art-firework-dot, .art-firework-ring, .art-firework-star').forEach((node) => {
        try { node.remove(); } catch {}
      });
    } catch {}
    fitDragAreaToAnchors();
    syncAllAnchors();
    markSceneDirtySafe();
    return true;
  };

  panel.getArtToyPersistState = () => {
    const active = Array.from(activeSlots.values())
      .map((s) => normalizeSlot(s))
      .sort((a, b) => a - b);
    return {
      type: ART_TYPES.FIREWORKS,
      anchors: anchors.map((a) => ({ x: Number(a?.x) || 0, y: Number(a?.y) || 0 })),
      activeSlots: active,
      fx: clampFxId(panel?.dataset?.fireworkFx),
      burstColors: palette.map((c) => String(c || '#ff6b6b')),
      burstSize: Number(fireworkBurstSizeMultiplier) || 1,
      controlsVisible: panel.dataset.controlsVisible === '1',
    };
  };

  panel.applyArtToyPersistState = (state = {}) => {
    if (!state || typeof state !== 'object') return false;
    const nextAnchors = Array.isArray(state.anchors) ? state.anchors : null;
    if (nextAnchors && nextAnchors.length) {
      for (let i = 0; i < ART_SLOT_COUNT; i++) {
        const src = nextAnchors[i];
        if (!src || typeof src !== 'object') continue;
        anchors[i].x = clampAnchorX(src.x);
        anchors[i].y = clampAnchorY(src.y);
      }
    }
    if (Array.isArray(state.activeSlots)) {
      const wanted = new Set(state.activeSlots.map((s) => normalizeSlot(s)));
      for (let i = 0; i < ART_SLOT_COUNT; i++) {
        if (wanted.has(i)) setSlotActive(i);
        else setSlotInactive(i);
      }
    }
    if (Array.isArray(state.burstColors)) {
      for (let i = 0; i < ART_SLOT_COUNT; i++) {
        const c = String(state.burstColors[i] || '').trim();
        if (!/^#([0-9a-f]{6})$/i.test(c)) continue;
        palette[i] = c;
        const glow = activeGlowEls[i];
        if (glow) glow.style.color = c;
      }
    }
    if (state.burstSize != null) {
      const n = Number(state.burstSize);
      if (Number.isFinite(n)) {
        fireworkBurstSizeMultiplier = Math.max(0.2, n);
        try { thicknessControlApi?.setValue?.(fireworkBurstSizeMultiplier); } catch {}
      }
    }

    // Restore effect.
    if (state.fx != null) {
      setFx(state.fx, { announce: false });
    } else if (panel?.dataset?.fireworkFx != null) {
      setFx(panel.dataset.fireworkFx, { announce: false });
    }

    fitDragAreaToAnchors();
    syncAllAnchors();
    if (typeof state.controlsVisible === 'boolean') {
      setBaseArtToyControlsVisible(panel, state.controlsVisible);
    }
    return true;
  };

  const isClientPointInsideDragArea = (clientX, clientY) => {
    // When no active fireworks are present, the drag area should not capture
    // outside taps (it is visually hidden and effectively inactive).
    if (activeSlots.size === 0 && !dragAreaEl.classList.contains('is-dragging')) return false;
    const rect = panel.getBoundingClientRect();
    if (!rect || rect.width < 1 || rect.height < 1) return false;
    const scaleX = rect.width / PANEL_PX;
    const scaleY = rect.height / PANEL_PX;
    const left = rect.left + dragArea.x * scaleX;
    const top = rect.top + dragArea.y * scaleY;
    const right = left + dragArea.w * scaleX;
    const bottom = top + dragArea.h * scaleY;
    return clientX >= left && clientX <= right && clientY >= top && clientY <= bottom;
  };

  let outsideTapCandidate = false;
  let outsideTapPointerId = null;
  let outsideTapStartX = 0;
  let outsideTapStartY = 0;
  let outsideTapMoved = false;
  const OUTSIDE_TAP_SLOP_PX = 6;

  const resetOutsideTap = () => {
    outsideTapCandidate = false;
    outsideTapPointerId = null;
    outsideTapStartX = 0;
    outsideTapStartY = 0;
    outsideTapMoved = false;
  };

  const removeOutsideTapListeners = () => {
    document.removeEventListener('pointerdown', onDocPointerDownHideExtras, true);
    document.removeEventListener('pointermove', onDocPointerMoveHideExtras, true);
    document.removeEventListener('pointerup', onDocPointerUpHideExtras, true);
    document.removeEventListener('pointercancel', onDocPointerCancelHideExtras, true);
  };

  const onDocPointerDownHideExtras = (ev) => {
    if (!panel.isConnected) {
      removeOutsideTapListeners();
      return;
    }
    resetOutsideTap();
    if (panel.dataset.controlsVisible !== '1') return;
    const target = ev?.target;
    if (target && panel.contains(target)) return;
    if (isClientPointInsideDragArea(ev.clientX, ev.clientY)) return;
    outsideTapCandidate = true;
    outsideTapPointerId = ev.pointerId;
    outsideTapStartX = ev.clientX;
    outsideTapStartY = ev.clientY;
  };

  const onDocPointerMoveHideExtras = (ev) => {
    if (!outsideTapCandidate) return;
    if (outsideTapPointerId != null && ev.pointerId !== outsideTapPointerId) return;
    const dx = ev.clientX - outsideTapStartX;
    const dy = ev.clientY - outsideTapStartY;
    if ((dx * dx + dy * dy) > (OUTSIDE_TAP_SLOP_PX * OUTSIDE_TAP_SLOP_PX)) {
      outsideTapMoved = true;
    }
  };

  const onDocPointerUpHideExtras = (ev) => {
    if (!outsideTapCandidate) return;
    if (outsideTapPointerId != null && ev.pointerId !== outsideTapPointerId) return;
    const target = ev?.target;
    const endedOutsidePanel = !(target && panel.contains(target));
    const endedOutsideArea = !isClientPointInsideDragArea(ev.clientX, ev.clientY);
    const shouldHide = !outsideTapMoved && endedOutsidePanel && endedOutsideArea;
    resetOutsideTap();
    if (!shouldHide) return;
    if (!panel.isConnected) return;
    if (panel.dataset.controlsVisible !== '1') return;
    setBaseArtToyControlsVisible(panel, false);
  };

  const onDocPointerCancelHideExtras = (ev) => {
    if (!outsideTapCandidate) return;
    if (outsideTapPointerId != null && ev.pointerId !== outsideTapPointerId) return;
    resetOutsideTap();
  };

  document.addEventListener('pointerdown', onDocPointerDownHideExtras, true);
  document.addEventListener('pointermove', onDocPointerMoveHideExtras, true);
  document.addEventListener('pointerup', onDocPointerUpHideExtras, true);
  document.addEventListener('pointercancel', onDocPointerCancelHideExtras, true);

  function spawnBurst(slotIndex, velocity = null) {
    const slot = normalizeSlot(slotIndex);
    const anchor = anchors[slot];
    const tone = palette[slot % palette.length];
    const vel = Number(velocity);
    const ampBase = Number.isFinite(vel) ? Math.max(0.4, Math.min(1.3, vel)) : 0.9;
    const amp = ampBase * Math.max(0.2, Number(fireworkBurstSizeMultiplier) || 1);

    const spawnCoreFlash = (scale = 1, life = 260) => {
      try {
        const glow = document.createElement('span');
        glow.className = 'art-firework-core';
        glow.style.left = `${Math.round(anchor.x)}px`;
        glow.style.top = `${Math.round(anchor.y)}px`;
        glow.style.background = tone;
        layer.appendChild(glow);
        trackParticleEl(glow);
        const anim = glow.animate(
          [
            { transform: `translate(-50%, -50%) scale(${0.15 * FIREWORK_EFFECT_SCALE * scale})`, opacity: 0.98 },
            { transform: `translate(-50%, -50%) scale(${2.0 * FIREWORK_EFFECT_SCALE * scale})`, opacity: 0.22, offset: 0.45 },
            { transform: `translate(-50%, -50%) scale(${2.6 * FIREWORK_EFFECT_SCALE * scale})`, opacity: 0 },
          ],
          { duration: life, easing: 'ease-out' }
        );
        anim.addEventListener('finish', () => { try { glow.remove(); } catch {} }, { once: true });
        anim.addEventListener('cancel', () => { try { glow.remove(); } catch {} }, { once: true });
      } catch {}
    };

    const spawnCoreFadeOut = (scale = 1, life = 340) => {
      try {
        const glow = document.createElement('span');
        glow.className = 'art-firework-core';
        glow.style.left = `${Math.round(anchor.x)}px`;
        glow.style.top = `${Math.round(anchor.y)}px`;
        glow.style.background = tone;
        layer.appendChild(glow);
        trackParticleEl(glow);
        const fullScale = 2.6 * FIREWORK_EFFECT_SCALE * Math.max(0.05, Number(scale) || 1);
        const anim = glow.animate(
          [
            { transform: `translate(-50%, -50%) scale(${fullScale})`, opacity: 1 },
            { transform: `translate(-50%, -50%) scale(${fullScale})`, opacity: 0.95, offset: 0.22 },
            { transform: `translate(-50%, -50%) scale(${fullScale * 0.92})`, opacity: 0 },
          ],
          { duration: life, easing: 'ease-out' }
        );
        anim.addEventListener('finish', () => { try { glow.remove(); } catch {} }, { once: true });
        anim.addEventListener('cancel', () => { try { glow.remove(); } catch {} }, { once: true });
      } catch {}
    };

    const spawnLineSpark = ({ angle = 0, dist = 60, life = 520, width = 10, height = 64, gravity = 0, opacity = 1, scale0 = 0.25, scale1 = 1, toneOverride = null } = {}) => {
      const spark = document.createElement('span');
      spark.className = 'art-firework-spark';
      spark.style.left = `${Math.round(anchor.x)}px`;
      spark.style.top = `${Math.round(anchor.y)}px`;
      spark.style.background = (toneOverride || tone);
      spark.style.width = `${Math.max(2, width)}px`;
      spark.style.height = `${Math.max(6, height)}px`;
      layer.appendChild(spark);
      trackParticleEl(spark);

      const dx = Math.cos(angle) * dist;
      const dy = Math.sin(angle) * dist;
      const g = gravity;
      const dy2 = dy + g;

      try {
        const anim = spark.animate(
          [
            { transform: `translate(-50%, -50%) rotate(${angle}rad) scale(${scale0})`, opacity },
            { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) rotate(${angle}rad) scale(${scale1})`, opacity: opacity * 0.95, offset: 0.55 },
            { transform: `translate(calc(-50% + ${dx * 1.15}px), calc(-50% + ${dy2 * 1.18}px)) rotate(${angle}rad) scale(${scale1 * 0.7})`, opacity: 0 },
          ],
          { duration: life, easing: 'cubic-bezier(0.18, 0.72, 0.14, 1)' }
        );
        anim.addEventListener('finish', () => { try { spark.remove(); } catch {} }, { once: true });
        anim.addEventListener('cancel', () => { try { spark.remove(); } catch {} }, { once: true });
      } catch {
        setTimeout(() => { try { spark.remove(); } catch {} }, life + 50);
      }
    };

    const spawnDotSpark = ({ angle = 0, dist = 60, life = 520, size = 8, gravity = 0, flicker = false } = {}) => {
      const dot = document.createElement('span');
      dot.className = 'art-firework-dot';
      dot.style.left = `${Math.round(anchor.x)}px`;
      dot.style.top = `${Math.round(anchor.y)}px`;
      dot.style.background = tone;
      dot.style.width = `${Math.max(2, size)}px`;
      dot.style.height = `${Math.max(2, size)}px`;
      layer.appendChild(dot);
      trackParticleEl(dot);

      const dx = Math.cos(angle) * dist;
      const dy = Math.sin(angle) * dist;
      const dy2 = dy + gravity;
      const midScale = 1.0;
      const endScale = 0.55;

      const keyframes = [
        { transform: 'translate(-50%, -50%) scale(0.35)', opacity: 1 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(${midScale})`, opacity: 0.96, offset: 0.58 },
        { transform: `translate(calc(-50% + ${dx * 1.12}px), calc(-50% + ${dy2 * 1.16}px)) scale(${endScale})`, opacity: 0 },
      ];
      try {
        const anim = dot.animate(keyframes, { duration: life, easing: 'cubic-bezier(0.18, 0.72, 0.14, 1)' });
        anim.addEventListener('finish', () => { try { dot.remove(); } catch {} }, { once: true });
        anim.addEventListener('cancel', () => { try { dot.remove(); } catch {} }, { once: true });
      } catch {
        setTimeout(() => { try { dot.remove(); } catch {} }, life + 50);
      }

      if (flicker) {
        try { dot.classList.add('is-flicker'); } catch {}
      }
    };

    const spawnRing = ({
      life = 520,
      scale0 = 0.2,
      scale1 = 2.7,
      thickness = 3,
      burstIn = null,
      lingerUntil = null,
      lingerOpacity = 0.28
    } = {}) => {
      const ring = document.createElement('span');
      ring.className = 'art-firework-ring';
      ring.style.left = `${Math.round(anchor.x)}px`;
      ring.style.top = `${Math.round(anchor.y)}px`;
      ring.style.color = tone;
      ring.style.setProperty('--ring-thickness', `${thickness}px`);
      layer.appendChild(ring);
      trackParticleEl(ring);
      try {
        const hasBurst = Number.isFinite(burstIn) && burstIn > 0 && burstIn < 1;
        const hasLinger = Number.isFinite(lingerUntil) && lingerUntil > 0 && lingerUntil < 1;
        const burstOffset = hasBurst ? Math.max(0.12, Math.min(0.72, Number(burstIn))) : 0.35;
        const lingerOffset = hasLinger ? Math.max(burstOffset + 0.08, Math.min(0.96, Number(lingerUntil))) : 0.78;
        const lingerA = Math.max(0, Math.min(0.9, Number(lingerOpacity) || 0));
        const keyframes = hasBurst || hasLinger
          ? [
              { transform: `translate(-50%, -50%) scale(${scale0})`, opacity: 0.95 },
              { transform: `translate(-50%, -50%) scale(${scale1})`, opacity: 0.62, offset: burstOffset },
              { transform: `translate(-50%, -50%) scale(${scale1})`, opacity: lingerA, offset: lingerOffset },
              { transform: `translate(-50%, -50%) scale(${scale1})`, opacity: 0 },
            ]
          : [
              { transform: `translate(-50%, -50%) scale(${scale0})`, opacity: 0.9 },
              { transform: `translate(-50%, -50%) scale(${scale1})`, opacity: 0 },
            ];
        const anim = ring.animate(
          keyframes,
          { duration: life, easing: 'ease-out' }
        );
        anim.addEventListener('finish', () => { try { ring.remove(); } catch {} }, { once: true });
        anim.addEventListener('cancel', () => { try { ring.remove(); } catch {} }, { once: true });
      } catch {
        setTimeout(() => { try { ring.remove(); } catch {} }, life + 50);
      }
    };

    const spawnStar = ({
      angle = 0,
      dist = 60,
      life = 540,
      size = 14,
      spin = 1,
      gravity = 0,
      burstOffset = 0.6,
      startScale = 0.5,
      burstScale = 1,
      endScale = 0.7
    } = {}) => {
      const star = document.createElement('span');
      star.className = 'art-firework-star';
      star.style.left = `${Math.round(anchor.x)}px`;
      star.style.top = `${Math.round(anchor.y)}px`;
      star.style.background = tone;
      star.style.width = `${Math.max(6, size)}px`;
      star.style.height = `${Math.max(6, size)}px`;
      layer.appendChild(star);
      trackParticleEl(star);

      const dx = Math.cos(angle) * dist;
      const dy = Math.sin(angle) * dist;
      const dy2 = dy + gravity;
      const outOffset = Math.max(0.16, Math.min(0.72, Number(burstOffset) || 0.6));
      const s0 = Math.max(0.1, Number(startScale) || 0.5);
      const sb = Math.max(0.1, Number(burstScale) || 1);
      const se = Math.max(0.1, Number(endScale) || 0.7);

      try {
        const anim = star.animate(
          [
            { transform: `translate(-50%, -50%) rotate(0deg) scale(${s0})`, opacity: 1 },
            { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) rotate(${180 * spin}deg) scale(${sb})`, opacity: 0.92, offset: outOffset },
            { transform: `translate(calc(-50% + ${dx * 1.08}px), calc(-50% + ${dy2 * 1.08}px)) rotate(${360 * spin}deg) scale(${se})`, opacity: 0 },
          ],
          { duration: life, easing: 'cubic-bezier(0.18, 0.72, 0.14, 1)' }
        );
        anim.addEventListener('finish', () => { try { star.remove(); } catch {} }, { once: true });
        anim.addEventListener('cancel', () => { try { star.remove(); } catch {} }, { once: true });
      } catch {
        setTimeout(() => { try { star.remove(); } catch {} }, life + 50);
      }
    };

    // --- Effect implementations ---
    const fxId = clampFxId(panel?.dataset?.fireworkFx);

    if (fxId === 0) {
      // Simple bright flash circle (matches preview for effect 0).
      spawnCoreFadeOut(0.54 * amp * 2, 360);
      return;
    }

    if (fxId === 4) {
      // Wave Ring (clean + cheap).
      const RING_SIZE_SCALE = 2 / 3;
      spawnRing({
        life: 760 + Math.random() * 220,
        scale0: 0.25 * FIREWORK_EFFECT_SCALE * RING_SIZE_SCALE * amp * 2,
        scale1: (2.5 + Math.random() * 0.8) * FIREWORK_EFFECT_SCALE * RING_SIZE_SCALE * amp * 2,
        thickness: 3,
        burstIn: 0.24,
        lingerUntil: 0.9,
        lingerOpacity: 0.34
      });
      spawnRing({
        life: 860 + Math.random() * 260,
        scale0: 0.16 * FIREWORK_EFFECT_SCALE * RING_SIZE_SCALE * amp * 2,
        scale1: (1.9 + Math.random() * 0.7) * FIREWORK_EFFECT_SCALE * RING_SIZE_SCALE * amp * 2,
        thickness: 2,
        burstIn: 0.28,
        lingerUntil: 0.92,
        lingerOpacity: 0.28
      });
      return;
    }

    // Always add a small core flash for non-ring styles, except star scatter.
    if (fxId !== 5) {
      spawnCoreFlash(1.0, 240);
    }

    if (fxId === 1) {
      // Palm: fewer, longer trails + heavier gravity.
      const sparkCount = 22;
      for (let i = 0; i < sparkCount; i++) {
        const angle = ((Math.PI * 2) / sparkCount) * i + (Math.random() - 0.5) * 0.35;
        const dist = (32 + Math.random() * 62) * amp * FIREWORK_EFFECT_SCALE;
        const life = 760 + Math.random() * 360;
        spawnLineSpark({ angle, dist, life, width: 10, height: 86, gravity: 38 * amp * FIREWORK_EFFECT_SCALE, scale0: 0.22, scale1: 1.05 });
      }
      return;
    }

    if (fxId === 2) {
      // Crackle: a compact burst + micro pops.
      const CRACKLE_SIZE_SCALE = 2;
      const sparkCount = 28;
      for (let i = 0; i < sparkCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = (18 + Math.random() * 44) * amp * FIREWORK_EFFECT_SCALE * CRACKLE_SIZE_SCALE;
        const life = 420 + Math.random() * 220;
        spawnDotSpark({
          angle,
          dist,
          life,
          size: (7 + Math.random() * 4) * CRACKLE_SIZE_SCALE,
          gravity: 18 * amp * FIREWORK_EFFECT_SCALE * CRACKLE_SIZE_SCALE,
          flicker: true
        });
        // Secondary micro pop
        const delay = 90 + Math.random() * 220;
        setTimeout(() => {
          try {
            const microCount = 4 + Math.floor(Math.random() * 4);
            for (let m = 0; m < microCount; m++) {
              const a2 = angle + (Math.random() - 0.5) * 0.9;
              const d2 = (8 + Math.random() * 16) * amp * FIREWORK_EFFECT_SCALE * CRACKLE_SIZE_SCALE;
              spawnDotSpark({
                angle: a2,
                dist: d2,
                life: 220 + Math.random() * 160,
                size: (5 + Math.random() * 3) * CRACKLE_SIZE_SCALE,
                gravity: 10 * amp * FIREWORK_EFFECT_SCALE * CRACKLE_SIZE_SCALE,
                flicker: true
              });
            }
          } catch {}
        }, delay);
      }
      return;
    }

    if (fxId === 3) {
      // Flower: petal clusters, no gravity.
      const petals = 8;
      const perPetal = 6;
      for (let p = 0; p < petals; p++) {
        const baseA = ((Math.PI * 2) / petals) * p;
        for (let k = 0; k < perPetal; k++) {
          const a = baseA + (Math.random() - 0.5) * 0.24;
          const dist = (26 + k * (10 + Math.random() * 4)) * amp * FIREWORK_EFFECT_SCALE;
          const life = 540 + Math.random() * 240;
          spawnDotSpark({ angle: a, dist, life, size: 6 + Math.random() * 3, gravity: 0, flicker: false });
        }
      }
      return;
    }

    if (fxId === 5) {
      // Pinwheel: rotating star arms that emit over a short burst window.
      // Single large central star at impact.
      spawnStar({
        angle: 0,
        dist: 0,
        life: 620,
        size: 120,
        spin: 2.6,
        gravity: 8 * amp * FIREWORK_EFFECT_SCALE,
        burstOffset: 0.18,
        startScale: 0.2,
        burstScale: 1.4,
        endScale: 0.46
      });
      // Add a very brief impact burst using fast spinning stars (no core circle).
      const impactCount = 12;
      for (let i = 0; i < impactCount; i++) {
        const impactAngle = (Math.PI * 2 * i) / impactCount + (Math.random() - 0.5) * 0.14;
        const impactDist = (42 + Math.random() * 26) * amp * FIREWORK_EFFECT_SCALE;
        spawnStar({
          angle: impactAngle,
          dist: impactDist,
          life: 300 + Math.random() * 90,
          size: 10 + Math.random() * 7,
          spin: (Math.random() < 0.5 ? -1 : 1) * (2.1 + Math.random() * 1.4),
          gravity: 12 * amp * FIREWORK_EFFECT_SCALE,
          burstOffset: 0.16,
          startScale: 0.34,
          burstScale: 1.65,
          endScale: 0.42
        });
      }
      const arms = 5;
      const waves = 5;
      const spawnWindowMs = 300;
      const waveStepMs = Math.round(spawnWindowMs / Math.max(1, waves - 1));
      const baseAngle = Math.random() * Math.PI * 2;
      const angularVelocity = 0.86; // radians per wave for visible spin.

      for (let w = 0; w < waves; w++) {
        const delay = w * waveStepMs;
        setTimeout(() => {
          const waveT = w / Math.max(1, waves - 1);
          // Massive launch boost for the first 0.2s, then taper quickly.
          const burstBoost = delay < 200
            ? (3.9 - (delay / 200) * 1.9) // ~3.9x -> ~2.0x during the first 0.2s
            : Math.max(1.0, 1.7 - ((delay - 200) / Math.max(1, spawnWindowMs - 200)) * 0.7);
          const earlyBoost = (1.85 - (waveT * 0.75)) * burstBoost;
          const finalScale = 0.5 + (waveT * 0.22);   // earliest waves shrink down more.
          for (let a = 0; a < arms; a++) {
            const angle = baseAngle + ((Math.PI * 2) / arms) * a + (w * angularVelocity);
            const dist = (26 + w * 7 + Math.random() * 14) * amp * FIREWORK_EFFECT_SCALE * earlyBoost;
            const life = 920 + Math.random() * 260;
            spawnStar({
              angle,
              dist,
              life,
              size: 12 + Math.random() * 9,
              spin: 1.1 + Math.random() * 0.9,
              gravity: 26 * amp * FIREWORK_EFFECT_SCALE,
              burstOffset: 0.2 + (waveT * 0.08),
              startScale: 0.38,
              burstScale: 2.0,
              endScale: finalScale
            });
          }
        }, delay);
      }
      return;
    }

    // Classic chrysanthemum: lots of rays + light gravity.
    const sparkCount = 52;
    for (let i = 0; i < sparkCount; i++) {
      const angle = ((Math.PI * 2) / sparkCount) * i + (Math.random() - 0.5) * 0.42;
      const dist = (30 + Math.random() * 76) * amp * FIREWORK_EFFECT_SCALE;
      const life = 520 + Math.random() * 280;
      const w = 7 + Math.random() * 5;
      const h = 64 + Math.random() * 22;
      spawnLineSpark({ angle, dist, life, width: w, height: h, gravity: 18 * amp * FIREWORK_EFFECT_SCALE, scale0: 0.18, scale1: 1.05 });
    }
  }

  // Public API for UI handlers.
  panel.getFireworkEffectId = () => clampFxId(panel?.dataset?.fireworkFx);
  panel.setFireworkEffectId = (fxId) => setFx(fxId);
  panel.cycleFireworkEffect = (dir = 1) => {
    const d = Number(dir);
    const step = Number.isFinite(d) ? (d >= 0 ? 1 : -1) : 1;
    const next = (clampFxId(panel?.dataset?.fireworkFx) + step + FIREWORK_FX.length) % FIREWORK_FX.length;
    setFx(next);
    return next;
  };

  panel.onArtTrigger = (trigger = null) => {
    const slot = normalizeSlot(trigger?.slotIndex);
    setSlotActive(slot);
    try { pulseColorButtonHit(slot); } catch {}
    spawnBurst(slot, trigger?.velocity ?? null);
    return true;
  };

  panel.flash = (meta = null) => {
    const slot = normalizeSlot(meta?.slotIndex);
    setSlotActive(slot);
    try { pulseColorButtonHit(slot); } catch {}
    spawnBurst(slot, meta?.velocity ?? null);
  };
}

function buildLaserPath(points) {
  if (!Array.isArray(points) || points.length < 2) return '';
  let d = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i].x.toFixed(2)} ${points[i].y.toFixed(2)}`;
  }
  return d;
}

function setupLaserTrails(panel) {
  panel.classList.add('art-toy-lasers');

  // Defensive cleanup in case this setup runs more than once on the same panel.
  try {
    panel.querySelectorAll('.art-laser-layer, .art-lasers-drag-area, .art-lasers-handles').forEach((el) => {
      try { el.remove(); } catch {}
    });
  } catch {}

  const svgNS = 'http://www.w3.org/2000/svg';
  const layer = document.createElementNS(svgNS, 'svg');
  layer.setAttribute('class', 'art-laser-layer');
  layer.setAttribute('viewBox', '0 0 220 220');
  layer.setAttribute('preserveAspectRatio', 'none');
  panel.appendChild(layer);
  const guidesLayer = document.createElementNS(svgNS, 'g');
  guidesLayer.setAttribute('class', 'art-laser-guides');
  layer.appendChild(guidesLayer);
  const drawPreviewPath = document.createElementNS(svgNS, 'path');
  drawPreviewPath.setAttribute('class', 'art-laser-draw-preview');
  drawPreviewPath.setAttribute('fill', 'none');
  drawPreviewPath.setAttribute('stroke-linecap', 'round');
  drawPreviewPath.setAttribute('stroke-linejoin', 'round');
  drawPreviewPath.style.display = 'none';
  guidesLayer.appendChild(drawPreviewPath);
  const beamsLayer = document.createElementNS(svgNS, 'g');
  beamsLayer.setAttribute('class', 'art-laser-beams');
  layer.appendChild(beamsLayer);

  const dragAreaEl = document.createElement('div');
  dragAreaEl.className = 'art-lasers-drag-area';
  panel.appendChild(dragAreaEl);

  const handlesLayer = document.createElement('div');
  handlesLayer.className = 'art-lasers-handles';
  panel.appendChild(handlesLayer);

  const emitters = [
    { x: 20, y: 28 },
    { x: 110, y: 16 },
    { x: 200, y: 28 },
    { x: 206, y: 110 },
    { x: 200, y: 192 },
    { x: 110, y: 204 },
    { x: 20, y: 192 },
    { x: 14, y: 110 },
  ];
  const targets = emitters.map((e) => ({
    x: Math.max(22, Math.min(198, (e.x * 0.58) + 46)),
    y: Math.max(22, Math.min(198, (e.y * 0.58) + 46)),
  }));
  const slotPaths = emitters.map((source, i) => ([
    { x: Number(source.x) || 0, y: Number(source.y) || 0 },
    { x: Number(targets[i].x) || 0, y: Number(targets[i].y) || 0 },
  ]));
  const palette = ['#7bf6ff', '#86efac', '#fde047', '#f9a8d4', '#c4b5fd', '#67e8f9', '#fca5a5', '#a7f3d0'];
  const active = [];
  const ACTIVE_CAP = 56;
  const sourceHandleEls = [];
  const targetHandleEls = [];
  const rotateHandleEls = [];
  const guideEls = [];
  const baseBeamEls = [];
  let selectedColorSlot = null;
  let refreshCustomizeUi = () => {};
  let closeCustomizeUi = () => {};
  let setCustomiseOpen = () => {};
  let selectLineForCustomise = () => {};
  let syncSelectedHandleHighlight = () => {};
  let paintLineButtonColor = () => {};
  let pulseColorButtonHit = () => {};
  const drawStateBySlot = Array.from({ length: ART_SLOT_COUNT }, () => ({
    drawingTargetPath: false,
    startedTargetPath: false,
  }));
  const slotAwaitingBoardDraw = new Set();
  const activeSlots = new Set();
  const PANEL_PX = 220;
  const HANDLE_SIZE_PX = 62;
  const ROTATE_HANDLE_MIN_SEPARATION_PX = 16;
  // Global laser stroke thickness multiplier. Tweak this to scale all laser effects.
  let laserStrokeMultiplier = 5;
  // Laser style tuning (pulse/glow/runner). Keep these centralized for quick iteration.
  const LASER_STYLE = Object.freeze({
    baseOpacityOpaque: 0.95,
    baseOpacitySemi: 0.36,
    baseGlowOpaquePx: 10,
    baseGlowSemiPx: 6,
    pulseDurationMs: 500,
    pulseWidthScale: 3.65,
    pulseGlowPx: 80,
    pulseOverlayOpacity: 0.95,
    pulseOverlayFadeTo: 0.08,
    pulseOverlayWidthScale: 1.55,
    burstDurationMs: 520,
    burstGlowPx: 14,
    runnerDurationMs: 300,
    runnerGlowPx: 14,
    runnerWidthScaleOpaque: 3.9,
    runnerWidthScaleSoft: 1.6,
    runnerSegmentFraction: 0.26,
    runnerSegmentMin: 18,
    runnerSegmentMax: 86,
    transientGlowDefaultPx: 10,
  });
  const AREA_MIN_X = -94;
  const AREA_MIN_Y = 74;
  const MAX_DRAG_SPAN = 1600;
  const AREA_MAX_X = AREA_MIN_X + MAX_DRAG_SPAN;
  const AREA_MAX_Y = AREA_MIN_Y + MAX_DRAG_SPAN;
  const TOTAL_LIMIT_W = Math.max(1, AREA_MAX_X - AREA_MIN_X);
  const TOTAL_LIMIT_H = Math.max(1, AREA_MAX_Y - AREA_MIN_Y);
  const RANDOM_TOP_LEFT_QUARTER = {
    x: AREA_MIN_X,
    y: AREA_MIN_Y,
    w: TOTAL_LIMIT_W * 0.75,
    h: TOTAL_LIMIT_H * 0.75,
  };
  const dragArea = {
    x: AREA_MIN_X,
    y: AREA_MIN_Y,
    w: 384,
    h: 276,
  };
  const INITIAL_DRAG_W = dragArea.w;
  const INITIAL_DRAG_H = dragArea.h;

  const LASER_FX = Object.freeze([
    { id: 0, key: 'solidPulse', name: 'Solid Pulse' },
    { id: 1, key: 'softPulse', name: 'Soft Pulse' },
    { id: 2, key: 'burstThin', name: 'Burst Thin' },
    { id: 3, key: 'runner', name: 'Runner' },
    { id: 4, key: 'solidRunner', name: 'Solid + Runner' },
    { id: 5, key: 'softRunner', name: 'Soft + Runner' },
  ]);
  const clampFxId = (v) => {
    const n = Math.trunc(Number(v));
    return Number.isFinite(n) && n >= 0 && n < LASER_FX.length ? n : 0;
  };
  let currentFxId = 0;
  let syncFxUi = () => {};
  const setFx = (nextId, { announce = true } = {}) => {
    currentFxId = clampFxId(nextId);
    panel.dataset.laserFx = String(currentFxId);
    try { syncAllBaseBeams(); } catch {}
    try { syncAllHandles(); } catch {}
    try { syncFxUi(); } catch {}
    if (announce) markSceneDirtySafe();
  };
  setFx(0, { announce: false });

  const clampAnchorX = (v) => {
    const n = Number(v) || 0;
    return Math.max(AREA_MIN_X, Math.min(AREA_MAX_X, n));
  };
  const clampAnchorY = (v) => {
    const n = Number(v) || 0;
    return Math.max(AREA_MIN_Y, Math.min(AREA_MAX_Y, n));
  };
  const buildStraightPath = (slot) => {
    const i = normalizeSlot(slot);
    const source = emitters[i];
    const target = targets[i];
    if (!source || !target) return [];
    return [
      { x: clampAnchorX(source.x), y: clampAnchorY(source.y) },
      { x: clampAnchorX(target.x), y: clampAnchorY(target.y) },
    ];
  };
  const setSlotPath = (slot, points, { lockEndpoints = true } = {}) => {
    const i = normalizeSlot(slot);
    const source = emitters[i];
    const target = targets[i];
    if (!source || !target) return;
    const fallback = buildStraightPath(i);
    if (!Array.isArray(points) || points.length < 2) {
      slotPaths[i] = fallback;
      return;
    }
    const normalized = [];
    for (const point of points) {
      if (!point || typeof point !== 'object') continue;
      normalized.push({
        x: clampAnchorX(point.x),
        y: clampAnchorY(point.y),
      });
    }
    if (normalized.length < 2) {
      slotPaths[i] = fallback;
      return;
    }
    if (lockEndpoints) {
      normalized[0].x = clampAnchorX(source.x);
      normalized[0].y = clampAnchorY(source.y);
      normalized[normalized.length - 1].x = clampAnchorX(target.x);
      normalized[normalized.length - 1].y = clampAnchorY(target.y);
    }
    slotPaths[i] = normalized;
  };
  const getSlotPath = (slot, { allowDraft = false } = {}) => {
    const i = normalizeSlot(slot);
    const points = slotPaths[i];
    const minCount = allowDraft ? 1 : 2;
    if (!Array.isArray(points) || points.length < minCount) {
      const next = buildStraightPath(i);
      slotPaths[i] = next;
      return next;
    }
    return points;
  };
  const alignAnchorsFromPath = (slot) => {
    const i = normalizeSlot(slot);
    const points = getSlotPath(i);
    if (!points.length) return;
    const first = points[0];
    const last = points[points.length - 1];
    emitters[i].x = clampAnchorX(first.x);
    emitters[i].y = clampAnchorY(first.y);
    targets[i].x = clampAnchorX(last.x);
    targets[i].y = clampAnchorY(last.y);
  };
  const appendPathPoint = (slot, x, y, minStep = 2.6) => {
    const i = normalizeSlot(slot);
    const points = getSlotPath(i, { allowDraft: true });
    const px = clampAnchorX(x);
    const py = clampAnchorY(y);
    if (!points.length) {
      points.push({ x: px, y: py });
      return;
    }
    const last = points[points.length - 1];
    const dist = Math.hypot(px - last.x, py - last.y);
    if (!Number.isFinite(dist) || dist < minStep) {
      last.x = px;
      last.y = py;
      return;
    }
    points.push({ x: px, y: py });
  };
  const clientToPanelPoint = (clientX, clientY) => {
    const rect = layer.getBoundingClientRect();
    if (!rect || rect.width < 1 || rect.height < 1) return null;
    return {
      x: ((clientX - rect.left) / rect.width) * PANEL_PX,
      y: ((clientY - rect.top) / rect.height) * PANEL_PX,
    };
  };
  const rotateSlotPath = (slot, deltaRad, basePoints = null) => {
    const i = normalizeSlot(slot);
    const source = emitters[i];
    if (!source) return false;
    const points = Array.isArray(basePoints) && basePoints.length
      ? basePoints
      : getSlotPath(i).map((p) => ({ x: p.x, y: p.y }));
    if (!points || points.length < 2) return false;
    const a = Number(deltaRad) || 0;
    const cosA = Math.cos(a);
    const sinA = Math.sin(a);
    const sx = source.x;
    const sy = source.y;
    const rotated = points.map((p, idx) => {
      if (idx === 0) return { x: clampAnchorX(sx), y: clampAnchorY(sy) };
      const ox = p.x - sx;
      const oy = p.y - sy;
      const rx = sx + (ox * cosA - oy * sinA);
      const ry = sy + (ox * sinA + oy * cosA);
      return { x: clampAnchorX(rx), y: clampAnchorY(ry) };
    });
    setSlotPath(i, rotated, { lockEndpoints: false });
    alignAnchorsFromPath(i);
    return true;
  };
  const moveWholePath = (slot, desiredDx, desiredDy) => {
    const i = normalizeSlot(slot);
    const points = getSlotPath(i);
    if (!points.length) return;
    const minX = Math.min(...points.map((p) => p.x));
    const maxX = Math.max(...points.map((p) => p.x));
    const minY = Math.min(...points.map((p) => p.y));
    const maxY = Math.max(...points.map((p) => p.y));
    const dx = Math.max(AREA_MIN_X - minX, Math.min(AREA_MAX_X - maxX, Number(desiredDx) || 0));
    const dy = Math.max(AREA_MIN_Y - minY, Math.min(AREA_MAX_Y - maxY, Number(desiredDy) || 0));
    if (Math.abs(dx) < 0.0001 && Math.abs(dy) < 0.0001) return;
    for (const point of points) {
      point.x += dx;
      point.y += dy;
    }
    alignAnchorsFromPath(i);
  };
  const generateWindyPath = (slot, area = dragArea) => {
    const i = normalizeSlot(slot);
    const areaX = Number.isFinite(Number(area?.x)) ? Number(area.x) : dragArea.x;
    const areaY = Number.isFinite(Number(area?.y)) ? Number(area.y) : dragArea.y;
    const areaW = Math.max(1, Number.isFinite(Number(area?.w)) ? Number(area.w) : dragArea.w);
    const areaH = Math.max(1, Number.isFinite(Number(area?.h)) ? Number(area.h) : dragArea.h);
    const areaCx = areaX + areaW * 0.5;
    const areaCy = areaY + areaH * 0.5;
    const innerMarginX = Math.min(84, areaW * 0.22);
    const innerMarginY = Math.min(84, areaH * 0.22);

    const sx = clampAnchorX((areaCx - (areaW * 0.5 - innerMarginX)) + Math.random() * Math.max(1, areaW - innerMarginX * 2));
    const sy = clampAnchorY((areaCy - (areaH * 0.5 - innerMarginY)) + Math.random() * Math.max(1, areaH - innerMarginY * 2));

    const diag = Math.hypot(areaW, areaH);
    const minLen = Math.max(260, diag * 0.28);
    const maxLen = Math.max(minLen + 40, diag * 0.68);
    let tx = sx;
    let ty = sy;
    let len = 0;
    for (let tries = 0; tries < 7; tries++) {
      const angle = Math.random() * Math.PI * 2;
      const desiredLen = minLen + Math.random() * (maxLen - minLen);
      const candidateX = clampAnchorX(sx + Math.cos(angle) * desiredLen);
      const candidateY = clampAnchorY(sy + Math.sin(angle) * desiredLen);
      const candidateLen = Math.hypot(candidateX - sx, candidateY - sy);
      if (candidateLen > len) {
        tx = candidateX;
        ty = candidateY;
        len = candidateLen;
      }
      if (candidateLen >= minLen * 0.9) break;
    }
    len = Math.max(16, len || Math.hypot(tx - sx, ty - sy));
    const dirX = (tx - sx) / len;
    const dirY = (ty - sy) / len;
    const normalX = -dirY;
    const normalY = dirX;
    const turns = 1.0 + Math.random() * 1.2;
    const phaseA = Math.random() * Math.PI * 2;
    const phaseB = Math.random() * Math.PI * 2;
    const bend = Math.min(96, Math.max(24, len * (0.14 + Math.random() * 0.2)));
    const pointSpacing = 34 + Math.random() * 12;
    const points = [{ x: sx, y: sy }];
    const steps = Math.max(5, Math.min(14, Math.round(len / pointSpacing)));
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const baseX = sx + (tx - sx) * t;
      const baseY = sy + (ty - sy) * t;
      const envelope = Math.sin(Math.PI * t);
      const waveA = Math.sin((t * Math.PI * 2 * turns) + phaseA) * bend * envelope;
      const waveB = Math.sin((t * Math.PI * 2 * (turns * 0.55)) + phaseB) * bend * 0.34 * envelope;
      const wave = waveA + waveB;
      const px = clampAnchorX(baseX + normalX * wave);
      const py = clampAnchorY(baseY + normalY * wave);
      points.push({ x: px, y: py });
    }
    points.push({ x: tx, y: ty });

    emitters[i].x = sx;
    emitters[i].y = sy;
    targets[i].x = tx;
    targets[i].y = ty;
    setSlotPath(i, points);
    alignAnchorsFromPath(i);
  };
  const getLaserBaseWidth = (fxId) => {
    const id = clampFxId(fxId);
    if (id === 2) return 6.6;
    if (id === 3) return 5.0;
    return 5.4;
  };
  const getFxProfile = (fxId) => {
    switch (clampFxId(fxId)) {
      case 0:
        return { baseMode: 'opaque', beatMode: 'pulse-thicken' };
      case 1:
        return { baseMode: 'semi', beatMode: 'pulse-opaque' };
      case 2:
        return { baseMode: 'none', beatMode: 'burst-thin' };
      case 3:
        return { baseMode: 'none', beatMode: 'runner' };
      case 4:
        return { baseMode: 'opaque', beatMode: 'runner' };
      case 5:
        return { baseMode: 'semi', beatMode: 'runner-opaque' };
      default:
        return { baseMode: 'opaque', beatMode: 'pulse-thicken' };
    }
  };
  const isSlotAwaitingBoardDraw = (slot) => slotAwaitingBoardDraw.has(normalizeSlot(slot));
  const setSlotAwaitingBoardDraw = (slot, awaiting) => {
    const i = normalizeSlot(slot);
    if (awaiting) slotAwaitingBoardDraw.add(i);
    else slotAwaitingBoardDraw.delete(i);
  };
  const syncActiveStateFlags = () => {
    panel.dataset.hasActiveLasers = activeSlots.size > 0 ? '1' : '0';
  };
  const isBoardDrawArmed = () => {
    if (panel.dataset.controlsVisible !== '1') return false;
    if (selectedColorSlot == null) return false;
    return isSlotAwaitingBoardDraw(selectedColorSlot);
  };
  const syncDragArea = () => {
    dragAreaEl.style.left = `${AREA_MIN_X.toFixed(2)}px`;
    dragAreaEl.style.top = `${AREA_MIN_Y.toFixed(2)}px`;
    dragAreaEl.style.width = `${TOTAL_LIMIT_W.toFixed(2)}px`;
    dragAreaEl.style.height = `${TOTAL_LIMIT_H.toFixed(2)}px`;
    dragAreaEl.classList.toggle('is-board-draw-armed', isBoardDrawArmed());
  };
  const logLaserDrawAreaDebug = (reason = 'manual') => {
    try {
      const pr = panel.getBoundingClientRect?.();
      const dr = dragAreaEl.getBoundingClientRect?.();
      const ratio = (pr && dr && pr.width > 0 && pr.height > 0)
        ? {
          x: Number((dr.width / pr.width).toFixed(3)),
          y: Number((dr.height / pr.height).toFixed(3)),
        }
        : null;
      console.log('[LightPaths][draw-area]', {
        reason,
        panelId: panel.id,
        panelStyleSize: {
          w: panel.style?.width || null,
          h: panel.style?.height || null,
        },
        panelOffset: {
          w: Number(panel.offsetWidth || 0),
          h: Number(panel.offsetHeight || 0),
        },
        panelRect: pr ? { w: Number(pr.width.toFixed(2)), h: Number(pr.height.toFixed(2)) } : null,
        drawRect: dr ? { w: Number(dr.width.toFixed(2)), h: Number(dr.height.toFixed(2)) } : null,
        ratio,
        styles: {
          left: dragAreaEl.style.left,
          top: dragAreaEl.style.top,
          width: dragAreaEl.style.width,
          height: dragAreaEl.style.height,
        },
      });
    } catch {}
  };
  const logLaserSizeMetrics = (reason = 'manual') => {
    try {
      const fxId = clampFxId(panel?.dataset?.laserFx);
      const widthWorld = Math.max(1.2, getLaserBaseWidth(fxId) * laserStrokeMultiplier);
      const panelRect = panel.getBoundingClientRect?.();
      const panelScreenW = Math.max(1, Number(panelRect?.width) || 1);
      const worldToScreen = panelScreenW / 220;
      const widthScreen = widthWorld * worldToScreen;
      const slots = Array.from(activeSlots.values()).map((s) => normalizeSlot(s)).sort((a, b) => a - b);
      let totalLen = 0;
      let pathCount = 0;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const slot of slots) {
        const pts = getSlotPath(slot);
        if (!Array.isArray(pts) || pts.length < 2) continue;
        pathCount += 1;
        for (let i = 0; i < pts.length; i++) {
          const p = pts[i];
          const x = Number(p?.x) || 0;
          const y = Number(p?.y) || 0;
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
          if (i > 0) {
            const prev = pts[i - 1];
            totalLen += Math.hypot(x - (Number(prev?.x) || 0), y - (Number(prev?.y) || 0));
          }
        }
      }
      const boundsWorld = pathCount
        ? { w: Number((maxX - minX).toFixed(2)), h: Number((maxY - minY).toFixed(2)) }
        : { w: 0, h: 0 };
      console.log('[ArtSize][LightPaths]', {
        reason,
        panelId: panel.id,
        fxId,
        activeSlots: slots.length,
        pathCount,
        totalPathLenWorld: Number(totalLen.toFixed(2)),
        boundsWorld,
        strokeWidthWorld: Number(widthWorld.toFixed(3)),
        strokeWidthScreen: Number(widthScreen.toFixed(3)),
        worldToScreen: Number(worldToScreen.toFixed(4)),
      });
    } catch {}
  };
  try {
    panel.__debugLaserDrawArea = logLaserDrawAreaDebug;
    panel.__debugLaserSizeMetrics = logLaserSizeMetrics;
    if (window.__MT_DEBUG_STICKER_DRAW_AREA || window.__MT_DEBUG_ART_DRAW_AREA) {
      requestAnimationFrame(() => logLaserDrawAreaDebug('init'));
      setTimeout(() => logLaserDrawAreaDebug('post-timeout'), 120);
    }
    if (window.__MT_DEBUG_ART_SIZE) {
      requestAnimationFrame(() => logLaserSizeMetrics('init'));
      setTimeout(() => logLaserSizeMetrics('post-timeout'), 120);
    }
  } catch {}
  const syncDrawPreview = (slot, { visible = false } = {}) => {
    const i = normalizeSlot(slot);
    if (!visible) {
      drawPreviewPath.style.display = 'none';
      return;
    }
    const points = getSlotPath(i, { allowDraft: true });
    if (!Array.isArray(points) || !points.length) {
      drawPreviewPath.style.display = 'none';
      return;
    }
    const pathPoints = points.length >= 2 ? points : [
      { x: points[0].x, y: points[0].y },
      { x: points[0].x, y: points[0].y },
    ];
    const fxId = clampFxId(panel?.dataset?.laserFx);
    const profile = getFxProfile(fxId);
    const width = Math.max(1.2, getLaserBaseWidth(fxId) * laserStrokeMultiplier);
    drawPreviewPath.setAttribute('d', buildLaserPath(pathPoints));
    drawPreviewPath.setAttribute('stroke', palette[i % palette.length]);
    if (profile.baseMode === 'none') {
      drawPreviewPath.setAttribute('stroke-width', '1.4');
      drawPreviewPath.style.strokeDasharray = '2.8 6.2';
    } else {
      drawPreviewPath.setAttribute('stroke-width', String(width));
      drawPreviewPath.style.strokeDasharray = 'none';
    }
    drawPreviewPath.style.display = '';
  };
  const setHandleIconFacing = (handle, facingAngleRad) => {
    if (!handle) return;
    const core = handle.querySelector('.c-btn-core');
    if (!core) return;
    const angle = (Number(facingAngleRad) || 0) - (Math.PI * 0.5);
    core.style.transform = `rotate(${angle.toFixed(4)}rad)`;
    core.style.transformOrigin = '50% 50%';
  };
  const syncHandle = (slot, kind) => {
    const i = normalizeSlot(slot);
    const pos = kind === 'target' ? targets[i] : emitters[i];
    const handle = kind === 'target' ? targetHandleEls[i] : sourceHandleEls[i];
    if (!handle || !pos) return;
    const hiddenForRedraw = isSlotAwaitingBoardDraw(i);
    handle.style.display = hiddenForRedraw ? 'none' : '';
    if (hiddenForRedraw) return;
    handle.style.left = `${(pos.x - HANDLE_SIZE_PX * 0.5).toFixed(2)}px`;
    handle.style.top = `${(pos.y - HANDLE_SIZE_PX * 0.5).toFixed(2)}px`;
    if (kind === 'target') {
      const points = getSlotPath(i);
      const last = points[points.length - 1];
      const prev = points.length >= 2 ? points[points.length - 2] : null;
      const dx = (last?.x ?? pos.x) - (prev?.x ?? pos.x);
      const dy = (last?.y ?? pos.y) - (prev?.y ?? pos.y);
      const angle = Math.hypot(dx, dy) > 0.1 ? Math.atan2(dy, dx) : 0;
      setHandleIconFacing(handle, angle);
      return;
    }
    setHandleIconFacing(handle, 0);
  };
  const syncGuide = (slot) => {
    const i = normalizeSlot(slot);
    const guide = guideEls[i];
    if (!guide) return;
    if (isSlotAwaitingBoardDraw(i)) {
      guide.style.display = 'none';
      return;
    }
    const points = getSlotPath(i);
    guide.setAttribute('d', buildLaserPath(points));
    const fxId = clampFxId(panel?.dataset?.laserFx);
    const profile = getFxProfile(fxId);
    const showGuide = profile.baseMode === 'none';
    guide.style.display = showGuide ? '' : 'none';
  };
  const syncBaseBeam = (slot) => {
    const i = normalizeSlot(slot);
    const beam = baseBeamEls[i];
    if (!beam) return;
    if (isSlotAwaitingBoardDraw(i)) {
      beam.style.display = 'none';
      return;
    }
    const points = getSlotPath(i);
    beam.setAttribute('d', buildLaserPath(points));
    beam.setAttribute('stroke', palette[i % palette.length]);
    beam.setAttribute('fill', 'none');
    beam.setAttribute('stroke-linecap', 'round');
    beam.setAttribute('stroke-linejoin', 'round');
    const fxId = clampFxId(panel?.dataset?.laserFx);
    const profile = getFxProfile(fxId);
    const visible = activeSlots.has(i) && profile.baseMode !== 'none';
    const baseWidth = getLaserBaseWidth(fxId) * laserStrokeMultiplier;
    const baseOpacity = profile.baseMode === 'semi' ? LASER_STYLE.baseOpacitySemi : LASER_STYLE.baseOpacityOpaque;
    const glowPx = profile.baseMode === 'semi' ? LASER_STYLE.baseGlowSemiPx : LASER_STYLE.baseGlowOpaquePx;
    beam.style.display = visible ? '' : 'none';
    beam.style.opacity = String(baseOpacity);
    beam.style.filter = `drop-shadow(0 0 ${glowPx}px currentColor)`;
    beam.style.strokeWidth = `${baseWidth}`;
    beam.setAttribute('stroke-width', String(baseWidth));
  };
  const syncRotationHandle = (slot) => {
    const i = normalizeSlot(slot);
    const handle = rotateHandleEls[i];
    if (!handle) return;
    const hiddenForRedraw = isSlotAwaitingBoardDraw(i);
    handle.style.display = hiddenForRedraw ? 'none' : '';
    if (hiddenForRedraw) {
      handle.classList.remove('is-visible');
      return;
    }
    const source = emitters[i];
    const points = getSlotPath(i);
    if (!source || !points.length) return;
    const target = targets[i] || points[points.length - 1];
    let facing = target || points[points.length - 1];
    if (!facing || Math.hypot(facing.x - source.x, facing.y - source.y) <= 0.8) {
      for (let p = 1; p < points.length; p++) {
        const probe = points[p];
        if (Math.hypot(probe.x - source.x, probe.y - source.y) > 0.8) {
          facing = probe;
          break;
        }
      }
    }
    const dx = facing.x - source.x;
    const dy = facing.y - source.y;
    const len = Math.hypot(dx, dy);
    const dirX = len > 0.8 ? (dx / len) : 1;
    const dirY = len > 0.8 ? (dy / len) : 0;
    const offset = 60;
    const hx = source.x + dirX * offset;
    const hy = source.y + dirY * offset;
    handle.style.left = `${(hx - HANDLE_SIZE_PX * 0.5).toFixed(2)}px`;
    handle.style.top = `${(hy - HANDLE_SIZE_PX * 0.5).toFixed(2)}px`;
    const facingAngle = Math.atan2(dirY, dirX);
    setHandleIconFacing(handle, facingAngle + Math.PI);
    const endpointSeparation = target ? Math.hypot(target.x - source.x, target.y - source.y) : 0;
    const visible =
      panel.dataset.controlsVisible === '1' &&
      selectedColorSlot != null &&
      normalizeSlot(selectedColorSlot) === i &&
      activeSlots.has(i) &&
      endpointSeparation >= ROTATE_HANDLE_MIN_SEPARATION_PX;
    handle.classList.toggle('is-visible', visible);
  };
  const updateSlotColor = (slot, color, { announce = true } = {}) => {
    const i = normalizeSlot(slot);
    const hex = String(color || '').trim();
    if (!/^#([0-9a-f]{6})$/i.test(hex)) return;
    palette[i] = hex;
    const guide = guideEls[i];
    if (guide) guide.setAttribute('stroke', hex);
    syncBaseBeam(i);
    paintLineButtonColor(i, hex);
    if (announce) markSceneDirtySafe();
  };
  const syncAllBaseBeams = () => {
    for (let i = 0; i < ART_SLOT_COUNT; i++) syncBaseBeam(i);
  };
  syncSelectedHandleHighlight = () => {
    for (let i = 0; i < ART_SLOT_COUNT; i++) {
      sourceHandleEls[i]?.classList.toggle(
        'is-selected-line',
        selectedColorSlot != null && normalizeSlot(selectedColorSlot) === i
      );
      syncRotationHandle(i);
    }
  };
  const syncAllHandles = () => {
    for (let i = 0; i < ART_SLOT_COUNT; i++) {
      syncHandle(i, 'source');
      syncHandle(i, 'target');
      syncGuide(i);
      syncBaseBeam(i);
      syncRotationHandle(i);
    }
    syncSelectedHandleHighlight();
  };
  const setSlotActive = (slot) => {
    const i = normalizeSlot(slot);
    activeSlots.add(i);
    sourceHandleEls[i]?.classList.add('is-active-firework');
    targetHandleEls[i]?.classList.add('is-active-firework');
    guideEls[i]?.classList.add('is-active-firework');
    syncBaseBeam(i);
    syncActiveStateFlags();
    try { refreshCustomizeUi(); } catch {}
  };
  const setSlotInactive = (slot) => {
    const i = normalizeSlot(slot);
    activeSlots.delete(i);
    sourceHandleEls[i]?.classList.remove('is-active-firework');
    targetHandleEls[i]?.classList.remove('is-active-firework');
    guideEls[i]?.classList.remove('is-active-firework');
    syncBaseBeam(i);
    syncActiveStateFlags();
    try { refreshCustomizeUi(); } catch {}
  };
  const activateAllSlots = () => {
    for (let i = 0; i < ART_SLOT_COUNT; i++) setSlotActive(i);
  };
  const fitDragAreaToAnchors = () => {
    const activeList = Array.from(activeSlots);
    const useSlots = activeList.length ? activeList : Array.from({ length: ART_SLOT_COUNT }, (_, i) => i);
    const coords = [];
    for (const i of useSlots) {
      const s = emitters[i];
      const t = targets[i];
      if (s) coords.push({ x: clampAnchorX(s.x), y: clampAnchorY(s.y) });
      if (t) coords.push({ x: clampAnchorX(t.x), y: clampAnchorY(t.y) });
      const points = getSlotPath(i);
      for (const point of points) {
        coords.push({ x: clampAnchorX(point.x), y: clampAnchorY(point.y) });
      }
    }
    if (!coords.length) {
      dragArea.x = AREA_MIN_X;
      dragArea.y = AREA_MIN_Y;
      dragArea.w = INITIAL_DRAG_W;
      dragArea.h = INITIAL_DRAG_H;
      syncDragArea();
      return;
    }
    const pad = 28;
    const maxX = Math.max(...coords.map((p) => p.x));
    const maxY = Math.max(...coords.map((p) => p.y));
    const right = Math.min(AREA_MAX_X, maxX + pad);
    const bottom = Math.min(AREA_MAX_Y, maxY + pad);
    dragArea.x = AREA_MIN_X;
    dragArea.y = AREA_MIN_Y;
    dragArea.w = Math.max(INITIAL_DRAG_W, right - AREA_MIN_X);
    dragArea.h = Math.max(INITIAL_DRAG_H, bottom - AREA_MIN_Y);
    syncDragArea();
  };

  const randomizeAnchorsWithinArea = (area = dragArea) => {
    for (let i = 0; i < ART_SLOT_COUNT; i++) {
      setSlotAwaitingBoardDraw(i, false);
      generateWindyPath(i, area);
    }
  };

  const makeHandle = (slot, kind) => {
    const handleBtn = document.createElement('button');
    handleBtn.type = 'button';
    handleBtn.className = `c-btn art-laser-handle-btn art-laser-handle-${kind}`;
    handleBtn.title = `${kind === 'target' ? 'Move Laser Target' : 'Move Laser Source'} ${slot + 1}`;
    handleBtn.setAttribute('aria-label', `${kind === 'target' ? 'Move Laser Target' : 'Move Laser Source'} ${slot + 1}`);
    handleBtn.style.setProperty('--c-btn-size', '62px');
    handleBtn.innerHTML = BUTTON_ICON_HTML;
    const core = handleBtn.querySelector('.c-btn-core');
    if (core) core.style.setProperty(
      '--c-btn-icon-url',
      kind === 'source'
        ? "url('./assets/UI/T_ButtonDrag.png')"
        : "url('./assets/UI/T_ButtonHandle.png')"
    );
    if (kind === 'source') handleBtn.style.setProperty('--accent', '#2f5fb7');

    const pos = kind === 'target' ? targets : emitters;
    attachSlotHandleDrag({
      handleBtn,
      layer,
      panelPx: PANEL_PX,
      getStartPos: () => ({ x: pos[slot].x, y: pos[slot].y }),
      setPos: (x, y) => {
        if (kind === 'source') {
          const dx = x - emitters[slot].x;
          const dy = y - emitters[slot].y;
          moveWholePath(slot, dx, dy);
        } else {
          const drawState = drawStateBySlot[slot];
          if (drawState && !drawState.startedTargetPath) {
            // Keep the existing curve and continue drawing from its current end.
            appendPathPoint(slot, x, y, 0);
            drawState.startedTargetPath = true;
          } else {
            appendPathPoint(slot, x, y);
          }
          alignAnchorsFromPath(slot);
        }
        fitDragAreaToAnchors();
        syncHandle(slot, kind);
        if (kind === 'source') syncHandle(slot, 'target');
        else syncHandle(slot, 'source');
        syncGuide(slot);
        syncBaseBeam(slot);
        syncRotationHandle(slot);
      },
      clampX: kind === 'target' ? clampAnchorX : undefined,
      clampY: kind === 'target' ? clampAnchorY : undefined,
      onDragStateChange: (active) => {
        dragAreaEl.classList.toggle('is-dragging', !!active);
        if (kind !== 'target') return;
        const drawState = drawStateBySlot[slot];
        if (!drawState) return;
        if (active) {
          drawState.drawingTargetPath = true;
          drawState.startedTargetPath = false;
          return;
        }
        if (drawState.drawingTargetPath) {
          const points = getSlotPath(slot);
          if (points.length < 2) {
            setSlotPath(slot, buildStraightPath(slot));
          }
          alignAnchorsFromPath(slot);
          syncHandle(slot, 'source');
          syncHandle(slot, 'target');
          syncGuide(slot);
          syncBaseBeam(slot);
          syncRotationHandle(slot);
          drawState.drawingTargetPath = false;
          drawState.startedTargetPath = false;
        }
      },
      onCommit: () => markSceneDirtySafe(),
      onTap: () => {
        if (kind !== 'source') return;
        selectLineForCustomise(slot, { openMenu: true });
      },
    });

    handlesLayer.appendChild(handleBtn);
    if (kind === 'target') targetHandleEls[slot] = handleBtn;
    else sourceHandleEls[slot] = handleBtn;
    syncHandle(slot, kind);
  };

  const makeRotateHandle = (slot) => {
    const handleBtn = document.createElement('button');
    handleBtn.type = 'button';
    handleBtn.className = 'c-btn art-laser-handle-btn art-laser-rotate-btn';
    handleBtn.title = `Rotate Laser ${slot + 1}`;
    handleBtn.setAttribute('aria-label', `Rotate laser ${slot + 1}`);
    handleBtn.style.setProperty('--c-btn-size', '58px');
    handleBtn.innerHTML = BUTTON_ICON_HTML;
    const core = handleBtn.querySelector('.c-btn-core');
    if (core) core.style.setProperty('--c-btn-icon-url', "url('./assets/UI/T_ButtonRotate.png')");

    let rotateActive = false;
    let rotatePointerId = null;
    let startAngle = 0;
    let basePoints = [];
    let moved = false;

    const endRotate = (ev) => {
      if (!rotateActive) return;
      if (rotatePointerId != null && ev.pointerId !== rotatePointerId) return;
      ev.preventDefault();
      ev.stopPropagation();
      rotateActive = false;
      try { handleBtn.releasePointerCapture(ev.pointerId); } catch {}
      rotatePointerId = null;
      if (moved) markSceneDirtySafe();
    };

    handleBtn.addEventListener('pointerdown', (ev) => {
      if (ev.button != null && ev.button !== 0) return;
      ev.preventDefault();
      ev.stopPropagation();
      const source = emitters[slot];
      const pt = clientToPanelPoint(ev.clientX, ev.clientY);
      if (!source || !pt) return;
      const dx = pt.x - source.x;
      const dy = pt.y - source.y;
      startAngle = Math.atan2(dy, dx);
      basePoints = getSlotPath(slot).map((p) => ({ x: p.x, y: p.y }));
      moved = false;
      rotateActive = true;
      rotatePointerId = ev.pointerId;
      try { handleBtn.setPointerCapture(ev.pointerId); } catch {}
      selectLineForCustomise(slot, { openMenu: true });
    });

    handleBtn.addEventListener('pointermove', (ev) => {
      if (!rotateActive) return;
      if (rotatePointerId != null && ev.pointerId !== rotatePointerId) return;
      ev.preventDefault();
      ev.stopPropagation();
      const source = emitters[slot];
      const pt = clientToPanelPoint(ev.clientX, ev.clientY);
      if (!source || !pt) return;
      const angle = Math.atan2(pt.y - source.y, pt.x - source.x);
      let delta = angle - startAngle;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      const didRotate = rotateSlotPath(slot, delta, basePoints);
      if (!didRotate) return;
      moved = moved || Math.abs(delta) > 0.0001;
      fitDragAreaToAnchors();
      syncHandle(slot, 'source');
      syncHandle(slot, 'target');
      syncGuide(slot);
      syncBaseBeam(slot);
      syncRotationHandle(slot);
    });

    handleBtn.addEventListener('pointerup', endRotate);
    handleBtn.addEventListener('pointercancel', endRotate);

    handlesLayer.appendChild(handleBtn);
    rotateHandleEls[slot] = handleBtn;
    syncRotationHandle(slot);
  };

  randomizeAnchorsWithinArea();
  syncDragArea();
  syncActiveStateFlags();
  for (let i = 0; i < ART_SLOT_COUNT; i++) {
    const beam = document.createElementNS(svgNS, 'path');
    beam.setAttribute('class', 'art-laser-base-beam');
    beamsLayer.appendChild(beam);
    baseBeamEls[i] = beam;
    syncBaseBeam(i);
  }
  for (let i = 0; i < ART_SLOT_COUNT; i++) {
    const guide = document.createElementNS(svgNS, 'path');
    guide.setAttribute('class', 'art-laser-guide');
    guide.setAttribute('stroke', palette[i % palette.length]);
    guide.setAttribute('fill', 'none');
    guide.setAttribute('stroke-linecap', 'round');
    guide.setAttribute('stroke-linejoin', 'round');
    guidesLayer.appendChild(guide);
    guideEls[i] = guide;
    syncGuide(i);
  }
  for (let i = 0; i < ART_SLOT_COUNT; i++) {
    makeHandle(i, 'source');
    makeHandle(i, 'target');
    makeRotateHandle(i);
  }

  // Customise Art: thickness slider + active-line color picker.
  let thicknessControlApi = null;
  let previewLoopTimer = 0;

  const stopPreviewLoop = () => {
    if (previewLoopTimer) clearTimeout(previewLoopTimer);
    previewLoopTimer = 0;
  };

  const startPreviewLoopForSlot = (slot) => {
    stopPreviewLoop();
    const i = normalizeSlot(slot);
    const PREVIEW_LOOP_VELOCITY = 0.5;
    const isScenePlaying = () => {
      try { return !!document.querySelector('.toy-panel.toy-playing'); } catch {}
      return false;
    };
    const tick = () => {
      if (!panel.isConnected) return;
      if (selectedColorSlot == null || normalizeSlot(selectedColorSlot) !== i) return;
      if (!isScenePlaying() && !isSlotAwaitingBoardDraw(i)) spawnLaser(i, PREVIEW_LOOP_VELOCITY);
      previewLoopTimer = setTimeout(tick, 760);
    };
    tick();
  };

  const customisePanel = document.createElement('div');
  customisePanel.className = 'art-line-style-panel';
  customisePanel.hidden = true;
  panel.appendChild(customisePanel);

  thicknessControlApi = createArtLineThicknessControl({
    label: 'Line Thickness',
    min: 1,
    max: 20,
    step: 0.1,
    value: laserStrokeMultiplier,
    onInput: (nextValue) => {
      const n = Number(nextValue);
      if (!Number.isFinite(n)) return;
      laserStrokeMultiplier = Math.max(0.2, n);
      syncAllBaseBeams();
      if (boardDrawSlot != null) syncDrawPreview(boardDrawSlot, { visible: true });
    },
    onCommit: () => markSceneDirtySafe(),
  });
  customisePanel.appendChild(thicknessControlApi.root);

  const lineButtonsTitle = document.createElement('div');
  lineButtonsTitle.className = 'art-line-style-subhead art-line-style-subhead-active-lines';
  lineButtonsTitle.textContent = 'Paint Color';
  customisePanel.appendChild(lineButtonsTitle);

  const lineButtonsHost = document.createElement('div');
  lineButtonsHost.className = 'art-line-color-buttons';
  customisePanel.appendChild(lineButtonsHost);
  const colorButtonHitUntilBySlot = new Map();
  const colorButtonHitTimerBySlot = new Map();
  const applyColorButtonHitState = (slot) => {
    const i = normalizeSlot(slot);
    const btn = lineButtonsHost.querySelector(`button[data-slot="${i}"]`);
    if (!btn) return;
    const until = Number(colorButtonHitUntilBySlot.get(i) || 0);
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    btn.classList.toggle('is-note-hit', until > now);
  };
  pulseColorButtonHit = (slot) => {
    const i = normalizeSlot(slot);
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const until = now + 320;
    colorButtonHitUntilBySlot.set(i, until);
    const btn = lineButtonsHost.querySelector(`button[data-slot="${i}"]`);
    if (btn) {
      btn.classList.remove('is-note-hit');
      // Restart animation for rapid retriggers.
      void btn.offsetWidth;
      btn.classList.add('is-note-hit');
    }
    try { clearTimeout(colorButtonHitTimerBySlot.get(i)); } catch {}
    colorButtonHitTimerBySlot.set(i, setTimeout(() => {
      const latestUntil = Number(colorButtonHitUntilBySlot.get(i) || 0);
      const checkNow = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      if (latestUntil > checkNow) return;
      colorButtonHitUntilBySlot.delete(i);
      applyColorButtonHitState(i);
      colorButtonHitTimerBySlot.delete(i);
    }, 340));
  };

  const pickerTitle = document.createElement('div');
  pickerTitle.className = 'art-line-style-subhead';
  pickerTitle.textContent = 'Line Color';
  pickerTitle.hidden = true;
  customisePanel.appendChild(pickerTitle);

  const pickerWrap = document.createElement('div');
  pickerWrap.className = 'art-line-color-picker-wrap';
  pickerWrap.hidden = true;
  customisePanel.appendChild(pickerWrap);

  const pickerRow = document.createElement('div');
  pickerRow.className = 'art-line-picker-row';
  pickerWrap.appendChild(pickerRow);

  const pickerApi = createArtHueSatPicker({
    size: 296,
    color: palette[0],
    onChange: ({ hex } = {}) => {
      if (selectedColorSlot == null) return;
      updateSlotColor(selectedColorSlot, hex, { announce: false });
    },
    onCommit: ({ hex } = {}) => {
      if (selectedColorSlot == null) return;
      updateSlotColor(selectedColorSlot, hex, { announce: true });
    },
  });
  pickerRow.appendChild(pickerApi.root);

  const clearSlotLine = (slot) => {
    const i = normalizeSlot(slot);
    const sx = clampAnchorX(emitters[i].x);
    const sy = clampAnchorY(emitters[i].y);
    targets[i].x = sx;
    targets[i].y = sy;
    setSlotPath(i, [
      { x: sx, y: sy },
      { x: sx, y: sy },
    ]);
    setSlotAwaitingBoardDraw(i, true);
    alignAnchorsFromPath(i);
    fitDragAreaToAnchors();
    syncHandle(i, 'source');
    syncHandle(i, 'target');
    syncGuide(i);
    syncBaseBeam(i);
    syncRotationHandle(i);
    syncDrawPreview(i, { visible: false });
    try { refreshCustomizeUi(); } catch {}
    markSceneDirtySafe();
  };

  paintLineButtonColor = (slot, color) => {
    const i = normalizeSlot(slot);
    const btn = lineButtonsHost.querySelector(`button[data-slot="${i}"]`);
    if (!btn) return;
    btn.style.setProperty('--accent', String(color || palette[i] || '#7bf6ff'));
  };

  setCustomiseOpen = (open) => {
    const nextOpen = !!open;
    customisePanel.hidden = !nextOpen;
    customisePanel.classList.toggle('is-open', nextOpen);
    if (nextOpen) {
      try { refreshCustomizeUi(); } catch {}
      syncDragArea();
      return;
    }
    selectedColorSlot = null;
    pickerWrap.hidden = true;
    pickerTitle.hidden = true;
    stopPreviewLoop();
    try { refreshCustomizeUi(); } catch {}
    syncDragArea();
  };

  closeCustomizeUi = () => {
    setCustomiseOpen(false);
  };

  selectLineForCustomise = (slot, { openMenu = false } = {}) => {
    const i = normalizeSlot(slot);
    if (selectedColorSlot != null && normalizeSlot(selectedColorSlot) === i) {
      selectedColorSlot = null;
      pickerWrap.hidden = true;
      pickerTitle.hidden = true;
      stopPreviewLoop();
      refreshCustomizeUi();
      syncDragArea();
      return;
    }
    selectedColorSlot = i;
    pickerWrap.hidden = false;
    pickerTitle.hidden = false;
    pickerApi.setColor(palette[i]);
    if (openMenu) setCustomiseOpen(true);
    refreshCustomizeUi();
    syncDragArea();
    startPreviewLoopForSlot(i);
  };

  refreshCustomizeUi = () => {
    if (!lineButtonsHost) return;
    const active = Array.from(activeSlots.values()).map((s) => normalizeSlot(s)).sort((a, b) => a - b);
    const fxShell = getBaseArtToyControlsHost(panel)?.querySelector?.('.art-toy-fx-shell');
    if (fxShell) fxShell.hidden = active.length === 0;
    customisePanel.classList.toggle('is-empty-lines', active.length === 0);
    lineButtonsHost.innerHTML = '';
    if (!active.length) {
      const empty = document.createElement('div');
      empty.className = 'art-line-color-empty';
      const emptyText = document.createElement('div');
      emptyText.className = 'art-line-color-empty-text';
      emptyText.textContent = 'Add some music with:';
      empty.appendChild(emptyText);

      const emptyActions = document.createElement('div');
      emptyActions.className = 'art-line-color-empty-actions';

      const randomBtn = document.createElement('button');
      randomBtn.type = 'button';
      randomBtn.className = 'c-btn art-line-empty-action-btn';
      randomBtn.setAttribute('aria-label', 'Randomize art toy music');
      randomBtn.title = 'Random Music';
      randomBtn.innerHTML = BUTTON_ICON_HTML;
      const randomCore = randomBtn.querySelector('.c-btn-core');
      if (randomCore) randomCore.style.setProperty('--c-btn-icon-url', "url('./assets/UI/T_ButtonRandomNotes.png')");
      randomBtn.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const randomActionBtn = panel.querySelector(`[data-action="artToy:randomMusic"][data-art-toy-id="${panel.id}"]`)
          || panel.querySelector(`[data-action="artToy:randomMusic"]`);
        try { randomActionBtn?.click?.(); } catch {}
        const selectFirstActive = () => {
          const activeSorted = Array.from(activeSlots.values())
            .map((s) => normalizeSlot(s))
            .sort((a, b) => a - b);
          if (!activeSorted.length) return false;
          try { selectLineForCustomise(activeSorted[0], { openMenu: false }); } catch {}
          return true;
        };
        if (selectFirstActive()) return;
        setTimeout(() => { try { selectFirstActive(); } catch {} }, 0);
        setTimeout(() => { try { selectFirstActive(); } catch {} }, 60);
      });
      emptyActions.appendChild(randomBtn);

      const enterBtn = document.createElement('button');
      enterBtn.type = 'button';
      enterBtn.className = 'c-btn art-line-empty-action-btn art-line-empty-enter-btn';
      enterBtn.setAttribute('aria-label', 'Enter internal view');
      enterBtn.title = 'Enter';
      enterBtn.innerHTML = BUTTON_ICON_HTML;
      const enterCore = enterBtn.querySelector('.c-btn-core');
      if (enterCore) enterCore.style.setProperty('--c-btn-icon-url', "url('./assets/UI/T_ButtonEnter.png')");
      enterBtn.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const enterActionBtn = panel.querySelector(`[data-action="artToy:music"][data-art-toy-id="${panel.id}"]`)
          || panel.querySelector(`[data-action="artToy:music"]`);
        try { enterActionBtn?.click?.(); } catch {}
      });
      emptyActions.appendChild(enterBtn);
      empty.appendChild(emptyActions);

      lineButtonsHost.appendChild(empty);
      selectedColorSlot = null;
      pickerWrap.hidden = true;
      pickerTitle.hidden = true;
      stopPreviewLoop();
      syncSelectedHandleHighlight();
      syncDragArea();
      return;
    }
    if (selectedColorSlot != null && !active.includes(normalizeSlot(selectedColorSlot))) {
      selectedColorSlot = null;
      pickerWrap.hidden = true;
      pickerTitle.hidden = true;
      stopPreviewLoop();
    }
    for (const i of active) {
      const row = document.createElement('div');
      row.className = 'art-line-color-row';
      const awaitingDraw = isSlotAwaitingBoardDraw(i);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'c-btn art-line-color-btn';
      btn.dataset.slot = String(i);
      btn.title = `Edit Line ${i + 1}`;
      btn.setAttribute('aria-label', `Edit line ${i + 1} color`);
      btn.style.setProperty('--c-btn-size', '112px');
      btn.style.setProperty('--accent', palette[i]);
      btn.innerHTML = BUTTON_ICON_HTML;
      const colorCore = btn.querySelector('.c-btn-core');
      if (colorCore) colorCore.style.setProperty('--c-btn-icon-url', 'none');
      btn.classList.toggle('is-selected', selectedColorSlot != null && normalizeSlot(selectedColorSlot) === i);
      applyColorButtonHitState(i);
      btn.addEventListener('pointerdown', (ev) => {
        if (ev.button != null && ev.button !== 0) return;
        ev.preventDefault();
        ev.stopPropagation();
        selectLineForCustomise(i, { openMenu: false });
      });
      row.appendChild(btn);

      if (awaitingDraw) {
        const helper = document.createElement('div');
        helper.className = 'art-line-draw-hint';
        helper.textContent = selectedColorSlot != null && normalizeSlot(selectedColorSlot) === i
          ? 'Draw'
          : 'Select to draw a line';
        row.appendChild(helper);
      } else {
        const clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.className = 'c-btn art-line-clear-btn';
        clearBtn.setAttribute('aria-label', `Clear line ${i + 1}`);
        clearBtn.title = `Clear line ${i + 1}`;
        clearBtn.style.setProperty('--c-btn-size', '66px');
        clearBtn.style.setProperty('--accent', '#f87171');
        clearBtn.innerHTML = BUTTON_ICON_HTML;
        const clearCore = clearBtn.querySelector('.c-btn-core');
        if (clearCore) clearCore.style.setProperty('--c-btn-icon-url', "url('./assets/UI/T_ButtonClear.png')");
        clearBtn.addEventListener('pointerdown', (ev) => {
          if (ev.button != null && ev.button !== 0) return;
          ev.preventDefault();
          ev.stopPropagation();
          clearSlotLine(i);
        });
        row.appendChild(clearBtn);
      }

      lineButtonsHost.appendChild(row);
    }

    const clearAllRow = document.createElement('div');
    clearAllRow.className = 'art-line-color-row art-line-clear-all-row';
    const clearAllBtn = document.createElement('button');
    clearAllBtn.type = 'button';
    clearAllBtn.className = 'c-btn art-line-clear-btn art-line-clear-all-btn';
    clearAllBtn.setAttribute('aria-label', 'Clear all lines');
    clearAllBtn.title = 'Clear All Lines';
    clearAllBtn.style.setProperty('--c-btn-size', '88px');
    clearAllBtn.style.setProperty('--accent', '#f87171');
    clearAllBtn.innerHTML = BUTTON_ICON_HTML;
    const clearAllCore = clearAllBtn.querySelector('.c-btn-core');
    if (clearAllCore) clearAllCore.style.setProperty('--c-btn-icon-url', "url('./assets/UI/T_ButtonClear.png')");
    clearAllBtn.addEventListener('pointerdown', (ev) => {
      if (ev.button != null && ev.button !== 0) return;
      ev.preventDefault();
      ev.stopPropagation();
      for (const slot of active) clearSlotLine(slot);
      if (active.length) {
        try { selectLineForCustomise(active[0], { openMenu: false }); } catch {}
      }
    });
    clearAllRow.appendChild(clearAllBtn);
    const clearAllLabel = document.createElement('div');
    clearAllLabel.className = 'art-line-clear-all-label';
    clearAllLabel.textContent = 'Clear All';
    clearAllRow.appendChild(clearAllLabel);
    lineButtonsHost.appendChild(clearAllRow);

    syncSelectedHandleHighlight();
    syncDragArea();
  };

  let boardDrawPointerId = null;
  let boardDrawSlot = null;
  let boardDrawMoved = false;
  const beginBoardDraw = (ev) => {
    if (!panel.isConnected) return;
    if (panel.dataset.controlsVisible !== '1') return;
    if (ev.button != null && ev.button !== 0) return;
    const eventTarget = ev?.target;
    if (eventTarget?.closest?.('.art-laser-handle-btn')) return;
    if (selectedColorSlot == null) return;
    const slot = normalizeSlot(selectedColorSlot);
    if (!isSlotAwaitingBoardDraw(slot)) return;
    if (!isClientPointInsideDragArea(ev.clientX, ev.clientY)) return;
    const pt = clientToPanelPoint(ev.clientX, ev.clientY);
    if (!pt) return;
    ev.preventDefault();
    ev.stopPropagation();
    boardDrawPointerId = ev.pointerId;
    boardDrawSlot = slot;
    boardDrawMoved = false;
    const px = clampAnchorX(pt.x);
    const py = clampAnchorY(pt.y);
    emitters[slot].x = px;
    emitters[slot].y = py;
    targets[slot].x = px;
    targets[slot].y = py;
    slotPaths[slot] = [{ x: px, y: py }];
    dragAreaEl.classList.add('is-dragging');
    syncDrawPreview(slot, { visible: true });
  };
  const moveBoardDraw = (ev) => {
    if (boardDrawPointerId == null || boardDrawSlot == null) return;
    if (ev.pointerId !== boardDrawPointerId) return;
    const pt = clientToPanelPoint(ev.clientX, ev.clientY);
    if (!pt) return;
    ev.preventDefault();
    ev.stopPropagation();
    const points = getSlotPath(boardDrawSlot, { allowDraft: true });
    const prev = points.length ? points[points.length - 1] : null;
    appendPathPoint(boardDrawSlot, pt.x, pt.y, 1.6);
    syncDrawPreview(boardDrawSlot, { visible: true });
    const next = points.length ? points[points.length - 1] : null;
    if (prev && next && Math.hypot(next.x - prev.x, next.y - prev.y) > 0.1) boardDrawMoved = true;
  };
  const endBoardDraw = (ev) => {
    if (boardDrawPointerId == null || boardDrawSlot == null) return;
    if (ev.pointerId !== boardDrawPointerId) return;
    ev.preventDefault();
    ev.stopPropagation();
    const slot = boardDrawSlot;
    boardDrawPointerId = null;
    boardDrawSlot = null;
    dragAreaEl.classList.remove('is-dragging');
    syncDrawPreview(slot, { visible: false });
    const releasePt = clientToPanelPoint(ev.clientX, ev.clientY);
    if (releasePt) {
      const beforeLen = getSlotPath(slot, { allowDraft: true }).length;
      appendPathPoint(slot, releasePt.x, releasePt.y, 1.6);
      const afterLen = getSlotPath(slot, { allowDraft: true }).length;
      if (afterLen > beforeLen) boardDrawMoved = true;
    }
    const points = getSlotPath(slot, { allowDraft: true });
    if (boardDrawMoved && points.length >= 2) {
      setSlotPath(slot, points, { lockEndpoints: false });
      alignAnchorsFromPath(slot);
      setSlotAwaitingBoardDraw(slot, false);
      fitDragAreaToAnchors();
      syncHandle(slot, 'source');
      syncHandle(slot, 'target');
      syncGuide(slot);
      syncBaseBeam(slot);
      syncRotationHandle(slot);
      const activeSorted = Array.from(activeSlots.values())
        .map((s) => normalizeSlot(s))
        .sort((a, b) => a - b);
      const nextUndrawn = activeSorted.find((s) => s !== slot && isSlotAwaitingBoardDraw(s));
      if (Number.isFinite(nextUndrawn)) {
        try { selectLineForCustomise(nextUndrawn, { openMenu: false }); } catch {}
      } else {
        try { refreshCustomizeUi(); } catch {}
      }
      markSceneDirtySafe();
      return;
    }
    const first = points.length ? points[0] : emitters[slot];
    const sx = clampAnchorX(first?.x);
    const sy = clampAnchorY(first?.y);
    emitters[slot].x = sx;
    emitters[slot].y = sy;
    targets[slot].x = sx;
    targets[slot].y = sy;
    setSlotPath(slot, [
      { x: sx, y: sy },
      { x: sx, y: sy },
    ]);
    alignAnchorsFromPath(slot);
  };
  panel.addEventListener('pointerdown', beginBoardDraw, true);
  dragAreaEl.addEventListener('pointerdown', beginBoardDraw, true);
  document.addEventListener('pointermove', moveBoardDraw, true);
  document.addEventListener('pointerup', endBoardDraw, true);
  document.addEventListener('pointercancel', endBoardDraw, true);

  // Keep customise UI lifecycle aligned with the standard art controls visibility.
  try {
    const controlsVisMo = new MutationObserver(() => {
      setCustomiseOpen(panel.dataset.controlsVisible === '1');
    });
    controlsVisMo.observe(panel, { attributes: true, attributeFilter: ['data-controls-visible'] });
  } catch {}
  setCustomiseOpen(panel.dataset.controlsVisible === '1');

  try {
    const controlsHost = getBaseArtToyControlsHost(panel);
    const fxShell = controlsHost?.querySelector?.('.art-toy-fx-shell') || null;
    const fxCurrentBtn = fxShell?.querySelector?.('.art-toy-fx-current') || null;
    const fxCurrentStage = fxShell?.querySelector?.('.art-toy-fx-stage-current') || null;
    const fxGrid = fxShell?.querySelector?.('.art-toy-fx-grid') || null;
    const fxCards = [];
    try {
      if (fxShell && customisePanel && !customisePanel.contains(fxShell)) {
        customisePanel.insertBefore(fxShell, lineButtonsTitle);
      }
    } catch {}

    const previewLines = new WeakMap();
    const PREVIEW_CAP = 24;
    const trackPreviewLine = (stage, el) => {
      let list = previewLines.get(stage);
      if (!list) {
        list = [];
        previewLines.set(stage, list);
      }
      list.push(el);
      while (list.length > PREVIEW_CAP) {
        const old = list.shift();
        try { old?.remove(); } catch {}
      }
    };
    const spawnPreviewLaser = (stage, fxId) => {
      if (!stage) return 720;
      const id = clampFxId(fxId);
      const tone = palette[id % palette.length];
      const rot = 0;
      const baseLen = 42;
      const mkLine = ({ len = baseLen, width = 3, opacity = 1, glow = 6 } = {}) => {
        const line = document.createElement('span');
        line.className = 'art-laser-preview-line';
        line.style.background = tone;
        line.style.left = '50%';
        line.style.top = '50%';
        line.style.width = `${len}px`;
        line.style.height = `${width}px`;
        line.style.opacity = String(opacity);
        line.style.filter = `drop-shadow(0 0 ${glow}px ${tone})`;
        stage.appendChild(line);
        trackPreviewLine(stage, line);
        return line;
      };
      const animateAndRemove = (node, keyframes, timing, fallbackMs = 640) => {
        try {
          const anim = node.animate(keyframes, timing);
          anim.addEventListener('finish', () => { try { node.remove(); } catch {} }, { once: true });
          anim.addEventListener('cancel', () => { try { node.remove(); } catch {} }, { once: true });
        } catch {
          setTimeout(() => { try { node.remove(); } catch {} }, fallbackMs);
        }
      };
      const spawnRunner = (life = 900, opaque = true) => {
        const seg = mkLine({ len: 10, width: opaque ? 2.8 : 2.2, opacity: opaque ? 1 : 0.82, glow: opaque ? 8 : 6 });
        animateAndRemove(
          seg,
          [
            { transform: `translate(-50%, -50%) rotate(${rot}rad) translateX(-16px)`, opacity: opaque ? 1 : 0.82 },
            { transform: `translate(-50%, -50%) rotate(${rot}rad) translateX(16px)`, opacity: opaque ? 1 : 0.82 },
          ],
          { duration: life, easing: 'linear' },
          life + 40
        );
      };

      // 0 Solid Pulse
      if (id === 0) {
        const base = mkLine({ len: baseLen, width: 3.2, opacity: 0.95, glow: 8 });
        animateAndRemove(
          base,
          [
            { transform: `translate(-50%, -50%) rotate(${rot}rad) scaleX(1)`, opacity: 0.95, filter: `drop-shadow(0 0 8px ${tone})` },
            { transform: `translate(-50%, -50%) rotate(${rot}rad) scaleX(1)`, opacity: 0.95, filter: `drop-shadow(0 0 8px ${tone})`, offset: 0.999 },
            { transform: `translate(-50%, -50%) rotate(${rot}rad) scaleX(1)`, opacity: 0.95, filter: `drop-shadow(0 0 8px ${tone})` },
          ],
          { duration: 920, easing: 'linear' },
          980
        );
        const pulse = mkLine({ len: baseLen, width: 5.8, opacity: 0.95, glow: 14 });
        animateAndRemove(
          pulse,
          [
            { transform: `translate(-50%, -50%) rotate(${rot}rad) scaleX(1)`, opacity: 0.95 },
            { transform: `translate(-50%, -50%) rotate(${rot}rad) scaleX(1.03)`, opacity: 1, offset: 0.3 },
            { transform: `translate(-50%, -50%) rotate(${rot}rad) scaleX(1)`, opacity: 0.05 },
          ],
          { duration: 620, easing: 'cubic-bezier(0.2, 0.78, 0.16, 1)' },
          700
        );
        return 920;
      }

      // 1 Soft Pulse
      if (id === 1) {
        const base = mkLine({ len: baseLen, width: 3.1, opacity: 0.38, glow: 6 });
        animateAndRemove(
          base,
          [
            { transform: `translate(-50%, -50%) rotate(${rot}rad)`, opacity: 0.38 },
            { transform: `translate(-50%, -50%) rotate(${rot}rad)`, opacity: 0.38, offset: 0.999 },
            { transform: `translate(-50%, -50%) rotate(${rot}rad)`, opacity: 0.38 },
          ],
          { duration: 920, easing: 'linear' },
          980
        );
        const pulse = mkLine({ len: baseLen, width: 4.4, opacity: 0.92, glow: 11 });
        animateAndRemove(
          pulse,
          [
            { transform: `translate(-50%, -50%) rotate(${rot}rad)`, opacity: 0.9 },
            { transform: `translate(-50%, -50%) rotate(${rot}rad)`, opacity: 1, offset: 0.28 },
            { transform: `translate(-50%, -50%) rotate(${rot}rad)`, opacity: 0.05 },
          ],
          { duration: 620, easing: 'cubic-bezier(0.2, 0.78, 0.16, 1)' },
          700
        );
        return 920;
      }

      // 2 Burst Thin
      if (id === 2) {
        const burst = mkLine({ len: 54, width: 6.2, opacity: 1, glow: 14 });
        animateAndRemove(
          burst,
          [
            { transform: `translate(-50%, -50%) rotate(${rot}rad) scaleX(1)`, opacity: 1, height: '6.2px' },
            { transform: `translate(-50%, -50%) rotate(${rot}rad) scaleX(1.02)`, opacity: 0.95, height: '3.1px', offset: 0.5 },
            { transform: `translate(-50%, -50%) rotate(${rot}rad) scaleX(1.02)`, opacity: 0, height: '0.8px' },
          ],
          { duration: 700, easing: 'cubic-bezier(0.2, 0.78, 0.16, 1)' },
          760
        );
        return 720;
      }

      // 3 Runner
      if (id === 3) {
        spawnRunner(980, true);
        return 980;
      }

      // 4 Solid + Runner
      if (id === 4) {
        const base = mkLine({ len: baseLen, width: 3.2, opacity: 0.95, glow: 8 });
        animateAndRemove(
          base,
          [
            { transform: `translate(-50%, -50%) rotate(${rot}rad)`, opacity: 0.95 },
            { transform: `translate(-50%, -50%) rotate(${rot}rad)`, opacity: 0.95, offset: 0.999 },
            { transform: `translate(-50%, -50%) rotate(${rot}rad)`, opacity: 0.95 },
          ],
          { duration: 980, easing: 'linear' },
          1040
        );
        spawnRunner(980, true);
        return 980;
      }

      // 5 Soft + Runner
      const base = mkLine({ len: baseLen, width: 3.1, opacity: 0.38, glow: 6 });
      animateAndRemove(
        base,
        [
          { transform: `translate(-50%, -50%) rotate(${rot}rad)`, opacity: 0.38 },
          { transform: `translate(-50%, -50%) rotate(${rot}rad)`, opacity: 0.38, offset: 0.999 },
          { transform: `translate(-50%, -50%) rotate(${rot}rad)`, opacity: 0.38 },
        ],
        { duration: 980, easing: 'linear' },
        1040
      );
      spawnRunner(980, true);
      return 980;
    };
    const addPreviewLoop = (stage, fxResolver) => {
      if (!stage) return;
      let timer = 0;
      const tick = () => {
        if (!panel.isConnected || !stage.isConnected) {
          if (timer) clearTimeout(timer);
          return;
        }
        const nextId = typeof fxResolver === 'function' ? fxResolver() : fxResolver;
        const cycleMs = Math.max(420, Number(spawnPreviewLaser(stage, nextId)) || 700);
        timer = setTimeout(tick, cycleMs + 40);
      };
      tick();
    };
    const setFxPickerOpen = () => {
      if (!fxShell || !fxGrid) return;
      fxShell.dataset.open = '1';
      if (fxCurrentBtn) fxCurrentBtn.setAttribute('aria-expanded', 'true');
      fxGrid.hidden = false;
    };
    const fxById = new Map(LASER_FX.map((fx) => [fx.id, fx]));
    syncFxUi = () => {
      const fxId = clampFxId(panel?.dataset?.laserFx);
      const fxName = fxById.get(fxId)?.name || 'Laser';
      if (fxCurrentBtn) {
        fxCurrentBtn.title = `Laser: ${fxName}`;
        fxCurrentBtn.setAttribute('aria-label', `Current laser effect: ${fxName}`);
      }
      for (const card of fxCards) {
        card.classList.toggle('is-selected', card.dataset.fxId === String(fxId));
      }
    };

    if (fxGrid && LASER_FX.length) {
      fxGrid.innerHTML = '';
      for (const fx of LASER_FX) {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'art-toy-fx-card';
        card.dataset.fxId = String(fx.id);
        card.title = fx.name;
        card.setAttribute('aria-label', `Select ${fx.name} laser effect`);
        const stage = document.createElement('span');
        stage.className = 'art-toy-fx-stage';
        card.appendChild(stage);
        fxGrid.appendChild(card);
        fxCards.push(card);
        addPreviewLoop(stage, fx.id);
        card.addEventListener('click', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          setFx(fx.id);
        });
      }
    }
    setFxPickerOpen(true);
    syncFxUi();
  } catch {}

  const isClientPointInsideDragArea = (clientX, clientY) => {
    // When no active lasers are present, the drag area should not capture outside taps.
    if (activeSlots.size === 0 && !dragAreaEl.classList.contains('is-dragging')) return false;
    const rect = panel.getBoundingClientRect();
    if (!rect || rect.width < 1 || rect.height < 1) return false;
    const scaleX = rect.width / PANEL_PX;
    const scaleY = rect.height / PANEL_PX;
    const armed = isBoardDrawArmed();
    const areaX = armed ? AREA_MIN_X : dragArea.x;
    const areaY = armed ? AREA_MIN_Y : dragArea.y;
    const areaW = armed ? TOTAL_LIMIT_W : dragArea.w;
    const areaH = armed ? TOTAL_LIMIT_H : dragArea.h;
    const left = rect.left + areaX * scaleX;
    const top = rect.top + areaY * scaleY;
    const right = left + areaW * scaleX;
    const bottom = top + areaH * scaleY;
    return clientX >= left && clientX <= right && clientY >= top && clientY <= bottom;
  };

  let outsideTapCandidate = false;
  let outsideTapPointerId = null;
  let outsideTapStartX = 0;
  let outsideTapStartY = 0;
  let outsideTapMoved = false;
  const OUTSIDE_TAP_SLOP_PX = 6;

  const resetOutsideTap = () => {
    outsideTapCandidate = false;
    outsideTapPointerId = null;
    outsideTapStartX = 0;
    outsideTapStartY = 0;
    outsideTapMoved = false;
  };

  const removeOutsideTapListeners = () => {
    document.removeEventListener('pointerdown', onDocPointerDownHideExtras, true);
    document.removeEventListener('pointermove', onDocPointerMoveHideExtras, true);
    document.removeEventListener('pointerup', onDocPointerUpHideExtras, true);
    document.removeEventListener('pointercancel', onDocPointerCancelHideExtras, true);
  };

  const onDocPointerDownHideExtras = (ev) => {
    if (!panel.isConnected) {
      removeOutsideTapListeners();
      return;
    }
    resetOutsideTap();
    if (panel.dataset.controlsVisible !== '1') return;
    const target = ev?.target;
    if (target && panel.contains(target)) return;
    if (isClientPointInsideDragArea(ev.clientX, ev.clientY)) return;
    outsideTapCandidate = true;
    outsideTapPointerId = ev.pointerId;
    outsideTapStartX = ev.clientX;
    outsideTapStartY = ev.clientY;
  };

  const onDocPointerMoveHideExtras = (ev) => {
    if (!outsideTapCandidate) return;
    if (outsideTapPointerId != null && ev.pointerId !== outsideTapPointerId) return;
    const dx = ev.clientX - outsideTapStartX;
    const dy = ev.clientY - outsideTapStartY;
    if ((dx * dx + dy * dy) > (OUTSIDE_TAP_SLOP_PX * OUTSIDE_TAP_SLOP_PX)) {
      outsideTapMoved = true;
    }
  };

  const onDocPointerUpHideExtras = (ev) => {
    if (!outsideTapCandidate) return;
    if (outsideTapPointerId != null && ev.pointerId !== outsideTapPointerId) return;
    const target = ev?.target;
    const endedOutsidePanel = !(target && panel.contains(target));
    const endedOutsideArea = !isClientPointInsideDragArea(ev.clientX, ev.clientY);
    const shouldHide = !outsideTapMoved && endedOutsidePanel && endedOutsideArea;
    resetOutsideTap();
    if (!shouldHide) return;
    if (!panel.isConnected) return;
    if (panel.dataset.controlsVisible !== '1') return;
    setBaseArtToyControlsVisible(panel, false);
  };

  const onDocPointerCancelHideExtras = (ev) => {
    if (!outsideTapCandidate) return;
    if (outsideTapPointerId != null && ev.pointerId !== outsideTapPointerId) return;
    resetOutsideTap();
  };

  document.addEventListener('pointerdown', onDocPointerDownHideExtras, true);
  document.addEventListener('pointermove', onDocPointerMoveHideExtras, true);
  document.addEventListener('pointerup', onDocPointerUpHideExtras, true);
  document.addEventListener('pointercancel', onDocPointerCancelHideExtras, true);

  function spawnLaser(slotIndex, velocity = null) {
    const slot = normalizeSlot(slotIndex);
    const source = emitters[slot];
    const tone = palette[slot % palette.length];
    const fxId = clampFxId(panel?.dataset?.laserFx);
    const vel = Number(velocity);
    const amp = Number.isFinite(vel) ? Math.max(0.5, Math.min(1.25, vel)) : 0.95;
    const profile = getFxProfile(fxId);
    const basePoints = getSlotPath(slot);
    const points = basePoints.map((p) => ({ x: p.x, y: p.y }));
    if (points.length < 2) return;
    points[0].x = source.x;
    points[0].y = source.y;
    const pathD = buildLaserPath(points);
    const beamBaseWidth = getLaserBaseWidth(fxId) * laserStrokeMultiplier;
    const baseWidth = getLaserBaseWidth(fxId) * amp * laserStrokeMultiplier;

    const trackActiveNode = (node) => {
      if (!node) return;
      active.push(node);
      while (active.length > ACTIVE_CAP) {
        const old = active.shift();
        try { old?.remove(); } catch {}
      }
    };
    const spawnTransientPath = ({
      widthScale = 1,
      opacity = 1,
      filter = `drop-shadow(0 0 ${LASER_STYLE.transientGlowDefaultPx}px currentColor)`
    } = {}) => {
      const path = document.createElementNS(svgNS, 'path');
      path.setAttribute('class', 'art-laser-path');
      path.setAttribute('d', pathD);
      path.setAttribute('stroke', tone);
      path.setAttribute('stroke-width', String(baseWidth * widthScale));
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
      path.style.opacity = String(opacity);
      path.style.filter = filter;
      layer.appendChild(path);
      trackActiveNode(path);
      return path;
    };
    const removeActiveNode = (node) => {
      const idx = active.indexOf(node);
      if (idx >= 0) active.splice(idx, 1);
      try { node?.remove?.(); } catch {}
    };
    const animateBasePulse = (mode) => {
      const beam = baseBeamEls[slot];
      if (!beam || beam.style.display === 'none') return;
      try {
        beam.getAnimations?.().forEach((anim) => { try { anim.cancel(); } catch {} });
      } catch {}
      const baseOpacity = profile.baseMode === 'semi' ? LASER_STYLE.baseOpacitySemi : LASER_STYLE.baseOpacityOpaque;
      if (mode === 'pulse-thicken') {
        const w0 = beamBaseWidth;
        const w1 = beamBaseWidth * LASER_STYLE.pulseWidthScale;
        const overlay = spawnTransientPath({
          widthScale: LASER_STYLE.pulseOverlayWidthScale,
          opacity: LASER_STYLE.pulseOverlayOpacity,
          filter: `drop-shadow(0 0 ${LASER_STYLE.pulseGlowPx}px currentColor)`
        });
        try {
          beam.animate(
            [
              { strokeWidth: `${w0}`, opacity: baseOpacity, filter: `drop-shadow(0 0 ${LASER_STYLE.baseGlowOpaquePx}px currentColor)` },
              { strokeWidth: `${w1}`, opacity: 1, filter: `drop-shadow(0 0 ${LASER_STYLE.pulseGlowPx}px currentColor)`, offset: 0.34 },
              { strokeWidth: `${w0}`, opacity: baseOpacity, filter: `drop-shadow(0 0 ${LASER_STYLE.baseGlowOpaquePx}px currentColor)` },
            ],
            { duration: LASER_STYLE.pulseDurationMs, easing: 'cubic-bezier(0.2, 0.78, 0.16, 1)' }
          );
        } catch {}
        try {
          const anim = overlay.animate(
            [
              { opacity: LASER_STYLE.pulseOverlayOpacity },
              { opacity: LASER_STYLE.pulseOverlayFadeTo, offset: 0.62 },
              { opacity: 0 }
            ],
            { duration: LASER_STYLE.pulseDurationMs, easing: 'cubic-bezier(0.2, 0.78, 0.16, 1)' }
          );
          anim.addEventListener('finish', () => removeActiveNode(overlay), { once: true });
          anim.addEventListener('cancel', () => removeActiveNode(overlay), { once: true });
        } catch {
          setTimeout(() => removeActiveNode(overlay), LASER_STYLE.pulseDurationMs + 40);
        }
        return;
      }
      try {
        beam.animate(
          [
            { opacity: baseOpacity, filter: `drop-shadow(0 0 ${LASER_STYLE.baseGlowSemiPx}px currentColor)` },
            { opacity: 1, filter: `drop-shadow(0 0 ${LASER_STYLE.pulseGlowPx}px currentColor)`, offset: 0.3 },
            { opacity: baseOpacity, filter: `drop-shadow(0 0 ${LASER_STYLE.baseGlowSemiPx}px currentColor)` },
          ],
          { duration: LASER_STYLE.pulseDurationMs, easing: 'cubic-bezier(0.2, 0.78, 0.16, 1)' }
        );
      } catch {}
    };
    const spawnBurstThin = () => {
      const path = spawnTransientPath({
        widthScale: 1.15,
        opacity: 1,
        filter: `drop-shadow(0 0 ${LASER_STYLE.burstGlowPx}px currentColor)`
      });
      const life = LASER_STYLE.burstDurationMs;
      try {
        const anim = path.animate(
          [
            { opacity: 1, strokeWidth: `${baseWidth * 1.2}` },
            { opacity: 0.95, strokeWidth: `${baseWidth * 0.55}`, offset: 0.45 },
            { opacity: 0, strokeWidth: '0.1' },
          ],
          { duration: life, easing: 'cubic-bezier(0.2, 0.78, 0.16, 1)' }
        );
        anim.addEventListener('finish', () => removeActiveNode(path), { once: true });
        anim.addEventListener('cancel', () => removeActiveNode(path), { once: true });
      } catch {
        setTimeout(() => removeActiveNode(path), life + 40);
      }
    };
    const spawnMovingSegment = ({ opaque = true } = {}) => {
      const seg = spawnTransientPath({
        widthScale: opaque ? LASER_STYLE.runnerWidthScaleOpaque : LASER_STYLE.runnerWidthScaleSoft,
        opacity: opaque ? 1 : 0.72,
        filter: opaque
          ? `drop-shadow(0 0 ${LASER_STYLE.runnerGlowPx}px currentColor)`
          : `drop-shadow(0 0 ${Math.max(2, LASER_STYLE.runnerGlowPx * 0.55)}px currentColor)`
      });
      let total = 120;
      try { total = Math.max(18, seg.getTotalLength()); } catch {}
      const segLen = Math.max(
        LASER_STYLE.runnerSegmentMin,
        Math.min(total * LASER_STYLE.runnerSegmentFraction, LASER_STYLE.runnerSegmentMax)
      );
      // Use a non-repeating dash pattern so the runner does not wrap back to start.
      const gapLen = Math.max(1, total);
      const startOffset = total + segLen;
      // End at segLen (not 0) to avoid touching the wrap boundary, which can flash at path start.
      const endOffset = segLen;
      seg.style.strokeDasharray = `${segLen.toFixed(2)} ${gapLen.toFixed(2)}`;
      seg.style.strokeDashoffset = `${startOffset.toFixed(2)}`;
      const life = LASER_STYLE.runnerDurationMs;
      try {
        const anim = seg.animate(
          [
            { strokeDashoffset: `${startOffset.toFixed(2)}`, opacity: opaque ? 1 : 0.72 },
            { strokeDashoffset: `${endOffset.toFixed(2)}`, opacity: opaque ? 1 : 0.72 },
          ],
          { duration: life, easing: 'linear' }
        );
        anim.addEventListener('finish', () => removeActiveNode(seg), { once: true });
        anim.addEventListener('cancel', () => removeActiveNode(seg), { once: true });
      } catch {
        setTimeout(() => removeActiveNode(seg), life + 40);
      }
    };

    if (profile.beatMode === 'pulse-thicken') {
      animateBasePulse('pulse-thicken');
      return;
    }
    if (profile.beatMode === 'pulse-opaque') {
      animateBasePulse('pulse-opaque');
      return;
    }
    if (profile.beatMode === 'burst-thin') {
      spawnBurstThin();
      return;
    }
    if (profile.beatMode === 'runner') {
      spawnMovingSegment({ opaque: true });
      if (profile.baseMode === 'opaque') animateBasePulse('pulse-thicken');
      else if (profile.baseMode === 'semi') animateBasePulse('pulse-opaque');
      return;
    }
    if (profile.beatMode === 'runner-opaque') {
      spawnMovingSegment({ opaque: true });
      if (profile.baseMode === 'opaque') animateBasePulse('pulse-thicken');
      else if (profile.baseMode === 'semi') animateBasePulse('pulse-opaque');
    }
  }

  panel.onArtRandomMusic = () => {
    const ensureFirstLineSelected = () => {
      const activeSorted = Array.from(activeSlots.values())
        .map((s) => normalizeSlot(s))
        .sort((a, b) => a - b);
      if (!activeSorted.length) return false;
      try { selectLineForCustomise(activeSorted[0], { openMenu: false }); } catch {}
      return true;
    };
    if (activeSlots.size === 0) {
      activateAllSlots();
      for (let i = 0; i < ART_SLOT_COUNT; i++) clearSlotLine(i);
      if (!ensureFirstLineSelected()) {
        setTimeout(() => { try { ensureFirstLineSelected(); } catch {} }, 0);
        setTimeout(() => { try { ensureFirstLineSelected(); } catch {} }, 60);
      }
    } else {
      fitDragAreaToAnchors();
      syncAllHandles();
    }
    try { if (window.__MT_DEBUG_STICKER_DRAW_AREA || window.__MT_DEBUG_ART_DRAW_AREA) requestAnimationFrame(() => logLaserDrawAreaDebug('random-music')); } catch {}
    try { if (window.__MT_DEBUG_ART_SIZE) requestAnimationFrame(() => logLaserSizeMetrics('random-music')); } catch {}
    markSceneDirtySafe();
  };

  panel.onArtRandomAll = () => {
    activateAllSlots();
    randomizeAnchorsWithinArea(RANDOM_TOP_LEFT_QUARTER);
    fitDragAreaToAnchors();
    syncAllHandles();
    if (LASER_FX.length > 1) {
      let next = Math.floor(Math.random() * LASER_FX.length);
      if (next === currentFxId) next = (next + 1 + Math.floor(Math.random() * (LASER_FX.length - 1))) % LASER_FX.length;
      setFx(next);
    }
    try { if (window.__MT_DEBUG_STICKER_DRAW_AREA || window.__MT_DEBUG_ART_DRAW_AREA) requestAnimationFrame(() => logLaserDrawAreaDebug('random-all')); } catch {}
    try { if (window.__MT_DEBUG_ART_SIZE) requestAnimationFrame(() => logLaserSizeMetrics('random-all')); } catch {}
    markSceneDirtySafe();
  };

  panel.onArtSetActiveSlots = (slots = []) => {
    const wanted = new Set((Array.isArray(slots) ? slots : []).map((s) => normalizeSlot(s)));
    for (let i = 0; i < ART_SLOT_COUNT; i++) {
      if (wanted.has(i)) setSlotActive(i);
      else setSlotInactive(i);
    }
    fitDragAreaToAnchors();
    syncAllHandles();
  };

  panel.onArtClear = () => {
    for (let i = 0; i < ART_SLOT_COUNT; i++) setSlotInactive(i);
    try { layer.querySelectorAll('.art-laser-path').forEach((node) => { try { node.remove(); } catch {} }); } catch {}
    fitDragAreaToAnchors();
    syncAllHandles();
    markSceneDirtySafe();
    return true;
  };

  panel.getArtToyPersistState = () => {
    const activeSlotsSorted = Array.from(activeSlots.values()).map((s) => normalizeSlot(s)).sort((a, b) => a - b);
    return {
      type: ART_TYPES.LASER_TRAILS,
      emitters: emitters.map((a) => ({ x: Number(a?.x) || 0, y: Number(a?.y) || 0 })),
      targets: targets.map((a) => ({ x: Number(a?.x) || 0, y: Number(a?.y) || 0 })),
      paths: slotPaths.map((points) => (Array.isArray(points)
        ? points.map((point) => ({ x: Number(point?.x) || 0, y: Number(point?.y) || 0 }))
        : [])),
      lineColors: palette.map((c) => String(c || '#7bf6ff')),
      lineThickness: Number(laserStrokeMultiplier) || 1,
      activeSlots: activeSlotsSorted,
      pendingDrawSlots: Array.from(slotAwaitingBoardDraw.values()).map((s) => normalizeSlot(s)).sort((a, b) => a - b),
      fx: clampFxId(panel?.dataset?.laserFx),
      controlsVisible: panel.dataset.controlsVisible === '1',
    };
  };

  panel.applyArtToyPersistState = (state = {}) => {
    if (!state || typeof state !== 'object') return false;
    const nextEmitters = Array.isArray(state.emitters) ? state.emitters : null;
    if (nextEmitters && nextEmitters.length) {
      for (let i = 0; i < ART_SLOT_COUNT; i++) {
        const src = nextEmitters[i];
        if (!src || typeof src !== 'object') continue;
        emitters[i].x = clampAnchorX(src.x);
        emitters[i].y = clampAnchorY(src.y);
      }
    }
    const nextTargets = Array.isArray(state.targets) ? state.targets : null;
    if (nextTargets && nextTargets.length) {
      for (let i = 0; i < ART_SLOT_COUNT; i++) {
        const src = nextTargets[i];
        if (!src || typeof src !== 'object') continue;
        targets[i].x = clampAnchorX(src.x);
        targets[i].y = clampAnchorY(src.y);
      }
    }
    const nextPaths = Array.isArray(state.paths) ? state.paths : null;
    if (nextPaths && nextPaths.length) {
      for (let i = 0; i < ART_SLOT_COUNT; i++) {
        const points = nextPaths[i];
        setSlotPath(i, points);
        alignAnchorsFromPath(i);
      }
    } else {
      for (let i = 0; i < ART_SLOT_COUNT; i++) {
        setSlotPath(i, buildStraightPath(i));
      }
    }
    const nextColors = Array.isArray(state.lineColors) ? state.lineColors : null;
    if (nextColors && nextColors.length) {
      for (let i = 0; i < ART_SLOT_COUNT; i++) {
        const color = nextColors[i];
        if (typeof color !== 'string') continue;
        updateSlotColor(i, color, { announce: false });
      }
    }
    if (Number.isFinite(Number(state.lineThickness))) {
      laserStrokeMultiplier = Math.max(0.2, Number(state.lineThickness));
      try { thicknessControlApi?.setValue?.(laserStrokeMultiplier); } catch {}
    }
    if (Array.isArray(state.activeSlots)) {
      const wanted = new Set(state.activeSlots.map((s) => normalizeSlot(s)));
      for (let i = 0; i < ART_SLOT_COUNT; i++) {
        if (wanted.has(i)) setSlotActive(i);
        else setSlotInactive(i);
      }
    }
    slotAwaitingBoardDraw.clear();
    if (Array.isArray(state.pendingDrawSlots)) {
      for (const s of state.pendingDrawSlots) {
        const i = normalizeSlot(s);
        if (activeSlots.has(i)) setSlotAwaitingBoardDraw(i, true);
      }
    }
    if (state.fx != null) setFx(state.fx, { announce: false });
    else if (panel?.dataset?.laserFx != null) setFx(panel.dataset.laserFx, { announce: false });
    fitDragAreaToAnchors();
    syncAllHandles();
    if (typeof state.controlsVisible === 'boolean') setBaseArtToyControlsVisible(panel, state.controlsVisible);
    return true;
  };

  fitDragAreaToAnchors();
  syncAllHandles();

  panel.onArtTrigger = (trigger = null) => {
    const slot = normalizeSlot(trigger?.slotIndex);
    setSlotActive(slot);
    try { pulseColorButtonHit(slot); } catch {}
    if (isSlotAwaitingBoardDraw(slot)) return true;
    spawnLaser(slot, trigger?.velocity ?? null);
    return true;
  };

  panel.flash = (meta = null) => {
    const slot = normalizeSlot(meta?.slotIndex);
    setSlotActive(slot);
    try { pulseColorButtonHit(slot); } catch {}
    if (isSlotAwaitingBoardDraw(slot)) return;
    spawnLaser(slot, meta?.velocity ?? null);
  };
}

function setupSticker(panel) {
  panel.classList.add('art-toy-sticker');
  try {
    panel.querySelectorAll('.art-sticker-layer, .art-sticker-hit-layer, .art-sticker-draw-area').forEach((el) => {
      try { el.remove(); } catch {}
    });
  } catch {}

  const layer = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  layer.setAttribute('class', 'art-sticker-layer');
  layer.setAttribute('viewBox', '0 0 220 220');
  layer.setAttribute('preserveAspectRatio', 'none');
  panel.appendChild(layer);

  const hitLayer = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  hitLayer.setAttribute('class', 'art-sticker-hit-layer');
  hitLayer.setAttribute('viewBox', '0 0 220 220');
  hitLayer.setAttribute('preserveAspectRatio', 'none');
  panel.appendChild(hitLayer);

  const AREA_MIN_X = -94;
  const AREA_MIN_Y = 74;
  const MAX_DRAG_SPAN = 1600;
  const AREA_MAX_X = AREA_MIN_X + MAX_DRAG_SPAN;
  const AREA_MAX_Y = AREA_MIN_Y + MAX_DRAG_SPAN;
  const TOTAL_LIMIT_W = Math.max(1, AREA_MAX_X - AREA_MIN_X);
  const TOTAL_LIMIT_H = Math.max(1, AREA_MAX_Y - AREA_MIN_Y);
  const RANDOM_TOP_LEFT_QUARTER = {
    x: AREA_MIN_X,
    y: AREA_MIN_Y,
    w: TOTAL_LIMIT_W * 0.75,
    h: TOTAL_LIMIT_H * 0.75,
  };
  const dragArea = {
    x: AREA_MIN_X,
    y: AREA_MIN_Y,
    w: 384,
    h: 276,
  };
  const INITIAL_DRAG_W = dragArea.w;
  const INITIAL_DRAG_H = dragArea.h;
  const drawAreaEl = document.createElement('div');
  drawAreaEl.className = 'art-sticker-draw-area';
  // Use explicit geometry (not inset) so no upstream style can collapse this area.
  drawAreaEl.style.inset = 'auto';
  drawAreaEl.style.left = `${dragArea.x}px`;
  drawAreaEl.style.top = `${dragArea.y}px`;
  drawAreaEl.style.width = `${dragArea.w}px`;
  drawAreaEl.style.height = `${dragArea.h}px`;
  panel.appendChild(drawAreaEl);
  const handlesLayer = document.createElement('div');
  handlesLayer.className = 'art-fireworks-handles art-sticker-handles';
  panel.appendChild(handlesLayer);

  const palette = ['#7bf6ff', '#86efac', '#fde047', '#f9a8d4', '#c4b5fd', '#67e8f9', '#fca5a5', '#a7f3d0'];
  const drawingState = createArtDrawingState({ slotCount: ART_SLOT_COUNT });
  const slotShapes = Array.from({ length: ART_SLOT_COUNT }, () => []);
  const slotStrokeStyles = Array.from({ length: ART_SLOT_COUNT }, () => []);
  const activeSlots = new Set();
  const slotHandleEls = Array.from({ length: ART_SLOT_COUNT }, () => null);
  let selectedColorSlot = null; // note-layer selection
  let selectedPaintIndex = 0;
  let selectedPaintColor = palette[0];
  let stickerStrokeMultiplier = 5;
  let stickerFlipbookMode = false;
  let refreshCustomizeUi = () => {};
  let setCustomiseOpen = () => {};
  let pulseColorButtonHit = () => {};
  const STICKER_FX = Object.freeze([
    { id: 0, key: 'lineFlash', name: 'Line Flash' },
    { id: 1, key: 'lineStatic', name: 'Line Static' },
    { id: 2, key: 'square', name: 'Square' },
    { id: 3, key: 'circle', name: 'Circle' },
    { id: 4, key: 'triangle', name: 'Triangle' },
    { id: 5, key: 'pentagon', name: 'Pentagon' },
  ]);
  const clampStickerFxId = (v) => {
    const n = Math.trunc(Number(v));
    return Number.isFinite(n) && n >= 0 && n < STICKER_FX.length ? n : 0;
  };
  const isShapeFx = (fxId) => clampStickerFxId(fxId) >= 2;
  const shapeKindForFx = (fxId) => {
    const id = clampStickerFxId(fxId);
    if (id === 2) return 'square';
    if (id === 3) return 'circle';
    if (id === 4) return 'triangle';
    if (id === 5) return 'pentagon';
    return null;
  };
  let currentFxId = 0;

  const clampX = (x) => Math.max(AREA_MIN_X, Math.min(AREA_MAX_X, Number(x) || 0));
  const clampY = (y) => Math.max(AREA_MIN_Y, Math.min(AREA_MAX_Y, Number(y) || 0));
  const setStickerFx = (nextId, { announce = true } = {}) => {
    currentFxId = clampStickerFxId(nextId);
    panel.dataset.stickerFx = String(currentFxId);
    try { panel.__syncStickerFxUi?.(); } catch {}
    try { refreshCustomizeUi(); } catch {}
    if (announce) markSceneDirtySafe();
  };
  setStickerFx(0, { announce: false });

  const pointsToPath = (points) => {
    if (!Array.isArray(points) || points.length < 2) return '';
    const first = points[0];
    let d = `M ${Number(first.x).toFixed(2)} ${Number(first.y).toFixed(2)}`;
    for (let i = 1; i < points.length; i++) d += ` L ${Number(points[i].x).toFixed(2)} ${Number(points[i].y).toFixed(2)}`;
    return d;
  };

  // Sticker needs an additional visual gain to match the perceived beam weight of Light Paths.
  const STICKER_BASE_STROKE_WIDTH = 5.4;
  const STICKER_STROKE_MATCH_MULTIPLIER = 2.4; // tweak here if you want closer/thicker parity
  const getPlacementStrokeWidth = () => Math.max(
    1.2,
    STICKER_BASE_STROKE_WIDTH * (Number(stickerStrokeMultiplier) || 1) * STICKER_STROKE_MATCH_MULTIPLIER
  );
  const getStrokeStyleAt = (slot, strokeIndex) => {
    const i = normalizeSlot(slot);
    const list = Array.isArray(slotStrokeStyles[i]) ? slotStrokeStyles[i] : [];
    const style = list[strokeIndex] || null;
    return {
      color: String(style?.color || palette[i] || selectedPaintColor || '#7bf6ff'),
      width: Math.max(1.2, Number(style?.width) || getPlacementStrokeWidth()),
    };
  };
  const syncStrokeStylesForSlot = (slot) => {
    const i = normalizeSlot(slot);
    const strokes = drawingState.getSlotStrokes(i);
    const styles = Array.isArray(slotStrokeStyles[i]) ? slotStrokeStyles[i] : (slotStrokeStyles[i] = []);
    const count = Array.isArray(strokes) ? strokes.length : 0;
    while (styles.length < count) {
      styles.push({
        color: String(palette[i] || selectedPaintColor || '#7bf6ff'),
        width: getPlacementStrokeWidth(),
      });
    }
    if (styles.length > count) styles.length = count;
  };
  const hasSlotDrawing = (slot) => {
    const i = normalizeSlot(slot);
    const strokes = drawingState.hasSlotStrokes(i);
    const shapes = Array.isArray(slotShapes[i]) && slotShapes[i].length > 0;
    return strokes || shapes;
  };
  const ensureStickerLayerBuckets = () => {
    let main = layer.querySelector('g[data-sticker-layer-role="main"]');
    let dimmed = layer.querySelector('g[data-sticker-layer-role="dimmed"]');
    if (!main) {
      main = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      main.setAttribute('data-sticker-layer-role', 'main');
      layer.appendChild(main);
    }
    if (!dimmed) {
      dimmed = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      dimmed.setAttribute('data-sticker-layer-role', 'dimmed');
      dimmed.setAttribute('opacity', '0.34');
      layer.appendChild(dimmed);
    }
    return { main, dimmed };
  };
  const syncStickerLayerDimming = () => {
    const { main, dimmed } = ensureStickerLayerBuckets();
    const selected = selectedColorSlot == null ? null : normalizeSlot(selectedColorSlot);
    const groups = layer.querySelectorAll('g[data-slot]');
    for (const g of groups) {
      const slot = normalizeSlot(g.getAttribute('data-slot'));
      const target = (selected != null && slot !== selected) ? dimmed : main;
      if (g.parentNode !== target) target.appendChild(g);
      g.removeAttribute('opacity');
    }
    dimmed.hidden = selected == null;
  };

  const renderSlot = (slot) => {
    const i = normalizeSlot(slot);
    syncStrokeStylesForSlot(i);
    const oldNodes = layer.querySelectorAll(`[data-slot="${i}"]`);
    oldNodes.forEach((n) => { try { n.remove(); } catch {} });
    const slotGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    slotGroup.setAttribute('data-slot', String(i));
    const strokes = drawingState.getSlotStrokes(i);
    for (let si = 0; si < strokes.length; si++) {
      const d = pointsToPath(strokes[si]);
      if (!d) continue;
      const strokeStyle = getStrokeStyleAt(i, si);
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('class', 'art-sticker-path');
      path.setAttribute('d', d);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', strokeStyle.color);
      path.setAttribute('stroke-width', String(strokeStyle.width));
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
      slotGroup.appendChild(path);
    }
    const shapes = Array.isArray(slotShapes[i]) ? slotShapes[i] : [];
    for (let si = 0; si < shapes.length; si++) {
      const shape = shapes[si];
      const cx = Number(shape?.x) || 0;
      const cy = Number(shape?.y) || 0;
      const size = Math.max(12, Number(shape?.size) || 52);
      const half = size * 0.5;
      const rot = Number(shape?.rot) || 0;
      const kind = String(shape?.kind || '');
      const shapeColor = String(shape?.color || palette[i] || selectedPaintColor || '#7bf6ff');
      const shapeWidth = Math.max(1.2, Number(shape?.strokeWidth) || getPlacementStrokeWidth());
      if (kind === 'circle') {
        const node = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        node.setAttribute('cx', String(cx));
        node.setAttribute('cy', String(cy));
        node.setAttribute('r', String(half));
        node.setAttribute('fill', shapeColor);
        node.setAttribute('stroke', shapeColor);
        node.setAttribute('stroke-width', String(shapeWidth));
        node.setAttribute('stroke-linecap', 'butt');
        node.setAttribute('stroke-linejoin', 'miter');
        node.setAttribute('paint-order', 'stroke');
        slotGroup.appendChild(node);
        continue;
      }
      const sides = kind === 'triangle' ? 3 : (kind === 'pentagon' ? 5 : 4);
      const pts = [];
      for (let k = 0; k < sides; k++) {
        const a = rot + (-Math.PI * 0.5) + ((Math.PI * 2 * k) / sides);
        const x = cx + Math.cos(a) * half;
        const y = cy + Math.sin(a) * half;
        pts.push(`${x.toFixed(2)},${y.toFixed(2)}`);
      }
      const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      poly.setAttribute('points', pts.join(' '));
      poly.setAttribute('fill', shapeColor);
      poly.setAttribute('stroke', shapeColor);
      poly.setAttribute('stroke-width', String(shapeWidth));
      poly.setAttribute('stroke-linecap', 'butt');
      poly.setAttribute('stroke-linejoin', 'miter');
      poly.setAttribute('paint-order', 'stroke');
      slotGroup.appendChild(poly);
    }
    if (slotGroup.childNodes.length) layer.appendChild(slotGroup);
    syncStickerLayerDimming();
  };

  const renderAll = () => {
    for (let i = 0; i < ART_SLOT_COUNT; i++) renderSlot(i);
  };

  const syncActiveDataset = () => {
    panel.dataset.hasActiveSticker = activeSlots.size > 0 ? '1' : '0';
  };

  const setSlotActive = (slot) => {
    const i = normalizeSlot(slot);
    activeSlots.add(i);
    syncActiveDataset();
    syncShapeHandle();
    try { refreshCustomizeUi(); } catch {}
  };

  const setSlotInactive = (slot) => {
    const i = normalizeSlot(slot);
    activeSlots.delete(i);
    syncActiveDataset();
    syncShapeHandle();
    try { refreshCustomizeUi(); } catch {}
  };

  const activateAllSlots = () => {
    activeSlots.clear();
    for (let i = 0; i < ART_SLOT_COUNT; i++) activeSlots.add(i);
    syncActiveDataset();
    try { refreshCustomizeUi(); } catch {}
  };

  const clearSlotDrawing = (slot) => {
    const i = normalizeSlot(slot);
    drawingState.clearSlot(i);
    slotStrokeStyles[i] = [];
    slotShapes[i] = [];
    renderSlot(i);
    syncShapeHandle();
    fitDragAreaToDrawings();
    syncDragArea();
    try { refreshCustomizeUi(); } catch {}
    markSceneDirtySafe();
  };

  const clearAllDrawings = () => {
    drawingState.clearAll();
    for (let i = 0; i < ART_SLOT_COUNT; i++) {
      slotShapes[i] = [];
      slotStrokeStyles[i] = [];
    }
    renderAll();
    syncShapeHandle();
    fitDragAreaToDrawings();
    syncDragArea();
    try { refreshCustomizeUi(); } catch {}
    markSceneDirtySafe();
  };

  const placeShapeAtSlot = (slot, x, y, kind) => {
    const i = normalizeSlot(slot);
    if (!kind) return;
    const list = Array.isArray(slotShapes[i]) ? slotShapes[i] : (slotShapes[i] = []);
    const shape = {
      kind: String(kind),
      x: clampX(x),
      y: clampY(y),
      size: Math.max(26, getPlacementStrokeWidth() * 4.4),
      color: selectedPaintColor,
      strokeWidth: getPlacementStrokeWidth(),
      rot: 0,
    };
    list.push(shape);
    renderSlot(i);
    syncShapeHandle();
    fitDragAreaToDrawings();
    syncDragArea();
    markSceneDirtySafe();
    return shape;
  };

  const trashBtn = document.createElement('button');
  trashBtn.type = 'button';
  trashBtn.className = 'c-btn art-sticker-trash-btn';
  trashBtn.setAttribute('aria-label', 'Delete sticker shape');
  trashBtn.title = 'Delete Shape';
  trashBtn.style.setProperty('--c-btn-size', '124px');
  trashBtn.style.left = `${(AREA_MIN_X + TOTAL_LIMIT_W - 188).toFixed(2)}px`;
  trashBtn.style.top = `${(AREA_MIN_Y - (124 * 0.65)).toFixed(2)}px`;
  trashBtn.style.setProperty('--accent', '#9f2c2c');
  trashBtn.innerHTML = BUTTON_ICON_HTML;
  const trashCore = trashBtn.querySelector('.c-btn-core');
  if (trashCore) trashCore.style.setProperty('--c-btn-icon-url', "url('./assets/UI/T_ButtonTrash.png')");
  panel.appendChild(trashBtn);

  const isClientPointInsideStickerTrash = (clientX, clientY) => {
    const rect = trashBtn.getBoundingClientRect();
    if (!rect || rect.width < 1 || rect.height < 1) return false;
    return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
  };

  const setStickerTrashArmed = (armed) => {
    trashBtn.classList.toggle('is-armed', !!armed);
  };
  let stickerShapeDragging = false;
  const setStickerShapeDragging = (active) => {
    stickerShapeDragging = !!active;
    trashBtn.style.display = panel.dataset.controlsVisible === '1' ? '' : 'none';
    if (!stickerShapeDragging) setStickerTrashArmed(false);
  };

  const getSelectedShapeList = () => {
    if (selectedColorSlot == null) return [];
    const i = normalizeSlot(selectedColorSlot);
    const list = Array.isArray(slotShapes[i]) ? slotShapes[i] : [];
    return list;
  };
  const getSelectedStrokeList = () => {
    if (selectedColorSlot == null) return [];
    const i = normalizeSlot(selectedColorSlot);
    const list = drawingState.getSlotStrokes(i);
    return Array.isArray(list) ? list : [];
  };
  const cloneStrokePoints = (stroke) => {
    if (!Array.isArray(stroke)) return [];
    return stroke.map((p) => ({
      x: Number(p?.x) || 0,
      y: Number(p?.y) || 0,
    }));
  };
  const getStrokeHandlePoint = (stroke) => {
    if (!Array.isArray(stroke) || !stroke.length) return null;
    if (stroke.length === 1) {
      return {
        x: Number(stroke[0]?.x) || 0,
        y: Number(stroke[0]?.y) || 0,
      };
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < stroke.length; i++) {
      const p = stroke[i];
      const x = Number(p?.x) || 0;
      const y = Number(p?.y) || 0;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    return {
      x: (minX + maxX) * 0.5,
      y: (minY + maxY) * 0.5,
    };
  };

  const clearShapeHandlesDom = () => {
    try { handlesLayer.innerHTML = ''; } catch {}
  };

  const syncShapeHandle = () => {
    if (stickerShapeDragging) return;
    clearShapeHandlesDom();
    setStickerTrashArmed(false);
    const selected = selectedColorSlot != null ? normalizeSlot(selectedColorSlot) : null;
    const visible = panel.dataset.controlsVisible === '1' && selected != null;
    trashBtn.style.display = panel.dataset.controlsVisible === '1' ? '' : 'none';
    if (!visible) return;
    const list = getSelectedShapeList();
    const strokeList = getSelectedStrokeList();
    const setHandlePos = (btn, x, y) => {
      const size = 62;
      btn.style.left = `${(Number(x) - size * 0.5).toFixed(2)}px`;
      btn.style.top = `${(Number(y) - size * 0.5).toFixed(2)}px`;
    };
    for (let si = 0; si < list.length; si++) {
      const shape = list[si];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'c-btn art-firework-handle-btn art-sticker-handle-btn is-active-firework';
      btn.setAttribute('aria-label', `Move sticker shape ${selected + 1}`);
      btn.title = `Move Sticker Shape ${selected + 1}`;
      btn.style.setProperty('--c-btn-size', '62px');
      btn.innerHTML = BUTTON_ICON_HTML;
      const core = btn.querySelector('.c-btn-core');
      if (core) core.style.setProperty('--c-btn-icon-url', "url('./assets/UI/T_ButtonDrag.png')");
      btn.dataset.shapeIndex = String(si);
      setHandlePos(btn, Number(shape?.x) || 0, Number(shape?.y) || 0);
      handlesLayer.appendChild(btn);

      let dragging = false;
      let pid = null;
      let onMove = null;
      let onEnd = null;
      const detachDocDrag = () => {
        if (onMove) document.removeEventListener('pointermove', onMove, true);
        if (onEnd) {
          document.removeEventListener('pointerup', onEnd, true);
          document.removeEventListener('pointercancel', onEnd, true);
        }
      };
      btn.addEventListener('pointerdown', (ev) => {
        if (ev.button != null && ev.button !== 0) return;
        if (panel.dataset.controlsVisible !== '1') return;
        ev.preventDefault();
        ev.stopPropagation();
        dragging = true;
        pid = ev.pointerId;
        setStickerShapeDragging(true);
        try { btn.setPointerCapture(ev.pointerId); } catch {}
        if (onMove) return;
        onMove = (mv) => {
          if (!dragging) return;
          if (pid != null && mv.pointerId !== pid) return;
          const pt = clientToPanelPoint(mv.clientX, mv.clientY);
          if (!pt) return;
          mv.preventDefault();
          mv.stopPropagation();
          shape.x = clampX(pt.x);
          shape.y = clampY(pt.y);
          renderSlot(selected);
          setHandlePos(btn, shape.x, shape.y);
          setStickerTrashArmed(isClientPointInsideStickerTrash(mv.clientX, mv.clientY));
          markSceneDirtySafe();
        };
        onEnd = (up) => {
          if (!dragging) return;
          if (pid != null && up.pointerId !== pid) return;
          const dropOnTrash = isClientPointInsideStickerTrash(up.clientX, up.clientY);
          dragging = false;
          pid = null;
          try { btn.releasePointerCapture(up.pointerId); } catch {}
          detachDocDrag();
          onMove = null;
          onEnd = null;
          if (dropOnTrash) {
            const idx = list.indexOf(shape);
            if (idx >= 0) list.splice(idx, 1);
            renderSlot(selected);
            fitDragAreaToDrawings();
            syncDragArea();
            markSceneDirtySafe();
          }
          setStickerShapeDragging(false);
          syncShapeHandle();
        };
        document.addEventListener('pointermove', onMove, true);
        document.addEventListener('pointerup', onEnd, true);
        document.addEventListener('pointercancel', onEnd, true);
      });
      slotHandleEls[selected] = btn;
    }
    for (let si = 0; si < strokeList.length; si++) {
      const stroke = strokeList[si];
      const center = getStrokeHandlePoint(stroke);
      if (!center) continue;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'c-btn art-firework-handle-btn art-sticker-handle-btn is-active-firework';
      btn.setAttribute('aria-label', `Move sticker line ${selected + 1}`);
      btn.title = `Move Sticker Line ${selected + 1}`;
      btn.style.setProperty('--c-btn-size', '62px');
      btn.innerHTML = BUTTON_ICON_HTML;
      const core = btn.querySelector('.c-btn-core');
      if (core) core.style.setProperty('--c-btn-icon-url', "url('./assets/UI/T_ButtonDrag.png')");
      btn.dataset.strokeIndex = String(si);
      setHandlePos(btn, center.x, center.y);
      handlesLayer.appendChild(btn);

      let dragging = false;
      let pid = null;
      let dragStartPt = null;
      let strokeStart = [];
      let onMove = null;
      let onEnd = null;
      const detachDocDrag = () => {
        if (onMove) document.removeEventListener('pointermove', onMove, true);
        if (onEnd) {
          document.removeEventListener('pointerup', onEnd, true);
          document.removeEventListener('pointercancel', onEnd, true);
        }
      };
      btn.addEventListener('pointerdown', (ev) => {
        if (ev.button != null && ev.button !== 0) return;
        if (panel.dataset.controlsVisible !== '1') return;
        const pt = clientToPanelPoint(ev.clientX, ev.clientY);
        if (!pt) return;
        ev.preventDefault();
        ev.stopPropagation();
        dragging = true;
        pid = ev.pointerId;
        dragStartPt = { x: pt.x, y: pt.y };
        strokeStart = cloneStrokePoints(stroke);
        setStickerShapeDragging(true);
        try { btn.setPointerCapture(ev.pointerId); } catch {}
        if (onMove) return;
        onMove = (mv) => {
          if (!dragging) return;
          if (pid != null && mv.pointerId !== pid) return;
          const nextPt = clientToPanelPoint(mv.clientX, mv.clientY);
          if (!nextPt || !dragStartPt) return;
          mv.preventDefault();
          mv.stopPropagation();
          const dx = nextPt.x - dragStartPt.x;
          const dy = nextPt.y - dragStartPt.y;
          for (let pi = 0; pi < stroke.length; pi++) {
            const base = strokeStart[pi] || stroke[pi];
            stroke[pi].x = clampX((Number(base?.x) || 0) + dx);
            stroke[pi].y = clampY((Number(base?.y) || 0) + dy);
          }
          renderSlot(selected);
          const nextCenter = getStrokeHandlePoint(stroke);
          if (nextCenter) setHandlePos(btn, nextCenter.x, nextCenter.y);
          setStickerTrashArmed(isClientPointInsideStickerTrash(mv.clientX, mv.clientY));
          markSceneDirtySafe();
        };
        onEnd = (up) => {
          if (!dragging) return;
          if (pid != null && up.pointerId !== pid) return;
          const dropOnTrash = isClientPointInsideStickerTrash(up.clientX, up.clientY);
          dragging = false;
          pid = null;
          dragStartPt = null;
          strokeStart = [];
          try { btn.releasePointerCapture(up.pointerId); } catch {}
          detachDocDrag();
          onMove = null;
          onEnd = null;
          if (dropOnTrash) {
            const idx = strokeList.indexOf(stroke);
            if (idx >= 0) strokeList.splice(idx, 1);
            if (idx >= 0) {
              const styleList = Array.isArray(slotStrokeStyles[selected]) ? slotStrokeStyles[selected] : [];
              if (idx < styleList.length) styleList.splice(idx, 1);
            }
            drawingState.setSlotStrokes(selected, strokeList);
            renderSlot(selected);
            fitDragAreaToDrawings();
            syncDragArea();
            markSceneDirtySafe();
          }
          setStickerShapeDragging(false);
          syncShapeHandle();
        };
        document.addEventListener('pointermove', onMove, true);
        document.addEventListener('pointerup', onEnd, true);
        document.addEventListener('pointercancel', onEnd, true);
      });
    }
  };
  const syncAllShapeHandles = () => {
    syncShapeHandle();
  };
  const logStickerTrashDebug = (reason = 'manual') => {
    try {
      const pr = panel.getBoundingClientRect?.();
      const tr = trashBtn.getBoundingClientRect?.();
      const cs = getComputedStyle(trashBtn);
      console.log('[Sticker][trash]', {
        reason,
        panelId: panel.id,
        panelRect: pr ? { w: Number(pr.width.toFixed(2)), h: Number(pr.height.toFixed(2)) } : null,
        trashRect: tr ? { x: Number(tr.left.toFixed(2)), y: Number(tr.top.toFixed(2)), w: Number(tr.width.toFixed(2)), h: Number(tr.height.toFixed(2)) } : null,
        display: cs?.display,
        visibility: cs?.visibility,
        opacity: cs?.opacity,
        zIndex: cs?.zIndex,
      });
    } catch {}
  };
  try {
    panel.__debugStickerTrash = logStickerTrashDebug;
    if (window.__MT_DEBUG_STICKER_TRASH) {
      requestAnimationFrame(() => logStickerTrashDebug('init'));
      setTimeout(() => logStickerTrashDebug('post-timeout'), 120);
    }
  } catch {}

  const emitHit = (slot) => {
    const i = normalizeSlot(slot);
    const strokes = drawingState.getSlotStrokes(i);
    const shapes = Array.isArray(slotShapes[i]) ? slotShapes[i] : [];
    if (!strokes.length && !shapes.length) return;
    for (let si = 0; si < strokes.length; si++) {
      const d = pointsToPath(strokes[si]);
      if (!d) continue;
      const style = getStrokeStyleAt(i, si);
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('class', 'art-sticker-path-hit');
      p.setAttribute('d', d);
      p.setAttribute('fill', 'none');
      p.setAttribute('stroke', style.color);
      p.setAttribute('stroke-width', String(Math.max(1.4, style.width * 1.22)));
      p.setAttribute('stroke-linecap', 'round');
      p.setAttribute('stroke-linejoin', 'round');
      hitLayer.appendChild(p);
      setTimeout(() => { try { p.remove(); } catch {} }, 260);
    }
    for (let si = 0; si < shapes.length; si++) {
      const shape = shapes[si];
      const cx = Number(shape?.x) || 0;
      const cy = Number(shape?.y) || 0;
      const size = Math.max(12, Number(shape?.size) || 52);
      const half = size * 0.5;
      const rot = Number(shape?.rot) || 0;
      const kind = String(shape?.kind || '');
      const shapeColor = String(shape?.color || palette[i] || selectedPaintColor || '#7bf6ff');
      const shapeWidth = Math.max(1.4, (Number(shape?.strokeWidth) || getPlacementStrokeWidth()) * 1.22);
      let node = null;
      if (kind === 'circle') {
        node = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        node.setAttribute('cx', String(cx));
        node.setAttribute('cy', String(cy));
        node.setAttribute('r', String(half));
      } else {
        const sides = kind === 'triangle' ? 3 : (kind === 'pentagon' ? 5 : 4);
        const pts = [];
        for (let k = 0; k < sides; k++) {
          const a = rot + (-Math.PI * 0.5) + ((Math.PI * 2 * k) / sides);
          const x = cx + Math.cos(a) * half;
          const y = cy + Math.sin(a) * half;
          pts.push(`${x.toFixed(2)},${y.toFixed(2)}`);
        }
        node = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        node.setAttribute('points', pts.join(' '));
      }
      if (!node) continue;
      node.setAttribute('class', 'art-sticker-path-hit');
      node.setAttribute('fill', shapeColor);
      node.setAttribute('stroke', shapeColor);
      node.setAttribute('stroke-width', String(shapeWidth));
      node.setAttribute('stroke-linecap', 'butt');
      node.setAttribute('stroke-linejoin', 'miter');
      node.setAttribute('paint-order', 'stroke');
      hitLayer.appendChild(node);
      setTimeout(() => { try { node.remove(); } catch {} }, 260);
    }
  };

  const getDrawAreaRect = () => {
    const rect = drawAreaEl.getBoundingClientRect();
    if (!rect || rect.width < 1 || rect.height < 1) return null;
    return rect;
  };

  const isClientPointInsideDrawArea = (clientX, clientY) => {
    const rect = getDrawAreaRect();
    if (!rect) return false;
    return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
  };

  const clientToPanelPoint = (clientX, clientY) => {
    const rect = getDrawAreaRect();
    if (!rect) return null;
    const rx = (clientX - rect.left) / rect.width;
    const ry = (clientY - rect.top) / rect.height;
    const x = clampX(AREA_MIN_X + rx * TOTAL_LIMIT_W);
    const y = clampY(AREA_MIN_Y + ry * TOTAL_LIMIT_H);
    return { x, y };
  };

  const appendStrokePoint = (arr, x, y, minDist = 1.5) => {
    if (!Array.isArray(arr)) return false;
    const nx = clampX(x);
    const ny = clampY(y);
    const prev = arr.length ? arr[arr.length - 1] : null;
    if (prev && Math.hypot(nx - prev.x, ny - prev.y) < minDist) return false;
    arr.push({ x: nx, y: ny });
    return true;
  };

  const drawPreviewPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  drawPreviewPath.setAttribute('class', 'art-sticker-draw-preview');
  drawPreviewPath.setAttribute('fill', 'none');
  drawPreviewPath.setAttribute('stroke-linecap', 'round');
  drawPreviewPath.setAttribute('stroke-linejoin', 'round');
  drawPreviewPath.style.display = 'none';
  hitLayer.appendChild(drawPreviewPath);

  const fitDragAreaToDrawings = () => {
    const coords = [];
    for (const slot of activeSlots) {
      const strokes = drawingState.getSlotStrokes(slot);
      for (const stroke of strokes) {
        for (const pt of stroke) {
          coords.push({ x: clampX(pt?.x), y: clampY(pt?.y) });
        }
      }
      const shapes = Array.isArray(slotShapes[slot]) ? slotShapes[slot] : [];
      for (const shape of shapes) {
        const cx = clampX(shape?.x);
        const cy = clampY(shape?.y);
        const half = Math.max(8, (Number(shape?.size) || 48) * 0.5);
        coords.push({ x: clampX(cx - half), y: clampY(cy - half) });
        coords.push({ x: clampX(cx + half), y: clampY(cy + half) });
      }
    }
    if (!coords.length) {
      dragArea.x = AREA_MIN_X;
      dragArea.y = AREA_MIN_Y;
      dragArea.w = INITIAL_DRAG_W;
      dragArea.h = INITIAL_DRAG_H;
      return;
    }
    const pad = 28;
    const maxX = Math.max(...coords.map((p) => p.x));
    const maxY = Math.max(...coords.map((p) => p.y));
    const right = Math.min(AREA_MAX_X, maxX + pad);
    const bottom = Math.min(AREA_MAX_Y, maxY + pad);
    dragArea.x = AREA_MIN_X;
    dragArea.y = AREA_MIN_Y;
    dragArea.w = Math.max(INITIAL_DRAG_W, right - AREA_MIN_X);
    dragArea.h = Math.max(INITIAL_DRAG_H, bottom - AREA_MIN_Y);
  };

  const syncDrawPreview = (slot, points, visible) => {
    if (!visible || !Array.isArray(points) || points.length < 2) {
      drawPreviewPath.style.display = 'none';
      drawPreviewPath.setAttribute('d', '');
      return;
    }
    const i = normalizeSlot(slot);
    drawPreviewPath.style.display = '';
    drawPreviewPath.setAttribute('d', pointsToPath(points));
    drawPreviewPath.setAttribute('stroke', String(selectedPaintColor || palette[i] || '#7bf6ff'));
    drawPreviewPath.setAttribute('stroke-width', String(getPlacementStrokeWidth()));
  };

  const PANEL_PX = 220;
  const currentDropArea = {
    x: AREA_MIN_X,
    y: AREA_MIN_Y,
    w: TOTAL_LIMIT_W,
    h: TOTAL_LIMIT_H,
  };
  let collapsedHintEl = null;
  const syncDragArea = () => {
    const controlsVisible = panel.dataset.controlsVisible === '1';
    const hasActive = activeSlots.size > 0;
    const collapsedEmpty = !controlsVisible && !hasActive;
    const armed = panel.dataset.controlsVisible === '1'
      && selectedColorSlot != null
      && activeSlots.has(normalizeSlot(selectedColorSlot));
    const areaW = collapsedEmpty ? (TOTAL_LIMIT_W * 0.5) : TOTAL_LIMIT_W;
    const areaH = collapsedEmpty ? (TOTAL_LIMIT_H * 0.5) : TOTAL_LIMIT_H;
    currentDropArea.x = AREA_MIN_X;
    currentDropArea.y = AREA_MIN_Y;
    currentDropArea.w = areaW;
    currentDropArea.h = areaH;
    drawAreaEl.style.left = `${AREA_MIN_X.toFixed(2)}px`;
    drawAreaEl.style.top = `${AREA_MIN_Y.toFixed(2)}px`;
    drawAreaEl.style.width = `${areaW.toFixed(2)}px`;
    drawAreaEl.style.height = `${areaH.toFixed(2)}px`;
    drawAreaEl.classList.toggle('is-board-draw-armed', armed);
    drawAreaEl.classList.toggle('is-collapsed-empty', collapsedEmpty);
    drawAreaEl.style.pointerEvents = armed ? 'auto' : 'none';
    if (collapsedHintEl) {
      collapsedHintEl.hidden = !collapsedEmpty;
      collapsedHintEl.style.left = `${(AREA_MIN_X + 14).toFixed(2)}px`;
      collapsedHintEl.style.top = `${(AREA_MIN_Y + 14).toFixed(2)}px`;
    }
  };
  panel.isArtMusicDropPoint = (clientX, clientY) => {
    const panelRect = panel.getBoundingClientRect?.();
    if (!panelRect || panelRect.width < 1 || panelRect.height < 1) return false;
    const scaleX = panelRect.width / PANEL_PX;
    const scaleY = panelRect.height / PANEL_PX;
    const left = panelRect.left + currentDropArea.x * scaleX;
    const top = panelRect.top + currentDropArea.y * scaleY;
    const right = left + currentDropArea.w * scaleX;
    const bottom = top + currentDropArea.h * scaleY;
    return clientX >= left && clientX <= right && clientY >= top && clientY <= bottom;
  };
  panel.onArtMusicDropHover = ({ active = false, valid = true } = {}) => {
    const isActive = !!active;
    drawAreaEl.classList.toggle('is-music-drop-hover', isActive);
    drawAreaEl.classList.toggle('is-music-drop-valid', isActive && !!valid);
    drawAreaEl.classList.toggle('is-music-drop-invalid', isActive && !valid);
  };
  panel.onArtMusicDropReject = () => {
    try {
      drawAreaEl.animate(
        [
          { transform: 'translateX(0px)' },
          { transform: 'translateX(-8px)' },
          { transform: 'translateX(8px)' },
          { transform: 'translateX(-6px)' },
          { transform: 'translateX(6px)' },
          { transform: 'translateX(0px)' },
        ],
        { duration: 320, easing: 'ease-out' }
      );
    } catch {}
    try {
      if (collapsedHintEl) {
        collapsedHintEl.animate(
          [
            { transform: 'scale(1)' },
            { transform: 'scale(1.24)' },
            { transform: 'scale(1)' },
          ],
          { duration: 360, easing: 'ease-out' }
        );
      }
    } catch {}
  };

  panel.onArtSetActiveSlots = (slots = []) => {
    const next = new Set((Array.isArray(slots) ? slots : []).map((s) => normalizeSlot(s)));
    for (let i = 0; i < ART_SLOT_COUNT; i++) {
      if (next.has(i)) setSlotActive(i);
      else setSlotInactive(i);
    }
    if (selectedColorSlot != null && !activeSlots.has(normalizeSlot(selectedColorSlot))) selectedColorSlot = null;
    if (selectedColorSlot == null && panel.dataset.controlsVisible === '1' && activeSlots.size > 0) {
      const first = Array.from(activeSlots.values()).map((s) => normalizeSlot(s)).sort((a, b) => a - b)[0];
      if (Number.isFinite(first)) selectedColorSlot = first;
    }
    renderAll();
    syncDragArea();
    syncAllShapeHandles();
  };

  const customisePanel = document.createElement('div');
  customisePanel.className = 'art-line-style-panel';
  customisePanel.hidden = true;
  panel.appendChild(customisePanel);

  const topActions = document.createElement('div');
  topActions.className = 'art-sticker-top-actions';
  customisePanel.appendChild(topActions);

  const randomArtBtn = document.createElement('button');
  randomArtBtn.type = 'button';
  randomArtBtn.className = 'c-btn art-sticker-random-art-btn';
  randomArtBtn.setAttribute('aria-label', 'Randomize sticker art');
  randomArtBtn.title = 'Random Art';
  randomArtBtn.style.setProperty('--c-btn-size', '144px');
  randomArtBtn.style.width = '144px';
  randomArtBtn.style.height = '144px';
  randomArtBtn.innerHTML = BUTTON_ICON_HTML;
  const randomArtCore = randomArtBtn.querySelector('.c-btn-core');
  if (randomArtCore) randomArtCore.style.setProperty('--c-btn-icon-url', "url('./assets/UI/T_ButtonRandomArt.png')");
  topActions.appendChild(randomArtBtn);

  const flipbookBtn = document.createElement('button');
  flipbookBtn.type = 'button';
  flipbookBtn.className = 'c-btn art-sticker-random-art-btn art-sticker-flipbook-btn';
  flipbookBtn.setAttribute('aria-label', 'Toggle flip book mode');
  flipbookBtn.title = 'Flip Book';
  flipbookBtn.style.setProperty('--c-btn-size', '144px');
  flipbookBtn.style.width = '144px';
  flipbookBtn.style.height = '144px';
  flipbookBtn.setAttribute('aria-pressed', 'false');
  flipbookBtn.innerHTML = BUTTON_ICON_HTML;
  const flipbookCore = flipbookBtn.querySelector('.c-btn-core');
  if (flipbookCore) flipbookCore.style.setProperty('--c-btn-icon-url', "url('./assets/UI/T_ButtonFlipbook.png')");
  const syncFlipbookBtn = () => {
    flipbookBtn.classList.toggle('is-active', !!stickerFlipbookMode);
    flipbookBtn.setAttribute('aria-pressed', stickerFlipbookMode ? 'true' : 'false');
  };
  flipbookBtn.addEventListener('pointerdown', (ev) => {
    if (ev.button != null && ev.button !== 0) return;
    ev.preventDefault();
    ev.stopPropagation();
    stickerFlipbookMode = !stickerFlipbookMode;
    syncFlipbookBtn();
    markSceneDirtySafe();
  });
  topActions.appendChild(flipbookBtn);
  syncFlipbookBtn();

  const thicknessControlApi = createArtLineThicknessControl({
    title: 'Line Thickness',
    value: stickerStrokeMultiplier,
    min: 0.6,
    max: 8,
    step: 0.1,
    onInput: (next) => {
      const n = Number(next);
      if (!Number.isFinite(n)) return;
      stickerStrokeMultiplier = Math.max(0.2, n);
      markSceneDirtySafe();
    },
  });
  customisePanel.appendChild(thicknessControlApi.root);
  const canvasEmptyPrompt = document.createElement('div');
  canvasEmptyPrompt.className = 'art-sticker-empty-prompt';
  canvasEmptyPrompt.style.left = `${(AREA_MIN_X + 10).toFixed(2)}px`;
  canvasEmptyPrompt.style.top = `${(AREA_MIN_Y + 10).toFixed(2)}px`;
  canvasEmptyPrompt.hidden = true;
  const canvasEmptyText = document.createElement('div');
  canvasEmptyText.className = 'art-sticker-empty-text';
  canvasEmptyText.textContent = 'Drag music toys here or add music with:';
  canvasEmptyPrompt.appendChild(canvasEmptyText);
  const canvasEmptyActions = document.createElement('div');
  canvasEmptyActions.className = 'art-sticker-empty-actions';
  const emptyRandomBtn = document.createElement('button');
  emptyRandomBtn.type = 'button';
  emptyRandomBtn.className = 'c-btn art-line-empty-action-btn';
  emptyRandomBtn.setAttribute('aria-label', 'Randomize art toy music');
  emptyRandomBtn.title = 'Random Music';
  emptyRandomBtn.innerHTML = BUTTON_ICON_HTML;
  const emptyRandomCore = emptyRandomBtn.querySelector('.c-btn-core');
  if (emptyRandomCore) emptyRandomCore.style.setProperty('--c-btn-icon-url', "url('./assets/UI/T_ButtonRandomNotes.png')");
  emptyRandomBtn.addEventListener('click', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    const randomActionBtn = panel.querySelector(`[data-action="artToy:randomMusic"][data-art-toy-id="${panel.id}"]`)
      || panel.querySelector(`[data-action="artToy:randomMusic"]`);
    try { randomActionBtn?.click?.(); } catch {}
  });
  canvasEmptyActions.appendChild(emptyRandomBtn);
  const emptyEnterBtn = document.createElement('button');
  emptyEnterBtn.type = 'button';
  emptyEnterBtn.className = 'c-btn art-line-empty-action-btn art-line-empty-enter-btn';
  emptyEnterBtn.setAttribute('aria-label', 'Enter internal view');
  emptyEnterBtn.title = 'Enter';
  emptyEnterBtn.innerHTML = BUTTON_ICON_HTML;
  const emptyEnterCore = emptyEnterBtn.querySelector('.c-btn-core');
  if (emptyEnterCore) emptyEnterCore.style.setProperty('--c-btn-icon-url', "url('./assets/UI/T_ButtonEnter.png')");
  emptyEnterBtn.addEventListener('click', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    const enterActionBtn = panel.querySelector(`[data-action="artToy:music"][data-art-toy-id="${panel.id}"]`)
      || panel.querySelector(`[data-action="artToy:music"]`);
    try { enterActionBtn?.click?.(); } catch {}
  });
  canvasEmptyActions.appendChild(emptyEnterBtn);
  canvasEmptyPrompt.appendChild(canvasEmptyActions);
  panel.appendChild(canvasEmptyPrompt);
  const canvasDrawPrompt = document.createElement('div');
  canvasDrawPrompt.className = 'art-sticker-draw-prompt';
  canvasDrawPrompt.style.left = `${(AREA_MIN_X + 10).toFixed(2)}px`;
  canvasDrawPrompt.style.top = `${(AREA_MIN_Y + 10).toFixed(2)}px`;
  canvasDrawPrompt.textContent = 'Draw';
  canvasDrawPrompt.hidden = true;
  panel.appendChild(canvasDrawPrompt);
  collapsedHintEl = document.createElement('div');
  collapsedHintEl.className = 'art-sticker-collapsed-hint';
  collapsedHintEl.textContent = 'Give me music';
  collapsedHintEl.hidden = true;
  panel.appendChild(collapsedHintEl);

  const lineButtonsTitle = document.createElement('div');
  lineButtonsTitle.className = 'art-line-style-subhead art-line-style-subhead-active-lines';
  lineButtonsTitle.textContent = 'Active Lines';
  lineButtonsTitle.hidden = true;
  customisePanel.appendChild(lineButtonsTitle);

  const lineButtonsHost = document.createElement('div');
  lineButtonsHost.className = 'art-line-color-buttons';
  customisePanel.appendChild(lineButtonsHost);

  const noteLayerPanel = document.createElement('div');
  noteLayerPanel.className = 'art-sticker-note-layer-panel';
  noteLayerPanel.style.left = `${(AREA_MIN_X + TOTAL_LIMIT_W + 12).toFixed(2)}px`;
  noteLayerPanel.style.top = `${AREA_MIN_Y.toFixed(2)}px`;
  const noteLayerTitle = document.createElement('div');
  noteLayerTitle.className = 'art-sticker-note-layer-title';
  noteLayerTitle.textContent = 'Note Layers';
  noteLayerPanel.appendChild(noteLayerTitle);
  panel.appendChild(noteLayerPanel);

  const noteButtonHitUntilBySlot = new Map();
  const noteButtonHitTimerBySlot = new Map();
  const applyNoteButtonHitState = (slot) => {
    const i = normalizeSlot(slot);
    const btn = noteLayerPanel.querySelector(`button[data-note-slot="${i}"]`);
    if (!btn) return;
    const until = Number(noteButtonHitUntilBySlot.get(i) || 0);
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    btn.classList.toggle('is-note-hit', until > now);
  };
  pulseColorButtonHit = (slot) => {
    const i = normalizeSlot(slot);
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    noteButtonHitUntilBySlot.set(i, now + 320);
    const btn = noteLayerPanel.querySelector(`button[data-note-slot="${i}"]`);
    if (btn) {
      btn.classList.remove('is-note-hit');
      void btn.offsetWidth;
      btn.classList.add('is-note-hit');
    }
    try { clearTimeout(noteButtonHitTimerBySlot.get(i)); } catch {}
    noteButtonHitTimerBySlot.set(i, setTimeout(() => {
      const latestUntil = Number(noteButtonHitUntilBySlot.get(i) || 0);
      const checkNow = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      if (latestUntil > checkNow) return;
      noteButtonHitUntilBySlot.delete(i);
      applyNoteButtonHitState(i);
      noteButtonHitTimerBySlot.delete(i);
    }, 340));
  };

  const pickerTitle = document.createElement('div');
  pickerTitle.className = 'art-line-style-subhead';
  pickerTitle.textContent = 'Line Color';
  pickerTitle.hidden = true;
  customisePanel.appendChild(pickerTitle);

  const pickerWrap = document.createElement('div');
  pickerWrap.className = 'art-line-color-picker-wrap';
  pickerWrap.hidden = true;
  customisePanel.appendChild(pickerWrap);

  const pickerRow = document.createElement('div');
  pickerRow.className = 'art-line-picker-row';
  pickerWrap.appendChild(pickerRow);

  const pickerApi = createArtHueSatPicker({
    size: 296,
    color: selectedPaintColor,
    onChange: ({ hex } = {}) => {
      const c = String(hex || '').trim();
      if (!/^#([0-9a-f]{6})$/i.test(c)) return;
      selectedPaintColor = c;
      palette[selectedPaintIndex] = c;
      const btn = lineButtonsHost.querySelector(`button[data-color-index="${selectedPaintIndex}"]`);
      if (btn) btn.style.setProperty('--accent', c);
    },
    onCommit: ({ hex } = {}) => {
      const c = String(hex || '').trim();
      if (!/^#([0-9a-f]{6})$/i.test(c)) return;
      selectedPaintColor = c;
      palette[selectedPaintIndex] = c;
      markSceneDirtySafe();
    },
  });
  pickerRow.appendChild(pickerApi.root);

  const selectLineForCustomise = (slot) => {
    const i = normalizeSlot(slot);
    if (selectedColorSlot != null && normalizeSlot(selectedColorSlot) === i) {
      selectedColorSlot = null;
      renderAll();
      refreshCustomizeUi();
      syncDragArea();
      syncAllShapeHandles();
      return;
    }
    selectedColorSlot = i;
    renderAll();
    refreshCustomizeUi();
    syncDragArea();
    syncAllShapeHandles();
  };

  const refreshNoteLayerUi = () => {
    const active = Array.from(activeSlots.values()).map((s) => normalizeSlot(s)).sort((a, b) => a - b);
    noteLayerPanel.innerHTML = '';
    noteLayerPanel.appendChild(noteLayerTitle);
    noteLayerPanel.hidden = panel.dataset.controlsVisible !== '1' || active.length === 0;
    if (noteLayerPanel.hidden) return;
    for (const slot of active) {
      const row = document.createElement('div');
      row.className = 'art-sticker-note-row';

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'c-btn art-sticker-note-btn';
      btn.dataset.noteSlot = String(slot);
      btn.title = `Select Note ${slot + 1}`;
      btn.setAttribute('aria-label', `Select note layer ${slot + 1}`);
      btn.style.setProperty('--c-btn-size', '88px');
      btn.innerHTML = BUTTON_ICON_HTML;
      const core = btn.querySelector('.c-btn-core');
      if (core) core.style.setProperty('--c-btn-icon-url', "url('./assets/UI/T_NoteLayer.png')");
      btn.classList.toggle('is-selected', selectedColorSlot != null && normalizeSlot(selectedColorSlot) === slot);
      btn.classList.toggle('is-dimmed', selectedColorSlot != null && normalizeSlot(selectedColorSlot) !== slot);
      applyNoteButtonHitState(slot);
      btn.addEventListener('pointerdown', (ev) => {
        if (ev.button != null && ev.button !== 0) return;
        ev.preventDefault();
        ev.stopPropagation();
        selectLineForCustomise(slot);
      });
      row.appendChild(btn);

      if (hasSlotDrawing(slot)) {
        const clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.className = 'c-btn art-line-clear-btn art-sticker-note-clear-btn';
        clearBtn.setAttribute('aria-label', `Clear note ${slot + 1} drawings`);
        clearBtn.title = `Clear Note ${slot + 1}`;
        clearBtn.style.setProperty('--c-btn-size', '58px');
        clearBtn.style.setProperty('--accent', '#f87171');
        clearBtn.innerHTML = BUTTON_ICON_HTML;
        const clearCore = clearBtn.querySelector('.c-btn-core');
        if (clearCore) clearCore.style.setProperty('--c-btn-icon-url', "url('./assets/UI/T_ButtonClear.png')");
        clearBtn.addEventListener('pointerdown', (ev) => {
          if (ev.button != null && ev.button !== 0) return;
          ev.preventDefault();
          ev.stopPropagation();
          clearSlotDrawing(slot);
        });
        row.appendChild(clearBtn);
      }
      noteLayerPanel.appendChild(row);
    }
  };

  refreshCustomizeUi = () => {
    const active = Array.from(activeSlots.values()).map((s) => normalizeSlot(s)).sort((a, b) => a - b);
    const hasActive = active.length > 0;
    const hasAnyArt = active.some((slot) => hasSlotDrawing(slot));
    const controlsVisible = panel.dataset.controlsVisible === '1';
    const fxShell = getBaseArtToyControlsHost(panel)?.querySelector?.('.art-toy-fx-shell');
    if (fxShell) fxShell.hidden = !hasActive;
    canvasEmptyPrompt.hidden = !(controlsVisible && !hasActive && !hasAnyArt);
    canvasDrawPrompt.hidden = !(controlsVisible && hasActive && !hasAnyArt);
    customisePanel.hidden = !controlsVisible || !hasActive;
    customisePanel.classList.toggle('is-empty-lines', !hasActive);
    lineButtonsHost.innerHTML = '';
    if (!hasActive) {
      selectedColorSlot = null;
      pickerWrap.hidden = true;
      pickerTitle.hidden = true;
      refreshNoteLayerUi();
      syncDragArea();
      syncAllShapeHandles();
      return;
    }
    if (selectedColorSlot != null && !active.includes(normalizeSlot(selectedColorSlot))) {
      selectedColorSlot = null;
      renderAll();
    }
    for (let i = 0; i < ART_SLOT_COUNT; i++) {
      const row = document.createElement('div');
      row.className = 'art-line-color-row';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'c-btn art-line-color-btn';
      btn.dataset.colorIndex = String(i);
      btn.title = `Pick color ${i + 1}`;
      btn.setAttribute('aria-label', `Pick paint color ${i + 1}`);
      btn.style.setProperty('--c-btn-size', '112px');
      btn.style.setProperty('--accent', palette[i]);
      btn.innerHTML = BUTTON_ICON_HTML;
      const colorCore = btn.querySelector('.c-btn-core');
      if (colorCore) colorCore.style.setProperty('--c-btn-icon-url', 'none');
      btn.classList.toggle('is-selected', selectedPaintIndex === i);
      btn.addEventListener('pointerdown', (ev) => {
        if (ev.button != null && ev.button !== 0) return;
        ev.preventDefault();
        ev.stopPropagation();
        selectedPaintIndex = i;
        selectedPaintColor = String(palette[i] || '#7bf6ff');
        pickerWrap.hidden = false;
        pickerTitle.hidden = false;
        pickerApi.setColor(selectedPaintColor);
        refreshCustomizeUi();
      });
      row.appendChild(btn);
      lineButtonsHost.appendChild(row);
    }
    refreshNoteLayerUi();
    syncDragArea();
    syncAllShapeHandles();
  };

  setCustomiseOpen = (open) => {
    const nextOpen = !!open;
    customisePanel.hidden = !nextOpen || activeSlots.size === 0;
    customisePanel.classList.toggle('is-open', nextOpen);
    if (nextOpen) {
      try { refreshCustomizeUi(); } catch {}
      syncAllShapeHandles();
      return;
    }
    canvasEmptyPrompt.hidden = true;
    canvasDrawPrompt.hidden = true;
    selectedColorSlot = null;
    renderAll();
    pickerWrap.hidden = true;
    pickerTitle.hidden = true;
    try { refreshCustomizeUi(); } catch {}
    syncAllShapeHandles();
  };

  try {
    const controlsHost = getBaseArtToyControlsHost(panel);
    const fxShell = controlsHost?.querySelector?.('.art-toy-fx-shell') || null;
    const fxCurrentBtn = fxShell?.querySelector?.('.art-toy-fx-current') || null;
    const fxCurrentStage = fxShell?.querySelector?.('.art-toy-fx-stage-current') || null;
    const fxGrid = fxShell?.querySelector?.('.art-toy-fx-grid') || null;
    const fxCards = [];
    const makePreviewNode = (stage, fxId) => {
      if (!stage) return;
      const id = clampStickerFxId(fxId);
      const tone = palette[id % palette.length];
      if (id <= 1) {
        const line = document.createElement('span');
        line.className = 'art-laser-preview-line';
        line.style.background = tone;
        line.style.left = '50%';
        line.style.top = '50%';
        line.style.width = '44px';
        line.style.height = '4px';
        line.style.opacity = id === 0 ? '1' : '0.72';
        line.style.filter = `drop-shadow(0 0 ${id === 0 ? 12 : 6}px ${tone})`;
        stage.appendChild(line);
        if (id === 0) {
          try { line.animate([{ opacity: 0.25 }, { opacity: 1 }, { opacity: 0.25 }], { duration: 560, easing: 'ease-out' }); } catch {}
        }
        setTimeout(() => { try { line.remove(); } catch {} }, 760);
        return;
      }
      const shape = document.createElement('span');
      shape.style.position = 'absolute';
      shape.style.left = '50%';
      shape.style.top = '50%';
      shape.style.width = '26px';
      shape.style.height = '26px';
      shape.style.transform = 'translate(-50%, -50%)';
      shape.style.boxSizing = 'border-box';
      shape.style.filter = `drop-shadow(0 0 8px ${tone})`;
      shape.style.background = tone;
      if (id === 3) shape.style.borderRadius = '999px';
      else if (id === 4) shape.style.clipPath = 'polygon(50% 8%, 8% 92%, 92% 92%)';
      else if (id === 5) shape.style.clipPath = 'polygon(50% 4%, 95% 34%, 78% 90%, 22% 90%, 5% 34%)';
      stage.appendChild(shape);
      setTimeout(() => { try { shape.remove(); } catch {} }, 760);
    };
    const addPreviewLoop = (stage, fxResolver) => {
      if (!stage) return;
      let timer = 0;
      const tick = () => {
        if (!panel.isConnected || !stage.isConnected) {
          if (timer) clearTimeout(timer);
          return;
        }
        const nextId = typeof fxResolver === 'function' ? fxResolver() : fxResolver;
        makePreviewNode(stage, nextId);
        timer = setTimeout(tick, 700);
      };
      tick();
    };
    const setFxPickerOpen = () => {
      if (!fxShell || !fxGrid) return;
      fxShell.dataset.open = '1';
      if (fxCurrentBtn) fxCurrentBtn.setAttribute('aria-expanded', 'true');
      fxGrid.hidden = false;
    };
    const syncFxUi = () => {
      const fxId = clampStickerFxId(currentFxId);
      const fxName = STICKER_FX.find((fx) => fx.id === fxId)?.name || 'Effect';
      if (fxCurrentBtn) {
        fxCurrentBtn.title = `Style: ${fxName}`;
        fxCurrentBtn.setAttribute('aria-label', `Current sticker style: ${fxName}`);
      }
      for (const card of fxCards) {
        const selected = card.dataset.fxId === String(fxId);
        card.classList.toggle('is-selected', selected);
      }
    };
    try { panel.__syncStickerFxUi = syncFxUi; } catch {}
    if (fxGrid && STICKER_FX.length) {
      fxGrid.innerHTML = '';
      for (const fx of STICKER_FX) {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'art-toy-fx-card';
        card.dataset.fxId = String(fx.id);
        card.title = fx.name;
        card.setAttribute('aria-label', `Select ${fx.name} sticker style`);
        const stage = document.createElement('span');
        stage.className = 'art-toy-fx-stage';
        stage.dataset.fxId = String(fx.id);
        card.appendChild(stage);
        fxGrid.appendChild(card);
        fxCards.push(card);
        addPreviewLoop(stage, fx.id);
        card.addEventListener('click', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          setStickerFx(fx.id);
        });
      }
    }
    setFxPickerOpen(true);
    syncFxUi();
  } catch {}

  try {
    const controlsVisMo = new MutationObserver(() => {
      setCustomiseOpen(panel.dataset.controlsVisible === '1');
      syncDragArea();
    });
    controlsVisMo.observe(panel, { attributes: true, attributeFilter: ['data-controls-visible'] });
  } catch {}
  setCustomiseOpen(panel.dataset.controlsVisible === '1');

  let outsideTapCandidate = false;
  let outsideTapPointerId = null;
  let outsideTapStartX = 0;
  let outsideTapStartY = 0;
  let outsideTapMoved = false;
  const OUTSIDE_TAP_SLOP_PX = 6;

  const resetOutsideTap = () => {
    outsideTapCandidate = false;
    outsideTapPointerId = null;
    outsideTapStartX = 0;
    outsideTapStartY = 0;
    outsideTapMoved = false;
  };

  const removeOutsideTapListeners = () => {
    document.removeEventListener('pointerdown', onDocPointerDownHideExtras, true);
    document.removeEventListener('pointermove', onDocPointerMoveHideExtras, true);
    document.removeEventListener('pointerup', onDocPointerUpHideExtras, true);
    document.removeEventListener('pointercancel', onDocPointerCancelHideExtras, true);
  };

  const onDocPointerDownHideExtras = (ev) => {
    if (!panel.isConnected) {
      removeOutsideTapListeners();
      return;
    }
    resetOutsideTap();
    if (panel.dataset.controlsVisible !== '1') return;
    const target = ev?.target;
    if (target && panel.contains(target)) return;
    if (isClientPointInsideDrawArea(ev.clientX, ev.clientY)) return;
    outsideTapCandidate = true;
    outsideTapPointerId = ev.pointerId;
    outsideTapStartX = ev.clientX;
    outsideTapStartY = ev.clientY;
  };

  const onDocPointerMoveHideExtras = (ev) => {
    if (!outsideTapCandidate) return;
    if (outsideTapPointerId != null && ev.pointerId !== outsideTapPointerId) return;
    const dx = ev.clientX - outsideTapStartX;
    const dy = ev.clientY - outsideTapStartY;
    if ((dx * dx + dy * dy) > (OUTSIDE_TAP_SLOP_PX * OUTSIDE_TAP_SLOP_PX)) {
      outsideTapMoved = true;
    }
  };

  const onDocPointerUpHideExtras = (ev) => {
    if (!outsideTapCandidate) return;
    if (outsideTapPointerId != null && ev.pointerId !== outsideTapPointerId) return;
    const target = ev?.target;
    const endedOutsidePanel = !(target && panel.contains(target));
    const endedOutsideArea = !isClientPointInsideDrawArea(ev.clientX, ev.clientY);
    const shouldHide = !outsideTapMoved && endedOutsidePanel && endedOutsideArea;
    resetOutsideTap();
    if (!shouldHide) return;
    if (!panel.isConnected) return;
    if (panel.dataset.controlsVisible !== '1') return;
    setBaseArtToyControlsVisible(panel, false);
  };

  const onDocPointerCancelHideExtras = (ev) => {
    if (!outsideTapCandidate) return;
    if (outsideTapPointerId != null && ev.pointerId !== outsideTapPointerId) return;
    resetOutsideTap();
  };

  document.addEventListener('pointerdown', onDocPointerDownHideExtras, true);
  document.addEventListener('pointermove', onDocPointerMoveHideExtras, true);
  document.addEventListener('pointerup', onDocPointerUpHideExtras, true);
  document.addEventListener('pointercancel', onDocPointerCancelHideExtras, true);

  // Runtime geometry debug for Sticker draw-area sizing.
  const logStickerDrawAreaDebug = (reason = 'manual') => {
    try {
      const pr = panel.getBoundingClientRect?.();
      const dr = drawAreaEl.getBoundingClientRect?.();
      const ratio = (pr && dr && pr.width > 0 && pr.height > 0)
        ? {
          x: Number((dr.width / pr.width).toFixed(3)),
          y: Number((dr.height / pr.height).toFixed(3)),
        }
        : null;
      console.log('[Sticker][draw-area]', {
        reason,
        panelId: panel.id,
        panelStyleSize: {
          w: panel.style?.width || null,
          h: panel.style?.height || null,
        },
        panelOffset: {
          w: Number(panel.offsetWidth || 0),
          h: Number(panel.offsetHeight || 0),
        },
        panelRect: pr ? { w: Number(pr.width.toFixed(2)), h: Number(pr.height.toFixed(2)) } : null,
        drawRect: dr ? { w: Number(dr.width.toFixed(2)), h: Number(dr.height.toFixed(2)) } : null,
        ratio,
        styles: {
          left: drawAreaEl.style.left,
          top: drawAreaEl.style.top,
          width: drawAreaEl.style.width,
          height: drawAreaEl.style.height,
        },
      });
    } catch {}
  };
  const logStickerSizeMetrics = (reason = 'manual') => {
    try {
      const widthWorld = getPlacementStrokeWidth();
      const panelRect = panel.getBoundingClientRect?.();
      const panelScreenW = Math.max(1, Number(panelRect?.width) || 1);
      const worldToScreen = panelScreenW / 220;
      const widthScreen = widthWorld * worldToScreen;
      const slots = Array.from(activeSlots.values()).map((s) => normalizeSlot(s)).sort((a, b) => a - b);
      let totalLen = 0;
      let strokeCount = 0;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const slot of slots) {
        const strokes = drawingState.getSlotStrokes(slot);
        if (!Array.isArray(strokes)) continue;
        for (const stroke of strokes) {
          if (!Array.isArray(stroke) || stroke.length < 2) continue;
          strokeCount += 1;
          for (let i = 0; i < stroke.length; i++) {
            const p = stroke[i];
            const x = Number(p?.x) || 0;
            const y = Number(p?.y) || 0;
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
            if (i > 0) {
              const prev = stroke[i - 1];
              totalLen += Math.hypot(x - (Number(prev?.x) || 0), y - (Number(prev?.y) || 0));
            }
          }
        }
      }
      const boundsWorld = strokeCount
        ? { w: Number((maxX - minX).toFixed(2)), h: Number((maxY - minY).toFixed(2)) }
        : { w: 0, h: 0 };
      console.log('[ArtSize][Sticker]', {
        reason,
        panelId: panel.id,
        activeSlots: slots.length,
        strokeCount,
        totalPathLenWorld: Number(totalLen.toFixed(2)),
        boundsWorld,
        strokeWidthWorld: Number(widthWorld.toFixed(3)),
        strokeWidthScreen: Number(widthScreen.toFixed(3)),
        worldToScreen: Number(worldToScreen.toFixed(4)),
      });
    } catch {}
  };
  try {
    panel.__debugStickerDrawArea = logStickerDrawAreaDebug;
    panel.__debugStickerSizeMetrics = logStickerSizeMetrics;
    if (window.__MT_DEBUG_STICKER_DRAW_AREA) {
      requestAnimationFrame(() => logStickerDrawAreaDebug('init'));
      setTimeout(() => logStickerDrawAreaDebug('post-timeout'), 120);
    }
    if (window.__MT_DEBUG_ART_SIZE) {
      requestAnimationFrame(() => logStickerSizeMetrics('init'));
      setTimeout(() => logStickerSizeMetrics('post-timeout'), 120);
    }
  } catch {}

  let boardDrawPointerId = null;
  let boardDrawSlot = null;
  let boardDrawMoved = false;
  let boardDrawPoints = [];
  let shapePlacePointerId = null;
  let shapePlaceSlot = null;
  let shapePlaceShape = null;

  const beginBoardDraw = (ev) => {
    if (panel.dataset.controlsVisible !== '1') return;
    if (selectedColorSlot == null) return;
    if (ev.button != null && ev.button !== 0) return;
    const eventTarget = ev?.target;
    if (eventTarget?.closest?.('.art-sticker-handle-btn')) return;
    const slot = normalizeSlot(selectedColorSlot);
    if (!activeSlots.has(slot)) return;
    if (!isClientPointInsideDrawArea(ev.clientX, ev.clientY)) return;
    const pt = clientToPanelPoint(ev.clientX, ev.clientY);
    if (!pt) return;
    const shapeKind = shapeKindForFx(currentFxId);
    if (shapeKind) {
      ev.preventDefault();
      ev.stopPropagation();
      const placed = placeShapeAtSlot(slot, pt.x, pt.y, shapeKind);
      shapePlacePointerId = ev.pointerId;
      shapePlaceSlot = slot;
      shapePlaceShape = placed || null;
      setStickerShapeDragging(true);
      setStickerTrashArmed(isClientPointInsideStickerTrash(ev.clientX, ev.clientY));
      return;
    }
    ev.preventDefault();
    ev.stopPropagation();
    boardDrawPointerId = ev.pointerId;
    boardDrawSlot = slot;
    boardDrawMoved = false;
    boardDrawPoints = [];
    appendStrokePoint(boardDrawPoints, pt.x, pt.y, 0);
    appendStrokePoint(boardDrawPoints, pt.x, pt.y, 0);
    drawAreaEl.classList.add('is-dragging');
    syncDrawPreview(slot, boardDrawPoints, true);
  };

  const moveBoardDraw = (ev) => {
    if (shapePlacePointerId != null && shapePlaceShape) {
      if (ev.pointerId !== shapePlacePointerId) return;
      const pt = clientToPanelPoint(ev.clientX, ev.clientY);
      if (!pt) return;
      ev.preventDefault();
      ev.stopPropagation();
      shapePlaceShape.x = clampX(pt.x);
      shapePlaceShape.y = clampY(pt.y);
      renderSlot(shapePlaceSlot);
      syncShapeHandle();
      setStickerTrashArmed(isClientPointInsideStickerTrash(ev.clientX, ev.clientY));
      markSceneDirtySafe();
      return;
    }
    if (boardDrawPointerId == null || boardDrawSlot == null) return;
    if (ev.pointerId !== boardDrawPointerId) return;
    const pt = clientToPanelPoint(ev.clientX, ev.clientY);
    if (!pt) return;
    ev.preventDefault();
    ev.stopPropagation();
    if (appendStrokePoint(boardDrawPoints, pt.x, pt.y, 1.5)) boardDrawMoved = true;
    syncDrawPreview(boardDrawSlot, boardDrawPoints, true);
  };

  const endBoardDraw = (ev) => {
    if (shapePlacePointerId != null && shapePlaceShape) {
      if (ev.pointerId !== shapePlacePointerId) return;
      ev.preventDefault();
      ev.stopPropagation();
      const dropOnTrash = isClientPointInsideStickerTrash(ev.clientX, ev.clientY);
      const slot = shapePlaceSlot;
      const shape = shapePlaceShape;
      shapePlacePointerId = null;
      shapePlaceSlot = null;
      shapePlaceShape = null;
      if (dropOnTrash && slot != null) {
        const list = Array.isArray(slotShapes[slot]) ? slotShapes[slot] : [];
        const idx = list.indexOf(shape);
        if (idx >= 0) list.splice(idx, 1);
      }
      setStickerShapeDragging(false);
      renderSlot(slot);
      fitDragAreaToDrawings();
      syncDragArea();
      syncShapeHandle();
      markSceneDirtySafe();
      return;
    }
    if (boardDrawPointerId == null || boardDrawSlot == null) return;
    if (ev.pointerId !== boardDrawPointerId) return;
    ev.preventDefault();
    ev.stopPropagation();
    const slot = boardDrawSlot;
    boardDrawPointerId = null;
    boardDrawSlot = null;
    drawAreaEl.classList.remove('is-dragging');
    syncDrawPreview(slot, null, false);
    const release = clientToPanelPoint(ev.clientX, ev.clientY);
    if (release) appendStrokePoint(boardDrawPoints, release.x, release.y, 1.5);
    if (boardDrawMoved && boardDrawPoints.length >= 2) {
      drawingState.addSlotStroke(slot, boardDrawPoints);
      const styleList = Array.isArray(slotStrokeStyles[slot]) ? slotStrokeStyles[slot] : (slotStrokeStyles[slot] = []);
      styleList.push({
        color: String(selectedPaintColor || palette[slot] || '#7bf6ff'),
        width: getPlacementStrokeWidth(),
      });
      renderSlot(slot);
      fitDragAreaToDrawings();
      syncDragArea();
      syncAllShapeHandles();
      markSceneDirtySafe();
    }
    boardDrawPoints = [];
    boardDrawMoved = false;
    refreshCustomizeUi();
  };

  panel.addEventListener('pointerdown', beginBoardDraw, true);
  drawAreaEl.addEventListener('pointerdown', beginBoardDraw, true);
  document.addEventListener('pointermove', moveBoardDraw, true);
  document.addEventListener('pointerup', endBoardDraw, true);
  document.addEventListener('pointercancel', endBoardDraw, true);

  panel.onArtRandomMusic = () => {
    activateAllSlots();
    if (selectedColorSlot == null) {
      const first = Array.from(activeSlots.values()).map((s) => normalizeSlot(s)).sort((a, b) => a - b)[0];
      if (Number.isFinite(first)) selectedColorSlot = first;
    }
    fitDragAreaToDrawings();
    syncDragArea();
    syncAllShapeHandles();
    try { refreshCustomizeUi(); } catch {}
    try { if (window.__MT_DEBUG_STICKER_DRAW_AREA) requestAnimationFrame(() => logStickerDrawAreaDebug('random-music')); } catch {}
    try { if (window.__MT_DEBUG_ART_SIZE) requestAnimationFrame(() => logStickerSizeMetrics('random-music')); } catch {}
    markSceneDirtySafe();
  };

  const randomStroke = () => {
    const area = {
      x: AREA_MIN_X,
      y: AREA_MIN_Y,
      w: TOTAL_LIMIT_W,
      h: TOTAL_LIMIT_H,
    };
    const margin = 26;
    const x0 = area.x + margin;
    const y0 = area.y + margin;
    const x1 = area.x + area.w - margin;
    const y1 = area.y + area.h - margin;
    const rand = (a, b) => a + Math.random() * Math.max(1, b - a);
    const edgeBandX = Math.max(24, area.w * 0.12);
    const edgeBandY = Math.max(24, area.h * 0.12);
    const edges = ['left', 'right', 'top', 'bottom'];
    const opposite = { left: 'right', right: 'left', top: 'bottom', bottom: 'top' };
    const edgeA = edges[Math.floor(Math.random() * edges.length)];
    const edgeB = opposite[edgeA];
    const pickEdgePoint = (edge) => {
      if (edge === 'left') return { x: rand(x0, x0 + edgeBandX), y: rand(y0, y1) };
      if (edge === 'right') return { x: rand(x1 - edgeBandX, x1), y: rand(y0, y1) };
      if (edge === 'top') return { x: rand(x0, x1), y: rand(y0, y0 + edgeBandY) };
      return { x: rand(x0, x1), y: rand(y1 - edgeBandY, y1) };
    };

    const a = pickEdgePoint(edgeA);
    const b = pickEdgePoint(edgeB);
    const sx = a.x;
    const sy = a.y;
    const tx = b.x;
    const ty = b.y;
    const len = Math.max(1, Math.hypot(tx - sx, ty - sy));
    const dirX = (tx - sx) / len;
    const dirY = (ty - sy) / len;
    const normalX = -dirY;
    const normalY = dirX;
    const turns = 0.8 + Math.random() * 1.4;
    const phaseA = Math.random() * Math.PI * 2;
    const phaseB = Math.random() * Math.PI * 2;
    const bend = Math.min(190, Math.max(34, len * (0.15 + Math.random() * 0.24)));
    const pointSpacing = 32 + Math.random() * 18;
    const steps = Math.max(8, Math.min(28, Math.round(len / pointSpacing)));

    const points = [{ x: sx, y: sy }];
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const baseX = sx + (tx - sx) * t;
      const baseY = sy + (ty - sy) * t;
      const envelope = Math.sin(Math.PI * t);
      const waveA = Math.sin((t * Math.PI * 2 * turns) + phaseA) * bend * envelope;
      const waveB = Math.sin((t * Math.PI * 2 * (turns * 0.5)) + phaseB) * bend * 0.38 * envelope;
      const wave = waveA + waveB;
      points.push({
        x: clampX(baseX + normalX * wave),
        y: clampY(baseY + normalY * wave),
      });
    }
    points.push({ x: tx, y: ty });
    return points;
  };

  const randomizeStickerArt = ({ ensureActive = false } = {}) => {
    if (ensureActive && !activeSlots.size) activateAllSlots();
    if (!activeSlots.size) return false;
    if (isShapeFx(currentFxId)) {
      const kind = shapeKindForFx(currentFxId);
      for (const slot of activeSlots) {
        const count = 1 + Math.floor(Math.random() * 3);
        slotShapes[slot] = [];
        slotStrokeStyles[slot] = [];
        drawingState.setSlotStrokes(slot, []);
        for (let i = 0; i < count; i++) {
          const pts = randomStroke();
          if (!pts.length) continue;
          const p = pts[Math.floor(Math.random() * pts.length)] || pts[0];
          placeShapeAtSlot(slot, Number(p?.x) || AREA_MIN_X, Number(p?.y) || AREA_MIN_Y, kind);
        }
      }
    } else {
      for (const slot of activeSlots) {
        const count = 1 + Math.floor(Math.random() * 3);
        const strokes = [];
        const styles = [];
        slotShapes[slot] = [];
        for (let i = 0; i < count; i++) {
          strokes.push(randomStroke());
          styles.push({
            color: palette[slot],
            width: getPlacementStrokeWidth(),
          });
        }
        slotStrokeStyles[slot] = styles;
        drawingState.setSlotStrokes(slot, strokes);
      }
    }
    renderAll();
    fitDragAreaToDrawings();
    refreshCustomizeUi();
    syncDragArea();
    syncAllShapeHandles();
    try { if (window.__MT_DEBUG_STICKER_DRAW_AREA) requestAnimationFrame(() => logStickerDrawAreaDebug('random-all')); } catch {}
    try { if (window.__MT_DEBUG_ART_SIZE) requestAnimationFrame(() => logStickerSizeMetrics('random-all')); } catch {}
    markSceneDirtySafe();
    return true;
  };

  randomArtBtn.addEventListener('pointerdown', (ev) => {
    if (ev.button != null && ev.button !== 0) return;
    ev.preventDefault();
    ev.stopPropagation();
    randomizeStickerArt({ ensureActive: false });
  });

  panel.onArtRandomAll = () => {
    randomizeStickerArt({ ensureActive: true });
  };

  panel.onArtClear = () => {
    for (let i = 0; i < ART_SLOT_COUNT; i++) setSlotInactive(i);
    selectedColorSlot = null;
    pickerWrap.hidden = true;
    pickerTitle.hidden = true;
    drawingState.clearAll();
    for (let i = 0; i < ART_SLOT_COUNT; i++) {
      slotShapes[i] = [];
      slotStrokeStyles[i] = [];
    }
    renderAll();
    fitDragAreaToDrawings();
    syncDragArea();
    syncAllShapeHandles();
    try { refreshCustomizeUi(); } catch {}
    markSceneDirtySafe();
    return true;
  };

  panel.getArtToyPersistState = () => ({
    version: 1,
    type: ART_TYPES.STICKER,
    activeSlots: Array.from(activeSlots.values()).map((s) => normalizeSlot(s)),
    palette: palette.slice(0, ART_SLOT_COUNT),
    lineThickness: Number(stickerStrokeMultiplier) || 1,
    strokesBySlot: drawingState.exportState().strokesBySlot,
    strokeStylesBySlot: slotStrokeStyles.map((list) => (Array.isArray(list)
      ? list.map((s) => ({
        color: String(s?.color || '#7bf6ff'),
        width: Math.max(1.2, Number(s?.width) || getPlacementStrokeWidth()),
      }))
      : [])),
    shapesBySlot: slotShapes.map((list) => (Array.isArray(list)
      ? list.map((s) => ({
        kind: String(s?.kind || ''),
        x: Number(s?.x) || 0,
        y: Number(s?.y) || 0,
        size: Number(s?.size) || 52,
        color: String(s?.color || '#7bf6ff'),
        strokeWidth: Math.max(1.2, Number(s?.strokeWidth) || getPlacementStrokeWidth()),
        rot: Number(s?.rot) || 0,
      }))
      : [])),
    fx: clampStickerFxId(currentFxId),
    selectedColorSlot: selectedColorSlot == null ? null : normalizeSlot(selectedColorSlot),
    selectedPaintIndex: selectedPaintIndex,
    selectedPaintColor: String(selectedPaintColor || '#7bf6ff'),
    flipbookMode: !!stickerFlipbookMode,
    controlsVisible: panel.dataset.controlsVisible === '1',
  });

  panel.applyArtToyPersistState = (state = null) => {
    if (!state || typeof state !== 'object') return false;
    const nextActive = Array.isArray(state.activeSlots) ? state.activeSlots : [];
    activeSlots.clear();
    if (!nextActive.length) {
      for (let i = 0; i < ART_SLOT_COUNT; i++) activeSlots.add(i);
    } else {
      for (const s of nextActive) activeSlots.add(normalizeSlot(s));
    }
    syncActiveDataset();
    if (Array.isArray(state.palette)) {
      for (let i = 0; i < Math.min(ART_SLOT_COUNT, state.palette.length); i++) {
        const c = String(state.palette[i] || '').trim();
        if (/^#([0-9a-f]{6})$/i.test(c)) palette[i] = c;
      }
    }
    if (state.lineThickness != null) {
      const n = Number(state.lineThickness);
      if (Number.isFinite(n)) {
        stickerStrokeMultiplier = Math.max(0.2, n);
        try { thicknessControlApi?.setValue?.(stickerStrokeMultiplier); } catch {}
      }
    }
    drawingState.importState({ strokesBySlot: state.strokesBySlot });
    if (Array.isArray(state.strokeStylesBySlot)) {
      for (let i = 0; i < ART_SLOT_COUNT; i++) {
        const list = Array.isArray(state.strokeStylesBySlot[i]) ? state.strokeStylesBySlot[i] : [];
        slotStrokeStyles[i] = list.map((s) => ({
          color: String(s?.color || palette[i] || '#7bf6ff'),
          width: Math.max(1.2, Number(s?.width) || getPlacementStrokeWidth()),
        }));
      }
    } else {
      for (let i = 0; i < ART_SLOT_COUNT; i++) {
        const strokes = drawingState.getSlotStrokes(i);
        slotStrokeStyles[i] = Array.isArray(strokes)
          ? strokes.map(() => ({ color: palette[i], width: getPlacementStrokeWidth() }))
          : [];
      }
    }
    if (Array.isArray(state.shapesBySlot)) {
      for (let i = 0; i < ART_SLOT_COUNT; i++) {
        const list = Array.isArray(state.shapesBySlot[i]) ? state.shapesBySlot[i] : [];
        slotShapes[i] = list.map((s) => ({
          kind: String(s?.kind || ''),
          x: clampX(s?.x),
          y: clampY(s?.y),
          size: Math.max(12, Number(s?.size) || 52),
          color: String(s?.color || palette[i] || '#7bf6ff'),
          strokeWidth: Math.max(1.2, Number(s?.strokeWidth) || getPlacementStrokeWidth()),
          rot: Number(s?.rot) || 0,
        }));
      }
    } else {
      for (let i = 0; i < ART_SLOT_COUNT; i++) slotShapes[i] = [];
    }
    if (state.fx != null) setStickerFx(state.fx, { announce: false });
    selectedColorSlot = state.selectedColorSlot == null ? null : normalizeSlot(state.selectedColorSlot);
    if (state.selectedPaintIndex != null) {
      const n = Math.trunc(Number(state.selectedPaintIndex));
      if (Number.isFinite(n)) selectedPaintIndex = Math.max(0, Math.min(ART_SLOT_COUNT - 1, n));
    }
    if (state.selectedPaintColor != null) {
      const c = String(state.selectedPaintColor || '').trim();
      if (/^#([0-9a-f]{6})$/i.test(c)) {
        selectedPaintColor = c;
        palette[selectedPaintIndex] = c;
      }
    } else {
      selectedPaintColor = String(palette[selectedPaintIndex] || '#7bf6ff');
    }
    stickerFlipbookMode = !!state.flipbookMode;
    try { syncFlipbookBtn(); } catch {}
    renderAll();
    fitDragAreaToDrawings();
    if (typeof state.controlsVisible === 'boolean') setBaseArtToyControlsVisible(panel, state.controlsVisible);
    refreshCustomizeUi();
    syncDragArea();
    syncAllShapeHandles();
    return true;
  };

  renderAll();
  fitDragAreaToDrawings();
  syncActiveDataset();
  syncDragArea();
  syncAllShapeHandles();

  panel.onArtTrigger = (trigger = null) => {
    const slot = normalizeSlot(trigger?.slotIndex);
    setSlotActive(slot);
    if (stickerFlipbookMode) {
      try {
        if (document.querySelector('.toy-panel.toy-playing')) {
          selectedColorSlot = slot;
          renderAll();
          refreshCustomizeUi();
          syncAllShapeHandles();
        }
      } catch {}
    }
    try { pulseColorButtonHit(slot); } catch {}
    if (currentFxId !== 1) emitHit(slot);
    return true;
  };

  panel.flash = (meta = null) => {
    const slot = normalizeSlot(meta?.slotIndex);
    setSlotActive(slot);
    if (stickerFlipbookMode) {
      try {
        if (document.querySelector('.toy-panel.toy-playing')) {
          selectedColorSlot = slot;
          renderAll();
          refreshCustomizeUi();
          syncAllShapeHandles();
        }
      } catch {}
    }
    try { pulseColorButtonHit(slot); } catch {}
    if (currentFxId !== 1) emitHit(slot);
  };
}

function setupVisualForType(panel, type) {
  if (!panel) return;
  if (type === ART_TYPES.FIREWORKS) {
    setupFireworks(panel);
    return;
  }
  if (type === ART_TYPES.LASER_TRAILS) {
    setupLaserTrails(panel);
    return;
  }
  if (type === ART_TYPES.STICKER) {
    setupSticker(panel);
    return;
  }
  setupFlashCircle(panel);
}

export function getArtCatalog() {
  return [
    {
      type: ART_TYPES.FLASH_CIRCLE,
      name: 'Flash Circle',
      description: 'Placeholder art toy: a circle that can flash on internal note play.',
    },
    {
      type: ART_TYPES.FIREWORKS,
      name: 'Bursts',
      description: '8 mapped burst points: each note slot triggers a firework explosion.',
    },
    {
      type: ART_TYPES.LASER_TRAILS,
      name: 'Light Paths',
      description: '8 mapped emitters: each note slot fires a short wiggly laser path.',
    },
    {
      type: ART_TYPES.STICKER,
      name: 'Sticker',
      description: 'Draw multiple strokes per note color and flash that color layer on note play.',
    },
  ];
}

export function createArtToyAt(artType, opts = {}) {
  const type = String(artType || '');
  if (!type) return null;
  const panel = makePanelBase(type, opts);
  if (!panel) return null;

  setupVisualForType(panel, type);
  return panel;
}

try {
  window.ArtToyFactory = Object.assign(window.ArtToyFactory || {}, {
    getCatalog: getArtCatalog,
    create: createArtToyAt,
  });
} catch (err) {
  console.warn('[ArtToyFactory] global registration failed', err);
}
