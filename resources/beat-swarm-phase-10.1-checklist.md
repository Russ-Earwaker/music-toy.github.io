# Beat Swarm Manual Verification Checklist (Phase 10.1)

Use this after each implementation step.

## Setup
- Load Beat Swarm mode.
- Reset run state.
- Use standard player loadout first (`projectile -> explosion -> hitscan` is fine).
- Run 30-60 seconds with player movement and short stationary periods.

## Sound identity checks
- [ ] Player weapon remains recognisable by archetype (projectile/boomerang/hitscan/beam).
- [ ] Weapon timbre does not jump to enemy-role instruments mid-run.
- [ ] Explosions remain stable/punchy and do not become melodic role sounds.
- [ ] Enemy deaths read as deaths (small/medium/large), not lead/accent instruments.
- [ ] Enemy role layers (spawner/drawsnake/composer groups) feel like one cohesive soundtrack family.

## Pacing checks
- [ ] Start includes a player-only window (`intro_solo`).
- [ ] Spawners enter before melodic opposition.
- [ ] Melodic response layer enters after bass foundation.
- [ ] Intensity ramps through low -> mid -> peak without abrupt timbral swaps.
- [ ] Break state reduces danger while preserving groove participation.

## Gameplay stability checks
- [ ] Enemies still act on beat.
- [ ] Low-threat fallback actions appear when full-threat budget is saturated.
- [ ] Dangerous actions are budgeted (no sudden all-at-once spike every beat).
- [ ] Group behavior feels coordinated; generic non-group behavior does not dominate.

## Weapon behavior checks
- [ ] Projectile path remains beat-locked and note-linked.
- [ ] Boomerang path remains beat-locked and note-linked.
- [ ] Hitscan path remains beat-locked and note-linked.
- [ ] Beam activation/sustain behaves as expected and does not spam or leak across silence steps.
- [ ] Silence steps remain silent for player weapon playback.

## Useful debug probes
- `window.__beatSwarmDebug.getDirectorState()`
- `window.__beatSwarmDebug.getPacingState()`
- `window.__beatSwarmDebug.getPaletteState()`
- `window.__beatSwarmDebug.getDirectorStepEventLog()`
- `window.__beatSwarmDebug.getWeaponDamageScaleState()`
- `window.__beatSwarmDebug.getComposerMotifState()`

## Pass criteria
- No gameplay regressions in shot timing, silence behavior, or weapon archetype feel.
- No abrupt soundtrack identity swaps.
- Pacing and threat budgets remain readable and controllable.
