// src/drawgrid/dg-snap.js
// DrawGrid snap-to-grid helpers.

export function createDgSnap({ state, deps } = {}) {
  const s = state;
  const d = deps;

  function snapToGrid(sourceCtx = s.pctx) {
    // build a map: for each column, choose at most one row where line crosses
    const active = Array(s.cols).fill(false);
    const nodes = Array.from({ length: s.cols }, () => new Set());
    const disabled = Array.from({ length: s.cols }, () => new Set());
    const w = s.paint.width;
    const h = s.paint.height;
    if (!w || !h) return { active, nodes, disabled }; // Abort if canvas is not ready

    // IMPORTANT: gridArea/cw/ch/topPad are in CSS/logical space, but getImageData is in backing-store pixels.
    // When we run with reduced DPR while zoomed out, we must scale + clamp the scan rects, otherwise we can
    // read pixels from the wrong rows/cols (which shows up as phantom "last column" notes).
    const dpr = (typeof s.paintDpr === 'number' && s.paintDpr > 0)
      ? s.paintDpr
      : (w / Math.max(1, Math.round(s.gridArea?.w || w)));
    const defaultRow = Math.max(0, Math.min(s.rows - 1, Math.floor(s.rows * 0.5)));
    const data = sourceCtx.getImageData(0, 0, w, h).data;

    for (let c = 0; c < s.cols; c++) {
      // Define the scan area strictly to the visible grid column to avoid phantom nodes
      const xStartCss = s.gridArea.x + c * s.cw;
      const xEndCss = s.gridArea.x + (c + 1) * s.cw;

      // Convert to backing-store pixels and clamp into [0, w]
      const xStart = Math.max(0, Math.min(w, Math.floor(xStartCss * dpr)));
      const xEnd = Math.max(0, Math.min(w, Math.ceil(xEndCss * dpr)));

      let ySum = 0;
      let inkCount = 0;

      if (xEnd <= xStart) {
        // Column has no drawable width at this DPR; keep a stable "empty" node.
        nodes[c].add(defaultRow);
        disabled[c].add(defaultRow);
        continue;
      }

      // Scan the column for all "ink" pixels to find the average Y position
      // We scan the full canvas height because the user can draw above or below the visual grid.
      for (let x = xStart; x < xEnd; x++) {
        for (let y = 0; y < h; y++) {
          const i = (y * w + x) * 4;
          if (data[i + 3] > 10) { // alpha threshold
            ySum += y;
            inkCount++;
          }
        }
      }

      if (inkCount > 0) {
        const avgYDpr = ySum / inkCount;
        const avgYCss = avgYDpr / dpr;

        const noteGridTop = s.gridArea.y + s.topPad;
        const noteGridBottom = noteGridTop + s.rows * s.ch;
        const isOutside = avgYCss <= noteGridTop || avgYCss >= noteGridBottom;

        if (isOutside) {
          // Find a default "in-key" row for out-of-bounds drawing.
          // This ensures disabled notes are still harmonically related.
          let safeRow = defaultRow; // Fallback to the vertical middle cell
          try {
            const visiblePentatonicNotes = s.pentatonicPalette.filter(p => s.chromaticPalette.includes(p));
            if (visiblePentatonicNotes.length > 0) {
              // Pick a note from the middle of the available pentatonic notes.
              const middleIndex = Math.floor(visiblePentatonicNotes.length / 2);
              const targetMidi = visiblePentatonicNotes[middleIndex];
              const targetRow = s.chromaticPalette.indexOf(targetMidi);
              if (targetRow !== -1) safeRow = targetRow;
            }
          } catch {}
          nodes[c].add(safeRow);
          disabled[c].add(safeRow);
          active[c] = false; // This will be recomputed later, but good to be consistent
        } else {
          // Map average Y to nearest row, clamped to valid range.
          const rClamped = Math.max(0, Math.min(s.rows - 1, Math.round((avgYCss - (s.gridArea.y + s.topPad)) / s.ch)));
          let rFinal = rClamped;

          if (s.autoTune) {
            // 1. Get the MIDI note for the visually-drawn row
            const drawnMidi = s.chromaticPalette[rClamped];

            // 2. Find the nearest note in the pentatonic scale
            let nearestMidi = s.pentatonicPalette[0];
            let minDiff = Math.abs(drawnMidi - nearestMidi);
            for (const pNote of s.pentatonicPalette) {
              const diff = Math.abs(drawnMidi - pNote);
              if (diff < minDiff) { minDiff = diff; nearestMidi = pNote; }
            }

            // 3. Map that pentatonic note into the visible chromatic range by octave wrapping
            try {
              const minC = s.chromaticPalette[s.chromaticPalette.length - 1];
              const maxC = s.chromaticPalette[0];
              let wrapped = nearestMidi | 0;
              while (wrapped > maxC) wrapped -= 12;
              while (wrapped < minC) wrapped += 12;
              const correctedRow = s.chromaticPalette.indexOf(wrapped);
              if (correctedRow !== -1) rFinal = correctedRow;
            } catch {}
          }

          nodes[c].add(rFinal);
          active[c] = true;
        }
      } else {
        // No ink in this column: keep a stable "empty" node at the vertical middle.
        nodes[c].add(defaultRow);
        disabled[c].add(defaultRow);
        active[c] = false;
      }
    }
    if (typeof window !== 'undefined' && window.DG_DRAW_DEBUG) {
      const totalNodes = nodes.reduce((n, set) => n + ((set && set.size) || 0), 0);
      console.debug('[DG][SNAP] summary', { w, h, dpr, totalNodes, anyInk: totalNodes > 0 });
    }
    return { active, nodes, disabled };
  }

  function snapToGridFromStroke(stroke) {
    // Check for cached nodes, but only if the column count matches.
    if (stroke.cachedNodes && stroke.cachedCols === s.cols) {
      return stroke.cachedNodes;
    }

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = s.paint.width;
    tempCanvas.height = s.paint.height;
    const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
    if (!tempCtx) return {
      active: Array(s.cols).fill(false),
      nodes: Array.from({ length: s.cols }, () => new Set()),
      disabled: Array.from({ length: s.cols }, () => new Set())
    };

    tempCtx.save();
    tempCtx.globalCompositeOperation = 'source-over';
    tempCtx.globalAlpha = 1;
    tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
    tempCtx.restore();

    d.drawFullStroke(tempCtx, stroke);
    // Pass the temporary context to the main snapToGrid function
    const result = snapToGrid(tempCtx);
    // Cache the result against the current column count.
    try { stroke.cachedNodes = result; stroke.cachedCols = s.cols; } catch {}
    return result;
  }

  return { snapToGrid, snapToGridFromStroke };
}
