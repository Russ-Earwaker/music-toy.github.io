# Art Toys Implementation Plan

## How to update this document

As we complete or reject work, update these sections in order:

1. **Completed Work ✅** — bullet: *what changed*, *where*, *how verified* (visual repro / Perf Lab tag if relevant).
2. **Investigated and Rejected ❌** — bullet: *why rejected* + *evidence*.
3. **Key Learnings 🧠** — keep this tight: the facts currently driving decisions.
4. **Guidelines / Constraints (Locked In)** — only edit if we agree a rule changes.
5. **Next Steps 🎯** — short ordered list; each step should have a concrete repro / test.

---

## 1. Hard Constraints (Locked In)

* **No main-board visual updates while inside an Art Toy**
  * Main board should not animate, re-render, or respond to input while an internal board is active (audio may continue).
* **Internal board feels identical to main board**
  * Same pan/zoom behavior, same UI buttons, same interaction style.
* **Art toys are containers first**
  * The first deliverable is a **BaseArtToy** ("flash circle") that establishes shared container logic for future art toys.
* **No always-visible buttons on art toys**
  * Art-toy buttons only appear after tapping the **draggable header/handle** area.

---

## 2. Goals (updated)

### UX goals

* Add a new button under **Create Toy**: **Create Art**
  * Uses `assets/UI/T_ButtonArtMenu.png`
* Spawn at least one art toy: **Flash Circle** (placeholder outer visual).
* **Drag behavior matches other toys**
  * Art toy can be moved by **tap + hold + drag** on a dedicated draggable area (like toy headers).
* **Tap-to-reveal controls**
  * Tapping the draggable area reveals contextual buttons:
    * **Enter** — open internal board
    * **Random All** — randomise all art-toy elements (outer visual + internal default content as appropriate)
    * **Random Music** — randomise internal music only (without changing outer art state)
* **First enter spawns a default empty internal toy**
  * On first entry only, spawn an “empty” internal music toy (exact toy depends on art-toy type).
  * For now: **limit to `DrawGrid` and `Simple Rhythm` only.**
* **Board anchor + return-home flow**
  * Each art toy owns an **internal-board anchor** that acts as the “home” camera target inside its internal board.
  * The existing **board anchor glow** exists and points to this anchor.
  * Clicking **Return Home** inside an internal board returns you to the **internal-board anchor** (not the external toy position).
* Add two new art toys that react to internal note triggers:
  * **Fireworks Art Toy**
    * 8 predefined firework positions.
    * Each position maps to one note slot/column.
    * On note trigger, spawn an explosion burst at that position.
  * **Laser Trails Art Toy**
    * 8 predefined laser emitters.
    * Each emitter maps to one note slot/column.
    * On note trigger, emit a short-lived laser line with limited max length, traveling along a wiggly path.

### Technical goals

* Create a shared **BaseArtToy** layer (similar intent to `BaseMusicToy`) that provides:
  * consistent drag + selection affordances
  * contextual button reveal / hide rules
  * internal-board creation and lifecycle
  * internal-board “home anchor” + glow
  * persistence hooks for refresh and save/load (external + internal state)
* The Flash Circle art toy should be implemented **by composing BaseArtToy**, not as a one-off.

### Base Art Toy goals (shared logic)

* Add a reusable **Base Art Toy** container that future art toys can share.
* Base art toys have **no always-visible buttons**.

  * User taps the toy’s **handle** to reveal contextual buttons.
  * User can **drag** the toy by the handle (tap + hold + drag), like music toy headers.
* Buttons are consistent with music toys (custom circular buttons + icon PNGs).

  * **Enter** (`T_ButtonEnter.png`)
  * **Random All** (`T_ButtonRandom.png`)
  * **Random Music** (`T_ButtonRandomNotes.png`)

---

## 3. Proposed Architecture (updated)

### 3.1 New concepts

