---

## Beat Swarm Enemy Director Plan

### Goal

Extend the existing **Unified Beat Swarm Director** so it also owns enemy-spawn planning and difficulty pacing.

The system should:

* scale with difficulty over time
* support musical pacing
* treat **composer groups** as common filler/core enemies
* treat **spawners** and **snakes** as rarer, more special enemies
* support future **solo carrier** enemies that can hold a full rhythm or melody loop as one stronger gameplay object
* support future enemy types like **piano enemies**
* use a shared **budget/value system** so enemy counts and power are controlled consistently
* use an **external CSV config** so designers can tune spawn rules without code changes

This should not introduce a second independent “spawn director” brain.
The correct model is:

* one unified Beat Swarm director
* one spawn-selection subsystem inside that director
* local spawn/carrier systems executing that plan

---

## Design Principles

### 1. Separate combat budget from selection logic

The system should not randomly choose enemies from a flat list.
Instead, it should:

* calculate how much enemy value is allowed right now
* check what is already alive
* check musical needs from the unified director
* choose the best enemy type to spawn based on weighted scoring

### 2. Composers are the common baseline

Composer groups should make up most of the battlefield population and act as flexible filler.

### 3. Spawners and snakes should feel special

They should be:

* less common
* limited by cooldowns / max simultaneous count
* biased toward bar / phrase starts
* chosen when the director wants rhythm or melody emphasis

### 4. Future-proof enemy roles

Do not hardcode everything around only the 3 current enemy types.
Structure it around roles/tags so future enemies like piano, bass, harmony, accent, and support fit cleanly.

### 4b. Support low-count full-lane carriers

The current system needs a way to satisfy a musical lane without flooding the battlefield with many small carriers.

So the director model should explicitly support a future enemy class that:

* is a single larger enemy
* has higher health and stronger visual identity
* can carry a whole rhythm or melody loop on its own
* acts more like a composer-group musical carrier, but as one gameplay object

This should be treated as a first-class carrier option, not a special-case hack.

Why this matters:

* one enemy can satisfy a lane without a wave of spawners/snakes
* gameplay pacing can stay readable at higher musical intensity
* the unified director can choose between:
  * many small carriers
  * one strong lane carrier
* lane continuity becomes easier to preserve when one object owns the full loop

Good first-pass use cases:

* rhythm lane owner when the field is already busy
* melody lane owner when a stable foreground idea is needed
* later harmony/support spotlight enemies

### 5. Reuse the existing unified director

Do not create:

* one music director
* plus one separate spawn director

Instead:

* the unified Beat Swarm director should own:
  * lane plan
  * pressure state
  * musical needs
  * spawn budget state
  * spawn-selection decisions
* the spawn system should be a subsystem/module under that director

That keeps:

* pacing
* lane ownership
* carrier assignment
* spawn pressure

inside one consistent planning layer.

---

## Implementation Steps

## Step 1 - Create the data model for enemy spawn config

Add an external CSV file for enemy spawn tuning.

### New file

`data/beat-swarm/enemy_spawn_config.csv`

### CSV columns

Use one row per enemy archetype or variant.

Suggested columns:

```csv
id,displayName,roleTags,spawnCost,threatValue,musicValue,baseWeight,rarityClass,minPhase,maxPhase,maxAlive,cooldownBars,spawnOnBeat,spawnOnBar,spawnOnPhrase,preferredSectionTags,forbiddenSectionTags,preferredNeeds,forbiddenNeeds,groupMin,groupMax,variantTier,notes
```

### Column meanings

* `id`
  unique enemy type id, e.g. `composer_basic`, `spawner_basic`, `snake_basic`
* `displayName`
  readable name
* `roleTags`
  pipe-separated tags like:
  `filler|adaptive|foundation`
  `rhythm|special|drums`
  `melody|special|lead`
* `spawnCost`
  how much live budget this enemy consumes
* `threatValue`
  rough combat pressure
* `musicValue`
  rough musical presence / importance
* `baseWeight`
  starting selection weight before runtime modifiers
* `rarityClass`
  e.g. `common`, `uncommon`, `rare`, `very_rare`
* `minPhase`, `maxPhase`
  difficulty / stage range where this enemy is allowed
* `maxAlive`
  max simultaneous active count for this archetype
* `cooldownBars`
  minimum bar gap between spawns of this archetype
* `spawnOnBeat`, `spawnOnBar`, `spawnOnPhrase`
  booleans or `0/1` flags controlling allowed musical entry points
* `preferredSectionTags`
  pipe-separated, e.g. `intro|build|drop`
