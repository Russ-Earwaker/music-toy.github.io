# Beat Swarm – Retro Shooter Music Pass

## Codex Implementation Brief

## Objective

Use the existing music-director systems to make Beat Swarm sound and feel more like a **retro shooter combat track**.

The result should feel like:

* a stable combat groove
* repeating riff fragments
* strong bass pulse
* readable enemy accents
* a central player instrument
* musical continuity even when the source entity dies or leaves play

The result should **not** feel like:

* random note chatter
* overly melodic wandering
* too many decorative layers
* every gameplay event becoming a musical event
* music collapsing when enemies die

---

## Key Design Rules

### 1. Preserve the musical idea, not the original source

Do not tightly bind musical continuity to a single enemy/spawner/group.

Allowed:

* phrase groups can continue bass/groove
* spawners can hand groove to phrase groups
* a replacement entity can inherit an in-progress phrase
* an offscreen replacement can continue a sequence if needed

Goal:

* if a source dies, the **musical line continues**
* avoid audible resets wherever possible

---

### 2. The player instrument is core

The player should feel like a featured instrument in the combat track.

Allowed:

* mutate fire cadence for groove
* quantize or guide fire rhythm
* let the player use custom sequences / override patterns

Required:

* system-shaped fire behaviour must not remove agency
* provide a path for player override

Goal:

* player feels musical and powerful, not constrained

---

### 3. Retro shooter style means repetition and groove

Bias the system toward:

* repeating bass pulses
* short 2–4 note riff motifs
* limited pitch vocabulary
* short aggressive accents
* stable sections
* lower entropy
* motif continuation over novelty

Avoid:

* large melodic leaps
* too much pitch churn
* excessive lane competition
* too many simultaneous “important” sounds

---

## Main Tasks

## Task 1 – Add `retro_shooter` style profile

Create a dedicated style/theme profile and route director decisions through it.

### Add tunables such as:

* `bassEntropyMax`
* `leadLeapChance`
* `motifRepeatBias`
* `patternPersistenceBars`
* `sectionMinDuration`
* `playerProminence`
* `motionParticipationGain`
* `accentPitchVariance`
* `handoffAggressiveness`
* `maxVoicesPreferred`
* `bassRootBias`
* `bassFifthBias`

### Behaviour goals

Under `retro_shooter`:

* bass is repetitive and stable
* lead uses short looped motifs
* accent is brief and percussive
* motion stays secondary
* player is more prominent
* novelty is reduced
* sections hold longer

### Important

Do not hardcode these rules in scattered conditionals.
Put them behind a proper style/profile path so they can be tuned.

---

## Task 2 – Add musical handoff / phrase continuity

Implement phrase continuity across entity death, retirement, or replacement.

### Needed concept

A phrase/groove should be able to survive beyond the source actor that started it.

Add a continuity-level abstraction such as:

* `continuityId`
* `phraseState`
* `motifState`
* `grooveOwner`
* `inheritedPhraseStep`
* `inheritedBarOffset`

Exact naming is flexible.

### Support these cases

* source dies, replacement inherits motif + timing
* source retires, nearby compatible source takes over
* source exits screen, incoming/offscreen replacement continues line
* bass role can transfer between spawner and phrase group
* phrase group motifs can continue across entity turnover

### Preserve where possible

* current motif
* phrase step
* bar position
* subdivision phase
* lane role
* harmonic role
* intensity/energy state

### Failure behaviour

If no valid successor exists:

* allow reset
* log that reset clearly
* do not silently fail

---

## Task 3 – Stop assuming spawners own bass permanently

Remove any strong assumption that:

* spawner = bass owner
* phrase group = only melody/riff
* source type permanently owns a lane

### Replace with style-aware role assignment

Under `retro_shooter`, bass can come from:

* spawners
* phrase groups
* designated replacement sources
* continuity handoff targets

### Goal

Lane ownership should be based on:

* current style
* current section
* continuity needs
* current battlefield availability

Not just source class.

---

## Task 4 – Make the player instrument an explicit subsystem

Split player musical logic away from generic enemy note scheduling.

### Minimum support needed

* player cadence shaping
* groove subdivision target
* optional pattern override
* player rhythmic profile
* player prominence tuning

### Desired modes

You do not need all immediately, but structure toward them:

* `free_fire`
* `guided_fire`
* `locked_pattern`
* `custom_pattern`

### First useful implementation

A smaller first pass is fine:

* cadence snapping / shaping
* optional rhythmic pattern mode
* clear override path for player-authored rhythm

### Important

The player must remain audible and meaningful when combat density rises.

If there is conflict between:

* richer enemy music
* clearer player role

prefer clearer player role.

---

## Task 5 – Shift note generation toward motif generation

Bias the system away from isolated note decisions and toward reusable phrase fragments.

### Prefer generating:

* bass ostinati
* riff cells
* repeated rhythmic cells
* short loop fragments
* section-level phrase identities

### Reduce:

* note-by-note novelty
* frequent contour resets
* gratuitous pitch movement
* melodic wandering

### Practical target

Combat music should be understandable as:

* “this is the current groove”
* “this is the current riff”
* “this is the player pattern”

