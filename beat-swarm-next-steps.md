# Beat Swarm – next tasks

## Goal

Make Beat Swarm behave like a **readable retro shmup music arranger**:

* stable layered tune
* recognisable enemy-to-sound identity
* intro bass that has musical variation without becoming unreliable
* slower, more digestible buildup
* Beat Swarm-specific sound theme
* Beat Swarm-specific BPM on entry, restored on exit

---

## 1. Add a Beat Swarm-specific sound theme preset

Create a dedicated Beat Swarm music theme/palette instead of relying on the generic/default toy setup.

### Theme target

A **retro arcade shmup** feel inspired by Zero Wing / Gradius / Thunder Force style music:

* punchy synth bass
* bright arcade lead
* square/arp support
* crisp electronic percussion
* metallic accent/sparkle
* weapon tone that feels gamey and musical

### Required lanes / roles

Set up explicit instrument-role mapping for Beat Swarm:

* `foundation` = retro synth bass
* `kick_or_low_pulse` = short electronic low hit
* `primary_loop` = bright arcade lead / saw-ish lead
* `secondary_loop` = square arp / support riff
* `sparkle` = metallic FM/digital accent
* `player_weapon` = pitched arcade zap / weapon tone

### Codex tasks

* Add a Beat Swarm-specific theme id, something like `beat-swarm-shmup`
* Make Beat Swarm use this theme by default instead of inheriting whatever generic toy palette is active
* Ensure palette / lane-role assignment is explicit, not heuristic where possible
* Keep role colours stable and distinct per lane family

---

## 2. Set Beat Swarm default BPM on entry, and restore previous BPM on exit

Beat Swarm should push the app into a BPM that suits the mode, then cleanly restore the previous value when leaving.

### BPM target

Set Beat Swarm entry BPM to:

* **132 BPM**

This should happen automatically when entering Beat Swarm.

### Behaviour rules

* On entering Beat Swarm:

  * store current global/app BPM
  * set BPM to `132`
* On exiting Beat Swarm:

  * restore the previous BPM that was active before entering
* Do not permanently overwrite the user’s prior BPM
* Avoid repeated reapplication if Beat Swarm internally reloads or remounts

### Codex tasks

* Find Beat Swarm mode enter/exit hooks
* Add `enterBeatSwarmTempo()` logic
* Add `exitBeatSwarmTempoRestore()` logic
* Store previous BPM in Beat Swarm session state, not in a loose global that can be stomped
* Guard against nested re-entry / duplicate restores

### Success criteria

* entering Beat Swarm always sets BPM to 132
* leaving Beat Swarm always restores the prior BPM
* switching in/out repeatedly does not drift or break tempo state

---

## 3. Replace constant bass fallback with pattern-based phrase randomisation

The current intro bass is too often a rigid on-beat pulse. Replace that with the same kind of **pattern randomisation approach** used by DrawGrid and Simple Rhythm toys.

### Important rule

Do **not** randomise each beat independently.

Use:

* phrase library
* phrase selection
* phrase locking
* occasional mutation

### Codex tasks

* Find the randomisation logic used by:

  * DrawGrid random button
  * Simple Rhythm random button
* Reuse the same conceptual model for Beat Swarm foundation generation
* Apply it to **foundation lane phrase creation**, not only optional theme layers
* Audit and remove simple pulse fallbacks like:

  * even-step alternation
  * always-on quarter notes
  * emergency keepalive patterns that flatten to metronome behaviour

### Foundation phrase rules

* choose one phrase from a pattern library
* keep it stable for **4–8 bars**
* only change on **bar boundaries**
* allow rests
* allow occasional offbeats
* no per-step coin-flip randomness

### Example pattern style

Use 8-step or 16-step patterns that feel arcade and punchy, for example:

* strong downbeat with one syncopated hit
* downbeat + gap + later response
* sparse phrase with one pickup
* repeated hook with one rest

The point is:

* recognisable
* musical
* repeatable
* not robotic

---

## 4. Make foundation phrase ownership belong to the lane, not the enemy

Right now the bass still gets flattened or reset too easily when ownership changes.

### Codex tasks

Create or tighten a persistent lane model so that:

* `foundationLane` owns:

  * phrase pattern
  * phrase id
  * continuity id
  * instrument id
  * role colour
  * cycle count
* performer enemy only renders/plays that lane
* enemy death or replacement must not redesign the phrase

### Handoff rules

