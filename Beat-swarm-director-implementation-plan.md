# Beat Swarm – Detailed Codex Task List

## Overall goal

Improve Beat Swarm so that:

* the soundtrack has a stable **default Beat Swarm palette**
* the mode has a proper **ease-in and spawn pacing system**
* the player’s weapon and explosions remain **stable, readable gameplay sounds**
* enemy deaths stay **game-like death sounds**
* grouped enemies become the primary enemy music structure
* generic non-group enemies are retired or absorbed into the group system
* the system supports multiple player weapon archetypes:

  * projectile
  * boomerang
  * hitscan
  * beam / sustained laser
  * future variants

Do this in **small safe steps**, validating after each step.

---

# Phase 1 – Add a proper Beat Swarm sound identity layer

## Task 1.1 – Create a default Beat Swarm palette concept

Create a new palette definition for Beat Swarm that separates:

### Core gameplay sounds (stable, not palette-swapped)

* player weapon archetype sounds
* explosions
* hit / damage feedback
* enemy death sound families

### Musical role sounds (palette-controlled)

* bass
* lead
* accent
* motion

### Requirements

* keep player weapon sounds stable across the run
* keep explosion sounds stable across the run
* enemy deaths must always feel like death sounds
* only enemy musical role layers should be palette-driven

### Suggested new module

* `src/beat-swarm-palette.js`

### Output shape

Have one exported default object like:

```js
{
  id: 'beat-swarm-default',
  gameplay: {
    playerWeapons: {
      projectile: ...,
      boomerang: ...,
      hitscan: ...,
      beam: ...,
    },
    explosion: ...,
    enemyDeath: {
      small: ...,
      medium: ...,
      large: ...,
    },
  },
  roles: {
    bass: ...,
    lead: ...,
    accent: ...,
    motion: ...,
  },
}
```

---

## Task 1.2 – Route sound lookup through role + family, not raw event type

Right now there is event-type-based sound logic in `src/beat-swarm-mode.js` around swarm sound event resolution and calls like:

* `playSwarmSoundEventImmediate(...)`
* `noteSwarmSoundEvent(...)`
* event mappings for `hitscan`, `enemyDeath`, etc.

Change this so Beat Swarm first resolves:

* is this a **core gameplay sound**?
* or is this a **musical role sound**?

### Requirements

* player shots use stable weapon-family sounds by archetype
* explosions use stable explosion family
* enemy deaths use stable death family by enemy class
* grouped/spawner/drawsnake phrase events use palette roles

### Acceptance check

During play:

* spawners/drawsnakes/groups feel like one soundtrack family
* player gun does not suddenly change instrument
* explosions do not suddenly become melodic bells or weird textures
* enemy deaths still read as kills

---

# Phase 2 – Add spawn pacing and intro ease-in

## Task 2.1 – Add a Beat Swarm pacing state machine

Add a lightweight pacing controller for enemy spawning and system activation.

### Suggested new module

* `src/beat-swarm-pacing.js`

### Add these states

* `intro_solo`
* `intro_bass`
* `intro_response`
* `main_low`
* `main_mid`
* `peak`
* `break`

### State meanings

#### `intro_solo`

* only player weapon active
* no enemy spawning
* optional cosmetic battlefield pulse only

#### `intro_bass`

* allow only simple spawner layer
* low enemy count
* low threat
* no drawsnakes
* no large groups yet

#### `intro_response`

* allow first melodic opposition
* introduce one drawsnake or one small group
* still low danger

#### `main_low`

* normal play begins
* all systems can exist, but with low budgets

#### `main_mid`

* fuller normal play

#### `peak`

* strongest density and coordination

#### `break`

* reduce danger while maintaining groove

### Requirements

* transitions happen by bar count, not frame timing
* first 2–4 bars should be player-only
* next few bars should bring in spawners first
* melodic opposition comes after that

---

## Task 2.2 – Make spawn systems obey pacing states

Current relevant functions in `src/beat-swarm-mode.js` include:

* `maintainEnemyPopulation()`
* `maintainSpawnerEnemyPopulation()`
* `maintainDrawSnakeEnemyPopulation()`
* `maintainComposerEnemyGroups()`

Update these so they obey the pacing controller.

### Requirements by state

#### `intro_solo`

* no enemy spawns from any of these systems

#### `intro_bass`

* only `maintainSpawnerEnemyPopulation()` allowed
* strict low count caps

#### `intro_response`

* allow one melodic source:

  * either limited drawsnake
  * or one small composer group

#### `main_low`, `main_mid`, `peak`

* progressively loosen caps and coordination complexity

#### `break`

* keep musical participation possible
* sharply reduce full-threat actions and/or new spawns

### Acceptance check

The round should feel like:

