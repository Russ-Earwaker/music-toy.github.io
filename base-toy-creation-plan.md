Here’s a step-by-step plan that stays aligned with the performance philosophy + constraints in the performance plan (no frame skipping, no gesture-specific degradation except backing-store/DPR during motion, reduce *work* not cadence, instrument before rewriting, etc.). 

## Phase 0 — Lock baselines (so refactors don’t “feel fine” but regress)

1. **Pick 2–3 canonical Perf Lab runs** we’ll use every time we touch the toy base:

   * One **single-toy** focused DrawGrid run (gesture heavy).
   * One **multi-toy** stress run (your P6-style “extreme zoom/many toys”).
   * One **LoopGrid-heavy** scene (once we’ve isolated it).
2. Run them now and save the bundle IDs / tags as the “before” baseline.
3. Add a short “BaseMusicToy refactor baselines” note into the perf plan so we don’t drift.

Deliverable: baseline perf bundle IDs + a one-paragraph “what must not regress”.

---

## Phase 1 — System inventory and “what’s generic?”

4. **DrawGrid audit (already modular):** list the subsystems that are clearly reusable:

   * Backing-store sizing + DPR clamp + pressure-DPR
   * Gesture-time backing-store reduction (visual/static multipliers)
   * Dirty/invalidations + static-layer caching model
   * Cadence control (drawHz policy, if used)
   * Micro-marks + tracing hooks (Perf Lab friendly)
   * Visibility states (OFFSCREEN/NEARSCREEN/ONSCREEN) contract
5. **LoopGrid/SimpleRhythm audit (currently monolithic):**

   * Identify its “truth points” for: canvas creation, resize/DPR, RAF tick/draw, overlays/particles, zoom listeners, DOM writes.
   * Mark which parts are *toy-logic* vs *render infrastructure*.

Deliverable: a short markdown checklist of “generic vs toy-specific” for each toy.

---

## Phase 2 — Define the BaseMusicToy contract (small, strict, testable)

6. Create a minimal **BaseMusicToy interface** (conceptual contract first, code later):

   * `init({panelEl, canvases, audio, perf, zoom, overview})`
   * `setQuality(profile)` (tier + hard maxDprMul support)
   * `onVisibility(state)` (OFF/NEAR/ON)
   * `tick(dt, tNow, ctx)` (no drawing)
   * `draw(ctx)` (cadence-controlled)
   * `destroy()`
7. Define 3–5 **base primitives** (these become files in `src/baseMusicToy/`):

   * **CanvasStack / Layer**: create canvas, cache CSS size, avoid resize churn, backing-store sync.
   * **DPR / PixelBudget**: soft resScale + **hard maxDprMul clamp** (because nonScript is the wall).
   * **QualityTiers**: tier table + hysteresis helpers + “active interaction boosts”.
   * **Invalidation**: dirty flags + “overlay presence ≠ overlay work” rule.
   * **Perf hooks**: micro-mark wrapper and optional trace buffering.

Deliverable: a one-page “BaseMusicToy Spec” (just enough to implement without ambiguity).

---

## Phase 3 — Prove the process on DrawGrid first (lowest risk, best instrumentation)

8. **Create `src/baseMusicToy/` scaffold** with empty modules and re-export entrypoint.
9. **Move (or wrap) DrawGrid’s generic mechanisms** into base modules *without changing behaviour*:

   * Start with the most mechanical/low-risk: backing-store sync + DPR clamp utilities.
   * Then invalidation helpers.
   * Then quality tier plumbing (but keep DrawGrid’s tier table where it is initially; just route through base types).
10. **Refactor DrawGrid to call BaseMusicToy primitives**:

* “Truth point” rule: there must be exactly one place that decides canvas backing size and applies DPR clamps.
* Ensure DrawGrid still owns toy-specific drawing and state; base owns “how canvases behave”.

11. **Verification loop after each extraction step**:

* Visual regression quick check (zoom/pan, randomize, internal boards).
* Run the Phase 0 Perf Lab baselines and confirm no p95/p99/worst regressions.

Deliverable: DrawGrid running through BaseMusicToy with identical output + perf parity.

