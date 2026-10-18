import {authoredNoteAt,authoredNotesAt,pitchRange,rowToSourceMidi} from './dg-authored-notes.js';
// src/drawgrid/dg-note-grid.js
// Note grid palettes, labels, and drag-scale hints.

// A fixed view-based reference cannot jump as individual notes are edited.
export const drawGridReferenceOctave = range => Math.floor(((range.minMidi + range.maxMidi) / 2) / 12) - 1;
export function octaveOffsetMarker(sourceMidi, referenceOctave) {
  const offset = Math.floor(sourceMidi / 12) - 1 - referenceOctave;
  return offset ? (offset > 0 ? `+${offset}` : String(offset)) : '';
}

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
    d.__dgWithLogicalSpace(ctx, () => {
      ctx.save();
      const range = pitchRange(s.panel);
      const reference = drawGridReferenceOctave(range);
      ctx.fillStyle = 'rgba(230, 242, 255, 0.9)';
      ctx.font = '600 14px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = '#080d19';
      ctx.shadowBlur = 3;
      const gridBottomY = Math.round((s.gridArea?.y || 0) + (s.topPad || 0) + ((s.rows || 0) * (s.ch || 0)));
      const labelY = Math.round((gridBottomY + (s.cssH || 0)) * 0.5);
      let hasOffsets = false;
      for (let c = 0; c < s.cols; c++) {
        for (const row of nodes[c] || []) {
          const midi = authoredNoteAt(s.panel,c,row)?.sourceMidi ?? rowToSourceMidi(row,range);
          const pitches = authoredNotesAt(s.panel,c,row);
          const offsets = [...new Set((pitches.length?pitches:[{sourceMidi:midi}]).map(n=>octaveOffsetMarker(n.sourceMidi,reference)))];
          const marker = offsets.length>1?offsets.map(s=>s||'0').join('/'):offsets[0];
          if (!marker) continue;
          hasOffsets = true;
          const x = s.gridArea.x + (c + .5) * s.cw;
          const y = s.gridArea.y + (s.topPad || 0) + (row + .5) * s.ch;
          ctx.fillText(marker,x + Math.max(4,Math.min(s.cw,s.ch)*.2) + 6,y);
        }
      }
      if (hasOffsets) ctx.fillText(`Ref C${reference}–B${reference}`,s.gridArea.x,Math.max(12,s.gridArea.y-14));
      // Exact authored pitch is contextual feedback, never a permanent row label.
      if (s.draggedNode) {
        const {col,row} = s.draggedNode;
        const pitches=authoredNotesAt(s.panel,col,row);
        const names=(pitches.length?pitches:[{sourceMidi:rowToSourceMidi(row,range)}]).map(n=>d.midiToName(n.sourceMidi));
        ctx.font = '600 24px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(names.join('/'),s.gridArea.x+(col+.5)*s.cw,labelY);
      }
      ctx.restore();
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
      const midi = rowToSourceMidi(r,pitchRange(s.panel));
      if (typeof midi !== 'number') continue;
      const pitchClass = ((midi % 12) + 12) % 12;
      const suggested = s.panel?.__dgSuggestedPitchClasses || pentatonicOffsets;
      // Pentatonic rows are suggestions; every chromatic row remains editable.
      if (!suggested.includes(pitchClass) && activeRow !== r) continue;
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
