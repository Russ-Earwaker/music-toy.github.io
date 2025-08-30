// Extracted speed control UI from bouncer.main.js (behavior-preserving)
export function initSpeedUI(panel, initial=0.60){
  let speedFactor = initial;

        // Speed control dock (appears only in zoom), placed under the canvas so it never overlaps play space
  const hostForDock = panel.querySelector('.toy-body') || panel;
  const spDock = document.createElement('div');
  Object.assign(spDock.style, {
    display: 'none', width: '100%%', marginTop: '8px',
    display: 'none', justifyContent: 'flex-end', alignItems: 'center', gap: '8px',
    pointerEvents: 'auto'
  });
  const spLabel = document.createElement('span'); spLabel.textContent='Speed'; spLabel.style.fontSize='12px'; spLabel.style.opacity='0.8';
  const spVal = document.createElement('span'); spVal.style.fontSize='12px'; spVal.style.opacity='0.7';
  const sp = document.createElement('input'); sp.type='range'; sp.min='0.2'; sp.max='1.6'; sp.step='0.05'; sp.value=String(speedFactor); sp.style.width='140px';
  ;['pointerdown','pointermove','pointerup','click','mousedown','mouseup'].forEach(t=> sp.addEventListener(t, ev=> ev.stopPropagation()));
  spVal.textContent = `${Math.round(speedFactor*100)}%%`;
  sp.addEventListener('input', ()=>{ speedFactor = Math.max(0.2, Math.min(1.6, parseFloat(sp.value)||1)); spVal.textContent = `${Math.round(speedFactor*100)}%%`; panel.dataset.speed = String(speedFactor); });
  spDock.append(spLabel, sp, spVal);
  try { hostForDock.appendChild(spDock); } catch {}
  const updateSpeedVisibility = ()=>{ const zoomed = (sizing?.scale||1) > 1.01; spDock.style.display = zoomed ? 'flex' : 'none'; };
  // Update on zoom, both immediately and in next frame to absorb scale updates
  panel.addEventListener('toy-zoom', (ev)=>{ try{ sizing.setZoom(ev?.detail?.zoomed); }catch{} });
  // Initialize once
  updateSpeedVisibility();
  return {
    get value(){ return speedFactor; },
    set value(v){
      speedFactor = Math.max(0.2, Math.min(1.6, Number(v)||1));
      sp.value = String(speedFactor);
      spVal.textContent = `${Math.round(speedFactor*100)}%`;
      panel.dataset.speed = String(speedFactor);
    },
    update: updateSpeedVisibility,
    dock: spDock
  };
}