* player establishes rhythm
* world answers with groove
* then melodic opposition arrives
* then full battlefield play begins

---

# Phase 3 – Replace section-jump feel with theme continuity

## Task 3.1 – Add persistent palette lifetime

Right now the problem is abrupt identity switching.

Add palette persistence so the default Beat Swarm palette remains stable for a meaningful duration.

### Requirements

* palette should persist for many bars
* internal variation can evolve gradually
* do not hard-swap from one unrelated family to another during normal section changes

### Allowable changes

* brightness
* filter
* density
* octave emphasis
* accent strength

### Avoid

* bells suddenly replaced by guitar-like sounds
* unrelated sound family swaps on section change

---

## Task 3.2 – Make section/state changes vary arrangement, not core timbre

Current composer section logic exists around:

* `COMPOSER_SECTIONS`
* current section/directive usage
* motif caching

Keep that system if useful, but stop using it as the main source of timbral identity change.

### Change section usage so it primarily alters

* note density
* active roles
* phrase complexity
* call/response usage
* spawn availability
* threat budgets

### Do not use it to hard-swap core identity

The “track” should feel like one evolving piece gaining and losing layers.

---

# Phase 4 – Clean up enemy structure around groups

## Task 4.1 – Make groups the primary enemy music unit

You said generic enemies now feel obsolete. I agree.

Move toward a model where all musically participating enemies belong to a group structure.

### New rule

Even “solo” enemies should be treated as **groups of size 1**.

### Benefits

* consistent motif ownership
* consistent role ownership
* easier call-and-response
* easier pacing and threat control

---

## Task 4.2 – Retire generic non-group enemy logic where safe

Audit where truly generic enemies are still spawned and used.

Likely relevant areas:

* general enemy population maintenance
* enemy spawn helpers
* enemy death and attack behaviour routing

### Goal

Replace “generic musical enemies” with:

* group members
* or group size 1 members

### Keep only true special cases if needed

If a completely generic enemy is still needed for debugging or tutorial reasons, isolate it clearly and do not let it dominate normal musical play.

---

## Task 4.3 – Add default group templates by role

Create reusable group templates for:

* bass spawner groups
* lead drawsnake groups
* accent burst groups
* response groups

### Minimum group data

* `id`
* `role`
* `size`
* `motif`
* `actionType`
* `threatLevel`
* `notes`
* `performers`

This should simplify `triggerComposerGroupsOnStep()` and future tuning.

---

# Phase 5 – Tighten enemy death sound rules

## Task 5.1 – Define enemy death sound families

Enemy death sounds should never become arbitrary musical instruments.

Add 3 default death families:

* small death
* medium death
* large death

### Style requirements

All should sound like:

* arcade death pop
* digital burst
* gamey destruction sound

They can vary by size/class, but all should clearly read as deaths.

### Avoid

* organic sounds
* tonal instruments that sound like leads
* novelty sounds

---

## Task 5.2 – Route death sounds by enemy type/class

Where enemy death audio is triggered, classify by enemy size/type/group role and choose the right death family.

### Requirements

* death can still be pitched to the active note pool
* but timbre stays within the death family
* multiple simultaneous deaths should remain readable and not turn into melodic mush

### Acceptance check

Killing enemies should sound satisfying and game-like, even when musical.

---

# Phase 6 – Support multiple player weapon archetypes properly

## Task 6.1 – Formalise weapon archetype sound families

Current code already contains archetypes/variants including:

* projectile
* boomerang
* laser / hitscan
* beam-related behaviour can be added similarly

Create stable sound family rules per archetype.

### Required families

* `projectile`
* `boomerang`
* `hitscan`
* `beam`

### Rules

Each archetype:

* keeps a stable timbral identity
* can be pitched to notes
* remains recognisable as that weapon type
* does not get palette-swapped without player consent

### Examples

* projectile: classic arcade shot family
* boomerang: thrown/whirl family, still synthetic and game-readable
* hitscan: sharp laser family
* beam: sustained sci-fi beam family with clean on/off and loop behaviour

---

## Task 6.2 – Keep note linkage for all player archetypes

Preserve the current Beat Swarm rule:

* note playing and firing are linked
* if the weapon step is silent, it should be silent
* if the weapon fires, it should produce its note through that weapon’s stable sound family

This must hold for:

* projectile weapons
* boomerangs
* hitscan weapons
* beams

---

## Task 6.3 – Preserve damage scaling by note density

Do not rebalance yet, but keep support for the current rule:

* 8 active notes = 1x
* 4 active notes = 2x
* 2 active notes = 4x
* 1 active note = 8x

### Requirement

This logic must continue to work no matter which weapon archetype is active.

### Important

Do not tie this to palette or enemy soundtrack changes.

---

## Task 6.4 – Add beam-specific handling if not already formalised

