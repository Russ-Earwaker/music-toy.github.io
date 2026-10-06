# Multiple Heartbeats

Every Heartbeat owns a transport from `transportRegistry`. Main and secondary
transports use the same `createTickTransport` implementation and share the
application AudioContext. The existing 25 ms scheduler poll iterates playing
domains; Structures and toys do not acquire clocks or polling loops.

Use **+ Heartbeat** to create a root, and its **+ Toy** action to create a toy on
that root. Branch quick-add inherits its source's root. Ordinary board creation
defaults to Main. Root choice never depends on screen distance.

Heartbeat cards provide play/pause, BPM and Return to Start. The existing topbar
play and tempo controls target the selected Heartbeat, falling back to Main.
Per-Heartbeat volume is deferred; the existing master and toy volume controls
remain available.

## Reparent policy

Connection changes publish one final parent topology. Before runtime compilation,
each moved descendant's old audio generation is invalidated, queued future sources
are cancelled, and its playback instance is replaced. Old prepared Structure turns
are retired, preserving musical definitions, durations and topology.

The destination root starts the moved performance at its **strict next beat** when
playing, or at its **retained tick** when paused/stopped. Children then follow that
performance's local Sequence/Together/Repeat/Timeline layout. Already-started note
tails may finish; they do not schedule future events in the old domain. Mixed-clock
nested definitions are rejected. Connecting a foreign branch to a Structure
reparents the entire connected branch to the Structure's root.

Pause retains the domain's tick and cancels only its queued sources. Resume remaps
that retained tick to current audio time. Return to Start resets only that domain
to tick 0 and rebases its performances there, including the zero boundary.

## Saved scenes and deletion

Scene snapshots include Heartbeat identities, transport IDs, positions, BPM,
retained ticks and playback state, alongside canonical root connections. Reload
restores positions and BPM but always leaves playback inactive. Runtime occurrence
identities are rebuilt at the retained tick rather than serialized.

Scenes without Heartbeat records migrate to permanent `main-heartbeat` using their
legacy BPM. Deleting a secondary Heartbeat removes its root wires and transport;
surviving descendants remain unattached and inactive. New Creation clears secondary
roots as well as the creation graph.

## Verification

- Full Node suite: 667 passing tests, including independent mappings/BPM,
  play/pause, inheritance, cross-domain reparenting, duplicate scheduling,
  nested Structures, mixed-domain rejection, targeted reset, deletion, persistence
  and legacy migration.
- Chrome browser QA: two two-toy trees at 120 and 90 BPM on the same scheduler.
  Web Audio analysers measured nonzero output from every fixture toy. Scheduled
  48-tick steps were 0.25 seconds and approximately 0.333 seconds respectively.
- Main pause retained its tick while the second tree continued advancing and
  producing notes. Resume preserved Main's mapping origin. Resetting the second
  root left Main's tick unchanged. Moving the first tree updated all descendant
  instance domains. No duplicate events within the same audio generation were
  observed in the final pass. Save/reload retained both BPMs, transport identities,
  retained positions and connections with playback inactive.
- Visible UI checks covered creating a second root, tempo editing, creating a toy
  from that root, and connection socket placement.
