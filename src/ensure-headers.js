// src/ensure-headers.js — ensure header/body/footer structure and volume card
(function(){
  if (window.__ensureHeaders) return; window.__ensureHeaders=true;

  function mkBtn(txt, attr){
    const b=document.createElement('button'); b.className='toy-btn'; b.textContent=txt; if (attr) b.setAttribute(attr,'1'); return b;
  }
  function ensure(panel){
    if (!panel || panel.__hdrEnsured) return;
    // Header
    let header = panel.querySelector('.toy-header');
    if (!header){
      header = document.createElement('div'); header.className='toy-header';
      const left = document.createElement('div'); left.className='toy-title'; left.textContent = panel.id || (panel.dataset.toy||'Toy');
      const right = document.createElement('div'); right.className='toy-controls-right';
      right.append(mkBtn('Advanced','data-adv'), mkBtn('Random','data-random'), mkBtn('Clear','data-clear'));
      header.append(left,right);
      panel.prepend(header);
    }
    // Body
    let body = panel.querySelector('.toy-body');
    if (!body){ body = document.createElement('div'); body.className='toy-body'; panel.appendChild(body); }

    // Footer + volume card
    let footer = panel.querySelector('.toy-footer');
    if (!footer){
      footer = document.createElement('div'); footer.className='toy-footer';
      panel.appendChild(footer);
    }
    // Move footer to be after body (never inside body)
    if (footer.parentElement !== panel) panel.appendChild(footer);
    if (body.nextElementSibling !== footer) panel.insertBefore(footer, body.nextSibling);

    let vol = footer.querySelector('.toy-volwrap');
    if (!vol){
      vol = document.createElement('div'); vol.className='toy-volwrap';
      const mute = document.createElement('button'); mute.className='toy-btn'; mute.textContent='🔇'; mute.setAttribute('data-mute','1');
      const range = document.createElement('input'); range.type='range'; range.min=0; range.max=100; range.value=100;
      vol.append(mute, range);
      footer.appendChild(vol);
    }

    panel.__hdrEnsured = true;
  }

  function scan(){ document.querySelectorAll('.toy-panel').forEach(ensure); }
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', scan); else scan();
  // Re-scan lightly for dynamic toys
  setInterval(scan, 1000);
})();