# Free Play silence mechanics

Implemented Draw, Scissors, Black Paint, Wash and the existing Clear control.

1. **One authored silence model.** Ordinary DrawGrid `authoredNotes` retain their stable `id`, `col` and `sourceMidi`, with independent boolean `scissorMuted` and `paintCovered` reasons. `eventMuted = scissorMuted || paintCovered`. `updateSilence()` changes only these reasons. Source pitches, registers, timing, original paths and board stroke coordinates remain intact.
2. **Scissors.** Pointer movement tests the entire swipe segment against displayed musical nodes with a 23 CSS-pixel radius, allowing multiple cuts per swipe. Each event is identified by its authored note ID. Pointer capture supports movement beyond the surface; cancellation terminates the gesture.
3. **String presentation.** A subdued six-pixel luminous string carries a transport-derived illuminated section and bright core. Audible nodes bloom when reached. Each cut removes a small interval of normalized path progress. A deterministic local downward offset creates loose ends, limited before neighboring nodes. Multiple cuts produce separate segments. This is recalculated from immutable coiled/uncoiled geometry; it never writes sag into the path or the DrawGrid.
4. **Mending.** In Scissors mode, grabbing an end within 28 pixels begins a reconnect gesture. Releasing within 30 pixels of its partner restores that event's cut reason. A short tap near the gap is also accepted. Drag-to-mend worked reliably with mouse input in both views during playback; the tap fallback remains available. Other cuts and paint coverage remain intact. No transport restart occurs.
5. **Paint.** A persisted splat contains `{id, seed, progress, dx, dy, radius, notes:[authoredNoteId...]}`. A seeded central blot plus eleven droplets gives repeatable irregularity. Coverage uses the actual droplet circles, with a small forgiving margin. Covered nodes retain attached dark footprints as the string uncoils. Paint renders above every string/illumination pass. Drag stamping samples every 24 pixels and caps a gesture at 64 splats.
6. **Wash.** A broad circular brush removes intersected splats as whole blots, including ink attached to covered nodes. Coverage is recomputed from the remaining splat IDs; a note stays paint-muted while any remaining splat covers it. This intentionally uses a broad wiping interaction rather than a pixel eraser. Clear removes all Free Play lines, paint and associated silence state.
7. **Overlapping reasons.** Washing only clears `paintCovered`. Reconnecting only clears `scissorMuted`. A note with both reasons stays silent until both are cleared. Independent gaps remain independent.
8. **Persistence and generation.** Silence flags live in normal authored-note state. Original stroke provenance stores paint on the first grid of each line; line reconstruction includes muted events rather than discarding them. Ordinary save/load and board switching retain flags and paint. Decorative splats on an empty page use optional scene `freePlaySurfacePaint`; when a string is drawn, coverage transfers to its generated stable note IDs before playback begins. Existing ink is inherited when additional strings are drawn. No board scissors/rest UI was added, and its folded pitch editor and octave markers remain unchanged.
9. **Playback.** Normal DrawGrid scheduling and preview paths check authored silence, including live state when a lookahead snapshot predates an edit. Editing cancels future audio and queued visual admissions for the affected grid, updates its normal pattern revision, and resets only its scheduler cursor beyond the current tick. Transport phase and sequence durations remain unchanged. Already sounding notes finish. Muted stars never draw/flash; illumination continues through the musical timeline and surviving segments. No new phrase-duration calculation or clock exists.
10. **Verification.** 122 targeted tests passed, including silence, geometry, authored pitch, folded editing, duration, transport, linked copies, visual queues and persistence regressions. Browser QA covered a smooth multi-octave line and a 32-note, 1500-tick phrase; coiled/uncoiled cuts; independent repair; overlapping paint/cuts; wash/mend while playing; exact save/reload; generated board view; empty-page paint inheritance; BPM 120→152 while paused; Return to Start; and Clear. A persisted cut produced zero audio admissions across repeated loops; after repair it returned on subsequent loops. Washing a painted cut left the cut silent. No browser errors were observed. Mouse interactions were verified; physical touchscreen hardware was not available.

The gaps read as separated rounded string ends with a small droop; black blots clearly obscure the luminous string. Wash removes the blots immediately as a broad wipe. No rope simulation or conventional playhead was added.

## Files

- `src/free-play-silence.js`: shared mute reasons, swipe distance and seeded paint coverage.
- `src/free-play-tools.js`: tools, hit testing, mend, paint and wash.
- `src/free-play-line-visual.js`: luminous surviving string segments, local sag and paint overlays.
- `src/free-play.js`, `src/main.js`: input/render integration and ordinary authored state updates.
- `src/free-play-drawgrid.js`, `src/drawgrid/drawgrid-player.js`: generation, reconstruction and playback gates.
- `src/free-play-surface-paint.js`, `src/persistence.js`: decorative empty-page paint persistence.
- `src/playback-visual-events.js`, `src/drawgrid/dg-playback-visuals.js`: per-toy canceled visual cleanup.
- `free-play.css`: compact selected-tool controls and cursors.
- `tests/free-play-silence.test.mjs`, `tests/free-play-line.test.mjs`, `tests/free-play-browser-observer.js`: regression coverage and opt-in browser evidence.

Browser evidence and screenshots are in `resources/debug-output/free-play/silence-*`.
