# Content-first Simple Draw creation and fitting

Simple Draw creation now starts at **Create Toy → Paint**. The player draws on the normal board; a valid release materializes a fitted Simple Draw Container around the authored line. The instrument painter's palette retains its existing instrument-colouring role. This pass adds no Bouncer/Ripple/cube toys or global Simple/Advanced mode.

## 1. Temporary creation state

`src/simple-draw-creation.js::installSimpleDrawCreation` installs a one-shot board input tool. Its temporary state contains only pointer capture, logical path points, an SVG preview and the chosen Heartbeat. It creates no Container, DrawGrid, edge or transport before release. Existing objects reject gesture starts on their controls/bodies, but an already captured gesture can cross them freely without adopting or editing them.

Escape, blur, pointer cancellation, lost capture, scene changes and invalid releases clean up the preview/capture. The normal minimum interpreted stroke length decides validity. Completed gestures use independent asynchronous creation jobs; another Paint gesture can start while earlier normal DrawGrids initialize. Clear/Delete/replacement cancellation cannot remove a newer gesture's content.

## 2. Gesture to fitted bounds

`src/simple-draw-placement.js::prepareBoardDrawing` accepts logical world points obtained through the existing `screenToWorld` bridge. It performs normal pentatonic generation with the existing four-bar cap, then measures only the interpreted authored path. Other board objects never enter this measurement.

The conversion uses a logical reference space at least 1068×520 for the established normalized gesture interpretation. That reference is a coordinate mapping, not the frame size. Persisted `interactionData.contentSpace = {x, y, width, height}` maps the original normalized gesture into the wrapper's local board coordinates. Fitting changes the frame around it rather than stretching the gesture to fill a new canvas. Render and hit-test helpers use this same mapping.

World point reconstruction is:

```js
worldX = container.bounds.x + contentSpace.x + pathPoint.x * contentSpace.width;
worldY = container.bounds.y + contentSpace.y + pathPoint.y * contentSpace.height;
```

This keeps release coordinates in place when the frame appears, and preserves geometry when the whole toy moves. Playback/sourceMidi remain canonical DrawGrid data.

## 3. Minimum size and padding

`src/container-fit.js` defines a **640×440** logical minimum and **32** units of authored-content padding. Simple Draw additionally reserves layout insets of **16 left/right, 126 top, 124 bottom** for its border, header, toolbar and actions. CSS in `free-play.css` matches these insets. A minimum-height frame has a 190-unit canvas area; taller authored gestures get taller frames.

All fit calculations use logical values. They read no viewport dimensions, CSS screen rectangles, DPR or board zoom. The frame materialization uses a 200 ms border/background transition and respects reduced motion. Canvas backing resolution and screen-pointer conversion remain presentation concerns.

## 4. Generic fitting API

The Container foundation now exposes:

```js
containers.requestContainerGrowth(id, authoredWorldBounds, {
  active: true,
  kind: 'authored', // default; other kinds are ignored
  minimum, padding, insets
});
containers.commitContainerBounds(id); // reports {container, grew}
```

`authoredBounds`, `fitAuthoredBounds` and `growAuthoredBounds` are pure shared geometry helpers. `onBoundsCommit(id)` is the generic integration hook for a single post-interaction board repair. Requesting identical bounds is idempotent; a commit without growth does nothing. Deletion clears pending commits. Resizing the wrapper preserves owned internals' world positions and recomputes their relative layout offsets.

Future adapters can calculate their authored/resting bounds and use this API without reproducing Simple Draw creation or fitting logic.

## 5. Authored versus transient bounds

Only deliberate authored placement enters fitting. Simple Draw measures its historical path, or the settled uncoiled target when Straighten is selected. It never measures canvas pixels, playback highlights, glow, flying scissors, sag, string swing, paint droplets or other transient animation. The explicit `kind`/`active` gate rejects effect-only or inactive requests.

## 6. Live expansion

**Move line** provides a safe presentation edit: drag within the canvas to translate the authored line. Pointer capture lets the drag continue beyond the old frame. Each move requests growth immediately, keeping the padded authored contour visible. Left/up growth rebases `contentSpace` so the line stays with the pointer instead of jumping with the frame origin. Notes, source pitches, mute reasons, timing and original path samples are unchanged.

Straighten/Re-coil retains the original smooth gesture and note heights. The settled target contour is fitted at the deliberate toggle, preventing clipping in a compact frame; intermediate animation never drives fitting. Older saved Simple Draws acquire an equivalent local content mapping on their first placement/uncoil edit, without recomputing saved bounds on load.

