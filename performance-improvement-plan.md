# Performance Improvement Plan

## How to update this document

When we complete or reject work, update these sections in order:

1. **Completed Work ✅** — add a bullet with *what changed*, *where*, and *how verified* (Perf Lab tag / key metrics).
2. **Investigated and Rejected ❌** — record *why* it was rejected and what evidence (Perf Lab / visual regression).
3. **Key Learnings 🧠** — keep this tight: the 5–10 facts that currently drive decisions.
4. **Guidelines / Constraints (Locked In)** — only edit if we’ve agreed a rule is changing.
5. **Next Steps 🎯** — keep a short ordered list. Each step must be measurable in Perf Lab.

---

## 1. Hard Constraints (Locked In)

These are **non‑negotiable** and must guide all future optimisation work:

* **No intentional frame skipping**
  No modulo updates, no “every N frames” logic that affects perceived motion.

* **No gesture-specific visual degradation**
  Panning / zooming must not change visual quality or cadence.
  *Exception:* **load/FPS-based** quality reduction is allowed (device-agnostic), with hysteresis.
* **Smoothness > absolute detail**
  We may reduce *detail* (particle count, resolution, effect richness), but never cadence.
* **Rendering ≠ Audio**
  Render culling must not affect audio timing or scheduling (render-only decisions).

---

## 2. Completed Work ✅

### 2.1 Perf methodology & tooling

* Perf Lab auto / fast / saved runs are now the **canonical workflow**.
* Focus shifted from averages to:
  * **p95 / p99**
  * worst-frame spikes
  * “what changed” A/B variants with identical scene rebuilds.
* **Auto: Current Focus** established for fast iteration on gesture/compositor issues.
* Added **micro-marks** to isolate costs inside a single perf bucket:
  * `drawgrid.playhead.headerSweep`
  * `drawgrid.playhead.headerSweepVisual`
  * `drawgrid.playhead.spriteGet`
  * `drawgrid.playhead.drawImage`

* **Perf Lab now defaults to “clean” perf** (debug traces OFF during runs)
  * Disable noisy DG/FG debug flags by default in perf runs (avoids distorting results).
  * Trace output is buffered (not console-spammed) and summarized into each bundle meta.
  * Verified in latest focus bundle: trace summary included without “skip-not-ready” events.

* **Auto: Current Focus queue is now stable and repeatable**
  * Build once, run variants back-to-back:
    * Baseline focus
    * NoOverlays focus
    * NoParticles focus
  * MultiCanvas focus run is currently treated as “manual only” (was causing stalls / swamping signal).

* **Pressure-DPR verified as “actually engaging”**
  * Latest focus bundle shows pressure seen with min pressure multiplier � 0.608 (sawPressure: true).
  * This confirms pressure-based DPR is a viable lever (we’re not chasing a phantom).

### 2.2 Particle system refactor

* Particle fields centralised around `field-generic.js`.
* Emergency fade-out to zero particles implemented and verified.
* Particle budgets scale down under pressure and recover smoothly.
* Empty particle fields early-out (no useless ticking).

**Learning:** Particles amplify cost, but they are **not the primary root bottleneck** in our worst cases.

### 2.3 Static layer caching (DrawGrid)

* Grid + nodes treated as **static layers**.
* Static redraw only happens when explicitly marked dirty.
* Node/column flashes moved to overlays.
* Gesture-based redraw cadence removed.

### 2.4 Adaptive DPR & backing-store caps

* Added **size-based DPR caps** to:
  * `drawgrid.js`
  * `field-generic.js`
* Backing store constrained by:
  * pixel budget
  * max side length
  * hysteresis to avoid thrash
* `field-generic.js` is the **authoritative base** for particle field sizing.

### 2.5 Header sweep optimisation (DrawGrid playhead)

* Discovered (via micro-marks) that **header sweep was the dominant playhead cost** (not “4 glowy lines”).
* **Decoupled** header sweep into:
  * **visual-only sweep band** (cheap)
  * **force sweep** (expensive particle push)
* Made **force sweep** back off aggressively based on **FPS pressure**, and allow disabling under low FPS.
* Result: header sweep cost reduced to effectively negligible in focus runs (visual remains, force is load-gated).

### 2.6 DrawGrid Focus stabilisation (Gesture + Compositor)

**Status: COMPLETE / LOCKED IN**

**What changed**

* Eliminated resize churn across all DrawGrid canvases (no oscillating 1px resizes).
* Introduced **pressure-DPR** as a first-class system and verified it *actually engages* under load.
* Added **gesture-time backing-store DPR reduction**:

  * Separate multipliers for:

    * visual layers
    * static layers (grid / nodes / base)
  * Applied *only while gesture motion is active*.
