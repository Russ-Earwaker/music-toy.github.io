# Simple Draw Container migration

Simple Draw now lives on the normal board. Its closed surface is the former tactile drawing UI; its music consists entirely of ordinary owned DrawGrids. The global header controls transport and BPM. There is no Simple Draw scheduler, activation clock, or export-on-exit operation.

## 1. Legacy ownership migration

`src/simple-draw.js::migrateLegacy` groups legacy generated DrawGrids by stroke ID, checks the normal single-entry/single-exit Container constraints, and adopts their existing IDs and canonical connections. Original gesture, uncoil, paint and random-cut presentation data move to the wrapper. Existing generic Containers holding exactly that legacy group upgrade in place. Generated metadata is marked `containerManaged` so expansion cannot accidentally trigger migration again.

Migration intentionally skips unsafe/shared/branched groups and records lacking an original path. Very old `freeplay-line` prototype toys and unattached legacy blank-page paint are not reconstructed. Their compatibility readers remain. This avoids guessing musical ownership or inventing missing gestures.

## 2. Container data shape

The normal version-1 Container record persists:

```js
{
  id, version: 1, kind: 'container',
  internalObjectIds, internalToyIds, internalConnectionIds,
  ports: { input: {objectId, portId}, output: {objectId, portId} },
  bounds: {x, y, width, height}, layout,
  presentation: {type: 'simple-draw', state: {open: false}},
  interactionData: {
    gesture: {path}, straightened,
    paint, surfacePaint, randomCutIds, randomSeed
  }
}
```

An empty wrapper has empty ID arrays, `ports: {}`, and `gesture: null`. It creates no empty musical toys. The wrapper stores no authored notes, source pitches, performed pitches, pattern, or duration cache. Historical gesture length still determines its drawing extent; playable duration comes from the owned canonical graph.

Each ordinary generated DrawGrid retains canonical `authoredNotes` (`id`, `col`, chromatic `sourceMidi`, mute reasons), normal generated smooth `strokes`, normal dimensions/pitch presentation and ordinary timing. Its compact legacy-named `freePlay` metadata contains only stroke/bar mapping and `containerManaged`; original gesture and paint are not copied into every grid.

## 3. Internal ownership and routing

`draw` creates 1–4 detached normal DrawGrids using the existing conversion and normal DrawGrid initialization/state APIs, connects them with canonical sequential edges, then attaches them to the existing wrapper. Pending panels stay hidden. Async cancellation removes detached grids rather than leaving orphans. Replacing a drawing preserves the wrapper and its outer wires.

The Container foundation aliases visible IN/OUT to the real internal entry/exit. Closing hides owned panels, sockets and internal edges. No wrapper performance is scheduled. Standalone creation follows normal Heartbeat rooting, with source phase zero. External Repeat, Chord Progression and Transpose therefore use the same compiler/runtime and authored-to-performed pitch pipeline as any normal DrawGrid chain.

Partial final **content** remains valid. Following the earlier playback-normalization requirement, every generated 8-step DrawGrid lasts its full normal 384 ticks, even if its last active note occurs earlier. Empty trailing steps remain silence; neither gesture extent nor last note shortens the loop. A maximum phrase occupies four normal bars (1536 ticks).

## 4. Custom-surface API and generic additions

`main.js` registers `simple-draw` with `createContainerPresentations`. Its `renderSurface` mounts `installSimpleDrawSurface` into the generic Container surface host. `disposeSurface` releases animation, pointer/tool state, observers and note listeners. The adapter reads owned normal toys and issues normal authored edits through the controller; it never supplies an alternative playback pattern.

Generic foundation additions needed for this first lazy-content surface:

- Empty Container creation, later graph attachment, content clearing and resize.
- Empty Containers transparently pass through normal graph compilation, with zero own duration.
- Pending outer wires survive attachment and Clear, including their IDs.
- Restore shells exist before canonical connection restoration, preserving wires to empty wrappers.
- Generic surface disposal and board Open/Expand callbacks support resource cleanup and camera framing.

No global Simple/Advanced mode was introduced. Creation currently excludes Art internal boards, matching the foundation's existing ownership restrictions.

## 5. Live silence and illumination

Instance-local scissors/paint tools call `setSilence`, which edits the owned DrawGrids' actual `__dgAuthoredNotes`, commits through normal authored/linked-state APIs, cancels stale queued events and resets affected normal scheduling cursors. Paint footprints and random visual history stay on the wrapper; `scissorMuted` and `paintCovered` stay on canonical notes. Tools read the same notes while the wrapper is closed. Healing cuts preserves paint and wiping paint preserves cuts.

Normal due-note illumination is mapped back to the owner's visual node. The surface progress reads the active canonical playback instance and shared transport tick. It follows parent Structure turns and includes normal trailing silence. Managed grids bypass the old Free Play-specific visual-event branch, avoiding duplicate flashes.

## 6. Open and Close

