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
- intro slot ownership is now functioning as real lane-owned music instead of a bespoke silent placeholder path
- the intro now successfully teaches:
  - one stable pulse first
  - then one additive second percussion layer
  - with a smoother handoff into general play

Current working baseline:

- delivery is acceptable again
- delayed replies are real and can sustain short fragments instead of only single-note answers
- foreground readability is improved overall, but still fragile when reply/support motion gets too assertive
- lead phrase quality is now materially better than the surrounding texture
- the current integration problem is that once the lead enters, support/counter-rhythm can over-duck and the arrangement thins out too far

So the remaining work is refinement, not rescue.

## Intro Status

Completed in this pass:

- [x] first intro carrier owns the pulse lane and is audible immediately
- [x] first intro pulse stays musically stable through the intro
- [x] second intro carrier joins later instead of spawning immediately
- [x] second intro carrier is now a distinct audible backbeat layer
- [x] intro pulse and backbeat survive execution as separate voices
- [x] intro-to-play handoff no longer immediately rewrites the opening pulse
- [x] intro slot carriers now behave as interchangeable music carriers rather than one-off hardcoded exceptions

Still to do for intro:

- [ ] replace the first large intro enemy body with a composer group while keeping the same pulse slot music
- [ ] randomize the second intro carrier body per run between composer group and large enemy while preserving its slot music
- [ ] make the intro retain its teaching structure but feel musically different each run
- [ ] ensure overall playthrough-to-playthrough musical identity is more varied and distinct

Important current rule:

> The director should choose the musical slot first, and enemy bodies should be swappable outputs for that slot.

That intro direction now works structurally for pulse and backbeat.
The next step is to swap bodies without losing musical continuity.

## Primary Problem: Delivery And Audibility

The remaining failures are mostly perceptual:

- created events are not always heard clearly
- important loops can still enter, speak once, then disappear perceptually
- volume can still shift too sharply over short windows
- some musical material is now over-preserved and becoming too recognizable

This means the next work should optimize for presentation, not more architectural complexity.

## Musicality Reconstruction Plan

We now have enough evidence that the current post-fix system is stable enough to hear clearly, but too structurally flat.

Current failure mode:

- the run tends to settle into `2` rhythm layers plus `1` melody layer
- the old layered richness that existed when snakes and spawners directly owned musical roles is mostly gone
- fallback and persistence logic are now good enough to keep things alive, but not rich enough to create varied arrangement on their own

Important truth:

> We did not lose all of the old musical content.
> We mostly lost the old structural mechanism that let multiple enemy families act like independent arrangers at the same time.

So the reconstruction plan is:

- do **not** return to literal snake/spawner lane ownership as the default model
- keep protected lane identity and modern handoff rules
- reintroduce the old richness intentionally as authored arrangement layers

### Reconstruction Goal

Rebuild the old sense of layered musicality without restoring the ownership bugs that came with it.

Target post-reconstruction texture:

- one stable foundation / pulse role
- one stable counter-rhythm role
- one stable lead role
- one explicit answer / ornament role
- optional sparkle / motion layer during the right sections

That means the intended baseline should become:

> `foundation + counter-rhythm + lead + answer/ornament`

instead of:

> `rhythm + rhythm + melody`

### Working Rule

Use old toy identity as **style input**, not **lane ownership**.

Examples:

- snake-like:
  - contour
  - register leaps
  - longer melodic phrases
  - legato or arc-shaped lead motion
- spawner-like:
  - pulse
  - syncopation
  - drum-machine repetition
  - additive groove layering

The point is:

- snakes and spawners should still influence the music
- but they should not have to own the musical lane in order to contribute that character

### Reconstruction Stages

#### Stage 1. Restore Structural Layer Count

Goal:

- stop capping the arrangement at the effective `2 rhythm + 1 melody` shape

Needed work:

- allow one real extra non-lead group beyond the current stable core
- make sure melody fallback does not hijack all later group creation
- preserve lead persistence without making lead the only privileged lane

Success condition:

- long runs can sustain at least one additional non-foundation, non-lead musical layer

#### Stage 2. Author Explicit Lane Roles

Goal:

- stop treating every extra group like generic rhythm support

Define explicit composer roles:

- `foundation_groove`
- `counter_rhythm`
- `lead_phrase`
- `answer_ornament`

Each role should have:

- its own phrase logic
- its own register expectations
- its own instrument expectations
- its own density limits

Success condition:

- the fourth layer sounds like an answer, ornament, or phrase comment, not just another rhythm loop

#### Stage 3. Reintroduce Toy Character As Style Modules

Goal:

- recover the musical personality we used to get “for free” from enemy ownership

Needed work:

- extract reusable snake-like melodic behaviors
- extract reusable spawner-like groove behaviors
- feed those into composer profile generation as style families

Success condition:

