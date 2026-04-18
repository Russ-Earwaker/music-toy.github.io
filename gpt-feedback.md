
---

# Beat Swarm First Level Integration Plan

## Core goal

Build the **first complete Beat Swarm level** as a single controlled musical/gameplay arc using the systems that already exist, rather than adding more parallel logic.

The level should feel like:

1. **intro teaching**
2. **groove establishment**
3. **lead arrival**
4. **texture expansion**
5. **one clear authored event moment**
6. **escalation**
7. **pre-boss transition**
8. **boss entry**

The main architectural rule is:

> Existing systems should remain the executors.
> One thin level conductor layer should become the authority.

That means we are **not** replacing:

* motif generation
* lane arbitration
* carrier embodiment
* call/response
* fallback continuity
* formation spawning
* behavior runtime

We are making one layer decide:

* what phase the level is in
* which musical roles must exist
* how much pressure is allowed
* which event section is allowed
* which visual/combat behaviors are appropriate
* when the level is preparing for boss

---

## Why this is the right next step

Right now the code already has the beginnings of the unification layer:

* `evaluateBeatSwarmMusicModeRuntime(...)`
* `evaluateBeatSwarmEnemyDirectorRuntime(...)`
* `evaluateBeatSwarmEventSectionRuntime(...)`

It also already has:

* explicit music modes like `intro_pulse`, `intro_backbeat_bridge`, `lead_entry_merge`, `full_texture`
* role-based behavior assignment
* formation archetypes
* event behavior support
* active runtime/debug output

So the missing work is **not more infrastructure**.

The missing work is:

* choosing a single level flow
* deciding which runtime owns what
* preventing local good decisions from producing a globally muddy result

In other words, this plan is about **authority, sequencing, and restraint**.

---

# 1. Define the first level as one explicit phase timeline

## What Codex should do

Add one explicit **first-level phase model** on top of the existing music mode / enemy director / event section runtime.

This should be a simple phase enum or state object, something like:

* `intro_teach`
* `groove_establish`
* `lead_merge`
* `full_texture`
* `event_showcase`
* `escalation`
* `pre_boss`
* `boss_entry`

Do **not** make this a second giant director.
It should be a **small top-level layer** that feeds the existing runtime.

## Why

At the moment, several systems infer sensible state from:

* intro stage
* bar count
* active lead
* pressure
* event windows

That is good for local adaptation, but it does not yet guarantee a strong first-level arc.

A top-level phase layer gives the project:

* a shared answer to “where are we in the level?”
* a clean place to author the first run
* a way to coordinate music, enemies, and event moments without hardcoding everything into unrelated files

## Recommended phase timing

For a first pass, use a **rough 3-minute arcade-like stage**, around **48–64 bars** depending on BPM.

Suggested structure:

### Phase 1 — Intro teach

Purpose:

* teach the player the pulse
* make the opening legible
* avoid clutter

Require:

* `foundation` only at first
* then `secondary_loop_rhythm`

Avoid:

* no ornament
* no dense multi-family pressure
* no event sections

### Phase 2 — Groove establish

Purpose:

* confirm the run now has a stable groove
* let the player understand the battlefield language

Require:

* foundation remains trackable
* one clear backbeat / counter-rhythm embodiment
* stable readable formations

Avoid:

* still no ornament by default
* lead not yet dominant unless conditions are clean

### Phase 3 — Lead merge

Purpose:

* introduce the main lead while keeping support alive underneath

Require:

* real `primary_loop_lead`
* real rhythmic `secondary_loop`
* fixed merge bridge window
* support cannot collapse just because lead appeared

Avoid:

* no decorative chaos
* do not allow ornament duplication
* do not let lead become the only audible truth

### Phase 4 — Full texture

Purpose:

* allow the baseline intended texture:

  * foundation
  * counter-rhythm
  * lead
  * answer / ornament

Require:

* exactly one lead foreground
* at most one answer/ornament support presence
* stable readable role embodiment

Avoid:

* do not let ornament read as co-lead
* do not let support swamp the lead
* do not let the stage become flat constant pressure

### Phase 5 — Event showcase

Purpose:

* present one clearly authored-feeling section

Use:

* only the safe event section first: `beat_bounce`

Require:

* event should be felt visually and musically
* event is temporary
* event enhances the current texture rather than replacing the whole level logic

Avoid:

* do not add `hold_then_surge`
* do not add `dance_phrase`
* do not add bass-drop style structure changes yet

### Phase 6 — Escalation

Purpose:

* raise difficulty and density
* make the player feel the stage is advancing

Require:

* stronger behavior density
* more aggressive formations
* maintained legibility of roles
* controlled wave energy, not flat constant saturation

