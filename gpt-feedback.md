
---

# 🎵 Beat Swarm – Level 1 Music & Gameplay Intent Brief

## 1. Core Goal

Level 1 of Beat Swarm is **not a fixed song** and **not a fully open music system**.

It is:

> A structured, readable onboarding into a **generated retro shmup music experience**, where:

* the player discovers musical interaction step-by-step
* the system builds into a recognisable shmup-style track
* each run feels different
* player-created motifs can become part of the music
* the music directly drives enemy intensity and behaviour

---

## 2. Design Principles

### 2.1 Fixed Structure, Variable Content

We are authoring:

* **player understanding progression**
* **musical role structure**
* **intensity curve**

We are NOT authoring:

* exact notes
* exact phrases
* exact orchestration
* exact enemy mappings

---

### 2.2 Readability First

At all times, the player should be able to understand:

* what layer they are hearing
* what changed
* why it changed

If readability and musical richness conflict:

> **readability wins**

---

### 2.3 Music Drives Gameplay

Music is the **source of truth** for:

* enemy spawn intensity
* attack density
* formation behaviour
* pacing

Gameplay systems must **react to music**, not redefine it.

---

### 2.4 Generated, Not Scripted

Every run must:

* feel fresh
* vary in phrasing, motif, and arrangement
* still land within a recognisable shmup style

---

## 3. Phase Structure (Authoritative)

Level 1 follows a fixed progression of **player understanding**:

---

### Phase 1: “My Gun Makes Music”

**Goal:** Player notices their own musical impact

* Only player-driven sound is clearly audible
* Minimal or no backing
* No competing layers

**Constraints:**

* No full rhythm bed
* No melodic layering
* No clutter

---

### Phase 2: “There’s a Beat”

**Goal:** Introduce a stable rhythmic foundation

* A simple, clear beat emerges
* Player audio sits on top

**Constraints:**

* One rhythm layer only
* Highly regular
* Must be easy to lock onto

---

### Phase 3: “There’s a Second Beat”

**Goal:** Show layering

* A second rhythmic layer appears
* Player hears interplay between layers

**Constraints:**

* Max 2 rhythm layers
* Distinct roles (not duplicates)
* Must remain readable

---

### Phase 4: “Shmup Track Emerges” (Full Texture)

**Goal:** Transition into full experience

* Retro shmup-style structure appears:

  * foundation groove
  * counter rhythm
  * lead phrase
  * occasional ornament

**Constraints:**

* Only one lead at a time
* No sparkle/noise layers
* Ornaments only at cadence moments
* Groove must remain audible under everything

---

## 4. Musical Role Contract (Level 1)

This is the **authoritative role system**.

### Allowed Roles

* `foundation_groove` (always present after Phase 2)
* `counter_rhythm` (enters Phase 3+)
* `lead_phrase` (enters Phase 4)
* `answer_ornament` (cadence-only)

### Forbidden Roles

* sparkle layers
* dense support stacks
* ambient filler layers

### Hard Rules

* Only **one lead_phrase** at a time
* foundation must **never drop out**
* counter rhythm must **remain audible under lead**
* ornaments must be **timed, not continuous**

---

## 5. Player Motif Integration

Player-generated motifs (from toys):

Must:

* be able to **replace or drive the lead**
* be rhythmically aligned to the current groove
* be constrained to maintain readability

Must NOT:

* introduce chaos
* override core groove
* create multiple competing leads

---

## 6. Variability Model

Each run should vary in:

* rhythm patterns
* lead phrasing
* instrument selection
* motif usage
* timing of transitions
* ornament placement

Each run should NOT vary in:

* phase order
* role structure
* readability
* intensity curve direction

---

## 7. Music → Gameplay Mapping

Music intensity should directly control:

| Music Change          | Gameplay Response       |
| --------------------- | ----------------------- |
| More layers           | More enemies            |
| Faster rhythm density | Faster attacks          |
| Stronger accents      | Stronger hits / events  |
| Lead active           | Focused enemy patterns  |
| Cadence moment        | Event spikes / emphasis |

Important:

> Gameplay adapts to music, never the other way around (except in failure cases).

---

## 8. Architectural Direction (Critical)

### 8.1 Single Source of Truth

Create a **Level 1 Music Contract Module**

Example:

```
beat-swarm-level1-contract.js
```

It defines:

* allowed roles per phase
* role limits
* forbidden roles
* transition conditions
* protection rules (what must never disappear)

---

### 8.2 Systems Become Consumers, Not Authors

The following systems must **stop making independent musical decisions**:

* lane planner
* composer maintenance
* lifecycle
* spawn logic
* readability fallback

Instead, they:

> read the contract and obey it

---

### 8.3 Separate Music from Realisation

Two layers:

**Music Layer (authoritative)**

* decides roles
* decides timing
* decides transitions

**Battlefield Layer (adaptive)**

* decides which enemies carry roles
* decides positioning/formation
* reacts to intensity

Battlefield must NOT:

* redefine roles
* introduce new musical layers

---

### 8.4 Remove Competing Safety Systems

Temporarily disable or reduce:

* recovery floors
* automatic support filling
* over-aggressive fallback systems
* emergent role creation

These are currently causing oscillation.

---

## 9. Success Criteria

A correct Level 1 run should:

* clearly teach:

  * “my gun makes music”
  * “there’s a beat”
  * “there’s layering”
* transition smoothly into a shmup-style track
* feel musically coherent
* feel different each run
* maintain readability throughout
* drive enemy behaviour in a noticeable way

---

## 10. Anti-Goals (What We Are NOT Doing)

* Not building a fully general adaptive music system (yet)
* Not authoring a fixed level-1 song
* Not maximising musical complexity
* Not allowing all systems to “help” shape music

---

## 11. Immediate Next Steps for Codex

1. Extract Level 1 rules into a **single contract module**
2. Route all musical decisions through that contract
3. Remove or disable conflicting adaptive behaviours
4. Ensure phase progression is stable and readable
5. Validate runs against:

   * readability
   * role correctness
   * variation between runs
6. Only after stable baseline:

   * reintroduce controlled flexibility

---

## One-Line Summary for Codex

> Build a constrained, readable, phase-driven shmup music generator where structure is fixed, content is variable, and all systems obey a single Level 1 contract.

---