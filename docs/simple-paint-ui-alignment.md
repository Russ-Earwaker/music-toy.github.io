# Simple Paint / Art Toy UI alignment

Simple Paint remains the existing `simple-draw` presentation and container architecture. Drawing restrictions, musical line rendering, cuts, legacy paint silence, transport, canonical DrawGrids and authored fitting are retained.

## Shared chrome

`src/expressive-toy-chrome.js` decorates drag, Clear and Enter buttons for both Art factory/base UI and Simple Draw. Both consume the same circular layers/assets, Art handle CSS, 124-unit handle and 62-unit secondary controls. Simple-specific handle dimensions, offsets and border/background resets were removed. Clear and Enter share Art classes, accents and interaction styling; the volume component keeps its original 42-unit mute button.

Simple's controls start hidden. A pointer tap or keyboard activation of the handle toggles its local `data-controls-visible` state and active appearance. Crossing the Art-style six-screen-pixel slop moves the existing container without toggling UI. Cancel does not toggle. Opening an Art Toy does not close Simple controls, and separate Simple toys retain independent state.

The shared `.expressive-toy-controls` strip sits outside the authored frame, above the toy. Tools and context actions, volume/mute, Clear and Enter participate in this one flex strip. Expand remains a secondary container action there. Simple Paint deletion uses the existing board trash can; its Delete Container button is hidden. Art volume is now part of that same strip. A common minimum-width/wrapping rule applies to both toy families and wraps upward, leaving the musical canvas unobstructed. There is no lower action toolbar.

Draw remains available only in an empty toy, preserving the one-line restriction. For a completed line the initial context shows Straighten/Re-coil and Clear. Scissors shows Random Cuts and Heal All; tapping Scissors again returns to line controls. Black Paint remains unexposed. These are tool-selection/presentation changes only; scissors hit testing and silence behavior are unchanged.

## Volume and persistence

`src/container-volume.js` mounts the existing `baseToy/volume-ui.js` component. It reads the first owned DrawGrid's canonical audio state and publishes existing `toy-volume` / `toy-mute` events to all currently owned DrawGrids. The existing audio and instance policy receives those events. The existing child audio fields continue to save and reload normally; there is no additional saved container volume model or extra audible group gain.

Refresh/reveal/hide only reads canonical audio state. Empty containers disable the slider/mute until they own a playable grid. Expanding a container leaves the child audio values intact. The bridge removes its event listeners when its container is disposed. Simple Draw ownership already excludes linked/automatically managed objects; this pass does not change those ownership rules.

## Canvas and bounds

`.expressive-toy-canvas` in `style.css` is the single source for the translucent blue fill, dashed border and 14-unit radius. Simple's surface and Art's Fireworks, Light Paths and Sticker workspace frames consume it. Simple's separate radial background and outer shadow/hover-border treatment were removed. Existing surface-specific input clipping and Art overlay/selection behavior remain in their owners.

Logical canvas insets and container dimensions remain content-driven. Revealing chrome changes no container model data, graph wiring, canvas rectangle, fitting or sockets. Controls are presentation outside those bounds; they are not included in authored auto-fit or overlap repair. Shared style does not impose Art's workspace dimensions on Simple Paint.

## Verification

- 130 targeted Node tests passed: container volume projection/persistence/disposal; existing Simple one-line and asynchronous creation rules; canonical playback/transport, cut/paint reload; container fitting; Art movement/viewport behavior; graph placement and responsive scaling.
- `tests/expressive-chrome-browser.html`: 27 browser assertions passed. The page places Simple, another Simple and a large 700-unit Art base side by side. Checks include exact handle styles, tap/drag/cancel semantics, closed visibility, top-only controls, independent UI state, exact Clear styling/assets, canonical volume/mute, child-state reconstruction and unchanged canvas/model/graph state on toggles. Widths 320, 400 and 1200 and zoom 1, 0.625 and 0.35 use the same wrapping rule.
- `tests/simple-draw-input-browser.html`: 22 checks passed, retaining no internal movement, no paint UI, no second-stroke replacement, intentional Clear, contextual scissors and shared Art movement at several scales.
- Full-app Chrome checks confirmed identical handle dimensions, a fixed canvas rectangle across reveal/hide, volume adjustment and save/reload (1% retained), the same 1% in the internal DrawGrid after Open, and Close retaining it. A real Bursts factory instance mounted its shared controls, volume and canvas class without console errors. Side-by-side styling was also inspected in the dedicated harness.
- `git diff --check` passed. Audio state/routing and existing scheduler tests were checked; subjective listening during live slider adjustment was not performed. Responsive/large-Art comparison uses the common base in the harness rather than a complete visual sweep of every Art effect/customization panel.

## Files

Implementation: `src/expressive-toy-chrome.js`, `src/container-volume.js`, `src/container-board.js`, `src/simple-draw-surface.js`, `src/free-play-tools.js`, `src/main.js`, `src/art/base-art-toy.js`, `src/art/art-toy-factory.js`, `style.css`, `free-play.css`.

Coverage: `tests/container-volume.test.mjs`, `tests/expressive-chrome-browser.html`, and the updated contextual assertion in `tests/simple-draw-input-browser.html`.
