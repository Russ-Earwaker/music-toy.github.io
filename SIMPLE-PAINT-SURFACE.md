# HIGH liquid surface: audit, implementation and browser evidence

Historical pass: [SIMPLE-PAINT-BASE-DEPTH.md](SIMPLE-PAINT-BASE-DEPTH.md) documents the current shallow-liquid model, which supersedes the abstract-height recovery below.

For the subsequent rendering-only readability pass and current comparison controls, see [SIMPLE-PAINT-OPTICS.md](SIMPLE-PAINT-OPTICS.md). Physical settings in this report remain unchanged.

Implemented in the experimental GPU HIGH backend. Standard mode, music and authored drawing output are unchanged.

1. Actual sources of the square/grid appearance

Final height reconstruction was already a continuous cubic B-spline; simulation advection already sampled bilinearly. NEAREST texture storage did not mean the visible surface was rendered as nearest-neighbour cells. There is one full-frame render triangle, not one patch per cell. Changing texture filtering alone would not fix the observed shape.

The side ridges were Cartesian length/side Gaussian strips, which produced a squared U-shaped footprint. Binary moving-wall velocity coverage and the cross-shaped four-neighbour diffusion stencil also introduced upstream directional bias. These are now radial annulus/angular bow and side lobes, fractional wall coverage, and isotropic nine-point material diffusion. The smoothing coefficient is still 65: this is not extra blur.

The comparison background deliberately drew a 100-world-unit square and grid lines. The square has been removed; reference grid lines can be toggled and are captured correctly for refraction. They are not simulation cells.

The simulation domain did have a hard render cutoff, but centered short comparison gestures did not reach it. It was a separate potential clipping problem, not the main cause of local squared contact. New height/normal diagnostics show rounded contact and smooth diagonal contours; the subpixel normal test changes colour by at most 1/255 for a 0.02-world-unit camera movement.

2. Actual cause of the short visible wake

The G disturbance field did not participate in final shading. Visibility depended on slope smoothstep(.002,.075) and strongly directional specular lighting. A shallow old field could therefore retain height while being almost invisible.

More importantly, the cleared finger interior was assigned full pointer velocity. That transported the depression forward with the finger instead of leaving a channel. Correcting only decay could not repair that. The finger is now a moving boundary with zero interior liquid velocity after projection; transport mobility varies from 0.15 to 1.0 with recovering density. Ridges still advect at fluid speed and the groove fills/flows behind the finger.

The saved baseline fails diagonal, shallow-diagonal and tight-curve channel continuity. The new version passes all three plus horizontal and vertical strokes with 100% coverage in the sampled channel interval. At release +2s the new long-curve fixture draws 26,583 readable pixels versus 5,000 before, about 5.3x. The old version actually retains more total height at that age, confirming that height retention alone did not predict visual persistence.

3. Reconstruction and optical rendering

Coarse fields feed a framebuffer-resolution surface. The existing 16-fetch C2 cubic B-spline now reconstructs material and analytic world-space height derivatives together. No screen-space blur was added. Simulation transport uses explicit bilinear sampling; hardware float-linear filtering is not required.

The shader uses continuous height/slope optical response, without the old visibility cutoff. Neutral, slope-based reflection makes both sides of a groove readable. Actual height drives normal, shadow and refraction, while memory modulates that response. Memory without deformation renders fully transparent. Premultiplied composition was checked over white art so highlights cannot act as additive glowing paint. Instrument tint is only 2.5% of reflection colour.

4. Simulation domain

Desktop field: 192x128 -> 256x160, still 8 world units/cell. World extent: 1536x1024 -> 2048x1280. Coarse-pointer field: 192x128 at 12 units/cell, covering 2304x1536 world units.

A 128-world-unit perimeter falloff modifies height AND its derivative. This makes normals/refraction vanish smoothly before the texture ends. Synthetic tests fill the entire field with displaced height and verify all four visible boundaries, not just a calm typical domain.

Origin following now scrolls only the required 64-world-unit bucket instead of recentering abruptly and dropping half the history. Scrolled fields retain world positions. Extremely long/fast gestures can still eventually lose their oldest history at the finite field's soft boundary.

5. Disturbance memory

The existing RGBA16F material channels are R=density, G=disturbance energy, B=signed world height, A=deformation age. G follows local material velocity, spreads slightly and decays independently of current speed. Stronger movement injects more memory, bounded to 1. A follows the material and controls late physical flattening. No extra memory textures are allocated.

Sleep detection includes memory and height; quiet velocity cannot discard a visible wake. Flat remembered material is explicitly tested to remain transparent.

6. Decay values and physical recovery

- heightRecovery: 4.0s; heightSmoothing: 65; velocityDecay: 2.4/s (all unchanged from the previous round).
- disturbanceDecay: 2.6s, strength weighted to approximately 1.69-3.12s before late settling.
- wakeDiffusion: 12 world-units squared/s; surfaceDepth: 12 world units.
- Age-dependent settling starts after 1.5s and reaches an extra 1.6/s flattening rate by 3.8s. This relaxes actual height as well as memory.
- Safety release ceiling remains 14s; the tested field is quiet before that and cleans up normally.

Measured long-curve recovery, 720x500 fixture (readable alpha >=3/255):