- sections feel like they carry distinct personalities again without requiring literal toy ownership

#### Stage 4. Make Sections Rearrange The Piece

Goal:

- make section changes sound like arrangement decisions, not just intensity changes

Needed work:

- section state should decide which role families are active
- support / answer / sparkle should enter and leave intentionally
- build / release / breakdown should change texture, not only energy numbers

Success condition:

- a `3m` run sounds like it moves through recognisable arrangement states

#### Stage 5. Rebuild Long-Run Variation

Goal:

- stop the piece from becoming static once it finds one working texture

Needed work:

- rotate role families over phrase epochs
- allow answer and ornament lanes to swap behavior more freely than protected owners
- vary phrase density and contour without destabilising the main idea

Success condition:

- the run stays legible, but does not feel locked to one texture for minutes at a time

### Immediate Implementation Order

The next concrete work under this reconstruction plan should be:

1. make the extra post-lead group explicitly `answer/ornament` instead of generic response fill
2. give that role its own profile generator and register limits
3. widen section logic so `support`, `answer`, and `sparkle` can be intentionally active together in the right windows
4. bring back stronger snake-like and spawner-like style families as generator inputs
5. tune long-run entry/exit rules so melody persistence does not flatten the rest of the arrangement

### Lead Backlog

Lead work should continue, but it is no longer the only active concern.

Current lead-specific backlog:

- keep late-phrase cadence diversification small and listen for any return of width-style sameness
- improve phrase-to-phrase contour variety without making the lead jumpier or less singable
- tune lead/support coexistence so lead entry does not mute the counter-rhythm and answer bed
- preserve one clear lead foreground while allowing secondary loop material to remain audible underneath
- verify that lead improvement is measured against full-texture runs, not isolated lead quality

### Anti-Regression Rule

Do not reintroduce the old layering by undoing protected-lane ownership and handoff fixes.

Specifically:

- do not make snakes the default lead owner again
- do not make spawners the default rhythm owner again
- do not rely on enemy-type churn to create musical variation

Reconstruction should add:

- explicit arrangement roles
- explicit section behavior
- explicit style modules

not:

- accidental richness caused by unstable ownership

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

New actionable metrics to add or prioritize next:

- role embodiment coverage
  - for each active lane/role, measure how often it had a valid live carrier
- vacancy and rescue metrics
  - vacancy count, average vacancy duration, max vacancy duration, rescue count, rescue latency
- soft continuity metrics
  - distinguish exact phrase preservation from musically coherent substitutions
- director-to-embodiment divergence
  - compare intended lane activity against actual active/audible gameplay carriers

These are useful because they fit the current architecture.
They should be tracked in lane/role terms first, not enemy-family terms.

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

Immediate concrete failure from latest tests:

- `primary_loop_lane` is allowing more than one simultaneous `lead_melody` owner
- `answer_ornament` can duplicate and still read as a peer lead

Immediate acceptance targets:

- exactly one active `lead_melody` owner on `primary_loop_lane`
- at most one active `answer_ornament` support group per active support lane
- `answer_ornament` should not be treated as a co-equal foreground lead by default

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

### 14. Legacy `composition` Sample Role Cleanup

There are still samples in [samples.csv](/d:/Desktop/music-toy/music-toy.github.io/samples.csv) with `combatRole=composition`, but there is no current live `recommended_toys=composition` runtime path.

Current truth:

- these rows are effectively dormant in the current codebase unless they are also selected through other live role metadata
- that makes them ambiguous authoring state, not clearly active content

Backlog tasks:

- decide whether these legacy `composition` rows should be:
  - retagged into live Beat Swarm/sample metadata roles
  - reserved for a future dedicated runtime or toy path
  - explicitly documented as dormant legacy content
- review the current affected support/pad/arp samples and decide whether they are actually:
  - `support`
  - `answer_source`
  - `motion`
  - or non-runtime library content
- avoid silent cleanup that changes sample behavior accidentally; document the current dormant state first

Important rule:

> Do not leave legacy tags in a half-live state if they no longer correspond to any real runtime path.

### 15. Unified Beat Swarm Director

The current system has enough moving parts now that a more deliberate director layer is justified.

Why this matters:

- music lanes, carrier assignment, enemy spawning, and gameplay pacing are tightly related now
- current behavior is still split across:
  - lane ownership logic
  - singleton-group sync
  - carrier spawn/replace logic
  - section and groove planners
- that split makes it harder to guarantee that:
  - a musical lane keeps its identity
  - a replacement enemy inherits the correct role
  - difficulty ramp and arrangement ramp reinforce each other

Target behavior:

- one director should own the intended active musical lanes
- one director should also own how gameplay carriers are allocated to those lanes
- enemy spawn pressure and combat pacing should be able to rise/fall alongside the music on purpose
- musical progress and gameplay progress should feel linked, not coincidental

