### 1. Remove pulse-like bass fallbacks from foundation ownership and keepalive paths

Audit every bass fallback path and replace any even-step default like `i % 2 === 0`.

Specifically:

* bass owner recovery
* keepalive injection
* singleton inheritance fallback
* drawsnake/spawner recovery defaults

Replace with a small explicit foundation phrase library, for example:

* `foundation_A = [1,0,0,1,0,1,0,0]`
* `foundation_B = [1,0,0,0,1,0,1,0]`
* `foundation_C = [1,0,1,0,0,1,0,0]`
* `foundation_D = [1,0,0,1,0,0,0,1]`

Rules:

* phrase chosen once and locked for at least 4 bars
* only change on bar boundaries
* no per-step randomisation
* allow rests
* allow at least some offbeat accents
* keep the phrase stable long enough to register

### 2. Make foundation phrase identity persist independently of actor handoff

Right now handoff continuity improved, but resets are still too common.

Change the model so:

* the **lane owns the phrase**
* the actor only performs it
* actor death must not imply phrase redesign

Target:

* `foundationPhraseResets` close to 0 during normal early play
* `foundationContinuityRate` above 0.85

### 3. Create a dedicated intro bass arrangement phase

Do not let the intro bass behave like generic bass logic.

Add an explicit intro foundation plan:

* bars 0–3: player / minimal
* bars 4–11: single bass phrase only
* bars 12–19: bass continues, one primary loop may join
* no extra foreground identities before that unless explicitly forced

The intro bass should be a recognisable loop, not a generic continuously-generated bass presence.

### 4. Tighten admission rules after intro

Current later-state gates are still too loose.

Change:

* `main_low` minimum completed loops before new major identity: from `1` to `2`
* `main_mid`: from `1` to `2`
* `peak`: from `1` to `2`

Also change:

* minimum bars between major identities in `main_low`, `main_mid`, `peak` from `1` to at least `2`, preferably `4` for early/mid game

### 5. Reduce foreground identity count in later states

Keep it simpler.

Change:

* `maxForegroundIdentitiesByPacingState.main_low = 1`
* `main_mid = 2`
* `peak = 2` not 3

The current ceiling is still too generous for readable enemy-sound association.

### 6. Add a true lane model instead of mostly role-based behaviour

Codex should implement explicit long-lived lanes:

* `foundationLane`
* `primaryLoopLane`
* `secondaryLoopLane`
* `sparkleLane`

Each lane owns:

* phrase id
* instrument id
* colour id
* continuity id
* lifetime bars
* performer assignment
* handoff policy

Then enemies inherit from the lane rather than inventing/rewriting identity locally.

### 7. Hard-lock instrument and colour identity after assignment

The latest run still shows drift:

* `instrumentChangesPerEnemy = 0.0465...`
* `colourChangesPerEnemy = 0.1860...` 

That is still too high for readable musical association.

Add a hard guard:

* once `musicInstrumentId` and role colour are assigned, reject mutation unless it is an explicit section re-orchestration event

### 8. Make sparkle subordinate by authority, not just density

`sparkleDensity` is currently reported as `0` in the summary, but the broader problem is still that later layers feel too busy. 

Codex should:

* duck sparkle during new loop registration
* suppress sparkle when there are already 2 foreground lanes
* never let sparkle create a new strong foreground identity

### 9. Add a “foundation musicality” diagnostic block

Right now the lab proves reliability, but not whether the bass is musically dead.

Add:

* `foundationRestShare`
* `foundationOffbeatShare`
* `foundationUniquePatternCount`
* `foundationPatternChangeRate`
* `foundationConsecutiveOnBeatHits`

These will tell you whether the bass is behaving like a phrase or a metronome.

### 10. Add a “lane readability” metric

Add:

* `audibleForegroundLaneCount`
* `barsSinceNewForegroundIdea`
* `laneReassignmentRate`
* `enemyColourMutationCount`
* `enemyInstrumentMutationCount`

You want the lab to answer:
“Could a player actually learn which enemy is which musical part?”

