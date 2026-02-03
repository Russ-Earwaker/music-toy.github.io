// src/drawgrid/dg-ghost-path.js
// Ghost guide sweep path helper.

export function computeGhostSweepLR({
  gridArea,
  rows,
  getDrawLabelYRange,
} = {}) {
  if (!gridArea || gridArea.w <= 0 || gridArea.h <= 0) {
    const fallbackY = gridArea?.y || 0;
    const fallbackX = gridArea?.x || 0;
    return {
      from: { x: fallbackX, y: fallbackY },
      to: { x: fallbackX + (gridArea?.w || 0), y: fallbackY },
      safeMinY: fallbackY,
      safeMaxY: fallbackY,
    };
  }
  // Push the ghost further off-screen so the trail fully exits before fading.
  const marginBase = Math.min(gridArea.w, gridArea.h);
  const margin = Math.max(32, Math.round(marginBase * 0.24));
  const leftX = gridArea.x - margin;
  const rightX = gridArea.x + gridArea.w + margin;
  const cellH = rows > 0 ? gridArea.h / rows : gridArea.h;
  const safeMargin = Math.max(6, Math.round(cellH * 0.5));
  const safeMinY = gridArea.y + safeMargin;
  const safeMaxY = Math.max(safeMinY, gridArea.y + gridArea.h - safeMargin);

  const range = Math.max(1, safeMaxY - safeMinY);
  const startY = Math.round(safeMinY + Math.random() * range);
  const letterRange = getDrawLabelYRange?.();
  const crossY = (letterRange && letterRange.maxY > letterRange.minY)
    ? Math.round((Math.max(safeMinY, letterRange.minY) + Math.min(safeMaxY, letterRange.maxY)) * 0.5)
    : Math.round(safeMinY + range * 0.5);

  const clampedY = Math.max(safeMinY, Math.min(safeMaxY, startY));
  return {
    from: { x: leftX, y: clampedY },
    to: { x: rightX, y: clampedY },
    crossY,
    safeMinY,
    safeMaxY,
  };
}
