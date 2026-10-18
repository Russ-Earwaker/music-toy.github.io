# Auto-Arrange input robustness

Auto-Arrange now audits source material and authored roles before filling missing slots. Additional usable material gets bounded B-section turns. Intro/A/B/Outro remains sixteen bars, with ordinary connected toys and Linked Copies. No harmony algorithms were retuned.

## Capabilities and selection

| Toy | Melody | Accompaniment | Percussion | Without explicit role |
| --- | --- | --- | --- | --- |
| DrawGrid | yes | yes | with suitable instrument/role | existing instrument classification, normally Melody |
| Bouncer | yes | yes | with suitable instrument/role | existing instrument classification |
| Rippler | yes | yes | with suitable instrument/role | existing instrument classification |
| Simple Rhythm | no | no | yes | Percussion |
| Drum | no | no | yes | Percussion |
| Chord Wheel | no | no | no | special voicing system; left unchanged |

Explicit musicalRole wins, including legacy bass → accompaniment. Without one: unpitched instrument → Percussion; bass family → Accompaniment; other pitched instrument → Melody. Within each slot: authored before generated, explicit before inferred, preferred toy type, then stable object ID. Pitched slots prefer DrawGrid, Bouncer, Rippler; rhythm prefers grids. Shared definitions are audited once, preferring the canonical view when present. A surviving equal-status Linked Copy is valid input.

Explicit Melody sources are not silently relabelled Accompaniment. One leads; others get sparse B texture turns, and missing Accompaniment is filled. A second percussion source replaces the generated B extra. More percussion takes turns in that same lane rather than stacking all sources. One pitched texture lane and one extra-percussion lane each hold four bars of complete patterns.

## Preservation and limits

Empty toys are ignored and preserved. An all-empty board reports “Make a musical idea first” without generating or rewriting content. Sparse nonempty material is retained and supported by gap fills. Only newly generated all-off rhythm is repaired through its ordinary update event. Unknown legacy state is not assumed empty.

Unrelated manual graphs and other Heartbeat domains remain untouched and are identified in the debug report, avoiding a second simultaneous playback path. Extra complete patterns beyond B's four-bar lane capacity remain outside and are reported. These are explicit technical exclusions.

Authored patterns are checked unchanged. DrawGrid retains the existing four visible motif-related, chord-aware chunks. Bouncer/Rippler retain their identity and loop rather than becoming DrawGrids. Generated fills remain visible, connected and editable. Arrange Again reuses fills, including edited extra rhythm, without accumulating sources. Normal Linked Copies and shared definitions remain in use.

## Runtime fixes found in browser testing

Structure-owned Bouncer/Rippler toys now recognise structural ownership without legacy toy-to-toy neighbour IDs. They wait for their assigned turn rather than learning silently during Intro. Active Bouncer learning continues offscreen and starts from the authored launch. Bouncer/Rippler learning notes receive production event-time harmony context. These are lifecycle/context fixes, not harmony tuning.

Bouncer also discarded remaining elapsed travel after a collision-free substep on slow frames. Clear-space steps now consume the full bounded travel budget, with enough collision iterations for that budget. Catch-up is capped at 250 ms rather than simulating an unbounded background stall. Tests compare 60 FPS and 4 FPS trajectories with and without an intervening collision.

## Automated evidence

Full Node suite: **1,037 passed, zero failures**. The 23-case matrix uses production graph compilation, scheduling, pitch resolution and physics event providers with deterministic learned-pattern fixtures. It checks sixteen-bar duration, retained audible source IDs, melody/harmonic/percussion content, immutable authored patterns, no duplicate scheduling identities or late historical dispatch, Return to Start, graph serialization/reload and Arrange Again. Existing Linked Copy tests also pass.

The [matrix page](debug-output/auto-arrange-robustness/index.html) reports **every case's input, selected sources, generated missing roles and heard user source IDs**, with eight complete arrangement WAV previews. [Machine-readable events](debug-output/auto-arrange-robustness/matrix.json) and [full test output](debug-output/auto-arrange-robustness-full-tests.txt) are retained.

Cases include all four lone toy types, all six two-type combinations, three pitched toys, two/three percussion toys, Drum + Simple Rhythm, pitched + multiple percussion, mixed pitched + rhythm, explicitly percussive physics toys, explicit Accompaniment, sparse patterns, empty toys beside useful material, and a sparse extreme instrument choice.

Previews use simple offline timbres with production pitch decisions. They are not browser audio captures or a subjective musical-quality verdict. Live physics learning depends on browser rendering; the browser checks complement the already-learned fixtures.

