Implement production Hero integration + Hero-led peak density.

Use the previous audit as the basis.

Goal: high-intensity sections should feel more active through one clearly foregrounded musical subject, not by making all lanes denser at once.

Implement:

Add a persisted production heroLaneId, derived from lane focus.
Hero must be exactly one of:
foundation_lane
primary_loop_lane
secondary_loop_lane
Prefer a forced authored lane where appropriate; otherwise use the first eligible Primary lane from lane focus.
Hold the Hero for the existing phrase duration. Do not rotate every bar.
Feed production Hero state into the existing Hero mix overlay:
Hero = 1.25
focused non-Hero main lanes = 1.0
unfocused main lanes = 0.75
Keep the global debug Hero override working and let it override production selection.

Then change peak-density behaviour by role:

Hero lane: keep current peak pattern/density/embellishment behaviour.
Support lanes: use their current build/medium pattern density and cap to one carrier.
Background lanes: use sparse/low/anchor behaviour, prohibit supplemental riffs, and cap them to one quiet event per bar/phrase.
Sparkle/answer ornaments: only admit when the Hero lane has a rest on that subdivision; do not layer ornaments over an already active Hero event.

Important:

Do not modify player weapon scheduling, pattern, volume, or PLAYER_WEAPON_SOUND_MIX_MULT.
Do not change enemy visuals or enemy spawn bias yet.
Do not redesign lane focus itself beyond what is necessary to expose/persist one Hero.
Preserve current behaviour outside production onboarding where possible.
Narrow or remove the peak-time primary_loop_lane audioGain >= 0.82 restoration when the primary loop is not Hero, so it cannot erase Support/Background hierarchy.

Add focused tests only. Do not run broad browser regressions unless required.

Report:

files changed
Hero selection rules
exact peak density differences for Hero / Support / Background
what changed to the 0.82 primary-loop peak floor
any remaining gain rule that can still override Hero hierarchy