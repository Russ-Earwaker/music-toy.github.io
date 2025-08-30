// src/bouncer-adv-ui.js
// Advanced-mode micro editor (ALT+click a cube).
// Interactions are in bouncer-interactions.js; rescale helpers in bouncer-scale.js.

// Keep this file lean (<300 lines). No duplicate imports.

export function installAdvancedCubeUI(panel, canvas, {
  isAdvanced, toWorld, getBlocks, noteList: notes, onChange, hitTest
}){
  // Small in-canvas editor for a selected floating cube.
  const wrap = document.createElement('div');
  wrap.className = 'bouncer-adv-editor';
  Object.assign(wrap.style, {
    display:'none', alignItems:'center', gap:'6px',
    position:'absolute', top:'6px', left:'6px', zIndex: 5,
    padding:'4px 6px', borderRadius:'8px', background:'rgba(0,0,0,0.35)',
    backdropFilter:'blur(2px)'
  });

  const lab  = document.createElement('span');
  lab.textContent = 'Cube:';
  Object.assign(lab.style, { fontSize:'12px', opacity:'0.85' });

  const sel  = document.createElement('select');
  sel.style.fontSize = '12px';
  const list = notes || [];
  list.forEach(n=>{
    const o = document.createElement('option');
    o.value = n; o.textContent = n;
    sel.appendChild(o);
  });

  const label = document.createElement('label');
  Object.assign(label.style, { fontSize:'12px', opacity:'0.9' });
  const cb = document.createElement('input'); cb.type='checkbox'; cb.style.marginRight='6px';
  label.append(cb, document.createTextNode('Active'));

  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'Close';
  Object.assign(closeBtn.style, { fontSize:'12px', padding:'2px 8px', borderRadius:'6px' });

  wrap.append(lab, sel, label, closeBtn);
  panel.appendChild(wrap);

  let currentIndex = -1;

  function show(i){
    const blocks = (typeof getBlocks === 'function') ? getBlocks() : [];
    if (!blocks || !blocks[i]) return hide();
    currentIndex = i;
    const b = blocks[i];
    const name = b.noteName || list[b.noteIndex||0] || list[0] || 'C4';
    sel.value = name;
    cb.checked = (b.active !== false);
    wrap.style.display = (isAdvanced && isAdvanced()) ? 'flex' : 'none';
  }
  function hide(){
    currentIndex = -1;
    wrap.style.display='none';
  }

  sel.addEventListener('change', ()=>{
    const blocks = (typeof getBlocks === 'function') ? getBlocks() : [];
    if (currentIndex >= 0 && blocks[currentIndex]){
      blocks[currentIndex].noteName = sel.value;
      if (typeof onChange === 'function') onChange();
    }
  });
  cb.addEventListener('change', ()=>{
    const blocks = (typeof getBlocks === 'function') ? getBlocks() : [];
    if (currentIndex >= 0 && blocks[currentIndex]){
      blocks[currentIndex].active = !!cb.checked;
      if (typeof onChange === 'function') onChange();
    }
  });
  closeBtn.addEventListener('click', hide);

  // ALT+click a cube to open the editor (Advanced only)
  canvas.addEventListener('pointerdown', (e)=>{
    if (!isAdvanced || !isAdvanced()) return;
    if (!e.altKey) return;
    const r = canvas.getBoundingClientRect();
    const x = (e.clientX - r.left) * ((canvas.width||1) / Math.max(1, r.width));
    const y = (e.clientY - r.top)  * ((canvas.height||1) / Math.max(1, r.height));
    const p = toWorld({ x, y });
    const idx = typeof hitTest === 'function' ? hitTest(p.x, p.y) : -1;
    if (idx >= 0){
      e.preventDefault(); e.stopPropagation();
      show(idx);
    }
  }, { capture:true });

  // Auto-hide when Advanced mode toggles off
  const obs = new MutationObserver(()=>{
    if (!isAdvanced || !isAdvanced()) hide();
  });
  try{ obs.observe(panel, { attributes:true, attributeFilter:['class'] }); }catch{}

  return { show, hide };
}
