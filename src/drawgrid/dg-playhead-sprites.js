// src/drawgrid/dg-playhead-sprites.js
// Playhead sprite caching + optional idle cache warming.
// Kept self-contained; caller injects tiny environment probes to avoid coupling.

function quantizeHue(hue, step = 6) {
  const h = Number.isFinite(hue) ? hue : 0;
  const s = Number.isFinite(step) && step > 0 ? step : 1;
  return Math.round(h / s) * s;
}

const PLAYHEAD_HUES_LINE1 = [200, 245, 290];
const PLAYHEAD_HUES_LINE2 = [20, 355, 330];

function __cacheSprite(map, maxSize, key, build) {
  let sprite = map.get(key);
  if (sprite) return sprite;

  sprite = build();
  map.set(key, sprite);

  // Simple LRU-ish eviction (keep newest N by rebuilding insertion order)
  if (map.size > maxSize) {
    const entries = Array.from(map.entries());
    const toKeep = entries.slice(-maxSize);
    map.clear();
    for (const [k, v] of toKeep) map.set(k, v);
  }
  return sprite;
}

export function createDgPlayheadSprites({
  // Injected probes
  isGesturing = () => false,
  getVisibleCount = () => 0,
  getFps = () => 60,

  // Tuning (overrideable)
  cacheMaxSize = 192,
  warmingEnabled = true,
  idleFramesThreshold = 30,
  idleTimeBudgetMs = 2,
  commonSizes = [50, 100, 150, 200, 250, 300, 400, 500],
  commonHeights = [100, 150, 200, 250, 300, 400],
} = {}) {
  const bandCache = new Map();
  const lineCache = new Map();
  const compositeCache = new Map();

  let lastFrameTime = 0;
  let idleFrameCount = 0;

  function pickPlayheadHue(strokes) {
    const hasLine2 = Array.isArray(strokes) && strokes.some(s => s && s.generatorId === 2);
    const pool = hasLine2 ? PLAYHEAD_HUES_LINE1.concat(PLAYHEAD_HUES_LINE2) : PLAYHEAD_HUES_LINE1;
    const idx = Math.floor(Math.random() * pool.length);
    return pool[idx] ?? PLAYHEAD_HUES_LINE1[0];
  }

  function getPlayheadBandSprite(width, height, hue) {
    const w = Math.max(1, Math.round(width || 0));
    const h = Math.max(1, Math.round(height || 0));
    const hueKey = quantizeHue(hue, 6);
    const key = `${w}x${h}|${hueKey}`;
    return __cacheSprite(bandCache, cacheMaxSize, key, () => {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      const midColor = `hsla(${(hueKey + 45)}, 100%, 70%, 0.25)`;
      const grad = ctx.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(0.5, midColor);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      return canvas;
    });
  }

  function getPlayheadLineSprite(height, hue) {
    const h = Math.max(1, Math.round(height || 0));
    const hueKey = quantizeHue(hue, 6);
    const key = `${h}|${hueKey}`;
    return __cacheSprite(lineCache, cacheMaxSize, key, () => {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, `hsl(${hueKey}, 100%, 70%)`);
      grad.addColorStop(0.5, `hsl(${(hueKey + 45) % 360}, 100%, 70%)`);
      grad.addColorStop(1, `hsl(${(hueKey + 90) % 360}, 100%, 68%)`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 1, h);
      return canvas;
    });
  }

  function getPlayheadCompositeSprite({
    gradientWidth,
    height,
    hue,
    trailLineCount,
    gap,
    mainLineW,
    trailW0,
    trailWStep,
  } = {}) {
    const w = Math.max(1, Math.round(gradientWidth || 0));
    const h = Math.max(1, Math.round(height || 0));
    const hueKey = quantizeHue(hue, 6);
    const key = `${w}x${h}|${hueKey}|t${trailLineCount}|g${gap}|m${mainLineW}|tw${trailW0}|ts${trailWStep}`;

    return __cacheSprite(compositeCache, cacheMaxSize, key, () => {
      const canvas = document.createElement('canvas');

      const leftPad = (trailLineCount > 0)
        ? (trailLineCount * gap + (trailW0 / 2) + 2)
        : 2;
      const rightPad = (w / 2) + 2;

      canvas.width = Math.max(1, Math.ceil(leftPad + rightPad));
      canvas.height = h;
      canvas.__dgOriginX = leftPad;

      const ctx = canvas.getContext('2d');

      const bandSprite = getPlayheadBandSprite(w, h, hueKey);
      if (bandSprite) {
        ctx.drawImage(bandSprite, leftPad - w / 2, 0, w, h);
      }

      const lineSprite = getPlayheadLineSprite(h, hueKey);
      if (lineSprite) {
        for (let i = 0; i < trailLineCount; i++) {
          const trailX = leftPad - (i + 1) * gap;
          const trailW = Math.max(1.0, trailW0 - i * trailWStep);
          ctx.globalAlpha = 0.6 - i * 0.18;
          ctx.drawImage(lineSprite, trailX - trailW / 2, 0, trailW, h);
        }
        ctx.globalAlpha = 1.0;
        ctx.drawImage(lineSprite, leftPad - mainLineW / 2, 0, mainLineW, h);
      }

      return canvas;
    });
  }

  function __isLowActivity() {
    try {
      if (warmingEnabled !== true) return false;
      if (isGesturing()) return false;

      const fps = Number.isFinite(getFps()) ? getFps() : 60;
      if (fps < 45) return false;

      const visibleCount = Number.isFinite(getVisibleCount()) ? getVisibleCount() : 0;
      if (visibleCount > 32) return false;

      return true;
    } catch {
      return false;
    }
  }

  function __warmCache() {
    if (!warmingEnabled) return;
    if (!__isLowActivity()) return;

    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const start = now;

    // Warm line sprites for common heights
    for (const height of commonHeights) {
      const t = ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - start;
      if (t >= idleTimeBudgetMs) break;
      for (const hue of PLAYHEAD_HUES_LINE1) getPlayheadLineSprite(height, hue);
    }

    // Warm band sprites for common sizes
    for (const width of commonSizes) {
      const t = ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - start;
      if (t >= idleTimeBudgetMs) break;
      for (const height of [100, 150, 200]) {
        for (const hue of PLAYHEAD_HUES_LINE1) getPlayheadBandSprite(width, height, hue);
      }
    }
  }

  // Call from the main animation loop
  function idleCallback() {
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const frameDelta = now - lastFrameTime;

    if (frameDelta > 32) idleFrameCount = 0;
    else idleFrameCount++;

    lastFrameTime = now;

    if (idleFrameCount >= idleFramesThreshold) {
      __warmCache();
    }
  }

  return {
    pickPlayheadHue,
    getPlayheadBandSprite,
    getPlayheadLineSprite,
    getPlayheadCompositeSprite,
    idleCallback,
  };
}
