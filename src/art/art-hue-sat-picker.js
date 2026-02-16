// src/art/art-hue-sat-picker.js
// Reusable square hue + white picker with a vertical darkness slider.

function clamp01(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function hslToHex(h, s, l = 0.5) {
  const hh = ((Number(h) % 360) + 360) % 360;
  const ss = clamp01(s);
  const ll = clamp01(l);
  const c = (1 - Math.abs(2 * ll - 1)) * ss;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = ll - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hh < 60) { r = c; g = x; b = 0; }
  else if (hh < 120) { r = x; g = c; b = 0; }
  else if (hh < 180) { r = 0; g = c; b = x; }
  else if (hh < 240) { r = 0; g = x; b = c; }
  else if (hh < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }
  const toHex = (v) => {
    const n = Math.round((v + m) * 255);
    const clamped = Math.max(0, Math.min(255, n));
    return clamped.toString(16).padStart(2, '0');
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hexToRgb(hex) {
  const raw = String(hex || '').trim();
  const m = raw.match(/^#?([0-9a-f]{6})$/i);
  if (!m) return { r: 0, g: 0, b: 0 };
  const v = m[1];
  return {
    r: parseInt(v.slice(0, 2), 16),
    g: parseInt(v.slice(2, 4), 16),
    b: parseInt(v.slice(4, 6), 16),
  };
}

function rgbToHex(r, g, b) {
  const toHex = (v) => Math.max(0, Math.min(255, Math.round(Number(v) || 0))).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hexToHsl(hex) {
  const { r, g, b } = hexToRgb(hex);
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const l = (max + min) * 0.5;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { h, s, l };
}

function mixRgb(a, b, t) {
  const tt = clamp01(t);
  return {
    r: a.r + (b.r - a.r) * tt,
    g: a.g + (b.g - a.g) * tt,
    b: a.b + (b.b - a.b) * tt,
  };
}

export function createArtHueSatPicker({
  size = 150,
  color = '#7bf6ff',
  onChange = null,
  onCommit = null,
} = {}) {
  const root = document.createElement('div');
  root.className = 'art-hs-picker';

  const surface = document.createElement('div');
  surface.className = 'art-hs-picker-surface';
  root.appendChild(surface);

  const canvas = document.createElement('canvas');
  canvas.className = 'art-hs-picker-canvas';
  canvas.width = Math.max(64, Math.round(Number(size) || 150));
  canvas.height = Math.max(64, Math.round(Number(size) || 150));
  surface.appendChild(canvas);

  const marker = document.createElement('div');
  marker.className = 'art-hs-picker-marker';
  surface.appendChild(marker);

  const darkSlider = document.createElement('input');
  darkSlider.type = 'range';
  darkSlider.min = '0';
  darkSlider.max = '1';
  darkSlider.step = '0.01';
  darkSlider.className = 'art-hs-brightness-slider';
  root.appendChild(darkSlider);

  const state = {
    h: 0,
    whiteMix: 0, // 0 = vivid hue, 1 = white
    darkness: 0, // 0 = base color, 1 = black
    drag: false,
    pid: null,
  };

  const ctx = canvas.getContext('2d');

  const getBaseColorHex = () => {
    const hueHex = hslToHex(state.h, 1, 0.5);
    const hueRgb = hexToRgb(hueHex);
    const mixed = mixRgb(hueRgb, { r: 255, g: 255, b: 255 }, state.whiteMix);
    return rgbToHex(mixed.r, mixed.g, mixed.b);
  };

  const getFinalColorHex = () => {
    const baseRgb = hexToRgb(getBaseColorHex());
    const final = mixRgb(baseRgb, { r: 0, g: 0, b: 0 }, state.darkness);
    return rgbToHex(final.r, final.g, final.b);
  };

  const syncDarkSliderGradient = () => {
    const top = getBaseColorHex();
    const grad = `linear-gradient(to top, #000000 0%, ${top} 100%)`;
    darkSlider.style.setProperty('--hs-dark-gradient', grad);
    darkSlider.style.background = grad;
  };

  const drawGradient = () => {
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;

    const hueGrad = ctx.createLinearGradient(0, 0, w, 0);
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      hueGrad.addColorStop(t, hslToHex(t * 360, 1, 0.5));
    }
    ctx.fillStyle = hueGrad;
    ctx.fillRect(0, 0, w, h);

    const whiteGrad = ctx.createLinearGradient(0, 0, 0, h);
    whiteGrad.addColorStop(0, 'rgba(255,255,255,0)');
    whiteGrad.addColorStop(1, 'rgba(255,255,255,1)');
    ctx.fillStyle = whiteGrad;
    ctx.fillRect(0, 0, w, h);
  };

  const syncMarker = () => {
    const w = canvas.width;
    const h = canvas.height;
    const x = (state.h / 360) * (w - 1);
    const y = state.whiteMix * (h - 1);
    marker.style.left = `${x.toFixed(2)}px`;
    marker.style.top = `${y.toFixed(2)}px`;
  };

  const emitChange = () => {
    const baseHex = getBaseColorHex();
    const hex = getFinalColorHex();
    try { onChange?.({ hex, baseHex, h: state.h, whiteMix: state.whiteMix, darkness: state.darkness }); } catch {}
  };

  const emitCommit = () => {
    const baseHex = getBaseColorHex();
    const hex = getFinalColorHex();
    try { onCommit?.({ hex, baseHex, h: state.h, whiteMix: state.whiteMix, darkness: state.darkness }); } catch {}
  };

  const setFromClient = (clientX, clientY, { commit = false } = {}) => {
    const rect = canvas.getBoundingClientRect();
    if (!rect || rect.width < 1 || rect.height < 1) return;
    const x = Math.max(0, Math.min(rect.width - 1, clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height - 1, clientY - rect.top));
    state.h = (x / Math.max(1, rect.width - 1)) * 360;
    state.whiteMix = y / Math.max(1, rect.height - 1);
    syncMarker();
    syncDarkSliderGradient();
    emitChange();
    if (commit) emitCommit();
  };

  canvas.addEventListener('pointerdown', (ev) => {
    if (ev.button != null && ev.button !== 0) return;
    ev.preventDefault();
    ev.stopPropagation();
    state.drag = true;
    state.pid = ev.pointerId;
    try { canvas.setPointerCapture(ev.pointerId); } catch {}
  });
  canvas.addEventListener('pointermove', (ev) => {
    if (!state.drag) return;
    if (state.pid != null && ev.pointerId !== state.pid) return;
    ev.preventDefault();
    ev.stopPropagation();
    setFromClient(ev.clientX, ev.clientY);
  });
  const endDrag = (ev) => {
    if (!state.drag) return;
    if (state.pid != null && ev.pointerId !== state.pid) return;
    ev.preventDefault();
    ev.stopPropagation();
    state.drag = false;
    state.pid = null;
    try { canvas.releasePointerCapture(ev.pointerId); } catch {}
    setFromClient(ev.clientX, ev.clientY, { commit: true });
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('click', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
  });

  darkSlider.addEventListener('pointerdown', (ev) => {
    ev.stopPropagation();
  });
  darkSlider.addEventListener('click', (ev) => {
    ev.stopPropagation();
  });
  darkSlider.addEventListener('input', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    // Map slider position to darkness so bottom corresponds to black.
    state.darkness = 1 - clamp01(darkSlider.value);
    emitChange();
  });
  darkSlider.addEventListener('change', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    state.darkness = 1 - clamp01(darkSlider.value);
    emitCommit();
  });

  const setColor = (nextHex) => {
    const hsl = hexToHsl(nextHex);
    state.h = hsl.h;
    state.whiteMix = Math.max(0, Math.min(1, 1 - hsl.s));
    state.darkness = 0;
    darkSlider.value = String(1 - state.darkness);
    syncMarker();
    syncDarkSliderGradient();
  };

  darkSlider.value = String(1 - state.darkness);
  drawGradient();
  setColor(color);

  return {
    root,
    canvas,
    setColor,
    getColor() {
      return getFinalColorHex();
    },
  };
}
