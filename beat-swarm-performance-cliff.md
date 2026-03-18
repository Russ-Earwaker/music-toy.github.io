## Beat Swarm `rising_tension` Perf Cliff

This document replaces the earlier maintenance-first hypothesis.

The current evidence says the clean FPS drop around the `rising_tension` section is **not primarily a spawner-maintenance problem** anymore. The dominant live cost is now:

1. `pickupsCombat.weaponRuntime.stepChange.processEvents.execute.drawsnake`
2. especially `...execute.drawsnake.projectile`
3. then `...execute.spawner`
4. then `...execute.player`

The cliff still lines up with `rising_tension`, but the practical issue is section density causing too many expensive musical actions, not one giant maintenance bucket.

---

## Current validated facts

These are the assumptions the next work should use.

### 1) The cliff aligns with `rising_tension`

Section schedule in [beat-swarm-mode-constants.js](/d:/Desktop/music-toy/music-toy.github.io/src/beat-swarm/beat-swarm-mode-constants.js):

* bars `0-7`: `opening_movement`
* bars `8-15`: `bassline_awakens`
* bars `16-25`: `counterpoint_engaged`
* bars `26-35`: `rising_tension`

`rising_tension` is where density and aggression increase enough to trigger the visible FPS step-down.

### 2) Projectile rendering is not the main problem

From recent Music Lab perf snapshots:

* `pickupsCombat.projectiles.dom` is tiny
* `pickupsCombat.projectiles.collision` is also small
* the heavier cost is still inside Beat Swarm step execution

So this is **not mainly browser projectile rendering**. It is **musical event execution and projectile launch work**.

### 3) The hot path is step-change execution

The current path of interest is:

* `pickupsCombat`
* `pickupsCombat.weaponRuntime`
* `pickupsCombat.weaponRuntime.stepChange`
* `pickupsCombat.weaponRuntime.stepChange.processEvents.execute`

And inside that, the largest remaining branch is still drawsnake.

### 4) Maintenance is no longer the best first target

We already profiled and reduced several previous hotspots:

* spawner collection
* bass keepalive owner lookup
* spawner flash/layout churn
* linked spawner child spawn setup
* drawsnake identity sync
* hostile-red projectile pooling

That work moved the bottleneck downward into execution, which is where the next plan must stay focused.

---

## Active task list

### 1) Keep profiling centered on step execution, not maintenance

Do not restart with a broad `maintainSpawners` rewrite.

When profiling new runs, always compare:

* `pickupsCombat`
* `pickupsCombat.weaponRuntime`
* `pickupsCombat.weaponRuntime.stepChange`
* `...processEvents.execute`
* `...execute.drawsnake`
* `...execute.drawsnake.projectile`
* `...execute.spawner`
* `...execute.player`

Goal:

* prevent us from regressing into the wrong subsystem again

### 2) Treat `rising_tension` as the controlled test section

Use `rising_tension` as the main acceptance window, especially bars `26-35`.

For every perf experiment, answer:

* did the FPS cliff still begin at `rising_tension`?
* did the drop become softer?
* which execution bucket changed?

Goal:

* tie every perf decision to the actual observed cliff boundary

### 3) Reduce non-primary drawsnake fire before execution

Current direction:

* preserve the lane-owned primary loop snake
* reduce secondary/non-primary drawsnake launch density
* prefer collection-time throttling over expensive execution-time work

What to tune:

* per-step emission gates
* `rising_tension` drawsnake count
* `rising_tension` intensity
* any section-specific drawsnake cadence controls

Goal:

* keep the main loop identity intact while lowering the expensive surplus shots

### 4) Keep drawsnake projectile work on the shortest path possible

The drawsnake projectile path should continue to use:

* pooled hostile-red projectile DOM
* pre-resolved note names
* pre-resolved instrument ids

Avoid reintroducing:

* duplicate normalization
* duplicate instrument fallback
* bespoke projectile creation paths

Goal:

* keep `execute.drawsnake.projectile` moving down, not back up

### 5) Prefer launch-count reduction over render tweaks

Do not spend time chasing projectile DOM paint cost first.

The current evidence says the better levers are:

* fewer expensive launches
* simpler launch setup
* section-specific action density reduction

Goal:

* attack the real cost source instead of tiny rendering sub-buckets

### 6) Continue watching spawner and player cost inside `rising_tension`

Recent runs showed that once drawsnake improves, `execute.spawner` and `execute.player` can climb enough to cancel the gain.

So every comparison should include:

* `execute.drawsnake`
* `execute.drawsnake.projectile`
* `execute.spawner`
* `execute.player`

Goal:

* avoid overfitting to one branch while the section still gets slower overall

### 7) Only return to maintenance if it becomes hot again

If a future run shows:

* `maintainSpawners`
* `maintainComposerGroups`
* or another maintenance bucket

becoming dominant again, then it is reasonable to reopen the structural/frame split idea.

Until then:

* maintenance cleanup is secondary
* step execution remains primary

Goal:

* keep priorities evidence-driven

---

## Focused debug checks

These are still worth doing, but only in support of the current hot path.

### A) Log section transitions and live target counts

At each section/pacing transition, record:

* section id
* pacing state
* target spawner count
* target drawsnake count
* target composer group count
* live counts actually present
* bar index

Goal:

* prove exactly what density changes at the cliff boundary

### B) Compare bars `24-36`

For before/after runs, compare the window around the transition:

* average frame ms
* worst frame ms
* `pickupsCombat`
* `weaponRuntime`
* `stepChange`
* `execute.drawsnake`
* `execute.drawsnake.projectile`
* `execute.spawner`

Goal:

* verify whether the cliff was reduced, not just moved

### C) Keep temporary kill-switches narrow

If we need more diagnosis, use temporary toggles for:

* secondary drawsnake fire
* non-primary loop projectile launches
* `rising_tension` section density

Avoid broad kill-switches that disable the whole music system or all spawner identity behavior, because those no longer match the main bottleneck.

Goal:

* isolate the active expensive branch without invalidating the musical structure

---

## Expected outcome

After the next pass, we want:

* the `rising_tension` FPS cutoff to soften or disappear
* `execute.drawsnake.projectile` clearly lower than the current recent range
* no regression in primary loop ownership / musical readability
* step execution still being measured clearly enough to identify the next hottest branch

---

## Acceptance criteria for Codex

Ask Codex to come back with:

1. the exact files changed
2. the exact buckets compared
3. the `rising_tension`-specific change made
4. before/after numbers from a new Music Lab run
5. one short statement of the hottest remaining branch after the fix
