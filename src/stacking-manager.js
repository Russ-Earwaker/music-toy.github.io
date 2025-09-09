// src/stacking-manager.js
// This module provides a centralized function to manage the stacking order (z-index)
// of toy panels, ensuring that panels with externally positioned controls are not
// obscured by their neighbors.

export function applyStackingOrder() {
  // Find all loopgrid panels, which have external "Edit Mode" buttons.
  const loopGrids = Array.from(document.querySelectorAll('.toy-panel[data-toy="loopgrid"]'));
  const totalGrids = loopGrids.length;

  // Assign a descending z-index. The first panel in the DOM gets the highest z-index,
  // ensuring its external button is not hidden by the panel to its right.
  loopGrids.forEach((p, i) => { p.style.zIndex = (totalGrids - i) + 2; });
}