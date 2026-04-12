# Beat Swarm: Role-Driven Formation Spawning Brief

## Goal

Add a **visual formation layer** to Beat Swarm so enemy spawning and movement visibly reinforce the music.

This should make the player able to read, on screen:

* what is the **foundation / pulse**
* what is the **counter-rhythm**
* what is the **lead melody**
* what is the **answer / ornament**

The core rule is:

> Music roles drive formation choice first.
> Enemy body/family styles flavor the result second.

This should build on the current architecture, not replace it.

Relevant existing files:

* `beat-swarm-next-steps.md`
* `src/beat-swarm/beat-swarm-mode.js`
* `src/beat-swarm/beat-swarm-composer-maintenance.js`
* `src/beat-swarm/beat-swarm-composer-lifecycle.js`
* `src/beat-swarm/beat-swarm-composer-spawn.js`
* `src/beat-swarm/beat-swarm-enemy-update.js`
* `src/beat-swarm/beat-swarm-pacing.js`

---

## Why this exists

The current system is much healthier structurally than before:

* protected lane ownership is better
* intro handoff is better
* `lead_entry_merge` exists
* duplicate role clutter is lower
* support roles can survive more reliably

But the next problem is now **presentation and perceptual richness**, not core ownership.

Current likely failure mode:

* roles may exist logically
* but they are not always **clearly staged visually**
* the arrangement can still feel too thin once lead enters
* support may be technically present but perceptually weak
* enemy motion still risks looking like “stuff happening” instead of “music made visible”

We want to fix that by giving each music role a distinct visual language.

---

# Design principles

## 1. Roles own screen language

Each role should have defaults for:

* spawn region
* spacing
* path shape
* movement smoothness
* symmetry
* pulse behavior
* lifespan
* density

The player should be able to infer role from motion alone.

## 2. Formations are orchestration, not decoration

Formations are not just prettier spawns.
They are the **visual equivalent of arrangement**.

* foundation should look stable
* rhythm should look stepped / punctuated
* lead should look like a phrase line
* answer should look like a reply

## 3. Enemy family is style input, not role ownership

Snake-like, spawner-like, composer-group, etc. should influence:

* motion style
* silhouette
* phrase curvature
* attack feel

But they should not determine lane ownership.

## 4. `lead_entry_merge` must be visually authored

This phase is the most important test case.

During intro → lead handoff:

* keep pulse/backbeat visibly present
* introduce lead with a clear melodic formation
* prevent support from immediately fading into irrelevance
* create screen separation between lead and support roles

---

# Required outcome

After this work, a player watching the screen during Beat Swarm should be able to say:

* “that pair is the groove”
* “that sweep is the melody”
* “those little pops are the response”

If that is not true, the feature is not done.

---

# Musical role to formation mapping

## A. `foundation_groove`

### Visual feel

Stable, predictable, anchoring, metronomic.

### Good formations

* horizontal anchor line
* mirrored side braces
* slow orbit ring
* evenly spaced lane march

### Motion rules

* low variance
* little lateral chaos
* predictable timing
* consistent spacing
* should remain readable even in denser sections

### Spawn defaults

* lower or outer playfield
* broad spacing
* low curvature
* long lifespan

### Notes

This is the “the groove exists” layer.

---

## B. `counter_rhythm`

### Visual feel

Stepped, syncopated, percussive, structured interruption.

### Good formations

* staggered diagonal staircase
* alternating side bursts
* offset pair pulses
* broken zig-zag entry

### Motion rules

* clearer subdivision than foundation
* more offset timing
* should not look like lead phrasing
* should read as accents and structure

### Spawn defaults

* side lanes or diagonal entries
* medium spacing
* moderate lifespan
* pulse in and out on accent beats

### Notes

This is the visible backbeat / syncopation layer.

---

## C. `lead_phrase`

### Visual feel

Singing, sweeping, contour-based, phrase-shaped.

### Good formations

* arc sweep
* melody ribbon
* serpent contour line
* rise/fall crescent

### Motion rules

* long directional continuity
* visible contour
* smoother motion than rhythm roles
* should feel like a line drawn across the screen

### Spawn defaults

* upper-middle or strongly readable lane
* strong screen separation from foundation
* medium-to-long lifespan
* should preserve phrase identity across several beats

### Notes

This should be the most obviously musical formation.

---

