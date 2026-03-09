# Beat Swarm Director – Concise Implementation Plan

## Goal

Implement a **music-first battlefield director** for Beat Swarm that keeps combat, visuals, and music synchronized, while improving pacing, readability, and long-term difficulty ramping.

---

## Core Principles

### 1. Beat-locked world

All key events happen on the beat grid:

* player shots
* enemy deaths
* explosions
* spawner actions
* drawsnake actions
* grouped enemy actions

### 2. Sound and action are linked

Every audible note must have a visible action.
Every major visible action should have an audible note or rhythmic sound.

### 3. Everyone can participate, not everyone can be dangerous

Many actors may perform on a beat, but only a limited number may perform full-threat actions.

### 4. Pentatonic safety

All notes remain within the active pentatonic note pool.

---

## Director Responsibilities

The Director should:

1. Track the beat/bar grid
2. Maintain the current note pool
3. Maintain pacing / energy state
4. Limit threat density per beat
5. Decide participation priority by role
6. Support recurring themes and call-and-response
7. Apply adaptive pacing via energy gravity

The Director should **not** micromanage all AI logic. Existing systems still decide what they want to do; the Director decides how and when those actions are allowed to perform.

---

## Musical Roles

### Bass / Groove

Used for:

* spawners
* large enemy attacks
* major explosions

Purpose:

* anchor groove
* provide weight
* signal danger clearly

### Lead / Phrase

Used for:

* drawsnakes
* coordinated enemy groups
* special enemies

Purpose:

* melodic phrasing
* call-and-response
* identity and variation

### Accent

Used for:

* enemy deaths
* minor bursts
* small enemy actions

Purpose:

* punctuation
* kill feedback
* rhythmic fill

### Motion

Used for:

* pulses
* recoil
* shield shimmer
* cosmetic sync gestures

Purpose:

* make the battlefield bounce together without increasing difficulty

---

## Action Threat Classes

Every performed event should be assigned one of these classes:

### Full Threat

Examples:

* real projectile launch
* aimed burst
* dangerous spawn
* sweeping attack

### Light Threat

Examples:

* short-range pop
* micro explosion
* minor burst
* low-danger hazard

### Cosmetic

Examples:

* flash
* recoil
* sprite pulse
* glow ring

Rule: the Director limits **full threats per beat**, not total participation.

---

## Existing System Mapping

### Dumb enemies

* No uncontrolled random notes
* On death, wait for beat
* Pick note from current pool
* Produce accent event + visible burst
* Cluster multiple simultaneous deaths cleanly

### Spawners

* Main groove engine
* Behave as bass / percussion layer
* Keep patterns simple and readable

### Drawsnakes

* Main lead / phrase engine
* Carry melody and motion
* Good source of call-and-response

### Grouped enemies

* Use for coordinated phrase behaviour
* Best place for call-and-response patterns

### Player weapon

* Still beat-locked
* Notes and firing remain linked
* Drawgrid logic still controls sequence and silence
* Damage scaling remains tied to simultaneous active notes

Damage rule currently assumed:

* 8 notes = 1x
* 4 notes = 2x
* 2 notes = 4x
* 1 note = 8x

Do not rebalance yet; just preserve support for this mechanic.

---

## Beat Grid

Initial implementation can stay on **8 steps per bar**.
Later expansion to 16 steps is allowed.

Recommendation:

* build the Director around generic step counts
* start by tuning for 8-step bars

---

## Harmonic Control

Per bar, the Director should define:

* active pentatonic scale
* restricted note pool for that bar
* optional phrase bias (for recurring motifs)

Example:

* scale: C pentatonic
* note pool this bar: C, E, G

All enemy note generation should route through this pool.

---

## Performed Beat Event Model

Each scheduled event should contain at least:

* actor id
* beat time / step index
* role (bass / lead / accent / motion)
* note
* instrument / sound id
* action type
* threat class
* visual sync type

This should become the common format used by the Director and gameplay systems.

---

## Pacing System

Replace simple verse/chorus thinking with **energy states**.