* **BaseArtToy (board object)**
  * Has world position/size (for the main board).
  * Has an **internalBoardState** (a full mini-board state container, same schema as a normal board).
  * Has a lightweight **outer visual** (flash circle for now).
  * Has a **draggable handle rect** (header-style area) used for:
    * dragging
    * tapping to reveal buttons
  * Owns an **internalBoardAnchor** (position/zoom target inside internal board).
  * Exposes actions:
    * `enterInternalBoard() / exitInternalBoard()`
    * `ensureInternalDefaultToy()` (first-enter bootstrap)
    * `returnHome()` (snap internal camera to internal anchor)
    * `randomAll()` / `randomMusic()`

* **Board Context Manager**
  * Controls whether we are interacting with:
    * `MAIN_BOARD`
    * `INTERNAL_BOARD (artToyId)`
  * Routes:
    * Input events
    * UI target (which board buttons operate on)
    * Render loop (which board gets drawn)

### 3.2 Persistence contract

* Art toy state must survive:
  * page refresh
  * save/load slots
* Persist at minimum:
  * external art-toy transform (pos/size)
  * art-toy kind + art-specific state
  * internal board state (including toys, edges, camera, selections)
  * internal anchor (position + zoom target)
  * “first enter done” (so we don’t respawn the default toy repeatedly)

### 3.3 Shared-base rules (align with BaseMusicToy + Perf Plan)

These are *not optional* — they prevent the same class of bugs we already fought in music-toy land.

* **Base owns _when_, toy owns _what_**
  * BaseArtToy decides: when to redraw, when to resize, when to apply quality tiers, when input is routed to internal vs external.
  * The concrete art toy (Flash Circle, future toys) decides: what to draw + toy-specific state.
* **No cadence degradation**
  * No modulo updates, no frame skipping, no “every N frames”.
  * Performance wins come from *less work*, not slower clocks.
  * Gesture-time raster reduction (DPR / backing store) is allowed.
* **Event-driven redraws must be complete**
  * If an art visual animates (flash/decay/pulse), it must explicitly request redraw so the scheduler can’t early-out.
* **Dirty flags are authoritative**
  * If something changed, mark it dirty; do not “hope the next frame catches it”.
* **Scheduler decides**
  * Use the existing board render scheduling / gating; don’t add a second private RAF loop inside art toys.
* **Visibility + freeze rules are structural**
  * When internal board is active: main board must be fully frozen (no draw, no input).
  * When an art toy is offscreen: avoid doing per-frame work unless it must affect audio.

---

## 4. Step-by-step Implementation Plan (updated)

### Step 0.5 — Shared data reuse contract for multi-art-toy note routing (NEW, do this first)

**Outcome**
* New art toys reuse the existing internal-note -> art-owner routing data instead of introducing toy-specific event plumbing.
* One shared “8-slot trigger model” is defined and reused by Flash/Fireworks/Laser toys.

**Implementation sketch**
* Reuse existing ownership + routing primitives:
  * `data-art-owner-id`
  * internal owner resolution (`getInternalPanelsForArtToy`, owner lookup paths)
  * existing note-forwarding hooks already used by flash behavior.
* Define a shared trigger payload contract for art visuals:
  * stable slot index (`0..7`)
  * trigger strength/velocity (optional)
  * timestamp (for animation scheduling)
* Add a shared helper in `src/art/` for:
  * mapping note events -> slot index
  * per-art-toy trigger fanout
  * no duplicate listeners per toy instance.
* Explicitly avoid copy/paste listeners inside each new art toy implementation.

**Verify**
* One trigger path drives all art toy visual reactions.
* Existing Flash Circle still reacts correctly after refactor.
* No regression in refresh/save/load ownership resolution.

### Step 0 — Recon + map the current spawn + persistence flows (confirm what already exists)

**Outcome**
* Identify exactly where Create Toy / Create Art UI is built and how it spawns toys.
* Identify where refresh + save/load persistence serialises board objects.

**Likely files**
* `src/toy-spawner.js` (Create Toy + **Create Art** palette dock is already here; `configArt` is currently a stub)
* Board model + persistence modules (search: `save`, `load`, `serialize`, `scene`, `slot`)
* `src/persistence.js`, `src/scene-manager.js` (slot UI + localStorage backend)

