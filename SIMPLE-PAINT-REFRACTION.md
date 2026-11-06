# High Simple Paint: clear gel first pass

High (`quality=high`, GPU field backend) now refracts a scene texture instead of filling its disturbance with instrument colour. Density and advected disturbance gradients form an optical normal; UV displacement follows world zoom. A soft directional white meniscus and very faint instrument-coloured edge/compression accent define the surface. Existing disturbance decay returns it toward invisible. Standard and the historical particle comparison backend are unchanged. No musical, authored-data, scheduling or persistence code changed.

## Scene input and future painted backgrounds

`fluid-scene.js` assembles a screen-space Canvas2D scene each active frame: board dots, current Simple Draw / DrawGrid canvases, and the live authoring SVG path. The GL engine uploads that canvas and samples it with displaced UVs. The local overlay replaces the underlying scene within the disturbance mask, avoiding a doubled undistorted line beneath a translucent refracted copy. Outside that mask it remains transparent.

Future art can supply a visible canvas via `getBackgroundLayer()` in presentation options, or mark it `data-fluid-background`. Its bounding rectangle defines screen alignment; it must be an origin-clean canvas. Call presentation `refresh()` when changing art while the effect sleeps. No simulation change is required. The GL `render({background})` contract also accepts a precomposited scene directly, allowing a future shared board renderer to bypass this capture adapter.

Scene capture caps resolution at 1 pixel per CSS pixel, independently of the liquid framebuffer DPR. It runs only during active/render-refresh frames; stop releases its backing memory and GL destruction deletes the scene texture. This introduces a scene copy/upload cost that still needs profiling on target devices.

## Files and checks

- `fluid-scene.js`: scene source adapter.
- `fluid-shaders.js`: refractive composite and subtle edge shading.
- `gpu-fluid.js`: owned scene texture and render input.
- `high-fluid-renderer.js`: capture/lifecycle integration.
- `tests/simple-paint-refraction.test.mjs`: scene composition, alignment, hidden layers, provider deduplication, disposal.
- `tests/simple-paint-refraction.browser.html`: replayable checkerboard / art-line fixture; real GPU assertions for displaced background, secondary colour and GL errors.

37 targeted Node tests pass across refraction, GPU field, quality routing, interaction and assignment. `git diff --check` passes. Browser verification could not run: the browser automation host was unavailable. The GPU fixture is added but its new assertions and visual result have not been verified in this session.

## First-pass limits

This is a normal-like distortion approximation, not ray tracing or an optical thickness simulation. The adapter reconstructs the board pattern and selected drawing sources; it does not capture arbitrary DOM backgrounds, controls, text, CSS filters, clipping or every stacked toy decoration. Those can differ under the local replacement mask. Future painted background canvases are directly supported; full scene fidelity should ultimately come from a shared board/art render target. Numerical fluid limitations from `SIMPLE-PAINT-GPU-FLUID.md` remain. Appearance, zoom alignment and upload performance still require live visual review.
