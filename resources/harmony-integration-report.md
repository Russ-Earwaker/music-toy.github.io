# Normal graph harmony validation

Validated Heartbeat → Chord Progression → Repeat ×4 → Together with real Bass Guitar Slap, Piano and Drum Kit providers. No harmony algorithms changed.

| Graph | Bass under C / Am / F / G | Melody | Drums |
| --- | --- | --- | --- |
| Progression → Repeat → Together | C3 / A2 / F3 / G2 | Scale tones kept; F♯4 becomes F4 | C4 unchanged |
| Transpose +12 → Progression | C4 / A3 / F4 / G3 | Harmony adaptation before +12 | C4 unchanged |
| Progression → Transpose +12 | C4 / A3 / F4 / G3 | Same ordering and result | C4 unchanged |

Actual browser audio-decision logs were checked programmatically, including all four chord contexts and unchanged authored step/note arrays:

- [Base graph: 176 events](debug-output/harmony-graph-2026-10-10T15-36-40-718Z.json)
- [Outer Transpose: 192 events](debug-output/harmony-graph-2026-10-10T15-42-15-678Z.json)
- [Inner Transpose after restoration fix: 173 events](debug-output/harmony-graph-2026-10-10T15-45-31-864Z.json)
- [Live edits, tempo and source rhythm](debug-output/harmony-graph-2026-10-10T15-46-46-889Z.json)

Found and fixed one production difference: replacing a scene could retain the previous graph's occurrences/scheduler cursors and leave the restored topology silent. Connection restoration now clears those playback states. Live graph edits keep their existing occurrence behavior.

Browser checks confirmed a live Am → Dm edit produces D3 (D4 with +12), pause/resume, BPM changes, collapse/expand, editing the original melody toy's rhythm, saving, and reload. Reload retained the edited progression, 118 BPM and collapsed modifier. Activation/wire traversal and persistence checks pass. Scene thumbnail capture emitted an unrelated existing `oklch` warning; scene state saved correctly.

120 focused tests passed, including six new connection-graph integration regressions. No remaining harmony runtime blocker found before Auto-Arrange. Audio evidence comes from actual scheduling decisions; subjective listening remains a human check.

To repeat: open [the browser check](../tests/harmony-graph-browser.html), choose a graph variant, load the fixture, and use the normal board controls. Its Save button writes observations to `resources/debug-output` through the existing results server. The [scene fixture](harmony-integration.scene.json) can also be imported through Save / Load / Share.
