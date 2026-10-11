# Auto-Arrange v1

Implemented a playable 16-bar arrangement using the normal graph, occurrence scheduler and harmony path. No new node types, adaptation algorithms or synthesis systems were added.

## 1. Entry point

**Arrange** is a labelled button in the main creation dock, outside Advanced. It shows a lightweight **Arrangement ready** result with **Play**, **Edit Arrangement**, **Arrange Again** and **Close**. Arrange pauses the chosen Heartbeat while building; Play starts that transport. Edit focuses the seven generated structures without requiring the basic player to inspect them first.

## 2. Source selection

One source per role, using the current board: normal Simple Rhythm (`loopgrid`) for Rhythm; explicit DrawGrid `accompaniment` or `melody` for the pitched roles. Drum Kit is excluded. Instruments do not determine roles. Existing legacy `bass` roles normalize to Accompaniment.

Selection prefers authored toys over previously filled toys, then the lowest toy ID in codepoint order. The chosen Melody, otherwise Accompaniment, otherwise Rhythm determines the Heartbeat domain. Candidates on a different Heartbeat stay untouched; missing roles in the chosen domain are filled. Unrooted sources may be used. Internal art boards remain scoped to their own board.

## 3. Missing roles

Missing parts use ordinary toy creation and existing musical randomisation:

| Role | Toy | Default instrument |
| --- | --- | --- |
| Rhythm | Simple Rhythm | Drum Kick |
| Accompaniment | DrawGrid | Retro Triangle |
| Melody | DrawGrid | Piano |

Filled toys have explicit roles and an internal `autoArrangeOrigin: filled` persistence tag. They retain normal editing controls. Subsequent Arrange runs reuse their edited music instead of randomising it again. Zero suitable source toys produces “Make a musical idea first, then press Arrange.”

## 4. Recipe

| Section | Bars | Layers | One-bar chord steps |
| --- | --- | --- | --- |
| Intro | 1–4 | Accompaniment | C / Am / F / G |
| A | 5–8 | Rhythm + Accompaniment + Melody | C / Am / F / G |
| B | 9–12 | Rhythm + Accompaniment + Melody | F / G / Am / C |
| Outro | 13–16 | Accompaniment | C / Am / F / G |

B changes the setting of the same motif by reordering the same chords. No new melody, random variation or transposition is introduced by the recipe. The existing complete-progression semantics provide each section's four bars; no per-bar nodes or Repeat wrappers are needed.

## 5. Real topology and editing

```text
Heartbeat
└ Arrangement (Sequence)
  ├ Intro (Chord Progression) → Accompaniment source
  ├ A (Chord Progression)
  │ └ A layers (Together) → Rhythm / Accompaniment / Melody sources
  ├ B (Chord Progression)
  │ └ B layers (Together) → same three sources
  └ Outro (Chord Progression) → same Accompaniment source
```

Seven ordinary editable structures, one transport edge and eight shared-source references. References are ordinary sequence connections terminating at a toy's pattern socket. They compile to independent occurrences of that source pattern in the existing runtime, without copying notes or traversing the source's separate outgoing chain. Dashed wires distinguish references; their midpoint can disconnect them. Normal source input/output sockets remain available.

The root directly receives Heartbeat power and automatically cycles after 6,144 ticks (16 bars). Scoped Chord Progression uses production adaptation; local and graph transpose still use the existing centralized pitch processing. Feedback selects the actual reference and section ancestors for each occurrence.

Placement uses existing graph placement, treating shared sources as references rather than movable descendants. All seven structures initially collapse; Edit expands/selects the root and frames the compact graph. Browser QA caught and fixed layout inflation from reference wires and stale camera bounds during expansion.

## 6. Ownership and replacement

Each result tags its generated structures with one owner ID and records the root, source IDs, source origins and displaced direct Heartbeat connections. Arrange Again removes only structures belonging to the previous result on that board. Authored toys, filled toys and unrelated structures survive. Selected standalone source transport edges move to the arrangement root so those sources do not also play independently. Existing authored chains remain attached and unchanged; other powered branches retain their normal playback behavior.

If a previously selected source is no longer used, its recorded standalone transport connection is restored when its primary input remains free. Failed construction rolls back the previous structures and connections. Filled toys created before a failure remain ordinary editable toys.

## 7. Browser musical proof

Used the normal **Arrange** button and real production playback, not a separate lab renderer. Supplied sources were a repeated C3 accompaniment, an eight-note pitched melody and a four-hit Simple Rhythm pattern. Captured scheduling confirms:

- Intro/Outro only schedule Accompaniment; A/B schedule the full trio.
- Accompaniment produces C3 → A2 → F3 → G2 in the default progression and F3 → G2 → A2 → C3 in B.
- The melody retains its source motif with adaptation no larger than one semitone in this fixture.
- Percussion retains its pitches and has no resolved harmonic chord.
- Source strokes, active steps and note lists remain intact.
- A 708-event capture extends beyond three complete arrangement cycles.

The melody-only browser scenario produced nonempty, editable Rhythm and Accompaniment fills. Their real note events use the correct roles and production harmony. Editing the filled accompaniment through Advanced randomisation and local transpose (+3), then Arrange Again, preserved all three source states and replaced seven structures with seven new structures.

This establishes motif retention and actual audio scheduling. Subjective listening was not performed; perceived recognisability and mix quality still need a human ear check.

## 8. Persistence

Reloaded both scenarios without regeneration and played them using normal transport controls. Seven structures, eight source references, progression data, toy IDs, roles, filled tags and edited local transpose all survived. Regeneration after reload still recognizes ownership. DrawGrid stroke coordinate normalization introduces only floating-point roundoff (about 10⁻¹⁶); musical note/step data remain identical.

Importable examples:

- [Three authored ideas](auto-arrange-three.scene.json)
- [Melody plus edited fill parts](auto-arrange-filled.scene.json)

Both example exports reset Heartbeat to paused at tick zero for convenient playback from Intro.

## 9. Tests and evidence

**881 tests passed, zero failures.** New coverage includes supplied role combinations, fills, deterministic selection, unchanged sources, exact duration/order/layering, production pitch decisions, whole-root looping, reference feedback, editable source changes, independent Heartbeat domains, safe regeneration, unrelated topology, ordinary roundtrip persistence, failed-build rollback, reference dragging/preview and layout, UI concurrency and failure handling.

- [Full suite output](debug-output/auto-arrange-tests.txt)
- [Browser proof summary and capture filenames](debug-output/auto-arrange-browser-proof.json)
- [Repeatable capture checker](auto-arrange-browser-proof.mjs), run with `node resources/auto-arrange-browser-proof.mjs`
- [Three-source playback capture](debug-output/harmony-graph-2026-10-11T11-20-57-218Z.json)
- [Multiple whole-piece cycles](debug-output/harmony-graph-2026-10-11T11-18-27-707Z.json)
- [Reloaded edited fills and playback](debug-output/harmony-graph-2026-10-11T11-27-10-116Z.json)

Browser capture fixtures live in `tests/harmony-graph-browser.html`: select **Arrange: three authored ideas** or **Arrange: melody only**, load the fixture, then use the ordinary dock and transport controls. Save observations writes to `resources/debug-output` through the existing local log server.

## 10. Evaluate by ear before expansion

Listen for whether the accompaniment exposes chord changes clearly, the melody remains recognisable in the mix, B's reordered chords provide enough contrast, filled patterns support the authored idea, and the Outro-to-Intro loop feels natural. Existing randomisation can produce fills with different density/register on separate first runs; the structural recipe itself is deterministic. Do not add new arrangement styles or retune harmony until these listening checks establish what needs improvement.
