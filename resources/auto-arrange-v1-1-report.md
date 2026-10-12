# Auto-Arrange v1.1

Intro and Outro remain four bars of accompaniment. A remains four bars of Together with rhythm, accompaniment and melody entering together. B now uses Timeline under F | G | Am | C:

| B bar | Active parts |
| --- | --- |
| 1 / F | Accompaniment |
| 2 / G | Accompaniment + rhythm |
| 3 / Am | Accompaniment + rhythm + melody |
| 4 / C | Accompaniment + rhythm + melody |

Timeline offsets are 0, 384 and 768 ticks. One existing Repeat per B branch keeps that source playing to the section boundary: ×4, ×3 and ×2 for one-bar toys. Counts derive from the Master's existing natural loop length; longer sources need fewer repeats, and the existing progression boundary clips an incomplete final cycle. Offsets are authored explicitly during the atomic build, before Timeline refresh can derive default sequential entries.

The resulting graph uses ten structures and the same eight linked Instances as v1. The three extra structures are reusable Repeat branches, rather than per-bar objects. No new node types, source-note copies, music generation or harmony mappings were added. All source edits remain on the three editable Masters. Arrange Again retains its existing ownership/replacement behavior and records recipe version 1.1; existing saved arrangements continue loading as authored.

Heartbeat origin remains tick zero. B's Timeline offsets are the only deliberate pattern-phase shifts; A, Intro and Outro acquire no activation-time origins. Chord badges continue resolving the active occurrence: B accompaniment shows F → G → Am → C, while melody shows Am → C after entering in bar 3. Percussion has no badge. The full piece remains 6,144 ticks / sixteen bars and loops normally.

**Verification:** 55 targeted tests and all 922 tests passed. Coverage includes Intro/A/B/Outro activity by bar, linked source identity and unchanged notes, sustained staggered layers, longer natural patterns, Timeline phase offsets over two cycles, event-time harmony and badges, total duration, persistence, Arrange Again and rollback. Persistence coverage uses the same suspended restore boundary as production so authored Timeline offsets survive restoration.

Normal browser Arrange/Play exports confirm the intended audible event membership in every bar, the pitched badge sequences, ten structures/eight Instances, and shared root phase. Arrange Again and reload are checked against saved graph IDs, source states and offsets by `node resources/auto-arrange-v1-1-browser-proof.mjs`. This proves production scheduling and presentation; subjective evaluation of the musical contrast remains a listening judgment.

Changed production file: `src/auto-arrange.js`. Tests: `tests/auto-arrange.test.mjs`. [Browser proof and capture filenames](debug-output/auto-arrange-v1-1-browser-proof.json), [targeted results](debug-output/auto-arrange-v1-1-tests.txt), [full results](debug-output/auto-arrange-v1-1-full-tests.txt).
