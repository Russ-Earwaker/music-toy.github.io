# Beat Swarm - next tasks

## Goal

Make Beat Swarm behave like a **readable retro shmup arranger** where:

* the intro sounds like a real tune starting
* bass and loops can establish clearly
* gameplay can speed up or thin out without breaking the music
* spawners and composition groups can preserve groove when battlefield state changes
* special/boss enemies add controlled flourish rather than chaos
* future player-authored toy patterns can eventually be mapped into the system without redesigning everything

---

## 1. Baseline to preserve

These systems already exist and should be preserved while iterating:

* Beat Swarm-specific theme preset and role defaults
* entry BPM on mode enter, with restore-on-exit
* explicit lane ownership and source-to-lane mapping
* controlled palette variation within stable role/lane identity

These are not the current implementation priority unless a regression is found.

### Follow-up cleanup: remove heuristic ownership from critical paths

### Task

Tighten role/lane assignment so primary musical ownership in critical Beat Swarm paths does not depend on catalog or fallback heuristics.

### Notes

Stable role/lane ownership should be explicit for foundation, loop leadership, pulse/drum roles, and major foreground claims.

Palette reseeds may vary timbre within a locked role, but should not change musical ownership.

Heuristic fallback is acceptable only for non-critical decoration or clearly marked fallback cases.

### Goal

Preserve Beat Swarm's authored musical model and avoid ownership drift caused by inference.

---

## 2. Rebuild intro drums as a real loop, not just event traffic

This is now high priority.

### Tasks

* Create a proper intro drum-pattern owner.
* Generate a **4-bar or 8-bar loop** using the same pattern philosophy as Simple Rhythm / DrawGrid random:

  * coherent
  * repeatable
  * phrase-based
  * not per-step chaos
* Do not regenerate constantly.
* Allow only light mutation on phrase boundaries.

### Ownership

* Prefer **spawners** as the machine-pulse/drum source.
* Allow **composition groups** to continue the drum loop if the gameplay source disappears or pacing changes.

### Goal

The first bars should feel like an actual arcade loop beginning, not just player events on the grid. The intro timeline is still dominated by `player-weapon-step` events in `intro_solo`, which supports your concern here.

---

## 3. Keep bass phrase generation pattern-based, but make it lane-owned and continuation-safe

This stays from the old plan, but with a clearer continuity goal.

### Tasks

* Keep using phrase/pattern selection instead of beat-by-beat randomisation.
* Make the **foundation lane** own:

  * phrase pattern
  * phrase id
  * step offset
  * continuity id
  * instrument role
* Performer enemies should render the lane, not define it.
* When a performer dies or disappears, prefer a **composition group handoff** before redesigning the phrase.

### Important

Do not flatten back into quarter-note keepalive just because the battlefield gets awkward.

### Goal

Bass should survive churn as a musical phrase, not as a series of emergency replacements. Current lab still shows `foundationProminence: heavily_ducked`, `bassFoundation: at_risk`, and `maxEnemyStepsWithoutBass: 27`, so this is still not solved.

---

## 4. Formalise composition groups as the musical continuity buffer

This is your new direction, and I think it's the right one.

### Tasks

* Make composition groups responsible for:

  * phrase continuation
  * loop completion
  * handoff smoothing
  * temporary coverage when gameplay actors can't maintain the musical part
* Use them to preserve:

  * drum loops
  * snake melodies
  * bass ostinatos
* Do not let them become the main source of all interesting music all the time.

### Rules

* Gameplay actors can **introduce** or **suggest** an idea.
* Composition groups can **continue** it long enough for it to read.
* When live gameplay support returns, hand musical ownership back cleanly.

### Goal

Gameplay pacing can stay free to change without constantly breaking musical obligations.

---

## 5. Split timing authority properly: fire/spawn can be musical, impacts stay gameplay-driven

This replaces the too-broad "align all gameplay events to the beat" idea.

### Tasks

Treat events in two classes:

**Musically authored / grid-eligible**

* player fire trigger
* hitscan fire
* enemy spawn cues
* loop note emissions
* special telegraph accents
* composition-group continuation notes

**Gameplay-authored / not forced to grid**

* moving projectile impacts
* collision hits
* physics-driven contact moments
* anything whose timing comes from world simulation

### Current status

This is now partially implemented:

* `musicAuthoredEvents` vs `gameplayAuthoredEvents` are tracked in diagnostics
* direct gameplay sound families are being thinned in dense established sections
* impact and death accents now use short cooldown/priority handling so they read more like punctuation than a parallel rhythm layer

### Next refinement

Keep refining by family only if lab evidence says one family is still dominating bars that should stay grid-led.

### Goal

Keep the groove strong without making projectile travel feel fake.

### Notes

The player weapon layer is still logged as `player-weapon-step` with `guided_fire`, so the fire stage is already partly musically authored.

---

## 6. Replace crude per-step hard caps with lane-aware collision control

This is the big correction to the old doc.

### Do not do

* one-note-only style caps that kill percussion layering

### Do instead

Per step, allow:

* one clear foundation voice
* one clear foreground melodic owner
* multiple percussion/support voices where sensible

But suppress:

* identical same-note same-role pileups
* too many simultaneous foreground claims
* duplicate melodic voices in the same register
* redundant accents that add volume without clarity

### Goal

Preserve drum-machine richness while stopping mush.

---

## 7. Make spawners more drum-machine-like

This remains a strong direction.

### Tasks

* Bias spawners toward:

  * kick / low pulse
  * snare / punctuation
  * hats / machine motion
  * simple repeatable step patterns
