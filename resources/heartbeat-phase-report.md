# Shared Heartbeat phase

Implemented October 12, 2026. This generalizes the previous Master/Instance phase policy to every powered toy and structure. No harmony algorithms or source notes changed.

## Timing rules

1. **Authority:** transport tick zero is each Heartbeat's stable musical origin. Activation gates remain separate. Pause, BPM changes and seeks change the audio-time mapping or current position, never the phase origin. Separate Heartbeats retain independent clocks.
2. **Late joins:** live connections activate on the existing strict next beat. Pattern position is `(tick - explicit Timeline offset) mod natural loop length`. A connection does not restart an existing root or establish a private phase. Pending topology edits before activation use the latest uncommitted layout.
3. **Structures:** direct roots form implicit Together and retain their natural lengths, including polymeter. Together and Repeat follow the shared origin. Sequence still gates children in order, but children use global pattern phase; the old Sequence-specific phase shift is removed. Timeline deliberately shifts both its gate and pattern phase, with nested authored offsets accumulating.
4. **Harmony:** chord context resolves from the actual event tick within the canonical progression cycle. A late progression joins the current chord rather than starting again at C. Explicit transpose still follows harmony adaptation.
5. **Recorded toys:** Bouncer and Rippler replay their recorded event offsets against the shared origin and activation gate. Recording-relative offsets and authored geometry remain intact; physics is unchanged. Grid-family toys and Chord Wheel use the same phase policy.
6. **Transport and edits:** disconnect removes future occurrences; reconnect rejoins shared phase. Return to Start selects tick zero; seeking selects the corresponding structure and source position. Pause/resume and BPM changes retain phase. Already committed audio follows the existing scheduling policy.
7. **Persistence and feedback:** authored connections, loops, Timeline offsets and progression data persist as before. Runtime activation/phase metadata is not saved with toys. Reload reconstructs the shared policy. Initial root pulses use the activation gate even when the canonical cycle began earlier, preserving connection feedback.
8. **Verification:** 912 tests pass, including ten new production-path regressions covering unrelated toys, mixed root lengths, nested structures, Timeline offsets, disconnect/reconnect, pending edits, seek/Return to Start, late harmony, polymeter, recorded providers and real transport pause/BPM behavior. Browser checks use the normal creation, Arrange, Play, Pause, tempo and reload controls, with observations exported through the repository harness.

## Browser evidence

An unrelated eight-step Piano motif joined at tick **5472**, on **step 2**, matching the already playing motif. The existing root retained its runtime identity and activation tick. Normal pause/resume, a 120 to 121 BPM change, and reload retained matching source positions. A separate fixture exercised simultaneous one-, two- and four-bar roots. The Auto-Arrange capture exercises the existing seven-structure/eight-Instance arrangement with all three musical roles and all four chord roots. The exported-event checker passed: **4,049 events** verified and **1,421 paired independent-toy notes** matched. Accompaniment followed C3/A2/F3/G2; percussion source and final pitches matched. `git diff --check` passed.

Run `node resources/heartbeat-phase-browser-proof.mjs` to check exported events. Its summary is saved in `debug-output/heartbeat-phase-browser-proof.json`; raw browser captures are named there. Full test output is in `debug-output/heartbeat-phase-full-tests.txt`.

These checks establish scheduling decisions and source-note consistency, not a subjective listening judgment. The existing per-note late scheduling safety clamp can introduce small wall-clock jitter when a browser poll is late; it has not been retuned in this phase-policy task.