## D. `answer_ornament`

### Visual feel

Brief, responsive, echo-like, punctuation.

### Good formations

* mirrored reply arc
* short pop cluster
* endcap echo
* sparkle burst

### Motion rules

* short lifespan
* small spatial footprint
* appears after lead phrase or around phrase endings
* never dominates the screen

### Spawn defaults

* near lead endpoint or opposing screen side
* tighter grouping
* quick fade/exit

### Notes

This should feel like a reply, not another main part.

---

## Optional E. `sparkle_motion`

### Visual feel

Transient texture, energy lift, not core structure.

### Good formations

* tiny crossing flares
* quick orbit fragments
* very short accent streaks

### Notes

Only use in fuller sections. Never let this bury foundation or answer.

---

# Formation archetypes to implement first

Implement a small set first. Do not build a giant general system yet.

## Required first archetypes

* `foundation_anchor_line`
* `backbeat_pair`
* `syncopation_stair`
* `lead_arc`
* `answer_echo`

These five are enough to prove the concept.

---

# Suggested data shape

Add a lightweight formation definition layer.

## Formation spec

Each spawnable role presentation should be able to resolve to something like:

```js
{
  role: "lead_phrase",
  archetype: "lead_arc",
  styleFamily: "snake_like",
  spawnRegion: "upper_mid",
  motionProfile: "arc_sweep",
  timingProfile: "phrase_sustain",
  spacingProfile: "loose_chain",
  pulseProfile: "phrase_accented",
  lifespanBeats: 4,
  memberCount: 3,
  symmetry: "none"
}
```

This does not need to be perfect or deeply abstract at first.

---

# Suggested system split

## 1. Role resolution

Use existing composer/director logic to decide:

* what role is being spawned
* what section state is active
* whether this is intro / merge / full texture / breakdown / etc.

This already mostly exists.

## 2. Formation selection

New layer:

* pick a formation archetype based on role + section + style family

Example:

```js
selectFormationForRole({
  role,
  sectionState,
  styleFamily,
  phraseShape,
  intensity
})
```

## 3. Member layout generation

New helper:

* take archetype and generate spawn positions / offsets / path params

Example:

```js
buildFormationLayout({
  archetype,
  anchorPoint,
  memberCount,
  spacing,
  orientation,
  arenaBounds
})
```

## 4. Enemy body assignment

Existing enemy/spawn logic should then instantiate actual units using that layout.

Important:

* formation decides the arrangement
* enemy family skins the arrangement

## 5. Runtime motion binding

Each formation should expose motion params that enemy update/runtime can follow.

This can be simple at first:

* anchor + offset + oscillation
* arc target
* stagger phase offset
* mirrored drift
* follow-the-leader chain

---

# Where this should live

## New file suggested

Create a new module, something like:

* `src/beat-swarm/beat-swarm-formation-spawn.js`

Optional follow-up helpers:

* `src/beat-swarm/beat-swarm-formations.js`
* `src/beat-swarm/beat-swarm-formation-motion.js`

Do not dump this into `beat-swarm-mode.js` unless absolutely necessary.

Your file size rule matters here.

---

# Integration points

## `beat-swarm-composer-spawn.js`

Use this as a likely entry point for:

* role-aware formation requests
* passing role/style/section into the formation layer

## `beat-swarm-composer-maintenance.js`

Use this for:

* preserving formation identity during role continuity
* especially intro pulse/backbeat → bridge → full texture

Important:
If a lane survives a handoff, try to preserve the formation family or evolve it smoothly instead of hard-swapping instantly.

## `beat-swarm-composer-lifecycle.js`

Use this for:

* deciding which role families should remain present
* preventing de-emphasis from making support visually disappear during merge

May need a new rule:

* role survives not just musically, but visually, for minimum merge bars

## `beat-swarm-enemy-update.js`

Use this for:

* formation motion playback
* per-member movement offsets
* stagger/mirror behavior

Keep this light. Avoid turning it into a giant formation brain.

---

# Special handling: intro to main handoff

This is the first required use case.

## Desired visual behavior

### `intro_pulse`

* one very readable stable pulse formation
* probably `foundation_anchor_line`

### `intro_backbeat_bridge`

* add one distinct support formation
* probably `backbeat_pair`

### `lead_entry_merge`

