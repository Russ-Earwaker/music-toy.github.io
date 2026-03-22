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

Useful new signals to add:

- `protectedLoopAudibility`
- `foregroundClarityScore`
- `simultaneousVoiceCount`
- `ghostLoopCount`
- `suppressedEventCount`
- `groupParticipationRate`

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

## Direction

Stop preserving everything equally.
Present the right things clearly.
