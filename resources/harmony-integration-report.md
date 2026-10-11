# DrawGrid role ownership and real graph harmony proof

The default fixture is Heartbeat → Chord Progression C | Am | F | G → Together → DrawGrid Accompaniment + DrawGrid Melody + Simple Rhythm Percussion. It contains no Drum Kit or pitched Simple Rhythm material. Harmony algorithms are unchanged.

## Source ownership, defaults and precedence

Authored musicalRole lives on each source toy (panel.dataset.musicalRole), is serialized with its toy state, and is included in native DrawGrid snapshots and shared sound-state copying. Occurrence metadata carries a scheduling-time role reference; it does not own the authored definition.

New DrawGrids default to Melody; new Simple Rhythms default to Percussion. Explicit source role precedes occurrence/legacy hints and instrument-family inference for pitched DrawGrid material. Normal Simple Rhythm and physically unpitched events remain Percussion; Chord Wheel retains its existing internal voicing behavior.

Older DrawGrids with no saved role retain the centralized existing instrument-family/default fallback. They keep the role field absent on save until a role is explicitly selected. A restoration marker prevents normal initialization from silently assigning Melody to those scenes. Older Simple Rhythms load as Percussion in normal mode.

## UI and inheritance

DrawGrid headers have a compact native Melody/Bass selector, 84 × 36 local pixels, using existing toy control styling. It stops pointer/keyboard propagation to panel dragging and marks persistence dirty. Simple Rhythm has no role selector or newly exposed advanced mode.

Instrument selection leaves the authored role unchanged. Quick-add and the existing source sound-state copy path inherit instrument, pitch settings and musicalRole. Browser quick-add created a Piano/Bass DrawGrid at octave 3. Reload restored that new toy and both original explicit roles. Promotion/reparenting regression coverage verifies roles remain on their source toys.

## Production playback evidence

Actual native DrawGrid providers scheduled C3 → A2 → F3 → G2 for Bass, retained the Melody phrase while correcting F#4 to F4, and kept Simple Rhythm's C4 percussion unchanged. Switching Bass from Retro Triangle to Piano retained Bass adaptation; switching Melody to Bass Guitar Slap retained Melody adaptation. Browser selection changed the source role in both directions while playback continued.

- [Base graph and instrument switches: 983 events](debug-output/harmony-graph-2026-10-11T07-26-28-516Z.json)
- [Reloaded board: 77 events](debug-output/harmony-graph-2026-10-11T07-27-13-627Z.json)
- [Transpose → Progression: 132 events](debug-output/harmony-graph-2026-10-11T07-27-45-437Z.json)
- [Progression → Transpose: 475 events](debug-output/harmony-graph-2026-10-11T07-28-50-969Z.json)

Both Transpose nestings with +12 produced C4 / A3 / F4 / G3, with adaptation before explicit transpose and unchanged percussion. The browser's snapshot retained the authored DrawGrid note rows; playback did not mutate them.

A live Am → Dm edit reached subsequent native DrawGrid events as D4 with +12, without restarting transport. [Live chord-edit log](debug-output/harmony-graph-2026-10-11T07-29-10-946Z.json).

One graph-only import issue was found: an existing ID could reuse a different toy kind. Scene restore now replaces a mismatched kind before restoring the saved definition, allowing the corrected fixture to replace the previous Simple Rhythm proof.

## Tests and repeatability

105 targeted tests passed across musical roles, harmonic adaptation, chord progression, transpose, Harmony Lab, quick-add, instrument selection and DrawGrid persistence. Coverage includes defaults, explicit-role precedence, instrument switching, state copying/reload, legacy fallback, four chord contexts, conservative Melody adaptation, Percussion bypass, real graph variants and role-preserving promotion/reparenting.

Open [the browser check](../tests/harmony-graph-browser.html), load a variant, and use normal board controls. Save observations writes JSON into resources/debug-output through tools/perf-lab-results-server.mjs. [The scene fixture](harmony-integration.scene.json) can also be imported through Save / Load / Share.

Evidence records production audio scheduling and final pitches. Subjective listening remains a human check. No Auto-Arrange or new modifier types were added.
