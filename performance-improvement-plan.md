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
  * Latest focus bundle shows pressure seen with min pressure multiplier ≈ 0.608 (sawPressure: true).
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

### 2.6 Current focus results (Jan 31 2026)

From the latest **Auto: Current Focus** bundle:

* Baseline focus (P3fFocus):
  * avg ≈ 23.39ms, p95 ≈ 33.4ms, p99 ≈ 50.1ms
* NoOverlays focus:
  * avg ≈ 19.98ms, p95 ≈ 33.4ms, p99 ≈ 33.5ms
* NoParticles focus:
  * avg ≈ 21.75ms, p95 ≈ 33.4ms, p99 ≈ 50.1ms

Interpretation: **Overlays strongly affect p99 spikes** and overall average; particles are secondary in this focus setup.

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

Trace summary shows pressure engaged with min pressure multiplier ≈ 0.608.
This is enough to justify building “pressure-first” solutions rather than scene heuristics.

---

## 5. New Guidelines ✅

* **Prefer FPS/pressure inputs over scene heuristics**
  (avoid “visible count”, avoid “gesture mode” switches).
* **Degrade by detail, not cadence**
  Use hysteresis. If we must disable an effect under pressure, do it as a last resort.
* **Instrument before rewriting**
  If something is “surprisingly expensive”, add a micro-mark and verify the culprit.
* **Treat alpha-heavy tall sprites as risky**
  Avoid per-frame rescaling; make caches stable (quantization / reuse).

---

## 6. Current Focus: What We’re Fixing Next 🎯

### Step 1 — Reduce `frame.nonScript` (compositor/raster pressure)

**Goal:** lower `frame.nonScript` in P3f focus scenes.

Actions (in order):
1. **Lock in and exploit confirmed pressure-DPR**
   * Pressure-DPR is confirmed engaging (min pressure mul ~0.608). Use this as a first-class lever.
   * Ensure “effective DPR” decisions apply to the *heaviest* raster surfaces (especially overlays).
2. **Stop paying overlay cost when overlays are logically empty**
   * Target: eliminate “always-on” overlay clear/core/flash passes during playback when nothing is flashing/previewing.
   * Use existing focus variants (NoOverlays / NoOverlayCore / NoOverlayStrokes) as isolation tools.
3. **Kill canvas resize churn**
   * Ensure we never resize to the same dimensions; stabilise rounding to avoid 1px oscillation.
4. **Offscreen render culling**
   * If a toy is fully offscreen: skip render + overlays + particles (audio unaffected).

Success criteria:
* `frame.nonScript` avg and p95 drop materially in focus runs.
* Worst-frame spikes reduce.
* p99 should follow the “NoOverlays” direction (goal: p99 closer to ~33ms than ~50ms in focus runs).

### Step 2 — Overlay/layer minimisation (only after Step 1)

* Detach / avoid compositing empty overlay canvases.
* Reduce number of simultaneously composited surfaces.
* Prefer “single overlay surface” approaches where viable.

NOTE: Step 2 only makes sense once Step 1 confirms overlays are not doing redundant per-frame work.

### Step 3 — Particle “ladder” under pressure

* Maintain consistent motion/response rules.
* Reduce particle count/density smoothly under pressure.
* Emergency brake: disable particle field only below hard FPS threshold (existing hysteresis).

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

## 8. One‑Paragraph Handoff Summary

> We removed gesture-based throttling and frame skipping, centralised particle logic, capped canvas backing stores, and introduced static layer caching. Micro-profiling revealed the playhead’s “header sweep” forces were a dominant cost; we decoupled it into a cheap visual sweep plus FPS-gated forces, making header cost negligible. Perf Lab still shows the main remaining bottleneck is `frame.nonScript` (GPU/compositor/raster). Next work focuses on proving pressure‑DPR is actually applied, eliminating resize churn, and implementing hard offscreen render culling—without affecting audio timing or perceived smoothness.
