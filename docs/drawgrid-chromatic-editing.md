# Chromatic editing and octave communication

Node edits accept every chromatic sourceMidi in the grid's pitch window. Pentatonic palettes remain generation/suggestion policies. Drag hints also highlight the active chromatic row when it is outside the suggested pentatonic set.

The reference octave is the octave containing the midpoint of the grid's fixed pitchRange: C4–B4 for generated three-octave grids, C3–B3 for legacy one-octave grids. It does not shift as notes move. Small +1/−1/etc. markers sit beside every node outside that octave, with a compact reference caption. The exact authored note name appears at the active column's footer during dragging and disappears on release. There are no permanent row labels or per-note octave controls. Register remains a separate playback offset; markers and drag feedback describe sourceMidi.

Node dragging no longer rebuilds generated ink. The DrawGrid stroke stays fixed. Free Play also freezes its initial straightened contour using presentation-only visualEvents metadata on the first grid. Playback reads current canonical notes, never that presentation metadata. Edited nodes can move off the static line. Old Free Play saves derive their frozen contour from the original gesture. Re-coil continues to restore the original stroke geometry.

Files: dg-note-grid.js renders the markers/contextual note name; drawgrid.js supplies its panel pitch range; dg-input-handlers.js no longer reshapes strokes; dg-authored-stroke.js loses the unused reshape helper; free-play-drawgrid.js and free-play-line-visual.js separate static contour from editable nodes.

Validation: 111 targeted tests passed, including the actual pointer-handler path for chromatic edits, temporary labels, stable reference, static ink/contour, legacy fallback and reload. Browser: generated C5→C♯5 retained its ID, exact stroke arrays and original gesture through reload. Markers were inspected at normal display size.

Evidence: [markers](../resources/debug-output/free-play/octave-markers-before.png), [edited node](../resources/debug-output/free-play/octave-markers-edited.png), [static Straighten](../resources/debug-output/free-play/octave-markers-static-straighten.png), [browser state comparison](../resources/debug-output/free-play/octave-markers-browser-proof.json).

This supersedes the earlier stress-pass behavior that reshaped generated strokes after node edits. Advanced per-note octave editing remains deferred.
