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
