# Performance Improvement Plan

## How to update this document

When we complete or reject work, update these sections in order:

1. **Completed Work âœ…** â€” add a bullet with *what changed*, *where*, and *how verified* (Perf Lab tag / key metrics).
2. **Investigated and Rejected âŒ** â€” record *why* it was rejected and what evidence (Perf Lab / visual regression).
3. **Key Learnings ðŸ§ ** â€” keep this tight: the 5â€“10 facts that currently drive decisions.
4. **Guidelines / Constraints (Locked In)** â€” only edit if weâ€™ve agreed a rule is changing.
5. **Next Steps ðŸŽ¯** â€” keep a short ordered list. Each step must be measurable in Perf Lab.

---

## 1. Hard Constraints (Locked In)

These are **nonâ€‘negotiable** and must guide all future optimisation work:

* **No intentional frame skipping**
  No modulo updates, no â€œevery N framesâ€ logic that affects perceived motion.

* **No gesture-specific visual degradation**
  Panning / zooming must not change visual quality or cadence.
  *Exception:* **load/FPS-based** quality reduction is allowed (device-agnostic), with hysteresis.
* **Smoothness > absolute detail**
  We may reduce *detail* (particle count, resolution, effect richness), but never cadence.
* **Rendering â‰  Audio**
  Render culling must not affect audio timing or scheduling (render-only decisions).

---

## 2. Completed Work âœ…

### 2.1 Perf methodology & tooling

* Perf Lab auto / fast / saved runs are now the **canonical workflow**.
* Focus shifted from averages to:
  * **p95 / p99**
  * worst-frame spikes
  * â€œwhat changedâ€ A/B variants with identical scene rebuilds.
* **Auto: Current Focus** established for fast iteration on gesture/compositor issues.
* Added **micro-marks** to isolate costs inside a single perf bucket:
  * `drawgrid.playhead.headerSweep`
  * `drawgrid.playhead.headerSweepVisual`
  * `drawgrid.playhead.spriteGet`
  * `drawgrid.playhead.drawImage`

* **Perf Lab now defaults to â€œcleanâ€ perf** (debug traces OFF during runs)
  * Disable noisy DG/FG debug flags by default in perf runs (avoids distorting results).
  * Trace output is buffered (not console-spammed) and summarized into each bundle meta.
  * Verified in latest focus bundle: trace summary included without â€œskip-not-readyâ€ events.

* **Auto: Current Focus queue is now stable and repeatable**
  * Build once, run variants back-to-back:
    * Baseline focus
    * NoOverlays focus
    * NoParticles focus
  * MultiCanvas focus run is currently treated as â€œmanual onlyâ€ (was causing stalls / swamping signal).

* **Pressure-DPR verified as â€œactually engagingâ€**
  * Latest focus bundle shows pressure seen with min pressure multiplier ˜ 0.608 (sawPressure: true).
  * This confirms pressure-based DPR is a viable lever (weâ€™re not chasing a phantom).

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

* Discovered (via micro-marks) that **header sweep was the dominant playhead cost** (not â€œ4 glowy linesâ€).
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

  * avg Ã¢â€°Ë† **21.4ms**
  * p95 Ã¢â€°Ë† **33.4ms**
  * p99 Ã¢â€°Ë† **33.5ms**
  * worst Ã¢â€°Ë† **50.1ms**
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
  * avg ˜ 23.39ms, p95 ˜ 33.4ms, p99 ˜ 50.1ms
* NoOverlays focus:
  * avg ˜ 19.98ms, p95 ˜ 33.4ms, p99 ˜ 33.5ms
* NoParticles focus:
  * avg ˜ 21.75ms, p95 ˜ 33.4ms, p99 ˜ 50.1ms

Interpretation: **Overlays strongly affect p99 spikes** and overall average; particles are secondary in this focus setup.
### 2.8 DrawGrid connector-line bugfix + cleanup (Feb 4 2026)

* Fixed a DrawGrid regression where connector lines could disappear or render offset after camera pan/zoom or when randomising.
* Removed hidden connector-layer gradient circles (they were always behind the orange square nodes).
* Verified via manual repro (new toy ? random; pan/zoom; warm refresh) + Perf Lab run perf-lab-results-2026-02-04T13-12-38-553Z.json.

### 2.9 Multi-toy quality tiers (DrawGrid) + Perf Lab A/B instrumentation (Feb 6 2026)

**Status: IN PROGRESS / NOW MEASURABLE**

**What changed**

