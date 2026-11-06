# High Paint: world-space zoom fix

This records the world-space fix. The later [density visual pass](SIMPLE-PAINT-LIQUID.md) replaces direct cores/glows with merged density splats and world-scaled blur; the camera-independent physics and spatial rules remain in place.

1. Previously screen-relative: initial cloud radius, grid cells, rest forces, speed integration, repulsor, fade/recycling distance, particle cores, density splats and rim. Positions alone were stored in world units, with camera scale mixed into the physics.
2. Now world-relative: all High simulation coordinates, velocities, forces, substep distances, radii, rest targets, grid extent, wake and fade. The model no longer reads camera transforms. Rendering alone projects world positions using the existing board transform helper. Standard is unchanged.
3. Pointer affordance: drawing input still uses the existing screen-to-world conversion. High draws a separate 7 CSS px diameter cursor ring at that projected world pointer. Its readable size never enlarges the fluid. The shared interaction-radius metadata remains available independently.
4. Repulsor: 48.6 world units, derived from the existing DrawGrid screen-radius reference at zoom 1. World fluid rim and exclusion geometry now match each other at every zoom.
5. Particle size: 1.1–1.9 world-unit base radius, multiplied by board scale before upload. The only core/glow floor is a tiny 0.15 CSS px base radius at extreme zoom-out; it does not affect 50–200% zoom.
6. Glow/density: shader core diameter remains twice the projected base radius; density-splat diameter remains twelve times it. Both therefore scale with the board. DPR is applied separately by the existing WebGL surface.
7. Domain: fixed 28×28 grid, cells 16 world units wide, total padded extent 448×448 world units around the pointer. Initial cloud radius 145 world units; fade is full through 100, smoothly reaches zero at 165, and recycling occurs beyond 185. Counts stay 1,800 desktop / 900 coarse. Resolution never changes with camera zoom.
8. Camera behaviour: zoom/pan only change projection and splat sizes; they never seed, reset, move or rescale world particles. Tests compare identical gestures through changing cameras, pause and release and obtain identical full particle state. The pool and particle objects retain identity. Input, generated authored path and commit behaviour remain unchanged. The comparison fixture can redraw camera changes at a frozen timestamp without advancing simulation time.
9. Performance: same desktop benchmark (`node tools/paint-quality-benchmark.mjs`), 120 warmup / 600 measured frames. High before: mean 0.679 ms, median 0.607 ms, p95 0.780 ms. After: mean 0.668 ms, median 0.590 ms, p95 0.817 ms. This is effectively unchanged within run-to-run variation. Counts, grid resolution and draw passes are unchanged. Larger on-screen splats at high zoom intentionally cover more pixels; GPU completion timing and mobile hardware were not measured.
10. Browser observations: production Standard/High comparison checked the same frozen slow gesture at 100%, 50%, 200%, then pan and zoom changes during an active loop. High's cloud, channel, glow and rim shrank/grew with the 50-unit grid and 100-world-unit reference square; no field reset or pointer misalignment was observed. 100% retained the prior appearance. Standard retained its screen-size finger, as intended for this pass. No browser warnings/errors were recorded. The fixture now labels the current High world/screen radius, includes a world grid/reference square, and refreshes paused camera changes immediately.

| Board zoom | Fluid radius on screen | Fade outer radius | Base particle radius | Tiny cursor diameter |
|---|---:|---:|---:|---:|
| 50% | 24.3 CSS px | 82.5 CSS px | 0.55–0.95 CSS px | 7 CSS px |
| 100% | 48.6 CSS px | 165 CSS px | 1.1–1.9 CSS px | 7 CSS px |
| 200% | 97.2 CSS px | 330 CSS px | 2.2–3.8 CSS px | 7 CSS px |

Standard could later adopt the same world-dimension convention while sharing the DrawGrid reference at 100%; its physics/presentation tuning would need a separate review. It was deliberately left intact here.

Validation: 43 focused tests pass, including camera-independent seed/physics/release, particle identity, screen projection/rim/fade/core/glow scaling, pointer alignment, pan-only projection, actual mid-stroke zoom/pan authored output, quality fallback, resource lifecycle and existing Standard/interaction regressions. `git diff --check` passes.

Changed files: High model, High Paint renderer, shared WebGL surface marker batch handling, comparison panel, quality/lifecycle tests, new world-space tests, this report and a cross-reference in the earlier quality report. No production input, musical, persistence or Standard renderer code changed.
