# Simple creation palette

The Simple Music palette now reads:

| Group | Entries |
| --- | --- |
| PLACE | Cube |
| TRIGGER | Ball, Ripple |
| LOOP | Paint |
| PLAY | Drum, Drum Set |

Art remains a separate, mutually exclusive sibling chooser. Play now contains Drum and Drum Set; see [the Drum looping report](simple-drum-loops.md) for its placement and performance behavior. Headings are persistent labels, not expandable menus or runtime modes.

Grouping comes from `simpleCategory` metadata on the existing creation registry entries in `main.js`, with `simpleOrder` keeping Ball before Ripple. `simple-creation-palette.js` projects those entries into four ordered groups. The renderer uses the original entries and callbacks; it does not maintain duplicate creation buttons or object implementations. The legacy “Simple Bouncer” shortcut remains available in Advanced but is omitted from the curated Simple view. Cube and Ball are available immediately in Simple, without requiring a Bouncer to exist first.

Active-state callbacks read the existing creation state. The Bouncer board exposes a read-only `activeMode` getter for its existing Cube/Ball distinction; Paint and Ripple expose their existing placement flags through body classes. The palette observes those flags and reapplies `aria-pressed`/visible outlines after rendering, mode changes, placement completion and cancellation. The four category names introduce no additional tool state.

The following existing creation paths remain in use, rather than being rerouted through `window.BoardObjects.create`:

- Cube/Ball: ToySpawner → `createToyPanelAt` → existing Bouncer board Cube/Ball arming. Ball still authors the cannon and fires its runtime ball when the user drags/releases on the board.
- Ripple/Paint: their existing registry actions arm the existing placement/drawing controllers. Those controllers continue creating their existing canonical model objects.

This is a registry-driven palette view over those established paths. A full unification of UI creation dispatch through the shared BoardObject API is outside this information-architecture pass.

Responsive verification passed at **390×844** and **320×740**. All four headings and their contents fit without palette scrolling or horizontal overflow; item targets remain 64px high, and Cube/Ball retain their existing 64px controls. The grouped Simple menu is bottom-aligned on narrow screens to avoid an existing mobile top/bottom constraint hiding Loop and Play. That override does not change Art or Advanced layout.

Browser verification exercised the requested sequence: open Simple Music, place two Cubes, select Ball and throw through them, select Ripple on the same board, then draw a Paint loop. Active Cube and Ripple states were visible, other entries remained inactive, and placement completion cleared one-shot state. Art switching showed the original Art chooser; Advanced showed its original flat creation list and full tools. No console errors were observed. The grouping is readable in one glance without opening category submenus.

**Checks:** 77 tests passed across the new palette tests and existing UI mode, board interaction, Ripple, Bouncer and Simple Draw suites. The new tests use the actual registry entries and main creation dispatch to cover group membership/order, inert headings, empty Play, canonical callbacks, active state after rendering, Simple/Art switching and unchanged Advanced presentation. Syntax checks and `git diff --check` passed. No musical behavior, transport, object persistence or sound ownership changed in this pass.
