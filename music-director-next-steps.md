# Beat Swarm — Music Director Next Steps

## Purpose

This document captures **next steps for the Beat Swarm music director and diagnostic systems**.

The goals are to improve:

* musical coherence
* pacing and battlefield continuity
* sound identity
* enemy lifecycle behaviour
* musical diagnostics
* system observability

These changes focus on **making the procedural music system behave more like a real evolving track** while preserving gameplay readability.

---

# Core Design Principles

## 1. Enemies Should Never Stop Acting for Musical Reasons

Enemy behaviour must **never be suppressed purely to improve the music**.

Examples of actions that must remain intact:

* firing weapons
* spawning enemies
* attack telegraphs
* movement patterns
* group participation

Stopping actions breaks gameplay readability and feels unnatural.

Instead:

**Audio participation may be reduced in volume or density, but the behaviour remains visible.**

---

## 2. Volume Reduction Is Preferred Over Behaviour Suppression

When the director wants to reduce musical density:

* lower audio volume
* thin audible note participation
* preserve visual and gameplay behaviour

Example:

Enemy continues firing but:

```
audio volume = reduced
visual attack = unchanged
gameplay behaviour = unchanged
```

This preserves battlefield readability while controlling the soundtrack.

---

## 3. Spawner Participation Rules

Spawner enemies must **always remain behaviourally consistent**.

If a spawner visually flashes, it should still perform its intended action.

However:

* audio intensity may be reduced
* sound triggers may be quieter
* accent layers may be suppressed

Spawner visual signals must remain reliable.

### Visual Language Rule

Separate spawner gestures:

| Gesture        | Meaning                        |
| -------------- | ------------------------------ |
| Soft pulse     | rhythm participation           |
| Strong flash   | guaranteed spawn               |
| Alternate tell | linked attack / fallback burst |

Do not reuse the same visual cue for different behaviours.

---

# Using `samples.csv` to Drive Musical Roles

The project already has **excellent metadata in `samples.csv`**:

* pitch grading
* suitability tags (`drawgrid`, `loopgrid`)
* sound families

We should leverage this directly in the director.

---

## Instrument Role Lanes

Define instrument lanes using sample metadata.

### Bass Lane

Used by:

* spawners
* heavy enemy actions
* large attacks

Selection rules:

* prefer **low pitch grade samples**
* prefer **loopgrid / rhythm-tagged instruments**
* avoid high melodic sounds

Purpose:

* anchor groove
* maintain rhythmic foundation

---

### Lead Lane

Used by:

* drawsnakes
* phrase enemies
* group calls

Selection rules:

* prefer **mid–high pitch grade**
* prefer **drawgrid-tagged instruments**
* melodic clarity preferred

Purpose:

* carry melody
* create recognizable phrases

---

### Accent Lane

Used by:

* minor enemy actions
* short bursts
* small hazards

Selection rules:

* mid pitch range
* short decay sounds
* game-like blips or pops

Purpose:

* rhythmic punctuation

---

### Motion Lane

Used by:

* cosmetic sync gestures
* battlefield pulse effects

Selection rules:

* quiet sounds
* subtle rhythmic ticks
* low prominence

Purpose:

* keep battlefield rhythm visible without cluttering mix

---

# Enemy Structure Improvements

## Generic Musical Enemies Should Be Removed

Generic enemies are now mostly obsolete.

Instead:

```
EnemyGroup
  id
  role
  size
  motif
  performers
  threatLevel
  lifecycleState
```

Even a single enemy should be treated as:

```
group size = 1
```

Benefits:

* consistent motif ownership
* easier call-and-response
* cleaner pacing logic

---

# Enemy Lifecycle Behaviour

## Director Must Never Despawn Enemies

The director should never directly remove enemies as part of musical pacing.

Invalid behaviour:

* deleting groups on section change
* cleaning up enemies because they are musically obsolete

Instead use lifecycle states:

```
active
retiring
inactiveForScheduling
retreating (rare)
```

### Retiring Behaviour

When retiring:

* stop scheduling new phrase events
* reduce aggression
* reduce audio participation
* allow player to eliminate naturally

