// src/art/art-toy-factory.js
// Minimal first-pass Art Toy factory.

const ART_TYPES = Object.freeze({
  FLASH_CIRCLE: 'flashCircle',
});

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
  let { centerX, centerY, autoCenter } = opts;
  // artOwnerId is accepted for compatibility with ToySpawner internal spawning,
  // but art toys are currently intended to live on the main board.
  void artOwnerId;

  // Art toys normally live on the main board, but we accept an explicit container
  // so the spawner can pass it safely without crashing.
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

  const rawLeft = centerX - size * 0.5;
  const rawTop = centerY - size * 0.5;
  const left = autoCenter ? rawLeft : Math.max(0, rawLeft);
  const top = autoCenter ? rawTop : Math.max(0, rawTop);

  const panel = document.createElement('section');
  panel.className = 'art-toy-panel';
  panel.dataset.artToy = type;
  const idSuffix = Math.random().toString(36).slice(2, 8);
  panel.id = `art-${type}-${Date.now()}-${idSuffix}`;
  panel.style.position = 'absolute';
  panel.style.left = `${left}px`;
  panel.style.top = `${top}px`;
  panel.style.width = `${size}px`;
  panel.style.height = `${size}px`;

  const circle = document.createElement('div');
  circle.className = 'art-toy-circle';
  panel.appendChild(circle);

  // Enter internal-board UI.
  // First pass: a simple button that asks main.js to open internal mode.
  const musicBtn = document.createElement('button');
  musicBtn.className = 'art-toy-music-btn';
  musicBtn.type = 'button';
  musicBtn.textContent = 'Music';
  musicBtn.setAttribute('aria-label', 'Enter this Art Toy');
  musicBtn.dataset.action = 'artToy:music';
  musicBtn.dataset.artToyId = panel.id;
  panel.appendChild(musicBtn);

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
