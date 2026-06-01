Here’s a Codex-ready plan:

# Beat Swarm - Tap Orb Foundation Beat Plan

## Goal

Implement the first reusable music-building interaction for Beat Swarm: **Tap Orbs**.

This mechanic is used to build the **foundation beat** of the music, one instrument/part at a time.

The player kills special enemies, which drop music orbs. These orbs move to the outside of the circle arena, become unreachable, then wait for player input. When tapped, they trigger a beat sound, create a large visual payoff, damage nearby enemies, and add that instrument/part into the active drum loop.

This should be implemented as a reusable system so later instruments can use the same pattern.

---

## Core Design

### Initial State

At the start of this section:

* There is no beat yet.
* Enemies should be silent.
* Enemies should not fire weapons.
* The arena should feel dead/inactive.
* This creates contrast for when the beat activates.

Enemies may still move and be killed, but their musical and weapon behaviour should be inactive until the relevant beat layer is created.

---

## Flow

### 1. Spawn Foundation Enemy Wave

Spawn a small wave of enemies.

One enemy in the wave should be marked as a **Beat Carrier**.

The Beat Carrier represents the first foundation instrument.

Example:

* `instrumentId: "foundation_kick"`
* `beatTrackId: "foundation_01"`
* `orbType: "tap_orb"`

The Beat Carrier should be visually marked if possible.

---

### 2. Beat Carrier Dies

When the Beat Carrier is killed:

* Spawn a Tap Orb at the enemy death position.
* The orb should contain the instrument/track data from the enemy.
* The orb should not immediately activate.
* It should begin travelling toward a target position outside the circle arena.

---

### 3. Orb Travels To Arena Rim

The Tap Orb should:

* Move from the death position to a position just outside the circle arena.
* Choose a stable resting position around the arena rim.
* Be unreachable by the player.
* Grow slightly as it reaches its final position.
* Settle into an idle/pulsing state.

Once settled:

* Show the word **“TAP”** on or near the orb.
* Pulse visually to attract attention.
* Wait for player input.

---

### 4. Player Taps Orb

When the player taps/clicks the orb:

* The orb is consumed.
* The corresponding beat sound plays.
* The corresponding instrument/track is added to the active drum loop.
* A short-range explosion occurs at/near the orb’s arena position.
* Nearby enemies take damage or are destroyed.
* The arena and enemies produce a strong synced visual flash.

This should feel extremely satisfying.

---

## Multi-Orb Behaviour

The system should support multiple Tap Orbs active at once.

If the player taps more than one orb close together:

* Do not play all beat sounds exactly simultaneously unless that is intended.
* Queue the triggered beats in sequence.
* Each triggered orb should still explode and produce its own visual payoff.
* The loop should add each triggered instrument/part in the correct order.

For now, a simple queue is acceptable.

Example:

1. Player taps Kick Orb.
2. Kick is added to drum loop.
3. Player quickly taps Snare Orb.
4. Snare is queued and added after the kick trigger moment.

---

## Per-Instrument Structure

This mechanic should be data-driven per instrument.

Each Beat Carrier / Tap Orb should define:

* `instrumentId`
* `beatTrackId`
* `soundId`
* `loopLayer`
* `orbColor`
* `explosionRadius`
* `damageAmount`
* `targetArenaSlot`
* `activationOrder`
* `tapPromptText`

Example config:

```js
{
  instrumentId: "foundation_kick",
  beatTrackId: "foundation_01",
  soundId: "kick_01",
  loopLayer: "foundation",
  orbColor: "#ffcc33",
  explosionRadius: 120,
  damageAmount: 999,
  activationOrder: 1,
  tapPromptText: "TAP"
}
```

This should allow us to build the music in sequence:

1. Foundation kick
2. Foundation second beat layer
3. Later rhythmic sections
4. Later melodic or special layers

For this task, focus on the foundation layer only.

---

## Visual Payoff Requirements

Triggering a Tap Orb should produce a major visual reward.

Minimum desired effects:

* Full-screen flash.
* Circle arena flash.
* Orb explosion.
* Enemy flash.
* Pulse wave from orb toward arena centre.
* Optional camera shake.
* Optional brief slowdown/hit-stop.

The arena circle should visibly react.

Enemies should flash even if they are not damaged, so the whole space feels musically activated.

The first successful Tap Orb should make the dead arena feel like it has woken up.

---

## Combat Behaviour Before Beat Activation

Before the foundation beat exists:

* Enemies are silent.
* Enemies do not fire.
* Enemies may move.
* Enemies may approach or pressure the player.
* The lack of firing should feel intentional and eerie.

After the first foundation beat is activated:

* The relevant beat layer starts.
* Enemy firing can become enabled.
* Arena pulse visuals can begin.
* Combat should feel more alive and rhythmic.

---

## Implementation Notes

Please keep this modular.

Suggested pieces:

### BeatCarrier

Enemy flag/component/data that defines what orb it drops.

Responsibilities:

* Store beat/orb config.
* On death, spawn Tap Orb with config.

---

### TapOrb

Object spawned from BeatCarrier death.

States:

* `traveling`
* `settling`
* `ready`
* `triggered`
* `consumed`

Responsibilities:

* Move to arena rim target.
* Grow/settle.
* Display TAP prompt when ready.
* Detect player tap/click.
* Notify music system on activation.
* Spawn explosion/visual effects.
* Remove itself after activation.

---

### BeatOrbManager

System for managing active and queued orbs.

Responsibilities:

* Track active Tap Orbs.
* Assign rim positions.
* Handle multiple simultaneous taps.
* Queue beat activations if needed.
* Notify music/conductor systems.

---

### Music/Conductor Integration

On Tap Orb activation:

* Add the matching instrument/track to the active drum loop.
* Ensure timing is quantized/synchronised.
* For now, simple sequencing is acceptable.
* This should eventually support multiple instruments and layers.

Suggested event:

```js
onBeatOrbActivated({
  instrumentId,
  beatTrackId,
  soundId,
  loopLayer
});
```

---

## Acceptance Criteria

* A special enemy can drop a Tap Orb on death.
* The Tap Orb travels to a resting position outside the circle arena.
* The orb grows/settles and displays “TAP”.
* Player can tap/click the orb.
* Tapping the orb plays the assigned beat sound.
* Tapping the orb adds that instrument/track to the active foundation loop.
* Tapping the orb causes a satisfying explosion and arena-wide visual flash.
* Enemies are silent and do not fire before the foundation beat activates.
* After the first foundation beat activates, combat/music state can transition to active.
* System supports more than one Tap Orb existing at once.
* Tap Orb data is per-instrument, not hardcoded to one sound.
* Code should be modular enough to reuse this mechanic for later beat layers.

---

## Not In Scope Yet

Do not implement the other orb type yet:

* Enemy dies.
* Orb tracks the player.
* Orb gets faster over time.
* Orb reaches player and triggers beat.

That will be used later for other rhythmic sections.

For this task, only implement the Tap Orb foundation beat mechanic.
