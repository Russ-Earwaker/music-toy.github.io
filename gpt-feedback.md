> ## Beat Swarm – Music System Direction
>
> The core philosophy should be:
>
> **The player creates the composition. Enemies provide the arrangement.**
>
> ### Player-authored core
>
> The player's permanent musical lanes should remain clearly tied to gameplay interactions:
>
> * **Weapon riff** – generated in the corridor. This is a fixed, looping gameplay pulse and part of the game's musical identity. **It must never be altered, rewritten or embellished in a way that changes the actual weapon sounds/timing**, because it communicates weapon behaviour to the player.
> * **Rocket pickup** – creates the **foundation/kick rhythm**. This is percussion, not a melodic bass line. Rename/reconceptualise existing "bass" terminology where appropriate to avoid treating it as tonal bass.
> * **Bumpers** – create the **accent percussion rhythm**, providing syncopation and rhythmic character.
> * **Ball pickup** – creates the main **lead/melodic phrase**.
> * **Sparkle** – occasional high-register ornament/colour rather than a fundamental part of the composition.
>
> These persistent player-created elements form the recognisable underlying piece. The system should preserve their identity rather than progressively replacing them with procedurally generated material.
>
> ### Enemy formations = temporary arrangement
>
> Enemy formations should not normally introduce arbitrary independent musical ideas. Instead, each formation should have a clear **musical role relative to the player's existing composition**.
>
> Useful formation roles include:
>
> * **Bass support** – temporary tonal/synth bass underneath the player composition.
> * **Harmony** – chords, pads or arpeggios establishing/supporting harmony.
> * **Countermelody** – a secondary melodic phrase derived from or compatible with the player's lead.
> * **Rhythmic reinforcement** – hats, toms, claps, additional percussion etc.
> * **Call/response** – explicitly responds to recent player-created melodic/rhythmic material.
> * **Ornament/fill** – flourishes, fills, risers and other short-lived embellishment.
>
> Formation generation should therefore ask:
>
> **"What musical role would complement the current player composition?"**
>
> rather than:
>
> **"What new notes can this enemy play?"**
>
> Formations remain temporary. As they enter, the player's skeletal composition becomes more fully arranged. Destroying them removes those arrangement layers and exposes the player's composition again.
>
> This should create a deliberate musical/gameplay relationship: **combat literally builds an arrangement around the player's music, and the player shoots that arrangement apart.**
>
> ### Intensity system
>
> Musical intensity should not primarily mean **adding more notes to existing lanes**.
>
> Instead, intensity should increasingly create **relationships between the existing musical elements**.
>
> A rough progression:
>
> **Low**
>
> * Exposed weapon riff.
> * Player kick/foundation.
> * Accent percussion.
> * Simple player lead.
> * Few/no supporting enemy voices.
>
> **Medium**
>
> * Lead can begin interacting with gaps around the weapon rhythm.
> * Percussion reinforces useful beats.
> * Limited supporting arrangement appears.
>
> **Build**
>
> * Harmony and/or tonal bass support can appear.
> * Lead can receive controlled variations while retaining its recognisable motif.
> * Sparkle/ornament can emphasise phrase boundaries.
> * Call/response becomes more active.
>
> **Peak**
>
> * Player composition remains clearly recognisable underneath.
> * Strong bass/harmonic support.
> * Countermelody/call-response.
> * Denser percussion.
> * Wider register and stronger ornamentation.
> * Maximum musical relationship between player lanes and temporary enemy arrangement.
>
> **Release**
>
> * Supporting arrangement falls away.
> * Lead may echo/simplify.
> * Harmony/bass/countermelody disappear.
> * Player weapon and player-authored rhythms become exposed again.
> * Return toward the recognisable core composition.
>
> ### Important constraint
>
> **Do not change the actual weapon riff to create intensity.**
>
> Other instruments may reinforce, harmonise, echo, answer or fill spaces around it, but the weapon's actual `pew pew pew` timing/sound pattern must remain unchanged for gameplay readability.
>
> ### Tonal bass
>
> Do **not** turn the rocket-generated kick/foundation rhythm into a bass guitar/synth-bass line. Its gameplay-authored percussion identity should remain intact.
>
> If the composition benefits from tonal low-end movement, introduce **bass support as a temporary arrangement role**, most naturally through enemy formations or other intensity-controlled supporting voices.
>
> ### Procedural composition principle
>
> Prefer **derivation over randomness**.
>
> When generating supporting material, derive it where possible from:
>
> * player lead motif;
> * player rhythms;
> * current harmonic centre;
> * gaps in the weapon riff;
> * existing phrase contour;
> * current intensity/section.
>
> Generated material should reinforce, answer, harmonise or contrast existing material rather than simply select additional safe notes from the scale.
>
> The existing scale/pitch restrictions remain useful as safety rails, but **"all these notes are compatible" is not enough to make them sound intentionally composed.**
>
> ### Overall target
>
> The desired experience is:
>
> **Player creates a small musical identity → gameplay builds a song around it → enemy formations temporarily turn it into a fuller arrangement → intensity increases the sophistication and interaction of that arrangement → destroying enemies strips the arrangement back toward the player's original music.**
>
> Preserve the existing architecture where it supports this. This is intended as a refinement of the current system, **not a rewrite**.
>
> When assessing or modifying the current implementation, prioritise making these relationships musically clear over adding additional procedural complexity.

