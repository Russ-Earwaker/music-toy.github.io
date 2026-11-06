# HIGH liquid: rendering-only readability pass

Historical pass: the current physical depth model and depth-dependent optics are documented in [SIMPLE-PAINT-BASE-DEPTH.md](SIMPLE-PAINT-BASE-DEPTH.md).

This pass changes optical mapping and development comparison fixtures. It does not extend the simulation. Standard/particle behaviour, music and authored output are unchanged.

1. Why diagnostics were readable but the final surface was weak

Height/memory diagnostics use direct false-colour values. Final rendering instead had a weak height term, a predominantly slope-dependent meniscus, and only a small memory multiplier. As slopes flattened, there was still height and memory but too little local reflection/refraction contrast. The old refraction coefficient was 22 + 10*memory, and its background replacement coverage was also weak for shallow deformation. Distorting almost uniform black contributes virtually no visible cue.

The new QA separates overlay alpha from composited contrast. Overlay alpha includes replacement with a sample of the background; it is not a measure of white opacity or perceptual visibility. Both before and after use the SAME new test backgrounds for quantitative comparison.

2. New optical-strength inputs

Let H=absolute height, S=world-space height-gradient magnitude, M=memory, and C=height curvature. All values come from the same continuous surface reconstruction.

~~~text
physicalMask = 1 - exp(-0.32*H - 12*S)
memoryPhysicalGate = 1 - exp(-2*H - 28*S)
recent = sqrt(clamp(2.5*M, 0, 1)) * memoryPhysicalGate
optical = 1 - exp(-10*S - 0.07*H - 0.5*recent)
normalGain = 2.2 * (1 + 1.2*recent)
~~~

The square-root memory response makes lower-energy recent wake useful without inventing a new lifetime. Exactly flat height/gradient gives zero gate, zero optical response, zero refraction and zero meniscus even with full memory. A synthetic shallow groove with identical geometry has 3.41x more composited art contrast with strong memory than without it. Instrument-independent and no-flat-blob tests pass.

3. Refraction strength

The old world displacement was slope*(22 + 10*memory). The new raw displacement is slope*(40 + 140*recent), smoothly bounded with:

~~~text
offsetWorld = raw / sqrt(1 + dot(raw,raw)/100)
~~~

This asymptotically caps lensing at 10 WORLD units, then scales it with the board camera. Shallow slopes receive a stronger optical signal; large slopes cannot produce unbounded lensing. There is no temporal wobble, artificial oscillation or discontinuous UV offset. Refraction-only is a separate development view.

Background replacement coverage is now 1-exp(-0.9*H-24*S-recent), capped at 0.95. It replaces background with REFRACTED BACKGROUND, not white paint. Art remains visible through the surface. Coverage was strengthened alongside distortion so resampling is not mostly diluted away when a real shallow groove remains.

4. Height versus slope

Slope still determines normals and directional distortion. Absolute height now contributes meaningfully to physical gating, optical strength, background replacement, and signed thickness contrast. This allows a broad shallow groove to remain readable without relying exclusively on sharp edges.

Thickness uses height/(abs(height)+2), softened by a height response, to brighten raised material and darken the depression by a few percent. The body is neutral. Transmission is clamped correctly for light artwork and uses valid premultiplied composition.

5. Meniscus, edge and specular treatment

The meniscus response includes slope, recent memory and a modest curvature term. Curvature is the analytic second derivative of the existing cubic B-spline, using the SAME 16 material fetches; no extra surface texture or blur pass was introduced.

~~~text
edgeStrength = 1 - exp(-S*(12+36*recent) - abs(C)*(7+10*recent))
~~~

This strengthens bow, side ridges and healing boundaries, while directional reflection and a small curvature highlight keep the response shape-dependent. Total reflection is capped at 0.42 rather than becoming an opaque outline. Normal response is amplified only where actual deformation and memory coexist. No cursor-centred glow or disturbance-only fill was added.

6. Instrument tint

Highlights and meniscus use 5-10% instrument tint: 5% on older reflection, up to 10% for fresh memory. Refraction and transmitted body remain neutral. REFRACTION ONLY is bit-identical across red/blue instrument inputs, and FINAL WITHOUT TINT is fully instrument independent. The simulation and musical response are untouched.

7. Comparison backgrounds, views and captures

Open /experiments/simple-paint-fluid/index.html on your existing local server. Background options are Dark, Grid and Colour Art. The fixed art is world-attached and includes broad coloured strokes, a gradient and simple shapes, registered as a real captured background canvas. It does not write authored art.

Choose Long Curve, then use the bottom 'Freeze after complete gesture' buttons. Background and diagnostic selections are preserved. Both panels receive identical synthetic inputs and acknowledge every step before capture.

| Release age | Dark | Grid | Colour Art |
| --- | --- | --- | --- |
| 0s | [Capture](artifacts/liquid-optics/dark-0ms.png) | [Capture](artifacts/liquid-optics/grid-0ms.png) | [Capture](artifacts/liquid-optics/art-0ms.png) |
| +0.5s | [Capture](artifacts/liquid-optics/dark-500ms.png) | [Capture](artifacts/liquid-optics/grid-500ms.png) | [Capture](artifacts/liquid-optics/art-500ms.png) |
| +1s | [Capture](artifacts/liquid-optics/dark-1000ms.png) | [Capture](artifacts/liquid-optics/grid-1000ms.png) | [Capture](artifacts/liquid-optics/art-1000ms.png) |
| +2s | [Capture](artifacts/liquid-optics/dark-2000ms.png) | [Capture](artifacts/liquid-optics/grid-2000ms.png) | [Capture](artifacts/liquid-optics/art-2000ms.png) |
| +4s | [Capture](artifacts/liquid-optics/dark-4000ms.png) | [Capture](artifacts/liquid-optics/grid-4000ms.png) | [Capture](artifacts/liquid-optics/art-4000ms.png) |

