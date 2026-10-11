# DrawGrid Advanced musical controls — phase 2

1. **Terminology:** player-facing roles are Melody, Accompaniment and Percussion. DrawGrid offers Melody / Accompaniment; Simple Rhythm stays Percussion without a selector. Harmony Lab's role options also use Accompaniment. Bass part/instrument names remain valid descriptions of sounds, rather than role names.
2. **Legacy migration:** authored `bass` loads as `accompaniment`. The production classifier and adaptation entry point accept old values; the existing chord-relative algorithm is unchanged. Scenes without an authored role retain centralized compatibility inference. On save/copy, DrawGrid writes the resolved role using the new vocabulary, so subsequent instrument edits cannot override it. Unpitched audio retains its percussion bypass.
3. **Role ownership:** DrawGrid's explicit `musicalRole` is authored toy data, independent of instrument and graph ancestry. New DrawGrids default to `melody`. Simple Rhythm restoration enforces `percussion`, including stale pitched role values.
4. **Local transpose ownership:** DrawGrid stores `localTranspose` as an integer from −12 to +12, default 0. The Advanced selector edits this value and marks persistence dirty. Source strokes and notes are not transposed or rewritten.
5. **Composition:** the existing centralized production pitch boundary performs source → harmony adaptation → local + graph explicit transpose → final pitch. Local +3 and graph +5 yield +8 in either modifier nesting. Debug decisions report `localTranspose`, `graphTranspose`, total `transpose` and final pitch. Future scheduling reads the toy's current value; no transport restart is needed. Graph Transpose remains available for branch/group scope.
6. **Layout:** Musical (Role and Transpose), Pattern (8/16 steps), Pitch (Snap to Notes), Randomise (Pattern / Notes). Both new controls live inside the curated Advanced panel. Basic has no role or transpose selector. Close, Escape, focus behavior, fixed toy dimensions and collapsed-on-reload policy remain shared.
7. **Persistence and inheritance:** DrawGrid state capture/restoration and the common toy sound-state copy boundary include role and local transpose. Quick-add inherits instrument, existing note/octave/pitch-shift settings, role and local transpose. Serialized copy/duplication uses the same restoration boundary. Reparenting keeps authored settings on the source toy and applies its new graph context at scheduling.
8. **Validation:** 80 targeted tests passed across musical role, quick-add, production harmony, Harmony Lab, Advanced UI, DrawGrid persistence and instrument selection; the subsequently added Advanced musical-control test also passed (81 distinct checks). Coverage includes legacy migration, default Melody, explicit role independent of timbre, forced Simple Rhythm percussion, serialized copy, local/graph composition, both nesting orders, live local edits, graph reparenting, unchanged source data and unchanged Lab harmony results. Syntax and whitespace checks passed.

## Browser proof

Used actual DrawGrid Advanced controls to switch Melody → Accompaniment and set local transpose +3. Escape returned to Basic with both controls hidden. The normal C / Am / F / G graph then reported:

| Source | Chord | Adapted | Local | Final |
| --- | --- | --- | --- | --- |
| C3 | C | C3 | +3 | D#3 |
| C3 | Am | A2 | +3 | C3 |
| C3 | F | F3 | +3 | G#3 |
| C3 | G | G2 | +3 | A#2 |

The actual output connector quick-added a DrawGrid with Accompaniment, local +3 and the inherited instrument. Save/reload restored both the original and quick-added toy with those settings and zero expanded Advanced panels. The saved original DrawGrid node lists matched the fixture exactly.

[Saved scheduling and scene observations](debug-output/harmony-graph-2026-10-11T09-05-38-478Z.json).

Logic menus and harmony mapping algorithms were not retuned. No deployment was performed.
