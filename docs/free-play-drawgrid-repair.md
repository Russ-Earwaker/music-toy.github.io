# DrawGrid authored-pitch and stroke repair

18 October 2026. Implements the three repairs from the investigation independently. This pass does not change Auto-Arrange, runtime harmony adaptation, transport, Free Play gesture timing, the melody recipe, or either pentatonic policy.

## 1. Canonical note representation

All DrawGrids now normalize to a shared authored model:

```js
{
  authoredNotes: [{id: 'stable-note-id', col: 0, sourceMidi: 81}],
  pitchRange: {minMidi: 48, maxMidi: 83},
  preserveSourceRegister: true,
  nodes: {list, active, disabled, groups}, // compatible editor projection/masks
  strokes: [{ptsN, color, noteDriven: true, ...}],
  authoredProjectionKey: '...'           // compatibility stamp for legacy mask editors
}
```

`sourceMidi` is authored pitch before instrument octave policy, event-time harmony and transpose. Note IDs survive movement, linked state, persistence and reload. Column is a mutable time coordinate; it is not part of a pitch metadata lookup. Shared `dg-authored-notes.js` functions provide source/row conversion, stable-ID normalization, drag updates, preview options and immutable playback-pattern construction.

Rendering uses the projected row of the canonical pitch. Labels, stopped drag audition, node-toggle audition and sequenced playback resolve that same authored note. Sequencer snapshots include `{id, col, sourceMidi, row}` per note rather than consulting a coordinate-keyed side table. Free Play reads those ordinary DrawGrid notes to render its line; it owns no separate playable phrase.

## 2. Compatibility and migration

Ordinary legacy grids retain the existing **C3–B3, MIDI 48–59, twelve-row** projection. Missing source pitch is inferred as `59-row`. Their existing instrument pitch/volume, enabled/disabled masks, role and local transpose remain intact. No default instrument-octave policy is changed.

Generated melodic grids use an explicit **C3–B5, MIDI 48–83, thirty-six-row** view within the existing 800×600 logical surface. This displays their actual register and leaves room above A5 for an upward edit. One row remains one chromatic semitone; rows are not a pitch-class fold.

Older Free Play-generated saves migrate their full authored MIDI from the old lookup, reproject masks into the full range, assign persistent note IDs and reconstruct missing normal stroke data. Existing explicit canonical notes retain their IDs on subsequent loads.

`authoredProjectionKey` identifies the serialized legacy mask projection. If an existing programmatic row editor clones a captured state and replaces its node masks, normalization recognizes that deliberate row-based edit instead of overwriting it with copied, stale note data. A pitch-only canonical edit remains authoritative and reprojects its masks. This compatibility boundary avoids changing the existing row-based generation/phrase-editing recipe.

## 3. Drag, preview and playback

`dg-input-handlers.js` updates the identified note's source pitch through the shared source/row mapping. It keeps the ID and then refreshes its compatible row mask. Normal group splitting can create a distinct note when another group's old-row note remains.

For the generated range:

```text
A5 / MIDI 81 → row 2 → logical Y 67.5
up one row  → row 1 → logical Y 52.5 → A#5 / MIDI 82
back        → row 2 → logical Y 67.5 → A5 / MIDI 81
```

Normal pointer-to-logical geometry is unchanged. New canonical notes are not scale-quantized again during drag.

A common performance-options resolver preserves the generated source register for both audition and sequencing, matching the previous intended generated-note sound. Legacy ordinary grids keep their previous instrument settings. The existing downstream audio/harmony/transpose implementation is untouched; no performed pitch is written back into editor state.

## 4. Free Play lookup retirement

**`freePlay.midi['col:row']` is removed from new state and playback authority.** The only remaining reference reads and deletes it during one-time import of old prototype saves. Neither Free Play projection nor the DrawGrid sequencer reads it for playback.

The remaining `freePlay` metadata records provenance, bar/phrase duration, original path on the first chunk, and visual morph state. It contains no separate musical pitch model.

## 5. Normal authored strokes from the smooth musical curve

Free Play conversion now writes ordinary persisted `strokes[].ptsN`. `upgradeDrawGridStroke` produces normal logical `pts`; the existing DrawGrid ink renderer draws them. It does not read `freePlay.path`.

The shape-preserving cubic Hermite interpolation was extracted to shared `src/pitch-curve.js`. Free Play Straighten and generated DrawGrid ink evaluate the same authored MIDI curve in tick order. Generation samples each bar's actual time interval densely and explicitly includes musical node times. Pitch-to-Y uses the same pitch range as the DrawGrid nodes, so every note lies on its generated curve.

X uses ordinary DrawGrid slot centers. The final half-cell of a full bar is compressed to end inside the normal grid rectangle; node times/positions are unchanged. Partial bars stop at their actual endpoint rather than extending to the right edge.

