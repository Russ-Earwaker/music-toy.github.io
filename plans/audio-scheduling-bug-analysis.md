# Audio Scheduling Bug Analysis & Fix Plan

## Issues Identified

### Issue 1: First 2 Notes Play Faster on Chained Toys (CONFIRMED BUG)

**Location:** [`src/note-scheduler.js`](src/note-scheduler.js:75-84)

**Root Cause:**

When a toy is activated (either at transport start or when becoming the active chain link), `__chainJustActivated` is set to `true`. This triggers an extended scheduling window that covers the entire bar, allowing all columns (including column 0) to be scheduled.

However, at the bar boundary, there's a bug in the state transfer logic:

```javascript
// Lines 75-84 in note-scheduler.js
if (toyState.lastBarStart !== barStart) {
  toyState.lastBarStart = barStart;
  toyState.scheduledCol0InCurrentBar = false; // Reset at bar boundary
  if (toyState.preScheduledCol0At === barStart) {
    const key = Math.round(barStart * 1000);
    toyState.scheduled.add(key);
    toyState.lastScheduledByCol.set(0, barStart);
    toyState.preScheduledCol0At = null;
  }
}
```

The problem:
1. When column 0 is pre-scheduled (for next bar), `preScheduledCol0At` is set to `nextBarStart`
2. At the bar boundary, `barStart` becomes `nextBarStart`
3. The condition `preScheduledCol0At === barStart` is TRUE, so column 0 is marked as scheduled
4. **`scheduledCol0InCurrentBar` is set to `false`** at line 77
5. On the NEXT bar boundary, `preScheduledCol0At` is now `null`
6. Column 0 is NOT transferred from pre-scheduled state
7. But `scheduledCol0InCurrentBar` is still `false` from the previous reset!
8. The check at line 117 `if (col === 0 && toyState.scheduledCol0InCurrentBar)` evaluates to `false`
9. **Column 0 gets skipped entirely, causing the first note to play late or be missed**

**Flow Diagram:**

```
Bar N: Toy activated → extended window → column 0 scheduled → preScheduledCol0At = Bar(N+1) start
         ↓
Bar N boundary: scheduledCol0InCurrentBar = false, preScheduledCol0At transferred
         ↓
Bar N+1: Column 0 skipped because scheduledCol0InCurrentBar = false
         ↓
Result: First note of Bar N+1 is MISSED or plays late
```

### Issue 2: Potential Double-Playing (LIKELY CAUSE)

**Location:** [`src/drawgrid-player.js`](src/drawgrid-player.js:123-132) and [`src/grid-core.js`](src/grid-core.js:176-203)

**Analysis:**

The system has two scheduling paths:
1. **`__sequencerStep`** - Called by the RAF-based scheduler in `main.js` (lines 3506-3527)
2. **`__sequencerSchedule`** - Called by the audio scheduler in `note-scheduler.js` (line 174)

Both functions call into `playColumn`, which triggers notes. The guard in `drawgrid-player.js`:

```javascript
panel.__sequencerStep = (col) => {
  const useScheduler = !!window.__NOTE_SCHEDULER_ENABLED;
  const shouldPlayAudio = !useScheduler;
  playColumn(col, undefined, { visual: true, audio: shouldPlayAudio });
};
```

This correctly prevents double-playing when the scheduler is enabled. However, there's a potential race condition:

1. When `window.__NOTE_SCHEDULER_ENABLED` is toggled mid-playback
2. Or when toys are activated/deactivated during chain transitions

**The Likely Cause of Volume Increase:**

The `toy-hit` event is dispatched in two places:
1. [`toy-audio.js:138`](src/toy-audio.js:138) - in `gateTriggerForToy`
2. [`audio-samples.js:323`](src/audio-samples.js:323) - in `triggerInstrument`

If both paths trigger, volume could effectively double. However, looking at the code flow, this is mitigated by the `useScheduler` guard. The more likely cause is:

**The bar-skip bug (Issue 1) causes timing inconsistencies where notes from adjacent bars overlap, creating a perceived volume increase.**

---

## Proposed Fix

### Fix for Issue 1 (Primary)

**File:** [`src/note-scheduler.js`](src/note-scheduler.js)

