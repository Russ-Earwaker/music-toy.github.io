# Beat Swarm Percussion Build-Up Plan

## Explainer

Right now Beat Swarm percussion still behaves too much like:

- generate one drum loop
- mutate it
- mutate it again
- sometimes replace it

That creates rhythm that is technically active, but not always stable, learnable, or satisfying.

A stronger groove usually works differently:

- a core pulse establishes itself
- then a backbeat or accent layer gives it shape
- then a motion layer adds momentum
- then occasional ornaments or fills add excitement
- later, layers can be removed again

So the next step is to move from:

- single-loop mutation

to:

- layered groove construction

The goal is:

> a beat the player can recognise, feel, and anticipate

This matters in Beat Swarm because:

- the player learns the music while playing
- the battlefield is visually tied to the sound
- if the beat changes too quickly, it stops feeling like a track and starts feeling like noise

## Core Design Rule

Do not treat the beat as one pattern that gets replaced or heavily mutated.

Instead, define a groove as:

- pulse layer
- backbeat layer
- motion layer
- ornament layer

Each layer should have:

- its own pattern
- its own lock duration
- its own add/remove rules
- its own allowed variation level

## Groove Layer Model

### 1. Pulse Layer

This is the foundation of the groove.

Typical sounds:

- `TIGHT ELECTRONIC KICK`
- `BASS TONE 1`
- `SYNTH SUB BASS`
- other low rhythmic thumps

Role:

- establish the beat
- remain the most stable layer
- be readable for a long time

Rules:

- simplest pattern
- longest lock
- minimal mutation
- should survive most pacing changes

Suggested lock:

- `16` bars minimum

### 2. Backbeat Layer

This gives the beat shape and body.

Typical sounds:

- snare / clap sounds
- punchy rhythmic accents
- occasional structural stabs

Role:

- make the groove feel structured
- support the pulse
- reinforce section identity

Rules:

- simpler than motion
- can come in after pulse is established
- can drop out for contrast

Suggested lock:

- `8` bars minimum

### 3. Motion Layer

This creates movement and drive.

Typical sounds:

- hats
- clicks
- ticks
- light arps used rhythmically

Role:

- keep the groove moving
- fill space between bigger hits
- increase energy without changing the core groove

Rules:

- can vary more than pulse/backbeat
- should not redefine the beat
- should mostly decorate or energise the existing groove

Suggested lock:

- `4-8` bars

### 4. Ornament Layer

This is for occasional excitement.

Typical sounds:

- glitch ticks
- short risers
- special rhythmic fills
- boss or special-event flourishes

Role:

- short bursts of variation
- section peaks
- accents around events

Rules:

- shortest lifetime
- optional
- never required for groove identity

Suggested lock:

- `1-2` bars maximum

## Groove Lifecycle

### Phase A - Establish

- pulse only
- maybe very light motion
- no heavy mutation

Goal:

- player learns the beat

### Phase B - Lock

- pulse continues
- add backbeat or motion
- groove becomes recognisable

Goal:

- beat feels intentional

### Phase C - Build

- add motion
- maybe strengthen backbeat
- controlled increase in density

Goal:

- more energy without losing identity

### Phase D - Peak

- all key layers present
- ornament allowed briefly
- short duration only

Goal:

- excitement

### Phase E - Release

- remove ornament
- maybe remove motion
- return to stable pulse/backbeat

Goal:

- breathing room and contrast

## Implementation Plan

### Step 1 - Introduce Explicit Groove-Layer State

Create a groove-state model for percussion ownership and maintenance.

Example:

```js
grooveState = {
  pulse: {
    patternId,
    steps,
    lockBarsRemaining,
    active,
    variationSeed
  },
  backbeat: {
    patternId,
    steps,
    lockBarsRemaining,
    active,
    variationSeed
  },
  motion: {
    patternId,
    steps,
    lockBarsRemaining,
    active,
    variationSeed
  },
  ornament: {
    patternId,
    steps,
    lockBarsRemaining,
    active,
    variationSeed
  }
};
```

Important:

- each layer should be independently owned
- do not collapse them into one merged loop internally