The general stroke marker `noteDriven` means that this ink is a visual projection of authored notes. Normal redraw/hydration therefore preserves the canonical node masks instead of re-snapping ink and fabricating musical content. Moving a note refreshes the normal logical stroke and redraws it. The marker is persisted through ordinary stroke serialization; no Free Play-specific rendering branch was introduced.

## 6. Partial bars

Duration and events are unchanged. A browser gesture produced **922 ticks**, split into **384 + 384 + 154**, with **8 + 8 + 4** authored notes. Its last stroke ends at normalized grid X **0.4635416667**, leaving the rest of the third grid empty. No new notes were added by reconstruction.

After reload, all three chunks retained exactly the same note IDs, source pitches, stroke points and durations. Editing does not implicitly extend the original partial phrase window.

## 7. Independent shared-pattern publication repair

The old linked-view path could capture edited UI state on panel pointerup before DrawGrid's window-level pointerup published the new sequencer pattern. A later `drawgrid:update` carried unchanged authored state; the equality early return discarded its new pattern. `m.sharedPattern` then remained on the previous edit.

The shared controller now publishes DrawGrid state and pattern as one coherent revision: `drawgridPatternFromState` derives the committed playback snapshot directly from that captured authored state. It does not depend on a later provider callback arriving in the right order. Sibling shared snapshots and playback immediately resolve that committed revision; existing editor hydration/redraw retains its revision guard.

For other providers, the equality guard also checks the pattern, allowing a pattern-only publication rather than discarding it. No timeout, arbitrary delay, Free Play exception or transport change is involved.

The regression explicitly publishes edited state before the normal pattern callback, checks a sibling's committed source/pattern, delivers the late callback and verifies no spurious revision, then restores the original pitch. Both directions retain the note ID.

## 8. Scale policy remains separate

Free Play still generates C-major pentatonic `[0,2,4,7,9]`. Normal DrawGrid stroke snapping still uses C-minor pentatonic `[0,3,5,7,10]`. Existing generated notes retain their explicit source pitches; moving one uses ordinary chromatic pitch steps and does not re-run minor-pentatonic snapping.

When the user authors a new stroke, DrawGrid's existing minor-pentatonic snapping policy applies, including within an expanded-register grid. Thus new material can differ in scale from the original Free Play melody. This pass does not choose a project-wide scale or rewrite existing notes to conceal that difference.

## 9. Verification

**99 targeted tests passed.** Includes new canonical-note tests, low/middle/high source-pitch round trips, A5 move/restore, preview/performance option agreement, old-save migration, legacy row-editor compatibility, curve/node alignment, exact partial endpoints, serialized stroke reload, and the linked-publication regression. Existing Free Play geometry/morph/scheduler, linked copies, DrawGrid geometry/input/snap, source phase, transport ownership, toy instances and Auto-Arrange checks also passed. Syntax checks and `git diff --check` passed.

Actual browser checks:

| Check | Observed result |
| --- | --- |
| Legacy ordinary saved grid | Twelve-row range and original MIDI preserved; stroke retained on reload. |
| Old generated save | Migrated to full source notes and visible normal stroke; coordinate MIDI lookup absent. |
| Fresh generated A5 | Stable note ID and MIDI 81 before/after same-height drag. |
| Up one row, stopped | Same ID, MIDI 82; stopped preview A#5. |
| Scheduled playback | A#5, matching the preview and committed source. |
| Return while playing | Same ID, MIDI 81; editor, shared state and playback snapshot agree; actual note A5. |
| Smooth phrase correspondence | Free Play Straighten's rising/falling contour visibly matches the three-grid board chain; each grid contains normal ink. |
| Partial phrase | 384 + 384 + 154 ticks, 8 + 8 + 4 notes, unfilled final grid and no checked audio pitch mismatches. |
| Reload | Stable note IDs and exact ink retained for ordinary/A5 grids and all three curved chunks. |
| Runtime errors | None recorded. |

Evidence: `resources/debug-output/free-play/drawgrid-repair-browser-proof.json`. Temporary browser instrumentation and the local QA server were removed after verification. Physical mobile touch and subjective listening remain human/device checks; the generated full-register view has denser semitone rows than the legacy view.

## Changed implementation files

- Shared authored data: new `src/drawgrid/dg-authored-notes.js`.
- Shared curve and normal stroke generation: new `src/pitch-curve.js`, new `src/drawgrid/dg-authored-stroke.js`, `src/free-play-line-visual.js`, `src/free-play-drawgrid.js`.
- Normal DrawGrid integration: `dg-input-handlers.js`, `dg-map-regen.js`, `dg-note-grid.js`, `dg-set-state.js`, `dg-state-io.js`, `drawgrid-player.js`, `drawgrid-stroke-persistence.js`, `drawgrid.js`.
- Independent shared-state fix: `src/linked-toy-views.js`.
- Tests: new `tests/drawgrid-authored-notes.test.mjs`, updated `tests/free-play-line.test.mjs` fixture, new regression in `tests/linked-copies.test.mjs`.

Pre-existing unrelated workspace changes and `rhythmake.zip` were preserved.
