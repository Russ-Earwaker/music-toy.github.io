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

const ART_TYPES = Object.freeze({
  FLASH_CIRCLE: 'flashCircle',
  FIREWORKS: 'fireworks',
  LASER_TRAILS: 'laserTrails',
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

  // Fireworks only: current effect preview + picker grid.
  if (panel?.dataset?.artToy === ART_TYPES.FIREWORKS) {
    const fxShell = document.createElement('div');
    fxShell.className = 'art-toy-fx-shell';
    fxShell.dataset.open = '0';
    fxShell.dataset.artToyId = panel.id;
    fxShell.style.order = '100';

    const fxCurrent = document.createElement('button');
    fxCurrent.type = 'button';
    fxCurrent.className = 'art-toy-fx-current';
    fxCurrent.setAttribute('aria-label', 'Choose firework effect');
    fxCurrent.setAttribute('aria-haspopup', 'true');
    fxCurrent.setAttribute('aria-expanded', 'false');
    fxCurrent.title = 'Current Effect';

    const fxStage = document.createElement('span');
    fxStage.className = 'art-toy-fx-stage art-toy-fx-stage-current';
    fxCurrent.appendChild(fxStage);
    fxShell.appendChild(fxCurrent);

    const fxGrid = document.createElement('div');
    fxGrid.className = 'art-toy-fx-grid';
    fxGrid.hidden = true;
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
    w: TOTAL_LIMIT_W * 0.5,
    h: TOTAL_LIMIT_H * 0.5,
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

    const setFxPickerOpen = (open) => {
      if (!fxShell || !fxGrid) return;
      const isOpen = !!open;
      fxShell.dataset.open = isOpen ? '1' : '0';
      if (fxCurrentBtn) fxCurrentBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      fxGrid.hidden = !isOpen;
    };

    const fxById = new Map(FIREWORK_FX.map((fx) => [fx.id, fx]));
    syncFxUi = () => {
      const fxId = clampFxId(panel?.dataset?.fireworkFx);
      const fxName = fxById.get(fxId)?.name || 'Effect';
      if (fxCurrentBtn) {
        fxCurrentBtn.title = `Effect: ${fxName}`;
        fxCurrentBtn.setAttribute('aria-label', `Current firework effect: ${fxName}`);
      }
      if (fxCurrentStage) fxCurrentStage.dataset.fxId = String(fxId);
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
          setFxPickerOpen(false);
        });
      }
    }

    if (fxCurrentBtn) {
      fxCurrentBtn.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        setFxPickerOpen(fxShell?.dataset?.open !== '1');
      });
    }

    if (fxCurrentStage) {
      addPreviewLoop(fxCurrentStage, () => clampFxId(panel?.dataset?.fireworkFx));
    }

    const onDocPointerDownClosePicker = (ev) => {
      if (!panel.isConnected) {
        document.removeEventListener('pointerdown', onDocPointerDownClosePicker, true);
        return;
      }
      if (!fxShell || fxShell.dataset.open !== '1') return;
      const t = ev?.target;
      if (t && fxShell.contains(t)) return;
      setFxPickerOpen(false);
    };
    document.addEventListener('pointerdown', onDocPointerDownClosePicker, true);

    // Always start collapsed.
    setFxPickerOpen(false);
    syncFxUi();
  } catch {}
  const syncDragArea = () => {
    dragAreaEl.style.left = `${dragArea.x.toFixed(2)}px`;
    dragAreaEl.style.top = `${dragArea.y.toFixed(2)}px`;
    dragAreaEl.style.width = `${dragArea.w.toFixed(2)}px`;
    dragAreaEl.style.height = `${dragArea.h.toFixed(2)}px`;
  };
  const syncHandle = (slot) => {
    const handle = handleEls[slot];
    const a = anchors[slot];
    if (!handle || !a) return;
    handle.style.left = `${(a.x - HANDLE_SIZE_PX * 0.5).toFixed(2)}px`;
    handle.style.top = `${(a.y - HANDLE_SIZE_PX * 0.5).toFixed(2)}px`;
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
  };
  const setSlotInactive = (slot) => {
    const i = normalizeSlot(slot);
    activeSlots.delete(i);
    const handle = handleEls[i];
    if (handle) handle.classList.remove('is-active-firework');
    const glow = activeGlowEls[i];
    if (glow) glow.classList.remove('is-active-firework');
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
    if (core) core.style.setProperty('--c-btn-icon-url', "url('./assets/UI/T_ButtonHandle.png')");

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
      dragActive = true;
      dragPointerId = ev.pointerId;
      startClientX = ev.clientX;
      startClientY = ev.clientY;
      startX = anchors[i].x;
      startY = anchors[i].y;
      moved = false;
      dragAreaEl.classList.add('is-dragging');
      try { handleBtn.setPointerCapture(ev.pointerId); } catch {}
    });

    handleBtn.addEventListener('pointermove', (ev) => {
      if (!dragActive) return;
      if (dragPointerId != null && ev.pointerId !== dragPointerId) return;
      ev.preventDefault();
      ev.stopPropagation();
      const rect = layer.getBoundingClientRect();
      if (!rect || rect.width < 1 || rect.height < 1) return;
      const dx = ((ev.clientX - startClientX) / rect.width) * PANEL_PX;
      const dy = ((ev.clientY - startClientY) / rect.height) * PANEL_PX;
      const nextX = clampAnchorX(startX + dx);
      const nextY = clampAnchorY(startY + dy);

      anchors[i].x = nextX;
      anchors[i].y = nextY;
      moved = moved || Math.abs(nextX - startX) > 0.0001 || Math.abs(nextY - startY) > 0.0001;
      fitDragAreaToAnchors();
      syncHandle(i);
      syncActiveGlow(i);
    });

    const endDrag = (ev) => {
      if (!dragActive) return;
      if (dragPointerId != null && ev.pointerId !== dragPointerId) return;
      ev.preventDefault();
      ev.stopPropagation();
      dragActive = false;
      dragPointerId = null;
      dragAreaEl.classList.remove('is-dragging');
      try { handleBtn.releasePointerCapture(ev.pointerId); } catch {}
      if (moved) markSceneDirtySafe();
    };

    handleBtn.addEventListener('pointerup', endDrag);
    handleBtn.addEventListener('pointercancel', endDrag);

    handlesLayer.appendChild(handleBtn);
    handleEls.push(handleBtn);
    syncHandle(i);
  }

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

  panel.getArtToyPersistState = () => {
    const active = Array.from(activeSlots.values())
      .map((s) => normalizeSlot(s))
      .sort((a, b) => a - b);
    return {
      type: ART_TYPES.FIREWORKS,
      anchors: anchors.map((a) => ({ x: Number(a?.x) || 0, y: Number(a?.y) || 0 })),
      activeSlots: active,
      fx: clampFxId(panel?.dataset?.fireworkFx),
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
    const amp = Number.isFinite(vel) ? Math.max(0.4, Math.min(1.3, vel)) : 0.9;

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
      spawnCoreFadeOut(0.54, 360);
      return;
    }

    if (fxId === 4) {
      // Wave Ring (clean + cheap).
      const RING_SIZE_SCALE = 2 / 3;
      spawnRing({
        life: 760 + Math.random() * 220,
        scale0: 0.25 * FIREWORK_EFFECT_SCALE * RING_SIZE_SCALE,
        scale1: (2.5 + Math.random() * 0.8) * FIREWORK_EFFECT_SCALE * RING_SIZE_SCALE,
        thickness: 3,
        burstIn: 0.24,
        lingerUntil: 0.9,
        lingerOpacity: 0.34
      });
      spawnRing({
        life: 860 + Math.random() * 260,
        scale0: 0.16 * FIREWORK_EFFECT_SCALE * RING_SIZE_SCALE,
        scale1: (1.9 + Math.random() * 0.7) * FIREWORK_EFFECT_SCALE * RING_SIZE_SCALE,
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
    spawnBurst(slot, trigger?.velocity ?? null);
    return true;
  };

  panel.flash = (meta = null) => {
    const slot = normalizeSlot(meta?.slotIndex);
    setSlotActive(slot);
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
  const bg = document.createElement('div');
  bg.className = 'art-toy-circle art-toy-circle-lasers';
  panel.appendChild(bg);

  const svgNS = 'http://www.w3.org/2000/svg';
  const layer = document.createElementNS(svgNS, 'svg');
  layer.setAttribute('class', 'art-laser-layer');
  layer.setAttribute('viewBox', '0 0 220 220');
  layer.setAttribute('preserveAspectRatio', 'none');
  panel.appendChild(layer);

  const emitters = [
    { x: 20, y: 28, a: 0.42 },
    { x: 110, y: 16, a: 1.02 },
    { x: 200, y: 28, a: 1.74 },
    { x: 206, y: 110, a: 2.65 },
    { x: 200, y: 192, a: 3.52 },
    { x: 110, y: 204, a: 4.18 },
    { x: 20, y: 192, a: 5.08 },
    { x: 14, y: 110, a: 5.85 },
  ];
  const palette = ['#7bf6ff', '#86efac', '#fde047', '#f9a8d4', '#c4b5fd', '#67e8f9', '#fca5a5', '#a7f3d0'];
  const active = [];
  const ACTIVE_CAP = 28;

  function spawnLaser(slotIndex, velocity = null) {
    const slot = normalizeSlot(slotIndex);
    const em = emitters[slot];
    const tone = palette[slot % palette.length];
    const vel = Number(velocity);
    const amp = Number.isFinite(vel) ? Math.max(0.5, Math.min(1.25, vel)) : 0.95;
    const maxLen = 82 * amp;
    const segmentLen = 10;
    const wobble = 9 + Math.random() * 7;
    const points = [{ x: em.x, y: em.y }];
    let dist = 0;
    let angle = em.a + (Math.random() - 0.5) * 0.36;
    while (dist < maxLen) {
      dist += segmentLen;
      const t = dist / Math.max(1, maxLen);
      const w = Math.sin(t * Math.PI * (2.4 + Math.random() * 0.7)) * wobble * (1 - t * 0.68);
      angle += (Math.random() - 0.5) * 0.28;
      const prev = points[points.length - 1];
      const nx = prev.x + Math.cos(angle) * segmentLen - Math.sin(angle) * (w * 0.06);
      const ny = prev.y + Math.sin(angle) * segmentLen + Math.cos(angle) * (w * 0.06);
      points.push({
        x: Math.max(6, Math.min(214, nx)),
        y: Math.max(6, Math.min(214, ny)),
      });
    }

    const path = document.createElementNS(svgNS, 'path');
    path.setAttribute('class', 'art-laser-path');
    path.setAttribute('d', buildLaserPath(points));
    path.setAttribute('stroke', tone);
    path.setAttribute('stroke-width', String((1.7 + Math.random() * 1.4) * amp));
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    layer.appendChild(path);
    active.push(path);

    while (active.length > ACTIVE_CAP) {
      const old = active.shift();
      try { old?.remove(); } catch {}
    }

    let total = 120;
    try { total = Math.max(12, path.getTotalLength()); } catch {}
    path.style.strokeDasharray = `${total.toFixed(2)}`;
    path.style.strokeDashoffset = `${total.toFixed(2)}`;

    const life = 440 + Math.random() * 210;
    try {
      const anim = path.animate(
        [
          { strokeDashoffset: `${total.toFixed(2)}`, opacity: 0.0, filter: 'drop-shadow(0 0 0px currentColor)' },
          { strokeDashoffset: `${(total * 0.18).toFixed(2)}`, opacity: 0.98, filter: 'drop-shadow(0 0 5px currentColor)', offset: 0.28 },
          { strokeDashoffset: `${(-total * 0.42).toFixed(2)}`, opacity: 0.0, filter: 'drop-shadow(0 0 1px currentColor)' },
        ],
        { duration: life, easing: 'cubic-bezier(0.22, 0.75, 0.18, 1)' }
      );
      const cleanup = () => {
        const idx = active.indexOf(path);
        if (idx >= 0) active.splice(idx, 1);
        try { path.remove(); } catch {}
      };
      anim.addEventListener('finish', cleanup, { once: true });
      anim.addEventListener('cancel', cleanup, { once: true });
    } catch {
      setTimeout(() => {
        const idx = active.indexOf(path);
        if (idx >= 0) active.splice(idx, 1);
        try { path.remove(); } catch {}
      }, life + 60);
    }
  }

  panel.onArtTrigger = (trigger = null) => {
    const slot = normalizeSlot(trigger?.slotIndex);
    spawnLaser(slot, trigger?.velocity ?? null);
    return true;
  };

  panel.flash = (meta = null) => {
    const slot = normalizeSlot(meta?.slotIndex);
    spawnLaser(slot, meta?.velocity ?? null);
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
      name: 'Fireworks',
      description: '8 mapped burst points: each note slot triggers a firework explosion.',
    },
    {
      type: ART_TYPES.LASER_TRAILS,
      name: 'Laser Trails',
      description: '8 mapped emitters: each note slot fires a short wiggly laser path.',
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
