# Samples Metadata Guide

This guide defines the new metadata fields being added to [samples.csv](/d:/Desktop/music-toy/music-toy.github.io/samples.csv).

These fields are meant to help in two ways:

- runtime selection and hierarchy decisions in Beat Swarm
- human guidance when creating, choosing, or sourcing new sounds

The goal is a small, reliable role system, not a large taxonomy.

## Fields

### `base_note` / `base_oct`

Shared playback anchor for the sample across toys.

This is the important compatibility field:

- it tells the runtime what note the sample should behave like when no toy-level pitch shift is active
- it is how instrument changes can still preserve the same musical note
- it should stay stable unless you intentionally want to change playback behavior

Important:

- do not blindly overwrite this from raw analysis output
- many older samples were deliberately prepared around `C` so toy note behavior stays consistent
- if this field changes, normal toys can start playing a different sounding note for the same requested note

### `source_base_note` / `source_base_oct`

Raw sample-pitch metadata from offline analysis or manual review.

Use this when you want to record what the source sample actually seems to be centered on, even if the playback anchor remains different.

This field is for:

- analysis-backed documentation
- future retuning workflows
- understanding which samples were originally non-`C`

This field is not for:

- silently replacing `base_note`
- changing toy playback behavior by accident

### `music_role`

Primary musical job of the sample.
Use one value only.

Allowed values:

- `foundation`
- `foreground`
- `support`
- `accent`

Definitions:

- `foundation`
  - low-level structural anchor
  - appropriate for bass ownership, protected low-end loops, or stable floor material
  - not for brief decorative one-shots
- `foreground`
  - the kind of sound that can carry the main readable idea
  - appropriate for protected lead loops or strong call sources
  - not for purely decorative texture
- `support`
  - material that can reinforce rhythm, harmony, or motion without becoming the main idea
  - appropriate for backing loops, answers, or restrained motion
  - not for the main protected voice by default
- `accent`
  - brief punctuation or emphasis
  - appropriate for hits, blips, explosions, and decorative punctuation
  - not for protected loops or long phrase ownership

### `music_behavior`

Behavior tags describing how the sound tends to function.
Use multiple values only when they are genuinely true.

Allowed values:

- `loop`
- `oneshot`
- `short`
- `sustain`
- `rhythmic`
- `melodic`

Definitions:

- `loop`
  - suitable for repeated pattern ownership
- `oneshot`
  - naturally brief event, not intended to sustain as a looping carrier
- `short`
  - brief articulation, even if reused rhythmically
- `sustain`
  - can hold or ring long enough to support longer phrase weight
- `rhythmic`
  - primarily communicates pulse, groove, or repeated articulation
- `melodic`
  - primarily communicates pitch contour or phrase identity

### `runtime_family`

Optional compatibility or browsing family.
Examples: `bass`, `percussion`, `lead`, `fx`, `synth`.

This is for browsing and compatibility only.
It should not be treated as the main authority for mix hierarchy.

### `music_eligibility`

Optional runtime-facing eligibility tags.
Use these when a sample can do a musical job in principle, but should not automatically be trusted for every role that `music_role` might imply.

Allowed values:

- `protected_loop`
- `call_source`
- `answer_source`
- `accent_only`

Definitions:

- `protected_loop`
  - safe to use as a protected owner or main readable loop carrier
  - use this sparingly
- `call_source`
  - suitable for opening a call-and-answer phrase
- `answer_source`
  - suitable for answering a call without necessarily owning the foreground
- `accent_only`
  - should stay punctuation only
  - not suitable for protected loop ownership

### `needs_review`

Marks rows where the inferred metadata is uncertain or manually incomplete.

Use `true` when:

- the role is ambiguous
- behavior is unclear from legacy tags alone
- the sample is important enough that it should be reviewed before runtime depends on it

### `volume`

Optional per-sample level hint in dB.

Use this as the authoring-side loudness adjustment you want applied for the sample family once leveling is wired up properly.

Guidance:

- keep it simple and future-parseable, e.g. `-3`, `+3`, `-6`
- use the analysis outputs as triage, not blind truth
- check important samples by ear before finalizing

## Tagging Guidance

When choosing between tags, prefer the musical job over the sound family.

Examples:

- a bassy synth that holds the floor is `music_role=foundation`, even if its family is `synth`
- a short bright stab that punctuates phrases is `music_role=accent`, even if it is pitched
- a repeating arp-like loop behind the main line is usually `music_role=support`
- a sound that should carry the main readable motif is `music_role=foreground`

## What To Avoid

- do not assign multiple `music_role` values
- do not use `runtime_family` as a substitute for `music_role`
- do not use `music_eligibility` as a replacement for `music_role`
- do not label brief impacts as `foreground` just because they are pitched
- do not label every musical sound as `melodic`; only use it when pitch identity matters
- do not force certainty; use `needs_review=true` when unclear

## Beat Swarm-Oriented Intent

These fields are being added so the runtime can eventually decide more reliably:

- what must stay audible
- what may own a protected loop
- what should remain support
- what should stay brief
- what may act as a call or answer source

That is the intended use of the new metadata.
