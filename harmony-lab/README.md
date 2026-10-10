# Harmony Lab
Open the Perf Lab with **Ctrl+Shift+P**, then select **Harmony**. Switching tabs
or closing the menu pauses playback and preserves the bench settings.

For standalone access, open `/harmony-lab/` on a local development server. On a hosted copy, use
`/harmony-lab/?debug=1`. The bench has no link in the normal player navigation.

Choose a preset, press Play, and switch between Original and Follow Chords.
A/B switches preserve the transport and source notes. Edits apply to future
unscheduled notes; the short shared audio lookahead stays committed.

- Bass defaults to C3 G3 E3 G3, one note per beat.
- Melody defaults to E4 G4 A4 G4 E4 F#4 D4 C4, one note per beat.
- Drums use real kick/snare/closed-hat samples with fixed half-beat timing.
- Both pitched parts can use the production Bass or Melody role.
- Original removes harmony from the lab occurrence context; Transpose still applies.
- Follow Chords uses the unchanged production harmonic adaptation boundary.
- The shared chord editor supports 1–8 major/minor chords and all four tick presets.
- Current chord uses the production resolver. Pitch decisions are displayed when
  notes sound, rather than when lookahead schedules them. The event table keeps 24 rows.
- Reset Test pauses the lab and restores defaults. Lab edits are never saved to the board.

Playback uses the shared transport, occurrence runtime, scheduler, instrument
loader and final audio boundary. Selectable bass tone and the fixed melody sound keep timbre constant
between comparisons. The progression has a stable local origin at transport
tick zero; Return to Start re-establishes that origin.

This bench does not alter the Follow-Chords algorithm. Listen for motif identity,
rhythmic stability, register jumps, chromatic flattening and ambiguous inferred keys.

Mode diagnostics use the single lab model for both the buttons and scheduling.
“Selected mode” shows the current choice; history retains each committed event’s
actual production decision. A Follow event with missing harmony emits a
HARMONY LAB ERROR in the console and bench status rather than silently bypassing.

Regression: C C C C with the Bass role, C | Am | F | G, 1 bar per chord,
Transpose 0 produces C3 → A2 → F3 → G2 in Follow and C3 throughout Original.
Live toggles preserve transport and already committed notes.

Listening mix: triangle bass is the default (square and sine are selectable).
Bass / Melody / Drums each have Solo, Mute and a level control. Defaults are
60% / 100% / 45%; Reset Test restores these. Solo isolates audio without
changing note timing, source, harmony decisions or transport. A/B uses the same
mix and selected bass tone. Melody is soloed by default; Solo Bass with C C C C remains a reference check.


Melody evaluation:
- A: chord-tone friendly, B: scale motif with one chromatic passing tone, C: repeated-note motif, D: chromatic stress.
- Four progression presets retain manual chord and duration editing.
- Play Original / Play Follow restart at zero. A/B plays one complete shared
  source/progression cycle in Original, then one in Follow, and stops.
  The cycle is the least common multiple of both source lengths, progression
  duration and drum loop, so custom lengths may make a longer comparison.
- Differences is visual only: changed harmony notes are highlighted, kept
  notes dimmed. Movement excludes Transpose.
- Follow-only counters measure audible melody events. Mean movement uses
  changed notes; repeated/direction relationships use adjacent beats and break
  at rests or skipped events. New leaps count adapted intervals over 5 semitones
  whose source intervals were at most 5. These are separate diagnostics.
- Source is always visible beside the latest complete recorded Follow pass.
  Latest melody inspection uses production chord/scale/adapted/final metadata.
- Preset, source, progression or melody-role edits reset diagnostics; Reset
  Comparison clears them without replacing the authored test. Old committed
  notes can finish but cannot repopulate a new evaluation.
- Follow history keeps 64 melody events and labels chord boundaries; general
  pitch history still keeps 24. No adaptation or scale algorithm is changed.


Log files: **Save logs to resources** uses the existing results server's
/debug-output route. With the default server configuration, it writes
resources/debug-output/harmony-lab-log-<timestamp>.json. No server restart or
new route is needed. DEBUG_OUTPUT_DIR / PERF_LAB_OUT_DIR overrides still apply.
debugOutputUrl / postUrlDebug in resources/perf-lab-auto.json and the Perf Lab
window.__DEBUG_OUTPUT_URL override are supported. Download logs JSON works
without the server.

Files include authored settings and mix, transport/comparison state, melody
statistics and recorded adapted pass, and up to 4,096 audible pitched events
for the current comparison (both Original and Follow). This log is independent
of the 24-row visible table; exports report dropped events if the cap is reached.
Comparison resets and authoring changes clear it together with the statistics.
Saving captures sounding decisions so far and leaves playback running.
