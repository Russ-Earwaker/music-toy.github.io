### Beat Swarm music fix task list

1. **Add a final per-step note arbitration pass**

   * Before any enemy note is actually played, gather all candidate enemy notes for that step and choose which ones survive.
   * Hard cap simultaneous enemy notes by musical role.
   * Suggested priority:

     * foundation bass
     * newly introduced loop notes
     * established loop notes
     * accents / sparkle
     * duplicate or low-value extras get dropped
   * Goal: stop the mix from turning into a pile of valid-but-bad simultaneous notes.

2. **Protect foundation / bass from being ducked too often**

   * Right now bass events are being created and executed, but they’re frequently marked `musicProminence: "quiet"` and often collide with player steps, which makes them feel absent rather than foundational.  
   * Add a rule so foundation is usually `full` unless there is a very strong reason not to be.
   * On steps where player weapon audio overlaps foundation:

     * prefer suppressing less important enemy notes
     * or duck player layer slightly
     * or offset non-foundation enemy notes
   * Do **not** keep sacrificing bass readability.

3. **Create an “establishment window” for new loops**

   * When a new loop/riff is introduced, protect it for at least 2 bars.
   * During that window:

     * it should stay audible
     * it should not instantly be demoted to `trace`
     * avoid replacing it with other loop material too quickly
   * Goal: when a loop enters, the player can actually hear and learn it.

4. **Promote loops out of permanent trace mode**

   * We’re seeing loop events regularly marked as `musicLayer: "loops"` with `musicProminence: "trace"`, which means they exist technically but don’t really read musically. 
   * Add a clearer loop lifecycle:

     * introduced
     * established
     * background support
     * retired
   * Only use `trace` for very low-priority decorative material, not for main riff ideas.

5. **Stop same-note pileups on the same step**

   * Add de-duplication at playback-selection time.
   * If multiple enemy sources want the same note / same register / same role on the same step:

     * keep the best one
     * optionally octave-shift one
     * or merge into a single representative note
   * Goal: prevent stacked identical notes making the mix too loud or ugly.

6. **Strengthen spawner anti-duplication**

   * The perf results show 1 perfect-sync spawner pair and 16 near-duplicate spawner pairs, which matches the “multiples of the same note at the same time” problem. 
   * Existing dedupe is not enough.
   * Add live checks when assigning a new spawner pattern:

     * rhythm similarity against active spawners
     * note similarity against active spawners
     * phase alignment checks
   * Reject or mutate patterns that are too close.

7. **Guarantee one clear foreground musical idea at a time**

   * Decide what the current “foreground idea” is for each phrase/section:

     * bass foundation
     * one loop
     * one accent layer
   * Avoid letting multiple competing riffs all try to lead at once.
   * New loop enters -> it becomes foreground briefly.
   * Existing loop supporting -> it moves to background.
   * Goal: the music feels authored, not accumulated.

8. **Add role-based lane budgets**

   * Define simple budgets such as:

     * 1 foundation event
     * 1 loop lead event
     * 0–1 accent event
     * 0–1 death accent
   * Enforce those budgets in the arbitration pass.
   * This should dramatically reduce clutter without breaking the system.

9. **Improve section-level loop persistence**

   * If a loop is intended to “hang around”, give it a minimum life before replacement.
   * Don’t allow constant churn of loop ownership within the same section unless the section is explicitly chaotic.
   * Add rules like:

     * minimum bars before replacement
     * minimum heard count before retirement
     * avoid replacing a loop before it has properly surfaced

10. **Add better diagnostics for audibility, not just delivery**

* Delivery is not the main problem: created/executed rates are hitting 1.0 for enemy, spawner, and bass events. 
* Add new debug metrics:

  * same-step note collisions
  * same-note same-register collisions
  * suppressed-by-arbitration counts
  * new loop establishment success rate
  * foundation survival rate on player-audible steps
  * average simultaneous audible notes by step
* Goal: measure what is actually heard, not just what was scheduled.

11. **Tune player-vs-enemy masking rules**

* Nearly half of enemy audible events are landing on player-audible steps, so player audio is masking too much of the musical content. 
* Add explicit masking policy:

  * player can dominate accents
  * player should not erase foundation
  * player should not immediately bury newly introduced loops
* Make the music system protect important content from player spam.

12. **Re-test with focused acceptance criteria**

* After implementing the above, run Music Lab again and verify:

  * bass stays clearly present throughout
  * new loop is clearly heard when introduced
  * identical spawner notes are no longer stacked badly
  * fewer steps contain messy simultaneous enemy notes
  * player weapons still feel responsive, but no longer dominate the whole song

### Suggested acceptance criteria

Give Codex this as the success target:

* Bass/foundation should remain clearly audible for the full run unless intentionally dropped for arrangement reasons.
* A newly introduced loop should be clearly heard for at least 2 bars.
* No obvious same-note spawner pileups.
* Enemy notes should sound curated, not accumulated.
* Player weapons/components should enhance the track, not bury the arrangement.

### One-line summary for Codex

**The scheduler is mostly working; now build a musical arbitration/arrangement layer so foundation is protected, loops get establishment time, and duplicate enemy notes are culled before playback.**