Avoid:

* do not break role clarity for spectacle
* do not introduce multiple foreground musical ideas at once

### Phase 7 — Pre-boss

Purpose:

* prepare the boss musically and visually

Require:

* thinning or narrowing of the field
* obvious reset of expectation
* stronger preparation of rhythm/foundation
* reduced ornament

Avoid:

* don’t drift straight from escalation into boss without contrast

### Phase 8 — Boss entry

Purpose:

* hand off authority to boss mode cleanly

Require:

* boss-specific music mode
* boss-specific pressure policy
* boss-specific lane policy

Avoid:

* boss should not feel like “just more stage enemies”

---

# 2. Make one file the authority for the phase plan

## What Codex should do

Put the top-level phase evaluation in **`beat-swarm-mode.js`**.

That file already contains the clearest seeds of the unified runtime:

* music mode evaluation
* enemy director runtime evaluation
* event section evaluation

Add something like:

* `evaluateBeatSwarmLevelPhaseRuntime(...)`

And make that function return a small state object, for example:

* `activeLevelPhase`
* `phaseEnteredBar`
* `phaseTransitionReason`
* `phaseTargetPressure`
* `phaseAllowsEventSection`
* `phaseTargetRoles`
* `phaseCombatStyle`
* `phaseBossPrepActive`

## Why

You already have a partial state layer in `beat-swarm-mode.js`.
That file is the natural place for top-level orchestration because it is already mediating between music logic and enemy logic.

This avoids the current risk of having:

* one runtime infer phase from music
* another infer from bar count
* another infer from encounter pressure
* another infer from event window

That fragmentation is exactly how the level ends up technically valid but perceptually mushy.

---

# 3. Make phase drive music mode, not replace it

## What Codex should do

Do **not** remove `evaluateBeatSwarmMusicModeRuntime(...)`.

Instead:

* keep music mode as the **musical substate**
* keep level phase as the **authored macro state**

For example:

* `intro_teach` may allow:

  * `intro_pulse`
  * then `intro_backbeat_bridge`

* `lead_merge` should strongly imply:

  * `lead_entry_merge`

* `full_texture` should permit:

  * `full_texture`

* `boss_entry` should eventually enforce:

  * `boss_rhythm_override`

## Why

This keeps the current architecture sane.

The level phase should answer:

* what part of the run are we in?

The music mode should answer:

* what musical continuity rules currently apply?

That separation is useful:

* phase is authored and broad
* music mode is musical and operational

If phase replaces music mode entirely, you lose the nuance that already exists.
If music mode remains the only high-level state, you still don’t have a true first-level script.

---

# 4. Make phase drive enemy director ceilings and targets

## What Codex should do

Adjust `evaluateBeatSwarmEnemyDirectorRuntime(...)` so it still computes smart local behavior, but it now reads **phase policy** for:

* target pressure ceiling
* min/max alive ranges
* allowed role counts
* preferred enemy family emphasis
* allowed ornament count
* behavior density ceiling
* whether an event section is eligible

Examples:

### Intro teach

* low target pressure
* narrow alive range
* foundation/body emphasis
* almost no ornament
* restrained single behaviors
* little or no group behavior

### Lead merge

* moderate pressure
* protect support embodiment
* allow one lead
* suppress excess ornament
* avoid multi-foreground clutter

### Full texture

* allow answer/ornament
* allow more behavior density
* allow one event section when window is right

### Pre-boss

* reduce battlefield clutter
* shift emphasis toward more stable structural roles
* lower ornament
* prepare a clearer rhythmic identity

## Why

Right now the enemy director runtime is already doing useful work:

* pressure
* family variety pressure
* target role counts
* behavior intensity
* role-based behavior assignment

The problem is not that it is bad.
The problem is that it is trying to infer “what this moment should feel like” from local state.

Phase policy gives it a **clear mood ceiling**.

That makes the system much easier to reason about:

* local runtime still adapts
* but it adapts inside authored bounds

---

# 5. Define the first level’s target role grammar

## What Codex should do

Lock the first-level musical role grammar explicitly:

### Baseline target grammar

* `foundation_groove`
* `counter_rhythm`
* `lead_phrase`
* `answer_ornament`

### Rules

* exactly one foreground `lead_phrase`
* at most one `answer_ornament`
* `answer_ornament` is subordinate by default
* `foundation` must never become perceptually secondary to ornament
* `counter_rhythm` must survive lead entry during merge and after

### Phase-specific grammar

* intro: foundation only, then foundation + counter-rhythm
* lead merge: foundation + counter-rhythm + lead
* full texture: add answer/ornament only after merge stability
* pre-boss: narrow back down before boss
* boss: likely foundation + boss rhythm emphasis first

