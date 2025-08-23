// src/grid-ui-extras.js — zoom-only UI helpers for Grid
export function attachZoomNotesButton(panel, onRandomNotes){
  let notesBtn = panel.querySelector('button[data-rand-notes]');
  const right = panel.querySelector('.toy-controls-right');
  if (!notesBtn && right){
    notesBtn = document.createElement('button');
    notesBtn.type='button';
    notesBtn.className='toy-btn';
    notesBtn.textContent='Rnd Notes';
    notesBtn.setAttribute('data-rand-notes','1');
    notesBtn.style.display='none';
    notesBtn.style.padding='6px 10px';
    notesBtn.style.border='1px solid #252b36';
    notesBtn.style.borderRadius='10px';
    notesBtn.style.background='#0d1117';
    notesBtn.style.color='#e6e8ef';
    notesBtn.style.cursor='pointer';
    notesBtn.addEventListener('click', onRandomNotes);
    right.insertBefore(notesBtn, right.firstChild);
  }
  function updateZoomButtons(){
    const zoomed = panel.classList.contains('toy-zoomed');
    if (notesBtn) notesBtn.style.display = zoomed ? '' : 'none';
  }
  panel.addEventListener('toy-zoom', updateZoomButtons);
  updateZoomButtons();
  return { notesBtn, updateZoomButtons };
}
