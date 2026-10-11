# Logic creation disclosure — phase 3

1. **Basic:** the Logic / Structure dock shows a STRUCTURE heading, Sequence, Together, Repeat, and Advanced >. The connection insertion menu offers the same four choices. Its existing Disconnect action remains available.
2. **Advanced:** a separate ADVANCED LOGIC popup groups Timeline under STRUCTURE, and Chord Progression / Transpose under MUSICAL. The dock additionally retains its existing independent Heartbeat creation under TRANSPORT, labelled Independent Heartbeat. This preserves secondary transport creation without exposing a duplicate primary Heartbeat or adding a fourth Basic structure. Heartbeat is not a midpoint insertion type.
3. **Shared configuration:** `src/logic-creation-menu.js` owns Basic types, Advanced groups, established labels/descriptions and the shared popup. The dock and midpoint route delegate choices to their existing standalone factory and connection-promotion APIs. Existing structure type editing continues to offer normal conversion controls, including Timeline's lossy-conversion confirmation.
4. **Interaction:** one Advanced action opens the separate popup. Close, Escape and outside pointer/touch dismiss it. Escape/Close return focus to the dock Logic button or originating midpoint. The popup wraps Tab focus through its controls, uses 44px buttons, and stays within the viewport. Choosing an item closes it and uses the existing creation/insertion path. Presentation code does not touch transport. Normal Basic choices still create directly.
5. **Compatibility:** no runtime, topology, node schema or persistence behavior changed. Explicit Sequence promotion still creates a visible Sequence structure. Existing Timeline, Chord Progression and Transpose objects continue to load, select, edit and delete. Musical node accessible names now use their established names rather than the implementation term modifier. Existing node controls do not acquire an Advanced gate.
6. **Tests:** 127 targeted tests passed across menu configuration, actual connection-view handlers, structure creation/conversion, Timeline, explicit Sequence, Repeat, Chord Progression and Transpose; the existing structure trash lifecycle test also passed (128 total). New coverage exercises actual midpoint Advanced choices, Escape/outside dismissal without graph changes, focus return, insertion of all three Advanced types, and shared configuration use. Syntax and whitespace checks passed.

## Browser validation

- Actual Logic dock: only Sequence / Together / Repeat / Advanced > in Basic.
- Advanced opens a separate labelled dialog with Structure and Musical groups.
- Escape returns focus to Logic / Structure; outside click removes the popup.
- Open/close and outside click left a running transport running.
- Created Timeline through the dock Advanced route; inserted Transpose through the midpoint Advanced route. The midpoint Basic/Advanced hierarchy matches the dock's structure and musical choices.
- Transpose's existing semitone controls remained available immediately after insertion. Raising it to +1 persisted; reload restored Timeline, Chord Progression and Transpose, and selecting Transpose exposed +1 and its normal editing controls.
- Saved observations contain 417 scheduling events plus the scene with the created Timeline and inserted +1 Transpose: [harmony-graph-2026-10-11T09-52-29-427Z.json](debug-output/harmony-graph-2026-10-11T09-52-29-427Z.json).

Files changed for this phase: `src/logic-creation-menu.js`, `src/main.js`, `src/toy-spawner.js`, `src/connection-view.js`, `style.css`, `tests/logic-creation-menu.test.mjs`, and `tests/connection-view.test.mjs`.

No deployment was performed.
