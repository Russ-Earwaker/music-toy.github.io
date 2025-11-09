// src/toyhelpers-sizing.js
// Helpers for mapping toy-local coordinates to world/screen space using the live board viewport transform.
import { getViewportTransform } from './board-viewport.js';

function toNumber(val) {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val === 'string' && val.trim().length) {
    const parsed = parseFloat(val);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function getDatasetNumber(panel, keys = []) {
  if (!panel?.dataset) return null;
  for (const key of keys) {
    const candidate = toNumber(panel.dataset[key]);
    if (candidate !== null) return candidate;
  }
  return null;
}

function normalizeScale(scale) {
  return (Number.isFinite(scale) && Math.abs(scale) > 1e-6) ? scale : 1;
}

function worldToScreenPoint(wx, wy, vp = getViewportTransform()) {
  const scale = normalizeScale(vp?.scale);
  const tx = Number(vp?.tx) || 0;
  const ty = Number(vp?.ty) || 0;
  return {
    x: wx * scale + tx,
    y: wy * scale + ty,
  };
}

function screenToWorldPoint(sx, sy, vp = getViewportTransform()) {
  const scale = normalizeScale(vp?.scale);
  const tx = Number(vp?.tx) || 0;
  const ty = Number(vp?.ty) || 0;
  return {
    x: (sx - tx) / scale,
    y: (sy - ty) / scale,
  };
}

export function getToyWorldAnchor(panel) {
  if (!panel) return { x: 0, y: 0 };
  const styleLeft = toNumber(panel.style?.left);
  const styleTop = toNumber(panel.style?.top);
  if (styleLeft !== null && styleTop !== null) {
    return { x: styleLeft, y: styleTop };
  }
  const dataLeft = getDatasetNumber(panel, ['x', 'left']);
  const dataTop = getDatasetNumber(panel, ['y', 'top']);
  if (dataLeft !== null && dataTop !== null) {
    return { x: dataLeft, y: dataTop };
  }
  const rect = panel.getBoundingClientRect?.();
  if (rect) {
    return screenToWorldPoint(rect.left, rect.top);
  }
  return { x: 0, y: 0 };
}

export function toyLocalToWorld(panel, localX, localY) {
  const anchor = getToyWorldAnchor(panel);
  return { x: anchor.x + localX, y: anchor.y + localY };
}

export function worldToToyLocal(panel, worldX, worldY) {
  const anchor = getToyWorldAnchor(panel);
  return { x: worldX - anchor.x, y: worldY - anchor.y };
}

export function toyLocalToScreen(panel, localX, localY) {
  const world = toyLocalToWorld(panel, localX, localY);
  return worldToScreenPoint(world.x, world.y);
}

export function screenToToyLocal(panel, screenX, screenY) {
  const world = screenToWorldPoint(screenX, screenY);
  return worldToToyLocal(panel, world.x, world.y);
}

export function worldToScreen(worldX, worldY) {
  return worldToScreenPoint(worldX, worldY);
}

export function screenToWorld(screenX, screenY) {
  return screenToWorldPoint(screenX, screenY);
}