---

## Phase 4 — Apply to LoopGrid/SimpleRhythm (the real test)

12. **Split `simple-rhythm-visual.js` into coherent modules first** (so base adoption isn’t surgical inside a 1900-line file):

* `loopgrid-core-state.js` (sequencer state, note logic)
* `loopgrid-render.js` (draw functions, layers)
* `loopgrid-input.js` (pointer handling)
* `loopgrid-particles.js` (field + viewport)
* `loopgrid-dom.js` (DOM commits, labels)
* `loopgrid-main.js` (wires together, exports factory)
  (Keep each file <300 lines as we go.)

13. **Introduce BaseMusicToy CanvasStack + DPR sizing** into LoopGrid:

* Replace ad-hoc `resizeCanvasForDPR` usage with base backing-store sync.
* Make LoopGrid obey the same “no resize churn” discipline.

14. **Add LoopGrid quality tiers matching DrawGrid’s “pixels first” model**:

* Implement `loopgrid-quality.js` with `maxDprMul` and any secondary feature gates.
* Wire it at LoopGrid’s backing-size truth point.

15. **Wire LoopGrid into the same visibility + interaction signals**:

* OFFSCREEN should be near-free visually (but audio unaffected).
* ACTIVE_POINTER / ACTIVE_GESTURE_GLOBAL can temporarily boost tier/draw policy (per your spec).

16. **Perf verification**:

* Add Perf Lab toggles: force LoopGrid tier / auto (mirroring DrawGrid).
* Run the multi-toy stress baseline and confirm lowering LoopGrid tier produces measurable `frame.nonScript` reduction.

Deliverable: LoopGrid participates in tier + hard DPR clamp and is measurable via Perf Lab.

---

## Phase 5 — Lock it in (so future toys are easy)

17. **Write the “How to build a new toy” template**:

* Minimal folder skeleton
* Required BaseMusicToy hooks
* Where to put tier table + which passes must be gated

18. **Update performance plan** with:

* Completed work bullets (what moved where + how verified)
* Key learnings from LoopGrid (especially nonScript deltas)
* Next steps updated to “apply BaseMusicToy to remaining toys” (later)

Deliverable: repeatable toy-creation workflow + documented rules.

---

 

## Step-by-step plan: carve out `src/baseMusicToy/` from DrawGrid, then adopt in LoopGrid (Simple Rhythm)

### Phase 1 — Inventory + choose the base primitives (no code yet)

1. **Identify the “render infrastructure” pieces already proven in DrawGrid** that we want to become reusable:

   * Backing-store sizing + CSS-size caching (kill resize churn)
   * DPR policy: pressure-DPR + size caps + tier hard clamp (`maxDprMul`)
   * Gesture-time backing-store reduction (allowed exception because it reduces pixels, not cadence)
   * Visibility states + “offscreen is near-free”
   * Invalidation/dirty-bit model (overlay redraw must be event-driven, not “layer exists”)  
2. **Find LoopGrid’s “backing-size point of truth”** (where it resizes canvases / reads layout) — right now it’s centralized inside `simple-rhythm-visual.js` via `computeLayout()` calling `resizeCanvasForDPR(st.canvas, w, h)` and then caching `_cssW/_cssH`. That’s where the base system must plug in.

**Deliverable:** a short checklist mapping:

* DrawGrid module(s) → intended `baseMusicToy` module
* LoopGrid callsites that will be replaced by base equivalents

---

### Phase 2 — Create `src/baseMusicToy/` scaffolding (tiny modules, strict responsibilities)

3. Create this folder + initial file set (small and boring on purpose):

**`src/baseMusicToy/CanvasBackingStore.js`**

* “one truth point” helper: `syncCanvasBackingStore(canvas, cssW, cssH, { desiredDpr, maxDpr, cacheKey })`
* caches last applied css/backing sizes (prevents 1px thrash)

**`src/baseMusicToy/DprPolicy.js`**

* compute `desiredDprRaw` using:

  * device DPR
  * resScale (soft)
  * pressure multiplier (from existing AutoQualityController / pressure system)
  * **hard clamp** `tierMaxDpr = baseDeviceDpr * maxDprMul` 