**Deliverable**
* Notes in this doc: where to wire the art catalog + how to register art toys for persistence.

---

### Step 1 — Confirm Create Art UI + wire the Art catalog

**Outcome**
* **Create Art** button is present and working (it already exists in `src/toy-spawner.js`).
* Clicking it shows an **Art Palette** populated from an art catalog (currently empty stub in the spawner; real catalog is in `src/art/art-toy-factory.js`).

**Implementation sketch**
* Keep `src/toy-spawner.js` structure (it already supports `activePalette: 'music' | 'art'`).
* Provide `configArt.getCatalog()` + `configArt.create()` via a registration/init call (mirror how music toys register their catalog).

**Verify**
* Create Art menu opens and shows at least **Flash Circle** entry.

---

### Step 2 — Introduce BaseArtToy + Flash Circle implementation

**Outcome**
* You can spawn a **Flash Circle** art toy onto the main board.
* It renders a cheap outer circle (no interactions yet beyond drag + tap-to-reveal).

**Notes / Implementation detail**

* Use `src/art/base-art-toy.js` for shared behaviors (handle + contextual controls + drag).
* Use `src/art/art-toy-factory.js` as the minimal factory hooked to the spawner.

**Implementation sketch**
* Add/extend `src/art/`:
  * `base-art-toy.js` — shared container logic
  * `art-catalog.js` — list of art toy types (or keep in `art-toy-factory.js`)
  * `art-toy-spawn.js` — spawn/register into board state
  * `flash-circle-toy.js` — art-toy-specific visuals/state (composes BaseArtToy)
* Define a new board object type, e.g.:
  * `type: 'artToy'`
  * `artKind: 'flashCircle'`

**Verify**
* Spawn works.
* Render works.
* No perf regressions (Perf Lab sanity run if needed).

---

### Step 7 — Add Fireworks Art Toy (8-slot burst visual)

**Outcome**
* New art toy type: `fireworks`.
* 8 fixed burst anchors in panel-local coordinates.
* Note slot `i` triggers burst at anchor `i`.

**Implementation sketch**
* Implement as BaseArtToy composition (same controls + internal board behavior).
* Add firework visual state with pooled particles/sprites (no unbounded allocations).
* Use shared trigger contract from Step 0.5.
* Keep animation scheduler-compatible (dirty flags / no private perpetual RAF loop).

**Verify**
* Manual/internal random patterns produce repeatable bursts at mapped positions.
* Multiple rapid triggers do not leak particles or frame time.

---

### Step 8 — Add Laser Trails Art Toy (8-slot wiggly beam visual)

**Outcome**
* New art toy type: `laserTrails`.
* 8 fixed emitter anchors.
* Note slot `i` emits a laser from emitter `i` with:
  * max segment length cap
  * wiggly path progression
  * finite lifetime/fade.

**Implementation sketch**
* Implement as BaseArtToy composition.
* Reuse shared trigger contract from Step 0.5.
* Laser update model:
  * deterministic seed per trigger (stable visual behavior)
  * bounded per-frame work (cap active beams)
  * length clamp enforced in world/panel space.

**Verify**
* Each of 8 slots drives the expected emitter.
* Laser path is visibly wiggly, remains length-limited, and cleans up correctly.

---

### Step 3 — Drag handle + tap-to-reveal buttons

**Outcome**
* Art toy can be dragged by tap-hold-drag on its handle area (header-style).
* Tapping the handle toggles contextual buttons:
  * Enter
  * Random All
  * Random Music
* Buttons are not “always visible”.

**Implementation sketch**
* Reuse the established “toy header drag” input pattern from existing toys:
  * hit-test handle rect
  * capture pointer during drag
  * ensure correct coordinate transforms for zoom/pan
* Add a small per-toy UI state:
  * `controlsVisible` with auto-hide rules (e.g. tap elsewhere hides)

**Verify**
* Drag matches other toys (no offset/scaling weirdness).
* Buttons appear only after tap.
* Buttons do not break zoom/pan or click capture.

---

### Step 4 — Internal board lifecycle + first-enter default toy bootstrap