| Release age | Readable pixels | Total alpha vs release | Absolute height vs release |
| --- | ---: | ---: | ---: |
| 0s | 68,563 | 100% | 100% |
| 0.5s | 58,476 | 71.4% | 70.8% |
| 1s | 48,198 | 50.4% | 49.0% |
| 2s | 26,583 | 24.4% | 21.8% |
| 4s | 0 | 0.48% | 0.90% |

Age is local to each region. The start of a long stroke settles earlier than its newest end.

7. Swept injection

Each substep uses distance to the complete previous/current pointer segment with a smooth C2 radial depression kernel. Side ridges follow the swept capsule; bow compression remains local and directional. Both elapsed time and travel select substeps, capped at 16. Response also includes travel so sparse fast input does not produce weak separated stamps. One 440-world-unit input jump is tested for an unbroken groove.

8. Performance

NVIDIA GeForce RTX 2070 SUPER / ANGLE D3D11, 960x600, 60 warmup and 120 measured frames per batch, before/after/after/before order:

| Metric | Before | After |
| --- | ---: | ---: |
| GPU interval range | 0.184-0.198 ms/frame | 0.260-0.279 ms/frame |
| GPU interval mean | 0.191 ms/frame | 0.269 ms/frame |
| CPU batch submission wall mean | 0.043 ms/frame | 0.043 ms/frame |
| Field texture allocation | 1,441,808 bytes | 2,403,024 bytes |
| Simulated cells | 24,576 | 40,960 |

Final GPU cost is approximately +41%, or +0.079 ms/frame on this GPU; memory is +67%. Earlier warmed batches varied (about +26%), so these are local measurements, not universal timings. The benchmark excludes scene capture, UI, activity readbacks and compositor; it is not an app FPS guarantee. Raw results include renderer identification in artifacts/liquid-audit/performance.json.

The larger domain costs solver work. Memory lifetime itself adds no textures; reconstruction remains 16 material fetches per fragment. Nine-point material diffusion adds four bilinear samples to one solver pass. Sparse large input events may use extra substeps beyond this smooth-input benchmark. Touch/mobile performance is not measured. HIGH remains experimental.

9. Screenshots, comparison page and validation

Open /experiments/simple-paint-fluid/index.html on your existing local server. Choose Long Curve at 100%, then use the freeze-after-complete-gesture release/+0.5/+1/+2/+4 buttons. Long Straight, Diagonal, Shallow Diagonal, Vertical, Tight Curve, Sharp Turn, Slow Long Stroke and 50%/200% were also captured. Snapshot replay sends identical world input to both backends and waits for both to acknowledge every fixed step.

- [Release](artifacts/liquid-audit/longCurve-0ms.png)
- [+0.5s](artifacts/liquid-audit/longCurve-500ms.png)
- [+1s](artifacts/liquid-audit/longCurve-1000ms.png)
- [+2s](artifacts/liquid-audit/longCurve-2000ms.png)
- [+4s](artifacts/liquid-audit/longCurve-4000ms.png)
- [Saved pre-change HIGH at release](artifacts/liquid-audit/before-longCurve-0ms.png)
- [Diagonal](artifacts/liquid-audit/diagonal-0ms.png)
- [Height diagnostic](artifacts/liquid-audit/diagnostic-height.png)
- [Normal diagnostic](artifacts/liquid-audit/diagnostic-normals.png)

The diagnostics menu offers height, memory, velocity magnitude, domain falloff and normals. Production never enables these views. The 2x long curve exceeds the viewport width naturally; viewport clipping is distinct from simulation clipping.

Run from the repository root:

~~~text
node --test tests/simple-paint-fluid.test.mjs tests/simple-paint-refraction.test.mjs tests/simple-paint-quality.test.mjs
node tools/liquid-surface-qa.mjs tests
node tools/liquid-surface-qa.mjs compare
node tools/liquid-surface-qa.mjs benchmark
~~~

21 targeted Node tests and 42 real WebGL checks pass. Coverage includes four domain edges, circular/rotated contact, sparse swept inputs, diagonal/curve continuity, progressive visible/height/memory recovery, subpixel normals, light-art composition, scrolling, zoom and cleanup. Reports are saved in artifacts/liquid-audit/.

The runner uses local ports 9191/9192 and Chromium CDP 9236 and closes its browser. CHROME_PATH overrides the executable; FLUID_ANGLE=swiftshader explicitly selects the much slower software renderer. Pre-change sources in artifacts/liquid-audit-baseline/ exist only to reproduce the benchmark and baseline evidence. The baseline-audit command collects the subset of diagnostics that the older engine supports, not a full passing run of the new suite.

10. Assessment and limitations

On these presets HIGH now exceeds the particle prototype in smoothness, continuous channel length, grain-free surface detail and controlled recovery. The long wake is clearly connected at release and remains more readable at +2s; by +4s the surface is essentially flat. Inspected height, normal, diagonal and curve captures show no obvious simulation cells or rectangular cutoffs.

This remains a stylized 2D velocity/height model, not a volume-conserving 3D free-surface solver. Refraction relies on registered board-art capture. Touch hardware and more varied user art still need visual/performance review. The finite field and hardware-dependent cost remain practical limits.

Changed implementation files: fluid-config.js, fluid-shaders.js, gpu-fluid.js and high-fluid-renderer.js under src/simple-paint/presentation/fluid/. Comparison presets/controls are under experiments/simple-paint-fluid/ and the shared panel is experiments/simple-paint-webgl/panel.html. Tests and the developer QA runner accompany the implementation; the browser profile is ignored by git. No authored project/audio code was changed.
