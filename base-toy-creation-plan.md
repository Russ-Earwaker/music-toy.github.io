# BaseMusicToy Creation Plan

*(DrawGrid-led, performance-safe, battle-tested)*

## Purpose

Create a shared **BaseMusicToy** layer that handles all non-creative infrastructure for music toys, so that:

* every toy behaves consistently under zoom, pan, overview, and perf pressure
* performance improvements are structural, not per-toy hacks
* new toys are fast to build and hard to accidentally regress

**DrawGrid is the reference implementation.**
Other toys (LoopGrid, future toys) must *conform* to its proven patterns.

---

## Core principles (locked)

These came directly out of this session — don’t violate them later.

### 1. DrawGrid sets the standard

* If DrawGrid does it a certain way, that’s the “correct” way.
* LoopGrid is for *proving generality*, not inventing architecture.
* Base systems are extracted **from DrawGrid**, not designed in isolation.

### 2. Base owns *when*, toys own *what*

BaseMusicToy is responsible for:

* **when** something renders
* **when** a resize happens
* **when** redraw is allowed or skipped
* **when** quality tiers apply

Toys are responsible for:

* drawing visuals
* toy-specific state and logic
* deciding *what* to draw when asked

### 3. No cadence degradation

From the performance philosophy:

* No frame skipping
* No modulo updates
* No “every N frames” hacks
* Performance wins come from *less work*, not slower clocks

Gesture-time raster reduction (DPR / backing store) is allowed.
Skipping time is not.

### 4. Event-driven redraws must be complete

If a visual changes over time (decay, pulse, flash, animation):

* the system **must explicitly request redraw**
* redraw intent must defeat early-out gating
* scheduler must see it **before** deciding to skip

This is where LoopGrid froze — and where the architecture was corrected.

---

## What we successfully extracted (current state)

These are now **real, proven base systems**, not theory:

### Lifecycle & sizing

* `createToyCanvasRig`
* `resizeCanvasForDpr`
* `effectiveDpr`
* `canvasBackingStore`
* `syncCanvasesCssSize`
* `overlayResizeGate`
* `waitForStableBox`

### Scheduling & redraw

* `createGlobalPanelScheduler`
* `createToyRelayoutController`
* `createToyDirtyFlags`
  **Important learnings:**

  * helper object must never be overwritten by state
  * `dirty.redraw` must map to `forceNudge` *same frame*

### Visibility

* `createToyVisibilityObserver` (IntersectionObserver, 3-state)
* `createToyVisibleCounter` (global visible count, detach-safe)

### Quality & tiers

* Tier plumbing extracted, still toy-owned tables
* Hard DPR clamp (`maxDprMul`) is mandatory
* Soft resScale is allowed but insufficient alone

### Debug discipline

* Debug flags must be:

  * off by default
  * cheap when disabled
  * scoped (no global spam)
* Scheduler catch blocks should log only under debug flags

---

## Architectural rules (now explicit)

These are **non-negotiable** for future toys.

### Single truth points

Every toy must have:

* **one** backing-store sizing truth point
* **one** relayout truth point
* **one** scheduler entry point

No duplicate resize logic. No shadow RAFs.

### Dirty flags are authoritative

* Redraw intent flows:

  ```
  toy event → dirty.requestRedraw →
  scheduler.consume() →
  render(forceNudge=true)
  ```
* Render gating must always respect dirty.redraw.
* Legacy flags (`__loopgridNeedsRedraw`) are transitional only.

### Scheduler decides

* Transport-driven redraw belongs in the scheduler, not render().
* Render() may *request future redraw*, but cannot rely on it for the current frame.

---

## Immediate next steps (do these next)

### Step 1 — Update the plan file (now)

Replace the old rough notes with this document (or a cleaned version of it).
This becomes the canonical **BaseMusicToy plan**.

---

### Step 2 — Finish LoopGrid’s migration cleanly

You fixed the freeze; now finish the job:

* Remove remaining legacy redraw flags once stable
* Make `dirty.redraw` the only redraw signal
* Keep debug hooks for one more session, then strip them

Outcome: LoopGrid fully conforms to the base redraw + scheduler model.

---

### Step 3 — Make DrawGrid consume *all* base systems

DrawGrid already inspired them — now it should *use* them consistently:

Audit DrawGrid for:

* any remaining local RAFs
* any local resize/DPR math
* any visibility or dirty logic not routed through base

Goal:

> DrawGrid becomes a **thin creative layer** on top of BaseMusicToy.

---

### Step 4 — Lock a “New Toy Template”

Create a short checklist / skeleton:

* required base imports
* required truth points
* required tier table (with maxDprMul)
* required perf validation steps

This prevents architectural drift later.

---

## Validation loop (keep doing this)

Every base extraction or migration:

1. Quick visual sanity (zoom, pan, overview, randomise)
2. Run the same Perf Lab baselines
3. Check **nonScript** deltas, not averages
4. Only then proceed

---

## Key takeaways from this session (worth remembering)

* Event-driven rendering is fragile unless redraw intent is wired end-to-end
* Scheduler timing matters more than render logic
* Base abstractions must be *boring* to be safe
* DrawGrid already solved most of this — the work is extraction, not invention

---
