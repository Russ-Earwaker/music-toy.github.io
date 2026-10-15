# Melody lines and camera/audio timing

Continuation creation discarded the drawn strokes while retaining notes. Chunks now retain their line data; the development chunk swaps clipped line halves along with its note motif. Clipping also handles backwards strokes. Notes remain authoritative and are not regenerated from the repaired visuals. On loading a saved generated Phrase, missing continuation strokes can be recovered from the first chunk's surviving line without changing edited notes. If that original line is absent too, the exact lost drawing cannot be recovered.

DrawGrid's state loader, paint redraw and map regeneration now share the same per-toy preservation flags. The regeneration reason is also per toy. Previously these extracted modules could lose that protection and re-snap imported notes during presentation work. The browser proof asserts the authored note map survives Arrange and camera movement exactly; real drawing edits still release the protection normally.

The direct audio fault was in `gateTriggerForToy`: lookahead events were deferred with JavaScript timers until about 2 ms before onset. Camera stalls delayed those callbacks, so Web Audio received notes late. DrawGrid, Simple Rhythm and Drum Kit now commit cancellable Web Audio sources immediately at their requested future times. Existing per-occurrence/source cancellation handles pause, deletion and generation changes; generic legacy callbacks retain their deferred behavior.

The audio poll no longer refreshes Linked Copy controls. Unchanged presentation is cached, and playback getters reuse their definition/representative instead of repeatedly scanning the DOM and writing data attributes. The scheduling window is now one second, covering heavier canvas reveal work. Consequently, a live edit may encounter up to one second of already committed notes; visuals and harmony indicators still follow playback time.

## Evidence

- Browser confirmed a continuation displays both its line and nodes. All four definitions and eight A/B melody views contain strokes.
- An intermediate camera run exposed scheduling delays over 600 ms despite lookahead, identifying the deferred audio gate as the cause.
- A direct mouse-panning run recorded **160 production notes with zero late scheduling deadlines**, median scheduling lead around 990 ms. The final combined source-preservation/panning run recorded **88 notes**, none over 1 ms late (maximum 0.67 ms), with about 970 ms median lead.
- Header/control mutations fell from **41,579 over 552 timer samples** to **51 over 320 samples**. Sample durations differ; the reduction also holds per sample. Camera rendering can still stall the main thread: an earlier direct-pan sample peaked around 288 ms, and the final cold-reveal sample included a 2.06-second timer gap. Stalls longer than the scheduling window can still exhaust queued audio; this work fixes timer-driven note creation and redundant UI work, not every renderer stall.
- **951 tests pass**, including line preservation, clipping, non-destructive saved-line repair, cached presentation/getters, immediate audio commitment and per-occurrence/generation cancellation. `git diff --check` passes.

Changed production files: `src/drawgrid/dg-phrase-chunks.js`, `src/drawgrid/drawgrid.js`, `src/linked-definitions.js`, `src/linked-toy-views.js`, `src/main.js`, `src/toy-audio.js`, `src/drawgrid/drawgrid-player.js`, `src/grid-core.js`, `src/drum-core.js`. Tests and browser observations cover the changes.

Artifacts: [browser proof](debug-output/melody-lines-camera-proof.json), [full test log](debug-output/melody-lines-camera-tests.txt). Recheck saved browser data with `node resources/melody-lines-camera-proof.mjs`.

Timing evidence comes from requested Web Audio timestamps and scheduling deadlines in this browser, not a guarantee against every hardware or rendering stall.
