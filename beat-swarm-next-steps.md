# Beat Swarm - Next Steps

## Current Status - 2026-05-25

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
- peak, release, and settle are being tuned around player motif recognition

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

## Current Focus - Peak To Release To Settle

Current listening target:

- peak should play the player motif strongly and confidently
- release should not hard-cut the lead
- release should not continue the full peak statement
- release should transform the lead into sparse memory:
  - downbeat/midpoint fragments
  - repeated motif anchors
  - recognizable rhythm DNA
  - lower density
  - quieter volume
- settle should feel different from release:
  - release = decay and loss of certainty
  - settle = stable, quiet identity

Recent implementation direction:

- `player-lead-release-echo` exists as a dedicated director music action
- release lead echo should bypass projectile/composer-group attack behavior
- release echo should use player motif notes as source material
- release echo should start at the release downbeat rather than waiting a bar
- settle should keep occasional motif identity without sounding like peak restarted

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

Use Music Lab and listening tests to answer:

- Does each intensity state sound distinct?
- Is the player Lead Theme recognizable at peak?
- Does release preserve motif identity without sustaining peak energy?
- Is settle clearly different from release?
- Does Bass Drive stay in register and enter at the intended time?
- Does Accent Rhythm play the correct player-authored sequence and instrument?
- Do runtime motif transformations still feel connected to the pause-menu theme boards?
- Are there hard cuts when moving between peak, release, and settle?

Current priority tests:

1. Listen: Peak only
2. Listen: Release only, no intro
3. Listen: Peak -> Release -> Settle
4. Full intensity flow once individual states are acceptable

## Hold For Later

Do not actively expand these areas while tuning motif transformation:

- new enemy families
- new event sections
- formation spawning
- HP readability tuning
- broad conductor scenes
- sample metadata migration
- framerate work, unless a new performance issue is reported
- deeper Power Theme behavior
- boss/special set-piece variation