* keep pulse visible
* keep backbeat visible
* introduce lead using a clearly melodic formation
* likely `lead_arc`
* do not let support visually collapse during the first few bars of merge

### `full_texture`

* allow answer/ornament to join
* likely `answer_echo`
* keep screen language distinct by role

## Temporary guardrail

For the first implementation, add a merge safety rule:

* during `lead_entry_merge`, protected non-lead support roles cannot be visually de-emphasized below a minimum threshold for N bars

This avoids “lead arrives, support technically exists, but vanishes perceptually.”

---

# Concrete behavior examples

## Example 1: Lead phrase

Input:

* role = `lead_phrase`
* style family = `snake_like`

Output:

* formation = `lead_arc`
* 2–4 members
* curved sweep path
* rising then falling arc
* upper-middle screen region
* phrase lasts 3–5 beats

Result:
The lead looks like a musical contour.

---

## Example 2: Counter-rhythm

Input:

* role = `counter_rhythm`
* style family = `spawner_like`

Output:

* formation = `syncopation_stair`
* 3 members
* diagonal staggered layout
* stepwise movement
* side-entry with beat-offset pulses

Result:
The player sees syncopation instead of generic clutter.

---

## Example 3: Answer

Input:

* role = `answer_ornament`
* prior lead endpoint known

Output:

* formation = `answer_echo`
* 1–2 members
* appears near phrase endpoint or mirrored opposite side
* short duration
* slight reply arc or pop

Result:
The visual reads as response, not a new main voice.

---

# Metrics to add

Do not just track whether a role exists.
Track whether it is readable.

## Add metrics for:

* bars where `counter_rhythm` exists but average visual presence is too low
* bars where `lead_phrase` exists but no visually distinct support formation is also present
* time from lead entry to first visible `answer_ornament`
* number of beats where at least 3 distinct role silhouettes are concurrently readable
* merge windows where support roles are de-emphasized too quickly
* formation diversity per run
* section states vs visible role composition

## Nice debug output

Per active role, expose:

* role
* formation archetype
* style family
* spawn region
* member count
* visual weight
* merge protection active yes/no

This should probably feed Music Lab eventually.

---

# Constraints

## Do not do these

* do not restore literal snake/spawner lane ownership
* do not rebuild music generation around enemy family
* do not hardcode bespoke intro-only bodies again
* do not add giant one-off transition hacks
* do not make every role use the same motion with different labels
* do not bury this inside `beat-swarm-mode.js` if a module split is possible

## Must preserve

* protected lane ownership
* phrase-boundary handoff behavior
* continuity buffering
* intro teaching structure
* current role-based direction from `beat-swarm-next-steps.md`

---

# Implementation order

## Phase 1: Skeleton

* create formation selection module
* define the 5 first archetypes
* wire role → archetype selection
* support basic layout generation

## Phase 2: Intro / merge pass

* apply formations to intro pulse, intro backbeat, lead entry merge
* enforce minimum visual persistence for support during merge
* confirm lead visibly differs from support

## Phase 3: Runtime motion

* implement simple role-distinct movement patterns
* anchor line
* pair pulse
* stair stagger
* arc sweep
* reply pop

## Phase 4: Metrics / debug

* expose active formation info
* log merge failures
* log role visibility/readability

## Phase 5: Extension

* add optional sparkle layer
* add more style-family variation
* evolve archetypes per section without losing role identity

---

# Definition of done

This work is successful when:

## Musical readability

Watching the screen, a human can identify:

* groove
* lead
* reply

without needing debug tools.

## Transition quality

During intro → main:

* pulse remains visible
* backbeat remains visible
* lead enters clearly
* support does not perceptually vanish

## Arrangement richness

Longer runs regularly show:

* foundation
* counter-rhythm
* lead
* answer/ornament

as distinct staged presences, not just labels in state.

## Maintainability

The formation system is modular enough that new archetypes can be added without touching core ownership logic.

---

# Short instruction to Codex

Implement a lightweight, role-driven formation spawning layer for Beat Swarm.

Start with five formation archetypes:

* foundation anchor line
* backbeat pair
* syncopation stair
* lead arc
* answer echo

Use music role first, enemy family style second.

Prioritize the intro → lead-entry merge path first, because that is where current perceptual weakness is most obvious.

The outcome should be that Beat Swarm’s music is visibly legible on screen, not just logically correct in the director.

---
