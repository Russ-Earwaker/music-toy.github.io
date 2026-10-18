# Free Play: variable length, DrawGrid ownership, and reversible morphs

Updated 18 October 2026. Supersedes the fixed one-bar Line-source prototype. The current authored-pitch and board-stroke model is documented in [the DrawGrid repair report](free-play-drawgrid-repair.md); it supersedes the coordinate-keyed register details below.

## 1. Logical length limits

Input uses a fixed normalized logical unit square. Length is the sum of Euclidean distances between accepted logical points. Canvas aspect ratio, CSS size and DPR do not participate in musical measurement. Stored original geometry is never transformed in place.

Minimum accepted length: **0.03 units**. Maximum accepted length: **4 units**. At the cap, the crossing segment is interpolated to the exact remaining distance; later pointer samples are ignored while capture stays active until release. The visible line stops there and the central hint says **Let go**.

## 2. Length to music

Existing normal DrawGrid constants remain authoritative: **8 steps/bar**, **384 ticks/bar**, **48 ticks/step**. For accepted length L:

`durationTicks = round(min(L, 4) / 4 * 1536)`

Below 0.03 units there is no musical source. At the threshold this produces 12 ticks; at the cap it produces 1536 ticks / four bars. Musical resolution is one transport tick, not whole bars or whole steps. Each event occurs at `i * 48 < durationTicks`. Its geometry is sampled at cumulative distance `totalLength * eventTick / durationTicks`. Direction and screen X never choose time.

Safe C-major pentatonic interpretation across C3–A5 is retained. Adjacent equal pitches follow ordinary DrawGrid per-column attacks. Drawing remains silent; release generates the music and blooms its actual event nodes.

## 3. Partial bars

Generate `ceil(durationTicks / 384)` ordinary eight-column DrawGrids. Each full chunk lasts 384 ticks. The last chunk stores the exact remaining integer ticks and only activates columns whose offsets precede that endpoint. No ending notes or padded silent bars are invented.

The normal graph duration helper recognizes the persisted exact chunk duration. Generated DrawGrids use the scheduler's existing event-provider interface to retain 48-tick spacing through partial chunks and variable-length phrase loops; it delegates actual notes to the ordinary DrawGrid player. Normal unmarked DrawGrid behavior is unchanged.

## 4. Board conversion and provenance

Each release creates one to four real `drawgrid` panels on the normal board. Direct transport/sequence connections form a horizontal chain. No explicit Sequence wrapper is added. The Free Play surface hides board roots and never renders those panels.

Each chunk persists `freePlay.strokeId`, bar index, offset, exact chunk/phrase duration, and per-node MIDI register. New chunks receive normal stable `toy-definition:` IDs. The first chunk also stores the original path and its visual Straighten state. Technical provenance is not exposed in the interface.

Per-line Delete removes panels matching that stroke ID. Clear applies that same ownership boundary to all Free Play strokes. Neither removes unrelated board toys or stops Main. Clearing during asynchronous generation invalidates pending work and cleans up its incomplete panels.

## 5. Musical source of truth

**DrawGrid node state is canonical.** There is no new private Line toy or independently playing Free Play phrase. The Free Play view reads the generated DrawGrids' current active nodes, disabled nodes, and pitch registers to derive its stars and notes. Muting/removing a generated node is reflected in that projection.

The saved path owns gesture identity, not a second note list. The existing normal DrawGrid sampler/audio admission/visual queues own sound. Explicit register information preserves the gesture's cross-octave contour despite the DrawGrid editor's twelve pitch-class rows.

Legacy `freeplay-line` toys remain supported by their previous adapter; this pass does not automatically convert older saved Line toys into DrawGrids. New strokes use the model above.

## 6. Straighten and Re-coil

Every completed line has its own Straighten/Re-coil button and delete control. A 650ms smoothstep animation interpolates original positions toward a time/pitch projection:

`x = 0.06 + 0.88 * progress * phraseDuration / 1536`

`y = 0.88 - 0.76 * normalizedSafePitch`

