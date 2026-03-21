# Beat Swarm - Next Steps

## Goal

Make Beat Swarm behave like a readable retro shmup track:

- clear foundation (bass + pulse)
- one understandable musical idea at a time
- gameplay enhances the music, not buries it
- loops are heard long enough to be understood
- spawners act like a drum machine
- composition groups preserve musical continuity when gameplay changes

---

## Current state

The core architecture is now in place:

- protected lane ownership for foundation and primary loop
- continuity-preserving handoff with phrase-boundary gating and deferred application
- shared spawner loop ownership
- intro loop persistence and composition-group continuity buffer
- gameplay-vs-music timing split with family-aware suppression
- source-side rhythm tiers
- decision diagnostics and protected-lane guardrails

The remaining work is mostly tuning, validation, and future compatibility, not missing core systems.

---

## Baseline to preserve

These are already implemented and should remain unless a regression is found:

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
- the main remaining issue is readability under density, especially foundation being pushed into `trace`
- the remaining tuning work should focus on mix clarity, foreground discipline, and rhythm readability, not rebuilding ownership systems

---

## Completed infrastructure

These items are now implemented enough to treat as baseline systems:

- spawner color groups behave as one musical voice
- explicit mix hierarchy exists and has density-aware gain staging
- intro drums are a real persistent loop
- composition groups act as a continuity buffer and can hand bass back to gameplay
- protected-lane phrase persistence and deferred queue logic are in place
- bass ownership uses explicit continuity-aware selection
- collision discipline is register-aware instead of global hard caps
- gameplay-vs-music timing split exists with family-aware suppression
- rhythm tiers now constrain source-side density
- decision diagnostics now expose suppression, arbitration, owner choice, tiering, and protected-lane guardrails
- critical-path heuristic ownership has been reduced and protected-lane claims are now guarded

These are not the current build targets unless a regression is found.

---

## 1. Readability and masking tuning

### Problem

Music Lab still reports `readabilityDensity: busy` and `foundationProminence: heavily_ducked`.

### Task

- keep foundation more often at `full` or `quiet`, less often at `trace`
- keep one foreground idea clearly dominant
- reduce masking pressure in dense bars without flattening sparse bars

---

## 2. Foreground lifecycle tuning

### Task

- keep one foreground idea active at a time
- make support demotion and retirement more legible
- prevent multiple loop voices from reading as simultaneous leads

### Lifecycle

introduced -> establishing -> active -> support -> retired

---

## 3. Accent and gameplay punctuation tuning

### Task

- keep them sparse
- vary pitch or instrument when used
- suppress them during dense moments

Use the current decision metrics, not guesswork:

- `gameplaySuppressionDecisions`
- `gameplaySuppressionDrops`
- `gameplaySuppressionSoftens`
- `stepArbitrationChanges`

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

- if continuity metrics stay healthy but readability stays poor, keep tuning mix/arbitration
- if protected-lane guardrails go nonzero, fix ownership before doing more musical tuning

---

## 5. Future compatibility

### Requirement

Beat Swarm must later be able to accept:

- rhythm grid
- note set
- pattern identity

from toy-authored systems.

### Rule

Beat Swarm should adapt imported patterns to its authored musical model, not blindly play them.

---

## Priority order

1. Spawner color group shared-loop behavior
2. Mix hierarchy and masking control
3. Intro drum loop stability
4. Composition-group continuity tuning
5. Phrase-persistence and deferred-queue tuning
6. Bass ownership and continuity polish
7. Collision discipline
8. Timing-split tuning
9. Rhythm tiers
10. Additional decision-making diagnostics
11. Heuristic ownership cleanup
12. Future compatibility

---

## Remaining priority order

1. Readability and masking tuning
2. Foreground lifecycle tuning
3. Accent and gameplay punctuation tuning
4. Metrics review cadence
5. Future compatibility

---

## One-line brief for Codex

Treat Beat Swarm as an arranger with the core systems already landed: preserve protected-lane ownership, use Music Lab metrics to tune readability and foreground clarity, and only change architecture again if guardrail metrics show ownership regression.
