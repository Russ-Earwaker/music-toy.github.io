// src/themes.js
// Theme registry mapping toys -> logical instrument ids (kept <300 lines).

export const THEMES = {
  // Music theme from earlier
  djembe_kalimba: {
    name: "Djembe & Kalimba",
    grids: ["DJEMBE BASS", "DJEMBE TONE", "DJEMBE SLAP", "BASS TONE 4"],
    wheel: ["ACOUSTIC GUITAR"],
    bouncer: ["XYLOPHONE"],
    rippler: ["KALIMBA"],
  },

  default: {
    name: "Default (Classic)",
    grids: ["DJEMBE BASS", "DJEMBE TONE", "DJEMBE SLAP", "BASS TONE 4"],
    wheel: ["ACOUSTIC GUITAR"],
    bouncer: ["XYLOPHONE"],
    rippler: ["KALIMBA"],
  },

  // Testing theme: force everything to 'tone'
  test: {
    name: "Test (Tones only)",
    grids: ["RETRO SAW", "RETRO SQUARE", "ALIEN", "TONE"],
    wheel: ["ORGAN"],
    bouncer: ["TONE"],
    rippler: ["TONE"],
  },
};