**Change lines 75-84 from:**
```javascript
if (toyState.lastBarStart !== barStart) {
  toyState.lastBarStart = barStart;
  toyState.scheduledCol0InCurrentBar = false; // Reset at bar boundary
  if (toyState.preScheduledCol0At === barStart) {
    const key = Math.round(barStart * 1000);
    toyState.scheduled.add(key);
    toyState.lastScheduledByCol.set(0, barStart);
    toyState.preScheduledCol0At = null;
  }
}
```

**To:**
```javascript
if (toyState.lastBarStart !== barStart) {
  toyState.lastBarStart = barStart;
  // Always reset scheduledCol0InCurrentBar at bar boundary.
  // If column 0 was pre-scheduled from previous bar, it will be
  // rescheduled in this bar via the normal scheduling logic.
  toyState.scheduledCol0InCurrentBar = false;
  if (toyState.preScheduledCol0At === barStart) {
    const key = Math.round(barStart * 1000);
    toyState.scheduled.add(key);
    toyState.lastScheduledByCol.set(0, barStart);
    toyState.preScheduledCol0At = null;
  }
}
```

**Wait, the code is already like that.** Let me re-examine...

Actually, looking more carefully at the issue:

The problem is that when `preScheduledCol0At === barStart` is true:
1. Column 0 is added to `scheduled` set
2. `preScheduledCol0At` is set to `null`
3. But `scheduledCol0InCurrentBar` is reset to `false` at line 77

On the NEXT bar boundary:
1. `preScheduledCol0At` is now `null`
2. So the transfer doesn't happen
3. `scheduledCol0InCurrentBar` is still `false` from the reset at line 77
4. Column 0 gets skipped!

**The fix should be: Don't reset `scheduledCol0InCurrentBar` when we transfer a pre-scheduled column 0:**

```javascript
if (toyState.lastBarStart !== barStart) {
  toyState.lastBarStart = barStart;
  // Only reset scheduledCol0InCurrentBar if we're NOT transferring a pre-scheduled column 0
  const transferringPreScheduledCol0 = toyState.preScheduledCol0At === barStart;
  if (!transferringPreScheduledCol0) {
    toyState.scheduledCol0InCurrentBar = false;
  }
  if (transferringPreScheduledCol0) {
    const key = Math.round(barStart * 1000);
    toyState.scheduled.add(key);
    toyState.lastScheduledByCol.set(0, barStart);
    toyState.preScheduledCol0At = null;
    // Keep scheduledCol0InCurrentBar as true to prevent rescheduling in same bar
  }
}
```

### Fix for Issue 2 (Secondary)

Add additional guards to prevent any potential double-playing:

**In [`src/drawgrid-player.js`](src/drawgrid-player.js:123-132), ensure the guard is robust:**

```javascript
panel.__sequencerStep = (col) => {
  const useScheduler = window.__NOTE_SCHEDULER_ENABLED === true;  // Strict equality check
  // Guard: if scheduler is enabled, __sequencerSchedule handles audio.
  // Prevent __sequencerStep from also triggering audio.
  const shouldPlayAudio = !useScheduler;
  playColumn(col, undefined, { visual: true, audio: shouldPlayAudio });
};
```

---

## Testing Recommendations

1. **Test chained toys at bar boundaries**
   - Create 2+ chained toys
   - Set notes on column 0 of both toys
   - Play and listen for consistent timing at each bar wrap

2. **Test at different BPMs**
   - The bug may manifest differently at various tempos

3. **Test with frame rate throttling**
   - Use Chrome DevTools to throttle CPU
   - Verify notes stay on beat

4. **Monitor for double-playing**
   - Use the audio diagnostics if available
   - Listen for unexpected volume changes

---

## Files Affected

| File | Lines | Change |
|------|-------|--------|
| `src/note-scheduler.js` | 75-84 | Fix bar boundary state transfer |
| `src/drawgrid-player.js` | 123-132 | Add strict guard for scheduler flag |

---

## Related Documentation

- Audio scheduler architecture: [`src/note-scheduler.js`](src/note-scheduler.js)
- Sequencer integration: [`src/main.js`](src/main.js:3506-3527)
- Grid toy implementation: [`src/grid-core.js`](src/grid-core.js)
- Drawgrid toy implementation: [`src/drawgrid-player.js`](src/drawgrid-player.js)
