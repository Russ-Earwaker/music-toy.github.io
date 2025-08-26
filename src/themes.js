// src/themes.js
// Theme registry mapping toys -> logical instrument ids (kept <300 lines).

export const THEMES = {
  // Music theme from earlier
  djembe_kalimba: {
    grids: ["djembe_bass", "djembe_tone", "djembe_slap", "hand_clap"],
    wheel: ["acoustic_guitar"],
    bouncer: ["xylophone"],
    rippler: ["kalimba"],
  },

  // Testing theme: force everything to 'tone'
  default: {
    grids: ["tone", "tone", "tone", "tone"],
    wheel: ["tone"],
    bouncer: ["tone"],
    rippler: ["tone"],
  },
};
