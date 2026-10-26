# Simple Playtest

Activate with index.html?preset=simple-playtest. Return to normal in one step: open index.html without the preset parameter. No rebuild, migration or storage cleanup is needed.

The immutable PRESETS in src/runtime-config.js are the authoritative runtime manifest. Normal is the default; unknown names warn and fall back to the entire normal preset. Add future presets here and extend resolvePreset's URL mapping.

Simple Playtest forces Simple in the UI mode controller, rejects Advanced mode actions, hides the mode selector, and retains existing Simple graph presentation. It never writes the forced preference. A document title suffix identifies the session.

Available toys: PLACE Cube; TRIGGER Ball, Gravity Ball, Ripple; LOOP Paint; PLAY Drum, Drum Set, String, Strum. Simple Rhythm is excluded. Paint palette and Guide remain available. Art, legacy creation, Logic, Game and Arrange are disabled.

Creation catalogs, grouped palettes, dock buttons and action dispatch derive availability from manifest capabilities. Music and Art factory boundaries also reject disabled new creation. No preset-name checks are distributed through components.

Project data is not filtered or migrated. Persistence explicitly marks restoration of saved music, Art and linked views so disabled existing content remains restorable. Runtime configuration is never serialized. New Scene does not replace the runtime configuration.

Validation: 42 focused tests pass (runtime configuration, mode preference, actual creation palette/actions, persistence source reuse, linked copies, Paint palette, audition and shuffle). Four graph-ui-view tests fail with both the changed and original UI mode controller; those pre-existing failures are outside this change.

Browser QA on the local development server confirmed the nine choices and invoked each creation action; Drum Set created six drums and physical starter cubes appeared. Paint wells and Shuffle worked; Randomise and Eyedropper remained present. Guide opened. The ordinary URL restored the selector, Art and Advanced graph controls with test objects intact. Full drawing/throwing/plucking gestures, audible playback, long-press configuration, and an Advanced-project export/reimport round trip were not manually verified.

Local QA URL: http://192.168.1.158:5500/music-toy.github.io/index.html?preset=simple-playtest
Deployment is separate; use the same query parameter on the deployed application URL after publishing these files.
