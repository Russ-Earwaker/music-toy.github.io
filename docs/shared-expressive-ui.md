# Shared expressive-toy UI pass

Simple Draw now has a transparent surface and wrapper, persistent circular Draw / Scissors / Black Paint tools, and one adjacent group for the active tool's actions. The musical line remains dominant; controls come next, and the frame is a subtle hover/focus boundary. Canvas bounds and logical fitting insets remain unchanged.

## Duplication and shared foundations

Previously Simple Draw had a dark radial surface, a second translucent wrapper, a fixed top tool strip, a fixed bottom action strip, private pressed-button styling, and local container control positioning. Art Toys and classic toys also rebuilt the same circular Clear/Enter/Random layers and asset assignments independently.

`expressive-layout.css` now provides surface, palette, primary-tools, contextual-actions, handle, and structural-actions slots, including spacing, wrapping, transparent clipping, control reset, disabled/hidden handling, and container action placement. Art Toys use the contextual slot while retaining their own outside-frame placement and visibility state. Simple Draw never accesses Art Toy global visibility or effect picker state.

`circular-control.js` provides `createControl` presets and named Clear, Enter Board, Random, and Move helpers. They use the existing three circular layers and canonical UI assets. Clear shares the existing red accent. Existing elements can be decorated without losing classes, data, or listeners. Simple Draw, the base Art Toy controls, and classic Clear/Random buttons now use these helpers; effect-specific Art controls remain intact. Art accessibility descriptions and delegated action attributes are preserved; the base Enter tooltip reads Enter Board.

`free-play.css` no longer owns dark backgrounds, top/bottom strips, button resets/sizing, pressed styling, or handle/menu layout. It retains canvas interaction, hints, paint cursor, creation effects, and Simple Draw geometry. Pressed/focus feedback lives in `circular-button.css`; there are no new looping animations.

Draw shows Straighten/Re-coil, Clear, and the existing content-move action. Scissors shows Random Cuts and Heal All. Paint shows Random Paint and Wipe All, including paint before a line exists. Container Enter Board, Expand, and Delete retain their existing handle menu and event paths.

## Future toys

Bouncer can place Ball/Cube in `expressive-primary`, Random/Clear in `expressive-context`, its simulation in `expressive-surface`, and Enter/structural controls in the container slot. Ripple can use the same slots with its own tools. Neither requires Simple Draw positions or Art Toy state. Neither toy was implemented. Surface insets are CSS variables supplied by each presentation; Simple Draw retains its existing 76/58 logical surface spacing.

## Verification

Run on Windows with Chrome installed:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tests/run-expressive-ui.ps1
```

The runner uses an isolated headless Chrome profile and cleans up generated adapters/profile files. Node is unavailable on this machine, so the existing model test bodies run through a browser adapter for their used `node:test`/strict-assert APIs; their source files are unchanged.

- 105 existing model tests passed: drawing, morphing, fitting, local tidy, scissors, silence/paint, random actions, line-local heal/wipe, canonical playback, Open/Expand, multiple containers, ownership, and JSON save/reload.
- 44 browser UI assertions passed in each screenshot run: persistent tools, exclusive pressed state, contextual visibility, matching Clear layers/assets, transparency, canvas dimensions, instance independence, paint creation/removal, random paint/cuts, wipe/heal, swipe scissors, tap heal, straighten/recoil, Clear, paint-before-drawing, handle-menu visibility, Enter wording, Open/Close, and Expand.

Comparison screenshots use the live Simple Draw surface with a deterministic model adapter, the real Flash Circle Art Toy factory, and classic Loopgrid UI initialization. Flash Circle is the representative Art Toy. The Loopgrid comparison covers chrome, rather than a full sequencer body. These are component fixtures, not full saved-board captures. Full-app audio and manual touch/zoom end-to-end testing remain unverified.

- [Draw comparison](../artifacts/expressive-draw-comparison.png)
- [Scissors comparison](../artifacts/expressive-scissors-comparison.png)
- [Paint comparison](../artifacts/expressive-paint-comparison.png)
- [Model results](../artifacts/expressive-model-results.txt)
- [UI results](../artifacts/expressive-draw-results.txt)

## Files changed

- `index.html`: load shared layout stylesheet.
- `expressive-layout.css`: new reusable layout slots.
- `circular-button.css`: shared pressed/focus feedback.
- `free-play.css`: remove bespoke layout/chrome; retain drawing geometry and effects.
- `src/circular-control.js`: common control presets/helpers.
- `src/simple-draw-surface.js`: palette/context slots and shared controls.
- `src/free-play-tools.js`: shared Random/Wipe presets and palette insertion.
- `src/container-board.js`: shared handle/actions and Enter Board wording.
- `src/art/base-art-toy.js`: shared layout classes and move preset.
- `src/art/art-toy-factory.js`: base Clear/Enter/Random presets.
- `src/toyui.js`: classic Clear/Random presets.
- `style.css`: Art contextual flex layout moved to shared CSS; Art positioning retained.
- `tests/expressive-ui.browser.html`, `tests/expressive-model-regression.browser.html`, `tests/run-expressive-ui.ps1`: reproducible browser checks.
- `artifacts/expressive-*-comparison.png`, `artifacts/expressive-*-results.txt`: comparison images and results.