* Reduce their tendency to behave like free melodic contributors.
* Use them as the primary source of rhythmic machine energy.

### Rules

* spawners = pulse
* composition groups = continuation and phrase support
* drawsnake / loop systems = melodic identity
* specials / bosses = flourish and disruption

### Goal

Make the system sound more like a shmup track and less like many equal note emitters.

Earlier runs already showed spawner bass events acting as foundation on `spawner-spawn`, which is a useful base to lean into.

---

## 8. Give each enemy class a rhythm privilege tier

This is one of the biggest musical-model wins available now.

### Tasks

Define rhythm rights by enemy class:

* **fodder/common**: quarters and simple 8ths
* **medium/special**: syncopated 8ths, pickups, offbeat accents
* **elite**: occasional short 16th flourishes
* **boss**: controlled 16th-note phrases, attack tells, fills, cadential bursts

### Important

* 16ths are a privilege, not the default.
* Boss/special density should come in phrase moments, not permanently.

### Goal

More arcade authored feel, less generic procedural clutter.

---

## 9. Protect the intro arrangement harder

Keep this from the old doc, but wire it through the new ownership model.

### Suggested intro plan

* bars 0-3: pulse setup / player punctuation / very light machine rhythm
* bars 4-11: foundation established clearly
* bars 12-19: allow one primary melodic loop
* only after that: allow secondary support and extra response

### Tasks

* prevent too many foreground ideas during intro
* keep intro bass phrase stable
* use composition groups to preserve the first strong ideas if gameplay churns

### Goal

The player should be able to say:

* "that's the bass"
* "that's the loop"
* "that's the pulse"

---

## 10. Slow post-intro admissions, but think in phrases not just counts

This stays relevant.

### Tasks

* no new major foreground idea until the current one has had time to register
* minimum spacing between major foreground arrivals
* after a section change, add a short lockout before another major idea can claim foreground
* let composition groups carry existing material during the lockout if needed

### Goal

The tune builds digestibly instead of constantly introducing fresh claims.

The current lab still reports `readabilityDensity: busy`, which means this still needs work.

---

## 11. Stabilise enemy identity, but let lane identity be the stronger truth

This stays, with one refinement.

### Tasks

* keep enemy colour/instrument stable during life unless there is explicit re-orchestration
* log illegal identity drift
* make lane identity even more stable than performer identity
* when handoff happens, the replacement should inherit enough of the lane identity that the player hears continuity rather than "new random sound"

### Goal

Band membership stays readable.

Current lab still reports `identityStability: drift`, so this remains relevant.

---

## 12. Make sparkle and death accents obey the arrangement

Still relevant.

### Tasks

* duck sparkle during loop registration
* cap sparkle as decoration, not melody
* limit death-accent spam
* vary death accents more intelligently, or suppress most of them when the foreground is already busy

### Current status

Death-accent discipline is partly in place via gameplay-family suppression and cooldown windows. This section remains relevant mainly as a tuning pass, not as a missing system.

### Goal

Decoration supports the tune instead of stepping on it.

Death accents are still showing up as repeated `TONE` accents in the logs, so this is still worth cleaning up.

---

## 13. Expand diagnostics toward musical ownership and continuity

Keep the old diagnostics push, but add the new model's needs.

This is now the next implementation priority.

### Add metrics for

* foundationRestShare
* foundationOffbeatShare
* foundationPatternChangeRate
* audibleForegroundLaneCount
* barsSinceNewForegroundIdea
* laneReassignmentRate
* same-note same-role collisions
* same-register melodic collisions
* composition-group handoff count
* phrase-completed-by-buffer count
* phrase-broken-before-resolution count
* fire-authored vs impact-authored event counts
* boss/special 16th-note usage rate

### Focus now

Add ownership-drift diagnostics that make it obvious when:

* a lane changes owner without a musical reason
* a lane changes instrument without an intentional re-orchestration
* a lane changes pattern/phrase identity unexpectedly under combat churn
* a handoff succeeds mechanically but still sounds like a new random part

### Goal

Let the lab tell us whether the music is arranged well, not just whether events fired.

---

## 14. Keep future toy-import compatibility as a design constraint

Do not implement yet, but avoid blocking it.

### Tasks

Design Beat Swarm pattern data so it can eventually accept:

* rhythm grid
* note set / pitch choices
* phrase identity
* lane assignment
* mutation rules

from a toy-authored source like Simple Rhythm.

### Important

Beat Swarm should be able to **adapt** imported patterns, not necessarily play them raw.

### Goal

Later, a player-authored toy pattern can be rolled into Beat Swarm without breaking the arranger.

---

# Priority order

1. Intro drums as a real loop
2. Composition groups as continuity buffer
3. Bass phrase continuity and lane ownership
4. Timing split: musical fire/spawn vs gameplay impacts
5. Ownership-drift diagnostics and handoff clarity
6. Replace hard caps with collision control
7. Make spawners more drum-machine-like
8. Rhythm privilege tiers by enemy class
9. Protect intro arrangement
10. Slow post-intro admissions
11. Sparkle / death-accent discipline
12. Better musical diagnostics
13. Future toy-import-compatible pattern format

# One-line brief for Codex

Build Beat Swarm as a **retro shmup arranger with continuity**: let spawners provide machine pulse, let composition groups preserve phrases when gameplay gets messy, keep bass and loops lane-owned and readable, grid-author fire/spawn events but not physical impacts, and control collisions by musical lane rather than crude one-note-per-step caps.
