# Simple Draw input and Art movement cleanup

Simple Draw's authored gesture can no longer be translated independently. The surface's Move line button, content-drag state and pointer branches, and the movement methods exposed to the surface were removed. Content fitting after Straighten/Re-coil remains available through the existing container implementation.

The bottom-left second-line affordance was the Draw tool constructed in `free-play-tools.js`, positioned by the Simple Draw toolbar CSS. It remained usable after completion. It is now hidden and disabled while a line exists or this surface is creating one. Canvas handlers reject drawing over existing content, and `createSimpleDrawController.draw` independently rejects existing or pending content before creating grids. Explicit Clear resets the empty state and selects Draw again. Straighten and Clear stay accessible with Scissors selected.

Before the change, the second-stroke path ran surface `drawing.release` → `api.addLine` → controller `draw` → `containers.clear` → `containers.attach`. Clearing removed the first line and interaction data before attachment. There was no rollback of that destructive clear if attachment failed. Browser reproduction accepted a replacement stroke; the specifically reported final empty-toy outcome was not reproduced. The entire implicit clear/replace path is now removed, with tests asserting unchanged grid IDs, notes and container snapshots after rejected second strokes, including overlapping asynchronous creation.

Simple Draw passes `allowPaint:false` to the shared tools. No Black Paint selector, Random Paint or Wipe All action is exposed. The paint implementation, data fields, coverage evaluation, rendering and mute semantics remain supported. Old saved paint and legacy migrated paint continue to load without deletion or schema changes; explicit Clear clears them with the line. Other users of the shared tools retain their existing behavior.

Art snap-back was reproduced with Flash Circle. Live dragging wrote the correct logical `style.left/top` values. On release, `ToySpawner.endPanelDrag` called `tryPlaceChainFromPanel` for the Art panel. Drop probing could find the moving Art panel itself. Art panels are not eligible music chains, so the rejected result restored `startPositions`. This was a drop rollback, not a stale sub-board model, CSS transform, layout-repair anchor or persistence snapshot overwriting the move.

Chain collection, drop probing and music-drop finalization now run only for music `.toy-panel` elements. Trash removal remains available to Art panels. Art drop probing also has a defensive eligibility check. The shared manual placement tracker includes Art panels, cancels outstanding layout animation when their handle is pressed, commits overview/cache coordinates and marks the project dirty after movement. Art snapshots now round-trip the normal `positionSource` marker; older snapshots default to manual.

Position authority remains the ordinary top-level panel's logical `left/top`, as used by other ordinary board panels and read by project persistence. No Art-specific outer coordinate store was introduced. Internal home coordinates and internal drawing coordinates remain separate. Container toys continue to use container bounds as before.

Verification:

Final result: 127 targeted Node tests passed; 22 browser harness checks passed; `git diff --check` passed.

- Targeted Node suites cover controller one-line guards, asynchronous Clear/Delete, legacy paint save/reload, Art drop rollback, music rejection rollback, manual Art commit/publication, Art UI snapshot restoration, current-position local repair, graph manual resistance, responsive scales and existing Art viewport geometry.
- `tests/simple-draw-input-browser.html` runs 22 real-DOM checks for input restrictions, Clear/redraw, reopen, absent paint/move actions, Scissors controls, and shared Art drag conversion at scales 0.35, 0.625, 1 and 1.8, including open controls and disabled internal mirrors.
- Full-app Chrome checks reproduced the original Art rollback, then verified movement of two Art panels, movement near another Art panel, open controls, Enter/Exit Internal View followed by movement, responsive viewport changes, changed board zoom, and persisted coordinates after page reload. Both moved Art positions and manual markers survived reload. The browser viewport override was reset.
- Local repair is covered by automated model tests; the full-app local tidy trigger was not independently exercised. Full-app movement used Flash Circle; the scale harness exercises the common base used by all Art Toy kinds.
