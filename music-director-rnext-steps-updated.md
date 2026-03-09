# Beat Swarm — Next Steps for Codex

## Purpose

This document lists future architectural improvements for Beat Swarm that should be implemented later.

It focuses on improving:

- musical coherence
- pacing
- enemy lifecycle behaviour
- sound identity
- musical diagnostics
- maintainability

These are not urgent changes, but the intended long-term direction.

---

## Implementation Status (2026-03-09)

- Done: Music Lab module and Perf Lab integration are in place, including JSON export.
- Done: Hook points for event queue/execute, palette changes, pacing changes, and enemy removals are wired.
- Done: Off-pool note diagnostics are implemented (`requestedNote`, `executedNote`, clamp tracking, pool tracking).
- Done: Spawner sync diagnostics are implemented (`perfectSyncSpawnerPairs`, `nearDuplicateSpawnerPairs`, `duplicateSpawnerPatternClusters`).
- In progress: Director cleanup lifecycle fix.
  Cleanup should now retire groups and exit naturally; validate with a fresh run that `directorCleanupRemovals` and `sectionChangeCleanupRemovals` remain zero in normal gameplay.
- Done: Director cleanup lifecycle fix validated in recent runs (`directorCleanupRemovals=0`, `sectionChangeCleanupRemovals=0`) with retire-flow tracking preserved.
- In progress: player masking reduction.
  Enemy note events now support player-step ducking (`duckForPlayer`) plus audibility tagging (`enemyAudible`) so masking metrics track true overlap after ducking.
  Ducking mix was tightened further (lower ducked gain + stricter per-channel keep probability) to push masking below threshold.
  Player-audible steps now also apply event-level suppression before enqueue (per-action keep chances + max enemy events cap) to prioritize player readability.
  Suppression is now hard-gated for musical enemy note events on player-audible steps (keep chance and cap both set to zero) to stabilize masking under threshold.
- Done: section 1 baseline cutover.
  Generic fallback enemy spawning is disabled in pacing and runtime flow (`maxFallbackEnemies=0`; `maintainEnemyPopulation()` no-op).
- In progress: section 3 death family identity.
  Death events now use differentiated family profiles (instrument/volume/arp/pitch-drop contour) for small/medium/large classes.
  Pitch-drop playback is now clamped back to the director note pool to avoid off-pool regressions in note compliance metrics.
  Additional source-side clamping is now applied in spawner/composer/death note request paths so requested notes should stay in-pool before execution.
- Done: section 4 baseline implementation.
  Palette evolution now follows deterministic in-palette targets (brightness/filter/density/octave/accent curves) instead of pure random drift, preserving timbre continuity while evolving texture over the palette lifetime.
- Done: section 5 baseline implementation.
  Motif locking scope now includes lock windows (`lock-<index>`) using 8-bar lock spans; drawsnake and composer group generation now reuse a shared locked hook motif within the lock window.
- Done: section 6 baseline implementation.
  Group call/response now enforces response windows, prevents same-group immediate self-response, biases alternating responders, and prefers response-note variation from the prior call note.
- Done: section 7 baseline implementation.
  Beam stage now applies sustain attenuation across contiguous same-note beats, and beam chains are cleared on silent tune steps so sustain respects sequence silence and mix dominance is reduced.
- Done: section 8 baseline implementation.
  Energy-state alias mapping now supports future arrangement labels (`build_up`, `mini_break`, `boss_phase`, `swarm_chaos`) while routing to current stable state configs for compatibility.
- Done: section 9 baseline implementation.
  Music Lab now records per-step director threat budget snapshots (budgets/usage/remaining) and exports aggregated `threatBudgetUsage` metrics (`perBeat`/`perBar`) alongside event-level threat balance.
- Remaining focus after masking pass: eliminate occasional `perfectSyncSpawnerPairs` edge cases.
  Active mitigation now includes deterministic per-active-spawner collision-avoidance (signature + primary-note uniqueness pass) in addition to seeded motif variation.

---

## 1. Fully Remove Generic Musical Enemies

### Current State

Generic enemies still exist through:

```js
maintainEnemyPopulation()
maxFallbackEnemies
```

These enemies do not belong to groups and weaken musical structure.

### Goal

Convert all musically participating enemies into **Enemy Groups**.

Even a single enemy should be treated as:

```txt
Group size = 1
```

### Benefits

- consistent motif ownership
- easier call-and-response
- cleaner pacing control
- simpler code paths

### Target structure

