BeatSwarm offscreen entry restoration - 11 November 2026

1. Root cause
The radial director path used a spawn ring at authored arena radius + 360 logical units. That is insufficient against a rectangular 1600x900 view: members near the horizontal axis could begin inside the visible area. It also mixed board worldToScreen coordinates with BeatSwarm's inverse projection. Other edge paths checked an enemy centre against a 42-logical-unit pad without accounting for full bodies, rotation, glow or a whole formation. Finally, enemies are not clipped to the contain-fit content rectangle, so the surrounding display bands can reveal a supposedly offscreen logical spawn.

2. Old and new coordinate paths
Old radial path: arena world centre -> board screen conversion -> presentation-scaled circle offsets -> BeatSwarm screen-to-world -> individual enemies. Old generic/composer paths: logical edge points, plus a shared-origin-only correction for advancing lines.
New normal path: compute the existing layout in BeatSwarm logical/world coordinates -> calculate its complete world bounds -> translate the entire batch outside the current visible world rectangle -> use the normal constructors/render projection. The authored in-arena anchors, arrangement plans and movement behavior are retained.

3. Visible world rectangle
The existing BeatSwarm projection supplies its gameplay presentation space. Its display rectangle corners are mapped back to logical coordinates, including the contain-fit surrounding bands. With those logical bounds L/R/T/B, player/camera world anchor P and logical camera scale S:
left = P.x + (L - 800) / S; right = P.x + (R - 800) / S;
top = P.y + (T - 450) / S; bottom = P.y + (B - 450) / S.
This uses the current BeatSwarm projection at spawn time, not board coordinates, DOM positions or an assumed camera origin. Camera architecture and authored zoom behavior are unchanged. On a window resize, never-visible batches are translated again as a whole if needed; already-entered enemies keep their world positions.

4. Margin and body bounds
ENEMY_SPAWN_MARGIN_WORLD is centralized in beat-swarm-spawn-placement.js. It is 42 / 0.46 = approximately 91.304 world units, retaining the historical padding at the authored camera zoom. Conservative 64/128 logical-unit small/large visual radii cover authored 42/94-unit bodies, rotation, birth/note pulses and glow; these convert through the current camera scale. Draw-snake node bounds are included in diagnostics and resize staging. No projectile speed/range or control constants changed.

5. Whole formations and entry direction
The normal layout is computed first. A single X or Y translation puts its full bounds beyond the selected visible edge plus margin, retaining every member-to-member offset. The existing side of an offscreen layout is preserved; otherwise the first authored radial/edge member determines the entry side. No new random direction is introduced. Advancing-line entry origins follow the same physical staging offset. Natural approach movement and the original target anchors remain unchanged.

6. Exceptions and approach activation
Required-lane handoff carriers already explicitly enter from independently balanced quadrants before assembling; each retains that independent entry instead of being forced into a single-sided batch. Directly authored lab/sandbox placements and linked-spawner summons retain their intended placement. The authored bypass on director construction means the batch has already been staged, not that it may appear inside the view.
Incoming bodies defer projectile, hazard, draw-snake shot and linked-child emissions until their body centre reaches the view. Musical clocks, motif steps, audible scheduling and arrangement plans continue. Existing valid player-world hits and pickup/drop behavior remain intact. Enemy movement AI and director scheduling files were not edited.

7. Diagnostics and tests
BeatSwarmMode.getSpawnEntryDiagnostics() exposes a bounded history: formation id/type, chosen side, visible world rect, world margin, original/initial bounds, member ids, spawn frame, first bounds-intersection frame, current bounds and resize restagings. There is no permanent gameplay UI clutter.
All 248 BeatSwarm tests passed, including the original-control source contracts and projectile range tests. New tests cover left/right/top/bottom, single/small/large formations, preserved spacing, eventual inward intersection, translated camera positions, .31/.46/1 camera scales, actual projection bounds across 1600x900, 1920x1080 and 1000x900, and threat gating when only a padded halo intersects the view. git diff --check passed.

8. Browser/full-flow result
The pointer-only Advanced -> launch -> corridor -> rockets -> bumpers -> eight-hit lead -> arena/director regression passed, with persistent weapon/Foundation/Accent/Lead layers and unchanged reset/exit behavior. The observer recorded 156 natural entries (single enemies and foundation-anchor/lead-arc/backbeat/composer groups) with no initial bounds violations, spanning all four sides. Radial director formations did not occur in that natural observation window, so the existing full-score arrangement fixture was invoked only after completing the normal flow. Three radial formations were then observed entering through unchanged AI. The combined observation file contains 162 entries and six paired screenshots. No production schedule was adjusted to force those samples.
A separate placement fixture verified hidden formation restaging and actual DOM body exclusion after each of the three resizes, then confirmed all three radial formations entered after resuming. This fixture is separate from the main-flow result.
Commands: node tests/beat-swarm-baseline.browser.mjs --spawn-qa
Focused resize: node tests/beat-swarm-baseline.browser.mjs --spawn-resize-qa

9. Representative screenshots
Other pre-existing gameplay objects can remain visible while the sampled enemy batch is still outside.
Gunner ring, right entry: [outside](right-0-outside.png) -> [entering](right-3-entering.png).
Hi-hat laser ring, top entry: [outside](top-1-outside.png) -> [entering](top-4-entering.png).
Lead laser ring, right entry: [outside](right-2-outside.png) -> [entering](right-5-entering.png).
Resize staging: [hidden after resize](resize-outside.png) -> [entered after resuming](resize-entries.png).
Data: spawn-observations.json; natural-flow-spawns.json; resize-qa.json; mouse-qa.json.

Visual QA used headless Chrome input tests and inspection of captured frames. A live human play-feel session and physical touch hardware were not re-tested in this pass.

Files changed for this task: src/beat-swarm/beat-swarm-mode.js (physical spawn placement, pre-entry emissions and diagnostics); src/beat-swarm/beat-swarm-spawn-placement.js; tests/beat-swarm-offscreen-entry.test.mjs; tests/beat-swarm-baseline.browser.mjs; artifacts/beat-swarm-offscreen/.
Pre-existing restoration changes and rhythmake.zip were preserved. Pointer/launch/corridor control code, musical firing cadence, core contribution sequence, projectile range and director music scheduling were not redesigned.