**Outcome**
* Enter opens the art toy’s internal board.
* On first enter only:
  * spawn a default empty internal music toy (DrawGrid or Simple Rhythm only for now).
* Exit returns to main board.

**Implementation sketch**
* On `enterInternalBoard()`:
  * switch board context to `INTERNAL_BOARD(artToyId)`
  * create internal board state if missing
  * call `ensureInternalDefaultToy()` once
* Default toy selection:
  * store `defaultInternalToyKind` on the art toy (for now, only `drawgrid` or `simpleRhythm`)

**Verify**
* First enter spawns exactly one default toy.
* Subsequent enters do not spawn duplicates.
* Internal board feels identical to main board.

---

### Step 5 — Internal anchor + glow + Return Home behavior

**Outcome**
* Inside an internal board:
  * there is a “home” anchor position/zoom target
  * board anchor glow points at it
  * pressing Return Home snaps camera to the anchor

**Implementation sketch**
* Store an `internalBoardAnchor` object:
  * position in internal-board world space
  * optionally a preferred zoom
* Hook Return Home button to:
  * `activeBoard.returnHome()` (context-sensitive)
* Ensure glow rendering exists for internal boards, not just the main board.

**Verify**
* Return Home consistently returns to the internal anchor (not external toy pos).
* Glow points to the anchor.

---

### Step 6 — Persistence: refresh + save/load slots

**Outcome**
* Art toys and their internal boards persist across:
  * refresh
  * save/load

**Implementation sketch**
* Register art toys in the same persistence pipeline as music toys.
* Ensure internal-board state is serialised/deserialised with stable IDs.
* Keep schema forward-compatible:
  * unknown art toy kinds should degrade gracefully (placeholder)

**Verify**
* Refresh: state survives.
* Save/load: state survives (including internal toy contents and anchor).

---

## 5. Performance & Stability Notes (updated)

* **Internal board should reuse existing board code**, not fork it.
  * Goal: “same interaction style” comes for free.
* **Freeze means freeze**
  * Ensure we skip:
    * main board animation ticks
    * main board canvas redraws
    * any per-frame DOM writes tied to main board
* Keep outer visuals extremely cheap:
  * Flash circle should be a single draw call + a short-lived timer.
* BaseArtToy should follow the same “base owns when, toy owns what” rule as BaseMusicToy.

---

## 6. Completed Work ✅

* **Art palette + spawn pipeline (Flash Circle)**

  * Added an art catalog and factory that can spawn a placeholder **Flash Circle** art toy.
  * Verified by spawning from the Art palette and seeing `[ToySpawner] spawnAtDefault art flashCircle` and `[ArtToyFactory] create flashCircle` logs.
  * Files:

    * `src/art/art-toy-factory.js`
    * `src/toy-spawner.js`

* **Base Art Toy shared container**

  * Implemented shared Base Art Toy UI:

    * Handle element
    * Contextual controls host (hidden until handle tap)
    * Drag by handle using pointer capture
    * Outside click hides controls
    * Tap-release vs drag behavior: tap shows controls; drag preserves current controls visibility
  * Verified by dragging the art toy around and tapping the handle to show/hide controls.
  * File:

    * `src/art/base-art-toy.js`

* **Spawn placement avoids board anchor + handle hit testing**

  * Adjusted default spawn position so art toys do not land on top of the board anchor/glow.
  * Ensured the handle is reliably clickable (pointer events not eaten by anchor/glow).
  * Verified by spawning multiple times and confirming the toy appears offset from the anchor area.
  * File:

    * `src/art/art-toy-factory.js`

* **Handle hover highlight (affordance)**

  * Handle visually “lights up” on hover to show it is the draggable hot-zone.
  * File:

    * `style.css`

* **Contextual buttons use existing circular button style + icon PNGs**

  * Replaced plain buttons with the same `.c-btn` structure used in music toys.
  * Wired icon PNGs:

    * Enter: `assets/UI/T_ButtonEnter.png`
    * Random: `assets/UI/T_ButtonRandom.png`
    * Random music: `assets/UI/T_ButtonRandomNotes.png`
  * File:

    * `src/art/art-toy-factory.js`