* Static layers now remain visually stable while raster cost drops during motion.
* Overlay work is now:

  * bounded
  * predictable
  * no longer responsible for catastrophic p99 / worst-frame spikes.

**Where**

* `drawgrid.js`

  * Visual DPR reduction
  * Gesture-time static DPR reduction
  * Overlay gating + compositor stabilisation
* `perf-lab.js`

  * Stable, repeatable **Auto: Current Focus** queue
  * Back-to-back baseline focus runs (`P3fFocus`, `P3fFocus2`)

**How verified**
From latest **Auto: Current Focus** bundle:

* **Baseline focus (P3fFocus)**

  * avg â‰ˆ **21.4ms**
  * p95 â‰ˆ **33.4ms**
  * p99 â‰ˆ **33.5ms**
  * worst â‰ˆ **50.1ms**
* **Key result**

  * p99 collapsed onto p95
  * no >100ms compositor stalls
  * long-tail instability eliminated

**Conclusion**

> DrawGrid Focus performance is now **stable, bounded, and production-ready**.
> Further micro-optimisation here would be diminishing returns and higher regression risk.

### 2.7 Current focus results (Jan 31 2026)

From the latest **Auto: Current Focus** bundle:

* Baseline focus (P3fFocus):
  * avg � 23.39ms, p95 � 33.4ms, p99 � 50.1ms
* NoOverlays focus:
  * avg � 19.98ms, p95 � 33.4ms, p99 � 33.5ms
* NoParticles focus:
  * avg � 21.75ms, p95 � 33.4ms, p99 � 50.1ms

Interpretation: **Overlays strongly affect p99 spikes** and overall average; particles are secondary in this focus setup.
### 2.8 DrawGrid connector-line bugfix + cleanup (Feb 4 2026)

* Fixed a DrawGrid regression where connector lines could disappear or render offset after camera pan/zoom or when randomising.
* Removed hidden connector-layer gradient circles (they were always behind the orange square nodes).
* Verified via manual repro (new toy ? random; pan/zoom; warm refresh) + Perf Lab run perf-lab-results-2026-02-04T13-12-38-553Z.json.


---

## 3. Investigated and Rejected ❌

### 3.1 Frame-skipping / modulo updates

* Even subtle skipping produces perceptible “swimmy” feel.
* Rejected to preserve continuous motion.

### 3.2 Gesture-based quality changes

* Any degradation tied directly to zoom/pan felt wrong and noticeable.
* Rejected in favour of load/FPS-based, hysteretic control.

### 3.3 Freezing toys during viewport movement

* Breaks the “continuous surface” feel.
* Rejected.

### 3.4 “Visible panel count” as a scaling input

* Rejected because it’s device-dependent and mis-scales across machines (high-end PC vs older mobile).
* We now prefer **FPS/pressure signals**.

### 3.5 Flat layer experiments

* `FlatLayers` variants were catastrophically slow in focus tests and swamp the signal.
* Keep as a manual curiosity only; do not pursue as a primary direction.

### 3.6 Partial overlay disable variants (core/strokes)

* These variants were unstable / catastrophic in focus tests and not good isolation signals.
* Keep as manual buttons only until we understand why they explode.

### 3.7 Further DrawGrid Focus micro-optimisation

* Additional overlay micro-optimisation (per-layer dirty bits, deeper composite slicing) was considered.
* Rejected because:

  * p99 instability has already been eliminated
  * remaining worst-frame cost is bounded and rare
  * added complexity would risk regressions for minimal perceptual gain

**Decision**

> DrawGrid Focus is â€œgood enoughâ€. Lock it in and move on.

---

## 4. Key Learnings 🧠

### 4.1 The bottleneck is mostly **not JavaScript**

Perf Lab consistently shows high **`frame.nonScript`** (GPU/compositor/raster/driver time),
plus large worst-frame spikes. This implies we must prioritise:

* backing store size + DPR
* layer/compositor pressure
* canvas resize churn
* alpha-heavy blits / scaling

Latest focus bundle confirms this again: baseline `frame.nonScript` avg is ~49.5ms.

### 4.2 Micro-marks change the game

“Playhead is expensive” was too vague. Micro-marks revealed:
* The cost was primarily **header sweep forces**, not line drawing.
This lets us target the real work without degrading core visuals.

### 4.3 Playhead strategy matters

Separate playhead canvas has shown meaningful A/B differences in focus tests.
We must treat playhead rendering as a **compositor-cost lever** (without reducing quality unless FPS demands).

### 4.4 Particles are secondary right now

