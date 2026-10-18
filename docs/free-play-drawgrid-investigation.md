# Free Play → DrawGrid investigation

18 October 2026. Investigation only: no production implementation changes. Browser reproduction used a local diagnostic origin, actual pointer gestures and the existing `toy:note` final-pitch event. Temporary read-only instrumentation captured editor snapshots, playback snapshots, pointer positions and note events. No fix was applied.

**Conclusion:** these are genuine DrawGrid panels with normal node masks, UI, persistence and graph connections, but their authored visual state and pitch editing contract are incomplete. They are not equivalent to a normally authored DrawGrid. The missing ink, octave collapse on edit, preview inconsistency and a shared playback snapshot lag are separate findings.

## 1. What generation writes

`src/free-play-line.js:createLineSource` creates a transient source:

```js
{
  version: 3, instrument: 'PIANO', musicalRole: 'melody',
  durationTicks,
  path: {
    points: [{x, y}],            // normalized unit square, original gesture
    distances: [0, ...], totalLength,
    metric: {width: 1, height: 1}
  },
  events: [{x, y, midi, note, offsetTick, pathDistance}]
}
```

Y is mapped to the nearest entry in `buildPalette(48)` using `[0,2,4,7,9]` over three octaves: **C-major pentatonic C3–A5, MIDI 48–81**. Tick offsets are multiples of 48, strictly before the exact phrase end. Path distance chooses progression; horizontal displacement does not choose time.

`src/free-play-drawgrid.js:lineDrawGridStates` partitions events into 384-tick chunks, then writes this state for each real DrawGrid:

```js
{
  steps: 8,
  instrument: 'PIANO',
  autotune: true,
  strokes: [],                  // explicit, not accidentally omitted
  nodes: {
    list: [[row], ...],         // eight column arrays, empty beyond phrase end
    active: [true, ...],
    disabled: [[], ...]
  },
  freePlay: {
    strokeId, bar,
    startTick: bar * 384,
    durationTicks,              // exact chunk duration; final chunk may be partial
    phraseDurationTicks,
    midi: {'col:row': fullMidi},
    // first chunk only:
    path: originalNormalizedPath,
    straightened: false
  }
}
```

The decisive conversion is **`row = 11 - (event.midi % 12)`**. Full MIDI is kept separately under the exact column/row key. The original event's `note`, `x`, `y`, and `pathDistance` are not stored as editable DrawGrid node coordinates. Step is the column; local time is `col * 48`; phrase time is `bar * 384 + col * 48`. The custom provider in `applyFreePlayDrawGrid` supplies that timing and calls the ordinary DrawGrid sequencer.

`src/main.js`'s Free Play `addLine` creates normal `drawgrid` panels, initializes them, awaits `__drawToy.setState`, assigns stable `toy-definition:` IDs, and connects Main → first panel → later panels using ordinary transport/sequence edges. It sets volume to .65. The panel carries `data-free-play-stroke-id`; `__freePlayDrawGrid` is the runtime metadata clone. No visible Sequence wrapper is added.

Normal initialization/capture adds these fields, verified in the browser:

- `schemaVersion: 2`, `coordinateSpace: 'drawgrid-logical-800x600'`;
- `musicalRole: 'melody'`, `localTranspose: 0`;
- `nodes.groups`: eight empty arrays, and empty `manualOverrides`;
- `dataset.steps = '8'`, instrument, transport/audio IDs, shared definition ID and normal presentation/name fields;
- `__seqPattern = {steps, instrument, cols:[{active,nodes,disabled}, ...]}`.

Generation does **not** supply DrawGrid `ptsN`, runtime `pts`, stroke color, `generatorId`, `isSpecial`, `overlayColorize`, or populated node group stacks. It does not persist a key/scale object or pitch-range descriptor. `autotune: true` is a UI/snapping flag, not a declaration of C-major pentatonic. Source `musicalRole` is not explicitly copied by `lineDrawGridStates`; normal DrawGrid initialization supplies melody. No transpose, reference-harmony or performed-pitch values are baked into the generated state. No instrument octave/pitch-shift dataset is supplied by this conversion; sequenced generated notes instead pass explicit per-note octave/pitchShift options at playback.

## 2. Why the authored stroke is missing

Normal DrawGrid stores ink separately from note masks. `dg-input-handlers.js:onPointerDown` starts runtime `{pts:[logicalPoint], coordinateSpace:'drawgrid-logical-v1', color}`. Release in `drawgrid.js` commits it to `strokes`, normally marking the first line `isSpecial:true, generatorId:1`, and regenerates the node/group map.

`dg-state-io.js:captureState` persists:

```js
{
  schemaVersion: 2,
  coordinateSpace: 'drawgrid-logical-800x600',
  strokes: [{
    ptsN: [{nx, ny}],            // normalized relative to the inner grid rectangle
    color, isSpecial, generatorId, overlayColorize
  }],
  nodes: {active, disabled, list, groups},
  manualOverrides, ...soundState
}
```

`drawgrid-stroke-persistence.js:upgradeDrawGridStroke` converts `ptsN` into runtime logical `pts` and tags the stroke `drawgrid-logical-v1`. `dg-stroke-render.js:getStrokePath` and `drawFullStroke` require those `stroke.pts`. `dg-resnap.js` redraws them on refresh. `dg-set-state.js` accepts this data programmatically; pointer input is not required to create a valid stored stroke.

Free Play deliberately writes `strokes: []` and only retains the original path under `freePlay.path` on the first chunk. No DrawGrid ink renderer reads that provenance field. Its points are `{x,y}` in Free Play space, not DrawGrid `{nx,ny}` or `{x,y}` logical pixels. They are also arc-length ordered, not a chunk-local X-time path. No conversion currently bridges those representations.

**Important nuance:** `dg-nodes-render.js` independently draws thin straight connectors between compatible adjacent note nodes. Those connectors may be visible, as in the reproduction. They are not the original authored stroke, do not populate `strokes`, and do not establish generator/group identity. Saying that DrawGrid has no line rendering at all would be inaccurate.

A reconstruction can use the **same structural data type** as a user-drawn DrawGrid: valid normalized `ptsN`, upgrade to logical points, plus appropriate stroke/group metadata. It cannot recover the original freehand geometry from sparse musical nodes. Nor is simply adding a polyline guaranteed to preserve music: `dg-map-regen.js:processGeneratorStroke` snaps its thickness/column coverage, fills gaps, and builds disabled/group masks. Normal autotune can change pitches. `meta.preserveNodesOverStrokes` is an existing way to keep hydrated nodes authoritative during redraw; generated visual geometry must not accidentally re-author notes or fill a partial ending. Generator IDs and `nodes.groups` also determine special-line behavior and connectors.

## 3. Coordinate-space comparison

| Property | Free Play line | Normal DrawGrid | Free Play-generated DrawGrid |
| --- | --- | --- | --- |
| Logical width / height | 1 × 1 | 800 × 600 | 800 × 600; provenance path remains 1 × 1 |
| Inner musical area | Unit square | x=30..770, y=30..570; 740 × 540 | Same normal inner area |
| Y=0 | Top, highest safe pitch | Canvas top; above inner grid | Same; node row ignores original Free Play Y |
| Source pitch range | Pentatonic MIDI 48..81 (C3..A5) | Chromatic rows MIDI 59..48 (B3..C3) | Full source MIDI in side lookup; display rows folded to one octave |
| Pitch → displayed Y | Original path Y; Straighten maps interpreted MIDI to normalized musical Y | row=59−MIDI; logical Y=30+(row+.5)×45 | row=11−(MIDI mod 12); same logical row-center formula |
| Input Y → pitch | Nearest major-pentatonic pitch to `48+(1−Y)×33` | Pointer → contained logical coordinates → floor((Y−30)/45), clamped 0..11 → 59−row | Editor uses normal mapping; no full-register inverse/update |
| Autotune policy | C major pentatonic [0,2,4,7,9] | C minor pentatonic [0,3,5,7,10] when drawing/snap is enabled | `autotune:true`, but existing nodes bypass stroke snapping |
| Step timing | 48 ticks; variable exact phrase end, up to 1536 ticks | Default 8 columns / 384 ticks / 48 ticks each | Same 48-tick events, custom exact partial-chunk duration/provider |
| Stroke representation | Original `path.points` plus cumulative distances | Separate `strokes[].ptsN` → runtime `pts`, plus node/group masks | `strokes:[]`; first chunk has unrelated `freePlay.path` |

For normal input, `drawgrid.js:pointerToDrawGridStrokeLogical` calls `drawGridClientToStrokeLogical` → `screenToLogical`. The 800×600 logical surface is uniformly contained/letterboxed inside the actual canvas rectangle. Backing DPR is metadata, not a coordinate multiplier. `drawGridLogicalRowFromPoint` applies the floor/clamp above. `dg-nodes-render.js` uses row centers, and `dg-note-grid.js` labels them from the same one-octave chromatic palette.

The pointer and displayed-node geometry agreed in the reproduction. This is **not** an accidental 0..1-to-pixels conversion, inverted Y, stale canvas height, or DPR error. The information loss is the explicit modulo-12 pitch conversion and the separate unmaintained full-pitch lookup.

## 4. Measured pitch-edit reproduction

Test instrument: Piano. Local transpose 0; captured contexts had `harmony:null`, `scale:null`, `transposeSemitones:0`. Values below are actual browser editor snapshots and final `toy:note` values, not subjective pitch estimates.

