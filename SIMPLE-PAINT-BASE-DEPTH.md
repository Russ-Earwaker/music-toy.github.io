# HIGH Simple Paint: shallow liquid over a solid base

Implemented in the HIGH GPU backend. Standard mode, musical input and authored Paint output are unchanged. This report supersedes the abstract-height interpretation in the earlier surface and optics reports.

## 1. Rest depth

`HIGH_FLUID.restDepth = 8` world units. The solid board is depth zero. The material texture stores `depth - restDepth` in B, so a cleared texture is a flat layer eight units deep; B = -8 reaches the base. Depth is clamped nonnegative. R exposes the depth/rest ratio; G and A retain disturbance memory and age. Depth buffers use float32 to avoid losing small conservative transfers near equilibrium.

## 2. Pointer displacement

A smooth radial world-space kernel depresses actual thickness toward zero. Swept capsule sampling joins successive positions, retaining circular contact and continuous fast strokes. A stationary press works independently of velocity. `pressRate = 48` controls the approach; movement adds displacement response without changing the base radial geometry. Existing world radius, scrolling domain, cubic reconstruction and world normals remain.

## 3. Redistribution

Each substep measures the depth actually removed. A second pass gathers this quantity into a normalized 16-tap annulus. Motion biases the side ridges and bow wave; zero motion produces a ring. Deposits come from removed depth, so holding does not continuously emit material. The contact normalization and transfers use float32.

## 4. Conservation

In the stationary two-second test, summed removed depth was 462.8747 and raised depth 462.8570: a 0.0038% mismatch relative to displaced volume. Equal cell areas cancel in this comparison. Slow, fast, loop and diagonal drag errors were approximately 0.00473%, 0.000292%, 0.000707% and 0.0000787%. Coarse-field error was 0.00198%.

Recovery uses paired, antisymmetric, positivity-limited fluxes rather than deleting height. It is approximate conservation, not a closed scientific solver: floating-point drift remains, and history leaving the finite scrolling domain is discarded. Conservation measurements above concern disturbances inside the domain.

## 5. Base contact

At zero depth, refraction and overlay alpha become zero: the real underlying artwork is visible directly. No texture is erased or painted black. Browser tests check unchanged base-canvas bytes and zero centre overlay alpha. The separate GPU cursor ring was removed; the surface geometry provides the contact cue. Calm, flat liquid is optically neutral, including when disturbance memory remains.

## 6. Refraction versus depth

Refraction depends on reconstructed slope and actual depth D. Its depth multiplier is `1.5 * D / (D + 0.5 * restDepth)`, with a near-base wetness gate. Optical displacement is smoothly limited by `min(6, 0.65 * D)` world units. Thus zero depth gives no refraction, rest depth gives normal response, and raised ridges bend the background more strongly at equal slope. This is an optical approximation, not ray tracing.

## 7. Meniscus

Raised, sloping liquid catches neutral highlights with a subtle instrument tint. A small depth-boundary term gives the low channel a contact rim. The main reflection is gated by depth so the partially refilled channel does not receive the full ridge reflection. A soft highlight patch is still visible during partial refill on dark backgrounds; further optical tuning may improve that transition.

## 8. Channel closure

An isotropic nine-point pressure/leveling flux moves depth from ridges into the channel, with depth-dependent drag on advection. Fresh deformation retains `heightSmoothing = 65`. Age increases mobility toward `closureDiffusion = 420`, then adds `lateLevelingDiffusion = 1600`; `heightRecovery = 4` controls this age schedule rather than exponential removal. Velocity decay remains 2.4. Memory influences mobility and optical strength but cannot make a flat surface visible by itself.

Measured stationary-release centre depth (rest = 8):

| Time after release | Centre depth |
| --- | ---: |
| 0 s | 0.000054 |
| 0.5 s | 0.071 |
| 1 s | 0.467 |
| 2 s | 4.193 |
| 4 s | 7.671 |
| 6 s | 7.882 |
| 10 s | 7.961 |

The deep groove closes physically, with shallow leveling continuing afterward. It does not become mathematically flat at four seconds. The release lifecycle retains a bounded 14-second ceiling.

## 9. Stationary result

At two seconds held, centre depth is about 0.000054 and the raised ring peaks around 10.21 against a rest depth of 8. Holding sustains the depression and ring without ongoing emission. Release lets the ring collapse inward. Slow strokes, fast strokes and loops produce connected low-depth channels with adjacent raised liquid. Existing zoom, subpixel continuity and scrolling checks pass; captures include 0.5x and 2x slow strokes. Actual touch hardware has not been tested.