* Implemented **DrawGrid quality tiers** as the primary “reduce work, not cadence” lever:
  * Per-tier gating for:
    * particles
    * overlay specials
    * playhead extras
    * heavy overlay cadence (time-based, not frame-modulo)
* Added a **hard tier-based DPR clamp** (`maxDprMul`) so tiers actually reduce **pixel/raster cost** (the `frame.nonScript` wall).
* Added **Perf Lab → Quality** control:
  * force DrawGrid tier (`-1..3` / Auto)
  * A/B queue variants for tier auto on/off and forced tiers.
* Made **Auto: Current Focus labels composable** (multiple toggles recorded in the run label),
  so P6 runs are self-describing without manual cross-referencing.

**Where**

* `src/drawgrid/dg-quality.js`
  * Tier profile table extended with `maxDprMul` (hard cap on final DPR relative to device DPR).
* `src/drawgrid.js`
  * Apply `tierMaxDpr = baseDeviceDpr * maxDprMul` as a hard clamp on `desiredDprRaw`.
* `src/perf/perf-lab.js`
  * Quality Lab: DrawGrid tier force option
  * Auto: Current Focus queue expanded to include tier A/B + forced-tier runs
  * Run label tagging made composable (e.g. `__dgAutoOn+dgTier1+loopRenderOff`)

**How verified**

From latest **Auto: Current Focus** (P6c extreme zoom, multi-toy):

* Forced tiers show a real **nonScript reduction** (pixel work reduced):
  * Tier 3: `frame.nonScript` avg ~47ms
  * Tier 1: `frame.nonScript` avg ~43ms
  * Result: tier clamp is now a real lever (not placebo).

**Conclusion**

> The tier system is now “real” because it measurably reduces `frame.nonScript`.
> Remaining performance work should move outward to other heavy renderers (LoopGrid) and chain systems.


---

## 3. Investigated and Rejected âŒ

### 3.1 Frame-skipping / modulo updates

* Even subtle skipping produces perceptible â€œswimmyâ€ feel.
* Rejected to preserve continuous motion.

### 3.2 Gesture-based quality changes

* Any degradation tied directly to zoom/pan felt wrong and noticeable.
* Rejected in favour of load/FPS-based, hysteretic control.

### 3.3 Freezing toys during viewport movement

* Breaks the â€œcontinuous surfaceâ€ feel.
* Rejected.

### 3.4 â€œVisible panel countâ€ as a scaling input

* Rejected because itâ€™s device-dependent and mis-scales across machines (high-end PC vs older mobile).
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

> DrawGrid Focus is Ã¢â‚¬Å“good enoughÃ¢â‚¬Â. Lock it in and move on.

---

## 4. Key Learnings ðŸ§ 

### 4.1 The bottleneck is mostly **not JavaScript**

Perf Lab consistently shows high **`frame.nonScript`** (GPU/compositor/raster/driver time),
plus large worst-frame spikes. This implies we must prioritise:

* backing store size + DPR
* layer/compositor pressure
* canvas resize churn
* alpha-heavy blits / scaling

Latest focus bundle confirms this again: baseline `frame.nonScript` avg is ~49.5ms.

### 4.11 Tiers must clamp pixels to move nonScript

* Feature gating alone (particles/playhead/overlay “specials”) is not enough in P6 extreme zoom.
* The first tier implementation did not meaningfully change P6 `frame.nonScript`.
* After adding a **hard tier DPR clamp** (`maxDprMul`), forced Tier 1 vs Tier 3 now shows a real `frame.nonScript` reduction.
* Therefore: tier systems should prioritise **pixel work reduction first**, then optional effects.

### 4.12 LoopGrid render is the next obvious nonScript lever

* In P6 multi-toy runs, disabling LoopGrid render removes its RAF cost and improves averages.
* Next step is to make LoopGrid participate in the same pixel-budget strategy (tier + DPR clamp).

### 4.2 Micro-marks change the game

â€œPlayhead is expensiveâ€ was too vague. Micro-marks revealed:
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
* Disabling overlays reduced **p99** from ~50ms â†’ ~33.5ms while keeping p95 about the same.
* Disabling particles did **not** improve p99 in this focus setup.

This strongly suggests weâ€™re paying for:
* full-canvas overlay clears / composites, and/or
* â€œoverlay always activeâ€ gating even when overlays are logically empty.

### 4.6 Pressure-DPR is confirmed real (so use it strategically)

Trace summary shows pressure engaged with min pressure multiplier ˜ 0.608.
This is enough to justify building â€œpressure-firstâ€ solutions rather than scene heuristics.

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