| Test | Before | After | Final audio |
| --- | --- | --- | --- |
| Generated upward edit, column 0 | A5 / MIDI 81; row 2; logical Y 142.5; client Y 556.256 | row 1; logical Y 97.5; client Y 527.079; old key `0:2=81` remains, no `0:1` | Sequencer A#3 / MIDI 58: **23 semitones lower** despite moving upward |
| Same generated edit while stopped | Same source state | Same edited row | Drop preview A#4 / MIDI 70, distinct from subsequent A#3 playback |
| Normal upward edit, column 0 | source A#3 / 58; row 1; logical Y 97.5; client Y 527.079 | source B3 / 59; row 0; logical Y 52.5; client Y 497.902 | A#4 / 70 → B4 / 71: expected +1 semitone |
| Normal return to original height | source B3 / 59 at row 0 | source A#3 / 58 at original row 1 and client Y 527.079 | A#4 / 70 restored |

Normal control used Piano with its ordinary pitch-shifting-off policy. `resolveOctaveForToy` uses the sample's C4 base octave, explaining its consistent source-to-performed +12 offset. That is separate from the generated row-edit failure.

Exact faulty route:

1. `lineDrawGridStates`: A5 → row 2, with `freePlay.midi['0:2']=81`.
2. `dg-input-handlers.js:handlePointerMove` moves row 2 → 1, updates `currentMap.nodes`, groups/manualOverrides, and emits node-drag. It never migrates or recalculates `freePlay.midi`.
3. `drawgrid-player.js:__sequencerSchedule` selects `freePlay.midi['0:1'] ?? notePalette[1]`. The key is absent, so MIDI 58 replaces MIDI 81.
4. Generated sequencing explicitly preserves the selected MIDI's octave, so the fallback really sounds as A#3.
5. `drawGridLineSource` has the same missing-key fallback, `59-row`, so the Free Play projection also inherits the wrong register once its shared pattern updates.

The stopped preview is independently wrong: `previewDraggedNote` and node-toggle audition use `notePalette[row]`, never the Free Play lookup, and omit generated sequencing's per-event octave options. The sampler then applies its ordinary octave policy. The preview can differ from both the intended source and the next sequenced result. Note labels/drag-scale hints also use the normal palette, not the full generated MIDI.

## 5. Round-trip findings and a second shared-state bug

The simple same-height test does not always fail. On an untouched generated A5 in column 1, a horizontal drag ending at the same Y retained row 2, lookup key `1:2=81`, and A5 playback. The normal control likewise retained its row/pitch at unchanged Y. Keeping the lookup key intact can conceal the broken pitch model.

The **plain pitch → displayed row/Y → editor pitch** conversion is not invertible for higher Free Play octaves. A deterministic check across all source pitches found:

- Normal DrawGrid: **12/12** chromatic source pitches round-trip exactly.
- Free Play: **5/15** safe pitches round-trip through the ordinary row mapping; the other ten lose one or two octaves. Example: 81 → row 2 → Y 142.5 → row 2 → base MIDI 57. The first divergence is already `event.midi % 12`, before any pointer movement.

A separate browser return test exposed a persistent snapshot mismatch. After a generated column 1 note moved up and then back down, the settled editor had `nodes.list[1]=[2]` and lookup `1:2=81`, but exposed `__seqPattern.cols[1].nodes=[1]`; actual playback remained A#3. This was not merely one second of queued old audio: the mismatch remained in a later settled capture.

Relevant code is `src/linked-toy-views.js:install/bind/edit`:

- the shared-view controller queues `edit(p)` on panel `pointerup`;
- DrawGrid commits its final update through a **window** `pointerup` handler (`drawgrid.js`, around line 4857);
- `edit` captures the edited authored state and sets `m.sharedPattern=patterns.get(p)`;
- later, `drawgrid:update` may publish a new provider pattern, but `edit` returns early when the authored state JSON is unchanged;
- the getter prefers the old `m.sharedPattern` over the newly assigned provider pattern.

A direct reproduction with the actual controller, without any Free Play metadata, confirmed the failure condition: publish changed state before the new pattern, then publish the new pattern with unchanged state → editor row 1, shared state row 1, exposed playback row 2. This is a general shared-definition synchronization defect; the observed panel/window ordering supplies a route to it. Generated grids all enter that shared-definition path, while the plain manually created control did not.

## 6. Authored source versus performed pitch

**Free Play is storing authored/source MIDI, not already harmony-adapted output.** `createLineSource` only applies its safe-pitch policy. Conversion copies that MIDI directly into the register lookup. It never calls runtime harmony adaptation and never reads admitted output notes back into authored state.

The later playback pipeline is:

```text
row + optional generated MIDI lookup
→ note name / source register
→ resolveOctaveForToy (instrument policy)
→ resolveMusicalPitch (harmony adaptation, then graph + local transpose)
→ finalNote
→ audio scheduling + toy:note / visual admission
```

`audio-samples.js:triggerInstrumentInOccurrence` and `harmonic-adaptation.js:resolveMusicalPitch` own the last stages. The reproduced failure occurs before harmony and with zero transpose. The problematic confusion is **one-octave editor row versus full authored source register**, compounded by stale snapshots and inconsistent audition policy—not performed harmony notes being stored as authored notes.

## 7. Smallest repair options, not implemented

| Option | Scope and consequence |
| --- | --- |
| Normalize generated music into today's ordinary one-octave row model, and provide normal stroke data | Smallest way to remove special pitch lookup, but changes Free Play pitches/register and can flatten the gesture. A single toy transpose cannot preserve a chunk spanning multiple octaves. Not recommended without accepting that musical change. |
| Targeted compatibility patch | Migrate/recompute the lookup on drag using the old authored MIDI and row delta; share the same resolver for preview, labels and playback; generate an explicitly node-authoritative visual stroke. Smaller code footprint, but pitch-class-folded display still cannot show the full contour, and col/row-keyed identity remains fragile under polyphony/collisions. Useful only as an explicitly limited interim fix. |
| Shared authored-pitch contract with reversible editor projection | Store full source pitch as first-class node data with stable identity; make rendering, pointer edits, labels, previews and sequencing use a common pitch/register adapter. Choose an explicit range/register presentation capable of preserving the original MIDI. Preserve legacy normal-grid behavior via its current mapping. Generate DrawGrid-compatible visual stroke/group data from the same canonical nodes without re-snapping music. More work than a lookup migration, but fixes the architectural mismatch. |

**Recommendation:** use the third option if preserving Free Play's audible contour is a requirement. First settle the DrawGrid pitch/register representation; then reconstruct the display stroke from that same source. Otherwise the new ink would merely visualize a broken pitch projection. Keep the existing original Free Play path as provenance and keep runtime harmony/transpose downstream.

Independently repair the shared state/pattern commit ordering and the preview resolver consistency. Those are prerequisites for trustworthy edit round trips regardless of which pitch representation is selected. Use the existing programmatic state/upgrade APIs rather than simulating pointer input. Explicitly preserve note masks, exact partial durations and group semantics when introducing visual geometry.

Tight regression scope for the next change: high-octave up/down edits, same-height round trips, return-to-original-height while playing and stopped, shared/linked copies, preview vs sequenced pitch, persisted reload, normal one-octave control, no harmony output baked into source, visible stroke restoration, and partial endings unchanged.

## Evidence and relevant code

Evidence:

- `resources/debug-output/free-play/drawgrid-investigation-proof.json`: browser source/editor/pointer/audio snapshots; some early aborted same-height gestures are retained and named separately. The clean same-height and normal controls are explicitly identified.
- `resources/debug-output/free-play/drawgrid-pitch-roundtrip.json`: all normal and safe Free Play pitch round trips.
- `resources/debug-output/free-play/shared-pattern-investigation.json`: direct shared-controller ordering reproduction.

Code anchors:

- `src/free-play-drawgrid.js:6` — conversion; `:16` — reverse projection; `:33` — custom provider.
- `src/free-play-line.js:14` — source pitch mapping; `:42` — gesture analysis.
- `src/drawgrid/drawgrid-viewport-space.js:45,78,95` — logical geometry, node centers, inverse row mapping; `src/coordinates/viewport-space.js` — letterboxed screen/logical transforms.
- `src/drawgrid/dg-state-io.js:33` — normal serialized shape; `dg-set-state.js:13` — programmatic state; `drawgrid-stroke-persistence.js` — normalized/logical upgrade.
- `src/drawgrid/dg-stroke-render.js:8,36` — authored ink; `dg-nodes-render.js:625` — separate adjacent-node connectors; `dg-map-regen.js:20` — snap/fill/group side effects.
- `src/drawgrid/dg-input-handlers.js:156,207,390` — drag rows and release; `drawgrid.js:4857` — window release handler.
- `src/drawgrid/dg-note-grid.js:9,16` — minor-pentatonic snap policy and one-octave labels.
- `src/drawgrid/drawgrid-player.js:216,414,430` — preview, lookup fallback and generated register options.
- `src/linked-toy-views.js:42,45,85` — shared snapshot publication and equality short-circuit.
- `src/audio-samples.js:164,489,494,511` — instrument register policy, harmony boundary and observed final note event.

No production fixes, production tests, or transport/pitch algorithms were changed during this investigation. Only this report and diagnostic evidence were retained; temporary instrumentation/server files were removed.
