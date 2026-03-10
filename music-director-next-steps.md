# Beat Swarm — Music Director Next Steps (Updated)

## Purpose

This document captures the current design direction and implementation tasks for the Beat Swarm music director and Music Lab systems.

Goals:

* Preserve gameplay readability
* Improve musical coherence
* Improve diagnostics
* Ensure enemy behaviour is never sacrificed for music
* Make the battlefield feel like one evolving track

---

# Core Gameplay Rule Changes

## 1. Enemy Behaviour Must Never Change Due To Musical Relevance

Enemy aggression, attack timing, and spawn logic must **never be reduced or disabled because the music system wants fewer notes.**

### Incorrect behaviour

* enemy does not fire because music density is low
* spawner flashes but does nothing
* group stops attacking because it is musically inactive

### Correct behaviour

* enemy behaviour stays consistent
* musical system only changes **audibility or prominence**

### Allowed musical controls

* lower sound volume
* reduce harmonic prominence
* reduce note layering
* adjust orchestration

### Never allowed

* suppress gameplay behaviour

### Key principle

**Musical relevance affects sound, not behaviour.**

---

# 2. Spawner Pulse Must Always Equal Action

Spawner visual language must be simplified.

### Current problem

Spawner enemies can:

* flash without spawning
* flash with cosmetic pulse
* flash with linked attack
* flash with spawn

This makes spawner behaviour difficult to read.

### New rule

**Spawner pulse must always mean a real action occurs on that beat.**

### Valid actions

* spawn enemy
* trigger linked enemy action
* trigger hazard or burst

### Invalid behaviour

* pulse only for music
* pulse without action

If spawners need background rhythm participation:

* use subtle idle animation
* use battlefield motion layer
* do NOT reuse the spawn pulse gesture

---

# 3. Reduce Musical Density Using Mix Control

To reduce clutter without changing gameplay:

### Use

* volume scaling
* dynamic ducking
* instrument lane thinning

### Do NOT use

* disabling enemy actions
* suppressing spawns
* suppressing attacks

### Example

Enemy fires normally:

Gameplay: unchanged
Sound: volume reduced if mix crowded

---

# Instrument Selection From `samples.csv`

The `samples.csv` metadata should drive instrument selection.

Fields already available:

* pitch grade
* suitability tags (`drawgrid`, `loopgrid`)
* sound family

Use these to assign **instrument lanes**.

---

# Instrument Lanes

## Bass Lane

Used by:

* spawners
* heavy attacks

Selection rules:

* prefer **low pitch grade samples**
* prefer **loopgrid / rhythm-tagged instruments**
* strong transient

Purpose:

Anchor the groove and maintain rhythmic foundation.

---

## Lead Lane

Used by:

* drawsnakes
* phrase groups

Selection rules:

* mid–high pitch grade
* drawgrid-tagged sounds

Purpose:

Carry melody and musical phrases.

---

## Accent Lane

Used by:

* minor enemies
* short bursts

Selection rules:

* short decay
* mid pitch

Purpose:

Rhythmic punctuation.

---

## Motion Lane

Used by:

* cosmetic sync gestures
* battlefield rhythm pulses

Selection rules:

* quiet sounds
* minimal tonal weight

Purpose:

Provide subtle rhythmic glue without cluttering the mix.

---

# Enemy Lifecycle Improvements

## Director Must Never Despawn Enemies

Enemy removal reasons must be logged.

Possible values:

```
killed
expired
retreated
director_cleanup
section_change_cleanup
```

### Expected values

```
director_cleanup = 0
section_change_cleanup = 0
```

If these occur they are bugs.

---

## Lifecycle States

Instead use lifecycle states:

```
active
retiring
inactiveForScheduling
retreating (rare)
```

### Retiring behaviour

* enemy continues acting normally
* reduced orchestration or mix prominence
* player eliminates them naturally

Retreating should be rare and explicit.

---

# Music Lab Improvements

Music Lab exists but should be expanded.

---

# Logging Points

Capture events at:

```
createPerformedBeatEvent()
enqueueBeatEvent()
executePerformedBeatEvent()
palette change
pacing change
enemy removal
```

Each event records:

```
bar
beat
step
actor
group
role
requestedNote
resolvedNote
instrument
action
threatClass
pacingState
palette
theme
sourceSystem
```

---

# New Music Lab Diagnostics

## 1. Off-Pool Note Detection

Detect if source notes violate pentatonic pool.

Metrics:

```
offPoolNoteRequests
clampedNoteCount
clampedBySource
clampedByEnemyType
```

Important:

Measure **requested notes before clamping.**

---

## 2. Perfect Sync Spawner Detection

Detect identical spawner patterns.

Metrics:

```
perfectSyncSpawnerPairs
nearDuplicateSpawnerPairs
duplicatePatternClusters
```

Spawner variation techniques:

* phase rotation
* note offsets
* density thinning
* probabilistic mute

Perfect sync should only occur deliberately.

---

## 3. Director Cleanup Detection

Track all enemy removals.

Metrics:

```
directorCleanupRemovals
sectionChangeCleanupRemovals
sameFrameGroupRemovals
groupRetirements
naturalDeaths
```

Director cleanup must remain zero.

---

# Musical Metrics

## Pitch Entropy

Measures randomness of pitch selection.

Expected ranges:

| Role   | Entropy     |
| ------ | ----------- |
| Bass   | Low         |
| Lead   | Medium      |
| Accent | Medium-High |
| Motion | Very Low    |

---

## Melodic Contour Stability

Interval buckets:

```
repeat
step
small leap
large leap
```

Lead melodies should favour:

```
repeat
step
small leap
```

Large leaps should be rare.

---

## Motif Persistence Score

Track repeating note windows:

```
2 note
3 note
4 note
```

Metrics:

```
motifPersistence
motifReuseRate
```

Higher persistence indicates stronger musical identity.

---

## Role Balance

Track events per role:

```
bass
lead
accent
motion
```

Motion should not dominate the mix.

Bass and lead must remain audible.

---

## Threat Balance

Per beat:

```
fullThreat
lightThreat
cosmetic
```

Design rule:

**Everyone plays, few attack.**

---

## Player Masking

Detect when enemy sound masks player weapon.

Metrics:

```
enemyEventsNearPlayerShot
playerMaskingRate
```

Goal:

Player weapon remains clearly readable.

---

# Phrase Gravity (Future System)

Phrase gravity nudges melodies toward musically stable targets.

Each phrase defines:

```
gravityNotes
phraseRoot
phraseFifth
resolutionTargets
```

The generator biases toward these notes near phrase endings.

### Benefits

* more coherent melodies
* fewer random leaps
* recognizable musical phrasing

---

# Success Criteria

The system is working when:

* spawner pulse always equals action
* enemies never disappear due to director cleanup
* aggression does not depend on musical relevance
* musical density is controlled via mix not behaviour
* palette evolves smoothly
* spawners do not accidentally sync
* Music Lab detects off-scale notes and pattern collisions
* battlefield feels like one evolving musical performance