* Overlays still cost *something* — but:

  * they no longer explode
  * they no longer dominate p99
* A known, bounded cost is preferable to fragile “clever” elimination.

### 4.9 Overlay presence must not imply overlay work

* “Layer is non-empty” must not be used as a proxy for “needs redraw”.
* `overlayDirty` must mean: **overlay core must be repainted**.
* Caching + invalidation is the correct model for overlay performance.

### 4.10 Freeze heavy overlay core redraw during gesture motion

* Pan/zoom gesture motion amplifies compositor cost.
* Freezing **heavy overlay core redraw** during gesture (unless correctness requires it) is safe and effective.
* This is consistent with our rule: **never change cadence; only reduce work**.

---

## 5. Guidelines / Constraints (Locked In) ðŸ”’

* **Gesture-time backing-store degradation is allowed**

  * Only affects raster resolution, not cadence.
  * Must restore cleanly on gesture commit.
* **If p99 ˜ p95, stop**

  * Further optimisation is optional and must justify regression risk.
* **Stability > cleverness**

  * Prefer simple, bounded systems over intricate micro-optimisations.
* **Prefer FPS/pressure inputs over scene heuristics**
  (avoid â€œvisible countâ€, avoid â€œgesture modeâ€ switches).
* **Degrade by detail, not cadence**
  Use hysteresis. If we must disable an effect under pressure, do it as a last resort.
* **Instrument before rewriting**
  If something is â€œsurprisingly expensiveâ€, add a micro-mark and verify the culprit.
* **Treat alpha-heavy tall sprites as risky**
  Avoid per-frame rescaling; make caches stable (quantization / reuse).

* **Overlay redraw must be event-driven**
  Overlay core redraw should only occur on true invalidation (flash/state change/UI refresh), not “layer exists”.

---

## 6. Next Steps ðŸŽ¯

### âœ… DrawGrid Focus â€” DONE

Remove DrawGrid Focus from the active optimisation list.

### DrawGrid Focus/Quality Budget Spec (Feb 6 2026)

**Goal:** keep *all onscreen toys smooth* by dynamically reducing *visual work* (primarily pixel/compositor cost) with gradual, hysteretic quality changes. This is **not** “small-screen editing mode” (single-toy mode); it’s the default multi-toy behaviour.

**DrawGrid model (template for future toys):**
* **Visibility states:** `OFFSCREEN` (near-free visuals), `NEARSCREEN` (cheap warm-up), `ONSCREEN` (eligible for full render).
* **Interaction boosts:** `ACTIVE_POINTER`, `ACTIVE_GESTURE_GLOBAL`, `RECENT_INTERACTION`, `AUDIO_IMPORTANT`.
* **Global budget manager:** uses rolling avg/p95 frame time + motion context to assign per-toy profiles with **hysteresis** (no flapping).
* **Quality profiles (tiers):**
  * **Tier 3 (Full):** resScale≈1.0, drawHz=60, all passes.
  * **Tier 2 (Light):** small resScale drop, keep 60Hz; reduce optional effects (bursts/flash density, particle budget).
  * **Tier 1 (Medium):** resScale≈0.7–0.8, drawHz≈30 (except `ACTIVE_POINTER`); particles off/heavily throttled; simplify overlay “specials”.
  * **Tier 0 (Low but alive):** resScale≈0.6–0.7, drawHz≈15 with interaction override; most optional passes off; cached/simplified overlay.
  * **Tier -1 (Emergency, rare):** resScale≈0.5–0.6, drawHz≈10; auto-recover ASAP.
* **Audio decoupling contract:** visual tiering must **never** affect audio timing. Offscreen toys can keep contributing audio via the central scheduler/mix graph while visuals are free.

**Implementation hooks (DrawGrid):**
* `setQualityProfile(profile)` (idempotent)
* `tick(dt, tNow, ctx)` (no drawing)
* `draw(ctx)` (cadence-controlled)
* `onVisibilityChange(state)` / `onInteractionChange(state)`

**Acceptance:** under P6-style multi-toy loads, quality should degrade smoothly (no stutter spikes) and recover cleanly; verify with Perf Lab (avg/p95/p99 + worst-frame).
---

### DrawGrid Quality Tier → Pass Mapping (Implementation Table)

This table exists to remove ambiguity during implementation. Each tier explicitly lists which DrawGrid passes, effects, and cadences are enabled. Future toys should provide an equivalent table.