## 7. Shrink policy

Automatic fitting only grows. Moving inward or selecting Re-coil retains the current size. Repeated identical requests introduce no drift. An explicit shrink/Fit UI is deferred; it is not required for this first pass.

## 8. Local overlap repair

`src/graph-placement.js::repairAround(anchorId)` extends the existing shared placement engine. The just-created/expanded toy stays fixed. Only overlaps reached from that anchor participate; disconnected distant objects are untouched. It uses actual logical rectangles, existing vertical-slot search, sibling gap, weighted placement cost and manual-position resistance. Movable descendant envelopes translate together, preserving their internal composition. Existing relative spacing within such a branch is not normalized unnecessarily.

Ordered Structure siblings retain their order; independent Heartbeat roots do not invent a socket order. A leftward move cannot reverse an existing sequential parent corridor. New object creation repairs immediately after materialization; live growth repairs once on release. Displacements use the existing 200 ms graph animation and reduced-motion setting. No full-board Arrange, adoption or connection mutation occurs.

Search is bounded and deterministic, not a global packing optimizer. If fixed objects/graph constraints prevent resolution, the authored anchor stays put and a temporary visible status asks the player to make room. Heartbeats remain fixed. Distant objects can move only if a real collision propagates to them, not merely because they belong to the board.

## 9. Connections, persistence and Container operations

External sockets stay on the semantic IN/OUT perimeter. Every bounds update refreshes the ordinary connection view. Container endpoints also follow repair animation and the compact Open header. Fitting creates no edges and changes no graph order or edge IDs. Successful standalone creation still uses normal Heartbeat rooting and shared phase.

Persisted Container bounds and `contentSpace` restore directly; reload does not refit them. Open retains the fitted dimensions while showing ordinary internal DrawGrids; Close restores the same surface. Expand removes the wrapper and reveals the same internal IDs/notes/wires with their existing relative layout. No music is regenerated by any representation change.

## 10. Tests and browser evidence

The focused regression run passed **140/140** tests, covering fit geometry, zoom-independent world reconstruction, tiny/invalid/max-length gestures, active/authored gating, inward moves, repeat requests, deletion during growth, actual owned Container layouts, local graph repair, source phase, normal timing, silence, persistence and existing musical-equivalence tests. Module syntax and diff whitespace checks pass.

Browser checks on an isolated local origin verified:

- Paint arms without a frame; the SVG preview exists while the previous Container count is unchanged.
- Curved drawing materializes around its existing screen endpoints without relocation.
- An invalid click creates no wrapper, hidden grid or edge; a small valid line gets exactly 640×440.
- Four independent creations retain their own internals.
- A line drag grows its frame before pointer release; the neighboring large Simple Draw waits until release before moving aside.
- Live placement preserves notes and all connection IDs. A normal DrawGrid overlapping the expanded toy moves locally (x=264 → x≈94.893) while the edited wrapper stays anchored; it is never adopted.
- Straighten grows a tight frame as needed; Re-coil does not shrink it.
- Open/Close preserve fitted dimensions. Expand preserves toy IDs, notes and wires exactly.
- Reload preserves committed bounds and ownership exactly and does not regroup expanded toys.
- Creation at normal and Overview board scales uses the same logical minimum; Open/Close camera zoom does not change committed size.
- No browser errors were recorded.

JSON traces and a screenshot are in `resources/debug-output/simple-creation/`. Live pointer traces distinguish growth while `buttons=1` from post-release neighbor movement. Art/Structure footprints and distant/manual objects are covered in placement tests; interactive Art-specific browser flows and physical DPR/window-resize combinations were not separately exercised. Pure fit helpers have no presentation-scale inputs, and world reconstruction is tested at multiple scales.

## 11. Limits relevant to the next Simple Toys

The generic API supports authored AABBs and conservative growth. Bouncer/cubes will need adapters that distinguish resting obstacle/object geometry from moving simulations. Ripple must exclude animated radius. Effects that should overflow the surface will need their own rendering layer; this pass does not turn effect extents into authored bounds.

The local repair remains constrained by the foundation's single-entry/single-exit ownership and existing Art/nesting restrictions. It does not solve arbitrary global packing or nested/shared ownership. Simple Draw proves live growth with translation of its historical line, not per-note octave manipulation or resculpting its canonical source pitches. These limits do not require a separate scheduler or fitting engine for a future custom surface.
