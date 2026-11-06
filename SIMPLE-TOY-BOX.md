# Simple Toy Box

The existing `toy-spawner.js` renders the Simple catalog as a fixed bottom-right Toy Box. Advanced mode retains its original catalog. `simple-toy-box.css` supplies the dark navy body, blue rim/glow, three-column grids, selection outlines, collapse header, and responsive layout. `simple-toy-preview.js` supplies decorative miniature SVGs. `simple-shapes.js` supplies shared Shape metadata and geometry for rendering, previews, bounds, and collisions.

## Catalog and creation

The Toy Box uses the existing `simpleCreationGroups()` view of the main toy catalog. Labels, categories, ordering, availability, active-mode getters, and actions come from that catalog. Existing `canCreateToy()` and palette filtering enforce the runtime preset. Shape choices pass a `shapeType` option through the same canonical `spawnAtDefault()` / `createToyPanelAt()` / board arming path. There are still nine main Toy Box entries, rather than six separate Shape toy systems.

Buttons call the existing entry action or `spawnAtDefault()` path, including the original physical-object arming behavior. Controller state remains authoritative for selection and onboarding. Non-Shape creation buttons cancel on a second click. Escape cancels creation. Equipping an instrument-paint tool cancels incompatible creation; choosing a Toy Box tool releases the paint tool. Selected-toy controls are not cleared by this coordination.

| Category | Three-column ordering |
| --- | --- |
| PLACE | Shape |
| TRIGGER | Ball, Gravity Ball, Ripple |
| LOOP | Paint |
| PLAY | Drum, Drum Set, String; Strum on the next row |

Simple Rhythm and other new toy types are excluded. The previous Simple Music launcher is hidden in Simple mode; the existing menu becomes the Toy Box rather than leaving two competing creation surfaces. Art retains its separate preset-controlled menu; closing it restores the Toy Box.

## Previews

| Toy | Miniature behavior |
| --- | --- |
| Shape | Actual geometry of the last active shape, with gentle idle motion |
| Ball | Origin, launched ball, one surface bounce |
| Gravity Ball | Angled origin, curved guide, rising/falling ball and low bounce |
| Ripple | Expanding circle reaches a pulsing target |
| Paint | Wiggly stroke reveals, pointer moves, musical nodes appear |
| Drum | One pulsing pad, tap mark, circular pulse |
| Drum Set | Three pads light in sequence |
| String | One divided string vibrates under a directional crossing |
| Strum | Four strings highlight sequentially under a directional swipe |

SVGs contain no interactive children and are hidden from assistive technology. CSS handles the looping animation: no preview RAF loops, timers, transport subscriptions, physics controllers, or BoardObjects. Collapsing/hiding the panel removes previews from rendering; document visibility pauses animations explicitly. Reduced motion removes animation while retaining representative SVG frames and selection feedback. Preview state is never persisted.

## Shape chooser

The final set is **Cube, Circle, Triangle, Diamond, Hex, Star**, in two three-column rows. Circle is the requested Sphere option, named for its actual 2D geometry; it does not roll or have its own gravity. All shapes have a similar 58×58 logical footprint. Their previews use the shared geometry and gentle idle motion; reduced motion leaves static silhouettes.

Click Shape to toggle the compact chooser to the left. Opening it does not select a shape or alter another active tool. Choosing a shape activates PLACE and leaves the chooser open. Choosing another shape switches PLACE immediately. Clicking the active shape deselects it, cancels PLACE/onboarding, and leaves the chooser open with no selected option. Board taps then behave normally.

Placement remains active for repeated copies. Closing the chooser preserves placement; reopening reflects the active choice. The main Shape button is selected only while placement is active and shows that shape's geometry. Its expanded border and the chooser's dashed keyboard-focus ring are visually distinct from selection. Escape cancels placement and closes the chooser. Selecting another Toy Box tool closes it and uses the existing controller cancellation paths. Board clicks and outside clicks do not dismiss it.

At phone widths, opening the chooser collapses the instrument Paint palette and positions the chooser above the remaining Paint handle so they remain usable together.

## Shared Shape architecture, collision and persistence