### Energy States

#### Intro

Purpose:

* establish groove
* low danger
* high clarity

#### Build

Purpose:

* increase density
* introduce lead phrases
* start simple call-and-response

#### Clash

Purpose:

* main combat intensity
* multiple active layers
* strongest normal play state

#### Break

Purpose:

* breathing room
* reduce danger
* keep musical continuity

#### Peak

Purpose:

* spectacle moment
* strongest coordination
* highest density and visual sync

These states can still align with verse/chorus labels if useful, but energy states should drive gameplay pacing.

---

## State Flow

Example looping flow:

* Intro
* Build
* Clash
* Break
* Build
* Clash
* Peak
* Break

The Director should be able to move between states based on:

* elapsed bars
* combat pressure
* player performance
* current energy gravity

---

## Recurring Themes

To preserve recurring musical identity, the Director should support:

* repeated note pools
* repeated phrase shapes
* repeated rhythmic patterns
* repeated role usage per state

This is how “chorus-like” familiarity should emerge.

Do not hard-author long songs.
Author short reusable motifs and state patterns instead.

---

## Energy Gravity

Energy Gravity is the adaptive pacing system.
It nudges the Director toward higher or lower intensity without obvious rubber-banding.

### Intent

* If the player is doing well, the system gradually drifts upward in energy
* If the player is struggling, the system gradually drifts downward or holds in safer states

### Inputs to consider

* player health / shield status
* recent damage taken
* kill speed / clear speed
* survival duration
* incoming threat load
* how overwhelmed the player appears

### Output

Energy Gravity should influence:

* state transition likelihood
* threat density budget
* number of participating actors
* call-and-response complexity
* peak frequency

### Important rule

Energy Gravity should be **slow and subtle**.
It should shape the next few bars, not instantly react every beat.

---

## Budgets Per Beat / Bar

The Director should maintain at least these budgets:

### Per Beat

* max full threats
* max light threats
* optional max audible accents

### Per Bar

* target note density
* target active roles
* phrase complexity level
* call-and-response usage level

These budgets should vary by energy state.

---

## Suggested Implementation Order

### Step 1 – Director Skeleton

Create a central Director module that tracks:

* current bar
* current step
* current energy state
* current note pool
* per-beat threat budgets

### Step 2 – Common Event Format

Create the performed beat event structure and route quantized events through it.

### Step 3 – Harmonic Clamp

Clamp enemy-generated notes to the active note pool.
Start with dumb enemy deaths.

### Step 4 – Role Mapping

Assign default roles:

* spawners = bass
* drawsnakes = lead
* dumb enemies = accent
* cosmetic sync systems = motion

### Step 5 – Threat Budgeting

Limit full-threat actions per beat while allowing wider cosmetic participation.

### Step 6 – Energy States

Implement Intro / Build / Clash / Break / Peak and allow simple bar-based transitions.

### Step 7 – Recurring Themes

Add repeated phrase pools, note pools, and rhythmic motifs per state.

### Step 8 – Call-and-Response

Teach grouped enemies / drawsnakes to alternate phrases between groups.

### Step 9 – Energy Gravity

Add performance-based pacing drift to influence state transitions and budgets.

### Step 10 – Tuning Pass

Tune:

* note density
* danger density
* phrase repetition
* player readability
* how strongly the battlefield “bounces together”

---

## Non-Goals For First Pass

Do not solve these yet:

* full weapon damage rebalance
* 16-step bar expansion
* advanced dynamic instrumentation
* long-form song authoring
* final difficulty curve

First pass goal is:
**make Beat Swarm feel coherent, musical, readable, and fun in test play.**

---

## Success Criteria

The implementation is working when:

1. The battlefield visibly pulses together on beat
2. Enemy deaths sound intentional instead of random
3. Spawners feel like groove
4. Drawsnakes feel like melody
5. Group actions feel coordinated
6. The player can read danger despite high participation
7. Intensity rises and falls naturally over time
8. The mode feels like a hostile retro arcade orchestra
