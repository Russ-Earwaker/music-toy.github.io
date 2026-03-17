# ✅ New Codex Task List (Musical Focus Only)

## 1. Make intro drums a real loop (highest impact)

**Task**

* Generate a **4-bar drum pattern** at intro
* Lock it as a loop
* Do NOT regenerate every bar

Rules:

* kick + snare + hat pattern
* slight variation every 4 bars max
* persists until next phase

**Goal**
👉 intro sounds like *music*, not noise

---

## 2. Force instrument rotation system

**Task**

* Add instrument pools per role:

  * bass pool (3–5 sounds)
  * accent pool (3–5 sounds)
  * loop pool (3–5 sounds)

* Assign instrument per:

  * section OR
  * loop lifecycle

Rules:

* no same instrument reused for same role > X bars
* avoid repeating same instrument for same enemy type

**Goal**
👉 stop “same sound forever” problem

---

## 3. Snap ALL gameplay-triggered sounds to grid

**Task**

* player/projectile events:

  * quantize to nearest step (or next step)
* optionally:

  * small latency buffer (e.g. 30–80ms)

Rules:

* NEVER play off-grid
* late is better than off-beat

**Goal**
👉 restore groove immediately

---

## 4. Add global gain staging per step

**Task**

* before playback:

  * count active sounds
  * apply gain scaling

Example:

```
1 sound → 1.0
2 sounds → 0.8
3 sounds → 0.65
4+ → 0.5
```

Also:

* cap same-note stacking

**Goal**
👉 stop loudness spikes and mush

---

## 5. Fix spawner identity + dedupe

**Task**

* enforce:

  * one pattern per spawner identity
* when spawning:

  * check similarity vs active patterns
  * reject or mutate if too close

Also:

* ensure trigger reliability:

  * debug: created vs triggered per spawner

**Goal**
👉 no duplicate musical voices

---

## 6. Introduce loop ownership (CRITICAL)

**Task**

* at any time:

  * exactly 1 “active loop owner”

Lifecycle:

```
introduced → establishing → active → support → retired
```

Rules:

* only 1 loop can be foreground
* others must be background or silent

**Goal**
👉 music feels intentional

---

## 7. Separate “music timing” from “game timing”

**Task**

* music system owns:

  * beat grid
  * step timing

Gameplay:

* submits “intent to fire”
* music system decides WHEN it plays

**Goal**
👉 audio becomes authoritative, not reactive

---

## 8. Add per-role note limits (hard caps)

Per step:

* 1 bass
* 1 loop note
* 1 accent
* optional player

Everything else:
👉 dropped or deferred

**Goal**
👉 instant clarity improvement

---

## 9. Fix death accents (they’re currently spammy)

From timeline:

* lots of identical `C4 TONE` accents

**Task**

* limit:

  * max 1 death accent per step
* vary:

  * pitch OR instrument
* downgrade most to background

**Goal**
👉 stop “C4 spam noise”

---

## 10. Add “musical sanity checks” to Music Lab

Add:

* same-note collisions per step
* off-grid events count
* instrument repetition rate
* loop ownership changes
* per-step sound count

**Goal**
👉 make musical problems visible automatically

---

# 🧪 Acceptance Criteria (very important)

Codex should aim for:

* intro clearly sounds like a **repeatable drum loop**
* bass is **audible and consistent**
* player shots feel **locked to rhythm**
* no obvious **volume spikes**
* sounds **change over time**
* no more “same C4 spam”
* at any moment, you can answer:
  👉 “what is the main musical idea right now?”

---

# 🔥 One-line direction for Codex

> **Stop treating music as simultaneous events — enforce ownership, timing authority, and voice limits so it behaves like a composed track.**
