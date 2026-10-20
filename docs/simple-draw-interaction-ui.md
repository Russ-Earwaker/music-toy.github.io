# Simple Draw interaction and container UI pass

Chrome sections below describe the earlier UI pass. The current shared handle, top controls, volume and canvas implementation is documented in [Simple Paint UI alignment](simple-paint-ui-alignment.md).

This pass changes input and presentation only. Canonical DrawGrid generation, sourceMidi, ticks, transport, Container ownership, content-first creation, fitting, overlap repair and persisted cut/paint fields are unchanged.

## 1. Scissors swipe hit testing

`src/free-play-scissors.js::createScissorsStroke` collects a polyline in logical authored layout units. Once the pointer moves **12 logical units from its starting point**, every segment is tested against eligible displayed musical nodes with a forgiving **24-unit radius**. Pending initial segments are included when the swipe threshold is crossed. Coalesced pointer samples and the final pointerup position are processed, so a coarse fast swipe cannot skip a straight segment simply because it emitted fewer events.

A per-gesture set records each line/node pair; backtracking and repeated crossings emit one cut per node. Already-cut nodes are ignored. Hits on one segment are ordered along the direction of travel. Small touch jitter remains a tap even after many samples: classification uses maximum excursion, not sample count or accumulated jitter distance.

`src/surface-coordinates.js::contentPointer` converts screen pointers into the same historical authored coordinate space used by rendering. Scissors then use logical dimensions. CSS zoom and backing bitmap/DPR never set hit radii or musical state.

## 2. Forgiving tap to heal

A Scissors gesture that stays inside the swipe slop is a heal tap. `nearestCutGap` selects the nearest eligible cut within **48 logical units**, considering the resting gap and its current loose ends. Equal-distance targets use a stable line/node ID tie-break rather than array order. A distant tap does nothing; a tap on an uncut node does not cut it.

Healing submits the existing `cuts: {[noteId]: false}` edit through the existing canonical silence controller. Other cuts remain unchanged. `paintCovered` remains independent, so healing a painted cut leaves that note muted by paint. No transport restart occurs.

## 3. Physical response and retired input

The existing cut/swing/damp/hang and 350 ms mend geometry remain. A fast batch of snips gets tiny staggered visual timestamps, capped at 90 ms total; slower swipes react as each node is crossed. Mending pulls the string back to its exact original curve and adds a short knot/spark accent. These effects stay in transient presentation maps and never enter authored fitting.

Drag-two-ends gesture state, partner-distance completion and the drawn end-to-partner guide were removed from the input controller. Player instructions now say: “Swipe across notes to snip. Tap near a cut to heal.” `cutEnds` remains useful for visible-gap targeting and the existing physical renderer, not for a dexterous repair requirement.

## 4. Art Toy audit

Inspected `src/art/base-art-toy.js`, `src/art/art-toy-factory.js`, Art rules in `style.css`, and `circular-button.css`. Art Toys use three circular button layers, existing drag/enter/clear/random assets, hover/glow/active states, a drag handle with tap-versus-drag discrimination, and contextual controls. Their standard control size is 62 and drag affordance can be 124 logical units; individual Art surfaces have their own shapes and selection styling.

Art's global single-open-controls policy and outside-frame positioning were not adopted: Simple Draw needs independent control state across toys and controls inside its already fitted bounds.

## 5. Actual sharing

`src/circular-control.js` now exports the exact existing `CIRCULAR_BUTTON_HTML` layers, consumed by both Art base/factory modules and Simple Draw's button decorator. The Art modules' generated markup is byte-for-byte equivalent; their interaction behavior is unchanged.

Simple Draw reuses:

- The existing `.c-btn` layers and `circular-button.css` hover, focus, shadows and icon rendering.
- The existing `.art-toy-drag-btn` active/drag styling on its compact handle, with scoped size/position overrides.
- `T_ButtonDrag`, `T_ButtonEnter`, `T_ButtonClear`, `T_ButtonTrash`, and **the same `T_ButtonRandom`** asset used by Art Toys.

New Draw/Scissors/Paint/Heal/Uncoil/Expand glyphs are small inline SVG icons within those same button layers. The quiet frame treatment is scoped Simple Draw CSS, not a duplicated Art surface implementation. Logical content insets and persisted frame sizes remain intact.

