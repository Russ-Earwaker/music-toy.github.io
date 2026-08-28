# Beat Swarm - Next Steps

## Current Status - 2026-06-21

Beat Swarm has moved from director-only music into player-authored musical DNA that the director interprets at runtime.

Confirmed baseline:

- protected intro set piece is working:
  1. player shooting only
  2. one pulse layer
  3. second beat/backbeat layer
  4. melody enters and continues
- music is not interrupted by normal enemy death or health changes
- gameplay sounds remain separate and reliable:
  - player weapons
  - enemy weapons
  - explosions
  - chain attacks
- director-created music drives the score, and enemies adapt to it
- no enemy type is essential to music playback
- bass/foundation notes stay in the intended low register
- player theme boards exist and use the normal Rhythmake toy behavior
- generated theme defaults are audible in the theme editors
- player motifs are now feeding the runtime score
- peak, release, and settle are acceptable for now and should return later for a polish pass
- composition pacing now has an explicit flow through low, medium, build, peak, release, and settle
- gameplay/enemy pressure is being aligned to director pacing instead of letting enemies drive the score
- the weapon-gate onboarding sequence is now integrated into Beat Swarm level start:
  - the player authors a 16-slot weapon motif by flying through note / Damage Up gates
  - note choices create a subtle constellation trail in the starfield
  - the completed weapon motif is applied to the normal weapon tune toys
  - the corridor hands off into the arena and low-intensity music
  - corridor weapon audio now uses the main player weapon sound path

The current baseline direction is:

> relentless propulsion + recognizable player-owned hooks.

The style target remains:

- neo-retro shmup
- arcade synthwave
- driving electro
- bullet-hell synth
- techno arcade

## Core Rule

Use this tuning principle:

> The player creates short musical DNA. Beat Swarm turns it into a living arcade score.

Player motifs are identity sources, not full-score instructions.

The director controls:

- context
- orchestration
- density
- register
- intensity
- motif transformation
- enemy/music presentation

The player should recognize their authored material inside the score, but the runtime is allowed to simplify, fragment, harmonize, echo, intensify, or riff around it when the musical state requires that.

Exception:

- the authored weapon riff is immutable gameplay feedback
- its timing, pitch, instrument, damage slots, and actual firing sounds must not be transformed
- arrangement voices may reinforce, harmonize around, echo, or fill gaps around the weapon without changing it

## Active Direction - Player Composition, Enemy Arrangement

Use this ownership model:

> The player creates the composition. Enemies provide the arrangement.

Persistent player-authored core:

- weapon riff: immutable gameplay pulse authored by the corridor
- Foundation Rhythm: kick/percussion rhythm authored by rocket interactions; persisted internally as `bassDrive` / `foundation_lane` for compatibility
- Accent Rhythm: syncopated percussion authored by bouncers
- Lead Theme: melodic phrase authored by lead interactions
- Power Theme: later special-state melodic identity

Temporary director-owned arrangement:

- tonal bass support
- harmony, pads, chords, or arpeggios
- countermelody
- rhythmic reinforcement
- call/response
- sparkle, ornaments, fills, and risers

Formation generation should select the complementary musical role first, then select enemies, abilities, instruments, and derived notes that can perform it. Supporting material should derive from player motifs, weapon gaps, harmonic centre, contour, and current intensity rather than merely choosing unrelated scale-safe notes.

Enemy death rules:

- a core player lane never depends on enemy survival
- a temporary formation arrangement may end when its performers die
- arrangement removal should be quantized and released cleanly instead of cutting a sustained voice mid-note

Intensity primarily changes the sophistication and density of relationships around the core composition. It must not rewrite the weapon or progressively replace player-authored identity.

## Theme Slots

Current player music theme slots:

| Slot | Toy Type | Motif Length | Lane Role | Runtime Purpose |
| --- | --- | --- | --- | --- |
| Lead Theme | Drawgrid | 4 toys | Lead / Main Hook | main identity, call/response, peak hook, release memory |
| Foundation Rhythm (`bassDrive`) | Simple Rhythm | 2 toys | Foundation / Kick Percussion | player-authored rhythmic foundation; tonal bass belongs to temporary arrangement |
| Accent Rhythm | Simple Rhythm | 2 toys | Accent / Percussion / Stabs | secondary rhythm, attack accents, phrase punctuation |
| Power Theme | Drawgrid | 2 toys | Powered-Up Lead | later powered-up/special-state identity |

