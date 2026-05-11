# Beat Swarm - Next Steps

## Current Direction - 2026-05-10

The technical music runtime is now healthy enough that the main problem is artistic direction, not basic reliability.

Recent tests have confirmed:

- the protected intro structure is working again
- the intensity-ramp test passes
- player/enemy weapons, explosions, and chain attacks remain reliable gameplay sounds
- audio-required enemy actions are not being silently dropped
- bass register drift has been fixed at execution and foundation keepalive creation
- build/peak cadence can be increased without changing BPM

The current musical issue:

> The system makes coherent procedural music, but it does not yet assert a strong arcade theme.

The target feel is closer to:

- neo-retro shmup
- arcade synthwave
- driving electro
- bullet-hell synth
- techno arcade

Core feel:

> relentless propulsion + recognizable hooks.

## Direction Reset

Do not continue solving this by adding more layers, more enemies, or more event sections.

The next phase should make the existing music more forceful, more memorable, and more constrained.

The current feedback diagnosis is:

- the music is too polite
- the lead sounds like melodic improvisation instead of a recognizable hook
- the bass is stable but still too supportive
- peak intensity can still feel like extra activity instead of focused pressure
- high intensity should become more patterned, not more chaotic

The new active priority is:

> motif persistence + bass drive + lead dominance.

## Active Plan - Arcade Music Personality

Add a narrow Level 1 music personality profile. This should not be a broad style-pack system yet.

Initial Level 1 personality should bias toward:

- high motif reuse
- high bass drive
- high lead dominance
- high repetition tolerance
- low harmonic drift
- medium-high syncopation
- short phrase lengths
- lower resolution tendency during build/peak
- clear release after peak

Example shape:

```js
level1MusicPersonality = {
  motifReuseBias: 0.9,
  bassDrive: 1.0,
  leadDominance: 0.9,
  repetitionTolerance: 0.9,
  harmonicDrift: 0.2,
  syncopation: 0.65,
  phraseAggression: 0.85,
  resolutionTendency: 0.35,
};
```

This profile should feed existing director/composer decisions rather than creating a second music brain.

## Implementation Target 1 - Motif Anchors

The lead needs phrase memory.

Current behavior is too close to:

```txt
A B C D E F G
```

Target behavior:

```txt
A A B A
A A C A
```

First-pass motif anchor requirements:

- generate or choose a short 4-8 step lead motif
- preserve both pitch contour and rhythm identity
- keep the motif active for several bars
- repeat it aggressively during build and peak
- allow small substitutions, octave variants, and response forms
- force periodic return to the hook

Do not aim for a complete authored song.

The goal is:

> recognizable procedural hook identity.

Likely file areas:

- `src/beat-swarm/beat-swarm-mode.js`
- `src/beat-swarm/beat-swarm-composer-events.js`
- `src/beat-swarm/beat-swarm-composer-maintenance.js`
- `src/beat-swarm/beat-swarm-music-lab.js`

Useful first metrics:

- motif anchor creation count
- motif reuse count
- motif return rate
- bars since last hook return
- lead motif variation count
- build/peak motif reuse share

Acceptance shape:

- the lead should be hummable/repeatable within one test run
- build and peak should reuse the hook more, not less
- release may thin or soften the hook but should not erase musical identity permanently

## Implementation Target 2 - Bass As Engine

The bass is currently stable, but it should feel more like propulsion.

Current problem:

> bass supports the harmony instead of driving the level.

Target behavior:

- repeated low pulse
- stronger eighth-note/subdivision pressure in build and peak
- fewer polite gaps during high intensity
- stable low register
- simple, forceful bass identity
- bass should stay distinct from lead chaos

Do not make bass melodic first.

First pass should focus on:

- rhythmic insistence
- low-register stability
- repeated engine-like pulse
- controlled stage changes:
  - `low`: sparse anchor
  - `medium`: steady pulse
  - `build`: more offbeat pressure
  - `peak`: relentless but patterned
  - `release`: stripped down but still grounded

Useful metrics:

- bass step gap by stage
- bass active-step count by stage
- bass low-register compliance
- bass pattern reuse count
- bass peak/rest contrast

Acceptance shape:

- player should feel the level has an engine underneath it
- build/peak bass should feel more urgent without becoming high-pitched or noisy
- release should noticeably strip back without losing tonal grounding

## Implementation Target 3 - Peak Means Focus

Peak intensity should not mean democratic layer chatter.

At peak:

- hook reuse should increase
- bass drive should increase
- lead should dominate
- ornaments should punctuate, not compete
- support should reinforce rhythm, not start a second lead
- melodic wandering should decrease

Important rule:

> aggressive arcade music is often more constrained than relaxed music.

Peak should feel patterned and forceful, not random.

## Keep From Current Runtime

Preserve these working pieces:

- protected intro set piece:
  1. player shooting only
  2. one pulse layer
  3. second beat/backbeat layer
  4. melody enters and continues
- music lanes remain director-owned
- enemies are carriers for normal music lanes
- enemy death and HP should not interrupt normal lanes
- special enemies may own special riffs, but only as explicit authored exceptions
- gameplay sounds stay separate from musical-flow gating
- central enemy action gate remains useful for timing attacks to music
- build/peak cadence escalation within one BPM remains useful

## Hold For Later

Do not actively expand these areas until motif/bass identity improves:

- formation spawning
- event sections beyond the current safe beat-bounce concept
- broad conductor scenes
- large sample metadata migration
- new special enemy families
- HP-section readability tuning
- framerate work, unless a new performance issue is reported

These are still valid future topics, but they are not the current bottleneck.

## Current Testing Focus

Use the Music Lab intensity-ramp test as the main listening pass.

The test should answer:

- does the intro still teach the musical structure?
- does the lead hook become recognizable?
- does build increase pressure without becoming messy?
- does peak feel forceful and patterned?
- does release actually release?
- does the bass stay low and driving?
- do gameplay sounds remain reliable and standard volume?

Current useful guardrails:

- `musicIntensityAuditionPassed = true`
- `audioRequiredSilentCount = 0`
- bass/foundation created and executed notes stay in low register
- max simultaneous voices stays controlled
- build and peak cadence rise without causing clutter

## Immediate Next Step

Implement the first small version of motif anchors.

Recommended first slice:

1. Add a Level 1 music personality profile.
2. Add a lead motif anchor runtime:
   - current motif notes
   - current motif rhythm
   - motif age in bars
   - last return bar
   - variation count
3. Bias primary lead generation toward `A A B A` style reuse.
4. Increase motif reuse during `build` and `peak`.
5. Add Music Lab metrics for motif creation/reuse/return.

Only after the lead has a recognizable hook should we deepen bass drive further.

## Working Rule

Use this tuning principle:

> Stop preserving everything equally. Make the right thing unmistakable.

For the next phase, the right things are:

1. pumping bass
2. recognizable lead hook
3. controlled intensity contrast
