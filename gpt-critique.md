I think Codex is probably fixing the symptom, not the choke point.

The strongest signal in your log is that once the lead is alive, the system knows it still needs rhythm coverage, but it never actually gets any:

* `activeSecondaryLoopCoveragePresent:false`
* `reservedSecondaryLoopSpawnNeeded:true`
* `sameSectionCount:1`
* while the primary lead stays present and active for many bars in `bassline_awakens`  

That means this is not mainly a colour bug. The colour clash is probably a clue that the wrong identity/template is being used for the attempted bridge/backbeat carrier, but the real failure is: **after the lead appears, secondary-loop coverage is being requested forever and never materialises**. 

My deeper read of the code points to this likely chain:

1. Lifecycle correctly decides it needs a reserved secondary bridge spawn.
2. It asks `createGroupFromMotif(...)` for `forcedProfileSourceType = 'secondary_bridge_backbeat'`.
3. But `createGroupFromMotif` still runs through a guard that blocks non-response lead-role spawns when `activePrimaryLoopMelodyCarrier` already exists.
4. If the chosen template for that forced bridge spawn is a lead-ish template, the spawn gets rejected before it becomes a real secondary-loop group.
5. So the section stays stuck at one active group: the melody.

That fits your symptoms *very* well:

* lead survives
* everything else goes silent
* `reservedSecondaryLoopSpawnNeeded` stays true for ages
* `sameSectionCount` stays at 1
* and the “second beat had the same colour as the melody” suggests the forced bridge spawn is being created or resolved through a lead-flavoured template/identity path instead of a dedicated rhythm/secondary one. 

## What I’d tell Codex to do next

### 1) Stop secondary-bridge spawns from being blocked by the lead-coverage guard

In `beat-swarm-composer-maintenance.js`, inside `createGroupFromMotif`, find the early block that is effectively:

* not forced intro
* active primary-loop melody exists
* desired lane is not response
* role is lead
* `return null`

That guard makes sense for accidental duplicate melody coverage, but it should **not** kill a forced secondary rhythm bridge.

So add an exemption something like:

```js
const forcedSecondaryBridgeProfile = forcedRhythmProfile === 'secondary_bridge_backbeat';

if (
  !forcedLeadProfile &&
  !forcedIntroProfile &&
  !forcedSecondaryBridgeProfile &&
  activePrimaryLoopMelodyCarrier &&
  desiredLane !== 'response' &&
  role === constants.leadRole
) {
  return null;
}
```

That is the single highest-value change.

## 2) Force a rhythm-safe template/identity for reserved secondary bridge spawns

Right now the visual colour conflict suggests the bridge spawn is walking through a lead template or lead identity path.

For `forcedSecondaryBridgeProfile`, do not let it inherit a generic/lead template choice. Force it into a known rhythm/backbeat template or at least coerce its role/body/identity after creation.

I would make reserved secondary bridge spawns explicitly do all of this:

```js
if (forcedSecondaryBridgeProfile) {
  created.templateId = 'secondary_loop_bridge_group';
  created.musicLaneId = 'secondary_loop_lane';
  created.musicLaneLayer = 'loops';
  created.musicProfileSourceType = 'secondary_bridge_backbeat';
  created.callResponseLane = 'call';
  created.role = constants.bassRole; // or a dedicated rhythm role if you have one
  created.soloCarrierType = '';
  created.identityVisualLocked = false; // let lane visuals win
  created.performers = Math.max(2, Math.trunc(Number(created?.performers) || 0));
  created.size = Math.max(2, Math.trunc(Number(created?.size) || 0));
  created.musicParticipationGain = 1;
}
```

The important part is: **secondary bridge spawns must not look like, behave like, or be rank-blocked like melody carriers**.

## 3) Add a “spawn blocked reason” trace before every `return null`

Codex is currently patching blind. Make the failure explicit.

Inside `createGroupFromMotif`, before each early `return null`, emit a debug event like:

```js
noteMusicSystemEvent?.('music_composer_spawn_blocked', {
  reason: 'blocked_by_active_primary_lead',
  forcedProfileSourceType: forcedProfile,
  forcedSecondaryBridgeProfile,
  desiredLane,
  role,
  activePrimaryLoopMelodyCarrier,
  templateId: effectiveTemplateId,
  requestedTemplateId,
  sectionKey: String(sectionKey || '').trim().toLowerCase(),
});
```

Do this for every major null return:

* blocked by active lead
* blocked by intro bridge
* blocked by existing answer ornament
* blocked by existing foundation carrier
* blocked by solo handoff clamp

That will tell you in one run whether my hypothesis is right.

## 4) Add a post-spawn assertion for reserved secondary bridge coverage

Right after lifecycle asks for a reserved secondary bridge spawn, verify whether that spawn actually produced a live group in the same section.

Something like:

```js
noteMusicSystemEvent?.('music_reserved_secondary_bridge_attempt', {
  sectionKey,
  desiredGroups,
  sameSectionCount,
  reservedSecondaryLoopSpawnNeeded,
});
```

Then after `createGroupFromMotif`:

```js
noteMusicSystemEvent?.('music_reserved_secondary_bridge_result', {
  sectionKey,
  created: !!group,
  groupId: Math.trunc(Number(group?.id) || 0),
  musicLaneId: String(group?.musicLaneId || '').trim().toLowerCase(),
  musicProfileSourceType: String(group?.musicProfileSourceType || '').trim().toLowerCase(),
  role: String(group?.role || '').trim().toLowerCase(),
});
```

Right now the log only shows the system *wants* secondary coverage; it does not clearly show where the request dies. 

## 5) Treat the instrument flips on the lead snapshot as suspicious, but secondary

Your lead snapshot sometimes shows the primary lead on `primary_loop_lane`, `lead_melody`, but with instruments like `BASS TONE 3`, not just `RETRO SQUARE`. That is odd and suggests identity/instrument inheritance is still bleeding across carriers.  

I would not chase that first. Fix the missing secondary coverage first. Once rhythm carriers exist again, the visual/instrument contamination will be easier to isolate.

## What I think is happening in plain English

The system is saying:

> “I have the melody. I still need the rhythm bridge.”

But when it tries to create that bridge, it accidentally routes through logic meant to prevent duplicate melody-style carriers, so the new rhythm carrier gets vetoed. Because of that, the song collapses to a single surviving lead line.

## What success should look like after the fix

On the next debug run, once the lead enters, you should see this transition:

* `reservedSecondaryLoopSpawnNeeded:true`
* then a `music_reserved_secondary_bridge_result` with `created:true`
* then `activeSecondaryLoopCoveragePresent:true`
* then `sameSectionCount` should rise above 1
* and the secondary carrier should get its own non-lead visual identity