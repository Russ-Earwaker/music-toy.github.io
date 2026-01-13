Got it. I’ve taken your **existing performance-improvement-plan.md** and folded in everything we’ve actually done, what we investigated and *explicitly rejected*, plus the concrete learnings from PerfLab. Below is an **updated plan** you can paste straight back into the document (or replace it entirely if you want a clean handoff).

I’m deliberately separating **Completed**, **Investigated & Rejected**, **Key Learnings**, and **What’s Next**, so future-you (or another AI) doesn’t re-try dead ends.

---

# Performance Improvement Plan — **Updated Status & Next Steps**

*(Updated after multiple PerfLab runs and A/B investigations)*


---

## 1. Constraints (locked in)

These are **non-negotiable** and all future perf work must respect them:

* **No visible cadence stepping**
  No “update every N frames”, no gesture-specific skipping that users can feel.
* **Always smooth interaction**
  Especially during pan / zoom / gesture.
* **Detail reduction is allowed**
  Particle count, effect intensity, resolution, layer visibility — *not* tick rate.
* **Render ≠ Audio (future)**
  We will eventually separate render-active from audio-active toys, but we are **not** breaking audio scheduling as part of current perf work.

---

## 2. Completed work ✅

These are done, landed, and validated via PerfLab:

### 2.1 Instrumentation & methodology

* PerfLab **auto / auto-fast / saved bundles** established as the canonical workflow.
* Clear isolation runs:

  * `NoParticles`
  * `NoOverlays`
  * `NoOverlayCore`
  * `NoOverlayStrokes`
  * Playhead separate canvas A/B
* Focus shifted correctly from averages → **p95 / p99 / worst spikes**.

### 2.2 Particle system improvements

* Particle **budget ramping** works (fast degrade, slow recover).
* **Emergency fade-to-zero** implemented and verified.
* Empty particle fields now **early-out** instead of ticking useless work.
* Confirmed: particles are *not* the sole remaining bottleneck.

### 2.3 Playhead experiments

* Separate playhead canvas **A/B tested**.
* Result: mixed gains, sometimes worse due to compositing.
* Decision: **do not rely on playhead separation as a primary fix**.

### 2.4 Adaptive DPR groundwork

* Adaptive paint DPR exists and is functional.
* Some resize paths were corrected to *respect adaptive DPR* instead of snapping back to `devicePixelRatio`.

---

## 3. Investigated and explicitly rejected ❌

These options were tested or reasoned about and are **not part of the plan** going forward:

### 3.1 Gesture-based frame skipping

* Skipping particle updates every N frames during zoom.
* Even if subtle, this **can produce perceptible “swimmy” motion**.
* **Rejected** to preserve absolute smoothness.

### 3.2 Freezing toys during gesture

* Any approach that pauses visual simulation during pan/zoom.
* Violates the “continuous surface” feel.
* **Rejected**.

### 3.3 Slot-limit / ownership-based particle ticking

* Reintroducing particle “slot” ownership.
* Added complexity without addressing the real bottleneck.
* **Rejected**.

---

## 4. Key learnings so far 🧠

These are important — they redefine where the “demon” lives.

### 4.1 The bottleneck is not just JS

PerfLab consistently shows high:

* `frame.nonScript`
* large worst-frame spikes
* limited improvement when `NoParticles` is enabled

This strongly points to:

* **Canvas resize churn**
* **DOM writes during RAF**
* **Compositor / layer overhead**
* Possibly GPU sync stalls

### 4.2 Particles are a *multiplier*, not the root cause

* Reducing particles helps, but does not fix worst-case spikes.
* When particles are removed and perf is still bad, the real issue is elsewhere.

### 4.3 “Many canvases always visible” is dangerous

* Even empty overlay canvases cost compositor time.
* Visibility and layer count matter as much as draw cost.

---

## 5. What we are actively fixing next 🎯

This is the **current forward plan**, in strict priority order.

---

### Step A — Lock a clean baseline (one more time)

**Goal:** one trusted reference bundle.

* Run **Run Auto (Saved)** once.
* Keep this JSON as the baseline for comparison.
* This run defines:

  * resize frequency
  * dom-in-raf frequency
  * nonScript cost

*No code changes here — this is about discipline.*

---

### Step B — Eliminate DOM writes during RAF (pulseToyBorder)

**Problem**

* `pulseToyBorder` currently triggers `classList.add/remove` patterns that show up in traces.
* Even small DOM writes during RAF can force style/layout work.

**Target behaviour**

* Pulses are **event-driven**, not frame-driven:

  * add class once
  * remove class once (timeout / animation end)
  * never touch DOM every frame

**Success criteria**

* `traceDomInRaf` count collapses.
* p95/p99 spikes reduce.
* Visual behaviour unchanged.

---

### Step C — Kill canvas resize churn (`drawgrid.ensureSize`)

**Problem**

* Repeated `[canvas-resize] drawgrid.ensureSize WxH` at identical sizes.
* Canvas resize = backing store reallocation = expensive.

**Target behaviour**

* Resize only when:

  * CSS size actually changed, or
  * DPR target actually changed.
* No “force resize” unless initial size is unknown.
* Stable rounding during pan/zoom (no 1px oscillation).

**Success criteria**

* Resize events drop to near-zero during gesture.
* nonScript time improves.
* White-out frequency reduces.

---

### Step D — Offscreen render culling (next major win)

**Why this matters**

* You explicitly said: *offscreen things should not render at all*.
* This preserves smoothness and avoids invisible work.

**Target behaviour**

* If a toy is fully offscreen:

  * skip drawgrid render
  * skip particle tick
  * skip overlays
* **Do not affect audio** (render-only decision).

This is the first step toward a clean **renderActive vs audioActive** split.

---

### Step E — Overlay & layer minimisation

Only after B/C/D:

* Hide empty overlay canvases entirely.
* Avoid compositing layers that are visually inert.
* Reduce playhead / overlay redraw regions (dirty rects).

---

## 6. Explicit “do not regress” checklist

Any future perf change must answer “yes” to all of these:

* Does motion remain continuous during pan/zoom?
* Are quality changes gradual and hysteretic?
* Are we reducing work per frame, not skipping frames?
* Are offscreen things truly free?

If not, it’s out.

---

## 7. Short “what’s next” summary (handoff version)

If you needed to resume this in a fresh chat:

1. Fix `pulseToyBorder` DOM-in-RAF behaviour.
2. Fix `drawgrid.ensureSize` resize churn.
3. Re-run **the same Auto (Saved)** bundle.
4. If spikes remain → implement hard offscreen render culling.
5. Only then re-evaluate particles / overlays again.

---

If you want, next I can:

* rewrite the **plan doc verbatim** in your preferred style (shorter / more technical / more narrative), or
* produce a **one-page “Perf Rules”** file to keep future AI tools from violating your smoothness constraints.