Generic Container Open reveals ordinary editable DrawGrids; Close restores the custom surface. Both preserve canonical IDs, routing, note/rest data and duration. The normal editors retain folded octave presentation, octave markers, pentatonic suggestions and unrestricted chromatic editing. The original gesture remains historical; internal pitch edits do not regenerate it. Uncoil retains original gesture heights and uses only horizontal musical redistribution with the existing smooth interpolation.

## 7. Expand onto Board

Generic Expand removes ownership/visibility aliases and the wrapper, leaving the exact same canonical grids, edge IDs, relative layout, source pitches and mute reasons on the board. It disposes the bespoke surface. It does not export or clone music. Empty wrappers disable Expand because they have no graph to reveal.

## 8. Clear and Delete

Clear removes only owned content, resets this surface's presentation history, and retains the board wrapper and its outer routing. It is ready for another gesture. Delete uses normal Container-owned deletion and removes both wrapper and owned graph. Cancellation tokens handle Clear/Delete/replacement while asynchronous grid initialization is pending.

## 9. Multiple containers and persistence

Each wrapper has its own gesture, paint store, tools, random history, animation and listeners. There is no global current line. All containers share normal Heartbeat phase and transport. Persistence stores Container records alongside the same ordinary toy/connection state; open state follows existing Container persistence. Restore prepares shells, restores canonical wires, restores ownership, then performs the narrow legacy upgrade.

## 10. Removed and retained Free Play code

Removed the full-screen mode installation, separate entry/navigation/shell, scene hiding, singleton current-line ownership, and main-board export/synchronization block from `main.js`/`free-play.js`. `free-play.css` now styles only the embedded surface.

Retained the pure draw gesture controller, line conversion/rendering, smooth uncoil, physical scissors/cut/sag/mend, paint and silence helpers. `free-play-tools.js` accepts an injected per-owner paint store; legacy defaults remain for compatibility. `free-play-drawgrid.js` remains the normal conversion/history bridge. Legacy metadata readers and the old observer fixture remain compatibility/test assets, not a second application shell.

## 11. Validation and evidence

`tests/simple-draw.test.mjs` has 14 tests. Five exact musical equivalence tests capture every scheduled voice/rest slot across closed → Open → Close → Expand under Heartbeat, Repeat, Chord Progression, Transpose and nested context. Tick and harmony origins are compared relative to the same cycle. Source/performed pitches, mute patterns, context, IDs, wires and durations remain identical. Additional tests cover lazy creation, trailing silence, chromatic edits, static history, live silence, multiple owners, empty pass-through, Clear/Delete, JSON restore, legacy migration and async cancellation/replacement without orphans.

The broader focused run passed **277 of 278** tests. The existing `structure-toys.test.mjs` “Together begins all children…” fixture fails `384 !== 576`; this exact failure was reproduced from an untouched HEAD archive. Its fixture supplies only playback-instance length for a DrawGrid whose authoritative dataset duration is one bar. No runtime or assertion was changed to conceal it. The separately known pre-existing quick-add assertion concerning `registerOctaves: 0` remains outside this change.

Browser checks on an isolated local origin verified:

- Normal Add Toy → lazy empty frame → silent draw/release → shared playback.
- Short six-note gesture with two trailing silent steps; smooth uncoil.
- Scissors and paint already reflected in hidden canonical notes; tap removal, random actions, bulk healing/wiping.
- Two independent wrappers; maximum line creates four ordinary grids/32 notes, all phase zero; Open reveals all four.
- Normal outer Repeat and Chord Progression created through connection controls; performed harmony reaches internal notes.
- Save/reload retains both ownership groups, routing, original gestures, uncoil, canonical source notes/strokes and IDs. Absent versus false optional mute fields normalize equivalently.
- Open/Close/Expand reveal the same ordinary short grid without browser errors.

`resources/debug-output/simple-draw/verify.mjs` checks saved browser admissions against canonical source pitches, normal harmonic resolution, column ticks, complete rest patterns and duplicate keys. Across closed/open/closed/expanded captures: **180 admissions, zero timing mismatches, zero pitch mismatches, zero duplicates, zero rest/context mismatches, zero browser errors**. Screenshots and JSON evidence are alongside `results.json`. These are scheduler-admission checks, not microphone waveform comparisons. Exact full-cycle representation equivalence, including silence-rich cases and Transpose, is covered by the deterministic tests above.

## 12. Future Simple Toy gaps

This proves the generic mount/dispose, ownership, boundary, normal scheduling, Open/Close/Expand and lazy-content lifecycle for a single-entry/single-exit chain. No new blocker appeared for another surface over such a graph. Bouncer/Ripple/Drum still need their own mappings from surface interactions to canonical internals, sound-specific visual event adapters and suitable board dimensions. Nested/shared/branched ownership and Art integration retain the foundation's existing restrictions. Those should be addressed as generic graph capabilities when a concrete next toy requires them.

If an advanced user changes internal step subdivision or restructures the owned graph, the original gesture remains historical; richer per-note interaction mapping for arbitrarily rebuilt internals is deferred. Current mapping intentionally follows the generated eight-step bar chain and normal chromatic note edits.