Shapes remain in the existing `boardPhysicalObjects` store under `kind:'cube'`, with an authored `shapeType` discriminator. This deliberately preserves IDs, Cube references, dragging, deletion, selection, hit feedback, and the existing `physicalObjects` project save path. Legacy saves without `shapeType` default to Cube; restore validates new shape IDs atomically. No project version bump or destructive migration is required. A save from this version preserves the six shape types; older application versions do not understand their new geometry.

Every shape receives the same `draggable`, `physicsBody`, `triggerReceiver`, and `pitchSource` capabilities. Pitch uses Cube's existing safe default assignment, independent of shape type. Shapes have no instrument-source capability or private scheduler. Their neutral body and shared hit response follow Cube; emitter instruments do not become persistent body colours.

| Shape | Collision representation |
| --- | --- |
| Cube | Existing axis-aligned rectangle and bounds |
| Circle | Circle, radius 29 at the default size |
| Triangle | Three polygon edges |
| Diamond | Four polygon edges |
| Hex | Six polygon edges |
| Star | Actual concave ten-edge outline, including recesses |

Ball and Gravity Ball reuse the swept finite-edge capsule primitive for polygons and the existing circle solver for Circle. Filled-interior overlap recovery prevents a ball starting inside a polygon from becoming trapped. Ripple uses nearest distance to the same polygon perimeter (zero inside), or circle/rectangle bounds. Ball radius naturally rounds vertex contacts; there is no bounding-box or convex-hull substitution for Star. Gravity retains the existing fixed integration interval; no new shape-specific musical rule was introduced. Live geometry cache invalidation includes the new geometry fields.

`runtime-config.js` derives the default `simpleShapes` flags from metadata. Both Normal and Simple Playtest enable all six. `canCreateShape()` filters the chooser and guards canonical factory creation; disabling the parent Shape toy hides all its choices. Existing saved objects are restored independently of creation availability.

## Verification

Focused Node coverage includes all shape metadata and bounds, legacy Cube compatibility, JSON save/reload per shape, movement/deletion, repeated placement, switching/deselection/open-without-selection, close/reopen/Escape, tool cancellation, individual preset filtering, and existing canonical creation paths. Each shape is tested with normal Ball, Gravity Ball, and Ripple for collision/crossing, receiver pitch, emitter timbre, and shared renderer hit feedback. Existing Bouncer playback/relaunch, Ripple loops, string receiver policy, paint, and runtime-preset regressions also pass.

Latest verification: **206 focused Node tests passed**, and the Chromium browser script passed without uncaught errors. The browser also flushes the real project autosave, reloads the page, and verifies that all six authored shape types survive.

Run `node tools/toy-box-qa.mjs` for the real Chromium checks. The exact persistent-chooser flow is automated: choose Cube, place three, switch to Circle, place two, deselect Circle, verify a board tap creates nothing, select Triangle, close the chooser, place it, reopen with Triangle selected, and switch to Ripple. The other three shapes are also placed through actual pointer events. Chromium then tests Ball/Gravity/Ripple geometry and pitch against each real placed receiver and roundtrips the actual shared physical-object save data. This trigger matrix invokes the production controllers/physics directly; it is not a human listening test. Shared hit-feedback rendering is verified in the Node interaction tests.

Browser checks also cover three-column layout, previews, Escape, paint coordination, reduced motion, collapse, Advanced switching, returning from Art, and leftward chooser bounds at 1440×900, 1024×768, 768×700, and 390×844. The narrow Toy Box scrolls. The phone-size app header remains crowded from existing global controls, outside this change.

Screenshots: [all six placed shapes](artifacts/toy-box/all-shapes.png), [Shape chooser with Triangle active](artifacts/toy-box/shape-choices.png), [open with no selected shape](artifacts/toy-box/no-active-shape.png), [1024px](artifacts/toy-box/width-1024.png), [768px](artifacts/toy-box/width-768.png), [390px](artifacts/toy-box/width-390.png), [reduced motion](artifacts/toy-box/reduced-motion.png). Browser results: [results.json](artifacts/toy-box/results.json), [per-shape trigger matrix](artifacts/toy-box/shape-trigger-results.json).

Existing unrelated paint work in the working tree was preserved.