* **External “Random Music / Random All” now works for DrawGrid before first enter**

  * Fixed the issue where clicking Random from the **external** art-toy controls produced **no audible pattern** until entering the internal board.
  * Verified via repro:
    * spawn new art toy
    * press Random externally → DrawGrid now generates a pattern and plays (no need to enter first)
    * entering internal preserves the generated pattern (no “it only appears on enter” behavior)
  * Key technical changes (high-level):
    * ensured internal default toy exists before randomising
    * improved pending/defer logic so we can still produce “instant music” even when internal board is not active
    * removed/avoided `display:none` for hidden internal toys where it breaks DrawGrid headless operation
    * DrawGrid start path differs from toys with `__toyApi.start()` — accounted for in the external-random flow

* **Art-random debug instrumentation (gated)**

  * Added a gated debug mode to trace the entire “Random” story end-to-end:
    * click → internal toy spawn → panels enumerated → defer/pending decisions → applyPending on enter → start attempts
    * DrawGrid note-dump probes to confirm whether randomisation actually created notes
  * Enabled with: `window.__MT_DEBUG_ART_RANDOM = true`
  * This debug was used to isolate:
    * defer/pending being the reason external random produced no tune
    * DrawGrid start API differences (no `.start()` on `__drawToy`)
    * hidden/layout constraints (display:none breaks headless/random)

* **DrawGrid random semantics parity (external art controls)**

  * External **Random Music / Random All** for art toys now use DrawGrid’s full random-line behavior (8-step sequence + silences), matching in-toy Random behavior.
  * Verified by repeatedly randomising externally and confirming full multi-step sequences are generated (not single-note output).
  * Files:

    * `src/drawgrid/drawgrid.js`

* **Internal DrawGrid render/layout stability fixes**

  * Fixed internal-entry cases where DrawGrid rendered as a dot or disappeared after re-entry.
  * Added robust hide/show style snapshot/restore for internal panels and forced DrawGrid resnap/redraw after board-context swaps.
  * Updated internal camera centering/zoom defaults for deterministic first-enter positioning.
  * Verified across flows:
    * enter without random
    * enter after random
    * exit and re-enter (toy remains visible and correctly placed)
  * Files:

    * `src/main.js`
    * `src/drawgrid/dg-layout.js`
    * `src/drawgrid/dg-resnap.js`
    * `src/drawgrid/dg-randomizers.js`

* **Exit camera drift/jump fixes**

  * Fixed external-board position/scale jump after exiting internal board (including random-triggered path).
  * Restored viewport CSS vars with px units and synced coordinator live state via immediate + next-frame hard set.
  * Verified: art toy no longer grows/shifts after exit.
  * Files:

    * `src/main.js`
    * `src/board-viewport.js`

* **External random no longer auto-plays the scene**

  * Pressing **Random Music / Random All** on an art toy while transport is stopped no longer auto-starts playback.
  * Randomisation still applies; playback starts only when user explicitly presses Play.
  * File:

    * `src/main.js`

* **Internal Return Home now targets internal anchor**

  * Return Home button now respects internal-board context:
    * in main board: still centers on global board anchor
    * in internal board: centers on the active art toy’s internal home anchor/zoom
  * Added internal-home API on `window.__ArtInternal` and wired `board-anchor` to use it when internal mode is active.
  * Files:

    * `src/main.js`
    * `src/board-anchor.js`

* **Step 0.5 started: shared art-trigger contract + router**

  * Added a shared art trigger router that normalizes note/step input into a single payload contract (`artToyId`, `toyId`, `panelId`, `slotIndex 0..7`, `note`, `velocity`, `timestamp`).
  * Refactored existing Flash Circle trigger path to route through this shared contract instead of toy-specific forwarding logic.
  * Exposed shared routing hooks for future art toys (`emitTriggerFromPanel`, `emitTriggerFromToyId`, `onTrigger`) on `window.__mtArtToys`.
  * Files:

    * `src/art/art-trigger-router.js`
    * `src/main.js`

---

