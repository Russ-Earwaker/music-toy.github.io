# Beat Swarm – Next Steps (Clean Plan for Codex)

## Goal of this pass

Move the director from **reactive swarm behaviour** to **intentional musical arrangement**.

The system already understands the ideas of:

* foundation
* loops/themes
* sparkle

But it still behaves too permissively after the intro.

The next pass is about **enforcing hierarchy and patience**, not adding new subsystems.

Adaptive music systems commonly use **layering structures where stable loops form the base while other layers enter or leave dynamically**, which is similar to the approach we want here. ([digitalspace.bradfordcollege.ac.uk][1])

---

# 1. Strengthen the Foundation Layer

The bass/foundation is now technically persistent, but its authority still fades too quickly.

### Required behaviour

Foundation must:

* survive actor death
* maintain timing
* maintain phrase continuity
* remain clearly audible
* remain present through section changes

### Director rules

Add hard guarantees:

```
foundation cannot reset during section
foundation cannot drop below quiet
foundation cannot be replaced before minCycles
```

### Tunables

Add:

```
foundationMinCycles = 3
foundationProminenceFloor = quiet
foundationResetAllowed = false
```

This ensures the bass behaves like a **bedrock layer** rather than just another participant.

---

# 2. Introduce Loops More Slowly

Phase 2+ currently introduces loops too eagerly.

The system needs **registration time** so the player’s brain can recognize patterns.

### Rule

A new foreground identity may only enter when:

```
currentLoop.completedCycles >= loopRegistrationCycles
timeSinceLastForeground >= minLayerSpacing
```

Suggested values:

```
loopRegistrationCycles = 2
minLayerSpacingBars = 4
```

This will slow the expansion of the track.

---

# 3. Limit Foreground Identities

Right now too many musical ideas compete simultaneously.

Add a cap on **foreground roles**.

Example:

```
foundation: 1
primary loop: 1
secondary loop: 0–1
sparkle: capped
```

Director rule:

```
if foregroundIdentities >= foregroundLimit
    downgrade new events to support or trace
```

---

# 4. Enforce Sparkle Discipline

Sparkle is currently too active in later sections.

Sparkle should act as **punctuation**, not as a major layer.

Add rules:

```
sparkleMaxDensity = 2 events per bar
sparkleCannotOverrideLoops = true
sparkleCannotOverrideFoundation = true
```

---

# 5. Improve Theme Persistence

Themes exist but are still too fragile.

Add persistence tracking:

```
themeMinCycles = 2
themeReturnBias = high
```

Themes should either:

* continue
* return recognisably later

but not disappear instantly.

---

# 6. Lock Instrument Identity

Enemy colours now exist but occasionally change.

Instrument identity must be stable.

### Required rule

```
enemy.instrumentId assigned at spawn
enemy.instrumentId immutable
enemy.color = instrumentColor(instrumentId)
```

Motif or phrase updates must **not change colour**.

If a loop transfers to a new actor:

```
newActor.instrumentId = oldActor.instrumentId
newActor.color = oldActor.color
```

This keeps visual continuity of the musical role.

---

# 7. Fix Spawner Feedback Consistency

Spawners sometimes:

* spawn gameplay
* but do not emit note/visual feedback

All spawner-triggered gameplay must use the same pipeline.

Required event chain:

```
SpawnerTrigger
 → loopgrid event
 → visual proxy flash
 → note trigger
 → spawn gameplay
```

Add Music Lab counters:

```
spawnerGameplayEvents
spawnerAudioEvents
spawnerVisualEvents
```

Log mismatches.

---

# 8. Improve Instrument Role Selection

The `samples.csv` system already exists but is mostly heuristic.

Make it more explicit.

Add fields:

```
laneRole
registerClass
combatRole
```

Example:

```
instrument,base_oct,laneRole,registerClass
bass_synth,3,bass,low
lead_saw,5,lead,mid
snare_hit,4,accent,mid
```

Selection logic:

```
prefer laneRole match
fallback to heuristic if missing
```

---

# 9. Strengthen Music Lab Diagnostics

Add metrics specifically for the hierarchy model.

### Foundation metrics

```
foundationCycleCount
foundationPhraseResets
foundationContinuityRate
```

### Theme metrics

```
themeCycleCount
themePersistenceRate
themeReturnRate
```

### Sparkle metrics

```
sparkleDensity
sparkleForegroundShare
```

### Identity metrics

```
instrumentChangesPerEnemy
colorChangesPerEnemy
```

Expected values:

```
instrumentChangesPerEnemy = 0
colorChangesPerEnemy = 0
```

---

# 10. Improve Section Pacing

Current pacing:

```
intro_solo
intro_bass
intro_response
main_low
main_mid
```

The intro works better now, but phase transitions still happen too early.

Add rules:

```
sectionMinBars = 8
sectionChangeRequiresStableFoundation = true
```

This ensures sections don’t churn too quickly.

---

# Success Criteria

This pass succeeds when:

* bass remains stable through enemy turnover
* the intro foundation persists into early sections
* loops enter slowly and clearly
* sparkle stays subordinate
* enemy colours never change mid-life
* spawner events always produce note + visual feedback
* Music Lab shows stable foundation metrics

---

# Short Codex Brief

Strengthen the music hierarchy so foundation, loops, and sparkle behave distinctly. The bass foundation must persist with phrase continuity and cannot reset or fade during sections. Introduce new loops only after existing loops have completed enough cycles to register, and limit simultaneous foreground identities. Sparkle events must remain subordinate to foundation and loops. Lock instrument identity and enemy colour at spawn so they never change mid-life. Ensure spawner gameplay always triggers the same audio and visual feedback pipeline. Extend Music Lab diagnostics to track foundation persistence, theme survival, sparkle density, and identity stability.