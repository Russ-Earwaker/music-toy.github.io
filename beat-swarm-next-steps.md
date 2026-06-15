# Beat Swarm - Next Steps

## Current Status - 2026-06-01

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

## Theme Slots

Current player music theme slots:

| Slot | Toy Type | Motif Length | Lane Role | Runtime Purpose |
| --- | --- | --- | --- | --- |
| Lead Theme | Drawgrid | 4 toys | Lead / Main Hook | main identity, call/response, peak hook, release memory |
| Bass Drive | Simple Rhythm | 2 toys | Foundation / Bass Rhythm | pumping foundation groove and rhythmic engine |
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
| Low | foundation identity only, very sparse motif references | establish pulse without clutter |
| Medium | bass foundation plus recognizable lead/accent identity | introduce player material clearly |
| Build | partial motifs, pickups, more cadence pressure | imply the player theme is assembling |
| Peak | full motif ownership plus riffing/doubling | make the player's theme take over the battlefield |
| Release | motif memory, fragments, echoes, reduced certainty | preserve identity while releasing tension |
| Settle | stable domesticated identity | make the world feel like it absorbed the player's theme |

## Current Focus - Tap Orb Foundation Beat

The next major prototype is the first arena-side music-building interaction:

> The weapon gate creates the player's weapon motif. Tap Orbs then let the player wake up and build the foundation beat inside the arena.

V1 should implement one foundation Tap Orb only.

Flow:

1. After the weapon-gate handoff, enter a foundation-build state.
2. Player weapon remains active.
3. Enemies may move and be killed, but enemy firing and enemy music are inactive until the first beat is introduced.
4. Spawn a small enemy wave with one marked Beat Carrier.
5. When the Beat Carrier dies, spawn one Tap Orb at the death position.
6. The Tap Orb travels to an unreachable resting slot just outside the arena rim.
7. Once settled, the orb pulses and displays `TAP`.
8. Player tap gives immediate subtle feedback.
9. The gameplay payoff is quantized:
   - on the next beat/step, the beat sound plays
   - the orb explodes
   - nearby enemies are damaged or destroyed
   - the arena and enemies flash in sync
   - the director receives one new foundation beat hit
10. After the first foundation beat is active, enemy firing/music can wake up.

Important rule:

> A Tap Orb adds one beat hit to a director-owned foundation loop. It does not unlock or generate a full drum pattern by itself.

Later Tap Orbs can keep adding hits or layers until the instrumental lane is built.

If the player does not activate a beat for a long time, we should eventually enter an unskippable tutorial pause state with clearer direction. That tutorial fallback is not required for V1, but the foundation-build state should make room for it.

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
- Scale correction, harmonization, riffing, and motif transformation belong to runtime interpretation.
- Occasionally expose raw authored material so player agency is audible.

## Current Testing Focus

Use playtests and Music Lab where useful to answer:

- Does the weapon-gate sequence hand off without a visible/audio snap?
- Does the player weapon motif continue at the correct tempo after the corridor?
- Does the arena fade in with the player centered?
- Does the post-gate state feel like low intensity rather than the old intro/build pattern?
- Does the first Tap Orb clearly communicate that the player is building the beat?
- Does Tap Orb activation feel quantized and satisfying?
- Does the foundation loop add exactly one beat hit per activated orb?
- Do enemies remain readable while the arena is musically inactive?

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

## Hold For Later

Do not actively expand these areas while tuning motif transformation:

- window-resize visual alignment bug:
  - player ship and starfield stay correctly centered
  - arena ring, enemies, and other projected overlay elements can lag or shift differently while resizing Chrome
  - likely caused by mixed board-transform and DOM-overlay projection refresh paths
  - low priority unless resize behavior becomes important for playtesting or presentation
- new enemy families
- new event sections
- formation spawning
- HP readability tuning
- broad conductor scenes
- sample metadata migration
- framerate work, unless a new performance issue is reported
- deeper Power Theme behavior
- boss/special set-piece variation
