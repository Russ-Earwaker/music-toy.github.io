BeatSwarm restoration on reverted baseline c8bc736 - 11 November 2026

1. Baseline controls before changes
The ship starts in stationary prelaunch. The existing primary-pointer drag joystick charges a backward pull. After charge exceeds the existing threshold, release/neutral input launches. The existing transport-clock corridor then carries the ship forward; drag Y steers vertically, and drag X does not provide horizontal free movement. Mouse/touch/pen share the existing capture and drag state. Firing remains automatic on authored musical note steps, including rests and the existing target/facing rules. No pointer handlers, drag state, touch architecture, launch logic, firing cadence, or corridor movement logic were replaced.

Dash audit: this baseline only permits current-fight charging in prelaunch. Stored releaseVx/releaseVy values are decayed but not applied to corridor displacement. A repeat corridor dash is therefore incomplete/disconnected in this baseline. It was reported before implementation and left unchanged; no new dash mechanic was added.

2. Existing systems and entry fix
Advanced's Game Menu previously called BeatSwarmMode.enter() without options, skipping the optional corridor and defaulting to tap_orbs_missiles. The menu now passes weaponGateIntro:true and weaponGateSequence:missiles_bouncers and starts the existing transport from that menu gesture. Starting the transport does not launch the ship. Debug/lab enter defaults remain unchanged.

3. Connected sequence and music retention
The existing sequence is now reachable: stationary pull/release launch -> 16-slot weapon corridor -> riff/arena handoff -> two Foundation rocket contributions -> two Accent bumper contributions -> eight-hit Lead capture -> existing arena/director formations. Sparkle remains in the ornament/director architecture, with no additional mandatory onboarding stage. No composition or transport reset was added at handoff. Final mouse QA retained 10 active weapon notes out of 16 slots, 4 Foundation steps, 2 Accent steps and 8 Lead events. Existing later director and enemy musical arrangements were retained.

4. Camera root cause and fix
BeatSwarm's logical projection used board user zoom, while the renderer also applied board responsive presentation; the logical contain-fit projection and board conversion consequently disagreed. Reading the player back from board DOM coordinates compounded this divergence. BeatSwarm now owns the player world anchor and logical camera scale, preserving the authored 1600x900 projection, centered anchor and existing contain-fit enlargement cap. The shared board renderer receives the matching effective scale with responsive base scaling factored out. Existing camera zoom policy and all control displacement rules are retained. Resize preserves the latest world position rather than a stale position captured before the next movement frame.

5. Projectile root cause and fix
Standard bullets retired at the logical viewport plus 72 margin. Their travel therefore depended on camera position/direction. Collision helpers also passed runtime wx/wy objects directly to an x/y projector, allowing false collisions. Those boundaries are fixed, and straight-shot collision checks cover the motion segment. No firing rule or projectile speed was changed.

The baseline has PROJECTILE_SPEED=1100 and PROJECTILE_LIFETIME=1.9, but no independently declared historical maximum range. Their authored travel budget is 2090 world units; that is the supported numerical derivation, not a newly invented distance or independently proven design specification. The original 1.9-second lifetime is retained. Standard shot motion is capped by accumulated world displacement and retires as max_range; viewport retirement no longer truncates it. The normal musical firing path measured 2090 at 1600x900, 1920x1080 and 1000x900 while the corridor camera moved.

Removal diagnostics now reach the runtime callback and record spawn/current world position, accumulated travel, maximum range, logical/screen position and removal reason. See mouse-qa.json and touch-qa.json; runtime inspection uses __BEAT_SWARM_PROJECTILE_REMOVALS and BeatSwarmMode.getGameplaySnapshot().

6. Reset and exit
The reset API exits and restarts the same main flow. Existing gameplay/director/music cleanup is reused. Camera and transport ownership restore the prior Advanced view/playback state. A stale corridor fade callback can no longer erase a new run, and restart restores layer visibility. A leftover musical-camera hold is cleared on a fresh entry. No input architecture was changed to achieve cleanup.

7. Control preservation and regression protection
The baseline pointer-input, input-controls, release-input and input-binding modules remain unchanged. Fixed baseline hashes protect those modules plus the mode's pointer handlers, steering, musical firing function, launch/corridor controller, and the corridor runtime update/launch blocks. Behavioral tests verify stationary prelaunch, automatic postlaunch progression and vertical-only steering. The browser tests use down/move/up only, with no keyboard, modifiers, mouse aiming, direct launch calls or replacement demo controller.

8. Validation
All 241 BeatSwarm tests passed; git diff --check passed. Full mouse and synthetic single-touch browser runs used actual Advanced -> Game Menu -> BeatSwarm entry and completed all five contributions. They verified pull-and-release launch, forward motion without held input, vertical steering, resize/world scrolling, full-range musical shots at three sizes, arena continuation, reset, exit and second launch. No browser runtime exceptions occurred. A final mouse run also asserted persistent layer counts and visible corridor content after a rapid reset. Screenshots were visually inspected.
Commands: node tests/beat-swarm-baseline.browser.mjs; node tests/beat-swarm-baseline.browser.mjs --touch.

9. Limits and files
QA was performed through headless Chrome input tests and screenshot inspection. Real touchscreen/pen hardware, audible mix quality and an in-person tactile comparison remain unverified. The incomplete baseline corridor dash and historical range-specification uncertainty are reported above rather than expanded into new mechanics.

Changed runtime files: src/main.js; src/beat-swarm/beat-swarm-mode.js; beat-swarm-weapon-gate-intro.js (visual lifecycle only); beat-swarm-weapon-chain-core.js (projectile spawn metadata only); beat-swarm-projectile-travel.js; beat-swarm-pickups-combat.js; beat-swarm-pickups-combat-wrapper.js; beat-swarm-logical-collision.js.
Tests/artifacts: tests/beat-swarm-baseline-controls.test.mjs; tests/beat-swarm-projectile-travel.test.mjs; tests/beat-swarm-baseline.browser.mjs; tests/fixtures/beat-swarm-control-baseline.json; artifacts/beat-swarm-baseline/.
The pre-existing rhythmake.zip modification was not touched.