Director responsibilities:

- decide which lanes are active:
  - `foundation`
  - `secondary_loop`
  - `primary_loop`
  - `sparkle`
  - later support / answer / special layers
- decide which carrier type should serve each lane:
  - spawner
  - drawsnake
  - composer group
  - ghost/tail continuation
- own replacement policy when a carrier dies
- own section/density/difficulty ramp targets together instead of separately
- expose explicit handoff policy rather than relying on scattered local heuristics

Backlog tasks:

- define a single runtime director state that represents:
  - active lanes
  - desired carrier counts
  - current combat pressure
  - current musical pressure
- move lane activation and carrier assignment decisions behind that director state
- make spawn requests lane-aware instead of only enemy-type-aware
- add a pacing model where gameplay difficulty and musical density can co-ramp or intentionally diverge
- make carrier replacement preserve lane identity by default
- keep local systems as executors of director decisions, not independent policy owners

Important rule:

> The director should decide what the piece and encounter need; carriers and groups should execute that plan.

Design constraint:

- this should not become a giant rewrite before the current lane work stabilizes
- treat it as the next architectural phase once the present slot/lane bugs are under control
- use the current debugging lessons as input to its design, especially around:
  - carrier replacement
  - lane identity persistence
  - gameplay readability
  - difficulty/music co-pacing

Related detailed plan:

- [beat-swarm-enemy-director-plan.md](/c:/Desktop/music-toy/music-toy.github.io/beat-swarm-enemy-director-plan.md)

Follow-up direction under that plan:

- add future low-count `solo carrier` enemies that can hold a full rhythm or melody lane on their own
- use them when the director needs lane continuity without flooding the battlefield with many specials

### 16. Partial Explicit Musical State Layer

The next architectural step should be a partial explicit control layer above the current engine, not a full replacement of the current music runtime.

Why this is needed:

- the current lower-level systems are capable enough
- the main failures are increasingly about policy and continuity, not raw note generation
- too many important decisions are still inferred indirectly from:
  - lane occupancy
  - template choice
  - enemy embodiment
  - section heuristics
  - fallback state

That makes the system flexible, but too easy to push into "looks structurally valid, sounds wrong."

Target shape:

- keep the current executor systems:
  - motifs
  - lanes
  - call/response
  - event arbitration
  - carrier spawning / embodiment
- add a thin explicit state layer that decides:
  - current musical mode
  - allowed and required lanes
  - protected continuity lanes
  - profile-family bias
  - instrument palette bias
  - response policy
  - density ceiling
  - gameplay-driven overrides

Working rule:

> The explicit state layer should decide what must be true.
> The current engine should decide how to realize it.

Initial mode set:

- `intro_pulse`
- `intro_backbeat_bridge`
- `lead_entry_merge`
- `full_texture`
- `boss_rhythm_override`

First pilot:

- make `intro -> first lead entry` the first explicit-mode transition
- when lead enters, switch to `lead_entry_merge`
- keep `secondary_loop` continuity protected for a fixed bridge window
- require real rhythmic support continuity, not just nominal lane occupancy
- only then relax into `full_texture`

Gameplay override targets:

- scoped instrument bias for special enemies
  - example: a `piano` enemy can bias foreground/support material toward piano-capable families
- scoped boss override
  - example: a boss can force a rhythm-heavy or drums-only mode for a phase
- temporary encounter-specific lane policy
  - example: suppress melody and privilege `foundation + counter-rhythm` during a pressure phase

Important anti-rewrite rule:

- do not remove motif generation
- do not remove call/response
- do not remove lane arbitration
- do not remove carrier embodiment

This layer should reduce ambiguity, not replace the engine.

Debug requirement:

Every bar should be able to report:

- active mode
- requested next mode
- transition reason
- protected lanes
- required lanes not yet embodied
- fallback used / not used
- active gameplay override source

Reason for doing this:

- it preserves most of the current flexibility
- it gives the project a clean way to support:
  - intro merge
  - gameplay-driven musical identity changes
  - clearer section behavior
  - fewer accidental cross-system failures

Expected tradeoff:

- some emergent weirdness will be reduced
- but in exchange we should get stronger authorship, clearer debugging, and more reliable gameplay-to-music behavior

#### First Implementation Checklist

The first pass should stay narrow and prove the approach on one transition:

> `intro_backbeat_bridge -> lead_entry_merge`

Do not start by rewriting the whole director.

Implementation checklist:

1. Add a small runtime state object

Create a dedicated state container for:

- `activeMusicMode`
- `requestedMusicMode`
- `modeEnteredBar`
- `modeTransitionReason`
- `protectedContinuityLanes`
- `requiredLaneRoles`
- `instrumentPaletteBias`
- `gameplayMusicOverrides`

