// src/zoom-overlay.js — Advanced overlay (<=300 lines)
let overlayEl=null, frameEl=null, activePanel=null, restoreSnap=null; let __overlayOpen=false; let __advPreventUntil=0; let __advLastCloseTS=0; let __advClosing=false;

const VIEW_FRAC=0.96;
function ensureOverlay(){
  if (overlayEl) return overlayEl;
  overlayEl = document.createElement('div'); overlayEl.id='zoom-overlay';
  overlayEl.style.cssText='position:fixed;inset:0;display:none;z-index:9999;';
  const back = document.createElement('div'); back.id='zoom-backdrop';
  back.style.cssText='position:absolute;inset:0;background:rgba(0,0,0,.55)';
  frameEl = document.createElement('div'); frameEl.id='zoom-frame';
  frameEl.style.cssText='position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:grid;place-items:center;max-width:96vw;max-height:96vh;padding:12px';
  const xbtn = document.createElement('button'); xbtn.id='zoom-close-btn'; xbtn.textContent='×'; xbtn.setAttribute('aria-label','Close'); xbtn.style.cssText='position:absolute;right:16px;top:12px;font-size:20px;line-height:20px;width:28px;height:28px;border-radius:6px;background:rgba(0,0,0,.5);color:white;border:1px solid rgba(255,255,255,.2);z-index:10000;cursor:pointer;';
  xbtn.addEventListener('click', ()=> zoomOutPanel(activePanel));
  overlayEl.append(back, frameEl, xbtn); document.body.appendChild(overlayEl);
  back.addEventListener('click', ()=> zoomOutPanel(activePanel));
  addEventListener('keydown', (e)=>{ if (overlayEl.style.display!=='none' && e.key==='Escape') zoomOutPanel(activePanel); }, { passive:true });
  return overlayEl;
}
function _snap(el){ return el? (el.getAttribute('style')||'') : ''; }
function _rest(el, s){ if (!el) return; if (s==null) el.removeAttribute('style'); else el.setAttribute('style', s); }

export function zoomInPanel(panel){
  ensureOverlay();
  if (!panel || activePanel===panel) return;
  const body = panel.querySelector('.toy-body') || panel;
  const rect = body.getBoundingClientRect();
  const vw = Math.max(document.documentElement.clientWidth, window.innerWidth||0);
  const vh = Math.max(document.documentElement.clientHeight, window.innerHeight||0);
  const base = Math.min(rect.width, rect.height);
  const target = Math.min(Math.round(base*2), Math.floor(Math.min(vw,vh)*VIEW_FRAC));
  const targetW = target, targetH = target;

  // remember place
  const ph = document.createComment('adv-placeholder');
  panel.__advPlaceholder = ph;
  panel.__advParent = panel.parentNode;
  panel.__advNext = panel.nextSibling;
  if (panel.parentNode) panel.parentNode.insertBefore(ph, panel);

  restoreSnap = _snap(panel);
  const bodySnap = _snap(body);
  panel.__bodySnap = bodySnap;

  activePanel = panel;
  panel.style.position='relative'; panel.style.left='0px'; panel.style.top='0px'; panel.style.transform='none';
  try{ body.style.setProperty('width', targetW+'px', 'important'); body.style.setProperty('height', targetH+'px', 'important'); }catch(e){ body.style.width = targetW+'px'; body.style.height = targetH+'px'; }
  try{ panel.style.setProperty('width', targetW+'px', 'important'); panel.style.setProperty('height', targetH+'px', 'important'); }catch(e){}

  frameEl.innerHTML=''; frameEl.appendChild(panel);
  overlayEl.style.display='block'; __overlayOpen = true; __advClosing=false;
  panel.classList.add('toy-zoomed');

  const advBtn = panel.querySelector('[data-adv]') || panel.querySelector('[data-adv-close]');
  if (advBtn){
    advBtn.textContent='Close';
    advBtn.setAttribute('data-adv-close','1');
    advBtn.removeAttribute('data-adv');
    advBtn.addEventListener('pointerdown', (e)=>{ e.preventDefault(); e.stopPropagation(); zoomOutPanel(panel); }, {capture:true});
    advBtn.addEventListener('click', (e)=>{ e.preventDefault(); e.stopPropagation(); zoomOutPanel(panel); }, {capture:true});
  }

  const sel = panel.querySelector('.toy-instrument');
  if (sel){ sel.style.display='inline-block'; sel.style.visibility='visible'; }
}

export function zoomOutPanel(panel){ __advClosing=true; __advPreventUntil = Date.now() + 1000;
  if (!overlayEl || !activePanel) return;
  const p = panel || activePanel;
  const body = p.querySelector('.toy-body') || p;

  _rest(p, restoreSnap); restoreSnap=null;
  _rest(body, p.__bodySnap); delete p.__bodySnap;

  const par = p.__advParent, next = p.__advNext, ph = p.__advPlaceholder;
  if (par && next && next.parentNode===par) par.insertBefore(p, next);
  else if (par) par.appendChild(p);
  if (ph && ph.parentNode) ph.parentNode.removeChild(ph);
  delete p.__advParent; delete p.__advNext; delete p.__advPlaceholder;

  const advBtn = p.querySelector('[data-adv-close]') || p.querySelector('.toy-btn-adv');
  if (advBtn){
    advBtn.textContent='Advanced';
    advBtn.removeAttribute('data-adv-close'); advBtn.setAttribute('data-adv','1');
  }

  overlayEl.style.display='none'; __overlayOpen = false;
  try{ const sel = p.querySelector('.toy-instrument'); if (sel){ sel.style.display='none'; sel.style.visibility='hidden'; } }catch{}
  p.classList.remove('toy-zoomed');
  activePanel=null; setTimeout(()=>{ __advClosing=false; }, 160);
}

// Global delegate for any [data-adv]
if (!window.__advGlobal){
  window.__advGlobal = true;
  document.addEventListener('click', (e)=>{ if (__overlayOpen || __advClosing || Date.now() < __advPreventUntil) return; if (__advClosing || (Date.now() - __advLastCloseTS < 200)) return;
    const b = e.target.closest('[data-adv]'); if (!b) return;
    const p = b.closest('.toy-panel'); if (!p) return;
    e.preventDefault(); e.stopPropagation();
    try{ zoomInPanel(p); }catch(e2){}
  }, true);
}