## Browser evidence

The isolated QA origin uses the real app's Arrange and Play buttons and captures actual audio-scheduling note events. It never clears the user's normal saved scene. [Raw observations](debug-output/auto-arrange-browser-proof.json) retain failed pre-fix cases as well as successful post-fix cases.

A [compact browser summary](debug-output/auto-arrange-browser-summary.json) records complete-cycle cases, input toy note counts, rootedness and scheduling lead times. The final mixed run reached tick 12,950 with all three input IDs emitting notes, zero unrooted toys, zero captured app errors and no notes scheduled more than 5 ms late. This measures audio scheduling, not sound-device latency.

Lone Bouncer, Rippler, Simple Rhythm and DrawGrid each completed a full sixteen-bar cycle with Melody, Accompaniment and Percussion events and no captured app errors. Three percussion sources also completed a cycle, reusing user percussion in B rather than generating another source. All inspected generated toy views were rooted.

The DrawGrid UI run exercised Return to Start and Arrange Again. Regeneration kept fifteen toy views with no unrooted toys, and actual browser reload restored those fifteen views and the arrangement. The automated matrix additionally checks source IDs and authored data across those operations; the browser count alone does not prove data equality.

Mixed DrawGrid/Bouncer/Rippler testing exposed the slow-frame physics defect above. The post-fix fresh run learned a two-note Bouncer pattern and entered replay during B, alongside the original DrawGrid motif and the Rippler texture. Earlier failing observations are retained in the raw log rather than overwritten. Physics learning under long background stalls remains bounded rather than promising exact catch-up across a suspended browser tab.

All eight preview WAVs are 32.40 seconds including the tail, with nonzero PCM peaks between 10,485 and 17,344. These previews exercise deterministic learned sources; real browser tests are scheduling observations, not audio recordings or a claim of subjective quality.

## Per-case results

User IDs are stable fixture IDs, numbered in input order; empty toys are intentionally absent from the heard column. Exact selected IDs and playback decisions are in matrix.json. Every row passes.

| Case | Input | Missing roles generated | User sources heard |
| --- | --- | --- | --- |
| 1 | drawgrid | rhythm, accompaniment, extraRhythm | user-0 |
| 2 | loopgrid | melody, accompaniment, extraRhythm | user-0 |
| 3 | bouncer | rhythm, accompaniment, extraRhythm | user-0 |
| 4 | rippler | rhythm, accompaniment, extraRhythm | user-0 |
| 5 | drawgrid + loopgrid | accompaniment, extraRhythm | user-0, user-1 |
| 6 | drawgrid + bouncer | rhythm, accompaniment, extraRhythm | user-0, user-1 |
| 7 | drawgrid + rippler | rhythm, accompaniment, extraRhythm | user-0, user-1 |
| 8 | loopgrid + bouncer | accompaniment, extraRhythm | user-0, user-1 |
| 9 | loopgrid + rippler | accompaniment, extraRhythm | user-0, user-1 |
| 10 | bouncer + rippler | rhythm, accompaniment, extraRhythm | user-0, user-1 |
| 11 | drawgrid + bouncer + rippler | rhythm, accompaniment, extraRhythm | user-0, user-1, user-2 |
| 12 | loopgrid + loopgrid | melody, accompaniment | user-0, user-1 |
| 13 | loopgrid-drum + loopgrid | melody, accompaniment | user-0, user-1 |
| 14 | loopgrid + loopgrid + loopgrid | melody, accompaniment | user-0, user-1, user-2 |
| 15 | drawgrid + loopgrid + loopgrid | accompaniment | user-0, user-1, user-2 |
| 16 | drawgrid + bouncer + rippler + loopgrid | accompaniment, extraRhythm | user-0, user-1, user-2, user-3 |
| 17 | bouncer / percussion + rippler / percussion + loopgrid | melody, accompaniment | user-0, user-1, user-2 |
| 18 | drawgrid / accompaniment + bouncer | rhythm, extraRhythm | user-0, user-1 |
| 19 | drawgrid (sparse) + loopgrid (sparse) | accompaniment, extraRhythm | user-0, user-1 |
| 20 | drawgrid (empty) + rippler | rhythm, accompaniment, extraRhythm | user-1 |
| 21 | bouncer (empty) + loopgrid | melody, accompaniment, extraRhythm | user-1 |
| 22 | rippler (empty) + drawgrid | rhythm, accompaniment, extraRhythm | user-1 |
| 23 | rippler (sparse) | rhythm, accompaniment, extraRhythm | user-0 |
