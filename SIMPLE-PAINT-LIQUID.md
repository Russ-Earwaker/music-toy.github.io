# High Paint: disturbance-lit density body

This records the initial density pass. The later [advected disturbance wake pass](SIMPLE-PAINT-WAKE.md) replaces cursor-relative rest targets/fading and the short release envelope with world-anchored material and a retained, transported wake.

High now renders a merged liquid body rather than directly drawing particle cores. Standard remains the existing default Canvas implementation. Music generation, timing, authored path, persistence, input and gameplay code were not changed in this pass.

The existing 1,800-particle world-space simulation feeds soft splats into a density/activity texture. Three RGBA8 targets provide accumulation plus horizontal/vertical blur. A final shader shades the merged density from local activity, with a small density-gradient edge highlight and extra brightness in compressed regions. There is no particle-core overlay, proximity spotlight or screen-space history trail. Instrument colour comes from the existing palette; the active body becomes paler toward its compressed/high-energy regions. Calm substrate opacity is capped at a barely visible 0.002 before edge/flow contributions.

Displacement energy accumulates only when the finger boundary actually moves material. It decays exponentially with a 0.45-second time constant; current velocity also lights the material. Thus settled particles dim without being replaced or expiring independently. Actual sampled density, forward world motion and proximity to the physical boundary create a restrained pressure-front contribution, including a small radial pressure acceleration. Velocity remains capped at 105 world units/s. There is no artificial vortex or projectile kick. The existing 1.4-second release fade remains the global resource-cleanup envelope.

World-space behaviour is preserved: fluid radius 48.6 world units, 28×28 simulation grid with 16-world-unit cells, unchanged local domain/counts (1,800 desktop / 900 coarse). Density splat diameter is 18 times the projected particle base radius. Blur derives from 4.5 world units, with a small screen floor at extreme zoom-out. The tiny 7 CSS px cursor stays readable; the old large UI rim is now extremely faint. Camera motion does not reset simulation or leave stale framebuffer trails because each frame rebuilds the density texture from world particles.

Framebuffer allocation/completeness failures and context loss reach the existing Standard fallback. Textures/framebuffers are resized together and deleted on resize, expiry or cancellation, including partially allocated failure paths. The input-free shared board surface remains one canvas per document. Reduced motion continues using Standard.

Files changed in this pass:

- `src/simple-paint/presentation/high/high-quality-board-renderer.js`: density targets, accumulation, blur/composition, cleanup and diagnostics.
- `src/simple-paint/presentation/high/high-liquid-shaders.js`: new density/activity, blur and liquid shading programs.
- `src/simple-paint/presentation/high/high-paint-model.js`: displacement persistence, velocity lighting and local moving-front pressure.
- `src/simple-paint/presentation/high/high-paint-renderer.js`: world-scaled blur and restrained marker.
- `experiments/simple-paint-webgl/panel.html`: density-buffer dimensions in diagnostics.
- `tests/simple-paint-liquid.test.mjs`: new disturbance/pause/pressure/decay/buffer-budget coverage.
- `tests/simple-paint-quality.test.mjs`: framebuffer lifecycle/failure and runtime fallback coverage.
- `tests/simple-paint-world-space.test.mjs`: updated density-splat/blur scaling expectations.
- This report and cross-references in the earlier quality/zoom reports.

Validation: 76 focused tests pass (49 quality, liquid, world-space, input, Standard, assignment and preset checks; 27 existing persistence and Simple Draw regressions). `git diff --check` passes. Tests confirm that untouched outer material has no activity, pause reduces activity with a constant pool, front pressure follows motion and disappears on release, displacement energy decays continuously, camera changes preserve simulation/authoring, targets resize/release safely, and incomplete framebuffers fall back without touching musical input.

Browser observations in the production-renderer comparison:

- Slow: a continuous coloured body parts around the finger and forms a readable channel; individual countable dots are no longer the main visual.
- Fast: the front becomes brighter and the wake broadens while staying merged; no comet streaks or particle spray were observed.
- Sharp turn: the old channel lags into a curved, cohesive shape. It remains a lightweight spring/grid approximation, not a scientific fluid solver.
- Pause: flow remains visible while still moving, then becomes nearly invisible after several simulated seconds. Standard's particles remain visible alongside it, making the disturbance-lighting difference clear.
- Release: the body settles/fades and both backends reach zero active particles; High removes its surface after its bounded release envelope.
- Zoom: 50% and 200% resize the body/channel/blur with the world grid while retaining pointer alignment.
- Resize: framebuffer changed from 839×818 to 499×507; density targets changed from 420×409 to 250×254. Viewport overrides were restored.
- Colour: Piano/Bell changes retained their palette identity in the continuous body.
- Actual app: a real High drag created a Simple Draw line. Reloading into Standard restored that line and its ordinary Paint/Uncoil controls. No High/WebGL warnings were observed during the successful checks.

The result reads substantially more like soft glowing liquid than illuminated dust. It is still stylized: broad compressed areas can look like luminous gel, the initial finger insertion briefly lights a ring, and low-resolution/RGBA8 accumulation can reveal grain or saturation at dense peaks. Background refraction was deliberately omitted; the underlying board remains DOM/Canvas and is not sampled by this effect. Full GPU completion timing, forced context-loss browser testing and mobile hardware testing remain outstanding; automated tests cover the failure routes.

Performance: `node tools/paint-quality-benchmark.mjs` (120 warmup + 600 measured frames) reported High mean 0.836 ms, median 0.775 ms, p95 1.116 ms at 1,800 particles; Standard mean 1.428 ms at 224 particles. The prior world-only High mean was approximately 0.67 ms; the added pressure/activity work increases CPU cost modestly. Warm browser render-submission samples were typically around 0.15–0.9 ms, with a cold first-draw sample around 14 ms. These measure queued canvas commands, not GPU completion.

Density targets use half device resolution, capped at 1,024 pixels on their longest side: at most 12 MiB across the three RGBA8 textures, excluding the main drawing buffer/compositor. The example 420×409 targets use about 2 MB total. RGBA8 avoids optional float-render/blend extensions but sacrifices precision; this is a deliberate compatibility/quality tradeoff. Fullscreen blur/shading adds GPU fill cost, especially at higher DPR, despite the small CPU submission time.

Compare at `experiments/simple-paint-webgl/index.html`; app switches remain `?preset=simple-playtest&quality=standard` and `?preset=simple-playtest&quality=high`.
