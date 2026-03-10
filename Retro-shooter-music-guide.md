# Retro Shooter Music Director – Next Steps

## Goal

Use the existing music-director systems to make Beat Swarm feel like a **retro shooter soundtrack** rather than a reactive toy jam.

Target feel:

* driving combat groove
* clear rhythmic identity
* repeating motifs instead of wandering melodies
* strong player-instrument presence
* enemies feeding the track without making it muddy or unreadable
* musical continuity even when musical sources die, leave screen, or change state

This pass is **not** about making the music system more complex.
It is about making it more **intentional, stable, and stylistically focused**.

---

## Core Design Decisions

### 1. Musical continuity matters more than source purity

We do **not** need to rely purely on spawners for bass or groove.

Allowed approaches:

* phrase groups can take over bass/groove duties
* phrase groups can continue a sequence after another source dies
* a new spawner or phrase group can spawn offscreen and move onscreen to continue a musical line
* musical handoff between entities is allowed if it preserves phrasing and feel

Principle:

**The music should sound continuous, even if the battlefield objects creating it change.**

So we are not asking:

* “did the original source survive?”

We are asking:

* “did the musical idea survive?”

---

### 2. The player instrument is core

The player should feel like a featured instrument inside the combat track.

Allowed approaches:

* mutate player fire rate to support groove
* align player fire cadence to musical divisions
* let player weapons behave like rhythmic instruments
* allow optional player-authored sequences / override patterns

Important:

* the system can suggest or assist musical firing
* but the player must be able to **override** and perform their own sequence if desired

Principle:

**The player should feel musical, not musically imprisoned.**

---

### 3. Retro shooter style = controlled repetition

We want:

* repeating low-end drive
* short motif loops
* punchy accents
* limited note vocabulary
* section-based variation
* readable rhythmic patterns

We do **not** want:

* overly cute melodic motion
* too many unique timbres at once
* constant note churn
* every event becoming a musical statement
* battlefield chaos making the soundtrack feel random

---

## High-Level Musical Target

Define the target sound as:

**A machine-groove combat track built from repeating bass pulses, short aggressive motif loops, sharp enemy accents, and a strongly readable player instrument.**

This should feel closer to:

* arcade combat loop
* retro shooter energy
* riff/groove-driven action music

Less like:

* generative soundtrack experiment
* reactive ambient system
* procedural noodling

---

## Main Implementation Priorities

## Priority 1 – Add a dedicated `retro_shooter` style profile

Create a style/theme profile that biases the system toward retro shooter behaviour.

This profile should influence:

* lane usage
* instrument selection
* note density
* repetition strength
* motif persistence
* phrase length
* bass behaviour
* player prominence
* motion-layer suppression

### Desired characteristics of `retro_shooter`

#### Bass / low-end

* strong pulse
* low entropy
* root-heavy
* fifth-heavy
* repeated patterns over 1–2 bars minimum
* few decorative notes

#### Lead / combat riff layer

* short motifs
* 2–4 note loops
* aggressive repetition
* stepwise motion preferred over large leaps
* strong rhythmic identity

#### Accent layer

* stabs
* hits
* punctuation
* less melodic responsibility
* short, readable, percussive behaviour

#### Motion / texture layer

* mostly supportive
* minimal tonal clutter
* optional industrial/noise pulse role
* should not compete with player or riff layer

#### Player layer

* punchy
* audible
* central
* rhythmically satisfying
* optionally guided toward groove
* optionally player-overridden

---

## Priority 2 – Support musical handoff between gameplay sources

The system currently tends to associate musical identity too tightly with the entity currently alive on screen.

We now want explicit support for **musical succession**.

### Needed behaviour

A phrase or groove should be able to continue when:

* the original enemy dies
* the original phrase group ends
* the source leaves the active screen space
* a replacement source is spawned deliberately to preserve continuity

### Add concept: `musical continuity owner`

A musical phrase should not necessarily belong to one physical actor.

Instead, introduce a layer such as:

* phrase instance
* groove instance
* continuity token
* motif owner
* sequence owner

This should let a new entity inherit:

* current motif
* bar position
* phrase step
* lane role
* harmonic role
* timing state
* phrase energy / intensity state

### Example use cases

#### Bass continuation

* spawner begins low-end pulse
* spawner dies
* nearby phrase group or replacement source inherits current bass pattern
* groove continues without audible reset

#### Riff continuation

* phrase group begins 4-note looping motif
* group is killed halfway through
* replacement offscreen group inherits motif and timing
* player hears continuation rather than collapse

#### Section continuity

* director decides the battlefield should remain in “pressure groove”
* actual entities can swap underneath that without reauthoring the musical identity from scratch

Principle:

**Gameplay actors are disposable; musical phrases are not.**

---

## Priority 3 – Make the player instrument a first-class music system

Right now the player is musically important in theory.
This pass should make that explicit in system design.

### Add/strengthen player instrument modes

Possible modes:

* `free_fire` – player fires freely, music follows as best it can
* `guided_fire` – fire cadence softly nudged toward groove divisions
* `locked_pattern` – weapon follows active rhythmic pattern
* `custom_pattern` – player-defined sequence overrides director suggestion

