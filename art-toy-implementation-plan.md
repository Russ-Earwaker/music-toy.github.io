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

### Technical goals

* Create a shared **BaseArtToy** layer (similar intent to `BaseMusicToy`) that provides:
  * consistent drag + selection affordances
  * contextual button reveal / hide rules
  * internal-board creation and lifecycle
  * internal-board “home anchor” + glow
  * persistence hooks for refresh and save/load (external + internal state)
* The Flash Circle art toy should be implemented **by composing BaseArtToy**, not as a one-off.

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

* (add entries as we implement)

---

## 7. Investigated and Rejected ❌

* (add entries as we reject approaches)

---

## 8. Key Learnings 🧠

* (keep to 5–10 items)

---

## 9. Next Steps 🎯

1. **Step 0**: Recon current Create Art plumbing + persistence modules (refresh + save/load).
2. **Step 1**: Wire the Art catalog into the existing Create Art palette (populate menu).
3. **Step 2**: Implement `BaseArtToy` + `FlashCircleArtToy` spawn/render.
4. **Step 3**: Add handle drag + tap-to-reveal buttons (Enter / Random All / Random Music).
5. **Step 4**: Implement internal board lifecycle + first-enter default toy spawn (DrawGrid / Simple Rhythm only).
6. **Step 5**: Add internal anchor + glow + Return Home behavior.
7. **Step 6**: Wire art-toy persistence into refresh + save/load slots.
