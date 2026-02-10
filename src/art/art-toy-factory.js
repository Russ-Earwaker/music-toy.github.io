// src/art/art-toy-factory.js
// Minimal first-pass Art Toy factory.

import {
  createBaseArtToyPanel,
  ensureBaseArtToyUI,
  getBaseArtToyControlsHost,
} from './base-art-toy.js';

const ART_TYPES = Object.freeze({
  FLASH_CIRCLE: 'flashCircle',
});

// Match the custom circular button structure used by music toys / toy spawner.
const BUTTON_ICON_HTML = '<div class="c-btn-outer"></div><div class="c-btn-glow"></div><div class="c-btn-core"></div>';

export function getArtCatalog() {
  return [
    {
      type: ART_TYPES.FLASH_CIRCLE,
      name: 'Flash Circle',
      description: 'Placeholder art toy: a circle that can flash on internal note play.',
    },
  ];
}

export function createArtToyAt(artType, opts = {}) {
  const type = String(artType || '');
  if (!type) return null;

  const { containerEl, artOwnerId } = opts;
  let { centerX, centerY } = opts;
  // artOwnerId is accepted for compatibility with ToySpawner internal spawning,
  // but art toys currently live on the active board/world.
  void artOwnerId;

  const board = containerEl || document.getElementById('board');
  if (!board) return null;

  // First pass: fixed size.
  const size = 220;

  // If no spawn point provided, place near the board center-ish.
  if (!Number.isFinite(centerX) || !Number.isFinite(centerY)) {
    const rect = board.getBoundingClientRect();
    centerX = rect.width * 0.5;
    centerY = rect.height * 0.5;
  }

  // Avoid spawning right on top of board anchors / glows at the board center.
  // (This also helps ensure the handle receives pointerdown.)
  const rect = board.getBoundingClientRect();
  const jitter = () => (Math.random() - 0.5) * 18;
  const spawnOffsetX = size * 0.65;
  const spawnOffsetY = -size * 0.18;

  const rawLeft = centerX - size * 0.5 + spawnOffsetX + jitter();
  const rawTop = centerY - size * 0.5 + spawnOffsetY + jitter();

  // Keep the toy fully visible.
  const maxLeft = Math.max(0, rect.width - size);
  const maxTop = Math.max(0, rect.height - size);
  const left = Math.min(maxLeft, Math.max(0, rawLeft));
  const top = Math.min(maxTop, Math.max(0, rawTop));

  const panel = createBaseArtToyPanel({
    kind: type,
    size,
    left,
    top,
    idPrefix: 'art',
  });
  ensureBaseArtToyUI(panel, { artToyId: panel.id });

  const circle = document.createElement('div');
  circle.className = 'art-toy-circle';
  panel.appendChild(circle);

  // Controls (hidden until handle tapped)
  const controlsHost = getBaseArtToyControlsHost(panel);
  if (controlsHost) {
    const enterBtn = document.createElement('button');
    enterBtn.className = 'art-toy-btn art-toy-enter-btn c-btn';
    enterBtn.type = 'button';
    enterBtn.setAttribute('aria-label', 'Enter this Art Toy');
    enterBtn.title = 'Enter';
    enterBtn.innerHTML = BUTTON_ICON_HTML;
    const enterCore = enterBtn.querySelector('.c-btn-core');
    if (enterCore) enterCore.style.setProperty('--c-btn-icon-url', "url('./assets/UI/T_ButtonEnter.png')");
    enterBtn.style.setProperty('--c-btn-size', '62px');
    // Keep the existing action string so main.js continues to handle entry.
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
  }

  board.appendChild(panel);

  try {
    if (window.__MT_DEBUG_ART_SPAWN) {
      // eslint-disable-next-line no-console
      console.log('[ArtToyFactory] create', type, {
        id: panel.id,
        left,
        top,
        container: board.id || board.className || board.tagName,
      });
    }
  } catch (err) {
    // ignore
  }

  // First pass: placeholder flash API (we'll wire note events later).
  panel.flash = () => {
    panel.classList.remove('flash');
    // Force reflow so animation can replay.
    void panel.offsetWidth;
    panel.classList.add('flash');
  };

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
