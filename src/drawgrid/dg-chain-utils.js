// src/drawgrid/dg-chain-utils.js

/**
 * For a sparse array of nodes, fills in the empty columns by interpolating
 * and extrapolating from the existing nodes to create a continuous line.
 * @param {Array<Set<number>>} nodes - The sparse array of node rows.
 * @param {number} numCols - The total number of columns in the grid.
 * @returns {Array<Set<number>>} A new array with all columns filled.
 */
function fillGapsInNodeArray(nodes, numCols) {
    const filled = nodes.map(s => s ? new Set(s) : new Set()); // Deep copy
    const firstDrawn = filled.findIndex(n => n.size > 0);
    if (firstDrawn === -1) return filled; // Nothing to fill

    const lastDrawn = filled.map(n => n.size > 0).lastIndexOf(true);

    const getAvgRow = (colSet) => {
        if (!colSet || colSet.size === 0) return NaN;
        // Using a simple loop is arguably clearer and safer than reduce here.
        let sum = 0;
        for (const row of colSet) { sum += row; }
        return sum / colSet.size;
    };

    // Extrapolate backwards from the first drawn point
    const firstRowAvg = getAvgRow(filled[firstDrawn]);
    if (!isNaN(firstRowAvg)) {
        for (let c = 0; c < firstDrawn; c++) {
            filled[c] = new Set([Math.round(firstRowAvg)]);
        }
    }

    // Extrapolate forwards from the last drawn point
    const lastRowAvg = getAvgRow(filled[lastDrawn]);
    if (!isNaN(lastRowAvg)) {
        for (let c = lastDrawn + 1; c < numCols; c++) {
            filled[c] = new Set([Math.round(lastRowAvg)]);
        }
    }

    // Interpolate between drawn points
    let lastKnownCol = firstDrawn;
    for (let c = firstDrawn + 1; c < lastDrawn; c++) {
        if (filled[c].size > 0) {
            lastKnownCol = c;
        } else {
            let nextKnownCol = c + 1;
            while (nextKnownCol < lastDrawn && filled[nextKnownCol].size === 0) { nextKnownCol++; }
            const leftRow = getAvgRow(filled[lastKnownCol]);
            const rightRow = getAvgRow(filled[nextKnownCol]);
            if (isNaN(leftRow) || isNaN(rightRow)) continue;
            const t = (c - lastKnownCol) / (nextKnownCol - lastKnownCol);
            const interpolatedRow = Math.round(leftRow + t * (rightRow - leftRow));
            filled[c] = new Set([interpolatedRow]);
        }
    }
    return filled;
}

function findChainHead(toy) {
    if (!toy) return null;
    let current = toy;
    let sanity = 100;
    while (current && current.dataset.prevToyId && sanity-- > 0) {
        const prev = document.getElementById(current.dataset.prevToyId);
        if (!prev || prev === current) break;
        current = prev;
    }
    return current;
}


function chainHasSequencedNotes(head) {
  let current = head;
  let sanity = 100;
  while (current && sanity-- > 0) {
    const toyType = current.dataset?.toy;
    if (toyType === 'loopgrid' || toyType === 'loopgrid-drum') {
      const state = current.__gridState;
      if (state?.steps && state.steps.some(Boolean)) return true;
    } else if (toyType === 'drawgrid') {
      const toy = current.__drawToy;
      if (toy) {
        if (typeof toy.hasActiveNotes === 'function') {
          if (toy.hasActiveNotes()) return true;
        } else if (typeof toy.getState === 'function') {
          try {
            const drawState = toy.getState();
            const activeCols = drawState?.nodes?.active;
            if (Array.isArray(activeCols) && activeCols.some(Boolean)) return true;
          } catch {}
        }
      }
    } else if (toyType === 'chordwheel') {
      if (current.__chordwheelHasActive) return true;
      const steps = current.__chordwheelStepStates;
      if (Array.isArray(steps) && steps.some(s => s !== -1)) return true;
    }
    const nextId = current.dataset?.nextToyId;
    if (!nextId) break;
    current = document.getElementById(nextId);
    if (!current || current === head) break;
  }
  return false;
}

// (moved into createDrawGrid - per-instance)

function normalizeMapColumns(map, cols) {
  // Ensure consistent shape for player & renderers
  if (!map) return { active: Array(cols).fill(false), nodes: Array.from({length: cols}, () => new Set()), disabled: Array.from({length: cols}, () => new Set()) };
  if (!Array.isArray(map.active)) map.active = Array(cols).fill(false);
  if (!Array.isArray(map.nodes)) map.nodes = Array.from({length: cols}, () => new Set());
  if (!Array.isArray(map.disabled)) map.disabled = Array.from({length: cols}, () => new Set());
  // Fill any sparse holes with Sets
  for (let i=0;i<cols;i++){
    if (!(map.nodes[i] instanceof Set)) map.nodes[i] = new Set(map.nodes[i] || []);
    if (!(map.disabled[i] instanceof Set)) map.disabled[i] = new Set(map.disabled[i] || []);
    if (typeof map.active[i] !== 'boolean') map.active[i] = !!map.active[i];
  }
  return map;
}

export {
  fillGapsInNodeArray,
  findChainHead,
  chainHasSequencedNotes,
  normalizeMapColumns,
};
