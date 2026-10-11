# Heartbeat powered-root semantics

Implemented: every direct Heartbeat child performs simultaneously and cycles its complete finite behavior independently. No new authored nodes or musical algorithms were added.

## 1. Cycling authority

`src/chain-sequence.js` authorizes looping from the actual direct transport connection. `src/structure-graph.js` includes directly powered single toys in the same runtime as structured branches. `src/structure-runtime.js` definitions are finite; starting a definition directly defaults to one occurrence. Nested execution stays bounded by its enclosing structure. The developer Harmony Lab explicitly requests its own listening-bench loop.

## 2. Root anchors

Each performance has a tick-domain start `R`; ordinary cycle starts are `R + N × D`, where `D` is its natural duration. Heartbeat connection ordering never contributes sequencing. One-, two-, and four-bar roots maintain separate schedules. Sequence orders its children, Together groups them, Repeat contributes a finite repetition count, and Timeline retains its offsets.

## 3. Existing toy loops

Directly powered toys now receive bounded playback occurrences through the structure adapter. The main note scheduler already excludes managed toys from standalone scheduling, so it cannot schedule both paths. Bouncer/Rippler providers keep their natural internal rhythm offsets; the scheduler bounds them to the owning occurrence. Existing managed-turn guards suppress callback-driven chain handoffs. Private/legacy standalone paths remain available for callers outside the normal authored graph.

## 4. Live duration edits

Keep the root instance and original anchor. Let `H` be the greater of current tick and committed scheduling horizon, `S` the current occurrence start, `L` its reconciled finite duration, and `D` the new natural duration. Preserve the current occurrence, then choose the next boundary:

`R + ceil((max(H, S + L) - R) / D) × D`

Future cycles use `D` on this original-anchor grid. An earlier boundary covered by committed lookahead is skipped; a brief rest can occur until the next valid boundary. No retroactive activation, shortened-grid drift, or extra old-duration cycle fills that rest. Removed paths are invalidated; unscheduled pitches/context read current authored data. Empty zero-duration structures produce no scheduler loop.

## 5. Disconnect/reconnect

Disconnect stops root generation, invalidates prepared owned occurrences, and leaves the topology disconnected. Existing audio cancellation rules still apply. Reconnection creates a fresh runtime performance: strict next beat while playing, current tick while stopped or paused. Deliberate retrigger preserves this policy across subsequent resynchronization. Pause/resume, tempo changes, and ordinary board interactions retain existing tick anchors.

## 6. Chord Progression

One progression remains a finite complete chord-list section. A directly powered progression automatically produces repeated complete passes. A progression inside Sequence finishes once and yields to the next section; only the containing powered root repeats. Production pitch processing and source data are unchanged.

## 7. Visual energy

The main Heartbeat's clock pulse is unchanged. An independent root-cycle callback triggers the exact transport edge once per root activation, including Timeline lead-in silence and progressions with no child notes. The receiving root uses its normal activation envelope. Toy/nested handoff edges retain their existing feedback without reflashing the Heartbeat edge on every beat or simultaneous child. Feedback waits for playback and does not reflash the same occurrence merely on resume.

## 8. Verification

- Full existing Node regression suite plus new coverage: **863 passed, 0 failed**. Command: `node --test tests/*.test.mjs`. Full output: [heartbeat-tests.txt](debug-output/heartbeat-tests.txt).
- New [heartbeat-roots.test.mjs](../tests/heartbeat-roots.test.mjs): simultaneous roots; independent 1/2/4-bar cycles across 1,000 bars; production scheduler deduplication; finite nested objects; whole root Sequence/Together cycles; root and nested progressions; disconnect invalidation; quantized reconnect/retrigger; live duration growth/shrink; preserved anchors; root feedback and silent lead-ins; authored topology round trip; proof fixture.
- Updated older runtime tests to request repeated performances explicitly. Updated graph tests to include newly managed independent roots instead of assuming unchanged displayed toy instance identities. Full-suite creation UI tests now exercise the existing Advanced Logic popup.
- JavaScript syntax checks and `git diff --check` passed.

### Browser production captures

Using the normal board UI and the shared test page, rather than directly invoking adaptation:

- [Repeated progression](debug-output/harmony-graph-2026-10-11T10-37-53-254Z.json): 322 scheduled events. Harmonic origins advance exactly `0, 1536, 3072, 4608, 6144`; accompaniment repeats C3 → A2 → F3 → G2. Melody stays recognisable, percussion stays C4, and all authored source notes/steps remain unchanged.
- [Independent roots](debug-output/harmony-graph-2026-10-11T10-41-18-518Z.json): 612 scheduled events. All three root anchors are zero. Percussion occurrences are one bar apart; grouped melody starts are `0, 768, 1536, …`; progression origins are `0, 1536, 3072, …`.
- [Live edit and transport](debug-output/harmony-graph-2026-10-11T10-42-52-709Z.json): pause/resume, 120 → 119 BPM, Am → Dm, and collapse/expand preserve all three root performance IDs and zero anchors. Future Dm events play D3. Reload restores three transport connections, Repeat ×2, C | Dm | F | G, tempo 119, and collapsed progression state.

- [Reloaded playback](debug-output/harmony-graph-2026-10-11T10-45-37-070Z.json): restored independent roots cycle again through the normal Play control; the capture includes 722 scheduled events. All three fresh anchors are the restored paused tick, 16798; progression origins advance by exactly 1536 ticks. Runtime counters and instance IDs are newly created.

The independent fixture is [heartbeat-roots.scene.json](heartbeat-roots.scene.json), also selectable as **Heartbeat independent 1 / 2 / 4 bar roots** in [the browser proof page](../tests/harmony-graph-browser.html). The default proof remains progression → Together to verify harmony across the full mix.

Audio evidence here is the production scheduling/pitch capture; automated browser control does not provide a subjective listening assessment.
