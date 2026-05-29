Weapon Gate Lab: Note/Silence Gate Generation Logic

The player cannot avoid gates. Every gate covers the full corridor height, so the system decides what kind of choice the player is about to make before the gate appears.

Each gate fills exactly one weapon slot in sequence:

1. Toy 1, slot 1
2. Toy 1, slot 2
3. ...
4. Toy 1, slot 8
5. Toy 2, slot 1
6. ...
7. Toy 2, slot 8

There are 16 total slots.

A slot can become either:

* Note slot: stores a selected pentatonic note and later fires a projectile in the final weapon loop.
* Silence/Damage Up slot: stores a disabled/silent slot. No final projectile fires on that slot, but the weapon damage budget can later treat the missing shot as extra damage.

Gate types:

1. Note Gate
   All sections are notes from one octave of the current pentatonic scale.

2. Silence Gate
   All sections are Damage Up/silence. This forces a silence but still lets the player pass through a section.

3. Mixed Gate
   Contains mostly notes plus one or more Damage Up sections. The Damage Up section position must be randomized vertically, not fixed at top or bottom.

Important:
A note selection fires a single preview projectile immediately. This projectile should hit a small target spawned ahead of the player. This is only feedback. It does not mean the final weapon loop is firing yet.

Damage Up/silence selection should give feedback, but does not fire a note preview projectile.

Generation goal:
Do not pre-author a fixed pattern. Use live ratio/streak logic so the final 16-slot result has a nice musical distribution of notes and silences.

Track this state:

* totalSlots = 16
* targetSilences
* targetNotes = totalSlots - targetSilences
* selectedNotes
* selectedSilences
* remainingSlots
* remainingNotesNeeded
* remainingSilencesNeeded
* currentNoteStreak
* currentSilenceStreak
* maxNoteStreak
* maxSilenceStreak

Target silence count should initially be guided by the existing DrawGrid/random weapon tune density logic. For example, if the current weapon randomiser usually creates around 4–6 silences in a 16-step pattern, use that range.

Before spawning each gate, decide whether the next gate should be note-only, silence-only, or mixed.

Hard rules:

* If currentSilenceStreak >= maxSilenceStreak, spawn a Note Gate.
* If remainingSlots == remainingNotesNeeded, spawn a Note Gate.
* If remainingSlots == remainingSilencesNeeded, spawn a Silence Gate, unless this would violate maxSilenceStreak.
* Never allow the generator to drift into a state where it must place too many forced silences in a row at the end.
* If selectedSilences is already at targetSilences, spawn only Note Gates for the remaining slots.
* If selectedNotes is already at targetNotes, spawn Silence Gates, but only if streak rules allow it. Ideally the ratio logic should prevent reaching this bad state.

Soft rules:

* If the player is behind on silences, increase the chance of Mixed Gates or Silence Gates.
* If the player is ahead on silences, use Note Gates.
* If the player is close to the target ratio, prefer Mixed Gates.
* If the player has had several notes in a row, increase the chance of allowing Damage Up.
* If the player has just taken a silence, reduce the chance of another silence unless the target ratio urgently requires it.

Suggested decision model:

For each upcoming gate, evaluate possible outcomes:

Option A: next slot becomes a note.
Option B: next slot becomes a silence.

Reject any option that makes it impossible to finish with the desired note/silence count and max streak rules.

If only note is valid:

* Spawn Note Gate.

If only silence is valid:

* Spawn Silence Gate.

If both are valid:

* Spawn Mixed Gate, but adjust the number of Damage Up sections based on ratio pressure.

Example mixed gate tuning:

* Need more notes: 5 note sections, 1 Damage Up section.
* Balanced: 4 note sections, 1 Damage Up section.
* Need more silences: 3 note sections, 2 Damage Up sections.
* Silence urgent but not forced: 2 note sections, 3 Damage Up sections.

The important design principle is:
The player should feel like they are choosing, but the generator should quietly protect the final weapon loop from becoming musically ugly.

Debug output:
Log each gate decision clearly:

* gateIndex
* toyIndex
* slotIndex
* gateType
* availableSections
* selectedSection
* storedResult
* selectedNotes
* selectedSilences
* currentNoteStreak
* currentSilenceStreak
* reason for gate type

Example reasons:

* "balanced: mixed gate"
* "silence streak maxed: force note"
* "too few silences: silence pressure"
* "target silences reached: force note"
* "remaining slots require silence"