Motif length rule:

- Lead Theme is the only extended phrase by default so players can author a recognizable call / continuation / answer / turnaround.
- Bass Drive, Accent Rhythm, and Power Theme stay at 2 toys so functional layers remain readable.
- Longer runtime variation should come from director transformation, not from making every player slot longer.

## Active Direction - Motif Transformation

The next major design step is to formalize motif interpretation by intensity state.

The problem to avoid:

```txt
more motif = more intensity
less motif = less intensity
```

The better model:

```txt
player motif = identity
intensity state = interpretation recipe
director = transformation engine
```

Intensity should be controlled by:

- certainty
- density
- layering
- register
- rhythmic pressure
- cadence frequency
- harmonic tension
- silence

This means motifs can remain psychologically present even when the score releases tension.

## Interpretation Modes

Formalize motif interpretation modes as runtime concepts:

| Mode | Use |
| --- | --- |
| `literal_statement` | recognizable player-authored phrase, used for ownership and grounding |
| `build_assemble` | partial motif reveal, pickups, phrase assembly |
| `peak_riff` | full motif plus embellishment, doubling, extra cadence pressure |
| `release_riff` | sparse memory fragments, repeated anchors, delayed echoes |
| `settle_echo` | stable low-density identity absorbed into the groove |
| `dormant` | motif mostly absent, reserved for silence or scene resets |

These modes should select:

- phrase completeness
- rhythm preservation
- contour preservation
- pitch simplification
- ornament amount
- silence amount
- instrumentation strength

## Intensity Goals

| Intensity | Motif Treatment | Goal |
| --- | --- | --- |
| Silent | weapon only, no background motif after intro | prove silence is available as a musical tool |
| Low | exposed player-authored core with few/no supporting voices | establish composition without arrangement clutter |
| Medium | bass foundation plus recognizable lead/accent identity | introduce player material clearly |
| Build | partial motifs, pickups, more cadence pressure | imply the player theme is assembling |
| Peak | full motif ownership plus riffing/doubling | make the player's theme take over the battlefield |
| Release | motif memory, fragments, echoes, reduced certainty | preserve identity while releasing tension |
| Settle | stable domesticated identity | make the world feel like it absorbed the player's theme |

## Current Focus - Reusable Music-Authoring Events

The integrated level-start sequence is now:

1. weapon gates author the player weapon motif
2. Tap Orbs author a rhythm motif
3. Music Missiles author a rhythm motif
4. completed motifs return to director ownership

Tap Orbs and Music Missiles are interaction types, not lane-specific events. The director supplies a target descriptor:

- `eventType`
- `themeId`
- `laneId`
- motif step count
- target hit count

The same interaction can therefore author Bass Drive, Accent Rhythm, or another registered rhythm theme. Bass Drive and Accent Rhythm are current presets, not hardcoded limits.

Core rule:

> An authoring event describes how the player creates musical data. Its target descriptor decides where that data belongs.

Future melody events should use the same request/start/commit lifecycle with `melody_rewrite`, but use interactions designed for pitched note and contour selection rather than forcing melody through rhythm-only Tap Orb logic.

### Deferred Retest - Tap-Orb Construction Playback

- During the active Tap Orb sequence, Foundation hits can still sound like near-simultaneous double/triple triggers.
- Post-event director playback is no longer duplicated.
- The saved motif contains all eight intended hits, but adjacent authored subdivisions and/or an unresolved construction-only trigger path may still be contributing.
- Retest later with `tap_orb_quantized_motif_trigger` and `tap_orb_quantized_motif_duplicate_suppressed` telemetry before making further musical changes.

Future onboarding safeguard:

- if the player does not activate a required authoring interaction for a long time, enter an unskippable tutorial pause with clearer direction

## Practical Techniques To Implement

### Motif Decay

Reduce phrase completeness over time.

Example:

```txt
Peak:    A C D G
Release: A - D -
Later:   - C - -
Final:   A - - -
```