## Why

This directly addresses the current failure mode described in your docs:

* the system settles into flatter shapes
* support can over-duck after lead entry
* answer/ornament can duplicate or read like peer lead
* the run can become locally correct but structurally thin

You need the first level to teach the player a stable musical grammar.
That means the game should not be “discovering” the grammar live every run.

The generative system should vary content **inside** that grammar.

---

# 6. Treat `beat_bounce` as the only approved authored event section for level one

## What Codex should do

For the first complete level, only permit:

* `beat_bounce`

Defer:

* `hold_then_surge`
* `dance_phrase`
* anything bass-drop-like
* any event section that requires stronger battlefield restructuring

Use the phase layer to enable `beat_bounce` only during:

* later full texture
* or early escalation

Keep it:

* short
* legible
* clearly prepared
* clearly exited

## Why

The code already supports this as the safest real event section:

* the event section runtime already knows `beat_bounce`
* the enemy update/runtime already understands it
* the formation mapping already routes it

This is important because you do **not** need a library of event sections yet.
You need **one event section that reliably reads**.

Adding more section types now increases surface area and ambiguity without proving the level is coherent.

---

# 7. Use formations as role legibility tools, not just spawn variation

## What Codex should do

Treat formation selection as part of the first-level readability plan.

Preserve the role-to-formation associations that already exist and reinforce them:

* `foundation` → anchor / line stability
* `counter_rhythm` → repeated patterned group shape
* `lead_phrase` → arc / advancing readable phrase carrier
* `answer_ornament` → lighter echo / companion presentation

Then add phase constraints:

### Intro / groove

* pick the simplest most readable formation variants

### Lead merge

* avoid formations that visually compete with the lead
* preserve support without visual clutter

### Full texture / escalation

* allow more expressive forms
* but keep one dominant visual phrase at a time

## Why

This is how you make the screen teach the music.

The first level does not need maximum variety.
It needs **visual-musical correspondence**:

* the player should be able to see which thing is the pulse
* which thing is the answer
* which thing is the foreground phrase

The existing formation system is already close to being the right mechanism for that.

---

# 8. Scope single / group / event behaviors by phase

## What Codex should do

Keep the current three-scope behavior idea:

* single enemy behavior
* group behavior
* event behavior

But gate them by phase.

### Intro teach

* singles: restrained
* groups: very limited
* events: none

### Groove establish

* singles: light expressive motion
* groups: maybe one stable rhythm behavior
* events: none

### Lead merge

* singles: moderate
* groups: restricted to support legibility
* events: none

### Full texture

* singles: expressive
* groups: allowed for lead or support if readable
* events: one safe event allowed when scheduled

### Escalation

* singles: expressive
* groups: stronger, but under pressure ceiling
* events: only if not already recently used

### Pre-boss

* simplify again

## Why

Without phase gating, the behavior system can easily produce:

* too much motion
* too much novelty
* too many competing signals

The purpose of behaviors is not “more life.”
The purpose is to make the battlefield feel musically intentional.

Phase gating gives those behaviors a dramatic function.

---

# 9. Add boss transition support before adding the boss itself

## What Codex should do

Implement **boss transition logic first**, even if the boss enemy itself is still placeholder.

That means adding:

* `pre_boss` phase
* `boss_entry` phase
* `boss_rhythm_override` support in the phase/mode flow
* clear handoff rules from stage texture to boss structure

At minimum, the system should be able to:

* stop spawning normal escalation texture
* simplify the active arrangement
* retain one strong rhythmic identity
* hand off authority to boss mode cleanly

## Why

A boss is not just an enemy.
In a music-driven shooter, boss entry is a **musical mode change**.

If you wait until the boss enemy exists before defining boss transition behavior, the end of the level will remain shapeless.

The first level will feel far more complete as soon as it can:

* prepare the boss
* arrive at the boss
* change musical law cleanly

Even a temporary boss placeholder will feel better with a real transition than a real boss dropped into a muddy phase structure.

---

# 10. Decide exact ownership boundaries now

This is the part Codex most needs to keep clean.

## Ownership model

### `beat-swarm-mode.js`

Owns:

* level phase runtime
* music mode runtime
* event section runtime
* phase-to-policy decisions
* boss/pre-boss transition decisions

Should **not** directly own:

* low-level enemy motion
* detailed spawn implementation
* per-enemy behavior execution

### `beat-swarm-composer-lifecycle.js`

Owns:

* group survival / retirement
* deduplication
* continuity restraint
* role coexistence safeguards

Should read policy from mode/phase, not invent the first level on its own.