Views: FINAL, HEIGHT, NORMALS, MEMORY, REFRACTION ONLY, EDGE/SPECULAR ONLY and FINAL WITHOUT TINT, plus the earlier velocity/domain diagnostics. Component captures at +2s and 0.5x/2x art captures are saved in artifacts/liquid-optics/. Saved before-* screenshots use the exact pre-pass renderer with identical new backgrounds.

8. Perceived wake and audit

Human inspection: at release, connected side ridges and the recent curve are clearly traceable; at +1s the wake is obvious and softer; at +2s grid/art distortion and a shallower meniscus remain readable; at +4s the board is essentially restored. On plain dark, reflection and shading necessarily do more work because there are no image features to refract. The oldest start of a long gesture continues to flatten earlier than its newest end.

Composited contrast integrates absolute RGB difference from the bare background AFTER transparent blending, not just alpha or stored height. At +1s the gain versus the pre-pass renderer is 2.19x on dark/grid and 2.38x on art. At +2s it is 1.92x on dark/grid and 2.08x on art.

| Release age | Remaining absolute height | Remaining memory | Remaining slope | New grid contrast vs release | New art contrast vs release |
| --- | ---: | ---: | ---: | ---: | ---: |
| 0s | 100% | 100% | 100% | 100% | 100% |
| +0.5s | 70.8% | 72.9% | 64.6% | 76.7% | 78.3% |
| +1s | 49.0% | 50.6% | 43.6% | 53.8% | 54.5% |
| +2s | 21.8% | 20.4% | 18.8% | 23.5% | 24.1% |
| +4s | 0.90% | 0.56% | 0.68% | 0.58% | 1.04% |

The complete physical field hashes match before/after at ALL five ages. Height, memory, age, density and physical slope are unchanged; more of the existing deformation becomes perceptible. At +4s the remaining contrast is around 1% or less of release, not an 8-10 second optical tail. Counts supplement rather than replace screenshot review.

9. GPU cost

RTX 2070 SUPER, ANGLE D3D11, 960x600, 60 warmup + 120 measured frames per batch, before/after/after/before ordering:

| Metric | Before | After |
| --- | ---: | ---: |
| GPU interval mean | 0.240 ms/frame | 0.260 ms/frame |
| GPU interval range | 0.234-0.247 | 0.247-0.273 |
| CPU batch submission mean | 0.044 ms/frame | 0.053 ms/frame |
| Field allocation | 2,403,024 bytes | 2,403,024 bytes |

The extra optical treatment measured approximately +0.019 ms/frame, about 8%, with overlapping run variability. This is an isolated whole-engine batch, not an app FPS guarantee; scene capture, compositor, UI and activity probes are excluded. Solver work is unchanged, so the delta comes from reconstruction/optical ALU. Material reconstruction remains 16 fetches per fragment; curvature reuses them. The new art background is drawn only when its mode/camera changes and captured through the existing background path. Mobile performance remains unmeasured.

10. Physical values and validation

No physical values needed changing. fluid-config.js, gpu-fluid.js, high-fluid-renderer.js and the solver shader prefix are byte-for-byte unchanged versus artifacts/liquid-optics-baseline/. In particular: heightRecovery=4.0s, heightSmoothing=65, disturbanceDecay=2.6s weighted, velocityDecay=2.4/s, age settling, domain size, injection and advection all remain the same.

21 targeted Node tests and 58 real WebGL checks pass. Added optical checks cover actual contrast across backgrounds, progressive recovery, strong memory on shallow geometry, completely flat memory remaining invisible, component rendering not mutating fields, neutral transmission, tint isolation, and translucent reflection. Before/after auditing additionally enforces matching physical hashes and at least 1.5x contrast gain at +1s/+2s on all backgrounds.

~~~text
node --test tests/simple-paint-fluid.test.mjs tests/simple-paint-refraction.test.mjs tests/simple-paint-quality.test.mjs
node tools/liquid-surface-qa.mjs optics-tests
node tools/liquid-surface-qa.mjs optics-audit
node tools/liquid-surface-qa.mjs optics-baseline
node tools/liquid-surface-qa.mjs optics
node tools/liquid-surface-qa.mjs optics-benchmark
~~~

Raw evidence is in artifacts/liquid-optics/{before-audit,after-audit,summary,performance}.json. Snapshot sources used for reproducible before comparisons are in artifacts/liquid-optics-baseline/. Browser profiles are ignored by git; the QA runner closes its browser/server.

Changed product rendering: the composite portion of src/simple-paint/presentation/fluid/fluid-shaders.js only. Development changes: comparison background helper, shared panel/controls, optics browser test, QA runner and reports. No source outside that rendering/QA scope was changed in this pass.

This remains experimental. On the tested fixtures the surface is more cohesive and material-like than the particle comparison, without needing to be brighter. Very plain backgrounds cannot demonstrate refraction alone; viewing conditions and varied real artwork still affect readability. Touch-device and wider GPU validation remain outstanding.
