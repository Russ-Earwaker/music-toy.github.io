# Container Toy foundation

Implemented a shared ownership/presentation layer, not a musical Structure type.
The ordinary graph remains the musical authority. The board projects that graph
as one container object; IN/OUT alias its existing entry/exit. This avoids
recompiling a wrapper into a new performance path or changing Heartbeat phase.

1. **Data model.** `src/container-toys.js` owns records shaped as follows:

   ```js
   {
     id: 'container-toy:1', version: 1, kind: 'container',
     internalObjectIds: ['A', 'B'], // musical toys and optional logic objects
     internalToyIds: ['A', 'B'],
     internalConnectionIds: ['connection:4'],
     ports: {
       input: {objectId: 'A', portId: 'input'},
       output: {objectId: 'B', portId: 'output'}
     },
     bounds: {x, y, width: 280, height: 140},
     layout: {A: {x, y}, B: {x, y}}, // relative to the wrapper
     presentation: {type: 'collapsed-graph', state: {open: false}},
     interactionData: null
   }
   ```

   There are no copied notes, patterns, instruments, musical definitions,
   source pitches, durations or transport clocks in this record.

2. **External IN/OUT and ownership.** The registered graph object exposes only
   `input` and `output`. Connection validation/dragging resolves these to the
   original endpoints, including cycle/capacity checks. Canonical connections
   retain their original IDs and endpoints in `connectionModel`. The projected
   board graph hides owned objects and internal wires and substitutes container
   endpoints for boundary wires. `boardGraph` supplies this same projection to
   layout, so the wrapper moves as one object. Each internal object has exactly
   one owner. Ownership is referenced, not a second copy of the composition.

3. **Scheduling, context and duration.** No container scheduler, event provider,
   private transport or runtime Structure was introduced. The existing compiler
   and chain adapter continue to receive the original graph, so occurrence paths,
   source phase, harmony, transpose, mute policy and linked definition IDs are
   unchanged. `durationOf` measures the owned subgraph using the existing
   `compileStructureGraph` and `createStructureRuntime`, excluding downstream
   objects outside the wrapper. Sequence/Repeat/modifier semantics remain those
   of the normal runtime; Together outside the container still takes its normal
   maximum child duration. Presentation data never overrides musical duration.

4. **Collapse, Open, Expand and layout.** The board has a minimal **Collapse
   Selection** checklist. Validation runs before any ownership mutation. The
   wrapper is placed at the selection's visual center. Open reveals the same
   normal editors inline while keeping the wrapper. Close hides them again.
   Node/pitch/rhythm editing uses the existing toy editors. Internal routing and
   logic-type conversion require Expand in this pass; socket detachment and
   internal connection deletion are guarded too. Expand removes only the wrapper
   and ownership, revealing the original graph. Wrapper movement translates all
   owned objects with their relative layout. It does not touch musical state.

5. **Persistence and deletion.** Scene snapshots add `containers` beside the
   ordinary `toys`, `structureToys` and `connections`. Internals are saved once
   through the ordinary paths. Restore installs canonical objects/connections
   first, validates ownership/mappings, then restores the wrappers and their
   presentation/interaction data. Invalid records are rejected, not repaired by
   inventing routes. Container Delete checks owned objects can be deleted, removes
   their normal editors/connections, and removes the wrapper. Direct deletion of
   an owned editor is blocked until Expand. No hidden owned objects are retained
   by successful container deletion.

6. **Presentation contract.** `src/container-presentations.js` defines
   `renderSurface(host, context)`, `handleInteraction(event, context)` and
   `mapInteractionToInternalEdit(intent, context)`. The context offers on-demand
   reads of canonical owned objects; mapped edits must target owned IDs and are
   applied through normal toy state APIs. `src/container-board.js` hosts these
   surfaces without knowing about scissors, paint, balls or ripples.
   `window.ContainerToys.registerPresentation(type, adapter)` exposes the hook.
   The default surface is intentionally only an organizational card.

