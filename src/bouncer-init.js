// src/bouncer-init.js — mounts bouncer toys onto panels with data-toy="bouncer"
import { createBouncer } from './bouncer.main.js';

function bootBouncers(){
  document.querySelectorAll('.toy-panel[data-toy="bouncer"]').forEach((panel)=>{
    try{ createBouncer(panel); }catch(e){ console.warn('[bouncer-init] failed', panel?.id, e); }
  });
}

if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', bootBouncers);
else bootBouncers();
