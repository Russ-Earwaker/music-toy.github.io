# BeatSwarm authored music and Lead Ball restoration

## Findings and fixes

1. **Foundation:** rocket commits already wrote bassDrive.patternChain. Playback was still suppressed while another missile event or its temporary playback owned the lane, and the director's silent section could disable the authored bed. The instrument wrapper also rejected committed playback during same-lane authoring. Canonical playback now survives those gates, and temporary rocket loops relinquish audio ownership once the theme exists.
2. **Accent:** bumper commits already accumulated accentRhythm.patternChain. The audio wrapper silenced that committed lane during subsequent bumper authoring, while temporary bumper loops could mask the loss or double playback. Committed Accent now passes the authoring guard; its continuity suppresses competing director carriers even in silent sections. Temporary bumper loops relinquish ownership after commit.
3. **Lead:** the beat-step adapter omitted the helpers identifying the canonical ball motif and literal playback. The later Lead path also switched from the authored phrase into intensity interpretations after the four-loop protection window. The adapter now forwards those helpers, and the canonical ball motif continues to supply the original notes and rests beyond handoff. Temporary ball playback no longer duplicates it.

The before-run trace contained 20 missing canonical Foundation occurrences, 21 Accent occurrences and 7 Lead occurrences between commits. Some temporary interaction playback and later director playback were audible, so this was intermittent loss of canonical ownership rather than failure to save every theme.

## Persistent path and transport

Rocket/bump collision -> quantized contribution -> existing theme commit with merge/extend -> canonical pattern -> shared director beat-step queue -> event execution -> instrument output. Ball collision reserves one quantized capture slot; eight captured notes commit Lead to the drawgrid tune chain and canonical motif history.

Foundation and Accent each use 16 transport steps; Lead uses 32; the weapon riff uses 16. All align to the existing eight-step bar. Lead retains its existing next-tick playback origin. No transport restart, new clock, audio interval or animation-based repetition was added. The repair concerns scheduling adapter information, persistent lane ownership and playback gating.

Normal contribution transitions preserve themes. A fresh main-flow entry/reset clears authored Foundation, Accent and Lead before prelaunch; the existing sequence initializer also starts empty. Restart clearing was previously deferred until the corridor ended. Restoring a saved state remains separate.

## Ball audit and physical response

There is no Math.random steering in Lead Ball. Velocity is the existing 1450 world units/second, guided toward scored visible enemies. Selection considers direction, distance and recent note variety; there is no prescribed target order. An authored holding orbit handles pacing gaps or unavailable targets. These selection and fallback rules remain.

The apparent wandering had several concrete causes: proximity tests used a pacing-dependent 118/150-logical-unit halo rather than the visible bodies; swept detection returned closest approach rather than first surface contact; impact response used the frame-end world position; and the ball immediately aimed at another enemy instead of showing the impact-normal rebound. The collider search could also include offscreen enemies.

Ball/enemy positions and steering use world coordinates (enemy wx/wy). Collision projects those positions once into logical arena coordinates. Ball radius is 42 logical units; ordinary target body radius is 21, or 29 for the reserve asteroid, with the target's existing spawn scale. These match the rendered body sizes and presentation projection. No DOM/screen coordinates enter collision geometry. The repaired camera was unchanged.

The new circle sweep finds the earliest surface intersection, separates the ball at that contact, and reflects velocity about the contact normal without changing energy. A 0.14-second rebound interval makes the impact visible before existing target guidance resumes. Immediate impact graphics/target flash precede the existing transport-quantized note and capture. Pending/used enemy sets and contact cooldown prevent repeated overlapping contributions. The collision sweep runs before viewport clamping. No random post-impact angle was added. Intentional reserve placement variation and the deterministic holding route remain.

## Verification

- 261 BeatSwarm tests pass, including baseline control/range/spawn protections.
- Deterministic centred, glancing, high-speed, initial-overlap, near-miss and repeated-contact fixtures pass. Real runtime contact tests also pass at camera scales 0.31 and 0.46.
- The full browser route uses Advanced -> BeatSwarm -> pointer pull/release -> corridor -> both rocket contributions -> both bumper contributions -> eight ball impacts -> director. It checks actual instrument calls against every canonical note/rest between commits and checks audio source starts in a running AudioContext. The final observation lasts 65 seconds beyond stage completion.
- Final trace: 210 canonical Foundation notes, 78 Accent notes and 106 Lead notes checked against committed patterns, with no missing notes, unexpected notes on rests, or duplicate canonical occurrences. Actual audio voices started repeatedly for all three layers (221 Foundation, 83 Accent, 117 Lead). Later director contributions extended existing rhythm bits instead of replacing them.
- Separate browser reset check confirms zero authored Foundation/Accent/Lead steps and fresh prelaunch.
- git diff --check passes. No changes were made to launch, drag controls, corridor motion, weapon cadence, camera, projectile range, offscreen spawning, director spawn timing, or Toy/Simple UI in this task.

Full-flow evidence: playthrough.json; compact counts: verification.json. Physical contact screenshots: lead-impact-1.png, lead-impact-4.png, lead-impact-8.png, with matching snapshots. before.json preserves the original missing-occurrence trace.

This was an automated browser playthrough with instrument/voice tracing and screenshot inspection. Human listening and a human-operated playthrough remain unverified.

## Files changed for this task

Production: src/beat-swarm/beat-swarm-mode.js, beat-swarm-beat-update-runtime.js, beat-swarm-step-events.js, beat-swarm-lead-ball.js, and new beat-swarm-lead-ball-collision.js.

Verification: tests/beat-swarm-baseline.browser.mjs, beat-swarm-authored-playback.test.mjs, beat-swarm-lead-ball-collision.test.mjs, beat-swarm-music-qa.mjs; artifacts/beat-swarm-music/.

Earlier local restoration changes and the pre-existing rhythmake.zip modification were preserved. No commit or deployment was made.