### Rhythm Preservation / Pitch Reduction

Keep rhythmic DNA while simplifying pitch.

Example:

```txt
Peak:    A C D G
Release: A A A G
```

This helps players recognize their motif even when the score is cooling down.

### Interval Echoes

Replay only the strongest motif identity points:

- first leap
- final cadence
- strongest accent interval
- phrase anchor note

### Delayed Ghost Responses

Peak:

```txt
player motif drives battle action
```

Release:

```txt
environment remembers and answers fragments of the motif
```

This should make release feel emotional rather than empty.

### Harmonic Dissolve

Peak:

- fuller motif
- doubled or reinforced
- stronger instrument
- support voices

Release:

- single line
- no doubling
- quieter instrumentation
- more silence between phrases

## Guardrails

- Do not make enemy lifespan responsible for music continuity.
- Do not make a specific enemy type essential for any musical lane.
- Spawners, snakes, groups, and large enemies can each present music, but the director owns the score.
- Player and enemy weapon sounds are gameplay feedback and should remain reliable at standard volume.
- Visible toy data should behave like normal Rhythmake toys.
- Beat Swarm should not secretly alter the player's saved toy data.
- Never transform the actual weapon riff; it is immutable gameplay feedback.
- Keep the rocket-authored foundation percussive. Tonal bass is a temporary supporting arrangement role.
- Scale correction, harmonization, riffing, and motif transformation belong to runtime interpretation.
- Occasionally expose raw authored material so player agency is audible.

## Current Testing Focus

Use playtests and Music Lab where useful to answer:

- Do director-owned musical enemy formations remain readable over a complete simulated player score, rather than being judged against sparse test music?
- Do formation voices add musical variation without masking the weapon, Bass Drive, Accent Rhythm, or Lead Theme motifs beneath them?
- validated: `Run Full Score + Arrangements (1x75s)` kept the complete seeded player score recognizable beneath production-derived Foundation reinforcement, exact-subdivision Accent reinforcement, and delayed pentatonic Lead response at fixed Peak intensity; the trace recorded no unscheduled formation attacks or core Lead interruption
- validated: `Run Arrangement Intensity Ramp (1x115s)` preserved the core score while admitting Foundation reinforcement at Medium bar 8, Accent reinforcement at Build bar 16, and a delayed pentatonic Lead response at Peak bar 28; a fourth Peak group was correctly rejected by visual/live-threat limits, Release and Settle admitted no new formations, and every audible formation attack used its assigned motif phase
- production validation: onboarding completed every authored Foundation, Accent, and Lead interaction before enabling arrangements; two later Build/Peak cycles spawned six correctly derived formations with no unscheduled attacks, but the first Medium arrangement was silently excluded because the shared group cap counted all three required core-lane groups against the same three slots; shared capacity now reserves core-lane groups separately from intensity-policy arrangement slots and traces any future shared-cap block

- Does the weapon-gate sequence hand off without a visible/audio snap?
- Does the player weapon motif continue at the correct tempo after the corridor?
- Does the arena fade in with the player centered?
- Does the post-gate state feel like low intensity rather than the old intro/build pattern?
- Does the first Tap Orb clearly communicate that the player is building the beat?
- Does Tap Orb activation feel quantized and satisfying?
- Does the foundation loop add exactly one beat hit per activated orb?
- Do enemies remain readable while the arena is musically inactive?

### To Do - Authoring Events x Director Intensity

Validate the complete handoff from motif-creation gameplay into director intensity control:

- passed: `Run Authoring + Intensity Handoff (1x210s)` completed the production onboarding with empty starting lanes, all five initial commits, literal protection, continued lead playback, persisted motif data, the full Low -> Medium -> Build -> Peak -> Release -> Settle sequence, and interaction-backed density requests; the audit now derives persistence from authoritative commit events when a runtime theme snapshot is unavailable

