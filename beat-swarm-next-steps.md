# Beat Swarm - Next Steps

## Current State

The core architecture is no longer the main problem.

Implemented infrastructure now includes:

- protected lane ownership for `foundation` and `primary_loop`
- continuity-preserving handoff with deferred phrase-boundary application
- shared spawner loop ownership
- timing split between music-authored and gameplay-authored events
- composition-group continuity buffering
- ownership, queue, and decision diagnostics
- protected-lane guardrails against heuristic drift

The current phase is not "invent the music system."
The current phase is:

> Musical clarity, delivery reliability, and perceptual stability

## Progress Snapshot

Recent work has materially improved the system:

- protected `foundation` and `primary_loop` ownership now survive handoff much more reliably
- phase-3 instrument churn is far lower than it was during the earlier sync/handoff bugs
- ghost-loop cleanup is in much better shape and no longer looks like a main clutter source
- call-and-answer is now alive, measurable, and no longer a blind-debug area
- Music Lab export now preserves the fields needed to inspect call/response behavior directly

Current working baseline:

- delivery is acceptable again
- delayed replies are real and can sustain short fragments instead of only single-note answers
- foreground readability is improved overall, but still fragile when reply/support motion gets too assertive

So the remaining work is refinement, not rescue.

## Primary Problem: Delivery And Audibility

The remaining failures are mostly perceptual:

- created events are not always heard clearly
- important loops can still enter, speak once, then disappear perceptually
- volume can still shift too sharply over short windows
- some musical material is now over-preserved and becoming too recognizable

This means the next work should optimize for presentation, not more architectural complexity.

## Metrics Review

Useful existing signals to preserve:

- ownership continuity health
- deferred ownership queue health
- protected-lane inferred/missing claim counts
- spawner pipeline mismatches
- gameplay-authored vs music-authored event balance

Useful live signals now in use:

- `protectedLoopAudibility`
- `foregroundClarityScore`
- `simultaneousVoiceCount`
- `ghostLoopCount`
- `suppressedEventCount`
- `groupParticipationRate`
- `callCount`
- `responsePairs`
- `responseRate`
- `audibleResponseRate`
- `avgResponseSize`

## Remaining Priorities

### 1. Mix Hierarchy And Protected Audibility

Target behavior:

- foundation remains clearly trackable
- one foreground idea is legible
- support and sparkle sit underneath instead of competing
- visible gameplay cues should usually have matching audible cues

Biases to strengthen:

- foundation should not collapse below support in dense bars
- player fire should not bury protected loops
- fresh loop entries should remain audible long enough to be learned

This is a tuning/system-shaping task, not a new mixer architecture.

### 2. Ghost Loop Scope Correction

Ghost continuation is useful, but only as phrase completion.

Correct scope:

- finish the current phrase
- do not start a new phrase
- do not persist as a long-term invisible owner
- do not stack multiple ghosts unnecessarily

Goal:

- preserve musical truth without adding invisible clutter

### 3. Phrase Lock And Foreground Clarity

The system should keep important ideas stable long enough to register.

Needed behavior:

- foreground loops hold long enough to be understood
- competing replacements do not constantly interrupt them
- support material may still evolve around the locked idea

This should be implemented as controlled persistence, not rigidity.

### 4. Anti-Repetition And Generative Base

Some material, especially drawsnake phrases, is now too recognizable across sessions.

Direction:

- lean more on seeded variation than authored chunks
- use contour variation, pitch-pool movement, and mutation
- reduce exact phrase reuse
- preserve call/response and motif logic without sounding pre-baked

### 5. Density And Collision Control

The mix still needs better behavior when many valid events coincide.

Keep suppressing:

- same-note same-role duplicates
- same-register melodic pileups
- redundant accents

Keep allowing:

- layered percussion
- bass plus one readable lead
- limited support when it stays out of the main register

### 6. Spawner Group Refinement

Shared spawner ownership already exists.
The remaining work is refinement:

- validate that one group behaves like one loop owner
- keep one audio event per intended step
- ensure all visible members react consistently
- prevent per-member identity drift

Goal:

- spawners behave like one readable drum machine, not loosely synced individuals

### 7. Composition-Group Restraint

Composition groups should remain a continuity tool, not become the dominant musical source.

They should:

- complete phrases
- bridge ownership loss
- support gameplay-driven music

They should not:

- replace gameplay ownership by default
- dominate the foreground unnecessarily

### 8. Base Palette And Scoped Instrument Influence

The default musical identity should come from one stable base palette.

For the current game, that means:

- `beat-swarm-shmup` is the default gameplay layer
- normal enemies and ordinary music generation should draw from that base by default
- special-case identities should be additive and scoped, not global

Needed behavior:

- ordinary gameplay keeps one coherent shmup identity
- special enemies can carry a distinct instrumental influence without broadening the whole base pool
- bosses or rare encounters can temporarily own a stronger override when that is musically intentional

Examples:

- a piano enemy may force piano-capable call/answer or support material for itself
- a boss may temporarily force a broader foreground-capable override
- normal spawners and snakes should still fall back to the shmup base layer

The important rule:

- do not solve uniqueness by making the default pool stylistically incoherent
- solve it with scoped event or encounter overrides layered on top of the base palette

Current status:

- the first runtime hook exists
- a scoped `PIANO` debug-spawn test worked
- so the technical direction is validated

Current priority:

- lower than the active pacing / structure work
- do not keep expanding this ad hoc
- come back once the gameplay-facing special-enemy design is ready

Implementation direction:

- keep `beat-swarm-shmup` as the base gameplay palette
- add a per-enemy / per-encounter override hook such as:
  - `music_palette_override`
  - `instrument_influence`
  - `forced_music_identity`
- keep overrides constrained to the owning enemy, group, or encounter unless explicitly promoted to a global moment

Next time this is resumed, the work should start with design questions:

- which special enemies get overrides
- which overrides are support-only vs foreground-capable
- when an override is allowed to claim protected ownership
- how long an override is allowed to shape the mix before handing back to the base palette

### 9. Long-Horizon Musical Pacing

The system now makes better local decisions, but it still needs better flow over longer stretches of play.

Target behavior over time:

- phrases should arrive in waves, not as a flat constant density
- sections should have clearer rise, release, and recovery
- special moments like beat drops should feel prepared and earned
- longer runs should sound intentionally shaped, not just locally correct

Examples of desired pacing behavior:

- temporary thinning before a drop
- a more obvious return of foundation after sparse moments
- stronger contrast between normal combat and higher-pressure encounters
- longer phrase-energy arcs across multiple bars, not only step-level density changes

This is not just a mix task.
It is a maintenance and generation pacing task:

- when to add or remove groups
- when to widen or narrow density
- when to privilege continuity vs interruption
- when to allow a structural drop or restatement

Goal:

> The music should feel like it is going somewhere over time,
> not only making reasonable decisions in the current bar.

Related detailed plan:

- [beat-swarm-percussion-build-up-plan.md](/d:/Desktop/music-toy/music-toy.github.io/beat-swarm-percussion-build-up-plan.md)
- [beat-swarm-musical-structure-plan.md](/d:/Desktop/music-toy/music-toy.github.io/beat-swarm-musical-structure-plan.md)
- [beat-swarm-musicality-gaps-plan.md](/d:/Desktop/music-toy/music-toy.github.io/beat-swarm-musicality-gaps-plan.md)

That plan should drive the percussion-specific part of long-horizon pacing:

- groove layers instead of one mutating drum loop
- build-up by addition and removal of layers
- longer pulse stability
- explicit section rise, peak, and release behavior

The structure plan should drive the higher-level part:

- recurring motifs and returns
- explicit sections
- energy curves
- drop and release moments
- payoff over longer runs

The musicality-gaps plan should track the remaining non-structural musical ingredients:

- harmony
- tension and release
- silence / negative space
- cadence and phrase landing
- stronger register and instrument identity consistency

### 10. Controlled Instrument Introduction

The base palette is healthier now, but new timbres are still arriving too quickly in some runs.

That creates two problems:

- the player does not get enough time to learn the current instrumental identity
- several "never heard before" sounds can arrive close together and feel overwhelming instead of intentional

Target behavior:

- the base gameplay palette should introduce new instruments more slowly
- one new foreground-capable timbre should be easier to notice and learn before another arrives
- novelty should come in staged moments, not as continuous churn

Needed behavior:

- track recently heard instruments over a meaningful recent window
- apply a novelty budget so only a small number of truly new instruments may enter within the same stretch
- prefer reusing already-established instruments before opening another unfamiliar one
- strongly avoid introducing multiple never-heard-before foreground candidates at the same time
- once a new instrument is introduced, let it persist long enough to become legible before rotating again

Working rule:

> A new instrument should feel like an arrival, not like another random replacement.

Implementation direction:

- add a recent-heard / first-heard memory window
- separate "eligible" from "novel right now"
- cap simultaneous first-hear events, especially for `foreground` and `support`
- allow accents and scoped overrides to be looser than protected owners, but still not chaotic

This work should sit below the current pacing / structure push, but above any broad palette expansion.

### 11. Sample Leveling And Loudness Control

The project now has useful sample-analysis outputs, and they should inform backlog work on loudness consistency.

Relevant sources:

- [sample-analysis-suggestions.csv](/d:/Desktop/music-toy/music-toy.github.io/tools/output/sample-analysis-suggestions.csv)
- [sample-analysis-debug.csv](/d:/Desktop/music-toy/music-toy.github.io/tools/output/sample-analysis-debug.csv)
- [samples.csv](/d:/Desktop/music-toy/music-toy.github.io/samples.csv)

Why this matters:

- some samples are still materially hotter or quieter than others
- that pushes perceived mix balance around before Beat Swarm logic even starts doing its own gain shaping
- "too_hot" and "quiet" samples can make runtime tuning look worse than it really is

Target behavior:

- sample loudness should start from a more even authoring baseline
- the `volume` column in `samples.csv` should become the human-facing place to store per-sample level intent
- runtime balance work should build on that baseline instead of compensating for large raw sample mismatches

Backlog tasks:

- review `suggested_volume_peak_dbfs`, `suggested_volume_rms_dbfs`, and `volume_classification`
- identify clear outliers first, especially `too_hot` and `quiet`
- define a small target leveling policy for arcade/shmup samples
- populate or validate `samples.csv -> volume` from that policy
- keep unpitched percussion and pitched sustained material on separate expectations where necessary

Important rule:

> Use the analysis outputs as guidance and triage, not blind truth.

The debug and suggestion files are strong enough to find obvious problems:

- clipped / near-clipped drums and accents
- unusually quiet tonal samples
- likely inconsistent source gain between otherwise similar sounds

But they should still be checked by ear before finalizing the level written into `samples.csv`.

### 12. Sample Pitch Import And Base-Note Accuracy

The sample-analysis outputs should also drive base-note and octave authoring, not only loudness triage.

Relevant sources:

- [sample-analysis-suggestions.csv](/d:/Desktop/music-toy/music-toy.github.io/tools/output/sample-analysis-suggestions.csv)
- [sample-analysis-debug.csv](/d:/Desktop/music-toy/music-toy.github.io/tools/output/sample-analysis-debug.csv)
- [samples.csv](/d:/Desktop/music-toy/music-toy.github.io/samples.csv)

Why this matters:

- some samples are not rooted on `C`
- the project needs to preserve those real note centers instead of silently forcing everything toward `C`
- wrong base note or octave data will undermine harmony, cadence, and register ownership work
- but shared toys still need a stable playback anchor so switching instruments does not silently change the played note

Target behavior:

- pitched samples should import their detected base note and octave when the analysis confidence is good enough
- non-`C` notes should be preserved as first-class metadata, not treated like an error
- unpitched or low-confidence samples should stay unresolved until reviewed, not get fake note data
- raw detected pitch should be kept separate from the playback anchor used by toys when those two meanings differ

Backlog tasks:

- use `suggested_base_note`, `suggested_base_oct`, `pitch_confidence`, and `analysis_status`
- import non-`C` note centers and octaves into `samples.csv`
- distinguish clearly between:
  - confidently pitched tonal samples
  - weak / ambiguous tonal samples
  - unpitched percussion and noise sources
- add a conservative confidence threshold before auto-writing note data
- keep manual override available when the analysis is musically wrong even if it is technically confident

Important rule:

> Preserve true pitch centers when known; leave them blank when not known.

The goal is not to normalize everything to `C`.
The goal is to let `samples.csv` record both:

- the real source pitch center when known
- and the shared playback anchor when toys need stable note behavior across instrument changes

### 13. Player Weapon Loop As Musical Material

The player's current weapon sound loop should become part of the piece, not just an external combat layer sitting on top of it.

Why this matters:

- the player is the most persistent actor in the session
- weapon fire is one of the most repeated sounds the player hears
- if the weapon loop is musically disconnected, it fights the score instead of reinforcing it

Target behavior:

- the currently equipped weapon should feel like part of the active musical texture
- weapon loop identity should fit the current base palette and section feel
- weapon changes should read like deliberate musical changes, not random extra noise
- player loop behavior should support the piece without constantly stealing protected foreground ownership

Backlog tasks:

- define the player's weapon loop as a first-class musical layer with clear role limits
- decide when player weapon sound is:
  - rhythmic foundation support
  - foreground reinforcement
  - accent-only punctuation
- align player loop note choice, rhythm density, and register with current harmony / structure intent where possible
- make section behavior affect player-loop presentation too:
  - restrained in `drop`
  - supportive in `build`
  - more assertive in `drive` or `peak` when appropriate
- ensure weapon swaps hand off musically instead of abruptly breaking the active texture

Important rule:

> The player weapon loop should belong to the music system, not merely coexist with it.

Design constraint:

- this should integrate with the piece while preserving gameplay readability and weapon feel
- player-owned sound should usually reinforce the track, not replace the protected main idea unless explicitly designed to do so

## Working Rule

Use this as the tuning principle:

> If a note cannot be clearly heard or understood, it should not compete for authority.

That does not always mean "drop it."
It can also mean:

- defer it
- demote it
- soften it
- keep it visual-only

## Priority Order

1. Mix hierarchy and protected audibility
2. Ghost loop scope correction
3. Phrase lock and foreground clarity
4. Anti-repetition and generative base
5. Density and collision control
6. Spawner group refinement
7. Composition-group restraint
8. Base palette and scoped instrument influence
9. Long-horizon musical pacing
10. Controlled instrument introduction
11. Sample leveling and loudness control
12. Sample pitch import and base-note accuracy

## Direction

Stop preserving everything equally.
Present the right things clearly.

---

## Sample Metadata Migration

### Goal

Move `samples.csv` from mostly sound-family tagging toward a small musical-role and behavior model, without breaking existing palette, theme, or legacy runtime paths.

This matters because the current problems are mostly about:

- hierarchy
- audibility
- protected-loop eligibility
- call/answer eligibility
- support restraint

not simple instrument-family browsing.

### Migration Principles

- do not remove legacy tags yet
- add new metadata alongside old metadata
- keep runtime fallback paths safe
- keep the taxonomy small and reliable
- prefer conservative inference over false certainty

### Proposed Metadata

Required:

- `music_role`
  - `foundation`
  - `foreground`
  - `support`
  - `accent`
- `music_behavior`
  - `loop`
  - `oneshot`
  - `short`
  - `sustain`
  - `rhythmic`
  - `melodic`
- `runtime_family`
  - optional browsing / compatibility family such as `bass`, `percussion`, `lead`, `fx`, `synth`
- `needs_review`
  - marks rows where inference is uncertain

Optional:

- `music_eligibility`
  - small runtime-facing eligibility flags such as:
  - `protected_loop`
  - `call_source`
  - `answer_source`
  - `accent_only`

### Important Documentation Requirement

Each new metadata category must be clearly described inside or alongside `samples.csv`.

This is not only for runtime migration.
It also needs to work as guidance for future sound creation and sound sourcing.

For every new field, the project should explain:

- what the category means musically
- what it is for in Beat Swarm/runtime selection
- what it is not for
- example sample types that fit it
- example sample types that should not be tagged that way

That note is important because `samples.csv` is also going to be used as a human-facing guide when making or finding new sounds.

### Suggested Phases

1. Preserve all existing columns and tags.
2. Add the new metadata columns without changing runtime behavior.
3. Build a deterministic migration script that infers new fields conservatively and marks uncertain rows.
4. Add compatibility helpers so code can prefer new metadata and safely fall back to legacy data.
5. Manually review the Beat Swarm-critical sample set first.
6. Migrate Beat Swarm runtime decisions to prefer the new metadata.
7. Add validation/reporting for bad or conflicting metadata.
8. Only later reduce legacy-tag influence.

### Why This Is Valuable

Done well, this gives Beat Swarm a better basis for deciding:

- what must stay audible
- what may own a protected loop
- what should act as support
- what should stay brief
- what is appropriate for call-and-answer

without exploding the tag system into a large taxonomy.

---

## Call-and-Answer System - Current State

The call-and-answer system is now functioning technically and beginning to work musically, but it still needs hierarchy control.

### Observed Behaviour

- The system now generates valid delayed call/response pairs and Music Lab can measure them reliably
- Reply size is no longer stuck at single-note answers in every run
- The remaining failure mode is not "no response exists"
- The remaining failure mode is that response/support material can still become too present and muddy the foreground

### Key Problems

1. **Calls still need admission discipline**

This was previously a major problem.
It has been reduced, but still needs watching when density rises.

2. **Responses still need better hierarchy**

Reply size and phrase shape have improved.
The main risk now is replies reading like a second lead instead of support.

3. **Timing was too immediate**

This has improved materially.
Delayed replies now happen; immediate stitching is no longer the main issue.

4. **Mix/masking still matters**

Responses can still become either too hidden or too assertive depending on density.
The current risk is support motion muddying the main foreground line.

5. **Metrics are finally usable**

We now have usable measures for response rate, audible response rate, and average response size.
The next task is using those metrics to keep replies subordinate while preserving their recognisability.

---

### Result

> The system can now produce a real "statement -> space -> reply" pattern,
> but it still needs better hierarchy so the reply reads as support rather than a competing lead.

---

### Required Direction

Call-and-answer should stay phrase-based and ownership-driven:

- Only strong musical events should create calls
- Responses should stay in the **short phrase fragment (2-4 note)** range
- Responses should preserve **rhythm or contour identity**
- Responses should arrive with space, not immediate stitching
- Responses should remain clearly subordinate when a real foreground loop is already active

---

### Goal

> The player should clearly hear:
>
> - one idea speak
> - a moment of space
> - a recognisable reply

instead of layered note chatter.

---