### Step 2 - Assign Sample Families To Groove Layers

Use sample metadata explicitly where possible.

Suggested mapping:

- pulse:
  - `foundation`
  - low register
  - kick / bass pulse / thump
- backbeat:
  - accent or percussion sounds that are not too busy
  - mid-register rhythmic hits
- motion:
  - high-register support/percussion
  - hats, clicks, ticks
  - light rhythmic arps
- ornament:
  - glitch, sweep, special-event accent material

### Step 3 - Generate Each Layer Separately

Generate:

- pulse pattern
- backbeat pattern
- motion pattern
- ornament pattern

Layer rules:

- pulse:
  - simple
  - repeated
  - few active steps
  - strong downbeat emphasis
- backbeat:
  - clear rhythmic support
  - anchored structural hits
- motion:
  - more frequent events
  - offbeats and subdivisions
  - energy support
- ornament:
  - sparse
  - short-lived
  - event-driven or climax-driven

### Step 4 - Add Layer Locks

Each layer should have a minimum lifetime in bars.

Rules:

- do not replace a layer while locked
- do not heavily mutate a layer while locked
- only allow light internal variation during the lock

Suggested defaults:

- pulse: `16` bars
- backbeat: `8` bars
- motion: `4-8` bars
- ornament: `1-2` bars

### Step 5 - Replace Whole-Loop Mutation With Micro-Variation

Allowed:

- mute one step occasionally
- swap one nearby step
- add or remove one light hit
- slight per-hit level variation if supported
- rotate a supporting pattern only at phrase boundaries

Not allowed:

- rewrite whole pulse frequently
- replace groove identity every few bars
- mutate multiple layers at once unless entering a deliberate new section

### Step 6 - Add Build-Up Logic Based On Section And Pacing

Suggested mapping:

- low pressure / intro:
  - pulse only
- light engagement:
  - pulse + motion
- medium engagement:
  - pulse + backbeat + light motion
- high engagement:
  - pulse + backbeat + motion
- peak / boss:
  - all layers, with controlled ornament

Important:

- building up should mostly mean adding layers
- calming down should mostly mean removing layers
- not replacing the core pulse every time

### Step 7 - Preserve Groove Continuity Through Ownership Changes

If the visible owner changes:

- do not rebuild the groove from scratch
- preserve active groove layers
- hand them off
- let continuity buffers or phrase completion finish where needed

The groove should belong to the musical system, not one disposable actor.

### Step 8 - Add Groove Stability Metrics

Add metrics such as:

- `pulsePatternChangeRate`
- `backbeatPatternChangeRate`
- `motionPatternChangeRate`
- `barsSincePulseIntroduced`
- `barsSinceBackbeatIntroduced`
- `activeGrooveLayerCount`
- `grooveContinuityBreaks`
- `grooveSectionBuildEvents`
- `grooveSectionDropEvents`

These are more actionable than generic loop-change counters.

## Guardrails

### 1. Do Not Let Motion Become The Groove

Motion should support the beat, not replace it.

### 2. Do Not Let Ornament Define Identity

Ornaments are spice, not structure.

### 3. Do Not Change Pulse Too Often

If the pulse changes too often, the whole groove stops being learnable.

### 4. Build By Addition, Not Replacement

Most of the time, sections should feel like:

- we added something

not:

- the beat got swapped out

## First Implementation Target

Minimum viable first pass:

- pulse layer
- backbeat layer
- motion layer

Keep ornament minimal at first.

Use:

- one stable pulse
- one optional backbeat
- one optional motion layer

If that works, percussion should already feel much more intentional.

## Acceptance Criteria

- the player can recognise the beat after a few bars
- pulse stays stable long enough to feel like the song's foundation
- the groove builds by adding layers, not random loop replacement
- motion increases energy without destroying identity
- the beat can simplify again after peaks
- percussion feels like a growing groove, not a constantly mutating loop

## One-Line Summary

> Refactor Beat Swarm percussion from a single mutating drum loop into a layered groove system with pulse, backbeat, motion, and ornament layers that are independently generated, locked for minimum bar counts, and built up over time by adding and removing layers rather than replacing the whole beat.