- gates, bouncers, missiles, Tap Orbs, and lead interactions must commit through the same registered theme/lane contract
- a newly authored motif must remain literal and recognizable for its protected introduction window
- increasing intensity may add density, layers, register, harmonies, and riffs without replacing the motif's identity
- decreasing intensity may fragment or rest the motif without losing its authored data
- director requests for more density should spawn an appropriate authoring interaction when player input is required, rather than silently inventing a replacement motif
- tests must cover authoring before, during, and immediately across intensity transitions
- production behavior must remain interaction-driven; deterministic motif seeding is permitted only in Music Lab diagnostics

## Tap Orb V1 Implementation Plan

Create a modular Tap Orb system rather than expanding `beat-swarm-mode.js` directly.

Suggested module:

- `src/beat-swarm/beat-swarm-tap-orbs.js`

Suggested responsibilities:

### Beat Carrier

- enemy flag/config that identifies an orb drop
- stores foundation beat data:
  - `instrumentId`
  - `beatTrackId`
  - `soundId`
  - `loopLayer`
  - `orbColor`
  - `explosionRadius`
  - `damageAmount`
  - `targetArenaSlot`
  - `activationOrder`
  - `tapPromptText`
- on death, creates one Tap Orb

### Tap Orb

States:

- `traveling`
- `settling`
- `ready`
- `queued`
- `triggered`
- `consumed`

Responsibilities:

- travel from carrier death position to arena rim
- choose a stable resting point just outside the arena
- pulse and show `TAP` when ready
- detect click/tap
- give immediate subtle tap feedback
- queue quantized activation
- trigger visual payoff and notify the director on the beat

### Beat Orb Manager

- track active Tap Orbs
- assign rim slots
- queue activations if several orbs are tapped close together
- run quantized activation timing
- report activated beat hits to the director/conductor

Director event shape:

```js
onBeatOrbActivated({
  instrumentId,
  beatTrackId,
  soundId,
  loopLayer,
  stepIndex,
});
```

V1 acceptance criteria:

- after the weapon gate, Beat Swarm enters foundation-build state
- one Beat Carrier spawns
- killing it creates one Tap Orb
- orb travels to the arena rim and becomes tappable
- tapping the orb gives immediate feedback
- beat sound, explosion, arena flash, and damage occur on the next quantized beat/step
- director receives one foundation beat hit
- active foundation loop now includes that one hit
- enemies can begin firing/music after the first foundation beat activates

## Completed / Parked Prototype - Weapon Gate Onboarding

The weapon gate sequence has moved from standalone lab into the main Beat Swarm level start.

Current status:

- 16 gates author the player weapon motif
- Damage Up represents silent/disabled slots plus damage tradeoff
- note selections use the main player weapon sound path
- selected notes create a subtle starfield constellation
- dash/current/pickup interactions make the corridor active even for low-input players
- the completed motif is applied to the normal weapon setup toys

Keep polishing only if transition issues are reported.

Parked standalone lab files:

- `src/beat-swarm/weapon-gate-lab.js`
- `src/beat-swarm/weapon-gate-lab-gates.js`
- `src/beat-swarm/weapon-gate-lab-ratio.js`
- `src/beat-swarm/weapon-gate-lab-render.js`

## Active Direction - Enemy Gameplay Architecture

Enemy behavior is organized across independent descriptors rather than one bespoke class per combination:

- tier: `basic`, `elite`, or `boss`
- scale: `small` or `large`
- musical ownership: core-lane performer, additive-motif performer, or full-structure performer
- lane role: foundation, accent, lead, support, sparkle, or another director lane
- ability family: projectile, laser, local explosion, charge, beam, summoning, support, and later additions
- movement family: anchored, orbital, lateral, pursuit, formation path, or other phrase-length patterns
- formation membership: individual, lane group, elite formation, or boss structure
- lifecycle: spawning, approaching, performing, dying, or explicit board-clear retreat

Core behavior rules:

- The director owns the music; enemies perform it. Enemy death must not break a core lane.
- Basic small enemies are low-health lane-group members. They take turns performing consecutive events from their lane.
- Basic large enemies are higher-health singleton performers. They perform every event in their assigned lane.
- Small and large enemies may coexist in one lane: the large enemy performs the full lane while the small group continues its simple round-robin allocation.
- Elite enemies may be small or large and always carry an optional additive motif. The director only spawns one when the arrangement and density budgets justify it.
- Existing snakes, spawners, and musical combat formations become elite enemies.
- Elite motifs end with their performers. If elites overstay, remove them through visible gameplay resolution rather than ordinary retreat or disappearance.
- Bosses carry the complete musical structure, may spawn other enemies, and will be designed later without replacing player-authored identity.
- Movement patterns last long enough to be understood. Direction changes and major formation transitions occur on beat.
- Different groups may use different movement patterns simultaneously, subject to a compatibility policy that avoids visually conflicting combinations.
- Constant movement is allowed. Movement need not produce sound, but attacks and significant gameplay actions retain musical feedback.
- Ability silhouettes must remain readable. Each level limits its active ability-family palette; higher difficulties may expand it.
- Basic enemies use simple silhouettes and lane coloration. Elites use greater scale/complexity and may use multiple colors. Boss presentation is unrestricted.
- Visible enemies never silently disappear. Retreat is reserved for explicit arena-clearing transitions such as boss arrival.

Implementation order:

1. Complete: formalize and normalize enemy gameplay descriptors across existing spawn paths.
2. Complete: make basic small lane groups perform core-lane events in round-robin order.
3. Complete: make basic large singleton enemies perform every event in their lane, including coexistence with a rotating small group.
4. Complete: hold director-selected movement patterns for four-bar phrases and suppress incompatible simultaneous group motions.
5. Complete: classify snakes, spawners, and musical combat formations as additive-motif elites in the shared enemy descriptor.
6. Complete: the shared elite budget evaluator gates optional additive formations, snakes, and spawners by musical justification, threat, visual complexity, and additive density while leaving required intro and continuity fallbacks intact.
7. Complete: `Enemy Lane + Movement Lab` covers concurrent small/large lane performers, four-bar movement phrases, a visible budget-approved elite formation, and a deliberately density-blocked elite request with saved assertions.
8. Complete: basic enemy abilities are constrained by the Level 1 palette, expose stable silhouette identities, and execute projectile, tracking-laser, and local-explosion effects through the production lane-event allocation without changing round-robin or full-lane ownership. Intro carriers remain projectile-only for onboarding clarity.
9. Complete: snake and spawner types are explicit exported elite classifications, retain additive-motif ownership, and share the same director elite-density budget as formation elites.
10. Complete for the first production pass: stage mechanic difficulty through a threat budget rather than immediately filling groups with dangerous abilities:
   - a newly introduced featured mechanic starts with one carrier in a forgiving group
   - remaining members use readable short-range blasts or non-damaging radial wind push
   - later level phases may assign more featured carriers and combine established mechanics
   - subsequent levels reach mixed-mechanic groups sooner
   - simpler enemies should populate the field before a new complex mechanic arrives, giving the player space to focus on it
   - ability identity stays stable for an enemy's lifetime; escalation occurs through subsequent spawns
   - complete in `Enemy Lane + Movement Lab`: the shared Level 1 schedule now progresses through simple prefill, laser teaching, laser consolidation, local-AOE introduction, projectile introduction, and two-laser combined pressure
   - complete in the lab: carriers arrive only when their abilities become active; telemetry asserts every phase and visible roster is reached, featured-threat caps are respected, and the elite layer is deferred until combined pressure
   - complete in production: the enemy director derives the desired lesson from onboarding state, level phase, intensity, pressure, and difficulty, then advances by no more than one phase every four bars
   - complete in production: learned palettes prevent future mechanics leaking into filler slots, visible-field family caps limit newly spawned featured threats, existing enemy abilities remain stable, and optional elites wait for combined pressure
   - production validation complete: `Production Onboarding Flow` reached every lesson in order, respected the four-bar introduction window, leaked no future abilities, and kept the featured-mechanic cap
   - validation exposed a body-count mismatch: required lane groups routinely exceeded the old `targetAliveMax`, so body targets now include a structural floor rather than pretending one lane equals one enemy