For beam / sustained laser weapons, ensure the sound and gameplay both remain beat-locked.

### Desired behaviour

* beam activation begins on beat
* beam sustain remains readable and stable
* beam note identity is still clear
* if the sequence step is silent, beam should not sustain illegally across silence unless explicitly designed to

### Check for

* sustained sound spam
* awkward looping
* overly intrusive beam sound dominating the whole soundtrack

---

# Phase 7 – Refine threat participation rules

## Task 7.1 – Keep “everyone can play, not everyone can be dangerous”

Preserve the rule that many enemies may participate rhythmically, but only some may perform full threats.

### Add explicit budgets

Per beat:

* max full threats
* max light threats
* max cosmetic participants

Per bar:

* target note density
* target active role count
* call/response complexity level

### Use these budgets in

* group triggering
* spawner triggering
* drawsnake triggering
* pacing state transitions

---

## Task 7.2 – Make low-threat actions the fallback participation mode

You already chose to replace passive note-only behaviour with low-threat actions. Keep that.

### Rule

If an enemy is allowed to join the beat musically but is not budgeted for a major threat, it should perform:

* tiny AOE
* pulse burst
* short-range pop
* cosmetic sync action
* recoil/flash/charge gesture

That keeps the battlefield bouncing together.

---

# Phase 8 – Improve recurring themes without hard song swapping

## Task 8.1 – Preserve motifs across bars and states

Current motif caching is a decent start.

Strengthen it so recurring themes come from:

* repeated note pools
* repeated phrase shapes
* repeated rhythmic cells
* repeated group-response patterns

### Goal

“chorus” should feel like the return of a recognisable behaviour/theme, not a sudden unrelated sound pack.

---

## Task 8.2 – Use pacing states to control arrangement

Energy/pacing states should determine:

* how many layers are active
* who enters
* who answers
* how dense the bar is

They should not fully replace the sonic identity.

---

# Phase 9 – Validate current code paths and keep changes localised

## Task 9.1 – Audit current relevant functions before editing

Before changing logic, inspect and annotate these current areas in `src/beat-swarm-mode.js`:

* `COMPOSER_SECTIONS`
* sound event resolution / mapping
* `maintainSpawnerEnemyPopulation()`
* `maintainDrawSnakeEnemyPopulation()`
* `maintainComposerEnemyGroups()`
* `triggerComposerGroupsOnStep()`
* enemy death sound trigger logic
* player weapon firing logic for:

  * projectile
  * boomerang
  * hitscan
  * any sustained beam path

### Requirement

Codex should avoid rewriting everything blindly.
It should adapt the current working paths.

---

## Task 9.2 – Keep existing gameplay stable while layering changes

Do not break:

* quantized player shots
* drawgrid-driven player sequence logic
* silence step behaviour
* current projectile behaviour
* current boomerang behaviour
* current hitscan behaviour

This refactor is about:

* better identity
* better pacing
* better structure

Not changing the core feel of the controls.

---

# Phase 10 – Testing checklist

## Task 10.1 – Add quick manual verification checklist

After each phase, test these in Beat Swarm:

### Sound identity

* player gun stays recognisable
* explosions stay punchy and stable
* enemy deaths sound like deaths
* enemy musical layers feel like one soundtrack family

### Pacing

* game starts with player-only period
* spawners enter first
* melodic opposition enters later
* intensity ramps naturally

### Gameplay

* enemies still act on beat
* low-threat participation works
* not too many dangerous events land at once
* groups feel more coherent than generic enemies

### Weapon coverage

* projectile works
* boomerang works
* hitscan works
* beam works or degrades gracefully if not yet complete

---

# Suggested order for Codex to execute

1. Add `beat-swarm-palette.js`
2. Route sound resolution through stable families + role palette
3. Add `beat-swarm-pacing.js`
4. Make spawn maintenance obey pacing states
5. Implement intro solo → bass → response → main pacing
6. Convert generic musical enemies toward group size 1 model
7. Add proper enemy death sound families
8. Formalise player weapon sound families for projectile / boomerang / hitscan / beam
9. Tune state transitions and threat budgets
10. Run manual checks and fix regressions

---

# Short brief to paste to Codex

Implement a default Beat Swarm sound palette and pacing system. Keep player weapon sounds stable by weapon archetype, keep explosions stable and punchy, keep enemy deaths game-like, and let only enemy musical roles use the dynamic palette. Add an intro pacing flow: player-only first, then spawners, then melodic opposition, then full play. Move away from generic musical enemies and make groups the primary enemy structure, including size-1 groups. Preserve beat-locked shots, silence behaviour, boomerangs, hitscan, projectile weapons, and note-linked damage scaling. Avoid abrupt instrument-family swaps; the soundtrack should feel like one evolving track gaining layers.