* `forbiddenSectionTags`
  e.g. `break`
* `preferredNeeds`
  pipe-separated unified-director needs this enemy satisfies
* `forbiddenNeeds`
  e.g. `needRelief`
* `groupMin`, `groupMax`
  number of units spawned in one event for group-capable enemies
* `variantTier`
  e.g. `1`, `2`, `3`
* `notes`
  freeform design comments

---

## Step 2 - Create initial CSV rows

Seed the CSV with at least these rows:

### Composer basic

* cheap
* common
* high base weight
* large `maxAlive`
* spawnable on beat or bar
* supports filler / foundation / adaptive role

### Spawner basic

* medium-high spawn cost
* low base weight
* `maxAlive = 1` early
* prefers build/drop sections
* prefers `needRhythm`
* ideally spawns on bar or phrase, not random beat

### Snake basic

* high spawn cost
* very low base weight
* `maxAlive = 1`
* prefers `needMelody`
* ideally phrase-based entry
* should feel special

Also leave room for future rows like:

* `piano_basic`
* `bass_basic`
* `accent_basic`
* `solo_rhythm_basic`
* `solo_melody_basic`

---

## Step 3 - Add CSV loading and parsing

Implement a loader that parses `enemy_spawn_config.csv` into runtime data.

### Requirements

* load once at Beat Swarm start / scene init
* validate required columns
* convert numeric fields to numbers
* convert `0/1` flags to booleans
* split pipe-delimited tags into arrays / sets
* log warnings for malformed rows, but do not hard crash unless critical
* ignore disabled or invalid rows gracefully if needed

### Suggested output structure

```js
{
  id,
  displayName,
  roleTags: Set(...),
  spawnCost,
  threatValue,
  musicValue,
  baseWeight,
  rarityClass,
  minPhase,
  maxPhase,
  maxAlive,
  cooldownBars,
  spawnTiming: {
    beat: true,
    bar: true,
    phrase: false
  },
  preferredSectionTags: Set(...),
  forbiddenSectionTags: Set(...),
  preferredNeeds: Set(...),
  forbiddenNeeds: Set(...),
  groupMin,
  groupMax,
  variantTier
}
```

---

## Step 4 - Build a spawn-selection subsystem inside the Unified Director

Create a dedicated module, something like:

`src/beat-swarm/spawn-director.js`

Responsibilities:

* manage live budget and spawn budget
* query current battlefield state
* query current section / unified director needs
* determine when a spawn decision is allowed
* score eligible enemy configs
* choose a candidate using weighted selection
* trigger spawn requests

Important:

* this module should plug into the existing unified director runtime
* it should not replace that runtime with a second top-level planner

---

## Step 5 - Introduce two budget systems

Add both:

### Live Budget

How much total enemy value may exist on the battlefield right now.
Use enemy `spawnCost` to count against this.

### Spawn Budget / Refill Rate

How much new value may be introduced over a recent time window.
This prevents empty battlefield states from instantly refilling with too much stuff.

### First-pass rules

* live budget ramps over time / difficulty phase
* spawn budget refills gradually per bar or per phrase
* special enemies should often require saving enough budget to afford them

---

## Step 6 - Add battlefield state queries

The spawn subsystem should be able to inspect battlefield state:

* total live budget used
* count by enemy id
* count by role tag
* count of special enemies alive
* whether melody-special is already occupied
* whether rhythm-special is already occupied
* recent spawn history
* bar count since each enemy type last spawned

Start simple.

But plan for two occupancy styles:

* `distributed carrier`
  * lane represented by several ordinary enemies
* `solo carrier`
  * lane represented by one stronger enemy that owns the full loop

The director should be able to reason about both using the same lane/slot model.

---

## Step 7 - Add unified director inputs

Expose current music state from the unified director into the spawn subsystem.

At minimum, the director should provide:

* current section tag
  e.g. `intro`, `build`, `drop`, `break`, `climax`
* current phase number / intensity tier
* current musical needs, e.g.
  * `needFoundation`
  * `needRhythm`
  * `needMelody`
  * `needContrast`
  * `needRelief`
  * `needEscalation`
* current timing boundary
  * beat
  * bar start
  * phrase start

Where possible, needs should map back to existing director state instead of duplicating it:

* `needFoundation` -> foundation lane underserved
* `needRhythm` -> secondary loop / rhythm pressure underserved
* `needMelody` -> primary loop / melody pressure underserved
* `needRelief` -> combat pressure too high for current musical clarity target
* `needEscalation` -> section / pressure state wants stronger special presence

---

## Step 8 - Add role-slot logic for specials