You do not need all of these immediately, but the system should be designed with this future in mind.

### Immediate implementation goal

Support at least:

* **system-shaped fire cadence**
* **player override option**

That means:

* we can mutate fire rate for musical reasons
* but we must expose a path for the player to impose their own rhythm/sequence

### What the player instrument should contribute

* core pulse reinforcement
* rhythmic hook
* audible identity
* musical agency
* satisfaction through repeated firing patterns

### Design warning

Do not let enemy music drown out the player's role.

If there is competition between:

* enemy system richness
* player musical clarity

the player should win.

---

## Priority 4 – Shift from note generation to motif generation

Right now the danger is that the system may still think in terms of “what note should happen next?”

For retro shooter feel, it should think more in terms of:

* motif
* riff fragment
* pulse pattern
* ostinato
* rhythmic cell

### Preferred unit of musical logic

Instead of one-off note choice, bias toward:

* 2-note cell
* 3-note riff
* 4-step rhythmic phrase
* 1-bar repeated pulse
* section-level repeated identity

### Director goals

The director should increasingly decide:

* current bass ostinato
* current combat riff family
* current accent density
* current player groove relationship
* allowed variation amount

rather than simply:

* note by note lane output

Principle:

**A retro shooter soundtrack is remembered as a riff, not as a cloud of note events.**

---

## Priority 5 – Make sections more stable

We want stronger chunking of musical identity.

Current risk:

* the music changes too often because gameplay is constantly changing

Desired behaviour:

* musical identity holds steady long enough for the player to feel it

### Suggested section states

Possible states:

* `approach`
* `pressure`
* `combat_lock`
* `danger_spike`
* `recovery`
* `boss_pressure`

These do not have to all be visible to players; they are useful for the director.

### Each section should influence

* density
* allowed motif families
* player prominence
* accent density
* bass activity
* harmonic tension
* instrument palette
* handoff aggressiveness

### Rule of thumb

Change musical section less often than gameplay state changes.

Example:

* lots of enemies die and respawn
* music still remains in same pressure groove for a while

That is good.

---

## System Changes to Make

## 1. Add style profile plumbing

If not already cleanly present, add a style profile object for `retro_shooter`.

This should contain tunable values such as:

* `bassEntropyMax`
* `leadLeapChance`
* `motifRepeatBias`
* `accentPitchVariance`
* `motionParticipationGain`
* `playerProminence`
* `sectionMinDuration`
* `handoffAggressiveness`
* `patternPersistenceBars`
* `allowedLaneRolesBySourceType`

Codex task:

* wire these into existing director decisions rather than hardcoding one-offs

---

## 2. Add explicit musical handoff support

Introduce data structures and logic for phrase continuity transfer.

Possible concepts:

* `continuityId`
* `phraseState`
* `inheritedMotif`
* `inheritBarOffset`
* `handoffCandidateScore`

Codex task:

* when a musical source is retiring or dying, search for eligible successors
* allow offscreen or incoming replacements if needed
* preserve timing and motif where possible
* log these handoffs in Music Lab

### New debug events to log

* `music_handoff_started`
* `music_handoff_completed`
* `music_handoff_failed`
* `music_handoff_inherited_phrase`
* `music_handoff_reset_phrase`

These will be very useful.

---

## 3. Add player instrument control model

Introduce a small player music control layer.

Minimum useful data:

* player fire cadence mode
* groove target subdivision
* pattern override enabled/disabled
* player-authored pattern data
* current weapon rhythmic profile

Codex task:

* separate player musical scheduling from generic enemy note scheduling
* make it its own intentional subsystem

### First version can be simple

Even just:

* fixed fire-rate snapping options
* optional sequenced burst pattern
* manual override toggle

would already be enough to prove the concept

---

## 4. Tighten lane responsibilities

Make lane roles stricter under `retro_shooter`.

### Recommended lane rules

#### Bass lane

Allowed from:

* spawners
* phrase groups
* continuity replacements

Not required to stay tied to original spawner.

#### Lead lane

Allowed from:

* phrase groups
* selected feature enemies
* player weapon layer

Should focus on short repeating motifs.

#### Accent lane

Allowed from:

* minor enemies
* attack triggers
* death punctuation
* special combat events

Should stay brief and readable.

#### Motion lane

Allowed from:

* movement-linked systems
* low-priority atmospheric triggers

Should be quiet and secondary.

Codex task:

* make source-to-lane assignment style-aware
* do not assume one gameplay source type permanently owns one lane

---

## 5. Bias the generator toward riff persistence

The system should actively prefer continuation over novelty.

### Increase:

* motif reuse
* phrase continuation
* bar-to-bar recall
* repeated rhythmic cells
* repeated contour shapes

### Decrease:

* random leapiness
* gratuitous variation
* constant instrument switching
* note-by-note novelty seeking

Codex task:

* add a visible “persistence bias” tuning path in the director
* expose it in Music Lab if possible

---

