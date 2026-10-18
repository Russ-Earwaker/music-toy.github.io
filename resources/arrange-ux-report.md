# Auto-Arrange UX/readability

This pass changes presentation only. The sixteen-bar recipe, harmony, source material and connected graph semantics are unchanged.

- **Persistent linked marker:** `⧉` in toy and visible linked-structure headers. It appears only when another view of that definition exists; singleton definitions are unmarked. Linked structures have a dedicated glyph rather than borrowing repeat/status text. Markers rebuild from scene data on reload.
- **Inspection:** tapping a linked header flashes all siblings and draws temporary background tethers for 1.8 seconds. Toys use their shared instrument colour; structures use a neutral blue. Rapid taps restart the effect. Shared-definition lookup works even when the original board view has gone. Tethers are presentation SVG, never connections.
- **Arrange reveal:** authored families pulse in instrument colour; support fades in with a softer neutral glow. Structures use a short stagger. Effects clear after about two seconds, with reduced-motion styling. No permanent provenance labels, role labels, Master/Instance terminology or organisational hiding were added.
- **What happened:** the result reports the number of user ideas used and supporting parts newly added. `Show my parts` replays only the authored-family emphasis. Arrange Again retains provenance of the authored phrase seed even though its chunks are excluded from new role selection.
- **Section scan:** existing layout keeps ordered section rows, grouped layers and horizontal phrase chains. Intro/A/B/Outro landmarks now remain about twelve screen pixels high in the full-web view. Linked glyphs also compensate for zoom without changing card dimensions. Existing horizontal phrase projection remains in place; visible linked Sequences receive the same header marker as toys.

## Validation

Full suite: **1,042 passed, zero failures**. Added tests cover family-wide provenance, distinct transient reveal, Show my parts, repeat inspection, temporary tether removal, linked structure markers across restore, singleton suppression and full-web section-label size. Existing linked-toy tests now verify all siblings are marked, singleton definitions are not, and idle preparation still does not repaint. All 23 robustness matrix cases additionally verify authored provenance survives Arrange Again. Existing layout and persistence tests pass.

Browser observations are collected separately from the previous musical robustness proof. The QA page runs on its own local origin and never clears the normal saved board. These are developer inspections, not a study with novice participants.

## Readability limits

At a full sixteen-bar fit, individual note editors and long names still require zooming in; section landmarks and linked status are the intentionally retained overview cues. Dense unrelated/manual graph content can still make the full board large. This pass adds no hiding or separate board system. The relationship tether cap remains twelve visible lines per inspection to avoid a dense fan of cables; all family members still flash.

## Main implementation files

`src/arrangement-reveal.js`, `src/auto-arrange-ui.js`, `src/auto-arrange.js`, `src/linked-toy-views.js`, `src/toy-relationship-reveal.js`, `src/connection-view.js`, `src/main.js`, and `style.css`.
## Browser core-loop checks

The four lone-toy checks used normal Arrange/Play and Show my parts controls after a short standalone play/inspection period (roughly twenty seconds or longer). DrawGrid and Simple Rhythm each reported one authored toy used and three new supporting parts, showed fourteen persistent linked markers, and highlighted both arrangement uses of the user's source. Bouncer and Rippler each reported one toy used and three supporting parts, with eight linked markers and two authored uses. The musical recipe and number of linked views differ naturally between DrawGrid phrase chunks and looping physics toys.

DrawGrid + Simple Rhythm reported two authored toys and two supporting parts. A real browser reload retained all fourteen markers. Tapping Draw 1.1 in the fitted overview produced both sibling flashes and a temporary tether. This check found and fixed Overview's drag-surface stacking above the header; capture-phase tap handling also preserves dragging and keyboard click fallback.

The result automatically fits the connected graph before its reveal. In the inspected graph, Intro/A/B/Outro remain ordered top-to-bottom, with left-to-right flow into each section's layers and horizontal DrawGrid phrase chains. Their labels remain readable at the full-web scale. The completion panel stays lightweight, with actions on one row when width permits.

[Recorded browser observations](debug-output/arrange-ux-browser-proof.json) include earlier unsuccessful overview-tap traces and the successful sibling/tether animations. [Full automated test output](debug-output/arrange-ux-full-tests.txt) is retained. Tests with prepared fixtures and developer visual checks do not establish how quickly a new player will learn the cues; that still requires player feedback.
Bouncer + Rippler also reported two authored toys used and three supporting parts, with three visible uses derived from the two input families. Its automatic reveal recorded three authored pulses plus support/structure fades; no app errors were captured. Both parts were kept in the ordinary connected graph.

The full-fit view remains deliberately an overview: individual toy names and note editing details can still be small, especially on a short window. The section landmarks and copy glyphs remain the scan cues, and zooming is still necessary for detailed editing. The result panel can cover the lower graph until closed; it does not create a hidden mode.
## Usability matrix summary

| Prepared input | User ideas used | New supporting parts | Linked markers | Authored visible uses |
| --- | ---: | ---: | ---: | ---: |
| DrawGrid | 1 | 3 | 14 | 2 |
| Simple Rhythm | 1 | 3 | 14 | 2 |
| Bouncer | 1 | 3 | 8 | 2 |
| Rippler | 1 | 3 | 8 | 2 |
| DrawGrid + Simple Rhythm | 2 | 2 | 14 | 4 |
| Bouncer + Rippler | 2 | 3 | 8 | 3 |

Counts represent unique input ideas rather than counting every linked view as another input. After Arrange Again, DrawGrid still reports one user idea and highlights two uses; it reports zero newly added supporting parts because existing support is reused. Recorded tests use prepared source material and normal UI controls, not twenty seconds of free-form novice drawing. The embedded QA window sometimes rendered at low frame rates; animation smoothness and discoverability still need normal-device/player feedback.

[Compact browser summary](debug-output/arrange-ux-browser-summary.json) provides the six input cases and successful restored-header inspection without the detailed event traces.
