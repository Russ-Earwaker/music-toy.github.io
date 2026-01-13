Here’s a **copy-pasteable reference note** you can drop into your project (e.g. `docs/perf-notes-2026-01-12.md`). It captures your constraints + what I found in the current codebase.

---

# Perf Notes & Constraints (2026-01-12)

## 1) “Offscreen render off, but still audible?” — current state + direction

### Current architecture (important)

* Audio *output* is already logically separable per toy (there are per-toy buses / channels).
* **However:** note scheduling is still initiated by the toy logic (e.g. loopgrid’s `panel.__sequencerSchedule`), and it contains an **authoritative guard** that prevents scheduling unless the toy is in the active set:

  * In `src/grid-core.js`, `panel.__sequencerSchedule` checks `window.__mtActiveToyIds` and **refuses to schedule** if the panel ID isn’t included.

**Implication:** Right now, “toy not active” ≈ “toy doesn’t schedule audio”.
So if we “turn off” toys by removing them from the active set, they will go silent even if we keep audio buses alive.

### Desired future direction

We want to split “turn off” into two independent concepts:

* **Render-active set** (what is drawn / simulated visually)
* **Audio-active set** (what is allowed to schedule / be heard)

So the feature you’re describing is:

* toy is **render-off** (or render-lite / frozen)
* toy is still **audio-on** (continues scheduling notes)

This can be achieved later by either:

* (A) keeping toy scheduling running even when render is frozen, but removing only *visual* work, or
* (B) centralising scheduling so audio is driven by a global scheduler/model rather than each toy’s render/tick path, or
* (C) keeping per-toy scheduling but changing the guard to check **audioActive** rather than **renderActive**.

## 2) Gesture smoothness requirement (non-negotiable)

During pan/zoom/gesture:

* Maintain **consistent frame pacing** (avoid visible “staggering” / cadence changes).
* Avoid strategies like “update every Nth frame” unless it’s *truly imperceptible*.

Acceptable:

* Reducing *work per frame* in ways that remain visually continuous:

  * fewer particles
  * cheaper particle update rules
  * cheaper draw paths
  * lower-detail rendering that still updates every frame

Avoid (unless proven unnoticeable):

* “Only update this subsystem every 2–4 frames”
* aggressive freezing that creates visible stepping / jitter

## 3) Particle scaling — allowed, but must be smooth

We already have particle scaling based on low FPS / high toy count.

New rule: **quality changes must not flap**.

* Use **hysteresis** (two thresholds: degrade sooner, recover later)
* Use **ramping** (move budgets gradually over time, not instant jumps)
* Prefer adjusting:

  * particle count
  * spawn rate
  * lifetime
  * simulation complexity
    over toggling the entire sim on/off abruptly.

Hard emergency is allowed:

* If memory pressure or extreme frame time: **disable particle sim** (but do it with a graceful transition + slow recovery).

## 4) “The demon” — suspected class of issue + investigation approach

Perf-lab shows big `frame.nonScript` time, which usually means:

* browser compositing stalls
* layout / style recalcs
* canvas flush / GPU sync
* resize / reflow churn
* GC pauses
* “unattributed” time outside our explicit marks

So: the demon is likely **not** a simple JS hot loop.

When we investigate, we want:

* Instrumentation that flags:

  * any canvas resize events (and what triggered them)
  * any DOM writes during RAF (classList/style/innerHTML/etc.)
  * any expensive layout reads after writes (forced reflow patterns)
  * long tasks / GC indicators
* A reproducible “bad scene” test (P7/P3 style) and a controlled “one change at a time” approach.

Success criteria:

* Reduce *worst spikes* (p99/worst), not just averages.
* Ensure improvements preserve gesture smoothness.

## 5) Priorities acknowledgement

* Loopgrid/connectors optimisations are still valid later,
* but the plan must honour (1)–(4) above first.

---

If you want, I can also write a **second companion note** you can drop in (same style) that’s just:

* “Definitions: renderActive vs audioActive”,
* “Quality scaler rules (hysteresis + ramp)”,
* “What counts as ‘unnoticeable’ during gesture”,
  so future-you (or an AI tool) can’t accidentally violate your constraints.


Here you go — drop this in as something like `docs/perf-companion-constraints.md`.

---

# Perf Companion Note: Render vs Audio, Smooth Scaling Rules, Gesture “Unnoticeable” Bar

## 0) Purpose

This note exists so future changes don’t accidentally:

* silence toys when we only meant to reduce visual cost,
* introduce visible frame-cadence stepping during gestures,
* or cause particle quality to “flap” (rapidly degrade/recover).

---

## 1) Two independent concepts: Render-Active vs Audio-Active

### Definitions