```txt
EnemyGroup
  id
  role
  size
  motif
  performers
  threatLevel
  lifecycleState
```

---

## 2. Director Must Never Despawn Enemies

### Current State

Some groups of enemies can currently disappear all at once when the director changes section / state.

This is not acceptable behaviour.

### Goal

The Director must **never directly despawn active enemies** as part of normal pacing or arrangement changes.

### Replace with lifecycle states

When a group is no longer needed, it should become one of:

- `retiring`
- `inactiveForScheduling`
- `retreating`

### Correct behaviour

The Director may:

- stop scheduling new phrase events
- reduce aggression
- stop replenishing a group
- tell a group to drift offscreen and exit naturally

The Director may **not**:

- instantly remove a live group because a section changed
- delete all members of a group at once for musical cleanup

### Required diagnostics

Every enemy removal should log a reason:

```txt
killed
expired
retreated
director_cleanup
section_change_cleanup
```

Any `director_cleanup` or `section_change_cleanup` removal should be treated as a bug unless explicitly used for a debug tool or test mode.

---

## 3. Improve Death Sound Families

### Current State

Death sounds are still too close to a single shared family.

### Goal

Create three real families:

```txt
deathSmall
deathMedium
deathLarge
```

### Requirements

All must feel like game deaths, not instruments.

Acceptable structure:

```txt
noise burst
+ tonal pop
+ short pitch drop
```

Examples:

| Enemy class | Sound |
|---|---|
| small | arcade pop |
| medium | crunchy burst |
| large | heavy explosion |

Death sounds may follow pitch rules but must not become melodic leads.

---

## 4. Expand Palette Evolution System

### Current State

Palettes persist for a long time, which is good.

### Improvement

Allow controlled evolution inside a palette.

Examples:

```txt
bass distortion increase
lead brightness increase
accent sharpness increase
motion density increase
```

Do **not** swap unrelated instrument families.

### Goal

The soundtrack should evolve like one track gaining layers.

---

## 5. Introduce Motif Locking

### Problem

Procedural systems tend to wander.

### Solution

Add motif locking.

Example:

```txt
lock 3–5 note phrase for 8 bars
reuse across drawsnakes/groups
```

This creates a recognizable hook.

### Future extension

Motif locking should eventually support:

- role-specific motif memory
- phrase variation rules
- phrase reuse during clash / chorus-like phases

---

## 6. Improve Call-and-Response

Current response logic works but is shallow.

### Future improvements

- assign groups to lanes
- enforce response timing windows
- prefer alternating groups
- prefer phrase answers over exact duplication

Example:

```txt
Group A → call
Group B → response
Group A → variation
```

### Goal

Readable musical dialogue.

---

## 7. Improve Beam Weapon Behaviour

Beam weapons require special treatment.

### Requirements

- beam starts on beat
- beam pitch follows note
- beam sustain respects sequence silence
- beam sound does not dominate the mix

### Check for

```txt
beam sustain spam
beam masking other sounds
```

---

## 8. Director-Driven Arrangement

The Director should eventually control:

```txt
energy state
spawn pacing
note density
palette
phrase complexity
enemy participation
```

Energy states already exist but can be extended.

### Future additions

```txt
build_up
mini_break
boss_phase
swarm_chaos
```

---

## 9. Threat Budget Refinement

Per-beat budgets should be clearer.

Example:

```txt
maxFullThreats
maxLightThreats
maxCosmetic
```

### Goal

Everyone can participate, not everyone can be dangerous.

### Add supporting metrics

Track per beat / per bar:

- full-threat count
- light-threat count
- cosmetic count
- role participation count

---

## 10. Reduce `beat-swarm-mode.js` Responsibility

### Current State

The file is still very large.

### Future refactor targets

Move logic to modules:

```txt
beat-swarm-pacing.js
beat-swarm-palette.js
beat-swarm-groups.js
beat-swarm-music-lab.js
beat-swarm-director.js
```

Keep `beat-swarm-mode.js` as the main orchestrator.

---

## 11. Improve Theme → Palette Relationship

Final hierarchy should be:

```txt
Theme (UI selected)
  ↓
Palette (runtime musical arrangement)
  ↓
Roles
  ↓
Sound events
```

Themes should not change during a run.

Palettes may evolve.

---

## 12. Add Music Lab

### Purpose

Create a **Music Lab** diagnostic system similar in spirit to Perf Lab.

This should help evaluate whether Beat Swarm is generating coherent musical behaviour.

