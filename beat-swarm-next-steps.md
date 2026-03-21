# Beat Swarm - Next Steps

## Goal

Make Beat Swarm behave like a readable retro shmup track during gameplay:

- clear foundation
- one understandable foreground idea at a time
- gameplay enhances the music instead of burying it
- loops persist long enough to be learned
- spawners read like a drum machine
- continuity survives gameplay churn

---

## Current state

The core architecture is now in place:

- protected lane ownership for foundation and primary loop
- continuity-preserving handoff with phrase-boundary gating and deferred application
- shared spawner loop ownership
- intro loop persistence and composition-group continuity buffering
- gameplay-vs-music timing split with family-aware suppression
- source-side rhythm tiers
- decision diagnostics and protected-lane guardrails

The remaining work is mainly tuning and validation, not missing core systems.

---

## Baseline to preserve

These systems already exist and should remain unless a regression is found:

- Beat Swarm-specific theme preset and role defaults
- entry BPM on mode enter, with restore-on-exit
- explicit lane ownership and source-to-lane mapping
- controlled palette variation within stable role identity

---

## Metrics review: Music Lab 2026-03-21

Current snapshot from [music-lab-results-2026-03-21T08-41-44-079Z.json](/d:/Desktop/music-toy/music-toy.github.io/resources/music-lab-results/music-lab-results-2026-03-21T08-41-44-079Z.json):

- `readabilityDensity: busy`
- `foundationProminence: heavily_ducked`
- `ownershipContinuity: preserved`
- `deferredOwnershipChanges: healthy`
- `bassFoundation: stable`
- `avgEnemyCompetitionShare: 0.213`
- `avgEnemyForegroundShare: 0.525`
- `avgPlayerMaskingRisk: 0.420`
- `foundationTraceShare: 0.519`
- `foundationSuppressedShare: 0`
- `foundationDeconflictChangeRate: 0.519`
- `laneResetHandoffs: 0`
- `sameContinuityInstrumentDriftCount: 0`
- `sameContinuityPatternDriftCount: 0`

Interpretation:

- ownership and continuity are healthy
- deferred protected-lane behavior is healthy
- bass continuity is healthy
- the main remaining problem is readability under density, especially foundation being pushed into `trace`

---

## Completed infrastructure

These items are implemented enough to treat as baseline systems:

- spawner color groups behave as one musical voice
- mix hierarchy exists and has density-aware gain shaping
- intro drums are a real persistent loop
- composition groups act as a continuity buffer and can hand bass back to gameplay
- protected-lane phrase persistence and deferred queue logic are in place
- bass ownership uses explicit continuity-aware selection
- collision discipline is register-aware instead of global hard caps
- gameplay-vs-music timing split exists with family-aware suppression
- rhythm tiers constrain source-side density
- decision diagnostics expose suppression, arbitration, owner choice, tiering, and protected-lane guardrails
- critical-path heuristic ownership has been reduced and protected-lane claims are guarded

These are not the current build targets unless a regression is found.

---

## Remaining priorities

## 1. Readability and masking tuning

### Problem

Music Lab still reports `readabilityDensity: busy` and `foundationProminence: heavily_ducked`.

### Task

- keep foundation more often at `full` or `quiet`, less often at `trace`
- keep one foreground idea clearly dominant
- reduce masking pressure in dense bars without flattening sparse bars

### Goal

The track should read clearly, not just remain technically consistent.

---

## 2. Phrase lock and foreground lifecycle

### Problem

Ideas still need to stay foreground long enough to be learned.

### Task

Add a stronger foreground "idea lock" policy:

- when a loop becomes foreground, hold it for a real musical window
- do not allow competing foreground claims during that lock
- demote or retire support voices around the locked idea instead of replacing it immediately

### Lifecycle

introduced -> establishing -> locked active -> support -> retired

### Suggested target

- lock foreground ideas for roughly `8-16` bars unless a real authored transition occurs

### Goal

The player should be able to learn the current musical idea before it changes.

---

## 3. Density and accent control

### Problem

Dense bars still risk turning into undifferentiated activity.

### Task

- keep impacts and deaths as punctuation, not a second rhythm layer
- keep sparkle sparse and phrase-aware
- continue suppressing repeated short-window clutter when structure is already established

### Use current metrics

- `gameplaySuppressionDecisions`
- `gameplaySuppressionDrops`
- `gameplaySuppressionSoftens`
- `stepArbitrationChanges`

### Goal

Decoration supports structure instead of overwhelming it.

---

## 4. Metrics review cadence

For each significant tuning pass:

- run one Music Lab pass
- compare readability and foundation metrics against the prior baseline
- review decision metrics before changing suppression or arbitration again

Watch especially:

- `readabilityDensity`
- `foundationProminence`
- `avgEnemyCompetitionShare`
- `avgPlayerMaskingRisk`
- `foundationTraceShare`
- `foundationDeconflictChangeRate`
- `protectedLaneClaimsInferred`
- `protectedLaneClaimsMissing`

Interpretation rule:

- if continuity metrics stay healthy but readability stays poor, keep tuning mix and arbitration
- if protected-lane guardrails go nonzero, fix ownership before doing more musical tuning

---

## 5. Composition continuity polish

### Task

- keep composition groups selective and musically quiet when acting as continuity buffers
- preserve phrase, pattern, and instrument identity across temporary ownership changes
- hand ownership back to gameplay cleanly when a compatible source returns

### Goal

Continuity remains audible without composition groups feeling like a second dominant system.

---

## 6. Intro polish

### Task

- keep the intro loop simple, stable, and recognizable
- preserve the player-only onboarding space before the intro loop enters
- ensure intro ownership remains stable through spawner replacement

### Goal

The intro should feel like a track starting, not like event traffic ramping up.

---

## 7. Future compatibility

### Requirement

Beat Swarm must later be able to accept:

- rhythm grid
- note set
- pattern identity

from toy-authored systems.

### Rule

Beat Swarm should adapt imported patterns to its authored musical model, not blindly play them.

---

## Remaining priority order

1. Readability and masking tuning
2. Phrase lock and foreground lifecycle
3. Density and accent control
4. Metrics review cadence
5. Composition continuity polish
6. Intro polish
7. Future compatibility

---

## One-line brief for Codex

Treat Beat Swarm as an arranger with the core systems already landed: preserve protected-lane ownership, use Music Lab metrics to tune readability and foreground clarity, and only change architecture again if guardrail metrics show ownership regression.
