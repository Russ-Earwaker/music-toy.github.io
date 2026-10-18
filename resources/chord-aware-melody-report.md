Auto-Arrange chord-aware melody generation — 17 October 2026

Generation now accepts the A recipe's C / Am / F / G context and resolves the active chord at each generated cell's musical tick. This is opt-in in `prepareDrawgridPhrase`, used by normal Auto-Arrange. Manual DrawGrid randomisation, runtime Melody adaptation, Accompaniment mapping and graph/Linked Copy architecture are unchanged.

An authored eight-step first chunk is preserved exactly. Only its generated continuation chunks are guided. For longer authored seeds, all original material is preserved: two chunks for a 16-step idea, all four for a 32-step idea. With no authored notes, the existing production long-line generator and snapper supply the four-bar contour before guidance.

The chord-pool selection probabilities are 93% at chord boundaries, 82% on other strong beats, 90% for long notes, 94% at phrase resolution, and 20% for weak notes. These are mixture weights, not guaranteed observed chord-tone percentages: the general scale pool can also contain chord tones. Within the chosen pool, nearby pitches have greater weight. The previous note and original contour constrain direction and leaps; changes stay within three semitones and the existing twelve-row register. Rhythm and rests are retained. Generated notes use the unchanged progression-scale inference, which selects C major here. This matters because the existing visual snap palette is C minor pentatonic, including Eb/Bb.

Phrase-ending selection prefers a common tone with the next chord when available. A duration-aware selection helper also prefers common tones across a held chord boundary; ordinary DrawGrid cells currently rearticulate rather than encoding sustained notes. No note-splitting system was added. Generated strokes are shifted smoothly toward their guided nodes, preserving line shape/colour and authoritative node persistence. Instrument, volume, role and local transpose are retained.

Eight seeded old/new comparisons are in `debug-output/chord-aware-melody/index.html`, with sixteen full 16-bar WAV previews and per-note diagnostics in `comparison.json`. The comparison source uses the production line generator and logical snapper. Its Intro/A/B/Outro recipe is compiled through the production Structure runtime; pitches use the production pitch resolver. Audio is an offline render with simple plucked tones/noise, not a recording of the browser's production instruments. Source plots, per-section compatibility, mean leaps and repeated-pitch rates support inspection for over-literal chord spelling.

Measured comparison results (eight seeds, after unchanged playback adaptation):

| Section | Previous strong-note chord tones | Guided strong-note chord tones | Previous weak-note chord tones | Guided weak-note chord tones |
| --- | ---: | ---: | ---: | ---: |
| A: C / Am / F / G | 27.3% | 92.2% | 32.8% | 56.3% |
| B: F / G / Am / C | 31.3% | 21.9% | 37.5% | 37.5% |

The policy deliberately follows the requested A-first approach, with the same linked source reused under B. The measurements expose its limitation: source bias toward A can reduce strong-note compatibility under B, since the conservative runtime does not force chord tones. For example, Am and G share no triad tones. No separate B melody or runtime retuning was introduced to conceal that tradeoff.

Deterministic tests cover probability differences, event-time chord boundaries, held-boundary common tones, register/scale/displacement/direction/leap constraints across 60 generated seeds, reproducibility, authored preservation, rests/disabled notes/voice count, continuation guidance, production wiring and unchanged runtime role policies. Existing linked-copy tests remain in place. Detailed results are in `debug-output/chord-aware-melody-full-tests.txt`.

Subjective observations: none claimed. The rendered files are ready for listening, but this pass did not perform browser playback or human listening evaluation. In particular, whether B remains musically acceptable and whether any result sounds too much like chord spelling still need listening review. Strong-note agreement in A is demonstrated; improvement in both A and B is not.

Regenerate comparisons: `node resources/chord-aware-melody-comparison.mjs`.