Add lightweight slot logic so special enemies do not flood the battlefield.

### First pass slots

* `rhythmSpecialSlot`
* `melodySpecialSlot`

Rules:

* spawners generally occupy the rhythm special slot
* snakes generally occupy the melody special slot
* future solo rhythm carriers should also be able to occupy the rhythm special slot
* future solo melody carriers should also be able to occupy the melody special slot
* if a slot is occupied, similar-role enemies get a strong penalty or are blocked
* future special enemies should use the same slot/tag logic rather than bespoke code

This is important for keeping the soundtrack readable.

---

## Step 9 - Build candidate filtering

When a spawn check happens, build a list of eligible enemy configs by filtering out anything that fails hard constraints.

Reject candidates if:

* `spawnCost > remaining live budget`
* `spawnCost > current available spawn budget`
* current phase outside `minPhase/maxPhase`
* current alive count >= `maxAlive`
* still inside `cooldownBars`
* not allowed on current timing boundary
* forbidden by current section tag
* blocked by occupied role slot

This leaves only valid candidates for scoring.

---

## Step 10 - Build weighted scoring

For each eligible candidate, calculate a runtime score.

### Start from

* `baseWeight`

### Add bonuses for

* matching current music needs
* filling a missing role on the battlefield
* fitting current section
* fitting current difficulty
* good budget fit
* providing variety after filler-heavy periods
* being special at phrase boundaries

### Add penalties for

* recent repetition
* same role already dominant
* spawning too many specials too close together
* battlefield already too musically dense
* trying to spawn melody while melody slot already occupied
* trying to spawn rhythm while rhythm slot already occupied

Do not make this deterministic only.
Use weighted random selection from scored candidates.

---

## Step 11 - Add target composition bias

Instead of only picking whatever scores highest, bias toward a target live composition.

### First-pass target by live budget share

* composers / filler: `65-75%`
* rhythm specials: `15-25%`
* melody specials: `10-15%`

This should be based on budget share, not raw enemy count.

If the field is missing rhythm, spawner score should rise.
If melody is already represented, snake score should fall.

---

## Step 12 - Make spawn timing musical

Spawn decisions should happen on musical boundaries, not arbitrary frame times.

### First pass

* evaluate small filler spawns on beats or bars
* evaluate special spawns mainly on bars or phrases
* snakes should strongly prefer phrase starts
* spawners should strongly prefer bar starts or phrase starts

---

## Step 13 - Reserve budget for special moments

Add logic so the system can sometimes hold budget back for an upcoming phrase start.

Example:

* if phrase boundary is close
* melody slot is empty
* current section wants escalation
* a snake is eligible soon

then do not spend all remaining spawn budget on composers immediately.

---

## Step 14 - Add spawn history memory

Track recent spawns.

At minimum:

* last spawn time by enemy id
* last spawn time by role tag
* last `N` special spawns

Use this to prevent:

* snake, snake, snake
* too many rhythm specials in a row
* identical battlefield shapes repeating too often

This should apply at role level as well as exact enemy id level.

---

## Step 15 - Support enemy strength variants

Do not solve late-game scaling only with count.

Use CSV rows or linked config to support variants like:

* `composer_tier1`
* `composer_tier2`
* `spawner_tier2`
* `snake_tier2`

Later variants can keep the same role but increase:

* health
* bullet density
* aggression
* damage
* resilience

This same variant system should support the future solo-carrier family too, for example:

* `solo_rhythm_tier1`
* `solo_rhythm_tier2`
* `solo_melody_tier1`
* `solo_melody_tier2`

---

## Step 16 - Keep spawn selection separate from actual spawn execution

Separate:

* **what should spawn**
* from
* **where / how it spawns in the world**

The director should choose the archetype and quantity.
A separate placement system can decide position, formation, and entry pattern.

---

## Step 17 - Add debug output

Add debug logging and maybe an on-screen debug panel.

Useful debug info:

* live budget / max live budget
* spawn budget / refill
* current section
* current needs
* current occupied slots
* candidate list with scores
* rejected candidates with reasons
* chosen spawn and why

This debug should sit alongside existing unified-director diagnostics so we can inspect:

* what the director wanted musically
* what it wanted from spawning
* what actually got selected

---

## Step 18 - Add a simple first-pass tuning profile

### Early game

* mostly composers
* occasional spawner
* snakes very rare or disabled

### Mid game

* composers still dominant
* rhythm specials appear more often
* snakes occasionally enter on phrase changes

### Late game

* stronger variants
* slightly more special overlap
* still preserve special feeling with slots and cooldowns

