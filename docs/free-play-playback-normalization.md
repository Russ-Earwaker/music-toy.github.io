# Generated DrawGrid playback normalization

Generated DrawGrids use the full natural duration of ordinary DrawGrids. A short
drawing leaves inactive trailing columns rather than shortening its last toy.
For example, a 2.5-bar drawing occupies three one-bar DrawGrids: notes through
tick 912, silence through tick 1151, then restart at tick 1152.

`lineDrawGridStates` writes `authoredDurationTicks: 0` for every generated grid.
The original gesture duration, stroke geometry, source pitches and event offsets
remain unchanged. Free Play highlight progress follows the sum of the grids'
natural durations and holds at the drawing endpoint during trailing silence.

`prepareFreePlayDrawGridState` normalizes saved Free Play partial endings to zero.
`restoreDrawgridDuration` also clears those legacy endings when raw shared state
is applied to an editor or linked view. `linked-toy-views` uses this same restore
helper. Existing notes, inactive columns, cuts, paint and strokes are preserved.

The previous partial-chain source-phase adjustment has been removed. Generated
grids use the ordinary Heartbeat phase, Sequence turns and column scheduler;
there is no Free Play event provider or shorter phrase playback period.

Automated coverage in `free-play-full-loop.test.mjs` checks normal, generated and
migrated grids over twelve repeats, including short standalone drawings,
multi-grid contours, a 2.5-bar drawing and the four-bar maximum. It checks note
identity, pitch, event ticks, visible columns, trailing rests, highlight hold and
loop boundaries through the actual chain adapter and scheduler. Related tests
cover legacy migration, linked views, source phase, transport, silence tools and
persistence. This pass has not been checked with live browser audio.