The tool should not try to decide whether the music is “good” in an absolute sense. It should measure whether the system is behaving according to design.

### Suggested module

```txt
src/beat-swarm-music-lab.js
```

### Hook points

Log data from:

```txt
createPerformedBeatEvent()
director.enqueueBeatEvent()
executePerformedBeatEvent()
palette changes
pacing state changes
enemy removal paths
```

### Session data to capture

For each event, record:

- timestamp
- barIndex
- beatIndex
- stepIndex
- actorId
- groupId
- sourceSystem
- role
- requestedNote
- executedNote
- wasClamped
- notePoolAtTime
- instrumentId
- actionType
- threatClass
- pacingState
- paletteId
- themeId

Maintain session arrays such as:

```txt
musicSession.events[]
musicSession.paletteChanges[]
musicSession.pacingChanges[]
musicSession.enemyRemovals[]
```

Allow export to JSON, similar to Perf Lab.

---

## 13. Music Lab — Highlight Off-Pool Notes

### Current problem

Some enemies are originating notes outside the active pentatonic scale.

### Goal

Highlight every off-pool request.

### Required fields

For each performed event:

- `requestedNote`
- `executedNote`
- `wasClamped`
- `poolAtTime`

### Required reporting

Summaries should include:

- `offPoolNoteRequests`
- `clampedNoteCount`
- `clampedNoteBySource`
- `clampedNoteByEnemyId`
- `clampedNoteByEnemyType`

### Debug display

When an event is clamped, surface a visible debug warning in development builds.

### Important

This should detect **source-note violations**, not just final executed notes.

If an event requests an off-pool pitch and is clamped later, that still counts as a design violation worth highlighting.

---

## 14. Music Lab — Detect Perfect-Sync Spawners

### Current problem

Multiple spawner enemies can end up with the same note pattern in perfect sync.

### Goal

Detect duplicate or near-duplicate spawner patterns.

### Compare

For active spawners, compare:

- step pattern similarity
- note sequence similarity
- phase offset
- motif source identity

### Report

Add metrics such as:

- `perfectSyncSpawnerPairs`
- `nearDuplicateSpawnerPairs`
- `duplicateSpawnerPatternClusters`

### Future fix direction

Shared motif families are fine, but individual spawners should derive a variation:

- step rotation
- note offset within pool
- density thinning
- lane assignment
- probabilistic mutes

Perfect sync should only happen deliberately, not by default.

---

## 15. Music Lab — Detect Director Cleanup Removals

### Current problem

The director can currently cause whole enemy groups to disappear.

### Goal

Track and report any non-gameplay removal performed by the director.

### Required reporting

Summaries should include:

- `directorCleanupRemovals`
- `sectionChangeCleanupRemovals`
- `sameFrameGroupRemovals`
- `groupRetirements`
- `groupNaturalDeaths`

### Expected outcome

During normal gameplay there should be:

- zero `directorCleanupRemovals`
- zero `sectionChangeCleanupRemovals`

If these occur, they should be surfaced as a warning.

---

## 16. Music Lab — Core Musical Metrics

Once the basic diagnostics are in place, add these metrics.

### Pitch Entropy

Measures how predictable or random pitch usage is.

Use separately for:

- bass
- lead
- accent
- player weapon

### Contour Stability

Measures whether melodies move smoothly or jump around too much.

Track buckets such as:

- repeat
- step
- small leap
- large leap

### Motif Persistence

Measures how often short note/rhythm cells repeat over time.

Use 2-note, 3-note, and 4-note windows.

### Role Balance

Track events per role per bar.

### Threat Balance

Track events per threat class per beat and per bar.

### Call-and-Response Detection

Track whether one group answers another within a valid response window.

### Palette Stability

Track bars since palette change and role-instrument changes.

### Player Masking

Track how often enemy activity coincides with player weapon events strongly enough to bury readability.

---

## 17. Music Lab — Success Criteria

Music Lab is working when it can quickly answer questions like:

- which systems are requesting off-pool notes?
- are spawners duplicating each other in lockstep?
- is the director wrongly cleaning up enemies?
- are motifs repeating enough to feel intentional?
- is the palette stable?
- is the player weapon being masked?
- are enemies behaving musically without becoming unfair?

---

## Success Criteria for the Overall System

The system is working when:

- soundtrack feels like one evolving track
- enemies feel coordinated rather than random
- player weapon remains readable
- palette changes feel natural
- pacing feels intentional
- no enemies disappear because the director cleaned them up
- Music Lab can identify musical failures automatically