### `beat-swarm-composer-maintenance.js`

Owns:

* maintaining valid musical embodiment
* rescue/fallback/continuity operations
* keeping required roles alive when allowed

Should obey required roles and protected lanes from the mode/phase layer.

### `beat-swarm-formation-spawn.js`

Owns:

* role-to-formation embodiment
* role-to-behavior packaging during spawn

Should read:

* current phase
* active music mode
* active event section

Should not decide what the level wants overall.

### `beat-swarm-enemy-update.js`

Owns:

* movement realization
* behavior execution
* event behavior presentation

Should not infer stage structure.

### `beat-swarm-music-lab.js`

Owns:

* proving whether the plan is working

## Why

The biggest risk now is authority blur.

If multiple files all decide:

* when full texture has begun
* whether ornament is allowed
* whether support should survive
* when boss prep starts

then the level will keep drifting.

This ownership map is how you stop that.

---

# 11. Add first-level acceptance criteria before expanding content

## What Codex should do

Treat this level as complete only if the following are measurably true:

### Intro

* pulse is clearly audible first
* backbeat joins later and is distinct
* intro remains musically legible

### Lead merge

* lead enters without erasing rhythmic underlay
* merge lasts for intended bridge window
* support remains visible and audible enough to register

### Full texture

* exactly one foreground lead
* answer/ornament is present but subordinate
* role count reaches intended texture without co-lead confusion

### Event section

* `beat_bounce` lands clearly
* event affects presentation without destroying role clarity

### Escalation

* pressure rises
* the music still feels structured rather than flat dense
* the battlefield does not become unreadable mush

### Pre-boss / boss entry

* the level clearly prepares for the boss
* the handoff feels like a section change, not just more enemies

## Why

This stops the project from slipping into “we added more good systems” instead of “the first level works.”

The acceptance criteria should be blunt and level-specific.

---

# 12. Add the missing metrics that directly support this level plan

## What Codex should do

Prioritize metrics that prove the conductor layer is doing its job:

* role embodiment coverage
* vacancy count / vacancy duration / rescue latency
* director/phase intention vs live embodiment divergence
* time from lead entry to first valid answer/ornament
* time from phase transition to required-role fulfillment
* ornament duplication count
* co-lead violation count
* pre-boss simplification success
* boss-entry transition success

## Why

You already have lots of useful signals.
Now the question is not just “is the system alive?”
It is:

* did the level enter the phase it meant to?
* did the required roles become real?
* did the battlefield embodiment match the musical intention?

These metrics let Codex debug the **integration**, not just the sub-systems.

---

# 13. Recommended implementation order

This is the safest order.

## Pass 1 — Add the top-level phase runtime

In `beat-swarm-mode.js`:

* add `evaluateBeatSwarmLevelPhaseRuntime(...)`
* keep it tiny
* make it driven mainly by bar count plus current intro/music state
* expose debug output

## Pass 2 — Route music mode and enemy director through phase policy

Still in `beat-swarm-mode.js`:

* keep existing evaluators
* make them read the phase state
* add phase-based ceilings and gating

## Pass 3 — Lock the first-level role grammar

In lifecycle/maintenance:

* enforce one lead
* limit ornament duplication
* preserve merge support survival
* make phase-specific role admission clearer

## Pass 4 — Constrain behaviors and formations by phase

In formation spawn / behavior assignment:

* reduce expressiveness early
* preserve readability in merge
* allow richer texture only when phase allows it

## Pass 5 — Integrate only `beat_bounce`

Make one authored section land reliably.

## Pass 6 — Add pre-boss and boss-entry runtime

Even before the boss fight is fancy, make the stage end deliberately.

## Pass 7 — Tune with Music Lab against acceptance criteria

Do not expand event libraries or boss complexity until this passes.

---

# 14. What Codex should explicitly avoid

Do **not**:

* rewrite the whole director
* add more event section types yet
* reintroduce enemy family ownership as musical truth
* let ornament behave like second lead
* solve variety by making the base palette incoherent
* let each subsystem infer its own version of phase progression
* add boss complexity before boss transition logic exists

## Why

All of those moves would increase surface area without solving the current problem:
the systems already work; they just do not yet feel like one intentional level.

---

# 15. The intended outcome

When this plan is done, the first level should feel like:

* the opening teaches the player a pulse
* the groove becomes recognizable
* the lead arrives and matters
* the texture grows without collapsing clarity
* one event section feels authored and satisfying
* the stage escalates
* the level narrows and prepares
* the boss arrives under different musical law

That is enough for a real first Beat Swarm level.

Not because every possible system exists, but because the existing ones are finally being conducted.

---
