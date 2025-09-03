// src/bouncer-init.js — mounts bouncer toys onto panels with data-toy="bouncer"
import { createBouncer } from './bouncer.main.js';
import { initToyUI } from './toyui.js';

function bootBouncers(){
  document.querySelectorAll('.toy-panel[data-toy="bouncer"]').forEach((panel)=>{
    // Prevent double-initialization
    if (panel.__toyInstance) return;
    try{
      // Ensure the standard UI (header, body, footer) is created.
      initToyUI(panel, { toyName: 'Bouncer' });
      // Now create the toy's specific logic.
      panel.__toyInstance = createBouncer(panel);
    }catch(e){ console.warn('[bouncer-init] failed', panel?.id, e); }
  });
}

if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', bootBouncers);
else bootBouncers();

// Also listen for dynamically added toys
try {
  const board = document.getElementById('board') || document.body;
  new MutationObserver(() => bootBouncers()).observe(board, { childList: true, subtree: true });
} catch (e) {
  console.warn('[bouncer-init] MutationObserver failed.', e);
}