Retreating should be **rare and explicit**, not routine pacing.

---

# Music Lab Diagnostic System

A **Music Lab system** has now been introduced to analyse Beat Swarm musical behaviour.

This system is similar in concept to Perf Lab but focused on music generation.

---

## Data Collection

Hook into:

```
createPerformedBeatEvent()
director.enqueueBeatEvent()
executePerformedBeatEvent()
palette changes
pacing state changes
enemy removals
```

Log data including:

```
timestamp
barIndex
beatIndex
actorId
groupId
role
requestedNote
executedNote
wasClamped
notePoolAtTime
instrumentId
actionType
threatClass
pacingState
paletteId
themeId
sourceSystem
```

---

# Music Lab Diagnostics

## 1. Off-Pool Note Detection

Some enemies still originate notes outside the pentatonic scale.

Music Lab must detect:

```
requestedNote != executedNote
```

Metrics:

```
offPoolNoteRequests
clampedNoteCount
clampedNoteBySource
clampedNoteByEnemyId
```

Important:

This must record **raw requested notes before clamping**.

---

## 2. Perfect-Sync Spawner Detection

Multiple spawners may accidentally share identical patterns.

Music Lab must detect:

```
perfectSyncSpawnerPairs
nearDuplicateSpawnerPairs
duplicateSpawnerPatternClusters
```

Spawner patterns should vary using:

* step rotation
* note offsets
* density thinning
* lane assignment
* probabilistic muting

Perfect sync should only occur intentionally.

---

## 3. Director Cleanup Detection

Enemy removals must record reason:

```
killed
expired
retreated
director_cleanup
section_change_cleanup
```

Expected values:

```
director_cleanup = 0
section_change_cleanup = 0
```

Any occurrence indicates a bug.

---

# Core Musical Metrics

The Music Lab should compute the following metrics.

---

## Pitch Entropy

Measures randomness of pitch distribution.

Too low:

```
repetitive loop
```

Too high:

```
chaotic melody
```

Target ranges:

| Role   | Expected entropy |
| ------ | ---------------- |
| Bass   | low              |
| Lead   | medium           |
| Accent | medium-high      |
| Motion | very low         |

---

## Melodic Contour Stability

Measure pitch interval patterns.

Buckets:

```
repeat
step
small leap
large leap
```

Lead melodies should favour:

```
repeat / step / small leap
```

Large leaps should be rare.

---

## Motif Persistence Score

Measures how often short sequences repeat.

Track windows:

```
2-note
3-note
4-note
```

Metrics:

```
motifPersistence
motifReuseRate
```

High persistence indicates recognizable hooks.

---

## Role Balance

Track per-bar participation:

```
bass
lead
accent
motion
```

Goal:

Lead and bass must remain audible.

Motion should not dominate.

---

## Threat Balance

Per beat:

```
fullThreat
lightThreat
cosmetic
```

Goal:

```
everyone plays
few attack
```

---

## Call-and-Response Detection

Detect patterns such as:

```
Group A event
Group B response within N steps
```

Metrics:

```
responsePairs
responseRate
```

---

## Palette Stability

Track:

```
barsSincePaletteChange
instrumentChanges
themeChanges
```

Goal:

Long-lived sonic identity.

---

## Player Masking

Detect when enemy activity hides player weapon.

Metrics:

```
enemyEventsNearPlayerShot
playerMaskingRate
```

Player weapon must remain readable.

---

# Phrase Gravity (Future System)

Phrase gravity encourages melodies to resolve toward stable tones.

Implementation concept:

Each phrase defines **gravity notes**.

Melodies are biased toward:

```
phrase root
phrase fifth
phrase target notes
```

Large random leaps become less likely.

This maintains melodic coherence without scripting exact notes.

---

# Success Criteria

The system is working when:

* enemies never disappear due to director cleanup
* enemy behaviour remains readable
* audio density feels intentional
* soundtrack evolves like one track
* spawners no longer sync accidentally
* off-pool notes are detected and eliminated
* player weapon remains audible
* Music Lab metrics provide useful tuning insight

