# Backlog


- **User-selectable note palettes**  
  Allow players to choose different note palettes/scales for the grid (and potentially other toys).  
  - Presets: Major, Minor, Pentatonic (major/minor), Blues, Chromatic, Custom.  
  - Scope: per-toy setting with optional global default.  
  - UI: palette dropdown in zoom header; simple icon/button in standard to open palette picker.  
  - Persistence: remember last selection (localStorage).  
  - Dev notes: expose `setNotePalette(paletteId|array)` on each toy; update random note generator to use current palette.
- **Global “Intensity” layer + background visualiser** *(trimmed; partial progress exists)*  
  Goal: keep the experience musical and readable when things get busy.  
  What: finish `intensity.js` that tracks per-toy note rate/velocity over a short window and emits a smoothed `intensity` (0–1). Draw a subtle background visual (bars/waves/heat) driven by that value so users feel the energy.  
  Touchpoints: add a read-only listener in `audio-samples.triggerInstrument` (or a small relay) to publish toy-hit events; new `intensity.js`; tiny hook in `main.js` to mount a canvas behind toys.  
  Acceptance: visual reacts instantly to activity; intensity is stable (no flicker); **no audible timing changes yet**.

- **Adaptive per-toy mixer (polite gain steering)**  
  Goal: reduce “fighting” without muting notes.  
  What: compute a gentle gain multiplier per toy from (a) user slider (priority), (b) recent activity (from intensity), with slow attack / fast release. Optionally add light sidechain duck when a “lead” toy peaks.  
  Touchpoints: add a per-toy “auto” gain node in `audio-core.js` (after the user gain), controlled by `intensity.js`. Keep user gain sacrosanct; this is multiplicative and bounded (e.g., 0.7–1.0).  
  Controls: small toggle in the toolbar (“Auto-mix”) default on; persists.  
  Acceptance: turning Auto-mix on/off is clearly audible; louder toys breathe around each other; user sliders still feel authoritative.

- **“Polite Randomisation” across toys**  
  Goal: when a user hits Random on one toy, it respects what the others are doing.  
  What: expose a global “activity budget” from `intensity.js`; when a toy randomises, scale density/complexity targets based on (a) global intensity and (b) user-set priorities. E.g., Grid spawns fewer active steps if Rippler is hot; Bouncer limits block count or range accordingly.  
  Touchpoints: add an optional `densityHint` input to each toy’s `doRandom` (Grid/Bouncer/Rippler) and thread it from a small helper `getPoliteDensity()`.  
  Controls: a simple toggle (“Polite random”) in the toolbar; default on.  
  Acceptance: mashing Random across toys never explodes; disabling the toggle restores current behavior 1:1.
