// src/rippler-init.js
// Finds and initializes all Rippler toys on the page.

import { createRippleSynth } from './ripplesynth.js';

function bootRipplers() {
  const panels = document.querySelectorAll('.toy-panel[data-toy="rippler"]');
  panels.forEach(panel => {
    // Prevent double-initialization
    if (panel.__toyInstance) return;
    try {
      panel.__toyInstance = createRippleSynth(panel);
    } catch (e) {
      console.warn('[rippler-init] Failed to create rippler toy.', { panel, error: e });
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootRipplers, { once: true });
} else {
  bootRipplers();
}

// Also listen for dynamically added toys
try {
  const board = document.getElementById('board') || document.body;
  new MutationObserver(() => bootRipplers()).observe(board, { childList: true, subtree: true });
} catch (e) {
  console.warn('[rippler-init] MutationObserver failed.', e);
}