## 7. Investigated and Rejected ❌

* (add entries as we reject approaches)

* **“Just retry randomisation N times” as a primary fix**

  * Retrying helped prove timing vs state issues, but did not address the real root causes on its own:
    * DrawGrid init/start semantics differ from LoopGrid/Simple Rhythm
    * `display:none` panels cannot behave headlessly
  * Kept a single-frame retry concept only as a *diagnostic / safety net*, not as the core solution.

---

## 8. Key Learnings 🧠

* Board zoom scale (`--bv-scale`) must be accounted for when converting pointer deltas into world-space drag deltas.
* Art toys should sit above anchor/glow visuals so the handle remains consistently clickable.
* Default spawning should avoid the center/anchor zone; “works in the lab” spawns on top of the anchor lead to confusing hit-testing failures.

* **Hidden internal toys must remain layoutable if we want “instant random”**
  * `display:none` breaks headless/random paths for canvas-heavy toys (DrawGrid).
  * Prefer offscreen + `visibility:hidden` + `pointer-events:none` when we need the toy to exist and respond to programmatic actions.

* **DrawGrid does not start the same way as `__toyApi.start()` toys**
  * Some toys expose a direct `start()` API; DrawGrid playback is transport-driven and requires the correct start pathway.
  * Our container-level “Random then Play immediately” needs to handle these differences explicitly.

* **Pending/defer behavior must preserve the UX promise**
  * If the user presses Random externally, they expect immediate audible feedback.
  * Defer logic should only delay the parts that truly require internal activation; music randomisation should still happen instantly when possible.

* **Hidden-host lifecycle must restore full style state**
  * Stashing internal panels offscreen is fine, but re-entry must restore all layout/visibility styles (not just display/pointer events) or panels remain invisible/off-canvas.

* **Internal camera must be computed after real panel dimensions settle**
  * First-enter camera can be wrong if computed before async toy init/layout finalizes.
  * A deterministic spawn + post-settle snap recenter eliminates drift and offscreen placement.

* **External random should be side-effect minimal**
  * Randomizing from art-toy external controls should not implicitly change global transport state.
  * Keep randomization and transport control decoupled.

* **Return Home is a context action, not a global constant**
  * In internal mode, anchor + zoom target should come from active art toy context rather than global `__MT_ANCHOR_WORLD`.

---

## 9. Next Steps 🎯

1. **Shared data reuse first (required before new art visuals)**
   * Define and implement one shared 8-slot note-trigger contract in `src/art/`.
   * Refactor existing flash reaction to use that shared path.
   * Confirm ownership resolution + routing stay stable across refresh and save/load.

2. **Fireworks Art Toy implementation**
   * Add `fireworks` catalog entry + factory create path.
   * Implement 8 mapped burst anchors and pooled burst rendering.
   * Validate trigger mapping against internal note events.

3. **Laser Trails Art Toy implementation**
   * Add `laserTrails` catalog entry + factory create path.
   * Implement 8 mapped emitters, wiggly travel, and strict max-length cap.
   * Validate cleanup/perf under dense note patterns.

4. **Persistence parity with music toys**
   * Confirm/finish refresh + save/load round-trip for:
     * art toy panel transform/state
     * internal-board toy graph + per-toy state
     * internal home anchor (`internalHomeX/Y/Scale`)
   * Add a regression checklist:
     * random externally, save, reload, enter internal, verify pattern/position/camera.

5. **Formalize internal home-anchor behavior**
   * Allow explicit user-set internal home anchor (instead of only computed default), then persist it.
   * Keep Return Home context-aware using that explicit anchor.

6. **Random All: art-parameter layer**
   * Implement art-visual state randomization in `randomizeArtToyStateStub` so Random All affects both music and outer art state.

7. **Note-play event forwarding + outer flash reaction**
   * Complete/verify event forwarding from internal toys to owning art toy and ensure flash rendering is deterministic under focus/overview/internal states.

8. **Defer: playhead offset investigation**
   * Known issue: on enter, DrawGrid playhead can appear offset relative to audible notes.
   * Park this until after container + random + persistence are stable.