7. **Art Toy audit.** Existing Art Toys already own ordinary musical panels by
   `dataset.artOwnerId`; those panels retain canonical IDs, toy state and graph
   wires. Art persistence is separate from normal musical toy persistence.
   `src/art/art-trigger-router.js` already routes canonical note/step admissions
   to an owner and eight visual slots. These are useful adapters for containers.
   Bespoke parts are `art-toy-factory.js`'s per-art surfaces and interaction state,
   the active-slot mapping in `main.js::syncArtToySlotsFromInternalNotes`, and
   `enterInternalBoard`/`exitInternalBoardImmediate`'s DOM/camera/board-identity
   swapping. `getArtToyPersistState` also stores art-specific state and home view.
   This pass does not rewrite them. The smallest migration is an ownership and
   presentation adapter plus the existing trigger router, retaining all musical
   IDs. Multiple independently rooted Art internals are a routing blocker: do not
   silently replace their looping semantics with Together or Sequence. Camera
   ownership, volume aliases, legacy saves, slot mappings and deletion require
   dedicated migration proofs before removing the current Art implementation.

8. **Simple Draw candidate.** Free Play already references canonical DrawGrids
   and reads their notes; its string geometry, scissors and paint are presentation
   and interaction metadata. A supported connected DrawGrid chain can already be
   collapsed without migration. A future `simple-draw` surface can read those
   same IDs and send edits through the current canonical silence/state commit.
   Remaining work is a board-local string surface, moving the currently
   first-grid-owned geometry/paint metadata to presentation ownership without
   duplicating it, and defining page-wide paint ownership across independent
   lines. The Free Play overlay, per-line grouping and shared transport controls
   remain as they are. No Bouncer/Ripple interaction was added.

9. **Linked copies and duplication.** Container linked definitions are deferred.
   Ordinary internal definition/instance identity is preserved, but shared or
   linked internal editors, generated linked Structure children, and auto-managed
   arrangements are excluded from this first pass. Owned editors cannot create
   linked copies through the normal board factories while contained. There is no
   container Duplicate or Create Linked Copy command: neither deep copying nor
   shared ownership is chosen implicitly. Future support needs separate shared
   container definitions and local views, an internal view-ID mapping, local
   boundary wires/position/context, and explicit delete/last-view rules using the
   existing linked-toy/Structure controllers.

10. **Supported boundary and limits.** A connected acyclic selection must have
    one entry and one exit, with at most one incoming and one outgoing external
    edge. Zero external output is supported for a terminal phrase (the requested
    Heartbeat → A → B proof); detached containers can also remain unpowered.
    Multiple external inputs/outputs, middle-node boundary wires, pattern-sharing
    wires, disconnected selections, cycles, nested containers, shared ownership,
    linked internals and Art-owned internals are rejected. The narrow internal
    graph is a single-entry/single-exit chain, optionally containing ordinary
    single-child logic objects. A complete Together tree with several terminal
    leaves is not yet supported as an internal selection: mapping its collective
    completion to one output needs a later explicit contract. Containers work
    under external Together (including parallel siblings), Sequence, Repeat,
    Chord Progression and Transpose. Open uses inline editors rather than a new
    sub-board; internal topology changes require Expand.

11. **Verification.** 176 targeted automated tests pass, including 16 new
    container tests. They compare scheduled event ticks, source pitches,
    occurrence paths, contexts, durations and runtime identity before/after
    Collapse/Open/Expand; exercise nested harmony/transpose/Repeat, parallel
    Together with a longer sibling, internal modifiers, fresh-scene JSON reload,
    ownership guards, routing rejection, deletion, layout and presentation edits.
    A separate existing quick-add test still fails because its expected sound
    state omits `registerOctaves: 0`; reproducing it with the unchanged HEAD
    connection model gives the same failure (six of seven quick-add tests pass).
    No quick-add implementation or assertion was changed for this foundation.

    Local Chrome QA created two normal canonical DrawGrids through Free Play,
    then collapsed, opened, closed, arranged, moved, saved/reloaded and expanded
    them through the board UI. Reload preserved both IDs, all thirteen authored
    notes, the original connection IDs, and container ownership. Across 415 real
    sampler admissions there were zero pitch mismatches, zero event-tick
    mismatches and zero duplicate admissions. Both grids retained phase zero and
    384-tick spans. No application errors were observed. These are scheduling
    admission captures, not microphone recordings; context combinations and
    deletion were verified automatically rather than all repeated in the browser.

    Evidence: [proof data](../resources/debug-output/containers/foundation-proof.json)
    and [collapsed surface](../resources/debug-output/containers/collapsed.png).

Implementation files: `container-toys.js`, `container-presentations.js`,
`container-board.js`, endpoint aliases/guards in `connections.js`, board projection
hooks in `connection-view.js` and `main.js`, persistence in `persistence.js`,
`tests/container-toys.test.mjs`, and the opt-in `?containerProof` DOM observer.
Earlier Free Play full-loop changes remain intact.
