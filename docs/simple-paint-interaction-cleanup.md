# Simple Paint interaction cleanup

The existing `simple-draw` presentation/type and container architecture remain in place; this report uses the player-facing Simple Paint name.

## One toy, one authored line

`simple-draw.js` rejects a draw with `LINE_EXISTS` when the container has authored gesture history, owned internals, or a pending creation. It no longer clears/replaces existing internals when another stroke arrives. The surface also ignores Draw gestures while a line exists or creation is pending. Clear cancels pending work, removes the owned musical content, and permits one fresh line. One authored line may still map to several ordinary DrawGrids for its normal bars/partial bar.

Board Paint creation still creates a new container for each committed gesture. Browser checks cover two separately armed board gestures producing separate authored containers.

## Move the toy, not the line

The Move line button, its pressed state, pointer-drag branch, and surface movement API were removed. The normal container handle remains responsible for moving the whole toy. The private helper for fitting Straighten/Re-coil presentation now only fits/rebases the existing authored geometry; it accepts no translation delta. Cut/sag, morphing, internal note edits, and container layout remain intact.

Completed Draw surfaces use a default cursor and an accessible description explaining Scissors/Paint/Clear, rather than implying that another line can be drawn immediately.

## Heartbeat verification

No transport, graph ownership, or scheduler behavior was changed. Tests exercise the real connection adapter, chain/structure runtime, and note scheduler with a Simple Paint wrapper and compare the result with the same ordinary unwrapped chain:

- Disconnect while playing stops future scheduling and invokes the normal cancellation path.
- Reconnect while playing emits only future notes, on the ordinary Heartbeat root timeline, with no catch-up burst or duplicate historical notes.
- Repeated disconnect/reconnect remains on the normal phase grid.
- Disconnect while paused, Return to Start, and reconnect match the ordinary chain's behavior.
- A disconnected JSON save reloads disconnected and schedules no notes; ownership discovery does not restore the wire.

There is no new fallback clock, auto-connection, or global transport restart path.

## Scissors fallback

Direct node hits retain the existing radius, live feedback, and mute-state updates. A gesture that directly cut any valid node receives no fallback cuts.

For a swipe without direct hits, release checks the recorded stroke segments against the visible musical string segments, retaining authored path order through coils and self-crossings. A true crossing brackets the previous/next musical notes by path progress, filters already-cut/invalid candidates, and chooses the neighbor with the shortest visible path distance. Each unique crossed position yields at most one fallback note. Revisiting the same crossing cannot cut both neighbors.

The fallback excludes distant near misses, parallel/collinear drags, taps, touches that turn back without crossing, gaps in the cut string, and tails outside meaningful note content. It uses the existing canonical `setSilence` path, including cancellation of affected future events. Fast and slowly sampled sparse-line swipes are covered in model and browser tests.

## Note-point visibility

Playable points now have a slightly larger colored core, a pale center/rim, stronger glow, and a dark separator against the line/background. Triggered points have a larger pulse and short star rays. Cut notes remain identifiable as subdued rings with a slash; paint-covered notes use hollow diamonds. Muted points do not flash as playing notes.

Points render after surface paint so their state remains visible over black paint. MIDI, pitch, timing, duration, partial bars, note IDs, mute reasons, and coverage rules are unchanged. Rendering tests verify that the source remains unchanged.

[Point-state comparison](../artifacts/expressive-visibility-comparison.png) covers empty board, a bright nearby-toy background, black paint, and active line glow, in both coiled and uncoiled views.

## Verification and limits

Run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tests/run-expressive-ui.ps1
```

Results:

- **120 model tests passed**: the existing suites plus 15 interaction/ownership/scissors/Heartbeat regressions. Existing Node test bodies run through the documented browser adapter because Node is unavailable on this machine.
- **52 browser interaction assertions passed**, repeated for Draw, Scissors, and Paint screenshots. These include completed-line blocking, removed movement, Clear/redraw, independent board creation, fast/slow sparse crossings, existing paint/scissors behavior, Open/Close, Expand, and shared controls.
- **64 pixel/render assertions passed** across eight background/view combinations.
- Headless Chrome screenshots were visually inspected. These are automated component/browser fixtures; physical touch gestures and live audio output in a full interactive saved-board session were not manually verified.

[Model results](../artifacts/expressive-model-results.txt) · [Interaction results](../artifacts/expressive-draw-results.txt) · [Visibility results](../artifacts/expressive-visibility-results.txt)

## Files changed in this pass

- `src/simple-draw.js`: one-line/pending ownership guard; remove replacement behavior.
- `src/simple-draw-surface.js`: block further drawing, remove line movement, render visible point states above paint.
- `src/main.js`: remove surface movement API; retain presentation-only fitting.
- `src/free-play-scissors.js`: path-ordered crossing fallback.
- `src/free-play-tools.js`: apply fallback on release through canonical silence updates.
- `src/free-play-line-visual.js`: clearer playable/cut/covered/triggered point rendering.
- `free-play.css`: completed-line cursor feedback.
- `tests/simple-paint-interaction.test.mjs`: new ownership, movement, scissors, and Heartbeat regressions.
- `tests/free-play-silence.test.mjs`: update obsolete invisible-muted-marker expectation; retain the no-flash/no-text checks.
- `tests/expressive-ui.browser.html`: interaction regressions and canonical fixture note IDs.
- `tests/simple-paint-visibility.browser.html`: new background/state pixel checks and comparison.
- `tests/expressive-model-regression.browser.html`, `tests/run-expressive-ui.ps1`: include new suites/visibility checks.
- `artifacts/expressive-*-results.txt`, `artifacts/expressive-*-comparison.png`: updated verification artifacts.
