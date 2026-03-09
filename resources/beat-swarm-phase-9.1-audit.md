# Beat Swarm Phase 9.1 Audit Notes

Date: 2026-03-09
Scope: `src/beat-swarm-mode.js`

## 1) Composer sections and arrangement state
- `COMPOSER_SECTIONS` is defined at line 492.
- Arrangement application path is centered on:
  - `applyEnergyStateToComposerDirective(...)` (pacing + arrangement caps already wired from Phase 8.2)
  - `updateComposerForBeat(...)` (motif epoch + section/directive updates)
- Current risk: section identity and pacing caps overlap in one file; keep future edits localized to helper functions rather than spreading branching into trigger paths.

## 2) Sound event resolution and mapping
- Sound event constants: lines 825-846 (`SWARM_SOUND_EVENTS`, death families, player weapon sound keys).
- Stable family routing helpers:
  - `getPlayerWeaponSoundEventKeyForStage(...)` line 883
  - `isEnemyDeathSoundEventKey(...)` line 2851
  - `resolveEnemyDeathEventKey(...)` line 2866
  - `classifyEnemyDeathFamily(...)` line 2874
- Playback funnel:
  - `noteSwarmSoundEvent(...)` line 2900
  - `playSwarmSoundEventImmediate(...)` line 3103
- Current risk: adding new event keys without going through family helpers can reintroduce timbre instability.

## 3) Spawn/population maintenance paths
- `maintainSpawnerEnemyPopulation()` line 6697
- `maintainDrawSnakeEnemyPopulation()` line 6954
- `maintainComposerEnemyGroups()` line 9049
- Current state: all three now enforce pacing caps, including downscale/removal when caps drop.
- Current risk: any direct spawn call added outside these maintainers can bypass pacing and budget controls.

## 4) Composer per-step trigger equivalent
- The plan mentions `triggerComposerGroupsOnStep()`; this function does not exist in current code.
- Active equivalent is `collectComposerGroupStepBeatEvents(stepIndex, beatIndex)` at line 8978.
- Event merge occurs in the beat update pipeline at line 8495.
- Current risk: future changes should target this collector path, not add parallel trigger paths.

## 5) Enemy death trigger logic
- Pending death queue playback path uses resolved family keys around line 6145.
- Immediate enemy death classification + key resolution path is around lines 6228-6229.
- Current risk: any death trigger that bypasses these points can lose family-specific behavior and dedupe handling.

## 6) Player weapon firing logic (projectile/boomerang/hitscan/beam)
- Central weapon stage entrypoint: `triggerWeaponStage(...)` line 8075.
- Per-family sound routing inside stage handler:
  - projectile path around line 8113
  - beam path around line 8180
  - hitscan path around line 8243
  - explosion fallback around line 8309
- Beam anti-spam gate:
  - state vars lines 91-92
  - gate/reset helper path lines 8000-8016
- Current risk: adding archetype-specific ad hoc sound calls outside `triggerWeaponStage(...)` will break stable family routing.

## 7) Guardrails for next edits
- Keep new arrangement/pacing behavior in helpers used by existing collectors/maintainers.
- Keep player gameplay feedback routed only through `getPlayerWeaponSoundEventKeyForStage(...)`.
- Keep enemy death audio routed only through family classifiers/resolvers.
- Keep beat-trigger participation inside existing budgeted collector functions.
