# Auto-Arrange v1.4

Auto-Arrange no longer generates B's octave Transpose. B keeps its four layers and F | G | Am | C progression; extra percussion supplies the lift. Arrange Again removes obsolete owned Transpose/Timeline topology while retaining source Masters, user edits and unrelated nodes. General Transpose and Timeline remain available and unchanged.

## Source volume and sound settings

The DrawGrid footer was installed before its dedicated audio ID and captured that earlier identity. Volume/mute actions now resolve the current audio ID when used. In addition, Instance playback previously depended on copying a Master value onto a separate Instance gain. Audio now uses the Master's own gain/mute bus for every linked Instance. Event identities and cancellation ownership remain on the visible Instance, so deleting one Instance still cancels only its voices. This is a normal source-owned playback rule, shared by all linked toys, not an Auto-Arrange-only fix.

Instrument, note/octave and pitch-shift policy still resolve on the Master before audio ownership switches to the Instance. Musical role/local transpose remain source-owned; harmony and graph transpose remain occurrence-owned. No further setting bypass was found in this focused audit. Source mute is also respected through the shared source bus. Volume changes affect ongoing/future output without restarting transport or multiplying copied gains.

Browser output telemetry checked **855 Melody events**, with the actual output gain following **0.35 → 0.04 → 0.8**. Both linked Melody Instances used the same source bus. A regenerated long Melody restored and played at its saved **0.35** level. Actual production audio was captured at both the master mix and isolated Melody buses, without an alternate renderer or volume normalization.

## Four-bar generated Melody

Only a newly needed Melody fill is created in the normal DrawGrid **32 steps / 4 bars** mode: 32 eighth-note slots, 1,536 ticks. This option is editable in DrawGrid Advanced and persists through the existing step data. Legacy 8/16-step subdivision timing stays one bar. Existing authored short melodies and existing edited fills retain their data and duration; they repeat naturally through the arrangement. Arrange Again reuses filled Masters and never silently rerolls or lengthens them.

Normal DrawGrid randomisation produces one continuous stroke with a bounded recurring contour, bar-to-bar register development, and a recurring rest motif with occasional variation. A small contour safeguard avoids an effectively flat motif after note snapping. No chord progression is baked into that source and no separate Auto-Arrange melody engine was introduced. Existing harmony adapts notes at playback time.

The four-bar setting is authoritative for graph compilation, Instance timing and the long playhead. Generation now awaits DrawGrid's two-frame state application, preventing a later empty hydration from overwriting the generated notes. Pattern-length updates also resynchronise graph definitions during restoration/editing.

A four-bar Melody starts A at source step 0. B begins at transport tick 3,072, which is another natural four-bar boundary, so it also begins at source step 0. That is shared transport modulo phrase duration, not an activation-time reset. Short user melodies likewise retain their natural phase.

With a four-bar Melody, shorter Together children need existing Repeat branches to stay active until the section ends: two in A and three in B. The resulting graph has twelve structures, nine Instances and four Masters. With supplied one-bar melodies, the compact graph has seven structures and the same nine Instances. Both cases retain the **1 / 3 / 4 / 1** layer count and sixteen-bar total.

## Verification and listening files

**931 tests passed**, including awaited hydration ordering, long contour/timing, source gain sharing and live changes, mute, obsolete-node cleanup, fill reuse, full backing density, shared phase and duration. Browser proof verifies all 32 source positions, four distinct bar patterns, normal register, source data stored once, saved volume, and a user Random edit surviving Arrange Again. Stroke persistence differs only by floating-point round-trip error (maximum observed 5.6e-17), with note data unchanged.

- [Full sixteen-bar mix](debug-output/auto-arrange-v1-4-full-16-bars.wav)
- [Isolated Melody](debug-output/auto-arrange-v1-4-isolated-melody.wav)
- [Quiet then loud comparison](debug-output/auto-arrange-v1-4-quiet-then-loud.wav)
- [Browser proof and raw capture filenames](debug-output/auto-arrange-v1-4-browser-proof.json)
- [Audio measurements](debug-output/auto-arrange-v1-4-audio-proof.json)
- [Full test log](debug-output/auto-arrange-v1-4-full-tests.txt)

The longer source eliminates exact one-bar note repetition and develops four distinct bars. The recordings allow listening review; I have verified the signals and musical event structure, but do not claim a human subjective listening judgment. The quiet/loud WAV uses actual recorded excerpts; its RMS contrast also depends on the notes and gaps, so it is not a calibrated same-note gain comparison.

Reproduce checks with `node resources/auto-arrange-v1-4-browser-proof.mjs` and `node resources/auto-arrange-v1-4-audio-proof.mjs`. Production changes are in Auto-Arrange, the shared audio/volume paths, and DrawGrid's existing length/state/randomisation/playhead paths. The recorder and binary WAV export are test/results tooling only.
