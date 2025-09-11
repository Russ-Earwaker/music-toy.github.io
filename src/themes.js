// src/themes.js
// Theme registry mapping toys -> logical instrument ids (kept <300 lines).

export const THEMES = {
  // Music theme from earlier
  djembe_kalimba: {
    name: "Djembe & Kalimba",
    grids: ["djembe_bass", "djembe_tone", "djembe_slap", "Bass Tone 4"],
    wheel: ["acoustic_guitar"],
    bouncer: ["xylophone"],
    rippler: ["kalimba"],
  },

  default: {
    name: "Default (Classic)",
    grids: ["djembe_bass", "djembe_tone", "djembe_slap", "Bass Tone 4"],
    wheel: ["acoustic_guitar"],
    bouncer: ["xylophone"],
    rippler: ["kalimba"],
  },

  // Testing theme: force everything to 'tone'
  test: {
    name: "Test (Tones only)",
    grids: ["retro-saw", "retro-square", "alien", "tone"],
    wheel: ["organ"],
    bouncer: ["tone"],
    rippler: ["tone"],
  },
};
