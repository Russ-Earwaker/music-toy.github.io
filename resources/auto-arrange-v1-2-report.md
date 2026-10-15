# Auto-Arrange v1.2

B returns to Together with rhythm, accompaniment and melody active throughout all four bars. Its melody branch contains an ordinary **Transpose +12** node, followed by a linked Instance of the same Melody Master used in A. B retains F | G | Am | C. Intro, A and Outro are unchanged, and the piece remains sixteen bars / 6,144 ticks.

Only the Auto-Arrange recipe/builder changed. The v1.1 staggered Timeline and Repeat branches are no longer generated; Timeline itself and harmony algorithms are unchanged. The generated graph now has eight structures and eight linked Instances. Pitch processing remains source → chord adaptation → explicit transpose → final pitch. Rhythm and accompaniment receive no octave shift. Transpose adds no timing or pattern-phase offsets; all roots and source patterns retain the shared Heartbeat phase.

The chord badge reads occurrence harmony as before, so B's lifted melody shows F → G → Am → C. Source notes remain on the Master. A production-path regression edits the Melody Master to F#4: A and B both adapt it to F4, then B alone outputs F5. The authored F#4 remains intact.

Arrange Again replaces all previously owned structures and Instances, including v1.1's B Timeline and three Repeat branches, while preserving Masters, their edits, and unrelated user topology. Existing saved graphs load as authored; **Arrange Again** applies the v1.2 recipe. Persistence retains the ordinary Together/Transpose topology and ownership metadata.

**Verification:** all 924 tests passed, including nineteen Auto-Arrange tests covering full B density, +12 after adaptation, linked source identity/edit propagation, chord display, two-cycle timing, sixteen-bar duration, longer source patterns, save/reload, rollback, and legacy replacement with an unrelated Timeline preserved. Normal browser Arrange replaced an actual saved v1.1 graph and played the new B through the production scheduler. Exported event checks and reload checks are reproducible with `node resources/auto-arrange-v1-2-browser-proof.mjs`.

The browser checker passed for **504 scheduled events**, including **78 B melody events** at exactly +12 after adaptation. It confirmed all three parts in every A/B bar, actual B chord badges, preserved Master state, removal of the old generated topology, and identical saved/reloaded connections. These checks verify production note decisions, section activity and chord display. Musical perception of the section lift remains a listening judgment.

Changed production file: `src/auto-arrange.js`. Coverage: `tests/auto-arrange.test.mjs`, `tests/harmony-graph-browser.html`. [Browser summary and raw capture filenames](debug-output/auto-arrange-v1-2-browser-proof.json), [Auto-Arrange test log](debug-output/auto-arrange-v1-2-tests.txt), [full test log](debug-output/auto-arrange-v1-2-full-tests.txt).
