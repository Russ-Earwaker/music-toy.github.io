Auto-Arrange melody development

The generated phrase now develops its first visible DrawGrid instead of keeping three separately generated long-contour bars:

- Statement: authored chunk 1 stays unchanged; a generated statement receives the existing chord-aware guidance first.
- Close variation: repeat its rhythm and opening, varying one late passing cell by a semitone before chord guidance.
- Development: exchange its two half-bar motifs, then lift the answering half by two semitones where the register allows. Pitch range is bounded; voices are shifted together rather than collapsed at the register edge.
- Return/resolution: recall the statement's contour and rhythm, bring back its opening pitch at the ending, then apply the existing stronger harmonic resolution preference.

The recent chord-boundary/strong-note probabilities and conservative runtime adaptation are unchanged. Later bars receive the same A-first chord guidance as before; B still reuses the same linked phrase under its alternative progression. That previously reported A/B harmonic tradeoff has not been retuned in this pass.

All four states still become ordinary visible, editable DrawGrids. No graph, ownership, instrument, volume, local transpose or Linked Copy changes were needed. Existing longer authored ideas retain their authored bars rather than discarding content to replace them with variations.

Listening examples: `debug-output/melody-development/index.html`. Eight same-seed before/after pairs contain sixteen full 16-bar WAV previews, matching source-note plots and diagnostics in `comparison.json`. Six pairs use generated statements and two use supplied eight-step motifs. Before is the immediately preceding chord-aware generator, not the older harmony-unaware baseline. Each pair's first chunk is checked for exact equality.

The comparison compiler, pitch decisions and offline preview renderer are shared with the previous comparison tooling. Melody enters at eight seconds; B starts at sixteen seconds. These use simple preview timbres rather than browser instrument captures. No subjective claim that the phrases sound more composed is made; that is what the paired files are for judging.

Validation: 21 targeted generation, harmony and Linked Copy tests pass, including deterministic generation over 30 development seeds, unchanged statements, variation rhythm/shape, register, chord guidance, independent editing and preservation of longer authored material. Results: `debug-output/melody-development-tests.txt`.

Regenerate previews: `node resources/melody-development-comparison.mjs`.