11. First adaptive-cost pass complete; continue tuning it from production traces:
   - retain separate readable constraints for live enemy count, featured mechanics, elite musical density, and visual complexity
   - calculate comparable threat cost from scale, health, damage, fire cadence, projectile/beam coverage, ability danger, mobility, formation support, and enemy tier
   - budget both the total live battlefield cost and the rate at which new cost may enter
   - account for the player's effective weapon power and upgrades so challenge does not collapse as damage output rises
   - apply explicit difficulty profiles to starting budget, refill/ramp speed, ability palette, reaction windows, health, and damage
   - avoid merely scaling health: preserve readable introductions and use composition, combinations, and tempo before resorting to stat inflation
   - expose telemetry explaining each enemy's estimated cost and every spawn approval/rejection
   - implemented: pure threat estimation separates required core-lane cost from optional/elite cost and accounts for tier, scale, durability, ability danger, movement, and formation support
   - implemented: live and four-bar entry budgets scale with energy, pressure, difficulty ramp, measured weapon DPS, and a temporary simulated player-power curve
   - implemented: required lane bodies are never rejected by the optional budget; formations, snakes, and spawners share cost admission in addition to their readability and musical-density constraints
   - implemented: core lane bodies above each lane's required performer quota are discretionary; the shared spawn funnel meters them against both adaptive threat cost and a separate live-body readability ceiling
   - implemented: discretionary core duplicates use a tighter body ceiling, reserving the outer live-body headroom for musically justified elite formations
   - implemented: harmless ambient targets retain their low threat cost and separate population controls but no longer consume hostile formation body slots
   - implemented: optional admissions reserve space for temporarily missing mandatory lane performers, preventing later continuity refills from creating avoidable body-budget overshoot
   - implemented: lead-ball onboarding now uses the shared offscreen inert-target reserve instead of spawning an unbudgeted fallback combat wave
   - implemented: routine population pressure now holds optional admissions and preserves visible enemies instead of making them retreat
   - telemetry: `music_enemy_director_state` reports cost, structural body floor, power simulation, and budget limits; `director_threat_admission` explains optional approvals/rejections
   - production validation passed: lead-ball targets remain ambient, no hard live-body overages occurred, and five budget-approved formations entered across the complete onboarding run
12. Active semantic migration: formalize player composition versus enemy arrangement ownership:
   - implemented: shared contracts classify player core, temporary arrangement, and immutable gameplay feedback
   - implemented: the weapon event path exposes immutable ownership metadata
   - implemented: new/default `bassDrive` data is labelled Foundation Rhythm and uses kick percussion while retaining compatibility IDs
   - implemented: current formations expose intended arrangement roles and source lanes; their existing independent motif generation is explicitly marked pending derivation
   - implemented: rhythmic gunner and laser formations now derive their attack cadence from the first playable player-composition source in their arrangement contract; gunner formations prioritize Foundation Rhythm, while laser percussion formations prioritize Accent Rhythm
   - implemented: derived formation attacks retain the source motif's global loop phase, distribute authored hit positions across group members, preserve their independent arrangement instruments, and expose derivation source/mode/hit telemetry
   - implemented: formations retain the legacy independent cadence only when none of their declared player sources contains playable material
   - implemented: rhythmic formations can now preserve authored eighth-note positions instead of projecting every source hit onto a whole-beat attack; subdivision scheduling is opt-in so legacy beat-based enemies retain their established cadence
   - implemented: formation assignment carries exact global start-step phase into individual enemies, attack dispatch, audio scheduling, and laser warnings/activation
   - implemented: focused unit coverage confirms authored offbeats, global source phase, legacy beat behavior, and offbeat laser activation
   - implemented: lead formations now derive a one-beat delayed response from the current Lead Theme, preserve its contour, shift it by one pentatonic scale step for separation, and support a distinct assigned note at every formation motif step
   - implemented: a focused 60-second Lead Response Formation lab seeds the established player score and exercises the production one-beat-delayed, pentatonic-shifted lead derivation without threat-budget variance
   - validated: the focused derived lead response audibly follows the seeded player lead and the trace confirms its delayed pentatonic response
   - implemented: a focused 60-second Accent Offbeat Formation lab seeds the established player score and exercises production subdivision-preserving laser formation scheduling with exact-step telemetry
   - validated: the Accent offbeat formation preserved source phases `2, 6, 9, 13, 15` across both halves of its 32-step motif, distributed all ten hits across four members, began laser warnings one beat early, and activated every beam/audio event on the exact authored phase with no extra positions
   - validated: current-step formation audio scheduling reduced the stale-anchor error from roughly 1.7 seconds to normal callback latency (about 39 ms average in the focused run)
   - next: treat the player-composition/enemy-arrangement ownership migration as established architecture and return to production-flow musical validation when the next arrangement feature requires it
   - validated: the focused Full Score + Arrangements lab exercised all three established arrangement roles together over recognizable player-owned motifs; the mix remained readable, all 252 formation attacks were motif-scheduled, and the player Lead emitted continuously throughout the run
   - current validation: the shorter Arrangement Intensity Ramp now exercises production formation selection and density across every intensity without paying the time cost of replaying onboarding