Particle simulation time is usually not the main budget consumer in worst scenes.
But particle *drawing* and field canvases can still contribute to `nonScript` via raster load.

### 4.5 Overlays are the clearest lever for p99 spikes (in current focus)

In the latest focus A/B:
* Disabling overlays reduced **p99** from ~50ms → ~33.5ms while keeping p95 about the same.
* Disabling particles did **not** improve p99 in this focus setup.

This strongly suggests we’re paying for:
* full-canvas overlay clears / composites, and/or
* “overlay always active” gating even when overlays are logically empty.

### 4.6 Pressure-DPR is confirmed real (so use it strategically)

Trace summary shows pressure engaged with min pressure multiplier � 0.608.
This is enough to justify building “pressure-first” solutions rather than scene heuristics.

### 4.7 Gesture-time DPR reduction is safe and effective

* Temporarily reducing backing-store resolution **during motion only**:

  * dramatically reduces compositor stalls
  * does **not** affect perceived smoothness
  * restores full quality cleanly on commit
* This is a superior strategy to:

  * frame skipping
  * gesture-specific logic
  * freezing renders

### 4.8 Bounded cost beats zero cost

* Overlays still cost *something* � but:

  * they no longer explode
  * they no longer dominate p99
* A known, bounded cost is preferable to fragile �clever� elimination.

### 4.9 Overlay presence must not imply overlay work

* �Layer is non-empty� must not be used as a proxy for �needs redraw�.
* `overlayDirty` must mean: **overlay core must be repainted**.
* Caching + invalidation is the correct model for overlay performance.

### 4.10 Freeze heavy overlay core redraw during gesture motion

* Pan/zoom gesture motion amplifies compositor cost.
* Freezing **heavy overlay core redraw** during gesture (unless correctness requires it) is safe and effective.
* This is consistent with our rule: **never change cadence; only reduce work**.

---

## 5. Guidelines / Constraints (Locked In) 🔒

* **Gesture-time backing-store degradation is allowed**

  * Only affects raster resolution, not cadence.
  * Must restore cleanly on gesture commit.
* **If p99 � p95, stop**

  * Further optimisation is optional and must justify regression risk.
* **Stability > cleverness**

  * Prefer simple, bounded systems over intricate micro-optimisations.
* **Prefer FPS/pressure inputs over scene heuristics**
  (avoid “visible count”, avoid “gesture mode” switches).
* **Degrade by detail, not cadence**
  Use hysteresis. If we must disable an effect under pressure, do it as a last resort.
* **Instrument before rewriting**
  If something is “surprisingly expensive”, add a micro-mark and verify the culprit.
* **Treat alpha-heavy tall sprites as risky**
  Avoid per-frame rescaling; make caches stable (quantization / reuse).

* **Overlay redraw must be event-driven**
  Overlay core redraw should only occur on true invalidation (flash/state change/UI refresh), not �layer exists�.

---

## 6. Next Steps 🎯

### ✅ DrawGrid Focus — DONE

Remove DrawGrid Focus from the active optimisation list.

### Next optimisation targets (ordered)

1. **Multi-toy scenes**

   * Validate compositor behaviour with many simultaneous toys.
   * Update **Auto: Current Focus** to be P6-based A/B isolates (baseline ? chains off ? LoopGrid render off ? overview toggles).
   * Keep **Run-Auto (Generic)** unchanged; it remains the broad regression check.
2. **Particle field under extreme load**

   * Mobile GPU limits
   * Very large boards
3. **Mobile Safari / low-end GPU validation**

   * Confirm pressure-DPR + gesture-DPR hold up on weaker devices.

---

## 7. Explicit “Do Not Regress” Rules

Any future optimisation must answer **yes** to all of these:

* Does motion remain continuous?
* Are quality changes gradual and hysteretic (FPS/pressure based), not gesture-based?
* Are we reducing *work*, not *cadence*?
* Are offscreen elements truly free?
* Did we verify with Perf Lab (p95/p99 and worst-frame)?

If not, it’s rejected.

---

## 8. One-Paragraph Handoff Summary (Updated)

> DrawGrid Focus performance is now stable and bounded. Resize churn has been eliminated, pressure-DPR is verified to engage, and gesture-time backing-store DPR reduction removes compositor stalls without affecting perceived smoothness. Long-tail p99 spikes (>100ms) are gone; p99 now aligns with p95. Overlays incur a known, bounded cost and are no longer a structural risk. Further DrawGrid Focus micro-optimisation was intentionally stopped to avoid regression risk. The performance effort now moves outward to multi-toy scenes, particle load under pressure, and mobile GPU limits.