---

## Concrete Coding Tasks

## Task 1 - Add CSV config file

Create:

`data/beat-swarm/enemy_spawn_config.csv`

Populate with initial rows for:

* `composer_basic`
* `spawner_basic`
* `snake_basic`

Later add rows for:

* `solo_rhythm_basic`
* `solo_melody_basic`

---

## Task 2 - Add CSV parser / loader

Create a loader utility for enemy spawn config.

Requirements:

* parse row values safely
* convert tags and flags
* validate required fields
* expose a clean list of enemy spawn definitions

---

## Task 3 - Add unified director spawn subsystem

Create a spawn-direction / selection module that plugs into the existing unified Beat Swarm director.

Responsibilities:

* track budgets
* track spawn cooldowns and history
* build candidate list
* score candidates
* choose spawns
* expose an API like:
  * `update()`
  * `onBeat()`
  * `onBar()`
  * `onPhrase()`
  * `chooseSpawnCandidate()`

But keep final ownership in the unified director state rather than introducing a second competing top-level controller.

---

## Task 4 - Connect to unified director

Feed current section tag, intensity, lane plan, and needs into the spawn subsystem from the unified director.

Start with simple needs:

* `needFoundation`
* `needRhythm`
* `needMelody`
* `needEscalation`
* `needRelief`

---

## Task 5 - Add role-slot support

Implement:

* rhythm special slot
* melody special slot

Use enemy role tags to determine whether a candidate needs a slot.

---

## Task 6 - Add budget logic

Implement:

* live budget cap
* spawn budget refill
* per-enemy `spawnCost` usage
* time/difficulty scaling

Make initial values easy to tweak.

---

## Task 7 - Add candidate filtering + scoring

Implement the hard filters first, then weighted scoring.

Keep the scoring readable and heavily commented.

---

## Task 8 - Add debug instrumentation

Add a debug flag that prints:

* current section / needs
* budget state
* candidate scores
* final chosen spawn

---

## Task 9 - Add simple test harness / simulation

If possible, add a lightweight non-visual simulation or logged test path that runs the director for several minutes and outputs:

* spawn sequence over time
* role distribution
* budget usage
* special enemy frequency

---

## Suggested first CSV example

```csv
id,displayName,roleTags,spawnCost,threatValue,musicValue,baseWeight,rarityClass,minPhase,maxPhase,maxAlive,cooldownBars,spawnOnBeat,spawnOnBar,spawnOnPhrase,preferredSectionTags,forbiddenSectionTags,preferredNeeds,forbiddenNeeds,groupMin,groupMax,variantTier,notes
composer_basic,Composer Basic,filler|adaptive|foundation,1,1,1,100,common,0,99,20,0,1,1,0,intro|build|drop|break,,needFoundation,,2,5,1,Main common filler enemy
spawner_basic,Spawner Basic,rhythm|special|drums,5,4,5,20,rare,0,99,1,8,0,1,1,build|drop,break,needRhythm|needEscalation|needFoundation,needRelief,1,1,1,Special rhythm anchor
snake_basic,Snake Basic,melody|special|lead,10,8,8,8,very_rare,1,99,1,12,0,0,1,drop|climax,intro|break,needMelody|needEscalation,needRelief,1,1,1,Special melodic feature enemy
```

---

## Key Guardrails

Please follow these rules while implementing:

* keep the system data-driven
* keep it inside the unified director architecture already being built
* do not introduce a second parallel director brain
* do not hardcode logic only for the 3 current enemy types
* use role tags and section tags so future enemy types slot in cleanly
* composers should remain the default/common battlefield population
* spawners and snakes should feel rarer and more intentional
* support future low-count solo carriers as an alternative to enemy floods when one lane needs a stable owner
* make special enemies respect musical timing
* keep the code modular and readable
* add debug output for tuning
* do not overcomplicate first pass with too many heuristics; get the basics working first

Recommended MVP subset for the first implementation:

* CSV config loader
* live budget
* spawn budget
* hard candidate filtering
* simple weighted scoring
* rhythm/melody special slots
* debug output

Do not try to land every advanced heuristic in the first pass.

---

## Nice Optional Extras After First Pass

Once the first version works, good follow-ups would be:

* separate CSV for difficulty ramp curves
* separate CSV for section target compositions
* support enemy families sharing cooldowns by role
* phrase reservation logic for upcoming special entrances
* add solo rhythm / solo melody carriers as first-class low-count lane-owner options
* encounter pattern presets like:
  * `steady groove`
  * `melodic spotlight`
  * `drum pressure`
  * `rebuild after break`

---
