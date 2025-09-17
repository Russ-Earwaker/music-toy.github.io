// src/bouncer-init.js — mounts bouncer toys onto panels with data-toy="bouncer"
import { createBouncer } from './bouncer.main.js';
import { initToyUI } from './toyui.js';

export function initializeBouncer(panel) {
    // Prevent double-initialization
    if (panel.__toyInstance) return;
    try{
      // Ensure the standard UI (header, body, footer) is created.
      initToyUI(panel, { toyName: 'Bouncer', defaultInstrument: 'pluck' });
      // Now create the toy's specific logic.
      panel.__toyInstance = createBouncer(panel);
    }catch(e){ console.warn('[bouncer-init] failed', panel?.id, e); }
}

function bootBouncers(){
  document.querySelectorAll('.toy-panel[data-toy="bouncer"]').forEach(initializeBouncer);
}

if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', bootBouncers);
else bootBouncers();