* outputs: `{desiredDprRaw, desiredDprClamped, debugMeta}`

**`src/baseMusicToy/GestureDpr.js`**

* applies the *allowed* gesture-time backing-store reduction (visual/static multipliers), restoring cleanly on commit 

**`src/baseMusicToy/QualityTiers.js`**

* shared helpers for tier hysteresis + “interaction boost” rules (ACTIVE_POINTER temporarily bumps tier/drawHz, then decays) 

**`src/baseMusicToy/Visibility.js`**

* visibility enum + helpers to classify ON/NEAR/OFF and enforce “offscreen near-free visuals” contract 

4. **Do not move toy-specific drawing.** Base only owns “how canvases are sized and throttled” + “how tiers are applied”.

**Deliverable:** base folder exists, exports are wired, no behaviour change yet.

---

### Phase 3 — Prove the base works by routing DrawGrid through it (behaviour-preserving refactor)

5. **Pick one DrawGrid canvas path first** (the most representative, not the weirdest) and replace its internal “resize/DPR clamp” logic with base calls.
6. Keep DrawGrid’s tier table in `src/drawgrid/dg-quality.js` for now, but route the *math* through base:

   * DrawGrid still decides tier → `{resScale, maxDprMul, drawHz…}`
   * Base decides: deviceDpr * resScale * pressure * gestureMul → clamp by `maxDprMul`
7. Ensure DrawGrid still produces real nonScript deltas when forcing tiers (because *that’s the whole point of hard clamp*).  
8. Run the same “do not regress” checks: continuous motion, no modulo skipping, no gesture-specific *visual* degradation (only raster reduction), Perf Lab p95/p99/worst. 

**Deliverable:** DrawGrid uses `baseMusicToy` for backing-store + DPR + gesture raster reduction, with perf parity (or improvement).

---

### Phase 4 — Modularise LoopGrid just enough to adopt the base cleanly

9. Split `src/simple-rhythm-visual.js` into coherent <300-line chunks *before* swapping systems:

   * `src/loopgrid/loopgrid-state.js` (steps, notes, playhead state)
   * `src/loopgrid/loopgrid-layout.js` (computeLayout + block sizing)
   * `src/loopgrid/loopgrid-render.js` (draw passes, sprites)
   * `src/loopgrid/loopgrid-input.js` (pointer handling)
   * `src/loopgrid/loopgrid-particles.js` (field/viewport wiring)
   * `src/loopgrid/loopgrid-main.js` (factory that current callers import)
10. While splitting, **preserve existing semantics** (same exports, same behaviour). This is purely to make the next step safe.

**Deliverable:** LoopGrid codebase is split into sane modules and ready for base adoption.

---

### Phase 5 — Apply `baseMusicToy` to LoopGrid (the real target)

11. Replace LoopGrid’s current `resizeCanvasForDPR(...)` path with:

* `CanvasBackingStore.sync(...)`
* `DprPolicy.computeDesiredDpr(...)`
* apply **tier `maxDprMul` hard clamp at the backing-size truth point** (exactly as the perf plan requires) 

12. Implement `src/loopgrid/loopgrid-quality.js` mirroring DrawGrid’s structure:

* tier table includes **resScale (soft)** + **maxDprMul (hard)**
* optional feature gates are secondary (particles, specials, glows)
* tier changes hysteretic; interaction temporarily boosts

13. Add Perf Lab controls mirroring DrawGrid:

* Force LoopGrid tier / Auto
* A/B variants in P6 “Current Focus” to verify lowering tier reduces `frame.nonScript` (not placebo). 

**Deliverable:** LoopGrid becomes a measurable nonScript lever the same way DrawGrid is.

---

### Phase 6 — Lock in the workflow for future toys

14. Add a “New toy checklist” doc snippet (or section in perf plan) that states:

* every toy must have a single backing-size truth point using base
* every toy must expose tier table including `maxDprMul`
* offscreen visuals must be near-free
* verify with Perf Lab A/B and report p95/p99/worst 

---

