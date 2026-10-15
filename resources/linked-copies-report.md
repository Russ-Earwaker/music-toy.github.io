# Linked Copies implementation

Musical toys now use full, editable Linked Copy views. Sequence copies contain normal editable toy children and stay expanded by default. Advanced offers **Create Linked Copy**; headers show a small linked marker, with no navigation back to a privileged Master.

Notes/patterns, instrument, volume/mute, musical role, local transpose and randomisation results belong to the shared toy definition. Sequence child definitions, ordering and name belong to the shared Sequence definition. Positions, cables, collapse state, playback occurrences and harmony contexts remain local. Editing any view updates the shared definition used by future unscheduled events, with a brief emphasis on the other editors.

Header interaction flashes the entire linked family for 1.8 seconds. Temporary background tethers are inert and capped at 12 paths. Toy feedback uses the instrument colour. Repeated taps restart the animation.

## Deletion and persistence

Deleting either view removes its local connections. If the internal storage anchor is deleted, a survivor takes over without changing shared definition IDs or surviving suffixes. Deleting the final view asks for confirmation. Removing a child from one expanded Phrase removes that local view/connection; siblings and the underlying shared musical definition remain intact. Local omitted child slots persist.

Snapshots store authored musical data once per definition, alongside visible IDs, stable suffixes, positions and connections. Legacy Master/Instance fields remain internal compatibility anchors; restored instances become full editors. Restore initialization now preserves authored notes instead of capturing temporary empty rendering buffers. Playback uses the latest edited definition, while each occurrence retains its own harmony and scheduling identity.

Only Sequence with direct toy children supports structure Linked Copies in this pass. Other structure types are unchanged. **Make Independent** remains a TODO.

## Auto-Arrange

Generated melody lives in four visible, ordinary 8-step DrawGrid definitions. A and B use expanded linked Phrase views with normal solid cables. The arrangement retains 16 bars, distinct A/B progressions, B-only extra percussion, shared source volume/mute and no octave lift. Regeneration preserves edited definitions and works after deleting the original Phrase view.

## Validation

- **945 tests passed**, including shared editing, Sequence reordering, local placement, independent contexts, deletion/promotion, audio routing, persistence validation and delayed editor initialization.
- Browser actions exercised Create Linked Copy, Draw B.2 editing, actual Randomize/role/volume/mute controls, second-Phrase reordering/movement, original deletion, save/reload and Arrange Again.
- Production playback proof checked 1,108 note events across the manual and generated cases. The generated case preserves all 16 bars and the Intro/A/B/Outro layer counts **1/3/4/1**.
- Regeneration retains **7 toy definitions, 22 full toy views and 3 expanded Phrase views**, including after original Phrase deletion.
- Header proof records all three Phrase views flashing and two noninteractive tethers.
- `git diff --check` passes.

Proof index: [debug-output/linked-copies-browser-proof.json](debug-output/linked-copies-browser-proof.json). Full tests: [debug-output/linked-copies-tests.txt](debug-output/linked-copies-tests.txt). Run the saved browser assertions with `node resources/linked-copies-browser-proof.mjs`.

The final-copy confirmation behavior is implemented but was not separately exercised in the browser proof. Browser validation checks production pitches and audio scheduling metadata, not a subjective listening judgment. Fully expanded arrangements are intentionally larger and can be slow in the instrumented browser test environment.