* inherit phrase by default
* inherit phrase step / bar offset
* inherit continuity id
* only reset when there is an explicit musical reason:

  * section re-orchestration
  * cadence resolution
  * deliberate arrangement change

### Success criteria

* intro bass survives enemy churn without becoming a new pattern every time
* handoffs preserve musical identity
* foundation continuity metrics improve significantly

---

## 5. Add a protected intro arrangement window

Do not let intro bass use the same freedom as the later arranger.

### Intro structure

Implement an explicit first-stage arrangement:

* bars 0–3: player / minimal punctuation
* bars 4–11: foundation only
* bars 12–19: foundation + one primary loop allowed
* only after that: consider support lane / secondary response

### Codex tasks

* Add an intro arrangement plan for Beat Swarm
* Block extra foreground identities during the intro window
* Keep the first foundation phrase stable long enough to register
* Prefer low churn in intro:

  * fewer handoffs
  * fewer new colours
  * fewer new lane admissions

### Success criteria

* player can clearly hear “the bass part”
* player can identify which enemies belong to that part
* intro feels like a tune beginning, not a system waking up chaotically

---

## 6. Slow post-intro layering so the tune builds digestibly

After intro, new ideas are still arriving too fast.

### Codex tasks

Tighten admission rules so that:

* no new major foreground lane enters until the current one has completed at least **2 full cycles**
* minimum spacing between major new ideas = **4 bars**
* after a section change, add a temporary lockout before another major idea may enter

### Adjust caps

Set readable lane caps:

* foundation audible = 1
* primary loop audible = 1
* secondary loop audible = 0–1
* sparkle foreground voices = 1 max

Reduce later-state chaos by tightening pacing-state limits, especially:

* `main_low`
* `main_mid`
* `peak`

Keep later states more musical, not just busier.

---

## 7. Lock enemy instrument/colour identity harder

Enemy identity still needs to read like band membership.

### Codex tasks

* Once an enemy gets:

  * `musicInstrumentId`
  * `enemyRoleColor`
* reject later mutation unless it is part of an explicit re-orchestration event
* log attempted illegal identity rewrites for debugging

### Success criteria

* enemy colour remains stable for life
* enemy sound identity remains stable for life
* lane identity transfers cleanly to a replacement performer when needed

---

## 8. Make sparkle obey the arrangement

Sparkle should decorate, not compete.

### Codex tasks

* duck sparkle during new loop registration
* suppress sparkle when there are already 2 readable foreground lanes
* prevent sparkle from acting like a third melody
* keep sparkle short, light, and subordinate

---

## 9. Add diagnostics for “musicality,” not just reliability

The system is now reliable enough that the next problem is musical shape.

### Codex tasks

Add foundation metrics such as:

* `foundationRestShare`
* `foundationOffbeatShare`
* `foundationUniquePatternCount`
* `foundationPatternChangeRate`
* `foundationConsecutiveOnBeatHits`

Add readability metrics such as:

* `audibleForegroundLaneCount`
* `barsSinceNewForegroundIdea`
* `laneReassignmentRate`
* `enemyColourMutationCount`
* `enemyInstrumentMutationCount`

### Why

We need the lab to tell us:

* is the bass still just a pulse?
* are too many ideas entering too fast?
* are identities visually/musically stable?

---

## 10. Keep the implementation aligned with DrawGrid / Simple Rhythm behaviour

This is important.

### Codex rule

Beat Swarm should use the **same philosophy** as DrawGrid/Simple Rhythm random:

* generate coherent patterns
* preserve them long enough to feel intentional
* mutate occasionally
* avoid per-step chaos

Do not “fake variation” with constant micro-randomness.

---

# Priority order

1. Beat Swarm sound theme preset
2. Beat Swarm entry BPM = 132 / restore on exit
3. Replace bass pulse fallbacks with DrawGrid/Simple Rhythm style pattern selection
4. Make foundation phrase lane-owned, not enemy-owned
5. Add protected intro arrangement window
6. Slow post-intro lane admission and cap foreground ideas
7. Hard-lock enemy instrument/colour identity
8. Sparkle suppression
9. Add musicality/readability diagnostics

---

# One-line brief for Codex

Build Beat Swarm as a **retro shmup track arranger** with its own theme and 132 BPM entry tempo, restoring prior BPM on exit; replace rigid bass pulse fallbacks with DrawGrid/Simple Rhythm style phrase randomisation; keep phrases lane-owned and identity-stable; slow layer admission so the tune builds clearly instead of becoming chaotic.
