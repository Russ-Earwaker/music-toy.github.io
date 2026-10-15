# Empty DrawGrid → Arrange fix

Reproduced the reported creation flow through the normal browser UI. A newly created DrawGrid was selected as an authored seed despite containing no notes, so the continuation path copied its empty pattern into all four melody definitions.

Arrange now distinguishes musical seed material from a blank toy. Blank toys use the existing 32-step generator, wait for any pending initialization retry, and split the resulting state into four ordinary DrawGrids. Authored seeds retain the existing preservation/continuation path. An empty generator result produces a visible error instead of silently constructing an empty melody.

Browser proof: before **0/0/0/0 notes**, after **8/8/8/8 notes**, with all 15 musical views connected and 43 generated melody events recorded through production scheduling. No browser errors. **36 focused tests pass**, including the new blank-seed regression and authored-seed preservation. `git diff --check` passes.

Changed production files: `src/main.js`, `src/drawgrid/dg-phrase-chunks.js`. Regression coverage: `tests/linked-copies.test.mjs`; browser observer exports blank-seed reports separately.

Artifacts: [before/after proof](debug-output/empty-drawgrid-arrange-proof.json), [test log](debug-output/empty-drawgrid-arrange-tests.txt). Run `node resources/empty-drawgrid-arrange-proof.mjs` to verify the saved browser data.

Existing generated phrases remain preserved on Arrange Again; this fix applies when initially building a Phrase from a blank toy.
