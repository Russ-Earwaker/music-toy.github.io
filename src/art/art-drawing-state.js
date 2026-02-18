// src/art/art-drawing-state.js
// Shared slot->strokes drawing state for draw-first art toys (Sticker now, Flip Book later).

function clonePoint(pt) {
  return {
    x: Number(pt?.x) || 0,
    y: Number(pt?.y) || 0,
  };
}

function cloneStroke(points) {
  if (!Array.isArray(points)) return [];
  return points.map(clonePoint);
}

export function createArtDrawingState({ slotCount = 8 } = {}) {
  const count = Math.max(1, Math.trunc(Number(slotCount) || 8));
  const strokesBySlot = Array.from({ length: count }, () => []);

  const normalizeSlot = (slot) => {
    const n = Number(slot);
    if (!Number.isFinite(n)) return 0;
    const i = Math.trunc(n);
    if (i < 0) return 0;
    return i % count;
  };

  const getSlotStrokes = (slot) => {
    const i = normalizeSlot(slot);
    return strokesBySlot[i];
  };

  const setSlotStrokes = (slot, strokes) => {
    const i = normalizeSlot(slot);
    if (!Array.isArray(strokes)) {
      strokesBySlot[i] = [];
      return;
    }
    strokesBySlot[i] = strokes
      .map(cloneStroke)
      .filter((stroke) => stroke.length >= 2);
  };

  const addSlotStroke = (slot, points) => {
    const i = normalizeSlot(slot);
    const stroke = cloneStroke(points);
    if (stroke.length < 2) return false;
    strokesBySlot[i].push(stroke);
    return true;
  };

  const clearSlot = (slot) => {
    const i = normalizeSlot(slot);
    strokesBySlot[i] = [];
  };

  const clearAll = () => {
    for (let i = 0; i < count; i++) strokesBySlot[i] = [];
  };

  const hasSlotStrokes = (slot) => getSlotStrokes(slot).length > 0;

  const exportState = () => ({
    slotCount: count,
    strokesBySlot: strokesBySlot.map((strokes) => strokes.map(cloneStroke)),
  });

  const importState = (state = null) => {
    const incoming = Array.isArray(state?.strokesBySlot) ? state.strokesBySlot : [];
    for (let i = 0; i < count; i++) {
      const next = Array.isArray(incoming[i]) ? incoming[i] : [];
      setSlotStrokes(i, next);
    }
  };

  return {
    slotCount: count,
    normalizeSlot,
    getSlotStrokes,
    setSlotStrokes,
    addSlotStroke,
    clearSlot,
    clearAll,
    hasSlotStrokes,
    exportState,
    importState,
  };
}

