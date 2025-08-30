/* Advanced per-cube UI: ALT+Click a cube in Advanced to edit note/active */
export function installAdvancedCubeUI(panel, canvas, {
  isAdvanced, toWorld, getBlocks, noteList, onChange, hitTest
}){
  // Header-mounted compact editor
  const wrap = document.createElement('div');
  wrap.className = 'bouncer-adv-editor';
  Object.assign(wrap.style, { display:'none', alignItems:'center', gap:'6px' });

  const lab = document.createElement('span'); lab.textContent = 'Cube:'; lab.style.fontSize='12px'; lab.style.opacity='0.8';
  const sel = document.createElement('select'); sel.style.fontSize='12px';
  noteList.forEach(n=>{ const o=document.createElement('option'); o.value=n; o.textContent=n; sel.appendChild(o); });
  const chk = document.createElement('label'); chk.style.fontSize='12px'; chk.style.opacity='0.8';
  const cb = document.createElement('input'); cb.type='checkbox'; cb.style.marginRight='4px'; chk.append(cb, document.createTextNode('Active'));
  const closeBtn = document.createElement('button'); closeBtn.textContent='✕'; Object.assign(closeBtn.style,{fontSize:'12px', padding:'2px 6px'});

  wrap.append(lab, sel, chk, closeBtn);

  function mount(){
    const header = panel.querySelector('.toy-controls-right') || panel.querySelector('.toy-header') || panel;
    if (header && !wrap.parentNode){ header.appendChild(wrap); }
  }
  mount();

  let editIdx = -1;

  function show(i){
    const bs = getBlocks();
    editIdx = (i|0);
    if (editIdx<0 || editIdx>=bs.length){ hide(); return; }
    const b = bs[editIdx];
    sel.value = String(b.note);
    cb.checked = !!b.active;
    wrap.style.display='flex';
  }
  function hide(){ wrap.style.display='none'; editIdx = -1; }

  // React to changes
  sel.addEventListener('change', ()=>{
    const bs = getBlocks(); if (editIdx<0 || editIdx>=bs.length) return;
    bs[editIdx].note = sel.value;
    onChange?.();
  });
  cb.addEventListener('change', ()=>{
    const bs = getBlocks(); if (editIdx<0 || editIdx>=bs.length) return;
    bs[editIdx].active = !!cb.checked;
    onChange?.();
  });
  closeBtn.addEventListener('click', hide);

  // ALT+click to open editor on a cube (Advanced only)
  canvas.addEventListener('pointerdown', (e)=>{
    if (!isAdvanced() || !e.altKey) return;
    const r = canvas.getBoundingClientRect();
    const sx = (e.clientX - r.left), sy = (e.clientY - r.top);
    const pw = toWorld({ x: sx, y: sy });
    const idx = hitTest(pw.x, pw.y);
    if (idx>=0){
      e.preventDefault(); e.stopPropagation();
      show(idx);
    }
  }, { capture:true });

  // Update visibility when Advanced toggles
  const obs = new MutationObserver(()=>{ if (!isAdvanced()) hide(); });
  try{ obs.observe(panel, { attributes:true, attributeFilter:['class'] }); }catch{}

  return { show, hide };
}