Not as a cloud of unrelated note events.

---

## Task 6 – Tighten lane responsibilities under `retro_shooter`

### Bass lane

Use for:

* pulse engine
* ostinato
* low-end support
* root/fifth-heavy repetition

May be driven by:

* spawners
* phrase groups
* continuity replacements

### Lead lane

Use for:

* short repeating combat riffs
* limited motifs
* strong rhythmic identity

May be driven by:

* phrase groups
* selected feature enemies
* player subsystem

### Accent lane

Use for:

* attacks
* deaths
* small punctuation hits
* short event emphasis

Keep it brief and readable.

### Motion lane

Use for:

* low-priority motion-linked texture
* subtle support only

Do not let motion become a competing melodic voice.

---

## Task 7 – Improve style-aware instrument selection

Your catalog metadata is already being used. Extend the selector so `retro_shooter` strongly prefers instruments that help groove clarity and combat readability.

### Add metadata if needed

Examples:

* `style_tags`
* `attack_profile`
* `loop_feel`
* `bass_capable`
* `player_friendly`
* `cutthrough_score`
* `texture_score`

### Desired selection bias

Prefer:

* punchy
* sharp
* groove-friendly
* riff-friendly
* readable combat timbres

Avoid overusing:

* soft decorative tones
* floaty textures
* sounds that blur together under load

---

## Task 8 – Expand Music Lab for this pass

Add metrics and logs that help judge groove, continuity, and player prominence.

### Add metrics for motif persistence

Track:

* repeated 2-note cells
* repeated 3-note cells
* repeated rhythmic cells
* average phrase lifespan
* phrase reset rate

### Add metrics for continuity handoff

Track:

* handoff attempts
* successful handoffs
* failed handoffs
* inherited motif reuse
* phrase reset after eligible handoff

### Add metrics for groove stability

Track:

* bass pattern persistence
* unique pitch count per bar
* unique rhythmic event count per bar
* motif reuse vs novelty
* section duration

### Add metrics for player prominence

Track:

* player event share
* player audible windows
* player masking risk
* player/groove alignment
* player override usage if available

### Add readability metrics

Track:

* simultaneous active voices
* accent overcrowding
* motion masking risk
* player-vs-enemy competition score

---

## Required Debug Logs

Add explicit logs for continuity behaviour.

### New event types

* `music_handoff_started`
* `music_handoff_completed`
* `music_handoff_failed`
* `music_handoff_inherited_phrase`
* `music_handoff_reset_phrase`

### Include useful fields

Where applicable include:

* source entity id/type
* target entity id/type
* continuity id
* lane role
* phrase step
* bar position
* reason for handoff
* reason for failure/reset

These logs matter. Do not hide them.

---

## File / Architecture Guidance

The large Beat Swarm mode file is already being broken up. Continue that work.

### Preferred extraction targets

If sensible, split out systems like:

* style profile / tuning
* continuity handoff
* player instrument control
* motif/riff generation
* lane assignment
* Music Lab metrics/logging helpers

### Constraints

* keep new files under 300 lines where practical
* do not create meaningless facade modules
* do not hide important logic behind indirection with no value
* preserve good debug visibility
* keep integration points explicit

---

## Implementation Order

## Phase 1 – Style control

Implement first:

* `retro_shooter` style profile
* stricter lane behaviour
* motif persistence bias
* instrument selection bias

Goal:

* make the soundtrack immediately more groove-driven

## Phase 2 – Continuity

Implement next:

* musical handoff
* phrase inheritance
* continuity ids/state
* replacement source takeover

Goal:

* prevent groove/riff collapse when sources die

## Phase 3 – Player instrument

Implement next:

* explicit player subsystem
* cadence shaping
* pattern override path
* stronger player prominence

Goal:

* make the player clearly part of the track

## Phase 4 – Metrics and tuning

Implement next:

* Music Lab additions
* debug logs
* tuning pass

Goal:

* make the system tuneable by evidence, not guesswork

---

## Success Criteria

This pass is successful when the build audibly demonstrates:

* a stable combat groove
* short repeating riff identity
* continuity across source death/replacement
* bass that survives entity turnover
* strong player musical presence
* less random note churn
* fewer audible resets
* clearer role separation between bass / lead / accent / motion

And Music Lab should be able to show evidence for:

* motif reuse
* continuity handoffs
* section stability
* player prominence

---

## Do Not Do

* Do not make every event musically important
* Do not overcomplicate harmony for this pass
* Do not keep bass ownership tied to spawners only
* Do not let motion become a second lead voice
* Do not make the player subordinate to enemy music
* Do not silently reset phrases when a handoff was possible
* Do not bury important musical logic inside giant unreadable functions

---

## Short Version for Codex

Implement a `retro_shooter` music style that biases Beat Swarm toward stable bass pulses, short repeating riff motifs, sharp readable accents, and a strong player instrument. Add a musical handoff system so phrases/grooves can continue across source death or replacement. Stop assuming spawners permanently own bass; allow phrase groups or replacement entities to continue groove roles. Split player music into its own subsystem with cadence shaping and an override path. Expand Music Lab with persistence, continuity, groove stability, and player prominence metrics plus explicit handoff logs.

