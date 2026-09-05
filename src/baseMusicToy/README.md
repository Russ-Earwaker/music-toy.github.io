# Square canvas toys

Bouncer and Rippler use the shared surface and lifecycle helpers exported by `index.js`.
For a new square canvas toy:

1. Initialize the panel chrome with `initToyUI` before mounting the canvas.
2. Call `getToyLifecycle(panel)` once and `mountToySurface(panel, canvas)`.
3. Call `surface.resize(ctx)` before drawing. It uses unscaled layout dimensions and
   the existing shared DPR utility. The canvas opts out of the global layout manager.
4. Use `lifecycle.requestFrame(callback)` for each render/UI loop and reschedule
   through that same method. It deduplicates pending callbacks and cancels them on removal.
5. Register listeners through `lifecycle.listen` and observers or other resources
   through `lifecycle.addCleanup`. Expose `dispose: lifecycle.dispose` on the toy API.

`style.css` owns the square body, surface, canvas fill, and advanced-view sizing.
Do not add per-toy square-fit scripts, inline canvas dimensions, or separate body
overrides. Put overlays inside `surface.host`; use toy-specific classes only for
artwork and controls. Other toy aspect ratios can be added as explicit layout variants.

Dispatch `toy-remove` or `toy:remove` on a panel before permanent removal. Synchronous
reparenting (such as advanced view) does not dispose it. Frame callbacks also detect
detachment after mounting as a fallback; hiding a connected panel preserves its state.
