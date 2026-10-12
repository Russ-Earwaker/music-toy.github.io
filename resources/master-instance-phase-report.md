# Master / Instance clarity and source phase

Implemented October 12, 2026. No harmony mapping or authored source notes changed.

## Relationship inspection

One reveal controller (`src/toy-relationship-reveal.js`) handles header taps and See Master. An Instance tap flashes that Instance and its Master. A Master tap flashes its visible Instances. See Master reveals the pair, then uses existing Master focus/selection/panning.

The reveal follows pointer-down through pointer-up, ignoring movement over 8 pixels. This survives Overview focusing moving the header before a native click completes. Header controls retain their own actions. Linked Master names remain visible and tappable in Overview.

Temporary curved SVG tethers are prepended to the toys' world container at z-index 0, below ordinary connection SVGs (120) and nodes. They use the shared instrument colour, desaturated with reduced opacity and a dashed stroke. They have no sockets, midpoint, hit targets, or model entries. Pointer events are disabled; SVGs are hidden from accessibility navigation. All effects are removed after 1.8 seconds. At most 12 visible Instance tethers appear simultaneously; repeated inspection replaces the previous effect. Normal playback does not call this controller.

## Phase authority and calculation

`src/source-phase.js` defines a shared policy for each linked Master in each transport domain: **transport tick zero is the stable source-pattern anchor**. It is derived, not a connection timestamp or additional persisted runtime object. Existing persisted Master links, Instance serials, transport identities and tick positions reconstruct it after reload.

Occurrence `startTick` still gates activation. `sourcePhaseOriginTick` separately controls the pattern position:

```
phase = positiveModulo(transportTick - explicitStructuralOffset, sourceLoopLength)
```

The scheduler, playback-column helpers and Chord Wheel/Bouncer/Rippler event providers use that authority. Structure turns receive it before becoming visible; standalone Instances and Masters receive it during preparation. Unlinked toys retain their existing timing policy.

## Reconnection and edits

Reconnection to a playing Heartbeat retains the existing strict next-beat activation policy (96 ticks per beat). Notes start at the first source event at or after that gate, using the existing transport phase rather than step 1. Paused creation/reconnection uses the retained transport tick. Structures still decide when a child becomes active.

Master edits feed future unscheduled callbacks without resetting the transport or phase. When the source publishes a new loop length `L`, its position becomes `(tick - explicitOffset) mod L`; it does not gain a fresh connection-time anchor. Existing committed events retain their scheduling policy. Pattern data stays on the Master.

## Intentional offsets and independent clocks

Authored Timeline offsets and Sequence stagger offsets accumulate through nested layouts into `explicitPhaseOffsetTicks`. Bar-compatible Sequence boundaries therefore remain aligned, while deliberate half-bar delays remain shifted. Together contributes no offset. Repeat and progression fill retain their natural source cycles and activation windows.

Instances on another Heartbeat use that Heartbeat's independent tick clock. No transport is sought, restarted or rebased to synchronize it with a different domain. Pause/resume and BPM conversion change audio-time mapping while retaining musical tick phase.

## Verification

- **902 tests passed**, including 10 new phase/reveal tests: staggered activation, gate boundaries, reconnection, real transport pause/BPM/save state, Master revisions, loop-length remapping, nested Timeline/Sequence offsets, independent clocks, irregular providers, relationship targets, inert capped tethers and drag rejection. Existing Auto-Arrange musical and persistence tests passed.
- Browser fixture: an obvious ascending/descending Piano motif on one Master, two Instances in Together, and a third Instance duplicated during playback. All **170** captured notes from the new Instance matched the shared tick phase.
- Actual header taps and See Master produced the required pair/family flashes and shared-colour, noninteractive tethers. See Master selected/focused the Master.
- Normal UI pause/resume and 120 → 121 BPM change, followed by reload, preserved source steps.
- Auto-Arrange restored its seven structures and eight Instances. Three Masters were then powered directly during playback. **437** captured Master/Instance pairs matched source steps and source pitches at shared ticks. All three roles and four chord roots remained present; accompaniment followed the progression and percussion remained unchanged.
- Reproducible checker: `node resources/source-phase-browser-proof.mjs`. It verified **3,350 pitched events** across the saved browser captures. Summary: `resources/debug-output/source-phase-browser-proof.json`. Full test output: `resources/debug-output/source-phase-full-tests.txt`.

Browser QA observed the real production scheduling/audio path; it is not a subjective listening assessment. Some late-polled events showed up to **21.3 ms** of audio-start spread from the existing `safeStartTime` per-note clamp. Their musical ticks and source steps still matched. That general late-scheduling jitter was measured separately and was not changed in this phase pass.

## Changed files

New shared policies: `src/source-phase.js`, `src/toy-relationship-reveal.js`.

Integration: `src/toy-instances.js`, `src/playback-instances.js`, `src/note-scheduler.js`, `src/chain-sequence.js`, `src/structure-runtime.js`, `src/bouncer-transport.js`, `src/ripplesynth-transport.js`, `style.css`.

Coverage and artifacts: `tests/source-phase.test.mjs`, `tests/harmony-graph-browser.html`, this report, browser proof script and captured logs under `resources/debug-output`.
