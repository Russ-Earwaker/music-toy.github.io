# Auto-Arrange v1.3

Intro/A/Outro stay unchanged. B retains rhythm, accompaniment, and melody for all four bars under F | G | Am | C, including the existing +12 melody branch. It adds one ordinary Simple Rhythm Master used by one normal linked B Instance. The energy curve is **1 / 3 / 4 / 1 layers**. Duration remains sixteen bars / 6,144 ticks. The graph has eight structures and nine linked Instances, with no extra wrapper for the new percussion part.

The new Master initially uses **HI-HAT CLOSED at 65% toy volume**. It uses Simple Rhythm's normal `toy-random` and `loopgrid:update` events, with a scoped, repeatable random source biased toward complementary/offbeat hits. It is guaranteed audible and distinct from the initial main rhythm, including silent/all-hit main patterns. This is an initializer for one generated fill, rather than a variation engine or special playback system.

**Ownership and edits:** the Master is tagged `autoArrangeOrigin=filled` plus `autoArrangeFill=extra-rhythm` and its Heartbeat identity. It remains editable through normal toy controls. It is excluded from main-rhythm selection. Arrange Again reuses the same extra Master in the current board/Heartbeat, preferring the previous arrangement's source; it does not rerandomise, reset the instrument, or reset volume. Generated topology and the B Instance are replaced normally. Removing the extra Master after removing its linked Instance permits a fresh fill on the next Arrange. Different board/Heartbeat scopes can have separate fills; repeated Arrange in one scope does not accumulate Masters. As with existing fills, created source toys remain editable if a subsequent graph build fails and can be reused by a later attempt.

The extra part is explicitly Percussion, receives no harmonic pitch adaptation, and shows no chord badge. Its B Instance uses the shared Heartbeat phase without entry offsets. Pitched B badges and adaptation retain the existing production path. Master notes are never copied into the Instance.

Fill markers, pattern, instrument, volume and Master/Instance links persist. Browser verification exposed an existing audio-volume save mismatch between panel and audio IDs; persistence now resolves the actual audio ID first, matching the playback/volume-control path. This preserves the supporting gain and later user volume edits across reload.

**Validation:** all 926 tests pass. New coverage checks all 256 eight-step main patterns for repeatability, a distinct audible fill and unchanged main data; B-only scheduling/percussion/phase; the 1/3/4/1 activity curve; source reuse after user edits; normal ownership cleanup; and persistence/regeneration behavior. Browser proof uses normal Arrange, Play, Random, volume controls, Arrange Again and reload, with event logs written to resources.

Reproduce with `node resources/auto-arrange-v1-3-browser-proof.mjs`. [Browser summary and capture filenames](debug-output/auto-arrange-v1-3-browser-proof.json), [full test log](debug-output/auto-arrange-v1-3-full-tests.txt). Browser checks establish actual scheduled parts, saved data and badge behavior; whether the energy lift is sufficient remains a listening judgment.

The browser proof passed: **28 extra closed-hat events** in B, the intended 1/3/4/1 layer count, no independently powered extra Master or percussion chord badge, and the initial 65% gain. A normal Random edit plus a volume change to 66% survived Arrange Again, reload, and another Arrange after reload. All captures retained exactly four Masters, nine Instances and eight structures.

Production files: `src/auto-arrange.js`, `src/auto-arrange-extra-rhythm.js`, `src/grid-core.js`, `src/main.js`, `src/persistence.js`. Tests: `tests/auto-arrange.test.mjs`, `tests/auto-arrange-extra-rhythm.test.mjs`.
