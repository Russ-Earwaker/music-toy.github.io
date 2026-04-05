# Beat Swarm Musicality Gaps Plan

## Goal

Identify the remaining high-impact musical gaps that sit beyond local correctness and move Beat Swarm closer to feeling like intentional music.

This is the layer that turns:

> this is clever

into:

> this feels like real music

Important scope:

- this plan is **not** the structural reconstruction plan
- the structural reconstruction work now lives in [beat-swarm-next-steps.md](/d:/Desktop/music-toy/music-toy.github.io/beat-swarm-next-steps.md) under `Musicality Reconstruction Plan`
- that plan covers how to rebuild layered arrangement after moving away from literal snake/spawner lane ownership

So this document should be read as:

> once the arrangement structure is rebuilt,
> these are the next musical ingredients that make it feel like real music

## Current Strengths

The system already has strong work in:

- timing and scheduling
- layering and ownership
- clarity and audibility
- groove shaping
- call-and-answer
- continuity and handoff

Those are substantial gains.

It also now has a clearer understanding of what is missing structurally:

- the old layered richness mostly came from enemy-family ownership overlap
- the current system is more stable, but tends to flatten into `2` rhythms plus `1` melody
- so the arrangement-layer reconstruction must happen before the gaps below can fully pay off

## Remaining High-Impact Gaps

## 1. Harmony

### Problem

The system has:

- pitch
- motifs
- rhythm

But not enough harmonic context.

Without that, material can feel like:

- notes happening

instead of:

- music in a key

### Direction

Add a simple harmonic frame.

Example:

```js
harmonicState = {
  currentKey: "C",
  scaleType: "minor",
  allowedNotes: [...]
};
```

Use it to:

- constrain pitch generation
- align bass, lead, and response
- allow later controlled modulation

Minimum viable version:

- choose one scale per run
- keep most notes inside it
- allow occasional outside notes for flavour or tension

## 2. Tension And Release

### Problem

The system has density changes and layering, but not enough explicit emotional shape.

### Direction

Add a simple stable vs tense mode.

Example:

- stable mode:
  - scale notes
  - simpler rhythms
  - more repetition
  - lower density
- tense mode:
  - more syncopation
  - more variation
  - occasional off-scale color
  - higher density

Why it matters:

- without tension, peaks and drops feel flatter
- contrast needs to be more than just “more notes”

## 3. Silence And Negative Space

### Problem

Thinning exists, but the roadmap still does not treat silence strongly enough as an intentional musical tool.

### Direction

Add explicit negative-space behavior.

Needed behavior:

- deliberate foreground gaps
- motion layer drops
- brief pulse-only moments
- support removal before impact events

Working rule:

> Silence is a feature, not a failure.

Why it matters:

- drops hit harder
- replies read more clearly
- groove feels intentional instead of constantly full

## 4. Timing Feel And Humanisation

### Problem

Beat Swarm is still very grid-perfect.

That fits arcade style to a point, but a small amount of feel variation can add life.

### Direction

Add later, not immediately:

- tiny timing offsets
- small per-hit level variation
- optional swing or shuffle

Guardrails:

- keep it subtle
- keep it optional
- apply it more to motion than pulse

This should be a late-stage refinement, not an early core change.

## 5. Register Separation

### Problem

The system has `registerClass`, but not yet enough hard ownership over register space.

### Direction

Enforce stronger role-to-register expectations.

Suggested map:

- foundation -> low
- foreground -> mid
- support -> upper-mid / high
- accent -> high

Needed behavior:

- avoid same-register collisions
- prefer octave shifts over masking when possible
- do not let support stack directly on top of the main lead range

## 6. Instrument Identity Consistency

### Problem

Base palette and scoped overrides help, but instruments still need clearer role identity over time.

### Direction

If an instrument functions as a lead, support, or accent identity, it should remain recognisable in that role unless there is a deliberate structural reason to change it.

Working rule:

> Instruments should have musical identity, not just availability.

That means:

- avoid random role drift
- keep role identity stable enough for recognition
- use overrides as moments, not drift

## 7. Phrase Endings And Cadence

### Problem

The system can generate phrases and replies, but not enough of them clearly land.

### Direction

Add phrase-ending and cadence logic.

Examples:

- resolution-note bias
- phrase full-stop patterns
- clearer consequence to call-and-answer completion

Why it matters:

- without landing points, music feels like it never resolves

## 8. Memory Across Runs

### Problem

This is not urgent, but it is a meaningful future identity layer.

### Direction

Later, allow:

- motif family reuse across sessions
- style memory
- recurring interval or contour families

Why it matters:

- it can make the game feel like it has a recognisable musical personality across runs

## Priority Order

If this work is tackled incrementally, the highest ROI order is:

1. harmony
2. explicit silence / drop behavior
3. cadence / phrase endings
4. stronger register enforcement
5. instrument identity consistency

Later:

6. tension system
7. timing feel / humanisation
8. memory across runs

## Relationship To Other Plans

This plan complements:

- [beat-swarm-next-steps.md](/d:/Desktop/music-toy/music-toy.github.io/beat-swarm-next-steps.md)
- [beat-swarm-percussion-build-up-plan.md](/d:/Desktop/music-toy/music-toy.github.io/beat-swarm-percussion-build-up-plan.md)
- [beat-swarm-musical-structure-plan.md](/d:/Desktop/music-toy/music-toy.github.io/beat-swarm-musical-structure-plan.md)

Those plans should now be read in this order:

1. `beat-swarm-next-steps.md`
2. `beat-swarm-musical-structure-plan.md`
3. `beat-swarm-percussion-build-up-plan.md`
4. this document

The other plans handle:

- structural reconstruction of layered arrangement
- groove construction
- pacing
- sections
- motif return

This plan is specifically about the remaining ingredients that make the reconstructed output feel musically intentional:

- harmonic context
- emotional contrast
- silence
- landing and resolution
- stable instrument identity

In other words:

- `beat-swarm-next-steps.md` answers:
  - how do we get back to a richer layered arrangement?
- this plan answers:
  - once we have that arrangement, what still makes it feel musically shallow?

## Working Rule

> Correct patterns are not enough. The music also needs key, space, tension, and resolution.

## One-Line Summary

> Add harmony, tension/release, silence, register ownership, instrument identity consistency, and cadence so Beat Swarm feels like structured music rather than only a collection of locally correct patterns.