## 10. Screenshots and browser review

The GPU field is the **right-hand panel**; the left panel deliberately retains the particle prototype for comparison.

| View | Grid | Colour Art |
| --- | --- | --- |
| Press/hold | [Grid](artifacts/liquid-depth/grid-press-hold.png) | [Art](artifacts/liquid-depth/art-press-hold.png) |
| Slow channel | [Grid](artifacts/liquid-depth/grid-slow-0ms.png) | [Art](artifacts/liquid-depth/art-slow-0ms.png) |
| Fast channel | [Grid](artifacts/liquid-depth/grid-fast-0ms.png) | [Art](artifacts/liquid-depth/art-fast-0ms.png) |
| Loop | [Grid](artifacts/liquid-depth/grid-loop-0ms.png) | [Art](artifacts/liquid-depth/art-loop-0ms.png) |
| Release +1 s | [Grid](artifacts/liquid-depth/grid-press-1000ms.png) | [Art](artifacts/liquid-depth/art-press-1000ms.png) |
| Release +2 s | [Grid](artifacts/liquid-depth/grid-press-2000ms.png) | [Art](artifacts/liquid-depth/art-press-2000ms.png) |
| Release +4 s | [Grid](artifacts/liquid-depth/grid-press-4000ms.png) | [Art](artifacts/liquid-depth/art-press-4000ms.png) |
| Release +6 s | [Grid](artifacts/liquid-depth/grid-press-6000ms.png) | [Art](artifacts/liquid-depth/art-press-6000ms.png) |
| Liquid depth | [Grid](artifacts/liquid-depth/grid-press-depth.png) | [Art](artifacts/liquid-depth/art-loop-depth.png) |

Open `/experiments/simple-paint-fluid/index.html` on the local development server. At 100%, select Grid and FINAL, then use **Press / Hold at 2s**. Check that straight grid lines remain visible in the centre while the ring bends them. Use the release-age buttons through +6s, then repeat with Colour Art and Dark. Run Slow, Fast, Loop, Sharp Turn and Reversal. Switch to LIQUID DEPTH: brown means base/zero, blue means rest depth, gold means raised liquid. Return to FINAL and repeat at 50% and 200%; the footprint should scale with the board.

The existing artwork capture supports registered canvas layers, not arbitrary DOM content.

## 11. Performance and validation

RTX 2070 SUPER, ANGLE D3D11, 960x600 benchmark, 256x160 simulation, 14 pressure iterations, 60 warm-up and 120 measured frames per sample. Two added passes per substep measure displacement and redistribute it. Allocated GPU texture bytes rise from 2,403,024 to 3,713,744 (+54.5%).

The final alternating before/after benchmark measured GPU intervals of 0.234/0.402 ms before and 0.487/0.729 ms after. An earlier run measured 0.257–0.282 ms before and 0.357–0.360 ms after. Timing varies enough that a precise percentage would be misleading. These are isolated batch GPU timings, excluding background capture, activity probes and the browser compositor; they are not application FPS or a mobile performance guarantee. Raw final samples: [performance.json](artifacts/liquid-depth/performance.json).

Validation: 21 targeted Node tests and 96 real-WebGL checks passed (17 core fluid, 25 surface audit, 38 depth, 16 optics). Checks cover rest neutrality, zero-depth contact, conservative redistribution, stationary holding, physical refill, swept continuity, coarse resolution, depth-dependent refraction, artwork integrity and GL errors. `git diff --check` passes.

Reproduce from the repository root:

```sh
node --test tests/simple-paint-fluid.test.mjs tests/simple-paint-refraction.test.mjs tests/simple-paint-quality.test.mjs
node tools/liquid-surface-qa.mjs depth-tests
node tools/liquid-surface-qa.mjs depth
node tools/liquid-surface-qa.mjs depth-benchmark
```

Run browser driver commands sequentially; they share local ports. `depth-before` captures the saved pre-change stationary baseline.

Principal implementation files: `fluid-config.js`, `gpu-fluid.js`, `fluid-shaders.js` and `high-fluid-renderer.js` under `src/simple-paint/presentation/fluid/`; comparison controls under `experiments/simple-paint-fluid/`; depth fixture `tests/simple-paint-depth.browser.html` and QA driver `tools/liquid-surface-qa.mjs`.

Useful future controls: rest depth, press rate, fresh mobility, closure/late-leveling mobility, recovery age, ridge width/bias, contact-rim strength and refraction path cap. The model remains an overdamped 2D depth field with approximate optics, not full 3D gel. Device coverage and the subjective feel of the final refill transition remain the main uncertainties.
