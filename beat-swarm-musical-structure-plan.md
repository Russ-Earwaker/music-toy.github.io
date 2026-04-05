# Beat Swarm Musical Structure Plan

## Goal

Add a higher-level structure layer above local generation and mix control so Beat Swarm can form recognisable arcs over time instead of only making locally correct decisions.

The system should produce:

- recognisable themes
- clear sections
- build and release cycles
- intentional returns
- drop moments with payoff

Important scope:

- this plan assumes the structural reconstruction described in [beat-swarm-next-steps.md](/d:/Desktop/music-toy/music-toy.github.io/beat-swarm-next-steps.md)
- it should now target an explicit arrangement shape:
  - `foundation`
  - `counter-rhythm`
  - `lead`
  - `answer/ornament`
  - optional `sparkle/motion`

So this plan is no longer:

> hope richer layering emerges from local behavior

It is:

> define how explicit arrangement roles evolve over time

## Why This Is Needed

The current roadmap already improves:

- clarity
- layering
- phrase stability
- anti-repetition
- local pacing

But those improvements do not automatically guarantee:

- recurring themes
- section identity
- return moments
- emotional payoff
- track-like motion over time

Right now the system is mostly:

> making good decisions each bar

What it needs to become is:

> building a track over time

## Core Missing Layer

Add a top-level:

- musical structure layer

This should sit above:

- groove layering
- call-and-answer
- density shaping
- palette selection

It should decide:

- what the current section is
- which motifs are active
- which arrangement roles are active
- how energy should rise or fall
- when to thin out for contrast
- when to bring material back for recognition
- when `answer/ornament` and `sparkle` should enter or leave

## 1. Recurring Themes And Motif Identity

### Problem

Anti-repetition work reduces stale reuse, but it can also weaken identity if nothing returns clearly enough.

### Direction

Generate a small number of core motifs per run and let the system reuse and vary them deliberately.

Example:

```js
themeMotif = {
  motifId,
  contour,
  rhythmShape,
  pitchPool,
  roleBias
};
```

Suggested use:

- `1-3` core motifs per run
- assign them to likely arrangement roles such as:
  - `lead_phrase`
  - `counter_rhythm`
  - `answer_ornament`
- reintroduce them later with light variation

Working rule:

> Do not eliminate repetition. Control it.

## 2. Section System

### Problem

The system has pacing signals, but not enough explicit section identity.

### Direction

Add a real section model.

Example:

```js
sectionState = {
  type: "intro" | "build" | "peak" | "drop" | "release" | "rebuild",
  durationBars,
  energyLevel,
  activeRoles,
  themeFocus
};
```

Example section flow:

```text
Intro -> Build -> Peak -> Drop -> Rebuild -> Peak -> Release
```

What this gives:

- recognisable phases
- expectation
- payoff
- explicit control over which layers are allowed to speak

## 3. Drop Moments

### Problem

Contrast exists in places, but not enough explicit pre-drop and post-drop behavior.

### Direction

Add intentional drop events.

Before a drop:

- remove motion
- reduce density
- narrow down to pulse or pulse plus one anchor

At the drop:

- reintroduce full groove
- restore foreground
- possibly reintroduce or restate a motif

Working rule:

> Reduction is required for impact.

## 4. Energy Model

### Problem

The roadmap talks about waves and long-horizon pacing, but it does not yet enforce a clear energy curve.

### Direction

Add an explicit energy model.

Example:

```js
energyLevel = 0..100;
```

Drive with it:

- layer count
- density
- call-and-answer intensity
- ornament allowance
- instrument brightness / register pressure

Example mapping:

- `0-20`: pulse only
- `20-50`: foundation + counter-rhythm
- `50-70`: foundation + counter-rhythm + lead
- `70-90`: full core roles
- `90+`: answer/ornament + peak behavior

## 5. Return Moments

### Problem

One of the strongest signals of intention in music is hearing material come back in a meaningful new context.

### Direction

Add explicit return points.

Examples:

- motif re-entry
- groove reset to an earlier stable state
- instrument reintroduction
- same phrase shape with fuller layers underneath

Example payoff:

- early:
  - simple bass + pluck motif
- later:
  - same motif returns with full groove

That should read as:

- recognition
- payoff

not just reuse

## 6. Controlled Contrast Between Normal And Special

The new palette-override direction should also participate in structure.

Define:

- normal layer:
  - base shmup identity
- event layer:
  - temporary override identity for:
    - special enemy
    - boss
    - glitch section
    - other deliberate moments

Working rule:

> Overrides should feel like moments, not background drift.

That means:

- do not let special palette influence slowly pollute the base layer
- use overrides as sectional or encounter-level contrast

## Implementation Direction

### Step 1

Add top-level structure state:

- active section
- current energy level
- active motif set
- pending drop / release / rebuild markers

### Step 2

Allow a small motif memory:

- generated motifs
- last restatement bar
- eligible owners
- variation budget

### Step 3

Tie pacing maintenance to section state:

- layer activation
- role activation
- density gates
- call/answer permissiveness
- ornament availability

### Step 4

Add explicit section transitions:

- intro -> build
- build -> peak
- peak -> drop or release
- release -> rebuild

### Step 5

Add structure metrics.

Useful metrics:

- `sectionChangeCount`
- `barsInCurrentSection`
- `motifRestatementCount`
- `dropEventCount`
- `releaseEventCount`
- `energyPeakCount`
- `energyAverage`
- `energyVolatility`
- `themeReturnCount`

## Relationship To Existing Plans

This plan sits above:

- [beat-swarm-percussion-build-up-plan.md](/d:/Desktop/music-toy/music-toy.github.io/beat-swarm-percussion-build-up-plan.md)
- [beat-swarm-next-steps.md](/d:/Desktop/music-toy/music-toy.github.io/beat-swarm-next-steps.md)

Percussion build-up handles:

- groove-layer stability
- pulse/backbeat/motion behavior

This structure plan handles:

- motif memory
- section identity
- arrangement-role entry and exit
- long-term arcs
- drops, returns, and payoff

## Working Rule

> The music should feel like a journey, not just a sequence of correct moments.

## Acceptance Criteria

- players can recognise at least one recurring idea in a run
- sections feel distinguishable by behavior, not just density accident
- the arrangement can move between reduced and full-role states intentionally
- drops feel prepared and earned
- motifs can return later for payoff
- special palette overrides feel intentional and scoped
- longer runs feel shaped over time rather than flatly reactive

## One-Line Summary

> Add a higher-level musical structure system with motifs, sections, energy curves, and drop/release moments so Beat Swarm forms recognisable arcs over time instead of only locally correct decisions.
