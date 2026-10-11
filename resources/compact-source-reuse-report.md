# Compact source reuse

## 1. Unified cable model

All player-facing cables and drag previews are solid and use the same connection controls. Toys expose their normal input/output sockets only. Connecting a structure to an existing toy through its normal input creates a source use; reversed drags use the same interpretation. Existing owned connections retain their reconnection behavior. Permanent structural cables retain insertion midpoints. Compact chips have no fake midpoint.

## 2. Internal reuse

Uses retain the existing persisted pattern edges and independent playback occurrences. Chips derive from those edges; there is no second chip model, cloned toy, or copied pattern data. Source editing continues through the original toy. No harmony algorithm was changed.

## 3. Source chips

Parents show compact labelled chips with role colors and playback pulse feedback. Hover/focus temporarily reveals a normal solid relationship cable. Clicking a chip highlights and centers the actual source toy. Its options offer Show source and Disconnect. Selecting elsewhere dismisses the reveal. Disconnecting one use preserves other uses and the source.

## 4. Manual workflow

A structure's spare `+` opens **Add musical material** with **Create new toy** and **Use existing toy**. Existing sources are listed with role/name and instrument, with validation against incompatible/cyclic destinations. Picking a source creates the same canonical edge as a direct cable gesture. Toy quick-add remains immediate.

## 5. Compatibility

Older reference edges load as compact uses without changing their musical semantics. Existing normal graph edges remain intact. Browser testing uncovered and fixed a restore bug where the fallback matching of panels could assign one panel to two saved toy IDs during import. Restored sources now remain distinct. Timeline rows and Transpose duration reporting use a reused source's natural pattern length rather than its separate outgoing chain; timeline restoration also tolerates edges still being restored.

## 6. Layout

Auto-Arrange displays seven compact section/structure cards and eight uses of three source toys. Source uses do not pull toys into the arrangement tree. Presentation changes repair local layout while preserving the arrangement root anchor. The browser proof confirms non-overlapping cards and stable source positions through manual reuse, deletion, focus and reload. Existing initial source-pool placement can still resolve a corridor before the arrangement settles.

## 7. Validation

- Full suite: **885 tests passed**.
- Focused coverage includes solid rendering, hidden legacy sockets, chip activation/focus, exact-use endpoint reconnection, single-use deletion, manual/direct/reverse cable parity, old import restoration, natural pattern durations, independent occurrences and persistence.
- Actual browser interactions exercised adding a use, removing it, clicking a chip, and reloading the normal board. Reload restored three sources, seven structures and eight uses, with seven permanent cables, zero dotted cables and zero extra sockets.
- Reload playback captured 2,048 scheduled events: accompaniment resolves C3/A2/F3/G2; fixture melody changes by at most one semitone; percussion pitches remain unchanged. Authored source state is unchanged. These are production scheduling observations, not a claim of subjective listening evaluation.

Recheck captured browser evidence with `node resources/compact-reuse-browser-proof.mjs`. Summary: [debug-output/compact-reuse-browser-proof.json](debug-output/compact-reuse-browser-proof.json). Full test output: [debug-output/compact-reuse-tests.txt](debug-output/compact-reuse-tests.txt).
