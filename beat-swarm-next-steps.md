# Beat Swarm - Next Steps

## Current Status - 2026-05-12

The Beat Swarm music runtime is stable enough to move from director-authored music toward player-authored musical DNA.

Recent tests have confirmed:

- the protected intro set piece is working:
  1. player shooting only
  2. one pulse layer
  3. second beat/backbeat layer
  4. melody enters and continues
- music is not interrupted by normal enemy death or health changes
- player/enemy weapons, explosions, and chain attacks remain reliable gameplay sounds
- `audioRequiredSilentCount` is consistently `0`
- bass/foundation notes stay in the intended low register
- medium/build/peak/release intensity stages pass Music Lab checks
- medium now has a clear pumping foundation pulse
- build and peak ramp pressure without losing pattern focus
- release reads as an actual release
- lead motif anchors are recognizable enough for now
- foundation timbre and pulse accenting sound good in listening tests

The current baseline direction is:

> relentless propulsion + recognizable hooks.

The current style target remains:

- neo-retro shmup
- arcade synthwave
- driving electro
- bullet-hell synth
- techno arcade

## Completed Baseline Work

### Motif Anchors

Implemented and accepted as good enough for now:

- Level 1 music personality profile
- lead motif anchor runtime
- longer motif lifetime
- repeated call/lift/answer/resolve hook shape
- build and peak transformations that preserve hook identity
- Music Lab metrics for motif return and variation

Current status:

- peak lead return rate is stable
- peak variation is suppressed
- the lead is good enough to move on, but can be refined later

### Bass As Engine

Implemented and accepted:

- stable low-register foundation lane
- medium `10101010` pump
- build push pattern
- peak pump/cadence pattern
- stripped release anchor
- foundation keepalive/register guards
- Music Lab bass delivery and register metrics

Current status:

- medium/build/peak/release delivery is stable
- bass register violations are `0`
- listening tests say the groove now moves properly

### Peak Means Focus

Implemented and accepted:

- peak support/sparkle/answer density reduced
- peak hook reuse strengthened
- peak bass drive remains patterned
- simultaneous voice count remains controlled enough

Current status:

- Music Lab passes
- peak is focused enough for the next phase

### Foundation Sound Character

Implemented and accepted:

- foundation instrument identity locked to a consistent bass/drum timbre
- foundation pulse accent contour added:
  - downbeat strongest
  - backbeat slightly lower
  - pump steps lower again
  - push/ghost steps tucked back

Current status:

- listening tests say it sounds good
- no further cleanup is currently required

## Active Direction - Player Music Theme UI

We are now moving into player-generated music themes.

Core principle:

> Player provides identity. Director provides context, orchestration, intensity, and transformation.

The player should not author the full score. They should provide short motifs and rhythms that the existing director/composer can later interpret, mutate, simplify, intensify, and orchestrate.

Authoring rule:

- Beat Swarm theme boards must obey the same toy rules as the main Rhythmake interface.
- Random/default generation should use the normal toy methodology: musically guided by default, but still editable by the player.
- Beat Swarm should preserve the authored toy data, including intentional out-of-scale edits.
- Musical cleanup, scale correction, riffing, harmonization, intensity shaping, and orchestration belong to the director/runtime interpretation layer, not to hidden changes in the visible toys.
- The score should occasionally expose raw authored material so players can recognize their direct impact.

This should start as UI/data support, not full runtime integration.

## Theme Slots

Use four player music theme slots:

| Slot | Toy Type | Motif Length | Lane Role | Purpose |
| --- | --- | --- | --- | --- |
| Lead Theme | Drawgrid | 4 toys | Lead / Main Hook | Main melody, player identity, call/response source |
| Bass Drive | Simple Rhythm | 2 toys | Foundation / Bass Rhythm | Pumping bass rhythm / engine groove |
| Accent Rhythm | Simple Rhythm | 2 toys | Accent / Percussion / Stabs | Attack accents and phrase punctuation |
| Power Theme | Drawgrid | 2 toys | Powered-Up Lead | Featured super-mode / player dominance motif |

Motif length rule:

- Lead Theme is the only extended phrase by default so players can author a recognizable call / continuation / answer / turnaround.
- Weapon Rhythm, Bass Drive, Accent Rhythm, and Power Theme stay at 2 toys so functional layers remain readable and do not compete with the main hook.
- Longer runtime variation should come from the director transforming these motifs, not from asking every slot to contain a long authored phrase.

Initial implementation may focus deepest behavior on the first two slots:

1. Lead Theme
2. Bass Drive

But the UI and data model should anticipate all four slots so we do not redesign it later.

## Active Implementation Target 1 - Theme Data Model

Add a player music theme config object with generated defaults.

Suggested shape:

```js
playerMusicThemes = {
  leadTheme: {
    id: 'leadTheme',
    label: 'Lead Theme',
    toyType: 'drawgrid',
    laneRole: 'lead',
    autogenerated: true,
    data: null,
  },
  bassDrive: {
    id: 'bassDrive',
    label: 'Bass Drive',
    toyType: 'simpleRhythm',
    laneRole: 'foundation',
    autogenerated: true,
    data: null,
  },
  accentRhythm: {
    id: 'accentRhythm',
    label: 'Accent Rhythm',
    toyType: 'simpleRhythm',
    laneRole: 'accent',
    autogenerated: true,
    data: null,
  },
  powerTheme: {
    id: 'powerTheme',
    label: 'Power Theme',
    toyType: 'drawgrid',
    laneRole: 'powerLead',
    autogenerated: true,
    data: null,
  },
};
```

Implementation requirements:

- auto-generate all slots by default
- no empty theme slots on first open
- keep theme data separate from weapon data
- reuse existing Drawgrid/weapon serialization where sensible
- expose clean accessors for future runtime integration:

```js
getPlayerMusicTheme('leadTheme')
getPlayerMusicTheme('bassDrive')
getPlayerMusicTheme('accentRhythm')
getPlayerMusicTheme('powerTheme')
```

Do not bury this data inside UI-only state.

## Active Implementation Target 2 - Pause UI Theme Row

Add a Music Themes row at the bottom of the pause UI near the existing weapon setup UI.

Suggested layout:

```txt
Music Themes
[Lead Theme] [Bass Drive] [Accent Rhythm] [Power Theme]
```

Behavior:

- hover previews the slot
- click opens the appropriate editor
- closing pause/editor stops any preview
- only one preview can play at once
- fast hover movement should not stack previews

The row should be visually separated enough that players understand these are soundtrack theme slots, not weapon slots.

## Active Implementation Target 3 - Preview

Theme previews should be short, reliable, and independent from gameplay music state.

Preview rules:

- hover starts preview
- mouse leave stops or fades preview
- hovering a different button stops the previous preview first
- clicking a button stops preview before opening the editor
- pause menu close stops all previews

Preview loops:

- Drawgrid themes: play 1-2 bars of motif
- Simple Rhythm themes: play 1-2 bars using safe default instrument/pitch mapping

Preview should not permanently alter gameplay music state.

## Active Implementation Target 4 - Editors

Clicking a slot should open the relevant editor with generated data already loaded.

Drawgrid slots:

- Lead Theme
- Power Theme

Simple Rhythm slots:

- Bass Drive
- Accent Rhythm

Rules:

- saving updates the theme slot data
- cancelling preserves previous data
- edited data survives pause menu open/close
- edited data should persist through existing save/load if the app already supports that path

## Future Runtime Integration

Do not do this in the first UI slice unless the UI/data work is already stable.

Future use:

| Theme Slot | Runtime Use |
| --- | --- |
| Lead Theme | main motif seed, lead phrase material |
| Bass Drive | bass rhythm mask / foundation groove |
| Accent Rhythm | accent/stab rhythm mask |
| Power Theme | powered-up lead takeover motif |

Intensity transformations:

| Intensity | Behavior |
| --- | --- |
| Low | fewer notes, sparse motif usage |
| Medium | theme plays recognizably |
| Build | add pickups, shorten rests, support answers |
| Peak | repeat fragments, octave double, increase subdivision |
| Release | strip back to sparse motif echo |

Important guardrails:

- bass pitch/register should remain system-controlled at first
- Bass Drive should be rhythm-only initially
- player themes should work across future style profiles
- style interpretation belongs to the director/profile, not the stored theme slot

## What Not To Expose Yet

Do not expose these as player-authored controls in the first implementation:

- harmony
- full arrangement state
- transitions
- silence windows
- intensity curve
- enemy family scheduling
- all ornaments/fills
- every individual conductor lane

Reason:

> The player should provide musical DNA, not manage the whole score.

## Current Testing Focus

For the new theme UI phase, acceptance starts with UI/data behavior:

- pause UI shows a Music Themes row
- four buttons exist
- all themes are auto-generated by default
- hover preview works for every slot
- only one preview plays at a time
- click opens the correct editor type
- edited theme data is saved back to the slot
- closing pause/editor does not leave preview audio stuck playing
- theme data is accessible outside the UI for future runtime integration

Continue running Music Lab intensity tests when touching runtime music behavior.

## Hold For Later

Do not actively expand these areas while building the theme UI:

- new enemy families
- new event sections
- formation spawning
- HP readability tuning
- broad conductor scenes
- sample metadata migration
- framerate work, unless a new performance issue is reported
- deeper lead motif musicality polish

## Working Rule

Use this tuning principle:

> The player creates short musical DNA. Beat Swarm turns it into a living arcade score.
