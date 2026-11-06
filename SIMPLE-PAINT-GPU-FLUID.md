# High Paint: independent GPU fluid experiment

The particle implementation is retained as a successful reference prototype. The new High backend is an Eulerian GPU velocity/density simulation; it does not inherit the particle model, rest springs, neighbour hash, parcel energy array, splat shaders or old High board renderer.

## Selection and comparison

- Standard remains the default, including `?preset=simple-playtest`.
- `?preset=simple-playtest&quality=high` now loads the GPU field experiment.
- Add `&highBackend=particles` to load the previous High particle prototype explicitly.
- `experiments/simple-paint-fluid/index.html` compares those two High backends with identical deterministic gestures/timestamps.
- The existing `experiments/simple-paint-webgl/index.html` compares Standard with the new High field.

There is no persisted quality/backend setting or change to project format.

## Shared boundary

Both experiments receive the existing `consume(state)` presentation events from the existing input adapter. The new implementation reuses only normalized world input, the shared board transform, DrawGrid's 1:1 interaction-radius reference, instrument colour and the lifecycle/fallback contract. It owns no input listeners, authored paths, notes, transport, musical timing or save objects. Its tiny cursor is a presentation affordance.

`createGPUFluid(gl)` takes a context rather than owning a toy or canvas, so it can later join a shared board surface. The thin High renderer currently creates one transparent pointer-ignoring canvas for the active Paint interaction, handles timing/resize/presentation, and releases it on shutdown. No other toys were migrated.

## GPU simulation

- Desktop: 192×128 cells, 8 world units per cell, 1536×1024 world-unit domain.
- Coarse pointer: 128×96 cells, 12 world units per cell, 1536×1152 world-unit domain.
- Fixed world extent/resolution; camera zoom and DPR never change the simulation.
- Velocity, material and pressure use separate RGBA16F ping-pong textures. Material R is liquid density; G is independent disturbance. Divergence and reduction targets are separate.
- Each substep advects velocity, applies viscosity/damping and moving-wall interaction, computes divergence, performs 14 pressure Jacobi iterations, projects velocity, then transports density/disturbance through the resulting velocity field.
- Manual bilinear sampling avoids a float-linear-filter extension requirement. The passes replace their targets; float blending is not required.
- Material density is initially uniform and invisible. The moving 48.6-world-unit finger clears an actual density hole. A smoothed coverage mask reduces coarse-grid edge artifacts.
- Only moving contact injects disturbance, weighted by approach direction and material presence. Disturbance advects on the GPU and decays with a 1.25-second time constant. It is not a particle lifetime or CPU trail.
- Density diffusion (420 world units²/s) and advection refill the channel; no rest targets or particle recycling exist.
- The world-aligned domain scrolls near its edges. Advection resamples the old fields into the new origin, preserving the overlapping wake; newly exposed cells enter as calm liquid.

The solver is deliberately low resolution and approximate. This is not a converged, mass-conserving free-surface liquid solver. The moving-wall treatment and density diffusion are pragmatic visual choices. The pressure solve currently reduces residual divergence modestly; stronger incompressibility is a next tuning area.

## Presentation and lifecycle

The composite directly shades transported density/disturbance with a density-gradient highlight and local pressure/flow. No particle rendering or accumulation/blur pipeline from the prototype is reused. Instrument colour supplies the base hue; boundaries can become paler. Calm liquid remains transparent. Pan/zoom use the existing world transform only, and resize changes the drawing buffer without rebuilding fields.

An on-GPU reduction finds peak disturbance/velocity, read back as one RGBA8 pixel at 250 ms intervals. Quiet held interactions suspend animation and resume on motion. Duplicate stationary events do not wake them. A sleeping field can redraw a changed camera without advancing physics. Release continues transport/settling, then destroys resources at the activity threshold; a 7.5-second safety ceiling bounds exceptional tails. Cancel, hidden-document and context-loss paths stop work and free resources.

WebGL2 plus `EXT_color_buffer_float` are required. Missing capability, shader/allocation/framebuffer failure or context loss uses the existing Standard fallback. The [Khronos extension specification](https://registry.khronos.org/webgl/extensions/EXT_color_buffer_float/) defines the float render/readback support used here. Reduced motion continues to use Standard.

## Validation and measured baseline

92 focused Node tests pass, including the retained prototype/Standard regressions, actual authored input/persistence checks, backend selection/fallback, field dispatch without framebuffer feedback, allocation cleanup, transform handling, idle sleep/resume and bounded asynchronous timing queries.

`tests/simple-paint-fluid.browser.html` runs 13 assertions on real GPU data. This desktop run passed all 13 with no WebGL error:

- Stationary contact injected no disturbance and cleared density inside the finger.
- Disturbance travelled about 34 world units during a half-second released-flow interval and decayed through the GPU transport pass.
- Mean density in the sampled hole rose from 0 to 0.181 after half a second.
- Divergence RMS fell from 0.11890 to 0.11466 across the projection: a modest ~3.6% reduction in this steady-motion sample, not evidence of strict incompressibility.
- Camera-only renders left all simulation values unchanged. Visible horizontal extents were 120, 241 and 481 pixels at 50%, 100% and 200% zoom.
- Domain scrolling retained existing disturbance; the activity reduction matched the full material-field peak.
- Simulation textures total 1,441,808 bytes, excluding the main canvas/compositor.

The comparison fixture displays CPU command-submission/render time and optional asynchronous GPU elapsed queries. Activity-readback waits are recorded separately and excluded from the timer interval. In light-load samples the field submitted simulation/render commands in roughly 0.07–0.4 ms per stage. The batched two-context comparison produced highly variable GPU intervals, including extreme scheduling/load outliers; those HUD values are diagnostics, not a reliable standalone benchmark.

`experiments/simple-paint-fluid/benchmark.html` therefore measures the field alone after 60 warmup frames, over 120 measured frames. One desktop run reported **0.445 ms/frame GPU interval** and **0.077 ms/frame submission wall time**, with no GL error. Those are separate measurements, not end-to-end frame latency. The benchmark deliberately excludes activity probes, initial compilation/allocation and the browser compositor. No frame-rate or mobile performance guarantee is established, and the particle prototype's CPU times are not directly comparable to a GPU simulation. The Node CPU benchmark now labels its archived High result `particle-prototype` to avoid presenting it as the new GPU backend.

Browser comparison exercised slow/fast input, turns, loops and a long pause. The new backend displayed continuous field boundaries and a retained channel, became dormant after settling, redrew a 50% camera change while dormant, and reached zero active cells/resources after release. This validates lifecycle and transport integration; it does not establish a visual-quality win over the successful prototype.

## Visual assessment and next work

The new field creates a continuous pressure edge and wake from transported grid data, with no countable particle texture. It is a new simulation foundation rather than an architecture-preserving polish pass. The particle version remains a useful visual reference; superiority of the new field is not yet established. Low-resolution obstacle boundaries, numerical diffusion and the modest pressure projection need further tuning. Refraction is deferred because the underlying DOM/Canvas board is not available as a safely sampled scene texture.

Changed files: new `src/simple-paint/presentation/fluid/` modules (configuration, shaders, GPU engine, renderer and timing); presentation-adapter backend routing; new `experiments/simple-paint-fluid/index.html` and `benchmark.html`; existing comparison panel/caption; new Node and GPU-browser fluid tests; CPU benchmark label; this report. Standard and all authored/musical/persistence implementation files are unchanged by this pass.
