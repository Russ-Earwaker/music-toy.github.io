// src/drawgrid/dg-note-grid.js
// Note grid palettes, labels, and drag-scale hints.

export function createDgNoteGrid({ state, deps } = {}) {
  const s = state;
  const d = deps;

  // --- Note Palettes for Snapping ---
  const pentatonicOffsets = [0, 3, 5, 7, 10];
  const chromaticOffsets = Array.from({ length: 12 }, (_, i) => i);
  // Create palettes of MIDI numbers. Reversed so top row is highest pitch.
  const chromaticPalette = d.buildPalette(48, chromaticOffsets, 1).reverse(); // MIDI 59 (B3) down to 48 (C3)
  const pentatonicPalette = d.buildPalette(48, pentatonicOffsets, 2).reverse(); // 10 notes from C3-C5 range
  const pentatonicPitchClasses = new Set(pentatonicOffsets.map(offset => ((offset % 12) + 12) % 12));

  function drawNoteLabelsTo(ctx, nodes) {
    if (!ctx) return;
    const fadeAlpha = Math.max(0, Math.min(1, Number.isFinite(s.gridVisibilityAlpha) ? s.gridVisibilityAlpha : 0));
    if (fadeAlpha <= 0.001) return;
    d.__dgWithLogicalSpace(ctx, () => {
      ctx.fillStyle = `rgba(255, 255, 255, ${0.7 * fadeAlpha})`;
      ctx.font = '600 24px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const gridBottomY = Math.round((s.gridArea?.y || 0) + (s.topPad || 0) + ((s.rows || 0) * (s.ch || 0)));
      const labelY = Math.round((gridBottomY + (s.cssH || 0)) * 0.5);

      for (let c = 0; c < s.cols; c++) {
        if (!nodes[c] || nodes[c].size === 0) continue;
        let r = undefined;
        const disabledSet = s.currentMap?.disabled?.[c] || new Set();
        for (const row of nodes[c]) {
          if (!disabledSet.has(row)) { r = row; break; }
        }
        if (r === undefined) continue;
        const midiNote = chromaticPalette[r];
        if (midiNote === undefined) continue;
        const tx = Math.round(s.gridArea.x + c * s.cw + s.cw * 0.5);
        ctx.fillText(d.midiToName(midiNote), tx, labelY);
      }
    });
  }

  function drawNoteLabels(nodes) {
    drawNoteLabelsTo(s.nctx, nodes);
  }

  function renderDragScaleBlueHints(ctx) {
    if (!ctx) return;
    if (typeof s.dragScaleHighlightCol !== 'number' || s.dragScaleHighlightCol < 0 || s.dragScaleHighlightCol >= s.cols) return;
    if (s.cw <= 0 || s.ch <= 0) return;
    const fadeAlpha = Math.max(0, Math.min(1, Number.isFinite(s.gridVisibilityAlpha) ? s.gridVisibilityAlpha : 0));
    if (fadeAlpha <= 0.001) return;
    const noteGridY = s.gridArea.y + s.topPad;
    const colX = s.gridArea.x + s.dragScaleHighlightCol * s.cw;
    const activeRow = (s.draggedNode && s.draggedNode.col === s.dragScaleHighlightCol) ? s.draggedNode.row : null;
    ctx.save();
    const strokeWidth = Math.max(1, Math.min(s.cw, s.ch) * 0.045);
    ctx.lineJoin = 'miter';
    ctx.lineCap = 'butt';
    for (let r = 0; r < s.rows; r++) {
      const midi = chromaticPalette[r];
      if (typeof midi !== 'number') continue;
      const pitchClass = ((midi % 12) + 12) % 12;
      if (!pentatonicPitchClasses.has(pitchClass)) continue;
      const y = noteGridY + r * s.ch;
      const alpha = ((activeRow === r) ? 0.6 : 0.35) * fadeAlpha;
      ctx.fillStyle = `rgba(90, 200, 255, ${alpha})`;
      ctx.fillRect(colX, y, s.cw, s.ch);
      ctx.lineWidth = strokeWidth;
      ctx.strokeStyle = activeRow === r
        ? `rgba(160, 240, 255, ${0.95 * fadeAlpha})`
        : `rgba(130, 220, 255, ${0.85 * fadeAlpha})`;
      ctx.strokeRect(colX, y, s.cw, s.ch);
    }
    ctx.restore();
  }

  function setDragScaleHighlight(col) {
    const next = (typeof col === 'number' && col >= 0 && col < s.cols) ? col : null;
    if (s.dragScaleHighlightCol === next) return;
    s.dragScaleHighlightCol = next;
    d.markStaticDirty?.('drag-scale-highlight');
    d.ensureRenderLoopRunning?.();
  }

  return {
    chromaticPalette,
    pentatonicPalette,
    pentatonicPitchClasses,
    drawNoteLabelsTo,
    drawNoteLabels,
    renderDragScaleBlueHints,
    setDragScaleHighlight,
  };
}