| Tier | resScale | drawHz | Grid / Nodes | Overlay Core | Overlay Specials (flashes, bursts) | Particles | Playhead Extras | Notes |
|-----:|---------:|-------:|--------------|--------------|------------------------------------|-----------|------------------|-------|
| 3 | ~1.0 | 60 | Full | Full | Full | Full | Full | Target quality for focused or low-load scenes |
| 2 | 0.85–0.9 | 60 | Full | Full | Reduced density / frequency | Reduced budget | Full | Nearly imperceptible degrade; shave pixel cost |
| 1 | 0.7–0.8 | 30* | Full | Simplified | OFF | OFF / heavy throttle | Reduced (no glows) | *60Hz temporarily while ACTIVE_POINTER |
| 0 | 0.6–0.7 | 15* | Full | Cached / minimal | OFF | OFF | Minimal | *Temporary bump to Tier 1 during interaction |
| -1 | 0.5–0.6 | 10 | Minimal | OFF | OFF | OFF | OFF | Emergency only; auto-recover ASAP |

**Overlay Core** = strokes, toggles, playhead base.  
**Overlay Specials** = flashes, bursts, sparkle effects.  
**Playhead Extras** = header sweep visuals, glow, secondary effects.

**Cadence rules:**
* Update cadence remains high for responsiveness; draw cadence is reduced first.
* Tier changes are hysteretic (≤1 tier change per second).
* Interaction (`ACTIVE_POINTER`) temporarily lifts drawHz and/or tier, then decays.

### Next optimisation targets (ordered)

1. **LoopGrid: add tier + hard DPR clamp (match DrawGrid’s “pixel cost first” model)**

   * Implement `loopgrid-quality.js` (or equivalent) with:
     * `resScale` (soft)
     * `maxDprMul` (hard cap)
     * optional feature gates (secondary)
   * Apply the hard cap at LoopGrid’s **canvas backing-size point of truth**.
   * Verify using **Auto: Current Focus** P6c:
     * `frame.nonScript` decreases when LoopGrid tier is lowered / clamped.
     * `loopgrid` RAF bucket decreases or remains stable.
   * Add Perf Lab controls similar to DrawGrid:
     * Force LoopGrid tier / Auto
     * A/B runs for LoopGrid tier impact in P6.

2. **Project focus/quality budget manager (default multi-toy behaviour)**

   * Implement the DrawGrid tiering system above (profiles + hysteresis) as the reference implementation.
   * Wire visibility classification (ONSCREEN/NEARSCREEN/OFFSCREEN) and ensure offscreen visuals are near-free.
   * Add a Perf Lab A/B run that toggles budget manager ON/OFF in the same P6 scene.

3. **Multi-toy scenes**

   * Validate compositor behaviour with many simultaneous toys.
   * Update **Auto: Current Focus** to be P6-based A/B isolates (baseline ? chains off ? LoopGrid render off ? overview toggles).
   * Keep **Run-Auto (Generic)** unchanged; it remains the broad regression check.
4. **Chain system spike work (p95/p99 reduction)**

   * Once LoopGrid is tier-aware, re-check the chain A/B deltas.
   * Target: reduce worst-frame spikes without changing cadence (no modulo, no freezing).
   * Use the now-tagged A/B results to isolate:
     * chain UI vs connectors vs traversal

5. **Particle field under extreme load**

   * Mobile GPU limits
   * Very large boards
6. **Mobile Safari / low-end GPU validation**

   * Confirm pressure-DPR + gesture-DPR hold up on weaker devices.

---

## 7. Explicit â€œDo Not Regressâ€ Rules

Any future optimisation must answer **yes** to all of these:

* Does motion remain continuous?
* Are quality changes gradual and hysteretic (FPS/pressure based), with gesture-time reductions allowed **only** when they reduce backing-store resolution and restore on commit?
* Are we reducing *work* first, and only reducing **draw cadence** as a last resort (with stable caps + hysteresis)?
* Are offscreen elements truly free?
* Did we verify with Perf Lab (p95/p99 and worst-frame)?

If not, itâ€™s rejected.

---

## 8. One-Paragraph Handoff Summary (Updated)

> DrawGrid Focus performance is now stable and bounded. Resize churn has been eliminated, pressure-DPR is verified to engage, and gesture-time backing-store DPR reduction removes compositor stalls without affecting perceived smoothness. Long-tail p99 spikes (>100ms) are gone; p99 now aligns with p95. Overlays incur a known, bounded cost and are no longer a structural risk. Further DrawGrid Focus micro-optimisation was intentionally stopped to avoid regression risk. The performance effort now moves outward to multi-toy scenes, particle load under pressure, and mobile GPU limits.