* **renderActive(toy)**
  The toy is allowed to spend frame budget on:

  * visual draw
  * visual simulation (particles, overlays, playheads)
  * DOM adornments (headers, pulses, etc.)

* **audioActive(toy)**
  The toy is allowed to:

  * schedule notes / events
  * produce audible output (through its bus)
  * remain part of the musical mix even if not rendered

### Rules

* A toy may be:

  * **renderActive + audioActive** (normal)
  * **renderInactive + audioActive** (audible but visually frozen / simplified)
  * **renderActive + audioInactive** (muted but still visually interactive — e.g. user muted it)
  * **renderInactive + audioInactive** (fully off)

### Non-negotiable

* Any “turn off / freeze / cull by view” system must specify **which set** it changes:

  * render set only, audio set only, or both.

### Implementation direction (later)

* Avoid linking audio scheduling permission to render activity.
* If there is a single guard today (e.g. “active toy ids”), it should eventually split into:

  * `__mtRenderActiveToyIds`
  * `__mtAudioActiveToyIds`
    (or equivalent)

---

## 2) Gesture smoothness: what is allowed vs not allowed

### Goal

During pan/zoom/gesture, the app must feel:

* continuous
* responsive
* stable in cadence (no “every other frame” vibes)

### Allowed (preferred)

Reduce **work per frame**, but still update every frame:

* reduce particle count / spawn rate
* simplify particle physics / behaviors
* reduce overlay detail (thinner passes, fewer effects)
* use cached blits / sprites instead of dynamic draws
* reduce expensive “secondary” visuals while keeping primary motion continuous

### Avoid (unless proven imperceptible)

* “Update subsystem every N frames” (cadence stepping)
* freezing that causes visible snapping/stuttering
* time-slicing that creates rhythmic hitching during a continuous gesture

### If we *must* time-slice

Only acceptable if:

* the affected visual is minor AND
* the motion still interpolates smoothly AND
* the user cannot perceive cadence changes in normal use

(Proof must be empirical: side-by-side feel test on a mid-tier device.)

---

## 3) Smooth quality scaling: no flapping, no sudden jumps

### The problem

Quality changes that rapidly toggle (on/off, high/low) cause:

* visible popping
* perceived instability
* user distrust (“it’s glitchy”)

### Rules for any scaler (particles, overlays, etc.)

1. **Hysteresis**

   * Degrade threshold: e.g. avg frame > X ms for Y duration
   * Recover threshold: e.g. avg frame < (X - margin) ms for longer duration
   * Margin must be non-trivial (avoid hover oscillation)

2. **Ramping**

   * Budgets change gradually:

     * e.g. adjust a multiplier by small steps over time
   * Never jump from 1.0 → 0.0 in one tick unless emergency

3. **Smoothing window**

   * Use a rolling average or EMA over a short window
   * Do not respond to single-frame spikes

4. **Separate degrade vs recover speeds**

   * Degrade can be faster (protect frame pacing)
   * Recover must be slower (avoid flapping)

### Emergency mode (allowed)

If any of these are true:

* memory pressure detected
* repeated long spikes / near-freeze
* extreme toy count situation

Then:

* disable particle sim (or similar heavy subsystem)
* but do it with a **graceful fade** / transition
* and recover slowly under stable conditions

---

## 4) “Unnoticeable” bar — definition and acceptance criteria

A change counts as “unnoticeable during gesture” if:

* motion remains continuous (no stepping)
* no visible flicker/popping when quality shifts
* no interaction latency increases in a way users feel
* subjective test: “this still feels like a single smooth surface”

### Practical acceptance checks

* On a worst-case perf-lab scene:

  * p50 improves OR stays stable
  * p95 improves
  * p99 and worst improve significantly
* During a continuous pan for ~10 seconds:

  * no periodic hitching
  * no quality oscillation visible

---

## 5) Priorities reminder (so we don’t forget later)

When optimizing:

1. protect gesture smoothness + cadence
2. make scaling stable (hysteresis + ramp)
3. split render vs audio activity before doing “cull by view” features
4. hunt “frame.nonScript / unattributed” demon with targeted instrumentation

---

Yep — there are still meaningful improvements to chase, and you’ve already surfaced the two biggest “smells” we should prioritise next:

* **Canvas resize churn** (`drawgrid.ensureSize …` showing up a lot)
* **DOM writes inside rAF** (`pulseToyBorder: classList.remove …`) which is a classic forced-reflow trigger

Below is an **updated “next steps” plan** you can paste straight into your plan doc (or as an addendum). It builds on the existing constraints + demon-hunt framing in your current plan. 

---

## Perf plan update: next steps (handoff)

### Where we are