## 6. Control hierarchy

The surface exposes Draw only while empty, plus Scissors. A completed line has no Draw or Move line affordance. Black Paint, Random Paint and Wipe All are disabled in Simple Draw UI; legacy paint data remains supported and continues to render and mute notes. Contextual secondary controls occupy the existing reserved action area:

| Mode | Secondary actions |
| --- | --- |
| Empty Draw | Clear |
| Completed line | Straighten/Re-coil, Clear |
| Scissors | Straighten/Re-coil, Clear, Random Cuts, Heal All |

Open, Expand onto Board and Delete Container are behind the compact header handle. Tooltips distinguish Open (inspect the owned graph) from Expand (remove the wrapper and reveal its toys). Random Cuts retains its accessible `Randomise Scissors` name and shared dice icon. Clear returns to empty Draw mode, including when Scissors was selected.

## 7. Contextual behavior and movement

Tapping the handle/header toggles the Container action row. Dragging beyond the existing Art-style 6-screen-pixel slop moves the whole toy through the existing Container move API without toggling controls. Pointer cancellation does not toggle the row. Native keyboard activation also reveals/collapses controls. Header actions are separate from the drag region and surface input.

The action row sits in the reserved header area, not over the string. Primary modes remain visible. Contextual actions update immediately on tool selection; status text is available to assistive technology and appears on surface hover/focus. The frame is subdued and the surface remains visually dominant. No global toolbar or global Simple/Advanced state was introduced.

## 8. Touch and coarse pointers

Primary and secondary tool targets are 48 logical units; header/actions are 44. A 24-unit cut tolerance and 48-unit heal tolerance reduce targeting demands. A sparse swipe, a dense swipe, and a backtracking swipe are covered by tests. Repeated small jitter does not turn a tap into a cut gesture. A Scissors swipe starting near an old cut can continue cutting other eligible nodes; it is not captured into a mend-drag mode.

Physical touchscreen/device QA remains outstanding. Browser checks used coarse mouse-pointer paths; production coordinate conversion is tested against zoom and backing pixel/DPR variations.

## 9. Multiple containers and persistence

Tool state, stroke samples, per-gesture hit IDs, physical animation, paint, controls visibility and header gestures are instance-local. Multiple Simple Draw action rows may remain open independently. Toggling one or changing its tool leaves the others alone. Tool/header visibility remains temporary UI state, as before; persisted musical cuts, paint and geometry restore normally.

Browser reload verified stable note IDs, source pitches, columns, both silence reasons, original strokes, ownership and exact fitted bounds. Optional absent versus false mute fields normalize equivalently. Open/Close continues to expose the ordinary internal DrawGrid and restore the surface without a musical change.

## 10. Verification

The focused suite passes **161/161** tests. The 11 new scissors tests cover single/multiple nodes, fast versus slow sampling, reverse direction, backtracking, repeat crossings, near misses, already-cut nodes, bent paths, jitter, actual pointer conversion across zoom/DPR/content offsets, forgiving/far/tied gap selection, independent paint mute, JSON persistence and exact physical restoration. Existing musical-equivalence, silence-sync, curve, full-loop, fit, local placement, Container and Art viewport tests also pass. Module syntax and diff whitespace checks pass.

Browser QA on an isolated local origin verified:

- Existing Paint → board gesture → fitted frame creation; no extra empty-panel step.
- Coarse two-point swipe cut all four crossed notes, with sequential snip timestamps.
- A forgiving off-center tap healed one cut and left the others.
- Healing a painted cut preserved paint mute and source pitch; a far tap changed no cuts.
- Shared source phase stayed zero and transport continued.
- Handle tap revealed actions; handle drag moved the whole toy without changing notes or the action row state.
- Two Simple Draws kept independent tools and both action rows open; collapsing one left the other open.
- Existing Flash Circle alongside Simple Draw confirmed the shared circular handle/control language.
- Reload restored canonical cuts/paint/bounds; Open/Close used normal internal editors.
- A coarse backtracking swipe on the curved second line cut its three nodes without affecting the first toy.
- No browser errors were recorded.

Evidence is under `resources/debug-output/simple-interaction/`. The changes do not introduce a new silence data shape, runtime harmony path, duration rule, scheduler, layout engine or ownership mechanism.
