# Beat Swarm – Stability & Readability Pass

## Codex Implementation Brief

## Objectives

Fix four core issues:

1. **Bass foundation must persist**
2. **Enemy colour must equal instrument identity and remain stable**
3. **Spawner gameplay must always trigger matching musical/visual feedback**
4. **Intro pacing must introduce grouped-enemy bass before adding more layers**

Also improve **sample role detection** so instruments are selected more reliably.

This pass is about **hard guarantees**, not new features.

---

# 1. Bass must behave like a true foundation

### Current issue

Music Lab shows:

* high handoff count
* most handoffs resetting phrases
* bass disappearing or changing when enemies die or new layers enter

This breaks the idea of bass as the **stable base layer**.

### Required behaviour

Bass must continue through:

* enemy death
* source turnover
* new layer introductions

The rhythm and phrase should **not reset unless unavoidable**.

### Implementation changes

#### A. Redefine handoff success

Currently a handoff can succeed even if the phrase resets.

Change definition:

```
handoff_success = phrase_continuity_preserved
```

If the phrase resets:

```
handoff_reset = true
handoff_success = false
```

Track both separately.

---

#### B. Prioritise phrase inheritance for bass

When the bass source disappears:

1. search for compatible replacement
2. transfer:

   * phrase index
   * bar offset
   * subdivision phase
   * loop identity

Only reset if **no compatible receiver exists**.

---

#### C. Add a bass continuity owner

Introduce a persistent object:

```
bassFoundationOwner
```

This owns the bass loop.

Gameplay actors perform it, but the loop itself persists independently.

If the actor dies:

```
bassFoundationOwner.transferTo(newActor)
```

This prevents musical collapse.

---

#### D. Add minimum bass persistence

Bass must run for a minimum duration.

Suggested tunable:

```
bassMinLoopCycles = 2
```

No new foreground layers until this requirement is satisfied.

---

# 2. Lock enemy colour to instrument identity

### Current issue

Enemies sometimes change colour during runtime.

Colour appears tied to motif/group state rather than instrument identity.

This breaks the rule:

```
colour = instrument
```

### Required behaviour

Once an enemy is assigned an instrument:

```
instrumentId = fixed
colour = derivedFrom(instrumentId)
```

The colour must **never change** during the enemy lifetime.

---

### Implementation changes

#### A. Assign instrument once

At spawn:

```
enemy.instrumentId = selectInstrument()
enemy.instrumentColour = colourFromInstrument(enemy.instrumentId)
```

Never reassign unless the enemy despawns.

---

#### B. Remove colour changes from motif/group updates

Motif or phrase updates must **not change colour**.

Instrument identity is separate from musical phrase.

---

#### C. Preserve colour during handoff

If a loop transfers:

```
newActor.instrumentId = oldActor.instrumentId
newActor.instrumentColour = oldActor.instrumentColour
```

This keeps visual continuity of the musical role.

---

# 3. Spawner events must always produce feedback

### Current issue

Spawners sometimes:

* spawn gameplay
* but do not show visual event feedback
* or do not trigger notes

This breaks audiovisual clarity.

### Required behaviour

If a spawner triggers gameplay:

```
spawnEvent → visual feedback → musical note
```

All three must occur unless explicitly muted.

---

### Implementation changes

#### A. Centralise spawner event pipeline

Ensure the following pipeline exists:

```
SpawnerTrigger
 → emit loopgrid event
 → visual feedback (proxy cube flash)
 → note trigger
 → gameplay spawn
```

All spawner-triggered gameplay must go through this path.

---

#### B. Remove alternate spawn paths

Audit code for any spawn paths bypassing the loopgrid event system.

Redirect them into the unified pipeline.

---

#### C. Add Music Lab diagnostics

Track:

```
spawnerGameplayEvents
spawnerAudioEvents
spawnerVisualEvents
```

Log mismatches.

---

# 4. Fix intro pacing

### Current issue

Intro currently:

```
player solo
→ single spawner bass
→ multiple loops appear quickly
```

This is too weak and too fast.

---

### Required structure

Intro should be:

```
player solo
→ grouped-enemy bass foundation
→ hold for several cycles
→ add first response loop
→ gradual expansion
```

---

### Implementation changes

#### A. Change intro_bass actor type

Prefer:

```
drawsnakes / composer groups
```

Avoid relying solely on:

```
spawners
```

These grouped enemies create stronger repeating bass loops.

---

#### B. Require loop completion before expansion

Add rule:

```
if foundationLoopCycles < 2
    blockNewForegroundLayers()
```

---

#### C. Add loop-boundary admission

New loops may only enter at:

```
bar boundary
or
phrase boundary
```

Never mid-phrase.

---

# 5. Strengthen instrument selection from samples.csv

### Current state

System infers bass/lead roles from:

* octave
* instrument type
* toy recommendation
* priority

This is heuristic.

---

### Improvement

Add explicit metadata fields to `samples.csv`.

Suggested fields:

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

---

### Selection logic

Prefer instruments matching:

```
laneRole == requiredRole
```

Fallback to heuristic only if metadata missing.

---

# 6. Clean up Music vs Perf Lab output

### Current improvement

JSON metadata now includes:

```
labType: "music"
labType: "perf"
```

But filenames still say `perf-lab-results`.

---

### Required changes

Rename outputs:

```
music-lab-results-<timestamp>.json
perf-lab-results-<timestamp>.json
```

Store in separate directories:

```
/music-lab-results/
/perf-lab-results/
```

---

# 7. Add diagnostics for this pass

Add metrics to Music Lab:

### Bass stability

```
bassLoopCycles
bassPhraseResets
bassHandoffContinuityRate
```

---

### Identity stability

```
instrumentChangesPerEnemy
colourChangesPerEnemy
```

Expected value:

```
0
```

---

### Spawner feedback consistency

```
spawnerGameplayEvents
spawnerVisualEvents
spawnerAudioEvents
```

Mismatch count should be zero.

---

# Success criteria

This pass succeeds when:

* bass loops remain stable despite enemy turnover
* colour identity never changes once assigned
* spawner gameplay always produces note + visual feedback
* intro clearly establishes bass foundation before adding layers
* instrument selection behaves predictably
* music and perf lab results are cleanly separated

---

# Short Codex version

Make bass a persistent musical foundation with phrase continuity across actor turnover, not frequent resets. Redefine handoff success so phrase continuity is required. Lock enemy colour to instrument identity assigned at spawn and prevent runtime colour changes. Ensure spawner gameplay always triggers the same visual and audio event pipeline. Rework intro pacing so grouped enemies establish a strong bass foundation before new loops appear, with at least two full loop cycles before expansion. Extend samples.csv with explicit lane-role metadata and update selection logic accordingly. Finally separate music-lab and perf-lab outputs by filename and directory.