* PerfLab “demon trace” toggles + auto sequences exist (traceOn/traceOff + saved bundle). 
* In P3f quick-trace, **drawgrid dominates**: `perf.raf.drawgrid` is very large, and inside that `drawgrid.update` is a major chunk (avg ~26.9ms in the captured trace), plus non-trivial overlay/playhead work. 
* Console shows lots of:

  * `[perf][canvas-resize] drawgrid.ensureSize …`
  * `[perf][dom-in-raf] pulseToyBorder: classList.remove …`
    which matches the forced reflow warnings you saw.

### Goal of the next slice

Reduce p95/p99 and worst spikes by killing:

1. repeated resize/ensureSize work
2. DOM classList churn during RAF

---

## Step A — Lock in a reliable “evidence bundle” run

**Action**

* Use the existing **Run Auto (Saved)** demon-hunt sequence as the canonical bundle generator. It already includes:

  * traceOff baseline
  * A/B isolations (`NoParticles`, `NoOverlays`, `NoOverlayCore`, `NoOverlayStrokes`)
  * traceOn repeats


**Output**

* One downloaded JSON bundle per run (keep these with date stamps).

**Why**

* Before changing behaviour again, we want one “known good” baseline bundle that clearly shows:

  * how many `canvas-resize` events happen
  * how many `dom-in-raf` hits happen
  * whether `NoOverlays` etc. materially changes p95/p99

---

## Step B — Fix DOM-in-RAF: `pulseToyBorder` (forced reflow bait)

**Problem**

* `pulseToyBorder` is doing `classList.*` inside RAF repeatedly (your trace logs show `classList.remove toy-playing-pulse`). That’s exactly the pattern that can cause style recalcs + forced layouts.

**Target behaviour**

* Border pulse should be **event-driven**, not “polled” every frame:

  * add the class **once** when a pulse starts
  * remove it **once** when the animation ends (or via a timeout)
  * *never* remove/add every frame

**Implementation sketch**

* Replace per-frame remove with one of:

  1. CSS animation + `animationend` event to clean up class
  2. a “pulse token” system: only touch DOM when token changes
* Add a tiny guard: “if class already correct, do nothing”.

**Success check**

* `traceDomInRaf` count should drop dramatically.
* Forced reflow violations should reduce in frequency.

---

## Step C — Fix canvas-resize churn: `drawgrid.ensureSize`

**Problem**

* You’re seeing dozens of `[perf][canvas-resize] drawgrid.ensureSize …` hits. Even if each call is “fast”, resizing canvases causes expensive internal work (and can provoke GPU sync/compositing stalls).

**Target behaviour**

* `ensureSize` should only commit when **(w,h,dpr) actually changed**.
* During gesture, it must not bounce sizes due to fractional rounding.

**Implementation sketch**

* Ensure `ensureSize` is fed *stable integers*:

  * compute CSS size once (via ResizeObserver-cached values you already started adding in drawgrid) and round consistently
* Add “commit hysteresis”:

  * ignore tiny 1px oscillations during pan/zoom if they revert next frame
* Confirm `ensureSize` is not called in more than one place per frame (common accidental double-call pattern).

**Success check**

* `traceCanvasResize` count should approach “only when window/panel size changes”, not constant during pans.

---

## Step D — Re-run the A/B matrix to learn what still dominates

Once B + C are in:

**Run**

* Auto bundle again (same saved sequence). 

**Interpret**

* If `NoOverlays` is still a big win → overlays need caching / cheaper draw paths
* If `NoParticles` is a big win → particle sim/draw needs smoother scaling/hysteresis tuning (but keep “no cadence stepping” constraint)
* If neither helps much → the remaining “demon” is likely compositor/GPU/flush related, and we go deeper on:

  * number of canvases
  * canvas composite strategy
  * any layer effects (opacity/filters/shadows) causing expensive compositing

---

## Step E — (Optional but likely) tighten playhead cost

In the quick trace, `drawgrid.overlay.playhead` is a noticeable slice. 
If overlays still matter after B/C, next move is:

* cache playhead overlay to an offscreen buffer when possible
* or draw playhead in the cheapest pass (no clearing whole overlay canvas if you can dirty-rect)

---

### Notes about “whiteouts”

Treat them as “Chrome/GPU under extreme stress” signals, not necessarily app correctness issues. If they correlate with resize storms or compositing spikes, fixes in B/C often reduce them too.

---

If you want the absolute minimal marching order to hand off to the next chat/agent, it’s:

1. **Baseline Auto (Saved) bundle**
2. **Fix `pulseToyBorder` DOM-in-RAF**
3. **Fix `ensureSize` resize churn**
4. **Re-run the exact same Auto bundle and compare**

That’s the cleanest path to exorcising the “demon” without violating your “smooth during gesture” rule.
