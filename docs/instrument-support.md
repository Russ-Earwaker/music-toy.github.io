# Musical instrument support

The current musical toy factory registers the six types below. All use the
catalog-backed audio system and the same `instrument-selection.js` control and
`instrument-picker.js` overlay. Selection belongs to the individual toy.

| Toy type | Previous instrument behavior | Existing fallback/default | This pass |
| --- | --- | --- | --- |
| Simple Rhythm (`loopgrid`) | Shared picker on chain heads; hidden on children; pattern stores instrument | Theme choice, then Bass Tone 4 | Picker on every musical panel; live pattern edits |
| DrawGrid (`drawgrid`) | Shared header picker plus a duplicate generator/tutorial picker path | Theme choice, then acoustic guitar | Both paths use the shared control; state and note pattern retain instrument |
| Drum Grid (`loopgrid-drum`) | Shared picker, hidden on children; dataset/pattern instrument | Theme choice, then Djimbe | Picker on every panel; pad and scheduled notes use chosen instrument |
| Chord Wheel (`chordwheel`) | Shared picker, hidden on children; chord definition instrument | Theme choice, then acoustic guitar | Picker on every panel; future chord events use current definition |
| Bouncer (`bouncer`) | Shared picker, hidden on children; runtime and snapshot instrument | Theme choice, UI pluck, runtime retro square fallback | Picker on every panel; future impact/replay notes use current sound |
| Rippler (`rippler`) | Shared picker, hidden on children; runtime and snapshot instrument | Theme choice, runtime kalimba fallback | Picker on every panel; snapshot restore also restores runtime sound |
| BeatSwarm | Game mode with multiple independent catalog instruments: music lanes, entities, weapons, effects, and embedded musical panels | Mode/music-palette-specific | No incompatible single instrument added to the mode; compatible embedded musical panels use the shared control |

Sequence, Together, Repeat, Timeline and Heartbeat are not sound-producing
musical panels and do not get this control. The legacy Wheel module is not
registered in the current musical toy factory. The first-run volume-test pads
are setup UI, not creation-graph toys.

## Ownership and compatibility

- Instrument edits dispatch the existing toy instrument events. They do not
  activate/retrigger playback, reset transport, or edit graph ancestry.
- Already committed audio may finish. Future unscheduled events read the edited
  definition/runtime instrument through the existing scheduler.
- Legacy chain-head instrument propagation is removed. Editing a parent does
  not overwrite children, including children inside Structures.
- Same-type quick-add clones the source/reference sound and pitch metadata before
  initialization. Further edits remain independent.
- Existing scene snapshots already store each toy's instrument and pitch
  metadata; their format is unchanged. Missing legacy fields retain the existing
  initialization/default behavior.
- Initialization preserves a supplied instrument while the catalog is loading.
  Scene restoration seeds instrument and pitch metadata before initialization;
  Chord Wheel also notifies its live definition, and Rippler restores both its
  runtime instrument and pitch metadata.
- The common picker retains its audition and Apply workflow. Apply commits the
  selection and dismisses; Close, Escape and backdrop clicks cancel. Owner
  deletion, New Creation and replacement by another picker also cancel, clean up
  listeners/observers and restore audition ducking.

The Chord Wheel's `C` keyboard tuning aid deliberately uses a neutral tone;
this diagnostic reference is independent of its musical chord instrument.