## 6. Improve instrumentation selection for this style

Your instrument system is already using catalog metadata.
Now it needs a stronger style filter.

### Add style-facing metadata if needed

Examples:

* `style_tags=retro_shooter,industrial,combat`
* `attack_profile=sharp|soft`
* `loop_feel=ostinato|riff|accent|texture`
* `player_friendly=true/false`
* `bass_capable=true/false`
* `cutthrough_score`
* `texture_score`

Codex task:

* make the selector prefer instruments that support groove clarity and combat readability
* avoid overusing soft, floaty, or decorative sounds during this style pass

---

## Music Lab / Debugging Requirements

This next pass will be hard to judge by code alone, so Music Lab needs to help.

## Add/track these metrics

### 1. Motif persistence metrics

Track:

* repeated 2-note cells
* repeated 3-note cells
* repeated rhythmic cells
* motif survival across entity death
* average phrase lifespan
* reset frequency

### 2. Handoff metrics

Track:

* number of handoff attempts
* number of successful handoffs
* percentage of musical lines preserved after source death
* audible reset rate after handoff opportunity

### 3. Player prominence metrics

Track:

* player note/event share
* player audibility windows
* player rhythmic alignment to groove
* player override usage
* moments where enemy density masks player contribution

### 4. Groove stability metrics

Track:

* bass pattern persistence
* section duration
* unique pitch count per bar
* unique rhythmic event count per bar
* note churn vs motif reuse

### 5. Readability metrics

Track:

* simultaneous active voices
* accent overcrowding
* motion-lane masking risk
* player-vs-enemy competition score

---

## Testing Questions

Use these questions when listening to builds.

### Groove / style

* Does the battlefield feel like it has a repeating combat groove?
* Is there a recognisable riff identity?
* Does the music feel deliberate rather than reactive-noisy?

### Continuity

* When a source dies, does the musical idea continue?
* Do handoffs feel seamless enough?
* Are there obvious audible resets that break the groove?

### Player

* Does the player feel like part of the soundtrack?
* Can the player meaningfully shape the rhythm?
* If fire rate is mutated, does it feel empowering rather than restrictive?
* Does player override still feel supported?

### Readability

* Can I hear what important enemies are doing?
* Are spawners/phrase groups musically legible?
* Is the music helping combat readability rather than obscuring it?

### Density

* Is there too much happening at once?
* Are accents used as punctuation rather than clutter?
* Does motion stay in a support role?

---

## Concrete Codex Task List

## Task 1 – Create retro shooter style profile

* add `retro_shooter` profile
* route existing director tunables through it
* bias toward repetition, groove stability, and player prominence

## Task 2 – Add musical handoff system

* support phrase continuation across death/retirement/replacement
* allow offscreen/oncoming replacements to inherit phrase state
* preserve bar position and motif identity where possible
* log handoff results

## Task 3 – Refactor lane ownership assumptions

* stop assuming spawners own bass permanently
* allow phrase groups / replacement entities to continue groove roles
* make lane responsibility style-aware

## Task 4 – Make player instrument explicit

* split player music logic into its own subsystem
* support mutable fire cadence
* add path for player override / custom sequence use
* ensure player voice remains prominent

## Task 5 – Increase motif persistence

* prefer motif/riff reuse over novelty
* reduce leapiness and excess note churn
* improve section stability

## Task 6 – Expand Music Lab for this pass

* add handoff metrics
* add persistence metrics
* add player prominence metrics
* add groove stability metrics

## Task 7 – Continue breaking up `beat-swarm-mode`

* extract new systems into coherent files
* keep each new file under 300 lines where practical
* avoid hiding important logic behind meaningless facades
* preserve debug visibility

---

## Suggested Order of Work

### Phase 1 – Style control

Implement:

* `retro_shooter` style profile
* stricter lane behaviour
* persistence bias
* instrument selection bias

Goal:

* get the soundtrack sounding more like a groove machine immediately

### Phase 2 – Continuity

Implement:

* musical handoff
* phrase inheritance
* replacement-source continuation

Goal:

* stop musical collapse when battlefield entities change

### Phase 3 – Player instrument

Implement:

* explicit player subsystem
* cadence shaping
* player override path

Goal:

* make the player feel central to the soundtrack

### Phase 4 – Metrics and tuning

Implement:

* Music Lab additions
* debugging logs
* style-specific tuning passes

Goal:

* make the system easier to tune by listening and evidence

---

## Success Criteria

This pass is successful when:

* the music sounds like a combat loop, not a random event cloud
* bass/groove can survive entity turnover
* phrase groups and replacement sources can preserve musical continuity
* the player feels like a lead instrument
* mutable fire cadence improves groove without removing agency
* motif reuse is clearly audible
* sections feel stable enough to be memorable
* Music Lab can prove when continuity and persistence are working

---

## Final Reminder

Do not over-focus on whether a specific enemy type is “supposed” to own a certain musical role.

The important thing is:

* the groove survives
* the riff survives
* the player matters
* the combat remains readable
* the soundtrack feels authored, even though it is systemic

That is the actual target.