The first version should be tiny and readable.

2. Define the first explicit modes

Implement only:

- `intro_pulse`
- `intro_backbeat_bridge`
- `lead_entry_merge`
- `full_texture`

Each mode should declare:

- allowed lanes
- required lanes
- protected continuity lanes
- lead family bias
- rhythm family bias
- response policy
- density ceiling

3. Put mode evaluation in one place

Add one function that decides the active mode from:

- current section
- intro state
- lead-active state
- gameplay overrides

That function should produce:

- current mode
- next requested mode if different
- transition reason

Do not let multiple files infer the same transition independently.

4. Pilot the intro merge explicitly

For the first pilot:

- `intro_pulse` should require stable pulse only
- `intro_backbeat_bridge` should require pulse plus backbeat
- `lead_entry_merge` should require:
  - `primary_loop`
  - real rhythmic `secondary_loop`
- `lead_entry_merge` should protect `secondary_loop` continuity for a fixed bridge window
- `full_texture` should only start after that merge window is satisfied

Acceptance rule:

> Lead entry must not be allowed to count as successful unless a real rhythmic underlay survives with it.

5. Distinguish nominal from real lane coverage

Mode evaluation should not accept:

- any occupied `secondary_loop_lane`

as success.

It should require:

- audible rhythmic secondary coverage

This logic should be shared between:

- mode evaluation
- fallback admission
- Music Lab / debug reporting

6. Route existing systems through mode policy instead of replacing them

Keep using:

- existing motif generators
- existing lane assignment
- existing event collector
- existing embodiment logic

But make them read mode policy for:

- what lanes are required
- what continuity must be protected
- what profile families are preferred
- whether fallback is permitted

7. Add scoped gameplay overrides

The first implementation should only support two simple override forms:

- `instrument_bias`
- `mode_override`

Example targets:

- special enemy alive -> `instrument_bias: piano`
- boss phase active -> `mode_override: boss_rhythm_override`

These overrides should be:

- time-bounded
- explicitly attributed
- visible in debug

8. Add state-layer debug output

Per bar, log:

- `activeMusicMode`
- `requestedMusicMode`
- `modeTransitionReason`
- `protectedContinuityLanes`
- `requiredLaneRoles`
- `missingRequiredLaneRoles`
- `activeGameplayMusicOverrides`
- `fallbackUsed`

This should become the first place to inspect when musical behavior sounds wrong.

9. Use one success test before expanding scope

Do not add boss modes, palette complexity, or more mode types until this passes:

- intro pulse starts alone
- backbeat joins
- lead enters as solo carrier
- rhythmic underlay remains audible under the lead
- merge lasts for the intended bridge window
- then the piece opens into `full_texture`

10. Only then expand outward

After the pilot works, the next additions should be:

- `boss_rhythm_override`
- scoped special-enemy instrument bias
- explicit support / answer entry rules
- longer-horizon section modes

File targets for the first pass:

- [beat-swarm-mode.js](/d:/Desktop/music-toy/music-toy.github.io/src/beat-swarm/beat-swarm-mode.js)
- [beat-swarm-composer-lifecycle.js](/d:/Desktop/music-toy/music-toy.github.io/src/beat-swarm/beat-swarm-composer-lifecycle.js)
- [beat-swarm-composer-maintenance.js](/d:/Desktop/music-toy/music-toy.github.io/src/beat-swarm/beat-swarm-composer-maintenance.js)
- [beat-swarm-composer-events.js](/d:/Desktop/music-toy/music-toy.github.io/src/beat-swarm/beat-swarm-composer-events.js)
- [beat-swarm-music-lab.js](/d:/Desktop/music-toy/music-toy.github.io/src/beat-swarm/beat-swarm-music-lab.js)

Working boundary:

> If the pilot cannot make intro merge correctly, do not broaden the state layer yet.

### 17. Future Flexibility Guardrails

The next architecture pass should preserve room for future musical expansion, even if that work is not immediate.

This matters because Beat Swarm will likely need to support:

- more than one stable musical style family
- recognisable run-to-run variation
- future user-authored sequence insertion
- encounter-specific authored moments without breaking the generative base

Important rule:

> Future flexibility should plug into the director/state layer.
> It should not bypass lane policy, arbitration, or carrier ownership.

#### 17.1 Style-Family Flexibility

The system should be able to support multiple high-level style families without rewriting the runtime.

Examples:

- shmup-electro base
- rhythm-heavy boss override
- more melodic / harmonic special encounters
- future stylistic packs with different phrase and groove behavior

Implementation direction:

- keep one stable base style per run or encounter scope
- let modes and overrides bias:
  - motif families
  - rhythm families
  - register preference
  - instrument palette
  - lane density
- do not make style changes by letting random enemy ownership churn reshape the music

Working rule:

> Style should be selected intentionally and executed through the same lane system,
> not emerge accidentally from carrier instability.

#### 17.2 Recognisable Run Identity

Variation should not mean formless randomness.

Target behavior:

- two runs should feel recognisably different
- one run should still feel internally coherent
- the player should be able to notice that a run had a particular musical identity

Implementation direction:

- add a per-run music identity seed
- derive from that seed:
  - preferred style family
  - motif-family weighting
  - phrase contour bias
  - ornament bias
  - instrument palette weighting
- keep section transitions and overrides constrained by that run identity instead of re-rolling everything constantly

Success condition:

- runs differ in recognisable musical character without sounding unrelated from bar to bar

#### 17.3 User-Authored Sequence Insertion

The system should eventually allow user-authored material to enter the mix without replacing the whole generator.

Possible future use cases:

- short lead phrases
- answer/ornament fragments
- rhythm patterns
- encounter-specific authored motifs

Important rule:

> User-authored material should enter as lane-aware phrase content,
> not as an unmanaged parallel soundtrack.

Implementation direction:

- support authored phrase fragments at the role/lane level:
  - `foundation`
  - `counter_rhythm`
  - `lead_phrase`
  - `answer_ornament`
- let authored material declare:
  - preferred mode(s)
  - preferred register
  - preferred style family
  - allowed density
  - whether it is:
    - hard-authored
    - seed-mutated
    - or generator-completed
- allow the director to schedule authored fragments the same way it schedules generated phrase roles

Design constraint:

- user-authored sequences should still obey:
  - note-pool / harmony policy
  - lane arbitration
  - visibility / gameplay readability constraints
  - section and mode timing

That means authored content should be:

- insertable
- biasable
- suppressible
- replaceable by policy when the encounter requires it

not:

- absolute
- always-on
- immune to the rest of the runtime

#### 17.4 Non-Immediate Scope Boundary

These features are future-facing, not current blockers.

So the near-term rule should be:

- do not implement broad style-pack support yet
- do not implement user-sequence tooling yet
- do not broaden the mode system until the current merge / lane work is stable

But do preserve these extension points now:

- per-run identity seed
- mode/style-family bias hooks
- lane-role phrase insertion points
- scoped override attribution in debug

Reason:

> We should avoid another refactor later just to make future musical authorship possible.

### 18. Role-Driven Formation Spawning

The next presentation layer should make musical roles visibly legible on screen without turning enemy family back into hidden lane ownership.

Why this matters:

- the current system is structurally healthier
- the remaining weakness is often perceptual
- support can exist logically while still feeling visually weak
- the screen can still read like generic action instead of visible arrangement

Target outcome:

- the player can visually distinguish:
  - `foundation / groove`
  - `counter-rhythm`
  - `lead phrase`
  - `answer / ornament`
- intro-to-lead merge stays readable on screen as well as in audio
- support roles do not vanish perceptually just because lead arrives

Working rule:

> Music role chooses the formation first.
> Enemy family only styles that formation second.

#### 18.1 Gameplay-First Guardrail

Enemy behavior must work with gameplay and reinforce readability.
It must not replace or fight the core combat behavior.

That means:

- formation logic may control:
  - spawn region
  - member spacing
  - screen grouping
  - lightweight presentation offsets
  - role-specific pulse emphasis
- formation logic must not become a second movement brain that overrides:
  - core pathing
  - hit reactions
  - combat readability
  - existing enemy behavior identity

Important rule:

> Formations should boost gameplay readability, not override gameplay movement.

#### 18.1a Presentation vs Behavioral Formations

We should explicitly separate two kinds of formation logic:

- `presentation formations`
  - spawn region
  - spacing
  - grouping
  - lightweight anchor bias
  - pulse emphasis
- `behavioral formations`
  - follow-the-leader
  - winding chains
  - paired dance motion
  - advancing lines
  - other gameplay-carrying movement patterns

Working rule:

> Presentation formations are the universal baseline.
> Behavioral formations are optional style or encounter modules.

Implications:

- music must remain legible with presentation formations alone
- behavioral formations are opt-in
- behavioral formations may change gameplay shape, but only intentionally
- no level should require bespoke movement just to make the music readable

#### 18.1b Enemy Behavior Scopes

We should also explicitly separate three scopes of enemy behavior:

- `single enemy behaviors`
  - the local default behavior for one enemy at a time
  - examples:
    - default pursuit
    - zig-zag on beat
    - move then stop on beat
    - other individual rhythmic motion
- `group behaviors`
  - coordinated motion for one subset or formation group
  - examples:
    - winding chain
    - advancing line
    - escort / follow-the-leader variants
- `event behaviors`
  - rare, time-bounded overlays that affect most or all visible enemies
  - examples:
    - paired dance
    - beat bounce
    - bass-drop freeze / surge

Working rule:

> Single behavior is the baseline.
> Group behavior is coordinated variety.
> Event behavior is a sparse, section-level override.

This matters because the director will eventually need to decide:

- when to field many enemies with one single-enemy behavior
- when to add one or two coordinated group behaviors for contrast
- when a section is musically strong enough to justify a global event behavior

These three scopes should not be treated as interchangeable.
They have different cadence, cost, and musical meaning.

#### 18.1c Behavior Precedence

Behavior scope should have an explicit precedence model:

1. `event behavior`
2. `group behavior`
3. `single enemy behavior`

That means:

- event behavior may temporarily override local/group motion
- group behavior may coordinate members when no event behavior is active
- single-enemy behavior remains the fallback baseline

Important rule:

> Event behavior may override motion briefly.
> It must not silently replace ownership, lane policy, or encounter fairness.

#### 18.1d Director Ownership

The enemy director should eventually own behavior assignment the same way it owns pressure and carrier demand.

Director responsibilities should include:

- how many enemies use a given `single enemy behavior`
- whether a `group behavior` is introduced in this section
- whether an `event behavior` is eligible at all
- whether the current music intensity supports that event

Examples:

- a calmer section may spawn several enemies with `move_and_stop_on_beat`
- a busier section may add one `winding_chain` group for contrast
- a highly regular or high-intensity section may permit `paired_dance`
- a bass-drop moment may permit a brief freeze/surge event

Important guardrail:

> No section should require a special group or event behavior for the music to function.

The baseline piece must remain valid with:

- only single-enemy behaviors
- presentation formations
- normal lane ownership

Everything else is additive.

#### 18.2 Baseline Carrier Rule

Composer groups and solo carriers must be able to realize every role on their own.

This is non-negotiable because:

- levels may omit specials entirely
- music still needs to work without snakes or spawners
- specials should be optional takeover voices, not hidden requirements

So:

- every formation archetype must have a `composer group` baseline
- every important lane should also be satisfiable by a `solo carrier`
- snakes, spawners, and future specials may:
  - flavor
  - reinforce
  - temporarily take over
- but they must not be structurally required for musical legibility

#### 18.3 Formation System Shape

Add a lightweight formation layer above current spawn/embodiment logic.

Likely files:

- `src/beat-swarm/beat-swarm-formation-spawn.js`
- `src/beat-swarm/beat-swarm-formations.js`
- later if needed: `src/beat-swarm/beat-swarm-formation-motion.js`

Keep this out of `beat-swarm-mode.js` unless a very small bridge is unavoidable.

The formation layer should decide:

- archetype
- spawn region
- spacing profile
- symmetry
- presentation weight
- simple motion flavor

That applies to `presentation formations`.

`behavioral formations` should live in separate opt-in modules with their own debug and safety rules, not inside the baseline formation layer.

The existing runtime should still decide:

- actual lane ownership
- carrier continuity
- combat behavior
- arbitration and visibility limits

#### 18.4 First Archetypes

Do not build a huge library first.
Start with a small stable set:

- `foundation_anchor_line`
- `backbeat_pair`
- `syncopation_stair`
- `lead_arc`
- `answer_echo`

These should be treated as archetype families, not rigid templates.

Per-run and per-section variation should come from:

- seed
- spacing variation
- orientation
- region choice
- timing bias
- member count

That preserves future recognisable run identity instead of making every run stage the same picture.

#### 18.5 Intro And Merge First

The first required use case is still:

> `intro_pulse -> intro_backbeat_bridge -> lead_entry_merge -> full_texture`

Visual requirements:

- pulse remains visibly stable
- backbeat remains visibly distinct
- lead enters with a clearly melodic formation
- support roles cannot be visually de-emphasized too quickly during merge

Temporary guardrail:

- during `lead_entry_merge`, protected support roles should keep a minimum visual weight for a fixed bridge window

This is the visual equivalent of the merge continuity work already done in the audio/runtime layer.

#### 18.6 Precedence Rule

This feature must not add another competing policy brain.

Decision order should be:

1. music mode / director intent
2. required lane continuity
3. carrier availability
4. formation archetype selection
5. enemy family styling

So if a preferred formation conflicts with:

- gameplay readability
- lane continuity
- alive-count floor
- intro teaching structure

the formation must yield.

#### 18.7 Metrics And Debug

Do not judge this only by feel.
Add measurable readability signals.

Useful metrics:

- bars where `counter_rhythm` exists but visual weight is too low
- bars where `lead_phrase` exists but no distinct support formation is also visible
- time from lead entry to first visible `answer_ornament`
- beats where at least `3` distinct role formations are concurrently readable
- merge windows where support visual weight collapses too quickly
- formation diversity per run

Per-role debug should expose:

- role
- formation archetype
- style family
- spawn region
- member count
- visual weight
- merge protection active

