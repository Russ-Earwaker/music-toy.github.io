Timing stress pass — 17 October 2026

1. Board minimum user zoom changed from **0.15 to 0.075**. This doubles the visible width and height (four times the area). Effective scale remains responsive base scale × user zoom; logical coordinates and musical ticks are unchanged. Extreme-scale pointer projection is tested for Bouncer and Rippler, including a 0.5 responsive base scale.

2. Bouncer learning could ask for its *next* Sequence turn while its current turn was already starting. Both re-recording and chain-launch paths could also replace the structure-owned playback instance with a standalone instance. Learning now uses a shared anchor helper, retains the current occurrence identity, and uses the assigned launch timestamp. These defects are covered by production-function tests. Browser confirmation of the reported audible delay remains outstanding.

3. Rippler's local clock advanced an overdue bar one render frame at a time, with collision discovery preceding that clock update. This allowed historical learning rings to be processed during catch-up. It now jumps directly to the present bar, updates the clock before collision discovery, skips future/expired rings, and initializes a late ring's collision cursor at its current radius. Restored visual rings cannot discover new musical collisions.

4. Rippler had the same structure-occurrence replacement problem during learning. It now retains the assigned instance, uses the current turn when applicable, and finishes learning when its structural turn ends. No evidence of an extra duration term was found in the compiled Sequence boundaries; the confirmed defects were in learning/activation. Musical learning anchors and ring radius now use transport ticks through pause and tempo rebases.

5. Natural duration for both Bouncer and Rippler is **384 ticks, four beats, one bar**. Visual lifetime, audio tails, lookahead and learning countdowns do not contribute to that duration. DrawGrid remains 384 ticks for 8/16 steps and 1536 ticks for 32 steps.

6. Activation gates an occurrence; shared Heartbeat origin supplies its pattern phase. The existing shared scheduler starts from the current unscheduled window, bounded by occurrence start/end. The provider enumerates only valid events inside that window. A fresh Rippler joining before tick 288 schedules 288 and 384 rather than replaying 0/96/192, even with a stale recording cursor. The new helper distinguishes an active learning turn from a future turn and does not rebase the transport.

7. No changes to the shared note scheduler or Sequence duration arithmetic were needed. Bouncer and Rippler share the new learning-anchor policy. Rippler's local learning clock was corrected separately because it still had an audio-seconds/render catch-up path.

8. **985 tests pass.** Added tests cover one-to-four-toy chains, Repeat ×4, mixed DrawGrid/Bouncer/Rippler chains, insertion/removal/reordering while playing, late joining, reset, pause, tempo mapping and schedules at user zoom 1/0.5/0.25/0.075. Across 42 deterministic runs of 25 cycles: **11,600 expected events, 11,600 audio-dispatch callbacks, 11,600 visual-queue deliveries**, with no accumulated tick drift. These use production compiler/runtime/scheduler/providers with a simulated audio sink. They are not recorded or audible Web Audio measurements. Repeat resume tests model cancellation by resetting the scheduling cursor; real source cancellation has separate existing tests.

9. Learning collision discovery, Bouncer physics capture, springs, particles and presentation still run on serviced frames. Learned pattern replay is tick scheduled. Note-trigger visual events come from admitted audio, but visible rendering can be late after a blocked frame. The current tests do not establish frame-independent first-pass physics learning.

Evidence: `resources/debug-output/timing-stress-tests.txt` and `resources/debug-output/timing-stress-events.json`. Regenerate the detailed timing trace with `$env:TIMING_STRESS_PROOF='1'; node --test tests/timing-stress.test.mjs` from the repository root.

Browser status: two attempts to start the browser runtime failed with **“failed to write kernel assets: The system cannot find the path specified. (os error 3)”**. No browser interaction, audible onset measurement, or manual extreme-zoom verification was completed in this pass. Cables, sockets, header selection, tethers, context menus and camera interaction therefore still need browser proof. The handoff's full manual stop condition has **not** been certified.
