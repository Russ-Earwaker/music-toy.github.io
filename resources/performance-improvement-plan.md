# Performance Improvement Plan

## Status Update, Learnings, and Next Steps

*(Updated after DPR capping, particle refactors, static layer caching, and multiple Perf Lab runs)*

---

## 1. Hard Constraints (Locked In)

These are **non-negotiable** and must guide all future optimisation work:

* **No intentional frame skipping**
  No modulo updates, no “every N frames” logic that affects perceived motion.
* **No gesture-specific visual degradation**
  Panning / zooming must not change visual quality or cadence.
* **Smoothness > absolute detail**
  We may reduce *detail* (particle count, resolution, effect richness), but never cadence.
* **Rendering ≠ Audio**
  Render culling must not affect audio timing or scheduling (render-only decisions).

---

## 2. Completed Work ✅

### 2.1 Performance methodology

* Perf Lab auto / fast / saved runs are now the **canonical workflow**.
* Focus shifted correctly from averages to:

  * **p95 / p99**
  * worst-frame spikes
* A/B tests established for:

  * particles on/off
  * overlays on/off
  * playhead separate canvas on/off

---

### 2.2 Particle system refactor

* Particle fields are now **centralised around `field-generic.js`**.
* Emergency fade-out to zero particles implemented and verified.
* Particle budgets scale down aggressively under pressure and recover smoothly.
* Empty particle fields early-out (no useless ticking).

**Learning:**
Particles amplify cost, but they are **not the root bottleneck**.

---

### 2.3 Static layer caching (DrawGrid)

* Grid + nodes are now treated as **static layers**.
* Static redraw only happens when explicitly marked dirty.
* Node/column flashes were decoupled from static redraw (moved to overlays).
* Gesture-based redraw cadence was removed.

**Learning:**
Caching only helps if *nothing else* keeps forcing redraws (flashes were the hidden culprit).

---

### 2.4 Adaptive DPR & backing-store caps

* Added **size-based DPR caps** to:

  * `drawgrid.js`
  * `field-generic.js`
* Backing store size is now constrained by:

  * total pixel budget
  * max side length
  * hysteresis to avoid thrashing
* Field-generic is now the **authoritative base** for particle field sizing.

**Learning:**
Huge canvases silently destroy performance via **non-script (GPU/compositor) cost**.

---

## 3. Investigated and Rejected ❌

These were tested or analysed and are **explicitly out of scope** going forward:

### 3.1 Frame-skipping / modulo updates

* Even subtle skipping produces a perceptible “swimmy” feel.
* Rejected to preserve continuous motion.

### 3.2 Gesture-based quality changes

* Any degradation tied to zoom/pan felt wrong and noticeable.
* Rejected in favour of load-based, hysteretic quality control.

### 3.3 Freezing toys during viewport movement

* Breaks the “continuous surface” feel.
* Rejected.

---

## 4. Key Learnings 🧠

### 4.1 The bottleneck is mostly **not JavaScript**

Perf Lab consistently shows:

* High `frame.nonScript`
* Large worst-frame spikes
* Limited gains from disabling particles alone

This strongly indicates:

* Canvas resize churn
* Backing-store allocation
* Compositor / layer pressure
* GPU stalls

---

### 4.2 Particle cost is secondary

* Reducing particles helps, but does **not** solve p95 / p99 spikes.
* The real enemy is *how much* we ask the browser to composite and raster.

---

### 4.3 Canvas & layer count matters enormously

* Even “empty” canvases have cost.
* Large, high-DPR backing stores are extremely expensive.
* Visibility and size matter as much as draw complexity.

---

## 5. Current Focus: What We’re Fixing Next 🎯

### Step 1 — Eliminate DOM writes inside RAF

**Problem**

* Small DOM mutations (e.g. pulse borders) inside RAF can trigger layout/style work.

**Goal**

* Make pulses event-driven:

  * add class once
  * remove once
  * no per-frame DOM writes

**Success**

* DOM-in-RAF traces collapse
* Worst-frame spikes reduce

---

### Step 2 — Kill canvas resize churn

**Problem**

* Repeated canvas resizes at identical sizes.
* Even a resize to the same dimensions reallocates backing stores.

**Goal**

* Resize only when:

  * CSS size actually changes, or
  * DPR target actually changes
* Stabilise rounding to avoid 1px oscillation during zoom.

**Success**

* Canvas resize count drops to near zero during pan/zoom
* `frame.nonScript` improves

---

### Step 3 — Hard offscreen render culling

**Goal**

* If a toy is fully offscreen:

  * skip render
  * skip particles
  * skip overlays
* **Audio continues unaffected**

This is the biggest remaining structural win and a clean step toward
**render-active vs audio-active separation**.

---

### Step 4 — Overlay & layer minimisation

Only after Steps 1–3:

* Hide or detach empty overlay canvases.
* Reduce composited layers.
* Constrain redraw regions where possible.

---

## 6. Explicit “Do Not Regress” Rules

Any future optimisation must answer **yes** to all of these:

* Does motion remain continuous?
* Are quality changes gradual and hysteretic?
* Are we reducing *work*, not *cadence*?
* Are offscreen elements truly free?

If not, it’s rejected.

---

## 7. One-Paragraph Handoff Summary

> We removed gesture-based throttling and frame skipping, centralised particle logic, capped canvas backing stores, and introduced true static layer caching. Perf Lab shows remaining bottlenecks are dominated by non-script GPU/compositor cost, not JS. Next work focuses on DOM-in-RAF removal, eliminating canvas resize churn, and hard offscreen render culling — all without affecting visual smoothness.

---

