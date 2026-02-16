// src/art/art-hue-sat-picker.js
// Reusable square hue/saturation picker (fixed lightness).

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

function hexToHsl(hex) {
  const raw = String(hex || '').trim();
  const m = raw.match(/^#?([0-9a-f]{6})$/i);
  if (!m) return { h: 0, s: 1, l: 0.5 };
  const v = m[1];
  const r = parseInt(v.slice(0, 2), 16) / 255;
  const g = parseInt(v.slice(2, 4), 16) / 255;
  const b = parseInt(v.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const l = (max + min) * 0.5;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { h, s, l };
}

export function createArtHueSatPicker({
  size = 150,
  lightness = 0.5,
  color = '#7bf6ff',
  onChange = null,
  onCommit = null,
} = {}) {
  const root = document.createElement('div');
  root.className = 'art-hs-picker';

  const canvas = document.createElement('canvas');
  canvas.className = 'art-hs-picker-canvas';
  canvas.width = Math.max(64, Math.round(Number(size) || 150));
  canvas.height = Math.max(64, Math.round(Number(size) || 150));
  root.appendChild(canvas);

  const marker = document.createElement('div');
  marker.className = 'art-hs-picker-marker';
  root.appendChild(marker);

  const state = {
    h: 0,
    s: 1,
    l: clamp01(lightness || 0.5),
    drag: false,
    pid: null,
  };

  const ctx = canvas.getContext('2d');
  const drawGradient = () => {
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    const img = ctx.createImageData(w, h);
    const data = img.data;
    for (let y = 0; y < h; y++) {
      const sat = 1 - (y / Math.max(1, h - 1));
      for (let x = 0; x < w; x++) {
        const hue = (x / Math.max(1, w - 1)) * 360;
        const hex = hslToHex(hue, sat, state.l);
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        const i = (y * w + x) * 4;
        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
        data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  };

  const syncMarker = () => {
    const w = canvas.width;
    const h = canvas.height;
    const x = (state.h / 360) * (w - 1);
    const y = (1 - state.s) * (h - 1);
    marker.style.left = `${x.toFixed(2)}px`;
    marker.style.top = `${y.toFixed(2)}px`;
  };

  const emitChange = () => {
    const hex = hslToHex(state.h, state.s, state.l);
    try { onChange?.({ hex, h: state.h, s: state.s, l: state.l }); } catch {}
  };

  const setFromClient = (clientX, clientY, { commit = false } = {}) => {
    const rect = canvas.getBoundingClientRect();
    if (!rect || rect.width < 1 || rect.height < 1) return;
    const x = Math.max(0, Math.min(rect.width - 1, clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height - 1, clientY - rect.top));
    state.h = (x / Math.max(1, rect.width - 1)) * 360;
    state.s = 1 - (y / Math.max(1, rect.height - 1));
    syncMarker();
    emitChange();
    if (commit) {
      const hex = hslToHex(state.h, state.s, state.l);
      try { onCommit?.({ hex, h: state.h, s: state.s, l: state.l }); } catch {}
    }
  };

  canvas.addEventListener('pointerdown', (ev) => {
    if (ev.button != null && ev.button !== 0) return;
    ev.preventDefault();
    state.drag = true;
    state.pid = ev.pointerId;
    try { canvas.setPointerCapture(ev.pointerId); } catch {}
    setFromClient(ev.clientX, ev.clientY);
  });
  canvas.addEventListener('pointermove', (ev) => {
    if (!state.drag) return;
    if (state.pid != null && ev.pointerId !== state.pid) return;
    ev.preventDefault();
    setFromClient(ev.clientX, ev.clientY);
  });
  const endDrag = (ev) => {
    if (!state.drag) return;
    if (state.pid != null && ev.pointerId !== state.pid) return;
    ev.preventDefault();
    state.drag = false;
    state.pid = null;
    try { canvas.releasePointerCapture(ev.pointerId); } catch {}
    setFromClient(ev.clientX, ev.clientY, { commit: true });
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  const setColor = (nextHex) => {
    const hsl = hexToHsl(nextHex);
    state.h = hsl.h;
    state.s = hsl.s;
    state.l = clamp01(lightness || hsl.l || 0.5);
    syncMarker();
  };

  drawGradient();
  setColor(color);

  return {
    root,
    canvas,
    setColor,
    getColor() {
      return hslToHex(state.h, state.s, state.l);
    },
  };
}

