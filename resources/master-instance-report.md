# Master + Instance toys

## 1. Data model

An ordinary toy is now a Master. A linked Instance is a real `.toy-panel` with its own ID, position, normal input/output sockets, connections and playback occurrences. Its `masterToyId` selects the source. Source callbacks read the Master at each unscheduled call; authored patterns are never cloned.

## 2. Ownership

The Master owns notes/pattern, instrument, randomisation results, role, local transpose and source settings. Instances store identity, numbering, position, connections, board ownership and optional Auto-Arrange ownership. Role, instrument and audio settings on Instance DOM elements are derived values and are not saved as authored copies. There are no new Instance-local musical controls. Scheduling carries the Instance identity separately from the Master policy, leaving a boundary for future local context.

Audio gates, cancellation and visible pulses use the Instance identity. Source-specific pitch settings are resolved from the Master through the existing central harmony/transpose path. Simultaneous uses therefore keep independent occurrences without retuning harmony.

## 3. Names

Masters receive stable family names such as **Draw 1**, **Draw 2**, **Rhythm 1**, **Bouncer 1**, **Rippler 1** and **Wheel 1**. Instrument and role changes do not determine these names. Instance names derive from the Master plus a persisted, monotonically allocated suffix. Removing `.2` leaves `.1` intact; the next duplicate becomes `.3`. Existing authored `toyName` values are retained, and changing the Master's name updates derived Instance labels. No new rename UI was added.

## 4. Role visibility

Roles remain inside Advanced. Basic toy names and Instance labels do not display Melody, Accompaniment or Bass. Simple Rhythm remains Percussion: its Advanced shelf provides Create Instance only, without revealing dormant pitched controls or a role selector.

## 5. Instance UI

Master **Advanced → Create Instance** creates and focuses a linked toy. Instances show the family name, instrument color/name, a subtle INSTANCE marker, **Duplicate** and **See Master**. See Master centers and highlights the source; attempting direct editing with a double-click also navigates there. Instances have compact 240 × 160 presentation and a draggable header. Identity and actions remain available in Overview. They have no instrument picker, randomise/clear controls or pattern editing surface.

## 6. Graph and cables

Instances use ordinary solid cables, normal sockets and the existing connection/midpoint controls. Dragging a structure cable no longer silently converts a normal toy input into a shared-reference destination. Source-use chips, temporary relationship reveals and the Use existing toy picker were removed. Spare `+` retains the ordinary quick-create interaction.

## 7. Auto-Arrange

Auto-Arrange preserves the three source Masters and creates eight visible Instances beneath seven normal structures: one use in Intro, three in A, three in B and one in Outro. Missing parts still become ordinary editable Masters. Generated Instances carry their arrangement owner; replacement deletes only the previous owner's Instances and structures. User-created duplicates do not inherit arrangement ownership and survive regeneration. Regeneration retains the prior root position. Normal graph placement positions Instances in their branches without moving their Masters; Edit Arrangement can fit the full graph on screen.

## 8. Legacy scenes and reload

Both scene import and normal restore migrate old pattern-use edges into distinct visible Instances with ordinary input connections. Master identity, source state, edge identity and arrangement ownership are retained. Migration is idempotent and never duplicates a Master. The new save stores musical content only on Masters; Instances save an empty source state and their link/number/UI metadata. Invalid or orphan links are rejected before scene mutation.

## 9. Deletion

Deleting an Instance removes only that object and its connections. Deleting a Master while any linked Instance exists is prevented with **Delete linked Instances before deleting their Master.** Source content is not deleted or silently orphaned.

## 10. Verification

**892 tests passed**, including neutral naming, monotonic suffixes, safe migration, invalid-link rejection, live source reads, simultaneous production occurrences, future Master edits, independent deletion, percussion's linking-only Advanced panel, Auto-Arrange replacement and stable root positioning. Existing runtime/harmony, transport, graph UI and persistence coverage also passes. Syntax checks and whitespace checks pass.

Chrome QA exercised actual Advanced/Create Instance, Duplicate, See Master, Master deletion protection, deleting one test Instance, suffix allocation and reload. The Master → Instance → Instance chain was assembled through the browser fixture using the normal production connection restore API; connection gestures are covered by the graph tests. The native drag attempt during an Overview camera transition was not counted as successful gesture proof.

Legacy import, a full Auto-Arrange graph, regeneration and reload were checked in the normal app. The repeatable proof validates **1,315 owned playback events**: accompaniment follows C3/A2/F3/G2, fixture melody adapts by at most one semitone, and percussion remains unchanged. A Master +3 transpose edit reaches both linked Instance paths. Source state and source positions remain unchanged through migration, arrangement replacement and reload. Eight arrangement Instances plus one unrelated user Instance survive as intended. Final fresh-tab startup has no error/warning logs. These are production scheduling observations; no subjective listening judgment is claimed.

Core implementation: `src/toy-instances.js`; integration changes in toy chrome, graph creation/rendering, Auto-Arrange, persistence, audio ownership and source initializer guards. No musical algorithms were changed.

Artifacts:

- [Browser proof summary](debug-output/master-instance-browser-proof.json), recheck with `node resources/master-instance-browser-proof.mjs`.
- [Full test output](debug-output/master-instance-tests.txt).
- [Editable scene](master-instance-arrangement.scene.json).
- [Final layout screenshot](debug-output/master-instance-arrangement.png).
