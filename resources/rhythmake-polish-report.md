Rhythmake bug-fix and polish pass

- Auto-Arrange DrawGrid phrases render as horizontal chains. Internal Sequence definitions, ordered membership, Linked Copy editing, saved graphs and occurrence harmony remain intact. Explicit, mixed and nested Sequences retain their cards.
- DrawGrid flashes now originate from successful audio admission, carrying the resolved pitch, actual audio onset, note row and visible occurrence owner. A tick-domain queue replaces lookahead flashes and independent effect timers. Both rendering and scheduler service drain the same queue once.
- Playheads derive every position from the owning transport tick and playback occurrence in logical DrawGrid space, for short and long patterns alike.
- Return to Start sits below Play/Pause. It uses the existing transport seek and Sequence retrigger path, invalidates committed lookahead and nested occurrences, clears stale visual state, and preserves authored data and play state. Cancellation now addresses both the audio ID and visible Linked Copy ID.
- Per-toy scheduler reset cursors also apply to newly created occurrence state: tick zero is admitted once after seeking, including a slightly late first scheduler poll.

Files changed: `style.css`, `.gitignore`; `src/audio-samples.js`, `src/chain-sequence.js`, `src/connection-view.js`, `src/graph-placement.js`, `src/heartbeat-view.js`, `src/horizontal-phrases.js`, `src/linked-sequences.js`, `src/main.js`, `src/note-scheduler.js`, `src/structure-runtime.js`, `src/topbar.js`; `src/drawgrid/drawgrid-player.js`, `drawgrid.js`, `dg-playback-phase.js`, `dg-playback-visuals.js`; `tests/rhythmake-polish.test.mjs`, `tests/sequence-audio-cancellation.test.mjs`; `resources/rhythmake-polish-browser-qa.mjs` and the QA artifacts alongside this report.

Validation:

- Full Node suite: 951 tests, 947 passed. Four existing failures are newline-sensitive source-text checks in `beat-swarm-enemy-combat-audio.test.mjs` and `beat-swarm-role-combat-visual-ownership.test.mjs`. Their failed matches read unchanged Beat Swarm source; this pass does not change those tests or that source.
- Targeted transport, DrawGrid, Linked Copy, arrangement, structure, harmony, Bouncer/Rippler timing and placement checks passed.
- Headless Chrome: Intro/A/B/Outro, two expanded linked phrases, extra B percussion and different A/B chords. Repeated zoom, resize/DPR, tempo changes, pause/resume and both reset states passed. A 135-second stress run at 200 BPM reached tick 43,264 (over seven arrangement loops), with 843 DrawGrid flashes matched one-for-one to admitted audio notes and no JavaScript exceptions. See `debug-output/polish-qa/full-report.json`.
- The browser harness also supports `--quick` for transport placement and persistence smoke checks. The stress fixture is `debug-output/polish-qa/stress.scene.json`.
- Final quick browser check: Start was visible, centered beneath Play/Pause and clickable; save/reload preserved authored notes, linked definitions and graph connections. See `debug-output/polish-qa/ui-report.json`. The final targeted Node run passed all 60 tests.

Remaining visual interpolation: particle movement, burst/ring lifetimes, glow decay and cosmetic header disturbances use frame time. They animate an already admitted note; none determines a note onset or advances musical playhead phase. Browser tests verify event ownership and timing, but subjective listening confirmation remains manual.
