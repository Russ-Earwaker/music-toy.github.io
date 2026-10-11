# Advanced UI cleanup — phase 1

Audited toys: **DrawGrid (Draw Line), Bouncer, Rippler, Chord Wheel, Drum Kit, and Simple Rhythm**. The first five had expanded controls; Simple Rhythm retained a dormant pitched mode. Legacy Advanced overlay/injector helpers were also reviewed.

## Removed and retained

| Toy | Removed from player-facing Advanced | Retained |
| --- | --- | --- |
| DrawGrid | Draw Line 1 / Draw Line 2 buttons, line-arming highlighting, external Edit Mode buttons | Pattern: 8/16 steps; Pitch: Snap to Notes; Randomise: Pattern / Notes |
| Bouncer | External Edit Mode buttons and scattered advanced controls | Motion & Timing: ball speed and Timing Snap; Randomise: Pattern / Notes; existing in-canvas block pitch editing and Alt-click block editor |
| Rippler | External Edit Mode buttons and scattered advanced controls | Timing: Timing Snap; Randomise: Pattern / Notes; existing in-canvas pitch editing |
| Chord Wheel | External Edit Mode buttons and enlarged modal presentation | Existing inner chord arrows, with a concise instruction beside the wheel |
| Drum Kit | Advanced entry point and pitched note-randomisation control | Basic pad, steps, instrument, Random, Clear and volume controls; old pitch data remains compatible internally |
| Simple Rhythm | Dormant Advanced entry point and pitched note-randomisation control | Basic one-note/percussion interaction, steps, instrument, Random, Clear and volume controls |

No musical features, modifier types, adaptation changes, or Advanced Role/Transpose controls were added.

## Terminology

- DrawGrid **Auto-tune → Snap to Notes**. Its tooltip explicitly describes snapping pitches to the nearest pentatonic note. The persisted `autotune` key is unchanged.
- Bouncer/Rippler **Quant → Timing Snap**.
- Bouncer's legacy microeditor **Cube → Block note**, with an accessible note selector and Close button.
- Simple Rhythm's creation description now describes a simple one-note percussion pattern rather than the dormant pitched matrix.

## DrawGrid compatibility decision

Retain the internal two-generator representation. Generator IDs, special-line flags, saved strokes, node grouping and rendering still depend on it. Removing that data would risk old scenes; no destructive migration is appropriate here. Line-selection controls and their injected presentation were retired, while save/load and rendering continue to accept legacy data.

The old expanded view also changed which generator lines contributed to playback. Inline Advanced now uses the same mapping as Basic, so opening or closing controls cannot switch source pitches. Regression coverage saves/restores both generator IDs and verifies identical playback maps before, during and after Advanced.

## Shared interaction

DrawGrid, Bouncer, Rippler and Chord Wheel use a compact **Advanced >** button in their normal header. It opens a grouped panel inside the toy with an **ADVANCED** heading and **Close** button. Click the toggle again, click Close, or press Escape to return to Basic. Only one toy's Advanced panel is open at a time. Focus moves to Close on opening and returns to the toggle on closing.

Toys stay attached to the board at the same position and dimensions. The Chord Wheel panel occupies the left side so its inner chord arrows remain accessible. The presentation layer does not call transport or scheduling APIs. Native randomisation controls retain their existing handlers after moving into their groups.

Advanced open/closed state is transient: scenes reopen in Basic. Authored notes, control values, generator data and existing scene settings retain their normal persistence. Keeping toys on the board also ensures an open Advanced panel cannot exclude its toy from a saved snapshot. Legacy zoom/overlay entry points delegate to the common implementation; the obsolete secondary overlay UI is retired. Perf Lab readiness checks now find the header Advanced button and no longer expect one on percussion toys.

## Validation

- 60 targeted automated checks passed across Advanced UI, DrawGrid persistence/snapping, instrument selection and Bouncer/Rippler/Chord Wheel/Simple Rhythm playback. A subsequent fifth Advanced test also passed, covering repeated initialization without duplicate toggles, panels or instructions (61 distinct checks in total).
- Browser-tested the real buttons for DrawGrid, Bouncer, Rippler and Chord Wheel; checked Close/Escape, single-panel behavior and default collapsed state after reload.
- Browser-confirmed DrawGrid's labels and absence of Line 1/Line 2 controls; opening leaves its board parent, position and dimensions unchanged.
- Browser-created Drum Kit and confirmed zero Advanced buttons and zero pitched randomisation controls on it and Simple Rhythm.
- The real harmony graph continued scheduling bass, melody and percussion while Advanced was open. Saving with Chord Wheel Advanced open retained all six toys then on the board, and the original DrawGrid note lists were unchanged. Reload restored all toys in Basic.
- Saved browser observations: [harmony-graph-2026-10-11T07-55-09-850Z.json](debug-output/harmony-graph-2026-10-11T07-55-09-850Z.json). These contain actual scheduling events and the saved scene, rather than a subjective listening assessment.
- `git diff --check` passed. No deployment or archive rebuild was performed for this cleanup.
