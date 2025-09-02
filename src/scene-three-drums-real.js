// src/scene-three-drums-real.js
// Builds three real LoopGrid panels using your project modules and our stable layout.
// Keeps file <300 lines.

import { buildGrid } from './grid-core.js';

function makePanel(id, title){
  const panel = document.getElementById(id);
  // Build grid (auto-creates header/body/footer via toyui + toyui-safe)
  buildGrid('#'+id, 8, { defaultInstrument:'Punch', title });

  // Ensure body/footer exist and aspect ratio holds in Standard
  let body = panel.querySelector('.toy-body');
  if (!body){
    body = document.createElement('div'); body.className='toy-body'; panel.appendChild(body);
  }
  // footer/volwrap
  let footer = panel.querySelector('.toy-footer'); if (!footer){ footer=document.createElement('div'); footer.className='toy-footer'; panel.appendChild(footer); }
  let vol = panel.querySelector('.toy-volwrap'); if (!vol){ vol=document.createElement('div'); vol.className='toy-volwrap'; footer.appendChild(vol); }
  // Square body in Standard (Advanced will set explicit px via your overlay)
  if (!panel.classList.contains('toy-zoomed')) body.style.aspectRatio = '1 / 1';

  // Prevent canvas contributing to layout height
  const cvs = body.querySelector('canvas'); if (cvs){ Object.assign(cvs.style, { position:'absolute', inset:'0', width:'100%', height:'100%', display:'block', margin:'0' }); }
}

makePanel('real-grid-1', 'Drum Grid A');
makePanel('real-grid-2', 'Drum Grid B');
makePanel('real-grid-3', 'Drum Grid C');

// Optional: small log so we know this demo booted
if (localStorage.getItem('mt_debug')==='1'){ console.info('[scene3-real] boot complete'); }
