// main.nobouncer.js — your app without auto-booting the bouncers
// Keep everything else the same as your main entry, just omit any bouncer-init boot.

import './boot-audio.js';
import './boot-theme.js';

console.log('[main.nobouncer] modules loaded. Drum grids & theme should be active.');

// If your app normally kicks a global RAF stepper or other toys, keep that logic here.
// (Intentionally minimal: the bouncers are booted via bouncer-stable-boot.js.)
