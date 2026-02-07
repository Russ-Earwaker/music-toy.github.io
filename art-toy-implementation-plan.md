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

  * Main board should not animate, re-render, or respond to input while internal board is active (audio may continue).
* **Internal board feels identical to main board**

  * Same pan/zoom behavior, same UI buttons, same interaction style.
* **First pass: placeholder Art Toy only**

  * Simple circle that flashes on note-play from any internal music toy.

---

## 2. Goals

### UX goals

* Add a new button under **Create Toy**: **Create Art**

  * Uses `assets/UI/T_ButtonArtMenu.png`
* Art Toys are interactive “containers”.

  * User can drag/drop a **music toy** onto an art toy.
  * Dropping places that music toy **and its entire chain** inside the art toy.
* User can “enter” an art toy:

  * Tap art toy → click its **Music** button → opens **Internal Board** UI.
  * Internal Board has an **Exit** button.
  * While inside: user sees and can interact with internal music toys normally.

### Technical goals

* Art Toy owns an “internal board” scene graph/state that can host existing music toys without rewriting them.
* When not inside: internal toys still generate audio, but we do **not** need to render them.
* First-pass art toy visual reacts to internal note events (flash).

---

## 3. Proposed Architecture

### 3.1 New concepts

* **ArtToy (board object)**

  * Has world position/size (for the main board).
  * Has **internalBoardState** (a full mini-board state container).
  * Has a lightweight **outer visual** (placeholder circle).
  * Exposes actions:

    * `placeChainInside(chainRootToyId)`
    * `enterInternalBoard() / exitInternalBoard()`

* **Board Context Manager**

  * Controls whether we are interacting with:

    * `MAIN_BOARD`
    * `INTERNAL_BOARD (artToyId)`
  * Routes:

    * Input events
    * UI target (which board buttons operate on)
    * Render loop (which board gets drawn)

### 3.2 Minimal “note event” plumbing

* Add a small event channel:

  * `onNotePlayed({ toyId, note, vel, time })`
* Internal board forwards any internal toy note events to the owning ArtToy.
* ArtToy outer visual responds by flashing.

---

## 4. Step-by-step Implementation Plan

### Step 0 — Recon + map the current UI spawn flow

**Outcome**

* Identify exactly where Create Toy UI is built and how it spawns toys.

**Likely files**

* `src/toy-spawner.js` (this is the Create Toy dock/palette)
* Any board model/spawn code used by toy-spawner

**Deliverable**

* Notes in this doc: where to add Create Art button + how to open a new menu.

---

### Step 1 — Add “Create Art” button under “Create Toy”

**Outcome**

* UI shows a second button directly beneath Create Toy:

  * Label: “Create Art”
  * Icon: `assets/UI/T_ButtonArtMenu.png`

**Implementation sketch**

* Extend `src/toy-spawner.js` dock:

  * Add a sibling button below existing Create Toy button.
  * Clicking opens an **Art Palette** (similar structure to toy list, but art-toy entries).

**Verify**

* Visual: button appears, correct icon, correct placement.
* No regressions to Create Toy.

---

### Step 2 — Add an “Art Toy catalog” and spawn pipeline

**Outcome**

* Create Art menu can spawn at least one Art Toy: **Placeholder Flash Circle**.

**Implementation sketch**

* Add `src/art/` folder:

  * `art-catalog.js` — list of art toy types
  * `art-toy-spawn.js` — create art toy instance and register it into board state
* Define a new board object type, e.g.:

  * `type: 'artToy'`
  * `artKind: 'flashCircle'`

**Verify**

* You can spawn an art toy onto the main board.
* It renders as a circle.

---

### Step 3 — Implement drag/drop “place chain inside art toy”

**Outcome**

* Drag a music toy onto an art toy:

  * The music toy **and its chain** are moved into the art toy internal board.
  * They are removed from the main board.

**Implementation sketch**

* Detect drop target:

  * When ending a drag, hit-test art toys beneath pointer.
* Compute “entire chain”:

  * Reuse existing chain traversal helper(s) (search for existing chain utils; there is `src/drawgrid/dg-chain-utils.js` for drawgrid—there may be a generic equivalent; if not, add one).
* Move operation:

  * Remove toys + edges from main board state.
  * Add them into `artToy.internalBoardState` with positions adjusted:

    * First pass: preserve relative layout, recenter around internal board origin.

**Verify**

* After drop: toys vanish from main board (except the art toy).
* Audio from moved toys still plays (even when not inside).
* No duplicates, no orphan edges.

---

### Step 4 — Internal Board mode (enter/exit) + freeze main board visuals

**Outcome**

* Tap art toy → click Music → switch to internal board UI.
* Exit returns to main board.
* While inside internal board:

  * Main board does not visually update.
  * Main board does not accept input.

**Implementation sketch**

* Add a modal-like UI layer:

  * A full-screen internal-board viewport container.
  * An **Exit** button.
* Add a “board context” switch:

  * Render loop draws ONLY the active board.
  * Input handlers route ONLY to the active board.
* Freezing rule:

  * Main board render/update functions must be skipped while internal board is active.

**Verify**

* Enter/exit works repeatedly.
* While inside:

  * panning/zooming matches main board feel
  * normal UI buttons exist (plus Exit)
* Main board is visibly static while inside.

---

### Step 5 — Note event forwarding + placeholder flash reaction

**Outcome**

* When any internal toy plays a note:

  * Art toy circle flashes (outer visual), even when you are *not* inside.

**Implementation sketch**

* Pick the smallest reliable “note played” hook:

  * likely near the audio scheduling / note trigger code (e.g. something around `audio-core.js` / scheduler)
* For toys inside an art toy:

  * route their note events to the owning art toy (via board context lookup).
* Flash effect:

  * store `flashT` timer on art toy
  * outer draw uses `flashT` to modulate brightness/alpha for a short duration

**Verify**

* Drop a music toy chain into art toy.
* Start playback.
* Art toy circle flashes in sync with internal notes.

---

## 5. Performance & Stability Notes

* **Internal board should reuse existing board code**, not fork it.

  * Goal: “same interaction style” comes for free.
* **Freeze means freeze**

  * Ensure we skip:

    * main board animation ticks
    * main board canvas redraws
    * any per-frame DOM writes tied to main board
* Keep the placeholder art visual extremely cheap (single circle + flash timer).

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

1. **Step 0**: Identify exact insertion point in `src/toy-spawner.js` for Create Art button + how it opens menus.
2. **Step 1**: Implement Create Art button with `assets/UI/T_ButtonArtMenu.png`.
3. **Step 2**: Add art catalog + spawn placeholder flash-circle art toy.
4. **Step 3**: Implement drop-to-place-chain-inside (move graph from main board → internal board).
5. **Step 4**: Implement internal board mode + Exit + hard freeze main board visuals.
6. **Step 5**: Wire note-play event forwarding + flash reaction.

If you want, I can also turn this into a *task-by-task diff plan* (file list + exact functions to add/extend) keyed to your current project structure (now that I’ve seen `src/toy-spawner.js` exists and the art button asset is at `assets/UI/T_ButtonArtMenu.png`).
