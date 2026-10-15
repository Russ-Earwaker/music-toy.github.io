# Connected Linked Copies + seeded Melody Phrase

Arrange from one authored DrawGrid now produces a connected web with **15 musical toy views, seven shared toy definitions and two expanded Phrase views**. There is no additional Rhythm, Accompaniment, Extra Rhythm or Phrase source bank.

## Definition ownership

Shared toy records own authored state, numbering, name, pattern revision and a stable `shared-audio:<definition ID>` bus. Their view-ID sets are separate from those records. Existing toy-specific schedulers use a live editor as a runtime representative; removing that editor does not change the definition or audio identity.

Sequence records own ordered child-definition membership. Local structure views retain their own placement, cables, omissions and playback occurrences. Legacy representative links remain an internal factory/compiler compatibility index, and are updated when a representative disappears. They do not require a separate disconnected board object.

Scene schema 2 stores `sharedToyDefinitions` and `sharedSequenceDefinitions` separately from visible views. New saved views do not contain `masterToyId`/`masterStructureId` links or duplicate musical state. The loader projects definitions through the existing factory and accepts older Master/Instance scenes. Stable definition IDs, copy suffixes, positions, connections, fill metadata, volume and mute survive this path.

## Seed and continuation strategy

For the normal **8-step authored idea**, the original DrawGrid DOM object and its notes become chunk 1 in A's connected Melody Phrase. Its musical state is not randomized or rewritten. B uses a normal Linked Copy of that definition.

The three additional ordinary DrawGrids inherit its instrument, role, pitch settings and initial volume/mute:

- Chunk 2 repeats the seed's rhythm and pitches.
- Chunk 3 exchanges its two half-bar motifs, retaining the seed's pitch range and rhythmic material.
- Chunk 4 repeats the motif and ends on its opening pitch.

This is deterministic motif reuse rather than four unrelated random loops. New continuation editors receive their final states directly, without an intervening random pattern. With no authored melody, the existing 32-step generator is split into four normal 8-step definitions.

Longer legacy material is segmented without dropping or retuning notes: a 16-step idea supplies the first two chunks, followed by a repeat of those motifs; a 32-step idea supplies all four. This redistributes the longer pattern across visible definitions. An idea already connected to an unrelated structure keeps that graph use and seeds the new Phrase through a linked presentation.

## Connected uses and regeneration

The first visible Accompaniment is connected in Intro, Rhythm in A, Extra Rhythm in B, and the first Phrase in A. Later uses are ordinary linked views. The previous standalone authored DrawGrid becomes the first Phrase child directly when safe to reparent it.

A/B retain their four-bar C/Am/F/G and F/G/Am/C progressions. B retains extra percussion, with no octave transpose. Intro/A/B/Outro remain four bars each, with layer counts **1/3/4/1**. Harmony and chord badges remain occurrence-specific; shared Heartbeat phase is unchanged.

Arrange Again keeps the selected connected definitions alive while replacing generated topology, then removes obsolete views. Edited generated notes and volume survive, including after the original Phrase view has been deleted. Surviving suffixes are not renumbered. Last-copy confirmation and the Make Independent TODO remain unchanged.

## Validation

- **948 tests pass**. New coverage checks seed preservation and continuations (8/16/32 steps), definition-centric scene migration, audio identity after first-view deletion, connected generation, independent harmony, 16-bar duration and regeneration without orphans.
- Browser proof starts with a clean board, creates a DrawGrid through Create Toy, enters an obvious melody, and presses normal Arrange.
- It verifies the original seed ID/notes, four normal melody editors in each Phrase, zero disconnected toys or structures, linked B-to-A editing, header relationship feedback, four Accompaniment uses sharing a UI-set 20% volume, complete playback, reload, first-Phrase deletion and the actual Arrange Again button.
- **411 production note events** establish the 16-bar layer counts and chord contexts, percussion bypass and zero explicit transpose. This is scheduling/pitch evidence, not a subjective listening judgment.
- `git diff --check` passes. Long-seed segmentation has automated coverage; the interactive browser seed is the normal 8-step DrawGrid.

Run `node resources/connected-linked-copies-browser-proof.mjs` to recheck saved browser assertions.

Artifacts: [proof index](debug-output/connected-linked-copies-browser-proof.json), [full tests](debug-output/connected-linked-copies-tests.txt), [targeted tests](debug-output/connected-linked-copies-targeted-tests.txt).

Implementation: `src/linked-toy-views.js`, `src/linked-sequences.js`, new `src/linked-definitions.js`, `src/persistence.js`, `src/auto-arrange.js`, `src/main.js`, `src/drawgrid/dg-phrase-chunks.js`, with regression coverage in `tests/linked-copies.test.mjs` and the connected-copy browser harness.