Thus a partial phrase ends at its true fraction of the four-bar width. The straightened target uses shape-preserving cubic Hermite interpolation through the actual musical nodes, parameterized by event ticks. Harmonic-mean tangents round pitch transitions without overshoot or reversing time. The renderer samples that curve densely, includes every node location, and uses the same evaluator for the playback highlight and morph. The original polyline remains untouched. The same ordered stars move between forms. Re-coil uses the untouched original path, so repeated cycles accumulate no error. The visual state survives board switches and persistence.

## 7. Playback synchronization and shared shell

Normalized progress comes from the main transport tick modulo the exact phrase duration. Coiled rendering resolves that progress onto original arc length; straightened rendering resolves it left to right. Morph time affects interpolation only. It changes no pitches, event ticks, duration, BPM, graph edges, or transport mapping.

Stars flash only from admitted notes through the normal transport-driven visual queue. The actual existing Rhythmake header remains canonical: BPM, Play/Pause, Return to Start, Menu, Play options, master volume, and Feedback. No Free Play transport or tempo is created. Board switches are presentation changes.

## 8. Verification

**69 targeted tests passed**, including **20 Free Play tests**, plus source phase, transport ownership, linked toy instances, DrawGrid geometry/input/snap and Auto-Arrange checks. Syntax checks and `git diff --check` passed.

Coverage includes logical min/max and cap interpolation, viewport/DPR-independent interpretation, partial-bar counts and masks, canonical DrawGrid round trips and edits, no historical startup burst, eight consecutive partial-phrase loops at exact 48-tick intervals, pitch safety, event/geometry invariance during morph, and 100 morph cycles without drift.

Actual browser gestures and ordinary header controls were exercised on an isolated local test origin. Evidence: `resources/debug-output/free-play/variable-drawgrid-browser-proof.json`.

| Case | Browser result |
| --- | --- |
| Short line | 154 ticks, four events, one partial DrawGrid. |
| 1.5 bars | 576 ticks, twelve events, chunks 384 + 192. |
| Approximately 3.3 bars | 1268 ticks, 27 events, chunks 384 + 384 + 384 + 116. |
| Maximum | Exactly length 4, 1536 ticks, 32 events, four DrawGrids. Live observer captured Let go at the cap. |
| Compact spiral | Length 3.27055, 1256 ticks, four DrawGrids and a varying pentatonic contour. |
| Rising vertical | 315 ticks, seven notes spanning E3–E5; actual DrawGrid admissions preserve register. |
| Morph | Original source events unchanged; main transport mapping unchanged and playback continues. |
| Re-coil | Original stored path restored exactly; repeated morph cycles retain data. |
| Board | Real Draw panels, normal controls, direct horizontal sequence cables, no added wrapper. |
| Reload | Durations, original geometry, generated grids and per-line visual state restored. |
| Per-line Delete | Removes exactly the selected two-grid chain; all other source events and transport mapping unchanged. |
| Clear | Removes remaining Free Play grids (16 toys → 2 unrelated Rhythm toys), retains the running clock; no later Free Play admissions. |
| Audio audit | 96 checked admissions: zero pitch/tick mismatches and zero duplicate identities. No runtime errors recorded. |

Earlier proof files describe superseded iterations. Subjective listening and physical touch/mobile audio still need a human/device check. The inherited main-header overlap at narrow mobile widths remains outside this pass.

## Files

Core interpretation and presentation: `src/free-play-line.js`, `src/free-play-line-visual.js`, `src/free-play.js`, `free-play.css`.

Canonical conversion and integration: new `src/free-play-drawgrid.js`, Free Play bridge in `src/main.js`, `src/drawgrid/dg-pattern-length.js`, `dg-set-state.js`, `dg-state-io.js`, and `drawgrid-player.js`.

Verification: `tests/free-play-line.test.mjs`, `tests/free-play-browser-observer.js`, and the browser evidence above. Unrelated existing workspace changes were retained.

## Smooth timeline polish verification

26 focused tests passed across the existing Free Play suite and new `tests/free-play-curve.test.mjs`. The rising, sharp zig-zag, circle, long spiral and four-bar maximum cases verify exact node positions, continuous tangents, no pitch overshoot, unchanged events/DrawGrid states, matching highlight endpoints and drift-free repeated morphs. All five were visually inspected using the production canvas renderer in `resources/debug-output/free-play/curve-proof.html`. This pass changes presentation only.