13. Later: add level- and difficulty-based enemy health and damage scaling as one input to the adaptive cost budget after threat composition and readability are proven.
14. Design boss ownership of the full musical structure later.

## Hold For Later

Do not actively expand these areas while tuning motif transformation:

- cross-lane intensity-transition consistency pass:
  - retain the lead lane's recognizable literal-to-embellished identity progression
  - give foundation/bass and accent lanes phrase-boundary ramps instead of abrupt density or gating changes
  - phase additive enemy formations through member count, cadence, and motif density over successive loops instead of introducing full pressure in one step
  - preserve each lane's anchor events while adding or removing no more than a small amount of material per loop
  - expose transition telemetry so perceived intensity changes can be compared across all lanes
- arena circle art pass:
  - replace the temporary thick inner ring and always-visible dotted outer resistance boundary with a cohesive arena treatment
  - preserve clear communication that the particle-filled outer band pushes the player inward
  - keep the inner playable boundary, resistance band, and outer limit readable during camera movement and dense combat
- cross-project responsive viewport and browser-scaling pass:
  - treat this as a Rhythmake-wide architecture investigation rather than a local Beat Swarm CSS fix; changes may affect the main board, toys, sub-boards, overlays, input mapping, camera projection, audio-linked visuals, and every embedded game
  - first document the coordinate systems and resize ownership used by board transforms, world/camera projection, DOM overlays, canvases, pointer/touch input, and viewport-relative gameplay queries
  - fix the known live-resize mismatch where the player ship and starfield remain centered while the arena ring, enemies, and projected overlays lag or shift differently
  - ensure smaller desktop/laptop displays retain the complete usable interface without clipping, overlap, unintended scrollbars, or reduced access to gameplay targets
  - decouple gameplay reliability from physical viewport size: target reserves, spawn eligibility, camera framing, and event completion must remain valid at every supported aspect ratio
  - define supported minimum viewport dimensions and verify common 16:9, 16:10, ultrawide, narrow-window, and browser-zoom configurations before changing shared transforms
  - preserve stable world positions and input correspondence while resizing; no entity jumps, camera snaps, projectile offsets, or changes to quantized musical timing
  - follow with a separate mobile feasibility phase covering touch-safe controls, portrait/landscape policy, performance budgets, safe areas, and denser UI redesign rather than merely shrinking the desktop interface
  - add automated resize/projection assertions and visual browser checks once the coordinate-system contract is explicit
  - currently backlog priority: important for accessibility and future reach, but high blast radius, so undertake as a planned subsystem pass rather than opportunistic fixes
- new event sections
- musical enemy-group infrastructure unification:
  - composer groups are director-owned carriers for the main musical lanes and their continuity
  - musical formations are optional combat-driven layers added over the established score
  - they currently use separate group, spawning, scheduling, membership, and lifecycle systems despite sharing similar enemy-group mechanics
  - low-priority future consideration: extract shared population, formation, membership, lifecycle, and telemetry infrastructure without merging their distinct musical responsibilities
- HP readability tuning
- broad conductor scenes
- sample metadata migration
- Beat Swarm optimization pass:
  - profile update, render, enemy-group, and music-scheduling hotspots after current behavior work stabilizes
  - prune stale runtime/group records and avoid unnecessary per-frame scans and DOM writes
  - preserve current visuals and musical timing; framerate is currently acceptable
  - low priority unless a performance regression appears
- deeper Power Theme behavior
- boss/special set-piece variation
