// src/zoom-overlay.js — Advanced overlay with strong close handling
let overlayEl=null, frameEl=null, activePanel=null, restoreSnap=null;
window.__overlayOpen = false;

const VIEW_FRAC=0.96;
function ensureOverlay(){
  if (overlayEl) return overlayEl;
  overlayEl = document.createElement('div'); overlayEl.id='zoom-overlay';
  overlayEl.style.cssText='position:fixed;inset:0;display:none;z-index:9999;';
  const back = document.createElement('div'); back.id='zoom-backdrop';
  back.style.cssText='position:absolute;inset:0;background:rgba(0,0,0,.55)';
  frameEl = document.createElement('div'); frameEl.id='zoom-frame';
  frameEl.style.cssText='position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:grid;place-items:center;max-width:96vw;max-height:96vh;padding:12px';
  overlayEl.append(back, frameEl); document.body.appendChild(overlayEl);
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

  const ph = document.createComment('adv-placeholder'); panel.__advPlaceholder = ph;
  panel.__advParent = panel.parentNode; panel.__advNext = panel.nextSibling;
  if (panel.parentNode) panel.parentNode.insertBefore(ph, panel);

  restoreSnap = _snap(panel);
  const bodySnap = _snap(body); panel.__bodySnap = bodySnap;

  activePanel = panel;
  panel.style.position='relative'; panel.style.left='0px'; panel.style.top='0px'; panel.style.transform='none';
  try{ body.style.setProperty('width', targetW+'px', 'important'); body.style.setProperty('height', targetH+'px', 'important'); }catch(e){ body.style.width = targetW+'px'; body.style.height = targetH+'px'; }
  try{ panel.style.setProperty('width', targetW+'px', 'important'); panel.style.setProperty('height', targetH+'px', 'important'); }catch(e){}

  frameEl.innerHTML=''; frameEl.appendChild(panel);
  overlayEl.style.display='block'; window.__overlayOpen=true;
  panel.classList.add('toy-zoomed');

  const advBtn = panel.querySelector('[data-adv]') || panel.querySelector('[data-adv-close]');
  if (advBtn){
    advBtn.textContent='Close';
    advBtn.setAttribute('data-adv-close','1');
    advBtn.removeAttribute('data-adv');
    const closeFn = (e)=>{ e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation && e.stopImmediatePropagation(); zoomOutPanel(panel); };
    advBtn.addEventListener('pointerdown', closeFn, { capture:true });
    advBtn.addEventListener('click',       closeFn, { capture:true });
  }

  const sel = panel.querySelector('.toy-instrument');
  if (sel){ sel.style.display='inline-block'; sel.style.visibility='visible'; }
}

export function zoomOutPanel(panel){
  if (!overlayEl || !activePanel) return;
  const p = panel || activePanel;
  const body = p.querySelector('.toy-body') || p;

  const shield = document.createElement('div');
  shield.style.cssText='position:fixed;inset:0;z-index:10000;background:transparent';
  document.body.appendChild(shield);
  setTimeout(()=>{ try{ shield.remove(); }catch{} }, 350);
  try{ document.dispatchEvent(new CustomEvent('adv:prevent', { detail:{ ms: 800 } })); }catch{}

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
    advBtn.removeAttribute('data-adv-close');
    setTimeout(()=>{ try{ advBtn.setAttribute('data-adv','1'); }catch{} }, 850);
  }

  overlayEl.style.display='none'; window.__overlayOpen=false;
  p.classList.remove('toy-zoomed');

  const sel = p.querySelector('.toy-instrument');
  if (sel){ sel.style.display='none'; sel.style.visibility='hidden'; }

  activePanel=null;
}
