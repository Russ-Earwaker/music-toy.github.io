# Paint palette and Simple instrument reassignment

The palette and long-press popup now use navy translucent gradients, thin blue rims, restrained glow and existing system typography. Six circular wells retain instrument identity through tinted centres and coloured rims. Selection adds a separate pale outer ring. Randomise/Eyedropper use dark blue controls. Hover, press, keyboard focus and hold feedback remain distinct; reduced motion is respected. The existing header already collapses the wells and tools, so no new launcher was needed.

## Repaint cause and repair

Paint previously scanned only `.toy-panel[data-toy]`, and its state action accepted only the normal musical-toy allowlist. Simple bodies, SVG surfaces and movement handles therefore missed the assignment route; internal normal panels were also not a reliable substitute for their owner. String's window-level gesture handler could intercept surface input before Paint's document-level handler.

`paint-target.js` resolves the nearest presentation to `BoardObjects.instrumentOwner(id)`. This adapter uses the instrumentSource capability for board owners, resolves Ball proxies to their Cannon, and adapts Simple Paint's owned DrawGrid content. Normal toys retain their existing assignment API. Paint captures equipped gestures at window level before board gestures and includes extended handles/playable surfaces in hit testing. The visible Cannon barrel accepts tool hits while equipped.

Mutation routes:

- Drum/individual Drum Set members, Ripple, String and Strum use their canonical store's `update(id, {instrument})`. Existing subscribers refresh presentation and audio routing.
- Cannon/normal Ball/Gravity Ball use `simpleBouncer.setInstrument`, retaining physics and captured timing.
- Simple Paint's `setInstrument` applies the normal musical assignment event to every owned DrawGrid and publishes its authored change, retaining phrase notes, timing and gesture.
- Cube has no instrumentSource capability and remains ineligible.

Presentation continues to resolve `instrumentColour(currentInstrument)`. Paint contains no direct CSS colour assignment. Contact effects read the applied owner's current instrument. Later shared palette edits update the repainted owner again through the existing shared mapping.

Eyedropper reads the owner's current canonical instrument and selects its matching well. Randomise retains the normal toy API; Simple Paint delegates to its owned grids' existing randomisers. Other Simple owners have no existing randomisation action and remain unchanged, including their instrument, colour and recording. No new musical randomisation semantics were introduced.

Instrument assignments persist through the existing toy stores. Colours remain exclusively in the shared palette override storage. No per-toy colour field was added.

## Verification

234 targeted Node tests pass, including real store notification, independent kit members, preserved authored state and receiver-owned trigger sound resolution. The browser test uses actual pointer input to repaint bodies, handles, Cannon barrels, both Ball modes, Paint canvas, String and Strum surfaces twice; it checks canonical assignments, Eyedropper, Randomise retention, Cube exclusion, a later shared-colour edit and save/reload. Audio ownership was checked through routing assertions rather than a listening test.

Screenshots in `artifacts/paint-palette-{repaint,popup,narrow}.png` show the panel, selected well, popup and 390px viewport. The palette fits the viewport with all six wells and controls readable. Existing unrelated topbar/board layout overflow at narrow widths is outside this palette change.