This should eventually feed Music Lab.

#### 18.8 Anti-Regression Rules

Do not let this work reintroduce older architectural mistakes.

Specifically:

- do not restore snake/spawner lane ownership through visual logic
- do not make specials musically required for readability
- do not hide core policy inside bespoke transition hacks
- do not let every role use the same motion with different labels
- do not let formation motion override combat behavior

Success condition:

> The player can watch the screen and identify groove, lead, and reply
> without sacrificing gameplay readability or requiring special enemy families.

#### 18.9 First Implementation Checklist

The first pass should stay narrow and prove the idea on the existing healthy baseline.

Do not start by rewriting spawn logic, enemy movement, or lane ownership.

Implementation checklist:

1. Add a lightweight formation runtime record

Create a small role-presentation state object that can be attached to active carriers or groups.

First fields should be limited to:

- `role`
- `formationArchetype`
- `styleFamily`
- `spawnRegion`
- `spacingProfile`
- `symmetry`
- `presentationWeight`
- `mergeProtectionActive`

This should be enough to drive visual staging and debug output without creating a second policy brain.

2. Define the first archetype families

Implement only:

- `foundation_anchor_line`
- `backbeat_pair`
- `syncopation_stair`
- `lead_arc`
- `answer_echo`

Each archetype should define:

- preferred spawn region family
- default spacing
- default member-count range
- simple presentation offsets
- visual weight bias

Do not add deep motion logic yet.

3. Keep composer groups and solo carriers as the baseline

For the first pass, every archetype must be satisfiable by:

- a `composer group`
- a `solo carrier`

before any special-family styling is allowed.

Acceptance rule:

> A level with no snakes and no spawners must still be able to stage all required musical roles clearly.

4. Add one formation-selection function

Create one resolver such as:

- `selectFormationForRole(...)`

It should take:

- role
- active music mode
- section state
- carrier type
- style family bias
- run seed

And return:

- archetype
- region
- spacing
- member count
- presentation weight

Do not let multiple files invent formation choice independently.

5. Add one lightweight layout helper

Create one helper such as:

- `buildFormationLayout(...)`

It should provide:

- spawn offsets
- simple orientation
- pair/stair/arc arrangement data

It should not own:

- enemy AI
- combat pathing
- bespoke transition rules

6. Integrate at spawn/embodiment, not ownership

Use the formation layer at:

- `beat-swarm-composer-spawn.js`
- `beat-swarm-composer-maintenance.js`

for:

- assigning initial formation presentation
- preserving formation identity across continuity
- evolving a surviving role smoothly during merge

Do not use it to decide:

- who owns the lane
- whether a lane exists
- whether continuity is protected

7. Pilot the intro and merge path first

The first required sequence is:

- `intro_pulse`
- `intro_backbeat_bridge`
- `lead_entry_merge`
- `full_texture`

For that pilot:

- pulse should read as one stable formation
- backbeat should read as a second distinct support formation
- lead should enter with a clearly different melodic formation
- support should keep a minimum visual weight through the first merge bars

Acceptance rule:

> If intro-to-lead still looks like one visual layer taking over and everything else fading into generic clutter, do not expand the formation system yet.

8. Keep runtime motion shallow in the first pass

Allowed first-pass motion:

- anchor offset
- mirrored offset
- staggered phase offset
- simple arc bias
- simple pulse emphasis

Not allowed in the first pass:

- replacing core pathing
- creating a second AI-like motion controller
- special-case behavior trees per archetype

9. Add visibility/readability debug

Per active role, expose:

- role
- formation archetype
- style family
- member count
- region
- presentation weight
- merge protection state

And add first-pass metrics:

- bars with at least `3` readable role formations
- bars where support exists musically but drops below visual threshold
- time from lead entry to first visible answer formation

10. Add seeded variation immediately

Do not hard-freeze these archetypes into one look each.

From the start, vary by run seed:

- region choice
- orientation
- spacing
- member count
- mild offset pattern

The archetype family should stay recognisable.
The exact picture should not be identical every run.

11. Hold a hard boundary against special-family drift

Before any later expansion, verify:

- specials are not required for a readable groove
- specials are not required for a readable lead
- specials are not silently becoming the default visual owner for rhythm or melody again

Only after that passes should later work add:

- stronger style-family variation
- special-enemy-specific visual takeovers
- more archetypes
- richer motion behavior

File targets for the first pass:

- [beat-swarm-composer-spawn.js](/c:/Desktop/music-toy/music-toy.github.io/src/beat-swarm/beat-swarm-composer-spawn.js)
- [beat-swarm-composer-maintenance.js](/c:/Desktop/music-toy/music-toy.github.io/src/beat-swarm/beat-swarm-composer-maintenance.js)
- [beat-swarm-enemy-update.js](/c:/Desktop/music-toy/music-toy.github.io/src/beat-swarm/beat-swarm-enemy-update.js)
- [beat-swarm-mode.js](/c:/Desktop/music-toy/music-toy.github.io/src/beat-swarm/beat-swarm-mode.js)
- [beat-swarm-formation-spawn.js](/c:/Desktop/music-toy/music-toy.github.io/src/beat-swarm/beat-swarm-formation-spawn.js)
- [beat-swarm-formations.js](/c:/Desktop/music-toy/music-toy.github.io/src/beat-swarm/beat-swarm-formations.js)

Working boundary:

> If the first pass cannot make groove, lead, and reply visually legible without leaning on special enemies, do not broaden the system yet.

### 19. Event Sections

We also need a higher-level concept for rare, authored-feeling moments that sit above normal lane flow.

These are not ordinary formations.
They are short-lived sequence behaviors that make a section feel intentionally staged.

Examples:

- bass-drop freeze, then agitated release
- strong-beat unison bounce
- paired waltz motion
- line-dance or mirrored stepping
- brief enemy-wide stop-and-hit accent

Working rule:

> Event sections are rare, explicit, and time-bounded.
> They should decorate or intensify the music, not replace the lane system.

#### 19.1 Design Rules

- event sections must be optional overlays on top of the normal lane/runtime logic
- they must not break:
  - carrier continuity
  - role readability
  - combat readability
  - input fairness
- they should be driven by:
  - mode
  - bar-cycle timing
  - encounter state
  - future style or user-authored section cues

Important rule:

> Event sections may temporarily bias movement, pacing, or pulse,
> but the music system must still function normally when they are absent.

#### 19.2 Runtime Shape

Add a lightweight event-section runtime with fields like:

- `activeEventSection`
- `eventBehaviorClass`
- `enteredBar`
- `endBar`
- `strongBeatActive`
- `motionDamping`
- `agitationBoost`
- `presentationPulseScale`
- `eligibleRoles`

This should sit alongside:

- `musicModeRuntime`
- `enemyDirectorRuntime`
- `formation runtime`

#### 19.3 Section Classes

Start with a very small set:

- `beat_bounce`
  - synchronized accent bounce on strong beats
  - presentation-first
- `hold_then_surge`
  - brief freeze or damp
  - followed by stronger agitation
  - behavioral overlay
- `dance_phrase`
  - style-specific paired or line motion
  - behavioral overlay

Do not implement the full library first.
Get one safe section working, then extend.

#### 19.4 Integration Order

Precedence should be:

1. music mode / section continuity
2. enemy director / gameplay safety
3. formation baseline
4. event section overlay
5. enemy family styling

That means event sections may bias the battlefield presentation or motion, but they do not get to silently rewrite the core ownership model.

#### 19.5 First Implementation Checklist

- add `eventSectionRuntime`
- expose it in Music Lab/debug
- implement one safe section:
  - `beat_bounce`
- keep it rare and time-bounded
- limit it to presentation pulse and very small synchronized movement damping
- verify it does not regress intro/merge readability
- do not implement `hold_then_surge` or dance sections until the safe presentation section is stable

#### 19.6 Behavior Taxonomy Runtime

Before broadening event or group motion further, formalize one shared behavior contract.

Add a small runtime/state vocabulary such as:

- `singleBehaviorId`
- `groupBehaviorId`
- `eventBehaviorId`
- `behaviorPriority`
- `behaviorWindow`
- `behaviorSource`
  - `default`
  - `director`
  - `style`
  - `event`

This should let the runtime answer, for any active enemy:

- what its baseline motion is
- whether it currently belongs to a coordinated group movement
- whether a section/event overlay is currently overriding that motion

Acceptance rule:

> Do not let different files invent behavior precedence independently.
> The director/runtime contract should be the single source of truth.

#### 19.7 First Behavior-Scope Checklist

Implementation order should stay narrow:

1. formalize the three behavior scopes in runtime/debug
2. keep `single enemy behavior` as the always-valid fallback
3. allow `group behavior` as explicit opt-in variety
4. keep `event behavior` sparse and strongly gated by section/music state
5. only then allow the director to schedule them intentionally

Practical rule:

- any level should still work with only single-enemy behavior
- group behavior should improve variety, not patch a missing baseline
- event behavior should feel authored and rare, not constant

Acceptance rule:

- if the first event section is not readable without destabilizing combat or lane continuity, do not broaden the system yet

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

## Immediate Runtime Targets

Before adding more arrangement complexity, keep the current runtime aligned to these targets:

- `primaryLead = exclusive`
- `primaryLeadPersistence = stable`
- `foundationBufferBounds = bounded`
- `answerOrnamentContainment = contained`
- `composerPopulation = sane`

These are now the quickest acceptance checks for whether the current grouped-lane design is behaving musically.

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
